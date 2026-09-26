import assert from 'node:assert/strict'

function resolveSubstitutePlayerLimit(playerCount, ...sources) {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue
    const details = source.regulationDetails && typeof source.regulationDetails === 'object'
      ? source.regulationDetails
      : source
    const totalLimit = Number(details.benchTotalLimit)
    if (Number.isFinite(totalLimit) && totalLimit >= 0) {
      return totalLimit
    }
    const playerLimit = Number(details.benchPlayerLimit)
    if (Number.isFinite(playerLimit) && playerLimit >= 0) return playerLimit
  }
  return Number(playerCount) === 8 ? 8 : null
}

assert.equal(resolveSubstitutePlayerLimit(8, { regulationDetails: { benchPlayerLimit: 5, benchTotalLimit: 8, benchOfficialLimit: 3 } }), 8)
assert.equal(resolveSubstitutePlayerLimit(8, { regulationDetails: { benchTotalLimit: 8, benchOfficialLimit: 2 } }), 8)
assert.equal(resolveSubstitutePlayerLimit(8, { regulationDetails: { benchPlayerLimit: 5 } }), 5)
assert.equal(resolveSubstitutePlayerLimit(8, { regulationDetails: {} }), 8)
assert.equal(resolveSubstitutePlayerLimit(11, { regulationDetails: {} }), null)

console.log('替补席规程人数解析校验通过：5 个场景。')
