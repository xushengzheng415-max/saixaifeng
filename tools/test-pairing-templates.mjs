import assert from 'node:assert/strict'
import templates from '../cloudfunctions/generateSchedule/pairingTemplates.js'

function teams(prefix, count) {
  return Array.from({ length: count }, (_, index) => ({ teamId: `${prefix}-${index + 1}`, teamName: `${prefix}${index + 1}` }))
}

const cases = [
  ['青年组', templates.liyangYouthTemplate(), [{ groupName: 'A组', teams: teams('A', 5) }, { groupName: 'B组', teams: teams('B', 4) }], 28],
  ['中年组', templates.liyangMiddleTemplate(), [{ groupName: 'A组', teams: teams('M', 7) }], 21],
  ['老年组', templates.liyangOldTemplate(), [{ groupName: 'A组', teams: teams('O', 4) }], 6]
]

for (const [name, template, groups, expectedCount] of cases) {
  const result = templates.buildPairingsFromTemplate('test-tournament', 'test-division', name, groups, template)
  assert.equal(result.matches.length, expectedCount, `${name} 场次数量`) 
  assert.equal(new Set(result.matches.map(item => item.matchNo)).size, expectedCount, `${name} 场序唯一`)
  assert.ok(result.matches.every(item => !item.matchDate && !item.matchTime && !item.venue), `${name} 不应导入时间场地`)
  assert.ok(result.matches.every(item => item.pairingStatus === 'confirmed' && item.scheduleStatus === 'unassigned'), `${name} 对阵状态`)
}

const youth = templates.buildPairingsFromTemplate('t', 'd', '青年组', [{ groupName: 'A组', teams: teams('A', 5) }, { groupName: 'B组', teams: teams('B', 4) }], templates.liyangYouthTemplate()).matches
const q1 = youth.find(item => item.pairingCode === 'Q1')
const f1 = youth.find(item => item.pairingCode === 'F1')
assert.equal(q1.homeSourceLabel, 'A组第1')
assert.equal(q1.awaySourceLabel, 'B组第4')
assert.deepEqual(f1.dependencyMatchNos, [21, 22])

console.log('pairing templates PASS: youth=28 middle=21 old=6')
