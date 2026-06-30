// updateUserRole/index.js
// 更新用户的角色（ES5 语法，兼容真机）
// 同时更新 users 集合和对应的业务集合（coach_library / referee_library）

var cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async function(event, context) {
  var openId = event.openId
  var role = event.role

  console.log('[updateUserRole] 收到请求, openId:', openId ? '有值' : '空', 'role:', role)

  if (!openId || !role) {
    return {
      success: false,
      message: '缺少 openId 或 role 参数'
    }
  }

  var validRoles = ['coach', 'referee', 'organizer', 'player', 'spectator']
  if (validRoles.indexOf(role) === -1) {
    return {
      success: false,
      message: '无效的角色: ' + role
    }
  }

  try {
    var db = cloud.database()
    var _ = db.command

    // 第1步：更新 users 集合
    var userRes = await db.collection('users').where({ openId: openId }).get()

    if (userRes.data && userRes.data.length > 0) {
      await db.collection('users').doc(userRes.data[0]._id).update({
        data: {
          role: role,
          updateTime: new Date()
        }
      })
      console.log('[updateUserRole] users 集合更新成功, role:', role)
    } else {
      console.log('[updateUserRole] users 集合未找到记录')
    }

    // 第2步：根据 role 更新对应的业务集合
    if (role === 'coach') {
      var coachRes = await db.collection('coach_library').where({ openId: openId }).get()
      if (coachRes.data && coachRes.data.length > 0) {
        await db.collection('coach_library').doc(coachRes.data[0]._id).update({
          data: { role: role, updateTime: new Date() }
        })
        console.log('[updateUserRole] coach_library 更新成功')
      }
    } else if (role === 'referee') {
      var refRes = await db.collection('referee_library').where({ openId: openId }).get()
      if (refRes.data && refRes.data.length > 0) {
        await db.collection('referee_library').doc(refRes.data[0]._id).update({
          data: { role: role, updateTime: new Date() }
        })
        console.log('[updateUserRole] referee_library 更新成功')
      }
    }

    return {
      success: true,
      message: '身份更新成功',
      role: role
    }
  } catch (err) {
    console.error('[updateUserRole] 异常:', err)
    return {
      success: false,
      message: '更新失败: ' + (err.message || '未知错误')
    }
  }
}
