'use strict'
// 会员主键统一（阶段 1）：以 users._id 为唯一主键，历史 member_subscriptions（_id=服务号 officialOpenId）
// 保留为兼容别名。UnionID 只做渠道关联，不作为会员归属主键。
// 规则：
//   1. 读取顺序：users._id 对应文档（_id='u:'+userId） → 历史 officialOpenId 文档；
//   2. 写入：新数据一律写主键文档，并冗余 userId / officialOpenId；若历史文档存在，同步状态字段，
//      避免旧版本仍按 openId 读取时出现「H5 已续费、旧端口仍显示到期」；
//   3. 任何读取/解析异常只影响会员判断，不阻断制卡、H5 浏览等主流程；
//   4. 回填脚本只复制、不改写历史文档，回滚只删除带迁移标记的主键文档。
const SUB_COLLECTION = 'member_subscriptions'
const BINDING_COLLECTION = 'service_account_bindings'
const USER_COLLECTION = 'users'
const CANONICAL_PREFIX = 'u:'
const BINDING_SPORT = 'football'

const text = value => String(value == null ? '' : value).trim()

function timeValue(value) {
  if (!value) return 0
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : 0 }
  const nested = value.$date || value._date || value.date
  return nested ? timeValue(nested) : 0
}

function canonicalSubscriptionId(userId) {
  const id = text(userId)
  return id ? CANONICAL_PREFIX + id : ''
}

// 同时接受字符串（历史 openId）与对象（{userId, openId, user, session}），保持旧调用方零改动。
function identityOf(input) {
  if (typeof input === 'string') return { userId: '', openId: text(input), unionId: '' }
  const source = input || {}
  const user = source.user || {}
  const session = source.session || {}
  return {
    userId: text(source.userId) || text(source.user && source.user._id) || text(user._id),
    openId: text(source.openId) || text(source.officialOpenId) ||
      text(source.serviceAccountOpenId) || text(session.serviceAccountOpenId) || text(session.officialOpenId),
    unionId: text(source.unionId) || text(session.unionId) || text(session.unionid)
  }
}

async function docValue(dbOrTx, collectionName, id) {
  if (!text(id)) return null
  try {
    const reply = await dbOrTx.collection(collectionName).doc(text(id)).get()
    const data = Array.isArray(reply && reply.data) ? reply.data[0] : (reply && reply.data)
    return data && Object.keys(data).length ? data : null
  } catch (error) {
    if (/document.*(?:not exist|not found)/i.test(String(error && error.message || ''))) return null
    const code = text(error && (error.errCode != null ? error.errCode : error.code))
    if (/DATABASE_COLLECTION_NOT_EXIST|COLLECTION_NOT_EXIST|COLLECTION_NOT_FOUND/i.test(code)) return null
    throw error
  }
}

// officialOpenId → users._id：以 service_account_bindings 为权威来源；兼容部分历史 users 冗余字段。
async function userIdByOpenId(db, openId) {
  const id = text(openId)
  if (!id || !db) return { userId: '', conflict: false }
  const seen = new Set()
  try {
    const result = await db.collection(BINDING_COLLECTION)
      .where({ sport: BINDING_SPORT, officialOpenId: id })
      .limit(20).get()
    const rows = (result && result.data) || []
    for (const row of rows) {
      if (!row || row.active === false || row.disabled === true) continue
      if (['revoked', 'replaced', 'deleted', 'unbound', 'disabled'].includes(text(row.status))) continue
      const userId = text(row.userId)
      if (userId) seen.add(userId)
    }
  } catch (error) {
    const code = text(error && (error.errCode != null ? error.errCode : error.code))
    if (!/DATABASE_COLLECTION_NOT_EXIST|COLLECTION_NOT_EXIST|COLLECTION_NOT_FOUND/i.test(code)) throw error
  }
  // 兼容历史账号文档中的服务号 openId 字段（仅用于解析，不作为主键写入）。
  if (!seen.size) {
    for (const field of ['serviceAccountOpenId', 'officialOpenId', 'serviceOfficialOpenId']) {
      try {
        const result = await db.collection(USER_COLLECTION).where({ [field]: id }).limit(3).get()
        for (const row of (result && result.data) || []) if (text(row && row._id)) seen.add(text(row._id))
        if (seen.size > 1) break
      } catch (error) {
        const code = text(error && (error.errCode != null ? error.errCode : error.code))
        if (!/DATABASE_COLLECTION_NOT_EXIST|COLLECTION_NOT_EXIST|COLLECTION_NOT_FOUND/i.test(code)) throw error
      }
    }
  }
  return { userId: seen.size === 1 ? [...seen][0] : '', conflict: seen.size > 1 }
}

async function resolveIdentity(db, input) {
  const base = identityOf(input)
  let userId = base.userId
  let conflict = false
  if (!userId && base.openId) {
    try {
      const found = await userIdByOpenId(db, base.openId)
      userId = found.userId
      conflict = found.conflict
    } catch (error) {
      // 解析失败按「无主账号」处理，调用方随后只读兼容 openId 文档。
      conflict = false
    }
  }
  return {
    userId,
    openId: base.openId,
    unionId: base.unionId,
    canonicalId: canonicalSubscriptionId(userId),
    conflict
  }
}

function belongsTo(doc, identity, kind) {
  if (!doc) return false
  if (kind === 'canonical') {
    const owner = text(doc.userId)
    return owner ? owner === identity.userId : text(doc._id) === identity.canonicalId
  }
  const owner = text(doc.userId)
  if (owner && identity.userId && owner !== identity.userId) return false
  const stored = text(doc.openId) || text(doc.officialOpenId)
  return stored ? stored === identity.openId : text(doc._id) === identity.openId
}

// 只读：返回当前有效文档、命中的键与来源（canonical/legacy），不做到期回写。
async function subscriptionMeta(db, input) {
  const identity = await resolveIdentity(db, input)
  const attempts = []
  if (identity.canonicalId) attempts.push({ key: identity.canonicalId, kind: 'canonical' })
  if (identity.openId) attempts.push({ key: identity.openId, kind: 'legacy' })
  for (const attempt of attempts) {
    let doc = null
    try { doc = await docValue(db, SUB_COLLECTION, attempt.key) } catch (error) {
      console.warn('[membershipAccount] 会员读取失败', text(error && (error.code || error.message)))
      return { identity, subscription: null, key: '', kind: 'none', error: true }
    }
    if (doc && belongsTo(Object.assign({ _id: attempt.key }, doc), identity, attempt.kind)) {
      return { identity, subscription: doc, key: attempt.key, kind: attempt.kind, error: false }
    }
  }
  return { identity, subscription: null, key: '', kind: 'none', error: false }
}

function isActiveSubscription(subscription, now) {
  return Boolean(subscription) &&
    text(subscription.status) === 'active' &&
    timeValue(subscription.expiresAt) > (Number(now) || Date.now())
}

// 兼容旧签名 isActiveMember(db, openId)；新调用方可传 {userId, openId}。
// 会员读取失败一律按非会员，避免阻断卡面/卡库主流程。
async function isActiveMember(db, input) {
  if (!db) return false
  try {
    const meta = await subscriptionMeta(db, input)
    return isActiveSubscription(meta.subscription, Date.now())
  } catch (error) {
    console.warn('[membershipAccount] 会员状态读取失败', text(error && (error.code || error.message)))
    return false
  }
}

// 到期惰性置 expired：只在命中文档上回写，失败只记日志。
async function expireIfNeeded(db, meta) {
  const subscription = meta && meta.subscription
  if (!subscription || text(subscription.status) !== 'active') return subscription
  if (timeValue(subscription.expiresAt) > Date.now()) return subscription
  try {
    await db.collection(SUB_COLLECTION).doc(meta.key).update({
      data: { status: 'expired', updatedAt: new Date() }
    })
  } catch (error) {
    console.warn('[membershipAccount] 到期状态回写失败', text(error && (error.code || error.message)))
  }
  return Object.assign({}, subscription, { status: 'expired' })
}

/**
 * 写入订阅（事务内也适用）：主键文档为事实来源，历史 openId 文档存在时同步状态。
 * 返回 { key, merged, legacyKey }，调用方据此记录来源。
 */
async function writeSubscription(dbOrTx, identity, data) {
  const resolved = identity && identity.canonicalId ? identity : await resolveIdentity(
    typeof dbOrTx.collection === 'function' ? dbOrTx : null, identity)
  const payload = Object.assign({}, data, {
    userId: text(data && data.userId) || resolved.userId,
    openId: text(data && data.openId) || resolved.openId,
    officialOpenId: text(data && data.officialOpenId) || resolved.openId,
    updatedAt: data && data.updatedAt ? data.updatedAt : new Date()
  })
  const canonicalKey = resolved.canonicalId || (resolved.openId ? '' : '')
  if (!canonicalKey) {
    // 没有 users._id 的历史调用仍按 openId 落库，保证不丢会员。
    if (!resolved.openId) throw Object.assign(new Error('会员账号标识缺失'), { code: 'MEMBERSHIP_ACCOUNT_INVALID' })
    const existing = await docValue(dbOrTx, SUB_COLLECTION, resolved.openId)
    if (existing) await dbOrTx.collection(SUB_COLLECTION).doc(resolved.openId).update({ data: payload })
    else await dbOrTx.collection(SUB_COLLECTION).doc(resolved.openId).set({ data: payload })
    return { key: resolved.openId, merged: false, legacyKey: resolved.openId }
  }
  const existingCanonical = await docValue(dbOrTx, SUB_COLLECTION, canonicalKey)
  if (existingCanonical) await dbOrTx.collection(SUB_COLLECTION).doc(canonicalKey).update({ data: payload })
  else await dbOrTx.collection(SUB_COLLECTION).doc(canonicalKey).set({ data: payload })

  let legacyKey = ''
  if (resolved.openId && resolved.openId !== canonicalKey) {
    const legacy = await docValue(dbOrTx, SUB_COLLECTION, resolved.openId)
    if (legacy && belongsTo(Object.assign({ _id: resolved.openId }, legacy), resolved, 'legacy')) {
      const mirror = {
        userId: payload.userId, openId: resolved.openId, officialOpenId: resolved.openId,
        levelCode: payload.levelCode, status: payload.status, startedAt: payload.startedAt,
        expiresAt: payload.expiresAt, firstMonthUsed: payload.firstMonthUsed,
        autoRenew: false, lastOrderId: payload.lastOrderId, lastPriceTier: payload.lastPriceTier,
        updatedAt: payload.updatedAt
      }
      try {
        await dbOrTx.collection(SUB_COLLECTION).doc(resolved.openId).update({ data: mirror })
        legacyKey = resolved.openId
      } catch (error) {
        console.warn('[membershipAccount] 历史会员文档同步失败', text(error && (error.code || error.message)))
      }
    }
  }
  return { key: canonicalKey, merged: Boolean(legacyKey), legacyKey }
}

module.exports = {
  SUB_COLLECTION,
  CANONICAL_PREFIX,
  canonicalSubscriptionId,
  identityOf,
  resolveIdentity,
  userIdByOpenId,
  subscriptionMeta,
  isActiveSubscription,
  isActiveMember,
  expireIfNeeded,
  writeSubscription,
  timeValue,
  __internals: { docValue, belongsTo }
}
