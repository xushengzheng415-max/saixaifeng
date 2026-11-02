'use strict'

/**
 * authorizationRevocation —— 微信授权撤回统一执行器
 *
 * 依据微信平台合规要求：用户撤回授权 / 注销微信后，开发者应主动删除通过授权收集的
 * 用户信息（openid / unionid / 昵称 / 头像 / 授权手机号等）。
 *
 * 三个接收通道（serviceAccountCallback / miniProgramCallback / openPlatformCallback）
 * 收到 user_authorization_revoke / user_authorization_cancellation / user_info_modified
 * 事件后，统一 callFunction 到本函数执行删除；平台后台的邮件名单批量处理也走本函数。
 *
 * 处理原则（2026-10-20 用户确认）：
 * - 只删除「微信授权获得的个人信息」，保留账号壳与球队 / 赛事等业务数据，业务引用不断裂。
 * - 授权手机号（小程序 RevokeInfo=8）做不可逆匿名化（revoked-<hash>），账号下次使用需重新验证手机号。
 * - 注销（user_authorization_cancellation）删除全部微信身份字段 + 匿名化手机号。
 * - 所有处理写入 authorization_revocation_logs 审计留痕，操作幂等，可重复执行。
 */

const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const NICKNAME_FIELDS = ['nickname', 'nickName', 'avatarUrl', 'headimgurl']
const PHONE_FIELDS = ['phone', 'phoneNumber']
const REVOKED_PREFIX = 'revoked-'

// 服务号 H5 授权撤回范围
const SERVICE_SCOPE_MAP = {
  201: 'address', 202: 'invoice', 203: 'card', 204: 'microphone',
  205: 'nickname_avatar', 206: 'location', 207: 'media'
}
// 小程序授权撤回范围
const MINI_SCOPE_MAP = {
  1: 'plate', 2: 'address', 3: 'invoice', 4: 'bluetooth', 5: 'microphone',
  6: 'nickname_avatar', 7: 'camera', 8: 'phone', 12: 'steps', 13: 'location',
  14: 'media', 15: 'file', 16: 'email', 18: 'location',
  19: 'nickname_avatar', 20: 'nickname_avatar'
}
// 网站应用撤回范围
const WEBSITE_SCOPE_MAP = { 301: 'all' }

function text(value) { return String(value == null ? '' : value).trim() }

function scopeMapFor(appType) {
  if (appType === 'service') return SERVICE_SCOPE_MAP
  if (appType === 'miniprogram') return MINI_SCOPE_MAP
  if (appType === 'website') return WEBSITE_SCOPE_MAP
  return {}
}

// 归一化撤回范围：eventType 优先，其次 RevokeInfo 数字码
function resolveScopes(appType, eventType, revokeInfo) {
  const normalizedType = text(eventType).toLowerCase()
  if (normalizedType === 'user_authorization_cancellation') return ['all']
  if (normalizedType === 'user_info_modified') return ['nickname_avatar']
  const map = scopeMapFor(appType)
  const mapped = map[text(revokeInfo)]
  if (mapped) return [mapped]
  if (text(revokeInfo) === 'all') return ['all']
  // 无法识别的范围时按最保守处理：视作撤回全部授权信息
  if (text(revokeInfo)) return ['all']
  return []
}

function isRealPhone(value) {
  const v = text(value)
  return v.length > 0 && !v.startsWith(REVOKED_PREFIX)
}

// 不可逆匿名化：同一 openid + 原手机号重复处理得到同一结果，天然幂等
function anonymizePhone(openid, field, value) {
  return REVOKED_PREFIX + crypto.createHash('sha256')
    .update(`${text(openid)}|${field}|${text(value)}`).digest('hex').slice(0, 16)
}

async function findUsersByMiniOpenId(openid) {
  if (!openid) return []
  const res = await db.collection('users').where({ openId: openid }).limit(10).get()
  return res.data || []
}

async function findUsersByUnionId(unionid) {
  if (!unionid) return []
  const res = await db.collection('users').where({ unionId: unionid }).limit(10).get()
  return res.data || []
}

async function findUsersByWebsiteOpenId(openid, unionid) {
  if (openid) {
    const res = await db.collection('users').where({ wechatOpenId: openid }).limit(10).get()
    if ((res.data || []).length) return res.data
  }
  const byUnion = await findUsersByUnionId(unionid)
  if (byUnion.length) return byUnion
  // 兼容旧 PC openId 字段（unionId 缺失的历史账号）
  if (openid && !unionid) {
    const res = await db.collection('users').where({ openId: openid }).limit(5).get()
    return (res.data || []).filter(user => !text(user.wechatOpenId) || text(user.wechatOpenId) === openid)
  }
  return []
}

async function findUsersByServiceOpenId(openid, unionid) {
  const matched = new Map()
  if (openid) {
    const bindings = (await db.collection('service_account_bindings')
      .where({ officialOpenId: openid }).limit(20).get()).data || []
    for (const binding of bindings) {
      const userId = text(binding.userId)
      if (userId) matched.set(userId, binding._id)
    }
  }
  let users = []
  for (const userId of matched.keys()) {
    try {
      const res = await db.collection('users').doc(userId).get()
      const user = Array.isArray(res.data) ? res.data[0] : res.data
      if (user) users.push(user)
    } catch (error) { /* 用户可能已被删除，跳过 */ }
  }
  if (!users.length && unionid) users = await findUsersByUnionId(unionid)
  return users
}

async function findMatchedUsers(appType, openid, unionid) {
  if (appType === 'miniprogram') {
    const byOpenId = await findUsersByMiniOpenId(openid)
    if (byOpenId.length) return byOpenId
    return findUsersByUnionId(unionid)
  }
  if (appType === 'website') return findUsersByWebsiteOpenId(openid, unionid)
  if (appType === 'service') return findUsersByServiceOpenId(openid, unionid)
  return []
}

// 构造单个用户记录的更新数据
function buildUserUpdate(appType, scopes, openid, user) {
  const data = {}
  const cleared = []
  const wants = scope => scopes.includes('all') || scopes.includes(scope)

  if (wants('nickname_avatar')) {
    for (const field of NICKNAME_FIELDS) {
      if (text(user[field])) { data[field] = ''; cleared.push(field) }
    }
  }
  if (wants('phone')) {
    for (const field of PHONE_FIELDS) {
      const value = text(user[field])
      if (isRealPhone(value)) {
        data[field] = anonymizePhone(openid, field, value)
        cleared.push(field + ':anonymized')
      }
    }
  }
  if (scopes.includes('all')) {
    // 注销 / 撤回全部授权：清除全部微信身份字段（保留账号壳与业务数据）
    const identityFields = ['unionId', 'wechatOpenId']
    if (appType === 'miniprogram' || appType === 'service' || text(user.openId) === text(openid)) {
      identityFields.push('openId')
    }
    for (const field of identityFields) {
      if (text(user[field])) { data[field] = ''; cleared.push(field) }
    }
  } else if (appType === 'website' && text(user.wechatOpenId) === text(openid)) {
    // 网站应用渠道撤回时清理该渠道标识本身
    data.wechatOpenId = ''
    cleared.push('wechatOpenId')
  }
  return { data, cleared }
}

// 渠道集合清理：仅注销 / 撤回全部授权时执行
async function cleanChannelReferences(appType, openid, unionid) {
  const updates = []
  const record = (collection, updated) => {
    if (updated > 0) updates.push({ collection, updated })
  }
  if (appType === 'service' && openid) {
    const bindings = (await db.collection('service_account_bindings').where({ officialOpenId: openid }).limit(50).get()).data || []
    for (const row of bindings) {
      await db.collection('service_account_bindings').doc(row._id).update({
        data: { officialOpenId: '', subscribed: false, status: 'revoked', updateTime: db.serverDate() }
      })
    }
    record('service_account_bindings', bindings.length)
    const sessions = (await db.collection('service_entry_sessions').where({ officialOpenId: openid }).limit(50).get()).data || []
    for (const row of sessions) {
      await db.collection('service_entry_sessions').doc(row._id).update({
        data: { active: false, officialOpenId: '', unionId: '', updateTime: db.serverDate() }
      })
    }
    record('service_entry_sessions', sessions.length)
    const gates = (await db.collection('service_follow_gates').where({ officialOpenId: openid }).limit(100).get()).data || []
    for (const row of gates) {
      await db.collection('service_follow_gates').doc(row._id).update({
        data: { subscribed: false, officialOpenId: '', updateTime: db.serverDate() }
      })
    }
    record('service_follow_gates', gates.length)
    const scans = (await db.collection('service_entry_scans').where({ officialOpenId: openid }).limit(100).get()).data || []
    for (const row of scans) {
      await db.collection('service_entry_scans').doc(row._id).update({
        data: { subscribed: false, officialOpenId: '', updateTime: db.serverDate() }
      })
    }
    record('service_entry_scans', scans.length)
    const invites = (await db.collection('referee_invitations').where({ officialOpenId: openid }).limit(100).get()).data || []
    for (const row of invites) {
      await db.collection('referee_invitations').doc(row._id).update({
        data: { followStatus: 'revoked', officialOpenId: '', updateTime: db.serverDate() }
      })
    }
    record('referee_invitations', invites.length)
  }
  if (appType === 'miniprogram' && openid) {
    const bindings = (await db.collection('service_account_bindings').where({ miniOpenId: openid }).limit(50).get()).data || []
    for (const row of bindings) {
      await db.collection('service_account_bindings').doc(row._id).update({
        data: { miniOpenId: '', subscribed: false, status: 'revoked', updateTime: db.serverDate() }
      })
    }
    record('service_account_bindings', bindings.length)
    // 仅取消尚未发送的通知，历史已发送记录保留
    const pending = (await db.collection('notification_outbox')
      .where({ recipientMiniOpenId: openid, status: _.in(['queued', 'waiting_follow_bind']) }).limit(100).get()).data || []
    for (const row of pending) {
      await db.collection('notification_outbox').doc(row._id).update({
        data: { status: 'cancelled', recipientMiniOpenId: '', updateTime: db.serverDate() }
      })
    }
    record('notification_outbox', pending.length)
  }
  return updates
}

async function processOne(item) {
  const appType = text(item.appType)
  const openid = text(item.openid)
  const unionid = text(item.unionid)
  const eventType = text(item.eventType) || 'user_authorization_revoke'
  const scopes = item.scopes && item.scopes.length ? item.scopes : resolveScopes(appType, eventType, item.revokeInfo)
  const base = {
    sport: 'football',
    source: text(item.source) || 'manual',
    appType,
    appId: text(item.appId),
    eventType,
    revokeInfo: text(item.revokeInfo),
    scopes,
    openid,
    unionid,
    createTime: db.serverDate()
  }
  if (!openid && !unionid) return { ...base, status: 'invalid', error: 'missing openid/unionid' }
  if (!['miniprogram', 'service', 'website'].includes(appType)) return { ...base, status: 'invalid', error: 'invalid appType' }
  const relevant = scopes.filter(scope => ['nickname_avatar', 'phone', 'all'].includes(scope))
  if (!relevant.length) {
    // 撤回的授权范围（地址 / 发票 / 位置等）本系统从未收集，无需删除
    return writeLog({ ...base, status: 'no_relevant_scope', matchedUserIds: [], actions: [], channelUpdates: [] })
  }
  let users = []
  try {
    users = await findMatchedUsers(appType, openid, unionid)
    // 注销事件：微信号已死亡，unionid 下所有账号都无法再被本人命中，一并删除微信身份；
    // 普通 301 撤回仅处理当前渠道匹配到的用户，不跨账号扩散
    if (scopes.includes('all') && unionid && text(eventType).toLowerCase() === 'user_authorization_cancellation') {
      const matched = new Set(users.map(user => user._id))
      for (const user of await findUsersByUnionId(unionid)) {
        if (!matched.has(user._id)) users.push(user)
      }
    }
  } catch (error) {
    return writeLog({ ...base, status: 'failed', error: text(error.message || error) })
  }
  if (!users.length) {
    // 未匹配到本系统用户：仍执行渠道清理，并留痕
    const channelUpdates = scopes.includes('all') ? await cleanChannelReferences(appType, openid, unionid) : []
    return writeLog({ ...base, status: channelUpdates.length ? 'processed' : 'no_match', matchedUserIds: [], actions: [], channelUpdates })
  }
  const actions = []
  for (const user of users) {
    try {
      const { data, cleared } = buildUserUpdate(appType, scopes, openid, user)
      if (Object.keys(data).length) {
        data.updateTime = db.serverDate()
        await db.collection('users').doc(user._id).update({ data })
      }
      actions.push({ userId: user._id, cleared })
    } catch (error) {
      actions.push({ userId: user._id, error: text(error.message || error) })
    }
  }
  const channelUpdates = scopes.includes('all') ? await cleanChannelReferences(appType, openid, unionid) : []
  return writeLog({ ...base, status: 'processed', matchedUserIds: users.map(user => user._id), actions, channelUpdates })
}

async function writeLog(entry) {
  try {
    const added = await db.collection('authorization_revocation_logs').add({ data: entry })
    return { ...entry, logId: added._id }
  } catch (error) {
    const message = text(error.message || error)
    // 集合不存在时自动创建后重试（新环境首次运行自愈）
    if (message.includes('-502005') || message.includes('DATABASE_COLLECTION_NOT_EXIST') || message.includes('Db or Table not exist')) {
      try {
        await db.createCollection('authorization_revocation_logs')
        const added = await db.collection('authorization_revocation_logs').add({ data: entry })
        return { ...entry, logId: added._id }
      } catch (retryError) {
        console.error('[authorizationRevocation] audit log retry failed:', retryError.message || retryError)
      }
    } else {
      console.error('[authorizationRevocation] audit log failed:', message)
    }
    return { ...entry, auditFailed: true }
  }
}

async function processBatch(items, defaultScopes) {
  const list = Array.isArray(items) ? items.slice(0, 500) : []
  const results = []
  for (const item of list) {
    const merged = { ...item }
    if (defaultScopes && defaultScopes.length && !(Array.isArray(merged.scopes) && merged.scopes.length)) {
      merged.scopes = defaultScopes
    }
    results.push(await processOne(merged))
  }
  return {
    total: results.length,
    processed: results.filter(row => row.status === 'processed').length,
    noMatch: results.filter(row => row.status === 'no_match').length,
    noRelevantScope: results.filter(row => row.status === 'no_relevant_scope').length,
    invalid: results.filter(row => row.status === 'invalid').length,
    results
  }
}

async function history(limit) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200)
  const res = await db.collection('authorization_revocation_logs')
    .orderBy('createTime', 'desc').limit(safeLimit).get()
  return (res.data || []).map(row => ({
    _id: row._id,
    createTime: row.createTime,
    source: row.source,
    appType: row.appType,
    appId: row.appId,
    eventType: row.eventType,
    revokeInfo: row.revokeInfo,
    scopes: row.scopes,
    openid: row.openid,
    matchedUserIds: row.matchedUserIds,
    actions: row.actions,
    channelUpdates: row.channelUpdates,
    status: row.status,
    error: row.error || ''
  }))
}

exports.main = async event => {
  const params = event || {}
  try {
    if (params.action === 'processRevocation') {
      return { success: true, result: await processOne(params) }
    }
    if (params.action === 'processBatch') {
      const summary = await processBatch(params.items, params.defaultScopes)
      return { success: true, summary }
    }
    if (params.action === 'history') {
      return { success: true, logs: await history(params.limit) }
    }
    return { success: false, error: '不支持的操作: ' + text(params.action) }
  } catch (error) {
    console.error('[authorizationRevocation]', error.message || error)
    return { success: false, error: text(error.message || error) }
  }
}
