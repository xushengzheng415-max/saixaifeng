'use strict'
// 自由球员自助登记（服务号 H5）：公众号文章/菜单直达 self-register.html，
// 无需球队邀请入口即可建档。身份规则与小程序 selfPlayerOnboard 完全一致，
// 本模块只负责服务号 OAuth、手机号验证会话，最终建档仍由 getMiniWorkspace 执行。
const crypto = require('crypto')
const text = value => String(value == null ? '' : value).trim()
const one = result => Array.isArray(result && result.data) ? result.data[0] : result && result.data
const digest = value => crypto.createHash('sha256').update(text(value)).digest('hex')
const timeOf = value => value ? new Date(value.$date || value._date || value).getTime() || 0 : 0
const fail = (code, message) => ({ success: false, code, error: message })
const PHONE = /^1[3-9]\d{9}$/
const POSITIONS = new Set(['门将', '后卫', '中场', '前锋'])
const SESSION_TTL = 2 * 60 * 60 * 1000
const OAUTH_STATE_TTL = 10 * 60 * 1000
const PAGE = 'self-register.html'

async function ensureCollections(db) {
  for (const name of ['self_register_oauth_states', 'self_register_sessions']) {
    try { await db.createCollection(name) }
    catch (error) { if (!/exist|already|duplicate|已存在/i.test(text(error && error.message))) console.warn('[self-register] collection prepare skipped:', name) }
  }
}

function prefillOf(event) {
  const height = Number(event.height), weight = Number(event.weight), position = text(event.position)
  return {
    height: Number.isFinite(height) && height >= 100 && height <= 230 ? height : 0,
    weight: Number.isFinite(weight) && weight >= 20 && weight <= 200 ? weight : 0,
    position: POSITIONS.has(position) ? position : ''
  }
}

async function documentOf(db, collection, id) {
  try { return one(await db.collection(collection).doc(id).get()) }
  catch (error) { if (/getfail|not exist|not found/i.test(text(error && error.message))) return null; throw error }
}

async function sessionOf(db, event) {
  const token = text(event.selfRegisterSession)
  if (!/^[a-f0-9]{64}$/i.test(token)) return { error: fail('SELF_REGISTER_SESSION_INVALID', '登记会话已失效，请重新进入登记页') }
  const rows = (await db.collection('self_register_sessions').where({ tokenHash: digest(token), active: true }).limit(2).get()).data || []
  const session = rows[0]
  if (rows.length !== 1 || !session || timeOf(session.expiresAt) <= Date.now()) return { error: fail('SELF_REGISTER_SESSION_EXPIRED', '登记会话已过期，请重新进入登记页') }
  return { session }
}

async function oauthUrl(db, event, config) {
  const referer = text(event.referer || event.referrer || '')
  if (referer && !/^https:\/\/www\.sxffootball\.cn\//i.test(referer)) return fail('REFERER_INVALID', '请从赛小蜂足球页面进入登记')
  if (!config.APP_ID || !config.APP_SECRET) return fail('SERVICE_ACCOUNT_NOT_CONFIGURED', '服务号网页授权尚未配置')
  await ensureCollections(db)
  const state = crypto.randomBytes(20).toString('hex')
  const sid = /^[0-9a-f-]{36}$/i.test(text(event.sid)) ? text(event.sid) : ''
  await db.collection('self_register_oauth_states').doc(state).set({ data: { state, sid, prefill: prefillOf(event), status: 'issued', expiresAt: new Date(Date.now() + OAUTH_STATE_TTL), createTime: db.serverDate() } })
  const redirectUri = config.H5_URL + PAGE
  return {
    success: true,
    authorizeUrl: 'https://open.weixin.qq.com/connect/oauth2/authorize?appid=' + encodeURIComponent(config.APP_ID) + '&redirect_uri=' + encodeURIComponent(redirectUri) + '&response_type=code&scope=snsapi_base&state=' + encodeURIComponent(state) + '#wechat_redirect'
  }
}

async function bindKnownAccount(db, session, openId) {
  const bindings = (await db.collection('service_account_bindings').where({ sport: 'football', officialOpenId: openId, subscribed: true }).limit(21).get()).data || []
  const userIds = Array.from(new Set(bindings.map(item => text(item.userId)).filter(Boolean)))
  if (bindings.length >= 21 || userIds.length !== 1) return null
  const user = await documentOf(db, 'users', userIds[0])
  const phone = text(user && (user.phone || user.phoneNumber)).replace(/\D/g, '')
  if (!user || user.phoneVerified !== true || !PHONE.test(phone)) return null
  const canonical = (await db.collection('users').where({ phone }).limit(3).get()).data || []
  const unique = Array.from(new Map(canonical.map(item => [text(item._id), item])).values())
  if (unique.length !== 1 || text(unique[0]._id) !== text(user._id)) return null
  await db.collection('self_register_sessions').doc(session._id).update({ data: { phoneVerified: true, phone, userId: text(user._id), phoneVerifiedAt: db.serverDate(), updateTime: db.serverDate() } })
  return { phoneVerified: true, phone }
}

async function createSession(db, event, config) {
  const state = text(event.state), code = text(event.code)
  if (!/^[a-f0-9]{40}$/i.test(state) || !code) return fail('OAUTH_INVALID', '微信授权参数已失效，请重新进入登记页')
  const record = await documentOf(db, 'self_register_oauth_states', state)
  if (!record || text(record.status) !== 'issued' || timeOf(record.expiresAt) <= Date.now()) return fail('OAUTH_EXPIRED', '微信授权已失效，请重新进入登记页')
  if (!config.APP_ID || !config.APP_SECRET) return fail('SERVICE_ACCOUNT_NOT_CONFIGURED', '服务号网页授权尚未配置')
  let oauth
  try {
    const response = await fetch('https://api.weixin.qq.com/sns/oauth2/access_token?appid=' + encodeURIComponent(config.APP_ID) + '&secret=' + encodeURIComponent(config.APP_SECRET) + '&code=' + encodeURIComponent(code) + '&grant_type=authorization_code')
    oauth = await response.json()
  } catch (error) { return fail('OAUTH_FAILED', '微信授权暂不可用，请重新进入登记页') }
  if (!oauth || !oauth.openid) return fail('OAUTH_FAILED', '未能确认当前微信，请重新进入登记页')
  await db.collection('self_register_oauth_states').doc(state).update({ data: { status: 'used', usedAt: db.serverDate() } })
  const token = crypto.randomBytes(32).toString('hex')
  const added = await db.collection('self_register_sessions').add({ data: { tokenHash: digest(token), officialOpenId: text(oauth.openid), unionId: text(oauth.unionid), sid: text(record.sid), prefill: record.prefill || {}, active: true, phoneVerified: false, phone: '', userId: '', expiresAt: new Date(Date.now() + SESSION_TTL), createTime: db.serverDate(), updateTime: db.serverDate() } })
  const session = { _id: added._id, officialOpenId: text(oauth.openid) }
  const bound = await bindKnownAccount(db, session, text(oauth.openid))
  return { success: true, selfRegisterSession: token, phoneVerified: Boolean(bound && bound.phoneVerified), phoneMasked: bound ? bound.phone.slice(0, 3) + '****' + bound.phone.slice(7) : '', sid: text(record.sid), prefill: record.prefill || {}, expiresAt: new Date(Date.now() + SESSION_TTL) }
}

async function sendSms(db, cloud, event) {
  const loaded = await sessionOf(db, event)
  if (loaded.error) return loaded.error
  const session = loaded.session
  const phone = text(event.phone)
  if (!PHONE.test(phone)) return fail('PHONE_INVALID', '请输入正确的手机号')
  if (timeOf(session.lastSmsAt) > Date.now() - 30000) return fail('SMS_TOO_FREQUENT', '请30秒后重试')
  const recent = (await db.collection('sms_codes').where({ phoneNumber: phone, loginChallengeId: text(session.tokenHash) }).limit(20).get()).data || []
  if (recent.filter(item => timeOf(item.createdAt) > Date.now() - 60 * 60 * 1000).length >= 6) return fail('SMS_LIMIT', '验证码发送过多，请稍后再试')
  const sent = await cloud.callFunction({ name: 'sendSms', data: { phoneNumber: phone, loginChallengeId: text(session.tokenHash) } })
  const result = (sent && sent.result) || sent
  if (!result || result.success !== true) return fail('SMS_FAILED', text(result && result.error) || '验证码发送失败')
  await db.collection('self_register_sessions').doc(session._id).update({ data: { lastSmsAt: db.serverDate(), smsPhone: phone, updateTime: db.serverDate() } })
  return { success: true }
}

// 手机号是自然人唯一凭证：同一手机号命中多条 users 直接阻断，不选第一条继续。
async function verifySms(db, cloud, event) {
  const loaded = await sessionOf(db, event)
  if (loaded.error) return loaded.error
  const session = loaded.session
  const phone = text(event.phone), code = text(event.code)
  if (phone !== text(session.smsPhone) || !PHONE.test(phone) || !/^\d{6}$/.test(code)) return fail('SMS_INVALID', '手机号或验证码错误')
  const _ = db.command
  const found = (await db.collection('sms_codes').where({ phoneNumber: phone, code, loginChallengeId: text(session.tokenHash), used: false, expireAt: _.gt(new Date()) }).limit(2).get()).data || []
  if (found.length !== 1) return fail('SMS_EXPIRED', '验证码错误或已过期')
  const users = (await db.collection('users').where(_.or([{ phone }, { phoneNumber: phone }])).limit(3).get()).data || []
  const uniqueUsers = Array.from(new Map(users.map(item => [text(item._id), item])).values())
  if (uniqueUsers.length > 1) return fail('ACCOUNT_CONFLICT', '手机号存在重复账号，请联系管理员核对')
  const openId = text(session.officialOpenId)
  const bound = (await db.collection('service_account_bindings').where({ sport: 'football', officialOpenId: openId, subscribed: true }).limit(3).get()).data || []
  if (bound.some(item => text(item.userId) && (!uniqueUsers[0] || text(item.userId) !== text(uniqueUsers[0]._id)))) return fail('WECHAT_ACCOUNT_CONFLICT', '此微信已绑定其他账号，请联系管理员核对')
  let user = uniqueUsers[0]
  if (!user) {
    const created = await db.collection('users').add({ data: { phone, phoneNumber: phone, phoneVerified: true, role: 'user', createTime: db.serverDate(), updateTime: db.serverDate() } })
    user = { _id: created._id, phone, phoneNumber: phone }
  }
  const key = 'football:user:' + text(user._id)
  const existing = (await db.collection('service_account_bindings').where({ uniqueKey: key }).limit(2).get()).data || []
  if (existing.length > 1 || (existing[0] && existing[0].subscribed === true && text(existing[0].officialOpenId) !== openId)) return fail('USER_BINDING_CONFLICT', '账号已绑定其他服务号微信，请联系管理员核对')
  const binding = { sport: 'football', uniqueKey: key, userId: text(user._id), officialOpenId: openId, subscribed: true, status: 'subscribed', updateTime: db.serverDate() }
  if (existing[0]) await db.collection('service_account_bindings').doc(existing[0]._id).update({ data: binding })
  else await db.collection('service_account_bindings').add({ data: { ...binding, createTime: db.serverDate() } })
  await db.collection('sms_codes').doc(found[0]._id).update({ data: { used: true, usedAt: db.serverDate() } })
  await db.collection('users').doc(user._id).update({ data: { phoneVerified: true, updateTime: db.serverDate() } })
  await db.collection('self_register_sessions').doc(session._id).update({ data: { phoneVerified: true, phone, userId: text(user._id), phoneVerifiedAt: db.serverDate(), updateTime: db.serverDate() } })
  return { success: true, phoneMasked: phone.slice(0, 3) + '****' + phone.slice(7) }
}

async function playerAction(db, cloud, session, subAction, payload) {
  if (session.phoneVerified !== true || !text(session.userId)) return fail('PHONE_AUTH_REQUIRED', '请先验证登记手机号')
  const token = text(payload && payload.__sessionToken)
  const invoked = await cloud.callFunction({ name: 'getMiniWorkspace', data: { action: 'serviceSelfPlayerOnboard', selfRegisterSession: token, subAction, payload: Object.assign({}, payload, { __sessionToken: undefined }) } })
  const result = (invoked && invoked.result) || {}
  return result.success ? result : fail(text(result.code) || 'SELF_PLAYER_FAILED', text(result.message) || '登记处理失败，请重试')
}

module.exports = async function handleSelfRegister(action, event, deps) {
  const { cloud, config } = deps
  const db = cloud.database()
  try {
    if (action === 'selfRegisterOAuthUrl') return await oauthUrl(db, event, config)
    if (action === 'selfRegisterSession') return await createSession(db, event, config)
    if (action === 'selfRegisterSendSms') return await sendSms(db, cloud, event)
    if (action === 'selfRegisterVerifySms') return await verifySms(db, cloud, event)
    const loaded = await sessionOf(db, event)
    if (loaded.error) return loaded.error
    const session = loaded.session
    if (action === 'selfRegisterContext') {
      const result = await playerAction(db, cloud, session, 'profile', { __sessionToken: text(event.selfRegisterSession) })
      if (!result.success) return result
      return { success: true, phoneVerified: true, phoneMasked: text(session.phone).slice(0, 3) + '****' + text(session.phone).slice(7), sid: text(session.sid), prefill: session.prefill || {}, self: result.self || null, guarded: result.guarded || [], claimable: result.claimable || [] }
    }
    if (action === 'selfRegisterSubmit') return await playerAction(db, cloud, session, 'register', Object.assign({}, event, { __sessionToken: text(event.selfRegisterSession) }))
    if (action === 'selfRegisterClaim') return await playerAction(db, cloud, session, 'claim', Object.assign({}, event, { __sessionToken: text(event.selfRegisterSession) }))
    if (action === 'selfRegisterTeams') return await playerAction(db, cloud, session, 'teams', { __sessionToken: text(event.selfRegisterSession) })
    if (action === 'selfRegisterSearchTeams') return await playerAction(db, cloud, session, 'searchTeams', { __sessionToken: text(event.selfRegisterSession), keyword: event.keyword, offset: event.offset })
    if (action === 'selfRegisterRequestTeamJoin') return await playerAction(db, cloud, session, 'requestTeamJoin', { __sessionToken: text(event.selfRegisterSession), playerId: event.playerId, teamId: event.teamId, agreed: event.agreed })
    return fail('SELF_REGISTER_ACTION_INVALID', '操作无效')
  } catch (error) {
    console.warn('[self-register] failed:', text(error && error.message))
    return fail(text(error && error.code) || 'SELF_REGISTER_FAILED', text(error && error.message) || '服务暂不可用，请重试')
  }
}
