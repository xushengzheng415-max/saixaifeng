// 云函数入口文件 - 赛程生成（支持4种赛制）
const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const topology = require('./topology')
const scheduleEngine = require('./scheduler')
const SCHEDULE_ENGINE_VERSION = '2026-08-30-unified-final-stage-v3'

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex')
}

function recordBelongsToActor(record, actor) {
  if (!record || !actor) return false
  var orgIds = ['orgId', 'organizationId', 'organization_id']
    .map(function(field) { return record[field] == null ? '' : String(record[field]).trim() })
    .filter(Boolean)
  var uniqueOrgIds = Array.from(new Set(orgIds))
  return uniqueOrgIds.length === 1 && uniqueOrgIds[0] === String(actor.orgId)
}

function recordHasOrgIdentity(record) {
  return ['orgId','organizationId','organization_id'].some(function(field){return String(record && record[field] || '').trim()})
}

function divisionBelongsToOwnedTournament(division,tournament,actor) {
  if (recordBelongsToActor(division,actor)) return true
  if (recordHasOrgIdentity(division)) return false
  return String(division && division.tournamentId || '')===String(tournament && tournament._id || '') && recordBelongsToActor(tournament,actor)
}

function competitionPlanLocked(record) {
  if (!record) return false
  return record.competitionPlanLocked === true ||
    record.finalPlanLocked === true ||
    ['locked', 'match_management', 'in_progress', 'completed'].indexOf(String(record.competitionPlanStatus || '').toLowerCase()) >= 0
}

function divisionMatches(record, divisionId) {
  if (!record) return false
  var recordDivisionId = record.divisionId || record.division || record.divisionKey || ''
  if (!recordDivisionId) return String(divisionId || 'default') === 'default'
  return String(recordDivisionId) === String(divisionId || 'default')
}

function nestedDivisionLocked(tournament, divisionId) {
  var divisions = tournament && Array.isArray(tournament.divisions) ? tournament.divisions : []
  return divisions.some(function(item) {
    return divisionMatches(item, divisionId) && competitionPlanLocked(item)
  })
}

async function competitionPlanState(tournament, divisionId) {
  var selectedDivisionId = String(divisionId || 'default')
  if (nestedDivisionLocked(tournament, selectedDivisionId)) return { locked: true }
  if (competitionPlanLocked(tournament) && (!selectedDivisionId || selectedDivisionId === 'default')) return { locked: true }
  if (!selectedDivisionId || selectedDivisionId === 'default') return { locked: false }
  try {
    var result = await db.collection('divisions').doc(selectedDivisionId).get()
    var division = Array.isArray(result.data) ? result.data[0] : result.data
    return { locked: competitionPlanLocked(division) }
  } catch (error) {
    return { locked: false, readError: error }
  }
}

async function loadDivisionConfiguration(tournament, divisionId, actor) {
  var selectedId = String(divisionId || 'default')
  var nested = tournament && Array.isArray(tournament.divisions)
    ? tournament.divisions.find(function(item) { return divisionMatches(item, selectedId) })
    : null
  if (selectedId === 'default') return { division: nested || null }
  try {
    var result = await db.collection('divisions').doc(selectedId).get()
    var division = Array.isArray(result.data) ? result.data[0] : result.data
    if (!division) return { division: nested || null }
    if (!divisionBelongsToOwnedTournament(division,tournament,actor)) return { scopeDenied: true }
    return { division: division }
  } catch (error) {
    return nested ? { division: nested } : { readError: error }
  }
}

function finalRankingMode(record, scheduleType) {
  if (scheduleType === 'league') return 'full'
  var value = String(record && (record.finalRankingMode || record.rankingScope) || '').toLowerCase()
  if (['champion', 'top4', 'full'].indexOf(value) >= 0) return value
  if (record && record.fullRankingEnabled === true) return 'full'
  if (record && record.thirdPlaceEnabled === false) return 'champion'
  return 'top4'
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
  var orgId = String(user.orgId || user.organizationId || '').trim()
  if (!orgId) throw new Error('当前账号尚未关联机构，请先完成机构引导')
  if (event.__actorUserId && event.__actorUserId !== user._id) throw new Error('登录身份校验失败')
  if (event.__actorOrgId && String(event.__actorOrgId) !== orgId) throw new Error('机构归属校验失败')
  var organizationResult = await db.collection('organizations').doc(orgId).get()
  var organization = Array.isArray(organizationResult.data) ? organizationResult.data[0] : organizationResult.data
  if (!organization) throw new Error('当前机构不存在或已失效，请重新完成机构引导')
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
  if (Array.isArray(sc.venueResources) && sc.venueResources.length > 0) {
    return Array.from(new Set(scheduleEngine.buildVenueSlots(sc).map(function(slot) { return slot.time }))).sort()
  }
  return scheduleEngine.buildTimeSlots(sc)
}

function divisionMatchMinutes(division) {
  var value = Number(division && (division.matchMinutes || (division.rulesSnapshot && division.rulesSnapshot.matchMinutes)) || 0)
  return Number.isFinite(value) && value > 0 ? value : 0
}

function normalizeScheduleTiming(scheduleConfig, division) {
  var config = Object.assign({}, scheduleConfig || {})
  var matchMinutes = divisionMatchMinutes(division)
  var matchFormat=String(division && division.matchFormat || '').trim().toLowerCase()
  if (!matchFormat) {
    var players=Number(division && division.playersOnField || 0)
    if (players>0) matchFormat=players+'side'
  }
  if (!matchMinutes) return { error: '当前竞赛组别没有已定版的单场比赛时长，请先返回竞赛规则设置', code: 'DIVISION_MATCH_MINUTES_REQUIRED' }
  if (!matchFormat) return { error: '当前竞赛组别没有已定版的几人制规则，请先返回竞赛规则设置', code: 'DIVISION_MATCH_FORMAT_REQUIRED' }
  if (matchMinutes > 60) return { error: '当前组别单场比赛时长超过60分钟，不能使用一小时排赛格，请先确认长时比赛排程规则', code: 'MATCH_DURATION_EXCEEDS_SLOT' }
  config.matchDuration = matchMinutes
  config.matchFormat = matchFormat
  config.slotMinutes = 60
  config.matchInterval = 60 - matchMinutes
  config.maxDailyOne = false
  config.maxPerSession = 1
  config.dailyMatchLimit = 0
  var resources = scheduleEngine.normalizeVenueResources(config)
  if (resources.length === 0) return { error: '请至少填写一块真实比赛场地', code: 'VENUE_RESOURCES_REQUIRED' }
  var invalidResource = resources.find(function(resource) { return scheduleEngine.buildTimeSlots(Object.assign({},config,{ sessionWindows:resource.sessionWindows })).length === 0 })
  if (invalidResource) return { error: invalidResource.venue + '没有有效的上午、下午或晚上时间段', code: 'VENUE_SESSION_WINDOWS_REQUIRED' }
  config.venueResources = resources.map(function(resource) { return { name:resource.venue,fieldFormat:resource.fieldFormat,sessionWindows:resource.sessionWindows } })
  config.venues = resources.map(function(resource) { return resource.venue })
  var venueSlots = scheduleEngine.buildVenueSlots(config)
  var slots = Array.from(new Set(venueSlots.map(function(slot) { return slot.time }))).sort()
  config.timeSlots = slots
  return { config: config, matchMinutes: matchMinutes, timeSlots: slots, venueSlots: venueSlots }
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
  var config = Object.assign({}, scheduleConfig || {}, {
    startDate: formatDate(startDate),
    venues: venues,
    timeSlots: timeSlots
  })
  return scheduleEngine.assign(matches, config, occupiedSlots || new Set())
}

// 分配日期时间场地
function assignDateTimeVenue(matches, scheduleConfig, cupMode, occupiedSlots) {
  var timeSlots = getTimeSlots(scheduleConfig)
  if (!scheduleConfig || timeSlots.length === 0) return

  var startDate = new Date(scheduleConfig.startDate)
  if (Number.isNaN(startDate.getTime())) throw new Error('请设置有效的比赛开始日期')
  var venues = normalizeVenueList(scheduleConfig.venues)
  occupiedSlots = occupiedSlots || new Set()
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
    matches.splice.apply(matches, [0, matches.length].concat(twoLegMatches))
  }
  return assignDateTimeByRound(matches, startDate, venues, timeSlots, scheduleConfig, occupiedSlots)
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
          matchNo: groupMatchIndex,
          matchIndex: groupMatchIndex,
          pool: groupSchedule.groupName,
          rankRange: '',
          homeSource: { type: 'seed', teamId: pairing.home.teamId, name: pairing.home.teamName || pairing.home.name || '' },
          awaySource: { type: 'seed', teamId: pairing.away.teamId, name: pairing.away.teamName || pairing.away.name || '' },
          homeSourceType: 'seed',
          awaySourceType: 'seed',
          homeSourceLabel: pairing.home.teamName || pairing.home.name || '',
          awaySourceLabel: pairing.away.teamName || pairing.away.name || '',
          dependencyMatchNos: [],
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

  // 全员排位：小组赛全部结束后，按小组名次生成可追溯的交叉排位拓扑。
  if (tournamentConfig.fullRankingEnabled !== false) {
    var rankingResult = groups.length === 1
      ? { matches: [], complete: true, warnings: [] }
      : topology.multiGroupRanking(tournamentId, groups, { startMatchNo: groupMatchIndex })
    var groupDependencies = matches.map(function(match) { return match.matchNo }).filter(Boolean)
    rankingResult.matches.forEach(function(match) {
      match.dependencyMatchNos = Array.from(new Set(groupDependencies.concat(match.dependencyMatchNos || [])))
      match.createTime = db.serverDate()
      match.updateTime = db.serverDate()
    })
    matches.push.apply(matches, rankingResult.matches)
    matches.fullRankingComplete = rankingResult.complete
    matches.generationWarnings = rankingResult.warnings
    matches.fullRankingEnabled = true
    if (rankingResult.complete) assignDateTimeVenue(matches, scheduleConfig, '', occupiedSlots)
    return matches
  }

  // 未开启全员排位时，保留原有冠军线逻辑。
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
  if (cupConfig.fullRankingEnabled !== false) {
    if (cupConfig.cupMode === 'two-leg') {
      var incompatible = []
      incompatible.fullRankingComplete = false
      incompatible.fullRankingEnabled = true
      incompatible.generationWarnings = ['全员排位当前只支持单场淘汰；两回合制需先单独确认名次线规则']
      return incompatible
    }
    var rankingResult = topology.fullRankingKnockout(tournamentId, allTeams, {})
    rankingResult.matches.forEach(function(match) {
      match.createTime = db.serverDate()
      match.updateTime = db.serverDate()
    })
    var rankedMatches = rankingResult.matches
    rankedMatches.fullRankingComplete = rankingResult.complete
    rankedMatches.generationWarnings = rankingResult.warnings
    rankedMatches.fullRankingEnabled = true
    if (rankingResult.complete) assignDateTimeVenue(rankedMatches, scheduleConfig, cupConfig.cupMode || '', occupiedSlots)
    return rankedMatches
  }
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

function isOfficialDrawRecord(item) {
  return item && (item.status === 'published' || (item.status === 'confirmed' && Boolean(item.confirmedAt)))
}

function configuredExpectedTeamCount(division) {
  var candidates = division ? [division.expectedTeams, division.requiredTeams, division.teamRequirement, division.participantTeams, division.maxTeams] : []
  for (var index = 0; index < candidates.length; index++) {
    var value = Number(candidates[index])
    if (Number.isFinite(value) && value > 0) return value
  }
  return 0
}

async function loadApprovedParticipantIds(tournamentId, divisionId) {
  var result = await db.collection('tournament_teams').where({ tournamentId: tournamentId }).limit(1000).get()
  return Array.from(new Set((result.data || [])
    .filter(function(item) { return belongsToDivision(item, divisionId) && item.status === 'approved' })
    .map(function(item) { return String(item.teamId || '') })
    .filter(Boolean)))
}

function validateParticipantSet(sourceTeams, approvedIds, expectedCount) {
  var ids = (sourceTeams || []).map(function(team) { return String(team && (team.teamId || team.id) || '') }).filter(Boolean)
  var unique = Array.from(new Set(ids))
  if (unique.length !== ids.length) return { valid: false, code: 'DRAW_TEAM_DUPLICATED', message: '抽签结果存在重复球队，不能生成赛程' }
  if (expectedCount > 0 && unique.length !== expectedCount) return { valid: false, code: 'DRAW_TEAM_COUNT_MISMATCH', message: '抽签结果为 ' + unique.length + ' 支球队，与当前组别目标 ' + expectedCount + ' 支不一致' }
  if (approvedIds.length !== unique.length) return { valid: false, code: 'APPROVED_TEAM_COUNT_MISMATCH', message: '已通过球队为 ' + approvedIds.length + ' 支，抽签结果为 ' + unique.length + ' 支，不能生成赛程' }
  var approved = new Set(approvedIds.map(String))
  var unknown = unique.filter(function(id) { return !approved.has(id) })
  if (unknown.length > 0) return { valid: false, code: 'DRAW_TEAM_NOT_APPROVED', message: '抽签结果包含未通过审核或已退出的球队，不能生成赛程' }
  return { valid: true, teamCount: unique.length }
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

function decorateGeneratedMatches(matches, tournamentId, divisionId, divisionName, scheduleConfig) {
  ;(matches || []).forEach(function(match, index) {
    match.tournamentId = tournamentId
    match.divisionId = divisionId
    match.divisionName = divisionName
    match.scheduleEngineVersion = SCHEDULE_ENGINE_VERSION
    match.competitionGroup = divisionName
    match.matchFormat = scheduleConfig.matchFormat || match.matchFormat || ''
    match.requiredVenueFormat = match.matchFormat
    match.pool = match.pool || match.group || ''
    match.matchNo = Number(match.matchNo || match.matchIndex || index + 1)
    match.matchIndex = match.matchNo
    match.dependencyMatchNos = Array.from(new Set((match.dependencyMatchNos || []).map(Number).filter(Boolean)))
    if (!match.homeSource && match.homeTeamId) match.homeSource = { type: 'seed', teamId: match.homeTeamId, name: match.homeTeamName || '' }
    if (!match.awaySource && match.awayTeamId) match.awaySource = { type: 'seed', teamId: match.awayTeamId, name: match.awayTeamName || '' }
    match.homeSourceType = match.homeSourceType || (match.homeSource && match.homeSource.type) || ''
    match.awaySourceType = match.awaySourceType || (match.awaySource && match.awaySource.type) || ''
    match.homeSourceLabel = match.homeSourceLabel || topology.label(match.homeSource)
    match.awaySourceLabel = match.awaySourceLabel || topology.label(match.awaySource)
    match.date = match.date || match.matchDate || ''
    match.startTime = match.startTime || match.matchTime || ''
    match.timeSlot = match.timeSlot || match.matchTime || ''
    match.durationMinutes = Number(match.durationMinutes || scheduleConfig.matchDuration || 50)
    match.bufferMinutes = Number(match.bufferMinutes || scheduleConfig.matchInterval || 0)
    match.scheduleStatus = match.scheduleStatus || (match.matchDate ? 'scheduled' : 'unassigned')
    match.createTime = match.createTime || db.serverDate()
    match.updateTime = match.updateTime || db.serverDate()
  })
}

async function loadTournamentGroups(tournamentId, divisionId) {
  var res = await db.collection('tournament_groups').where({ tournamentId: tournamentId }).get()
  var list = (res.data || []).filter(function(item) {
    return belongsToDivision(item, divisionId) && !item.scheduleType && (item.groupName || item.groupCode || Array.isArray(item.groups)) && item.status !== 'archived'
  })

  if (list.length === 0) return { groups: [], tournamentConfig: null }
  if (!list.every(isOfficialDrawRecord)) return { groups: [], tournamentConfig: null, notConfirmed: true }

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
  var list = (res.data || []).filter(function(item) { return belongsToDivision(item, divisionId) && !item.scheduleType && item.status !== 'archived' && (Array.isArray(item.matches) || Array.isArray(item.slots)) })
  if (list.length === 0) return { allTeams: [], cupConfig: { bracketSize: 16, hasThirdPlace: true, cupMode: 'single' } }
  if (!list.every(isOfficialDrawRecord)) return { allTeams: [], cupConfig: { bracketSize: 16, hasThirdPlace: true, cupMode: 'single' }, notConfirmed: true }

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
    ;(round.slots || []).forEach(function(slot) {
      if (slot && slot.teamId) teamMap[slot.teamId] = { teamId: slot.teamId, teamName: slot.teamName || slot.name || '' }
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
  var list = (res.data || []).filter(function(item) { return belongsToDivision(item, divisionId) && !item.scheduleType && item.status !== 'archived' && Array.isArray(item.teams) })
  if (list.length === 0) return { ranking: [], leagueConfig: { loopType: 'single' } }
  if (!list.every(isOfficialDrawRecord)) return { ranking: [], leagueConfig: { loopType: 'single' }, notConfirmed: true }

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

function scheduleTypeForDivision(division) {
  var formatType=String(division && (division.formatType || division.tournamentType) || '').toLowerCase()
  return ({ cup:'tournament',tournament:'cup',league:'league',hybrid:'combined' })[formatType] || formatType
}

function sanitizeScheduleDraft(input) {
  var source=input && typeof input==='object' ? input : {}
  var validDays=new Set(['周一','周二','周三','周四','周五','周六','周日'])
  var validFormats=new Set(['5side','7side','8side','9side','11side'])
  var validSessions=new Set(['morning','afternoon','evening'])
  function safeTime(value,fallback){var text=String(value || '');return /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/.test(text)?text:fallback}
  var venueResources=(Array.isArray(source.venueResources)?source.venueResources:[]).slice(0,50).map(function(resource){
    var fieldFormat=String(resource && resource.fieldFormat || '').toLowerCase()
    if (!validFormats.has(fieldFormat)) fieldFormat=''
    var windows=(Array.isArray(resource && resource.sessionWindows)?resource.sessionWindows:[]).filter(function(window){return validSessions.has(String(window && window.key || ''))}).slice(0,3).map(function(window){return { key:String(window.key),label:({ morning:'上午',afternoon:'下午',evening:'晚上' })[String(window.key)],enabled:window.enabled===true,start:safeTime(window.start,'09:00'),end:safeTime(window.end,'12:00') }})
    return { name:String(resource && (resource.name || resource.venue) || '').trim().slice(0,80),fieldFormat:fieldFormat,sessionWindows:windows }
  }).filter(function(resource){return resource.name && resource.fieldFormat})
  return { generationMode:source.generationMode==='separate'?'separate':'joint',selectedDivisionId:String(source.selectedDivisionId || '').slice(0,80),startDate:String(source.startDate || '').slice(0,10),endDate:String(source.endDate || '').slice(0,10),matchDays:(Array.isArray(source.matchDays)?source.matchDays:[]).filter(function(day){return validDays.has(day)}),venues:venueResources.map(function(resource){return resource.name}),venueResources:venueResources,calendarExtraTimeSlots:Array.from(new Set((Array.isArray(source.calendarExtraTimeSlots)?source.calendarExtraTimeSlots:[]).map(function(time){return safeTime(time,'')}).filter(Boolean))).slice(0,30),slotMinutes:60,maxDailyOne:false,maxPerSession:1,dailyMatchLimit:0,restMinutes:Math.max(0,Math.min(1440,Number(source.restMinutes || 90))) }
}

async function buildDivisionScheduleTopology(tournamentId, division, sharedConfig) {
  var divisionId=String(division._id || division.id || '')
  var divisionName=division.name || division.divisionName || '未命名组别'
  var scheduleType=scheduleTypeForDivision(division)
  var rankingMode=finalRankingMode(division,scheduleType)
  var normalizedTiming=normalizeScheduleTiming(sharedConfig,division)
  if (normalizedTiming.error) return { success:false,code:normalizedTiming.code,message:divisionName+'：'+normalizedTiming.error }
  var approvedParticipantIds=await loadApprovedParticipantIds(tournamentId,divisionId)
  var expectedTeamCount=configuredExpectedTeamCount(division)
  var matches=[]
  if (scheduleType==='tournament') {
    var groupData=await loadTournamentGroups(tournamentId,divisionId)
    if (groupData.notConfirmed) return { success:false,code:'DRAW_NOT_CONFIRMED',message:divisionName+'抽签结果尚未正式确认' }
    var groups=groupData.groups || []
    if (!groups.length) return { success:false,code:'DRAW_REQUIRED',message:divisionName+'未找到正式分组结果' }
    var groupParticipants=groups.reduce(function(all,group){return all.concat(group.teams || [])},[])
    var groupValidation=validateParticipantSet(groupParticipants,approvedParticipantIds,expectedTeamCount)
    if (!groupValidation.valid) return { success:false,code:groupValidation.code,message:divisionName+'：'+groupValidation.message }
    matches=generateTournamentSchedule(tournamentId,groups,{ fullRankingEnabled:rankingMode==='full',advanceCount:Number(division.advancePerGroup || division.advanceCount || 2),hasThirdPlace:rankingMode==='top4' },{},new Set())
  } else if (scheduleType==='cup') {
    var cupData=await loadCupBracket(tournamentId,divisionId)
    if (cupData.notConfirmed) return { success:false,code:'DRAW_NOT_CONFIRMED',message:divisionName+'淘汰赛签位尚未正式确认' }
    var teams=cupData.allTeams || []
    if (!teams.length) return { success:false,code:'DRAW_REQUIRED',message:divisionName+'未找到正式淘汰赛签位' }
    var cupValidation=validateParticipantSet(teams,approvedParticipantIds,expectedTeamCount)
    if (!cupValidation.valid) return { success:false,code:cupValidation.code,message:divisionName+'：'+cupValidation.message }
    matches=generateCupSchedule(tournamentId,teams,Object.assign({},cupData.cupConfig,{ fullRankingEnabled:rankingMode==='full',hasThirdPlace:rankingMode==='top4' }),{},new Set())
  } else if (scheduleType==='league') {
    var leagueData=await loadLeagueData(tournamentId,divisionId)
    if (leagueData.notConfirmed) return { success:false,code:'DRAW_NOT_CONFIRMED',message:divisionName+'联赛排序尚未正式确认' }
    var ranking=leagueData.ranking || []
    if (!ranking.length) return { success:false,code:'DRAW_REQUIRED',message:divisionName+'未找到正式联赛排序' }
    var leagueValidation=validateParticipantSet(ranking.map(function(item){return item.team}),approvedParticipantIds,expectedTeamCount)
    if (!leagueValidation.valid) return { success:false,code:leagueValidation.code,message:divisionName+'：'+leagueValidation.message }
    matches=generateLeagueSchedule(tournamentId,ranking,leagueData.leagueConfig || { loopType:'single' },{},new Set())
  } else {
    return { success:false,code:'SCHEDULE_TYPE_UNSUPPORTED',message:divisionName+'当前赛制暂不支持联合编排' }
  }
  if (matches.fullRankingComplete===false) return { success:false,code:'FULL_RANKING_RULE_CONFIRMATION_REQUIRED',message:divisionName+'：'+(matches.generationWarnings || []).join('；') }
  decorateGeneratedMatches(matches,tournamentId,divisionId,divisionName,normalizedTiming.config)
  return { success:true,divisionId:divisionId,divisionName:divisionName,scheduleType:scheduleType,matches:matches,scheduleConfig:normalizedTiming.config }
}

async function generateAllDivisionSchedules(event,tournament,actor) {
  var tournamentId=String(tournament._id || event.tournamentId || '')
  var divisionResult=await db.collection('divisions').where({ tournamentId:tournamentId }).limit(100).get()
  var requestedIds=new Set((event.divisionIds || []).map(String))
  var divisions=(divisionResult.data || []).filter(function(division){
    if (!divisionBelongsToOwnedTournament(division,tournament,actor)) return false
    if (requestedIds.size && !requestedIds.has(String(division._id))) return false
    return division.rulesLocked===true || division.ruleFinalized===true || ['finalized','locked','published'].indexOf(String(division.ruleStatus || '').toLowerCase())>=0
  })
  if (!divisions.length) return { success:false,code:'NO_READY_DIVISIONS',message:'没有已定版且可联合编排的竞赛组别' }
  for (var stateIndex=0;stateIndex<divisions.length;stateIndex++) {
    var planState=await competitionPlanState(tournament,String(divisions[stateIndex]._id))
    if (planState.readError) return { success:false,code:'COMPETITION_PLAN_STATE_UNAVAILABLE',message:'无法确认'+divisions[stateIndex].name+'竞赛方案状态' }
    if (planState.locked) return { success:false,code:'COMPETITION_PLAN_LOCKED',message:divisions[stateIndex].name+'竞赛方案已经锁定，不能重新生成赛程' }
  }
  var sharedConfig=Object.assign({},event.scheduleConfig || {},{ slotMinutes:60,maxDailyOne:false,maxPerSession:1,dailyMatchLimit:0 })
  var generated=[]
  for (var divisionIndex=0;divisionIndex<divisions.length;divisionIndex++) {
    var built=await buildDivisionScheduleTopology(tournamentId,divisions[divisionIndex],sharedConfig)
    if (!built.success) return built
    generated.push(built)
  }
  var allMatches=generated.reduce(function(all,item){return all.concat(item.matches)},[])
  var existing=await loadAllTournamentMatches(tournamentId)
  var selectedIds=new Set(generated.map(function(item){return item.divisionId}))
  var occupied=buildOccupiedSlotSet(existing.filter(function(match){return !selectedIds.has(String(match.divisionId || 'default'))}))
  var assignment=scheduleEngine.assign(allMatches,sharedConfig,occupied)
  if (assignment.unassigned>0) {
    var divisionNames=new Map(generated.map(function(item){return [String(item.divisionId),item.divisionName]}))
    var breakdownMap=new Map()
    allMatches.filter(function(match){return !match.isBye && !match.matchDate}).forEach(function(match){var format=String(match.requiredVenueFormat || match.matchFormat || 'unknown');var divisionId=String(match.divisionId || 'default');var key=divisionId+'|'+format;var row=breakdownMap.get(key) || { divisionId:divisionId,divisionName:divisionNames.get(divisionId) || match.divisionName || '当前组别',fieldFormat:format,fieldFormatLabel:format.replace('side','人制'),unassigned:0,reasons:[] };row.unassigned+=1;if(match.scheduleIssue && row.reasons.indexOf(match.scheduleIssue)<0)row.reasons.push(match.scheduleIssue);breakdownMap.set(key,row)})
    return { success:false,code:'SCHEDULE_CAPACITY_INSUFFICIENT',message:'现有比赛日、场地和阶段容量不足，仍有'+assignment.unassigned+'场未排；请增加比赛日、场地或开启晚场',unassigned:assignment.unassigned,reasons:assignment.reasons,formatBreakdown:Array.from(breakdownMap.values()) }
  }
  var finalValidation=validateGeneratedSchedule(allMatches,occupied,0)
  if (finalValidation.missingAssignments.length || finalValidation.conflicts.length) return { success:false,code:'JOINT_SCHEDULE_VALIDATION_FAILED',message:'联合赛程校验失败，请调整场地时间后重试' }
  var oldSelected=existing.filter(function(match){return selectedIds.has(String(match.divisionId || 'default'))})
  if (oldSelected.length) await Promise.all(oldSelected.map(function(match){return db.collection('matches').doc(match._id).remove()}))
  var generationRunId='joint-'+Date.now()+'-'+crypto.randomBytes(4).toString('hex')
  await Promise.all(allMatches.map(function(match){match.orgId=actor.orgId;match.jointGenerationRunId=generationRunId;return db.collection('matches').add({ data:match })}))
  await Promise.all(generated.map(function(item){return db.collection('divisions').doc(item.divisionId).update({ data:{ scheduleConfig:db.command.set(item.scheduleConfig),scheduleVenueConfigured:true,scheduleGenerated:true,scheduleEngineVersion:SCHEDULE_ENGINE_VERSION,scheduleConfiguredAt:db.serverDate(),jointGenerationRunId:generationRunId,updateTime:db.serverDate() } })}))
  await db.collection('tournaments').doc(tournamentId).update({ data:{ status:'ongoing',scheduleGenerated:true,scheduleGenerationMode:'joint',scheduleEngineVersion:SCHEDULE_ENGINE_VERSION,scheduleConfig:db.command.set(sharedConfig),scheduleDraft:db.command.set(null),jointGenerationRunId:generationRunId,orgId:actor.orgId,updateTime:db.serverDate() } })
  return { success:true,message:'已联合生成'+allMatches.length+'场比赛',matchCount:allMatches.length,generationMode:'joint',scheduleEngineVersion:SCHEDULE_ENGINE_VERSION,generationRunId:generationRunId,divisions:generated.map(function(item){return { divisionId:item.divisionId,divisionName:item.divisionName,matchCount:item.matches.length,scheduleType:item.scheduleType }}) }
}

function publicationVersion(prefix) {
  var now=new Date()
  var stamp=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0'),String(now.getHours()).padStart(2,'0'),String(now.getMinutes()).padStart(2,'0'),String(now.getSeconds()).padStart(2,'0')].join('')
  return prefix+'-'+stamp
}

function regulationPublicationSnapshot(division) {
  var fields=['name','divisionName','mode','formatType','tournamentType','matchFormat','playersOnField','periodMode','matchMinutes','breakMinutes','groupCount','teamsPerGroup','advancePerGroup','loopType','fullRankingEnabled','finalRankingMode','thirdPlaceEnabled','pointsWin','pointsDraw','pointsLoss','rankingRules','disciplineRules','substitutionRules','rulesVersion','ruleStatus','rulesLocked','ruleFinalized']
  var snapshot={}
  fields.forEach(function(field){if(division && division[field]!==undefined)snapshot[field]=division[field]})
  if(division && division.rulesSnapshot && typeof division.rulesSnapshot==='object') snapshot.rulesSnapshot=division.rulesSnapshot
  return snapshot
}

async function publishCompetitionRegulations(event,tournament,actor) {
  var divisionId=String(event.divisionId || '')
  if(!divisionId) return { success:false,code:'DIVISION_REQUIRED',message:'请选择要发布竞赛规程的组别' }
  var state=await loadDivisionConfiguration(tournament,divisionId,actor)
  if(state.scopeDenied) return { success:false,code:'DIVISION_SCOPE_DENIED',message:'无权发布其他机构的竞赛规程' }
  if(state.readError || !state.division) return { success:false,code:'DIVISION_RULES_UNAVAILABLE',message:'无法读取当前组别定版规则' }
  var division=state.division
  var finalized=division.rulesLocked===true || division.ruleFinalized===true || ['finalized','locked','published'].indexOf(String(division.ruleStatus || '').toLowerCase())>=0
  if(!finalized) return { success:false,code:'RULES_NOT_FINALIZED',message:'当前组别规则尚未定版，不能发布竞赛规程' }
  var version=String(division.rulesVersion || publicationVersion('R'))
  var publicationId='reg-'+divisionId+'-'+Date.now()+'-'+crypto.randomBytes(3).toString('hex')
  await db.collection('divisions').doc(divisionId).update({ data:{ regulationsPublished:true,regulationsPublicationId:publicationId,regulationsPublishedVersion:version,regulationsPublishedAt:db.serverDate(),publishedRegulationsSnapshot:db.command.set(regulationPublicationSnapshot(division)),updateTime:db.serverDate() } })
  return { success:true,message:'竞赛规程已正式发布',documentType:'regulations',divisionId:divisionId,publicationId:publicationId,version:version }
}

async function publishCompetitionSchedule(event,tournament,actor) {
  var divisionId=String(event.divisionId || '')
  if(!divisionId) return { success:false,code:'DIVISION_REQUIRED',message:'请选择要发布竞赛日程的组别' }
  var state=await loadDivisionConfiguration(tournament,divisionId,actor)
  if(state.scopeDenied) return { success:false,code:'DIVISION_SCOPE_DENIED',message:'无权发布其他机构的竞赛日程' }
  if(state.readError || !state.division) return { success:false,code:'DIVISION_RULES_UNAVAILABLE',message:'无法读取当前竞赛组别' }
  var allMatches=await loadAllTournamentMatches(String(tournament._id || event.tournamentId || ''))
  var selected=allMatches.filter(function(match){return belongsToDivision(match,divisionId) && !match.isBye && match.status!=='cancelled'})
  if(!selected.length) return { success:false,code:'SCHEDULE_EMPTY',message:'当前组别没有可发布的竞赛日程' }
  var missing=selected.filter(function(match){return !match.matchDate || !match.matchTime || !match.venue})
  if(missing.length) return { success:false,code:'SCHEDULE_INCOMPLETE',message:'当前组别仍有'+missing.length+'场比赛未安排日期、时间或场地' }
  var validation=validateGeneratedSchedule(selected,new Set(),0)
  if(validation.conflicts.length || validation.missingAssignments.length) return { success:false,code:'SCHEDULE_CONFLICT',message:'当前竞赛日程存在场地时段冲突或未排场次，不能发布' }
  var resources=new Map(((tournament.scheduleConfig && tournament.scheduleConfig.venueResources) || []).map(function(resource){return [String(resource.name || resource.venue || ''),String(resource.fieldFormat || '').toLowerCase()]}))
  var incompatible=selected.find(function(match){var required=String(match.requiredVenueFormat || match.matchFormat || '').toLowerCase();var actual=resources.get(String(match.venue || '')) || '';return required && actual && required!==actual})
  if(incompatible) return { success:false,code:'SCHEDULE_FIELD_FORMAT_CONFLICT',message:'场序'+(incompatible.matchNo || incompatible.matchIndex || '')+'的比赛制式与'+incompatible.venue+'不兼容' }
  var version=publicationVersion('S')
  var publicationId='schedule-'+divisionId+'-'+Date.now()+'-'+crypto.randomBytes(3).toString('hex')
  await Promise.all(selected.map(function(match){return db.collection('matches').doc(match._id).update({ data:{ schedulePublished:true,schedulePublicationId:publicationId,schedulePublishedVersion:version,schedulePublishedAt:db.serverDate(),updateTime:db.serverDate() } })}))
  await db.collection('divisions').doc(divisionId).update({ data:{ schedulePublished:true,schedulePublicationId:publicationId,schedulePublishedVersion:version,schedulePublishedAt:db.serverDate(),schedulePublishedMatchCount:selected.length,updateTime:db.serverDate() } })
  var selectedIds=new Set(selected.map(function(match){return String(match._id)}))
  var allPublished=allMatches.filter(function(match){return !match.isBye && match.status!=='cancelled'}).every(function(match){return selectedIds.has(String(match._id)) || match.schedulePublished===true || match.published===true || match.status==='published'})
  await db.collection('tournaments').doc(String(tournament._id || event.tournamentId || '')).update({ data:{ schedulePublished:allPublished,schedulePublicationUpdatedAt:db.serverDate(),updateTime:db.serverDate() } })
  return { success:true,message:'竞赛日程已正式发布',documentType:'schedule',divisionId:divisionId,publicationId:publicationId,version:version,matchCount:selected.length,allDivisionsPublished:allPublished }
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
    if (event.action==='saveDraft') {
      var draftConfig=sanitizeScheduleDraft(event.scheduleConfig)
      await db.collection('tournaments').doc(tournamentId).update({ data:{ scheduleDraft:db.command.set(draftConfig),scheduleDraftUpdatedAt:db.serverDate(),orgId:actor.orgId,updateTime:db.serverDate() } })
      return { success:true,message:'赛程时间与场地配置草稿已保存',scheduleDraftUpdated:true }
    }
    if(event.action==='publishRegulations') return await publishCompetitionRegulations(event,tournament,actor)
    if(event.action==='publishSchedule') return await publishCompetitionSchedule(event,tournament,actor)
    if (event.scheduleAllDivisions===true) return await generateAllDivisionSchedules(event,tournament,actor)
    var planState = await competitionPlanState(tournament, divisionId)
    if (planState.readError) {
      return { success: false, message: '无法确认当前竞赛方案状态，请稍后重试', code: 'COMPETITION_PLAN_STATE_UNAVAILABLE' }
    }
    if (planState.locked) {
      return { success: false, message: '竞赛方案已经锁定，不能重新生成赛程', code: 'COMPETITION_PLAN_LOCKED' }
    }
    var divisionState = await loadDivisionConfiguration(tournament, divisionId, actor)
    if (divisionState.scopeDenied) {
      return { success: false, message: '无权读取其他机构的竞赛组别', code: 'DIVISION_SCOPE_DENIED' }
    }
    if (divisionState.readError) {
      return { success: false, message: '无法读取当前竞赛组别规则，请稍后重试', code: 'DIVISION_RULES_UNAVAILABLE' }
    }
    if (!scheduleType) {
      scheduleType = tournament.tournamentType || tournament.format || 'tournament'
    }
    var rankingMode = finalRankingMode(divisionState.division, scheduleType)
    var normalizedTiming = normalizeScheduleTiming(scheduleConfig, divisionState.division)
    if (normalizedTiming.error) return { success: false, code: normalizedTiming.code, message: normalizedTiming.error }
    scheduleConfig = normalizedTiming.config
    var approvedParticipantIds = await loadApprovedParticipantIds(tournamentId, divisionId)
    var expectedTeamCount = configuredExpectedTeamCount(divisionState.division)
    // 保存配置到赛事记录
    var updateData = {
      scheduleType: scheduleType,
      scheduleGenerated: true,
      orgId: actor.orgId,
      updateTime: db.serverDate()
    }
    if (scheduleConfig.startDate) updateData.startDate = scheduleConfig.startDate
    if (Object.keys(scheduleConfig).length > 0) updateData.scheduleConfig = db.command.set(scheduleConfig)
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
      if (tg.notConfirmed) return { success: false, code: 'DRAW_NOT_CONFIRMED', message: '当前组别抽签结果尚未正式确认，不能生成赛程' }
      var tournamentConfig = tg.tournamentConfig || event.tournamentConfig || { advanceCount: 2, hasThirdPlace: true }
      tournamentConfig = Object.assign({}, tournamentConfig, {
        fullRankingEnabled: rankingMode === 'full',
        hasThirdPlace: rankingMode === 'top4'
      })
      if (groups.length === 0) {
        return { success: false, message: '未找到分组数据，请先在抽签分组页面完成分组并保存' }
      }
      // 校验每个分组的 teams 是否为数组
      var hasInvalid = groups.some(function(g) { return !Array.isArray(g.teams) })
      if (hasInvalid) {
        return { success: false, message: '分组数据格式异常，请重新保存抽签分组' }
      }
      var groupParticipants = groups.reduce(function(all, group) { return all.concat(group.teams || []) }, [])
      var groupValidation = validateParticipantSet(groupParticipants, approvedParticipantIds, expectedTeamCount)
      if (!groupValidation.valid) return { success: false, code: groupValidation.code, message: groupValidation.message }
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
      if (cupData.notConfirmed) return { success: false, code: 'DRAW_NOT_CONFIRMED', message: '当前组别淘汰赛签位尚未正式确认，不能生成赛程' }
      var cupConfig = cupData.cupConfig || event.cupConfig || { bracketSize: 16, hasThirdPlace: true, cupMode: 'single' }
      cupConfig = Object.assign({}, cupConfig, {
        fullRankingEnabled: rankingMode === 'full',
        hasThirdPlace: rankingMode === 'top4'
      })
      if (allTeams.length === 0) {
        return { success: false, message: '未找到淘汰赛对阵数据，请先在抽签分组页面完成对阵分配并保存' }
      }
      var cupValidation = validateParticipantSet(allTeams, approvedParticipantIds, expectedTeamCount)
      if (!cupValidation.valid) return { success: false, code: cupValidation.code, message: cupValidation.message }
      matches = generateCupSchedule(tournamentId, allTeams, cupConfig, scheduleConfig, occupiedSlots)

    } else if (scheduleType === 'league') {
      // 联赛制
      var lg = (event.ranking && event.ranking.length > 0)
        ? { ranking: event.ranking, leagueConfig: event.leagueConfig }
        : await loadLeagueData(tournamentId, divisionId)
      var ranking = lg.ranking || []
      if (lg.notConfirmed) return { success: false, code: 'DRAW_NOT_CONFIRMED', message: '当前组别联赛排序尚未正式确认，不能生成赛程' }
      var leagueConfig = lg.leagueConfig || event.leagueConfig || { loopType: 'single' }
      if (ranking.length === 0) {
        return { success: false, message: '未找到联赛球队数据，请先在抽签分组页面完成球队分配并保存' }
      }
      var leagueValidation = validateParticipantSet(ranking.map(function(item) { return item.team }), approvedParticipantIds, expectedTeamCount)
      if (!leagueValidation.valid) return { success: false, code: leagueValidation.code, message: leagueValidation.message }
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

    if (matches.fullRankingComplete === false) {
      return {
        success: false,
        code: 'FULL_RANKING_RULE_CONFIRMATION_REQUIRED',
        message: (matches.generationWarnings || ['当前配置无法生成公平、完整的全排名']).join('；'),
        warnings: matches.generationWarnings || []
      }
    }

    decorateGeneratedMatches(matches, tournamentId, divisionId, divisionName, scheduleConfig)

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
      data: Object.assign({}, updateData, {
        status: 'ongoing',
        scheduleGenerated: true,
        scheduleEngineVersion: SCHEDULE_ENGINE_VERSION,
        scheduleGenerationMode: 'separate',
        scheduleDraft: db.command.set(null),
        scheduleType: scheduleType,
        orgId: actor.orgId,
        updateTime: db.serverDate()
      })
    })
    if (divisionId && divisionId !== 'default') {
      await db.collection('divisions').doc(divisionId).update({ data: {
        scheduleConfig: db.command.set(scheduleConfig),
        scheduleVenueConfigured: true,
        scheduleGenerated: true,
        scheduleEngineVersion: SCHEDULE_ENGINE_VERSION,
        scheduleConfiguredAt: db.serverDate(),
        updateTime: db.serverDate()
      } })
    }

    console.log('赛程生成成功:', matches.length, '场')

    return {
      success: true,
      message: '成功生成 ' + matches.length + ' 场比赛',
      matchCount: matches.length,
      generationMode: 'separate',
      scheduleEngineVersion: SCHEDULE_ENGINE_VERSION,
      divisionId: divisionId,
      fullRankingEnabled: matches.fullRankingEnabled === true,
      finalRankingMode: rankingMode,
      warnings: matches.generationWarnings || [],
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

// 仅供本地纯逻辑回归使用；云函数正式入口仍只有 main，测试不会连接或写入云端。
exports.__test = {
  buildRoundRobinRounds: buildRoundRobinRounds,
  generateTournamentSchedule: generateTournamentSchedule,
  generateCupSchedule: generateCupSchedule,
  generateLeagueSchedule: generateLeagueSchedule,
  validateGeneratedSchedule: validateGeneratedSchedule,
  validateParticipantSet: validateParticipantSet,
  normalizeScheduleTiming: normalizeScheduleTiming,
  sanitizeScheduleDraft: sanitizeScheduleDraft
}
