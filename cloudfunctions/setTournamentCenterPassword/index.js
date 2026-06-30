// setTournamentCenterPassword 云函数
// 赛事中心 — 首次设置密码（只能设置一次）
const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })

// ========== 密码工具 ==========

/** 生成密码哈希（salt:hash 格式） */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.createHash('sha256').update(password + '|' + salt + '|').digest('hex')
  return salt + ':' + hash
}

// ========== 主函数 ==========

exports.main = async (event) => {
  const { phone, password } = event
  const db = cloud.database()

  try {
    // 参数校验
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return { success: false, error: '请输入正确的手机号' }
    }

    if (!password) {
      return { success: false, error: '请输入密码' }
    }

    // 密码强度校验
    if (password.length < 6) {
      return { success: false, error: '密码长度至少6位' }
    }

    // 查找用户
    const result = await db.collection('tournament_center_users')
      .where({ phone })
      .get()

    if (!result.data || result.data.length === 0) {
      return { success: false, error: '账号不存在' }
    }

    const user = result.data[0]

    // 检查账号状态
    if (user.status === 'disabled') {
      return { success: false, error: '账号已被禁用' }
    }

    // 密码只能设置一次
    if (user.password) {
      return { success: false, error: '密码已设置，如需修改请联系超级管理员' }
    }

    // 设置密码
    const hashedPassword = hashPassword(password)

    await db.collection('tournament_center_users').doc(user._id).update({
      data: {
        password: hashedPassword,
        updatedAt: db.serverDate()
      }
    })

    console.log('[setTournamentCenterPassword] 密码设置成功:', phone)
    return { success: true, message: '密码设置成功' }
  } catch (err) {
    console.error('[setTournamentCenterPassword] 错误:', err)
    return { success: false, error: err.message || '设置密码失败' }
  }
}
