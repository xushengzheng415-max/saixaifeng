// 小程序机构工作空间聚合入口。
// 当前兼容 users.orgId；未来 organization_memberships / organizations 建立后可直接接管。
const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const createPlayerAccountTransfer = require('./playerAccountTransfer.cjs')

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

function dateOnlyText(value) {
  const time = toTime(value)
  if (!time) return ''
  const date = new Date(time)
  return String(date.getMonth() + 1) + '月' + String(date.getDate()) + '日'
}

function isClockTime(value) {
  return /^\d{1,2}:\d{2}$/.test(String(value || '').trim())
}

function matchDateValue(match) {
  return firstValue(match && match.matchDate, match && match.date, match && match.startDate, match && match.playDate)
}

function matchTimeValue(match) {
  const direct = firstValue(match && match.matchTime, match && match.timeSlot, match && match.time, match && match.kickoffTime)
  if (isClockTime(direct)) {
    const parts = String(direct).split(':')
    return String(parts[0]).padStart(2, '0') + ':' + String(parts[1]).padStart(2, '0')
  }
  const timestamp = firstValue(match && match.startTime, match && match.kickoffAt, direct)
  const time = toTime(timestamp)
  if (!time) return '时间待定'
  const date = new Date(time)
  return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0')
}

function matchDateText(match) {
  const direct = matchDateValue(match)
  const dateOnly = dateOnlyText(direct)
  if (dateOnly) return dateOnly
  return dateOnlyText(firstValue(match && match.startTime, match && match.kickoffAt, match && match.matchTime)) || '日期待定'
}

function matchDateTimeMs(match) {
  const date = String(matchDateValue(match) || '')
  const time = matchTimeValue(match)
  if (date && isClockTime(time)) {
    const combined = toTime(date + 'T' + time + ':00')
    if (combined) return combined
  }
  return toTime(firstValue(match && match.startTime, match && match.kickoffAt, match && match.matchTime, match && match.matchDate, match && match.date, match && match.startDate, match && match.playDate))
}

function maskPhone(value) {
  const phone = String(value || '')
  return /^1\d{10}$/.test(phone) ? phone.slice(0, 3) + '****' + phone.slice(-4) : ''
}

function ageOnReferenceDate(birthDate, referenceDate) {
  const match = String(birthDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const reference = referenceDate ? new Date(referenceDate) : new Date()
  if (!match || Number.isNaN(reference.getTime())) return null
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  let age = reference.getFullYear() - year
  if (reference.getMonth() + 1 < month || (reference.getMonth() + 1 === month && reference.getDate() < day)) age -= 1
  return age >= 0 ? age : null
}

function registrantTypeForBirthDate(birthDate, referenceDate) {
  const age = ageOnReferenceDate(birthDate, referenceDate)
  return age !== null && age >= 18 ? 'self' : 'guardian'
}

function registrantTypeForPlayer(player, invite) {
  const explicit = String(firstValue(invite && invite.registrantType, player && player.registrantType, player && player.applicantRole) || '')
  if (explicit === 'self' || explicit === 'player') return 'self'
  if (explicit === 'guardian') return 'guardian'
  return registrantTypeForBirthDate(firstValue(player && player.birthDate, player && player.birthday), invite && invite.referenceDate)
}

function verifiedUserPhone(user) {
  const phone = String(firstValue(user && user.phone, user && user.phoneNumber) || '').replace(/\D/g, '')
  return /^1\d{10}$/.test(phone) ? phone : ''
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

async function safeGetTeamPlayers(teamId, limit, extra) {
  // 球员历史记录同时存在 teamId 和 teamCode 两种归属字段。
  // 分开查询可沿用两边已有的单字段索引，避免 OR 查询因环境索引差异
  // 被 safeGet 降级为空列表；随后按 _id 合并去重。
  const id = String(teamId || '')
  const base = extra && typeof extra === 'object' ? extra : {}
  const rows = await Promise.all([
    safeGet('players', Object.assign({}, base, { teamId: id }), limit),
    safeGet('players', Object.assign({}, base, { teamCode: id }), limit)
  ])
  const merged = []
  const seen = new Set()
  rows.flat().forEach(function(item) {
    const key = String(item && item._id || '') || JSON.stringify(item)
    if (seen.has(key)) return
    seen.add(key)
    merged.push(item)
  })
  return limit ? merged.slice(0, limit) : merged
}

async function safeGetPlayersForTeams(teamIds, limit) {
  const ids = unique(teamIds)
  if (!ids.length) return []
  const rows = await Promise.all([
    safeGet('players', { teamId: _.in(ids) }, limit),
    safeGet('players', { teamCode: _.in(ids) }, limit)
  ])
  const merged = []
  const seen = new Set()
  rows.flat().forEach(function(item) {
    const key = String(item && item._id || '') || JSON.stringify(item)
    if (seen.has(key)) return
    seen.add(key)
    merged.push(item)
  })
  return limit ? merged.slice(0, limit) : merged
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

// 账号自己「认领/管理」的球队（所有权或已接受的成员关系）。
// 刻意不采纳 creatorId：主办方用报名表预建但无人认领的占位球队也是 creatorId 命中，
// 那些球队不应让账号在小程序里当成自己的长期球队。
async function loadAccountOwnedOrManagedTeams(user, openId) {
  const identityValues = unique([
    user._id, user.uid, user.userId, user.phone, user.phoneNumber,
    user.openId, user.openid, user.wechatOpenId, user._openid, openId
  ])
  const ownerConditions = []
  identityValues.forEach(value => {
    ownerConditions.push({ ownerId: value }, { ownerUserId: value }, { claimedByUserId: value })
  })
  const owned = ownerConditions.length ? await safeGet('teams', _.or(ownerConditions), 200) : []
  const membershipRows = await safeGet(
    'team_memberships',
    _.or([{ userId: user._id }, { memberUserId: user._id }, { phone: user.phone || user.phoneNumber }, { phoneNumber: user.phone || user.phoneNumber }]),
    200
  )
  const managedIds = unique(membershipRows.filter(item => {
    return ['active', 'accepted', 'claimed'].indexOf(String(item.status || 'active').toLowerCase()) >= 0
  }).map(item => String(item.teamId || '')).filter(Boolean))
  const managed = managedIds.length ? await safeGet('teams', { _id: _.in(managedIds) }, 200) : []
  const map = {}
  owned.concat(managed).forEach(team => { map[String(team._id)] = team })
  return Object.keys(map).map(id => map[id])
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
  // User 是自然人账号，机构只是可切换的数据工作空间。一个人可以在多个
  // 机构任职，也可以只凭球队成员关系管理其他机构下的一支球队。这里返回
  // 全部已验证工作空间，后续读写仍按当前 workspaceId 逐项校验边界。
  const organizationMap = {}
  organizations.forEach(item => { organizationMap[String(item._id)] = item })

  const workspaces = []
  // 账号自己认领/管理的球队落在哪个机构名下 —— 用于给该机构工作空间补球队能力位。
  // 背景（2026-09-18 实测）：PC 引导页创建的赛事主办方机构只有 event 能力位，
  // 成员关系里的权限数组非空，normalizePermissions 的「机构负责人」兜底因此不生效，
  // 于是账号认领球队后小程序球队页仍返回空 teams、显示「当前还没有球队」。
  // 这里只对「确实拥有或管理球队」的账号补 team.view/team.manage，不按机构整体放开。
  const accountOwnedTeams = await loadAccountOwnedOrManagedTeams(user, openId)
  const accountOwnedTeamOrgIds = unique(accountOwnedTeams.map(item => String(item.orgId || item.organizationId || '')))
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
    // 该机构名下有账号自己认领/管理的球队时，必须给球队能力位，否则账号连自己的球队都看不到。
    if (accountOwnedTeamOrgIds.indexOf(String(orgId)) >= 0) {
      permissions = unique(permissions.concat(['team.view', 'team.manage']))
    }
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
  // 只有真正生成的机构工作空间才算“可访问机构”。候选 orgId 可能仅来自
  // 本人负责的一支外部机构球队；这种关系只能开放球队协作空间，不能借此
  // 获得整个机构的访问权，也不能因为 orgId 存在就把球队空间吞掉。
  const accessibleOrgIds = new Set(workspaces.filter(item => item.type === 'organization').map(item => String(item.orgId || '')))
  accessibleTeams.forEach(team => {
    const teamOrgId = String(team.orgId || '')
    const claimStatus = String(team.claimStatus || '').toLowerCase()
    const needsTemporarySpace = !teamOrgId ||
      !accessibleOrgIds.has(teamOrgId) ||
      claimStatus === 'unclaimed' ||
      claimStatus === 'pending'
    if (!needsTemporarySpace) return
    const teamMembership = acceptedTeamMemberships.find(item => String(item.teamId || '') === String(team._id))
    const isTeamOwner = [team.ownerId, team.ownerUserId, team.claimedByUserId].some(value => String(value || '') === String(user._id || ''))
    let teamPermissions = normalizePermissions(teamMembership, false)
    if (isTeamOwner) teamPermissions = unique(teamPermissions.concat(['team.view', 'team.manage']))
    if (!teamPermissions.length) teamPermissions = ['event.view', 'team.view', 'team.manage']
    // 单球队协作空间必须能读取本队的参赛关系。历史成员记录可能只保存
    // team.view/team.manage；若缺少 event.view，主流程会在读取 tournament_teams
    // 前直接返回空赛事。这里只补只读权限，不授予 event.manage。
    teamPermissions = unique(teamPermissions.concat(['event.view', 'team.view']))
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

// 当前账号同时是目标机构成员时进入机构空间；只有球队关系时进入单球队协作空间。
// 这里只解析入口，不扩大目标机构的数据权限。
async function workspaceIdForManagedTeam(teamId, identity) {
  const team = (await safeGet('teams', { _id: String(teamId || '') }, 1))[0] || {}
  const catalog = await loadWorkspaceCatalog(identity.user, identity.openId)
  const teamOrgId = String(team.orgId || team.organizationId || team.organization_id || '')
  const organizationWorkspace = catalog.find(item => item.type === 'organization' && String(item.orgId || '') === teamOrgId)
  if (organizationWorkspace) return organizationWorkspace.id
  const teamWorkspace = catalog.find(item => item.type === 'team' && String(item.teamId || '') === String(teamId || ''))
  return teamWorkspace ? teamWorkspace.id : ''
}

async function loadTeams(workspace, user, openId) {
  if (workspace.type === 'team') return safeGet('teams', { _id: workspace.teamId }, 1)

  const orgTeams = await safeGet('teams', { orgId: workspace.orgId }, 100)
  const membershipRows = await safeGet('team_memberships', _.or([
    { userId: user._id }, { memberUserId: user._id },
    { phone: user.phone || user.phoneNumber }, { phoneNumber: user.phone || user.phoneNumber }
  ]), 100)
  const acceptedTeamIds = unique(membershipRows.filter(item => {
    return ['active', 'accepted', 'claimed'].includes(String(item.status || 'active').toLowerCase())
  }).map(item => item.teamId))
  const memberTeams = acceptedTeamIds.length ? await safeGet('teams', { _id: _.in(acceptedTeamIds) }, 100) : []
  const ownerValues = unique([user._id, user.phone, user.phoneNumber, openId])
  const ownerConditions = []
  ownerValues.forEach(value => ownerConditions.push(
    { creatorId: value }, { ownerId: value }, { ownerUserId: value },
    { userId: value }, { openId: value }, { _openid: value }
  ))
  const ownedTeams = ownerConditions.length ? await safeGet('teams', _.or(ownerConditions), 100) : []
  const visible = {}
  orgTeams.concat(memberTeams, ownedTeams).forEach(team => {
    const teamOrgId = String(team.orgId || team.organizationId || '')
    if (teamOrgId && teamOrgId !== String(workspace.orgId)) return
    visible[String(team._id)] = team
  })
  return Object.keys(visible).map(id => visible[id])
}

async function loadTournaments(workspace, user, openId, teams) {
  // 认领后可能进入只覆盖单支球队的临时工作空间。
  // 该空间不能读取机构赛事，但必须能读取本队已经建立的参赛关系，
  // 否则赛事 Tab 会被错误地显示为空。
  if (workspace.type === 'team') {
    const teamId = String(workspace.teamId || '')
    if (!teamId) return { tournaments: [], registrations: [], hostedRegistrations: [] }
    const hiddenStatuses = new Set(['cancelled', 'withdrawn', 'rejected', 'replaced', 'invite_cancelled'])
    const registrations = (await safeGet('tournament_teams', { teamId }, 200)).filter(item => {
      return hiddenStatuses.has(String(item.status || '').toLowerCase()) === false && String(item.tournamentId || '')
    })
    const tournamentIds = unique(registrations.map(item => item.tournamentId))
    const participating = tournamentIds.length
      ? await safeGet('tournaments', { _id: _.in(tournamentIds) }, 100)
      : []
    return {
      tournaments: participating.map(item => Object.assign({}, item, { workspaceRelation: 'participating' })),
      registrations,
      hostedRegistrations: []
    }
  }
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
  if (workspace.type === 'team' && teamIds.length) {
    return safeGet('matches', _.or([
      { homeTeamId: _.in(teamIds) },
      { awayTeamId: _.in(teamIds) }
    ]), 200)
  }
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

function formatTournament(item, summary) {
  summary = summary || {}
  const status = String(item.status || 'draft')
  const statusLabels = {
    draft: '筹备中',
    pending: '待审核',
    registering: '报名中',
    published: '已发布',
    upcoming: '待开始',
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
  const formatType = String(firstValue(item.formatType, item.format, item.competitionFormat, '')).toLowerCase()
  const formatLabels = { league: '联赛制', cup: '杯赛制', tournament: '赛会制', hybrid: '混合制' }
  const startDate = dateOnlyText(firstValue(item.startDate, item.startTime))
  const endDate = dateOnlyText(firstValue(item.endDate, item.endTime))
  const dateRange = startDate && endDate && startDate !== endDate ? startDate + ' — ' + endDate : (startDate || endDate || '日期待定')
  return {
    id: String(item._id),
    name: item.name || '未命名赛事',
    relation,
    relationText: relationLabels[relation] || '关联赛事',
    isHosted: relation === 'hosted' || relation === 'both',
    isParticipating: relation === 'participating' || relation === 'both',
    status,
    statusText: statusLabels[status] || '进行中',
    dateText: dateRange,
    modeText: formatLabels[formatType] || (item.modeText || '赛事'),
    teamCountText: summary.teamCount ? String(summary.teamCount) + ' 支球队' : (relation === 'participating' ? '已参赛' : '球队待定'),
    matchCountText: String(summary.matchCount || 0) + ' 场比赛',
    cardClass: item.isProfessional === true || String(item.ruleMode || '').toLowerCase() === 'professional' ? 'event-card-pro' : 'event-card-simple'
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

function matchTeamId(item, side) {
  return String(firstValue(item && item[side + 'TeamId'], item && item[side + 'Id'], '') || '')
}

function matchTeamName(item, side, teamMap) {
  const id = matchTeamId(item, side)
  const team = (teamMap && teamMap[id]) || {}
  const current = firstValue(team.name, team.teamName)
  if (current) return String(current)
  const raw = firstValue(item && item[side + 'TeamName'], item && item[side + 'Name'], item && item[side + 'Team'], item && item[side])
  if (raw && typeof raw === 'object') return String(firstValue(raw.name, raw.teamName, team.name, team.teamName, '球队待定'))
  return String(firstValue(raw, team.name, team.teamName, '球队待定'))
}

function matchTeamLogo(item, side, teamMap) {
  const id = matchTeamId(item, side)
  const team = (teamMap && teamMap[id]) || {}
  const current = firstValue(team.logo, team.logoUrl, team.teamLogo)
  if (current) return String(current)
  const raw = firstValue(item && item[side + 'TeamLogo'], item && item[side + 'Logo'])
  if (raw && typeof raw === 'object') return String(firstValue(raw.url, raw.fileID, team.logo, team.logoUrl, ''))
  return String(firstValue(raw, team.logo, team.logoUrl, team.teamLogo, ''))
}

function formatMatch(item, teamMap) {
  const status = String(item.status || 'scheduled').toLowerCase()
  const isLive = ['ongoing', 'live', 'in_progress', 'inprogress'].indexOf(status) >= 0
  return {
    id: String(item._id),
    tournamentId: String(item.tournamentId || ''),
    type: 'match',
    source: 'event',
    sourceText: '赛事',
    title: firstValue(item.tournamentName, '赛事比赛'),
    subtitle: matchTeamName(item, 'home', teamMap) + ' vs ' + matchTeamName(item, 'away', teamMap),
    time: matchDateTimeMs(item),
    // 首页分别展示日期和时间，timeText 只返回时分，避免把日期重复渲染一次。
    timeText: matchTimeValue(item),
    dateText: matchDateText(item),
    divisionText: firstValue(item.divisionName, item.division, item.groupName, '组别待定'),
    location: firstValue(item.venue, item.location, item.fieldName, item.field, '场地待定'),
    status,
    statusText: status === 'completed' || status === 'finished'
      ? '已结束'
      : (isLive ? '进行中' : '待开始'),
    homeName: matchTeamName(item, 'home', teamMap),
    awayName: matchTeamName(item, 'away', teamMap),
    homeLogo: matchTeamLogo(item, 'home', teamMap),
    awayLogo: matchTeamLogo(item, 'away', teamMap)
  }
}

function taskRelevantRegistrations(registrations) {
  const hiddenStatuses = new Set(['cancelled', 'withdrawn', 'replaced', 'invite_cancelled'])
  const priority = { approved: 90, confirmed: 80, active: 80, locked: 80, accepted: 75, claimed: 70, pending: 60, pending_approval: 60, submitted: 60, reviewing: 55, rejected: 50, modification_requested: 45, drafting: 30, not_submitted: 20 }
  const grouped = {}
  ;(registrations || []).forEach(item => {
    const status = String(item.status || 'not_submitted').toLowerCase()
    if (hiddenStatuses.has(status)) return
    const key = String(item.tournamentId || '') + ':' + String(item.teamId || '') + ':' + registrationDivisionId(item)
    const current = grouped[key]
    const currentPriority = current ? Number(priority[String(current.status || '').toLowerCase()] || 0) : -1
    const itemPriority = Number(priority[status] || 0)
    if (!current || itemPriority > currentPriority || (itemPriority === currentPriority && toTime(item.updateTime || item.createTime) > toTime(current.updateTime || current.createTime))) grouped[key] = item
  })
  return Object.keys(grouped).map(key => grouped[key])
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
  taskRelevantRegistrations(registrations).forEach(item => {
    const status = String(item.status || 'not_submitted').toLowerCase()
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

function matchMatchesDivision(match, divisionId, divisionName) {
  const matchDivisionId = String(firstValue(match && match.divisionId, match && match.division, ''))
  if (!matchDivisionId) return true
  if (matchDivisionId === String(divisionId || 'default')) return true
  const matchDivisionName = String(firstValue(match && match.divisionName, match && match.divisionLabel, match && match.categoryName, '')).replace(/\s+/g, '').toLowerCase()
  const registrationDivisionName = String(divisionName || '').replace(/\s+/g, '').toLowerCase()
  return Boolean(matchDivisionName && registrationDivisionName && matchDivisionName === registrationDivisionName)
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
  const hasPhoto = Boolean(firstValue(item.photoUrl, item.photo, item.photoFileID, item.photoFileId))
  const hasBirth = Boolean(firstValue(item.birthDate, item.birthday))
  const hasName = Boolean(item.name)
  const identityRaw = String(firstValue(item.identityStatus, item.verifyStatus, item.realNameStatus)).toLowerCase()
  const identityRequired = Boolean(requirements && requirements.identityVerificationRequired)
  const portraitRequired = requirements && hasOwnValue(requirements, 'portraitRequired') ? Boolean(requirements.portraitRequired) : false
  const parentRequired = requirements && requirements.parentSupplementConfigured
    ? Boolean(requirements.parentSupplementRequired)
    : false
  const identityReady = ['verified', 'approved', 'complete', 'manual_required'].indexOf(identityRaw) >= 0
  const needsIdentity = identityRequired && !identityReady
  const needsPortrait = portraitRequired && !hasPhoto
  const needsParentCompletion = parentRequired && Boolean(item.needsParentCompletion)
  const registrantType = registrantTypeForPlayer(item)
  const rejected = ['rejected', 'failed', 'exception', 'invalid'].indexOf(String(firstValue(item.profileStatus, item.verifyStatus, item.identityStatus, item.status)).toLowerCase()) >= 0
  const incomplete = needsPortrait || !hasBirth || !hasName || needsParentCompletion || needsIdentity
  const profileStatus = rejected ? 'exception' : (incomplete ? 'pending' : 'complete')
  let statusText = '资料完整'
  if (profileStatus === 'exception') statusText = '资料异常'
  else if (needsIdentity) statusText = '待人证核验'
  else if (needsPortrait) statusText = '待形象照'
  else if (needsParentCompletion) statusText = registrantType === 'self' ? '待本人补充' : '待家长补充'
  else if (!hasBirth || !hasName) statusText = '待完善基础资料'
  return {
    id: String(item._id),
    name: item.name || '未命名球员',
    jerseyName: item.jerseyName || '',
    height: item.height ?? null,
    weight: item.weight ?? null,
    nationality: item.nationality || '中国',
    birthDate: firstValue(item.birthDate, item.birthday),
    photoUrl: firstValue(item.photoUrl, item.photo, item.photoFileID, item.photoFileId),
    jerseyNumber: item.jerseyNumber || '',
    position: item.position || '',
    profileStatus,
    statusText,
    identityStatus: identityRequired ? (identityRaw === 'manual_required' ? 'manual_required' : (identityReady ? 'verified' : 'not_verified')) : 'not_required',
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
  const teamId = String(team._id)
  const tournamentId = String(event.tournamentId || '')
  if (tournamentId) {
    const tournament = (await safeGet('tournaments', { _id: tournamentId }, 1))[0]
    if (!tournament) throw new Error('赛事不存在')
    const membershipRows = await safeGet('team_memberships', _.or([
      { userId: identity.user._id },
      { memberUserId: identity.user._id },
      { phone: identity.user.phone || identity.user.phoneNumber },
      { phoneNumber: identity.user.phone || identity.user.phoneNumber }
    ]), 100)
    const ownTeamIds = unique(membershipRows.filter(item => ['active', 'accepted', 'claimed'].indexOf(String(item.status || 'active').toLowerCase()) >= 0).map(item => String(item.teamId || '')))
    if (workspace.type === 'team') ownTeamIds.push(String(workspace.teamId || ''))
    if ([team.ownerId, team.ownerUserId, team.claimedByUserId].map(String).indexOf(String(identity.user._id || '')) >= 0) ownTeamIds.push(teamId)
    const isOwnTeam = ownTeamIds.indexOf(teamId) >= 0
    const isEventManager = (workspace.permissions || []).indexOf('event.manage') >= 0
    const matches = await safeGet('matches', { tournamentId }, 300)
    const teamMatches = matches.filter(item => [String(item.homeTeamId || ''), String(item.awayTeamId || '')].indexOf(teamId) >= 0)
    const startedStatuses = ['ongoing', 'live', 'in_progress', 'inprogress', 'completed', 'finished', 'archived']
    const matchStarted = teamMatches.some(item => startedStatuses.indexOf(String(item.status || '').toLowerCase()) >= 0 || (toTime(firstValue(item.matchTime, item.startTime, item.matchDate)) > 0 && toTime(firstValue(item.matchTime, item.startTime, item.matchDate)) <= Date.now()))
    const tournamentStarted = ['ongoing', 'completed', 'finished', 'archived'].indexOf(String(tournament.status || '').toLowerCase()) >= 0
    if (!isOwnTeam && !isEventManager && !matchStarted && !tournamentStarted) throw workspaceError('ROSTER_NOT_PUBLIC', '比赛开赛前不公开其他球队球员名单')
  }
  const rows = (await safeGetTeamPlayers(teamId, 500)).filter(item => ['archived', 'deleted'].indexOf(String(item.status || '').toLowerCase()) < 0)
  const canManage = permissions.has('team.manage')
  const importedDrafts = canManage ? await safeGet('registration_player_drafts', _.or([{ teamId }, { sourceTeamId: teamId }]), 500) : []
  const importBatches = canManage ? await safeGet('registration_import_batches', _.or([{ teamId }, { sourceTeamId: teamId }]), 100) : []
  const pendingImportCount = importedDrafts.filter(item => ['pending', 'conflict'].indexOf(String(item.reviewStatus || 'pending')) >= 0).length
  const seen = new Set()
  const players = []
  function playerKey(item) {
    return String(firstValue(item && item.identityNumber, item && item.idNumber, item && item.name, '')) + ':' + String(firstValue(item && item.birthDate, item && item.birthday, ''))
  }
  function appendPlayer(item, source) {
    if (!item || ['archived', 'deleted', 'excluded'].indexOf(String(item.status || item.reviewStatus || '').toLowerCase()) >= 0) return
    const key = playerKey(item)
    if (key && seen.has(key)) return
    if (key) seen.add(key)
    const player = formatTeamPlayer(item)
    player.id = String(firstValue(item._id, item.id, player.id, ''))
    player.source = source
    players.push(player)
  }
  rows.forEach(item => appendPlayer(item, 'player'))
  importedDrafts.filter(item => !item.confirmedPlayerId).forEach(item => appendPlayer(item, 'import_draft'))
  importBatches.forEach(batch => {
    const snapshotPlayers = batch && batch.snapshot && Array.isArray(batch.snapshot.players) ? batch.snapshot.players : []
    snapshotPlayers.forEach(item => appendPlayer(item, 'import_snapshot'))
  })
  const counts = { complete: 0, pending: 0, exception: 0 }
  players.forEach(item => { counts[item.profileStatus] += 1 })
  return {
    success: true,
    team: { id: teamId, name: firstValue(team.name, team.teamName, '未命名球队'), logo: firstValue(team.logo, team.logoUrl, team.teamLogo), createTime: firstValue(team.createTime, team.createdAt) },
    players,
    counts,
    canManage,
    pendingImportCount,
    hasPendingImport: pendingImportCount > 0
  }
}

function importedDraftPublicView(item) {
  const status = String(item.reviewStatus || 'pending')
  const dualRoleType = String(item.dualRoleType || '')
  const dualRoleLabels = { head_coach_player:'兼主教练', team_leader_player:'兼领队', doctor_player:'兼队医' }
  return {
    id: String(item._id || ''),
    name: String(item.name || '未命名球员'),
    jerseyNumber: String(firstValue(item.jerseyNumber, '') || ''),
    jerseyName: String(item.jerseyName || ''),
    birthDate: String(item.birthDate || ''),
    gender: String(item.gender || ''),
    nativePlace: String(item.nativePlace || ''),
    photoUrl: String(firstValue(item.photoUrl, item.photoFileID) || ''),
    identityMasked: String(item.identityMasked || ''),
    reviewStatus: status,
    statusText: status === 'conflict' ? '资料冲突' : (status === 'confirmed' ? '已确认入库' : (status === 'excluded' ? '已排除' : '可确认')),
    conflictReason: status === 'conflict' ? String(item.conflictReason || '资料存在冲突，需要人工处理') : '',
    dualRoleType,
    dualRoleLabel: String(dualRoleLabels[dualRoleType] || ''),
    isStaffPlayer: Boolean(dualRoleType),
    canConfirm: status === 'pending',
    canExclude: ['pending', 'conflict'].indexOf(status) >= 0
  }
}

async function importedDraftTeamContext(event, identity) {
  const result = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  const workspace = result.workspace
  if ((workspace.permissions || []).indexOf('team.manage') < 0) throw workspaceError('TEAM_MANAGE_REQUIRED', '当前身份没有确认导入球员的权限')
  const teamId = String(event.teamId || '')
  const teams = await loadTeams(workspace, identity.user, identity.openId)
  const team = teams.find(item => String(item._id) === teamId)
  if (!team) throw workspaceError('TEAM_SCOPE_DENIED', '球队不存在或不属于当前工作空间')
  return { workspace, team, teamId }
}

async function importedPlayerDraftsForWorkspace(event, identity) {
  const context = await importedDraftTeamContext(event, identity)
  const rows = await safeGet('registration_player_drafts', { teamId: context.teamId }, 500)
  const drafts = rows.sort(function(a, b) { return Number(a.order || 0) - Number(b.order || 0) }).map(importedDraftPublicView)
  const counts = { pending:0, conflict:0, confirmed:0, excluded:0 }
  drafts.forEach(function(item) { if (Object.prototype.hasOwnProperty.call(counts, item.reviewStatus)) counts[item.reviewStatus] += 1 })
  return { success:true, team:{ id:context.teamId, name:String(firstValue(context.team.name, context.team.teamName, '球队')) }, drafts, counts, reviewComplete:counts.pending === 0 && counts.conflict === 0 }
}

async function refreshImportedPlayerDraftState(teamId) {
  const rows = await safeGet('registration_player_drafts', { teamId }, 500)
  const pending = rows.filter(item => ['pending', 'conflict'].indexOf(String(item.reviewStatus || 'pending')) >= 0).length
  const confirmed = rows.filter(item => String(item.reviewStatus || '') === 'confirmed').length
  const excluded = rows.filter(item => String(item.reviewStatus || '') === 'excluded').length
  const reviewStatus = pending ? 'pending' : 'completed'
  await db.collection('teams').doc(teamId).update({ data:{ pendingPlayerDraftCount:pending, playerCount:confirmed, playerReviewStatus:reviewStatus, playerReviewCompletedAt:pending ? null : db.serverDate(), updateTime:db.serverDate() } })
  const batchIds = unique(rows.map(item => item.importBatchId))
  for (const batchId of batchIds) {
    const batchRows = rows.filter(item => String(item.importBatchId || '') === batchId)
    const batchPending = batchRows.some(item => ['pending', 'conflict'].indexOf(String(item.reviewStatus || 'pending')) >= 0)
    await db.collection('registration_import_batches').doc(batchId).update({ data:{ playerReviewStatus:batchPending ? 'pending' : 'completed', confirmedPlayerCount:batchRows.filter(item => String(item.reviewStatus || '') === 'confirmed').length, excludedPlayerCount:batchRows.filter(item => String(item.reviewStatus || '') === 'excluded').length, playerReviewCompletedAt:batchPending ? null : db.serverDate(), updateTime:db.serverDate() } })
  }
  return { pending, confirmed, excluded, reviewStatus }
}

async function reviewImportedPlayerDraftsForWorkspace(event, identity) {
  const context = await importedDraftTeamContext(event, identity)
  const decision = String(event.decision || '')
  if (decision !== 'confirm' && decision !== 'exclude') throw workspaceError('IMPORT_REVIEW_DECISION_INVALID', '请选择确认入库或排除')
  const ids = unique(Array.isArray(event.draftIds) ? event.draftIds : []).slice(0, 100)
  if (!ids.length) throw workspaceError('IMPORT_DRAFT_REQUIRED', '请至少选择一名球员')
  const rows = (await safeGet('registration_player_drafts', { teamId:context.teamId }, 500)).filter(item => ids.indexOf(String(item._id)) >= 0)
  if (rows.length !== ids.length) throw workspaceError('IMPORT_DRAFT_SCOPE_DENIED', '选择的数据包含不存在或其他球队球员')
  if (decision === 'confirm' && rows.some(item => String(item.reviewStatus || '') === 'conflict')) throw workspaceError('IMPORT_DRAFT_CONFLICT_LOCKED', '冲突球员不能批量确认，请先由主办方人工处理')
  const now = db.serverDate()
  for (const draft of rows) {
    const currentStatus = String(draft.reviewStatus || 'pending')
    if (['confirmed', 'excluded'].indexOf(currentStatus) >= 0) continue
    if (decision === 'exclude') {
      await db.collection('registration_player_drafts').doc(draft._id).update({ data:{ reviewStatus:'excluded', excludedReason:String(event.reason || '领队确认不属于本队').trim().slice(0, 120), reviewedByUserId:String(identity.user._id), reviewedAt:now, updateTime:now } })
      continue
    }
    const existing = await safeGetTeamPlayers(context.teamId, 2, { importDraftId:String(draft._id) })
    let playerId = existing[0] ? String(existing[0]._id) : ''
    if (!playerId) {
      const created = await db.collection('players').add({ data:{
        orgId:String(draft.orgId || context.workspace.orgId || ''), teamId:context.teamId, teamCode:context.teamId, teamName:String(firstValue(context.team.name, context.team.teamName, '球队')),
        playerId:'import-' + String(draft._id), name:String(draft.name || '未命名球员'), jerseyNumber:Number(draft.jerseyNumber || 0), jerseyName:String(draft.jerseyName || ''),
        gender:String(draft.gender || ''), nationality:'中国', birthDate:String(draft.birthDate || ''), nativePlace:String(draft.nativePlace || ''),
        photoUrl:String(firstValue(draft.photoUrl, draft.photoFileID) || ''), photoFileID:String(firstValue(draft.photoFileID, draft.photoUrl) || ''), photoProcessingStatus:String(draft.photoProcessingStatus || ''),
        identityDigest:String(draft.identityDigest || ''), identityNumberMasked:String(draft.identityMasked || ''), identityStatus:'not_verified', identityVerificationLabel:'待人证核验',
        profileStatus:'pending', source:'registration_docx_import_confirmed', importDraftId:String(draft._id), registrationImportBatchId:String(draft.importBatchId || ''), registrationSourceFileId:String(draft.registrationSourceFileId || ''),
        dualRoleType:String(draft.dualRoleType || ''), dualRoleLabel:String(draft.dualRoleLabel || ''), isAlsoStaff:Boolean(draft.dualRoleType), linkedCoachId:String(draft.linkedCoachId || ''), eligibilityReviewRequired:draft.eligibilityReviewRequired === true,
        creatorId:String(identity.user._id), registerTime:now, createTime:now, updateTime:now
      } })
      playerId = String(created._id)
    }
    if (draft.linkedCoachId) await db.collection('coaches').doc(String(draft.linkedCoachId)).update({ data:{ linkedPlayerId:playerId, dualRoleType:String(draft.dualRoleType || 'staff_player'), isAlsoPlayer:true, updateTime:now } })
    await db.collection('registration_player_drafts').doc(draft._id).update({ data:{ reviewStatus:'confirmed', confirmedPlayerId:playerId, reviewedByUserId:String(identity.user._id), reviewedAt:now, updateTime:now } })
  }
  const state = await refreshImportedPlayerDraftState(context.teamId)
  return { success:true, decision, state, message:decision === 'confirm' ? '所选球员已进入长期球员库' : '所选资料已排除' }
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
  const rows = await safeGetTeamPlayers(teamId, 1, { _id: playerId })
  const player = rows[0]
  if (!player || ['archived', 'deleted'].indexOf(String(player.status || '').toLowerCase()) >= 0) throw new Error('球员不存在或已移出球队')
  const cardService = require('./data-center/service.cjs').createDataService(db)
  const dataCenter = await cardService.query({ teamIds:[teamId], tournamentIds:[], platformOwner:false }, { teamId, playerId, mode:'official' })
  const { metrics:cardMetrics, ...playerCard } = await cardService.playerCardForAuthorizedPlayer(playerId)
  const stats = dataCenter.playerTotal.metrics
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
    stats,
    dataCenter: { metricVersion:dataCenter.metricVersion, dataVersion:dataCenter.dataVersion, coverage:dataCenter.coverage },
    playerCard
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
  const rows = await safeGetTeamPlayers(teamId, 1, { _id: playerId })
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
  const rows = await safeGetTeamPlayers(teamId, 1, { _id: playerId })
  const player = rows[0]
  if (!player) throw new Error('球员不存在或不属于该球队')
  return {
    success: true,
    player: {
      id: String(player._id),
      name: String(player.name || ''),
      birthDate: String(firstValue(player.birthDate, player.birthday) || ''),
      contactPhone: String(firstValue(player.playerPhone, player.guardianPhone, player.contactPhone) || ''),
      registrantType: registrantTypeForPlayer(player)
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
  const contactPhone = String(firstValue(event.contactPhone, event.guardianPhone) || '').replace(/\s/g, '')
  const registrantType = registrantTypeForBirthDate(birthDate)
  if (!name) throw new Error('请填写球员姓名')
  if (ageOnReferenceDate(birthDate) === null) throw new Error('请选择正确的出生日期')
  if (!/^1\d{10}$/.test(contactPhone)) throw new Error(registrantType === 'self' ? '请填写正确的球员本人手机号' : '请填写正确的监护人手机号')
  const playerId = String(event.playerId || '').trim()
  const duplicate = (await safeGetTeamPlayers(teamId, 20, { name, birthDate })).filter(item => String(item._id) !== playerId)
  if (duplicate.length) throw new Error('同一球队已存在同名且出生年月相同的球员，请先核验，不会自动合并')
  const now = db.serverDate()
  if (playerId) {
    const existing = await safeGetTeamPlayers(teamId, 1, { _id: playerId })
    if (!existing.length) throw new Error('球员不存在或不属于该球队')
    const updateData = { name, birthDate, birthday: birthDate, contactPhone, registrantType, updateTime: now, lastEditedBy: identity.user._id }
    if (registrantType === 'self') updateData.playerPhone = contactPhone
    else updateData.guardianPhone = contactPhone
    await db.collection('players').doc(playerId).update({ data: updateData })
    return { success: true, playerId, updated: true, parentInvite: null }
  }
  const player = {
    teamId, orgId: workspace.orgId || '', name, birthDate, birthday: birthDate,
    contactPhone, registrantType, profileStatus: 'pending', needsParentCompletion: Boolean(event.createParentLink),
    creatorId: identity.user._id, creatorOpenId: identity.openId, createTime: now, updateTime: now, source: 'team_quick_create'
  }
  if (registrantType === 'self') player.playerPhone = contactPhone
  else player.guardianPhone = contactPhone
  const added = await db.collection('players').add({ data: player })
  let parentInvite = null
  if (event.createParentLink) {
    const token = 'pp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12)
    await db.collection('parent_profile_invites').add({ data: { token, teamId, playerId: added._id, orgId: workspace.orgId || '', registrantMode: 'age_based', registrantType, registrantPhone: contactPhone, guardianPhone: registrantType === 'guardian' ? contactPhone : '', status: 'active', creatorId: identity.user._id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), createTime: now, updateTime: now } })
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
  const playerRows = await safeGetTeamPlayers(teamId, 1, { _id: playerId })
  if (!playerRows.length || !playerRows[0].needsParentCompletion) throw new Error('该球员当前没有可提醒的资料项')
  const invites = (await safeGet('parent_profile_invites', { playerId, teamId, status: 'active' }, 20)).filter(item => !item.expiresAt || toTime(item.expiresAt) > Date.now())
  if (!invites.length) throw new Error('尚未生成资料协作链接，无法发送提醒')
  const now = db.serverDate()
  await db.collection('parent_profile_reminders').add({ data: { teamId, playerId, inviteId: invites[0]._id, orgId: result.workspace.orgId || '', creatorId: identity.user._id, status: 'queued', createTime: now, updateTime: now } })
  return { success: true, reminderStatus: 'queued' }
}

async function parentProfileInviteForWorkspace(event, identity) {
  const result = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  if ((result.workspace.permissions || []).indexOf('team.manage') < 0) throw new Error('当前身份没有管理资料协作邀请的权限')
  const teamId = String(event.teamId || ''), playerId = String(event.playerId || '')
  const teams = await loadTeams(result.workspace, identity.user, identity.openId)
  const team = teams.find(item => String(item._id) === teamId)
  if (!team) throw new Error('球队不存在或不属于当前工作空间')
  const playerRows = await safeGetTeamPlayers(teamId, 1, { _id: playerId })
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
  const registrantType = registrantTypeForPlayer(player, invite)
  const items = ['核对姓名和出生年月', registrantType === 'self' ? '本人授权' : '监护人授权']
  if (identity.defined && identity.value) items.push('人证核验')
  if (portrait.defined && portrait.value) items.push('标准形象照')
  return items
}

function formatParentProfileInvite(invite, team, player) {
  const expiresAt = invite.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const registrantType = registrantTypeForPlayer(player, invite)
  const phone = registrantType === 'self' ? firstValue(player.playerPhone, player.contactPhone, invite.registrantPhone) : firstValue(player.guardianPhone, player.contactPhone, invite.guardianPhone, invite.registrantPhone)
  return { id: String(invite._id || ''), token: String(invite.token || ''), playerId: String(player._id), playerName: String(player.name || '球员'), teamName: String(team.name || team.teamName || ''), registrantMode: 'age_based', registrantType, registrantLabel: registrantType === 'self' ? '球员本人' : '家长或监护人', accountPhoneMasked: maskPhone(String(phone || '')), guardianPhoneMasked: registrantType === 'guardian' ? maskPhone(String(phone || '')) : '', status: String(invite.status || 'active'), expiresAtText: dateText(expiresAt), h5Path: '/service-account-h5/?parentInvite=' + encodeURIComponent(String(invite.token || '')), requirements: formatParentInviteChecklist(invite, player) }
}

async function createParentProfileInvite(team, player, orgId, creatorId) {
  const now = db.serverDate(), token = 'pp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12)
  const standardFlow = String(player.source || '') === 'team_player_invite' || player.standardProfileFlow === true
  const identity = readBooleanSetting([player], ['identityVerificationRequired', 'requiresRealName', 'requireRealName'])
  const portrait = readBooleanSetting([player], ['portraitRequired', 'requiresPortrait', 'requirePortrait'])
  const registrantType = registrantTypeForPlayer(player)
  const registrantPhone = registrantType === 'self' ? firstValue(player.playerPhone, player.contactPhone) : firstValue(player.guardianPhone, player.contactPhone)
  const registrantUserId = registrantType === 'self' ? firstValue(player.playerUserId, player.linkedUserId) : player.guardianUserId
  const data = { token, teamId: String(team._id), playerId: String(player._id), orgId, registrantMode: 'age_based', registrantType, registrantUserId: String(registrantUserId || ''), registrantPhone: String(registrantPhone || ''), guardianPhone: registrantType === 'guardian' ? String(registrantPhone || '') : '', status: 'active', creatorId, parentSupplementRequired: true, identityVerificationRequired: identity.defined ? identity.value : standardFlow, portraitRequired: portrait.defined ? portrait.value : standardFlow, standardProfileFlow: standardFlow, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), createTime: now, updateTime: now }
  const added = await db.collection('parent_profile_invites').add({ data })
  return Object.assign({ _id: added._id }, data)
}

async function ensureParentProfileInviteForPlayer(team, player, orgId, creatorId) {
  const rows = await safeGet('parent_profile_invites', { teamId: String(team._id), playerId: String(player._id), status: 'active' }, 20)
  const active = rows.find(item => !item.expiresAt || toTime(item.expiresAt) > Date.now())
  if (active) {
    const standardFlow = String(player.source || '') === 'team_player_invite' || player.standardProfileFlow === true
    const needsUpgrade = standardFlow && (active.identityVerificationRequired !== true || active.portraitRequired !== true || active.parentSupplementRequired !== true)
    if (needsUpgrade) {
      await db.collection('parent_profile_invites').doc(String(active._id)).update({ data: { parentSupplementRequired: true, identityVerificationRequired: true, portraitRequired: true, standardProfileFlow: true, updateTime: db.serverDate() } })
      return Object.assign({}, active, { parentSupplementRequired: true, identityVerificationRequired: true, portraitRequired: true, standardProfileFlow: true })
    }
    return active
  }
  return await createParentProfileInvite(team, player, orgId, creatorId)
}

function parentProfileInviteUrl(token, participantMode) {
  const base = 'https://www.sxffootball.cn/service-account-h5/?parentInvite=' + encodeURIComponent(String(token || '')) + '&entry=registered'
  return base + (['adult', 'youth'].includes(String(participantMode || '')) ? '&participantMode=' + participantMode : '')
}

async function regenerateParentProfileInviteForWorkspace(event, identity) {
  const loaded = await parentProfileInviteForWorkspace(event, identity)
  const now = db.serverDate()
  if (loaded.invite.id) await db.collection('parent_profile_invites').doc(loaded.invite.id).update({ data: { status: 'expired', expiredAt: now, updateTime: now } })
  const result = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  const teams = await loadTeams(result.workspace, identity.user, identity.openId)
  const team = teams.find(item => String(item._id) === String(event.teamId || ''))
  const players = await safeGetTeamPlayers(String(event.teamId || ''), 1, { _id: String(event.playerId || '') })
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
  const players = (await safeGetTeamPlayers(teamId, 500)).map(item => formatTeamPlayer(item, rosterContext.requirements))
  const snapshots = (await safeGet('roster_snapshots', { tournamentId, teamId }, 20))
    .filter(item => snapshotMatchesDivision(item, rosterContext.divisionId, rosterContext.allowLegacySnapshot))
  const latest = snapshots.sort((a, b) => toTime(b.updateTime || b.createTime) - toTime(a.updateTime || a.createTime))[0] || null
  let statisticsStatus = 'unavailable'
  // 查询失败保留未知状态，不把未加载的数据显示成零。
  try {
    const { selectRosterMatches, restoreHistoricalRosterPlayers } = await import('./officialRosterStats.mjs')
    const matchResult = await db.collection('matches').where({ tournamentId }).limit(500).get()
    const matches = selectRosterMatches(matchResult.data || [], teamId, rosterContext.divisionId, rosterContext.allowLegacySnapshot)
    let externalEvents = []
    if (matches.some(match => !Array.isArray(match.events))) {
      externalEvents = (await db.collection('match_events').where({ tournamentId }).limit(1000).get()).data || []
    }
    const restored = restoreHistoricalRosterPlayers(players, matches, teamId, latest && latest.playerIds)
    players.splice(0, players.length, ...restored)
    const scope = { teamId, tournamentId, mode:'official', ...(rosterContext.allowLegacySnapshot ? {} : { divisionId:rosterContext.divisionId }) }
    const center = await require('./data-center/service.cjs').createDataService(db).query({ teamIds:[teamId], tournamentIds:[], platformOwner:false }, scope)
    const { sumPlayerRows } = await import('./data-center/statistics.mjs')
    players.forEach(player => {
      const rows = center.players.filter(row => row.playerId === String(player.id))
      if (rows.length) player.tournamentStats = sumPlayerRows(rows).metrics
      else {
        const empty = center.summary.matchCount === 0 || center.coverage.status === 'complete' ? 0 : null
        player.tournamentStats = { appearances:empty, minutesPlayed:empty, goals:empty, assists:empty, yellowCards:empty, redCards:empty }
      }
    })
    statisticsStatus = center.coverage.status === 'complete' ? 'ready' : 'partial'
  } catch (error) { console.warn('[officialRoster] statistics unavailable:', error.message) }
  const division = rosterContext.division || {}
  return { success: true, statisticsStatus, team: { id: teamId, name: firstValue(team.name, team.teamName), logo: firstValue(team.logo, team.logoUrl) }, tournament: { id: tournamentId, name: tournament.name || '赛事', divisionId: rosterContext.divisionId, divisionName: firstValue(rosterContext.registration.divisionName, division.name, division.divisionName, tournament.divisionName, '默认组别'), maxPlayers: Number(firstValue(division.rosterLimit, division.maxPlayersPerTeam, rosterContext.registration.maxPlayersPerTeam, tournament.maxPlayersPerTeam, tournament.maxPlayers, 20)), deadlineText: dateText(firstValue(division.registrationDeadline, tournament.registrationDeadline, tournament.signupDeadline)) }, requirements: rosterContext.requirements, players, snapshot: latest ? { id: String(latest._id), status: latest.status || 'draft', playerIds: latest.playerIds || [], divisionId: String(latest.divisionId || latest.division || rosterContext.divisionId), version: Number(latest.version || 1), returnReason: latest.returnReason || '', returnedAtText: dateText(latest.returnedAt) } : null, canManage: permissions.indexOf('team.manage') >= 0 }
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
  const rows = await safeGetTeamPlayers(teamId, 500, { _id: _.in(playerIds) })
  if (rows.length !== playerIds.length) throw new Error('名单包含不属于当前球队的球员')
  if (rows.some(item => formatTeamPlayer(item, Object.assign({}, rosterContext.requirements, { identityVerificationRequired:true })).profileStatus !== 'complete')) throw new Error('资料不完整、异常或未完成人证核验的球员不能进入正式名单')
  const existing = (await safeGet('roster_snapshots', { tournamentId, teamId }, 20))
    .filter(item => snapshotMatchesDivision(item, rosterContext.divisionId, rosterContext.allowLegacySnapshot))
  if (existing.some(item => ['submitted', 'approved', 'locked'].indexOf(String(item.status || '')) >= 0)) throw new Error('该赛事名单已提交或锁定，不能重复提交')
  const now = db.serverDate()
  const nextVersion = existing.reduce((max, item) => Math.max(max, Number(item.version || 1)), 0) + 1
  const snapshot = { tournamentId, teamId, divisionId: rosterContext.divisionId, divisionName: firstValue(rosterContext.registration.divisionName, division.name, division.divisionName, tournament.divisionName, ''), orgId: result.workspace.orgId || '', playerIds, version: nextVersion, status: 'submitted', submittedBy: identity.user._id, createTime: now, updateTime: now }
  const created = await db.collection('roster_snapshots').add({ data: snapshot })
  const team = teams.find(item => String(item._id) === teamId) || {}
  const organizerUserIds = await findOrganizationUserIds(result.workspace.orgId, 'event.manage')
  if (snapshotStatus === 'submitted') await publishWorkspaceMessage({
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

function lineupPlayerCount(match) {
  const format = /^([5789]|11)side$/.exec(String(match.matchFormat || '').trim().toLowerCase())
  if (format) return Number(format[1])
  const count = Number(match.minPlayers)
  return [5, 7, 8, 9, 11].indexOf(count) >= 0 ? count : 11
}

function lineupBenchLimit(match, tournament) {
  const recognized = tournament && tournament.regulationRecognitionData && tournament.regulationRecognitionData.sharedRegulationDetails || {}
  const values = [match.lineupBenchLimit, match.benchPlayerLimit, recognized.benchPlayerLimit]
  const configured = values.map(Number).find(value => Number.isSafeInteger(value) && value > 0 && value <= 30)
  return configured || 5
}

async function matchLineupForWorkspace(event, identity) {
  const targetWorkspaceId = await workspaceIdForManagedTeam(String(event.teamId || ''), identity)
  const result = await findWorkspaceForAction(identity.user, identity.openId, targetWorkspaceId || event.workspaceId)
  if ((result.workspace.permissions || []).indexOf('team.view') < 0 && (result.workspace.permissions || []).indexOf('team.manage') < 0) throw new Error('当前身份没有访问比赛阵容的权限')
  const matchId = String(event.matchId || ''), teamId = String(event.teamId || '')
  const teams = await loadTeams(result.workspace, identity.user, identity.openId)
  if (!teams.some(item => String(item._id) === teamId)) throw new Error('球队不属于当前工作空间')
  const match = (await safeGet('matches', { _id: matchId }, 1))[0]
  if (!match || [String(match.homeTeamId || ''), String(match.awayTeamId || '')].indexOf(teamId) < 0) throw new Error('比赛不存在或球队不参与该比赛')
  const tournamentId = String(match.tournamentId || '')
  const tournament = (await safeGet('tournaments', { _id: tournamentId }, 1))[0] || {}
  const registrations = await safeGet('tournament_teams', { tournamentId, teamId }, 20)
  const registrationDivisionIds = unique(registrations.map(registrationDivisionId))
  // 历史比赛的 division 可能保存组别名称，正式名单保存的是参赛关系的组别 ID。
  const matchDivisionValues = unique([
    match.divisionId,
    match.division,
    match.divisionName
  ].map(value => String(value || '').trim()).filter(Boolean))
  const declaredDivisionId = String(match.divisionId || '').trim()
  const exactRegistration = registrations.find(registration => registrationDivisionId(registration) === declaredDivisionId)
  const matchingRegistrations = registrations.filter(registration => {
    const aliases = unique([
      registration.divisionId,
      registration.division,
      registration.divisionName
    ].map(value => String(value || '').trim()).filter(Boolean))
    return matchDivisionValues.some(value => aliases.indexOf(value) >= 0)
  })
  let rosterDivisionId = ''
  if (exactRegistration) rosterDivisionId = registrationDivisionId(exactRegistration)
  else if (matchingRegistrations.length === 1) rosterDivisionId = registrationDivisionId(matchingRegistrations[0])
  else if (registrationDivisionIds.length === 1) rosterDivisionId = registrationDivisionIds[0]
  else if (!matchDivisionValues.length && registrationDivisionIds.length > 1) throw new Error('比赛缺少竞赛组别信息，不能安全读取正式名单')
  else if (registrationDivisionIds.length > 1) throw new Error('比赛组别与球队参赛组别不匹配，不能安全读取正式名单')
  else rosterDivisionId = matchDivisionValues[0] || registrationDivisionIds[0] || 'default'
  const allowLegacyRoster = registrationDivisionIds.length <= 1
  const roster = (await safeGet('roster_snapshots', { tournamentId, teamId, status: 'approved' }, 1000))
    .filter(snapshot => snapshotMatchesDivision(snapshot, rosterDivisionId, allowLegacyRoster))
    .sort((a,b)=>toTime(b.updateTime || b.createTime)-toTime(a.updateTime || a.createTime))[0]
  if (!roster) throw new Error('尚未形成已审核赛事正式名单，不能编排单场阵容')
  const players = await safeGetTeamPlayers(teamId, 100, { _id: _.in(roster.playerIds || []) })
  const cardFileIds = unique(players.map(item => String(item.playerCardFileId || '')).filter(Boolean))
  let cardUrls = {}
  let cardAssetsError = false
  if (cardFileIds.length) {
    try {
      for (let index = 0; index < cardFileIds.length; index += 50) {
        const files = (await cloud.getTempFileURL({ fileList: cardFileIds.slice(index, index + 50) })).fileList || []
        files.forEach(file => { if (file.fileID && file.tempFileURL) cardUrls[String(file.fileID)] = String(file.tempFileURL) })
      }
      cardAssetsError = Object.keys(cardUrls).length !== cardFileIds.length
    } catch (error) {
      cardAssetsError = true
      console.error('[getMiniWorkspace] player cards unavailable:', error)
    }
  }
  const lineups = await safeGet('match_lineup_snapshots', { matchId, teamId }, 20)
  const latest = lineups.sort((a,b)=>toTime(b.updateTime)-toTime(a.updateTime))[0]
  const opponentIds = unique([String(match.homeTeamId || ''), String(match.awayTeamId || '')].filter(Boolean))
  const matchTeams = opponentIds.length ? await safeGet('teams', { _id: _.in(opponentIds) }, 2) : []
  const teamMap = {}
  matchTeams.forEach(item => { teamMap[String(item._id)] = item })
  const home = teamMap[String(match.homeTeamId || '')] || {}
  const away = teamMap[String(match.awayTeamId || '')] || {}
  let coachResult = { coach: null, state: 'unavailable' }
  try { coachResult = await require('./lineupHeadCoach.cjs').loadLineupHeadCoach({ db, cloud, teamId, team: teamMap[teamId] || {}, players }) }
  catch (error) { console.error('[getMiniWorkspace] head coach unavailable:', error.message) }
  const side = String(match.homeTeamId || '') === teamId ? 'home' : 'away'
  const preMatchState = match.preMatchState && typeof match.preMatchState === 'object' ? match.preMatchState : {}
  const teamArrivals = preMatchState.teamArrivals && typeof preMatchState.teamArrivals === 'object' ? preMatchState.teamArrivals : {}
  const refereeArrived = Boolean(preMatchState.refereeArrival && preMatchState.refereeArrival.confirmedAt)
  const homeArrived = Boolean(teamArrivals.home && teamArrivals.home.confirmedAt)
  const awayArrived = Boolean(teamArrivals.away && teamArrivals.away.confirmedAt)
  const matchStartTime = firstValue(match.matchTime, match.startTime, match.matchDate, match.date)
  const matchStartMs = toTime(matchStartTime)
  const nowMs = Date.now()
  const matchStatus = String(match.status || 'scheduled').toLowerCase()
  const matchStarted = ['ongoing', 'live', 'in_progress', 'inprogress', 'finished', 'completed', 'archived', 'cancelled'].indexOf(matchStatus) >= 0 || (matchStartMs > 0 && matchStartMs <= nowMs)
  const finalWindowOpen = !matchStarted && matchStartMs > 0 && nowMs >= matchStartMs - 60 * 60 * 1000
  const preSubmitAllowed = !matchStarted && !finalWindowOpen
  const latestStatus = String(latest && latest.status || '')
  const lineupLocked = ['submitted', 'locked'].indexOf(latestStatus) >= 0
  return {
    success: true,
    workspaceOrgId: String(result.workspace.orgId || ''),
     match: { id: matchId, tournamentId, divisionId: rosterDivisionId, side, minPlayers: lineupPlayerCount(match), benchLimit: lineupBenchLimit(match, tournament), matchFormat: String(match.matchFormat || ''), name: String(match.name || ''), matchDate: String(match.matchDate || ''), startTime: matchStartTime, status: matchStatus, venue: String(match.venue || ''), divisionName: String(match.divisionName || match.division || ''), homeTeamName: String(home.name || match.homeTeamName || '主队'), awayTeamName: String(away.name || match.awayTeamName || '客队'), homeLogo: String(home.logoTransparent || home.logoUrl || home.logo || ''), awayLogo: String(away.logoTransparent || away.logoUrl || away.logo || ''), refereeArrived, homeArrived, awayArrived, teamArrived:side === 'home' ? homeArrived : awayArrived, allArrived:refereeArrived && homeArrived && awayArrived },
    headCoach: coachResult.coach,
    headCoachState: coachResult.state,
    rosterId: String(roster._id),
    players: players.map(item => {
      const cardFileId = String(item.playerCardFileId || '')
      const cardUrl = cardUrls[cardFileId] || ''
      const playerTeamId = String(item.teamId || item.teamCode || teamId)
      const playerTeam = teamMap[playerTeamId] || teamMap[teamId] || {}
      const cardTier = ['bronze', 'silver', 'gold'].includes(String(item.playerCardTier || '')) && cardFileId
        ? String(item.playerCardTier)
        : ''
      return Object.assign(formatTeamPlayer(item), {
        cardUrl, cardTier, teamLogo: String(playerTeam.logoTransparent || playerTeam.logoUrl || playerTeam.logo || ''),
        cardState: cardUrl ? 'ready' : (cardFileId ? 'load_failed' : 'missing')
      })
    }),
    cardAssetsError,
    lineup: latest ? { id: String(latest._id), formation: String(latest.formation || ''), starters: latest.starters || [], substitutes: latest.substitutes || [], status: latestStatus, returnReason: String(latest.returnReason || ''), submittedAtText: dateText(firstValue(latest.updateTime, latest.createTime)) } : null,
    locked: lineupLocked,
    preSubmitted: latestStatus === 'pre_submitted',
    preSubmitAllowed,
    finalWindowOpen,
    canSubmit: (result.workspace.permissions || []).indexOf('team.manage') >= 0 && !lineupLocked && (preSubmitAllowed || (finalWindowOpen && Boolean(refereeArrived && homeArrived && awayArrived))),
    submitButtonText: preSubmitAllowed ? '赛前预提交阵容' : (finalWindowOpen ? '确认并提交本场阵容' : '提交窗口已关闭'),
    submissionWindowText: preSubmitAllowed ? '可提前预提交；比赛前1小时进入正式提交窗口。' : (finalWindowOpen ? '已进入正式提交窗口，提交后将锁定阵容。' : '比赛已开始，阵容已锁定。'),
    canManage: (result.workspace.permissions || []).indexOf('team.manage') >= 0
  }
}

async function confirmTeamArrivalForWorkspace(event, identity) {
  const targetWorkspaceId = await workspaceIdForManagedTeam(String(event.teamId || ''), identity)
  const result = await findWorkspaceForAction(identity.user, identity.openId, targetWorkspaceId || event.workspaceId)
  if ((result.workspace.permissions || []).indexOf('team.manage') < 0) throw new Error('当前身份没有确认球队到场的权限')
  const matchId = String(event.matchId || ''), teamId = String(event.teamId || '')
  const teams = await loadTeams(result.workspace, identity.user, identity.openId)
  if (!teams.some(item => String(item._id) === teamId)) throw new Error('球队不属于当前工作空间')
  const match = (await safeGet('matches', { _id:matchId }, 1))[0]
  if (!match) throw new Error('比赛不存在')
  const side = String(match.homeTeamId || '') === teamId ? 'home' : (String(match.awayTeamId || '') === teamId ? 'away' : '')
  if (!side) throw new Error('该球队不属于本场比赛')
  if (['ongoing','live','finished','completed','cancelled'].indexOf(String(match.status || 'scheduled')) >= 0) throw new Error('当前比赛状态不能确认赛前到场')
  const state = Object.assign({}, match.preMatchState || {})
  state.teamArrivals = Object.assign({}, state.teamArrivals || {})
  state.teamArrivals[side] = { confirmedAt:new Date(), confirmedByUserId:String(identity.user._id), confirmedByPhoneMasked:maskPhone(String(firstValue(identity.user.phone, identity.user.phoneNumber) || '')) }
  state.teamsArrival = state.teamArrivals.home && state.teamArrivals.away ? { confirmedAt:new Date(), source:'two_team_confirmations' } : null
  await db.collection('matches').doc(matchId).update({ data:{ preMatchState:state, updateTime:db.serverDate() } })
  return { success:true, side, teamArrived:true, allTeamsArrived:Boolean(state.teamArrivals.home && state.teamArrivals.away) }
}

function matchPassSecret() { return String(process.env.SXF_MATCH_PASS_SECRET || '').trim() }
function matchPassSignature(passId) { return crypto.createHmac('sha256', matchPassSecret()).update('football:adult-match-pass:' + String(passId)).digest('base64url').slice(0,32) }

async function adultElectronicPassForWorkspace(event, identity) {
  const matchId = String(event.matchId || ''), playerId = String(event.playerId || '')
  if (!matchId || !playerId) throw workspaceError('ADULT_PASS_CONTEXT_REQUIRED', '缺少比赛或球员信息')
  if (!matchPassSecret()) throw workspaceError('MATCH_PASS_SECRET_MISSING', '电子参赛证签名尚未配置，请联系管理员')
  for (const name of ['player_electronic_passes','adult_match_passes']) { try { await db.createCollection(name) } catch (error) {} }
  const match = (await safeGet('matches', { _id:matchId }, 1))[0]
  const player = (await safeGet('players', { _id:playerId }, 1))[0]
  if (!match || !player) throw workspaceError('ADULT_PASS_NOT_FOUND', '比赛或球员不存在')
  const phone = String(identity.phone || '').replace(/\D/g,'')
  const playerPhones = unique([player.playerPhone, player.contactPhone, player.phone, player.phoneNumber].map(value => String(value || '').replace(/\D/g,'')))
  if (!phone || playerPhones.indexOf(phone) < 0 || String(player.registrantType || '') !== 'self') throw workspaceError('ADULT_PASS_OWNER_REQUIRED', '只能由已验证手机号的成人球员本人调取参赛证')
  if (['verified','approved','complete','manual_required'].indexOf(String(player.identityStatus || '').toLowerCase()) < 0) throw workspaceError('PLAYER_IDENTITY_REQUIRED', '请先完成人证核验')
  const division = match.divisionId ? (await safeGet('divisions', { _id:String(match.divisionId) }, 1))[0] : null
  const participantType = String(firstValue(division && division.participantType, division && division.audienceType, match.participantType, '')).toLowerCase()
  const label = String(firstValue(division && division.name, match.divisionName, ''))
  if (participantType !== 'adult' && !/成人|公开组/i.test(label)) throw workspaceError('ADULT_PASS_NOT_APPLICABLE', '青少年赛事由助理裁判直接按名单核验，不使用二维码')
  const side = String(match.homeTeamId || '') === String(player.teamId || '') ? 'home' : (String(match.awayTeamId || '') === String(player.teamId || '') ? 'away' : '')
  if (!side) throw workspaceError('PLAYER_NOT_IN_MATCH_TEAM', '球员所属球队不参加本场比赛')
  const lineup = match[side === 'home' ? 'homeLineup' : 'awayLineup'] || {}
  const allPlayers = (Array.isArray(lineup.starters) ? lineup.starters : []).concat(Array.isArray(lineup.substitutes) ? lineup.substitutes : [])
  if (!allPlayers.some(item => String(firstValue(item._id, item.id, item.playerId) || '') === playerId)) throw workspaceError('PLAYER_NOT_IN_MATCH_LINEUP', '球员不在本场已提交阵容中')
  const confirmations = lineup.confirmations || {}
  if (!(confirmations.mainReferee && confirmations.mainReferee.status === 'approved')) throw workspaceError('LINEUP_NOT_CONFIRMED', '请等待第四官员和主裁判确认阵容')
  let certificate = (await safeGet('player_electronic_passes', { playerId, status:'active' }, 2))[0]
  if (!certificate) {
    const number = 'SXF-' + Date.now().toString(36).toUpperCase() + '-' + playerId.slice(-5).toUpperCase()
    const added = await db.collection('player_electronic_passes').add({ data:{ sport:'football', playerId, ownerUserId:String(identity.user._id), certificateNumber:number, status:'active', issuedAt:db.serverDate(), createTime:db.serverDate(), updateTime:db.serverDate() } })
    certificate = { _id:added._id, certificateNumber:number, status:'active' }
  }
  let pass = (await safeGet('adult_match_passes', { matchId, playerId, status:'active' }, 5)).find(item => !item.expiresAt || toTime(item.expiresAt) > Date.now())
  if (!pass) {
    const passId = crypto.randomBytes(12).toString('base64url'), expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
    await db.collection('adult_match_passes').doc(passId).set({ data:{ sport:'football', matchId, playerId, teamId:String(player.teamId || ''), side, certificateId:String(certificate._id || ''), status:'active', expiresAt, issuedByUserId:String(identity.user._id), createTime:db.serverDate(), updateTime:db.serverDate() } })
    pass = { _id:passId, expiresAt }
  }
  const token = 'SXFMP1.' + String(pass._id) + '.' + matchPassSignature(pass._id)
  return { success:true, certificate:{ id:String(certificate._id || ''), number:String(certificate.certificateNumber || '') }, matchPass:{ id:String(pass._id), token, expiresAt:pass.expiresAt || null }, player:{ id:playerId, name:String(player.name || '球员'), jerseyNumber:String(player.jerseyNumber || ''), photoUrl:String(player.photoUrl || ''), identityLabel:'人证核验通过' }, match:{ id:matchId, teamsText:String(firstValue(match.homeTeamName,'主队')) + ' vs ' + String(firstValue(match.awayTeamName,'客队')), timeText:dateText(firstValue(match.matchTime, match.matchDate, match.startTime)) } }
}

async function submitMatchLineupForWorkspace(event, identity) {
  const loaded = await matchLineupForWorkspace(event, identity)
  if (!loaded.canManage) throw new Error('当前身份没有提交比赛阵容的权限')
  const startMs = toTime(loaded.match.startTime)
  const finalWindowOpen = startMs > 0 && Date.now() >= startMs - 60 * 60 * 1000
  if (startMs > 0 && Date.now() >= startMs) throw new Error('比赛已经开始，阵容已锁定')
  if (finalWindowOpen && (!loaded.match.refereeArrived || !loaded.match.homeArrived || !loaded.match.awayArrived)) throw new Error('正式提交需等待主裁判和双方球队负责人完成赛前报到')
  const starters = Array.isArray(event.starters) ? event.starters : []
  const substitutes = Array.isArray(event.substitutes) ? event.substitutes : []
  const ids = unique(starters.map(item => item.playerId).concat(substitutes.map(item => item.playerId)))
  const allowed = new Set(loaded.players.map(item => item.id))
  if (starters.length !== loaded.match.minPlayers || substitutes.length > loaded.match.benchLimit || ids.length !== starters.length + substitutes.length || ids.some(id => !allowed.has(id))) throw new Error('首发人数、替补上限或阵容成员不符合本场规则与已审核正式名单')
  const existing = await safeGet('match_lineup_snapshots', { matchId: loaded.match.id, teamId: String(event.teamId || '') }, 20)
  if (existing.some(item => ['submitted', 'locked'].indexOf(String(item.status || '')) >= 0)) throw new Error('该场阵容已提交或锁定')
  const version = existing.reduce((max, item) => Math.max(max, Number(item.version || 1)), 0) + 1
  const now = db.serverDate()
  const snapshotStatus = finalWindowOpen ? 'submitted' : 'pre_submitted'
  const snapshotData = { matchId: loaded.match.id, tournamentId: loaded.match.tournamentId, teamId: String(event.teamId || ''), rosterId: loaded.rosterId, formation: String(event.formation || ''), starters, substitutes, version, status: snapshotStatus, submittedBy: identity.user._id, createTime: now, updateTime: now }
  const existingDraft = existing.find(item => String(item.status || '') === 'pre_submitted')
  const created = existingDraft
    ? (await db.collection('match_lineup_snapshots').doc(String(existingDraft._id)).update({ data: snapshotData }), { _id: String(existingDraft._id) })
    : await db.collection('match_lineup_snapshots').add({ data: snapshotData })
  const playerMap = {}
  loaded.players.forEach(item => { playerMap[String(item.id)] = item })
  const lineup = { teamId:String(event.teamId || ''), formation:String(event.formation || ''), starters:starters.map(item => Object.assign({}, playerMap[String(item.playerId)] || {}, { _id:String(item.playerId), playerId:String(item.playerId), slotId:String(item.slotId || '') })), substitutes:substitutes.map(item => Object.assign({}, playerMap[String(item.playerId)] || {}, { _id:String(item.playerId), playerId:String(item.playerId) })), status:snapshotStatus, submitted:snapshotStatus === 'submitted', preSubmitted:snapshotStatus === 'pre_submitted', version, snapshotId:String(created._id), confirmations:{}, identityChecks:{}, submittedAt:now, submittedByUserId:String(identity.user._id) }
  const side = loaded.match.side
  const matchUpdate = { lineupsLocked:false, identityVerificationStatus:snapshotStatus === 'submitted' ? 'pending_lineup_confirmation' : 'pre_submitted', updateTime:now }
  matchUpdate[side === 'home' ? 'homeLineup' : 'awayLineup'] = lineup
  matchUpdate[side === 'home' ? 'homeLineupStatus' : 'awayLineupStatus'] = 'submitted'
  await db.collection('matches').doc(loaded.match.id).update({ data:matchUpdate })
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
  return { success: true, lineupId: String(created._id), status: snapshotStatus, preSubmitted: snapshotStatus === 'pre_submitted' }
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
  const players = await safeGetTeamPlayers(teamId, 500)
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

// 赛事级球队认领码没有逐队 token，因此必须比逐队邀请更严格。
// 逐队邀请由主办方定向发放，token 本身即是凭据，所以 prebuiltTeamInviteForWorkspace 允许
// allowedClaimPhones 为空时凭 token 认领；赛事级认领码任何人都能扫到，
// 因此这里只认「白名单非空且命中本人已验证手机号」，白名单为空一律不列出、也不可认领，
// 否则报名表没登记负责人手机号的球队会变成“谁扫到谁认领”。
function claimPhoneAllowed(invite, phone) {
  const allowed = unique((Array.isArray(invite && invite.allowedClaimPhones) ? invite.allowedClaimPhones : [])
    .concat([invite && invite.targetPhone, invite && invite.inviteePhone])
    .map(value => String(value || '').replace(/\D/g, ''))
    .filter(value => /^1[3-9]\d{9}$/.test(value)))
  if (!allowed.length) return false
  return allowed.indexOf(String(phone || '')) >= 0
}

async function resolveClaimCode(inviteKey) {
  const key = String(inviteKey || '').trim()
  if (!key) throw workspaceError('CLAIM_CODE_REQUIRED', '缺少球队认领码')
  const rows = await safeGet('tournament_invites', { inviteType: 'tournament_claim_code', inviteKey: key }, 2)
  const code = rows.filter(item => String(item.status || '') === 'active')[0]
  if (!code) throw workspaceError('CLAIM_CODE_INVALID', '球队认领码无效或已停用')
  const expiry = toTime(code.expireAt)
  if (expiry > 0 && expiry <= Date.now()) throw workspaceError('CLAIM_CODE_EXPIRED', '球队认领码已过期，请联系赛事主办方重新生成')
  return code
}

// 一个赛事可能导入上百支待认领球队，分页读取并设置上界，避免单次查询超时。
async function listClaimableInvites(tournamentId) {
  const rows = []
  for (const type of ['prebuilt_tournament_team', 'team_owner_transfer']) {
    for (let offset = 0; offset < 500; offset += 100) {
      let page = []
      try {
        const result = await db.collection('team_invitations')
          .where({ tournamentId, type })
          .skip(offset)
          .limit(100)
          .get()
        page = result.data || []
      } catch (error) {
        console.warn('[getMiniWorkspace] claim invite page skipped:', type, error.message)
        break
      }
      rows.push.apply(rows, page)
      if (page.length < 100) break
    }
  }
  return rows
}

async function claimCodeContextForWorkspace(event, identity) {
  const code = await resolveClaimCode(event.inviteKey || event.c)
  const tournament = (await safeGet('tournaments', { _id: String(code.tournamentId || '') }, 1))[0]
  if (!tournament) throw workspaceError('CLAIM_CODE_INVALID', '认领码对应的赛事不存在或已下线')
  const phone = verifiedUserPhone(identity.user)
  return {
    success: true,
    code: { inviteId: String(code._id || ''), expiresAtText: dateText(code.expireAt) },
    tournament: {
      id: String(tournament._id || ''),
      name: String(tournament.name || ''),
      organizerName: String(tournament.organizerName || tournament.organizer || ''),
      registrationDeadlineText: dateText(tournament.registrationDeadline || tournament.signupDeadline),
      status: String(tournament.status || '')
    },
    phoneMasked: maskPhone(phone),
    needsPhone: !phone
  }
}

// 列出手机号命中的待认领球队，以及已由本人认领、可直接进入的球队。
// 已被其他账号接受的邀请不返回，前端不得自行放宽授权判断。
async function claimableTeamsForWorkspace(event, identity) {
  const code = await resolveClaimCode(event.inviteKey || event.c)
  const tournamentId = String(code.tournamentId || '')
  const tournament = (await safeGet('tournaments', { _id: tournamentId }, 1))[0]
  if (!tournament) throw workspaceError('CLAIM_CODE_INVALID', '认领码对应的赛事不存在或已下线')
  const phone = verifiedUserPhone(identity.user)
  if (!phone) return { success: true, needsPhone: true, tournamentId, teams: [] }
  const invites = await listClaimableInvites(tournamentId)
  const teams = []
  for (const invite of invites) {
    const inviteType = String(invite.type || '')
    if (inviteType === 'team_owner_transfer') {
      if (String(invite.status || '') !== 'active' || !claimPhoneAllowed(invite, phone)) continue
      try { assertPrebuiltInviteActive(invite, tournament) } catch (error) { continue }
      if (invite.inviteeUserId && String(invite.inviteeUserId) !== String(identity.user._id)) continue
      const transferTeamId = String(invite.teamId || '')
      const transferTeam = (await safeGet('teams', { _id:transferTeamId }, 1))[0]
      if (!transferTeam) continue
      const currentOwnerId = String(transferTeam.ownerId || transferTeam.ownerUserId || transferTeam.claimedByUserId || '')
      if (!currentOwnerId || currentOwnerId !== String(invite.fromOwnerId || '') || currentOwnerId === String(identity.user._id || '')) continue
      teams.push({
        inviteId:String(invite._id || ''), transferId:String(invite._id || ''), teamId:transferTeamId,
        teamName:String(transferTeam.name || transferTeam.teamName || '未命名球队'), divisionName:String(invite.divisionName || ''),
        claimantRoleLabel:'新主账号', managerPhoneMasked:maskPhone(phone), ownershipTransfer:true,
        targetName:String(invite.targetName || ''), claimedByMe:false, alreadyClaimed:false, workspaceId:'', requiresReview:false,
        statusText:'待接收主账号'
      })
      continue
    }
    // pending/review_approved 可认领；accepted 仅供原接受人回访。
    const status = String(invite.status || 'pending')
    if (['pending', 'review_approved', 'accepted'].indexOf(status) < 0) continue
    const acceptedIdentityMatch = status === 'accepted' && (
      String(invite.acceptedUserId || '') === String(identity.user._id || '') ||
      String(invite.acceptedOpenId || '') === String(identity.openId || '')
    )
    // 待认领仍严格按最新登记手机号；已接受邀请允许原 acceptedUserId 回访，
    // 避免主办方后改联系电话后把真实认领人挡在球队入口之外。
    if (!acceptedIdentityMatch && !claimPhoneAllowed(invite, phone)) continue
    if (status !== 'accepted') {
      try { assertPrebuiltInviteActive(invite, tournament) } catch (error) { continue }
    }
    const teamId = status === 'accepted' ? String(invite.acceptedTeamId || invite.teamId || '') : String(invite.teamId || '')
    const team = (await safeGet('teams', { _id: teamId }, 1))[0]
    if (!team) continue
    const claimStatus = String(team.claimStatus || 'unclaimed').toLowerCase()
    const ownerIds = [team.ownerId, team.ownerUserId, team.claimedByUserId].map(value => String(value || '')).filter(Boolean)
    const hasOwnership = ownerIds.length > 0 || Boolean(team.orgId && String(team.orgId) !== String(invite.organizerOrgId || ''))
    const claimedByMe = ownerIds.indexOf(String(identity.user._id || '')) >= 0
    const acceptedByMe = status === 'accepted' && (acceptedIdentityMatch || claimedByMe)
    if (status === 'accepted' && !acceptedByMe) continue
    const alreadyClaimed = status === 'accepted' && acceptedByMe
    const workspaceId = alreadyClaimed ? await workspaceIdForManagedTeam(teamId, identity) : ''
    const claimant = (Array.isArray(invite.claimantCandidates) ? invite.claimantCandidates : [])
      .find(item => String(item && item.phone || '').replace(/\D/g, '') === phone)
    teams.push({
      inviteId: String(invite._id || ''),
      teamId,
      teamName: String(team.name || team.teamName || '未命名球队'),
      divisionName: String(invite.divisionName || ''),
      claimantRoleLabel: String(claimant && claimant.roleLabel || ''),
      managerPhoneMasked: maskPhone(String(invite.managerPhone || '')),
      claimedByMe,
      alreadyClaimed,
      workspaceId,
      requiresReview: !claimedByMe && (claimStatus !== 'unclaimed' || hasOwnership),
      statusText: alreadyClaimed ? '已由你认领' : (claimedByMe ? '已认领' : ((claimStatus !== 'unclaimed' || hasOwnership) ? '需人工核验' : '待认领'))
    })
  }
  return { success: true, needsPhone: false, phoneMasked: maskPhone(phone), tournamentId, teams }
}

async function prebuiltTeamInviteForWorkspace(event, identity) {
  const inviteId = String(event.inviteId || event.token || '')
  if (!inviteId) throw new Error('缺少参赛邀请')
  const invite = (await safeGet('team_invitations', { _id: inviteId }, 1))[0]
  assertPrebuiltInviteActive(invite)
  if (!invite || String(invite.type || '') !== 'prebuilt_tournament_team') throw new Error('邀请不存在或已失效')
  const allowedClaimPhones = unique((Array.isArray(invite.allowedClaimPhones) ? invite.allowedClaimPhones : []).map(function(value) { return String(value || '').replace(/\D/g, '') }).filter(function(value) { return /^1[3-9]\d{9}$/.test(value) }))
  if (allowedClaimPhones.length && allowedClaimPhones.indexOf(String(identity.phone || '')) < 0) throw workspaceError('TEAM_CLAIM_PHONE_MISMATCH', '该邀请仅限报名表中的领队或主教练认领，请使用登记手机号登录')
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
  const claimant = (Array.isArray(invite.claimantCandidates) ? invite.claimantCandidates : []).find(function(item) { return String(item && item.phone || '').replace(/\D/g, '') === String(identity.phone || '') })
  return { success: true, invite: { id: inviteId, status: inviteStatus, reviewRequestId: String(invite.reviewRequestId || ''), organizerName: String(invite.organizerName || ''), managerName: String(invite.managerName || ''), managerPhoneMasked: maskPhone(String(invite.managerPhone || '')), claimantRoleLabel:String(claimant && claimant.roleLabel || ''), teamId, tournamentId, divisionName: String(invite.divisionName || '') }, tournament: { name: String(tournament.name || '') }, prebuiltTeam: { id: teamId, name: String(team.name || team.teamName || ''), claimStatus, managesPrebuiltTeam, requiresReview: !managesPrebuiltTeam && (claimStatus !== 'unclaimed' || hasOwnership) }, candidateTeams }
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

async function transferImportedPlayerDrafts(invite, targetTeamId, identity) {
  const sourceTeamId = String(invite.teamId || '')
  const batchId = String(invite.registrationImportBatchId || '')
  const where = batchId ? { importBatchId:batchId } : { sourceTeamId }
  const rows = await safeGet('registration_player_drafts', where, 500)
  const movable = rows.filter(item => ['pending', 'conflict'].indexOf(String(item.reviewStatus || 'pending')) >= 0)
  for (const draft of rows) {
    await db.collection('registration_player_drafts').doc(draft._id).update({ data:{
      teamId:targetTeamId,
      claimedTeamId:targetTeamId,
      claimedByUserId:String(identity.user._id || ''),
      claimTransferredAt:db.serverDate(),
      updateTime:db.serverDate()
    } })
  }
  // 认领既有球队时，报名表导入后由主办方补录的球员也属于这支预建球队，
  // 不能只按 registrationImportBatchId 迁移，否则补录球员会留在未认领占位队。
  const importedPlayers = (await safeGetTeamPlayers(sourceTeamId, 500))
    .filter(item => ['archived', 'deleted'].indexOf(String(item.status || '').toLowerCase()) < 0)
  const targetTeam = targetTeamId ? ((await safeGet('teams', { _id:targetTeamId }, 1))[0] || {}) : {}
  // 即使 sourceTeamId 与 targetTeamId 相同，也要把历史 teamCode-only
  // 记录补齐 teamId，避免同一支队伍在不同端出现不同名单。
  for (const player of importedPlayers) {
    await db.collection('players').doc(player._id).update({ data:{
      teamId:targetTeamId,
      teamCode:targetTeamId,
      teamName:String(targetTeam.name || targetTeam.teamName || player.teamName || ''),
      updateTime:db.serverDate()
    } })
  }
  if (sourceTeamId && sourceTeamId !== targetTeamId) {
    const snapshots = await safeGet('roster_snapshots', { tournamentId:String(invite.tournamentId || ''), teamId:sourceTeamId, source:'registration_docx_import_direct' }, 20)
    for (const snapshot of snapshots) await db.collection('roster_snapshots').doc(snapshot._id).update({ data:{ teamId:targetTeamId, updateTime:db.serverDate() } })
  }
  if (batchId) await db.collection('registration_import_batches').doc(batchId).update({ data:{ claimStatus:'claimed', status:'completed', playerReviewStatus:'completed', claimedTeamId:targetTeamId, claimedByUserId:String(identity.user._id || ''), claimedAt:db.serverDate(), updateTime:db.serverDate() } })
  if (targetTeamId) await db.collection('teams').doc(targetTeamId).update({ data:{ playerCount:importedPlayers.length, pendingPlayerDraftCount:movable.length, playerReviewStatus:movable.length ? 'pending' : 'completed', updateTime:db.serverDate() } })
  if (sourceTeamId && sourceTeamId !== targetTeamId) await db.collection('teams').doc(sourceTeamId).update({ data:{ pendingPlayerDraftCount:0, playerReviewStatus:'transferred', importedDraftsTransferredToTeamId:targetTeamId, updateTime:db.serverDate() } })
  return movable.length
}

async function acceptPrebuiltTeamInviteForWorkspace(event, identity) {
  if (event.disclaimerAgreed !== true) throw new Error('请先阅读并同意参赛免责声明')
  const requestedInviteId = String(event.inviteId || event.token || '')
  const existingInvite = requestedInviteId ? (await safeGet('team_invitations', { _id:requestedInviteId }, 1))[0] : null
  if (existingInvite && String(existingInvite.type || '') === 'prebuilt_tournament_team' && String(existingInvite.status || '') === 'accepted') {
    const acceptedTeamId = String(existingInvite.acceptedTeamId || existingInvite.teamId || '')
    const acceptedTeam = acceptedTeamId ? (await safeGet('teams', { _id:acceptedTeamId }, 1))[0] : null
    const ownerIds = acceptedTeam ? [acceptedTeam.ownerId, acceptedTeam.ownerUserId, acceptedTeam.claimedByUserId].map(value => String(value || '')).filter(Boolean) : []
    const acceptedByMe = String(existingInvite.acceptedUserId || '') === String(identity.user._id || '') ||
      String(existingInvite.acceptedOpenId || '') === String(identity.openId || '') ||
      ownerIds.indexOf(String(identity.user._id || '')) >= 0
    if (acceptedTeam && acceptedByMe) {
      // 旧邀请重复进入时顺手补一次球员归属同步，覆盖认领前后
      // 由 PC 只写 teamCode 的历史记录，不要求用户重新认领球队。
      const pendingPlayerDraftCount = await transferImportedPlayerDrafts(existingInvite, acceptedTeamId, identity)
      return {
        success:true,
        teamId:acceptedTeamId,
        workspaceId:await workspaceIdForManagedTeam(acceptedTeamId, identity),
        pendingPlayerDraftCount,
        destination:pendingPlayerDraftCount > 0 ? 'imported-player-review' : 'team-center',
        alreadyClaimed:true,
        idempotent:true
      }
    }
  }
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
    const pendingPlayerDraftCount = await transferImportedPlayerDrafts(invite, teamId, identity)
    await createRegistrationReviewArtifacts(invite, relationId, teamId, identity)
    const workspaceId = await workspaceIdForManagedTeam(teamId, identity)
    return { success: true, teamId, workspaceId, registrationId:relationId, pendingPlayerDraftCount, destination: pendingPlayerDraftCount ? 'imported-player-review' : 'team-center' }
  }
  if (preview.prebuiltTeam.requiresReview && !reviewApproved) {
    await db.collection('team_invitations').doc(preview.invite.id).update({ data: { status: 'review_required', reviewReason: '预建队存在归属或认领冲突，禁止自动合并', reviewRequestedBy: identity.user._id, updateTime: now } })
    return { success: true, reviewRequired: true, destination: 'claim-conflict' }
  }
  const membership = (await safeGet('team_memberships', { teamId: preview.prebuiltTeam.id, userId: identity.user._id }, 20)).filter(function(item) {
    return ['active', 'accepted', 'claimed'].indexOf(String(item.status || 'active').toLowerCase()) >= 0
  })
  if (!membership.length) await db.collection('team_memberships').add({ data: { teamId: preview.prebuiltTeam.id, userId: identity.user._id, openId: identity.openId || '', role: 'owner', status: 'accepted', source: 'prebuilt_invite_claim', createTime: now, updateTime: now } })
  await db.collection('teams').doc(preview.prebuiltTeam.id).update({ data: { claimStatus: 'claimed', ownerId: identity.user._id, claimedByUserId: identity.user._id, updateTime: now } })
  await db.collection('team_invitations').doc(preview.invite.id).update({ data: { status: 'accepted', acceptedChoice: 'prebuilt', acceptedTeamId: preview.prebuiltTeam.id, acceptedUserId: identity.user._id, acceptedOpenId: identity.openId || '', reviewStatus: reviewApproved ? 'confirmed' : '', updateTime: now } })
  const pendingPlayerDraftCount = await transferImportedPlayerDrafts(invite, preview.prebuiltTeam.id, identity)
  const relations = await safeGet('tournament_teams', { tournamentId: preview.invite.tournamentId, teamId: preview.prebuiltTeam.id }, 20)
  let relationId = ''
  for (const relation of relations) {
    const relationStatus = String(relation.status || '').toLowerCase()
    if (['removed', 'invite_cancelled', 'cancelled'].includes(relationStatus)) continue
    relationId = String(relation._id)
    const relationUpdate = { claimStatus:'claimed', claimReviewStatus:'confirmed', claimReviewRequestId:preview.invite.reviewRequestId || '', applicantUserId:identity.user._id, applicantMiniOpenId:identity.openId || '', acceptedUserId:identity.user._id, inviteId:preview.invite.id, updateTime:now }
    if (!['approved', 'confirmed', 'claimed', 'accepted'].includes(relationStatus)) relationUpdate.status = 'pending'
    await db.collection('tournament_teams').doc(relation._id).update({ data:relationUpdate })
    break
  }
  if (!relationId) {
    const created = await db.collection('tournament_teams').add({ data:{ tournamentId:preview.invite.tournamentId, divisionId:invite.divisionId || 'default', divisionName:invite.divisionName || '', teamId:preview.prebuiltTeam.id, status:'pending', claimStatus:'claimed', source:'targeted_invite_prebuilt_team', applicantUserId:identity.user._id, applicantMiniOpenId:identity.openId || '', inviteId:preview.invite.id, createTime:now, updateTime:now } })
    relationId = String(created._id)
  }
  await createRegistrationReviewArtifacts(invite, relationId, preview.prebuiltTeam.id, identity)
  const workspaceId = await workspaceIdForManagedTeam(preview.prebuiltTeam.id, identity)
  return { success: true, teamId: preview.prebuiltTeam.id, workspaceId, registrationId:relationId, pendingPlayerDraftCount, destination: pendingPlayerDraftCount ? 'imported-player-review' : 'team-center' }
}

async function acceptTeamOwnerTransferForWorkspace(event, identity) {
  const transferId = String(event.transferId || event.inviteId || '')
  if (!transferId) throw workspaceError('OWNER_TRANSFER_REQUIRED', '缺少主账号转移邀请')
  const transfer = (await safeGet('team_invitations', { _id:transferId }, 1))[0]
  if (!transfer || String(transfer.type || '') !== 'team_owner_transfer') throw workspaceError('OWNER_TRANSFER_INVALID', '主账号转移邀请不存在')
  const teamId = String(transfer.teamId || '')
  if (String(transfer.status || '') === 'accepted' && String(transfer.acceptedUserId || '') === String(identity.user._id || '')) {
    return { success:true, teamId, workspaceId:await workspaceIdForManagedTeam(teamId, identity), idempotent:true }
  }
  if (String(transfer.status || '') !== 'active') throw workspaceError('OWNER_TRANSFER_INACTIVE', '主账号转移邀请已失效')
  assertPrebuiltInviteActive(transfer)
  const phone = verifiedUserPhone(identity.user)
  if (!phone || !claimPhoneAllowed(transfer, phone)) throw workspaceError('OWNER_TRANSFER_PHONE_MISMATCH', '请使用被邀请的新负责人手机号登录')
  if (transfer.inviteeUserId && String(transfer.inviteeUserId) !== String(identity.user._id)) throw workspaceError('OWNER_TRANSFER_ACCOUNT_MISMATCH', '该主账号转移邀请不属于当前账号')
  const team = (await safeGet('teams', { _id:teamId }, 1))[0]
  if (!team) throw workspaceError('OWNER_TRANSFER_TEAM_MISSING', '球队不存在或已被删除')
  const oldOwnerId = String(team.ownerId || team.ownerUserId || team.claimedByUserId || '')
  if (!oldOwnerId || oldOwnerId !== String(transfer.fromOwnerId || '')) throw workspaceError('OWNER_TRANSFER_STALE', '球队负责人已变化，请主办方重新发起转移')
  if (oldOwnerId === String(identity.user._id || '')) throw workspaceError('OWNER_TRANSFER_SAME_ACCOUNT', '当前账号已经是球队负责人')
  const memberships = await safeGet('team_memberships', { teamId }, 200)
  const now = db.serverDate()
  const oldMembership = memberships.find(item => String(item.userId || item.memberUserId || '') === oldOwnerId)
  const oldMemberData = { role:'member', roles:['member'], permissions:['team.view'], status:'accepted', retainedAfterOwnerTransfer:true, ownerTransferId:transferId, updateTime:now }
  if (oldMembership && oldMembership._id) await db.collection('team_memberships').doc(String(oldMembership._id)).update({ data:oldMemberData })
  else await db.collection('team_memberships').add({ data:{ ...oldMemberData, teamId, orgId:String(team.orgId || ''), userId:oldOwnerId, source:'owner_transfer_retained_member', createTime:now } })
  const newOwnerId = String(identity.user._id || '')
  const newMembership = memberships.find(item => String(item.userId || item.memberUserId || '') === newOwnerId)
  const newOwnerData = { teamId, orgId:String(team.orgId || ''), userId:newOwnerId, phone, role:'owner', roles:['owner'], permissions:['team.view','team.manage'], status:'accepted', source:'team_owner_transfer', ownerTransferId:transferId, updateTime:now }
  if (newMembership && newMembership._id) await db.collection('team_memberships').doc(String(newMembership._id)).update({ data:newOwnerData })
  else await db.collection('team_memberships').add({ data:{ ...newOwnerData, createTime:now } })
  await db.collection('teams').doc(teamId).update({ data:{ ownerId:newOwnerId, ownerUserId:newOwnerId, claimedByUserId:newOwnerId, ownerPhone:phone, ownerName:String(transfer.targetName || ''), claimStatus:'claimed', updateTime:now } })
  await db.collection('team_invitations').doc(transferId).update({ data:{ status:'accepted', acceptedUserId:newOwnerId, acceptedOpenId:String(identity.openId || ''), acceptedAt:now, keepPreviousOwnerAsMember:true, updateTime:now } })
  await db.collection('registration_audit_logs').add({ data:{ sport:'football', action:'team_owner_transfer_accepted', tournamentId:String(transfer.tournamentId || ''), teamId, actorUserId:newOwnerId, actorOrgId:String(transfer.organizerOrgId || ''), result:'success', detail:{ previousOwnerId:oldOwnerId, newOwnerId, previousOwnerRetainedAsMember:true }, createTime:now } })
  return { success:true, teamId, workspaceId:await workspaceIdForManagedTeam(teamId, identity), previousOwnerRetainedAsMember:true }
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

// 小程序编辑入口与 PC 共用同一套球队长期资料同步边界：更新当前球队后，
// 刷新参赛关系、球员库和未完赛赛程的展示字段；已完赛/已归档快照保持不变。
async function syncTeamProfileReferences(teamId, before, after) {
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

  const patch = {}
  if (nameChanged) patch.teamName = afterName
  if (logoChanged) {
    patch.teamLogo = afterLogo
    patch.logo = afterLogo
    patch.logoUrl = afterLogo
  }
  const counts = { changed: true, tournamentTeams: 0, players: 0, matches: 0, invitations: 0 }
  const updateRows = async (collection, rows, data) => {
    for (const row of rows || []) {
      if (row && row._id) await db.collection(collection).doc(row._id).update({ data: { ...data, updateTime: db.serverDate() } })
    }
    return (rows || []).filter(row => row && row._id).length
  }
  const relationRows = (await db.collection('tournament_teams').where({ teamId: id }).limit(1000).get()).data || []
  counts.tournamentTeams = await updateRows('tournament_teams', relationRows, patch)
  const invitationRows = (await db.collection('team_invitations').where({ teamId: id }).limit(1000).get()).data || []
  counts.invitations = await updateRows('team_invitations', invitationRows.filter(row => !['cancelled', 'canceled', 'expired', 'rejected'].includes(String(row.status || '').toLowerCase())), patch)
  if (nameChanged) {
    const playerRows = (await db.collection('players').where(_.or([{ teamId: id }, { teamCode: id }])).limit(1000).get()).data || []
    counts.players = await updateRows('players', playerRows, { teamName: afterName })
  }
  const matchRows = (await db.collection('matches').where(_.or([{ homeTeamId: id }, { awayTeamId: id }])).limit(1000).get()).data || []
  const historical = new Set(['completed', 'finished', 'archived', 'cancelled', 'canceled'])
  for (const match of matchRows) {
    if (!match || !match._id || historical.has(String(match.status || '').toLowerCase())) continue
    const matchPatch = {}
    if (String(match.homeTeamId || '') === id) {
      if (nameChanged) matchPatch.homeTeamName = afterName
      if (logoChanged) matchPatch.homeTeamLogo = afterLogo
    }
    if (String(match.awayTeamId || '') === id) {
      if (nameChanged) matchPatch.awayTeamName = afterName
      if (logoChanged) matchPatch.awayTeamLogo = afterLogo
    }
    if (Object.keys(matchPatch).length) {
      await db.collection('matches').doc(match._id).update({ data: { ...matchPatch, updateTime: db.serverDate() } })
      counts.matches += 1
    }
  }
  return counts
}

async function saveTeamProfileForWorkspace(event, identity) {
  const loaded = await teamProfileForWorkspace(event, identity)
  if (!loaded.canManage) throw new Error('当前身份没有编辑球队资料的权限')
  const name = String(event.name || '').trim().slice(0, 30), shortName = String(event.shortName || '').trim().slice(0, 16)
  if (name.length < 2) throw new Error('球队名称需为 2—30 个字')
  const patch = { name, teamName: name, shortName, ageGroup: String(event.ageGroup || '').trim().slice(0, 20), foundedYear: String(event.foundedYear || '').trim().slice(0, 8), city: String(event.city || '').trim().slice(0, 40), managerName: String(event.managerName || '').trim().slice(0, 30), updateTime: db.serverDate() }
  await db.collection('teams').doc(loaded.profile.id).update({ data: patch })
  const teamSync = await syncTeamProfileReferences(loaded.profile.id, loaded.profile, { ...loaded.profile, ...patch })
  return { success: true, teamSync }
}

async function teamMembersForWorkspace(event, identity) {
  const result = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  if ((result.workspace.permissions || []).indexOf('team.view') < 0 && (result.workspace.permissions || []).indexOf('team.manage') < 0) throw new Error('当前身份没有查看球队成员的权限')
  const teamId = String(event.teamId || ''), teams = await loadTeams(result.workspace, identity.user, identity.openId)
  const team = teams.filter(item => String(item._id) === teamId)[0]
  if (!team) throw new Error('球队不属于当前工作空间')
  const [memberships, staffRows] = await Promise.all([
    safeGet('team_memberships', { teamId }, 200),
    safeGet('coaches', _.or([{ teamId }, { teamCode: teamId }]), 500)
  ])
  const ownerIds = unique([team.ownerId, team.ownerUserId, team.claimedByUserId].filter(Boolean))
  const userIds = unique(memberships.map(item => item.userId || item.memberUserId || item.ownerId).concat(ownerIds).filter(Boolean))
  const users = userIds.length ? await safeGet('users', { _id: _.in(userIds) }, 200) : []
  const userMap = {}; users.forEach(item => { userMap[String(item._id)] = item })
  const permissionLabels = {
    'team.view': '查看球队',
    'team.manage': '管理球队',
    'team.invite': '邀请成员',
    'team.player.view': '查看球员',
    'team.player.manage': '管理球员',
    'event.view': '查看赛事',
    'event.manage': '赛事协作'
  }
  const members = memberships.map(item => {
    const userId = String(item.userId || item.memberUserId || item.ownerId || '')
    const user = userMap[userId] || {}
    const rawRoles = normalizePositions(item, false).concat([item.memberRole, item.roleText, item.positionName].filter(Boolean))
    const roles = unique(rawRoles.filter(Boolean).map(value => String(value).trim()).filter(Boolean))
    const roleTokens = roles.map(value => value.toLowerCase())
    const isManager = roleTokens.some(value => ['owner', 'team_manager', 'manager', 'team_leader', 'leader', '管理员', '领队', '负责人'].indexOf(value) >= 0)
    const isCoach = roleTokens.some(value => value.indexOf('coach') >= 0 || value.indexOf('教练') >= 0)
    const kind = isCoach ? 'coach' : (isManager ? 'manager' : 'other')
    const roleText = roles.length ? roles.map(value => ({ owner: '负责人', team_manager: '管理员', manager: '管理员', team_leader: '领队', leader: '领队', head_coach: '主教练', assistant_coach: '助理教练', coach: '教练', doctor: '队医' }[value.toLowerCase()] || value)).join(' / ') : '成员'
    const permissions = unique(normalizePermissions(item, false).map(String).filter(Boolean))
    const permissionText = permissions.length ? permissions.map(value => permissionLabels[value] || value).join('、') : '未配置专项权限'
    const active = ['accepted', 'active', 'claimed'].indexOf(String(item.status || 'active').toLowerCase()) >= 0
    const phone = String(firstValue(user.phone, user.phoneNumber, item.phone, item.phoneNumber, '') || '')
    return {
      id: String(item._id),
      userId,
      name: String(firstValue(user.realName, user.name, user.nickname, user.nickName, user.userName, item.name, item.memberName, item.nickname, '未命名成员')),
      avatar: String(firstValue(user.avatarUrl, user.avatar, user.headimgurl, item.avatarUrl, item.avatar, '') || ''),
      phoneMasked: maskPhone(phone),
      _phoneKey: phone,
      roleText,
      roles,
      kind,
      permissionText,
      permissions,
      statusText: active ? '已加入' : '待确认',
      pending: !active
    }
  })
  const memberUserIds = new Set(members.map(item => item.userId).filter(Boolean))
  ownerIds.forEach(ownerId => {
    const id = String(ownerId || '')
    if (!id || memberUserIds.has(id)) return
    const user = userMap[id] || {}
    const phone = String(firstValue(user.phone, user.phoneNumber, '') || '')
    members.push({ id: 'owner:' + id, userId: id, name: String(firstValue(user.realName, user.name, user.nickname, user.nickName, user.userName, team.managerName, '球队负责人')), avatar: String(firstValue(user.avatarUrl, user.avatar, user.headimgurl, '') || ''), phoneMasked: maskPhone(phone), _phoneKey: phone, roleText: '负责人', roles: ['owner'], kind: 'manager', permissionText: '查看球队、管理球队、邀请成员、管理球员', permissions: ['team.view', 'team.manage', 'team.invite', 'team.player.manage'], statusText: '已加入', pending: false })
  })
  const memberByPhone = {}
  const memberByName = {}
  members.forEach(member => {
    if (member._phoneKey) memberByPhone[member._phoneKey] = member
    if (member.name && member.name !== '未命名成员' && !memberByName[member.name]) memberByName[member.name] = member
  })
  const staffMap = {}
  staffRows.forEach(item => { staffMap[String(item._id || '')] = item })
  const staffRoleLabels = { head_coach: '主教练', coach: '教练', assistant_coach: '助理教练', assistant: '助理教练', team_leader: '领队', leader: '领队', doctor: '队医', medic: '队医', manager: '管理员' }
  Object.keys(staffMap).forEach(id => {
    const staff = staffMap[id]
    const name = String(firstValue(staff.name, staff.coachName, staff.memberName, '未命名工作人员'))
    const phone = String(firstValue(staff.phone, staff.phoneNumber, '') || '')
    const roleToken = String(firstValue(staff.type, staff.roleType, staff.position, staff.role, 'coach'))
    const roleText = String(firstValue(staff.roleLabel, staffRoleLabels[roleToken.toLowerCase()], staff.role, '教练'))
    const kind = roleToken.toLowerCase().indexOf('coach') >= 0 || roleText.indexOf('教练') >= 0 ? 'coach' : (['team_leader', 'leader', 'manager'].indexOf(roleToken.toLowerCase()) >= 0 || /领队|管理/.test(roleText) ? 'manager' : 'other')
    const existing = (phone && memberByPhone[phone]) || memberByName[name]
    const avatar = String(firstValue(staff.photoUrl, staff.photoFileID, staff.avatarUrl, staff.photo, '') || '')
    if (existing) {
      if (!existing.avatar && avatar) existing.avatar = avatar
      if (existing.roleText === '成员') existing.roleText = roleText
      else if (existing.roleText.indexOf(roleText) < 0) existing.roleText += ' / ' + roleText
      if (existing.kind === 'other') existing.kind = kind
      return
    }
    const row = { id: 'staff:' + id, staffId: id, name, avatar, phoneMasked: maskPhone(phone), _phoneKey: phone, roleText, roles: [roleToken], kind, permissionText: '工作人员资料，未绑定管理账号', permissions: [], statusText: '资料档案', pending: false }
    members.push(row)
    if (phone) memberByPhone[phone] = row
    if (name !== '未命名工作人员') memberByName[name] = row
  })
  const invitations = await safeGet('team_invitations', { teamId }, 100)
  invitations.filter(item => String(item.type || '') === 'team_member' && String(item.status || '') === 'pending' &&
    Boolean(item.inviteeName || item.inviteePhone) && (!item.expiresAt || toTime(item.expiresAt) > Date.now())
  ).forEach(item => members.push({ id: 'invite:' + item._id, inviteId: String(item._id), name: String(item.inviteeName || '待确认成员'), avatar: '', phoneMasked: maskPhone(String(item.inviteePhone || '')), roleText: String(item.roleText || '成员'), kind: 'other', permissionText: '加入后按邀请岗位授权', statusText: '待确认', pending: true }))
  members.forEach(item => { delete item._phoneKey })
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

async function teamPlayerInviteCompetition(teamId, tournamentId) {
  if (!tournamentId) return { tournamentId: '', participantMode: '' }
  const tournament = (await safeGet('tournaments', { _id: tournamentId }, 1))[0]
  if (!tournament) throw new Error('赛事不存在，不能按赛事模式发出邀请')
  const registrations = (await safeGet('tournament_teams', { tournamentId, teamId }, 50))
    .filter(item => !['cancelled', 'withdrawn', 'replaced'].includes(String(item.status || '').toLowerCase()))
  if (!registrations.length) throw new Error('当前球队不属于该赛事，不能按赛事模式发出邀请')
  let mode = String(tournament.participantMode || '')
  if (!['adult', 'youth'].includes(mode)) {
    const divisionIds = new Set(registrations.map(registrationDivisionId))
    const divisions = (await safeGet('divisions', { tournamentId }, 100)).concat(Array.isArray(tournament.divisions) ? tournament.divisions : []).filter(item => divisionIds.has(String(item._id || item.id)))
    const modes = [...new Set(divisions.map(item => String(item.participantMode || '')).filter(value => ['adult', 'youth'].includes(value)))]
    mode = modes.length === 1 ? modes[0] : ''
  }
  // 旧赛事尚无 participantMode：这两个稳定赛事 ID 的展示模式由产品负责人确认，仅用于邀请文案。
  if (!mode) mode = ({ '22dda3756aa93fd70002a29257a61fe6': 'adult', 'c1dc89f26a884b2a002042f7385deabe': 'youth' })[tournamentId] || ''
  return { tournamentId, participantMode: mode }
}

async function createTeamPlayerInviteForWorkspace(event, identity) {
  const scope = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  if ((scope.workspace.permissions || []).indexOf('team.manage') < 0) throw new Error('当前身份没有邀请球员的权限')
  const teamId = String(event.teamId || '')
  const teams = await loadTeams(scope.workspace, identity.user, identity.openId)
  const team = teams.find(item => String(item._id) === teamId)
  if (!team) throw new Error('球队不存在或不属于当前工作空间')
  const competition = await teamPlayerInviteCompetition(teamId, String(event.tournamentId || ''))
  const rows = await safeGet('team_invitations', { teamId, type: 'team_player', inviterUserId: identity.user._id }, 50)
  const reusable = rows.find(item => ['active', 'pending'].indexOf(String(item.status || '')) >= 0 && String(item.tournamentId || '') === competition.tournamentId && String(item.token || '').indexOf('tp_') === 0 && toTime(item.expiresAt) > Date.now())
  if (reusable) {
    if (String(reusable.registrantMode || '') !== 'age_based' || String(reusable.participantMode || '') !== competition.participantMode) await db.collection('team_invitations').doc(String(reusable._id)).update({ data: { registrantMode: 'age_based', participantMode: competition.participantMode, updateTime: db.serverDate() } })
    return {
      success: true,
      reused: true,
      inviteId: String(reusable._id),
      token: String(reusable.token),
      expiresAtText: dateText(reusable.expiresAt),
      registrantMode: 'age_based',
      participantMode: competition.participantMode,
      tournamentId: competition.tournamentId,
      path: '/pages/team/player-invite/player-invite?teamId=' + encodeURIComponent(teamId) + '&playerInviteId=' + encodeURIComponent(String(reusable.token))
    }
  }
  const token = 'tp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  const now = db.serverDate()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const created = await db.collection('team_invitations').add({ data: {
    token,
    teamId,
    tournamentId: competition.tournamentId,
    participantMode: competition.participantMode,
    orgId: String(scope.workspace.orgId || ''),
    type: 'team_player',
    purpose: 'player_profile_onboarding',
    registrantMode: 'age_based',
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
    registrantMode: 'age_based',
    participantMode: competition.participantMode,
    tournamentId: competition.tournamentId,
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
  const players = await safeGetTeamPlayers(teamId, 500)
  const userId = String(identity.user._id || '')
  const openId = String(identity.openId || '')
  const existing = players.find(item => {
    const linkedIds = [item.linkedUserId, item.playerUserId].filter(Boolean).map(String)
    const linkedOpenIds = [item.linkedOpenId, item.playerOpenId].filter(Boolean).map(String)
    const guardianIds = [item.guardianUserId].filter(Boolean).map(String)
    const guardianOpenIds = [item.guardianOpenId].filter(Boolean).map(String)
    return (userId && linkedIds.indexOf(userId) >= 0) || (openId && linkedOpenIds.indexOf(openId) >= 0) || (userId && guardianIds.indexOf(userId) >= 0) || (openId && guardianOpenIds.indexOf(openId) >= 0)
  })
  const existingRegistrantType = existing && ((userId && [existing.linkedUserId, existing.playerUserId].filter(Boolean).map(String).indexOf(userId) >= 0) || (openId && [existing.linkedOpenId, existing.playerOpenId].filter(Boolean).map(String).indexOf(openId) >= 0)) ? 'self' : 'guardian'
  return {
    success: true,
    invitation: { id: String(invite._id), token: String(invite.token || ''), expiresAtText: dateText(invite.expiresAt), registrantMode: 'age_based', tournamentId: String(invite.tournamentId || ''), participantMode: String(invite.participantMode || '') },
    team: { id: teamId, name: String(team.name || team.teamName || ''), logo: String(team.logoTransparent || team.logo || team.logoUrl || '') },
    accountPhoneMasked: maskPhone(verifiedUserPhone(identity.user)),
    existingPlayer: existing ? { id: String(existing._id), name: String(existing.name || '球员'), birthDate: String(firstValue(existing.birthDate, existing.birthday) || ''), profileStatus: String(existing.profileStatus || 'pending'), registrationComplete: String(existing.profileStatus || '') === 'complete' || String(existing.parentProfileSubmissionStatus || '') === 'submitted' || Boolean(existing.parentProfileCompletedAt), registrantType: existingRegistrantType, registrantLabel: existingRegistrantType === 'self' ? '球员本人' : '家长或监护人' } : null
  }
}

async function acceptTeamPlayerInviteForWorkspace(event, identity) {
  const preview = await teamPlayerInviteForWorkspace(event, identity)
  const invite = (await safeGet('team_invitations', { _id: preview.invitation.id }, 1))[0]
  if (!invite || ['active', 'pending'].indexOf(String(invite.status || 'active')) < 0) throw new Error('球员邀请不存在或已停用')
  const teamRecord = (await safeGet('teams', { _id: preview.team.id }, 1))[0] || { _id: preview.team.id, name: preview.team.name }
  const submittedProfile = Object.prototype.hasOwnProperty.call(event, 'name') || Object.prototype.hasOwnProperty.call(event, 'birthDate')
  if (preview.existingPlayer) {
    const existingRows = await safeGetTeamPlayers(preview.team.id, 1, { _id: preview.existingPlayer.id })
    const existingPlayer = existingRows[0]
    if (!existingPlayer) throw new Error('已关联的球员档案不存在，请联系球队管理员')
    if (submittedProfile) {
      const submittedName = String(event.name || '').trim()
      const submittedBirthDate = String(event.birthDate || '').trim()
      const existingBirthDate = String(firstValue(existingPlayer.birthDate, existingPlayer.birthday) || '')
      if (submittedName !== String(existingPlayer.name || '').trim() || submittedBirthDate !== existingBirthDate) {
        return await playerAccountTransfer.overwriteIncomplete(event, identity, preview, invite, teamRecord, existingPlayer)
      }
      if (event.authorizationAgreed !== true) throw new Error('请确认登记身份并授权资料使用')
    }
    const parentInvite = await ensureParentProfileInviteForPlayer(teamRecord, existingPlayer, String(invite.orgId || ''), identity.user._id)
    return { success: true, idempotent: true, player: preview.existingPlayer, team: preview.team, parentProfileUrl: parentProfileInviteUrl(parentInvite.token, preview.invitation.participantMode) }
  }
  const name = String(event.name || '').trim().slice(0, 30)
  const birthDate = String(event.birthDate || '').trim()
  const accountPhone = verifiedUserPhone(identity.user)
  const allowedRelations = ['father', 'mother', 'other']
  const guardianRelation = allowedRelations.indexOf(String(event.guardianRelation || '')) >= 0 ? String(event.guardianRelation) : 'other'
  const jerseyNumber = String(event.jerseyNumber || '').trim().slice(0, 3)
  const allowedPositions = ['GK', 'DF', 'MF', 'FW']
  const position = allowedPositions.indexOf(String(event.position || '')) >= 0 ? String(event.position) : ''
  const birthTime = new Date(birthDate + 'T00:00:00').getTime()
  if (name.length < 2) throw new Error('请填写真实球员姓名')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !Number.isFinite(birthTime) || birthTime > Date.now()) throw new Error('请选择正确的出生日期')
  const registrantType = registrantTypeForBirthDate(birthDate, invite.referenceDate)
  if (event.authorizationAgreed !== true) throw new Error(registrantType === 'self' ? '请确认由球员本人登记并授权资料使用' : '请确认监护关系和资料使用授权')
  if (!accountPhone) throw workspaceError('VERIFIED_PHONE_REQUIRED', '当前账号缺少已验证手机号，请重新登录后再登记')
  if (jerseyNumber && !/^\d{1,3}$/.test(jerseyNumber)) throw new Error('球衣号码只可填写数字')
  const teamPlayers = await safeGetTeamPlayers(preview.team.id, 500)
  const duplicates = teamPlayers.filter(item => String(item.name || '') === name && String(firstValue(item.birthDate, item.birthday) || '') === birthDate)
  if (duplicates.length) {
    const prior = await playerAccountTransfer.priorChoice(event, identity, preview, '')
    if (prior) return prior
    const currentUserId = String(identity.user._id || '')
    const currentOpenId = String(identity.openId || '')
    const owned = duplicates.find(item => {
      const userIds = registrantType === 'self' ? [item.linkedUserId, item.playerUserId] : [item.guardianUserId]
      const openIds = registrantType === 'self' ? [item.linkedOpenId, item.playerOpenId] : [item.guardianOpenId]
      return (currentUserId && userIds.filter(Boolean).map(String).indexOf(currentUserId) >= 0) || (currentOpenId && openIds.filter(Boolean).map(String).indexOf(currentOpenId) >= 0)
    })
    if (owned) {
      const parentInvite = await ensureParentProfileInviteForPlayer(teamRecord, owned, String(invite.orgId || ''), identity.user._id)
      return { success: true, idempotent: true, player: { id: String(owned._id), name: String(owned.name || name), profileStatus: String(owned.profileStatus || 'pending') }, team: preview.team, parentProfileUrl: parentProfileInviteUrl(parentInvite.token, preview.invitation.participantMode) }
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
    registrantMode: 'age_based',
    registrantType,
    contactPhone: accountPhone,
    jerseyNumber,
    position,
    profileStatus: 'pending',
    needsParentCompletion: true,
    standardProfileFlow: true,
    identityVerificationRequired: true,
    portraitRequired: true,
    source: 'team_player_invite',
    playerInviteId: preview.invitation.id,
    applicantRole: registrantType,
    authorizationAgreed: true,
    authorizationConfirmedAt: now,
    createTime: now,
    updateTime: now
  }
  if (registrantType === 'self') {
    playerData.playerPhone = accountPhone
    playerData.linkedUserId = identity.user._id
    playerData.linkedOpenId = identity.openId || ''
  } else {
    playerData.guardianPhone = accountPhone
    playerData.guardianRelation = guardianRelation
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
  return { success: true, player: { id: String(created._id), name, profileStatus: 'pending' }, team: preview.team, parentProfileUrl: parentProfileInviteUrl(parentInvite.token, preview.invitation.participantMode) }
}

async function tournamentOperationsForWorkspace(event, identity) {
  const scoped = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  const workspace = scoped.workspace
  const tournamentId = String(event.tournamentId || '')
  if (!tournamentId) throw new Error('缺少赛事信息')
  const tournament = (await safeGet('tournaments', { _id: tournamentId }, 1))[0]
  if (!tournament) throw new Error('赛事不存在')
  const teams = await loadTeams(workspace, identity.user, identity.openId)
  const accessibleTeamIds = unique(teams.map(item => item._id))
  const allRegistrations = await safeGet('tournament_teams', { tournamentId }, 500)
  const canManage = (workspace.permissions || []).indexOf('event.manage') >= 0 && String(workspace.orgId || '') === String(tournament.orgId || tournament.organizationId || '')
  const ownRegistration = allRegistrations.some(item => accessibleTeamIds.indexOf(String(item.teamId || '')) >= 0)
  if (!canManage && !ownRegistration) throw new Error('当前账号无权查看该赛事运营数据')

  const divisionRows = await safeGet('divisions', { tournamentId }, 100)
  const divisionMap = {}
  divisionRows.forEach(item => { divisionMap[String(item._id || item.id)] = String(item.name || item.divisionName || '竞赛组别') })
  ;(Array.isArray(tournament.divisions) ? tournament.divisions : []).forEach(item => {
    divisionMap[String(item._id || item.id)] = String(item.name || item.divisionName || '竞赛组别')
  })
  const officialStatuses = new Set(['approved', 'confirmed', 'active', 'locked', 'accepted', 'claimed'])
  const officialRegistrations = taskRelevantRegistrations(allRegistrations).filter(item => officialStatuses.has(String(item.status || '').toLowerCase()))
  const registeredTeamIds = unique(officialRegistrations.map(item => item.teamId))
  const teamRows = registeredTeamIds.length ? await safeGet('teams', { _id: _.in(registeredTeamIds) }, 500) : []
  const teamMap = {}
  teamRows.concat(teams).forEach(item => { teamMap[String(item._id || item.id)] = item })
  const operationTeams = officialRegistrations.map(item => {
    const team = teamMap[String(item.teamId || '')] || {}
    const divisionId = registrationDivisionId(item)
    return {
      id: String(item._id || ''),
      teamId: String(item.teamId || ''),
      teamName: String(firstValue(team.name, team.teamName, item.teamName, '未命名球队')),
      teamLogo: String(firstValue(team.logo, team.logoUrl, team.teamLogo, item.teamLogo, '')),
      divisionId,
      divisionName: String(firstValue(item.divisionName, divisionMap[divisionId], '默认组别')),
      playerCount: Number(firstValue(team.playerCount, item.playerCount, 0))
    }
  })
  const divisionOptions = Object.keys(divisionMap).map(id => ({ id, name: divisionMap[id] }))
  operationTeams.forEach(item => {
    if (!divisionMap[item.divisionId]) {
      divisionMap[item.divisionId] = item.divisionName
      divisionOptions.push({ id: item.divisionId, name: item.divisionName })
    }
  })

  const groupRows = await safeGet('tournament_groups', { tournamentId }, 500)
  const formalGroupMap = {}
  groupRows.forEach(item => {
    const status = String(item.status || '').toLowerCase()
    const groupName = String(firstValue(item.groupName, item.groupCode, ''))
    const members = Array.isArray(item.teams) ? item.teams : []
    if (!groupName || !members.length || ['draft', 'archived'].indexOf(status) >= 0) return
    const divisionId = String(item.divisionId || 'default')
    const key = divisionId + ':' + groupName
    const current = formalGroupMap[key]
    if (!current || toTime(item.updateTime || item.confirmedAt || item.createTime) > toTime(current.updateTime || current.confirmedAt || current.createTime)) formalGroupMap[key] = item
  })
  const divisionGroupsMap = {}
  Object.keys(formalGroupMap).map(key => formalGroupMap[key]).forEach(item => {
    const divisionId = String(item.divisionId || 'default')
    const groupName = String(firstValue(item.groupName, item.groupCode, '分组'))
    if (!divisionGroupsMap[divisionId]) divisionGroupsMap[divisionId] = { divisionId, divisionName: String(firstValue(item.divisionName, divisionMap[divisionId], '默认组别')), groups: [] }
    const groupTeams = (item.teams || []).map((member, index) => {
      const team = teamMap[String(member.teamId || '')] || {}
      return {
        order: Number(member.order || member.sort || member.sequence || index + 1),
        teamId: String(member.teamId || ''),
        teamName: String(firstValue(team.name, team.teamName, member.teamName, member.name, '轮空')),
        teamLogo: String(firstValue(team.logo, team.logoUrl, team.teamLogo, member.teamLogo, '') || '')
      }
    })
    divisionGroupsMap[divisionId].groups.push({
      order: Number(item.order || item.sort || item.sequence || divisionGroupsMap[divisionId].groups.length + 1),
      groupName,
      teams: groupTeams,
      teamsLen: groupTeams.length
    })
  })
  const divisionGroups = Object.keys(divisionGroupsMap).map(key => divisionGroupsMap[key]).sort((left, right) => left.divisionName.localeCompare(right.divisionName, 'zh-CN')).map(item => {
    item.groups.sort((left, right) => Number(left.order || 0) - Number(right.order || 0) || left.groupName.localeCompare(right.groupName, 'zh-CN'))
    return item
  })

  const allMatches = await safeGet('matches', { tournamentId }, 500)
  const schedule = allMatches.filter(item => {
    const homeName = matchTeamName(item, 'home', teamMap)
    const awayName = matchTeamName(item, 'away', teamMap)
    const placeholder = item.isBye === true || item.isPlaceholder === true || item.placeholder === true || /胜者|负者|待定/.test(homeName + awayName)
    return !placeholder && String(item.status || '').toLowerCase() !== 'cancelled' && Boolean(matchDateValue(item) && isClockTime(matchTimeValue(item)))
  }).sort((left, right) => matchDateTimeMs(left) - matchDateTimeMs(right)).map(item => {
    const status = String(item.status || 'scheduled').toLowerCase()
    const live = ['ongoing', 'live', 'in_progress', 'inprogress'].indexOf(status) >= 0
    const finished = ['finished', 'completed', 'archived'].indexOf(status) >= 0
    const hasScore = item.homeScore !== undefined && item.homeScore !== null && item.awayScore !== undefined && item.awayScore !== null
    const notStarted = ['scheduled', 'pending', 'upcoming'].indexOf(status) >= 0
    const divisionId = String(item.divisionId || item.division || 'default')
    return {
      id: String(item._id || ''),
      divisionId,
      divisionName: String(firstValue(item.divisionName, divisionMap[divisionId], '默认组别')),
      groupName: String(firstValue(item.groupName, item.group, item.drawGroup, '联赛')),
      dateText: matchDateText(item),
      timeText: matchTimeValue(item),
      venueText: String(firstValue(item.venue, item.location, item.fieldName, item.field, '场地待定')),
      homeName: matchTeamName(item, 'home', teamMap),
      awayName: matchTeamName(item, 'away', teamMap),
      homeLogo: matchTeamLogo(item, 'home', teamMap),
      awayLogo: matchTeamLogo(item, 'away', teamMap),
      scoreText: !notStarted && hasScore ? String(item.homeScore) + ' : ' + String(item.awayScore) : '- : -',
      statusText: finished ? '已结束' : (live ? '进行中' : '待开始'),
      statusClass: live ? 'match-live' : (finished ? 'match-finished' : 'match-upcoming'),
      hasScore: hasScore
    }
  })
  return {
    success: true,
    tournament: { id: tournamentId, name: String(tournament.name || '赛事'), type: String(firstValue(tournament.formatType, tournament.type, tournament.format, '')) },
    divisions: divisionOptions.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')),
    teams: operationTeams,
    divisionGroups,
    schedule
  }
}

async function tournamentDataForWorkspace(event, identity) {
  const tournamentId = String(event.tournamentId || '')
  if (!tournamentId) throw new Error('缺少赛事信息')
  const operations = await tournamentOperationsForWorkspace(Object.assign({}, event, { divisionId: '' }), identity)
  const requestedDivisionId = ''
  const teamMap = {}
  ;(operations.teams || []).forEach(item => { teamMap[String(item.teamId || '')] = item })
  const divisionNameMap = {}
  ;(operations.divisions || []).forEach(item => { divisionNameMap[String(item.id || 'default')] = String(item.name || '默认组别') })
  const teamGroupMap = {}
  ;(operations.divisionGroups || []).forEach(division => {
    const divisionId = String(division.divisionId || 'default')
    ;(division.groups || []).forEach(group => {
      const groupName = String(group.groupName || '联赛')
      ;(group.teams || []).forEach(team => { teamGroupMap[divisionId + ':' + String(team.teamId || '')] = groupName })
    })
  })
  const standingsDocs = await safeGet('standings', { tournamentId }, 50)
  const standingsRows = []
  standingsDocs.forEach(doc => {
    if (Array.isArray(doc.teams)) standingsRows.push(...doc.teams.map(item => Object.assign({}, item, { divisionId: item.divisionId || doc.divisionId || '', groupName: item.groupName || doc.groupName || doc.drawGroup || '' })))
    ;(Array.isArray(doc.groups) ? doc.groups : []).forEach(group => {
      ;(Array.isArray(group.teams) ? group.teams : []).forEach(item => standingsRows.push(Object.assign({}, item, { groupName: item.groupName || group.groupName || '', divisionId: item.divisionId || group.divisionId || doc.divisionId || '' })))
    })
    if (doc.teamId) standingsRows.push(doc)
  })
  const filteredStandingsRows = requestedDivisionId ? standingsRows.filter(item => !item.divisionId || String(item.divisionId) === requestedDivisionId) : standingsRows
  function rankStandingsByDivision(rows) {
    const grouped = {}
    rows.forEach(item => {
      const divisionId = String(item.divisionId || 'default')
      const groupName = String(item.groupName || '联赛')
      const key = divisionId + ':' + groupName
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(item)
    })
    return Object.keys(grouped).sort((left, right) => left.localeCompare(right, 'zh-CN')).reduce((all, key) => {
      const ranked = grouped[key].sort((a, b) => b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor || a.teamName.localeCompare(b.teamName, 'zh-CN')).map((item, index) => Object.assign({}, item, { rank: index + 1 }))
      return all.concat(ranked)
    }, [])
  }
  let standings = filteredStandingsRows.map((item, index) => {
    const teamId = String(item.teamId || '')
    const team = teamMap[teamId] || {}
    const divisionId = String(firstValue(item.divisionId, team.divisionId, 'default'))
    const groupName = String(firstValue(item.groupName, item.drawGroup, teamGroupMap[divisionId + ':' + teamId], '联赛'))
    return {
      rank: Number(item.rank || item.position || index + 1),
      teamId,
      // standings 中的 teamName/teamLogo 是积分快照；当前赛事展示优先使用
      // operations 已从 teams 读取的长期资料。
      teamName: String(firstValue(team.teamName, team.name, item.teamName, '球队待定')),
      teamLogo: String(firstValue(team.teamLogo, team.logo, item.teamLogo, '') || ''),
      divisionId,
      divisionName: String(firstValue(item.divisionName, team.divisionName, divisionNameMap[divisionId], '默认组别')),
      groupName,
      played: Number(firstValue(item.played, item.matches, 0)),
      wins: Number(item.wins || item.win || 0),
      draws: Number(item.draws || item.draw || item.ties || 0),
      losses: Number(item.losses || item.loss || 0),
      goalsFor: Number(firstValue(item.goalsFor, item.gf, item.goals, 0)),
      goalsAgainst: Number(firstValue(item.goalsAgainst, item.ga, 0)),
      goalDiff: Number(firstValue(item.goalDiff, item.gd, Number(item.goalsFor || item.gf || 0) - Number(item.goalsAgainst || item.ga || 0))),
      points: Number(item.points || 0)
    }
  })
  standings = rankStandingsByDivision(standings)

  const matches = await safeGet('matches', { tournamentId }, 500)
  if (!standings.length) {
    const tables = {}
    function ensureDivisionTable(divisionId, groupName) {
      const id = String(divisionId || 'default')
      const group = String(groupName || '联赛')
      if (!tables[id]) tables[id] = {}
      if (!tables[id][group]) tables[id][group] = {}
      return tables[id][group]
    }
    ;(operations.teams || []).forEach(item => {
      const divisionId = String(item.divisionId || 'default')
      const teamId = String(item.teamId || '')
      const groupName = String(firstValue(teamGroupMap[divisionId + ':' + teamId], '联赛'))
      const table = ensureDivisionTable(divisionId, groupName)
      table[teamId] = { rank: 0, divisionId, divisionName: String(firstValue(item.divisionName, divisionNameMap[divisionId], '默认组别')), groupName, teamId, teamName: String(item.teamName || '球队待定'), teamLogo: String(item.teamLogo || ''), played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 }
    })
    matches.forEach(match => {
      const status = String(match.status || '').toLowerCase()
      const homeScore = Number(firstValue(match.homeScore, match.scoreHome, NaN))
      const awayScore = Number(firstValue(match.awayScore, match.scoreAway, NaN))
      const divisionId = String(match.divisionId || match.division || 'default')
      if (!['completed', 'finished', 'archived'].includes(status) || !Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return
      const homeId = String(match.homeTeamId || ''), awayId = String(match.awayTeamId || '')
      const groupName = String(firstValue(match.groupName, match.drawGroup, teamGroupMap[divisionId + ':' + homeId], teamGroupMap[divisionId + ':' + awayId], '联赛'))
      const table = ensureDivisionTable(divisionId, groupName)
      if (!table[homeId]) table[homeId] = { rank: 0, divisionId, divisionName: String(firstValue(match.divisionName, divisionNameMap[divisionId], '默认组别')), groupName, teamId: homeId, teamName: String(match.homeTeamName || '主队'), teamLogo: String(match.homeTeamLogo || ''), played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 }
      if (!table[awayId]) table[awayId] = { rank: 0, divisionId, divisionName: String(firstValue(match.divisionName, divisionNameMap[divisionId], '默认组别')), groupName, teamId: awayId, teamName: String(match.awayTeamName || '客队'), teamLogo: String(match.awayTeamLogo || ''), played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 }
      const home = table[homeId], away = table[awayId]
      home.played += 1; away.played += 1; home.goalsFor += homeScore; home.goalsAgainst += awayScore; away.goalsFor += awayScore; away.goalsAgainst += homeScore
      if (homeScore > awayScore) { home.wins += 1; away.losses += 1; home.points += 3 } else if (homeScore < awayScore) { away.wins += 1; home.losses += 1; away.points += 3 } else { home.draws += 1; away.draws += 1; home.points += 1; away.points += 1 }
      home.goalDiff = home.goalsFor - home.goalsAgainst; away.goalDiff = away.goalsFor - away.goalsAgainst
    })
    standings = rankStandingsByDivision(Object.keys(tables).reduce((all, divisionId) => {
      return all.concat(Object.keys(tables[divisionId]).reduce((groupRows, groupName) => groupRows.concat(Object.keys(tables[divisionId][groupName]).map(teamId => tables[divisionId][groupName][teamId])), []))
    }, []))
  }
  const matchMap = {}
  matches.forEach(match => { matchMap[String(match._id || match.id || '')] = match })
  const matchEvents = await safeGet('match_events', { tournamentId }, 500)
  const events = matchEvents.concat(matches.reduce((all, match) => {
    const divisionId = String(match.divisionId || match.division || 'default')
    return all.concat((Array.isArray(match.events) ? match.events : []).map(item => Object.assign({}, item, { matchId: match._id, tournamentId, divisionId, divisionName: String(firstValue(match.divisionName, divisionNameMap[divisionId], '默认组别')) })))
  }, []))
  const goals = {}
  const yellow = {}
  const red = {}
  function eventPlayerId(eventItem) {
    const embedded = eventItem.player && typeof eventItem.player === 'object' ? eventItem.player : {}
    return String(firstValue(eventItem.playerId, eventItem.playerID, eventItem.athleteId, embedded._id, embedded.id, '') || '')
  }
  function eventPlayerName(eventItem) {
    const embedded = eventItem.player && typeof eventItem.player === 'object' ? eventItem.player : {}
    return String(firstValue(eventItem.playerName, embedded.name, typeof eventItem.player === 'string' ? eventItem.player : '', eventItem.name, '')).trim()
  }
  function eventDivision(eventItem, teamId) {
    const matchId = String(firstValue(eventItem.matchId, eventItem.matchID, eventItem.gameId, '') || '')
    const match = matchMap[matchId] || {}
    const team = teamMap[teamId] || {}
    const divisionId = String(firstValue(eventItem.divisionId, eventItem.division, match.divisionId, match.division, team.divisionId, 'default'))
    return {
      id: divisionId,
      name: String(firstValue(eventItem.divisionName, match.divisionName, team.divisionName, divisionNameMap[divisionId], '默认组别')),
      groupName: String(firstValue(eventItem.groupName, eventItem.drawGroup, match.groupName, match.drawGroup, teamGroupMap[divisionId + ':' + teamId], '联赛'))
    }
  }
  function addCount(target, eventItem) {
    const name = eventPlayerName(eventItem)
    if (!name) return
    const embedded = eventItem.player && typeof eventItem.player === 'object' ? eventItem.player : {}
    const embeddedTeam = eventItem.team && typeof eventItem.team === 'object' ? eventItem.team : {}
    const teamId = String(firstValue(eventItem.teamId, embeddedTeam._id, embeddedTeam.id, typeof eventItem.team === 'string' ? eventItem.team : '', embedded.teamId, '') || '')
    const playerId = eventPlayerId(eventItem)
    const division = eventDivision(eventItem, teamId)
    const key = (playerId || name) + ':' + teamId + ':' + division.id + ':' + division.groupName
    if (!target[key]) target[key] = {
      playerId,
      playerName: name,
      playerAvatar: String(firstValue(eventItem.playerAvatar, eventItem.playerPhoto, eventItem.photoUrl, eventItem.avatarUrl, embedded.photoUrl, embedded.photo, embedded.avatarUrl, '') || ''),
      teamId,
      teamName: String(firstValue(eventItem.teamName, embeddedTeam.name, embedded.teamName, '') || ''),
      divisionId: division.id,
      divisionName: division.name,
      groupName: division.groupName,
      count: 0
    }
    target[key].count += 1
  }
  events.forEach(item => {
    const type = String(item.type || '').toLowerCase()
    if (type === 'goal' || type === 'own_goal') addCount(goals, item)
    if (['yellow_card', 'yellow', 'yellowcard'].indexOf(type) >= 0) addCount(yellow, item)
    if (['red_card', 'red', 'redcard', 'second_yellow'].indexOf(type) >= 0) addCount(red, item)
  })
  const eventPlayerIds = unique(events.map(eventPlayerId).filter(Boolean)).slice(0, 100)
  const eventPlayerNames = unique(events.map(eventPlayerName).filter(Boolean)).slice(0, 100)
  const playerQueries = []
  if (eventPlayerIds.length) playerQueries.push(safeGet('players', { _id: _.in(eventPlayerIds) }, 100))
  if (eventPlayerNames.length) playerQueries.push(safeGet('players', { name: _.in(eventPlayerNames) }, 100))
  const playerRows = (await Promise.all(playerQueries)).reduce((all, rows) => all.concat(rows || []), [])
  const playersById = {}
  const playersByTeamName = {}
  const playersByName = {}
  playerRows.forEach(player => {
    const playerId = String(player._id || '')
    const teamId = String(firstValue(player.teamId, player.sourceTeamId, '') || '')
    const name = String(player.name || '').trim()
    if (playerId) playersById[playerId] = player
    if (teamId && name) playersByTeamName[teamId + ':' + name] = player
    if (teamId && name && teamMap[teamId]) {
      if (playersByName[name] === undefined) playersByName[name] = player
      else if (playersByName[name] && String(playersByName[name]._id || '') !== playerId) playersByName[name] = null
    }
  })
  function ranking(source) {
    return Object.keys(source).map(key => {
      const item = source[key]
      const player = playersById[item.playerId] || playersByTeamName[item.teamId + ':' + item.playerName] || playersByName[item.playerName] || {}
      const resolvedTeamId = String(firstValue(item.teamId, player.teamId, player.sourceTeamId, '') || '')
      const team = teamMap[resolvedTeamId] || {}
      const itemDivisionId = String(item.divisionId || '')
      const divisionId = itemDivisionId && itemDivisionId !== 'default' ? itemDivisionId : String(firstValue(team.divisionId, 'default'))
      const itemGroupName = String(item.groupName || '')
      const groupName = itemGroupName && itemGroupName !== '联赛' ? itemGroupName : String(firstValue(teamGroupMap[divisionId + ':' + resolvedTeamId], itemGroupName, '联赛'))
      return Object.assign({}, item, {
        playerId: String(firstValue(item.playerId, player._id, '')),
        playerAvatar: String(firstValue(item.playerAvatar, player.photoUrl, player.photo, player.avatarUrl, '') || ''),
        teamName: String(firstValue(team.teamName, team.name, item.teamName, player.teamName, '') || ''),
        teamId: resolvedTeamId,
        teamLogo: String(firstValue(team.teamLogo, team.logo, item.teamLogo, player.teamLogo, '') || ''),
        divisionId,
        divisionName: String(firstValue(item.divisionName, team.divisionName, divisionNameMap[divisionId], '默认组别')),
        groupName
      })
    }).sort((a, b) => b.count - a.count || a.playerName.localeCompare(b.playerName, 'zh-CN')).slice(0, 200)
  }
  return {
    success: true,
    tournament: operations.tournament,
    divisions: operations.divisions || [],
    divisionGroups: operations.divisionGroups || [],
    standings,
    goalsRanking: ranking(goals),
    yellowCards: ranking(yellow),
    redCards: ranking(red),
    eventCount: events.length
  }
}

async function teamParticipationForWorkspace(event, identity) {
  const result = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  if ((result.workspace.permissions || []).indexOf('team.view') < 0 && (result.workspace.permissions || []).indexOf('team.manage') < 0) throw new Error('当前身份没有查看参赛管理的权限')
  const teamId = String(event.teamId || ''), teams = await loadTeams(result.workspace, identity.user, identity.openId)
  const team = teams.filter(item => String(item._id) === teamId)[0]
  if (!team) throw new Error('球队不属于当前工作空间')
  const registrations = await safeGet('tournament_teams', { teamId }, 200)
  const hiddenStatuses = ['cancelled', 'withdrawn', 'rejected', 'replaced', 'invite_cancelled']
  const statusPriority = { approved: 90, confirmed: 80, active: 80, accepted: 75, claimed: 70, pending: 60, reviewing: 55, invited: 40, draft: 20 }
  const groupedRegistrations = {}
  registrations.forEach(item => {
    const tournamentId = String(item.tournamentId || '')
    const status = String(item.status || 'pending').toLowerCase()
    if (!tournamentId || hiddenStatuses.indexOf(status) >= 0) return
    const divisionId = registrationDivisionId(item)
    const divisionNameKey = String(firstValue(item.divisionName, item.groupName, '')).replace(/\s+/g, '').toLowerCase()
    const key = tournamentId + ':' + (divisionNameKey ? 'name:' + divisionNameKey : 'id:' + divisionId)
    const current = groupedRegistrations[key]
    const currentPriority = current ? Number(statusPriority[String(current.status || '').toLowerCase()] || 0) : -1
    const itemPriority = Number(statusPriority[status] || 0)
    if (!current || itemPriority > currentPriority || (itemPriority === currentPriority && toTime(item.updateTime || item.createTime) > toTime(current.updateTime || current.createTime))) groupedRegistrations[key] = item
  })
  const uniqueRegistrations = Object.keys(groupedRegistrations).map(key => groupedRegistrations[key])
  const ids = unique(uniqueRegistrations.map(item => item.tournamentId))
  const tournaments = ids.length ? await safeGet('tournaments', { _id: _.in(ids) }, 200) : []
  const tournamentMap = {}; tournaments.forEach(item => { tournamentMap[String(item._id)] = item })
  const registrationsByTournament = {}
  registrations.forEach(item => {
    const key = String(item.tournamentId || '')
    if (!key) return
    if (!registrationsByTournament[key]) registrationsByTournament[key] = []
    registrationsByTournament[key].push(item)
  })
  const items = await Promise.all(uniqueRegistrations.map(async item => {
    const tournamentId = String(item.tournamentId || '')
    const tournament = tournamentMap[tournamentId] || {}, status = String(item.status || 'pending')
    const sameTournamentRegistrations = registrationsByTournament[tournamentId] || []
    const divisionName = String(firstValue(item.divisionName, tournament.divisionName, '默认组别'))
    const divisionNameKey = divisionName.replace(/\s+/g, '').toLowerCase()
    const sameDivisionRegistrations = sameTournamentRegistrations.filter(row => String(firstValue(row.divisionName, row.groupName, tournament.divisionName, '默认组别')).replace(/\s+/g, '').toLowerCase() === divisionNameKey)
    const explicitDivisionId = sameDivisionRegistrations.map(registrationDivisionId).find(value => value && value !== 'default')
    const divisionId = explicitDivisionId || registrationDivisionId(item)
    const logicalDivisionKeys = unique(sameTournamentRegistrations.map(row => {
      const nameKey = String(firstValue(row.divisionName, row.groupName, '')).replace(/\s+/g, '').toLowerCase()
      return nameKey ? 'name:' + nameKey : 'id:' + registrationDivisionId(row)
    }))
    const allowLegacySnapshot = logicalDivisionKeys.length === 1
    const rosters = (await safeGet('roster_snapshots', { tournamentId, teamId }, 20))
      .filter(snapshot => snapshotMatchesDivision(snapshot, divisionId, allowLegacySnapshot))
    const roster = rosters.sort((a,b)=>toTime(b.updateTime)-toTime(a.updateTime))[0]
    const matches = (await safeGet('matches', { tournamentId }, 300)).filter(row => {
      const involved = [String(row.homeTeamId || ''), String(row.awayTeamId || '')].indexOf(teamId) >= 0 || [String(row.homeTeamName || ''), String(row.awayTeamName || '')].indexOf(String(team.name || '')) >= 0
      return involved && snapshotMatchesDivision(row, divisionId, allowLegacySnapshot)
    }).sort((a,b) => {
      const left = matchDateTimeMs(a) || Number.MAX_SAFE_INTEGER
      const right = matchDateTimeMs(b) || Number.MAX_SAFE_INTEGER
      return left - right
    })
    const completedStatuses = ['completed', 'finished', 'archived']
    const matchRows = matches.map(row => {
      const rawStatus = String(row.status || 'scheduled').toLowerCase()
      const matchTimeMs = matchDateTimeMs(row)
      const matchDate = matchTimeMs ? new Date(matchTimeMs) : null
      const now = new Date()
      const isToday = Boolean(matchDate && matchDate.getFullYear() === now.getFullYear() && matchDate.getMonth() === now.getMonth() && matchDate.getDate() === now.getDate())
      const homeTeamId = String(row.homeTeamId || '')
      const isHome = homeTeamId === teamId || (!homeTeamId && String(row.homeTeamName || '') === String(team.name || ''))
      const opponentName = isHome ? String(row.awayTeamName || '客队待定') : String(row.homeTeamName || '主队待定')
      const statusText = ({ scheduled: '待开始', pending: '待开始', checked_in: '已报到', ongoing: '进行中', live: '进行中', finished: '已结束', completed: '已结束', archived: '已归档', postponed: '已延期', cancelled: '已取消' })[rawStatus] || '待确认'
      return {
        id: String(row._id),
        dateText: matchDateText(row),
        timeText: matchTimeValue(row),
        opponentName,
        sideText: isHome ? '主场' : '客场',
        roundText: String(firstValue(row.roundName, row.roundText, row.round, '轮次待定')),
        venueText: String(firstValue(row.venue, row.field, row.location, '场地待定')),
        status: rawStatus,
        statusText,
        statusClass: completedStatuses.indexOf(rawStatus) >= 0 ? 'match-status-done' : (['ongoing', 'live'].indexOf(rawStatus) >= 0 ? 'match-status-live' : 'match-status-wait'),
        isToday,
        canSubmitLineup: ['scheduled', 'pending', 'checked_in'].indexOf(rawStatus) >= 0
      }
    })
    const next = matchRows.find(row => ['completed', 'finished', 'archived', 'cancelled'].indexOf(row.status) < 0)
    const normalizedStatus = String(status || 'pending').toLowerCase()
    const hasOngoingMatch = matchRows.some(row => ['ongoing', 'live'].indexOf(row.status) >= 0)
    const hasCompletedMatch = matchRows.length > 0 && matchRows.every(row => ['completed', 'finished', 'archived', 'cancelled'].indexOf(row.status) >= 0)
    const hasTodayMatch = matchRows.some(row => row.isToday)
    const competitionStatus = hasOngoingMatch ? 'ongoing' : (hasCompletedMatch ? 'completed' : 'not_started')
    const competitionFilter = hasTodayMatch ? 'today' : (hasCompletedMatch ? 'completed' : 'upcoming')
    return {
      id: tournamentId + ':' + divisionId,
      registrationId: String(item._id),
      tournamentId,
      divisionId,
      name: String(tournament.name || '赛事'),
      divisionName,
      status,
      statusText: ['approved', 'confirmed', 'active', 'accepted', 'claimed'].indexOf(normalizedStatus) >= 0 ? '已参赛' : '待确认',
      statusClass: ['approved', 'confirmed', 'active', 'accepted', 'claimed'].indexOf(normalizedStatus) >= 0 ? 'state-ok' : 'state-wait',
      rosterText: roster ? (String(roster.status || '') === 'approved' ? '正式名单已审核' : '正式名单待处理') : '尚未提交正式名单',
      matches: matchRows,
      matchCount: matchRows.length,
      hasMatches: matchRows.length > 0,
      competitionStatus,
      competitionFilter,
      nextMatchId: next ? next.id : '',
      nextMatchText: next ? next.dateText + ' ' + next.timeText : '赛程待公布',
      actionText: '查看赛事',
      actionClass: 'event-secondary'
    }
  }))
  // 历史报名关系可能同时存在“待确认”和“已参赛”等重复记录。
  // 页面展示口径是球队 + 赛事 + 标准化组别名称，每个逻辑参赛关系只保留一张卡片。
  const displayPriority = { approved: 90, confirmed: 80, active: 80, accepted: 75, claimed: 70, pending: 60, reviewing: 55, invited: 40, draft: 20 }
  const displayItems = {}
  items.forEach(item => {
    const divisionNameKey = String(item.divisionName || '').replace(/\s+/g, '').toLowerCase()
    const key = String(item.tournamentId || '') + ':' + (divisionNameKey ? 'name:' + divisionNameKey : 'id:' + String(item.divisionId || 'default'))
    const current = displayItems[key]
    const currentPriority = current ? Number(displayPriority[String(current.status || '').toLowerCase()] || 0) : -1
    const itemPriority = Number(displayPriority[String(item.status || '').toLowerCase()] || 0)
    if (!current || itemPriority > currentPriority || (itemPriority === currentPriority && String(item.registrationId || '') > String(current.registrationId || ''))) displayItems[key] = item
  })
  return { success: true, team: { id: teamId, name: String(team.name || ''), logo: String(firstValue(team.logo, team.logoUrl, team.teamLogo, '') || '') }, items: Object.keys(displayItems).map(key => displayItems[key]), canManage: (result.workspace.permissions || []).indexOf('team.manage') >= 0 }
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

  const divisionName = String(firstValue(registration.divisionName, division.name, division.divisionName, ''))
  const allMatches = await safeGet('matches', { tournamentId }, 300)
  const teamMatches = allMatches.filter(item => {
    const involved = [String(item.homeTeamId || ''), String(item.awayTeamId || '')].indexOf(teamId) >= 0 || [String(item.homeTeamName || ''), String(item.awayTeamName || '')].indexOf(String(team.name || '')) >= 0
    if (!involved) return false
    return matchMatchesDivision(item, divisionId, divisionName)
  })
  const completedStatuses = ['completed', 'finished', 'archived']
  const completedMatches = teamMatches.filter(item => completedStatuses.indexOf(String(item.status || '').toLowerCase()) >= 0)
  const nextMatch = teamMatches.filter(item => completedStatuses.indexOf(String(item.status || '').toLowerCase()) < 0).sort((a, b) => {
    const left = matchDateTimeMs(a) || Number.MAX_SAFE_INTEGER
    const right = matchDateTimeMs(b) || Number.MAX_SAFE_INTEGER
    return left - right
  })[0] || null

  const opponentIds = unique(teamMatches.reduce((ids, item) => ids.concat([item.homeTeamId, item.awayTeamId]), []).filter(id => String(id || '') !== teamId))
  const opponentRows = opponentIds.length ? await safeGet('teams', { _id: _.in(opponentIds) }, 100) : []
  const teamMap = {}; teams.concat(opponentRows).forEach(item => { teamMap[String(item._id)] = item })
  function teamBrief(id, fallbackName, fallbackLogo) {
    const row = teamMap[String(id || '')] || {}
    return { id: String(id || ''), name: String(row.name || row.teamName || fallbackName || '球队待定'), logo: String(row.logo || row.logoTransparent || row.logoOriginal || fallbackLogo || '') }
  }
  const scheduleMatches = teamMatches.map(item => {
    const start = firstValue(item.matchTime, item.matchDate, item.startTime)
    const rawStatus = String(item.status || 'scheduled').toLowerCase()
    const home = teamBrief(item.homeTeamId, item.homeTeamName, item.homeTeamLogo)
    const away = teamBrief(item.awayTeamId, item.awayTeamName, item.awayTeamLogo)
    return {
      id: String(item._id || ''),
      dateText: matchDateText(item),
      timeText: matchTimeValue(item),
      venueText: String(firstValue(item.venue, item.location, item.fieldName, item.field, '场地待定')),
      homeName: home.name,
      homeLogo: home.logo,
      awayName: away.name,
      awayLogo: away.logo,
      scoreText: ['scheduled', 'pending', 'upcoming'].indexOf(rawStatus) < 0 && item.homeScore !== undefined && item.homeScore !== null && item.awayScore !== undefined && item.awayScore !== null ? String(item.homeScore) + ' : ' + String(item.awayScore) : '- : -',
      statusText: ({ scheduled: '待开始', pending: '待开始', checked_in: '已报到', ongoing: '进行中', live: '进行中', finished: '已结束', completed: '已结束', archived: '已归档', postponed: '已延期', cancelled: '已取消' })[rawStatus] || '待确认',
      statusClass: ['ongoing', 'live'].indexOf(rawStatus) >= 0 ? 'match-live' : (completedStatuses.indexOf(rawStatus) >= 0 ? 'match-finished' : 'match-upcoming')
    }
  })
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

  let next = null
  if (nextMatch) {
    const start = firstValue(nextMatch.startTime, nextMatch.matchDate, nextMatch.matchTime)
    next = {
      id: String(nextMatch._id || ''),
      startTime: start,
      dateText: matchDateText(nextMatch),
      timeText: matchTimeValue(nextMatch),
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
    summary: { rank: standingIndex >= 0 ? standingIndex + 1 : 0, rankTotal: divisionStandings.length, played: teamMatches.length, completed: completedMatches.length, points: Number(firstValue(standing && standing.points, computedPoints, 0)) },
    roster: { exists: Boolean(roster), approved: rosterApproved, status: rosterStatus, playerCount: Array.isArray(rosterPlayers) ? rosterPlayers.length : Number(roster && roster.playerCount || 0), maxPlayers: Number(firstValue(division.maxPlayersPerTeam, division.maxPlayers, tournament.maxPlayersPerTeam, tournament.maxPlayers, 20)) },
    matches: scheduleMatches,
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
  let pairingResolutionUpdated=0
  if(operation==='archive'){
    try{
      const resolved=await cloud.callFunction({name:'resultCenter',data:{action:'resolvePairingSources',tournamentId:String(match.tournamentId || ''),__authToken:String(event.__authToken || '')}})
      const result=resolved && resolved.result || {}
      pairingResolutionUpdated=Number(result.pairingResolution && result.pairingResolution.updatedCount || 0)
    }catch(error){console.warn('赛果归档后自动解析淘汰赛站位失败，可在赛果中心重试',error && error.message)}
  }
  return { success: true, reviewStatus: updateData.refereeReviewStatus,pairingResolutionUpdated, message: operation === 'archive' ? '赛果已确认归档' : '电子记录已退回裁判限定修正' }
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

const playerAccountTransfer = createPlayerAccountTransfer({
  db,
  invitePreview: teamPlayerInviteForWorkspace,
  teamPlayers: safeGetTeamPlayers,
  ensureProfileInvite: ensureParentProfileInviteForPlayer,
  profileInviteUrl: parentProfileInviteUrl,
  verifiedPhone: verifiedUserPhone,
  error: workspaceError,
  toTime
})

exports.main = async function(event) {
  event = event || {}
  try {
    const identity = await findCurrentUser()
    if (event.action === 'playerCardRead') {
      const reader = require('./playerCardReader.cjs')
      const playerId = String(event.playerId || '').trim()
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(playerId)) return {success:false,error:'球员编号无效'}
      const player = await reader.document(db,'players',playerId)
      if (!player) return {success:true,status:'unavailable',cardUrl:'',playerId}
      const self = [player.linkedUserId,player.playerUserId,player.guardianUserId].some(id=>id && String(id)===String(identity.user._id))
      if (!self) await loadTeamPlayerDetailForWorkspace({...event,playerId,teamId:String(player.teamId || event.teamId || '')},identity)
      const [card] = await reader.readCards(cloud,db,[player])
      return {success:true,...card}
    }


    if (event.action === 'messages') {
      const scoped = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
      const messages = await loadMessagesForWorkspace(scoped.workspace, identity.user, identity.openId)
      return Object.assign({ success: true, workspaceId: scoped.workspace.id }, messages)
    }
    if (event.action === 'markMessageRead') return await markMessagesRead(event, identity)
    if (event.action === 'setHomeIdentity') return await saveHomeIdentity(event, identity)
    if (event.action === 'teamPlayers') return await loadTeamPlayersForWorkspace(event, identity)
    if (event.action === 'importedPlayerDrafts') return await importedPlayerDraftsForWorkspace(event, identity)
    if (event.action === 'reviewImportedPlayerDrafts') return await reviewImportedPlayerDraftsForWorkspace(event, identity)
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
    if (event.action === 'confirmTeamArrival') return await confirmTeamArrivalForWorkspace(event, identity)
    if (event.action === 'adultElectronicPass') return await adultElectronicPassForWorkspace(event, identity)
    if (event.action === 'submitMatchLineup') return await submitMatchLineupForWorkspace(event, identity)
    if (event.action === 'returnMatchLineup') return await returnMatchLineupForOrganizer(event, identity)
    if (event.action === 'teamDataPackage') return await teamDataPackageForWorkspace(event, identity)
    if (event.action === 'requestTeamDataPackage') return await requestTeamDataPackageForWorkspace(event, identity)
    if (event.action === 'teamDataPackageData') return await teamDataPackageDataForWorkspace(event, identity)
    if (event.action === 'requestTeamDataExport') return await requestTeamDataExportForWorkspace(event, identity)
    if (event.action === 'prebuiltTeamInvite') return await prebuiltTeamInviteForWorkspace(Object.assign({}, event, { allowReviewRequired: true }), identity)
    if (event.action === 'acceptPrebuiltTeamInvite') return await acceptPrebuiltTeamInviteForWorkspace(event, identity)
    if (event.action === 'acceptTeamOwnerTransfer') return await acceptTeamOwnerTransferForWorkspace(event, identity)
    if (event.action === 'requestPrebuiltTeamClaimReview') return await requestPrebuiltTeamClaimReview(event, identity)
    if (event.action === 'claimCodeContext') return await claimCodeContextForWorkspace(event, identity)
    if (event.action === 'claimableTeams') return await claimableTeamsForWorkspace(event, identity)
    if (event.action === 'teamProfile') return await teamProfileForWorkspace(event, identity)
    if (event.action === 'saveTeamProfile') return await saveTeamProfileForWorkspace(event, identity)
    if (event.action === 'teamMembers') return await teamMembersForWorkspace(event, identity)
    if (event.action === 'createTeamMemberInvite') return await createTeamMemberInviteForWorkspace(event, identity)
    if (event.action === 'teamMemberInvite') return await teamMemberInviteForWorkspace(event, identity)
    if (event.action === 'acceptTeamMemberInvite') return await acceptTeamMemberInviteForWorkspace(event, identity)
    if (event.action === 'createTeamPlayerInvite') return await createTeamPlayerInviteForWorkspace(event, identity)
    if (event.action === 'teamPlayerInvite') return await teamPlayerInviteForWorkspace(event, identity)
    if (event.action === 'acceptTeamPlayerInvite') return await acceptTeamPlayerInviteForWorkspace(event, identity)
    if (event.action === 'requestPlayerAccountTransfer') return await playerAccountTransfer.request(event, identity)
    if (event.action === 'inspectPlayerAccountTransfer') return await playerAccountTransfer.inspect(event, identity)
    if (event.action === 'adoptIncompletePlayer') return await playerAccountTransfer.adoptIncomplete(event, identity)
    if (event.action === 'beginPlayerAccountTransfer') return await playerAccountTransfer.begin(event, identity)
    if (event.action === 'redeemPlayerAccountTransfer') return await playerAccountTransfer.finish(event, identity)
    if (event.action === 'tournamentOperations') return await tournamentOperationsForWorkspace(event, identity)
    if (event.action === 'tournamentData') return await tournamentDataForWorkspace(event, identity)
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
    const matches = canViewEvents
      ? await loadMatches(current, tournaments, teams)
      : []
    const tournamentSummaryMap = {}
    tournaments.forEach(item => {
      const tournamentId = String(item._id || '')
      const activeRegistrations = registrations.filter(row => String(row.tournamentId || '') === tournamentId && ['cancelled', 'withdrawn', 'rejected', 'replaced'].indexOf(String(row.status || '').toLowerCase()) < 0)
      tournamentSummaryMap[tournamentId] = {
        teamCount: unique(activeRegistrations.map(row => row.teamId)).length,
        matchCount: matches.filter(row => String(row.tournamentId || '') === tournamentId && String(row.status || '').toLowerCase() !== 'cancelled').length
      }
    })
    const matchTeamIds = unique(matches.reduce((ids, item) => ids.concat([matchTeamId(item, 'home'), matchTeamId(item, 'away')]), []))
    const matchTeams = matchTeamIds.length ? await safeGet('teams', { _id: _.in(matchTeamIds) }, 300) : []
    const teamMap = {}
    teams.concat(matchTeams).forEach(team => { teamMap[team._id] = team })
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
    // 用户可能同时管理多支球队；直接发给本人的报名草稿仍必须受当前球队空间约束，
    // 否则 A 队页面会显示 B 队的“继续完成赛事报名”。无 teamId 的个人任务保留。
    const scopedRegistrationDraftRows = registrationDraftRows.filter(item => {
      const taskTeamId = String(item.teamId || '')
      return !taskTeamId || accessibleTeamIds.indexOf(taskTeamId) >= 0
    })
    const activeRegistrationKeys = new Set(registrations.filter(item => ['pending', 'approved', 'confirmed', 'active', 'locked'].indexOf(String(item.status || '').toLowerCase()) >= 0).map(item => String(item.tournamentId || '') + ':' + String(item.teamId || '') + ':' + registrationDivisionId(item)))
    const staleDraftRows = scopedRegistrationDraftRows.filter(item => activeRegistrationKeys.has(String(item.tournamentId || '') + ':' + String(item.teamId || '') + ':' + String(item.divisionId || 'default')))
    if (staleDraftRows.length) {
      await Promise.all(staleDraftRows.map(item => db.collection('tournament_tasks').doc(item._id).update({ data: { status: 'completed', completedAt: db.serverDate(), updateTime: db.serverDate() } }).catch(() => null)))
    }
    const activeDraftRows = scopedRegistrationDraftRows.filter(item => staleDraftRows.indexOf(item) < 0)
    const eventTasks = buildRegistrationDraftTasks(activeDraftRows).concat(buildTasks(registrations), buildOrganizerTasks(hostedRegistrations))
    const tasks = eventTasks.concat(education.tasks)
    const teamIds = unique(teams.map(item => item._id))
    const players = canViewTeams && teamIds.length
      ? await safeGetPlayersForTeams(teamIds, 500)
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
      tournaments: tournaments.map(item => formatTournament(item, tournamentSummaryMap[String(item._id || '')])),
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

// Unified lifecycle response decorator: preserve authorization and mutation handlers.
const workspaceMainBeforeLifecycle = exports.main
exports.main = async function(event, context) {
  const result = await workspaceMainBeforeLifecycle(event, context)
  try {
    return await require('./data-center/lifecycle-reader.cjs').decorateLifecycleResult(db, result)
  } catch (error) {
    return { success: false, code: error.code || 'LIFECYCLE_READ_FAILED', message: error.message || '赛事状态读取失败，请刷新重试' }
  }
}

// Add active-version card metadata only after the original workspace authorization succeeds.
const workspaceMain = exports.main
exports.main = async (event,context) => {
  if (event?.action === 'playerCardBatchRead') {
    try {
    const response = await workspaceMain({...event,action:'teamPlayers'},context)
    if (!response?.success) return response
    const requested = new Set((Array.isArray(event.playerIds)?event.playerIds:[]).map(String))
    if (requested.size>100) return {success:false,message:'一次最多读取100名球员'}
    const reader = require('./playerCardReader.cjs')
    const allowed = (response.players||[]).filter(player=>requested.has(String(player._id || player.id || '')))
    const sources = await Promise.all(allowed.map(player=>reader.document(db,'players',String(player._id || player.id))))
    const cards = await reader.readCards(cloud,db,sources.map((player,index)=>player||{_id:allowed[index].id}))
    return {success:true,cards}
    } catch(error) { return {success:false,code:'PLAYER_CARD_READ_FAILED',message:'球员卡读取失败，请重试'} }
  }
  const result = await workspaceMain(event,context)
  if (!result?.success || !['teamPlayers','teamPlayerDetail','matchLineup'].includes(String(event?.action || ''))) return result
  const reader = require('./playerCardReader.cjs')
  const items = result.player ? [result.player] : (result.players || [])
  try {
    const rows = await Promise.all(items.map(item=>reader.document(db,'players',String(item._id || item.id || ''))))
    const cards = await reader.readCards(cloud,db,rows.map((row,index)=>row || {_id:items[index]._id || items[index].id}))
    const attached = items.map((item,index)=>({...item,cardUrl:cards[index].cardUrl,cardState:cards[index].status,portraitUrl:cards[index].portraitUrl,portraitStatus:cards[index].portraitStatus,photoUrl:cards[index].portraitUrl||item.photoUrl,cardTypeId:cards[index].cardTypeId,templateId:cards[index].templateId,publishedVersion:cards[index].publishedVersion,cardDataVersion:cards[index].cardDataVersion,renderVersion:cards[index].renderVersion,cardProtocolVersion:cards[index].protocolVersion}))
    return result.player ? {...result,player:attached[0]} : {...result,players:attached}
  } catch (error) {
    console.error('[player-card-read]',error.message)
    const attached = items.map(item=>({...item,cardUrl:'',cardState:'failed',cardStatus:'failed'}))
    return result.player ? {...result,player:attached[0]} : {...result,players:attached,cardAssetsError:true}
  }
}
