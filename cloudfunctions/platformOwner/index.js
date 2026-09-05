const cloud = require('wx-server-sdk')
const crypto = require('crypto')

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
    return { success: false, error: '不支持的操作: ' + action }
  } catch (err) {
    console.error('[platformOwner] error:', err)
    return { success: false, error: err.message || '隐藏协助服务异常' }
  }
}
