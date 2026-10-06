// 云函数：验证账号（手机号/邮箱）+ 密码登录
// 支持手机号或邮箱登录
const cloud = require('wx-server-sdk')
const crypto = require('crypto')

// 初始化云开发环境
cloud.init({
  env: cloud.SYMBOL_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

/**
 * 密码哈希（与注册时一致）
 */
function hashPassword(password, salt = '') {
  return crypto.createHash('sha256').update(password + salt).digest('hex')
}

/**
 * 验证密码
 */
async function verifyPassword(storedHash, inputPassword, salt = '') {
  const inputHash = hashPassword(inputPassword, salt)
  return storedHash === inputHash
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const { account, password } = event

  // 参数校验
  if (!account || !password) {
    return {
      success: false,
      error: '请输入账号和密码'
    }
  }

  try {
    let user = null
    let query = {}

    // 判断是手机号还是邮箱
    const isPhone = /^1[3-9]\d{9}$/.test(account)
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account)

    if (isPhone) {
      // 手机号登录
      query = {
        phone: account,
        passwordHash: _.exists(true)
      }
    } else if (isEmail) {
      // 邮箱登录
      query = {
        email: account,
        passwordHash: _.exists(true)
      }
    } else {
      return {
        success: false,
        error: '账号格式不正确（请输入手机号或邮箱）'
      }
    }

    // 查询用户
    const result = await db.collection('users').where(query).get()

    if (!result.data || result.data.length === 0) {
      return {
        success: false,
        error: '账号不存在或未设置密码'
      }
    }

    user = result.data[0]

    // 验证密码
    const isValid = await verifyPassword(user.passwordHash, password, user.salt || '')

    if (!isValid) {
      return {
        success: false,
        error: '密码错误'
      }
    }

    // 更新最后登录时间
    await db.collection('users').doc(user._id).update({
      lastLoginTime: new Date(),
      lastLoginType: 'password'
    })

    // 返回用户信息（不包含密码）
    const { passwordHash, salt, ...userInfo } = user

    return {
      success: true,
      user: userInfo,
      role: user.role || 'ORGANIZER'
    }

  } catch (err) {
    console.error('[verifyPassword] 错误:', err)
    return {
      success: false,
      error: err.message || '登录失败，请稍后重试'
    }
  }
}
