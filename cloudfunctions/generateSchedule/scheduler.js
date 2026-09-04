'use strict'

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
  const slotMinutes = Math.max(1,Number(config.slotMinutes || 60))
  const slots = []
  windows.forEach(window => {
    const end = minuteOfDay(window.end)
    for (let minute = minuteOfDay(window.start); minute < end; minute += slotMinutes) {
      if (minute + slotMinutes <= end) slots.push(timeText(minute))
    }
  })
  return [...new Set(slots)].sort()
}

function normalizeVenueResources(config) {
  config = config || {}
  const configured = Array.isArray(config.venueResources) ? config.venueResources : []
  const resources = configured.map(resource => ({
    venue: String(resource && (resource.name || resource.venue) || '').trim(),
    fieldFormat: String(resource && (resource.fieldFormat || resource.matchFormat) || '').trim().toLowerCase(),
    sessionWindows: Array.isArray(resource && resource.sessionWindows) ? resource.sessionWindows : config.sessionWindows
  })).filter(resource => resource.venue && resource.fieldFormat)
  if (resources.length > 0) return resources
  return (config.venues || []).map(venue => ({ venue:typeof venue === 'string' ? venue : String(venue && (venue.name || venue.venueName) || '').trim(),fieldFormat:String(typeof venue==='object' && (venue.fieldFormat || venue.matchFormat) || config.fieldFormat || '').toLowerCase(),sessionWindows:config.sessionWindows })).filter(resource => resource.venue && resource.fieldFormat)
}

function buildVenueSlots(config) {
  const resources = normalizeVenueResources(config)
  const slots = []
  resources.forEach(resource => {
    const times = buildTimeSlots({ ...config,sessionWindows:resource.sessionWindows })
    times.forEach(time => slots.push({ venue:resource.venue,fieldFormat:resource.fieldFormat,time,session:sessionName(time,resource.sessionWindows) }))
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

function dayAllowed(date, matchDays) {
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

function schedulingPriority(match) {
  const roundName=String(match && match.roundName || '')
  const phase=String(match && (match.phase || match.scheduleType) || '').toLowerCase()
  if(roundName==='决赛' || /冠亚军决赛/.test(roundName)) return 60
  if(/三、四名决赛|三四名决赛|^3[–—-]4名/.test(roundName)) return 60
  if(/半决赛/.test(roundName)) return 60
  if(phase==='placement' || /排位赛/.test(roundName)) {
    const range=String(match && match.rankRange || roundName)
    const low=Number((range.match(/(\d+)\s*[–—-]/) || [])[1] || match && match.finalRankHigh || 0)
    if(low>=17) return 10
    if(low>=9) return 30
    if(low>=5) return 50
    if(low>=3) return 70
    return 50
  }
  if(/1\/16决赛/.test(roundName)) return 0
  if(/1\/8决赛/.test(roundName)) return 20
  if(/1\/4决赛/.test(roundName)) return 40
  if(match && match.isCritical===true) return 60
  return 0
}

function finalStageOrder(match) {
  const name=String(match && match.roundName || '')
  if(/半决赛/.test(name)) return 0
  if(/三、四名决赛|三四名决赛|^3[–—-]4名/.test(name)) return 1
  if(name==='决赛' || /冠亚军决赛/.test(name)) return 2
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
  const defaultBufferMinutes = Math.max(0, Number(config.matchInterval || config.bufferMinutes || 0))
  const restMinutes = Math.max(0, Number(config.restMinutes == null ? 90 : config.restMinutes))
  const dailyLimit = Math.max(0, Number(config.dailyMatchLimit || 0))
  const maxDailyOne = config.maxDailyOne === true
  const maxPerSession = Math.max(1, Number(config.maxPerSession || 1))
  const occupied = new Set(occupiedInput || [])
  const matchMap = new Map()
  ;(matches || []).forEach(match => matchMap.set(scopedMatchKey(match), match))
  const idCache = new Map()
  const depthCache = new Map()
  const ordered = (matches || []).slice().sort((a, b) => {
    const priorityDiff=schedulingPriority(a)-schedulingPriority(b)
    if(priorityDiff) return priorityDiff
    const depthDiff = dependencyDepth(a, matchMap, depthCache, new Set()) - dependencyDepth(b, matchMap, depthCache, new Set())
    const finalOrderDiff=schedulingPriority(a)===60 ? finalStageOrder(a)-finalStageOrder(b) : 0
    return depthDiff || finalOrderDiff || Number(a.matchNo || a.matchIndex || 0) - Number(b.matchNo || b.matchIndex || 0)
  })
  const scopeStages=new Map()
  ordered.forEach(match=>{const scope=matchScope(match);if(!scopeStages.has(scope))scopeStages.set(scope,[]);const priority=schedulingPriority(match);if(!scopeStages.get(scope).includes(priority))scopeStages.get(scope).push(priority)})
  scopeStages.forEach(stages=>stages.sort((a,b)=>a-b))
  ordered.forEach(match=>{const stages=scopeStages.get(matchScope(match)) || [schedulingPriority(match)];const index=stages.indexOf(schedulingPriority(match))+1;match.scheduleStageOrder=index;match.scheduleStageName=stageName(index)})
  const teamHistory = new Map()
  const sessionCounts = new Map()
  const dailyCounts = new Map()
  const keyTimeUse = new Set()
  const reasons = []
  let assigned = 0

  ordered.forEach(match => {
    if (match.isBye) return
    const durationMinutes=Math.max(1,Number(match.durationMinutes || defaultDurationMinutes))
    const bufferMinutes=Math.max(0,Number(match.bufferMinutes == null ? defaultBufferMinutes : match.bufferMinutes))
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
      if (!dayAllowed(day, config.matchDays)) continue
      checkedDays += 1
      const currentDate = dateText(day)
      if (dailyLimit > 0 && (dailyCounts.get(currentDate) || 0) >= dailyLimit) continue
      for (let slotIndex = 0; slotIndex < eligibleVenueSlots.length && !placed; slotIndex += 1) {
        const currentTime = eligibleVenueSlots[slotIndex].time
        const venue = eligibleVenueSlots[slotIndex].venue
        const startMs = timestamp(currentDate, currentTime)
        const session = eligibleVenueSlots[slotIndex].session
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
          return startMs - dependencyEnd < restMinutes * 60000
        })
        if (dependencyBlocked) continue
        const teamBlocked = participantKeys.some(teamId => {
          const history = teamHistory.get(teamId) || []
          if (history.some(item => startMs - item.endMs < restMinutes * 60000)) return true
          const dailyKey = `${teamId}|${currentDate}`
          if (maxDailyOne && (sessionCounts.get(dailyKey) || 0) >= 1) return true
          const sessionKey = `${dailyKey}|${session}`
          return (sessionCounts.get(sessionKey) || 0) >= maxPerSession
        })
        if (teamBlocked) continue
        const critical = /决赛|半决赛/.test(String(match.roundName || ''))
        const criticalKey=`${matchScope(match)}|${currentDate}|${currentTime}`
        if (critical && keyTimeUse.has(criticalKey)) continue

        const key = slotKey(currentDate, currentTime, venue)
        if (occupied.has(key)) continue
        occupied.add(key)
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
        participantKeys.forEach(teamId => {
          const history = teamHistory.get(teamId) || []
          history.push({ startMs, endMs: startMs + durationMinutes * 60000 })
          teamHistory.set(teamId, history)
          const dailyKey = `${teamId}|${currentDate}`
          const sessionKey = `${dailyKey}|${session}`
          sessionCounts.set(dailyKey, (sessionCounts.get(dailyKey) || 0) + 1)
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

module.exports = { assign, participantIds, sessionName, buildTimeSlots, normalizeSessionWindows, normalizeVenueResources, buildVenueSlots, schedulingPriority, stageName, finalStageOrder }
