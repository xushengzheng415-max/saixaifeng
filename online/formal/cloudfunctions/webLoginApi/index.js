const { createBaiduPlayerFace } = require('./baiduPlayerFace.cjs')
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

const fs = require('fs')
const path = require('path')
const os = require('os')
const cloud = require('wx-server-sdk')
const staffPolicy = require('./staffPolicy.cjs')
const staffDbRights = require('./staffDbRights.cjs')
const { staffWriteReferencesAllowed } = require('./staffWriteReferences.cjs')
const { staffUploadRight } = require('./staffUploadRights.cjs')
const { buildStaffEventScope, recordBelongsToStaffEvent, readScopedRows: readStaffRows } = require('./staffEventScope.cjs')
const { relayRights } = require('./staffRelayRights.cjs')
const { validateStaffRelayScope } = require('./staffRelayScope.cjs')
const { projectStaffRead } = require('./staffReadProjection.cjs')
const { chooseOrganizerOrganization, grantsEventAccess } = require('./organizationScope.cjs')
const https = require('https')
const crypto = require('crypto')
const nodemailer = require('nodemailer')
const { createPlayerCards } = require('./playerCards.cjs')
function fanCenterHandlers() {
  return require('./fanCenter.cjs')({ cloud, crypto, SERVICE_ACCOUNT_CONFIG, normalizeServiceH5Url, hashSessionToken, dateValue, httpsGet, getPublicTournamentCenter })
}

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })
const baiduPlayerFace = createBaiduPlayerFace({ cloud })

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

// 服务号裁判工作台使用独立 AppID/OpenID，不能与 PC 扫码登录或小程序 OpenID 混用。
const SERVICE_ACCOUNT_CONFIG = {
  APP_ID: process.env.SERVICE_ACCOUNT_APP_ID || '',
  APP_SECRET: process.env.SERVICE_ACCOUNT_APP_SECRET || '',
  // 足球裁判服务固定回到足球正式域名。不能复用篮球/旧官网的环境变量，
  // 否则微信授权完成后会落入 saixiaofeng.com 的 404 页面。
  H5_URL: 'https://www.sxffootball.cn/service-account-h5/'
}

function identityFeatureKey() {
  const raw = String(process.env.SXF_IDENTITY_FEATURE_KEY || '').trim()
  if (!raw) return null
  return crypto.createHash('sha256').update(raw).digest()
}

function encryptIdentityFeature(descriptor) {
  const key = identityFeatureKey()
  if (!key || !Array.isArray(descriptor) || descriptor.length !== 128) return null
  const safe = descriptor.map(value => Number(Number(value || 0).toFixed(7)))
  if (safe.some(value => !Number.isFinite(value) || Math.abs(value) > 4)) return null
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(safe), 'utf8'), cipher.final()])
  return { version:1, algorithm:'aes-256-gcm', iv:iv.toString('base64'), tag:cipher.getAuthTag().toString('base64'), data:encrypted.toString('base64') }
}

async function ensureIdentityCollections(db) {
  for (const name of ['player_identity_profiles', 'identity_verification_attempts', 'identity_manual_reviews', 'sensitive_file_deletion_tasks', 'player_electronic_passes']) {
    try { await db.createCollection(name) } catch (error) {
      if (!/exist|already|duplicate/i.test(String(error && error.message || ''))) console.warn('[identity] collection prepare skipped:', name, error.message || error)
    }
  }
}

const PARENT_PROFILE_REVIEW_SUBSCRIBE_TEMPLATE_ID = String(process.env.SXF_FOOTBALL_SERVICE_PARENT_PROFILE_REVIEW_TEMPLATE_ID || 'wx5nOaRkbHMb97LTkTA95ShbEIZhVILIgapcU9VDBqk').trim()
let serviceAccountAccessTokenCache = null
let serviceAccountJsApiTicketCache = null

function identityFeatureKey() {
  const raw = String(process.env.SXF_IDENTITY_FEATURE_KEY || '').trim()
  if (!raw) return null
  return crypto.createHash('sha256').update(raw).digest()
}

function encryptIdentityFeature(descriptor) {
  const key = identityFeatureKey()
  if (!key || !Array.isArray(descriptor) || descriptor.length !== 128) return null
  const safe = descriptor.map(value => Number(Number(value || 0).toFixed(7)))
  if (safe.some(value => !Number.isFinite(value) || Math.abs(value) > 4)) return null
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(safe), 'utf8'), cipher.final()])
  return { version:1, algorithm:'aes-256-gcm', iv:iv.toString('base64'), tag:cipher.getAuthTag().toString('base64'), data:encrypted.toString('base64') }
}

async function ensureIdentityCollections(db) {
  for (const name of ['player_identity_profiles', 'identity_verification_attempts', 'identity_manual_reviews', 'sensitive_file_deletion_tasks', 'player_electronic_passes']) {
    try { await db.createCollection(name) } catch (error) {
      if (!/exist|already|duplicate/i.test(String(error && error.message || ''))) console.warn('[identity] collection prepare skipped:', name, error.message || error)
    }
  }
}

const WEB_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const WEB_LOGIN_CHALLENGE_TTL_MS = 10 * 60 * 1000
const REFEREE_H5_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const REFEREE_OAUTH_STATE_TTL_MS = 10 * 60 * 1000
const ASSISTANCE_COLLECTIONS = new Set([
  'teams', 'players', 'player_library', 'coaches',
  'tournaments', 'matches', 'tournament_teams', 'rosters', 'roster_change_requests'
])

// 普通主办方工作台只允许访问明确列出的机构私有业务集合。
// orgId 是租户边界；creatorId 只记录具体创建人，不能代替租户边界。
const ORGANIZER_PRIVATE_COLLECTIONS = new Set([
  'tournaments', 'teams', 'players', 'coaches', 'management',
  'player_library', 'coach_library', 'referees', 'referee_invitations',
  'registration_player_drafts',
  'matches', 'match_events', 'match_referees', 'tournament_referees',
  'tournament_teams', 'tournament_groups', 'tournament_bracket',
  'tournament_league_tables', 'rosters', 'roster_change_requests',
  'squads', 'standings', 'schedule_info', 'team_tasks', 'divisions'
])

const ORGANIZER_SCOPED_RELAY_FUNCTIONS = new Set([
  'generateSchedule', 'updateMatch', 'onboardingWorkspace', 'organizerClaimInvite',
  'reviewRosterChange', 'clearTeamPlayers', 'tournamentReview', 'applyTournament', 'getMyTeams',
  'setHeadReferee', 'tournamentRegistrationFlow', 'resultCenter', 'newsCenter'
])

// 这些中转入口会消耗第三方 AI/微信能力，或读取受保护的球员/比赛数据。
// 即使当前调用不写入数据库，也必须先通过网页会话，不能把 relay 当作匿名代理。
const SESSION_REQUIRED_RELAY_FUNCTIONS = new Set([
  'tournamentStaffAccess',
  'dataCenter',
  'generatePlayerCard', 'generateQRCode', 'removeImageBg', 'baiduRemoveBg',
  'generateAIImage',
  'getRegulations',
  'reviewRosterChange',
  'parseTournamentRegulations', 'saveSignature', 'getSignatureStatus',
  'updateMatchSignature', 'updateMatchLineup', 'applyTournament',
  'tournamentReview', 'getMyTeams', 'bindPhone'
])

// 这些入口会直接创建或修改赛事业务数据。没有已确认的机构租户时，
// 只能先完成机构引导，不能再用个人账号作为隐含租户继续写入。
const ORGANIZER_REQUIRED_RELAY_FUNCTIONS = new Set([
  'generateSchedule', 'updateMatch', 'organizerClaimInvite', 'reviewRosterChange', 'clearTeamPlayers', 'tournamentReview', 'applyTournament', 'getMyTeams',
  'setHeadReferee', 'tournamentRegistrationFlow', 'resultCenter', 'newsCenter'
])
const PERSONAL_SERVICE_BINDING_ACTIONS = new Set(['createOrganizerServiceGate', 'getOrganizerServiceBindingStatus'])

// 赛事中心遗留的球队/球员/赛事入口统一收敛到本函数的租户校验，
// 不再把未鉴权的旧云函数直接暴露给网页 relay。
const LEGACY_ORGANIZER_FUNCTIONS = new Set([
  'getTeams', 'getPlayers', 'getTournaments',
  'createTeam', 'updateTeam', 'deleteTeam',
  'createPlayer', 'updatePlayer', 'deletePlayer'
])
LEGACY_ORGANIZER_FUNCTIONS.forEach(function (name) {
  ORGANIZER_SCOPED_RELAY_FUNCTIONS.add(name)
})
;['createTeam', 'updateTeam', 'deleteTeam', 'createPlayer', 'updatePlayer', 'deletePlayer'].forEach(function (name) {
  ORGANIZER_REQUIRED_RELAY_FUNCTIONS.add(name)
})

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

function createWebLoginChallenge(payload) {
  const body = Buffer.from(JSON.stringify({
    wechatOpenId: String(payload.wechatOpenId || ''),
    unionId: String(payload.unionId || ''),
    nickname: String(payload.nickname || '微信用户').slice(0, 80),
    headimgurl: String(payload.headimgurl || '').slice(0, 500),
    nonce: crypto.randomBytes(16).toString('hex'),
    expiresAt: Date.now() + WEB_LOGIN_CHALLENGE_TTL_MS
  })).toString('base64url')
  const signature = crypto.createHmac('sha256', WECHAT_CONFIG.APP_SECRET).update(body).digest('base64url')
  return body + '.' + signature
}

function verifyWebLoginChallenge(token) {
  try {
    const parts = String(token || '').split('.')
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null
    const expected = crypto.createHmac('sha256', WECHAT_CONFIG.APP_SECRET).update(parts[0]).digest()
    const actual = Buffer.from(parts[1], 'base64url')
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
    if (!payload.wechatOpenId || Number(payload.expiresAt || 0) <= Date.now()) return null
    return payload
  } catch (error) {
    return null
  }
}

async function createWebSession(userId, channel = 'wechat_web') {
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
      channel,
      expiresAt: new Date(Date.now() + WEB_SESSION_TTL_MS),
      createTime: db.serverDate(),
      lastUsedAt: db.serverDate()
    }
  })
  return token
}

async function createPlatformWebSession() {
  const db = cloud.database()
  const token = crypto.randomBytes(32).toString('hex')
  await db.collection('auth_sessions').add({
    data: {
      tokenHash: hashSessionToken(token),
      userId: '',
      principalType: 'platform_owner',
      active: true,
      channel: 'platform_password',
      expiresAt: new Date(Date.now() + WEB_SESSION_TTL_MS),
      createTime: db.serverDate(),
      lastUsedAt: db.serverDate()
    }
  })
  return token
}

function normalizeServiceH5Url(value) {
  const url = String(value || '').trim()
  if (!/^https:\/\//i.test(url)) return ''
  return url.split('#')[0]
}

function refereeOAuthReturnUrl(value) {
  const url=normalizeServiceH5Url(value)
  if(!url)return ''
  try {
    const parsed=new URL(url)
    if(parsed.hostname!=='www.sxffootball.cn')return ''
    if(!['/service-account-h5/','/preview/service-account-h5/'].includes(parsed.pathname))return ''
    return parsed.origin+parsed.pathname
  } catch (error) { return '' }
}

async function createRefereeOAuthUrl(returnUrl) {
  const redirectUri = refereeOAuthReturnUrl(returnUrl) || normalizeServiceH5Url(SERVICE_ACCOUNT_CONFIG.H5_URL)
  if (!SERVICE_ACCOUNT_CONFIG.APP_ID || !SERVICE_ACCOUNT_CONFIG.APP_SECRET || !redirectUri) {
    return { success: false, error: '服务号网页授权尚未配置，请联系主办方', code: 'SERVICE_ACCOUNT_NOT_CONFIGURED' }
  }
  const db = cloud.database()
  const state = crypto.randomBytes(20).toString('hex')
  await db.collection('referee_oauth_states').doc(state).set({
    data: {
      state,
      redirectUri,
      used: false,
      expiresAt: new Date(Date.now() + REFEREE_OAUTH_STATE_TTL_MS),
      createTime: db.serverDate()
    }
  })
  const authorizeUrl = 'https://open.weixin.qq.com/connect/oauth2/authorize?appid=' +
    encodeURIComponent(SERVICE_ACCOUNT_CONFIG.APP_ID) + '&redirect_uri=' +
    encodeURIComponent(redirectUri) + '&response_type=code&scope=snsapi_base&state=' +
    encodeURIComponent(state) + '#wechat_redirect'
  return { success: true, authorizeUrl }
}

async function createRefereeH5Session(serviceAccountOpenId, unionId) {
  const db = cloud.database()
  const workflowOpenId = 'service:' + serviceAccountOpenId
  const identityResult = await db.collection('service_identities')
    .where({ serviceAccountOpenId }).limit(2).get()
  const identities = identityResult.data || []
  if (identities.length > 1) throw new Error('服务号微信身份存在重复记录，请联系管理员处理')
  if (identities.length === 1) {
    await db.collection('service_identities').doc(identities[0]._id).update({
      data: {
        serviceWorkflowOpenId: workflowOpenId,
        unionId: unionId || identities[0].unionId || '',
        source: 'service_account_h5',
        updateTime: db.serverDate()
      }
    })
  } else {
    await db.collection('service_identities').add({
      data: {
        serviceWorkflowOpenId: workflowOpenId,
        serviceAccountOpenId,
        unionId: unionId || '',
        source: 'service_account_h5',
        phoneVerified: false,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })
  }
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + REFEREE_H5_SESSION_TTL_MS)
  await db.collection('referee_h5_sessions').add({
    data: {
      tokenHash: hashSessionToken(token),
      workflowOpenId,
      serviceAccountOpenId,
      active: true,
      expiresAt,
      createTime: db.serverDate(),
      lastUsedAt: db.serverDate()
    }
  })
  return { token, expiresAt }
}

async function handleRefereeOAuth(event) {
  const code = String(event.code || '').trim()
  const state = String(event.state || '').trim()
  if (!code || !state) return { success: false, error: '微信授权参数不完整，请重新进入工作台' }
  if (!SERVICE_ACCOUNT_CONFIG.APP_ID || !SERVICE_ACCOUNT_CONFIG.APP_SECRET) {
    return { success: false, error: '服务号网页授权尚未配置，请联系主办方' }
  }
  const db = cloud.database()
  const stateResult = await db.collection('referee_oauth_states').doc(state).get()
  const stateRecord = Array.isArray(stateResult.data) ? stateResult.data[0] : stateResult.data
  if (!stateRecord || stateRecord.used || dateValue(stateRecord.expiresAt) <= Date.now()) {
    return { success: false, error: '微信授权已过期，请重新进入工作台' }
  }
  await db.collection('referee_oauth_states').doc(state).update({
    data: { used: true, usedAt: db.serverDate() }
  })
  const tokenUrl = 'https://api.weixin.qq.com/sns/oauth2/access_token?appid=' +
    encodeURIComponent(SERVICE_ACCOUNT_CONFIG.APP_ID) + '&secret=' +
    encodeURIComponent(SERVICE_ACCOUNT_CONFIG.APP_SECRET) + '&code=' +
    encodeURIComponent(code) + '&grant_type=authorization_code'
  const oauth = await httpsGet(tokenUrl)
  if (!oauth || !oauth.openid || oauth.errcode) {
    console.error('[webApi] referee oauth failed:', oauth && oauth.errcode, oauth && oauth.errmsg)
    return { success: false, error: '微信授权失败，请重新进入工作台' }
  }
  const session = await createRefereeH5Session(oauth.openid, oauth.unionid || '')
  return {
    success: true,
    refereeSessionToken: session.token,
    expiresAt: session.expiresAt
  }
}

const REFEREE_WORKFLOW_ACTIONS = new Set([
  'getWorkbench', 'sendBindSms', 'verifyBindSms', 'getRefereeInvitation', 'recognizeRefereeCertificate', 'processRefereeAvatar', 'acceptRefereeInvitation', 'getRefereeMatch',
  'getHeadRefereeSchedule', 'assignHeadRefereeCrew',
  'updatePreMatchState',
  'reviewLineup',
  'saveRefereeReportDraft',
  'submitSignedRefereeRecord',
  'saveReturnedRecordCorrection', 'resubmitReturnedRecord',
  'startRefereeMatch', 'controlRefereeClock', 'finishRefereeMatch', 'addRefereeEvent',
  'deleteRefereeEvent', 'submitRefereeReport', 'recognizeRefereeRoster', 'saveRefereeRoster'
])

async function handleRefereeWorkflow(event) {
  const workflowAction = String(event.workflowAction || '').trim()
  const refereeSessionToken = String(event.refereeSessionToken || '').trim()
  if (!REFEREE_WORKFLOW_ACTIONS.has(workflowAction)) {
    return { success: false, message: '不支持的裁判工作台操作', code: 'ACTION_NOT_SUPPORTED' }
  }
  if (!refereeSessionToken) {
    return { success: false, message: '服务号登录状态已失效，请重新进入工作台', code: 'H5_AUTH_REQUIRED' }
  }
  const payload = { ...event, action: workflowAction, __refereeSessionToken: refereeSessionToken }
  delete payload.workflowAction
  delete payload.refereeSessionToken
  const result = await cloud.callFunction({ name: 'serviceMatchWorkflow', data: payload })
  const workflowResult = result && result.result
  if (workflowResult && workflowResult.__notificationRelay && workflowResult.__notificationRelay.phone) {
    const notification = workflowResult.__notificationRelay
    const relayTimestamp = Date.now()
    try {
      await cloud.callFunction({ name:'sendRefereeTemplateMessages',data:{ phone:notification.phone,notificationId:notification.notificationId,__relayTimestamp:relayTimestamp,__relaySignature:createRefereeNotificationRelayProof(notification.phone,relayTimestamp) } })
    } catch (error) {
      console.warn('[webApi] referee workflow notification failed:', error.message)
    }
    delete workflowResult.__notificationRelay
  }
  if (workflowAction === 'verifyBindSms' && workflowResult && workflowResult.success) {
    try {
      const relayPhone = String(event.phone || '').replace(/\D/g, '').slice(-11)
      const relayTimestamp = Date.now()
      await cloud.callFunction({
        name: 'sendRefereeTemplateMessages',
        data: {
          phone: relayPhone,
          __relayTimestamp: relayTimestamp,
          __relaySignature: createRefereeNotificationRelayProof(relayPhone, relayTimestamp)
        }
      })
    } catch (error) {
      console.warn('[webApi] pending referee notifications failed:', error.message)
    }
  }
  return workflowResult
    ? workflowResult
    : { success: false, message: '裁判工作台服务暂不可用', code: 'WORKFLOW_UNAVAILABLE' }
}

function maskServicePhone(value) {
  const phone = String(value || '').replace(/\D/g, '')
  return phone.length === 11 ? phone.slice(0, 3) + ' **** ' + phone.slice(-4) : ''
}

function parentAgeOnReferenceDate(birthDate, referenceDate) {
  const match = String(birthDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const reference = referenceDate ? new Date(referenceDate) : new Date()
  if (!match || Number.isNaN(reference.getTime())) return null
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  let age = reference.getFullYear() - year
  if (reference.getMonth() + 1 < month || (reference.getMonth() + 1 === month && reference.getDate() < day)) age -= 1
  return age >= 0 ? age : null
}

function resolveParentRegistrantType(invite, player) {
  const explicit = String((invite && invite.registrantType) || (player && (player.registrantType || player.applicantRole)) || '')
  if (explicit === 'self' || explicit === 'player') return 'self'
  if (explicit === 'guardian') return 'guardian'
  const age = parentAgeOnReferenceDate(player && (player.birthDate || player.birthday), invite && invite.referenceDate)
  return age !== null && age >= 18 ? 'self' : 'guardian'
}

function parentDraftIsAuthorized(draft) {
  return Boolean(draft && draft.basicConfirmed === true && (draft.registrantAuthorized === true || draft.guardianAuthorized === true || draft.selfAuthorized === true))
}

function createRefereeNotificationRelayProof(phone, timestamp) {
  const normalizedPhone = String(phone || '').replace(/\D/g, '').slice(-11)
  const normalizedTimestamp = String(timestamp || '')
  if (!SERVICE_ACCOUNT_CONFIG.APP_SECRET || !normalizedPhone || !normalizedTimestamp) return ''
  return crypto.createHmac('sha256', SERVICE_ACCOUNT_CONFIG.APP_SECRET)
    .update(normalizedPhone + '.' + normalizedTimestamp)
    .digest('hex')
}

function resolveParentInviteRequirements(invite, player) {
  const sources = [invite, player]
  const identity = readRosterBoolean(sources, ['identityVerificationRequired', 'requiresRealName', 'requireRealName'])
  const portrait = readRosterBoolean(sources, ['portraitRequired', 'requiresPortrait', 'requirePortrait'])
  const parent = readRosterBoolean([invite], ['parentSupplementRequired', 'parentProfileRequired', 'parentCompletionRequired'])
  const standardFlow = invite.standardProfileFlow === true || player.standardProfileFlow === true || String(player.source || '') === 'team_player_invite'
  const registrantType = resolveParentRegistrantType(invite, player)
  return {
    registrantAuthorization: true,
    guardianAuthorization: registrantType === 'guardian',
    parentSupplementRequired: parent.defined ? parent.value : true,
    parentSupplementConfigured: true,
    identityVerificationRequired: identity.defined ? identity.value : standardFlow,
    portraitRequired: portrait.defined ? portrait.value : standardFlow,
    realName: identity.defined ? identity.value : standardFlow,
    portrait: portrait.defined ? portrait.value : standardFlow,
    source: standardFlow ? 'standard-player-onboarding' : (identity.defined || portrait.defined || parent.defined ? 'invite-or-player' : 'invite')
  }
}

async function resolveReusableRegistrationIdentity(db, player) {
  if (!player || String(player.profileStatus || '') !== 'complete' || String(player.parentProfileSubmissionStatus || '') !== 'submitted') return null
  const rows = (await db.collection('player_identity_profiles').where({ playerId: String(player._id) }).limit(2).get()).data || []
  if (rows.length !== 1) return null
  const profile = rows[0]
  if (!['verified', 'manual_required'].includes(String(profile.status || '')) || !profile.verificationId || profile.revokedAt) return null
  const proofs = (await db.collection('parent_identity_verifications').where({ _id: String(profile.verificationId), status: 'approved' }).limit(1).get()).data || []
  const proof = proofs[0]
  if (!proof || proof.revokedAt || !proof.parentInvite) return null
  const invites = (await db.collection('parent_profile_invites').where({ token: proof.parentInvite, playerId: String(player._id) }).limit(2).get()).data || []
  if (invites.length !== 1) return null
  const drafts = (await db.collection('parent_profile_drafts').where({ parentInvite: proof.parentInvite, basicConfirmed: true }).limit(2).get()).data || []
  if (drafts.length !== 1 || !parentDraftIsAuthorized(drafts[0]) || drafts[0].needsManualReview) return null
  if (String(drafts[0].requestedName || '') !== String(player.name || '') || String(drafts[0].requestedBirthDate || '') !== String(player.birthDate || player.birthday || '')) return null
  return proof
}

async function previewParentProfileInvite(event) {
  const token = String(event.parentInvite || '').trim()
  if (!/^pp_[a-z0-9]+$/i.test(token)) return { success: false, error: '球员资料邀请无效或已失效', code: 'PARENT_INVITE_INVALID' }
  const db = cloud.database()
  const inviteResult = await db.collection('parent_profile_invites').where({ token, status: 'active' }).limit(2).get()
  const invites = inviteResult.data || []
  if (invites.length !== 1) return { success: false, error: '球员资料邀请无效或已失效', code: 'PARENT_INVITE_INVALID' }
  const invite = invites[0]
  if (invite.expiresAt && dateValue(invite.expiresAt) <= Date.now()) return { success: false, error: '球员资料邀请已过期，请联系球队重新生成', code: 'PARENT_INVITE_EXPIRED' }
  const playerResult = await db.collection('players').doc(invite.playerId).get()
  const teamResult = await db.collection('teams').doc(invite.teamId).get()
  const player = Array.isArray(playerResult.data) ? playerResult.data[0] : playerResult.data
  const team = Array.isArray(teamResult.data) ? teamResult.data[0] : teamResult.data
  if (!player || !team || String(player.teamId || '') !== String(invite.teamId || '')) return { success: false, error: '邀请关联资料不存在，请联系球队管理员', code: 'PARENT_INVITE_BROKEN' }
  const registrantType = resolveParentRegistrantType(invite, player)
  const phone = registrantType === 'self' ? (player.playerPhone || player.contactPhone || invite.registrantPhone) : (player.guardianPhone || player.contactPhone || invite.guardianPhone || invite.registrantPhone)
  const requirements = resolveParentInviteRequirements(invite, player)
  if (requirements.realName && await resolveReusableRegistrationIdentity(db, player)) {
    requirements.realName = false
    requirements.identityVerificationRequired = false
    requirements.identityAlreadyVerified = true
    requirements.source = 'approved-stable-player-identity'
  }
  return { success: true, data: { playerName: String(player.name || '球员'), birthDate: String(player.birthDate || player.birthday || ''), teamName: String(team.name || team.teamName || ''), registrantMode: 'age_based', registrantType, registrantLabel: registrantType === 'self' ? '球员本人' : '家长或监护人', isSelfRegistration: registrantType === 'self', accountPhoneMasked: maskServicePhone(phone), guardianPhoneMasked: registrantType === 'guardian' ? maskServicePhone(phone) : '', requirements, status: String(player.profileStatus || 'pending') } }
}

async function createParentProfileOAuthUrl(event) {
  const parentInvite = String(event.parentInvite || '').trim()
  const preview = await previewParentProfileInvite({ parentInvite })
  if (!preview.success) return preview
  const redirectUri = normalizeServiceH5Url(SERVICE_ACCOUNT_CONFIG.H5_URL)
  if (!SERVICE_ACCOUNT_CONFIG.APP_ID || !SERVICE_ACCOUNT_CONFIG.APP_SECRET || !redirectUri) return { success: false, error: '服务号网页授权尚未配置，请联系球队管理员', code: 'SERVICE_ACCOUNT_NOT_CONFIGURED' }
  const db = cloud.database(), state = crypto.randomBytes(20).toString('hex')
  await db.collection('parent_oauth_states').doc(state).set({ data: { state, parentInvite, redirectUri, used: false, expiresAt: new Date(Date.now() + REFEREE_OAUTH_STATE_TTL_MS), createTime: db.serverDate() } })
  return { success: true, authorizeUrl: 'https://open.weixin.qq.com/connect/oauth2/authorize?appid=' + encodeURIComponent(SERVICE_ACCOUNT_CONFIG.APP_ID) + '&redirect_uri=' + encodeURIComponent(redirectUri) + '&response_type=code&scope=snsapi_base&state=' + encodeURIComponent(state) + '#wechat_redirect' }
}

async function handleParentProfileOAuth(event) {
  const code = String(event.code || '').trim(), state = String(event.state || '').trim()
  if (!code || !state) return { success: false, error: '服务号授权参数不完整，请重新打开邀请' }
  if (!SERVICE_ACCOUNT_CONFIG.APP_ID || !SERVICE_ACCOUNT_CONFIG.APP_SECRET) return { success: false, error: '服务号网页授权尚未配置，请联系球队管理员' }
  const db = cloud.database(), result = await db.collection('parent_oauth_states').doc(state).get(), record = Array.isArray(result.data) ? result.data[0] : result.data
  if (!record || record.used || dateValue(record.expiresAt) <= Date.now()) return { success: false, error: '服务号授权已过期，请重新打开邀请' }
  const preview = await previewParentProfileInvite({ parentInvite: record.parentInvite })
  if (!preview.success) return preview
  await db.collection('parent_oauth_states').doc(state).update({ data: { used: true, usedAt: db.serverDate() } })
  const tokenUrl = 'https://api.weixin.qq.com/sns/oauth2/access_token?appid=' + encodeURIComponent(SERVICE_ACCOUNT_CONFIG.APP_ID) + '&secret=' + encodeURIComponent(SERVICE_ACCOUNT_CONFIG.APP_SECRET) + '&code=' + encodeURIComponent(code) + '&grant_type=authorization_code'
  const oauth = await httpsGet(tokenUrl)
  if (!oauth || !oauth.openid || oauth.errcode) return { success: false, error: '服务号授权失败，请重新打开邀请' }
  const serviceFirstInvites = (await db.collection('parent_profile_invites').where({ token: record.parentInvite, status: 'active', serviceFirst: true }).limit(2).get()).data || []
  if (serviceFirstInvites.length) {
    const serviceInvite = serviceFirstInvites[0]
    if (serviceFirstInvites.length !== 1 || String(serviceInvite.serviceAccountOpenId || '') !== String(oauth.openid)) return { success: false, error: '请使用扫码关注服务号的同一微信继续登记' }
    const bindings = (await db.collection('service_account_bindings').where({ sport: 'football', userId: String(serviceInvite.registrantUserId || ''), officialOpenId: String(oauth.openid), subscribed: true }).limit(2).get()).data || []
    if (!bindings.length) return { success: false, error: '服务号关注状态已变化，请重新扫码' }
  }
  const sessionToken = crypto.randomBytes(32).toString('hex')
  await db.collection('parent_h5_sessions').add({ data: { tokenHash: hashSessionToken(sessionToken), parentInvite: record.parentInvite, serviceAccountOpenId: oauth.openid, unionId: oauth.unionid || '', active: true, expiresAt: new Date(Date.now() + REFEREE_H5_SESSION_TTL_MS), createTime: db.serverDate(), lastUsedAt: db.serverDate() } })
  return { success: true, parentSessionToken: sessionToken, parentInvite: record.parentInvite, expiresAt: new Date(Date.now() + REFEREE_H5_SESSION_TTL_MS) }
}

async function createParentProfileReviewSubscribeOAuthUrl(event) {
  const subscriptionIntent=String(event.subscriptionIntent||'').trim()
  if(!subscriptionIntent)return{success:false,error:'订阅入口已失效，请返回球队页面重新打开'}
  const db=cloud.database(),tokenHash=crypto.createHash('sha256').update(subscriptionIntent).digest('hex')
  const intents=(await db.collection('parent_profile_review_subscription_intents').where({tokenHash,status:'issued'}).limit(2).get()).data||[],intent=intents[0]
  if(intents.length!==1||!intent||dateValue(intent.expiresAt)<=Date.now())return{success:false,error:'订阅入口已过期，请返回球队页面重新打开',code:'PARENT_REVIEW_SUBSCRIPTION_EXPIRED'}
  const parentInvite=String(intent.parentInvite||''),preview=await previewParentProfileInvite({parentInvite})
  if(!preview.success)return preview
  if(!preview.data.requirements.realName)return{success:false,error:'本次登记不需要球员资料审核通知',code:'PARENT_IDENTITY_NOT_REQUIRED'}
  const inviteRows=(await db.collection('parent_profile_invites').where({token:parentInvite,status:'active'}).limit(2).get()).data||[]
  if(inviteRows.length!==1||String(inviteRows[0].teamId||'')!==String(intent.teamId||'')||String(inviteRows[0].playerId||'')!==String(intent.playerId||''))return{success:false,error:'球队邀请状态已变化，请重新打开订阅入口'}
  if(!SERVICE_ACCOUNT_CONFIG.APP_ID||!SERVICE_ACCOUNT_CONFIG.APP_SECRET)return{success:false,error:'服务号网页授权尚未配置',code:'SERVICE_ACCOUNT_NOT_CONFIGURED'}
  const returnUrl=SERVICE_ACCOUNT_CONFIG.H5_URL+'subscribe-review.html?subscriptionIntent='+encodeURIComponent(subscriptionIntent)
  const state=crypto.randomBytes(20).toString('hex')
  try{await db.createCollection('parent_profile_review_subscription_states')}catch(error){if(!/exist|already|duplicate/i.test(String(error&&error.message||'')))console.warn('[parentReviewSubscribe] state collection prepare skipped:',error.message||error)}
  await db.collection('parent_profile_review_subscription_states').doc(state).set({data:{state,subscriptionIntentId:String(intent._id),parentInvite,creatorUserId:String(intent.creatorUserId),creatorMiniOpenId:String(intent.creatorMiniOpenId||''),teamId:String(intent.teamId||''),playerId:String(intent.playerId||''),returnUrl,status:'oauth_pending',expiresAt:new Date(Date.now()+10*60*1000),createTime:db.serverDate(),updateTime:db.serverDate()}})
  const authorizeUrl='https://open.weixin.qq.com/connect/oauth2/authorize?appid='+encodeURIComponent(SERVICE_ACCOUNT_CONFIG.APP_ID)+'&redirect_uri='+encodeURIComponent(returnUrl)+'&response_type=code&scope=snsapi_base&state='+encodeURIComponent(state)+'#wechat_redirect'
  return{success:true,authorizeUrl}
}

async function officialAccountAccessToken() {
  if(serviceAccountAccessTokenCache&&serviceAccountAccessTokenCache.expiresAt>Date.now()+120000)return serviceAccountAccessTokenCache.value
  if(!SERVICE_ACCOUNT_CONFIG.APP_ID||!SERVICE_ACCOUNT_CONFIG.APP_SECRET)throw Object.assign(new Error('服务号凭据尚未配置'),{code:'SERVICE_ACCOUNT_NOT_CONFIGURED'})
  const result=await httpsGet('https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid='+encodeURIComponent(SERVICE_ACCOUNT_CONFIG.APP_ID)+'&secret='+encodeURIComponent(SERVICE_ACCOUNT_CONFIG.APP_SECRET))
  if(!result||!result.access_token)throw Object.assign(new Error('获取服务号接口凭据失败'),{code:String(result&&result.errcode||'SERVICE_ACCESS_TOKEN_FAILED')})
  serviceAccountAccessTokenCache={value:result.access_token,expiresAt:Date.now()+Math.max(300,Number(result.expires_in||7200)-300)*1000}
  return serviceAccountAccessTokenCache.value
}

async function officialAccountJsApiTicket() {
  if(serviceAccountJsApiTicketCache&&serviceAccountJsApiTicketCache.expiresAt>Date.now()+120000)return serviceAccountJsApiTicketCache.value
  const token=await officialAccountAccessToken(),result=await httpsGet('https://api.weixin.qq.com/cgi-bin/ticket/getticket?access_token='+encodeURIComponent(token)+'&type=jsapi')
  if(!result||Number(result.errcode||0)!==0||!result.ticket)throw Object.assign(new Error('获取服务号网页签名票据失败'),{code:String(result&&result.errcode||'SERVICE_JSAPI_TICKET_FAILED')})
  serviceAccountJsApiTicketCache={value:result.ticket,expiresAt:Date.now()+Math.max(300,Number(result.expires_in||7200)-300)*1000}
  return serviceAccountJsApiTicketCache.value
}

async function completeParentProfileReviewSubscribeOAuth(event) {
  const code=String(event.code||'').trim(),state=String(event.state||'').trim()
  if(!code||!state)return{success:false,error:'服务号授权参数不完整，请重新打开订阅入口'}
  const db=cloud.database(),stateResult=await db.collection('parent_profile_review_subscription_states').doc(state).get(),record=Array.isArray(stateResult.data)?stateResult.data[0]:stateResult.data
  if(!record||record.status!=='oauth_pending'||dateValue(record.expiresAt)<=Date.now())return{success:false,error:'订阅入口已过期，请返回球队页面重新打开',code:'PARENT_REVIEW_SUBSCRIPTION_EXPIRED'}
  const intentResult=await db.collection('parent_profile_review_subscription_intents').doc(String(record.subscriptionIntentId||'')).get(),intent=Array.isArray(intentResult.data)?intentResult.data[0]:intentResult.data
  if(!intent||intent.status!=='issued'||String(intent.parentInvite)!==String(record.parentInvite)||String(intent.creatorUserId)!==String(record.creatorUserId)||String(intent.creatorMiniOpenId)!==String(record.creatorMiniOpenId))return{success:false,error:'球队订阅授权状态已变化，请重新打开订阅入口'}
  const invites=(await db.collection('parent_profile_invites').where({token:record.parentInvite,status:'active'}).limit(2).get()).data||[]
  if(invites.length!==1||String(invites[0].teamId||'')!==String(record.teamId||'')||String(invites[0].playerId||'')!==String(record.playerId||''))return{success:false,error:'球队邀请已失效，请重新打开订阅入口'}
  const preview=await previewParentProfileInvite({parentInvite:record.parentInvite})
  if(!preview.success)return preview
  if(!preview.data.requirements.realName)return{success:false,error:'本次登记不需要球员资料审核通知'}
  const oauth=await httpsGet('https://api.weixin.qq.com/sns/oauth2/access_token?appid='+encodeURIComponent(SERVICE_ACCOUNT_CONFIG.APP_ID)+'&secret='+encodeURIComponent(SERVICE_ACCOUNT_CONFIG.APP_SECRET)+'&code='+encodeURIComponent(code)+'&grant_type=authorization_code')
  if(!oauth||!oauth.openid||oauth.errcode)return{success:false,error:'未能确认当前服务号微信账号，请重试'}
  const bindings=(await db.collection('service_account_bindings').where({sport:'football',miniOpenId:String(record.creatorMiniOpenId),subscribed:true}).limit(10).get()).data||[]
  const binding=bindings.find(item=>String(item.officialOpenId||'')===String(oauth.openid))
  if(!binding)return{success:false,error:'请先使用当前微信绑定赛小蜂服务号后再订阅',code:'PARENT_REVIEW_BINDING_REQUIRED'}
  const ticket=await officialAccountJsApiTicket(),nonceStr=crypto.randomBytes(16).toString('hex'),timestamp=Math.floor(Date.now()/1000),url=String(record.returnUrl||'')
  const signature=crypto.createHash('sha1').update('jsapi_ticket='+ticket+'&noncestr='+nonceStr+'&timestamp='+timestamp+'&url='+url).digest('hex')
  await db.collection('parent_profile_review_subscription_states').doc(state).update({data:{status:'authorized',officialOpenId:String(oauth.openid),bindingId:String(binding._id||''),authorizedAt:db.serverDate(),updateTime:db.serverDate()}})
  return{success:true,state,templateId:PARENT_PROFILE_REVIEW_SUBSCRIBE_TEMPLATE_ID,jsConfig:{appId:SERVICE_ACCOUNT_CONFIG.APP_ID,timestamp,nonceStr,signature},playerName:String(preview.data.playerName||'球员'),teamName:String(preview.data.teamName||'球队')}
}

async function recordParentProfileReviewSubscription(event) {
  const state=String(event.state||''),templateId=String(event.templateId||''),subscribeStatus=String(event.subscribeStatus||''),db=cloud.database()
  const result=await db.collection('parent_profile_review_subscription_states').doc(state).get(),record=Array.isArray(result.data)?result.data[0]:result.data
  if(!record||record.status!=='authorized'||dateValue(record.expiresAt)<=Date.now()||templateId!==PARENT_PROFILE_REVIEW_SUBSCRIBE_TEMPLATE_ID)return{success:false,error:'订阅授权已失效，请重新打开订阅入口',code:'PARENT_REVIEW_SUBSCRIPTION_INVALID'}
  if(subscribeStatus!=='accept'){
    await db.collection('parent_profile_review_subscription_states').doc(state).update({data:{status:'rejected',subscriptionResult:subscribeStatus||'unknown',updateTime:db.serverDate()}})
    await db.collection('parent_profile_review_subscription_intents').doc(String(record.subscriptionIntentId)).update({data:{status:'rejected',updateTime:db.serverDate()}})
    return{success:true,subscribed:false}
  }
  try{await db.createCollection('parent_profile_review_subscriptions')}catch(error){if(!/exist|already|duplicate/i.test(String(error&&error.message||'')))console.warn('[parentReviewSubscribe] subscription collection prepare skipped:',error.message||error)}
  const existing=(await db.collection('parent_profile_review_subscriptions').where({subscriptionIntentId:String(record.subscriptionIntentId),templateId,status:'accepted'}).limit(1).get()).data||[]
  const data={subscriptionIntentId:String(record.subscriptionIntentId),parentInvite:record.parentInvite,teamId:record.teamId,playerId:record.playerId,recipientUserId:record.creatorUserId,creatorMiniOpenId:record.creatorMiniOpenId,officialOpenId:record.officialOpenId,templateId,status:'accepted',remaining:1,authorizedAt:db.serverDate(),createTime:db.serverDate(),updateTime:db.serverDate()}
  if(!existing.length)await db.collection('parent_profile_review_subscriptions').add({data})
  await db.collection('parent_profile_review_subscription_states').doc(state).update({data:{status:'accepted',subscriptionResult:'accept',acceptedAt:db.serverDate(),updateTime:db.serverDate()}})
  await db.collection('parent_profile_review_subscription_intents').doc(String(record.subscriptionIntentId)).update({data:{status:'subscribed',subscribedAt:db.serverDate(),updateTime:db.serverDate()}})
  return{success:true,subscribed:true}
}

async function sendParentProfileReviewSubscription(invite,player,verification,teamName) {
  const db=cloud.database(),templateId=PARENT_PROFILE_REVIEW_SUBSCRIBE_TEMPLATE_ID
  const rows=(await db.collection('parent_profile_review_subscriptions').where({parentInvite:String(invite.token||''),teamId:String(invite.teamId||''),templateId,status:'accepted'}).limit(10).get()).data||[]
  if(!rows.length)return{status:'not_subscribed',recipientCount:0}
  const accessToken=await officialAccountAccessToken(),now=new Date(),pad=value=>String(value).padStart(2,'0'),data={thing19:{value:'球员资料登记'},thing32:{value:String(teamName||'球队').slice(0,20)},thing29:{value:String(player.name||'球员').slice(0,20)},thing10:{value:verification&&verification.status==='approved'?'审核通过':'待审核'},time9:{value:now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate())+' '+pad(now.getHours())+':'+pad(now.getMinutes())}}
  const results=[]
  for(const subscription of rows){
    const message={touser:String(subscription.officialOpenId),template_id:templateId,data,miniprogram:{appid:'wx57164cca8676f411',pagepath:'pages/team/player-detail/player-detail?teamId='+encodeURIComponent(String(invite.teamId||''))+'&playerId='+encodeURIComponent(String(invite.playerId||''))}}
    const response=await httpsPost('api.weixin.qq.com',443,'/cgi-bin/message/subscribe/bizsend?access_token='+encodeURIComponent(accessToken),{'content-type':'application/json'},message)
    if(!response||Number(response.errcode||0)!==0){
      const code=String(response&&response.errcode||'SERVICE_SUBSCRIBE_SEND_FAILED')
      await db.collection('parent_profile_review_subscriptions').doc(subscription._id).update({data:{status:'failed',errorCode:code,errorMessage:String(response&&response.errmsg||'服务号订阅通知发送失败').slice(0,200),attemptedAt:db.serverDate(),updateTime:db.serverDate()}})
      results.push({status:'failed',code})
      continue
    }
    await db.collection('parent_profile_review_subscriptions').doc(subscription._id).update({data:{status:'sent',remaining:0,sentAt:db.serverDate(),messageId:String(response.msgid||''),updateTime:db.serverDate()}})
    results.push({status:'delivered',messageId:String(response.msgid||'')})
  }
  return{status:results.some(item=>item.status==='delivered')?'delivered':'failed',recipientCount:results.length,results}
}
async function authenticateParentH5Session(event) {
  const token = String(event.parentSessionToken || '').trim()
  const expectedInvite = String(event.parentInvite || '').trim()
  if (!token) return { success: false, error: '资料登记会话已失效，请重新打开邀请', code: 'PARENT_AUTH_REQUIRED' }
  try {
    const db = cloud.database(), result = await db.collection('parent_h5_sessions').where({ tokenHash: hashSessionToken(token), active: true }).limit(2).get(), rows = result.data || []
    const session = rows[0]
    if (rows.length !== 1 || !session || dateValue(session.expiresAt) <= Date.now()) return { success: false, error: '资料登记会话已失效，请重新打开邀请', code: 'PARENT_AUTH_REQUIRED' }
    if (expectedInvite && String(session.parentInvite || '') !== expectedInvite) return { success: false, error: '当前家长会话与此邀请不匹配，请重新打开邀请', code: 'PARENT_INVITE_MISMATCH' }
    const serviceFirstInvites = (await db.collection('parent_profile_invites').where({ token: String(session.parentInvite || ''), status: 'active', serviceFirst: true }).limit(2).get()).data || []
    if (serviceFirstInvites.length) {
      const serviceInvite = serviceFirstInvites[0]
      const bindings = (await db.collection('service_account_bindings').where({ sport: 'football', userId: String(serviceInvite.registrantUserId || ''), officialOpenId: String(session.serviceAccountOpenId || ''), subscribed: true }).limit(2).get()).data || []
      if (serviceFirstInvites.length !== 1 || String(serviceInvite.serviceAccountOpenId || '') !== String(session.serviceAccountOpenId || '') || !bindings.length) return { success: false, error: '请使用登记时的微信关注服务号后继续', code: 'SERVICE_FOLLOW_REQUIRED' }
    }
    await db.collection('parent_h5_sessions').doc(session._id).update({ data: { lastUsedAt: db.serverDate() } })
    return { success: true, session }
  } catch (error) {
    console.warn('[webApi] parent session lookup failed:', error.message || error)
    return { success: false, error: '资料登记会话已失效，请重新打开邀请', code: 'PARENT_AUTH_REQUIRED' }
  }
}

async function loadParentProfileDraft(event) {
  const authenticated = await authenticateParentH5Session(event)
  if (!authenticated.success) return authenticated
  const preview = await previewParentProfileInvite({ parentInvite: authenticated.session.parentInvite })
  if (!preview.success) return preview
  const db = cloud.database(), rows = (await db.collection('parent_profile_drafts').where({ parentInvite: authenticated.session.parentInvite }).limit(1).get()).data || []
  return { success: true, data: preview.data, draft: rows[0] || { basicConfirmed: false, registrantAuthorized: false, guardianAuthorized: false, selfAuthorized: false } }
}

async function saveParentBasicProfile(event) {
  const authenticated = await authenticateParentH5Session(event)
  if (!authenticated.success) return authenticated
  const preview = await previewParentProfileInvite({ parentInvite: authenticated.session.parentInvite })
  if (!preview.success) return preview
  const name = String(event.name || '').trim(), birthDate = String(event.birthDate || '').trim(), registrantAuthorized = Boolean(event.registrantAuthorized || event.guardianAuthorized || event.selfAuthorized)
  const registrantType = String(preview.data.registrantType || 'guardian') === 'self' ? 'self' : 'guardian'
  const requestedRelation = String(event.guardianRelation || '').trim().toLowerCase()
  const guardianRelation = ['father', 'mother', 'other'].includes(requestedRelation) ? requestedRelation : 'other'
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !registrantAuthorized) return { success: false, error: registrantType === 'self' ? '请确认本人姓名、出生日期和资料授权' : '请确认孩子姓名、出生日期和监护人授权' }
  const needsReview = name !== String(preview.data.playerName || '') || birthDate !== String(preview.data.birthDate || '')
  const db = cloud.database(), oldRows = (await db.collection('parent_profile_drafts').where({ parentInvite: authenticated.session.parentInvite }).limit(1).get()).data || []
  const data = { parentInvite: authenticated.session.parentInvite, registrantType, basicConfirmed: !needsReview, registrantAuthorized: true, guardianAuthorized: registrantType === 'guardian', selfAuthorized: registrantType === 'self', guardianRelation: registrantType === 'guardian' ? guardianRelation : 'self', requestedName: name, requestedBirthDate: birthDate, needsManualReview: needsReview, serviceAccountOpenId: authenticated.session.serviceAccountOpenId, updateTime: db.serverDate() }
  if (oldRows[0]) await db.collection('parent_profile_drafts').doc(oldRows[0]._id).update({ data })
  else await db.collection('parent_profile_drafts').add({ data: Object.assign({}, data, { createTime: db.serverDate() }) })
  const requirements = preview.data.requirements || {}
  const nextStep = needsReview ? 'manual-review' : (requirements.realName ? 'real-name' : (requirements.portrait ? 'portrait' : 'submit'))
  return { success: true, nextStep, needsManualReview: needsReview, requirements }
}

async function readIdentityMultipart(event) {
  const headers=Object.assign({},event.headers||{},event.header||{},event.request&&event.request.headers||{}),contentType=String(headers['content-type']||headers['Content-Type']||''),fields=Object.assign({},event.queryStringParameters||{},event.formFields||{}),maxBytes=3*1024*1024
  const sources=[event,event.body,event.request,event.request&&event.request.body,event.data]
  const candidates=[]
  for(const source of sources){if(!source||typeof source!=='object'||Buffer.isBuffer(source)||Array.isArray(source))continue;for(const key of ['identityImage','file','image','front'])if(source[key])candidates.push({key,value:source[key]})}
  if(Array.isArray(event.files)){for(const value of event.files)if(value)candidates.push({key:String(value.fieldName||'identityImage'),value})}else if(event.files&&typeof event.files==='object'){for(const [key,value] of Object.entries(event.files))if(value)candidates.push({key,value})}
  for(const {key,value} of candidates){
    const file=value&&typeof value==='object'?value:null,fieldName=String(file&&(file.fieldName||file.name)||key).toLowerCase();if(!/identity|image|front|file/.test(fieldName))continue
    let bytes=Buffer.isBuffer(value)?value:(file&&Buffer.isBuffer(file.content)?file.content:(file&&Buffer.isBuffer(file.body)?file.body:null))
    const filePath=String(file&&(file.filepath||file.filePath||file.tempFilePath||file.path)||'')
    if(!bytes&&filePath){const resolved=path.resolve(filePath),tmpRoot=path.resolve(os.tmpdir())+path.sep;if(resolved.startsWith(tmpRoot)){try{const stat=await fs.promises.stat(resolved);if(stat.size>maxBytes){await fs.promises.unlink(resolved).catch(()=>{});return{fields,image:null,tooLarge:true}};bytes=await fs.promises.readFile(resolved)}finally{await fs.promises.unlink(resolved).catch(()=>{})}}}
    const encoded=typeof value==='string'?value:(file&&typeof file.content==='string'?file.content:(file&&typeof file.data==='string'?file.data:''))
    if(!bytes&&encoded&&encoded.length<=4.2*1024*1024){const dataUrl=encoded.match(/^data:image\/[^;]+;base64,(.+)$/s);try{if(dataUrl||/^[A-Za-z0-9+/=]+$/.test(encoded))bytes=Buffer.from(dataUrl?dataUrl[1]:encoded,'base64')}catch(_){bytes=null}}
    if(bytes&&bytes.length){if(bytes.length>maxBytes)return{fields,image:null,tooLarge:true};const mime=String(file&&(file.mimetype||file.mimeType||file.contentType)||'image/jpeg');fields.__imageMime=mime;fields.__imageFilename=String(file&&(file.originalFilename||file.filename)||'identity.jpg');return{fields,image:bytes,filename:fields.__imageFilename,mime}}
  }
  if(!/multipart\/form-data/i.test(contentType))return null
  let body=Buffer.isBuffer(event.body)?event.body:(typeof event.body==='string'?Buffer.from(event.isBase64Encoded?event.body:Buffer.from(event.body,'binary').toString('base64'),'base64'):(Buffer.isBuffer(event.request&&event.request.body)?event.request.body:null));if(!body)return null
  const boundaryValue=(contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i)||[]).slice(1).find(Boolean);if(!boundaryValue)return null
  const marker=Buffer.from('--'+boundaryValue),separator=Buffer.from('\r\n\r\n'),line=Buffer.from('\r\n');let cursor=0
  while(true){const start=body.indexOf(marker,cursor);if(start<0)break;const headerStart=start+marker.length+2,headerEnd=body.indexOf(separator,headerStart);if(headerEnd<0)break;const headersText=body.subarray(headerStart,headerEnd).toString('utf8'),disposition=(headersText.match(/content-disposition:([^\r\n]*)/i)||[])[1]||'',fieldMatch=disposition.match(/(?:^|;)\s*name="([^"]+)"/i),filenameMatch=disposition.match(/(?:^|;)\s*filename="([^"]*)"/i);if(!fieldMatch){cursor=headerEnd+separator.length;continue}const valueStart=headerEnd+separator.length,next=body.indexOf(marker,valueStart);if(next<0)break;const valueEnd=Math.max(valueStart,next-line.length),value=body.subarray(valueStart,valueEnd),field=fieldMatch[1];if(field==='identityImage'&&value.length){if(value.length>maxBytes)return{fields,image:null,tooLarge:true};fields.__imageMime=(headersText.match(/content-type:\s*([^\r\n]+)/i)||[])[1]||'image/jpeg';fields.__imageFilename=filenameMatch&&filenameMatch[1]||'identity.jpg';fields.__identityImageBuffer=value}else if(value.length<4096)fields[field]=value.toString('utf8').trim();cursor=next}
  return fields.__identityImageBuffer?{fields,image:fields.__identityImageBuffer,filename:fields.__imageFilename,mime:fields.__imageMime}:null
}

async function prepareParentIdentityImage(event) {
  const multipart=event.__identityImageBuffer?{fields:event,image:event.__identityImageBuffer}:await readIdentityMultipart(event)
  if(multipart){event=Object.assign({},event,multipart.fields||{}, {parentSessionToken:String((multipart.fields&&multipart.fields.parentSessionToken)||event.parentSessionToken||(event.headers&&((event.headers['x-sxf-parent-session'])||event.headers['X-Sxf-Parent-Session']))||''),base64Data:'data:image/jpeg;base64,'+multipart.image.toString('base64')})}
  const auth=await authenticateParentH5Session(event)
  if(!auth.success)return auth
  const preview=await previewParentProfileInvite({parentInvite:auth.session.parentInvite})
  if(!preview.success)return preview
  const imageBytes=Buffer.isBuffer(event.__identityImageBuffer)?event.__identityImageBuffer:Buffer.from(String(event.base64Data||'').replace(/^data:image\/[^;]+;base64,/,'') ,'base64')
  if(!imageBytes.length||imageBytes.length>3*1024*1024)return {success:false,error:'照片必须小于3MB',code:'IDENTITY_IMAGE_TOO_LARGE'}
  const result=await cloud.callFunction({name:'prepareParentIdentityImage',data:{parentSessionToken:event.parentSessionToken,imageBase64:imageBytes.toString('base64'),imageMime:String(event.__identityImageMime||'image/jpeg'),documentType:event.documentType,side:event.side,ocrConsent:String(event.ocrConsent||'')==='true'}})
  return result&&result.result||{success:false,error:'后台照片处理暂不可用，请重试'}
}

async function uploadParentIdentityDocument(event) {
  const authenticated = await authenticateParentH5Session(event)
  if (!authenticated.success) return authenticated
  const preview = await previewParentProfileInvite({ parentInvite: authenticated.session.parentInvite })
  if (!preview.success) return preview
  if (!preview.data.requirements.realName) return { success: false, error: '本次邀请未开启人证核验要求', code: 'PARENT_IDENTITY_NOT_REQUIRED' }
  const side = String(event.side || '').toLowerCase()
  if (!['front', 'back'].includes(side)) return { success: false, error: '请选择证件正面或反面', code: 'PARENT_IDENTITY_SIDE_INVALID' }
  const documentType = ['resident_id','household_register','passport','mainland_travel_permit','taiwan_travel_permit'].includes(String(event.documentType || '')) ? String(event.documentType) : 'resident_id'
  if (side === 'back' && documentType !== 'resident_id') return { success:false, error:'该证件只需上传资料页', code:'PARENT_IDENTITY_BACK_NOT_REQUIRED' }
  const db = cloud.database()
  await ensureIdentityCollections(db)
  const verificationRows = (await db.collection('parent_identity_verifications').where({ parentInvite: authenticated.session.parentInvite }).limit(1).get()).data || [], currentVerification = verificationRows[0]
  if (currentVerification && String(currentVerification.status || '') === 'pending_review') return { success: false, error: '实名材料正在审核，请先刷新审核结果', code: 'PARENT_IDENTITY_UNDER_REVIEW' }
  if (currentVerification && String(currentVerification.status || '') === 'approved') return { success: false, error: '人证核验已通过，无需重复上传', code: 'PARENT_IDENTITY_ALREADY_APPROVED' }
  const drafts = (await db.collection('parent_profile_drafts').where({ parentInvite: authenticated.session.parentInvite, basicConfirmed: true }).limit(10).get()).data || []
  if (!drafts.some(parentDraftIsAuthorized)) return { success: false, error: '请先完成基础资料确认', code: 'PARENT_BASIC_REQUIRED' }
  const assetRole = String(event.assetRole || '')
  if (assetRole === 'original' || assetRole === 'review') {
    const partData = String(event.base64Data || '')
    const partMatched = partData.match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/)
    const multipartBuffer = Buffer.isBuffer(event.__identityImageBuffer) ? event.__identityImageBuffer : null
    if (!multipartBuffer && !partMatched) return { success:false, error:'证件照片格式无效，请重新选择', code:'IDENTITY_ASSET_INVALID' }
    const partBuffer = multipartBuffer || Buffer.from(partMatched[2], 'base64')
    const mimeType = multipartBuffer ? (String(event.__identityImageMime || 'image/jpeg').toLowerCase().includes('png') ? 'png' : 'jpeg') : partMatched[1]
    if (!partBuffer.length || partBuffer.length > 180 * 1024) return { success:false, error:'单张证件照片仍过大，请重新选择', code:'IDENTITY_ASSET_TOO_LARGE' }
    if (assetRole === 'original') {
      const digest = crypto.createHash('sha256').update(partBuffer).digest('hex')
      const cloudPath = 'restricted/parent-identity/' + crypto.createHash('sha256').update(authenticated.session.parentInvite).digest('hex').slice(0, 20) + '/' + side + '-' + Date.now() + '.' + (mimeType === 'jpeg' ? 'jpg' : 'png')
      const uploaded = await cloud.uploadFile({ cloudPath, fileContent:partBuffer })
      const deleteAfter = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      const documentAdded = await db.collection('parent_identity_documents').add({ data:{ parentInvite:authenticated.session.parentInvite, side, documentType, fileId:uploaded.fileID, cloudPath, sha256:digest, size:partBuffer.length, mimeType:'image/' + mimeType, reviewFileId:'', reviewSha256:'', reviewSize:0, reviewMimeType:'', cropDetected:event.cropDetected === true, watermarkVersion:String(event.watermarkVersion || '').slice(0,40), status:'uploading_review', recognitionStatus:'needs_manual_review', recognitionErrorCode:'OCR_SKIPPED_BY_PRIVACY', restrictedAccess:true, deleteAfter, retentionDays:30, serviceAccountOpenId:authenticated.session.serviceAccountOpenId, createTime:db.serverDate(), updateTime:db.serverDate() } })
      await db.collection('sensitive_file_deletion_tasks').add({ data:{ businessType:'player_identity_document', businessId:String(documentAdded._id), fileId:uploaded.fileID, status:'scheduled', executeAfter:deleteAfter, retentionDays:30, createTime:db.serverDate(), updateTime:db.serverDate() } })
      return { success:true, side, documentType, assetRole, uploadId:String(documentAdded._id), status:'uploading_review' }
    }
    const uploadId = String(event.uploadId || '')
    if (!uploadId || uploadId.length > 64 || !/^[A-Za-z0-9_-]+$/.test(uploadId)) return { success:false, error:'上传状态已失效，请重试', code:'IDENTITY_UPLOAD_SESSION_INVALID' }
    const pendingResult = await db.collection('parent_identity_documents').doc(uploadId).get()
    const pending = Array.isArray(pendingResult.data) ? pendingResult.data[0] : pendingResult.data
    if (!pending || pending.parentInvite !== authenticated.session.parentInvite || pending.side !== side || pending.documentType !== documentType) return { success:false, error:'证件上传状态不匹配，请重新上传', code:'IDENTITY_UPLOAD_SESSION_INVALID' }
    if (pending.status === 'uploaded' && pending.reviewFileId) return { success:true, side, documentType, assetRole, uploadId, status:'uploaded', duplicate:true, watermarked:true }
    if (pending.status !== 'uploading_review' || !pending.cloudPath) return { success:false, error:'原图尚未保存，请重试', code:'IDENTITY_ORIGINAL_NOT_UPLOADED' }
    const reviewDigest = crypto.createHash('sha256').update(partBuffer).digest('hex')
    const reviewCloudPath = pending.cloudPath.replace(/\.(jpg|png)$/, '-review.' + (mimeType === 'jpeg' ? 'jpg' : 'png'))
    const reviewUploaded = await cloud.uploadFile({ cloudPath:reviewCloudPath, fileContent:partBuffer })
    await db.collection('parent_identity_documents').doc(uploadId).update({ data:{ reviewFileId:reviewUploaded.fileID, reviewCloudPath, reviewSha256:reviewDigest, reviewSize:partBuffer.length, reviewMimeType:'image/' + mimeType, status:'uploaded', updateTime:db.serverDate() } })
    const existing = (await db.collection('parent_identity_documents').where({ parentInvite:authenticated.session.parentInvite, side, status:'uploaded' }).limit(20).get()).data || []
    await Promise.all(existing.filter(item=>String(item._id)!==uploadId).map(item=>db.collection('parent_identity_documents').doc(item._id).update({ data:{ status:'replaced', replacedAt:db.serverDate() } })))
    await db.collection('sensitive_file_deletion_tasks').add({ data:{ businessType:'player_identity_document_review_copy', businessId:uploadId, fileId:reviewUploaded.fileID, status:'scheduled', executeAfter:pending.deleteAfter, retentionDays:30, createTime:db.serverDate(), updateTime:db.serverDate() } })
    return { success:true, side, documentType, assetRole, uploadId, status:'uploaded', watermarked:true }
  }
  const base64Data = String(event.base64Data || '')
  if (base64Data.length > 4.2 * 1024 * 1024) return { success: false, error: '材料必须小于 3MB' }
  const matched = base64Data.match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/)
  if (!matched) return { success: false, error: '仅支持 JPG 或 PNG 身份材料' }
  const buffer = Buffer.from(matched[2], 'base64')
  if (!buffer.length || buffer.length > 3 * 1024 * 1024) return { success: false, error: '材料必须小于 3MB' }
  const reviewBase64Data = String(event.reviewBase64Data || '')
  if (!reviewBase64Data || reviewBase64Data.length > 4.2 * 1024 * 1024) return { success:false, error:'缺少裁边水印副本，请重新选择照片', code:'IDENTITY_REVIEW_COPY_REQUIRED' }
  const reviewMatched = reviewBase64Data.match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/)
  if (!reviewMatched) return { success:false, error:'裁边水印副本格式无效，请重试', code:'IDENTITY_REVIEW_COPY_INVALID' }
  const reviewBuffer = Buffer.from(reviewMatched[2], 'base64')
  if (!reviewBuffer.length || reviewBuffer.length > 3 * 1024 * 1024) return { success:false, error:'裁边水印副本必须小于 3MB' }
  const digest = crypto.createHash('sha256').update(buffer).digest('hex')
  const reviewDigest = crypto.createHash('sha256').update(reviewBuffer).digest('hex')
  const cloudPath = 'restricted/parent-identity/' + crypto.createHash('sha256').update(authenticated.session.parentInvite).digest('hex').slice(0, 20) + '/' + side + '-' + Date.now() + '.' + (matched[1] === 'jpeg' ? 'jpg' : 'png')
  const uploaded = await cloud.uploadFile({ cloudPath, fileContent: buffer })
  const reviewCloudPath = cloudPath.replace(/\.(jpg|png)$/, '-review.' + (reviewMatched[1] === 'jpeg' ? 'jpg' : 'png'))
  const reviewUploaded = await cloud.uploadFile({ cloudPath:reviewCloudPath, fileContent:reviewBuffer })
  const recognition = null
  const recognitionStatus = 'needs_manual_review'
  const recognitionErrorCode = 'OCR_SKIPPED_BY_PRIVACY'
  const existing = (await db.collection('parent_identity_documents').where({ parentInvite: authenticated.session.parentInvite, side, status: 'uploaded' }).limit(20).get()).data || []
  await Promise.all(existing.map(item => db.collection('parent_identity_documents').doc(item._id).update({ data: { status: 'replaced', replacedAt: db.serverDate() } })))
  const deleteAfter = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  const documentAdded = await db.collection('parent_identity_documents').add({ data: { parentInvite: authenticated.session.parentInvite, side, documentType, fileId: uploaded.fileID, reviewFileId:reviewUploaded.fileID, sha256: digest, reviewSha256:reviewDigest, reviewSize:reviewBuffer.length, reviewMimeType:'image/' + reviewMatched[1], cropDetected:event.cropDetected === true, watermarkVersion:String(event.watermarkVersion || '').slice(0,40), size: buffer.length, mimeType: 'image/' + matched[1], status: 'uploaded', recognitionStatus, recognizedName: recognition ? recognition.name : '', recognizedBirthDate: recognition ? recognition.birthDate : '', recognizedGender: recognition ? recognition.gender : '', identityNumberMasked: recognition ? recognition.identityNumberMasked : '', recognitionWarnings: recognition ? recognition.warnings : [], recognitionErrorCode, restrictedAccess:true, deleteAfter, retentionDays:30, serviceAccountOpenId: authenticated.session.serviceAccountOpenId, createTime: db.serverDate(), updateTime: db.serverDate() } })
  await db.collection('sensitive_file_deletion_tasks').add({ data:{ businessType:'player_identity_document', businessId:String(documentAdded._id), fileId:uploaded.fileID, status:'scheduled', executeAfter:deleteAfter, retentionDays:30, createTime:db.serverDate(), updateTime:db.serverDate() } })
  await db.collection('sensitive_file_deletion_tasks').add({ data:{ businessType:'player_identity_document_review_copy', businessId:String(documentAdded._id), fileId:reviewUploaded.fileID, status:'scheduled', executeAfter:deleteAfter, retentionDays:30, createTime:db.serverDate(), updateTime:db.serverDate() } })
  return { success: true, side, documentType, status: 'uploaded', recognitionStatus, cropDetected:event.cropDetected === true, watermarked:true }
}

async function submitParentIdentityVerification(event) {
  const authenticated = await authenticateParentH5Session(event)
  if (!authenticated.success) return authenticated
  const preview = await previewParentProfileInvite({ parentInvite: authenticated.session.parentInvite })
  if (!preview.success) return preview
  if (!preview.data.requirements.realName) return { success: false, error: '本次邀请未开启人证核验要求', code: 'PARENT_IDENTITY_NOT_REQUIRED' }
  const db = cloud.database(), currentRows = (await db.collection('parent_identity_verifications').where({ parentInvite: authenticated.session.parentInvite }).limit(1).get()).data || [], currentVerification = currentRows[0]
  if (currentVerification && String(currentVerification.status || '') === 'approved') return { success: false, error: '人证核验已通过，无需重复提交', code: 'PARENT_IDENTITY_ALREADY_APPROVED' }
  if (currentVerification && String(currentVerification.status || '') === 'pending_review') return { success: true, status: 'pending_review', duplicate: true }
  const drafts = (await db.collection('parent_profile_drafts').where({ parentInvite: authenticated.session.parentInvite, basicConfirmed: true }).limit(10).get()).data || []
  if (!drafts.some(parentDraftIsAuthorized)) return { success: false, error: '请先完成基础资料确认', code: 'PARENT_BASIC_REQUIRED' }
  const docs = (await db.collection('parent_identity_documents').where({ parentInvite: authenticated.session.parentInvite, status: 'uploaded' }).limit(10).get()).data || []
  const frontDocument = docs.find(item => item.side === 'front')
  if (!frontDocument) return { success: false, error: '请先上传身份证人像面' }
  const backDocument = docs.find(item => item.side === 'back' && item.documentType === 'resident_id')
  if (frontDocument.documentType === 'resident_id' && !backDocument) return { success:false, error:'请上传身份证国徽面', code:'PARENT_IDENTITY_BACK_REQUIRED' }
  if (currentVerification && String(currentVerification.status || '') === 'rejected' && Array.isArray(currentVerification.documentIds)) {
    const previousDocumentIds = currentVerification.documentIds.map(item => String(item))
    if (previousDocumentIds.indexOf(String(frontDocument._id)) >= 0) {
      return { success: false, error: '审核退回后请先重新上传身份证人像面，再提交核验', code: 'PARENT_IDENTITY_REUPLOAD_REQUIRED' }
    }
  }
  const records = (await db.collection('parent_identity_verifications').where({ parentInvite: authenticated.session.parentInvite }).limit(1).get()).data || []
  const recognized = String(frontDocument.recognitionStatus || '') === 'recognized' && (!backDocument || String(backDocument.recognitionStatus || '') === 'recognized')
  const faceAssessment = event.faceAssessment && typeof event.faceAssessment === 'object' ? event.faceAssessment : {}
  const faceMethod = String(faceAssessment.method || '')
  const faceStatus = String(faceAssessment.status || '')
  const biometricConsent = faceAssessment.biometricConsent === true
  const faceDistance = Number(faceAssessment.distance)
  const livenessMotion = Number(faceAssessment.livenessMotion)
  const algorithmPassed = faceMethod === 'local_face_1to1' && faceStatus === 'passed' && biometricConsent && Number.isFinite(faceDistance) && faceDistance >= 0 && faceDistance <= .55 && Number.isFinite(livenessMotion) && livenessMotion >= .045
  const manualPerEvent = faceMethod === 'manual_per_event' && biometricConsent === false
  if (!algorithmPassed && !manualPerEvent && faceStatus !== 'needs_manual_review') return { success:false, error:'请先完成人证比对或选择人工核验', code:'IDENTITY_FACE_ASSESSMENT_REQUIRED' }
  const featureEnvelope = algorithmPassed ? encryptIdentityFeature(faceAssessment.descriptor) : null
  if (algorithmPassed && !featureEnvelope) return { success:false, error:'人脸特征加密尚未配置，请联系管理员后重试', code:'IDENTITY_FEATURE_ENCRYPTION_REQUIRED' }
  const warnings = (Array.isArray(frontDocument.recognitionWarnings) ? frontDocument.recognitionWarnings : []).concat(backDocument && Array.isArray(backDocument.recognitionWarnings) ? backDocument.recognitionWarnings : [])
  const recognizedName = String(frontDocument.recognizedName || '').trim()
  const recognizedBirthDate = String(frontDocument.recognizedBirthDate || '')
  const nameMatches = recognizedName && recognizedName === String(preview.data.playerName || '').trim()
  const birthMatches = recognizedBirthDate && recognizedBirthDate === String(preview.data.birthDate || '')
  const autoReviewAllowed = recognized && warnings.length === 0 && algorithmPassed
  const reviewStatus = autoReviewAllowed ? (nameMatches && birthMatches ? 'approved' : 'rejected') : 'pending_review'
  const reviewReason = reviewStatus === 'rejected'
    ? (!nameMatches && !birthMatches ? '证件姓名和出生日期与球员档案不一致，请核对后重新上传。' : (!nameMatches ? '证件姓名与球员档案不一致，请核对后重新上传。' : '证件出生日期与球员档案不一致，请核对后重新上传。'))
    : ''
  const reviewedAt = reviewStatus === 'pending_review' ? null : db.serverDate()
  const data = {
    parentInvite: authenticated.session.parentInvite,
    documentIds: backDocument ? [frontDocument._id, backDocument._id] : [frontDocument._id],
    documentType:String(frontDocument.documentType || 'resident_id'),
    requiredSides: backDocument ? ['front', 'back'] : ['front'],
    status: reviewStatus,
    reason: reviewReason,
    rejectReason: reviewReason,
    reviewedAt,
    approvedAt: reviewStatus === 'approved' ? reviewedAt : null,
    rejectedAt: reviewStatus === 'rejected' ? reviewedAt : null,
    identityNumberMasked: String(frontDocument.identityNumberMasked || ''),
    verifiedBirthDate: recognizedBirthDate,
    gender: String(frontDocument.recognizedGender || ''),
    qualificationStatusText: reviewStatus === 'approved' ? '人证核验通过' : '',
    verificationLabel:reviewStatus === 'approved' ? '人证核验通过' : '待人工核验',
    verificationDisclosure:'平台人证核验，非权威库认证',
    reviewMode: reviewStatus === 'pending_review' ? 'organizer_double_review' : 'local_ocr_face_1to1',
    identityMethod:manualPerEvent ? 'manual_per_event' : 'local_face_1to1',
    biometricConsent,
    faceAssessment:{ status:algorithmPassed ? 'passed' : 'needs_manual_review', algorithm:String(faceAssessment.algorithm || '').slice(0,40), distance:Number.isFinite(faceDistance) ? faceDistance : null, livenessMotion:Number.isFinite(livenessMotion) ? livenessMotion : null },
    encryptedFaceFeature:featureEnvelope,
    featureStorageStatus:featureEnvelope ? 'encrypted' : (algorithmPassed ? 'encryption_key_missing' : 'not_stored'),
    recognitionErrorCode: String(frontDocument.recognitionErrorCode || ''),
    submittedAt: db.serverDate(),
    serviceAccountOpenId: authenticated.session.serviceAccountOpenId,
    updateTime: db.serverDate()
  }
  let verificationId = records[0] ? String(records[0]._id) : ''
  if (records[0]) await db.collection('parent_identity_verifications').doc(records[0]._id).update({ data })
  else { const added = await db.collection('parent_identity_verifications').add({ data: Object.assign({}, data, { createTime: db.serverDate() }) }); verificationId = String(added._id) }
  await db.collection('identity_verification_attempts').add({ data:{ parentInvite:authenticated.session.parentInvite, playerId:String(preview.data.playerId || ''), verificationId, method:data.identityMethod, status:reviewStatus, faceAssessment:data.faceAssessment, documentType:String(frontDocument.documentType || 'resident_id'), serviceAccountOpenId:authenticated.session.serviceAccountOpenId, createTime:db.serverDate() } })
  return { success: true, status: reviewStatus }
}

async function getParentIdentityVerification(event) {
  const authenticated = await authenticateParentH5Session(event)
  if (!authenticated.success) return authenticated
  const preview = await previewParentProfileInvite({ parentInvite: authenticated.session.parentInvite })
  if (!preview.success) return preview
  const db = cloud.database(), rows = (await db.collection('parent_identity_verifications').where({ parentInvite: authenticated.session.parentInvite }).limit(1).get()).data || []
  const record = rows[0]
  const publicPlayer = {
    playerName: String(preview.data.playerName || '球员'),
    teamName: String(preview.data.teamName || ''),
    birthDate: String(preview.data.birthDate || ''),
    registrantType: String(preview.data.registrantType || 'guardian'),
    isSelfRegistration: preview.data.isSelfRegistration === true
  }
  if (!preview.data.requirements.realName) return { success: true, data: Object.assign({}, publicPlayer, { requirements: preview.data.requirements, status: 'not_required', statusText: '本次邀请未开启人证核验', reason: '' }) }
  if (!record) return { success: true, data: Object.assign({}, publicPlayer, { requirements: preview.data.requirements, status: 'not_started', statusText: '尚未提交人证核验', reason: '' }) }
  const status = String(record.status || 'pending_review')
  const text = status === 'approved' ? '人证核验通过' : (status === 'rejected' ? '人证核验需要补充材料' : '人证核验审核中')
  const maskedIdentityNumber = String(record.identityNumberMasked || record.idCardNumberMasked || '').replace(/[^0-9Xx*]/g, '').slice(0, 18)
  const gender = ['男', '女'].indexOf(String(record.gender || '')) >= 0 ? String(record.gender) : ''
  const corrections = status === 'approved'
    ? (await db.collection('parent_identity_correction_requests').where({ parentInvite: authenticated.session.parentInvite, status: 'open' }).limit(1).get()).data || []
    : []
  return {
    success: true,
    data: Object.assign({}, publicPlayer, {
      requirements: preview.data.requirements,
      status,
      statusText: text,
      reason: String(record.reason || record.rejectReason || '').slice(0, 300),
      submittedAt: record.submittedAt || record.createTime || null,
      reviewedAt: record.reviewedAt || record.approvedAt || record.rejectedAt || record.updateTime || null,
      identityNumberMasked: maskedIdentityNumber,
      verifiedBirthDate: String(record.verifiedBirthDate || record.birthDate || publicPlayer.birthDate),
      gender,
      qualificationStatusText: String(record.qualificationStatusText || record.qualificationText || '').slice(0, 60),
      documentStored: Array.isArray(record.documentIds) && record.documentIds.length > 0,
      correctionRequested: corrections.length > 0
    })
  }
}

async function identityOrganizerOrgIds(db, invite) {
  const relations = (await db.collection('tournament_teams').where({ teamId:String(invite.teamId || '') }).limit(100).get()).data || []
  const active = relations.filter(item => ['cancelled','withdrawn','rejected','replaced','invite_cancelled'].indexOf(String(item.status || '').toLowerCase()) < 0)
  const tournamentIds = Array.from(new Set(active.map(item => String(item.tournamentId || '')).filter(Boolean)))
  const result = []
  for (let offset=0; offset<tournamentIds.length; offset+=10) {
    const tournaments = (await db.collection('tournaments').where({ _id:db.command.in(tournamentIds.slice(offset,offset+10)) }).limit(10).get()).data || []
    tournaments.forEach(item => { const orgId=String(item.orgId || item.organizationId || ''); if (orgId && result.indexOf(orgId) < 0) result.push(orgId) })
  }
  return result
}

async function identityReviewerAuth(event, orgIds) {
  const auth = await authenticateWebSession(event)
  if (!auth.success) return auth
  if (auth.principalType === 'platform_owner') return auth
  const allowedOrgIds = Array.isArray(orgIds) ? orgIds.map(String) : [String(orgIds || '')]
  const orgId = String(auth.orgId || '')
  if (!orgId || allowedOrgIds.indexOf(orgId) < 0) return { success:false, error:'当前账号不属于该赛事主办方', code:'IDENTITY_REVIEW_SCOPE_DENIED' }
  const db = cloud.database()
  const rows = (await db.collection('organization_memberships').where({ orgId:String(orgId), userId:String(auth.userId), status:'accepted' }).limit(5).get()).data || []
  const allowed = rows.some(function(item) {
    const role = String(item.role || item.memberRole || '').toLowerCase()
    const permissions = Array.isArray(item.permissions) ? item.permissions : Object.keys(item.permissions || {}).filter(key => item.permissions[key] === true)
    return ['owner','admin','organizer','event_manager'].indexOf(role) >= 0 || permissions.indexOf('event.manage') >= 0 || permissions.indexOf('identity.review') >= 0
  })
  if (!allowed) return { success:false, error:'当前账号没有人证复核权限', code:'IDENTITY_REVIEW_PERMISSION_DENIED' }
  return auth
}

async function listIdentityReviewQueue(event) {
  const auth = await authenticateWebSession(event)
  if (!auth.success) return auth
  const db = cloud.database()
  const pending = (await db.collection('parent_identity_verifications').where({ status:'pending_review' }).limit(100).get()).data || []
  const rows = []
  for (const verification of pending) {
    const invites = (await db.collection('parent_profile_invites').where({ token:String(verification.parentInvite || '') }).limit(1).get()).data || []
    const invite = invites[0]
    if (!invite) continue
    const organizerOrgIds = await identityOrganizerOrgIds(db, invite)
    const reviewAuth = await identityReviewerAuth(event, organizerOrgIds)
    if (!reviewAuth.success) continue
    const players = (await db.collection('players').where({ _id:String(invite.playerId || '') }).limit(1).get()).data || []
    const player = players[0] || {}
    const documentIds = Array.isArray(verification.documentIds) ? verification.documentIds.map(String).filter(Boolean) : []
    const documents = []
    for (const documentId of documentIds) {
      const found = (await db.collection('parent_identity_documents').where({ _id:documentId, status:'uploaded' }).limit(1).get()).data || []
      if (found[0]) documents.push(found[0])
    }
    const fileIds = documents.flatMap(item => [String(item.reviewFileId || item.fileId || ''), String(item.fileId || '')]).filter(Boolean)
    const urls = fileIds.length ? await cloud.getTempFileURL({ fileList:fileIds }) : { fileList:[] }
    const urlById = {}
    fileIds.forEach((id, index) => { urlById[id] = String((urls.fileList || [])[index] && urls.fileList[index].tempFileURL || '') })
    const front = documents.find(item => item.side === 'front') || {}
    const back = documents.find(item => item.side === 'back') || {}
    const documentUrl = urlById[String(front.reviewFileId || front.fileId || '')] || ''
    const backDocumentUrl = urlById[String(back.reviewFileId || back.fileId || '')] || ''
    rows.push({ id:String(verification._id), playerId:String(invite.playerId || ''), playerName:String(player.name || '球员'), birthDate:String(player.birthDate || ''), teamId:String(invite.teamId || ''), photoUrl:String(player.photoUrl || ''), documentUrl, backDocumentUrl, frontCropDetected:front.cropDetected === true, backCropDetected:back.cropDetected === true, documentType:String(verification.documentType || 'resident_id'), identityNumberMasked:String(verification.identityNumberMasked || ''), submittedAt:verification.submittedAt || null, faceAssessment:verification.faceAssessment || {}, reviewMode:String(verification.reviewMode || 'organizer_double_review') })
  }
  return { success:true, rows }
}

async function notifyParentIdentityReviewResult(db,invite,verification,status,reason) {
  const teamId=String(invite&&invite.teamId||''),playerId=String(invite&&invite.playerId||''),name='球员'
  if(!teamId||!playerId||!['approved','rejected'].includes(String(status||'')))return
  const playerResult=await db.collection('players').doc(playerId).get(),player=Array.isArray(playerResult.data)?playerResult.data[0]:playerResult.data||{}
  const teamResult=await db.collection('teams').doc(teamId).get(),team=Array.isArray(teamResult.data)?teamResult.data[0]:teamResult.data||{}
  const recipients=new Set([invite.registrantUserId,invite.guardianUserId,player.registrantUserId,player.playerUserId,player.linkedUserId,player.guardianUserId].filter(Boolean).map(String))
  ;[team.ownerId,team.ownerUserId,team.creatorId,team.userId].concat(team.managerIds||[],team.coachIds||[]).filter(Boolean).forEach(value=>recipients.add(String(value)))
  const memberships=(await db.collection('team_memberships').where({teamId}).limit(200).get()).data||[]
  memberships.forEach(member=>{
    const state=String(member.status||'active').toLowerCase(),roles=[].concat(member.positions||[],member.roles||[],member.position||[],member.role||[]).filter(Boolean).map(value=>String(value).toLowerCase()),permissions=member.permissions||[]
    const hasManage=Array.isArray(permissions)?permissions.indexOf('team.manage')>=0:Boolean(permissions&&permissions['team.manage'])
    if(['active','accepted','claimed'].includes(state)&&(hasManage||roles.some(value=>['owner','admin','manager','coach','head_coach','team_owner','team_admin','team_manager','team_leader','teamleader'].includes(value)||/球队负责人|教练|领队/.test(value))))recipients.add(String(member.userId||member.memberUserId||member.ownerId||''))
  })
  recipients.delete('')
  const orgId=String(invite.orgId||team.orgId||team.organizationId||''),playerName=String(player.name||name),teamName=String(team.name||team.teamName||'球队')
  const finalStatus=String(status),detail=finalStatus==='approved'?'审核已通过，可返回登记页继续完成资料。':'审核未通过：'+String(reason||'请重新上传清晰证件资料。')
  const revision=dateValue(verification&& (verification.submittedAt||verification.updateTime))||Date.now()
  for(const userId of recipients){
    const dedupeKey='parent_identity_review:'+String(verification._id||'')+':'+revision+':'+finalStatus+':'+userId
    const existing=(await db.collection('messages').where({teamId,userId,dedupeKey}).limit(1).get()).data||[]
    if(existing.length)continue
    await db.collection('messages').add({data:{orgId,teamId,userId,category:'team',title:finalStatus==='approved'?'球员身份审核通过':'球员身份需补充',subtitle:playerName+'（'+teamName+'）'+detail,path:'',dedupeKey,createdAt:db.serverDate(),createTime:db.serverDate(),updateTime:db.serverDate()}})
  }
}

async function reviewIdentityVerification(event) {
  const verificationId = String(event.verificationId || '')
  const decision = String(event.decision || '')
  const reason = String(event.reason || '').trim().slice(0, 300)
  if (!verificationId || ['approved','rejected'].indexOf(decision) < 0) return { success:false, error:'请提交明确的复核结论', code:'IDENTITY_REVIEW_INVALID' }
  if (decision === 'rejected' && !reason) return { success:false, error:'退回时必须填写原因', code:'IDENTITY_REVIEW_REASON_REQUIRED' }
  const db = cloud.database()
  await ensureIdentityCollections(db)
  const result = await db.collection('parent_identity_verifications').doc(verificationId).get()
  const verification = Array.isArray(result.data) ? result.data[0] : result.data
  if (!verification || String(verification.status || '') !== 'pending_review') return { success:false, error:'核验记录不存在或已处理', code:'IDENTITY_REVIEW_NOT_PENDING' }
  const invites = (await db.collection('parent_profile_invites').where({ token:String(verification.parentInvite || '') }).limit(1).get()).data || []
  const invite = invites[0]
  if (!invite) return { success:false, error:'核验关联邀请已失效', code:'IDENTITY_REVIEW_INVITE_MISSING' }
  const organizerOrgIds = await identityOrganizerOrgIds(db, invite)
  const auth = await identityReviewerAuth(event, organizerOrgIds)
  if (!auth.success) return auth
  const prior = (await db.collection('identity_manual_reviews').where({ verificationId, reviewerUserId:String(auth.userId) }).limit(2).get()).data || []
  if (prior.length) return { success:false, error:'同一审核员不能重复参与双人复核', code:'IDENTITY_REVIEW_DUPLICATE_REVIEWER' }
  await db.collection('identity_manual_reviews').add({ data:{ verificationId, playerId:String(invite.playerId || ''), teamId:String(invite.teamId || ''), orgId:String(auth.orgId || ''), reviewerUserId:String(auth.userId), decision, reason, independent:true, createTime:db.serverDate() } })
  const votes = (await db.collection('identity_manual_reviews').where({ verificationId }).limit(10).get()).data || []
  const uniqueReviewers = new Set(votes.map(item => String(item.reviewerUserId || '')).filter(Boolean))
  if (uniqueReviewers.size < 2) return { success:true, status:'pending_review', awaitingSecondReviewer:true, message:'第一份复核意见已保存，等待另一名审核员' }
  const latestVotes = []
  uniqueReviewers.forEach(function(userId) { const vote = votes.filter(item => String(item.reviewerUserId || '') === userId).sort((a,b) => dateValue(b.createTime) - dateValue(a.createTime))[0]; if (vote) latestVotes.push(vote) })
  const allApproved = latestVotes.length >= 2 && latestVotes.every(item => item.decision === 'approved')
  const allRejected = latestVotes.length >= 2 && latestVotes.every(item => item.decision === 'rejected')
  if (!allApproved && !allRejected) {
    const disputedReason = '两名审核员结论不一致，请重新提交清晰的证件和本人照片。'
    await db.collection('parent_identity_verifications').doc(verificationId).update({ data:{ status:'rejected', reason:disputedReason, rejectReason:disputedReason, manualReviewStatus:'disputed', manualReviewCount:latestVotes.length, rejectedAt:db.serverDate(), reviewedAt:db.serverDate(), updateTime:db.serverDate() } })
    try{await notifyParentIdentityReviewResult(db,invite,verification,'rejected',disputedReason)}catch(notificationError){console.warn('[identityReview] mini inbox notification skipped:',notificationError&&notificationError.message||'unknown')}
    return { success:true, status:'rejected', disputed:true, message:'复核结论不一致，已退回重新补充资料' }
  }
  const status = allApproved ? 'approved' : 'rejected'
  const finalReason = allRejected ? latestVotes.map(item => item.reason).filter(Boolean).join('；').slice(0,300) : ''
  await db.collection('parent_identity_verifications').doc(verificationId).update({ data:{ status, reason:finalReason, rejectReason:finalReason, reviewMode:'organizer_double_review', manualReviewStatus:'completed', manualReviewCount:latestVotes.length, manualApprovalScopeOrgId:allApproved ? String(auth.orgId || '') : '', reviewedAt:db.serverDate(), approvedAt:allApproved ? db.serverDate() : null, rejectedAt:allRejected ? db.serverDate() : null, qualificationStatusText:allApproved ? '人证核验通过' : '', verificationLabel:allApproved ? '人证核验通过' : '核验未通过', updateTime:db.serverDate() } })
  try{await notifyParentIdentityReviewResult(db,invite,verification,status,finalReason)}catch(notificationError){console.warn('[identityReview] mini inbox notification skipped:',notificationError&&notificationError.message||'unknown')}
  return { success:true, status, message:allApproved ? '双人复核通过' : '双人复核已退回' }
}

async function requestParentIdentityCorrection(event) {
  const authenticated = await authenticateParentH5Session(event)
  if (!authenticated.success) return authenticated
  const preview = await previewParentProfileInvite({ parentInvite: authenticated.session.parentInvite })
  if (!preview.success) return preview
  if (!preview.data.requirements.realName) return { success: false, error: '本次邀请未开启人证核验要求', code: 'PARENT_IDENTITY_NOT_REQUIRED' }
  const db = cloud.database()
  const verifications = (await db.collection('parent_identity_verifications').where({ parentInvite: authenticated.session.parentInvite, status: 'approved' }).limit(1).get()).data || []
  if (!verifications[0]) return { success: false, error: '仅已通过的实名信息可以申请更正', code: 'PARENT_IDENTITY_NOT_APPROVED' }
  const existing = (await db.collection('parent_identity_correction_requests').where({ parentInvite: authenticated.session.parentInvite, status: 'open' }).limit(1).get()).data || []
  if (existing[0]) return { success: true, requestId: String(existing[0]._id), status: 'open', duplicate: true }
  const reason = String(event.reason || '登记人反馈实名信息有误').trim().slice(0, 300)
  if (!reason) return { success: false, error: '请填写需要核对的信息' }
  const created = await db.collection('parent_identity_correction_requests').add({
    data: {
      parentInvite: authenticated.session.parentInvite,
      verificationId: String(verifications[0]._id),
      reason,
      status: 'open',
      serviceAccountOpenId: authenticated.session.serviceAccountOpenId,
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }
  })
  return { success: true, requestId: String(created._id), status: 'open' }
}

async function uploadAndProcessParentPortrait(event) {
  const authenticated = await authenticateParentH5Session(event)
  if (!authenticated.success) return authenticated
  const preview = await previewParentProfileInvite({ parentInvite: authenticated.session.parentInvite })
  if (!preview.success) return preview
  if (!preview.data.requirements.portrait) return { success: false, error: '本次邀请未开启标准形象照要求', code: 'PARENT_PORTRAIT_NOT_REQUIRED' }
  const needsIdentity = Boolean(preview.data.requirements.realName)
  const db = cloud.database(), checks = needsIdentity ? (await db.collection('parent_identity_verifications').where({ parentInvite: authenticated.session.parentInvite, status: 'approved' }).limit(1).get()).data || [] : []
  if (needsIdentity && !checks[0] && preview.data.requirements.identityAlreadyVerified !== true) {
    const docs = (await db.collection('parent_identity_documents').where({ parentInvite:authenticated.session.parentInvite, status:'uploaded' }).limit(10).get()).data || []
    const front = docs.find(item => item.side === 'front')
    const back = docs.find(item => item.side === 'back' && item.documentType === 'resident_id')
    if (!front || (front.documentType === 'resident_id' && !back)) return { success:false, error:'请先完成身份证两面上传', code:'PARENT_IDENTITY_DOCUMENTS_REQUIRED' }
  }
  const priorPortraits = (await db.collection('parent_portraits').where({ parentInvite: authenticated.session.parentInvite }).limit(1000).get()).data || []
  const nextVersion = priorPortraits.reduce((max, item) => Math.max(max, Number(item.version || 0)), 0) + 1
  const base64Data = String(event.base64Data || '')
  if (base64Data.length > 4.2 * 1024 * 1024) return { success: false, error: '照片必须小于 3MB' }
  const matched = base64Data.match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/)
  if (!matched) return { success: false, error: '仅支持 JPG 或 PNG 照片' }
  const raw = Buffer.from(matched[2], 'base64')
  if (!raw.length || raw.length > 3 * 1024 * 1024) return { success: false, error: '照片必须小于 3MB' }
  const prefix = 'restricted/parent-portraits/' + crypto.createHash('sha256').update(authenticated.session.parentInvite).digest('hex').slice(0, 20)
  const rawUpload = await cloud.uploadFile({ cloudPath: prefix + '/raw-' + Date.now() + '.' + (matched[1] === 'jpeg' ? 'jpg' : 'png'), fileContent: raw })
  const processed = await cloud.callFunction({ name: 'baiduRemoveBg', data: { action: 'removeBackground', imageBase64: matched[2] } })
  const processResult = processed && processed.result
  if (!processResult || !processResult.success || !processResult.data) {
    await db.collection('parent_portraits').add({ data: { parentInvite: authenticated.session.parentInvite, identityVerificationId: checks[0] ? String(checks[0]._id) : '', version: nextVersion, rawFileId: rawUpload.fileID, status: 'processing_failed', processingStatus: 'failed', reason: String((processResult && (processResult.message || processResult.error)) || '人像分割失败'), serviceAccountOpenId: authenticated.session.serviceAccountOpenId, createTime: db.serverDate(), updateTime: db.serverDate() } })
    return { success: false, error: '未能识别清晰单人正面照片，请按取景框重拍' }
  }
  const transparent = Buffer.from(String(processResult.data).replace(/^data:image\/png;base64,/, ''), 'base64')
  const transparentUpload = await cloud.uploadFile({ cloudPath: prefix + '/transparent-' + Date.now() + '.png', fileContent: transparent })
  const record = await db.collection('parent_portraits').add({ data: { parentInvite: authenticated.session.parentInvite, identityVerificationId: checks[0] ? String(checks[0]._id) : '', version: nextVersion, rawFileId: rawUpload.fileID, transparentFileId: transparentUpload.fileID, status: 'ready_for_confirmation', processingStatus: 'ready', serviceAccountOpenId: authenticated.session.serviceAccountOpenId, createTime: db.serverDate(), updateTime: db.serverDate() } })
  return { success: true, portraitId: record._id, version: nextVersion, status: 'ready_for_confirmation', transparentPreview: 'data:image/png;base64,' + String(processResult.data).replace(/^data:image\/png;base64,/, '') }
}

function normalizeParentPortraitCrop(value) {
  const crop = value && typeof value === 'object' ? value : {}
  const numberInRange = (candidate, fallback, min, max) => {
    const parsed = Number(candidate)
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
  }
  return {
    scale: Number(numberInRange(crop.scale, 1, 0.8, 1.4).toFixed(3)),
    x: Number(numberInRange(crop.x, 0, -512, 512).toFixed(2)),
    y: Number(numberInRange(crop.y, 0, -512, 512).toFixed(2))
  }
}

async function confirmParentPortrait(event) {
  const authenticated = await authenticateParentH5Session(event)
  if (!authenticated.success) return authenticated
  const preview = await previewParentProfileInvite({ parentInvite: authenticated.session.parentInvite })
  if (!preview.success) return preview
  if (!preview.data.requirements.portrait) return { success: false, error: '本次邀请未开启标准形象照要求', code: 'PARENT_PORTRAIT_NOT_REQUIRED' }
  const portraitId = String(event.portraitId || '')
  if (!portraitId) return { success: false, error: '缺少待确认的人像版本' }
  const avatarData = String(event.avatarData || '')
  const avatarMatch = avatarData.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/)
  if (!avatarMatch) return { success: false, error: '头像裁切结果缺失，请重新调整并确认', code: 'PARENT_AVATAR_REQUIRED' }
  const avatarBuffer = Buffer.from(avatarMatch[1], 'base64')
  if (!avatarBuffer.length || avatarBuffer.length > 2 * 1024 * 1024) return { success: false, error: '头像裁切结果过大，请重新调整', code: 'PARENT_AVATAR_TOO_LARGE' }
  const needsIdentity = Boolean(preview.data.requirements.realName)
  const db = cloud.database(), identityChecks = needsIdentity ? (await db.collection('parent_identity_verifications').where({ parentInvite: authenticated.session.parentInvite, status: 'approved' }).limit(1).get()).data || [] : []
  if (needsIdentity && !identityChecks[0] && preview.data.requirements.identityAlreadyVerified !== true) {
    const docs = (await db.collection('parent_identity_documents').where({ parentInvite:authenticated.session.parentInvite, status:'uploaded' }).limit(10).get()).data || []
    const front = docs.find(item => item.side === 'front')
    const back = docs.find(item => item.side === 'back' && item.documentType === 'resident_id')
    if (!front || (front.documentType === 'resident_id' && !back)) return { success:false, error:'证件材料不完整，请返回补齐后再确认形象照', code:'PARENT_IDENTITY_DOCUMENTS_REQUIRED' }
  }
  const result = await db.collection('parent_portraits').doc(portraitId).get(), portrait = Array.isArray(result.data) ? result.data[0] : result.data
  if (!portrait || String(portrait.parentInvite || '') !== String(authenticated.session.parentInvite || '') || String(portrait.status || '') !== 'ready_for_confirmation') return { success: false, error: '当前人像版本不可确认' }
  if (needsIdentity && String(portrait.identityVerificationId || '') && String(portrait.identityVerificationId) !== String(identityChecks[0]._id)) return { success: false, error: '形象照与当前实名版本不匹配，请重新生成' }
  const prefix = 'restricted/parent-portraits/' + crypto.createHash('sha256').update(authenticated.session.parentInvite).digest('hex').slice(0, 20)
  const avatarUpload = await cloud.uploadFile({ cloudPath: prefix + '/avatar-' + Date.now() + '.png', fileContent: avatarBuffer })
  const avatarCrop = normalizeParentPortraitCrop(event.crop)
  const existing = (await db.collection('parent_portraits').where({ parentInvite: authenticated.session.parentInvite, status: 'confirmed' }).limit(20).get()).data || []
  await Promise.all(existing.map(item => db.collection('parent_portraits').doc(item._id).update({ data: { status: 'superseded', supersededAt: db.serverDate(), updateTime: db.serverDate() } })))
  await db.collection('parent_portraits').doc(portraitId).update({ data: { status: 'confirmed', processingStatus: 'confirmed', avatarFileId: avatarUpload.fileID, avatarCrop, avatarProcessingStatus: 'confirmed', baiduFaceConsent:event.baiduFaceConsent === true, baiduFaceConsentAt:event.baiduFaceConsent === true ? db.serverDate() : null, baiduFaceConsentVersion:event.baiduFaceConsent === true ? 'baidu-match-face/1' : '', baiduFaceConsent:event.baiduFaceConsent === true, baiduFaceConsentAt:event.baiduFaceConsent === true ? db.serverDate() : null, baiduFaceConsentVersion:event.baiduFaceConsent === true ? 'baidu-match-face/1' : '', confirmedAt: db.serverDate(), updateTime: db.serverDate() } })
  return { success: true, portraitId, version: Number(portrait.version || 0), status: 'confirmed' }
}

async function retryParentFaceRegistration(event) {
  const auth = await authenticateParentH5Session(event)
  if (!auth.success) return auth
  const preview = await previewParentProfileInvite({ parentInvite:auth.session.parentInvite })
  if (!preview.success) return preview
  const db = cloud.database()
  const invites = (await db.collection('parent_profile_invites').where({ token:auth.session.parentInvite, status:'active' }).limit(1).get()).data || []
  if (!invites[0]) return { success:false, error:'请重新打开登记邀请' }
  const faceRegistration = await baiduPlayerFace.register(String(invites[0].playerId))
  return { success:true, faceRegistration }
}

async function completeParentProfile(event) {
  const authenticated = await authenticateParentH5Session(event)
  if (!authenticated.success) return authenticated
  const db = cloud.database(), inviteRows = (await db.collection('parent_profile_invites').where({ token: authenticated.session.parentInvite, status: 'active' }).limit(1).get()).data || []
  const invite = inviteRows[0]
  if (!invite) return { success: false, error: '家长协作邀请已失效' }
  const preview = await previewParentProfileInvite({ parentInvite: authenticated.session.parentInvite })
  if (!preview.success) return preview
  const playerResult = await db.collection('players').doc(String(invite.playerId || '')).get()
  const player = Array.isArray(playerResult.data) ? playerResult.data[0] : playerResult.data
  if (!player || String(player.teamId || '') !== String(invite.teamId || '')) {
    return { success: false, error: '邀请关联资料已发生变化，请联系球队管理员重新生成链接', code: 'PARENT_INVITE_BROKEN' }
  }
  const requirements = preview.data.requirements || {}
  const drafts = (await db.collection('parent_profile_drafts').where({ parentInvite: authenticated.session.parentInvite, basicConfirmed: true }).limit(10).get()).data || []
  let verifications = requirements.realName ? (await db.collection('parent_identity_verifications').where({ parentInvite: authenticated.session.parentInvite }).limit(1).get()).data || [] : []
  if (requirements.identityAlreadyVerified) {
    const reused = await resolveReusableRegistrationIdentity(db, player)
    if (!reused) return { success: false, error: '身份档案状态已变化，请刷新后重新核验', code: 'PARENT_IDENTITY_REUSE_CHANGED' }
    verifications.push(reused)
  }
  const portraits = requirements.portrait ? (await db.collection('parent_portraits').where({ parentInvite: authenticated.session.parentInvite, status: 'confirmed' }).limit(1).get()).data || [] : []
  const identityDocs = requirements.realName ? (await db.collection('parent_identity_documents').where({ parentInvite:authenticated.session.parentInvite, status:'uploaded' }).limit(10).get()).data || [] : []
  const identityFront = identityDocs.find(item => item.side === 'front')
  const identityBack = identityDocs.find(item => item.side === 'back' && item.documentType === 'resident_id')
  const authorizedDraft = drafts.find(parentDraftIsAuthorized)
  const hasExistingIdentity = verifications.some(item => ['approved','pending_review'].includes(String(item.status || ''))) || requirements.identityAlreadyVerified === true
  if (!authorizedDraft || (requirements.realName && !hasExistingIdentity && (!identityFront || (identityFront.documentType === 'resident_id' && !identityBack))) || (requirements.portrait && !portraits[0])) return { success: false, error: '请先完成本次邀请已开启的全部资料步骤' }
  const guardianPhone = String(player.guardianPhone || player.contactPhone || invite.guardianPhone || invite.registrantPhone || '').replace(/\D/g, '')
  if (String(preview.data.registrantType || '') === 'guardian' && !/^1[3-9]\d{9}$/.test(guardianPhone)) return { success:false, error:'请先由球队补充监护人电话，再提交资料', code:'GUARDIAN_PHONE_REQUIRED' }
  const playerPhone = String(player.playerPhone || player.contactPhone || invite.registrantPhone || '').replace(/\D/g, '')
  if (String(preview.data.registrantType || '') === 'self' && !/^1[3-9]\d{9}$/.test(playerPhone)) return { success:false, error:'请先补充球员本人电话，再提交资料', code:'PLAYER_PHONE_REQUIRED' }
  if (requirements.realName && !verifications.some(item => ['approved','pending_review'].includes(String(item.status || '')))) {
    const identitySubmission = await submitParentIdentityVerification({ parentSessionToken:event.parentSessionToken, parentInvite:authenticated.session.parentInvite, faceAssessment:event.faceAssessment })
    if (!identitySubmission || !identitySubmission.success) return identitySubmission || { success:false, error:'人证资料提交失败，请重试' }
    verifications = (await db.collection('parent_identity_verifications').where({ parentInvite:authenticated.session.parentInvite }).limit(1).get()).data || []
  }
  if (requirements.realName && !verifications.some(item => ['approved','pending_review'].includes(String(item.status || '')))) return { success:false, error:'人证审核状态异常，请联系球队负责人', code:'PARENT_IDENTITY_REVIEW_STATE_INVALID' }
  const submissionRows = (await db.collection('parent_profile_submissions').where({ parentInvite: authenticated.session.parentInvite }).limit(1).get()).data || []
  const previous = submissionRows[0] || {}
  const registrantType = String(preview.data.registrantType || 'guardian') === 'self' ? 'self' : 'guardian'
  const data = { parentInvite: authenticated.session.parentInvite, playerId: String(invite.playerId), teamId: String(invite.teamId), registrantType, registrantUserId: String(invite.registrantUserId || ''), portraitId: portraits[0] ? String(portraits[0]._id) : String(previous.portraitId || ''), avatarFileId: portraits[0] ? String(portraits[0].avatarFileId || '') : String(previous.avatarFileId || ''), verificationId: verifications[0] ? String(verifications[0]._id) : String(previous.verificationId || ''), requirementsSnapshot: requirements, submissionVersion:Number(previous.submissionVersion||0)+1, serviceAccountOpenId: authenticated.session.serviceAccountOpenId, status: 'submitted', updateTime: db.serverDate() }
  if (submissionRows[0]) await db.collection('parent_profile_submissions').doc(submissionRows[0]._id).update({ data })
  else await db.collection('parent_profile_submissions').add({ data: Object.assign({}, data, { createTime: db.serverDate() }) })
  const verification = verifications[0] || null
  const portrait = portraits[0] || null
  const identityMethod = verification ? String(verification.identityMethod || 'local_face_1to1') : 'not_required'
  const identityStatus = verification ? (verification.status === 'approved' ? (identityMethod === 'manual_per_event' ? 'manual_required' : 'verified') : 'pending_review') : 'not_required'
  const identityLabel = verification ? (verification.status === 'approved' ? '人证核验通过' : '人证核验待审核') : '本次无需核验'
  const playerUpdate = { registrantType, needsParentCompletion: false, profileStatus: 'complete', parentProfileCompletedAt: db.serverDate(), parentProfileSubmissionStatus: 'submitted', identityStatus, identityVerificationLabel:identityLabel, identityVerificationId:verification ? String(verification._id) : '', identityVerificationMethod:identityMethod, identityVerificationDisclosure:'平台人证核验，非权威库认证', updateTime: db.serverDate() }
  if (registrantType === 'guardian') {
    playerUpdate.guardianPhone = guardianPhone
    playerUpdate.guardianRelation = String(authorizedDraft.guardianRelation || 'other')
    playerUpdate.authorizationAgreed = true
    playerUpdate.guardianAuthorizedAt = db.serverDate()
  } else {
    playerUpdate.playerPhone = playerPhone
    playerUpdate.authorizationAgreed = true
    playerUpdate.selfAuthorizedAt = db.serverDate()
  }
  if (portrait) {
    playerUpdate.photoUrl = String(portrait.avatarFileId || portrait.transparentFileId || player.photoUrl || '')
    playerUpdate.photoFileID = playerUpdate.photoUrl
    playerUpdate.recentPortraitId = String(portrait._id || '')
    playerUpdate.recentPortraitConfirmedAt = portrait.confirmedAt || db.serverDate()
  }
  await db.collection('players').doc(invite.playerId).update({ data: playerUpdate })
  if (verification) {
    const profileRows = (await db.collection('player_identity_profiles').where({ playerId:String(invite.playerId) }).limit(2).get()).data || []
    const profileData = { playerId:String(invite.playerId), teamId:String(invite.teamId), orgId:String(invite.orgId || ''), verificationId:String(verification._id), status:identityStatus, verificationLabel:identityLabel, verificationDisclosure:'平台人证核验，非权威库认证', verificationMethod:identityMethod, verificationScope:identityMethod === 'local_face_1to1' ? 'platform' : 'organizer', identityNumberMasked:String(verification.identityNumberMasked || ''), documentType:String(verification.documentType || 'resident_id'), encryptedFaceFeature:verification.encryptedFaceFeature || null, featureStorageStatus:String(verification.featureStorageStatus || 'not_stored'), biometricConsent:verification.biometricConsent === true, portraitId:portrait ? String(portrait._id || '') : '', portraitFileId:portrait ? String(portrait.avatarFileId || portrait.transparentFileId || '') : '', seasonPhotoRefreshDue:true, updateTime:db.serverDate() }
    if (profileRows[0]) await db.collection('player_identity_profiles').doc(profileRows[0]._id).update({ data:profileData })
    else await db.collection('player_identity_profiles').add({ data:Object.assign({}, profileData, { createTime:db.serverDate() }) })
  }
  let certificateNumber = ''
  if (registrantType === 'self' && verification) {
    const certificates = (await db.collection('player_electronic_passes').where({ playerId:String(invite.playerId), status:'active' }).limit(2).get()).data || []
    if (certificates[0]) certificateNumber = String(certificates[0].certificateNumber || '')
    else {
      certificateNumber = 'SXF-' + Date.now().toString(36).toUpperCase() + '-' + String(invite.playerId).slice(-5).toUpperCase()
      await db.collection('player_electronic_passes').add({ data:{ sport:'football', playerId:String(invite.playerId), ownerUserId:String(invite.registrantUserId || ''), certificateNumber, status:'active', issuedAt:db.serverDate(), source:'adult_identity_verification', createTime:db.serverDate(), updateTime:db.serverDate() } })
    }
  }
  if (invite.orgId && invite.teamId) {
    try {
      const teamResult=await db.collection('teams').doc(String(invite.teamId)).get(),team=Array.isArray(teamResult.data)?teamResult.data[0]:teamResult.data
      const teamIds=[team&&team.ownerId,team&&team.ownerUserId,team&&team.creatorId,team&&team.userId].concat(team&&team.managerIds||[],team&&team.coachIds||[]).filter(Boolean).map(String)
      const memberships=(await db.collection('team_memberships').where({teamId:String(invite.teamId)}).limit(200).get()).data||[]
      memberships.forEach(member=>{
        const state=String(member.status||'active').toLowerCase(),roles=[].concat(member.positions||[],member.roles||[],member.position||[],member.role||[]).filter(Boolean).map(value=>String(value).toLowerCase()),permissions=member.permissions||[]
        const hasManage=Array.isArray(permissions)?permissions.indexOf('team.manage')>=0:Boolean(permissions&&permissions['team.manage'])
        if(['active','accepted','claimed'].indexOf(state)>=0&&(hasManage||roles.some(value=>['owner','admin','manager','coach','head_coach','team_owner','team_admin','team_manager','team_leader','teamleader'].indexOf(value)>=0||/球队负责人|教练|领队/.test(value))))teamIds.push(String(member.userId||member.memberUserId||member.ownerId||''))
      })
      const subscriptions=(await db.collection('parent_profile_review_subscriptions').where({parentInvite:String(invite.token||''),teamId:String(invite.teamId),status:'accepted'}).limit(10).get()).data||[]
      subscriptions.forEach(item=>teamIds.push(String(item.recipientUserId||'')))
      const recipientIds=Array.from(new Set(teamIds.filter(Boolean)))
      for(const recipientUserId of recipientIds){
        const dedupeKey='parent_profile_submitted:'+String(invite._id)+':'+String(verification&&verification._id||'no_identity')+':'+String(portrait&&portrait._id||'no_portrait')+':'+recipientUserId
        const existingMessage=(await db.collection('messages').where({orgId:String(invite.orgId),userId:recipientUserId,dedupeKey}).limit(1).get()).data||[]
        if(!existingMessage.length)await db.collection('messages').add({data:{orgId:String(invite.orgId),teamId:String(invite.teamId),userId:recipientUserId,category:'team',title:'球员资料待审核',subtitle:String(preview.data.playerName||'球员')+'已完成五步资料登记，请核对球员资料。',path:'/pages/team/player-detail/player-detail?teamId='+encodeURIComponent(String(invite.teamId))+'&playerId='+encodeURIComponent(String(invite.playerId)),dedupeKey,createdAt:db.serverDate(),createTime:db.serverDate(),updateTime:db.serverDate()}})
      }
    } catch (messageError) { console.warn('[completeParentProfile] team inbox notification skipped:', messageError && messageError.message || 'unknown') }
  }
  let serviceAccountNotification = { status:'not_subscribed' }
  try { serviceAccountNotification = await sendParentProfileReviewSubscription(invite, player, verification, preview.data.teamName) }
  catch (notificationError) { serviceAccountNotification = { status:'failed', code:String(notificationError.code || 'SERVICE_SUBSCRIBE_SEND_FAILED') }; console.warn('[completeParentProfile] service account subscription send skipped:', notificationError && notificationError.message || 'unknown') }
  const faceRegistration = player.faceRegistrationStatus === 'registered' ? { status:'registered' } : (portrait && portrait.baiduFaceConsent === true ? { status:'pending' } : { status:'consent_required' })
  return {
    success: true,
    faceRegistration,
    status: 'submitted',
    submissionStatus: 'submitted',
    playerId: String(invite.playerId),
    playerName: preview.data.playerName,
    teamName: preview.data.teamName,
    registrantType,
    identityVerificationStatus:verification ? String(verification.status || 'pending_review') : 'not_required',
    serviceAccountNotificationStatus:serviceAccountNotification.status,
    certificateNumber,
    submittedAt: new Date().toISOString(),
    requirements: Object.assign({ basic: true }, requirements, { standardPortrait: Boolean(requirements.portrait), playerAvatar: Boolean(requirements.portrait) })
  }
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
  if (session.principalType === 'platform_owner' && session.channel === 'platform_password') {
    const platformUser = { _id: 'platform-owner', nickname: '平台负责人', role: 'platform_owner', isPlatformOwner: true, orgId: '' }
    db.collection('auth_sessions').doc(session._id).update({ data: { lastUsedAt: db.serverDate() } }).catch(() => {})
    return { success: true, session, user: platformUser, userId: platformUser._id, orgId: '', principalType: 'platform_owner' }
  }
  const userResult = await db.collection('users').doc(session.userId).get()
  const rawUser = Array.isArray(userResult.data) ? userResult.data[0] : userResult.data
  if (!rawUser) return { success: false, error: '登录账号不存在，请重新登录', code: 'AUTH_REQUIRED' }
  const user = await ensureUserOrgId(db, rawUser)
  const activeOrgId = String(session.activeOrgId || '')
  if (activeOrgId && (user.organizationIds || []).includes(activeOrgId)) {
    user.orgId = activeOrgId
    user.organizationConflict = false
  }
  db.collection('auth_sessions').doc(session._id).update({ data: { lastUsedAt: db.serverDate() } }).catch(() => {})
  return { success: true, session, user, userId: user._id, orgId: user.orgId }
}

function normalizedUserIdentityValues(user) {
  return Array.from(new Set([
    user && user._id,
    user && user.uid,
    user && user.userId,
    user && user.phone,
    user && user.phoneNumber,
    user && user.openId,
    user && user.openid,
    user && user.wechatOpenId,
    user && user._openid
  ].filter(Boolean).map(value => String(value))))
}

function addOrganizationCandidate(target, value, user) {
  const candidate = String(value || '').trim()
  if (!candidate || !user || candidate === String(user._id || '')) return
  target.add(candidate)
}

async function safeOrganizationRows(db, collection, query, limit) {
  try {
    const ref = db.collection(collection)
    const result = query
      ? await ref.where(query).limit(limit || 100).get()
      : await ref.limit(limit || 100).get()
    return result.data || []
  } catch (err) {
    console.warn('[webApi] organization lookup skipped:', collection, err.message || err)
    return []
  }
}

async function resolveUserOrganization(db, user) {
  const _ = db.command
  const candidates = new Set()
  const explicitIds = [user.orgId, user.organizationId, user.organization_id]

  const identityValues = normalizedUserIdentityValues(user)
  const membershipConditions = []
  identityValues.forEach(value => {
    membershipConditions.push({ userId: value }, { memberUserId: value }, { openId: value }, { wechatOpenId: value })
  })
  const memberships = membershipConditions.length
    ? await safeOrganizationRows(db, 'organization_memberships', _.or(membershipConditions), 100)
    : []
  const activeMemberships = memberships.filter(item => {
    const status = String(item.status || 'active').toLowerCase()
    return !['disabled', 'removed', 'rejected', 'inactive'].includes(status)
  })
  const eventMemberships = activeMemberships.filter(grantsEventAccess)
  eventMemberships.forEach(item => {
    addOrganizationCandidate(candidates, item.orgId || item.organizationId || item.organization_id, user)
  })

  const ownerConditions = []
  identityValues.forEach(value => {
    ownerConditions.push(
      { creatorId: value }, { organizerId: value }, { ownerId: value },
      { userId: value }, { createdBy: value }, { creator: value }
    )
  })
  const tournaments = ownerConditions.length
    ? await safeOrganizationRows(db, 'tournaments', _.or(ownerConditions), 100)
    : []
  tournaments.forEach(item => {
    addOrganizationCandidate(candidates, item.orgId || item.organizationId || item.organization_id, user)
  })
  if (!candidates.size) explicitIds.forEach(item => addOrganizationCandidate(candidates, item, user))

  const candidateIds = Array.from(candidates)
  if (!candidateIds.length) {
    return { orgId: '', organizationIds: [], organizationConflict: false }
  }
  const organizations = await safeOrganizationRows(db, 'organizations', { _id: _.in(candidateIds) }, 100)
  const validIds = Array.from(new Set(
    organizations.map(item => String(item && item._id || '')).filter(Boolean)
  ))
  return { ...chooseOrganizerOrganization({
    validIds,
    explicitIds,
    memberships: eventMemberships,
    tournamentOrgIds: tournaments.map(item => item.orgId || item.organizationId || item.organization_id)
  }), organizationIds: validIds }
}

async function ensureUserOrgId(db, user) {
  if (!user || !user._id) throw new Error('账号归属信息不完整')
  const resolved = await resolveUserOrganization(db, user)
  const orgId = resolved.orgId
  const legacyPersonalOrgId = String(user.orgId || '') === String(user._id)
  if (orgId && String(user.orgId || '') !== orgId) {
    await db.collection('users').doc(user._id).update({
      data: { orgId, updateTime: db.serverDate() }
    })
  }
  if (!orgId && legacyPersonalOrgId) {
    await db.collection('users').doc(user._id).update({
      data: { orgId: '', updateTime: db.serverDate() }
    })
  }
  return {
    ...user,
    orgId,
    organizationIds: resolved.organizationIds,
    organizationConflict: resolved.organizationConflict
  }
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

function recordOrganizationIds(record) {
  if (!record) return []
  return Array.from(new Set([
    record.orgId,
    record.organizationId,
    record.organization_id
  ].filter(Boolean).map(value => String(value))))
}

function recordHasOrg(record, orgId) {
  const expected = String(orgId || '')
  const ids = recordOrganizationIds(record)
  // 兼容历史 organizationId；多个机构字段不一致时拒绝，避免掩盖租户冲突。
  return Boolean(expected && ids.length > 0 && ids.every(value => value === expected))
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

  // creatorId/ownerId 只记录具体创建人，不能替代当前机构租户。
  // 缺少一致机构字段的历史记录不进入工作空间索引，避免被间接读写。
  const teams = (teamResult.data || []).filter(team => recordHasOrg(team, user.orgId))
  const tournaments = (tournamentResult.data || []).filter(tournament => recordHasOrg(tournament, user.orgId))

  const scope = {
    user,
    orgId: user.orgId,
    organizationIds: Array.isArray(user.organizationIds) ? user.organizationIds : [],
    organizationConflict: user.organizationConflict === true,
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
  if (scope.staff) return recordBelongsToStaffEvent(collection, record, scope)
  if (recordHasOrg(record, scope.orgId)) return true

  if (collection === 'teams') {
    return scope.teamIds.has(record._id)
  }
  if (collection === 'tournaments') {
    return scope.tournamentIds.has(record._id)
  }
  if (collection === 'players' || collection === 'coaches' || collection === 'management') {
    return recordTeamKeys(record).some(value => scope.teamIds.has(value) || scope.teamCodes.has(value))
  }
  if (collection === 'registration_player_drafts') {
    return scope.tournamentIds.has(record.tournamentId) ||
      recordTeamKeys(record).some(value => scope.teamIds.has(value) || scope.teamCodes.has(value))
  }
  if (collection === 'player_library' || collection === 'coach_library') {
    return recordHasOrg(record, scope.orgId)
  }
  if (collection === 'referees' || collection === 'referee_invitations') {
    return scope.tournamentIds.has(record.tournamentId)
  }
  if (collection === 'divisions') {
    return scope.tournamentIds.has(record.tournamentId)
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
  if (scope.staff && collection === 'teams' && !record._id) return String(record.tournamentId || '') === scope.tournamentId && String(record.orgId || '') === scope.orgId
  if (scope.staff) return recordBelongsToStaffEvent(collection, record, scope)
  if (collection === 'teams' || collection === 'tournaments' || collection === 'referees' ||
      collection === 'referee_invitations' || collection === 'player_library' ||
      collection === 'coach_library') return true
  if (collection === 'players' || collection === 'coaches' || collection === 'management') {
    return recordTeamKeys(record).some(value => scope.teamIds.has(value) || scope.teamCodes.has(value))
  }
  if (collection === 'registration_player_drafts') {
    return recordTeamKeys(record).some(value => scope.teamIds.has(value) || scope.teamCodes.has(value))
  }
  if (collection === 'matches' || collection === 'tournament_referees' ||
      collection === 'tournament_teams' || collection === 'tournament_groups' ||
      collection === 'tournament_bracket' || collection === 'tournament_league_tables' ||
      collection === 'rosters' || collection === 'roster_change_requests' ||
      collection === 'standings' || collection === 'schedule_info' ||
      collection === 'divisions') {
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
  if (collection === 'players') require('./data-center/write-policy.cjs').assertPlayerFactWrite(data)
  const next = { ...(data || {}) }
  next.orgId = scope.orgId
  next.creatorId = scope.user._id
  if (collection === 'tournaments') next.organizerId = scope.user._id
  if (collection === 'teams') next.ownerId = scope.user._id
  if (scope.staff && collection === 'teams') next.tournamentId = scope.tournamentId
  if (collection === 'player_library') next.owner = scope.user._id
  if (collection === 'coach_library') next.creator = scope.user._id
  if (collection === 'divisions') {
    const mode = normalizeDivisionMode(next)
    next.mode = mode
    next.isProfessional = mode === 'professional'
    // 当前推广阶段两种运行模式均免费；状态仍由服务端写入，不能由浏览器伪造。
    delete next.professionalEntitlementStatus
    delete next.entitlementStatus
    delete next.professionalEntitlement
    delete next.professionalEntitlementExpiresAt
    delete next.entitlementExpiresAt
    next.professionalEntitlementStatus = mode === 'professional' ? 'free_current_phase' : 'not_required'
    next.professionalAccessPhase = mode === 'professional' ? 'early_free' : ''
    next.ruleStatus = 'draft'
    next.ruleProgress = Math.max(0, Math.min(Number(next.ruleProgress) || 0, 99))
    delete next.rulesLocked
    delete next.ruleFinalized
    delete next.rulesVersion
    delete next.rulesSnapshot
    delete next.finalizedAt
    delete next.finalizedBy
    delete next.finalizedByName
  }
  return next
}

const DIVISION_ENTITLEMENT_ACTIVE_STATUSES = new Set([
  'active', 'enabled', 'paid', 'purchased', 'effective', 'valid'
])
const EVENT_PROFESSIONAL_FREE_PHASE = true

function normalizeDivisionMode(record) {
  const source = record || {}
  const raw = String(source.mode || source.plan || '').toLowerCase()
  if (raw === 'professional' || raw === 'pro' || source.isProfessional === true) return 'professional'
  return 'simple'
}

function normalizeDivisionGender(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (['male', 'man', 'men', '男', '男子', '男子组'].includes(normalized)) return '男子组'
  if (['female', 'woman', 'women', '女', '女子', '女子组'].includes(normalized)) return '女子组'
  if (['mixed', 'mix', '不限', '混合', '混合组'].includes(normalized)) return '混合组'
  return ''
}

function divisionEntitlementIsActive(record) {
  if (!record) return false
  const entitlement = record.professionalEntitlement && typeof record.professionalEntitlement === 'object'
    ? record.professionalEntitlement
    : null
  const status = String(
    record.professionalEntitlementStatus || record.entitlementStatus ||
    (entitlement && entitlement.status) || ''
  ).toLowerCase()
  if (!DIVISION_ENTITLEMENT_ACTIVE_STATUSES.has(status)) return false
  const expiresAt = dateValue(
    record.professionalEntitlementExpiresAt || record.entitlementExpiresAt ||
    (entitlement && (entitlement.expiresAt || entitlement.expireAt))
  )
  return !expiresAt || expiresAt > Date.now()
}

function divisionProfessionalAccessAllowed(record) {
  return Boolean(EVENT_PROFESSIONAL_FREE_PHASE && normalizeDivisionMode(record) === 'professional') || divisionEntitlementIsActive(record)
}

function divisionRulesLocked(record) {
  if (!record) return false
  return record.rulesLocked === true || record.ruleFinalized === true ||
    ['finalized', 'locked', 'published'].includes(String(record.ruleStatus || '').toLowerCase())
}

function competitionPlanLocked(record) {
  if (!record) return false
  return record.competitionPlanLocked === true || record.finalPlanLocked === true ||
    ['locked', 'match_management', 'in_progress', 'completed'].includes(String(record.competitionPlanStatus || '').toLowerCase())
}

function divisionRecordMatches(record, divisionId) {
  if (!record) return false
  const explicit = record.divisionId ?? record.division ?? record.divisionKey
  if (explicit === undefined || explicit === null || explicit === '') return String(divisionId) === 'default'
  return String(explicit) === String(divisionId)
}

async function queryTournamentDivisionRecords(db, collection, tournamentId, divisionId) {
  const result = await db.collection(collection).where({ tournamentId }).limit(1000).get()
  return (result.data || []).filter(record => divisionRecordMatches(record, divisionId))
}

function collectDrawTeamIds(records) {
  const ids = new Set()
  const add = value => { if (value) ids.add(String(value)) }
  ;(records || []).forEach(record => {
    ;(Array.isArray(record.teams) ? record.teams : []).forEach(team => add(team && (team.teamId || team.id || team._id)))
    ;(Array.isArray(record.slots) ? record.slots : []).forEach(team => add(team && (team.teamId || team.id || team._id)))
    ;(Array.isArray(record.ranking) ? record.ranking : []).forEach(team => add(team && (team.teamId || team.id || team._id)))
    ;(Array.isArray(record.matches) ? record.matches : []).forEach(match => {
      ;['slot1', 'slot2', 'home', 'away', 'homeTeam', 'awayTeam'].forEach(key => {
        const team = match && match[key]
        add(team && (team.teamId || team.id || team._id))
      })
    })
  })
  return ids
}

function drawTypeForDivision(division, tournament) {
  return String(
    division && (division.formatType || division.tournamentType || division.type) ||
    tournament && (tournament.formatType || tournament.tournamentType || tournament.type) || 'tournament'
  ).toLowerCase()
}

function drawIsReady(division, tournament, drawRecords, approvedTeamCount) {
  if (!drawRecords || !drawRecords.length) return false
  const type = drawTypeForDivision(division, tournament)
  const teamIds = collectDrawTeamIds(drawRecords)
  if (teamIds.size < Math.min(Math.max(approvedTeamCount, 2), 1000)) return false
  if (type === 'cup' || type === 'knockout') {
    return drawRecords.some(record => Array.isArray(record.matches) && record.matches.length > 0)
  }
  return drawRecords.some(record => Array.isArray(record.teams) && record.teams.length > 0)
}

function unresolvedScheduleMatches(matches) {
  const unresolved = (matches || []).filter(match => {
    const missingSlot = !match.matchDate || !match.matchTime || !match.venue
    const explicitConflict = match.hasConflict === true || match.scheduleConflict === true ||
      String(match.conflictStatus || '').toLowerCase() === 'conflict'
    return missingSlot || explicitConflict || String(match.status || '').toLowerCase() === 'cancelled'
  })
  const occupied = new Map()
  const duplicateSlots = []
  ;(matches || []).forEach(match => {
    if (!match.matchDate || !match.matchTime || !match.venue) return
    const key = `${match.matchDate}|${match.matchTime}|${match.venue}`
    const list = occupied.get(key) || []
    list.push(match)
    occupied.set(key, list)
    if (list.length > 1) duplicateSlots.push(...list)
  })
  return [...new Set(unresolved.concat(duplicateSlots))]
}

function compactCompetitionSnapshot(division, relations, drawRecords, matches) {
  const rulesSource = division && (division.rulesSnapshot || division)
  const ruleFields = [
    'formatType', 'tournamentType', 'mode', 'isProfessional', 'expectedTeams', 'groupCount',
    'teamsPerGroup', 'groupCycle', 'advancePerGroup', 'knockoutSize', 'knockoutType',
    'knockoutLegs', 'bracketSource', 'venueMode', 'homeAwayEnabled', 'thirdPlaceEnabled',
    'knockoutTieBreak', 'birthDateCutoff', 'birthDateStart', 'birthDateEnd', 'eligibilityNotes', 'rosterLimit', 'minimumRoster',
    'identityVerificationRequired', 'eligibilityReviewRequired', 'portraitRequired',
    'identityDocumentRequired', 'insuranceRequired', 'waiverRequired', 'singleDivisionOnly',
    'registrationDeadline', 'lockRosterAfterDeadline', 'periodMode', 'matchMinutes',
    'singlePeriodCount', 'breakMinutes', 'playersOnField', 'substitutionMode', 'substitutionLimit',
    'substitutionWindows', 'substitutionReentryAllowed',
    'disciplineEnabled', 'yellowCardSuspension', 'redCardSuspension', 'secondYellowRed',
    'knockoutYellowReset', 'winPoints', 'drawPoints', 'lossPoints', 'drawResolution',
    'penaltyWinPoints', 'penaltyLossPoints', 'rankingRule', 'rankingTieBreakers',
    'awayGoalsEnabled', 'liveRankingEnabled', 'manualRankingReview', 'advancementRule',
    'sameGroupAvoidance', 'regulationDetails'
  ]
  const rules = {}
  ruleFields.forEach(field => { if (rulesSource && rulesSource[field] !== undefined) rules[field] = rulesSource[field] })
  return {
    rules,
    teams: (relations || []).map(item => ({
      id: String(item._id || ''), teamId: String(item.teamId || ''), status: String(item.status || 'approved'),
      divisionId: String(item.divisionId || item.division || '')
    })).filter(item => item.id || item.teamId).slice(0, 500),
    draw: (drawRecords || []).map(item => ({
      id: String(item._id || ''), type: String(item.type || ''), groupName: String(item.groupName || item.tableName || item.name || ''),
      groupCode: String(item.groupCode || item.tableCode || ''), teamCount: Number(item.teamCount || (Array.isArray(item.teams) ? item.teams.length : 0)),
      teams: (Array.isArray(item.teams) ? item.teams : Array.isArray(item.ranking) ? item.ranking : []).map(team => ({ teamId: String(team && (team.teamId || team.id || team._id) || ''), teamName: String(team && (team.teamName || team.name) || '') })).filter(team => team.teamId).slice(0, 128)
    })).filter(item => item.id || item.teamCount > 0).slice(0, 200),
    schedule: (matches || []).map(match => ({
      id: String(match._id || ''), matchDate: match.matchDate || match.date || '', matchTime: match.matchTime || match.time || '',
      venue: String(match.venue || ''), homeTeamId: String(match.homeTeamId || ''), awayTeamId: String(match.awayTeamId || ''),
      status: String(match.status || 'scheduled'), round: String(match.round || match.roundName || '')
    })).filter(item => item.id).slice(0, 1000)
  }
}

const COMPETITION_PLAN_MUTABLE_COLLECTIONS = new Set([
  'matches', 'tournament_groups', 'tournament_bracket', 'tournament_league_tables', 'tournament_teams'
])

// 比赛现场数据只能由获得当前场次授权的裁判工作流写入。
// PC 端和通用 dbQuery 只能读取这些集合，避免绕过 serviceMatchWorkflow 修改现场记录。
const REFEREE_CONTROLLED_COLLECTIONS = new Set(['match_events', 'match_referees', 'squads'])

async function competitionPlanMutationAllowed(db, collection, record) {
  if (!COMPETITION_PLAN_MUTABLE_COLLECTIONS.has(collection) || !record) return true
  const divisionId = String(record.divisionId || record.division || record.divisionKey || '').trim()
  try {
    // 参赛球队尚未进入赛程时必须允许继续增补。规则定版不等于竞赛方案锁定；
    // 只有该组别已经形成比赛后，才按正式竞赛方案锁定关系拦截新增球队。
    if (collection === 'tournament_teams') {
      const tournamentId = String(record.tournamentId || '').trim()
      if (!tournamentId) return false
      const matches = await queryTournamentDivisionRecords(db, 'matches', tournamentId, divisionId || 'default')
      if (!matches.length) return true
    }
    if (divisionId) {
      const result = await db.collection('divisions').doc(divisionId).get()
      const division = Array.isArray(result.data) ? result.data[0] : result.data
      if (division && competitionPlanLocked(division)) return false
    }

    const tournamentId = String(record.tournamentId ||
      (record.tournament && (record.tournament._id || record.tournament.id)) || '').trim()
    if (!tournamentId) return true
    const tournamentResult = await db.collection('tournaments').doc(tournamentId).get()
    const tournament = Array.isArray(tournamentResult.data) ? tournamentResult.data[0] : tournamentResult.data
    if (!tournament) return true
    if (competitionPlanLocked(tournament)) return false
    if (!divisionId && Array.isArray(tournament.divisions) && tournament.divisions.some(competitionPlanLocked)) return false
    return true
  } catch (error) {
    console.error('[webApi] competition plan mutation check failed:', error.message || error)
    return false
  }
}

async function deleteDivision(db, id, organizerScope) {
  if (!organizerScope || !organizerScope.orgId) {
    return { success: false, error: '当前账号尚未关联机构，请先完成机构引导', code: 'ORG_REQUIRED' }
  }
  const divisionId = String(id || '').trim()
  if (!divisionId) return { success: false, error: '缺少竞赛组别 ID', code: 'DIVISION_ID_REQUIRED' }
  const divisionResult = await db.collection('divisions').doc(divisionId).get()
  const division = Array.isArray(divisionResult.data) ? divisionResult.data[0] : divisionResult.data
  if (!division || !organizerRecordAllowed('divisions', division, organizerScope)) {
    return { success: false, error: '组别不存在或无权删除', code: 'DIVISION_SCOPE_DENIED' }
  }
  if (divisionRulesLocked(division) || competitionPlanLocked(division)) {
    return { success: false, error: '组别规则已经定版或竞赛方案已经锁定，不能删除', code: 'DIVISION_LOCKED' }
  }
  if (divisionEntitlementIsActive(division)) {
    return { success: false, error: '该组别已开通专业版权益，不能直接删除', code: 'DIVISION_ENTITLEMENT_ACTIVE' }
  }

  const tournamentId = String(division.tournamentId || '').trim()
  if (!tournamentId) return { success: false, error: '组别缺少赛事归属，不能删除', code: 'DIVISION_TOURNAMENT_REQUIRED' }
  let tournament
  try {
    const tournamentResult = await db.collection('tournaments').doc(tournamentId).get()
    tournament = Array.isArray(tournamentResult.data) ? tournamentResult.data[0] : tournamentResult.data
  } catch (error) {
    return { success: false, error: '赛事读取失败，请刷新后重试', code: 'TOURNAMENT_READ_FAILED' }
  }
  if (!tournament || !organizerRecordAllowed('tournaments', tournament, organizerScope)) {
    return { success: false, error: '赛事不存在或无权删除该组别', code: 'TOURNAMENT_SCOPE_DENIED' }
  }
  if (competitionPlanLocked(tournament)) {
    return { success: false, error: '赛事竞赛方案已经锁定，不能删除组别', code: 'COMPETITION_PLAN_LOCKED' }
  }

  const linkedCollections = [
    ['tournament_teams', '参赛球队'],
    ['tournament_groups', '抽签分组'],
    ['tournament_bracket', '淘汰对阵'],
    ['tournament_league_tables', '联赛签位'],
    ['matches', '赛程比赛']
  ]
  const linked = []
  for (const item of linkedCollections) {
    const rows = await queryTournamentDivisionRecords(db, item[0], tournamentId, divisionId)
    if (rows.length > 0) linked.push(`${item[1]}${rows.length}条`)
  }
  if (linked.length > 0) {
    return {
      success: false,
      error: `该组别仍有关联数据（${linked.join('、')}），请先清理后再删除`,
      code: 'DIVISION_HAS_LINKED_DATA',
      linked
    }
  }

  await db.collection('divisions').doc(divisionId).remove()
  if (Array.isArray(tournament.divisions)) {
    const nestedDivisions = tournament.divisions.filter(item => {
      const nestedId = String(item && (item._id || item.id || item.divisionId || '') || '').trim()
      return nestedId !== divisionId
    })
    if (nestedDivisions.length !== tournament.divisions.length) {
      await db.collection('tournaments').doc(tournamentId).update({
        data: { divisions: nestedDivisions, updateTime: db.serverDate() }
      })
    }
  }
  return { success: true, deleted: 1, message: '组别已删除' }
}

function normalizeDivisionDisplayName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 30)
}

async function renameDivision(db, id, data, organizerScope) {
  if (!organizerScope || !organizerScope.orgId) {
    return { success: false, error: '当前账号尚未关联机构，请先完成机构引导', code: 'ORG_REQUIRED' }
  }
  const divisionId = String(id || '').trim()
  const nextName = normalizeDivisionDisplayName(data && data.name)
  if (!divisionId) return { success: false, error: '缺少竞赛组别 ID', code: 'DIVISION_ID_REQUIRED' }
  if (nextName.length < 2) return { success: false, error: '组别名称至少填写 2 个字符', code: 'DIVISION_NAME_REQUIRED' }

  const result = await db.collection('divisions').doc(divisionId).get()
  const before = Array.isArray(result.data) ? result.data[0] : result.data
  if (!before || !organizerRecordAllowed('divisions', before, organizerScope)) {
    return { success: false, error: '组别不存在或无权修改', code: 'DIVISION_SCOPE_DENIED' }
  }
  const tournamentId = String(before.tournamentId || '').trim()
  if (!tournamentId) return { success: false, error: '组别缺少赛事归属', code: 'DIVISION_TOURNAMENT_REQUIRED' }
  const siblings = (await db.collection('divisions').where({ tournamentId }).limit(1000).get()).data || []
  const duplicate = siblings.some(item => String(item._id) !== divisionId && normalizeDivisionDisplayName(item.name || item.divisionName).toLowerCase() === nextName.toLowerCase())
  if (duplicate) return { success: false, error: `组别名称“${nextName}”已存在`, code: 'DIVISION_NAME_DUPLICATE' }
  if (normalizeDivisionDisplayName(before.name || before.divisionName) === nextName) {
    return { success: true, data: before, message: '组别名称未变化' }
  }

  const linkedCollections = [
    'tournament_teams', 'matches', 'tournament_groups', 'tournament_bracket',
    'tournament_league_tables', 'roster_snapshots', 'referee_invitations'
  ]
  const linkedRows = {}
  for (const collection of linkedCollections) {
    try {
      const rows = (await db.collection(collection).where({ tournamentId, divisionId }).limit(1000).get()).data || []
      if (rows.length >= 1000) return { success: false, error: `组别关联的${collection}记录过多，请联系平台处理`, code: 'DIVISION_RENAME_LIMIT' }
      linkedRows[collection] = rows
    } catch (error) {
      linkedRows[collection] = []
    }
  }

  await db.collection('divisions').doc(divisionId).update({ data: {
    name: nextName,
    divisionName: nextName,
    nameSource: 'custom',
    renamedAt: db.serverDate(),
    renamedByUserId: organizerScope.user._id,
    updateTime: db.serverDate()
  } })
  try {
    const tournamentResult = await db.collection('tournaments').doc(tournamentId).get()
    const tournament = Array.isArray(tournamentResult.data) ? tournamentResult.data[0] : tournamentResult.data
    if (tournament && Array.isArray(tournament.divisions)) {
      const nestedDivisions = tournament.divisions.map(item => {
        const nestedId = String(item && (item._id || item.id || item.divisionId || '') || '')
        return nestedId === divisionId ? { ...item, name: nextName, divisionName: nextName, nameSource: 'custom' } : item
      })
      await db.collection('tournaments').doc(tournamentId).update({ data: { divisions: nestedDivisions, updateTime: db.serverDate() } })
    }
  } catch (error) {
    console.warn('[webApi] nested division rename skipped:', error.message || error)
  }
  const updated = {}
  for (const collection of linkedCollections) {
    updated[collection] = 0
    for (const row of linkedRows[collection]) {
      if (!row || !row._id) continue
      await db.collection(collection).doc(row._id).update({ data: { divisionName: nextName, updateTime: db.serverDate() } })
      updated[collection] += 1
    }
  }
  return {
    success: true,
    data: { ...before, name: nextName, divisionName: nextName, nameSource: 'custom' },
    details: { updated },
    message: `组别已重命名为“${nextName}”`
  }
}

async function deleteTournamentWorkspace(db, id, organizerScope, confirmText) {
  if (!organizerScope || !organizerScope.orgId) {
    return { success: false, error: '当前账号尚未关联机构，请先完成机构引导', code: 'ORG_REQUIRED' }
  }
  const tournamentId = String(id || '').trim()
  if (!tournamentId) return { success: false, error: '缺少赛事 ID', code: 'TOURNAMENT_ID_REQUIRED' }
  if (String(confirmText || '').trim() !== '删除') {
    return { success: false, error: '请输入“删除”确认文本', code: 'DELETE_CONFIRMATION_REQUIRED' }
  }

  const tournamentResult = await db.collection('tournaments').doc(tournamentId).get()
  const tournament = Array.isArray(tournamentResult.data) ? tournamentResult.data[0] : tournamentResult.data
  if (!tournament || !organizerRecordAllowed('tournaments', tournament, organizerScope)) {
    return { success: false, error: '赛事不存在或无权删除', code: 'TOURNAMENT_SCOPE_DENIED' }
  }

  async function deleteByTournament(collection, where) {
    let total = 0
    const batchSize = 500
    while (true) {
      let rows
      try {
        rows = (await db.collection(collection).where(where).limit(batchSize).get()).data || []
      } catch (error) {
        const message = String(error && (error.message || error.errMsg) || '').toLowerCase()
        const code = String(error && (error.code || error.errCode) || '').toLowerCase()
        const missing = code.includes('collection_not_exist') || code.includes('resourcenotfound') ||
          message.includes('collection not exist') || message.includes('collection does not exist') ||
          message.includes('table not exist') || message.includes('not found collection')
        if (missing) return { deleted: total, skipped: true }
        throw error
      }
      if (!rows.length) break
      for (const row of rows) {
        if (!row || !row._id) continue
        await db.collection(collection).doc(row._id).remove()
        total += 1
      }
      if (rows.length < batchSize) break
    }
    return { deleted: total, skipped: false }
  }

  const workspaceFilters = [
    ['tournament_teams', '报名球队'],
    ['tournament_groups', '抽签分组'],
    ['tournament_bracket', '淘汰对阵'],
    ['tournament_league_tables', '联赛签位'],
    ['roster_snapshots', '名单快照'],
    ['tournament_referees', '裁判指派'],
    ['referee_invitations', '裁判邀请'],
    ['matches', '比赛'],
    ['divisions', '组别']
  ]

  const deleted = {}
  const skipped = []
  for (const item of workspaceFilters) {
    try {
      const result = await deleteByTournament(item[0], { tournamentId })
      deleted[item[0]] = result.deleted
      if (result.skipped) skipped.push(item[0])
    } catch (error) {
      console.error('[webApi] tournament workspace delete failed:', item[0], error.message || error)
      return {
        success: false,
        error: `清理${item[1]}失败，请重试；已清理部分可安全重复删除`,
        code: 'TOURNAMENT_WORKSPACE_DELETE_FAILED',
        details: { tournamentId, failedCollection: item[0], deleted, skipped }
      }
    }
  }

  try {
    const removed = await db.collection('tournaments').doc(tournamentId).remove()
    if (!removed.stats || removed.stats.removed !== 1) {
      return { success: false, error: '赛事主体删除未完成，请刷新后重试', code: 'TOURNAMENT_DELETE_NOT_CONFIRMED', details: { tournamentId, deleted, skipped } }
    }
  } catch (error) {
    console.error('[webApi] tournament document delete failed:', error.message || error)
    return { success: false, error: '赛事主体删除失败，请重试', code: 'TOURNAMENT_DELETE_FAILED', details: { tournamentId, deleted, skipped } }
  }
  return {
    success: true,
    deleted: 1 + Object.values(deleted).reduce((sum, num) => sum + Number(num || 0), 0),
    details: {
      tournamentId,
      deleted,
      skipped
    },
    message: '赛事与关联工作区已删除，球队资料和球员资料未受影响'
  }
}

async function assignTournamentTeamDivision(db, id, data, organizerScope) {
  if (!organizerScope || !organizerScope.orgId) return { success: false, error: '当前账号尚未关联机构', code: 'ORG_REQUIRED' }
  const relationId = String(id || '').trim()
  const divisionId = String(data && data.divisionId || '').trim()
  if (!relationId || !divisionId || divisionId === 'default') return { success: false, error: '请选择正式竞赛组别', code: 'DIVISION_REQUIRED' }
  const relationResult = await db.collection('tournament_teams').doc(relationId).get()
  const relation = Array.isArray(relationResult.data) ? relationResult.data[0] : relationResult.data
  if (!relation || !organizerRecordAllowed('tournament_teams', relation, organizerScope)) return { success: false, error: '参赛关系不存在或无权操作', code: 'REGISTRATION_SCOPE_DENIED' }
  if (String(relation.divisionId || 'default') !== 'default') return { success: false, error: '该球队已经属于正式竞赛组别', code: 'REGISTRATION_ALREADY_ASSIGNED' }
  const tournamentId = String(relation.tournamentId || '').trim()
  const tournamentResult = await db.collection('tournaments').doc(tournamentId).get()
  const tournament = Array.isArray(tournamentResult.data) ? tournamentResult.data[0] : tournamentResult.data
  if (!tournament || !organizerRecordAllowed('tournaments', tournament, organizerScope)) return { success: false, error: '赛事不存在或无权操作', code: 'TOURNAMENT_SCOPE_DENIED' }
  if (competitionPlanLocked(tournament)) return { success: false, error: '赛事竞赛方案已经锁定，不能重新分配球队', code: 'COMPETITION_PLAN_LOCKED' }
  const divisionResult = await db.collection('divisions').doc(divisionId).get()
  const division = Array.isArray(divisionResult.data) ? divisionResult.data[0] : divisionResult.data
  if (!division || String(division.tournamentId || '') !== tournamentId || !organizerRecordAllowed('divisions', division, organizerScope)) return { success: false, error: '目标组别不存在或不属于当前赛事', code: 'DIVISION_SCOPE_DENIED' }
  if (competitionPlanLocked(division)) return { success: false, error: '目标组别竞赛方案已经锁定', code: 'COMPETITION_PLAN_LOCKED' }
  const matches = await queryTournamentDivisionRecords(db, 'matches', tournamentId, divisionId)
  if (matches.length > 0) return { success: false, error: '目标组别已经生成赛程，不能再分配历史球队', code: 'DIVISION_SCHEDULE_EXISTS' }
  const teamId = String(relation.teamId || '').trim()
  const relations = (await db.collection('tournament_teams').where({ tournamentId, teamId }).limit(100).get()).data || []
  if (relations.some(item => String(item._id) !== relationId && String(item.divisionId || 'default') === divisionId && !['rejected', 'withdrawn', 'cancelled'].includes(String(item.status || '').toLowerCase()))) return { success: false, error: '该球队已在目标组别中', code: 'REGISTRATION_DUPLICATE' }
  const activeRelations = (await db.collection('tournament_teams').where({ tournamentId, divisionId }).limit(1000).get()).data || []
  const activeCount = activeRelations.filter(item => !['rejected', 'withdrawn', 'cancelled'].includes(String(item.status || '').toLowerCase())).length
  const capacity = Number(division.maxTeams || division.expectedTeams || 0)
  if (capacity > 0 && activeCount >= capacity) return { success: false, error: `目标组别名额已满（${activeCount}/${capacity}）`, code: 'DIVISION_CAPACITY_FULL' }
  const divisionName = String(division.name || division.divisionName || '').trim()
  await db.collection('tournament_teams').doc(relationId).update({ data: { divisionId, divisionName, assignedDivisionAt: db.serverDate(), assignedDivisionBy: organizerScope.user._id, updateTime: db.serverDate() } })
  try { await db.collection('registration_audit_logs').add({ data: { sport:'football', action:'registration_division_assigned', tournamentId, divisionId, registrationId:relationId, actorUserId:organizerScope.user._id, actorOrgId:organizerScope.orgId, result:'success', detail:{ sourceDivisionId:'default', teamId }, createTime:db.serverDate() } }) } catch (error) { console.warn('[webApi] 分配组别审计写入失败:', error.message) }
  return { success: true, message: `已分配至${divisionName}`, data: { relationId, divisionId, divisionName } }
}

function sanitizeDivisionUpdate(data, before) {
  const next = { ...(data || {}) }
  const requestedMode = normalizeDivisionMode(next)
  const previousMode = normalizeDivisionMode(before)
  if (previousMode === 'professional' && divisionEntitlementIsActive(before) && requestedMode === 'simple') {
    const error = new Error('专业版已开通，不能降级为简易版')
    error.code = 'DIVISION_PROFESSIONAL_LOCKED'
    throw error
  }

  // 规则定版、版本号和权益状态只能由受控服务端动作写入。
  ;[
    'rulesLocked', 'ruleFinalized', 'rulesVersion', 'rulesSnapshot', 'finalizedAt',
    'finalizedBy', 'finalizedByName', 'confirmedByUserId', 'confirmedByOrgId',
    'confirmedAt', 'professionalEntitlementStatus', 'entitlementStatus', 'professionalAccessPhase',
    'professionalEntitlement', 'professionalEntitlementExpiresAt', 'entitlementExpiresAt',
    'competitionPlanLocked', 'competitionPlanStatus', 'competitionPlanVersion',
    'competitionPlanSnapshot', 'competitionPlanLockedAt', 'competitionPlanLockedBy',
    'competitionPlanMode'
  ].forEach(field => { delete next[field] })
  if (Object.prototype.hasOwnProperty.call(data || {}, 'ruleStatus') &&
      ['finalized', 'locked', 'published'].includes(String(data.ruleStatus || '').toLowerCase())) {
    const error = new Error('竞赛规则必须通过正式确认动作定版')
    error.code = 'DIVISION_CONFIRM_REQUIRED'
    throw error
  }
  next.mode = requestedMode
  next.isProfessional = requestedMode === 'professional'
  normalizeFinalRankingSettings(next)
  if (Object.prototype.hasOwnProperty.call(next, 'regulationDetails')) {
    next.regulationDetails = sanitizeRegulationDetails(next.regulationDetails)
  }
  next.ruleStatus = 'draft'
  next.ruleProgress = Math.max(0, Math.min(Number(next.ruleProgress) || 0, 99))
  return next
}

function normalizeFinalRankingSettings(record) {
  if (!record) return record
  var formatType = String(record.formatType || record.tournamentType || '').toLowerCase()
  var mode = String(record.finalRankingMode || record.rankingScope || '').toLowerCase()
  if (formatType === 'league') mode = 'full'
  if (!['champion', 'top4', 'full'].includes(mode)) {
    mode = record.fullRankingEnabled === true ? 'full' : (record.thirdPlaceEnabled === false ? 'champion' : 'top4')
  }
  record.finalRankingMode = mode
  record.fullRankingEnabled = mode === 'full'
  record.thirdPlaceEnabled = mode !== 'champion'
  return record
}

const REGULATION_DETAIL_NUMBER_FIELDS = new Set([
  'teamLeaderLimit', 'coachLimit', 'doctorLimit', 'registrationFeePerPerson',
  'disciplineDepositPerTeam', 'depositRefundWorkdays', 'eligibilityComplaintDeadlineRound',
  'matchBallSize', 'lineupSubmissionMinutes', 'minimumPlayersToContinue',
  'firstHalfSubstitutionWindows', 'secondHalfSubstitutionWindows', 'halftimeSubstitutionWindows',
  'concussionSubstitutionLimit', 'benchTotalLimit', 'benchPlayerLimit', 'benchOfficialLimit',
  'jerseyNumberMin', 'jerseyNumberMax', 'stoppagePauseMinutes', 'stoppagePausePeriods',
  'stoppageDecisionHours', 'severeMisconductBanMonths'
])
const REGULATION_DETAIL_BOOLEAN_FIELDS = new Set([
  'officialsCanPlay', 'forfeitDepositDeduction', 'foreignPlayersAllowed',
  'professionalPlayersAllowed', 'femaleAdultAgeException', 'ageByYearOnly',
  'blacklistCheckRequired', 'teamKitPhotoRequired', 'unlimitedPlayersPerWindow',
  'substitutionReentryForbidden', 'keepHigherLiveScore', 'opponentConcussionSubstitution',
  'twoKitsRequired', 'captainArmbandRequired', 'shinGuardsRequired', 'metalStudsForbidden',
  'jerseyModificationForbidden', 'benchKitContrastRequired', 'resumeRemainingTimePreferred',
  'resumeStatePreserved', 'withdrawalVoidsResults', 'fairPlayDisqualification',
  'cardsCarryToNextStage', 'teamOfficialsDiscipline'
])
const REGULATION_DETAIL_SCORE_FIELDS = new Set(['eligibilityViolationScore', 'terminationForfeitScore'])

function sanitizeRegulationDetails(source) {
  const input = source && typeof source === 'object' && !Array.isArray(source) ? source : {}
  const result = {}
  REGULATION_DETAIL_NUMBER_FIELDS.forEach(field => {
    if (input[field] === null || input[field] === '' || input[field] === undefined) result[field] = null
    else {
      const value = Number(input[field])
      result[field] = Number.isFinite(value) ? Math.max(0, Math.min(value, 100000)) : null
    }
  })
  REGULATION_DETAIL_BOOLEAN_FIELDS.forEach(field => { result[field] = input[field] === true })
  REGULATION_DETAIL_SCORE_FIELDS.forEach(field => {
    const value = String(input[field] || '').trim().slice(0, 7)
    result[field] = /^\d{1,2}:\d{1,2}$/.test(value) ? value : ''
  })
  return result
}

function sanitizeTournamentUpdate(data, before) {
  const next = { ...(data || {}) }
  ;[
    'competitionPlanLocked', 'competitionPlanStatus', 'competitionPlanVersion',
    'competitionPlanLocks', 'competitionPlanSnapshot', 'competitionPlanLockedAt',
    'competitionPlanLockedBy', 'matchManagementReady'
  ].forEach(field => { delete next[field] })
  if (competitionPlanLocked(before)) {
    // 方案锁定后允许修改赛事展示资料，但不能从通用浏览器入口重写嵌套组别或状态。
    delete next.divisions
    delete next.currentStage
  }
  return next
}

function sanitizeOrganizerUpdate(data, collection, before) {
  if (collection === 'players') require('./data-center/write-policy.cjs').assertPlayerFactWrite(data)
  const next = { ...(data || {}) }
  ORGANIZER_IMMUTABLE_OWNERSHIP_FIELDS.forEach(field => { delete next[field] })
  if (collection === 'divisions') return sanitizeDivisionUpdate(next, before)
  if (collection === 'tournaments') return sanitizeTournamentUpdate(next, before)
  return next
}

function divisionRuleSnapshot(before, data) {
  const snapshot = { ...(before || {}), ...(data || {}) }
  ;[
    '_id', 'orgId', 'creatorId', 'organizerId', 'ownerId', 'userId', 'createdBy',
    'rulesLocked', 'ruleFinalized', 'ruleStatus', 'ruleProgress', 'rulesVersion',
    'rulesSnapshot', 'finalizedAt', 'finalizedBy', 'finalizedByName',
    'confirmedByUserId', 'confirmedByOrgId', 'confirmedAt', 'updateTime',
    'rulesHistory', 'activeRulesVersion', 'activeRulesSnapshot', 'rulesRevisionPending',
    'rulesRevisionOf', 'rulesVersionDraft',
    'professionalEntitlementStatus', 'entitlementStatus', 'professionalEntitlement', 'professionalAccessPhase',
    'professionalEntitlementExpiresAt', 'entitlementExpiresAt'
  ].forEach(field => { delete snapshot[field] })
  const mode = normalizeDivisionMode(snapshot)
  snapshot.mode = mode
  snapshot.isProfessional = mode === 'professional'
  normalizeFinalRankingSettings(snapshot)
  snapshot.regulationDetails = sanitizeRegulationDetails(snapshot.regulationDetails)
  return snapshot
}

async function reviseDivisionRules(db, id, organizerScope) {
  if (!organizerScope || !organizerScope.orgId) {
    return { success: false, error: '当前账号尚未关联机构，请先完成机构引导', code: 'ORG_REQUIRED' }
  }
  const divisionId = String(id || '')
  if (!divisionId) return { success: false, error: '缺少竞赛组别 ID', code: 'DIVISION_ID_REQUIRED' }
  const result = await db.collection('divisions').doc(divisionId).get()
  const before = Array.isArray(result.data) ? result.data[0] : result.data
  if (!before || !organizerRecordAllowed('divisions', before, organizerScope)) {
    return { success: false, error: '无权调整其他机构的竞赛组别', code: 'DIVISION_SCOPE_DENIED' }
  }
  if (!divisionRulesLocked(before)) {
    return { success: false, error: '当前规则草稿尚未定版，请继续编辑草稿', code: 'DIVISION_DRAFT_EXISTS' }
  }
  const currentVersion = String(before.rulesVersion || 'V1.0')
  const history = Array.isArray(before.rulesHistory) ? before.rulesHistory.slice(-19) : []
  const activeSnapshot = before.rulesSnapshot || divisionRuleSnapshot(before, {})
  history.push({
    version: currentVersion,
    snapshot: activeSnapshot,
    finalizedAt: before.finalizedAt || before.confirmedAt || null,
    finalizedBy: before.finalizedBy || before.confirmedByUserId || '',
    finalizedByName: before.finalizedByName || ''
  })
  const draftVersion = `${currentVersion}-R${history.length}`
  const now = new Date()
  const updateData = {
    rulesLocked: false,
    ruleFinalized: false,
    ruleStatus: 'draft',
    ruleProgress: 0,
    rulesRevisionPending: true,
    rulesRevisionOf: currentVersion,
    rulesVersionDraft: draftVersion,
    activeRulesVersion: currentVersion,
    activeRulesSnapshot: activeSnapshot,
    rulesHistory: history,
    updateTime: now
  }
  await db.collection('divisions').doc(divisionId).update({ data: updateData })
  return { success: true, data: { ...before, ...updateData }, message: `已基于 ${currentVersion} 创建规则草稿 ${draftVersion}` }
}

async function confirmDivisionRules(db, id, data, organizerScope) {
  if (!organizerScope || !organizerScope.orgId) {
    return { success: false, error: '当前账号尚未关联机构，请先完成机构引导', code: 'ORG_REQUIRED' }
  }
  const divisionId = String(id || '')
  if (!divisionId) return { success: false, error: '缺少竞赛组别 ID', code: 'DIVISION_ID_REQUIRED' }
  const result = await db.collection('divisions').doc(divisionId).get()
  const before = Array.isArray(result.data) ? result.data[0] : result.data
  if (!before || !organizerRecordAllowed('divisions', before, organizerScope)) {
    return { success: false, error: '无权确认其他机构的竞赛组别', code: 'DIVISION_SCOPE_DENIED' }
  }
  if (divisionRulesLocked(before)) {
    return { success: false, error: '竞赛规则已经定版，不能重复确认', code: 'DIVISION_RULES_LOCKED' }
  }

  const snapshot = divisionRuleSnapshot(before, data)
  const expectedTeams = Number(snapshot.expectedTeams)
  const groupCount = Number(snapshot.groupCount)
  const teamsPerGroup = Number(snapshot.teamsPerGroup)
  const matchMinutes = Number(snapshot.matchMinutes)
  const playersOnField = Number(snapshot.playersOnField)
  const formatType = String(snapshot.formatType || '')
  const knockoutSize = Number(snapshot.knockoutSize || snapshot.formatConfig?.bracketSize)
  if (!['cup', 'tournament', 'league', 'hybrid'].includes(formatType) ||
      !['champion', 'top4', 'full'].includes(String(snapshot.finalRankingMode || '')) ||
      expectedTeams < 2 || matchMinutes < 10 || playersOnField < 1) {
    return { success: false, error: '竞赛规则尚未填写完整，请完成赛制、球队数量和比赛执行设置', code: 'DIVISION_RULES_INCOMPLETE' }
  }
  if (formatType === 'cup' && (groupCount < 1 || teamsPerGroup < 2)) {
    return { success: false, error: '请完善小组数量和每组球队数量', code: 'DIVISION_GROUP_RULES_INCOMPLETE' }
  }
  if (['tournament', 'hybrid'].includes(formatType) && knockoutSize < 2) {
    return { success: false, error: '请完善淘汰赛规模', code: 'DIVISION_KNOCKOUT_RULES_INCOMPLETE' }
  }
  const birthDateStart = String(snapshot.birthDateStart || '').trim()
  const birthDateEnd = String(snapshot.birthDateEnd || snapshot.birthDateCutoff || '').trim()
  if (birthDateStart && birthDateEnd && new Date(birthDateStart).getTime() > new Date(birthDateEnd).getTime()) {
    return { success: false, error: '最早出生日期不能晚于最晚出生日期', code: 'DIVISION_BIRTH_RANGE_INVALID' }
  }
  const drawResolution = String(snapshot.drawResolution || 'draw').toLowerCase()
  if (!['draw', 'penalties'].includes(drawResolution)) {
    return { success: false, error: '请选择有效的常规时间战平处理方式', code: 'DIVISION_DRAW_RESOLUTION_INVALID' }
  }
  if (drawResolution === 'penalties') {
    const penaltyWinPoints = Number(snapshot.penaltyWinPoints)
    const penaltyLossPoints = Number(snapshot.penaltyLossPoints)
    if (!Number.isFinite(penaltyWinPoints) || !Number.isFinite(penaltyLossPoints) || penaltyWinPoints <= penaltyLossPoints || penaltyLossPoints < 0) {
      return { success: false, error: '点球胜者积分必须高于点球负者积分', code: 'DIVISION_PENALTY_POINTS_INVALID' }
    }
  }
  const regulationDetails = sanitizeRegulationDetails(snapshot.regulationDetails)
  if (regulationDetails.benchTotalLimit != null && regulationDetails.benchPlayerLimit != null && regulationDetails.benchOfficialLimit != null && regulationDetails.benchPlayerLimit + regulationDetails.benchOfficialLimit > regulationDetails.benchTotalLimit) {
    return { success: false, error: '替补球员与球队官员人数不能超过替补席总人数', code: 'DIVISION_BENCH_LIMIT_INVALID' }
  }
  if (regulationDetails.jerseyNumberMin != null && regulationDetails.jerseyNumberMax != null && regulationDetails.jerseyNumberMin > regulationDetails.jerseyNumberMax) {
    return { success: false, error: '球衣号码范围设置不正确', code: 'DIVISION_JERSEY_RANGE_INVALID' }
  }
  snapshot.regulationDetails = regulationDetails

  const mode = normalizeDivisionMode(snapshot)
  if (mode === 'professional' && !divisionProfessionalAccessAllowed(before)) {
    return {
      success: false,
      error: '专业版尚未开通，完成专业版权益后才能定版',
      code: 'DIVISION_ENTITLEMENT_REQUIRED'
    }
  }

  const now = new Date()
  const version = String(before.rulesVersionDraft || `V${now.toISOString().slice(0, 10)}`)
  const updateData = {
    ...snapshot,
    rulesLocked: true,
    ruleFinalized: true,
    ruleStatus: 'finalized',
    ruleProgress: 100,
    rulesVersion: version,
    rulesSnapshot: snapshot,
    rulesRevisionPending: false,
    rulesVersionDraft: '',
    finalizedAt: now,
    finalizedBy: organizerScope.user._id,
    finalizedByName: String(
      organizerScope.user.nickname || organizerScope.user.userName || organizerScope.user.phone || '赛事管理者'
    ).slice(0, 50),
    confirmedByUserId: organizerScope.user._id,
    confirmedByOrgId: organizerScope.orgId,
    confirmedAt: now,
    updateTime: now
  }
  await db.collection('divisions').doc(divisionId).update({ data: updateData })
  return { success: true, data: updateData, rulesVersion: version, message: '竞赛规则已正式定版' }
}

async function upgradeDivisionToProfessional(db, id, data, organizerScope) {
  if (!organizerScope || !organizerScope.orgId) {
    return { success: false, error: '当前账号尚未关联机构，请先完成机构引导', code: 'ORG_REQUIRED' }
  }
  const divisionId = String(id || '')
  if (!divisionId) return { success: false, error: '缺少竞赛组别 ID', code: 'DIVISION_ID_REQUIRED' }

  const divisionResult = await db.collection('divisions').doc(divisionId).get()
  const before = Array.isArray(divisionResult.data) ? divisionResult.data[0] : divisionResult.data
  if (!before || !organizerRecordAllowed('divisions', before, organizerScope)) {
    return { success: false, error: '无权升级其他机构的竞赛组别', code: 'DIVISION_SCOPE_DENIED' }
  }
  const tournamentId = String((data && data.tournamentId) || before.tournamentId || '')
  if (!tournamentId) return { success: false, error: '缺少所属赛事 ID', code: 'TOURNAMENT_ID_REQUIRED' }
  if (before.tournamentId && String(before.tournamentId) !== tournamentId) {
    return { success: false, error: '竞赛组别不属于当前赛事', code: 'DIVISION_TOURNAMENT_MISMATCH' }
  }

  const alreadyProfessional = normalizeDivisionMode(before) === 'professional'
  if (!alreadyProfessional && competitionPlanLocked(before)) {
    return { success: false, error: '竞赛方案已经锁定，不能再升级专业版', code: 'DIVISION_UPGRADE_LOCKED' }
  }
  if (!alreadyProfessional && !EVENT_PROFESSIONAL_FREE_PHASE && !divisionEntitlementIsActive(before)) {
    return { success: false, error: '专业版尚未开通，完成专业版权益后才能升级', code: 'DIVISION_ENTITLEMENT_REQUIRED' }
  }

  const tournamentResult = await db.collection('tournaments').doc(tournamentId).get()
  const tournament = Array.isArray(tournamentResult.data) ? tournamentResult.data[0] : tournamentResult.data
  if (tournament && !organizerRecordAllowed('tournaments', tournament, organizerScope)) {
    return { success: false, error: '无权升级其他机构赛事中的竞赛组别', code: 'TOURNAMENT_SCOPE_DENIED' }
  }

  const relationRows = await queryTournamentDivisionRecords(db, 'tournament_teams', tournamentId, divisionId)
  const allTournamentRelations = (await db.collection('tournament_teams').where({ tournamentId }).limit(1000).get()).data || []
  const relationDivisionIdsByTeam = new Map()
  allTournamentRelations.forEach(function (relation) {
    const teamId = String(relation.teamId || relation.team?._id || relation.team?.id || '')
    if (!teamId) return
    const set = relationDivisionIdsByTeam.get(teamId) || new Set()
    set.add(String(relation.divisionId || relation.division || 'default'))
    relationDivisionIdsByTeam.set(teamId, set)
  })
  const snapshotResult = await db.collection('roster_snapshots').where({ tournamentId }).limit(1000).get()
  const latestSnapshots = new Map()
  ;(snapshotResult.data || []).forEach(snapshot => {
    const teamId = String(snapshot && snapshot.teamId || '')
    if (!teamId) return
    const snapshotDivisionId = String(snapshot && (snapshot.divisionId || snapshot.division) || '')
    if (snapshotDivisionId && snapshotDivisionId !== String(divisionId)) return
    if (!snapshotDivisionId && ((relationDivisionIdsByTeam.get(teamId) || new Set()).size > 1)) return
    const previous = latestSnapshots.get(teamId)
    const currentTime = dateValue(snapshot.updateTime || snapshot.updatedAt || snapshot.createTime || snapshot.createdAt)
    const previousTime = previous ? dateValue(previous.updateTime || previous.updatedAt || previous.createTime || previous.createdAt) : -1
    if (!previous || currentTime >= previousTime) latestSnapshots.set(teamId, snapshot)
  })

  const activeStatuses = new Set(['approved', 'confirmed', 'active', 'accepted', 'registered', 'claimed'])
  const settledRosterStatuses = new Set(['submitted', 'approved', 'locked', 'effective'])
  const pendingRosterTeamIds = []
  let initializedTeams = 0
  const now = new Date()
  for (const relation of relationRows) {
    const relationStatus = String(relation.status || 'approved').toLowerCase()
    if (!activeStatuses.has(relationStatus)) continue
    const teamId = String(relation.teamId || relation.team?._id || relation.team?.id || '')
    const latest = latestSnapshots.get(teamId)
    const currentRosterStatus = String(relation.rosterStatus || '').toLowerCase()
    const nextRosterStatus = settledRosterStatuses.has(currentRosterStatus) || currentRosterStatus === 'returned'
      ? currentRosterStatus
      : String((latest && latest.status) || 'not_submitted').toLowerCase()
    const relationUpdate = {
      professionalRosterRequired: true,
      professionalUpgradeAt: now,
      updateTime: now
    }
    if (!currentRosterStatus || (!settledRosterStatuses.has(currentRosterStatus) && currentRosterStatus !== 'returned')) {
      relationUpdate.rosterStatus = nextRosterStatus
    }
    await db.collection('tournament_teams').doc(relation._id).update({ data: relationUpdate })
    initializedTeams += 1
    if (!settledRosterStatuses.has(nextRosterStatus)) pendingRosterTeamIds.push(teamId || String(relation._id || ''))
  }

  const modeHistory = Array.isArray(before.modeHistory) ? before.modeHistory.slice(-19) : []
  if (!alreadyProfessional) {
    modeHistory.push({
      from: 'simple',
      to: 'professional',
      at: now,
      userId: organizerScope.user._id,
      orgId: organizerScope.orgId
    })
  }
  const upgradeVersion = Math.max(Number(before.professionalUpgradeVersion) || 0, 0) + (alreadyProfessional ? 0 : 1)
  const divisionUpdate = {
    mode: 'professional',
    isProfessional: true,
    professionalEntitlementStatus: EVENT_PROFESSIONAL_FREE_PHASE ? 'free_current_phase' : before.professionalEntitlementStatus,
    professionalAccessPhase: EVENT_PROFESSIONAL_FREE_PHASE ? 'early_free' : before.professionalAccessPhase,
    professionalUpgradedAt: before.professionalUpgradedAt || now,
    professionalUpgradedBy: before.professionalUpgradedBy || organizerScope.user._id,
    professionalUpgradeVersion: upgradeVersion,
    modeHistory,
    updateTime: now
  }
  if (before.rulesSnapshot && typeof before.rulesSnapshot === 'object' && !Array.isArray(before.rulesSnapshot)) {
    divisionUpdate.rulesSnapshot = { ...before.rulesSnapshot, mode: 'professional', isProfessional: true }
  }
  await db.collection('divisions').doc(divisionId).update({ data: divisionUpdate })

  if (tournament && Array.isArray(tournament.divisions)) {
    const nextDivisions = tournament.divisions.map(item => {
      const itemId = String(item && (item.id || item._id) || '')
      return itemId === divisionId
        ? { ...item, mode: 'professional', isProfessional: true, professionalEntitlementStatus:divisionUpdate.professionalEntitlementStatus, professionalAccessPhase:divisionUpdate.professionalAccessPhase, professionalUpgradedAt: divisionUpdate.professionalUpgradedAt }
        : item
    })
    await db.collection('tournaments').doc(tournamentId).update({ data: { divisions: nextDivisions, updateTime: now } })
  }

  return {
    success: true,
    alreadyProfessional,
    divisionId,
    tournamentId,
    initializedTeams,
    pendingRosterTeamIds: pendingRosterTeamIds.filter(Boolean),
    preserved: { rules: true, tournamentTeams: true, draw: true, schedule: true, referees: true },
    message: alreadyProfessional ? '该组别已是专业模式，正式名单待办已保持同步' : '已免费启用专业模式，现有球队已进入正式名单待办'
  }
}

async function confirmCompetitionPlan(db, tournamentId, data, organizerScope) {
  if (!organizerScope || !organizerScope.orgId) {
    return { success: false, error: '当前账号尚未关联机构，请先完成机构引导', code: 'ORG_REQUIRED' }
  }
  const eventId = String(tournamentId || '')
  const divisionId = String(data && (data.divisionId || data.id) || '')
  if (!eventId || !divisionId) return { success: false, error: '缺少赛事或竞赛组别 ID', code: 'COMPETITION_PLAN_ID_REQUIRED' }

  const tournamentResult = await db.collection('tournaments').doc(eventId).get()
  const tournament = Array.isArray(tournamentResult.data) ? tournamentResult.data[0] : tournamentResult.data
  if (!tournament || !organizerRecordAllowed('tournaments', tournament, organizerScope)) {
    return { success: false, error: '无权确认其他机构的竞赛方案', code: 'COMPETITION_PLAN_SCOPE_DENIED' }
  }

  let division = null
  let formalDivision = false
  try {
    const divisionResult = await db.collection('divisions').doc(divisionId).get()
    const candidate = Array.isArray(divisionResult.data) ? divisionResult.data[0] : divisionResult.data
    if (candidate && String(candidate.tournamentId || eventId) === eventId && organizerRecordAllowed('divisions', candidate, organizerScope)) {
      division = candidate
      formalDivision = true
    }
  } catch (error) {
    console.warn('[webApi] division lookup during competition confirmation failed:', error.message || error)
  }
  if (!division) {
    const legacyDivision = Array.isArray(tournament.divisions)
      ? tournament.divisions.find(item => String(item && (item.id || item._id) || '') === divisionId)
      : null
    if (legacyDivision) division = { ...legacyDivision, _id: divisionId, tournamentId: eventId, orgId: organizerScope.orgId }
  }
  if (!division) return { success: false, error: '竞赛组别不存在或不属于当前赛事', code: 'DIVISION_NOT_FOUND' }
  if (competitionPlanLocked(division)) {
    return { success: true, alreadyLocked: true, data: { divisionId, competitionPlanStatus: 'locked', competitionPlanVersion: division.competitionPlanVersion || '' }, message: '竞赛方案已经锁定' }
  }
  if (!divisionRulesLocked(division)) {
    return { success: false, error: '请先完成该组别规则定版', code: 'DIVISION_RULES_REQUIRED' }
  }
  const mode = normalizeDivisionMode(division)
  if (mode === 'professional' && !divisionProfessionalAccessAllowed(division)) {
    return { success: false, error: '专业版尚未开通，完成专业版权益后才能锁定竞赛方案', code: 'DIVISION_ENTITLEMENT_REQUIRED' }
  }

  const relationRows = await queryTournamentDivisionRecords(db, 'tournament_teams', eventId, divisionId)
  const approvedStatuses = new Set(['approved', 'confirmed', 'active', 'claimed'])
  const ignoredStatuses = new Set(['rejected', 'withdrawn', 'cancelled', 'canceled'])
  const approvedRelations = relationRows.filter(item => approvedStatuses.has(String(item.status || 'approved').toLowerCase()))
  const unresolvedRelations = relationRows.filter(item => {
    const status = String(item.status || 'approved').toLowerCase()
    return !approvedStatuses.has(status) && !ignoredStatuses.has(status)
  })
  if (approvedRelations.length < 2) {
    return { success: false, error: '至少需要两支已确认参赛球队才能锁定竞赛方案', code: 'COMPETITION_TEAMS_INCOMPLETE', detail: { approved: approvedRelations.length } }
  }
  if (unresolvedRelations.length > 0) {
    return { success: false, error: '仍有球队处于待确认或待认领状态，请先处理参赛关系', code: 'COMPETITION_TEAMS_PENDING', detail: { pending: unresolvedRelations.length } }
  }

  const drawType = drawTypeForDivision(division, tournament)
  const drawCollection = drawType === 'cup' || drawType === 'knockout'
    ? 'tournament_bracket'
    : drawType === 'league' ? 'tournament_league_tables' : 'tournament_groups'
  const drawRecords = await queryTournamentDivisionRecords(db, drawCollection, eventId, divisionId)
  if (!drawIsReady(division, tournament, drawRecords, approvedRelations.length)) {
    return { success: false, error: '抽签分组尚未完成，请先保存完整分组或对阵结果', code: 'COMPETITION_DRAW_INCOMPLETE' }
  }

  const matches = await queryTournamentDivisionRecords(db, 'matches', eventId, divisionId)
  if (!matches.length) return { success: false, error: '尚未生成该组别赛程，不能锁定竞赛方案', code: 'COMPETITION_SCHEDULE_INCOMPLETE' }
  const unresolvedMatches = unresolvedScheduleMatches(matches)
  if (unresolvedMatches.length > 0) {
    return { success: false, error: `仍有 ${unresolvedMatches.length} 场比赛未完成时间、场地或冲突处理`, code: 'COMPETITION_SCHEDULE_CONFLICT', detail: { matchIds: unresolvedMatches.map(item => item._id).filter(Boolean).slice(0, 50) } }
  }

  const now = new Date()
  const version = `CP-${now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`
  const snapshot = compactCompetitionSnapshot(division, approvedRelations, drawRecords, matches)
  const divisionLockData = {
    competitionPlanLocked: true,
    competitionPlanStatus: 'locked',
    competitionPlanVersion: version,
    competitionPlanMode: mode,
    competitionPlanSnapshot: snapshot,
    competitionPlanLockedAt: now,
    competitionPlanLockedBy: organizerScope.user._id,
    competitionPlanLockedByName: String(organizerScope.user.nickname || organizerScope.user.userName || organizerScope.user.phone || '赛事管理者').slice(0, 50),
    updateTime: now
  }
  if (formalDivision) {
    await db.collection('divisions').doc(divisionId).update({ data: divisionLockData })
  }

  const existingLocks = Array.isArray(tournament.competitionPlanLocks) ? tournament.competitionPlanLocks.filter(item => String(item && item.divisionId || '') !== divisionId) : []
  existingLocks.push({ divisionId, version, mode, status: 'locked', lockedAt: now, lockedBy: organizerScope.user._id })
  const tournamentDivisionIds = Array.isArray(tournament.divisions)
    ? tournament.divisions.map(item => String(item && (item.id || item._id) || '')).filter(Boolean)
    : []
  const allDivisionIds = tournamentDivisionIds.length ? tournamentDivisionIds : [divisionId]
  const allLocked = allDivisionIds.every(item => existingLocks.some(lock => String(lock.divisionId || '') === item && lock.status === 'locked'))
  const nextLegacyDivisions = Array.isArray(tournament.divisions)
    ? tournament.divisions.map(item => String(item && (item.id || item._id) || '') === divisionId ? { ...item, ...divisionLockData } : item)
    : tournament.divisions
  const tournamentUpdate = {
    competitionPlanLocks: existingLocks.slice(-100),
    competitionPlanStatus: allLocked ? 'locked' : 'partial',
    matchManagementReady: true,
    currentStage: 'match_management',
    updateTime: now
  }
  if (Array.isArray(nextLegacyDivisions)) tournamentUpdate.divisions = nextLegacyDivisions
  await db.collection('tournaments').doc(eventId).update({ data: tournamentUpdate })
  return {
    success: true,
    data: { tournamentId: eventId, divisionId, competitionPlanStatus: 'locked', competitionPlanVersion: version, matchManagementReady: true },
    nextRoute: `/tournaments/${eventId}/matches?divisionId=${encodeURIComponent(divisionId)}`,
    message: '竞赛方案已锁定，已进入正式比赛管理'
  }
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
const PLATFORM_OWNER_SETTING_ID = 'platform-owner'

async function getPlatformOwnerSetting(db) {
  let setting = null
  try {
    const settingResult = await db.collection('platform_settings').doc(PLATFORM_OWNER_SETTING_ID).get()
    setting = Array.isArray(settingResult.data) ? settingResult.data[0] : settingResult.data
  } catch (error) {
    setting = null
  }
  return setting
}

function verifyPlatformPassword(password, setting) {
  const salt = String(setting && setting.adminPasswordSalt || 'platform-login-dummy-salt')
  const actual = crypto.scryptSync(String(password || ''), salt, 64)
  const expectedHex = String(setting && setting.adminPasswordHash || '')
  if (!/^[a-f0-9]{128}$/i.test(expectedHex)) return false
  const expected = Buffer.from(expectedHex, 'hex')
  return expected.length === actual.length && crypto.timingSafeEqual(actual, expected)
}

async function recordPlatformLoginFailure(db, setting) {
  const now = Date.now()
  const windowMs = 15 * 60 * 1000
  const windowStartedAt = dateValue(setting && setting.adminLoginWindowStartedAt)
  const previousCount = windowStartedAt && now - windowStartedAt < windowMs
    ? Number(setting.adminLoginFailedCount || 0)
    : 0
  const failedCount = previousCount + 1
  const data = {
    adminLoginFailedCount: failedCount,
    adminLoginWindowStartedAt: previousCount ? setting.adminLoginWindowStartedAt : new Date(now),
    adminLoginLastFailedAt: new Date(now)
  }
  if (failedCount >= 5) data.adminLoginLockedUntil = new Date(now + windowMs)
  await db.collection('platform_settings').doc(PLATFORM_OWNER_SETTING_ID).update({ data })
}

async function clearPlatformLoginFailures(db) {
  await db.collection('platform_settings').doc(PLATFORM_OWNER_SETTING_ID).update({
    data: {
      adminLoginFailedCount: 0,
      adminLoginWindowStartedAt: null,
      adminLoginLastFailedAt: null,
      adminLoginLockedUntil: null,
      adminLoginLastSuccessAt: db.serverDate()
    }
  })
}

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
  const { phoneNumber, loginChallengeId } = event
  if (!phoneNumber || !/^1[3-9]\d{9}$/.test(phoneNumber)) {
    return { success: false, error: '手机号格式不正确' }
  }

  try {
    // 短信凭据只保留在独立 sendSms 函数；网页登录挑战验证通过后再由统一入口转发。
    const invoked = await cloud.callFunction({
      name: 'sendSms',
      data: { phoneNumber, loginChallengeId: loginChallengeId || '' }
    })
    const result = invoked && invoked.result ? invoked.result : invoked
    if (!result || result.success !== true) {
      return { success: false, error: (result && result.error) || '发送失败，请稍后重试' }
    }
    return { success: true, message: result.message || '验证码发送成功' }
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

async function handlePlatformPasswordLogin(event) {
  const account = String(event.account || '').trim().slice(0, 64)
  const password = String(event.password || '')
  if (!account || !password) return { success: false, error: '请输入管理员账号和密码' }
  if (password.length > 128) return { success: false, error: '账号、密码或平台权限不正确' }

  const db = cloud.database()
  const setting = await getPlatformOwnerSetting(db) || {}
  if (dateValue(setting.adminLoginLockedUntil) > Date.now()) {
    return { success: false, error: '登录尝试次数过多，请15分钟后再试' }
  }
  const accountMatches = account === String(setting.adminUsername || '')
  const passwordMatches = verifyPlatformPassword(password, setting)
  if (!accountMatches || !passwordMatches) {
    await recordPlatformLoginFailure(db, setting)
    return { success: false, error: '账号、密码或平台权限不正确' }
  }
  await clearPlatformLoginFailures(db)
  const authToken = await createPlatformWebSession()
  return {
    success: true,
    message: '平台管理员登录成功',
    authToken,
    authExpiresAt: new Date(Date.now() + WEB_SESSION_TTL_MS),
    role: ORGANIZER_ROLE,
    user: {
      _id: 'platform-owner',
      nickname: '平台负责人',
      phone: '',
      phoneNumber: '',
      email: '',
      role: 'platform_owner',
      isPlatformOwner: true
    }
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

// 6. PC 微信扫码第一步：只验证微信并签发短时手机号验证挑战，不创建账号或会话。
async function handleWechatOnlyLogin(event) {
  const { code } = event
  if (!code) return { success: false, error: '缺少授权码' }
  if (!WECHAT_CONFIG.APP_ID || !WECHAT_CONFIG.APP_SECRET) {
    return { success: false, error: '微信配置缺失' }
  }

  const db = cloud.database()
  try {
    const tokenUrl = 'https://api.weixin.qq.com/sns/oauth2/access_token?appid=' + WECHAT_CONFIG.APP_ID +
      '&secret=' + WECHAT_CONFIG.APP_SECRET + '&code=' + code + '&grant_type=authorization_code'
    const tokenData = await httpsGet(tokenUrl)
    if (tokenData.errcode) throw new Error('微信错误:' + (tokenData.errmsg || ''))

    const userInfoUrl = 'https://api.weixin.qq.com/sns/userinfo?access_token=' + tokenData.access_token + '&openid=' + tokenData.openid
    const wxUserInfo = await httpsGet(userInfoUrl)
    if (wxUserInfo.errcode) throw new Error('获取用户信息失败')

    const unionId=String(wxUserInfo.unionid||tokenData.unionid||'')
    const uniqueUser=async(where,label)=>{
      const found=await db.collection('users').where(where).limit(3).get()
      const rows=(found.data||[]).filter((item,index,list)=>list.findIndex(other=>String(other._id)===String(item._id))===index)
      if(rows.length>1)throw new Error(label+'存在重复账号，请联系管理员处理')
      return rows[0]||null
    }
    const unionUser=unionId?await uniqueUser({unionId},'微信 UnionID'):null
    const webUser=await uniqueUser({wechatOpenId:tokenData.openid},'网页微信 OpenID')
    const legacyUser=webUser?null:await uniqueUser({openId:tokenData.openid},'兼容微信 OpenID')
    const channelUsers=[unionUser,webUser,legacyUser].filter(Boolean)
    const channelIds=[...new Set(channelUsers.map(item=>String(item._id)))]
    if(channelIds.length>1)throw new Error('微信标识指向不同账号，已阻止自动登录，请联系管理员核验')
    let boundUser=channelUsers[0]||null
    if(boundUser){
      const phone=String(boundUser.phone||boundUser.phoneNumber||'')
      const phoneReady=/^1[3-9]\d{9}$/.test(phone)&&boundUser.phoneVerified===true&&boundUser.pcAccountStatus!=='cancelled'&&boundUser.pcLoginEnabled!==false
      if(phoneReady){
        const phoneUser=await uniqueUser(db.command.or([{phone},{phoneNumber:phone}]),'手机号')
        if(!phoneUser||String(phoneUser._id)!==String(boundUser._id))throw new Error('手机号与微信标识指向不同账号，已阻止自动登录')
        if(boundUser.wechatOpenId&&String(boundUser.wechatOpenId)!==String(tokenData.openid))throw new Error('当前账号已绑定其他 PC 微信，请联系管理员核验')
        if(unionId&&boundUser.unionId&&String(boundUser.unionId)!==unionId)throw new Error('当前账号微信 UnionID 不一致，请联系管理员核验')
        const now=db.serverDate()
        const patch={lastLoginTime:now,lastLoginType:'wechat',updateTime:now}
        if(!boundUser.wechatOpenId)patch.wechatOpenId=tokenData.openid
        if(unionId&&!boundUser.unionId)patch.unionId=unionId
        await db.collection('users').doc(boundUser._id).update({data:patch})
        boundUser={...boundUser,...patch}
        return {success:true,directLogin:true,requiresPhoneAuthorization:false,message:'欢迎回来！',role:ORGANIZER_ROLE,user:{_id:boundUser._id,nickname:boundUser.nickname||wxUserInfo.nickname||'微信用户',headimgurl:boundUser.headimgurl||wxUserInfo.headimgurl||'',phone,phoneNumber:phone,wechatOpenId:boundUser.wechatOpenId||tokenData.openid,unionid:boundUser.unionId||unionId,role:ORGANIZER_ROLE,isPlatformOwner:boundUser.isPlatformOwner===true}}
      }
    }

    const challengeToken = createWebLoginChallenge({
      wechatOpenId: tokenData.openid,
      unionId,
      nickname: wxUserInfo.nickname || '微信用户',
      headimgurl: wxUserInfo.headimgurl || ''
    })
    return {
      success: true,
      requiresPhoneAuthorization: true,
      needBindPhone: true,
      loginChallenge: challengeToken,
      challengeExpiresAt: new Date(Date.now() + WEB_LOGIN_CHALLENGE_TTL_MS),
      user: {
        nickname: wxUserInfo.nickname || '微信用户',
        headimgurl: wxUserInfo.headimgurl || ''
      }
    }
  } catch (err) {
    console.error('[webApi] wechatOnlyLogin error:', err.message)
    return { success: false, error: err.message || '微信登录失败' }
  }
}

async function loadWebLoginChallenge(token) {
  const challengeToken = String(token || '').trim()
  if (!challengeToken) return { success: false, error: '微信授权已失效，请重新扫码' }
  const challenge = verifyWebLoginChallenge(challengeToken)
  if (!challenge) return { success: false, error: '微信授权已失效，请重新扫码' }
  const db = cloud.database()
  return { success: true, db, challenge, challengeId: hashSessionToken(challengeToken) }
}

async function handleSendWechatLoginSms(event) {
  const loaded = await loadWebLoginChallenge(event.loginChallenge)
  if (!loaded.success) return loaded
  const phoneNumber = String(event.phoneNumber || '').trim()
  if (!/^1[3-9]\d{9}$/.test(phoneNumber)) return { success: false, error: '手机号格式不正确' }
  const [challengeCodes, phoneCodes] = await Promise.all([
    loaded.db.collection('sms_codes').where({ loginChallengeId: loaded.challengeId }).limit(10).get(),
    loaded.db.collection('sms_codes').where({ phoneNumber }).limit(20).get()
  ])
  const recentWindow = Date.now() - 60 * 1000
  const recentPhoneCount = (phoneCodes.data || []).filter(item => dateValue(item.createdAt) > recentWindow).length
  if (recentPhoneCount > 0) return { success: false, error: '验证码发送过于频繁，请60秒后重试' }
  if ((challengeCodes.data || []).length >= 5) return { success: false, error: '本次扫码发送次数过多，请重新扫码' }
  return handleSendSms({ phoneNumber, loginChallengeId: loaded.challengeId })
}

// 已登录账号在“个人资料”内绑定/更换手机号。
// 与首次扫码登录绑定分开：以当前会话摘要作为一次性场景标识，不复用登录挑战，
// 校验同一个 sms_codes 记录，避免两条流程互相消费验证码。
function maskBoundPhone(phone) {
  const value = String(phone || '')
  return /^\d{11}$/.test(value) ? value.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') : value
}

async function handleGetCurrentAccountProfile(event) {
  const auth = await authenticateWebSession(event)
  if (!auth.success) return { success: false, error: auth.error, code: auth.code }
  if (auth.principalType === 'platform_owner') {
    return { success: true, user: { _id: auth.userId, phone: '', phoneMasked: '', phoneVerified: false } }
  }
  const phone = String(auth.user.phone || auth.user.phoneNumber || '').trim()
  return {
    success: true,
    user: {
      _id: auth.userId,
      phone,
      phoneNumber: phone,
      phoneMasked: maskBoundPhone(phone),
      phoneVerified: Boolean(phone && auth.user.phoneVerified !== false)
    }
  }
}

// 同一手机号只能命中一个自然人账号；命中其他账号时阻断，不静默换绑。
async function findOtherUserByPhone(db, phone, currentUserId) {
  const _ = db.command
  const result = await db.collection('users').where(_.or([
    { phone },
    { phoneNumber: phone }
  ])).limit(3).get()
  return (result.data || []).filter(item => String(item._id) !== String(currentUserId))
}

async function handleSendCurrentUserPhoneBindSms(event) {
  const auth = await authenticateWebSession(event)
  if (!auth.success) return { success: false, error: auth.error, code: auth.code }

  const phoneNumber = String(event.phoneNumber || '').trim()
  if (!/^1[3-9]\d{9}$/.test(phoneNumber)) return { success: false, error: '手机号格式不正确' }

  const db = cloud.database()
  // 先做占用与重复校验，避免为一个必然失败的绑定白发短信。
  const others = await findOtherUserByPhone(db, phoneNumber, auth.userId)
  if (others.length > 0) return { success: false, error: '该手机号已绑定其他账号，请联系管理员核验' }
  const currentPhone = String(auth.user.phone || auth.user.phoneNumber || '')
  if (currentPhone && currentPhone === phoneNumber) {
    return { success: false, error: '该手机号已是当前账号的绑定手机号' }
  }

  const recent = await db.collection('sms_codes').where({ phoneNumber }).limit(20).get()
  const recentWindow = Date.now() - 60 * 1000
  const recentCount = (recent.data || []).filter(item => dateValue(item.createdAt) > recentWindow).length
  if (recentCount > 0) return { success: false, error: '验证码发送过于频繁，请60秒后重试' }

  const bindChallengeId = hashSessionToken(String(event.authToken || '').trim())
  return handleSendSms({ phoneNumber, loginChallengeId: bindChallengeId })
}

async function handleBindCurrentUserPhone(event) {
  const auth = await authenticateWebSession(event)
  if (!auth.success) return { success: false, error: auth.error, code: auth.code }

  const phone = String(event.phoneNumber || '').trim()
  const smsCode = String(event.smsCode || '').trim()
  if (!/^1[3-9]\d{9}$/.test(phone) || !/^\d{6}$/.test(smsCode)) {
    return { success: false, error: '请输入正确的手机号和验证码' }
  }

  const db = cloud.database()
  const _ = db.command
  const bindChallengeId = hashSessionToken(String(event.authToken || '').trim())
  const smsResult = await db.collection('sms_codes').where({
    phoneNumber: phone,
    code: smsCode,
    loginChallengeId: bindChallengeId,
    used: false,
    expireAt: _.gt(new Date())
  }).orderBy('createdAt', 'desc').limit(1).get()
  if (!smsResult.data || smsResult.data.length !== 1) return { success: false, error: '验证码错误或已过期' }

  const others = await findOtherUserByPhone(db, phone, auth.userId)
  if (others.length > 0) return { success: false, error: '该手机号已绑定其他账号，请联系管理员核验' }

  await db.collection('sms_codes').doc(smsResult.data[0]._id).update({ data: { used: true, usedAt: db.serverDate() } })
  await db.collection('users').doc(auth.userId).update({
    data: {
      phone,
      phoneNumber: phone,
      phoneVerified: true,
      phoneVerifiedAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  })

  return {
    success: true,
    message: '手机号绑定成功',
    user: { _id: auth.userId, phone, phoneNumber: phone, phoneMasked: maskBoundPhone(phone) }
  }
}

function selfAccountMembershipConditions(user) {
  const conditions = []
  const userId = String(user && user._id || '').trim()
  const phone = String(user && (user.phone || user.phoneNumber) || '').trim()
  const openIds = Array.from(new Set([
    user && user.openId,
    user && user.openid,
    user && user.wechatOpenId,
    user && user.miniProgramOpenId,
    user && user.unionId,
    user && user._openid
  ].filter(Boolean).map(value => String(value))))
  if (userId) conditions.push({ userId }, { memberUserId: userId }, { ownerId: userId })
  if (phone) conditions.push({ phone }, { phoneNumber: phone })
  openIds.forEach(openId => conditions.push(
    { openId }, { openid: openId }, { wechatOpenId: openId },
    { miniProgramOpenId: openId }, { unionId: openId }, { _openid: openId }
  ))
  return conditions
}

function selfAccountMembershipMatches(record, user) {
  const userId = String(user && user._id || '')
  const recordUserIds = [record.userId, record.memberUserId, record.ownerId].filter(Boolean).map(value => String(value))
  if (recordUserIds.length) return recordUserIds.includes(userId)
  const openIds = Array.from(new Set([
    user && user.openId,
    user && user.openid,
    user && user.wechatOpenId,
    user && user.miniProgramOpenId,
    user && user.unionId,
    user && user._openid
  ].filter(Boolean).map(value => String(value))))
  const recordOpenIds = [
    record.openId, record.openid, record.wechatOpenId,
    record.miniProgramOpenId, record.unionId, record._openid
  ].filter(Boolean).map(value => String(value))
  if (recordOpenIds.length) return recordOpenIds.some(value => openIds.includes(value))
  const phone = String(user && (user.phone || user.phoneNumber) || '')
  return Boolean(phone && [record.phone, record.phoneNumber].filter(Boolean).map(value => String(value)).includes(phone))
}

async function loadSelfAccountMemberships(db, collection, user) {
  const conditions = selfAccountMembershipConditions(user)
  if (!conditions.length) return []
  const where = conditions.length === 1 ? conditions[0] : db.command.or(conditions)
  const result = await db.collection(collection).where(where).limit(1000).get()
  const candidateRows = result.data || []
  if (candidateRows.length >= 1000) {
    throw Object.assign(new Error('账号关联关系过多，请联系平台管理员处理'), { code: 'ACCOUNT_RELATION_LIMIT' })
  }
  return candidateRows.filter(record => selfAccountMembershipMatches(record, user))
}

async function handleDeleteCurrentAccount(event) {
  const auth = await authenticateWebSession(event)
  if (!auth.success) return { success: false, error: auth.error, code: auth.code }
  if (auth.principalType === 'platform_owner' || auth.user.isPlatformOwner === true) return { success: false, error: '平台负责人账号不能在此注销', code: 'PLATFORM_ACCOUNT_DELETE_DENIED' }
  if (String(event.confirmText || '').trim() !== '注销PC') return { success: false, error: '请输入“注销PC”完成二次确认', code: 'ACCOUNT_DELETE_CONFIRMATION_REQUIRED' }

  const db = cloud.database()
  const _ = db.command
  const phone = String(auth.user.phone || auth.user.phoneNumber || '').trim()
  const tournamentConditions = [
    { creatorId: auth.userId }, { organizerId: auth.userId }, { ownerId: auth.userId }, { userId: auth.userId }, { createdBy: auth.userId }
  ]
  if (phone) tournamentConditions.push({ creatorPhone: phone }, { organizerPhone: phone }, { ownerPhone: phone })
  const tournaments = await db.collection('tournaments').where(_.or(tournamentConditions)).limit(1).get()
  if ((tournaments.data || []).length) return { success: false, error: '该PC账号仍有创建的赛事，请先处理赛事后再注销', code: 'PC_ACCOUNT_HAS_TOURNAMENTS' }

  const [sessionResult, bindingResult, gateResult] = await Promise.all([
    db.collection('auth_sessions').where({ userId: auth.userId }).limit(1000).get(),
    db.collection('service_account_bindings').where({ userId: auth.userId }).limit(100).get(),
    db.collection('service_follow_gates').where({ purpose: 'organizer_pc_bind', userId: auth.userId }).limit(100).get()
  ])
  const sessions = sessionResult.data || []
  const auditResult = await db.collection('account_identity_audit_logs').add({ data: {
    action: 'self_pc_account_unlink', result: 'pending', actorType: 'self', actorId: auth.userId, targetUserId: auth.userId,
    phoneHash: phone ? crypto.createHash('sha256').update(phone).digest('hex') : '',
    preservedMiniProgramAccount: true, createTime: db.serverDate()
  } })
  try {
    for (const session of sessions) await db.collection('auth_sessions').doc(session._id).remove()
    for (const binding of bindingResult.data || []) {
      await db.collection('service_account_bindings').doc(binding._id).update({ data: { organizerPcBound: false, pcUnboundAt: db.serverDate(), updateTime: db.serverDate() } })
    }
    for (const gate of gateResult.data || []) {
      await db.collection('service_follow_gates').doc(gate._id).update({ data: { subscribed: false, status: 'pc_unbound', updateTime: db.serverDate() } })
    }
    await db.collection('users').doc(auth.userId).update({ data: {
      wechatOpenId: '', pcAccountStatus: 'cancelled', pcLoginEnabled: false, pcServiceRebindRequired: true,
      pcAccountCancelledAt: db.serverDate(), pcAccountCancelledBy: auth.userId, lastPcLogoutAt: db.serverDate(), updateTime: db.serverDate()
    } })
    await db.collection('account_identity_audit_logs').doc(auditResult._id).update({ data: {
      result: 'success', removedSessionCount: sessions.length, completedAt: db.serverDate()
    } })
    return { success: true, message: 'PC账号已注销，小程序账号和球队不受影响', removedSessionCount: sessions.length, preservedMiniProgramAccount: true }
  } catch (error) {
    await db.collection('account_identity_audit_logs').doc(auditResult._id).update({ data: { result: 'failed', errorCode: error.code || 'SELF_PC_ACCOUNT_UNLINK_FAILED', completedAt: db.serverDate() } }).catch(() => {})
    throw error
  }
}
async function handleCompleteWechatPhoneLogin(event) {
  const phone = String(event.phoneNumber || '').trim()
  const smsCode = String(event.smsCode || '').trim()
  if (!/^1[3-9]\d{9}$/.test(phone) || !/^\d{6}$/.test(smsCode)) {
    return { success: false, error: '请输入正确的手机号和验证码' }
  }
  const loaded = await loadWebLoginChallenge(event.loginChallenge)
  if (!loaded.success) return loaded
  const db = loaded.db
  const _ = db.command
  const challenge = loaded.challenge
  const smsResult = await db.collection('sms_codes').where({
    phoneNumber: phone,
    code: smsCode,
    loginChallengeId: loaded.challengeId,
    used: false,
    expireAt: _.gt(new Date())
  }).orderBy('createdAt', 'desc').limit(1).get()
  if (!smsResult.data || smsResult.data.length !== 1) return { success: false, error: '验证码错误或已过期' }

  const queryUnique = async (where, label) => {
    const result = await db.collection('users').where(where).limit(3).get()
    const rows = result.data || []
    const unique = rows.filter((item, index, list) => list.findIndex(other => String(other._id) === String(item._id)) === index)
    if (unique.length > 1) throw new Error(label + '存在重复账号，请联系管理员处理')
    return unique[0] || null
  }
  try {
    const phoneUser = await queryUnique(_.or([{ phone }, { phoneNumber: phone }]), '手机号')
    const unionUser = challenge.unionId ? await queryUnique({ unionId: challenge.unionId }, '微信 UnionID') : null
    let wechatUser = await queryUnique({ wechatOpenId: challenge.wechatOpenId }, '网页微信 OpenID')
    if (!wechatUser) wechatUser = await queryUnique({ openId: challenge.wechatOpenId }, '兼容微信 OpenID')
    const candidates = [phoneUser, unionUser, wechatUser].filter(Boolean)
    const candidateIds = [...new Set(candidates.map(item => String(item._id)))]
    if (candidateIds.length > 1) {
      return { success: false, error: '手机号与微信标识指向不同账号，已阻止自动合并，请联系管理员核验' }
    }
    let user = candidates[0] || null
    if (user) {
      const boundPhone = String(user.phone || user.phoneNumber || '')
      if (boundPhone && boundPhone !== phone) return { success: false, error: '当前微信已绑定其他手机号，请联系管理员核验' }
      if (user.wechatOpenId && String(user.wechatOpenId) !== String(challenge.wechatOpenId)) return { success: false, error: '该手机号已绑定其他 PC 微信，请联系管理员核验' }
      if (challenge.unionId && user.unionId && String(user.unionId) !== String(challenge.unionId)) return { success: false, error: '手机号与微信 UnionID 不一致，请联系管理员核验' }
    }
    const now = db.serverDate()
    const patch = {
      phone,
      phoneNumber: phone,
      phoneVerified: true,
      pcAccountStatus: 'active',
      pcLoginEnabled: true,
      pcAccountReactivatedAt: now,
      wechatOpenId: challenge.wechatOpenId,
      nickname: (user && (user.nickname || user.nickName)) || challenge.nickname || '微信用户',
      headimgurl: (user && (user.headimgurl || user.avatarUrl)) || challenge.headimgurl || '',
      loginType: 'wechat_phone',
      lastLoginTime: now,
      updateTime: now
    }
    if (challenge.unionId) patch.unionId = challenge.unionId
    const isNewUser = !user
    if (isNewUser) {
      patch.role = ORGANIZER_ROLE
      patch.createTime = now
      const created = await db.collection('users').add({ data: patch })
      user = { _id: created._id, ...patch }
    } else {
      await db.collection('users').doc(user._id).update({ data: patch })
      user = { ...user, ...patch }
    }
    await db.collection('sms_codes').doc(smsResult.data[0]._id).update({ data: { used: true, usedAt: now } })
    return {
      success: true,
      role: ORGANIZER_ROLE,
      user: {
        _id: user._id,
        nickname: user.nickname || '微信用户',
        headimgurl: user.headimgurl || '',
        phone,
        phoneNumber: phone,
        wechatOpenId: user.wechatOpenId || '',
        unionid: user.unionId || '',
        role: ORGANIZER_ROLE,
        isPlatformOwner: user.isPlatformOwner === true
      },
      isNewUser
    }
  } catch (error) {
    console.error('[webApi] completeWechatPhoneLogin error:', error.message)
    return { success: false, error: error.message || '手机号账号登录失败' }
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
  'tournamentStaffAccess',
  'dataCenter',
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
  'generateAIImage',
  'generateQRCode',
  'removeImageBg',
  'baiduRemoveBg',       // 百度智能云人像分割
  'clearTeamPlayers', // 批量删除球队球员（临时工具）
  // 赛事中心后台数据操作（共享赛小蜂数据库）
  'getTeams', 'getPlayers', 'createTeam', 'updateTeam', 'deleteTeam',
  'createPlayer', 'updatePlayer', 'deletePlayer',
  'getBanners',
  'getTournaments',
  'getTournamentDetail',
  'getTournamentMatches',
  'setHeadReferee',
  'getRegulations',
  'reviewRosterChange',
  'onboardingWorkspace',
  'organizerClaimInvite',
  'tournamentRegistrationFlow',
  'resultCenter',
  'newsCenter',
  'manageTournamentCenterContent',
  'generateMiniProgramCode',
  'platformOwner',
]

function pickLegacyFields(source, fields) {
  const result = {}
  fields.forEach(function (field) {
    if (source && source[field] !== undefined) result[field] = source[field]
  })
  return result
}

async function handleSetHeadReferee(params, authenticated) {
  const db = cloud.database()
  if (!authenticated || !authenticated.user) {
    return { success: false, error: '登录会话已失效，请重新登录', code: 'AUTH_REQUIRED' }
  }

  const scope = await buildOrganizerScope(db, authenticated.user)
  if (scope.organizationConflict) {
    return { success: false, error: '当前账号关联多个机构，请先完成机构核验', code: 'ORG_CONFLICT' }
  }
  if (!scope.orgId) {
    return { success: false, error: '当前账号尚未关联机构，请先完成机构引导', code: 'ORG_REQUIRED' }
  }

  const tournamentId = String(params && params.tournamentId || '').trim()
  const action = String(params && params.action || '').trim().toLowerCase()
  if (!tournamentId) return { success: false, error: '缺少 tournamentId' }
  if (!['get', 'set', 'unset'].includes(action)) {
    return { success: false, error: '无效的 action，支持：set / unset / get' }
  }
  if (!scope.tournamentIds.has(tournamentId)) {
    return { success: false, error: '无权访问当前机构之外的赛事', code: 'ORG_ACCESS_DENIED' }
  }

  const tournamentResult = await db.collection('tournaments').doc(tournamentId).get()
  const tournament = Array.isArray(tournamentResult.data) ? tournamentResult.data[0] : tournamentResult.data
  if (!tournament || !recordHasOrg(tournament, scope.orgId)) {
    return { success: false, error: '赛事不存在或不属于当前机构', code: 'ORG_ACCESS_DENIED' }
  }

  const existingResult = await db.collection('tournament_referees')
    .where({ tournamentId })
    .limit(500)
    .get()
  const existing = existingResult.data || []

  if (action === 'get') {
    const head = existing.find(item => item && item.isHeadReferee === true)
    return { success: true, headRefereeId: head ? String(head.refereeId || '') : null }
  }

  if (action === 'unset') {
    for (const item of existing.filter(row => row && row.isHeadReferee === true)) {
      await db.collection('tournament_referees').doc(item._id).update({
        data: { isHeadReferee: false, updateTime: db.serverDate() }
      })
    }
    return { success: true, message: '已取消裁判长' }
  }

  const refereeId = String(params && params.refereeId || '').trim()
  if (!refereeId) return { success: false, error: '缺少 refereeId' }

  let target = existing.find(item => String(item && item.refereeId || '') === refereeId)
  let refereeName = String(params && params.refereeName || '').trim().slice(0, 80)

  if (!target) {
    const matchesResult = await db.collection('matches').where({ tournamentId }).limit(1000).get()
    const assigned = []
    ;(matchesResult.data || []).forEach(match => {
      const crew = match && match.refereeCrew && typeof match.refereeCrew === 'object'
        ? match.refereeCrew
        : {}
      Object.keys(crew).forEach(key => {
        const referee = crew[key]
        if (!referee || typeof referee !== 'object') return
        const candidateId = String(referee._id || referee.id || '').trim()
        if (candidateId === refereeId) {
          assigned.push(referee)
          if (!refereeName) refereeName = String(referee.name || '').trim().slice(0, 80)
        }
      })
    })
    if (!assigned.length) {
      return { success: false, error: '该裁判未出现在当前赛事的已分配裁判中', code: 'REFEREE_RELATION_REQUIRED' }
    }
  }

  for (const item of existing.filter(row => row && row.isHeadReferee === true && row._id !== (target && target._id))) {
    await db.collection('tournament_referees').doc(item._id).update({
      data: { isHeadReferee: false, updateTime: db.serverDate() }
    })
  }

  if (!target) {
    const created = await db.collection('tournament_referees').add({
      data: {
        tournamentId,
        orgId: scope.orgId,
        refereeId,
        refereeName,
        roleLabel: '裁判',
        isHeadReferee: true,
        assignedAt: db.serverDate(),
        updateTime: db.serverDate()
      }
    })
    return { success: true, message: '裁判长设置成功', created: true, id: created._id }
  }

  await db.collection('tournament_referees').doc(target._id).update({
    data: {
      isHeadReferee: true,
      ...(refereeName ? { refereeName } : {}),
      updateTime: db.serverDate()
    }
  })
  return { success: true, message: '裁判长设置成功' }
}

async function handleLegacyOrganizerFunction(functionName, functionParams, event, authenticated, assistanceGrantId) {
  const params = functionParams || {}
  const base = { ...event, assistanceGrantId: assistanceGrantId || '' }
  if (functionName === 'getTeams') {
    return handleDbQuery({ ...base, collection: 'teams', operation: 'list', where: params.where || {}, orderBy: { createTime: 'desc' }, limit: params.pageSize || 1000, skip: (Number(params.pageIndex) || 0) * (Number(params.pageSize) || 1000) })
  }
  if (functionName === 'getPlayers') {
    return handleDbQuery({ ...base, collection: 'players', operation: 'list', where: params.teamId ? { teamId: params.teamId } : (params.where || {}), orderBy: { createdAt: 'desc' }, limit: params.pageSize || 1000, skip: (Number(params.pageIndex) || 0) * (Number(params.pageSize) || 1000) })
  }
  if (functionName === 'getTournaments') {
    return handleDbQuery({ ...base, collection: 'tournaments', operation: 'list', where: params.where || {}, orderBy: { createdAt: 'desc' }, limit: params.pageSize || 100, skip: (Number(params.pageIndex) || 0) * (Number(params.pageSize) || 100) })
  }

  if (functionName === 'deleteTeam') {
    if (assistanceGrantId) return { success: false, error: '当前协助授权不允许删除球队资料' }
    const teamId = String(params.id || params._id || '')
    if (!teamId) return { success: false, error: '缺少球队ID' }
    const db = cloud.database()
    const scope = await buildOrganizerScope(db, authenticated.user)
    if (scope.organizationConflict) return { success: false, error: '当前账号关联多个机构，请先完成机构核验', code: 'ORG_CONFLICT' }
    if (!scope.orgId) return { success: false, error: '当前账号尚未关联机构，请先完成机构引导', code: 'ORG_REQUIRED' }
    const team = await readDocumentOrNull(db, 'teams', teamId)
    if (!team) return { success: false, error: '球队不存在或已被删除', code: 'TEAM_NOT_FOUND' }
    if (!organizerRecordAllowed('teams', team, scope)) return { success: false, error: '无权删除其他机构的球队' }
    const playerCountResult = await db.collection('players').where({ teamId }).count()
    const playerCount = playerCountResult.total || 0
    if (playerCount > 0 && params.force !== true) return { success: false, error: `该球队下有 ${playerCount} 名球员，请先删除所有球员后再删除球队`, playerCount }
    if (playerCount > 0) await db.collection('players').where({ teamId }).remove()
    await db.collection('teams').doc(teamId).remove()
    return { success: true, message: playerCount > 0 ? `已删除球队及 ${playerCount} 名球员` : '球队已删除', deletedPlayers: playerCount }
  }

  const operation = functionName.startsWith('create') ? 'add' : functionName.startsWith('update') ? 'update' : 'delete'
  const collection = functionName.endsWith('Team') ? 'teams' : 'players'
  const id = params.id || params._id
  if (operation === 'delete') return handleDbQuery({ ...base, collection, operation, id })
  const teamFields = ['name', 'shortName', 'province', 'provinceCode', 'city', 'cityCode', 'cityName', 'teamType', 'teamCode', 'ownerPhone', 'creatorPhone', 'contactPhone', 'phoneNumber', 'phone', 'mobile', 'establishedDate', 'logo', 'logoUrl', 'description', 'home', 'claimStatus', 'source', 'playerCount']
  const playerFields = ['name', 'jerseyNumber', 'position', 'teamId', 'teamName', 'photo', 'photoUrl', 'height', 'weight', 'birthday', 'birthDate', 'contactName', 'contactPhone']
  const data = pickLegacyFields(params, collection === 'teams' ? teamFields : playerFields)
  return handleDbQuery({ ...base, collection, operation, id, data })
}

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
    let delegatedStaff = false
    let delegatedTournamentId = ''
    const personalServiceBinding = functionName === 'tournamentRegistrationFlow' && PERSONAL_SERVICE_BINDING_ACTIONS.has(String(functionParams?.action || ''))
    const requiresSession = functionName === 'uploadFile' ||
      functionName === 'platformOwner' ||
      functionName === 'manageTournamentCenterContent' ||
      functionName === 'generateMiniProgramCode' ||
      ORGANIZER_SCOPED_RELAY_FUNCTIONS.has(functionName) ||
      SESSION_REQUIRED_RELAY_FUNCTIONS.has(functionName) || Boolean(assistanceGrantId)
    if (requiresSession) {
      authenticated = await authenticateWebSession(event)
      if (!authenticated.success) return authenticated
    }
    if (authenticated && authenticated.orgId && !personalServiceBinding) {
      const db = cloud.database()
      const staff = await staffPolicy.isStaff(db, authenticated.userId, authenticated.orgId) && !await staffPolicy.owner(db, authenticated.userId, authenticated.orgId)
      if (staff) {
        delegatedStaff = true
        const tournamentId = String(event.staffTournamentId || '').trim()
        delegatedTournamentId = tournamentId
        const uploadRight = functionName === 'uploadFile' && tournamentId
          ? await staffUploadRight(db, { ...(functionParams || {}), staffModule: event.staffModule }, tournamentId, authenticated.orgId, authenticated.userId) : ''
        const rule = uploadRight ? [uploadRight] : relayRights(functionName, functionParams || {})
        const allowed = Array.isArray(rule) && rule.length === 0 && functionName === 'tournamentStaffAccess' ||
          Boolean(rule && tournamentId && (functionName === 'uploadFile' || await validateStaffRelayScope(db, functionName, functionParams || {}, tournamentId)) && (
            Array.isArray(rule)
              ? (await Promise.all(rule.map(right => staffPolicy.hasRight(db, authenticated.userId, authenticated.orgId, tournamentId, right)))).every(Boolean)
              : Array.isArray(rule.any) && (await Promise.all(rule.any.map(right => staffPolicy.hasRight(db, authenticated.userId, authenticated.orgId, tournamentId, right)))).some(Boolean)
          ))
        if (!allowed) return { success: false, code: 'TOURNAMENT_STAFF_SCOPE_DENIED', error: '当前子账号没有该操作权限' }
      }
    }
    if (authenticated && !assistanceGrantId && ORGANIZER_REQUIRED_RELAY_FUNCTIONS.has(functionName) && !personalServiceBinding) {
      if (authenticated.user.organizationConflict) {
        return { success: false, error: '当前账号关联多个机构，请先完成机构核验', code: 'ORG_CONFLICT' }
      }
      if (!authenticated.orgId) {
        return { success: false, error: '当前账号尚未关联机构，请先完成机构引导', code: 'ORG_REQUIRED' }
      }
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
    if (LEGACY_ORGANIZER_FUNCTIONS.has(functionName)) {
      return handleLegacyOrganizerFunction(functionName, functionParams, event, authenticated, assistanceGrantId)
    }
    if (functionName === 'setHeadReferee') {
      return handleSetHeadReferee(functionParams || {}, authenticated)
    }
    const trustedParams = {
      ...(functionParams || {}),
      ...(authenticated ? { __authToken: event.authToken } : {}),
      ...(authenticated && !assistanceGrant ? {
        __actorUserId: authenticated.userId,
        __actorOrgId: authenticated.orgId,
        ...(delegatedStaff && functionName !== 'tournamentStaffAccess' ? { __staffTournamentId: delegatedTournamentId, __staffModule: String(event.staffModule || '') } : {}),
        ...(functionName === 'updateMatch' ? { __notificationRelay: true } : {}),
        ...(functionName === 'reviewRosterChange' ? {
          __actorUserName: String(authenticated.user.nickname || authenticated.user.userName || authenticated.user.phone || '主办方').slice(0, 50)
        } : {})
      } : {}),
      ...(assistanceGrant ? { assistanceGrantId: assistanceGrant._id } : {})
    }
    console.log('[webApi] 调用云函数:', functionName, '参数 keys:', Object.keys(functionParams || {}))
    const result = await cloud.callFunction({
      name: functionName,
      data: trustedParams,
      // 规程识别包含文件解析和大模型抽取，不能使用 SDK 默认的短超时。
      // 保持在 parseTournamentRegulations 的 240 秒执行上限之外留出返回余量，
      // 让中转层能够拿到并返回明确错误，而不是提前报 ESOCKETTIMEDOUT。
      ...(functionName === 'parseTournamentRegulations' ? { timeout: 270000 } : {})
    })
    console.log('[webApi] 云函数调用成功:', functionName, 'result:', result.result ? '有返回' : '无返回')
    const relayResult = result.result || { success: false, error: '云函数无返回结果' }
    if (relayResult.__notificationRelay && relayResult.__notificationRelay.phone) {
      const notification = relayResult.__notificationRelay
      const relayTimestamp = Date.now()
      try {
        await cloud.callFunction({
          name: 'sendRefereeTemplateMessages',
          data: {
            phone: notification.phone,
            notificationId: notification.notificationId,
            __relayTimestamp: relayTimestamp,
            __relaySignature: createRefereeNotificationRelayProof(notification.phone, relayTimestamp)
          }
        })
      } catch (error) {
        console.warn('[webApi] referee notification relay failed:', error.message)
      }
      delete relayResult.__notificationRelay
    }
    return relayResult
  } catch (err) {
    console.error('[webApi] 云函数调用失败:', functionName, err.message || err)
    return { 
      success: false, 
      error: '云函数 ' + functionName + ' 调用失败: ' + (err.message || '未知错误')
    }
  }
}

const MAX_DIRECT_UPLOAD_BYTES = 8 * 1024 * 1024

function normalizeUploadFolder(value) {
  const folder = String(value || 'images').trim().replace(/\\/g, '/')
  if (!/^[a-z0-9_-]+(?:\/[a-z0-9_-]+){0,2}$/i.test(folder)) return ''
  return folder
}

function normalizeUploadFilename(value) {
  const filename = String(value || '').split(/[\\/]/).pop().replace(/[^a-z0-9._-]/gi, '_').slice(0, 120)
  return filename || `upload_${Date.now()}.bin`
}

async function authenticateUploadRequest(event) {
  const authenticated = await authenticateWebSession(event)
  if (!authenticated.success) return authenticated
  return { success: true, authenticated }
}

// ★ 新：直接在 webLoginApi 上传图片到云存储（绕过 uploadFile 云函数的 HTTP 限制）
async function handleUploadImage(event) {
  const auth = await authenticateUploadRequest(event)
  if (!auth.success) return auth
  const { base64Data, folder } = event
  if (!base64Data) return { success: false, error: '缺少 base64Data' }
  const safeFolder = normalizeUploadFolder(folder)
  if (!safeFolder) return { success: false, error: '上传目录不合法', code: 'UPLOAD_FOLDER_INVALID' }

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

    if (!buffer || buffer.length === 0) return { success: false, error: '图片内容为空' }
    if (buffer.length > MAX_DIRECT_UPLOAD_BYTES) return { success: false, error: '图片大小不能超过 8MB', code: 'UPLOAD_TOO_LARGE' }
    const safeExt = String(ext || 'png').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'png'
    const ts = Date.now()
    const rnd = Math.random().toString(36).substring(2, 8)
    const cloudPath = `${safeFolder}/${ts}_${rnd}.${safeExt}`

    console.log('[webApi] uploadImage:', cloudPath, 'size:', buffer.length)
    const uploadResult = await cloud.uploadFile({ cloudPath, fileContent: buffer })
    console.log('[webApi] uploadImage 成功:', uploadResult.fileID)
    const uploadOrgId = String(auth.authenticated.orgId || '')
    const uploadTournamentId = String(event.staffTournamentId || '')
    if (uploadOrgId && uploadTournamentId && await staffPolicy.isStaff(cloud.database(), auth.authenticated.userId, uploadOrgId) && !await staffPolicy.owner(cloud.database(), auth.authenticated.userId, uploadOrgId)) {
      await cloud.database().collection('tournament_staff_audit').add({ data: {
        action:'upload.file', orgId:uploadOrgId, tournamentId:uploadTournamentId,
        actorUserId:auth.authenticated.userId, fileID:String(uploadResult.fileID),
        folder:safeFolder, permission:safeFolder.startsWith('tournament-news/') ? 'event.news' : safeFolder.startsWith('match-result-evidence/') ? 'event.results' : 'event.teams',
        createTime:cloud.database().serverDate()
      } })
    }

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
  const formAuthToken = event && event.formFields && event.formFields.authToken
  const auth = await authenticateUploadRequest({
    ...event,
    authToken: event.authToken || params.authToken || formAuthToken
  })
  if (!auth.success) return auth
  // 当浏览器以 multipart/form-data 方式直传时，event.body 是 Buffer
  // 字段在 event.formFields / event.body 混合位置
  console.log('[webApi] uploadToCosDirect 收到, event keys:', Object.keys(event || {}))
  console.log('[webApi] body type:', typeof event?.body, Buffer.isBuffer(event?.body))
  console.log('[webApi] formFieldKeys:', Object.keys(event?.formFields || {}))
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

    const safeFolder = normalizeUploadFolder(folder)
    if (!safeFolder) return { success: false, error: '上传目录不合法', code: 'UPLOAD_FOLDER_INVALID' }
    if (buffer.length > MAX_DIRECT_UPLOAD_BYTES) return { success: false, error: '文件大小不能超过 8MB', code: 'UPLOAD_TOO_LARGE' }
    filename = normalizeUploadFilename(filename || `upload_${Date.now()}.png`)
    const cloudPath = `${safeFolder}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${filename}`

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
// CloudBase 的 doc().get() 在文档不存在时抛异常，而不是返回空结果。
// 这里统一收敛为 null，让删除/修改/读取返回受控的“记录不存在”，
// 避免把原始数据库错误（document.getfail document with_id does not exist）透出给页面。
function documentMissingError(error) {
  const message = String((error && (error.message || error.errMsg)) || '').toLowerCase()
  const code = String((error && (error.code || error.errCode)) || '').toLowerCase()
  if (code.includes('document_not_found') || code.includes('documentnotfound')) return true
  if (message.includes('document.getfail')) return true
  return message.includes('document') && (message.includes('does not exist') || message.includes('not exist'))
}

async function readDocumentOrNull(db, collection, id) {
  const targetId = String(id == null ? '' : id).trim()
  if (!targetId) return null
  try {
    const result = await db.collection(collection).doc(targetId).get()
    const record = result.data
    return Array.isArray(record) ? (record[0] || null) : (record || null)
  } catch (error) {
    if (documentMissingError(error)) return null
    throw error
  }
}

// 球队长期资料为唯一真源。刷新参赛关系、球员库和未完赛赛程的展示字段；
// 已完赛/已归档比赛快照不改写，保留历史证据。
async function syncTeamProfileReferences(db, teamId, before, after) {
  const id = String(teamId || '').trim()
  if (!id || !before || !after) return { changed: false, tournamentTeams: 0, players: 0, matches: 0, invitations: 0 }
  const value = (record, keys) => {
    for (const key of keys) {
      if (record && record[key] !== undefined && record[key] !== null && String(record[key]).trim() !== '') return String(record[key]).trim()
    }
    return ''
  }
  const beforeName = value(before, ['name', 'teamName'])
  const afterName = value(after, ['name', 'teamName'])
  const beforeLogo = value(before, ['logo', 'logoUrl', 'logoTransparent', 'teamLogo'])
  const afterLogo = value(after, ['logo', 'logoUrl', 'logoTransparent', 'teamLogo'])
  const nameChanged = beforeName !== afterName
  const logoChanged = beforeLogo !== afterLogo
  if (!nameChanged && !logoChanged) return { changed: false, tournamentTeams: 0, players: 0, matches: 0, invitations: 0 }
  const relationPatch = {}
  if (nameChanged) relationPatch.teamName = afterName
  if (logoChanged) Object.assign(relationPatch, { teamLogo: afterLogo, logo: afterLogo, logoUrl: afterLogo })
  const result = { changed: true, tournamentTeams: 0, players: 0, matches: 0, invitations: 0 }
  const updateRows = async (collection, rows, patch) => {
    for (const row of rows || []) if (row && row._id) await db.collection(collection).doc(row._id).update({ data: { ...patch, updateTime: db.serverDate() } })
    return (rows || []).filter(row => row && row._id).length
  }
  const relationRows = (await db.collection('tournament_teams').where({ teamId: id }).limit(1000).get()).data || []
  result.tournamentTeams = await updateRows('tournament_teams', relationRows, relationPatch)
  const invitationRows = (await db.collection('team_invitations').where({ teamId: id }).limit(1000).get()).data || []
  result.invitations = await updateRows('team_invitations', invitationRows.filter(row => !['cancelled', 'canceled', 'expired', 'rejected'].includes(String(row.status || '').toLowerCase())), relationPatch)
  if (nameChanged) {
    const playerRows = (await db.collection('players').where(db.command.or([{ teamId: id }, { teamCode: id }])).limit(1000).get()).data || []
    result.players = await updateRows('players', playerRows, { teamName: afterName })
  }
  const matches = (await db.collection('matches').where(db.command.or([{ homeTeamId: id }, { awayTeamId: id }])).limit(1000).get()).data || []
  const historical = new Set(['completed', 'finished', 'archived', 'cancelled', 'canceled'])
  for (const match of matches) {
    if (!match || !match._id || historical.has(String(match.status || '').toLowerCase())) continue
    const patch = {}
    if (String(match.homeTeamId || '') === id) { if (nameChanged) patch.homeTeamName = afterName; if (logoChanged) patch.homeTeamLogo = afterLogo }
    if (String(match.awayTeamId || '') === id) { if (nameChanged) patch.awayTeamName = afterName; if (logoChanged) patch.awayTeamLogo = afterLogo }
    if (Object.keys(patch).length) { await db.collection('matches').doc(match._id).update({ data: { ...patch, updateTime: db.serverDate() } }); result.matches += 1 }
  }
  return result
}

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
  const delegatedStaff = Boolean(authenticated.orgId) && await staffPolicy.isStaff(db, authenticated.userId, authenticated.orgId) && !await staffPolicy.owner(db, authenticated.userId, authenticated.orgId)
  if (delegatedStaff && assistanceGrantId) return { success: false, code: 'TOURNAMENT_STAFF_SCOPE_DENIED', error: '赛事子账号不能叠加远程协助授权' }

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
    if (delegatedStaff) {
      const tournamentId = String(event.staffTournamentId || '').trim()
      const requestedModule = String(event.staffModule || '').trim()
      const needed = ['list', 'get', 'count'].includes(operation)
        ? (staffDbRights.readRights(collection).includes(requestedModule) ? [requestedModule] : [])
        : collection === 'teams' && operation === 'add' && requestedModule === 'event.registration'
          ? (staffDbRights.writeRights(collection, operation, data).length ? ['event.registration'] : [])
          : staffDbRights.writeRights(collection, operation, data)
      if (!tournamentId || !needed.length || !(await Promise.all(needed.map(right => staffPolicy.hasRight(db, authenticated.userId, authenticated.orgId, tournamentId, right)))).every(Boolean)) {
        return { success: false, code: 'TOURNAMENT_STAFF_SCOPE_DENIED', error: '当前赛事没有该模块或操作权限' }
      }
      try { organizerScope = await buildStaffEventScope(db, authenticated.userId, authenticated.orgId, tournamentId, event.staffModule) }
      catch (error) { return { success: false, code: 'TOURNAMENT_STAFF_SCOPE_DENIED', error: error.message || '赛事授权范围读取失败' } }
    } else organizerScope = await buildOrganizerScope(db, authenticated.user)
    if (organizerScope.organizationConflict) {
      return { success: false, error: '当前账号关联多个机构，请先完成机构核验', code: 'ORG_CONFLICT' }
    }
    if (!organizerScope.orgId && ['add', 'update', 'delete', 'deleteDivision', 'renameDivision', 'deleteTournamentWorkspace', 'assignTournamentTeamDivision', 'confirmDivisionRules', 'reviseDivisionRules', 'upgradeDivisionToProfessional', 'confirmCompetitionPlan'].includes(operation)) {
      return { success: false, error: '当前账号尚未关联机构，请先完成机构引导', code: 'ORG_REQUIRED' }
    }
  }

  if (REFEREE_CONTROLLED_COLLECTIONS.has(collection) && ['add', 'update', 'delete'].includes(operation)) {
    return { success: false, error: '比赛现场数据只允许授权裁判工作流写入', code: 'REFEREE_WORKFLOW_REQUIRED' }
  }

  try {
    switch (operation) {
      case 'confirmDivisionRules': {
        if (collection !== 'divisions') {
          return { success: false, error: '只允许对竞赛组别执行正式定版', code: 'DIVISION_OPERATION_INVALID' }
        }
        if (assistanceScope) {
          return { success: false, error: '协助模式不能确认竞赛规则', code: 'ASSISTANCE_OPERATION_DENIED' }
        }
        return confirmDivisionRules(db, id, data, organizerScope)
      }
      case 'reviseDivisionRules': {
        if (collection !== 'divisions') {
          return { success: false, error: '只允许对竞赛组别调整规则', code: 'DIVISION_OPERATION_INVALID' }
        }
        if (assistanceScope) {
          return { success: false, error: '协助模式不能调整竞赛规则', code: 'ASSISTANCE_OPERATION_DENIED' }
        }
        return reviseDivisionRules(db, id, organizerScope)
      }
      case 'deleteDivision': {
        if (collection !== 'divisions') {
          return { success: false, error: '只允许删除竞赛组别', code: 'DIVISION_OPERATION_INVALID' }
        }
        if (assistanceScope) {
          return { success: false, error: '协助模式不能删除竞赛组别', code: 'ASSISTANCE_OPERATION_DENIED' }
        }
        return deleteDivision(db, id, organizerScope)
      }
      case 'renameDivision': {
        if (collection !== 'divisions') {
          return { success: false, error: '只允许重命名竞赛组别', code: 'DIVISION_OPERATION_INVALID' }
        }
        if (assistanceScope) {
          return { success: false, error: '协助模式不能重命名竞赛组别', code: 'ASSISTANCE_OPERATION_DENIED' }
        }
        return renameDivision(db, id, data, organizerScope)
      }
      case 'deleteTournamentWorkspace': {
        if (collection !== 'tournaments') {
          return { success: false, error: '只允许对赛事执行工作区删除', code: 'TOURNAMENT_WORKSPACE_OPERATION_INVALID' }
        }
        if (assistanceScope) {
          return { success: false, error: '协助模式不能删除赛事工作区', code: 'ASSISTANCE_OPERATION_DENIED' }
        }
        return deleteTournamentWorkspace(db, id, organizerScope, data && data.confirmText)
      }
      case 'assignTournamentTeamDivision': {
        if (collection !== 'tournament_teams') return { success: false, error: '只允许分配赛事参赛球队', code: 'DIVISION_OPERATION_INVALID' }
        if (assistanceScope) return { success: false, error: '协助模式不能分配竞赛组别', code: 'ASSISTANCE_OPERATION_DENIED' }
        return assignTournamentTeamDivision(db, id, data, organizerScope)
      }
      case 'upgradeDivisionToProfessional': {
        if (collection !== 'divisions') {
          return { success: false, error: '只允许对竞赛组别执行专业版升级', code: 'DIVISION_OPERATION_INVALID' }
        }
        if (assistanceScope) {
          return { success: false, error: '协助模式不能升级竞赛组别', code: 'ASSISTANCE_OPERATION_DENIED' }
        }
        return upgradeDivisionToProfessional(db, id, data, organizerScope)
      }
      case 'confirmCompetitionPlan': {
        if (collection !== 'tournaments') {
          return { success: false, error: '只允许对赛事执行最终竞赛方案确认', code: 'COMPETITION_PLAN_OPERATION_INVALID' }
        }
        if (assistanceScope) {
          return { success: false, error: '协助模式不能确认最终竞赛方案', code: 'ASSISTANCE_OPERATION_DENIED' }
        }
        return confirmCompetitionPlan(db, id, data, organizerScope)
      }
      case 'list': {
        if (organizerScope && organizerScope.staff) {
          const rows = await readStaffRows(db, collection, where && typeof where === 'object' ? where : {}, { maxRows: 20000 })
          const allowed = rows.filter(record => organizerRecordAllowed(collection, record, organizerScope))
          const orders = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []
          for (const entry of orders.slice().reverse()) {
            const field = entry && typeof entry === 'object' ? Object.keys(entry)[0] : ''
            if (!field) continue
            const direction = String(entry[field]).toLowerCase() === 'asc' ? 1 : -1
            allowed.sort((left, right) => String(left[field] == null ? '' : left[field]).localeCompare(String(right[field] == null ? '' : right[field]), 'zh-CN', { numeric: true }) * direction)
          }
          const start = Math.max(Number(skipVal) || 0, 0)
          const size = Math.min(Math.max(Number(limitVal) || 100, 1), 1000)
          return { success: true, data: allowed.slice(start, start + size).map(record => projectStaffRead(collection, record, event.staffModule)), total: allowed.length }
        }
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
        const normalized = await readDocumentOrNull(db, collection, id)
        if (!normalized) return { success: false, error: '记录不存在或已被删除', code: 'RECORD_NOT_FOUND' }
        if (assistanceScope && !assistanceRecordAllowed(collection, normalized, assistanceScope)) {
          return { success: false, error: '该资料不在用户授权范围内' }
        }
        if (organizerScope && !organizerRecordAllowed(collection, normalized, organizerScope)) {
          return { success: false, error: '无权查看其他账号的资料' }
        }
        return { success: true, data: organizerScope && organizerScope.staff ? projectStaffRead(collection, normalized, event.staffModule) : normalized }
      }
      case 'count': {
        if (organizerScope && organizerScope.staff) {
          const rows = await readStaffRows(db, collection, where && typeof where === 'object' ? where : {}, { maxRows: 20000 })
          return { success: true, total: rows.filter(record => organizerRecordAllowed(collection, record, organizerScope)).length }
        }
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
        if (collection === 'divisions' && organizerScope) {
          const ageGroup = String(nextData.ageGroup || '').trim()
          const gender = normalizeDivisionGender(nextData.gender)
          const tournamentId = String(nextData.tournamentId || '').trim()
          if (!ageGroup || !['男子组', '女子组', '混合组'].includes(gender)) {
            return { success: false, error: '请选择有效的年龄组和参赛性别', code: 'DIVISION_NAME_SOURCE_REQUIRED' }
          }
          nextData.gender = gender
          if (!tournamentId) return { success: false, error: '缺少赛事归属', code: 'DIVISION_TOURNAMENT_REQUIRED' }
          const existingResult = await db.collection('divisions').where({ tournamentId }).limit(1000).get()
          const existingRows = (existingResult.data || []).filter(record => organizerRecordAllowed('divisions', record, organizerScope))
          const requestedName = normalizeDivisionDisplayName(nextData.customName || (nextData.nameSource === 'custom' ? nextData.name : ''))
          const finalName = requestedName || `${ageGroup}${gender}`
          const duplicate = existingRows.some(record => normalizeDivisionDisplayName(record.name || record.divisionName).toLowerCase() === finalName.toLowerCase())
          if (duplicate) return { success: false, error: `${finalName} 已存在`, code: 'DIVISION_DUPLICATE' }
          const existingCount = existingRows.length
          nextData.name = finalName
          nextData.divisionName = finalName
          nextData.nameSource = requestedName ? 'custom' : 'generated'
          if (nextData.regulationDetails && typeof nextData.regulationDetails === 'object') {
            nextData.regulationDetails = sanitizeRegulationDetails(nextData.regulationDetails)
          }
          delete nextData.customName
          delete nextData.shortName
          nextData.displayOrder = existingCount + 1
        }
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
        if (delegatedStaff && !await staffWriteReferencesAllowed(db, collection, nextData, organizerScope)) {
          return { success:false, code:'TOURNAMENT_STAFF_SCOPE_DENIED', error:'新增资料关联了未授权的赛事或球队' }
        }
        if (!await competitionPlanMutationAllowed(db, collection, nextData)) {
          return { success: false, error: '竞赛方案已经锁定，不能继续改动已确认赛程', code: 'COMPETITION_PLAN_LOCKED' }
        }
        if (delegatedStaff && collection === 'teams') {
          const divisionId = String(data.staffDivisionId || '')
          if (!divisionId || divisionId === 'default') return { success:false, error:'请选择赛事组别', code:'DIVISION_REQUIRED' }
          const division = await readDocumentOrNull(db, 'divisions', divisionId)
          if (!division || String(division.tournamentId || '') !== organizerScope.tournamentId) return { success:false, error:'组别不属于当前赛事', code:'TOURNAMENT_STAFF_SCOPE_DENIED' }
          const org = await readDocumentOrNull(db, 'organizations', organizerScope.orgId)
          if (!org) return { success:false, error:'机构不存在', code:'ORG_REQUIRED' }
          const capacity = [division.expectedTeams, division.requiredTeams, division.teamRequirement, division.participantTeams, division.maxTeams, division.teamLimit].map(Number).find(value => Number.isFinite(value) && value > 0) || 0
          if (capacity) {
            const rows = (await db.collection('tournament_teams').where({ tournamentId:organizerScope.tournamentId, divisionId }).limit(1000).get()).data || []
            const used = rows.filter(row => ['approved','invited'].includes(String(row.status || '').toLowerCase())).length
            if (rows.length >= 1000 || used >= capacity) return { success:false, error:'该组别参赛名额已满', code:'DIVISION_CAPACITY_FULL' }
          }
          const result = await db.runTransaction(async tx => {
            const team = { ...nextData, ownerId:String(org.ownerId || org.creatorId || organizerScope.userId), creatorId:organizerScope.userId }
            delete team.staffDivisionId
            delete team.staffDivisionName
            const addedTeam = await tx.collection('teams').add({ data:team })
            const addedRelation = await tx.collection('tournament_teams').add({ data: {
              tournamentId:organizerScope.tournamentId, orgId:organizerScope.orgId,
              teamId:addedTeam._id, teamName:String(team.name || ''), divisionId,
              divisionName:String(division.name || division.divisionName || ''),
              isTemporary:team.isTemporary === true, joinSource:'organizer',
              contactName:String(team.contactName || ''), contactPhone:String(team.contactPhone || ''),
              claimStatus:'pending_confirmation', status:'invited',
              createTime:db.serverDate(), updateTime:db.serverDate()
            } })
            return { _id:addedTeam._id, tournamentTeamId:addedRelation._id }
          })
          return { success:true, ...result, message:'球队已加入赛事' }
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
          before = await readDocumentOrNull(db, collection, id)
          if (!before) return { success: false, error: '记录不存在或已被删除', code: 'RECORD_NOT_FOUND' }
          const after = { ...before, ...data }
          if (!assistanceRecordAllowed(collection, before, assistanceScope) ||
              !assistanceRecordAllowed(collection, after, assistanceScope)) {
            return { success: false, error: '该资料不在用户授权范围内' }
          }
        }
        if (organizerScope) {
          before = await readDocumentOrNull(db, collection, id)
          if (!before) return { success: false, error: '记录不存在或已被删除', code: 'RECORD_NOT_FOUND' }
          if (!organizerRecordAllowed(collection, before, organizerScope)) {
            return { success: false, error: '无权修改其他账号的资料' }
          }
          if (collection === 'divisions' && divisionRulesLocked(before)) {
            return { success: false, error: '竞赛规则已经定版，不能直接修改', code: 'DIVISION_RULES_LOCKED' }
          }
          if (collection === 'divisions' && competitionPlanLocked(before)) {
            return { success: false, error: '竞赛方案已经锁定，不能直接修改', code: 'COMPETITION_PLAN_LOCKED' }
          }
          if (collection === 'tournaments' && Object.keys(data || {}).some(field => [
            'competitionPlanLocked', 'competitionPlanStatus', 'competitionPlanVersion',
            'competitionPlanLocks', 'competitionPlanSnapshot', 'matchManagementReady'
          ].includes(field))) {
            return { success: false, error: '竞赛方案必须通过正式确认动作锁定', code: 'COMPETITION_PLAN_CONFIRM_REQUIRED' }
          }
          nextUpdateData = sanitizeOrganizerUpdate(data, collection, before)
          const after = { ...(before || {}), ...nextUpdateData }
          if (!organizerRelationAllowed(collection, after, organizerScope)) {
            return { success: false, error: '不能把资料关联到其他账号的数据' }
          }
          if (delegatedStaff && !await staffWriteReferencesAllowed(db, collection, after, organizerScope)) {
            return { success:false, code:'TOURNAMENT_STAFF_SCOPE_DENIED', error:'资料关联了未授权的赛事或球队' }
          }
        }
        if (!await competitionPlanMutationAllowed(db, collection, { ...(before || {}), ...(nextUpdateData || {}) })) {
          return { success: false, error: '竞赛方案已经锁定，不能直接修改已确认赛程', code: 'COMPETITION_PLAN_LOCKED' }
        }
        await db.collection(collection).doc(id).update({ data: nextUpdateData })
        const teamSync = collection === 'teams' && !assistanceScope
          ? await syncTeamProfileReferences(db, id, before, { ...(before || {}), ...(nextUpdateData || {}) })
          : null
        if (assistanceScope) {
          await writeAssistanceAudit(
            db, assistanceScope, authenticated.userId, 'update', collection, id, before, { ...(before || {}), ...data }
          )
        }
        return { success: true, message: '更新成功', ...(teamSync ? { teamSync } : {}) }
      }
      case 'delete': {
        if (!id) return { success: false, error: '缺少记录 ID' }
        if (assistanceScope) return { success: false, error: '本次协助未开放删除权限' }
        if (collection === 'divisions') {
          return { success: false, error: '竞赛组别必须通过受控删除操作处理', code: 'DIVISION_DELETE_CONTROLLED_REQUIRED' }
        }
        let before = null
        if (COMPETITION_PLAN_MUTABLE_COLLECTIONS.has(collection) || organizerScope) {
          before = await readDocumentOrNull(db, collection, id)
          if (!before) return { success: false, error: '记录不存在或已被删除', code: 'RECORD_NOT_FOUND' }
        }
        if (organizerScope) {
          if (!organizerRecordAllowed(collection, before, organizerScope)) {
            return { success: false, error: '无权删除其他账号的资料' }
          }
        }
        if (!await competitionPlanMutationAllowed(db, collection, before)) {
          return { success: false, error: '竞赛方案已经锁定，不能删除已确认赛程', code: 'COMPETITION_PLAN_LOCKED' }
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

async function handleRefereeRecordReview(event) {
  const authenticated = await authenticateWebSession(event)
  if (!authenticated.success) return authenticated
  const db = cloud.database()
  const delegated = authenticated.orgId && await staffPolicy.isStaff(db, authenticated.userId, authenticated.orgId) && !await staffPolicy.owner(db, authenticated.userId, authenticated.orgId)
  const staffTournamentId = String(event.staffTournamentId || '').trim()
  if (delegated && (!staffTournamentId || !await staffPolicy.hasRight(db, authenticated.userId, authenticated.orgId, staffTournamentId, 'event.results'))) return { success:false, code:'TOURNAMENT_STAFF_SCOPE_DENIED', error:'当前赛事没有赛果复核权限' }
  const scope = delegated
    ? await buildStaffEventScope(db, authenticated.userId, authenticated.orgId, staffTournamentId, 'event.results')
    : await buildOrganizerScope(db, authenticated.user)
  if (scope.organizationConflict) {
    return { success: false, error: '当前账号关联多个机构，请先完成机构核验', code: 'ORG_CONFLICT' }
  }
  if (!scope.orgId) {
    return { success: false, error: '当前账号尚未关联机构，请先完成机构引导', code: 'ORG_REQUIRED' }
  }
  const matchId = String(event.matchId || '')
  const operation = String(event.reviewOperation || '')
  if (!matchId || ['archive', 'return'].indexOf(operation) < 0) return { success: false, error: '复核参数不完整' }
  const result = await db.collection('matches').doc(matchId).get()
  const match = Array.isArray(result.data) ? result.data[0] : result.data
  if (!match || !organizerRecordAllowed('matches', match, scope)) return { success: false, error: '无权复核该比赛记录' }
  if (!match.refereeRecord || match.refereeReviewStatus !== 'under_review') return { success: false, error: '当前记录不在待复核状态' }
  const actor = String(authenticated.user.nickname || authenticated.user.userName || authenticated.user.phone || authenticated.user._id || '赛事主办方').slice(0, 50)
  const now = new Date()
  const logs = Array.isArray(match.refereeWorkflowLogs) ? match.refereeWorkflowLogs.slice(-99) : []
  const nextRecord = Object.assign({}, match.refereeRecord)
  const updateData = { updateTime: db.serverDate() }
  if (operation === 'archive') {
    nextRecord.reviewStatus = 'archived'
    nextRecord.archivedAt = now
    nextRecord.archivedBy = actor
    logs.push({ action: 'archive_referee_record', actorUserId: authenticated.user._id, actor, at: now })
    Object.assign(updateData, { refereeRecord: nextRecord, refereeReviewStatus: 'archived', refereeRecordArchivedAt: db.serverDate(), refereeWorkflowLogs: logs })
  } else {
    const reason = String(event.reason || '').trim().slice(0, 300)
    const fields = Array.isArray(event.fields) ? event.fields.map(String).filter(function(field) { return /^event_player(?::[A-Za-z0-9_-]+)?$/.test(field) }).slice(0, 10) : []
    if (!reason || !fields.length) return { success: false, error: '退回必须填写原因并指定允许修正的事件球员字段' }
    const eventIds = new Set((Array.isArray(match.events) ? match.events : []).map(function(item) { return String(item && item.eventId || '') }))
    if (fields.some(function(field) { return field.indexOf(':') >= 0 && !eventIds.has(field.slice(field.indexOf(':') + 1)) })) return { success: false, error: '退回范围包含不存在的比赛事件' }
    const request = { reason, fields, returnedAt: now, returnedBy: actor, returnedByUserId: authenticated.user._id }
    nextRecord.reviewStatus = 'returned'
    nextRecord.returnRequest = request
    logs.push({ action: 'return_referee_record', actorUserId: authenticated.user._id, actor, detail: { reason, fields }, at: now })
    Object.assign(updateData, { refereeRecord: nextRecord, refereeReviewStatus: 'returned', returnRequest: request, refereeWorkflowLogs: logs })
  }
  await db.collection('matches').doc(matchId).update({ data: updateData })
  return { success: true, reviewStatus: updateData.refereeReviewStatus, message: operation === 'archive' ? '赛果已确认归档' : '电子记录已退回裁判限定修正' }
}

function rosterOwnValue(source, key) {
  return Boolean(source && Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined && source[key] !== null && source[key] !== '')
}

function rosterBoolean(value) {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['false', '0', 'off', 'no', 'disabled'].indexOf(normalized) >= 0) return false
    if (['true', '1', 'on', 'yes', 'enabled'].indexOf(normalized) >= 0) return true
  }
  return Boolean(value)
}

function readRosterBoolean(sources, keys) {
  for (let i = 0; i < (sources || []).length; i += 1) {
    const source = sources[i]
    for (let j = 0; j < (keys || []).length; j += 1) {
      const key = keys[j]
      if (rosterOwnValue(source, key)) return { defined: true, value: rosterBoolean(source[key]) }
    }
  }
  return { defined: false, value: false }
}

function resolveRosterRequirements(tournament, division) {
  const sources = [division, division && division.rulesSnapshot, tournament]
  const identity = readRosterBoolean(sources, ['identityVerificationRequired', 'requiresRealName', 'requireRealName'])
  const portrait = readRosterBoolean(sources, ['portraitRequired', 'requiresPortrait', 'requirePortrait'])
  const parent = readRosterBoolean(sources, ['parentSupplementRequired', 'parentProfileRequired', 'parentCompletionRequired'])
  return {
    identityVerificationRequired: identity.defined ? identity.value : false,
    portraitRequired: portrait.defined ? portrait.value : false,
    parentSupplementConfigured: parent.defined,
    parentSupplementRequired: parent.defined ? parent.value : undefined,
    source: identity.defined || portrait.defined || parent.defined ? 'division-or-tournament' : 'legacy-compatibility'
  }
}

async function loadRosterRequirements(db, tournament, relation) {
  const divisionId = String((relation && (relation.divisionId || relation.division)) || 'default')
  let division = null
  if (divisionId !== 'default') {
    try {
      const divisionResult = await db.collection('divisions').doc(divisionId).get()
      const candidate = Array.isArray(divisionResult.data) ? divisionResult.data[0] : divisionResult.data
      if (candidate && (!candidate.tournamentId || String(candidate.tournamentId) === String(tournament._id))) division = candidate
    } catch (error) {
      console.warn('[webApi] division lookup for roster requirements skipped:', error.message || error)
    }
  }
  if (!division && Array.isArray(tournament.divisions)) {
    division = tournament.divisions.find(function (item) { return String(item && (item.id || item._id) || '') === divisionId }) || null
  }
  return {
    divisionId,
    divisionName: String((relation && relation.divisionName) || (division && (division.name || division.divisionName)) || tournament.divisionName || '未分组'),
    requirements: resolveRosterRequirements(tournament, division)
  }
}

function analyzeRosterPlayer(player, requirements) {
  const raw = String(player && (player.profileStatus || player.verifyStatus || player.identityStatus || player.status) || '').toLowerCase()
  const identityRaw = String(player && (player.identityStatus || player.verifyStatus || player.realNameStatus) || '').toLowerCase()
  const hasPhoto = Boolean(player && (player.photoUrl || player.photo || player.photoFileId))
  const hasBirth = Boolean(player && (player.birthDate || player.birthday))
  const hasName = Boolean(player && player.name)
  const identityRequired = Boolean(requirements && requirements.identityVerificationRequired)
  const portraitRequired = requirements && rosterOwnValue(requirements, 'portraitRequired') ? Boolean(requirements.portraitRequired) : false
  const parentRequired = requirements && requirements.parentSupplementConfigured ? Boolean(requirements.parentSupplementRequired) : false
  const needsIdentity = identityRequired && ['verified', 'approved', 'complete'].indexOf(identityRaw) < 0
  const needsPortrait = portraitRequired && !hasPhoto
  const needsParent = parentRequired && Boolean(player && player.needsParentCompletion)
  const rejected = ['rejected', 'failed', 'exception', 'invalid'].indexOf(raw) >= 0
  return { status: rejected ? 'exception' : (needsIdentity || needsPortrait || !hasBirth || !hasName || needsParent ? 'pending' : 'complete'), needsIdentity, needsPortrait, needsParent, hasBirth, hasName }
}

function normalizeRosterProfileStatus(player, requirements) {
  return analyzeRosterPlayer(player, requirements).status
}

function rosterSnapshotPlayerIds(snapshot) {
  const direct = Array.isArray(snapshot && snapshot.playerIds) ? snapshot.playerIds : []
  const embedded = Array.isArray(snapshot && snapshot.players) ? snapshot.players.map(function (item) {
    return item && (item.playerId || item.id || item._id)
  }) : []
  return Array.from(new Set(direct.concat(embedded).filter(Boolean).map(String)))
}

async function buildRosterMediaStats(db, tournamentId, teamId, playerRows) {
  const {createDataService} = require('./data-center/service.cjs')
  const {sumPlayerRows} = await import('./data-center/statistics.mjs')
  const result = await createDataService(db).query({platformOwner:false,teamIds:[String(teamId)],tournamentIds:[String(tournamentId)]},{teamId:String(teamId),tournamentId:String(tournamentId)})
  return Object.fromEntries(playerRows.map(player => {
    const rows = result.players.filter(row => row.playerId === String(player._id))
    const total = sumPlayerRows(rows)
    const metrics = rows.length ? total.metrics : {starts:null,appearances:null,minutesPlayed:null,goals:null,redCards:null,yellowCards:null}
    return [String(player._id),{...metrics,minutes:metrics.minutesPlayed,coverage:total.coverage,dataVersion:result.dataVersion}]
  }))
}

function mergeRosterPlayerRows(rows) {
  const map = new Map()
  ;(rows || []).flat().forEach(function (item) {
    if (item && item._id) map.set(String(item._id), item)
  })
  return Array.from(map.values())
}

// PC 名单异常看板。这里刻意不复用通用 dbQuery：返回集严格限定为当前主办方的
// 当前赛事参赛关系、名单快照以及这些快照/球队对应的球员资料，不能借看板读取球队长期私有库。
async function handleRosterExceptionBoard(event) {
  const authenticated = await authenticateWebSession(event)
  if (!authenticated.success) return authenticated
  const db = cloud.database()
  const tournamentId = String(event.tournamentId || '')
  const action = String(event.rosterAction || 'list')
  const delegated = authenticated.orgId && await staffPolicy.isStaff(db, authenticated.userId, authenticated.orgId) && !await staffPolicy.owner(db, authenticated.userId, authenticated.orgId)
  if (delegated && (tournamentId !== String(event.staffTournamentId || '') || !await staffPolicy.hasRight(db, authenticated.userId, authenticated.orgId, tournamentId, 'event.teams'))) return { success:false, code:'TOURNAMENT_STAFF_SCOPE_DENIED', error:'当前赛事没有名单管理权限' }
  const scope = delegated
    ? await buildStaffEventScope(db, authenticated.userId, authenticated.orgId, tournamentId, 'event.teams')
    : await buildOrganizerScope(db, authenticated.user)
  if (scope.organizationConflict) {
    return { success: false, error: '当前账号关联多个机构，请先完成机构核验', code: 'ORG_CONFLICT' }
  }
  if (!scope.orgId && ['requestProfileCorrection', 'returnRoster'].includes(action)) {
    return { success: false, error: '当前账号尚未关联机构，请先完成机构引导', code: 'ORG_REQUIRED' }
  }
  if (!tournamentId || !scope.tournamentIds.has(tournamentId)) return { success: false, error: '无权访问该赛事名单' }

  const tournamentResult = await db.collection('tournaments').doc(tournamentId).get()
  const tournament = Array.isArray(tournamentResult.data) ? tournamentResult.data[0] : tournamentResult.data
  if (!tournament) return { success: false, error: '赛事不存在' }

  const relationRows = (await db.collection('tournament_teams').where({ tournamentId }).limit(1000).get()).data || []
  const approvedRelations = relationRows.filter(function (item) {
    return ['approved', 'confirmed', 'active'].indexOf(String(item.status || 'approved')) >= 0
  })
  const relationsByTeamId = new Map()
  approvedRelations.forEach(function (item) {
    const teamId = String(item.teamId || '')
    if (!teamId) return
    const list = relationsByTeamId.get(teamId) || []
    list.push(item)
    relationsByTeamId.set(teamId, list)
  })
  const relationByTeamId = new Map(Array.from(relationsByTeamId.entries()).map(function (entry) { return [entry[0], entry[1][0]] }))
  const teamIds = Array.from(relationByTeamId.keys()).filter(Boolean)

  if (action === 'approvePlayer') {
    const teamId = String(event.teamId || '')
    const playerId = String(event.playerId || '')
    const selectedDivisionId = String(event.divisionId || '')
    if (!teamId || !playerId) return { success:false, error:'缺少球队或球员信息' }
    const teamRelations = relationsByTeamId.get(teamId) || []
    const relation = selectedDivisionId
      ? teamRelations.find(function (item) { return String(item.divisionId || item.division || 'default') === selectedDivisionId })
      : (teamRelations.length === 1 ? teamRelations[0] : null)
    if (!relation) return { success:false, error:'球队不属于当前赛事竞赛组别', code:'DIVISION_NOT_FOUND' }
    const [teamResult, playerByIdResult, playerByCodeResult, snapshotResult] = await Promise.all([
      db.collection('teams').doc(teamId).get(),
      db.collection('players').where({ _id:playerId, teamId }).limit(2).get(),
      db.collection('players').where({ _id:playerId, teamCode:teamId }).limit(2).get(),
      db.collection('roster_snapshots').where({ tournamentId, teamId }).limit(50).get()
    ])
    const team = Array.isArray(teamResult.data) ? teamResult.data[0] : teamResult.data
    if (!team || !organizerRecordAllowed('teams', team, scope)) return { success:false, error:'无权审核该球队球员' }
    const player = mergeRosterPlayerRows([playerByIdResult.data || [], playerByCodeResult.data || []]).find(function (item) { return String(item._id) === playerId })
    if (!player || ['archived', 'deleted'].includes(String(player.status || '').toLowerCase())) return { success:false, error:'球员不存在或不属于当前球队' }
    const relationDivisionId = String(relation.divisionId || relation.division || 'default')
    const snapshots = (snapshotResult.data || []).filter(function (item) {
      const snapshotDivisionId = String(item.divisionId || item.division || '')
      return snapshotDivisionId ? snapshotDivisionId === relationDivisionId : teamRelations.length === 1
    }).sort(function (a, b) { return new Date(b.updateTime || b.createTime || 0).getTime() - new Date(a.updateTime || a.createTime || 0).getTime() })
    const latest = snapshots[0] || null
    const playerIds = Array.from(new Set(rosterSnapshotPlayerIds(latest).concat(playerId)))
    const now = db.serverDate()
    const nextVersion = snapshots.reduce(function (max, item) { return Math.max(max, Number(item.version || 1)) }, 0) + 1
    const created = await db.collection('roster_snapshots').add({ data:{
      tournamentId, teamId, divisionId:relationDivisionId, divisionName:String(relation.divisionName || ''), orgId:scope.orgId,
      playerIds, version:nextVersion, status:'approved', source:'organizer_player_approval', previousSnapshotId:String(latest && latest._id || ''),
      approvedByUserId:authenticated.user._id, approvedAt:now, createTime:now, updateTime:now
    } })
    await db.collection('players').doc(playerId).update({ data:{ organizerReviewStatus:'approved', organizerReviewedAt:now, organizerReviewedBy:String(authenticated.user._id || ''), updateTime:now } })
    const relationId = String(relation._id || '')
    if (relationId) await db.collection('tournament_teams').doc(relationId).update({ data:{ rosterStatus:'approved', rosterPlayerCount:playerIds.length, playerReviewStatus:'completed', lastRosterApprovalAt:now, updateTime:now } })
    return { success:true, playerId, snapshotId:String(created._id), snapshotStatus:'approved', playerIds, message:'球员已审核并加入本届正式名单' }
  }

  if (action === 'listRoster') {
    const teamId = String(event.teamId || '')
    if (!teamId || !relationByTeamId.has(teamId)) return { success: false, error: '球队不属于当前赛事参赛关系' }
    const selectedDivisionId = String(event.divisionId || '')
    const teamRelations = relationsByTeamId.get(teamId) || []
    const relation = selectedDivisionId
      ? teamRelations.find(function (item) { return String(item.divisionId || item.division || 'default') === selectedDivisionId })
      : (new Set(teamRelations.map(function (item) { return String(item.divisionId || item.division || 'default') })).size > 1 ? null : teamRelations[0])
    if (!relation) return { success: false, error: selectedDivisionId ? '球队不属于当前竞赛组别' : '该球队参加了多个竞赛组别，请先选择当前组别', code: selectedDivisionId ? 'DIVISION_NOT_FOUND' : 'DIVISION_REQUIRED' }
    const [teamResult, playerByTeamIdResult, playerByTeamCodeResult, snapshotResult] = await Promise.all([
      db.collection('teams').doc(teamId).get(),
      db.collection('players').where({ teamId }).limit(500).get(),
      db.collection('players').where({ teamCode: teamId }).limit(500).get(),
      db.collection('roster_snapshots').where({ tournamentId, teamId }).limit(50).get()
    ])
    const playerRows = mergeRosterPlayerRows([playerByTeamIdResult.data || [], playerByTeamCodeResult.data || []])
    const team = Array.isArray(teamResult.data) ? teamResult.data[0] : teamResult.data
    if (!team || !organizerRecordAllowed('teams', team, scope)) return { success: false, error: '无权读取该球队资料' }
    const relationDivisionId = String(relation.divisionId || relation.division || 'default')
    const allowLegacySnapshot = teamRelations.length === 1
    const snapshots = (snapshotResult.data || []).filter(function (item) {
      const snapshotDivisionId = String(item.divisionId || item.division || '')
      return snapshotDivisionId ? snapshotDivisionId === relationDivisionId : allowLegacySnapshot
    }).sort(function (a, b) { return new Date(b.updateTime || b.createTime || 0).getTime() - new Date(a.updateTime || a.createTime || 0).getTime() })
    const latest = snapshots[0] || null
    const selectedIds = new Set(rosterSnapshotPlayerIds(latest))
    const rosterConfig = await loadRosterRequirements(db, tournament, relation)
    const requirements = rosterConfig.requirements
    const mediaStats = await buildRosterMediaStats(db, tournamentId, teamId, playerRows)
    const rows = playerRows.filter(function (item) { return !latest || selectedIds.has(String(item._id)) }).map(function (item) {
      const profileState = analyzeRosterPlayer(item, requirements)
      const profileStatus = profileState.status
      const identityRaw = String(item.identityStatus || item.verifyStatus || item.realNameStatus || '').toLowerCase()
      const identityStatus = requirements.identityVerificationRequired ? (['verified', 'approved', 'complete'].indexOf(identityRaw) >= 0 ? 'verified' : 'not_verified') : 'not_required'
      return {
        id: String(item._id), name: String(item.name || '未命名球员'), photoUrl: String(item.photoUrl || item.photo || ''), jerseyNumber: String(item.jerseyNumber || ''), position: String(item.position || ''),
        birthDate: String(item.birthDate || item.birthday || ''), guardianName: String(item.guardianName || item.contactName || ''), guardianPhone: maskServicePhone(item.guardianPhone || item.contactPhone || ''),
        profileStatus, identityStatus, rosterStatus: String(latest && latest.status || 'not_submitted'), rosterVersion: Number(latest && latest.version || 0),
        needsPortrait: requirements.portraitRequired, needsIdentity: profileState.needsIdentity, needsParentCompletion: profileState.needsParent, canRequestCorrection: Boolean(latest && ['submitted', 'approved', 'locked'].indexOf(String(latest.status || '')) >= 0), snapshotId: String(latest && latest._id || ''), mediaStats: mediaStats[String(item._id)] || { starts:null, appearances:null, minutes:null, goals:null, redCards:null, yellowCards:null }
      }
    })
    return { success: true, tournament: { id: tournamentId, name: String(tournament.name || tournament.tournamentName || '赛事'), registrationDeadline: tournament.registrationDeadline || tournament.signupDeadline || null, rosterLocked: Boolean(latest && ['approved', 'locked'].indexOf(String(latest.status || '')) >= 0) }, relation: { teamId, teamName: String(team.name || team.teamName || relation.teamName || '未命名球队'), teamLogo: String(team.logo || team.logoUrl || ''), divisionId: rosterConfig.divisionId, divisionName: rosterConfig.divisionName }, requirements, snapshot: latest ? { id: String(latest._id), status: String(latest.status || 'draft'), version: Number(latest.version || 1), returnReason: String(latest.returnReason || ''), playerIds: rosterSnapshotPlayerIds(latest) } : null, rows }
  }

  if (action === 'requestProfileCorrection') {
    const snapshotId = String(event.snapshotId || ''), playerId = String(event.playerId || ''), reason = String(event.reason || '').trim().slice(0, 300)
    if (!snapshotId || !playerId || !reason) return { success: false, error: '请先选择球员并填写资料纠错说明' }
    const snapshotResult = await db.collection('roster_snapshots').doc(snapshotId).get()
    const snapshot = Array.isArray(snapshotResult.data) ? snapshotResult.data[0] : snapshotResult.data
    const requestedDivisionId = String(event.divisionId || '')
    const snapshotTeamRelations = relationsByTeamId.get(String(snapshot && snapshot.teamId || '')) || []
    const snapshotDivisionId = String(snapshot && (snapshot.divisionId || snapshot.division) || '')
    const snapshotDivisionAllowed = !requestedDivisionId || (snapshotDivisionId ? snapshotDivisionId === requestedDivisionId : (new Set(snapshotTeamRelations.map(function (item) { return String(item.divisionId || item.division || 'default') })).size === 1 && String(snapshotTeamRelations[0] && (snapshotTeamRelations[0].divisionId || snapshotTeamRelations[0].division) || 'default') === requestedDivisionId))
    if (!snapshot || String(snapshot.tournamentId || '') !== tournamentId || !relationByTeamId.has(String(snapshot.teamId || '')) || !snapshotDivisionAllowed || rosterSnapshotPlayerIds(snapshot).indexOf(playerId) < 0) {
      return { success: false, error: '纠错对象不属于当前赛事正式名单' }
    }
    const playerResult = await db.collection('players').doc(playerId).get()
    const player = Array.isArray(playerResult.data) ? playerResult.data[0] : playerResult.data
    if (!player || String(player.teamId || '') !== String(snapshot.teamId || '')) return { success: false, error: '球员不属于当前名单球队' }
    const existing = (await db.collection('roster_profile_correction_requests').where({ snapshotId, playerId, status: 'open' }).limit(1).get()).data || []
    if (existing.length) return { success: false, error: '该球员已有待处理的资料纠错申请' }
    const actor = String(authenticated.user.nickname || authenticated.user.userName || authenticated.user.phone || authenticated.user._id || '主办方').slice(0, 50)
    const created = await db.collection('roster_profile_correction_requests').add({ data: { tournamentId, snapshotId, teamId: String(snapshot.teamId), playerId, orgId: scope.orgId, status: 'open', reason, requestedBy: actor, requestedByUserId: authenticated.user._id, createTime: db.serverDate(), updateTime: db.serverDate() } })
    return { success: true, requestId: String(created._id), message: '已向球队发起资料纠错申请' }
  }

  if (action === 'returnRoster') {
    const snapshotId = String(event.snapshotId || '')
    const reason = String(event.reason || '').trim().slice(0, 300)
    if (!snapshotId || !reason) return { success: false, error: '请填写明确的退回原因' }
    const snapshotResult = await db.collection('roster_snapshots').doc(snapshotId).get()
    const snapshot = Array.isArray(snapshotResult.data) ? snapshotResult.data[0] : snapshotResult.data
    const requestedDivisionId = String(event.divisionId || '')
    const snapshotTeamRelations = relationsByTeamId.get(String(snapshot && snapshot.teamId || '')) || []
    const snapshotDivisionId = String(snapshot && (snapshot.divisionId || snapshot.division) || '')
    const snapshotDivisionAllowed = !requestedDivisionId || (snapshotDivisionId ? snapshotDivisionId === requestedDivisionId : (new Set(snapshotTeamRelations.map(function (item) { return String(item.divisionId || item.division || 'default') })).size === 1 && String(snapshotTeamRelations[0] && (snapshotTeamRelations[0].divisionId || snapshotTeamRelations[0].division) || 'default') === requestedDivisionId))
    if (!snapshot || String(snapshot.tournamentId || '') !== tournamentId || !relationByTeamId.has(String(snapshot.teamId || '')) || !snapshotDivisionAllowed) {
      return { success: false, error: '名单快照不属于当前赛事参赛球队' }
    }
    if (String(snapshot.status || '') !== 'submitted') return { success: false, error: '只有待审核的正式名单可以退回' }
    const actor = String(authenticated.user.nickname || authenticated.user.userName || authenticated.user.phone || authenticated.user._id || '主办方').slice(0, 50)
    await db.collection('roster_snapshots').doc(snapshotId).update({
      data: {
        status: 'returned', returnReason: reason, returnedBy: actor, returnedByUserId: authenticated.user._id,
        returnedAt: db.serverDate(), updateTime: db.serverDate()
      }
    })
    return { success: true, status: 'returned', message: '名单已退回球队补充或修正' }
  }

  const divisionId = String(event.divisionId || '')
  const selectedRelations = divisionId
    ? approvedRelations.filter(function (item) { return String(item.divisionId || item.division || '') === divisionId })
    : approvedRelations
  const selectedTeamIds = new Set(selectedRelations.map(function (item) { return String(item.teamId || '') }).filter(Boolean))
  const [teamResult, playerByTeamIdResult, playerByTeamCodeResult, snapshotResult] = await Promise.all([
    teamIds.length ? db.collection('teams').where({ _id: db.command.in(teamIds) }).limit(1000).get() : Promise.resolve({ data: [] }),
    teamIds.length ? db.collection('players').limit(1000).get() : Promise.resolve({ data: [] }),
    teamIds.length ? db.collection('players').where({ teamCode: db.command.in(teamIds) }).limit(1000).get() : Promise.resolve({ data: [] }),
    db.collection('roster_snapshots').where({ tournamentId }).limit(1000).get()
  ])
  const teamMap = new Map((teamResult.data || []).map(function (item) { return [String(item._id), item] }))
  const playersById = new Map(mergeRosterPlayerRows([playerByTeamIdResult.data || [], playerByTeamCodeResult.data || []]).filter(function (item) {
    return selectedTeamIds.has(String(item.teamId || item.teamCode || ''))
  }).map(function (item) { return [String(item._id), item] }))
  const snapshots = (snapshotResult.data || []).filter(function (item) {
    if (!selectedTeamIds.has(String(item.teamId || ''))) return false
    if (!divisionId) return true
    const snapshotDivisionId = String(item.divisionId || item.division || '')
    return (snapshotDivisionId || 'default') === divisionId
  })
    .sort(function (a, b) { return new Date(b.updateTime || b.createTime || 0).getTime() - new Date(a.updateTime || a.createTime || 0).getTime() })

  const rows = []
  const divisionRequirementEntries = await Promise.all(Array.from(new Set(approvedRelations.map(function (item) { return String(item.divisionId || item.division || 'default') }))).map(async function (divisionKey) {
    const relation = approvedRelations.find(function (item) { return String(item.divisionId || item.division || 'default') === divisionKey }) || { divisionId: divisionKey }
    return [divisionKey, await loadRosterRequirements(db, tournament, relation)]
  }))
  const requirementsByDivision = new Map(divisionRequirementEntries)
  snapshots.forEach(function (snapshot) {
    const teamRelations = relationsByTeamId.get(String(snapshot.teamId || '')) || []
    const snapshotDivisionId = String(snapshot.divisionId || snapshot.division || '')
    const relation = teamRelations.find(function (item) {
      return String(item.divisionId || item.division || 'default') === (snapshotDivisionId || 'default')
    }) || teamRelations[0] || {}
    const team = teamMap.get(String(snapshot.teamId || '')) || {}
    const divisionKey = String(relation.divisionId || relation.division || 'default')
    const rosterConfig = requirementsByDivision.get(divisionKey) || { requirements: resolveRosterRequirements(tournament, null) }
    const requirements = rosterConfig.requirements
    rosterSnapshotPlayerIds(snapshot).forEach(function (playerId) {
      const player = playersById.get(playerId)
      if (!player) return
      const profileState = analyzeRosterPlayer(player, requirements)
      const profileStatus = profileState.status
      if (profileStatus === 'complete') return
      rows.push({
        id: String(snapshot._id) + ':' + playerId,
        snapshotId: String(snapshot._id), teamId: String(snapshot.teamId || ''), teamName: String(team.name || team.teamName || relation.teamName || '未命名球队'),
        teamLogo: String(team.logo || team.logoUrl || ''), divisionName: String(relation.divisionName || relation.division || snapshot.divisionName || '-'),
        playerId, playerName: String(player.name || '未命名球员'), jerseyNumber: String(player.jerseyNumber || ''), position: String(player.position || ''),
        profileStatus, statusText: profileStatus === 'exception' ? '资料异常' : (profileState.needsIdentity ? '待人证核验' : (profileState.needsPortrait ? '待形象照' : (profileState.needsParent ? '待家长补充' : '待完善基础资料'))),
        missingItems: [!player.name ? '姓名' : '', !profileState.hasBirth ? '出生日期' : '', profileState.needsIdentity ? '人证核验' : '', profileState.needsPortrait ? '标准形象照' : '', profileState.needsParent ? '家长资料' : ''].filter(Boolean),
        rosterStatus: String(snapshot.status || 'draft'), rosterVersion: Number(snapshot.version || 1), submittedAt: snapshot.updateTime || snapshot.createTime || null,
        returnReason: String(snapshot.returnReason || '')
      })
    })
  })
  const counts = { exception: rows.filter(function (item) { return item.profileStatus === 'exception' }).length, pending: rows.filter(function (item) { return item.profileStatus === 'pending' }).length, affectedRosters: new Set(rows.map(function (item) { return item.snapshotId })).size }
  return { success: true, tournament: { id: tournamentId, name: String(tournament.name || tournament.tournamentName || '赛事') }, divisions: approvedRelations.map(function (item) { return { id: String(item.divisionId || item.division || ''), name: String(item.divisionName || item.division || '未分组') } }).filter(function (item, index, list) { return item.id && list.findIndex(function (row) { return row.id === item.id }) === index }), rows, counts }
}

// ========== 主入口（支持 HTTP 触发器和 SDK 调用两种方式）==========
function parseHttpRequestParams(event) {
  if (!event || typeof event !== 'object') return {}

  function parseCandidate(candidate, encoded) {
    if (candidate == null || candidate === '') return null
    if (candidate && typeof candidate === 'object' && !Buffer.isBuffer(candidate)) {
      if (candidate.action || candidate.authToken || candidate.phone || candidate.parentInvite) return candidate
      if (candidate.data != null) {
        const nestedData = parseCandidate(candidate.data, false)
        if (nestedData && typeof nestedData === 'object' && (nestedData.action || nestedData.authToken || nestedData.phone || nestedData.parentInvite)) return nestedData
      }
      if (candidate.body != null) {
        const nestedBody = parseCandidate(candidate.body, false)
        if (nestedBody && typeof nestedBody === 'object' && (nestedBody.action || nestedBody.authToken || nestedBody.phone || nestedBody.parentInvite)) return nestedBody
      }
      return candidate
    }
    let rawText = Buffer.isBuffer(candidate) ? candidate.toString('utf8') : String(candidate)
    if (encoded) {
      try { rawText = Buffer.from(rawText, 'base64').toString('utf8') } catch (e) { return null }
    }
    try {
      const parsedJson = JSON.parse(rawText)
      if (typeof parsedJson === 'string') return parseCandidate(parsedJson, false)
      return parsedJson
    } catch (e) {
      if (rawText.indexOf('=') >= 0) {
        try {
          const form = new URLSearchParams(rawText)
          const parsedForm = {}
          form.forEach(function (value, key) { parsedForm[key] = value })
          return parsedForm
        } catch (formError) { return null }
      }
      return null
    }
  }

  const multipartRequest=String(event.headers&&(event.headers['content-type']||event.headers['Content-Type'])||'').toLowerCase().includes('multipart/form-data')
  const candidates = multipartRequest ? [event.queryStringParameters,event.queryParameters] : [
    event.body,
    event.data,
    event.requestBody,
    event.request && event.request.body,
    event.requestContext && event.requestContext.body,
    event.queryStringParameters,
    event.queryParameters
  ]
  for (let index = 0; index < candidates.length; index += 1) {
    const parsed = parseCandidate(candidates[index], Boolean(event.isBase64Encoded) && index === 0)
    if (parsed && typeof parsed === 'object' && (parsed.action || parsed.authToken || parsed.phone || parsed.parentInvite)) return parsed
  }
  return event
}

// 服务号公共赛事中心只消费平台负责人明确发布过的快照，不能由匿名端透传
// collection 名或条件查询，也不能把未发布的赛事、名单和内部资料带到页面上。
function publicPlayerAvatarUrl(player, profilesById) {
  const item = player && typeof player === 'object' ? player : {}
  const candidateIds = [item.id,item._id,item.playerId].map(value => String(value || '').trim()).filter(Boolean)
  const playerId = profilesById ? candidateIds.find(value => String(profilesById.get(value)?._id || '') === value) || '' : ''
  const profile = playerId && profilesById ? profilesById.get(playerId) || {} : {}
  return String(item.portraitUrl || item.avatarUrl || profile.portraitUrl || profile.avatarUrl || profile.photoUrl || '').trim().slice(0, 500)
}

function publicPlayerView(player, role, profilesById, teamName) {
  const item = player && typeof player === 'object' ? player : {}
  const name = String(item.name || item.playerName || item.realName || '').trim()
  if (!name) return null
  const candidateIds = [item.id,item._id,item.playerId].map(value => String(value || '').trim()).filter(Boolean)
  const playerId = profilesById ? candidateIds.find(value => String(profilesById.get(value)?._id || '') === value) || '' : ''
  const playerNumber = String(item.jerseyNumber || item.number || item.shirtNumber || '').trim()
  const lookupKey = '__public_card__|' + String(teamName || '').trim() + '|' + playerNumber + '|' + name
  const profile = profilesById ? ((playerId && profilesById.get(playerId)) || profilesById.get(lookupKey) || {}) : {}
  const appearances = Number(item.appearances || item.matchAppearances || profile.appearances || profile.matchAppearances || 0)
  const metric = function (value) { const number = Number(value); return Number.isFinite(number) ? Math.max(0, Math.min(9999, Math.floor(number))) : 0 }
  const birthDate = String(item.birthDate || item.birthday || profile.birthDate || profile.birthday || '').trim().slice(0, 10)
  const birth = /^\d{4}-\d{2}-\d{2}$/.test(birthDate) ? new Date(birthDate + 'T00:00:00+08:00') : null
  const now = new Date()
  const age = birth && !Number.isNaN(birth.getTime()) ? Math.max(0, now.getFullYear() - birth.getFullYear() - ((now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) ? 1 : 0)) : null
  return {
    name: name.slice(0, 40),
    number: playerNumber.slice(0, 4),
    position: String(item.positionName || item.position || '').trim().slice(0, 20),
    role: role === 'substitute' || String(item.role || '').toLowerCase() === 'substitute' ? 'substitute' : 'starter',
    captain: item.captain === true || item.isCaptain === true,
    avatarUrl: String(item.portraitUrl || item.avatarUrl || profile.portraitUrl || profile.avatarUrl || profile.photoUrl || '').trim().slice(0, 500),
    appearances: metric(appearances),
    playerId: playerId.slice(0, 80),
    jerseyName: String(item.jerseyName || profile.jerseyName || '').slice(0, 40),
    nationality: String(item.nationality || profile.nationality || '中国').slice(0, 30),
    birthDate,
    age,
    height: metric(item.height || profile.height),
    weight: metric(item.weight || profile.weight),
    nativePlace: String(item.nativePlace || item.hometown || profile.nativePlace || profile.hometown || '').slice(0, 80),
    goals: metric(item.goals || profile.goals),
    assists: metric(item.assists || profile.assists),
    points: metric(item.points || profile.points)
  }
}

function publicLineupView(source, teamName, profilesById) {
  const item = source && typeof source === 'object' ? source : {}
  const rawPlayers = Array.isArray(item.players) ? item.players : []
  const rawStarters = Array.isArray(item.starters) ? item.starters : rawPlayers.filter(player => String(player && player.role || '').toLowerCase() !== 'substitute')
  const rawSubstitutes = Array.isArray(item.substitutes) ? item.substitutes : rawPlayers.filter(player => String(player && player.role || '').toLowerCase() === 'substitute')
  const starters = rawStarters.map(player => publicPlayerView(player, 'starter', profilesById, teamName || item.teamName)).filter(Boolean)
  const substitutes = rawSubstitutes.map(player => publicPlayerView(player, 'substitute', profilesById, teamName || item.teamName)).filter(Boolean)
  const status = String(item.status || item.lineupStatus || '').trim().toLowerCase()
  if (!starters.length && !substitutes.length) return null
  if (['draft', 'returned', 'rejected', 'cancelled', 'canceled'].includes(status)) return null
  return {
    teamName: String(teamName || item.teamName || '').trim(),
    formation: String(item.formation || '').trim().slice(0, 20),
    status: status || 'published',
    starters,
    substitutes,
    starterCount: starters.length,
    substituteCount: substitutes.length
  }
}

function publicLineupSource(match, side) {
  const key = side === 'away' ? 'away' : 'home'
  const candidates = [
    match && match[key + 'Lineup'],
    match && match.lineups && match.lineups[key],
    match && match.refereeRosters && match.refereeRosters[key],
    match && match[key + 'Roster']
  ]
  return candidates.find(item => item && typeof item === 'object') || null
}

function publicEventView(event, match) {
  const item = event && typeof event === 'object' ? event : {}
  const rawType = String(item.type || item.eventType || 'other').trim().toLowerCase()
  const description = String(item.description || item.remark || '').trim()
  const type = /乌龙|\bOG\b/i.test(description) || ['own_goal', 'own-goal', 'og'].includes(rawType) ? 'own_goal' : /点球未进|\bPENALTY_MISSED\b/i.test(description) || ['penalty_missed', 'missed_penalty', 'penalty_miss'].includes(rawType) ? 'penalty_missed' : /点球|\bP\b/i.test(description) || ['penalty', 'penalty_goal', 'penalty_kick', 'penalty_scored'].includes(rawType) ? 'penalty' : rawType
  const awayId = String(match && match.awayTeamId || '')
  const side = String(item.teamSide || item.side || '').toLowerCase() === 'away' || (item.teamId && String(item.teamId) === awayId) ? 'away' : 'home'
  const minuteValue = Number(item.minute || item.minuteOfMatch || item.matchMinute || 0)
  return {
    type: type.slice(0, 30),
    minute: Number.isFinite(minuteValue) ? Math.max(0, Math.min(130, Math.round(minuteValue))) : 0,
    teamSide: side,
    teamName: side === 'away' ? String(match && match.awayTeamName || '客队') : String(match && match.homeTeamName || '主队'),
    playerName: String(item.playerName || item.player || item.scorerName || '').trim().slice(0, 40),
    playerNumber: String(item.playerNumber || item.jerseyNumber || item.number || '').trim().slice(0, 4),
    assistName: String(item.assistName || item.assistPlayerName || '').trim().slice(0, 40),
    assistNumber: String(item.assistNumber || item.assistJerseyNumber || '').trim().slice(0, 4),
    description: description.slice(0, 120)
  }
}

function publicScoreFromEvents(events, match) {
  const score = { home: 0, away: 0 }
  ;(Array.isArray(events) ? events : []).forEach(function (event) {
    const type = String(event && (event.type || event.eventType) || '').trim().toLowerCase()
    if (!['goal', 'penalty', 'penalty_scored', 'penalty_goal', 'own_goal', 'own-goal', 'og'].includes(type)) return
    const awayId = String(match && (match.awayTeamId || match.awayTeam && (match.awayTeam._id || match.awayTeam.id)) || '')
    const awayName = String(match && (match.awayTeamName || match.awayTeam && (match.awayTeam.name || match.awayTeam.teamName)) || '')
    let side = String(event && (event.teamSide || event.side) || '').trim().toLowerCase() === 'away' || String(event && event.teamId || '') === awayId || String(event && event.teamName || '') === awayName ? 'away' : 'home'
    if (['own_goal', 'own-goal', 'og'].includes(type)) side = side === 'home' ? 'away' : 'home'
    score[side] = Math.min(99, score[side] + 1)
  })
  return score
}

async function getPublicTournamentCenter() {
  const db = cloud.database()
  const result = await db.collection('publication_snapshots')
    .where({ sportCode: 'football', type: 'tournament_center', status: 'published' })
    .limit(200)
    .get()
  const latest = new Map()
  ;(result.data || []).forEach(function (snapshot) {
    const tournamentId = String(snapshot.tournamentId || '')
    if (!tournamentId || !snapshot.payload || !snapshot.payload.tournament) return
    const previous = latest.get(tournamentId)
    if (!previous || Number(snapshot.version || 0) > Number(previous.version || 0)) latest.set(tournamentId, snapshot)
  })
  const snapshots = Array.from(latest.values()).sort(function (left, right) {
    const leftSort = Number(left.payload && left.payload.tournament && left.payload.tournament.featuredSort || 0)
    const rightSort = Number(right.payload && right.payload.tournament && right.payload.tournament.featuredSort || 0)
    return leftSort - rightSort || Number(right.version || 0) - Number(left.version || 0)
  })
  const publishedTournamentIds = new Set(snapshots.map(function (snapshot) { return String(snapshot.tournamentId || '') }).filter(Boolean))
  const allMatchResult = await db.collection('matches').limit(5000).get()
  const eligibleRows = (allMatchResult.data || []).filter(function (item) {
    const status = String(item.status || '').toLowerCase()
    return item.schedulePublished === true || item.published === true || ['ongoing', 'live', 'completed', 'finished', 'ended'].includes(status)
  })
  const visibleMatchTournamentIds = new Set(eligibleRows.map(function (item) { return String(item.tournamentId || '') }).filter(Boolean))
  const syntheticTournamentIds = Array.from(visibleMatchTournamentIds).filter(function (id) { return !publishedTournamentIds.has(id) })
  const syntheticTournaments = []
  if (syntheticTournamentIds.length) {
    const tournamentResult = await db.collection('tournaments').where({ _id: db.command.in(syntheticTournamentIds.slice(0, 1000)) }).limit(1000).get()
    ;(tournamentResult.data || []).forEach(function (item) {
      const status = String(item.status || '').toLowerCase()
      if (['draft', 'cancelled'].includes(status)) return
      syntheticTournaments.push({
        id: String(item._id || ''), name: String(item.name || item.tournamentName || '未命名赛事'), status: String(item.status || 'ongoing'),
        startDate: String(item.startDate || item.beginDate || ''), endDate: String(item.endDate || item.finishDate || ''), city: String(item.city || item.cityName || item.location || ''), venue: String(item.venue || item.field || item.address || ''),
        category: String(item.category || item.type || ''), formatType: String(item.formatType || item.tournamentType || ''), logo: String(item.logoTransparentUrl || item.logoUrl || item.logo || ''), cover: String(item.coverImage || item.cover || item.bannerImage || item.poster || ''), featuredSort: 0, teamCount: 0, matchCount: 0
      })
    })
  }
  syntheticTournaments.forEach(function (item) { publishedTournamentIds.add(item.id) })
  const tournamentNames = new Map(snapshots.map(function (snapshot) { return [String(snapshot.tournamentId || ''), String(snapshot.payload && snapshot.payload.tournament && snapshot.payload.tournament.name || '公开赛事')] }))
  syntheticTournaments.forEach(function (item) { tournamentNames.set(item.id, item.name) })
  const rawMatches = publishedTournamentIds.size ? eligibleRows.filter(function (item) {
    const tournamentId = String(item.tournamentId || '')
    const status = String(item.status || '').toLowerCase()
    return publishedTournamentIds.has(tournamentId) && (item.schedulePublished === true || item.published === true || ['ongoing', 'live', 'completed', 'finished', 'ended'].includes(status))
  }) : []
  const publicEventRows = []
  const publicLineupRows = []
  const publicSupportRows = []
  const rawMatchIds = rawMatches.map(item => String(item._id || '')).filter(Boolean)
  for (let index = 0; index < rawMatchIds.length; index += 50) {
    const chunk = rawMatchIds.slice(index, index + 50)
    try {
      const eventResult = await db.collection('match_events').where({ matchId: db.command.in(chunk) }).limit(500).get()
      publicEventRows.push(...(eventResult.data || []))
    } catch (error) {
      console.warn('[webApi] public match event lookup skipped:', error.message || error)
    }
    try {
      const lineupResult = await db.collection('match_lineup_snapshots').where({ matchId: db.command.in(chunk) }).limit(500).get()
      publicLineupRows.push(...(lineupResult.data || []))
    } catch (error) {
      console.warn('[webApi] public lineup lookup skipped:', error.message || error)
    }
    try {
      const supportResult = await db.collection('fan_supports').where({ matchId: db.command.in(chunk) }).limit(5000).get()
      publicSupportRows.push(...(supportResult.data || []))
    } catch (error) {
      console.warn('[webApi] public support lookup skipped:', error.message || error)
    }
  }
  const eventRowsByMatch = new Map()
  publicEventRows.forEach(function (row) {
    const matchId = String(row.matchId || '')
    if (!matchId) return
    if (!eventRowsByMatch.has(matchId)) eventRowsByMatch.set(matchId, [])
    eventRowsByMatch.get(matchId).push(row)
  })
  const lineupRowsByMatch = new Map()
  publicLineupRows.forEach(function (row) {
    const matchId = String(row.matchId || '')
    if (!matchId) return
    if (!lineupRowsByMatch.has(matchId)) lineupRowsByMatch.set(matchId, [])
    lineupRowsByMatch.get(matchId).push(row)
  })
  const publicSupportByMatch = new Map()
  publicSupportRows.forEach(function (row) {
    const matchId = String(row.matchId || '')
    if (!matchId) return
    const current = publicSupportByMatch.get(matchId) || { home: 0, away: 0, total: 0 }
    if (row.teamSide === 'away') current.away += 1
    else if (row.teamSide === 'home') current.home += 1
    current.total = current.home + current.away
    publicSupportByMatch.set(matchId, current)
  })
  const publicPlayerIds = new Set()
  const collectPublicPlayerIds = function (lineup) {
    const source = lineup && typeof lineup === 'object' ? lineup : {}
    const players = (Array.isArray(source.starters) ? source.starters : []).concat(Array.isArray(source.players) ? source.players : [], Array.isArray(source.substitutes) ? source.substitutes : [])
    players.forEach(function (player) { const id = String(player && (player.id || player._id || player.playerId) || '').trim(); if (id) publicPlayerIds.add(id) })
  }
  rawMatches.forEach(function (match) { collectPublicPlayerIds(publicLineupSource(match, 'home')); collectPublicPlayerIds(publicLineupSource(match, 'away')) })
  publicLineupRows.forEach(collectPublicPlayerIds)
  const publicPlayerProfiles = new Map()
  const publicPlayerIdList = Array.from(publicPlayerIds).slice(0, 1000)
  for (let index = 0; index < publicPlayerIdList.length; index += 50) {
    try {
      const playerResult = await db.collection('players').where({ _id: db.command.in(publicPlayerIdList.slice(index, index + 50)) }).limit(50).get()
      ;(playerResult.data || []).forEach(function (player) { publicPlayerProfiles.set(String(player._id || ''), player) })
    } catch (error) {
      console.warn('[webApi] public player avatar lookup skipped:', error.message || error)
    }
  }
  const publicTeamIdList = Array.from(new Set(rawMatches.reduce(function (list, match) { ;[match.homeTeamId, match.awayTeamId].forEach(function (id) { if (id) list.push(String(id)) }); return list }, []))).slice(0, 1000)
  for (let index = 0; index < publicTeamIdList.length; index += 50) {
    try {
      const playerResult = await db.collection('players').where({ teamId: db.command.in(publicTeamIdList.slice(index, index + 50)) }).limit(1000).get()
      ;(playerResult.data || []).forEach(function (player) {
        publicPlayerProfiles.set(String(player._id || ''), player)
        const key = '__public_card__|' + String(player.teamName || '').trim() + '|' + String(player.jerseyNumber || player.number || '').trim() + '|' + String(player.name || '').trim()
        if (key !== '__public_card__|||') publicPlayerProfiles.set(key, player)
      })
    } catch (error) {
      console.warn('[webApi] public player card lookup skipped:', error.message || error)
    }
  }
  const publicDetails = new Map()
  rawMatches.forEach(function (item) {
    const matchId = String(item._id || '')
    const matchView = {
      homeTeamId: String(item.homeTeamId || item.homeTeam && (item.homeTeam._id || item.homeTeam.id) || ''),
      awayTeamId: String(item.awayTeamId || item.awayTeam && (item.awayTeam._id || item.awayTeam.id) || ''),
      homeTeamName: String(item.homeTeamName || item.homeTeam && (item.homeTeam.name || item.homeTeam.teamName) || '主队'),
      awayTeamName: String(item.awayTeamName || item.awayTeam && (item.awayTeam.name || item.awayTeam.teamName) || '客队')
    }
    const eventMap = new Map()
    const addEvent = function (event) {
      const normalized = publicEventView(event, matchView)
      const key = String(event && (event.eventId || event._id) || '') || [normalized.type, normalized.minute, normalized.teamSide, normalized.playerName, normalized.description].join('|')
      if (!eventMap.has(key)) eventMap.set(key, normalized)
    }
    if (['ongoing', 'live', 'completed', 'finished', 'ended'].includes(String(item.status || '').toLowerCase())) {
      ;(Array.isArray(item.events) ? item.events : []).forEach(addEvent)
      ;(eventRowsByMatch.get(matchId) || []).forEach(addEvent)
    }
    const rowBySide = { home: null, away: null }
    ;(lineupRowsByMatch.get(matchId) || []).slice().sort(function (left, right) {
      return dateValue(right.updateTime || right.createTime) - dateValue(left.updateTime || left.createTime)
    }).forEach(function (row) {
      const teamId = String(row.teamId || row.sourceTeamId || '')
      const side = teamId && teamId === matchView.awayTeamId ? 'away' : teamId && teamId === matchView.homeTeamId ? 'home' : ''
      if (side && !rowBySide[side]) rowBySide[side] = row
    })
    const homeLineup = publicLineupView(publicLineupSource(item, 'home'), matchView.homeTeamName, publicPlayerProfiles) || publicLineupView(rowBySide.home, matchView.homeTeamName, publicPlayerProfiles)
    const awayLineup = publicLineupView(publicLineupSource(item, 'away'), matchView.awayTeamName, publicPlayerProfiles) || publicLineupView(rowBySide.away, matchView.awayTeamName, publicPlayerProfiles)
    publicDetails.set(matchId, { events: Array.from(eventMap.values()).sort((left, right) => left.minute - right.minute), lineups: { home: homeLineup, away: awayLineup } })
  })
  const liveMatches = []
  if (publishedTournamentIds.size) {
    const teamIds = Array.from(new Set(rawMatches.reduce(function (list, item) {
      ;[item.homeTeamId, item.awayTeamId].forEach(function (id) { if (id) list.push(String(id)) })
      return list
    }, []))).slice(0, 1000)
    const teamMap = new Map()
    if (teamIds.length) {
      try {
        const teamResult = await db.collection('teams').where({ _id: db.command.in(teamIds) }).limit(1000).get()
        ;(teamResult.data || []).forEach(function (team) { teamMap.set(String(team._id), team) })
      } catch (error) {
        console.warn('[webApi] public team logo lookup skipped:', error.message || error)
      }
    }
    rawMatches.forEach(function (item) {
      const status = String(item.status || '').toLowerCase()
      const home = teamMap.get(String(item.homeTeamId || '')) || {}
      const away = teamMap.get(String(item.awayTeamId || '')) || {}
      const sourceEvents = (Array.isArray(item.events) ? item.events : []).concat(eventRowsByMatch.get(String(item._id || '')) || [])
      const eventScore = sourceEvents.length && !item.resultCorrection ? publicScoreFromEvents(sourceEvents, item) : null
      liveMatches.push({
        id: String(item._id || ''), tournamentId: String(item.tournamentId || ''), tournamentName: tournamentNames.get(String(item.tournamentId || '')) || '公开赛事', divisionName: String(item.divisionName || item.division || ''),
        round: String(item.roundName || item.round || item.stageName || item.phase || ''), status: status === 'ongoing' || status === 'live' ? 'ongoing' : (['completed', 'finished', 'ended'].includes(status) ? 'finished' : 'upcoming'),
        matchDate: String(item.matchDate || item.date || ''), matchTime: String(item.startTime || item.time || item.matchTime || ''),
        timestamp: Number(item.timestamp || Date.parse([item.matchDate || item.date, item.startTime || item.time || item.matchTime].filter(Boolean).join(' ')) || 0),
        venue: String(item.venue || item.field || item.location || ''), homeName: String(item.homeTeamName || home.teamName || home.name || '主队待定'),
        awayName: String(item.awayTeamName || away.teamName || away.name || '客队待定'), homeLogo: String(item.homeTeamLogo || item.homeLogo || home.logoTransparentUrl || home.logoUrl || home.logo || ''),
        awayLogo: String(item.awayTeamLogo || item.awayLogo || away.logoTransparentUrl || away.logoUrl || away.logo || ''),
        homeScore: eventScore ? eventScore.home : (Number.isFinite(Number(item.homeScore)) ? Number(item.homeScore) : null), awayScore: eventScore ? eventScore.away : (Number.isFinite(Number(item.awayScore)) ? Number(item.awayScore) : null), resultCorrection: item.resultCorrection || null
      })
    })
  }
  const snapshotMatches = snapshots.flatMap(function (snapshot) {
    return Array.isArray(snapshot.payload && snapshot.payload.matches) ? snapshot.payload.matches : []
  })
  const mergedMatches = new Map()
  snapshotMatches.forEach(function (item) { if (item && item.id) mergedMatches.set(String(item.id), item) })
  liveMatches.forEach(function (item) { if (item.id) mergedMatches.set(String(item.id), item) })
  mergedMatches.forEach(function (item, matchId) {
    if (publicDetails.has(String(matchId))) return
    const matchView = {
      homeTeamId: String(item.homeTeamId || ''),
      awayTeamId: String(item.awayTeamId || ''),
      homeTeamName: String(item.homeName || item.homeTeamName || '主队'),
      awayTeamName: String(item.awayName || item.awayTeamName || '客队')
    }
    const eventMap = new Map()
    ;(Array.isArray(item.events) ? item.events : []).forEach(function (event) {
      const normalized = publicEventView(event, matchView)
      const key = String(event && (event.eventId || event._id) || '') || [normalized.type, normalized.minute, normalized.teamSide, normalized.playerName, normalized.description].join('|')
      if (!eventMap.has(key)) eventMap.set(key, normalized)
    })
    publicDetails.set(String(matchId), {
      events: Array.from(eventMap.values()).sort((left, right) => left.minute - right.minute),
      lineups: {
        home: publicLineupView(publicLineupSource(item, 'home'), matchView.homeTeamName, publicPlayerProfiles),
        away: publicLineupView(publicLineupSource(item, 'away'), matchView.awayTeamName, publicPlayerProfiles)
      }
    })
  })
  const tournaments = snapshots.map(function (snapshot) {
    const item = snapshot.payload.tournament || {}
    const tournamentId = String(item.id || snapshot.tournamentId)
    const matchCount = Array.from(mergedMatches.values()).filter(function (match) { return String(match.tournamentId || '') === tournamentId }).length
    return {
      id: tournamentId, name: String(item.name || '未命名赛事'), status: String(item.status || 'published'),
      startDate: String(item.startDate || ''), endDate: String(item.endDate || ''), city: String(item.city || ''), venue: String(item.venue || ''),
      category: String(item.category || ''), formatType: String(item.formatType || ''), logo: String(item.logo || ''), cover: String(item.cover || ''),
      featuredSort: Number(item.featuredSort || 0), teamCount: Number(item.teamCount || 0), matchCount
    }
  }).concat(syntheticTournaments.map(function (item) {
    const matchCount = Array.from(mergedMatches.values()).filter(function (match) { return String(match.tournamentId || '') === item.id }).length
    return Object.assign({}, item, { matchCount })
  })).sort(function (left, right) {
    return Number(right.matchCount || 0) - Number(left.matchCount || 0) || Number(left.featuredSort || 0) - Number(right.featuredSort || 0)
  })
  const matches = Array.from(mergedMatches.values()).map(function (item) {
    const details = publicDetails.get(String(item.id || '')) || { events: [], lineups: { home: null, away: null } }
    const eventScore = details.events.length && !item.resultCorrection ? publicScoreFromEvents(details.events) : null
    return {
      id: String(item.id || ''), tournamentId: String(item.tournamentId || ''), tournamentName: String(item.tournamentName || ''),
      divisionName: String(item.divisionName || ''), round: String(item.round || ''),
      status: ['ongoing', 'finished'].includes(String(item.status || '')) ? String(item.status) : 'upcoming',
      matchDate: String(item.matchDate || ''), matchTime: String(item.matchTime || ''), timestamp: Number(item.timestamp || 0), venue: String(item.venue || ''),
      homeName: String(item.homeName || '主队待定'), awayName: String(item.awayName || '客队待定'), homeLogo: String(item.homeLogo || ''), awayLogo: String(item.awayLogo || ''),
      homeScore: eventScore ? eventScore.home : (Number.isFinite(Number(item.homeScore)) ? Number(item.homeScore) : null), awayScore: eventScore ? eventScore.away : (Number.isFinite(Number(item.awayScore)) ? Number(item.awayScore) : null),
      support: publicSupportByMatch.get(String(item.id || '')) || { home: 0, away: 0, total: 0 },
      events: details.events,
      lineups: details.lineups
    }
  }).filter(function (item) { return item.id && item.tournamentId })
    .sort(function (left, right) { return Number(left.timestamp || 0) - Number(right.timestamp || 0) })
  const publicMatchIds = new Set(rawMatches.map(function (item) { return String(item._id || '') }).filter(Boolean))
  const newsRows = []
  const publicIds = tournaments.map(function (item) { return String(item.id || '') }).filter(Boolean)
  for (let index = 0; index < publicIds.length; index += 25) {
    try {
      const result = await db.collection('tournament_news').where({ tournamentId: db.command.in(publicIds.slice(index, index + 25)), status: 'published' }).limit(500).get()
      newsRows.push(...(result.data || []))
    } catch (error) {
      console.warn('[webApi] public news lookup skipped:', error.message || error)
    }
  }
  const matchById = new Map(rawMatches.map(function (item) { return [String(item._id || ''), item] }))
  const publicNews = []
  for (const row of newsRows) {
    const matchIds = Array.isArray(row.matchIds) ? row.matchIds.map(String) : []
    if (!matchIds.length || !matchIds.every(function (id) { return publicMatchIds.has(id) })) continue
    if (!Array.isArray(row.sourceResultVersions) || row.sourceResultVersions.length !== matchIds.length) continue
    let valid = true
    for (let index = 0; index < matchIds.length; index += 1) {
      const match = matchById.get(matchIds[index])
      const source = row.sourceResultVersions[index]
      if (!match || String(source.matchId || '') !== matchIds[index] || String(source.version || '') !== await publicNewsResultVersion(db, match, eventRowsByMatch.get(matchIds[index]) || [])) { valid = false; break }
    }
    if (!valid) continue
    publicNews.push({
      id: String(row._id || ''), tournamentId: String(row.tournamentId || ''), kind: String(row.kind || 'match'), date: String(row.date || ''),
      title: String(row.title || ''), body: String(row.body || ''), publishedAt: dateValue(row.publishedAt || row.updateTime) ? new Date(dateValue(row.publishedAt || row.updateTime)).toISOString() : '',
      matchIds, dayResults: Array.isArray(row.dayResults) ? row.dayResults : [], nextFixtures: Array.isArray(row.nextFixtures) ? row.nextFixtures : [], suspensionNote: String(row.suspensionNote || ''),
      coverFileId: String(row.coverFileId || ''), photoFileIds: Array.isArray(row.photoFileIds) ? row.photoFileIds.slice(0, 3) : [], standingsSnapshotFileId: String(row.standingsSnapshotFileId || '')
    })
  }
  publicNews.sort(function (left, right) { return dateValue(right.publishedAt) - dateValue(left.publishedAt) })
  return { success: true, data: { tournaments, matches, news: publicNews.slice(0, 200) } }
}

function newsResultOfficial(match) {
  if (!match || match.homeScore == null || match.awayScore == null) return false
  const states = [match.resultReviewStatus, match.reviewStatus, match.refereeReviewStatus, match.refereeRecord && match.refereeRecord.reviewStatus, match.status].map(value => String(value || '').trim().toLowerCase())
  if (states.some(value => ['returned', 'rejected', 'warning', 'conflict', 'abandoned'].includes(value))) return false
  if (states.some(value => ['approved', 'archived', 'official'].includes(value))) return true
  return !match.refereeRecord && !match.refereeSubmittedAt && ['finished', 'completed', 'ended'].includes(String(match.status || '').trim().toLowerCase())
}

async function publicNewsResultVersion(db, match, separateEvents) {
  if (!newsResultOfficial(match)) return ''
  let events = Array.isArray(match.events) ? match.events.slice() : []
  events = events.concat(Array.isArray(separateEvents) ? separateEvents : [])
  const goals = events.filter(event => ['goal', 'penalty_goal', 'own_goal', 'own-goal', 'og'].includes(String(event.type || event.eventType || '').trim().toLowerCase()))
    .map(event => ({ type: String(event.type || event.eventType || '').trim(), minute: Number(event.minute), side: String(event.teamSide || event.side || '').trim(), player: String(event.playerName || event.player || '').trim() }))
    .sort((a, b) => a.minute - b.minute || a.type.localeCompare(b.type) || a.side.localeCompare(b.side) || a.player.localeCompare(b.player))
  const material = {
    homeScore: match.homeScore, awayScore: match.awayScore,
    resultVersionId: String(match.resultVersionId || '').trim(),
    resultCorrectedAt: String(match.resultCorrectedAt || match.resultCorrection && match.resultCorrection.correctedAt || '').trim(),
    correctionId: String(match.resultCorrection && match.resultCorrection.correctionId || '').trim(), goals
  }
  return crypto.createHash('sha256').update(JSON.stringify(material)).digest('hex')
}
exports.main = async (event, context) => {
  // CORS：设置响应头（HTTP 触发器模式需要）
  const response = (statusCode, body) => ({
    statusCode,
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Sxf-Parent-Session', 'Content-Type': 'application/json; charset=utf-8' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    isBase64Encoded: false
  })

  // 处理 OPTIONS 预检请求
  if (event.httpMethod === 'OPTIONS') {
    return response(200, '')
  }

  // 从 HTTP 请求体或 SDK 调用中提取参数
  const params = parseHttpRequestParams(event)
  if(event.httpMethod==='POST'&&String(event.headers&&(event.headers['content-type']||event.headers['Content-Type'])||'').toLowerCase().includes('multipart/form-data')){
    const file=await readIdentityMultipart(event)
    if(!file||file.tooLarge||!file.image||!file.image.length||file.image.length>3*1024*1024)return response(413,{success:false,error:'照片超过3MB，请重新选择',code:'OCR_UPLOAD_TOO_LARGE'})
    Object.assign(params,file.fields||{},{action:String((file.fields&&file.fields.action)||params.action||'prepareParentIdentityImage'),__identityImageBuffer:file.image,__identityImageMime:file.fields.__imageMime||'image/jpeg',parentSessionToken:String((file.fields&&file.fields.parentSessionToken)||params.parentSessionToken||(event.headers&&((event.headers['x-sxf-parent-session'])||event.headers['X-Sxf-Parent-Session']))||'')})
  }

  const action = params.action
  console.log('[webApi] action:', action, 'params keys:', Object.keys(params))

  try {
    if (params.authToken && !['checkLogin', 'callFunction'].includes(action)) {
      const session = await authenticateWebSession(params)
      if (session.success && session.orgId) {
        const db = cloud.database()
        if (await staffPolicy.isStaff(db, session.userId, session.orgId) && !await staffPolicy.owner(db, session.userId, session.orgId)) {
          const permittedSessionActions = ['getCurrentAccountProfile', 'listServiceBindingOrganizations', 'selectActiveOrganization', 'dbQuery', 'reviewRefereeRecord', 'rosterExceptionBoard']
          const playerCardViewerActions = ['getPlayerCardsForViewer', 'getPlayerCardForViewer', 'getPlayerCardById']
          if (action === 'uploadImage') {
            const tournamentId = String(params.staffTournamentId || '')
            if (params.tournamentId && String(params.tournamentId) !== tournamentId) return response(200, { success:false, code:'TOURNAMENT_STAFF_SCOPE_DENIED', error:'赛事范围不一致' })
            const folder = String(params.folder || '')
            const news = folder === `tournament-news/${tournamentId}` && (
              await staffPolicy.hasRight(db, session.userId, session.orgId, tournamentId, 'event.news') ||
              await staffPolicy.hasRight(db, session.userId, session.orgId, tournamentId, 'news.edit'))
            const evidenceMatch = folder.match(/^match-result-evidence\/([^/]+)\/([^/]+)$/)
            const evidence = evidenceMatch && evidenceMatch[1] === session.orgId &&
              (await validateStaffRelayScope(db, 'resultCenter', { matchId:evidenceMatch[2] }, tournamentId)) && (
                await staffPolicy.hasRight(db, session.userId, session.orgId, tournamentId, 'event.results') ||
                await staffPolicy.hasRight(db, session.userId, session.orgId, tournamentId, 'result.supplement'))
            const teamImageMatch = folder.match(/^(?:team-logos|player-photos|idcard-photos)\/([^/]+)$/)
            const teamImage = teamImageMatch && await validateStaffRelayScope(db, 'teamImage', { teamId:teamImageMatch[1] }, tournamentId) &&
              await staffPolicy.hasRight(db, session.userId, session.orgId, tournamentId, 'event.teams')
            const newTeamLogo = folder === 'team-logos' && (
              await staffPolicy.hasRight(db, session.userId, session.orgId, tournamentId, 'event.teams') ||
              await staffPolicy.hasRight(db, session.userId, session.orgId, tournamentId, 'event.registration'))
            if (!news && !evidence && !teamImage && !newTeamLogo) return response(200, { success: false, code: 'TOURNAMENT_STAFF_SCOPE_DENIED', error: '当前赛事没有上传权限' })
          } else if (playerCardViewerActions.includes(action)) {
            const tournamentId = String(params.staffTournamentId || '').trim()
            const moduleRight = String(params.staffModule || '').trim()
            const validModule = ['event.dashboard','event.registration','event.teams','event.draw','event.matches','event.results'].includes(moduleRight)
            const hasModuleRight = tournamentId && validModule && await staffPolicy.hasRight(db, session.userId, session.orgId, tournamentId, moduleRight)
            if (!hasModuleRight) return response(200, { success:false, code:'TOURNAMENT_STAFF_SCOPE_DENIED', error:'当前子账号没有查看本赛事球员卡的权限' })
            params.__staffTournamentId = tournamentId
            params.__staffModule = moduleRight
          } else if (!permittedSessionActions.includes(action)) {
            return response(200, { success: false, code: 'TOURNAMENT_STAFF_SCOPE_DENIED', error: '当前子账号没有该操作权限' })
          }
        }
      }
    }
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
      case 'platformPasswordLogin':
        result = await handlePlatformPasswordLogin(params)
        break
      case 'wechatWebLogin':
        result = await handleWechatOnlyLogin(params)
        break
      case 'wechatPhoneChallenge':
        result = await handleWechatOnlyLogin(params)
        if (result && result.success && result.directLogin && result.user && result.user._id) {
          result.authToken = await createWebSession(result.user._id)
          result.authExpiresAt = new Date(Date.now() + WEB_SESSION_TTL_MS)
        }
        break
      case 'sendWechatLoginSms':
        result = await handleSendWechatLoginSms(params)
        break
      case 'completeWechatPhoneLogin':
        result = await handleCompleteWechatPhoneLogin(params)
        if (result && result.success && result.user && result.user._id) {
          result.authToken = await createWebSession(result.user._id)
          result.authExpiresAt = new Date(Date.now() + WEB_SESSION_TTL_MS)
        }
        break
      case 'getCurrentAccountProfile':
        result = await handleGetCurrentAccountProfile(params)
        break
      case 'sendCurrentUserPhoneBindSms':
        result = await handleSendCurrentUserPhoneBindSms(params)
        break
      case 'bindCurrentUserPhone':
        result = await handleBindCurrentUserPhone(params)
        break
      case 'deleteCurrentAccount':
        result = await handleDeleteCurrentAccount(params)
        break
      case 'checkLogin': {
        const auth = await authenticateWebSession(params)
        result = auth.success
          ? { success: true, loggedIn: true, user: { _id: auth.user._id, role: auth.user.role || ORGANIZER_ROLE } }
          : { success: false, loggedIn: false, error: auth.error, code: auth.code }
        break
      }
      case 'publicDataCenter':
        result = await require('./publicDataCenter.cjs')(cloud.database(), params)
        break
      case 'getMyPreloadedPlayerCard':
      case 'previewMyPreloadedPlayerCard':
      case 'saveMyPreloadedPlayerCard':
      case 'selectMyPlayerCard':
      case 'listMyPlayerCards':
      case 'getMyPlayerCard':
      case 'previewMyPlayerCard':
      case 'saveMyPlayerCard':
        result = await createPlayerCards({ cloud, authenticateParentH5Session, previewParentProfileInvite, hashSessionToken, dateValue })(params)
        break
      case 'getPlayerCardsForViewer':
      case 'getPlayerCardForViewer':
      case 'getPlayerCardById':
        result = await require('./playerCardAccess.cjs').createPlayerCardAccess({cloud,authenticateWebSession,buildOrganizerScope,organizerRecordAllowed,buildStaffEventScope,recordBelongsToStaffEvent})(params); break
      case 'getAdminPlayerCard':
      case 'saveAdminPlayerCard':
        result = await require('./playerCardsAdmin.cjs').createAdminPlayerCards({cloud,authenticateWebSession,buildOrganizerScope,organizerRecordAllowed})(params); break
      case 'listPlayerCardCatalog':
      case 'listPlayerCardCatalogTargets':
      case 'listPlayerCardCatalogTemplates':
      case 'startPlayerCardCatalogBatch':
      case 'advancePlayerCardCatalogBatch':
      case 'getPlayerCardCatalogBatchStatus':
      case 'retryPlayerCardCatalogBatch':
      case 'getPlayerCardCatalogCard':
      case 'previewPlayerCardCatalogCard':
      case 'savePlayerCardCatalogCard':
        result = await require('./playerCardCatalogAdmin.cjs').createPlayerCardCatalogAdmin({cloud,authenticateWebSession})(params); break
      case 'listPlayerCardPreloadTargets':
      case 'getPlayerCardPreloadPlayer':
      case 'listPlayerCardLayoutPresets':
      case 'getPlayerCardLayoutPreset':
      case 'savePlayerCardLayoutPreset':
      case 'listPlayerCardTemplates':
      case 'getPlayerCardTemplate':
      case 'savePlayerCardTemplate':
      case 'previewPlayerCardTemplate':
      case 'publishPlayerCardTemplate':
      case 'continuePlayerCardTemplatePublish':
      case 'getPlayerCardTemplatePublishStatus':
      case 'retryPlayerCardTemplatePublish':
      case 'listPlayerCardTemplatePublishPreviews':
      case 'confirmPlayerCardTemplatePublish':
      case 'rejectPlayerCardTemplatePublish':
      case 'getActivePlayerCardTemplate':
        result = await require('./playerCardTemplates.cjs').createPlayerCardTemplates({ cloud, authenticateWebSession })(params); break
      case 'publicTournamentCenter':
        result = await getPublicTournamentCenter()
        break
      case 'fanOAuthUrl':
        result = await fanCenterHandlers().createFanOAuthUrl(params && params.returnUrl); break
      case 'fanOAuth':
        result = await fanCenterHandlers().handleFanOAuth(params); break
      case 'fanOverview':
        result = await fanCenterHandlers().handleFanOverview(params); break
      case 'fanCheckIn':
        result = await fanCenterHandlers().handleFanCheckIn(params); break
      case 'fanRankings':
        result = await fanCenterHandlers().handleFanRankings(params); break
      case 'publicTournamentPlayerCard':
        result = await require('./publicTournamentPlayerCard.cjs').createPublicTournamentPlayerCard({cloud,handleFanRankings:fanCenterHandlers().handleFanRankings})(params); break
      case 'fanSupport': {
        const center = fanCenterHandlers()
        result = ['team','player'].includes(String(params.targetType || ''))
          ? await require('./fanSupportPlayer.cjs').handleRankingSupport(params,{ cloud, hashSessionToken, dateValue, fanPeriodKey:center.fanPeriodKey, handleFanRankings:center.handleFanRankings })
          : await center.handleFanSupport(params)
        break
      }
      case 'serviceRefereeOAuthUrl':
        result = await createRefereeOAuthUrl(params && params.returnUrl); break
      case 'serviceRefereeOAuth':
        result = await handleRefereeOAuth(params); break
      case 'serviceRefereeWorkflow':
        result = await handleRefereeWorkflow(params); break
      case 'serviceEntryOAuthUrl':
      case 'completeServiceEntryOAuth':
      case 'serviceEntrySendSms':
      case 'serviceEntryVerifySms':
      case 'serviceEntryContext':
      case 'serviceEntryClaimTeam':
      case 'serviceEntryJoinPlayer':
        result = await require('./service-entry')(action, params); break
      case 'previewParentProfileInvite':
        result = await previewParentProfileInvite(params); break
      case 'parentProfileOAuthUrl':
        result = await createParentProfileOAuthUrl(params); break
      case 'createParentProfileReviewSubscribeOAuthUrl':
        result = await createParentProfileReviewSubscribeOAuthUrl(params); break
      case 'completeParentProfileReviewSubscribeOAuth':
        result = await completeParentProfileReviewSubscribeOAuth(params); break
      case 'recordParentProfileReviewSubscription':
        result = await recordParentProfileReviewSubscription(params); break
      case 'parentProfileOAuth':
        result = await handleParentProfileOAuth(params); break
      case 'checkParentProfileSession': {
        const parentSessionCheck = await authenticateParentH5Session(params)
        result = parentSessionCheck.success ? { success:true, expiresAt:parentSessionCheck.session.expiresAt } : parentSessionCheck
        break
      }
      case 'getParentProfileDraft':
        result = await loadParentProfileDraft(params); break
      case 'saveParentBasicProfile':
        result = await saveParentBasicProfile(params); break
      case 'prepareParentIdentityImage':
        result = await prepareParentIdentityImage(params); break
      case 'uploadParentIdentityDocument':
        result = await uploadParentIdentityDocument(params); break
      case 'submitParentIdentityVerification':
        result = await submitParentIdentityVerification(params); break
      case 'getParentIdentityVerification':
        result = await getParentIdentityVerification(params); break
      case 'listIdentityReviewQueue':
        result = await listIdentityReviewQueue(params); break
      case 'reviewIdentityVerification':
        result = await reviewIdentityVerification(params); break
      case 'requestParentIdentityCorrection':
        result = await requestParentIdentityCorrection(params); break
      case 'uploadAndProcessParentPortrait':
        result = await uploadAndProcessParentPortrait(params); break
      case 'confirmParentPortrait':
        result = await confirmParentPortrait(params); break
      case 'retryParentFaceRegistration':
        result = await retryParentFaceRegistration(params); break
      case 'completeParentProfile':
        result = await completeParentProfile(params); break
      case 'reviewRefereeRecord':
        result = await handleRefereeRecordReview(params); break
      case 'rosterExceptionBoard':
        result = await handleRosterExceptionBoard(params); break
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

    result = await require('./data-center/lifecycle-reader.cjs').decorateLifecycleResult(cloud.database(), result, params)
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
