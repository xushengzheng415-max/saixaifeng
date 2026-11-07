import assert from 'node:assert/strict'
import { createDemoWorkspace } from '../web-admin-vue/src/utils/demoWorkspace.mjs'
import { demoStartLineupBlock } from '../web-admin-vue/src/utils/demoPortrait.js'

const workspace = createDemoWorkspace()
const api = (action, params) => workspace.request(action, params)
const list = (collection, where) => api('dbQuery', { collection, operation: 'list', where }).data

const youth = list('teams', { ageGroup: 'open' }).find(team => team.name === '模拟青少年球队1')
assert.ok(youth)
const players = list('players', { teamId: youth._id })
assert.equal(players.length, 12)
assert.ok(players.every(player => String(player.photoUrl || '').startsWith('data:image/svg+xml')))
const cards = api('getPlayerCardsForViewer', { playerIds: players.slice(0, 3).map(player => player._id) })
assert.equal(cards.success, true)
assert.equal(cards.cards.length, 3)
assert.ok(cards.cards.every(card => card.status === 'ready' && card.portraitUrl.startsWith('data:image/svg+xml') && !card.cardUrl))
assert.equal(api('getPlayerCardForViewer', { playerId: players[0]._id }).portraitUrl, cards.cards.find(card => card.playerId === players[0]._id).portraitUrl)

const seeded = api('seedDemoWalkthrough', {})
assert.equal(seeded.success, true)
assert.ok(String(seeded.tournamentId).startsWith('demo-'))
assert.ok(String(seeded.divisionId).startsWith('demo-'))
assert.ok(String(seeded.matchId).startsWith('demo-'))
assert.equal(seeded.matchCount, 6)
const tournament = api('dbQuery', { collection: 'tournaments', operation: 'get', id: seeded.tournamentId }).data
assert.equal(tournament.orgId, 'demo-organization')
assert.equal(tournament.demoSeed, true)
assert.equal(tournament.pairingGenerated, true)
assert.equal(tournament.scheduleDraft.venueResources[0].fieldFormat, '8side')
assert.equal(tournament.drawStatusByDivision[seeded.divisionId], 'confirmed')
const division = api('dbQuery', { collection: 'divisions', operation: 'get', id: seeded.divisionId }).data
assert.equal(division.matchFormat, '8side')
assert.equal(division.rulesLocked, true)
assert.equal(Number(division.matchMinutes), 40)
const registrations = list('tournament_teams', { tournamentId: seeded.tournamentId })
assert.equal(registrations.length, 4)
assert.ok(registrations.every(row => row.status === 'approved' && String(row._id).startsWith('demo-')))
const matches = list('matches', { tournamentId: seeded.tournamentId }).filter(row => row.status !== 'cancelled')
assert.equal(matches.length, 6)
const ready = matches.find(row => row._id === seeded.matchId)
assert.ok(ready.matchDate && ready.matchTime && ready.venue)
assert.equal(ready.lineups.home.players.length >= 1 && ready.lineups.away.players.length >= 1, true)
assert.equal(demoStartLineupBlock(ready.lineups, { home: '主队', away: '客队' }), '')
assert.match(demoStartLineupBlock({ home: ready.lineups.home, away: { players: [] } }, { home: '模拟青少年球队1', away: '模拟青少年球队2' }), /模拟青少年球队2/)
assert.equal(demoStartLineupBlock({ home: { players: [{ name: '甲' }] }, away: { players: [{ id: 'demo-players-1' }] } }), '')
const pending = matches.filter(row => !row.matchDate || !row.matchTime || !row.venue)
assert.equal(pending.length, 5)

const again = api('seedDemoWalkthrough', {})
assert.notEqual(again.tournamentId, seeded.tournamentId)
assert.equal(list('tournaments').filter(row => row.demoSeed).length, 2)
assert.throws(() => api('dbQuery', { collection: 'tournaments', operation: 'update', id: 'real-event', data: {} }), /没有这条记录/)
assert.throws(() => api('unimplementedWrite', {}), /不会调用真实接口/)

const restored = createDemoWorkspace()
restored.restore(workspace.snapshot())
const restoredMatch = restored.request('dbQuery', { collection: 'matches', operation: 'get', id: seeded.matchId }).data
assert.equal(restoredMatch.lineups.away.players.length, 1)
assert.ok(String(restoredMatch.lineups.home.players[0].photoUrl).startsWith('data:image/svg+xml'))
console.log('PASS: demo portraits, player cards, seeded 8-a-side walkthrough, lineup gate, isolation')
