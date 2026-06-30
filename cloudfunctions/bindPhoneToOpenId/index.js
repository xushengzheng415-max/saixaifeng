// bindPhoneToOpenId/index.js
// 将手机号绑定到 openId
// ★ 2026-06-18 增强：
//   1. 同时保存 unionId（如果提供），让网页端微信扫码时能通过 unionId 直接识别用户，无需重复绑手机号
//   2. 同时写入 phone 和 phoneNumber 字段，确保与网页端字段名兼容
//   3. 同时写入 wechatOpenId 和 openId 字段

var cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async function(event, context) {
  var openId = event.openId
  var phoneNumber = event.phoneNumber
  var nickName = event.nickName || '微信用户'
  var avatarUrl = event.avatarUrl || ''
  var role = event.role || ''
  // ★ 新增：unionId 参数（如果小程序端能获取到的话）
  var unionId = event.unionId || ''

  console.log('[bindPhoneToOpenId] 收到请求, openId:', openId ? '有值' : '空', 'phone:', phoneNumber, 'hasUnionId:', !!unionId)

  if (!openId || !phoneNumber) {
    return {
      success: false,
      message: '缺少 openId 或 phoneNumber 参数'
    }
  }

  try {
    var db = cloud.database()
    var _ = db.command

    // 第1步：先按 openId 查（已经绑定过的情况）★ 同时查两种 openId 字段
    var checkByOpenId = await db.collection('users')
      .where(_.or([
        { openId: openId },
        { wechatOpenId: openId }
      ]))
      .get()

    if (checkByOpenId.data && checkByOpenId.data.length > 0) {
      // 已注册，更新手机号和微信信息
      const updateData = {
        phoneNumber: phoneNumber,
        phone: phoneNumber,  // ★ 同时写入标准字段
        nickName: nickName,
        avatarUrl: avatarUrl,
        updateTime: new Date()
      }
      // ★ 如果有 unionId 也保存
      if (unionId) {
        updateData.unionId = unionId
      }
      await db.collection('users')
        .doc(checkByOpenId.data[0]._id)
        .update({ data: updateData })
      console.log('[bindPhoneToOpenId] 按openId更新成功, userId=', checkByOpenId.data[0]._id)
      return {
        success: true,
        message: '更新成功',
        userId: checkByOpenId.data[0]._id
      }
    }

    // 第2步：按手机号查（老用户首次用新方案登录，补充openId）★ 同时查 phone/phoneNumber
    var checkByPhone = await db.collection('users')
      .where(_.or([
        { phone: phoneNumber },
        { phoneNumber: phoneNumber }
      ]))
      .get()

    if (checkByPhone.data && checkByPhone.data.length > 0) {
      // 老用户记录存在但没openId/wechatOpenId，补充微信信息
      const supplementData = {
        openId: openId,
        wechatOpenId: openId,  // ★ 同时写入两种字段名
        nickName: nickName,
        avatarUrl: avatarUrl,
        // 标准化手机号字段
        phone: checkByPhone.data[0].phone || phoneNumber,
        phoneNumber: checkByPhone.data[0].phoneNumber || phoneNumber,
        updateTime: new Date()
      }
      if (unionId) {
        supplementData.unionId = unionId
      }
      await db.collection('users')
        .doc(checkByPhone.data[0]._id)
        .update({ data: supplementData })
      console.log('[bindPhoneToOpenId] 老用户补充微信信息成功, userId=', checkByPhone.data[0]._id)
      return {
        success: true,
        message: '绑定成功',
        userId: checkByPhone.data[0]._id
      }
    }

    // 第3步：按手机号查 coach_library（老教练数据）
    var checkCoach = await db.collection('coach_library')
      .where({
        $or: [
          { phoneNumber: phoneNumber },
          { phone: phoneNumber },
          { mobile: phoneNumber }
        ]
      })
      .get()

    if (checkCoach.data && checkCoach.data.length > 0) {
      var coach = checkCoach.data[0]
      // 更新 coach_library 的 openId
      await db.collection('coach_library')
        .doc(coach._id)
        .update({
          data: {
            openId: openId,
            updateTime: new Date()
          }
        })
      // 同时创建/更新 users 记录（★ 写入双字段）
      var userData = {
        openId: openId,
        wechatOpenId: openId,
        phoneNumber: phoneNumber,
        phone: phoneNumber,
        nickName: coach.name || nickName,
        avatarUrl: coach.avatar || avatarUrl,
        role: 'coach',
        coachId: coach._id,
        createTime: new Date(),
        updateTime: new Date()
      }
      if (unionId) {
        userData.unionId = unionId
      }
      var addRes = await db.collection('users').add({ data: userData })
      console.log('[bindPhoneToOpenId] 老教练绑定成功, userId=', addRes._id)
      return {
        success: true,
        message: '教练账号绑定成功',
        userId: addRes._id
      }
    }

    // 第4步：全新用户，创建记录（★ 写入所有兼容字段）
    var userData = {
      openId: openId,
      wechatOpenId: openId,
      phoneNumber: phoneNumber,
      phone: phoneNumber,
      nickName: nickName,
      avatarUrl: avatarUrl,
      role: role,
      createTime: new Date(),
      updateTime: new Date()
    }
    if (unionId) {
      userData.unionId = unionId
    }

    var addRes = await db.collection('users').add({ data: userData })

    console.log('[bindPhoneToOpenId] 新用户注册成功, _id:', addRes._id, 'hasUnionId:', !!unionId)
    return {
      success: true,
      message: '注册成功',
      userId: addRes._id
    }
  } catch (err) {
    console.error('[bindPhoneToOpenId] 异常:', err)
    return {
      success: false,
      message: '数据库操作失败: ' + (err.message || '未知错误')
    }
  }
}
