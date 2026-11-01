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

// ======== 工具函数 ========
function ok(data) { return { ok: true, data } }
function fail(code, message) { return { ok: false, code, message } }
function text(v) { return v == null ? '' : String(v).trim() }
function randomToken(len) {
  return crypto.randomBytes(24).toString('hex').slice(0, len || 32)
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

// A2: 教练创建约球邀约（含战书）
async function createInvite(event) {
  const wxContext = cloud.getWXContext()
  const userId = text(event.userId) || text(wxContext.OPENID)
  const {
    teamId, teamName,
    opponentName = '',
    matchDate = '', matchTime = '', venue = '',
    venueAddress = '', latitude = 0, longitude = 0,
    maxPlayers = 20,
    deadline = '',
    battleCry = null  // {style, text, lines} 或从 style 生成
  } = event

  if (!teamId || !teamName) return fail('INVALID_PARAM', '缺少球队信息')
  if (!matchDate) return fail('INVALID_PARAM', '请选择比赛日期')

  const signinToken = randomToken(32)
  const signinUrl = `${CONFIG.h5BaseUrl}friendly-signin.html?token=${signinToken}`

  // 战斗宣言：如果没传完整的 battleCry，就从 style 字段生成
  const when = [matchDate, matchTime].filter(Boolean).join(' ')
  let resolvedBattleCry = battleCry
  if (!resolvedBattleCry || !text(resolvedBattleCry.text)) {
    const style = text(event.battleCryStyle) || 'formal'
    resolvedBattleCry = formatBattleCry(style, teamName, opponentName, when)
  }

  const record = {
    teamId, teamName,
    createdByUserId: userId,
    opponentName, matchDate, matchTime, venue,
    venueAddress: text(venueAddress),
    latitude: Number(latitude) || 0,
    longitude: Number(longitude) || 0,
    maxPlayers: Math.min(50, Math.max(1, Number(maxPlayers) || 20)),
    deadline,
    status: 'open',
    signinToken,
    signinUrl,
    signedInCount: 0,
    battleCry: resolvedBattleCry,  // 新增：战书
    createdAt: new Date()
  }

  const addRes = await db.collection(INVITES_COLLECTION).add({ data: record })
  const inviteId = addRes._id

  setTimeout(() => notifyTeamPlayers(inviteId, record).catch(e => console.warn('[friendly] notify fail', e && e.message)), 0)

  return ok({ inviteId, signinUrl, signinToken, battleCry: resolvedBattleCry })
}

// A3: H5 拿邀约详情
async function getInvite(event) {
  const token = text(event.token)
  if (!token) return fail('INVALID_PARAM', '缺少签到凭证')
  const res = await db.collection(INVITES_COLLECTION).where({ signinToken: token }).limit(1).get()
  if (!res.data.length) return fail('NOT_FOUND', '邀约不存在或已过期')
  return ok(res.data[0])
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

// A5: 球员签到（保留旧接口，向后兼容）
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
async function quickCreateMatch(event) {
  const wxContext = cloud.getWXContext()
  const userId = text(event.userId) || text(wxContext.OPENID)
  const {
    teamId, teamName = '',
    opponentName = '',
    matchDate = '', matchTime = '', venue = '',
    venueAddress = '', latitude = 0, longitude = 0,
    maxPlayers = 22
  } = event

  if (!teamId) return fail('INVALID_PARAM', '缺少球队信息')
  if (!matchDate) return fail('INVALID_PARAM', '请选择比赛日期')
  if (!venue) return fail('INVALID_PARAM', '请填写场地')

  const signupToken = randomToken(32)
  await ensureCollection(MATCHES_COLLECTION)
  const record = {
    teamId, teamName,
    createdByUserId: userId,
    opponentName,
    matchDate, matchTime, venue,
    venueAddress: text(venueAddress),
    latitude: Number(latitude) || 0,
    longitude: Number(longitude) || 0,
    maxPlayers: Math.min(60, Math.max(2, Number(maxPlayers) || 22)),
    status: 'signup',            // signup → upcoming → finished
    signupToken,
    signedUpCount: 0,
    createdAt: new Date()
  }

  const addRes = await db.collection(MATCHES_COLLECTION).add({ data: record })
  return ok({ matchId: addRes._id, signupToken })
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

// B3: 群友报名（同手机号防重复 + 满员校验）
async function signUpForMatch(event) {
  const matchId = text(event.matchId)
  const token = text(event.token)
  const userName = text(event.userName)
  const userPhone = text(event.userPhone)

  if (!matchId || !userName || !userPhone) return fail('INVALID_PARAM', '请填写姓名和手机号')
  if (!/^1\d{10}$/.test(userPhone)) return fail('INVALID_PARAM', '手机号格式不对')

  const res = await db.collection(MATCHES_COLLECTION).doc(matchId).get().catch(() => null)
  if (!res || !res.data) return fail('NOT_FOUND', '比赛不存在或已过期')
  const m = res.data
  if (token && m.signupToken !== token) return fail('FORBIDDEN', '报名链接无效')
  if (m.status !== 'signup') return fail('CLOSED', '报名已截止')
  if ((m.signedUpCount || 0) >= (m.maxPlayers || 22)) return fail('FULL', '报名人数已满')

  await ensureCollection(SIGNUPS_COLLECTION)
  const dup = await db.collection(SIGNUPS_COLLECTION)
    .where({ matchId, userPhone }).limit(1).get()
  if (dup.data.length) return ok({ alreadySignedUp: true, signupId: dup.data[0]._id })

  const addRes = await db.collection(SIGNUPS_COLLECTION).add({
    data: {
      matchId,
      userName, userPhone,
      status: 'signed_up',       // signed_up → present / no_show
      signedUpAt: new Date()
    }
  })

  await db.collection(MATCHES_COLLECTION).doc(matchId).update({
    data: { signedUpCount: _.inc(1) }
  })

  return ok({ signupId: addRes._id, alreadySignedUp: false })
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

  const invites = rows.map(row => ({
    inviteId: text(row._id),
    matchDate: text(row.matchDate),
    matchTime: text(row.matchTime),
    venue: text(row.venue),
    venueAddress: text(row.venueAddress),
    maxPlayers: Number(row.maxPlayers) || 0,
    signedInCount: Number(row.signedInCount) || 0,
    deadline: text(row.deadline),
    status: text(row.status) || 'open',
    battleCryText: text(row.battleCry && row.battleCry.text),
    // 跨队应战计数（2026-10-27 公开约球）：发起方据此判断是否有人应战，不含具体账号
    acceptedCount: Number(row.acceptedCount) || 0,
    createdAt: row.createdAt || null
  }))

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
      maxPlayers: Number(row.maxPlayers) || 0,
      signedInCount: Number(row.signedInCount) || 0,
      deadline: text(row.deadline),
      status: text(row.status) || 'open',
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
    case 'healthCheck': return ok({ ok: true, version: '1.7.0', battleCryStyles: Object.keys(BATTLE_CRY_PRESETS), aiEnabled: typeof cloud.ai === 'function', aiModels: CONFIG.aiModels, aiImageModel: CONFIG.aiImageModel, configured: Boolean(CONFIG.bridgeUrl) })
    default: return fail('UNKNOWN_ACTION', `未知 action: ${action}`)
  }
}
