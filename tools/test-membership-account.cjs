'use strict'
// 阶段 1 自测：会员主键统一（users._id 主键 + 历史 officialOpenId 兼容）。
// 仅使用本地 CloudBase 桩，不连接生产。
const assert = require('assert')
const path = require('path')
const { createDb } = require('./test-support/cloudbase-mock.cjs')

const root = path.resolve(__dirname, '..', 'cloudfunctions', 'webLoginApi')
const account = require(path.join(root, 'membershipAccount.cjs'))
const membership = require(path.join(root, 'membership.cjs'))
const migration = require('./migrate-membership-canonical-key.cjs')

const DAY = 86400000
const NOW = Date.now()
const future = new Date(NOW + 20 * DAY)
const past = new Date(NOW - 2 * DAY)

function seed() {
  return {
    users: [
      { _id: 'u1', phone: '13800000001', phoneVerified: true },
      { _id: 'u2', phone: '13800000002', phoneVerified: true }
    ],
    service_account_bindings: [
      { _id: 'b1', sport: 'football', officialOpenId: 'open-u2', userId: 'u2', active: true, status: 'active' },
      { _id: 'b2', sport: 'football', officialOpenId: 'open-conflict', userId: 'u1', active: true, status: 'active' },
      { _id: 'b3', sport: 'football', officialOpenId: 'open-conflict', userId: 'u2', active: true, status: 'active' }
    ],
    member_subscriptions: [
      {
        _id: 'open-u1', userId: 'u1', openId: 'open-u1', officialOpenId: 'open-u1',
        levelCode: 'plus', status: 'active', startedAt: new Date(NOW - 10 * DAY), expiresAt: future,
        firstMonthUsed: true
      }
    ]
  }
}

function doc(data, collection, id) {
  return (data[collection] || []).find(row => String(row._id) === String(id)) || null
}

async function testIdentity() {
  assert.strictEqual(account.canonicalSubscriptionId('u1'), 'u:u1')
  assert.strictEqual(account.canonicalSubscriptionId(''), '')
  assert.deepStrictEqual(account.identityOf('open-1'), { userId: '', openId: 'open-1', unionId: '' })
  assert.deepStrictEqual(
    account.identityOf({ user: { _id: 'u1' }, session: { serviceAccountOpenId: 'open-1', unionId: 'un-1' } }),
    { userId: 'u1', openId: 'open-1', unionId: 'un-1' }
  )
}

async function testResolveIdentity() {
  const { db } = createDb(seed())
  const explicit = await account.resolveIdentity(db, { userId: 'u1', openId: 'open-u1' })
  assert.strictEqual(explicit.userId, 'u1')
  assert.strictEqual(explicit.canonicalId, 'u:u1')

  const viaBinding = await account.resolveIdentity(db, { openId: 'open-u2' })
  assert.strictEqual(viaBinding.userId, 'u2')
  assert.strictEqual(viaBinding.conflict, false)

  const missing = await account.resolveIdentity(db, { openId: 'open-missing' })
  assert.strictEqual(missing.userId, '')
  assert.strictEqual(missing.canonicalId, '')

  const conflict = await account.resolveIdentity(db, { openId: 'open-conflict' })
  assert.strictEqual(conflict.userId, '')
  assert.strictEqual(conflict.conflict, true)
}

async function testSubscriptionRead() {
  const { db, data } = createDb(seed())

  const legacy = await account.subscriptionMeta(db, { userId: 'u1', openId: 'open-u1' })
  assert.strictEqual(legacy.kind, 'legacy')
  assert.strictEqual(legacy.key, 'open-u1')
  assert.strictEqual(legacy.subscription.levelCode, 'plus')

  data.member_subscriptions.push({
    _id: 'u:u1', userId: 'u1', openId: 'open-u1', officialOpenId: 'open-u1',
    levelCode: 'gold', status: 'active', startedAt: new Date(NOW - 3 * DAY), expiresAt: future, firstMonthUsed: true
  })
  const canonical = await account.subscriptionMeta(db, { userId: 'u1', openId: 'open-u1' })
  assert.strictEqual(canonical.kind, 'canonical')
  assert.strictEqual(canonical.key, 'u:u1')
  assert.strictEqual(canonical.subscription.levelCode, 'gold')

  // 跨账号：历史文档属于 u9，当前账号 u1 不得读到（使用独立库，避免自己的 canonical 命中）。
  const other = createDb(seed())
  other.data.member_subscriptions.push({
    _id: 'open-other', userId: 'u9', openId: 'open-other', levelCode: 'pro', status: 'active', expiresAt: future
  })
  const cross = await account.subscriptionMeta(other.db, { userId: 'u1', openId: 'open-other' })
  assert.strictEqual(cross.subscription, null)
  assert.strictEqual(cross.kind, 'none')
}

async function testActiveAndExpiry() {
  assert.strictEqual(account.isActiveSubscription({ status: 'active', expiresAt: future }), true)
  assert.strictEqual(account.isActiveSubscription({ status: 'active', expiresAt: past }), false)
  assert.strictEqual(account.isActiveSubscription({ status: 'expired', expiresAt: future }), false)
  assert.strictEqual(account.isActiveSubscription({ status: 'active', expiresAt: future.toISOString() }), true)

  const { db, data } = createDb(seed())
  assert.strictEqual(await account.isActiveMember(db, 'open-u1'), true, '旧签名 openId 字符串必须兼容')
  assert.strictEqual(await account.isActiveMember(db, { userId: 'u1', openId: 'open-u1' }), true)

  data.member_subscriptions[0].expiresAt = past
  assert.strictEqual(await account.isActiveMember(db, { userId: 'u1', openId: 'open-u1' }), false)

  const meta = await account.subscriptionMeta(db, { userId: 'u1', openId: 'open-u1' })
  const expired = await account.expireIfNeeded(db, meta)
  assert.strictEqual(expired.status, 'expired')
  assert.strictEqual(doc(data, 'member_subscriptions', 'open-u1').status, 'expired', '到期后应惰性回写 expired')
}

async function testReadFailure() {
  const { db } = createDb(seed(), { failCollections: { member_subscriptions: '数据库读取失败' } })
  const meta = await account.subscriptionMeta(db, { userId: 'u1', openId: 'open-u1' })
  assert.strictEqual(meta.error, true)
  assert.strictEqual(meta.subscription, null)
  assert.strictEqual(await account.isActiveMember(db, { userId: 'u1', openId: 'open-u1' }), false, '读取失败按非会员处理')
}

async function testWriteSubscription() {
  const { db, data } = createDb(seed())
  const identity = { userId: 'u1', openId: 'open-u1', canonicalId: 'u:u1' }
  const written = await account.writeSubscription(db, identity, {
    levelCode: 'gold', status: 'active', startedAt: new Date(NOW - 5 * DAY), expiresAt: new Date(NOW + 35 * DAY),
    firstMonthUsed: true, lastOrderId: 'MT-TEST'
  })
  assert.strictEqual(written.key, 'u:u1')
  assert.strictEqual(written.merged, true)
  const canonical = doc(data, 'member_subscriptions', 'u:u1')
  assert.ok(canonical, '应写入 users._id 主键文档')
  assert.strictEqual(canonical.userId, 'u1')
  assert.strictEqual(canonical.officialOpenId, 'open-u1')
  assert.strictEqual(canonical.levelCode, 'gold')
  const legacy = doc(data, 'member_subscriptions', 'open-u1')
  assert.strictEqual(legacy.levelCode, 'gold', '历史文档应同步镜像，旧端不出现到期')
  assert.strictEqual(legacy.autoRenew, false)
  assert.strictEqual(legacy._id, 'open-u1', '历史文档 _id 不得改写')

  // 无 users._id 的历史调用仍按 openId 落库，不能丢会员。
  const legacyOnly = await account.writeSubscription(db,
    { openId: 'open-legacy-only' }, { levelCode: 'basic', status: 'active', expiresAt: future })
  assert.strictEqual(legacyOnly.key, 'open-legacy-only')
  assert.ok(doc(data, 'member_subscriptions', 'open-legacy-only'))
}

async function testStatusIntegration() {
  const { db, data } = createDb(seed())
  const active = await membership.status(db, { userId: 'u1', openId: 'open-u1' })
  assert.strictEqual(active.subscription.status, 'active')
  assert.strictEqual(active.subscription.levelCode, 'plus')
  assert.strictEqual(active.purchaseEnabled, false, '测试环境无支付凭据，不应开放购买')
  const backgrounds = active.rights.find(item => item.code === 'backgrounds')
  assert.ok(backgrounds && backgrounds.open, '会员背景权益必须存在')

  data.member_subscriptions[0].expiresAt = past
  const expired = await membership.status(db, { userId: 'u1', openId: 'open-u1' })
  assert.strictEqual(expired.subscription.status, 'expired')
  assert.strictEqual(expired.subscription.daysLeft, 0)
  assert.strictEqual(doc(data, 'member_subscriptions', 'open-u1').status, 'expired')
}

async function testMigration() {
  const legacySeed = {
    users: [{ _id: 'u1' }, { _id: 'u2' }],
    service_account_bindings: [
      { _id: 'b1', sport: 'football', officialOpenId: 'open-m1', userId: 'u1', active: true, status: 'active' },
      { _id: 'b2', sport: 'football', officialOpenId: 'open-m2', userId: 'u2', active: true, status: 'active' }
    ],
    member_subscriptions: [
      { _id: 'open-m1', openId: 'open-m1', levelCode: 'plus', status: 'active', expiresAt: future },
      { _id: 'open-m2', userId: 'u2', openId: 'open-m2', levelCode: 'gold', status: 'active', expiresAt: future },
      { _id: 'open-orphan', openId: 'open-orphan', levelCode: 'basic', status: 'active', expiresAt: future },
      { _id: 'u:u2', userId: 'u2', openId: 'open-m2', levelCode: 'gold', status: 'active', expiresAt: future },
      { _id: 'u:runtime', userId: 'runtime', openId: 'open-runtime', levelCode: 'basic', status: 'active', expiresAt: future }
    ]
  }
  const { db, data } = createDb(legacySeed)

  const items = await migration.plan(db)
  const byId = id => items.find(item => item.legacyId === id)
  assert.strictEqual(byId('open-m1').action, 'copy')
  assert.strictEqual(byId('open-m1').canonicalId, 'u:u1')
  assert.strictEqual(byId('open-m2').action, 'skip-existing')
  assert.strictEqual(byId('open-orphan').action, 'skip-no-user')
  assert.strictEqual(data.member_subscriptions.length, 5, 'dry-run 不得写库')

  const applied = await migration.apply(db)
  assert.deepStrictEqual(applied.applied.map(row => row.canonicalId), ['u:u1'])
  const canonical = doc(data, 'member_subscriptions', 'u:u1')
  assert.ok(canonical)
  assert.strictEqual(canonical.migration, migration.MARK)
  assert.strictEqual(canonical.migratedFrom, 'open-m1')
  assert.strictEqual(canonical.userId, 'u1')
  assert.strictEqual(doc(data, 'member_subscriptions', 'open-m1').migration, undefined, '回填不得改写历史文档')

  const rolled = await migration.rollback(db)
  assert.strictEqual(rolled.removed.length, 1)
  assert.strictEqual(rolled.removed[0].canonicalId, 'u:u1')
  assert.ok(doc(data, 'member_subscriptions', 'open-m1'), '回滚不得删除历史文档')
  assert.ok(doc(data, 'member_subscriptions', 'u:runtime'), '回滚不得删除运行时写入的主键文档')
}

async function main() {
  await testIdentity()
  await testResolveIdentity()
  await testSubscriptionRead()
  await testActiveAndExpiry()
  await testReadFailure()
  await testWriteSubscription()
  await testStatusIntegration()
  await testMigration()
  console.log('PASS test-membership-account: 会员主键统一、历史兼容、到期、读取失败、回填与回滚')
}

main().catch(error => { console.error(error); process.exit(1) })
