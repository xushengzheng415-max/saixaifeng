// cloudfunctions/user/index.js - 用户云函数
const cloud = require('wx-server-sdk')

cloud.init()

// 云函数入口
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const db = cloud.database()
  const _ = db.command
  
  const { action, userInfo, role } = event
  
  try {
    switch (action) {
      case 'login':
        return await handleLogin(db, wxContext.OPENID, userInfo, role)
      default:
        return { success: false, error: '未知操作' }
    }
  } catch (err) {
    console.error('云函数错误:', err)
    return { success: false, error: err.message }
  }
}

// 处理登录
async function handleLogin(db, openid, userInfo, role) {
  try {
    // 查询是否已存在用户
    const userRes = await db.collection('users')
      .where({
        _openid: openid
      })
      .get()
    
    let userId
    if (userRes.data.length > 0) {
      // 更新用户信息
      userId = userRes.data[0]._id
      await db.collection('users')
        .doc(userId)
        .update({
          data: {
            userInfo: userInfo,
            role: role,
            updateTime: db.serverDate()
          }
        })
    } else {
      // 创建新用户
      const addRes = await db.collection('users')
        .add({
          data: {
            _openid: openid,
            userInfo: userInfo,
            role: role || 'coach',
            createTime: db.serverDate(),
            updateTime: db.serverDate()
          }
        })
      userId = addRes._id
    }
    
    return {
      success: true,
      openid: openid,
      userId: userId,
      role: role || 'coach'
    }
  } catch (err) {
    console.error('登录处理失败:', err)
    return { success: false, error: err.message }
  }
}