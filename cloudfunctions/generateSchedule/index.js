// 云函数入口文件 - 赛程生成（支持4种赛制）
const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex')
}

function recordBelongsToActor(record, actor) {
  if (!record || !actor) return false
  if (record.orgId && String(record.orgId) === String(actor.orgId)) return true
  var ids = [actor.user._id, actor.user.uid, actor.user.userId].filter(Boolean)
  if (['creatorId', 'organizerId', 'ownerId', 'userId', 'createdBy']
    .some(function(field) { return record[field] && ids.indexOf(record[field]) >= 0 })) return true
  var phones = [actor.user.phone, actor.user.phoneNumber].filter(Boolean)
  return phones.length > 0 && ['creatorPhone', 'organizerPhone', 'ownerPhone', 'contactPhone', 'phoneNumber', 'phone']
    .some(function(field) { return record[field] && phones.indexOf(record[field]) >= 0 })
}

async function authenticateActor(event) {
  var token = String(event && event.__authToken || '').trim()
  if (!token) throw new Error('登录会话已失效，请重新登录')
  var _ = db.command
  var sessionResult = await db.collection('auth_sessions').where({
    tokenHash: hashSessionToken(token),
    active: true,
    expiresAt: _.gt(new Date())
  }).limit(2).get()
  var sessions = sessionResult.data || []
  if (sessions.length !== 1) throw new Error('登录会话已失效，请重新登录')
  var userResult = await db.collection('users').doc(sessions[0].userId).get()
  var user = Array.isArray(userResult.data) ? userResult.data[0] : userResult.data
  if (!user) throw new Error('登录账号不存在')
  var orgId = String(user.orgId || user._id)
  if (event.__actorUserId && event.__actorUserId !== user._id) throw new Error('登录身份校验失败')
  if (event.__actorOrgId && String(event.__actorOrgId) !== orgId) throw new Error('机构归属校验失败')
  if (!user.orgId) {
    await db.collection('users').doc(user._id).update({ data: { orgId: orgId, updateTime: db.serverDate() } })
  }
  return { user: Object.assign({}, user, { orgId: orgId }), orgId: orgId }
}

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
  if (!Array.isArray(slots)) return []
  return slots.slice().sort(function(a, b) {
    return String(a || '').localeCompare(String(b || ''))
  })
}

// 标准循环赛轮转法：每轮每支球队最多参加一场比赛
function buildRoundRobinRounds(sourceTeams) {
  var teams = (sourceTeams || []).slice()
  if (teams.length < 2) return []
  if (teams.length % 2 === 1) teams.push(null)

  var rounds = []
  var teamCount = teams.length
  for (var roundIndex = 0; roundIndex < teamCount - 1; roundIndex++) {
    var pairings = []
    for (var pairIndex = 0; pairIndex < teamCount / 2; pairIndex++) {
      var home = teams[pairIndex]
      var away = teams[teamCount - 1 - pairIndex]
      if (!home || !away) continue

      // 交替主客场，避免固定球队长期连续主场或客场
      if ((roundIndex + pairIndex) % 2 === 1) {
        var temp = home
        home = away
        away = temp
      }
      pairings.push({ home: home, away: away })
    }
    rounds.push(pairings)

    // 固定第一支球队，其余球队顺时针轮转
    var fixed = teams[0]
    var rotating = teams.slice(1)
    rotating.unshift(rotating.pop())
    teams = [fixed].concat(rotating)
  }
  return rounds
}

function roundScheduleKey(match) {
  var phase = match.phase || match.scheduleType || 'other'
  var round = match.scheduleRound != null
    ? String(match.scheduleRound)
    : (match.round != null ? String(match.round) : (match.roundName || 'other'))
  return phase + ':' + round
}

function isKnockoutMatch(match) {
  var phase = match && (match.phase || match.scheduleType || '')
  return phase === 'knockout' || phase === 'cup'
}

function compareScheduleOrderWithinRound(a, b) {
  if (!!a.isThirdPlace !== !!b.isThirdPlace) return a.isThirdPlace ? -1 : 1
  return Number(a.matchIndex || 0) - Number(b.matchIndex || 0)
}

function shouldStartRoundOnNewDay(previousMatches, currentMatches) {
  if (!previousMatches || !currentMatches || currentMatches.length === 0) return false
  if (!currentMatches.some(isKnockoutMatch)) return false
  return roundScheduleKey(previousMatches[0]) !== roundScheduleKey(currentMatches[0])
}

function normalizeVenueList(venues) {
  var list = Array.isArray(venues) ? venues : []
  var normalized = []
  var seen = new Set()
  for (var i = 0; i < list.length; i++) {
    var venue = String(list[i] || '').trim()
    if (!venue || seen.has(venue)) continue
    seen.add(venue)
    normalized.push(venue)
  }
  return normalized.length > 0 ? normalized : ['1号场地']
}

function scheduleSlotKey(matchDate, matchTime, venue) {
  return String(matchDate || '').trim() + '|' + String(matchTime || '').trim() + '|' + String(venue || '').trim()
}

function isOccupyingMatch(match) {
  return match && !match.isBye && match.status !== 'cancelled' && match.matchDate && match.matchTime && match.venue
}

function buildOccupiedSlotSet(matches) {
  var occupied = new Set()
  ;(matches || []).forEach(function(match) {
    if (isOccupyingMatch(match)) {
      occupied.add(scheduleSlotKey(match.matchDate, match.matchTime, match.venue))
    }
  })
  return occupied
}

function reserveScheduleSlot(occupiedSlots, matchDate, matchTime, venue) {
  var key = scheduleSlotKey(matchDate, matchTime, venue)
  if (occupiedSlots.has(key)) return false
  occupiedSlots.add(key)
  return true
}

function getDailyMatchLimit(scheduleConfig) {
  var value = Math.floor(Number(scheduleConfig && scheduleConfig.dailyMatchLimit || 0))
  return Number.isFinite(value) && value > 0 ? value : 0
}

function hasReachedDailyLimit(dailyCounts, matchDate, dailyLimit) {
  return dailyLimit > 0 && (dailyCounts.get(matchDate) || 0) >= dailyLimit
}

function recordDailyMatch(dailyCounts, matchDate) {
  dailyCounts.set(matchDate, (dailyCounts.get(matchDate) || 0) + 1)
}

// 保留轮次顺序，但以“时间 × 场地”的可用容量为主连续排赛，排不完自动顺延到下一天。
function assignDateTimeByRound(matches, startDate, venues, timeSlots, scheduleConfig, occupiedSlots) {
  var roundGroups = []
  var roundMap = {}
  occupiedSlots = occupiedSlots || new Set()
  var dailyLimit = getDailyMatchLimit(scheduleConfig)
  var dailyCounts = new Map()

  for (var i = 0; i < matches.length; i++) {
    var match = matches[i]
    if (match.isBye) continue
    var key = roundScheduleKey(match)
    if (!roundMap[key]) {
      roundMap[key] = []
      roundGroups.push(roundMap[key])
    }
    roundMap[key].push(match)
  }

  var slotsPerDay = venues.length * timeSlots.length
  var slotCursor = 0
  for (var roundIndex = 0; roundIndex < roundGroups.length; roundIndex++) {
    var roundMatches = roundGroups[roundIndex]
    var previousRoundMatches = roundIndex > 0 ? roundGroups[roundIndex - 1] : null
    if (shouldStartRoundOnNewDay(previousRoundMatches, roundMatches) && slotCursor % slotsPerDay !== 0) {
      slotCursor = (Math.floor(slotCursor / slotsPerDay) + 1) * slotsPerDay
    }
    roundMatches.sort(compareScheduleOrderWithinRound)
    for (var matchIndex = 0; matchIndex < roundMatches.length; matchIndex++) {
      var currentMatch = roundMatches[matchIndex]
      var assigned = false
      while (!assigned) {
        var dayOffset = Math.floor(slotCursor / slotsPerDay)
        var slotWithinDay = slotCursor % slotsPerDay
        var timeIndex = Math.floor(slotWithinDay / venues.length)
        var venueIndex = slotWithinDay % venues.length
        var matchDate = new Date(startDate)
        matchDate.setDate(matchDate.getDate() + dayOffset)
        var matchDateText = formatDate(matchDate)
        var matchTime = timeSlots[timeIndex]
        var venue = venues[venueIndex]
        slotCursor++

        if (hasReachedDailyLimit(dailyCounts, matchDateText, dailyLimit)) {
          slotCursor = (dayOffset + 1) * slotsPerDay
          continue
        }
        if (!reserveScheduleSlot(occupiedSlots, matchDateText, matchTime, venue)) continue
        currentMatch.matchDate = matchDateText
        currentMatch.matchTime = matchTime
        currentMatch.venue = venue
        recordDailyMatch(dailyCounts, matchDateText)
        assigned = true
      }
    }
  }
}

// 分配日期时间场地
function assignDateTimeVenue(matches, scheduleConfig, cupMode, occupiedSlots) {
  var timeSlots = getTimeSlots(scheduleConfig)
  if (!scheduleConfig || timeSlots.length === 0) return

  var startDate = new Date(scheduleConfig.startDate)
  if (Number.isNaN(startDate.getTime())) throw new Error('请设置有效的比赛开始日期')
  var venues = normalizeVenueList(scheduleConfig.venues)
  occupiedSlots = occupiedSlots || new Set()
  var dailyLimit = getDailyMatchLimit(scheduleConfig)
  var dailyCounts = new Map()

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

  // 有真实轮次的数据保留轮次顺序，再连续填充场地和时段。
  if (matches.some(function(match) { return match.round != null })) {
    assignDateTimeByRound(matches, startDate, venues, timeSlots, scheduleConfig, occupiedSlots)
    return
  }

  var slotsPerDay = venues.length * timeSlots.length
  var slotCursor = 0

  for (var i = 0; i < matches.length; i++) {
    var match = matches[i]
    if (match.isBye) continue

    var assigned = false
    while (!assigned) {
      var baseDayOffset = Math.floor(slotCursor / slotsPerDay)
      var slotWithinDay = slotCursor % slotsPerDay
      var timeIndex = Math.floor(slotWithinDay / venues.length)
      var venueIndex = slotWithinDay % venues.length
      var dayOffset = baseDayOffset + (cupMode === 'two-leg' && match._twoLeg === 'second' ? 3 : 0)

      var d = new Date(startDate)
      d.setDate(d.getDate() + dayOffset)
      var matchDateText = formatDate(d)
      var matchTime = timeSlots[timeIndex]
      var venue = venues[venueIndex]
      slotCursor++

      if (hasReachedDailyLimit(dailyCounts, matchDateText, dailyLimit)) {
        slotCursor = (baseDayOffset + 1) * slotsPerDay
        continue
      }
      if (!reserveScheduleSlot(occupiedSlots, matchDateText, matchTime, venue)) continue
      match.matchDate = matchDateText
      match.matchTime = matchTime
      match.venue = venue
      recordDailyMatch(dailyCounts, matchDateText)
      assigned = true
    }
  }
}

// ========== 赛会制: 小组赛+淘汰赛 ==========

function generateTournamentSchedule(tournamentId, groups, tournamentConfig, scheduleConfig, occupiedSlots) {
  var matches = []

  // 小组赛（单循环）：先生成真实轮次，再按轮次依次排入赛程
  var groupSchedules = []
  var maxGroupRounds = 0
  for (var g = 0; g < groups.length; g++) {
    var groupName = groups[g].groupName || groups[g].name || ('第' + (g + 1) + '组')
    var teams = groups[g].teams || []
    if (!teams.length) continue
    var rounds = buildRoundRobinRounds(teams)
    groupSchedules.push({ groupName: groupName, rounds: rounds })
    if (rounds.length > maxGroupRounds) maxGroupRounds = rounds.length
  }

  var groupMatchIndex = 0
  for (var groupRoundIndex = 0; groupRoundIndex < maxGroupRounds; groupRoundIndex++) {
    for (var scheduleIndex = 0; scheduleIndex < groupSchedules.length; scheduleIndex++) {
      var groupSchedule = groupSchedules[scheduleIndex]
      var pairings = groupSchedule.rounds[groupRoundIndex] || []
      for (var pairingIndex = 0; pairingIndex < pairings.length; pairingIndex++) {
        var pairing = pairings[pairingIndex]
        groupMatchIndex++
        matches.push({
          tournamentId: tournamentId,
          scheduleType: 'tournament',
          phase: 'group',
          group: groupSchedule.groupName,
          round: groupRoundIndex + 1,
          roundName: '小组赛 ' + groupSchedule.groupName,
          matchIndex: groupMatchIndex,
          homeTeamId: pairing.home.teamId,
          homeTeamName: pairing.home.teamName || pairing.home.name || '',
          awayTeamId: pairing.away.teamId,
          awayTeamName: pairing.away.teamName || pairing.away.name || '',
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
    for (var r = 1; r <= knockoutRounds; r++) {
      var matchCount = Math.pow(2, knockoutRounds - r)
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
        scheduleRound: knockoutRounds,
        roundName: '三四名决赛',
        isThirdPlace: true,
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

  assignDateTimeVenue(matches, scheduleConfig, '', occupiedSlots)
  return matches
}

// ========== 杯赛制: 单场淘汰 ==========

function resolveBracketSize(teamCount, configuredSize) {
  var normalizedTeamCount = Math.max(0, Number(teamCount) || 0)
  var normalizedConfiguredSize = Number(configuredSize)
  var hasValidConfiguredSize = normalizedConfiguredSize >= 4 &&
    Number.isInteger(Math.log2(normalizedConfiguredSize)) &&
    normalizedConfiguredSize >= normalizedTeamCount

  if (hasValidConfiguredSize) return normalizedConfiguredSize

  var inferredSize = 4
  while (inferredSize < normalizedTeamCount) inferredSize *= 2
  return inferredSize
}

function generateCupSchedule(tournamentId, allTeams, cupConfig, scheduleConfig, occupiedSlots) {
  var bracketSize = resolveBracketSize(allTeams.length, cupConfig.bracketSize)
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
      scheduleRound: rounds,
      roundName: '三四名决赛',
      isThirdPlace: true,
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

  assignDateTimeVenue(matches, scheduleConfig, cupConfig.cupMode || '', occupiedSlots)
  return matches
}

// ========== 联赛制: 单/双循环 ==========

function generateLeagueSchedule(tournamentId, ranking, leagueConfig, scheduleConfig, occupiedSlots) {
  var matches = []
  var teams = ranking.map(function(r) { return r.team }).filter(Boolean)
  var loopCount = leagueConfig.loopType === 'double' ? 2 : 1
  var matchIdx = 0
  var rounds = buildRoundRobinRounds(teams)

  for (var loop = 0; loop < loopCount; loop++) {
    for (var roundIndex = 0; roundIndex < rounds.length; roundIndex++) {
      var roundNumber = loop * rounds.length + roundIndex + 1
      var pairings = rounds[roundIndex]
      for (var pairingIndex = 0; pairingIndex < pairings.length; pairingIndex++) {
        var home = pairings[pairingIndex].home
        var away = pairings[pairingIndex].away
        if (loop === 1) {
          var temp = home
          home = away
          away = temp
        }
        matchIdx++
        matches.push({
          tournamentId: tournamentId,
          scheduleType: 'league',
          phase: 'league',
          round: roundNumber,
          roundName: '联赛',
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

  assignDateTimeVenue(matches, scheduleConfig, '', occupiedSlots)
  return matches
}

// ========== 复合制: 联赛阶段+杯赛阶段 ==========

function generateCombinedSchedule(tournamentId, params, scheduleConfig, occupiedSlots) {
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

  assignDateTimeVenue(matches, scheduleConfig, '', occupiedSlots)
  return matches
}

// ========== 数据加载辅助函数 ==========

// 从 tournament_groups 加载赛会制分组数据（兼容多种存储格式）
function belongsToDivision(item, divisionId) {
  return (item.divisionId || 'default') === divisionId
}

async function loadAllTournamentMatches(tournamentId) {
  var pageSize = 100
  var offset = 0
  var allMatches = []
  while (true) {
    var result = await db.collection('matches')
      .where({ tournamentId: tournamentId })
      .skip(offset)
      .limit(pageSize)
      .get()
    var page = result.data || []
    allMatches = allMatches.concat(page)
    if (page.length < pageSize) break
    offset += page.length
  }
  return allMatches
}

function validateGeneratedSchedule(matches, occupiedSlots, dailyLimit) {
  var seen = new Set(occupiedSlots || [])
  var dailyCounts = new Map()
  var conflicts = []
  var missingAssignments = []
  var generatedDates = new Set()
  ;(matches || []).forEach(function(match) {
    if (match.isBye) return
    if (!match.matchDate || !match.matchTime || !match.venue) {
      missingAssignments.push(match)
      return
    }
    var key = scheduleSlotKey(match.matchDate, match.matchTime, match.venue)
    if (seen.has(key)) conflicts.push(key)
    else seen.add(key)
    recordDailyMatch(dailyCounts, match.matchDate)
    generatedDates.add(match.matchDate)
  })
  var dailyLimitExceeded = []
  if (dailyLimit > 0) {
    dailyCounts.forEach(function(count, matchDate) {
      if (generatedDates.has(matchDate) && count > dailyLimit) dailyLimitExceeded.push({ matchDate: matchDate, count: count })
    })
  }
  return {
    conflicts: conflicts,
    missingAssignments: missingAssignments,
    dailyLimitExceeded: dailyLimitExceeded
  }
}

async function loadTournamentGroups(tournamentId, divisionId) {
  var res = await db.collection('tournament_groups').where({ tournamentId: tournamentId }).get()
  var list = (res.data || []).filter(function(item) { return belongsToDivision(item, divisionId) })

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
async function loadCupBracket(tournamentId, divisionId) {
  var res = await db.collection('tournament_bracket').where({ tournamentId: tournamentId }).orderBy('round', 'asc').get()
  var list = (res.data || []).filter(function(item) { return belongsToDivision(item, divisionId) })
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

  // 新数据使用已保存的淘汰赛规模；旧数据缺少该字段时按实际球队数推算最近的 2 的幂。
  var bracketSize = resolveBracketSize(allTeams.length, list[0].bracketSize)

  var cupConfig = {
    bracketSize: bracketSize,
    hasThirdPlace: list[0].hasThirdPlace !== false,
    cupMode: list[0].cupMode || 'single'
  }

  return { allTeams: allTeams, cupConfig: cupConfig }
}

// 从 tournament_league_tables 加载联赛制数据
async function loadLeagueData(tournamentId, divisionId) {
  var res = await db.collection('tournament_league_tables').where({ tournamentId: tournamentId }).get()
  var list = (res.data || []).filter(function(item) { return belongsToDivision(item, divisionId) })
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
  var divisionId = event.divisionId || 'default'
  var divisionName = event.divisionName || '默认组'
  var scheduleType = event.scheduleType || ''
  var scheduleConfig = event.scheduleConfig || {}

  if (!tournamentId) {
    return { success: false, message: '缺少必要参数' }
  }

  try {
    var actor = await authenticateActor(event)
    // 读取赛事信息并先校验机构归属，任何写入都必须发生在校验之后。
    var tournamentRes = await db.collection('tournaments').doc(tournamentId).get()
    var tournament = Array.isArray(tournamentRes.data) ? tournamentRes.data[0] : tournamentRes.data
    if (!tournament) return { success: false, message: '赛事不存在' }
    if (!recordBelongsToActor(tournament, actor)) {
      return { success: false, message: '无权为其他账号的赛事生成赛程' }
    }
    if (!scheduleType) {
      scheduleType = tournament.tournamentType || tournament.format || 'tournament'
    }
    // 保存配置到赛事记录
    var updateData = {
      scheduleType: scheduleType,
      scheduleGenerated: true,
      orgId: actor.orgId,
      updateTime: db.serverDate()
    }
    if (scheduleConfig.startDate) updateData.startDate = scheduleConfig.startDate
    if (Object.keys(scheduleConfig).length > 0) updateData.scheduleConfig = scheduleConfig
    await db.collection('tournaments').doc(tournamentId).update({ data: updateData })
    console.log('开始生成赛程:', scheduleType, divisionId, divisionName)

    // 先读取全部组别赛程。当前组别旧赛程将被覆盖，不占用新排程时段；其他组别必须避让。
    var oldMatches = await loadAllTournamentMatches(tournamentId)
    var otherDivisionMatches = oldMatches.filter(function(match) { return !belongsToDivision(match, divisionId) })
    var occupiedSlots = buildOccupiedSlotSet(otherDivisionMatches)
    console.log('检测其他组别场地占用:', occupiedSlots.size, '个时段')

    // 按赛制生成
    var matches = []

    if (scheduleType === 'tournament') {
      // 赛会制
      var tg = event.groups && event.groups.length > 0
        ? { groups: event.groups, tournamentConfig: event.tournamentConfig }
        : await loadTournamentGroups(tournamentId, divisionId)
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
      matches = generateTournamentSchedule(tournamentId, groups, tournamentConfig, scheduleConfig, occupiedSlots)

    } else if (scheduleType === 'cup') {
      // 杯赛制
      var cupData = (event.upperHalf && event.upperHalf.length > 0) || (event.lowerHalf && event.lowerHalf.length > 0)
        ? {
            allTeams: (event.upperHalf || []).concat(event.lowerHalf || []),
            cupConfig: event.cupConfig || { bracketSize: 16, hasThirdPlace: true, cupMode: 'single' }
          }
        : await loadCupBracket(tournamentId, divisionId)
      var allTeams = cupData.allTeams || []
      var cupConfig = cupData.cupConfig || event.cupConfig || { bracketSize: 16, hasThirdPlace: true, cupMode: 'single' }
      if (allTeams.length === 0) {
        return { success: false, message: '未找到淘汰赛对阵数据，请先在抽签分组页面完成对阵分配并保存' }
      }
      matches = generateCupSchedule(tournamentId, allTeams, cupConfig, scheduleConfig, occupiedSlots)

    } else if (scheduleType === 'league') {
      // 联赛制
      var lg = (event.ranking && event.ranking.length > 0)
        ? { ranking: event.ranking, leagueConfig: event.leagueConfig }
        : await loadLeagueData(tournamentId, divisionId)
      var ranking = lg.ranking || []
      var leagueConfig = lg.leagueConfig || event.leagueConfig || { loopType: 'single' }
      if (ranking.length === 0) {
        return { success: false, message: '未找到联赛球队数据，请先在抽签分组页面完成球队分配并保存' }
      }
      matches = generateLeagueSchedule(tournamentId, ranking, leagueConfig, scheduleConfig, occupiedSlots)

    } else if (scheduleType === 'combined') {
      // 复合制：先尝试拿 league + cup 的数据
      var leagueData = await loadLeagueData(tournamentId, divisionId)
      var cupData2 = await loadCupBracket(tournamentId, divisionId)
      var combinedConfig = event.combinedConfig || { useGroups: false, leagueLoopType: 'single', cupAdvanceCount: 4 }
      var params = {
        groups: event.groups || (leagueData.ranking.length > 0 ? [] : []),
        ranking: event.ranking || leagueData.ranking || [],
        combinedConfig: combinedConfig
      }
      matches = generateCombinedSchedule(tournamentId, params, scheduleConfig, occupiedSlots)
    }

    // 批量插入
    if (matches.length === 0) {
      return { success: false, message: '未生成任何比赛，请检查配置' }
    }

    // 写入前重新读取一次，缩小其他组别刚刚生成或调整赛程造成的并发冲突窗口。
    var latestMatches = await loadAllTournamentMatches(tournamentId)
    var latestOtherDivisionMatches = latestMatches.filter(function(match) { return !belongsToDivision(match, divisionId) })
    var finalValidation = validateGeneratedSchedule(
      matches,
      buildOccupiedSlotSet(latestOtherDivisionMatches),
      getDailyMatchLimit(scheduleConfig)
    )
    if (finalValidation.missingAssignments.length > 0) {
      return {
        success: false,
        message: '有 ' + finalValidation.missingAssignments.length + ' 场比赛未分配日期、时间或场地，请检查比赛日期和时段配置'
      }
    }
    if (finalValidation.conflicts.length > 0) {
      var conflictLabels = finalValidation.conflicts.slice(0, 3).map(function(key) { return key.split('|').join(' ') })
      return {
        success: false,
        message: '检测到其他组别刚刚占用了相同场地时段：' + conflictLabels.join('；') + '。请重新生成赛程。',
        conflicts: finalValidation.conflicts
      }
    }
    if (finalValidation.dailyLimitExceeded.length > 0) {
      var exceededLabels = finalValidation.dailyLimitExceeded.slice(0, 3).map(function(item) {
        return item.matchDate + '（' + item.count + ' 场）'
      })
      return {
        success: false,
        message: '检测到当前组别当天比赛数超过每天场次上限：' + exceededLabels.join('；') + '。请重新生成赛程。'
      }
    }

    // 新赛程完整生成且复检无冲突后，才删除当前组别旧赛程。
    var scopedOldMatches = latestMatches.filter(function(match) { return belongsToDivision(match, divisionId) })
    if (scopedOldMatches.length > 0) {
      var deletePromises = scopedOldMatches.map(function(match) {
        return db.collection('matches').doc(match._id).remove()
      })
      await Promise.all(deletePromises)
      console.log('删除当前组别旧赛程:', scopedOldMatches.length, '场')
    }

    var insertPromises = matches.map(function(match) {
      match.divisionId = divisionId
      match.divisionName = divisionName
      match.orgId = actor.orgId
      return db.collection('matches').add({ data: match })
    })
    await Promise.all(insertPromises)

    // 保存汇总记录到 tournament_groups（供下次快速读取）
    var summaryData = {
      tournamentId: tournamentId,
      divisionId: divisionId,
      divisionName: divisionName,
      scheduleType: scheduleType,
      orgId: actor.orgId,
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
    var scopedOldSummary = (oldSummary.data || []).filter(function(g) { return belongsToDivision(g, divisionId) })
    if (scopedOldSummary.length > 0) {
      await Promise.all(scopedOldSummary.map(function(g) {
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
        orgId: actor.orgId,
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
