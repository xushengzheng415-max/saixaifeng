'use strict'

const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const { dedupeImportedPlayerRows, registerImportedPlayerIdentity } = require('./importDualRole')
const staffPolicy = require('./staffPolicy.cjs')
const { relayRights } = require('./staffRelayRights.cjs')
const { validateStaffRelayScope } = require('./staffRelayScope.cjs')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const SPORT = 'football'
const REGISTER_PAGE = 'pages/tournament/signup/signup'
const CLAIM_CODE_PAGE = 'pages/team/claim-code/claim-code'
const FLOW_COLLECTIONS = ['tournament_invites', 'team_invitations', 'tournament_tasks', 'service_follow_gates', 'service_account_bindings', 'notification_outbox', 'registration_audit_logs', 'messages', 'registration_import_batches', 'registration_player_drafts', 'roster_snapshots']
let collectionsReady = false
let serviceAccessTokenCache = null
let miniAccessTokenCache = null

function text(value) { return String(value == null ? '' : value).trim() }
function normalizePhone(value) { return text(value).replace(/\D/g, '').slice(-11) }
function randomKey(bytes) { return crypto.randomBytes(bytes).toString('base64url') }
function miniReviewTemplateId() { return text(process.env.SXF_FOOTBALL_MINI_TEMPLATE_TOURNAMENT_REVIEW || 'CxBgS7fgjeNoKTSwl0q0o_lErclh_ffpIj2IeL6mpRw') }
function serviceReviewTemplateId() { return text(process.env.SXF_FOOTBALL_SERVICE_TEMPLATE_REGISTRATION_REVIEW || 'ovXRAzKHZE3Rsex7SVtl2zR-cMNznM_P3azxG8olz1g') }
function serviceRegistrationSuccessTemplateId() { return text(process.env.SXF_FOOTBALL_SERVICE_TEMPLATE_REGISTRATION_SUCCESS || 'aX_3wN6SbFR0s3giwyoK5P6eBbl9Iwx2rqU_jCId-Uk') }
function divisionCapacity(division, tournament) {
  const candidates = [division && division.expectedTeams, division && division.requiredTeams, division && division.teamRequirement, division && division.participantTeams, division && division.maxTeams, division && division.teamLimit, tournament && tournament.maxTeams]
  return candidates.map(Number).find(value => Number.isFinite(value) && value > 0) || 0
}
async function listAll(collection, where, max) {
  const rows = []
  const limit = Number(max || 5000)
  for (let offset = 0; offset < limit; offset += 100) {
    const page = (await db.collection(collection).where(where).skip(offset).limit(Math.min(100, limit - offset)).get()).data || []
    rows.push(...page)
    if (page.length < 100) break
  }
  return rows
}
function envVersion(value) {
  const normalized = text(value || process.env.SXF_FOOTBALL_REGISTRATION_QR_ENV_VERSION).toLowerCase()
  return ['develop', 'trial', 'release'].includes(normalized) ? normalized : 'release'
}
function recordOrgId(record) { return text(record && (record.orgId || record.organizationId || record.organization_id)) }
function miniOpenId() { return text((cloud.getWXContext() || {}).OPENID) }
function dateValue(value) {
  if (!value) return 0
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'object' && value.$date) return new Date(value.$date).getTime()
  return new Date(value).getTime() || 0
}

async function wechatJson(url, options) {
  const response = await fetch(url, options)
  const data = await response.json()
  if (!response.ok || data.errcode) {
    const error = new Error(`微信接口返回 ${data.errcode || response.status}：${data.errmsg || '请求失败'}`)
    error.code = `WECHAT_${data.errcode || response.status}`
    error.wechatCode = data.errcode || response.status
    throw error
  }
  return data
}

function serviceBridgeConfigured() {
  return Boolean(text(process.env.SXF_FOOTBALL_WECHAT_BRIDGE_URL) && text(process.env.SXF_FOOTBALL_WECHAT_BRIDGE_SECRET))
}

async function serviceBridgeJson(action, payload) {
  const baseUrl = text(process.env.SXF_FOOTBALL_WECHAT_BRIDGE_URL).replace(/\/+$/, '')
  const secret = text(process.env.SXF_FOOTBALL_WECHAT_BRIDGE_SECRET)
  if (!baseUrl || !secret) throw new Error('足球服务号固定出口中转尚未配置')
  const body = JSON.stringify(payload || {})
  const timestamp = Date.now()
  const nonce = crypto.randomBytes(16).toString('hex')
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}\n${nonce}\n${body}`).digest('hex')
  const response = await fetch(`${baseUrl}/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-sxf-timestamp': String(timestamp), 'x-sxf-nonce': nonce, 'x-sxf-signature': signature },
    body
  })
  const data = await response.json()
  if (!response.ok || data.success !== true) {
    const error = new Error(data.message || `服务号固定出口中转请求失败(${response.status})`)
    error.code = data.code || 'SERVICE_BRIDGE_FAILED'
    error.wechatCode = data.code || null
    throw error
  }
  return data
}

async function serviceAccessToken() {
  if (serviceAccessTokenCache && serviceAccessTokenCache.expiresAt > Date.now() + 120000) return serviceAccessTokenCache.value
  const appId = text(process.env.SXF_FOOTBALL_SERVICE_ACCOUNT_APPID)
  const appSecret = text(process.env.SXF_FOOTBALL_SERVICE_ACCOUNT_APPSECRET)
  if (!appId || !appSecret) {
    const error = new Error('足球服务号AppID或AppSecret尚未配置')
    error.code = 'SERVICE_CREDENTIALS_REQUIRED'
    throw error
  }
  const data = await wechatJson(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`)
  serviceAccessTokenCache = { value: data.access_token, expiresAt: Date.now() + Math.max(300, Number(data.expires_in || 7200) - 300) * 1000 }
  return data.access_token
}

async function miniAccessToken() {
  if (miniAccessTokenCache && miniAccessTokenCache.expiresAt > Date.now() + 120000) return miniAccessTokenCache.value
  const appId = text(process.env.SXF_FOOTBALL_MINIPROGRAM_APPID || 'wx57164cca8676f411')
  const appSecret = text(process.env.SXF_FOOTBALL_MINIPROGRAM_APPSECRET)
  if (!appSecret) {
    const error = new Error('足球小程序AppSecret尚未配置，请先在云函数环境变量中配置后重试')
    error.code = 'MINI_PROGRAM_CREDENTIALS_REQUIRED'
    throw error
  }
  const data = await wechatJson(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`)
  miniAccessTokenCache = { value: data.access_token, expiresAt: Date.now() + Math.max(300, Number(data.expires_in || 7200) - 300) * 1000 }
  return data.access_token
}

async function directMiniProgramCode(params) {
  const accessToken = await miniAccessToken()
  const response = await fetch(`https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(accessToken)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scene: params.scene, page: params.page, width: params.width, check_path: params.checkPath !== false, env_version: params.envVersion })
  })
  const contentType = text(response.headers.get('content-type')).toLowerCase()
  const buffer = Buffer.from(await response.arrayBuffer())
  if (!response.ok || contentType.includes('json') || (buffer.length > 0 && buffer[0] === 123)) {
    let data = {}
    try { data = JSON.parse(buffer.toString('utf8')) } catch {}
    const error = new Error(`微信小程序码接口返回 ${data.errcode || response.status}：${data.errmsg || '生成失败'}`)
    error.code = `WECHAT_MINI_CODE_${data.errcode || response.status}`
    throw error
  }
  return buffer
}

async function directMiniProgramUrlLink(path, query, options) {
  const config = options || {}
  const requestedVersion = envVersion(config.envVersion)
  const expiresAt = dateValue(config.expiresAt)
  const body = {
    path,
    query,
    env_version: requestedVersion,
    is_expire: expiresAt > Date.now() + 60000
  }
  if (body.is_expire) {
    body.expire_type = 0
    body.expire_time = Math.floor(expiresAt / 1000)
  }
  const accessToken = await miniAccessToken()
  const data = await wechatJson(`https://api.weixin.qq.com/wxa/generate_urllink?access_token=${encodeURIComponent(accessToken)}`, {
    method:'POST', headers:{ 'content-type':'application/json' },
    body:JSON.stringify(body)
  })
  if (!data.url_link) {
    const error = new Error('微信未返回可用的小程序URL Link')
    error.code = 'WECHAT_URL_LINK_EMPTY'
    throw error
  }
  return data.url_link
}

async function miniProgramCode(params) {
  try {
    const result = await cloud.openapi.wxacode.getUnlimited(params)
    return result.buffer
  } catch (error) {
    const message = text(error && (error.message || error.errMsg))
    const code = text(error && (error.errCode || error.code))
    const shouldFallback = message.includes('INVALID_WX_ACCESS_TOKEN') ||
      message.includes('invalid wx openapi access_token') ||
      message.includes('has no permission to call this API') ||
      message.includes('无权限') ||
      code === '-604101' || code === '604101'
    if (!shouldFallback) throw error
    console.warn('[tournamentRegistrationFlow] CloudBase微信通道不可用，切换小程序官方接口', code || 'OPENAPI_UNAVAILABLE')
    return directMiniProgramCode(params)
  }
}

async function serviceFollowCode(scene) {
  if (serviceBridgeConfigured()) {
    const data = await serviceBridgeJson('qrcode', { scene })
    return { ticket: data.ticket, expireSeconds: Number(data.expireSeconds || 2592000), url: data.url }
  }
  const accessToken = await serviceAccessToken()
  const data = await wechatJson(`https://api.weixin.qq.com/cgi-bin/qrcode/create?access_token=${encodeURIComponent(accessToken)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expire_seconds: 2592000, action_name: 'QR_STR_SCENE', action_info: { scene: { scene_str: scene } } })
  })
  return { ticket: data.ticket, expireSeconds: Number(data.expire_seconds || 2592000), url: `https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=${encodeURIComponent(data.ticket)}` }
}

async function ensureCollections() {
  if (collectionsReady) return
  for (const name of FLOW_COLLECTIONS) {
    try { await db.createCollection(name) } catch (error) {
      const message = text(error && (error.message || error.errMsg)).toLowerCase()
      if (!message.includes('exist') && !message.includes('已存在') && !message.includes('duplicate')) throw error
    }
  }
  collectionsReady = true
}

// CloudBase 的 doc().get() 在文档不存在时抛异常，而不是返回空结果。
// 本文件所有调用点都按“文档不存在返回 null”写了 !x 守卫（如“球队参赛关系不存在”“赛事不存在”），
// 因此这里必须把“文档不存在”收敛为 null，否则守卫不可达，
// 原始错误（document.getfail document with_id does not exist）会直接显示在页面上。
function documentMissing(error) {
  const message = text(error && (error.message || error.errMsg)).toLowerCase()
  const code = text(error && (error.code || error.errCode)).toLowerCase()
  if (code.includes('document_not_found') || code.includes('documentnotfound')) return true
  if (message.includes('document.getfail')) return true
  return message.includes('document') && (message.includes('does not exist') || message.includes('not exist'))
}

async function getDocument(collection, id) {
  const targetId = text(id)
  if (!targetId) return null
  try {
    const result = await db.collection(collection).doc(targetId).get()
    return Array.isArray(result.data) ? result.data[0] : result.data
  } catch (error) {
    if (documentMissing(error)) return null
    throw error
  }
}

// 竞赛组别有两个来源：正式的 divisions 集合，以及创建赛事向导内嵌在 tournaments.divisions 里的组别。
// 内嵌组别没有独立的 _id 文档（id 形如 division-<时间戳>-<随机>），必须回退到内嵌数组读取，
// 否则“添加虚拟球队”会对这类赛事误判为组别不存在。
async function resolveTournamentDivision(tournament, tournamentId, divisionId) {
  const targetId = text(divisionId)
  if (!targetId) return null
  let division = null
  try { division = await getDocument('divisions', targetId) } catch (error) { division = null }
  if (division && text(division.tournamentId) === tournamentId) return division
  const embedded = Array.isArray(tournament && tournament.divisions) ? tournament.divisions : []
  const matched = embedded.find(item => item && (text(item.id) === targetId || text(item._id) === targetId))
  return matched ? Object.assign({}, matched, { tournamentId }) : null
}

async function webActor(event) {
  const userId = text(event.__actorUserId)
  const orgId = text(event.__actorOrgId)
  if (!userId || !orgId) return null
  const user = await getDocument('users', userId)
  if (!user) return null
  const token = text(event.__authToken)
  if (!token) return null
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const sessions = (await db.collection('auth_sessions').where({ tokenHash, active:true, expiresAt:_.gt(new Date()) }).limit(2).get()).data || []
  if (sessions.length !== 1 || text(sessions[0].userId) !== userId) return null
  const session = sessions[0]
  if (text(user.orgId || user.organizationId) !== orgId && text(session && session.activeOrgId) !== orgId) return null
  if (await staffPolicy.isStaff(db, userId, orgId) && !await staffPolicy.owner(db, userId, orgId)) {
    const tournamentId = text(event.__staffTournamentId || event.tournamentId)
    const rule = relayRights('tournamentRegistrationFlow', event)
    if (!Array.isArray(rule) || !rule.length || !await validateStaffRelayScope(db, 'tournamentRegistrationFlow', event, tournamentId)) return null
    if (!(await Promise.all(rule.map(right => staffPolicy.hasRight(db, userId, orgId, tournamentId, right)))).every(Boolean)) return null
  }
  return { userId, orgId, user }
}

async function pcPersonActor(event) {
  const token = text(event.__authToken)
  if (!token) return null
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const sessions = (await db.collection('auth_sessions').where({ tokenHash, active:true, expiresAt:_.gt(new Date()) }).limit(2).get()).data || []
  if (sessions.length !== 1 || event.__actorUserId && text(event.__actorUserId) !== text(sessions[0].userId)) return null
  const userId = text(sessions[0].userId)
  const user = await getDocument('users', userId)
  const phone = text(user && (user.phone || user.phoneNumber))
  if (!user || user.phoneVerified !== true || !/^1[3-9]\d{9}$/.test(phone) || user.pcAccountStatus === 'cancelled' || user.pcLoginEnabled === false) return null
  const phoneRows = (await db.collection('users').where(_.or([{ phone }, { phoneNumber:phone }])).limit(3).get()).data || []
  if (new Set(phoneRows.map(row => text(row._id))).size !== 1 || text(phoneRows[0]?._id) !== userId) return null
  return { userId, user }
}


async function organizerServiceBinding(user) {
  const userId = text(user && user._id)
  const direct = (await db.collection('service_account_bindings').where({ sport: SPORT, userId, organizerPcBound: true, subscribed: true }).limit(2).get()).data || []
  if (direct.length > 1) throw new Error('当前账号存在重复服务号绑定，请联系平台处理')
  if (direct[0] && text(direct[0].officialOpenId)) return direct[0]
  if (user && user.pcServiceRebindRequired === true) return null
  const miniIds = [user && user.openId, user && user._openid, user && user.miniProgramOpenId].filter(Boolean).map(text)
  for (const miniOpenId of miniIds) {
    const rows = (await db.collection('service_account_bindings').where({ sport: SPORT, miniOpenId, subscribed: true }).limit(2).get()).data || []
    if (rows.length > 1) throw new Error('当前微信存在重复服务号绑定，请联系平台处理')
    if (rows[0] && text(rows[0].officialOpenId)) {
      if (rows[0].userId && text(rows[0].userId) !== userId) throw new Error('该服务号微信已关联其他手机号账号，请联系平台核验')
      const otherUsers = (await db.collection('service_account_bindings').where({ sport:SPORT, officialOpenId:text(rows[0].officialOpenId), subscribed:true }).limit(10).get()).data || []
      if (otherUsers.some(row => row.userId && text(row.userId) !== userId)) throw new Error('该服务号微信已关联其他手机号账号，请联系平台核验')
      await db.collection('service_account_bindings').doc(rows[0]._id).update({ data: { userId, organizerPcBound: true, updateTime: db.serverDate() } })
      return { ...rows[0], userId, organizerPcBound: true }
    }
  }
  return null
}

async function createOrganizerServiceGate(event) {
  const actor = await pcPersonActor(event)
  if (!actor) return { success: false, code: 'AUTH_REQUIRED', message: '请先用已验证手机号的账号登录' }
  const binding = await organizerServiceBinding(actor.user)
  if (binding) return { success: true, data: { subscribed: true, status: 'subscribed', gateId: '', followUrl: '' } }
  const existing = (await db.collection('service_follow_gates').where({ sport: SPORT, purpose: 'organizer_pc_bind', userId: actor.userId }).limit(20).get()).data || []
  let gate = existing.find(item => item.subscribed === true && text(item.officialOpenId)) ||
    existing.find(item => text(item.status) === 'waiting' && dateValue(item.qrExpireAt) > Date.now() + 60000) ||
    null
  if (gate && gate.subscribed === true) return { success: true, data: { subscribed: true, status: 'subscribed', gateId: gate._id, followUrl: '' } }
  if (!gate) {
    const scene = 'op_' + randomKey(12)
    const created = await db.collection('service_follow_gates').add({ data: { sport: SPORT, purpose: 'organizer_pc_bind', userId: actor.userId, scene, status: 'waiting', subscribed: false, createTime: db.serverDate(), updateTime: db.serverDate() } })
    gate = { _id: created._id, scene, status: 'waiting', subscribed: false }
  }
  let followUrl = text(gate.followUrl)
  if (!followUrl || dateValue(gate.qrExpireAt) <= Date.now() + 60000) {
    const code = await serviceFollowCode(gate.scene)
    followUrl = code.url
    await db.collection('service_follow_gates').doc(gate._id).update({ data: { followUrl, qrTicket: code.ticket, qrExpireAt: new Date(Date.now() + code.expireSeconds * 1000), updateTime: db.serverDate() } })
  }
  return { success: true, data: { subscribed: false, status: 'waiting', gateId: gate._id, followUrl } }
}

async function organizerServiceBindingStatus(event) {
  const actor = await pcPersonActor(event)
  if (!actor) return { success: false, code: 'AUTH_REQUIRED', message: '请先用已验证手机号的账号登录' }
  const binding = await organizerServiceBinding(actor.user)
  if (binding) return { success: true, data: { subscribed: true, status: 'subscribed', gateId: text(event.gateId) } }
  const gateId = text(event.gateId)
  if (gateId) {
    const gate = await getDocument('service_follow_gates', gateId)
    if (!gate || text(gate.userId) !== actor.userId || text(gate.purpose) !== 'organizer_pc_bind') return { success: false, code: 'FOLLOW_GATE_DENIED', message: '服务号绑定申请不存在或不属于当前账号' }
    return { success: true, data: { subscribed: gate.subscribed === true, status: text(gate.status || 'waiting'), gateId } }
  }
  return { success: true, data: { subscribed: false, status: 'required', gateId: '' } }
}

async function addAudit(action, data) {
  await db.collection('registration_audit_logs').add({ data: {
    sport: SPORT,
    action,
    tournamentId: text(data.tournamentId),
    divisionId: text(data.divisionId),
    inviteId: text(data.inviteId),
    registrationId: text(data.registrationId),
    actorUserId: text(data.actorUserId),
    actorOrgId: text(data.actorOrgId),
    result: text(data.result || 'success'),
    detail: data.detail && typeof data.detail === 'object' ? data.detail : {},
    createTime: db.serverDate()
  } })
}

async function upsertByKey(collection, uniqueKey, data) {
  const found = await db.collection(collection).where({ uniqueKey }).limit(2).get()
  const rows = found.data || []
  if (rows.length > 0) {
    await db.collection(collection).doc(rows[0]._id).update({ data: { ...data, updateTime: db.serverDate() } })
    return rows[0]._id
  }
  const result = await db.collection(collection).add({ data: { ...data, uniqueKey, createTime: db.serverDate(), updateTime: db.serverDate() } })
  return result._id
}

async function invitationByKey(inviteKey) {
  const result = await db.collection('tournament_invites').where({ sport: SPORT, inviteKey: text(inviteKey) }).limit(2).get()
  return (result.data || [])[0] || null
}

function registrationOpen(tournament, division) {
  return tournament && division && tournament.registrationEnabled !== false && division.registrationEnabled === true && ['registering', 'upcoming'].includes(text(tournament.status).toLowerCase())
}

async function setDivisionRegistration(event) {
  const actor = await webActor(event)
  if (!actor) return { success: false, code: 'AUTH_REQUIRED', message: '登录会话或机构信息已失效，请重新登录' }
  const tournamentId = text(event.tournamentId)
  const divisionId = text(event.divisionId)
  const enabled = event.enabled === true
  const tournament = await getDocument('tournaments', tournamentId)
  if (!tournament || recordOrgId(tournament) !== actor.orgId) return { success: false, code: 'TOURNAMENT_SCOPE_DENIED', message: '赛事不存在或无权调整报名状态' }
  const division = divisionId ? await getDocument('divisions', divisionId) : null
  if (!division || text(division.tournamentId) !== tournamentId) return { success: false, code: 'DIVISION_REQUIRED', message: '竞赛组别不存在或不属于当前赛事' }
  const currentStatus = text(tournament.status).toLowerCase()
  if (enabled && ['completed', 'finished', 'cancelled', 'canceled', 'archived'].includes(currentStatus)) {
    return { success: false, code: 'TOURNAMENT_STATUS_INVALID', message: '当前赛事状态不能开启报名' }
  }
  const divisionUpdate = enabled
    ? { registrationEnabled: true, registrationOpenedBy: actor.userId, registrationOpenedAt: db.serverDate(), registrationClosedBy: '', registrationClosedAt: null, updateTime: db.serverDate() }
    : { registrationEnabled: false, registrationClosedBy: actor.userId, registrationClosedAt: db.serverDate(), updateTime: db.serverDate() }
  await db.collection('divisions').doc(divisionId).update({ data: divisionUpdate })
  if (enabled) {
    await db.collection('tournaments').doc(tournamentId).update({ data: { registrationEnabled: true, status: 'registering', updateTime: db.serverDate() } })
  } else {
    const remaining = (await db.collection('divisions').where({ tournamentId, registrationEnabled: true }).limit(1).get()).data || []
    if (remaining.length === 0) await db.collection('tournaments').doc(tournamentId).update({ data: { registrationEnabled: false, updateTime: db.serverDate() } })
  }
  await addAudit(enabled ? 'division_registration_opened' : 'division_registration_closed', { tournamentId, divisionId, actorUserId: actor.userId, actorOrgId: actor.orgId, detail: { previousEnabled: division.registrationEnabled === true, divisionName: text(division.name || division.divisionName) } })
  return { success: true, message: enabled ? `${text(division.name || division.divisionName) || '当前组别'}报名已开启` : `${text(division.name || division.divisionName) || '当前组别'}报名已关闭`, data: { divisionId, registrationEnabled: enabled, tournamentStatus: enabled ? 'registering' : currentStatus } }
}

async function addSyntheticTeams(event) {
  const actor = await webActor(event)
  if (!actor) return { success:false, code:'AUTH_REQUIRED', message:'登录会话或机构信息已失效，请重新登录' }
  const tournamentId = text(event.tournamentId)
  const divisionId = text(event.divisionId)
  const teamIds = Array.from(new Set((Array.isArray(event.teamIds) ? event.teamIds : []).map(text).filter(Boolean))).slice(0, 50)
  if (!teamIds.length) return { success:false, code:'TEAM_REQUIRED', message:'请至少选择一支虚拟球队' }
  const tournament = await getDocument('tournaments', tournamentId)
  if (!tournament || recordOrgId(tournament) !== actor.orgId) return { success:false, code:'TOURNAMENT_SCOPE_DENIED', message:'赛事不存在或无权添加球队' }
  const division = await resolveTournamentDivision(tournament, tournamentId, divisionId)
  if (!division) return { success:false, code:'DIVISION_REQUIRED', message:'竞赛组别不存在或不属于当前赛事' }
  const teamResult = await db.collection('teams').where({ _id:_.in(teamIds), orgId:actor.orgId, synthetic:true }).limit(50).get()
  const teams = teamResult.data || []
  if (teams.length !== teamIds.length) return { success:false, code:'SYNTHETIC_TEAM_SCOPE_DENIED', message:'所选球队包含不存在、非虚拟或其他机构球队' }
  // 只有组别声明了年龄组才校验年龄一致性；向导创建的内嵌组别没有 ageGroup，视为不限年龄（虚拟球队为测试资料）。
  const ageGroup = text(division.ageGroup).toUpperCase()
  if (ageGroup && teams.some(team => text(team.ageGroup).toUpperCase() !== ageGroup)) return { success:false, code:'AGE_GROUP_MISMATCH', message:'虚拟球队年龄组与当前竞赛组别不一致' }
  const existing = (await db.collection('tournament_teams').where({ tournamentId, divisionId }).limit(100).get()).data || []
  const existingIds = new Set(existing.filter(item => !['cancelled','withdrawn'].includes(text(item.status).toLowerCase())).map(item => text(item.teamId)))
  const additions = teams.filter(team => !existingIds.has(text(team._id)))
  const requiredTeams = divisionCapacity(division, tournament)
  if (requiredTeams > 0 && existingIds.size + additions.length > requiredTeams) return { success:false, code:'DIVISION_CAPACITY_EXCEEDED', message:`当前组别目标${requiredTeams}支球队，所选数量超过剩余名额` }
  for (const team of additions) {
    await db.collection('tournament_teams').add({ data:{ tournamentId, divisionId, divisionName:text(division.name), teamId:team._id, teamName:text(team.name || team.teamName), orgId:actor.orgId, teamOrgId:actor.orgId, creatorId:actor.userId, status:'pending', claimStatus:'claimed', participationStatus:'pending_review', source:'synthetic_pool', joinSource:'synthetic_pool', rosterStatus:'draft', rosterPlayerCount:Number(team.playerCount || 15), synthetic:true, syntheticDatasetId:text(team.syntheticDatasetId), createTime:db.serverDate(), updateTime:db.serverDate() } })
  }
  await addAudit('synthetic_teams_added', { tournamentId, divisionId, actorUserId:actor.userId, actorOrgId:actor.orgId, detail:{ requested:teamIds.length, added:additions.length } })
  return { success:true, message:additions.length ? `已添加${additions.length}支虚拟球队，等待球队审查` : '所选虚拟球队均已在当前组别', data:{ added:additions.length, skipped:teamIds.length - additions.length } }
}

function importText(value, maxLength) {
  return text(value).slice(0, Number(maxLength || 120))
}

function importPhone(value) {
  const phone = text(value).replace(/\D/g, '').slice(0, 11)
  return /^1[3-9]\d{9}$/.test(phone) ? phone : ''
}

function importIdentity(value) {
  return text(value).toUpperCase().replace(/[^0-9X]/g, '').slice(0, 18)
}

const IMPORT_KIT_COLOR_VALUES = new Set([
  '#FFFFFF','#161A18','#59615D','#A8B0AC','#D72631','#7E1731','#F47A1F','#F5C518',
  '#D7F300','#138A4B','#075B35','#47A9E8','#1455B5','#14264A','#1F3A6E','#6B3FA0','#E64A8A'
])
const IMPORT_KIT_KEYS = ['jersey','shorts','socks']

function importedKitSet(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const result = {}
  IMPORT_KIT_KEYS.forEach(key => {
    const color = text(source[key]).toUpperCase()
    if (IMPORT_KIT_COLOR_VALUES.has(color)) result[key] = color
  })
  return result
}

function importedKitColors(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const result = { primary:importedKitSet(source.primary), secondary:importedKitSet(source.secondary) }
  return IMPORT_KIT_KEYS.some(key => result.primary[key] || result.secondary[key]) ? result : null
}

function importedKitColorLabels(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const readSet = set => {
    const result = {}
    IMPORT_KIT_KEYS.forEach(key => {
      const label = importText(set && set[key], 20)
      if (label) result[key] = label
    })
    return result
  }
  const result = { primary:readSet(source.primary), secondary:readSet(source.secondary) }
  return IMPORT_KIT_KEYS.some(key => result.primary[key] || result.secondary[key]) ? result : null
}

function importedIdentityProfile(value) {
  const identityNumber = importIdentity(value)
  if (!/^\d{17}[0-9X]$/.test(identityNumber)) return { identityNumber, birthDate:'', gender:'' }
  const year = identityNumber.slice(6, 10)
  const month = identityNumber.slice(10, 12)
  const day = identityNumber.slice(12, 14)
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`)
  const validDate = !Number.isNaN(date.getTime()) && date.getUTCFullYear() === Number(year) && date.getUTCMonth() + 1 === Number(month) && date.getUTCDate() === Number(day)
  return { identityNumber, birthDate:validDate ? `${year}-${month}-${day}` : '', gender:Number(identityNumber.charAt(16)) % 2 === 1 ? 'male' : 'female' }
}

function importedFileId(value, requiredFragment) {
  const fileId = text(value)
  if (!fileId) return ''
  if (!fileId.startsWith('cloud://') || !fileId.includes(requiredFragment)) {
    const error = new Error('导入文件路径无效，请重新上传报名表')
    error.code = 'IMPORT_FILE_SCOPE_INVALID'
    throw error
  }
  return fileId
}

function importedTeamNameKey(value) {
  return importText(value, 50).replace(/\s+/g, '').toLowerCase()
}

function importedIdentityDigest(value) {
  const normalized = importIdentity(value)
  if (!normalized) return ''
  const key = text(process.env.SXF_IDENTITY_HASH_KEY)
  if (!key) {
    const error = new Error('球员身份摘要密钥尚未配置，请联系管理员')
    error.code = 'IDENTITY_HASH_KEY_REQUIRED'
    throw error
  }
  return crypto.createHmac('sha256', key).update('football:identity:' + normalized).digest('hex')
}

function importedIdentityMask(value) {
  const normalized = importIdentity(value)
  if (!normalized) return ''
  if (normalized.length <= 8) return normalized.slice(0, 2) + '****' + normalized.slice(-2)
  return normalized.slice(0, 4) + '*'.repeat(Math.max(4, normalized.length - 8)) + normalized.slice(-4)
}

async function importedIdentityConflicts(identityNumbers) {
  const conflicts = []
  for (let offset = 0; offset < identityNumbers.length; offset += 10) {
    const chunk = identityNumbers.slice(offset, offset + 10)
    const digestMap = new Map(chunk.map(identity => [importedIdentityDigest(identity), identity]))
    const digests = Array.from(digestMap.keys()).filter(Boolean)
    const [players, coaches, digestPlayers, digestCoaches] = await Promise.all([
      db.collection('players').where({ idCard:_.in(chunk) }).limit(100).get(),
      db.collection('coaches').where({ idCard:_.in(chunk) }).limit(100).get(),
      db.collection('players').where({ identityDigest:_.in(digests) }).limit(100).get(),
      db.collection('coaches').where({ identityDigest:_.in(digests) }).limit(100).get()
    ])
    ;[...(players.data || []), ...(coaches.data || [])].forEach(item => conflicts.push(importIdentity(item.idCard || item.idNumber)))
    ;[...(digestPlayers.data || []), ...(digestCoaches.data || [])].forEach(item => conflicts.push(digestMap.get(text(item.identityDigest)) || ''))
  }
  return Array.from(new Set(conflicts.filter(Boolean)))
}

async function rollbackImportedArtifacts(artifacts) {
  for (let index = artifacts.length - 1; index >= 0; index -= 1) {
    const item = artifacts[index]
    try { await db.collection(item.collection).doc(item.id).remove() } catch (error) { console.warn('[teamRegistrationImport] rollback skipped', item.collection, error.message) }
  }
}

async function importTeamRegistrationBatch(event) {
  const actor = await webActor(event)
  if (!actor) return { success:false, code:'AUTH_REQUIRED', message:'登录会话或机构信息已失效，请重新登录' }
  const tournamentId = text(event.tournamentId)
  const divisionId = text(event.divisionId)
  const [tournament, division] = await Promise.all([getDocument('tournaments', tournamentId), getDocument('divisions', divisionId)])
  if (!tournament || recordOrgId(tournament) !== actor.orgId) return { success:false, code:'TOURNAMENT_SCOPE_DENIED', message:'赛事不存在或无权导入球队' }
  if (!division || text(division.tournamentId) !== tournamentId) return { success:false, code:'DIVISION_REQUIRED', message:'竞赛组别不存在或不属于当前赛事' }
  if (!registrationOpen(tournament, division)) return { success:false, code:'DIVISION_REGISTRATION_CLOSED', message:'请先开启当前竞赛组别报名' }

  const rows = Array.isArray(event.teams) ? event.teams.slice(0, 20) : []
  if (!rows.length) return { success:false, code:'IMPORT_TEAM_REQUIRED', message:'请至少上传一份球队报名表' }
  const maxPlayers = Number(division.maxPlayersPerTeam || division.maxPlayers || tournament.maxPlayersPerTeam || 35)
  const batchNames = new Set()
  const batchIdentities = new Set()
  const prepared = []
  for (const row of rows) {
    const name = importText(row && row.name, 50)
    const nameKey = importedTeamNameKey(name)
    const contactName = importText(row && row.contactName, 30)
    const contactPhone = importPhone(row && row.contactPhone)
    const kitColors = importedKitColors(row && row.kitColors)
    const kitColorLabels = importedKitColorLabels(row && row.kitColorLabels)
    if (!name || !nameKey) return { success:false, code:'IMPORT_TEAM_NAME_REQUIRED', message:'报名表中有球队缺少名称' }
    if (batchNames.has(nameKey)) return { success:false, code:'IMPORT_TEAM_NAME_DUPLICATED', message:`本次上传存在重复球队名称：${name}` }
    batchNames.add(nameKey)
    if (!contactName || !contactPhone) return { success:false, code:'IMPORT_CLAIM_CONTACT_REQUIRED', message:`${name} 缺少有效的领队姓名或手机号` }

    const sourceFileId = importedFileId(row.sourceFileId, `/football/team-registration-imports/${tournamentId}/`)
    const logoFileId = importedFileId(row.logoFileId, `/team-logos/imports/${tournamentId}/`)
    if (!sourceFileId) return { success:false, code:'IMPORT_SOURCE_FILE_REQUIRED', message:`${name} 的报名表尚未上传完成，请重试` }
    const rawStaff = Array.isArray(row.staff) ? row.staff.slice(0, 10) : []
    const dedupedPlayers = dedupeImportedPlayerRows(Array.isArray(row.players) ? row.players.slice(0, 100) : [], name)
    const rawPlayers = dedupedPlayers.rows
    if (!rawPlayers.length) return { success:false, code:'IMPORT_PLAYER_REQUIRED', message:`${name} 未识别到球员资料` }
    if (rawPlayers.length > maxPlayers) return { success:false, code:'IMPORT_PLAYER_LIMIT_EXCEEDED', message:`${name} 有 ${rawPlayers.length} 名球员，超过当前组别每队 ${maxPlayers} 人上限` }

    const staff = rawStaff.map((person, index) => {
      const roleType = ['team_leader','head_coach','doctor'].includes(text(person.roleType)) ? text(person.roleType) : 'other'
      const identity = importedIdentityProfile(person.identityNumber)
      if (identity.identityNumber && (!identity.birthDate || batchIdentities.has(identity.identityNumber))) {
        const error = new Error(`${name} 的工作人员身份证号无效或重复`)
        error.code = 'IMPORT_IDENTITY_INVALID'
        throw error
      }
      if (identity.identityNumber) batchIdentities.add(identity.identityNumber)
      return {
        name:importText(person.name, 30), roleType, roleLabel:importText(person.roleLabel, 20), phone:importPhone(person.phone),
        ...identity,
        jerseyNumber:importText(person.jerseyNumber, 3), jerseyName:importText(person.jerseyName, 32).toUpperCase(),
        nativePlace:importText(person.nativePlace, 60),
        photoFileId:importedFileId(person.photoFileId, `/player-photos/imports/${tournamentId}/`),
        photoProcessingStatus:importText(person.photoProcessingStatus, 32), order:index
      }
    }).filter(person => person.name)

    const dualRoleIdentities = new Set()
    const players = rawPlayers.map((person, index) => {
      const identity = importedIdentityProfile(person.identityNumber)
      const personName = importText(person.name, 30)
      const playerJerseyNumber = importText(person.jerseyNumber, 3)
      if (!identity.identityNumber || !identity.birthDate) {
        const error = new Error(`${name} 的球员“${personName || `第${index + 1}人`}”身份证号无效`)
        error.code = 'IMPORT_IDENTITY_INVALID'
        throw error
      }
      const identityUsage = registerImportedPlayerIdentity({ teamName:name, playerName:personName, identityNumber:identity.identityNumber, playerJerseyNumber, staff, batchIdentities, dualRoleIdentities })
      return {
        name:personName, jerseyNumber:playerJerseyNumber, jerseyName:importText(person.jerseyName, 32).toUpperCase(), ...identity,
        nativePlace:importText(person.nativePlace, 60),
        photoFileId:importedFileId(person.photoFileId, `/player-photos/imports/${tournamentId}/`),
        photoProcessingStatus:importText(person.photoProcessingStatus, 32), order:index,
        dualRoleType:identityUsage.dualRoleType, dualRoleLabel:identityUsage.dualRoleLabel || '', eligibilityReviewRequired:Boolean(identityUsage.dualRoleType)
      }
    })
    if (players.some(player => !player.name)) return { success:false, code:'IMPORT_PLAYER_NAME_REQUIRED', message:`${name} 有球员缺少姓名` }

    const leader = staff.find(person => person.roleType === 'team_leader')
    if (leader && !leader.phone) leader.phone = contactPhone
    const headCoach = staff.find(person => person.roleType === 'head_coach')
    const claimantCandidates = [
      { role:'team_leader', roleLabel:'领队', name:contactName || (leader && leader.name) || '', phone:contactPhone },
      headCoach && headCoach.phone ? { role:'head_coach', roleLabel:'主教练', name:headCoach.name, phone:headCoach.phone } : null
    ].filter(Boolean)
    prepared.push({ clientKey:importText(row.clientKey, 80), name, nameKey, shortName:importText(row.shortName, 20), contactName, contactPhone, sourceFileId, sourceFileName:importText(row.sourceFileName, 120), logoFileId, kitColors, kitColorLabels, staff, players, claimantCandidates, dualRoleCount:dualRoleIdentities.size, duplicatePlayerCount:dedupedPlayers.duplicateCount })
  }

  const identityConflicts = new Set(await importedIdentityConflicts(Array.from(batchIdentities)))
  const conflictingPlayers = prepared.flatMap(team => team.players
    .filter(player => identityConflicts.has(player.identityNumber))
    .map(player => `${team.name}：${player.name}`))
  if (conflictingPlayers.length) {
    return { success:false, code:'IMPORT_PLAYER_IDENTITY_CONFLICT', message:`以下球员证件已存在，不能直接生成正式名单：${conflictingPlayers.slice(0, 5).join('、')}` }
  }

  const existingRelations = (await db.collection('tournament_teams').where({ tournamentId, divisionId }).limit(500).get()).data || []
  const activeRelations = existingRelations.filter(item => !['cancelled','withdrawn','removed','invite_cancelled','rejected','replaced'].includes(text(item.status).toLowerCase()))
  const existingDivisionNames = new Set(activeRelations.map(item => importedTeamNameKey(item.teamName)).filter(Boolean))
  const duplicateNames = prepared.filter(team => existingDivisionNames.has(team.nameKey)).map(team => team.name)
  if (duplicateNames.length && event.confirmRisks !== true) return { success:false, code:'IMPORT_TEAM_NAME_CONFLICT', message:`当前组别已有同名球队：${Array.from(new Set(duplicateNames)).join('、')}。请确认后再创建独立球队` }
  const capacity = divisionCapacity(division, tournament)
  if (capacity > 0 && activeRelations.length + prepared.length > capacity) return { success:false, code:'DIVISION_CAPACITY_EXCEEDED', message:`当前组别仅剩 ${Math.max(0, capacity - activeRelations.length)} 个名额` }

  const priorSources = []
  const sourceFileIds = prepared.map(item => item.sourceFileId)
  for (let offset = 0; offset < sourceFileIds.length; offset += 10) {
    const result = await db.collection('teams').where({ registrationSourceFileId:_.in(sourceFileIds.slice(offset, offset + 10)) }).limit(50).get()
    priorSources.push(...(result.data || []))
  }
  if (priorSources.length) return { success:false, code:'IMPORT_SOURCE_ALREADY_USED', message:'其中一份报名表已经导入过，请勿重复创建球队' }

  const artifacts = []
  const results = []
  let playerCount = 0
  try {
    for (const team of prepared) {
      const headCoach = team.staff.find(person => person.roleType === 'head_coach')
      const importBatchAdded = await db.collection('registration_import_batches').add({ data:{
        sport:SPORT, orgId:actor.orgId, tournamentId, divisionId, divisionName:text(division.name),
        sourceFileId:team.sourceFileId, sourceFileName:team.sourceFileName,
        importMode:'basic', immutable:true, status:'completed', claimStatus:'unclaimed', playerReviewStatus:'completed',
        snapshot:{
          team:{ name:team.name, shortName:team.shortName, contactName:team.contactName, contactPhoneMasked:team.contactPhone ? team.contactPhone.slice(0,3) + '****' + team.contactPhone.slice(-4) : '', logoFileId:team.logoFileId, kitColors:team.kitColors || null, kitColorLabels:team.kitColorLabels || null },
          staff:team.staff.map(person => ({ name:person.name, roleType:person.roleType, roleLabel:person.roleLabel, phoneMasked:person.phone ? person.phone.slice(0,3) + '****' + person.phone.slice(-4) : '', identityMasked:importedIdentityMask(person.identityNumber), birthDate:person.birthDate, gender:person.gender, nativePlace:person.nativePlace, photoFileId:person.photoFileId, jerseyNumber:person.jerseyNumber || '', jerseyName:person.jerseyName || '', dualRoleType:person.dualRoleType || '', dualRoleLabel:person.dualRoleLabel || '' })),
          players:team.players.map(person => ({ name:person.name, jerseyNumber:person.jerseyNumber, jerseyName:person.jerseyName, identityMasked:importedIdentityMask(person.identityNumber), identityDigest:importedIdentityDigest(person.identityNumber), birthDate:person.birthDate, gender:person.gender, nativePlace:person.nativePlace, photoFileId:person.photoFileId, order:person.order, dualRoleType:person.dualRoleType || '', dualRoleLabel:person.dualRoleLabel || '', eligibilityReviewRequired:person.eligibilityReviewRequired === true }))
        },
        teamName:team.name, playerCount:team.players.length, staffCount:team.staff.length, dualRoleCount:Number(team.dualRoleCount || 0), duplicatePlayerCount:Number(team.duplicatePlayerCount || 0),
        importedByUserId:actor.userId, createTime:db.serverDate(), updateTime:db.serverDate()
      } })
      const importBatchId = text(importBatchAdded._id)
      artifacts.push({ collection:'registration_import_batches', id:importBatchId })
      const teamAdded = await db.collection('teams').add({ data:{
        orgId:actor.orgId, name:team.name, shortName:team.shortName, logo:team.logoFileId, logoUrl:team.logoFileId, logoFileID:team.logoFileId,
        contactName:team.contactName, contactPhone:team.contactPhone, managerName:team.contactName, managerPhone:team.contactPhone, coachName:headCoach ? headCoach.name : '', claimStatus:'unclaimed',
        ...(team.kitColors ? { kitColors:team.kitColors, kitColorLabels:team.kitColorLabels || {}, kitColorsSource:'registration_docx_import', kitColorsImportedAt:db.serverDate() } : {}),
        source:'registration_docx_import', sourceType:'线下报名表', registrationImportBatchId:importBatchId, registrationSourceFileId:team.sourceFileId, registrationSourceFileName:team.sourceFileName,
        claimantCandidates:team.claimantCandidates.map(candidate => ({ role:candidate.role, roleLabel:candidate.roleLabel, name:candidate.name })),
        playerCount:team.players.length, pendingPlayerDraftCount:0, playerReviewStatus:'completed', staffCount:team.staff.length, dualRoleCount:Number(team.dualRoleCount || 0), creatorId:actor.userId, createTime:db.serverDate(), updateTime:db.serverDate()
      } })
      const teamId = text(teamAdded._id)
      artifacts.push({ collection:'teams', id:teamId })

      let sequence = 1
      const linkedCoachIds = new Map()
      const formalPlayerIds = []
      for (const person of team.staff) {
        const suffix = person.roleType === 'head_coach' ? 'A' : 'B'
        const added = await db.collection('coaches').add({ data:{
          orgId:actor.orgId, teamId, teamCode:teamId, teamName:team.name, playerId:`${teamId}${String(sequence).padStart(3, '0')}${suffix}`, memberId:`${teamId}${String(sequence).padStart(3, '0')}${suffix}`,
          name:person.name, phone:person.phone, idNumber:person.identityNumber, idCard:person.identityNumber, type:person.roleType, role:person.roleLabel || person.roleType,
          gender:person.gender, birthDate:person.birthDate, nativePlace:person.nativePlace, jerseyNumber:Number(person.jerseyNumber || 0), jerseyName:person.jerseyName || '', photoUrl:person.photoFileId, photoFileID:person.photoFileId, photoProcessingStatus:person.photoProcessingStatus,
          identityDigest:person.identityNumber ? importedIdentityDigest(person.identityNumber) : '', dualRoleType:person.dualRoleType || '', dualRoleLabel:person.dualRoleLabel || '', isAlsoPlayer:Boolean(person.dualRoleType),
          source:'registration_docx_import', registrationSourceFileId:team.sourceFileId, creatorId:actor.userId, createTime:db.serverDate(), updateTime:db.serverDate()
        } })
        const coachId = text(added._id)
        artifacts.push({ collection:'coaches', id:coachId })
        if (person.dualRoleType && person.identityNumber) linkedCoachIds.set(person.identityNumber, coachId)
        sequence += 1
      }
      for (const person of team.players) {
        const linkedCoachId = person.dualRoleType ? text(linkedCoachIds.get(person.identityNumber)) : ''
        const added = await db.collection('registration_player_drafts').add({ data:{
          sport:SPORT, orgId:actor.orgId, tournamentId, divisionId, importBatchId, sourceTeamId:teamId, teamId,
          name:person.name, jerseyNumber:Number(person.jerseyNumber || 0), jerseyName:person.jerseyName,
          identityDigest:importedIdentityDigest(person.identityNumber), identityMasked:importedIdentityMask(person.identityNumber),
          gender:person.gender || 'male', birthDate:person.birthDate, nativePlace:person.nativePlace,
          photoUrl:person.photoFileId, photoFileID:person.photoFileId, photoProcessingStatus:person.photoProcessingStatus,
          reviewStatus:'confirmed', conflictType:'', conflictReason:'', source:'registration_docx_import',
          dualRoleType:person.dualRoleType || '', dualRoleLabel:person.dualRoleLabel || '', isAlsoStaff:Boolean(person.dualRoleType), linkedCoachId, eligibilityReviewRequired:person.eligibilityReviewRequired === true,
          registrationSourceFileId:team.sourceFileId, immutableSource:true, order:person.order,
          creatorId:actor.userId, reviewedByUserId:actor.userId, reviewedAt:db.serverDate(), createTime:db.serverDate(), updateTime:db.serverDate()
        } })
        const draftId = text(added._id)
        artifacts.push({ collection:'registration_player_drafts', id:draftId })
        const playerAdded = await db.collection('players').add({ data:{
          orgId:actor.orgId, teamId, teamCode:teamId, teamName:team.name,
          playerId:`${teamId}${String(sequence).padStart(3, '0')}C`, name:person.name, jerseyNumber:Number(person.jerseyNumber || 0), jerseyName:person.jerseyName,
          gender:person.gender || 'male', nationality:'中国', birthDate:person.birthDate, nativePlace:person.nativePlace,
          photoUrl:person.photoFileId, photoFileID:person.photoFileId, photoProcessingStatus:person.photoProcessingStatus,
          identityDigest:importedIdentityDigest(person.identityNumber), identityNumberMasked:importedIdentityMask(person.identityNumber), identityStatus:'not_verified', identityVerificationLabel:'待人证核验',
          profileStatus:'pending', source:'registration_docx_import_direct', importDraftId:draftId, registrationImportBatchId:importBatchId, registrationSourceFileId:team.sourceFileId,
          dualRoleType:person.dualRoleType || '', dualRoleLabel:person.dualRoleLabel || '', isAlsoStaff:Boolean(person.dualRoleType), linkedCoachId, eligibilityReviewRequired:person.eligibilityReviewRequired === true,
          creatorId:actor.userId, registerTime:db.serverDate(), createTime:db.serverDate(), updateTime:db.serverDate()
        } })
        const formalPlayerId = text(playerAdded._id)
        artifacts.push({ collection:'players', id:formalPlayerId })
        formalPlayerIds.push(formalPlayerId)
        await db.collection('registration_player_drafts').doc(draftId).update({ data:{ confirmedPlayerId:formalPlayerId, updateTime:db.serverDate() } })
        if (linkedCoachId) await db.collection('coaches').doc(linkedCoachId).update({ data:{ linkedPlayerDraftId:draftId, linkedPlayerId:formalPlayerId, isAlsoPlayer:true, updateTime:db.serverDate() } })
        sequence += 1
        playerCount += 1
      }
      await db.collection('registration_import_batches').doc(importBatchId).update({ data:{ teamId, confirmedPlayerCount:formalPlayerIds.length, updateTime:db.serverDate() } })

      const manualReviewRequired = existingDivisionNames.has(team.nameKey)
      const relationAdded = await db.collection('tournament_teams').add({ data:{
        tournamentId, divisionId, divisionName:text(division.name), teamId, teamName:team.name, teamLogo:team.logoFileId, orgId:actor.orgId, teamOrgId:actor.orgId,
        creatorId:actor.userId, status:'invited', type:'invite', source:'registration_docx_import', joinSource:'organizer_import', claimStatus:'pending_confirmation',
        contactName:team.contactName, contactPhone:team.contactPhone, rosterStatus:'approved', rosterPlayerCount:formalPlayerIds.length, importedPlayerDraftCount:0, playerReviewStatus:'completed', dualRoleCount:Number(team.dualRoleCount || 0),
        ...(team.kitColors ? { kitColors:team.kitColors, kitColorLabels:team.kitColorLabels || {}, kitColorsSource:'registration_docx_import', kitColorsImportedAt:db.serverDate() } : {}),
        registrationImportBatchId:importBatchId, registrationSourceFileId:team.sourceFileId, riskStatus:manualReviewRequired ? '疑似同名球队' : '', manualReviewRequired,
        inviteTime:db.serverDate(), createTime:db.serverDate(), updateTime:db.serverDate()
      } })
      const tournamentTeamId = text(relationAdded._id)
      artifacts.push({ collection:'tournament_teams', id:tournamentTeamId })

      const rosterAdded = await db.collection('roster_snapshots').add({ data:{
        tournamentId, teamId, divisionId, divisionName:text(division.name), orgId:actor.orgId,
        playerIds:formalPlayerIds, version:1, status:'approved', source:'registration_docx_import_direct', autoApproved:true,
        approvedByUserId:actor.userId, approvedAt:db.serverDate(), createTime:db.serverDate(), updateTime:db.serverDate()
      } })
      const rosterSnapshotId = text(rosterAdded._id)
      artifacts.push({ collection:'roster_snapshots', id:rosterSnapshotId })
      await db.collection('tournament_teams').doc(tournamentTeamId).update({ data:{ rosterSnapshotId, updateTime:db.serverDate() } })

      const inviteAdded = await db.collection('team_invitations').add({ data:{
        type:'prebuilt_tournament_team', purpose:'tournament_registration', status:'pending', tournamentId, divisionId, teamId, tournamentTeamId,
        organizerOrgId:actor.orgId, organizerUserId:actor.userId, organizerName:text(tournament.organizerName || tournament.organizer),
        managerName:team.contactName, managerPhone:team.contactPhone, allowedClaimPhones:team.claimantCandidates.map(candidate => candidate.phone),
        claimantCandidates:team.claimantCandidates, claimRestriction:'verified_phone', divisionName:text(division.name),
        inviteExpireAt:tournament.registrationDeadline || tournament.signupDeadline || tournament.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        source:'registration_docx_import', registrationImportBatchId:importBatchId, registrationSourceFileId:team.sourceFileId, createTime:db.serverDate(), updateTime:db.serverDate()
      } })
      const inviteId = text(inviteAdded._id)
      artifacts.push({ collection:'team_invitations', id:inviteId })
      await db.collection('tournament_teams').doc(tournamentTeamId).update({ data:{ claimInviteId:inviteId, lastInviteTime:db.serverDate(), updateTime:db.serverDate() } })
      results.push({ clientKey:team.clientKey, teamId, teamName:team.name, tournamentTeamId, inviteId, importBatchId, rosterSnapshotId, path:`/pages/team/prebuilt-invite/prebuilt-invite?inviteId=${encodeURIComponent(inviteId)}`, playerCount:formalPlayerIds.length, pendingPlayerDraftCount:0, staffCount:team.staff.length, dualRoleCount:Number(team.dualRoleCount || 0), duplicatePlayerCount:Number(team.duplicatePlayerCount || 0), warnings:Number(team.duplicatePlayerCount || 0) ? [`报名表有 ${Number(team.duplicatePlayerCount)} 条重复人员，已各保留 1 条球员资料`] : [], manualReviewRequired })
    }
    await addAudit('team_registration_docx_batch_imported', { tournamentId, divisionId, actorUserId:actor.userId, actorOrgId:actor.orgId, detail:{ teamCount:results.length, playerCount, dualRoleCount:prepared.reduce((sum, team) => sum + Number(team.dualRoleCount || 0), 0), duplicatePlayerCount:prepared.reduce((sum, team) => sum + Number(team.duplicatePlayerCount || 0), 0), source:'registration_docx_import' } })
    return { success:true, message:`已创建 ${results.length} 支待认领球队、${playerCount} 名正式球员和本届正式名单`, data:{ teams:results, playerCount, playerMode:'formal', rosterMode:'approved' } }
  } catch (error) {
    await rollbackImportedArtifacts(artifacts)
    throw error
  }
}

async function createTargetedTeamInvitations(event) {
  const actor = await webActor(event)
  if (!actor) return { success:false, code:'AUTH_REQUIRED', message:'登录会话或机构信息已失效，请重新登录' }
  const tournamentId = text(event.tournamentId)
  const divisionId = text(event.divisionId)
  const teamIds = Array.from(new Set((Array.isArray(event.teamIds) ? event.teamIds : []).map(text).filter(Boolean))).slice(0, 50)
  if (!teamIds.length) return { success:false, code:'TEAM_REQUIRED', message:'请至少选择一支球队' }
  const [tournament, division] = await Promise.all([getDocument('tournaments', tournamentId), getDocument('divisions', divisionId)])
  if (!tournament || recordOrgId(tournament) !== actor.orgId) return { success:false, code:'TOURNAMENT_SCOPE_DENIED', message:'赛事不存在或无权邀请球队' }
  if (!division || text(division.tournamentId) !== tournamentId) return { success:false, code:'DIVISION_REQUIRED', message:'竞赛组别不存在或不属于当前赛事' }
  if (!registrationOpen(tournament, division)) return { success:false, code:'DIVISION_REGISTRATION_CLOSED', message:'请先开启当前竞赛组别报名' }
  const teamResult = await db.collection('teams').where({ _id:_.in(teamIds), orgId:actor.orgId }).limit(50).get()
  const teams = teamResult.data || []
  if (teams.length !== teamIds.length) return { success:false, code:'TEAM_SCOPE_DENIED', message:'所选球队包含不存在或其他机构球队' }
  if (teams.some(team => team.synthetic === true || text(team.syntheticDatasetId))) return { success:false, code:'SYNTHETIC_TEAM_NOT_ALLOWED', message:'定向邀请只适用于真实球队；虚拟球队请使用“添加虚拟球队”入口' }
  const existing = (await db.collection('tournament_teams').where({ tournamentId, divisionId }).limit(100).get()).data || []
  const activeRows = existing.filter(item => !['invite_cancelled','cancelled','withdrawn','removed','rejected'].includes(text(item.status).toLowerCase()))
  const activeByTeam = new Map(activeRows.map(item => [text(item.teamId), item]))
  const additions = teams.filter(team => !activeByTeam.has(text(team._id)))
  const capacity = divisionCapacity(division, tournament)
  if (capacity > 0 && activeRows.length + additions.length > capacity) return { success:false, code:'DIVISION_CAPACITY_EXCEEDED', message:`当前组别目标${capacity}支球队，所选数量超过剩余名额` }
  const results = []
  for (const team of teams) {
    const existingRow = activeByTeam.get(text(team._id))
    let relation
    if (existingRow) {
      relation = existingRow
    } else {
      const added = await db.collection('tournament_teams').add({ data:{ tournamentId, divisionId, divisionName:text(division.name), teamId:team._id, teamName:text(team.name || team.teamName), teamLogo:text(team.logo || team.logoUrl), orgId:actor.orgId, teamOrgId:actor.orgId, creatorId:actor.userId, status:'invited', type:'invite', source:'organizer_targeted_invite', joinSource:'invite', claimStatus:'pending_confirmation', contactName:text(team.contactName || team.managerName), contactPhone:text(team.contactPhone || team.managerPhone || team.ownerPhone), ...(team.kitColors ? { kitColors:team.kitColors, kitColorLabels:team.kitColorLabels || {}, kitColorsSource:text(team.kitColorsSource || 'team_profile') } : {}), inviteTime:db.serverDate(), createTime:db.serverDate(), updateTime:db.serverDate() } })
      relation = { _id:added._id, status:'invited' }
    }
    const inviteRows = (await db.collection('team_invitations').where({ type:'prebuilt_tournament_team', tournamentId, divisionId, teamId:team._id, tournamentTeamId:relation._id, organizerOrgId:actor.orgId, status:'pending' }).limit(10).get()).data || []
    let teamInvite = inviteRows[0]
    if (!teamInvite) {
      const createdInvite = await db.collection('team_invitations').add({ data:{ type:'prebuilt_tournament_team', purpose:'tournament_registration', status:'pending', tournamentId, divisionId, teamId:team._id, tournamentTeamId:relation._id, organizerOrgId:actor.orgId, organizerUserId:actor.userId, organizerName:text(tournament.organizerName || tournament.organizer), managerName:text(team.contactName || team.managerName), managerPhone:text(team.contactPhone || team.managerPhone || team.ownerPhone), divisionName:text(division.name), inviteExpireAt:tournament.registrationDeadline || tournament.signupDeadline || tournament.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), source:'pc_targeted_registration_invite', createTime:db.serverDate(), updateTime:db.serverDate() } })
      teamInvite = { _id:createdInvite._id }
    }
    await db.collection('tournament_teams').doc(relation._id).update({ data:{ claimInviteId:teamInvite._id, lastInviteTime:db.serverDate(), updateTime:db.serverDate() } })
    results.push({ teamId:team._id, teamName:text(team.name || team.teamName), tournamentTeamId:relation._id, inviteId:teamInvite._id, path:`/pages/team/prebuilt-invite/prebuilt-invite?inviteId=${encodeURIComponent(teamInvite._id)}`, reused:Boolean(existingRow), status:text(relation.status || 'invited') })
  }
  await addAudit('targeted_team_invitations_created', { tournamentId, divisionId, actorUserId:actor.userId, actorOrgId:actor.orgId, detail:{ requested:teamIds.length, created:additions.length } })
  return { success:true, message:`已准备${results.length}支球队的专属邀请`, data:{ invitations:results, divisionName:text(division.name) } }
}

async function generateTeamInviteCode(event) {
  const actor = await webActor(event)
  if (!actor) return { success:false, code:'AUTH_REQUIRED', message:'登录会话或机构信息已失效，请重新登录' }
  const inviteId = text(event.inviteId)
  const invite = inviteId ? await getDocument('team_invitations', inviteId) : null
  if (!invite || text(invite.organizerOrgId) !== actor.orgId) return { success:false, code:'INVITE_SCOPE_DENIED', message:'球队邀请不存在或不属于当前机构' }
  const tournament = await getDocument('tournaments', text(invite.tournamentId))
  if (!tournament || recordOrgId(tournament) !== actor.orgId) return { success:false, code:'TOURNAMENT_SCOPE_DENIED', message:'无权生成该邀请的小程序码' }
  const page = 'pages/team/prebuilt-invite/prebuilt-invite'
  const actualVersion = envVersion(event.envVersion)
  const testOnly = actualVersion !== 'release'
  const codeBuffer = await miniProgramCode({ scene:inviteId.slice(0, 32), page, width:Number(event.width || 300), envVersion:actualVersion, checkPath:!testOnly })
  const urlLink = testOnly ? '' : await directMiniProgramUrlLink(page, `inviteId=${encodeURIComponent(inviteId)}`)
  const cloudPath = `football/team-registration-invites/${invite.tournamentId}/${inviteId}-${actualVersion}.png`
  const uploaded = await cloud.uploadFile({ cloudPath, fileContent:codeBuffer })
  const urls = await cloud.getTempFileURL({ fileList:[uploaded.fileID] })
  const qrCodeUrl = urls.fileList && urls.fileList[0] && urls.fileList[0].tempFileURL || ''
  await db.collection('team_invitations').doc(inviteId).update({ data:{ qrCodeFileId:uploaded.fileID, qrCodeUrl, urlLink, qrEnvVersion:actualVersion, lastSharedAt:db.serverDate(), updateTime:db.serverDate() } })
  return { success:true, data:{ inviteId, path:`/pages/team/prebuilt-invite/prebuilt-invite?inviteId=${encodeURIComponent(inviteId)}`, urlLink, qrCodeUrl, envVersion:actualVersion, testOnly } }
}

async function ensureInvite(event) {
  const actor = await webActor(event)
  if (!actor) return { success: false, code: 'AUTH_REQUIRED', message: '登录会话或机构信息已失效，请重新登录' }
  const tournamentId = text(event.tournamentId)
  const requestedDivisionId = text(event.divisionId)
  const tournament = await getDocument('tournaments', tournamentId)
  if (!tournament || recordOrgId(tournament) !== actor.orgId) return { success: false, code: 'TOURNAMENT_SCOPE_DENIED', message: '赛事不存在或无权生成报名邀请' }
  const divisions = (await db.collection('divisions').where({ tournamentId }).limit(100).get()).data || []
  if (divisions.length === 0) return { success: false, code: 'DIVISION_REQUIRED', message: '请先创建至少一个竞赛组别' }
  const selectedDivision = divisions.find(item => text(item._id || item.id) === requestedDivisionId) || (!requestedDivisionId && divisions.length === 1 ? divisions[0] : null)
  if (!selectedDivision) return { success: false, code: 'DIVISION_REQUIRED', message: '请选择要生成报名海报的竞赛组别' }
  const divisionId = text(selectedDivision._id || selectedDivision.id)
  if (!registrationOpen(tournament, selectedDivision)) return { success: false, code: 'DIVISION_REGISTRATION_CLOSED', message: `请先在竞赛管理的操作菜单中开启“${text(selectedDivision.name || selectedDivision.divisionName) || '当前组别'}”报名` }

  const activeResult = await db.collection('tournament_invites').where({ sport: SPORT, tournamentId, divisionId, inviteType:'public_registration', status: 'active' }).limit(2).get()
  let invite = (activeResult.data || [])[0] || null
  if (!invite) {
    const inviteKey = randomKey(16)
    const created = await db.collection('tournament_invites').add({ data: {
      sport: SPORT, inviteType:'public_registration', tournamentId, tournamentName: text(tournament.name), divisionId, divisionName:text(selectedDivision.name || selectedDivision.divisionName), organizerOrgId: actor.orgId,
      inviteKey, status: 'active', page: REGISTER_PAGE, createBy: actor.userId,
      createTime: db.serverDate(), updateTime: db.serverDate()
    } })
    invite = { _id: created._id, inviteKey, tournamentId, status: 'active', page: REGISTER_PAGE }
    await addAudit('registration_invite_created', { tournamentId, divisionId, inviteId: created._id, actorUserId: actor.userId, actorOrgId: actor.orgId })
  }

  const version = envVersion(event.envVersion)
  const testOnly = version !== 'release'
  const needsVersionAssets = !invite.qrCodeUrl || invite.envVersion !== version
  if (needsVersionAssets) {
    const codeBuffer = await miniProgramCode({ scene: `i=${invite.inviteKey}`, page: REGISTER_PAGE, width: Number(event.width || 300), envVersion: version, checkPath:!testOnly })
    const cloudPath = `football/registration-invites/${tournamentId}/${invite._id}-${version}.png`
    const uploaded = await cloud.uploadFile({ cloudPath, fileContent: codeBuffer })
    const urls = await cloud.getTempFileURL({ fileList: [uploaded.fileID] })
    const qrCodeUrl = urls.fileList && urls.fileList[0] && urls.fileList[0].tempFileURL || ''
    await db.collection('tournament_invites').doc(invite._id).update({ data: { qrCodeFileId: uploaded.fileID, qrCodeUrl, envVersion: version, page: REGISTER_PAGE, updateTime: db.serverDate() } })
    invite = { ...invite, qrCodeFileId: uploaded.fileID, qrCodeUrl, envVersion: version }
  }
  let urlLink = testOnly ? '' : text(invite.urlLink)
  if (!testOnly && (!urlLink || needsVersionAssets)) {
    urlLink = await directMiniProgramUrlLink(REGISTER_PAGE, `inviteKey=${encodeURIComponent(invite.inviteKey)}`)
    await db.collection('tournament_invites').doc(invite._id).update({ data:{ urlLink, updateTime:db.serverDate() } })
  }
  return { success: true, data: { inviteId: invite._id, qrCodeUrl: invite.qrCodeUrl, urlLink, envVersion:version, testOnly, page: REGISTER_PAGE, guideSteps: ['进入赛小蜂足球小程序', '按提示关注服务号并完成绑定', '选择球队并确认参赛'] } }
}

async function createTargetedRegistrationLink(event) {
  const actor = await webActor(event)
  if (!actor) return { success:false, code:'AUTH_REQUIRED', message:'登录会话或机构信息已失效，请重新登录' }
  const tournamentId = text(event.tournamentId)
  const tournament = await getDocument('tournaments', tournamentId)
  if (!tournament || recordOrgId(tournament) !== actor.orgId) return { success:false, code:'TOURNAMENT_SCOPE_DENIED', message:'赛事不存在或无权生成邀约' }
  const divisions = (await db.collection('divisions').where({ tournamentId }).limit(100).get()).data || []
  const openDivisions = divisions.filter(division => registrationOpen(tournament, division))
  if (!openDivisions.length) return { success:false, code:'DIVISION_REGISTRATION_CLOSED', message:'当前赛事没有已开启报名的竞赛组别' }
  const inviteKey = randomKey(16)
  const intendedTeamName = text(event.intendedTeamName).slice(0, 60)
  const contactName = text(event.contactName).slice(0, 40)
  const contactPhone = text(event.contactPhone).replace(/\s/g, '').slice(0, 20)
  const created = await db.collection('tournament_invites').add({ data:{ sport:SPORT, inviteType:'targeted_registration', tournamentId, tournamentName:text(tournament.name), divisionId:'', divisionName:'报名时选择组别', availableDivisionIds:openDivisions.map(item => text(item._id || item.id)), organizerOrgId:actor.orgId, createBy:actor.userId, inviteKey, intendedTeamName, contactName, contactPhone, status:'active', page:REGISTER_PAGE, longTerm:true, createTime:db.serverDate(), updateTime:db.serverDate() } })
  const inviteId = created._id
  const actualVersion = envVersion(event.envVersion)
  const testOnly = actualVersion !== 'release'
  const codeBuffer = await miniProgramCode({ scene:`i=${inviteKey}`, page:REGISTER_PAGE, width:Number(event.width || 300), envVersion:actualVersion, checkPath:!testOnly })
  const cloudPath = `football/targeted-registration-links/${tournamentId}/${inviteId}-${actualVersion}.png`
  const uploaded = await cloud.uploadFile({ cloudPath, fileContent:codeBuffer })
  const urls = await cloud.getTempFileURL({ fileList:[uploaded.fileID] })
  const qrCodeUrl = urls.fileList && urls.fileList[0] && urls.fileList[0].tempFileURL || ''
  const urlLink = testOnly ? '' : await directMiniProgramUrlLink(REGISTER_PAGE, `inviteKey=${encodeURIComponent(inviteKey)}`)
  await db.collection('tournament_invites').doc(inviteId).update({ data:{ qrCodeFileId:uploaded.fileID, qrCodeUrl, urlLink, envVersion:actualVersion, updateTime:db.serverDate() } })
  await addAudit('targeted_registration_link_created', { tournamentId, divisionId:'', inviteId, actorUserId:actor.userId, actorOrgId:actor.orgId, detail:{ availableDivisionCount:openDivisions.length, envVersion:actualVersion } })
  return { success:true, message:testOnly ? '球队邀约体验版二维码已生成' : '球队邀约正式二维码和完整链接已生成', data:{ inviteId, path:`/pages/tournament/signup/signup?inviteKey=${encodeURIComponent(inviteKey)}`, urlLink, qrCodeUrl, envVersion:actualVersion, testOnly, longTerm:true, intendedTeamName:'', divisionName:'报名时选择组别', availableDivisions:openDivisions.map(item => ({ id:item._id || item.id, name:text(item.name || item.divisionName) })), expiresAt:'' } }
}

// 与 organizerClaimInvite / applyTournament / clearTournamentTeams / webLoginApi 保持同一判定。
// 云函数各自独立打包、无法共享模块，因此沿用本仓库既有的“每个函数内保留同一份锁定判定”约定；
// 修改任一处的判定语义时必须同步其余函数，否则会出现“某入口已锁定、某入口仍可写”的裂缝。
function competitionPlanLocked(tournament) {
  if (!tournament) return false
  if (tournament.competitionPlanLocked === true || tournament.finalPlanLocked === true ||
    ['locked', 'match_management', 'in_progress', 'completed'].includes(text(tournament.competitionPlanStatus).toLowerCase())) return true
  return (Array.isArray(tournament.divisions) ? tournament.divisions : []).some(function(division) {
    return division && (division.competitionPlanLocked === true || division.finalPlanLocked === true ||
      ['locked', 'match_management', 'in_progress', 'completed'].includes(text(division.competitionPlanStatus).toLowerCase()))
  })
}

// 与 organizerClaimInvite.inviteExpiry 同一口径：报名截止 / 报名结束 / 赛事结束，缺失时回退 30 天。
function claimCodeExpireAt(tournament) {
  const explicit = dateValue(tournament && (tournament.registrationDeadline || tournament.signupDeadline || tournament.endDate))
  if (explicit > 0) return explicit
  return Date.now() + 30 * 24 * 60 * 60 * 1000
}

async function findReusableClaimCode(tournamentId, orgId) {
  const result = await db.collection('tournament_invites')
    .where({ sport: SPORT, inviteType: 'tournament_claim_code', tournamentId, status: 'active' })
    .limit(5)
    .get()
  const now = Date.now()
  return (result.data || []).find(function(row) {
    if (text(row.organizerOrgId) !== text(orgId)) return false
    const rowExpire = dateValue(row.expireAt)
    return rowExpire <= 0 || rowExpire > now
  }) || null
}

function claimCodeResult(record, tournament, expiresAt) {
  const inviteKey = text(record && record.inviteKey)
  return {
    inviteId: text(record && record._id),
    inviteKey,
    path: `${CLAIM_CODE_PAGE}?c=${encodeURIComponent(inviteKey)}`,
    urlLink: text(record && record.urlLink),
    qrCodeUrl: text(record && record.qrCodeUrl),
    tournamentId: text(tournament && tournament._id),
    tournamentName: text(tournament && tournament.name),
    expiresAt: new Date(expiresAt).toISOString()
  }
}

// 赛事级球队认领码：一个赛事一个码，供主办方群发或张贴。
// 码本身不承载授权——球队归属判定仍由 getMiniWorkspace 按 allowedClaimPhones 逐条校验，
// 因此码即使被转发给无关人员，也不会泄露或转移任何球队。
async function createTournamentClaimCode(event) {
  const actor = await webActor(event)
  if (!actor) return { success:false, code:'AUTH_REQUIRED', message:'登录会话或机构信息已失效，请重新登录' }
  const tournamentId = text(event.tournamentId)
  const tournament = await getDocument('tournaments', tournamentId)
  if (!tournament || recordOrgId(tournament) !== actor.orgId) return { success:false, code:'TOURNAMENT_SCOPE_DENIED', message:'赛事不存在或无权生成球队认领码' }
  if (competitionPlanLocked(tournament)) return { success:false, code:'COMPETITION_PLAN_LOCKED', message:'竞赛方案已确认，不能生成球队认领码' }
  const expiresAt = claimCodeExpireAt(tournament)
  const actualVersion = envVersion(event.envVersion)
  const testOnly = actualVersion !== 'release'
  // 同一赛事只保留一个可用认领码：已存在未过期、同机构的直接复用，
  // 避免反复点击让多条有效码并存，也保证已群发或已张贴的码继续可用。
  const reusable = await findReusableClaimCode(tournamentId, actor.orgId)
  const reusableUsable = reusable && text(reusable.qrCodeUrl) && (testOnly || text(reusable.urlLink))
  if (reusableUsable) {
    return { success:true, message:'已复用当前赛事有效的球队认领码', data:Object.assign(claimCodeResult(reusable, tournament, dateValue(reusable.expireAt) || expiresAt), { envVersion:actualVersion, testOnly }) }
  }
  const inviteKey = reusable ? text(reusable.inviteKey) : randomKey(16)
  // 小程序码与小程序短链都要求目标页面存在于对应版本的小程序里；页面不存在时微信返回
  // 41030（invalid page），通常是新版小程序尚未上传/发布。这里翻译成可执行指引，
  // 避免把微信原始错误码直接透给操作人。
  let codeBuffer = null
  let urlLink = ''
  try {
    codeBuffer = await miniProgramCode({ scene:`c=${inviteKey}`, page:CLAIM_CODE_PAGE, width:Number(event.width || 300), envVersion:actualVersion, checkPath:!testOnly })
    urlLink = testOnly ? '' : await directMiniProgramUrlLink(CLAIM_CODE_PAGE, `c=${encodeURIComponent(inviteKey)}`, { envVersion:actualVersion, expiresAt })
  } catch (error) {
    const signature = `${text(error && error.code)} ${text(error && error.message)}`
    if (/41030|invalid\s*page/i.test(signature)) {
      return { success:false, code:'CLAIM_CODE_PAGE_MISSING', message:`小程序${testOnly ? '体验版' : '正式版'}尚未包含球队认领页（${CLAIM_CODE_PAGE}），无法生成赛事认领码。请先上传并发布包含该页面的新版小程序；在此期间请改用每支球队的「认领链接」。` }
    }
    throw error
  }
  const cloudPath = `football/tournament-claim-codes/${tournamentId}/${inviteKey}-${actualVersion}.png`
  const uploaded = await cloud.uploadFile({ cloudPath, fileContent:codeBuffer })
  const urls = await cloud.getTempFileURL({ fileList:[uploaded.fileID] })
  const qrCodeUrl = urls.fileList && urls.fileList[0] && urls.fileList[0].tempFileURL || ''
  const payload = {
    sport:SPORT, inviteType:'tournament_claim_code', tournamentId, tournamentName:text(tournament.name),
    organizerOrgId:actor.orgId, createBy:actor.userId, inviteKey, status:'active', page:CLAIM_CODE_PAGE, longTerm:true,
    qrCodeFileId:uploaded.fileID, qrCodeUrl, urlLink, envVersion:actualVersion, expireAt:new Date(expiresAt), updateTime:db.serverDate()
  }
  let inviteId = text(reusable && reusable._id)
  if (inviteId) await db.collection('tournament_invites').doc(inviteId).update({ data:payload })
  else {
    const created = await db.collection('tournament_invites').add({ data:Object.assign({}, payload, { createTime:db.serverDate() }) })
    inviteId = text(created._id)
  }
  await addAudit('tournament_claim_code_created', { tournamentId, inviteId, actorUserId:actor.userId, actorOrgId:actor.orgId, detail:{ envVersion:actualVersion, reused:Boolean(reusable), expiresAt:new Date(expiresAt).toISOString() } })
  return { success:true, message:testOnly ? '球队认领码体验版已生成' : '球队认领码正式版已生成', data:Object.assign(claimCodeResult({ _id:inviteId, inviteKey, qrCodeUrl, urlLink }, tournament, expiresAt), { envVersion:actualVersion, testOnly }) }
}

async function getInvitation(event) {
  const invite = await invitationByKey(event.inviteKey)
  // 认领码与报名邀请共用 tournament_invites 集合，但语义不同：认领码只用于小程序认领页，
  // 不能被当作报名邀请打开，否则会出现“用认领码进入报名流程”的越权路径。
  if (!invite || invite.status !== 'active' || text(invite.inviteType) === 'tournament_claim_code') return { success: false, code: 'INVITE_INVALID', message: '报名邀请无效或已重置' }
  const tournament = await getDocument('tournaments', invite.tournamentId)
  if (!tournament) return { success: false, code: 'TOURNAMENT_NOT_FOUND', message: '赛事不存在' }
  const divisions = (await db.collection('divisions').where({ tournamentId: invite.tournamentId }).limit(100).get()).data || []
  const registrations = await listAll('tournament_teams', { tournamentId: invite.tournamentId }, 5000)
  const capacityCounts = registrations.reduce((counts, item) => {
    if (!['approved', 'invited'].includes(text(item.status).toLowerCase())) return counts
    const divisionId = text(item.divisionId || item.division || 'default') || 'default'
    counts[divisionId] = Number(counts[divisionId] || 0) + 1
    return counts
  }, {})
  const fixedDivisionId = text(invite.divisionId)
  const displayDivisions = divisions.map((item, order) => {
    const id = text(item._id || item.id)
    const maxTeams = divisionCapacity(item, tournament)
    const registeredTeams = Number(capacityCounts[id] || 0)
    const isOpen = registrationOpen(tournament, item)
    const allowedByInvite = !fixedDivisionId || id === fixedDivisionId
    const isFull = maxTeams > 0 && registeredTeams >= maxTeams
    const selectable = allowedByInvite && isOpen && !isFull
    let statusText = ''
    if (!allowedByInvite) statusText = '非本次邀请'
    else if (isFull) statusText = '已满'
    else if (!isOpen) statusText = '已关闭'
    return {
      id,
      name: text(item.name || item.divisionName || '未命名组别'),
      maxTeams,
      maxPlayersPerTeam: Number(item.maxPlayersPerTeam || item.maxPlayers || 0),
      registeredTeams,
      registrationOpen: isOpen,
      allowedByInvite,
      isFull,
      selectable,
      statusText,
      order
    }
  }).sort((a, b) => Number(b.selectable) - Number(a.selectable) || a.order - b.order)
  const firstSelectable = displayDivisions.find(item => item.selectable)
  return { success: true, data: {
    inviteKey: invite.inviteKey, inviteType:text(invite.inviteType || 'public_registration'), tournamentId: invite.tournamentId, defaultDivisionId:fixedDivisionId || text(firstSelectable && firstSelectable.id), registrationOpen: displayDivisions.some(item => item.registrationOpen), hasSelectableDivision:Boolean(firstSelectable), intendedTeamName:text(invite.intendedTeamName), contactName:text(invite.contactName),
    tournament: { _id: tournament._id, name: tournament.name, status: tournament.status, startDate: tournament.startDate, endDate: tournament.endDate, location: tournament.location || tournament.region || '', organizerName: tournament.organizerName || '' },
    divisions: displayDivisions,
    miniSubscribeTemplateId: miniReviewTemplateId(),
    serviceBindingConfigured: Boolean(text(process.env.SXF_FOOTBALL_SERVICE_FOLLOW_URL))
  } }
}

async function createFollowGate(event) {
  const openId = miniOpenId()
  if (!openId) return { success: false, code: 'MINI_AUTH_REQUIRED', message: '请先完成小程序微信登录' }
  let invite = null
  let tournamentId = text(event.tournamentId)
  if (text(event.inviteKey)) {
    invite = await invitationByKey(event.inviteKey)
    if (!invite || invite.status !== 'active') return { success: false, code: 'INVITE_INVALID', message: '报名邀请无效' }
    tournamentId = text(invite.tournamentId)
  }
  if (!tournamentId) return { success: false, code: 'TOURNAMENT_REQUIRED', message: '缺少赛事信息' }
  const tournament = await getDocument('tournaments', tournamentId)
  if (!tournament) return { success: false, code: 'TOURNAMENT_NOT_FOUND', message: '赛事不存在' }

  const bindings = await db.collection('service_account_bindings').where({ sport: SPORT, miniOpenId: openId, subscribed: true }).limit(2).get()
  const binding = (bindings.data || [])[0]
  if (binding && text(binding.officialOpenId)) {
    return { success: true, data: { gateId: '', status: 'subscribed', subscribed: true, configured: true, followUrl: '' } }
  }

  const existing = await db.collection('service_follow_gates').where({ sport: SPORT, tournamentId, miniOpenId: openId }).limit(20).get()
  let gate = (existing.data || []).find(item => item.subscribed === true) || (existing.data || []).find(item => text(item.status) === 'waiting') || null
  if (gate && gate.subscribed === true && text(gate.officialOpenId)) {
    return { success: true, data: { gateId: gate._id, status: 'subscribed', subscribed: true, configured: true, followUrl: '' } }
  }
  if (!gate) {
    const scene = `fb_${randomKey(10)}`
    const created = await db.collection('service_follow_gates').add({ data: { sport: SPORT, tournamentId, inviteId: invite ? invite._id : '', miniOpenId: openId, scene, status: 'waiting', subscribed: false, createTime: db.serverDate(), updateTime: db.serverDate() } })
    gate = { _id: created._id, scene, status: 'waiting', subscribed: false }
    await addAudit('service_follow_gate_created', { tournamentId, inviteId: invite ? invite._id : '', detail: { gateId: created._id } })
  }
  let followUrl = text(gate.followUrl)
  let configured = false
  const qrStillValid = followUrl && dateValue(gate.qrExpireAt) > Date.now() + 60000
  if (!qrStillValid) {
    try {
      const code = await serviceFollowCode(gate.scene)
      followUrl = code.url
      configured = true
      await db.collection('service_follow_gates').doc(gate._id).update({ data: { followUrl, qrTicket: code.ticket, qrExpireAt: new Date(Date.now() + code.expireSeconds * 1000), updateTime: db.serverDate() } })
    } catch (error) {
      if (error.wechatCode === 40164) {
        error.message = '服务号接口IP白名单未包含当前云函数出口IP，请管理员完成配置后重试'
        throw error
      }
      if (error.code !== 'SERVICE_CREDENTIALS_REQUIRED') throw error
      const template = text(process.env.SXF_FOOTBALL_SERVICE_FOLLOW_URL)
      followUrl = template ? template.replace('{scene}', encodeURIComponent(gate.scene)) : ''
      configured = Boolean(followUrl)
    }
  } else configured = true
  return { success: true, data: { gateId: gate._id, status: gate.status, subscribed: gate.subscribed === true, configured, followUrl } }
}

async function createRefereeFollowInviteRecord(actor,tournament,target,options) {
  const config=options||{}
  const tournamentId=text(tournament&&tournament._id)
  const targetRefereeId=text(target&&target._id)
  const claimMode=text(config.claimMode || (target&&target.temporaryReferee===true?'temporary_no_certificate':''))
  const targetPhone=normalizePhone(target&&(target.phone||target.phoneNumber))
  let boundOfficialOpenId=text(config.officialOpenId)
  if(claimMode==='temporary_no_certificate'&&targetPhone&&!boundOfficialOpenId){
    const identities=(await db.collection('service_identities').where({phone:targetPhone,phoneVerified:true}).limit(5).get()).data||[]
    const bound=identities.filter(function(item){return text(item.serviceAccountOpenId)})
    if(bound.length>1){const error=new Error('该手机号存在重复服务号身份，请先人工核验');error.code='SERVICE_IDENTITY_CONFLICT';throw error}
    boundOfficialOpenId=text(bound[0]&&bound[0].serviceAccountOpenId)
  }
  const alreadyBound=!!boundOfficialOpenId
  const token='ref-'+Date.now()+'-'+randomKey(12)
  const scene=text(config.scene)||'rf_'+randomKey(12)
  const h5Path=config.previewMode===true?'/preview/service-account-h5/':'/service-account-h5/'
  const registerUrl='https://www.sxffootball.cn'+h5Path+'?refereeInvite='+encodeURIComponent(token)
  const code=config.code||await serviceFollowCode(scene)
  const invitationAdded=await db.collection('referee_invitations').add({data:{tournamentId,orgId:actor.orgId,targetRefereeId,targetRefereeName:text(target&&(target.name||target.realName)),targetRefereePhone:targetPhone,claimMode,claimReason:text(target&&target.temporaryReason).slice(0,200),token,status:'active',source:claimMode==='temporary_no_certificate'?'organizer_temporary_referee_claim_follow':(target?'synthetic_profile_claim_follow':'organizer_follow_qr'),followRequired:true,followStatus:alreadyBound?'subscribed':'waiting',officialOpenId:boundOfficialOpenId,followedAt:alreadyBound?db.serverDate():null,scene,registerUrl,createTime:db.serverDate(),updateTime:db.serverDate()}})
  const gateAdded=await db.collection('service_follow_gates').add({data:{sport:SPORT,tournamentId,purpose:'referee_invite',refereeInviteId:invitationAdded._id,scene,status:alreadyBound?'subscribed':'waiting',subscribed:alreadyBound,officialOpenId:boundOfficialOpenId,registerUrl,followUrl:code.url,qrTicket:code.ticket,qrExpireAt:new Date(Date.now()+code.expireSeconds*1000),createTime:db.serverDate(),updateTime:db.serverDate()}})
  await db.collection('referee_invitations').doc(invitationAdded._id).update({data:{followGateId:gateAdded._id,followQrCodeUrl:code.url,updateTime:db.serverDate()}})
  await addAudit('referee_follow_invite_created',{tournamentId,inviteId:invitationAdded._id,actorUserId:actor.userId,actorOrgId:actor.orgId,detail:{gateId:gateAdded._id,targetRefereeId,claimMode}})
  return { invitationId:invitationAdded._id,gateId:gateAdded._id,qrCodeUrl:code.url,registerUrl,claimMode }
}

async function createRefereeFollowInvite(event) {
  const actor=await webActor(event)
  if(!actor)return {success:false,code:'AUTH_REQUIRED',message:'登录会话或机构信息已失效，请重新登录'}
  const tournamentId=text(event.tournamentId)
  const tournament=await getDocument('tournaments',tournamentId)
  if(!tournament||recordOrgId(tournament)!==actor.orgId)return {success:false,code:'TOURNAMENT_SCOPE_DENIED',message:'赛事不存在或无权邀请裁判'}
  const targetRefereeId=text(event.targetRefereeId)
  let target=null
  if(targetRefereeId){target=await getDocument('referees',targetRefereeId);if(!target||text(target.tournamentId)!==tournamentId)return {success:false,code:'REFEREE_SCOPE_DENIED',message:'待绑定裁判不属于当前赛事'}}
  const invite=await createRefereeFollowInviteRecord(actor,tournament,target,{previewMode:event.previewMode===true})
  const temporary=invite.claimMode==='temporary_no_certificate'
  return {success:true,message:temporary?'临时裁判认领二维码已生成':'裁判关注登记二维码已生成',data:{inviteId:invite.invitationId,gateId:invite.gateId,qrCodeUrl:invite.qrCodeUrl,registerUrl:invite.registerUrl,status:'waiting',followRequired:true,claimMode:invite.claimMode,guideSteps:temporary?['扫码关注赛小蜂足球助手','验证组委会登记的手机号','上传头像并提交认领']:['扫码关注赛小蜂足球助手','在服务号消息中点击裁判登记入口','提交裁判证与头像等待审核']}}
}

function temporaryClaimTimeText() {
  const now=new Date(Date.now()+8*60*60*1000)
  return now.toISOString().slice(0,16).replace('T',' ')
}

async function createTemporaryRefereeClaim(event) {
  const actor=await webActor(event)
  if(!actor)return {success:false,code:'AUTH_REQUIRED',message:'登录会话或机构信息已失效，请重新登录'}
  const tournamentId=text(event.tournamentId)
  const tournament=await getDocument('tournaments',tournamentId)
  if(!tournament||recordOrgId(tournament)!==actor.orgId)return {success:false,code:'TOURNAMENT_SCOPE_DENIED',message:'赛事不存在或无权添加临时裁判'}
  const name=text(event.name).slice(0,40)
  const phone=normalizePhone(event.phone)
  const reason=text(event.reason).slice(0,200)
  if(name.length<2)return {success:false,code:'REFEREE_NAME_REQUIRED',message:'请填写裁判姓名'}
  if(!/^1[3-9]\d{9}$/.test(phone))return {success:false,code:'REFEREE_PHONE_INVALID',message:'请填写正确的手机号'}
  if(reason.length<4)return {success:false,code:'TEMPORARY_REASON_REQUIRED',message:'请填写组委会添加原因'}
  const duplicates=(await db.collection('referees').where(_.or([{tournamentId,phone},{tournamentId,phoneNumber:phone}])).limit(5).get()).data||[]
  if(duplicates.length)return {success:false,code:'REFEREE_DUPLICATED',message:'该手机号已在本赛事裁判名单中'}
  const scene='rf_'+randomKey(12)
  const code=await serviceFollowCode(scene)
  const added=await db.collection('referees').add({data:{tournamentId,orgId:actor.orgId,name,realName:name,phone,temporaryReferee:true,temporaryReason:reason,credentialStatus:'not_submitted',certificateRequired:false,eventScoped:true,status:'pending_claim',auditStatus:'not_claimed',availabilityStatus:'pending',temporaryClaimStatus:'waiting_claim',organizerTemporaryApproval:false,wechatBound:false,canLogin:false,canOperate:false,source:'organizer_temporary_referee',createdByUserId:actor.userId,createTime:db.serverDate(),updateTime:db.serverDate()}})
  const target={_id:added._id,tournamentId,orgId:actor.orgId,name,realName:name,phone,temporaryReferee:true,temporaryReason:reason}
  const invite=await createRefereeFollowInviteRecord(actor,tournament,target,{claimMode:'temporary_no_certificate',code,scene,previewMode:event.previewMode===true})
  const notificationAdded=await db.collection('referee_notifications').add({data:{type:'temporary_referee_claim',status:'pending',orgId:actor.orgId,tournamentId,refereeId:added._id,phone,refereeName:name,roleLabel:'赛事临时裁判认领',tournamentName:text(tournament.name||tournament.tournamentName||'足球赛事'),teamsText:'组委会邀请认领',matchTimeText:temporaryClaimTimeText(),url:invite.registerUrl,inviteId:invite.invitationId,updateTime:db.serverDate(),createTime:db.serverDate()}})
  await addAudit('temporary_referee_created',{tournamentId,inviteId:invite.invitationId,actorUserId:actor.userId,actorOrgId:actor.orgId,detail:{refereeId:added._id,phoneMasked:phone.slice(0,3)+'****'+phone.slice(-4),reason}})
  return {success:true,message:'临时裁判已添加，等待本人认领',data:{refereeId:added._id,inviteId:invite.invitationId,gateId:invite.gateId,qrCodeUrl:invite.qrCodeUrl,registerUrl:invite.registerUrl,claimMode:invite.claimMode,notificationStatus:'pending'},__notificationRelay:{notificationId:notificationAdded._id,phone}}
}

async function reviewTemporaryRefereeClaim(event) {
  const actor=await webActor(event)
  if(!actor)return {success:false,code:'AUTH_REQUIRED',message:'登录会话或机构信息已失效，请重新登录'}
  const refereeId=text(event.refereeId)
  const referee=await getDocument('referees',refereeId)
  if(!referee||referee.temporaryReferee!==true||recordOrgId(referee)!==actor.orgId)return {success:false,code:'REFEREE_SCOPE_DENIED',message:'临时裁判不存在或不属于当前机构'}
  const tournament=await getDocument('tournaments',text(referee.tournamentId))
  if(!tournament||recordOrgId(tournament)!==actor.orgId)return {success:false,code:'TOURNAMENT_SCOPE_DENIED',message:'赛事不存在或不属于当前机构'}
  if(referee.temporaryClaimStatus!=='claimed_pending_review'||referee.wechatBound!==true)return {success:false,code:'REFEREE_NOT_CLAIMED',message:'请等待裁判完成手机号和头像认领'}
  await db.collection('referees').doc(refereeId).update({data:{status:'approved',auditStatus:'approved',availabilityStatus:'available',temporaryClaimStatus:'approved',organizerTemporaryApproval:true,approvedByUserId:actor.userId,approvedAt:db.serverDate(),canLogin:true,canOperate:true,updateTime:db.serverDate()}})
  await addAudit('temporary_referee_approved',{tournamentId:text(referee.tournamentId),actorUserId:actor.userId,actorOrgId:actor.orgId,detail:{refereeId,reason:text(referee.temporaryReason)}})
  return {success:true,message:'临时裁判已确认，可由裁判长安排本赛事执裁'}
}

async function miniDraftActor() {
  const openId = miniOpenId()
  if (!openId) return { ok: false, result: { success: false, code: 'MINI_AUTH_REQUIRED', message: '请先完成小程序微信登录' } }
  const users = (await db.collection('users').where(_.or([{ openId }, { wechatOpenId: openId }, { _openid: openId }])).limit(2).get()).data || []
  if (users.length !== 1) return { ok: false, result: { success: false, code: users.length > 1 ? 'ACCOUNT_CONFLICT' : 'AUTH_REQUIRED', message: users.length > 1 ? '当前微信存在重复账号，请联系管理员处理' : '登录账号不存在' } }
  return { ok: true, openId, user: users[0], userId: text(users[0]._id) }
}

async function miniActorCanManageTeam(actor, team) {
  const identities = [actor.userId, actor.openId, actor.user.phone, actor.user.phoneNumber, actor.user.mobile].filter(Boolean).map(String)
  const owners = [team.ownerId, team.ownerUserId, team.creatorId, team.userId, team.openId, team.wechatOpenId, team._openid, team.ownerPhone, team.creatorPhone, team.phoneNumber, team.phone, team.contactPhone, team.mobile].filter(Boolean).map(String)
  if (identities.some(value => owners.includes(value))) return true
  const memberships = (await db.collection('team_memberships').where({ teamId: text(team._id) }).limit(200).get()).data || []
  return memberships.some(item => {
    const status = text(item.status || 'active').toLowerCase()
    if (!['active', 'accepted', 'claimed'].includes(status)) return false
    const members = [item.userId, item.memberUserId, item.ownerId, item.openId].filter(Boolean).map(String)
    if (!identities.some(value => members.includes(value))) return false
    const roles = (Array.isArray(item.roles) ? item.roles : (item.role ? [item.role] : [])).map(value => text(value).toLowerCase())
    return roles.length === 0 || roles.some(role => ['owner', 'team_manager', 'manager', 'coach', 'admin', '负责人', '管理员', '教练'].includes(role))
  })
}

async function teamMemberInvitationByKey(value) {
  const key = text(value)
  if (!key) return null
  if (key.indexOf('tm_') === 0 || key.indexOf('tp_') === 0) {
    const result = await db.collection('team_invitations').where({ token: key }).limit(2).get()
    return (result.data || [])[0] || null
  }
  try {
    return await getDocument('team_invitations', key)
  } catch (error) {
    return null
  }
}

function teamMemberInviteExpiryText(value) {
  const time = dateValue(value)
  if (!time) return '7天内有效'
  const date = new Date(time)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hour}:${minute}`
}

async function generateTeamMemberInviteAssets(event) {
  const actor = await miniDraftActor()
  if (!actor.ok) return actor.result
  const invite = await teamMemberInvitationByKey(event.inviteId || event.token)
  if (!invite || text(invite.type) !== 'team_member') {
    return { success: false, code: 'TEAM_MEMBER_INVITE_NOT_FOUND', message: '球队成员邀请不存在或已失效' }
  }
  if (!['active', 'pending'].includes(text(invite.status || 'pending'))) {
    return { success: false, code: 'TEAM_MEMBER_INVITE_DISABLED', message: '该邀请已停用，请重新生成邀请' }
  }
  if (dateValue(invite.expiresAt) > 0 && dateValue(invite.expiresAt) <= Date.now()) {
    return { success: false, code: 'TEAM_MEMBER_INVITE_EXPIRED', message: '成员邀请已过期，请重新生成邀请' }
  }
  const team = await getDocument('teams', text(invite.teamId))
  if (!team) return { success: false, code: 'TEAM_NOT_FOUND', message: '球队不存在或已停用' }
  if (text(invite.orgId) && recordOrgId(team) && text(invite.orgId) !== recordOrgId(team)) {
    return { success: false, code: 'TEAM_MEMBER_INVITE_SCOPE_DENIED', message: '邀请所属机构校验失败' }
  }
  if (!(await miniActorCanManageTeam(actor, team))) {
    return { success: false, code: 'TEAM_ACCESS_DENIED', message: '当前账号没有生成该球队邀请素材的权限' }
  }

  const actualVersion = envVersion(event.envVersion)
  const testOnly = actualVersion !== 'release'
  const page = 'pages/team/members/members'
  const scene = text(invite.token || invite._id)
  if (!scene || scene.length > 32) {
    return { success: false, code: 'TEAM_MEMBER_INVITE_SCENE_INVALID', message: '邀请标识不符合小程序码要求，请重新生成邀请' }
  }
  const path = `/${page}?teamId=${encodeURIComponent(text(team._id))}&memberInviteId=${encodeURIComponent(scene)}`
  const needsVersionAssets = text(invite.qrEnvVersion) !== actualVersion
  let qrCodeFileId = needsVersionAssets ? '' : text(invite.qrCodeFileId)
  let qrCodeUrl = ''

  if (qrCodeFileId) {
    const urls = await cloud.getTempFileURL({ fileList: [qrCodeFileId] })
    qrCodeUrl = urls.fileList && urls.fileList[0] && urls.fileList[0].tempFileURL || ''
  }
  if (!qrCodeFileId || !qrCodeUrl) {
    const codeBuffer = await miniProgramCode({
      scene,
      page,
      width: Math.max(280, Math.min(600, Number(event.width || 430))),
      envVersion: actualVersion,
      checkPath: !testOnly
    })
    const cloudPath = `football/team-member-invites/${text(team._id)}/${text(invite._id)}-${actualVersion}.png`
    const uploaded = await cloud.uploadFile({ cloudPath, fileContent: codeBuffer })
    qrCodeFileId = uploaded.fileID
    const urls = await cloud.getTempFileURL({ fileList: [qrCodeFileId] })
    qrCodeUrl = urls.fileList && urls.fileList[0] && urls.fileList[0].tempFileURL || ''
  }

  const cachedLinkVersion = text(invite.urlLinkEnvVersion)
  let urlLink = cachedLinkVersion === actualVersion ? text(invite.urlLink) : ''
  let urlLinkError = ''
  if (!urlLink) {
    try {
      urlLink = await directMiniProgramUrlLink(
        page,
        `teamId=${encodeURIComponent(text(team._id))}&memberInviteId=${encodeURIComponent(scene)}`,
        { envVersion: actualVersion, expiresAt: invite.expiresAt }
      )
    } catch (error) {
      urlLinkError = '可点击邀请链接暂未生成，请使用二维码或微信分享'
      console.warn('[tournamentRegistrationFlow] 球队成员URL Link生成失败', text(error && error.code) || 'URL_LINK_FAILED')
    }
  }
  await db.collection('team_invitations').doc(text(invite._id)).update({ data: {
    qrCodeFileId,
    qrCodeUrl,
    qrEnvVersion: actualVersion,
    urlLink,
    urlLinkEnvVersion: urlLink ? actualVersion : '',
    lastSharedAt: db.serverDate(),
    updateTime: db.serverDate()
  } })
  return { success: true, data: {
    inviteId: text(invite._id),
    token: scene,
    path,
    urlLink,
    urlLinkAvailable: Boolean(urlLink),
    urlLinkStatusText: urlLink ? '可点击邀请链接已生成' : urlLinkError,
    qrCodeUrl,
    qrCodeFileId,
    envVersion: actualVersion,
    testOnly,
    expiresAtText: teamMemberInviteExpiryText(invite.expiresAt),
    team: {
      id: text(team._id),
      name: text(team.name || team.teamName || '球队'),
      logo: text(team.logoTransparent || team.logo || team.logoUrl)
    }
  } }
}

async function generateTeamPlayerInviteAssets(event) {
  const actor = await miniDraftActor()
  if (!actor.ok) return actor.result
  const invite = await teamMemberInvitationByKey(event.inviteId || event.token)
  if (!invite || text(invite.type) !== 'team_player') {
    return { success: false, code: 'TEAM_PLAYER_INVITE_NOT_FOUND', message: '球员入队邀请不存在或已失效' }
  }
  if (!['active', 'pending'].includes(text(invite.status || 'active'))) {
    return { success: false, code: 'TEAM_PLAYER_INVITE_DISABLED', message: '该球员邀请已停用，请重新生成' }
  }
  if (dateValue(invite.expiresAt) > 0 && dateValue(invite.expiresAt) <= Date.now()) {
    return { success: false, code: 'TEAM_PLAYER_INVITE_EXPIRED', message: '球员邀请已过期，请重新生成' }
  }
  const team = await getDocument('teams', text(invite.teamId))
  if (!team) return { success: false, code: 'TEAM_NOT_FOUND', message: '球队不存在或已停用' }
  if (text(invite.orgId) && recordOrgId(team) && text(invite.orgId) !== recordOrgId(team)) {
    return { success: false, code: 'TEAM_PLAYER_INVITE_SCOPE_DENIED', message: '邀请所属机构校验失败' }
  }
  if (!(await miniActorCanManageTeam(actor, team))) {
    return { success: false, code: 'TEAM_ACCESS_DENIED', message: '当前账号没有生成该球队球员邀请的权限' }
  }

  const actualVersion = envVersion(event.envVersion)
  const testOnly = actualVersion !== 'release'
  const page = 'pages/team/player-invite/player-invite'
  const scene = text(invite.token || invite._id)
  if (!scene || scene.length > 32) return { success: false, code: 'TEAM_PLAYER_INVITE_SCENE_INVALID', message: '球员邀请标识不符合小程序码要求' }
  const path = `/${page}?teamId=${encodeURIComponent(text(team._id))}&playerInviteId=${encodeURIComponent(scene)}`
  const needsVersionAssets = text(invite.qrEnvVersion) !== actualVersion
  let qrCodeFileId = needsVersionAssets ? '' : text(invite.qrCodeFileId)
  let qrCodeUrl = ''
  if (qrCodeFileId) {
    const urls = await cloud.getTempFileURL({ fileList: [qrCodeFileId] })
    qrCodeUrl = urls.fileList && urls.fileList[0] && urls.fileList[0].tempFileURL || ''
  }
  if (!qrCodeFileId || !qrCodeUrl) {
    const codeBuffer = await miniProgramCode({ scene, page, width: Math.max(280, Math.min(600, Number(event.width || 430))), envVersion: actualVersion, checkPath: !testOnly })
    const cloudPath = `football/team-player-invites/${text(team._id)}/${text(invite._id)}-${actualVersion}.png`
    const uploaded = await cloud.uploadFile({ cloudPath, fileContent: codeBuffer })
    qrCodeFileId = uploaded.fileID
    const urls = await cloud.getTempFileURL({ fileList: [qrCodeFileId] })
    qrCodeUrl = urls.fileList && urls.fileList[0] && urls.fileList[0].tempFileURL || ''
  }

  const cachedLinkVersion = text(invite.urlLinkEnvVersion)
  let urlLink = cachedLinkVersion === actualVersion ? text(invite.urlLink) : ''
  let urlLinkError = ''
  if (!urlLink) {
    try {
      urlLink = await directMiniProgramUrlLink(
        page,
        `teamId=${encodeURIComponent(text(team._id))}&playerInviteId=${encodeURIComponent(scene)}`,
        { envVersion: actualVersion, expiresAt: invite.expiresAt }
      )
    } catch (error) {
      urlLinkError = '可点击邀请链接暂未生成，请使用二维码或微信分享'
      console.warn('[tournamentRegistrationFlow] 球员入队URL Link生成失败', text(error && error.code) || 'URL_LINK_FAILED')
    }
  }
  await db.collection('team_invitations').doc(text(invite._id)).update({ data: {
    qrCodeFileId,
    qrCodeUrl,
    qrEnvVersion: actualVersion,
    urlLink,
    urlLinkEnvVersion: urlLink ? actualVersion : '',
    lastSharedAt: db.serverDate(),
    updateTime: db.serverDate()
  } })
  return { success: true, data: {
    inviteId: text(invite._id), token: scene, path, urlLink,
    urlLinkAvailable: Boolean(urlLink),
    urlLinkStatusText: urlLink ? '可点击邀请链接已生成' : urlLinkError,
    qrCodeUrl, qrCodeFileId, envVersion: actualVersion, testOnly,
    expiresAtText: teamMemberInviteExpiryText(invite.expiresAt),
    team: { id: text(team._id), name: text(team.name || team.teamName || '球队'), logo: text(team.logoTransparent || team.logo || team.logoUrl) }
  } }
}

async function saveRegistrationDraft(event) {
  const actor = await miniDraftActor()
  if (!actor.ok) return actor.result
  const tournamentId = text(event.tournamentId)
  const teamId = text(event.teamId)
  const divisionId = text(event.divisionId || 'default')
  if (!tournamentId || !teamId) return { success: false, code: 'DRAFT_TARGET_REQUIRED', message: '缺少赛事或球队信息' }
  const [tournament, team] = await Promise.all([getDocument('tournaments', tournamentId), getDocument('teams', teamId)])
  if (!tournament || !team) return { success: false, code: 'DRAFT_TARGET_NOT_FOUND', message: '赛事或球队不存在' }
  if (!(await miniActorCanManageTeam(actor, team))) return { success: false, code: 'TEAM_ACCESS_DENIED', message: '当前账号没有该球队的报名权限' }
  const existingRegistration = (await db.collection('tournament_teams').where({ tournamentId, teamId }).limit(20).get()).data || []
  const alreadySubmitted = existingRegistration.some(item => text(item.divisionId || 'default') === divisionId && !['cancelled', 'withdrawn', 'rejected'].includes(text(item.status).toLowerCase()))
  const uniqueKey = `${tournamentId}:registration_draft:${teamId}`
  if (alreadySubmitted) {
    const rows = (await db.collection('tournament_tasks').where({ uniqueKey }).limit(2).get()).data || []
    await Promise.all(rows.map(item => db.collection('tournament_tasks').doc(item._id).update({ data: { status: 'completed', completedAt: db.serverDate(), updateTime: db.serverDate() } })))
    return { success: true, data: { status: 'completed' } }
  }
  await upsertByKey('tournament_tasks', uniqueKey, {
    sport: SPORT,
    tournamentId,
    tournamentName: text(event.tournamentName || tournament.name),
    divisionId,
    divisionName: text(event.divisionName),
    teamId,
    teamName: text(event.teamName || team.name || team.teamName),
    inviteKey: text(event.inviteKey),
    type: 'registration_draft',
    audience: 'team',
    recipientUserId: actor.userId,
    recipientMiniOpenId: actor.openId,
    status: 'pending',
    draftStage: text(event.stage || 'service_follow'),
    title: '继续完成赛事报名',
    detail: '请继续完成关注与报名确认',
    targetPage: 'pages/tournament/signup/signup'
  })
  return { success: true, data: { status: 'pending' } }
}

async function completeRegistrationDraft(event) {
  const actor = await miniDraftActor()
  if (!actor.ok) return actor.result
  const tournamentId = text(event.tournamentId)
  const teamId = text(event.teamId)
  if (!tournamentId || !teamId) return { success: true, data: { completed: 0 } }
  const uniqueKey = `${tournamentId}:registration_draft:${teamId}`
  const rows = (await db.collection('tournament_tasks').where({ uniqueKey }).limit(2).get()).data || []
  const owned = rows.filter(item => text(item.recipientUserId) === actor.userId || text(item.recipientMiniOpenId) === actor.openId)
  await Promise.all(owned.map(item => db.collection('tournament_tasks').doc(item._id).update({ data: { status: 'completed', completedAt: db.serverDate(), updateTime: db.serverDate() } })))
  return { success: true, data: { completed: owned.length } }
}

async function probeServiceAccount(event) {
  const actor = await webActor(event)
  if (!actor) return { success: false, code: 'AUTH_REQUIRED', message: '登录会话已失效' }
  try {
    if (serviceBridgeConfigured()) await serviceBridgeJson('probe', {})
    else await serviceAccessToken()
    return { success: true, data: { configured: true, accessTokenAvailable: true, fixedEgress: serviceBridgeConfigured() }, message: '服务号接口凭据验证通过' }
  } catch (error) {
    return { success: false, code: error.code || 'SERVICE_PROBE_FAILED', wechatCode: error.wechatCode || null, message: error.message || '服务号接口检测失败' }
  }
}

async function bridgeConfigurationStatus() {
  if (!serviceBridgeConfigured()) {
    return {
      success: false,
      code: 'SERVICE_BRIDGE_CONFIG_REQUIRED',
      message: '足球服务号固定出口中转尚未配置',
      data: { configured: false, fixedEgress: false }
    }
  }
  try {
    await serviceBridgeJson('probe', {})
    return {
      success: true,
      message: '足球服务号固定出口中转验证通过',
      data: { configured: true, fixedEgress: true }
    }
  } catch (error) {
    return {
      success: false,
      code: error.code || 'SERVICE_BRIDGE_PROBE_FAILED',
      wechatCode: error.wechatCode || null,
      message: error.message || '足球服务号固定出口中转验证失败',
      data: { configured: true, fixedEgress: true }
    }
  }
}

function notificationConfigurationStatus() {
  const miniTemplateConfigured = Boolean(miniReviewTemplateId())
  const serviceReviewConfigured = Boolean(serviceReviewTemplateId())
  const serviceSuccessConfigured = Boolean(serviceRegistrationSuccessTemplateId())
  const serviceTemplateConfigured = serviceReviewConfigured && serviceSuccessConfigured
  const missing = []
  if (!miniTemplateConfigured) missing.push('SXF_FOOTBALL_MINI_TEMPLATE_TOURNAMENT_REVIEW')
  if (!serviceReviewConfigured) missing.push('SXF_FOOTBALL_SERVICE_TEMPLATE_REGISTRATION_REVIEW')
  if (!serviceSuccessConfigured) missing.push('SXF_FOOTBALL_SERVICE_TEMPLATE_REGISTRATION_SUCCESS')
  if (!serviceBridgeConfigured()) missing.push('SXF_FOOTBALL_WECHAT_BRIDGE_URL', 'SXF_FOOTBALL_WECHAT_BRIDGE_SECRET')
  return { success:true, data:{ miniTemplateConfigured, serviceTemplateConfigured, serviceReviewConfigured, serviceSuccessConfigured, serviceBridgeConfigured:serviceBridgeConfigured(), missing:[...new Set(missing)] } }
}

function templateText(value, max) {
  return Array.from(text(value)).slice(0, Number(max || 20)).join('')
}

function notificationCopy(registration, tournament, decision, reason) {
  const approved = decision === 'approved'
  return {
    tournamentName: templateText(tournament && tournament.name || '足球赛事', 20),
    teamName: templateText(registration.teamName || '报名球队', 20),
    divisionName: templateText(registration.divisionName || '竞赛组别', 20),
    teamCode: templateText(registration.registrationNo || registration.tournamentTeamCode || registration.teamCode || registration.participationCode || `T-${text(registration._id).slice(-6).toUpperCase()}`, 32),
    statusText: approved ? '审核通过' : '审核驳回',
    detail: templateText(reason || (approved ? '报名已通过，请进入小程序查看赛事安排' : '请进入小程序查看并补充报名资料'), 20)
  }
}

async function sendMiniReviewNotification(registration, tournament, decision, reason) {
  if (registration.miniSubscriptionAccepted !== true) return { status:'permission_required', code:'MINI_SUBSCRIPTION_NOT_ACCEPTED' }
  const templateId = miniReviewTemplateId()
  if (!templateId) return { status:'configuration_required', code:'MINI_TEMPLATE_REQUIRED' }
  const touser = text(registration.applicantMiniOpenId)
  if (!touser) return { status:'recipient_missing', code:'MINI_OPENID_REQUIRED' }
  const copy = notificationCopy(registration, tournament, decision, reason)
  const data = {}
  data[text(process.env.SXF_FOOTBALL_MINI_REVIEW_TOURNAMENT_KEY || 'thing6')] = { value:copy.tournamentName }
  data[text(process.env.SXF_FOOTBALL_MINI_REVIEW_TEAM_KEY || 'thing32')] = { value:copy.teamName }
  data[text(process.env.SXF_FOOTBALL_MINI_REVIEW_STATUS_KEY || 'thing14')] = { value:copy.statusText }
  data[text(process.env.SXF_FOOTBALL_MINI_REVIEW_DETAIL_KEY || 'thing20')] = { value:copy.detail }
  try {
    const result = await cloud.openapi.subscribeMessage.send({ touser, page:'pages/todo/index', templateId, data })
    const code = Number(result && (result.errCode ?? result.errcode) || 0)
    if (code) return { status:'failed', code:`WECHAT_${code}`, message:text(result.errMsg || result.errmsg || '小程序订阅消息发送失败') }
    return { status:'delivered', code:'', message:'小程序订阅消息已发送' }
  } catch (error) {
    const firstCode = text(error.errCode || error.code || 'MINI_SEND_FAILED')
    const firstMessage = text(error.message || error.errMsg || '小程序订阅消息发送失败')
    const tokenInvalid = firstCode === '-501001' || /invalid wx openapi access_token|INVALID_WX_ACCESS_TOKEN/i.test(firstMessage)
    if (!tokenInvalid) return { status:'failed', code:firstCode, message:firstMessage }
    try {
      const accessToken = await miniAccessToken()
      await wechatJson(`https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(accessToken)}`, {
        method:'POST',
        headers:{ 'content-type':'application/json; charset=utf-8' },
        body:JSON.stringify({ touser, template_id:templateId, page:'pages/todo/index', miniprogram_state:text(process.env.SXF_FOOTBALL_MINI_MESSAGE_STATE || 'trial'), lang:'zh_CN', data })
      })
      return { status:'delivered', code:'', message:'小程序订阅消息已通过官方通道发送' }
    } catch (fallbackError) {
      return { status:'failed', code:text(fallbackError.code || fallbackError.wechatCode || 'MINI_DIRECT_SEND_FAILED'), message:text(fallbackError.message || '小程序订阅消息发送失败') }
    }
  }
}

async function sendServiceReviewNotification(registration, tournament, decision, reason, binding) {
  if (!binding || !text(binding.officialOpenId)) return { status:'waiting_follow_bind', code:'SERVICE_BINDING_REQUIRED' }
  const templateId = decision === 'approved' ? serviceRegistrationSuccessTemplateId() : serviceReviewTemplateId()
  if (!templateId) return { status:'configuration_required', code:'SERVICE_TEMPLATE_REQUIRED' }
  if (!serviceBridgeConfigured()) return { status:'configuration_required', code:'SERVICE_BRIDGE_REQUIRED' }
  const copy = notificationCopy(registration, tournament, decision, reason)
  const data = {}
  if (decision === 'approved') {
    data[text(process.env.SXF_FOOTBALL_SERVICE_SUCCESS_TOURNAMENT_KEY || 'thing3')] = { value:copy.tournamentName }
    data[text(process.env.SXF_FOOTBALL_SERVICE_SUCCESS_TEAM_KEY || 'thing5')] = { value:copy.teamName }
    data[text(process.env.SXF_FOOTBALL_SERVICE_SUCCESS_DIVISION_KEY || 'thing9')] = { value:copy.divisionName }
    data[text(process.env.SXF_FOOTBALL_SERVICE_SUCCESS_TEAM_CODE_KEY || 'character_string13')] = { value:copy.teamCode }
  } else {
    data[text(process.env.SXF_FOOTBALL_SERVICE_REVIEW_TOURNAMENT_KEY || 'thing6')] = { value:copy.tournamentName }
    data[text(process.env.SXF_FOOTBALL_SERVICE_REVIEW_TEAM_KEY || 'thing9')] = { value:copy.teamName }
    data[text(process.env.SXF_FOOTBALL_SERVICE_REVIEW_DIVISION_KEY || 'thing7')] = { value:copy.divisionName }
    data[text(process.env.SXF_FOOTBALL_SERVICE_REVIEW_STATUS_KEY || 'thing2')] = { value:copy.statusText }
  }
  try {
    const result = await serviceBridgeJson('template/send', { message:{
      touser:text(binding.officialOpenId),
      template_id:templateId,
      url:'https://www.sxffootball.cn/',
      miniprogram:{ appid:text(process.env.SXF_FOOTBALL_MINIPROGRAM_APPID || 'wx57164cca8676f411'), pagepath:'pages/todo/index' },
      data
    } })
    return result && result.success ? { status:'delivered', code:'', message:'服务号模板消息已发送' } : { status:'failed', code:'SERVICE_SEND_FAILED', message:'服务号模板消息发送失败' }
  } catch (error) {
    return { status:'failed', code:text(error.code || error.wechatCode || 'SERVICE_SEND_FAILED'), message:text(error.message || '服务号模板消息发送失败') }
  }
}

async function deliverRegistrationNotifications(registration, tournament, decision, reason, options) {
  const deliveryOptions = options || {}
  const bindingResult = registration.applicantMiniOpenId
    ? await db.collection('service_account_bindings').where({ sport:SPORT, miniOpenId:registration.applicantMiniOpenId, subscribed:true }).limit(2).get()
    : { data:[] }
  const binding = (bindingResult.data || [])[0] || null
  const [mini, service] = await Promise.all([
    deliveryOptions.skipMini ? Promise.resolve({ status:'delivered', code:'ALREADY_DELIVERED', message:'小程序订阅消息此前已送达，本次未重复发送' }) : sendMiniReviewNotification(registration, tournament, decision, reason),
    deliveryOptions.skipService ? Promise.resolve({ status:'delivered', code:'ALREADY_DELIVERED', message:'服务号消息此前已送达，本次未重复发送' }) : sendServiceReviewNotification(registration, tournament, decision, reason, binding)
  ])
  return { mini, service, binding }
}

async function followGateStatus(event) {
  const openId = miniOpenId()
  if (!openId) return { success: false, code: 'MINI_AUTH_REQUIRED', message: '请先完成小程序微信登录' }
  const gateId = text(event.gateId)
  if (gateId) {
    const gate = await getDocument('service_follow_gates', gateId)
    if (!gate || gate.miniOpenId !== openId) return { success: false, code: 'FOLLOW_GATE_NOT_FOUND', message: '关注绑定任务不存在' }
    if (gate.subscribed === true && text(gate.officialOpenId)) return { success: true, data: { gateId: gate._id, status: 'subscribed', subscribed: true } }
  }
  const bindings = await db.collection('service_account_bindings').where({ sport: SPORT, miniOpenId: openId, subscribed: true }).limit(2).get()
  const binding = (bindings.data || [])[0]
  return { success: true, data: { gateId, status: binding && text(binding.officialOpenId) ? 'subscribed' : 'waiting', subscribed: Boolean(binding && text(binding.officialOpenId)) } }
}

async function bindServiceAccount(event) {
  const expected = text(process.env.SXF_FOOTBALL_SERVICE_BRIDGE_KEY)
  if (!expected || text(event.bridgeKey) !== expected) return { success: false, code: 'BRIDGE_AUTH_FAILED', message: '服务号桥接校验失败' }
  const scene = text(event.scene)
  const result = await db.collection('service_follow_gates').where({ sport: SPORT, scene }).limit(2).get()
  const gate = (result.data || [])[0]
  if (!gate) return { success: false, code: 'FOLLOW_GATE_NOT_FOUND', message: '关注绑定任务不存在' }
  const subscribed = event.subscribed !== false
  const officialOpenId = text(event.officialOpenId)
  await db.collection('service_follow_gates').doc(gate._id).update({ data: { status: subscribed ? 'subscribed' : 'unsubscribed', subscribed, officialOpenId, updateTime: db.serverDate() } })
  await upsertByKey('service_account_bindings', `${SPORT}:${gate.miniOpenId}`, { sport: SPORT, miniOpenId: gate.miniOpenId, officialOpenId, subscribed, status: subscribed ? 'subscribed' : 'unsubscribed' })
  const waiting = (await db.collection('notification_outbox').where({ sport: SPORT, recipientMiniOpenId: gate.miniOpenId, channel: 'service_account', status: 'waiting_follow_bind' }).limit(100).get()).data || []
  if (subscribed) await Promise.all(waiting.map(item => db.collection('notification_outbox').doc(item._id).update({ data: { status: 'queued', updateTime: db.serverDate() } })))
  await addAudit(subscribed ? 'service_account_bound' : 'service_account_unsubscribed', { tournamentId: gate.tournamentId, inviteId: gate.inviteId, detail: { gateId: gate._id } })
  return { success: true, data: { subscribed, releasedNotifications: subscribed ? waiting.length : 0 } }
}

async function reviewRegistration(event) {
  const actor = await webActor(event)
  if (!actor) return { success: false, code: 'AUTH_REQUIRED', message: '登录会话或机构信息已失效，请重新登录' }
  const registration = await getDocument('tournament_teams', text(event.registrationId))
  if (!registration) return { success: false, code: 'REGISTRATION_NOT_FOUND', message: '报名记录不存在' }
  const tournament = await getDocument('tournaments', registration.tournamentId)
  if (!tournament || recordOrgId(tournament) !== actor.orgId) return { success: false, code: 'REGISTRATION_SCOPE_DENIED', message: '无权审核其他机构赛事的报名' }
  const decision = text(event.decision).toLowerCase()
  if (!['approved', 'rejected'].includes(decision)) return { success: false, code: 'DECISION_INVALID', message: '请选择通过或驳回' }
  const reason = text(event.reason).slice(0, 300)
  if (decision === 'rejected' && !reason) return { success: false, code: 'REJECT_REASON_REQUIRED', message: '驳回必须填写原因' }
  if (decision === 'approved') {
    const playerRows = (await db.collection('players').where({ teamId: registration.teamId }).limit(1000).get()).data || []
    const pendingPlayerCount = playerRows.filter(player => text(player.organizerReviewStatus).toLowerCase() !== 'approved').length
    if (pendingPlayerCount > 0) return { success: false, code: 'PLAYER_REVIEW_REQUIRED', message: `请先审核完球队球员资料（还有 ${pendingPlayerCount} 人未审核）`, pendingPlayerCount }
  }
  await db.collection('tournament_teams').doc(registration._id).update({ data: { status: decision, reviewReason: reason, reviewedBy: actor.userId, reviewedAt: db.serverDate(), approveTime: decision === 'approved' ? db.serverDate() : null, updateTime: db.serverDate() } })
  const businessEventId = `registration_review:${registration._id}:${decision}`
  const warnings = []
  async function bestEffort(label, action) {
    try { return await action() } catch (error) {
      warnings.push(label)
      console.warn('[reviewRegistration]', label, error.message || error)
      return null
    }
  }
  await bestEffort('主办方审核任务同步失败', () => upsertByKey('tournament_tasks', `${registration.tournamentId}:registration_review:${registration._id}`, { sport: SPORT, tournamentId: registration.tournamentId, divisionId: registration.divisionId || '', teamId: registration.teamId, registrationId: registration._id, type: 'registration_review', audience: 'organizer', status: 'completed', completedBy: actor.userId }))
  await bestEffort('球队状态任务同步失败', () => upsertByKey('tournament_tasks', `${registration.tournamentId}:registration_status:${registration.teamId}`, { sport: SPORT, tournamentId: registration.tournamentId, divisionId: registration.divisionId || '', teamId: registration.teamId, registrationId: registration._id, type: 'registration_status', audience: 'team', recipientUserId: registration.applicantUserId || '', status: decision, title: decision === 'approved' ? '赛事报名已通过' : '赛事报名需补充资料', detail: reason }))
  if (registration.applicantUserId) await bestEffort('站内消息同步失败', () => upsertByKey('messages', `registration:${registration._id}:${decision}`, { orgId: registration.teamOrgId || '', userId: registration.applicantUserId, type: 'registration_status', category: 'tournament', title: decision === 'approved' ? '赛事报名已通过' : '赛事报名已驳回', content: reason || `${registration.teamName || '球队'}报名审核已通过`, tournamentId: registration.tournamentId, teamId: registration.teamId, read: false }))
  const taskCenterSaved = await bestEffort('任务中心通知同步失败', () => upsertByKey('notification_outbox', `${businessEventId}:task_center`, { sport: SPORT, businessEventId, tournamentId: registration.tournamentId, registrationId: registration._id, recipientUserId: registration.applicantUserId || '', channel: 'task_center', status: 'delivered', targetPage: 'pages/todo/index' }))
  const deliveries = await bestEffort('微信通知发送失败', () => deliverRegistrationNotifications(registration, tournament, decision, reason)) || { mini:{status:'failed',code:'DELIVERY_FAILED'}, service:{status:'failed',code:'DELIVERY_FAILED'}, binding:null }
  const miniStatus = deliveries.mini.status
  const serviceStatus = deliveries.service.status
  const miniSaved = await bestEffort('小程序通知状态同步失败', () => upsertByKey('notification_outbox', `${businessEventId}:mini_subscription`, { sport: SPORT, businessEventId, tournamentId: registration.tournamentId, registrationId: registration._id, recipientUserId: registration.applicantUserId || '', recipientMiniOpenId: registration.applicantMiniOpenId || '', channel: 'mini_subscription', status: miniStatus, errorCode:deliveries.mini.code || '', errorMessage:deliveries.mini.message || '', attemptedAt:db.serverDate(), targetPage: 'pages/todo/index' }))
  const serviceSaved = await bestEffort('服务号通知状态同步失败', () => upsertByKey('notification_outbox', `${businessEventId}:service_account`, { sport: SPORT, businessEventId, tournamentId: registration.tournamentId, registrationId: registration._id, recipientUserId: registration.applicantUserId || '', recipientMiniOpenId: registration.applicantMiniOpenId || '', recipientOfficialOpenId: deliveries.binding && deliveries.binding.officialOpenId || '', channel: 'service_account', status: serviceStatus, errorCode:deliveries.service.code || '', errorMessage:deliveries.service.message || '', attemptedAt:db.serverDate(), targetPage: 'pages/todo/index' }))
  await bestEffort('审核审计同步失败', () => addAudit(`registration_${decision}`, { tournamentId: registration.tournamentId, divisionId: registration.divisionId, registrationId: registration._id, actorUserId: actor.userId, actorOrgId: actor.orgId, detail: { reasonProvided: Boolean(reason), notificationWarnings: warnings.slice() } }))
  const deliveryWarnings = []
  if (miniStatus === 'permission_required') deliveryWarnings.push('报名人未授权小程序订阅消息')
  else if (miniStatus === 'configuration_required') deliveryWarnings.push('小程序报名审核模板未配置')
  else if (miniStatus !== 'delivered') deliveryWarnings.push('小程序通知未送达')
  if (serviceStatus === 'configuration_required') deliveryWarnings.push('服务号报名审核模板未配置')
  else if (serviceStatus === 'waiting_follow_bind') deliveryWarnings.push('报名人尚未完成服务号绑定')
  else if (serviceStatus !== 'delivered') deliveryWarnings.push('服务号通知未送达')
  return { success: true, message: decision === 'approved' ? '报名已通过' : '报名已驳回', data: { status: decision, notificationWarning: warnings.length > 0 || deliveryWarnings.length > 0, warningText: [...warnings, ...deliveryWarnings].join('；'), channels: { taskCenter: taskCenterSaved ? 'delivered' : 'failed', miniSubscription: miniSaved ? miniStatus : 'failed', serviceAccount: serviceSaved ? serviceStatus : 'failed' } } }
}

async function cancelTournamentInvitation(event) {
  const actor = await webActor(event)
  if (!actor) return { success: false, code: 'AUTH_REQUIRED', message: '登录会话或机构信息已失效，请重新登录' }
  const registrationId = text(event.registrationId)
  const registration = await getDocument('tournament_teams', registrationId)
  if (!registration) return { success: false, code: 'REGISTRATION_NOT_FOUND', message: '赛事邀约记录不存在，球队长期资料未受影响' }
  const tournament = await getDocument('tournaments', registration.tournamentId)
  if (!tournament || recordOrgId(tournament) !== actor.orgId) {
    return { success: false, code: 'REGISTRATION_SCOPE_DENIED', message: '无权撤回其他机构赛事的邀约' }
  }
  const currentStatus = text(registration.status).toLowerCase()
  if (!['invited', 'pending', 'invite_cancelled'].includes(currentStatus)) {
    return { success: false, code: 'INVITATION_STATUS_INVALID', message: '当前球队已进入报名审核或参赛状态，不能按邀约撤回' }
  }
  if (currentStatus === 'invite_cancelled') {
    return { success: true, code: 'INVITATION_ALREADY_CANCELLED', message: '该邀约已经撤回，球队资料仍保留' }
  }
  const now = db.serverDate()
  await db.collection('tournament_teams').doc(registrationId).update({ data: {
    status: 'invite_cancelled',
    claimStatus: 'cancelled',
    inviteCancelledAt: now,
    inviteCancelledBy: actor.userId,
    updateTime: now
  } })
  const invitations = await listAll('team_invitations', {
    tournamentId: registration.tournamentId,
    tournamentTeamId: registrationId
  }, 100)
  const activeInvitations = invitations.filter(function(invite) {
    return !['accepted', 'cancelled', 'expired'].includes(text(invite.status).toLowerCase())
  })
  await Promise.all(activeInvitations.map(function(invite) {
    return db.collection('team_invitations').doc(invite._id).update({ data: {
      status: 'cancelled',
      cancelledAt: now,
      cancelledBy: actor.userId,
      updateTime: now
    } })
  }))
  await addAudit('tournament_invitation_cancelled', {
    tournamentId: registration.tournamentId,
    divisionId: registration.divisionId,
    registrationId,
    actorUserId: actor.userId,
    actorOrgId: actor.orgId,
    detail: { teamId: registration.teamId || '', cancelledInviteCount: activeInvitations.length, preservedTeamProfile: true }
  })
  return {
    success: true,
    message: '邀约已撤回，球队资料和球员库仍保留',
    data: { status: 'invite_cancelled', teamId: registration.teamId || '', cancelledInviteCount: activeInvitations.length }
  }
}

async function teamClaimState(team, registration) {
  const directClaimed = text(registration && registration.claimStatus).toLowerCase() === 'claimed' ||
    text(team && team.claimStatus).toLowerCase() === 'claimed' ||
    Boolean(team && (team.ownerId || team.ownerUserId || team.claimedByUserId))
  const memberships = team ? (await db.collection('team_memberships').where({ teamId:text(team._id) }).limit(200).get()).data || [] : []
  return {
    claimed: directClaimed || memberships.some(activeMembership),
    activeMembershipCount: memberships.filter(activeMembership).length
  }
}

function collectionMissing(error) {
  const message = text(error && (error.message || error.errMsg)).toLowerCase()
  const code = text(error && (error.code || error.errCode)).toLowerCase()
  return code.includes('database_collection_not_exist') ||
    code.includes('resourcenotfound') ||
    message.includes('collection not exists') ||
    message.includes('db or table not exist') ||
    message.includes('database collection not exist')
}

async function optionalHistoryRows(collection, where, max) {
  try {
    return await listAll(collection, where, max)
  } catch (error) {
    if (collectionMissing(error)) {
      console.warn('[teamDelete] optional history collection skipped:', collection)
      return []
    }
    throw error
  }
}

async function removeRows(collection, where, max) {
  const rows = await listAll(collection, where, max || 1000)
  for (const row of rows) await db.collection(collection).doc(row._id).remove()
  return rows.length
}

async function removeOptionalRows(collection, where, max) {
  try {
    return await removeRows(collection, where, max)
  } catch (error) {
    if (collectionMissing(error)) {
      console.warn('[teamDelete] optional cleanup collection skipped:', collection)
      return 0
    }
    throw error
  }
}

// 预建球队（批量添加资料等入口创建）只有报名关系，没有长期 teams 资料，因此关系上
// 也没有 teamId。该状态不存在任何按 teamId 归属的球员、工作人员、草稿、参赛关系或
// 比赛历史，只能按报名关系本身清理；这里一律不使用空 teamId 做集合查询，避免把其它
// 同样缺少 teamId 的记录一并误删。
async function deletePrebuiltRegistrationRelation(input) {
  const actor = input.actor
  const registration = input.registration
  const claim = input.claim
  const snapshot = {
    teamId:'',
    teamName:text(registration.teamName),
    source:text(registration.source || registration.joinSource),
    playerCount:Number(registration.rosterPlayerCount || registration.playerCount || 0),
    activeMembershipCount:claim.activeMembershipCount,
    teamProfileMissing:true,
    relationOnly:true
  }
  await addAudit('unclaimed_team_hard_delete_started', {
    tournamentId:registration.tournamentId,
    divisionId:registration.divisionId,
    registrationId:registration._id,
    actorUserId:actor.userId,
    actorOrgId:actor.orgId,
    detail:snapshot
  })
  const deleted = {}
  deleted.teamInvitations = await removeRows('team_invitations', { tournamentTeamId:registration._id }, 100)
  deleted.tournamentTeams = await removeRows('tournament_teams', { _id:registration._id }, 1)
  deleted.deletedTeamProfile = false
  await addAudit('unclaimed_team_hard_deleted', {
    tournamentId:registration.tournamentId,
    divisionId:registration.divisionId,
    registrationId:registration._id,
    actorUserId:actor.userId,
    actorOrgId:actor.orgId,
    detail:{ ...snapshot, deleted, deletedUsers:0 }
  })
  return {
    success:true,
    message:'该球队只有报名关系、没有长期球队资料，已删除报名关系及其未完成邀请，登录账号未删除',
    // 该关系从来没有长期球队资料，teamProfileMissing 与审计快照保持一致，避免调用方
    // 误判为“删除了一份已存在的球队资料”。
    data:{ deleted, deletedUsers:0, teamProfileMissing:true, relationOnly:true }
  }
}

async function deleteUnclaimedTournamentTeam(event) {
  const actor = await webActor(event)
  if (!actor) return { success:false, code:'AUTH_REQUIRED', message:'登录会话或机构信息已失效，请重新登录' }
  if (text(event.confirmText) !== '删除队伍') return { success:false, code:'CONFIRM_TEXT_REQUIRED', message:'请输入“删除队伍”确认' }
  const registration = await getDocument('tournament_teams', text(event.registrationId))
  if (!registration) return { success:false, code:'REGISTRATION_NOT_FOUND', message:'球队参赛关系不存在' }
  const tournament = await getDocument('tournaments', registration.tournamentId)
  if (!tournament || recordOrgId(tournament) !== actor.orgId) return { success:false, code:'REGISTRATION_SCOPE_DENIED', message:'无权删除其他机构赛事中的球队' }
  const teamId = text(registration.teamId)
  const team = teamId ? await getDocument('teams', teamId) : null
  // 球队长期资料可能已被删除，只剩残留报名关系。此时仍允许清理残留记录，
  // 但不能凭不存在的资料做机构校验，也不能越权删除其他机构仍然存在的球队。
  const teamProfileMissing = !team
  if (!teamProfileMissing && recordOrgId(team) !== actor.orgId) return { success:false, code:'TEAM_SCOPE_DENIED', message:'球队不存在或不属于当前机构' }
  const claim = await teamClaimState(team, registration)
  if (claim.claimed) return { success:false, code:'TEAM_ALREADY_CLAIMED', message:'该球队已经认领，只能移出赛事，不能删除球队资料' }
  // 关系上没有 teamId 说明这是预建球队，不是错误状态。认领校验已在上方完成，
  // 未认领才允许按报名关系本身清理。
  if (!teamId) return await deletePrebuiltRegistrationRelation({ actor, registration, claim })

  const [relations, homeMatches, awayMatches, rosterSnapshots, lineupSnapshots] = await Promise.all([
    listAll('tournament_teams', { teamId }, 1000),
    listAll('matches', { homeTeamId:teamId }, 1000),
    listAll('matches', { awayTeamId:teamId }, 1000),
    optionalHistoryRows('roster_snapshots', { teamId }, 1000),
    optionalHistoryRows('match_lineup_snapshots', { teamId }, 1000)
  ])
  const otherActiveRelations = relations.filter(function(row) {
    return text(row._id) !== text(registration._id) &&
      !['invite_cancelled','cancelled','withdrawn','removed','rejected','replaced'].includes(text(row.status).toLowerCase())
  })
  if (otherActiveRelations.length) return { success:false, code:'TEAM_USED_BY_OTHER_TOURNAMENT', message:'该球队仍参加其他赛事，只能从当前赛事移除' }
  if (homeMatches.length || awayMatches.length || rosterSnapshots.length || lineupSnapshots.length) {
    return { success:false, code:'TEAM_HISTORY_EXISTS', message:'该球队已有比赛或正式名单历史，只能移出赛事，不能删除数据库资料' }
  }

  const snapshot = {
    teamId,
    teamName:text((team && (team.name || team.teamName)) || registration.teamName),
    source:text(team && team.source),
    playerCount:Number((team && team.playerCount) || 0),
    activeMembershipCount:claim.activeMembershipCount,
    teamProfileMissing
  }
  await addAudit('unclaimed_team_hard_delete_started', {
    tournamentId:registration.tournamentId,
    divisionId:registration.divisionId,
    registrationId:registration._id,
    actorUserId:actor.userId,
    actorOrgId:actor.orgId,
    detail:snapshot
  })
  const deleted = {}
  deleted.teamInvitations = await removeRows('team_invitations', { teamId }, 1000)
  deleted.registrationPlayerDrafts = await removeRows('registration_player_drafts', { teamId }, 2000)
  deleted.registrationImportBatches = await removeRows('registration_import_batches', { teamId }, 100)
  deleted.teamTasks = await removeOptionalRows('team_tasks', { teamId }, 1000)
  deleted.players = await removeRows('players', { teamId }, 2000)
  deleted.coaches = await removeRows('coaches', { teamId }, 500)
  deleted.management = await removeOptionalRows('management', { teamId }, 500)
  deleted.teamMemberships = await removeRows('team_memberships', { teamId }, 500)
  deleted.tournamentTeams = await removeRows('tournament_teams', { teamId }, 1000)
  if (!teamProfileMissing) await db.collection('teams').doc(teamId).remove()
  deleted.deletedTeamProfile = !teamProfileMissing
  await addAudit('unclaimed_team_hard_deleted', {
    tournamentId:registration.tournamentId,
    divisionId:registration.divisionId,
    registrationId:registration._id,
    actorUserId:actor.userId,
    actorOrgId:actor.orgId,
    detail:{ ...snapshot, deleted, deletedUsers:0 }
  })
  return {
    success:true,
    message: teamProfileMissing ? '球队长期资料已不存在，残留报名关系及相关草稿已清理，登录账号未删除' : '未认领球队及其球队资料已删除，登录账号未删除',
    data:{ deleted, deletedUsers:0, teamProfileMissing }
  }
}

async function removeClaimedTournamentTeam(event) {
  const actor = await webActor(event)
  if (!actor) return { success:false, code:'AUTH_REQUIRED', message:'登录会话或机构信息已失效，请重新登录' }
  if (text(event.confirmText) !== '移出赛事') return { success:false, code:'CONFIRM_TEXT_REQUIRED', message:'请输入“移出赛事”确认' }
  const registration = await getDocument('tournament_teams', text(event.registrationId))
  if (!registration) return { success:false, code:'REGISTRATION_NOT_FOUND', message:'球队参赛关系不存在' }
  const tournament = await getDocument('tournaments', registration.tournamentId)
  if (!tournament || recordOrgId(tournament) !== actor.orgId) return { success:false, code:'REGISTRATION_SCOPE_DENIED', message:'无权移除其他机构赛事中的球队' }
  const team = await getDocument('teams', text(registration.teamId))
  const claim = await teamClaimState(team, registration)
  if (!claim.claimed) {
    const [homeMatches, awayMatches, rosterSnapshots, lineupSnapshots] = await Promise.all([
      listAll('matches', { homeTeamId:text(registration.teamId) }, 1000),
      listAll('matches', { awayTeamId:text(registration.teamId) }, 1000),
      optionalHistoryRows('roster_snapshots', { teamId:text(registration.teamId) }, 1000),
      optionalHistoryRows('match_lineup_snapshots', { teamId:text(registration.teamId) }, 1000)
    ])
    if (!(homeMatches.length || awayMatches.length || rosterSnapshots.length || lineupSnapshots.length)) return { success:false, code:'TEAM_NOT_CLAIMED', message:'该球队尚未认领，请使用删除队伍' }
  }
  if (text(registration.status).toLowerCase() === 'removed') return { success:true, message:'该球队已移出赛事，球队资料仍保留' }
  const now = db.serverDate()
  await db.collection('tournament_teams').doc(registration._id).update({ data:{
    status:'removed',
    participationStatus:'removed',
    removedAt:now,
    removedBy:actor.userId,
    updateTime:now
  } })
  const invitations = await listAll('team_invitations', { tournamentTeamId:registration._id }, 100)
  await Promise.all(invitations.filter(function(invite) {
    return !['accepted','cancelled','expired'].includes(text(invite.status).toLowerCase())
  }).map(function(invite) {
    return db.collection('team_invitations').doc(invite._id).update({ data:{ status:'cancelled', cancelledAt:now, cancelledBy:actor.userId, updateTime:now } })
  }))
  await addAudit('claimed_team_removed_from_tournament', {
    tournamentId:registration.tournamentId,
    divisionId:registration.divisionId,
    registrationId:registration._id,
    actorUserId:actor.userId,
    actorOrgId:actor.orgId,
    detail:{ teamId:text(registration.teamId), teamName:text(team && (team.name || team.teamName) || registration.teamName), preservedTeamProfile:true, preservedPlayers:true, deletedUsers:0 }
  })
  return { success:true, message:'球队已移出赛事，球队、球员和账号资料仍保留', data:{ status:'removed', teamId:registration.teamId, preservedTeamProfile:true } }
}

async function retryRegistrationNotifications(event) {
  const actor = await webActor(event)
  if (!actor) return { success:false, code:'AUTH_REQUIRED', message:'登录会话或机构信息已失效，请重新登录' }
  const registration = await getDocument('tournament_teams', text(event.registrationId))
  if (!registration) return { success:false, code:'REGISTRATION_NOT_FOUND', message:'报名记录不存在' }
  const tournament = await getDocument('tournaments', registration.tournamentId)
  if (!tournament || recordOrgId(tournament) !== actor.orgId) return { success:false, code:'REGISTRATION_SCOPE_DENIED', message:'无权重发其他机构赛事通知' }
  const decision = ['approved','rejected'].includes(text(registration.status).toLowerCase()) ? text(registration.status).toLowerCase() : ''
  if (!decision) return { success:false, code:'REGISTRATION_NOT_REVIEWED', message:'报名尚未完成审核，不能重发结果通知' }
  const reason = text(registration.reviewReason)
  const businessEventId = `registration_review:${registration._id}:${decision}`
  if (registration.applicantUserId) await upsertByKey('messages', `registration:${registration._id}:${decision}`, { orgId:registration.teamOrgId || '', userId:registration.applicantUserId, type:'registration_status', category:'tournament', title:decision === 'approved' ? '赛事报名已通过' : '赛事报名已驳回', content:reason || `${registration.teamName || '球队'}报名审核已通过`, tournamentId:registration.tournamentId, teamId:registration.teamId, read:false })
  const existingOutbox = (await db.collection('notification_outbox').where({ sport:SPORT, registrationId:registration._id }).limit(100).get()).data || []
  const miniDelivered = existingOutbox.some(item => item.channel === 'mini_subscription' && item.status === 'delivered')
  const deliveries = await deliverRegistrationNotifications(registration, tournament, decision, reason, { skipMini:miniDelivered, skipService:false })
  await Promise.all([
    upsertByKey('notification_outbox', `${businessEventId}:mini_subscription`, { sport:SPORT, businessEventId, tournamentId:registration.tournamentId, registrationId:registration._id, recipientUserId:registration.applicantUserId || '', recipientMiniOpenId:registration.applicantMiniOpenId || '', channel:'mini_subscription', status:deliveries.mini.status, errorCode:deliveries.mini.code || '', errorMessage:deliveries.mini.message || '', attemptedAt:db.serverDate(), targetPage:'pages/todo/index' }),
    upsertByKey('notification_outbox', `${businessEventId}:service_account`, { sport:SPORT, businessEventId, tournamentId:registration.tournamentId, registrationId:registration._id, recipientUserId:registration.applicantUserId || '', recipientMiniOpenId:registration.applicantMiniOpenId || '', recipientOfficialOpenId:deliveries.binding && deliveries.binding.officialOpenId || '', channel:'service_account', status:deliveries.service.status, errorCode:deliveries.service.code || '', errorMessage:deliveries.service.message || '', attemptedAt:db.serverDate(), targetPage:'pages/todo/index' })
  ])
  await addAudit('registration_notification_retried', { tournamentId:registration.tournamentId, divisionId:registration.divisionId, registrationId:registration._id, actorUserId:actor.userId, actorOrgId:actor.orgId, detail:{ miniStatus:deliveries.mini.status, serviceStatus:deliveries.service.status } })
  return { success:true, message:'通知重试已执行', data:{ channels:{ taskCenter:'delivered', miniSubscription:deliveries.mini.status, serviceAccount:deliveries.service.status }, details:{ mini:deliveries.mini, service:deliveries.service } } }
}

async function notificationStatus(event) {
  const actor = await webActor(event)
  if (!actor) return { success: false, code: 'AUTH_REQUIRED', message: '登录会话已失效' }
  const registration = await getDocument('tournament_teams', text(event.registrationId))
  if (!registration) return { success: false, code: 'REGISTRATION_NOT_FOUND', message: '报名记录不存在' }
  const tournament = await getDocument('tournaments', registration.tournamentId)
  if (!tournament || recordOrgId(tournament) !== actor.orgId) return { success: false, code: 'REGISTRATION_SCOPE_DENIED', message: '无权查看通知状态' }
  const rows = (await db.collection('notification_outbox').where({ sport: SPORT, registrationId: registration._id }).limit(100).get()).data || []
  return { success: true, data: rows.map(item => ({ channel: item.channel, status: item.status, updateTime: item.updateTime || item.createTime })) }
}

async function migrateLegacyImportedPlayers(event) {
  const actor = await webActor(event)
  if (!actor) return { success:false, code:'AUTH_REQUIRED', message:'登录会话或机构信息已失效，请重新登录' }
  const tournamentId = text(event.tournamentId)
  const tournament = await getDocument('tournaments', tournamentId)
  if (!tournament || recordOrgId(tournament) !== actor.orgId) return { success:false, code:'TOURNAMENT_SCOPE_DENIED', message:'赛事不存在或无权迁移' }
  const relations = await listAll('tournament_teams', { tournamentId, source:'registration_docx_import' }, 500)
  const teamIds = Array.from(new Set(relations.map(item => text(item.teamId)).filter(Boolean)))
  const candidates = []
  for (const teamId of teamIds) {
    const rows = await listAll('players', { teamId, source:'registration_docx_import', profileStatus:'imported_pending_claim' }, 500)
    candidates.push(...rows)
  }
  const unmigrated = []
  for (const player of candidates) {
    const existing = await db.collection('registration_player_drafts').where({ legacyPlayerId:text(player._id) }).limit(1).get()
    if (!(existing.data || []).length) unmigrated.push(player)
  }
  if (event.execute !== true) return { success:true, dryRun:true, candidateCount:candidates.length, unmigratedCount:unmigrated.length, teamCount:teamIds.length }
  let migratedCount = 0
  for (const teamId of teamIds) {
    const team = await getDocument('teams', teamId)
    if (!team) continue
    const teamPlayers = unmigrated.filter(item => text(item.teamId) === teamId)
    if (!teamPlayers.length) continue
    let batchId = text(team.registrationImportBatchId)
    if (!batchId) {
      const relation = relations.find(item => text(item.teamId) === teamId) || {}
      const added = await db.collection('registration_import_batches').add({ data:{ sport:SPORT, orgId:actor.orgId, tournamentId, divisionId:text(relation.divisionId), divisionName:text(relation.divisionName), teamId, sourceFileId:text(team.registrationSourceFileId), sourceFileName:text(team.registrationSourceFileName), importMode:'basic', immutable:true, legacyMigration:true, status:'player_review_pending', claimStatus:text(team.claimStatus) === 'claimed' ? 'claimed' : 'unclaimed', playerReviewStatus:'pending', teamName:text(team.name), playerCount:teamPlayers.length, createTime:db.serverDate(), updateTime:db.serverDate() } })
      batchId = text(added._id)
      await db.collection('teams').doc(teamId).update({ data:{ registrationImportBatchId:batchId, updateTime:db.serverDate() } })
    }
    for (const player of teamPlayers) {
      const identity = text(player.idCard || player.idNumber)
      await db.collection('registration_player_drafts').add({ data:{ sport:SPORT, orgId:actor.orgId, tournamentId, divisionId:text((relations.find(item => text(item.teamId) === teamId) || {}).divisionId), importBatchId:batchId, sourceTeamId:teamId, teamId, legacyPlayerId:text(player._id), name:text(player.name), jerseyNumber:Number(player.jerseyNumber || 0), jerseyName:text(player.jerseyName), identityDigest:importedIdentityDigest(identity), identityMasked:importedIdentityMask(identity), gender:text(player.gender), birthDate:text(player.birthDate || player.birthday), nativePlace:text(player.nativePlace), photoUrl:text(player.photoUrl || player.photoFileID), photoFileID:text(player.photoFileID || player.photoUrl), photoProcessingStatus:text(player.photoProcessingStatus), reviewStatus:'pending', source:'registration_docx_import_migration', registrationSourceFileId:text(player.registrationSourceFileId), immutableSource:true, creatorId:actor.userId, createTime:db.serverDate(), updateTime:db.serverDate() } })
      await db.collection('players').doc(player._id).update({ data:{ status:'archived', profileStatus:'legacy_import_migrated', migrationStatus:'preserved_as_import_source', migratedToDraftAt:db.serverDate(), updateTime:db.serverDate() } })
      migratedCount += 1
    }
    await db.collection('teams').doc(teamId).update({ data:{ pendingPlayerDraftCount:teamPlayers.length, playerCount:Math.max(0, Number(team.playerCount || 0) - teamPlayers.length), playerReviewStatus:'pending', updateTime:db.serverDate() } })
  }
  await addAudit('legacy_imported_players_migrated_to_drafts', { tournamentId, actorUserId:actor.userId, actorOrgId:actor.orgId, detail:{ migratedCount, preservedLegacyRecords:true } })
  return { success:true, dryRun:false, migratedCount, preservedLegacyRecords:true }
}

exports.main = async (event) => {
  try {
    const action = text(event && event.action)
    if (action === 'bridgeConfigurationStatus') return await bridgeConfigurationStatus()
    if (action === 'notificationConfigurationStatus') return notificationConfigurationStatus()
    await ensureCollections()
    if (action === 'setDivisionRegistration') return await setDivisionRegistration(event)
    if (action === 'addSyntheticTeams') return await addSyntheticTeams(event)
    if (action === 'importTeamRegistrationBatch') return await importTeamRegistrationBatch(event)
    if (action === 'migrateLegacyImportedPlayers') return await migrateLegacyImportedPlayers(event)
    if (action === 'createTargetedTeamInvitations') return await createTargetedTeamInvitations(event)
    if (action === 'generateTeamInviteCode') return await generateTeamInviteCode(event)
    if (action === 'ensureInvite') return await ensureInvite(event)
    if (action === 'createTargetedRegistrationLink') return await createTargetedRegistrationLink(event)
    if (action === 'createTournamentClaimCode') return await createTournamentClaimCode(event)
    if (action === 'getInvitation') return await getInvitation(event)
    if (action === 'createFollowGate') return await createFollowGate(event)
    if (action === 'createOrganizerServiceGate') return await createOrganizerServiceGate(event)
    if (action === 'createRefereeFollowInvite') return await createRefereeFollowInvite(event)
    if (action === 'createTemporaryRefereeClaim') return await createTemporaryRefereeClaim(event)
    if (action === 'reviewTemporaryRefereeClaim') return await reviewTemporaryRefereeClaim(event)
    if (action === 'getFollowGateStatus') return await followGateStatus(event)
    if (action === 'getOrganizerServiceBindingStatus') return await organizerServiceBindingStatus(event)
    if (action === 'generateTeamMemberInviteAssets') return await generateTeamMemberInviteAssets(event)
    if (action === 'generateTeamPlayerInviteAssets') return await generateTeamPlayerInviteAssets(event)
    if (action === 'saveRegistrationDraft') return await saveRegistrationDraft(event)
    if (action === 'completeRegistrationDraft') return await completeRegistrationDraft(event)
    if (action === 'probeServiceAccount') return await probeServiceAccount(event)
    if (action === 'bindServiceAccount') return await bindServiceAccount(event)
    if (action === 'reviewRegistration') return await reviewRegistration(event)
    if (action === 'cancelTournamentInvitation') return await cancelTournamentInvitation(event)
    if (action === 'deleteUnclaimedTournamentTeam') return await deleteUnclaimedTournamentTeam(event)
    if (action === 'removeClaimedTournamentTeam') return await removeClaimedTournamentTeam(event)
    if (action === 'retryRegistrationNotifications') return await retryRegistrationNotifications(event)
    if (action === 'notificationStatus') return await notificationStatus(event)
    return { success: false, code: 'ACTION_INVALID', message: '不支持的报名联动操作' }
  } catch (error) {
    console.error('[tournamentRegistrationFlow]', text(event && event.action), error.message || error)
    return { success: false, code: error.code || 'REGISTRATION_FLOW_FAILED', message: error.message || '报名联动处理失败' }
  }
}
