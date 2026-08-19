const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex')
}

function asObject(value) {
  return Array.isArray(value) ? value[0] : value
}

function text(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength || 120)
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

function inviteExpiry(tournament) {
  const value = tournament.registrationDeadline || tournament.signupDeadline || tournament.endDate
  if (value) return value
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
}

async function makeMiniProgramCode(inviteId, envVersion) {
  const requestedEnv = String(envVersion || '').trim().toLowerCase()
  const codeEnvVersion = ['develop', 'trial', 'release'].includes(requestedEnv)
    ? requestedEnv
    : 'release'
  try {
    const result = await cloud.openapi.wxacode.getUnlimited({
      scene: String(inviteId).slice(0, 32),
      page: 'pages/team/prebuilt-invite/prebuilt-invite',
      width: 300,
      envVersion: codeEnvVersion
    })
    const base64 = result.buffer.toString('base64')
    return `data:image/png;base64,${base64}`
  } catch (error) {
    console.warn('[organizerClaimInvite] mini-program code unavailable:', error.message)
    return ''
  }
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
  if (competitionPlanLocked(tournament, divisionId)) throw new Error('竞赛方案已确认，不能再生成认领邀请')
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
  const claimStatus = String(team.claimStatus || relation.claimStatus || '').toLowerCase()
  if (['claimed', 'owned', 'accepted'].includes(claimStatus) && !['pending_claim', 'unclaimed'].includes(String(relation.claimStatus || '').toLowerCase())) {
    throw new Error('该球队已完成认领，无需重复生成邀请')
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
  const qrCodeUrl = await makeMiniProgramCode(inviteId, event.envVersion)
  await db.collection('team_invitations').doc(inviteId).update({
    data: { lastSharedAt: now, updateTime: now }
  })
  await db.collection('tournament_teams').doc(tournamentTeamId).update({
    data: { claimInviteId: inviteId, lastInviteTime: now, updateTime: now }
  })
  return {
    success: true,
    inviteId,
    path,
    qrCodeUrl,
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
    if (event && event.action === 'listClaimReviewRequests') return await listClaimReviewRequests(event, identity)
    if (event && event.action === 'getClaimReviewProofUrls') return await getClaimReviewProofUrls(event, identity)
    if (event && event.action === 'decideClaimReview') return await decideClaimReview(event, identity)
    return await createOrReuseInvite(event || {}, identity)
  } catch (error) {
    console.error('[organizerClaimInvite] failed:', error.message)
    return { success: false, message: error.message || '认领邀请生成失败' }
  }
}
