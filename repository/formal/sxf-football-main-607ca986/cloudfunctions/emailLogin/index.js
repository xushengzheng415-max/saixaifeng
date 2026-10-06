const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })

function hashPassword(password, salt) {
  const realSalt = salt || crypto.randomBytes(16).toString('hex')
  const hash = crypto.createHash('sha256').update(password + '|' + realSalt + '|').digest('hex')
  return { salt: realSalt, hash }
}

function verifyPassword(password, salt, hash) {
  return crypto.createHash('sha256').update(password + '|' + salt + '|').digest('hex') === hash
}

exports.main = async (event) => {
  const action = event.action || 'login'
  if (action !== 'login' && action !== 'passwordLogin') {
    return { success: false, error: '当前仅保留登录接口，请先使用登录流程' }
  }

  const db = cloud.database()
  const account = String(event.account || '').trim()
  const password = String(event.password || '')
  const loginType = event.loginType || (/^1[3-9]\d{9}$/.test(account) ? 'phone' : 'email')

  if (!account || !password) {
    return { success: false, error: '缺少账号或密码' }
  }

  const query = loginType === 'phone'
    ? db.command.or([{ phone: account }, { phoneNumber: account }])
    : { email: account }

  const usersRes = await db.collection('users').where(query).get()
  if (!usersRes.data || usersRes.data.length === 0) {
    return { success: false, error: loginType === 'phone' ? '该手机号未注册' : '该邮箱未注册' }
  }

  const user = usersRes.data[0]
  if (!user.passwordHash || !user.passwordSalt) {
    return { success: false, error: '该用户未设置密码，请先使用验证码登录' }
  }
  if (!verifyPassword(password, user.passwordSalt, user.passwordHash)) {
    return { success: false, error: '密码错误' }
  }

  const normalizedRole = (user.role || '').toLowerCase()
  return {
    success: true,
    message: '登录成功',
    needSetPassword: false,
    needBindPhone: !user.phone && !user.phoneNumber,
    needBindEmail: !user.email,
    needSelectRole: !user.role,
    role: normalizedRole,
    user: {
      _id: user._id,
      openId: user.openId || user.wechatOpenId || '',
      email: user.email || '',
      phone: user.phone || user.phoneNumber || '',
      phoneNumber: user.phoneNumber || user.phone || '',
      role: normalizedRole,
      nickName: user.nickName || '',
      avatarUrl: user.avatarUrl || ''
    }
  }
}
