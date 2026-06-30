// 云函数入口文件 - 保存裁判签字记录
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const {
    matchId,
    signatureImage,  // base64 图片（H5 页面传入）
    signatureFileID, // 云存储 fileID（小程序传入）
    signedBy,
    signedAt,
    userId,
    signTime
  } = event

  console.log('保存签字记录:', { matchId, hasImage: !!signatureImage, hasFileID: !!signatureFileID })

  if (!matchId) {
    return {
      code: -1,
      success: false,
      message: '缺少必要参数：matchId'
    }
  }

  try {
    let fileID = signatureFileID
    let signatureUrl = ''

    // H5 页面：接收 base64，上传到云存储
    if (signatureImage && !fileID) {
      // 去掉 base64 前缀
      const base64Data = signatureImage.replace(/^data:image\/\w+;base64,/, '')
      const buffer = Buffer.from(base64Data, 'base64')

      // 上传到云存储
      const uploadRes = await cloud.uploadFile({
        cloudPath: `signatures/${matchId}_${Date.now()}.png`,
        fileContent: buffer
      })

      fileID = uploadRes.fileID
      console.log('base64 上传成功，fileID:', fileID)
    }

    if (!fileID) {
      return {
        code: -1,
        success: false,
        message: '缺少签字图片'
      }
    }

    // 获取临时访问链接
    const fileList = await cloud.getTempFileURL({
      fileList: [fileID]
    })

    signatureUrl = (fileList.fileList && fileList.fileList[0])
      ? fileList.fileList[0].tempFileURL
      : ''

    // 更新 matches 表
    const updateData = {
      refereeSignature: fileID,
      refereeSignatureUrl: signatureUrl,
      refereeSignatureTime: new Date(signedAt || signTime || Date.now()),
      refereeSigned: true,
      refereeSignedBy: signedBy || '比赛监督'
    }

    await db.collection('matches').doc(matchId).update({
      data: updateData
    })

    console.log('签字记录已保存，matchId:', matchId)

    return {
      code: 0,
      success: true,
      message: '签字保存成功',
      data: {
        signatureFileID: fileID,
        signatureUrl
      }
    }

  } catch (err) {
    console.error('保存签字记录失败:', err)
    return {
      code: -1,
      success: false,
      message: '保存签字失败: ' + err.message,
      error: err.message
    }
  }
}
