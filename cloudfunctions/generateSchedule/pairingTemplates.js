'use strict'

// Pairing templates describe the draw topology only.  They deliberately do
// not contain dates, times or venues; those are assigned by the scheduler.

function text(value) { return String(value == null ? '' : value).trim() }

function groupCode(name, fallback) {
  var value = text(name)
  var match = value.match(/^([A-Za-z])(?:组)?$/)
  return match ? match[1].toUpperCase() : text(fallback || value)
}

function groupTeams(groups) {
  var map = new Map()
  ;(groups || []).forEach(function(group, index) {
    var code = groupCode(group.groupCode || group.code || group.groupName || group.name, String.fromCharCode(65 + index))
    map.set(code, { group: group, code: code, teams: Array.isArray(group.teams) ? group.teams : [] })
  })
  return map
}

function teamAt(groupInfo, index) {
  var team = groupInfo && groupInfo.teams && groupInfo.teams[index - 1]
  if (!team) return null
  return {
    type: 'seed',
    seed: index,
    teamId: team.teamId || team.id || team._id || null,
    name: team.teamName || team.name || ('签位' + index)
  }
}

function parseSource(ref, groups, matchRefs) {
  if (ref && typeof ref === 'object') {
    if (ref.type === 'winner' || ref.type === 'match_winner') return { type: 'match_winner', matchNo: Number(ref.matchNo || matchRefs.get(text(ref.matchCode)) || 0) }
    if (ref.type === 'loser' || ref.type === 'match_loser') return { type: 'match_loser', matchNo: Number(ref.matchNo || matchRefs.get(text(ref.matchCode)) || 0) }
    if (ref.type === 'group_rank') return { type: 'group_rank', groupName: text(ref.groupName || ref.groupCode), rank: Number(ref.rank || 0), possibleTeamIds: [] }
    if (ref.type === 'seed') return { type: 'seed', seed: Number(ref.seed || 0), teamId: ref.teamId || null, name: text(ref.name) }
  }
  var value = text(ref)
  var winner = value.match(/^(.+?)\s*(?:胜|winner)$/i)
  if (winner) return { type: 'match_winner', matchNo: Number(matchRefs.get(text(winner[1])) || 0) }
  var loser = value.match(/^(.+?)\s*(?:负|loser)$/i)
  if (loser) return { type: 'match_loser', matchNo: Number(matchRefs.get(text(loser[1])) || 0) }
  var rank = value.match(/^([A-Za-z])\s*(?:组)?\s*(?:第)?\s*(\d+)$/i)
  if (rank) {
    var group = groups.get(rank[1].toUpperCase())
    var seeded = teamAt(group, Number(rank[2]))
    return seeded || { type: 'group_rank', groupName: group ? (group.group.groupName || group.group.name || rank[1] + '组') : rank[1] + '组', rank: Number(rank[2]), possibleTeamIds: [] }
  }
  var explicitRank = value.match(/^(.+?)\s*第\s*(\d+)$/)
  if (explicitRank) return { type: 'group_rank', groupName: explicitRank[1], rank: Number(explicitRank[2]), possibleTeamIds: [] }
  return { type: 'label', name: value || '待产生' }
}

function sourceLabel(source) {
  if (!source) return '待产生'
  if (source.type === 'seed') return source.name || ('签位' + source.seed)
  if (source.type === 'group_rank') return source.groupName + '第' + source.rank
  if (source.type === 'match_winner') return '场序' + source.matchNo + '胜者'
  if (source.type === 'match_loser') return '场序' + source.matchNo + '负者'
  return source.name || '待产生'
}

function buildPairingsFromTemplate(tournamentId, divisionId, divisionName, groups, template) {
  if (!template || !Array.isArray(template.stages) || template.stages.length === 0) return { matches: [], error: '对阵模板为空' }
  var groupMap = groupTeams(groups)
  var matchRefs = new Map()
  var matches = []
  var nextNo = 1
  var stages = template.stages
  stages.forEach(function(stage, stageIndex) {
    var stageMatches = Array.isArray(stage.matches) ? stage.matches : []
    stageMatches.forEach(function(item, index) {
      var no = Number(item.matchNo || nextNo)
      nextNo = Math.max(nextNo, no + 1)
      var home = parseSource(item.home || item.homeRef, groupMap, matchRefs)
      var away = parseSource(item.away || item.awayRef, groupMap, matchRefs)
      var record = {
        tournamentId: tournamentId,
        divisionId: divisionId,
        divisionName: divisionName || '',
        pairingTemplateVersion: text(template.version || 'v1'),
        pairingTemplateSource: text(template.source || 'configured'),
        pairingCode: text(item.code || item.matchCode || ('M' + no)),
        matchNo: no,
        matchIndex: no,
        scheduleType: text(item.scheduleType || template.scheduleType || 'tournament'),
        phase: text(item.phase || stage.phase || 'group'),
        group: text(item.group || stage.group || ''),
        pool: text(item.pool || item.group || stage.group || ''),
        round: Number(item.round || stage.round || stageIndex + 1),
        scheduleRound: Number(item.round || stage.round || stageIndex + 1),
        roundName: text(item.roundName || stage.name || ('第' + (stageIndex + 1) + '轮')),
        scheduleStageOrder: Number(item.stageOrder || stage.stageOrder || stageIndex + 1),
        scheduleStageName: text(item.stageName || stage.stageName || stage.name || ('第' + (stageIndex + 1) + '阶段')),
        rankRange: text(item.rankRange || stage.rankRange || ''),
        homeSource: home,
        awaySource: away,
        homeSourceType: home.type,
        awaySourceType: away.type,
        homeSourceLabel: sourceLabel(home),
        awaySourceLabel: sourceLabel(away),
        dependencyMatchNos: [].concat(item.dependencyMatchNos || []).map(Number).filter(Boolean),
        homeTeamId: home.type === 'seed' ? home.teamId : null,
        awayTeamId: away.type === 'seed' ? away.teamId : null,
        homeTeamName: sourceLabel(home),
        awayTeamName: sourceLabel(away),
        homeScore: 0,
        awayScore: 0,
        status: 'scheduled',
        statusText: home.type === 'seed' && away.type === 'seed' ? '未开始' : '待产生',
        pairingStatus: 'confirmed',
        scheduleStatus: 'unassigned',
        matchDate: '',
        matchTime: '',
        venue: '',
        isBye: false
      }
      matches.push(record)
      matchRefs.set(record.pairingCode, no)
    })
  })
  matches.forEach(function(match) {
    if (!match.dependencyMatchNos.length) {
      ;[match.homeSource, match.awaySource].forEach(function(source) {
        if (source && (source.type === 'match_winner' || source.type === 'match_loser') && source.matchNo) match.dependencyMatchNos.push(Number(source.matchNo))
      })
    }
    match.dependencyMatchNos = Array.from(new Set(match.dependencyMatchNos)).filter(function(no) { return no < match.matchNo })
  })
  return { matches: matches, templateVersion: text(template.version || 'v1') }
}

function roundRobinStage(code, pairings, round) {
  return { name: '小组赛 ' + code + '组 · 第' + round + '轮', stageName: '小组赛阶段', stageOrder: 1, phase: 'group', group: code + '组', round: round, matches: pairings.map(function(pair, index) { return { code: code + '-R' + round + '-' + (index + 1), home: code + pair[0], away: code + pair[1], roundName: '小组赛 ' + code + '组第' + round + '轮', stageName: '小组赛阶段', stageOrder: 1 } }) }
}

// 标准循环赛轮转法。奇数球队使用内部轮空位，不生成虚假比赛。
function standardRoundRobinRounds(teamCount, loopType) {
  var size = Math.max(2, Math.min(64, Number(teamCount || 0)))
  var entries = Array.from({ length: size }, function(_, index) { return index + 1 })
  if (entries.length % 2 === 1) entries.push(null)
  var rounds = []
  var count = entries.length
  for (var roundIndex = 0; roundIndex < count - 1; roundIndex += 1) {
    var pairings = []
    for (var pairIndex = 0; pairIndex < count / 2; pairIndex += 1) {
      var home = entries[pairIndex]
      var away = entries[count - 1 - pairIndex]
      if (!home || !away) continue
      if ((roundIndex + pairIndex) % 2 === 1) {
        var swap = home
        home = away
        away = swap
      }
      pairings.push([home, away])
    }
    rounds.push(pairings)
    entries = [entries[0], entries[count - 1]].concat(entries.slice(1, count - 1))
  }
  if (String(loopType || 'single') === 'double') {
    var returnLegs = rounds.map(function(round) {
      return round.map(function(pair) { return [pair[1], pair[0]] })
    })
    rounds = rounds.concat(returnLegs)
  }
  return rounds
}

function standardRoundRobinTemplate(options) {
  options = options || {}
  var groupSizes = Array.isArray(options.groupSizes) && options.groupSizes.length
    ? options.groupSizes.map(Number)
    : Array.from({ length: Math.max(1, Number(options.groupCount || 1)) }, function() { return Number(options.teamsPerGroup || options.teamCount || 0) })
  var loopType = String(options.loopType || 'single') === 'double' ? 'double' : 'single'
  var stages = []
  groupSizes.forEach(function(size, groupIndex) {
    var code = String.fromCharCode(65 + groupIndex)
    standardRoundRobinRounds(size, loopType).forEach(function(pairings, roundIndex) {
      stages.push(roundRobinStage(code, pairings, roundIndex + 1))
    })
  })
  return {
    version: text(options.version || ('standard-rotation-' + loopType + '-v1')),
    source: text(options.source || '标准循环赛轮转法'),
    mode: 'standard_rotation',
    loopType: loopType,
    groupSizes: groupSizes,
    stages: stages
  }
}

function validatePairingTemplate(template) {
  if (!template || !Array.isArray(template.stages) || !template.stages.length) return { valid:false,error:'对阵模板为空' }
  if (template.stages.length > 256) return { valid:false,error:'对阵轮次过多' }
  var codes = new Set()
  var total = 0
  for (var stageIndex = 0; stageIndex < template.stages.length; stageIndex += 1) {
    var stage = template.stages[stageIndex] || {}
    var matches = Array.isArray(stage.matches) ? stage.matches : []
    if (!matches.length) return { valid:false,error:'第' + (stageIndex + 1) + '个轮次没有对阵' }
    var roundParticipants = new Set()
    for (var matchIndex = 0; matchIndex < matches.length; matchIndex += 1) {
      total += 1
      if (total > 1000) return { valid:false,error:'对阵场次过多' }
      var item = matches[matchIndex] || {}
      var code = text(item.code || item.matchCode || ('M' + total))
      if (codes.has(code)) return { valid:false,error:'对阵编号重复：' + code }
      codes.add(code)
      var home = text(item.home || item.homeRef)
      var away = text(item.away || item.awayRef)
      if (!home || !away) return { valid:false,error:'第' + (stageIndex + 1) + '轮存在未填完的对阵' }
      if (home === away) return { valid:false,error:'对阵双方不能相同：' + home }
      var groupRound = String(stage.phase || item.phase || '') === 'group'
      if (groupRound) {
        if (roundParticipants.has(home) || roundParticipants.has(away)) return { valid:false,error:'同一轮内同一签位不能参加多场比赛' }
        roundParticipants.add(home)
        roundParticipants.add(away)
      }
    }
  }
  return { valid:true,totalMatches:total }
}

function liyangYouthTemplate() {
  var stages = []
  ;[
    [[2, 5], [3, 4]], [[1, 5], [2, 3]], [[1, 4], [3, 5]], [[1, 3], [2, 4]], [[1, 2], [4, 5]]
  ].forEach(function(pairings, index) { stages.push(roundRobinStage('A', pairings, index + 1)) })
  ;[
    [[1, 4], [2, 3]], [[1, 3], [2, 4]], [[1, 2], [3, 4]]
  ].forEach(function(pairings, index) { stages.push(roundRobinStage('B', pairings, index + 1)) })
  stages.push({ name: '交叉排位赛', stageName: '淘汰与排位阶段', stageOrder: 2, phase: 'knockout', round: 1, matches: [
    { code: 'X1', home: { type: 'group_rank', groupName: 'A组', rank: 3 }, away: { type: 'group_rank', groupName: 'B组', rank: 4 }, phase: 'placement', roundName: '5–8名交叉排位赛', rankRange: '5-8名', stageName: '淘汰与排位阶段', stageOrder: 2 },
    { code: 'X2', home: { type: 'group_rank', groupName: 'A组', rank: 4 }, away: { type: 'group_rank', groupName: 'B组', rank: 3 }, phase: 'placement', roundName: '5–8名交叉排位赛', rankRange: '5-8名', stageName: '淘汰与排位阶段', stageOrder: 2 },
    { code: 'X3', home: { type: 'group_rank', groupName: 'A组', rank: 1 }, away: { type: 'group_rank', groupName: 'B组', rank: 2 }, roundName: '1–4名交叉淘汰赛', rankRange: '1-4名', stageName: '淘汰与排位阶段', stageOrder: 2 },
    { code: 'X4', home: { type: 'group_rank', groupName: 'A组', rank: 2 }, away: { type: 'group_rank', groupName: 'B组', rank: 1 }, roundName: '1–4名交叉淘汰赛', rankRange: '1-4名', stageName: '淘汰与排位阶段', stageOrder: 2 }
  ] })
  stages.push({ name: '最终排位赛', phase: 'placement', round: 2, matches: [
    { code: 'F7', home: 'X1负', away: 'X2负', roundName: '7–8名决赛', rankRange: '7-8名', stageName: '决赛与排位阶段', stageOrder: 3 },
    { code: 'F5', home: 'X1胜', away: 'X2胜', roundName: '5–6名决赛', rankRange: '5-6名', stageName: '决赛与排位阶段', stageOrder: 3 },
    { code: 'F3', home: 'X3负', away: 'X4负', roundName: '三四名决赛', rankRange: '3-4名', stageName: '决赛与排位阶段', stageOrder: 3 },
    { code: 'F1', home: 'X3胜', away: 'X4胜', phase: 'knockout', roundName: '决赛', rankRange: '1-2名', stageName: '决赛与排位阶段', stageOrder: 3 }
  ] })
  return { version: 'liyang-youth-v2', source: '2026立洋杯青年组对阵模板', stages: stages }
}

function liyangMiddleTemplate() {
  var rounds = [
    [[2, 7], [3, 6], [4, 5]], [[1, 7], [2, 5], [3, 4]], [[1, 6], [5, 7], [2, 3]],
    [[1, 5], [4, 6], [3, 7]], [[1, 4], [3, 5], [2, 6]], [[1, 3], [2, 4], [6, 7]], [[1, 2], [4, 7], [5, 6]]
  ]
  return { version: 'liyang-middle-v1', source: '2026立洋杯中年组对阵模板', stages: rounds.map(function(pairings, index) { return roundRobinStage('A', pairings, index + 1) }) }
}

function liyangOldTemplate() {
  var rounds = [[[1, 4], [2, 3]], [[1, 3], [4, 2]], [[1, 2], [3, 4]]]
  return { version: 'liyang-old-v1', source: '2026立洋杯老年组对阵模板', stages: rounds.map(function(pairings, index) { return roundRobinStage('A', pairings, index + 1) }) }
}

function resolveTemplate(key) {
  var normalized = text(key).toLowerCase()
  if (normalized === 'liyang-youth' || normalized === 'liyang-youth-v1' || normalized === 'liyang-youth-v2') return liyangYouthTemplate()
  if (normalized === 'liyang-middle' || normalized === 'liyang-middle-v1') return liyangMiddleTemplate()
  if (normalized === 'liyang-old' || normalized === 'liyang-old-v1') return liyangOldTemplate()
  return null
}

module.exports = { buildPairingsFromTemplate, sourceLabel, resolveTemplate, liyangYouthTemplate, liyangMiddleTemplate, liyangOldTemplate, standardRoundRobinRounds, standardRoundRobinTemplate, validatePairingTemplate }
