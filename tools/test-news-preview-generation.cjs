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
  { type: 'goal', minute: 21, teamSide: 'home', playerName: '甲' },
  { type: 'goal', minute: 36, teamSide: 'away', playerName: '乙' },
  { type: 'substitution', minute: 42, teamSide: 'home', playerName: '丙' }
] }, '主队', '客队'), [
  { minute: 21, team: '主队', player: '甲', type: 'goal' },
  { minute: 36, team: '客队', player: '乙', type: 'goal' }
])
assert.deepEqual(rules.parseGenerated('{"title":"赛后新闻","body":"双方完成比赛。"}'), { title: '赛后新闻', body: '双方完成比赛。' })
console.log('news preview generation rules: passed')
