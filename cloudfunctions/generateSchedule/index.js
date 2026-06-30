// 云函数入口文件 - 赛程生成（支持4种赛制）
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// ========== 工具函数 ==========

function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + d
}

function getRoundName(round, totalRounds) {
  if (round === totalRounds) return '决赛'
  if (round === totalRounds - 1) return '半决赛'
  if (round === totalRounds - 2) return '1/4决赛'
  if (round === totalRounds - 3) return '1/8决赛'
  if (round === totalRounds - 4) return '1/16决赛'
  return '第' + round + '轮'
}

// 统一获取 timeSlots（兼容 timeslots / timeSlots 两种写法）
function getTimeSlots(sc) {
  if (!sc) return []
  var slots = sc.timeSlots || sc.timeslots || []
  return Array.isArray(slots) ? slots : []
}

// 分配日期时间场地
function assignDateTimeVenue(matches, scheduleConfig, cupMode) {
  var timeSlots = getTimeSlots(scheduleConfig)
  if (!scheduleConfig || timeSlots.length === 0) return

  var startDate = new Date(scheduleConfig.startDate)
  var venues = scheduleConfig.venues || ['1号场地']

  // 两回合制：把比赛分成主客场两场
  if (cupMode === 'two-leg') {
    var twoLegMatches = []
    for (var i = 0; i < matches.length; i++) {
      var m = matches[i]
      if (m.isBye) {
        twoLegMatches.push(m)
        continue
      }
      // 第一回合
      var first = Object.assign({}, m, { _twoLeg: 'first', _twoLegId: m.matchIndex || i })
      twoLegMatches.push(first)
      // 第二回合（日期+3天，主客对调）
      var second = Object.assign({}, m, { _twoLeg: 'second', _twoLegId: m.matchIndex || i })
      var tmpHome = second.homeTeamId
      second.homeTeamId = second.awayTeamId
      second.homeTeamName = m.awayTeamName
      second.awayTeamId = tmpHome
      second.awayTeamName = m.homeTeamName
      twoLegMatches.push(second)
    }
    matches = twoLegMatches
  }

  var currentDate = new Date(startDate)
  var venueIndex = 0
  var timeIndex = 0

  for (var i = 0; i < matches.length; i++) {
    var match = matches[i]
    if (match.isBye) continue

    var d = new Date(currentDate)
    if (cupMode === 'two-leg' && match._twoLeg === 'second') {
      d.setDate(d.getDate() + 3)
    }

    match.matchDate = formatDate(d)
    match.matchTime = timeSlots[timeIndex] || '09:00'
    match.venue = venues[venueIndex] || '1号场地'

    venueIndex++
    if (venueIndex >= venues.length) {
      venueIndex = 0
      timeIndex++
      if (timeIndex >= timeSlots.length) {
        timeIndex = 0
        if (cupMode !== 'two-leg' || (cupMode === 'two-leg' && match._twoLeg === 'second')) {
          currentDate.setDate(currentDate.getDate() + 1)
        }
      }
    }
  }
}

// ========== 赛会制: 小组赛+淘汰赛 ==========

function generateTournamentSchedule(tournamentId, groups, tournamentConfig, scheduleConfig) {
  var matches = []

  // 小组赛(单循环)
  for (var g = 0; g < groups.length; g++) {
    var groupName = groups[g].groupName || groups[g].name || ('第' + (g + 1) + '组')
    var teams = groups[g].teams || []

    if (!teams.length) continue

    for (var i = 0; i < teams.length; i++) {
      for (var j = i + 1; j < teams.length; j++) {
        matches.push({
          tournamentId: tournamentId,
          scheduleType: 'tournament',
          phase: 'group',
          group: groupName,
          roundName: '小组赛 ' + groupName,
          homeTeamId: teams[i].teamId,
          homeTeamName: teams[i].teamName || teams[i].name || '',
          awayTeamId: teams[j].teamId,
          awayTeamName: teams[j].teamName || teams[j].name || '',
          homeScore: 0,
          awayScore: 0,
          status: 'scheduled',
          statusText: '未开始',
          isBye: false,
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        })
      }
    }
  }

  // 淘汰赛(交叉淘汰)
  var advancePerGroup = tournamentConfig.advanceCount || 2
  var knockoutTeams = groups.length * advancePerGroup
  if (knockoutTeams >= 2) {
    var knockoutRounds = Math.ceil(Math.log2(knockoutTeams))
    var koMatchIndex = 0
    for (var r = knockoutRounds; r >= 1; r--) {
      var matchCount = Math.pow(2, r - 1)
      for (var m = 0; m < matchCount; m++) {
        koMatchIndex++
        matches.push({
          tournamentId: tournamentId,
          scheduleType: 'tournament',
          phase: 'knockout',
          round: r,
          roundName: '淘汰赛 ' + getRoundName(r, knockoutRounds),
          homeTeamId: null,
          homeTeamName: '待定',
          awayTeamId: null,
          awayTeamName: '待定',
          homeScore: 0,
          awayScore: 0,
          status: 'scheduled',
          statusText: '待定',
          isBye: false,
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        })
      }
    }

    // 三四名决赛
    if (tournamentConfig.hasThirdPlace) {
      matches.push({
        tournamentId: tournamentId,
        scheduleType: 'tournament',
        phase: 'knockout',
        roundName: '三四名决赛',
        homeTeamId: null,
        homeTeamName: '待定',
        awayTeamId: null,
        awayTeamName: '待定',
        homeScore: 0,
        awayScore: 0,
        status: 'scheduled',
        statusText: '待定',
        isBye: false,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      })
    }
  }

  assignDateTimeVenue(matches, scheduleConfig, '')
  return matches
}

// ========== 杯赛制: 单场淘汰 ==========

function generateCupSchedule(tournamentId, allTeams, cupConfig, scheduleConfig) {
  var bracketSize = cupConfig.bracketSize || 16
  var rounds = Math.log2(bracketSize)
  var byeCount = bracketSize - allTeams.length

  var matches = []
  var teamIdx = 0
  var matchIdx = 0

  // 首轮
  var firstRoundCount = Math.pow(2, rounds - 1)
  for (var i = 0; i < firstRoundCount; i++) {
    matchIdx++
    var homeTeam = teamIdx < allTeams.length ? allTeams[teamIdx] : null
    teamIdx++
    var awayTeam = teamIdx < allTeams.length ? allTeams[teamIdx] : null
    teamIdx++

    matches.push({
      tournamentId: tournamentId,
      scheduleType: 'cup',
      phase: 'knockout',
      round: 1,
      roundName: getRoundName(1, rounds),
      matchIndex: matchIdx,
      homeTeamId: homeTeam ? homeTeam.teamId : null,
      homeTeamName: homeTeam ? (homeTeam.teamName || homeTeam.name || '') : '待定',
      awayTeamId: awayTeam ? awayTeam.teamId : null,
      awayTeamName: awayTeam ? (awayTeam.teamName || awayTeam.name || '') : '轮空',
      isBye: !awayTeam,
      homeScore: 0,
      awayScore: 0,
      status: awayTeam ? 'scheduled' : 'bye',
      statusText: awayTeam ? '未开始' : '轮空',
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    })
  }

  // 后续轮次
  for (var r = 2; r <= rounds; r++) {
    var matchCount = Math.pow(2, rounds - r)
    for (var m = 0; m < matchCount; m++) {
      matchIdx++
      matches.push({
        tournamentId: tournamentId,
        scheduleType: 'cup',
        phase: 'knockout',
        round: r,
        roundName: getRoundName(r, rounds),
        matchIndex: matchIdx,
        homeTeamId: null,
        homeTeamName: '待定',
        awayTeamId: null,
        awayTeamName: '待定',
        isBye: false,
        homeScore: 0,
        awayScore: 0,
        status: 'scheduled',
        statusText: '待定',
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      })
    }
  }

  // 三四名决赛
  if (cupConfig.hasThirdPlace) {
    matchIdx++
    matches.push({
      tournamentId: tournamentId,
      scheduleType: 'cup',
      phase: 'knockout',
      roundName: '三四名决赛',
      matchIndex: matchIdx,
      homeTeamId: null,
      homeTeamName: '待定',
      awayTeamId: null,
      awayTeamName: '待定',
      isBye: false,
      homeScore: 0,
      awayScore: 0,
      status: 'scheduled',
      statusText: '待定',
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    })
  }

  assignDateTimeVenue(matches, scheduleConfig, cupConfig.cupMode || '')
  return matches
}

// ========== 联赛制: 单/双循环 ==========

function generateLeagueSchedule(tournamentId, ranking, leagueConfig, scheduleConfig) {
  var matches = []
  var teams = ranking.map(function(r) { return r.team }).filter(Boolean)
  var loopCount = leagueConfig.loopType === 'double' ? 2 : 1
  var matchIdx = 0

  for (var loop = 0; loop < loopCount; loop++) {
    var loopLabel = loopCount === 2 ? (loop === 0 ? '第1轮' : '第2轮') : ''
    for (var i = 0; i < teams.length; i++) {
      for (var j = i + 1; j < teams.length; j++) {
        matchIdx++
        if (loopCount === 2 && loop === 1) {
          // 双循环第二轮: 主客对调
          matches.push({
            tournamentId: tournamentId,
            scheduleType: 'league',
            phase: 'league',
            roundName: '联赛 ' + loopLabel,
            matchIndex: matchIdx,
            homeTeamId: teams[j].teamId,
            homeTeamName: teams[j].teamName || teams[j].name || '',
            awayTeamId: teams[i].teamId,
            awayTeamName: teams[i].teamName || teams[i].name || '',
            homeScore: 0,
            awayScore: 0,
            status: 'scheduled',
            statusText: '未开始',
            isBye: false,
            createTime: db.serverDate(),
            updateTime: db.serverDate()
          })
        } else {
          matches.push({
            tournamentId: tournamentId,
            scheduleType: 'league',
            phase: 'league',
            roundName: loopCount === 2 ? '联赛 ' + loopLabel : '联赛',
            matchIndex: matchIdx,
            homeTeamId: teams[i].teamId,
            homeTeamName: teams[i].teamName || teams[i].name || '',
            awayTeamId: teams[j].teamId,
            awayTeamName: teams[j].teamName || teams[j].name || '',
            homeScore: 0,
            awayScore: 0,
            status: 'scheduled',
            statusText: '未开始',
            isBye: false,
            createTime: db.serverDate(),
            updateTime: db.serverDate()
          })
        }
      }
    }
  }

  assignDateTimeVenue(matches, scheduleConfig, '')
  return matches
}

// ========== 复合制: 联赛阶段+杯赛阶段 ==========

function generateCombinedSchedule(tournamentId, params, scheduleConfig) {
  var matches = []
  var combinedConfig = params.combinedConfig || {}
  var matchIdx = 0

  // 联赛阶段
  if (combinedConfig.useGroups && params.groups && params.groups.length > 0) {
    // 有分组的联赛阶段
    var loopCount = combinedConfig.leagueLoopType === 'double' ? 2 : 1
    for (var loop = 0; loop < loopCount; loop++) {
      var loopLabel = loopCount === 2 ? (loop === 0 ? '第1轮' : '第2轮') : ''
      for (var g = 0; g < params.groups.length; g++) {
        var groupName = params.groups[g].groupName || params.groups[g].name || ('第' + (g + 1) + '组')
        var teams = params.groups[g].teams || []
        for (var i = 0; i < teams.length; i++) {
          for (var j = i + 1; j < teams.length; j++) {
            matchIdx++
            var home = loopCount === 2 && loop === 1 ? teams[j] : teams[i]
            var away = loopCount === 2 && loop === 1 ? teams[i] : teams[j]
            matches.push({
              tournamentId: tournamentId,
              scheduleType: 'combined',
              phase: 'league',
              group: groupName,
              roundName: '联赛阶段 ' + groupName + (loopLabel ? ' ' + loopLabel : ''),
              matchIndex: matchIdx,
              homeTeamId: home.teamId,
              homeTeamName: home.teamName || home.name || '',
              awayTeamId: away.teamId,
              awayTeamName: away.teamName || away.name || '',
              homeScore: 0,
              awayScore: 0,
              status: 'scheduled',
              statusText: '未开始',
              isBye: false,
              createTime: db.serverDate(),
              updateTime: db.serverDate()
            })
          }
        }
      }
    }
  } else if (params.ranking && params.ranking.length > 0) {
    // 不分组的联赛阶段
    var teams = params.ranking.map(function(r) { return r.team }).filter(Boolean)
    var loopCount2 = combinedConfig.leagueLoopType === 'double' ? 2 : 1
    for (var loop = 0; loop < loopCount2; loop++) {
      var loopLabel2 = loopCount2 === 2 ? (loop === 0 ? '第1轮' : '第2轮') : ''
      for (var i = 0; i < teams.length; i++) {
        for (var j = i + 1; j < teams.length; j++) {
          matchIdx++
          var home = loopCount2 === 2 && loop === 1 ? teams[j] : teams[i]
          var away = loopCount2 === 2 && loop === 1 ? teams[i] : teams[j]
          matches.push({
            tournamentId: tournamentId,
            scheduleType: 'combined',
            phase: 'league',
            roundName: '联赛阶段' + (loopLabel2 ? ' ' + loopLabel2 : ''),
            matchIndex: matchIdx,
            homeTeamId: home.teamId,
            homeTeamName: home.teamName || home.name || '',
            awayTeamId: away.teamId,
            awayTeamName: away.teamName || away.name || '',
            homeScore: 0,
            awayScore: 0,
            status: 'scheduled',
            statusText: '未开始',
            isBye: false,
            createTime: db.serverDate(),
            updateTime: db.serverDate()
          })
        }
      }
    }
  }

  // 杯赛阶段(淘汰赛)
  var cupTeams = combinedConfig.cupAdvanceCount || 4
  if (cupTeams >= 2) {
    var cupRounds = Math.ceil(Math.log2(cupTeams))
    for (var r = cupRounds; r >= 1; r--) {
      var matchCount = Math.pow(2, r - 1)
      for (var m = 0; m < matchCount; m++) {
        matchIdx++
        matches.push({
          tournamentId: tournamentId,
          scheduleType: 'combined',
          phase: 'cup',
          round: r,
          roundName: '杯赛阶段 ' + getRoundName(r, cupRounds),
          matchIndex: matchIdx,
          homeTeamId: null,
          homeTeamName: '待定',
          awayTeamId: null,
          awayTeamName: '待定',
          homeScore: 0,
          awayScore: 0,
          status: 'scheduled',
          statusText: '待定',
          isBye: false,
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        })
      }
    }
  }

  assignDateTimeVenue(matches, scheduleConfig, '')
  return matches
}

// ========== 数据加载辅助函数 ==========

// 从 tournament_groups 加载赛会制分组数据（兼容多种存储格式）
async function loadTournamentGroups(tournamentId) {
  var res = await db.collection('tournament_groups').where({ tournamentId: tournamentId }).get()
  var list = res.data || []

  if (list.length === 0) return { groups: [], tournamentConfig: null }

  // 先尝试找汇总记录（有 groups 数组字段）
  var summary = list.find(function(item) {
    return Array.isArray(item.groups) && item.groups.length > 0
  })
  if (summary) {
    return {
      groups: summary.groups,
      tournamentConfig: summary.tournamentConfig || { advanceCount: 2, hasThirdPlace: true }
    }
  }

  // 否则是 TournamentDraw.vue 保存的单条小组记录，需要组装
  var groups = list
    .filter(function(item) { return item.groupName || item.groupCode })
    .map(function(item) {
      return {
        groupName: item.groupName || item.groupCode + '组',
        name: item.groupName || item.groupCode + '组',
        teams: (item.teams || []).map(function(t) {
          return {
            teamId: t.teamId,
            teamName: t.teamName || t.name || ''
          }
        })
      }
    })
    .filter(function(g) { return g.teams.length > 0 })

  return {
    groups: groups,
    tournamentConfig: { advanceCount: 2, hasThirdPlace: true }
  }
}

// 从 tournament_bracket 加载杯赛制对阵数据
async function loadCupBracket(tournamentId) {
  var res = await db.collection('tournament_bracket').where({ tournamentId: tournamentId }).orderBy('round', 'asc').get()
  var list = res.data || []
  if (list.length === 0) return { allTeams: [], cupConfig: { bracketSize: 16, hasThirdPlace: true, cupMode: 'single' } }

  // 收集所有已分配的球队
  var teamMap = {}
  list.forEach(function(round) {
    (round.matches || []).forEach(function(m) {
      if (m.slot1 && m.slot1.teamId) {
        teamMap[m.slot1.teamId] = { teamId: m.slot1.teamId, teamName: m.slot1.teamName || m.slot1.name || '' }
      }
      if (m.slot2 && m.slot2.teamId) {
        teamMap[m.slot2.teamId] = { teamId: m.slot2.teamId, teamName: m.slot2.teamName || m.slot2.name || '' }
      }
    })
  })

  var allTeams = Object.values(teamMap)

  // 从第一条记录找 bracketSize（如果没有，根据球队数推算最近的2的幂）
  var bracketSize = list[0].bracketSize || 16
  if (!bracketSize) {
    var teamCount = allTeams.length
    bracketSize = 1
    while (bracketSize < teamCount) bracketSize *= 2
    if (bracketSize < 4) bracketSize = 4
  }

  var cupConfig = {
    bracketSize: bracketSize,
    hasThirdPlace: list[0].hasThirdPlace !== false,
    cupMode: list[0].cupMode || 'single'
  }

  return { allTeams: allTeams, cupConfig: cupConfig }
}

// 从 tournament_league_tables 加载联赛制数据
async function loadLeagueData(tournamentId) {
  var res = await db.collection('tournament_league_tables').where({ tournamentId: tournamentId }).get()
  var list = res.data || []
  if (list.length === 0) return { ranking: [], leagueConfig: { loopType: 'single' } }

  var ranking = []
  list.forEach(function(table) {
    (table.teams || []).forEach(function(t, index) {
      ranking.push({
        rank: t.position || t.rank || (index + 1),
        team: {
          teamId: t.teamId,
          teamName: t.teamName || t.name || ''
        }
      })
    })
  })

  var leagueConfig = { loopType: list[0].loopType || 'single' }

  return { ranking: ranking, leagueConfig: leagueConfig }
}

// ========== 云函数入口 ==========

exports.main = async (event, context) => {
  var tournamentId = event.tournamentId
  var scheduleType = event.scheduleType || ''
  var scheduleConfig = event.scheduleConfig || {}

  if (!tournamentId) {
    return { success: false, message: '缺少必要参数' }
  }

  // 读取赛事信息，补全 scheduleType
  try {
    var tournamentRes = await db.collection('tournaments').doc(tournamentId).get()
    var tournament = tournamentRes.data[0] || {}
    if (!scheduleType) {
      scheduleType = tournament.tournamentType || tournament.format || 'tournament'
    }
    // 保存配置到赛事记录
    var updateData = {
      scheduleType: scheduleType,
      scheduleGenerated: true,
      updateTime: db.serverDate()
    }
    if (scheduleConfig.startDate) updateData.startDate = scheduleConfig.startDate
    if (Object.keys(scheduleConfig).length > 0) updateData.scheduleConfig = scheduleConfig
    await db.collection('tournaments').doc(tournamentId).update({ data: updateData })
  } catch (e) {
    console.warn('读取/更新赛事信息失败', e)
  }

  try {
    console.log('开始生成赛程:', scheduleType)

    // 删除旧赛程
    var oldMatches = await db.collection('matches').where({ tournamentId: tournamentId }).get()
    if (oldMatches.data.length > 0) {
      var deletePromises = oldMatches.data.map(function(m) {
        return db.collection('matches').doc(m._id).remove()
      })
      await Promise.all(deletePromises)
      console.log('删除旧赛程:', oldMatches.data.length, '场')
    }

    // 按赛制生成
    var matches = []

    if (scheduleType === 'tournament') {
      // 赛会制
      var tg = event.groups && event.groups.length > 0
        ? { groups: event.groups, tournamentConfig: event.tournamentConfig }
        : await loadTournamentGroups(tournamentId)
      var groups = tg.groups || []
      var tournamentConfig = tg.tournamentConfig || event.tournamentConfig || { advanceCount: 2, hasThirdPlace: true }
      if (groups.length === 0) {
        return { success: false, message: '未找到分组数据，请先在抽签分组页面完成分组并保存' }
      }
      // 校验每个分组的 teams 是否为数组
      var hasInvalid = groups.some(function(g) { return !Array.isArray(g.teams) })
      if (hasInvalid) {
        return { success: false, message: '分组数据格式异常，请重新保存抽签分组' }
      }
      matches = generateTournamentSchedule(tournamentId, groups, tournamentConfig, scheduleConfig)

    } else if (scheduleType === 'cup') {
      // 杯赛制
      var cupData = (event.upperHalf && event.upperHalf.length > 0) || (event.lowerHalf && event.lowerHalf.length > 0)
        ? {
            allTeams: (event.upperHalf || []).concat(event.lowerHalf || []),
            cupConfig: event.cupConfig || { bracketSize: 16, hasThirdPlace: true, cupMode: 'single' }
          }
        : await loadCupBracket(tournamentId)
      var allTeams = cupData.allTeams || []
      var cupConfig = cupData.cupConfig || event.cupConfig || { bracketSize: 16, hasThirdPlace: true, cupMode: 'single' }
      if (allTeams.length === 0) {
        return { success: false, message: '未找到淘汰赛对阵数据，请先在抽签分组页面完成对阵分配并保存' }
      }
      matches = generateCupSchedule(tournamentId, allTeams, cupConfig, scheduleConfig)

    } else if (scheduleType === 'league') {
      // 联赛制
      var lg = (event.ranking && event.ranking.length > 0)
        ? { ranking: event.ranking, leagueConfig: event.leagueConfig }
        : await loadLeagueData(tournamentId)
      var ranking = lg.ranking || []
      var leagueConfig = lg.leagueConfig || event.leagueConfig || { loopType: 'single' }
      if (ranking.length === 0) {
        return { success: false, message: '未找到联赛球队数据，请先在抽签分组页面完成球队分配并保存' }
      }
      matches = generateLeagueSchedule(tournamentId, ranking, leagueConfig, scheduleConfig)

    } else if (scheduleType === 'combined') {
      // 复合制：先尝试拿 league + cup 的数据
      var leagueData = await loadLeagueData(tournamentId)
      var cupData2 = await loadCupBracket(tournamentId)
      var combinedConfig = event.combinedConfig || { useGroups: false, leagueLoopType: 'single', cupAdvanceCount: 4 }
      var params = {
        groups: event.groups || (leagueData.ranking.length > 0 ? [] : []),
        ranking: event.ranking || leagueData.ranking || [],
        combinedConfig: combinedConfig
      }
      matches = generateCombinedSchedule(tournamentId, params, scheduleConfig)
    }

    // 批量插入
    if (matches.length === 0) {
      return { success: false, message: '未生成任何比赛，请检查配置' }
    }

    var insertPromises = matches.map(function(match) {
      return db.collection('matches').add({ data: match })
    })
    await Promise.all(insertPromises)

    // 保存汇总记录到 tournament_groups（供下次快速读取）
    var summaryData = {
      tournamentId: tournamentId,
      scheduleType: scheduleType,
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }
    if (scheduleType === 'tournament') {
      summaryData.groups = event.groups
      summaryData.tournamentConfig = event.tournamentConfig
    } else if (scheduleType === 'cup') {
      summaryData.allTeams = (event.upperHalf || []).concat(event.lowerHalf || [])
      summaryData.cupConfig = event.cupConfig
    } else if (scheduleType === 'league') {
      summaryData.ranking = event.ranking
      summaryData.leagueConfig = event.leagueConfig
    } else if (scheduleType === 'combined') {
      summaryData.combinedConfig = event.combinedConfig
      summaryData.groups = event.groups
      summaryData.ranking = event.ranking
    }

    // 删除旧的汇总记录（有 scheduleType 字段的即为汇总记录），插入新的
    var oldSummary = await db.collection('tournament_groups').where({ tournamentId: tournamentId, scheduleType: scheduleType }).get()
    if (oldSummary.data.length > 0) {
      await Promise.all(oldSummary.data.map(function(g) {
        return db.collection('tournament_groups').doc(g._id).remove()
      }))
    }
    await db.collection('tournament_groups').add({ data: summaryData })

    // 更新赛事状态
    await db.collection('tournaments').doc(tournamentId).update({
      data: {
        status: 'ongoing',
        scheduleGenerated: true,
        scheduleType: scheduleType,
        updateTime: db.serverDate()
      }
    })

    console.log('赛程生成成功:', matches.length, '场')

    return {
      success: true,
      message: '成功生成 ' + matches.length + ' 场比赛',
      matchCount: matches.length,
      matches: matches
    }
  } catch (err) {
    console.error('生成赛程失败:', err)
    return {
      success: false,
      message: '生成失败: ' + (err.message || String(err)),
      error: err.stack || String(err)
    }
  }
}
