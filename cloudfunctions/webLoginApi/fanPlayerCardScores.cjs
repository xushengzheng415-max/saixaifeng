'use strict'
const { createDataService } = require('./data-center/service.cjs')

async function applyPlayerCardScores(players, career) {
  const { sumPlayerRows, calculatePlayerCardPoints } = await import('./data-center/statistics.mjs')
  const grouped = new Map()
  for (const row of career.players || []) {
    const playerId = String(row.playerId || '')
    if (!playerId) continue
    if (!grouped.has(playerId)) grouped.set(playerId, [])
    grouped.get(playerId).push(row)
  }
  for (const player of players) {
    player.cardTier = null
    player.cardPoints = null
    player.cardScoreVersion = null
    player.careerMetrics = null
    const rows = grouped.get(String(player.playerId || ''))
    if (!rows?.length) continue
    const total = sumPlayerRows(rows)
    if (!career.coverage?.cardScoreScopeComplete) continue
    player.careerMetrics = Object.fromEntries(['appearances','starts','minutesPlayed','goals','assists'].map(field => [field, total.metrics[field] ?? null]))
    const score = calculatePlayerCardPoints(total, {
      metricVersion:career.metricVersion,
      dataVersion:career.dataVersion,
      coverageStatus:career.coverage?.cardScoreScopeComplete ? 'complete' : 'partial'
    })
    if (score.status !== 'ready') continue
    player.cardTier = score.tier
    player.cardPoints = score.points
    player.cardScoreVersion = score.scoreVersion
  }
  return players
}

async function enrichFanPlayerCards(db, players) {
  for (const player of players) { player.cardTier = null; player.cardPoints = null; player.cardScoreVersion = null; player.careerMetrics = null }
  if (!players.some(player => player.playerId)) return players
  try {
    const career = await createDataService(db).query({ platformOwner:true, teamIds:[], tournamentIds:[] }, { mode:'official' })
    return applyPlayerCardScores(players, career)
  } catch (error) {
    console.warn('[fanPlayerCardScores]', error.code || 'DATA_READ_FAILED')
    return players
  }
}

function officialMatchIds(career) {
  return new Set((career.teams || []).flatMap(row => row.matchIds || []).map(String).filter(Boolean))
}

async function loadOfficialFanScope(db) {
  const career = await createDataService(db).query({ platformOwner:true, teamIds:[], tournamentIds:[] }, { mode:'official' })
  return { career, matchIds:officialMatchIds(career) }
}

module.exports = { enrichFanPlayerCards, applyPlayerCardScores, officialMatchIds, loadOfficialFanScope }
