// bindPhoneToOpenId/index.js
// 小程序手机号与微信 OpenID 绑定：首次扫码/授权即创建主办方账号。

var cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

function firstNonEmpty() {
  for (var i = 0; i < arguments.length; i++) {
    if (arguments[i] !== undefined && arguments[i] !== null && arguments[i] !== '') return arguments[i]
  }
  return ''
}

function normalizeUser(user) {
  return {
    _id: user._id || '',
    openId: user.openId || '',
    phoneNumber: firstNonEmpty(user.phoneNumber, user.phone),
    phone: firstNonEmpty(user.phone, user.phoneNumber),
    email: user.email || '',
    role: 'organizer',
    nickName: firstNonEmpty(user.nickName, user.nickname, user.name, '微信用户'),
    avatarUrl: firstNonEmpty(user.avatarUrl, user.avatar, user.headimgurl),
    source: 'users'
  }
}

exports.main = async function(event) {
  return { success: false, message: '当前为纯微信登录，不再绑定手机号' }
  /* istanbul ignore next */
  var openId = event.openId || ''
  var phoneNumber = event.phoneNumber || ''
  var nickName = event.nickName || '微信用户'
  var avatarUrl = event.avatarUrl || ''
  var unionId = event.unionId || ''

  if (!phoneNumber) return { success: false, message: '缺少手机号' }
  if (!openId) return { success: false, message: '缺少微信 OpenID' }

  try {
    var db = cloud.database()
    var _ = db.command
    var phoneResult = await db.collection('users').where(_.or([
      { phone: phoneNumber },
      { phoneNumber: phoneNumber }
    ])).limit(3).get()
    var phoneUsers = phoneResult.data || []
    if (phoneUsers.length > 1) {
      return { success: false, message: '手机号存在重复账号，请联系管理员处理' }
    }

    var openIdResult = await db.collection('users').where({ openId: openId }).limit(2).get()
    var openIdUsers = openIdResult.data || []
    if (openIdUsers.length > 1) {
      return { success: false, message: '当前微信存在重复账号，请联系管理员处理' }
    }

    var unionIdUsers = []
    if (unionId) {
      var unionIdResult = await db.collection('users').where({ unionId: unionId }).limit(2).get()
      unionIdUsers = unionIdResult.data || []
      if (unionIdUsers.length > 1) {
        return { success: false, message: '当前微信身份存在重复账号，请联系管理员处理' }
      }
    }

    var candidates = []
    if (phoneUsers[0]) candidates.push(phoneUsers[0])
    if (openIdUsers[0]) candidates.push(openIdUsers[0])
    if (unionIdUsers[0]) candidates.push(unionIdUsers[0])
    var candidateIds = candidates.map(function(item) { return item._id })
      .filter(function(id, index, list) { return list.indexOf(id) === index })
    if (candidateIds.length > 1) {
      return { success: false, message: '手机号与微信身份属于不同账号，请联系管理员核验' }
    }

    var organizer = candidates[0] || null
    if (organizer) {
      var boundPhone = firstNonEmpty(organizer.phoneNumber, organizer.phone)
      if (boundPhone && boundPhone !== phoneNumber) {
        return { success: false, message: '当前微信已绑定其他手机号，请联系管理员核验' }
      }
    }

    var patch = {
      openId: openId,
      phone: phoneNumber,
      phoneNumber: phoneNumber,
      phoneVerified: true,
      role: 'organizer',
      nickName: firstNonEmpty(organizer && organizer.nickName, organizer && organizer.nickname, nickName),
      avatarUrl: firstNonEmpty(organizer && organizer.avatarUrl, avatarUrl),
      updateTime: new Date()
    }
    if (unionId) patch.unionId = unionId

    var isNewUser = !organizer
    if (isNewUser) {
      patch.email = ''
      patch.passwordSet = false
      patch.createTime = new Date()
      var created = await db.collection('users').add({ data: patch })
      organizer = Object.assign({ _id: created._id }, patch)
    } else {
      await db.collection('users').doc(organizer._id).update({ data: patch })
      organizer = Object.assign({}, organizer, patch)
    }
    var user = normalizeUser(organizer)

    return {
      success: true,
      message: isNewUser ? '注册成功，已成为主办方' : '主办方账号绑定成功',
      userId: organizer._id,
      phone: phoneNumber,
      user: user,
      needSelectRole: false,
      isNewUser: isNewUser
    }
  } catch (err) {
    console.error('[bindPhoneToOpenId] error:', err)
    return { success: false, message: '绑定失败：' + (err.message || '未知错误') }
  }
}
