// 微信开放平台 - 网站扫码登录
// 流程：前端跳转微信授权 → 用户扫码 → 回调带 code → 本云函数用 code 换 access_token → 获取用户信息 → 登录
//
// ★ 修复说明（2026-06-18）：
//   1. 字段名兼容：小程序端用 phoneNumber/openId，网页端用 phone/wechatOpenId
//      本函数现在同时查询两种字段名，解决跨端账号识别问题
//   2. needBindPhone 判定同时检查 phone 和 phoneNumber 字段
//   3. 返回的用户信息中统一归一化为标准字段名
//
const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })

// ========== 配置 ==========
const APP_ID = process.env.WECHAT_WEB_APPID || ''
const APP_SECRET = process.env.WECHAT_WEB_APPSECRET || ''

/**
 * 用 https 模块发起 HTTP GET 请求（Node 16 兼容）
 */
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch(e) { resolve(data) }
      })
    })
    req.on('error', reject)
    req.setTimeout(10000, () => { req.destroy(new Error('请求超时')) })
  })
}

/**
 * 用 code 换取 access_token 和用户信息
 * API: https://api.weixin.qq.com/sns/oauth2/access_token
 */
async function exchangeCodeForToken(code) {
  const url = 'https://api.weixin.qq.com/sns/oauth2/access_token?appid=' + APP_ID + '&secret=' + APP_SECRET + '&code=' + code + '&grant_type=authorization_code'
  const data = await httpsGet(url)
  if (data.errcode && data.errcode !== 0) {
    throw new Error('微信错误：' + (data.errmsg || '未知错误'))
  }
  return data
}

/**
 * 通过 access_token 获取用户信息
 * API: https://api.weixin.qq.com/sns/userinfo
 */
async function getUserInfo(accessToken, openId) {
  const url = 'https://api.weixin.qq.com/sns/userinfo?access_token=' + accessToken + '&openid=' + openId
  const data = await httpsGet(url)
  if (data.errcode && data.errcode !== 0) {
    throw new Error('获取用户信息失败：' + (data.errmsg || '未知错误'))
  }
  return data
}

/**
 * 通用辅助函数：从用户对象中获取手机号（兼容两种字段名）
 * @param {Object} user 用户记录
 * @returns {string} 手机号，空字符串表示无
 */
function getUserPhone(user) {
  return user.phone || user.phoneNumber || ''
}

/**
 * 通用辅助函数：按手机号查找用户（同时查询 phone 和 phoneNumber 字段）
 * @param {Object} db 数据库引用
 * @param {string} phone 手机号
 * @returns {Promise<Object|null>} 找到的用户或 null
 */
async function findUserByPhone(db, phone) {
  if (!phone) return null

  // 先查 phone 字段（网页端标准字段）
  const res1 = await db.collection('users').where({ phone: phone }).get()
  if (res1.data && res1.data.length > 0) return res1.data[0]

  // 再查 phoneNumber 字段（小程序端字段）
  const res2 = await db.collection('users').where({ phoneNumber: phone }).get()
  if (res2.data && res2.data.length > 0) return res2.data[0]

  return null
}

/**
 * 查找或创建用户
 *
 * ★ 核心逻辑（增强版）：
 * 1. 按 unionId 查找（最可靠 — 同一开放平台下各应用unionId相同）
 * 2. 按 wechatOpenId / openId 查找（网页端openId）
 * 3. 如果提供了手机号（已短信验证），按手机号查找并合并微信信息
 * 4. 都没有 → 创建临时用户（后续绑手机号时合并）
 *
 * @param {Object} db - 数据库引用
 * @param {Object} userInfo - 微信返回的用户信息（含 unionid, openid, nickname, headimgurl）
 * @param {string} phone - 已验证的手机号（可能为空）
 * @returns {{ user: Object, isNewUser: boolean, merged: boolean }}
 */
async function findOrCreateUser(db, userInfo, phone) {
  const unionId = userInfo.unionid || ''
  const openId = userInfo.openid
  const now = new Date()

  let user = null
  let isNewUser = false
  let merged = false

  // ===== 第1步：优先通过 unionId 查找 =====
  // 同一微信开放平台下，小程序和网站应用的 unionId 相同
  if (unionId) {
    const res = await db.collection('users').where({ unionId: unionId }).get()
    if (res.data && res.data.length > 0) {
      user = res.data[0]
      console.log('[wechatWebLogin] 通过 unionId 找到用户:', user._id, 'phone=', getUserPhone(user))
    }
  }

  // ===== 第2步：通过 openId 查找（兼容两种字段名）=====
  if (!user) {
    // 网页端标准字段
    const res1 = await db.collection('users').where({ wechatOpenId: openId }).get()
    if (res1.data && res1.data.length > 0) {
      user = res1.data[0]
      console.log('[wechatWebLogin] 通过 wechatOpenId 找到用户:', user._id)
      // 补充 unionId
      if (unionId && !user.unionId) {
        await db.collection('users').doc(user._id).update({ data: { unionId: unionId, updateTime: now } })
        user.unionId = unionId
      }
    } else {
      // 小程序端字段名
      const res2 = await db.collection('users').where({ openId: openId }).get()
      if (res2.data && res2.data.length > 0) {
        user = res2.data[0]
        console.log('[wechatWebLogin] 通过 openId(小程序字段)找到用户:', user._id)
        // 补充 unionId 和标准化 openId 字段
        const updateData = { unionId: unionId || user.unionId || '', wechatOpenId: openId, updateTime: now }
        await db.collection('users').doc(user._id).update({ data: updateData })
        Object.assign(user, updateData)
      }
    }
  }

  // ===== 第3步：都没找到 → 根据手机号判断合并还是新建 =====
  if (!user) {
    if (phone) {
      // 有手机号：查找已有账号（同时查 phone 和 phoneNumber 字段）
      const existingUser = await findUserByPhone(db, phone)
      if (existingUser) {
        // 合并：把网页端微信信息补充到已有账号
        const targetUser = existingUser
        const updateData = {
          unionId: targetUser.unionId || unionId || '',
          wechatOpenId: targetUser.wechatOpenId || openId || '',
          // 如果原来没有标准 phone 字段，补上
          phone: targetUser.phone || targetUser.phoneNumber || phone,
          nickname: userInfo.nickname || targetUser.nickname || targetUser.nickName || '微信用户',
          headimgurl: userInfo.headimgurl || targetUser.headimgurl || targetUser.avatarUrl || '',
          lastLoginTime: now,
          updateTime: now
        }
        await db.collection('users').doc(targetUser._id).update({ data: updateData })
        user = { ...targetUser, ...updateData }
        merged = true
        console.log('[wechatWebLogin] ? 合并账号：网页微信信息已补充到已有手机号账号', targetUser._id, 'phone=', phone)
      } else {
        // 手机号也不存在：创建新用户
        const newUserRes = await db.collection('users').add({
          data: {
            wechatOpenId: openId,
            unionId: unionId,
            nickname: userInfo.nickname || '微信用户',
            headimgurl: userInfo.headimgurl || '',
            phone: phone,
            email: '',
            role: '',
            passwordSet: false,
            loginType: 'wechat',
            lastLoginTime: now,
            createTime: now,
            updateTime: now
          }
        })
        user = {
          _id: newUserRes._id,
          wechatOpenId: openId,
          unionId: unionId,
          nickname: userInfo.nickname || '微信用户',
          headimgurl: userInfo.headimgurl || '',
          phone: phone,
          email: '',
          role: '',
          passwordSet: false,
          isNew: true
        }
        isNewUser = true
        console.log('[wechatWebLogin] 创建新用户（含手机号）:', newUserRes._id)
      }
    } else {
      // 没有手机号：创建临时用户（后续必须绑手机号）
      const newUserRes = await db.collection('users').add({
        data: {
          wechatOpenId: openId,
          unionId: unionId,
          nickname: userInfo.nickname || '微信用户',
          headimgurl: userInfo.headimgurl || '',
          phone: '',
          email: '',
          role: '',
          passwordSet: false,
          loginType: 'wechat',
          lastLoginTime: now,
          createTime: now,
          updateTime: now
        }
      })
      user = {
        _id: newUserRes._id,
        wechatOpenId: openId,
        unionId: unionId,
        nickname: userInfo.nickname || '微信用户',
        headimgurl: userInfo.headimgurl || '',
        phone: '',
        email: '',
        role: '',
        passwordSet: false,
        isNew: true
      }
      isNewUser = true
      console.log('[wechatWebLogin] 创建临时用户（待绑手机号）:', newUserRes._id)
    }
  } else {
    // ===== 用户已存在，更新登录时间和头像/昵称 =====
    // 同时标准化 phone 字段（如果只有 phoneNumber）
    const existingPhone = getUserPhone(user)
    const updateData = {
      headimgurl: userInfo.headimgurl || user.headimgurl || '',
      nickname: userInfo.nickname || user.nickname || user.nickName || '',
      lastLoginTime: now,
      updateTime: now
    }
    // 如果有 phoneNumber 但没有 phone，自动补上 phone 字段
    if (!user.phone && user.phoneNumber) {
      updateData.phone = user.phoneNumber
    }
    await db.collection('users').doc(user._id).update({ data: updateData })
    user.nickname = updateData.nickname
    user.headimgurl = updateData.headimgurl
    if (updateData.phone) user.phone = updateData.phone
    console.log('[wechatWebLogin] 已有用户更新成功:', user._id, 'phone=', existingPhone || '(无)')
  }

  return { user, isNewUser, merged }
}

/**
 * 根据手机号映射角色
 */
function mapRoleByPhone(phone) {
  const PHONE_ROLE_MAP = {
    '15038292130': 'ORGANIZER',
    '17319716663': 'COACH'
  }
  return PHONE_ROLE_MAP[phone] || null
}

// ========== 主入口 ==========
exports.main = async (event) => {
  const { code, phone: eventPhone, smsCode } = event
  const db = cloud.database()

  console.log('[wechatWebLogin] 收到请求，code=' + (code ? code.substring(0, 8) + '...' : '空') + ' phone=' + (eventPhone || '无'))

  try {
    // 1. 参数校验
    if (!code) {
      return { success: false, error: '缺少授权码' }
    }

    if (!APP_ID || !APP_SECRET) {
      console.error('[wechatWebLogin] 未配置 WECHAT_WEB_APPID / WECHAT_WEB_APPSECRET 环境变量')
      return { success: false, error: '系统配置错误：未配置微信开放平台凭证' }
    }

    // 2. 用 code 换取 access_token + openid + unionid
    const tokenData = await exchangeCodeForToken(code)
    console.log('[wechatWebLogin] token交换成功，openid=', tokenData.openid, 'unionid=', (tokenData.unionid || '无'))

    // 3. 获取用户详细信息
    const wxUserInfo = await getUserInfo(tokenData.access_token, tokenData.openid)
    console.log('[wechatWebLogin] 用户信息获取成功，nickname=', wxUserInfo.nickname)

    // 4. 如果带了手机号和短信验证码，先验证
    let verifiedPhone = ''
    if (eventPhone && smsCode) {
      const smsResult = await db.collection('sms_codes').where({
        phoneNumber: eventPhone,
        code: smsCode,
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
        data: { used: true, useTime: new Date() }
      })
      verifiedPhone = eventPhone
      console.log('[wechatWebLogin] 手机号验证成功：', verifiedPhone)
    }

    // 5. 查找或创建用户（★ 增强版：支持跨端字段名兼容）
    const { user, isNewUser, merged } = await findOrCreateUser(db, wxUserInfo, verifiedPhone)
    const finalPhone = getUserPhone(user)
    console.log('[wechatWebLogin] 用户处理完成，isNewUser=', isNewUser, 'merged=', merged, 'userId=', user._id, 'phone=', finalPhone || '(无)')

    // 6. 判断是否需要强制操作（★ 同时检查 phone 和 phoneNumber）
    const needSetPassword = !user.passwordSet
    const needBindPhone = !finalPhone && !verifiedPhone
    const needBindEmail = !(user.email || '')
    const needSelectRole = isNewUser || (!user.role || user.role === '')

    // 7. 如果还没绑手机号，返回 needPhoneBinding 让前端弹绑定页
    if (needBindPhone) {
      return {
        success: true,
        needPhoneBinding: true,
        wechatTemp: {
          unionId: user.unionId || wxUserInfo.unionid || '',
          openId: user.wechatOpenId || tokenData.openid,
          nickname: user.nickname,
          headimgurl: user.headimgurl
        },
        message: '请绑定手机号'
      }
    }

    // 8. 确定最终角色（★ 使用归一化后的手机号）
    let finalRole = user.role || ''
    if (finalPhone || verifiedPhone) {
      const phoneForRole = finalPhone || verifiedPhone
      const mappedRole = mapRoleByPhone(phoneForRole)
      if (mappedRole) finalRole = mappedRole
    }

    // 9. 创建自定义登录票据
    const ticket = await cloud.auth().createTicket(user._id, {
      refresh: 3600 * 24 * 7,
      expire: 3600 * 2
    })

    return {
      success: true,
      ticket: ticket,
      message: merged ? '账号已合并，欢迎回来！' : (isNewUser ? '注册并登录成功' : '欢迎回来！'),
      needSetPassword,
      needBindPhone: false,
      needBindEmail,
      needSelectRole,
      role: finalRole,
      merged: merged,
      user: {
        _id: user._id,
        openid: user.wechatOpenId || user.openId || tokenData.openid,
        unionid: user.unionId || wxUserInfo.unionid || '',
        nickname: user.nickname || user.nickName || '',
        headimgurl: user.headimgurl || user.avatarUrl || '',
        phone: finalPhone || verifiedPhone || '',
        email: user.email || '',
        role: finalRole
      },
      isNewUser
    }

  } catch (err) {
    console.error('[wechatWebLogin] 错误：', err.message || err)
    return { success: false, error: err.message || '登录失败，请重试' }
  }
}
