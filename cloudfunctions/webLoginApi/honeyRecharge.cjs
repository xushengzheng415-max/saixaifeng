'use strict'
// 蜂蜜充值（微信支付 APIv3 · JSAPI）服务端。
// 口径来自 docs/HONEY_TOPUP_HANDOFF_2026-10-27.md：
//   1. fan_points_ledger 是唯一事实来源；fan_profiles.honeyBalance 只是镜像，
//      两者不一致一律阻断（HONEY_RECONCILING），绝不按任意一侧继续记账。
//   2. 入账只发生在服务端支付回调：验签 → 查单复核金额 → 事务内
//      「写一条正数流水 + 镜像加同额 + 订单置 paid」，以 outTradeNo / transactionId 幂等。
//   3. 前端「支付成功」提示不能作为到账依据；订单是否到账只看这里的服务端结论。
//   4. 退款只写负数冲销流水，不删除、不改写原充值流水。
//   5. 档位与价格只认服务端：1 元 = 10 滴，档位必须显式配置；未配置就不开放充值，
//      避免旧五档与 1 元 10 滴两套口径同时在线上。
const crypto = require('crypto')
const { readAll, missingCollection } = require('./data-center/reader.cjs')

const ORDER_COLLECTION = 'honey_orders'
const LEDGER_COLLECTION = 'fan_points_ledger'
const PROFILE_COLLECTION = 'fan_profiles'
const LEDGER_REASON_TOPUP = 'honey-topup'
const LEDGER_REASON_REFUND = 'honey-topup-refund'
const LEDGER_REF_PREFIX = 'honey-topup:'
const LEDGER_REFUND_REF_PREFIX = 'honey-topup-refund:'

// 2026-10-27 用户确认：1 元 = 10 滴，1 滴 = 10 分。档位必须严格等于该比例。
const RATE_DROPS_PER_YUAN = 10
const CENTS_PER_DROP = 100 / RATE_DROPS_PER_YUAN
const MAX_PRICE_CENTS = 100000 // 单笔 1000 元上限
const MAX_DROPS = 100000
const MAX_PACKS = 8
const PENDING_REUSE_MS = 30 * 60 * 1000
const PREPAY_REUSE_MS = 90 * 60 * 1000
const ORDER_EXPIRE_MS = 30 * 60 * 1000
const NOTIFY_TOLERANCE_SEC = 300
const NOTIFY_CLEAN_PATH = '/honeyPayNotify' // 正式回调路径：v3 的 notify_url 不允许携带查询串
const DEFAULT_NOTIFY_URL = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com' + NOTIFY_CLEAN_PATH

// 支付凭据存储：平台负责人在「支付设置」页填写的值用 AES-256-GCM 加密后落在该集合，
// 主密钥 PAYMENT_SECRET_KEK 只存在云函数环境变量里 —— 只拿到数据库读权限解不开密文。
// 页面永远不回读明文，只回长度/指纹；环境变量作为回退，便于迁移期两处并存时逐项切换。
const SECRET_COLLECTION = 'platform_payment_secrets'
const SECRET_AUDIT_COLLECTION = 'platform_payment_secret_audit'
const SECRET_DOC_ID = 'wxpay'
const SECRET_CACHE_MS = 60 * 1000 // 每个实例最多缓存 60 秒，保存后本实例立即刷新
const SECRET_MAX_LENGTH = 20000
const SECRET_FIELDS = ['WXPAY_MCH_ID', 'WXPAY_SERIAL_NO', 'WXPAY_APIV3_KEY', 'WXPAY_PRIVATE_KEY', 'WXPAY_PLATFORM_PUBLIC_KEY', 'WXPAY_PLATFORM_SERIAL', 'HONEY_TOPUP_PACKS']
const SECRET_LABELS = {
  WXPAY_MCH_ID: '商户号',
  WXPAY_SERIAL_NO: 'API 证书序列号',
  WXPAY_APIV3_KEY: 'APIv3 密钥',
  WXPAY_PRIVATE_KEY: '商户 API 私钥',
  WXPAY_PLATFORM_PUBLIC_KEY: '微信支付公钥',
  WXPAY_PLATFORM_SERIAL: '平台公钥 ID / 证书序列号',
  HONEY_TOPUP_PACKS: '充值档位'
}

const STATUS_LABELS = { pending: '待支付', paid: '已到账', closed: '已关闭', refunded: '已退款' }
const RECHARGE_REASON_TEXTS = {
  PAYMENT_NOT_CONFIGURED: '微信支付待开通',
  PRICE_NOT_CONFIGURED: '充值档位待确认',
  PRICE_CONFIG_INVALID: '充值档位配置异常，暂不开放',
  PRICE_RATE_MISMATCH: '充值档位与统一单价不符，暂不开放',
  PRICE_BONUS_UNCONFIRMED: '赠送滴数待确认，暂不开放',
  IOS_VIRTUAL_PAYMENT_RESTRICTED: 'iOS 暂不支持购买蜂蜜滴'
}

const text = value => String(value == null ? '' : value).trim()
const fail = (code, message) => { throw Object.assign(new Error(message), { code }) }
const failResult = (code, error) => ({ success: false, code, error })
const env = name => text(process.env[name])

function normalizePem(value) {
  const raw = text(value).replace(/\\n/g, '\n')
  if (!raw || !/-----BEGIN [A-Z ]+-----/.test(raw)) return ''
  // 末尾换行与首尾空格不影响签名/验签，统一去掉后再算指纹，
  // 这样「真实换行」和「写成 \n 的换行」得到同一指纹。
  return raw.trim()
}

// ============ 支付凭据的加密存储（数据库优先，环境变量回退） ============
// 密文只在云函数里解密，明文既不出现在响应里，也不写日志。
let secretCache = { at: 0, values: {}, keys: [], kekReady: false, kekFingerprint: '', error: '' }

function secretMasterKey() {
  const raw = text(process.env.PAYMENT_SECRET_KEK)
  if (raw.length < 16) return null
  return crypto.createHash('sha256').update(raw, 'utf8').digest()
}

// 主密钥指纹：只用于判断「库里的密文是不是用当前主密钥加密的」，不可逆。
function secretKekFingerprint() {
  const key = secretMasterKey()
  if (!key) return ''
  return crypto.createHash('sha256').update('kek:' + key.toString('hex')).digest('hex').slice(0, 8)
}

function encryptSecret(plain) {
  const key = secretMasterKey()
  if (!key) return null
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const sealed = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  return { v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: sealed.toString('base64') }
}

function decryptSecret(sealed) {
  const key = secretMasterKey()
  if (!key || !sealed || !text(sealed.data) || !text(sealed.iv) || !text(sealed.tag)) return ''
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(text(sealed.iv), 'base64'))
    decipher.setAuthTag(Buffer.from(text(sealed.tag), 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(text(sealed.data), 'base64')), decipher.final()]).toString('utf8')
  } catch (error) { return '' }
}

// 读取并解密库内配置；读不到（集合/文档不存在、主密钥缺失、密文被换过主密钥）一律按「没有」处理，
// 由环境变量回退兜底，绝不让支付链路因为读配置失败而整体崩溃。
async function ensureSecrets(db, options) {
  const force = Boolean(options && options.force)
  const now = Date.now()
  if (!force && now - secretCache.at < SECRET_CACHE_MS) return secretCache
  let doc = null
  let error = ''
  if (db) {
    try { doc = await docValue(db, SECRET_COLLECTION, SECRET_DOC_ID) } catch (readError) {
      error = text(readError.code) || text(readError.message) || 'SECRET_READ_FAILED'
      console.warn('[honeyRecharge] 支付配置读取失败', error)
    }
  }
  const kekReady = Boolean(secretMasterKey())
  const kekFingerprint = secretKekFingerprint()
  const values = {}
  const keys = []
  const storedKeys = doc && doc.keys && typeof doc.keys === 'object' ? Object.keys(doc.keys) : []
  storedKeys.forEach(name => {
    if (SECRET_FIELDS.indexOf(name) < 0) return
    keys.push(name)
    const plain = decryptSecret(doc.keys[name])
    if (plain) values[name] = plain
  })
  secretCache = { at: now, values, keys: keys.sort(), kekReady, kekFingerprint, error }
  return secretCache
}

// 单取一个配置项：库里优先，其次环境变量。
function secretSource(name) {
  const fromDb = text(secretCache.values[name])
  if (fromDb) return { value: fromDb, source: 'db' }
  const fromEnv = text(process.env[name])
  return { value: fromEnv, source: fromEnv ? 'env' : '' }
}
function secretValue(name) { return secretSource(name).value }

function secretStoreView() {
  return {
    kekReady: secretCache.kekReady,
    kekFingerprint: secretCache.kekFingerprint,
    savedCount: secretCache.keys.length,
    savedKeys: secretCache.keys.slice(),
    decryptableCount: Object.keys(secretCache.values).length,
    error: secretCache.error
  }
}

// 支付配置：库内密文优先，环境变量回退；密钥、商户证书私钥不得进入仓库、日志或前端。
function paymentConfig() {
  const mchid = secretValue('WXPAY_MCH_ID')
  const serialNo = secretValue('WXPAY_SERIAL_NO')
  const apiV3Key = secretValue('WXPAY_APIV3_KEY')
  const privateKeyPem = normalizePem(secretValue('WXPAY_PRIVATE_KEY'))
  const platformPublicKeyPem = normalizePem(secretValue('WXPAY_PLATFORM_PUBLIC_KEY'))
  // JSAPI 下单的 AppID 必须是「服务号」AppID：服务号 H5 拿到的 openid 属于服务号，
  // 不能回退网站应用 AppID（wx5a42aae0e5d0669c）或小程序 AppID，否则 appid 与 openid 不同主体，下单必失败。
  const appId = secretValue('WXPAY_APP_ID') || env('SERVICE_ACCOUNT_APP_ID')
  const notifyUrl = secretValue('WXPAY_NOTIFY_URL') || DEFAULT_NOTIFY_URL
  const platformSerial = secretValue('WXPAY_PLATFORM_SERIAL')
  const missing = []
  if (!/^\d{6,}$/.test(mchid)) missing.push('WXPAY_MCH_ID')
  if (!/^[0-9A-Za-z]{6,}$/.test(serialNo)) missing.push('WXPAY_SERIAL_NO')
  if (!/^[0-9A-Za-z]{32}$/.test(apiV3Key)) missing.push('WXPAY_APIV3_KEY')
  if (!privateKeyPem) missing.push('WXPAY_PRIVATE_KEY')
  if (!platformPublicKeyPem) missing.push('WXPAY_PLATFORM_PUBLIC_KEY')
  if (!appId) missing.push('WXPAY_APP_ID')
  if (!/^https:\/\//.test(notifyUrl)) missing.push('WXPAY_NOTIFY_URL')
  return { ready: missing.length === 0, missing, mchid, serialNo, apiV3Key, privateKeyPem, platformPublicKeyPem, platformSerial, appId, notifyUrl }
}

// 档位配置：HONEY_TOPUP_PACKS = [{"priceCents":100,"drops":10}, ...]
// 只接受「价格 = 滴数 × 10 分」的档位；带赠滴的档位需要产品负责人另行确认，配置里一律拒绝。
function parsePacks(raw) {
  const source = raw == null ? '' : text(raw)
  if (!source) return { packs: [], reason: 'PRICE_NOT_CONFIGURED' }
  let list
  try { list = JSON.parse(source) } catch (error) { return { packs: [], reason: 'PRICE_CONFIG_INVALID' } }
  if (!Array.isArray(list) || !list.length || list.length > MAX_PACKS) return { packs: [], reason: 'PRICE_CONFIG_INVALID' }
  const packs = []
  const seen = new Set()
  for (const item of list) {
    const priceCents = Number(item && item.priceCents)
    const drops = Number(item && item.drops)
    const bonusDrops = Number((item && item.bonusDrops) || 0)
    if (!Number.isSafeInteger(priceCents) || priceCents < 100 || priceCents > MAX_PRICE_CENTS) return { packs: [], reason: 'PRICE_CONFIG_INVALID' }
    if (!Number.isSafeInteger(drops) || drops <= 0 || drops > MAX_DROPS) return { packs: [], reason: 'PRICE_CONFIG_INVALID' }
    if (!Number.isSafeInteger(bonusDrops) || bonusDrops < 0) return { packs: [], reason: 'PRICE_CONFIG_INVALID' }
    // 赠滴属于未确认的优惠规则，配置里出现就整组拒绝，避免无意中上线加量档
    if (bonusDrops !== 0) return { packs: [], reason: 'PRICE_BONUS_UNCONFIRMED' }
    if (priceCents !== drops * CENTS_PER_DROP) return { packs: [], reason: 'PRICE_RATE_MISMATCH' }
    const id = 'pack-' + priceCents
    if (seen.has(id)) return { packs: [], reason: 'PRICE_CONFIG_INVALID' }
    seen.add(id)
    packs.push({ id, priceCents, priceYuan: priceCents / 100, drops, bonusDrops, totalDrops: drops + bonusDrops })
  }
  packs.sort((left, right) => left.priceCents - right.priceCents)
  return { packs, reason: '' }
}

// 只返回展示用的档位与状态；未配置支付或档位时不给前端任何可购买档位。
function rechargeState() {
  const config = paymentConfig()
  const packState = parsePacks(secretValue('HONEY_TOPUP_PACKS'))
  if (!config.ready) return { available: false, reason: 'PAYMENT_NOT_CONFIGURED', error: RECHARGE_REASON_TEXTS.PAYMENT_NOT_CONFIGURED, packs: [], rate: RATE_DROPS_PER_YUAN }
  if (!packState.packs.length) {
    const reason = packState.reason || 'PRICE_NOT_CONFIGURED'
    return { available: false, reason, error: RECHARGE_REASON_TEXTS[reason] || '充值档位待确认', packs: [], rate: RATE_DROPS_PER_YUAN }
  }
  return { available: true, reason: '', error: '', packs: packState.packs, rate: RATE_DROPS_PER_YUAN }
}

function publicRechargeState() {
  const state = rechargeState()
  return { available: state.available, reason: state.reason, packs: state.packs, rate: state.rate }
}

// ============ 平台支付设置体检（只回状态与脱敏指纹）============
// 密钥明文只允许存在于云函数环境变量：这里只回答「有没有配、格式对不对、指纹是否一致」，
// 页面据此提示缺哪一项、去哪补；绝不回传 APIv3 密钥、商户私钥或平台公钥正文。
const CONFIRMED_PACK_CENTS = [100, 500, 1000, 5000, 10000] // 1 / 5 / 10 / 50 / 100 元（分）

function maskMiddle(value, head, tail) {
  const raw = text(value)
  if (!raw) return ''
  const left = Math.max(head, 0)
  const right = Math.max(tail, 0)
  if (raw.length <= left + right) return '****'
  return raw.slice(0, left) + '****' + raw.slice(raw.length - right)
}

// 指纹只用于确认「两处填的是同一把密钥」，无法反推正文。
function pemFingerprint(value) {
  const pem = normalizePem(value)
  if (!pem) return ''
  return crypto.createHash('sha256').update(pem).digest('hex').slice(0, 12)
}

function maskPem(value) {
  const fingerprint = pemFingerprint(value)
  if (!fingerprint) return ''
  const pem = normalizePem(value)
  const kind = (pem.match(/-----BEGIN ([A-Z ]+)-----/) || [])[1] || 'PEM'
  return kind + ' · 指纹 ' + fingerprint
}

// PEM 只有「有头且有换行」才能被 crypto 正常解析；压成一行的粘贴会在这里被判为格式异常。
function pemValid(value) {
  const pem = normalizePem(value)
  return Boolean(pem) && pem.indexOf('\n') >= 0
}

// 支付配置体检：只回「是否已配置 / 来源 / 格式 / 脱敏指纹」，任何密钥正文都不出云函数。
async function paymentConfigStatus(db) {
  await ensureSecrets(db)
  const mchid = secretSource('WXPAY_MCH_ID')
  const serial = secretSource('WXPAY_SERIAL_NO')
  const apiV3 = secretSource('WXPAY_APIV3_KEY')
  const privateKey = secretSource('WXPAY_PRIVATE_KEY')
  const platformKey = secretSource('WXPAY_PLATFORM_PUBLIC_KEY')
  const platformSerialValue = secretSource('WXPAY_PLATFORM_SERIAL')
  const appIdValue = secretSource('WXPAY_APP_ID')
  const notifyValue = secretSource('WXPAY_NOTIFY_URL')
  const packsValue = secretSource('HONEY_TOPUP_PACKS')
  const rawMchId = mchid.value
  const rawSerial = serial.value
  const rawApiV3 = apiV3.value
  const rawPrivateKey = privateKey.value
  const rawPlatformKey = platformKey.value
  const rawPlatformSerial = platformSerialValue.value
  const rawAppId = appIdValue.value
  const fallbackAppId = env('SERVICE_ACCOUNT_APP_ID')
  const rawNotify = notifyValue.value
  const config = paymentConfig()
  const state = rechargeState()
  const packState = parsePacks(packsValue.value)
  const packCents = packState.packs.map(item => item.priceCents)
  const missingPacks = CONFIRMED_PACK_CENTS.filter(cents => packCents.indexOf(cents) < 0)
  const extraPacks = packCents.filter(cents => CONFIRMED_PACK_CENTS.indexOf(cents) < 0)
  const notifyHasQuery = rawNotify.indexOf('?') >= 0
  const notifyInvalid = Boolean(rawNotify) && (!/^https:\/\//.test(rawNotify) || notifyHasQuery)
  const items = [
    {
      key: 'WXPAY_MCH_ID',
      label: '商户号',
      source: mchid.source,
      status: !rawMchId ? 'missing' : (/^\d{6,}$/.test(rawMchId) ? 'ok' : 'invalid'),
      masked: maskMiddle(rawMchId, 2, 2),
      note: !rawMchId ? '未配置：商户平台首页顶部「商户号」' : (/^\d{6,}$/.test(rawMchId) ? '纯数字，格式正常' : '应为纯数字，检查是否粘入空格或其他字符')
    },
    {
      key: 'WXPAY_SERIAL_NO',
      label: 'API 证书序列号',
      source: serial.source,
      status: !rawSerial ? 'missing' : (/^[0-9A-Za-z]{6,}$/.test(rawSerial) ? 'ok' : 'invalid'),
      masked: maskMiddle(rawSerial, 4, 4),
      note: !rawSerial ? '未配置：商户平台「API 安全 → API 证书」查看序列号' : (/^[0-9A-Za-z]{6,}$/.test(rawSerial) ? '与商户私钥必须成对' : '序列号含非法字符')
    },
    {
      key: 'WXPAY_APIV3_KEY',
      label: 'APIv3 密钥',
      source: apiV3.source,
      status: !rawApiV3 ? 'missing' : (/^[0-9A-Za-z]{32}$/.test(rawApiV3) ? 'ok' : 'invalid'),
      masked: rawApiV3 ? '已配置（' + String(rawApiV3).length + ' 位）' : '',
      note: !rawApiV3 ? '未配置：商户平台「API 安全 → 设置 APIv3 密钥」（32 位字母数字，只显示一次）' : (/^[0-9A-Za-z]{32}$/.test(rawApiV3) ? '长度与字符集正确' : '必须是 32 位数字加大小写字母，不含符号')
    },
    {
      key: 'WXPAY_PRIVATE_KEY',
      label: '商户 API 私钥',
      source: privateKey.source,
      status: !rawPrivateKey ? 'missing' : (pemValid(rawPrivateKey) ? 'ok' : 'invalid'),
      masked: maskPem(rawPrivateKey),
      note: !rawPrivateKey ? '未配置：商户平台下载的 apiclient_key.pem 全文' : (pemValid(rawPrivateKey) ? 'PEM 头完整且含换行；换行也可写成 \\n' : '缺少 -----BEGIN …----- 头，或换行被压成一行/未转义')
    },
    {
      key: 'WXPAY_PLATFORM_PUBLIC_KEY',
      label: '微信支付公钥（或平台证书）',
      source: platformKey.source,
      status: !rawPlatformKey ? 'missing' : (pemValid(rawPlatformKey) ? 'ok' : 'invalid'),
      masked: maskPem(rawPlatformKey),
      note: !rawPlatformKey ? '未配置：商户平台「API 安全 → 微信支付公钥」下载 pub_key.pem' : (pemValid(rawPlatformKey) ? '用于回调验签，与平台证书模式二选一' : 'PEM 头缺失或换行被压成一行/未转义')
    },
    {
      key: 'WXPAY_PLATFORM_SERIAL',
      label: '平台公钥 ID / 证书序列号',
      source: platformSerialValue.source,
      status: !rawPlatformSerial ? 'missing' : 'ok',
      masked: maskMiddle(rawPlatformSerial, 0, 4),
      note: !rawPlatformSerial ? '未配置：公钥模式填 PUB_KEY_ID_…，证书模式填平台证书序列号' : (rawPlatformSerial.indexOf('PUB_KEY_ID_') === 0 ? '公钥模式' : '平台证书模式')
    },
    {
      key: 'WXPAY_APP_ID',
      label: 'JSAPI 下单 AppID',
      source: rawAppId ? appIdValue.source : (fallbackAppId ? 'env' : ''),
      status: (rawAppId || fallbackAppId) ? 'ok' : 'missing',
      masked: rawAppId || (fallbackAppId ? fallbackAppId + '（回退）' : ''),
      note: rawAppId
        ? '必须是服务号 AppID；网站应用 AppID 不能用于 JSAPI 下单'
        : (fallbackAppId ? '未单独配置，正在回退 SERVICE_ACCOUNT_APP_ID（服务号 AppID）' : '未配置：填服务号 AppID')
    },
    {
      key: 'WXPAY_NOTIFY_URL',
      label: '支付回调地址',
      source: notifyValue.source,
      status: (rawNotify ? (notifyInvalid ? 'invalid' : 'ok') : 'ok'),
      masked: rawNotify || DEFAULT_NOTIFY_URL + '（默认）',
      note: rawNotify
        ? (notifyHasQuery ? 'v3 的 notify_url 不允许带查询串，请改成 /honeyPayNotify 纯路径' : (notifyInvalid ? '必须是 https 地址' : '自定义回调地址'))
        : '未覆盖，使用默认纯路径 /honeyPayNotify'
    },
    {
      key: 'HONEY_TOPUP_PACKS',
      label: '充值档位',
      source: packsValue.source,
      status: !packState.packs.length ? 'missing' : (missingPacks.length || extraPacks.length || packState.reason ? 'invalid' : 'ok'),
      masked: packState.packs.length ? packState.packs.map(item => item.priceYuan + ' 元 / ' + item.totalDrops + ' 滴').join('，') : '',
      note: !packState.packs.length
        ? '未配置或解析失败：' + (packState.reason || '未配置')
        : (missingPacks.length || extraPacks.length
          ? '与已确认 5 档不一致' + (missingPacks.length ? '，缺 ' + missingPacks.map(cents => cents / 100 + ' 元').join('、') : '') + (extraPacks.length ? '，多 ' + extraPacks.map(cents => cents / 100 + ' 元').join('、') : '')
          : '与已确认 5 档一致，滴数 = 金额 × 10')
    }
  ]
  return {
    success: true,
    ready: config.ready,
    rechargeAvailable: state.available,
    rechargeReason: state.reason,
    rechargeError: state.error || '',
    missing: config.missing,
    checkedAt: new Date().toISOString(),
    rate: RATE_DROPS_PER_YUAN,
    mode: rawPlatformSerial.indexOf('PUB_KEY_ID_') === 0 ? 'public_key' : (text(rawPlatformKey) ? 'platform_cert' : 'unconfigured'),
    appId: rawAppId || fallbackAppId,
    notifyUrl: config.notifyUrl,
    items,
    secretStore: secretStoreView(),
    packs: {
      list: packState.packs.map(item => ({ id: item.id, priceYuan: item.priceYuan, drops: item.totalDrops })),
      reason: packState.reason,
      confirmed: packState.packs.length > 0 && missingPacks.length === 0 && extraPacks.length === 0,
      missingYuan: missingPacks.map(cents => cents / 100),
      extraYuan: extraPacks.map(cents => cents / 100)
    }
  }
}

// ============ 平台「支付设置」写入（仅平台负责人，可调用） ============
// 支持逐项保存、逐项清除；页面提交什么就只改什么，未提交的项保持原值。
// 任何返回值都只包含状态、指纹与项名，明文只在云函数内部短暂存在。
function normalizeSecretValue(name, raw) {
  const provided = raw == null ? '' : String(raw)
  if (!provided.trim()) return { ok: false, error: '内容为空' }
  if (provided.length > SECRET_MAX_LENGTH) return { ok: false, error: '内容过长' }
  const value = text(provided)
  if (name === 'WXPAY_MCH_ID' && !/^\d{6,}$/.test(value)) return { ok: false, error: '必须是纯数字商户号' }
  if (name === 'WXPAY_SERIAL_NO' && !/^[0-9A-Za-z]{6,}$/.test(value)) return { ok: false, error: '必须是字母数字组成的证书序列号' }
  if (name === 'WXPAY_APIV3_KEY' && !/^[0-9A-Za-z]{32}$/.test(value)) return { ok: false, error: '必须是 32 位字母数字' }
  if (name === 'WXPAY_PLATFORM_SERIAL' && !/^[0-9A-Za-z_]{4,}$/.test(value)) return { ok: false, error: '应为 PUB_KEY_ID_… 或平台证书序列号' }
  if (name === 'WXPAY_PRIVATE_KEY' || name === 'WXPAY_PLATFORM_PUBLIC_KEY') {
    const pem = normalizePem(provided)
    if (!pem) return { ok: false, error: '缺少 -----BEGIN …----- 头' }
    if (pem.indexOf('\n') < 0) return { ok: false, error: '换行被压成一行，请保留换行或写成 \\n 转义' }
    return { ok: true, value: pem }
  }
  if (name === 'HONEY_TOPUP_PACKS') {
    const state = parsePacks(value)
    if (!state.packs.length) return { ok: false, error: RECHARGE_REASON_TEXTS[state.reason] || '档位格式异常' }
    return { ok: true, value: JSON.stringify(state.packs.map(item => ({ priceCents: item.priceCents, drops: item.drops }))) }
  }
  return { ok: true, value }
}

async function writeSecretAudit(db, operator, action, keys) {
  try {
    await db.collection(SECRET_AUDIT_COLLECTION).add({
      data: {
        action,
        keys: (keys || []).slice(),
        operatorId: text(operator && operator.userId),
        operatorName: text(operator && operator.name),
        ip: text(operator && operator.ip),
        at: new Date()
      }
    })
    return true
  } catch (error) {
    // 审计集合缺失或写入失败只告警，不阻断配置写入（可在控制台补建集合）
    console.warn('[honeyRecharge] 支付配置审计写入失败', text(error.code) || text(error.message))
    return false
  }
}

function secretDocPayload(keys, operator) {
  return {
    keys,
    algorithm: 'aes-256-gcm',
    version: 1,
    kekFingerprint: secretKekFingerprint(),
    updatedAt: new Date(),
    updatedBy: text(operator && operator.userId),
    updatedByName: text(operator && operator.name)
  }
}

async function savePaymentSecretsCore(db, operator, params) {
  if (!secretMasterKey()) fail('PAYMENT_SECRET_KEK_MISSING', '未配置加密主密钥 PAYMENT_SECRET_KEK：请先在云函数环境变量设置一个不少于 16 位的随机字符串，再回到本页保存')
  const input = params && params.secrets && typeof params.secrets === 'object' ? params.secrets : {}
  const names = Object.keys(input).filter(name => SECRET_FIELDS.indexOf(name) >= 0 && text(input[name]))
  if (!names.length) fail('PAYMENT_SECRET_EMPTY', '请至少填写一项要保存的配置')
  const normalized = {}
  for (const name of names) {
    const checked = normalizeSecretValue(name, input[name])
    if (!checked.ok) fail('PAYMENT_SECRET_INVALID', SECRET_LABELS[name] + '：' + checked.error)
    normalized[name] = checked.value
  }
  const existing = await docValue(db, SECRET_COLLECTION, SECRET_DOC_ID)
  const keys = Object.assign({}, (existing && existing.keys) || {})
  const saved = []
  for (const name of names) {
    const sealed = encryptSecret(normalized[name])
    if (!sealed) fail('PAYMENT_SECRET_KEK_MISSING', '加密主密钥不可用，暂不能保存')
    keys[name] = sealed
    saved.push(name)
  }
  try {
    await db.collection(SECRET_COLLECTION).doc(SECRET_DOC_ID).set({ data: secretDocPayload(keys, operator) })
  } catch (error) {
    console.warn('[honeyRecharge] 支付配置写入失败', text(error.code) || text(error.message))
    fail('PAYMENT_SECRET_SAVE_FAILED', '支付配置保存失败，请稍后重试')
  }
  const audited = await writeSecretAudit(db, operator, 'save', saved)
  await ensureSecrets(db, { force: true })
  return { success: true, saved, audited, status: await paymentConfigStatus(db) }
}

async function clearPaymentSecretsCore(db, operator, params) {
  const existing = await docValue(db, SECRET_COLLECTION, SECRET_DOC_ID)
  const all = Boolean(params && params.all === true)
  const requested = Array.isArray(params && params.keys) ? params.keys.map(text).filter(name => SECRET_FIELDS.indexOf(name) >= 0) : []
  if (!existing || !existing.keys || !Object.keys(existing.keys).length) {
    await ensureSecrets(db, { force: true })
    return { success: true, cleared: [], audited: false, status: await paymentConfigStatus(db) }
  }
  if (!all && !requested.length) fail('PAYMENT_SECRET_EMPTY', '请选择要清除的配置项')
  const keys = Object.assign({}, existing.keys)
  const cleared = (all ? Object.keys(keys) : requested).filter(name => keys[name])
  cleared.forEach(name => { delete keys[name] })
  try {
    if (!Object.keys(keys).length) await db.collection(SECRET_COLLECTION).doc(SECRET_DOC_ID).remove()
    else await db.collection(SECRET_COLLECTION).doc(SECRET_DOC_ID).set({ data: secretDocPayload(keys, operator) })
  } catch (error) {
    console.warn('[honeyRecharge] 支付配置清除失败', text(error.code) || text(error.message))
    fail('PAYMENT_SECRET_CLEAR_FAILED', '支付配置清除失败，请稍后重试')
  }
  const audited = await writeSecretAudit(db, operator, 'clear', cleared)
  await ensureSecrets(db, { force: true })
  return { success: true, cleared, audited, status: await paymentConfigStatus(db) }
}

// 对外入口：把异常统一转成 {success:false,code,error}，便于页面直接展示原因。
async function savePaymentSecrets(db, operator, params) {
  try { return await savePaymentSecretsCore(db, operator, params) } catch (error) {
    const code = text(error.code) || 'PAYMENT_SECRET_SAVE_FAILED'
    return failResult(code, text(error.message) || '支付配置保存失败，请稍后重试')
  }
}

async function clearPaymentSecrets(db, operator, params) {
  try { return await clearPaymentSecretsCore(db, operator, params) } catch (error) {
    const code = text(error.code) || 'PAYMENT_SECRET_CLEAR_FAILED'
    return failResult(code, text(error.message) || '支付配置清除失败，请稍后重试')
  }
}

// ============ 时间与单号 ============
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
function timeExpire(date) {
  const shifted = new Date((date ? date.getTime() : Date.now()) + ORDER_EXPIRE_MS + 8 * 3600000)
  return shifted.toISOString().replace(/\.\d{3}Z$/, '+08:00')
}
// 26 位商户单号：HT + 北京时间 + 随机串 + 摘要，符合微信 6-32 位 [0-9A-Za-z_-|*] 要求
function nextOutTradeNo(seed, date) {
  const random = crypto.randomBytes(9).toString('base64').replace(/[^0-9A-Za-z]/g, '').slice(0, 6).toUpperCase()
  const digest = crypto.createHash('sha1').update(text(seed) + '|' + Date.now() + '|' + crypto.randomBytes(12).toString('hex')).digest('hex').slice(0, 4).toUpperCase()
  return 'HT' + beijingStamp(date) + random + digest
}
// 充值流水用确定性文档 ID：同一笔充值并发入账时只有一个能写入成功
function ledgerDocId(outTradeNo) {
  return 'htp-' + crypto.createHash('sha1').update(text(outTradeNo)).digest('hex').slice(0, 24)
}

// ============ 微信支付 APIv3 ============
function apiBase() { return env('WXPAY_API_BASE') || 'https://api.mch.weixin.qq.com' }
function signMessage(config, message) {
  return crypto.createSign('RSA-SHA256').update(message).sign(config.privateKeyPem, 'base64')
}
function authorization(config, method, pathWithQuery, body) {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const nonceStr = crypto.randomBytes(16).toString('hex')
  const message = [method.toUpperCase(), pathWithQuery, timestamp, nonceStr, body || '', ''].join('\n')
  const signature = signMessage(config, message)
  return 'WECHATPAY2-SHA256-RSA2048 mchid="' + config.mchid + '",nonce_str="' + nonceStr +
    '",signature="' + signature + '",timestamp="' + timestamp + '",serial_no="' + config.serialNo + '"'
}

// 统一请求出口：不抛网络错误以外的异常，返回 {status, body}，由调用方决定如何处理
async function wxRequest(config, method, pathWithQuery, payload) {
  const body = payload ? JSON.stringify(payload) : ''
  const headers = {
    Authorization: authorization(config, method, pathWithQuery, body),
    Accept: 'application/json',
    'User-Agent': 'sxf-football-honey/1'
  }
  if (body) headers['Content-Type'] = 'application/json'
  let response
  try {
    response = await fetch(apiBase() + pathWithQuery, { method, headers, body: body || undefined, signal: AbortSignal.timeout(15000) })
  } catch (error) {
    fail('PAYMENT_UNAVAILABLE', '微信支付连接失败，请稍后重试')
  }
  const raw = await response.text()
  let parsed = null
  try { parsed = raw ? JSON.parse(raw) : null } catch (error) { parsed = null }
  if (!response.ok) {
    // 只记录状态码与微信错误码，不打印报文、密钥、OpenID
    console.warn('[honeyRecharge] wxpay 请求失败', method, pathWithQuery.split('?')[0], response.status, text(parsed && parsed.code))
  }
  return { status: response.status, body: parsed }
}

function payParams(config, prepayId) {
  const timeStamp = String(Math.floor(Date.now() / 1000))
  const nonceStr = crypto.randomBytes(16).toString('hex')
  const packageValue = 'prepay_id=' + prepayId
  const message = [config.appId, timeStamp, nonceStr, packageValue, ''].join('\n')
  return { appId: config.appId, timeStamp, nonceStr, package: packageValue, signType: 'RSA', paySign: signMessage(config, message) }
}

async function createPrepay(config, order) {
  const reply = await wxRequest(config, 'POST', '/v3/pay/transactions/jsapi', {
    appid: config.appId,
    mchid: config.mchid,
    description: ('赛小蜂足球蜂蜜充值 ' + order.totalDrops + ' 滴').slice(0, 127),
    out_trade_no: order.outTradeNo,
    notify_url: config.notifyUrl,
    amount: { total: order.priceCents, currency: 'CNY' },
    payer: { openid: order.openId },
    attach: 'honey-topup',
    time_expire: timeExpire()
  })
  if (reply.status !== 200) fail('PAYMENT_REQUEST_FAILED', '微信支付下单失败，请稍后重试')
  const prepayId = text(reply.body && reply.body.prepay_id)
  if (!prepayId) fail('PAYMENT_REQUEST_FAILED', '微信支付下单失败，请稍后重试')
  return prepayId
}

async function queryTransaction(config, outTradeNo) {
  const path = '/v3/pay/transactions/out-trade-no/' + encodeURIComponent(outTradeNo) + '?mchid=' + encodeURIComponent(config.mchid)
  return wxRequest(config, 'GET', path, null)
}

// 回调/查单的入账前置校验：商户号、AppID、金额、付款人必须与下单快照完全一致
function verifyPaidTrade(config, order, trade) {
  if (text(trade.mchid) !== config.mchid) fail('HONEY_ORDER_MISMATCH', '商户号不一致，已拒绝入账')
  if (text(trade.appid) !== config.appId) fail('HONEY_ORDER_MISMATCH', '支付应用不一致，已拒绝入账')
  if (text(trade.out_trade_no) !== text(order.outTradeNo)) fail('HONEY_ORDER_MISMATCH', '订单号不一致，已拒绝入账')
  const amount = trade.amount || {}
  const total = Number(amount.total)
  const currency = text(amount.currency || 'CNY')
  if (total !== Number(order.priceCents) || currency !== 'CNY') fail('HONEY_AMOUNT_MISMATCH', '支付金额与订单不符，已拒绝入账')
  const payer = trade.payer || {}
  if (text(order.openId) && text(payer.openid) !== text(order.openId)) fail('HONEY_ORDER_MISMATCH', '付款账号与下单账号不一致，已拒绝入账')
  if (!text(trade.transaction_id)) fail('HONEY_TRANSACTION_MISSING', '缺少微信支付单号，暂不能入账')
  return true
}

// ============ 回调验签与解密 ============
function verifyNotifySignature(config, input) {
  const headers = input || {}
  if (!config.platformPublicKeyPem) return { ok: false, code: 'PAYMENT_VERIFY_NOT_CONFIGURED' }
  const timestamp = text(headers.timestamp), nonce = text(headers.nonce), signature = text(headers.signature)
  if (!timestamp || !nonce || !signature) return { ok: false, code: 'PAYMENT_SIGNATURE_MISSING' }
  if (config.platformSerial && text(headers.serial) && text(headers.serial) !== config.platformSerial) return { ok: false, code: 'PAYMENT_PLATFORM_SERIAL_MISMATCH' }
  const seconds = Number(timestamp)
  if (!Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > NOTIFY_TOLERANCE_SEC) return { ok: false, code: 'PAYMENT_TIMESTAMP_INVALID' }
  // 回调签名覆盖的是原始报文：不能 trim，否则改动空白字节也能通过验签。
  const rawBody = headers.rawBody == null ? '' : String(headers.rawBody)
  const message = [timestamp, nonce, rawBody, ''].join('\n')
  let valid = false
  try { valid = crypto.createVerify('RSA-SHA256').update(message).verify(config.platformPublicKeyPem, signature, 'base64') } catch (error) { valid = false }
  return valid ? { ok: true, code: '' } : { ok: false, code: 'PAYMENT_SIGNATURE_INVALID' }
}

function decryptResource(apiV3Key, resource) {
  const key = Buffer.from(text(apiV3Key), 'utf8')
  if (key.length !== 32) fail('PAYMENT_RESOURCE_INVALID', '支付回调密钥未配置')
  if (!resource || text(resource.algorithm) !== 'AEAD_AES_256_GCM') fail('PAYMENT_RESOURCE_INVALID', '支付回调解密方式不支持')
  const nonce = text(resource.nonce), associated = text(resource.associated_data)
  const sealed = Buffer.from(text(resource.ciphertext), 'base64')
  if (!nonce || sealed.length <= 16) fail('PAYMENT_RESOURCE_INVALID', '支付回调报文异常')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'utf8'))
  if (associated) decipher.setAAD(Buffer.from(associated, 'utf8'))
  decipher.setAuthTag(sealed.subarray(sealed.length - 16))
  const plain = Buffer.concat([decipher.update(sealed.subarray(0, sealed.length - 16)), decipher.final()])
  let parsed
  try { parsed = JSON.parse(plain.toString('utf8')) } catch (error) { fail('PAYMENT_RESOURCE_INVALID', '支付回调内容无法解析') }
  if (!parsed || typeof parsed !== 'object') fail('PAYMENT_RESOURCE_INVALID', '支付回调内容异常')
  return parsed
}

function lowerHeaders(event) {
  const source = Object.assign({}, event && event.headers, event && event.header)
  const result = {}
  Object.keys(source || {}).forEach(key => { result[String(key).toLowerCase()] = text(source[key]) })
  return result
}

function rawBodyOf(event) {
  const body = event && event.body
  if (Buffer.isBuffer(body)) return body.toString('utf8')
  if (typeof body === 'string') {
    if (event.isBase64Encoded) { try { return Buffer.from(body, 'base64').toString('utf8') } catch (error) { return '' } }
    return body
  }
  return ''
}

// ============ 订单读写 ============
function missingDoc(error) {
  const cause = (error && (error.cause || error)) || {}
  return /document[^\n]*(?:not exist|not found|does not exist)|文档不存在|记录不存在/i.test(String(cause.message || cause.errMsg || cause.errCode || ''))
}

async function docValue(dbOrTx, collectionName, id) {
  try {
    const reply = await dbOrTx.collection(collectionName).doc(text(id)).get()
    const data = Array.isArray(reply && reply.data) ? reply.data[0] : (reply && reply.data)
    return data && Object.keys(data).length ? data : null
  } catch (error) {
    if (missingCollection(error) || missingDoc(error)) return null
    throw error
  }
}

async function getOrder(db, outTradeNo) {
  const order = await docValue(db, ORDER_COLLECTION, outTradeNo)
  if (!order || !text(order.outTradeNo)) return null
  return order
}

function viewOf(order) {
  const status = text(order.status) || 'pending'
  const ledgerState = text(order.ledgerState) || 'pending'
  let statusLabel = STATUS_LABELS[status] || '状态待确认'
  if (status === 'paid' && ledgerState === 'blocked') statusLabel = '已支付·待入账'
  return {
    outTradeNo: text(order.outTradeNo),
    priceCents: Number(order.priceCents) || 0,
    priceYuan: Number(order.priceCents) / 100,
    drops: Number(order.drops) || 0,
    bonusDrops: Number(order.bonusDrops) || 0,
    totalDrops: Number(order.totalDrops) || 0,
    status,
    statusLabel,
    ledgerState,
    createdAt: timeValue(order.createdAt),
    paidAt: timeValue(order.paidAt),
    closedAt: timeValue(order.closedAt)
  }
}

// 订单列表只返回当前 OpenID 自己的订单；按创建时间倒序，最多 limit 条。
// strict=true 时读取失败直接抛出（订单面板要明确报错），否则用于首页钱包等旁路展示，读不到就当空列表。
async function listOrders(db, serviceAccountOpenId, limit, strict) {
  const openId = text(serviceAccountOpenId)
  if (!openId) return []
  const size = Math.min(Math.max(Number(limit) || 20, 1), 50)
  try {
    const rows = await readAll(db, ORDER_COLLECTION, { openId }, {
      fields: { outTradeNo: true, priceCents: true, drops: true, bonusDrops: true, totalDrops: true, status: true, ledgerState: true, createdAt: true, paidAt: true, closedAt: true, prepayId: true, prepayCreatedAt: true },
      maxRows: 300
    })
    return rows.map(viewOf).sort((left, right) => right.createdAt - left.createdAt || right.outTradeNo.localeCompare(left.outTradeNo)).slice(0, size)
  } catch (error) {
    if (strict) throw error
    console.warn('[honeyRecharge] 订单读取失败', text(error.code) || text(error.message))
    return []
  }
}

async function closeOrderDoc(db, outTradeNo, reason, errorCode) {
  try {
    await db.collection(ORDER_COLLECTION).doc(text(outTradeNo)).update({
      data: { status: 'closed', ledgerState: 'pending', closeReason: text(reason).slice(0, 40), closeError: text(errorCode).slice(0, 40), closedAt: new Date(), updatedAt: new Date() }
    })
  } catch (error) { console.warn('[honeyRecharge] 关闭订单失败', text(error.code) || text(error.message)) }
}

// 复用仍在有效期内的待支付订单，避免用户连点生成一堆订单
async function findReusableOrder(db, openId, pack) {
  const now = Date.now()
  try {
    const rows = await readAll(db, ORDER_COLLECTION, { openId }, {
      fields: { outTradeNo: true, openId: true, priceCents: true, drops: true, bonusDrops: true, totalDrops: true, status: true, ledgerState: true, prepayId: true, createdAt: true, prepayCreatedAt: true },
      maxRows: 120
    })
    const candidates = rows.filter(row => text(row.status) === 'pending' && text(row.prepayId) &&
      Number(row.priceCents) === pack.priceCents && Number(row.totalDrops) === pack.totalDrops &&
      now - timeValue(row.createdAt) <= PENDING_REUSE_MS && now - timeValue(row.prepayCreatedAt || row.createdAt) <= PREPAY_REUSE_MS)
    if (!candidates.length) return null
    candidates.sort((left, right) => timeValue(right.createdAt) - timeValue(left.createdAt))
    return candidates[0]
  } catch (error) {
    console.warn('[honeyRecharge] 待支付订单读取失败', text(error.code) || text(error.message))
    return null
  }
}

// ============ 账本入账（唯一事实来源 + 镜像同事务） ============
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
  } catch (error) { console.warn('[honeyRecharge] 订单状态回写失败', text(error.code) || text(error.message)) }
}

// 事务内：写一条正数流水 + 镜像加同额 + 订单置 paid；以 refId 与确定性流水 ID 幂等。
// 镜像与账本合计不一致时抛 HONEY_RECONCILING，不写任何数据。
async function creditOrder(db, order, transactionId, source) {
  const outTradeNo = text(order.outTradeNo)
  const openId = text(order.openId)
  const totalDrops = Number(order.totalDrops)
  if (!outTradeNo) fail('HONEY_ORDER_INVALID', '订单号缺失，请联系客服')
  if (!openId) fail('HONEY_ORDER_INVALID', '订单缺少账户归属，请联系客服')
  if (!Number.isSafeInteger(totalDrops) || totalDrops <= 0) fail('HONEY_ORDER_INVALID', '订单滴数异常，请联系客服')
  if (!text(transactionId)) fail('HONEY_TRANSACTION_MISSING', '缺少微信支付单号，暂不能入账')
  const refId = LEDGER_REF_PREFIX + outTradeNo
  const ledgerId = ledgerDocId(outTradeNo)

  const profile = await fanProfile(db, openId)
  const rows = await ledgerRows(db, openId)
  const balance = sumOf(rows)
  if (!Number.isSafeInteger(balance) || balance < 0) fail('HONEY_LEDGER_INVALID', '蜂蜜账本余额异常，请联系平台处理')
  const mirror = Number(profile.honeyBalance)
  if (!Number.isSafeInteger(mirror) || mirror < 0 || mirror !== balance) fail('HONEY_RECONCILING', '蜂蜜余额待核对，请稍后重试')

  // 账本里已经存在这笔充值：只补订单状态，绝不重复加滴
  if (rows.some(row => text(row.refId) === refId || text(row._id) === ledgerId)) {
    await markPaid(db, outTradeNo, transactionId, source, { ledgerState: 'credited', ledgerId, ledgerRefId: refId })
    return { credited: false, deduped: true, balance }
  }

  const profileId = text(profile._id)
  let result = { credited: false, deduped: false, balance }
  try {
    await db.runTransaction(async transaction => {
      const currentOrder = await docValue(transaction, ORDER_COLLECTION, outTradeNo)
      if (!currentOrder) fail('HONEY_ORDER_NOT_FOUND', '订单不存在')
      const orderStatus = text(currentOrder.status)
      if (orderStatus === 'refunded') fail('HONEY_ORDER_STATE_INVALID', '订单已退款，不能再入账')
      if (orderStatus === 'paid' && text(currentOrder.ledgerState) === 'credited') {
        result = { credited: false, deduped: true, balance }
        return
      }
      if (Number(currentOrder.totalDrops) !== totalDrops || Number(currentOrder.priceCents) !== Number(order.priceCents)) {
        fail('HONEY_ORDER_MISMATCH', '订单快照不一致，已拒绝入账')
      }
      const duplicate = await docValue(transaction, LEDGER_COLLECTION, ledgerId)
      const currentProfile = await docValue(transaction, PROFILE_COLLECTION, profileId)
      if (!currentProfile || text(currentProfile.serviceAccountOpenId) !== openId) fail('HONEY_ACCOUNT_CONFLICT', '蜂蜜账户已变化，请稍后重试')
      const currentMirror = Number(currentProfile.honeyBalance)
      if (!Number.isSafeInteger(currentMirror) || currentMirror < 0) fail('HONEY_RECONCILING', '蜂蜜余额待核对，请稍后重试')
      if (currentMirror !== balance) fail('HONEY_RECONCILING', '蜂蜜余额待核对，请稍后重试')
      if (!duplicate) {
        await transaction.collection(PROFILE_COLLECTION).doc(profileId).update({
          data: { honeyBalance: currentMirror + totalDrops, honeyWalletUpdatedAt: db.serverDate() }
        })
        await transaction.collection(LEDGER_COLLECTION).doc(ledgerId).set({
          data: {
            serviceAccountOpenId: openId, delta: totalDrops, reason: LEDGER_REASON_TOPUP, refId, attempt: 1,
            sessionId: '', outTradeNo, transactionId: text(transactionId), source: text(source) || 'notify',
            createTime: db.serverDate()
          }
        })
      }
      await transaction.collection(ORDER_COLLECTION).doc(outTradeNo).update({
        data: {
          status: 'paid', ledgerState: 'credited', ledgerId, ledgerRefId: refId,
          transactionId: text(transactionId), paidAt: new Date(), paidSource: text(source) || 'notify', updatedAt: new Date()
        }
      })
      result = duplicate
        ? { credited: false, deduped: true, balance }
        : { credited: true, deduped: false, balance: balance + totalDrops }
    })
  } catch (error) {
    const code = text(error.code)
    // 账本待核对 / 并发冲突：订单保留待入账痕迹，等下次查单重试，绝不按任意一侧强行加滴
    if (code === 'HONEY_RECONCILING' || code === 'HONEY_LEDGER_INVALID' || code === 'HONEY_ACCOUNT_CONFLICT') {
      try {
        await db.collection(ORDER_COLLECTION).doc(outTradeNo).update({
          data: { ledgerState: 'blocked', ledgerError: code, transactionId: text(transactionId), paidAt: new Date(), updatedAt: new Date() }
        })
      } catch (writeError) { console.warn('[honeyRecharge] 待入账标记失败', text(writeError.code) || text(writeError.message)) }
    }
    throw error
  }
  return result
}

// 查单复核后再入账：回调与主动查单共用这一条路径
async function confirmOrder(db, outTradeNo, source) {
  await ensureSecrets(db)
  const config = paymentConfig()
  if (!config.ready) fail('PAYMENT_NOT_CONFIGURED', '微信支付尚未开通')
  const order = await getOrder(db, outTradeNo)
  if (!order) fail('HONEY_ORDER_NOT_FOUND', '订单不存在')
  const status = text(order.status)
  if (status === 'paid' && text(order.ledgerState) === 'credited') return { order, state: 'paid', credited: false }
  if (status === 'refunded') return { order, state: 'refunded', credited: false }
  const reply = await queryTransaction(config, outTradeNo)
  if (reply.status === 404) return { order, state: 'unknown', credited: false }
  if (reply.status !== 200) fail('PAYMENT_UNAVAILABLE', '微信支付查单失败，请稍后重试')
  const trade = reply.body || {}
  if (text(trade.out_trade_no) && text(trade.out_trade_no) !== text(outTradeNo)) fail('HONEY_ORDER_MISMATCH', '订单号不一致，已拒绝入账')
  const tradeState = text(trade.trade_state)
  if (tradeState === 'SUCCESS') {
    verifyPaidTrade(config, order, trade)
    const credited = await creditOrder(db, order, trade.transaction_id, source)
    const latest = await getOrder(db, outTradeNo)
    return { order: latest || order, state: 'paid', credited: credited.credited, balance: credited.balance }
  }
  if (['CLOSED', 'REVOKED', 'PAYERROR'].includes(tradeState)) {
    await closeOrderDoc(db, outTradeNo, tradeState)
    return { order: Object.assign({}, order, { status: 'closed' }), state: 'closed', credited: false }
  }
  return { order, state: tradeState || 'pending', credited: false }
}

// ============ 回调入口（唯一入账点） ============
// 返回 {statusCode, body}，由 webLoginApi 原样写给微信支付；验签失败不入账、不写订单。
async function handleNotify(event, db) {
  await ensureSecrets(db)
  const config = paymentConfig()
  if (!config.ready) {
    console.warn('[honeyRecharge] 回调到达但支付未配置')
    return { statusCode: 500, body: { code: 'FAIL', message: '支付未配置' } }
  }
  const headers = lowerHeaders(event)
  const rawBody = rawBodyOf(event)
  if (!rawBody) return { statusCode: 400, body: { code: 'FAIL', message: '请求体为空' } }
  const verified = verifyNotifySignature(config, {
    timestamp: headers['wechatpay-timestamp'], nonce: headers['wechatpay-nonce'],
    signature: headers['wechatpay-signature'], serial: headers['wechatpay-serial'], rawBody
  })
  if (!verified.ok) {
    console.warn('[honeyRecharge] 回调验签失败', verified.code)
    return { statusCode: 401, body: { code: 'FAIL', message: '签名验证失败' } }
  }
  let envelope
  try { envelope = JSON.parse(rawBody) } catch (error) { return { statusCode: 400, body: { code: 'FAIL', message: '报文无法解析' } } }
  const eventType = text(envelope && envelope.event_type)
  if (eventType && eventType !== 'TRANSACTION.SUCCESS') return { statusCode: 200, body: { code: 'SUCCESS', message: '已忽略' } }
  let trade
  try {
    trade = decryptResource(config.apiV3Key, envelope && envelope.resource)
  } catch (error) {
    console.warn('[honeyRecharge] 回调解密失败', text(error.code) || text(error.message))
    return { statusCode: 500, body: { code: 'FAIL', message: '回调解密失败' } }
  }
  const outTradeNo = text(trade.out_trade_no || trade.outTradeNo)
  if (!outTradeNo) return { statusCode: 400, body: { code: 'FAIL', message: '订单号缺失' } }
  try {
    const result = await confirmOrder(db, outTradeNo, 'notify')
    const order = result.order || {}
    if (order.outTradeNo) {
      try {
        await db.collection(ORDER_COLLECTION).doc(order.outTradeNo).update({
          data: { notifyCount: Number(order.notifyCount || 0) + 1, lastNotifyAt: new Date() }
        })
      } catch (error) { console.warn('[honeyRecharge] 回调计数回写失败', text(error.code) || text(error.message)) }
    }
    return { statusCode: 200, body: { code: 'SUCCESS', message: '成功' } }
  } catch (error) {
    const code = text(error.code) || 'HONEY_CREDIT_FAILED'
    console.warn('[honeyRecharge] 回调入账失败', code)
    const permanent = ['HONEY_ORDER_MISMATCH', 'HONEY_AMOUNT_MISMATCH', 'HONEY_TRANSACTION_MISSING', 'HONEY_ORDER_STATE_INVALID', 'HONEY_ORDER_INVALID'].includes(code)
    return permanent
      ? { statusCode: 400, body: { code: 'FAIL', message: '订单校验失败，请联系客服' } }
      : { statusCode: 500, body: { code: 'FAIL', message: '处理失败，请重试' } }
  }
}

// ============ 退款（规则未确认，默认关闭） ============
// 只写负数冲销流水 + 订单置 refunded；不删除、不改写原充值流水。
// 必须显式设置 HONEY_TOPUP_REFUND_ENABLED=true，且不对外开放 HTTP action。
async function refundOrder(db, params) {
  if (text(process.env.HONEY_TOPUP_REFUND_ENABLED).toLowerCase() !== 'true') fail('HONEY_REFUND_NOT_ENABLED', '退款功能尚未开放')
  await ensureSecrets(db)
  const config = paymentConfig()
  if (!config.ready) fail('PAYMENT_NOT_CONFIGURED', '微信支付尚未开通')
  const outTradeNo = text(params && params.outTradeNo)
  const order = await getOrder(db, outTradeNo)
  if (!order) fail('HONEY_ORDER_NOT_FOUND', '订单不存在')
  if (text(order.status) !== 'paid' || text(order.ledgerState) !== 'credited') fail('HONEY_ORDER_STATE_INVALID', '只有已入账订单可以退款')
  const openId = text(order.openId)
  const totalDrops = Number(order.totalDrops)
  const profile = await fanProfile(db, openId)
  const rows = await ledgerRows(db, openId)
  const balance = sumOf(rows)
  const mirror = Number(profile.honeyBalance)
  if (!Number.isSafeInteger(balance) || balance < 0) fail('HONEY_LEDGER_INVALID', '蜂蜜账本余额异常，请联系平台处理')
  if (!Number.isSafeInteger(mirror) || mirror < 0 || mirror !== balance) fail('HONEY_RECONCILING', '蜂蜜余额待核对，请稍后重试')
  // 已消耗的部分无法冲销成负数：先拒绝，避免账本出现负余额
  if (balance < totalDrops) fail('HONEY_REFUND_INSUFFICIENT', '这笔充值已被使用，不能直接退款，请联系客服人工处理')
  const outRefundNo = ('RF' + outTradeNo).slice(0, 32)
  const reply = await wxRequest(config, 'POST', '/v3/refund/domestic/refunds', {
    out_trade_no: outTradeNo,
    out_refund_no: outRefundNo,
    reason: text(params && params.reason).slice(0, 80) || '蜂蜜充值退款',
    amount: { refund: Number(order.priceCents), total: Number(order.priceCents), currency: 'CNY' }
  })
  if (reply.status !== 200) fail('PAYMENT_REFUND_FAILED', '微信退款失败，请稍后重试')
  const refundId = text(reply.body && reply.body.refund_id)
  const refundRefId = LEDGER_REFUND_REF_PREFIX + outTradeNo
  const profileId = text(profile._id)
  await db.runTransaction(async transaction => {
    const currentProfile = await docValue(transaction, PROFILE_COLLECTION, profileId)
    const currentOrder = await docValue(transaction, ORDER_COLLECTION, outTradeNo)
    if (!currentProfile || text(currentProfile.serviceAccountOpenId) !== openId) fail('HONEY_ACCOUNT_CONFLICT', '蜂蜜账户已变化，请稍后重试')
    if (!currentOrder || text(currentOrder.status) === 'refunded') return
    const currentMirror = Number(currentProfile.honeyBalance)
    if (!Number.isSafeInteger(currentMirror) || currentMirror < 0 || currentMirror !== balance) fail('HONEY_RECONCILING', '蜂蜜余额待核对，请稍后重试')
    await transaction.collection(PROFILE_COLLECTION).doc(profileId).update({
      data: { honeyBalance: currentMirror - totalDrops, honeyWalletUpdatedAt: db.serverDate() }
    })
    await transaction.collection(LEDGER_COLLECTION).add({
      data: {
        serviceAccountOpenId: openId, delta: -totalDrops, reason: LEDGER_REASON_REFUND, refId: refundRefId, attempt: 1,
        sessionId: '', outTradeNo, refundId, createTime: db.serverDate()
      }
    })
    await transaction.collection(ORDER_COLLECTION).doc(outTradeNo).update({
      data: { status: 'refunded', ledgerState: 'credited', refundId, refundedAt: new Date(), updatedAt: new Date() }
    })
  })
  return { success: true, outTradeNo, refundId, dropped: totalDrops }
}

// ============ 个人中心入口 ============
async function createOrder(db, actor, event) {
  await ensureSecrets(db)
  const state = rechargeState()
  if (!state.available) return failResult(state.reason || 'PAYMENT_NOT_CONFIGURED', state.error || '充值暂不可用，请稍后重试')
  const platform = text(event && event.clientPlatform).toLowerCase()
  // 合规：iOS 端不得售卖虚拟滴，客户端与服务端双重拦截
  if (platform === 'ios') return failResult('IOS_VIRTUAL_PAYMENT_RESTRICTED', RECHARGE_REASON_TEXTS.IOS_VIRTUAL_PAYMENT_RESTRICTED)
  const config = paymentConfig()
  const pack = state.packs.find(item => item.id === text(event && event.packId)) || null
  if (!pack) return failResult('HONEY_PACK_INVALID', '请选择有效的充值档位')
  // 先确认账户可核对，避免付款后无法入账
  let walletState
  try {
    walletState = await require('./honeyWallet.cjs').readHoney(db, actor.openId)
  } catch (error) {
    return failResult(text(error.code) || 'HONEY_UNAVAILABLE', text(error.message) || '蜂蜜账户暂不可用，请稍后重试')
  }
  const reusable = await findReusableOrder(db, actor.openId, pack)
  if (reusable) {
    return { success: true, reused: true, order: viewOf(reusable), payParams: payParams(config, reusable.prepayId), balance: walletState.balance }
  }
  const now = new Date()
  let outTradeNo = ''
  for (let attempt = 0; attempt < 4 && !outTradeNo; attempt += 1) {
    const candidate = nextOutTradeNo(actor.openId, now)
    const existing = await getOrder(db, candidate)
    if (!existing) outTradeNo = candidate
  }
  if (!outTradeNo) return failResult('HONEY_ORDER_INVALID', '订单创建失败，请稍后重试')
  const priceSnapshot = { priceCents: pack.priceCents, drops: pack.drops, bonusDrops: pack.bonusDrops, totalDrops: pack.totalDrops, rate: RATE_DROPS_PER_YUAN, packId: pack.id }
  const order = {
    outTradeNo, openId: actor.openId, userId: actor.userId, profileId: text(walletState.profileId),
    packId: pack.id, priceCents: pack.priceCents, drops: pack.drops, bonusDrops: pack.bonusDrops, totalDrops: pack.totalDrops,
    priceSnapshot, status: 'pending', ledgerState: 'pending', transactionId: '', prepayId: '',
    appId: config.appId, clientPlatform: platform || 'unknown',
    createdAt: now, updatedAt: now, paidAt: null, closedAt: null, notifyCount: 0
  }
  try {
    await db.collection(ORDER_COLLECTION).doc(outTradeNo).set({ data: order })
  } catch (error) {
    console.warn('[honeyRecharge] 订单写入失败', text(error.code) || text(error.message))
    return failResult(missingCollection(error) ? 'HONEY_RECHARGE_UNAVAILABLE' : 'HONEY_ORDER_INVALID', '充值暂不可用，请联系客服')
  }
  let prepayId
  try {
    prepayId = await createPrepay(config, order)
  } catch (error) {
    await closeOrderDoc(db, outTradeNo, 'prepay_failed', text(error.code))
    return failResult(text(error.code) || 'PAYMENT_UNAVAILABLE', text(error.message) || '微信支付暂不可用，请稍后重试')
  }
  try {
    await db.collection(ORDER_COLLECTION).doc(outTradeNo).update({ data: { prepayId, prepayCreatedAt: now, updatedAt: new Date() } })
  } catch (error) {
    console.warn('[honeyRecharge] 预支付单号回写失败', text(error.code) || text(error.message))
  }
  return { success: true, reused: false, order: viewOf(Object.assign({}, order, { prepayId })), payParams: payParams(config, prepayId), balance: walletState.balance }
}

async function orderStatus(db, openId, event) {
  await ensureSecrets(db)
  const outTradeNo = text(event && event.outTradeNo)
  if (!/^[0-9A-Za-z_-]{6,32}$/.test(outTradeNo)) return failResult('HONEY_ORDER_INVALID', '订单号无效')
  const order = await getOrder(db, outTradeNo)
  // 不属于当前账号的订单一律按不存在处理，不泄露他人订单
  if (!order || text(order.openId) !== openId) return failResult('HONEY_ORDER_NOT_FOUND', '订单不存在')
  let current = order
  if (text(order.status) === 'pending') {
    try {
      const result = await confirmOrder(db, outTradeNo, 'client')
      current = result.order || order
    } catch (error) {
      // 查单失败只返回当前状态，前端不会因为这里失败就当成已到账
      console.warn('[honeyRecharge] 主动查单失败', text(error.code) || text(error.message))
    }
  }
  const balance = await safeBalance(db, openId)
  return { success: true, order: viewOf(current), balance, recharge: publicRechargeState() }
}

async function safeBalance(db, openId) {
  try {
    const wallet = await require('./honeyWallet.cjs').readHoney(db, openId)
    return wallet.balance
  } catch (error) { return null }
}

function create({ db, user, session }) {
  const openId = text(session && session.serviceAccountOpenId)
  const userId = text(user && user._id)
  return async function handle(action, event) {
    try {
      if (!openId) return failResult('SERVICE_PRIVATE_AUTH_REQUIRED', '请重新连接微信')
      // 充值态与档位可能来自数据库密文，先刷新一次配置缓存（失败时按环境变量回退）
      await ensureSecrets(db)
      if (action === 'servicePrivateHoneyRecharge') return await createOrder(db, { openId, userId }, event || {})
      if (action === 'servicePrivateHoneyOrders') {
        const rows = await listOrders(db, openId, 30, true)
        return { success: true, rows, recharge: publicRechargeState(), balance: await safeBalance(db, openId) }
      }
      if (action === 'servicePrivateHoneyOrderStatus') return await orderStatus(db, openId, event || {})
      return failResult('HONEY_RECHARGE_ACTION_INVALID', '操作不可用，请重新打开')
    } catch (error) {
      const code = text(error.code) || 'HONEY_RECHARGE_FAILED'
      if (!code.startsWith('HONEY_') && !code.startsWith('PAYMENT_') && code !== 'IOS_VIRTUAL_PAYMENT_RESTRICTED') {
        console.warn('[honeyRecharge] 充值操作失败', code)
      }
      return failResult(code, text(error.message) || '充值操作失败，请稍后重试')
    }
  }
}

module.exports = {
  create,
  handleNotify,
  rechargeState,
  publicRechargeState,
  paymentConfigStatus,
  savePaymentSecrets,
  clearPaymentSecrets,
  ensureSecrets,
  listOrders,
  refundOrder,
  __internals: { paymentConfig, parsePacks, verifyNotifySignature, decryptResource, verifyPaidTrade, authorization, creditOrder, confirmOrder, nextOutTradeNo, ledgerDocId, viewOf, normalizeSecretValue, encryptSecret, decryptSecret, secretMasterKey, secretValue, secretSource }
}
