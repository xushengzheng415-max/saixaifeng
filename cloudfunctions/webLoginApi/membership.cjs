'use strict'
// 个人会员（一期 A：30 天单次、不自动续费）服务端。
// 口径来源：docs/MEMBERSHIP_SUBSCRIPTION_DESIGN_2026-10-28.md
//           docs/MEMBERSHIP_HONEY_PRICING_2026-10-27.md（2026-10-27 用户确认价格表）
// 规则：
//   1. 价格只认服务端：platform_membership_plans(_id='plans') → 环境变量 MEMBERSHIP_PLANS
//      → 2026-10-27 已确认档位表。档位配置缺项/异常时整组拒绝，不开放购买。
//      （这里的价格是用户已确认的正式价格，不是临时默认值；库内或环境变量可覆盖。）
//   2. 会员订单落 membership_orders，与充值 honey_orders 分表；单号 MT 前缀。
//      支付回调仍走 /honeyPayNotify 唯一入口，按单号前缀分流到本模块。
//   3. 赠滴仍写 fan_points_ledger（唯一事实来源）+ fan_profiles.honeyBalance 镜像，
//      写流水与改镜像必须同一事务，且写入前校验镜像 == 账本合计，否则 HONEY_RECONCILING。
//      赠滴幂等键 refId = membership:<档位>:<订单号>：同一笔订单只发一次，
//      同月多次购买各自发滴（不是按月份去重）。
//   4. 首月价按账号一次性：只要付过一笔会员，之后一律续费价（见设计第十一节第 2 条）。
//   5. 一期不自动扣款、不做系统内退款；到期由读取时按 expiresAt 惰性置 expired。
//   6. iOS 端不得售卖虚拟权益：客户端与服务端双重拦截，错误码沿用 IOS_VIRTUAL_PAYMENT_RESTRICTED。
const crypto = require('crypto')
const { readAll, missingCollection } = require('./data-center/reader.cjs')
const recharge = require('./honeyRecharge.cjs')
const pay = recharge.__internals

const ORDER_COLLECTION = 'membership_orders'
const SUB_COLLECTION = 'member_subscriptions'
const PLAN_COLLECTION = 'platform_membership_plans'
const PLAN_DOC_ID = 'plans'
const LEDGER_COLLECTION = 'fan_points_ledger'
const PROFILE_COLLECTION = 'fan_profiles'
const LEDGER_REASON_GRANT = 'membership-grant'
const LEDGER_REF_PREFIX = 'membership:'
const ORDER_PREFIX = 'MT'
const LEVEL_CODES = ['basic', 'plus', 'pro', 'family']
const PERIOD_MS = 30 * 86400000 // 一期固定：1 个月 = 30 天
const PENDING_REUSE_MS = 90 * 60 * 1000
const MAX_ORDERS = 30
const MAX_PRICE_CENTS = 1000000

// 2026-10-27 用户确认的四档（家庭档本期不开放售卖，仅保留定义）。
// 只作为最后一级回退；库内 platform_membership_plans 或环境变量 MEMBERSHIP_PLANS 优先。
const CONFIRMED_PLANS = [
  { code: 'basic', name: '基础会员', firstPriceCents: 990, renewPriceCents: 1990, yearlyPriceCents: 19900, grantDrops: 200, portraitDiscount: 0.95, visible: true, order: 1 },
  { code: 'plus', name: '进阶会员', firstPriceCents: 1990, renewPriceCents: 2990, yearlyPriceCents: 29900, grantDrops: 500, portraitDiscount: 0.90, visible: true, order: 2 },
  { code: 'pro', name: '专业会员', firstPriceCents: 3990, renewPriceCents: 4990, yearlyPriceCents: 49900, grantDrops: 1000, portraitDiscount: 0.80, visible: true, order: 3 },
  { code: 'family', name: '家庭会员', firstPriceCents: 5990, renewPriceCents: 6990, yearlyPriceCents: 69900, grantDrops: 2000, portraitDiscount: 0.80, visible: false, order: 4 }
]

const STATUS_LABELS = { pending: '待支付', paid: '已支付', closed: '已关闭', refunded: '已退款' }
const PURCHASE_REASON_TEXTS = {
  MEMBERSHIP_PLAN_NOT_CONFIGURED: '会员档位待配置',
  MEMBERSHIP_PLAN_INVALID: '会员档位配置异常，暂不开放',
  PAYMENT_NOT_CONFIGURED: '微信支付待开通',
  IOS_VIRTUAL_PAYMENT_RESTRICTED: 'iOS 暂不支持购买会员'
}
const RIGHTS = [
  { code: 'grant', label: '每月赠滴', open: true },
  { code: 'badge', label: '会员徽章', open: true },
  { code: 'portrait', label: 'AI 定妆照折扣', open: true },
  // 2026-10-31 用户确认：有效会员可不达 100 分更换卡面背景（换照片仍须满 100 分）
  { code: 'backgrounds', label: '会员专属背景', open: true },
  { code: 'export', label: '数据长图导出', open: false },
  { code: 'cards', label: '多套卡面保存', open: false },
  { code: 'report', label: '赛季报告', open: false }
]

const text = value => String(value == null ? '' : value).trim()
const fail = (code, message) => { throw Object.assign(new Error(message), { code }) }
const failResult = (code, error) => ({ success: false, code, error })

function timeValue(value) {
  if (!value) return 0
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : 0 }
  const nested = value.$date || value._date || value.date
  return nested ? timeValue(nested) : 0
}
function beijingStamp(date) {
  const shifted = new Date((date ? date.getTime() : Date.now()) + 8 * 3600000)
  return shifted.toISOString().slice(0, 19).replace(/[-:T]/g, '')
}
// 26 位会员商户单号：MT + 北京时间 + 随机串 + 摘要（HT 前缀留给充值，回调按前缀分流）
function nextOutTradeNo(seed, date) {
  const random = crypto.randomBytes(9).toString('base64').replace(/[^0-9A-Za-z]/g, '').slice(0, 6).toUpperCase()
  const digest = crypto.createHash('sha1').update(text(seed) + '|' + Date.now() + '|' + crypto.randomBytes(12).toString('hex')).digest('hex').slice(0, 4).toUpperCase()
  return ORDER_PREFIX + beijingStamp(date) + random + digest
}
// 赠滴流水确定性文档 ID：同一笔订单并发发放时只有一个能写入成功
function grantLedgerId(outTradeNo) {
  return 'mbr-' + crypto.createHash('sha1').update(text(outTradeNo)).digest('hex').slice(0, 24)
}

// ============ 档位配置 ============
// 输入既接受数组，也接受 {plans:[...]}；任何一项不合法整组拒绝。
function parsePlans(raw) {
  let list = raw
  if (typeof raw === 'string') {
    const source = text(raw)
    if (!source) return { ready: false, plans: [], reason: 'MEMBERSHIP_PLAN_NOT_CONFIGURED' }
    try { list = JSON.parse(source) } catch (error) { return { ready: false, plans: [], reason: 'MEMBERSHIP_PLAN_INVALID' } }
  }
  if (list && !Array.isArray(list) && Array.isArray(list.plans)) list = list.plans
  if (!Array.isArray(list) || !list.length) return { ready: false, plans: [], reason: 'MEMBERSHIP_PLAN_NOT_CONFIGURED' }
  const plans = []
  const seen = new Set()
  for (const item of list) {
    if (!item || typeof item !== 'object') return { ready: false, plans: [], reason: 'MEMBERSHIP_PLAN_INVALID' }
    const code = text(item.code)
    const name = text(item.name)
    const firstPriceCents = Number(item.firstPriceCents)
    const renewPriceCents = Number(item.renewPriceCents == null ? item.firstPriceCents : item.renewPriceCents)
    const hasYearly = item.yearlyPriceCents != null && text(item.yearlyPriceCents) !== ''
    const yearlyPriceCents = hasYearly ? Number(item.yearlyPriceCents) : 0
    const grantDrops = Number(item.grantDrops)
    const portraitDiscount = Number(item.portraitDiscount == null ? 1 : item.portraitDiscount)
    if (LEVEL_CODES.indexOf(code) < 0 || !name || seen.has(code)) return { ready: false, plans: [], reason: 'MEMBERSHIP_PLAN_INVALID' }
    if (!Number.isSafeInteger(firstPriceCents) || firstPriceCents <= 0 || firstPriceCents > MAX_PRICE_CENTS) return { ready: false, plans: [], reason: 'MEMBERSHIP_PLAN_INVALID' }
    if (!Number.isSafeInteger(renewPriceCents) || renewPriceCents < firstPriceCents || renewPriceCents > MAX_PRICE_CENTS) return { ready: false, plans: [], reason: 'MEMBERSHIP_PLAN_INVALID' }
    // 年付按「10 个月续费价」口径，允许 ±5 个月浮动的近似配置
    if (hasYearly && (!Number.isSafeInteger(yearlyPriceCents) || yearlyPriceCents <= 0 || Math.abs(yearlyPriceCents - renewPriceCents * 10) > renewPriceCents * 5)) return { ready: false, plans: [], reason: 'MEMBERSHIP_PLAN_INVALID' }
    if (!Number.isSafeInteger(grantDrops) || grantDrops <= 0) return { ready: false, plans: [], reason: 'MEMBERSHIP_PLAN_INVALID' }
    if (!(portraitDiscount >= 0.5 && portraitDiscount <= 1)) return { ready: false, plans: [], reason: 'MEMBERSHIP_PLAN_INVALID' }
    seen.add(code)
    plans.push({
      code, name, firstPriceCents, renewPriceCents,
      yearlyPriceCents: hasYearly ? yearlyPriceCents : 0,
      grantDrops, portraitDiscount,
      visible: item.visible !== false,
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : LEVEL_CODES.indexOf(code) + 1
    })
  }
  // 四档必须齐全，避免半套配置上线
  if (LEVEL_CODES.some(code => !seen.has(code))) return { ready: false, plans: [], reason: 'MEMBERSHIP_PLAN_INVALID' }
  plans.sort((left, right) => left.order - right.order || left.firstPriceCents - right.firstPriceCents)
  return { ready: true, plans, reason: '' }
}

async function docValue(dbOrTx, collectionName, id) {
  if (!text(id)) return null
  try {
    const reply = await dbOrTx.collection(collectionName).doc(text(id)).get()
    const data = Array.isArray(reply && reply.data) ? reply.data[0] : (reply && reply.data)
    return data && Object.keys(data).length ? data : null
  } catch (error) {
    if (missingCollection(error) || /document.*(?:not exist|not found)/i.test(String(error.message || ''))) return null
    throw error
  }
}

async function planState(db) {
  let fromDb = null
  if (db) {
    try { fromDb = await docValue(db, PLAN_COLLECTION, PLAN_DOC_ID) } catch (error) {
      console.warn('[membership] 档位读取失败', text(error.code) || text(error.message))
    }
  }
  // 库内已配置就用库内（配置错误也不回退，避免两套价格同时生效）
  if (fromDb && (Array.isArray(fromDb.plans) || Array.isArray(fromDb))) return parsePlans(fromDb.plans || fromDb)
  const fromEnv = text(process.env.MEMBERSHIP_PLANS)
  if (fromEnv) return parsePlans(fromEnv)
  return parsePlans(CONFIRMED_PLANS)
}

function planView(plan) {
  return {
    code: plan.code, name: plan.name,
    firstPriceCents: plan.firstPriceCents, renewPriceCents: plan.renewPriceCents,
    yearlyPriceCents: plan.yearlyPriceCents, grantDrops: plan.grantDrops,
    portraitDiscount: plan.portraitDiscount,
    portraitDiscountLabel: plan.portraitDiscount < 1 ? Math.round(plan.portraitDiscount * 100) / 10 + ' 折' : '原价',
    visible: plan.visible, order: plan.order
  }
}

// 首月价资格：账号只要付过一笔会员即失格（一期口径）
function priceTierFor(subscription) {
  return subscription && subscription.firstMonthUsed ? 'renew' : 'first'
}
// 到期时间：续费在现有到期日上叠加，不从当天重算；已过期则从当前时间起算，避免白付
function nextExpiry(subscription, now, months) {
  const periods = Number.isSafeInteger(Number(months)) && Number(months) > 0 ? Number(months) : 1
  const current = subscription ? timeValue(subscription.expiresAt) : 0
  return new Date(Math.max(Number(now) || Date.now(), current) + PERIOD_MS * periods)
}

// 会员折扣只作用在活动实售价上（不拿 150 滴原价打折）；非法折扣一律按原价
function discountedCost(base, discount) {
  const amount = Number(base)
  const rate = Number(discount)
  if (!Number.isSafeInteger(amount) || amount <= 0) return amount
  if (!(rate > 0 && rate < 1)) return amount
  return Math.max(1, Math.round(amount * rate))
}

// ============ 订阅状态 ============
function subscriptionView(subscription, planMap, now) {
  if (!subscription) return null
  const expiresAt = timeValue(subscription.expiresAt)
  const active = text(subscription.status) === 'active' && expiresAt > now
  const plan = planMap[text(subscription.levelCode)] || null
  const daysLeft = active ? Math.max(0, Math.ceil((expiresAt - now) / 86400000)) : 0
  return {
    levelCode: text(subscription.levelCode),
    levelName: plan ? plan.name : '',
    status: active ? 'active' : 'expired',
    startedAt: timeValue(subscription.startedAt),
    expiresAt,
    daysLeft,
    expiresSoon: active && daysLeft <= 3,
    autoRenew: false,
    badgeText: plan ? plan.name : '会员',
    portraitDiscount: plan ? plan.portraitDiscount : 1
  }
}

function rightsView(subscriptionViewValue, planMap) {
  const levelCode = subscriptionViewValue && subscriptionViewValue.status === 'active' ? subscriptionViewValue.levelCode : ''
  const plan = levelCode ? planMap[levelCode] : null
  return RIGHTS.map(right => {
    const item = { code: right.code, label: right.label, open: right.open }
    if (right.code === 'grant' && plan) item.detail = '每期赠 ' + plan.grantDrops + ' 滴'
    if (right.code === 'portrait') {
      item.detail = plan && plan.portraitDiscount < 1
        ? '定妆照享 ' + (Math.round(plan.portraitDiscount * 100) / 10) + ' 折'
        : '会员生效后享定妆照折扣'
    }
    if (right.code === 'backgrounds') {
      item.detail = plan
        ? '已开通：可不达 100 分更换卡面背景'
        : '开通后可不达 100 分更换卡面背景'
    }
    return item
  })
}

// 球员卡换背景用：只读有效订阅，不写库；读取失败按未开通，避免阻断制卡主流程
async function isActiveMember(db, openId) {
  const id = text(openId)
  if (!id || !db) return false
  try {
    const subscription = await subscriptionOf(db, id)
    return !!(subscription && text(subscription.status) === 'active' && timeValue(subscription.expiresAt) > Date.now())
  } catch (error) {
    console.warn('[membership] 会员状态读取失败', text(error.code) || text(error.message))
    return false
  }
}
async function subscriptionOf(db, openId) {
  return docValue(db, SUB_COLLECTION, text(openId))
}

async function statusPayload(db, openId) {
  const state = await planState(db)
  const planMap = {}
  state.plans.forEach(plan => { planMap[plan.code] = plan })
  let subscription = await subscriptionOf(db, openId)
  const now = Date.now()
  if (subscription && text(subscription.status) === 'active' && timeValue(subscription.expiresAt) <= now) {
    try {
      await db.collection(SUB_COLLECTION).doc(text(openId)).update({ data: { status: 'expired', updatedAt: new Date() } })
    } catch (error) { console.warn('[membership] 到期状态回写失败', text(error.code) || text(error.message)) }
    subscription = Object.assign({}, subscription, { status: 'expired' })
  }
  const view = subscriptionView(subscription, planMap, now)
  const sellable = state.plans.filter(plan => plan.visible)
  // 会员能否购买同时取决于：档位配置完整 + 至少一档开放 + 微信支付凭据已配置
  const paymentReady = pay.paymentConfig().ready === true
  return {
    plans: state.plans.map(planView),
    sellablePlans: sellable.map(planView),
    subscription: view,
    isFirstMonthAvailable: !(subscription && subscription.firstMonthUsed === true),
    purchaseEnabled: state.ready === true && sellable.length > 0 && paymentReady,
    reason: state.reason || (paymentReady ? '' : 'PAYMENT_NOT_CONFIGURED'),
    rights: rightsView(view, planMap),
    balance: await safeBalance(db, openId)
  }
}

async function safeBalance(db, openId) {
  try {
    const wallet = await require('./honeyWallet.cjs').readHoney(db, text(openId))
    return wallet.balance
  } catch (error) { return null }
}

// 首页会员卡摘要（一次请求给足渲染所需，避免首页再多打一次接口）
async function homeCard(db, openId) {
  try {
    // 首页不经过会员 action 入口，支付配置缓存需在这里刷新一次（失败按环境变量回退）
    await recharge.ensureSecrets(db)
    const state = await statusPayload(db, openId)
    const sellable = state.sellablePlans
    const first = sellable.length ? sellable.reduce((min, plan) => plan.firstPriceCents < min ? plan.firstPriceCents : min, sellable[0].firstPriceCents) : 0
    const renew = sellable.length ? sellable.reduce((min, plan) => plan.renewPriceCents < min ? plan.renewPriceCents : min, sellable[0].renewPriceCents) : 0
    return {
      status: 'ready',
      subscription: state.subscription,
      isFirstMonthAvailable: state.isFirstMonthAvailable,
      purchaseEnabled: state.purchaseEnabled,
      reason: state.reason,
      plans: sellable,
      lowestFirstPriceCents: first,
      lowestRenewPriceCents: renew,
      balance: state.balance
    }
  } catch (error) {
    console.warn('[membership] 会员卡读取失败', text(error.code) || text(error.message))
    return { status: 'unavailable', subscription: null, isFirstMonthAvailable: true, purchaseEnabled: false, reason: 'MEMBERSHIP_UNAVAILABLE', plans: [], lowestFirstPriceCents: 0, lowestRenewPriceCents: 0, balance: null }
  }
}

// 供定妆照扣费使用：只读，不写库；任何异常都回落原价，不能因为会员读取失败破坏主流程
async function discountFor(db, openId) {
  const id = text(openId)
  if (!id) return { active: false, discount: 1, levelCode: '', planName: '', expiresAt: 0 }
  try {
    const state = await planState(db)
    const planMap = {}
    state.plans.forEach(plan => { planMap[plan.code] = plan })
    const subscription = await subscriptionOf(db, id)
    if (!subscription || text(subscription.status) !== 'active' || timeValue(subscription.expiresAt) <= Date.now()) return { active: false, discount: 1, levelCode: '', planName: '', expiresAt: 0 }
    const plan = planMap[text(subscription.levelCode)] || null
    const discount = plan && plan.portraitDiscount < 1 ? plan.portraitDiscount : 1
    return { active: true, discount, levelCode: text(subscription.levelCode), planName: plan ? plan.name : '', expiresAt: timeValue(subscription.expiresAt) }
  } catch (error) {
    console.warn('[membership] 会员折扣读取失败', text(error.code) || text(error.message))
    return { active: false, discount: 1, levelCode: '', planName: '', expiresAt: 0 }
  }
}

// ============ 订单 ============
async function getOrder(db, outTradeNo) {
  const order = await docValue(db, ORDER_COLLECTION, text(outTradeNo))
  if (!order || !text(order.outTradeNo)) return null
  return order
}

function viewOf(order) {
  const status = text(order.status) || 'pending'
  const ledgerState = text(order.ledgerState) || 'pending'
  let statusLabel = STATUS_LABELS[status] || '状态待确认'
  if (status === 'paid' && ledgerState === 'blocked') statusLabel = '已支付·待发放'
  return {
    outTradeNo: text(order.outTradeNo),
    planCode: text(order.planCode),
    planName: text(order.planName),
    priceCents: Number(order.priceCents) || 0,
    priceYuan: (Number(order.priceCents) || 0) / 100,
    grantDrops: Number(order.grantDrops) || 0,
    priceTier: text(order.priceTier),
    months: Number(order.months) || 1,
    status,
    statusLabel,
    ledgerState,
    createdAt: timeValue(order.createdAt),
    paidAt: timeValue(order.paidAt),
    closedAt: timeValue(order.closedAt)
  }
}

async function listOrders(db, openId, limit) {
  const id = text(openId)
  if (!id) return []
  const size = Math.min(Math.max(Number(limit) || MAX_ORDERS, 1), 50)
  const rows = await readAll(db, ORDER_COLLECTION, { openId: id }, {
    fields: {
      outTradeNo: true, planCode: true, planName: true, priceCents: true, grantDrops: true,
      priceTier: true, months: true, status: true, ledgerState: true, createdAt: true, paidAt: true, closedAt: true
    },
    maxRows: 200
  })
  return rows.map(viewOf).sort((left, right) => right.createdAt - left.createdAt || right.outTradeNo.localeCompare(left.outTradeNo)).slice(0, size)
}

async function closeOrderDoc(db, outTradeNo, reason, errorCode) {
  try {
    await db.collection(ORDER_COLLECTION).doc(text(outTradeNo)).update({
      data: { status: 'closed', ledgerState: 'pending', closeReason: text(reason).slice(0, 40), closeError: text(errorCode).slice(0, 40), closedAt: new Date(), updatedAt: new Date() }
    })
  } catch (error) { console.warn('[membership] 关闭订单失败', text(error.code) || text(error.message)) }
}

// 复用仍在有效期内的待支付订单，避免用户连点生成一堆订单
async function findReusableOrder(db, openId, planCode, priceCents, priceTier) {
  const now = Date.now()
  try {
    const rows = await readAll(db, ORDER_COLLECTION, { openId: text(openId) }, {
      fields: { outTradeNo: true, openId: true, planCode: true, priceCents: true, priceTier: true, status: true, ledgerState: true, prepayId: true, createdAt: true, prepayCreatedAt: true },
      maxRows: 120
    })
    const candidates = rows.filter(row => text(row.status) === 'pending' && text(row.prepayId) &&
      text(row.planCode) === planCode && Number(row.priceCents) === priceCents && text(row.priceTier) === priceTier &&
      now - timeValue(row.createdAt) <= PENDING_REUSE_MS && now - timeValue(row.prepayCreatedAt || row.createdAt) <= PENDING_REUSE_MS)
    if (!candidates.length) return null
    candidates.sort((left, right) => timeValue(right.createdAt) - timeValue(left.createdAt))
    return candidates[0]
  } catch (error) {
    console.warn('[membership] 待支付会员订单读取失败', text(error.code) || text(error.message))
    return null
  }
}

// ============ 下单 ============
async function createOrder(db, actor, event) {
  await recharge.ensureSecrets(db)
  const config = pay.paymentConfig()
  const state = await planState(db)
  const plan = state.plans.find(item => item.code === text(event && event.planCode)) || null
  if (!plan) {
    return failResult(state.ready ? 'MEMBERSHIP_PLAN_INVALID' : (state.reason || 'MEMBERSHIP_PLAN_NOT_CONFIGURED'), state.ready ? '请选择有效的会员档位' : (PURCHASE_REASON_TEXTS[state.reason] || '会员暂未开放，请稍后重试'))
  }
  if (!plan.visible) return failResult('MEMBERSHIP_PLAN_NOT_OPEN', '该档位暂未开放')
  if (text(event && event.priceTier) === 'yearly') return failResult('MEMBERSHIP_YEARLY_NOT_OPEN', '年付暂未开放，请先按月购买')
  const platform = text(event && event.clientPlatform).toLowerCase()
  if (platform === 'ios') return failResult('IOS_VIRTUAL_PAYMENT_RESTRICTED', PURCHASE_REASON_TEXTS.IOS_VIRTUAL_PAYMENT_RESTRICTED)
  if (!config.ready) return failResult('PAYMENT_NOT_CONFIGURED', PURCHASE_REASON_TEXTS.PAYMENT_NOT_CONFIGURED)
  // 先确认账户可核对，避免付款后无法发滴
  let walletState
  try {
    walletState = await require('./honeyWallet.cjs').readHoney(db, actor.openId)
  } catch (error) {
    return failResult(text(error.code) || 'HONEY_UNAVAILABLE', text(error.message) || '蜂蜜账户暂不可用，请稍后重试')
  }
  const subscription = await subscriptionOf(db, actor.openId)
  const priceTier = priceTierFor(subscription)
  const priceCents = priceTier === 'first' ? plan.firstPriceCents : plan.renewPriceCents
  const reusable = await findReusableOrder(db, actor.openId, plan.code, priceCents, priceTier)
  if (reusable) {
    return { success: true, reused: true, order: viewOf(reusable), payParams: pay.payParams(config, reusable.prepayId), balance: walletState.balance }
  }
  const now = new Date()
  let outTradeNo = ''
  for (let attempt = 0; attempt < 4 && !outTradeNo; attempt += 1) {
    const candidate = nextOutTradeNo(actor.openId, now)
    if (!(await getOrder(db, candidate))) outTradeNo = candidate
  }
  if (!outTradeNo) return failResult('MEMBERSHIP_ORDER_INVALID', '订单创建失败，请稍后重试')
  const order = {
    outTradeNo, openId: actor.openId, userId: actor.userId, profileId: text(walletState.profileId),
    kind: 'membership', planCode: plan.code, planName: plan.name, months: 1,
    priceCents, priceTier, grantDrops: plan.grantDrops, portraitDiscount: plan.portraitDiscount,
    priceSnapshot: { planCode: plan.code, planName: plan.name, priceCents, priceTier, grantDrops: plan.grantDrops },
    status: 'pending', ledgerState: 'pending', transactionId: '', prepayId: '',
    appId: config.appId, clientPlatform: platform || 'unknown', autoRenew: false,
    createdAt: now, updatedAt: now, paidAt: null, closedAt: null, notifyCount: 0
  }
  try {
    await db.collection(ORDER_COLLECTION).doc(outTradeNo).set({ data: order })
  } catch (error) {
    console.warn('[membership] 订单写入失败', text(error.code) || text(error.message))
    return failResult(missingCollection(error) ? 'MEMBERSHIP_UNAVAILABLE' : 'MEMBERSHIP_ORDER_INVALID', '会员暂不可用，请联系客服')
  }
  let prepayId
  try {
    prepayId = await pay.createPrepay(config, order, { description: '赛小蜂足球' + plan.name, attach: 'membership' })
  } catch (error) {
    await closeOrderDoc(db, outTradeNo, 'prepay_failed', text(error.code))
    return failResult(text(error.code) || 'PAYMENT_UNAVAILABLE', text(error.message) || '微信支付暂不可用，请稍后重试')
  }
  try {
    await db.collection(ORDER_COLLECTION).doc(outTradeNo).update({ data: { prepayId, prepayCreatedAt: now, updatedAt: new Date() } })
  } catch (error) {
    console.warn('[membership] 预支付单号回写失败', text(error.code) || text(error.message))
  }
  return { success: true, reused: false, order: viewOf(Object.assign({}, order, { prepayId })), payParams: pay.payParams(config, prepayId), balance: walletState.balance }
}

// ============ 回调/查单入账（唯一发放点） ============
function verifyTrade(config, order, trade) {
  if (text(trade.mchid) !== config.mchid) fail('MEMBERSHIP_ORDER_MISMATCH', '商户号不一致，已拒绝发放')
  if (text(trade.appid) !== config.appId) fail('MEMBERSHIP_ORDER_MISMATCH', '支付应用不一致，已拒绝发放')
  if (text(trade.out_trade_no) !== text(order.outTradeNo)) fail('MEMBERSHIP_ORDER_MISMATCH', '订单号不一致，已拒绝发放')
  const amount = trade.amount || {}
  const currency = text(amount.currency || 'CNY')
  if (Number(amount.total) !== Number(order.priceCents) || currency !== 'CNY') fail('MEMBERSHIP_AMOUNT_MISMATCH', '支付金额与订单不符，已拒绝发放')
  const payer = trade.payer || {}
  if (text(order.openId) && text(payer.openid) !== text(order.openId)) fail('MEMBERSHIP_ORDER_MISMATCH', '付款账号与下单账号不一致，已拒绝发放')
  if (!text(trade.transaction_id)) fail('MEMBERSHIP_TRANSACTION_MISSING', '缺少微信支付单号，暂不能发放')
}

function sumOf(rows) {
  return rows.reduce((balance, row) => {
    const delta = Number(row.delta)
    if (!Number.isSafeInteger(delta)) fail('HONEY_LEDGER_INVALID', '蜂蜜账本有异常记录，请联系平台处理')
    return balance + delta
  }, 0)
}

async function fanProfile(db, serviceAccountOpenId) {
  const openId = text(serviceAccountOpenId)
  if (!openId) fail('HONEY_ACCOUNT_NOT_OPEN', '蜂蜜账户未开通，请先在服务号「我的」完成注册')
  const result = await db.collection(PROFILE_COLLECTION).where({ serviceAccountOpenId: openId }).limit(2).get()
  const rows = Array.isArray(result.data) ? result.data : (result.data ? [result.data] : [])
  if (rows.length > 1) fail('HONEY_ACCOUNT_CONFLICT', '蜂蜜账户存在重复记录，请联系平台核对')
  if (!rows.length) fail('HONEY_ACCOUNT_NOT_OPEN', '蜂蜜账户未开通，请先在服务号「我的」完成注册')
  return rows[0]
}

async function ledgerRows(db, serviceAccountOpenId) {
  return readAll(db, LEDGER_COLLECTION, { serviceAccountOpenId: text(serviceAccountOpenId) }, {
    fields: { delta: true, refId: true, reason: true }, maxRows: 20000
  })
}

async function markPaid(db, outTradeNo, transactionId, source, extras) {
  try {
    await db.collection(ORDER_COLLECTION).doc(text(outTradeNo)).update({
      data: Object.assign({
        status: 'paid', transactionId: text(transactionId), paidAt: new Date(), paidSource: text(source) || 'notify', updatedAt: new Date()
      }, extras || {})
    })
  } catch (error) { console.warn('[membership] 订单状态回写失败', text(error.code) || text(error.message)) }
}

// 事务内：订单置 paid+granted + 订阅新建/续期 + 写赠滴流水 + 镜像加同额。
// 以订单号 + 确定性流水 ID 幂等；镜像与账本合计不一致时抛 HONEY_RECONCILING，不写任何数据。
async function grantOrder(db, order, transactionId, source) {
  const outTradeNo = text(order.outTradeNo)
  const openId = text(order.openId)
  const grantDrops = Number(order.grantDrops)
  const levelCode = text(order.planCode)
  const months = Number.isSafeInteger(Number(order.months)) && Number(order.months) > 0 ? Number(order.months) : 1
  if (!outTradeNo) fail('MEMBERSHIP_ORDER_INVALID', '订单号缺失，请联系客服')
  if (!openId) fail('MEMBERSHIP_ORDER_INVALID', '订单缺少账户归属，请联系客服')
  if (LEVEL_CODES.indexOf(levelCode) < 0) fail('MEMBERSHIP_ORDER_INVALID', '订单档位异常，请联系客服')
  if (!Number.isSafeInteger(grantDrops) || grantDrops <= 0) fail('MEMBERSHIP_ORDER_INVALID', '订单赠滴异常，请联系客服')
  if (!text(transactionId)) fail('MEMBERSHIP_TRANSACTION_MISSING', '缺少微信支付单号，暂不能发放')
  const refId = LEDGER_REF_PREFIX + levelCode + ':' + outTradeNo
  const ledgerId = grantLedgerId(outTradeNo)

  // 账本待核对 / 并发冲突：订单保留「已支付·待发放」痕迹，等账本核对后重试，绝不按任意一侧强行发滴
  const blockCodes = ['HONEY_RECONCILING', 'HONEY_LEDGER_INVALID', 'HONEY_ACCOUNT_CONFLICT']
  async function markBlocked(code) {
    try {
      await db.collection(ORDER_COLLECTION).doc(outTradeNo).update({
        data: { status: 'paid', ledgerState: 'blocked', ledgerError: code, transactionId: text(transactionId), paidAt: new Date(), updatedAt: new Date() }
      })
    } catch (writeError) { console.warn('[membership] 待发放标记失败', text(writeError.code) || text(writeError.message)) }
  }

  let profile, rows, balance
  try {
    profile = await fanProfile(db, openId)
    rows = await ledgerRows(db, openId)
    balance = sumOf(rows)
    if (!Number.isSafeInteger(balance) || balance < 0) fail('HONEY_LEDGER_INVALID', '蜂蜜账本余额异常，请联系平台处理')
    const preMirror = Number(profile.honeyBalance)
    if (!Number.isSafeInteger(preMirror) || preMirror < 0 || preMirror !== balance) fail('HONEY_RECONCILING', '蜂蜜余额待核对，请稍后重试')
  } catch (error) {
    // 读账本阶段就不一致：同样标记「已支付·待发放」，避免用户已付款却显示待支付
    if (blockCodes.includes(text(error.code))) await markBlocked(text(error.code))
    throw error
  }

  // 账本里已经有这笔订单的赠滴：只补订单状态，绝不重复加滴、也不重复延期
  if (rows.some(row => text(row.refId) === refId || text(row._id) === ledgerId)) {
    await markPaid(db, outTradeNo, transactionId, source, { ledgerState: 'granted', ledgerId, ledgerRefId: refId })
    return { granted: false, deduped: true, balance }
  }

  const profileId = text(profile._id)
  const now = Date.now()
  let result = { granted: false, deduped: false, balance }
  try {
    await db.runTransaction(async transaction => {
      const currentOrder = await docValue(transaction, ORDER_COLLECTION, outTradeNo)
      if (!currentOrder) fail('MEMBERSHIP_ORDER_NOT_FOUND', '会员订单不存在')
      const orderStatus = text(currentOrder.status)
      if (orderStatus === 'refunded') fail('MEMBERSHIP_ORDER_STATE_INVALID', '订单已退款，不能再发放')
      if (orderStatus === 'paid' && text(currentOrder.ledgerState) === 'granted') {
        result = { granted: false, deduped: true, balance }
        return
      }
      if (Number(currentOrder.priceCents) !== Number(order.priceCents) || Number(currentOrder.grantDrops) !== grantDrops) {
        fail('MEMBERSHIP_ORDER_MISMATCH', '订单快照不一致，已拒绝发放')
      }
      const duplicate = await docValue(transaction, LEDGER_COLLECTION, ledgerId)
      const currentProfile = await docValue(transaction, PROFILE_COLLECTION, profileId)
      if (!currentProfile || text(currentProfile.serviceAccountOpenId) !== openId) fail('HONEY_ACCOUNT_CONFLICT', '蜂蜜账户已变化，请稍后重试')
      const currentMirror = Number(currentProfile.honeyBalance)
      if (!Number.isSafeInteger(currentMirror) || currentMirror < 0) fail('HONEY_RECONCILING', '蜂蜜余额待核对，请稍后重试')
      if (currentMirror !== balance) fail('HONEY_RECONCILING', '蜂蜜余额待核对，请稍后重试')

      const subscription = await docValue(transaction, SUB_COLLECTION, openId)
      const expiresAt = nextExpiry(subscription, now, months)
      const subData = {
        openId, userId: text(order.userId) || text(subscription && subscription.userId), profileId,
        levelCode, status: 'active',
        startedAt: subscription && timeValue(subscription.startedAt) ? new Date(timeValue(subscription.startedAt)) : new Date(now),
        expiresAt, firstMonthUsed: true, autoRenew: false,
        lastOrderId: outTradeNo, lastPriceTier: text(order.priceTier), updatedAt: new Date()
      }
      if (subscription) await transaction.collection(SUB_COLLECTION).doc(openId).update({ data: subData })
      else await transaction.collection(SUB_COLLECTION).doc(openId).set({ data: Object.assign({ createTime: db.serverDate() }, subData) })

      if (!duplicate) {
        await transaction.collection(PROFILE_COLLECTION).doc(profileId).update({
          data: { honeyBalance: currentMirror + grantDrops, honeyWalletUpdatedAt: db.serverDate() }
        })
        await transaction.collection(LEDGER_COLLECTION).doc(ledgerId).set({
          data: {
            serviceAccountOpenId: openId, delta: grantDrops, reason: LEDGER_REASON_GRANT, refId, attempt: 1,
            sessionId: '', outTradeNo, transactionId: text(transactionId), source: text(source) || 'notify',
            membershipLevel: levelCode, createTime: db.serverDate()
          }
        })
      }
      await transaction.collection(ORDER_COLLECTION).doc(outTradeNo).update({
        data: {
          status: 'paid', ledgerState: 'granted', ledgerId, ledgerRefId: refId,
          transactionId: text(transactionId), paidAt: new Date(), paidSource: text(source) || 'notify', updatedAt: new Date()
        }
      })
      result = duplicate
        ? { granted: false, deduped: true, balance, expiresAt: expiresAt.getTime() }
        : { granted: true, deduped: false, balance: balance + grantDrops, expiresAt: expiresAt.getTime() }
    })
  } catch (error) {
    const code = text(error.code)
    if (blockCodes.includes(code)) await markBlocked(code)
    throw error
  }
  return result
}

async function confirmOrder(db, outTradeNo, source) {
  await recharge.ensureSecrets(db)
  const config = pay.paymentConfig()
  if (!config.ready) fail('PAYMENT_NOT_CONFIGURED', '微信支付尚未开通')
  const order = await getOrder(db, outTradeNo)
  if (!order) fail('MEMBERSHIP_ORDER_NOT_FOUND', '会员订单不存在')
  const status = text(order.status)
  if (status === 'paid' && text(order.ledgerState) === 'granted') return { order, state: 'paid', granted: false }
  if (status === 'refunded') return { order, state: 'refunded', granted: false }
  const reply = await pay.queryTransaction(config, outTradeNo)
  if (reply.status === 404) return { order, state: 'unknown', granted: false }
  if (reply.status !== 200) fail('PAYMENT_UNAVAILABLE', '微信支付查单失败，请稍后重试')
  const trade = reply.body || {}
  if (text(trade.out_trade_no) && text(trade.out_trade_no) !== text(outTradeNo)) fail('MEMBERSHIP_ORDER_MISMATCH', '订单号不一致，已拒绝发放')
  const tradeState = text(trade.trade_state)
  if (tradeState === 'SUCCESS') {
    verifyTrade(config, order, trade)
    const granted = await grantOrder(db, order, trade.transaction_id, source)
    const latest = (await getOrder(db, outTradeNo)) || order
    if (source === 'notify') {
      try {
        await db.collection(ORDER_COLLECTION).doc(text(outTradeNo)).update({
          data: { notifyCount: Number(latest.notifyCount || 0) + 1, lastNotifyAt: new Date() }
        })
      } catch (error) { console.warn('[membership] 回调计数回写失败', text(error.code) || text(error.message)) }
    }
    return { order: latest, state: 'paid', granted: granted.granted, balance: granted.balance, expiresAt: granted.expiresAt }
  }
  if (['CLOSED', 'REVOKED', 'PAYERROR'].includes(tradeState)) {
    await closeOrderDoc(db, outTradeNo, tradeState)
    return { order: Object.assign({}, order, { status: 'closed' }), state: 'closed', granted: false }
  }
  return { order, state: tradeState || 'pending', granted: false }
}

// ============ 个人端入口 ============
async function orderStatus(db, openId, event) {
  const outTradeNo = text(event && event.outTradeNo)
  if (!/^MT[0-9A-Za-z_-]{4,30}$/.test(outTradeNo)) return failResult('MEMBERSHIP_ORDER_INVALID', '订单号无效')
  const order = await getOrder(db, outTradeNo)
  // 不属于当前账号的订单一律按不存在处理，不泄露他人订单
  if (!order || text(order.openId) !== openId) return failResult('MEMBERSHIP_ORDER_NOT_FOUND', '订单不存在')
  let queryError = null
  if (text(order.status) === 'pending') {
    try { await confirmOrder(db, outTradeNo, 'client') } catch (error) {
      // 同蜂蜜充值：查单失败必须把原因回给前端，而不是只写日志让用户点刷新看不出反应。
      queryError = recharge.describePaymentQueryError(error)
      console.warn('[membership] 主动查单失败', queryError.code)
    }
  }
  const state = await statusPayload(db, openId)
  const payload = {
    success: true,
    order: viewOf((await getOrder(db, outTradeNo)) || order),
    subscription: state.subscription,
    balance: state.balance
  }
  if (queryError) payload.queryError = queryError
  return payload
}

function create({ db, user, session }) {
  const openId = text(session && session.serviceAccountOpenId)
  const userId = text(user && user._id)
  return async function handle(action, event) {
    try {
      if (!openId) return failResult('SERVICE_PRIVATE_AUTH_REQUIRED', '请重新连接微信')
      await recharge.ensureSecrets(db)
      if (action === 'servicePrivateMembershipStatus') {
        const state = await statusPayload(db, openId)
        return Object.assign({ success: true }, state)
      }
      if (action === 'servicePrivateMembershipSubscribe') return await createOrder(db, { openId, userId }, event || {})
      if (action === 'servicePrivateMembershipOrderStatus') return await orderStatus(db, openId, event || {})
      if (action === 'servicePrivateMembershipOrders') {
        const state = await statusPayload(db, openId)
        return { success: true, rows: await listOrders(db, openId, MAX_ORDERS), subscription: state.subscription, purchaseEnabled: state.purchaseEnabled }
      }
      return failResult('MEMBERSHIP_ACTION_INVALID', '操作不可用，请重新打开')
    } catch (error) {
      const code = text(error.code) || 'MEMBERSHIP_FAILED'
      if (!/^(MEMBERSHIP_|HONEY_|PAYMENT_)/.test(code) && code !== 'IOS_VIRTUAL_PAYMENT_RESTRICTED') {
        console.warn('[membership] 会员操作失败', code)
      }
      return failResult(code, text(error.message) || '会员操作失败，请稍后重试')
    }
  }
}

module.exports = {
  create,
  confirmOrder,
  status: statusPayload,
  homeCard,
  listOrders,
  discountFor,
  discountedCost,
  isActiveMember,
  planState,
  CONFIRMED_PLANS,
  __internals: {
    parsePlans, priceTierFor, nextExpiry, discountedCost, nextOutTradeNo, grantLedgerId,
    subscriptionView, rightsView, verifyTrade, grantOrder, confirmOrder, createOrder, planView, PERIOD_MS
  }
}
