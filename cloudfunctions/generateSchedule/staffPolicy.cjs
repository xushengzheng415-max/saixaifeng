const string = value => String(value == null ? '' : value).trim()
const SIDEBAR_RIGHTS = Object.freeze([
  'event.dashboard', 'event.competition', 'event.registration', 'event.teams', 'event.draw',
  'event.matches', 'event.results', 'event.news', 'event.referees', 'event.settings'
])
const RIGHT_ALIASES = Object.freeze({
  'result.supplement': 'event.results',
  'news.edit': 'event.news',
  'news.publish': 'event.news'
})

async function read(db, collection, id) {
  if (!id) return null
  try {
    const response = await db.collection(collection).doc(id).get()
    return Array.isArray(response.data) ? response.data[0] || null : response.data || null
  } catch (_) { return null }
}

async function owner(db, userId, orgId) {
  const organization = await read(db, 'organizations', orgId)
  return Boolean(organization && [organization.ownerId, organization.creatorId, organization.createdBy].map(string).includes(string(userId)))
}

async function isStaff(db, userId, orgId) {
  const rows = (await db.collection('organization_memberships').where({ orgId: string(orgId), userId: string(userId) }).limit(20).get()).data || []
  if (rows.some(row => row.source !== 'tournament_staff_invite' && (row.role === 'admin' || row.role === 'owner' || (Array.isArray(row.permissions) && row.permissions.includes('event.manage'))))) return false
  if (rows.some(row => row.source === 'tournament_staff_invite' || row.role === 'tournament_staff')) return true
  const grants = (await db.collection('tournament_staff_grants').where({ orgId: string(orgId), userId: string(userId) }).limit(20).get()).data || []
  return grants.length > 0
}

async function hasRight(db, userId, orgId, tournamentId, right) {
  if (!userId || !orgId || !tournamentId) return false
  if (await owner(db, userId, orgId)) return true
  const event = await read(db, 'tournaments', string(tournamentId))
  if (!event || string(event.orgId || event.organizationId) !== string(orgId)) return false
  const rows = (await db.collection('tournament_staff_grants').where({ orgId: string(orgId), tournamentId: string(tournamentId), userId: string(userId), status: 'active' }).limit(20).get()).data || []
  return rows.some(row => {
    const rights = Array.isArray(row.permissions) ? row.permissions : []
    return rights.includes(right) || Boolean(RIGHT_ALIASES[right] && rights.includes(RIGHT_ALIASES[right]))
  })
}

module.exports = { SIDEBAR_RIGHTS, owner, isStaff, hasRight }
