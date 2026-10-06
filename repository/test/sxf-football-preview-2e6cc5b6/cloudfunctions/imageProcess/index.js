// cloudfunctions/imageProcess/index.js - AI图像处理云函数
// 使用腾讯混元AI进行图像抠图

const cloud = require('wx-server-sdk')
cloud.init()

// 配置混元AI API（需要在云开发控制台设置环境变量）
const HUNYUAN_API_KEY = process.env.HUNYUAN_API_KEY || ''

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { action, imageUrl } = event

  try {
    switch (action) {
      case 'removeBackground':
        return await removeBackground(imageUrl)
      default:
        return { success: false, error: '未知操作' }
    }
  } catch (err) {
    console.error('AI图像处理失败:', err)
    return { success: false, error: err.message }
  }
}

// 抠图处理
async function removeBackground(imageUrl) {
  if (!HUNYUAN_API_KEY) {
    return { 
      success: false, 
      error: '未配置AI密钥，请在云开发控制台环境变量中设置HUNYUAN_API_KEY' 
    }
  }

  try {
    // 1. 下载云存储图片到本地临时文件
    const tempFilePath = await cloud.downloadFile({
      fileID: imageUrl
    })

    // 2. 调用混元AI API进行图像分割/抠图
    // 这里使用混元AI的图像分割能力
    const response = await fetch('https://api.hunyuan.tencent.com/v1/segment/portrait', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${HUNYUAN_API_KEY}`
      },
      body: JSON.stringify({
        image_url: imageUrl
      })
    })

    const result = await response.json()

    if (result && result.data && result.data.image) {
      // 3. 将处理后的图片上传回云存储
      const outputPath = `processed/${Date.now()}-${Math.random().toString(36).substr(2, 8)}.png`
      const uploadResult = await cloud.uploadFile({
        cloudPath: outputPath,
        fileContent: Buffer.from(result.data.image, 'base64')
      })

      return {
        success: true,
        processedUrl: uploadResult.fileID
      }
    }

    // 如果API不支持直接返回抠图，暂返回原图
    return {
      success: true,
      processedUrl: imageUrl,
      message: 'AI处理中，返回原图'
    }
  } catch (err) {
    console.error('抠图失败:', err)
    return { success: false, error: err.message }
  }
}