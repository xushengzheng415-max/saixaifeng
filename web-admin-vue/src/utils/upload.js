/**
 * 文件上传工具函数
 * 支持 Base64 图片上传到云存储
 */

import { callFunction } from './cloud'

/**
 * 将 Base64 图片上传到云存储
 * @param {string} base64Data - Base64 编码的图片数据（带 data:image/xxx;base64, 前缀）
 * @param {string} folder - 存储文件夹路径
 * @returns {Promise<{success: boolean, fileID?: string, url?: string, message?: string}>}
 */
export async function uploadBase64Image(base64Data, folder = 'images') {
  try {

    // 调用云函数上传
    const result = await callFunction('uploadFile', {
      action: 'uploadBase64',
      base64Data: base64Data,
      folder: folder
    })

    if (result && result.success) {
      return {
        success: true,
        fileID: result.fileID,
        url: result.fileID,
        message: '上传成功'
      }
    } else {
      throw new Error(result?.message || '上传失败')
    }

  } catch (err) {
    console.error('[Upload] 上传失败:', err)
    return {
      success: false,
      message: err.message || '上传失败'
    }
  }
}

/**
 * 上传文件到云存储（使用 File 对象）
 * @param {File} file - 文件对象
 * @param {string} folder - 存储文件夹路径
 * @returns {Promise<{success: boolean, fileID?: string, url?: string, message?: string}>}
 */
export async function uploadFile(file, folder = 'images') {
  try {

    // 将文件转换为 Base64
    const base64 = await fileToBase64(file)

    // 调用上传函数
    return await uploadBase64Image(base64, folder)

  } catch (err) {
    console.error('[Upload] 文件上传失败:', err)
    return {
      success: false,
      message: err.message || '文件上传失败'
    }
  }
}

/**
 * 将 File 对象转换为 Base64
 * @param {File} file - 文件对象
 * @returns {Promise<string>} Base64 字符串
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * 生成带时间戳的文件名
 * @param {string} originalName - 原始文件名
 * @returns {string} 新文件名
 */
export function generateFileName(originalName = '') {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  const ext = originalName.split('.').pop() || 'png'
  return `${timestamp}_${random}.${ext}`
}

/**
 * 获取云存储文件的临时访问 URL
 * @param {string} fileID - 云存储文件 ID
 * @returns {Promise<{success: boolean, url?: string, message?: string}>}
 */
export async function getTempFileURL(fileID) {
  try {
    const result = await callFunction('uploadFile', {
      action: 'getTempFileURL',
      fileID: fileID
    })

    if (result && result.success) {
      return {
        success: true,
        url: result.url
      }
    } else {
      throw new Error(result?.message || '获取文件 URL 失败')
    }

  } catch (err) {
    console.error('[Upload] 获取临时 URL 失败:', err)
    return {
      success: false,
      message: err.message || '获取文件 URL 失败'
    }
  }
}
