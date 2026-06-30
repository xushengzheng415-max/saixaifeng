// 云函数入口文件 - AI人像抠图
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

/**
 * 腾讯云API密钥配置
 * 注意：需要在云开发控制台配置环境变量
 * TENCENT_SECRET_ID 和 TENCENT_SECRET_KEY
 */
const TENCENT_API_BASE = 'https://bda.tencentcloudapi.com'

/**
 * 调用腾讯云人像分割API
 * 文档：https://cloud.tencent.com/document/product/1208/42914
 */
async function removeBackground(imageUrl) {
  const secretId = process.env.TENCENT_SECRET_ID
  const secretKey = process.env.TENCENT_SECRET_KEY
  
  if (!secretId || !secretKey) {
    console.warn('⚠️ 未配置腾讯云API密钥，跳过抠图')
    return null
  }

  try {
    // 1. 先下载图片转为base64
    const imageBase64 = await downloadImageToBase64(imageUrl)
    if (!imageBase64) {
      throw new Error('下载图片失败')
    }

    // 2. 调用腾讯云人像分割API
    const result = await callTencentSegmentAPI(imageBase64, secretId, secretKey)
    
    if (result && result.Image) {
      // 3. 将抠图后的base64上传到云存储
      const processedUrl = await uploadProcessedImage(result.Image)
      return processedUrl
    }
    
    return null
  } catch (err) {
    console.error('❌ 人像抠图失败:', err.message)
    return null
  }
}

/**
 * 下载图片并转为base64
 */
async function downloadImageToBase64(imageUrl) {
  try {
    // 使用云开发的HTTP请求
    const response = await cloud.callFunction({
      name: 'uploadFile',
      data: {
        action: 'downloadToBase64',
        url: imageUrl
      }
    })
    
    if (response.result && response.result.base64) {
      return response.result.base64
    }
    
    // 备用方案：如果uploadFile不支持，直接返回null
    return null
  } catch (err) {
    console.error('下载图片失败:', err)
    return null
  }
}

/**
 * 调用腾讯云API - 人像分割
 */
async function callTencentSegmentAPI(imageBase64, secretId, secretKey) {
  // 这里使用腾讯云API的签名V3版本
  // 实际实现需要按照腾讯云API签名规范
  
  // 简化版：使用云开发的openapi调用（如果支持）
  try {
    // 尝试使用云开发内置的AI能力
    const result = await cloud.callFunction({
      name: 'generateImage-pOOPtN',  // 使用现有的图像处理云函数
      data: {
        action: 'removeBg',
        imageBase64: imageBase64
      }
    })
    
    return result.result
  } catch (err) {
    console.error('调用图像处理API失败:', err)
    return null
  }
}

/**
 * 上传处理后的图片到云存储
 */
async function uploadProcessedImage(base64Data) {
  try {
    // 移除base64前缀
    const base64Image = base64Data.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64Image, 'base64')
    
    const fileName = `processed/avatar_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.png`
    
    const uploadResult = await cloud.uploadFile({
      cloudPath: fileName,
      fileContent: buffer
    })
    
    // 获取临时链接
    const fileList = await cloud.getTempFileURL({
      fileList: [uploadResult.fileID]
    })
    
    return fileList.fileList[0].tempFileURL
  } catch (err) {
    console.error('上传处理后的图片失败:', err)
    return null
  }
}

/**
 * 使用前端Canvas方案（备用）
 * 如果AI抠图失败，返回原图
 */
async function simpleBackgroundRemove(imageUrl) {
  // 目前先返回原图，后续可以实现简单的颜色阈值算法
  return imageUrl
}

// 云函数入口函数
exports.main = async (event, context) => {
  const { action, imageUrl, playerId } = event

  try {
    switch (action) {
      case 'removeBg':
        if (!imageUrl) {
          return { success: false, message: '缺少图片URL' }
        }

        console.log('🎨 开始人像抠图:', imageUrl.substring(0, 50))
        
        // 尝试AI抠图
        let processedUrl = await removeBackground(imageUrl)
        
        // 如果失败，使用原图
        if (!processedUrl) {
          console.log('⚠️ AI抠图失败，使用原图')
          processedUrl = imageUrl
        }

        // 如果提供了playerId，更新数据库
        if (playerId) {
          const db = cloud.database()
          await db.collection('players').doc(playerId).update({
            data: {
              photoUrlProcessed: processedUrl,
              photoUrlOriginal: imageUrl,
              processedAt: new Date()
            }
          })
        }

        return {
          success: true,
          data: {
            originalUrl: imageUrl,
            processedUrl: processedUrl,
            isProcessed: processedUrl !== imageUrl
          },
          message: processedUrl !== imageUrl ? '抠图成功' : '抠图失败，使用原图'
        }

      case 'batchRemoveBg':
        if (!event.players || !Array.isArray(event.players)) {
          return { success: false, message: '缺少 players 参数' }
        }

        const results = []
        for (const player of event.players) {
          if (player.photoUrl) {
            try {
              const result = await removeBackground(player.photoUrl)
              results.push({
                playerId: player._id,
                originalUrl: player.photoUrl,
                processedUrl: result || player.photoUrl,
                success: !!result
              })
            } catch (err) {
              results.push({
                playerId: player._id,
                originalUrl: player.photoUrl,
                processedUrl: player.photoUrl,
                success: false,
                error: err.message
              })
            }
          }
        }

        return {
          success: true,
          data: { results },
          message: `成功处理 ${results.filter(r => r.success).length}/${results.length} 张图片`
        }

      default:
        return {
          success: false,
          message: '未知操作，可用: removeBg, batchRemoveBg'
        }
    }
  } catch (err) {
    console.error('❌ 人像抠图云函数错误:', err)
    return {
      success: false,
      message: '处理失败: ' + (err.message || '未知错误'),
      error: err.message
    }
  }
}
