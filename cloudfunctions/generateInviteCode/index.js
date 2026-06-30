// 云函数入口 - 生成邀请小程序码
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

/**
 * 生成邀请小程序码
 * 参数：
 *  - type: 'coach' | 'player'
 *  - teamId: 球队ID
 *  - teamName: 球队名称（用于显示）
 *  - role: 担任角色
 */
exports.main = async (event, context) => {
  const {
    type = 'coach',
    teamId = '',
    teamName = '',
    role = '教练'
  } = event

  console.log('生成邀请码参数:', event)

  try {
    if (!teamId) {
      return { success: false, message: '缺少 teamId 参数' }
    }

    // 1. 生成短邀请ID（8位随机字符串）
    const inviteId = Math.random().toString(36).substring(2, 10)

    // 2. 存储到 invite_records 集合（7天过期）
    const expireTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await db.collection('invite_records').add({
      _id: inviteId,
      type: type,
      teamId: teamId,
      teamName: teamName,
      role: role,
      status: 'pending',
      createTime: db.serverDate(),
      expireTime: expireTime
    })

    console.log('邀请记录已存储，inviteId:', inviteId)

    // 3. 生成小程序码（scene 最多32字符，inviteId 只有8位，安全）
    const result = await cloud.openapi.wxacode.getUnlimited({
      scene: inviteId,
      page: 'pages/invite/invite',
      width: 280,
      autoColor: false,
      lineColor: { r: 27, g: 94, b: 32 },  // 麦部绿色 #1B5E20
      isHyaline: false,
      envVersion: 'trial'  // 'release' | 'trial' | 'develop'
    })

    console.log('小程序码生成成功')

    // 4. 上传到云存储
    const uploadResult = await cloud.uploadFile({
      cloudPath: `qrcodes/invite_${inviteId}.png`,
      fileContent: result.buffer
    })

    console.log('已上传到云存储:', uploadResult.fileID)

    // 5. 获取临时访问链接
    const tempUrlResult = await cloud.getTempFileURL({
      fileList: [uploadResult.fileID]
    })

    const tempUrl = tempUrlResult.fileList[0].tempFileURL

    return {
      success: true,
      message: '邀请码生成成功',
      data: {
        inviteId: inviteId,
        inviteLink: tempUrl,
        fileID: uploadResult.fileID,
        // 小程序内跳转路径（用于分享）
        miniprogramPath: `pages/invite/invite?scene=${inviteId}`
      }
    }

  } catch (err) {
    console.error('生成邀请码失败:', err)
    return {
      success: false,
      message: '生成邀请码失败: ' + (err.message || err),
      error: err
    }
  }
}
