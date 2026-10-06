/**
 * 百度智能云人像分割/抠图 API - 通过云函数调用
 * 解决前端直接调用百度 API 的 CORS 问题
 */

import { callFunction } from './cloud'

/**
 * 压缩图片
 * @param {File} file - 原文件
 * @param {number} maxWidth - 最大宽度
 * @param {number} quality - 压缩质量 0-1
 * @returns {Promise<Blob>}
 */
function compressImage(file, maxWidth = 800, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    
    img.onload = () => {
      URL.revokeObjectURL(url)
      
      // 计算新尺寸
      let width = img.width
      let height = img.height
      
      if (width > maxWidth) {
        height = (height * maxWidth) / width
        width = maxWidth
      }
      
      // 创建 canvas
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)
      
      // 转换为 blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('图片压缩失败'))
          }
        },
        'image/jpeg',
        quality
      )
    }
    
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片加载失败'))
    }
    
    img.src = url
  })
}

/**
 * 将 File/Blob 转为 Base64
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      // 去掉 data:image/xxx;base64, 前缀
      const base64 = reader.result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * 百度智能云人像分割 - 通过云函数
 * @param {File} imageFile - 图片文件
 * @returns {Promise<{success: boolean, data?: string, message?: string}>}
 */
export async function removeBackgroundBaidu(imageFile) {
  try {

    // 1. 压缩图片（走 webLoginApi 中转时 HTTP body 有限制，必须压到极小）
    let processedFile = imageFile
    
    // 保持 250px 宽、0.5 质量，确保 base64 < 100KB
    if (imageFile.size > 50 * 1024) {
      processedFile = await compressImage(imageFile, 250, 0.5)
    }

    // 2. 将图片转为 Base64
    const imageBase64 = await fileToBase64(processedFile)

    // 3. 调用云函数
    const result = await callFunction('baiduRemoveBg', {
      action: 'removeBackground',
      imageBase64: imageBase64
    })


    if (result.success && result.data) {
      return {
        success: true,
        data: `data:image/png;base64,${result.data}`
      }
    } else {
      // 透传云函数返回的具体错误信息（含百度错误码）
      const errMsg = result.message || '百度抠图失败，请稍后重试'
      throw new Error(errMsg)
    }

  } catch (err) {
    console.error('[Baidu] 人像分割失败:', err)
    return {
      success: false,
      message: err.message || '百度抠图失败'
    }
  }
}

/**
 * 测试百度 API 是否可用
 */
export async function testBaiduApi() {
  try {
    const result = await callFunction('baiduRemoveBg', {
      action: 'test'
    })
    return result
  } catch (err) {
    return { success: false, message: err.message }
  }
}
