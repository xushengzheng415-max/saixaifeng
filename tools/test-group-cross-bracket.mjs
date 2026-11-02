import assert from 'node:assert/strict'
import templates from '../cloudfunctions/generateSchedule/pairingTemplates.js'
import confirmedPairings from '../cloudfunctions/generateSchedule/confirmedPairings.js'

function teams(code, count) {
  return Array.from({ length: count }, (_, index) => ({ teamId: `${code}-${index + 1}`, teamName: `${code}${index + 1}班` }))
}

// 与校长杯 U8混合组分组一致：A组满 4 支，B/C/D 组 3 支（第 4 签位轮空）。
const groups = [
  { groupName: 'A组', groupCode: 'A', teams: teams('A', 4) },
  { groupName: 'B组', groupCode: 'B', teams: teams('B', 3) },
  { groupName: 'C组', groupCode: 'C', teams: teams('C', 3) },
  { groupName: 'D组', groupCode: 'D', teams: teams('D', 3) }
]

// 1. 循环赛轮转：首轮按签位相邻配对（1-2、3-4、5-6…）。
const fourRounds = templates.standardRoundRobinRounds(4, 'single')
assert.deepEqual(fourRounds[0], [[1, 2], [3, 4]], '四人组首轮应为 1-2、3-4')
const threeRounds = templates.standardRoundRobinRounds(3, 'single')
assert.deepEqual(threeRounds[0], [[1, 2]], '三人组首轮应为 1-2（3 号签位轮空）')
assert.equal(threeRounds.flat().length, 3, '三人组单循环共 3 场')

// 2. 小组赛按轮次跨组统一编排：第一轮 A、B、C、D 组同时开赛。
const rotation = templates.standardRoundRobinTemplate({ groupSizes: [4, 3, 3, 3], loopType: 'single' })
assert.equal(templates.validatePairingTemplate(rotation).valid, true, '按轮次编排的小组赛模板必须通过校验')
assert.equal(rotation.stages.length, 3, '小组赛应为 3 轮')
assert.deepEqual(
  rotation.stages[0].matches.map(item => `${item.home}-${item.away}`),
  ['A1-A2', 'A3-A4', 'B1-B2', 'C1-C2', 'D1-D2'],
  '第一轮应为 A1-A2、A3-A4、B1-B2、C1-C2、D1-D2'
)
rotation.stages.forEach(stage => {
  stage.matches.forEach(match => assert.equal(match.round, stage.round, '同轮比赛轮次号必须一致'))
})

// 3. 已确认分组生成对阵：小组赛按轮次、淘汰赛按交叉对位。
const division = {
  _id: 'u8-mixed',
  name: 'U8混合组',
  formatType: 'cup',
  advancePerGroup: 2,
  finalRankingMode: 'top4',
  loopType: 'single'
}
const built = confirmedPairings.buildConfirmedPairings({
  tournamentId: 'principal-cup',
  division,
  groupRecords: [{ _id: 'draw', tournamentId: 'principal-cup', divisionId: 'u8-mixed', status: 'published', groups }]
})
const matches = built.matches
assert.deepEqual(matches.map(match => match.matchNo), matches.map((_, index) => index + 1), '场序必须连续')

const groupMatches = matches.filter(match => match.phase === 'group')
assert.equal(groupMatches.length, 15, '小组赛应为 15 场（4 支组 6 场 + 3 支组各 3 场）')
assert.deepEqual(
  groupMatches.slice(0, 5).map(match => `${match.homeSourceLabel}-${match.awaySourceLabel}`),
  ['A1班-A2班', 'A3班-A4班', 'B1班-B2班', 'C1班-C2班', 'D1班-D2班'],
  '小组赛第一轮应按 A→D 组顺序连续开赛，不能把 A 组全部打完再打 B 组'
)
const rounds = [...new Set(groupMatches.map(match => match.round))]
assert.deepEqual(rounds, [1, 2, 3], '小组赛轮次必须连续')
rounds.forEach(round => {
  const list = groupMatches.filter(match => match.round === round)
  const ids = list.flatMap(match => [match.homeTeamId, match.awayTeamId])
  assert.equal(new Set(ids).size, ids.length, `第${round}轮同一球队不能参加两场比赛`)
  const sequence = list.map(match => match.group)
  // 各小组比赛必须是连续区块（A 组先进后出），并按 A→D 顺序排列。
  const blocks = sequence.filter((value, index) => index === 0 || value !== sequence[index - 1])
  assert.deepEqual(blocks, ['A组', 'B组', 'C组', 'D组'], `第${round}轮各小组比赛必须按组别顺序连续排列`)
})
groups.forEach(group => {
  const perTeam = group.teams.length - 1
  group.teams.forEach(team => {
    const played = groupMatches.filter(match => match.homeTeamId === team.teamId || match.awayTeamId === team.teamId).length
    assert.equal(played, perTeam, `${team.teamName} 单循环应赛 ${perTeam} 场`)
  })
})

// 4. 淘汰赛：相邻小组交叉，同组回避，决赛最后一场。
const knockout = matches.filter(match => match.phase !== 'group')
assert.equal(knockout.length, 8, '8 支晋级球队应有 1/4决赛 4 场 + 半决赛 2 场 + 三四名赛 1 场 + 决赛 1 场')
const quarterLabel = index => `${knockout[index].homeSourceLabel}-${knockout[index].awaySourceLabel}`
assert.deepEqual(quarterLabel(0), 'A组第1-B组第2', '1/4决赛第一场应为 A组第1 对 B组第2')
assert.deepEqual(quarterLabel(1), 'C组第1-D组第2', '1/4决赛第二场应为 C组第1 对 D组第2')
assert.deepEqual(quarterLabel(2), 'B组第1-A组第2', '1/4决赛第三场应为 B组第1 对 A组第2')
assert.deepEqual(quarterLabel(3), 'D组第1-C组第2', '1/4决赛第四场应为 D组第1 对 C组第2')
knockout.slice(0, 4).forEach(match => {
  const groupNames = [match.homeSource.groupName, match.awaySource.groupName]
  assert.notEqual(groupNames[0], groupNames[1], '1/4决赛必须回避同组球队')
})
const semifinalPairing = knockout.slice(4, 6).map(match => `${match.homeSourceLabel}-${match.awaySourceLabel}`)
assert.deepEqual(semifinalPairing, ['场序16胜者-场序17胜者', '场序18胜者-场序19胜者'], '半决赛必须由相邻两场 1/4 决赛胜者交叉组成')
const third = matches[matches.length - 2]
const final = matches[matches.length - 1]
assert.equal(third.roundName, '三四名赛', '三四名赛排在决赛之前')
assert.equal(final.roundName, '决赛', '决赛必须是最后一场')
assert.deepEqual(third.dependencyMatchNos.slice(-2), [20, 21], '三四名赛取两场半决赛负者')
assert.deepEqual(final.dependencyMatchNos.slice(-2), [20, 21], '决赛取两场半决赛胜者')
assert.equal(final.awaySource.type, 'match_winner')
assert.equal(third.homeSource.type, 'match_loser')

// 4.1 两组交叉（每组前 2、前 4）保持原有正确口径，不能因本次调整回退。
;[[2, 'A组第1-B组第2,B组第1-A组第2'], [4, 'A组第1-B组第4,B组第1-A组第4,A组第2-B组第3,B组第2-A组第3']].forEach(([advance, expected]) => {
  const builtTwoGroups = confirmedPairings.buildConfirmedPairings({
    tournamentId: 'two-groups',
    division: { _id: `dg-${advance}`, name: `两组${advance}名`, formatType: 'cup', advancePerGroup: advance, finalRankingMode: 'champion', loopType: 'single' },
    groupRecords: [{ _id: 'draw', tournamentId: 'two-groups', divisionId: `dg-${advance}`, status: 'published', groups: [
      { groupName: 'A组', groupCode: 'A', teams: teams('A', advance) },
      { groupName: 'B组', groupCode: 'B', teams: teams('B', advance) }
    ] }]
  }).matches
  const firstKnockout = builtTwoGroups.filter(match => match.phase !== 'group').slice(0, advance)
  assert.equal(
    firstKnockout.map(match => `${match.homeSourceLabel}-${match.awaySourceLabel}`).join(','),
    expected,
    `两组每组前${advance}名交叉对位`
  )
  firstKnockout.forEach(match => assert.notEqual(match.homeSource.groupName, match.awaySource.groupName, '淘汰赛首轮必须回避同组球队'))
})

// 5. 排期次序：小组赛按轮次由早到晚，三四名赛后才是决赛，决赛拿到最后一个时段。
const scheduler = (await import('../cloudfunctions/generateSchedule/scheduler.js')).default
const scheduled = matches.map(match => Object.assign({}, match, { matchFormat: '5side', requiredVenueFormat: '5side', durationMinutes: 40 }))
const result = scheduler.assign(scheduled, {
  startDate: '2026-12-01',
  endDate: '2026-12-13',
  venues: ['1号场地', '2号场地'],
  fieldFormat: '5side',
  timeSlots: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'],
  matchDuration: 40,
  restMinutes: 60,
  maxPerSession: 3
}, new Set())
assert.equal(result.unassigned, 0, `所有场次都应能排入：${(result.reasons || []).join('；')}`)
const timeOf = match => new Date(`${match.matchDate}T${match.matchTime}:00`).getTime()
const orderedByTime = scheduled.slice().sort((left, right) => timeOf(left) - timeOf(right))
const groupTimeOrder = orderedByTime.filter(match => match.phase === 'group').map(match => match.round)
assert.deepEqual(groupTimeOrder, groupTimeOrder.slice().sort((a, b) => a - b), '小组赛必须按第1轮→第3轮的先后时间排列')
const lastMatch = orderedByTime[orderedByTime.length - 1]
assert.equal(lastMatch.roundName, '决赛', '决赛必须是整份赛程的最后一场')
const thirdMatch = orderedByTime[orderedByTime.length - 2]
assert.equal(thirdMatch.roundName, '三四名赛', '三四名赛排在决赛之前')

console.log(JSON.stringify({
  passed: true,
  groupStage: groupMatches.map(match => `#${match.matchNo} ${match.roundName} ${match.homeSourceLabel} VS ${match.awaySourceLabel}`),
  knockout: knockout.map(match => `#${match.matchNo} ${match.roundName} ${match.homeSourceLabel} VS ${match.awaySourceLabel}`),
  scheduledTail: orderedByTime.slice(-4).map(match => `${match.matchDate} ${match.matchTime} ${match.venue} ${match.roundName}`)
}, null, 2))
