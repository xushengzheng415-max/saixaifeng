const cloud = require('wx-server-sdk')
const https = require('https')
const crypto = require('crypto')
// 服务号模板消息字段适配：每模板一张独立映射表（A 58013 成功通知 / B 58014 取消通知）
const templateFields = require('./template-fields.cjs')

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
  // 取消 / 流局用的第二个模板（58014「约球已取消通知」）
  cancelTemplateId: process.env.SXF_CANCEL_TEMPLATE_ID || '',
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

// ======== 约球口径与状态机（2026-11-02 用户确认）========
// 三个数字彻底拆开，互不代用：
//   报名数 signupCount   ：球员在 H5 填姓名 + 手机号
//   签到数 checkinCount  ：球队端管理页现场勾选（含代签）
//   应战数 acceptedCount ：对方球队点「接战」，响应记录带 teamId / teamName
// 状态机由服务端持有，前端只展示状态文案与 canSignUp 结果，不再自行推导：
//   open ──对方接战──▶ accepted ──发起方点成局──▶ confirmed
//   open / accepted / confirmed ──发起方取消──▶ cancelled（终态，必须通知已报名球员）
//   open / accepted / confirmed ──人工流局──▶ closed（终态）
var INVITE_STATE = { OPEN: 'open', ACCEPTED: 'accepted', CONFIRMED: 'confirmed', CANCELLED: 'cancelled', CLOSED: 'closed' }
var INVITE_STATE_TEXT = { open: '报名中', accepted: '已接战', confirmed: '已成局', cancelled: '已取消', closed: '已关闭' }
var SIGNUP_ACTIVE_STATES = [INVITE_STATE.OPEN, INVITE_STATE.ACCEPTED, INVITE_STATE.CONFIRMED]
var TERMINAL_STATES = [INVITE_STATE.CANCELLED, INVITE_STATE.CLOSED]
var RESPONSE_KIND = { TEAM: 'team', SIGNUP: 'signup' }
var SIGNUP_STATUS = { ACTIVE: 'signup', PRESENT: 'present', CANCELLED: 'cancelled', REMOVED: 'removed' }
var MANAGER_ROLES = ['owner', 'manager', 'coach', 'headcoach', 'head_coach', 'admin', 'captain', 'leader', 'organizer']

// healthCheck 暴露的 action 清单，便于线上发布后读回核对
var FRIENDLY_ACTIONS = [
  'generateBattleCry', 'createInvite', 'getInvite', 'respondInvite', 'signIn', 'listSignins',
  'quickCreateMatch', 'getMatch', 'signUpForMatch', 'generateMatchReport', 'generateReportBg',
  'deleteFriendlyMatch', 'promoteFriendlyMatch', 'listTeamInvites', 'listPublicInvites',
  'respondPublicInvite', 'teamFriendlyStats', 'listTeamVenues', 'upsertTeamVenue',
  'deleteTeamVenue', 'setDefaultTeamVenue',
  'signUpInvite', 'cancelInviteSignup', 'getMyInviteStatus', 'listInviteSignups',
  'checkInInviteSignup', 'proxyCheckInInvite', 'removeInviteSignup',
  'confirmInvite', 'cancelInvite', 'abandonInvite', 'remindInviteSignups',
  'healthCheck'
]

function inviteStatusOf(row) {
  return text(row && row.status) || INVITE_STATE.OPEN
}

function inviteStatusText(status) {
  return INVITE_STATE_TEXT[text(status)] || '状态待确认'
}

// 历史邀约没有该字段时不显示 0：返回 null，由页面显示「待确认」
function countOrNull(value) {
  return typeof value === 'number' && isFinite(value) ? value : null
}

function phoneDigits(value) {
  return text(value).replace(/\D/g, '')
}

function isMainlandPhone(value) {
  return /^1\d{10}$/.test(phoneDigits(value))
}

function maskPhone(value) {
  const digits = phoneDigits(value)
  if (digits.length !== 11) return ''
  return digits.slice(0, 3) + '****' + digits.slice(7)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
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

// 服务端统一计算邀约的报名可见状态：前端不再自行判断截止/满员/状态
function inviteSignupState(invite) {
  const status = inviteStatusOf(invite)
  const knownCount = typeof invite.signupCount === 'number' && invite.signupCountKnown !== false
  const signupCount = knownCount ? invite.signupCount : null
  const maxPlayers = Number(invite.maxPlayers) || 0
  const full = knownCount && maxPlayers > 0 && invite.signupCount >= maxPlayers
  const deadlineEpoch = shanghaiEpoch(invite.deadline)
  const expired = deadlineEpoch !== null && deadlineEpoch < Date.now()
  const stateAllowed = SIGNUP_ACTIVE_STATES.indexOf(status) >= 0
  const checkinKnown = typeof invite.checkinCount === 'number' && invite.checkinCountKnown !== false
  let closedReason = ''
  if (TERMINAL_STATES.indexOf(status) >= 0) closedReason = status === INVITE_STATE.CANCELLED ? '邀约已取消' : '邀约已关闭'
  else if (!stateAllowed) closedReason = '当前状态不可报名'
  else if (expired) closedReason = '已过报名截止时间'
  else if (full) closedReason = '报名人数已满'
  return {
    status,
    statusText: inviteStatusText(status),
    signupCount,
    signupCountKnown: knownCount,
    checkinCount: checkinKnown ? invite.checkinCount : null,
    checkinCountKnown: checkinKnown,
    acceptedCount: countOrNull(invite.acceptedCount),
    maxPlayers,
    deadline: text(invite.deadline),
    expired,
    full,
    terminal: TERMINAL_STATES.indexOf(status) >= 0,
    canSignUp: stateAllowed && !expired && !full,
    signupClosedReason: closedReason
  }
}

// 历史邀约缺计数时的处理（不得把缺失记成 0）：
// - 只读展示：signupCountKnown=false → 页面显示「待确认」
// - 首次写入且有完整响应行可核对（未触发 100 条扫描上限）时，按响应行重算并标记 known=true
async function ensureInviteCounters(invite, rows) {
  const patch = {}
  const signupUnknown = typeof invite.signupCount !== 'number' || invite.signupCountKnown === false
  const checkinUnknown = typeof invite.checkinCount !== 'number' || invite.checkinCountKnown === false
  const canRecount = Array.isArray(rows) && rows.length < 100
  if (signupUnknown) {
    patch.signupCount = canRecount ? activeSignupCount(rows) : (typeof invite.signupCount === 'number' ? invite.signupCount : 0)
    patch.signupCountKnown = canRecount
    if (canRecount) patch.signupCountSource = 'recount'
  }
  if (checkinUnknown) {
    patch.checkinCount = canRecount ? presentSignupCount(rows) : (typeof invite.checkinCount === 'number' ? invite.checkinCount : 0)
    patch.checkinCountKnown = canRecount
    if (canRecount) patch.checkinCountSource = 'recount'
  }
  if (typeof invite.acceptedCount !== 'number') patch.acceptedCount = 0
  if (!Object.keys(patch).length) return
  await db.collection(INVITES_COLLECTION).doc(invite._id).update({ data: patch }).catch(() => null)
  Object.assign(invite, patch)
}

async function loadInviteById(inviteId) {
  if (!text(inviteId)) return null
  const res = await db.collection(INVITES_COLLECTION).doc(text(inviteId)).get().catch(() => null)
  return (res && res.data) || null
}

// 历史邀约没有 status 字段：写操作前补成 open，避免条件更新（where status）匹配不到而误判失败
async function ensureInviteStatus(invite) {
  if (!invite || text(invite.status)) return
  await db.collection(INVITES_COLLECTION).doc(invite._id)
    .update({ data: { status: INVITE_STATE.OPEN, statusUpdatedAt: new Date(), statusSource: 'legacy_normalize' } })
    .catch(() => null)
  invite.status = INVITE_STATE.OPEN
}

async function loadInviteByToken(token) {
  if (!text(token)) return null
  const res = await db.collection(INVITES_COLLECTION).where({ signinToken: text(token) }).limit(1).get().catch(() => null)
  return (res && res.data && res.data[0]) || null
}

function userIdentitySet(user, openid) {
  return new Set([user && user._id, user && user.phone, user && user.phoneNumber, user && user.openId,
    user && user.openid, user && user.wechatOpenId, openid]
    .map(value => text(value)).filter(Boolean))
}

// 管理者判定：球队所有者 / 成员关系里的管理角色 / 球队尚未登记所有者时的历史成员兼容
async function resolveTeamManager(teamId, caller) {
  const targetTeamId = text(teamId)
  if (!targetTeamId) return { ok: false, code: 'INVALID_PARAM', message: '缺少球队信息' }
  const userRes = await db.collection(USERS_COLLECTION).doc(text(caller && caller.userId)).get().catch(() => null)
  const user = userRes && userRes.data
  if (!user) return { ok: false, code: 'UNAUTHORIZED', message: '请先完成手机号登录' }
  const identities = userIdentitySet(user, caller && caller.openid)
  const teamRes = await db.collection('teams').doc(targetTeamId).get().catch(() => null)
  const team = teamRes && teamRes.data
  if (!team) return { ok: false, code: 'NOT_FOUND', message: '球队不存在' }

  const ownerKeys = [team.ownerId, team.ownerUserId, team.claimedByUserId].map(value => text(value)).filter(Boolean)
  if (ownerKeys.some(key => identities.has(key))) return { ok: true, team, via: 'owner' }

  const memberRes = await db.collection('team_memberships').where({ teamId: targetTeamId }).limit(50).get().catch(() => null)
  const members = (memberRes && memberRes.data) || []
  const mine = members.filter(row => {
    const status = text(row.status || 'active').toLowerCase()
    if (['active', 'accepted', 'claimed'].indexOf(status) < 0) return false
    return identities.has(text(row.userId)) || identities.has(text(row.memberUserId)) ||
      identities.has(text(row.phone)) || identities.has(text(row.phoneNumber))
  })
  if (mine.length) {
    const managerHit = mine.some(row => {
      const role = text(row.role || row.memberRole || row.staffRole || row.position).toLowerCase()
      if (MANAGER_ROLES.indexOf(role) >= 0) return true
      return row.canManage === true || row.isManager === true || row.canWrite === true
    })
    if (managerHit) return { ok: true, team, via: 'membership' }
    // 兼容：球队尚未登记所有者时，历史有效成员关系暂按可管理处理（不扩大到读取其他球队）
    if (!ownerKeys.length) return { ok: true, team, via: 'legacy_member' }
  }
  return { ok: false, code: 'FORBIDDEN', message: '只有该队管理者可以操作约球' }
}

// 发起球队管理者才能管理这条邀约
async function assertInviteManager(invite, caller) {
  const teamId = text(invite && invite.teamId)
  if (!teamId) return { ok: false, result: fail('DATA_READ_FAILED', '邀约缺少发起球队，暂无法核对权限') }
  if (!caller || !caller.openid) return { ok: false, result: fail('UNAUTHORIZED', '请先登录') }
  if (!caller.userId) return { ok: false, result: fail('UNAUTHORIZED', '请先完成手机号登录') }
  const check = await resolveTeamManager(teamId, caller)
  if (!check.ok) return { ok: false, result: fail(check.code, check.message) }
  return { ok: true, team: check.team, via: check.via }
}

// 服务号模板消息只能发给“服务号”的 openid（公众号/小程序/网站应用的 openid 互不通用），
// 因此只认 users.serviceAccountOpenId / users.officialOpenId 与 service_identities.serviceAccountOpenId，
// 不再读 wechatOpenId / openId，避免把消息发到别的渠道或静默失败。
const SERVICE_IDENTITIES_COLLECTION = 'service_identities'

function serviceOpenidOfUser(user) {
  if (!user) return ''
  return text(user.serviceAccountOpenId || user.officialOpenId)
}

function phoneOfUser(user) {
  if (!user) return ''
  return phoneDigits(user.phone || user.phoneNumber)
}

async function serviceOpenidOfPhone(phone) {
  const digits = phoneDigits(phone)
  if (!digits) return ''
  const res = await db.collection(SERVICE_IDENTITIES_COLLECTION)
    .where({ phone: digits, phoneVerified: true }).limit(5).get().catch(() => null)
  const rows = (res && res.data) || []
  const hit = rows.find(row => text(row.serviceAccountOpenId))
  return text(hit && hit.serviceAccountOpenId)
}

async function resolveServiceOpenidByPhone(phone, userId) {
  const digits = phoneDigits(phone)
  if (digits) {
    for (const field of ['phone', 'phoneNumber']) {
      const res = await db.collection(USERS_COLLECTION).where({ [field]: digits }).limit(1).get().catch(() => null)
      const user = res && res.data && res.data[0]
      if (user) {
        const direct = serviceOpenidOfUser(user)
        if (direct) return direct
        break
      }
    }
    const fromIdentity = await serviceOpenidOfPhone(digits)
    if (fromIdentity) return fromIdentity
  }
  if (text(userId)) {
    const res = await db.collection(USERS_COLLECTION).doc(text(userId)).get().catch(() => null)
    return serviceOpenidOfUser(res && res.data)
  }
  return ''
}

// 参与人姓名：优先 users 里的真实姓名，取不到按“球队球员”兜底（不传空串）
function participantNameOf(user, fallback) {
  const name = text(user && (user.userName || user.name || user.realName || user.nickName))
  return name || text(fallback) || '球队球员'
}

async function loadSignupResponses(inviteId, limit) {
  const res = await db.collection(RESPONSES_COLLECTION).where({ inviteId }).limit(limit || 100).get().catch(() => null)
  const rows = ((res && res.data) || []).map(row => ({
    row,
    stamp: Number(new Date(row.createdAt || row.respondedAt || 0)) || 0
  }))
  rows.sort((a, b) => b.stamp - a.stamp)
  return rows.map(item => item.row)
}

// 响应行角色归一：历史行可能没有 kind，只能按旧 status 推断
// 旧 signIn 写 status=present 且无 kind → 报名；其余（accepted / rejected / pending）→ 队伍应战
function responseKindOf(row) {
  const kind = text(row && row.kind)
  if (kind) return kind
  const status = text(row && row.status).toLowerCase()
  if (['present', 'signup', 'signed', 'signedin', 'joined', 'registered'].indexOf(status) >= 0) {
    return RESPONSE_KIND.SIGNUP
  }
  return RESPONSE_KIND.TEAM
}

function isActiveSignup(row) {
  return responseKindOf(row) === RESPONSE_KIND.SIGNUP &&
    [SIGNUP_STATUS.ACTIVE, SIGNUP_STATUS.PRESENT].indexOf(text(row.status)) >= 0
}

// 报名数：只统计球员报名行（不含队伍应战行、已取消、已移除）
function activeSignupCount(rows) {
  return (Array.isArray(rows) ? rows : []).filter(isActiveSignup).length
}

// 签到数：只统计现场已签到行
function presentSignupCount(rows) {
  return (Array.isArray(rows) ? rows : []).filter(row =>
    responseKindOf(row) === RESPONSE_KIND.SIGNUP && text(row.status) === SIGNUP_STATUS.PRESENT).length
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

// 服务号模板消息发送
// 返回 { ok, skipped, reason, detail, msgid }：调用方只按 ok 计成功，
// 模板未配置 / 拿不到服务号 openid / 发送通道未配置 / 拿不到 access_token 一律算 skipped，
// 绝不把“没发出去”记成 sent。
async function sendTemplate(openid, templateId, data, pageUrl) {
  if (!templateId) return { ok: false, skipped: true, reason: 'template_missing' }
  if (!openid) return { ok: false, skipped: true, reason: 'openid_missing' }

  // 模板消息只认 url（网页跳转），page / miniprogram_state 是订阅消息字段，不能混用
  const message = {
    touser: openid, template_id: templateId, data: data, url: text(pageUrl)
  }

  if (CONFIG.bridgeUrl && CONFIG.bridgeSecret) {
    // 固定出口中转要求 { message: {...} } 包装（见 ops/wechat-football-bridge/server.js template/send）
    try {
      const result = await bridgePost('template/send', { message })
      if (result && result.success === true) return { ok: true, msgid: text(result.msgid), via: 'bridge' }
      return {
        ok: false, skipped: false, reason: 'bridge_rejected', via: 'bridge',
        detail: text(result && (result.message || result.errmsg || result.error))
      }
    } catch (error) {
      return { ok: false, skipped: false, reason: 'bridge_failed', via: 'bridge', detail: text(error && error.message) }
    }
  }

  const appId = process.env.SERVICE_ACCOUNT_APP_ID
  const appSecret = process.env.SERVICE_ACCOUNT_APP_SECRET
  if (!appId || !appSecret) return { ok: false, skipped: true, reason: 'channel_not_configured' }

  let token = ''
  try {
    const tokenRes = await httpsGet(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`)
    token = text(tokenRes && tokenRes.access_token)
  } catch (error) {
    token = ''
  }
  if (!token) return { ok: false, skipped: true, reason: 'access_token_missing' }

  try {
    const result = await httpsPost(`https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${token}`, message)
    if (result && !result.errcode) return { ok: true, msgid: text(result.msgid), via: 'direct' }
    return {
      ok: false, skipped: false, reason: 'wechat_error_' + text(result && result.errcode), via: 'direct',
      detail: text(result && result.errmsg)
    }
  } catch (error) {
    return { ok: false, skipped: false, reason: 'direct_failed', via: 'direct', detail: text(error && error.message) }
  }
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
// 2026-11-02：发起人必须是该队管理者（所有者或成员关系中的管理角色），不再接受任意 teamId。
async function createInvite(event) {
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

  const caller = await resolveCallerIdentity()
  if (!caller.openid) return fail('UNAUTHORIZED', '请先登录')
  if (!caller.userId) return fail('UNAUTHORIZED', '请先完成手机号登录')
  const manager = await resolveTeamManager(text(teamId), caller)
  if (!manager.ok) return fail(manager.code, manager.message)
  const userId = caller.userId

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
    teamId: text(teamId),
    teamName: text(teamName) || text(manager.team && (manager.team.name || manager.team.teamName)),
    createdByUserId: userId,
    opponentName, matchDate, matchTime, venue,
    venueAddress: text(venueAddress),
    latitude: Number(latitude) || 0,
    longitude: Number(longitude) || 0,
    maxPlayers: Math.min(50, Math.max(1, Number(maxPlayers) || 20)),
    deadline,
    status: INVITE_STATE.OPEN,
    statusUpdatedAt: new Date(),
    statusUpdatedBy: userId,
    signinToken,
    signinUrl,
    // 2026-11-02：三个数字拆开存储；signedInCount 仅保留历史兼容，不再写入新语义
    signupCount: 0,
    signupCountKnown: true,
    checkinCount: 0,
    checkinCountKnown: true,
    acceptedCount: 0,
    rejectedCount: 0,
    signedInCount: 0,
    battleCry: resolvedBattleCry,  // 新增：战书
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
    teamId: record.teamId,
    status: record.status,
    statusText: inviteStatusText(record.status),
    maxPlayers: record.maxPlayers,
    deadline: text(deadline)
  })
}

// A3: H5 拿邀约详情（按身份脱敏）
// 2026-11-02：默认只回报名方需要的白名单字段，绝不带 signinToken / signinUrl / 创建人；
// 只有发起球队管理者用 inviteId 读取时才补充分享链接与取消原因。
async function getInvite(event) {
  const token = text(event.token)
  const inviteId = text(event.inviteId)
  if (!token && !inviteId) return fail('INVALID_PARAM', '缺少邀约凭证')

  const invite = token ? await loadInviteByToken(token) : await loadInviteById(inviteId)
  if (!invite) return fail('NOT_FOUND', '邀约不存在或已过期')

  const caller = await resolveCallerIdentity().catch(() => ({ openid: '', userId: '' }))
  let managerView = false
  if (caller.userId && text(invite.teamId)) {
    const check = await resolveTeamManager(text(invite.teamId), caller).catch(() => ({ ok: false }))
    managerView = Boolean(check && check.ok)
  }

  const state = inviteSignupState(invite)
  const payload = {
    inviteId: text(invite._id),
    teamId: text(invite.teamId),
    teamName: text(invite.teamName),
    opponentName: text(invite.opponentName),
    matchDate: text(invite.matchDate),
    matchTime: text(invite.matchTime),
    venue: text(invite.venue),
    venueAddress: text(invite.venueAddress),
    latitude: Number(invite.latitude) || 0,
    longitude: Number(invite.longitude) || 0,
    battleCry: invite.battleCry || null,
    // 服务端算好的报名口径，前端不再自行推导截止/满员/状态
    status: state.status,
    statusText: state.statusText,
    signupCount: state.signupCount,
    signupCountKnown: state.signupCountKnown,
    checkinCount: state.checkinCount,
    checkinCountKnown: state.checkinCountKnown,
    acceptedCount: state.acceptedCount,
    maxPlayers: state.maxPlayers,
    deadline: state.deadline,
    expired: state.expired,
    full: state.full,
    terminal: state.terminal,
    canSignUp: state.canSignUp,
    signupClosedReason: state.signupClosedReason,
    managerView
  }

  if (managerView) {
    payload.signinToken = text(invite.signinToken)
    payload.signinUrl = text(invite.signinUrl)
    payload.createdByUserId = text(invite.createdByUserId)
    payload.cancelReason = text(invite.cancelReason)
    payload.statusUpdatedAt = invite.statusUpdatedAt || null
    payload.acceptedTeamId = text(invite.acceptedTeamId)
    payload.acceptedTeamName = text(invite.acceptedTeamName)
  }

  // 我的报名状态：H5 传手机号后返回，避免球员重复填表或不明状态
  const myPhone = phoneDigits(event.userPhone)
  if (myPhone && isMainlandPhone(myPhone)) {
    const rows = await loadSignupResponses(text(invite._id), 100)
    const mine = rows.find(row => text(row.kind) === RESPONSE_KIND.SIGNUP && phoneDigits(row.phoneKey) === myPhone)
    payload.mySignup = mine
      ? { signupId: text(mine._id), status: text(mine.status), statusText: signupStatusText(mine.status), side: text(mine.side) }
      : null
  }

  return ok(payload)
}

function signupStatusText(status) {
  const value = text(status)
  if (value === SIGNUP_STATUS.ACTIVE) return '已报名'
  if (value === SIGNUP_STATUS.PRESENT) return '已签到'
  if (value === SIGNUP_STATUS.CANCELLED) return '已取消报名'
  if (value === SIGNUP_STATUS.REMOVED) return '已被移出名单'
  return '未报名'
}

// A4: 对手响应战书（接战 / 无法应战）
// 2026-11-02：响应记录必须带队伍标识（teamId / teamName），kind='team'；
// 接战是成局入口之一 → open 时置 accepted，并把首个接战队伍写回邀约。
async function respondInvite(event) {
  const token = text(event.token)
  const status = text(event.status)  // 'accepted' | 'rejected'
  const opponentTeamId = text(event.teamId || event.opponentTeamId)
  const opponentTeamName = text(event.opponentTeamName) || text(event.teamName) || '对手'
  const wxContext = cloud.getWXContext()
  const opponentUserId = text(event.userId) || text(wxContext.OPENID)
  const opponentUserName = text(event.userName) || '对方球员'

  if (!token) return fail('INVALID_PARAM', '缺少战书凭证')
  if (status !== 'accepted' && status !== 'rejected') return fail('INVALID_PARAM', '状态非法，只能 accepted / rejected')

  const invite = await loadInviteByToken(token)
  if (!invite) return fail('NOT_FOUND', '战书不存在')
  const currentStatus = inviteStatusOf(invite)
  if (TERMINAL_STATES.indexOf(currentStatus) >= 0) return fail('CLOSED', '战书已关闭')

  // 幂等：同一对手（优先按 teamId，其次按 userId）不重复响应
  const existing = await loadSignupResponses(invite._id, 100)
  const mine = existing.find(row => {
    if (text(row.kind) !== RESPONSE_KIND.TEAM) return false
    if (opponentTeamId) return text(row.teamId) === opponentTeamId
    return text(row.userId) === opponentUserId
  })
  if (mine && text(mine.status) === status) {
    return ok({ alreadyResponded: true, responseId: text(mine._id), status })
  }

  let responseId = ''
  if (mine) {
    await db.collection(RESPONSES_COLLECTION).doc(mine._id).update({
      data: { status, teamId: opponentTeamId, teamName: opponentTeamName, kind: RESPONSE_KIND.TEAM, respondedAt: new Date() }
    })
    responseId = text(mine._id)
  } else {
    const addRes = await db.collection(RESPONSES_COLLECTION).add({
      data: {
        inviteId: invite._id,
        userId: opponentUserId,
        userName: opponentUserName,
        // 队伍标识（2026-11-02 口径）：teamId 来自小程序/H5 传入，teamName 用于展示
        teamId: opponentTeamId,
        teamName: opponentTeamName,
        kind: RESPONSE_KIND.TEAM,
        status,
        respondedAt: new Date(),
        createdAt: new Date()
      }
    })
    responseId = text(addRes._id)
  }

  const updateData = {
    lastResponseAt: new Date(),
    lastResponseStatus: status,
    lastRespondedBy: opponentTeamName
  }
  if (status === 'accepted') {
    updateData.acceptedCount = _.inc(1)
    // 接战即成局入口：open → accepted，首个接战队伍写回邀约，供管理页展示
    if (currentStatus === INVITE_STATE.OPEN) {
      updateData.status = INVITE_STATE.ACCEPTED
      updateData.statusUpdatedAt = new Date()
      updateData.statusUpdatedBy = opponentUserId
    }
    if (!text(invite.acceptedTeamId)) {
      updateData.acceptedTeamId = opponentTeamId
      updateData.acceptedTeamName = opponentTeamName
    }
  }
  if (status === 'rejected') updateData.rejectedCount = _.inc(1)
  await db.collection(INVITES_COLLECTION).doc(invite._id).update({ data: updateData })

  // 推通知给发起方（异步）
  setTimeout(() => notifyCreatorOfResponse(invite, status, opponentTeamName).catch(e => console.warn('[friendly] notify creator fail', e && e.message)), 0)

  return ok({ responseId, alreadyResponded: false, status, inviteStatus: status === 'accepted' && currentStatus === INVITE_STATE.OPEN ? INVITE_STATE.ACCEPTED : currentStatus })
}

// A5: 球员签到（旧接口，保留向后兼容）
// 2026-11-02：旧接口视为「报名并到场」，写入 kind=signup / status=present，
// 同时受截止、状态、满员与幂等约束；新链路请用 signUpInvite + checkInInviteSignup。
async function signIn(event) {
  const wxContext = cloud.getWXContext()
  const token = text(event.token)
  const userId = text(event.userId) || text(wxContext.OPENID)
  const userName = text(event.userName) || '球员'
  const userPhone = text(event.userPhone)
  const phoneKey = phoneDigits(userPhone)

  if (!token || !userId) return fail('INVALID_PARAM', '缺少签到凭证或用户标识')

  const invite = await loadInviteByToken(token)
  if (!invite) return fail('NOT_FOUND', '邀约不存在')
  await ensureInviteStatus(invite)
  const state = inviteSignupState(invite)
  if (TERMINAL_STATES.indexOf(state.status) >= 0) return fail('CLOSED', state.signupClosedReason || '邀约已关闭')
  if (state.expired) return fail('CLOSED', '已过报名截止时间')
  if (state.full) return fail('FULL', '报名人数已满')

  const rows = await loadSignupResponses(invite._id, 100)
  const mine = rows.find(row => {
    const sameKind = [RESPONSE_KIND.SIGNUP, ''].indexOf(text(row.kind)) >= 0
    if (!sameKind) return false
    if (userId && text(row.userId) === userId) return true
    return Boolean(phoneKey) && phoneDigits(row.phoneKey) === phoneKey
  })
  if (mine && [SIGNUP_STATUS.ACTIVE, SIGNUP_STATUS.PRESENT].indexOf(text(mine.status)) >= 0) {
    return ok({ alreadySignedIn: true, responseId: text(mine._id), status: text(mine.status) })
  }

  await ensureInviteCounters(invite, rows)
  const addRes = await db.collection(RESPONSES_COLLECTION).add({
    data: {
      inviteId: invite._id,
      userId, userName,
      userPhone: phoneKey ? maskPhone(phoneKey) : '',
      phoneKey,
      teamId: '',
      teamName: '',
      kind: RESPONSE_KIND.SIGNUP,
      side: text(event.side) || 'own',
      status: SIGNUP_STATUS.PRESENT,
      source: 'legacy_sign_in',
      checkedInAt: new Date(),
      createdAt: new Date(),
      respondedAt: new Date()
    }
  })

  const guard = await db.collection(INVITES_COLLECTION)
    .where({ _id: invite._id, signupCount: _.lt(Number(invite.maxPlayers) || 50), status: _.in(SIGNUP_ACTIVE_STATES) })
    .update({ data: { signupCount: _.inc(1), checkinCount: _.inc(1), signedInCount: _.inc(1) } })
  if (!guard || !guard.stats || guard.stats.updated !== 1) {
    await db.collection(RESPONSES_COLLECTION).doc(addRes._id).remove().catch(() => null)
    return fail('FULL', '报名人数已满')
  }

  return ok({ responseId: addRes._id, alreadySignedIn: false, status: SIGNUP_STATUS.PRESENT })
}

// A6: 教练查看报名与响应（旧接口，保留向后兼容）
// 2026-11-02：鉴权改由 assertInviteManager（发起球队管理者）统一校验，
// 返回仍按旧字段，但不含 signinToken / signinUrl / 手机号原文；需要新口径请用 listInviteSignups。
async function listSignins(event) {
  const inviteId = text(event.inviteId)
  if (!inviteId) return fail('INVALID_PARAM', '缺少邀约 ID')
  const caller = await resolveCallerIdentity()
  const invite = await loadInviteById(inviteId)
  if (!invite) return fail('NOT_FOUND', '邀约不存在')
  const permission = await assertInviteManager(invite, caller)
  if (!permission.ok) return permission.result

  const rows = await loadSignupResponses(invite._id, 100)
  const responses = rows.map(row => ({
    responseId: text(row._id),
    userName: text(row.userName),
    teamName: text(row.teamName),
    kind: responseKindOf(row),
    side: text(row.side),
    status: text(row.status),
    statusText: signupStatusText(row.status),
    respondedAt: row.respondedAt || null
  }))

  const safeInvite = Object.assign({}, invite)
  delete safeInvite.signinToken
  delete safeInvite.signinUrl
  return ok({ invite: safeInvite, responses, total: responses.length })
}

// ======== 内部通知 ========

// 模板 ID 来源（与 template-fields 的 envKeys 对应，不在这里出现字段键名）
// A(success) ← SXF_INVITE_TEMPLATE_ID / SXF_SIGNIN_TEMPLATE_ID（旧名保留兼容，两个都允许指向同一模板）
// B(cancel)  ← SXF_CANCEL_TEMPLATE_ID；未配置时按语义回落到 A，字段映射同步切回 A（thing6 不会发给 A 模板）
const TEMPLATE_ID_BY_KEY = {
  success: [CONFIG.inviteTemplateId, CONFIG.signinTemplateId],
  cancel: [CONFIG.cancelTemplateId]
}

// 通知场景 → 模板路由：显式表驱动
//   confirmed / reminder / invite（发起约球）/ response（接战拒战）→ A 58013「约球成功通知」
//   cancelled / closed（流局）→ B 58014「约球已取消通知」
const NOTIFY_SCENE = {
  invite: { templateKey: 'success' },
  response: { templateKey: 'success' },
  confirmed: { templateKey: 'success' },
  reminder: { templateKey: 'success' },
  cancelled: { templateKey: 'cancel' },
  closed: { templateKey: 'cancel' }
}

function resolveNotifyTemplate(sceneKey) {
  const scene = NOTIFY_SCENE[text(sceneKey)] || NOTIFY_SCENE.invite
  const def = templateFields.templateDef(scene.templateKey)
  if (!def) return { templateKey: '', templateId: '', def: null, configured: false, fallback: false }
  const ids = TEMPLATE_ID_BY_KEY[def.key] || []
  const direct = text(ids.find(item => text(item)))
  if (direct) return { templateKey: def.key, templateId: direct, def, configured: true, fallback: false }
  const fallbackKey = text(def.fallbackKey)
  const fallbackDef = fallbackKey ? templateFields.templateDef(fallbackKey) : null
  const fallbackId = fallbackDef
    ? text((TEMPLATE_ID_BY_KEY[fallbackDef.key] || []).find(item => text(item)))
    : ''
  if (fallbackDef && fallbackId) {
    return {
      templateKey: fallbackDef.key, templateId: fallbackId, def: fallbackDef,
      configured: true, fallback: true, requestedTemplateKey: def.key
    }
  }
  return { templateKey: def.key, templateId: '', def, configured: false, fallback: false }
}

function notifyStats(kind, route, total) {
  return {
    kind,
    total: Number(total) || 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    templateKey: route.templateKey,
    templateTitle: route.def ? route.def.title : '',
    templateId: route.templateId,
    templateConfigured: Boolean(route.configured),
    templateFallback: Boolean(route.fallback),
    requestedTemplateKey: text(route.requestedTemplateKey) || route.templateKey,
    skippedReason: ''
  }
}

// thing1 = 状态语义句；取消 / 流局 / 提醒的原因优先并入 thing1，
// 超 20 字只保留状态句（B 模板没有独立原因位），被截掉的原因回传给调用方便于排查
function notifyStatusName(kind, invite, reason) {
  const team = text(invite && invite.teamName) || '我方'
  const base = {
    cancelled: `「${team}」约球已取消`,
    closed: `「${team}」约球已流局`,
    confirmed: `「${team}」约球已成局`,
    reminder: `「${team}」约球开赛提醒`
  }[kind] || '约球通知'
  const note = text(reason)
  const mergeable = ['cancelled', 'closed', 'reminder'].indexOf(text(kind)) >= 0
  if (!note || !mergeable) return { name: templateFields.clipThing(base), reason: note, reasonClipped: false }
  const joined = base + '·' + note
  if (Array.from(joined.replace(/\s+/g, ' ')).length <= templateFields.THING_MAX) {
    return { name: joined, reason: note, reasonClipped: false }
  }
  return { name: templateFields.clipThing(base), reason: note, reasonClipped: true }
}

// 报名行接收人：按 userId → phoneKey 顺序解析服务号 openid 与姓名
async function resolveSignupRecipient(row) {
  let user = null
  if (text(row.userId)) {
    const res = await db.collection(USERS_COLLECTION).doc(text(row.userId)).get().catch(() => null)
    user = (res && res.data) || null
  }
  const phone = text(row.phoneKey) || text(row.userPhone)
  const openid = serviceOpenidOfUser(user) || await resolveServiceOpenidByPhone(phone, text(row.userId))
  return { user, openid }
}

// 遍历球队球员推模板消息（发起约球，走 A 模板）
async function notifyTeamPlayers(inviteId, record) {
  const route = resolveNotifyTemplate('invite')
  const stats = notifyStats('invite', route, 0)
  try {
    if (!route.templateId) { stats.skippedReason = 'template_missing'; return stats }
    const timeInfo = templateFields.formatInviteTime(record.matchDate, record.matchTime)
    if (!timeInfo.ok) {
      stats.skippedReason = timeInfo.reason || 'invalid_time'
      console.warn(`[friendly] invite ${inviteId} notify skipped: ${stats.skippedReason}`)
      return stats
    }

    const teamPlayers = await db.collection(PLAYERS_COLLECTION)
      .where({ teamId: record.teamId, status: 'active' }).limit(50).get()

    const players = (teamPlayers && teamPlayers.data) || []
    stats.total = players.length

    for (const p of players) {
      const userRes = await db.collection(USERS_COLLECTION).doc(text(p.playerId || p.userId)).get().catch(() => null)
      const user = (userRes && userRes.data) || null
      const openid = serviceOpenidOfUser(user) || await serviceOpenidOfPhone(phoneOfUser(user))

      const data = templateFields.buildDataForTemplate(route.templateKey, {
        name: '发起约球·' + (text(record.opponentName) || '对手'),
        time: timeInfo.value,
        venue: text(record.venue) || '待确认',
        organizer: text(record.teamName) || '我方',
        participant: participantNameOf(user)
      })
      const result = await sendTemplate(openid, route.templateId, data, record.signinUrl)
      if (result.ok) {
        stats.sent += 1
        if (stats.sent % 5 === 0) await sleep(500)
      } else if (result.skipped) {
        stats.skipped += 1
        stats.skippedReason = stats.skippedReason || result.reason
      } else {
        stats.failed += 1
        stats.skippedReason = stats.skippedReason || result.reason
      }
    }
  } catch (e) {
    stats.skippedReason = 'error'
    console.warn('[friendly] notifyTeamPlayers error', e && e.message)
  }
  console.log(`[friendly] invite ${inviteId} notify players: ${stats.sent} sent, ${stats.skipped} skipped, ${stats.failed} failed`)
  return stats
}

// 对手接战 / 拒战 → 通知发起人（走 A 模板）
async function notifyCreatorOfResponse(invite, status, opponentName) {
  const route = resolveNotifyTemplate('response')
  const stats = notifyStats('response', route, 0)
  try {
    if (!route.templateId) { stats.skippedReason = 'template_missing'; return stats }
    if (!invite || !invite.createdByUserId) { stats.skippedReason = 'creator_missing'; return stats }
    const timeInfo = templateFields.formatInviteTime(invite.matchDate, invite.matchTime)
    if (!timeInfo.ok) { stats.skippedReason = timeInfo.reason || 'invalid_time'; return stats }

    const userRes = await db.collection(USERS_COLLECTION).doc(text(invite.createdByUserId)).get().catch(() => null)
    const user = (userRes && userRes.data) || null
    const openid = serviceOpenidOfUser(user) || await serviceOpenidOfPhone(phoneOfUser(user))
    stats.total = 1

    const accepted = text(status) === 'accepted'
    const data = templateFields.buildDataForTemplate(route.templateKey, {
      name: (accepted ? '已接战：' : '已拒战：') + (text(opponentName) || '对手'),
      time: timeInfo.value,
      venue: text(invite.venue) || '待确认',
      organizer: text(invite.teamName) || '我方',
      participant: participantNameOf(user)
    })
    const result = await sendTemplate(openid, route.templateId, data, text(invite.signinUrl))
    if (result.ok) stats.sent = 1
    else if (result.skipped) { stats.skipped = 1; stats.skippedReason = result.reason }
    else { stats.failed = 1; stats.skippedReason = result.reason }
  } catch (e) {
    stats.skippedReason = 'error'
    console.warn('[friendly] notifyCreator error', e && e.message)
  }
  console.log(`[friendly] creator notify: invite=${text(invite && invite._id)} status=${text(status)} sent=${stats.sent} skipped=${stats.skipped} failed=${stats.failed}`)
  return stats
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

  const invites = rows.map(row => {
    const state = inviteSignupState(row)
    return {
      inviteId: text(row._id),
      matchDate: text(row.matchDate),
      matchTime: text(row.matchTime),
      venue: text(row.venue),
      venueAddress: text(row.venueAddress),
      maxPlayers: state.maxPlayers,
      // 三个数字拆开：报名 / 签到 / 应战；历史缺字段时为 null，页面显示「待确认」
      signupCount: state.signupCount,
      signupCountKnown: state.signupCountKnown,
      checkinCount: state.checkinCount,
      acceptedCount: state.acceptedCount,
      // 历史兼容字段，不再代表报名数
      signedInCount: Number(row.signedInCount) || 0,
      deadline: state.deadline,
      status: state.status,
      statusText: state.statusText,
      canSignUp: state.canSignUp,
      signupClosedReason: state.signupClosedReason,
      battleCryText: text(row.battleCry && row.battleCry.text),
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
// 2026-11-02：已接战（accepted）仍留在公开列表，后续球队可继续应战，由发起方决定；
// 不返回 signinToken / signinUrl / 手机号 / 创建人账号，也不返回精确地址文本。
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
      .where({ status: _.in([INVITE_STATE.OPEN, INVITE_STATE.ACCEPTED]) })
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
    const state = inviteSignupState(row)
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
      maxPlayers: state.maxPlayers,
      signupCount: state.signupCount,
      signupCountKnown: state.signupCountKnown,
      deadline: state.deadline,
      status: state.status,
      statusText: state.statusText,
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
  const currentStatus = inviteStatusOf(invite)
  // 已接战（accepted）仍接受后续球队应战，终态（cancelled / closed）不再接受
  if (TERMINAL_STATES.indexOf(currentStatus) >= 0) return fail('CLOSED', '该邀约已关闭')
  const deadline = shanghaiEpoch(invite.deadline)
  if (deadline !== null && deadline < Date.now()) return fail('CLOSED', '该邀约已过报名截止时间')
  if (text(invite.teamId) === teamId) return fail('INVALID_PARAM', '不能应战本队发起的邀约')

  // 幂等：按 inviteId 读取后在函数内比对 teamId，避免新增复合索引
  const existing = await loadSignupResponses(invite._id, 100)
  const mine = existing.find(row => text(row.kind) === RESPONSE_KIND.TEAM && text(row.teamId) === teamId)
  if (mine) return ok({ alreadyResponded: true, responseId: text(mine._id), status: text(mine.status) || 'accepted' })

  const teamRes = await db.collection('teams').doc(teamId).get().catch(() => null)
  const team = (teamRes && teamRes.data) || null
  const teamName = text((team && (team.name || team.teamName)) || event.teamName) || '对方球队'

  const addRes = await db.collection(RESPONSES_COLLECTION).add({
    data: {
      inviteId,
      // 队伍标识（2026-11-02 口径）：应战方必须有 teamId + teamName
      teamId,
      teamName,
      userId: caller.userId,
      userName: '',
      kind: RESPONSE_KIND.TEAM,
      status: 'accepted',
      source: 'public_list',
      respondedAt: new Date(),
      createdAt: new Date()
    }
  })
  const updateData = {
    acceptedCount: _.inc(1),
    lastResponseAt: new Date(),
    lastResponseStatus: 'accepted',
    lastRespondedBy: teamName
  }
  // 接战即为成局入口之一：open → accepted，并记录首个接战队伍
  if (currentStatus === INVITE_STATE.OPEN) {
    updateData.status = INVITE_STATE.ACCEPTED
    updateData.statusUpdatedAt = new Date()
    updateData.statusUpdatedBy = caller.userId
  }
  if (!text(invite.acceptedTeamId)) {
    updateData.acceptedTeamId = teamId
    updateData.acceptedTeamName = teamName
  }
  await db.collection(INVITES_COLLECTION).doc(inviteId).update({ data: updateData })
  setTimeout(() => notifyCreatorOfResponse(invite, 'accepted', teamName).catch(e => console.warn('[friendly] notify creator fail', e && e.message)), 0)

  return ok({
    responseId: addRes._id,
    alreadyResponded: false,
    status: 'accepted',
    inviteStatus: currentStatus === INVITE_STATE.OPEN ? INVITE_STATE.ACCEPTED : currentStatus
  })
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

// ======== 报名 / 签到 / 名单（2026-11-02 用户确认口径）========

// 报名相关通知：成局 / 开赛前提醒走 A 模板，取消 / 流局走 B 模板
// thing1 承载状态语义（必要时并入原因），thing4 发起球队，参与人 / 报名人按模板各自映射
async function notifyInviteSignups(invite, kind, reason) {
  const route = resolveNotifyTemplate(kind)
  const status = notifyStatusName(kind, invite, reason)
  const rows = await loadSignupResponses(invite._id, 100)
  const targets = rows.filter(isActiveSignup)
  const stats = notifyStats(kind, route, targets.length)
  stats.statusName = status.name
  stats.reason = status.reason
  stats.reasonClipped = status.reasonClipped

  // 模板未配置 / 时间格式不合法一律跳过并记录原因，绝不发脏数据，也不把未发送算成 sent
  if (!route.templateId) {
    stats.skipped = targets.length
    stats.skippedReason = 'template_missing'
    console.log(`[friendly] notify signups invite=${text(invite._id)} kind=${kind} template missing, skipped ${stats.skipped}`)
    return stats
  }
  const timeInfo = templateFields.formatInviteTime(invite.matchDate, invite.matchTime)
  if (!timeInfo.ok) {
    stats.skipped = targets.length
    stats.skippedReason = timeInfo.reason || 'invalid_time'
    console.log(`[friendly] notify signups invite=${text(invite._id)} kind=${kind} skipped: ${stats.skippedReason}`)
    return stats
  }

  for (const row of targets) {
    const recipient = await resolveSignupRecipient(row)
    // B 模板的 thing6 是「报名人」：报名行自带姓名优先，其次 users 档案，最后用模板兜底文案
    const participant = text(row.userName) || participantNameOf(recipient.user, '')
    const data = templateFields.buildDataForTemplate(route.templateKey, {
      name: status.name,
      time: timeInfo.value,
      venue: text(invite.venue) || '待确认',
      organizer: text(invite.teamName) || '我方',
      participant
    })
    const result = await sendTemplate(recipient.openid, route.templateId, data, text(invite.signinUrl))
    if (result.ok) {
      stats.sent += 1
      if (stats.sent % 5 === 0) await sleep(300)
      continue
    }
    if (result.skipped) stats.skipped += 1
    else stats.failed += 1
    stats.skippedReason = stats.skippedReason || result.reason
  }
  console.log(`[friendly] notify signups invite=${text(invite._id)} kind=${kind} template=${stats.templateKey} sent=${stats.sent} skipped=${stats.skipped} failed=${stats.failed}`)
  return stats
}

// 球员在 H5 报名：姓名 + 手机号必填，按手机号幂等；最后一席用条件更新防超卖
async function signUpInvite(event) {
  const token = text(event.token)
  const inviteId = text(event.inviteId)
  const userName = text(event.userName).slice(0, 20)
  const userPhone = phoneDigits(event.userPhone)
  const side = text(event.side) === 'opponent' ? 'opponent' : 'own'

  if (!token && !inviteId) return fail('INVALID_PARAM', '缺少邀约凭证')
  if (!userName) return fail('INVALID_PARAM', '请填写姓名')
  if (!isMainlandPhone(userPhone)) return fail('INVALID_PARAM', '请填写正确的 11 位手机号')

  const invite = token ? await loadInviteByToken(token) : await loadInviteById(inviteId)
  if (!invite) return fail('NOT_FOUND', '邀约不存在或已取消')
  await ensureInviteStatus(invite)

  const state = inviteSignupState(invite)
  if (TERMINAL_STATES.indexOf(state.status) >= 0) return fail('CLOSED', state.signupClosedReason || '当前不可报名')
  if (state.expired) return fail('CLOSED', '已过报名截止时间')
  if (state.full) return fail('FULL', '报名人数已满')

  const rows = await loadSignupResponses(invite._id, 100)
  const mine = rows.find(row => text(row.kind) === RESPONSE_KIND.SIGNUP && phoneDigits(row.phoneKey) === userPhone)
  if (mine && [SIGNUP_STATUS.ACTIVE, SIGNUP_STATUS.PRESENT].indexOf(text(mine.status)) >= 0) {
    return ok({
      alreadySignedUp: true,
      signupId: text(mine._id),
      status: text(mine.status),
      statusText: signupStatusText(mine.status),
      signupCount: state.signupCount,
      signupCountKnown: state.signupCountKnown,
      maxPlayers: state.maxPlayers
    })
  }

  await ensureInviteCounters(invite, rows)
  const maxPlayers = Number(invite.maxPlayers) || 50
  const guard = await db.collection(INVITES_COLLECTION)
    .where({ _id: invite._id, status: _.in(SIGNUP_ACTIVE_STATES), signupCount: _.lt(maxPlayers) })
    .update({ data: { signupCount: _.inc(1), lastSignupAt: new Date() } })
  if (!guard || !guard.stats || guard.stats.updated !== 1) {
    return fail('FULL', '报名人数已满')
  }

  const payload = {
    inviteId: invite._id,
    userId: '',
    userName,
    userPhone: maskPhone(userPhone),
    phoneKey: userPhone,
    teamId: '',
    teamName: '',
    kind: RESPONSE_KIND.SIGNUP,
    side,
    status: SIGNUP_STATUS.ACTIVE,
    source: text(event.source) || 'h5_signup',
    createdAt: new Date(),
    respondedAt: new Date()
  }

  let signupId = ''
  try {
    if (mine) {
      await db.collection(RESPONSES_COLLECTION).doc(mine._id).update({
        data: {
          userName, userPhone: maskPhone(userPhone), phoneKey: userPhone, side,
          status: SIGNUP_STATUS.ACTIVE, source: text(event.source) || 'h5_signup',
          createdAt: new Date(), respondedAt: new Date(), cancelledAt: ''
        }
      })
      signupId = text(mine._id)
    } else {
      const addRes = await db.collection(RESPONSES_COLLECTION).add({ data: payload })
      signupId = text(addRes._id)
    }
  } catch (error) {
    // 写响应失败要回滚占位，避免名额被永久占用
    await db.collection(INVITES_COLLECTION).doc(invite._id).update({ data: { signupCount: _.inc(-1) } }).catch(() => null)
    return fail('DATA_WRITE_FAILED', '报名失败，请重试')
  }

  // 返回最新计数：条件更新后重新读一次，避免把本地旧值当结果回给前端
  const fresh = (await loadInviteById(invite._id)) || invite
  const latest = inviteSignupState(fresh)
  return ok({
    signupId,
    alreadySignedUp: false,
    status: SIGNUP_STATUS.ACTIVE,
    statusText: signupStatusText(SIGNUP_STATUS.ACTIVE),
    signupCount: latest.signupCount,
    signupCountKnown: latest.signupCountKnown,
    maxPlayers
  })
}

// 球员在 H5 取消报名：按手机号定位，释放名额
async function cancelInviteSignup(event) {
  const token = text(event.token)
  const inviteId = text(event.inviteId)
  const userPhone = phoneDigits(event.userPhone)
  if (!token && !inviteId) return fail('INVALID_PARAM', '缺少邀约凭证')
  if (!isMainlandPhone(userPhone)) return fail('INVALID_PARAM', '请填写报名时使用的手机号')

  const invite = token ? await loadInviteByToken(token) : await loadInviteById(inviteId)
  if (!invite) return fail('NOT_FOUND', '邀约不存在或已取消')

  const rows = await loadSignupResponses(invite._id, 100)
  const mine = rows.find(row => text(row.kind) === RESPONSE_KIND.SIGNUP && phoneDigits(row.phoneKey) === userPhone)
  if (!mine) return fail('NOT_FOUND', '没有找到这条报名记录')
  const currentStatus = text(mine.status)
  if (currentStatus === SIGNUP_STATUS.CANCELLED || currentStatus === SIGNUP_STATUS.REMOVED) {
    return ok({ signupId: text(mine._id), status: currentStatus, statusText: signupStatusText(currentStatus), already: true })
  }

  await db.collection(RESPONSES_COLLECTION).doc(mine._id).update({
    data: { status: SIGNUP_STATUS.CANCELLED, cancelledAt: new Date(), cancelReason: text(event.reason).slice(0, 40) }
  })
  if (currentStatus === SIGNUP_STATUS.ACTIVE || currentStatus === SIGNUP_STATUS.PRESENT) {
    const updated = await db.collection(INVITES_COLLECTION)
      .where({ _id: invite._id, signupCount: _.gt(0) })
      .update({ data: { signupCount: _.inc(-1) } })
    if (currentStatus === SIGNUP_STATUS.PRESENT) {
      await db.collection(INVITES_COLLECTION)
        .where({ _id: invite._id, checkinCount: _.gt(0) })
        .update({ data: { checkinCount: _.inc(-1) } })
    }
    if (!updated || !updated.stats || updated.stats.updated !== 1) {
      console.warn('[friendly] cancel signup count guard miss invite=' + text(invite._id))
    }
  }

  const fresh = (await loadInviteById(invite._id)) || invite
  const state = inviteSignupState(fresh)
  return ok({
    signupId: text(mine._id),
    status: SIGNUP_STATUS.CANCELLED,
    statusText: signupStatusText(SIGNUP_STATUS.CANCELLED),
    signupCount: state.signupCount,
    signupCountKnown: state.signupCountKnown
  })
}

// H5 查看自己的报名状态
async function getMyInviteStatus(event) {
  const token = text(event.token)
  const inviteId = text(event.inviteId)
  const userPhone = phoneDigits(event.userPhone)
  if (!token && !inviteId) return fail('INVALID_PARAM', '缺少邀约凭证')
  if (!isMainlandPhone(userPhone)) return fail('INVALID_PARAM', '请填写报名时使用的手机号')
  const invite = token ? await loadInviteByToken(token) : await loadInviteById(inviteId)
  if (!invite) return fail('NOT_FOUND', '邀约不存在或已取消')
  const rows = await loadSignupResponses(invite._id, 100)
  const mine = rows.find(row => text(row.kind) === RESPONSE_KIND.SIGNUP && phoneDigits(row.phoneKey) === userPhone)
  const state = inviteSignupState(invite)
  return ok({
    inviteId: text(invite._id),
    teamName: text(invite.teamName),
    matchDate: text(invite.matchDate),
    matchTime: text(invite.matchTime),
    venue: text(invite.venue),
    status: state.status,
    statusText: state.statusText,
    canSignUp: state.canSignUp,
    signupClosedReason: state.signupClosedReason,
    signupCount: state.signupCount,
    signupCountKnown: state.signupCountKnown,
    maxPlayers: state.maxPlayers,
    deadline: state.deadline,
    mySignup: mine
      ? {
        signupId: text(mine._id),
        userName: text(mine.userName),
        side: text(mine.side),
        status: text(mine.status),
        statusText: signupStatusText(mine.status),
        canCancel: [SIGNUP_STATUS.ACTIVE, SIGNUP_STATUS.PRESENT].indexOf(text(mine.status)) >= 0 &&
          TERMINAL_STATES.indexOf(state.status) < 0
      }
      : null
  })
}

// 球队端管理页：报名名单（分页 + 角色区分）
async function listInviteSignups(event) {
  const inviteId = text(event.inviteId)
  if (!inviteId) return fail('INVALID_PARAM', '缺少邀约 ID')
  const caller = await resolveCallerIdentity()
  const invite = await loadInviteById(inviteId)
  if (!invite) return fail('NOT_FOUND', '邀约不存在')
  const permission = await assertInviteManager(invite, caller)
  if (!permission.ok) return permission.result

  const pageSize = Math.min(50, Math.max(5, Number(event.pageSize) || 20))
  const page = Math.max(1, Number(event.page) || 1)
  const filter = ['all', 'signup', 'present', 'team'].indexOf(text(event.filter)) >= 0 ? text(event.filter) : 'all'
  const withPhone = event.withPhone === true

  const rows = await loadSignupResponses(invite._id, 100)
  const scanLimited = rows.length >= 100
  const decorated = rows.map(row => {
    const kind = responseKindOf(row)
    const status = text(row.status)
    const isPresent = status === SIGNUP_STATUS.PRESENT
    return {
      responseId: text(row._id),
      kind,
      kindText: kind === RESPONSE_KIND.TEAM ? '队伍应战' : '球员报名',
      side: text(row.side),
      sideText: text(row.side) === 'opponent' ? '对方' : (kind === RESPONSE_KIND.TEAM ? '对方球队' : '本方'),
      userName: text(row.userName),
      teamId: text(row.teamId),
      teamName: text(row.teamName),
      phoneMasked: text(row.userPhone) || maskPhone(row.phoneKey),
      phoneFull: withPhone ? phoneDigits(row.phoneKey) : '',
      status,
      statusText: kind === RESPONSE_KIND.TEAM
        ? (status === 'accepted' ? '已接战' : (status === 'rejected' ? '无法应战' : signupStatusText(status)))
        : signupStatusText(status),
      present: isPresent,
      source: text(row.source),
      proxy: row.proxy === true,
      createdAt: row.createdAt || row.respondedAt || null
    }
  })

  const counts = {
    all: decorated.length,
    signup: decorated.filter(item => item.kind === RESPONSE_KIND.SIGNUP && [SIGNUP_STATUS.ACTIVE, SIGNUP_STATUS.PRESENT].indexOf(item.status) >= 0).length,
    present: decorated.filter(item => item.present).length,
    team: decorated.filter(item => item.kind === RESPONSE_KIND.TEAM).length
  }
  const filtered = filter === 'all' ? decorated
    : filter === 'signup' ? decorated.filter(item => item.kind === RESPONSE_KIND.SIGNUP && [SIGNUP_STATUS.ACTIVE, SIGNUP_STATUS.PRESENT].indexOf(item.status) >= 0)
      : filter === 'present' ? decorated.filter(item => item.present)
        : decorated.filter(item => item.kind === RESPONSE_KIND.TEAM)

  const start = (page - 1) * pageSize
  const state = inviteSignupState(invite)
  return ok({
    inviteId: text(invite._id),
    invite: {
      teamId: text(invite.teamId),
      teamName: text(invite.teamName),
      opponentName: text(invite.opponentName),
      matchDate: text(invite.matchDate),
      matchTime: text(invite.matchTime),
      venue: text(invite.venue),
      venueAddress: text(invite.venueAddress),
      deadline: state.deadline,
      status: state.status,
      statusText: state.statusText,
      maxPlayers: state.maxPlayers,
      signupCount: state.signupCount,
      signupCountKnown: state.signupCountKnown,
      checkinCount: state.checkinCount,
      checkinCountKnown: state.checkinCountKnown,
      acceptedCount: state.acceptedCount,
      acceptedTeamName: text(invite.acceptedTeamName),
      cancelReason: text(invite.cancelReason),
      closeReason: text(invite.closeReason),
      signinUrl: text(invite.signinUrl),
      canSignUp: state.canSignUp,
      signupClosedReason: state.signupClosedReason,
      terminal: state.terminal
    },
    rows: filtered.slice(start, start + pageSize),
    counts,
    filter,
    page,
    pageSize,
    total: filtered.length,
    hasMore: start + pageSize < filtered.length,
    scanLimited
  })
}

// 管理页勾选签到 / 取消签到（幂等）
async function checkInInviteSignup(event) {
  const inviteId = text(event.inviteId)
  const responseId = text(event.responseId)
  if (!inviteId || !responseId) return fail('INVALID_PARAM', '缺少邀约或报名记录')
  const caller = await resolveCallerIdentity()
  const invite = await loadInviteById(inviteId)
  if (!invite) return fail('NOT_FOUND', '邀约不存在')
  const permission = await assertInviteManager(invite, caller)
  if (!permission.ok) return permission.result
  // 签到不受报名截止时间限制（比赛日现场勾选可能已过报名截止），但终态邀约不得再签到
  if (TERMINAL_STATES.indexOf(inviteStatusOf(invite)) >= 0) {
    return fail('CLOSED', inviteStatusText(inviteStatusOf(invite)) + '的邀约不可再签到')
  }

  const res = await db.collection(RESPONSES_COLLECTION).doc(responseId).get().catch(() => null)
  const row = res && res.data
  if (!row || text(row.inviteId) !== inviteId) return fail('NOT_FOUND', '报名记录不存在')
  if (text(row.kind) !== RESPONSE_KIND.SIGNUP) return fail('INVALID_DATA', '只有球员报名可以签到')
  const wantPresent = event.present === false ? false : true
  const currentStatus = text(row.status)
  if ([SIGNUP_STATUS.CANCELLED, SIGNUP_STATUS.REMOVED].indexOf(currentStatus) >= 0) {
    return fail('INVALID_DATA', '该报名已取消或被移出，不能签到')
  }
  const isPresent = currentStatus === SIGNUP_STATUS.PRESENT
  if (isPresent === wantPresent) {
    return ok({ responseId, present: isPresent, already: true, checkinCount: countOrNull(invite.checkinCount) })
  }

  await ensureInviteCounters(invite, await loadSignupResponses(invite._id, 100))
  const maxPlayers = Number(invite.maxPlayers) || 50
  if (wantPresent) {
    const guard = await db.collection(INVITES_COLLECTION)
      .where({ _id: invite._id, checkinCount: _.lt(maxPlayers) })
      .update({ data: { checkinCount: _.inc(1) } })
    if (!guard || !guard.stats || guard.stats.updated !== 1) return fail('FULL', '签到人数已达上限')
    await db.collection(RESPONSES_COLLECTION).doc(responseId).update({
      data: { status: SIGNUP_STATUS.PRESENT, checkedInAt: new Date(), checkedInBy: caller.userId }
    })
  } else {
    const guard = await db.collection(INVITES_COLLECTION)
      .where({ _id: invite._id, checkinCount: _.gt(0) })
      .update({ data: { checkinCount: _.inc(-1) } })
    if (!guard || !guard.stats || guard.stats.updated !== 1) {
      console.warn('[friendly] uncheck guard miss invite=' + inviteId)
    }
    await db.collection(RESPONSES_COLLECTION).doc(responseId).update({
      data: { status: SIGNUP_STATUS.ACTIVE, checkedInAt: '', checkedInBy: '' }
    })
  }

  const fresh = (await loadInviteById(invite._id)) || invite
  const state = inviteSignupState(fresh)
  return ok({
    responseId,
    present: wantPresent,
    already: false,
    checkinCount: state.checkinCount,
    checkinCountKnown: state.checkinCountKnown
  })
}

// 管理页代签：现场到场但没在 H5 报名的人，只计入签到数（不增加报名数）
async function proxyCheckInInvite(event) {
  const inviteId = text(event.inviteId)
  const userName = text(event.userName).slice(0, 20)
  if (!inviteId) return fail('INVALID_PARAM', '缺少邀约 ID')
  if (!userName) return fail('INVALID_PARAM', '请填写到场球员姓名')
  const caller = await resolveCallerIdentity()
  const invite = await loadInviteById(inviteId)
  if (!invite) return fail('NOT_FOUND', '邀约不存在')
  const permission = await assertInviteManager(invite, caller)
  if (!permission.ok) return permission.result
  if (TERMINAL_STATES.indexOf(inviteStatusOf(invite)) >= 0) {
    return fail('CLOSED', inviteStatusText(inviteStatusOf(invite)) + '的邀约不可再代签')
  }

  const userPhone = phoneDigits(event.userPhone)
  const rows = await loadSignupResponses(invite._id, 100)
  const existing = userPhone
    ? rows.find(row => text(row.kind) === RESPONSE_KIND.SIGNUP && phoneDigits(row.phoneKey) === userPhone)
    : null
  if (existing && [SIGNUP_STATUS.ACTIVE, SIGNUP_STATUS.PRESENT].indexOf(text(existing.status)) >= 0) {
    // 已有报名：代签等价于勾选签到
    return checkInInviteSignup(Object.assign({}, event, { responseId: text(existing._id), present: true }))
  }

  await ensureInviteCounters(invite, rows)
  const guard = await db.collection(INVITES_COLLECTION)
    .where({ _id: invite._id, checkinCount: _.lt(Number(invite.maxPlayers) || 50) })
    .update({ data: { checkinCount: _.inc(1) } })
  if (!guard || !guard.stats || guard.stats.updated !== 1) return fail('FULL', '签到人数已达上限')

  const addRes = await db.collection(RESPONSES_COLLECTION).add({
    data: {
      inviteId: invite._id,
      userId: '',
      userName,
      userPhone: userPhone ? maskPhone(userPhone) : '',
      phoneKey: userPhone,
      teamId: '',
      teamName: '',
      kind: RESPONSE_KIND.SIGNUP,
      side: text(event.side) === 'opponent' ? 'opponent' : 'own',
      status: SIGNUP_STATUS.PRESENT,
      source: 'proxy',
      proxy: true,
      checkedInAt: new Date(),
      checkedInBy: caller.userId,
      createdAt: new Date(),
      respondedAt: new Date()
    }
  })

  const fresh = (await loadInviteById(invite._id)) || invite
  const state = inviteSignupState(fresh)
  return ok({
    responseId: text(addRes._id),
    present: true,
    proxy: true,
    checkinCount: state.checkinCount,
    checkinCountKnown: state.checkinCountKnown
  })
}

// 管理页移除报名（不动已审核的历史，只解绑本条报名）
async function removeInviteSignup(event) {
  const inviteId = text(event.inviteId)
  const responseId = text(event.responseId)
  if (!inviteId || !responseId) return fail('INVALID_PARAM', '缺少邀约或报名记录')
  const caller = await resolveCallerIdentity()
  const invite = await loadInviteById(inviteId)
  if (!invite) return fail('NOT_FOUND', '邀约不存在')
  const permission = await assertInviteManager(invite, caller)
  if (!permission.ok) return permission.result

  const res = await db.collection(RESPONSES_COLLECTION).doc(responseId).get().catch(() => null)
  const row = res && res.data
  if (!row || text(row.inviteId) !== inviteId) return fail('NOT_FOUND', '报名记录不存在')
  if (text(row.kind) !== RESPONSE_KIND.SIGNUP) return fail('INVALID_DATA', '只有球员报名可以移除')
  const currentStatus = text(row.status)
  if (currentStatus === SIGNUP_STATUS.REMOVED) {
    return ok({ responseId, removed: true, already: true, signupCount: countOrNull(invite.signupCount) })
  }

  await db.collection(RESPONSES_COLLECTION).doc(responseId).update({
    data: {
      status: SIGNUP_STATUS.REMOVED,
      removedAt: new Date(),
      removedBy: caller.userId,
      removeReason: text(event.reason).slice(0, 40)
    }
  })
  if ([SIGNUP_STATUS.ACTIVE, SIGNUP_STATUS.PRESENT].indexOf(currentStatus) >= 0) {
    await db.collection(INVITES_COLLECTION)
      .where({ _id: invite._id, signupCount: _.gt(0) })
      .update({ data: { signupCount: _.inc(-1) } })
  }
  if (currentStatus === SIGNUP_STATUS.PRESENT) {
    await db.collection(INVITES_COLLECTION)
      .where({ _id: invite._id, checkinCount: _.gt(0) })
      .update({ data: { checkinCount: _.inc(-1) } })
  }

  const fresh = (await loadInviteById(invite._id)) || invite
  const state = inviteSignupState(fresh)
  return ok({
    responseId,
    removed: true,
    already: false,
    signupCount: state.signupCount,
    checkinCount: state.checkinCount
  })
}

// 状态机推进：成局 / 取消 / 流局，均需发起球队管理者
async function updateInviteStatus(event, targetStatus) {
  const inviteId = text(event.inviteId)
  if (!inviteId) return fail('INVALID_PARAM', '缺少邀约 ID')
  const caller = await resolveCallerIdentity()
  const invite = await loadInviteById(inviteId)
  if (!invite) return fail('NOT_FOUND', '邀约不存在')
  const permission = await assertInviteManager(invite, caller)
  if (!permission.ok) return permission.result

  const currentStatus = inviteStatusOf(invite)
  if (currentStatus === targetStatus) {
    return ok({ inviteId, status: currentStatus, statusText: inviteStatusText(currentStatus), already: true })
  }
  await ensureInviteStatus(invite)
  if (TERMINAL_STATES.indexOf(currentStatus) >= 0) {
    return fail('CLOSED', '当前状态为' + inviteStatusText(currentStatus) + '，不可再变更')
  }
  const allowedFrom = targetStatus === INVITE_STATE.CONFIRMED
    ? [INVITE_STATE.OPEN, INVITE_STATE.ACCEPTED]
    : [INVITE_STATE.OPEN, INVITE_STATE.ACCEPTED, INVITE_STATE.CONFIRMED]
  if (allowedFrom.indexOf(currentStatus) < 0) return fail('CLOSED', '当前状态不可变更为' + inviteStatusText(targetStatus))

  const reason = text(event.reason).slice(0, 40)
  const patch = {
    status: targetStatus,
    statusUpdatedAt: new Date(),
    statusUpdatedBy: caller.userId
  }
  if (targetStatus === INVITE_STATE.CANCELLED) patch.cancelReason = reason
  if (targetStatus === INVITE_STATE.CLOSED) patch.closeReason = reason
  if (targetStatus === INVITE_STATE.CONFIRMED) patch.confirmedAt = new Date()

  const guard = await db.collection(INVITES_COLLECTION)
    .where({ _id: invite._id, status: currentStatus })
    .update({ data: patch })
  if (!guard || !guard.stats || guard.stats.updated !== 1) {
    return fail('CONFLICT', '状态已被其他操作变更，请刷新后重试')
  }

  // 取消 / 流局 / 成局都要通知已报名球员（用户确认口径：取消必须通知）
  const notify = await notifyInviteSignups(invite, targetStatus, reason).catch(error => ({
    kind: targetStatus, total: 0, sent: 0, skipped: 0, failed: 0, error: error && error.message
  }))

  return ok({
    inviteId,
    status: targetStatus,
    statusText: inviteStatusText(targetStatus),
    from: currentStatus,
    reason,
    notify
  })
}

async function confirmInvite(event) { return updateInviteStatus(event, INVITE_STATE.CONFIRMED) }
async function cancelInvite(event) { return updateInviteStatus(event, INVITE_STATE.CANCELLED) }
async function abandonInvite(event) { return updateInviteStatus(event, INVITE_STATE.CLOSED) }

// 开赛前提醒报名球员（管理页手动触发；定时触发器未配置，需线上单独登记）
async function remindInviteSignups(event) {
  const inviteId = text(event.inviteId)
  if (!inviteId) return fail('INVALID_PARAM', '缺少邀约 ID')
  const caller = await resolveCallerIdentity()
  const invite = await loadInviteById(inviteId)
  if (!invite) return fail('NOT_FOUND', '邀约不存在')
  const permission = await assertInviteManager(invite, caller)
  if (!permission.ok) return permission.result
  if (TERMINAL_STATES.indexOf(inviteStatusOf(invite)) >= 0) return fail('CLOSED', '该邀约已结束，无需提醒')

  const notify = await notifyInviteSignups(invite, 'reminder', text(event.note)).catch(error => ({
    kind: 'reminder', total: 0, sent: 0, skipped: 0, failed: 0, error: error && error.message
  }))
  await db.collection(INVITES_COLLECTION).doc(invite._id).update({ data: { remindedAt: new Date() } }).catch(() => null)
  return ok({ inviteId, notify })
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
    // 报名（H5 姓名+手机号）/ 签到（管理页勾选）/ 名单 / 状态机
    case 'signUpInvite': return signUpInvite(event)
    case 'cancelInviteSignup': return cancelInviteSignup(event)
    case 'getMyInviteStatus': return getMyInviteStatus(event)
    case 'listInviteSignups': return listInviteSignups(event)
    case 'checkInInviteSignup': return checkInInviteSignup(event)
    case 'proxyCheckInInvite': return proxyCheckInInvite(event)
    case 'removeInviteSignup': return removeInviteSignup(event)
    case 'confirmInvite': return confirmInvite(event)
    case 'cancelInvite': return cancelInvite(event)
    case 'abandonInvite': return abandonInvite(event)
    case 'remindInviteSignups': return remindInviteSignups(event)
    case 'healthCheck': return ok({
      ok: true,
      version: '1.8.0',
      actions: FRIENDLY_ACTIONS,
      inviteStates: Object.values(INVITE_STATE),
      battleCryStyles: Object.keys(BATTLE_CRY_PRESETS),
      aiEnabled: typeof cloud.ai === 'function',
      aiModels: CONFIG.aiModels,
      aiImageModel: CONFIG.aiImageModel,
      configured: Boolean(CONFIG.bridgeUrl),
      templateConfigured: Boolean(CONFIG.inviteTemplateId || CONFIG.signinTemplateId || CONFIG.cancelTemplateId),
      // 模板路由概览：每个模板用哪套字段、从哪个环境变量取 ID、是否回落到另一个模板
      templateRoutes: templateFields.templateKeys().map(key => {
        const def = templateFields.templateDef(key)
        const route = resolveNotifyTemplate(key === 'cancel' ? 'cancelled' : 'confirmed')
        return {
          templateKey: def.key,
          title: def.title,
          number: def.number,
          envKeys: def.envKeys,
          fieldMap: def.fieldMap,
          effectiveTemplateKey: route.templateKey,
          effectiveTemplateId: route.templateId,
          configured: Boolean(route.templateId),
          fallbackTo: route.fallback ? route.templateKey : ''
        }
      }),
      notifyScenes: NOTIFY_SCENE,
      miniProgramSubscribe: 'not-enabled' // 小程序订阅消息接口位（本次未接，预留给后续）
    })
    default: return fail('UNKNOWN_ACTION', `未知 action: ${action}`)
  }
}
