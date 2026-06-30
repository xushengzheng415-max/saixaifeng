// verifySmsCode - 赛小蜂短信验证码校验云函数
const cloud = require('wx-server-sdk')
const crypto = require('crypto')
cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })

// 密码哈希函数
function hashPassword(password, salt = '') {
  return crypto.createHash('sha256').update(password + salt).digest('hex')
}

// ★ 手机号→角色映射表（已知的管理员账号自动识别）
var PHONE_ROLE_MAP = {
  '15038292130': 'organizer',   // 主办方管理账号
  '17319716663': 'coach'        // 教练账号
}

exports.main = async (event) => {
  const { phoneNumber, code, bindToUser = false, password } = event

  // 参数校验
  if (!phoneNumber || !/^1[3-9]\d{9}$/.test(phoneNumber)) {
    return { success: false, error: '手机号格式不正确' }
  }
  if (!code || !/^\d{6}$/.test(code)) {
    return { success: false, error: '验证码格式不正确' }
  }

  const db = cloud.database()
  const _ = db.command
  const now = new Date()

  try {
    // 查找最新的有效验证码
    const result = await db.collection('sms_codes')
      .where({
        phoneNumber,
        code,
        used: false,
        expireAt: _.gt(now),
      })
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get()

    if (result.data.length === 0) {
      return { success: false, error: '验证码错误或已过期' }
    }

    // 标记为已使用
    const recordId = result.data[0]._id
    await db.collection('sms_codes').doc(recordId).update({
      data: {
        used: true,
        usedAt: db.serverDate(),
      }
    })

    // ========== 查询或创建用户（以手机号为唯一标识）==========
    // ★ 同时查询 phone 和 phoneNumber 字段（兼容网页端/小程序端）
    let user = null
    let isNewUser = false

    const userRes = await db.collection('users')
      .where(_.or([
        { phone: phoneNumber },
        { phoneNumber: phoneNumber }
      ]))
      .get()

    if (userRes.data && userRes.data.length > 0) {
      // 已有用户，更新登录时间
      user = userRes.data[0]

      // ★ 如果角色为空但手机号在映射表中 → 自动补角色
      var mappedRole = PHONE_ROLE_MAP[phoneNumber]
      if ((!user.role || user.role === '') && mappedRole) {
        console.log('[verifySmsCode] 补充角色:', phoneNumber, '→', mappedRole)
        user.role = mappedRole
        await db.collection('users').doc(user._id).update({
          data: {
            role: mappedRole,
            lastLoginTime: db.serverDate(),
            lastLoginType: 'phone',
            updateTime: db.serverDate()
          }
        })
      } else {
        await db.collection('users').doc(user._id).update({
          data: {
            lastLoginTime: db.serverDate(),
            lastLoginType: 'phone',
            updateTime: db.serverDate()
          }
        })
      }
    } else {
      // 新用户 → 检查是否为已知管理账号（自动分配角色）
      var autoRole = PHONE_ROLE_MAP[phoneNumber] || ''
      console.log('[verifySmsCode] 新用户, 手机号:', phoneNumber, ', 自动角色:', autoRole || '(无)')
      const newUserRes = await db.collection('users').add({
        data: {
          phone: phoneNumber,
          phoneNumber: phoneNumber,   // ★ 同时写两个字段确保兼容
          phoneVerified: true,
          role: autoRole,
          email: '',
          passwordSet: false,
          createTime: db.serverDate(),
          updateTime: db.serverDate(),
          lastLoginTime: db.serverDate(),
          lastLoginType: 'phone'
        }
      })
      user = {
        _id: newUserRes._id,
        phone: phoneNumber,
        role: autoRole,
        email: '',
        passwordSet: false
      }
      isNewUser = true
    }

    // 如果需要绑定到微信用户（小程序端）
    if (bindToUser) {
      const { OPENID } = cloud.getWXContext()
      if (OPENID) {
        // 把 openId 合并到该手机号账号
        await db.collection('users').doc(user._id).update({
          data: {
            openId: OPENID,
            updateTime: db.serverDate()
          }
        })
        user.openId = OPENID
      }
    }

    return {
      success: true,
      message: isNewUser ? '注册并登录成功' : '登录成功',
      needSetPassword: !user.passwordSet,
      needBindEmail: !user.email,
      needSelectRole: !user.role,  // 角色为空时需要选择身份
      role: (user.role || '').toLowerCase(),  // 统一小写，不 fallback
      user: {
        _id: user._id,
        phone: user.phone,
        email: user.email || '',
        role: (user.role || '').toLowerCase(),
        passwordSet: !!user.passwordSet,
        openId: user.openId || ''
      }
    }
  } catch (err) {
    console.error('验证短信验证码失败:', err)
    return { success: false, error: '验证失败，请稍后重试' }
  }
}
