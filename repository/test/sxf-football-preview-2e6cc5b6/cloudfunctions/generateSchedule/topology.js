'use strict'

function label(source) {
  if (!source) return '待产生'
  if (source.type === 'seed') return source.name || `签位${source.seed}`
  if (source.type === 'group_rank') return `${source.groupName}第${source.rank}`
  if (source.type === 'match_winner') return `场序${source.matchNo}胜者`
  if (source.type === 'match_loser') return `场序${source.matchNo}负者`
  return source.name || '待产生'
}

function teamId(source) { return source && source.type === 'seed' ? (source.teamId || null) : null }
function powerOfTwo(value) { let size = 2; while (size < value) size *= 2; return size }
function isPowerOfTwo(value) { return value >= 2 && (value & (value - 1)) === 0 }
function winner(matchNo) { return { type: 'match_winner', matchNo } }
function loser(matchNo) { return { type: 'match_loser', matchNo } }
function groupRank(groupName, rank, possibleTeamIds) {
  return { type: 'group_rank', groupName, rank, possibleTeamIds: (possibleTeamIds || []).filter(Boolean) }
}

function groupTeamIds(group) {
  return (group && group.teams || []).map(team => team.teamId || team.id || team._id || '').filter(Boolean)
}

function seed(team, index) {
  if (!team) return null
  if (team.type) return { ...team, seed: index + 1 }
  return { type: 'seed', seed: index + 1, teamId: team.teamId || team.id || team._id || null, name: team.teamName || team.name || `签位${index + 1}` }
}

function matchFactory(tournamentId, options) {
  let no = Number(options.startMatchNo || 0)
  return data => {
    no += 1
    const home = data.homeSource
    const away = data.awaySource
    return {
      tournamentId,
      divisionId: options.divisionId || 'default',
      divisionName: options.divisionName || '',
      matchNo: no,
      matchIndex: no,
      competitionGroup: options.divisionName || '',
      scheduleType: data.scheduleType,
      phase: data.phase,
      pool: data.pool || '',
      group: data.pool || '',
      round: data.round,
      scheduleRound: data.round,
      roundName: data.roundName,
      rankRange: data.rankRange || '',
      homeSource: home,
      awaySource: away,
      homeSourceType: home.type,
      awaySourceType: away.type,
      homeSourceLabel: label(home),
      awaySourceLabel: label(away),
      dependencyMatchNos: (data.dependencies || []).filter(Boolean),
      homeTeamId: teamId(home),
      homeTeamName: label(home),
      awayTeamId: teamId(away),
      awayTeamName: label(away),
      finalRankHigh: data.finalRankHigh || null,
      finalRankLow: data.finalRankLow || null,
      homeScore: 0,
      awayScore: 0,
      status: 'scheduled',
      statusText: teamId(home) && teamId(away) ? '未开始' : '待产生',
      isBye: false
    }
  }
}

function rangeName(low, high, count) {
  if (high - low === 1) {
    if (low === 1) return '决赛'
    if (low === 3) return '三、四名决赛'
    return `${low}–${high}名排位赛`
  }
  if (low === 1 && high === 4) return '半决赛'
  if (low === 1) return count > 2 ? `1/${count}决赛` : `1–${high}名淘汰赛`
  return `${low}–${high}名排位赛`
}

function fullRankingKnockout(tournamentId, participants, options = {}) {
  const entries = (participants || []).filter(Boolean)
  if (entries.length < 2) return { matches: [], complete: false, warnings: ['参赛球队不足2支'] }
  const capacity = powerOfTwo(entries.length)
  const rankOffset = Number(options.rankOffset || 0)
  const create = matchFactory(tournamentId, options)
  const sources = Array.from({ length: capacity }, (_, index) => seed(entries[index], index))
  const firstMatches = []
  const promoted = []
  for (let index = 0; index < capacity; index += 2) {
    const home = sources[index]
    const away = sources[index + 1]
    if (home && away) {
      const low = rankOffset + 1
      const high = rankOffset + capacity
      const match = create({ scheduleType: 'cup', phase: rankOffset ? 'placement' : 'knockout', round: 1, roundName: rankOffset ? `${low}–${high}名排位赛` : rangeName(low, high, capacity / 2), rankRange: `${low}–${high}`, homeSource: home, awaySource: away })
      firstMatches.push(match)
      promoted.push(winner(match.matchNo))
    } else if (home || away) promoted.push(home || away)
  }
  if (!isPowerOfTwo(entries.length)) {
    const matches = firstMatches.slice()
    let round = 2
    let current = promoted
    while (current.length > 1) {
      const next = []
      for (let index = 0; index < current.length; index += 2) {
        if (!current[index + 1]) { next.push(current[index]); continue }
        const match = create({ scheduleType: 'cup', phase: 'knockout', round, roundName: current.length === 2 ? '决赛' : `第${round}轮`, rankRange: '冠军线', homeSource: current[index], awaySource: current[index + 1], dependencies: [current[index].matchNo, current[index + 1].matchNo] })
        matches.push(match)
        next.push(winner(match.matchNo))
      }
      current = next
      round += 1
    }
    return { matches, complete: false, warnings: [`${entries.length}支球队使用${capacity}签位；未生成虚假轮空比赛，但全排名需先确认轮空队排位规则`] }
  }
  const matches = firstMatches.slice()
  let blocks = [{ low: rankOffset + 1, high: rankOffset + capacity, matches: firstMatches }]
  let round = 2
  while (blocks.some(block => block.matches.length > 1)) {
    const next = []
    blocks.forEach(block => {
      if (block.matches.length <= 1) return next.push(block)
      const middle = block.low + (block.high - block.low + 1) / 2 - 1
      const upper = []
      const lower = []
      for (let index = 0; index < block.matches.length; index += 2) {
        const a = block.matches[index]
        const b = block.matches[index + 1]
        const deps = [a.matchNo, b.matchNo]
        upper.push(create({ scheduleType: 'cup', phase: block.low === 1 ? 'knockout' : 'placement', round, roundName: rangeName(block.low, middle, block.matches.length / 2), rankRange: `${block.low}–${middle}`, homeSource: winner(a.matchNo), awaySource: winner(b.matchNo), dependencies: deps, finalRankHigh: block.matches.length === 2 ? block.low : null, finalRankLow: block.matches.length === 2 ? middle : null }))
        lower.push(create({ scheduleType: 'cup', phase: 'placement', round, roundName: rangeName(middle + 1, block.high, block.matches.length / 2), rankRange: `${middle + 1}–${block.high}`, homeSource: loser(a.matchNo), awaySource: loser(b.matchNo), dependencies: deps, finalRankHigh: block.matches.length === 2 ? middle + 1 : null, finalRankLow: block.matches.length === 2 ? block.high : null }))
      }
      matches.push(...upper, ...lower)
      next.push({ low: block.low, high: middle, matches: upper }, { low: middle + 1, high: block.high, matches: lower })
    })
    blocks = next
    round += 1
  }
  matches.sort((a, b) => a.matchNo - b.matchNo)
  return { matches, complete: true, warnings: [] }
}

function twoGroupKnockout(tournamentId, groups, options = {}) {
  if (!groups || groups.length !== 2) return { matches: [], complete: false, warnings: ['两组交叉排位要求正好两个小组'] }
  const groupSizes = groups.map(group => (group.teams || []).length)
  if (groupSizes[0] !== groupSizes[1]) {
    return { matches: [], complete: false, warnings: ['两个小组球队数不一致，无法保证每支球队获得唯一名次'] }
  }
  const create = matchFactory(tournamentId, options)
  const a = groups[0].groupName || groups[0].name || 'A组'
  const b = groups[1].groupName || groups[1].name || 'B组'
  const aTeamIds = groupTeamIds(groups[0])
  const bTeamIds = groupTeamIds(groups[1])
  const rankCount = groupSizes[0]
  const matches = []
  for (let rank = 1; rank <= rankCount; rank += 2) {
    const low = (rank - 1) * 2 + 1
    if (rank === rankCount) {
      matches.push(create({ scheduleType: 'tournament', phase: 'placement', round: 1, roundName: `${low}–${low + 1}名排位赛`, rankRange: `${low}–${low + 1}`, homeSource: groupRank(a, rank, aTeamIds), awaySource: groupRank(b, rank, bTeamIds), finalRankHigh: low, finalRankLow: low + 1 }))
      continue
    }
    const high = low + 3
    const first = create({ scheduleType: 'tournament', phase: rank === 1 ? 'knockout' : 'placement', round: 1, roundName: rank === 1 ? '半决赛' : `${low}–${high}名交叉排位赛`, rankRange: `${low}–${high}`, homeSource: groupRank(a, rank, aTeamIds), awaySource: groupRank(b, rank + 1, bTeamIds) })
    const second = create({ scheduleType: 'tournament', phase: rank === 1 ? 'knockout' : 'placement', round: 1, roundName: rank === 1 ? '半决赛' : `${low}–${high}名交叉排位赛`, rankRange: `${low}–${high}`, homeSource: groupRank(b, rank, bTeamIds), awaySource: groupRank(a, rank + 1, aTeamIds) })
    matches.push(first, second)
    matches.push(create({ scheduleType: 'tournament', phase: rank === 1 ? 'knockout' : 'placement', round: 2, roundName: low === 1 ? '决赛' : `${low}–${low + 1}名排位赛`, rankRange: `${low}–${low + 1}`, homeSource: winner(first.matchNo), awaySource: winner(second.matchNo), dependencies: [first.matchNo, second.matchNo], finalRankHigh: low, finalRankLow: low + 1 }))
    matches.push(create({ scheduleType: 'tournament', phase: 'placement', round: 2, roundName: low === 1 ? '三、四名决赛' : `${low + 2}–${high}名排位赛`, rankRange: `${low + 2}–${high}`, homeSource: loser(first.matchNo), awaySource: loser(second.matchNo), dependencies: [first.matchNo, second.matchNo], finalRankHigh: low + 2, finalRankLow: high }))
  }
  matches.sort((left, right) => left.matchNo - right.matchNo)
  return { matches, complete: true, warnings: [] }
}

function multiGroupRanking(tournamentId, groups, options = {}) {
  if (!groups || groups.length < 2) return { matches: [], complete: false, warnings: ['全排名至少需要两个小组'] }
  if (groups.length === 2) return twoGroupKnockout(tournamentId, groups, options)
  const groupCount = groups.length
  const groupSizes = groups.map(group => (group.teams || []).length)
  if (new Set(groupSizes).size !== 1) {
    return { matches: [], complete: false, warnings: ['各小组球队数不一致，无法保证每支球队获得唯一名次'] }
  }
  const rankCount = groupSizes[0]
  const matches = []
  const warnings = []
  let startMatchNo = Number(options.startMatchNo || 0)
  for (let rank = 1; rank <= rankCount; rank += 1) {
    const sources = groups.map((group, index) => groupRank(group.groupName || group.name || `${String.fromCharCode(65 + index)}组`, rank, groupTeamIds(group)))
    const result = fullRankingKnockout(tournamentId, sources, { ...options, startMatchNo, rankOffset: (rank - 1) * groupCount })
    result.matches.forEach(match => { match.scheduleType = 'tournament'; if (rank > 1) match.phase = 'placement' })
    matches.push(...result.matches)
    warnings.push(...result.warnings)
    if (result.matches.length) startMatchNo = result.matches[result.matches.length - 1].matchNo
  }
  matches.sort((left, right) => left.matchNo - right.matchNo)
  return { matches, complete: warnings.length === 0, warnings }
}

module.exports = { label, fullRankingKnockout, twoGroupKnockout, multiGroupRanking }
