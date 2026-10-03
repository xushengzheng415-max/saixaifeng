const { readAll, readByIds } = require('./data-center/reader.cjs')
const string = value => String(value == null ? '' : value).trim()
const ids = values => [...new Set((values || []).map(string).filter(Boolean))]
const EVENT_COLLECTIONS = new Set([
  'divisions', 'tournament_teams', 'tournament_groups', 'tournament_bracket',
  'tournament_league_tables', 'rosters', 'roster_change_requests', 'standings',
  'schedule_info', 'team_tasks', 'registration_player_drafts', 'referee_invitations',
  'tournament_referees'
])

async function document(db, collection, id) {
  if (!id) return null
  try {
    const result = await db.collection(collection).doc(id).get()
    return Array.isArray(result.data) ? result.data[0] || null : result.data || null
  } catch (_) { return null }
}

function personIds(value) {
  if (!Array.isArray(value)) return []
  return ids(value.map(item => typeof item === 'string' ? item : item && (item.playerId || item._id || item.id)))
}

async function buildStaffEventScope(db, userId, orgId, tournamentId) {
  const event = await document(db, 'tournaments', tournamentId)
  if (!event || string(event.orgId || event.organizationId || event.organization_id) !== string(orgId)) throw new Error('赛事不存在或不属于当前机构')
  const [registrations, matches, rosterSnapshots, refereeRelations] = await Promise.all([
    readAll(db, 'tournament_teams', { tournamentId }, { maxRows: 20000 }),
    readAll(db, 'matches', { tournamentId }, { maxRows: 20000 }),
    readAll(db, 'roster_snapshots', { tournamentId }, { maxRows: 20000 }),
    readAll(db, 'tournament_referees', { tournamentId }, { maxRows: 20000 })
  ])
  const teamIds = ids(registrations.map(row => row.teamId))
  const teamRows = teamIds.length ? await readByIds(db, 'teams', '_id', teamIds) : []
  const playerIds = ids(rosterSnapshots.flatMap(row => personIds(row.playerIds).concat(personIds(row.players)))
    .concat(registrations.flatMap(row => personIds(row.playerIds).concat(personIds(row.players)))))
  return {
    staff: true, user: { _id:string(userId) }, userId: string(userId), orgId: string(orgId), tournamentId: string(tournamentId),
    tournamentIds: new Set([string(tournamentId)]),
    teamIds: new Set(teamIds),
    teamCodes: new Set(ids(teamRows.flatMap(row => [row.teamCode, row.code]))),
    playerIds: new Set(playerIds),
    matchIds: new Set(ids(matches.map(row => row._id))),
    refereeIds: new Set(ids(refereeRelations.map(row => row.refereeId)))
  }
}

function recordBelongsToStaffEvent(collection, record, scope) {
  if (!record || !scope || !scope.staff) return false
  const eventId = string(record.tournamentId || record.eventId)
  if (collection === 'tournaments') return string(record._id) === scope.tournamentId
  if (collection === 'teams') return scope.teamIds.has(string(record._id))
  if (collection === 'players') return scope.playerIds.has(string(record._id)) || scope.teamIds.has(string(record.teamId || record.teamCode))
  if (collection === 'referees') return scope.refereeIds.has(string(record._id)) || eventId === scope.tournamentId
  if (['coaches', 'management'].includes(collection)) return scope.teamIds.has(string(record.teamId || record.teamCode))
  if (collection === 'matches') return scope.matchIds.has(string(record._id)) && eventId === scope.tournamentId
  if (['match_events', 'match_referees', 'squads'].includes(collection)) return scope.matchIds.has(string(record.matchId))
  if (['player_library', 'coach_library'].includes(collection)) return false
  return EVENT_COLLECTIONS.has(collection) && eventId === scope.tournamentId
}

module.exports = { buildStaffEventScope, recordBelongsToStaffEvent }
