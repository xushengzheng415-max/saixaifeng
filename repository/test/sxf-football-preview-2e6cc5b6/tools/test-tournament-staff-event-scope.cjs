const assert = require('node:assert/strict')
const { recordBelongsToStaffEvent } = require('../cloudfunctions/webLoginApi/staffEventScope.cjs')

const scope = {
  staff: true, tournamentId: 'event-a',
  teamIds: new Set(['team-a']), playerIds: new Set(['player-a']),
  matchIds: new Set(['match-a']), refereeIds: new Set(['referee-a'])
}
assert.equal(recordBelongsToStaffEvent('tournaments', { _id: 'event-a' }, scope), true)
assert.equal(recordBelongsToStaffEvent('tournaments', { _id: 'event-b' }, scope), false)
assert.equal(recordBelongsToStaffEvent('teams', { _id: 'team-a' }, scope), true)
assert.equal(recordBelongsToStaffEvent('teams', { _id: 'team-b' }, scope), false)
assert.equal(recordBelongsToStaffEvent('players', { _id: 'player-a' }, scope), true)
assert.equal(recordBelongsToStaffEvent('players', { _id: 'player-b', teamId: 'team-a' }, scope), true)
assert.equal(recordBelongsToStaffEvent('players', { _id: 'player-c', teamId: 'team-b' }, scope), false)
assert.equal(recordBelongsToStaffEvent('matches', { _id: 'match-a', tournamentId: 'event-a' }, scope), true)
assert.equal(recordBelongsToStaffEvent('matches', { _id: 'match-a', tournamentId: 'event-b' }, scope), false)
assert.equal(recordBelongsToStaffEvent('match_events', { matchId: 'match-a' }, scope), true)
assert.equal(recordBelongsToStaffEvent('match_events', { matchId: 'match-b' }, scope), false)
assert.equal(recordBelongsToStaffEvent('referees', { _id: 'referee-a' }, scope), true)
assert.equal(recordBelongsToStaffEvent('player_library', { _id: 'player-a' }, scope), false)
assert.equal(recordBelongsToStaffEvent('unknown', { tournamentId: 'event-a' }, scope), false)
console.log('tournament staff event scope: event, participant, match and private-library boundaries passed')
