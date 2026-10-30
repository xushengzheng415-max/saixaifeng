'use strict'
// 个人会员（一期 A：30 天单次、不自动续费）服务端离线自检。
// 覆盖：档位口径、首月/续费判定、到期叠加、会员单号、会员折扣、支付结果复核、
//      赠滴发放/重复幂等/镜像不一致阻断、下单早退分支与复用、状态与折扣读取、入口注册。
// 不联网、不读凭据文件：RSA 材料本地临时生成，微信下单/查单在本进程内替换为假实现。
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const membership = require('../cloudfunctions/webLoginApi/membership.cjs')
const recharge = require('../cloudfunctions/webLoginApi/honeyRecharge.cjs')

const api = membership.__internals
const DAY = 86400000
const ROOT = path.join(__dirname, '..')

let failures = 0
let checks = 0
async function test(name, fn) {
  checks += 1
  try { await fn() } catch (error) {
    failures += 1
    console.error('[失败] ' + name)
    console.error('       ' + String((error && error.message) || error).replace(/\n/g, '\n       '))
  }
}

// ============ 环境准备 ============
const ENV_KEYS = [
  'WXPAY_MCH_ID', 'WXPAY_SERIAL_NO', 'WXPAY_APIV3_KEY', 'WXPAY_PRIVATE_KEY', 'WXPAY_PLATFORM_PUBLIC_KEY',
  'WXPAY_PLATFORM_SERIAL', 'WXPAY_APP_ID', 'WXPAY_NOTIFY_URL', 'HONEY_TOPUP_PACKS', 'MEMBERSHIP_PLANS',
  'AI_PORTRAIT_HONEY_COST', 'SERVICE_ACCOUNT_APP_ID'
]
const savedEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]))
function setEnv(values) {
  ENV_KEYS.forEach(key => { delete process.env[key] })
  Object.entries(values || {}).forEach(([key, value]) => { process.env[key] = value })
}

const { privateKey: merchantKey, publicKey: merchantPublic } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const merchantPem = merchantKey.export({ type: 'pkcs8', format: 'pem' })
const PAY_MCH_ID = '1900000001'
const PAY_APP_ID = 'wxSERVICEACCOUNT01'
const paymentEnv = {
  WXPAY_MCH_ID: PAY_MCH_ID,
  WXPAY_SERIAL_NO: 'ABCDEF1234567890',
  WXPAY_APIV3_KEY: 'k'.repeat(32),
  WXPAY_PRIVATE_KEY: merchantPem,
  WXPAY_PLATFORM_PUBLIC_KEY: crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' }),
  WXPAY_APP_ID: PAY_APP_ID,
  WXPAY_NOTIFY_URL: 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi?action=honeyPayNotify'
}

// ============ 假数据库（与 test-honey-recharge 同一套模式） ============
function matchRow(row, condition) {
  if (!condition || typeof condition !== 'object') return true
  if (condition.__op === 'and') return condition.parts.every(part => matchRow(row, part))
  return Object.entries(condition).every(([field, expected]) => {
    if (expected && expected.__op === 'gt') return String(row[field] || '') > String(expected.value)
    if (expected && expected.__op === 'in') return expected.values.includes(row[field])
    return row[field] === expected
  })
}
function fakeDb() {
  const collections = new Map()
  const store = name => { if (!collections.has(name)) collections.set(name, new Map()); return collections.get(name) }
  const command = {
    gt: value => ({ __op: 'gt', value }),
    and: parts => ({ __op: 'and', parts }),
    in: values => ({ __op: 'in', values })
  }
  function collectionApi(name) {
    const col = store(name)
    return {
      doc(id) {
        const key = String(id)
        return {
          async get() {
            const data = col.get(key)
            if (!data) throw new Error('document not exist')
            return { data: Object.assign({ _id: key }, data) }
          },
          async set({ data }) { col.set(key, Object.assign({}, data, { _id: key })) },
          async update({ data }) {
            const old = col.get(key)
            if (!old) throw new Error('document not exist')
            col.set(key, Object.assign({}, old, data))
          }
        }
      },
      where(condition) {
        let size = 100, orderField = '_id', orderDir = 'asc'
        const query = {
          field() { return query },
          orderBy(field, direction) { orderField = field; orderDir = direction || 'asc'; return query },
          limit(value) { size = value; return query },
          async get() {
            const rows = [...col.entries()]
              .map(([id, data]) => Object.assign({ _id: id }, data))
              .filter(row => matchRow(row, condition))
            rows.sort((left, right) => String(left[orderField] || '').localeCompare(String(right[orderField] || '')) * (orderDir === 'desc' ? -1 : 1))
            return { data: rows.slice(0, size) }
          }
        }
        return query
      },
      async add({ data }) {
        const id = data && data._id ? String(data._id) : 'auto-' + crypto.randomBytes(6).toString('hex')
        col.set(id, Object.assign({}, data, { _id: id }))
        return { _id: id }
      }
    }
  }
  return {
    serverDate: () => new Date(),
    command,
    collection: collectionApi,
    async runTransaction(work) { return work({ collection: collectionApi, serverDate: () => new Date() }) }
  }
}
async function seedWallet(db, openId, balance) {
  await db.collection('fan_profiles').doc('profile-' + openId).set({
    data: { serviceAccountOpenId: openId, honeyBalance: balance }
  })
  if (balance > 0) {
    await db.collection('fan_points_ledger').doc('seed-' + openId).set({
      data: { serviceAccountOpenId: openId, delta: balance, reason: 'fan-registration-bonus' }
    })
  }
}
function clonedPlans() {
  return membership.CONFIRMED_PLANS.map(plan => Object.assign({}, plan))
}
function memberOrder(outTradeNo, openId = 'o1', overrides) {
  return Object.assign({
    outTradeNo,
    openId,
    userId: 'u1',
    profileId: 'profile-' + openId,
    kind: 'membership',
    planCode: 'basic',
    planName: '基础会员',
    months: 1,
    priceCents: 990,
    priceTier: 'first',
    grantDrops: 200,
    portraitDiscount: 0.95,
    status: 'pending',
    ledgerState: 'pending',
    transactionId: '',
    prepayId: '',
    createdAt: new Date(),
    updatedAt: new Date(),
    notifyCount: 0
  }, overrides || {})
}
const tradeOf = (outTradeNo, overrides) => Object.assign({
  mchid: PAY_MCH_ID,
  appid: PAY_APP_ID,
  out_trade_no: outTradeNo,
  trade_state: 'SUCCESS',
  transaction_id: '4200000000000000000001',
  amount: { total: 990, currency: 'CNY' },
  payer: { openid: 'o1' }
}, overrides || {})

;(async () => {
  // ============ 一、档位配置 ============
  setEnv({})

  await test('档位：未配置 / 非法 JSON 分别给出原因', () => {
    assert.equal(api.parsePlans('').reason, 'MEMBERSHIP_PLAN_NOT_CONFIGURED')
    assert.equal(api.parsePlans('   ').reason, 'MEMBERSHIP_PLAN_NOT_CONFIGURED')
    assert.equal(api.parsePlans('not-json').reason, 'MEMBERSHIP_PLAN_INVALID')
    assert.equal(api.parsePlans([]).reason, 'MEMBERSHIP_PLAN_NOT_CONFIGURED')
  })

  await test('档位：2026-10-27 已确认四档可直接解析，家庭档不可售', () => {
    const state = api.parsePlans(clonedPlans())
    assert.equal(state.ready, true)
    assert.deepEqual(state.plans.map(plan => plan.code), ['basic', 'plus', 'pro', 'family'])
    assert.deepEqual(state.plans.map(plan => plan.firstPriceCents), [990, 1990, 3990, 5990])
    assert.deepEqual(state.plans.map(plan => plan.renewPriceCents), [1990, 2990, 4990, 6990])
    assert.deepEqual(state.plans.map(plan => plan.grantDrops), [200, 500, 1000, 2000])
    assert.equal(state.plans[3].visible, false, '家庭档本期只保留定义，不售卖')
    assert.deepEqual(state.plans.map(plan => plan.order), [1, 2, 3, 4])
    assert.equal(api.parsePlans({ plans: clonedPlans() }).ready, true, '接受 {plans:[...]} 包装')
    assert.equal(api.parsePlans(JSON.stringify(clonedPlans())).ready, true, '接受 JSON 字符串')
  })

  await test('档位：缺档 / 重码 / 价格倒挂 / 赠滴为 0 / 折扣越界 一律整组拒绝', () => {
    const missing = clonedPlans().filter(plan => plan.code !== 'family')
    assert.equal(api.parsePlans(missing).reason, 'MEMBERSHIP_PLAN_INVALID')
    const duplicated = clonedPlans().concat([Object.assign({}, clonedPlans()[0])])
    assert.equal(api.parsePlans(duplicated).reason, 'MEMBERSHIP_PLAN_INVALID')
    const inverted = clonedPlans().map(plan => plan.code === 'plus' ? Object.assign({}, plan, { renewPriceCents: 100 }) : plan)
    assert.equal(api.parsePlans(inverted).reason, 'MEMBERSHIP_PLAN_INVALID')
    const freeGrant = clonedPlans().map(plan => plan.code === 'pro' ? Object.assign({}, plan, { grantDrops: 0 }) : plan)
    assert.equal(api.parsePlans(freeGrant).reason, 'MEMBERSHIP_PLAN_INVALID')
    const cheapDiscount = clonedPlans().map(plan => plan.code === 'basic' ? Object.assign({}, plan, { portraitDiscount: 0.4 }) : plan)
    assert.equal(api.parsePlans(cheapDiscount).reason, 'MEMBERSHIP_PLAN_INVALID')
    const yearlyOff = clonedPlans().map(plan => plan.code === 'basic' ? Object.assign({}, plan, { yearlyPriceCents: 99000 }) : plan)
    assert.equal(api.parsePlans(yearlyOff).reason, 'MEMBERSHIP_PLAN_INVALID')
    const unknownLevel = clonedPlans().map(plan => plan.code === 'family' ? Object.assign({}, plan, { code: 'gold' }) : plan)
    assert.equal(api.parsePlans(unknownLevel).reason, 'MEMBERSHIP_PLAN_INVALID')
    const unnamed = clonedPlans().map(plan => plan.code === 'pro' ? Object.assign({}, plan, { name: '' }) : plan)
    assert.equal(api.parsePlans(unnamed).reason, 'MEMBERSHIP_PLAN_INVALID')
  })

  await test('档位：默认取 2026-10-27 已确认表，环境变量与库内配置优先', async () => {
    const db = fakeDb()
    const fallback = await membership.planState(db)
    assert.equal(fallback.ready, true)
    assert.equal(fallback.plans.find(plan => plan.code === 'basic').firstPriceCents, 990)

    const custom = clonedPlans().map(plan => plan.code === 'basic'
      ? Object.assign({}, plan, { firstPriceCents: 1290, renewPriceCents: 2290, yearlyPriceCents: 22900 })
      : plan)
    process.env.MEMBERSHIP_PLANS = JSON.stringify(custom)
    try {
      const fromEnv = await membership.planState(db)
      assert.equal(fromEnv.plans.find(plan => plan.code === 'basic').firstPriceCents, 1290, '环境变量优先于代码内表')
    } finally { delete process.env.MEMBERSHIP_PLANS }

    await db.collection('platform_membership_plans').doc('plans').set({
      data: { plans: clonedPlans().map(plan => plan.code === 'basic' ? Object.assign({}, plan, { firstPriceCents: 1390, renewPriceCents: 2390, yearlyPriceCents: 23900 }) : plan) }
    })
    const fromDb = await membership.planState(db)
    assert.equal(fromDb.plans.find(plan => plan.code === 'basic').firstPriceCents, 1390, '库内配置优先')
  })

  await test('档位：库内配置存在但非法时不回退环境变量或代码内表', async () => {
    const db = fakeDb()
    process.env.MEMBERSHIP_PLANS = JSON.stringify(clonedPlans())
    try {
      await db.collection('platform_membership_plans').doc('plans').set({
        data: { plans: clonedPlans().filter(plan => plan.code !== 'family') }
      })
      const state = await membership.planState(db)
      assert.equal(state.ready, false, '半套配置不得静默回退')
      assert.equal(state.reason, 'MEMBERSHIP_PLAN_INVALID')
      assert.equal(state.plans.length, 0)
    } finally { delete process.env.MEMBERSHIP_PLANS }
  })

  await test('档位视图：折扣文案按折数展示', () => {
    const plans = api.parsePlans(clonedPlans()).plans
    assert.equal(api.planView(plans[0]).portraitDiscountLabel, '9.5 折')
    assert.equal(api.planView(plans[1]).portraitDiscountLabel, '9 折')
    assert.equal(api.planView(plans[2]).portraitDiscountLabel, '8 折')
    assert.equal(api.planView(Object.assign({}, plans[0], { portraitDiscount: 1 })).portraitDiscountLabel, '原价')
  })

  // ============ 二、价格档与到期时间 ============
  await test('首月价：只有从未付过会员的账号才享首月价', () => {
    assert.equal(api.priceTierFor(null), 'first')
    assert.equal(api.priceTierFor({}), 'first')
    assert.equal(api.priceTierFor({ firstMonthUsed: false }), 'first')
    assert.equal(api.priceTierFor({ firstMonthUsed: true }), 'renew')
    assert.equal(api.priceTierFor({ firstMonthUsed: true, lastPriceTier: 'first' }), 'renew', '付过一笔即失格')
  })

  await test('到期叠加：在现有到期日上加 30 天，过期则从当前时间起算', () => {
    const now = Date.UTC(2026, 9, 29, 12, 0, 0)
    assert.equal(api.nextExpiry(null, now, 1).getTime(), now + 30 * DAY, '首次开通从当前时间起算')
    assert.equal(api.nextExpiry({ expiresAt: new Date(now + 10 * DAY) }, now, 1).getTime(), now + 40 * DAY, '未到期续费保留剩余天数')
    assert.equal(api.nextExpiry({ expiresAt: new Date(now - 5 * DAY) }, now, 1).getTime(), now + 30 * DAY, '已过期续费不能白付')
    assert.equal(api.nextExpiry(null, now, 3).getTime(), now + 90 * DAY)
    assert.equal(api.nextExpiry({ expiresAt: { $date: now + 2 * DAY } }, now, 1).getTime(), now + 32 * DAY, '兼容 $date 时间格式')
  })

  await test('会员单号：MT 前缀 26 位，与充值单号 HT 区分', () => {
    const fixed = new Date(Date.UTC(2026, 9, 29, 4, 5, 6))
    const no = api.nextOutTradeNo('o1', fixed)
    assert.equal(no.length, 26)
    assert.match(no, /^MT20261029120506[0-9A-Z]{6}[0-9A-F]{4}$/)
    assert.notEqual(api.nextOutTradeNo('o1', fixed), api.nextOutTradeNo('o1', fixed))
    assert.match(api.grantLedgerId(no), /^mbr-[0-9a-f]{24}$/)
    assert.equal(api.grantLedgerId(no), api.grantLedgerId(no), '赠滴流水 ID 必须确定性')
  })

  // ============ 三、会员折扣（只作用在活动实售价） ============
  await test('会员折扣：95/90/80 滴，非法折扣与非法基数一律原价', () => {
    assert.equal(api.discountedCost(100, 0.95), 95)
    assert.equal(api.discountedCost(100, 0.9), 90)
    assert.equal(api.discountedCost(100, 0.8), 80)
    assert.equal(api.discountedCost(100, 1), 100)
    assert.equal(api.discountedCost(100, 0), 100)
    assert.equal(api.discountedCost(100, 1.2), 100)
    assert.equal(api.discountedCost(100, -0.2), 100)
    assert.equal(api.discountedCost(100, NaN), 100)
    assert.equal(api.discountedCost(0, 0.9), 0)
    assert.equal(api.discountedCost(2, 0.5), 1, '至少收 1 滴，不能出现免费')
    assert.equal(membership.discountedCost(150, 0.8), 120, '150 滴标价只在展示层使用，扣费按实售价')
  })

  // ============ 四、支付结果复核 ============
  await test('支付复核：商户号 / 应用 / 单号 / 金额 / 付款人 / 微信单号 缺一不可', () => {
    const config = { mchid: PAY_MCH_ID, appId: PAY_APP_ID }
    const order = memberOrder('MT20261029000000ABCDEF1234', 'o1')
    assert.doesNotThrow(() => api.verifyTrade(config, order, tradeOf(order.outTradeNo)))
    const badMch = tradeOf(order.outTradeNo, { mchid: '1900000002' })
    assert.throws(() => api.verifyTrade(config, order, badMch), error => error.code === 'MEMBERSHIP_ORDER_MISMATCH')
    const badApp = tradeOf(order.outTradeNo, { appid: 'wxOTHERAPP' })
    assert.throws(() => api.verifyTrade(config, order, badApp), error => error.code === 'MEMBERSHIP_ORDER_MISMATCH')
    const badNo = tradeOf('MT20261029000000ZZZZZZ1234')
    assert.throws(() => api.verifyTrade(config, order, badNo), error => error.code === 'MEMBERSHIP_ORDER_MISMATCH')
    const badAmount = tradeOf(order.outTradeNo, { amount: { total: 1, currency: 'CNY' } })
    assert.throws(() => api.verifyTrade(config, order, badAmount), error => error.code === 'MEMBERSHIP_AMOUNT_MISMATCH')
    const badCurrency = tradeOf(order.outTradeNo, { amount: { total: 990, currency: 'USD' } })
    assert.throws(() => api.verifyTrade(config, order, badCurrency), error => error.code === 'MEMBERSHIP_AMOUNT_MISMATCH')
    const badPayer = tradeOf(order.outTradeNo, { payer: { openid: 'o2' } })
    assert.throws(() => api.verifyTrade(config, order, badPayer), error => error.code === 'MEMBERSHIP_ORDER_MISMATCH')
    const noTransaction = tradeOf(order.outTradeNo, { transaction_id: '' })
    assert.throws(() => api.verifyTrade(config, order, noTransaction), error => error.code === 'MEMBERSHIP_TRANSACTION_MISSING')
  })

  // ============ 五、赠滴发放 ============
  await test('赠滴：首笔订单发放、写账本、改镜像、建订阅、订单置已发放', async () => {
    const db = fakeDb()
    await seedWallet(db, 'o1', 10)
    const order = memberOrder('MT20261029120000ABCDEF1234')
    await db.collection('membership_orders').doc(order.outTradeNo).set({ data: order })

    const before = Date.now()
    const result = await api.grantOrder(db, order, '4200000000000000000001', 'notify')
    assert.equal(result.granted, true)
    assert.equal(result.deduped, false)
    assert.equal(result.balance, 210, '10 滴 + 赠 200 滴')

    const profile = (await db.collection('fan_profiles').doc('profile-o1').get()).data
    assert.equal(profile.honeyBalance, 210, '镜像余额必须同步')

    const ledger = (await db.collection('fan_points_ledger').doc(api.grantLedgerId(order.outTradeNo)).get()).data
    assert.equal(ledger.delta, 200)
    assert.equal(ledger.reason, 'membership-grant')
    assert.equal(ledger.refId, 'membership:basic:' + order.outTradeNo, '赠滴幂等键按订单，不按月份')
    assert.equal(ledger.outTradeNo, order.outTradeNo)
    assert.equal(ledger.membershipLevel, 'basic')

    const subscription = (await db.collection('member_subscriptions').doc('o1').get()).data
    assert.equal(subscription.status, 'active')
    assert.equal(subscription.levelCode, 'basic')
    assert.equal(subscription.firstMonthUsed, true)
    assert.equal(subscription.autoRenew, false, '一期不做自动续费')
    assert.equal(subscription.lastOrderId, order.outTradeNo)
    assert.ok(subscription.expiresAt.getTime() >= before + 30 * DAY, '到期时间应为 30 天后')
    assert.ok(subscription.expiresAt.getTime() <= Date.now() + 30 * DAY + 5000)

    const paid = (await db.collection('membership_orders').doc(order.outTradeNo).get()).data
    assert.equal(paid.status, 'paid')
    assert.equal(paid.ledgerState, 'granted')
    assert.equal(paid.transactionId, '4200000000000000000001')
    assert.equal(paid.ledgerRefId, 'membership:basic:' + order.outTradeNo)
  })

  await test('赠滴：同一订单重复回调只补状态，不重复加滴也不重新延期', async () => {
    const db = fakeDb()
    await seedWallet(db, 'o1', 0)
    const order = memberOrder('MT20261029120001ABCDEF1234')
    await db.collection('membership_orders').doc(order.outTradeNo).set({ data: order })
    await api.grantOrder(db, order, '4200000000000000000002', 'notify')
    const firstExpiry = (await db.collection('member_subscriptions').doc('o1').get()).data.expiresAt.getTime()

    const again = await api.grantOrder(db, order, '4200000000000000000002', 'notify')
    assert.equal(again.granted, false)
    assert.equal(again.deduped, true)
    assert.equal(again.balance, 200, '不能重复加滴')

    const profile = (await db.collection('fan_profiles').doc('profile-o1').get()).data
    assert.equal(profile.honeyBalance, 200)
    const rows = (await db.collection('fan_points_ledger').where({ serviceAccountOpenId: 'o1', refId: 'membership:basic:' + order.outTradeNo }).get()).data
    assert.equal(rows.length, 1, '同一订单只允许一条赠滴流水')
    const secondExpiry = (await db.collection('member_subscriptions').doc('o1').get()).data.expiresAt.getTime()
    assert.equal(secondExpiry, firstExpiry, '重复回调不得重新延期')
  })

  await test('赠滴：账本与镜像不一致时阻断，订单留「已支付·待发放」痕迹', async () => {
    const db = fakeDb()
    await seedWallet(db, 'o1', 300)
    await db.collection('fan_profiles').doc('profile-o1').update({ data: { honeyBalance: 500 } })
    const order = memberOrder('MT20261029120002ABCDEF1234')
    await db.collection('membership_orders').doc(order.outTradeNo).set({ data: order })

    await assert.rejects(() => api.grantOrder(db, order, '4200000000000000000003', 'notify'), error => error.code === 'HONEY_RECONCILING')
    const blocked = (await db.collection('membership_orders').doc(order.outTradeNo).get()).data
    assert.equal(blocked.status, 'paid')
    assert.equal(blocked.ledgerState, 'blocked')
    assert.equal(blocked.ledgerError, 'HONEY_RECONCILING')
    const profile = (await db.collection('fan_profiles').doc('profile-o1').get()).data
    assert.equal(profile.honeyBalance, 500, '阻断时不得改镜像')
    const rows = (await db.collection('fan_points_ledger').where({ serviceAccountOpenId: 'o1' }).get()).data
    assert.equal(rows.length, 1, '阻断时不得写赠滴流水')
  })

  await test('赠滴：已退款订单与快照不一致订单都拒绝发放', async () => {
    const db = fakeDb()
    await seedWallet(db, 'o1', 0)
    const refunded = memberOrder('MT20261029120003ABCDEF1234', 'o1', { status: 'refunded' })
    await db.collection('membership_orders').doc(refunded.outTradeNo).set({ data: refunded })
    await assert.rejects(() => api.grantOrder(db, refunded, '4200000000000000000004', 'notify'), error => error.code === 'MEMBERSHIP_ORDER_STATE_INVALID')

    const tampered = memberOrder('MT20261029120004ABCDEF1234')
    await db.collection('membership_orders').doc(tampered.outTradeNo).set({ data: Object.assign({}, tampered, { grantDrops: 5000 }) })
    await assert.rejects(() => api.grantOrder(db, tampered, '4200000000000000000005', 'notify'), error => error.code === 'MEMBERSHIP_ORDER_MISMATCH')

    await assert.rejects(
      () => api.grantOrder(db, memberOrder('MT20261029120005ABCDEF1234'), '', 'notify'),
      error => error.code === 'MEMBERSHIP_TRANSACTION_MISSING'
    )
    await assert.rejects(
      () => api.grantOrder(db, memberOrder('MT20261029120006ABCDEF1234', 'oX'), '4200000000000000000006', 'notify'),
      error => error.code === 'HONEY_ACCOUNT_NOT_OPEN'
    )
  })

  // ============ 六、下单 ============
  await test('下单：iOS、家庭档、年付、支付未配置、档位无效 全部早退', async () => {
    setEnv({})
    const db = fakeDb()
    await seedWallet(db, 'o1', 100)
    const actor = { openId: 'o1', userId: 'u1' }

    const ios = await api.createOrder(db, actor, { planCode: 'basic', clientPlatform: 'ios' })
    assert.equal(ios.success, false)
    assert.equal(ios.code, 'IOS_VIRTUAL_PAYMENT_RESTRICTED', 'iOS 不得售卖虚拟权益')

    const family = await api.createOrder(db, actor, { planCode: 'family', clientPlatform: 'wechat-h5' })
    assert.equal(family.code, 'MEMBERSHIP_PLAN_NOT_OPEN')

    const yearly = await api.createOrder(db, actor, { planCode: 'basic', priceTier: 'yearly', clientPlatform: 'wechat-h5' })
    assert.equal(yearly.code, 'MEMBERSHIP_YEARLY_NOT_OPEN')

    const unpaid = await api.createOrder(db, actor, { planCode: 'basic', clientPlatform: 'wechat-h5' })
    assert.equal(unpaid.code, 'PAYMENT_NOT_CONFIGURED')

    setEnv(paymentEnv)
    const unknown = await api.createOrder(db, actor, { planCode: 'gold', clientPlatform: 'wechat-h5' })
    assert.equal(unknown.code, 'MEMBERSHIP_PLAN_INVALID')

    const noAccount = await api.createOrder(db, { openId: 'o9', userId: 'u9' }, { planCode: 'basic', clientPlatform: 'wechat-h5' })
    assert.equal(noAccount.code, 'HONEY_ACCOUNT_NOT_OPEN')
    assert.equal((await db.collection('membership_orders').where({}).get()).data.length, 0, '早退不得留下订单')
  })

  await test('下单：首月价下单、90 分钟内复用同一待支付订单、文案与金额快照正确', async () => {
    setEnv(paymentEnv)
    const db = fakeDb()
    await seedWallet(db, 'o1', 100)
    const plansCalls = []
    const originalPrepay = recharge.__internals.createPrepay
    recharge.__internals.createPrepay = async (config, order, options) => {
      plansCalls.push({ order, options })
      return 'wx-prepay-' + order.outTradeNo
    }
    try {
      const actor = { openId: 'o1', userId: 'u1' }
      const first = await api.createOrder(db, actor, { planCode: 'basic', clientPlatform: 'wechat-h5' })
      assert.equal(first.success, true)
      assert.equal(first.reused, false)
      assert.match(first.order.outTradeNo, /^MT/)
      assert.equal(first.order.priceCents, 990)
      assert.equal(first.order.priceYuan, 9.9)
      assert.equal(first.order.priceTier, 'first')
      assert.equal(first.order.grantDrops, 200)
      assert.equal(first.order.status, 'pending')
      assert.equal(first.payParams.package, 'prepay_id=wx-prepay-' + first.order.outTradeNo)
      assert.equal(first.payParams.appId, PAY_APP_ID)
      assert.equal(first.balance, 100)
      assert.equal(plansCalls.length, 1)
      assert.equal(plansCalls[0].options.description, '赛小蜂足球基础会员', '会员下单文案不得沿用蜂蜜充值')
      assert.equal(plansCalls[0].options.attach, 'membership')

      const saved = (await db.collection('membership_orders').doc(first.order.outTradeNo).get()).data
      assert.equal(saved.kind, 'membership')
      assert.equal(saved.autoRenew, false)
      assert.equal(saved.openId, 'o1')
      assert.equal(saved.prepayId, 'wx-prepay-' + first.order.outTradeNo)

      const second = await api.createOrder(db, actor, { planCode: 'basic', clientPlatform: 'wechat-h5' })
      assert.equal(second.success, true)
      assert.equal(second.reused, true, '连点应复用同一待支付订单')
      assert.equal(second.order.outTradeNo, first.order.outTradeNo)
      assert.equal(plansCalls.length, 1, '复用不得再下一笔微信预支付')
      assert.equal((await db.collection('membership_orders').where({ openId: 'o1' }).get()).data.length, 1)
    } finally { recharge.__internals.createPrepay = originalPrepay }
  })

  await test('下单：付过一笔会员后按续费价，且不再享首月价', async () => {
    setEnv(paymentEnv)
    const db = fakeDb()
    await seedWallet(db, 'o1', 1000)
    const originalPrepay = recharge.__internals.createPrepay
    recharge.__internals.createPrepay = async (config, order) => 'wx-prepay-' + order.outTradeNo
    try {
      const actor = { openId: 'o1', userId: 'u1' }
      const first = await api.createOrder(db, actor, { planCode: 'plus', clientPlatform: 'wechat-h5' })
      assert.equal(first.order.priceCents, 1990)
      assert.equal(first.order.priceTier, 'first')
      await db.collection('member_subscriptions').doc('o1').set({ data: { openId: 'o1', levelCode: 'plus', status: 'active', firstMonthUsed: true, expiresAt: new Date(Date.now() + 10 * DAY) } })

      const renew = await api.createOrder(db, actor, { planCode: 'plus', clientPlatform: 'wechat-h5' })
      assert.equal(renew.success, true)
      assert.equal(renew.order.priceCents, 2990, '续费价')
      assert.equal(renew.order.priceTier, 'renew')
      assert.notEqual(renew.order.outTradeNo, first.order.outTradeNo, '档位/价格变化不得复用旧单')
    } finally { recharge.__internals.createPrepay = originalPrepay }
  })

  // ============ 七、回调/查单发放 ============
  await test('查单发放：SUCCESS 复核通过后发放，重复回调查单短路不重复加滴', async () => {
    setEnv(paymentEnv)
    const db = fakeDb()
    await seedWallet(db, 'o1', 0)
    const order = memberOrder('MT20261029130000ABCDEF1234')
    await db.collection('membership_orders').doc(order.outTradeNo).set({ data: order })
    const originalQuery = recharge.__internals.queryTransaction
    recharge.__internals.queryTransaction = async (config, outTradeNo) => ({ status: 200, body: tradeOf(outTradeNo) })
    try {
      const first = await membership.confirmOrder(db, order.outTradeNo, 'notify')
      assert.equal(first.state, 'paid')
      assert.equal(first.granted, true)
      assert.equal(first.balance, 200)
      const saved = (await db.collection('membership_orders').doc(order.outTradeNo).get()).data
      assert.equal(saved.status, 'paid')
      assert.equal(saved.ledgerState, 'granted')
      assert.equal(saved.notifyCount, 1)
      assert.equal(saved.paidSource, 'notify')

      const again = await membership.confirmOrder(db, order.outTradeNo, 'notify')
      assert.equal(again.granted, false, '已发放订单直接短路')
      assert.equal(again.state, 'paid')
      const profile = (await db.collection('fan_profiles').doc('profile-o1').get()).data
      assert.equal(profile.honeyBalance, 200)
    } finally { recharge.__internals.queryTransaction = originalQuery }
  })

  await test('查单发放：未支付 / 已关闭 不同状态如实返回，金额不符拒绝发放', async () => {
    setEnv(paymentEnv)
    const originalQuery = recharge.__internals.queryTransaction
    try {
      const pendingDb = fakeDb()
      await seedWallet(pendingDb, 'o1', 0)
      const pendingOrder = memberOrder('MT20261029130001ABCDEF1234')
      await pendingDb.collection('membership_orders').doc(pendingOrder.outTradeNo).set({ data: pendingOrder })
      recharge.__internals.queryTransaction = async (config, outTradeNo) => ({ status: 200, body: tradeOf(outTradeNo, { trade_state: 'NOTPAY' }) })
      const pending = await membership.confirmOrder(pendingDb, pendingOrder.outTradeNo, 'notify')
      assert.equal(pending.state, 'NOTPAY')
      assert.equal(pending.granted, false)

      recharge.__internals.queryTransaction = async (config, outTradeNo) => ({ status: 200, body: tradeOf(outTradeNo, { trade_state: 'CLOSED' }) })
      const closed = await membership.confirmOrder(pendingDb, pendingOrder.outTradeNo, 'notify')
      assert.equal(closed.state, 'closed')
      assert.equal((await pendingDb.collection('membership_orders').doc(pendingOrder.outTradeNo).get()).data.status, 'closed')

      recharge.__internals.queryTransaction = async () => ({ status: 404, body: {} })
      const unknown = await membership.confirmOrder(pendingDb, pendingOrder.outTradeNo, 'client')
      assert.equal(unknown.state, 'unknown', '404 视为未知，不得当已支付')

      const mismatchDb = fakeDb()
      await seedWallet(mismatchDb, 'o1', 0)
      const mismatchOrder = memberOrder('MT20261029130002ABCDEF1234')
      await mismatchDb.collection('membership_orders').doc(mismatchOrder.outTradeNo).set({ data: mismatchOrder })
      recharge.__internals.queryTransaction = async (config, outTradeNo) => ({ status: 200, body: tradeOf(outTradeNo, { amount: { total: 1, currency: 'CNY' } }) })
      await assert.rejects(() => membership.confirmOrder(mismatchDb, mismatchOrder.outTradeNo, 'notify'), error => error.code === 'MEMBERSHIP_AMOUNT_MISMATCH')
      assert.equal((await mismatchDb.collection('membership_orders').doc(mismatchOrder.outTradeNo).get()).data.ledgerState, 'pending', '金额不符不得发放')
    } finally { recharge.__internals.queryTransaction = originalQuery }
  })

  await test('查单发放：订单不存在与支付未配置分别拒绝', async () => {
    setEnv({})
    const db = fakeDb()
    await assert.rejects(() => membership.confirmOrder(db, 'MT20261029140000ABCDEF1234', 'notify'), error => error.code === 'PAYMENT_NOT_CONFIGURED')
    setEnv(paymentEnv)
    await assert.rejects(() => membership.confirmOrder(db, 'MT20261029140000ABCDEF1234', 'notify'), error => error.code === 'MEMBERSHIP_ORDER_NOT_FOUND')
  })

  // ============ 八、状态与折扣读取 ============
  await test('状态：未开通时首月价可用、只展示三档可售、支付就绪才允许购买', async () => {
    setEnv(paymentEnv)
    const db = fakeDb()
    await seedWallet(db, 'o1', 50)
    const state = await membership.status(db, 'o1')
    assert.equal(state.subscription, null)
    assert.equal(state.isFirstMonthAvailable, true)
    assert.equal(state.purchaseEnabled, true)
    assert.equal(state.reason, '')
    assert.equal(state.plans.length, 4, '四档定义齐全（家庭档不售）')
    assert.equal(state.sellablePlans.length, 3, '家庭档 visible=false 不得出现在可售列表')
    assert.equal(state.sellablePlans[0].code, 'basic')
    assert.equal(state.balance, 50)
    assert.deepEqual(state.rights.filter(right => right.open).map(right => right.code), ['grant', 'badge', 'portrait'])

    setEnv({})
    const unpaid = await membership.status(db, 'o1')
    assert.equal(unpaid.purchaseEnabled, false)
    assert.equal(unpaid.reason, 'PAYMENT_NOT_CONFIGURED')
  })

  await test('状态：到期按读取惰性置 expired，续费资格随之变化', async () => {
    setEnv(paymentEnv)
    const db = fakeDb()
    await seedWallet(db, 'o1', 0)
    await db.collection('member_subscriptions').doc('o1').set({
      data: { openId: 'o1', userId: 'u1', levelCode: 'pro', status: 'active', firstMonthUsed: true, startedAt: new Date(Date.now() - 40 * DAY), expiresAt: new Date(Date.now() - DAY), autoRenew: false }
    })
    const state = await membership.status(db, 'o1')
    assert.equal(state.subscription.status, 'expired')
    assert.equal(state.subscription.daysLeft, 0)
    assert.equal(state.isFirstMonthAvailable, false, '付过会员即不享首月价')
    const saved = (await db.collection('member_subscriptions').doc('o1').get()).data
    assert.equal(saved.status, 'expired', '读取时应回写到期状态')
    assert.equal(state.rights.find(right => right.code === 'portrait').detail, '会员生效后享定妆照折扣')
  })

  await test('状态：生效中的会员展示徽章、剩余天数与定妆照折数', async () => {
    setEnv(paymentEnv)
    const db = fakeDb()
    await seedWallet(db, 'o1', 0)
    await db.collection('member_subscriptions').doc('o1').set({
      data: { openId: 'o1', levelCode: 'pro', status: 'active', firstMonthUsed: true, startedAt: new Date(Date.now() - 10 * DAY), expiresAt: new Date(Date.now() + 20 * DAY) }
    })
    const state = await membership.status(db, 'o1')
    assert.equal(state.subscription.status, 'active')
    assert.equal(state.subscription.levelName, '专业会员')
    assert.equal(state.subscription.badgeText, '专业会员')
    assert.equal(state.subscription.portraitDiscount, 0.8)
    assert.equal(state.subscription.daysLeft, 20)
    assert.equal(state.subscription.expiresSoon, false)
    assert.equal(state.subscription.autoRenew, false)
    assert.equal(state.rights.find(right => right.code === 'grant').detail, '每期赠 1000 滴')
    assert.equal(state.rights.find(right => right.code === 'portrait').detail, '定妆照享 8 折')

    const soon = api.subscriptionView({ levelCode: 'pro', status: 'active', expiresAt: new Date(Date.now() + 2 * DAY) }, { pro: api.parsePlans(clonedPlans()).plans.find(plan => plan.code === 'pro') }, Date.now())
    assert.equal(soon.expiresSoon, true)
  })

  await test('会员折扣读取：生效中按档位，过期/无账号/异常一律原价', async () => {
    setEnv(paymentEnv)
    const db = fakeDb()
    await db.collection('member_subscriptions').doc('o1').set({
      data: { openId: 'o1', levelCode: 'plus', status: 'active', expiresAt: new Date(Date.now() + 5 * DAY) }
    })
    const active = await membership.discountFor(db, 'o1')
    assert.equal(active.active, true)
    assert.equal(active.discount, 0.9)
    assert.equal(active.levelCode, 'plus')
    assert.equal(active.planName, '进阶会员')

    await db.collection('member_subscriptions').doc('o2').set({
      data: { openId: 'o2', levelCode: 'pro', status: 'active', expiresAt: new Date(Date.now() - 5 * DAY) }
    })
    const expired = await membership.discountFor(db, 'o2')
    assert.equal(expired.active, false)
    assert.equal(expired.discount, 1)

    assert.deepEqual(await membership.discountFor(db, ''), { active: false, discount: 1, levelCode: '', planName: '', expiresAt: 0 })
    assert.deepEqual(await membership.discountFor(db, 'o3'), { active: false, discount: 1, levelCode: '', planName: '', expiresAt: 0 })
  })

  await test('首页会员卡：支付就绪时给出最低价，档位异常时降级不抛错', async () => {
    setEnv(paymentEnv)
    const db = fakeDb()
    await seedWallet(db, 'o1', 80)
    const card = await membership.homeCard(db, 'o1')
    assert.equal(card.status, 'ready')
    assert.equal(card.plans.length, 3)
    assert.equal(card.lowestFirstPriceCents, 990)
    assert.equal(card.lowestRenewPriceCents, 1990)
    assert.equal(card.balance, 80)

    await db.collection('platform_membership_plans').doc('plans').set({ data: { plans: clonedPlans().filter(plan => plan.code !== 'pro') } })
    const broken = await membership.homeCard(db, 'o1')
    assert.equal(broken.status, 'ready')
    assert.equal(broken.purchaseEnabled, false)
    assert.equal(broken.reason, 'MEMBERSHIP_PLAN_INVALID')
    assert.equal(broken.plans.length, 0)
    assert.equal(broken.lowestFirstPriceCents, 0)
  })

  await test('订单列表与订单状态：只读本人订单，单号非法/他人订单按不存在', async () => {
    setEnv(paymentEnv)
    const db = fakeDb()
    await seedWallet(db, 'o1', 0)
    const mine = memberOrder('MT20261029150000ABCDEF1234', 'o1', { status: 'paid', ledgerState: 'granted', createdAt: new Date(Date.now() - 1000), paidAt: new Date() })
    const other = memberOrder('MT20261029150001ABCDEF1234', 'o2')
    await db.collection('membership_orders').doc(mine.outTradeNo).set({ data: mine })
    await db.collection('membership_orders').doc(other.outTradeNo).set({ data: other })

    const rows = await membership.listOrders(db, 'o1', 30)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].outTradeNo, mine.outTradeNo)
    assert.equal(rows[0].statusLabel, '已支付')
    assert.equal(rows[0].priceYuan, 9.9)

    const handler = membership.create({ db, user: { _id: 'u1' }, session: { serviceAccountOpenId: 'o1' } })
    const bad = await handler('servicePrivateMembershipOrderStatus', { outTradeNo: 'HT123' })
    assert.equal(bad.code, 'MEMBERSHIP_ORDER_INVALID')
    const foreign = await handler('servicePrivateMembershipOrderStatus', { outTradeNo: other.outTradeNo })
    assert.equal(foreign.code, 'MEMBERSHIP_ORDER_NOT_FOUND', '不得泄露他人订单')
    const mineReply = await handler('servicePrivateMembershipOrderStatus', { outTradeNo: mine.outTradeNo })
    assert.equal(mineReply.success, true)
    assert.equal(mineReply.order.status, 'paid')
  })

  await test('个人端入口：未登录、未知 action、状态与订单列表', async () => {
    setEnv(paymentEnv)
    const db = fakeDb()
    await seedWallet(db, 'o1', 0)
    const anonymous = membership.create({ db, user: null, session: {} })
    const denied = await anonymous('servicePrivateMembershipStatus', {})
    assert.equal(denied.code, 'SERVICE_PRIVATE_AUTH_REQUIRED')

    const handler = membership.create({ db, user: { _id: 'u1' }, session: { serviceAccountOpenId: 'o1' } })
    const invalid = await handler('servicePrivateMembershipWhatever', {})
    assert.equal(invalid.code, 'MEMBERSHIP_ACTION_INVALID')
    const status = await handler('servicePrivateMembershipStatus', {})
    assert.equal(status.success, true)
    assert.equal(status.plans.length, 4)
    const orders = await handler('servicePrivateMembershipOrders', {})
    assert.equal(orders.success, true)
    assert.deepEqual(orders.rows, [])
    assert.equal(orders.purchaseEnabled, true)
  })

  // ============ 九、入口注册与前端接入口径（源码级） ============
  const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8')
  await test('入口注册：webLoginApi 与 servicePrivate 白名单均包含四个会员 action', () => {
    const index = read('cloudfunctions/webLoginApi/index.js')
    const servicePrivate = read('cloudfunctions/webLoginApi/servicePrivate.cjs')
    const actions = ['servicePrivateMembershipStatus', 'servicePrivateMembershipSubscribe', 'servicePrivateMembershipOrderStatus', 'servicePrivateMembershipOrders']
    actions.forEach(action => {
      assert.ok(index.includes("case '" + action + "':"), 'index.js 缺少 ' + action)
      const hits = servicePrivate.split(action).length - 1
      assert.ok(hits >= 2, 'servicePrivate.cjs 的入口与白名单须同时包含 ' + action + '（实际 ' + hits + ' 处）')
    })
  })

  await test('回调分流：honeyPayNotify 按 MT 前缀交给会员发放，HT 仍走充值', () => {
    const source = read('cloudfunctions/webLoginApi/honeyRecharge.cjs')
    assert.ok(/if \(\/\^MT\/\.test\(outTradeNo\)\)/.test(source), '缺少会员单号分流')
    assert.ok(source.includes("require('./membership.cjs').confirmOrder(db, outTradeNo, 'notify')"), '会员回调必须走 confirmOrder')
    const mtBlock = source.slice(source.indexOf('/^MT/.test'), source.indexOf('/^MT/.test') + 900)
    assert.ok(mtBlock.includes("body: { code: 'SUCCESS'"), '会员处理成功也要回 200 SUCCESS')
    assert.ok(/createPrepay\(config, order, options\)/.test(source), 'createPrepay 必须支持会员文案与 attach 覆盖')
    const memberSource = read('cloudfunctions/webLoginApi/membership.cjs')
    assert.ok(memberSource.includes("description: '赛小蜂足球' + plan.name"), '会员下单文案在会员模块内生成')
    assert.ok(memberSource.includes("attach: 'membership'"), '会员订单 attach 需与充值区分')
  })

  await test('定妆照折扣：只作用在活动实售价，读取失败回落原价', () => {
    const source = read('cloudfunctions/webLoginApi/serviceAiPortrait.cjs')
    assert.ok(source.includes("const membership = require('./membership.cjs')"))
    assert.ok(source.includes('membership.discountFor(db, text(serviceAccountOpenId))'))
    assert.ok(source.includes('membership.discountedCost(baseCost, member.discount)'))
    assert.ok(source.includes('const baseCost = portraitCost()'), '折扣基数必须是活动实售价，不能是 150 滴标价')
    assert.ok(source.includes('discount: pricing.discount'), '入库结果需回传本次折扣，便于客服核对')
  })

  await test('个人中心：会员卡摘要与 H5 会员入口同源', () => {
    const account = read('cloudfunctions/webLoginApi/servicePersonalAccount.cjs')
    assert.ok(account.includes("require('./membership.cjs').homeCard"))
    assert.ok(account.includes("'membership-grant':'会员赠滴'"))
    const h5 = read('service-account-h5/service-personal.js')
    assert.ok(h5.includes("var PAGE_VERSION='v2.12'"))
    ;['servicePrivateMembershipStatus', 'servicePrivateMembershipSubscribe', 'servicePrivateMembershipOrderStatus', 'servicePrivateMembershipOrders'].forEach(action => {
      assert.ok(h5.includes(action), 'H5 缺少 ' + action)
    })
    assert.ok(h5.includes('function renderMembershipCenter'))
    assert.ok(h5.includes('function membershipBuy'))
    assert.ok(h5.includes('不会自动续费'))
    // 页面用到的会员样式必须在同目录 CSS 中有定义，避免上线后只剩裸文字
    const css = read('service-account-h5/service-personal-polish.css')
    const classes = [...new Set((h5.match(/\b(?:me-(?:member|home-member)[a-z-]*|mp-[a-z-]+)/g) || []))]
    assert.ok(classes.length >= 8, '会员样式类过少，疑似未接入')
    classes.forEach(name => assert.ok(css.includes('.' + name), 'CSS 缺少 .' + name))
    // 会员中心要如实覆盖服务端给出的不可购买原因，不能只在页面写「暂不可用」
    ;['MEMBERSHIP_PLAN_INVALID', 'MEMBERSHIP_PLAN_NOT_CONFIGURED', 'PAYMENT_NOT_CONFIGURED', 'IOS_VIRTUAL_PAYMENT_RESTRICTED', 'HONEY_ACCOUNT_NOT_OPEN'].forEach(code => {
      assert.ok(h5.includes(code), 'H5 未映射原因 ' + code)
    })
    // 首页会员卡依赖的账户数据必须带 membership，否则卡片会一直停在「正在读取」
    assert.ok(account.includes('membershipCard()'), '账户接口需读取会员卡摘要')
    assert.ok(account.includes('data:{wallet:honey,messages:notices,membership}'), '账户接口需把会员卡摘要一并返回')
    // 会员 mock 只服务本地预览，且不得静默发起真实支付
    assert.ok(h5.includes('function mockMembershipStatus'))
    assert.ok(h5.includes("if(p.action==='servicePrivateMembershipSubscribe')return Promise.reject("))
    const html = read('service-account-h5/me.html')
    assert.ok(/service-personal\.js\?v=20261030-ins2/.test(html), 'H5 需要带版本号避免缓存旧脚本')
  })

  // ============ 收尾 ============
  setEnv(Object.fromEntries(Object.entries(savedEnv).filter(([, value]) => value !== undefined)))
  ENV_KEYS.forEach(key => { if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key] })

  if (failures) {
    console.error('\n会员服务端自检失败：' + failures + ' / ' + checks + ' 项未通过')
    process.exitCode = 1
  } else {
    console.log('会员服务端自检全部通过：' + checks + ' 项')
    console.log('覆盖：档位配置、首月/续费判定、到期叠加、MT 单号、会员折扣、支付复核、赠滴发放/幂等/阻断、下单早退与复用、状态与折扣读取、入口注册、H5 自检口径')
  }
})()
