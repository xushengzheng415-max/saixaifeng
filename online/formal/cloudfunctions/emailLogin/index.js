// emailLogin 云函数（完整版）
// 支持：发送验证码、验证验证码、密码登录、设置密码、忘记密码、重置密码
const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: 'cloud1-7g8ckb3c7815a011' })

// ========== 配置 ==========
const CODE_EXPIRE_MS = 10 * 60 * 1000   // 验证码10分钟有效
const RESET_TOKEN_EXPIRE_MS = 1 * 60 * 60 * 1000  // 重置令牌1小时有效

// ========== 工具函数 ==========

// 密码规则验证：必须同时包含大写字母 + 小写字母 + 数字
function validatePassword(password) {
  if (password.length < 8) {
    return { valid: false, message: '密码长度至少8位' }
  }
  const hasUpper = /[A-Z]/.test(password)
  const hasLower = /[a-z]/.test(password)
  const hasDigit = /[0-9]/.test(password)
  if (!hasUpper || !hasLower || !hasDigit) {
    return { valid: false, message: '密码必须同时包含大写字母、小写字母和数字' }
  }
  return { valid: true }
}

// 密码哈希（使用 SHA-256 + salt，轻量无需安装 bcrypt）
function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex')
  const hash = crypto.createHash('sha256').update(password + '|' + s + '|').digest('hex')
  return { salt: s, hash: hash }
}

// 验证密码
function verifyPassword(password, salt, hash) {
  const check = crypto.createHash('sha256').update(password + '|' + salt + '|').digest('hex')
  return check === hash
}

// 生成重置令牌
function generateResetToken() {
  return crypto.randomBytes(32).toString('hex')
}

// 发送验证邮件 / 重置密码邮件
async function sendEmail(email, subject, htmlContent) {
  const smtpUser = process.env.SMTP_USER || ''
  const smtpPass = process.env.SMTP_PASS || ''
  
  if (!smtpUser || !smtpPass) {
    console.log(`[emailLogin] 【开发模式】邮件未发送：email=${email}, subject=${subject}`)
    return { success: true, sent: false }
  }
  
  try {
    const nodemailer = require('nodemailer')
    const transporter = nodemailer.createTransport({
      host: 'smtp.yeah.net',
      port: 465,
      secure: true,
      auth: { user: smtpUser, pass: smtpPass }
    })
    await transporter.sendMail({
      from: `"赛小蜂" <${smtpUser}>`,
      to: email,
      subject: subject,
      html: htmlContent
    })
    console.log(`[emailLogin] 邮件发送成功：email=${email}`)
    return { success: true, sent: true }
  } catch (e) {
    console.error('[emailLogin] 邮件发送失败：', e.message || e)
    return { success: false, error: '邮件发送失败：' + (e.message || 'SMTP连接异常') }
  }
}

// 生成6位数字验证码
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// ========== 主函数 ==========
exports.main = async (event, context) => {
  const { action } = event
  const db = cloud.database()
  
  try {
    switch (action) {
      case 'sendCode':
        return await handleSendCode(db, event)
      case 'verifyCode':
        return await handleVerifyCode(db, event)
      case 'login':
      case 'passwordLogin':  // 兼容前端调用的别名
        return await handleLogin(db, event)
      case 'setPassword':
        return await handleSetPassword(db, event)
      case 'forgotPassword':
        return await handleForgotPassword(db, event)
      case 'resetPassword':
        return await handleResetPassword(db, event)
      case 'checkEmail':
        return await handleCheckEmail(db, event)
      case 'bindEmail':
        return await handleBindEmail(db, event)
      case 'getUserInfo':
        return await handleGetUserInfo(db, event)
      case 'setRole':
        return await handleSetRole(db, event)
      default:
        return { success: false, error: '未知操作：' + action }
    }
  } catch (err) {
    console.error('[emailLogin] 错误：', err)
    return { success: false, error: err.message }
  }
}

// 发送验证码
async function handleSendCode(db, event) {
  const { email, purpose } = event
  if (!email) return { success: false, error: '缺少邮箱地址' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: '邮箱格式不正确' }
  }
  
  // 检查发送频率（同一邮箱1分钟内只能发一次）
  const recentSent = await db.collection('email_verification')
    .where({
      email: email,
      createTime: db.command.gt(new Date(Date.now() - 60 * 1000))
    }).count()
  if (recentSent.total > 0) {
    return { success: false, error: '发送过于频繁，请1分钟后再试' }
  }
  
  const code = generateCode()
  const now = new Date()
  const expireTime = new Date(now.getTime() + CODE_EXPIRE_MS)
  
  await db.collection('email_verification').add({
    data: {
      email: email,
      code: String(code),
      purpose: purpose || 'login',
      createTime: db.serverDate(),
      expireTime: expireTime,
      used: false
    }
  })
  
  const emailContent = `
    <!DOCTYPE html>
    <html><head><meta charset="UTF-8"><style>
    body { font-family: sans-serif; padding: 20px; }
    .code { font-size: 32px; font-weight: bold; color: #1B5E20; letter-spacing: 6px; }
    </style></head><body>
    <p>尊敬的 <strong>${email}</strong>，您好！</p>
    <p>您的验证码是：</p>
    <div class="code">${code}</div>
    <p>验证码 10 分钟内有效，请及时使用。</p>
    <p style="color:#999;font-size:12px;">如非本人操作，请忽略此邮件。</p>
    </body></html>
  `
  const sendResult = await sendEmail(email, '赛小蜂 - 邮箱验证码', emailContent)
  
  return {
    success: true,
    message: sendResult.sent ? '验证码已发送到邮箱，请查收' : '验证码已生成',
    sent: sendResult.sent || false
  }
}

// 验证验证码（邮箱登录）
async function handleVerifyCode(db, event) {
  const email = String(event.email || '').trim().toLowerCase()
  const code = String(event.code || '').trim()
  if (!email || !code) return { success: false, error: '缺少邮箱或验证码' }
  
  let records = await db.collection('email_verification')
    .where({ email: email, code: code, used: false })
    .orderBy('createTime', 'desc').limit(1).get()
    
  if (!records.data || records.data.length === 0) {
    const codeNum = parseInt(code, 10)
    if (!isNaN(codeNum)) {
      records = await db.collection('email_verification')
        .where({ email: email, code: codeNum, used: false })
        .orderBy('createTime', 'desc').limit(1).get()
    }
  }
    
  if (!records.data || records.data.length === 0) {
    return { success: false, error: '验证码不存在或已使用' }
  }
    
  const record = records.data[0]
  if (new Date(record.expireTime) < new Date()) {
    return { success: false, error: '验证码已过期，请重新获取' }
  }
    
  // 标记为已使用
  await db.collection('email_verification').doc(record._id).update({
    data: { used: true, useTime: db.serverDate() }
  })
    
  // 查询或创建用户
  let user = null
  let isNewUser = false
  try {
    const users = await db.collection('users').where({ email: email }).get()
    if (!users.data || users.data.length === 0) {
      const newUser = await db.collection('users').add({
        data: {
          email: email,
          phone: '',
          role: '',  // 首次登录让前端弹身份选择
          passwordSet: false,
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      })
      user = { _id: newUser._id, email: email, role: '', passwordSet: false }
      isNewUser = true
    } else {
      user = users.data[0]
    }
  } catch (userErr) {
    return { success: false, error: '登录失败：' + (userErr.message || '用户数据错误') }
  }
    
  // 角色统一转小写，与前端 permissions.js 保持一致
  // 注意：role 为空时返回空字符串，由前端根据 needSelectRole 决定是否弹窗
  const normalizedRole = (user.role || '').toLowerCase()
  return {
    success: true,
    message: isNewUser ? '注册并登录成功' : '登录成功',
    needSetPassword: !user.passwordSet,
    needBindPhone: !user.phone,
    needSelectRole: !user.role,  // 角色为空时需要选择身份
    role: normalizedRole,
    user: {
      _id: user._id,
      email: user.email,
      phone: user.phone || '',
      role: normalizedRole
    }
  }
}

// 邮箱+密码 或 手机号+密码 登录
async function handleLogin(db, event) {
  const { account, password, loginType } = event
  // loginType: 'email' | 'phone'，未传则自动根据 account 格式判断
  const autoLoginType = loginType || (/^1[3-9]\d{9}$/.test(account) ? 'phone' : 'email')
  if (!account || !password) {
    return { success: false, error: '缺少账号或密码' }
  }

  const whereCond = autoLoginType === 'phone'
    ? { phone: account }
    : { email: account }
    
  const users = await db.collection('users').where(whereCond).get()
    
  if (!users.data || users.data.length === 0) {
    return { success: false, error: autoLoginType === 'phone' ? '该手机号未注册' : '该邮箱未注册' }
  }
    
  const user = users.data[0]
    
  if (!user.passwordHash || !user.passwordSalt) {
    return { success: false, error: '该账号未设置密码，请使用验证码登录' }
  }
    
  if (!verifyPassword(password, user.passwordSalt, user.passwordHash)) {
    return { success: false, error: '密码错误' }
  }
    
  // 角色统一转小写，与前端 permissions.js 保持一致
  // 注意：role 为空时返回空字符串，由前端根据 needSelectRole 决定是否弹窗
  const normalizedRole = (user.role || '').toLowerCase()
  return {
    success: true,
    message: '登录成功',
    needSetPassword: false,
    needBindPhone: !user.phone,
    needBindEmail: !user.email,
    needSelectRole: !user.role,  // 兼容：老数据没角色也要选择
    role: normalizedRole,
    user: {
      _id: user._id,
      email: user.email || '',
      phone: user.phone || '',
      role: normalizedRole
    }
  }
}

// 设置密码（首次强制设置 或 登录后修改）
async function handleSetPassword(db, event) {
  const { email, phone, password, userId } = event
    
  if (!password) return { success: false, error: '缺少密码' }
    
  const validation = validatePassword(password)
  if (!validation.valid) {
    return { success: false, error: validation.message }
  }
    
  // 按 userId 或 email 或 phone 查找用户
  let whereCond = {}
  if (userId) whereCond._id = userId
  else if (email) whereCond.email = email
  else if (phone) whereCond.phone = phone
  else return { success: false, error: '缺少用户标识' }
    
  const users = await db.collection('users').where(whereCond).get()
  if (!users.data || users.data.length === 0) {
    return { success: false, error: '用户不存在' }
  }
    
  const user = users.data[0]
  const { salt, hash } = hashPassword(password)
    
  await db.collection('users').doc(user._id).update({
    data: {
      passwordHash: hash,
      passwordSalt: salt,
      passwordSet: true,
      updateTime: db.serverDate()
    }
  })
    
  return { success: true, message: '密码设置成功' }
}

// 忘记密码 —— 生成重置令牌，发邮件
async function handleForgotPassword(db, event) {
  const { email } = event
  if (!email) return { success: false, error: '缺少邮箱地址' }
    
  const users = await db.collection('users').where({ email: email }).get()
  if (!users.data || users.data.length === 0) {
    // 出于安全考虑，即使用户不存在也返回成功（防止枚举邮箱）
    console.log(`[forgotPassword] 邮箱未注册：${email}`)
    return { success: true, message: '如果该邮箱已注册，重置邮件已发送' }
  }
    
  // 生成重置令牌
  const token = generateResetToken()
  const now = new Date()
  const expireAt = new Date(now.getTime() + RESET_TOKEN_EXPIRE_MS)
    
  // 存入 tokens 集合（复用 email_verification 表，或新建 password_reset_tokens）
  // 这里用 email_verification 表，purpose 标记为 reset
  await db.collection('email_verification').add({
    data: {
      email: email,
      token: token,
      purpose: 'password_reset',
      createTime: db.serverDate(),
      expireTime: expireAt,
      used: false
    }
  })
    
  // 构造重置链接（指向静态托管上的重置页面）
  const resetUrl = `https://cloud1-7g8ckb3c7815a011-1419431905.tcloudbaseapp.com/reset-password.html?token=${token}&email=${encodeURIComponent(email)}`
    
  const emailContent = `
    <!DOCTYPE html>
    <html><head><meta charset="UTF-8"><style>
    body { font-family: sans-serif; padding: 20px; color: #333; }
    .btn { display: inline-block; padding: 12px 24px; background: #1B5E20; color: #fff; 
          text-decoration: none; border-radius: 6px; margin: 16px 0; }
    .warn { color: #e65100; font-size: 13px; }
    </style></head><body>
    <p>尊敬的 <strong>${email}</strong>，您好！</p>
    <p>我们收到了您的密码重置请求。请点击下方按钮设置新密码：</p>
    <p><a href="${resetUrl}" class="btn">重置密码</a></p>
    <p>或复制以下链接到浏览器：</p>
    <p style="word-break:break-all;color:#666;font-size:13px;">${resetUrl}</p>
    <p class="warn">⚠️ 该链接 1 小时内有效，且只能使用一次。</p>
    <p style="color:#999;font-size:12px;">如非本人操作，请忽略此邮件，您的账号依然安全。</p>
    </body></html>
  `
  const sendResult = await sendEmail(email, '赛小蜂 - 重置密码', emailContent)
    
  if (!sendResult.sent) {
    console.warn(`[forgotPassword] 邮件发送失败，但令牌已生成：email=${email}`)
  }
    
  return { success: true, message: '如果该邮箱已注册，重置邮件已发送，请查收' }
}

// 重置密码（通过邮件令牌）
async function handleResetPassword(db, event) {
  const { email, token, newPassword } = event
  if (!email || !token || !newPassword) {
    return { success: false, error: '缺少必要参数' }
  }
    
  const validation = validatePassword(newPassword)
  if (!validation.valid) {
    return { success: false, error: validation.message }
  }
    
  // 查找令牌
  const tokens = await db.collection('email_verification')
    .where({
      email: email,
      token: token,
      purpose: 'password_reset',
      used: false
    })
    .orderBy('createTime', 'desc').limit(1).get()
    
  if (!tokens.data || tokens.data.length === 0) {
    return { success: false, error: '重置链接无效或已过期' }
  }
    
  const tokenRecord = tokens.data[0]
  if (new Date(tokenRecord.expireTime) < new Date()) {
    return { success: false, error: '重置链接已过期，请重新申请' }
  }
    
  // 标记令牌已使用
  await db.collection('email_verification').doc(tokenRecord._id).update({
    data: { used: true }
  })
    
  // 更新用户密码
  const users = await db.collection('users').where({ email: email }).get()
  if (!users.data || users.data.length === 0) {
    return { success: false, error: '用户不存在' }
  }
    
  const user = users.data[0]
  const { salt, hash } = hashPassword(newPassword)
    
  await db.collection('users').doc(user._id).update({
    data: {
      passwordHash: hash,
      passwordSalt: salt,
      passwordSet: true,
      updateTime: db.serverDate()
    }
  })
    
  return { success: true, message: '密码重置成功，请使用新密码登录' }
}

// 检查邮箱是否已注册
async function handleCheckEmail(db, event) {
  const { email } = event
  if (!email) return { success: false, error: '缺少邮箱地址' }
  const users = await db.collection('users').where({ email: email }).count()
  return { success: true, exists: users.total > 0 }
}

// 绑定邮箱（已登录状态下，检查唯一性）
async function handleBindEmail(db, event) {
  const { email, userId } = event
  if (!email || !userId) return { success: false, error: '缺少必要参数' }
    
  // 检查邮箱是否已被其他用户使用
  const existingUsers = await db.collection('users').where({ email: email }).get()
  if (existingUsers.data && existingUsers.data.length > 0) {
    const existing = existingUsers.data[0]
    if (existing._id !== userId) {
      return { success: false, error: '该邮箱已被其他账号绑定' }
    }
  }
    
  await db.collection('users').doc(userId).update({
    data: { email: email, updateTime: db.serverDate() }
  })
    
  return { success: true, message: '邮箱绑定成功' }
}

// 获取用户完整信息
async function handleGetUserInfo(db, event) {
  const { email, phone, userId } = event
  if (!email && !phone && !userId) {
    return { success: false, error: '缺少用户标识' }
  }
  try {
    let whereCondition = {}
    if (userId) whereCondition._id = userId
    else if (email) whereCondition.email = email
    else if (phone) whereCondition.phone = phone
      
    const users = await db.collection('users').where(whereCondition).get()
    if (!users.data || users.data.length === 0) {
      return { success: false, error: '用户不存在' }
    }
    const user = users.data[0]
    const { passwordHash, passwordSalt, ...safeUser } = user
    return { success: true, user: safeUser }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// 设置用户身份（首次登录选择身份）
async function handleSetRole(db, event) {
  const { role, userId } = event

  // 验证角色合法性
  const VALID_ROLES = ['organizer', 'coach', 'referee', 'admin']
  if (!role || !VALID_ROLES.includes(role.toLowerCase())) {
    return { success: false, error: '无效的角色类型' }
  }

  if (!userId) {
    return { success: false, error: '缺少用户ID' }
  }

  try {
    // 更新用户角色
    await db.collection('users').doc(userId).update({
      data: {
        role: role.toLowerCase(),
        updateTime: db.serverDate()
      }
    })

    return {
      success: true,
      message: '身份设置成功',
      role: role.toLowerCase()
    }
  } catch (err) {
    console.error('[emailLogin] setRole 错误：', err)
    return { success: false, error: err.message }
  }
}
