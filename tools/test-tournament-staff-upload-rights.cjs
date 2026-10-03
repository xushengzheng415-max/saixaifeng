const assert = require('node:assert/strict')
const { staffUploadRight } = require('../cloudfunctions/webLoginApi/staffUploadRights.cjs')
const fs = require('node:fs')
const path = require('node:path')
assert.equal(fs.readFileSync(path.join(__dirname, '../cloudfunctions/uploadFile/staffUploadRights.cjs'), 'utf8'), fs.readFileSync(path.join(__dirname, '../cloudfunctions/webLoginApi/staffUploadRights.cjs'), 'utf8'))
const rows = {
  tournaments:[{ _id:'event-a', regulationsFileId:'cloud://env/tournament-regulations/saved.pdf' }],
  tournament_staff_audit:[{ orgId:'org-a', tournamentId:'event-a', fileID:'cloud://env/tournament-regulations/uploaded.pdf', action:'upload.file' }],
  matches:[{ _id:'match-a', tournamentId:'event-a' },{ _id:'match-b', tournamentId:'event-b' }],
  tournament_teams:[{ tournamentId:'event-a', teamId:'team-a' }],
  chunk_sessions:[{ _id:'chunk-a', staffTournamentId:'event-a', staffOrgId:'org-a', staffUserId:'user-a', folder:'match-reports/match-a' }]
}
const db = { collection(name) { return {
  doc(id) { return { async get() { return { data:(rows[name] || []).find(row => row._id === id) || null } } } },
  where(filter) { return { limit() { return { async get() { return { data:(rows[name] || []).filter(row => Object.entries(filter).every(([key,val]) => row[key] === val)) } } } } } }
} } }
const right = (params, eventId = 'event-a', userId = 'user-a') => staffUploadRight(db, params, eventId, 'org-a', userId)
async function main() {
  assert.equal(await right({ action:'startChunk', folder:'tournament-regulations' }), 'event.competition')
  assert.equal(await right({ action:'startChunk', folder:'match-reports/match-a' }), 'event.results')
  assert.equal(await right({ action:'startChunk', folder:'match-reports/match-b' }), '')
  assert.equal(await right({ action:'startChunk', folder:'player-photos/team-a' }), 'event.teams')
  assert.equal(await right({ action:'uploadChunk', uploadId:'chunk-a' }), 'event.results')
  assert.equal(await right({ action:'uploadChunk', uploadId:'chunk-a' }, 'event-a', 'user-b'), '')
  assert.equal(await right({ action:'getTempFileURL', fileID:'cloud://env/match-reports/match-b/photo.png' }), '')
  assert.equal(await right({ action:'getTempFileURL', fileID:'cloud://env/referee-certificates/event-a/cert.jpg' }), 'event.referees')
  assert.equal(await right({ action:'getTempFileURL', fileID:'cloud://env/referee-certificates/event-b/cert.jpg' }), '')
  assert.equal(await right({ action:'getTempFileURL', fileID:'cloud://env/tournament-regulations/saved.pdf' }), 'event.competition')
  assert.equal(await right({ action:'getTempFileURL', fileID:'cloud://env/tournament-regulations/uploaded.pdf' }), 'event.competition')
  assert.equal(await right({ action:'getTempFileURL', fileID:'cloud://env/tournament-regulations/other.pdf' }), '')
  assert.equal(await right({ action:'legacy', cloudPath:'team-logos/whatever.png' }), '')
  console.log('tournament staff upload rights: folder, chunk owner, file URL and cross-event checks passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
