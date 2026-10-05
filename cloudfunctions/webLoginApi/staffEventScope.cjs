const { readByIds } = require('./data-center/reader.cjs')
const string = value => String(value == null ? '' : value).trim()
const ids = values => [...new Set((values || []).map(string).filter(Boolean))]
const STAFF_SCOPE_MAX_ROWS = 20000
const STAFF_SCOPE_PAGE_SIZE = 1000
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

// Staff event reads use an equality filter plus skip pagination without adding
// an `_id` sort. Sorting by `_id` here requires a tournamentId+_id compound
// index on every event collection and makes the entire console fail when one
// collection lacks that index. These rows are permission scope inputs only;
// final access still requires the exact tournament relation below.
async function readScopedRows(db, collection, where = {}, options = {}) {
  const maxRows = Number(options.maxRows) > 0 ? Number(options.maxRows) : STAFF_SCOPE_MAX_ROWS
  const pageSize = Math.min(Number(options.pageSize) > 0 ? Number(options.pageSize) : STAFF_SCOPE_PAGE_SIZE, 1000)
  const rows = []
  let offset = 0
  for (;;) {
    const limit = Math.min(pageSize, maxRows - rows.length + 1)
    let page
    try {
      page = (await db.collection(collection).where(where || {}).skip(offset).limit(limit).get()).data || []
    } catch (cause) {
      const error = new Error('数据读取失败，请重试或检查索引')
      error.code = 'DATA_READ_FAILED'
      error.collection = collection
      error.cause = cause
      throw error
    }
    if (!page.length) return rows
    rows.push(...page)
    if (rows.length > maxRows) {
      const error = new Error('赛事数据量过大，暂时无法读取完整授权范围')
      error.code = 'DATA_SCOPE_TOO_LARGE'
      error.collection = collection
      throw error
    }
    offset += page.length
    if (page.length < limit) return rows
  }
}

async function buildStaffEventScope(db, userId, orgId, tournamentId, moduleRight = '') {
  const event = await document(db, 'tournaments', tournamentId)
  if (!event || string(event.orgId || event.organizationId || event.organization_id) !== string(orgId)) throw new Error('赛事不存在或不属于当前机构')
  const [registrations, matches, rosterSnapshots, refereeRelations] = await Promise.all([
    readScopedRows(db, 'tournament_teams', { tournamentId }),
    readScopedRows(db, 'matches', { tournamentId }),
    readScopedRows(db, 'roster_snapshots', { tournamentId }),
    moduleRight === 'event.referees'
      ? readScopedRows(db, 'tournament_referees', { tournamentId })
      : Promise.resolve([])
  ])
  const teamIds = ids(registrations.map(row => row.teamId))
  const teamRows = teamIds.length ? await readByIds(db, 'teams', '_id', teamIds) : []
  const teamCodes = ids(registrations.flatMap(row => [row.teamCode]).concat(teamRows.flatMap(row => [row.teamCode, row.code])))
  const playerIds = ids(rosterSnapshots.flatMap(row => personIds(row.playerIds).concat(personIds(row.players)))
    .concat(registrations.flatMap(row => personIds(row.playerIds).concat(personIds(row.players)))))
  return {
    staff: true, user: { _id:string(userId) }, userId: string(userId), orgId: string(orgId), tournamentId: string(tournamentId),
    tournamentIds: new Set([string(tournamentId)]),
    teamIds: new Set(teamIds),
    teamCodes: new Set(teamCodes),
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
  if (collection === 'players') {
    const teamKeys = [record.teamId, record.teamCode].map(string).filter(Boolean)
    return scope.playerIds.has(string(record._id)) || teamKeys.some(key => scope.teamIds.has(key) || scope.teamCodes.has(key))
  }
  if (collection === 'referees') return scope.refereeIds.has(string(record._id)) || eventId === scope.tournamentId
  if (['coaches', 'management'].includes(collection)) return scope.teamIds.has(string(record.teamId || record.teamCode))
  if (collection === 'matches') return scope.matchIds.has(string(record._id)) && eventId === scope.tournamentId
  if (['match_events', 'match_referees', 'squads'].includes(collection)) return scope.matchIds.has(string(record.matchId))
  if (['player_library', 'coach_library'].includes(collection)) return false
  return EVENT_COLLECTIONS.has(collection) && eventId === scope.tournamentId
}

module.exports = { buildStaffEventScope, recordBelongsToStaffEvent, readScopedRows }
