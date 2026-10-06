const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
  throwOnNotFound: false
})

exports.main = async (event, context) => {
  const { action, data } = event

  try {
    switch (action) {
      case 'uploadBase64':
        return await uploadBase64(data)
      case 'delete':
        return await deleteFile(data)
      default:
        return {
          success: false,
          message: '未知的操作类型'
        }
    }
  } catch (err) {
    console.error('操作失败:', err)
    return {
      success: false,
      message: '操作失败：' + err.message
    }
  }
}

// 上传 Base64 图片到云存储
async function uploadBase64(data) {
  const { base64Data, folder = 'images', filename } = data

  // 解析 Base64
  const base64Regex = /^data:image\/(\w+);base64,/
  const match = base64Data.match(base64Regex)

  if (!match) {
    return {
      success: false,
      message: '无效的 Base64 图片数据'
    }
  }

  const ext = match[1] || 'jpg'
  const buffer = Buffer.from(base64Data.replace(base64Regex, ''), 'base64')
  const cloudPath = `${folder}/${Date.now()}_${filename || Math.random().toString(36).substring(7)}.${ext}`

  try {
    // 使用微信云开发的存储能力上传到 COS
    const result = await cloud.uploadFile({
      cloudPath,
      fileContent: buffer
    })

    // 获取临时访问链接
    const tempUrl = await cloud.getTempFileURL({
      fileList: [result.fileID]
    })

    return {
      success: true,
      data: {
        fileID: result.fileID,
        url: tempUrl.fileList[0]?.tempFileURL || '',
        cloudPath
      }
    }
  } catch (err) {
    console.error('上传失败:', err)
    throw err
  }
}

// 删除文件
async function deleteFile(data) {
  const { fileID } = data

  if (!fileID) {
    return {
      success: false,
      message: '缺少 fileID'
    }
  }

  try {
    await cloud.deleteFile({
      fileList: [fileID]
    })

    return {
      success: true,
      message: '删除成功'
    }
  } catch (err) {
    console.error('删除失败:', err)
    throw err
  }
}
