// verifySmsCode - 赛小蜂短信验证码校验云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })

exports.main = async (event) => {
  const { phoneNumber, code, bindToUser = false } = event

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
      .limit(2)
      .get()

    const matchedUsers = userRes.data || []
    if (matchedUsers.length > 1) {
      return { success: false, error: '手机号存在重复账号，请联系管理员处理' }
    }

    if (matchedUsers.length === 1) {
      // 已有用户，更新登录时间
      user = { ...matchedUsers[0], role: 'organizer' }
      await db.collection('users').doc(user._id).update({
        data: {
          role: 'organizer',
          lastLoginTime: db.serverDate(),
          lastLoginType: 'phone',
          updateTime: db.serverDate()
        }
      })
    } else {
      // 新用户直接创建为主办方账号
      const newUserRes = await db.collection('users').add({
        data: {
          phone: phoneNumber,
          phoneNumber: phoneNumber,   // ★ 同时写两个字段确保兼容
          phoneVerified: true,
          role: 'organizer',
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
        role: 'organizer',
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
      needSelectRole: false,
      role: 'organizer',
      user: {
        _id: user._id,
        phone: user.phone,
        email: user.email || '',
        role: 'organizer',
        passwordSet: !!user.passwordSet,
        openId: user.openId || ''
      }
    }
  } catch (err) {
    console.error('验证短信验证码失败:', err)
    return { success: false, error: '验证失败，请稍后重试' }
  }
}
