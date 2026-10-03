const string = value => String(value == null ? '' : value).trim()

async function read(db, name, id) {
  if (!id) return null
  try {
    const result = await db.collection(name).doc(id).get()
    return Array.isArray(result.data) ? result.data[0] || null : result.data || null
  } catch (_) { return null }
}

async function validateStaffRelayScope(db, functionName, params = {}, tournamentId) {
  const expected = string(tournamentId)
  if (!expected) return false
  const nested = [
    params.tournamentId, params.eventId, params.tournament && (params.tournament._id || params.tournament.id),
    params.scope && params.scope.tournamentId, params.data && params.data.tournamentId
  ].map(string).filter(Boolean)
  if (nested.some(value => value !== expected)) return false
  const references = [
    ['matchId', 'matches'], ['registrationId', 'tournament_teams'],
    ['divisionId', 'divisions'], ['newsId', 'tournament_news']
  ]
  if (functionName === 'reviewRosterChange') references.push(['requestId', 'roster_change_requests'])
  for (const [key, collection] of references) {
    const id = string(params[key])
    if (!id) continue
    const row = await read(db, collection, id)
    if (!row || string(row.tournamentId || row.eventId) !== expected) return false
  }
  const inviteId = string(params.inviteId)
  if (inviteId) {
    const rows = (await Promise.all(['team_invitations', 'tournament_invites'].map(name => read(db, name, inviteId)))).filter(Boolean)
    if (rows.length !== 1 || string(rows[0].tournamentId) !== expected) return false
  }
  const teamId = string(params.teamId)
  if (teamId) {
    const rows = (await db.collection('tournament_teams').where({ tournamentId: expected, teamId }).limit(2).get()).data || []
    if (rows.length !== 1) return false
  }
  const refereeId = string(params.refereeId || params.targetRefereeId)
  if (refereeId) {
    const rows = (await db.collection('tournament_referees').where({ tournamentId: expected, refereeId }).limit(2).get()).data || []
    const profile = await read(db, 'referees', refereeId)
    if (rows.length !== 1 && string(profile && profile.tournamentId) !== expected) return false
  }
  return true
}

module.exports = { validateStaffRelayScope }
