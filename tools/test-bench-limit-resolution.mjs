import assert from 'node:assert/strict'
import { parseBenchLimit, resolveSubstitutePlayerLimit, resolveMatchSubstitutePlayerLimit } from '../web-admin-vue/src/utils/lineupBenchLimit.js'

assert.equal(resolveSubstitutePlayerLimit(8, { regulationDetails: { benchPlayerLimit: 5, benchTotalLimit: 8, benchOfficialLimit: 3 } }), 5)
assert.equal(resolveSubstitutePlayerLimit(8, { regulationDetails: { benchTotalLimit: 8, benchOfficialLimit: 2 } }), 8)
assert.equal(resolveSubstitutePlayerLimit(8, { regulationDetails: { benchPlayerLimit: 5 } }), 5)
assert.equal(resolveSubstitutePlayerLimit(8, { regulationDetails: {} }), 8)
assert.equal(resolveSubstitutePlayerLimit(11, { regulationDetails: {} }), null)

assert.equal(resolveSubstitutePlayerLimit(8, { regulationDetails: { benchTotalLimit: null, benchPlayerLimit: null } }), 8, '达壹竞技组真实空配置应回退8人制默认名额')
assert.equal(resolveSubstitutePlayerLimit(8, { regulationDetails: { benchTotalLimit: null, benchPlayerLimit: 5 } }), 5)
assert.equal(resolveSubstitutePlayerLimit(8, { regulationDetails: { benchTotalLimit: '', benchPlayerLimit: ' ' } }, { benchPlayerLimit: 6 }), 6)
assert.equal(resolveSubstitutePlayerLimit(8, { regulationDetails: { benchTotalLimit: 15, benchPlayerLimit: 0 } }), 0, '明确球员人数0仍禁止选择替补')
assert.equal(resolveSubstitutePlayerLimit(8, { regulationDetails: { benchTotalLimit: 15, benchPlayerLimit: 10, benchOfficialLimit: 5 } }), 10)
assert.equal(resolveSubstitutePlayerLimit(8, { regulationDetails: { benchTotalLimit: 15, benchOfficialLimit: 5 } }), 8, '官员和总人数不能充当球员名额')
assert.equal(resolveMatchSubstitutePlayerLimit(8,{status:'scheduled'},{regulationDetails:{benchPlayerLimit:10},activeRulesSnapshot:{regulationDetails:{benchTotalLimit:15}}}),10)
assert.equal(resolveSubstitutePlayerLimit(11, { regulationDetails: { benchTotalLimit: null, benchPlayerLimit: null } }), null)
for (const value of [null, undefined, '', ' ', false, true, {}, [], -1, 1.5, NaN, Infinity]) assert.equal(parseBenchLimit(value), null)
assert.equal(parseBenchLimit('8'), 8)
assert.equal(parseBenchLimit(0), 0)
assert.equal(parseBenchLimit('0'), 0)
const revised = { activeRulesSnapshot:{regulationDetails:{benchPlayerLimit:4}}, rulesHistory:[{version:'V1',revisedAt:'2026-11-04T12:00:00Z',snapshot:{regulationDetails:{benchPlayerLimit:8}}}] }
assert.equal(resolveMatchSubstitutePlayerLimit(8,{status:'scheduled'},revised),4)
assert.equal(resolveMatchSubstitutePlayerLimit(8,{status:'ongoing',startedAt:'2026-11-04T10:00:00Z'},revised),8)
assert.equal(resolveMatchSubstitutePlayerLimit(8,{status:'finished',rulesSnapshot:{regulationDetails:{benchPlayerLimit:3}}},revised),3)
assert.equal(resolveMatchSubstitutePlayerLimit(8,{status:'finished'},revised),8)
assert.equal(resolveMatchSubstitutePlayerLimit(8,{status:'scheduled'},{activeRulesSnapshot:{regulationDetails:{benchPlayerLimit:null}},publishedRegulationsSnapshot:{regulationDetails:{benchPlayerLimit:3}}}),8)
console.log('替补席人数解析：真实null规程、空值继承、明确0及非法值校验通过；直接测试生产共享模块')
