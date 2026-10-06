import assert from 'node:assert/strict'
import { buildTournamentPlayerStats, resolveMatchPlayingMinutes, mergeTournamentRosterPlayer, findTournamentPlayer } from '../web-admin-vue/src/utils/tournamentPlayerStats.js'

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

// 线上历史记录结构：阵容使用 id/number；事件只有姓名、号码与主客队。
const historicalRoster = [
  { _id: 'r1', name: '球员甲', jerseyNumber: 1 }, { _id: 'r82', name: '球员乙', jerseyNumber: 82 },
  { _id: 'r2', name: '球员丙', jerseyNumber: 2 }, { _id: 'r12', name: '球员丁', jerseyNumber: 12 },
  { _id: 'r37', name: '球员戊', jerseyNumber: 37 }, { _id: 'r11', name: '球员己', jerseyNumber: 11 },
  { _id: 'r8', name: '球员庚', jerseyNumber: 8 }, { _id: 'r7', name: '球员辛', jerseyNumber: 7 },
  { _id: 'r3', name: '球员壬', jerseyNumber: 3 }, { _id: 'r5', name: '球员癸', jerseyNumber: 5 },
  { _id: 'unused', name: '未出场', jerseyNumber: 24 }
]
const historicalMatch = { homeTeamId: 'other', awayTeamId: 'team', durationMinutes: 50,
  lineups: { away: { players: historicalRoster.slice(0, 8).map(player => ({ id: player._id, name: player.name, number: player.jerseyNumber, role: 'FW1' })), substitutes: [] } },
  events: [
    { type: 'substitution', teamSide: 'away', minute: 12, playerName: '球员壬', playerNumber: '3', assistName: '球员己', assistNumber: '11' },
    { type: 'substitution', teamSide: 'away', minute: 30, playerName: '球员癸', playerNumber: '5', assistName: '球员丙', assistNumber: '2' },
    { type: 'goal', teamSide: 'away', minute: 19, playerName: '球员庚', playerNumber: '8' },
    { type: 'goal', teamSide: 'away', minute: 46, playerName: '球员辛', playerNumber: '7' },
    { type: 'goal', teamSide: 'away', minute: 56, playerName: '球员丁', playerNumber: '12' },
    { type: 'yellow_card', teamSide: 'away', minute: 57, playerName: '球员庚', playerNumber: '8' },
    { type: 'goal', teamSide: 'home', minute: 35, playerName: '球员庚', playerNumber: '8' }
  ] }
const division = { matchMinutes: 30, rulesSnapshot: { periodMode: 'halves', matchMinutes: 30, breakMinutes: 10 } }
const historical = buildTournamentPlayerStats(historicalRoster, [historicalMatch], ['team'], division)
assert.equal(resolveMatchPlayingMinutes(historicalMatch, division), 60)
assert.equal(resolveMatchPlayingMinutes(historicalMatch, { matchMinutes: 20, periodMode: 'single', singlePeriodCount: 4 }), 80)
assert.equal(resolveMatchPlayingMinutes(historicalMatch, {}, { matchTime: { halfDuration: 30 } }), 60)
assert.deepEqual(historical.map(row => row.minutes), [60, 60, 30, 60, 60, 12, 60, 60, 48, 30, 0])
assert.equal(historical.reduce((sum, row) => sum + row.goals, 0), 3)
assert.equal(historical.reduce((sum, row) => sum + row.yellowCards, 0), 1)
assert.equal(historical.reduce((sum, row) => sum + row.redCards, 0), 0)
assert.equal(historical.every(row => !row.minutesIncomplete && !row.goalsIncomplete && !row.cardsIncomplete), true)
assert.equal(findTournamentPlayer([{ _id: 'x', name: '同名', jerseyNumber: 3 }, { _id: 'y', name: '同名', jerseyNumber: 5 }], { playerName: '同名', playerNumber: 5 })._id, 'y')
assert.equal(findTournamentPlayer([{ _id: 'x', name: '同名' }, { _id: 'y', name: '同名' }], { playerName: '同名' }), undefined)
const merged = mergeTournamentRosterPlayer({ _id: 'x', photoUrl: 'https://example.test/photo.png', jerseyName: 'LI S.Y.' }, { id: 'x', photoUrl: 'cloud://example/photo.png', jerseyName: '' })
assert.equal(merged.photoUrl, 'https://example.test/photo.png')
assert.equal(merged.jerseyName, 'LI S.Y.')
assert.equal(merged._exportPhotoFileId, 'cloud://example/photo.png')
console.log('PASS: 历史姓名号码关联、60分钟规则、换人后12/30/48分钟、头像地址、球衣名')

const currentMatch = { ...historicalMatch, tournamentId: 'current-event', divisionId: 'current-division' }
const scoped = buildTournamentPlayerStats(historicalRoster.map(player => ({ ...player, appearances: 999, minutes: 99999, goals: 999, yellowCards: 999, redCards: 999 })), [currentMatch, { ...currentMatch, tournamentId: 'previous-event' }, { ...currentMatch, divisionId: 'other-division' }], ['team'], division, {}, { tournamentId: 'current-event', divisionId: 'current-division' })
assert.equal(scoped[0].appearances, 1)
assert.equal(scoped[0].minutes, 60)
assert.equal(scoped.reduce((sum, row) => sum + row.goals, 0), 3)
assert.equal(scoped.reduce((sum, row) => sum + row.yellowCards, 0), 1)
assert.equal(scoped.reduce((sum, row) => sum + row.redCards, 0), 0)
console.log('PASS: 只累计本届当前组别，不读取生涯字段或其他赛事')
