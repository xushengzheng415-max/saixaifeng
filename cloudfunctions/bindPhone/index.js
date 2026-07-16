const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

async function findUniqueUser(where, label) {
  const result = await db.collection('users').where(where).limit(2).get()
  const users = result.data || []
  if (users.length > 1) {
    console.error('[bindPhone] 检测到重复账号:', label, users.map(item => item._id))
    throw new Error(label + '存在重复绑定，请联系管理员处理')
  }
  return users[0] || null
}

async function findUsersByPhone(phone) {
  const result = await db.collection('users').where(_.or([
    { phone: phone },
    { phoneNumber: phone }
  ])).limit(3).get()
  return result.data || []
}

exports.main = async (event, context) => {
  return { success: false, error: '当前为纯微信登录，不再绑定手机号' }
  /* istanbul ignore next */
  const { email, phone, code, unionId, openId } = event
  // unionId/openId 用于微信用户绑手机号时识别身份
  const wechatUnionId = unionId || ''
  const wechatOpenId = openId || ''
  const loginOpenId = context.OPENID || ''

  console.log('[bindPhone] 收到请求:', { phone, hasCode: !!code, hasUnionId: !!wechatUnionId, loginOpenId: loginOpenId ? '***' : '' })

  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
    return { success: false, error: '请输入正确的手机号' }
  }

  // 验证短信验证码（必须提供）
  if (!code) {
    return { success: false, error: '请输入短信验证码' }
  }

  try {
    const smsResult = await db.collection('sms_codes').where({
      phoneNumber: phone,
      code: code,
      used: false
    }).orderBy('createTime', 'desc').limit(1).get()

    if (!smsResult.data || smsResult.data.length === 0) {
      return { success: false, error: '验证码错误或已过期' }
    }

    const smsRecord = smsResult.data[0]
    const createTime = new Date(smsRecord.createTime)
    const now = new Date()
    if ((now - createTime) > 5 * 60 * 1000) {
      return { success: false, error: '验证码已过期，请重新获取' }
    }

    await db.collection('sms_codes').doc(smsRecord._id).update({
      data: { used: true, useTime: now }
    })

    console.log('[bindPhone] 验证码校验成功:', phone)
  } catch (err) {
    console.error('[bindPhone] 验证码校验失败:', err)
    return { success: false, error: '验证码校验失败：' + (err.message || '未知错误') }
  }

  // ===== 查找要绑定的目标用户（按优先级）=====
  // ★ 增强版：兼容两种字段名（phone vs phoneNumber, openId vs wechatOpenId）
  let targetUser = null
  let targetUserId = ''
  let foundBy = '' // 记录通过哪种方式找到的，用于日志

  try {
    // === 第1优先级：通过微信 unionId 查找（最可靠）===
    if (wechatUnionId) {
      targetUser = await findUniqueUser({ unionId: wechatUnionId }, '微信 UnionID')
      if (targetUser) {
        targetUserId = targetUser._id
        foundBy = 'unionId'
        console.log('[bindPhone] ✅ 通过 unionId 找到用户:', targetUserId)
      }
    }

    // === 第2优先级：通过微信 openId 查找（同时查 wechatOpenId 和 openId 字段）===
    if (!targetUser && wechatOpenId) {
      // 先查网页端标准字段
      targetUser = await findUniqueUser({ wechatOpenId: wechatOpenId }, '网页微信 OpenID')
      if (targetUser) {
        targetUserId = targetUser._id
        foundBy = 'wechatOpenId'
        console.log('[bindPhone] ✅ 通过 wechatOpenId 找到用户:', targetUserId)
      } else {
        // 再查小程序端字段名
        targetUser = await findUniqueUser({ openId: wechatOpenId }, '小程序微信 OpenID')
        if (targetUser) {
          targetUserId = targetUser._id
          foundBy = 'openId(小程序)'
          console.log('[bindPhone] ✅ 通过 openId(小程序字段) 找到用户:', targetUserId)
        }
      }
    }

    // === 第3优先级：通过邮箱查找 ===
    if (!targetUser && email) {
      targetUser = await findUniqueUser({ email }, '邮箱 ' + email)
      if (targetUser) {
        targetUserId = targetUser._id
        foundBy = 'email'
        console.log('[bindPhone] ✅ 通过 email 找到用户:', targetUserId)
      }
    }

    // === 第4优先级：通过当前登录的 openId 查找（同时查两种字段名）===
    if (!targetUser && loginOpenId) {
      targetUser = await findUniqueUser({ wechatOpenId: loginOpenId }, '当前网页微信 OpenID')
      if (targetUser) {
        targetUserId = targetUser._id
        foundBy = 'loginOpenId(wechatOpenId)'
        console.log('[bindPhone] ✅ 通过 loginOpenId 找到用户:', targetUserId)
      } else {
        targetUser = await findUniqueUser({ openId: loginOpenId }, '当前小程序微信 OpenID')
        if (targetUser) {
          targetUserId = targetUser._id
          foundBy = 'loginOpenId(openId)'
          console.log('[bindPhone] ✅ 通过 loginOpenId(openId) 找到用户:', targetUserId)
        }
      }
    }

    // === 如果还没找到目标用户 → 尝试按手机号反向查找已存在的账号 ===
    // ★ 这是关键修复：处理"小程序已绑手机号，网页端扫码后绑手机"的场景
    // 此时 wechatWebLogin 已创建了临时用户（带 unionId），但同手机号可能已有小程序创建的账号
    if (!targetUser) {
      // 同时查 phone 和 phoneNumber 字段
      const phoneUsers = await findUsersByPhone(phone)

      if (phoneUsers.length > 1) {
        throw new Error('手机号 ' + phone + ' 存在重复账号，请联系管理员处理')
      }

      if (phoneUsers.length === 1) {
        // 找到了已有手机号账号！合并微信信息到这个账号
        const existUser = phoneUsers[0]
        console.log('[bindPhone] ⚠️ 未找到微信身份用户，但找到同手机号已有账号:', existUser._id, '方式=', foundBy)

        // 把微信信息补充到这个已有账号
        const mergeData = {
          unionId: wechatUnionId || existUser.unionId || '',
          wechatOpenId: wechatOpenId || existUser.wechatOpenId || '',
          nickname: existUser.nickname || existUser.nickName || '用户',
          headimgurl: existUser.headimgurl || existUser.avatarUrl || '',
          // 标准化手机号字段
          phone: existUser.phone || existUser.phoneNumber || phone,
          phoneNumber: existUser.phoneNumber || existUser.phone || phone,
          role: 'organizer',
          updateTime: new Date()
        }
        await db.collection('users').doc(existUser._id).update({ data: mergeData })
        targetUserId = existUser._id
        targetUser = { ...existUser, ...mergeData }
        foundBy = 'phone(反向匹配+合并)'

        console.log('[bindPhone] ✅ 已将微信信息合并到同手机号账号:', targetUserId)

        return {
          success: true,
          message: '绑定成功（账号已合并）',
          userId: targetUserId,
          phone: phone,
          merged: true,
          user: targetUser,
          needSelectRole: false
        }
      }
    }

    if (!targetUser) {
      const now = new Date()
      const createData = {
        phone,
        phoneNumber: phone,
        phoneVerified: true,
        unionId: wechatUnionId,
        wechatOpenId,
        email: email || '',
        role: 'organizer',
        passwordSet: false,
        createTime: now,
        updateTime: now
      }
      const created = await db.collection('users').add({ data: createData })
      targetUserId = created._id
      targetUser = { _id: created._id, ...createData }
      foundBy = 'createdOrganizer'
    }

    console.log('[bindPhone] 目标用户确定:', targetUserId, 'foundBy=', foundBy)

    const targetPhone = targetUser.phone || targetUser.phoneNumber || ''
    if (targetPhone && targetPhone !== phone) {
      return { success: false, error: '当前微信已绑定其他手机号，请联系管理员核验后更换' }
    }

    // 检查手机号是否已被其他账号占用（★ 同时查 phone 和 phoneNumber）
    const phoneUsers = await findUsersByPhone(phone)
    const existPhoneUsers = phoneUsers.filter(u => u._id !== targetUserId)
    if (existPhoneUsers.length > 1) {
      throw new Error('手机号 ' + phone + ' 存在重复账号，请联系管理员处理')
    }
    if (existPhoneUsers.length > 0) {
      const existUser = existPhoneUsers[0]
      // 手机号已被其他账号占用 → 合并：把目标用户（临时）的信息合并到已有账号
      console.log('[bindPhone] 🔄 手机号已被其他账号占用，执行合并:', existUser._id, '<-', targetUserId, 'foundBy=', foundBy)
      const mergeData = {
        unionId: targetUser.unionId || existUser.unionId || wechatUnionId,
        wechatOpenId: targetUser.wechatOpenId || existUser.wechatOpenId || wechatOpenId,
        // 补充 openId（小程序字段）
        openId: targetUser.openId || existUser.openId || '',
        nickname: existUser.nickname || existUser.nickName || targetUser.nickname || targetUser.nickName || '用户',
        headimgurl: existUser.headimgurl || existUser.avatarUrl || targetUser.headimgurl || '',
        // 标准化手机号字段
        phone: existUser.phone || existUser.phoneNumber || phone,
        phoneNumber: existUser.phoneNumber || existUser.phone || phone,
        role: 'organizer',
        passwordSet: existUser.passwordSet || targetUser.passwordSet || false,
        email: existUser.email || targetUser.email || email || '',
        updateTime: new Date()
      }
      if (!existUser.passwordHash && targetUser.passwordHash) mergeData.passwordHash = targetUser.passwordHash
      if (!existUser.passwordSalt && targetUser.passwordSalt) mergeData.passwordSalt = targetUser.passwordSalt
      await db.collection('users').doc(existUser._id).update({ data: mergeData })

      // 删除临时用户（已合并到已有账号）
      try {
        await db.collection('users').doc(targetUserId).remove()
        console.log('[bindPhone] 已删除临时用户:', targetUserId)
      } catch (e) {
        console.warn('[bindPhone] 删除临时用户失败（可忽略）:', e.message)
      }
      console.log('[bindPhone] ✅ 合并完成，保留账号 _id:', existUser._id)
      targetUserId = existUser._id
      targetUser = { ...existUser, ...mergeData }

      // 查询最终完整用户信息
      const finalRes = await db.collection('users').doc(targetUserId).get()
      const finalUser = finalRes.data && finalRes.data.length > 0 ? finalRes.data[0] : targetUser

      return {
        success: true,
        message: '绑定成功（账号已合并）',
        userId: targetUserId,
        phone: phone,
        merged: true,
        user: finalUser,
        needSelectRole: false
      }
    }

    // 更新目标用户的手机号（★ 同时写两种字段名确保兼容）
    const phoneUpdateData = { phone: phone, phoneNumber: phone, phoneVerified: true, role: 'organizer', updateTime: new Date() }
    await db.collection('users').doc(targetUserId).update({
      data: phoneUpdateData
    })

    // 同步补充 wechatOpenId / unionId（如果目标用户缺少这些字段）
    const supplementalData = {}
    let needsUpdate = false
    if (wechatUnionId && !targetUser.unionId) { supplementalData.unionId = wechatUnionId; needsUpdate = true }
    if (wechatOpenId && !targetUser.wechatOpenId) { supplementalData.wechatOpenId = wechatOpenId; needsUpdate = true }
    if (needsUpdate) {
      supplementalData.updateTime = new Date()
      await db.collection('users').doc(targetUserId).update({ data: supplementalData })
      console.log('[bindPhone] 补充用户微信标识:', supplementalData)
    }

    console.log('[bindPhone] ✅ 绑定成功, userId:', targetUserId, ', phone:', phone, ', foundBy=', foundBy)

    // 查询更新后的完整用户信息（用于前端判断是否需要选身份）
    const updatedUserRes = await db.collection('users').doc(targetUserId).get()
    const finalUser = updatedUserRes.data && updatedUserRes.data.length > 0
      ? updatedUserRes.data[0]
      : targetUser

    return {
      success: true,
      message: '手机号绑定成功',
      userId: targetUserId,
      phone: phone,
      user: finalUser,
      needSelectRole: false
    }

  } catch (err) {
    console.error('[bindPhone] 绑定失败:', err)
    return { success: false, error: '绑定失败：' + (err.message || '未知错误') }
  }
}
