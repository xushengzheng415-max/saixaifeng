const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')

const originalLoad = Module._load
Module._load = function (request) {
  if (request === 'wx-server-sdk') return { DYNAMIC_CURRENT_ENV: 'test', init() {}, database() { return { command: {} } }, async callFunction() { return { result: { success: true, standings: [{ divisionName: '老年组', groupName: '联赛积分榜', officialMatchCount: 1, officialTeams: [{ rank: 1, teamName: '主队', played: 1, win: 1, draw: 0, loss: 0, goalDifference: 4, points: 3 }] }] } } } }
  return originalLoad.apply(this, arguments)
}
const rules = require(path.join(__dirname, '../cloudfunctions/newsPreviewGenerate/index.js')).__test
Module._load = originalLoad

assert.equal(rules.official({ status: 'finished', homeScore: 5, awayScore: 1 }), true)
assert.equal(rules.official({ status: 'finished', homeScore: 5, awayScore: 1, refereeReviewStatus: 'under_review', refereeRecord: {} }), false)
assert.deepEqual(rules.verifiedGoalEvents({ events: [
  { type: 'goal', minute: 36, teamSide: 'away', playerName: '乙' },
  { type: 'goal', minute: 21, teamSide: 'home', playerName: '甲' },
  { type: 'substitution', minute: 42, teamSide: 'home', playerName: '丙' }
] }, '主队', '客队'), [
  { minute: 21, team: '主队', player: '甲', type: 'goal', side: 'home' },
  { minute: 36, team: '客队', player: '乙', type: 'goal', side: 'away' }
])
assert.deepEqual(rules.goalTimeline([
  { minute: 21, team: '主队', player: '甲', side: 'home' },
  { minute: 36, team: '客队', player: '乙', side: 'away' }
]), [
  { minute: 21, team: '主队', player: '甲', scoreAfter: '1:0' },
  { minute: 36, team: '客队', player: '乙', scoreAfter: '1:1' }
])
const current = { _id: 'm0', divisionId: 'old', matchDate: '2026-09-26', matchTime: '09:00', homeTeamId: 'h', awayTeamId: 'a', homeTeamName: '主队', awayTeamName: '客队' }
const fixtures = rules.nextFixturesFromRows(current, [
  current,
  { _id: 'unpublished', divisionId: 'old', matchDate: '2026-10-01', matchTime: '09:00', status: 'scheduled', homeTeamId: 'h', awayTeamId: 'x', homeTeamName: '主队', awayTeamName: '未公布队' },
  { _id: 'home-next', divisionId: 'old', matchDate: '2026-10-04', matchTime: '09:00', status: 'scheduled', schedulePublished: true, homeTeamId: 'x', awayTeamId: 'h', homeTeamName: '下一队', awayTeamName: '主队', venue: '1号场地' },
  { _id: 'away-next', divisionId: 'old', matchDate: '2026-10-07', matchTime: '09:00', status: 'scheduled', published: true, homeTeamId: 'a', awayTeamId: 'x', homeTeamName: '客队', awayTeamName: '下一队', venue: '2号场地' }
])
assert.equal(fixtures.length, 2)
assert.deepEqual(fixtures.map(item => [item.team, item.opponent, item.date]), [['主队', '下一队', '2026-10-04'], ['客队', '下一队', '2026-10-07']])
const article = rules.parseGenerated('{"title":"赛后新闻","summary":"主队取胜。","analysis":"进球记录显示主队后段扩大比分。","outlook":"若延续本场得分效率，主队有望给下一位对手制造压力。"}', fixtures)
assert.equal(article.title, '赛后新闻')
assert.match(article.body, /本场比赛综述[\s\S]*比赛形势分析[\s\S]*下场比赛预告与观点预测/)
assert.match(article.body, /2026年10月4日09:00在1号场地对阵下一队/)
assert.match(article.body, /若延续本场得分效率/)
assert.doesNotMatch(article.body, /预告：|观点及预测：/)
const dayRows = rules.officialDayRows([
  { _id: 'm1', matchDate: '2026-09-26', matchTime: '09:00', status: 'finished', homeScore: 5, awayScore: 1, homeTeamName: '主队', awayTeamName: '客队', divisionName: '老年组', events: [{ type: 'goal', minute: 21, teamSide: 'home', playerName: '甲' }] },
  { _id: 'm2', matchDate: '2026-09-26', status: 'finished', homeScore: 1, awayScore: 0, refereeReviewStatus: 'under_review', refereeRecord: {}, homeTeamName: '待复核队', awayTeamName: '客队' },
  { _id: 'm3', matchDate: '2026-10-04', status: 'finished', homeScore: 2, awayScore: 0, homeTeamName: '另一日', awayTeamName: '客队' }
], '2026-09-26')
assert.equal(dayRows.length, 1)
assert.equal(dayRows[0].matchId, 'm1')
const nextRound = rules.nextRoundFixtures([
  { _id: 'f1', divisionId: 'old', divisionName: '老年组', matchDate: '2026-10-01', matchTime: '09:00', status: 'scheduled', schedulePublished: true, homeTeamName: '甲队', awayTeamName: '乙队' },
  { _id: 'f2', divisionId: 'old', divisionName: '老年组', matchDate: '2026-10-04', matchTime: '09:00', status: 'scheduled', schedulePublished: true, homeTeamName: '丙队', awayTeamName: '丁队' },
  { _id: 'f3', divisionId: 'young', divisionName: '青年组', matchDate: '2026-10-04', matchTime: '10:30', status: 'scheduled', published: true, homeTeamName: '戊队', awayTeamName: '己队' },
  { _id: 'hidden', divisionId: 'young', matchDate: '2026-10-01', status: 'scheduled', homeTeamName: '未发布队', awayTeamName: '客队' }
], '2026-09-26')
assert.deepEqual(nextRound.map(item => item.home), ['甲队', '戊队'])
const daily = rules.buildDailyArticle('立洋杯', '2026-09-26', dayRows, nextRound, true, '')
assert.match(daily.body, /本轮赛果[\s\S]*主队 5:1 客队[\s\S]*积分榜[\s\S]*下轮对阵[\s\S]*甲队 对 乙队[\s\S]*停赛信息/)
assert.doesNotMatch(daily.body, /焦点场次|比赛日综述/)
assert.match(daily.body, /待主办方确认/)
;(async () => {
  const standing = await rules.currentStandingsForDay('t1', [{ _id: 'm1', matchDate: '2026-09-26', homeScore: 5, awayScore: 1, status: 'finished' }], '2026-09-26', 'test-token')
  assert.equal(standing.tables[0].officialTeams[0].points, 3)
  await assert.rejects(rules.currentStandingsForDay('t1', [{ _id: 'future', matchDate: '2026-10-01', homeScore: 1, awayScore: 0, status: 'finished' }], '2026-09-26', 'test-token'), /历史快照/)
  console.log('news preview generation rules: passed')
})().catch(error => { console.error(error); process.exitCode = 1 })
