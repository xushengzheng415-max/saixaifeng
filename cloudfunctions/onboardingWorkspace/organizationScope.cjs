const id = value => String(value == null ? '' : value).trim()
const uniqueValid = (values, valid) => [...new Set((values || []).map(id).filter(value => value && valid.has(value)))]

function grantsEventAccess(membership) {
  const permissions = Array.isArray(membership?.permissions) ? membership.permissions : []
  const roles = Array.isArray(membership?.roles) ? membership.roles : [membership?.role]
  return membership?.source === 'tournament_staff_invite' ||
    permissions.some(value => ['event.view', 'event.manage'].includes(id(value))) ||
    roles.some(value => ['owner', 'admin', 'organizer', 'tournament_staff'].includes(id(value).toLowerCase()))
}

function chooseOrganizerOrganization({ validIds = [], explicitIds = [], memberships = [], tournamentOrgIds = [] } = {}) {
  const valid = new Set(validIds.map(id).filter(Boolean))
  const ownedEvents = uniqueValid(tournamentOrgIds, valid)
  const eventMemberships = uniqueValid(memberships.filter(grantsEventAccess).map(row => row.orgId || row.organizationId || row.organization_id), valid)
  const explicit = uniqueValid(explicitIds, valid)
  const primary = ownedEvents.length ? ownedEvents : eventMemberships.length ? eventMemberships : explicit
  return { orgId: primary.length === 1 ? primary[0] : '', organizationConflict: primary.length > 1 }
}

module.exports = { chooseOrganizerOrganization, grantsEventAccess }
