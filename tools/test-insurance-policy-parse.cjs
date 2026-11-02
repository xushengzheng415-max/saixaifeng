'use strict'
const assert = require('assert')
const parse = require('../cloudfunctions/webLoginApi/serviceInsurancePolicyParse.cjs')

function run(name, fn) {
  fn()
  console.log('ok', name)
}

run('matched name and coverage', () => {
  const text = [
    '运动意外伤害保险单',
    '被保险人：郑旭升',
    '保单号：PICC20261030001AB',
    '保险期间：2026年10月01日至2026年10月31日'
  ].join('\n')
  const result = parse.analyzeInsuranceText(text, {
    playerName: '郑旭升',
    eventStart: '2026-10-10',
    eventEnd: '2026-10-20'
  })
  assert.strictEqual(result.matchResult, 'matched')
  assert.strictEqual(result.reviewFlag, 'auto_matched')
  assert.strictEqual(result.coverStart, '2026-10-01')
  assert.strictEqual(result.coverEnd, '2026-10-31')
  assert.strictEqual(result.policyNo, 'PICC20261030001AB')
  assert.ok(result.disclaimer.includes('不替代保险公司'))
})

run('name mismatch', () => {
  const text = '被保险人：张三\n保险期间：2026-10-01至2026-10-31'
  const result = parse.analyzeInsuranceText(text, {
    playerName: '郑旭升',
    eventStart: '2026-10-10',
    eventEnd: '2026-10-20'
  })
  assert.strictEqual(result.matchResult, 'name_mismatch')
  assert.strictEqual(result.reviewFlag, 'needs_manual_review')
})

run('coverage gap', () => {
  const text = '被保险人：郑旭升\n保险期间：2026年09月01日至2026年09月30日'
  const result = parse.analyzeInsuranceText(text, {
    playerName: '郑旭升',
    eventStart: '2026-10-10',
    eventEnd: '2026-10-20'
  })
  assert.strictEqual(result.matchResult, 'coverage_gap')
  assert.strictEqual(result.reviewFlag, 'needs_manual_review')
})

run('unclear without dates', () => {
  const text = '被保险人：郑旭升\n本保单仅供参考'
  const result = parse.analyzeInsuranceText(text, {
    playerName: '郑旭升',
    eventStart: '2026-10-10',
    eventEnd: '2026-10-20'
  })
  assert.strictEqual(result.matchResult, 'unclear')
})

run('normalize ignores dots in name', () => {
  assert.strictEqual(parse.nameAppears('被保险人 郑·旭升', '郑旭升'), true)
})

run('slash dates and policy label', () => {
  const text = '保单编号：AB12-34567890\n保险期限 2026/10/05 至 2026/11/05\n姓名郑旭升'
  const result = parse.analyzeInsuranceText(text, {
    playerName: '郑旭升',
    eventStart: '2026-10-10',
    eventEnd: '2026-10-20'
  })
  assert.strictEqual(result.matchResult, 'matched')
  assert.strictEqual(result.policyNo, 'AB12-34567890')
})

run('ancheng sports e-policy sample', () => {
  const text = [
    '安诚财产保险股份有限公司',
    '个人体育健身运动意外伤害保险（互联网专属电子保单）',
    '保单号：4106040631202603800004260A',
    '一、投保人信息',
    '姓名：李卢芬',
    '二、被保险人信息',
    '姓名：李卢芬',
    '三、险种信息',
    '意外伤害 50000',
    '四、保费合计：人民币3.60元',
    '五、保险期限：',
    '自2026年10月22日00时00分00秒起至2026年10月25日00时00分00秒止',
    '安诚财产保险股份有限公司河南分公司',
    '签单：2026年10月21日'
  ].join('\n')
  const cover = parse.extractCoverRange(text)
  assert.strictEqual(cover.coverStart, '2026-10-22')
  assert.strictEqual(cover.coverEnd, '2026-10-25')
  assert.strictEqual(parse.extractPolicyNo(text), '4106040631202603800004260A')
  assert.ok(parse.extractProductType(text).includes('体育健身运动意外'))
  assert.ok(parse.extractInsurer(text).includes('安诚'))
  assert.strictEqual(parse.extractInsuredName(text), '李卢芬')
  const matched = parse.analyzeInsuranceText(text, {
    playerName: '李卢芬',
    eventStart: '2026-10-22',
    eventEnd: '2026-10-24'
  })
  assert.strictEqual(matched.matchResult, 'matched')
  assert.strictEqual(matched.policyNo, '4106040631202603800004260A')
  const gap = parse.analyzeInsuranceText(text, {
    playerName: '李卢芬',
    eventStart: '2026-10-10',
    eventEnd: '2026-10-20'
  })
  assert.strictEqual(gap.matchResult, 'coverage_gap')
})

console.log('PASS insurance policy parse')
