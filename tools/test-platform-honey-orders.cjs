'use strict'
// 平台运营中心「蜂蜜充值」只读数据自检：鉴权、收款汇总、订单筛选分页、详情与账本一致性。
// 不联网、不读凭据：用假的 wx-server-sdk + 内存数据库驱动 platformOwner 的 main。
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const Module = require('node:module')

const TOKEN = 'honey-test-token'
const TOKEN_HASH = crypto.createHash('sha256').update(TOKEN).digest('hex')

function matchRow(row, condition) {
  if (!condition || typeof condition !== 'object') return true
  if (condition.__op === 'or') return (condition.parts || []).some(part => matchRow(row, part))
  return Object.entries(condition).every(([field, expected]) => {
    if (expected && expected.__op === 'gt') return Number(row[field] instanceof Date ? row[field].getTime() : row[field]) > Number(expected.value instanceof Date ? expected.value.getTime() : expected.value)
    if (expected && expected.__op === 'or') return (expected.parts || []).some(part => matchRow(row[field], part))
    return row[field] === expected
  })
}

function fakeDb(collections) {
  const store = name => {
    if (!Object.prototype.hasOwnProperty.call(collections, name)) {
      const error = new Error('collection not exist: ' + name)
      throw error
    }
    return collections[name]
  }
  function writer(name, target) {
    const rows = target || store(name)
    return {
      async add(options) {
        const data = Object.assign({}, (options && options.data) || {})
        const id = data._id || 'auto-' + Object.keys(rows).length + '-' + Date.now()
        delete data._id
        if (Object.prototype.hasOwnProperty.call(rows, id)) {
          const error = new Error('duplicate key: ' + id)
          error.code = 'DUPLICATE'
          throw error
        }
        rows[id] = data
        return { _id: id }
      }
    }
  }
  function collectionApi(name) {
    const readAll = (condition, orderField, orderDir, size) => {
      const rows = store(name)
      let list = Object.keys(rows)
        .map(id => Object.assign({ _id: id }, rows[id]))
        .filter(row => matchRow(row, condition))
      if (orderField) {
        list = list.slice().sort((left, right) => {
          const a = left[orderField] instanceof Date ? left[orderField].getTime() : left[orderField]
          const b = right[orderField] instanceof Date ? right[orderField].getTime() : right[orderField]
          return (Number(a) - Number(b)) * (orderDir === 'desc' ? -1 : 1)
        })
      }
      if (size) list = list.slice(0, size)
      return { data: list }
    }
    return {
      doc(id) {
        return {
          async get() {
            const rows = store(name)
            if (!Object.prototype.hasOwnProperty.call(rows, id)) throw new Error('document not exist')
            return { data: Object.assign({ _id: id }, rows[id]) }
          },
          async update(options) {
            const rows = store(name)
            if (!Object.prototype.hasOwnProperty.call(rows, id)) throw new Error('document not exist')
            rows[id] = Object.assign({}, rows[id], (options && options.data) || {})
            return { updated: 1 }
          }
        }
      },
      add: writer(name).add,
      where(condition) {
        const api = {
          orderBy() { return api },
          limit() { return api },
          async get() { return readAll(condition, null, 'asc', 0) }
        }
        return api
      },
      orderBy(field, direction) {
        const api = {
          limit(size) { api.__size = size; return api },
          async get() { return readAll(null, field, direction, api.__size) }
        }
        return api
      }
    }
  }
  const transaction = { collection: collectionApi }
  return {
    command: { gt: value => ({ __op: 'gt', value }), or: parts => ({ __op: 'or', parts }) },
    serverDate: () => new Date(),
    runTransaction: async work => work(transaction),
    collection: collectionApi
  }
}

let activeCollections = {}
const originalLoad = Module._load
Module._load = function (request) {
  if (request === 'wx-server-sdk') {
    return {
      SYMBOL_CURRENT_ENV: 'test-env',
      init() {},
      getWXContext() { return {} },
      database() { return fakeDb(activeCollections) }
    }
  }
  return originalLoad.apply(this, arguments)
}
const platformOwner = require('../cloudfunctions/platformOwner/index.js')
Module._load = originalLoad

const now = Date.now()
const ORDER_ROWS = {
  HT20261027000001AAA: {
    outTradeNo: 'HT20261027000001AAA', openId: 'oXyZ1234567890abcd', userId: 'user-000001', profileId: 'profile-1',
    packId: 'pack-1000', priceCents: 1000, drops: 100, bonusDrops: 0, totalDrops: 100,
    status: 'paid', ledgerState: 'credited', transactionId: '4200000000000000000001', notifyCount: 2,
    clientPlatform: 'wechat-h5', createdAt: new Date(now - 60 * 1000), paidAt: new Date(now - 50 * 1000)
  },
  HT20261027000002BBB: {
    outTradeNo: 'HT20261027000002BBB', openId: 'oAbc1234567890efgh', userId: 'user-000002', profileId: 'profile-2',
    packId: 'pack-1000', priceCents: 1000, drops: 100, bonusDrops: 0, totalDrops: 100,
    status: 'pending', ledgerState: 'pending', transactionId: '', notifyCount: 0,
    clientPlatform: 'wechat-h5', createdAt: new Date(now - 30 * 1000)
  },
  HT20261027000003CCC: {
    outTradeNo: 'HT20261027000003CCC', openId: 'oQwe1234567890ijkl', userId: 'user-000003', profileId: 'profile-3',
    packId: 'pack-100', priceCents: 100, drops: 10, bonusDrops: 0, totalDrops: 10,
    status: 'refunded', ledgerState: 'credited', transactionId: '4200000000000000000003', notifyCount: 1,
    clientPlatform: 'wechat-h5', createdAt: new Date(now - 20 * 1000)
  },
  HT20261027000004DDD: {
    outTradeNo: 'HT20261027000004DDD', openId: 'oRty1234567890mnop', userId: 'user-000004', profileId: 'profile-4',
    packId: 'pack-500', priceCents: 500, drops: 50, bonusDrops: 0, totalDrops: 50,
    status: 'paid', ledgerState: 'blocked', ledgerError: 'HONEY_RECONCILING', transactionId: '4200000000000000000004', notifyCount: 1,
    clientPlatform: 'wechat-h5', createdAt: new Date(now - 10 * 1000)
  }
}
const LEDGER_ROWS = {
  'htp-1': { serviceAccountOpenId: 'oXyZ1234567890abcd', delta: 100, reason: 'honey-topup', refId: 'honey-topup:HT20261027000001AAA', createdAt: new Date(now - 55 * 1000), attempt: 1 },
  'htp-2': { serviceAccountOpenId: 'oXyZ1234567890abcd', delta: 30, reason: 'fan-registration-bonus', createdAt: new Date(now - 120 * 1000) }
}
const PROFILE_ROWS = { 'profile-1': { serviceAccountOpenId: 'oXyZ1234567890abcd', honeyBalance: 130 } }

function baseCollections() {
  return {
    auth_sessions: {
      'platform-session-1': {
        tokenHash: TOKEN_HASH, active: true, expiresAt: new Date(now + 3600 * 1000),
        principalType: 'platform_owner', channel: 'platform_password', userId: 'platform-owner'
      }
    },
    platform_settings: {},
    users: {},
    service_identities: {
      'identity-1': { phone: '13800001111', phoneVerified: true, serviceAccountOpenId: 'oXyZ1234567890abcd' }
    },
    honey_manual_grants: {},
    honey_orders: JSON.parse(JSON.stringify(ORDER_ROWS, (key, value) => value)),
    fan_points_ledger: JSON.parse(JSON.stringify(LEDGER_ROWS)),
    fan_profiles: JSON.parse(JSON.stringify(PROFILE_ROWS))
  }
}
function restoreDates(collections) {
  Object.values(collections.honey_orders).forEach(row => {
    row.createdAt = new Date(row.createdAt)
    if (row.paidAt) row.paidAt = new Date(row.paidAt)
  })
  Object.values(collections.fan_points_ledger).forEach(row => { row.createdAt = new Date(row.createdAt) })
  return collections
}
function ownerEvent(payload) {
  return Object.assign({ __authToken: TOKEN }, payload)
}

;(async () => {
  // ---- 非平台负责人：拒绝读取 ----
  activeCollections = restoreDates(baseCollections())
  const denied = await platformOwner.main({ __authToken: 'wrong-token', action: 'honeyOrdersOverview' })
  assert.equal(denied.success, false, '非平台会话必须被拒绝')
  assert.match(denied.error, /会话|登录/)

  // ---- 收款汇总：已支付含退款订单，销售额扣除退款，blocked 单独计数 ----
  const overview = await platformOwner.main(ownerEvent({ action: 'honeyOrdersOverview', days: 7 }))
  assert.equal(overview.success, true)
  assert.equal(overview.available, true)
  assert.equal(overview.totals.created, 4)
  assert.equal(overview.totals.paid, 3, 'paid + refunded 计为曾支付')
  assert.equal(overview.totals.refunded, 1)
  assert.equal(overview.totals.pending, 1)
  assert.equal(overview.totals.blocked, 1, '入账受阻必须单独可见')
  assert.equal(overview.totals.grossCents, 1600, '销售额按价格快照累加')
  assert.equal(overview.totals.refundCents, 100)
  assert.equal(overview.totals.netCents, 1500)
  assert.equal(overview.totals.successRate, 100)
  assert.equal(overview.byDay.length, 7, '近 7 天必须逐日给出，不省略零值')
  const today = overview.byDay[overview.byDay.length - 1]
  assert.equal(today.paidCount, 3)
  assert.equal(today.grossCents, 1600)
  assert.deepEqual(overview.byPack.map(pack => pack.priceCents), [1000, 500, 100])

  // ---- 订单筛选、关键词与分页 ----
  const paidList = await platformOwner.main(ownerEvent({ action: 'honeyOrderList', status: 'paid', pageSize: 10 }))
  assert.equal(paidList.success, true)
  assert.equal(paidList.total, 2)
  assert.equal(paidList.rows.every(row => row.status === 'paid'), true)
  const blockedList = await platformOwner.main(ownerEvent({ action: 'honeyOrderList', ledgerState: 'blocked' }))
  assert.equal(blockedList.total, 1)
  assert.equal(blockedList.rows[0].outTradeNo, 'HT20261027000004DDD')
  const keywordList = await platformOwner.main(ownerEvent({ action: 'honeyOrderList', keyword: '0003CCC' }))
  assert.equal(keywordList.total, 1, '关键词必须能命中单号')
  const pageList = await platformOwner.main(ownerEvent({ action: 'honeyOrderList', pageSize: 10 }))
  assert.equal(pageList.pageSize, 10)
  assert.equal(pageList.total, 4)
  const masked = JSON.stringify(pageList.rows)
  assert.equal(masked.includes('oXyZ1234567890abcd'), false, 'OpenID 不得原样返回')
  assert.equal(pageList.rows.some(row => row.openIdMasked.includes('****')), true)

  // ---- 详情：账本流水与镜像一致性 ----
  const detail = await platformOwner.main(ownerEvent({ action: 'honeyOrderDetail', outTradeNo: 'HT20261027000001AAA' }))
  assert.equal(detail.success, true)
  assert.equal(detail.order.priceYuan, '10')
  assert.equal(detail.ledger.entries.length, 1, '只返回本单 refId 的流水')
  assert.equal(detail.ledger.entries[0].delta, 100)
  assert.equal(detail.ledger.balance, 130, '账本合计按全部流水计算')
  assert.equal(detail.ledger.mirror, 130)
  assert.equal(detail.ledger.consistent, true)

  activeCollections = restoreDates(baseCollections())
  activeCollections.fan_profiles['profile-1'].honeyBalance = 99
  const drifted = await platformOwner.main(ownerEvent({ action: 'honeyOrderDetail', outTradeNo: 'HT20261027000001AAA' }))
  assert.equal(drifted.ledger.consistent, false, '镜像与账本不一致必须暴露为不一致')

  const missing = await platformOwner.main(ownerEvent({ action: 'honeyOrderDetail', outTradeNo: 'HT20261027999999ZZZ' }))
  assert.equal(missing.success, false)
  assert.equal(missing.code, 'HONEY_ORDER_NOT_FOUND')

  const badNo = await platformOwner.main(ownerEvent({ action: 'honeyOrderDetail', outTradeNo: '../../etc' }))
  assert.equal(badNo.success, false)
  assert.match(badNo.error, /单号/)

  // ---- 手动加滴：手机号定位、正数流水 + 镜像同步、幂等、账本不一致拒绝 ----
  activeCollections = restoreDates(baseCollections())
  const grantDenied = await platformOwner.main({ __authToken: 'wrong-token', action: 'honeyGrantDrops', phone: '13800001111', drops: 50, reason: '客服补偿：支付到账延迟', requestId: 'grant-test-0001' })
  assert.equal(grantDenied.success, false, '非平台会话不得手动加滴')

  const looked = await platformOwner.main(ownerEvent({ action: 'honeyGrantAccount', phone: '13800001111' }))
  assert.equal(looked.success, true)
  assert.equal(looked.account.balance, 130, '余额按账本合计计算')
  assert.equal(looked.account.consistent, true)
  assert.equal(looked.account.canGrant, true)
  assert.equal(looked.account.phoneMasked, '138****1111')
  assert.equal(looked.account.openIdMasked.includes('****'), true, '账户查询不得回原始 OpenID')

  const badPhone = await platformOwner.main(ownerEvent({ action: 'honeyGrantAccount', phone: '12345' }))
  assert.equal(badPhone.code, 'HONEY_PHONE_INVALID')
  const notBound = await platformOwner.main(ownerEvent({ action: 'honeyGrantAccount', phone: '13900002222' }))
  assert.equal(notBound.code, 'HONEY_ACCOUNT_NOT_OPEN', '未绑定服务号微信必须明确提示')

  const zeroDrops = await platformOwner.main(ownerEvent({ action: 'honeyGrantDrops', phone: '13800001111', drops: 0, reason: '客服补偿：支付到账延迟', requestId: 'grant-test-0002' }))
  assert.equal(zeroDrops.code, 'HONEY_GRANT_DROPS_INVALID')
  const hugeDrops = await platformOwner.main(ownerEvent({ action: 'honeyGrantDrops', phone: '13800001111', drops: 50001, reason: '客服补偿：支付到账延迟', requestId: 'grant-test-0002' }))
  assert.equal(hugeDrops.code, 'HONEY_GRANT_DROPS_TOO_LARGE')
  const shortReason = await platformOwner.main(ownerEvent({ action: 'honeyGrantDrops', phone: '13800001111', drops: 10, reason: '补', requestId: 'grant-test-0002' }))
  assert.equal(shortReason.code, 'HONEY_GRANT_REASON_REQUIRED', '必须填写加滴原因')

  const granted = await platformOwner.main(ownerEvent({ action: 'honeyGrantDrops', phone: '13800001111', drops: 50, reason: '客服补偿：支付到账延迟', requestId: 'grant-test-0001' }))
  assert.equal(granted.success, true)
  assert.equal(granted.deduped, false)
  assert.equal(granted.balance, 180)
  const grantEntry = Object.values(activeCollections.fan_points_ledger).find(row => row.refId === 'honey-manual-grant:grant-test-0001')
  assert.ok(grantEntry, '必须写一条加滴流水')
  assert.equal(grantEntry.delta, 50, '加滴流水必须是正数')
  assert.equal(grantEntry.reason, 'honey-manual-grant')
  assert.equal(grantEntry.grantNote, '客服补偿：支付到账延迟')
  assert.equal(activeCollections.fan_profiles['profile-1'].honeyBalance, 180, '镜像必须同额增加')
  const audit = Object.values(activeCollections.honey_manual_grants)
  assert.equal(audit.length, 1, '必须留一条加滴审计记录')
  assert.equal(audit[0].beforeBalance, 130)
  assert.equal(audit[0].afterBalance, 180)
  assert.equal(audit[0].operatorName, '平台负责人', '审计记录必须记操作人')

  const replay = await platformOwner.main(ownerEvent({ action: 'honeyGrantDrops', phone: '13800001111', drops: 50, reason: '客服补偿：支付到账延迟', requestId: 'grant-test-0001' }))
  assert.equal(replay.success, true)
  assert.equal(replay.deduped, true, '同一请求编号不得重复加滴')
  assert.equal(replay.balance, 180)
  assert.equal(Object.keys(activeCollections.fan_points_ledger).length, 3, '重复提交不得新增流水')

  const grantList = await platformOwner.main(ownerEvent({ action: 'honeyGrantList' }))
  assert.equal(grantList.success, true)
  assert.equal(grantList.rows.length, 1)
  assert.equal(grantList.rows[0].phoneMasked, '138****1111')
  assert.equal(JSON.stringify(grantList.rows).includes('oXyZ1234567890abcd'), false, '加滴记录不得回原始 OpenID')

  // 从充值单号定位同一账户（不把 OpenID 传到浏览器）
  activeCollections = restoreDates(baseCollections())
  const byOrder = await platformOwner.main(ownerEvent({ action: 'honeyGrantAccount', outTradeNo: 'HT20261027000001AAA' }))
  assert.equal(byOrder.success, true)
  assert.equal(byOrder.account.balance, 130)
  assert.equal(JSON.stringify(byOrder).includes('oXyZ1234567890abcd'), false)
  const byMissingOrder = await platformOwner.main(ownerEvent({ action: 'honeyGrantAccount', outTradeNo: 'HT20261027999999ZZZ' }))
  assert.equal(byMissingOrder.code, 'HONEY_ORDER_NOT_FOUND')

  // 镜像漂移：先拒绝，绝不写流水、不改镜像
  activeCollections = restoreDates(baseCollections())
  activeCollections.fan_profiles['profile-1'].honeyBalance = 99
  const blockedLookup = await platformOwner.main(ownerEvent({ action: 'honeyGrantAccount', phone: '13800001111' }))
  assert.equal(blockedLookup.account.consistent, false)
  assert.equal(blockedLookup.account.canGrant, false)
  const blockedGrant = await platformOwner.main(ownerEvent({ action: 'honeyGrantDrops', phone: '13800001111', drops: 50, reason: '客服补偿：支付到账延迟', requestId: 'grant-test-0003' }))
  assert.equal(blockedGrant.success, false)
  assert.equal(blockedGrant.code, 'HONEY_RECONCILING')
  assert.equal(Object.values(activeCollections.fan_points_ledger).some(row => row.refId === 'honey-manual-grant:grant-test-0003'), false)
  assert.equal(activeCollections.fan_profiles['profile-1'].honeyBalance, 99, '拒绝时不得改动镜像')

  // ---- 集合缺失：如实说明，不把 0 当成已统计 ----
  activeCollections = restoreDates(baseCollections())
  delete activeCollections.honey_orders
  const empty = await platformOwner.main(ownerEvent({ action: 'honeyOrdersOverview', days: 7 }))
  assert.equal(empty.success, true)
  assert.equal(empty.available, false)
  assert.match(empty.note, /honey_orders/)
  assert.equal(empty.totals.created, 0)

  console.log('平台蜂蜜：鉴权、收款汇总、筛选分页、详情与账本一致性、手动加滴（幂等/镜像一致性）检查通过')
})().catch(error => { console.error(error); process.exitCode = 1 })
