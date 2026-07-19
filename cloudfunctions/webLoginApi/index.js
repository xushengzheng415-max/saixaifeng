// webLoginApi - 赛小蜂网页端登录 API（HTTP 触发器代理）
// 浏览器通过 fetch() 直接调用，无需任何 SDK
//
// 支持的操作（action 参数）：
//   sendSms        - 发送短信验证码
//   verifySmsCode  - 验证短信验证码并登录
//   passwordLogin  - 手机号+密码登录
//   emailSendCode  - 发送邮箱验证码
//   emailVerifyCode- 验证邮箱验证码并登录
//   wechatWebLogin - 微信扫码登录
//   checkLogin     - 检查登录状态

const cloud = require('wx-server-sdk')
const https = require('https')
const crypto = require('crypto')
const nodemailer = require('nodemailer')

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })

// ========== 邮件配置 ==========
const EMAIL_CONFIG = {
  host: 'smtp.yeah.net',
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  },
  fromName: '赛小蜂足球'
}

// 发送邮件（返回 { success, sent }）
async function sendEmail(to, subject, html) {
  if (!EMAIL_CONFIG.auth.user || !EMAIL_CONFIG.auth.pass) {
    console.log('[webLoginApi] 【开发模式】邮件未发送（SMTP 未配置）：', to, subject)
    return { success: true, sent: false }
  }
  try {
    const transporter = nodemailer.createTransport({
      host: EMAIL_CONFIG.host,
      port: EMAIL_CONFIG.port,
      secure: EMAIL_CONFIG.secure,
      auth: EMAIL_CONFIG.auth
    })
    await transporter.sendMail({
      from: `"${EMAIL_CONFIG.fromName}" <${EMAIL_CONFIG.auth.user}>`,
      to,
      subject,
      html
    })
    console.log('[webLoginApi] 邮件发送成功：', to)
    return { success: true, sent: true }
  } catch (e) {
    console.error('[webLoginApi] 邮件发送失败：', e.message || e)
    return { success: false, error: '邮件发送失败：' + (e.message || 'SMTP 连接异常') }
  }
}

// ========== SMS 配置 ==========
const SMS_CONFIG = {
  SecretId: process.env.SMS_SECRET_ID || '',
  SecretKey: process.env.SMS_SECRET_KEY || '',
  SmsSdkAppId: String(process.env.SMS_SDK_APP_ID || ''),
  TemplateId: String(2657871),
  SignName: '河南麦步体育',
  Region: 'ap-beijing',
}

// ========== 微信配置 ==========
const WECHAT_CONFIG = {
  APP_ID: process.env.WECHAT_WEB_APPID || '',
  APP_SECRET: process.env.WECHAT_WEB_APPSECRET || '',
}

const WEB_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const ASSISTANCE_COLLECTIONS = new Set([
  'teams', 'players', 'player_library', 'coaches',
  'tournaments', 'matches', 'tournament_teams', 'rosters', 'roster_change_requests'
])

// 普通主办方工作台只允许访问明确列出的机构私有业务集合。
// orgId 是租户边界；creatorId 只记录具体创建人，不能代替租户边界。
const ORGANIZER_PRIVATE_COLLECTIONS = new Set([
  'tournaments', 'teams', 'players', 'coaches', 'management',
  'player_library', 'coach_library', 'referees', 'referee_invitations',
  'matches', 'match_events', 'match_referees', 'tournament_referees',
  'tournament_teams', 'tournament_groups', 'tournament_bracket',
  'tournament_league_tables', 'rosters', 'roster_change_requests',
  'squads', 'standings', 'schedule_info', 'team_tasks'
])

const ORGANIZER_SCOPED_RELAY_FUNCTIONS = new Set([
  'generateSchedule', 'updateMatch'
])

const ORGANIZER_IMMUTABLE_OWNERSHIP_FIELDS = new Set([
  'orgId', 'creatorId', 'organizerId', 'ownerId', 'userId', 'createdBy',
  'owner', 'creator'
])

function dateValue(value) {
  if (!value) return 0
  const raw = value && typeof value === 'object' && value.$date ? value.$date : value
  const time = new Date(raw).getTime()
  return Number.isFinite(time) ? time : 0
}

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex')
}

async function createWebSession(userId) {
  const db = cloud.database()
  const userResult = await db.collection('users').doc(userId).get()
  const rawUser = Array.isArray(userResult.data) ? userResult.data[0] : userResult.data
  if (!rawUser) throw new Error('登录账号不存在')
  await ensureUserOrgId(db, rawUser)
  const token = crypto.randomBytes(32).toString('hex')
  await db.collection('auth_sessions').add({
    data: {
      tokenHash: hashSessionToken(token),
      userId,
      active: true,
      channel: 'wechat_web',
      expiresAt: new Date(Date.now() + WEB_SESSION_TTL_MS),
      createTime: db.serverDate(),
      lastUsedAt: db.serverDate()
    }
  })
  return token
}

async function authenticateWebSession(event) {
  const token = String((event && event.authToken) || '').trim()
  if (!token) return { success: false, error: '登录会话已失效，请重新微信扫码登录', code: 'AUTH_REQUIRED' }
  const db = cloud.database()
  const _ = db.command
  const sessionResult = await db.collection('auth_sessions').where({
    tokenHash: hashSessionToken(token),
    active: true,
    expiresAt: _.gt(new Date())
  }).limit(2).get()
  const sessions = sessionResult.data || []
  if (sessions.length !== 1) return { success: false, error: '登录会话已失效，请重新微信扫码登录', code: 'AUTH_REQUIRED' }
  const session = sessions[0]
  const userResult = await db.collection('users').doc(session.userId).get()
  const rawUser = Array.isArray(userResult.data) ? userResult.data[0] : userResult.data
  if (!rawUser) return { success: false, error: '登录账号不存在，请重新登录', code: 'AUTH_REQUIRED' }
  const user = await ensureUserOrgId(db, rawUser)
  db.collection('auth_sessions').doc(session._id).update({ data: { lastUsedAt: db.serverDate() } }).catch(() => {})
  return { success: true, session, user, userId: user._id, orgId: user.orgId }
}

async function ensureUserOrgId(db, user) {
  if (!user || !user._id) throw new Error('账号归属信息不完整')
  const orgId = String(user.orgId || user._id)
  if (user.orgId !== orgId) {
    await db.collection('users').doc(user._id).update({
      data: { orgId, updateTime: db.serverDate() }
    })
  }
  return { ...user, orgId }
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

function recordHasOrg(record, orgId) {
  return Boolean(record && orgId && String(record.orgId || '') === String(orgId))
}

function recordTeamKeys(record) {
  return [record && record.teamId, record && record.teamCode]
    .concat(record && Array.isArray(record.teamIds) ? record.teamIds : [])
    .concat(record && Array.isArray(record.teamCodes) ? record.teamCodes : [])
    .filter(Boolean)
}

async function buildOrganizerScope(db, rawUser) {
  const user = await ensureUserOrgId(db, rawUser)
  const [teamResult, tournamentResult] = await Promise.all([
    db.collection('teams').limit(1000).get(),
    db.collection('tournaments').limit(1000).get()
  ])

  const teams = (teamResult.data || []).filter(team => recordHasOrg(team, user.orgId) || recordBelongsToUser(
    team,
    user,
    ['creatorId', 'ownerId', 'userId', 'createdBy', 'creator'],
    ['ownerPhone', 'creatorPhone', 'contactPhone', 'phoneNumber', 'phone', 'mobile']
  ))
  const tournaments = (tournamentResult.data || []).filter(tournament => recordHasOrg(tournament, user.orgId) || recordBelongsToUser(
    tournament,
    user,
    ['creatorId', 'organizerId', 'ownerId', 'userId', 'createdBy', 'creator'],
    ['creatorPhone', 'organizerPhone', 'ownerPhone', 'contactPhone', 'phoneNumber', 'phone']
  ))

  const scope = {
    user,
    orgId: user.orgId,
    teamIds: new Set(teams.map(item => item._id).filter(Boolean)),
    teamCodes: new Set(teams.flatMap(item => [item.teamCode, item.code]).filter(Boolean)),
    tournamentIds: new Set(tournaments.map(item => item._id).filter(Boolean)),
    matchIds: new Set()
  }

  const matchResult = await db.collection('matches').limit(1000).get()
  ;(matchResult.data || []).forEach(match => {
    if (recordHasOrg(match, scope.orgId) || scope.tournamentIds.has(match.tournamentId) ||
        scope.teamIds.has(match.homeTeamId) || scope.teamIds.has(match.awayTeamId)) {
      if (match._id) scope.matchIds.add(match._id)
    }
  })
  return scope
}

function organizerRecordAllowed(collection, record, scope) {
  if (!record || !scope) return false
  if (recordHasOrg(record, scope.orgId)) return true

  if (collection === 'teams') {
    return scope.teamIds.has(record._id) || recordBelongsToUser(
      record, scope.user,
      ['creatorId', 'ownerId', 'userId', 'createdBy', 'creator'],
      ['ownerPhone', 'creatorPhone', 'contactPhone', 'phoneNumber', 'phone', 'mobile']
    )
  }
  if (collection === 'tournaments') {
    return scope.tournamentIds.has(record._id) || recordBelongsToUser(
      record, scope.user,
      ['creatorId', 'organizerId', 'ownerId', 'userId', 'createdBy', 'creator'],
      ['creatorPhone', 'organizerPhone', 'ownerPhone', 'contactPhone', 'phoneNumber', 'phone']
    )
  }
  if (collection === 'players' || collection === 'coaches' || collection === 'management') {
    return recordTeamKeys(record).some(value => scope.teamIds.has(value) || scope.teamCodes.has(value)) ||
      recordBelongsToUser(
        record, scope.user,
        ['creatorId', 'ownerId', 'userId', 'createdBy', 'creator'],
        ['creatorPhone', 'ownerPhone', 'contactPhone']
      )
  }
  if (collection === 'player_library' || collection === 'coach_library') {
    const userKeys = [scope.user._id, scope.user.phone, scope.user.phoneNumber].filter(Boolean)
    return [record.owner, record.creator, record.creatorId, record.userId, record.createdBy]
      .some(value => value && userKeys.includes(value))
  }
  if (collection === 'referees' || collection === 'referee_invitations') {
    return scope.tournamentIds.has(record.tournamentId) || recordBelongsToUser(
      record, scope.user,
      ['creatorId', 'organizerId', 'ownerId', 'userId', 'createdBy', 'creator'],
      ['creatorPhone', 'organizerPhone', 'ownerPhone', 'phone']
    )
  }
  if (collection === 'matches') {
    return scope.matchIds.has(record._id) || scope.tournamentIds.has(record.tournamentId)
  }
  if (collection === 'match_events') {
    return scope.matchIds.has(record.matchId) || scope.tournamentIds.has(record.tournamentId)
  }
  if (collection === 'match_referees') {
    return scope.matchIds.has(record.matchId) || scope.tournamentIds.has(record.tournamentId)
  }
  if (collection === 'tournament_referees' || collection === 'tournament_teams' ||
      collection === 'tournament_groups' || collection === 'tournament_bracket' ||
      collection === 'tournament_league_tables' || collection === 'rosters' ||
      collection === 'roster_change_requests' || collection === 'standings' ||
      collection === 'schedule_info') {
    return scope.tournamentIds.has(record.tournamentId)
  }
  if (collection === 'squads') {
    return scope.matchIds.has(record.matchId) || scope.tournamentIds.has(record.tournamentId) ||
      recordTeamKeys(record).some(value => scope.teamIds.has(value) || scope.teamCodes.has(value))
  }
  if (collection === 'team_tasks') {
    return scope.tournamentIds.has(record.tournamentId) ||
      recordTeamKeys(record).some(value => scope.teamIds.has(value) || scope.teamCodes.has(value))
  }
  return false
}

function organizerRelationAllowed(collection, record, scope) {
  if (!record || !scope) return false
  if (collection === 'teams' || collection === 'tournaments' || collection === 'referees' ||
      collection === 'referee_invitations' || collection === 'player_library' ||
      collection === 'coach_library') return true
  if (collection === 'players' || collection === 'coaches' || collection === 'management') {
    return recordTeamKeys(record).some(value => scope.teamIds.has(value) || scope.teamCodes.has(value))
  }
  if (collection === 'matches' || collection === 'tournament_referees' ||
      collection === 'tournament_teams' || collection === 'tournament_groups' ||
      collection === 'tournament_bracket' || collection === 'tournament_league_tables' ||
      collection === 'rosters' || collection === 'roster_change_requests' ||
      collection === 'standings' || collection === 'schedule_info') {
    return Boolean(record.tournamentId && scope.tournamentIds.has(record.tournamentId))
  }
  if (collection === 'match_events' || collection === 'match_referees') {
    return Boolean((record.matchId && scope.matchIds.has(record.matchId)) ||
      (record.tournamentId && scope.tournamentIds.has(record.tournamentId)))
  }
  if (collection === 'squads') {
    return Boolean((record.matchId && scope.matchIds.has(record.matchId)) ||
      (record.tournamentId && scope.tournamentIds.has(record.tournamentId)) ||
      recordTeamKeys(record).some(value => scope.teamIds.has(value) || scope.teamCodes.has(value)))
  }
  if (collection === 'team_tasks') {
    return Boolean((record.tournamentId && scope.tournamentIds.has(record.tournamentId)) ||
      recordTeamKeys(record).some(value => scope.teamIds.has(value) || scope.teamCodes.has(value)))
  }
  return false
}

function prepareOrganizerAdd(collection, data, scope) {
  const next = { ...(data || {}) }
  next.orgId = scope.orgId
  next.creatorId = scope.user._id
  if (collection === 'tournaments') next.organizerId = scope.user._id
  if (collection === 'teams') next.ownerId = scope.user._id
  if (collection === 'player_library') next.owner = scope.user._id
  if (collection === 'coach_library') next.creator = scope.user._id
  return next
}

function sanitizeOrganizerUpdate(data) {
  const next = { ...(data || {}) }
  ORGANIZER_IMMUTABLE_OWNERSHIP_FIELDS.forEach(field => { delete next[field] })
  return next
}

async function validateAssistanceGrant(db, requestId, helperUserId) {
  if (!requestId) return null
  let result
  try {
    result = await db.collection('assistance_requests').doc(String(requestId)).get()
  } catch (err) {
    throw new Error('协助授权不存在，请退出协助模式')
  }
  const grant = Array.isArray(result.data) ? result.data[0] : result.data
  if (!grant || grant.helperUserId !== helperUserId) throw new Error('无权使用该协助授权')
  if (grant.status !== 'active' || dateValue(grant.grantExpiresAt) <= Date.now()) {
    if (grant.status === 'active') {
      await db.collection('assistance_requests').doc(grant._id).update({
        data: { status: 'expired', updateTime: db.serverDate() }
      })
    }
    throw new Error('协助授权已失效，请退出协助模式')
  }
  return grant
}

async function buildAssistanceScope(db, grant) {
  const targetResult = await db.collection('users').doc(grant.targetUserId).get()
  const target = Array.isArray(targetResult.data) ? targetResult.data[0] : targetResult.data
  if (!target) throw new Error('被协助账号不存在')
  const [teamResult, tournamentResult] = await Promise.all([
    db.collection('teams').limit(1000).get(),
    db.collection('tournaments').limit(1000).get()
  ])
  const teams = (teamResult.data || []).filter(team => recordBelongsToUser(
    team,
    target,
    ['creatorId', 'ownerId', 'userId', 'createdBy'],
    ['ownerPhone', 'creatorPhone', 'contactPhone', 'phoneNumber', 'phone', 'mobile']
  ))
  const tournaments = (tournamentResult.data || []).filter(tournament => recordBelongsToUser(
    tournament,
    target,
    ['creatorId', 'organizerId', 'ownerId', 'userId', 'createdBy'],
    ['creatorPhone', 'organizerPhone', 'ownerPhone', 'contactPhone', 'phoneNumber', 'phone']
  ))
  return {
    grant,
    target,
    teamIds: new Set(teams.map(item => item._id).filter(Boolean)),
    teamCodes: new Set(teams.flatMap(item => [item.teamCode, item.code]).filter(Boolean)),
    tournamentIds: new Set(tournaments.map(item => item._id).filter(Boolean))
  }
}

function assistanceRecordAllowed(collection, record, scope) {
  if (!record) return false
  if (collection === 'teams') return scope.teamIds.has(record._id) || recordBelongsToUser(
    record, scope.target,
    ['creatorId', 'ownerId', 'userId', 'createdBy'],
    ['ownerPhone', 'creatorPhone', 'contactPhone', 'phoneNumber', 'phone', 'mobile']
  )
  if (collection === 'tournaments') return scope.tournamentIds.has(record._id) || recordBelongsToUser(
    record, scope.target,
    ['creatorId', 'organizerId', 'ownerId', 'userId', 'createdBy'],
    ['creatorPhone', 'organizerPhone', 'ownerPhone', 'contactPhone', 'phoneNumber', 'phone']
  )
  if (collection === 'players' || collection === 'coaches') {
    const teamIds = [record.teamId, record.teamCode]
      .concat(Array.isArray(record.teamIds) ? record.teamIds : [])
      .concat(Array.isArray(record.teamCodes) ? record.teamCodes : [])
      .filter(Boolean)
    return teamIds.some(value => scope.teamIds.has(value) || scope.teamCodes.has(value)) || recordBelongsToUser(
      record, scope.target,
      ['creatorId', 'ownerId', 'userId', 'createdBy'],
      ['creatorPhone', 'contactPhone', 'phoneNumber', 'phone']
    )
  }
  if (collection === 'player_library') {
    const targetKeys = [scope.target._id, scope.target.phone, scope.target.phoneNumber].filter(Boolean)
    return [record.owner, record.creatorId, record.userId, record.createdBy].some(value => value && targetKeys.includes(value))
  }
  if (collection === 'matches') {
    return scope.tournamentIds.has(record.tournamentId) ||
      scope.teamIds.has(record.homeTeamId) || scope.teamIds.has(record.awayTeamId)
  }
  if (collection === 'tournament_teams' || collection === 'rosters' || collection === 'roster_change_requests') {
    return scope.tournamentIds.has(record.tournamentId) || scope.teamIds.has(record.teamId)
  }
  return false
}

function prepareAssistanceAdd(collection, data, scope) {
  const next = { ...(data || {}) }
  if (collection === 'teams') {
    next.creatorId = scope.target._id
    next.ownerId = scope.target._id
    if (scope.target.phone || scope.target.phoneNumber) next.ownerPhone = scope.target.phone || scope.target.phoneNumber
  } else if (collection === 'tournaments') {
    next.creatorId = scope.target._id
    next.organizerId = scope.target._id
  } else if (collection === 'player_library') {
    next.owner = scope.target._id
    next.creatorId = scope.target._id
  }
  return next
}

function auditSnapshot(record) {
  if (!record || typeof record !== 'object') return record || null
  const snapshot = {}
  Object.keys(record).forEach(key => {
    const value = record[key]
    if (typeof value === 'string' && value.length > 2000) snapshot[key] = `[内容已省略:${value.length}]`
    else snapshot[key] = value
  })
  return snapshot
}

async function writeAssistanceAudit(db, scope, actorUserId, operation, collection, recordId, before, after) {
  await db.collection('assistance_audit_logs').add({
    data: {
      requestId: scope.grant._id,
      helperUserId: actorUserId,
      targetUserId: scope.grant.targetUserId,
      operation,
      collection,
      recordId: recordId || '',
      before: auditSnapshot(before),
      after: auditSnapshot(after),
      channel: 'wechat_customer_service',
      createTime: db.serverDate()
    }
  })
}

// ========== 工具函数 ==========

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

function hashPassword(password, salt) {
  return crypto.createHash('sha256').update(password + '|' + salt + '|').digest('hex')
}

function verifyPassword(password, salt, hash) {
  return hashPassword(password, salt) === hash
}

const ORGANIZER_ROLE = 'organizer'

async function normalizeOrganizerUser(db, user) {
  if (String((user && user.role) || '').toLowerCase() !== ORGANIZER_ROLE) {
    await db.collection('users').doc(user._id).update({
      data: { role: ORGANIZER_ROLE, updateTime: db.serverDate() }
    })
  }
  return { ...user, role: ORGANIZER_ROLE }
}

function httpsPost(hostname, port, path, headers, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload)
    const req = https.request({ hostname, port, path, method: 'POST', headers }, (res) => {
      let body = ''
      res.on('data', c => body += c)
      res.on('end', () => {
        try { resolve(JSON.parse(body)) }
        catch(e) { resolve(body) }
      })
    })
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(new Error('timeout')) })
    req.write(data)
    req.end()
  })
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch(e) { resolve(data) }
      })
    })
    req.on('error', reject)
    req.setTimeout(10000, () => { req.destroy(new Error('timeout')) })
  })
}

// ========== TC3 签名（腾讯云 SMS）==========
function getSMSSignature(secretKey, date, service, stringToSign) {
  const kDate = crypto.createHmac('sha256', 'TC3' + secretKey).update(date).digest()
  const kService = crypto.createHmac('sha256', kDate).update(service).digest()
  const kSigning = crypto.createHmac('sha256', kService).update('tc3_request').digest()
  return crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex')
}

async function callTencentSMS(phoneNumber, code) {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const host = 'sms.tencentcloudapi.com'
  const action = 'SendSms'
  const version = '2021-01-11'
  const payloadObj = {
    SmsSdkAppId: SMS_CONFIG.SmsSdkAppId,
    SignName: SMS_CONFIG.SignName,
    TemplateId: SMS_CONFIG.TemplateId,
    TemplateParamSet: [code, '5'],
    PhoneNumberSet: ['+86' + phoneNumber],
  }
  const payload = JSON.stringify(payloadObj)

  // 签名
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`
  const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex')
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, 'content-type;host', hashedPayload].join('\n')
  const stringToSign = ['TC3-HMAC-SHA256', timestamp, `${date}/sms/tc3_request`, crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n')
  const signature = getSMSSignature(SMS_CONFIG.SecretKey, date, 'sms', stringToSign)
  const authorization = [
    `TC3-HMAC-SHA256 Credential=${SMS_CONFIG.SecretId}/${date}/sms/tc3_request`,
    `SignedHeaders=content-type;host`,
    `Signature=${signature}`
  ].join(', ')

  const result = await httpsPost(host, 443, '/', {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Host': host,
    'X-TC-Action': action,
    'X-TC-Version': version,
    'X-TC-Timestamp': timestamp,
    'X-TC-Region': SMS_CONFIG.Region,
    'Authorization': authorization,
  }, payloadObj)

  if (result.Response && result.Response.SendStatusSet && result.Response.SendStatusSet[0] && result.Response.SendStatusSet[0].Code === 'Ok') {
    return { success: true }
  }
  throw new Error(result.Response ? JSON.stringify(result.Response) : 'SMS API error')
}

// ========== 操作实现 ==========

// 1. 发送短信验证码
async function handleSendSms(event) {
  const { phoneNumber } = event
  if (!phoneNumber || !/^1[3-9]\d{9}$/.test(phoneNumber)) {
    return { success: false, error: '手机号格式不正确' }
  }
  if (!SMS_CONFIG.SecretId || !SMS_CONFIG.SecretKey || !SMS_CONFIG.SmsSdkAppId) {
    return { success: false, error: 'SMS 配置不完整' }
  }

  const code = generateCode()
  const db = cloud.database()

  try {
    await callTencentSMS(phoneNumber, code)
    console.log('[webApi] SMS sent to', phoneNumber, 'code:', code)

    await db.collection('sms_codes').add({
      data: { phoneNumber, code, expireAt: new Date(Date.now() + 5 * 60 * 1000), used: false, createdAt: db.serverDate() }
    })
    return { success: true, message: '验证码发送成功' }
  } catch (err) {
    console.error('[webApi] sendSms error:', err.message)
    return { success: false, error: err.message || '发送失败，请稍后重试' }
  }
}

// 2. 验证短信验证码并登录
async function handleVerifySmsCode(event) {
  const { phoneNumber, code } = event
  if (!phoneNumber || !code) return { success: false, error: '缺少手机号或验证码' }

  const db = cloud.database()
  const _ = db.command
  const now = new Date()

  // 验证码校验
  const smsResult = await db.collection('sms_codes')
    .where({ phoneNumber, code, used: false, expireAt: _.gt(now) })
    .orderBy('createdAt', 'desc').limit(1).get()

  if (!smsResult.data || smsResult.data.length === 0) {
    return { success: false, error: '验证码错误或已过期' }
  }

  const existUser = await db.collection('users').where(_.or([
    { phone: phoneNumber },
    { phoneNumber }
  ])).limit(2).get()
  const users = existUser.data || []
  if (users.length > 1) return { success: false, error: '手机号存在重复账号，请联系管理员处理' }
  let user
  if (users.length === 0) {
    const created = await db.collection('users').add({
      data: {
        phone: phoneNumber, phoneNumber, phoneVerified: true, role: ORGANIZER_ROLE,
        email: '', passwordSet: false, createTime: db.serverDate(), updateTime: db.serverDate()
      }
    })
    user = { _id: created._id, phone: phoneNumber, phoneNumber, role: ORGANIZER_ROLE, email: '', passwordSet: false }
  } else {
    user = await normalizeOrganizerUser(db, users[0])
  }
  await db.collection('sms_codes').doc(smsResult.data[0]._id).update({ data: { used: true, usedAt: db.serverDate() } })
  await db.collection('users').doc(user._id).update({
    data: { lastLoginTime: db.serverDate(), lastLoginType: 'phone', updateTime: db.serverDate() }
  })

  const normalizedRole = ORGANIZER_ROLE
  return {
    success: true, message: '登录成功',
    needSetPassword: !(user.passwordSet || user.passwordHash), needBindEmail: !user.email, needSelectRole: false,
    role: normalizedRole,
    user: { _id: user._id, phone: user.phone, email: user.email || '', role: normalizedRole, openId: user.openId || '' }
  }
}

// 3. 密码登录
async function handlePasswordLogin(event) {
  const { phoneNumber, password } = event
  if (!phoneNumber || !password) return { success: false, error: '缺少手机号或密码' }

  const db = cloud.database()
  const _ = db.command
  const users = await db.collection('users').where(_.or([
    { phone: phoneNumber },
    { phoneNumber }
  ])).limit(2).get()

  if (!users.data || users.data.length === 0) return { success: false, error: '该手机号未注册' }
  if (users.data.length > 1) return { success: false, error: '手机号存在重复账号，请联系管理员处理' }

  let user = users.data[0]
  if (!user.passwordHash || !user.passwordSalt) return { success: false, error: '该用户未设置密码' }
  if (!verifyPassword(password, user.passwordSalt, user.passwordHash)) return { success: false, error: '密码错误' }
  user = await normalizeOrganizerUser(db, user)

  const normalizedRole = ORGANIZER_ROLE
  return {
    success: true, message: '登录成功',
    needSetPassword: false, needBindEmail: !user.email, needSelectRole: false,
    role: normalizedRole,
    user: { _id: user._id, phone: user.phone, email: user.email || '', role: normalizedRole }
  }
}

// 4. 邮箱发送验证码
async function handleEmailSendCode(event) {
  const { email } = event
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: '邮箱格式不正确' }
  }

  const code = generateCode()
  const db = cloud.database()

  try {
    // 存储验证码（使用 email_verification 集合，与原 emailLogin 云函数保持一致）
    await db.collection('email_verification').add({
      data: { email, code, purpose: 'bind', expireAt: new Date(Date.now() + 10 * 60 * 1000), used: false, createdAt: db.serverDate() }
    })

    // 发送邮件
    const emailHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  body { font-family: sans-serif; padding: 20px; }
  .code { font-size: 32px; font-weight: bold; color: #1B5E20; letter-spacing: 6px; }
</style></head><body>
  <p>尊敬的 <strong>${email}</strong>，您好！</p>
  <p>您的赛小蜂足球验证码是：</p>
  <div class="code">${code}</div>
  <p>验证码 10 分钟内有效，请及时使用。</p>
  <p style="color:#999;font-size:12px;">如非本人操作，请忽略此邮件。</p>
</body></html>`

    const sendResult = await sendEmail(email, '赛小蜂足球 - 邮箱验证码', emailHtml)

    return {
      success: true,
      message: sendResult.sent ? '验证码已发送到邮箱，请查收' : '验证码已生成（邮件发送失败，请检查 SMTP 配置）',
      sent: sendResult.sent || false
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// 5. 邮箱验证码登录
async function handleEmailVerifyCode(event) {
  const { email, code } = event
  if (!email || !code) return { success: false, error: '缺少邮箱或验证码' }

  const db = cloud.database()
  const _ = db.command
  const now = new Date()

  const codeResult = await db.collection('email_verification')
    .where({ email, code, used: false, expireAt: _.gt(now) })
    .orderBy('createdAt', 'desc').limit(1).get()

  if (!codeResult.data || codeResult.data.length === 0) {
    return { success: false, error: '验证码错误或已过期' }
  }

  const existUser = await db.collection('users').where({ email }).limit(2).get()
  const users = existUser.data || []
  if (users.length > 1) return { success: false, error: '邮箱存在重复账号，请联系管理员处理' }
  let user
  if (users.length === 0) {
    const created = await db.collection('users').add({
      data: {
        email, phone: '', phoneNumber: '', role: ORGANIZER_ROLE, passwordSet: false,
        createTime: db.serverDate(), updateTime: db.serverDate()
      }
    })
    user = { _id: created._id, email, phone: '', phoneNumber: '', role: ORGANIZER_ROLE, passwordSet: false }
  } else {
    user = await normalizeOrganizerUser(db, users[0])
  }
  await db.collection('email_verification').doc(codeResult.data[0]._id).update({ data: { used: true, usedAt: db.serverDate() } })
  await db.collection('users').doc(user._id).update({ data: { lastLoginTime: db.serverDate(), lastLoginType: 'email', updateTime: db.serverDate() } })

  const normalizedRole = ORGANIZER_ROLE
  return {
    success: true, message: '登录成功',
    needSetPassword: !(user.passwordSet || user.passwordHash), needBindPhone: !(user.phone || user.phoneNumber), needSelectRole: false,
    role: normalizedRole,
    user: { _id: user._id, email, phone: user.phone || '', role: normalizedRole, userName: user.nickname || user.userName || email, avatarUrl: user.headimgurl || user.avatarUrl || '' }
  }
}

// 6. 纯微信扫码登录：不绑定手机号、邮箱或密码。
async function handleWechatOnlyLogin(event) {
  const { code } = event
  if (!code) return { success: false, error: '缺少授权码' }
  if (!WECHAT_CONFIG.APP_ID || !WECHAT_CONFIG.APP_SECRET) {
    return { success: false, error: '微信配置缺失' }
  }

  const db = cloud.database()
  const _ = db.command
  const findUniqueUser = async (where, label) => {
    const result = await db.collection('users').where(where).limit(2).get()
    const users = result.data || []
    if (users.length > 1) throw new Error(label + '存在重复账号，请联系管理员处理')
    return users[0] || null
  }

  try {
    const tokenUrl = 'https://api.weixin.qq.com/sns/oauth2/access_token?appid=' + WECHAT_CONFIG.APP_ID +
      '&secret=' + WECHAT_CONFIG.APP_SECRET + '&code=' + code + '&grant_type=authorization_code'
    const tokenData = await httpsGet(tokenUrl)
    if (tokenData.errcode) throw new Error('微信错误:' + (tokenData.errmsg || ''))

    const userInfoUrl = 'https://api.weixin.qq.com/sns/userinfo?access_token=' + tokenData.access_token + '&openid=' + tokenData.openid
    const wxUserInfo = await httpsGet(userInfoUrl)
    if (wxUserInfo.errcode) throw new Error('获取用户信息失败')

    const unionId = wxUserInfo.unionid || ''
    const openId = tokenData.openid
    const now = new Date()
    let user = null
    if (unionId) user = await findUniqueUser({ unionId }, '微信 UnionID')
    if (!user) user = await findUniqueUser({ wechatOpenId: openId }, '网页微信 OpenID')

    let isNewUser = false
    if (!user) {
      const data = {
        wechatOpenId: openId,
        unionId,
        nickname: wxUserInfo.nickname || '微信用户',
        headimgurl: wxUserInfo.headimgurl || '',
        role: ORGANIZER_ROLE,
        loginType: 'wechat',
        createTime: now,
        updateTime: now,
        lastLoginTime: now
      }
      const created = await db.collection('users').add({ data })
      user = { _id: created._id, ...data }
      isNewUser = true
    } else {
      const updateData = {
        wechatOpenId: openId,
        nickname: wxUserInfo.nickname || user.nickname || '微信用户',
        headimgurl: wxUserInfo.headimgurl || user.headimgurl || '',
        role: ORGANIZER_ROLE,
        loginType: 'wechat',
        updateTime: now,
        lastLoginTime: now,
        phone: _.remove(),
        phoneNumber: _.remove(),
        phoneVerified: _.remove(),
        email: _.remove(),
        passwordHash: _.remove(),
        passwordSalt: _.remove(),
        passwordSet: _.remove()
      }
      if (unionId) updateData.unionId = unionId
      await db.collection('users').doc(user._id).update({ data: updateData })
      user = { ...user, ...updateData }
    }

    return {
      success: true,
      message: isNewUser ? '扫码成功，已创建主办方账号' : '欢迎回来！',
      needSetPassword: false,
      needBindPhone: false,
      needBindEmail: false,
      needSelectRole: false,
      role: ORGANIZER_ROLE,
      user: {
        _id: user._id,
        openid: openId,
        unionid: unionId,
        nickname: user.nickname || '微信用户',
        headimgurl: user.headimgurl || '',
        role: ORGANIZER_ROLE,
        isPlatformOwner: user.isPlatformOwner === true
      },
      isNewUser
    }
  } catch (err) {
    console.error('[webApi] wechatOnlyLogin error:', err.message)
    return { success: false, error: err.message || '微信登录失败' }
  }
}

// 历史多方式登录实现保留在源码中但不再路由调用。
async function handleWechatWebLogin(event) {
  const { code, phone: eventPhone, smsCode } = event
  if (!code) return { success: false, error: '缺少授权码' }
  if (!WECHAT_CONFIG.APP_ID || !WECHAT_CONFIG.APP_SECRET) {
    return { success: false, error: '微信配置缺失' }
  }

  const db = cloud.database()
  const _ = db.command

  const findUniqueUser = async (where, label) => {
    const result = await db.collection('users').where(where).limit(2).get()
    const users = result.data || []
    if (users.length > 1) {
      console.error('[webApi] 微信登录检测到重复账号:', label, users.map(item => item._id))
      throw new Error(label + '存在重复绑定，请联系管理员处理')
    }
    return users[0] || null
  }

  try {
    // 用 code 换 token
    const tokenUrl = 'https://api.weixin.qq.com/sns/oauth2/access_token?appid=' + WECHAT_CONFIG.APP_ID +
      '&secret=' + WECHAT_CONFIG.APP_SECRET + '&code=' + code + '&grant_type=authorization_code'
    const tokenData = await httpsGet(tokenUrl)
    if (tokenData.errcode) throw new Error('微信错误:' + (tokenData.errmsg || ''))

    // 获取用户信息
    const userInfoUrl = 'https://api.weixin.qq.com/sns/userinfo?access_token=' + tokenData.access_token + '&openid=' + tokenData.openid
    const wxUserInfo = await httpsGet(userInfoUrl)
    if (wxUserInfo.errcode) throw new Error('获取用户信息失败')

    // 手机验证（可选）
    let verifiedPhone = ''
    if (eventPhone && smsCode) {
      const smsResult = await db.collection('sms_codes').where({
        phoneNumber: eventPhone, code: smsCode, used: false
      }).orderBy('createTime', 'desc').limit(1).get()
      if (!smsResult.data || smsResult.data.length === 0) return { success: false, error: '验证码错误或已过期' }
      await db.collection('sms_codes').doc(smsResult.data[0]._id).update({ data: { used: true, useTime: new Date() } })
      verifiedPhone = eventPhone
    }

    // 查找或创建用户
    const unionId = wxUserInfo.unionid || ''
    const openId = tokenData.openid
    const now = new Date()
    let user = null
    let foundBy = ''

    // 按 unionId 查找
    if (unionId) {
      user = await findUniqueUser({ unionId }, '微信 UnionID')
      if (user) foundBy = 'unionId'
    }
    // 按 wechatOpenId/openId 查找
    if (!user) {
      user = await findUniqueUser({ wechatOpenId: openId }, '网页微信 OpenID')
      if (user) foundBy = 'wechatOpenId'
    }
    if (!user) {
      user = await findUniqueUser({ openId }, '兼容微信 OpenID')
      if (user) foundBy = 'legacyOpenId'
    }
    // 按手机号查找（合并账号）
    if (!user && verifiedPhone) {
      user = await findUniqueUser(_.or([
        { phone: verifiedPhone },
        { phoneNumber: verifiedPhone }
      ]), '手机号 ' + verifiedPhone)
      if (user) foundBy = 'verifiedPhone'
    }
    let isNewUser = false
    // 微信扫码即注册为主办方，不再要求预先开通身份。
    if (!user) {
      const created = await db.collection('users').add({
        data: {
          wechatOpenId: openId,
          unionId,
          nickname: wxUserInfo.nickname || '微信用户',
          headimgurl: wxUserInfo.headimgurl || '',
          phone: verifiedPhone,
          phoneNumber: verifiedPhone,
          phoneVerified: !!verifiedPhone,
          email: '',
          role: ORGANIZER_ROLE,
          passwordSet: false,
          createTime: now,
          updateTime: now,
          lastLoginTime: now,
          loginType: 'wechat'
        }
      })
      user = {
        _id: created._id,
        wechatOpenId: openId,
        unionId,
        nickname: wxUserInfo.nickname || '微信用户',
        headimgurl: wxUserInfo.headimgurl || '',
        phone: verifiedPhone,
        phoneNumber: verifiedPhone,
        email: '',
        role: ORGANIZER_ROLE,
        passwordSet: false
      }
      isNewUser = true
      foundBy = 'createdOrganizer'
    } else {
      user = await normalizeOrganizerUser(db, user)
      const currentPhone = user.phone || user.phoneNumber || ''
      if (verifiedPhone && currentPhone && currentPhone !== verifiedPhone) {
        throw new Error('当前微信已绑定其他手机号，请先完成账号核验')
      }

      const updateData = {
        wechatOpenId: openId,
        headimgurl: wxUserInfo.headimgurl || user.headimgurl || '',
        nickname: wxUserInfo.nickname || user.nickname || user.nickName || '',
        lastLoginTime: now,
        loginType: 'wechat',
        role: ORGANIZER_ROLE,
        updateTime: now
      }
      if (unionId) updateData.unionId = unionId
      if (verifiedPhone && !currentPhone) {
        updateData.phone = verifiedPhone
        updateData.phoneNumber = verifiedPhone
        updateData.phoneVerified = true
      }
      await db.collection('users').doc(user._id).update({
        data: updateData
      })
      user = { ...user, ...updateData }
    }

    const finalPhone = user.phone || user.phoneNumber || verifiedPhone || ''
    if (finalPhone) {
      const phoneResult = await db.collection('users').where(_.or([
        { phone: finalPhone },
        { phoneNumber: finalPhone }
      ])).limit(3).get()
      const uniqueIds = [...new Set((phoneResult.data || []).map(item => item._id))]
      if (uniqueIds.length > 1) {
        console.error('[webApi] 手机号重复绑定:', finalPhone, uniqueIds)
        throw new Error('手机号 ' + finalPhone + ' 存在重复账号，请联系管理员处理')
      }
    }

    const finalRole = ORGANIZER_ROLE
    console.log('[webApi] 微信登录匹配完成:', foundBy, user._id, finalPhone || '(未绑定)')
    return {
      success: true, message: isNewUser ? '注册成功，已进入主办方后台' : '欢迎回来！',
      needSetPassword: !(user.passwordSet || user.passwordHash),
      needBindPhone: !finalPhone,
      needBindEmail: !(user.email || ''),
      needSelectRole: false,
      role: finalRole,
    user: {
      _id: user._id, openid: user.wechatOpenId || openId, unionid: user.unionId || unionId,
      nickname: user.nickname || wxUserInfo.nickname, headimgurl: user.headimgurl || '',
      phone: finalPhone, phoneNumber: finalPhone, email: user.email || '', role: finalRole,
      isPlatformOwner: user.isPlatformOwner === true
    },
      isNewUser
    }
  } catch (err) {
    console.error('[webApi] wechatWebLogin error:', err.message)
    return { success: false, error: err.message || '微信登录失败' }
  }
}

// 8. 设置用户身份（网页端选择角色后调用）
async function handleEmailSetRole(event) {
  return { success: false, error: '当前仅保留主办方身份，不支持选择或切换身份' }
}

// 9. 设置密码（邮箱/手机注册用户首次设置密码）
async function handleEmailSetPassword(event) {
  const { userId, password } = event
  if (!userId) return { success: false, error: '缺少用户ID' }
  if (!password) return { success: false, error: '缺少密码' }

  // 密码规则验证
  if (password.length < 8) return { success: false, error: '密码长度至少8位' }
  if (!/[A-Z]/.test(password)) return { success: false, error: '密码必须包含大写字母' }
  if (!/[a-z]/.test(password)) return { success: false, error: '密码必须包含小写字母' }
  if (!/[0-9]/.test(password)) return { success: false, error: '密码必须包含数字' }

  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.createHash('sha256').update(password + '|' + salt + '|').digest('hex')

  const db = cloud.database()
  try {
    await db.collection('users').doc(userId).update({
      data: {
        passwordHash: hash,
        passwordSalt: salt,
        passwordSet: true,
        updateTime: db.serverDate()
      }
    })
    console.log('[webApi] emailSetPassword 成功:', userId)
    return { success: true, message: '密码设置成功' }
  } catch (err) {
    console.error('[webApi] emailSetPassword 失败:', err.message)
    return { success: false, error: err.message || '设置密码失败' }
  }
}

// 10. 绑定邮箱（网页端绑定邮箱后调用）
async function handleEmailBindEmail(event) {
  const { userId, email, code } = event
  if (!userId) return { success: false, error: '缺少用户ID' }
  if (!email) return { success: false, error: '缺少邮箱' }
  if (!code) return { success: false, error: '缺少验证码' }

  const db = cloud.database()
  const _ = db.command

  try {
    // 1. 验证验证码
    const codeRes = await db.collection('email_verification').where({
      email: email,
      code: code,
      purpose: 'bind',
      used: false,
      expireAt: _.gt(new Date())
    }).get()

    if (!codeRes.data || codeRes.data.length === 0) {
      return { success: false, error: '验证码无效或已过期' }
    }

    // 2. 标记验证码已使用
    await db.collection('email_verification').doc(codeRes.data[0]._id).update({
      data: { used: true, usedTime: db.serverDate() }
    })

    // 3. 更新用户邮箱
    await db.collection('users').doc(userId).update({
      data: { email: email, updateTime: db.serverDate() }
    })

    console.log('[webApi] emailBindEmail 成功:', userId, email)
    return { success: true, message: '邮箱绑定成功' }
  } catch (err) {
    console.error('[webApi] emailBindEmail 失败:', err.message)
    return { success: false, error: err.message || '邮箱绑定失败' }
  }
}

// 11. 检查登录状态
async function handleCheckLogin(event) {
  // 前端传 userId，后端验证是否存在
  const { userId } = event
  if (!userId) return { success: false, loggedIn: false }

  try {
    const db = cloud.database()
    const result = await db.collection('users').doc(userId).get()
    if (result.data && result.data.length > 0) {
      const u = result.data[0]
      return { success: true, loggedIn: true, user: { _id: u._id, role: ORGANIZER_ROLE, nickname: u.nickname || '' } }
    }
    return { success: true, loggedIn: false }
  } catch (e) {
    return { success: true, loggedIn: false }
  }
}

// 8. 通用数据库查询（替代浏览器端 SDK 数据库操作）
// 支持: list / get / count / add / update / delete
// 9. 通用云函数调用（代理调用其他云函数）
// 用于浏览器端调用非登录类云函数（如 uploadFile）
// ★ 添加云函数白名单，防止调用危险云函数
const ALLOWED_FUNCTIONS = [
  'uploadFile',
  'parseTournamentRegulations',
  'saveSignature',
  'getSignatureStatus',
  'updateMatchSignature',
  'generateSchedule',
  'bindPhone',
  'updateMatch',
  'updateMatchLineup',
  'applyTournament',
  'tournamentReview',
  'getMyTeams',
  'generatePlayerCard',
  'generateQRCode',
  'removeImageBg',
  'baiduRemoveBg',       // 百度智能云人像分割
  'clearTeamPlayers', // 批量删除球队球员（临时工具）
  'tournamentCenterLogin', // 赛事中心登录
  'setTournamentCenterPassword', // 赛事中心设置密码
  'manageTournamentCenterAccounts', // 赛事中心账号管理
  // 赛事中心后台数据操作（共享赛小蜂数据库）
  'getTeams', 'getPlayers', 'createTeam', 'updateTeam', 'deleteTeam',
  'createPlayer', 'updatePlayer', 'deletePlayer',
  'getBanners', 'saveBanner',
  'getTournaments',
  'generateMiniProgramCode',
  'platformOwner',
]

async function handleCallFunction(event) {
  const { functionName, functionParams, assistanceGrantId } = event
  if (!functionName) {
    return { success: false, error: '缺少 functionName 参数' }
  }
  if (!ALLOWED_FUNCTIONS.includes(functionName)) {
    console.warn('[webApi] 不允许调用的云函数:', functionName)
    return { success: false, error: '不允许调用云函数: ' + functionName }
  }

  try {
    let authenticated = null
    let assistanceGrant = null
    const requiresSession = functionName === 'platformOwner' || functionName === 'generateMiniProgramCode' ||
      ORGANIZER_SCOPED_RELAY_FUNCTIONS.has(functionName) || Boolean(assistanceGrantId)
    if (requiresSession) {
      authenticated = await authenticateWebSession(event)
      if (!authenticated.success) return authenticated
    }
    if (assistanceGrantId) {
      assistanceGrant = await validateAssistanceGrant(cloud.database(), assistanceGrantId, authenticated.userId)
      const assistedRelayAllowlist = new Set([
        'uploadFile', 'removeImageBg', 'baiduRemoveBg', 'generatePlayerCard',
        'generateQRCode', 'generateMiniProgramCode', 'getSignatureStatus',
        'getTeams', 'getPlayers', 'getTournaments'
      ])
      if (!assistedRelayAllowlist.has(functionName)) {
        return { success: false, error: '当前协助授权暂不允许执行该高风险操作' }
      }
    }
    const trustedParams = {
      ...(functionParams || {}),
      ...(authenticated ? { __authToken: event.authToken } : {}),
      ...(authenticated && !assistanceGrant ? {
        __actorUserId: authenticated.userId,
        __actorOrgId: authenticated.orgId
      } : {}),
      ...(assistanceGrant ? { assistanceGrantId: assistanceGrant._id } : {})
    }
    console.log('[webApi] 调用云函数:', functionName, '参数 keys:', Object.keys(functionParams || {}))
    const result = await cloud.callFunction({
      name: functionName,
      data: trustedParams
    })
    console.log('[webApi] 云函数调用成功:', functionName, 'result:', result.result ? '有返回' : '无返回')
    return result.result || { success: false, error: '云函数无返回结果' }
  } catch (err) {
    console.error('[webApi] 云函数调用失败:', functionName, err.message || err)
    return { 
      success: false, 
      error: '云函数 ' + functionName + ' 调用失败: ' + (err.message || '未知错误')
    }
  }
}

// ★ 新：直接在 webLoginApi 上传图片到云存储（绕过 uploadFile 云函数的 HTTP 限制）
async function handleUploadImage(event) {
  const { base64Data, folder } = event
  if (!base64Data) return { success: false, error: '缺少 base64Data' }

  try {
    // 解析 base64
    const matches = base64Data.match(/^data:([A-Za-z-+/]+);base64,(.+)$/)
    let buffer, ext = 'png'
    if (matches && matches.length === 3) {
      ext = matches[1].split('/')[1] || 'png'
      buffer = Buffer.from(matches[2], 'base64')
    } else {
      buffer = Buffer.from(base64Data, 'base64')
    }

    const ts = Date.now()
    const rnd = Math.random().toString(36).substring(2, 8)
    const cloudPath = `${folder || 'images'}/${ts}_${rnd}.${ext}`

    console.log('[webApi] uploadImage:', cloudPath, 'size:', buffer.length)
    const uploadResult = await cloud.uploadFile({ cloudPath, fileContent: buffer })
    console.log('[webApi] uploadImage 成功:', uploadResult.fileID)

    // 获取临时 URL
    let tempUrl = ''
    try {
      const temp = await cloud.getTempFileURL({ fileList: [uploadResult.fileID] })
      if (temp.fileList && temp.fileList[0]) tempUrl = temp.fileList[0].tempFileURL
    } catch (e) { console.warn('[webApi] getTempFileURL 失败:', e.message) }

    return { success: true, fileID: uploadResult.fileID, tempUrl, message: '上传成功' }
  } catch (err) {
    console.error('[webApi] uploadImage 失败:', err.message)
    return { success: false, error: err.message || '上传失败' }
  }
}

// ★★★ 新增：接收浏览器 FormData 直传（绕过 JSON+Base64 body 限制）
// 通过 webLoginApi 自身的 HTTP 触发器接收 formData，然后转交上传
async function handleUploadToCosDirect(event, params) {
  // 当浏览器以 multipart/form-data 方式直传时，event.body 是 Buffer
  // 字段在 event.formFields / event.body 混合位置
  console.log('[webApi] uploadToCosDirect 收到, event keys:', Object.keys(event || {}))
  console.log('[webApi] body type:', typeof event?.body, Buffer.isBuffer(event?.body))
  console.log('[webApi] formFields:', JSON.stringify(event?.formFields || {}).substring(0, 200))
  console.log('[webApi] files:', event?.files ? Object.keys(event.files) : 'none')

  try {
    let buffer = null
    let folder = params.folder || params.action && event.queryStringParameters?.folder || 'images'
    let filename = null

    // ★ 模式 A：CloudBase 集成触发器自动解析了 formData
    if (event.formFields && event.formFields.folder) {
      folder = event.formFields.folder
    }
    if (event.formFields && event.formFields.filename) {
      filename = event.formFields.filename
    }

    // 文件可能通过 event.files 注入（CloudBase 网关模式）
    if (event.files && typeof event.files === 'object') {
      // event.files.file 应该是 { content: Buffer, filename, contentType }
      const fileEntries = Object.values(event.files)
      if (fileEntries.length > 0) {
        const f = fileEntries[0]
        if (Buffer.isBuffer(f)) buffer = f
        else if (f && f.content) {
          buffer = Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content, 'base64')
          filename = f.filename || f.name || filename
        }
        else if (f && f.body) {
          buffer = Buffer.isBuffer(f.body) ? f.body : Buffer.from(f.body, 'base64')
        }
        else if (typeof f === 'string') {
          // 可能是 base64 字符串
          const m = f.match(/^data:image\/(\w+);base64,(.+)$/)
          if (m) {
            buffer = Buffer.from(m[2], 'base64')
            filename = filename || `upload_${Date.now()}.${m[1]}`
          } else {
            buffer = Buffer.from(f, 'base64')
          }
        }
      }
    }

    // 文件可能在 event.body 中（HTTP 触发器 raw body）
    if (!buffer && event.body) {
      if (Buffer.isBuffer(event.body)) {
        // 可能是 multipart/form-data 原始数据，尝试解析
        const contentType = event.headers?.['content-type'] || event.headers?.['Content-Type'] || ''
        if (contentType.includes('multipart/form-data')) {
          buffer = parseMultipartFormData(event.body, contentType)
        } else if (contentType.includes('application/json')) {
          // JSON 模式：和原 uploadImage 一样
          try {
            const data = JSON.parse(event.body.toString('utf-8'))
            if (data.base64Data) {
              const m = data.base64Data.match(/^data:image\/(\w+);base64,(.+)$/)
              if (m) {
                buffer = Buffer.from(m[2], 'base64')
                filename = filename || data.filename || `upload_${Date.now()}.${m[1]}`
                folder = data.folder || folder
              }
            }
          } catch (e) {
            return { success: false, error: 'JSON 解析失败: ' + e.message }
          }
        } else {
          // 未知类型：当原始二进制处理
          buffer = event.body
        }
      } else if (typeof event.body === 'string') {
        // 字符串 body（fallback）
        const m = event.body.match(/^data:image\/(\w+);base64,(.+)$/)
        if (m) {
          buffer = Buffer.from(m[2], 'base64')
          filename = filename || `upload_${Date.now()}.${m[1]}`
        } else {
          try {
            const data = JSON.parse(event.body)
            if (data.base64Data) {
              const mm = data.base64Data.match(/^data:image\/(\w+);base64,(.+)$/)
              if (mm) {
                buffer = Buffer.from(mm[2], 'base64')
                filename = data.filename || filename
                folder = data.folder || folder
              }
            }
          } catch (e) {}
        }
      }
    }

    if (!buffer || buffer.length === 0) {
      return {
        success: false,
        error: '未接收到文件数据',
        debug: {
          eventKeys: Object.keys(event || {}),
          bodyType: typeof event?.body,
          hasFormFields: !!event?.formFields,
          hasFiles: !!event?.files,
          contentType: event?.headers?.['content-type'] || event?.headers?.['Content-Type']
        }
      }
    }

    filename = filename || `upload_${Date.now()}.png`
    const cloudPath = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${filename}`

    console.log('[webApi] 上传:', cloudPath, 'size:', buffer.length)
    const uploadResult = await cloud.uploadFile({ cloudPath, fileContent: buffer })
    console.log('[webApi] 成功:', uploadResult.fileID)

    let tempUrl = ''
    try {
      const temp = await cloud.getTempFileURL({ fileList: [uploadResult.fileID] })
      if (temp.fileList && temp.fileList[0]) tempUrl = temp.fileList[0].tempFileURL
    } catch (e) {
      console.warn('[webApi] getTempFileURL 失败:', e.message)
    }

    return {
      success: true,
      fileID: uploadResult.fileID,
      tempUrl,
      cloudPath,
      size: buffer.length
    }
  } catch (err) {
    console.error('[webApi] uploadToCosDirect 失败:', err)
    return { success: false, error: err.message || '上传失败' }
  }
}

// 8. 通用数据库查询（替代浏览器端 SDK 数据库操作）
// 支持: list / get / count / add / update / delete
// ★ 添加集合白名单，禁止直接操作系统集合
const SYSTEM_COLLECTIONS = [
  'users', 'sms_codes', 'email_verification', 'email_codes', 'invite_codes',
  'auth_sessions', 'assistance_requests', 'assistance_attempts', 'assistance_audit_logs', 'platform_settings'
]
async function handleDbQuery(event) {
  const { collection, operation, where, orderBy, limit: limitVal, skip: skipVal, id, data, assistanceGrantId } = event
  if (!collection) return { success: false, error: '缺少 collection 参数' }
  if (!operation) return { success: false, error: '缺少 operation 参数' }

  // ★ 集合白名单检查
  if (SYSTEM_COLLECTIONS.includes(collection)) {
    console.warn('[webApi] 非法操作系统集合:', collection)
    return { success: false, error: '无权操作此集合' }
  }
  if (!ORGANIZER_PRIVATE_COLLECTIONS.has(collection)) {
    console.warn('[webApi] 普通工作台尝试访问非私有业务集合:', collection)
    return { success: false, error: '普通工作台无权访问此集合' }
  }

  const db = cloud.database()
  const authenticated = await authenticateWebSession(event)
  if (!authenticated.success) return authenticated

  let assistanceScope = null
  if (assistanceGrantId) {
    if (!ASSISTANCE_COLLECTIONS.has(collection)) {
      return { success: false, error: '当前协助授权不能访问该类资料' }
    }
    try {
      const grant = await validateAssistanceGrant(db, assistanceGrantId, authenticated.userId)
      assistanceScope = await buildAssistanceScope(db, grant)
    } catch (err) {
      return { success: false, error: err.message || '协助授权校验失败', code: 'ASSISTANCE_EXPIRED' }
    }
  }

  let organizerScope = null
  if (!assistanceScope) {
    organizerScope = await buildOrganizerScope(db, authenticated.user)
  }

  try {
    switch (operation) {
      case 'list': {
        let query = db.collection(collection)
        if (where && Object.keys(where).length > 0) query = query.where(where)
        if (orderBy) {
          // 支持两种格式：{ field: 'desc' } 或 [{ field: 'desc' }]
          const orders = Array.isArray(orderBy) ? orderBy : [orderBy]
          for (const entry of orders) {
            if (entry && typeof entry === 'object') {
              const field = Object.keys(entry)[0]
              const order = entry[field]
              if (field) query = query.orderBy(field, typeof order === 'string' ? order : 'desc')
            }
          }
        }
        if (!organizerScope && skipVal) query = query.skip(skipVal)
        query = query.limit(organizerScope ? 1000 : (limitVal || 100))
        const res = await query.get()
        let records = assistanceScope
          ? (res.data || []).filter(record => assistanceRecordAllowed(collection, record, assistanceScope))
          : (res.data || [])
        if (organizerScope) {
          const start = Math.max(Number(skipVal) || 0, 0)
          const size = Math.min(Math.max(Number(limitVal) || 100, 1), 1000)
          records = records
            .filter(record => organizerRecordAllowed(collection, record, organizerScope))
            .slice(start, start + size)
        }
        return { success: true, data: records, total: records.length }
      }
      case 'get': {
        if (!id) return { success: false, error: '缺少记录 ID' }
        const res = await db.collection(collection).doc(id).get()
        const record = res.data
        const normalized = Array.isArray(record) ? (record[0] || null) : record
        if (assistanceScope && !assistanceRecordAllowed(collection, normalized, assistanceScope)) {
          return { success: false, error: '该资料不在用户授权范围内' }
        }
        if (organizerScope && !organizerRecordAllowed(collection, normalized, organizerScope)) {
          return { success: false, error: '无权查看其他账号的资料' }
        }
        return { success: true, data: normalized }
      }
      case 'count': {
        let q = db.collection(collection)
        if (where && Object.keys(where).length > 0) q = q.where(where)
        if (assistanceScope) {
          const records = (await q.limit(1000).get()).data || []
          return {
            success: true,
            total: records.filter(record => assistanceRecordAllowed(collection, record, assistanceScope)).length
          }
        }
        if (organizerScope) {
          const records = (await q.limit(1000).get()).data || []
          return {
            success: true,
            total: records.filter(record => organizerRecordAllowed(collection, record, organizerScope)).length
          }
        }
        const c = await q.count()
        return { success: true, total: c.total }
      }
      case 'add': {
        if (!data) return { success: false, error: '缺少 data 参数' }
        const nextData = assistanceScope
          ? prepareAssistanceAdd(collection, data, assistanceScope)
          : prepareOrganizerAdd(collection, data, organizerScope)
        if (assistanceScope) {
          if (!assistanceScope.grant.permissions || assistanceScope.grant.permissions.edit !== true) {
            return { success: false, error: '用户未授权添加或修改资料' }
          }
          if (!assistanceRecordAllowed(collection, nextData, assistanceScope)) {
            return { success: false, error: '新增资料不在用户授权范围内' }
          }
        }
        if (organizerScope && !organizerRelationAllowed(collection, nextData, organizerScope)) {
          return { success: false, error: '新增资料关联了其他账号的数据' }
        }
        const addRes = await db.collection(collection).add({ data: nextData })
        if (assistanceScope) {
          await writeAssistanceAudit(
            db, assistanceScope, authenticated.userId, 'add', collection, addRes._id, null, { ...nextData, _id: addRes._id }
          )
        }
        return { success: true, _id: addRes._id, message: '新增成功' }
      }
      case 'update': {
        if (!id) return { success: false, error: '缺少记录 ID' }
        if (!data) return { success: false, error: '缺少 data 参数' }
        let before = null
        let nextUpdateData = data
        if (assistanceScope) {
          if (!assistanceScope.grant.permissions || assistanceScope.grant.permissions.edit !== true) {
            return { success: false, error: '用户未授权添加或修改资料' }
          }
          const beforeResult = await db.collection(collection).doc(id).get()
          before = Array.isArray(beforeResult.data) ? beforeResult.data[0] : beforeResult.data
          const after = { ...(before || {}), ...data }
          if (!assistanceRecordAllowed(collection, before, assistanceScope) ||
              !assistanceRecordAllowed(collection, after, assistanceScope)) {
            return { success: false, error: '该资料不在用户授权范围内' }
          }
        }
        if (organizerScope) {
          const beforeResult = await db.collection(collection).doc(id).get()
          before = Array.isArray(beforeResult.data) ? beforeResult.data[0] : beforeResult.data
          if (!organizerRecordAllowed(collection, before, organizerScope)) {
            return { success: false, error: '无权修改其他账号的资料' }
          }
          nextUpdateData = sanitizeOrganizerUpdate(data)
          const after = { ...(before || {}), ...nextUpdateData }
          if (!organizerRelationAllowed(collection, after, organizerScope)) {
            return { success: false, error: '不能把资料关联到其他账号的数据' }
          }
        }
        await db.collection(collection).doc(id).update({ data: nextUpdateData })
        if (assistanceScope) {
          await writeAssistanceAudit(
            db, assistanceScope, authenticated.userId, 'update', collection, id, before, { ...(before || {}), ...data }
          )
        }
        return { success: true, message: '更新成功' }
      }
      case 'delete': {
        if (!id) return { success: false, error: '缺少记录 ID' }
        if (assistanceScope) return { success: false, error: '本次协助未开放删除权限' }
        if (organizerScope) {
          const beforeResult = await db.collection(collection).doc(id).get()
          const before = Array.isArray(beforeResult.data) ? beforeResult.data[0] : beforeResult.data
          if (!organizerRecordAllowed(collection, before, organizerScope)) {
            return { success: false, error: '无权删除其他账号的资料' }
          }
        }
        await db.collection(collection).doc(id).remove()
        return { success: true, deleted: 1, message: '删除成功' }
      }
      default:
        return { success: false, error: '不支持的操作: ' + operation + '（支持 list/get/count/add/update/delete）' }
    }
  } catch (err) {
    console.error('[webApi] dbQuery', operation, 'error:', err.message || err)
    return { success: false, error: err.message || ('数据库操作失败: ' + operation) }
  }
}

// ========== 主入口（支持 HTTP 触发器和 SDK 调用两种方式）==========
exports.main = async (event, context) => {
  // CORS：设置响应头（HTTP 触发器模式需要）
  const response = (statusCode, body) => ({
    statusCode,
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json; charset=utf-8' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    isBase64Encoded: false
  })

  // 处理 OPTIONS 预检请求
  if (event.httpMethod === 'OPTIONS') {
    return response(200, '')
  }

  // 从 HTTP 请求体或 SDK 调用中提取参数
  let params = event
  if (event.body) {
    try { params = JSON.parse(event.body) } catch(e) { params = event }
  }

  const action = params.action
  console.log('[webApi] action:', action, 'params keys:', Object.keys(params))

  try {
    let result
    switch (action) {
      case 'sendSms':
      case 'verifySmsCode':
      case 'passwordLogin':
      case 'emailSendCode':
      case 'emailVerifyCode':
      case 'emailSetRole':
      case 'emailSetPassword':
      case 'emailBindEmail':
        result = { success: false, error: '当前仅支持微信扫码登录' }; break
      case 'wechatWebLogin':
        result = await handleWechatOnlyLogin(params)
        if (result && result.success && result.user && result.user._id) {
          result.authToken = await createWebSession(result.user._id)
          result.authExpiresAt = new Date(Date.now() + WEB_SESSION_TTL_MS)
        }
        break
      case 'checkLogin': {
        const auth = await authenticateWebSession(params)
        result = auth.success
          ? { success: true, loggedIn: true, user: { _id: auth.user._id, role: auth.user.role || ORGANIZER_ROLE } }
          : { success: false, loggedIn: false, error: auth.error, code: auth.code }
        break
      }
      case 'dbQuery':
        result = await handleDbQuery(params); break
      case 'callFunction':
        result = await handleCallFunction(params); break
      case 'uploadImage':
        result = await handleUploadImage(params); break
      case 'uploadToCosDirect':
        result = await handleUploadToCosDirect(event, params); break
      default:
        result = { success: false, error: '未知操作：' + action }
    }

    // 如果是 HTTP 请求，返回带 status 的响应；如果是 SDK 调用，直接返回数据
    if (event.httpMethod) {
      return response(200, result)
    }
    return result
  } catch (err) {
    console.error('[webApi] error:', err)
    const errorResult = { success: false, error: err.message || '服务器错误' }
    if (event.httpMethod) return response(500, errorResult)
    return errorResult
  }
}
