'use strict'

const assert = require('assert')
const topology = require('../cloudfunctions/generateSchedule/topology')
const scheduler = require('../cloudfunctions/generateSchedule/scheduler')

function teams(count, prefix = 'T') {
  return Array.from({ length: count }, (_, index) => ({
    teamId: `${prefix}${index + 1}`,
    teamName: `${prefix}队${index + 1}`
  }))
}

function groups(groupCount, teamCount) {
  return Array.from({ length: groupCount }, (_, index) => ({
    groupName: `${String.fromCharCode(65 + index)}组`,
    teams: teams(teamCount, String.fromCharCode(65 + index))
  }))
}

function assertTraceable(matches) {
  assert.deepStrictEqual(matches.map(match => match.matchNo), matches.map((_, index) => index + 1))
  matches.forEach(match => {
    assert(match.homeSourceLabel, `场序${match.matchNo}缺少主队来源`)
    assert(match.awaySourceLabel, `场序${match.matchNo}缺少客队来源`)
    assert(Array.isArray(match.dependencyMatchNos), `场序${match.matchNo}缺少前置场序`)
  })
}

function matchStart(match) {
  return new Date(`${match.matchDate}T${match.matchTime}:00`).getTime()
}

const eight = topology.fullRankingKnockout('demo', teams(8))
assert.strictEqual(eight.complete, true)
assert.strictEqual(eight.matches.length, 12)
assertTraceable(eight.matches)
assert.deepStrictEqual(
  eight.matches.filter(match => match.finalRankHigh).map(match => `${match.finalRankHigh}-${match.finalRankLow}`).sort(),
  ['1-2', '3-4', '5-6', '7-8']
)
;['1/4决赛', '半决赛', '三、四名决赛', '5–8名排位赛', '5–6名排位赛', '7–8名排位赛'].forEach(name => {
  assert(eight.matches.some(match => match.roundName === name), `8队全排名缺少${name}`)
})

const sixteen = topology.fullRankingKnockout('demo', teams(16))
assert.strictEqual(sixteen.complete, true)
assert.strictEqual(sixteen.matches.length, 32)
assert.strictEqual(sixteen.matches.filter(match => match.finalRankHigh).length, 8)

const seven = topology.fullRankingKnockout('demo', teams(7))
assert.strictEqual(seven.complete, false)
assert.strictEqual(seven.matches.length, 6)
assert.strictEqual(seven.matches.some(match => match.isBye), false)
assert(seven.warnings.some(message => message.includes('轮空')))

const twoGroups = topology.twoGroupKnockout('demo', groups(2, 4), { startMatchNo: 12 })
assert.strictEqual(twoGroups.complete, true)
assert.strictEqual(twoGroups.matches.length, 8)
assert.strictEqual(12 + twoGroups.matches.length, 20)
assert.strictEqual(twoGroups.matches[0].matchNo, 13)
;['决赛', '三、四名决赛', '5–6名排位赛', '7–8名排位赛'].forEach(name => {
  assert(twoGroups.matches.some(match => match.roundName === name), `两组全排名缺少${name}`)
})

const fourGroups = topology.multiGroupRanking('demo', groups(4, 4))
assert.strictEqual(fourGroups.complete, true)
assert.strictEqual(fourGroups.matches.length, 16)

const scheduled = topology.fullRankingKnockout('demo', teams(8)).matches
scheduled.forEach(match => { match.matchFormat='5side';match.requiredVenueFormat='5side' })
const scheduleResult = scheduler.assign(scheduled, {
  startDate: '2026-09-01',
  endDate: '2026-09-30',
  venues: ['1号场', '2号场'],
  fieldFormat: '5side',
  timeSlots: ['09:00', '10:30', '14:00', '15:30'],
  matchDuration: 50,
  restMinutes: 90,
  maxPerSession: 1
}, new Set())
assert.strictEqual(scheduleResult.unassigned, 0)
const matchMap = new Map(scheduled.map(match => [match.matchNo, match]))
scheduled.forEach(match => {
  ;(match.dependencyMatchNos || []).forEach(no => {
    const source = matchMap.get(no)
    assert(source, `场序${match.matchNo}引用了不存在的场序${no}`)
    const rest = matchStart(match) - (matchStart(source) + 50 * 60000)
    assert(rest >= 90 * 60000, `场序${match.matchNo}早于前置场序${no}或休息不足`)
  })
})
const occupied = new Set()
scheduled.forEach(match => {
  const key = `${match.matchDate}|${match.matchTime}|${match.venue}`
  assert(!occupied.has(key), `场地时段冲突：${key}`)
  occupied.add(key)
})

console.log(JSON.stringify({
  passed: true,
  cases: {
    eightTeamFullRanking: eight.matches.length,
    sixteenTeamFullRanking: sixteen.matches.length,
    sevenTeamRealMatchesWithoutFakeBye: seven.matches.length,
    twoGroupsOfFourPlacementMatches: twoGroups.matches.length,
    fourGroupsOfFourPlacementMatches: fourGroups.matches.length,
    scheduledEightTeamMatches: scheduleResult.assigned
  }
}, null, 2))
