// 空值表示未设置，不能经 Number(null)/Number('') 变成“禁止替补”。
export function parseBenchLimit(value) {
  if (value == null || typeof value === 'boolean' || typeof value === 'string' && !value.trim()) return null
  if (typeof value !== 'number' && typeof value !== 'string') return null
  const limit = Number(value)
  return Number.isInteger(limit) && limit >= 0 ? limit : null
}

export function resolveSubstitutePlayerLimit(playerCount, ...sources) {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue
    const details = source.regulationDetails && typeof source.regulationDetails === 'object' ? source.regulationDetails : source
    // 延续现行替补席总人数优先口径；未设置时再读取替补球员人数。
    for (const field of ['benchTotalLimit', 'benchPlayerLimit']) {
      const limit = parseBenchLimit(details[field])
      if (limit !== null) return limit
    }
  }
  return Number(playerCount) === 8 ? 8 : null
}

export function resolveMatchSubstitutePlayerLimit(playerCount, match = {}, division = {}, tournament = {}) {
  const fields = ['benchTotalLimit', 'benchPlayerLimit']
  const hasBench = row => row && fields.some(field => Object.hasOwn(row.regulationDetails || row, field))
  const started = ['ongoing','in_progress','live','started','halftime','completed','finished'].includes(String(match.status || '').toLowerCase())
    || Boolean(match.refereeClockStartedAt || match.actualKickoffAt || match.refereeRecordLocked)
  if (!started) {
    const active = [division.activeRulesSnapshot, division.rulesSnapshot, division].find(hasBench) || division
    return resolveSubstitutePlayerLimit(playerCount, active, tournament)
  }
  const time = value => new Date(value || 0).getTime()
  const kickoff = time(match.refereeStartedAt || match.refereeClockStartedAt || match.actualKickoffAt || match.startedAt)
  const history = (division.rulesHistory || []).filter(row => hasBench(row.snapshot)
    && (match.rulesVersion && String(row.version) === String(match.rulesVersion) || kickoff > 0 && time(row.revisedAt) >= kickoff))
    .sort((a,b) => time(a.revisedAt) - time(b.revisedAt))[0]?.snapshot
  const frozen = [match.rulesSnapshot, match.publishedRegulationsSnapshot, match.substitutionRulesSnapshot, history].find(hasBench)
  // 已开赛场次只读已有快照/历史；缺失时使用原有默认值，不套用后改的新规程。
  return resolveSubstitutePlayerLimit(playerCount, frozen)
}
