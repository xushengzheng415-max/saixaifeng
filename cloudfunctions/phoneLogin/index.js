const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })

function verifyPassword(password, salt, hash) {
  return crypto.createHash('sha256').update(password + '|' + salt + '|').digest('hex') === hash
}

exports.main = async (event) => {
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

  await db.collection('sms_codes').doc(smsResult.data[0]._id).update({
    data: { used: true, usedAt: db.serverDate() }
  })

  const existUser = await db.collection('users').where(
    _.or([{ phone: phoneNumber }, { phoneNumber: phoneNumber }])
  ).get()

  let user
  if (!existUser.data || existUser.data.length === 0) {
    const newUser = await db.collection('users').add({
      data: {
        phone: phoneNumber,
        phoneNumber: phoneNumber,
        email: '',
        role: '',
        passwordSet: false,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })
    user = { _id: newUser._id, phone: phoneNumber, phoneNumber: phoneNumber, email: '', role: '' }
  } else {
    user = existUser.data[0]
  }

  const normalizedRole = (user.role || '').toLowerCase()
  return {
    success: true,
    message: '登录成功',
    needSetPassword: !user.passwordSet,
    needBindEmail: !user.email,
    needSelectRole: !user.role,
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
  ).get()

  if (!users.data || users.data.length === 0) {
    return { success: false, error: '该手机号未注册' }
  }

  const user = users.data[0]
  if (!user.passwordHash || !user.passwordSalt) {
    return { success: false, error: '该用户未设置密码，请使用验证码登录' }
  }
  if (!verifyPassword(password, user.passwordSalt, user.passwordHash)) {
    return { success: false, error: '密码错误' }
  }

  const normalizedRole = (user.role || '').toLowerCase()
  return {
    success: true,
    message: '登录成功',
    needSetPassword: false,
    needBindEmail: !user.email,
    needSelectRole: !user.role,
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
