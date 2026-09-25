const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
let miniAccessTokenCache = null

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex')
}

function asObject(value) {
  return Array.isArray(value) ? value[0] : value
}

function text(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength || 120)
}

function qrEnvVersion(value) {
  const normalized = text(value, 20).toLowerCase()
  return ['develop', 'trial', 'release'].includes(normalized) ? normalized : 'release'
}

async function wechatJson(url, options) {
  const response = await fetch(url, options)
  const data = await response.json()
  if (!response.ok || data.errcode) {
    const error = new Error(`微信接口返回 ${data.errcode || response.status}：${data.errmsg || '请求失败'}`)
    error.code = `WECHAT_${data.errcode || response.status}`
    throw error
  }
  return data
}

async function miniAccessToken() {
  if (miniAccessTokenCache && miniAccessTokenCache.expiresAt > Date.now() + 120000) return miniAccessTokenCache.value
  const appId = text(process.env.SXF_FOOTBALL_MINIPROGRAM_APPID || 'wx57164cca8676f411')
  const appSecret = text(process.env.SXF_FOOTBALL_MINIPROGRAM_APPSECRET, 256)
  if (!appSecret) throw new Error('足球小程序AppSecret尚未配置，无法生成正式链接')
  const data = await wechatJson(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`)
  miniAccessTokenCache = { value:data.access_token, expiresAt:Date.now() + Math.max(300, Number(data.expires_in || 7200) - 300) * 1000 }
  return data.access_token
}

async function makeMiniProgramUrlLink(inviteId) {
  const accessToken = await miniAccessToken()
  const data = await wechatJson(`https://api.weixin.qq.com/wxa/generate_urllink?access_token=${encodeURIComponent(accessToken)}`, {
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body:JSON.stringify({ path:'pages/team/prebuilt-invite/prebuilt-invite', query:`inviteId=${encodeURIComponent(inviteId)}`, is_expire:false })
  })
  if (!data.url_link) throw new Error('微信未返回可用的小程序URL Link')
  return data.url_link
}

function toTime(value) {
  if (!value) return 0
  if (value instanceof Date) return value.getTime()
  if (value.$date) return new Date(value.$date).getTime()
  if (value._date) return new Date(value._date).getTime()
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

function inviteExpired(value) {
  const time = toTime(value)
  return time > 0 && time <= Date.now()
}

function maskPhone(value) {
  const phone = String(value || '').replace(/\D/g, '')
  if (phone.length < 7) return phone
  return phone.slice(0, 3) + '****' + phone.slice(-4)
}

async function safeGet(collection, query, limit) {
  try {
    const result = await db.collection(collection).where(query || {}).limit(limit || 100).get()
    return result.data || []
  } catch (error) {
    if (/not exist|不存在|collection/i.test(String(error.message || ''))) return []
    throw error
  }
}

function competitionPlanLocked(tournament, divisionId) {
  if (!tournament) return false
  if (tournament.competitionPlanLocked === true || tournament.finalPlanLocked === true ||
    ['locked', 'match_management', 'in_progress', 'completed'].includes(String(tournament.competitionPlanStatus || '').toLowerCase())) return true
  return (Array.isArray(tournament.divisions) ? tournament.divisions : []).some(function(division) {
    const id = String(division && (division.divisionId || division.division || division.divisionKey) || '').trim()
    const requested = String(divisionId || '').trim()
    const matches = requested ? id === requested : true
    return matches && division && (division.competitionPlanLocked === true || division.finalPlanLocked === true ||
      ['locked', 'match_management', 'in_progress', 'completed'].includes(String(division.competitionPlanStatus || '').toLowerCase()))
  })
}

async function currentUser(event) {
  const context = cloud.getWXContext()
  const contextOpenId = String(context.OPENID || '')
  let user = null
  let openId = contextOpenId

  if (!openId && event.__authToken && event.__actorUserId) {
    const sessions = await db.collection('auth_sessions').where({
      tokenHash: hashSessionToken(event.__authToken),
      userId: String(event.__actorUserId),
      active: true,
      expiresAt: _.gt(new Date())
    }).limit(2).get()
    if ((sessions.data || []).length === 1) {
      const result = await db.collection('users').doc(String(event.__actorUserId)).get()
      user = asObject(result.data)
    }
  }

  if (!user && openId) {
    const result = await db.collection('users').where(_.or([
      { openId },
      { wechatOpenId: openId },
      { _openid: openId }
    ])).limit(2).get()
    const users = result.data || []
    if (users.length > 1) throw new Error('当前微信存在重复账号，请联系管理员处理')
    user = users[0] || null
  }

  if (!user) throw new Error('登录状态已失效，请重新登录')
  openId = openId || String(user.openId || user.wechatOpenId || user._openid || '')
  return { user, openId }
}

function userOwnsTournament(tournament, identity, actorOrgId) {
  if (!tournament) return false
  const orgId = String(actorOrgId || identity.user.orgId || '')
  if (tournament.orgId) return Boolean(orgId) && String(tournament.orgId) === orgId
  return [tournament.creatorId, tournament.organizerId, tournament.ownerId, tournament.userId]
    .filter(Boolean)
    .map(String)
    .includes(String(identity.user._id))
}

const TEAM_ACCESS_ROLE_LABELS = {
  team_leader: '领队',
  head_coach: '主教练',
  liaison: '联络员'
}

function normalizeClaimPhone(value) {
  const phone = String(value || '').replace(/\D/g, '')
  return /^1[3-9]\d{9}$/.test(phone) ? phone : ''
}

async function teamAccessContext(event, identity) {
  const tournamentId = text(event.tournamentId, 80)
  const divisionId = text(event.divisionId || 'default', 80)
  const tournamentTeamId = text(event.tournamentTeamId, 80)
  if (!tournamentId || !tournamentTeamId) throw new Error('缺少赛事或参赛球队关系')
  const [tournamentResult, relationResult] = await Promise.all([
    db.collection('tournaments').doc(tournamentId).get(),
    db.collection('tournament_teams').doc(tournamentTeamId).get()
  ])
  const tournament = asObject(tournamentResult.data)
  const relation = asObject(relationResult.data)
  const actorOrgId = text(event.__actorOrgId || identity.user.orgId, 80)
  if (!userOwnsTournament(tournament, identity, actorOrgId)) throw new Error('当前账号无权管理该球队账号')
  if (!relation || String(relation.tournamentId || '') !== tournamentId) throw new Error('参赛球队关系不存在或不属于当前赛事')
  if (relation.divisionId && String(relation.divisionId) !== divisionId) throw new Error('参赛球队不属于当前竞赛组别')
  const teamId = text(relation.teamId, 80)
  if (!teamId) throw new Error('参赛关系缺少球队')
  const team = asObject((await db.collection('teams').doc(teamId).get()).data)
  if (!team) throw new Error('球队不存在')
  const relationOrgId = text(relation.orgId || relation.organizationId, 80)
  const teamOrgId = text(team.orgId || team.organizationId, 80)
  if (actorOrgId && relationOrgId && actorOrgId !== relationOrgId) throw new Error('参赛球队关系不属于当前机构')
  if (actorOrgId && teamOrgId && actorOrgId !== teamOrgId) throw new Error('球队不属于当前机构')
  return { tournamentId, divisionId, tournamentTeamId, tournament, relation, teamId, team, actorOrgId }
}

async function userByPhone(phone) {
  if (!phone) return null
  const result = await db.collection('users').where(_.or([{ phone }, { phoneNumber:phone }])).limit(3).get()
  const users = result.data || []
  if (users.length > 1) throw new Error(`手机号 ${maskPhone(phone)} 对应多个账号，请先处理重复账号`)
  return users[0] || null
}

async function latestTeamAccessInvite(context) {
  const rows = await safeGet('team_invitations', {
    tournamentId:context.tournamentId,
    teamId:context.teamId,
    type:'prebuilt_tournament_team'
  }, 50)
  const scoped = rows.filter(item => !context.actorOrgId || !item.organizerOrgId || String(item.organizerOrgId) === context.actorOrgId)
  scoped.sort((left, right) => toTime(right.updateTime || right.createTime) - toTime(left.updateTime || left.createTime))
  return scoped[0] || null
}

async function listTeamAccess(event, identity) {
  const context = await teamAccessContext(event, identity)
  const invite = await latestTeamAccessInvite(context)
  let personnel = Array.isArray(invite && invite.claimantCandidates) ? invite.claimantCandidates : []
  if (!personnel.length) {
    const fallbackPhone = normalizeClaimPhone(context.team.ownerPhone || context.team.contactPhone || context.team.managerPhone)
    const fallbackName = text(context.team.ownerName || context.team.contactName || context.team.managerName, 40)
    if (fallbackName || fallbackPhone) personnel = [{ role:'team_leader', roleLabel:'领队', name:fallbackName, phone:fallbackPhone, accountType:'owner' }]
  }
  const memberships = await safeGet('team_memberships', { teamId:context.teamId }, 100)
  const pendingInvites = await safeGet('team_invitations', { teamId:context.teamId, type:'team_member', status:'active' }, 100)
  const ownerId = String(context.team.ownerId || context.team.ownerUserId || context.team.claimedByUserId || '')
  const primary = personnel.find(item => item.accountType === 'owner') || personnel[0] || null
  const rows = []
  for (const item of personnel) {
    const role = String(item.role || '')
    if (!TEAM_ACCESS_ROLE_LABELS[role]) continue
    const phone = normalizeClaimPhone(item.phone)
    const user = await userByPhone(phone)
    const membership = user ? memberships.find(row => String(row.userId || row.memberUserId || '') === String(user._id)) : null
    const pending = pendingInvites.find(row => String(row.inviteePhone || '') === phone)
    const isPrimary = Boolean(primary && primary.role === role)
    let status = isPrimary ? '待认领' : '待授权'
    if (user && ownerId && String(user._id) === ownerId) status = '主账号'
    else if (membership && String(membership.status || 'accepted') === 'accepted') status = '已加入'
    else if (pending) status = '待登录'
    rows.push({ role, roleLabel:TEAM_ACCESS_ROLE_LABELS[role], name:text(item.name, 40), phone, accountType:isPrimary ? 'owner' : 'member', status })
  }
  return { success:true, teamId:context.teamId, primaryRole:primary ? String(primary.role || '') : '', personnel:rows }
}

async function saveTeamAccess(event, identity) {
  const context = await teamAccessContext(event, identity)
  const rawPersonnel = Array.isArray(event.personnel) ? event.personnel : []
  const personnel = []
  const seenRoles = new Set()
  for (const raw of rawPersonnel.slice(0, 3)) {
    const role = String(raw && raw.role || '').trim()
    if (!TEAM_ACCESS_ROLE_LABELS[role] || seenRoles.has(role)) continue
    const name = text(raw && raw.name, 40)
    const phone = normalizeClaimPhone(raw && raw.phone)
    if (!name && !phone) continue
    if (!name || !phone) throw new Error(`${TEAM_ACCESS_ROLE_LABELS[role]}姓名和有效手机号均不能为空`)
    seenRoles.add(role)
    personnel.push({ role, roleLabel:TEAM_ACCESS_ROLE_LABELS[role], name, phone })
  }
  if (!personnel.length) throw new Error('请至少设置一名球队管理人员')
  const requestedPrimaryRole = String(event.primaryRole || '').trim()
  const primary = personnel.find(item => item.role === requestedPrimaryRole) || personnel[0]
  const candidates = personnel.map(item => ({ ...item, accountType:item.role === primary.role ? 'owner' : 'member' }))
  const now = db.serverDate()
  let invite = await latestTeamAccessInvite(context)
  if (!invite) {
    const added = await db.collection('team_invitations').add({ data:{
      type:'prebuilt_tournament_team', status:'pending', tournamentId:context.tournamentId, divisionId:context.divisionId,
      teamId:context.teamId, tournamentTeamId:context.tournamentTeamId, organizerOrgId:context.actorOrgId,
      organizerUserId:identity.user._id, organizerName:text(context.tournament.organizerName || context.tournament.organizer, 80),
      divisionName:text(context.relation.divisionName || context.divisionId, 40), inviteExpireAt:inviteExpiry(context.tournament || {}),
      source:'pc_team_access', createTime:now, updateTime:now
    } })
    invite = { _id:added._id }
  }
  await db.collection('team_invitations').doc(String(invite._id)).update({ data:{
    allowedClaimPhones:[primary.phone], claimantCandidates:candidates,
    managerName:primary.name, managerPhone:primary.phone, updateTime:now
  } })

  const memberships = await safeGet('team_memberships', { teamId:context.teamId }, 200)
  const currentOwnerId = String(context.team.ownerId || context.team.ownerUserId || context.team.claimedByUserId || '')
  const resolved = []
  for (const person of candidates) resolved.push({ person, user:await userByPhone(person.phone) })
  const primaryResolved = resolved.find(item => item.person.role === primary.role)
  if (currentOwnerId && primaryResolved && primaryResolved.user && currentOwnerId !== String(primaryResolved.user._id)) {
    await db.collection('teams').doc(context.teamId).update({ data:{
      ownerId:primaryResolved.user._id, ownerUserId:primaryResolved.user._id, claimedByUserId:primaryResolved.user._id,
      ownerPhone:primary.phone, claimStatus:'claimed', updateTime:now
    } })
    for (const membership of memberships) {
      const memberUserId = String(membership.userId || membership.memberUserId || '')
      if (memberUserId === currentOwnerId) {
        await db.collection('team_memberships').doc(String(membership._id)).update({ data:{ role:'member', roles:['member'], permissions:['team.view'], updateTime:now } })
      }
    }
  }
  for (const item of resolved) {
    const person = item.person
    const user = item.user
    const isPrimary = person.role === primary.role
    if (user) {
      const existing = memberships.find(row => String(row.userId || row.memberUserId || '') === String(user._id))
      const memberRole = isPrimary ? 'owner' : (person.role === 'head_coach' ? 'coach' : 'member')
      const permissions = isPrimary ? ['team.view','team.manage'] : ['team.view']
      const data = { teamId:context.teamId, orgId:context.actorOrgId, userId:user._id, role:memberRole, roles:[memberRole], permissions, status:'accepted', phone:person.phone, source:'organizer_team_access', updateTime:now }
      if (existing && existing._id) await db.collection('team_memberships').doc(String(existing._id)).update({ data })
      else await db.collection('team_memberships').add({ data:{ ...data, createTime:now } })
    } else if (!isPrimary) {
      const pending = (await safeGet('team_invitations', { teamId:context.teamId, type:'team_member', inviteePhone:person.phone, status:'active' }, 10))[0]
      const data = { teamId:context.teamId, orgId:context.actorOrgId, type:'team_member', status:'active', usageMode:'single', inviterUserId:identity.user._id, inviteePhone:person.phone, inviteeName:person.name, memberRole:person.role === 'head_coach' ? 'coach' : 'member', permissions:['team.view'], roleText:person.roleLabel, source:'organizer_team_access', updateTime:now }
      if (pending && pending._id) await db.collection('team_invitations').doc(String(pending._id)).update({ data })
      else await db.collection('team_invitations').add({ data:{ ...data, expiresAt:new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), createTime:now } })
    }
  }
  return await listTeamAccess(event, identity)
}

function photoFileId(record) {
  return [record && record.photoFileID, record && record.photoFileId, record && record.photoUrl]
    .map(value => String(value || '').trim())
    .find(value => value.startsWith('cloud://')) || ''
}

function photoMimeType(fileId, buffer) {
  const lower = String(fileId || '').toLowerCase()
  if (lower.includes('.jpg') || lower.includes('.jpeg')) return 'image/jpeg'
  if (lower.includes('.gif')) return 'image/gif'
  if (lower.includes('.webp')) return 'image/webp'
  if (buffer && buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg'
  if (buffer && buffer.length > 3 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'image/gif'
  if (buffer && buffer.length > 11 && buffer.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  return 'image/png'
}

async function getTeamExportPhotos(event, identity) {
  const context = await teamAccessContext(event, identity)
  const requested = Array.from(new Set((Array.isArray(event.fileIds) ? event.fileIds : [])
    .map(value => text(value, 500))
    .filter(value => value.startsWith('cloud://')))).slice(0, 50)
  if (!requested.length) return { success:true, photos:[] }
  const [playersById, playersByCode, staffById, staffByCode, draftsById, draftsBySource] = await Promise.all([
    safeGet('players', { teamId:context.teamId }, 500),
    safeGet('players', { teamCode:context.teamId }, 500),
    safeGet('coaches', { teamId:context.teamId }, 500),
    safeGet('coaches', { teamCode:context.teamId }, 500),
    safeGet('registration_player_drafts', { teamId:context.teamId }, 500),
    safeGet('registration_player_drafts', { sourceTeamId:context.teamId }, 500)
  ])
  const allowed = new Set([...playersById, ...playersByCode, ...staffById, ...staffByCode, ...draftsById, ...draftsBySource].map(photoFileId).filter(Boolean))
  const photos = []
  let totalBytes = 0
  for (const fileId of requested) {
    if (!allowed.has(fileId)) continue
    try {
      const result = await cloud.downloadFile({ fileID:fileId })
      const buffer = result && result.fileContent
      if (!buffer || !buffer.length) continue
      if (buffer.length > 1024 * 1024 || totalBytes + buffer.length > 5 * 1024 * 1024) {
        photos.push({ fileId, status:'too_large' })
        continue
      }
      totalBytes += buffer.length
      photos.push({ fileId, status:'ready', mimeType:photoMimeType(fileId, buffer), base64:buffer.toString('base64') })
    } catch (error) {
      console.warn('[organizerClaimInvite] export photo skipped:', fileId, error.message)
      photos.push({ fileId, status:'unavailable' })
    }
  }
  return { success:true, photos }
}

function inviteExpiry(tournament) {
  const value = tournament.registrationDeadline || tournament.signupDeadline || tournament.endDate
  if (value) return value
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
}

async function makeMiniProgramCode(inviteId, version) {
  const actualVersion = qrEnvVersion(version)
  const result = await cloud.openapi.wxacode.getUnlimited({
    scene: String(inviteId).slice(0, 32),
    page: 'pages/team/prebuilt-invite/prebuilt-invite',
    width: 300,
    envVersion: actualVersion,
    checkPath: actualVersion === 'release'
  })
  const base64 = result.buffer.toString('base64')
  return `data:image/png;base64,${base64}`
}

async function createOrReuseInvite(event, identity) {
  const tournamentId = text(event.tournamentId, 80)
  const divisionId = text(event.divisionId || 'default', 80)
  const tournamentTeamId = text(event.tournamentTeamId, 80)
  if (!tournamentId || !tournamentTeamId) throw new Error('缺少赛事或参赛球队关系')

  const [tournamentResult, relationResult] = await Promise.all([
    db.collection('tournaments').doc(tournamentId).get(),
    db.collection('tournament_teams').doc(tournamentTeamId).get()
  ])
  const tournament = asObject(tournamentResult.data)
  const relation = asObject(relationResult.data)
  const actorOrgId = text(event.__actorOrgId || identity.user.orgId, 80)
  const tournamentInviteExpiry = inviteExpiry(tournament || {})
  if (inviteExpired(tournamentInviteExpiry)) {
    const error = new Error('报名截止后不能再生成认领邀请，请先处理赛事异常流程')
    error.code = 'TEAM_CLAIM_INVITE_EXPIRED'
    throw error
  }
  if (!userOwnsTournament(tournament, identity, actorOrgId)) throw new Error('当前账号无权为该赛事生成认领邀请')
  if (!relation || String(relation.tournamentId || '') !== tournamentId) throw new Error('参赛球队关系不存在或不属于当前赛事')
  if (relation.divisionId && String(relation.divisionId) !== divisionId) throw new Error('参赛球队不属于当前竞赛组别')

  const teamId = text(relation.teamId, 80)
  if (!teamId) throw new Error('参赛关系缺少球队')
  const teamResult = await db.collection('teams').doc(teamId).get()
  const team = asObject(teamResult.data)
  if (!team) throw new Error('待认领球队不存在')
  const relationOrgId = text(relation.orgId || relation.organizationId, 80)
  const teamOrgId = text(team.orgId || team.organizationId, 80)
  if (actorOrgId && relationOrgId && relationOrgId !== actorOrgId) {
    throw new Error('参赛球队关系不属于当前机构')
  }
  if (actorOrgId && teamOrgId && teamOrgId !== actorOrgId) {
    throw new Error('球队不属于当前机构')
  }
  const inviteQuery = {
    type: 'prebuilt_tournament_team',
    tournamentId,
    divisionId,
    teamId,
    status: 'pending'
  }
  if (actorOrgId) inviteQuery.organizerOrgId = actorOrgId
  const existingResult = await db.collection('team_invitations').where(inviteQuery).limit(20).get()
  const pendingInvites = (existingResult.data || []).filter(item => !inviteExpired(item.inviteExpireAt || item.expiresAt || tournamentInviteExpiry))
  pendingInvites.sort((left, right) => String(right.createTime || '').localeCompare(String(left.createTime || '')))
  let invite = pendingInvites[0]
  const now = db.serverDate()
  if (!invite) {
    const added = await db.collection('team_invitations').add({
      data: {
        type: 'prebuilt_tournament_team',
        status: 'pending',
        tournamentId,
        divisionId,
        teamId,
        tournamentTeamId,
        organizerOrgId: actorOrgId,
        organizerUserId: identity.user._id,
        organizerName: text(tournament.organizerName || tournament.organizer || '', 80),
        managerName: text(team.contactName || team.managerName || '', 40),
        managerPhone: text(team.contactPhone || team.managerPhone || team.ownerPhone || '', 32),
        divisionName: text(relation.divisionName || tournament.divisionName || divisionId, 40),
        inviteExpireAt: tournamentInviteExpiry,
        source: 'pc_claim_invite',
        createTime: now,
        updateTime: now
      }
    })
    invite = {
      _id: added._id,
      tournamentId,
      divisionId,
      teamId,
      tournamentTeamId
    }
  }

  const inviteId = String(invite._id)
  const path = `/pages/team/prebuilt-invite/prebuilt-invite?inviteId=${encodeURIComponent(inviteId)}`
  const actualVersion = qrEnvVersion(event.envVersion)
  const testOnly = actualVersion !== 'release'
  const qrCodeUrl = event.skipCode === true ? '' : await makeMiniProgramCode(inviteId, actualVersion)
  const urlLink = event.skipCode === true || testOnly ? '' : await makeMiniProgramUrlLink(inviteId)
  await db.collection('team_invitations').doc(inviteId).update({
    data: { qrCodeUrl, urlLink, qrEnvVersion:actualVersion, lastSharedAt: now, updateTime: now }
  })
  await db.collection('tournament_teams').doc(tournamentTeamId).update({
    data: { claimInviteId: inviteId, lastInviteTime: now, updateTime: now }
  })
  return {
    success: true,
    inviteId,
    path,
    urlLink,
    qrCodeUrl,
    envVersion:actualVersion,
    testOnly,
    inviteExpireAt: invite.inviteExpireAt || tournamentInviteExpiry,
    tournamentId,
    divisionId,
    tournamentTeamId
  }
}

function reviewStatusLabel(status) {
  return ({
    pending: '待核验',
    under_review: '核验中',
    needs_more_info: '待补充材料',
    approved: '人工核验通过',
    rejected: '核验未通过'
  })[String(status || '').toLowerCase()] || '待核验'
}

function reviewReasonLabel(reason) {
  return ({
    ownership_conflict: '归属冲突',
    same_name: '同名球队',
    duplicate_organization: '重复机构档案',
    other: '其他争议'
  })[String(reason || '').toLowerCase()] || '归属冲突'
}

function reviewRow(request, team, tournament, invite, requester) {
  const status = String(request.status || 'pending').toLowerCase()
  const requesterPhone = requester && (requester.phone || requester.phoneNumber || requester.mobile)
  return {
    id: String(request._id),
    inviteId: String(request.inviteId || ''),
    teamId: String(request.teamId || ''),
    tournamentId: String(request.tournamentId || ''),
    divisionId: String(request.divisionId || ''),
    teamName: String((team && (team.name || team.teamName)) || request.teamName || '未命名球队'),
    tournamentName: String((tournament && (tournament.name || tournament.tournamentName)) || request.tournamentName || '赛事'),
    divisionName: String(request.divisionName || (invite && invite.divisionName) || request.divisionId || '未分组'),
    status,
    statusLabel: reviewStatusLabel(status),
    reason: String(request.reason || 'ownership_conflict'),
    reasonLabel: reviewReasonLabel(request.reason),
    proofTypes: Array.isArray(request.proofTypes) ? request.proofTypes.slice(0, 3) : [],
    proofMaterialCount: Array.isArray(request.proofMaterials) ? request.proofMaterials.length : Number(request.proofMaterialCount || 0),
    proofRequired: request.proofRequired !== false,
    requesterName: String(request.requesterName || (requester && (requester.nickname || requester.userName || requester.name)) || '球队负责人'),
    requesterPhoneMasked: maskPhone(request.requesterPhone || requesterPhone),
    reviewNote: String(request.reviewNote || ''),
    createdAt: request.createTime || request.createdAt || null,
    updatedAt: request.updateTime || null,
    reviewedAt: request.reviewedAt || null,
    reviewedByName: String(request.reviewedByName || ''),
    // File IDs remain private to the evidence workflow and are not exposed in the list.
    hasProofMaterials: Array.isArray(request.proofMaterials) && request.proofMaterials.length > 0
  }
}

async function listClaimReviewRequests(event, identity) {
  const actorOrgId = text(event.__actorOrgId || identity.user.orgId, 80)
  if (!actorOrgId) throw new Error('当前账号尚未关联机构')
  const tournamentId = text(event.tournamentId, 80)
  const requestedStatus = String(event.status || 'active').toLowerCase()
  const query = { organizerOrgId: actorOrgId }
  if (tournamentId) query.tournamentId = tournamentId
  const requests = await safeGet('team_claim_review_requests', query, 200)
  const filtered = requests.filter(function(item) {
    const status = String(item.status || 'pending').toLowerCase()
    if (requestedStatus === 'active') return ['pending', 'under_review', 'needs_more_info'].includes(status)
    if (requestedStatus === 'all') return true
    return status === requestedStatus
  })
  const teamIds = Array.from(new Set(filtered.map(item => String(item.teamId || '')).filter(Boolean)))
  const tournamentIds = Array.from(new Set(filtered.map(item => String(item.tournamentId || '')).filter(Boolean)))
  const requesterIds = Array.from(new Set(filtered.map(item => String(item.requesterUserId || '')).filter(Boolean)))
  const [teams, tournaments, invites, users] = await Promise.all([
    teamIds.length ? safeGet('teams', { _id: _.in(teamIds) }, teamIds.length) : [],
    tournamentIds.length ? safeGet('tournaments', { _id: _.in(tournamentIds) }, tournamentIds.length) : [],
    filtered.length ? safeGet('team_invitations', { _id: _.in(filtered.map(item => String(item.inviteId || '')).filter(Boolean)) }, filtered.length) : [],
    requesterIds.length ? safeGet('users', { _id: _.in(requesterIds) }, requesterIds.length) : []
  ])
  const teamMap = new Map(teams.map(item => [String(item._id), item]))
  const tournamentMap = new Map(tournaments.map(item => [String(item._id), item]))
  const inviteMap = new Map(invites.map(item => [String(item._id), item]))
  const userMap = new Map(users.map(item => [String(item._id), item]))
  filtered.sort((left, right) => String(right.updateTime || right.createTime || '').localeCompare(String(left.updateTime || left.createTime || '')))
  return {
    success: true,
    organizationId: actorOrgId,
    requests: filtered.map(item => reviewRow(item, teamMap.get(String(item.teamId || '')), tournamentMap.get(String(item.tournamentId || '')), inviteMap.get(String(item.inviteId || '')), userMap.get(String(item.requesterUserId || ''))))
  }
}

async function getClaimReviewProofUrls(event, identity) {
  const actorOrgId = text(event.__actorOrgId || identity.user.orgId, 80)
  if (!actorOrgId) throw new Error('当前账号尚未关联机构')
  const requestId = text(event.requestId, 80)
  if (!requestId) throw new Error('缺少审核请求')
  const request = (await safeGet('team_claim_review_requests', { _id: requestId, organizerOrgId: actorOrgId }, 2))[0]
  if (!request) throw new Error('审核请求不存在或不属于当前机构')
  const materials = (Array.isArray(request.proofMaterials) ? request.proofMaterials : []).filter(item => item && String(item.fileId || '').indexOf('cloud://') === 0).slice(0, 3)
  if (!materials.length) return { success: true, requestId, materials: [] }
  const temp = await cloud.getTempFileURL({ fileList: materials.map(item => String(item.fileId)) })
  const urls = new Map((temp.fileList || []).map(item => [String(item.fileID || ''), item]))
  return {
    success: true,
    requestId,
    materials: materials.map(item => {
      const file = urls.get(String(item.fileId)) || {}
      return {
        proofType: String(item.proofType || ''),
        fileName: String(item.fileName || '证明材料'),
        size: Number(item.size || 0),
        fileId: String(item.fileId),
        url: String(file.tempFileURL || ''),
        status: file.tempFileURL ? 'ready' : 'unavailable'
      }
    })
  }
}

async function decideClaimReview(event, identity) {
  const actorOrgId = text(event.__actorOrgId || identity.user.orgId, 80)
  if (!actorOrgId) throw new Error('当前账号尚未关联机构')
  const requestId = text(event.requestId, 80)
  const decision = String(event.decision || '').toLowerCase()
  if (!requestId) throw new Error('缺少审核请求')
  if (!['under_review', 'needs_more_info', 'approved', 'rejected'].includes(decision)) throw new Error('审核结果不受支持')
  const requestRows = await safeGet('team_claim_review_requests', { _id: requestId, organizerOrgId: actorOrgId }, 2)
  const request = requestRows[0]
  if (!request) throw new Error('审核请求不存在或不属于当前机构')
  const currentStatus = String(request.status || 'pending').toLowerCase()
  if (['approved', 'rejected'].includes(currentStatus)) throw new Error('该审核请求已完成，不能重复处理')
  const inviteRows = await safeGet('team_invitations', { _id: String(request.inviteId || ''), organizerOrgId: actorOrgId }, 2)
  const invite = inviteRows[0]
  if (!invite) throw new Error('关联认领邀请不存在或不属于当前机构')
  const note = text(event.note, 500)
  if (decision === 'needs_more_info' && !note) throw new Error('请填写需要补充的材料说明')
  const reviewerName = text(identity.user.nickname || identity.user.userName || identity.user.phone || identity.user._id, 50)
  const now = db.serverDate()
  const requestData = {
    status: decision,
    reviewDecision: decision,
    reviewNote: note,
    reviewedBy: identity.user._id,
    reviewedByName: reviewerName,
    reviewedAt: now,
    updateTime: now
  }
  await db.collection('team_claim_review_requests').doc(requestId).update({ data: requestData })
  const inviteData = {
    reviewStatus: decision,
    reviewDecision: decision,
    reviewNote: note,
    reviewedBy: identity.user._id,
    reviewedByName: reviewerName,
    reviewedAt: now,
    updateTime: now
  }
  // Approval only unlocks a subsequent claimant confirmation; it never assigns ownership here.
  inviteData.status = decision === 'approved' ? 'review_approved' : decision === 'rejected' ? 'review_rejected' : 'review_required'
  await db.collection('team_invitations').doc(String(invite._id)).update({ data: inviteData })
  const relations = await safeGet('tournament_teams', { tournamentId: String(request.tournamentId || ''), teamId: String(request.teamId || '') }, 20)
  for (const relation of relations) {
    const relationStatus = String(relation.status || '').toLowerCase()
    if (['approved', 'confirmed', 'claimed', 'accepted'].includes(relationStatus)) continue
    await db.collection('tournament_teams').doc(relation._id).update({ data: { claimReviewStatus: decision, claimReviewRequestId: requestId, updateTime: now } })
  }
  const team = (await safeGet('teams', { _id: String(request.teamId || '') }, 1))[0]
  const tournament = (await safeGet('tournaments', { _id: String(request.tournamentId || '') }, 1))[0]
  const requester = (await safeGet('users', { _id: String(request.requesterUserId || '') }, 1))[0]
  return { success: true, request: reviewRow({ ...request, ...requestData }, team, tournament, invite, requester), ownershipChanged: false, nextAction: decision === 'approved' ? 'claimant_confirmation_required' : '' }
}

exports.main = async function(event) {
  try {
    const identity = await currentUser(event || {})
    if (event && event.action === 'getTeamExportPhotos') return await getTeamExportPhotos(event, identity)
    if (event && event.action === 'listTeamAccess') return await listTeamAccess(event, identity)
    if (event && event.action === 'saveTeamAccess') return await saveTeamAccess(event, identity)
    if (event && event.action === 'listClaimReviewRequests') return await listClaimReviewRequests(event, identity)
    if (event && event.action === 'getClaimReviewProofUrls') return await getClaimReviewProofUrls(event, identity)
    if (event && event.action === 'decideClaimReview') return await decideClaimReview(event, identity)
    return await createOrReuseInvite(event || {}, identity)
  } catch (error) {
    console.error('[organizerClaimInvite] failed:', error.message)
    return { success: false, message: error.message || '认领邀请生成失败' }
  }
}
