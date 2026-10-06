'use strict'

// Candidate queries reduce I/O; the existing record predicate remains the
// authority, including conflicting legacy organization fields.
const orgFields = ['orgId', 'organizationId', 'organization_id']
const teamFields = ['teamId', 'teamCode', 'teamIds', 'teamCodes']
const teamCollections = new Set(['players', 'coaches', 'management', 'registration_player_drafts', 'squads', 'team_tasks'])
const tournamentCollections = new Set(['registration_player_drafts', 'referees', 'referee_invitations', 'divisions', 'matches', 'match_events', 'match_referees', 'tournament_referees', 'tournament_teams', 'tournament_groups', 'tournament_bracket', 'tournament_league_tables', 'rosters', 'roster_change_requests', 'standings', 'schedule_info', 'squads', 'team_tasks'])
const matchCollections = new Set(['matches', 'match_events', 'match_referees', 'squads'])

function dependencies(collection) {
  return {
    teams: !collection || teamCollections.has(collection) || matchCollections.has(collection),
    tournaments: !collection || tournamentCollections.has(collection),
    matches: !collection || matchCollections.has(collection)
  }
}

function tenantWhere(db, orgId) {
  return db.command.or(orgFields.map(field => ({ [field]: String(orgId) })))
}

function candidateWhere(db, collection, scope) {
  const clauses = scope.orgId ? orgFields.map(field => ({ [field]: String(scope.orgId) })) : []
  const add = (fields, values) => {
    const ids = [...new Set(values.filter(Boolean))]
    // Keep individual in expressions within the shared reader's batch size.
    for (let start = 0; start < ids.length; start += 20) {
      fields.forEach(field => clauses.push({ [field]: db.command.in(ids.slice(start, start + 20)) }))
    }
  }
  if (teamCollections.has(collection)) add(teamFields, [...scope.teamIds, ...scope.teamCodes])
  if (tournamentCollections.has(collection)) add(['tournamentId'], [...scope.tournamentIds])
  if (matchCollections.has(collection)) add([collection === 'matches' ? '_id' : 'matchId'], [...scope.matchIds])
  return clauses.length ? db.command.or(clauses) : null
}

async function readPage(db, collection, options, scope, allowed) {
  const candidate = candidateWhere(db, collection, scope)
  if (!candidate) return []
  const skip = Math.max(0, Math.floor(Number(options.skip) || 0))
  const size = Math.min(1000, Math.max(1, Math.floor(Number(options.limit) || 100)))
  const orders = (Array.isArray(options.orderBy) ? options.orderBy : [options.orderBy]).filter(Boolean)
  const condition = options.where && Object.keys(options.where).length
    ? db.command.and([candidate, options.where]) : candidate
  const result = []
  let offset = 0, accepted = 0
  while (offset <= 20000) {
    let query = db.collection(collection).where(condition)
    let hasIdOrder = false
    orders.forEach(entry => {
      const field = Object.keys(entry)[0]
      if (field) {
        query = query.orderBy(field, entry[field] === 'asc' ? 'asc' : 'desc')
        if (field === '_id') hasIdOrder = true
      }
    })
    if (!hasIdOrder) query = query.orderBy('_id', 'asc')
    const page = (await query.skip(offset).limit(Math.min(100, 20001 - offset)).get()).data || []
    if (!page.length) return result
    offset += page.length
    if (offset > 20000) throw Object.assign(new Error('数据范围过大，请缩小查询范围'), { code: 'DATA_SCOPE_TOO_LARGE' })
    for (const row of page) {
      if (!allowed(collection, row, scope)) continue
      if (accepted++ < skip) continue
      result.push(row)
      if (result.length === size) return result
    }
  }
  throw Object.assign(new Error('数据范围过大，请缩小查询范围'), { code: 'DATA_SCOPE_TOO_LARGE' })
}

module.exports = { dependencies, tenantWhere, candidateWhere, readPage }
