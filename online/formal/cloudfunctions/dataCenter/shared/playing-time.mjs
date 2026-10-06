import crypto from 'node:crypto'

export const DURATION_RULE_VERSION = 'football-match-duration/1'
const text = value => value == null ? '' : String(value).trim()
const positive = value => value !== '' && value != null && Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null
const timestamp = value => {
  if (value && typeof value.toDate === 'function') value = value.toDate()
  const time = value == null || value === '' ? NaN : new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}

// Pure constructor; callers may persist only during an authorized pre-match write.
export function createMatchDurationSnapshot(input = {}) {
  const matchId = text(input.matchId), minutes = positive(input.minutes), minutesBasis = text(input.minutesBasis)
  const periodCount = Number(input.periodCount)
  const source = { kind:text(input.source?.kind), id:text(input.source?.id), version:text(input.source?.version) }
  const frozenAt = timestamp(input.frozenAt), kickoffAt = timestamp(input.kickoffAt)
  if (!matchId || minutes == null || !['total','period'].includes(minutesBasis) ||
      !['match','division','tournament'].includes(source.kind) || !source.id || !source.version ||
      frozenAt == null || kickoffAt == null || frozenAt > kickoffAt ||
      (minutesBasis === 'period' && (!Number.isSafeInteger(periodCount) || periodCount < 1))) {
    throw Object.assign(new Error('赛前时长快照缺少范围、单位或来源证据'), { code:'MATCH_DURATION_SNAPSHOT_INVALID' })
  }
  const totalMinutes = minutesBasis === 'total' ? minutes : minutes * periodCount
  if (!Number.isFinite(totalMinutes) || totalMinutes > Number.MAX_SAFE_INTEGER) throw Object.assign(new Error('赛前时长快照无效'), { code:'MATCH_DURATION_SNAPSHOT_INVALID' })
  return Object.freeze({ schemaVersion:DURATION_RULE_VERSION, matchId, minutesBasis, minutes,
    ...(minutesBasis === 'period' ? { periodCount } : {}), totalMinutes,
    frozenAt:new Date(frozenAt).toISOString(), kickoffAt:new Date(kickoffAt).toISOString(), source:Object.freeze(source) })
}

function validateSnapshot(snapshot, match) {
  if (!snapshot || snapshot.schemaVersion !== DURATION_RULE_VERSION) return null
  let normalized
  try { normalized = createMatchDurationSnapshot(snapshot) } catch { return null }
  const matchId = text(match._id || match.id)
  if (!matchId || normalized.matchId !== matchId || Number(snapshot.totalMinutes) !== normalized.totalMinutes) return null
  const source = normalized.source
  if (source.kind === 'match' && source.id !== matchId) return null
  if (source.kind === 'division' && source.id !== text(match.divisionId || match.division)) return null
  if (source.kind === 'tournament' && source.id !== text(match.tournamentId)) return null
  return normalized
}

function evidence(snapshot, origin) {
  return { status:'ready', reason:null, totalMinutes:snapshot.totalMinutes, ruleVersion:DURATION_RULE_VERSION,
    source:{ ...snapshot.source, origin, minutesBasis:snapshot.minutesBasis, frozenAt:snapshot.frozenAt, kickoffAt:snapshot.kickoffAt },
    revision:crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex').slice(0,32) }
}

export function resolveMatchDurationEvidence(match = {}, context = {}) {
  const unknown = reason => ({ status:'unknown', reason, totalMinutes:null, ruleVersion:DURATION_RULE_VERSION, source:null })
  // A malformed authoritative field must not silently fall through to another source.
  if (match.durationRulesSnapshot != null) {
    const snapshot = validateSnapshot(match.durationRulesSnapshot, match)
    return snapshot ? evidence(snapshot, 'match_snapshot') : unknown('MATCH_DURATION_SNAPSHOT_INVALID')
  }
  if (match.rulesSnapshot?.schemaVersion === DURATION_RULE_VERSION) {
    const snapshot = validateSnapshot(match.rulesSnapshot, match)
    return snapshot ? evidence(snapshot, 'match_snapshot') : unknown('MATCH_DURATION_SNAPSHOT_INVALID')
  }
  // Historical adapters must supply match-bound pre-match evidence. Current
  // settings, ambiguous duration fields and old clock values are never fallback evidence.
  const candidates = (context.historicalDurationSnapshots || []).filter(item =>
    item?.schemaVersion === DURATION_RULE_VERSION && text(item.matchId) === text(match._id || match.id))
  if (candidates.some(item => !validateSnapshot(item, match))) return unknown('MATCH_DURATION_SNAPSHOT_INVALID')
  const ordered = candidates.map(item => evidence(validateSnapshot(item, match), 'historical_snapshot')).sort((a,b) => a.revision.localeCompare(b.revision))
  if (!ordered.length) return unknown('MATCH_DURATION_EVIDENCE_MISSING')
  if (new Set(ordered.map(item => item.totalMinutes)).size !== 1) return unknown('MATCH_DURATION_EVIDENCE_CONFLICT')
  return { ...ordered[0], historicalRevisions:[...new Set(ordered.map(item => item.revision))] }
}

// Capture current finalized rules only before this match starts. Reads of an old
// completed match never call this function and never backfill its history.
export function freezePreMatchDuration(match = {}, division = {}, tournament = {}, now = new Date()) {
  if (match.durationRulesSnapshot != null || match.rulesSnapshot?.schemaVersion === DURATION_RULE_VERSION) {
    return resolveMatchDurationEvidence(match).status === 'ready' ? match.durationRulesSnapshot || match.rulesSnapshot : null
  }
  if (!['scheduled','checked_in','ready','not_started','pending'].includes(text(match.status || 'scheduled').toLowerCase()) ||
      match.refereeStartedAt || positive(match.refereeClockElapsedSeconds) != null || match.refereeRecordSubmittedAt || match.resultVersionId) return null
  const divisionId = text(match.divisionId || match.division)
  const isDivision = divisionId && divisionId !== 'default' && text(division._id || division.id) === divisionId
  const owner = isDivision ? division : tournament
  if (!owner || !(owner.rulesLocked === true || owner.ruleFinalized === true || owner.activeRulesVersion)) return null
  const rules = owner.activeRulesSnapshot || owner.rulesSnapshot || owner
  const version = text(owner.activeRulesVersion || owner.rulesVersion)
  const minutesBasis = rules.matchMinutesBasis === 'total' ? 'total' : ['halves','single'].includes(rules.periodMode) ? 'period' : ''
  const periodCount = rules.periodMode === 'halves' ? 2 : Number(rules.singlePeriodCount)
  try { return createMatchDurationSnapshot({matchId:text(match._id || match.id),minutes:rules.matchMinutes,minutesBasis,periodCount,
    source:{kind:isDivision?'division':'tournament',id:isDivision?divisionId:text(match.tournamentId),version},frozenAt:now,kickoffAt:now}) }
  catch { return null }
}

export function resolveMatchDuration(match = {}, context = {}) {
  const rules = resolveMatchDurationEvidence(match, context)
  if (rules.status !== 'ready') return null
  const finished = ['completed','finished','archived','ended'].includes(text(match.status).toLowerCase())
  if (context.mode !== 'provisional' || finished) return rules.totalMinutes
  const seconds = positive(match.refereeClockElapsedSeconds)
  if (seconds == null) return null
  let elapsed = seconds
  if (match.refereeClockRunning && match.refereeClockStartedAt) {
    const startedAt = timestamp(match.refereeClockStartedAt)
    if (startedAt != null) elapsed += Math.max(0, ((context.now == null ? Date.now() : context.now) - startedAt) / 1000)
  }
  return Math.min(rules.totalMinutes, elapsed / 60)
}

export function calculatePlayingMinutes(starterIds, timeline, duration) {
  const active = new Map([...new Set(starterIds)].map(id => [id, 0]))
  const minutes = new Map(), unknown = new Set()
  if (duration == null || !starterIds.length) return { minutes, unknown, available:false }
  const close = (id, minute) => { minutes.set(id, (minutes.get(id) || 0) + minute - active.get(id)); active.delete(id) }
  for (const event of timeline.slice().sort((a,b) => Number(a.minute) - Number(b.minute))) {
    const recorded = Number(event.minute)
    if (event.minute == null || event.minute === '' || !Number.isFinite(recorded) || recorded < 0 || recorded > duration) {
      if (event.id) unknown.add(event.id)
      if (event.out) unknown.add(event.out)
      if (!event.out && event.type === 'substitution') active.forEach((_,id) => unknown.add(id))
      continue
    }
    const minute = recorded
    if (event.type === 'substitution') {
      if (event.out && active.has(event.out)) close(event.out, minute)
      else if (event.out) unknown.add(event.out)
      else if (!event.outName) active.forEach((_,id) => unknown.add(id))
      if (event.id && active.has(event.id)) unknown.add(event.id)
      else if (event.id) active.set(event.id, minute)
    } else if (event.id && active.has(event.id)) close(event.id, minute)
  }
  active.forEach((start,id) => minutes.set(id, (minutes.get(id) || 0) + duration - start))
  return { minutes, unknown, available:true }
}
