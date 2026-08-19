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

// 服务号裁判工作台使用独立 AppID/OpenID，不能与 PC 扫码登录或小程序 OpenID 混用。
const SERVICE_ACCOUNT_CONFIG = {
  APP_ID: process.env.SERVICE_ACCOUNT_APP_ID || '',
  APP_SECRET: process.env.SERVICE_ACCOUNT_APP_SECRET || '',
  H5_URL: process.env.SERVICE_ACCOUNT_H5_URL || ''
}

const WEB_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
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
  'matches', 'match_events', 'match_referees', 'tournament_referees',
  'tournament_teams', 'tournament_groups', 'tournament_bracket',
  'tournament_league_tables', 'rosters', 'roster_change_requests',
  'squads', 'standings', 'schedule_info', 'team_tasks', 'divisions'
])

const ORGANIZER_SCOPED_RELAY_FUNCTIONS = new Set([
  'generateSchedule', 'updateMatch', 'onboardingWorkspace', 'organizerClaimInvite',
  'reviewRosterChange', 'clearTeamPlayers', 'tournamentReview', 'applyTournament', 'getMyTeams',
  'setHeadReferee'
])

// 这些中转入口会消耗第三方 AI/微信能力，或读取受保护的球员/比赛数据。
// 即使当前调用不写入数据库，也必须先通过网页会话，不能把 relay 当作匿名代理。
const SESSION_REQUIRED_RELAY_FUNCTIONS = new Set([
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
  'setHeadReferee'
])

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

function normalizeServiceH5Url(value) {
  const url = String(value || '').trim()
  if (!/^https:\/\//i.test(url)) return ''
  return url.split('#')[0]
}

async function createRefereeOAuthUrl() {
  const redirectUri = normalizeServiceH5Url(SERVICE_ACCOUNT_CONFIG.H5_URL)
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
  'getWorkbench', 'sendBindSms', 'verifyBindSms', 'getRefereeMatch',
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
  return {
    guardianAuthorization: true,
    parentSupplementRequired: parent.defined ? parent.value : true,
    parentSupplementConfigured: true,
    identityVerificationRequired: identity.defined ? identity.value : false,
    portraitRequired: portrait.defined ? portrait.value : false,
    realName: identity.defined ? identity.value : false,
    portrait: portrait.defined ? portrait.value : false,
    source: identity.defined || portrait.defined || parent.defined ? 'invite-or-player' : 'invite'
  }
}

async function previewParentProfileInvite(event) {
  const token = String(event.parentInvite || '').trim()
  if (!/^pp_[a-z0-9]+$/i.test(token)) return { success: false, error: '家长协作链接无效或已失效', code: 'PARENT_INVITE_INVALID' }
  const db = cloud.database()
  const inviteResult = await db.collection('parent_profile_invites').where({ token, status: 'active' }).limit(2).get()
  const invites = inviteResult.data || []
  if (invites.length !== 1) return { success: false, error: '家长协作链接无效或已失效', code: 'PARENT_INVITE_INVALID' }
  const invite = invites[0]
  if (invite.expiresAt && dateValue(invite.expiresAt) <= Date.now()) return { success: false, error: '家长协作链接已过期，请联系球队重新生成', code: 'PARENT_INVITE_EXPIRED' }
  const playerResult = await db.collection('players').doc(invite.playerId).get()
  const teamResult = await db.collection('teams').doc(invite.teamId).get()
  const player = Array.isArray(playerResult.data) ? playerResult.data[0] : playerResult.data
  const team = Array.isArray(teamResult.data) ? teamResult.data[0] : teamResult.data
  if (!player || !team || String(player.teamId || '') !== String(invite.teamId || '')) return { success: false, error: '邀请关联资料不存在，请联系球队管理员', code: 'PARENT_INVITE_BROKEN' }
  return { success: true, data: { playerName: String(player.name || '球员'), birthDate: String(player.birthDate || player.birthday || ''), teamName: String(team.name || team.teamName || ''), guardianPhoneMasked: maskServicePhone(player.guardianPhone || player.contactPhone || invite.guardianPhone), requirements: resolveParentInviteRequirements(invite, player), status: String(player.profileStatus || 'pending') } }
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
  const sessionToken = crypto.randomBytes(32).toString('hex')
  await db.collection('parent_h5_sessions').add({ data: { tokenHash: hashSessionToken(sessionToken), parentInvite: record.parentInvite, serviceAccountOpenId: oauth.openid, unionId: oauth.unionid || '', active: true, expiresAt: new Date(Date.now() + REFEREE_H5_SESSION_TTL_MS), createTime: db.serverDate(), lastUsedAt: db.serverDate() } })
  return { success: true, parentSessionToken: sessionToken, parentInvite: record.parentInvite, expiresAt: new Date(Date.now() + REFEREE_H5_SESSION_TTL_MS) }
}

async function authenticateParentH5Session(event) {
  const token = String(event.parentSessionToken || '').trim()
  const expectedInvite = String(event.parentInvite || '').trim()
  if (!token) return { success: false, error: '家长服务会话已失效，请重新打开邀请', code: 'PARENT_AUTH_REQUIRED' }
  try {
    const db = cloud.database(), result = await db.collection('parent_h5_sessions').where({ tokenHash: hashSessionToken(token), active: true }).limit(2).get(), rows = result.data || []
    const session = rows[0]
    if (rows.length !== 1 || !session || dateValue(session.expiresAt) <= Date.now()) return { success: false, error: '家长服务会话已失效，请重新打开邀请', code: 'PARENT_AUTH_REQUIRED' }
    if (expectedInvite && String(session.parentInvite || '') !== expectedInvite) return { success: false, error: '当前家长会话与此邀请不匹配，请重新打开邀请', code: 'PARENT_INVITE_MISMATCH' }
    await db.collection('parent_h5_sessions').doc(session._id).update({ data: { lastUsedAt: db.serverDate() } })
    return { success: true, session }
  } catch (error) {
    console.warn('[webApi] parent session lookup failed:', error.message || error)
    return { success: false, error: '家长服务会话已失效，请重新打开邀请', code: 'PARENT_AUTH_REQUIRED' }
  }
}

async function loadParentProfileDraft(event) {
  const authenticated = await authenticateParentH5Session(event)
  if (!authenticated.success) return authenticated
  const preview = await previewParentProfileInvite({ parentInvite: authenticated.session.parentInvite })
  if (!preview.success) return preview
  const db = cloud.database(), rows = (await db.collection('parent_profile_drafts').where({ parentInvite: authenticated.session.parentInvite }).limit(1).get()).data || []
  return { success: true, data: preview.data, draft: rows[0] || { basicConfirmed: false, guardianAuthorized: false } }
}

async function saveParentBasicProfile(event) {
  const authenticated = await authenticateParentH5Session(event)
  if (!authenticated.success) return authenticated
  const preview = await previewParentProfileInvite({ parentInvite: authenticated.session.parentInvite })
  if (!preview.success) return preview
  const name = String(event.name || '').trim(), birthDate = String(event.birthDate || '').trim(), guardianAuthorized = Boolean(event.guardianAuthorized)
  const requestedRelation = String(event.guardianRelation || '').trim().toLowerCase()
  const guardianRelation = ['father', 'mother', 'other'].includes(requestedRelation) ? requestedRelation : 'other'
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !guardianAuthorized) return { success: false, error: '请确认孩子姓名、出生年月并完成监护人授权' }
  const needsReview = name !== String(preview.data.playerName || '') || birthDate !== String(preview.data.birthDate || '')
  const db = cloud.database(), oldRows = (await db.collection('parent_profile_drafts').where({ parentInvite: authenticated.session.parentInvite }).limit(1).get()).data || []
  const data = { parentInvite: authenticated.session.parentInvite, basicConfirmed: !needsReview, guardianAuthorized: true, guardianRelation, requestedName: name, requestedBirthDate: birthDate, needsManualReview: needsReview, serviceAccountOpenId: authenticated.session.serviceAccountOpenId, updateTime: db.serverDate() }
  if (oldRows[0]) await db.collection('parent_profile_drafts').doc(oldRows[0]._id).update({ data })
  else await db.collection('parent_profile_drafts').add({ data: Object.assign({}, data, { createTime: db.serverDate() }) })
  const requirements = preview.data.requirements || {}
  const nextStep = needsReview ? 'manual-review' : (requirements.realName ? 'real-name' : (requirements.portrait ? 'portrait' : 'submit'))
  return { success: true, nextStep, needsManualReview: needsReview, requirements }
}

async function uploadParentIdentityDocument(event) {
  const authenticated = await authenticateParentH5Session(event)
  if (!authenticated.success) return authenticated
  const preview = await previewParentProfileInvite({ parentInvite: authenticated.session.parentInvite })
  if (!preview.success) return preview
  if (!preview.data.requirements.realName) return { success: false, error: '本次邀请未开启实名认证要求', code: 'PARENT_IDENTITY_NOT_REQUIRED' }
  const side = String(event.side || '').toLowerCase()
  if (side !== 'front') return { success: false, error: '当前实名流程只需上传身份证人像面', code: 'PARENT_IDENTITY_FRONT_ONLY' }
  const db = cloud.database(), verificationRows = (await db.collection('parent_identity_verifications').where({ parentInvite: authenticated.session.parentInvite }).limit(1).get()).data || [], currentVerification = verificationRows[0]
  if (currentVerification && String(currentVerification.status || '') === 'pending_review') return { success: false, error: '实名材料正在审核，请先刷新审核结果', code: 'PARENT_IDENTITY_UNDER_REVIEW' }
  if (currentVerification && String(currentVerification.status || '') === 'approved') return { success: false, error: '实名认证已通过，无需重复上传', code: 'PARENT_IDENTITY_ALREADY_APPROVED' }
  const drafts = (await db.collection('parent_profile_drafts').where({ parentInvite: authenticated.session.parentInvite, basicConfirmed: true, guardianAuthorized: true }).limit(1).get()).data || []
  if (!drafts[0]) return { success: false, error: '请先完成基础资料确认', code: 'PARENT_BASIC_REQUIRED' }
  const base64Data = String(event.base64Data || '')
  if (base64Data.length > 4.2 * 1024 * 1024) return { success: false, error: '材料必须小于 3MB' }
  const matched = base64Data.match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/)
  if (!matched) return { success: false, error: '仅支持 JPG 或 PNG 身份材料' }
  const buffer = Buffer.from(matched[2], 'base64')
  if (!buffer.length || buffer.length > 3 * 1024 * 1024) return { success: false, error: '材料必须小于 3MB' }
  const digest = crypto.createHash('sha256').update(buffer).digest('hex')
  const cloudPath = 'restricted/parent-identity/' + crypto.createHash('sha256').update(authenticated.session.parentInvite).digest('hex').slice(0, 20) + '/' + side + '-' + Date.now() + '.' + (matched[1] === 'jpeg' ? 'jpg' : 'png')
  const uploaded = await cloud.uploadFile({ cloudPath, fileContent: buffer })
  const existing = (await db.collection('parent_identity_documents').where({ parentInvite: authenticated.session.parentInvite, side, status: 'uploaded' }).limit(20).get()).data || []
  await Promise.all(existing.map(item => db.collection('parent_identity_documents').doc(item._id).update({ data: { status: 'replaced', replacedAt: db.serverDate() } })))
  await db.collection('parent_identity_documents').add({ data: { parentInvite: authenticated.session.parentInvite, side, fileId: uploaded.fileID, sha256: digest, size: buffer.length, mimeType: 'image/' + matched[1], status: 'uploaded', serviceAccountOpenId: authenticated.session.serviceAccountOpenId, createTime: db.serverDate(), updateTime: db.serverDate() } })
  return { success: true, side, status: 'uploaded' }
}

async function submitParentIdentityVerification(event) {
  const authenticated = await authenticateParentH5Session(event)
  if (!authenticated.success) return authenticated
  const preview = await previewParentProfileInvite({ parentInvite: authenticated.session.parentInvite })
  if (!preview.success) return preview
  if (!preview.data.requirements.realName) return { success: false, error: '本次邀请未开启实名认证要求', code: 'PARENT_IDENTITY_NOT_REQUIRED' }
  const db = cloud.database(), currentRows = (await db.collection('parent_identity_verifications').where({ parentInvite: authenticated.session.parentInvite }).limit(1).get()).data || [], currentVerification = currentRows[0]
  if (currentVerification && String(currentVerification.status || '') === 'approved') return { success: false, error: '实名认证已通过，无需重复提交', code: 'PARENT_IDENTITY_ALREADY_APPROVED' }
  if (currentVerification && String(currentVerification.status || '') === 'pending_review') return { success: true, status: 'pending_review', duplicate: true }
  const drafts = (await db.collection('parent_profile_drafts').where({ parentInvite: authenticated.session.parentInvite, basicConfirmed: true, guardianAuthorized: true }).limit(1).get()).data || []
  if (!drafts[0]) return { success: false, error: '请先完成基础资料确认', code: 'PARENT_BASIC_REQUIRED' }
  const docs = (await db.collection('parent_identity_documents').where({ parentInvite: authenticated.session.parentInvite, status: 'uploaded' }).limit(10).get()).data || []
  const frontDocument = docs.find(item => item.side === 'front')
  if (!frontDocument) return { success: false, error: '请先上传身份证人像面' }
  if (currentVerification && String(currentVerification.status || '') === 'rejected' && Array.isArray(currentVerification.documentIds)) {
    const previousDocumentIds = currentVerification.documentIds.map(item => String(item))
    if (previousDocumentIds.indexOf(String(frontDocument._id)) >= 0) {
      return { success: false, error: '审核退回后请先重新上传身份证人像面，再提交核验', code: 'PARENT_IDENTITY_REUPLOAD_REQUIRED' }
    }
  }
  const records = (await db.collection('parent_identity_verifications').where({ parentInvite: authenticated.session.parentInvite }).limit(1).get()).data || []
  const data = {
    parentInvite: authenticated.session.parentInvite,
    documentIds: [frontDocument._id],
    requiredSides: ['front'],
    status: 'pending_review',
    reason: '',
    rejectReason: '',
    reviewedAt: null,
    approvedAt: null,
    rejectedAt: null,
    identityNumberMasked: '',
    verifiedBirthDate: '',
    gender: '',
    qualificationStatusText: '',
    submittedAt: db.serverDate(),
    serviceAccountOpenId: authenticated.session.serviceAccountOpenId,
    updateTime: db.serverDate()
  }
  if (records[0]) await db.collection('parent_identity_verifications').doc(records[0]._id).update({ data })
  else await db.collection('parent_identity_verifications').add({ data: Object.assign({}, data, { createTime: db.serverDate() }) })
  return { success: true, status: 'pending_review' }
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
    birthDate: String(preview.data.birthDate || '')
  }
  if (!preview.data.requirements.realName) return { success: true, data: Object.assign({}, publicPlayer, { requirements: preview.data.requirements, status: 'not_required', statusText: '本次邀请未开启实名认证', reason: '' }) }
  if (!record) return { success: true, data: Object.assign({}, publicPlayer, { requirements: preview.data.requirements, status: 'not_started', statusText: '尚未提交实名核验', reason: '' }) }
  const status = String(record.status || 'pending_review')
  const text = status === 'approved' ? '实名认证已通过' : (status === 'rejected' ? '实名认证需要补充材料' : '实名认证审核中')
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

async function requestParentIdentityCorrection(event) {
  const authenticated = await authenticateParentH5Session(event)
  if (!authenticated.success) return authenticated
  const preview = await previewParentProfileInvite({ parentInvite: authenticated.session.parentInvite })
  if (!preview.success) return preview
  if (!preview.data.requirements.realName) return { success: false, error: '本次邀请未开启实名认证要求', code: 'PARENT_IDENTITY_NOT_REQUIRED' }
  const db = cloud.database()
  const verifications = (await db.collection('parent_identity_verifications').where({ parentInvite: authenticated.session.parentInvite, status: 'approved' }).limit(1).get()).data || []
  if (!verifications[0]) return { success: false, error: '仅已通过的实名信息可以申请更正', code: 'PARENT_IDENTITY_NOT_APPROVED' }
  const existing = (await db.collection('parent_identity_correction_requests').where({ parentInvite: authenticated.session.parentInvite, status: 'open' }).limit(1).get()).data || []
  if (existing[0]) return { success: true, requestId: String(existing[0]._id), status: 'open', duplicate: true }
  const reason = String(event.reason || '家长反馈实名信息有误').trim().slice(0, 300)
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
  if (needsIdentity && !checks[0]) return { success: false, error: '实名认证通过后才能上传标准形象照', code: 'PARENT_IDENTITY_REQUIRED' }
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
  if (needsIdentity && !identityChecks[0]) return { success: false, error: '实名认证状态已变化，请重新核验后再确认形象照', code: 'PARENT_IDENTITY_REQUIRED' }
  const result = await db.collection('parent_portraits').doc(portraitId).get(), portrait = Array.isArray(result.data) ? result.data[0] : result.data
  if (!portrait || String(portrait.parentInvite || '') !== String(authenticated.session.parentInvite || '') || String(portrait.status || '') !== 'ready_for_confirmation') return { success: false, error: '当前人像版本不可确认' }
  if (needsIdentity && String(portrait.identityVerificationId || '') && String(portrait.identityVerificationId) !== String(identityChecks[0]._id)) return { success: false, error: '形象照与当前实名版本不匹配，请重新生成' }
  const prefix = 'restricted/parent-portraits/' + crypto.createHash('sha256').update(authenticated.session.parentInvite).digest('hex').slice(0, 20)
  const avatarUpload = await cloud.uploadFile({ cloudPath: prefix + '/avatar-' + Date.now() + '.png', fileContent: avatarBuffer })
  const avatarCrop = normalizeParentPortraitCrop(event.crop)
  const existing = (await db.collection('parent_portraits').where({ parentInvite: authenticated.session.parentInvite, status: 'confirmed' }).limit(20).get()).data || []
  await Promise.all(existing.map(item => db.collection('parent_portraits').doc(item._id).update({ data: { status: 'superseded', supersededAt: db.serverDate(), updateTime: db.serverDate() } })))
  await db.collection('parent_portraits').doc(portraitId).update({ data: { status: 'confirmed', processingStatus: 'confirmed', avatarFileId: avatarUpload.fileID, avatarCrop, avatarProcessingStatus: 'confirmed', confirmedAt: db.serverDate(), updateTime: db.serverDate() } })
  return { success: true, portraitId, version: Number(portrait.version || 0), status: 'confirmed' }
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
  const drafts = (await db.collection('parent_profile_drafts').where({ parentInvite: authenticated.session.parentInvite, basicConfirmed: true, guardianAuthorized: true }).limit(1).get()).data || []
  const verifications = requirements.realName ? (await db.collection('parent_identity_verifications').where({ parentInvite: authenticated.session.parentInvite, status: 'approved' }).limit(1).get()).data || [] : []
  const portraits = requirements.portrait ? (await db.collection('parent_portraits').where({ parentInvite: authenticated.session.parentInvite, status: 'confirmed' }).limit(1).get()).data || [] : []
  if (!drafts[0] || (requirements.realName && !verifications[0]) || (requirements.portrait && !portraits[0])) return { success: false, error: '请先完成本次邀请已开启的资料要求' }
  const submissionRows = (await db.collection('parent_profile_submissions').where({ parentInvite: authenticated.session.parentInvite }).limit(1).get()).data || []
  const previous = submissionRows[0] || {}
  const data = { parentInvite: authenticated.session.parentInvite, playerId: String(invite.playerId), teamId: String(invite.teamId), portraitId: portraits[0] ? String(portraits[0]._id) : String(previous.portraitId || ''), avatarFileId: portraits[0] ? String(portraits[0].avatarFileId || '') : String(previous.avatarFileId || ''), verificationId: verifications[0] ? String(verifications[0]._id) : String(previous.verificationId || ''), requirementsSnapshot: requirements, serviceAccountOpenId: authenticated.session.serviceAccountOpenId, status: 'submitted', updateTime: db.serverDate() }
  if (submissionRows[0]) await db.collection('parent_profile_submissions').doc(submissionRows[0]._id).update({ data })
  else await db.collection('parent_profile_submissions').add({ data: Object.assign({}, data, { createTime: db.serverDate() }) })
  await db.collection('players').doc(invite.playerId).update({ data: { needsParentCompletion: false, profileStatus: 'complete', parentProfileCompletedAt: db.serverDate(), parentProfileSubmissionStatus: 'submitted', updateTime: db.serverDate() } })
  return {
    success: true,
    status: 'submitted',
    submissionStatus: 'submitted',
    playerId: String(invite.playerId),
    playerName: preview.data.playerName,
    teamName: preview.data.teamName,
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
  const userResult = await db.collection('users').doc(session.userId).get()
  const rawUser = Array.isArray(userResult.data) ? userResult.data[0] : userResult.data
  if (!rawUser) return { success: false, error: '登录账号不存在，请重新登录', code: 'AUTH_REQUIRED' }
  const user = await ensureUserOrgId(db, rawUser)
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
  addOrganizationCandidate(candidates, user.orgId, user)
  addOrganizationCandidate(candidates, user.organizationId, user)
  addOrganizationCandidate(candidates, user.organization_id, user)

  const identityValues = normalizedUserIdentityValues(user)
  const membershipConditions = []
  identityValues.forEach(value => {
    membershipConditions.push({ userId: value }, { memberUserId: value }, { openId: value }, { wechatOpenId: value })
  })
  const memberships = membershipConditions.length
    ? await safeOrganizationRows(db, 'organization_memberships', _.or(membershipConditions), 100)
    : []
  memberships.forEach(item => {
    const status = String(item.status || 'active').toLowerCase()
    if (['disabled', 'removed', 'rejected', 'inactive'].includes(status)) return
    addOrganizationCandidate(candidates, item.orgId || item.organizationId || item.organization_id, user)
  })

  const ownerConditions = []
  identityValues.forEach(value => {
    ownerConditions.push(
      { creatorId: value }, { organizerId: value }, { ownerId: value },
      { userId: value }, { createdBy: value }, { creator: value }
    )
  })
  const [teams, tournaments] = ownerConditions.length
    ? await Promise.all([
        safeOrganizationRows(db, 'teams', _.or(ownerConditions), 100),
        safeOrganizationRows(db, 'tournaments', _.or(ownerConditions), 100)
      ])
    : [[], []]
  teams.concat(tournaments).forEach(item => {
    addOrganizationCandidate(candidates, item.orgId || item.organizationId || item.organization_id, user)
  })

  const candidateIds = Array.from(candidates)
  if (!candidateIds.length) {
    return { orgId: '', organizationIds: [], organizationConflict: false }
  }
  const organizations = await safeOrganizationRows(db, 'organizations', { _id: _.in(candidateIds) }, 100)
  const validIds = Array.from(new Set(
    organizations.map(item => String(item && item._id || '')).filter(Boolean)
  ))
  return {
    orgId: validIds.length === 1 ? validIds[0] : '',
    organizationIds: validIds,
    organizationConflict: validIds.length > 1
  }
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
  const next = { ...(data || {}) }
  next.orgId = scope.orgId
  next.creatorId = scope.user._id
  if (collection === 'tournaments') next.organizerId = scope.user._id
  if (collection === 'teams') next.ownerId = scope.user._id
  if (collection === 'player_library') next.owner = scope.user._id
  if (collection === 'coach_library') next.creator = scope.user._id
  if (collection === 'divisions') {
    const mode = normalizeDivisionMode(next)
    next.mode = mode
    next.isProfessional = mode === 'professional'
    // 专业版是否已开通只能由服务端支付/权益流程写入，不能由浏览器提交。
    delete next.professionalEntitlementStatus
    delete next.entitlementStatus
    delete next.professionalEntitlement
    delete next.professionalEntitlementExpiresAt
    delete next.entitlementExpiresAt
    next.professionalEntitlementStatus = mode === 'professional' ? 'pending' : 'not_required'
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

function normalizeDivisionMode(record) {
  const source = record || {}
  const raw = String(source.mode || source.plan || '').toLowerCase()
  if (raw === 'professional' || raw === 'pro' || source.isProfessional === true) return 'professional'
  return 'simple'
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
    'knockoutTieBreak', 'birthDateCutoff', 'rosterLimit', 'minimumRoster',
    'identityVerificationRequired', 'eligibilityReviewRequired', 'portraitRequired',
    'registrationDeadline', 'lockRosterAfterDeadline', 'periodMode', 'matchMinutes',
    'breakMinutes', 'playersOnField', 'substitutionMode', 'substitutionLimit',
    'disciplineEnabled', 'yellowCardSuspension', 'redCardSuspension', 'secondYellowRed',
    'knockoutYellowReset', 'winPoints', 'drawPoints', 'lossPoints', 'rankingRule',
    'awayGoalsEnabled', 'liveRankingEnabled', 'manualRankingReview', 'advancementRule',
    'sameGroupAvoidance'
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
    'confirmedAt', 'professionalEntitlementStatus', 'entitlementStatus',
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
  next.ruleStatus = 'draft'
  next.ruleProgress = Math.max(0, Math.min(Number(next.ruleProgress) || 0, 99))
  return next
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
    'professionalEntitlementStatus', 'entitlementStatus', 'professionalEntitlement',
    'professionalEntitlementExpiresAt', 'entitlementExpiresAt'
  ].forEach(field => { delete snapshot[field] })
  const mode = normalizeDivisionMode(snapshot)
  snapshot.mode = mode
  snapshot.isProfessional = mode === 'professional'
  return snapshot
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
  if (!snapshot.formatType || expectedTeams < 2 || groupCount < 1 || teamsPerGroup < 2 ||
      matchMinutes < 10 || playersOnField < 1) {
    return { success: false, error: '竞赛规则尚未填写完整，请完成赛制、球队数量和比赛执行设置', code: 'DIVISION_RULES_INCOMPLETE' }
  }

  const mode = normalizeDivisionMode(snapshot)
  if (mode === 'professional' && !divisionEntitlementIsActive(before)) {
    return {
      success: false,
      error: '专业版尚未开通，完成专业版权益后才能定版',
      code: 'DIVISION_ENTITLEMENT_REQUIRED'
    }
  }

  const now = new Date()
  const version = `V${now.toISOString().slice(0, 10)}`
  const updateData = {
    ...snapshot,
    rulesLocked: true,
    ruleFinalized: true,
    ruleStatus: 'finalized',
    ruleProgress: 100,
    rulesVersion: version,
    rulesSnapshot: snapshot,
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
  if (!alreadyProfessional && !divisionEntitlementIsActive(before)) {
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
        ? { ...item, mode: 'professional', isProfessional: true, professionalUpgradedAt: divisionUpdate.professionalUpgradedAt }
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
    message: alreadyProfessional ? '该组别已是专业模式，正式名单待办已保持同步' : '已在原竞赛组别上开通专业版，现有球队已进入正式名单待办'
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
  if (mode === 'professional' && !divisionEntitlementIsActive(division)) {
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
    const teamResult = await db.collection('teams').doc(teamId).get()
    const team = Array.isArray(teamResult.data) ? teamResult.data[0] : teamResult.data
    if (!team || !organizerRecordAllowed('teams', team, scope)) return { success: false, error: '无权删除其他机构的球队' }
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
    if (authenticated && !assistanceGrantId && ORGANIZER_REQUIRED_RELAY_FUNCTIONS.has(functionName)) {
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
      data: trustedParams
    })
    console.log('[webApi] 云函数调用成功:', functionName, 'result:', result.result ? '有返回' : '无返回')
    const relayResult = result.result || { success: false, error: '云函数无返回结果' }
    if (functionName === 'updateMatch' && relayResult.__notificationRelay && relayResult.__notificationRelay.phone) {
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
        console.warn('[webApi] referee assignment notification relay failed:', error.message)
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
    if (organizerScope.organizationConflict) {
      return { success: false, error: '当前账号关联多个机构，请先完成机构核验', code: 'ORG_CONFLICT' }
    }
    if (!organizerScope.orgId && ['add', 'update', 'delete', 'confirmDivisionRules', 'upgradeDivisionToProfessional', 'confirmCompetitionPlan'].includes(operation)) {
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
        if (!await competitionPlanMutationAllowed(db, collection, nextData)) {
          return { success: false, error: '竞赛方案已经锁定，不能继续改动已确认赛程', code: 'COMPETITION_PLAN_LOCKED' }
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
        }
        if (!await competitionPlanMutationAllowed(db, collection, { ...(before || {}), ...(nextUpdateData || {}) })) {
          return { success: false, error: '竞赛方案已经锁定，不能直接修改已确认赛程', code: 'COMPETITION_PLAN_LOCKED' }
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
        let before = null
        if (COMPETITION_PLAN_MUTABLE_COLLECTIONS.has(collection) || organizerScope) {
          const beforeResult = await db.collection(collection).doc(id).get()
          before = Array.isArray(beforeResult.data) ? beforeResult.data[0] : beforeResult.data
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
  const scope = await buildOrganizerScope(db, authenticated.user)
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

// PC 名单异常看板。这里刻意不复用通用 dbQuery：返回集严格限定为当前主办方的
// 当前赛事参赛关系、名单快照以及这些快照/球队对应的球员资料，不能借看板读取球队长期私有库。
async function handleRosterExceptionBoard(event) {
  const authenticated = await authenticateWebSession(event)
  if (!authenticated.success) return authenticated
  const db = cloud.database()
  const scope = await buildOrganizerScope(db, authenticated.user)
  const tournamentId = String(event.tournamentId || '')
  const action = String(event.rosterAction || 'list')
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

  if (action === 'listRoster') {
    const teamId = String(event.teamId || '')
    if (!teamId || !relationByTeamId.has(teamId)) return { success: false, error: '球队不属于当前赛事参赛关系' }
    const selectedDivisionId = String(event.divisionId || '')
    const teamRelations = relationsByTeamId.get(teamId) || []
    const relation = selectedDivisionId
      ? teamRelations.find(function (item) { return String(item.divisionId || item.division || 'default') === selectedDivisionId })
      : (new Set(teamRelations.map(function (item) { return String(item.divisionId || item.division || 'default') })).size > 1 ? null : teamRelations[0])
    if (!relation) return { success: false, error: selectedDivisionId ? '球队不属于当前竞赛组别' : '该球队参加了多个竞赛组别，请先选择当前组别', code: selectedDivisionId ? 'DIVISION_NOT_FOUND' : 'DIVISION_REQUIRED' }
    const [teamResult, playerResult, snapshotResult] = await Promise.all([
      db.collection('teams').doc(teamId).get(),
      db.collection('players').where({ teamId }).limit(500).get(),
      db.collection('roster_snapshots').where({ tournamentId, teamId }).limit(50).get()
    ])
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
    const rows = (playerResult.data || []).filter(function (item) { return !latest || selectedIds.has(String(item._id)) }).map(function (item) {
      const profileState = analyzeRosterPlayer(item, requirements)
      const profileStatus = profileState.status
      const identityRaw = String(item.identityStatus || item.verifyStatus || item.realNameStatus || '').toLowerCase()
      const identityStatus = requirements.identityVerificationRequired ? (['verified', 'approved', 'complete'].indexOf(identityRaw) >= 0 ? 'verified' : 'not_verified') : 'not_required'
      return {
        id: String(item._id), name: String(item.name || '未命名球员'), photoUrl: String(item.photoUrl || item.photo || ''), jerseyNumber: String(item.jerseyNumber || ''), position: String(item.position || ''),
        birthDate: String(item.birthDate || item.birthday || ''), guardianName: String(item.guardianName || item.contactName || ''), guardianPhone: maskServicePhone(item.guardianPhone || item.contactPhone || ''),
        profileStatus, identityStatus, rosterStatus: String(latest && latest.status || 'not_submitted'), rosterVersion: Number(latest && latest.version || 0),
        needsPortrait: requirements.portraitRequired, needsIdentity: profileState.needsIdentity, needsParentCompletion: profileState.needsParent, canRequestCorrection: Boolean(latest && ['submitted', 'approved', 'locked'].indexOf(String(latest.status || '')) >= 0), snapshotId: String(latest && latest._id || '')
      }
    })
    return { success: true, tournament: { id: tournamentId, name: String(tournament.name || tournament.tournamentName || '赛事'), registrationDeadline: tournament.registrationDeadline || tournament.signupDeadline || null, rosterLocked: Boolean(latest && ['approved', 'locked'].indexOf(String(latest.status || '')) >= 0) }, relation: { teamId, teamName: String(team.name || team.teamName || relation.teamName || '未命名球队'), teamLogo: String(team.logo || team.logoUrl || ''), divisionId: rosterConfig.divisionId, divisionName: rosterConfig.divisionName }, requirements, snapshot: latest ? { id: String(latest._id), status: String(latest.status || 'draft'), version: Number(latest.version || 1), returnReason: String(latest.returnReason || '') } : null, rows }
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
  const [teamResult, playerResult, snapshotResult] = await Promise.all([
    teamIds.length ? db.collection('teams').where({ _id: db.command.in(teamIds) }).limit(1000).get() : Promise.resolve({ data: [] }),
    teamIds.length ? db.collection('players').limit(1000).get() : Promise.resolve({ data: [] }),
    db.collection('roster_snapshots').where({ tournamentId }).limit(1000).get()
  ])
  const teamMap = new Map((teamResult.data || []).map(function (item) { return [String(item._id), item] }))
  const playersById = new Map((playerResult.data || []).filter(function (item) { return selectedTeamIds.has(String(item.teamId || '')) }).map(function (item) { return [String(item._id), item] }))
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
        profileStatus, statusText: profileStatus === 'exception' ? '资料异常' : (profileState.needsIdentity ? '待实名核验' : (profileState.needsPortrait ? '待形象照' : (profileState.needsParent ? '待家长补充' : '待完善基础资料'))),
        missingItems: [!player.name ? '姓名' : '', !profileState.hasBirth ? '出生日期' : '', profileState.needsIdentity ? '实名认证' : '', profileState.needsPortrait ? '标准形象照' : '', profileState.needsParent ? '家长资料' : ''].filter(Boolean),
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

  const candidates = [
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
  const params = parseHttpRequestParams(event)

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
      case 'serviceRefereeOAuthUrl':
        result = await createRefereeOAuthUrl(); break
      case 'serviceRefereeOAuth':
        result = await handleRefereeOAuth(params); break
      case 'serviceRefereeWorkflow':
        result = await handleRefereeWorkflow(params); break
      case 'previewParentProfileInvite':
        result = await previewParentProfileInvite(params); break
      case 'parentProfileOAuthUrl':
        result = await createParentProfileOAuthUrl(params); break
      case 'parentProfileOAuth':
        result = await handleParentProfileOAuth(params); break
      case 'checkParentProfileSession':
        result = await authenticateParentH5Session(params); break
      case 'getParentProfileDraft':
        result = await loadParentProfileDraft(params); break
      case 'saveParentBasicProfile':
        result = await saveParentBasicProfile(params); break
      case 'uploadParentIdentityDocument':
        result = await uploadParentIdentityDocument(params); break
      case 'submitParentIdentityVerification':
        result = await submitParentIdentityVerification(params); break
      case 'getParentIdentityVerification':
        result = await getParentIdentityVerification(params); break
      case 'requestParentIdentityCorrection':
        result = await requestParentIdentityCorrection(params); break
      case 'uploadAndProcessParentPortrait':
        result = await uploadAndProcessParentPortrait(params); break
      case 'confirmParentPortrait':
        result = await confirmParentPortrait(params); break
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
