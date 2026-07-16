const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })

function verifyPassword(password, salt, hash) {
  return crypto.createHash('sha256').update(password + '|' + salt + '|').digest('hex') === hash
}

async function normalizeOrganizer(db, user) {
  if (String((user && user.role) || '').toLowerCase() !== 'organizer') {
    await db.collection('users').doc(user._id).update({
      data: { role: 'organizer', updateTime: db.serverDate() }
    })
  }
  return Object.assign({}, user, { role: 'organizer' })
}

exports.main = async (event) => {
  return { success: false, error: '当前仅支持微信登录' }
  /* istanbul ignore next */
  const action = event.action || 'phonePasswordLogin'
  const db = cloud.database()
  const _ = db.command

  try {
    switch (action) {
      case 'verifyCode':
        return await handleVerifyCode(db, _, event.phoneNumber, event.code)
      case 'phonePasswordLogin':
      case 'passwordLogin':
        return await handlePhonePasswordLogin(db, _, event.phoneNumber || event.account, event.password)
      default:
        return { success: false, error: '未支持的操作: ' + action }
    }
  } catch (err) {
    console.error('[phoneLogin] 错误：', err)
    return { success: false, error: err.message }
  }
}

async function handleVerifyCode(db, _, phoneNumber, code) {
  if (!phoneNumber || !code) {
    return { success: false, error: '缺少手机号或验证码' }
  }

  const smsResult = await db.collection('sms_codes')
    .where({ phoneNumber: phoneNumber, code: code, used: false })
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get()

  if (!smsResult.data || smsResult.data.length === 0) {
    return { success: false, error: '验证码错误或已过期' }
  }

  const existUser = await db.collection('users').where(
    _.or([{ phone: phoneNumber }, { phoneNumber: phoneNumber }])
  ).limit(2).get()

  const users = existUser.data || []
  if (users.length > 1) return { success: false, error: '手机号存在重复账号，请联系管理员处理' }
  let user
  if (users.length === 0) {
    const created = await db.collection('users').add({
      data: {
        phone: phoneNumber, phoneNumber: phoneNumber, phoneVerified: true,
        role: 'organizer', email: '', passwordSet: false,
        createTime: db.serverDate(), updateTime: db.serverDate()
      }
    })
    user = { _id: created._id, phone: phoneNumber, phoneNumber: phoneNumber, role: 'organizer', email: '', passwordSet: false }
  } else {
    user = await normalizeOrganizer(db, users[0])
  }
  await db.collection('sms_codes').doc(smsResult.data[0]._id).update({
    data: { used: true, usedAt: db.serverDate() }
  })

  const normalizedRole = 'organizer'
  return {
    success: true,
    message: '登录成功',
    needSetPassword: !user.passwordSet,
    needBindEmail: !user.email,
    needSelectRole: false,
    role: normalizedRole,
    user: {
      _id: user._id,
      phone: user.phone || user.phoneNumber || '',
      phoneNumber: user.phoneNumber || user.phone || '',
      email: user.email || '',
      role: normalizedRole
    }
  }
}

async function handlePhonePasswordLogin(db, _, phoneNumber, password) {
  if (!phoneNumber || !password) {
    return { success: false, error: '缺少手机号或密码' }
  }

  const users = await db.collection('users').where(
    _.or([{ phone: phoneNumber }, { phoneNumber: phoneNumber }])
  ).limit(2).get()

  if (!users.data || users.data.length === 0) {
    return { success: false, error: '该手机号未注册' }
  }
  if (users.data.length > 1) return { success: false, error: '手机号存在重复账号，请联系管理员处理' }

  let user = users.data[0]
  if (!user.passwordHash || !user.passwordSalt) {
    return { success: false, error: '该用户未设置密码，请使用验证码登录' }
  }
  if (!verifyPassword(password, user.passwordSalt, user.passwordHash)) {
    return { success: false, error: '密码错误' }
  }
  user = await normalizeOrganizer(db, user)

  const normalizedRole = 'organizer'
  return {
    success: true,
    message: '登录成功',
    needSetPassword: false,
    needBindEmail: !user.email,
    needSelectRole: false,
    role: normalizedRole,
    user: {
      _id: user._id,
      phone: user.phone || user.phoneNumber || '',
      phoneNumber: user.phoneNumber || user.phone || '',
      email: user.email || '',
      role: normalizedRole
    }
  }
}
