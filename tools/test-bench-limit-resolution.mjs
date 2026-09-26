import assert from 'node:assert/strict'

function resolveSubstitutePlayerLimit(...sources) {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue
    const details = source.regulationDetails && typeof source.regulationDetails === 'object'
      ? source.regulationDetails
      : source
    const playerLimit = Number(details.benchPlayerLimit)
    if (Number.isFinite(playerLimit) && playerLimit >= 0) return playerLimit
    const totalLimit = Number(details.benchTotalLimit)
    if (Number.isFinite(totalLimit) && totalLimit >= 0) {
      const officialLimit = Number(details.benchOfficialLimit)
      return Number.isFinite(officialLimit) && officialLimit >= 0
        ? Math.max(0, totalLimit - officialLimit)
        : totalLimit
    }
  }
  return null
}

assert.equal(resolveSubstitutePlayerLimit({ regulationDetails: { benchPlayerLimit: 8 } }), 8)
assert.equal(resolveSubstitutePlayerLimit({ regulationDetails: { benchTotalLimit: 8, benchOfficialLimit: 0 } }), 8)
assert.equal(resolveSubstitutePlayerLimit({ regulationDetails: { benchTotalLimit: 8, benchOfficialLimit: 2 } }), 6)
assert.equal(resolveSubstitutePlayerLimit({ regulationDetails: { benchPlayerLimit: 8 } }, { benchPlayerLimit: 7 }), 8)
assert.equal(resolveSubstitutePlayerLimit({ regulationDetails: {} }), null)

console.log('替补席规程人数解析校验通过：5 个场景。')
