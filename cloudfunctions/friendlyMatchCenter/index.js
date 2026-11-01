const cloud = require('wx-server-sdk')
const https = require('https')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// ======== 配置 ========
const CONFIG = {
  bridgeUrl: process.env.SXF_FOOTBALL_WECHAT_BRIDGE_URL || '',
  bridgeSecret: process.env.SXF_FOOTBALL_WECHAT_BRIDGE_SECRET || '',
  h5BaseUrl: process.env.SERVICE_ACCOUNT_H5_URL || 'https://www.sxffootball.cn/service-account-h5/',
  inviteTemplateId: process.env.SXF_INVITE_TEMPLATE_ID || '',
  signinTemplateId: process.env.SXF_SIGNIN_TEMPLATE_ID || '',
  // AI 生文走云开发 AI+（cloudbase 网关，开发者计划免费额度），无需额外密钥
  // 模型名按顺序尝试，取控制台「生文模型」页已启用的第一个；可用环境变量 SXF_AI_MODELS 覆盖
  aiModels: (process.env.SXF_AI_MODELS || 'deepseek-v4-flash,hy3,hunyuan-lite').split(',').map(s => s.trim()).filter(Boolean),
  aiTimeoutMs: 12000,
  // 生图模型（控制台「AI→图片生成」已启用，开发者计划额度 9 万次至 2026-12-31）
  aiImageModel: process.env.SXF_AI_IMAGE_MODEL || 'HY-Image-3.0-Plus-4090-Tob-v1.0',
  aiImageSize: '720x1280'
}

const INVITES_COLLECTION = 'friendly_invites'
const RESPONSES_COLLECTION = 'friendly_match_responses'
const PLAYERS_COLLECTION = 'player_team_history'
const USERS_COLLECTION = 'users'
const MATCHES_COLLECTION = 'friendly_matches'
const SIGNUPS_COLLECTION = 'friendly_match_signups'
// 个人报名权威集合：一条记录 = 一个自然人（手机号主账号 userId）对一场邀约的有效报名
const INVITE_SIGNUPS_COLLECTION = 'friendly_invite_signups'
// 2 = 该邀约已接入个人报名，signupCount 等计数才有意义；历史邀约没有该字段，计数必须显示为待确认
const INVITE_SIGNUP_SCHEMA = 2

// ======== 工具函数 ========
function ok(data) { return { ok: true, data } }
function fail(code, message) { return { ok: false, code, message } }
function text(v) { return v == null ? '' : String(v).trim() }
function randomToken(len) {
  return crypto.randomBytes(24).toString('hex').slice(0, len || 32)
}
function businessError(code, message) {
  return Object.assign(new Error(message), { code })
}

// 事务内按文档 ID 读取：文档不存在时返回 null，其他数据库错误继续抛出
async function readTxDoc(transaction, collection, id) {
  try {
    const res = await transaction.collection(collection).doc(id).get()
    const row = res && (Array.isArray(res.data) ? res.data[0] : res.data)
    return row || null
  } catch (error) {
    const signature = String((error && (error.message || error.errMsg)) || '')
    if (/not exist|does not exist|DOCUMENT_NOT_EXIST|DOCUMENT_NOT_FOUND/i.test(signature)) return null
    throw error
  }
}

// 非事务读取：不存在或读取失败都返回 null，调用方按业务语义转成错误码
async function readDoc(collection, id) {
  const docId = text(id)
  if (!docId) return null
  try {
    const res = await db.collection(collection).doc(docId).get()
    return (res && res.data) || null
  } catch (error) {
    return null
  }
}

// 同一个自然人（userId）在同一邀约下只有一条报名记录：
// 确定性 _id 让重复提交、并发提交都命中同一文档，不会产生第二条报名。
function inviteSignupDocId(inviteId, userId) {
  return 'FS' + crypto.createHash('sha256').update(text(inviteId) + ':' + text(userId)).digest('hex').slice(0, 40)
}

function matchSignupDocId(matchId, userPhone) {
  return 'FM' + crypto.createHash('sha256').update(text(matchId) + ':' + text(userPhone)).digest('hex').slice(0, 40)
}

// 上海时区日期键（YYYY-MM-DD）。云端默认 UTC，直接 new Date() 取日期会与比赛日错开 8 小时。
function shanghaiDateKey(value) {
  const key = text(value).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : ''
}

function shanghaiTodayKey() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

function inviteHasSignupData(invite) {
  return Number(invite && invite.signupSchema) >= INVITE_SIGNUP_SCHEMA
}

// 计数口径唯一来源：新邀约读 signupCount 等字段；历史邀约没有这些字段时返回 null，
// 页面必须显示“报名数据待确认”，不能用旧 signedInCount 冒充报名人数，也不回填虚构历史。
function inviteCounts(invite) {
  const row = invite || {}
  const hasSignupData = inviteHasSignupData(row)
  return {
    hasSignupData,
    signupCount: hasSignupData ? Math.max(0, Number(row.signupCount) || 0) : null,
    signupHomeCount: hasSignupData ? Math.max(0, Number(row.signupHomeCount) || 0) : null,
    signupAwayCount: hasSignupData ? Math.max(0, Number(row.signupAwayCount) || 0) : null,
    presentCount: hasSignupData ? Math.max(0, Number(row.presentCount) || 0) : null,
    // 历史签到数只代表旧签到记录，既不是有效报名，也不能参与满员判断
    legacySignedInCount: Math.max(0, Number(row.signedInCount) || 0),
    acceptedCount: Math.max(0, Number(row.acceptedCount) || 0),
    maxPlayers: Math.max(0, Number(row.maxPlayers) || 0)
  }
}

// 报名窗口由服务端统一判定；页面只展示 signupWindow.kind，不自行比较时间或人数
function inviteSignupWindow(invite, counts) {
  const row = invite || {}
  const c = counts || inviteCounts(row)
  const status = text(row.status) || 'open'
  if (status !== 'open') {
    return {
      open: false,
      kind: (status === 'canceled' || status === 'cancelled') ? 'cancelled' : 'closed',
      reason: '活动已关闭'
    }
  }
  const deadline = shanghaiEpoch(row.deadline)
  if (deadline !== null && deadline < Date.now()) {
    return { open: false, kind: 'deadline', reason: '已过报名截止时间' }
  }
  if (c.maxPlayers > 0 && c.signupCount !== null && c.signupCount >= c.maxPlayers) {
    return { open: false, kind: 'full', reason: '报名人数已满' }
  }
  return { open: true, kind: 'open', reason: '' }
}

function signupView(row) {
  const item = row || {}
  return {
    signupId: text(item._id),
    name: text(item.name),
    side: text(item.side) === 'away' ? 'away' : 'home',
    status: text(item.status) || 'active',
    present: Boolean(item.present),
    signedUpAt: item.signedUpAt || null,
    signedInAt: item.signedInAt || null
  }
}

// 公共字段：绝不带 signinToken / signinUrl / createdByUserId / createdByOpenId / 手机号
function invitePublicPayload(invite) {
  const row = invite || {}
  const counts = inviteCounts(row)
  return {
    inviteId: text(row._id),
    teamId: text(row.teamId),
    teamName: text(row.teamName),
    opponentName: text(row.opponentName),
    matchDate: text(row.matchDate),
    matchTime: text(row.matchTime),
    venue: text(row.venue),
    venueAddress: text(row.venueAddress),
    latitude: Number(row.latitude) || 0,
    longitude: Number(row.longitude) || 0,
    deadline: text(row.deadline),
    status: text(row.status) || 'open',
    battleCry: row.battleCry || null,
    // inviteId 与 matchId 的关联方式：邀约是活动权威记录，matchId 只指向独立的比赛记录；
    // 两者不是同一个 ID，也不能互相代替
    matchId: text(row.matchId),
    counts,
    signupWindow: inviteSignupWindow(row, counts),
    createdAt: row.createdAt || null
  }
}

function translateActionError(error) {
  const code = text(error && error.code)
  if (code && !/^DATABASE_/.test(code)) return fail(code, (error && error.message) || '操作失败')
  const signature = String((error && (error.message || error.errCode || error.errMsg)) || '')
  if (/conflict|transaction|同时写入|edited/i.test(signature)) return fail('CONFLICT', '报名请求拥挤，请稍后重试')
  console.warn('[friendly] action error', JSON.stringify({ code: error && error.code, message: signature }))
  return fail('DATA_WRITE_FAILED', '操作失败，请重新提交')
}

// 比赛日窗口：按 Asia/Shanghai 的 matchDate 当天 00:00–23:59:59，本人签到与发起方代签共用
function isInviteMatchDay(invite) {
  const matchDate = shanghaiDateKey(invite && invite.matchDate)
  if (!matchDate) return false
  return matchDate === shanghaiTodayKey()
}

// ======== 战书预设模板（5 种风格）========
// 每种是生成函数，接收球队名 + 对手名 + 时间，返回两行战书
const BATTLE_CRY_PRESETS = {
  humble: function (team, opponent, when) {
    const lines = [
      `「${team}」携替补席向「${opponent}」请教`,
      `球还没抱热乎的，${when || '今晚'}大家脚下留情 🏳️`
    ]
    return { label: '求轻虐', emoji: '🏳️', lines }
  },
  confident: function (team, opponent, when) {
    const lines = [
      `「${team}」应战「${opponent}」，${when || '场上见'}`,
      `听说你们防守不错，来试试 433 高位逼抢 💪`
    ]
    return { label: '小狂一下', emoji: '💪', lines }
  },
  flirty: function (team, opponent, when) {
    const lines = [
      `「${team}」对「${opponent}」发出约球邀请`,
      `${when || '今天'}谁带了老婆一起来观赛？👀`
    ]
    return { label: '勾搭上', emoji: '⚽', lines }
  },
  formal: function (team, opponent, when) {
    const lines = [
      `兹定于${when || '近日'}，「${team}」对阵「${opponent}」`,
      `友谊切磋，胜不骄败不馁，赛小蜂足球见证 ✍️`
    ]
    return { label: '正式版', emoji: '📋', lines }
  },
  trashy: function (team, opponent, when) {
    const lines = [
      `「${team}」战「${opponent}」—— ${when || '今晚'}`,
      `裁判准备好牌，门将守住门，兄弟们冲！🔥`
    ]
    return { label: '热血战书', emoji: '🔥', lines }
  }
}

function formatBattleCry(style, team, opponent, when) {
  const preset = BATTLE_CRY_PRESETS[style] || BATTLE_CRY_PRESETS.formal
  const p = preset(team || '我方', opponent || '对手', when || '')
  return {
    style: style || 'formal',
    styleLabel: p.label,
    styleEmoji: p.emoji,
    text: p.lines.join('\n'),
    lines: p.lines
  }
}

// ======== 网络工具 ========
async function bridgePost(action, payload) {
  const baseUrl = String(CONFIG.bridgeUrl || '').replace(/\/+$/, '')
  if (!baseUrl || !CONFIG.bridgeSecret) return null
  const body = JSON.stringify(payload || {})
  const timestamp = Date.now()
  const nonce = crypto.randomBytes(16).toString('hex')
  const signature = crypto.createHmac('sha256', CONFIG.bridgeSecret)
    .update(`${timestamp}\n${nonce}\n${body}`).digest('hex')
  const target = new URL(baseUrl + '/' + action)
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: target.hostname, port: 443, path: target.pathname + target.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
        'X-Sxf-Timestamp': String(timestamp), 'X-Sxf-Nonce': nonce,
        'X-Sxf-Signature': signature
      }
    }, res => {
      let result = ''
      res.on('data', chunk => { result += chunk })
      res.on('end', () => {
        try { resolve(JSON.parse(result)) } catch (e) { resolve({ raw: result }) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function sendTemplate(openid, templateId, data, pageUrl) {
  if (!openid || !templateId) return null
  if (CONFIG.bridgeUrl && CONFIG.bridgeSecret) {
    return bridgePost('template/send', {
      touser: openid, template_id: templateId, data: data,
      page: pageUrl || '', miniprogram_state: 'formal'
    })
  }
  const appId = process.env.SERVICE_ACCOUNT_APP_ID
  const appSecret = process.env.SERVICE_ACCOUNT_APP_SECRET
  if (!appId || !appSecret) return null
  const tokenRes = await httpsGet(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`)
  const token = tokenRes && tokenRes.access_token
  if (!token) return null
  return httpsPost(`https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${token}`, {
    touser: openid, template_id: templateId, data: data, url: pageUrl || ''
  })
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let r = ''
      res.on('data', c => r += c)
      res.on('end', () => { try { resolve(JSON.parse(r)) } catch (e) { resolve({ raw: r }) } })
    }).on('error', reject)
  })
}
function httpsPost(url, body) {
  const data = JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, res => {
      let r = ''
      res.on('data', c => r += c)
      res.on('end', () => { try { resolve(JSON.parse(r)) } catch (e) { resolve({ raw: r }) } })
    })
    req.on('error', reject)
    req.write(data); req.end()
  })
}

// ======== Action 实现 ========

// A1: 生成战书（AI 或本地预设）
async function generateBattleCry(event) {
  const { teamName, opponentName, matchDate, matchTime, style } = event
  const when = [matchDate, matchTime].filter(Boolean).join(' ')
  const requestedStyle = text(style)

  // AI 模式（云开发 AI+，失败自动回退本地预设）
  if (requestedStyle === 'ai') {
    try {
      const aiRes = await callAI(teamName, opponentName, when)
      if (aiRes && aiRes.text) {
        return ok({ battleCry: { style: 'ai', styleLabel: 'AI 生成', styleEmoji: '✨', text: aiRes.text, lines: aiRes.lines || [aiRes.text] } })
      }
    } catch (e) {
      console.warn('[friendly] AI battle cry fail, fallback', e && e.message)
    }
  }

  // 本地预设兜底
  const presetStyle = requestedStyle && BATTLE_CRY_PRESETS[requestedStyle] ? requestedStyle : 'formal'
  return ok({ battleCry: formatBattleCry(presetStyle, teamName, opponentName, when) })
}

// ======== 云开发 AI+ 生文（hunyuan-lite，开发者计划额度）========

function extractAiText(output) {
  if (!output) return ''
  if (typeof output.text === 'string' && output.text) return output.text
  const choice = output.choices && output.choices[0]
  const message = choice && choice.message
  if (message) {
    const content = message.content != null ? message.content : message.Content
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content.map(part => (part && (part.text || part.content || part.Content)) || '').join('')
    }
  }
  return ''
}

async function aiChat(systemPrompt, userPrompt, modelName) {
  if (typeof cloud.ai !== 'function') throw new Error('cloud.ai unavailable')
  const ai = cloud.ai()
  const model = ai.createModel('cloudbase')
  const res = await model.generateText({
    model: modelName,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    max_tokens: 220,
    temperature: 0.9
  }, { timeout: CONFIG.aiTimeoutMs })
  return extractAiText(res)
}

// 依次尝试候选模型（第一个在控制台启用的生效），全部失败抛最后错误
async function aiChatWithFallback(systemPrompt, userPrompt) {
  const models = CONFIG.aiModels.length ? CONFIG.aiModels : ['deepseek-v4-flash']
  let lastErr = null
  for (const name of models) {
    try {
      const out = await aiChat(systemPrompt, userPrompt, name)
      if (text(out)) return out
      lastErr = new Error('empty ai text from ' + name)
    } catch (e) {
      lastErr = e
      console.warn('[friendly] ai model ' + name + ' fail', JSON.stringify({
        message: e && e.message,
        code: e && e.code,
        requestId: e && e.requestId
      }))
    }
  }
  throw lastErr || new Error('ai all models failed')
}

// 武侠战报本地兜底（与小程序端模板池一致）
function buildScorerPart(scorers) {
  const counts = {}
  const order = []
  ;(Array.isArray(scorers) ? scorers : []).forEach(s => {
    const n = text(s && s.name)
    if (!n) return
    if (!counts[n]) { counts[n] = 0; order.push(n) }
    counts[n] += 1
  })
  if (!order.length) return ''
  return order.slice(0, 3).map(n => {
    const c = counts[n]
    if (c >= 3) return n + '三箭定天山'
    if (c === 2) return n + '连下两城'
    return n + '一剑封喉'
  }).join('、') + '，'
}

function buildLocalMatchStory(p) {
  const home = Number(p.homeScore) || 0
  const away = Number(p.awayScore) || 0
  const homeName = p.homeName || '我队'
  const oppName = p.oppName || '对手'
  const scorerPart = p.scorerPart || ''
  const durationTail = Number(p.durationMinutes) ? '全场 ' + Number(p.durationMinutes) + ' 分钟，快意江湖。' : ''
  let resultClass = 'draw'
  if (home > away) resultClass = 'win'
  else if (home < away) resultClass = 'lose'
  const templates = {
    win: [
      '绿茵江湖今日风云再起！' + homeName + '对阵' + oppName + '，' + scorerPart + '一鼓作气拿下此战 ' + home + ':' + away + '，痛快！',
      '战鼓擂罢，' + homeName + '以 ' + home + ':' + away + ' 克' + oppName + '。' + scorerPart + '此役配合行云流水，堪为江湖佳话。',
      home + ':' + away + '！' + homeName + '技压全场，' + scorerPart + '对手虽奋力周旋，终难敌我锋芒。'
    ],
    lose: [
      '此役' + homeName + '憾负' + oppName + '，' + home + ':' + away + '。江湖路远，胜败乃兵家常事，回去勤修内功，来日再战！',
      home + ':' + away + '，' + homeName + '今日运气未至。' + scorerPart + '虽败犹荣，收拾行囊，下一战找回场子！'
    ],
    draw: [
      '棋逢对手！' + homeName + '与' + oppName + '战成 ' + home + ':' + away + '，' + scorerPart + '难分高下，握手言和，江湖再会。',
      home + ':' + away + ' 平局收场。' + scorerPart + '两强相争各取一分，绿茵江湖，友谊第一。'
    ]
  }
  const pool = templates[resultClass] || templates.draw
  return pool[Math.floor(Math.random() * pool.length)] + durationTail
}

// C1: AI 武侠战报（失败回退本地模板，永远返回 ok）
async function generateMatchReport(event) {
  let params = {
    homeScore: Number(event.homeScore) || 0,
    awayScore: Number(event.awayScore) || 0,
    homeName: text(event.teamName) || '我队',
    oppName: text(event.opponentName) || '对手',
    scorers: Array.isArray(event.scorers) ? event.scorers : [],
    durationMinutes: Number(event.durationMinutes) || 0
  }
  const matchId = text(event.matchId)
  let style = text(event.style)
  if (matchId) {
    const doc = await db.collection(MATCHES_COLLECTION).doc(matchId).get().catch(() => null)
    if (doc && doc.data) {
      const m = doc.data
      // 请求未带 style 时用文档记录的风格（重开战报保持一致）
      if (!style) style = text(m.aiStoryStyle)
      params = {
        homeScore: Number(m.homeScore) || params.homeScore,
        awayScore: Number(m.awayScore) || params.awayScore,
        homeName: text(m.teamName) || params.homeName,
        oppName: text(m.opponentName) || params.oppName,
        scorers: Array.isArray(m.scorers) && m.scorers.length ? m.scorers : params.scorers,
        durationMinutes: Number(m.durationMinutes) || params.durationMinutes
      }
    }
  }
  if (!style) style = 'wuxia'
  params.style = style

  const scorerPart = buildScorerPart(params.scorers)
  const localStory = buildLocalMatchStory({ ...params, scorerPart })

  const home = params.homeScore
  const away = params.awayScore
  const resultText = home > away ? '主队胜' : (home < away ? '客队胜' : '平局')
  const scorerNames = (params.scorers || []).map(s => text(s && s.name)).filter(Boolean)
  const promptData = [
    `主队：${params.homeName}`,
    `客队：${params.oppName}`,
    `比分：${home}:${away}（${resultText}）`,
    scorerNames.length ? `进球球员：${scorerNames.join('、')}` : '进球球员：无',
    params.durationMinutes ? `全场时长：${params.durationMinutes}分钟` : ''
  ].filter(Boolean).join('\n')

  let story = ''
  let source = 'fallback'
  const isParty = text(params.style) === 'party'
  try {
    const storyPrompt = isParty
      ? '你是一位快乐足球赛后简讯写手。根据比赛数据写一段60~90字的中文简讯：幽默搞笑、兄弟局氛围，可以有举杯庆祝、烧烤复盘、调侃对手等轻松梗，但不低俗、不出现酒类品牌、不带脏话，必须写明真实队名与比分，有进球球员要提到名字。只输出简讯正文，不要标题、不要引号、不要解释。'
      : '你是一位武侠小说笔法的足球战报写手。根据比赛数据写一段60~90字的中文战报：武侠江湖气息、热血但不粗俗，必须写明真实队名与比分，有进球球员要提到名字。只输出战报正文，不要标题、不要引号、不要解释。'
    const aiText = await aiChatWithFallback(storyPrompt, promptData)
    const cleaned = text(aiText)
    if (cleaned.length >= 12 && cleaned.length <= 250) {
      story = cleaned
      source = 'ai'
    }
  } catch (e) {
    console.warn('[friendly] AI story all models fail', JSON.stringify({
      message: e && e.message,
      code: e && e.code,
      requestId: e && e.requestId
    }))
  }
  if (!story) story = localStory

  if (matchId) {
    try {
      await db.collection(MATCHES_COLLECTION).doc(matchId).update({
        data: { aiStory: story, aiStoryStyle: isParty ? 'party' : 'wuxia', aiStorySource: source, aiStoryAt: new Date() }
      })
    } catch (e) {
      console.warn('[friendly] persist aiStory fail', e && e.message)
    }
  }

  return ok({ story, source })
}

// AI 战书（云开发 AI+ cloudbase 网关，异常由调用方兜底）
async function callAI(team, opponent, when) {
  const aiText = await aiChatWithFallback(
    '你是武侠小说笔法的约球战书写手。根据数据写一份约球战书：两行以内、每行不超过20字，热血俏皮、可以带一个emoji。只输出战书内容，不要标题和解释。',
    `我方球队：${team || '我队'}\n对手：${opponent || '对手'}\n时间：${when || '待定'}`
  )
  const lines = text(aiText).split(/\n+/).filter(Boolean).slice(0, 2)
  if (!lines.length) throw new Error('empty ai text')
  return { text: lines.join('\n'), lines }
}

// 文生图 + 429 限流退避重试（官方 FAQ：429 = 触发模型限流，等待后重试即可）
async function generateImageWithRetry(imageModel, params, attempts) {
  let lastErr = null
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await imageModel.generateImage(params)
      const first = res && res.data && res.data[0]
      const url = text(first && (first.url || first.imageUrl))
      if (url) return url
      lastErr = new Error('empty image url')
    } catch (e) {
      lastErr = e
      const sig = ((e && e.message) || '') + ' ' + ((e && e.code) || '')
      console.warn('[friendly] image attempt ' + (i + 1) + '/' + attempts + ' fail', JSON.stringify({
        message: e && e.message,
        code: e && e.code,
        requestId: e && e.requestId
      }))
      const is429 = /429|rate.?limit|throttl|too.?many/i.test(sig)
      if (!is429 || i >= attempts - 1) break
      await new Promise(resolve => setTimeout(resolve, 4000 * (i + 1)))
    }
  }
  throw lastErr
}

// C3: AI 海报背景（用户点按钮触发；按风格分别缓存 aiBgFiles.{wuxia,party}；文字 AI 按比赛数据写提示词 → 文生图；队名/比分/品牌条由 Canvas 叠加）
async function generateReportBg(event) {
  const matchId = text(event.matchId)
  const force = Boolean(event.force)
  const style = text(event.style) === 'party' ? 'party' : 'wuxia'
  if (matchId && !force) {
    const doc = await db.collection(MATCHES_COLLECTION).doc(matchId).get().catch(() => null)
    const bgFiles = (doc && doc.data && doc.data.aiBgFiles) || {}
    const cachedFileId = text(bgFiles[style])
    if (cachedFileId) {
      const urlRes = await cloud.getTempFileURL({ fileList: [cachedFileId] }).catch(() => null)
      const first = urlRes && urlRes.fileList && urlRes.fileList[0]
      return ok({ fileId: cachedFileId, url: text(first && first.tempFileURL), cached: true })
    }
  }

  if (typeof cloud.ai !== 'function') return fail('AI_UNAVAILABLE', '当前环境不支持云开发 AI+')

  // 第一步：文字 AI（hy3）按比赛数据生成画面提示词，失败回退固定模板
  let prompt = ''
  if (matchId) {
    try {
      const doc = matchId ? await db.collection(MATCHES_COLLECTION).doc(matchId).get().catch(() => null) : null
      const m = (doc && doc.data) || {}
      const scorerNames = (Array.isArray(m.scorers) ? m.scorers : []).map(s => text(s && s.name)).filter(Boolean).slice(0, 4)
      const dataLine = [
        `主队${text(m.teamName) || '我队'} ${Number(m.homeScore) || 0}:${Number(m.awayScore) || 0} 客队${text(m.opponentName) || '对手'}`,
        scorerNames.length ? `进球球员：${scorerNames.join('、')}` : '',
        text(m.aiStory) ? `战报文案：${text(m.aiStory)}` : ''
      ].filter(Boolean).join('\n')
      const promptSystem = style === 'party'
        ? '你是文生图提示词写手。根据提供的足球比赛数据，写一段80字以内的中文画面提示词，用于生成竖版欢乐夜场风格海报背景：'
        + '必须包含场景、氛围、主体动态（球员们欢庆进球、举杯互动的姿态），风格统一为暖金色傍晚球场灯光+热闹烟火气插画；'
        + '禁止出现任何文字、队名、人名、比分、标志的要求；禁止出现酒瓶、酒杯等具体酒类物品；不写排版要求。只输出提示词本身。'
        : '你是文生图提示词写手。根据提供的足球比赛数据，写一段80字以内的中文画面提示词，用于生成竖版武侠水墨海报背景：'
        + '必须包含场景、氛围、主体动态（侠客踢球的姿态），风格统一为水墨青绿山水+绿茵球场；'
        + '禁止出现任何文字、队名、人名、比分、印章、标志的要求；不写"海报"两个字以外的排版要求。只输出提示词本身。'
      prompt = await aiChatWithFallback(promptSystem, dataLine)
      prompt = text(prompt).slice(0, 400)
    } catch (e) {
      console.warn('[friendly] ai prompt gen fail, use default', e && e.message)
    }
  }
  if (!prompt) {
    prompt = style === 'party'
      ? [
        '欢乐足球夜场风格竖版海报背景插画：傍晚灯光下的社区球场，暖金色灯光洒满草坪，',
        '一群卡通球员拥抱欢呼庆祝进球，有人跳跃击掌，气氛热烈搞笑，烟花与彩带点缀，',
        '画面下方三分之一留大面积空旷草坪便于排字，',
        '暖金色与橙棕色为主色调，扁平插画质感，不要任何文字、标志，不出现酒类物品，不出现人脸特写'
      ].join('')
      : [
        '武侠水墨风格竖版海报背景插画：古代绿茵球场，远山淡墨与青绿草地交融，晨雾大量留白，',
        '一名束发侠客的背影凌空侧身踢出一只足球，衣袂飘飞，动感十足，',
        '画面下方三分之一留大面积空旷草地便于排字，',
        '深绿色与墨色为主色调，水彩晕染质感，不要任何文字、印章、标志，不出现人脸特写'
      ].join('')
  }

  // 第二步：文生图（429 限流自动退避重试 3 次）
  let imageUrl = ''
  try {
    const ai = cloud.ai()
    const imageModel = ai.createImageModel('hunyuan-image')
    imageUrl = await generateImageWithRetry(imageModel, {
      model: CONFIG.aiImageModel,
      prompt: prompt,
      size: CONFIG.aiImageSize,
      revise: { value: true }
    }, 3)
  } catch (e) {
    const sig = ((e && e.message) || '') + ' ' + ((e && e.code) || '')
    const is429 = /429|rate.?limit|throttl|too.?many/i.test(sig)
    console.warn('[friendly] AI bg generate fail', JSON.stringify({
      message: e && e.message,
      code: e && e.code,
      requestId: e && e.requestId
    }))
    if (is429) return fail('AI_RATE_LIMITED', 'AI 绘制太火爆，请 1 分钟后再试')
    return fail('AI_BG_FAILED', 'AI 背景生成失败：' + ((e && e.message) || '未知错误'))
  }
  if (!imageUrl) return fail('AI_BG_EMPTY', 'AI 未返回图片')

  // 生成 URL 有效期短，转存云存储供 Canvas 稳定加载
  let buf = null
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30000)
    const res = await fetch(imageUrl, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) throw new Error('download ' + res.status)
    buf = Buffer.from(await res.arrayBuffer())
  } catch (e) {
    return fail('AI_BG_DOWNLOAD_FAILED', '生成图下载失败：' + ((e && e.message) || '未知错误'))
  }
  const cloudPath = 'friendly-posters/bg-' + (matchId || 'adhoc') + '-' + Date.now() + '.jpg'
  let fileId = ''
  try {
    const upRes = await cloud.uploadFile({ cloudPath: cloudPath, fileContent: buf })
    fileId = text(upRes && upRes.fileID)
  } catch (e) {
    return fail('AI_BG_UPLOAD_FAILED', '背景转存失败：' + ((e && e.message) || '未知错误'))
  }
  if (!fileId) return fail('AI_BG_UPLOAD_FAILED', '背景转存失败')

  if (matchId) {
    await db.collection(MATCHES_COLLECTION).doc(matchId).update({
      data: { ['aiBgFiles.' + style]: fileId, aiBgStyle: style, aiBgAt: new Date() }
    }).catch(() => null)
  }
  return ok({ fileId: fileId, cached: false })
}

// A2: 球队管理者创建约球邀约（含战书）
// 鉴权：从 WXContext 解析自然人手机号主账号；只接受球队管理授权，
// 不信任客户端传入的 userId / 手机号 / 普通成员身份。
async function createInvite(event) {
  const caller = await resolveCallerIdentity()
  if (!caller.openid) return fail('UNAUTHORIZED', '请先登录后再发起约球')
  if (!caller.userId) return fail('UNAUTHORIZED', '请先完成手机号登录后再发起约球')

  const teamId = text(event.teamId)
  if (!teamId) return fail('INVALID_PARAM', '缺少球队信息')
  if (!await callerManagesTeam(teamId, caller)) return fail('FORBIDDEN', '只有球队管理者可以发起约球邀约')

  // 球队名以球队档案为准，不接受客户端自行指定
  const team = await readDoc('teams', teamId)
  const teamName = text((team && (team.name || team.teamName)) || event.teamName)
  if (!teamName) return fail('INVALID_DATA', '球队名称为空，请先完善球队资料')

  const matchDate = text(event.matchDate)
  if (!matchDate) return fail('INVALID_PARAM', '请选择比赛日期')
  if (!shanghaiDateKey(matchDate)) return fail('INVALID_PARAM', '比赛日期格式不正确')

  const deadline = text(event.deadline)
  if (deadline) {
    if (!shanghaiDateKey(deadline)) return fail('INVALID_PARAM', '报名截止日期格式不正确')
    const deadlineEpoch = shanghaiEpoch(deadline)
    if (deadlineEpoch !== null && deadlineEpoch < Date.now()) return fail('INVALID_PARAM', '报名截止时间不能早于现在')
  }

  const opponentName = text(event.opponentName)
  const matchTime = text(event.matchTime)
  const venue = text(event.venue)
  const venueAddress = text(event.venueAddress)
  const latitude = Number(event.latitude) || 0
  const longitude = Number(event.longitude) || 0
  // 0 = 不限；上限 60 与创建页步进一致
  const limitRaw = Number(event.maxPlayers)
  const maxPlayers = limitRaw > 0 ? Math.min(60, Math.max(1, limitRaw)) : 0

  const signinToken = randomToken(32)
  const signinUrl = `${CONFIG.h5BaseUrl}friendly-signin.html?token=${signinToken}`

  // 战斗宣言：如果没传完整的 battleCry，就从 style 字段生成
  const when = [matchDate, matchTime].filter(Boolean).join(' ')
  let resolvedBattleCry = event.battleCry
  if (!resolvedBattleCry || !text(resolvedBattleCry.text)) {
    const style = text(event.battleCryStyle) || 'formal'
    resolvedBattleCry = formatBattleCry(style, teamName, opponentName, when)
  }

  const record = {
    teamId, teamName,
    createdByUserId: caller.userId,
    createdByOpenId: caller.openid,
    opponentName, matchDate, matchTime, venue,
    venueAddress,
    latitude,
    longitude,
    maxPlayers,
    deadline,
    status: 'open',
    signinToken,
    signinUrl,
    // 历史兼容字段：只代表旧签到数，个人报名计数改用下面四个字段
    signedInCount: 0,
    signupSchema: INVITE_SIGNUP_SCHEMA,
    signupCount: 0,
    signupHomeCount: 0,
    signupAwayCount: 0,
    presentCount: 0,
    matchId: '',
    battleCry: resolvedBattleCry,
    createdAt: new Date()
  }

  const addRes = await db.collection(INVITES_COLLECTION).add({ data: record })
  const inviteId = addRes._id

  setTimeout(() => notifyTeamPlayers(inviteId, record).catch(e => console.warn('[friendly] notify fail', e && e.message)), 0)

  return ok({
    inviteId,
    signinUrl,
    signinToken,
    battleCry: resolvedBattleCry,
    detailPath: '/pages/discover/invite-detail/invite-detail?inviteId=' + inviteId
  })
}

// A3: H5 凭 token 读取邀约详情（旧链接兼容）
// 只返回公开字段与计数，不再返回 signinToken / signinUrl / 创建人账号
async function getInvite(event) {
  const token = text(event.token)
  if (!token) return fail('INVALID_PARAM', '缺少签到凭证')
  const res = await db.collection(INVITES_COLLECTION).where({ signinToken: token }).limit(1).get().catch(() => null)
  if (!res || !res.data.length) return fail('NOT_FOUND', '邀约不存在或已过期')
  return ok(invitePublicPayload(res.data[0]))
}

// A3.1: 小程序邀约详情（同一活动标识 inviteId；旧 token 入口仍可用）
async function getInviteDetail(event) {
  const caller = await resolveCallerIdentity()
  if (!caller.openid) return fail('UNAUTHORIZED', '请先进入小程序后再查看邀约')

  const inviteId = text(event.inviteId)
  const token = text(event.token)
  if (!inviteId && !token) return fail('INVALID_PARAM', '缺少邀约标识')

  let invite = null
  if (inviteId) {
    invite = await readDoc(INVITES_COLLECTION, inviteId)
  } else {
    const res = await db.collection(INVITES_COLLECTION).where({ signinToken: token }).limit(1).get().catch(() => null)
    invite = (res && res.data && res.data[0]) || null
  }
  if (!invite) return fail(inviteId ? 'NOT_FOUND' : 'NOT_FOUND', '邀约不存在或已关闭')

  const counts = inviteCounts(invite)
  const signupWindow = inviteSignupWindow(invite, counts)
  const team = await readDoc('teams', text(invite.teamId))
  const canManage = Boolean(caller.userId) && await callerManagesTeam(text(invite.teamId), caller)

  let mySignup = null
  if (caller.userId) {
    const row = await readDoc(INVITE_SIGNUPS_COLLECTION, inviteSignupDocId(text(invite._id), caller.userId))
    if (row && text(row.status) === 'active') mySignup = signupView(row)
  }

  const checkIn = buildCheckInState(invite, mySignup)
  const payload = invitePublicPayload(invite)
  payload.teamLogo = teamLogoOf(team)
  payload.teamCity = teamCityOf(team)
  payload.canManage = canManage
  payload.canSignUp = signupWindow.open && !mySignup
  payload.canCancel = Boolean(mySignup) && !mySignup.present
  payload.mySignup = mySignup
  payload.checkIn = checkIn

  // 个人报名名单只对发起球队管理者开放；普通参与者只能看到自己的报名状态与公开计数
  const signups = canManage ? await loadInviteSignupRows(text(invite._id)) : []
  const teamResponses = canManage ? await loadInviteTeamResponses(text(invite._id)) : []

  return ok({
    invite: payload,
    signups,
    teamResponses,
    hasSignupList: canManage,
    total: signups.length
  })
}

function buildCheckInState(invite, mySignup) {
  if (!mySignup) return { allowed: false, kind: 'signup_required', reason: '未报名不能签到' }
  if (mySignup.present) return { allowed: false, kind: 'present', reason: '已签到' }
  if (!isInviteMatchDay(invite)) return { allowed: false, kind: 'not_match_day', reason: '仅比赛当天可以签到' }
  return { allowed: true, kind: 'ready', reason: '' }
}

async function loadInviteSignupRows(inviteId) {
  const res = await db.collection(INVITE_SIGNUPS_COLLECTION)
    .where({ inviteId }).limit(100).get().catch(() => null)
  const rows = ((res && res.data) || []).filter(row => text(row.status) === 'active')
  rows.sort((a, b) => (Number(new Date(a.signedUpAt || 0)) || 0) - (Number(new Date(b.signedUpAt || 0)) || 0))
  return rows.map(signupView)
}

// 球队应战名单：沿用 friendly_match_responses 的 accepted / rejected 记录，
// 与个人报名名单分开展示，不再把 status=present 的历史签到混入应战
async function loadInviteTeamResponses(inviteId) {
  const res = await db.collection(RESPONSES_COLLECTION)
    .where({ inviteId }).limit(100).get().catch(() => null)
  const rows = ((res && res.data) || []).filter(row => {
    const status = text(row.status).toLowerCase()
    return status === 'accepted' || status === 'rejected'
  })
  rows.sort((a, b) => (Number(new Date(a.respondedAt || 0)) || 0) - (Number(new Date(b.respondedAt || 0)) || 0))
  return rows.map(row => ({
    responseId: text(row._id),
    teamName: text(row.teamName) || '球队待核验',
    status: text(row.status).toLowerCase(),
    respondedAt: row.respondedAt || null
  }))
}

// A3.2: 个人报名（本方 / 对方）。同一自然人重复提交幂等；满员、截止、关闭由服务端拒绝。
async function signUpForInvite(event) {
  const inviteId = text(event.inviteId)
  const side = text(event.side)
  const name = text(event.name)
  if (!inviteId) return fail('INVALID_PARAM', '缺少邀约标识')
  if (side !== 'home' && side !== 'away') return fail('INVALID_PARAM', '请选择报名本方或对方')
  if (!name) return fail('INVALID_PARAM', '请填写报名姓名')
  if (name.length > 20) return fail('INVALID_PARAM', '姓名不能超过 20 个字')

  const caller = await resolveCallerIdentity()
  if (!caller.openid) return fail('UNAUTHORIZED', '请先登录后再报名')
  if (!caller.userId) return fail('UNAUTHORIZED', '请先完成手机号登录后再报名')

  const signupId = inviteSignupDocId(inviteId, caller.userId)
  try {
    const result = await db.runTransaction(async transaction => {
      const invite = await readTxDoc(transaction, INVITES_COLLECTION, inviteId)
      if (!invite) throw businessError('NOT_FOUND', '邀约不存在或已取消')
      const counts = inviteCounts(invite)
      const window = inviteSignupWindow(invite, counts)
      if (!window.open) throw businessError(window.kind === 'full' ? 'FULL' : 'CLOSED', window.reason || '报名已结束')

      const existing = await readTxDoc(transaction, INVITE_SIGNUPS_COLLECTION, signupId)
      if (existing && text(existing.status) === 'active') {
        return {
          alreadySignedUp: true,
          signup: signupView(existing),
          counts: Object.assign({}, counts, { hasSignupData: true })
        }
      }

      // 历史邀约首次接入个人报名：计数从 0 起算，不回填旧签到数
      const base = counts.hasSignupData
        ? counts
        : Object.assign({}, counts, { signupCount: 0, signupHomeCount: 0, signupAwayCount: 0, presentCount: 0 })
      if (base.maxPlayers > 0 && Number(base.signupCount) >= base.maxPlayers) throw businessError('FULL', '报名人数已满')

      const now = new Date()
      const nextSignup = {
        inviteId,
        userId: caller.userId,
        openId: caller.openid,
        name,
        side,
        status: 'active',
        present: false,
        signedUpAt: now,
        signedInAt: null,
        updatedAt: now
      }
      await transaction.collection(INVITE_SIGNUPS_COLLECTION).doc(signupId).set({ data: nextSignup })
      const nextCounts = {
        signupSchema: INVITE_SIGNUP_SCHEMA,
        signupCount: Number(base.signupCount) + 1,
        signupHomeCount: Number(base.signupHomeCount) + (side === 'home' ? 1 : 0),
        signupAwayCount: Number(base.signupAwayCount) + (side === 'away' ? 1 : 0),
        presentCount: Number(base.presentCount),
        updatedAt: now
      }
      await transaction.collection(INVITES_COLLECTION).doc(inviteId).update({ data: nextCounts })

      return {
        alreadySignedUp: false,
        reactivated: Boolean(existing),
        signup: signupView(Object.assign({ _id: signupId }, nextSignup)),
        counts: Object.assign({}, base, {
          hasSignupData: true,
          signupCount: nextCounts.signupCount,
          signupHomeCount: nextCounts.signupHomeCount,
          signupAwayCount: nextCounts.signupAwayCount,
          presentCount: nextCounts.presentCount
        })
      }
    })
    return ok({
      alreadySignedUp: result.alreadySignedUp,
      reactivated: Boolean(result.reactivated),
      signup: result.signup,
      counts: publicCountPayload(result.counts)
    })
  } catch (error) {
    return translateActionError(error)
  }
}

function publicCountPayload(counts) {
  const c = counts || {}
  return {
    hasSignupData: Boolean(c.hasSignupData),
    signupCount: c.hasSignupData ? Math.max(0, Number(c.signupCount) || 0) : null,
    signupHomeCount: c.hasSignupData ? Math.max(0, Number(c.signupHomeCount) || 0) : null,
    signupAwayCount: c.hasSignupData ? Math.max(0, Number(c.signupAwayCount) || 0) : null,
    presentCount: c.hasSignupData ? Math.max(0, Number(c.presentCount) || 0) : null,
    acceptedCount: Math.max(0, Number(c.acceptedCount) || 0),
    maxPlayers: Math.max(0, Number(c.maxPlayers) || 0)
  }
}

// A3.3: 取消本人报名。已签到不能取消；重复取消幂等。
async function cancelInviteSignup(event) {
  const inviteId = text(event.inviteId)
  if (!inviteId) return fail('INVALID_PARAM', '缺少邀约标识')
  const caller = await resolveCallerIdentity()
  if (!caller.openid) return fail('UNAUTHORIZED', '请先登录后再操作')
  if (!caller.userId) return fail('UNAUTHORIZED', '请先完成手机号登录后再操作')

  const signupId = inviteSignupDocId(inviteId, caller.userId)
  try {
    const result = await db.runTransaction(async transaction => {
      const invite = await readTxDoc(transaction, INVITES_COLLECTION, inviteId)
      if (!invite) throw businessError('NOT_FOUND', '邀约不存在或已取消')
      const existing = await readTxDoc(transaction, INVITE_SIGNUPS_COLLECTION, signupId)
      if (!existing) throw businessError('NOT_SIGNED_UP', '你还没有报名这场约球')
      if (text(existing.status) !== 'active') {
        return { alreadyCanceled: true, counts: publicCountPayload(inviteCounts(invite)) }
      }
      if (existing.present) throw businessError('ALREADY_PRESENT', '已签到，不能取消报名')

      const counts = inviteCounts(invite)
      const base = counts.hasSignupData
        ? counts
        : Object.assign({}, counts, { signupCount: 0, signupHomeCount: 0, signupAwayCount: 0, presentCount: 0 })
      const side = text(existing.side) === 'away' ? 'away' : 'home'
      const now = new Date()
      await transaction.collection(INVITE_SIGNUPS_COLLECTION).doc(signupId).update({
        data: { status: 'canceled', canceledAt: now, canceledBy: caller.userId, updatedAt: now }
      })
      const nextCounts = {
        signupSchema: INVITE_SIGNUP_SCHEMA,
        signupCount: Math.max(0, Number(base.signupCount) - 1),
        signupHomeCount: Math.max(0, Number(base.signupHomeCount) - (side === 'home' ? 1 : 0)),
        signupAwayCount: Math.max(0, Number(base.signupAwayCount) - (side === 'away' ? 1 : 0)),
        presentCount: Number(base.presentCount),
        updatedAt: now
      }
      await transaction.collection(INVITES_COLLECTION).doc(inviteId).update({ data: nextCounts })
      return {
        alreadyCanceled: false,
        counts: publicCountPayload(Object.assign({}, base, { hasSignupData: true }, nextCounts))
      }
    })
    return ok({
      alreadyCanceled: result.alreadyCanceled,
      canceled: !result.alreadyCanceled,
      counts: result.counts
    })
  } catch (error) {
    return translateActionError(error)
  }
}

// A3.4: 发起方本人签到。报名不因签到增加；未报名直接签到一律拒绝，不暗自补报名。
async function signInInvite(event) {
  const inviteId = text(event.inviteId)
  if (!inviteId) return fail('INVALID_PARAM', '缺少邀约标识')
  const caller = await resolveCallerIdentity()
  if (!caller.openid) return fail('UNAUTHORIZED', '请先登录后再签到')
  if (!caller.userId) return fail('UNAUTHORIZED', '请先完成手机号登录后再签到')

  const signupId = inviteSignupDocId(inviteId, caller.userId)
  try {
    const result = await db.runTransaction(async transaction => {
      const invite = await readTxDoc(transaction, INVITES_COLLECTION, inviteId)
      if (!invite) throw businessError('NOT_FOUND', '邀约不存在或已取消')
      const existing = await readTxDoc(transaction, INVITE_SIGNUPS_COLLECTION, signupId)
      if (!existing || text(existing.status) !== 'active') throw businessError('SIGNUP_REQUIRED', '请先报名后再签到')
      if (existing.present) return { alreadySignedIn: true, signup: signupView(existing) }
      if (!isInviteMatchDay(invite)) throw businessError('NOT_MATCH_DAY', '仅比赛当天可以签到')

      const counts = inviteCounts(invite)
      const base = counts.hasSignupData
        ? counts
        : Object.assign({}, counts, { signupCount: 0, signupHomeCount: 0, signupAwayCount: 0, presentCount: 0 })
      const now = new Date()
      await transaction.collection(INVITE_SIGNUPS_COLLECTION).doc(signupId).update({
        data: { present: true, signedInAt: now, signedInBy: caller.userId, signInMode: 'self', updatedAt: now }
      })
      // 只增加签到计数，signupCount 保持不变
      await transaction.collection(INVITES_COLLECTION).doc(inviteId).update({
        data: {
          signupSchema: INVITE_SIGNUP_SCHEMA,
          presentCount: Number(base.presentCount) + 1,
          updatedAt: now
        }
      })
      return {
        alreadySignedIn: false,
        signup: signupView(Object.assign({}, existing, { _id: signupId, present: true, signedInAt: now }))
      }
    })
    return ok({ alreadySignedIn: result.alreadySignedIn, signedIn: !result.alreadySignedIn, signup: result.signup })
  } catch (error) {
    return translateActionError(error)
  }
}

// A3.5: 发起方代签。只对已报名且未签到的记录生效，不会为目标补报名。
async function manualSignInInvite(event) {
  const inviteId = text(event.inviteId)
  const targetSignupId = text(event.signupId) ||
    (text(event.targetUserId) ? inviteSignupDocId(inviteId, text(event.targetUserId)) : '')
  if (!inviteId) return fail('INVALID_PARAM', '缺少邀约标识')
  if (!targetSignupId) return fail('INVALID_PARAM', '请选择要代签的报名记录')

  const caller = await resolveCallerIdentity()
  if (!caller.openid) return fail('UNAUTHORIZED', '请先登录后再操作')
  if (!caller.userId) return fail('UNAUTHORIZED', '请先完成手机号登录后再操作')

  const invite = await readDoc(INVITES_COLLECTION, inviteId)
  if (!invite) return fail('NOT_FOUND', '邀约不存在或已取消')
  if (!await callerManagesTeam(text(invite.teamId), caller)) return fail('FORBIDDEN', '只有发起球队管理者可以代签')

  try {
    const result = await db.runTransaction(async transaction => {
      const freshInvite = await readTxDoc(transaction, INVITES_COLLECTION, inviteId)
      if (!freshInvite) throw businessError('NOT_FOUND', '邀约不存在或已取消')
      if (!isInviteMatchDay(freshInvite)) throw businessError('NOT_MATCH_DAY', '仅比赛当天可以代签')
      const target = await readTxDoc(transaction, INVITE_SIGNUPS_COLLECTION, targetSignupId)
      if (!target || text(target.inviteId) !== inviteId) throw businessError('NOT_FOUND', '报名记录不存在')
      if (text(target.status) !== 'active') throw businessError('SIGNUP_REQUIRED', '该参与者没有有效报名，不能代签')
      if (target.present) return { alreadySignedIn: true, signup: signupView(target) }

      const counts = inviteCounts(freshInvite)
      const base = counts.hasSignupData
        ? counts
        : Object.assign({}, counts, { signupCount: 0, signupHomeCount: 0, signupAwayCount: 0, presentCount: 0 })
      const now = new Date()
      await transaction.collection(INVITE_SIGNUPS_COLLECTION).doc(targetSignupId).update({
        data: { present: true, signedInAt: now, signedInBy: caller.userId, signInMode: 'manual', updatedAt: now }
      })
      await transaction.collection(INVITES_COLLECTION).doc(inviteId).update({
        data: {
          signupSchema: INVITE_SIGNUP_SCHEMA,
          presentCount: Number(base.presentCount) + 1,
          updatedAt: now
        }
      })
      return {
        alreadySignedIn: false,
        signup: signupView(Object.assign({}, target, { _id: targetSignupId, present: true, signedInAt: now }))
      }
    })
    return ok({ alreadySignedIn: result.alreadySignedIn, signedIn: !result.alreadySignedIn, signup: result.signup })
  } catch (error) {
    return translateActionError(error)
  }
}

// A3.6: 发起方查看个人报名名单与球队应战名单（独立 action，权限只认球队管理授权）
async function listInviteSignups(event) {
  const inviteId = text(event.inviteId)
  if (!inviteId) return fail('INVALID_PARAM', '缺少邀约标识')
  const caller = await resolveCallerIdentity()
  if (!caller.openid) return fail('UNAUTHORIZED', '请先登录后再查看报名名单')
  if (!caller.userId) return fail('UNAUTHORIZED', '请先完成手机号登录后再查看报名名单')

  const invite = await readDoc(INVITES_COLLECTION, inviteId)
  if (!invite) return fail('NOT_FOUND', '邀约不存在或已取消')
  if (!await callerManagesTeam(text(invite.teamId), caller)) return fail('FORBIDDEN', '只有发起球队管理者可以查看报名名单')

  const signups = await loadInviteSignupRows(inviteId)
  const teamResponses = await loadInviteTeamResponses(inviteId)
  return ok({
    inviteId,
    signups,
    teamResponses,
    counts: publicCountPayload(inviteCounts(invite)),
    total: signups.length,
    presentTotal: signups.filter(row => row.present).length
  })
}

// A4: 对手响应战书（接收 / 拒绝）
async function respondInvite(event) {
  const token = text(event.token)
  const status = text(event.status)  // 'accepted' | 'rejected'
  const opponentTeamName = text(event.opponentTeamName) || text(event.teamName) || '对手'
  const opponentUserId = text(event.userId) || text(cloud.getWXContext().OPENID)
  const opponentUserName = text(event.userName) || '对方球员'

  if (!token) return fail('INVALID_PARAM', '缺少战书凭证')
  if (status !== 'accepted' && status !== 'rejected') return fail('INVALID_PARAM', '状态非法，只能 accepted / rejected')

  const inviteRes = await db.collection(INVITES_COLLECTION).where({ signinToken: token }).limit(1).get()
  if (!inviteRes.data.length) return fail('NOT_FOUND', '战书不存在')
  const invite = inviteRes.data[0]
  if (invite.status !== 'open') return fail('CLOSED', '战书已关闭')

  // 幂等：同一对手不重复响应
  const existRes = await db.collection(RESPONSES_COLLECTION).where({ inviteId: invite._id, userId: opponentUserId }).limit(1).get()
  if (existRes.data.length) {
    if (existRes.data[0].status === status) {
      return ok({ alreadyResponded: true, responseId: existRes.data[0]._id })
    }
  }

  // 写响应记录
  const addRes = await db.collection(RESPONSES_COLLECTION).add({
    data: {
      inviteId: invite._id,
      userId: opponentUserId,
      userName: opponentUserName,
      teamName: opponentTeamName,
      status: status,
      respondedAt: new Date()
    }
  })

  // 更新邀约：accepted → 计数 +1，rejected 也写个标记
  const updateData = {
    lastResponseAt: new Date(),
    lastResponseStatus: status,
    lastRespondedBy: opponentTeamName
  }
  if (status === 'accepted') updateData.acceptedCount = _.inc(1)
  if (status === 'rejected') updateData.rejectedCount = _.inc(1)
  await db.collection(INVITES_COLLECTION).doc(invite._id).update({ data: updateData })

  // 推通知给发起方（异步）
  setTimeout(() => notifyCreatorOfResponse(invite, status, opponentTeamName).catch(e => console.warn('[friendly] notify creator fail', e && e.message)), 0)

  return ok({ responseId: addRes._id, alreadyResponded: false, status: status })
}

// A5: 球员签到（旧接口，仅保留历史邀约兼容）
// 新邀约必须走 signInInvite：未报名不能签到，签到不再写成报名记录。
async function signIn(event) {
  const wxContext = cloud.getWXContext()
  const token = text(event.token)
  const userId = text(event.userId) || text(wxContext.OPENID)
  const userName = text(event.userName)
  const userPhone = text(event.userPhone)

  if (!token || !userId) return fail('INVALID_PARAM', '缺少签到凭证或用户标识')

  const inviteRes = await db.collection(INVITES_COLLECTION).where({ signinToken: token }).limit(1).get()
  if (!inviteRes.data.length) return fail('NOT_FOUND', '邀约不存在')
  const invite = inviteRes.data[0]
  if (inviteHasSignupData(invite)) return fail('SIGNUP_REQUIRED', '请先在邀约详情中报名，再由本人或发起方签到')
  if (invite.status !== 'open') return fail('CLOSED', '邀约已关闭')

  const existRes = await db.collection(RESPONSES_COLLECTION).where({ inviteId: invite._id, userId }).limit(1).get()
  if (existRes.data.length) return ok({ alreadySignedIn: true, responseId: existRes.data[0]._id })

  const addRes = await db.collection(RESPONSES_COLLECTION).add({
    data: {
      inviteId: invite._id, userId, userName, userPhone,
      respondedAt: new Date(), status: 'present'
    }
  })

  await db.collection(INVITES_COLLECTION).doc(invite._id).update({
    data: { signedInCount: _.inc(1) }
  })

  return ok({ responseId: addRes._id, alreadySignedIn: false })
}

// A6: 教练查看响应列表
// 2026-10-27 补齐鉴权：原来任何拿到 inviteId 的人都能读到全部响应（含手机号）与签到凭证；
// 现在只允许发起球队的所有者/有效成员读取，并剔除 signinToken / signinUrl / 手机号。
async function listSignins(event) {
  const inviteId = text(event.inviteId)
  if (!inviteId) return fail('INVALID_PARAM', '缺少邀约 ID')
  const caller = await resolveCallerIdentity()
  if (!caller.openid) return fail('UNAUTHORIZED', '请先登录')
  if (!caller.userId) return fail('UNAUTHORIZED', '请先完成手机号登录')
  const inviteRes = await db.collection(INVITES_COLLECTION).doc(inviteId).get().catch(() => null)
  if (!inviteRes || !inviteRes.data) return fail('NOT_FOUND', '邀约不存在')
  const invite = inviteRes.data
  const teamId = text(invite.teamId)
  if (!teamId) return fail('DATA_READ_FAILED', '邀约缺少发起球队，暂无法核对权限')
  if (!await callerBelongsToTeam(teamId, caller)) return fail('FORBIDDEN', '只有发起球队可以查看报名与响应')

  const signinRes = await db.collection(RESPONSES_COLLECTION)
    .where({ inviteId }).orderBy('respondedAt', 'asc').limit(100).get()
  const responses = ((signinRes && signinRes.data) || []).map(row => ({
    responseId: text(row._id),
    userName: text(row.userName),
    teamName: text(row.teamName),
    status: text(row.status),
    respondedAt: row.respondedAt || null
  }))

  const safeInvite = Object.assign({}, invite)
  delete safeInvite.signinToken
  delete safeInvite.signinUrl
  return ok({ invite: safeInvite, responses, total: responses.length })
}

// ======== 内部通知 ========

// 遍历球队球员推模板消息
async function notifyTeamPlayers(inviteId, record) {
  try {
    const teamPlayers = await db.collection(PLAYERS_COLLECTION)
      .where({ teamId: record.teamId, status: 'active' }).limit(50).get()

    const players = teamPlayers.data || []
    let sent = 0, failed = 0

    for (const p of players) {
      const userRes = await db.collection(USERS_COLLECTION).doc(p.playerId || p.userId).get().catch(() => null)
      const openid = (userRes && userRes.data && (userRes.data.wechatOpenId || userRes.data.openId)) || ''
      if (!openid) { failed++; continue }

      const battleCry = record.battleCry || {}
      const battleCryLine = (battleCry.lines && battleCry.lines[0]) || ''

      await sendTemplate(openid, CONFIG.inviteTemplateId, {
        first: { value: `「${record.teamName}」发起约球啦！`, color: '#2E7D32' },
        keyword1: { value: record.teamName },
        keyword2: { value: `${record.matchDate || ''} ${record.matchTime || ''}` },
        keyword3: { value: record.venue || '待教练确认' },
        keyword4: { value: battleCryLine || '点击进入查看战书' },
        remark: { value: '点击"详情"进入服务号应战 ›', color: '#888888' }
      }, record.signinUrl)

      sent++
      if (sent % 5 === 0) await new Promise(r => setTimeout(r, 500))
    }

    console.log(`[friendly] invite ${inviteId} notified team players: ${sent} sent, ${failed} skipped`)
  } catch (e) {
    console.warn('[friendly] notifyTeamPlayers error', e && e.message)
  }
}

// 对手接收/拒绝 → 通知发起方
async function notifyCreatorOfResponse(invite, status, opponentName) {
  try {
    if (!invite.createdByUserId) return
    const userRes = await db.collection(USERS_COLLECTION).doc(invite.createdByUserId).get().catch(() => null)
    const openid = (userRes && userRes.data && (userRes.data.wechatOpenId || userRes.data.openId)) || ''
    if (!openid) return

    const templateId = CONFIG.inviteTemplateId  // 复用同一个，或单独申请
    const firstText = status === 'accepted'
      ? `「${opponentName}」接收了战书！`
      : `「${opponentName}」无法应战`

    await sendTemplate(openid, templateId, {
      first: { value: firstText, color: status === 'accepted' ? '#2E7D32' : '#E53935' },
      keyword1: { value: invite.teamName || '我方' },
      keyword2: { value: `${invite.matchDate || ''} ${invite.matchTime || ''}` },
      keyword3: { value: opponentName },
      keyword4: { value: status === 'accepted' ? '建议开始准备场地 / 裁判' : '建议尽快找替补或取消' },
      remark: { value: '点击"详情"查看全部响应 ›', color: '#888888' }
    }, invite.signinUrl)

    console.log(`[friendly] creator notified: invite=${invite._id} status=${status} opponent=${opponentName}`)
  } catch (e) {
    console.warn('[friendly] notifyCreator error', e && e.message)
  }
}

// ======== 快捷发起比赛（群报名主流程）========

// 集合不存在时创建（已存在则忽略报错）
async function ensureCollection(name) {
  try { await db.createCollection(name) } catch (e) { /* already exists */ }
}

// B1: 快捷创建比赛 → 生成群报名卡片所需 token
// 鉴权：只允许球队管理者创建；可选 inviteId 关联已有邀约（不重复建活动）。
async function quickCreateMatch(event) {
  const caller = await resolveCallerIdentity()
  if (!caller.openid) return fail('UNAUTHORIZED', '请先登录后再创建比赛')
  if (!caller.userId) return fail('UNAUTHORIZED', '请先完成手机号登录后再创建比赛')

  const teamId = text(event.teamId)
  if (!teamId) return fail('INVALID_PARAM', '缺少球队信息')
  if (!await callerManagesTeam(teamId, caller)) return fail('FORBIDDEN', '只有球队管理者可以创建比赛')

  const venue = text(event.venue)
  const matchDate = text(event.matchDate)
  if (!matchDate) return fail('INVALID_PARAM', '请选择比赛日期')
  if (!venue) return fail('INVALID_PARAM', '请填写场地')

  const team = await readDoc('teams', teamId)
  const teamName = text((team && (team.name || team.teamName)) || event.teamName)
  if (!teamName) return fail('INVALID_DATA', '球队名称为空，请先完善球队资料')

  const inviteId = text(event.inviteId)
  if (inviteId) {
    const invite = await readDoc(INVITES_COLLECTION, inviteId)
    if (!invite) return fail('NOT_FOUND', '关联邀约不存在或已取消')
    if (text(invite.teamId) !== teamId) return fail('FORBIDDEN', '只能关联本队发起的邀约')
    if (text(invite.matchId)) return fail('CONFLICT', '该邀约已关联比赛记录')
  }

  const signupToken = randomToken(32)
  await ensureCollection(MATCHES_COLLECTION)
  const record = {
    teamId, teamName,
    createdByUserId: caller.userId,
    createdByOpenId: caller.openid,
    inviteId,
    opponentName: text(event.opponentName),
    matchDate, matchTime: text(event.matchTime), venue,
    venueAddress: text(event.venueAddress),
    latitude: Number(event.latitude) || 0,
    longitude: Number(event.longitude) || 0,
    maxPlayers: Math.min(60, Math.max(2, Number(event.maxPlayers) || 22)),
    status: 'signup',            // signup → upcoming → finished
    signupToken,
    signedUpCount: 0,
    createdAt: new Date()
  }

  try {
    const matchId = await db.runTransaction(async transaction => {
      // 关联关系只由服务端写入：邀约是活动权威记录，matchId 指向独立比赛记录
      if (inviteId) {
        const fresh = await readTxDoc(transaction, INVITES_COLLECTION, inviteId)
        if (!fresh) throw businessError('NOT_FOUND', '关联邀约不存在或已取消')
        if (text(fresh.matchId)) throw businessError('CONFLICT', '该邀约已关联比赛记录')
      }
      const addRes = await transaction.collection(MATCHES_COLLECTION).add({ data: record })
      const newMatchId = text(addRes && addRes._id)
      if (inviteId) {
        await transaction.collection(INVITES_COLLECTION).doc(inviteId).update({
          data: { matchId: newMatchId, updatedAt: new Date() }
        })
      }
      return newMatchId
    })
    if (!matchId) return fail('DATA_WRITE_FAILED', '比赛创建失败，请重试')
    return ok({ matchId, signupToken, inviteId })
  } catch (error) {
    return translateActionError(error)
  }
}

// B2: 群友查看比赛详情（凭 token 防枚举）
async function getMatch(event) {
  const matchId = text(event.matchId)
  const token = text(event.token)
  if (!matchId) return fail('INVALID_PARAM', '缺少比赛 ID')

  const res = await db.collection(MATCHES_COLLECTION).doc(matchId).get().catch(() => null)
  if (!res || !res.data) return fail('NOT_FOUND', '比赛不存在或已过期')
  const m = res.data
  if (token && m.signupToken !== token) return fail('FORBIDDEN', '报名链接无效')

  return ok({
    teamName: m.teamName,
    opponentName: m.opponentName,
    matchDate: m.matchDate,
    matchTime: m.matchTime,
    venue: m.venue,
    maxPlayers: m.maxPlayers,
    signedUpCount: m.signedUpCount || 0,
    status: m.status
  })
}

// B3: 群友报名（同手机号防重复 + 满员校验，事务内完成计数，避免并发超额）
async function signUpForMatch(event) {
  const matchId = text(event.matchId)
  const token = text(event.token)
  const userName = text(event.userName)
  const userPhone = text(event.userPhone).replace(/\s/g, '')

  if (!matchId || !userName || !userPhone) return fail('INVALID_PARAM', '请填写姓名和手机号')
  if (!/^1\d{10}$/.test(userPhone)) return fail('INVALID_PARAM', '手机号格式不对')

  await ensureCollection(SIGNUPS_COLLECTION)
  // 历史数据可能没有确定性 _id，先做一次只读命中；新记录由事务内的确定性 _id 保证唯一
  const legacy = await db.collection(SIGNUPS_COLLECTION)
    .where({ matchId, userPhone }).limit(1).get().catch(() => null)
  if (legacy && legacy.data && legacy.data.length) {
    return ok({ alreadySignedUp: true, signupId: text(legacy.data[0]._id) })
  }

  const signupId = matchSignupDocId(matchId, userPhone)
  try {
    const result = await db.runTransaction(async transaction => {
      const m = await readTxDoc(transaction, MATCHES_COLLECTION, matchId)
      if (!m) throw businessError('NOT_FOUND', '比赛不存在或已过期')
      if (token && text(m.signupToken) !== token) throw businessError('FORBIDDEN', '报名链接无效')
      if (text(m.status) !== 'signup') throw businessError('CLOSED', '报名已截止')

      const existing = await readTxDoc(transaction, SIGNUPS_COLLECTION, signupId)
      if (existing) return { alreadySignedUp: true, signupId }

      const maxPlayers = Number(m.maxPlayers) || 0
      const signedUpCount = Number(m.signedUpCount) || 0
      if (maxPlayers > 0 && signedUpCount >= maxPlayers) throw businessError('FULL', '报名人数已满')

      const now = new Date()
      await transaction.collection(SIGNUPS_COLLECTION).doc(signupId).set({
        data: { matchId, userName, userPhone, status: 'signed_up', signedUpAt: now, createdAt: now }
      })
      await transaction.collection(MATCHES_COLLECTION).doc(matchId).update({
        data: { signedUpCount: signedUpCount + 1, updatedAt: now }
      })
      return { alreadySignedUp: false, signupId, signedUpCount: signedUpCount + 1 }
    })
    return ok({
      signupId: result.signupId,
      alreadySignedUp: result.alreadySignedUp,
      signedUpCount: result.signedUpCount
    })
  } catch (error) {
    return translateActionError(error)
  }
}

// ======== 友谊赛记录：删除 / 转入本队正式战绩 ========
// 身份口径：记录由小程序客户端写入时带 _openid，优先按 _openid 校验归属；
// 兼容云函数写入的历史记录，按 users 的 openId 映射到 recordedByUserId 校验。
async function resolveCallerIdentity() {
  const openid = text(cloud.getWXContext().OPENID)
  if (!openid) return { openid: '', userId: '' }
  const res = await db.collection(USERS_COLLECTION)
    .where(_.or([{ openId: openid }, { openid: openid }, { _openid: openid }]))
    .limit(1).get().catch(() => null)
  const user = res && res.data && res.data[0]
  return { openid, userId: text(user && user._id) }
}

async function loadOwnedFriendly(matchId) {
  const res = await db.collection(MATCHES_COLLECTION).doc(matchId).get().catch(() => null)
  const row = res && res.data
  if (!row) return { error: fail('NOT_FOUND', '这场记录不存在或已被删除') }
  const caller = await resolveCallerIdentity()
  if (!caller.openid) return { error: fail('UNAUTHORIZED', '请先完成登录') }
  const ownerOpenId = text(row._openid)
  const owned = ownerOpenId
    ? ownerOpenId === caller.openid
    : (Boolean(caller.userId) && text(row.recordedByUserId) === caller.userId)
  if (!owned) return { error: fail('FORBIDDEN', '只能操作自己记录的场次') }
  return { row, caller }
}

async function deleteFriendlyMatch(event) {
  const matchId = text(event.matchId)
  if (!matchId) return fail('INVALID_PARAM', '缺少比赛 ID')
  const loaded = await loadOwnedFriendly(matchId)
  if (loaded.error) return loaded.error
  await db.collection(MATCHES_COLLECTION).doc(matchId).remove()
  return ok({ matchId, deleted: true })
}

// 转入正式 = 计入本队正式战绩口径（isOfficial:true），仍留在 friendly_matches，
// 不写 matches / 赛事 / 数据中心，因此不影响官方赛事排名与榜单。
async function promoteFriendlyMatch(event) {
  const matchId = text(event.matchId)
  if (!matchId) return fail('INVALID_PARAM', '缺少比赛 ID')
  const loaded = await loadOwnedFriendly(matchId)
  if (loaded.error) return loaded.error
  const row = loaded.row
  if (!text(row.teamId)) return fail('INVALID_DATA', '这场记录没有关联球队，无法转入正式战绩')
  if (text(row.status) !== 'finished') return fail('INVALID_DATA', '只有已结束的场次可以转入正式战绩')
  if (row.isOfficial === true) return ok({ matchId, alreadyOfficial: true })
  await db.collection(MATCHES_COLLECTION).doc(matchId).update({
    data: {
      isOfficial: true,
      officialSource: 'team_manual',
      officialByUserId: loaded.caller.userId || '',
      officialAt: db.serverDate(),
      updateTime: db.serverDate()
    }
  })
  return ok({ matchId, isOfficial: true })
}

// 球队详情「约球数据」：只统计已结束场次，按本队视角取比分；isOfficial 表示已计入本队正式战绩
// 只返回聚合数量（无球员姓名、无对手名），并要求调用者属于该球队（所有者或有效成员关系）。
async function callerBelongsToTeam(teamId, caller) {
  const userRes = await db.collection(USERS_COLLECTION).doc(caller.userId).get().catch(() => null)
  const user = userRes && userRes.data
  if (!user) return false
  const identities = new Set([user._id, user.phone, user.phoneNumber, user.openId, user.openid, user.wechatOpenId, caller.openid]
    .map(value => text(value)).filter(Boolean))
  const teamRes = await db.collection('teams').doc(teamId).get().catch(() => null)
  const team = teamRes && teamRes.data
  if (!team) return false
  const ownerHit = [team.ownerId, team.ownerUserId, team.claimedByUserId]
    .some(value => Boolean(text(value)) && identities.has(text(value)))
  if (ownerHit) return true
  const memberRes = await db.collection('team_memberships').where({ teamId }).limit(50).get().catch(() => null)
  const members = (memberRes && memberRes.data) || []
  return members.some(row => {
    const status = text(row.status || 'active').toLowerCase()
    if (['active', 'accepted', 'claimed'].indexOf(status) < 0) return false
    return identities.has(text(row.userId)) || identities.has(text(row.memberUserId)) ||
      identities.has(text(row.phone)) || identities.has(text(row.phoneNumber))
  })
}

// 球队管理授权：所有者字段，或成员关系中明确带 team.manage 权限 / 管理角色。
// 创建邀约、查看报名名单、代签只认这一条；普通成员身份不足以放行。
async function callerManagesTeam(teamId, caller) {
  const targetTeamId = text(teamId)
  if (!targetTeamId || !caller || !caller.userId) return false
  const userRes = await db.collection(USERS_COLLECTION).doc(caller.userId).get().catch(() => null)
  const user = userRes && userRes.data
  if (!user) return false

  const identities = new Set([
    user._id, user.uid, user.userId, user.phone, user.phoneNumber,
    user.openId, user.openid, user.wechatOpenId, caller.openid
  ].map(value => text(value)).filter(Boolean))

  const teamRes = await db.collection('teams').doc(targetTeamId).get().catch(() => null)
  const team = teamRes && teamRes.data
  // 刻意不采纳 creatorId：主办方预建但无人认领的占位球队不能成为管理依据
  if (!team) return false
  const ownerHit = [team.ownerId, team.ownerUserId, team.claimedByUserId]
    .some(value => Boolean(text(value)) && identities.has(text(value)))
  if (ownerHit) return true

  const memberRes = await db.collection('team_memberships').where({ teamId: targetTeamId }).limit(50).get().catch(() => null)
  const members = (memberRes && memberRes.data) || []
  return members.some(row => {
    const status = text(row.status || 'active').toLowerCase()
    if (['active', 'accepted', 'claimed'].indexOf(status) < 0) return false
    const identityHit = identities.has(text(row.userId)) || identities.has(text(row.memberUserId)) ||
      identities.has(text(row.phone)) || identities.has(text(row.phoneNumber))
    if (!identityHit) return false
    if (Array.isArray(row.permissions) && row.permissions.length) return row.permissions.indexOf('team.manage') >= 0
    return (Array.isArray(row.roles) ? row.roles : [row.role])
      .some(role => ['owner', 'team_manager', 'manager', 'coach', 'admin'].indexOf(text(role).toLowerCase()) >= 0)
  })
}

// 本队约球邀约列表：只允许该队所有者或有效成员读取最近邀约。
// 邀约原本靠签到海报在微信群传播，这里不扩大为全平台公开撮合；
// 返回字段必须脱敏，绝不带出 signinToken / signinUrl。
async function listTeamInvites(event) {
  const teamId = text(event.teamId)
  if (!teamId) return fail('INVALID_PARAM', '缺少球队信息')
  const caller = await resolveCallerIdentity()
  if (!caller.openid) return fail('UNAUTHORIZED', '请先登录')
  if (!caller.userId) return fail('UNAUTHORIZED', '请先完成手机号登录')
  if (!await callerBelongsToTeam(teamId, caller)) return fail('FORBIDDEN', '没有查看该球队邀约的权限')

  const limit = Math.min(50, Math.max(1, Number(event.limit) || 30))
  let rows = []
  try {
    // 按 teamId 单字段读取（单字段索引自动生效），再在函数内按创建时间倒序截取，
    // 避免因缺少 teamId+createdAt 复合索引导致列表不可用
    const res = await db.collection(INVITES_COLLECTION)
      .where({ teamId })
      .limit(50)
      .get()
    rows = ((res && res.data) || [])
      .map(row => ({ row, stamp: Number(new Date(row.createdAt || 0)) || 0 }))
      .sort((a, b) => b.stamp - a.stamp)
      .slice(0, limit)
      .map(item => item.row)
  } catch (error) {
    if (!/collection.*not exist|ns does not exist|NamespaceNotFound/i.test(String(error && error.message || ''))) {
      return fail('DATA_READ_FAILED', '邀约列表读取失败，请重试')
    }
  }

  const teamRes = await db.collection('teams').doc(teamId).get().catch(() => null)
  const team = (teamRes && teamRes.data) || null
  const teamLogo = team
    ? text(team.logoTransparentFileId || team.logoTransparentUrl || team.logoFileId || team.logoUrl || team.logo)
    : ''

  const invites = rows.map(row => {
    const counts = inviteCounts(row)
    return {
      inviteId: text(row._id),
      matchDate: text(row.matchDate),
      matchTime: text(row.matchTime),
      venue: text(row.venue),
      venueAddress: text(row.venueAddress),
      maxPlayers: counts.maxPlayers,
      // 个人报名计数：历史邀约没有 signupSchema 时 signupCount 为 null，页面显示“待确认”
      signupCount: counts.signupCount,
      signupHomeCount: counts.signupHomeCount,
      signupAwayCount: counts.signupAwayCount,
      presentCount: counts.presentCount,
      hasSignupData: counts.hasSignupData,
      // 旧签到数单独保留，只用于历史邀约说明，不参与报名与满员判断
      signedInCount: counts.legacySignedInCount,
      deadline: text(row.deadline),
      status: text(row.status) || 'open',
      signupWindow: inviteSignupWindow(row, counts),
      matchId: text(row.matchId),
      battleCryText: text(row.battleCry && row.battleCry.text),
      // 跨队应战计数（2026-10-27 公开约球）：发起方据此判断是否有人应战，不含具体账号
      acceptedCount: counts.acceptedCount,
      createdAt: row.createdAt || null
    }
  })

  return ok({
    teamId,
    teamName: text((team && (team.name || team.teamName)) || (rows[0] && rows[0].teamName)),
    teamLogo,
    total: invites.length,
    invites
  })
}

// 截止时间按 Asia/Shanghai（UTC+8）解析，与小程序 discover-model 口径一致；
// 云端默认 UTC，直接用 new Date() 会把“当天 23:59 截止”判早 8 小时
function shanghaiEpoch(value) {
  const match = text(value).match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/)
  if (!match) return null
  const hour = match[4] === undefined ? 23 : Number(match[4])
  const minute = match[5] === undefined ? 59 : Number(match[5])
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), hour - 8, minute)
}

// 城市口径：同城只按发起主体（球队）登记城市比较，不用定位城市（定位需额外隐私声明）。
// 兼容“郑州市／郑州”这类差一个“市”字的登记差异，只做这一层归一，不改写原值。
function cityKey(value) {
  return text(value).replace(/\s/g, '').replace(/市$/, '')
}

function teamCityOf(team) {
  if (!team) return ''
  return text(team.cityName || team.city || (team.registrationRegion || {}).cityName)
}

function teamLogoOf(team) {
  if (!team) return ''
  return text(team.logoTransparentFileId || team.logoTransparentUrl || team.logoFileId || team.logoUrl || team.logo)
}

// 批量取球队展示字段（分批 20 个，避免 _.in 过长）
async function loadTeamBriefs(teamIds) {
  const map = {}
  const list = Array.from(new Set((teamIds || []).map(text).filter(Boolean)))
  for (let i = 0; i < list.length; i += 20) {
    const chunk = list.slice(i, i + 20)
    const res = await db.collection('teams').where({ _id: _.in(chunk) }).limit(20).get().catch(() => null)
    ;((res && res.data) || []).forEach(team => { map[text(team._id)] = team })
  }
  return map
}

// 跨队公开约球列表（2026-10-27 用户确认公开）：只读、脱敏。
// 只列 status=open 且未过截止时间的邀约；不返回 signinToken / signinUrl / 手机号 / 创建人账号，
// 也不返回精确地址文本，避免公开列表成为联系方式与凭证的泄露面。
async function listPublicInvites(event) {
  const caller = await resolveCallerIdentity()
  // 公开浏览只要求小程序上下文有 openid（游客也能看），不要求完成手机号登录
  if (!caller.openid) return fail('UNAUTHORIZED', '请先进入小程序后再浏览公开约球')

  const wantCity = cityKey(event.city)
  const limit = Math.min(30, Math.max(1, Number(event.limit) || 10))
  const offset = Math.max(0, Number(event.offset) || 0)
  // 单字段 status 查询避免复合索引依赖；扫描上限内按创建时间倒序切片
  const SCAN_LIMIT = 100
  let rows = []
  let scanLimited = false
  try {
    const res = await db.collection(INVITES_COLLECTION)
      .where({ status: 'open' })
      .limit(SCAN_LIMIT)
      .get()
    rows = (res && res.data) || []
    scanLimited = rows.length >= SCAN_LIMIT
  } catch (error) {
    if (!/collection.*not exist|ns does not exist|NamespaceNotFound/i.test(String(error && error.message || ''))) {
      return fail('DATA_READ_FAILED', '公开约球读取失败，请重试')
    }
  }

  const now = Date.now()
  const open = rows.filter(row => {
    const epoch = shanghaiEpoch(row.deadline)
    return epoch === null || epoch >= now
  })

  const teamMap = await loadTeamBriefs(open.map(row => text(row.teamId)))
  const scoped = wantCity
    ? open.filter(row => cityKey(teamCityOf(teamMap[text(row.teamId)])) === wantCity)
    : open

  const sorted = scoped
    .map(row => ({ row, stamp: Number(new Date(row.createdAt || 0)) || 0 }))
    .sort((a, b) => b.stamp - a.stamp)
    .map(item => item.row)

  const page = sorted.slice(offset, offset + limit).map(row => {
    const team = teamMap[text(row.teamId)] || null
    const counts = inviteCounts(row)
    return {
      inviteId: text(row._id),
      teamId: text(row.teamId),
      teamName: text((team && (team.name || team.teamName)) || row.teamName),
      teamLogo: teamLogoOf(team),
      teamCity: teamCityOf(team),
      matchDate: text(row.matchDate),
      matchTime: text(row.matchTime),
      venue: text(row.venue),
      // 公开列表只给场地名，不给详细地址
      maxPlayers: counts.maxPlayers,
      signupCount: counts.signupCount,
      signupHomeCount: counts.signupHomeCount,
      signupAwayCount: counts.signupAwayCount,
      presentCount: counts.presentCount,
      hasSignupData: counts.hasSignupData,
      signedInCount: counts.legacySignedInCount,
      deadline: text(row.deadline),
      status: text(row.status) || 'open',
      signupWindow: inviteSignupWindow(row, counts),
      matchId: text(row.matchId),
      battleCryText: text(row.battleCry && row.battleCry.text),
      createdAt: row.createdAt || null
    }
  })

  return ok({
    city: wantCity,
    total: sorted.length,
    offset,
    hasMore: offset + page.length < sorted.length,
    scanLimited,
    invites: page
  })
}

// 跨队应战（公开约球列表点「应战」）：沿用现有 H5 应战语义，只写「应战意向」，
// 允许多队同时应战、由发起方决定，不自动锁定比赛；同一球队对同一邀约只写一次。
async function respondPublicInvite(event) {
  const inviteId = text(event.inviteId)
  const teamId = text(event.teamId)
  if (!inviteId || !teamId) return fail('INVALID_PARAM', '缺少邀约或球队信息')
  const caller = await resolveCallerIdentity()
  if (!caller.openid) return fail('UNAUTHORIZED', '请先登录')
  if (!caller.userId) return fail('UNAUTHORIZED', '请先完成手机号登录')
  if (!await callerBelongsToTeam(teamId, caller)) return fail('FORBIDDEN', '只有本队成员可以代表球队应战')

  const inviteRes = await db.collection(INVITES_COLLECTION).doc(inviteId).get().catch(() => null)
  const invite = inviteRes && inviteRes.data
  if (!invite) return fail('NOT_FOUND', '邀约不存在或已取消')
  if (text(invite.status) !== 'open') return fail('CLOSED', '该邀约已关闭')
  const deadline = shanghaiEpoch(invite.deadline)
  if (deadline !== null && deadline < Date.now()) return fail('CLOSED', '该邀约已过报名截止时间')
  if (text(invite.teamId) === teamId) return fail('INVALID_PARAM', '不能应战本队发起的邀约')

  // 幂等：按 inviteId 读取后在函数内比对 teamId，避免新增复合索引
  const exist = await db.collection(RESPONSES_COLLECTION).where({ inviteId }).limit(50).get().catch(() => null)
  const mine = ((exist && exist.data) || []).find(row => text(row.teamId) === teamId)
  if (mine) return ok({ alreadyResponded: true, responseId: text(mine._id), status: text(mine.status) || 'accepted' })

  const teamRes = await db.collection('teams').doc(teamId).get().catch(() => null)
  const team = (teamRes && teamRes.data) || null
  const teamName = text((team && (team.name || team.teamName)) || event.teamName) || '对方球队'

  const addRes = await db.collection(RESPONSES_COLLECTION).add({
    data: {
      inviteId,
      teamId,
      userId: caller.userId,
      userName: '',
      teamName,
      status: 'accepted',
      source: 'public_list',
      respondedAt: new Date()
    }
  })
  await db.collection(INVITES_COLLECTION).doc(inviteId).update({
    data: {
      acceptedCount: _.inc(1),
      lastResponseAt: new Date(),
      lastResponseStatus: 'accepted',
      lastRespondedBy: teamName
    }
  })
  setTimeout(() => notifyCreatorOfResponse(invite, 'accepted', teamName).catch(e => console.warn('[friendly] notify creator fail', e && e.message)), 0)

  return ok({ responseId: addRes._id, alreadyResponded: false, status: 'accepted' })
}

async function teamFriendlyStats(event) {
  const teamId = text(event.teamId)
  if (!teamId) return fail('INVALID_PARAM', '缺少球队信息')
  const caller = await resolveCallerIdentity()
  if (!caller.openid) return fail('UNAUTHORIZED', '请先登录')
  if (!caller.userId) return fail('UNAUTHORIZED', '请先完成手机号登录')
  if (!await callerBelongsToTeam(teamId, caller)) return fail('FORBIDDEN', '没有查看该球队约球数据的权限')

  try {
    const historyService = require('./data-center/team-history.cjs')
    const history = await historyService.readFriendlyTeamHistory(db, teamId)
    return ok({ stats:historyService.legacyFriendlyStats(history),history,coverage:history.lifetime.coverage,dataVersion:history.dataVersion })
  } catch (error) {
    return fail(error.code || 'DATA_READ_FAILED',error.message || '约球数据读取失败，请重试')
  }
}

// ===== 球队主场（可主动维护 1~N 个，支持设默认） =====
// 存 teams.homeVenues 数组：每个 { id, name, address, latitude, longitude, isDefault, createdAt }
// 发起邀约/比赛时优先展示已保存主场，一键带出坐标
async function upsertTeamVenue(event) {
  const { teamId, venueId, name, address = '', latitude = 0, longitude = 0, isDefault = false } = event
  if (!teamId) return fail('INVALID_PARAM', '缺少球队信息')
  if (!text(name)) return fail('INVALID_PARAM', '场地名称不能为空')
  if (text(name).length > 30) return fail('INVALID_PARAM', '场地名称过长')
  const caller = await resolveCallerIdentity()
  if (!caller.openid) return fail('UNAUTHORIZED', '请先登录')
  if (!caller.userId || !await callerBelongsToTeam(teamId, caller)) return fail('FORBIDDEN', '没有权限管理该球队主场')

  const teamRef = db.collection('teams').doc(teamId)
  const teamDoc = await teamRef.get().catch(() => null)
  if (!teamDoc || !teamDoc.data) return fail('NOT_FOUND', '球队不存在')
  const current = Array.isArray(teamDoc.data.homeVenues) ? teamDoc.data.homeVenues.slice() : []

  if (text(venueId)) {
    // 更新
    const idx = current.findIndex(v => v && v.id === venueId)
    if (idx < 0) return fail('NOT_FOUND', '主场不存在')
    current[idx] = {
      ...current[idx],
      name: text(name),
      address: text(address),
      latitude: Number(latitude) || 0,
      longitude: Number(longitude) || 0
    }
  } else {
    // 新增（最多 8 个）
    if (current.length >= 8) return fail('LIMIT', '最多保存 8 个主场')
    current.push({
      id: randomToken(12),
      name: text(name),
      address: text(address),
      latitude: Number(latitude) || 0,
      longitude: Number(longitude) || 0,
      isDefault: false,
      createdAt: new Date()
    })
  }

  // 设默认时清掉其他 default
  const targetId = text(venueId) || current[current.length - 1].id
  const finalList = current.map(v => ({ ...v, isDefault: v.id === targetId ? Boolean(isDefault) : (v.isDefault && v.id !== targetId) }))
  // 兜底：没有任何默认就把第一个设为默认
  if (!finalList.some(v => v.isDefault) && finalList.length > 0) finalList[0].isDefault = true

  await teamRef.update({ data: { homeVenues: finalList } })
  return ok({ venues: finalList })
}

async function deleteTeamVenue(event) {
  const { teamId, venueId } = event
  if (!teamId || !text(venueId)) return fail('INVALID_PARAM', '参数缺失')
  const caller = await resolveCallerIdentity()
  if (!caller.userId || !await callerBelongsToTeam(teamId, caller)) return fail('FORBIDDEN', '没有权限')

  const teamRef = db.collection('teams').doc(teamId)
  const teamDoc = await teamRef.get().catch(() => null)
  if (!teamDoc || !teamDoc.data) return fail('NOT_FOUND', '球队不存在')
  const current = Array.isArray(teamDoc.data.homeVenues) ? teamDoc.data.homeVenues : []

  const remaining = current.filter(v => v && v.id !== venueId)
  // 兜底：删了默认项就把第一个设为默认
  if (remaining.length > 0 && !remaining.some(v => v.isDefault)) remaining[0].isDefault = true

  await teamRef.update({ data: { homeVenues: remaining } })
  return ok({ venues: remaining })
}

async function setDefaultTeamVenue(event) {
  const { teamId, venueId } = event
  if (!teamId || !text(venueId)) return fail('INVALID_PARAM', '参数缺失')
  const caller = await resolveCallerIdentity()
  if (!caller.userId || !await callerBelongsToTeam(teamId, caller)) return fail('FORBIDDEN', '没有权限')

  const teamRef = db.collection('teams').doc(teamId)
  const teamDoc = await teamRef.get().catch(() => null)
  if (!teamDoc || !teamDoc.data) return fail('NOT_FOUND', '球队不存在')
  const current = Array.isArray(teamDoc.data.homeVenues) ? teamDoc.data.homeVenues : []
  if (!current.some(v => v.id === venueId)) return fail('NOT_FOUND', '主场不存在')

  const finalList = current.map(v => ({ ...v, isDefault: v.id === venueId }))
  await teamRef.update({ data: { homeVenues: finalList } })
  return ok({ venues: finalList })
}

// ===== 常用场地记忆（升级：先读球队已保存主场，再从历史派生补齐） =====
async function listTeamVenues(event) {
  const teamId = text(event.teamId)
  if (!teamId) return fail('INVALID_PARAM', '缺少球队信息')
  const caller = await resolveCallerIdentity()
  if (!caller.openid) return fail('UNAUTHORIZED', '请先登录')
  if (!caller.userId || !await callerBelongsToTeam(teamId, caller)) return fail('FORBIDDEN', '没有查看该球队场地的权限')

  // 1. 先读球队主动保存的主场（按默认优先、创建时间降序）
  const teamDoc = await db.collection('teams').doc(teamId).get().catch(() => null)
  const savedVenues = []
  if (teamDoc && teamDoc.data && Array.isArray(teamDoc.data.homeVenues)) {
    savedVenues.push(...teamDoc.data.homeVenues.filter(v => v && text(v.name)).map(v => ({
      id: v.id,
      name: text(v.name),
      address: text(v.address),
      latitude: Number(v.latitude) || 0,
      longitude: Number(v.longitude) || 0,
      hasLocation: Boolean(Number(v.latitude) && Number(v.longitude)),
      isDefault: Boolean(v.isDefault),
      saved: true
    })))
    savedVenues.sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0))
  }

  // 2. 再从历史邀约/比赛派生，补足「没存过但用过」的场地
  const fields = { venue: true, venueAddress: true, latitude: true, longitude: true, createdAt: true }
  const [inviteRes, matchRes] = await Promise.all([
    db.collection(INVITES_COLLECTION).where({ teamId }).field(fields).orderBy('createdAt', 'desc').limit(40).get().catch(() => ({ data: [] })),
    db.collection(MATCHES_COLLECTION).where({ teamId }).field(fields).orderBy('createdAt', 'desc').limit(40).get().catch(() => ({ data: [] }))
  ])
  const rows = [...((inviteRes && inviteRes.data) || []), ...((matchRes && matchRes.data) || [])]
  rows.sort((a, b) => {
    const ta = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt || 0).getTime() || 0
    const tb = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt || 0).getTime() || 0
    return tb - ta
  })
  const savedKeys = new Set(savedVenues.map(v => v.name + '|' + v.latitude + '|' + v.longitude))
  const derived = []
  for (const row of rows) {
    const name = text(row.venue)
    if (!name) continue
    const latitude = Number(row.latitude) || 0
    const longitude = Number(row.longitude) || 0
    const key = name + '|' + latitude + '|' + longitude
    if (savedKeys.has(key)) continue
    derived.push({
      name, address: text(row.venueAddress),
      latitude, longitude,
      hasLocation: Boolean(latitude && longitude),
      saved: false
    })
    if (derived.length + savedVenues.length >= 6) break
  }

  const venues = [...savedVenues, ...derived]
  return ok({ venues })
}

// ======== 主入口 ========
exports.main = async (event, context) => {
  const action = text(event.action) || text(event.type)
  switch (action) {
    case 'generateBattleCry': return generateBattleCry(event)
    case 'createInvite': return createInvite(event)
    case 'getInvite': return getInvite(event)
    case 'getInviteDetail': return getInviteDetail(event)
    case 'signUpForInvite': return signUpForInvite(event)
    case 'cancelInviteSignup': return cancelInviteSignup(event)
    case 'signInInvite': return signInInvite(event)
    case 'manualSignInInvite': return manualSignInInvite(event)
    case 'listInviteSignups': return listInviteSignups(event)
    case 'respondInvite': return respondInvite(event)
    case 'signIn': return signIn(event)
    case 'listSignins': return listSignins(event)
    case 'quickCreateMatch': return quickCreateMatch(event)
    case 'getMatch': return getMatch(event)
    case 'signUpForMatch': return signUpForMatch(event)
    case 'generateMatchReport': return generateMatchReport(event)
    case 'generateReportBg': return generateReportBg(event)
    case 'deleteFriendlyMatch': return deleteFriendlyMatch(event)
    case 'promoteFriendlyMatch': return promoteFriendlyMatch(event)
    case 'listTeamInvites': return listTeamInvites(event)
    case 'listPublicInvites': return listPublicInvites(event)
    case 'respondPublicInvite': return respondPublicInvite(event)
    case 'teamFriendlyStats': return teamFriendlyStats(event)
    case 'listTeamVenues': return listTeamVenues(event)
    case 'upsertTeamVenue': return upsertTeamVenue(event)
    case 'deleteTeamVenue': return deleteTeamVenue(event)
    case 'setDefaultTeamVenue': return setDefaultTeamVenue(event)
    case 'healthCheck': return ok({ ok: true, version: '1.8.0', battleCryStyles: Object.keys(BATTLE_CRY_PRESETS), aiEnabled: typeof cloud.ai === 'function', aiModels: CONFIG.aiModels, aiImageModel: CONFIG.aiImageModel, configured: Boolean(CONFIG.bridgeUrl) })
    default: return fail('UNKNOWN_ACTION', `未知 action: ${action}`)
  }
}
