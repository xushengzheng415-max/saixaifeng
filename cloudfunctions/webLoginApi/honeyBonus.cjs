'use strict'
// 蜂蜜奖励发放：账本 fan_points_ledger 为准，fan_profiles.honeyBalance 为镜像。
// 按 refId 幂等；账户未开通或账本待核对时跳过，不阻断业务主流程。
const text = value => String(value == null ? '' : value).trim()

const REGISTRATION_BONUS_DROPS = 10
const PROFILE_COMPLETE_BONUS_DROPS = 50
const REASON_REGISTRATION = 'fan-registration-bonus'
const REASON_PROFILE_COMPLETE = 'player-profile-complete-bonus'

function hasStandardPortrait(player) {
  if (!player || typeof player !== 'object') return false
  return Boolean(text(player.photoUrl || player.photoFileID || player.photoFileId || player.playerCardSourceFileId || player.recentPortraitId))
}

function isProfileCompleteReady(player) {
  return text(player && player.profileStatus) === 'complete' && hasStandardPortrait(player)
}

async function ledgerHasRef(db, refId) {
  const result = await db.collection('fan_points_ledger').where({ refId: text(refId) }).limit(1).get()
  const rows = Array.isArray(result.data) ? result.data : (result.data ? [result.data] : [])
  return rows.length > 0
}

async function fanProfile(db, openId) {
  const id = text(openId)
  if (!id) return { code: 'HONEY_ACCOUNT_NOT_OPEN' }
  const result = await db.collection('fan_profiles').where({ serviceAccountOpenId: id }).limit(2).get()
  const rows = Array.isArray(result.data) ? result.data : (result.data ? [result.data] : [])
  if (rows.length > 1) return { code: 'HONEY_ACCOUNT_CONFLICT' }
  if (!rows.length) return { code: 'HONEY_ACCOUNT_NOT_OPEN' }
  return { profile: rows[0] }
}

async function ledgerBalance(db, openId) {
  const rows = []
  let after = ''
  for (;;) {
    const where = after
      ? { serviceAccountOpenId: text(openId), _id: db.command.gt(after) }
      : { serviceAccountOpenId: text(openId) }
    const page = (await db.collection('fan_points_ledger').where(where).orderBy('_id', 'asc').limit(100).get()).data || []
    if (!page.length) break
    rows.push(...page)
    after = String(page[page.length - 1]._id)
    if (page.length < 100) break
    if (rows.length > 5000) return { code: 'HONEY_LEDGER_TOO_LARGE' }
  }
  let balance = 0
  for (const row of rows) {
    const delta = Number(row.delta)
    if (!Number.isSafeInteger(delta)) return { code: 'HONEY_LEDGER_INVALID' }
    balance += delta
  }
  if (!Number.isSafeInteger(balance) || balance < 0) return { code: 'HONEY_LEDGER_INVALID' }
  return { balance }
}

async function grantHoneyBonus(db, options) {
  const opts = options || {}
  const openId = text(opts.serviceAccountOpenId)
  const drops = Number(opts.drops)
  const reason = text(opts.reason)
  const refId = text(opts.refId)
  if (!openId) return { success: false, skipped: true, code: 'HONEY_ACCOUNT_NOT_OPEN' }
  if (!Number.isSafeInteger(drops) || drops <= 0) return { success: false, skipped: true, code: 'HONEY_GRANT_DROPS_INVALID' }
  if (!reason || !refId) return { success: false, skipped: true, code: 'HONEY_REF_REQUIRED' }
  if (await ledgerHasRef(db, refId)) return { success: true, deduped: true, drops, refId }

  const account = await fanProfile(db, openId)
  if (account.code) return { success: false, skipped: true, code: account.code }
  const ledger = await ledgerBalance(db, openId)
  if (ledger.code) return { success: false, skipped: true, code: ledger.code }
  const mirror = Number(account.profile.honeyBalance)
  if (!Number.isSafeInteger(mirror) || mirror < 0 || mirror !== ledger.balance) {
    return { success: false, skipped: true, code: 'HONEY_RECONCILING' }
  }

  const profileId = text(account.profile._id)
  const beforeBalance = ledger.balance
  try {
    await db.runTransaction(async transaction => {
      const currentResult = await transaction.collection('fan_profiles').doc(profileId).get()
      const current = Array.isArray(currentResult.data) ? currentResult.data[0] : currentResult.data
      if (!current || text(current.serviceAccountOpenId) !== openId) {
        throw Object.assign(new Error('蜂蜜账户已变化'), { code: 'HONEY_ACCOUNT_CONFLICT' })
      }
      if (!Number.isSafeInteger(current.honeyBalance) || current.honeyBalance !== beforeBalance) {
        throw Object.assign(new Error('蜂蜜余额待核对'), { code: 'HONEY_RECONCILING' })
      }
      await transaction.collection('fan_profiles').doc(profileId).update({
        data: { honeyBalance: current.honeyBalance + drops, honeyWalletUpdatedAt: db.serverDate() }
      })
      await transaction.collection('fan_points_ledger').add({
        data: {
          serviceAccountOpenId: openId,
          delta: drops,
          reason,
          refId,
          attempt: 1,
          playerId: text(opts.playerId),
          createTime: db.serverDate()
        }
      })
    })
  } catch (error) {
    if (await ledgerHasRef(db, refId)) return { success: true, deduped: true, drops, refId }
    return { success: false, skipped: true, code: text(error.code) || 'HONEY_GRANT_FAILED', error: text(error.message) }
  }
  return { success: true, deduped: false, drops, refId, balance: beforeBalance + drops }
}

async function grantProfileCompleteBonus(db, options) {
  const playerId = text(options && options.playerId)
  const openId = text(options && options.serviceAccountOpenId)
  if (!playerId || !openId) return { success: false, skipped: true, code: 'HONEY_REF_REQUIRED' }
  return grantHoneyBonus(db, {
    serviceAccountOpenId: openId,
    drops: PROFILE_COMPLETE_BONUS_DROPS,
    reason: REASON_PROFILE_COMPLETE,
    refId: 'player-profile-complete-bonus:' + playerId,
    playerId
  })
}

module.exports = {
  REGISTRATION_BONUS_DROPS,
  PROFILE_COMPLETE_BONUS_DROPS,
  REASON_REGISTRATION,
  REASON_PROFILE_COMPLETE,
  hasStandardPortrait,
  isProfileCompleteReady,
  grantHoneyBonus,
  grantProfileCompleteBonus
}
