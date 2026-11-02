;(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.SxfMatchScore = api
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict'
  const text = value => value == null ? '' : String(value).trim()
  function count(value) { return value !== null && value !== undefined && value !== '' && Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null }
  function decision(match) {
    const m = match || {}
    const home = count(m.homePenaltyScore ?? m.penaltyHomeScore ?? m.penaltiesHome)
    const away = count(m.awayPenaltyScore ?? m.penaltyAwayScore ?? m.penaltiesAway)
    const resolution = text(m.resolution || m.decisionMethod).toLowerCase()
    const regularHome = count(m.homeScore), regularAway = count(m.awayScore)
    const isShootout = ['penalties', 'penalty_shootout', 'shootout'].includes(resolution) || Array.isArray(m.penaltyRounds) && m.penaltyRounds.length > 0 || home !== null && away !== null && home !== away && regularHome !== null && regularHome === regularAway
    if (!isShootout) return { isShootout: false, home: null, away: null, winnerSide: '', winnerName: '', label: '' }
    const homeId = text(m.homeTeamId || m.homeTeam?._id || m.homeTeam?.id), awayId = text(m.awayTeamId || m.awayTeam?._id || m.awayTeam?.id)
    const winnerId = text(m.winnerTeamId)
    const recordedSide = winnerId && homeId && winnerId === homeId ? 'home' : winnerId && awayId && winnerId === awayId ? 'away' : ['home', 'away'].includes(m.winnerSide) ? m.winnerSide : ''
    const scoreSide = home !== null && away !== null && home !== away ? home > away ? 'home' : 'away' : ''
    const conflict = Boolean(m.penaltyResultConflict || recordedSide && scoreSide && recordedSide !== scoreSide)
    const winnerSide = conflict ? '' : scoreSide || recordedSide
    const winnerName = winnerSide === 'home' ? text(m.homeTeamName || m.homeName || m.homeTeam?.name) : winnerSide === 'away' ? text(m.awayTeamName || m.awayName || m.awayTeam?.name) : ''
    const scoreText = home !== null && away !== null ? `点球 ${home} : ${away}` : '点球比分待补录'
    const label = `${scoreText} · ${winnerSide === 'home' ? '主队胜' : winnerSide === 'away' ? '客队胜' : '胜方待核对'}`
    return { isShootout: true, home, away, winnerSide, winnerName, label, conflict }
  }
  function publicFields(match) {
    const value = decision(match)
    return value.isShootout ? { resolution: 'penalties', homePenaltyScore: value.home, awayPenaltyScore: value.away, winnerSide: value.winnerSide, winnerName: value.winnerName, ...(value.conflict ? {penaltyResultConflict:true} : {}) } : {}
  }
  function scoreText(match, fallback = '— : —') {
    const m = match || {}, home = count(m.homeScore), away = count(m.awayScore)
    const regular = home === null || away === null ? fallback : `${home} : ${away}`
    const value = decision(m)
    return value.isShootout ? `${regular}（${value.label}）` : regular
  }
  return { decision, publicFields, scoreText }
})
