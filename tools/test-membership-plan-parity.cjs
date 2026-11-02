'use strict'
// 会员档位口径一致性自检（离线，不联网）。
//
// 背景：webLoginApi/membership.cjs 决定用户端真实售卖价格，platformOwner/membershipPlans.cjs
// 决定平台后台保存什么。云函数按目录独立部署，只能各存一份实现，所以必须用同一批用例
// 证明两处的 parsePlans / planView / CONFIRMED_PLANS 完全一致，避免平台后台存进一套、
// 用户端按另一套算价。
//
// 同时验证平台侧有意的差异：readPlanState 只读库内配置与代码默认表，不读
// process.env.MEMBERSHIP_PLANS（那是 webLoginApi 自己的环境配置）。
const assert = require('node:assert/strict')

const membership = require('../cloudfunctions/webLoginApi/membership.cjs')
const platformPlans = require('../cloudfunctions/platformOwner/membershipPlans.cjs')

const loginParse = membership.__internals.parsePlans
const loginView = membership.__internals.planView
const platformParse = platformPlans.parsePlans
const platformView = platformPlans.planView

let checks = 0
let failures = 0
async function test(name, fn) {
  checks += 1
  try { await fn() } catch (error) {
    failures += 1
    console.error('[失败] ' + name)
    console.error('       ' + String((error && error.message) || error).replace(/\n/g, '\n       '))
  }
}

const clone = list => JSON.parse(JSON.stringify(list))
const base = () => clone(membership.CONFIRMED_PLANS)
const withPlan = (code, patch) => base().map(plan => plan.code === code ? Object.assign({}, plan, patch) : plan)

// 每一条都同时喂给两处实现，逐字段比对
const cases = [
  ['已确认四档', base()],
  ['JSON 字符串', JSON.stringify(base())],
  ['{plans:[...]} 包装', { plans: base() }],
  ['空字符串', ''],
  ['纯空白字符串', '   '],
  ['非法 JSON', 'not-json'],
  ['空数组', []],
  ['null', null],
  ['undefined', undefined],
  ['缺家庭档', base().filter(plan => plan.code !== 'family')],
  ['重复档位', base().concat([clone(base()[0])])],
  ['续费价低于首月价', withPlan('plus', { renewPriceCents: 100 })],
  ['首月价为 0', withPlan('basic', { firstPriceCents: 0 })],
  ['首月价为负', withPlan('basic', { firstPriceCents: -100 })],
  ['首月价非整数', withPlan('basic', { firstPriceCents: 990.5 })],
  ['首月价超上限', withPlan('basic', { firstPriceCents: 1000001 })],
  ['赠滴为 0', withPlan('pro', { grantDrops: 0 })],
  ['赠滴为负', withPlan('pro', { grantDrops: -50 })],
  ['折扣低于 5 折', withPlan('basic', { portraitDiscount: 0.4 })],
  ['折扣高于 1', withPlan('basic', { portraitDiscount: 1.2 })],
  ['折扣缺省按原价', base().map(plan => { const copy = Object.assign({}, plan); delete copy.portraitDiscount; return copy })],
  ['年付价偏离过大', withPlan('basic', { yearlyPriceCents: 99000 })],
  ['年付价缺省', base().map(plan => { const copy = Object.assign({}, plan); delete copy.yearlyPriceCents; return copy })],
  ['年付价为空串', withPlan('basic', { yearlyPriceCents: '' })],
  ['未知档位代码', withPlan('family', { code: 'gold' })],
  ['名称空串', withPlan('pro', { name: '' })],
  ['名称纯空格', withPlan('pro', { name: '   ' })],
  ['续费价缺省回退首月价', base().map(plan => { const copy = Object.assign({}, plan); delete copy.renewPriceCents; return copy })],
  ['visible=false', withPlan('family', { visible: false })],
  ['visible 缺省视为可售', base().map(plan => { const copy = Object.assign({}, plan); delete copy.visible; return copy })],
  ['order 缺省按档位顺序', base().map(plan => { const copy = Object.assign({}, plan); delete copy.order; return copy })],
  ['order 打乱后重排', base().map((plan, index) => Object.assign({}, plan, { order: 4 - index }))],
  ['追加重复档位', base().concat([Object.assign({}, base()[0], { code: 'basic', order: 5 })])],
  ['含 null 项', base().concat([null])],
  ['含字符串项', base().concat(['basic'])]
]

;(async () => {
  await test('CONFIRMED_PLANS 两处完全一致', () => {
    assert.deepEqual(clone(platformPlans.CONFIRMED_PLANS), clone(membership.CONFIRMED_PLANS))
  })

  await test('LEVEL_CODES 与价格上限一致', () => {
    assert.deepEqual(platformPlans.LEVEL_CODES.slice(), ['basic', 'plus', 'pro', 'family'])
    assert.equal(platformPlans.MAX_PRICE_CENTS, 1000000)
  })

  for (const [name, input] of cases) {
    await test('parsePlans 一致：' + name, () => {
      const expected = loginParse(input)
      const actual = platformParse(input)
      assert.deepEqual(actual, expected)
    })
  }

  await test('planView 一致：默认四档 + 原价 + 折扣标签', () => {
    const list = base().concat([Object.assign({}, base()[0], { portraitDiscount: 1 })])
    list.forEach(plan => {
      const parsed = loginParse(base().map(item => item.code === plan.code ? plan : item))
      const fromLogin = parsed.plans.find(item => item.code === plan.code)
      assert.deepEqual(platformView(fromLogin), loginView(fromLogin))
    })
  })

  // ---------- 平台侧有意差异：不读环境变量 ----------
  function fakeDb(docMap) {
    return {
      collection(name) {
        return {
          doc(id) {
            return {
              async get() {
                const value = docMap[name] && docMap[name][id]
                if (!value) throw new Error('document not exist')
                return { data: value }
              }
            }
          }
        }
      }
    }
  }

  const savedEnv = process.env.MEMBERSHIP_PLANS
  const custom = withPlan('basic', { firstPriceCents: 1290, renewPriceCents: 2290, yearlyPriceCents: 22900 })

  await test('平台侧不读 webLoginApi 的 MEMBERSHIP_PLANS', async () => {
    process.env.MEMBERSHIP_PLANS = JSON.stringify(custom)
    try {
      const state = await platformPlans.readPlanState(fakeDb({}))
      assert.equal(state.source, 'default')
      assert.equal(state.ready, true)
      assert.equal(state.plans.find(plan => plan.code === 'basic').firstPriceCents, 990, '平台侧不得读 webLoginApi 的 MEMBERSHIP_PLANS')
      assert.equal(state.version, 0)
    } finally {
      if (savedEnv === undefined) delete process.env.MEMBERSHIP_PLANS
      else process.env.MEMBERSHIP_PLANS = savedEnv
    }
  })

  await test('库内配置优先，非法也不回退默认表', async () => {
    const good = await platformPlans.readPlanState(fakeDb({
      platform_membership_plans: { plans: { plans: custom, version: 3, updatedByName: '平台负责人' } }
    }))
    assert.equal(good.source, 'db')
    assert.equal(good.ready, true)
    assert.equal(good.version, 3)
    assert.equal(good.plans.find(plan => plan.code === 'basic').firstPriceCents, 1290)
    assert.equal(good.updatedByName, '平台负责人')

    const broken = await platformPlans.readPlanState(fakeDb({
      platform_membership_plans: { plans: { plans: base().filter(plan => plan.code !== 'family'), version: 4 } }
    }))
    assert.equal(broken.source, 'db')
    assert.equal(broken.ready, false)
    assert.equal(broken.reason, 'MEMBERSHIP_PLAN_INVALID')
    assert.deepEqual(broken.plans, [])
  })

  await test('保存提示：家庭档上架、无在售档位、价格变动都能说清楚', () => {
    const prev = base()
    assert.deepEqual(platformPlans.buildWarnings(prev, prev), [], '没有任何变化时不该有提示')

    const familyOn = withPlan('family', { visible: true })
    assert.equal(platformPlans.buildWarnings(familyOn, prev).some(item => item.includes('家庭会员')), true)

    const noneVisible = prev.map(plan => Object.assign({}, plan, { visible: false }))
    assert.equal(platformPlans.buildWarnings(noneVisible, prev).some(item => item.includes('没有任何档位开放售卖')), true)

    const changed = withPlan('basic', { firstPriceCents: 1290, grantDrops: 300 })
    const tips = platformPlans.buildWarnings(changed, prev)
    assert.equal(tips.some(item => item.includes('首月价 9.9 → 12.9 元')), true)
    assert.equal(tips.some(item => item.includes('赠滴 200 → 300')), true)

    const renamed = withPlan('plus', { name: '进阶 PLUS' })
    assert.equal(platformPlans.buildWarnings(renamed, prev).some(item => item.includes('名称 进阶会员 → 进阶 PLUS')), true)
  })

  console.log(`会员档位口径自检：${checks - failures}/${checks} 项通过`)
  if (failures) {
    console.error(`失败 ${failures} 项`)
    process.exitCode = 1
  }
})().catch(error => {
  console.error(error.stack || error)
  process.exitCode = 1
})
