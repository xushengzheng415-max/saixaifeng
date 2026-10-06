// Read-only, de-identified audit of a projected CloudBase snapshot.
// Input may contain only match facts, stable IDs, and salted name hashes.
import fs from 'node:fs'
import { aggregateStatistics, sumPlayerRows, calculatePlayerCardPoints, synthetic } from '../cloudfunctions/dataCenter/shared/statistics.mjs'

const path = process.argv[2]
if (!path) throw new Error('请提供脱敏只读快照 JSON 路径')
const raw = fs.readFileSync(path, 'utf8')
if (/"(?:phone|birthDate|avatarUrl|photoUrl|jerseyName)"\s*:/i.test(raw)) throw new Error('快照包含个人资料字段，停止审计')
for (const pair of raw.matchAll(/"(?:name|playerName|assistName)"\s*:\s*"([^"]*)"/g)) {
  if (pair[1] && !/^[A-F0-9]{64}$/.test(pair[1])) throw new Error('快照包含未哈希的姓名，停止审计')
}
const unwrap = value => {
  if (Array.isArray(value)) return value.map(unwrap)
  if (!value || typeof value !== 'object') return value
  for (const key of ['$numberInt','$numberLong','$numberDouble']) if (key in value) return Number(value[key])
  return Object.fromEntries(Object.entries(value).map(([key,item]) => [key,unwrap(item)]))
}
const input = unwrap(JSON.parse(raw))
const divisionsById = Object.fromEntries((input.divisions || []).map(row => [String(row._id),row]))
const tournamentsById = Object.fromEntries((input.tournaments || []).map(row => [String(row._id),row]))
const teamsById = Object.fromEntries((input.teams || []).map(row => [String(row._id),row]))
const playersById = Object.fromEntries((input.players || []).map(row => [String(row._id),row]))
const result = aggregateStatistics({ matches:input.matches || [], scope:{ mode:'official' }, divisionsById, tournamentsById, teamsById, playersById, requireOriginEvidence:true, requirePlayerOriginEvidence:true })
const grouped = new Map()
for (const row of result.players) {
  if (!grouped.has(row.playerId)) grouped.set(row.playerId, [])
  grouped.get(row.playerId).push(row)
}
const summary = { snapshotMatches:(input.matches || []).length, totalPlayerRecords:(input.players || []).length, excludedTestPlayerRecords:(input.players || []).filter(synthetic).length, officialMatches:result.summary.matchCount, excludedTestMatches:result.coverage.excludedTestMatches, testPlayerMatches:result.coverage.testPlayerMatches, originUnverifiedMatches:result.coverage.originUnverifiedMatches, distinctParticipants:grouped.size, globalCoverage:result.coverage.status, cardScoreScopeComplete:result.coverage.cardScoreScopeComplete, certifiedReady:0, metricReady:0, unverified:0, tiersIfComplete:{ bronze:0,silver:0,gold:0 }, missing:{ appearances:0,starts:0,minutesPlayed:0,goals:0 }, unlinkedEvents:result.coverage.unlinkedEventCount, missingLineupSides:result.coverage.missingLineupSides, metricVersion:result.metricVersion, scoreVersion:'football-player-card-points/1' }
const points = []
for (const rows of grouped.values()) {
  const card = calculatePlayerCardPoints(sumPlayerRows(rows), { metricVersion:result.metricVersion,dataVersion:result.dataVersion })
  if (card.status === 'ready') { summary.metricReady++; summary.tiersIfComplete[card.tier]++; points.push(card.points) }
  else { summary.unverified++; card.missing.forEach(field => { if (field in summary.missing) summary.missing[field]++ }) }
}
points.sort((a,b) => a - b)
summary.points = { nonzero:points.filter(value => value > 0).length, max:points.at(-1) ?? null, median:points.length ? points[Math.floor((points.length - 1) / 2)] : null }
summary.certifiedReady = result.coverage.cardScoreScopeComplete ? summary.metricReady : 0
console.log(JSON.stringify(summary,null,2))
