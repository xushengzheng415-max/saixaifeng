import assert from 'node:assert/strict'
import { parseBenchLimit, resolveSubstitutePlayerLimit } from '../web-admin-vue/src/utils/lineupBenchLimit.js'

assert.equal(resolveSubstitutePlayerLimit(8, { regulationDetails: { benchPlayerLimit: 5, benchTotalLimit: 8, benchOfficialLimit: 3 } }), 8)
assert.equal(resolveSubstitutePlayerLimit(8, { regulationDetails: { benchTotalLimit: 8, benchOfficialLimit: 2 } }), 8)
assert.equal(resolveSubstitutePlayerLimit(8, { regulationDetails: { benchPlayerLimit: 5 } }), 5)
assert.equal(resolveSubstitutePlayerLimit(8, { regulationDetails: {} }), 8)
assert.equal(resolveSubstitutePlayerLimit(11, { regulationDetails: {} }), null)

assert.equal(resolveSubstitutePlayerLimit(8, { regulationDetails: { benchTotalLimit: null, benchPlayerLimit: null } }), 8, '达壹竞技组真实空配置应回退8人制默认名额')
assert.equal(resolveSubstitutePlayerLimit(8, { regulationDetails: { benchTotalLimit: null, benchPlayerLimit: 5 } }), 5)
assert.equal(resolveSubstitutePlayerLimit(8, { regulationDetails: { benchTotalLimit: '', benchPlayerLimit: ' ' } }, { benchTotalLimit: 6 }), 6)
assert.equal(resolveSubstitutePlayerLimit(8, { regulationDetails: { benchTotalLimit: 0, benchPlayerLimit: 8 } }), 0, '明确为0仍然禁止选择替补')
assert.equal(resolveSubstitutePlayerLimit(11, { regulationDetails: { benchTotalLimit: null, benchPlayerLimit: null } }), null)
for (const value of [null, undefined, '', ' ', false, true, {}, [], -1, 1.5, NaN, Infinity]) assert.equal(parseBenchLimit(value), null)
assert.equal(parseBenchLimit('8'), 8)
assert.equal(parseBenchLimit(0), 0)
assert.equal(parseBenchLimit('0'), 0)
console.log('替补席人数解析：真实null规程、空值继承、明确0及非法值校验通过；直接测试生产共享模块')
