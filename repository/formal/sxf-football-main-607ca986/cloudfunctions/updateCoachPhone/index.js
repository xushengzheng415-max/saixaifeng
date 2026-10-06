// updateCoachPhone/index.js
// 修改教练手机号（用于数据共通）

var cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = function (event, context) {
  var openId = cloud.getWXContext().OPENID
  var oldPhone = event.oldPhone || ''
  var newPhone = event.newPhone || ''
  
  if (!newPhone || newPhone.length !== 11) {
    return {
      success: false,
      message: '新手机号格式错误'
    }
  }
  
  try {
    var db = cloud.database()
    
    // 1. 通过 openId 找到当前用户记录
    var userResult = db.collection('coach_library')
      .where({ openId: openId })
      .get()
    
    // 2. 如果没找到，尝试通过旧手机号查找
    if ((!userResult.data || userResult.data.length === 0) && oldPhone) {
      userResult = db.collection('coach_library')
        .where({ contactPhone: oldPhone })
        .get()
    }
    
    if (!userResult.data || userResult.data.length === 0) {
      return {
        success: false,
        message: '未找到您的账号记录，请联系管理员'
      }
    }
    
    var userRecord = userResult.data[0]
    var oldPhoneNum = userRecord.contactPhone || ''
    
    // 3. 更新手机号
    db.collection('coach_library')
      .doc(userRecord._id)
      .update({
        data: {
          contactPhone: newPhone,
          updateTime: db.serverDate()
        }
      })
    
    // 4. 同时更新关联的球队记录中的 contactPhone
    var teamResult = db.collection('teams')
      .where({ coachId: userRecord._id })
      .get()
    
    if (teamResult.data && teamResult.data.length > 0) {
      teamResult.data.forEach(function(team) {
        db.collection('teams')
          .doc(team._id)
          .update({
            data: {
              contactPhone: newPhone,
              updateTime: db.serverDate()
            }
          })
      })
    }
    
    return {
      success: true,
      message: '手机号已更新',
      oldPhone: oldPhoneNum,
      newPhone: newPhone
    }
    
  } catch (err) {
    console.error('更新手机号失败:', err)
    return {
      success: false,
      message: '更新失败: ' + (err.message || '未知错误')
    }
  }
}
