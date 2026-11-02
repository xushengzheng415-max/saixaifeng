const cloud = require('wx-server-sdk')
const https = require('https')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV, throwOnNotFound: false })

// 微信云开发的 cloud.callAI 在腾讯云 CloudBase 环境不可用：
// 优先走云开发 Agent 网关（API Key），其次混元 OpenAI 兼容接口，最后用云函数自带的腾讯云临时凭据按 TC3 签名
const MODEL = process.env.HUNYUAN_MODEL || 'hunyuan-turbos-latest'
const API_URL = process.env.HUNYUAN_BASE_URL || 'https://api.hunyuan.cloud.tencent.com/v1/chat/completions'
const API_KEY = String(process.env.HUNYUAN_API_KEY || '').trim()
const AGENT_ENDPOINT = String(process.env.AGENT_ENDPOINT || '').trim()
const AGENT_API_KEY = String(process.env.AGENT_API_KEY || '').trim()
const TC_HOST = 'hunyuan.tencentcloudapi.com'
const TC_SERVICE = 'hunyuan'
const TC_VERSION = '2023-09-01'
const TC_REGION = process.env.HUNYUAN_REGION || process.env.TENCENTCLOUD_REGION || 'ap-guangzhou'
const MAX_HISTORY = 6
const MAX_CONTEXT_CHARS = 4800

function postJson(hostname, requestPath, headers, body, timeout = 25000) {
  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname,
      port: 443,
      path: requestPath,
      method: 'POST',
      timeout,
      headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, headers)
    }, response => {
      let raw = ''
      response.setEncoding('utf8')
      response.on('data', chunk => { raw += chunk })
      response.on('end', () => resolve({ statusCode: response.statusCode, raw }))
    })
    request.on('timeout', () => request.destroy(new Error('模型请求超时')))
    request.on('error', reject)
    request.write(body)
    request.end()
  })
}

function parseJson(raw, label) {
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(`${label}返回内容无法解析`)
  }
}

async function requestViaApiKey(messages) {
  let target
  try {
    target = new URL(API_URL)
  } catch (error) {
    throw new Error('模型接口地址无效')
  }
  const body = JSON.stringify({ model: MODEL, messages, temperature: 0.3, stream: false })
  const { statusCode, raw } = await postJson(target.hostname, `${target.pathname}${target.search}`, { Authorization: `Bearer ${API_KEY}` }, body)
  const payload = parseJson(raw, '模型')
  if (statusCode < 200 || statusCode >= 300) {
    const detail = payload && payload.error && payload.error.message ? payload.error.message : raw.slice(0, 200)
    throw new Error(`模型返回 ${statusCode}：${detail}`)
  }
  const content = text(payload && payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content)
  if (!content) throw new Error('模型没有返回内容')
  return content
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex')
}

function hmacSha256(key, value) {
  return crypto.createHmac('sha256', key).update(value, 'utf8').digest()
}

function tcAuthorization(secretId, secretKey, timestamp, body) {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${TC_HOST}\nx-tc-action:chatcompletions\n`
  const signedHeaders = 'content-type;host;x-tc-action'
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, sha256Hex(body)].join('\n')
  const scope = `${date}/${TC_SERVICE}/tc3_request`
  const stringToSign = ['TC3-HMAC-SHA256', String(timestamp), scope, sha256Hex(canonicalRequest)].join('\n')
  const signingKey = hmacSha256(hmacSha256(hmacSha256(`TC3${secretKey}`, date), TC_SERVICE), 'tc3_request')
  const signature = hmacSha256(signingKey, stringToSign).toString('hex')
  return `TC3-HMAC-SHA256 Credential=${secretId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
}

async function requestViaTencentCloud(messages) {
  const explicitId = text(process.env.HUNYUAN_SECRET_ID)
  const explicitKey = text(process.env.HUNYUAN_SECRET_KEY)
  const secretId = explicitId || text(process.env.TENCENTCLOUD_SECRETID || process.env.TENCENT_SECRET_ID)
  const secretKey = explicitKey || text(process.env.TENCENTCLOUD_SECRETKEY || process.env.TENCENT_SECRET_KEY)
  const token = explicitId && explicitKey ? '' : text(process.env.TENCENTCLOUD_SESSIONTOKEN)
  if (!secretId || !secretKey) throw new Error('未配置模型凭据：请在云函数环境变量里设置 AGENT_ENDPOINT/AGENT_API_KEY 或 HUNYUAN_API_KEY')
  const timestamp = Math.floor(Date.now() / 1000)
  const body = JSON.stringify({
    Model: MODEL,
    Messages: messages.map(item => ({ Role: item.role, Content: item.content })),
    Stream: false
  })
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    Authorization: tcAuthorization(secretId, secretKey, timestamp, body),
    Host: TC_HOST,
    'X-TC-Action': 'ChatCompletions',
    'X-TC-Version': TC_VERSION,
    'X-TC-Timestamp': String(timestamp),
    'X-TC-Region': TC_REGION
  }
  if (token) headers['X-TC-Token'] = token
  const { statusCode, raw } = await postJson(TC_HOST, '/', headers, body, 30000)
  const payload = parseJson(raw, '模型')
  const result = payload && payload.Response
  if (result && result.Error) throw new Error(`模型接口错误 ${result.Error.Code || statusCode}：${result.Error.Message || '未知错误'}`)
  if (statusCode < 200 || statusCode >= 300) throw new Error(`模型返回 ${statusCode}：${raw.slice(0, 200)}`)
  const content = text(result && result.Choices && result.Choices[0] && result.Choices[0].Message && result.Choices[0].Message.Content)
  if (!content) throw new Error('模型没有返回内容')
  return content
}

// 云开发 Agent 网关：SSE 流式返回，这里聚合正文增量后一次性返回
async function requestViaAgent(messages) {
  let target
  try {
    target = new URL(AGENT_ENDPOINT)
  } catch (error) {
    throw new Error('Agent 接口地址无效')
  }
  const isAcp = target.pathname.replace(/\/+$/, '').endsWith('/acp')
  const system = messages.filter(item => item.role === 'system').map(item => item.content).join('\n')
  const dialogue = messages.filter(item => item.role !== 'system')
  const body = isAcp
    ? JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'session/prompt',
        params: { prompt: [{ type: 'text', text: `${system}\n\n${text(dialogue.length ? dialogue[dialogue.length - 1].content : '')}` }] }
      })
    : JSON.stringify({
        threadId: `thread_${Date.now()}`,
        runId: `run_${Date.now()}`,
        messages: dialogue.map((item, index) => ({ id: `msg-${index + 1}`, role: item.role, content: item.content })),
        tools: [],
        context: [],
        state: {},
        forwardedProps: { system }
      })
  const { statusCode, raw } = await postJson(target.hostname, `${target.pathname}${target.search}`, {
    Authorization: `Bearer ${AGENT_API_KEY}`,
    Accept: 'text/event-stream',
    'Content-Type': 'application/json'
  }, body, 45000)
  if (statusCode < 200 || statusCode >= 300) throw new Error(`Agent 返回 ${statusCode}：${raw.slice(0, 200)}`)
  let content = ''
  raw.split(/\r?\n/).forEach(line => {
    const piece = line.startsWith('data:') ? line.slice(5).trim() : ''
    if (!piece || piece === '[DONE]') return
    let frame = null
    try {
      frame = JSON.parse(piece)
    } catch (error) {
      return
    }
    if (isAcp) {
      const update = frame && frame.params && frame.params.update
      if (update && update.sessionUpdate === 'agent_message_chunk') content += text(update.content && update.content.text)
    } else if (frame && frame.type === 'TEXT_MESSAGE_CONTENT') {
      content += text(frame.delta)
    }
  })
  if (!content) throw new Error(`Agent 没有返回内容：${raw.slice(0, 200)}`)
  return content
}

// 云开发大模型网关（/v1/ai/*）：OpenAI 兼容请求体，需显式传 model
async function requestViaModelGateway(messages) {
  let target
  try {
    target = new URL(AGENT_ENDPOINT)
  } catch (error) {
    throw new Error('模型网关地址无效')
  }
  const model = text(process.env.AGENT_MODEL) || MODEL
  const body = JSON.stringify({ model, messages, temperature: 0.3, stream: true })
  const { statusCode, raw } = await postJson(target.hostname, `${target.pathname}${target.search}`, {
    Authorization: `Bearer ${AGENT_API_KEY}`,
    Accept: 'text/event-stream'
  }, body, 45000)
  if (statusCode < 200 || statusCode >= 300) throw new Error(`模型网关返回 ${statusCode}：${raw.slice(0, 300)}`)
  const trimmed = raw.trim()
  if (trimmed.startsWith('{')) {
    const payload = parseJson(trimmed, '模型网关')
    if (payload.error) throw new Error(`模型网关错误：${payload.error.message || payload.error.code || '未知错误'}`)
    const content = text(payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content)
    if (!content) throw new Error(`模型网关没有返回内容：${trimmed.slice(0, 200)}`)
    return content
  }
  let content = ''
  raw.split(/\r?\n/).forEach(line => {
    const piece = line.startsWith('data:') ? line.slice(5).trim() : ''
    if (!piece || piece === '[DONE]') return
    let frame = null
    try {
      frame = JSON.parse(piece)
    } catch (error) {
      return
    }
    if (frame && frame.error) throw new Error(`模型网关错误：${frame.error.message || frame.error.code || '未知错误'}`)
    const delta = frame && frame.choices && frame.choices[0] && frame.choices[0].delta && frame.choices[0].delta.content
    if (delta) content += text(delta)
  })
  if (!content) throw new Error(`模型网关没有返回内容：${raw.slice(0, 200)}`)
  return content
}

function requestModel(messages) {
  if (AGENT_ENDPOINT && AGENT_API_KEY) {
    return /\/v1\/ai\//.test(AGENT_ENDPOINT) ? requestViaModelGateway(messages) : requestViaAgent(messages)
  }
  if (API_KEY) return requestViaApiKey(messages)
  return requestViaTencentCloud(messages)
}

const SYSTEM_PROMPT = [
  '你是「赛小蜂足球」PC 主办方端的 AI 办赛助手，服务对象是赛事主办方。',
  '你只能依据下面提供的「本赛事资料」回答，不得编造比分、名次、球队、球员或任何未提供的数据。',
  '资料不足时，直接说明缺什么、建议去哪个页面补，不要猜测。',
  '不接受与办赛无关的请求（写代码、闲聊八卦、其他赛事或球队的私有数据），礼貌拒绝并引导回办赛。',
  '涉及价格、退款、试用、优惠政策时不要报价，说明以平台确认为准。',
  '回答用简体中文，控制篇幅：一般 3 句以内，清单最多 6 条，不要使用 Markdown 表格和标题符号。'
].join('\n')

function text(value, fallback = '') {
  const result = String(value === undefined || value === null ? fallback : value).trim()
  return result
}

function num(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

async function getOne(db, collection, id) {
  const result = await db.collection(collection).doc(id).get()
  return result && result.data ? result.data : null
}

async function queryAll(db, collection, where) {
  const result = await db.collection(collection).where(where).limit(200).get()
  return (result && result.data) || []
}

function matchLabel(match) {
  const home = text(match.homeTeamName, '主队')
  const away = text(match.awayTeamName, '客队')
  const score = num(match.homeScore) !== null && num(match.awayScore) !== null ? `${num(match.homeScore)}:${num(match.awayScore)}` : '未出结果'
  const status = text(match.status, '待开始')
  const division = text(match.divisionName)
  const time = text(match.matchDate || match.date) + (text(match.startTime || match.matchTime) ? ` ${text(match.startTime || match.matchTime)}` : '')
  return `${division ? `${division}｜` : ''}${home} ${score} ${away}（${status}${time ? `｜${time.trim()}` : ''}）`
}

async function buildContext(tournamentId, orgId) {
  const db = cloud.database()
  const tournament = await getOne(db, 'tournaments', tournamentId)
  if (!tournament) return { error: '赛事不存在', code: 'TOURNAMENT_NOT_FOUND' }
  const ownerOrgId = text(tournament.orgId)
  if (!orgId || (ownerOrgId && ownerOrgId !== orgId)) return { error: '无权访问该赛事数据', code: 'ORG_FORBIDDEN' }

  const [registrations, matches] = await Promise.all([
    queryAll(db, 'tournament_teams', { tournamentId }),
    queryAll(db, 'matches', { tournamentId })
  ])

  const divisions = Array.isArray(tournament.divisions) ? tournament.divisions : []
  const divisionLines = divisions.map(item => {
    const name = text(item.name, '未命名组别')
    const mode = text(item.formatType || item.format, '赛制未填')
    const status = text(item.planStatus || item.status, '方案未确认')
    return `${name}｜${mode}｜${status}`
  })

  const teamGroups = { approved: [], pending: [] }
  registrations.forEach(item => {
    const name = text(item.teamName || item.name, '未命名球队')
    const state = text(item.status || item.reviewStatus, '')
    if (/approved|confirmed|已通过|已确认/i.test(state)) teamGroups.approved.push(name)
    else teamGroups.pending.push(`${name}${state ? `(${state})` : ''}`)
  })

  const finished = matches.filter(item => num(item.homeScore) !== null && num(item.awayScore) !== null)
  const upcoming = matches.filter(item => num(item.homeScore) === null || num(item.awayScore) === null)

  const lines = [
    `赛事名称：${text(tournament.name, '未命名赛事')}`,
    `赛事状态：${text(tournament.status, '未知')}｜时间：${text(tournament.startDate, '未定')} 至 ${text(tournament.endDate, '未定')}｜地区：${text(tournament.region || tournament.city || tournament.province, '未填')}`,
    `竞赛组别（${divisions.length}）：${divisionLines.length ? divisionLines.join('；') : '尚未创建组别'}`,
    `参赛球队（已确认 ${teamGroups.approved.length} / 待确认 ${teamGroups.pending.length}）：已确认 ${teamGroups.approved.slice(0, 20).join('、') || '无'}${teamGroups.pending.length ? `；待确认 ${teamGroups.pending.slice(0, 10).join('、')}` : ''}`,
    `比赛总数：${matches.length}｜已出比分：${finished.length}｜未出结果：${upcoming.length}`,
    finished.length ? `已出比分的比赛：\n${finished.slice(0, 40).map(matchLabel).join('\n')}` : '已出比分的比赛：无',
    upcoming.length ? `接下来未出结果的比赛：\n${upcoming.slice(0, 20).map(matchLabel).join('\n')}` : '接下来未出结果的比赛：无'
  ]
  const context = lines.join('\n')
  return { context: context.slice(0, MAX_CONTEXT_CHARS) }
}

exports.main = async (event = {}) => {
  const action = text(event.action, 'chat')
  if (action === 'ping') {
    const via = AGENT_ENDPOINT && AGENT_API_KEY ? (/\/v1\/ai\//.test(AGENT_ENDPOINT) ? 'modelGateway' : 'agent') : API_KEY ? 'apiKey' : 'tencentCloud'
    const envKeys = Object.keys(process.env).filter(key => /^(TENCENT|HUNYUAN|TC|AGENT)/i.test(key))
    try {
      const probe = await requestModel([{ role: 'user', content: '只回复两个字：可用' }])
      return { success: true, data: { content: probe, model: text(process.env.AGENT_MODEL) || MODEL, via, envKeys } }
    } catch (error) {
      return { success: false, code: 'AI_UNAVAILABLE', error: String(error && error.message || error), via, envKeys }
    }
  }
  if (action !== 'chat') return { success: false, code: 'ACTION_NOT_SUPPORTED', error: '不支持的助手操作' }

  const tournamentId = text(event.tournamentId)
  const question = text(event.question)
  if (!tournamentId) return { success: false, code: 'TOURNAMENT_REQUIRED', error: '缺少赛事标识' }
  if (!question) return { success: false, code: 'QUESTION_REQUIRED', error: '请先输入要问的内容' }
  if (question.length > 500) return { success: false, code: 'QUESTION_TOO_LONG', error: '问题请控制在 500 字以内' }

  // 只有经 webLoginApi 中转才带 __actorOrgId，未登录或无机构一律拒绝
  const actorUserId = text(event.__actorUserId)
  const actorOrgId = text(event.__actorOrgId)
  if (!actorUserId || !actorOrgId) return { success: false, code: 'AUTH_REQUIRED', error: '登录状态已失效，请重新登录' }

  let built
  try {
    built = await buildContext(tournamentId, actorOrgId)
  } catch (error) {
    console.error('[tournamentAssistant] 读取赛事数据失败:', error.message)
    return { success: false, code: 'DATA_UNAVAILABLE', error: '读取本赛事数据失败' }
  }
  if (built.error) return { success: false, code: built.code, error: built.error }

  const history = Array.isArray(event.history) ? event.history.slice(-MAX_HISTORY) : []
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: `本赛事资料：\n${built.context}` }
  ]
  history.forEach(item => {
    const role = item && item.role === 'assistant' ? 'assistant' : 'user'
    const content = text(item && item.content).slice(0, 400)
    if (content) messages.push({ role, content })
  })
  messages.push({ role: 'user', content: question })

  try {
    const content = await requestModel(messages)
    return { success: true, data: { content, model: MODEL } }
  } catch (error) {
    console.error('[tournamentAssistant] 模型调用失败:', error.message)
    return { success: false, code: 'AI_UNAVAILABLE', error: `模型服务暂时不可用：${error.message}` }
  }
}
