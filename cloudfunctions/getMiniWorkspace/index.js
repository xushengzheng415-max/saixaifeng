// 小程序机构工作空间聚合入口。
// 当前兼容 users.orgId；未来 organization_memberships / organizations 建立后可直接接管。
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

function unique(list) {
  return Array.from(new Set((list || []).filter(Boolean).map(String)))
}

function firstValue() {
  for (let i = 0; i < arguments.length; i += 1) {
    if (arguments[i] !== undefined && arguments[i] !== null && arguments[i] !== '') {
      return arguments[i]
    }
  }
  return ''
}

function workspaceError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function toTime(value) {
  if (!value) return 0
  if (value instanceof Date) return value.getTime()
  if (value.$date) return new Date(value.$date).getTime()
  if (value._date) return new Date(value._date).getTime()
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

function prebuiltInviteExpiry(invite, tournament) {
  return invite && (invite.inviteExpireAt || invite.expiresAt || (tournament && (tournament.registrationDeadline || tournament.signupDeadline || tournament.endDate)))
}

function assertPrebuiltInviteActive(invite, tournament) {
  const expiry = prebuiltInviteExpiry(invite, tournament)
  if (expiry && toTime(expiry) > 0 && toTime(expiry) <= Date.now()) throw workspaceError('TEAM_INVITE_EXPIRED', '认领邀请已过期，请让赛事主办方重新生成')
}

function dateText(value) {
  const time = toTime(value)
  if (!time) return '时间待定'
  const date = new Date(time)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return month + '-' + day + ' ' + hour + ':' + minute
}

function maskPhone(value) {
  const phone = String(value || '')
  return /^1\d{10}$/.test(phone) ? phone.slice(0, 3) + '****' + phone.slice(-4) : ''
}

function normalizeClaimReviewProofMaterials(event, inviteId) {
  const allowedTypes = ['authorization', 'club_certificate', 'tournament_invite']
  const prefix = '/claim-review-proofs/' + String(inviteId || '') + '/'
  const rows = Array.isArray(event && event.proofMaterials) ? event.proofMaterials : []
  return rows.map(function(item) {
    const material = item || {}
    const fileId = String(material.fileId || material.fileID || '').trim()
    const proofType = String(material.proofType || '').trim()
    const size = Number(material.size || 0)
    if (!fileId || fileId.indexOf('cloud://') !== 0 || fileId.indexOf(prefix) < 0) return null
    if (allowedTypes.indexOf(proofType) < 0 || (size && size > 8 * 1024 * 1024)) return null
    return {
      fileId,
      proofType,
      fileName: String(material.fileName || material.name || '证明材料').trim().slice(0, 120),
      size: size > 0 ? Math.floor(size) : 0,
      mimeType: String(material.mimeType || 'image/*').slice(0, 80)
    }
  }).filter(Boolean).slice(0, 3)
}

async function safeGet(collection, where, limit) {
  try {
    let query = db.collection(collection)
    if (where) query = query.where(where)
    const result = await query.limit(limit || 100).get()
    return result.data || []
  } catch (error) {
    console.warn('[getMiniWorkspace] query skipped:', collection, error.message)
    return []
  }
}

async function findCurrentUser() {
  const context = cloud.getWXContext()
  const openId = context.OPENID || ''
  if (!openId) throw new Error('无法识别当前微信账号')
  const result = await db.collection('users')
    .where(_.or([{ openId }, { openid: openId }, { _openid: openId }]))
    .limit(3)
    .get()
  const users = (result.data || []).filter((item, index, rows) => rows.findIndex(other => String(other._id) === String(item._id)) === index)
  if (users.length !== 1) {
    throw workspaceError(users.length > 1 ? 'WECHAT_ACCOUNT_CONFLICT' : 'PHONE_AUTH_REQUIRED', users.length > 1 ? '当前微信存在重复账号，请联系管理员处理' : '登录状态已失效，请重新授权手机号')
  }
  const user = users[0]
  const phone = String(firstValue(user.phone, user.phoneNumber))
  if (!/^1[3-9]\d{9}$/.test(phone)) throw workspaceError('PHONE_AUTH_REQUIRED', '当前账号未完成手机号验证，请重新登录')
  const phoneResult = await db.collection('users').where(_.or([{ phone }, { phoneNumber: phone }])).limit(3).get()
  const phoneUsers = (phoneResult.data || []).filter((item, index, rows) => rows.findIndex(other => String(other._id) === String(item._id)) === index)
  if (phoneUsers.length > 1) throw workspaceError('PHONE_ACCOUNT_CONFLICT', '当前手机号存在重复账号，请联系管理员核验')
  if (phoneUsers.length !== 1 || String(phoneUsers[0]._id) !== String(user._id)) {
    throw workspaceError('ACCOUNT_IDENTITY_CONFLICT', '微信与手机号指向不同账号，已阻止访问')
  }
  return { user, openId, phone }
}

function normalizeCapabilityValues() {
  const result = []
  const aliases = {
    tournament: 'event',
    tournaments: 'event',
    organizer: 'event',
    event: 'event',
    team: 'team',
    teams: 'team',
    club: 'team',
    education: 'education',
    teaching: 'education',
    academic: 'education',
    finance: 'finance'
  }
  for (let i = 0; i < arguments.length; i += 1) {
    const source = arguments[i]
    if (Array.isArray(source)) {
      source.forEach(item => {
        const value = aliases[String(item).toLowerCase()]
        if (value) result.push(value)
      })
    } else if (source && typeof source === 'object') {
      Object.keys(source).forEach(key => {
        if (!source[key]) return
        const value = aliases[String(key).toLowerCase()]
        if (value) result.push(value)
      })
    }
  }
  return unique(result)
}

function normalizeEntitlementStatus(value) {
  if (value === true) return 'active'
  if (value === false || value === null || value === undefined || value === '') return 'inactive'
  if (typeof value === 'object') {
    return normalizeEntitlementStatus(
      firstValue(value.status, value.subscriptionStatus, value.state, value.enabled)
    )
  }
  const status = String(value).toLowerCase()
  if (['active', 'enabled', 'paid', 'trial', 'trialing'].indexOf(status) >= 0) {
    return status === 'trialing' ? 'trial' : status
  }
  return 'inactive'
}

function buildEntitlements(organization, membership, capabilities) {
  const organizationEntitlements = organization.entitlements || {}
  const membershipEntitlements = (membership && membership.entitlements) || {}
  const trainingValues = [
    organizationEntitlements.training,
    organizationEntitlements.education,
    organization.trainingSubscription,
    organization.educationSubscription,
    organization.trainingSubscriptionStatus,
    organization.educationSubscriptionStatus,
    membershipEntitlements.training,
    membershipEntitlements.education
  ]
  let explicitTrainingValue = ''
  let hasExplicitTrainingValue = false
  for (let i = 0; i < trainingValues.length; i += 1) {
    if (trainingValues[i] !== undefined && trainingValues[i] !== null && trainingValues[i] !== '') {
      explicitTrainingValue = trainingValues[i]
      hasExplicitTrainingValue = true
      break
    }
  }
  let trainingStatus = normalizeEntitlementStatus(explicitTrainingValue)
  if (!hasExplicitTrainingValue && capabilities.indexOf('education') >= 0) {
    // 兼容已用 capability 表示开通状态的历史机构。
    trainingStatus = 'active'
  }
  return {
    event: {
      collaboration: 'free',
      professionalUnit: 'division'
    },
    training: {
      status: trainingStatus,
      canUse: ['active', 'enabled', 'paid', 'trial'].indexOf(trainingStatus) >= 0
    }
  }
}

function normalizePositions(membership, fallbackOwner) {
  const values = []
  if (membership) {
    const source = membership.positions || membership.roles || membership.position || membership.role
    if (Array.isArray(source)) values.push.apply(values, source)
    else if (source) values.push(source)
  }
  if (fallbackOwner && values.length === 0) values.push('机构负责人')
  return unique(values)
}

function normalizePermissions(membership, fallbackOwner) {
  const permissions = []
  const source = membership && membership.permissions
  if (Array.isArray(source)) permissions.push.apply(permissions, source)
  else if (source && typeof source === 'object') {
    Object.keys(source).forEach(key => {
      if (source[key]) permissions.push(key)
    })
  }
  if (fallbackOwner && permissions.length === 0) {
    permissions.push(
      'workspace.manage',
      'event.view',
      'event.manage',
      'team.view',
      'team.manage'
    )
  }
  if (permissions.length === 0 && membership) {
    const positions = normalizePositions(membership, false).map(item => String(item).toLowerCase())
    positions.forEach(position => {
      if (
        position.indexOf('负责人') >= 0 ||
        position.indexOf('owner') >= 0 ||
        position.indexOf('机构管理员') >= 0
      ) {
        permissions.push(
          'workspace.manage',
          'event.view',
          'event.manage',
          'team.view',
          'team.manage'
        )
      } else if (position.indexOf('校区') >= 0 || position.indexOf('campus') >= 0) {
        permissions.push('education.view', 'education.manage', 'education.execute', 'team.view')
      } else if (position.indexOf('赛事') >= 0 || position.indexOf('event') >= 0) {
        permissions.push('event.view', 'event.manage')
      } else if (
        position.indexOf('俱乐部') >= 0 ||
        position.indexOf('教练') >= 0 ||
        position.indexOf('coach') >= 0
      ) {
        permissions.push('event.view', 'team.view', 'team.manage', 'education.view', 'education.execute')
      }
    })
  }
  return unique(permissions)
}

async function loadWorkspaceCatalog(user, openId) {
  const membershipRows = await safeGet(
    'organization_memberships',
    _.or([{ userId: user._id }, { memberUserId: user._id }, { phone: user.phone || user.phoneNumber }, { phoneNumber: user.phone || user.phoneNumber }]),
    100
  )
  const memberships = membershipRows.filter(item => {
    const status = String(item.status || 'active').toLowerCase()
    return ['active', 'accepted', 'claimed'].indexOf(status) >= 0
  })

  const identityValues = unique([
    user._id, user.uid, user.userId, user.phone, user.phoneNumber,
    user.openId, user.openid, user.wechatOpenId, user._openid, openId
  ])
  const ownerConditions = []
  identityValues.forEach(value => {
    ownerConditions.push(
      { creatorId: value }, { organizerId: value }, { ownerId: value },
      { userId: value }, { createdBy: value }, { creator: value }
    )
  })
  const [directTeams, directTournaments] = ownerConditions.length
    ? await Promise.all([
        safeGet('teams', _.or(ownerConditions), 100),
        safeGet('tournaments', _.or(ownerConditions), 100)
      ])
    : [[], []]
  const candidateOrgIds = unique(
    [user.orgId, user.organizationId, user.organization_id]
      .concat(memberships.map(item => item.orgId || item.organizationId || item.organization_id))
      .concat(directTeams.concat(directTournaments).map(item => item.orgId || item.organizationId || item.organization_id))
  ).filter(orgId => String(orgId) !== String(user._id))
  const organizations = candidateOrgIds.length
    ? await safeGet('organizations', { _id: _.in(candidateOrgIds) }, 100)
    : []
  const orgIds = unique(organizations.map(item => item._id))
  if (orgIds.length > 1) {
    throw workspaceError('ORG_CONFLICT', '当前账号关联多个机构，请联系管理员核验')
  }
  const organizationMap = {}
  organizations.forEach(item => { organizationMap[String(item._id)] = item })

  const workspaces = []
  orgIds.forEach(orgId => {
    const membership = memberships.find(item => {
      return String(item.orgId || item.organizationId || '') === orgId
    })
    const organization = organizationMap[orgId] || {}
    const ownerIds = [organization.ownerId, organization.creatorId, organization.createdBy]
      .filter(Boolean).map(String)
    const fallbackOwner = !membership && ownerIds.indexOf(String(user._id)) >= 0
    if (!membership && !fallbackOwner) return
    let capabilities = normalizeCapabilityValues(
      organization.capabilities,
      organization.organizationCapabilities,
      membership && membership.capabilities
    )
    if (fallbackOwner && capabilities.length === 0) capabilities = ['event', 'team']
    const positions = normalizePositions(membership, fallbackOwner)
    let permissions = normalizePermissions(membership, fallbackOwner)
    const entitlements = buildEntitlements(organization, membership, capabilities)
    const isWorkspaceOwner = positions.some(position => {
      const value = String(position).toLowerCase()
      return value.indexOf('负责人') >= 0 ||
        value.indexOf('owner') >= 0 ||
        value.indexOf('机构管理员') >= 0
    })
    if (entitlements.training.canUse && isWorkspaceOwner) {
      permissions = unique(permissions.concat(['education.view', 'education.manage']))
    }
    workspaces.push({
      id: 'org:' + orgId,
      type: 'organization',
      orgId,
      teamId: '',
      name: firstValue(
        organization.name,
        organization.organizationName,
        user.organizationName,
        user.nickName ? user.nickName + '的机构' : '',
        '我的机构'
      ),
      logo: firstValue(organization.logo, organization.logoUrl),
      capabilities,
      entitlements,
      positions,
      permissions,
      allowOwnerRelations: fallbackOwner,
      isTemporary: false
    })
  })
  const teamMemberships = await safeGet(
    'team_memberships',
    _.or([{ userId: user._id }, { memberUserId: user._id }, { phone: user.phone || user.phoneNumber }, { phoneNumber: user.phone || user.phoneNumber }]),
    100
  )
  const acceptedTeamMemberships = teamMemberships.filter(item => {
    const status = String(item.status || 'active').toLowerCase()
    return status === 'active' || status === 'accepted' || status === 'claimed'
  })
  const invitationRows = await safeGet(
    'team_invitations',
    _.or([{ acceptedUserId: user._id }, { inviteeUserId: user._id }, { acceptedOpenId: openId }]),
    100
  )
  const acceptedInvitations = invitationRows.filter(item => {
    const status = String(item.status || '').toLowerCase()
    return status === 'accepted' || status === 'claimed'
  })
  const relatedTeamIds = unique(
    acceptedTeamMemberships.map(item => item.teamId)
      .concat(acceptedInvitations.map(item => item.teamId))
  )
  const relatedTeams = relatedTeamIds.length
    ? await safeGet('teams', { _id: _.in(relatedTeamIds) }, 100)
    : []
  const directTeamMap = {}
  directTeams.concat(relatedTeams).forEach(team => { directTeamMap[team._id] = team })
  const accessibleTeams = Object.keys(directTeamMap).map(id => directTeamMap[id])
  const accessibleOrgIds = new Set(orgIds)
  accessibleTeams.forEach(team => {
    const teamOrgId = String(team.orgId || '')
    const claimStatus = String(team.claimStatus || '').toLowerCase()
    const needsTemporarySpace = !teamOrgId ||
      !accessibleOrgIds.has(teamOrgId) ||
      claimStatus === 'unclaimed' ||
      claimStatus === 'pending'
    if (!needsTemporarySpace) return
    const teamMembership = acceptedTeamMemberships.find(item => String(item.teamId || '') === String(team._id))
    let teamPermissions = normalizePermissions(teamMembership, false)
    if (!teamPermissions.length) teamPermissions = ['event.view', 'team.view', 'team.manage']
    workspaces.push({
      id: 'team:' + team._id,
      type: 'team',
      orgId: teamOrgId,
      teamId: String(team._id),
      name: firstValue(team.name, team.teamName, '临时球队'),
      logo: firstValue(team.logo, team.logoUrl, team.teamLogo),
      capabilities: ['event', 'team'],
      entitlements: {
        event: {
          collaboration: 'free',
          professionalUnit: 'division'
        },
        training: {
          status: 'unavailable',
          canUse: false
        }
      },
      positions: normalizePositions(teamMembership, false).length
        ? normalizePositions(teamMembership, false)
        : ['球队协作成员'],
      permissions: teamPermissions,
      isTemporary: true
    })
  })

  const deduplicated = []
  const seen = new Set()
  workspaces.forEach(item => {
    if (seen.has(item.id)) return
    seen.add(item.id)
    deduplicated.push(item)
  })
  return deduplicated
}

async function loadTeams(workspace, user, openId) {
  if (workspace.type === 'team') {
    const rows = await safeGet('teams', { _id: workspace.teamId }, 1)
    return rows
  }
  const conditions = [{ orgId: workspace.orgId }]
  if (workspace.allowOwnerRelations === true) {
    conditions.push(
      { creatorId: user._id },
      { ownerId: user._id },
      { userId: user._id },
      { openId },
      { _openid: openId }
    )
  }
  return safeGet('teams', _.or(conditions), 100)
}

async function loadTournaments(workspace, user, openId, teams) {
  if (workspace.type === 'team') return []
  const conditions = [{ orgId: workspace.orgId }]
  if (workspace.allowOwnerRelations === true) {
    conditions.push(
      { creatorId: user._id },
      { organizerId: user._id },
      { ownerId: user._id },
      { userId: user._id },
      { openId },
      { _openid: openId }
    )
  }
  const hosted = await safeGet('tournaments', _.or(conditions), 100)
  const teamIds = unique(teams.map(team => team._id))
  const registrations = teamIds.length
    ? await safeGet('tournament_teams', { teamId: _.in(teamIds) }, 200)
    : []
  const hostedIds = unique(hosted.map(item => item._id))
  const hostedRegistrations = hostedIds.length
    ? await safeGet('tournament_teams', { tournamentId: _.in(hostedIds) }, 300)
    : []
  const participatingIds = unique(registrations.map(item => item.tournamentId))
  const participating = participatingIds.length
    ? await safeGet('tournaments', { _id: _.in(participatingIds) }, 100)
    : []
  const map = {}
  hosted.forEach(item => { map[item._id] = Object.assign({}, item, { workspaceRelation: 'hosted' }) })
  participating.forEach(item => {
    if (map[item._id]) {
      map[item._id].workspaceRelation = 'both'
    } else {
      map[item._id] = Object.assign({}, item, { workspaceRelation: 'participating' })
    }
  })
  return {
    tournaments: Object.keys(map).map(id => map[id]),
    registrations,
    hostedRegistrations
  }
}

async function loadMatches(workspace, tournaments, teams) {
  const tournamentIds = unique(tournaments.map(item => item._id))
  const teamIds = unique(teams.map(item => item._id))
  const conditions = []
  if (workspace.type === 'organization' && workspace.orgId) conditions.push({ orgId: workspace.orgId })
  if (tournamentIds.length) conditions.push({ tournamentId: _.in(tournamentIds) })
  if (teamIds.length) {
    conditions.push({ homeTeamId: _.in(teamIds) })
    conditions.push({ awayTeamId: _.in(teamIds) })
  }
  if (!conditions.length) return []
  return safeGet('matches', conditions.length === 1 ? conditions[0] : _.or(conditions), 200)
}

function formatTournament(item) {
  const status = String(item.status || 'draft')
  const statusLabels = {
    draft: '筹备中',
    pending: '待审核',
    ongoing: '进行中',
    completed: '已结束',
    finished: '已结束'
  }
  const relation = item.workspaceRelation || 'hosted'
  const relationLabels = {
    hosted: '我主办的',
    participating: '我参与的',
    both: '我主办并参与'
  }
  return {
    id: String(item._id),
    name: item.name || '未命名赛事',
    relation,
    relationText: relationLabels[relation] || '关联赛事',
    isHosted: relation === 'hosted' || relation === 'both',
    isParticipating: relation === 'participating' || relation === 'both',
    status,
    statusText: statusLabels[status] || '进行中',
    dateText: dateText(firstValue(item.startDate, item.createTime))
  }
}

function formatTeam(item, summary) {
  summary = summary || {}
  return {
    id: String(item._id),
    name: firstValue(item.name, item.teamName, '未命名球队'),
    logo: firstValue(item.logo, item.logoUrl, item.teamLogo),
    teamCode: item.teamCode || '',
    claimStatus: item.claimStatus || '',
    isUnclaimed: String(item.claimStatus || '').toLowerCase() === 'unclaimed',
    playerCount: Number(summary.playerCount || 0),
    coachCount: Number(summary.coachCount || 0),
    tournamentCount: Number(summary.tournamentCount || 0),
    claimText: summary.claimText || (String(item.claimStatus || '').toLowerCase() === 'unclaimed' ? '待认领' : '已认领')
  }
}

function formatMatch(item, teamMap) {
  const startValue = firstValue(item.matchTime, item.startTime, item.matchDate, item.date)
  const home = teamMap[item.homeTeamId] || {}
  const away = teamMap[item.awayTeamId] || {}
  const status = String(item.status || 'scheduled')
  return {
    id: String(item._id),
    tournamentId: String(item.tournamentId || ''),
    type: 'match',
    source: 'event',
    sourceText: '赛事',
    title: firstValue(item.tournamentName, '赛事比赛'),
    subtitle: firstValue(item.homeTeamName, home.name, home.teamName, '主队') +
      ' vs ' + firstValue(item.awayTeamName, away.name, away.teamName, '客队'),
    time: toTime(startValue),
    timeText: dateText(startValue),
    location: firstValue(item.venue, item.location, '场地待定'),
    status,
    statusText: status === 'completed' || status === 'finished'
      ? '已结束'
      : (status === 'ongoing' ? '进行中' : '未开始')
  }
}

function buildTasks(registrations) {
  const items = []
  const pendingStatuses = new Set([
    'not_submitted',
    'drafting',
    'modification_requested',
    'rejected'
  ])
  const reviewingStatuses = new Set(['submitted', 'pending', 'pending_approval'])
  registrations.forEach(item => {
    const status = String(item.status || 'not_submitted')
    if (pendingStatuses.has(status)) {
      items.push({
        id: 'registration:' + item._id,
        type: 'registration',
        audience: 'team',
        source: 'event',
        sourceText: '赛事协作',
        status: 'pending',
        title: status === 'rejected' ? '参赛资料需要重新处理' : '完善并提交参赛资料',
        subtitle: item.tournamentName || item.teamName || '赛事报名',
        tournamentId: item.tournamentId || '',
        teamId: item.teamId || ''
      })
    } else if (reviewingStatuses.has(status)) {
      items.push({
        id: 'registration:' + item._id,
        type: 'registration',
        audience: 'team',
        source: 'event',
        sourceText: '赛事协作',
        status: 'reviewing',
        title: '参赛资料审核中',
        subtitle: item.tournamentName || item.teamName || '赛事报名',
        tournamentId: item.tournamentId || '',
        teamId: item.teamId || ''
      })
    }
  })
  return items
}

function buildRegistrationDraftTasks(rows) {
  return (rows || []).filter(item => {
    return String(item.type || '') === 'registration_draft' && ['pending', 'drafting'].indexOf(String(item.status || 'pending')) >= 0
  }).map(item => ({
    id: 'registration-draft:' + item._id,
    type: 'registration_draft',
    audience: 'team',
    source: 'event',
    sourceText: '报名未完成',
    status: 'pending',
    title: item.title || '继续完成赛事报名',
    subtitle: item.tournamentName || item.teamName || '赛事报名',
    tournamentId: item.tournamentId || '',
    teamId: item.teamId || '',
    divisionId: item.divisionId || 'default',
    inviteKey: item.inviteKey || '',
    deadlineText: item.detail || '请继续完成关注与报名确认'
  }))
}

function buildOrganizerTasks(registrations) {
  const reviewStatuses = new Set(['submitted', 'pending', 'pending_approval'])
  return (registrations || []).filter(item => {
    return reviewStatuses.has(String(item.status || '').toLowerCase())
  }).map(item => ({
    id: 'organizer-registration:' + item._id,
    type: 'registration_review',
    audience: 'organizer',
    source: 'event',
    sourceText: '赛事管理',
    status: 'pending',
    title: '审核参赛资料',
    subtitle: item.teamName || item.tournamentName || '参赛球队',
    tournamentId: item.tournamentId || '',
    teamId: item.teamId || ''
  }))
}

async function loadEducationData(workspace, user) {
  const permissions = new Set(workspace.permissions || [])
  const trainingEntitlement = (workspace.entitlements && workspace.entitlements.training) || {}
  const hasEntitlement = !!trainingEntitlement.canUse
  const canView = permissions.has('education.view') ||
    permissions.has('education.manage') ||
    permissions.has('education.execute')
  if (workspace.type !== 'organization' || !workspace.orgId || !hasEntitlement || !canView) {
    return { schedule: [], tasks: [] }
  }
  const canManage = permissions.has('education.manage')
  const scheduleRows = await safeGet('education_schedules', { orgId: workspace.orgId }, 200)
  const taskRows = await safeGet('education_tasks', { orgId: workspace.orgId }, 200)
  const isAssigned = function(item) {
    if (canManage) return true
    return [
      item.userId,
      item.assigneeUserId,
      item.coachUserId,
      item.executorUserId
    ].filter(Boolean).map(String).indexOf(String(user._id)) >= 0
  }
  const schedule = scheduleRows.filter(isAssigned).map(item => {
    const startValue = firstValue(item.startTime, item.classTime, item.date, item.scheduleTime)
    return {
      id: String(item._id),
      type: 'class',
      source: 'education',
      sourceText: '青训',
      title: firstValue(item.courseName, item.className, '青训课程'),
      subtitle: firstValue(item.campusName, item.coachName, '教务安排'),
      time: toTime(startValue),
      timeText: dateText(startValue),
      location: firstValue(item.venueName, item.classroomName, item.location, '场地待定'),
      status: item.status || 'scheduled',
      statusText: item.statusText || '待执行'
    }
  })
  const tasks = taskRows.filter(isAssigned).filter(item => {
    const status = String(item.status || 'pending').toLowerCase()
    return status !== 'completed' && status !== 'done' && status !== 'cancelled'
  }).map(item => ({
    id: 'education:' + item._id,
    type: item.type || 'education',
    source: 'education',
    sourceText: '青训',
    status: String(item.status || 'pending') === 'reviewing' ? 'reviewing' : 'pending',
    title: firstValue(item.title, item.taskName, '青训待办'),
    subtitle: firstValue(item.className, item.courseName, item.campusName, '青训执行'),
    tournamentId: '',
    teamId: ''
  }))
  return { schedule, tasks }
}

function buildModules(workspace) {
  const capabilities = new Set(workspace.capabilities || [])
  const modules = []
  if (capabilities.has('event')) {
    modules.push({
      id: 'event',
      name: '赛事管理',
      description: '赛事查看、审批与现场协作',
      iconText: '赛',
      enabled: true,
      filter: 'event'
    })
  }
  if (capabilities.has('team')) {
    modules.push({
      id: 'team',
      name: '球队管理',
      description: '球队资料与球员轻量管理',
      iconText: '队',
      enabled: true,
      filter: 'event'
    })
  }
  if (capabilities.has('education')) {
    modules.push({
      id: 'education',
      name: '青训',
      description: '课程、签到、消课与课后执行',
      iconText: '训',
      enabled: !!(workspace.entitlements && workspace.entitlements.training && workspace.entitlements.training.canUse),
      filter: 'education'
    })
  }
  return modules
}

function resolveHomeIdentity(workspace, user) {
  const permissions = new Set(workspace.permissions || [])
  const training = (workspace.entitlements && workspace.entitlements.training) || {}
  const available = []
  if (permissions.has('event.manage')) available.push('organizer')
  if (permissions.has('team.view') || permissions.has('team.manage') || workspace.type === 'team') available.push('team_coach')
  if (
    workspace.type === 'organization' &&
    training.canUse &&
    (permissions.has('education.view') || permissions.has('education.manage') || permissions.has('education.execute'))
  ) available.push('training_coach')
  const requested = String((user && (user.lastUsedIdentity || user.lastHomeIdentity)) || '')
  const identity = available.indexOf(requested) >= 0 ? requested : (available[0] || 'team_coach')
  const labels = {
    organizer: '赛事负责人',
    team_coach: '球队教练',
    training_coach: '青训教练'
  }
  return { id: identity, label: labels[identity] || '球队教练', available }
}

function messageAudienceMatches(message, user, openId, workspace) {
  const directUserIds = unique([message.userId, message.recipientUserId, message.targetUserId, message.memberUserId])
  const directOpenIds = unique([message.openId, message.recipientOpenId, message.targetOpenId])
  if (directUserIds.length && directUserIds.indexOf(String(user._id)) < 0) return false
  if (directOpenIds.length && directOpenIds.indexOf(String(openId)) < 0) return false
  const positions = unique(workspace.positions || [])
  const rawAudiencePositions = message.positions || message.audiencePositions || []
  const audiencePositions = unique(Array.isArray(rawAudiencePositions) ? rawAudiencePositions : [rawAudiencePositions])
  if (audiencePositions.length && !audiencePositions.some(item => positions.indexOf(item) >= 0)) return false
  // 没有任何显式受众时，不能把机构内其他人的私有消息默认广播给当前用户。
  return Boolean(directUserIds.length || directOpenIds.length || audiencePositions.length || message.isOrgBroadcast === true)
}

function messageCategory(item) {
  const value = String(firstValue(item.category, item.type, item.source, item.businessType, 'system')).toLowerCase()
  if (value.indexOf('event') >= 0 || value.indexOf('tournament') >= 0 || value.indexOf('match') >= 0) return 'event'
  if (value.indexOf('team') >= 0 || value.indexOf('roster') >= 0 || value.indexOf('lineup') >= 0) return 'team'
  return 'system'
}

const MESSAGE_ROUTE_ALLOWLIST = [
  '/pages/todo/index',
  '/pages/team/team',
  '/pages/schedule/index',
  '/pages/event/index',
  '/pages/teams/index',
  '/pages/team/participation/participation',
  '/pages/team/official-roster/official-roster'
]

function safeMessagePath(item) {
  const value = String(firstValue(item.path, item.pagePath, item.url, ''))
  if (value.indexOf('/pages/') !== 0) return ''
  const route = value.split('?')[0].split('#')[0]
  return MESSAGE_ROUTE_ALLOWLIST.indexOf(route) >= 0 ? value : ''
}

function activeMembership(item) {
  const status = String(item && item.status || 'active').toLowerCase()
  return ['active', 'accepted', 'claimed'].indexOf(status) >= 0
}

function membershipHasPermission(item, permission) {
  if (!item) return false
  const permissions = item.permissions
  if (Array.isArray(permissions) && permissions.map(String).indexOf(permission) >= 0) return true
  if (permissions && typeof permissions === 'object' && permissions[permission]) return true
  const source = item.positions || item.roles || item.position || item.role
  const values = (Array.isArray(source) ? source : [source]).filter(Boolean).map(value => String(value).toLowerCase())
  if (permission === 'event.manage') return values.some(value => value.indexOf('event') >= 0 || value.indexOf('organizer') >= 0 || value.indexOf('赛事') >= 0 || value.indexOf('负责人') >= 0)
  if (permission === 'team.manage') return values.some(value => value.indexOf('team') >= 0 || value.indexOf('coach') >= 0 || value.indexOf('球队') >= 0 || value.indexOf('教练') >= 0)
  return false
}

async function findOrganizationUserIds(orgId, permission) {
  const normalizedOrgId = String(orgId || '')
  if (!normalizedOrgId) return []
  const memberships = await safeGet('organization_memberships', _.or([
    { orgId: normalizedOrgId },
    { organizationId: normalizedOrgId }
  ]), 200)
  const ids = []
  memberships.filter(activeMembership).forEach(item => {
    if (!membershipHasPermission(item, permission)) return
    ids.push(item.userId || item.memberUserId || item.ownerId)
  })
  const organizations = await safeGet('organizations', { _id: normalizedOrgId }, 1)
  if (organizations[0]) ids.push(organizations[0].ownerId, organizations[0].creatorId, organizations[0].createdBy)
  if (!ids.filter(Boolean).length) {
    const users = await safeGet('users', { orgId: normalizedOrgId }, 200)
    users.forEach(user => ids.push(user._id))
  }
  return unique(ids)
}

async function findTeamUserIds(teamId) {
  const normalizedTeamId = String(teamId || '')
  if (!normalizedTeamId) return []
  const memberships = await safeGet('team_memberships', { teamId: normalizedTeamId }, 200)
  const ids = []
  memberships.filter(activeMembership).forEach(item => ids.push(item.userId || item.memberUserId || item.ownerId))
  const teams = await safeGet('teams', { _id: normalizedTeamId }, 1)
  if (teams[0]) {
    ids.push(teams[0].ownerId, teams[0].creatorId, teams[0].userId)
    ;[].concat(teams[0].managerIds || [], teams[0].coachIds || []).forEach(id => ids.push(id))
  }
  return unique(ids)
}

async function publishWorkspaceMessage(options) {
  options = options || {}
  const orgId = String(options.orgId || '')
  const title = String(options.title || '').trim().slice(0, 120)
  if (!orgId || !title) return []
  const recipientUserIds = unique(options.recipientUserIds || [])
  if (!recipientUserIds.length && options.isOrgBroadcast !== true) return []
  const targets = recipientUserIds.length ? recipientUserIds : [null]
  const createdIds = []
  for (let index = 0; index < targets.length; index += 1) {
    const userId = targets[index]
    const dedupeKey = String(options.dedupeKey || '')
    const where = userId
      ? { orgId, userId, dedupeKey }
      : { orgId, dedupeKey, isOrgBroadcast: true }
    if (dedupeKey && (await safeGet('messages', where, 1)).length) continue
    try {
      const created = await db.collection('messages').add({ data: {
        orgId,
        userId: userId || '',
        isOrgBroadcast: !userId,
        category: String(options.category || 'system'),
        title,
        subtitle: String(options.subtitle || '').trim().slice(0, 300),
        path: safeMessagePath({ path: options.path }),
        dedupeKey,
        createdAt: db.serverDate(),
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      } })
      createdIds.push(String(created._id || ''))
    } catch (error) {
      console.warn('[getMiniWorkspace] notification write skipped:', error.message)
    }
  }
  return createdIds
}

async function loadMessagesForWorkspace(workspace, user, openId) {
  if (!workspace || workspace.type !== 'organization' || !workspace.orgId) return { messages: [], unreadMessageCount: 0 }
  const rows = await safeGet('messages', { orgId: workspace.orgId }, 200)
  const messageRows = rows.filter(item => messageAudienceMatches(item, user, openId, workspace))
  const messageIds = unique(messageRows.map(item => item._id))
  const receiptRows = messageIds.length
    ? await safeGet('message_receipts', { messageId: _.in(messageIds), userId: user._id, orgId: workspace.orgId }, 200)
    : []
  const readIds = new Set(receiptRows.filter(item => String(item.status || 'read') === 'read').map(item => String(item.messageId)))
  const messages = messageRows.map(item => ({
    id: String(item._id),
    category: messageCategory(item),
    title: firstValue(item.title, item.subject, '系统通知'),
    subtitle: firstValue(item.subtitle, item.content, item.summary, ''),
    timeText: dateText(firstValue(item.createdAt, item.createTime, item.updateTime)),
    time: toTime(firstValue(item.createdAt, item.createTime, item.updateTime)),
    path: safeMessagePath(item),
    isUnread: !readIds.has(String(item._id))
  })).sort((a, b) => b.time - a.time)
  return { messages, unreadMessageCount: messages.filter(item => item.isUnread).length }
}

async function findWorkspaceForAction(user, openId, workspaceId) {
  const workspaces = await loadWorkspaceCatalog(user, openId)
  const requestedWorkspaceId = String(workspaceId || '')
  const workspace = requestedWorkspaceId
    ? workspaces.find(item => item.id === requestedWorkspaceId)
    : workspaces[0]
  if (requestedWorkspaceId && !workspace) throw new Error('当前账号无权访问该工作空间')
  if (!workspace) throw new Error('当前账号没有可用工作空间')
  return { workspaces, workspace }
}

async function markMessagesRead(event, identity) {
  const result = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  const workspace = result.workspace
  if (workspace.type !== 'organization' || !workspace.orgId) throw new Error('当前工作空间不支持消息同步')
  const loaded = await loadMessagesForWorkspace(workspace, identity.user, identity.openId)
  const requestedId = String(event.messageId || '')
  const targets = requestedId ? loaded.messages.filter(item => item.id === requestedId) : loaded.messages.filter(item => item.isUnread)
  if (requestedId && !targets.length) throw new Error('消息不存在或无访问权限')
  if (!targets.length) return { success: true, messages: loaded.messages, unreadMessageCount: loaded.unreadMessageCount }
  const receipts = await safeGet('message_receipts', { userId: identity.user._id, orgId: workspace.orgId }, 300)
  const existing = new Map(receipts.map(item => [String(item.messageId), item]))
  const now = db.serverDate()
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index]
    const receipt = existing.get(target.id)
    if (receipt && String(receipt.status || '') === 'read') continue
    if (receipt && receipt._id) {
      await db.collection('message_receipts').doc(receipt._id).update({
        data: { status: 'read', readAt: now, updateTime: now }
      })
    } else {
      await db.collection('message_receipts').add({
        data: { messageId: target.id, userId: identity.user._id, orgId: workspace.orgId, status: 'read', readAt: now, createTime: now, updateTime: now }
      })
    }
  }
  const refreshed = await loadMessagesForWorkspace(workspace, identity.user, identity.openId)
  return Object.assign({ success: true }, refreshed)
}

async function saveHomeIdentity(event, identity) {
  const result = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  const requested = String(event.identity || '')
  const resolved = resolveHomeIdentity(result.workspace, identity.user)
  if (resolved.available.indexOf(requested) < 0) throw new Error('当前身份授权已变更，请刷新后重试')
  await db.collection('users').doc(identity.user._id).update({
    data: { lastUsedIdentity: requested, lastHomeIdentity: requested, updateTime: db.serverDate() }
  })
  return { success: true, identity: requested, workspaceId: result.workspace.id }
}

function hasOwnValue(source, key) {
  return Boolean(source && Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined && source[key] !== null && source[key] !== '')
}

function toBooleanSetting(value) {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['false', '0', 'off', 'no', 'disabled'].indexOf(normalized) >= 0) return false
    if (['true', '1', 'on', 'yes', 'enabled'].indexOf(normalized) >= 0) return true
  }
  return Boolean(value)
}

function readBooleanSetting(sources, keys) {
  for (let i = 0; i < (sources || []).length; i += 1) {
    const source = sources[i]
    for (let j = 0; j < (keys || []).length; j += 1) {
      const key = keys[j]
      if (hasOwnValue(source, key)) return { defined: true, value: toBooleanSetting(source[key]), key }
    }
  }
  return { defined: false, value: false, key: '' }
}

function resolveRosterRequirements(tournament, division) {
  const sources = [division, division && division.rulesSnapshot, tournament]
  const identity = readBooleanSetting(sources, ['identityVerificationRequired', 'requiresRealName', 'requireRealName'])
  const portrait = readBooleanSetting(sources, ['portraitRequired', 'requiresPortrait', 'requirePortrait'])
  const parent = readBooleanSetting(sources, ['parentSupplementRequired', 'parentProfileRequired', 'parentCompletionRequired'])
  return {
    identityVerificationRequired: identity.defined ? identity.value : false,
    portraitRequired: portrait.defined ? portrait.value : false,
    parentSupplementConfigured: parent.defined,
    parentSupplementRequired: parent.defined ? parent.value : undefined,
    source: identity.defined || portrait.defined || parent.defined ? 'division-or-tournament' : 'legacy-compatibility'
  }
}

function registrationDivisionId(registration) {
  return String(firstValue(registration && registration.divisionId, registration && registration.division, 'default'))
}

function snapshotMatchesDivision(snapshot, divisionId, allowLegacySnapshot) {
  const snapshotDivisionId = String(snapshot && (snapshot.divisionId || snapshot.division || '') || '')
  if (!snapshotDivisionId) return allowLegacySnapshot === true
  return snapshotDivisionId === String(divisionId || 'default')
}

async function resolveRosterContext(tournament, registrations, event) {
  const active = (registrations || []).filter(item => ['approved', 'confirmed', 'claimed', 'accepted', 'active'].indexOf(String(item.status || '').toLowerCase()) >= 0)
  const requestedDivisionId = String(event && event.divisionId || '')
  const candidates = requestedDivisionId
    ? active.filter(item => registrationDivisionId(item) === requestedDivisionId)
    : active
  if (!candidates.length) throw workspaceError('ROSTER_DIVISION_NOT_FOUND', '球队未建立该赛事的有效参赛关系')
  const divisionIds = unique(candidates.map(registrationDivisionId))
  const allDivisionIds = unique(active.map(registrationDivisionId))
  if (!requestedDivisionId && divisionIds.length > 1) throw workspaceError('ROSTER_DIVISION_REQUIRED', '该球队参加了多个竞赛组别，请先选择当前组别')
  const registration = candidates[0]
  const divisionId = registrationDivisionId(registration)
  let division = null
  if (divisionId && divisionId !== 'default') division = (await safeGet('divisions', { _id: divisionId }, 1))[0] || null
  if (division && division.tournamentId && String(division.tournamentId) !== String(tournament._id || tournament.id || '')) division = null
  if (!division && Array.isArray(tournament.divisions)) {
    division = tournament.divisions.find(item => String(item && (item.id || item._id) || '') === divisionId) || null
  }
  const requirements = resolveRosterRequirements(tournament, division)
  return { registration, division, divisionId, requirements, allowLegacySnapshot: allDivisionIds.length === 1 }
}

function formatTeamPlayer(item, requirements) {
  const hasPhoto = Boolean(firstValue(item.photoUrl, item.photo, item.photoFileId))
  const hasBirth = Boolean(firstValue(item.birthDate, item.birthday))
  const hasName = Boolean(item.name)
  const identityRaw = String(firstValue(item.identityStatus, item.verifyStatus, item.realNameStatus)).toLowerCase()
  const identityRequired = Boolean(requirements && requirements.identityVerificationRequired)
  const portraitRequired = requirements && hasOwnValue(requirements, 'portraitRequired') ? Boolean(requirements.portraitRequired) : false
  const parentRequired = requirements && requirements.parentSupplementConfigured
    ? Boolean(requirements.parentSupplementRequired)
    : false
  const needsIdentity = identityRequired && ['verified', 'approved', 'complete'].indexOf(identityRaw) < 0
  const needsPortrait = portraitRequired && !hasPhoto
  const needsParentCompletion = parentRequired && Boolean(item.needsParentCompletion)
  const rejected = ['rejected', 'failed', 'exception', 'invalid'].indexOf(String(firstValue(item.profileStatus, item.verifyStatus, item.identityStatus, item.status)).toLowerCase()) >= 0
  const incomplete = needsPortrait || !hasBirth || !hasName || needsParentCompletion || needsIdentity
  const profileStatus = rejected ? 'exception' : (incomplete ? 'pending' : 'complete')
  let statusText = '资料完整'
  if (profileStatus === 'exception') statusText = '资料异常'
  else if (needsIdentity) statusText = '待实名核验'
  else if (needsPortrait) statusText = '待形象照'
  else if (needsParentCompletion) statusText = '待家长补充'
  else if (!hasBirth || !hasName) statusText = '待完善基础资料'
  return {
    id: String(item._id),
    name: item.name || '未命名球员',
    jerseyName: item.jerseyName || '',
    birthDate: firstValue(item.birthDate, item.birthday),
    photoUrl: firstValue(item.photoUrl, item.photo),
    jerseyNumber: item.jerseyNumber || '',
    position: item.position || '',
    profileStatus,
    statusText,
    identityStatus: identityRequired ? (['verified', 'approved', 'complete'].indexOf(identityRaw) >= 0 ? 'verified' : 'not_verified') : 'not_required',
    needsPortrait,
    needsParentCompletion,
    requirementSource: requirements && requirements.source ? requirements.source : 'legacy-compatibility'
  }
}

async function loadTeamPlayersForWorkspace(event, identity) {
  const result = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  const workspace = result.workspace
  const permissions = new Set(workspace.permissions || [])
  if (!permissions.has('team.view') && !permissions.has('team.manage')) throw new Error('当前身份没有查看球队球员库的权限')
  const requestedTeamId = String(event.teamId || '')
  const teams = await loadTeams(workspace, identity.user, identity.openId)
  const team = teams.find(item => String(item._id) === requestedTeamId) || (workspace.type === 'team' ? teams[0] : null)
  if (!team) throw new Error('球队不存在或不属于当前工作空间')
  const rows = (await safeGet('players', { teamId: String(team._id) }, 500)).filter(item => ['archived', 'deleted'].indexOf(String(item.status || '').toLowerCase()) < 0)
  const players = rows.map(formatTeamPlayer)
  const counts = { complete: 0, pending: 0, exception: 0 }
  players.forEach(item => { counts[item.profileStatus] += 1 })
  return {
    success: true,
    team: { id: String(team._id), name: firstValue(team.name, team.teamName, '未命名球队'), logo: firstValue(team.logo, team.logoUrl, team.teamLogo) },
    players,
    counts,
    canManage: permissions.has('team.manage')
  }
}

function matchPlayerIds(match) {
  const ids = []
  const add = function(value) {
    const id = String(value && (value.playerId || value.id || value._id) || value || '')
    if (id) ids.push(id)
  }
  ;['starters', 'substitutes', 'homeStarters', 'awayStarters', 'homeLineup', 'awayLineup', 'lineupHome', 'lineupAway'].forEach(function(key) {
    const rows = match && match[key]
    if (Array.isArray(rows)) rows.forEach(add)
  })
  const lineups = match && match.lineups
  if (lineups && typeof lineups === 'object') Object.keys(lineups).forEach(function(key) { if (Array.isArray(lineups[key])) lineups[key].forEach(add) })
  return unique(ids)
}

async function loadTeamPlayerDetailForWorkspace(event, identity) {
  const result = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  const workspace = result.workspace
  const permissions = new Set(workspace.permissions || [])
  if (!permissions.has('team.view') && !permissions.has('team.manage')) throw new Error('当前身份没有查看球员详情的权限')
  const teamId = String(event.teamId || '')
  const playerId = String(event.playerId || '')
  if (!teamId || !playerId) throw new Error('球队和球员识别信息不完整')
  const teams = await loadTeams(workspace, identity.user, identity.openId)
  const team = teams.find(item => String(item._id) === teamId)
  if (!team) throw new Error('球队不存在或不属于当前工作空间')
  const rows = await safeGet('players', { _id: playerId, teamId }, 1)
  const player = rows[0]
  if (!player || ['archived', 'deleted'].indexOf(String(player.status || '').toLowerCase()) >= 0) throw new Error('球员不存在或已移出球队')
  const matchResult = await db.collection('matches').where(_.or([{ homeTeamId: teamId }, { awayTeamId: teamId }])).limit(500).get()
  const matches = matchResult.data || []
  const stats = { appearances: 0, goals: 0, yellowCards: 0, redCards: 0 }
  matches.forEach(function(match) {
    const appeared = new Set(matchPlayerIds(match))
    ;(Array.isArray(match.events) ? match.events : []).forEach(function(eventItem) {
      const eventPlayerId = String(eventItem.playerId || eventItem.player || '')
      if (eventPlayerId !== playerId) return
      appeared.add(playerId)
      const type = String(eventItem.type || eventItem.eventType || '').toLowerCase()
      if (['goal', 'score'].indexOf(type) >= 0) stats.goals += 1
      if (['yellow', 'yellow_card', 'yellowcard'].indexOf(type) >= 0) stats.yellowCards += 1
      if (['red', 'red_card', 'redcard'].indexOf(type) >= 0) stats.redCards += 1
    })
    if (appeared.has(playerId)) stats.appearances += 1
  })
  const formatted = formatTeamPlayer(player)
  return {
    success: true,
    canManage: permissions.has('team.manage'),
    team: { id: teamId, name: String(firstValue(team.name, team.teamName, '未命名球队')), logo: String(firstValue(team.logo, team.logoUrl, team.teamLogo) || ''), code: String(firstValue(team.teamCode, team.code) || '') },
    player: {
      id: playerId,
      name: String(player.name || '未命名球员'),
      jerseyName: String(player.jerseyName || ''),
      jerseyNumber: String(player.jerseyNumber || player.number || ''),
      photoUrl: String(firstValue(player.photoUrl, player.photo) || ''),
      birthDate: String(firstValue(player.birthDate, player.birthday) || ''),
      gender: String(player.gender || ''),
      nationality: String(player.nationality || ''),
      hometown: String(firstValue(player.hometown, player.nativePlace) || ''),
      position: String(player.position || ''),
      strongFoot: String(player.strongFoot || ''),
      height: Number(player.height || 0),
      weight: Number(player.weight || 0),
      guardianName: String(firstValue(player.guardianName, player.parentName) || ''),
      guardianRelation: String(player.guardianRelation || ''),
      guardianPhoneMasked: maskPhone(String(firstValue(player.guardianPhone, player.contactPhone) || '')),
      profileStatus: String(formatted.profileStatus || 'pending'),
      profileStatusText: String(formatted.statusText || '待完善'),
      identityStatus: String(firstValue(player.identityStatus, player.verifyStatus, player.realNameStatus) || ''),
      portraitStatus: String(firstValue(player.portraitStatus, player.avatarProcessingStatus) || ''),
      remark: String(firstValue(player.remark, player.notes) || '')
    },
    stats
  }
}

async function archiveTeamPlayerForWorkspace(event, identity) {
  const result = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  const workspace = result.workspace
  if ((workspace.permissions || []).indexOf('team.manage') < 0) throw new Error('当前身份没有移出球员的权限')
  const teamId = String(event.teamId || '')
  const playerId = String(event.playerId || '')
  const teams = await loadTeams(workspace, identity.user, identity.openId)
  if (!teams.some(item => String(item._id) === teamId)) throw new Error('球队不存在或不属于当前工作空间')
  const rows = await safeGet('players', { _id: playerId, teamId }, 1)
  if (!rows.length) throw new Error('球员不存在或不属于该球队')
  await db.collection('players').doc(playerId).update({ data: { status: 'archived', archivedAt: db.serverDate(), archivedBy: identity.user._id, updateTime: db.serverDate() } })
  return { success: true, archived: true }
}

async function loadTeamPlayerForEditForWorkspace(event, identity) {
  const result = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  const workspace = result.workspace
  if ((workspace.permissions || []).indexOf('team.manage') < 0) throw new Error('当前身份没有编辑球员档案的权限')
  const teamId = String(event.teamId || '')
  const playerId = String(event.playerId || '')
  if (!teamId || !playerId) throw new Error('球队和球员识别信息不完整')
  const teams = await loadTeams(workspace, identity.user, identity.openId)
  if (!teams.some(item => String(item._id) === teamId)) throw new Error('球队不存在或不属于当前工作空间')
  const rows = await safeGet('players', { _id: playerId, teamId }, 1)
  const player = rows[0]
  if (!player) throw new Error('球员不存在或不属于该球队')
  return {
    success: true,
    player: {
      id: String(player._id),
      name: String(player.name || ''),
      birthDate: String(firstValue(player.birthDate, player.birthday) || ''),
      guardianPhone: String(firstValue(player.guardianPhone, player.contactPhone) || '')
    }
  }
}

async function saveTeamPlayerForWorkspace(event, identity) {
  const result = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  const workspace = result.workspace
  if ((workspace.permissions || []).indexOf('team.manage') < 0) throw new Error('当前身份没有创建球队球员的权限')
  const teamId = String(event.teamId || '')
  const teams = await loadTeams(workspace, identity.user, identity.openId)
  const team = teams.find(item => String(item._id) === teamId)
  if (!team) throw new Error('球队不存在或不属于当前工作空间')
  const name = String(event.name || '').trim()
  const birthDate = String(event.birthDate || '')
  const guardianPhone = String(event.guardianPhone || '').replace(/\s/g, '')
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !/^1\d{10}$/.test(guardianPhone)) throw new Error('请完整填写球员姓名、出生年月和监护人手机号')
  const playerId = String(event.playerId || '').trim()
  const duplicate = (await safeGet('players', { teamId, name, birthDate }, 20)).filter(item => String(item._id) !== playerId)
  if (duplicate.length) throw new Error('同一球队已存在同名且出生年月相同的球员，请先核验，不会自动合并')
  const now = db.serverDate()
  if (playerId) {
    const existing = await safeGet('players', { _id: playerId, teamId }, 1)
    if (!existing.length) throw new Error('球员不存在或不属于该球队')
    await db.collection('players').doc(playerId).update({
      data: {
        name,
        birthDate,
        birthday: birthDate,
        guardianPhone,
        contactPhone: guardianPhone,
        updateTime: now,
        lastEditedBy: identity.user._id
      }
    })
    return { success: true, playerId, updated: true, parentInvite: null }
  }
  const player = {
    teamId, orgId: workspace.orgId || '', name, birthDate, birthday: birthDate,
    guardianPhone, contactPhone: guardianPhone, profileStatus: 'pending', needsParentCompletion: Boolean(event.createParentLink),
    creatorId: identity.user._id, creatorOpenId: identity.openId, createTime: now, updateTime: now, source: 'team_quick_create'
  }
  const added = await db.collection('players').add({ data: player })
  let parentInvite = null
  if (event.createParentLink) {
    const token = 'pp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12)
    await db.collection('parent_profile_invites').add({ data: { token, teamId, playerId: added._id, orgId: workspace.orgId || '', guardianPhone, status: 'active', creatorId: identity.user._id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), createTime: now, updateTime: now } })
    parentInvite = { token, playerId: String(added._id) }
  }
  return { success: true, playerId: String(added._id), parentInvite }
}

async function remindParentProfileForWorkspace(event, identity) {
  const result = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  if ((result.workspace.permissions || []).indexOf('team.manage') < 0) throw new Error('当前身份没有发送提醒的权限')
  const teamId = String(event.teamId || ''), playerId = String(event.playerId || '')
  const teams = await loadTeams(result.workspace, identity.user, identity.openId)
  if (!teams.some(item => String(item._id) === teamId)) throw new Error('球队不存在或不属于当前工作空间')
  const playerRows = await safeGet('players', { _id: playerId, teamId }, 1)
  if (!playerRows.length || !playerRows[0].needsParentCompletion) throw new Error('该球员当前没有可提醒的资料项')
  const invites = (await safeGet('parent_profile_invites', { playerId, teamId, status: 'active' }, 20)).filter(item => !item.expiresAt || toTime(item.expiresAt) > Date.now())
  if (!invites.length) throw new Error('尚未生成家长协作链接，无法发送提醒')
  const now = db.serverDate()
  await db.collection('parent_profile_reminders').add({ data: { teamId, playerId, inviteId: invites[0]._id, orgId: result.workspace.orgId || '', creatorId: identity.user._id, status: 'queued', createTime: now, updateTime: now } })
  return { success: true, reminderStatus: 'queued' }
}

async function parentProfileInviteForWorkspace(event, identity) {
  const result = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  if ((result.workspace.permissions || []).indexOf('team.manage') < 0) throw new Error('当前身份没有管理家长协作邀请的权限')
  const teamId = String(event.teamId || ''), playerId = String(event.playerId || '')
  const teams = await loadTeams(result.workspace, identity.user, identity.openId)
  const team = teams.find(item => String(item._id) === teamId)
  if (!team) throw new Error('球队不存在或不属于当前工作空间')
  const playerRows = await safeGet('players', { _id: playerId, teamId }, 1)
  const player = playerRows[0]
  if (!player) throw new Error('球员不存在或不属于当前球队')
  const activeRows = await safeGet('parent_profile_invites', { playerId, teamId, status: 'active' }, 20)
  const active = activeRows.filter(item => !item.expiresAt || toTime(item.expiresAt) > Date.now()).sort((a, b) => toTime(b.updateTime) - toTime(a.updateTime))[0]
  if (active) return { success: true, invite: formatParentProfileInvite(active, team, player), canManage: true }
  const created = await createParentProfileInvite(team, player, result.workspace.orgId || '', identity.user._id)
  return { success: true, invite: formatParentProfileInvite(created, team, player), canManage: true }
}

function formatParentInviteChecklist(invite, player) {
  const sources = [invite, player]
  const identity = readBooleanSetting(sources, ['identityVerificationRequired', 'requiresRealName', 'requireRealName'])
  const portrait = readBooleanSetting(sources, ['portraitRequired', 'requiresPortrait', 'requirePortrait'])
  const items = ['核对姓名和出生年月', '监护人授权']
  if (identity.defined && identity.value) items.push('实名认证（按当前要求）')
  if (portrait.defined && portrait.value) items.push('标准形象照')
  return items
}

function formatParentProfileInvite(invite, team, player) {
  const expiresAt = invite.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  return { id: String(invite._id || ''), token: String(invite.token || ''), playerId: String(player._id), playerName: String(player.name || '球员'), teamName: String(team.name || team.teamName || ''), guardianPhoneMasked: maskPhone(String(player.guardianPhone || player.contactPhone || invite.guardianPhone || '')), status: String(invite.status || 'active'), expiresAtText: dateText(expiresAt), h5Path: '/service-account-h5/?parentInvite=' + encodeURIComponent(String(invite.token || '')), requirements: formatParentInviteChecklist(invite, player) }
}

async function createParentProfileInvite(team, player, orgId, creatorId) {
  const now = db.serverDate(), token = 'pp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12)
  const data = { token, teamId: String(team._id), playerId: String(player._id), orgId, guardianPhone: String(player.guardianPhone || player.contactPhone || ''), status: 'active', creatorId, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), createTime: now, updateTime: now }
  const added = await db.collection('parent_profile_invites').add({ data })
  return Object.assign({ _id: added._id }, data)
}

async function ensureParentProfileInviteForPlayer(team, player, orgId, creatorId) {
  const rows = await safeGet('parent_profile_invites', { teamId: String(team._id), playerId: String(player._id), status: 'active' }, 20)
  const active = rows.find(item => !item.expiresAt || toTime(item.expiresAt) > Date.now())
  if (active) return active
  return await createParentProfileInvite(team, player, orgId, creatorId)
}

function parentProfileInviteUrl(token) {
  return 'https://www.sxffootball.cn/service-account-h5/?parentInvite=' + encodeURIComponent(String(token || '')) + '&entry=registered'
}

async function regenerateParentProfileInviteForWorkspace(event, identity) {
  const loaded = await parentProfileInviteForWorkspace(event, identity)
  const now = db.serverDate()
  if (loaded.invite.id) await db.collection('parent_profile_invites').doc(loaded.invite.id).update({ data: { status: 'expired', expiredAt: now, updateTime: now } })
  const result = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  const teams = await loadTeams(result.workspace, identity.user, identity.openId)
  const team = teams.find(item => String(item._id) === String(event.teamId || ''))
  const players = await safeGet('players', { _id: String(event.playerId || ''), teamId: String(event.teamId || '') }, 1)
  const invite = await createParentProfileInvite(team, players[0], result.workspace.orgId || '', identity.user._id)
  return { success: true, invite: formatParentProfileInvite(invite, team, players[0]), canManage: true }
}

async function officialRosterForWorkspace(event, identity) {
  const result = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  const permissions = result.workspace.permissions || []
  if (permissions.indexOf('team.view') < 0 && permissions.indexOf('team.manage') < 0) throw new Error('当前身份没有访问正式名单的权限')
  const teamId = String(event.teamId || ''), tournamentId = String(event.tournamentId || '')
  const teams = await loadTeams(result.workspace, identity.user, identity.openId)
  const team = teams.find(item => String(item._id) === teamId)
  if (!team || !tournamentId) throw new Error('赛事或球队不存在于当前工作空间')
  const tournament = (await safeGet('tournaments', { _id: tournamentId }, 1))[0]
  if (!tournament) throw new Error('赛事不存在')
  const registrations = await safeGet('tournament_teams', { tournamentId, teamId }, 20)
  const rosterContext = await resolveRosterContext(tournament, registrations, event)
  const players = (await safeGet('players', { teamId }, 500)).map(item => formatTeamPlayer(item, rosterContext.requirements))
  const snapshots = (await safeGet('roster_snapshots', { tournamentId, teamId }, 20))
    .filter(item => snapshotMatchesDivision(item, rosterContext.divisionId, rosterContext.allowLegacySnapshot))
  const latest = snapshots.sort((a, b) => toTime(b.updateTime || b.createTime) - toTime(a.updateTime || a.createTime))[0] || null
  const division = rosterContext.division || {}
  return { success: true, team: { id: teamId, name: firstValue(team.name, team.teamName), logo: firstValue(team.logo, team.logoUrl) }, tournament: { id: tournamentId, name: tournament.name || '赛事', divisionId: rosterContext.divisionId, divisionName: firstValue(rosterContext.registration.divisionName, division.name, division.divisionName, tournament.divisionName, '默认组别'), maxPlayers: Number(firstValue(division.rosterLimit, division.maxPlayersPerTeam, rosterContext.registration.maxPlayersPerTeam, tournament.maxPlayersPerTeam, tournament.maxPlayers, 20)), deadlineText: dateText(firstValue(division.registrationDeadline, tournament.registrationDeadline, tournament.signupDeadline)) }, requirements: rosterContext.requirements, players, snapshot: latest ? { id: String(latest._id), status: latest.status || 'draft', playerIds: latest.playerIds || [], divisionId: String(latest.divisionId || latest.division || rosterContext.divisionId), version: Number(latest.version || 1), returnReason: latest.returnReason || '', returnedAtText: dateText(latest.returnedAt) } : null, canManage: permissions.indexOf('team.manage') >= 0 }
}

async function submitOfficialRosterForWorkspace(event, identity) {
  const result = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  if ((result.workspace.permissions || []).indexOf('team.manage') < 0) throw new Error('当前身份没有提交正式名单的权限')
  const teamId = String(event.teamId || ''), tournamentId = String(event.tournamentId || '')
  const playerIds = unique(Array.isArray(event.playerIds) ? event.playerIds : [])
  const teams = await loadTeams(result.workspace, identity.user, identity.openId)
  if (!teams.some(item => String(item._id) === teamId) || !tournamentId) throw new Error('赛事或球队不存在于当前工作空间')
  const tournament = (await safeGet('tournaments', { _id: tournamentId }, 1))[0]
  if (!tournament) throw new Error('赛事不存在')
  const registrations = await safeGet('tournament_teams', { tournamentId, teamId }, 20)
  const rosterContext = await resolveRosterContext(tournament, registrations, event)
  const division = rosterContext.division || {}
  const deadline = toTime(firstValue(division.registrationDeadline, tournament.registrationDeadline, tournament.signupDeadline))
  if (deadline && Date.now() > deadline) throw new Error('报名已截止，名单不能通过常规流程修改')
  const max = Number(firstValue(division.rosterLimit, division.maxPlayersPerTeam, rosterContext.registration.maxPlayersPerTeam, tournament.maxPlayersPerTeam, tournament.maxPlayers, 20))
  if (!playerIds.length || playerIds.length > max) throw new Error('请选择符合上限的参赛球员')
  const rows = await safeGet('players', { teamId, _id: _.in(playerIds) }, 500)
  if (rows.length !== playerIds.length) throw new Error('名单包含不属于当前球队的球员')
  if (rows.some(item => formatTeamPlayer(item, rosterContext.requirements).profileStatus !== 'complete')) throw new Error('资料不完整或异常的球员不能进入正式名单')
  const existing = (await safeGet('roster_snapshots', { tournamentId, teamId }, 20))
    .filter(item => snapshotMatchesDivision(item, rosterContext.divisionId, rosterContext.allowLegacySnapshot))
  if (existing.some(item => ['submitted', 'approved', 'locked'].indexOf(String(item.status || '')) >= 0)) throw new Error('该赛事名单已提交或锁定，不能重复提交')
  const now = db.serverDate()
  const nextVersion = existing.reduce((max, item) => Math.max(max, Number(item.version || 1)), 0) + 1
  const snapshot = { tournamentId, teamId, divisionId: rosterContext.divisionId, divisionName: firstValue(rosterContext.registration.divisionName, division.name, division.divisionName, tournament.divisionName, ''), orgId: result.workspace.orgId || '', playerIds, version: nextVersion, status: 'submitted', submittedBy: identity.user._id, createTime: now, updateTime: now }
  const created = await db.collection('roster_snapshots').add({ data: snapshot })
  const team = teams.find(item => String(item._id) === teamId) || {}
  const organizerUserIds = await findOrganizationUserIds(result.workspace.orgId, 'event.manage')
  await publishWorkspaceMessage({
    orgId: result.workspace.orgId,
    recipientUserIds: organizerUserIds,
    category: 'event',
    title: '正式名单待审核',
    subtitle: (team.name || team.teamName || '球队') + '已提交' + (tournament.name || '赛事') + '正式名单，请及时审核。',
    path: '/pages/todo/index?tournamentId=' + encodeURIComponent(tournamentId) + '&teamId=' + encodeURIComponent(teamId),
    dedupeKey: 'roster-submitted:' + String(created._id)
  })
  return { success: true, snapshotId: String(created._id), status: 'submitted' }
}

async function returnOfficialRosterForOrganizer(event, identity) {
  const result = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  if ((result.workspace.permissions || []).indexOf('event.manage') < 0) throw new Error('当前身份没有退回正式名单的权限')
  const snapshotId = String(event.snapshotId || ''), reason = String(event.reason || '').trim()
  if (!snapshotId || !reason) throw new Error('请填写明确的退回原因')
  const rows = await safeGet('roster_snapshots', { _id: snapshotId }, 1)
  const snapshot = rows[0]
  if (!snapshot || String(snapshot.orgId || '') !== String(result.workspace.orgId || '')) throw new Error('名单快照不存在或不属于当前机构')
  if (String(snapshot.status || '') !== 'submitted') throw new Error('只有待审核名单可以退回')
  await db.collection('roster_snapshots').doc(snapshotId).update({ data: { status: 'returned', returnReason: reason, returnedBy: identity.user._id, returnedAt: db.serverDate(), updateTime: db.serverDate() } })
  const teamUserIds = await findTeamUserIds(snapshot.teamId)
  await publishWorkspaceMessage({
    orgId: result.workspace.orgId,
    recipientUserIds: teamUserIds,
    category: 'team',
    title: '正式名单需修改',
    subtitle: '主办方已退回本次正式名单：' + reason,
    path: '/pages/teams/index?teamId=' + encodeURIComponent(String(snapshot.teamId || '')),
    dedupeKey: 'roster-returned:' + snapshotId + ':' + reason
  })
  return { success: true, status: 'returned' }
}

async function matchLineupForWorkspace(event, identity) {
  const result = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  if ((result.workspace.permissions || []).indexOf('team.view') < 0 && (result.workspace.permissions || []).indexOf('team.manage') < 0) throw new Error('当前身份没有访问比赛阵容的权限')
  const matchId = String(event.matchId || ''), teamId = String(event.teamId || '')
  const teams = await loadTeams(result.workspace, identity.user, identity.openId)
  if (!teams.some(item => String(item._id) === teamId)) throw new Error('球队不属于当前工作空间')
  const match = (await safeGet('matches', { _id: matchId }, 1))[0]
  if (!match || [String(match.homeTeamId || ''), String(match.awayTeamId || '')].indexOf(teamId) < 0) throw new Error('比赛不存在或球队不参与该比赛')
  const tournamentId = String(match.tournamentId || '')
  const registrations = await safeGet('tournament_teams', { tournamentId, teamId }, 20)
  const matchDivisionId = String(match.divisionId || match.division || '')
  const registrationDivisionIds = unique(registrations.map(registrationDivisionId))
  if (!matchDivisionId && registrationDivisionIds.length > 1) throw new Error('比赛缺少竞赛组别信息，不能安全读取正式名单')
  const rosterDivisionId = matchDivisionId || registrationDivisionIds[0] || 'default'
  const allowLegacyRoster = registrationDivisionIds.length <= 1
  const roster = (await safeGet('roster_snapshots', { tournamentId, teamId, status: 'approved' }, 20))
    .filter(snapshot => snapshotMatchesDivision(snapshot, rosterDivisionId, allowLegacyRoster))
    .sort((a,b)=>toTime(b.updateTime)-toTime(a.updateTime))[0]
  if (!roster) throw new Error('尚未形成已审核赛事正式名单，不能编排单场阵容')
  const players = await safeGet('players', { teamId, _id: _.in(roster.playerIds || []) }, 100)
  const lineups = await safeGet('match_lineup_snapshots', { matchId, teamId }, 20)
  const latest = lineups.sort((a,b)=>toTime(b.updateTime)-toTime(a.updateTime))[0]
  const opponentIds = unique([String(match.homeTeamId || ''), String(match.awayTeamId || '')].filter(Boolean))
  const matchTeams = opponentIds.length ? await safeGet('teams', { _id: _.in(opponentIds) }, 2) : []
  const teamMap = {}
  matchTeams.forEach(item => { teamMap[String(item._id)] = item })
  const home = teamMap[String(match.homeTeamId || '')] || {}
  const away = teamMap[String(match.awayTeamId || '')] || {}
  return {
    success: true,
    workspaceOrgId: String(result.workspace.orgId || ''),
     match: { id: matchId, tournamentId, divisionId: rosterDivisionId, minPlayers: Number(match.minPlayers || 11), name: String(match.name || ''), matchDate: String(match.matchDate || ''), venue: String(match.venue || ''), divisionName: String(match.divisionName || match.division || ''), homeTeamName: String(home.name || match.homeTeamName || '主队'), awayTeamName: String(away.name || match.awayTeamName || '客队'), homeLogo: String(home.logoUrl || home.logo || ''), awayLogo: String(away.logoUrl || away.logo || '') },
    rosterId: String(roster._id),
    players: players.map(formatTeamPlayer),
    lineup: latest ? { id: String(latest._id), formation: String(latest.formation || ''), starters: latest.starters || [], substitutes: latest.substitutes || [], status: String(latest.status || ''), returnReason: String(latest.returnReason || ''), submittedAtText: dateText(firstValue(latest.updateTime, latest.createTime)) } : null,
    canManage: (result.workspace.permissions || []).indexOf('team.manage') >= 0
  }
}

async function submitMatchLineupForWorkspace(event, identity) {
  const loaded = await matchLineupForWorkspace(event, identity)
  if (!loaded.canManage) throw new Error('当前身份没有提交比赛阵容的权限')
  const starters = Array.isArray(event.starters) ? event.starters : []
  const substitutes = Array.isArray(event.substitutes) ? event.substitutes : []
  const ids = unique(starters.map(item => item.playerId).concat(substitutes.map(item => item.playerId)))
  const allowed = new Set(loaded.players.map(item => item.id))
  if (starters.length !== loaded.match.minPlayers || ids.length !== starters.length + substitutes.length || ids.some(id => !allowed.has(id))) throw new Error('首发人数或阵容成员不符合已审核正式名单')
  const existing = await safeGet('match_lineup_snapshots', { matchId: loaded.match.id, teamId: String(event.teamId || '') }, 20)
  if (existing.some(item => ['submitted', 'locked'].indexOf(String(item.status || '')) >= 0)) throw new Error('该场阵容已提交或锁定')
  const version = existing.reduce((max, item) => Math.max(max, Number(item.version || 1)), 0) + 1
  const now = db.serverDate()
  const created = await db.collection('match_lineup_snapshots').add({ data: { matchId: loaded.match.id, tournamentId: loaded.match.tournamentId, teamId: String(event.teamId || ''), rosterId: loaded.rosterId, formation: String(event.formation || ''), starters, substitutes, version, status: 'submitted', submittedBy: identity.user._id, createTime: now, updateTime: now } })
  const organizerUserIds = await findOrganizationUserIds(loaded.workspaceOrgId, 'event.manage')
  await publishWorkspaceMessage({
    orgId: loaded.workspaceOrgId,
    recipientUserIds: organizerUserIds,
    category: 'event',
    title: '比赛阵容待确认',
    subtitle: (loaded.match.homeTeamName || '主队') + ' vs ' + (loaded.match.awayTeamName || '客队') + '已有球队提交本场阵容，请在赛前完成确认。',
    path: '/pages/event/index?matchId=' + encodeURIComponent(loaded.match.id),
    dedupeKey: 'lineup-submitted:' + String(created._id)
  })
  return { success: true, lineupId: String(created._id), status: 'submitted' }
}

async function returnMatchLineupForOrganizer(event, identity) {
  const result = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  if ((result.workspace.permissions || []).indexOf('event.manage') < 0) throw new Error('当前身份没有退回比赛阵容的权限')
  const lineupId = String(event.lineupId || ''), reason = String(event.reason || '').trim()
  if (!lineupId || !reason) throw new Error('请填写明确的退回原因')
  const lineup = (await safeGet('match_lineup_snapshots', { _id: lineupId }, 1))[0]
  if (!lineup || String(lineup.status || '') !== 'submitted') throw new Error('只有待处理的已提交阵容可以退回')
  const tournament = (await safeGet('tournaments', { _id: String(lineup.tournamentId || '') }, 1))[0]
  if (!tournament || String(tournament.orgId || '') !== String(result.workspace.orgId || '')) throw new Error('该阵容不属于当前主办方工作空间')
  await db.collection('match_lineup_snapshots').doc(lineupId).update({ data: { status: 'returned', returnReason: reason, returnedBy: identity.user._id, returnedAt: db.serverDate(), updateTime: db.serverDate() } })
  const teamUserIds = await findTeamUserIds(lineup.teamId)
  await publishWorkspaceMessage({
    orgId: result.workspace.orgId,
    recipientUserIds: teamUserIds,
    category: 'team',
    title: '比赛阵容需修改',
    subtitle: '主办方已退回本场阵容：' + reason,
    path: '/pages/team/participation/participation?teamId=' + encodeURIComponent(String(lineup.teamId || '')),
    dedupeKey: 'lineup-returned:' + lineupId + ':' + reason
  })
  return { success: true, status: 'returned' }
}

function isLockedDivision(division) {
  const status = String(division.rulesStatus || division.status || '').toLowerCase()
  return division.rulesLocked === true || division.ruleFinalized === true || ['completed', 'finalized', 'locked', 'published'].indexOf(status) >= 0
}

function isProfessionalDivision(division) {
  return division.mode === 'professional' || division.isProfessional === true || division.plan === 'professional'
}

async function teamDataPackageForWorkspace(event, identity) {
  const result = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  if ((result.workspace.permissions || []).indexOf('team.view') < 0 && (result.workspace.permissions || []).indexOf('team.manage') < 0) throw new Error('当前身份没有访问球队数据包的权限')
  const teamId = String(event.teamId || ''), tournamentId = String(event.tournamentId || '')
  const teams = await loadTeams(result.workspace, identity.user, identity.openId)
  const team = teams.filter(item => String(item._id) === teamId)[0]
  if (!team) throw new Error('球队不属于当前工作空间')
  const tournament = (await safeGet('tournaments', { _id: tournamentId }, 1))[0]
  const registrations = await safeGet('tournament_teams', { tournamentId, teamId }, 20)
  const activeRegistrations = registrations.filter(item => ['approved', 'confirmed', 'claimed', 'accepted', 'active'].indexOf(String(item.status || '').toLowerCase()) >= 0)
  if (!tournament || !activeRegistrations.length) throw new Error('球队未建立该赛事的有效参赛关系')
  const requestedDivisionId = String(event.divisionId || '')
  const activeDivisionIds = unique(activeRegistrations.map(registrationDivisionId))
  if (!requestedDivisionId && activeDivisionIds.length > 1) throw new Error('该球队参加了多个竞赛组别，请先选择当前组别')
  const divisionId = requestedDivisionId || activeDivisionIds[0] || 'default'
  const registration = activeRegistrations.find(item => registrationDivisionId(item) === divisionId)
  if (!registration) throw new Error('球队未建立该赛事当前组别的有效参赛关系')
  const divisions = Array.isArray(tournament.divisions) ? tournament.divisions : []
  const division = divisions.filter(item => String(item.id || item._id || 'default') === divisionId)[0] || (divisionId === 'default' ? { id: 'default', name: tournament.divisionName || '默认组别', rulesLocked: tournament.rulesLocked, mode: tournament.mode } : null)
  if (!division) throw new Error('赛事组别不存在')
  const professional = isProfessionalDivision(division)
  const locked = isLockedDivision(division)
  const packages = await safeGet('team_data_packages', { teamId, tournamentId, divisionId, orgId: result.workspace.orgId || '' }, 20)
  const latest = packages.sort((a,b)=>toTime(b.updateTime)-toTime(a.updateTime))[0]
  return { success: true, tournament: { id: tournamentId, name: String(tournament.name || '') }, team: { id: teamId, name: String(team.name || team.teamName || '') }, division: { id: divisionId, name: String(division.name || division.divisionName || '默认组别'), professional, locked }, package: latest ? { id: String(latest._id), status: String(latest.status || ''), requestedAtText: dateText(firstValue(latest.updateTime, latest.createTime)) } : null, allowLegacyMatchDivision: activeDivisionIds.length === 1, canManage: (result.workspace.permissions || []).indexOf('team.manage') >= 0, canRequest: !professional && locked && (result.workspace.permissions || []).indexOf('team.manage') >= 0 }
}

async function requestTeamDataPackageForWorkspace(event, identity) {
  const loaded = await teamDataPackageForWorkspace(event, identity)
  const workspaceContext = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  const workspaceOrgId = String(workspaceContext.workspace.orgId || '')
  if (!loaded.canRequest) throw new Error('该组别当前不满足数据包开通申请条件')
  if (loaded.package && ['requested', 'enabled'].indexOf(loaded.package.status) >= 0) throw new Error('该数据包已申请或已开通')
  const now = db.serverDate()
  const created = await db.collection('team_data_packages').add({ data: { teamId: loaded.team.id, tournamentId: loaded.tournament.id, divisionId: loaded.division.id, orgId: workspaceOrgId, status: 'requested', requestedBy: identity.user._id, createTime: now, updateTime: now } })
  return { success: true, requestId: String(created._id), status: 'requested' }
}

async function teamDataPackageDataForWorkspace(event, identity) {
  const loaded = await teamDataPackageForWorkspace(event, identity)
  if (!loaded.package || loaded.package.status !== 'enabled') throw new Error('该赛事组别的球队数据包尚未开通')
  const teamId = loaded.team.id, tournamentId = loaded.tournament.id, divisionId = loaded.division.id
  const allMatches = await safeGet('matches', { tournamentId }, 500)
  const matches = allMatches.filter(item => [String(item.homeTeamId || ''), String(item.awayTeamId || '')].indexOf(teamId) >= 0 && snapshotMatchesDivision(item, divisionId, loaded.allowLegacyMatchDivision))
  const players = await safeGet('players', { teamId }, 500)
  const stats = {}
  players.forEach(item => { stats[String(item._id)] = { id: String(item._id), name: String(item.name || ''), photoUrl: String(item.photoUrl || item.photo || ''), goals: 0, assists: 0, appearances: 0 } })
  matches.forEach(match => {
    const appeared = new Set()
    ;(Array.isArray(match.events) ? match.events : []).forEach(eventItem => {
      const eventTeam = String(eventItem.teamId || eventItem.team || '')
      const playerId = String(eventItem.playerId || '')
      const assistId = String(eventItem.assistPlayerId || eventItem.assistId || '')
      if (eventTeam && eventTeam !== teamId) return
      if (stats[playerId]) {
        appeared.add(playerId)
        if (String(eventItem.type || '') === 'goal') stats[playerId].goals += 1
      }
      if (stats[assistId]) { appeared.add(assistId); if (String(eventItem.type || '') === 'assist' || String(eventItem.type || '') === 'goal') stats[assistId].assists += 1 }
    })
    appeared.forEach(id => { stats[id].appearances += 1 })
  })
  const playerStats = Object.keys(stats).map(id => stats[id]).sort((a,b) => b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name, 'zh-CN'))
  const summary = { matchCount: matches.length, goals: playerStats.reduce((sum,item) => sum + item.goals, 0), assists: playerStats.reduce((sum,item) => sum + item.assists, 0), appearancePlayers: playerStats.filter(item => item.appearances > 0).length }
  const recent = matches.sort((a,b)=>toTime(b.matchTime || b.matchDate)-toTime(a.matchTime || a.matchDate))[0]
  return { success: true, tournament: loaded.tournament, team: loaded.team, division: loaded.division, summary, players: playerStats, recentMatch: recent ? { id: String(recent._id), homeTeamName: String(recent.homeTeamName || '主队'), awayTeamName: String(recent.awayTeamName || '客队'), homeScore: String(firstValue(recent.homeScore, recent.scoreHome, 0)), awayScore: String(firstValue(recent.awayScore, recent.scoreAway, 0)), status: String(recent.status || ''), timeText: dateText(firstValue(recent.matchTime, recent.matchDate, recent.startTime)) } : null, canManage: loaded.canManage }
}

async function requestTeamDataExportForWorkspace(event, identity) {
  const loaded = await teamDataPackageDataForWorkspace(event, identity)
  const workspaceContext = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  const workspaceOrgId = String(workspaceContext.workspace.orgId || '')
  if (!loaded.canManage) throw new Error('当前身份没有导出本队数据的权限')
  const now = db.serverDate()
  const created = await db.collection('team_data_export_requests').add({ data: { teamId: loaded.team.id, tournamentId: loaded.tournament.id, divisionId: loaded.division.id, orgId: workspaceOrgId, status: 'requested', requestedBy: identity.user._id, createTime: now, updateTime: now } })
  return { success: true, requestId: String(created._id), status: 'requested' }
}

async function prebuiltTeamInviteForWorkspace(event, identity) {
  const inviteId = String(event.inviteId || event.token || '')
  if (!inviteId) throw new Error('缺少参赛邀请')
  const invite = (await safeGet('team_invitations', { _id: inviteId }, 1))[0]
  assertPrebuiltInviteActive(invite)
  if (!invite || String(invite.type || '') !== 'prebuilt_tournament_team') throw new Error('邀请不存在或已失效')
  if (invite.inviteeUserId && String(invite.inviteeUserId) !== String(identity.user._id)) throw new Error('该邀请不属于当前账号')
  if (invite.inviteeOpenId && String(invite.inviteeOpenId) !== String(identity.openId || '')) throw new Error('该邀请不属于当前微信账号')
  const inviteStatus = String(invite.status || 'pending')
  const reviewStatusAllowed = event.allowReviewRequired === true && ['review_required', 'review_approved', 'review_rejected'].indexOf(inviteStatus) >= 0
  if (inviteStatus !== 'pending' && !reviewStatusAllowed) throw new Error('该邀请已失效或已处理')
  const teamId = String(invite.teamId || ''), tournamentId = String(invite.tournamentId || '')
  const team = (await safeGet('teams', { _id: teamId }, 1))[0]
  const tournament = (await safeGet('tournaments', { _id: tournamentId }, 1))[0]
  if (!team || !tournament) throw new Error('预建球队或赛事不存在')
  assertPrebuiltInviteActive(invite, tournament)
  const workspaces = await loadWorkspaceCatalog(identity.user, identity.openId)
  const candidateTeams = []
  let managesPrebuiltTeam = false
  for (const item of workspaces) {
    if ((item.permissions || []).indexOf('team.manage') < 0) continue
    const rows = await loadTeams(item, identity.user, identity.openId)
    rows.forEach(row => {
      const rowId = String(row._id)
      if (rowId === teamId) managesPrebuiltTeam = true
      if (!candidateTeams.some(candidate => String(candidate.id) === rowId)) candidateTeams.push({ id: rowId, name: String(row.name || row.teamName || ''), playerCount: Number(row.playerCount || 0), workspaceId: item.id, isInvitedTeam: rowId === teamId })
    })
  }
  const claimStatus = String(team.claimStatus || 'unclaimed').toLowerCase()
  const hasOwnership = Boolean(team.ownerId || team.ownerUserId || team.claimedByUserId || (team.orgId && String(team.orgId) !== String(invite.organizerOrgId || '')))
  return { success: true, invite: { id: inviteId, status: inviteStatus, reviewRequestId: String(invite.reviewRequestId || ''), organizerName: String(invite.organizerName || ''), managerName: String(invite.managerName || ''), managerPhoneMasked: maskPhone(String(invite.managerPhone || '')), teamId, tournamentId, divisionName: String(invite.divisionName || '') }, tournament: { name: String(tournament.name || '') }, prebuiltTeam: { id: teamId, name: String(team.name || team.teamName || ''), claimStatus, managesPrebuiltTeam, requiresReview: !managesPrebuiltTeam && (claimStatus !== 'unclaimed' || hasOwnership) }, candidateTeams }
}

async function upsertRegistrationArtifact(collection, uniqueKey, data) {
  const existing = await safeGet(collection, { uniqueKey }, 2)
  if (existing.length) {
    await db.collection(collection).doc(existing[0]._id).update({ data: Object.assign({}, data, { updateTime: db.serverDate() }) })
    return existing[0]._id
  }
  const created = await db.collection(collection).add({ data: Object.assign({}, data, { uniqueKey, createTime: db.serverDate(), updateTime: db.serverDate() }) })
  return created._id
}

async function createRegistrationReviewArtifacts(invite, relationId, teamId, identity) {
  const tournamentId = String(invite.tournamentId || '')
  const divisionId = String(invite.divisionId || 'default')
  await upsertRegistrationArtifact('tournament_tasks', `${tournamentId}:registration_review:${relationId}`, { sport:'football', tournamentId, divisionId, teamId, registrationId:relationId, type:'registration_review', audience:'organizer', recipientOrgId:String(invite.organizerOrgId || ''), status:'pending', title:'审核受邀参赛球队', detail:String(invite.divisionName || '') })
  await upsertRegistrationArtifact('tournament_tasks', `${tournamentId}:registration_status:${teamId}`, { sport:'football', tournamentId, divisionId, teamId, registrationId:relationId, type:'registration_status', audience:'team', recipientUserId:String(identity.user._id || ''), status:'pending', title:'赛事报名审核中', detail:String(invite.divisionName || '') })
  await upsertRegistrationArtifact('notification_outbox', `targeted_registration_confirmed:${relationId}:task_center`, { sport:'football', businessEventId:`targeted_registration_confirmed:${relationId}`, tournamentId, registrationId:relationId, recipientOrgId:String(invite.organizerOrgId || ''), channel:'task_center', status:'delivered', targetPage:'pages/todo/index' })
  await db.collection('registration_audit_logs').add({ data:{ sport:'football', action:'targeted_registration_confirmed', tournamentId, divisionId, inviteId:String(invite._id || ''), registrationId:relationId, actorUserId:String(identity.user._id || ''), actorOrgId:'', result:'success', detail:{ teamId }, createTime:db.serverDate() } })
}

async function acceptPrebuiltTeamInviteForWorkspace(event, identity) {
  if (event.disclaimerAgreed !== true) throw new Error('请先阅读并同意参赛免责声明')
  const preview = await prebuiltTeamInviteForWorkspace(Object.assign({}, event, { allowReviewRequired: true }), identity)
  const invite = (await safeGet('team_invitations', { _id: preview.invite.id }, 1))[0]
  if (!invite || String(invite.type || '') !== 'prebuilt_tournament_team') throw new Error('邀请不存在或已失效')
  const tournament = (await safeGet('tournaments', { _id: preview.invite.tournamentId }, 1))[0]
  if (!tournament) throw new Error('赛事不存在或已下线')
  assertPrebuiltInviteActive(invite, tournament)
  const choice = String(event.choice || '')
  if (choice !== 'existing' && choice !== 'prebuilt') throw new Error('请选择接收方式')
  const inviteStatus = String(invite.status || 'pending')
  const reviewApproved = inviteStatus === 'review_approved'
  if (inviteStatus !== 'pending' && !reviewApproved) throw new Error('该邀请已提交人工审核或已处理')
  if (reviewApproved && choice !== 'prebuilt') throw new Error('人工核验已通过，请确认接收主办方预建球队')
  if (choice === 'existing' && preview.prebuiltTeam.requiresReview && !reviewApproved) throw new Error('claim review required before selecting an existing team')
  const now = db.serverDate()
  if (choice === 'existing') {
    const teamId = String(event.existingTeamId || '')
    const candidate = preview.candidateTeams.filter(item => item.id === teamId)[0]
    if (!candidate) throw new Error('只能选择当前账号可管理的既有球队')
    const existing = (await safeGet('tournament_teams', { tournamentId: preview.invite.tournamentId, teamId }, 20)).filter(item => String(item.divisionId || 'default') === String(invite.divisionId || 'default'))
    let relationId = ''
    if (!existing.length) {
      const created = await db.collection('tournament_teams').add({ data: { tournamentId: preview.invite.tournamentId, teamId, divisionId: invite.divisionId || 'default', divisionName:invite.divisionName || '', status: 'pending', claimStatus:'claimed', source: 'targeted_invite_existing_team', applicantUserId:identity.user._id, applicantMiniOpenId:identity.openId || '', inviteId:preview.invite.id, createTime: now, updateTime: now } })
      relationId = String(created._id)
    } else {
      relationId = String(existing[0]._id)
      await db.collection('tournament_teams').doc(relationId).update({ data:{ status:'pending', claimStatus:'claimed', source:'targeted_invite_existing_team', applicantUserId:identity.user._id, applicantMiniOpenId:identity.openId || '', inviteId:preview.invite.id, updateTime:now } })
    }
    if (String(invite.teamId || '') !== teamId && invite.tournamentTeamId) await db.collection('tournament_teams').doc(String(invite.tournamentTeamId)).update({ data:{ status:'replaced', replacedByTeamId:teamId, updateTime:now } })
    await db.collection('team_invitations').doc(preview.invite.id).update({ data: { status: 'accepted', acceptedChoice: 'existing', acceptedTeamId: teamId, acceptedUserId: identity.user._id, acceptedOpenId: identity.openId || '', updateTime: now } })
    await createRegistrationReviewArtifacts(invite, relationId, teamId, identity)
    return { success: true, teamId, registrationId:relationId, destination: 'team-center' }
  }
  if (preview.prebuiltTeam.requiresReview && !reviewApproved) {
    await db.collection('team_invitations').doc(preview.invite.id).update({ data: { status: 'review_required', reviewReason: '预建队存在归属或认领冲突，禁止自动合并', reviewRequestedBy: identity.user._id, updateTime: now } })
    return { success: true, reviewRequired: true, destination: 'claim-conflict' }
  }
  const membership = await safeGet('team_memberships', { teamId: preview.prebuiltTeam.id, userId: identity.user._id, status: 'accepted' }, 1)
  if (!membership.length) await db.collection('team_memberships').add({ data: { teamId: preview.prebuiltTeam.id, userId: identity.user._id, openId: identity.openId || '', role: 'owner', status: 'accepted', source: 'prebuilt_invite_claim', createTime: now, updateTime: now } })
  await db.collection('teams').doc(preview.prebuiltTeam.id).update({ data: { claimStatus: 'claimed', ownerId: identity.user._id, claimedByUserId: identity.user._id, updateTime: now } })
  await db.collection('team_invitations').doc(preview.invite.id).update({ data: { status: 'accepted', acceptedChoice: 'prebuilt', acceptedTeamId: preview.prebuiltTeam.id, acceptedUserId: identity.user._id, acceptedOpenId: identity.openId || '', reviewStatus: reviewApproved ? 'confirmed' : '', updateTime: now } })
  const relations = await safeGet('tournament_teams', { tournamentId: preview.invite.tournamentId, teamId: preview.prebuiltTeam.id }, 20)
  let relationId = ''
  for (const relation of relations) {
    const relationStatus = String(relation.status || '').toLowerCase()
    if (['approved', 'confirmed', 'claimed', 'accepted'].includes(relationStatus)) continue
    relationId = String(relation._id)
    await db.collection('tournament_teams').doc(relation._id).update({ data: { status:'pending', claimStatus: 'claimed', claimReviewStatus: 'confirmed', claimReviewRequestId: preview.invite.reviewRequestId || '', applicantUserId:identity.user._id, applicantMiniOpenId:identity.openId || '', acceptedUserId: identity.user._id, inviteId:preview.invite.id, updateTime: now } })
  }
  if (!relationId) {
    const created = await db.collection('tournament_teams').add({ data:{ tournamentId:preview.invite.tournamentId, divisionId:invite.divisionId || 'default', divisionName:invite.divisionName || '', teamId:preview.prebuiltTeam.id, status:'pending', claimStatus:'claimed', source:'targeted_invite_prebuilt_team', applicantUserId:identity.user._id, applicantMiniOpenId:identity.openId || '', inviteId:preview.invite.id, createTime:now, updateTime:now } })
    relationId = String(created._id)
  }
  await createRegistrationReviewArtifacts(invite, relationId, preview.prebuiltTeam.id, identity)
  return { success: true, teamId: preview.prebuiltTeam.id, registrationId:relationId, destination: 'team-center' }
}

async function requestPrebuiltTeamClaimReview(event, identity) {
  const preview = await prebuiltTeamInviteForWorkspace(Object.assign({}, event, { allowReviewRequired: true }), identity)
  const invite = (await safeGet('team_invitations', { _id: preview.invite.id }, 1))[0]
  if (!invite || String(invite.type || '') !== 'prebuilt_tournament_team') throw new Error('邀请不存在或已失效')
  const tournament = (await safeGet('tournaments', { _id: preview.invite.tournamentId }, 1))[0]
  if (!tournament) throw new Error('赛事不存在或已下线')
  assertPrebuiltInviteActive(invite, tournament)
  if (!preview.prebuiltTeam.requiresReview) throw workspaceError('CLAIM_REVIEW_NOT_REQUIRED', '当前邀请不需要人工审核')
  const proofMaterials = normalizeClaimReviewProofMaterials(event, preview.invite.id)
  const proofTypes = unique(proofMaterials.map(item => item.proofType)).slice(0, 3)

  const existingRequests = await safeGet('team_claim_review_requests', { inviteId: preview.invite.id }, 20)
  const activeRequest = existingRequests.find(item => ['pending', 'under_review'].indexOf(String(item.status || '').toLowerCase()) >= 0)
  if (activeRequest) {
    const activeUpdate = { status: 'review_required', reviewRequestId: activeRequest._id, updateTime: db.serverDate() }
    if (proofMaterials.length) {
      activeUpdate.proofMaterials = proofMaterials
      activeUpdate.proofTypes = proofTypes
      activeUpdate.proofMaterialCount = proofMaterials.length
      activeUpdate.proofRequired = true
      await db.collection('team_claim_review_requests').doc(activeRequest._id).update({ data: { proofMaterials, proofTypes, proofMaterialCount: proofMaterials.length, proofRequired: true, updateTime: activeUpdate.updateTime } })
    }
    if (String(invite.status || '') !== 'review_required' || proofMaterials.length) await db.collection('team_invitations').doc(preview.invite.id).update({ data: activeUpdate })
    return { success: true, reviewRequired: true, requestId: String(activeRequest._id), status: String(activeRequest.status || 'pending'), destination: 'claim-conflict', idempotent: true }
  }

  const allowedReasons = ['ownership_conflict', 'same_name', 'duplicate_organization', 'other']
  const reason = allowedReasons.indexOf(String(event.reason || '')) >= 0 ? String(event.reason) : 'ownership_conflict'
  if (!proofMaterials.length) throw workspaceError('CLAIM_PROOF_REQUIRED', '请至少上传一项证明材料')
  const now = db.serverDate()
  const created = await db.collection('team_claim_review_requests').add({ data: {
    inviteId: preview.invite.id,
    teamId: preview.invite.teamId,
    tournamentId: preview.invite.tournamentId,
    divisionId: invite.divisionId || 'default',
    organizerOrgId: invite.organizerOrgId || '',
    requesterUserId: identity.user._id,
    requesterOpenId: identity.openId || '',
    status: 'pending',
    reason,
    proofTypes,
    proofMaterials,
    proofMaterialCount: proofMaterials.length,
    proofRequired: true,
    source: 'mini_claim_conflict',
    createTime: now,
    updateTime: now
  } })
  const requestId = String(created._id)
  await db.collection('team_invitations').doc(preview.invite.id).update({ data: {
    status: 'review_required',
    reviewRequestId: requestId,
    reviewReason: '预建队存在归属或认领冲突，等待人工核验',
    reviewRequestedBy: identity.user._id,
    reviewRequestedAt: now,
    updateTime: now
  } })

  const relations = await safeGet('tournament_teams', { tournamentId: preview.invite.tournamentId, teamId: preview.invite.teamId }, 20)
  for (const relation of relations) {
    const currentStatus = String(relation.status || '').toLowerCase()
    if (['approved', 'confirmed', 'claimed', 'accepted'].indexOf(currentStatus) >= 0) continue
    await db.collection('tournament_teams').doc(relation._id).update({ data: { claimStatus: 'review_required', claimReviewStatus: 'pending', claimReviewRequestId: requestId, updateTime: now } })
  }
  return { success: true, reviewRequired: true, requestId, status: 'pending', destination: 'claim-conflict', proofRequired: true }
}

async function teamProfileForWorkspace(event, identity) {
  const result = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  if ((result.workspace.permissions || []).indexOf('team.view') < 0 && (result.workspace.permissions || []).indexOf('team.manage') < 0) throw new Error('当前身份没有查看球队资料的权限')
  const teamId = String(event.teamId || '')
  const teams = await loadTeams(result.workspace, identity.user, identity.openId)
  const team = teams.filter(item => String(item._id) === teamId)[0]
  if (!team) throw new Error('球队不属于当前工作空间')
  const raw = (await safeGet('teams', { _id: teamId }, 1))[0] || team
  const values = [raw.name || raw.teamName, raw.shortName, raw.ageGroup || raw.divisionName, raw.foundedYear || raw.establishedYear, raw.city || raw.cityName, raw.logoTransparent || raw.logo || raw.logoUrl]
  const completed = values.filter(Boolean).length
  const profile = { id: teamId, name: String(raw.name || raw.teamName || ''), shortName: String(raw.shortName || ''), ageGroup: String(raw.ageGroup || raw.divisionName || ''), foundedYear: String(raw.foundedYear || raw.establishedYear || ''), city: String(raw.city || raw.cityName || ''), logo: String(raw.logoTransparent || raw.logo || raw.logoUrl || ''), managerName: String(raw.managerName || raw.contactName || ''), managerPhoneMasked: maskPhone(String(raw.managerPhone || raw.contactPhone || '')), orgName: String(raw.orgName || raw.organizationName || ''), claimText: String(raw.claimStatus || '').toLowerCase() === 'claimed' ? '已认领' : '待认领', completeness: Math.round(completed / values.length * 100) }
  return { success: true, profile, canManage: (result.workspace.permissions || []).indexOf('team.manage') >= 0 }
}

async function saveTeamProfileForWorkspace(event, identity) {
  const loaded = await teamProfileForWorkspace(event, identity)
  if (!loaded.canManage) throw new Error('当前身份没有编辑球队资料的权限')
  const name = String(event.name || '').trim().slice(0, 30), shortName = String(event.shortName || '').trim().slice(0, 16)
  if (name.length < 2) throw new Error('球队名称需为 2—30 个字')
  const patch = { name, teamName: name, shortName, ageGroup: String(event.ageGroup || '').trim().slice(0, 20), foundedYear: String(event.foundedYear || '').trim().slice(0, 8), city: String(event.city || '').trim().slice(0, 40), managerName: String(event.managerName || '').trim().slice(0, 30), updateTime: db.serverDate() }
  await db.collection('teams').doc(loaded.profile.id).update({ data: patch })
  return { success: true }
}

async function teamMembersForWorkspace(event, identity) {
  const result = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  if ((result.workspace.permissions || []).indexOf('team.view') < 0 && (result.workspace.permissions || []).indexOf('team.manage') < 0) throw new Error('当前身份没有查看球队成员的权限')
  const teamId = String(event.teamId || ''), teams = await loadTeams(result.workspace, identity.user, identity.openId)
  const team = teams.filter(item => String(item._id) === teamId)[0]
  if (!team) throw new Error('球队不属于当前工作空间')
  const memberships = await safeGet('team_memberships', { teamId }, 200)
  const userIds = unique(memberships.map(item => item.userId || item.memberUserId))
  const users = userIds.length ? await safeGet('users', { _id: _.in(userIds) }, 200) : []
  const userMap = {}; users.forEach(item => { userMap[String(item._id)] = item })
  const members = memberships.map(item => { const user = userMap[String(item.userId || item.memberUserId)] || {}; const roles = item.roles || (item.role ? [item.role] : []); const roleText = roles.indexOf('owner') >= 0 || roles.indexOf('team_manager') >= 0 ? '负责人 / 管理员' : (roles.indexOf('coach') >= 0 ? '教练' : '成员'); return { id: String(item._id), name: String(user.name || user.nickName || item.name || '未命名成员'), avatar: String(user.avatarUrl || item.avatarUrl || ''), phoneMasked: maskPhone(String(user.phone || user.phoneNumber || item.phone || '')), roleText, statusText: String(item.status || '').toLowerCase() === 'accepted' || String(item.status || '').toLowerCase() === 'active' ? '已加入' : '待确认', pending: String(item.status || '').toLowerCase() !== 'accepted' && String(item.status || '').toLowerCase() !== 'active' } })
  const invitations = await safeGet('team_invitations', { teamId }, 100)
  invitations.filter(item => String(item.type || '') === 'team_member' && String(item.status || '') === 'pending' &&
    Boolean(item.inviteeName || item.inviteePhone) && (!item.expiresAt || toTime(item.expiresAt) > Date.now())
  ).forEach(item => members.push({ id: 'invite:' + item._id, inviteId: String(item._id), name: String(item.inviteeName || '待确认成员'), avatar: '', phoneMasked: maskPhone(String(item.inviteePhone || '')), roleText: String(item.roleText || '成员'), statusText: '待确认', pending: true }))
  return { success: true, team: { id: teamId, name: String(team.name || team.teamName || ''), logo: String(team.logo || team.logoTransparent || '') }, members, canManage: (result.workspace.permissions || []).indexOf('team.manage') >= 0 }
}

async function createTeamMemberInviteForWorkspace(event, identity) {
  const scope = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  if ((scope.workspace.permissions || []).indexOf('team.manage') < 0) throw new Error('当前身份没有邀请球队成员的权限')
  const loaded = await teamMembersForWorkspace(event, identity)
  const reusableInvites = await safeGet('team_invitations', {
    teamId: loaded.team.id,
    type: 'team_member',
    inviterUserId: identity.user._id
  }, 50)
  const reusable = reusableInvites.find(function(item) {
    return ['active', 'pending'].indexOf(String(item.status || '')) >= 0 && String(item.token || '').indexOf('tm_') === 0 && toTime(item.expiresAt) > Date.now()
  })
  if (reusable) {
    return {
      success: true,
      reused: true,
      inviteId: String(reusable._id),
      token: String(reusable.token),
      expiresAtText: dateText(reusable.expiresAt),
      path: '/pages/team/members/members?teamId=' + encodeURIComponent(loaded.team.id) + '&memberInviteId=' + encodeURIComponent(String(reusable.token))
    }
  }
  const token = 'tm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  const now = db.serverDate()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const created = await db.collection('team_invitations').add({ data: {
    token,
    teamId: loaded.team.id,
    orgId: String(scope.workspace.orgId || ''),
    type: 'team_member',
    status: 'active',
    usageMode: 'multi',
    inviterUserId: identity.user._id,
    acceptedCount: 0,
    memberRole: 'member',
    roleText: String(event.roleText || '管理成员').slice(0, 20),
    expiresAt,
    createTime: now,
    updateTime: now
  } })
  return {
    success: true,
    reused: false,
    inviteId: String(created._id),
    token,
    expiresAtText: dateText(expiresAt),
    path: '/pages/team/members/members?teamId=' + encodeURIComponent(loaded.team.id) + '&memberInviteId=' + encodeURIComponent(token)
  }
}

async function teamMemberInviteForWorkspace(event, identity) {
  const key = String(event.inviteId || event.token || '').trim()
  if (!key) throw new Error('缺少球队成员邀请')
  const lookup = key.indexOf('tm_') === 0 ? { token: key } : { _id: key }
  const invite = (await safeGet('team_invitations', lookup, 1))[0]
  if (!invite || String(invite.type || '') !== 'team_member') throw new Error('邀请不存在或已失效')
  if (['active', 'pending'].indexOf(String(invite.status || 'pending')) < 0) throw new Error('邀请不存在或已停用')
  if (invite.expiresAt && toTime(invite.expiresAt) > 0 && toTime(invite.expiresAt) <= Date.now()) throw new Error('邀请已过期，请让球队管理员重新邀请')
  const teamId = String(invite.teamId || '')
  const team = (await safeGet('teams', { _id: teamId }, 1))[0]
  if (!team) throw new Error('球队不存在或已停用')
  if (invite.orgId && team.orgId && String(invite.orgId) !== String(team.orgId)) throw new Error('邀请所属机构校验失败')
  const memberships = await safeGet('team_memberships', { teamId }, 200)
  const currentMembership = memberships.find(item => String(item.userId || item.memberUserId || '') === String(identity.user._id) && ['accepted', 'active'].indexOf(String(item.status || '').toLowerCase()) >= 0)
  return {
    success: true,
    invitation: {
      id: String(invite._id),
      roleText: String(invite.roleText || '成员'),
      expiresAtText: dateText(invite.expiresAt),
      status: String(invite.status || 'pending')
    },
    team: {
      id: teamId,
      name: String(team.name || team.teamName || ''),
      logo: String(team.logoTransparent || team.logo || team.logoUrl || '')
    },
    alreadyMember: Boolean(currentMembership)
  }
}

async function acceptTeamMemberInviteForWorkspace(event, identity) {
  const preview = await teamMemberInviteForWorkspace(event, identity)
  if (preview.alreadyMember) return { success: true, alreadyMember: true, teamId: preview.team.id, destination: '/pages/team/detail/detail?teamId=' + encodeURIComponent(preview.team.id) }
  const invite = (await safeGet('team_invitations', { _id: preview.invitation.id }, 1))[0]
  if (invite && invite.expiresAt && toTime(invite.expiresAt) > 0 && toTime(invite.expiresAt) <= Date.now()) throw workspaceError('TEAM_MEMBER_INVITE_EXPIRED', '成员邀请已过期，请让球队管理员重新邀请')
  if (!invite || ['active', 'pending'].indexOf(String(invite.status || 'pending')) < 0) throw new Error('邀请不存在或已停用')
  const memberships = await safeGet('team_memberships', { teamId: preview.team.id }, 200)
  const existing = memberships.find(item => String(item.userId || item.memberUserId || '') === String(identity.user._id))
  const now = db.serverDate()
  if (existing) {
    await db.collection('team_memberships').doc(String(existing._id)).update({ data: { status: 'accepted', updateTime: now } })
  } else {
    await db.collection('team_memberships').add({ data: {
      teamId: preview.team.id,
      orgId: String(invite.orgId || ''),
      userId: identity.user._id,
      openId: identity.openId || '',
      role: String(invite.memberRole || 'member'),
      roles: [String(invite.memberRole || 'member')],
      status: 'accepted',
      source: 'team_member_invite',
      inviteId: preview.invitation.id,
      createTime: now,
      updateTime: now
    } })
  }
  await db.collection('team_invitations').doc(preview.invitation.id).update({ data: {
    status: 'active',
    acceptedCount: _.inc(1),
    lastAcceptedUserId: identity.user._id,
    lastAcceptedOpenId: identity.openId || '',
    lastAcceptedAt: now,
    updateTime: now
  } })
  return { success: true, teamId: preview.team.id, destination: '/pages/team/detail/detail?teamId=' + encodeURIComponent(preview.team.id) }
}

async function createTeamPlayerInviteForWorkspace(event, identity) {
  const scope = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  if ((scope.workspace.permissions || []).indexOf('team.manage') < 0) throw new Error('当前身份没有邀请球员的权限')
  const teamId = String(event.teamId || '')
  const teams = await loadTeams(scope.workspace, identity.user, identity.openId)
  const team = teams.find(item => String(item._id) === teamId)
  if (!team) throw new Error('球队不存在或不属于当前工作空间')
  const rows = await safeGet('team_invitations', { teamId, type: 'team_player', inviterUserId: identity.user._id }, 50)
  const reusable = rows.find(item => ['active', 'pending'].indexOf(String(item.status || '')) >= 0 && String(item.token || '').indexOf('tp_') === 0 && toTime(item.expiresAt) > Date.now())
  if (reusable) {
    return {
      success: true,
      reused: true,
      inviteId: String(reusable._id),
      token: String(reusable.token),
      expiresAtText: dateText(reusable.expiresAt),
      path: '/pages/team/player-invite/player-invite?teamId=' + encodeURIComponent(teamId) + '&playerInviteId=' + encodeURIComponent(String(reusable.token))
    }
  }
  const token = 'tp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  const now = db.serverDate()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const created = await db.collection('team_invitations').add({ data: {
    token,
    teamId,
    orgId: String(scope.workspace.orgId || ''),
    type: 'team_player',
    purpose: 'player_profile_onboarding',
    status: 'active',
    usageMode: 'multi',
    inviterUserId: identity.user._id,
    acceptedCount: 0,
    expiresAt,
    createTime: now,
    updateTime: now
  } })
  return {
    success: true,
    reused: false,
    inviteId: String(created._id),
    token,
    expiresAtText: dateText(expiresAt),
    path: '/pages/team/player-invite/player-invite?teamId=' + encodeURIComponent(teamId) + '&playerInviteId=' + encodeURIComponent(token)
  }
}

async function teamPlayerInviteForWorkspace(event, identity) {
  const key = String(event.inviteId || event.token || '').trim()
  if (!key) throw new Error('缺少球员入队邀请')
  const lookup = key.indexOf('tp_') === 0 ? { token: key } : { _id: key }
  const invite = (await safeGet('team_invitations', lookup, 1))[0]
  if (!invite || String(invite.type || '') !== 'team_player') throw new Error('球员邀请不存在或已失效')
  if (['active', 'pending'].indexOf(String(invite.status || 'active')) < 0) throw new Error('球员邀请已停用')
  if (invite.expiresAt && toTime(invite.expiresAt) > 0 && toTime(invite.expiresAt) <= Date.now()) throw new Error('球员邀请已过期，请让球队管理员重新生成')
  const teamId = String(invite.teamId || '')
  const team = (await safeGet('teams', { _id: teamId }, 1))[0]
  if (!team) throw new Error('球队不存在或已停用')
  if (invite.orgId && team.orgId && String(invite.orgId) !== String(team.orgId)) throw new Error('邀请所属机构校验失败')
  const players = await safeGet('players', { teamId }, 500)
  const userId = String(identity.user._id || '')
  const openId = String(identity.openId || '')
  const existing = players.find(item => {
    const linkedIds = [item.linkedUserId, item.playerUserId].filter(Boolean).map(String)
    const linkedOpenIds = [item.linkedOpenId, item.playerOpenId].filter(Boolean).map(String)
    return (userId && linkedIds.indexOf(userId) >= 0) || (openId && linkedOpenIds.indexOf(openId) >= 0)
  })
  return {
    success: true,
    invitation: { id: String(invite._id), token: String(invite.token || ''), expiresAtText: dateText(invite.expiresAt) },
    team: { id: teamId, name: String(team.name || team.teamName || ''), logo: String(team.logoTransparent || team.logo || team.logoUrl || '') },
    existingPlayer: existing ? { id: String(existing._id), name: String(existing.name || '球员'), birthDate: String(firstValue(existing.birthDate, existing.birthday) || ''), profileStatus: String(existing.profileStatus || 'pending') } : null
  }
}

async function acceptTeamPlayerInviteForWorkspace(event, identity) {
  const preview = await teamPlayerInviteForWorkspace(event, identity)
  const invite = (await safeGet('team_invitations', { _id: preview.invitation.id }, 1))[0]
  if (!invite || ['active', 'pending'].indexOf(String(invite.status || 'active')) < 0) throw new Error('球员邀请不存在或已停用')
  const teamRecord = (await safeGet('teams', { _id: preview.team.id }, 1))[0] || { _id: preview.team.id, name: preview.team.name }
  if (preview.existingPlayer) {
    const existingRows = await safeGet('players', { _id: preview.existingPlayer.id, teamId: preview.team.id }, 1)
    const existingPlayer = existingRows[0]
    if (!existingPlayer) throw new Error('已关联的球员档案不存在，请联系球队管理员')
    const parentInvite = await ensureParentProfileInviteForPlayer(teamRecord, existingPlayer, String(invite.orgId || ''), identity.user._id)
    return { success: true, idempotent: true, player: preview.existingPlayer, team: preview.team, parentProfileUrl: parentProfileInviteUrl(parentInvite.token) }
  }
  const participantRole = String(event.participantRole || '') === 'player' ? 'player' : 'guardian'
  const name = String(event.name || '').trim().slice(0, 30)
  const birthDate = String(event.birthDate || '').trim()
  const guardianPhone = String(event.guardianPhone || '').replace(/\s/g, '')
  const allowedRelations = ['father', 'mother', 'other']
  const guardianRelation = allowedRelations.indexOf(String(event.guardianRelation || '')) >= 0 ? String(event.guardianRelation) : 'other'
  const jerseyNumber = String(event.jerseyNumber || '').trim().slice(0, 3)
  const allowedPositions = ['GK', 'DF', 'MF', 'FW']
  const position = allowedPositions.indexOf(String(event.position || '')) >= 0 ? String(event.position) : ''
  const birthTime = new Date(birthDate + 'T00:00:00').getTime()
  if (event.authorizationAgreed !== true) throw new Error('请确认已获得球员及监护人授权')
  if (name.length < 2) throw new Error('请填写真实球员姓名')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !Number.isFinite(birthTime) || birthTime > Date.now()) throw new Error('请选择正确的出生日期')
  if (!/^1\d{10}$/.test(guardianPhone)) throw new Error('请填写正确的监护人手机号')
  if (jerseyNumber && !/^\d{1,3}$/.test(jerseyNumber)) throw new Error('球衣号码只可填写数字')
  const teamPlayers = await safeGet('players', { teamId: preview.team.id }, 500)
  const duplicates = teamPlayers.filter(item => String(item.name || '') === name && String(firstValue(item.birthDate, item.birthday) || '') === birthDate)
  if (duplicates.length) {
    const currentUserId = String(identity.user._id || '')
    const currentOpenId = String(identity.openId || '')
    const owned = duplicates.find(item => {
      const userIds = participantRole === 'player' ? [item.linkedUserId, item.playerUserId] : [item.guardianUserId]
      const openIds = participantRole === 'player' ? [item.linkedOpenId, item.playerOpenId] : [item.guardianOpenId]
      return (currentUserId && userIds.filter(Boolean).map(String).indexOf(currentUserId) >= 0) || (currentOpenId && openIds.filter(Boolean).map(String).indexOf(currentOpenId) >= 0)
    })
    if (owned) {
      const parentInvite = await ensureParentProfileInviteForPlayer(teamRecord, owned, String(invite.orgId || ''), identity.user._id)
      return { success: true, idempotent: true, player: { id: String(owned._id), name: String(owned.name || name), profileStatus: String(owned.profileStatus || 'pending') }, team: preview.team, parentProfileUrl: parentProfileInviteUrl(parentInvite.token) }
    }
    throw workspaceError('PLAYER_PROFILE_CONFLICT', '球队中已有同名且出生日期相同的球员，请联系球队管理员人工核验，系统不会自动合并')
  }
  const now = db.serverDate()
  const playerData = {
    teamId: preview.team.id,
    orgId: String(invite.orgId || ''),
    name,
    birthDate,
    birthday: birthDate,
    guardianPhone,
    guardianRelation,
    contactPhone: guardianPhone,
    jerseyNumber,
    position,
    profileStatus: 'pending',
    needsParentCompletion: true,
    source: 'team_player_invite',
    playerInviteId: preview.invitation.id,
    applicantRole: participantRole,
    authorizationAgreed: true,
    authorizationConfirmedAt: now,
    createTime: now,
    updateTime: now
  }
  if (participantRole === 'player') {
    playerData.linkedUserId = identity.user._id
    playerData.linkedOpenId = identity.openId || ''
  } else {
    playerData.guardianUserId = identity.user._id
    playerData.guardianOpenId = identity.openId || ''
  }
  const created = await db.collection('players').add({ data: playerData })
  const createdPlayer = Object.assign({ _id: created._id }, playerData)
  const parentInvite = await ensureParentProfileInviteForPlayer(teamRecord, createdPlayer, String(invite.orgId || ''), identity.user._id)
  await db.collection('team_invitations').doc(preview.invitation.id).update({ data: {
    status: 'active',
    acceptedCount: _.inc(1),
    lastAcceptedUserId: identity.user._id,
    lastAcceptedOpenId: identity.openId || '',
    lastAcceptedAt: now,
    updateTime: now
  } })
  return { success: true, player: { id: String(created._id), name, profileStatus: 'pending' }, team: preview.team, parentProfileUrl: parentProfileInviteUrl(parentInvite.token) }
}

async function teamParticipationForWorkspace(event, identity) {
  const result = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  if ((result.workspace.permissions || []).indexOf('team.view') < 0 && (result.workspace.permissions || []).indexOf('team.manage') < 0) throw new Error('当前身份没有查看参赛管理的权限')
  const teamId = String(event.teamId || ''), teams = await loadTeams(result.workspace, identity.user, identity.openId)
  const team = teams.filter(item => String(item._id) === teamId)[0]
  if (!team) throw new Error('球队不属于当前工作空间')
  const registrations = await safeGet('tournament_teams', { teamId }, 200)
  const ids = unique(registrations.map(item => item.tournamentId))
  const tournaments = ids.length ? await safeGet('tournaments', { _id: _.in(ids) }, 200) : []
  const tournamentMap = {}; tournaments.forEach(item => { tournamentMap[String(item._id)] = item })
  const registrationsByTournament = {}
  registrations.forEach(item => {
    const key = String(item.tournamentId || '')
    if (!key) return
    if (!registrationsByTournament[key]) registrationsByTournament[key] = []
    registrationsByTournament[key].push(item)
  })
  const items = await Promise.all(registrations.map(async item => {
    const tournamentId = String(item.tournamentId || '')
    const tournament = tournamentMap[tournamentId] || {}, status = String(item.status || 'pending')
    const divisionId = registrationDivisionId(item)
    const sameTournamentRegistrations = registrationsByTournament[tournamentId] || []
    const allowLegacySnapshot = unique(sameTournamentRegistrations.map(registrationDivisionId)).length === 1
    const rosters = (await safeGet('roster_snapshots', { tournamentId, teamId }, 20))
      .filter(snapshot => snapshotMatchesDivision(snapshot, divisionId, allowLegacySnapshot))
    const roster = rosters.sort((a,b)=>toTime(b.updateTime)-toTime(a.updateTime))[0]
    const matches = await safeGet('matches', { tournamentId }, 200)
    const next = matches.filter(row => [String(row.homeTeamId || ''), String(row.awayTeamId || '')].indexOf(teamId) >= 0 && snapshotMatchesDivision(row, divisionId, allowLegacySnapshot) && ['completed','finished','archived'].indexOf(String(row.status || '')) < 0).sort((a,b)=>toTime(a.matchTime || a.matchDate)-toTime(b.matchTime || b.matchDate))[0]
    return { id: String(item._id), tournamentId, divisionId, name: String(tournament.name || '赛事'), divisionName: String(item.divisionName || tournament.divisionName || '默认组别'), status, statusText: status === 'confirmed' || status === 'active' ? '已确认' : '待确认', rosterText: roster ? (String(roster.status || '') === 'approved' ? '正式名单已审核' : '正式名单待处理') : '尚未提交正式名单', nextMatchId: next ? String(next._id) : '', nextMatchText: next ? dateText(firstValue(next.matchTime, next.matchDate, next.startTime)) : '暂无待进行比赛' }
  }))
  return { success: true, team: { id: teamId, name: String(team.name || '') }, items, canManage: (result.workspace.permissions || []).indexOf('team.manage') >= 0 }
}

async function teamTournamentDetailForWorkspace(event, identity) {
  const scoped = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  const permissions = scoped.workspace.permissions || []
  if (permissions.indexOf('team.view') < 0 && permissions.indexOf('team.manage') < 0) throw new Error('当前身份没有查看球队赛事详情的权限')
  const tournamentId = String(event.tournamentId || '')
  if (!tournamentId) throw new Error('缺少赛事信息')
  const teams = await loadTeams(scoped.workspace, identity.user, identity.openId)
  const accessibleTeamIds = unique(teams.map(item => item._id))
  const requestedTeamId = String(event.teamId || '')
  const requestedDivisionId = String(event.divisionId || '')
  if (requestedTeamId && accessibleTeamIds.indexOf(requestedTeamId) < 0) throw new Error('球队不属于当前工作空间')
  const registrations = await safeGet('tournament_teams', { tournamentId }, 200)
  const registration = registrations.find(item => {
    const teamMatches = requestedTeamId ? String(item.teamId || '') === requestedTeamId : accessibleTeamIds.indexOf(String(item.teamId || '')) >= 0
    const divisionMatches = requestedDivisionId ? registrationDivisionId(item) === requestedDivisionId : true
    return teamMatches && divisionMatches && ['cancelled', 'withdrawn', 'rejected'].indexOf(String(item.status || '').toLowerCase()) < 0
  })
  if (!registration) return { success: true, participating: false }
  const teamId = String(registration.teamId || '')
  const team = teams.find(item => String(item._id) === teamId)
  if (!team) throw new Error('当前球队资料不可用')
  const tournament = (await safeGet('tournaments', { _id: tournamentId }, 1))[0]
  if (!tournament) throw new Error('赛事不存在')
  const divisionId = registrationDivisionId(registration)
  let division = divisionId && divisionId !== 'default' ? (await safeGet('divisions', { _id: divisionId }, 1))[0] : null
  if (!division && Array.isArray(tournament.divisions)) division = tournament.divisions.find(item => String(item && (item._id || item.id) || '') === divisionId) || null
  division = division || {}

  const allMatches = await safeGet('matches', { tournamentId }, 300)
  const teamMatches = allMatches.filter(item => {
    const involved = [String(item.homeTeamId || ''), String(item.awayTeamId || '')].indexOf(teamId) >= 0 || [String(item.homeTeamName || ''), String(item.awayTeamName || '')].indexOf(String(team.name || '')) >= 0
    if (!involved) return false
    const matchDivisionId = String(item.divisionId || item.division || '')
    return !matchDivisionId || matchDivisionId === divisionId
  })
  const completedStatuses = ['completed', 'finished', 'archived']
  const completedMatches = teamMatches.filter(item => completedStatuses.indexOf(String(item.status || '').toLowerCase()) >= 0)
  const nextMatch = teamMatches.filter(item => completedStatuses.indexOf(String(item.status || '').toLowerCase()) < 0).sort((a, b) => {
    const left = toTime(firstValue(a.matchTime, a.matchDate, a.startTime)) || Number.MAX_SAFE_INTEGER
    const right = toTime(firstValue(b.matchTime, b.matchDate, b.startTime)) || Number.MAX_SAFE_INTEGER
    return left - right
  })[0] || null

  const opponentIds = unique(teamMatches.reduce((ids, item) => ids.concat([item.homeTeamId, item.awayTeamId]), []).filter(id => String(id || '') !== teamId))
  const opponentRows = opponentIds.length ? await safeGet('teams', { _id: _.in(opponentIds) }, 100) : []
  const teamMap = {}; teams.concat(opponentRows).forEach(item => { teamMap[String(item._id)] = item })
  const standings = await safeGet('standings', { tournamentId }, 200)
  const divisionStandings = standings.filter(item => {
    const itemDivisionId = String(item.divisionId || item.division || '')
    return !itemDivisionId || itemDivisionId === divisionId
  }).sort((a, b) => Number(b.points || 0) - Number(a.points || 0) || Number(b.goalDiff || 0) - Number(a.goalDiff || 0))
  const standingIndex = divisionStandings.findIndex(item => String(item.teamId || '') === teamId || String(item.teamName || '') === String(team.name || ''))
  const standing = standingIndex >= 0 ? divisionStandings[standingIndex] : null
  let computedPoints = 0
  completedMatches.forEach(item => {
    const isHome = String(item.homeTeamId || '') === teamId || String(item.homeTeamName || '') === String(team.name || '')
    const own = Number(isHome ? firstValue(item.homeScore, item.scoreHome, 0) : firstValue(item.awayScore, item.scoreAway, 0))
    const opponent = Number(isHome ? firstValue(item.awayScore, item.scoreAway, 0) : firstValue(item.homeScore, item.scoreHome, 0))
    computedPoints += own > opponent ? 3 : (own === opponent ? 1 : 0)
  })
  const snapshots = (await safeGet('roster_snapshots', { tournamentId, teamId }, 20)).filter(item => snapshotMatchesDivision(item, divisionId, true))
  const legacyRosters = await safeGet('rosters', { tournamentId, teamId }, 20)
  const roster = snapshots.concat(legacyRosters).sort((a, b) => toTime(firstValue(b.updateTime, b.updatedAt, b.submitTime)) - toTime(firstValue(a.updateTime, a.updatedAt, a.submitTime)))[0] || null
  const rosterPlayers = roster ? (roster.players || roster.playerIds || roster.rosterPlayers || []) : []
  const rosterStatus = String(roster && roster.status || '')
  const rosterApproved = ['approved', 'confirmed', 'locked'].indexOf(rosterStatus) >= 0
  const registrationStatus = String(registration.status || '').toLowerCase()
  const statusText = ['approved', 'confirmed', 'active', 'locked'].indexOf(registrationStatus) >= 0 ? '已确认' : (registrationStatus === 'pending' ? '审核中' : '待确认')
  const isProfessional = division.mode === 'professional' || division.isProfessional === true || String(division.ruleMode || '').toLowerCase() === 'professional'

  function teamBrief(id, fallbackName, fallbackLogo) {
    const row = teamMap[String(id || '')] || {}
    return { id: String(id || ''), name: String(row.name || row.teamName || fallbackName || '球队待定'), logo: String(row.logo || row.logoTransparent || row.logoOriginal || fallbackLogo || '') }
  }
  let next = null
  if (nextMatch) {
    const start = firstValue(nextMatch.matchTime, nextMatch.matchDate, nextMatch.startTime)
    next = {
      id: String(nextMatch._id || ''),
      startTime: start,
      dateText: dateText(start),
      timeText: start ? new Date(toTime(start)).toISOString().slice(11, 16) : '时间待定',
      venue: String(firstValue(nextMatch.venue, nextMatch.location, nextMatch.fieldName, '场地待定')),
      home: teamBrief(nextMatch.homeTeamId, nextMatch.homeTeamName, nextMatch.homeTeamLogo),
      away: teamBrief(nextMatch.awayTeamId, nextMatch.awayTeamName, nextMatch.awayTeamLogo)
    }
  }
  return {
    success: true,
    participating: true,
    canManage: permissions.indexOf('team.manage') >= 0,
    tournament: { id: tournamentId, name: String(tournament.name || '赛事'), startDate: firstValue(tournament.startDate, tournament.startTime), endDate: firstValue(tournament.endDate, tournament.endTime), location: String(firstValue(tournament.location, tournament.venue, tournament.region, '地点待定')) },
    division: { id: divisionId, name: String(registration.divisionName || division.name || division.divisionName || '默认组别'), modeText: (isProfessional ? 'PRO · ' : '简易 · ') + String(registration.divisionName || division.name || division.divisionName || '默认组别') },
    registration: { id: String(registration._id), status: registrationStatus, statusText },
    team: { id: teamId, name: String(team.name || team.teamName || registration.teamName || '当前球队'), logo: String(team.logo || team.logoTransparent || team.logoOriginal || registration.teamLogo || '') },
    summary: { rank: standingIndex >= 0 ? standingIndex + 1 : 0, rankTotal: divisionStandings.length, played: Number(firstValue(standing && standing.played, standing && standing.matches, completedMatches.length, 0)), points: Number(firstValue(standing && standing.points, computedPoints, 0)) },
    roster: { exists: Boolean(roster), approved: rosterApproved, status: rosterStatus, playerCount: Array.isArray(rosterPlayers) ? rosterPlayers.length : Number(roster && roster.playerCount || 0), maxPlayers: Number(firstValue(division.maxPlayersPerTeam, division.maxPlayers, tournament.maxPlayersPerTeam, tournament.maxPlayers, 20)) },
    nextMatch: next,
    canSubmitLineup: Boolean(next && rosterApproved && ['approved', 'confirmed', 'active', 'locked'].indexOf(registrationStatus) >= 0)
  }
}

async function teamHistoryForWorkspace(event, identity) {
  const result = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  if ((result.workspace.permissions || []).indexOf('team.view') < 0 && (result.workspace.permissions || []).indexOf('team.manage') < 0) throw new Error('当前身份没有查看历史参赛记录的权限')
  const teamId = String(event.teamId || ''), teams = await loadTeams(result.workspace, identity.user, identity.openId)
  const team = teams.filter(item => String(item._id) === teamId)[0]
  if (!team) throw new Error('球队不属于当前工作空间')
  const registrations = await safeGet('tournament_teams', { teamId }, 200)
  const tournamentIds = unique(registrations.map(item => item.tournamentId))
  const tournaments = tournamentIds.length ? await safeGet('tournaments', { _id: _.in(tournamentIds) }, 200) : []
  const tournamentMap = {}; tournaments.forEach(item => { tournamentMap[String(item._id)] = item })
  const registrationsByTournament = {}
  registrations.forEach(item => {
    const key = String(item.tournamentId || '')
    if (!key) return
    if (!registrationsByTournament[key]) registrationsByTournament[key] = []
    registrationsByTournament[key].push(item)
  })
  const archivedStatuses = ['completed', 'finished', 'archived', 'closed', 'withdrawn', 'exited']
  const items = await Promise.all(registrations.map(async item => {
    const tournamentId = String(item.tournamentId || '')
    const tournament = tournamentMap[tournamentId] || {}
    const divisionId = registrationDivisionId(item)
    const sameTournamentRegistrations = registrationsByTournament[tournamentId] || []
    const allowLegacySnapshot = unique(sameTournamentRegistrations.map(registrationDivisionId)).length === 1
    const registrationStatus = String(item.status || '').toLowerCase()
    const tournamentStatus = String(firstValue(tournament.status, tournament.tournamentStatus, '')).toLowerCase()
    const isExited = ['withdrawn', 'exited', 'cancelled'].indexOf(registrationStatus) >= 0
    const isArchived = archivedStatuses.indexOf(registrationStatus) >= 0 || archivedStatuses.indexOf(tournamentStatus) >= 0
    if (!isArchived) return null
    const matches = await safeGet('matches', { tournamentId }, 200)
    const teamMatches = matches.filter(row => [String(row.homeTeamId || ''), String(row.awayTeamId || '')].indexOf(teamId) >= 0 && snapshotMatchesDivision(row, divisionId, allowLegacySnapshot) && ['completed', 'finished', 'archived'].indexOf(String(row.status || '').toLowerCase()) >= 0)
    let wins = 0, draws = 0, losses = 0
    teamMatches.forEach(row => {
      const isHome = String(row.homeTeamId || '') === teamId
      const own = Number(isHome ? firstValue(row.homeScore, row.scoreHome, 0) : firstValue(row.awayScore, row.scoreAway, 0))
      const opponent = Number(isHome ? firstValue(row.awayScore, row.scoreAway, 0) : firstValue(row.homeScore, row.scoreHome, 0))
      if (own > opponent) wins += 1
      else if (own < opponent) losses += 1
      else draws += 1
    })
    const rank = String(firstValue(item.finalRank, item.rank, item.placement, ''))
    const start = firstValue(tournament.startDate, tournament.startTime, item.startDate)
    const end = firstValue(tournament.endDate, item.endDate)
    return {
      id: String(item._id), tournamentId, divisionId, name: String(tournament.name || '已归档赛事'), divisionName: String(item.divisionName || tournament.divisionName || '竞赛组别待定'), dateText: dateText(start) + (end ? '—' + dateText(end) : ''), resultText: isExited ? '已退出' : (rank || '已归档'), resultClass: isExited ? 'withdrawn' : 'ranked', recordText: teamMatches.length + '场 ' + wins + '胜 ' + draws + '平 ' + losses + '负', archiveStatusText: isExited ? '退出记录' : '已归档'
    }
  }))
  const history = items.filter(Boolean).sort((a, b) => String(b.dateText).localeCompare(String(a.dateText)))
  return { success: true, team: { id: teamId, name: String(team.name || ''), logo: String(team.logo || team.logoTransparent || '') }, items: history, counts: { all: history.length, completed: history.filter(item => item.archiveStatusText === '已归档').length, exited: history.filter(item => item.archiveStatusText === '退出记录').length } }
}

async function reviewRefereeRecordForWorkspace(event, identity) {
  const scoped = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  const workspace = scoped.workspace
  if ((workspace.permissions || []).indexOf('event.manage') < 0) {
    throw new Error('当前身份没有赛果复核权限')
  }
  if (workspace.type !== 'organization' || !workspace.orgId) {
    throw new Error('临时球队工作空间不能复核赛事赛果')
  }
  const matchId = String(event.matchId || '')
  const operation = String(event.operation || '')
  if (!matchId || (operation !== 'archive' && operation !== 'return')) {
    throw new Error('复核请求参数无效')
  }
  const match = (await safeGet('matches', { _id: matchId }, 1))[0]
  if (!match) throw new Error('比赛不存在或无访问权限')
  const teams = await loadTeams(workspace, identity.user, identity.openId)
  const tournamentResult = await loadTournaments(workspace, identity.user, identity.openId, teams)
  const hosted = (tournamentResult.tournaments || []).some(item => {
    return String(item._id) === String(match.tournamentId || '') &&
      (item.workspaceRelation === 'hosted' || item.workspaceRelation === 'both')
  })
  if (!hosted) throw new Error('当前机构无权复核该赛事比赛记录')
  if (!match.refereeRecord || String(match.refereeReviewStatus || '') !== 'under_review' || !match.refereeRecordLocked) {
    throw new Error('当前记录不在待复核状态')
  }
  const now = new Date()
  const actor = String(identity.user.nickname || identity.user.userName || identity.user.phone || identity.user._id || '赛事主办方').slice(0, 50)
  const record = Object.assign({}, match.refereeRecord)
  const logs = Array.isArray(match.refereeWorkflowLogs) ? match.refereeWorkflowLogs.slice(-100) : []
  const updateData = { refereeWorkflowLogs: logs }
  if (operation === 'archive') {
    record.reviewStatus = 'archived'
    record.archivedAt = now
    record.archivedBy = actor
    logs.push({ action: 'archive_referee_record', actorUserId: identity.user._id, actor: actor, at: now })
    Object.assign(updateData, { refereeRecord: record, refereeReviewStatus: 'archived', refereeRecordArchivedAt: db.serverDate() })
  } else {
    const reason = String(event.reason || '').trim().slice(0, 300)
    const fields = Array.isArray(event.fields) ? event.fields.map(String).filter(function(field) {
      return /^event_player(?::[A-Za-z0-9_-]+)?$/.test(field)
    }).slice(0, 10) : []
    if (!reason || !fields.length) throw new Error('退回必须填写原因并限定可修正的比赛事件字段')
    const sourceEvents = Array.isArray(match.events) ? match.events : []
    const eventIds = new Set(sourceEvents.map(function(item) { return String(item && item.eventId || '') }))
    if (fields.some(function(field) { return field.indexOf(':') >= 0 && !eventIds.has(field.slice(field.indexOf(':') + 1)) })) {
      throw new Error('退回范围包含不存在的比赛事件')
    }
    const request = { reason: reason, fields: fields, returnedAt: now, returnedBy: actor, returnedByUserId: identity.user._id }
    record.reviewStatus = 'returned'
    record.returnRequest = request
    logs.push({ action: 'return_referee_record', actorUserId: identity.user._id, actor: actor, detail: { reason: reason, fields: fields }, at: now })
    Object.assign(updateData, { refereeRecord: record, refereeReviewStatus: 'returned', returnRequest: request })
  }
  await db.collection('matches').doc(matchId).update({ data: updateData })
  return { success: true, reviewStatus: updateData.refereeReviewStatus, message: operation === 'archive' ? '赛果已确认归档' : '电子记录已退回裁判限定修正' }
}

async function reportMatchExceptionForWorkspace(event, identity) {
  const scoped = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  const workspace = scoped.workspace
  if ((workspace.permissions || []).indexOf('event.manage') < 0 || workspace.type !== 'organization') throw new Error('当前身份没有发起赛事异常的权限')
  const matchId = String(event.matchId || '')
  const type = String(event.type || '')
  const description = String(event.description || '').trim().slice(0, 500)
  const contactName = String(event.contactName || '').trim().slice(0, 50)
  const contactPhone = String(event.contactPhone || '').replace(/\s/g, '').slice(0, 20)
  const allowedTypes = ['referee_absent', 'data_sync', 'match_interrupted', 'venue_equipment', 'other']
  if (!matchId || allowedTypes.indexOf(type) < 0 || !description || !contactName || !contactPhone) throw new Error('请完整填写异常类型、说明和现场联系人')
  const match = (await safeGet('matches', { _id: matchId }, 1))[0]
  if (!match) throw new Error('比赛不存在或无访问权限')
  const teams = await loadTeams(workspace, identity.user, identity.openId)
  const tournamentResult = await loadTournaments(workspace, identity.user, identity.openId, teams)
  const hosted = (tournamentResult.tournaments || []).some(item => String(item._id) === String(match.tournamentId || '') && (item.workspaceRelation === 'hosted' || item.workspaceRelation === 'both'))
  if (!hosted) throw new Error('当前机构无权为该比赛发起异常')
  const evidenceFileIds = (Array.isArray(event.evidenceFileIds) ? event.evidenceFileIds : []).map(String).filter(function(item) { return item.indexOf('cloud://') === 0 }).slice(0, 3)
  const now = new Date()
  const reporter = String(identity.user.nickname || identity.user.userName || identity.user.phone || identity.user._id || '赛事主办方').slice(0, 50)
  const report = { matchId: matchId, tournamentId: String(match.tournamentId || ''), orgId: String(workspace.orgId || ''), type: type, description: description, contactName: contactName, contactPhone: contactPhone, evidenceFileIds: evidenceFileIds, status: 'reported', reporterUserId: identity.user._id, reporterName: reporter, createdAt: now, updateTime: now, timeline: [{ type: 'reported', at: now, actor: reporter, text: '主办方已提交异常，等待现场确认' }] }
  const result = await db.collection('match_exception_reports').add({ data: report })
  await db.collection('matches').doc(matchId).update({ data: { latestExceptionStatus: 'reported', latestExceptionReportId: result._id, updateTime: db.serverDate() } })
  return { success: true, reportId: result._id, status: 'reported', message: '异常已提交，已进入现场跟踪流程' }
}

async function listMatchExceptionsForWorkspace(event, identity) {
  const scoped = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  const workspace = scoped.workspace
  if ((workspace.permissions || []).indexOf('event.manage') < 0 || workspace.type !== 'organization') throw new Error('当前身份没有查看赛事异常的权限')
  const matchId = String(event.matchId || '')
  const match = (await safeGet('matches', { _id: matchId }, 1))[0]
  if (!match) throw new Error('比赛不存在或无访问权限')
  const teams = await loadTeams(workspace, identity.user, identity.openId)
  const tournamentResult = await loadTournaments(workspace, identity.user, identity.openId, teams)
  const hosted = (tournamentResult.tournaments || []).some(item => String(item._id) === String(match.tournamentId || '') && (item.workspaceRelation === 'hosted' || item.workspaceRelation === 'both'))
  if (!hosted) throw new Error('当前机构无权查看该比赛异常')
  const reports = await safeGet('match_exception_reports', { matchId: matchId, orgId: String(workspace.orgId || '') }, 50)
  return { success: true, reports: reports.sort(function(a, b) { return toTime(b.updateTime || b.createdAt) - toTime(a.updateTime || a.createdAt) }).map(function(item) { return { id: String(item._id), type: String(item.type || ''), description: String(item.description || ''), status: String(item.status || 'reported'), reporterName: String(item.reporterName || ''), createdAtText: dateText(item.createdAt), timeline: Array.isArray(item.timeline) ? item.timeline.slice(-8).map(function(row) { return { type: String(row.type || ''), text: String(row.text || ''), actor: String(row.actor || ''), atText: dateText(row.at) } }) : [] } }) }
}

exports.main = async function(event) {
  event = event || {}
  try {
    const identity = await findCurrentUser()
    if (event.action === 'messages') {
      const scoped = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
      const messages = await loadMessagesForWorkspace(scoped.workspace, identity.user, identity.openId)
      return Object.assign({ success: true, workspaceId: scoped.workspace.id }, messages)
    }
    if (event.action === 'markMessageRead') return await markMessagesRead(event, identity)
    if (event.action === 'setHomeIdentity') return await saveHomeIdentity(event, identity)
    if (event.action === 'teamPlayers') return await loadTeamPlayersForWorkspace(event, identity)
    if (event.action === 'teamPlayerDetail') return await loadTeamPlayerDetailForWorkspace(event, identity)
    if (event.action === 'teamPlayerEdit') return await loadTeamPlayerForEditForWorkspace(event, identity)
    if (event.action === 'saveTeamPlayer') return await saveTeamPlayerForWorkspace(event, identity)
    if (event.action === 'archiveTeamPlayer') return await archiveTeamPlayerForWorkspace(event, identity)
    if (event.action === 'remindParentProfile') return await remindParentProfileForWorkspace(event, identity)
    if (event.action === 'parentProfileInvite') return await parentProfileInviteForWorkspace(event, identity)
    if (event.action === 'regenerateParentProfileInvite') return await regenerateParentProfileInviteForWorkspace(event, identity)
    if (event.action === 'officialRoster') return await officialRosterForWorkspace(event, identity)
    if (event.action === 'submitOfficialRoster') return await submitOfficialRosterForWorkspace(event, identity)
    if (event.action === 'returnOfficialRoster') return await returnOfficialRosterForOrganizer(event, identity)
    if (event.action === 'matchLineup') return await matchLineupForWorkspace(event, identity)
    if (event.action === 'submitMatchLineup') return await submitMatchLineupForWorkspace(event, identity)
    if (event.action === 'returnMatchLineup') return await returnMatchLineupForOrganizer(event, identity)
    if (event.action === 'teamDataPackage') return await teamDataPackageForWorkspace(event, identity)
    if (event.action === 'requestTeamDataPackage') return await requestTeamDataPackageForWorkspace(event, identity)
    if (event.action === 'teamDataPackageData') return await teamDataPackageDataForWorkspace(event, identity)
    if (event.action === 'requestTeamDataExport') return await requestTeamDataExportForWorkspace(event, identity)
    if (event.action === 'prebuiltTeamInvite') return await prebuiltTeamInviteForWorkspace(Object.assign({}, event, { allowReviewRequired: true }), identity)
    if (event.action === 'acceptPrebuiltTeamInvite') return await acceptPrebuiltTeamInviteForWorkspace(event, identity)
    if (event.action === 'requestPrebuiltTeamClaimReview') return await requestPrebuiltTeamClaimReview(event, identity)
    if (event.action === 'teamProfile') return await teamProfileForWorkspace(event, identity)
    if (event.action === 'saveTeamProfile') return await saveTeamProfileForWorkspace(event, identity)
    if (event.action === 'teamMembers') return await teamMembersForWorkspace(event, identity)
    if (event.action === 'createTeamMemberInvite') return await createTeamMemberInviteForWorkspace(event, identity)
    if (event.action === 'teamMemberInvite') return await teamMemberInviteForWorkspace(event, identity)
    if (event.action === 'acceptTeamMemberInvite') return await acceptTeamMemberInviteForWorkspace(event, identity)
    if (event.action === 'createTeamPlayerInvite') return await createTeamPlayerInviteForWorkspace(event, identity)
    if (event.action === 'teamPlayerInvite') return await teamPlayerInviteForWorkspace(event, identity)
    if (event.action === 'acceptTeamPlayerInvite') return await acceptTeamPlayerInviteForWorkspace(event, identity)
    if (event.action === 'teamParticipation') return await teamParticipationForWorkspace(event, identity)
    if (event.action === 'teamTournamentDetail') return await teamTournamentDetailForWorkspace(event, identity)
    if (event.action === 'teamHistory') return await teamHistoryForWorkspace(event, identity)
    if (event.action === 'reviewRefereeRecord') return await reviewRefereeRecordForWorkspace(event, identity)
    if (event.action === 'reportMatchException') return await reportMatchExceptionForWorkspace(event, identity)
    if (event.action === 'listMatchExceptions') return await listMatchExceptionsForWorkspace(event, identity)
    const workspaces = await loadWorkspaceCatalog(identity.user, identity.openId)
    if (!workspaces.length) throw new Error('当前账号尚未建立可用工作空间')

    const requestedId = String(event.workspaceId || '')
    const current = workspaces.find(item => item.id === requestedId) || workspaces[0]
    if ((current.permissions || []).some(item => String(item).indexOf('event.') === 0)) {
      current.capabilities = unique((current.capabilities || []).concat(['event']))
    }
    if ((current.permissions || []).some(item => String(item).indexOf('team.') === 0)) {
      current.capabilities = unique((current.capabilities || []).concat(['team']))
    }
    const permissionSet = new Set(current.permissions || [])
    const canViewTeams = permissionSet.has('team.view') || permissionSet.has('team.manage')
    const canViewEvents = permissionSet.has('event.view') || permissionSet.has('event.manage')
    const teams = canViewTeams
      ? await loadTeams(current, identity.user, identity.openId)
      : []
    const tournamentResult = canViewEvents
      ? await loadTournaments(current, identity.user, identity.openId, teams)
      : { tournaments: [], registrations: [], hostedRegistrations: [] }
    const tournaments = Array.isArray(tournamentResult)
      ? tournamentResult
      : tournamentResult.tournaments
    let registrations = Array.isArray(tournamentResult)
      ? []
      : tournamentResult.registrations
    const hostedRegistrations = Array.isArray(tournamentResult)
      ? []
      : (tournamentResult.hostedRegistrations || [])
    if (current.type === 'team' && canViewEvents) {
      registrations = await safeGet('tournament_teams', { teamId: current.teamId }, 100)
      const ids = unique(registrations.map(item => item.tournamentId))
      if (ids.length) {
        const participated = await safeGet('tournaments', { _id: _.in(ids) }, 100)
        participated.forEach(item => {
          item.workspaceRelation = 'participating'
          tournaments.push(item)
        })
      }
    }
    const matches = canViewEvents
      ? await loadMatches(current, tournaments, teams)
      : []
    const teamMap = {}
    teams.forEach(team => { teamMap[team._id] = team })
    const eventSchedule = matches
      .map(item => formatMatch(item, teamMap))
      .sort((a, b) => a.time - b.time)
    const education = await loadEducationData(current, identity.user)
    const schedule = eventSchedule.concat(education.schedule).sort((a, b) => a.time - b.time)
    const accessibleTeamIds = unique(teams.map(item => item._id).concat(current.teamId || []))
    const draftConditions = [
      { recipientUserId: String(identity.user._id) },
      { recipientMiniOpenId: String(identity.openId) }
    ]
    if (accessibleTeamIds.length) draftConditions.push({ teamId: _.in(accessibleTeamIds) })
    const registrationDraftRows = await safeGet('tournament_tasks', _.or(draftConditions), 100)
    const activeRegistrationKeys = new Set(registrations.filter(item => ['pending', 'approved', 'confirmed', 'active', 'locked'].indexOf(String(item.status || '').toLowerCase()) >= 0).map(item => String(item.tournamentId || '') + ':' + String(item.teamId || '') + ':' + registrationDivisionId(item)))
    const staleDraftRows = registrationDraftRows.filter(item => activeRegistrationKeys.has(String(item.tournamentId || '') + ':' + String(item.teamId || '') + ':' + String(item.divisionId || 'default')))
    if (staleDraftRows.length) {
      await Promise.all(staleDraftRows.map(item => db.collection('tournament_tasks').doc(item._id).update({ data: { status: 'completed', completedAt: db.serverDate(), updateTime: db.serverDate() } }).catch(() => null)))
    }
    const activeDraftRows = registrationDraftRows.filter(item => staleDraftRows.indexOf(item) < 0)
    const eventTasks = buildRegistrationDraftTasks(activeDraftRows).concat(buildTasks(registrations), buildOrganizerTasks(hostedRegistrations))
    const tasks = eventTasks.concat(education.tasks)
    const teamIds = unique(teams.map(item => item._id))
    const players = canViewTeams && teamIds.length
      ? await safeGet('players', { teamId: _.in(teamIds) }, 500)
      : []

    const teamSummaryMap = {}
    teams.forEach(team => {
      const teamId = String(team._id)
      const members = Array.isArray(team.members) ? team.members : []
      const coachIds = unique([].concat(team.coachIds || [], team.managerIds || [], members.filter(member => {
        const role = String((member && (member.role || member.position)) || '').toLowerCase()
        return role === 'coach' || role === 'manager'
      }).map(member => member.userId || member.id || member._id || '')).filter(Boolean))
      teamSummaryMap[teamId] = {
        playerCount: players.filter(player => String(player.teamId || '') === teamId).length,
        coachCount: coachIds.length,
        tournamentCount: registrations.filter(registration => String(registration.teamId || '') === teamId).length
      }
    })
    const messageResult = await loadMessagesForWorkspace(current, identity.user, identity.openId)
    const now = Date.now()
    const upcoming = schedule.filter(item => !item.time || item.time >= now).slice(0, 5)
    return {
      success: true,
      user: {
        id: identity.user._id,
        nickName: firstValue(identity.user.nickName, identity.user.nickname, identity.user.name, '微信用户'),
        avatarUrl: firstValue(identity.user.avatarUrl, identity.user.avatar, identity.user.headimgurl),
        phone: identity.phone,
        phoneNumber: identity.phone,
        phoneMasked: maskPhone(identity.phone),
        phoneVerified: identity.user.phoneVerified === true
      },
      workspaces,
      currentWorkspace: current,
      currentIdentity: resolveHomeIdentity(current, identity.user),
      modules: buildModules(current),
      teams: teams.map(team => formatTeam(team, teamSummaryMap[String(team._id)])),
      tournaments: tournaments.map(formatTournament),
      registrations: registrations.map(item => ({ tournamentId: String(item.tournamentId || ''), teamId: String(item.teamId || ''), divisionId: registrationDivisionId(item), status: String(item.status || '') })),
      schedule,
      eventSchedule,
      trainingSchedule: education.schedule,
      upcoming,
      tasks,
      eventTasks,
      trainingTasks: education.tasks,
      messages: messageResult.messages,
      unreadMessageCount: messageResult.unreadMessageCount,
      statistics: {
        tournamentCount: tournaments.length,
        teamCount: teams.length,
        playerCount: players.length,
        matchCount: matches.length,
        scheduleCount: schedule.length,
        educationScheduleCount: education.schedule.length,
        eventPendingCount: eventTasks.filter(item => item.status === 'pending').length,
        trainingPendingCount: education.tasks.filter(item => item.status === 'pending').length,
        pendingCount: tasks.filter(item => item.status === 'pending').length,
        reviewingCount: tasks.filter(item => item.status === 'reviewing').length
      }
    }
  } catch (error) {
    console.error('[getMiniWorkspace] failed:', error)
    return {
      success: false,
      code: error.code || 'WORKSPACE_LOAD_FAILED',
      message: error.message || '工作空间加载失败'
    }
  }
}
