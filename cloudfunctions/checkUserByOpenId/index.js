// checkUserByOpenId/index.js
// 根据 openId 查询用户是否已注册（ES5 语法，兼容真机）

var cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 安全查询：集合不存在时返回空数组，不抛异常
async function safeQuery(db, collectionName, whereCondition) {
  try {
    var res = await db.collection(collectionName).where(whereCondition).get()
    return res.data || []
  } catch (err) {
    // 集合不存在或其他错误，返回空数组
    console.log('[safeQuery] ' + collectionName + ' 查询失败（可能集合不存在）:', err.message || err)
    return []
  }
}

// 注意：必须用 async，否则返回 Promise 框架不等待
exports.main = async function(event, context) {
  var openId = event.openId

  console.log('[checkUserByOpenId] 收到请求, openId:', openId ? '有值' : '空')

  if (!openId) {
    return {
      success: false,
      message: '缺少 openId 参数'
    }
  }

  try {
    var db = cloud.database()

    // 分别查询，独立容错（某个集合不存在不影响其他）
    var usersData = await safeQuery(db, 'users', { openId: openId })
    var coachData = await safeQuery(db, 'coach_library', { openId: openId })
    var refereeData = await safeQuery(db, 'referee_library', { openId: openId })

    console.log('[checkUserByOpenId] users:', usersData.length,
                'coach_library:', coachData.length,
                'referee_library:', refereeData.length)

    var user = null
    var sourceCollection = ''

    if (usersData.length > 0) {
      user = usersData[0]
      sourceCollection = 'users'
    } else if (coachData.length > 0) {
      user = coachData[0]
      sourceCollection = 'coach_library'
    } else if (refereeData.length > 0) {
      user = refereeData[0]
      sourceCollection = 'referee_library'
    }

    if (user) {
      // 统一字段名（不同集合字段可能不同）
      var phone = user.phoneNumber || user.phone || user.mobile || ''
      var role = user.role || ''
      if (!role && sourceCollection === 'coach_library') role = 'coach'
      if (!role && sourceCollection === 'referee_library') role = 'referee'

      return {
        success: true,
        isRegistered: true,
        user: {
          _id: user._id,
          openId: user.openId,
          phoneNumber: phone,
          nickName: user.nickName || user.name || '微信用户',
          avatarUrl: user.avatarUrl || user.avatar || '',
          role: role,
          roleName: user.roleName || '',
          source: sourceCollection
        }
      }
    } else {
      return {
        success: true,
        isRegistered: false
      }
    }
  } catch (err) {
    console.error('[checkUserByOpenId] 异常:', err)
    return {
      success: false,
      message: '查询失败: ' + (err.message || '未知错误')
    }
  }
}
