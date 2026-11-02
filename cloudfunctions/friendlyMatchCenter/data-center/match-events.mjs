const text = value => value == null ? '' : String(value).trim()
const aliases = { score:'goal', penalty:'penalty_scored', penalty_goal:'penalty_scored', yellow:'yellow_card', yellowcard:'yellow_card', red:'red_card', redcard:'red_card', second_yellow_red:'second_yellow', 'own-goal':'own_goal', og:'own_goal', substitute:'substitution' }
export const eventType = event => aliases[text(event.type || event.eventType).toLowerCase()] || text(event.type || event.eventType).toLowerCase()
export const eventId = event => text(event.eventId || event.sourceEventId || event._id)
export const revision = event => Number(event.revision || event.version || 0)
export const cancelled = event => event.deleted === true || ['deleted','cancelled','canceled','void','superseded'].includes(text(event.status).toLowerCase())

export function effectiveEvents(match, externalEvents = []) {
  const matchId = text(match._id || match.id)
  const embedded = (Array.isArray(match.events) ? match.events : []).map(event => ({ ...event, matchId, __source:'embedded' }))
  const external = externalEvents.filter(event => text(event.matchId || event.match_id) === matchId).map(event => ({ ...event, __source:'external' }))
  const byId = new Map(), unkeyed = []
  // External wins equal revisions, including tombstones. Anonymous embedded mirrors
  // are not combined with external storage; ambiguous identity is reported instead.
  const externalExists = external.length > 0
  for (const event of [...embedded, ...external]) {
    const key = eventId(event)
    if (!key) { if (!externalExists || event.__source === 'external') unkeyed.push(event); continue }
    const previous = byId.get(key)
    if (!previous || revision(event) >= revision(previous)) byId.set(key, event)
  }
  return [...byId.values(), ...unkeyed].filter(event => !cancelled(event))
}

// Official match score from effective events; shootout attempts are separate.
export function calculateMatchEventScore(match) {
  if (!Array.isArray(match.events)) return null
  const result = { home: 0, away: 0 }
  for (const event of effectiveEvents(match)) {
    const type = eventType(event)
    if (!['goal', 'penalty_scored', 'own_goal'].includes(type)) continue
    if (event.isShootout === true || ['shootout', 'penalty_shootout'].includes(text(event.phase || event.period).toLowerCase())) continue
    let side = text(event.teamSide || event.side)
    if (!['home', 'away'].includes(side)) {
      if (event.teamId && text(event.teamId) === text(match.homeTeamId)) side = 'home'
      else if (event.teamId && text(event.teamId) === text(match.awayTeamId)) side = 'away'
      else throw Object.assign(new Error('进球事件缺少有效球队，请修正后结束比赛'), { code: 'GOAL_TEAM_REQUIRED' })
    }
    if (type === 'own_goal') side = side === 'home' ? 'away' : 'home'
    result[side] += 1
  }
  return result
}
