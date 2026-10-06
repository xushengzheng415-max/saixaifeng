import assert from 'node:assert/strict'
import {
  assertSubstitutionChange,
  matchLineup,
  substitutionState
} from '../cloudfunctions/dataCenter/shared/substitution.mjs'

const match = {
  _id: 'match-substitution-empty-roster-row',
  status: 'ongoing',
  homeTeamId: 'team-home',
  awayTeamId: 'team-away',
  lineups: {
    home: {
      players: [{ _id: 'player-a', name: '首发甲', number: '8' }],
      substitutes: [null, { _id: 'player-b', name: '替补甲', number: '16' }, { _id: 'player-c', name: '替补乙', number: '21' }]
    },
    away: {
      players: [{ _id: 'player-d', name: '客队首发', number: '1' }],
      substitutes: [null, { _id: 'player-e', name: '客队替补', number: '2' }]
    }
  },
  events: [{
    eventId: 'legacy-substitution-1',
    type: 'substitution',
    minute: 9,
    teamSide: 'home',
    teamId: 'team-home',
    playerName: '替补甲',
    playerNumber: '16',
    assistName: '首发甲',
    assistNumber: '8',
    substitutionPeriod: 'first_half'
  }]
}

const rules = {
  mode: 'limited',
  allowReentry: false,
  limit: 5,
  windows: 3,
  ruleKnown: true
}

const homeLineup = matchLineup(match, 'home')
assert.equal(homeLineup.known, true)
assert.equal(homeLineup.substitutes.length, 2)
assert.ok(homeLineup.substitutes.every(Boolean))

const before = substitutionState(match, rules)
assert.deepEqual(before.sides.home.outgoing.map(player => player._id), ['player-b'])
assert.deepEqual(before.sides.home.incoming.map(player => player._id), ['player-c'])

const halftimeEvent = {
  eventId: 'halftime-substitution-1',
  type: 'substitution',
  minute: 30,
  teamSide: 'home',
  teamId: 'team-home',
  playerName: '替补乙',
  playerId: 'player-c',
  inPlayerId: 'player-c',
  playerNumber: '21',
  assistName: '替补甲',
  assistPlayerId: 'player-b',
  outPlayerId: 'player-b',
  assistNumber: '16',
  substitutionPeriod: 'halftime',
  substitutionBatchId: 'halftime-batch-1',
  substitutionBatchIndex: 1,
  substitutionBatchSize: 1
}

const result = assertSubstitutionChange(match, rules, [...match.events, halftimeEvent])
assert.deepEqual(result.sides.home.issues, [])
assert.deepEqual(result.sides.home.outgoing.map(player => player._id), ['player-c'])
assert.equal(result.sides.home.windowCount, 1)

console.log('match halftime substitution with empty roster rows: passed')
