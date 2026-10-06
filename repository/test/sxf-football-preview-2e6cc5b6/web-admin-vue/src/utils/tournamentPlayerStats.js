import { normalizeMatchEvents, cardEventCounts, isScorerGoalEvent } from './matchEvent.js'

const id = value => String(value ?? '').trim()
const playerIds = player => [player?._id, player?.id, player?.playerId, player?.confirmedPlayerId, player?.sourcePlayerId].map(id).filter(Boolean)
const name = value => id(value).replace(/\s+/g, '').toLowerCase()
const number = value => Number(value?.$numberInt ?? value?.$numberLong ?? value)
const positive = values => values.map(number).find(value => Number.isFinite(value) && value > 0)

// matchMinutes 是每节时长；赛程 durationMinutes 可能是旧占位值，不能覆盖定版规则。
export function resolveMatchPlayingMinutes(match, division = {}, tournament = {}) {
  const rules = division.rulesSnapshot || division.rules || {}
  const matchTime = division.matchTime || rules.matchTime || tournament.matchTime || {}
  const periodMinutes = positive([division.matchMinutes, rules.matchMinutes, matchTime.halfDuration])
  const periodMode = id(division.periodMode || rules.periodMode || matchTime.timeType)
  if (periodMinutes) {
    if (periodMode === 'halves' || periodMode === 'half' || matchTime.halfDuration) return periodMinutes * 2
    if (periodMode === 'quarters') return periodMinutes * 4
    if (periodMode === 'single') return periodMinutes * (positive([division.singlePeriodCount, rules.singlePeriodCount]) || 1)
    return periodMinutes
  }
  return positive([match.regulationMinutes, match.matchDurationMinutes, match.matchDuration, match.durationMinutes])
}

// 兼容旧事件的姓名/号码，只在本球队本届名单内唯一命中才关联。
export function findTournamentPlayer(players, value) {
  if (typeof value !== 'object' || !value) return players.find(player => playerIds(player).includes(id(value)))
  const ids = playerIds(value)
  if (ids.length) {
    const exact = players.filter(player => playerIds(player).some(key => ids.includes(key)))
    if (exact.length === 1) return exact[0]
  }
  const targetName = name(value.name || value.playerName)
  const targetNumber = value.jerseyNumber ?? value.playerNumber ?? value.number
  const named = targetName ? players.filter(player => [player.name, player.jerseyName, player.shirtName].some(label => name(label) === targetName)) : []
  if (targetNumber !== undefined && targetNumber !== null && targetNumber !== '') {
    const candidates = (targetName ? named : players).filter(player => number(player.jerseyNumber ?? player.number) === number(targetNumber))
    return candidates.length === 1 ? candidates[0] : undefined
  }
  return named.length === 1 ? named[0] : undefined
}

// 保留已经转换的头像地址；名单接口中的 cloud:// 不能直接供 img 使用。
export function mergeTournamentRosterPlayer(source = {}, snapshot = {}) {
  const snapshotPhoto = id(snapshot.photoUrl)
  const photoUrl = /^https?:\/\//i.test(source.photoUrl || '') ? source.photoUrl : (snapshotPhoto || source.photoUrl || '')
  return { ...source, ...snapshot, _id: snapshot.id || snapshot._id || source._id,
    jerseyName: snapshot.jerseyName || snapshot.shirtName || source.jerseyName || source.shirtName || '',
    photoUrl, _exportPhotoFileId: source._exportPhotoFileId || source.photoFileID || source.photoFileId || (snapshotPhoto.startsWith('cloud://') ? snapshotPhoto : '') }
}

// 未上场替补不计出场；历史姓名号码事件仅在本队名单内关联，不跨队合并。
export function buildTournamentPlayerStats(players, matches, teamIds, division = {}, tournament = {}, scope = {}) {
  const rows = players.map(player => ({ ...player, appearances: 0, minutes: 0, goals: 0, yellowCards: 0, redCards: 0, minutesIncomplete: false, appearanceIncomplete: false, goalsIncomplete: false, cardsIncomplete: false }))
  const teams = new Set(teamIds.map(id))
  const find = value => findTournamentPlayer(rows, value)
  matches.forEach(match => {
    if (scope.tournamentId && id(match.tournamentId) !== id(scope.tournamentId)) return
    if (scope.divisionId && id(match.divisionId || match.division || 'default') !== id(scope.divisionId)) return
    const home = id(match.homeTeamId || match.teamAId)
    const away = id(match.awayTeamId || match.teamBId)
    const side = teams.has(home) ? 'home' : teams.has(away) ? 'away' : ''
    if (!side) return
    const lineup = match[`${side}Lineup`] || match.refereeRecordPayload?.[`${side}Lineup`] || match.lineups?.[side] || {}
    const starters = Array.isArray(lineup.starters) ? lineup.starters : (lineup.players || []).filter(player => player.role !== 'substitute')
    const lineupKnown = starters.length > 0
    const duration = resolveMatchPlayingMinutes(match, division, tournament)
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
      const row = find(event)
      if (event.type === 'substitution') {
        const incoming = find({ playerId: event.incomingPlayerId || event.substituteInId || event.playerInId || event.playerId, name: event.incomingPlayerName || event.substituteInName || event.playerName, jerseyNumber: event.incomingPlayerNumber || event.playerNumber })
        const outgoing = find({ playerId: event.outgoingPlayerId || event.substituteOutId || event.playerOutId || event.assistPlayerId, name: event.outgoingPlayerName || event.substituteOutName || event.assistName, jerseyNumber: event.outgoingPlayerNumber || event.assistNumber })
        const minute = event._minuteKnown === false ? null : event.minute
        if (!incoming || !outgoing) rows.forEach(player => { player.minutesIncomplete = true; player.appearanceIncomplete = true })
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
