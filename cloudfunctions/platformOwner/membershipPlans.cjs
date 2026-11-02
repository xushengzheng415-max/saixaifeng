'use strict'
// 平台运营中心「会员管理」档位口径。
// 本文件是 cloudfunctions/webLoginApi/membership.cjs 中 CONFIRMED_PLANS / parsePlans / planView
// 的同源副本：云函数按目录独立部署，平台函数无法 require 另一个函数的文件，所以这里必须
// 保持逐条规则一致，不允许在平台侧另立一套价格判断。
// 一致性由 tools/test-membership-plan-parity.cjs 对两处实现跑同一批合法/非法用例逐项比对。
//
// 与 webLoginApi 的差异（有意保留）：
//   1. 这里只读 platform_membership_plans(_id='plans')，不存在时回退本文件 CONFIRMED_PLANS，
//      不读 process.env.MEMBERSHIP_PLANS —— 那是 webLoginApi 自己的环境配置，平台函数读不到，
//      也不应冒充成「平台已配置」。
//   2. 这里不写业务数据，只提供读取、校验与保存所需的纯函数。
const PLAN_COLLECTION = 'platform_membership_plans'
const PLAN_DOC_ID = 'plans'
const LEVEL_CODES = ['basic', 'plus', 'pro', 'family']
const MAX_PRICE_CENTS = 1000000
const HISTORY_LIMIT = 20

// 2026-10-27 用户确认的四档（家庭档本期不开放售卖，仅保留定义）。
const CONFIRMED_PLANS = [
  { code: 'basic', name: '基础会员', firstPriceCents: 990, renewPriceCents: 1990, yearlyPriceCents: 19900, grantDrops: 200, portraitDiscount: 0.95, visible: true, order: 1 },
  { code: 'plus', name: '进阶会员', firstPriceCents: 1990, renewPriceCents: 2990, yearlyPriceCents: 29900, grantDrops: 500, portraitDiscount: 0.90, visible: true, order: 2 },
  { code: 'pro', name: '专业会员', firstPriceCents: 3990, renewPriceCents: 4990, yearlyPriceCents: 49900, grantDrops: 1000, portraitDiscount: 0.80, visible: true, order: 3 },
  { code: 'family', name: '家庭会员', firstPriceCents: 5990, renewPriceCents: 6990, yearlyPriceCents: 69900, grantDrops: 2000, portraitDiscount: 0.80, visible: false, order: 4 }
]

const text = value => String(value == null ? '' : value).trim()

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

async function planDoc(db) {
  try {
    const reply = await db.collection(PLAN_COLLECTION).doc(PLAN_DOC_ID).get()
    const data = Array.isArray(reply && reply.data) ? reply.data[0] : (reply && reply.data)
    return data && Object.keys(data).length ? data : null
  } catch (error) {
    const message = String((error && (error.message || error)) || '')
    if (/not exist|not found|不存在|DATABASE_COLLECTION_NOT_EXIST|document.*not/i.test(message)) return null
    throw new Error('读取会员档位失败：' + message)
  }
}

// 库内已配置就用库内（即使配置非法也不回退，避免两套价格同时生效）
async function readPlanState(db) {
  const doc = await planDoc(db)
  if (doc) {
    const parsed = parsePlans(doc.plans || doc)
    return {
      source: 'db',
      ready: parsed.ready,
      reason: parsed.reason,
      plans: parsed.plans,
      version: Number.isSafeInteger(Number(doc.version)) ? Number(doc.version) : 0,
      updatedAt: doc.updatedAt || null,
      updatedByName: text(doc.updatedByName),
      history: Array.isArray(doc.history) ? doc.history : []
    }
  }
  const parsed = parsePlans(CONFIRMED_PLANS)
  return { source: 'default', ready: parsed.ready, reason: parsed.reason, plans: parsed.plans, version: 0, updatedAt: null, updatedByName: '', history: [] }
}

function defaults() {
  return { ready: true, plans: parsePlans(CONFIRMED_PLANS).plans, reason: '' }
}

// 保存前的提示（不阻断）：真正会影响用户端的配置变化必须让操作人知道
function buildWarnings(nextPlans, prevPlans) {
  const warnings = []
  const prevMap = {}
  ;(prevPlans || []).forEach(plan => { prevMap[plan.code] = plan })
  const family = nextPlans.find(plan => plan.code === 'family')
  if (family && family.visible) warnings.push('家庭会员本期未确认开放售卖，保存后用户端会展示并可购买')
  const sellable = nextPlans.filter(plan => plan.visible)
  if (!sellable.length) warnings.push('没有任何档位开放售卖，用户端将无法购买会员')
  nextPlans.forEach(plan => {
    const prev = prevMap[plan.code]
    if (!prev) return
    const changes = []
    if (prev.firstPriceCents !== plan.firstPriceCents) changes.push('首月价 ' + (prev.firstPriceCents / 100) + ' → ' + (plan.firstPriceCents / 100) + ' 元')
    if (prev.renewPriceCents !== plan.renewPriceCents) changes.push('续费价 ' + (prev.renewPriceCents / 100) + ' → ' + (plan.renewPriceCents / 100) + ' 元')
    if (prev.yearlyPriceCents !== plan.yearlyPriceCents) changes.push('年付价 ' + (prev.yearlyPriceCents / 100) + ' → ' + (plan.yearlyPriceCents / 100) + ' 元')
    if (prev.grantDrops !== plan.grantDrops) changes.push('赠滴 ' + prev.grantDrops + ' → ' + plan.grantDrops)
    if (prev.portraitDiscount !== plan.portraitDiscount) changes.push('定妆照折扣 ' + prev.portraitDiscount + ' → ' + plan.portraitDiscount)
    if (prev.visible !== plan.visible) changes.push(plan.visible ? '改为开放售卖' : '改为停止售卖')
    if (prev.name !== plan.name) changes.push('名称 ' + prev.name + ' → ' + plan.name)
    if (changes.length) warnings.push(plan.name + '：' + changes.join('，'))
  })
  return warnings
}

function historyEntry(version, operatorName, operatorId, warnings) {
  return {
    version,
    at: new Date(),
    operatorName: text(operatorName),
    operatorId: text(operatorId),
    summary: warnings.join('；').slice(0, 300)
  }
}

module.exports = {
  PLAN_COLLECTION,
  PLAN_DOC_ID,
  LEVEL_CODES,
  MAX_PRICE_CENTS,
  HISTORY_LIMIT,
  CONFIRMED_PLANS,
  parsePlans,
  planView,
  readPlanState,
  defaults,
  buildWarnings,
  historyEntry,
  text
}
