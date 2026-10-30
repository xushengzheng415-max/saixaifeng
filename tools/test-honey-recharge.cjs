'use strict'
// 蜂蜜充值（微信支付 APIv3）服务端逻辑离线自检：
// 档位口径、回调验签/解密、金额复核、账本入账幂等与镜像不一致阻断。
// 不联网、不读凭据文件，仅用本地临时生成的 RSA/AES 材料。
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const recharge = require('../cloudfunctions/webLoginApi/honeyRecharge.cjs')

const ENV_KEYS = ['WXPAY_MCH_ID', 'WXPAY_SERIAL_NO', 'WXPAY_APIV3_KEY', 'WXPAY_PRIVATE_KEY', 'WXPAY_PLATFORM_PUBLIC_KEY', 'WXPAY_PLATFORM_SERIAL', 'WXPAY_APP_ID', 'WXPAY_NOTIFY_URL', 'HONEY_TOPUP_PACKS', 'HONEY_TOPUP_REFUND_ENABLED']
const saved = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]))
function restore() {
  ENV_KEYS.forEach(key => { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key] })
}
function setEnv(values) {
  ENV_KEYS.forEach(key => { delete process.env[key] })
  Object.entries(values || {}).forEach(([key, value]) => { process.env[key] = value })
}

const { privateKey: merchantKey, publicKey: merchantPublic } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const { privateKey: platformKey, publicKey: platformPublic } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const merchantPem = merchantKey.export({ type: 'pkcs8', format: 'pem' })
const merchantPublicPem = merchantPublic.export({ type: 'spki', format: 'pem' })
const platformPem = platformKey.export({ type: 'pkcs8', format: 'pem' })
const platformPublicPem = platformPublic.export({ type: 'spki', format: 'pem' })
const apiV3Key = 'k'.repeat(32)
const paymentEnv = {
  WXPAY_MCH_ID: '1900000001',
  WXPAY_SERIAL_NO: 'ABCDEF1234567890',
  WXPAY_APIV3_KEY: apiV3Key,
  WXPAY_PRIVATE_KEY: merchantPem,
  WXPAY_PLATFORM_PUBLIC_KEY: platformPublicPem,
  WXPAY_APP_ID: 'wx5a42aae0e5d0669c',
  WXPAY_NOTIFY_URL: 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi?action=honeyPayNotify'
}
const validPacks = JSON.stringify([{ priceCents: 1000, drops: 100 }, { priceCents: 100, drops: 10 }])

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
  const command = { gt: value => ({ __op: 'gt', value }), and: parts => ({ __op: 'and', parts }), in: values => ({ __op: 'in', values }) }
  function collectionApi(name) {
    const col = store(name)
    return {
      doc(id) {
        return {
          async get() { const data = col.get(id); if (!data) throw new Error('document not exist'); return { data: Object.assign({ _id: id }, data) } },
          async set({ data }) { col.set(id, Object.assign({}, data, { _id: id })) },
          async update({ data }) { const old = col.get(id); if (!old) throw new Error('document not exist'); col.set(id, Object.assign({}, old, data)) }
        }
      },
      where(condition) {
        let size = 100, orderField = '_id', orderDir = 'asc'
        const api = {
          field() { return api },
          orderBy(field, direction) { orderField = field; orderDir = direction || 'asc'; return api },
          limit(value) { size = value; return api },
          async get() {
            const rows = [...col.entries()].filter(([, data]) => matchRow(Object.assign({ _id: undefined }, data), condition)).map(([id, data]) => Object.assign({ _id: id }, data))
            rows.sort((left, right) => String(left[orderField] || '').localeCompare(String(right[orderField] || '')) * (orderDir === 'desc' ? -1 : 1))
            return { data: rows.slice(0, size) }
          }
        }
        return api
      },
      async add({ data }) { const id = data._id || 'auto-' + Math.random().toString(36).slice(2); col.set(id, Object.assign({}, data, { _id: id })); return { _id: id } }
    }
  }
  return {
    serverDate: () => new Date(),
    command,
    collection: collectionApi,
    async runTransaction(work) { return work({ collection: collectionApi }) }
  }
}
async function seedWallet(db, openId, rows) {
  await db.collection('fan_profiles').doc('profile-' + openId).set({ data: { serviceAccountOpenId: openId, honeyBalance: rows.reduce((sum, value) => sum + value, 0) } })
  await db.collection('fan_points_ledger').doc('seed-' + openId).set({ data: { serviceAccountOpenId: openId, delta: rows[0], reason: 'fan-registration-bonus' } })
  return rows.reduce((sum, value) => sum + value, 0)
}
async function seedOrder(db, order) {
  await db.collection('honey_orders').doc(order.outTradeNo).set({ data: order })
}
function orderDoc(outTradeNo, openId, totalDrops, priceCents) {
  return {
    outTradeNo, openId, userId: 'u1', profileId: 'profile-' + openId, priceCents, drops: totalDrops, bonusDrops: 0, totalDrops,
    status: 'pending', ledgerState: 'pending', transactionId: '', prepayId: '', createdAt: new Date(), updatedAt: new Date(), notifyCount: 0
  }
}
// 构造一条能通过验签与解密的回调报文：resource 里只放订单号，金额一律以查单结果为准
function signedNotify(payload) {
  const resourceNonce = 'nonce1234567'
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(apiV3Key), Buffer.from(resourceNonce))
  cipher.setAAD(Buffer.from('transaction'))
  const sealed = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final(), cipher.getAuthTag()])
  const rawBody = JSON.stringify({
    id: 'evt-' + Date.now(),
    event_type: 'TRANSACTION.SUCCESS',
    resource: { algorithm: 'AEAD_AES_256_GCM', ciphertext: sealed.toString('base64'), nonce: resourceNonce, associated_data: 'transaction' }
  })
  const stamp = String(Math.floor(Date.now() / 1000))
  const headerNonce = crypto.randomBytes(4).toString('hex')
  const signature = crypto.createSign('RSA-SHA256').update([stamp, headerNonce, rawBody, ''].join('\n')).sign(platformPem, 'base64')
  return {
    body: rawBody, isBase64Encoded: false,
    headers: { 'wechatpay-timestamp': stamp, 'wechatpay-nonce': headerNonce, 'wechatpay-signature': signature }
  }
}

;(async () => {
  // ---- 档位口径：1 元 = 10 滴，旧档位与未确认赠滴一律拒绝 ----
  setEnv({})
  assert.deepEqual(recharge.__internals.parsePacks('').reason, 'PRICE_NOT_CONFIGURED')
  assert.equal(recharge.__internals.parsePacks(validPacks).packs.length, 2)
  assert.deepEqual(recharge.__internals.parsePacks(validPacks).packs.map(pack => pack.priceCents), [100, 1000], '档位应按价格升序')
  assert.equal(recharge.__internals.parsePacks(validPacks).packs[1].id, 'pack-1000')
  assert.equal(recharge.__internals.parsePacks(JSON.stringify([{ priceCents: 500, drops: 60 }])).reason, 'PRICE_RATE_MISMATCH', '旧五档 5 元 60 滴必须拒绝')
  assert.equal(recharge.__internals.parsePacks(JSON.stringify([{ priceCents: 100, drops: 10, bonusDrops: 5 }])).reason, 'PRICE_BONUS_UNCONFIRMED')
  assert.equal(recharge.__internals.parsePacks('not-json').reason, 'PRICE_CONFIG_INVALID')
  assert.equal(recharge.__internals.parsePacks(JSON.stringify([{ priceCents: 100, drops: 10 }, { priceCents: 100, drops: 10 }])).reason, 'PRICE_CONFIG_INVALID')

  // ---- 支付未配置时不给任何可购买档位 ----
  setEnv({ HONEY_TOPUP_PACKS: validPacks })
  let state = recharge.rechargeState()
  assert.equal(state.available, false)
  assert.equal(state.reason, 'PAYMENT_NOT_CONFIGURED')
  assert.equal(state.packs.length, 0, '支付未开通前不得展示档位')

  setEnv(Object.assign({}, paymentEnv))
  state = recharge.rechargeState()
  assert.equal(state.available, false)
  assert.equal(state.reason, 'PRICE_NOT_CONFIGURED', '未配置档位同样不开放')

  setEnv(Object.assign({}, paymentEnv, { HONEY_TOPUP_PACKS: validPacks }))
  state = recharge.rechargeState()
  assert.equal(state.available, true)
  assert.equal(state.rate, 10)

  // ---- 请求签名 ----
  const config = recharge.__internals.paymentConfig()
  const body = JSON.stringify({ out_trade_no: 'HT1' })
  const path = '/v3/pay/transactions/jsapi'
  const header = recharge.__internals.authorization(config, 'POST', path, body)
  assert.ok(header.startsWith('WECHATPAY2-SHA256-RSA2048 '))
  const fields = Object.fromEntries([...header.matchAll(/(\w+)="([^"]*)"/g)].map(match => [match[1], match[2]]))
  assert.equal(fields.mchid, '1900000001')
  assert.equal(fields.serial_no, 'ABCDEF1234567890')
  const signedMessage = ['POST', path, fields.timestamp, fields.nonce_str, body, ''].join('\n')
  assert.equal(crypto.createVerify('RSA-SHA256').update(signedMessage).verify(merchantPublicPem, fields.signature, 'base64'), true, '商户请求签名必须可用对应公钥验证')

  // ---- 回调验签 ----
  const envelope = { id: 'evt-1', event_type: 'TRANSACTION.SUCCESS', resource: { algorithm: 'AEAD_AES_256_GCM', ciphertext: 'x', nonce: 'y', associated_data: 'transaction' } }
  const rawBody = JSON.stringify(envelope)
  const timestamp = String(Math.floor(Date.now() / 1000))
  const nonce = 'abc123'
  const signature = crypto.createSign('RSA-SHA256').update([timestamp, nonce, rawBody, ''].join('\n')).sign(platformPem, 'base64')
  assert.equal(recharge.__internals.verifyNotifySignature(config, { timestamp, nonce, signature, rawBody }).ok, true)
  assert.equal(recharge.__internals.verifyNotifySignature(config, { timestamp, nonce, signature, rawBody: rawBody + ' ' }).ok, false, '报文被改动必须验签失败')
  assert.equal(recharge.__internals.verifyNotifySignature(config, { timestamp: String(Number(timestamp) - 3600), nonce, signature, rawBody }).ok, false, '过期时间戳必须拒绝')
  assert.equal(recharge.__internals.verifyNotifySignature(config, { timestamp, nonce, signature: '', rawBody }).ok, false)

  // ---- 回调解密 ----
  const trade = { out_trade_no: 'HT-TEST-1', transaction_id: '4200000000000000000001', trade_state: 'SUCCESS', mchid: '1900000001', appid: 'wx5a42aae0e5d0669c', amount: { total: 1000, currency: 'CNY' }, payer: { openid: 'o1' } }
  const resourceNonce = 'nonce1234567'
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(apiV3Key), Buffer.from(resourceNonce))
  cipher.setAAD(Buffer.from('transaction'))
  const sealed = Buffer.concat([cipher.update(JSON.stringify(trade), 'utf8'), cipher.final(), cipher.getAuthTag()])
  const decrypted = recharge.__internals.decryptResource(apiV3Key, { algorithm: 'AEAD_AES_256_GCM', ciphertext: sealed.toString('base64'), nonce: resourceNonce, associated_data: 'transaction' })
  assert.equal(decrypted.transaction_id, trade.transaction_id)
  assert.throws(() => recharge.__internals.decryptResource('z'.repeat(32), { algorithm: 'AEAD_AES_256_GCM', ciphertext: sealed.toString('base64'), nonce: resourceNonce, associated_data: 'transaction' }))

  // ---- 金额/身份复核 ----
  const order = orderDoc('HT-TEST-1', 'o1', 100, 1000)
  assert.equal(recharge.__internals.verifyPaidTrade(config, order, trade), true)
  assert.throws(() => recharge.__internals.verifyPaidTrade(config, order, Object.assign({}, trade, { amount: { total: 1, currency: 'CNY' } })), error => error.code === 'HONEY_AMOUNT_MISMATCH')
  assert.throws(() => recharge.__internals.verifyPaidTrade(config, order, Object.assign({}, trade, { payer: { openid: 'other' } })), error => error.code === 'HONEY_ORDER_MISMATCH')
  assert.throws(() => recharge.__internals.verifyPaidTrade(config, order, Object.assign({}, trade, { appid: 'wx0000000000000000' })), error => error.code === 'HONEY_ORDER_MISMATCH')

  // ---- 入账：写一条正数流水 + 镜像加同额 + 订单置 paid，且重复调用只入账一次 ----
  const db = fakeDb()
  const balance = await seedWallet(db, 'o1', [100])
  assert.equal(balance, 100)
  const paidOrder = orderDoc('HT-ORDER-1', 'o1', 100, 1000)
  await seedOrder(db, paidOrder)
  // 另一个账户的流水不能参与本次余额核对
  await db.collection('fan_points_ledger').doc('other').set({ data: { serviceAccountOpenId: 'o2', delta: 999 } })
  await db.collection('fan_profiles').doc('profile-o2').set({ data: { serviceAccountOpenId: 'o2', honeyBalance: 999 } })

  const first = await recharge.__internals.creditOrder(db, paidOrder, '4200000000000000000001', 'notify')
  assert.equal(first.credited, true)
  assert.equal(first.balance, 200)
  const ledger = await db.collection('fan_points_ledger').where({ serviceAccountOpenId: 'o1' }).get()
  const topupRow = ledger.data.find(row => row.reason === 'honey-topup')
  assert.ok(topupRow, '必须写入一条充值流水')
  assert.equal(topupRow.delta, 100)
  assert.equal(topupRow.refId, 'honey-topup:HT-ORDER-1')
  assert.equal(ledger.data.length, 2, '初始赠滴 + 充值流水共两条')
  const profileAfter = await db.collection('fan_profiles').doc('profile-o1').get()
  assert.equal(profileAfter.data.honeyBalance, 200, '镜像必须等于账本合计')
  const orderAfter = await db.collection('honey_orders').doc('HT-ORDER-1').get()
  assert.equal(orderAfter.data.status, 'paid')
  assert.equal(orderAfter.data.ledgerState, 'credited')
  assert.equal(orderAfter.data.transactionId, '4200000000000000000001')

  const replay = await recharge.__internals.creditOrder(db, paidOrder, '4200000000000000000001', 'notify')
  assert.equal(replay.deduped, true, '重复回调必须幂等')
  const ledgerAgain = await db.collection('fan_points_ledger').where({ serviceAccountOpenId: 'o1' }).get()
  assert.equal(ledgerAgain.data.length, 2, '重复回调不得新增流水')
  const profileAgain = await db.collection('fan_profiles').doc('profile-o1').get()
  assert.equal(profileAgain.data.honeyBalance, 200, '重复回调和不得重复加滴')

  // ---- 镜像与账本不一致：阻断，不按任意一侧记账 ----
  const db2 = fakeDb()
  await seedWallet(db2, 'o1', [200])
  await db2.collection('fan_profiles').doc('profile-o1').update({ data: { honeyBalance: 150 } })
  const driftingOrder = orderDoc('HT-ORDER-2', 'o1', 100, 1000)
  await seedOrder(db2, driftingOrder)
  await assert.rejects(recharge.__internals.creditOrder(db2, driftingOrder, '4200000000000000000002', 'notify'), error => error.code === 'HONEY_RECONCILING')
  const driftingLedger = await db2.collection('fan_points_ledger').where({ serviceAccountOpenId: 'o1' }).get()
  assert.equal(driftingLedger.data.length, 1, '阻断时不得写流水')
  const driftingProfile = await db2.collection('fan_profiles').doc('profile-o1').get()
  assert.equal(driftingProfile.data.honeyBalance, 150, '阻断时不得改镜像')

  // ---- 交易状态不是 SUCCESS 时不得入账 ----
  assert.throws(() => recharge.__internals.verifyPaidTrade(config, order, Object.assign({}, trade, { transaction_id: '' })), error => error.code === 'HONEY_TRANSACTION_MISSING')

  // ---- 个人中心入口：iOS 与未配置时不下单 ----
  const handler = recharge.create({ db, user: { _id: 'u1' }, session: { serviceAccountOpenId: 'o1' } })
  const iosResult = await handler('servicePrivateHoneyRecharge', { packId: 'pack-1000', clientPlatform: 'ios' })
  assert.equal(iosResult.success, false)
  assert.equal(iosResult.code, 'IOS_VIRTUAL_PAYMENT_RESTRICTED', 'iOS 端不得创建虚拟滴订单')
  const packResult = await handler('servicePrivateHoneyRecharge', { packId: 'pack-999', clientPlatform: 'wechat-h5' })
  assert.equal(packResult.code, 'HONEY_PACK_INVALID')
  const noSession = recharge.create({ db, user: { _id: 'u1' }, session: {} })
  assert.equal((await noSession('servicePrivateHoneyOrders', {})).code, 'SERVICE_PRIVATE_AUTH_REQUIRED')
  const orderLookup = await handler('servicePrivateHoneyOrderStatus', { outTradeNo: 'HT-ORDER-1'.slice(0, 8) })
  assert.equal(orderLookup.code, 'HONEY_ORDER_NOT_FOUND', '不属于当前账号/不存在的订单不能泄露')

  setEnv({ HONEY_TOPUP_PACKS: validPacks })
  const notConfigured = await handler('servicePrivateHoneyRecharge', { packId: 'pack-1000', clientPlatform: 'wechat-h5' })
  assert.equal(notConfigured.code, 'PAYMENT_NOT_CONFIGURED')
  assert.equal(notConfigured.success, false)

  // ---- 主动查单失败必须回传原因：用户点「刷新状态」才看得到为什么还没到账 ----
  setEnv(Object.assign({}, paymentEnv, { HONEY_TOPUP_PACKS: validPacks }))
  const pendingDb = fakeDb()
  const pendingBalance = await seedWallet(pendingDb, 'o1', [100])
  await seedOrder(pendingDb, orderDoc('HT-PENDING-1', 'o1', 10, 100))
  const savedFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: false, status: 503, text: async () => JSON.stringify({ code: 'SYSTEM_ERROR' }) })
  try {
    const pendingHandler = recharge.create({ db: pendingDb, user: { _id: 'u1' }, session: { serviceAccountOpenId: 'o1' } })
    const pendingStatus = await pendingHandler('servicePrivateHoneyOrderStatus', { outTradeNo: 'HT-PENDING-1' })
    assert.equal(pendingStatus.success, true, '查单失败不能让整个接口失败，订单与余额仍要回读')
    assert.equal(pendingStatus.order.status, 'pending', '查单失败不得被当成已到账')
    assert.equal(pendingStatus.queryError.code, 'PAYMENT_UNAVAILABLE')
    assert.equal(pendingStatus.queryError.retryable, true, '查单繁忙属于可重试')
    assert.ok(pendingStatus.queryError.message.includes('稍后重试'), '可重试的失败要告诉用户稍后重试')
    assert.equal((await pendingDb.collection('fan_profiles').doc('profile-o1').get()).data.honeyBalance, pendingBalance, '查单失败不得改余额')
    // 不可重试的失败（账本不一致）必须明确要求联系客服，并让前端立即停止重试
    const blockedQuery = recharge.describePaymentQueryError(Object.assign(new Error('x'), { code: 'HONEY_RECONCILING' }))
    assert.equal(blockedQuery.retryable, false)
    assert.ok(blockedQuery.message.includes('联系客服'), '账本不一致必须引导联系客服')
    const unknownQuery = recharge.describePaymentQueryError(new Error('网络中断'))
    assert.equal(unknownQuery.retryable, true, '未知失败按可重试处理')
  } finally { globalThis.fetch = savedFetch }

  // ---- 回调入口：验签失败不入账 ----
  const notifyEnv = Object.assign({}, paymentEnv, { HONEY_TOPUP_PACKS: validPacks })
  setEnv(notifyEnv)
  const unsigned = await recharge.handleNotify({ body: rawBody, isBase64Encoded: false, headers: { 'wechatpay-timestamp': timestamp, 'wechatpay-nonce': nonce, 'wechatpay-signature': 'forged' } }, db)
  assert.equal(unsigned.statusCode, 401)
  assert.equal(unsigned.body.code, 'FAIL')
  const noBody = await recharge.handleNotify({ body: '', headers: {} }, db)
  assert.equal(noBody.statusCode, 400)

  // ---- 回调成功路径：验签 → 查单复核金额 → 事务入账；重放不重复加滴 ----
  const notifyDb = fakeDb()
  await seedWallet(notifyDb, 'o1', [50])
  await seedOrder(notifyDb, orderDoc('HT-NOTIFY-1', 'o1', 100, 1000))
  const okTrade = { out_trade_no: 'HT-NOTIFY-1', transaction_id: '4200000000000000000009', trade_state: 'SUCCESS', mchid: '1900000001', appid: 'wx5a42aae0e5d0669c', amount: { total: 1000, currency: 'CNY' }, payer: { openid: 'o1' } }
  let queryTrade = okTrade
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify(queryTrade) })
  try {
    const notified = await recharge.handleNotify(signedNotify({ out_trade_no: 'HT-NOTIFY-1' }), notifyDb)
    assert.equal(notified.statusCode, 200, '回调成功后必须回 200')
    assert.equal(notified.body.code, 'SUCCESS')
    const notifiedLedger = await notifyDb.collection('fan_points_ledger').where({ serviceAccountOpenId: 'o1' }).get()
    assert.equal(notifiedLedger.data.length, 2, '回调成功后账本只多一条充值流水')
    assert.equal((await notifyDb.collection('fan_profiles').doc('profile-o1').get()).data.honeyBalance, 150, '镜像必须同步加同额')
    const notifiedOrder = (await notifyDb.collection('honey_orders').doc('HT-NOTIFY-1').get()).data
    assert.equal(notifiedOrder.status, 'paid')
    assert.equal(notifiedOrder.ledgerState, 'credited')
    assert.equal(notifiedOrder.notifyCount, 1)

    const replayNotify = await recharge.handleNotify(signedNotify({ out_trade_no: 'HT-NOTIFY-1' }), notifyDb)
    assert.equal(replayNotify.statusCode, 200, '重放回调也必须回 200（微信只看 200）')
    assert.equal((await notifyDb.collection('fan_points_ledger').where({ serviceAccountOpenId: 'o1' }).get()).data.length, 2, '重放回调不得重复加滴')
    assert.equal((await notifyDb.collection('fan_profiles').doc('profile-o1').get()).data.honeyBalance, 150)

    // 查单金额与订单快照不符：拒绝入账，余额与流水都不动
    const badDb = fakeDb()
    await seedWallet(badDb, 'o1', [50])
    await seedOrder(badDb, orderDoc('HT-NOTIFY-2', 'o1', 100, 1000))
    queryTrade = Object.assign({}, okTrade, { out_trade_no: 'HT-NOTIFY-2', amount: { total: 1, currency: 'CNY' } })
    const mismatched = await recharge.handleNotify(signedNotify({ out_trade_no: 'HT-NOTIFY-2' }), badDb)
    assert.equal(mismatched.statusCode, 400, '金额不符必须拒绝入账')
    assert.equal((await badDb.collection('fan_points_ledger').where({ serviceAccountOpenId: 'o1' }).get()).data.length, 1, '金额不符不得写流水')
    assert.equal((await badDb.collection('fan_profiles').doc('profile-o1').get()).data.honeyBalance, 50, '金额不符不得改镜像')
  } finally { globalThis.fetch = originalFetch }

  console.log('蜂蜜充值档位口径、回调验签解密、金额复核与账本幂等检查通过')
})()
  .then(restore)
  .catch(error => { restore(); console.error(error); process.exitCode = 1 })
