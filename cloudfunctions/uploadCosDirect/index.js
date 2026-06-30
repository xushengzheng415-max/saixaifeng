// uploadCosDirect - 浏览器端 FormData 直传图片
// 解决 CloudBase HTTP 触发器对 JSON+Base64 的大 body 限制（413）
//
// 工作流：
//   浏览器 → POST multipart/form-data → uploadCosDirect 端点
//         → cloud.uploadFile() → COS 存储
//   浏览器 → 拿 fileID 调 webLoginApi / getTempFileURL → 拿到可访问 URL
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
  throwOnNotFound: false
})

exports.main = async (event, context) => {
  // CloudBase HTTP 触发器模式下，二进制流放在 event.binaryData 或 event.body
  // formData 字段解析在 event.queryStringParameters / event.headers / event.formFields

  console.log('[uploadCosDirect] 收到请求, keys:', Object.keys(event))
  console.log('[uploadCosDirect] headers:', JSON.stringify(event.headers || {}).substring(0, 200))

  try {
    let buffer = null
    let folder = 'images'
    let filename = null

    // 兼容多种 HTTP 触发器模式
    if (event.file && event.file instanceof Buffer) {
      // 模式1：直接传 file buffer（部分触发器模式）
      buffer = event.file
      folder = event.folder || 'images'
      filename = event.filename
    } else if (event.body && Buffer.isBuffer(event.body)) {
      // 模式2：raw body（FormData 二进制流）
      // 需要解析 multipart/form-data 边界
      buffer = await parseMultipartBody(event.body, event.headers)
    } else if (event.body && typeof event.body === 'string') {
      // 模式3：body 是 base64 字符串（最后兜底）
      // 其实这个函数主要解决 formData 模式，但保留兼容
      const base64 = event.body
      folder = event.folder || 'images'
      filename = event.filename
      const m = base64.match(/^data:image\/(\w+);base64,(.+)$/)
      if (m) {
        buffer = Buffer.from(m[2], 'base64')
        filename = filename || `upload_${Date.now()}.${m[1]}`
      } else {
        buffer = Buffer.from(base64, 'base64')
      }
    } else if (event.binaryData) {
      // 模式4：API Gateway 网关模式
      buffer = Buffer.from(event.binaryData, 'base64')
      folder = event.queryStringParameters?.folder || 'images'
      filename = event.queryStringParameters?.filename
    }

    if (!buffer || buffer.length === 0) {
      return {
        success: false,
        error: '未接收到文件数据',
        received: { eventKeys: Object.keys(event), hasBody: !!event.body, bodyType: typeof event.body }
      }
    }

    filename = filename || `upload_${Date.now()}.png`
    const cloudPath = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${filename}`

    console.log('[uploadCosDirect] 上传:', cloudPath, 'size:', buffer.length)

    const uploadResult = await cloud.uploadFile({
      cloudPath,
      fileContent: buffer
    })

    console.log('[uploadCosDirect] 成功:', uploadResult.fileID)

    // 获取临时 URL
    let tempUrl = ''
    try {
      const temp = await cloud.getTempFileURL({ fileList: [uploadResult.fileID] })
      if (temp.fileList && temp.fileList[0]) tempUrl = temp.fileList[0].tempFileURL
    } catch (e) {
      console.warn('[uploadCosDirect] getTempFileURL 失败:', e.message)
    }

    return {
      success: true,
      fileID: uploadResult.fileID,
      tempUrl,
      cloudPath,
      size: buffer.length
    }
  } catch (err) {
    console.error('[uploadCosDirect] 失败:', err)
    return {
      success: false,
      error: err.message || '上传失败',
      stack: err.stack
    }
  }
}

// 解析 multipart/form-data 的 body buffer
// 简单实现：从 Content-Type 提取 boundary，按 boundary 切分
function parseMultipartBody(bodyBuffer, headers) {
  if (!headers) return null
  const contentType = headers['content-type'] || headers['Content-Type'] || ''
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)
  if (!boundaryMatch) {
    // 不是 multipart，当成原始二进制处理
    return bodyBuffer
  }
  const boundary = `--${boundaryMatch[1] || boundaryMatch[2]}`
  const bodyStr = bodyBuffer.toString('binary')

  // 简单解析：找文件名 + 二进制内容
  // 格式：
  //   --boundary
  //   Content-Disposition: form-data; name="file"; filename="xxx.png"
  //   Content-Type: image/png
  //
  //   <binary data>
  //   --boundary--
  const parts = bodyStr.split(boundary)
  for (const part of parts) {
    if (part.includes('filename=') && part.includes('\r\n\r\n')) {
      const dataStart = part.indexOf('\r\n\r\n') + 4
      const dataEnd = part.lastIndexOf('\r\n')
      if (dataStart > 4 && dataEnd > dataStart) {
        const binaryStr = part.substring(dataStart, dataEnd)
        return Buffer.from(binaryStr, 'binary')
      }
    }
  }
  return bodyBuffer
}
