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
  if (functionName === 'dataCenter' && string(params.scope && params.scope.tournamentId) !== expected) return false
  const nested = [
    params.tournamentId, params.eventId, params.tournament && (params.tournament._id || params.tournament.id),
    params.scope && params.scope.tournamentId, params.data && params.data.tournamentId
  ].map(string).filter(Boolean)
  if (nested.some(value => value !== expected)) return false
  let scoped = nested.length > 0
  if (functionName === 'getRegulations') {
    const event = await read(db, 'tournaments', expected)
    const fileUrl = string(params.fileUrl || params.fileID)
    const allowed = [event && event.regulationsUrl, event && event.regulationsFileId, event && event.regulationsFileURL, event && event.regulations && event.regulations.url].map(string).filter(Boolean)
    if (!event || !fileUrl || !allowed.includes(fileUrl)) return false
  }
  if (functionName === 'parseTournamentRegulations') {
    const fileId = string(params.fileID)
    if (fileId) {
      const event = await read(db, 'tournaments', expected)
      const saved = [event && event.regulationsFileId, event && event.regulationsUrl].map(string).includes(fileId)
      const uploads = (await db.collection('tournament_staff_audit').where({ tournamentId:expected, fileID:fileId, action:'upload.file' }).limit(2).get()).data || []
      if (!saved && !uploads.length) return false
    }
  }
  const references = [
    ['matchId', 'matches'], ['registrationId', 'tournament_teams'], ['tournamentTeamId', 'tournament_teams'],
    ['divisionId', 'divisions'], ['newsId', 'tournament_news']
  ]
  if (functionName === 'reviewRosterChange') references.push(['requestId', 'roster_change_requests'])
  if (functionName === 'tournamentReview') references.push(['requestId', 'tournament_team_requests'])
  if (functionName === 'organizerClaimInvite') references.push(['requestId', 'team_claim_review_requests'])
  for (const [key, collection] of references) {
    const id = string(params[key])
    if (!id) continue
    const row = await read(db, collection, id)
    if (!row || string(row.tournamentId || row.eventId) !== expected) return false
    scoped = true
  }
  const inviteId = string(params.inviteId)
  if (inviteId) {
    const rows = (await Promise.all(['team_invitations', 'tournament_invites'].map(name => read(db, name, inviteId)))).filter(Boolean)
    if (rows.length !== 1 || string(rows[0].tournamentId) !== expected) return false
    scoped = true
  }
  const teamId = string(params.teamId)
  if (teamId) {
    const rows = (await db.collection('tournament_teams').where({ tournamentId: expected, teamId }).limit(2).get()).data || []
    if (rows.length !== 1) return false
    scoped = true
  }
  const teamIds = Array.isArray(params.teamIds) ? params.teamIds.map(string).filter(Boolean) : []
  for (const teamId of teamIds) {
    const rows = (await db.collection('tournament_teams').where({ tournamentId: expected, teamId }).limit(2).get()).data || []
    if (rows.length !== 1) return false
    scoped = true
  }
  const refereeId = string(params.refereeId || params.targetRefereeId)
  const creatingRefereeRelation = functionName === 'setHeadReferee' || functionName === 'tournamentRegistrationFlow' && ['createRefereeFollowInvite', 'createTemporaryRefereeClaim'].includes(string(params.action))
  if (refereeId && !creatingRefereeRelation) {
    const rows = (await db.collection('tournament_referees').where({ tournamentId: expected, refereeId }).limit(2).get()).data || []
    const profile = await read(db, 'referees', refereeId)
    if (rows.length !== 1 && string(profile && profile.tournamentId) !== expected) return false
    scoped = true
  }
  if (refereeId && creatingRefereeRelation && !scoped) {
    const rows = (await db.collection('tournament_referees').where({ tournamentId: expected, refereeId }).limit(2).get()).data || []
    if (rows.length !== 1) return false
    scoped = true
  }
  return scoped
}

module.exports = { validateStaffRelayScope }
