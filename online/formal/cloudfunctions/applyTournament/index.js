// 云函数：球队报名参赛（外部报名）
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

async function authenticateActor(event) {
  const userId = String(event && event.__actorUserId || '').trim()
  const orgId = String(event && event.__actorOrgId || '').trim()
  if (!userId || !orgId) return authenticateMiniActor()
  if (!userId || !orgId) return { ok: false, result: { success: false, message: '登录会话或机构信息已失效，请重新登录', code: 'AUTH_REQUIRED' } }
  const userResult = await db.collection('users').doc(userId).get()
  const user = Array.isArray(userResult.data) ? userResult.data[0] : userResult.data
  if (!user) return { ok: false, result: { success: false, message: '登录账号不存在', code: 'AUTH_REQUIRED' } }
  const userOrgId = String(user.orgId || user.organizationId || '').trim()
  if (!userOrgId || userOrgId !== orgId) return { ok: false, result: { success: false, message: '当前账号尚未关联有效机构', code: 'ORG_REQUIRED' } }
  const organizationResult = await db.collection('organizations').doc(orgId).get()
  const organization = Array.isArray(organizationResult.data) ? organizationResult.data[0] : organizationResult.data
  if (!organization) return { ok: false, result: { success: false, message: '当前机构不存在或已失效', code: 'ORG_REQUIRED' } }
  return { ok: true, actor: { userId, orgId } }
}

async function authenticateMiniActor() {
  const openId = String((cloud.getWXContext() || {}).OPENID || '').trim()
  if (!openId) return { ok: false, result: { success: false, message: '登录会话已失效，请重新登录', code: 'AUTH_REQUIRED' } }
  const userResult = await db.collection('users')
    .where(_.or([{ openId }, { wechatOpenId: openId }, { _openid: openId }]))
    .limit(2)
    .get()
  const users = userResult.data || []
  if (users.length !== 1) {
    return {
      ok: false,
      result: {
        success: false,
        message: users.length > 1 ? '当前微信存在重复账号，请联系管理员处理' : '请先完成账号绑定',
        code: users.length > 1 ? 'ACCOUNT_CONFLICT' : 'AUTH_REQUIRED'
      }
    }
  }
  const user = users[0]
  return {
    ok: true,
    actor: {
      userId: String(user._id || ''),
      orgId: String(user.orgId || user.organizationId || user.organization_id || ''),
      openId,
      user,
      channel: 'mini'
    }
  }
}

async function canManageMiniTeam(team, actor) {
  if (!team || !actor || actor.channel !== 'mini') return false
  const user = actor.user || {}
  const identities = [actor.userId, actor.openId, user.phone, user.phoneNumber, user.mobile].filter(Boolean).map(String)
  const ownerValues = [
    team.ownerId, team.ownerUserId, team.creatorId, team.userId,
    team.openId, team.wechatOpenId, team._openid,
    team.ownerPhone, team.creatorPhone, team.phoneNumber, team.phone,
    team.contactPhone, team.mobile
  ].filter(Boolean).map(String)
  if (identities.some(value => ownerValues.includes(value))) return true

  const membershipResult = await db.collection('team_memberships').where({ teamId: team._id }).limit(200).get()
  const memberships = membershipResult.data || []
  return memberships.some(item => {
    const status = String(item.status || 'active').toLowerCase()
    if (!['active', 'accepted', 'claimed'].includes(status)) return false
    const memberValues = [item.userId, item.memberUserId, item.ownerId, item.openId].filter(Boolean).map(String)
    if (!identities.some(value => memberValues.includes(value))) return false
    const roles = (item.roles || (item.role ? [item.role] : [])).map(value => String(value).toLowerCase())
    return roles.length === 0 || roles.some(role => ['owner', 'team_manager', 'manager', 'coach', 'admin', '负责人', '管理员', '教练'].includes(role))
  })
}

function competitionPlanLocked(tournament, divisionId) {
  if (!tournament) return false
  if (tournament.competitionPlanLocked === true || tournament.finalPlanLocked === true ||
    ['locked', 'match_management', 'in_progress', 'completed'].includes(String(tournament.competitionPlanStatus || '').toLowerCase())) {
    return true
  }
  const divisions = Array.isArray(tournament.divisions) ? tournament.divisions : []
  if (!divisions.length) return false
  const requested = String(divisionId || '').trim()
  return divisions.some(function(division) {
    const id = String(division.id || division._id || division.divisionId || division.division || division.divisionKey || '').trim()
    const matches = requested ? id === requested : true
    return matches && (division.competitionPlanLocked === true || division.finalPlanLocked === true ||
      ['locked', 'match_management', 'in_progress', 'completed'].includes(String(division.competitionPlanStatus || '').toLowerCase()))
  })
}

function recordDivisionId(record) {
  return String(record && (record.divisionId || record.division || record.categoryId || record.groupId) || '').trim()
}

async function upsertByKey(collection, uniqueKey, data) {
  const result = await db.collection(collection).where({ uniqueKey }).limit(2).get()
  const row = (result.data || [])[0]
  if (row) {
    await db.collection(collection).doc(row._id).update({ data: { ...data, updateTime: db.serverDate() } })
    return row._id
  }
  const created = await db.collection(collection).add({ data: { ...data, uniqueKey, createTime: db.serverDate(), updateTime: db.serverDate() } })
  return created._id
}

async function verifyServiceFollow(actor, tournamentId, gateId) {
  if (!actor || actor.channel !== 'mini' || !actor.openId) {
    return { ok: true, gateId: '', officialOpenId: '' }
  }
  const bindings = await db.collection('service_account_bindings').where({
    sport: 'football', miniOpenId: actor.openId, subscribed: true
  }).limit(2).get()
  const binding = (bindings.data || []).find(item => String(item.officialOpenId || '').trim())
  if (binding) return { ok: true, gateId: String(gateId || ''), officialOpenId: String(binding.officialOpenId) }

  const normalizedGateId = String(gateId || '').trim()
  if (normalizedGateId) {
    const gateResult = await db.collection('service_follow_gates').doc(normalizedGateId).get()
    const gate = Array.isArray(gateResult.data) ? gateResult.data[0] : gateResult.data
    const owned = gate && String(gate.miniOpenId || '') === actor.openId && String(gate.tournamentId || '') === String(tournamentId)
    if (owned && gate.subscribed === true && String(gate.officialOpenId || '').trim()) {
      return { ok: true, gateId: normalizedGateId, officialOpenId: String(gate.officialOpenId) }
    }
  }
  return {
    ok: false,
    result: { success: false, code: 'SERVICE_FOLLOW_REQUIRED', message: '请先关注并绑定“赛小蜂足球助手”，再确认报名' }
  }
}

function configuredDivisionIds(tournament, divisionRows) {
  const inline = Array.isArray(tournament && tournament.divisions) ? tournament.divisions : []
  const inlineIds = inline.map(function (item) {
    return String(item && (item.id || item._id || item.divisionId || item.division || item.divisionKey) || '').trim()
  }).filter(Boolean)
  const storedIds = (Array.isArray(divisionRows) ? divisionRows : []).map(function (item) {
    return String(item && (item._id || item.id || item.divisionId || item.division || item.divisionKey) || '').trim()
  }).filter(Boolean)
  return Array.from(new Set(inlineIds.concat(storedIds)))
}

async function resolveSignupDivision(tournament, requestedDivisionId, existingRows) {
  const requested = String(requestedDivisionId || '').trim()
  let divisionRows = []
  try {
    const result = await db.collection('divisions').where({ tournamentId: tournament._id }).limit(100).get()
    divisionRows = result.data || []
  } catch (error) {
    console.warn('[applyTournament] 无法读取赛事组别配置，继续使用赛事内嵌组别:', error.message)
  }
  const configuredIds = configuredDivisionIds(tournament, divisionRows)
  const existingIds = Array.from(new Set((Array.isArray(existingRows) ? existingRows : []).map(recordDivisionId).filter(Boolean)))
  const knownIds = Array.from(new Set(configuredIds.concat(existingIds)))
  if (requested && knownIds.length && !knownIds.includes(requested)) {
    return { ok: false, result: { success: false, code: 'DIVISION_NOT_FOUND', message: '所选竞赛组别不属于当前赛事' } }
  }
  if (!requested && knownIds.length > 1) {
    return { ok: false, result: { success: false, code: 'DIVISION_REQUIRED', message: '当前赛事包含多个竞赛组别，请先选择报名组别' } }
  }
  const divisionId = requested || knownIds[0] || 'default'
  const hasAmbiguousLegacy = (Array.isArray(existingRows) ? existingRows : []).some(function (row) {
    return !recordDivisionId(row)
  }) && knownIds.length > 1
  if (hasAmbiguousLegacy) {
    return { ok: false, result: { success: false, code: 'DIVISION_REQUIRED', message: '当前赛事存在未标记组别的历史报名记录，请由主办方先核验后再报名' } }
  }
  const allDivisions = (Array.isArray(tournament && tournament.divisions) ? tournament.divisions : []).concat(Array.isArray(divisionRows) ? divisionRows : [])
  const selectedDivision = allDivisions.find(function (item) {
    return String(item && (item.id || item._id || item.divisionId || item.division || item.divisionKey) || '').trim() === divisionId
  }) || null
  return { ok: true, divisionId, allowLegacyRecord: knownIds.length <= 1, hasMultiple: knownIds.length > 1, selectedDivision }
}

exports.main = async (event, context) => {
  const { tournamentId, teamId, divisionId = '', inviteKey = '', message = '' } = event

  if (!tournamentId) {
    return { success: false, message: '缺少 tournamentId 参数' }
  }
  if (!teamId) {
    return { success: false, message: '缺少 teamId 参数' }
  }

  try {
    const actorResult = await authenticateActor(event)
    if (!actorResult.ok) return actorResult.result
    // 1. 查询赛事信息
    const tournamentRes = await db.collection('tournaments').doc(tournamentId).get()
    if (!tournamentRes.data) {
      return { success: false, message: '赛事不存在' }
    }
    const tournament = tournamentRes.data

    let registrationInvite = null
    if (inviteKey) {
      const inviteResult = await db.collection('tournament_invites').where({ sport: 'football', inviteKey: String(inviteKey), status: 'active' }).limit(2).get()
      registrationInvite = (inviteResult.data || [])[0] || null
      if (!registrationInvite || String(registrationInvite.tournamentId) !== String(tournamentId)) {
        return { success: false, code: 'INVITE_INVALID', message: '报名邀请无效、已重置或不属于当前赛事' }
      }
    }

    const teamRes = await db.collection('teams').doc(teamId).get()
    const team = Array.isArray(teamRes.data) ? teamRes.data[0] : teamRes.data
    if (!team) {
      return { success: false, message: '球队不存在' }
    }
    const teamOrgId = String(team.orgId || team.organizationId || team.organization_id || '').trim()
    if (actorResult.actor.channel === 'mini') {
      const canManage = await canManageMiniTeam(team, actorResult.actor)
      if (!canManage) return { success: false, code: 'TEAM_ACCESS_DENIED', message: '当前账号没有该球队的报名权限' }
      // 小程序球队以已验证的负责人/管理员关系作为报名授权；历史球队可能尚未补齐 orgId。
      // 有明确机构时继续沿用机构边界，没有机构字段时不能否定已经通过的球队管理权校验。
      if (teamOrgId) actorResult.actor.orgId = teamOrgId
    }
    if (actorResult.actor.channel !== 'mini' && (!teamOrgId || teamOrgId !== actorResult.actor.orgId)) {
      return { success: false, message: '无权提交当前机构之外的球队', code: 'ORG_ACCESS_DENIED' }
    }

    // 2. 检查赛事是否开放报名
    if (tournament.status !== 'registering' && tournament.status !== 'upcoming') {
      return { success: false, message: '该赛事已停止报名' }
    }

    // 3. 检查球队是否已报名
    if (actorResult.actor.channel === 'mini' && event.disclaimerAgreed !== true) {
      return { success: false, code: 'DISCLAIMER_REQUIRED', message: '请先阅读并同意参赛免责声明' }
    }
    const enforceServiceFollow = String(process.env.SXF_FOOTBALL_ENFORCE_SERVICE_FOLLOW || '').toLowerCase() === 'true'
    const shouldVerifyServiceFollow = actorResult.actor.channel === 'mini' && (enforceServiceFollow || Boolean(String(event.serviceFollowGateId || '').trim()))
    const serviceFollow = shouldVerifyServiceFollow
      ? await verifyServiceFollow(actorResult.actor, tournamentId, event.serviceFollowGateId)
      : { ok: true, gateId: '', officialOpenId: '' }
    if (!serviceFollow.ok) return serviceFollow.result
    const existRes = await db.collection('tournament_teams').where({
      tournamentId: tournamentId,
      teamId: teamId
    }).get()

    const divisionResult = await resolveSignupDivision(tournament, divisionId, existRes.data || [])
    if (!divisionResult.ok) return divisionResult.result
    const selectedDivisionId = divisionResult.divisionId
    if (!divisionResult.selectedDivision || divisionResult.selectedDivision.registrationEnabled !== true) {
      return { success: false, code: 'DIVISION_REGISTRATION_CLOSED', message: '当前竞赛组别尚未开启报名或已停止报名' }
    }
    if (registrationInvite && registrationInvite.divisionId && String(registrationInvite.divisionId) !== String(selectedDivisionId)) {
      return { success: false, code: 'INVITE_DIVISION_MISMATCH', message: '报名邀请仅适用于指定竞赛组别' }
    }
    const selectedDivisionName = String((divisionResult.selectedDivision && (divisionResult.selectedDivision.name || divisionResult.selectedDivision.divisionName || divisionResult.selectedDivision.title)) || tournament.divisionName || '')
    if (competitionPlanLocked(tournament, selectedDivisionId)) {
      return { success: false, code: 'COMPETITION_PLAN_LOCKED', message: '竞赛方案已确认，不能新增或重建参赛关系' }
    }
    const existingRows = (existRes.data || []).filter(function (row) {
      const rowDivisionId = recordDivisionId(row)
      return rowDivisionId ? rowDivisionId === selectedDivisionId : divisionResult.allowLegacyRecord
    })

    if (existingRows.length > 0) {
      const exist = existingRows[0]
      if (exist.status === 'pending') {
        return { success: false, message: '您已提交报名申请，请等待主办方审核' }
      }
      if (exist.status === 'approved') {
        return { success: false, message: '您的球队已通过审核，无需重复报名' }
      }
      if (exist.status === 'invited') {
        // 球队主动报名，删除旧的邀请记录，重新创建报名记录
        await db.collection('tournament_teams').doc(exist._id).remove()
      }
      if (exist.status === 'rejected') {
        // 被拒绝后可以重新报名，先删除旧记录
        await db.collection('tournament_teams').doc(exist._id).remove()
      }
    }

    // 4. 检查赛事是否已满
    const capacityWhere = {
      tournamentId: tournamentId,
      status: _.in(['approved', 'invited'])
    }
    if (divisionResult.hasMultiple && selectedDivisionId !== 'default') capacityWhere.divisionId = selectedDivisionId
    const approvedCount = await db.collection('tournament_teams').where(capacityWhere).count()
    const selectedMaxTeams = Number((divisionResult.selectedDivision && (divisionResult.selectedDivision.maxTeams || divisionResult.selectedDivision.teamLimit)) || tournament.maxTeams || 0)

    if (selectedMaxTeams && approvedCount.total >= selectedMaxTeams) {
      return { success: false, message: '该赛事名额已满' }
    }

    // 6. 创建报名记录
    const signupData = {
      tournamentId: tournamentId,
      tournamentName: tournament.name,
      teamId: teamId,
      ...(selectedDivisionId !== 'default' ? { divisionId: selectedDivisionId } : {}),
      ...(selectedDivisionName ? { divisionName: selectedDivisionName } : {}),
      teamName: team.name,
      teamLogo: team.logoUrl || team.logo || '',
      coachId: team.coachId || '',
      coachName: team.coachName || team.contactName || '',
      playerCount: 0,
      status: 'pending',
      type: 'signup',  // signup = 外部报名, invite = 内部邀请
      message: message,
      inviteId: registrationInvite ? registrationInvite._id : '',
      inviteKeyUsed: registrationInvite ? true : false,
      applicantUserId: actorResult.actor.userId,
      applicantMiniOpenId: actorResult.actor.channel === 'mini' ? actorResult.actor.openId : '',
      teamOrgId,
      miniSubscriptionAccepted: event.miniSubscriptionAccepted === true,
      serviceFollowGateId: serviceFollow.gateId,
      serviceAccountBound: Boolean(serviceFollow.officialOpenId),
      serviceAccountOpenId: serviceFollow.officialOpenId,
      disclaimerAgreed: actorResult.actor.channel === 'mini' ? true : Boolean(event.disclaimerAgreed),
      ...(actorResult.actor.channel === 'mini' ? { disclaimerTime: db.serverDate() } : {}),
      message: message,
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }

    const result = await db.collection('tournament_teams').add({
      data: signupData
    })

    // 业务状态先落库，任务、通知与审计作为可重试的协作记录，不以微信是否送达决定报名是否成功。
    try {
      await upsertByKey('tournament_tasks', `${tournamentId}:registration_review:${result._id}`, {
        sport: 'football', tournamentId, divisionId: selectedDivisionId, teamId, registrationId: result._id,
        type: 'registration_review', audience: 'organizer', recipientOrgId: String(tournament.orgId || tournament.organizationId || ''),
        status: 'pending', title: '审核参赛球队', detail: team.name
      })
      await upsertByKey('tournament_tasks', `${tournamentId}:registration_status:${teamId}`, {
        sport: 'football', tournamentId, divisionId: selectedDivisionId, teamId, registrationId: result._id,
        type: 'registration_status', audience: 'team', recipientUserId: actorResult.actor.userId,
        status: 'pending', title: '赛事报名审核中', detail: tournament.name
      })
      await upsertByKey('notification_outbox', `registration_submitted:${result._id}:task_center`, {
        sport: 'football', businessEventId: `registration_submitted:${result._id}`, tournamentId, registrationId: result._id,
        recipientOrgId: String(tournament.orgId || tournament.organizationId || ''), channel: 'task_center', status: 'delivered', targetPage: 'pages/todo/index'
      })
      await db.collection('registration_audit_logs').add({ data: {
        sport: 'football', action: 'registration_submitted', tournamentId, divisionId: selectedDivisionId,
        inviteId: registrationInvite ? registrationInvite._id : '', registrationId: result._id,
        actorUserId: actorResult.actor.userId, actorOrgId: teamOrgId, result: 'success',
        detail: { channel: actorResult.actor.channel || 'web', inviteUsed: Boolean(registrationInvite) }, createTime: db.serverDate()
      } })
    } catch (collaborationError) {
      console.warn('[applyTournament] 协作任务或通知记录写入失败，报名记录已保留:', collaborationError.message)
    }

    // 7. 同步创建 invitations 记录（用于消息通知）
    try {
      await db.collection('invitations').add({
        data: {
          type: 'team_to_tournament',
          status: 'pending',
          fromUserId: team.coachId || '',
          fromName: team.coachName || team.contactName || team.name,
          toName: tournament.name,
          tournamentId: tournamentId,
          tournamentName: tournament.name,
          teamId: teamId,
          teamName: team.name,
          ...(selectedDivisionId !== 'default' ? { divisionId: selectedDivisionId } : {}),
          createdAt: db.serverDate(),
          message: message
        }
      })
    } catch (invErr) {
      console.warn('同步创建invitations记录失败:', invErr.message)
      // 不阻塞主流程
    }

    return {
      success: true,
      message: '报名申请已提交，请等待主办方审核',
      data: {
        signupId: result._id,
        divisionId: selectedDivisionId
      }
    }

  } catch (err) {
    console.error('报名失败:', err)
    return {
      success: false,
      message: err.message || '报名失败'
    }
  }
}
