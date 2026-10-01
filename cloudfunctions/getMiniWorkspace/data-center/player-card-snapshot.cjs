'use strict'
const crypto = require('node:crypto')
const SCHEMA_VERSION = 'football-player-card-snapshot/1'
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key,canonical(value[key])]))
  return value === undefined ? null : value
}
const digest = value => crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex').slice(0,32)

function playerCardSnapshot(score, context = {}) {
  const missing = [...new Set(score.missing || [])].sort()
  const reasonCodes = [...new Set([
    ...(score.status === 'scope_limited' ? ['PLAYER_CARD_SCOPE_LIMITED'] : []),
    ...(score.status === 'test_data_excluded' ? ['PLAYER_CARD_TEST_DATA_EXCLUDED'] : []),
    ...missing.map(field => field === 'dataCoverage' ? 'PLAYER_CARD_COVERAGE_INCOMPLETE' : field === 'supportDrops' ? 'PLAYER_CARD_SUPPORT_UNVERIFIED' : 'PLAYER_CARD_METRIC_INCOMPLETE'),
    ...(!['ready','scope_limited'].includes(score.status) ? (context.issues || []).filter(issue => /MATCH_DURATION_|SUPPORT_READ_FAILED/.test(issue.code || '')).map(issue => issue.code) : [])
  ])].sort()
  const coverage = context.playerTotal?.coverage || {}
  const metrics = context.playerTotal?.metrics || score.metrics || {}
  const ready = score.status === 'ready'
  const levelStart = ready ? score.tier === 'gold' ? 100 : score.tier === 'silver' ? 45 : 0 : null
  const nextAt = ready ? score.nextAt : null
  const progress = ready ? { levelStart, nextAt, pointsToNext:score.pointsToNext,
    percent:nextAt == null ? 100 : Math.max(0,Math.min(100,Math.round((score.points-levelStart)*100/(nextAt-levelStart)))) } : null
  const revisionState = { schemaVersion:SCHEMA_VERSION, playerId:String(context.playerId || ''),
    scope:score.scope, mode:score.mode, status:score.status, missing, reasonCodes,
    scoreVersion:score.scoreVersion, metricVersion:score.metricVersion, entitlementVersion:score.entitlementVersion,
    metrics, coverage, coverageStatus:context.coverageStatus, careerDataVersion:context.careerDataVersion,
    coverageIssues:(context.issues || []).map(issue => ({ code:issue.code,matchId:issue.matchId,teamId:issue.teamId,playerId:issue.playerId })).sort((a,b) => JSON.stringify(canonical(a)).localeCompare(JSON.stringify(canonical(b)))),
    factsVersions:[...new Set((context.rows || []).map(row => row.factsVersion).filter(Boolean))].sort(),
    foundation:score.foundation, goalBonus:score.goalBonus, careerPoints:score.careerPoints,
    supportDrops:score.supportDrops, supportPoints:score.supportPoints, supportDataVersion:score.supportDataVersion,
    points:score.points, tier:score.tier, progress,
    canReplacePhoto:score.canReplacePhoto, canChangeBackground:score.canChangeBackground }
  return { ...score, snapshotSchemaVersion:SCHEMA_VERSION, playerId:String(context.playerId || ''),
    missing, reasonCodes, coverage, progress, snapshotRevision:digest(revisionState) }
}
module.exports = { SCHEMA_VERSION, canonical, digest, playerCardSnapshot }
