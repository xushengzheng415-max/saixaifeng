const https = require('https')
const http = require('http')

/**
 * 代理获取竞赛规程文档，绕过浏览器 CORS 限制
 * 入参: { fileUrl: string }
 * 出参: { success, data?: base64String, message? }
 */
exports.main = async (event, context) => {
  const { fileUrl } = event

  if (!fileUrl) {
    return { success: false, message: '缺少文件URL参数' }
  }

  // 安全校验：只允许腾讯云 COS/TCB 域名
  try {
    const url = new URL(fileUrl)
    const allowedHosts = [
      '.myqcloud.com',
      '.tcb.qcloud.la',
      '.tcloudbaseapp.com'
    ]
    const isAllowed = allowedHosts.some(h => url.hostname.endsWith(h))
    if (!isAllowed) {
      return { success: false, message: '不支持的文件域名: ' + url.hostname }
    }
  } catch {
    return { success: false, message: '文件URL格式无效' }
  }

  try {
    const fileBuffer = await downloadFile(fileUrl)
    const base64 = fileBuffer.toString('base64')

    return {
      success: true,
      data: base64
    }
  } catch (err) {
    console.error('[getRegulations] 获取文件失败:', err.message)
    return {
      success: false,
      message: '获取文件失败: ' + err.message
    }
  }
}

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    client.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }

      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject).on('timeout', () => reject(new Error('请求超时')))
  })
}
