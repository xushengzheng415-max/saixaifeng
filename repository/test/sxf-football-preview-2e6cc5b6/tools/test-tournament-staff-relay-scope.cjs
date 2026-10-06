const assert = require('node:assert/strict')
const { validateStaffRelayScope } = require('../cloudfunctions/webLoginApi/staffRelayScope.cjs')
const fs = require('node:fs')
const path = require('node:path')
for (const name of ['tournamentRegistrationFlow', 'tournamentReview', 'organizerClaimInvite']) assert.equal(
  fs.readFileSync(path.join(__dirname, `../cloudfunctions/${name}/staffRelayScope.cjs`), 'utf8'),
  fs.readFileSync(path.join(__dirname, '../cloudfunctions/webLoginApi/staffRelayScope.cjs'), 'utf8')
)

const rows = {
  tournaments: [{ _id:'event-a', regulationsUrl:'cloud://env/tournament-regulations/event-a.pdf' }],
  tournament_staff_audit: [{ tournamentId:'event-a', fileID:'cloud://env/tournament-regulations/uploaded.pdf', action:'upload.file' }],
  matches: [{ _id: 'match-a', tournamentId: 'event-a' }, { _id: 'match-b', tournamentId: 'event-b' }],
  tournament_teams: [{ _id: 'registration-a', tournamentId: 'event-a', teamId: 'team-a' }],
  divisions: [{ _id: 'division-a', tournamentId: 'event-a' }],
  tournament_news: [{ _id: 'news-a', tournamentId: 'event-a' }],
  team_invitations: [{ _id: 'invite-a', tournamentId: 'event-a' }],
  tournament_invites: [], tournament_referees: [{ tournamentId: 'event-a', refereeId: 'referee-a' }], referees: []
}
const db = { collection(name) { return {
  doc(id) { return { async get() { const row = (rows[name] || []).find(item => item._id === id); if (!row) throw Error('missing'); return { data: row } } } },
  where(filter) { return { limit() { return { async get() { return { data: (rows[name] || []).filter(row => Object.entries(filter).every(([key, value]) => row[key] === value)) } } } } } }
} } }

async function main() {
  assert.equal(await validateStaffRelayScope(db, 'updateMatch', { matchId: 'match-a' }, 'event-a'), true)
  assert.equal(await validateStaffRelayScope(db, 'updateMatch', { matchId: 'match-b' }, 'event-a'), false)
  assert.equal(await validateStaffRelayScope(db, 'generateSchedule', { tournamentId: 'event-b' }, 'event-a'), false)
  assert.equal(await validateStaffRelayScope(db, 'dataCenter', { scope: { tournamentId: 'event-a' } }, 'event-a'), true)
  assert.equal(await validateStaffRelayScope(db, 'dataCenter', { scope: {} }, 'event-a'), false)
  assert.equal(await validateStaffRelayScope(db, 'getRegulations', { tournamentId:'event-a', fileUrl:'cloud://env/tournament-regulations/event-a.pdf' }, 'event-a'), true)
  assert.equal(await validateStaffRelayScope(db, 'getRegulations', { tournamentId:'event-a', fileUrl:'cloud://env/private/other.pdf' }, 'event-a'), false)
  assert.equal(await validateStaffRelayScope(db, 'parseTournamentRegulations', { tournamentId:'event-a', fileID:'cloud://env/tournament-regulations/uploaded.pdf' }, 'event-a'), true)
  assert.equal(await validateStaffRelayScope(db, 'parseTournamentRegulations', { tournamentId:'event-a', fileID:'cloud://env/private/other.pdf' }, 'event-a'), false)
  assert.equal(await validateStaffRelayScope(db, 'tournamentRegistrationFlow', { registrationId: 'registration-a' }, 'event-a'), true)
  assert.equal(await validateStaffRelayScope(db, 'organizerClaimInvite', { tournamentTeamId: 'registration-a' }, 'event-a'), true)
  assert.equal(await validateStaffRelayScope(db, 'organizerClaimInvite', { tournamentTeamId: 'missing' }, 'event-a'), false)
  assert.equal(await validateStaffRelayScope(db, 'tournamentRegistrationFlow', { inviteId: 'invite-a' }, 'event-a'), true)
  assert.equal(await validateStaffRelayScope(db, 'setHeadReferee', { refereeId: 'referee-a' }, 'event-a'), true)
  assert.equal(await validateStaffRelayScope(db, 'setHeadReferee', { tournamentId: 'event-a', refereeId: 'referee-b' }, 'event-a'), true)
  assert.equal(await validateStaffRelayScope(db, 'tournamentRegistrationFlow', { action: 'reviewTemporaryRefereeClaim', refereeId: 'referee-b' }, 'event-a'), false)
  rows.tournament_invites.push({ _id: 'invite-a', tournamentId: 'event-a' })
  assert.equal(await validateStaffRelayScope(db, 'tournamentRegistrationFlow', { inviteId: 'invite-a' }, 'event-a'), false)
  console.log('tournament staff relay scope: match, registration, invitation and referee boundaries passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
