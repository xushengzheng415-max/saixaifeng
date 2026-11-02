'use strict'
// 服务号 H5 自助登记的会话桥接：H5 没有小程序 OPENID，身份以服务端会话为准。
// 建档/认领规则仍由 selfPlayerOnboard.cjs 统一执行，这里只负责把会话还原成 identity。
const crypto = require('node:crypto')
const text = value => String(value == null ? '' : value).trim()
const one = result => Array.isArray(result && result.data) ? result.data[0] : result && result.data
const timeOf = value => value ? new Date(value.$date || value._date || value).getTime() || 0 : 0
const fail = (code, message) => ({ success: false, code, message })
const ACTIONS = { profile: 'selfPlayerProfile', register: 'registerSelfPlayer', claim: 'claimSelfPlayer' }

module.exports = async function run({ db, event, loadManagedTeams }) {
  const token = text(event.selfRegisterSession || event.sessionToken)
  if (!/^[a-f0-9]{64}$/i.test(token)) return fail('SELF_REGISTER_SESSION_INVALID', '登记会话已失效，请重新进入登记页')
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const rows = (await db.collection('self_register_sessions').where({ tokenHash, active: true }).limit(2).get()).data || []
  const session = rows[0]
  if (rows.length !== 1 || !session || timeOf(session.expiresAt) <= Date.now()) return fail('SELF_REGISTER_SESSION_EXPIRED', '登记会话已过期，请重新进入登记页')
  if (session.phoneVerified !== true || !text(session.userId)) return fail('PHONE_AUTH_REQUIRED', '请先验证登记手机号')
  const phone = text(session.phone)
  if (!/^1[3-9]\d{9}$/.test(phone)) return fail('PHONE_AUTH_REQUIRED', '请先验证登记手机号')
  let user = null
  try { user = one(await db.collection('users').doc(text(session.userId)).get()) }
  catch (error) { if (!/getfail|not exist|not found/i.test(text(error && error.message))) throw error }
  if (!user) return fail('PHONE_AUTH_REQUIRED', '登记账号不存在，请重新验证手机号')
  if (['teams', 'searchTeams', 'requestTeamJoin'].includes(text(event.subAction))) {
    return await require('./selfPlayerTeamDirectory.cjs')({ db, identity: { user, phone, openId: '' }, event: Object.assign({}, event.payload || {}, { subAction: event.subAction }), loadManagedTeams })
  }
  const action = ACTIONS[text(event.subAction)]
  if (!action) return fail('SELF_REGISTER_ACTION_INVALID', '操作无效')
  const payload = Object.assign({}, event.payload || {}, { action, phoneVerified: true })
  delete payload.selfRegisterSession
  delete payload.sessionToken
  // 服务号 openId 与小程序 openId 分字段保存，linkedOpenId 保持为空，不写入服务号标识。
  return await require('./selfPlayerOnboard.cjs').run(db, { user, phone, openId: '' }, payload)
}
