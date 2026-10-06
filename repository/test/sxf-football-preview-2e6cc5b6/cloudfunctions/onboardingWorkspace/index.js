const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const { chooseOrganizerOrganization } = require('./organizationScope.cjs')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const ORGANIZATION_TYPES = {
  event_company: '赛事公司',
  club: '足球俱乐部',
  school: '学校',
  association: '足协/体育组织',
  other: '其他机构'
}

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
    canManageWorkspace: Boolean(isOwner || (membership && hasPermission(membership, 'workspace.manage'))),
    canEvent: Boolean(isOwner || (membership && hasPermission(membership, 'event.manage'))),
    canTraining: Boolean(isOwner || (membership && (hasPermission(membership, 'education.manage') || hasPermission(membership, 'workspace.manage'))))
  }
}

async function updateProfile(identity, event) {
  const nickname = cleanText(event.nickname, 30)
  if (!nickname) throw new Error('请输入账号显示名称')
  await db.collection('users').doc(String(identity.user._id)).update({
    data: { nickname, userName: nickname, updateTime: db.serverDate() }
  })
  return { success: true, user: { id: identity.user._id, nickname } }
}

async function updateOrganization(identity, event) {
  const name = cleanText(event.name, 80)
  const organizationType = cleanText(event.organizationType, 30)
  const province = cleanText(event.province, 40)
  const provinceCode = cleanText(event.provinceCode, 12)
  const city = cleanText(event.city, 40)
  if (name.length < 2) throw new Error('机构名称需为 2–80 个字')
  if (!ORGANIZATION_TYPES[organizationType]) throw new Error('请选择机构类型')
  if (!province || !provinceCode || !city) throw new Error('请选择机构所在省份和城市')
  const state = await loadOnboardingState(identity)
  if (!state.organization) throw new Error('当前账号尚未建立机构')
  const access = await organizationAccess(identity, state.organization)
  if (!access.canManageWorkspace) throw new Error('只有机构负责人可以修改机构资料')
  const orgId = String(state.organization._id || state.organization.id)
  await db.collection('organizations').doc(orgId).update({
    data: {
      name,
      organizationName: name,
      organizationType,
      organizationTypeName: ORGANIZATION_TYPES[organizationType],
      province,
      provinceCode,
      city,
      updateTime: db.serverDate()
    }
  })
  return {
    success: true,
    organization: {
      id: orgId,
      name,
      organizationType,
      organizationTypeName: ORGANIZATION_TYPES[organizationType],
      province,
      provinceCode,
      city,
      capabilities: Array.isArray(state.organization.capabilities) ? state.organization.capabilities : []
    }
  }
}

async function grantMembershipPermissions(identity, organizationId, permissionsToAdd, capabilitiesToAdd) {
  const userId = String(identity.user._id)
  const rows = await safeRows('organization_memberships', _.or([
    { orgId: organizationId, userId },
    { organizationId, userId },
    { organization_id: organizationId, userId }
  ]), 20)
  const membership = rows.find(isActiveMembership)
  if (!membership) return
  const permissions = Array.from(new Set((Array.isArray(membership.permissions) ? membership.permissions : []).concat(permissionsToAdd || [])))
  const capabilities = Array.from(new Set((Array.isArray(membership.capabilities) ? membership.capabilities : []).concat(capabilitiesToAdd || [])))
  await db.collection('organization_memberships').doc(String(membership._id)).update({
    data: { permissions, capabilities, updateTime: db.serverDate() }
  })
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
  const phone = String(user.phone || user.phoneNumber || '')
  const conditions = [{ userId }, { memberUserId: userId }]
  if (phone) conditions.push({ phone }, { phoneNumber: phone })
  const condition = _.or(conditions)
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
  const phone = String(user.phone || user.phoneNumber || '')
  const membershipConditions = [{ userId }, { memberUserId: userId }]
  if (phone) membershipConditions.push({ phone }, { phoneNumber: phone })
  const [organizationMembershipResult, directTeams, rawTeamMembershipRows, directTournaments] = await Promise.all([
    db.collection('organization_memberships').where(_.or(membershipConditions)).limit(20).get(),
    db.collection('teams').where(_.or([{ creatorId: userId }, { ownerId: userId }, { userId }])).limit(50).get(),
    safeRows('team_memberships', _.or(membershipConditions), 100),
    db.collection('tournaments').where(_.or([{ creatorId: userId }, { organizerId: userId }, { ownerId: userId }, { userId }])).limit(20).get()
  ])
  const organizationMemberships = (organizationMembershipResult.data || []).filter(isActiveMembership)
  const teamMemberships = (rawTeamMembershipRows || []).filter(isActiveMembership)
  const directTeamRows = directTeams.data || []
  const teamMembershipRows = teamMemberships
  const teamIds = teamMembershipRows.map(function(row) {
    return row && (row.teamId || row.team_id)
  }).filter(Boolean)
  const memberTeams = await rowsByIds('teams', teamIds, 20)
  const allTeamMap = {}
  directTeamRows.concat(memberTeams).forEach(function(team) {
    if (team && team._id) allTeamMap[String(team._id)] = team
  })
  const allTeamRows = Object.keys(allTeamMap).map(function(id) { return allTeamMap[id] })
  const manageableTeams = allTeamRows.filter(function(team) {
    const teamId = String(team._id || '')
    const directOwner = [team.ownerId, team.creatorId, team.userId].some(function(value) {
      return identityMatches(value, userId)
    })
    const membership = teamMembershipRows.find(function(row) {
      return String(row.teamId || row.team_id || '') === teamId
    })
    const roles = Array.isArray(membership && membership.roles) ? membership.roles : []
    const role = String(membership && membership.role || '')
    return directOwner || Boolean(membership && (
      hasPermission(membership, 'team.manage') ||
      roles.indexOf('owner') >= 0 || roles.indexOf('team_manager') >= 0 ||
      role === 'owner' || role === 'team_manager'
    ))
  }).map(function(team) {
    const teamId = String(team._id)
    const membership = teamMembershipRows.find(function(row) {
      return String(row.teamId || row.team_id || '') === teamId
    })
    const teamOrgId = String(team.orgId || team.organizationId || '')
    return {
      id: teamId,
      name: String(team.name || team.teamName || '未命名球队'),
      logo: String(team.logo || team.logoUrl || ''),
      orgId: teamOrgId,
      attachable: !teamOrgId,
      membershipId: membership && membership._id ? String(membership._id) : ''
    }
  })
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
  const hasTeamRelation = allTeamRows.length > 0
  const trainingProvision = await findTrainingProvision(identity)
  const choice = chooseOrganizerOrganization({
    validIds: validOrganizationRows.map(row => row._id),
    explicitIds: [user.orgId, user.organizationId],
    memberships: organizationMemberships,
    tournamentOrgIds: (directTournaments.data || []).map(row => row.orgId || row.organizationId || row.organization_id)
  })
  const organizationConflict = choice.organizationConflict
  const selectedOrgId = choice.orgId || (!organizationConflict && validOrganizationRows.length === 1 ? String(validOrganizationRows[0]._id) : '')
  const organization = validOrganizationRows.find(row => String(row._id) === selectedOrgId) || null
  const attachableTeams = manageableTeams.filter(function(team) { return team.attachable })
  const hasTournamentWithoutOrganization = !organization && (directTournaments.data || []).length > 0
  const canCreateOrganizationFromTeams = Boolean(
    !organizationConflict && !organization && attachableTeams.length && !hasTournamentWithoutOrganization
  )
  const capabilities = Array.isArray(organization && organization.capabilities) ? organization.capabilities : []
  const hasWorkspaceCapability = capabilities.indexOf('event') >= 0 || capabilities.indexOf('education') >= 0
  return {
    success: true,
    hasBusinessRelation,
    hasTeamRelation,
    manageableTeams,
    canCreateOrganizationFromTeams,
    hasTournamentWithoutOrganization,
    // 多机构账号已有真实业务关系，不能被当成“无机构账号”再次引导创建机构。
    requiresOnboarding: !organizationConflict && !hasTeamRelation && (!organization || !hasWorkspaceCapability),
    onboarding: user.onboarding || {},
    training: trainingProvision,
    organization,
    organizationConflict,
    organizationIds: validOrganizationRows.map(function(row) { return row._id })
  }
}

async function createOrganization(identity, event) {
  const name = cleanText(event.name, 80)
  const organizationType = cleanText(event.organizationType, 30)
  const province = cleanText(event.province, 40)
  const provinceCode = cleanText(event.provinceCode, 12)
  const city = cleanText(event.city, 40)
  if (name.length < 2) throw new Error('机构名称需为 2–80 个字')
  if (!ORGANIZATION_TYPES[organizationType]) throw new Error('请选择机构类型')
  if (!province || !provinceCode || !city) throw new Error('请选择机构所在省份和城市')
  const state = await loadOnboardingState(identity)
  if (state.organization) {
    const access = await organizationAccess(identity, state.organization)
    if (!access.isMember) throw new Error('当前账号没有此机构的访问权限')
    return {
      success: true,
      duplicate: true,
      organization: {
        id: state.organization._id || state.organization.id,
        name: state.organization.name || state.organization.organizationName || '',
        organizationType: state.organization.organizationType || '',
        province: state.organization.province || '',
        provinceCode: state.organization.provinceCode || '',
        city: state.organization.city || ''
      }
    }
  }
  const requestedTeamIds = Array.from(new Set((Array.isArray(event.attachTeamIds) ? event.attachTeamIds : [])
    .map(function(value) { return String(value || '').trim() }).filter(Boolean)))
  const attachableTeamMap = {}
  ;(state.manageableTeams || []).filter(function(team) { return team.attachable }).forEach(function(team) {
    attachableTeamMap[String(team.id)] = team
  })
  if (state.hasBusinessRelation && !state.canCreateOrganizationFromTeams) {
    throw new Error('当前业务关系不满足自助创建机构条件，请先完成人工归属核验')
  }
  if (requestedTeamIds.some(function(teamId) { return !attachableTeamMap[teamId] })) {
    throw new Error('选中球队不属于当前账号，或已归属其他机构')
  }
  const now = db.serverDate()
  const result = await db.runTransaction(async function(transaction) {
    for (const teamId of requestedTeamIds) {
      const teamResult = await transaction.collection('teams').doc(teamId).get()
      const team = Array.isArray(teamResult.data) ? teamResult.data[0] : teamResult.data
      if (!team) throw new Error('选中球队不存在')
      if (String(team.orgId || team.organizationId || '')) throw new Error('选中球队已归属其他机构')
    }
    const organizationCapabilities = requestedTeamIds.length ? ['team'] : []
    const organizationResult = await transaction.collection('organizations').add({
      data: {
        name,
        organizationName: name,
        organizationType,
        organizationTypeName: ORGANIZATION_TYPES[organizationType],
        province,
        provinceCode,
        city,
        capabilities: organizationCapabilities,
        creatorId: identity.user._id,
        ownerId: identity.user._id,
        source: 'pc_wechat_onboarding',
        createTime: now,
        updateTime: now
      }
    })
    const orgId = organizationResult._id
    await transaction.collection('organization_memberships').add({
      data: {
        orgId,
        userId: identity.user._id,
        status: 'active',
        positions: ['机构负责人'],
        permissions: requestedTeamIds.length
          ? ['workspace.manage', 'team.view', 'team.manage']
          : ['workspace.manage'],
        capabilities: organizationCapabilities,
        source: 'pc_wechat_onboarding',
        createTime: now,
        updateTime: now
      }
    })
    for (const teamId of requestedTeamIds) {
      await transaction.collection('teams').doc(teamId).update({
        data: { orgId, organizationId: orgId, updateTime: now }
      })
      const membershipId = attachableTeamMap[teamId] && attachableTeamMap[teamId].membershipId
      if (membershipId) {
        await transaction.collection('team_memberships').doc(membershipId).update({
          data: { orgId, organizationId: orgId, updateTime: now }
        })
      }
    }
    const onboarding = Object.assign({}, identity.user.onboarding || {}, {
      scene: 'organization',
      step: 'organization_created',
      orgId,
      updatedAt: now
    })
    await transaction.collection('users').doc(identity.user._id).update({
      data: { orgId, organizationId: orgId, onboarding, updateTime: now }
    })
    return { orgId, attachedTeamIds: requestedTeamIds }
  })
  return {
    success: true,
    organization: {
      id: result.orgId,
      name,
      organizationType,
      organizationTypeName: ORGANIZATION_TYPES[organizationType],
      province,
      provinceCode,
      city,
      capabilities: result.attachedTeamIds.length ? ['team'] : []
    },
    attachedTeams: (state.manageableTeams || []).filter(function(team) {
      return result.attachedTeamIds.indexOf(String(team.id)) >= 0
    }).map(function(team) { return { id: team.id, name: team.name } })
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
  const organization = await provisionEventWorkspace(identity, scene)
  return { success: true, onboarding, organization }
}

// 选择“赛事”业务即开通赛事空间能力，首个赛事由赛事空间内的创建入口建立
async function provisionEventWorkspace(identity, scene) {
  if (scene !== 'event') return null
  const state = await loadOnboardingState(identity)
  const organization = state.organization
  if (!organization) return null
  const access = await organizationAccess(identity, organization)
  if (!access.canEvent) return null
  const orgId = String(organization._id || organization.id)
  const capabilities = Array.from(new Set((Array.isArray(organization.capabilities) ? organization.capabilities : []).concat('event')))
  await db.collection('organizations').doc(orgId).update({
    data: { capabilities, updateTime: db.serverDate() }
  })
  await grantMembershipPermissions(identity, orgId, ['event.view', 'event.manage'], ['event'])
  return {
    id: orgId,
    name: organization.name || organization.organizationName || '',
    organizationType: organization.organizationType || '',
    province: organization.province || '',
    provinceCode: organization.provinceCode || '',
    city: organization.city || '',
    capabilities
  }
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
  const userId = String(identity.user._id)
  const ownedTeams = await safeRows('teams', _.or([
    { creatorId: userId },
    { ownerId: userId },
    { openId: identity.openId }
  ]), 50)
  const existingMemberships = await safeRows('team_memberships', _.or([
    { userId },
    { memberUserId: userId },
    { openId: identity.openId }
  ]), 100)
  const completedTeamIds = new Set(existingMemberships.filter(isActiveMembership).map(function(membership) {
    return String(membership.teamId || membership.team_id || '')
  }).filter(Boolean))
  const incompleteOnboardingTeams = ownedTeams.filter(function(team) {
    return String(team.source || '') === 'mini_onboarding' &&
      !completedTeamIds.has(String(team._id || '')) &&
      [team.creatorId, team.ownerId, team.openId].some(function(value) {
        return String(value || '') === userId || String(value || '') === String(identity.openId || '')
      })
  })
  const retryTeam = incompleteOnboardingTeams.find(function(team) {
    return cleanText(team.name || team.teamName, 30) === name
  }) || (!state.organization && completedTeamIds.size === 0 && incompleteOnboardingTeams.length === 1
    ? incompleteOnboardingTeams[0]
    : null)
  const completedSameNameTeam = ownedTeams.find(function(team) {
    return completedTeamIds.has(String(team._id || '')) && cleanText(team.name || team.teamName, 30) === name
  })
  if (completedSameNameTeam && !retryTeam) throw new Error('你已管理同名球队，请直接选择已有球队继续报名')
  const now = db.serverDate()
  let teamId = retryTeam ? String(retryTeam._id) : ''
  if (retryTeam) {
    await db.collection('teams').doc(teamId).update({
      data: {
        name,
        teamName: name,
        shortName,
        division,
        city,
        logo: transparentLogo || originalLogo || retryTeam.logo || '',
        logoTransparent: transparentLogo || retryTeam.logoTransparent || '',
        logoOriginal: originalLogo || retryTeam.logoOriginal || '',
        updateTime: now
      }
    })
  } else {
    const teamResult = await db.collection('teams').add({ data: {
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
    } })
    teamId = teamResult._id
  }
  const memberships = await safeRows('team_memberships', _.or([
    { teamId, userId },
    { teamId, memberUserId: userId },
    { teamId, openId: identity.openId }
  ]), 5)
  if (!memberships.some(isActiveMembership)) {
    try {
      await db.collection('team_memberships').add({ data: {
      teamId,
      userId,
      memberUserId: userId,
      openId: identity.openId,
      role: 'owner',
      status: 'accepted',
      roles: ['owner', 'team_manager'],
      permissions: ['event.view', 'team.view', 'team.manage'],
      source: 'mini_onboarding',
      createTime: now,
      updateTime: now
      } })
    } catch (error) {
      if (/collection.+not exist|DATABASE_COLLECTION_NOT_EXIST|ResourceNotFound/i.test(String(error && (error.message || error.errMsg) || error))) {
        throw new Error('球队负责人关系尚未初始化，请联系平台管理员后重试；已填写的球队资料不会重复创建')
      }
      throw error
    }
  }
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
  const province = cleanText(event.province, 40)
  const provinceCode = cleanText(event.provinceCode, 12)
  const city = cleanText(event.city, 40)
  if (name.length < 2) throw new Error('赛事名称至少需要 2 个字符')
  if (!province || !provinceCode || !city) throw new Error('请选择举办省份和城市')
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
    await grantMembershipPermissions(identity, orgId, ['event.view', 'event.manage'], ['event'])
    const tournamentResult = await db.collection('tournaments').add({
      data: {
        name,
        province,
        provinceCode,
        city,
        venueProvince: province,
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
      tournament: { id: tournamentId, name, province, city, logo: transparentLogo || originalLogo }
    }
  }
  throw new Error('请先创建机构信息，再创建赛事空间')
}

async function createTrainingWorkspace(identity, event) {
  const originalLogo = String(event.originalLogo || '')
  const transparentLogo = String(event.transparentLogo || '')
  if ((originalLogo && originalLogo.indexOf('cloud://') !== 0) || (transparentLogo && transparentLogo.indexOf('cloud://') !== 0)) {
    throw new Error('机构标识文件无效，请重新上传')
  }
  const state = await loadOnboardingState(identity)
  if (!state.organization) throw new Error('请先创建机构信息，再开通青训能力')
  const name = cleanText(event.name || state.organization.name || state.organization.organizationName, 80)
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
    await grantMembershipPermissions(identity, orgId, ['education.view', 'education.manage', 'education.execute'], ['education'])
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
  throw new Error('请先创建机构信息，再开通青训能力')
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

function inboxTimestamp(value) {
  const raw = value && typeof value === 'object' && value.$date ? value.$date : value
  const timestamp = new Date(raw || 0).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

async function organizerInboxList(identity) {
  const recipientUserId = String(identity.user._id || '')
  let rows = []
  try {
    const result = await db.collection('platform_inbox_messages')
      .where({ recipientUserId })
      .orderBy('createTime', 'desc')
      .limit(100)
      .get()
    rows = result.data || []
  } catch (error) {
    const message = String(error && (error.message || error.errMsg) || '').toLowerCase()
    const code = String(error && (error.code || error.errCode) || '').toLowerCase()
    const missing = code.includes('collection_not_exist') || code.includes('resourcenotfound') ||
      message.includes('collection not exist') || message.includes('collection does not exist') ||
      message.includes('table not exist') || message.includes('not found collection')
    if (!missing) throw error
  }
  const messages = rows.map(row => ({
    _id: String(row._id || ''),
    title: String(row.title || ''),
    body: String(row.body || ''),
    linkPath: String(row.linkPath || ''),
    linkLabel: String(row.linkLabel || '查看'),
    readAt: row.readAt || null,
    createTime: row.createTime || null
  })).sort((a, b) => inboxTimestamp(b.createTime) - inboxTimestamp(a.createTime))
  return { success: true, data: { messages, unreadCount: messages.filter(item => !item.readAt).length } }
}

async function organizerInboxMarkRead(identity, event) {
  const messageId = String(event.messageId || '').trim()
  const recipientUserId = String(identity.user._id || '')
  if (!messageId) return { success: false, error: '缺少站内信标识', code: 'INBOX_MESSAGE_ID_REQUIRED' }
  let found
  try {
    const result = await db.collection('platform_inbox_messages').doc(messageId).get()
    found = Array.isArray(result.data) ? result.data[0] : result.data
  } catch (error) {
    return { success: false, error: '站内信不存在', code: 'INBOX_MESSAGE_NOT_FOUND' }
  }
  if (!found || String(found.recipientUserId || '') !== recipientUserId) {
    return { success: false, error: '站内信不存在或无权查看', code: 'INBOX_MESSAGE_SCOPE_DENIED' }
  }
  if (found.readAt) return { success: true, data: { messageId, readAt: found.readAt }, alreadyRead: true }
  const readAt = db.serverDate()
  await db.collection('platform_inbox_messages').doc(messageId).update({
    data: { readAt, status: 'read', updateTime: readAt }
  })
  const latest = identity.user.lastPlatformNotice
  if (latest && String(latest.messageId || '') === messageId) {
    await db.collection('users').doc(recipientUserId).update({
      data: { lastPlatformNotice: { ...latest, readAt }, updateTime: readAt }
    })
  }
  return { success: true, data: { messageId, readAt } }
}

exports.main = async function(event) {
  event = event || {}
  try {
    const identity = await currentUser(event)
    if (event.action === 'state') return await loadOnboardingState(identity)
    if (event.action === 'organizerInboxList') return await organizerInboxList(identity)
    if (event.action === 'organizerInboxMarkRead') return await organizerInboxMarkRead(identity, event)
    if (event.action === 'updateProfile') return await updateProfile(identity, event)
    if (event.action === 'updateOrganization') return await updateOrganization(identity, event)
    if (event.action === 'createOrganization') return await createOrganization(identity, event)
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
