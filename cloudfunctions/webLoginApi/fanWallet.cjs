'use strict'
const { readAll } = require('./data-center/reader.cjs')

function balanceOf(rows) {
  return rows.reduce((balance,row) => {
    if (!Number.isSafeInteger(row.delta)) throw new Error('蜂蜜账本有异常记录')
    return balance + row.delta
  },0)
}

async function ensureFanWallet(db, profileId, openId) {
  const ref = db.collection('fan_profiles').doc(profileId)
  const read = async () => { const result = await ref.get(); return Array.isArray(result.data) ? result.data[0] : result.data }
  let profile = await read()
  if (!profile || String(profile.serviceAccountOpenId || '') !== openId) throw new Error('球迷账号资料异常')
  const rows = await readAll(db,'fan_points_ledger',{ serviceAccountOpenId:openId })
  const balance = balanceOf(rows)
  if (!Number.isSafeInteger(balance) || balance < 0) throw new Error('蜂蜜账本余额异常，请联系平台处理')
  if (Number.isSafeInteger(profile.honeyBalance) && profile.honeyBalance >= 0) {
    if (profile.honeyBalance !== balance) throw new Error('蜂蜜余额待核对，请稍后重试')
    return profile.honeyBalance
  }
  await db.runTransaction(async transaction => {
    const currentResult = await transaction.collection('fan_profiles').doc(profileId).get()
    const current = Array.isArray(currentResult.data) ? currentResult.data[0] : currentResult.data
    if (!current || String(current.serviceAccountOpenId || '') !== openId) throw new Error('球迷账号资料异常')
    if (!Number.isSafeInteger(current.honeyBalance)) await transaction.collection('fan_profiles').doc(profileId).update({ data:{ honeyBalance:balance, honeyWalletVersion:1, honeyWalletUpdatedAt:db.serverDate() } })
  })
  profile = await read()
  if (!Number.isSafeInteger(profile.honeyBalance) || profile.honeyBalance < 0) throw new Error('蜂蜜余额初始化失败，请重试')
  return profile.honeyBalance
}

module.exports = { balanceOf, ensureFanWallet }
