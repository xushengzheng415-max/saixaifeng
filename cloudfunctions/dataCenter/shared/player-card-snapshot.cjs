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
  const levelStart = ready ? (score.levelStart ?? (score.tier === 'gold' ? 100 : score.tier === 'silver' ? 45 : 0)) : null
  const nextAt = ready ? score.nextAt : null
  const progress = ready ? { levelStart, nextAt, pointsToNext:score.pointsToNext,
    percent:nextAt == null ? 100 : Math.max(0,Math.min(100,Math.round((score.points-levelStart)*100/(nextAt-levelStart)))) } : null
  const revisionState = { schemaVersion:SCHEMA_VERSION, playerId:String(context.playerId || ''),
    scope:score.scope, mode:score.mode, status:score.status, missing, reasonCodes,accountingPolicy:score.accountingPolicy,creditedMetrics:score.creditedMetrics,uncreditedFields:score.uncreditedFields,breakdown:score.breakdown,
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
// Shared by private career cards and public summaries; display never grants eligibility.
function playerCardScope(result,playerId) {
  const coverage=result.coverage||{},related=coverage.playerCardMatchIds?.[playerId]
  const complete=coverage.playerCardComplete?.[playerId]??coverage.unlistedPlayerCardComplete??coverage.cardScoreScopeComplete
  const ids=new Set(related||[])
  const rows=(result.players||[]).filter(row=>row.playerId===playerId),hasMetricGap=rows.some(row=>['appearances','starts','minutesPlayed','goals'].some(field=>row.coverage?.[field]!=='complete'))
  const issues=coverage.participationPolicy==='recorded-participants/1'
    ? (result.issues||[]).filter(row=>(!row.playerId||String(row.playerId)===playerId)&&(!row.matchId||((!complete||hasMetricGap)&&ids.has(String(row.matchId)))))
    : [...(result.issues||[])]
  return {complete,issues}
}
module.exports = { SCHEMA_VERSION, canonical, digest, playerCardSnapshot, playerCardScope }
