const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')

const originalLoad = Module._load
Module._load = function (request) {
  if (request === 'wx-server-sdk') return { DYNAMIC_CURRENT_ENV: 'test', init() {}, database() { return { command: {} } } }
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
assert.deepEqual(rules.parseGenerated('{"title":"现场快讯","summary":"双方已经入场。","analysis":"现场节奏加快。"}', [], 'flash'), { title: '现场快讯', body: '双方已经入场。\n\n现场节奏加快。' })
console.log('news preview generation rules: passed')
