const id = value => String(value == null ? '' : value).trim()
const uniqueValid = (values, valid) => [...new Set((values || []).map(id).filter(value => value && valid.has(value)))]
const WORKSPACE_PERMISSIONS = ['workspace.manage', 'education.manage']

function grantsEventAccess(membership) {
  const permissions = Array.isArray(membership?.permissions) ? membership.permissions : []
  const roles = Array.isArray(membership?.roles) ? membership.roles : [membership?.role]
  return membership?.source === 'tournament_staff_invite' ||
    permissions.some(value => ['event.view', 'event.manage'].includes(id(value))) ||
    roles.some(value => ['owner', 'admin', 'organizer', 'tournament_staff'].includes(id(value).toLowerCase()))
}

// 共享赛事授权只用于管理指定赛事，不等于占有对方机构。
// 历史数据里存在 source 被写成 pc_wechat_onboarding、role 为空的成员行：
// 这类行只有赛事权限、没有任何工作空间管理权限，同样按共享授权处理。
function isSharedMembership(membership) {
  const roles = Array.isArray(membership?.roles) ? membership.roles : [membership?.role]
  if (membership?.source === 'tournament_staff_invite') return true
  if (roles.some(value => id(value).toLowerCase() === 'tournament_staff')) return true
  const permissions = Array.isArray(membership?.permissions) ? membership.permissions.map(id).filter(Boolean) : []
  const declaredRole = id(membership?.role).toLowerCase()
  return !declaredRole && permissions.length > 0 && !permissions.some(value => WORKSPACE_PERMISSIONS.includes(value))
}

function chooseOrganizerOrganization({ validIds = [], explicitIds = [], memberships = [], tournamentOrgIds = [], ownedOrganizationIds = [] } = {}) {
  const valid = new Set(validIds.map(id).filter(Boolean))
  const owned = uniqueValid(ownedOrganizationIds, valid)
  const personalMemberships = memberships.filter(row => grantsEventAccess(row) && !isSharedMembership(row))
  const eventMemberships = uniqueValid(personalMemberships.map(row => row.orgId || row.organizationId || row.organization_id), valid)
  const sharedOnly = new Set(uniqueValid(memberships.filter(isSharedMembership).map(row => row.orgId || row.organizationId || row.organization_id), valid).filter(value => !owned.includes(value) && !eventMemberships.includes(value)))
  const ownedEvents = uniqueValid(tournamentOrgIds, valid).filter(value => !sharedOnly.has(value))
  const explicit = uniqueValid(explicitIds, valid).filter(value => !sharedOnly.has(value))
  const primary = owned.length ? owned : ownedEvents.length ? ownedEvents : eventMemberships.length ? eventMemberships : explicit
  return { orgId: primary.length === 1 ? primary[0] : '', organizationConflict: primary.length > 1 }
}

module.exports = { chooseOrganizerOrganization, grantsEventAccess, isSharedMembership }
