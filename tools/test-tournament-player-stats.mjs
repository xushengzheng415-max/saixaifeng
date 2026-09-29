import assert from 'node:assert/strict'
import { buildTournamentPlayerStats } from '../web-admin-vue/src/utils/tournamentPlayerStats.js'

const players = [{ _id: 'starter', name: '同名' }, { _id: 'sub', name: '同名' }, { _id: 'bench' }]
const match = { homeTeamId: 'relation', awayTeamId: 'other', durationMinutes: 80, homeLineup: { starters: [{ playerId: 'starter' }], substitutes: [{ playerId: 'sub' }, { playerId: 'bench' }] }, statsEvents: [
  { _id: 'goal', type: 'goal', playerId: 'starter', teamId: 'relation', minute: 10 },
  { _id: 'goal', type: 'goal', playerId: 'starter', teamId: 'relation', minute: 10 },
  { type: 'own_goal', playerId: 'starter', teamId: 'relation', minute: 15 },
  { type: 'yellow_card', playerId: 'bench', teamId: 'relation', minute: 20 },
  { type: 'substitution', outgoingPlayerId: 'starter', incomingPlayerId: 'sub', teamId: 'relation', minute: 30 },
  { type: 'yellow_card', playerId: 'sub', teamId: 'relation', minute: 40 },
  { type: 'second_yellow_red', playerId: 'sub', teamId: 'relation', minute: 60 },
  { type: 'goal', playerName: '同名', teamId: 'relation', minute: 70 },
  { type: 'penalty_scored', playerId: 'starter', teamId: 'relation', minute: 80, isPenaltyShootout: true }
] }
const rows = buildTournamentPlayerStats(players, [match], ['team', 'relation'])
assert.equal(rows[0].appearances, 1)
assert.equal(rows[0].minutes, 30)
assert.equal(rows[0].goals, 1)
assert.equal(rows[0].goalsIncomplete, true)
assert.equal(rows[1].minutes, 30)
assert.equal(rows[1].yellowCards, 2)
assert.equal(rows[1].redCards, 1)
assert.equal(rows[2].appearances, 0)
assert.equal(rows[2].minutes, 0)
assert.equal(rows[2].yellowCards, 1)
assert.equal(buildTournamentPlayerStats(players, [match], ['different'])[0].goals, 0)
assert.equal(buildTournamentPlayerStats(players, [{ ...match, durationMinutes: undefined, statsEvents: [] }], ['relation'])[0].minutesIncomplete, true)
assert.equal(buildTournamentPlayerStats(players, [{ ...match, homeLineup: {}, statsEvents: [] }], ['relation'])[0].appearanceIncomplete, true)
assert.equal(buildTournamentPlayerStats(players, [], ['relation'])[0].appearances, 0)
const unknownMinute = buildTournamentPlayerStats(players, [{ ...match, statsEvents: [{ type: 'substitution', incomingPlayerId: 'sub', outgoingPlayerId: 'starter', teamId: 'relation' }] }], ['relation'])
assert.equal(unknownMinute[0].minutesIncomplete, true)
assert.equal(unknownMinute[1].minutesIncomplete, true)
console.log('PASS: 本届球员统计、稳定ID、换人、替补席红黄牌、去重、两黄一红、缺失记录')
