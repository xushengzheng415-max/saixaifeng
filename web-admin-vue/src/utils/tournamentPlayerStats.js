import { normalizeMatchEvents, cardEventCounts, isScorerGoalEvent } from './matchEvent.js'

const id = value => String(value ?? '').trim()
const playerIds = player => [player?._id, player?.id, player?.playerId, player?.confirmedPlayerId, player?.sourcePlayerId].map(id).filter(Boolean)

// 本届参赛名单只按稳定 ID 关联比赛，不将同名球员或未上场替补计入数据。
export function buildTournamentPlayerStats(players, matches, teamIds) {
  const rows = players.map(player => ({ ...player, appearances: 0, minutes: 0, goals: 0, yellowCards: 0, redCards: 0, minutesIncomplete: false, appearanceIncomplete: false, goalsIncomplete: false, cardsIncomplete: false }))
  const byId = new Map()
  rows.forEach(row => playerIds(row).forEach(key => byId.set(key, row)))
  const teams = new Set(teamIds.map(id))
  const find = value => typeof value === 'object' ? playerIds(value).map(key => byId.get(key)).find(Boolean) : byId.get(id(value))
  matches.forEach(match => {
    const home = id(match.homeTeamId || match.teamAId)
    const away = id(match.awayTeamId || match.teamBId)
    const side = teams.has(home) ? 'home' : teams.has(away) ? 'away' : ''
    if (!side) return
    const lineup = match[`${side}Lineup`] || match.refereeRecordPayload?.[`${side}Lineup`] || match.lineups?.[side] || {}
    const starters = Array.isArray(lineup.starters) ? lineup.starters : (lineup.players || []).filter(player => player.role !== 'substitute')
    const lineupKnown = starters.length > 0
    const duration = [match.matchDurationMinutes, match.durationMinutes, match.regulationMinutes, match.matchDuration].map(Number).find(value => Number.isFinite(value) && value > 0)
    const active = new Map(), played = new Set(), elapsed = new Map(), unknown = new Set()
    starters.forEach(player => { const row = find(player); if (row) { active.set(row, 0); played.add(row) } })
    const close = (row, minute) => {
      if (!row || !active.has(row)) return
      const start = active.get(row)
      if (minute == null || start == null || minute < start) unknown.add(row)
      else elapsed.set(row, (elapsed.get(row) || 0) + minute - start)
      active.delete(row)
    }
    const events = normalizeMatchEvents((match.statsEvents || match.events || []).map(event => ({ ...event, _minuteKnown: event.minute !== undefined && event.minute !== null && event.minute !== '' && Number.isFinite(Number(event.minute)) })), { homeTeamId: home, awayTeamId: away })
    events.forEach(event => {
      const belongs = event.teamId ? teams.has(id(event.teamId)) : event.teamSide === side
      if (!belongs || event.deleted || event.status === 'deleted' || event.isPenaltyShootout || ['shootout', 'penalty_shootout'].includes(event.phase)) return
      const row = find(event.playerId)
      // 无明确球员 ID 的人工记录不能成为官方个人统计。
      if (event.type === 'substitution') {
        const incoming = find(event.incomingPlayerId || event.substituteInId || event.playerInId || event.playerId)
        const outgoing = find(event.outgoingPlayerId || event.substituteOutId || event.playerOutId || event.assistPlayerId)
        const minute = event._minuteKnown === false ? null : event.minute
        close(outgoing, minute)
        if (incoming) { active.set(incoming, minute); played.add(incoming); if (minute == null) unknown.add(incoming) }
        return
      }
      if (!row) {
        if (!event.playerId) {
          const cards = cardEventCounts(event)
          if (isScorerGoalEvent(event)) rows.forEach(player => { player.goalsIncomplete = true })
          if (cards.yellow || cards.red) rows.forEach(player => { player.cardsIncomplete = true })
        }
        return
      }
      const cards = cardEventCounts(event)
      row.yellowCards += cards.yellow
      row.redCards += cards.red
      if (isScorerGoalEvent(event)) row.goals += 1
      if (isScorerGoalEvent(event) || cards.yellow || cards.red) {
        // 替补席也可能领牌，牌不能作为出场凭证。
        if (isScorerGoalEvent(event) && !played.has(row)) { played.add(row); unknown.add(row) }
      }
      if (cards.red) close(row, event._minuteKnown === false ? null : event.minute)
    })
    active.forEach((_, row) => close(row, duration ?? null))
    if (!lineupKnown) rows.forEach(row => { row.appearanceIncomplete = true; row.minutesIncomplete = true })
    played.forEach(row => { row.appearances += 1; row.minutes += elapsed.get(row) || 0; if (unknown.has(row)) row.minutesIncomplete = true })
  })
  return rows
}
