const text = value => String(value || '').trim().toLowerCase()

const EVENT_TYPE_ALIASES = {
  score: 'goal',
  penalty_goal: 'penalty_scored',
  penalty_miss: 'penalty_missed',
  missed_penalty: 'penalty_missed',
  yellow: 'yellow_card',
  yellowcard: 'yellow_card',
  red: 'red_card',
  redcard: 'red_card',
  second_yellow: 'second_yellow_red',
  yellow_red: 'second_yellow_red'
}

export function canonicalEventType(event) {
  const raw = text(typeof event === 'string' ? event : event?.type || event?.eventType)
  return EVENT_TYPE_ALIASES[raw] || raw
}

export function eventIdentity(event) {
  const id = String(event?._id || event?.eventId || event?.id || '').trim()
  if (id) return `id:${id}`
  return [
    canonicalEventType(event),
    Number(event?.minute || 0),
    String(event?.playerId || '').trim(),
    String(event?.playerName || event?.player || '').trim(),
    String(event?.teamId || '').trim(),
    String(event?.teamSide || event?.side || '').trim(),
    String(event?.penaltyOutcome || '').trim()
  ].join('|')
}

export function normalizeMatchEvent(event, context = {}) {
  if (!event || typeof event !== 'object') return null
  const teamSide = event.teamSide === 'away' || event.side === 'away' ? 'away' : 'home'
  const type = canonicalEventType(event)
  return {
    ...event,
    type,
    eventId: String(event.eventId || event._id || event.id || '').trim(),
    minute: Number.isFinite(Number(event.minute)) ? Number(event.minute) : 0,
    teamSide,
    teamId: String(event.teamId || context[`${teamSide}TeamId`] || '').trim(),
    playerId: String(event.playerId || event.player || '').trim(),
    playerName: String(event.playerName || event.player || '').trim(),
    assistPlayerId: String(event.assistPlayerId || event.assistId || '').trim(),
    assistName: String(event.assistName || event.assist || '').trim()
  }
}

export function normalizeMatchEvents(events, context = {}) {
  const seen = new Set()
  return (Array.isArray(events) ? events : []).map(event => normalizeMatchEvent(event, context)).filter(event => {
    if (!event) return false
    const key = eventIdentity(event)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).sort((a, b) => a.minute - b.minute)
}

export function mergeMatchEvents(primaryEvents, secondaryEvents, context = {}) {
  return normalizeMatchEvents([...(primaryEvents || []), ...(secondaryEvents || [])], context)
}

export function isPenaltyScored(event) {
  const type = canonicalEventType(event)
  if (type === 'penalty_missed' || type === 'penalty_miss') return false
  if (event?.penaltyOutcome === 'missed' || event?.penaltyScored === false) return false
  return type === 'penalty' || type === 'penalty_scored' || event?.isPenalty === true && event?.penaltyOutcome === 'scored'
}

export function isPenaltyMissed(event) {
  const type = canonicalEventType(event)
  return type === 'penalty_missed' || type === 'penalty_miss' || event?.penaltyOutcome === 'missed' || event?.penaltyScored === false
}

export function isOwnGoal(event) {
  return canonicalEventType(event) === 'own_goal' || event?.goalType === 'own_goal'
}

export function isSecondYellowRed(event) {
  const type = canonicalEventType(event)
  return type === 'second_yellow_red' || type === 'yellow_red' || event?.disciplinaryOutcome === 'second_yellow_red'
}

export function cardEventCounts(event) {
  // 本场第一张黄牌已经单独记账；本事件只新增第二张黄牌对应的纪律结果：黄1、红1。
  if (isSecondYellowRed(event)) return { yellow: 1, red: 1 }
  const type = canonicalEventType(event)
  return { yellow: type === 'yellow_card' ? 1 : 0, red: type === 'red_card' ? 1 : 0 }
}

export function isGoalEvent(event) {
  const type = canonicalEventType(event)
  return type === 'goal' || type === 'score' || isPenaltyScored(event) || isOwnGoal(event)
}

// 射手榜不把乌龙球计入进球球员，但比赛事件、战报仍展示 OG。
export function isScorerGoalEvent(event) {
  return isGoalEvent(event) && !isOwnGoal(event)
}

export function goalEventTag(event) {
  if (isOwnGoal(event)) return 'OG'
  if (isPenaltyScored(event)) return 'P'
  return ''
}

export function goalEventLabel(event) {
  const tag = goalEventTag(event)
  if (tag === 'P') return '点球 P'
  if (tag === 'OG') return '乌龙球 OG'
  return '进球'
}

export function scorerDisplayName(event) {
  const name = String(event?.playerName || '球员未记录')
  const tag = goalEventTag(event)
  return tag ? `${name}（${tag}）` : name
}
