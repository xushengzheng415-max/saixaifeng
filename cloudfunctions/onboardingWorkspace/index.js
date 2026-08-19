const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

function cleanText(value, maxLength) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength)
}

function normalizeTrainingStatus(value) {
  if (value === true) return 'active'
  if (!value) return 'inactive'
  if (typeof value === 'object') {
    return normalizeTrainingStatus(value.status || value.subscriptionStatus || value.state || value.enabled)
  }
  const status = String(value).toLowerCase()
  if (['active', 'enabled', 'paid', 'trial', 'trialing'].indexOf(status) >= 0) {
    return status === 'trialing' ? 'trial' : status
  }
  return 'inactive'
}

function canUseTraining(status) {
  return ['active', 'enabled', 'paid', 'trial'].indexOf(String(status || '')) >= 0
}

async function safeRows(collection, condition, limit) {
  try {
    const result = await db.collection(collection).where(condition).limit(limit || 5).get()
    return result.data || []
  } catch (error) {
    // 青训开通记录可能尚未创建；不能因为可选历史表缺失而放行创建。
    return []
  }
}

async function rowsByIds(collection, ids, limit) {
  const uniqueIds = Array.from(new Set((ids || []).map(function(value) {
    return String(value || '').trim()
  }).filter(Boolean)))
  if (!uniqueIds.length) return []
  return safeRows(collection, _.or(uniqueIds.map(function(id) {
    return { _id: id }
  })), limit || uniqueIds.length)
}

function collectOrganizationIds(rows, target) {
  ;(rows || []).forEach(function(row) {
    ;['orgId', 'organizationId', 'organization_id'].forEach(function(key) {
      const value = String(row && row[key] || '').trim()
      if (value) target.add(value)
    })
  })
}

function isActiveMembership(row) {
  const status = String(row && row.status || 'active').toLowerCase()
  return ['active', 'accepted', 'claimed'].indexOf(status) >= 0
}

function identityMatches(value, userId) {
  return Boolean(value) && String(value) === String(userId)
}

function hasPermission(membership, permission) {
  const permissions = Array.isArray(membership && membership.permissions) ? membership.permissions : []
  const roles = Array.isArray(membership && membership.roles) ? membership.roles : []
  return permissions.indexOf(permission) >= 0 || roles.indexOf(permission) >= 0
}

async function organizationAccess(identity, organization) {
  const organizationId = String(organization && (organization._id || organization.id) || '')
  if (!organizationId) return { isMember: false, canEvent: false, canTraining: false }
  const userId = String(identity.user._id)
  const membershipRows = await safeRows('organization_memberships', _.or([
    { orgId: organizationId, userId },
    { orgId: organizationId, memberUserId: userId },
    { organizationId, userId },
    { organizationId, memberUserId: userId },
    { organization_id: organizationId, userId },
    { organization_id: organizationId, memberUserId: userId }
  ]), 20)
  const membership = membershipRows.find(isActiveMembership) || null
  const isOwner = [organization.ownerId, organization.creatorId, organization.createdBy].some(function(value) {
    return identityMatches(value, userId)
  })
  return {
    isMember: Boolean(membership || isOwner),
    canEvent: Boolean(isOwner || (membership && hasPermission(membership, 'event.manage'))),
    canTraining: Boolean(isOwner || (membership && (hasPermission(membership, 'education.manage') || hasPermission(membership, 'workspace.manage'))))
  }
}

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex')
}

async function currentUser(event) {
  const context = cloud.getWXContext()
  const contextOpenId = String(context.OPENID || '')
  let openId = contextOpenId
  let users = []

  if (!openId && event && event.__authToken && event.__actorUserId) {
    const sessions = await db.collection('auth_sessions').where({
      tokenHash: hashSessionToken(event.__authToken),
      userId: String(event.__actorUserId),
      active: true,
      expiresAt: _.gt(new Date())
    }).limit(2).get()
    if (sessions.data && sessions.data.length === 1) {
      const userResult = await db.collection('users').doc(String(event.__actorUserId)).get()
      const sessionUser = Array.isArray(userResult.data) ? userResult.data[0] : userResult.data
      if (sessionUser) users = [sessionUser]
    }
  }

  if (!users.length && openId) {
    const result = await db.collection('users').where(_.or([
      { openId },
      { wechatOpenId: openId },
      { _openid: openId }
    ])).limit(2).get()
    users = result.data || []
  }

  if (users.length !== 1) {
    throw new Error(users.length > 1 ? '当前微信存在重复账号，请联系管理员处理' : '登录会话已失效，请重新登录')
  }

  const user = users[0]
  openId = openId || String(user.openId || user.wechatOpenId || user._openid || '')
  return { user, openId }
}

async function findTrainingProvision(identity) {
  const user = identity.user
  const userId = user._id
  const openId = identity.openId
  const condition = _.or([{ userId }, { memberUserId: userId }, { openId }, { _openid: openId }])
  const [subscriptions, provisions] = await Promise.all([
    safeRows('training_subscriptions', condition, 5),
    safeRows('training_account_provisionings', condition, 5)
  ])
  const rows = subscriptions.concat(provisions)
  const activeRow = rows.find(function(row) {
    return canUseTraining(normalizeTrainingStatus(row))
  })
  if (activeRow) {
    return {
      status: normalizeTrainingStatus(activeRow),
      source: activeRow._id || '',
      hasBackendProvision: true
    }
  }
  // 兼容已由后台写入自然人账户的历史开通状态；绝不以手机号、页面参数或客户端值放行。
  const userStatus = normalizeTrainingStatus(user.trainingAccountStatus || user.trainingSubscriptionStatus)
  return {
    status: userStatus,
    source: userStatus === 'inactive' ? '' : 'user-compatibility',
    hasBackendProvision: canUseTraining(userStatus)
  }
}

async function loadOnboardingState(identity) {
  const user = identity.user
  const userId = user._id
  const openId = identity.openId
  const [organizationMembershipResult, directTeams, teamMembershipResult, directTournaments] = await Promise.all([
    db.collection('organization_memberships').where(_.or([{ userId }, { memberUserId: userId }, { openId }])).limit(20).get(),
    db.collection('teams').where(_.or([{ creatorId: userId }, { ownerId: userId }, { userId }, { openId }, { _openid: openId }])).limit(20).get(),
    db.collection('team_memberships').where(_.or([{ userId }, { memberUserId: userId }, { openId }])).limit(20).get(),
    db.collection('tournaments').where(_.or([{ creatorId: userId }, { organizerId: userId }, { ownerId: userId }, { userId }, { openId }, { _openid: openId }])).limit(20).get()
  ])
  const organizationMemberships = (organizationMembershipResult.data || []).filter(isActiveMembership)
  const teamMemberships = (teamMembershipResult.data || []).filter(isActiveMembership)
  const directTeamRows = directTeams.data || []
  const teamMembershipRows = teamMemberships
  const teamIds = teamMembershipRows.map(function(row) {
    return row && (row.teamId || row.team_id)
  }).filter(Boolean)
  const memberTeams = await rowsByIds('teams', teamIds, 20)
  const allTeamRows = directTeamRows.concat(memberTeams)
  const organizationIds = new Set()
  collectOrganizationIds([{ orgId: user.orgId, organizationId: user.organizationId }], organizationIds)
  collectOrganizationIds(organizationMemberships, organizationIds)
  collectOrganizationIds(allTeamRows, organizationIds)
  collectOrganizationIds(directTournaments.data || [], organizationIds)
  const organizationRows = await rowsByIds('organizations', Array.from(organizationIds).filter(function(id) {
    return String(id) !== String(userId)
  }), 20)
  const validOrganizationRows = organizationRows.filter(function(organization) {
    const organizationId = String(organization._id)
    const hasMembership = organizationMemberships.some(function(membership) {
      return String(membership.orgId || membership.organizationId || membership.organization_id || '') === organizationId
    })
    const isOwner = [organization.ownerId, organization.creatorId, organization.createdBy].some(function(value) {
      return identityMatches(value, userId)
    })
    return hasMembership || isOwner
  })
  const hasBusinessRelation = Boolean(
    validOrganizationRows.length ||
    allTeamRows.length
  )
  const trainingProvision = await findTrainingProvision(identity)
  const organizationConflict = validOrganizationRows.length > 1
  return {
    success: true,
    hasBusinessRelation,
    requiresOnboarding: !hasBusinessRelation,
    onboarding: user.onboarding || {},
    training: trainingProvision,
    organization: organizationConflict ? null : (validOrganizationRows[0] || null),
    organizationConflict,
    organizationIds: validOrganizationRows.map(function(row) { return row._id })
  }
}

async function saveScene(identity, event) {
  const scene = String(event.scene || '')
  if (['team', 'event', 'training'].indexOf(scene) < 0) throw new Error('请选择有效的业务场景')
  const onboarding = Object.assign({}, identity.user.onboarding || {}, {
    scene,
    step: 'scene_selected',
    updatedAt: db.serverDate()
  })
  await db.collection('users').doc(identity.user._id).update({
    data: { onboarding, updateTime: db.serverDate() }
  })
  return { success: true, onboarding }
}

async function loadTournamentCreateTeamInvite(identity, inviteId) {
  const id = cleanText(inviteId, 80)
  if (!id) return null
  const rows = await safeRows('team_invitations', { _id: id }, 1)
  const invite = rows[0]
  if (!invite || ['create_team_for_tournament', 'tournament_create_team'].indexOf(String(invite.type || '')) < 0) throw new Error('赛事创建球队邀请不存在或已失效')
  if (String(invite.status || 'pending') !== 'pending') throw new Error('该赛事邀请已处理或已失效')
  if (invite.inviteeUserId && String(invite.inviteeUserId) !== String(identity.user._id)) throw new Error('该赛事邀请不属于当前账号')
  if (invite.inviteeOpenId && String(invite.inviteeOpenId) !== String(identity.openId)) throw new Error('该赛事邀请不属于当前微信账号')
  const tournamentRows = await safeRows('tournaments', { _id: String(invite.tournamentId || '') }, 1)
  const tournament = tournamentRows[0]
  if (!tournament) throw new Error('受邀赛事不存在或已下线')
  return { id, invite, tournament }
}

async function previewTournamentCreateTeamInvite(identity, event) {
  const loaded = await loadTournamentCreateTeamInvite(identity, event.inviteId || event.token)
  if (!loaded) throw new Error('缺少赛事邀请')
  return { success: true, invite: { id: loaded.id, divisionName: String(loaded.invite.divisionName || ''), organizerName: String(loaded.invite.organizerName || '') }, tournament: { id: String(loaded.tournament._id), name: String(loaded.tournament.name || '') } }
}

async function createTeam(identity, event) {
  const name = cleanText(event.name, 30)
  if (name.length < 2) throw new Error('球队名称需为 2—30 个字')
  const shortName = cleanText(event.shortName, 12) || name.slice(0, 12)
  const division = cleanText(event.division, 12)
  const city = cleanText(event.city, 40)
  if (division && !/^U(?:[8-9]|1[0-6])$/.test(division)) throw new Error('年龄组无效，请重新选择')
  const originalLogo = String(event.originalLogo || '')
  const transparentLogo = String(event.transparentLogo || '')
  if ((originalLogo && originalLogo.indexOf('cloud://') !== 0) || (transparentLogo && transparentLogo.indexOf('cloud://') !== 0)) {
    throw new Error('队徽文件无效，请重新上传')
  }
  const tournamentInvite = await loadTournamentCreateTeamInvite(identity, event.tournamentCreateTeamInviteId || event.tournamentInviteId || event.inviteId)
  const state = await loadOnboardingState(identity)
  if (state.hasBusinessRelation && !tournamentInvite) throw new Error('当前账号已有业务关系，请在已有工作空间内管理球队')
  const now = db.serverDate()
  const teamResult = await db.collection('teams').add({
    data: {
      name,
      teamName: name,
      shortName,
      division,
      city,
      creatorId: identity.user._id,
      ownerId: identity.user._id,
      openId: identity.openId,
      source: 'mini_onboarding',
      claimStatus: 'claimed',
      logo: transparentLogo || originalLogo,
      logoTransparent: transparentLogo,
      logoOriginal: originalLogo,
      createTime: now,
      updateTime: now
    }
  })
  const teamId = teamResult._id
  await db.collection('team_memberships').add({
    data: {
      teamId,
      userId: identity.user._id,
      openId: identity.openId,
      status: 'active',
      roles: ['team_manager'],
      permissions: ['event.view', 'team.view', 'team.manage'],
      source: 'mini_onboarding',
      createTime: now,
      updateTime: now
    }
  })
  let registration = null
  if (tournamentInvite) {
    const existing = await safeRows('tournament_teams', { tournamentId: String(tournamentInvite.invite.tournamentId), teamId }, 1)
    if (!existing.length) {
      const createdRegistration = await db.collection('tournament_teams').add({
        data: {
          tournamentId: String(tournamentInvite.invite.tournamentId),
          teamId,
          divisionId: tournamentInvite.invite.divisionId || 'default',
          status: 'pending',
          source: 'tournament_create_team_invite',
          creatorId: identity.user._id,
          createTime: now,
          updateTime: now
        }
      })
      registration = { id: createdRegistration._id, tournamentId: String(tournamentInvite.invite.tournamentId), divisionId: tournamentInvite.invite.divisionId || 'default' }
    } else {
      registration = { id: existing[0]._id, tournamentId: String(tournamentInvite.invite.tournamentId), divisionId: existing[0].divisionId || 'default' }
    }
    await db.collection('team_invitations').doc(tournamentInvite.id).update({
      data: { status: 'accepted', acceptedChoice: 'create_new_team', acceptedTeamId: teamId, acceptedUserId: identity.user._id, acceptedOpenId: identity.openId, updateTime: now }
    })
  }
  const onboarding = Object.assign({}, identity.user.onboarding || {}, {
    scene: 'team',
    step: 'team_created',
    teamId,
    completedAt: now
  })
  await db.collection('users').doc(identity.user._id).update({
    data: { onboarding, updateTime: now }
  })
  return {
    success: true,
    team: { id: teamId, name, logo: transparentLogo || originalLogo, originalLogo, transparentLogo },
    workspaceId: 'team:' + teamId,
    registration
  }
}

async function createEventSpace(identity, event) {
  const name = cleanText(event.name, 50)
  const city = cleanText(event.city, 40)
  if (name.length < 2) throw new Error('赛事名称至少需要 2 个字符')
  if (!city) throw new Error('请填写举办城市')
  const originalLogo = String(event.originalLogo || '')
  const transparentLogo = String(event.transparentLogo || '')
  if ((originalLogo && originalLogo.indexOf('cloud://') !== 0) || (transparentLogo && transparentLogo.indexOf('cloud://') !== 0)) {
    throw new Error('赛事标识文件无效，请重新上传')
  }
  const state = await loadOnboardingState(identity)
  if (state.organization) {
    const access = await organizationAccess(identity, state.organization)
    if (!access.canEvent) throw new Error('当前账号没有在此机构创建赛事的权限，请联系机构负责人授权')
    const orgId = String(state.organization._id || state.organization.id)
    const now = db.serverDate()
    const capabilities = Array.from(new Set((Array.isArray(state.organization.capabilities) ? state.organization.capabilities : []).concat('event')))
    await db.collection('organizations').doc(orgId).update({
      data: { capabilities, updateTime: now }
    })
    const tournamentResult = await db.collection('tournaments').add({
      data: {
        name,
        city,
        venueCity: city,
        orgId,
        creatorId: identity.user._id,
        organizerId: identity.user._id,
        ownerId: identity.user._id,
        logo: transparentLogo || originalLogo,
        logoTransparent: transparentLogo,
        logoOriginal: originalLogo,
        status: 'draft',
        source: 'pc_onboarding_existing_organization',
        createTime: now,
        updateTime: now
      }
    })
    const tournamentId = tournamentResult._id
    const onboarding = Object.assign({}, identity.user.onboarding || {}, {
      scene: 'event',
      step: 'event_created',
      orgId,
      tournamentId,
      completedAt: now
    })
    await db.collection('users').doc(identity.user._id).update({
      data: { orgId, onboarding, updateTime: now }
    })
    return {
      success: true,
      organizationId: orgId,
      reusedOrganization: true,
      organization: { id: orgId, name: state.organization.name || state.organization.organizationName || '', logo: state.organization.logo || '' },
      tournament: { id: tournamentId, name, city, logo: transparentLogo || originalLogo }
    }
  }
  if (state.hasBusinessRelation) {
    throw new Error('当前账号已有业务关系，请在已有机构工作空间内管理赛事')
  }
  const now = db.serverDate()
  const organizationResult = await db.collection('organizations').add({
    data: {
      name: name + '主办方',
      organizationName: name + '主办方',
      capabilities: ['event'],
      logo: transparentLogo || originalLogo,
      creatorId: identity.user._id,
      createTime: now,
      updateTime: now
    }
  })
  const orgId = organizationResult._id
  await db.collection('organization_memberships').add({
    data: {
      orgId,
      userId: identity.user._id,
      openId: identity.openId,
      status: 'active',
      positions: ['机构负责人'],
      permissions: ['event.view', 'event.manage'],
      capabilities: ['event'],
      createTime: now,
      updateTime: now
    }
  })
  const tournamentResult = await db.collection('tournaments').add({
    data: {
      name,
      city,
      venueCity: city,
      orgId,
      creatorId: identity.user._id,
      organizerId: identity.user._id,
      ownerId: identity.user._id,
      logo: transparentLogo || originalLogo,
      logoTransparent: transparentLogo,
      logoOriginal: originalLogo,
      status: 'draft',
      source: 'pc_onboarding',
      createTime: now,
      updateTime: now
    }
  })
  const tournamentId = tournamentResult._id
  const onboarding = Object.assign({}, identity.user.onboarding || {}, {
    scene: 'event',
    step: 'event_created',
    orgId,
    tournamentId,
    completedAt: now
  })
  await db.collection('users').doc(identity.user._id).update({
    data: { orgId, onboarding, updateTime: now }
  })
  return {
    success: true,
    organizationId: orgId,
    organization: { id: orgId, name: name + '主办方', logo: transparentLogo || originalLogo },
    tournament: { id: tournamentId, name, city, logo: transparentLogo || originalLogo }
  }
}

async function createTrainingWorkspace(identity, event) {
  const name = cleanText(event.name, 50)
  if (name.length < 2) throw new Error('机构名称需为 2–50 个字')
  const originalLogo = String(event.originalLogo || '')
  const transparentLogo = String(event.transparentLogo || '')
  if ((originalLogo && originalLogo.indexOf('cloud://') !== 0) || (transparentLogo && transparentLogo.indexOf('cloud://') !== 0)) {
    throw new Error('机构标识文件无效，请重新上传')
  }
  const state = await loadOnboardingState(identity)
  const training = state.training || {}
  if (!training.hasBackendProvision || !canUseTraining(training.status)) {
    throw new Error('当前机构尚未完成有效青训开户，无法创建青训空间')
  }
  if (state.organization) {
    const access = await organizationAccess(identity, state.organization)
    if (!access.canTraining) throw new Error('当前账号没有在此机构开通青训能力的权限，请联系机构负责人授权')
    const orgId = String(state.organization._id || state.organization.id)
    const now = db.serverDate()
    const capabilities = Array.from(new Set((Array.isArray(state.organization.capabilities) ? state.organization.capabilities : []).concat('education')))
    const entitlements = Object.assign({}, state.organization.entitlements || {}, {
      training: { status: training.status, source: training.source }
    })
    await db.collection('organizations').doc(orgId).update({
      data: {
        capabilities,
        entitlements,
        trainingSubscriptionStatus: training.status,
        updateTime: now
      }
    })
    const onboarding = Object.assign({}, identity.user.onboarding || {}, {
      scene: 'training', step: 'training_created', orgId, completedAt: now
    })
    await db.collection('users').doc(identity.user._id).update({
      data: { orgId, onboarding, updateTime: now }
    })
    return {
      success: true,
      reusedOrganization: true,
      organization: { id: orgId, name: state.organization.name || state.organization.organizationName || name, logo: state.organization.logo || '' },
      workspaceId: 'org:' + orgId,
      trainingStatus: training.status
    }
  }
  if (state.hasBusinessRelation) {
    throw new Error('当前账号已有业务关系，请在已有机构内开通青训能力')
  }
  const now = db.serverDate()
  const organizationResult = await db.collection('organizations').add({
    data: {
      name,
      organizationName: name,
      capabilities: ['education'],
      entitlements: { training: { status: training.status, source: training.source } },
      trainingSubscriptionStatus: training.status,
      logo: transparentLogo || originalLogo,
      logoTransparent: transparentLogo,
      logoOriginal: originalLogo,
      creatorId: identity.user._id,
      source: 'mini_onboarding_training',
      createTime: now,
      updateTime: now
    }
  })
  const orgId = organizationResult._id
  await db.collection('organization_memberships').add({
    data: {
      orgId,
      userId: identity.user._id,
      openId: identity.openId,
      status: 'active',
      positions: ['机构负责人'],
      permissions: ['workspace.manage', 'education.view', 'education.manage', 'education.execute'],
      capabilities: ['education'],
      source: 'mini_onboarding_training',
      createTime: now,
      updateTime: now
    }
  })
  const onboarding = Object.assign({}, identity.user.onboarding || {}, {
    scene: 'training', step: 'training_created', orgId, completedAt: now
  })
  await db.collection('users').doc(identity.user._id).update({
    data: { orgId, onboarding, updateTime: now }
  })
  return {
    success: true,
    organization: { id: orgId, name, logo: transparentLogo || originalLogo },
    workspaceId: 'org:' + orgId,
    trainingStatus: training.status
  }
}

async function createTrainingConsultation(identity) {
  const condition = _.or([
    { userId: identity.user._id, status: 'pending' },
    { openId: identity.openId, status: 'pending' }
  ])
  const existing = await safeRows('training_consultation_requests', condition, 1)
  if (existing.length) return { success: true, requestId: existing[0]._id, duplicate: true }
  const result = await db.collection('training_consultation_requests').add({
    data: {
      userId: identity.user._id,
      openId: identity.openId,
      status: 'pending',
      intent: 'training_onboarding',
      source: 'mini_onboarding',
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }
  })
  return { success: true, requestId: result._id, duplicate: false }
}

exports.main = async function(event) {
  event = event || {}
  try {
    const identity = await currentUser(event)
    if (event.action === 'state') return await loadOnboardingState(identity)
    if (event.action === 'saveScene') return await saveScene(identity, event)
    if (event.action === 'createTeam') return await createTeam(identity, event)
    if (event.action === 'previewTournamentCreateTeamInvite') return await previewTournamentCreateTeamInvite(identity, event)
    if (event.action === 'createEventSpace') return await createEventSpace(identity, event)
    if (event.action === 'createTrainingWorkspace') return await createTrainingWorkspace(identity, event)
    if (event.action === 'createTrainingConsultation') return await createTrainingConsultation(identity)
    return { success: false, message: '不支持的引导操作' }
  } catch (error) {
    console.error('[onboardingWorkspace] failed:', error.message)
    return { success: false, message: error.message || '首次使用引导操作失败' }
  }
}
