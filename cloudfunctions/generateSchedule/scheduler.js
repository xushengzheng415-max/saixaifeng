'use strict'

const stageOrder = require('./stageOrder.cjs')

function dateText(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function minuteOfDay(time) {
  const parts = String(time || '').split(':').map(Number)
  return (parts[0] || 0) * 60 + (parts[1] || 0)
}

function normalizeSessionWindows(input) {
  const defaults = [
    { key:'morning',label:'上午',enabled:true,start:'09:00',end:'12:00' },
    { key:'afternoon',label:'下午',enabled:true,start:'14:00',end:'17:00' },
    { key:'evening',label:'晚上',enabled:false,start:'18:00',end:'21:00' }
  ]
  if (!Array.isArray(input) || input.length === 0) return []
  return defaults.map(defaultWindow => {
    const source = input.find(item => item && item.key === defaultWindow.key) || {}
    return {
      key: defaultWindow.key,
      label: defaultWindow.label,
      enabled: source.enabled === true,
      start: String(source.start || defaultWindow.start),
      end: String(source.end || defaultWindow.end)
    }
  }).filter(window => window.enabled && minuteOfDay(window.start) < minuteOfDay(window.end))
}

function timeText(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2,'0')}:${String(minutes % 60).padStart(2,'0')}`
}

function buildTimeSlots(config) {
  config = config || {}
  const windows = normalizeSessionWindows(config.sessionWindows)
  if (windows.length === 0) return (config.timeSlots || config.timeslots || []).slice().sort()
  const slotMinutes = Math.max(1,Number(config.timeStepMinutes || config.slotMinutes || 60))
  const slots = []
  windows.forEach(window => {
    const end = minuteOfDay(window.end)
    for (let minute = minuteOfDay(window.start); minute < end; minute += slotMinutes) {
      if (minute + slotMinutes <= end) slots.push(timeText(minute))
    }
  })
  return [...new Set(slots)].sort()
}

function normalizeExplicitTimes(input) {
  return Array.from(new Set((Array.isArray(input) ? input : []).map(value => {
    const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/)
    if (!match) return ''
    return `${match[1].padStart(2,'0')}:${match[2]}`
  }).filter(Boolean))).sort()
}

function normalizeVenueResources(config) {
  config = config || {}
  const configured = Array.isArray(config.venueResources) ? config.venueResources : []
  const resources = configured.map(resource => ({
    venue: String(resource && (resource.name || resource.venue) || '').trim(),
    fieldFormat: String(resource && (resource.fieldFormat || resource.matchFormat) || '').trim().toLowerCase(),
    sessionWindows: Array.isArray(resource && resource.sessionWindows) ? resource.sessionWindows : config.sessionWindows,
    kickoffTimes: normalizeExplicitTimes(resource && resource.kickoffTimes)
  })).filter(resource => resource.venue && resource.fieldFormat)
  if (resources.length > 0) return resources
  return (config.venues || []).map(venue => ({ venue:typeof venue === 'string' ? venue : String(venue && (venue.name || venue.venueName) || '').trim(),fieldFormat:String(typeof venue==='object' && (venue.fieldFormat || venue.matchFormat) || config.fieldFormat || '').toLowerCase(),sessionWindows:config.sessionWindows,kickoffTimes:normalizeExplicitTimes(typeof venue==='object' && venue.kickoffTimes) })).filter(resource => resource.venue && resource.fieldFormat)
}

function buildVenueSlots(config) {
  const resources = normalizeVenueResources(config)
  const slots = []
  resources.forEach(resource => {
    const windows = normalizeSessionWindows(resource.sessionWindows)
    // 场地自带开赛点时以它为准（赛程设置按「首场/末场 + 本制式比赛时长 + 转场」逐点推算），
    // 否则退回按开放时段与步进推算，保持旧配置兼容。
    const times = resource.kickoffTimes.length ? resource.kickoffTimes : buildTimeSlots({ ...config,sessionWindows:resource.sessionWindows })
    times.forEach(time => {
      const session = sessionName(time,resource.sessionWindows)
      const window = windows.find(item => item.key === session)
      slots.push({ venue:resource.venue,fieldFormat:resource.fieldFormat,time,session,windowEnd:window && window.end || '' })
    })
  })
  return slots.sort((left,right) => left.time.localeCompare(right.time) || left.venue.localeCompare(right.venue,'zh-CN',{ numeric:true }))
}

function sessionName(time, sessionWindows) {
  const minute = minuteOfDay(time)
  const windows = normalizeSessionWindows(sessionWindows)
  const matched = windows.find(window => minute >= minuteOfDay(window.start) && minute < minuteOfDay(window.end))
  if (matched) return matched.key
  if (minute < 12 * 60) return 'morning'
  if (minute < 18 * 60) return 'afternoon'
  return 'evening'
}

function slotKey(matchDate, matchTime, venue) {
  return `${matchDate}|${matchTime}|${venue}`
}

function dayAllowed(date, matchDays, matchDates) {
  if (Array.isArray(matchDates) && matchDates.length) return matchDates.indexOf(dateText(date)) >= 0
  if (!Array.isArray(matchDays) || matchDays.length === 0) return true
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return matchDays.indexOf(names[date.getDay()]) >= 0
}

function matchScope(match) { return String(match && (match.divisionId || match.competitionGroup || 'default') || 'default') }
function scopedMatchKey(match, matchNo) { return `${matchScope(match)}:${Number(matchNo || match && (match.matchNo || match.matchIndex) || 0)}` }

function sourceTeamIds(source, match) {
  if (!source) return []
  if (source.type === 'seed') return [source.teamId].filter(Boolean)
  const scope=matchScope(match)
  if (source.type === 'group_rank') return [`${scope}:group_rank:${source.groupName}:${source.rank}`]
  if (source.type === 'match_winner') return [`${scope}:match_winner:${source.matchNo}`]
  if (source.type === 'match_loser') return [`${scope}:match_loser:${source.matchNo}`]
  return []
}

function participantIds(match, matchMap, cache, visiting) {
  const direct = [match.homeTeamId, match.awayTeamId].filter(Boolean)
  const sourced = sourceTeamIds(match.homeSource,match).concat(sourceTeamIds(match.awaySource,match))
  return Array.from(new Set(direct.concat(sourced).map(String)))
}

function matchParticipantKeysForHistory(match) {
  return Array.from(new Set([match && match.homeTeamId,match && match.awayTeamId].filter(Boolean).map(String)))
}

function dependencyDepth(match, matchMap, cache, visiting) {
  const matchNo = Number(match.matchNo || match.matchIndex || 0)
  const key=scopedMatchKey(match,matchNo)
  if (cache.has(key)) return cache.get(key)
  if (visiting.has(key)) return 0
  visiting.add(key)
  const dependencies = (match.dependencyMatchNos || []).map(Number).filter(Boolean)
  let depth = 0
  dependencies.forEach(no => {
    const dependency = matchMap.get(scopedMatchKey(match,no))
    if (dependency) depth = Math.max(depth, dependencyDepth(dependency, matchMap, cache, visiting) + 1)
  })
  visiting.delete(key)
  cache.set(key, depth)
  return depth
}

function timestamp(matchDate, matchTime) {
  return new Date(`${matchDate}T${matchTime}:00`).getTime()
}

function schedulePolicyForMatch(match, config) {
  const scope = matchScope(match)
  const policies = config && config.divisionPolicies && typeof config.divisionPolicies === 'object' ? config.divisionPolicies : {}
  const override = policies[scope] || {}
  const format = String(match && (match.requiredVenueFormat || match.matchFormat) || config && config.matchFormat || '').toLowerCase()
  const adaptive = Number(config && config.schemaVersion || 1) >= 2 && String(config && config.frequencyPreset || 'adaptive') === 'adaptive'
  const elevenSide = format === '11side'
  const maxMatchesPerDay = Math.max(1, Number(override.maxMatchesPerDay || (adaptive ? (elevenSide ? 1 : 2) : config.maxMatchesPerDay || 99)))
  const maxPerSession = Math.max(1, Number(override.maxPerSession || config.maxPerSession || 1))
  const minRestMinutes = Math.max(0, Number(override.minRestMinutes != null ? override.minRestMinutes : (adaptive ? (elevenSide ? 1080 : 120) : config.restMinutes == null ? 90 : config.restMinutes)))
  const turnaroundMinutes = Math.max(0, Number(override.turnaroundMinutes != null ? override.turnaroundMinutes : config.defaultTurnaroundMinutes != null ? config.defaultTurnaroundMinutes : config.matchInterval || 0))
  return { maxMatchesPerDay,maxPerSession,minRestMinutes,turnaroundMinutes,allowedDates:Array.isArray(override.allowedDates)?override.allowedDates.map(String):[],allowedSessions:Array.isArray(override.allowedSessions)?override.allowedSessions.map(String):[],allowedVenues:Array.isArray(override.allowedVenues)?override.allowedVenues.map(String):[] }
}

function overlaps(leftStart, leftEnd, rightStart, rightEnd) {
  return leftStart < rightEnd && rightStart < leftEnd
}

function schedulingPriority(match) {
  return stageOrder.stageRankOf(match)
}

function finalStageOrder(match) {
  const name=String(match && match.roundName || '')
  if(/半决赛/.test(name)) return 0
  if(stageOrder.isThirdPlaceName(name)) return 1
  if(stageOrder.isFinalName(name)) return 2
  return 0
}

function stageName(index) {
  const names=['','一','二','三','四','五','六','七','八','九','十']
  return `第${names[index] || index}阶段`
}

function assign(matches, config, occupiedInput) {
  config = config || {}
  const venueSlots = buildVenueSlots(config)
  const startDate = new Date(config.startDate)
  if (Number.isNaN(startDate.getTime())) return { assigned: 0, unassigned: matches.length, reasons: ['比赛开始日期无效'] }
  if (venueSlots.length === 0) return { assigned: 0, unassigned: matches.length, reasons: ['比赛场地或日内阶段为空'] }

  const endDate = config.endDate ? new Date(config.endDate) : null
  const defaultDurationMinutes = Math.max(1, Number(config.matchDuration || config.durationMinutes || 50))
  const defaultBufferMinutes = Math.max(0, Number(config.defaultTurnaroundMinutes != null ? config.defaultTurnaroundMinutes : config.matchInterval || config.bufferMinutes || 0))
  const dailyLimit = Math.max(0, Number(config.dailyMatchLimit || 0))
  const maxDailyOne = config.maxDailyOne === true
  const maxPerSession = Math.max(1, Number(config.maxPerSession || 1))
  const occupied = new Set(occupiedInput || [])
  const matchMap = new Map()
  ;(matches || []).forEach(match => matchMap.set(scopedMatchKey(match), match))
  const idCache = new Map()
  const depthCache = new Map()
  const ordered = (matches || []).slice().sort((a, b) => {
    // 阶段次序：小组赛/联赛 → 前期淘汰轮 → 低段排位赛 → 半决赛 → 三四名 → 决赛；
    // 同阶段按轮次、依赖深度、场序排序。口径与演示端 shared/stageOrder.js 完全一致。
    const stageDiff = stageOrder.compareStage(a, b)
    if (stageDiff) return stageDiff
    return dependencyDepth(a, matchMap, depthCache, new Set()) - dependencyDepth(b, matchMap, depthCache, new Set()) || Number(a.matchNo || a.matchIndex || 0) - Number(b.matchNo || b.matchIndex || 0)
  })
  const scopeStages=new Map()
  ordered.forEach(match=>{const scope=matchScope(match);if(!scopeStages.has(scope))scopeStages.set(scope,[]);const priority=stageOrder.coarseRankOf(match);if(!scopeStages.get(scope).includes(priority))scopeStages.get(scope).push(priority)})
  scopeStages.forEach(stages=>stages.sort((a,b)=>a-b))
  ordered.forEach(match=>{if(Number(match.scheduleStageOrder)>0 && match.scheduleStageName)return;const stages=scopeStages.get(matchScope(match)) || [stageOrder.coarseRankOf(match)];const index=stages.indexOf(stageOrder.coarseRankOf(match))+1;match.scheduleStageOrder=index;match.scheduleStageName=stageName(index)})
  const teamHistory = new Map()
  const sessionCounts = new Map()
  const teamDailyCounts = new Map()
  const dailyCounts = new Map()
  const keyTimeUse = new Set()
  const venueIntervals = new Map()
  const finalsExclusive = config.finalStageExclusive === true
  const keyStageMatch = match => stageOrder.isFinalStage(match)
  const globalKeyTimeUse = new Set()
  const globalFinalsTimeUse = new Set()
  ;(Array.isArray(config.occupiedMatches) ? config.occupiedMatches : []).forEach(item => {
    if (!item || !item.matchDate || !item.matchTime || !item.venue) return
    const occupiedTimeKey = `${item.matchDate}|${item.matchTime}`
    globalKeyTimeUse.add(occupiedTimeKey)
    if (finalsExclusive && keyStageMatch(item)) globalFinalsTimeUse.add(occupiedTimeKey)
    const startMs = timestamp(item.matchDate,item.matchTime)
    const duration = Math.max(1,Number(item.durationMinutes || item.matchDuration || defaultDurationMinutes))
    const buffer = Math.max(0,Number(item.bufferMinutes == null ? defaultBufferMinutes : item.bufferMinutes))
    const list = venueIntervals.get(String(item.venue)) || []
    list.push({ startMs,endMs:startMs+(duration+buffer)*60000,matchId:item._id || '' })
    venueIntervals.set(String(item.venue),list)
    const session=sessionName(item.matchTime,config.sessionWindows)
    matchParticipantKeysForHistory(item).forEach(teamId=>{
      const history=teamHistory.get(teamId) || []
      history.push({ startMs,endMs:startMs+duration*60000 })
      teamHistory.set(teamId,history)
      const dailyKey=`${teamId}|${item.matchDate}`
      const sessionKey=`${dailyKey}|${session}`
      teamDailyCounts.set(dailyKey,(teamDailyCounts.get(dailyKey)||0)+1)
      sessionCounts.set(sessionKey,(sessionCounts.get(sessionKey)||0)+1)
    })
  })
  const reasons = []
  let assigned = 0

  ordered.forEach(match => {
    if (match.isBye) return
    const policy=schedulePolicyForMatch(match,config)
    const durationMinutes=Math.max(1,Number(match.durationMinutes || defaultDurationMinutes))
    const bufferMinutes=Math.max(0,Number(match.bufferMinutes == null ? policy.turnaroundMinutes : match.bufferMinutes))
    const participantKeys = participantIds(match, matchMap, idCache, new Set())
    const requiredFieldFormat=String(match.requiredVenueFormat || match.matchFormat || config.matchFormat || '').toLowerCase()
    const eligibleVenueSlots=requiredFieldFormat ? venueSlots.filter(slot => slot.fieldFormat===requiredFieldFormat) : []
    if (!requiredFieldFormat || eligibleVenueSlots.length===0) {
      match.scheduleStatus='unassigned'
      match.scheduleIssue=!requiredFieldFormat ? '比赛缺少几人制规则' : '没有兼容'+requiredFieldFormat.replace('side','人制')+'场地'
      reasons.push(`场序${match.matchNo || match.matchIndex}: ${match.scheduleIssue}`)
      return
    }
    const dependencies = (match.dependencyMatchNos || []).map(Number).filter(Boolean)
    const priority=schedulingPriority(match)
    const barrierMatches=priority>0 ? ordered.filter(item=>matchScope(item)===matchScope(match) && schedulingPriority(item)<priority) : []
    let placed = false
    let checkedDays = 0
    const maximumDays = endDate && !Number.isNaN(endDate.getTime())
      ? Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1)
      : 366

    for (let dayOffset = 0; dayOffset < maximumDays && !placed; dayOffset += 1) {
      const day = new Date(startDate)
      day.setDate(day.getDate() + dayOffset)
      if (!dayAllowed(day, config.matchDays, config.matchDates)) continue
      checkedDays += 1
      const currentDate = dateText(day)
      if (policy.allowedDates.length && policy.allowedDates.indexOf(currentDate) < 0) continue
      if (dailyLimit > 0 && (dailyCounts.get(currentDate) || 0) >= dailyLimit) continue
      for (let slotIndex = 0; slotIndex < eligibleVenueSlots.length && !placed; slotIndex += 1) {
        const currentTime = eligibleVenueSlots[slotIndex].time
        const venue = eligibleVenueSlots[slotIndex].venue
        const startMs = timestamp(currentDate, currentTime)
        const session = eligibleVenueSlots[slotIndex].session
        if (policy.allowedSessions.length && policy.allowedSessions.indexOf(session) < 0) continue
        if (policy.allowedVenues.length && policy.allowedVenues.indexOf(venue) < 0) continue
        const occupiedEndMs=startMs+(durationMinutes+bufferMinutes)*60000
        if (eligibleVenueSlots[slotIndex].windowEnd && occupiedEndMs>timestamp(currentDate,eligibleVenueSlots[slotIndex].windowEnd)) continue
        const venueBlocked=(venueIntervals.get(venue) || []).some(item=>overlaps(startMs,occupiedEndMs,item.startMs,item.endMs))
        if(venueBlocked) continue
        const barrierBlocked=barrierMatches.some(item=>{
          if(!item.matchDate || !item.matchTime) return true
          const itemDuration=Math.max(1,Number(item.durationMinutes || defaultDurationMinutes))
          return startMs < timestamp(item.matchDate,item.matchTime)+itemDuration*60000
        })
        if(barrierBlocked) continue
        const dependencyBlocked = dependencies.some(no => {
          const dependency = matchMap.get(scopedMatchKey(match,no))
          if (!dependency || !dependency.matchDate || !dependency.matchTime) return true
          const dependencyDuration=Math.max(1,Number(dependency.durationMinutes || defaultDurationMinutes))
          const dependencyEnd = timestamp(dependency.matchDate, dependency.matchTime) + dependencyDuration * 60000
          return startMs - dependencyEnd < policy.minRestMinutes * 60000
        })
        if (dependencyBlocked) continue
        const teamBlocked = participantKeys.some(teamId => {
          const history = teamHistory.get(teamId) || []
          if (history.some(item => startMs - item.endMs < policy.minRestMinutes * 60000)) return true
          const dailyKey = `${teamId}|${currentDate}`
          if ((maxDailyOne || policy.maxMatchesPerDay <= 1) && (teamDailyCounts.get(dailyKey) || 0) >= 1) return true
          if ((teamDailyCounts.get(dailyKey) || 0) >= policy.maxMatchesPerDay) return true
          const sessionKey = `${dailyKey}|${session}`
          return (sessionCounts.get(sessionKey) || 0) >= Math.min(maxPerSession,policy.maxPerSession)
        })
        if (teamBlocked) continue
        const critical = stageOrder.isFinalStage(match)
        const criticalKey=`${matchScope(match)}|${currentDate}|${currentTime}`
        if (critical && keyTimeUse.has(criticalKey)) continue
        if (finalsExclusive) {
          const globalTimeKey=`${currentDate}|${currentTime}`
          if (globalFinalsTimeUse.has(globalTimeKey)) continue
          if (keyStageMatch(match) && globalKeyTimeUse.has(globalTimeKey)) continue
        }

        const key = slotKey(currentDate, currentTime, venue)
        if (occupied.has(key)) continue
        occupied.add(key)
        const intervals=venueIntervals.get(venue) || []
        intervals.push({ startMs,endMs:occupiedEndMs,matchId:match._id || '' })
        venueIntervals.set(venue,intervals)
        match.matchDate = currentDate
        match.date = currentDate
        match.matchTime = currentTime
        match.startTime = currentTime
        match.timeSlot = currentTime
        match.venue = venue
        match.scheduleSession = session
        match.scheduleStatus = 'scheduled'
        match.durationMinutes = durationMinutes
        match.bufferMinutes = bufferMinutes
        dailyCounts.set(currentDate, (dailyCounts.get(currentDate) || 0) + 1)
        if (critical) keyTimeUse.add(criticalKey)
        if (finalsExclusive) {
          const placedTimeKey=`${currentDate}|${currentTime}`
          globalKeyTimeUse.add(placedTimeKey)
          if (keyStageMatch(match)) globalFinalsTimeUse.add(placedTimeKey)
        }
        participantKeys.forEach(teamId => {
          const history = teamHistory.get(teamId) || []
          history.push({ startMs, endMs: startMs + durationMinutes * 60000 })
          teamHistory.set(teamId, history)
          const dailyKey = `${teamId}|${currentDate}`
          const sessionKey = `${dailyKey}|${session}`
          teamDailyCounts.set(dailyKey, (teamDailyCounts.get(dailyKey) || 0) + 1)
          sessionCounts.set(sessionKey, (sessionCounts.get(sessionKey) || 0) + 1)
        })
        assigned += 1
        placed = true
      }
    }
    if (!placed) {
      match.scheduleStatus = 'unassigned'
      match.scheduleIssue = checkedDays === 0 ? '没有符合比赛日设置的日期' : '现有日期、时段、场地或球队休息约束不足'
      reasons.push(`场序${match.matchNo || match.matchIndex}: ${match.scheduleIssue}`)
    }
  })
  return { assigned, unassigned: ordered.filter(match => !match.isBye && !match.matchDate).length, reasons }
}

module.exports = { assign, participantIds, sessionName, buildTimeSlots, normalizeSessionWindows, normalizeVenueResources, buildVenueSlots, schedulingPriority, stageName, finalStageOrder, schedulePolicyForMatch, overlaps }
