'use strict'
// 平台「支付设置」写入自检：凭据加密入库、页面永不回读明文、逐项保存/清除、审计不记值。
// 不联网、不读真实凭据：用本地临时生成的 RSA 材料与假数据库。
const assert = require('node:assert/strict')
const crypto = require('node:crypto')

const recharge = require('../cloudfunctions/webLoginApi/honeyRecharge.cjs')

const ENV_KEYS = [
  'WXPAY_MCH_ID', 'WXPAY_SERIAL_NO', 'WXPAY_APIV3_KEY', 'WXPAY_PRIVATE_KEY',
  'WXPAY_PLATFORM_PUBLIC_KEY', 'WXPAY_PLATFORM_SERIAL', 'WXPAY_APP_ID',
  'WXPAY_NOTIFY_URL', 'HONEY_TOPUP_PACKS', 'SERVICE_ACCOUNT_APP_ID', 'PAYMENT_SECRET_KEK'
]
const saved = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]))
function restore() {
  ENV_KEYS.forEach(key => { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key] })
}
function setEnv(values) {
  ENV_KEYS.forEach(key => { delete process.env[key] })
  Object.entries(values || {}).forEach(([key, value]) => { process.env[key] = value })
}

const { privateKey: merchantKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const { privateKey: platformKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const merchantPem = merchantKey.export({ type: 'pkcs8', format: 'pem' }).trim()
const platformPem = platformKey.export({ type: 'pkcs8', format: 'pem' }).trim()
const apiV3Key = 'Q7mZ2xR9tLk4WvBn8HcJ3sYp6DgF1aUe'
const serialNo = 'ABCDEF1234567890ABCDEF1234567890ABCD1234'
const platformSerial = 'PUB_KEY_ID_0114232134912410000000000000'
const packsJson = JSON.stringify([
  { priceCents: 100, drops: 10 },
  { priceCents: 500, drops: 50 },
  { priceCents: 1000, drops: 100 },
  { priceCents: 5000, drops: 500 },
  { priceCents: 10000, drops: 1000 }
])
const fullSecrets = {
  WXPAY_MCH_ID: '1900000001',
  WXPAY_SERIAL_NO: serialNo,
  WXPAY_APIV3_KEY: apiV3Key,
  WXPAY_PRIVATE_KEY: merchantPem,
  WXPAY_PLATFORM_PUBLIC_KEY: platformPem,
  WXPAY_PLATFORM_SERIAL: platformSerial,
  HONEY_TOPUP_PACKS: packsJson
}
const KEK = 'sxf-football-test-kek-2026-10-28'
const operator = { userId: 'platform-owner', name: '平台负责人', ip: '10.0.0.8' }

// 极简假数据库：支持 doc.get/set/remove 与 collection.add，行为贴合 wx-server-sdk。
function fakeDb() {
  const store = new Map()
  let seq = 0
  function missing() {
    const error = new Error('document.get:fail -1 document not exist')
    error.errCode = -1
    throw error
  }
  return {
    store,
    collection(name) {
      return {
        doc(id) {
          const key = name + '/' + id
          return {
            async get() {
              if (!store.has(key)) missing()
              return { data: JSON.parse(JSON.stringify(store.get(key))) }
            },
            async set({ data }) {
              store.set(key, Object.assign({ _id: id }, JSON.parse(JSON.stringify(data))))
              return {}
            },
            async remove() {
              if (!store.has(key)) missing()
              store.delete(key)
              return {}
            }
          }
        },
        async add({ data }) {
          seq += 1
          const id = 'audit-' + seq
          store.set(name + '/' + id, Object.assign({ _id: id }, JSON.parse(JSON.stringify(data))))
          return { _id: id }
        }
      }
    }
  }
}

function plainOf(status) { return JSON.stringify(status) }
function assertNoPlaintext(payload, label) {
  const body = typeof payload === 'string' ? payload : plainOf(payload)
  assert.equal(body.indexOf(apiV3Key) < 0, true, label + '：不得出现 APIv3 密钥明文')
  assert.equal(body.indexOf('PRIVATE KEY-----') < 0, true, label + '：不得出现私钥 PEM')
  assert.equal(body.indexOf(merchantPem.split('\n')[1]) < 0, true, label + '：不得出现私钥正文片段')
  assert.equal(body.indexOf(platformPem.split('\n')[1]) < 0, true, label + '：不得出现公钥正文片段')
}

async function run() {
  // ---- 主密钥缺失：拒绝保存，并给出明确原因 ----
  setEnv({ SERVICE_ACCOUNT_APP_ID: 'wx0191b291b0d89d9a' })
  const db = fakeDb()
  await recharge.ensureSecrets(db, { force: true })
  let reply = await recharge.savePaymentSecrets(db, operator, { secrets: fullSecrets })
  assert.equal(reply.success, false, '未配置 PAYMENT_SECRET_KEK 时必须拒绝保存')
  assert.equal(reply.code, 'PAYMENT_SECRET_KEK_MISSING')
  assert.ok(String(reply.error).indexOf('PAYMENT_SECRET_KEK') >= 0, '错误信息必须点明主密钥变量名')
  assert.equal(db.store.size, 0, '被拒绝时不能写入任何数据')

  // ---- 配置主密钥后逐项保存：全部入库、立刻可充值 ----
  setEnv({ SERVICE_ACCOUNT_APP_ID: 'wx0191b291b0d89d9a', PAYMENT_SECRET_KEK: KEK })
  await recharge.ensureSecrets(db, { force: true })
  reply = await recharge.savePaymentSecrets(db, operator, { secrets: fullSecrets })
  assert.equal(reply.success, true, '主密钥就绪时应保存成功')
  assert.equal(reply.saved.length, 7, '七项（含档位）都应写入')
  assert.equal(reply.audited, true, '保存必须留下审计记录')
  assert.equal(reply.status.ready, true, '保存后支付配置应就绪')
  assert.equal(reply.status.rechargeAvailable, true, '保存后蜂蜜充值应开放')
  assert.equal(reply.status.secretStore.savedCount, 7)
  assert.equal(reply.status.secretStore.decryptableCount, 7, '七项都必须能用当前主密钥解开')
  assert.equal(reply.status.secretStore.kekReady, true)
  assert.equal(reply.status.secretStore.kekFingerprint.length, 8, '主密钥指纹只回 8 位')
  assertNoPlaintext(reply, '保存响应')

  const dbItems = reply.status.items.filter(item => item.source === 'db')
  assert.deepEqual(dbItems.map(item => item.key).sort(), Object.keys(fullSecrets).sort(), '七项来源必须标为 db')
  assert.equal(reply.status.items.filter(item => item.key === 'WXPAY_APP_ID')[0].source, 'env', 'AppID 仍来自服务号回退')
  assert.deepEqual(reply.status.packs.list.map(pack => [pack.priceYuan, pack.drops]), [[1, 10], [5, 50], [10, 100], [50, 500], [100, 1000]])

  // ---- 落库的确只有密文 ----
  const storedDoc = db.store.get('platform_payment_secrets/wxpay')
  assert.ok(storedDoc, '配置必须以单文档形式落库')
  assert.equal(storedDoc.algorithm, 'aes-256-gcm')
  assert.equal(storedDoc.updatedBy, 'platform-owner')
  assert.equal(!!storedDoc.keys.WXPAY_APIV3_KEY.data, true, 'APIv3 密钥必须以密文形式落库')
  assert.equal(storedDoc.keys.WXPAY_APIV3_KEY.data === apiV3Key, false, '落库内容不能等于明文')
  const storedJson = JSON.stringify(storedDoc.keys)
  assert.equal(storedJson.indexOf(apiV3Key) < 0, true, '库里不得出现 APIv3 明文')
  assert.equal(storedJson.indexOf('BEGIN PRIVATE KEY') < 0, true, '库里不得出现私钥明文')
  assert.equal(storedJson.indexOf('1900000001') < 0, true, '库里不得出现商户号明文')
  assert.ok(storedDoc.keys.WXPAY_PRIVATE_KEY.tag && storedDoc.keys.WXPAY_PRIVATE_KEY.iv, '每项都必须独立 IV 与 AuthTag')

  // ---- 密文可解密，且库内值优先于环境变量 ----
  await recharge.ensureSecrets(db, { force: true })
  const internals = recharge.__internals
  assert.equal(internals.secretValue('WXPAY_MCH_ID'), '1900000001', '库内值必须能解密回明文')
  setEnv({ SERVICE_ACCOUNT_APP_ID: 'wx0191b291b0d89d9a', PAYMENT_SECRET_KEK: KEK, WXPAY_MCH_ID: '1999999999' })
  await recharge.ensureSecrets(db, { force: true })
  assert.equal(internals.secretValue('WXPAY_MCH_ID'), '1900000001', '库内值优先于同名环境变量')
  assert.equal(internals.secretSource('WXPAY_MCH_ID').source, 'db')

  // ---- 格式不合规：只报项名与原因，且不改动库内数据 ----
  reply = await recharge.savePaymentSecrets(db, operator, { secrets: { WXPAY_APIV3_KEY: 'short-key' } })
  assert.equal(reply.success, false, '31 位以内的 APIv3 密钥必须被拒绝')
  assert.equal(reply.code, 'PAYMENT_SECRET_INVALID')
  assert.ok(String(reply.error).indexOf('APIv3') >= 0, '错误信息必须点明是哪一项')
  assert.equal(String(reply.error).indexOf('short-key') < 0, true, '错误信息不得回显被拒绝的值')
  assert.equal(JSON.stringify(db.store.get('platform_payment_secrets/wxpay').keys).indexOf('short-key') < 0, true, '被拒绝的值不得入库')

  reply = await recharge.savePaymentSecrets(db, operator, { secrets: { WXPAY_PRIVATE_KEY: merchantPem.split('\n').join(' ') } })
  assert.equal(reply.success, false, '压成一行的私钥必须被拒绝')
  assert.equal(reply.code, 'PAYMENT_SECRET_INVALID')

  reply = await recharge.savePaymentSecrets(db, operator, { secrets: { HONEY_TOPUP_PACKS: JSON.stringify([{ priceCents: 500, drops: 60 }]) } })
  assert.equal(reply.success, false, '与 1 元 10 滴不符的档位必须被拒绝')
  assert.equal(reply.code, 'PAYMENT_SECRET_INVALID')

  reply = await recharge.savePaymentSecrets(db, operator, { secrets: {} })
  assert.equal(reply.success, false, '空提交必须被拒绝')
  assert.equal(reply.code, 'PAYMENT_SECRET_EMPTY')

  // ---- 逐项保存：只改提交的项，其他项保持原值 ----
  reply = await recharge.savePaymentSecrets(db, operator, { secrets: { WXPAY_SERIAL_NO: 'ZZZZ1111YYYY2222ZZZZ3333YYYY4444ZZZZ5555' } })
  assert.equal(reply.success, true)
  assert.deepEqual(reply.saved, ['WXPAY_SERIAL_NO'])
  assert.equal(reply.status.secretStore.savedCount, 7, '逐项保存不能减少已存项')
  await recharge.ensureSecrets(db, { force: true })
  assert.equal(internals.secretValue('WXPAY_APIV3_KEY'), apiV3Key, '未提交的项必须保持原值')

  // ---- 主密钥被换掉：旧密文解不开，不能当作已配置 ----
  setEnv({ SERVICE_ACCOUNT_APP_ID: 'wx0191b291b0d89d9a', PAYMENT_SECRET_KEK: 'another-kek-different-2026' })
  await recharge.ensureSecrets(db, { force: true })
  let status = await recharge.paymentConfigStatus(db)
  assert.equal(status.secretStore.savedCount, 7, '库里仍有 7 项密文')
  assert.equal(status.secretStore.decryptableCount, 0, '换过主密钥后密文必须全部解不开')
  assert.equal(status.ready, false, '解不开密文且无环境变量时必须判定未就绪')
  assert.equal(status.items.filter(item => item.source === 'db').length, 0, '解不开的值不能算作已配置来源')
  assertNoPlaintext(status, '主密钥变更后的体检')

  // ---- 换回主密钥后逐项清除 ----
  setEnv({ SERVICE_ACCOUNT_APP_ID: 'wx0191b291b0d89d9a', PAYMENT_SECRET_KEK: KEK })
  await recharge.ensureSecrets(db, { force: true })
  reply = await recharge.clearPaymentSecrets(db, operator, { keys: ['WXPAY_APIV3_KEY'] })
  assert.equal(reply.success, true)
  assert.deepEqual(reply.cleared, ['WXPAY_APIV3_KEY'])
  assert.equal(reply.status.secretStore.savedCount, 6, '逐项清除后只少这一项')
  assert.equal(reply.status.secretStore.savedKeys.indexOf('WXPAY_APIV3_KEY'), -1)
  assert.equal(reply.status.ready, false, '清掉 APIv3 密钥后不能判定就绪')
  assert.equal(reply.status.items.filter(item => item.key === 'WXPAY_APIV3_KEY')[0].status, 'missing')

  reply = await recharge.clearPaymentSecrets(db, operator, { keys: [] })
  assert.equal(reply.success, false, '未指定项且非全清时必须拒绝')
  assert.equal(reply.code, 'PAYMENT_SECRET_EMPTY')

  reply = await recharge.clearPaymentSecrets(db, operator, { all: true })
  assert.equal(reply.success, true)
  assert.equal(reply.cleared.length, 6, '全清必须清掉剩余 6 项')
  assert.equal(reply.status.secretStore.savedCount, 0)
  assert.equal(db.store.has('platform_payment_secrets/wxpay'), false, '全部清空后必须删除文档')
  assert.equal(reply.status.rechargeAvailable, false)

  // ---- 审计只记动作与项名，不记值 ----
  const auditRows = []
  db.store.forEach((value, key) => { if (key.indexOf('platform_payment_secret_audit/') === 0) auditRows.push(value) })
  assert.ok(auditRows.length >= 4, '保存、逐项清除、全清都必须留审计')
  assert.equal(auditRows[0].action, 'save')
  assert.equal(auditRows[0].operatorId, 'platform-owner')
  assert.equal(auditRows[0].ip, '10.0.0.8')
  const auditJson = JSON.stringify(auditRows)
  assert.equal(auditJson.indexOf(apiV3Key) < 0, true, '审计不得记录密钥值')
  assert.equal(auditJson.indexOf('BEGIN PRIVATE KEY') < 0, true, '审计不得记录私钥')
  assert.equal(auditRows.some(row => row.action === 'clear'), true, '清除动作必须留审计')

  // ---- 审计集合写入失败不能阻断配置保存 ----
  const brokenDb = fakeDb()
  const originalCollection = brokenDb.collection
  brokenDb.collection = name => {
    if (name === 'platform_payment_secret_audit') {
      return { add: async () => { const error = new Error('collection not exist'); error.errCode = -502005; throw error } }
    }
    return originalCollection.call(brokenDb, name)
  }
  reply = await recharge.savePaymentSecrets(brokenDb, operator, { secrets: { WXPAY_MCH_ID: '1900000002' } })
  assert.equal(reply.success, true, '审计写入失败时配置仍应保存成功')
  assert.equal(reply.audited, false, '审计失败必须显式标记')

  // ---- 环境变量路径仍然可用（迁移期两处并存） ----
  setEnv({ SERVICE_ACCOUNT_APP_ID: 'wx0191b291b0d89d9a', PAYMENT_SECRET_KEK: KEK, WXPAY_MCH_ID: '1900000003', WXPAY_APIV3_KEY: apiV3Key })
  await recharge.ensureSecrets(fakeDb(), { force: true })
  status = await recharge.paymentConfigStatus(fakeDb())
  assert.equal(status.items.filter(item => item.key === 'WXPAY_MCH_ID')[0].source, 'env', '没有库内值时来源必须是 env')
  assert.equal(status.items.filter(item => item.key === 'WXPAY_MCH_ID')[0].status, 'ok')
  assertNoPlaintext(status, '纯环境变量体检')
}

try {
  run().then(() => {
    console.log('平台支付设置写入检查通过：加密入库、库内优先、逐项保存/清除、明文不外泄、审计不记值')
  }).catch(error => {
    console.error(error && error.stack ? error.stack : error)
    process.exitCode = 1
  }).finally(() => { restore() })
} catch (error) {
  restore()
  throw error
}
