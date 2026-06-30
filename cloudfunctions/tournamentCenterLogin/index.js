// tournamentCenterLogin 云函数
// 赛事中心独立登录 — 手机号+密码登录
// 零 SDK 模式：前端通过 callFunction('tournamentCenterLogin', ...) 调用
const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })

// ========== 种子数据 ==========
const SEED_USERS = [
  { phone: '17319716663', role: 'super_admin', displayName: 'Frank' },
  { phone: '13930102923', role: 'super_admin', displayName: '管理员' }
]

// ========== 密码工具 ==========

/** 生成密码哈希（salt:hash 格式） */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.createHash('sha256').update(password + '|' + salt + '|').digest('hex')
  return salt + ':' + hash
}

/** 验证密码 */
function verifyPassword(password, storedPassword) {
  const parts = storedPassword.split(':')
  if (parts.length !== 2) return false
  const [salt, hash] = parts
  const check = crypto.createHash('sha256').update(password + '|' + salt + '|').digest('hex')
  return check === hash
}

/** 生成登录 token */
function generateToken() {
  return crypto.randomBytes(32).toString('hex')
}

// ========== 种子数据初始化 ==========

async function ensureSeedUsers(db) {
  for (const seed of SEED_USERS) {
    try {
      const exist = await db.collection('tournament_center_users')
        .where({ phone: seed.phone })
        .count()
      if (exist.total > 0) continue
    } catch (e) {
      // 集合可能不存在，跳过 count 直接尝试 add
      console.log('[tournamentCenterLogin] count 失败，尝试 add 创建集合:', e.message?.slice(0, 50))
    }
    
    // 检查是否已存在（直接用 get，比 count 更可靠）
    try {
      const getResult = await db.collection('tournament_center_users')
        .where({ phone: seed.phone })
        .get()
      if (getResult.data && getResult.data.length > 0) continue
    } catch (e) {
      console.log('[tournamentCenterLogin] get 失败:', e.message?.slice(0, 50))
    }

    // 添加种子用户
    try {
      await db.collection('tournament_center_users').add({
        data: {
          phone: seed.phone,
          role: seed.role,
          displayName: seed.displayName,
          status: 'active',
          createdBy: 'system',
          createdAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      })
      console.log('[tournamentCenterLogin] 种子用户已创建:', seed.phone)
    } catch (e) {
      console.error('[tournamentCenterLogin] 种子用户创建失败:', seed.phone, e.message)
    }
  }
}

// ========== 主函数 ==========

exports.main = async (event) => {
  const { phone, password } = event
  const db = cloud.database()

  try {
    // 确保种子数据存在
    await ensureSeedUsers(db)

    // 参数校验
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return { success: false, error: '请输入正确的手机号' }
    }

    // 查找用户
    const result = await db.collection('tournament_center_users')
      .where({ phone })
      .get()

    if (!result.data || result.data.length === 0) {
      return { success: false, error: '账号不存在，请联系管理员添加' }
    }

    const user = result.data[0]

    // 检查账号状态
    if (user.status === 'disabled') {
      return { success: false, error: '账号已被禁用，请联系管理员' }
    }

    // 检查是否首次登录（没有密码）
    if (!user.password) {
      return {
        success: true,
        needSetPassword: true,
        phone: user.phone,
        user: {
          phone: user.phone,
          role: user.role,
          displayName: user.displayName
        }
      }
    }

    // 密码登录验证
    if (!password) {
      return { success: false, error: '请输入密码' }
    }

    if (!verifyPassword(password, user.password)) {
      return { success: false, error: '密码错误' }
    }

    // 生成 token
    const token = generateToken()

    // 更新最后登录时间
    await db.collection('tournament_center_users').doc(user._id).update({
      data: {
        lastLoginAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    })

    return {
      success: true,
      token,
      user: {
        phone: user.phone,
        role: user.role,
        displayName: user.displayName
      }
    }
  } catch (err) {
    console.error('[tournamentCenterLogin] 错误:', err)
    return { success: false, error: err.message || '登录服务异常' }
  }
}
