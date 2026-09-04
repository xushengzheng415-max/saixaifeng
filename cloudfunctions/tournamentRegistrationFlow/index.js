'use strict'

const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const SPORT = 'football'
const REGISTER_PAGE = 'pages/tournament/signup/signup'
const FLOW_COLLECTIONS = ['tournament_invites', 'team_invitations', 'tournament_tasks', 'service_follow_gates', 'service_account_bindings', 'notification_outbox', 'registration_audit_logs', 'messages']
let collectionsReady = false
let serviceAccessTokenCache = null
let miniAccessTokenCache = null

function text(value) { return String(value == null ? '' : value).trim() }
function randomKey(bytes) { return crypto.randomBytes(bytes).toString('base64url') }
function miniReviewTemplateId() { return text(process.env.SXF_FOOTBALL_MINI_TEMPLATE_TOURNAMENT_REVIEW || 'CxBgS7fgjeNoKTSwl0q0o_lErclh_ffpIj2IeL6mpRw') }
function serviceReviewTemplateId() { return text(process.env.SXF_FOOTBALL_SERVICE_TEMPLATE_REGISTRATION_REVIEW || 'oyXRAzKHZE3Rsex7SVtl2zR-cMNznM_P3azxG8olz1g') }
function serviceRegistrationSuccessTemplateId() { return text(process.env.SXF_FOOTBALL_SERVICE_TEMPLATE_REGISTRATION_SUCCESS || 'aX_3wN6SbFR0s3giwyoK5P6eBbl9lwx2rqU_jCld-Uk') }
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

async function getDocument(collection, id) {
  const result = await db.collection(collection).doc(id).get()
  return Array.isArray(result.data) ? result.data[0] : result.data
}

async function webActor(event) {
  const userId = text(event.__actorUserId)
  const orgId = text(event.__actorOrgId)
  if (!userId || !orgId) return null
  const user = await getDocument('users', userId)
  if (!user || text(user.orgId || user.organizationId) !== orgId) return null
  return { userId, orgId, user }
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
  const [tournament, division] = await Promise.all([getDocument('tournaments', tournamentId), getDocument('divisions', divisionId)])
  if (!tournament || recordOrgId(tournament) !== actor.orgId) return { success:false, code:'TOURNAMENT_SCOPE_DENIED', message:'赛事不存在或无权添加球队' }
  if (!division || text(division.tournamentId) !== tournamentId) return { success:false, code:'DIVISION_REQUIRED', message:'竞赛组别不存在或不属于当前赛事' }
  const teamResult = await db.collection('teams').where({ _id:_.in(teamIds), orgId:actor.orgId, synthetic:true }).limit(50).get()
  const teams = teamResult.data || []
  if (teams.length !== teamIds.length) return { success:false, code:'SYNTHETIC_TEAM_SCOPE_DENIED', message:'所选球队包含不存在、非虚拟或其他机构球队' }
  const ageGroup = text(division.ageGroup).toUpperCase()
  if (teams.some(team => text(team.ageGroup).toUpperCase() !== ageGroup)) return { success:false, code:'AGE_GROUP_MISMATCH', message:'虚拟球队年龄组与当前竞赛组别不一致' }
  const existing = (await db.collection('tournament_teams').where({ tournamentId, divisionId }).limit(100).get()).data || []
  const existingIds = new Set(existing.filter(item => !['cancelled','withdrawn'].includes(text(item.status).toLowerCase())).map(item => text(item.teamId)))
  const additions = teams.filter(team => !existingIds.has(text(team._id)))
  const requiredTeams = Number(division.expectedTeams || division.requiredTeams || division.maxTeams || 0)
  if (requiredTeams > 0 && existingIds.size + additions.length > requiredTeams) return { success:false, code:'DIVISION_CAPACITY_EXCEEDED', message:`当前组别目标${requiredTeams}支球队，所选数量超过剩余名额` }
  for (const team of additions) {
    await db.collection('tournament_teams').add({ data:{ tournamentId, divisionId, divisionName:text(division.name), teamId:team._id, teamName:text(team.name || team.teamName), orgId:actor.orgId, teamOrgId:actor.orgId, creatorId:actor.userId, status:'pending', claimStatus:'claimed', participationStatus:'pending_review', source:'synthetic_pool', joinSource:'synthetic_pool', rosterStatus:'draft', rosterPlayerCount:Number(team.playerCount || 15), synthetic:true, syntheticDatasetId:text(team.syntheticDatasetId), createTime:db.serverDate(), updateTime:db.serverDate() } })
  }
  await addAudit('synthetic_teams_added', { tournamentId, divisionId, actorUserId:actor.userId, actorOrgId:actor.orgId, detail:{ requested:teamIds.length, added:additions.length } })
  return { success:true, message:additions.length ? `已添加${additions.length}支虚拟球队，等待球队审查` : '所选虚拟球队均已在当前组别', data:{ added:additions.length, skipped:teamIds.length - additions.length } }
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
  const activeRows = existing.filter(item => !['cancelled','withdrawn','rejected'].includes(text(item.status).toLowerCase()))
  const activeByTeam = new Map(activeRows.map(item => [text(item.teamId), item]))
  const additions = teams.filter(team => !activeByTeam.has(text(team._id)))
  const capacity = Number(division.expectedTeams || division.requiredTeams || division.maxTeams || 0)
  if (capacity > 0 && activeRows.length + additions.length > capacity) return { success:false, code:'DIVISION_CAPACITY_EXCEEDED', message:`当前组别目标${capacity}支球队，所选数量超过剩余名额` }
  const results = []
  for (const team of teams) {
    const existingRow = activeByTeam.get(text(team._id))
    let relation
    if (existingRow) {
      relation = existingRow
    } else {
      const added = await db.collection('tournament_teams').add({ data:{ tournamentId, divisionId, divisionName:text(division.name), teamId:team._id, teamName:text(team.name || team.teamName), teamLogo:text(team.logo || team.logoUrl), orgId:actor.orgId, teamOrgId:actor.orgId, creatorId:actor.userId, status:'invited', type:'invite', source:'organizer_targeted_invite', joinSource:'invite', claimStatus:'pending_confirmation', contactName:text(team.contactName || team.managerName), contactPhone:text(team.contactPhone || team.managerPhone || team.ownerPhone), inviteTime:db.serverDate(), createTime:db.serverDate(), updateTime:db.serverDate() } })
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

async function getInvitation(event) {
  const invite = await invitationByKey(event.inviteKey)
  if (!invite || invite.status !== 'active') return { success: false, code: 'INVITE_INVALID', message: '报名邀请无效或已重置' }
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

async function createRefereeFollowInvite(event) {
  const actor=await webActor(event)
  if(!actor)return {success:false,code:'AUTH_REQUIRED',message:'登录会话或机构信息已失效，请重新登录'}
  const tournamentId=text(event.tournamentId)
  const tournament=await getDocument('tournaments',tournamentId)
  if(!tournament||recordOrgId(tournament)!==actor.orgId)return {success:false,code:'TOURNAMENT_SCOPE_DENIED',message:'赛事不存在或无权邀请裁判'}
  const targetRefereeId=text(event.targetRefereeId)
  let target=null
  if(targetRefereeId){target=await getDocument('referees',targetRefereeId);if(!target||text(target.tournamentId)!==tournamentId)return {success:false,code:'REFEREE_SCOPE_DENIED',message:'待绑定裁判不属于当前赛事'}}
  const token='ref-'+Date.now()+'-'+randomKey(12)
  const scene='rf_'+randomKey(12)
  const registerUrl='https://www.sxffootball.cn/service-account-h5/?refereeInvite='+encodeURIComponent(token)
  const code=await serviceFollowCode(scene)
  const invitationAdded=await db.collection('referee_invitations').add({data:{tournamentId,orgId:actor.orgId,targetRefereeId,targetRefereeName:text(target&&(target.name||target.realName)),token,status:'active',source:target?'synthetic_profile_claim_follow':'organizer_follow_qr',followRequired:true,followStatus:'waiting',scene,registerUrl,createTime:db.serverDate(),updateTime:db.serverDate()}})
  const gateAdded=await db.collection('service_follow_gates').add({data:{sport:SPORT,tournamentId,purpose:'referee_invite',refereeInviteId:invitationAdded._id,scene,status:'waiting',subscribed:false,registerUrl,followUrl:code.url,qrTicket:code.ticket,qrExpireAt:new Date(Date.now()+code.expireSeconds*1000),createTime:db.serverDate(),updateTime:db.serverDate()}})
  await db.collection('referee_invitations').doc(invitationAdded._id).update({data:{followGateId:gateAdded._id,followQrCodeUrl:code.url,updateTime:db.serverDate()}})
  await addAudit('referee_follow_invite_created',{tournamentId,inviteId:invitationAdded._id,actorUserId:actor.userId,actorOrgId:actor.orgId,detail:{gateId:gateAdded._id,targetRefereeId}})
  return {success:true,message:'裁判关注登记二维码已生成',data:{inviteId:invitationAdded._id,gateId:gateAdded._id,qrCodeUrl:code.url,registerUrl,status:'waiting',followRequired:true,guideSteps:['扫码关注赛小蜂足球助手','在服务号消息中点击裁判登记入口','提交裁判证与头像等待审核']}}
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
    teamCode: templateText(registration.registrationNo || registration.tournamentTeamCode || registration.teamCode || registration.participationCode || '待生成', 32),
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
    return { status:'failed', code:text(error.errCode || error.errCode || error.code || 'MINI_SEND_FAILED'), message:text(error.message || error.errMsg || '小程序订阅消息发送失败') }
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
    const result = await serviceBridgeJson('template/send', { message:{ touser:text(binding.officialOpenId), template_id:templateId, url:'https://www.sxffootball.cn/service-account-h5/', data } })
    return result && result.success ? { status:'delivered', code:'', message:'服务号模板消息已发送' } : { status:'failed', code:'SERVICE_SEND_FAILED', message:'服务号模板消息发送失败' }
  } catch (error) {
    return { status:'failed', code:text(error.code || error.wechatCode || 'SERVICE_SEND_FAILED'), message:text(error.message || '服务号模板消息发送失败') }
  }
}

async function deliverRegistrationNotifications(registration, tournament, decision, reason) {
  const bindingResult = registration.applicantMiniOpenId
    ? await db.collection('service_account_bindings').where({ sport:SPORT, miniOpenId:registration.applicantMiniOpenId, subscribed:true }).limit(2).get()
    : { data:[] }
  const binding = (bindingResult.data || [])[0] || null
  const [mini, service] = await Promise.all([
    sendMiniReviewNotification(registration, tournament, decision, reason),
    sendServiceReviewNotification(registration, tournament, decision, reason, binding)
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
  const deliveries = await deliverRegistrationNotifications(registration, tournament, decision, reason)
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

exports.main = async (event) => {
  try {
    const action = text(event && event.action)
    if (action === 'bridgeConfigurationStatus') return await bridgeConfigurationStatus()
    if (action === 'notificationConfigurationStatus') return notificationConfigurationStatus()
    await ensureCollections()
    if (action === 'setDivisionRegistration') return await setDivisionRegistration(event)
    if (action === 'addSyntheticTeams') return await addSyntheticTeams(event)
    if (action === 'createTargetedTeamInvitations') return await createTargetedTeamInvitations(event)
    if (action === 'generateTeamInviteCode') return await generateTeamInviteCode(event)
    if (action === 'ensureInvite') return await ensureInvite(event)
    if (action === 'createTargetedRegistrationLink') return await createTargetedRegistrationLink(event)
    if (action === 'getInvitation') return await getInvitation(event)
    if (action === 'createFollowGate') return await createFollowGate(event)
    if (action === 'createRefereeFollowInvite') return await createRefereeFollowInvite(event)
    if (action === 'getFollowGateStatus') return await followGateStatus(event)
    if (action === 'generateTeamMemberInviteAssets') return await generateTeamMemberInviteAssets(event)
    if (action === 'generateTeamPlayerInviteAssets') return await generateTeamPlayerInviteAssets(event)
    if (action === 'saveRegistrationDraft') return await saveRegistrationDraft(event)
    if (action === 'completeRegistrationDraft') return await completeRegistrationDraft(event)
    if (action === 'probeServiceAccount') return await probeServiceAccount(event)
    if (action === 'bindServiceAccount') return await bindServiceAccount(event)
    if (action === 'reviewRegistration') return await reviewRegistration(event)
    if (action === 'retryRegistrationNotifications') return await retryRegistrationNotifications(event)
    if (action === 'notificationStatus') return await notificationStatus(event)
    return { success: false, code: 'ACTION_INVALID', message: '不支持的报名联动操作' }
  } catch (error) {
    console.error('[tournamentRegistrationFlow]', text(event && event.action), error.message || error)
    return { success: false, code: error.code || 'REGISTRATION_FLOW_FAILED', message: error.message || '报名联动处理失败' }
  }
}
