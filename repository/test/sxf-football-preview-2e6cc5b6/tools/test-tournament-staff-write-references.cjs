const assert = require('node:assert/strict')
const { staffWriteReferencesAllowed } = require('../cloudfunctions/webLoginApi/staffWriteReferences.cjs')
const rows = {
  teams: [{ _id:'team-a', orgId:'org-a' }, { _id:'team-b', orgId:'org-b' }],
  divisions: [{ _id:'division-a', tournamentId:'event-a' }, { _id:'division-b', tournamentId:'event-b' }]
}
const db = { collection(name) { return { doc(id) { return { async get() { return { data:(rows[name] || []).find(row => row._id === id) || null } } } } } } }
const scope = { staff:true, orgId:'org-a', tournamentId:'event-a', teamIds:new Set(['team-a']), matchIds:new Set(['match-a']) }
async function main() {
  assert.equal(await staffWriteReferencesAllowed(db, 'matches', { tournamentId:'event-a', divisionId:'division-a', homeTeamId:'team-a', awayTeamId:'team-a' }, scope), true)
  assert.equal(await staffWriteReferencesAllowed(db, 'matches', { tournamentId:'event-a', divisionId:'division-b' }, scope), false)
  assert.equal(await staffWriteReferencesAllowed(db, 'matches', { tournamentId:'event-b' }, scope), false)
  assert.equal(await staffWriteReferencesAllowed(db, 'matches', { tournamentId:'event-a', homeTeamId:'team-b' }, scope), false)
  assert.equal(await staffWriteReferencesAllowed(db, 'tournament_teams', { tournamentId:'event-a', teamId:'team-b' }, scope), false)
  assert.equal(await staffWriteReferencesAllowed(db, 'tournament_groups', { tournamentId:'event-a', teams:[{ teamId:'team-b' }] }, scope), false)
  assert.equal(await staffWriteReferencesAllowed(db, 'tournament_groups', { tournamentId:'event-a', teams:[{ tournamentId:'event-b' }] }, scope), false)
  console.log('tournament staff write references: event, division, team and nested team boundaries passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
