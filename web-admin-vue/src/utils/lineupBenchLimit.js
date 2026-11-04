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
