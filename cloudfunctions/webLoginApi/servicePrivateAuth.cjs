'use strict'

const { readAll, readByIds } = require('./data-center/reader.cjs')

const text = value => typeof value === 'string' ? value.trim() : ''
const unique = values => [...new Set(values.map(text).filter(Boolean))]
const fail = (code, error) => ({ success: false, code, error })

/**
 * 服务号 H5 会话鉴权（与 servicePrivate.cjs 同一套 referee_h5_sessions 规则）。
 * 只用于卡世界入口：会话 -> 服务号 OpenID -> 已绑定/已核验手机号 -> 唯一 users 账号。
 */
module.exports = function createServicePrivateAuth({ cloud, hashSessionToken }) {
  async function safeReadAll(db, collection, where, fields) {
    try {
      return await readAll(db, collection, where, { fields, maxRows: 5000 })
    } catch (error) {
      /* 绑定表尚未建立时按“无绑定”处理，随后走服务号身份手机号核验。 */
      console.warn('[servicePrivateAuth] 读取失败:', collection, String((error && (error.errMsg || error.message)) || error).slice(0, 160))
      return []
    }
  }

  async function authenticate(event) {
    const db = cloud.database()
    const command = db.command
    const token = text(event && event.serviceSessionToken)
    if (!/^[a-f0-9]{64}$/.test(token)) return fail('SERVICE_PRIVATE_AUTH_REQUIRED', '请重新连接微信')

    const sessionResult = await db.collection('referee_h5_sessions').where({
      tokenHash: hashSessionToken(token),
      active: true,
      expiresAt: command.gt(new Date())
    }).limit(2).get()
    const sessions = (sessionResult && sessionResult.data) || []
    if (sessions.length !== 1 || !text(sessions[0].serviceAccountOpenId)) {
      return fail('SERVICE_PRIVATE_AUTH_REQUIRED', '请重新连接微信')
    }
    const session = sessions[0]
    const openId = text(session.serviceAccountOpenId)

    const allBindings = await safeReadAll(db, 'service_account_bindings',
      { sport: 'football', officialOpenId: openId },
      { userId: true, status: true, active: true, disabled: true })
    const bindings = allBindings.filter(row => row.active !== false && row.disabled !== true &&
      !['revoked', 'replaced', 'deleted', 'unbound', 'disabled'].includes(text(row.status)))
    const boundIds = unique(bindings.map(row => row.userId))
    if (boundIds.length > 1) return fail('SERVICE_PRIVATE_ACCOUNT_CONFLICT', '微信绑定存在冲突，请联系管理员核对')

    const userFields = { phone: true, phoneNumber: true, phoneVerified: true, status: true, disabled: true }
    let users = boundIds.length ? await readByIds(db, 'users', '_id', boundIds, { fields: userFields, maxRows: 5000 }) : []

    /* 无订阅绑定时，裁判身份的手机号核验同样可作为独立且已验证的绑定。 */
    if (!boundIds.length && !allBindings.length) {
      const identities = await safeReadAll(db, 'service_identities', { serviceAccountOpenId: openId }, { phone: true, phoneVerified: true })
      if (identities.length > 1) return fail('SERVICE_PRIVATE_ACCOUNT_CONFLICT', '微信绑定存在冲突，请联系管理员核对')
      const identity = identities[0]
      if (identity && identity.phoneVerified === true && /^1[3-9]\d{9}$/.test(text(identity.phone))) {
        users = await safeReadAll(db, 'users', db.command.or([{ phone: text(identity.phone) }, { phoneNumber: text(identity.phone) }]), userFields)
      }
    }

    if (!users.length) return { success: true, needsBinding: true }
    if (users.length !== 1) return fail('SERVICE_PRIVATE_ACCOUNT_CONFLICT', '手机号存在重复账号，请联系管理员核对')

    const user = users[0]
    const uid = text(user._id)
    const phone = text(user.phone || user.phoneNumber)
    if (user.phoneVerified !== true || !/^1[3-9]\d{9}$/.test(phone)) return { success: true, needsBinding: true }

    const canonical = await safeReadAll(db, 'users', db.command.or([{ phone }, { phoneNumber: phone }]), { phone: true, phoneNumber: true })
    if (canonical.length !== 1 || canonical[0]._id !== uid ||
      (text(user.phone) && text(user.phoneNumber) && user.phone !== user.phoneNumber)) {
      return fail('SERVICE_PRIVATE_ACCOUNT_CONFLICT', '手机号存在重复账号，请联系管理员核对')
    }
    if (['deleted', 'disabled', 'banned'].includes(text(user.status)) || user.disabled === true) {
      return fail('SERVICE_PRIVATE_ACCOUNT_UNAVAILABLE', '账号暂不可用，请联系管理员')
    }
    return { success: true, user, session }
  }

  return authenticate
}
