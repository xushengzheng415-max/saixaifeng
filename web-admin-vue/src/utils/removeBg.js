/**
 * Remove.bg API 工具函数
 * 用于图片抠图去背景
 */

const REMOVE_BG_API_KEY = 'mX1VixQHtrnpc1J7B2rPS3LM'
const REMOVE_BG_API_URL = 'https://api.remove.bg/v1.0/removebg'

/**
 * 将文件转换为 Base64
 * @param {File} file - 图片文件
 * @returns {Promise<string>} Base64 字符串
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
 * 使用 remove.bg API 抠图
 * @param {File} file - 图片文件
 * @param {Object} options - 可选参数
 * @returns {Promise<{success: boolean, data?: string, message?: string}>}
 */
export async function removeBackground(file, options = {}) {
  try {

    // 构建 FormData
    const formData = new FormData()
    formData.append('image_file', file)
    formData.append('size', options.size || 'auto')

    // 可选参数
    if (options.format) {
      formData.append('format', options.format) // png, jpg, webp
    }
    if (options.bg_color) {
      formData.append('bg_color', options.bg_color)
    }
    if (options.bg_image_url) {
      formData.append('bg_image_url', options.bg_image_url)
    }

    const response = await fetch(REMOVE_BG_API_URL, {
      method: 'POST',
      headers: {
        'X-Api-Key': REMOVE_BG_API_KEY
      },
      body: formData
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('[RemoveBg] API 错误:', errorData)

      // 处理特定错误码
      if (response.status === 402) {
        throw new Error('免费额度已用完，请明天再试或升级套餐')
      } else if (response.status === 403) {
        throw new Error('API Key 无效或已过期')
      } else if (response.status === 429) {
        throw new Error('请求过于频繁，请稍后再试')
      } else {
        throw new Error(errorData.errors?.[0]?.title || `API 错误: ${response.status}`)
      }
    }

    // 获取处理后的图片 Blob
    const blob = await response.blob()

    // 转换为 Base64
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })


    return {
      success: true,
      data: base64,
      type: blob.type
    }

  } catch (err) {
    console.error('[RemoveBg] 错误:', err)
    return {
      success: false,
      message: err.message || '抠图处理失败'
    }
  }
}

/**
 * 使用 remove.bg API 抠图（Base64 输入）
 * @param {string} base64Image - Base64 编码的图片（带 data:image 前缀）
 * @param {Object} options - 可选参数
 * @returns {Promise<{success: boolean, data?: string, message?: string}>}
 */
export async function removeBackgroundBase64(base64Image, options = {}) {
  try {

    // 将 base64 转换为 Blob
    const response = await fetch(base64Image)
    const blob = await response.blob()
    const file = new File([blob], 'image.png', { type: blob.type })

    return await removeBackground(file, options)

  } catch (err) {
    console.error('[RemoveBg] Base64 处理错误:', err)
    return {
      success: false,
      message: err.message || '抠图处理失败'
    }
  }
}

/**
 * 检查 API 额度状态
 * @returns {Promise<{success: boolean, data?: Object, message?: string}>}
 */
export async function checkApiCredits() {
  try {
    const response = await fetch('https://api.remove.bg/v1.0/account', {
      method: 'GET',
      headers: {
        'X-Api-Key': REMOVE_BG_API_KEY
      }
    })

    if (!response.ok) {
      throw new Error(`API 错误: ${response.status}`)
    }

    const data = await response.json()

    return {
      success: true,
      data: {
        credits: data.data.attributes.credits,
        totalCredits: data.data.attributes.credits.total,
        usedCredits: data.data.attributes.credits.used,
        subscription: data.data.attributes.subscription
      }
    }

  } catch (err) {
    console.error('[RemoveBg] 检查额度错误:', err)
    return {
      success: false,
      message: err.message || '检查额度失败'
    }
  }
}
