const text = value => value == null ? '' : String(value).trim()
const playerId = row => text(row?.playerId || row?.id || row?._id)
const typeOf = row => ({ second_yellow:'second_yellow_red', yellow_red:'second_yellow_red', red:'red_card', redcard:'red_card' })[text(row?.type || row?.eventType).toLowerCase()] || text(row?.type || row?.eventType).toLowerCase()
const liveEvent = row => row && !row.deleted && !['deleted','revoked','cancelled'].includes(text(row.status))
const integer = value => value !== '' && value != null && Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null
const hasSubstitutionRule = row => row && ['substitutionMode','substitutionReentryAllowed','allowSubBack','substitutionLimit','maxSubstitutions'].some(key => row[key] != null)
const timeValue = value => { const parsed = value instanceof Date ? value.getTime() : new Date(value || '').getTime(); return Number.isFinite(parsed) ? parsed : 0 }

export function substitutionRules(match = {}, division = {}, tournament = {}) {
  const matchStatus = text(match.status).toLowerCase()
  const matchStarted = ['ongoing','in_progress','live','started','halftime','completed','finished'].includes(matchStatus) ||
    Boolean(match.refereeClockStartedAt || match.actualKickoffAt || match.refereeRecordLocked)
  const divisionRules = division.activeRulesSnapshot || division.rulesSnapshot || division.publishedRegulationsSnapshot || division
  let historicalRules = null
  if (matchStarted) {
    const startedAt = timeValue(match.refereeStartedAt || match.refereeClockStartedAt || match.actualKickoffAt || match.startedAt)
    if (startedAt) {
      historicalRules = (Array.isArray(division.rulesHistory) ? division.rulesHistory : [])
        .filter(row => hasSubstitutionRule(row && row.snapshot) && timeValue(row.revisedAt) >= startedAt)
        .sort((a,b) => timeValue(a.revisedAt) - timeValue(b.revisedAt))[0]?.snapshot || null
    }
  }
  const sources = matchStarted
    ? [match.substitutionRulesSnapshot, match.rulesSnapshot, match.publishedRegulationsSnapshot, historicalRules, division.activeRulesSnapshot,
      division.rulesSnapshot, division.publishedRegulationsSnapshot, division, tournament.rulesSnapshot, tournament.rules?.substitutions, tournament]
    : [divisionRules, match.substitutionRulesSnapshot, match.rulesSnapshot, match.publishedRegulationsSnapshot, division.activeRulesSnapshot,
      division.rulesSnapshot, division.publishedRegulationsSnapshot, division, tournament.rulesSnapshot, tournament.rules?.substitutions, tournament]
  const source = sources.find(hasSubstitutionRule) || {}
  const mode = text(source.substitutionMode) || 'limited'
  const explicit = source.substitutionReentryAllowed ?? source.allowSubBack
  const allowReentry = explicit == null ? mode === 'free' : explicit === true
  const unlimited = ['free','unlimited'].includes(mode)
  return { mode, allowReentry, limit:unlimited ? null : integer(source.substitutionLimit ?? source.maxSubstitutions),
    windows:unlimited ? null : integer(source.substitutionWindows), ruleKnown:Object.keys(source).length > 0,
    label:Object.keys(source).length ? (allowReentry ? '允许换下后再次上场' : '换下后不能再次上场') : '换人规则待确认' }
}

export function matchLineup(match, side) {
  const direct = match[side + 'Lineup']
  const raw = direct && (direct.submitted || direct.starters?.length || direct.players?.length) ? direct : match.refereeRosters?.[side] || match.lineups?.[side] || direct
  if (!raw) return { known:false, starters:[], substitutes:[] }
  const starters = raw.starters || raw.players || [], substitutes = raw.substitutes || raw.bench || []
  return { known:Array.isArray(starters) && starters.length > 0, starters:Array.isArray(starters) ? starters : [], substitutes:Array.isArray(substitutes) ? substitutes : [] }
}

export function eventIdentity(event) {
  return text(event.eventId || event._id) || [typeOf(event),event.minute,event.teamSide,event.teamId,
    event.inPlayerId || event.playerId,event.playerName,event.playerNumber,
    event.outPlayerId || event.assistPlayerId,event.assistName,event.assistNumber].map(text).join('|')
}
const eventContent = event => JSON.stringify([typeOf(event),event.minute,event.teamSide,event.teamId,event.inPlayerId || event.playerId,event.playerName,event.playerNumber,event.outPlayerId || event.assistPlayerId,event.assistName,event.assistNumber].map(text))

function findPlayer(pool, id, name, number) {
  if (text(id)) return pool.find(row => playerId(row) === text(id)) || null
  const rows = pool.filter(row => text(row.name || row.playerName) === text(name) &&
    (number == null || number === '' || text(row.number ?? row.jerseyNumber) === text(number)))
  // Compatibility resolves only an unambiguous player in this exact match roster.
  return rows.length === 1 && playerId(rows[0]) ? rows[0] : null
}

export function substitutionState(match = {}, rules = substitutionRules(match), events = match.events || [], atMinute = Infinity) {
  const issues = [], sides = {}
  for(const event of events.filter(row=>liveEvent(row)&&['substitution','red_card','second_yellow_red'].includes(typeOf(row)))) {
    if(!['home','away'].includes(event.teamSide) && ![text(match.homeTeamId),text(match.awayTeamId)].filter(Boolean).includes(text(event.teamId)))issues.push({side:'unknown',eventKey:eventIdentity(event),eventId:text(event.eventId),minute:event.minute,code:'SUB_TEAM_REQUIRED',message:'换人或罚下记录缺少有效球队，请先修正'})
    else if(event.teamSide && event.teamId && text(event.teamId)!==text(match[event.teamSide+'TeamId']))issues.push({side:event.teamSide,eventKey:eventIdentity(event),eventId:text(event.eventId),minute:event.minute,code:'SUB_TEAM_CONFLICT',message:'事件球队与主客队不一致，请先修正'})
  }
  for (const side of ['home','away']) {
    const lineup = matchLineup(match,side), pool = [...lineup.starters,...lineup.substitutes]
    const ids = pool.map(playerId).filter(Boolean)
    const active = new Set(lineup.starters.map(playerId).filter(Boolean)), sentOff = new Set(), used = new Set()
    const sideIssues = [], windows = new Set(), batchPlayers = new Map(); let count = 0
    function issue(event,code,message) {
      const row = { side, eventId:text(event.eventId), eventKey:eventIdentity(event), minute:event.minute, code, message }
      issues.push(row); sideIssues.push(row)
    }
    const timeline = events.map((event,index)=>({event,index})).filter(({event})=>liveEvent(event) &&
      (event.teamSide === side || (!event.teamSide && text(event.teamId) === text(match[side+'TeamId']))) &&
      ['substitution','red_card','second_yellow_red'].includes(typeOf(event)) && (integer(event.minute) == null || Number(event.minute) <= atMinute))
      .sort((a,b)=>(Number(a.event.minute)||0)-(Number(b.event.minute)||0)||a.index-b.index)
    for (const {event} of timeline) {
      if (!lineup.known || active.size === 0 && !ids.length) { issue(event,'SUB_LINEUP_REQUIRED','缺少本场首发与替补名单，请先补齐'); continue }
      if (ids.length !== new Set(ids).size || pool.some(row=>!playerId(row))) { issue(event,'SUB_ROSTER_ID_INVALID','本场名单缺少或重复球员 ID，请先修正'); continue }
      if (integer(event.minute) == null) { issue(event,'SUB_MINUTE_REQUIRED','换人或罚下分钟不完整，请先修正'); continue }
      const incoming = findPlayer(pool,event.inPlayerId || event.playerId,event.playerName,event.playerNumber)
      const incomingId = playerId(incoming)
      if (typeOf(event) !== 'substitution') {
        if (!incoming) { issue(event,'SUB_RED_PLAYER_UNKNOWN','罚下记录未关联本场球员，请先修正'); continue }
        sentOff.add(incomingId); active.delete(incomingId); continue
      }
      const outgoing = findPlayer(pool,event.outPlayerId || event.assistPlayerId,event.assistName,event.assistNumber)
      const outgoingId = playerId(outgoing)
      if (!incoming || !outgoing) { issue(event,'SUB_PLAYER_UNKNOWN','换上或换下球员未关联本场名单，请核对姓名、号码与 ID'); continue }
      if (incomingId === outgoingId) { issue(event,'SUB_SAME_PLAYER','同一球员不能同时换上和换下'); continue }
      if (!active.has(outgoingId)) { issue(event,'SUB_OUT_NOT_ACTIVE',`${text(outgoing.name)}当前不在场，请核对首发或此前换人`); continue }
      if (active.has(incomingId)) { issue(event,'SUB_IN_ALREADY_ACTIVE',`${text(incoming.name)}当前已在场，不能重复换入`); continue }
      if (sentOff.has(incomingId)) { issue(event,'SUB_PLAYER_SENT_OFF',`${text(incoming.name)}已被罚下，不能再次上场`); continue }
      if (!rules.allowReentry && (!lineup.substitutes.some(row=>playerId(row)===incomingId) || used.has(incomingId))) {
        issue(event,rules.ruleKnown ? 'SUB_REENTRY_NOT_ALLOWED' : 'SUB_RULES_UNVERIFIED',rules.ruleKnown ? '本场不允许换回，换上球员须为尚未上场的替补' : '换人规则未确认，请先核对本组规程'); continue
      }
      const window = text(event.substitutionBatchId) || `${Number(event.minute)}:${text(event.substitutionPeriod)}`
      const batchId = text(event.substitutionBatchId)
      if(batchId && batchPlayers.has(batchId) && [incomingId,outgoingId].some(id=>batchPlayers.get(batchId).has(id))) { issue(event,'SUB_BATCH_DUPLICATE','同一批换人不能重复选择球员'); continue }
      const isWindow = event.substitutionPeriod !== 'halftime'
      if (rules.limit != null && count >= rules.limit) { issue(event,'SUB_LIMIT_REACHED',`本场已达到 ${rules.limit} 人换人上限`); continue }
      if (isWindow && rules.windows != null && !windows.has(window) && windows.size >= rules.windows) {
        issue(event,'SUB_WINDOWS_REACHED',`本场已达到 ${rules.windows} 次换人窗口上限`); continue
      }
      active.delete(outgoingId); active.add(incomingId); used.add(incomingId); count++
      if(batchId){if(!batchPlayers.has(batchId))batchPlayers.set(batchId,new Set());batchPlayers.get(batchId).add(incomingId);batchPlayers.get(batchId).add(outgoingId)}
      if (isWindow) windows.add(window)
    }
    const outgoing = pool.filter(row=>active.has(playerId(row)))
    const incoming = pool.filter(row=>!active.has(playerId(row)) && !sentOff.has(playerId(row)) &&
      (rules.allowReentry || lineup.substitutes.some(item=>playerId(item)===playerId(row)) && !used.has(playerId(row))))
    sides[side] = { known:lineup.known, incoming, outgoing, issues:sideIssues, count, windowCount:windows.size }
  }
  return { rules, sides, issues }
}

export function assertSubstitutionChange(match, rules, proposed) {
  const oldRows = new Map((match.events || []).filter(liveEvent).map(row=>[eventIdentity(row),eventContent(row)]))
  const seen = new Set()
  for(const row of proposed.filter(liveEvent)){const key=eventIdentity(row);if(seen.has(key))throw Object.assign(new Error('比赛事件 ID 重复，请刷新后重试'),{code:'SUB_EVENT_DUPLICATE'});seen.add(key)}
  const added = proposed.filter(row=>liveEvent(row)&&typeOf(row)==='substitution'&&oldRows.get(eventIdentity(row))!==eventContent(row))
  if(added.length&&!rules.ruleKnown)throw Object.assign(new Error('换人规则未确认，请先核对本组规程'),{code:'SUB_RULES_UNVERIFIED'})
  const before = substitutionState(match,rules,match.events || [])
  const after = substitutionState(match,rules,proposed)
  const previous = new Set(before.issues.map(row=>row.eventKey+'|'+row.code))
  const conflict = after.issues.find(row=>!previous.has(row.eventKey+'|'+row.code))
  if (conflict) throw Object.assign(new Error(conflict.message),{code:conflict.code,issue:conflict})
  // An unresolved earlier event makes subsequent player state uncertain.
  for(const event of added) {
    const side = event.teamSide === 'away' ? 'away' : 'home'
    const prior = before.issues.find(row=>row.side===side && Number(row.minute)<=Number(event.minute) && after.issues.some(issue=>issue.eventKey===row.eventKey))
    if(prior)throw Object.assign(new Error(`请先修正本队第 ${prior.minute} 分钟记录：${prior.message}`),{code:'SUB_HISTORY_UNVERIFIED',issue:prior})
  }
  return after
}

export function normalizeSubstitutionRecords(match, events) {
  const oldRows = new Map((match.events || []).filter(liveEvent).map(row=>[eventIdentity(row),eventContent(row)]))
  return events.map(event=>{
    if(typeOf(event)!=='substitution' || oldRows.get(eventIdentity(event))===eventContent(event))return event
    const side=event.teamSide==='away'?'away':'home',lineup=matchLineup(match,side),pool=[...lineup.starters,...lineup.substitutes]
    const incoming=findPlayer(pool,event.inPlayerId || event.playerId,event.playerName,event.playerNumber)
    const outgoing=findPlayer(pool,event.outPlayerId || event.assistPlayerId,event.assistName,event.assistNumber)
    if(!incoming || !outgoing)throw Object.assign(new Error('换人球员未关联本场名单'),{code:'SUB_PLAYER_UNKNOWN'})
    return {...event,teamSide:side,teamId:text(match[side+'TeamId']),inPlayerId:playerId(incoming),playerId:playerId(incoming),playerName:text(incoming.name || incoming.playerName),playerNumber:text(incoming.number ?? incoming.jerseyNumber),outPlayerId:playerId(outgoing),assistPlayerId:playerId(outgoing),assistName:text(outgoing.name || outgoing.playerName),assistNumber:text(outgoing.number ?? outgoing.jerseyNumber)}
  })
}
