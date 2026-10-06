const value = input => String(input == null ? '' : input).trim()

async function document(db, collection, id) {
  try {
    const result = await db.collection(collection).doc(id).get()
    return Array.isArray(result.data) ? result.data[0] : result.data || null
  } catch (_) { return null }
}

function nestedTeamIds(input, output = new Set(), depth = 0) {
  if (!input || typeof input !== 'object' || depth > 5) return output
  if (Array.isArray(input)) {
    input.forEach(item => nestedTeamIds(item, output, depth + 1))
    return output
  }
  for (const [key, item] of Object.entries(input)) {
    if (['teamId', 'homeTeamId', 'awayTeamId'].includes(key) && value(item)) output.add(value(item))
    else if (item && typeof item === 'object') nestedTeamIds(item, output, depth + 1)
  }
  return output
}

function nestedEventIds(input, output = new Set(), depth = 0) {
  if (!input || typeof input !== 'object' || depth > 5) return output
  if (Array.isArray(input)) { input.forEach(item => nestedEventIds(item, output, depth + 1)); return output }
  for (const [key, item] of Object.entries(input)) {
    if (['tournamentId', 'eventId'].includes(key) && value(item)) output.add(value(item))
    else if (item && typeof item === 'object') nestedEventIds(item, output, depth + 1)
  }
  return output
}

async function staffWriteReferencesAllowed(db, collection, record, scope) {
  if (!scope?.staff || !record || typeof record !== 'object') return false
  const tournamentId = value(record.tournamentId || record.eventId)
  if (tournamentId && tournamentId !== scope.tournamentId) return false
  if ([...nestedEventIds(record)].some(id => id !== scope.tournamentId)) return false
  if (value(record.matchId) && !scope.matchIds.has(value(record.matchId))) return false
  if (value(record.divisionId) && value(record.divisionId) !== 'default') {
    const division = await document(db, 'divisions', value(record.divisionId))
    if (!division || value(division.tournamentId) !== scope.tournamentId) return false
  }
  const teamIds = nestedTeamIds(record)
  for (const teamId of teamIds) {
    if (scope.teamIds.has(teamId)) continue
    // Registration may add a team owned by this organization to this event.
    if (collection !== 'tournament_teams' || teamId !== value(record.teamId)) return false
    const team = await document(db, 'teams', teamId)
    if (!team || value(team.orgId || team.organizationId) !== scope.orgId) return false
  }
  return true
}

module.exports = { staffWriteReferencesAllowed }
