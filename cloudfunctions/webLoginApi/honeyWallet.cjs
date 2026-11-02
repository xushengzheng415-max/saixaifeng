'use strict'
// 蜂蜜账本的服务端扣费/退回入口。
// 口径沿用 fanWallet.cjs / fanCenter.cjs：账本 fan_points_ledger 是唯一事实来源，
// fan_profiles.honeyBalance 只是同一笔账的镜像余额，两者不一致就停下核对，绝不按其中一侧继续扣。
// 账本按「服务号 OpenID」归属，与球迷中心、注册 H5 是同一个身份。
//
// 一次消费用 refId 标识，可能经历「扣费失败退回 → 再次生成」，所以同一条 refId 下按 attempt
// 记录多笔：扣费为负、退回为正。只要还有一笔未退回的扣费，就认定这次消费仍然有效，
// 重试直接命中幂等，不会再扣；全部退回后再重试才会重新扣一次，保证「最终拿到图的人才付一次钱」。
const { readAll } = require('./data-center/reader.cjs')

const text = value => String(value == null ? '' : value).trim()
const fail = (code, message) => { throw Object.assign(new Error(message), { code }) }

function sumOf(rows) {
  return rows.reduce((balance, row) => {
    const delta = Number(row.delta)
    if (!Number.isSafeInteger(delta)) fail('HONEY_LEDGER_INVALID', '蜂蜜账本有异常记录，请联系平台处理')
    return balance + delta
  }, 0)
}

function attemptsOf(rows, refId) {
  const attempts = new Map()
  rows.forEach(row => {
    if (text(row.refId) !== refId) return
    const delta = Number(row.delta)
    if (!Number.isSafeInteger(delta) || delta === 0) return
    const attempt = Number(row.attempt) > 0 ? Math.trunc(Number(row.attempt)) : 1
    const entry = attempts.get(attempt) || { charged: 0, refunded: 0 }
    if (delta < 0) entry.charged += -delta
    else entry.refunded += delta
    attempts.set(attempt, entry)
  })
  return attempts
}
// 还没退回的最近一次扣费；没有就返回 0
function openAttempt(attempts) {
  let open = 0
  attempts.forEach((entry, attempt) => {
    if (entry.charged > entry.refunded && attempt > open) open = attempt
  })
  return open
}
function lastAttempt(attempts) {
  let last = 0
  attempts.forEach((entry, attempt) => { if (attempt > last) last = attempt })
  return last
}

async function ledgerRows(db, serviceAccountOpenId) {
  return readAll(db, 'fan_points_ledger', { serviceAccountOpenId: text(serviceAccountOpenId) })
}

// 同一微信只能有一个球迷账户；出现重复时阻断，不能挑一条继续扣费。
async function fanProfile(db, serviceAccountOpenId) {
  const openId = text(serviceAccountOpenId)
  if (!openId) fail('HONEY_ACCOUNT_NOT_OPEN', '蜂蜜账户未开通，请先在服务号「我的」完成注册')
  const result = await db.collection('fan_profiles').where({ serviceAccountOpenId: openId }).limit(2).get()
  const rows = Array.isArray(result.data) ? result.data : (result.data ? [result.data] : [])
  if (rows.length > 1) fail('HONEY_ACCOUNT_CONFLICT', '蜂蜜账户存在重复记录，请联系平台核对')
  if (!rows.length) fail('HONEY_ACCOUNT_NOT_OPEN', '蜂蜜账户未开通，请先在服务号「我的」完成注册')
  return rows[0]
}

// 余额 = 账本合计；镜像字段存在时必须与账本一致，否则要求稍后重试。
async function readHoney(db, serviceAccountOpenId) {
  const profile = await fanProfile(db, serviceAccountOpenId)
  const balance = sumOf(await ledgerRows(db, serviceAccountOpenId))
  if (!Number.isSafeInteger(balance) || balance < 0) fail('HONEY_LEDGER_INVALID', '蜂蜜账本余额异常，请联系平台处理')
  const mirror = profile.honeyBalance
  if (Number.isSafeInteger(mirror) && mirror >= 0 && mirror !== balance) fail('HONEY_RECONCILING', '蜂蜜余额待核对，请稍后重试')
  return { profileId: text(profile._id), balance, cost: 0 }
}

// 扣费：refId 是这次消费的幂等键。同一 refId 已有未退回的扣费 → 直接返回当前余额，不重复扣；
// 之前的扣费已全部退回 → 视为新一轮生成，重新扣一次（attempt 递增）。
// 余额不足、账本不一致、账户缺失都直接拒绝，不写任何流水。
async function spendHoney(db, serviceAccountOpenId, options) {
  const opts = options || {}
  const openId = text(serviceAccountOpenId)
  const cost = Number(opts.cost)
  const refId = text(opts.refId)
  if (!Number.isSafeInteger(cost) || cost <= 0) fail('HONEY_COST_INVALID', '消费滴数未配置，请联系平台')
  if (!refId) fail('HONEY_REF_REQUIRED', '缺少本次消费的请求编号')
  const profile = await fanProfile(db, openId)
  const rows = await ledgerRows(db, openId)
  const balance = sumOf(rows)
  if (!Number.isSafeInteger(balance) || balance < 0) fail('HONEY_LEDGER_INVALID', '蜂蜜账本余额异常，请联系平台处理')
  const attempts = attemptsOf(rows, refId)
  const open = openAttempt(attempts)
  if (open) return { deduped: true, cost, balance, attempt: open }
  if (balance < cost) fail('HONEY_INSUFFICIENT', '蜂蜜不足：本次需要 ' + cost + ' 滴，当前 ' + balance + ' 滴')
  const attempt = lastAttempt(attempts) + 1
  const profileId = text(profile._id)
  await db.runTransaction(async transaction => {
    const currentResult = await transaction.collection('fan_profiles').doc(profileId).get()
    const current = Array.isArray(currentResult.data) ? currentResult.data[0] : currentResult.data
    if (!current || text(current.serviceAccountOpenId) !== openId) fail('HONEY_ACCOUNT_CONFLICT', '蜂蜜账户已变化，请重试')
    if (!Number.isSafeInteger(current.honeyBalance)) fail('HONEY_RECONCILING', '蜂蜜余额待核对，请稍后重试')
    // 事务内的镜像余额必须还等于本次读到的账本合计，否则说明有并发扣费，直接让对方重试
    if (current.honeyBalance !== balance) fail('HONEY_RECONCILING', '蜂蜜余额待核对，请稍后重试')
    if (current.honeyBalance < cost) fail('HONEY_INSUFFICIENT', '蜂蜜不足：本次需要 ' + cost + ' 滴，当前 ' + current.honeyBalance + ' 滴')
    await transaction.collection('fan_profiles').doc(profileId).update({
      data: { honeyBalance: current.honeyBalance - cost, honeyWalletUpdatedAt: db.serverDate() }
    })
    await transaction.collection('fan_points_ledger').add({
      data: {
        serviceAccountOpenId: openId,
        delta: -cost,
        reason: text(opts.reason) || 'honey-spend',
        refId,
        attempt,
        sessionId: text(opts.sessionId),
        createTime: db.serverDate()
      }
    })
  })
  return { deduped: false, cost, balance: balance - cost, attempt }
}

// 退回：只退「还没退回的那笔扣费」，写一条正的冲销流水，保留原始扣费记录可审计；
// 不删除、不改写原流水。全部退完后重复调用直接返回幂等结果，避免多退。
async function refundHoney(db, serviceAccountOpenId, options) {
  const opts = options || {}
  const openId = text(serviceAccountOpenId)
  const refId = text(opts.refId)
  if (!refId) fail('HONEY_REF_REQUIRED', '缺少本次退回的请求编号')
  const profile = await fanProfile(db, openId)
  const rows = await ledgerRows(db, openId)
  const balance = sumOf(rows)
  if (!Number.isSafeInteger(balance) || balance < 0) fail('HONEY_LEDGER_INVALID', '蜂蜜账本余额异常，请联系平台处理')
  const attempts = attemptsOf(rows, refId)
  const attempt = openAttempt(attempts)
  if (!attempt) return { deduped: true, amount: 0, cost: 0, balance, attempt: 0 }
  const outstanding = attempts.get(attempt).charged - attempts.get(attempt).refunded
  if (!Number.isSafeInteger(outstanding) || outstanding <= 0) fail('HONEY_LEDGER_INVALID', '蜂蜜账本有异常记录，请联系平台处理')
  const profileId = text(profile._id)
  await db.runTransaction(async transaction => {
    const currentResult = await transaction.collection('fan_profiles').doc(profileId).get()
    const current = Array.isArray(currentResult.data) ? currentResult.data[0] : currentResult.data
    if (!current || text(current.serviceAccountOpenId) !== openId) fail('HONEY_ACCOUNT_CONFLICT', '蜂蜜账户已变化，请重试')
    if (!Number.isSafeInteger(current.honeyBalance)) fail('HONEY_RECONCILING', '蜂蜜余额待核对，请稍后重试')
    if (current.honeyBalance !== balance) fail('HONEY_RECONCILING', '蜂蜜余额待核对，请稍后重试')
    await transaction.collection('fan_profiles').doc(profileId).update({
      data: { honeyBalance: current.honeyBalance + outstanding, honeyWalletUpdatedAt: db.serverDate() }
    })
    await transaction.collection('fan_points_ledger').add({
      data: {
        serviceAccountOpenId: openId,
        delta: outstanding,
        reason: text(opts.reason) || 'honey-refund',
        refId,
        attempt,
        sessionId: text(opts.sessionId),
        createTime: db.serverDate()
      }
    })
  })
  return { deduped: false, amount: outstanding, cost: outstanding, balance: balance + outstanding, attempt }
}

module.exports = { readHoney, spendHoney, refundHoney }
