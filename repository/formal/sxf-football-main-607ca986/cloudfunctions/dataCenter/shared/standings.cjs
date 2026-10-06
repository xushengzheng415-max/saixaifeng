'use strict'
const text = value => value == null ? '' : String(value).trim()
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback

function pointsRule(division) {
  const ranking = division && (division.rankingRules || division.rankingRule || division.rules && division.rules.ranking) || {}
  const points = ranking.points || {}
  const drawResolution = text(points.drawResolution || (division && division.drawResolution) || 'draw').toLowerCase()
  return {
    win: number(points.win ?? (division && division.winPoints), 3),
    draw: number(points.draw ?? (division && division.drawPoints), 1),
    loss: number(points.loss ?? (division && division.lossPoints), 0),
    drawResolution: ['penalties', 'penalty_shootout', 'shootout'].includes(drawResolution) ? 'penalties' : 'draw',
    penaltyWin: number(points.penaltyWin ?? (division && division.penaltyWinPoints), 2),
    penaltyLoss: number(points.penaltyLoss ?? (division && division.penaltyLossPoints), 0),
    tieBreakers: Array.isArray(division && division.rankingTieBreakers) ? division.rankingTieBreakers : [
      'headToHeadPoints', 'headToHeadGoalDifference', 'headToHeadGoalsFor',
      'goalDifference', 'goalsFor', 'redCardsFewest', 'yellowCardsFewest', 'drawingLots'
    ],
    source: points.win != null || division && division.winPoints != null ? '组别规则' : '足球标准规则'
  }
}

function addTeam(table, id, name, logo) {
  const key = id || `name:${name}`
  if (!table[key]) table[key] = { teamId: id, teamName: name, logo, played: 0, win: 0, draw: 0, loss: 0, penaltyWin: 0, penaltyLoss: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, fairPlay: 0, yellowCards: 0, redCards: 0, provisionalMatches: 0 }
  return table[key]
}

function addScheduledTeam(table, id, name, logo) {
  const normalizedId = text(id)
  const normalizedName = text(name)
  if (!normalizedId && (!normalizedName || ['主队待定', '客队待定'].includes(normalizedName))) return
  addTeam(table, normalizedId, normalizedName || '球队待定', text(logo))
}

function applyResult(table, match, rule, provisional) {
  const home = addTeam(table, match.homeTeamId, match.homeTeamName, match.homeTeamLogo)
  const away = addTeam(table, match.awayTeamId, match.awayTeamName, match.awayTeamLogo)
  home.played += 1; away.played += 1
  home.goalsFor += match.homeScore; home.goalsAgainst += match.awayScore
  away.goalsFor += match.awayScore; away.goalsAgainst += match.homeScore
  if (match.homeScore > match.awayScore) { home.win += 1; away.loss += 1; home.points += rule.win; away.points += rule.loss }
  else if (match.homeScore < match.awayScore) { away.win += 1; home.loss += 1; away.points += rule.win; home.points += rule.loss }
  else if (rule.drawResolution === 'penalties') {
    const homeWon = text(match.winnerTeamId) === text(match.homeTeamId)
    const awayWon = text(match.winnerTeamId) === text(match.awayTeamId)
    if (homeWon) { home.win += 1; home.penaltyWin += 1; away.loss += 1; away.penaltyLoss += 1; home.points += rule.penaltyWin; away.points += rule.penaltyLoss }
    else if (awayWon) { away.win += 1; away.penaltyWin += 1; home.loss += 1; home.penaltyLoss += 1; away.points += rule.penaltyWin; home.points += rule.penaltyLoss }
  } else { home.draw += 1; away.draw += 1; home.points += rule.draw; away.points += rule.draw }
  home.fairPlay -= match.yellowHome + match.redHome * 3
  away.fairPlay -= match.yellowAway + match.redAway * 3
  home.yellowCards += match.yellowHome; away.yellowCards += match.yellowAway
  home.redCards += match.redHome; away.redCards += match.redAway
  if (provisional) { home.provisionalMatches += 1; away.provisionalMatches += 1 }
  home.goalDifference = home.goalsFor - home.goalsAgainst
  away.goalDifference = away.goalsFor - away.goalsAgainst
}

function headToHeadScore(team, tied, matches, rule) {
  const ids = new Set(tied.map(item => item.teamId || `name:${item.teamName}`))
  const mini = { points: 0, goalsFor: 0, goalsAgainst: 0 }
  matches.forEach(match => {
    const homeKey = match.homeTeamId || `name:${match.homeTeamName}`
    const awayKey = match.awayTeamId || `name:${match.awayTeamName}`
    if (!ids.has(homeKey) || !ids.has(awayKey)) return
    const currentKey = team.teamId || `name:${team.teamName}`
    if (currentKey !== homeKey && currentKey !== awayKey) return
    const currentHome = currentKey === homeKey
    const scored = currentHome ? match.homeScore : match.awayScore
    const conceded = currentHome ? match.awayScore : match.homeScore
    mini.goalsFor += scored; mini.goalsAgainst += conceded
    if (scored > conceded) mini.points += rule.win
    else if (scored < conceded) mini.points += rule.loss
    else if (rule.drawResolution === 'penalties') mini.points += text(match.winnerTeamId) === text(team.teamId) ? rule.penaltyWin : rule.penaltyLoss
    else mini.points += rule.draw
  })
  return { ...mini, goalDifference: mini.goalsFor - mini.goalsAgainst }
}

function rankTeams(teams, officialMatches, rule) {
  const byPoints = {}
  teams.forEach(team => { (byPoints[team.points] ||= []).push(team) })
  Object.values(byPoints).forEach(tied => tied.forEach(team => { team.headToHead = headToHeadScore(team, tied, officialMatches, rule) }))
  const compare = {
    headToHeadPoints:(a,b) => b.headToHead.points - a.headToHead.points,
    headToHeadGoalDifference:(a,b) => b.headToHead.goalDifference - a.headToHead.goalDifference,
    headToHeadGoalsFor:(a,b) => b.headToHead.goalsFor - a.headToHead.goalsFor,
    goalDifference:(a,b) => b.goalDifference - a.goalDifference,
    goalsFor:(a,b) => b.goalsFor - a.goalsFor,
    redCardsFewest:(a,b) => a.redCards - b.redCards,
    yellowCardsFewest:(a,b) => a.yellowCards - b.yellowCards
  }
  return teams.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    for (const field of rule.tieBreakers) { const order = compare[field]?.(a,b) || 0; if (order) return order }
    return a.teamName.localeCompare(b.teamName, 'zh-CN')
  })
    .map((team, index) => ({ ...team, rank: index + 1 }))
}

function buildStandings(matches, divisionsById) {
  const buckets = {}
  matches.filter(match => match.standingsEligible).forEach(match => {
    const key = `${match.tournamentId || ''}:${match.divisionId}:${match.groupName}`
    const bucket = buckets[key] ||= { tournamentId:match.tournamentId || '', divisionId: match.divisionId, divisionName: match.divisionName, groupName: match.groupName, teams: {}, official: [], all: [] }
    addScheduledTeam(bucket.teams, match.homeTeamId, match.homeTeamName, match.homeTeamLogo)
    addScheduledTeam(bucket.teams, match.awayTeamId, match.awayTeamName, match.awayTeamLogo)
    if (!match.scoreReady || ['returned', 'warning'].includes(match.resultStatus)) return
    bucket.all.push(match)
    if (match.resultStatus === 'approved') bucket.official.push(match)
  })
  return Object.values(buckets).map(bucket => {
    const rule = pointsRule(divisionsById[bucket.divisionId] || {})
    const officialTable = {}; const previewTable = {}
    Object.values(bucket.teams).forEach(team => {
      addTeam(officialTable, team.teamId, team.teamName, team.logo)
      addTeam(previewTable, team.teamId, team.teamName, team.logo)
    })
    bucket.official.forEach(match => applyResult(officialTable, match, rule, false))
    bucket.all.forEach(match => applyResult(previewTable, match, rule, match.resultStatus !== 'approved'))
    return {
      tournamentId: bucket.tournamentId,
      divisionId: bucket.divisionId,
      divisionName: bucket.divisionName,
      groupName: bucket.groupName,
      pointsRule: rule,
      tieBreakers: ['points', ...rule.tieBreakers],
      officialTeams: rankTeams(Object.values(officialTable), bucket.official, rule),
      previewTeams: rankTeams(Object.values(previewTable), bucket.all, rule),
      officialMatchCount: bucket.official.length,
      provisionalMatchCount: bucket.all.length - bucket.official.length
    }
  }).sort((a, b) => a.divisionName.localeCompare(b.divisionName, 'zh-CN', { numeric: true }) || a.groupName.localeCompare(b.groupName, 'zh-CN', { numeric: true }))
}


module.exports = { pointsRule, buildStandings, rankTeams }
