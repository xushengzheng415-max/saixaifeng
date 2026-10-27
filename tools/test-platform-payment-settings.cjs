'use strict'
// 平台「支付设置」页面自检：支付配置体检只回状态与脱敏指纹，绝不回传密钥正文。
// 不联网、不读真实凭据：用本地临时生成的 RSA 材料模拟环境变量。
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const recharge = require('../cloudfunctions/webLoginApi/honeyRecharge.cjs')

const ENV_KEYS = [
  'WXPAY_MCH_ID', 'WXPAY_SERIAL_NO', 'WXPAY_APIV3_KEY', 'WXPAY_PRIVATE_KEY',
  'WXPAY_PLATFORM_PUBLIC_KEY', 'WXPAY_PLATFORM_SERIAL', 'WXPAY_APP_ID',
  'WXPAY_NOTIFY_URL', 'HONEY_TOPUP_PACKS', 'SERVICE_ACCOUNT_APP_ID'
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
const merchantPem = merchantKey.export({ type: 'pkcs8', format: 'pem' })
const platformPem = platformKey.export({ type: 'pkcs8', format: 'pem' })
const apiV3Key = 'Q7mZ2xR9tLk4WvBn8HcJ3sYp6DgF1aUe'
const platformSerial = 'PUB_KEY_ID_0114232134912410000000000000'
const CONFIRMED_PACKS = JSON.stringify([
  { priceCents: 100, drops: 10 },
  { priceCents: 500, drops: 50 },
  { priceCents: 1000, drops: 100 },
  { priceCents: 5000, drops: 500 },
  { priceCents: 10000, drops: 1000 }
])
const fullEnv = {
  WXPAY_MCH_ID: '1900000001',
  WXPAY_SERIAL_NO: 'ABCDEF1234567890',
  WXPAY_APIV3_KEY: apiV3Key,
  WXPAY_PRIVATE_KEY: merchantPem,
  WXPAY_PLATFORM_PUBLIC_KEY: platformPem,
  WXPAY_PLATFORM_SERIAL: platformSerial,
  WXPAY_APP_ID: 'wx5a42aae0e5d0669c',
  WXPAY_NOTIFY_URL: 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/honeyPayNotify',
  HONEY_TOPUP_PACKS: CONFIRMED_PACKS
}

function itemOf(status, key) {
  const found = (status.items || []).filter(item => item.key === key)[0]
  assert.ok(found, '体检结果必须包含 ' + key)
  return found
}

function assertNoPlaintext(status, label) {
  const text = JSON.stringify(status)
  assert.equal(text.indexOf(apiV3Key) < 0, true, label + '：不得回传 APIv3 密钥明文')
  assert.equal(text.indexOf('PRIVATE KEY-----') < 0, true, label + '：不得回传商户私钥 PEM 正文')
  assert.equal(text.indexOf(merchantPem.slice(30, 90)) < 0, true, label + '：不得回传商户私钥片段')
  assert.equal(text.indexOf(platformPem.slice(30, 90)) < 0, true, label + '：不得回传平台私钥片段')
  assert.equal(text.indexOf('ABCDEF1234567890') < 0, true, label + '：证书序列号只能脱敏展示')
  assert.equal(text.indexOf(platformSerial) < 0, true, label + '：平台公钥 ID 只能脱敏展示')
}

function run() {
  // ---- 全部配置正确：就绪、可充值、档位与已确认 5 档一致 ----
  setEnv(fullEnv)
  let status = recharge.paymentConfigStatus()
  assert.equal(status.success, true)
  assert.equal(status.ready, true, '全部变量正确时应判断为已就绪')
  assert.equal(status.rechargeAvailable, true, '支付与档位都正确时应开放充值')
  assert.equal(status.rate, 10, '计价口径必须是 1 元 = 10 滴')
  assert.equal(status.mode, 'public_key', 'PUB_KEY_ID_ 前缀应识别为微信支付公钥模式')
  assert.deepEqual(status.missing, [])
  assert.equal(status.items.length, 9, '体检项应覆盖 8 个变量 + 档位')
  assert.deepEqual(status.items.map(item => item.status), new Array(9).fill('ok'), '全部配置正确时每项都应是 ok')
  assert.equal(status.packs.confirmed, true, '5 档齐全时应标记为与已确认档位一致')
  assert.deepEqual(status.packs.list.map(pack => [pack.priceYuan, pack.drops]), [[1, 10], [5, 50], [10, 100], [50, 500], [100, 1000]])
  assert.deepEqual(status.packs.missingYuan, [])
  assert.deepEqual(status.packs.extraYuan, [])
  assertNoPlaintext(status, '全部配置正确')

  // ---- 密钥只以指纹/长度出现，指纹是 SHA-256 前 12 位 ----
  const keyItem = itemOf(status, 'WXPAY_APIV3_KEY')
  assert.equal(keyItem.masked, '已配置（32 位）', 'APIv3 密钥只允许回长度')
  const privateItem = itemOf(status, 'WXPAY_PRIVATE_KEY')
  const expectedFingerprint = crypto.createHash('sha256').update(merchantPem.trim()).digest('hex').slice(0, 12)
  assert.equal(privateItem.masked, 'PRIVATE KEY · 指纹 ' + expectedFingerprint, '私钥只允许回类型与指纹')
  assert.equal(itemOf(status, 'WXPAY_MCH_ID').masked, '19****01')

  // ---- 完全没有配置：逐项报缺，且不开放充值 ----
  setEnv({})
  status = recharge.paymentConfigStatus()
  assert.equal(status.ready, false)
  assert.equal(status.rechargeAvailable, false)
  assert.equal(status.rechargeReason, 'PAYMENT_NOT_CONFIGURED')
  assert.equal(itemOf(status, 'WXPAY_MCH_ID').status, 'missing')
  assert.equal(itemOf(status, 'WXPAY_APIV3_KEY').status, 'missing')
  assert.equal(itemOf(status, 'WXPAY_PRIVATE_KEY').status, 'missing')
  assert.equal(itemOf(status, 'HONEY_TOPUP_PACKS').status, 'missing')
  assert.equal(itemOf(status, 'WXPAY_NOTIFY_URL').status, 'ok', '未覆盖回调地址时应视为使用默认纯路径')
  assert.equal(itemOf(status, 'WXPAY_NOTIFY_URL').masked, 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/honeyPayNotify（默认）')
  assert.equal(status.mode, 'unconfigured')
  assert.ok(status.missing.indexOf('WXPAY_APIV3_KEY') >= 0, '未配置时 missing 列表必须点名 APIv3 密钥')
  assertNoPlaintext(status, '完全未配置')

  // ---- 格式异常：31 位 APIv3、带符号密钥、带查询串的回调地址 ----
  setEnv(Object.assign({}, fullEnv, {
    WXPAY_APIV3_KEY: apiV3Key.slice(0, 31),
    WXPAY_SERIAL_NO: 'ABC-123!',
    WXPAY_NOTIFY_URL: 'https://example.com/honeyPayNotify?sign=1',
    WXPAY_MCH_ID: '1900000001 '
  }))
  status = recharge.paymentConfigStatus()
  assert.equal(itemOf(status, 'WXPAY_APIV3_KEY').status, 'invalid', '31 位密钥必须报格式异常')
  assert.equal(itemOf(status, 'WXPAY_SERIAL_NO').status, 'invalid', '含符号的证书序列号必须报格式异常')
  assert.equal(itemOf(status, 'WXPAY_NOTIFY_URL').status, 'invalid', 'v3 回调地址带查询串必须报格式异常')
  assert.equal(itemOf(status, 'WXPAY_MCH_ID').status, 'ok', '首尾空格会被 trim，纯数字商户号仍应判为正常')
  assert.equal(status.ready, false)
  assertNoPlaintext(status, '格式异常')

  // ---- 私钥换行未转义 / PEM 头缺失 ----
  setEnv(Object.assign({}, fullEnv, { WXPAY_PRIVATE_KEY: merchantPem.split('\n').join(' ') }))
  status = recharge.paymentConfigStatus()
  assert.equal(itemOf(status, 'WXPAY_PRIVATE_KEY').status, 'invalid', '私钥压成一行后必须报格式异常')

  setEnv(Object.assign({}, fullEnv, { WXPAY_PRIVATE_KEY: merchantPem.replace(/-----BEGIN [A-Z ]+-----/g, '') }))
  status = recharge.paymentConfigStatus()
  assert.equal(itemOf(status, 'WXPAY_PRIVATE_KEY').status, 'invalid', '缺少 PEM 头必须报格式异常')

  setEnv(Object.assign({}, fullEnv, { WXPAY_PLATFORM_PUBLIC_KEY: platformPem }))
  const realNewlineMask = itemOf(recharge.paymentConfigStatus(), 'WXPAY_PLATFORM_PUBLIC_KEY').masked
  setEnv(Object.assign({}, fullEnv, { WXPAY_PLATFORM_PUBLIC_KEY: platformPem.replace(/\n/g, '\\n') }))
  status = recharge.paymentConfigStatus()
  assert.equal(itemOf(status, 'WXPAY_PLATFORM_PUBLIC_KEY').status, 'ok', '换行以 \\n 转义写入时仍应判为正常')
  assert.equal(itemOf(status, 'WXPAY_PLATFORM_PUBLIC_KEY').masked, realNewlineMask, '转义换行与真实换行必须得到同一指纹')
  assertNoPlaintext(status, '私钥格式异常')

  // ---- 档位对比：缺档、多档、比例不符 ----
  setEnv(Object.assign({}, fullEnv, { HONEY_TOPUP_PACKS: JSON.stringify([{ priceCents: 100, drops: 10 }, { priceCents: 2000, drops: 200 }]) }))
  status = recharge.paymentConfigStatus()
  assert.equal(status.packs.confirmed, false)
  assert.deepEqual(status.packs.missingYuan, [5, 10, 50, 100], '缺少的档位必须逐一点名')
  assert.deepEqual(status.packs.extraYuan, [20], '多出的档位必须逐一点名')
  assert.equal(itemOf(status, 'HONEY_TOPUP_PACKS').status, 'invalid')
  assert.ok(itemOf(status, 'HONEY_TOPUP_PACKS').note.indexOf('缺 5 元、10 元、50 元、100 元') >= 0, '档位说明要点名缺失档位')
  assert.equal(status.rechargeAvailable, true, '档位本身合法时仍可充值，但档位口径与已确认不一致必须被发现')

  setEnv(Object.assign({}, fullEnv, { HONEY_TOPUP_PACKS: JSON.stringify([{ priceCents: 500, drops: 60 }]) }))
  status = recharge.paymentConfigStatus()
  assert.equal(status.packs.list.length, 0, '旧五档（5 元 60 滴）必须整组拒绝')
  assert.equal(status.rechargeAvailable, false)
  assert.equal(status.rechargeReason, 'PRICE_RATE_MISMATCH')
  assert.equal(itemOf(status, 'HONEY_TOPUP_PACKS').status, 'missing')
  assert.equal(sourceHasActionGate(), true)
}

// 静态闸门：新 action 必须走网页会话并把平台负责人当作唯一放行条件。
function sourceHasActionGate() {
  const file = path.join(__dirname, '..', 'cloudfunctions', 'webLoginApi', 'index.js')
  const source = fs.readFileSync(file, 'utf8')
  const start = source.indexOf("case 'platformHoneyPaymentConfig'")
  assert.ok(start >= 0, 'index.js 必须注册 platformHoneyPaymentConfig action')
  const block = source.slice(start, source.indexOf('break', start))
  assert.ok(block.indexOf('authenticateWebSession(params)') >= 0, '支付配置体检必须先校验网页会话')
  assert.ok(block.indexOf("principalType === 'platform_owner'") >= 0, '支付配置体检只允许平台负责人')
  assert.ok(block.indexOf('paymentConfigStatus') >= 0, '支付配置体检必须调用统一实现')
  return true
}

try {
  run()
  console.log('平台支付设置体检检查通过：只回状态与脱敏指纹、缺项与格式异常可定位、档位与已确认 5 档对比正确')
} finally {
  restore()
}
