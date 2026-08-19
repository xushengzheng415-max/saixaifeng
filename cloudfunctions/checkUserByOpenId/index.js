// 根据小程序 OpenID 查询或创建纯微信主办方账号。
var cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async function(event) {
  event = event || {}
  var wxContext = cloud.getWXContext()
  var openId = wxContext.OPENID || event.openId || ''
  var createIfMissing = event.createIfMissing === true

  if (!openId) {
    return { success: false, isRegistered: false, message: '缺少微信 OpenID' }
  }

  try {
    var db = cloud.database()
    var result = await db.collection('users').where({ openId: openId }).limit(2).get()
    var users = result.data || []

    if (users.length > 1) {
      return {
        success: false,
        isRegistered: false,
        message: '当前微信存在重复账号，请联系管理员处理'
      }
    }

    var user = users[0] || null
    if (!user && !createIfMissing) {
      return { success: true, isRegistered: false }
    }

    if (!user) {
      var now = db.serverDate()
      var userData = {
        openId: openId,
        nickName: event.nickName || '微信用户',
        avatarUrl: event.avatarUrl || '',
        role: 'organizer',
        loginType: 'wechat',
        createTime: now,
        updateTime: now,
        lastLoginTime: now
      }
      var created = await db.collection('users').add({ data: userData })
      user = Object.assign({ _id: created._id }, userData)
    } else {
      var patch = {
        role: 'organizer',
        loginType: 'wechat',
        updateTime: db.serverDate(),
        lastLoginTime: db.serverDate()
      }
      await db.collection('users').doc(user._id).update({ data: patch })
      user = Object.assign({}, user, patch)
    }

    var currentOrgId = String(user.orgId || user.organizationId || '').trim()

    return {
      success: true,
      isRegistered: true,
      isNewUser: !users[0],
      user: {
        _id: user._id,
        orgId: currentOrgId,
        needsOrganization: !currentOrgId,
        openId: openId,
        nickName: user.nickName || '微信用户',
        avatarUrl: user.avatarUrl || '',
        role: 'organizer',
        source: 'users'
      }
    }
  } catch (err) {
    console.error('[checkUserByOpenId] 异常:', err)
    return { success: false, isRegistered: false, message: '微信登录失败：' + (err.message || '未知错误') }
  }
}
