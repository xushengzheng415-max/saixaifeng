const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const membershipPlans = require('./membershipPlans.cjs')
const insuranceOps = require('./insuranceOps.cjs')

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })

const OWNER_SETTING_ID = 'platform-owner'
const CODE_TTL_MS = 10 * 60 * 1000
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000
const MAX_FAILED_ATTEMPTS = 5
const ALLOWED_DURATIONS = [2, 24, 168]

function firstRecord(data) {
  if (Array.isArray(data)) return data[0] || null
  return data || null
}

function dateValue(value) {
  if (!value) return 0
  const raw = value && typeof value === 'object' && value.$date ? value.$date : value
  const time = new Date(raw).getTime()
  return Number.isFinite(time) ? time : 0
}

function maskPhone(phone) {
  const value = String(phone || '')
  if (!/^1\d{10}$/.test(value)) return ''
  return value.slice(0, 3) + '****' + value.slice(-4)
}

function userName(user) {
  return user.nickname || user.userName || user.nickName || maskPhone(user.phone || user.phoneNumber) || '微信用户'
}

function safeUser(user) {
  return {
    _id: user._id,
    name: userName(user),
    avatarUrl: user.headimgurl || user.avatarUrl || '',
    phoneMasked: maskPhone(user.phone || user.phoneNumber),
    role: user.role || 'organizer',
    isPlatformOwner: user.isPlatformOwner === true,
    createTime: user.createTime || null,
    lastLoginTime: user.lastLoginTime || null
  }
}

function generateAssistCode() {
  return crypto.randomInt(0, 100000000).toString().padStart(8, '0')
}

function hashAssistCode(code) {
  return crypto.createHash('sha256').update('sxf-assist-v1|' + String(code || '')).digest('hex')
}

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex')
}

async function getOwnerSetting(db) {
  try {
    const result = await db.collection('platform_settings').doc(OWNER_SETTING_ID).get()
    return firstRecord(result.data)
  } catch (err) {
    return null
  }
}

async function findFlaggedOwner(db) {
  const result = await db.collection('users').where({ isPlatformOwner: true }).limit(2).get()
  const owners = result.data || []
  if (owners.length > 1) throw new Error('检测到多个平台所有者账号，请先处理账号配置')
  return owners[0] || null
}

async function resolveCurrentUser(db, event) {
  // 网页端即使已经过 webLoginApi，也在此再次校验原始随机会话令牌。
  // 这样直接调用本云函数时，伪造 __authUserId 等字段不会获得任何权限。
  const authToken = String(event.__authToken || '').trim()
  if (authToken) {
    const sessionResult = await db.collection('auth_sessions').where({
      tokenHash: hashSessionToken(authToken),
      active: true,
      expiresAt: db.command.gt(new Date())
    }).limit(2).get()
    const sessions = sessionResult.data || []
    if (sessions.length !== 1) throw new Error('网页登录会话已失效，请重新微信扫码登录')
    if (sessions[0].principalType === 'platform_owner' && sessions[0].channel === 'platform_password') {
      return { _id: 'platform-owner', nickname: '平台负责人', role: 'platform_owner', isPlatformOwner: true }
    }
    const result = await db.collection('users').doc(sessions[0].userId).get()
    const user = firstRecord(result.data)
    if (user) return user
    throw new Error('当前登录账号不存在，请重新登录')
  }

  // 小程序端使用微信云函数上下文识别本人。
  const wxContext = cloud.getWXContext()
  const openId = wxContext && wxContext.OPENID
  if (openId) {
    const _ = db.command
    const result = await db.collection('users').where(_.or([
      { openId },
      { wechatOpenId: openId },
      { _openid: openId }
    ])).limit(2).get()
    const users = result.data || []
    if (users.length > 1) throw new Error('微信身份关联了多个账号，请先处理重复账号')
    if (users[0]) return users[0]
  }

  throw new Error('无法识别当前登录账号，请重新登录')
}

async function ownerState(db, user) {
  const setting = await getOwnerSetting(db)
  const flaggedOwner = await findFlaggedOwner(db)
  const configuredOwnerId = String(process.env.PLATFORM_OWNER_USER_ID || '').trim()
  const ownerUserId = (setting && setting.ownerUserId) || (flaggedOwner && flaggedOwner._id) || configuredOwnerId
  return {
    isPlatformOwner: Boolean(user && ownerUserId && user._id === ownerUserId) || Boolean(user && user.isPlatformOwner === true),
    ownerExists: Boolean(ownerUserId)
  }
}

async function requireOwner(db, user) {
  const state = await ownerState(db, user)
  if (!state.isPlatformOwner) throw new Error('仅平台所有者可以使用隐藏协助服务')
  return state
}

function normalizeDuration(value) {
  const duration = Number(value)
  return ALLOWED_DURATIONS.includes(duration) ? duration : 2
}

function normalizedStatus(request) {
  const now = Date.now()
  if (request.status === 'pending' && dateValue(request.codeExpiresAt) <= now) return 'expired'
  if (request.status === 'active' && dateValue(request.grantExpiresAt) <= now) return 'expired'
  return request.status || 'pending'
}

function statusLabel(status) {
  return {
    pending: '等待用户确认',
    active: '协助进行中',
    rejected: '用户已拒绝',
    revoked: '授权已撤销',
    expired: '已过期'
  }[status] || '未知状态'
}

function safeRequest(request) {
  const status = normalizedStatus(request)
  return {
    _id: request._id,
    status,
    statusLabel: statusLabel(status),
    codeLast4: request.codeLast4 || '',
    helperUserId: request.helperUserId || '',
    helperName: request.helperName || '赛小蜂工作人员',
    targetUserId: request.targetUserId || '',
    targetName: request.targetName || '',
    targetPhoneMasked: request.targetPhoneMasked || '',
    reason: request.reason || '',
    durationHours: request.durationHours || 2,
    permissions: request.permissions || { view: true, edit: true, delete: false },
    channel: request.channel || 'wechat_customer_service',
    createTime: request.createTime || null,
    codeExpiresAt: request.codeExpiresAt || null,
    acceptedAt: request.acceptedAt || null,
    grantExpiresAt: request.grantExpiresAt || null,
    revokedAt: request.revokedAt || null
  }
}

async function markExpiredIfNeeded(db, request) {
  if (!request) return null
  const status = normalizedStatus(request)
  if (status === 'expired' && request.status !== 'expired') {
    await db.collection('assistance_requests').doc(request._id).update({
      data: { status: 'expired', updateTime: db.serverDate() }
    })
    return { ...request, status: 'expired' }
  }
  return request
}

async function getStatus(db, user) {
  const state = await ownerState(db, user)
  return {
    success: true,
    isPlatformOwner: state.isPlatformOwner,
    ownerExists: state.ownerExists,
    currentUser: safeUser(user),
    serviceMode: 'wechat_customer_service'
  }
}

async function createRequest(db, user, event) {
  await requireOwner(db, user)
  const durationHours = normalizeDuration(event.durationHours)
  const reason = String(event.reason || '协助排查并处理赛小蜂足球使用问题').trim().slice(0, 120)
  const code = generateAssistCode()
  const now = Date.now()
  const permissions = { view: true, edit: true, delete: false }
  const result = await db.collection('assistance_requests').add({
    data: {
      codeHash: hashAssistCode(code),
      codeLast4: code.slice(-4),
      helperUserId: user._id,
      helperName: userName(user),
      status: 'pending',
      reason,
      durationHours,
      permissions,
      channel: 'wechat_customer_service',
      codeExpiresAt: new Date(now + CODE_TTL_MS),
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }
  })

  return {
    success: true,
    request: {
      _id: result._id,
      code,
      reason,
      durationHours,
      permissions,
      codeExpiresAt: new Date(now + CODE_TTL_MS)
    }
  }
}

async function listRequests(db, user) {
  await requireOwner(db, user)
  const result = await db.collection('assistance_requests')
    .where({ helperUserId: user._id })
    .orderBy('createTime', 'desc')
    .limit(50)
    .get()
  const requests = []
  for (const item of (result.data || [])) {
    requests.push(safeRequest(await markExpiredIfNeeded(db, item)))
  }
  return { success: true, requests }
}

async function failedAttemptCount(db, userId) {
  const _ = db.command
  const result = await db.collection('assistance_attempts').where({
    userId,
    success: false,
    createTime: _.gt(new Date(Date.now() - ATTEMPT_WINDOW_MS))
  }).count()
  return result.total || 0
}

async function recordAttempt(db, userId, success) {
  await db.collection('assistance_attempts').add({
    data: { userId, success, createTime: db.serverDate() }
  })
}

async function getRequestByCode(db, user, code) {
  const normalizedCode = String(code || '').replace(/\D/g, '')
  if (!/^\d{8}$/.test(normalizedCode)) throw new Error('请输入8位数字协助码')
  if (await failedAttemptCount(db, user._id) >= MAX_FAILED_ATTEMPTS) {
    throw new Error('协助码尝试次数过多，请10分钟后再试')
  }
  const result = await db.collection('assistance_requests')
    .where({ codeHash: hashAssistCode(normalizedCode) })
    .limit(2)
    .get()
  const requests = result.data || []
  if (requests.length !== 1) {
    await recordAttempt(db, user._id, false)
    throw new Error('协助码无效或已过期')
  }
  const request = await markExpiredIfNeeded(db, requests[0])
  if (request.status !== 'pending') {
    await recordAttempt(db, user._id, false)
    throw new Error(statusLabel(normalizedStatus(request)))
  }
  if (request.helperUserId === user._id) throw new Error('不能接受自己发起的协助申请')
  await recordAttempt(db, user._id, true)
  return request
}

async function previewCode(db, user, event) {
  const request = await getRequestByCode(db, user, event.code)
  return {
    success: true,
    request: {
      _id: request._id,
      helperName: request.helperName || '赛小蜂工作人员',
      reason: request.reason || '',
      durationHours: request.durationHours || 2,
      permissions: request.permissions || { view: true, edit: true, delete: false },
      codeExpiresAt: request.codeExpiresAt || null,
      channel: request.channel || 'wechat_customer_service'
    }
  }
}

async function acceptCode(db, user, event) {
  const request = await getRequestByCode(db, user, event.code)
  const durationHours = normalizeDuration(request.durationHours)
  const grantExpiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000)
  const result = await db.collection('assistance_requests').where({
    _id: request._id,
    status: 'pending'
  }).update({
    data: {
      status: 'active',
      targetUserId: user._id,
      targetName: userName(user),
      targetPhoneMasked: maskPhone(user.phone || user.phoneNumber),
      acceptedAt: db.serverDate(),
      grantExpiresAt,
      updateTime: db.serverDate()
    }
  })
  if (!result.stats || result.stats.updated !== 1) throw new Error('该协助申请已被处理，请刷新后重试')
  return { success: true, message: '已授权赛小蜂工作人员进行临时协助', grantExpiresAt }
}

async function rejectCode(db, user, event) {
  const request = await getRequestByCode(db, user, event.code)
  const result = await db.collection('assistance_requests').where({
    _id: request._id,
    status: 'pending'
  }).update({
    data: {
      status: 'rejected',
      targetUserId: user._id,
      targetName: userName(user),
      rejectedAt: db.serverDate(),
      updateTime: db.serverDate()
    }
  })
  if (!result.stats || result.stats.updated !== 1) throw new Error('该协助申请已被处理')
  return { success: true, message: '已拒绝本次协助申请' }
}

async function listMyGrants(db, user) {
  const result = await db.collection('assistance_requests')
    .where({ targetUserId: user._id })
    .orderBy('createTime', 'desc')
    .limit(30)
    .get()
  const requests = []
  for (const item of (result.data || [])) {
    requests.push(safeRequest(await markExpiredIfNeeded(db, item)))
  }
  return { success: true, requests }
}

async function revokeMyGrant(db, user, event) {
  const requestId = String(event.requestId || '').trim()
  if (!requestId) throw new Error('缺少协助申请ID')
  const result = await db.collection('assistance_requests').doc(requestId).get()
  const request = firstRecord(result.data)
  if (!request || request.targetUserId !== user._id) throw new Error('无权撤销该协助授权')
  if (normalizedStatus(request) !== 'active') throw new Error('该协助授权当前不可撤销')
  await db.collection('assistance_requests').doc(requestId).update({
    data: { status: 'revoked', revokedBy: 'target', revokedAt: db.serverDate(), updateTime: db.serverDate() }
  })
  return { success: true, message: '协助权限已立即撤销' }
}

async function revokeRequest(db, user, event) {
  await requireOwner(db, user)
  const requestId = String(event.requestId || '').trim()
  const result = await db.collection('assistance_requests').doc(requestId).get()
  const request = firstRecord(result.data)
  if (!request || request.helperUserId !== user._id) throw new Error('协助申请不存在')
  if (!['pending', 'active'].includes(normalizedStatus(request))) throw new Error('该协助申请当前不可撤销')
  await db.collection('assistance_requests').doc(requestId).update({
    data: { status: 'revoked', revokedBy: 'helper', revokedAt: db.serverDate(), updateTime: db.serverDate() }
  })
  return { success: true, message: '协助申请已撤销' }
}

function recordBelongsToUser(record, user, idFields, phoneFields) {
  const ids = [user._id, user.uid, user.userId].filter(Boolean)
  if (idFields.some(field => record[field] && ids.includes(record[field]))) return true
  const phones = [user.phone, user.phoneNumber].filter(Boolean)
  if (phones.length > 0 && phoneFields.some(field => record[field] && phones.includes(record[field]))) return true
  const openIds = [user.openId, user.openid, user.wechatOpenId, user._openid].filter(Boolean)
  return openIds.length > 0 && ['openId', 'openid', 'wechatOpenId', '_openid']
    .some(field => record[field] && openIds.includes(record[field]))
}

function playerBelongsToTeam(player, team) {
  const teamKeys = [team._id, team.teamId, team.teamCode, team.code].filter(Boolean)
  const playerTeamKeys = [player.teamId, player.teamCode]
    .concat(Array.isArray(player.teamIds) ? player.teamIds : [])
    .concat(Array.isArray(player.teamCodes) ? player.teamCodes : [])
    .filter(Boolean)
  return playerTeamKeys.some(key => teamKeys.includes(key))
}

async function loadCollection(db, name, limit) {
  try {
    const result = await db.collection(name).limit(limit || 1000).get()
    return result.data || []
  } catch (err) {
    console.warn('[platformOwner] load collection failed:', name, err.message)
    return []
  }
}

function getRegisteredTeamCount(tournament, tournamentTeams) {
  const activeStatuses = ['approved', 'invited', 'confirmed', 'active']
  const linkedCount = tournamentTeams.filter(item =>
    item.tournamentId === tournament._id && activeStatuses.includes(item.status || 'approved')
  ).length
  if (linkedCount > 0) return linkedCount
  const fallback = tournament.registeredTeams || tournament.approvedTeams || tournament.teamCount || 0
  if (Array.isArray(fallback)) return fallback.length
  const numeric = Number(fallback)
  return Number.isFinite(numeric) ? numeric : 0
}

async function getActiveGrant(db, user, requestId) {
  await requireOwner(db, user)
  if (!requestId) throw new Error('缺少协助授权ID')
  const result = await db.collection('assistance_requests').doc(requestId).get()
  const request = await markExpiredIfNeeded(db, firstRecord(result.data))
  if (!request || request.helperUserId !== user._id) throw new Error('协助授权不存在')
  if (normalizedStatus(request) !== 'active') throw new Error('协助授权已失效，请刷新列表')
  return request
}

async function getOverview(db, user, event) {
  const grant = await getActiveGrant(db, user, event.requestId)
  const targetResult = await db.collection('users').doc(grant.targetUserId).get()
  const target = firstRecord(targetResult.data)
  if (!target) throw new Error('被协助账号不存在')

  const [teams, players, tournaments, matches, tournamentTeams] = await Promise.all([
    loadCollection(db, 'teams', 1000),
    loadCollection(db, 'players', 1000),
    loadCollection(db, 'tournaments', 1000),
    loadCollection(db, 'matches', 1000),
    loadCollection(db, 'tournament_teams', 1000)
  ])
  const targetTeams = teams.filter(team => recordBelongsToUser(
    team,
    target,
    ['creatorId', 'ownerId', 'userId', 'createdBy'],
    ['ownerPhone', 'creatorPhone', 'contactPhone', 'phoneNumber', 'phone', 'mobile']
  ))
  const targetTournaments = tournaments.filter(tournament => recordBelongsToUser(
    tournament,
    target,
    ['creatorId', 'organizerId', 'ownerId', 'userId', 'createdBy'],
    ['creatorPhone', 'organizerPhone', 'ownerPhone', 'contactPhone', 'phoneNumber', 'phone']
  ))
  const tournamentIds = new Set(targetTournaments.map(item => item._id).filter(Boolean))
  const targetPlayers = players.filter(player => targetTeams.some(team => playerBelongsToTeam(player, team)))
  const targetMatches = matches.filter(match =>
    tournamentIds.has(match.tournamentId) || targetTeams.some(team => [match.homeTeamId, match.awayTeamId].includes(team._id))
  )
  const account = {
    ...safeUser(target),
    teamCount: targetTeams.length,
    playerCount: targetPlayers.length,
    tournamentCount: targetTournaments.length,
    matchCount: targetMatches.length,
    teams: targetTeams.map(team => ({
      _id: team._id,
      name: team.name || team.teamName || '未命名球队',
      logo: team.logo || team.logoUrl || '',
      playerCount: Number(team.playerCount || targetPlayers.filter(player => playerBelongsToTeam(player, team)).length || 0)
    })),
    tournaments: targetTournaments.map(tournament => ({
      _id: tournament._id,
      name: tournament.name || '未命名赛事',
      status: tournament.status || 'draft',
      registeredTeams: getRegisteredTeamCount(tournament, tournamentTeams)
    }))
  }

  return {
    success: true,
    grant: safeRequest(grant),
    accounts: [account],
    totals: {
      accountCount: 1,
      teamCount: targetTeams.length,
      playerCount: targetPlayers.length,
      tournamentCount: targetTournaments.length,
      matchCount: targetMatches.length
    }
  }
}

// ===== 微信授权撤回复规（2026-10-20）：邮件名单批量处理与审计查询 =====

const REVOCATION_APP_TYPES = ['miniprogram', 'service', 'website']

function parseRevocationText(rawText) {
  const items = []
  const invalidLines = []
  String(rawText || '').split(/\r?\n/).forEach(line => {
    const trimmed = line.trim()
    if (!trimmed) return
    const fields = trimmed.split(/[,\t;]+/).map(field => field.trim()).filter(field => field !== '')
    if (!fields.length) return
    const [appType, openid, unionid, revokeInfo] = fields
    if (!REVOCATION_APP_TYPES.includes(appType) || !openid) {
      invalidLines.push(trimmed)
      return
    }
    items.push({ appType, openid, unionid: unionid || '', revokeInfo: revokeInfo || '', source: 'email_batch' })
  })
  return { items, invalidLines }
}

async function revocationProcess(db, user, event) {
  const state = await ownerState(db, user)
  if (!state.isPlatformOwner) throw new Error('仅平台所有者可以处理授权撤回名单')
  let items = Array.isArray(event.items) ? event.items : []
  let invalidLines = []
  if (!items.length && event.rawText) {
    const parsed = parseRevocationText(event.rawText)
    items = parsed.items
    invalidLines = parsed.invalidLines
  }
  if (!items.length) return { success: true, summary: { total: 0, processed: 0, noMatch: 0, noRelevantScope: 0, invalid: 0 }, invalidLines }
  const result = await cloud.callFunction({
    name: 'authorizationRevocation',
    data: { action: 'processBatch', items, defaultScopes: event.defaultScopes || [] }
  })
  const payload = result.result || {}
  if (payload.success === false) throw new Error(payload.error || '撤回执行器处理失败')
  return { success: true, summary: payload.summary || payload, invalidLines }
}

async function revocationHistory(db, user, event) {
  const state = await ownerState(db, user)
  if (!state.isPlatformOwner) throw new Error('仅平台所有者可以查询授权撤回记录')
  const result = await cloud.callFunction({
    name: 'authorizationRevocation',
    data: { action: 'history', limit: event.limit || 50 }
  })
  const payload = result.result || {}
  if (payload.success === false) throw new Error(payload.error || '撤回执行器查询失败')
  return { success: true, logs: payload.logs || [] }
}

// ===== AI 形象照：模型上下架配置 + 用量统计（2026-10-27） =====
// 模型目录、默认值和凭据就绪状态只保留在 aiPortraitDemo 一处（这里通过云函数调用读取），
// 本函数只负责平台负责人鉴权、配置写入和用量聚合，避免两个函数各写一份清单后长期分叉。
const AI_PORTRAIT_SETTING_ID = 'aiPortraitModels'
const AI_PORTRAIT_USAGE_COLLECTION = 'ai_portrait_usage'
const AI_PORTRAIT_USAGE_DAYS = [1, 7, 30]
const AI_PORTRAIT_USAGE_LIMIT = 2000

async function aiPortraitCatalog() {
  let result = null
  try {
    result = await cloud.callFunction({ name: 'aiPortraitDemo', data: { action: 'adminGetModels' } })
  } catch (error) {
    // 演示后端尚未发布时给出可执行的提示，而不是“未知错误”
    throw new Error('AI 形象照后端暂不可用：' + (error.message || '调用失败'))
  }
  const payload = (result && result.result) || {}
  if (payload.success !== true || !payload.setting || !Array.isArray(payload.models)) {
    throw new Error(payload.error || 'AI 形象照后端尚未发布，请先部署 aiPortraitDemo')
  }
  return payload
}

function aiPortraitReady(catalog, key) {
  const item = catalog.models.filter(model => model.key === key)[0]
  return Boolean(item && item.ready)
}

async function getAiPortraitModels(db, user) {
  await requireOwner(db, user)
  const catalog = await aiPortraitCatalog()
  return { success: true, models: catalog.models, setting: catalog.setting }
}

async function saveAiPortraitModels(db, user, event) {
  await requireOwner(db, user)
  const catalog = await aiPortraitCatalog()
  const input = event && event.setting && typeof event.setting === 'object' ? event.setting : (event || {})
  const modelsInput = input.models && typeof input.models === 'object' ? input.models : {}
  const keys = catalog.models.map(item => item.key)
  if (!keys.length) throw new Error('AI 形象照后端没有返回可配置的模型')
  const models = {}
  keys.forEach(key => {
    const previous = catalog.models.filter(item => item.key === key)[0]
    const wanted = modelsInput[key]
    models[key] = {
      enabled: wanted && typeof wanted.enabled === 'boolean'
        ? wanted.enabled
        : Boolean(previous && previous.enabled)
    }
  })
  const requestedDefault = String(input.defaultModel || '')
  const defaultModel = keys.indexOf(requestedDefault) >= 0
    ? requestedDefault
    : (keys.indexOf(String(catalog.setting.defaultModel || '')) >= 0 ? String(catalog.setting.defaultModel) : keys[0])
  const allowUserChoice = typeof input.allowUserChoice === 'boolean'
    ? input.allowUserChoice
    : catalog.setting.allowUserChoice !== false
  // 硬冲突直接拒绝：默认模型停用、或一个模型都没启用，前台必然出错
  if (!models[defaultModel] || !models[defaultModel].enabled) {
    throw new Error('默认模型不能是已停用的模型，请先启用该模型或改选其他默认模型')
  }
  const enabledKeys = keys.filter(key => models[key].enabled)
  if (!enabledKeys.length) throw new Error('至少需要启用一个模型')
  // 非硬冲突只提示不拦：允许先在后台把还没开通的模型排上去，等凭据配置好再对外
  const warnings = []
  if (!enabledKeys.some(key => aiPortraitReady(catalog, key))) {
    warnings.push('当前启用的模型都还没有配置凭据，客户点开会直接失败')
  }
  if (!allowUserChoice && !aiPortraitReady(catalog, defaultModel)) {
    warnings.push('已关闭客户自选，但默认模型还没有配置凭据，客户无法出图')
  }

  await db.collection('platform_settings').doc(AI_PORTRAIT_SETTING_ID).set({
    data: {
      models: models,
      defaultModel: defaultModel,
      allowUserChoice: allowUserChoice,
      updatedAt: db.serverDate(),
      updatedBy: String((user && (user._id || user.nickname)) || 'platform-owner').slice(0, 80)
    }
  })

  return {
    success: true,
    warnings: warnings,
    setting: { models: models, defaultModel: defaultModel, allowUserChoice: allowUserChoice },
    models: catalog.models.map(item => ({
      ...item,
      enabled: Boolean(models[item.key] && models[item.key].enabled),
      default: item.key === defaultModel
    }))
  }
}

// 用量统计也按北京时间切天，与 aiPortraitDemo 写入时的 day 字段口径保持一致
function usageDayKey(time) {
  const at = Number(time) || Date.now()
  return new Date(at + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function usageTimeText(value) {
  const time = dateValue(value)
  if (!time) return ''
  return new Date(time + 8 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ')
}

function averageDuration(sum, count) {
  return count > 0 ? Math.round(sum / count) : 0
}

async function getAiPortraitUsage(db, user, event) {
  await requireOwner(db, user)
  const wantedDays = Number(event && event.days)
  const days = AI_PORTRAIT_USAGE_DAYS.indexOf(wantedDays) >= 0 ? wantedDays : 7
  const sinceDay = usageDayKey(Date.now() - (days - 1) * 24 * 60 * 60 * 1000)

  let rows = []
  let available = true
  let note = ''
  try {
    const result = await db.collection(AI_PORTRAIT_USAGE_COLLECTION)
      .where({ day: db.command.gte(sinceDay) })
      .orderBy('createdAt', 'desc')
      .limit(AI_PORTRAIT_USAGE_LIMIT)
      .get()
    rows = result.data || []
  } catch (error) {
    const message = String((error && (error.message || error)) || '')
    // 集合还没创建时如实说明“暂无记录”，不把缺失值当 0 展示成“已经统计过”
    if (/not exist|not found|不存在|DATABASE_COLLECTION_NOT_EXIST/i.test(message)) {
      available = false
      note = '还没有产生生成记录（用量集合尚未创建，第一次出图后自动出现）'
    } else {
      throw new Error('读取用量记录失败：' + message)
    }
  }

  const totals = { requests: 0, success: 0, failed: 0, images: 0, durationSum: 0, durationCount: 0 }
  const modelMap = {}
  const dayMap = {}
  rows.forEach(row => {
    const ok = row.success === true
    totals.requests += 1
    totals[ok ? 'success' : 'failed'] += 1
    totals.images += Number(row.images || 0)
    if (ok && Number(row.durationMs) > 0) {
      totals.durationSum += Number(row.durationMs)
      totals.durationCount += 1
    }
    const modelKey = String(row.model || 'unknown')
    if (!modelMap[modelKey]) {
      modelMap[modelKey] = {
        key: modelKey,
        label: String(row.modelLabel || modelKey),
        requests: 0, success: 0, failed: 0, images: 0, durationSum: 0, durationCount: 0
      }
    }
    const modelRow = modelMap[modelKey]
    modelRow.requests += 1
    modelRow[ok ? 'success' : 'failed'] += 1
    modelRow.images += Number(row.images || 0)
    if (ok && Number(row.durationMs) > 0) {
      modelRow.durationSum += Number(row.durationMs)
      modelRow.durationCount += 1
    }
    const day = String(row.day || usageDayKey(dateValue(row.createdAt)))
    if (!dayMap[day]) dayMap[day] = { day: day, requests: 0, success: 0, failed: 0 }
    dayMap[day].requests += 1
    dayMap[day][ok ? 'success' : 'failed'] += 1
  })

  const byModel = Object.keys(modelMap)
    .map(key => {
      const item = modelMap[key]
      return {
        key: item.key,
        label: item.label,
        requests: item.requests,
        success: item.success,
        failed: item.failed,
        successRate: item.requests ? Math.round(item.success / item.requests * 100) : 0,
        images: item.images,
        avgDurationMs: averageDuration(item.durationSum, item.durationCount)
      }
    })
    .sort((a, b) => b.requests - a.requests)

  const byDay = Object.keys(dayMap)
    .map(key => ({ ...dayMap[key], successRate: dayMap[key].requests ? Math.round(dayMap[key].success / dayMap[key].requests * 100) : 0 }))
    .sort((a, b) => (a.day < b.day ? -1 : 1))

  return {
    success: true,
    days: days,
    sinceDay: sinceDay,
    available: available,
    note: note,
    limit: AI_PORTRAIT_USAGE_LIMIT,
    // 超过上限只统计最近 2000 条：如实标记，不做静默截断
    truncated: rows.length >= AI_PORTRAIT_USAGE_LIMIT,
    totals: {
      requests: totals.requests,
      success: totals.success,
      failed: totals.failed,
      successRate: totals.requests ? Math.round(totals.success / totals.requests * 100) : 0,
      images: totals.images,
      avgDurationMs: averageDuration(totals.durationSum, totals.durationCount)
    },
    byModel: byModel,
    byDay: byDay,
    recent: rows.slice(0, 20).map(row => ({
      time: usageTimeText(row.createdAt),
      model: String(row.modelLabel || row.model || ''),
      mode: String(row.mode || ''),
      pose: String(row.poseLabel || row.pose || ''),
      jerseyMode: String(row.jerseyMode || ''),
      success: row.success === true,
      durationMs: Number(row.durationMs || 0),
      error: String(row.error || '')
    }))
  }
}

// ============ 蜂蜜充值订单（平台运营中心只读） ============
// 数据源只有 fan_points_ledger 与 honey_orders：平台只做查询、汇总与对账展示，
// 不复制扣费/入账算法，不改镜像，也不开放退款（退款规则未确认，见 docs/HONEY_TOPUP_IMPLEMENTATION_2026-10-27.md）。
const HONEY_ORDER_COLLECTION = 'honey_orders'
const HONEY_LEDGER_COLLECTION = 'fan_points_ledger'
const HONEY_ORDER_SCAN_LIMIT = 3000
const HONEY_ORDER_PAGE_SIZES = [10, 20, 50]
const HONEY_OVERVIEW_DAYS = [1, 7, 30, 90]
const HONEY_ORDER_STATUS_LABEL = { pending: '待支付', paid: '已支付', closed: '已关闭', refunded: '已退款' }
const HONEY_LEDGER_STATE_LABEL = { pending: '未入账', credited: '已入账', blocked: '入账受阻' }

function honeyYuan(cents) {
  const value = Number(cents)
  if (!Number.isFinite(value) || value < 0) return ''
  return (value / 100).toFixed(value % 100 === 0 ? 0 : 2)
}

function honeyTimeText(value) {
  return usageTimeText(value)
}

function maskOpenId(openId) {
  const value = String(openId || '')
  if (value.length <= 10) return value ? value.slice(0, 2) + '****' : ''
  return value.slice(0, 6) + '****' + value.slice(-4)
}

function safeHoneyOrder(row) {
  const status = String(row.status || 'pending')
  const ledgerState = String(row.ledgerState || 'pending')
  const priceCents = Number(row.priceCents) || 0
  return {
    outTradeNo: String(row.outTradeNo || row._id || ''),
    userId: String(row.userId || ''),
    openIdMasked: maskOpenId(row.openId),
    packId: String(row.packId || ''),
    priceCents: priceCents,
    priceYuan: honeyYuan(priceCents),
    drops: Number(row.drops) || 0,
    bonusDrops: Number(row.bonusDrops) || 0,
    totalDrops: Number(row.totalDrops) || 0,
    status: status,
    statusLabel: HONEY_ORDER_STATUS_LABEL[status] || '未知状态',
    ledgerState: ledgerState,
    ledgerLabel: HONEY_LEDGER_STATE_LABEL[ledgerState] || '未知状态',
    ledgerError: String(row.ledgerError || ''),
    transactionId: String(row.transactionId || ''),
    clientPlatform: String(row.clientPlatform || ''),
    notifyCount: Number(row.notifyCount) || 0,
    createdAt: dateValue(row.createdAt),
    createdText: honeyTimeText(row.createdAt),
    paidText: honeyTimeText(row.paidAt),
    closedText: honeyTimeText(row.closedAt)
  }
}

// 读取最近订单；集合缺失时如实说明，不用 0 冒充「已统计」
async function readHoneyOrders(db, limit) {
  const size = Math.min(Math.max(Number(limit) || HONEY_ORDER_SCAN_LIMIT, 1), HONEY_ORDER_SCAN_LIMIT)
  try {
    const result = await db.collection(HONEY_ORDER_COLLECTION).orderBy('createdAt', 'desc').limit(size).get()
    const rows = result.data || []
    return { rows: rows, available: true, note: '', truncated: rows.length >= size, limit: size }
  } catch (error) {
    const message = String((error && (error.message || error)) || '')
    if (/not exist|not found|不存在|DATABASE_COLLECTION_NOT_EXIST/i.test(message)) {
      return { rows: [], available: false, note: '还没有产生充值订单（honey_orders 集合为空或尚未创建）', truncated: false, limit: size }
    }
    throw new Error('读取充值订单失败：' + message)
  }
}

async function honeyOrdersOverview(db, user, event) {
  await requireOwner(db, user)
  const wanted = Number(event && event.days)
  const days = HONEY_OVERVIEW_DAYS.indexOf(wanted) >= 0 ? wanted : 7
  const todayKey = usageDayKey(Date.now())
  const sinceKey = usageDayKey(Date.now() - (days - 1) * 24 * 60 * 60 * 1000)
  const read = await readHoneyOrders(db)

  const dayKeys = []
  for (let index = days - 1; index >= 0; index -= 1) dayKeys.push(usageDayKey(Date.now() - index * 24 * 60 * 60 * 1000))
  const dayMap = {}
  dayKeys.forEach(key => { dayMap[key] = { day: key, paidCount: 0, grossCents: 0, refundCents: 0 } })
  const packMap = {}
  const totals = { created: 0, paid: 0, pending: 0, closed: 0, refunded: 0, blocked: 0, grossCents: 0, refundCents: 0, creditedDrops: 0 }

  read.rows.forEach(row => {
    const day = usageDayKey(dateValue(row.createdAt) || Date.now())
    if (day < sinceKey) return
    const status = String(row.status || 'pending')
    const priceCents = Number(row.priceCents) || 0
    totals.created += 1
    if (status === 'pending') totals.pending += 1
    if (status === 'closed') totals.closed += 1
    if (status === 'paid' || status === 'refunded') { totals.paid += 1; totals.grossCents += priceCents }
    if (status === 'refunded') { totals.refunded += 1; totals.refundCents += priceCents }
    if (String(row.ledgerState || '') === 'blocked') totals.blocked += 1
    if (String(row.ledgerState || '') === 'credited' && status !== 'refunded') totals.creditedDrops += Number(row.totalDrops) || 0
    if (dayMap[day]) {
      if (status === 'paid' || status === 'refunded') { dayMap[day].paidCount += 1; dayMap[day].grossCents += priceCents }
      if (status === 'refunded') dayMap[day].refundCents += priceCents
    }
    const packKey = String(priceCents)
    if (!packMap[packKey]) packMap[packKey] = { priceCents: priceCents, priceYuan: honeyYuan(priceCents), orders: 0, paid: 0, grossCents: 0 }
    packMap[packKey].orders += 1
    if (status === 'paid' || status === 'refunded') { packMap[packKey].paid += 1; packMap[packKey].grossCents += priceCents }
  })

  const settled = totals.paid + totals.closed
  return {
    success: true,
    days: days,
    sinceDay: sinceKey,
    todayDay: todayKey,
    available: read.available,
    note: read.note,
    scanned: read.rows.length,
    limit: read.limit,
    truncated: read.truncated,
    truncatedNote: read.truncated ? `只统计最近 ${read.limit} 条订单，更早的订单未计入` : '',
    totals: {
      created: totals.created,
      paid: totals.paid,
      pending: totals.pending,
      closed: totals.closed,
      refunded: totals.refunded,
      blocked: totals.blocked,
      grossCents: totals.grossCents,
      grossYuan: honeyYuan(totals.grossCents),
      refundCents: totals.refundCents,
      refundYuan: honeyYuan(totals.refundCents),
      netCents: totals.grossCents - totals.refundCents,
      netYuan: honeyYuan(totals.grossCents - totals.refundCents),
      creditedDrops: totals.creditedDrops,
      successRate: settled ? Math.round(totals.paid / settled * 100) : 0
    },
    byDay: dayKeys.map(key => ({
      day: key,
      paidCount: dayMap[key].paidCount,
      grossCents: dayMap[key].grossCents,
      grossYuan: honeyYuan(dayMap[key].grossCents),
      refundCents: dayMap[key].refundCents,
      refundYuan: honeyYuan(dayMap[key].refundCents)
    })),
    // 档位固定按价格从高到低展示，单数只作为分布信息，避免同单数时顺序随机。
    byPack: Object.keys(packMap).map(key => packMap[key]).sort((a, b) => b.priceCents - a.priceCents)
  }
}

async function honeyOrderList(db, user, event) {
  await requireOwner(db, user)
  const status = ['all', 'pending', 'paid', 'closed', 'refunded'].indexOf(String(event.status || 'all')) >= 0 ? String(event.status || 'all') : 'all'
  const ledgerState = ['all', 'pending', 'credited', 'blocked'].indexOf(String(event.ledgerState || 'all')) >= 0 ? String(event.ledgerState || 'all') : 'all'
  const keyword = String(event.keyword || '').trim().toLowerCase()
  const wantedSize = Number(event.pageSize)
  const pageSize = HONEY_ORDER_PAGE_SIZES.indexOf(wantedSize) >= 0 ? wantedSize : 20
  const page = Math.max(Number(event.page) || 1, 1)
  const read = await readHoneyOrders(db)

  let rows = read.rows
  if (status !== 'all') rows = rows.filter(row => String(row.status || 'pending') === status)
  if (ledgerState !== 'all') rows = rows.filter(row => String(row.ledgerState || 'pending') === ledgerState)
  if (keyword) {
    rows = rows.filter(row => [row.outTradeNo, row._id, row.transactionId, row.userId, row.openId]
      .some(value => String(value || '').toLowerCase().indexOf(keyword) >= 0))
  }
  const total = rows.length
  const pageCount = Math.max(Math.ceil(total / pageSize), 1)
  const current = Math.min(page, pageCount)
  const slice = rows.slice((current - 1) * pageSize, current * pageSize)
  return {
    success: true,
    rows: slice.map(safeHoneyOrder),
    total: total,
    page: current,
    pageSize: pageSize,
    pageCount: pageCount,
    scanned: read.rows.length,
    limit: read.limit,
    truncated: read.truncated,
    truncatedNote: read.truncated ? `只检索最近 ${read.limit} 条订单，更早的订单未参与筛选` : '',
    available: read.available,
    note: read.note
  }
}

async function honeyOrderDetail(db, user, event) {
  await requireOwner(db, user)
  const outTradeNo = String(event.outTradeNo || '').trim()
  if (!/^HT[0-9A-Za-z]{6,40}$/.test(outTradeNo)) throw new Error('充值单号格式不正确')
  let order = null
  try {
    order = firstRecord((await db.collection(HONEY_ORDER_COLLECTION).doc(outTradeNo).get()).data)
  } catch (error) {
    order = null
  }
  if (!order) return { success: false, code: 'HONEY_ORDER_NOT_FOUND', error: '没有找到该充值订单' }

  const refId = 'honey-topup:' + outTradeNo
  let ledgerRows = []
  let ledgerBalance = null
  let ledgerComplete = false
  let mirrorBalance = null
  let profileReadable = false
  try {
    // 不依赖账本是否都有 createdAt 字段：先取最近写入的 1000 条，再在内存按时间倒排
    const ledgerResult = await db.collection(HONEY_LEDGER_COLLECTION)
      .where({ serviceAccountOpenId: order.openId })
      .limit(1000)
      .get()
    ledgerRows = (ledgerResult.data || []).slice().sort((left, right) => dateValue(right.createdAt || right.time) - dateValue(left.createdAt || left.time))
    ledgerComplete = ledgerRows.length < 1000
    if (ledgerComplete && ledgerRows.every(row => Number.isSafeInteger(row.delta))) {
      ledgerBalance = ledgerRows.reduce((sum, row) => sum + row.delta, 0)
    }
  } catch (error) {
    ledgerRows = []
  }
  if (order.profileId) {
    try {
      const profile = firstRecord((await db.collection('fan_profiles').doc(String(order.profileId)).get()).data)
      if (profile && Number.isSafeInteger(profile.honeyBalance)) { mirrorBalance = profile.honeyBalance; profileReadable = true }
    } catch (error) {
      profileReadable = false
    }
  }

  const entries = ledgerRows.filter(row => String(row.refId || '') === refId).map(row => ({
    id: String(row._id || ''),
    delta: Number(row.delta),
    reason: String(row.reason || ''),
    refId: String(row.refId || ''),
    timeText: honeyTimeText(row.createdAt || row.time),
    attempt: Number(row.attempt) || 0
  }))

  return {
    success: true,
    order: safeHoneyOrder(order),
    priceSnapshot: order.priceSnapshot || null,
    ledger: {
      entries: entries,
      rows: ledgerRows.length,
      complete: ledgerComplete,
      balance: ledgerBalance,
      mirror: mirrorBalance,
      mirrorReadable: profileReadable,
      consistent: ledgerComplete && profileReadable && ledgerBalance === mirrorBalance,
      note: ledgerComplete ? '' : '该账户账本超过 1000 条，余额合计未在此页计算'
    }
  }
}

// ---- 手动加滴（仅平台负责人；只加不减，退款仍走订单冲销，不走这里） ----
// 口径与 honeyWallet 一致：fan_points_ledger 是唯一事实来源，fan_profiles.honeyBalance 只是镜像；
// 镜像必须等于账本合计，否则直接拒绝、不做任何写入。加滴 = 一条正数流水 + 镜像同额增加，同一 requestId 幂等。
const HONEY_GRANT_COLLECTION = 'honey_manual_grants'
const HONEY_GRANT_MAX_DROPS = 50000
const HONEY_LEDGER_READ_LIMIT = 1000
const HONEY_GRANT_REASON_MAX = 120

function normalizePhoneInput(value) {
  const phone = String(value || '').replace(/\D/g, '')
  return /^1[3-9]\d{9}$/.test(phone) ? phone : ''
}

async function honeyLedgerBalance(db, openId) {
  let rows = []
  try {
    const result = await db.collection(HONEY_LEDGER_COLLECTION)
      .where({ serviceAccountOpenId: openId })
      .limit(HONEY_LEDGER_READ_LIMIT)
      .get()
    rows = result.data || []
  } catch (error) {
    return { rows: 0, complete: false, valid: false, balance: null }
  }
  const complete = rows.length < HONEY_LEDGER_READ_LIMIT
  const valid = rows.every(row => Number.isSafeInteger(row.delta))
  return {
    rows: rows.length,
    complete,
    valid,
    balance: valid ? rows.reduce((sum, row) => sum + row.delta, 0) : null
  }
}

async function loadHoneyAccount(db, openId, phone) {
  let profiles = []
  try {
    const result = await db.collection('fan_profiles').where({ serviceAccountOpenId: openId }).limit(2).get()
    profiles = result.data || []
  } catch (error) {
    profiles = []
  }
  if (profiles.length > 1) return { code: 'HONEY_ACCOUNT_CONFLICT', error: '该蜂蜜账户存在重复记录，请先人工核对' }
  if (!profiles.length) return { code: 'HONEY_ACCOUNT_NOT_OPEN', error: '蜂蜜账户未开通，需用户先在服务号个人中心完成登录' }
  return { openId, profile: profiles[0], phone }
}

// 手机号 → 服务号 OpenID：优先用已核验的服务号身份，其次用登录账号关联的蜂蜜账户。
// 也支持直接按服务号 OpenID 或充值单号定位，便于从订单详情直接给该付款账户加滴。
async function resolveHoneyAccount(db, params) {
  const outTradeNo = String(params.outTradeNo || '').trim()
  if (outTradeNo) {
    if (!/^HT[0-9A-Za-z]{6,40}$/.test(outTradeNo)) return { code: 'HONEY_ORDER_NOT_FOUND', error: '充值单号格式不正确' }
    let order = null
    try {
      order = firstRecord((await db.collection(HONEY_ORDER_COLLECTION).doc(outTradeNo).get()).data)
    } catch (error) {
      order = null
    }
    if (!order) return { code: 'HONEY_ORDER_NOT_FOUND', error: '没有找到该充值订单' }
    const orderOpenId = String(order.openId || '').trim()
    if (!orderOpenId) return { code: 'HONEY_ACCOUNT_NOT_OPEN', error: '该订单没有记录付款账户，无法加滴' }
    return await loadHoneyAccount(db, orderOpenId, '')
  }
  const openIdInput = String(params.openId || '').trim()
  if (openIdInput) {
    if (!/^[0-9A-Za-z_-]{8,64}$/.test(openIdInput)) return { code: 'HONEY_OPENID_INVALID', error: '服务号 OpenID 格式不正确' }
    return await loadHoneyAccount(db, openIdInput, '')
  }
  const phone = normalizePhoneInput(params.phone)
  if (!phone) return { code: 'HONEY_PHONE_INVALID', error: '请输入正确的 11 位手机号' }
  let openId = ''
  try {
    const identityResult = await db.collection('service_identities').where({ phone, phoneVerified: true }).limit(5).get()
    const candidates = Array.from(new Set((identityResult.data || [])
      .map(row => String(row.serviceAccountOpenId || '').trim())
      .filter(Boolean)))
    if (candidates.length > 1) return { code: 'HONEY_ACCOUNT_CONFLICT', error: '该手机号关联了多个服务号微信，请先人工核对' }
    openId = candidates[0] || ''
  } catch (error) {
    openId = ''
  }
  if (!openId) {
    try {
      const userResult = await db.collection('users').where(db.command.or([{ phone }, { phoneNumber: phone }])).limit(3).get()
      const users = userResult.data || []
      if (users.length > 1) return { code: 'HONEY_ACCOUNT_CONFLICT', error: '该手机号存在重复登录账号，请先人工核对' }
      if (users.length === 1) {
        const profileResult = await db.collection('fan_profiles').where({ userId: String(users[0]._id) }).limit(2).get()
        const rows = profileResult.data || []
        if (rows.length > 1) return { code: 'HONEY_ACCOUNT_CONFLICT', error: '该账号对应多个蜂蜜账户，请先人工核对' }
        openId = String((rows[0] || {}).serviceAccountOpenId || '').trim()
      }
    } catch (error) {
      openId = ''
    }
  }
  if (!openId) return { code: 'HONEY_ACCOUNT_NOT_OPEN', error: '该手机号还没有绑定服务号微信，无法定位蜂蜜账户' }
  return await loadHoneyAccount(db, openId, phone)
}

function safeHoneyGrant(row) {
  return {
    grantId: String(row._id || ''),
    phoneMasked: String(row.phoneMasked || ''),
    openIdMasked: String(row.openIdMasked || ''),
    drops: Number(row.drops) || 0,
    reason: String(row.reason || ''),
    operatorName: String(row.operatorName || ''),
    beforeBalance: Number(row.beforeBalance) || 0,
    afterBalance: Number(row.afterBalance) || 0,
    createdText: honeyTimeText(row.createTime)
  }
}

async function readHoneyGrant(db, grantId) {
  try {
    return firstRecord((await db.collection(HONEY_GRANT_COLLECTION).doc(grantId).get()).data)
  } catch (error) {
    return null
  }
}

function honeyGrantResult(row, deduped) {
  return { success: true, deduped: Boolean(deduped), grant: safeHoneyGrant(row), balance: Number(row.afterBalance) || 0 }
}

async function honeyGrantAccount(db, user, event) {
  await requireOwner(db, user)
  const account = await resolveHoneyAccount(db, event)
  if (account.code) return { success: false, code: account.code, error: account.error }
  const ledger = await honeyLedgerBalance(db, account.openId)
  const mirror = Number(account.profile.honeyBalance)
  const mirrorValid = Number.isSafeInteger(mirror) && mirror >= 0
  const consistent = ledger.complete && ledger.valid && mirrorValid && ledger.balance === mirror
  return {
    success: true,
    account: {
      openIdMasked: maskOpenId(account.openId),
      phoneMasked: maskPhone(account.phone || ''),
      nickname: String(account.profile.nickname || ''),
      balance: ledger.complete && ledger.valid ? ledger.balance : null,
      mirror: mirrorValid ? mirror : null,
      ledgerRows: ledger.rows,
      ledgerComplete: ledger.complete,
      consistent,
      canGrant: consistent && ledger.balance >= 0,
      blockedReason: consistent ? '' : '账本合计与镜像余额不一致或账本过大，需先人工核对，暂不能加滴'
    },
    maxDrops: HONEY_GRANT_MAX_DROPS
  }
}

async function honeyGrantDrops(db, user, event) {
  await requireOwner(db, user)
  const drops = Number(event.drops)
  const reason = String(event.reason || '').trim()
  const requestId = String(event.requestId || '').trim()
  if (!Number.isSafeInteger(drops) || drops <= 0) return { success: false, code: 'HONEY_GRANT_DROPS_INVALID', error: '加滴数必须是大于 0 的整数' }
  if (drops > HONEY_GRANT_MAX_DROPS) return { success: false, code: 'HONEY_GRANT_DROPS_TOO_LARGE', error: '单次最多加 ' + HONEY_GRANT_MAX_DROPS + ' 滴，需要更多请分次并写清原因' }
  if (reason.length < 4 || reason.length > HONEY_GRANT_REASON_MAX) return { success: false, code: 'HONEY_GRANT_REASON_REQUIRED', error: '请填写 4–' + HONEY_GRANT_REASON_MAX + ' 字的加滴原因' }
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(requestId)) return { success: false, code: 'HONEY_GRANT_REQUEST_INVALID', error: '缺少本次加滴的请求编号，请刷新页面重试' }

  const account = await resolveHoneyAccount(db, event)
  if (account.code) return { success: false, code: account.code, error: account.error }

  const hash = crypto.createHash('sha1').update(requestId).digest('hex')
  const grantId = 'hg-' + hash.slice(0, 22)
  const ledgerId = 'hgm-' + hash.slice(0, 22)
  const existing = await readHoneyGrant(db, grantId)
  if (existing) return honeyGrantResult(existing, true)

  const ledger = await honeyLedgerBalance(db, account.openId)
  if (!ledger.complete) return { success: false, code: 'HONEY_LEDGER_TOO_LARGE', error: '该账户账本超过 ' + HONEY_LEDGER_READ_LIMIT + ' 条，需先人工核对后再加滴' }
  if (!ledger.valid || !Number.isSafeInteger(ledger.balance) || ledger.balance < 0) return { success: false, code: 'HONEY_LEDGER_INVALID', error: '蜂蜜账本有异常记录，请联系技术核对' }
  const mirror = Number(account.profile.honeyBalance)
  if (!Number.isSafeInteger(mirror) || mirror < 0 || mirror !== ledger.balance) {
    return { success: false, code: 'HONEY_RECONCILING', error: '账本合计与镜像余额不一致，已拒绝写入，请先人工核对' }
  }

  const profileId = String(account.profile._id)
  const operatorName = userName(user)
  const beforeBalance = ledger.balance
  try {
    await db.runTransaction(async transaction => {
      const currentResult = await transaction.collection('fan_profiles').doc(profileId).get()
      const current = firstRecord(currentResult.data)
      if (!current || String(current.serviceAccountOpenId || '') !== account.openId) {
        throw Object.assign(new Error('蜂蜜账户已变化，请重试'), { code: 'HONEY_ACCOUNT_CONFLICT' })
      }
      if (!Number.isSafeInteger(current.honeyBalance)) {
        throw Object.assign(new Error('蜂蜜余额待核对，请稍后重试'), { code: 'HONEY_RECONCILING' })
      }
      // 事务内复核：镜像必须仍等于加滴前读到的账本合计，避免与用户消费并发
      if (current.honeyBalance !== beforeBalance) {
        throw Object.assign(new Error('蜂蜜余额刚刚发生变化，请刷新后重试'), { code: 'HONEY_RECONCILING' })
      }
      const afterBalance = current.honeyBalance + drops
      await transaction.collection('fan_profiles').doc(profileId).update({
        data: { honeyBalance: afterBalance, honeyWalletUpdatedAt: db.serverDate() }
      })
      await transaction.collection(HONEY_LEDGER_COLLECTION).add({
        data: {
          _id: ledgerId,
          serviceAccountOpenId: account.openId,
          delta: drops,
          reason: 'honey-manual-grant',
          refId: 'honey-manual-grant:' + requestId,
          attempt: 1,
          grantNote: reason,
          operatorType: 'platform_owner',
          operatorId: String(user._id || ''),
          createTime: db.serverDate()
        }
      })
      await transaction.collection(HONEY_GRANT_COLLECTION).add({
        data: {
          _id: grantId,
          requestId,
          phoneMasked: maskPhone(account.phone || ''),
          openIdMasked: maskOpenId(account.openId),
          profileId,
          drops,
          reason,
          operatorId: String(user._id || ''),
          operatorName,
          beforeBalance,
          afterBalance,
          ledgerId,
          createTime: db.serverDate()
        }
      })
    })
  } catch (error) {
    // 同一 requestId 并发重复提交：以已落库记录为准，绝不重复加滴
    const duplicated = await readHoneyGrant(db, grantId)
    if (duplicated) return honeyGrantResult(duplicated, true)
    throw error
  }

  const saved = await readHoneyGrant(db, grantId)
  if (saved) return honeyGrantResult(saved, false)
  return { success: true, deduped: false, drops, balance: beforeBalance + drops }
}

async function honeyGrantList(db, user) {
  await requireOwner(db, user)
  let rows = []
  let available = true
  let note = ''
  try {
    const result = await db.collection(HONEY_GRANT_COLLECTION).orderBy('createTime', 'desc').limit(20).get()
    rows = result.data || []
  } catch (error) {
    available = false
    note = '还没有手动加滴记录（honey_manual_grants 集合为空或尚未创建）'
  }
  return { success: true, available, note, rows: rows.map(safeHoneyGrant) }
}

// ============ 个人会员（平台运营中心：档位配置、订单查询、会员列表） ============
// 与蜂蜜充值的分工：
//   - 档位是唯一可写区，写 platform_membership_plans(_id='plans')，库内配置优先于
//     webLoginApi 的环境变量与代码默认表（口径见 membershipPlans.cjs，与会员模块同源）。
//   - 订单与订阅只读：不在这里改状态、不发滴、不退款（退款规则未确认，不提供按钮）。
//   - 赠滴发放的唯一入口仍是支付回调/主动查单（webLoginApi/membership.cjs 的 grantOrder），
//     平台页只做账本一致性核对，绝不复制发滴算法。
const MEMBER_ORDER_COLLECTION = 'membership_orders'
const MEMBER_SUB_COLLECTION = 'member_subscriptions'
const MEMBER_LEDGER_COLLECTION = 'fan_points_ledger'
const MEMBER_ORDER_SCAN_LIMIT = 1000
const MEMBER_SUB_SCAN_LIMIT = 1000
const MEMBER_ORDER_PAGE_SIZES = [10, 20, 50]
const MEMBERSHIP_OVERVIEW_DAYS = [1, 7, 30, 90]
const MEMBER_ORDER_STATUS_LABEL = { pending: '待支付', paid: '已支付', closed: '已关闭', refunded: '已退款' }
const MEMBER_LEDGER_STATE_LABEL = { pending: '未发放', granted: '已发放', blocked: '发放受阻' }
const MEMBER_PRICE_TIER_LABEL = { first: '首月价', renew: '续费价', yearly: '年付价' }

function memberLevelName(levelCode) {
  const plan = (membershipPlans.CONFIRMED_PLANS || []).find(item => item.code === levelCode)
  return plan ? plan.name : ''
}

function safeMemberOrder(row) {
  const status = String(row.status || 'pending')
  const ledgerState = String(row.ledgerState || 'pending')
  const priceCents = Number(row.priceCents) || 0
  let statusLabel = MEMBER_ORDER_STATUS_LABEL[status] || '状态待确认'
  if (status === 'paid' && ledgerState === 'blocked') statusLabel = '已支付·待发放'
  return {
    outTradeNo: String(row.outTradeNo || row._id || ''),
    userId: String(row.userId || ''),
    openIdMasked: maskOpenId(row.openId),
    planCode: String(row.planCode || ''),
    planName: String(row.planName || memberLevelName(String(row.planCode || '')) || ''),
    months: Number(row.months) || 1,
    priceCents: priceCents,
    priceYuan: honeyYuan(priceCents),
    priceTier: String(row.priceTier || ''),
    priceTierLabel: MEMBER_PRICE_TIER_LABEL[String(row.priceTier || '')] || '',
    grantDrops: Number(row.grantDrops) || 0,
    portraitDiscount: Number(row.portraitDiscount) || 1,
    status: status,
    statusLabel: statusLabel,
    ledgerState: ledgerState,
    ledgerLabel: MEMBER_LEDGER_STATE_LABEL[ledgerState] || '状态待确认',
    ledgerError: String(row.ledgerError || ''),
    transactionId: String(row.transactionId || ''),
    clientPlatform: String(row.clientPlatform || ''),
    notifyCount: Number(row.notifyCount) || 0,
    createdAt: dateValue(row.createdAt),
    createdText: honeyTimeText(row.createdAt),
    paidText: honeyTimeText(row.paidAt),
    closedText: honeyTimeText(row.closedAt)
  }
}

function safeMemberSubscription(row, planMap, now) {
  const levelCode = String(row.levelCode || '')
  const plan = planMap[levelCode] || null
  const expiresAt = dateValue(row.expiresAt)
  const declared = String(row.status || '')
  const active = declared === 'active' && expiresAt > now
  const daysLeft = active ? Math.max(0, Math.ceil((expiresAt - now) / 86400000)) : 0
  return {
    openIdMasked: maskOpenId(row.openId),
    userId: String(row.userId || ''),
    profileId: String(row.profileId || ''),
    levelCode: levelCode,
    levelName: plan ? plan.name : memberLevelName(levelCode),
    status: active ? 'active' : 'expired',
    statusLabel: active ? '生效中' : '已过期',
    startedAt: dateValue(row.startedAt),
    startedText: honeyTimeText(row.startedAt),
    expiresAt: expiresAt,
    expiresText: honeyTimeText(row.expiresAt),
    daysLeft: daysLeft,
    expiresSoon: active && daysLeft <= 7,
    firstMonthUsed: row.firstMonthUsed === true,
    autoRenew: false,
    lastOrderId: String(row.lastOrderId || ''),
    lastPriceTier: String(row.lastPriceTier || ''),
    updatedText: honeyTimeText(row.updatedAt || row.createTime)
  }
}

// 读取最近会员订单/订阅；集合缺失或为空时如实说明，不用 0 冒充「已统计」
async function readMemberOrders(db) {
  const size = MEMBER_ORDER_SCAN_LIMIT
  try {
    const result = await db.collection(MEMBER_ORDER_COLLECTION).orderBy('createdAt', 'desc').limit(size).get()
    const rows = result.data || []
    return { rows: rows, available: true, note: '', truncated: rows.length >= size, limit: size }
  } catch (error) {
    const message = String((error && (error.message || error)) || '')
    if (/not exist|not found|不存在|DATABASE_COLLECTION_NOT_EXIST/i.test(message)) {
      return { rows: [], available: false, note: '还没有会员订单（membership_orders 集合为空或尚未创建）', truncated: false, limit: size }
    }
    throw new Error('读取会员订单失败：' + message)
  }
}

async function readMemberSubscriptions(db) {
  const size = MEMBER_SUB_SCAN_LIMIT
  try {
    // member_subscriptions 的 _id 就是服务号 OpenID，按 _id 读取足够，不依赖额外索引排序
    const result = await db.collection(MEMBER_SUB_COLLECTION).limit(size).get()
    const rows = result.data || []
    return { rows: rows, available: true, note: rows.length ? '' : '还没有会员订阅（member_subscriptions 集合为空）', truncated: rows.length >= size, limit: size }
  } catch (error) {
    const message = String((error && (error.message || error)) || '')
    if (/not exist|not found|不存在|DATABASE_COLLECTION_NOT_EXIST/i.test(message)) {
      return { rows: [], available: false, note: '还没有会员订阅（member_subscriptions 集合为空或尚未创建）', truncated: false, limit: size }
    }
    throw new Error('读取会员订阅失败：' + message)
  }
}

async function membershipPlanGet(db, user) {
  await requireOwner(db, user)
  const state = await membershipPlans.readPlanState(db)
  const fallback = membershipPlans.defaults()
  const fallbackMap = {}
  fallback.plans.forEach(plan => { fallbackMap[plan.code] = plan })
  const defaultMap = {}
  membershipPlans.CONFIRMED_PLANS.forEach(plan => { defaultMap[plan.code] = plan })
  return {
    success: true,
    source: state.source,
    sourceLabel: state.source === 'db' ? '库内已保存配置' : '代码内置的 2026-10-27 已确认表',
    ready: state.ready,
    reason: state.reason,
    reasonText: state.reason === 'MEMBERSHIP_PLAN_INVALID' ? '库内档位配置不合法，会员已暂时停止售卖，需修正后重新保存' : '',
    version: state.version,
    updatedText: honeyTimeText(state.updatedAt),
    updatedByName: state.updatedByName,
    plans: state.plans.map(plan => Object.assign(membershipPlans.planView(plan), {
      changedFromDefault: Boolean(fallbackMap[plan.code]) && (
        fallbackMap[plan.code].firstPriceCents !== (defaultMap[plan.code] || {}).firstPriceCents ||
        fallbackMap[plan.code].renewPriceCents !== (defaultMap[plan.code] || {}).renewPriceCents ||
        fallbackMap[plan.code].grantDrops !== (defaultMap[plan.code] || {}).grantDrops
      )
    })),
    defaults: fallback.plans.map(membershipPlans.planView),
    history: state.history.slice(-5).reverse().map(item => ({
      version: Number(item.version) || 0,
      atText: honeyTimeText(item.at),
      operatorName: String(item.operatorName || ''),
      summary: String(item.summary || '')
    })),
    note: state.source === 'db'
      ? '库内配置优先于 webLoginApi 的环境变量与代码默认表，保存后立即对新会员生效（已购会员按购买时的快照结算）。'
      : '当前还没有库内档位配置：webLoginApi 会先读它自己的环境变量 MEMBERSHIP_PLANS，读不到才用这张默认表。要让平台与用户端一致，请点「保存档位」写入库内配置。'
  }
}

async function membershipPlanSave(db, user, event) {
  await requireOwner(db, user)
  const parsed = membershipPlans.parsePlans(event.plans)
  if (!parsed.ready) {
    return {
      success: false,
      code: parsed.reason || 'MEMBERSHIP_PLAN_INVALID',
      error: parsed.reason === 'MEMBERSHIP_PLAN_NOT_CONFIGURED'
        ? '缺少档位配置：四档（basic/plus/pro/family）必须齐全'
        : '档位配置不合法：四档必须齐全，首月价与续费价为正整数且首月价不高于续费价，赠滴为正整数，定妆照折扣在 5–10 折之间，年付价约为续费价的 10 个月'
    }
  }
  const wantedVersion = Number(event.version)
  if (!Number.isSafeInteger(wantedVersion) || wantedVersion < 0) {
    return { success: false, code: 'MEMBERSHIP_VERSION_REQUIRED', error: '缺少档位版本号，请刷新页面后重新保存' }
  }

  const current = await membershipPlans.readPlanState(db)
  const warnings = membershipPlans.buildWarnings(parsed.plans, current.plans)
  const nextVersion = wantedVersion + 1
  const operatorName = userName(user)
  const entry = membershipPlans.historyEntry(nextVersion, operatorName, String(user._id || ''), warnings)

  try {
    await db.runTransaction(async transaction => {
      let latest = null
      try {
        const reply = await transaction.collection(membershipPlans.PLAN_COLLECTION).doc(membershipPlans.PLAN_DOC_ID).get()
        latest = firstRecord(reply && reply.data)
      } catch (error) {
        latest = null
      }
      const latestVersion = latest && Number.isSafeInteger(Number(latest.version)) ? Number(latest.version) : 0
      if (latestVersion !== wantedVersion) {
        throw Object.assign(new Error('档位已被其他管理员修改，请刷新页面后重新保存'), { code: 'MEMBERSHIP_PLAN_CONFLICT' })
      }
      const history = ((latest && Array.isArray(latest.history) ? latest.history : []).concat([entry]))
        .slice(-membershipPlans.HISTORY_LIMIT)
      await transaction.collection(membershipPlans.PLAN_COLLECTION).doc(membershipPlans.PLAN_DOC_ID).set({
        data: {
          plans: parsed.plans,
          version: nextVersion,
          updatedAt: new Date(),
          updatedBy: String(user._id || ''),
          updatedByName: operatorName,
          history: history,
          note: '个人会员档位以此为准，优先于 webLoginApi 环境变量 MEMBERSHIP_PLANS；年付一期未开放'
        }
      })
    })
  } catch (error) {
    if (String(error.code || '') === 'MEMBERSHIP_PLAN_CONFLICT') {
      return { success: false, code: 'MEMBERSHIP_PLAN_CONFLICT', error: error.message }
    }
    console.error('[platformOwner] 会员档位保存失败:', error)
    return { success: false, code: 'MEMBERSHIP_PLAN_SAVE_FAILED', error: '会员档位保存失败：' + String((error && error.message) || error) }
  }

  const latest = await membershipPlans.readPlanState(db)
  return {
    success: true,
    version: latest.version,
    source: latest.source,
    plans: latest.plans.map(membershipPlans.planView),
    warnings: warnings,
    updatedText: honeyTimeText(latest.updatedAt),
    updatedByName: latest.updatedByName
  }
}

async function membershipOverview(db, user, event) {
  await requireOwner(db, user)
  const wanted = Number(event && event.days)
  const days = MEMBERSHIP_OVERVIEW_DAYS.indexOf(wanted) >= 0 ? wanted : 7
  const todayKey = usageDayKey(Date.now())
  const sinceKey = usageDayKey(Date.now() - (days - 1) * 24 * 60 * 60 * 1000)
  const read = await readMemberOrders(db)
  const state = await membershipPlans.readPlanState(db)
  const planMap = {}
  state.plans.forEach(plan => { planMap[plan.code] = plan })
  membershipPlans.CONFIRMED_PLANS.forEach(plan => { if (!planMap[plan.code]) planMap[plan.code] = plan })

  const dayKeys = []
  for (let index = days - 1; index >= 0; index -= 1) dayKeys.push(usageDayKey(Date.now() - index * 24 * 60 * 60 * 1000))
  const dayMap = {}
  dayKeys.forEach(key => { dayMap[key] = { day: key, paidCount: 0, grossCents: 0 } })
  const planTotals = {}
  const totals = { created: 0, paid: 0, pending: 0, closed: 0, refunded: 0, blocked: 0, grossCents: 0, grantDrops: 0, firstTier: 0, renewTier: 0 }

  read.rows.forEach(row => {
    const day = usageDayKey(dateValue(row.createdAt) || Date.now())
    if (day < sinceKey) return
    const status = String(row.status || 'pending')
    const ledgerState = String(row.ledgerState || 'pending')
    const priceCents = Number(row.priceCents) || 0
    const code = String(row.planCode || '')
    totals.created += 1
    if (status === 'pending') totals.pending += 1
    if (status === 'closed') totals.closed += 1
    if (String(row.priceTier || '') === 'first' && (status === 'paid' || status === 'refunded')) totals.firstTier += 1
    if (String(row.priceTier || '') === 'renew' && (status === 'paid' || status === 'refunded')) totals.renewTier += 1
    if (status === 'paid' || status === 'refunded') { totals.paid += 1; totals.grossCents += priceCents }
    if (status === 'refunded') totals.refunded += 1
    if (ledgerState === 'blocked') totals.blocked += 1
    if (ledgerState === 'granted' && status !== 'refunded') totals.grantDrops += Number(row.grantDrops) || 0
    if (dayMap[day] && (status === 'paid' || status === 'refunded')) { dayMap[day].paidCount += 1; dayMap[day].grossCents += priceCents }
    if (!planTotals[code]) planTotals[code] = { planCode: code, planName: String(row.planName || memberLevelName(code) || code), orders: 0, paid: 0, grossCents: 0 }
    planTotals[code].orders += 1
    if (status === 'paid' || status === 'refunded') { planTotals[code].paid += 1; planTotals[code].grossCents += priceCents }
  })

  const subs = await readMemberSubscriptions(db)
  const now = Date.now()
  const subTotals = { active: 0, expiringSoon: 0, expired: 0, total: subs.rows.length }
  const levelCounts = {}
  subs.rows.forEach(row => {
    const view = safeMemberSubscription(row, planMap, now)
    if (view.status === 'active') {
      subTotals.active += 1
      if (view.expiresSoon) subTotals.expiringSoon += 1
      levelCounts[view.levelCode] = (levelCounts[view.levelCode] || 0) + 1
    } else {
      subTotals.expired += 1
    }
  })

  const settled = totals.paid + totals.closed
  return {
    success: true,
    days: days,
    sinceDay: sinceKey,
    todayDay: todayKey,
    available: read.available,
    note: read.note,
    scanned: read.rows.length,
    limit: read.limit,
    truncated: read.truncated,
    truncatedNote: read.truncated ? `只统计最近 ${read.limit} 条会员订单，更早的订单未计入` : '',
    totals: {
      created: totals.created,
      paid: totals.paid,
      pending: totals.pending,
      closed: totals.closed,
      refunded: totals.refunded,
      blocked: totals.blocked,
      grossCents: totals.grossCents,
      grossYuan: honeyYuan(totals.grossCents),
      grantDrops: totals.grantDrops,
      firstTier: totals.firstTier,
      renewTier: totals.renewTier,
      successRate: settled ? Math.round(totals.paid / settled * 100) : 0
    },
    subscription: {
      available: subs.available,
      note: subs.note,
      truncated: subs.truncated,
      active: subTotals.active,
      expiringSoon: subTotals.expiringSoon,
      expired: subTotals.expired,
      total: subTotals.total,
      byLevel: membershipPlans.LEVEL_CODES
        .map(code => ({ levelCode: code, levelName: planMap[code] ? planMap[code].name : memberLevelName(code), count: levelCounts[code] || 0 }))
        .filter(item => item.count > 0)
    },
    byDay: dayKeys.map(key => ({
      day: key,
      paidCount: dayMap[key].paidCount,
      grossCents: dayMap[key].grossCents,
      grossYuan: honeyYuan(dayMap[key].grossCents)
    })),
    byPlan: Object.keys(planTotals).map(key => Object.assign({}, planTotals[key], { grossYuan: honeyYuan(planTotals[key].grossCents) }))
      .sort((left, right) => membershipPlans.LEVEL_CODES.indexOf(left.planCode) - membershipPlans.LEVEL_CODES.indexOf(right.planCode))
  }
}

async function membershipOrderList(db, user, event) {
  await requireOwner(db, user)
  const status = ['all', 'pending', 'paid', 'closed', 'refunded'].indexOf(String(event.status || 'all')) >= 0 ? String(event.status || 'all') : 'all'
  const ledgerState = ['all', 'pending', 'granted', 'blocked'].indexOf(String(event.ledgerState || 'all')) >= 0 ? String(event.ledgerState || 'all') : 'all'
  const planCode = ['all'].concat(membershipPlans.LEVEL_CODES).indexOf(String(event.planCode || 'all')) >= 0 ? String(event.planCode || 'all') : 'all'
  const keyword = String(event.keyword || '').trim().toLowerCase()
  const wantedSize = Number(event.pageSize)
  const pageSize = MEMBER_ORDER_PAGE_SIZES.indexOf(wantedSize) >= 0 ? wantedSize : 20
  const page = Math.max(Number(event.page) || 1, 1)
  const read = await readMemberOrders(db)

  let rows = read.rows
  if (status !== 'all') rows = rows.filter(row => String(row.status || 'pending') === status)
  if (ledgerState !== 'all') rows = rows.filter(row => String(row.ledgerState || 'pending') === ledgerState)
  if (planCode !== 'all') rows = rows.filter(row => String(row.planCode || '') === planCode)
  if (keyword) {
    rows = rows.filter(row => [row.outTradeNo, row._id, row.transactionId, row.userId, row.openId, row.planName]
      .some(value => String(value || '').toLowerCase().indexOf(keyword) >= 0))
  }
  const total = rows.length
  const pageCount = Math.max(Math.ceil(total / pageSize), 1)
  const current = Math.min(page, pageCount)
  const slice = rows.slice((current - 1) * pageSize, current * pageSize)
  return {
    success: true,
    rows: slice.map(safeMemberOrder),
    total: total,
    page: current,
    pageSize: pageSize,
    pageCount: pageCount,
    scanned: read.rows.length,
    limit: read.limit,
    truncated: read.truncated,
    truncatedNote: read.truncated ? `只检索最近 ${read.limit} 条会员订单，更早的订单未参与筛选` : '',
    available: read.available,
    note: read.note
  }
}

async function membershipOrderDetail(db, user, event) {
  await requireOwner(db, user)
  const outTradeNo = String(event.outTradeNo || '').trim()
  if (!/^MT[0-9A-Za-z_-]{4,40}$/.test(outTradeNo)) throw new Error('会员单号格式不正确')
  let order = null
  try {
    order = firstRecord((await db.collection(MEMBER_ORDER_COLLECTION).doc(outTradeNo).get()).data)
  } catch (error) {
    order = null
  }
  if (!order) return { success: false, code: 'MEMBERSHIP_ORDER_NOT_FOUND', error: '没有找到该会员订单' }

  const refId = 'membership:' + String(order.planCode || '') + ':' + outTradeNo
  let ledgerRows = []
  let ledgerBalance = null
  let ledgerComplete = false
  let mirrorBalance = null
  let profileReadable = false
  try {
    const ledgerResult = await db.collection(MEMBER_LEDGER_COLLECTION)
      .where({ serviceAccountOpenId: order.openId })
      .limit(1000)
      .get()
    ledgerRows = (ledgerResult.data || []).slice().sort((left, right) => dateValue(right.createdAt || right.time) - dateValue(left.createdAt || left.time))
    ledgerComplete = ledgerRows.length < 1000
    if (ledgerComplete && ledgerRows.every(row => Number.isSafeInteger(row.delta))) {
      ledgerBalance = ledgerRows.reduce((sum, row) => sum + row.delta, 0)
    }
  } catch (error) {
    ledgerRows = []
  }
  if (order.profileId) {
    try {
      const profile = firstRecord((await db.collection('fan_profiles').doc(String(order.profileId)).get()).data)
      if (profile && Number.isSafeInteger(profile.honeyBalance)) { mirrorBalance = profile.honeyBalance; profileReadable = true }
    } catch (error) {
      profileReadable = false
    }
  }

  const entries = ledgerRows.filter(row => String(row.refId || '') === refId).map(row => ({
    id: String(row._id || ''),
    delta: Number(row.delta),
    reason: String(row.reason || ''),
    refId: String(row.refId || ''),
    timeText: honeyTimeText(row.createdAt || row.time),
    attempt: Number(row.attempt) || 0
  }))

  let subscription = null
  if (order.openId) {
    try {
      const sub = firstRecord((await db.collection(MEMBER_SUB_COLLECTION).doc(String(order.openId)).get()).data)
      if (sub) {
        const state = await membershipPlans.readPlanState(db)
        const planMap = {}
        state.plans.forEach(plan => { planMap[plan.code] = plan })
        subscription = safeMemberSubscription(sub, planMap, Date.now())
      }
    } catch (error) {
      subscription = null
    }
  }

  return {
    success: true,
    order: safeMemberOrder(order),
    priceSnapshot: order.priceSnapshot || null,
    subscription: subscription,
    ledger: {
      refId: refId,
      entries: entries,
      rows: ledgerRows.length,
      complete: ledgerComplete,
      balance: ledgerBalance,
      mirror: mirrorBalance,
      mirrorReadable: profileReadable,
      consistent: ledgerComplete && profileReadable && ledgerBalance === mirrorBalance,
      note: ledgerComplete ? '' : '该账户账本超过 1000 条，余额合计未在此页计算'
    }
  }
}

async function membershipSubscriptionList(db, user, event) {
  await requireOwner(db, user)
  const status = ['all', 'active', 'expired'].indexOf(String(event.status || 'all')) >= 0 ? String(event.status || 'all') : 'all'
  const levelCode = ['all'].concat(membershipPlans.LEVEL_CODES).indexOf(String(event.levelCode || 'all')) >= 0 ? String(event.levelCode || 'all') : 'all'
  const keyword = String(event.keyword || '').trim().toLowerCase()
  const wantedSize = Number(event.pageSize)
  const pageSize = MEMBER_ORDER_PAGE_SIZES.indexOf(wantedSize) >= 0 ? wantedSize : 20
  const page = Math.max(Number(event.page) || 1, 1)

  const state = await membershipPlans.readPlanState(db)
  const planMap = {}
  state.plans.forEach(plan => { planMap[plan.code] = plan })
  const read = await readMemberSubscriptions(db)
  const now = Date.now()

  let rows = read.rows.map(row => safeMemberSubscription(row, planMap, now))
  if (status !== 'all') rows = rows.filter(row => row.status === status)
  if (levelCode !== 'all') rows = rows.filter(row => row.levelCode === levelCode)
  if (keyword) {
    rows = rows.filter(row => [row.userId, row.lastOrderId, row.levelName]
      .some(value => String(value || '').toLowerCase().indexOf(keyword) >= 0))
  }
  // 生效中的排前面，其中越快到期越靠前；已过期的按到期时间倒序垫底
  rows.sort((left, right) => {
    if (left.status !== right.status) return left.status === 'active' ? -1 : 1
    return left.status === 'active' ? left.expiresAt - right.expiresAt : right.expiresAt - left.expiresAt
  })
  const total = rows.length
  const pageCount = Math.max(Math.ceil(total / pageSize), 1)
  const current = Math.min(page, pageCount)
  return {
    success: true,
    rows: rows.slice((current - 1) * pageSize, current * pageSize),
    total: total,
    page: current,
    pageSize: pageSize,
    pageCount: pageCount,
    scanned: read.rows.length,
    limit: read.limit,
    truncated: read.truncated,
    truncatedNote: read.truncated ? `只读取最近 ${read.limit} 条会员订阅，更早的记录未参与筛选` : '',
    available: read.available,
    note: read.note
  }
}

exports.main = async event => {
  const db = cloud.database()
  try {
    const params = event || {}
    const user = await resolveCurrentUser(db, params)
    const action = params.action || 'status'
    if (action === 'status') return await getStatus(db, user)
    if (action === 'createRequest') return await createRequest(db, user, params)
    if (action === 'listRequests') return await listRequests(db, user)
    if (action === 'previewCode') return await previewCode(db, user, params)
    if (action === 'acceptCode') return await acceptCode(db, user, params)
    if (action === 'rejectCode') return await rejectCode(db, user, params)
    if (action === 'listMyGrants') return await listMyGrants(db, user)
    if (action === 'revokeMyGrant') return await revokeMyGrant(db, user, params)
    if (action === 'revokeRequest') return await revokeRequest(db, user, params)
    if (action === 'overview') return await getOverview(db, user, params)
    if (action === 'authorizationRevocationProcess') return await revocationProcess(db, user, params)
    if (action === 'authorizationRevocationHistory') return await revocationHistory(db, user, params)
    if (action === 'getAiPortraitModels') return await getAiPortraitModels(db, user, params)
    if (action === 'saveAiPortraitModels') return await saveAiPortraitModels(db, user, params)
    if (action === 'createAiPortraitToolSession') {
      await requireOwner(db, user)
      const crypto = require('crypto')
      const ticket = crypto.randomBytes(32).toString('hex')
      const id = crypto.createHash('sha256').update(ticket).digest('hex')
      await db.collection('auth_sessions').doc('portrait_tool_' + id).set({ data: {
        principalType: 'portrait_tool',
        scope: 'platform-portrait-tool', active: true, operatorId: String(user._id || 'platform-owner'),
        expiresAt: Date.now() + 15 * 60000, createdAt: db.serverDate()
      } })
      return { success: true, ticket, expiresIn: 900 }
    }
    if (action === 'getAiPortraitUsage') return await getAiPortraitUsage(db, user, params)
    if (action === 'honeyOrdersOverview') return await honeyOrdersOverview(db, user, params)
    if (action === 'honeyOrderList') return await honeyOrderList(db, user, params)
    if (action === 'honeyOrderDetail') return await honeyOrderDetail(db, user, params)
    if (action === 'honeyGrantAccount') return await honeyGrantAccount(db, user, params)
    if (action === 'honeyGrantDrops') return await honeyGrantDrops(db, user, params)
    if (action === 'honeyGrantList') return await honeyGrantList(db, user, params)
    if (action === 'membershipPlanGet') return await membershipPlanGet(db, user, params)
    if (action === 'membershipPlanSave') return await membershipPlanSave(db, user, params)
    if (action === 'membershipOverview') return await membershipOverview(db, user, params)
    if (action === 'membershipOrderList') return await membershipOrderList(db, user, params)
    if (action === 'membershipOrderDetail') return await membershipOrderDetail(db, user, params)
    if (action === 'membershipSubscriptionList') return await membershipSubscriptionList(db, user, params)
    if (action === 'insuranceOverview') {
      await requireOwner(db, user)
      return await insuranceOps.overview(db, params)
    }
    if (action === 'insuranceSubmissionList') {
      await requireOwner(db, user)
      return await insuranceOps.submissionList(db, params)
    }
    if (action === 'insurancePurchaseLinkGet') {
      await requireOwner(db, user)
      const link = await insuranceOps.readPurchaseLink(db)
      return Object.assign({ success: true }, link)
    }
    if (action === 'insurancePurchaseLinkSave') {
      await requireOwner(db, user)
      return await insuranceOps.savePurchaseLink(db, user, params)
    }
    return { success: false, error: '不支持的操作: ' + action }
  } catch (err) {
    console.error('[platformOwner] error:', err)
    return Object.assign({ success: false, error: err.message || '隐藏协助服务异常' }, err && err.code ? { code: err.code } : {})
  }
}
