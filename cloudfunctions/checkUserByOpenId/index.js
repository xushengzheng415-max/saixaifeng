// 小程序手机号主账号登录。
// 手机号是自然人账号唯一凭证；OpenID / UnionID 只作为登录渠道标识。
var cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

function firstValue() {
  for (var i = 0; i < arguments.length; i += 1) {
    if (arguments[i] !== undefined && arguments[i] !== null && arguments[i] !== '') return arguments[i]
  }
  return ''
}

function uniqueUsers(rows) {
  var result = []
  var ids = {}
  ;(rows || []).forEach(function(user) {
    var id = String(user && user._id || '')
    if (!id || ids[id]) return
    ids[id] = true
    result.push(user)
  })
  return result
}

function normalizeUser(user, openId) {
  var phone = firstValue(user.phone, user.phoneNumber)
  return {
    _id: user._id || '',
    orgId: firstValue(user.orgId, user.organizationId),
    organizationId: firstValue(user.organizationId, user.orgId),
    needsOrganization: !firstValue(user.orgId, user.organizationId),
    openId: firstValue(user.openId, openId),
    phone: phone,
    phoneNumber: phone,
    phoneVerified: user.phoneVerified === true,
    nickName: firstValue(user.nickName, user.nickname, user.name, '微信用户'),
    avatarUrl: firstValue(user.avatarUrl, user.avatar, user.headimgurl),
    role: user.role || '',
    source: 'users'
  }
}

async function queryUsers(db, condition, limit) {
  var result = await db.collection('users').where(condition).limit(limit || 3).get()
  return uniqueUsers(result.data || [])
}

function duplicateMessage(label) {
  return label + '存在重复账号，请联系管理员处理'
}

async function decodePhoneNumber(phoneCode) {
  try {
    var result = await cloud.openapi.phonenumber.getPhoneNumber({ code: phoneCode })
    var phoneInfo = result && result.phoneInfo
    var phone = String(phoneInfo && (phoneInfo.purePhoneNumber || phoneInfo.phoneNumber) || '')
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return { success: false, message: '未获取到有效手机号，请重试' }
    }
    return { success: true, phone: phone }
  } catch (error) {
    console.error('[miniPhoneLogin] 手机号授权解析失败:', error && (error.errCode || error.code), error && (error.errMsg || error.message))
    return { success: false, message: '手机号授权已失效，请重新授权' }
  }
}

async function findMiniWechatUsers(db, _, openId) {
  if (!openId) return []
  return queryUsers(db, _.or([
    { openId: openId },
    { openid: openId },
    { _openid: openId }
  ]), 3)
}

async function validateExistingSession(db, _, openId) {
  var openIdUsers = await findMiniWechatUsers(db, _, openId)
  if (openIdUsers.length > 1) {
    return { success: false, isRegistered: false, message: duplicateMessage('当前微信') }
  }
  var user = openIdUsers[0]
  if (!user) {
    return { success: true, isRegistered: false, requiresPhoneAuthorization: true }
  }
  var phone = String(firstValue(user.phone, user.phoneNumber))
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    return {
      success: true,
      isRegistered: false,
      requiresPhoneAuthorization: true,
      message: '请先授权手机号完成账号识别'
    }
  }
  var phoneUsers = await queryUsers(db, _.or([{ phone: phone }, { phoneNumber: phone }]), 3)
  if (phoneUsers.length !== 1 || String(phoneUsers[0]._id) !== String(user._id)) {
    return {
      success: false,
      isRegistered: false,
      message: phoneUsers.length > 1 ? duplicateMessage('手机号') : '微信与手机号账号关系异常，请联系管理员核验'
    }
  }
  return { success: true, isRegistered: true, user: normalizeUser(user, openId) }
}

async function loginByPhone(db, _, event, openId, unionId) {
  var decoded = await decodePhoneNumber(event.phoneCode)
  if (!decoded.success) return { success: false, isRegistered: false, message: decoded.message }
  var phone = decoded.phone

  var results = await Promise.all([
    queryUsers(db, _.or([{ phone: phone }, { phoneNumber: phone }]), 3),
    findMiniWechatUsers(db, _, openId),
    unionId ? queryUsers(db, { unionId: unionId }, 3) : Promise.resolve([])
  ])
  var phoneUsers = results[0]
  var openIdUsers = results[1]
  var unionIdUsers = results[2]

  if (phoneUsers.length > 1) return { success: false, isRegistered: false, message: duplicateMessage('手机号') }
  if (openIdUsers.length > 1) return { success: false, isRegistered: false, message: duplicateMessage('当前微信') }
  if (unionIdUsers.length > 1) return { success: false, isRegistered: false, message: duplicateMessage('微信 UnionID') }

  var candidates = uniqueUsers([phoneUsers[0], openIdUsers[0], unionIdUsers[0]].filter(Boolean))
  if (candidates.length > 1) {
    return {
      success: false,
      isRegistered: false,
      message: '手机号与微信标识指向不同账号，已阻止自动换绑，请联系管理员核验'
    }
  }

  var user = candidates[0] || null
  if (user) {
    var boundPhone = String(firstValue(user.phone, user.phoneNumber))
    if (boundPhone && boundPhone !== phone) {
      return { success: false, isRegistered: false, message: '当前微信已绑定其他手机号，请联系管理员核验' }
    }
    var boundMiniOpenId = String(firstValue(user.openId, user.openid))
    if (boundMiniOpenId && boundMiniOpenId !== openId) {
      return { success: false, isRegistered: false, message: '该手机号已绑定其他小程序微信，请联系管理员核验' }
    }
    if (unionId && user.unionId && String(user.unionId) !== unionId) {
      return { success: false, isRegistered: false, message: '该手机号的微信 UnionID 不一致，请联系管理员核验' }
    }
  }

  var now = db.serverDate()
  var patch = {
    openId: openId,
    phone: phone,
    phoneNumber: phone,
    phoneVerified: true,
    loginType: 'wechat_phone',
    updateTime: now,
    lastLoginTime: now
  }
  if (unionId) patch.unionId = unionId

  var isNewUser = !user
  if (isNewUser) {
    patch.nickName = event.nickName || '微信用户'
    patch.avatarUrl = event.avatarUrl || ''
    patch.createTime = now
    var created = await db.collection('users').add({ data: patch })
    user = Object.assign({ _id: created._id }, patch)
  } else {
    await db.collection('users').doc(user._id).update({ data: patch })
    user = Object.assign({}, user, patch)
  }

  return {
    success: true,
    isRegistered: true,
    isNewUser: isNewUser,
    user: normalizeUser(user, openId)
  }
}

exports.main = async function(event) {
  event = event || {}
  var wxContext = cloud.getWXContext()
  var openId = String(wxContext.OPENID || '')
  var unionId = String(wxContext.UNIONID || '')

  if (!openId) return { success: false, isRegistered: false, message: '无法识别当前小程序微信' }

  try {
    var db = cloud.database()
    var _ = db.command
    if (!event.phoneCode) return await validateExistingSession(db, _, openId)
    return await loginByPhone(db, _, event, openId, unionId)
  } catch (error) {
    console.error('[miniPhoneLogin] 登录异常:', error && (error.code || error.errCode), error && (error.message || error.errMsg))
    return { success: false, isRegistered: false, message: '手机号账号登录失败，请重试' }
  }
}
