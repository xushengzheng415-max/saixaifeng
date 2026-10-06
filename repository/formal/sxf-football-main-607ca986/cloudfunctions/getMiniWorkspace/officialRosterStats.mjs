// 仅汇总调用方已筛选的本届、本组别、本队比赛；替补入名单不算出场。
import { resolveMatchDuration, calculatePlayingMinutes } from './data-center/playing-time.mjs'
function rosterStats(players, matches, teamId, externalEvents, durationContext = {}) {
  const stats = {}
  const knownMinutes = {}, unknownMinutes = new Set()
  players.forEach(player => { stats[String(player.id)] = { appearances: 0, minutesPlayed: null, goals: 0, assists: 0, yellowCards: 0, redCards: 0 } })
  const idOf = row => String(typeof row === 'string' ? row : (row && (row.playerId || row.id || row._id) || ''))
  function resolve(event, assist, matchPlayers) {
    const id = String(assist ? (event.assistPlayerId || event.assistId || '') : (event.playerId || event.playerID || event.athleteId || ''))
    if (id) return stats[id] ? id : ''
    const name = String(assist ? (event.assistName || '') : (event.playerName || ''))
    const number = assist ? event.assistNumber : event.playerNumber
    const lineupRows = (matchPlayers || []).filter(player => name && (player.name || player.playerName) === name && (number == null || number === '' || String(player.jerseyNumber == null ? player.number : player.jerseyNumber) === String(number)))
    const lineupIds = Array.from(new Set(lineupRows.map(idOf).filter(id => stats[id])))
    if (lineupIds.length === 1) return lineupIds[0]
    if (lineupIds.length > 1) return ''
    const rows = players.filter(player => name && player.name === name && (number == null || number === '' || String(player.jerseyNumber) === String(number)))
    return rows.length === 1 ? String(rows[0].id) : ''
  }
  matches.forEach(match => {
    if (!['completed', 'finished', 'archived', 'live', 'playing', 'in_progress', 'ongoing'].includes(String(match.status || '').toLowerCase())) return
    const side = String(match.homeTeamId) === String(teamId) ? 'home' : 'away'
    const lineup = match[side + 'Lineup'] || match['lineup' + (side === 'home' ? 'Home' : 'Away')] || (match.lineups || {})[side] || {}
    const starters = Array.isArray(lineup) ? lineup : (lineup.starters || lineup.players || [])
    const matchPlayers = starters.concat(lineup.substitutes || [])
    const appeared = new Set(starters.map(idOf).filter(id => stats[id]))
    const events = Array.isArray(match.events) ? match.events : (externalEvents || []).filter(event => String(event.matchId) === String(match._id || match.id))
    const seen = new Set()
    const timeline = []
    events.forEach(event => {
      if (event.deleted || event.status === 'deleted' || event.status === 'cancelled') return
      const eventId = String(event.eventId || event._id || '')
      if (eventId && seen.has(eventId)) return
      if (eventId) seen.add(eventId)
      if (event.teamId && String(event.teamId) !== String(teamId)) return
      if (event.teamSide && event.teamSide !== side) return
      // 旧事件仅有姓名时必须能确定球队，避免把对手同名球员计入。
      if (!event.teamId && !event.teamSide && !event.playerId && !event.playerID && !event.athleteId) return
      const type = String(event.type || event.eventType || '').toLowerCase()
      const id = resolve(event, false, matchPlayers), assist = resolve(event, true, matchPlayers)
      if (['substitution', 'red_card', 'red', 'redcard', 'second_yellow'].includes(type)) timeline.push({ type, id, out:assist, outName:event.assistName, minute:event.minute })
      if (id) {
        if (['goal', 'score', 'penalty_scored', 'own_goal', 'substitution'].includes(type)) appeared.add(id)
        if (['goal', 'score', 'penalty_scored'].includes(type)) stats[id].goals++
        if (['yellow', 'yellow_card', 'yellowcard', 'second_yellow'].includes(type)) stats[id].yellowCards++
        if (['red', 'red_card', 'redcard', 'second_yellow'].includes(type)) stats[id].redCards++
      }
      if (assist && ['goal', 'score', 'penalty_scored', 'assist'].includes(type)) { stats[assist].assists++; appeared.add(assist) }
    })
    appeared.forEach(id => { stats[id].appearances++ })
    const duration = resolveMatchDuration(match, durationContext)
    const intervals = calculatePlayingMinutes(starters.map(idOf).filter(id => stats[id]), timeline, duration)
    appeared.forEach(id => {
      if (!intervals.available || intervals.unknown.has(id) || !intervals.minutes.has(id)) unknownMinutes.add(id)
      else knownMinutes[id] = (knownMinutes[id] || 0) + intervals.minutes.get(id)
    })
  })
  Object.keys(knownMinutes).forEach(id => { if (!unknownMinutes.has(id)) stats[id].minutesPlayed = Math.round(knownMinutes[id]) })
  Object.values(stats).forEach(player => { if (player.appearances === 0) player.minutesPlayed = 0 })
  return stats
}
export default rosterStats

export function selectRosterMatches(matches, teamId, divisionId, allowLegacy) {
  return matches.filter(match => {
    const division = String(match.divisionId || match.division || '')
    return [String(match.homeTeamId || ''), String(match.awayTeamId || '')].includes(String(teamId)) && (division ? division === String(divisionId || 'default') : allowLegacy === true)
  })
}

// 名单快照保留了历史球员 ID 时，从本队赛事阵容恢复显示资料；不改写球员库。
export function restoreHistoricalRosterPlayers(players, matches, teamId, rosterIds) {
  const result = players.slice()
  const historical = new Map()
  matches.forEach(match => {
    const side = String(match.homeTeamId) === String(teamId) ? 'home' : 'away'
    const lineup = match[side + 'Lineup'] || match['lineup' + (side === 'home' ? 'Home' : 'Away')] || (match.lineups || {})[side] || {}
    const rows = Array.isArray(lineup) ? lineup : (lineup.starters || lineup.players || []).concat(lineup.substitutes || [])
    rows.forEach(row => { const id = String(row && (row.playerId || row.id || row._id) || ''); if (id) historical.set(id, row) })
  })
  ;(rosterIds || []).forEach(id => {
    if (result.some(player => String(player.id) === String(id))) return
    const row = historical.get(String(id)) || {}
    result.push({ id:String(id), name:row.name || row.playerName || '历史名单球员', jerseyNumber:row.jerseyNumber == null ? (row.number == null ? '' : row.number) : row.jerseyNumber, jerseyName:row.jerseyName || '', photoUrl:row.photoUrl || row.avatarUrl || '', position:row.position || '', profileStatus:'pending', statusText:'历史名单资料' })
  })
  return result
}
