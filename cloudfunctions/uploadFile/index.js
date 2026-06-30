// 云函数：文件上传（通过云函数中转，解决CORS问题）
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  // ★ 兼容 HTTP 触发器（event.body 可能是字符串）
  let data = event
  if (typeof event.body === 'string') {
    try {
      data = JSON.parse(event.body)
      console.log('[uploadFile] 解析 event.body 成功')
    } catch (e) {
      console.error('[uploadFile] 解析 event.body 失败:', e.message)
    }
  }

  const { action, cloudPath, fileContent, fileType, base64Data, folder, fileID, fileName, totalChunks, uploadId, chunkIndex, data: chunkData } = data

  try {
    // 根据 action 执行不同操作
    switch (action) {
      case 'uploadBase64':
        return await uploadBase64(base64Data, folder)
      case 'getTempFileURL':
        return await getTempFileURL(fileID)
      case 'startChunk':
        return await startChunkUpload({ fileName, totalChunks, folder })
      case 'uploadChunk':
        return await uploadSingleChunk({ uploadId, chunkIndex, data: chunkData })
      case 'finishChunk':
        return await finishChunkUpload({ uploadId })
      default:
        // 兼容旧版调用方式
        return await legacyUpload(cloudPath, fileContent)
    }

  } catch (err) {
    console.error('[uploadFile] 上传失败:', err)
    return {
      success: false,
      message: '上传失败: ' + (err.message || err.errMsg || '未知错误'),
      error: err.message
    }
  }
}

/**
 * 上传 Base64 图片
 * @param {string} base64Data - Base64 数据（带 data:image/xxx;base64, 前缀）
 * @param {string} folder - 存储文件夹
 */
async function uploadBase64(base64Data, folder = 'images') {
  if (!base64Data) {
    return { success: false, message: '缺少 base64Data 参数' }
  }

  // 解析 base64 数据
  const matches = base64Data.match(/^data:([A-Za-z-+/]+);base64,(.+)$/)
  
  let buffer
  let ext = 'png'

  if (matches && matches.length === 3) {
    // 标准 base64 格式
    const mimeType = matches[1]
    ext = mimeType.split('/')[1] || 'png'
    buffer = Buffer.from(matches[2], 'base64')
  } else {
    // 纯 base64 字符串
    buffer = Buffer.from(base64Data, 'base64')
  }

  // 生成文件名
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  const fileName = `${timestamp}_${random}.${ext}`
  const cloudPath = `${folder}/${fileName}`

  console.log('[uploadFile] 上传路径:', cloudPath, '大小:', buffer.length)

  // 上传到云存储
  const uploadResult = await cloud.uploadFile({
    cloudPath: cloudPath,
    fileContent: buffer
  })

  console.log('[uploadFile] 上传成功:', uploadResult.fileID)

  // ★ Bug 3 修复：获取临时 URL 用于前端预览
  let tempUrl = ''
  try {
    const tempUrlResult = await cloud.getTempFileURL({
      fileList: [uploadResult.fileID]
    })
    if (tempUrlResult.fileList && tempUrlResult.fileList[0]) {
      tempUrl = tempUrlResult.fileList[0].tempFileURL
      console.log('[uploadFile] 获取临时 URL 成功')
    }
  } catch (e) {
    console.warn('[uploadFile] 获取临时 URL 失败:', e.message)
  }

  return {
    success: true,
    fileID: uploadResult.fileID,
    tempUrl: tempUrl,  // ★ 返回临时 URL
    message: '上传成功'
  }
}

/**
 * 获取临时文件 URL
 * @param {string} fileID - 云存储文件 ID
 */
async function getTempFileURL(fileID) {
  if (!fileID) {
    return { success: false, message: '缺少 fileID 参数' }
  }

  const result = await cloud.getTempFileURL({
    fileList: [fileID]
  })

  if (result.fileList && result.fileList[0]) {
    return {
      success: true,
      url: result.fileList[0].tempFileURL
    }
  }

  return { success: false, message: '获取临时 URL 失败' }
}

/**
 * 兼容旧版上传方式
 * @param {string} cloudPath - 云存储路径
 * @param {string} fileContent - Base64 文件内容
 */
async function legacyUpload(cloudPath, fileContent) {
  if (!cloudPath) {
    return { success: false, message: '缺少 cloudPath 参数' }
  }

  if (!fileContent) {
    return { success: false, message: '缺少 fileContent 参数' }
  }

  const buffer = Buffer.from(fileContent, 'base64')

  const uploadResult = await cloud.uploadFile({
    cloudPath: cloudPath,
    fileContent: buffer
  })

  return {
    success: true,
    fileID: uploadResult.fileID,
    message: '上传成功'
  }
}

// ========== 分片上传（解决 HTTP 413 Payload Too Large）==========
// ★ 使用数据库存储分片数据（云函数无状态，不同实例不共享内存）

const CHUNK_SESSIONS_COLLECTION = 'chunk_sessions'
const CHUNK_DOCS_COLLECTION = 'chunk_data'

/**
 * 初始化分片上传
 */
async function startChunkUpload({ fileName, totalChunks, folder }) {
  const uploadId = 'chunk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8)
  
  await db.collection(CHUNK_SESSIONS_COLLECTION).add({
    data: {
      _id: uploadId,
      fileName,
      folder: folder || 'regulations',
      totalChunks,
      createdAt: Date.now()
    }
  })
  
  console.log('[uploadFile] DB分片会话创建:', uploadId, '总分片:', totalChunks)
  return { success: true, uploadId, totalChunks }
}

/**
 * 上传单个分片 - 存到数据库
 */
async function uploadSingleChunk({ uploadId, chunkIndex, data }) {
  if (!uploadId) {
    return { success: false, message: '缺少 uploadId' }
  }
  if (data === undefined || data === null) {
    return { success: false, message: '缺少分片数据' }
  }
  
  // 验证会话存在
  const sessionResult = await db.collection(CHUNK_SESSIONS_COLLECTION).doc(uploadId).get()
  if (!sessionResult.data || sessionResult.data.length === 0) {
    return { success: false, message: '无效的 uploadId 或会话已过期' }
  }
  
  const session = sessionResult.data
  const { totalChunks } = session
  
  // ★ 存储单个分片文档
  try {
    await db.collection(CHUNK_DOCS_COLLECTION).add({
      data: {
        uploadId,
        chunkIndex,
        data,  // base64 字符串
        createdAt: Date.now()
      }
    })
  } catch (dbErr) {
    // 如果已存在，更新
    if (dbErr.errCode === -502003) {
      // 唯一索引冲突 - 更新
      const existing = await db.collection(CHUNK_DOCS_COLLECTION)
        .where({ uploadId, chunkIndex })
        .get()
      if (existing.data && existing.data.length > 0) {
        await db.collection(CHUNK_DOCS_COLLECTION)
          .doc(existing.data[0]._id)
          .update({ data: { data } })
      } else {
        // 重试添加
        await db.collection(CHUNK_DOCS_COLLECTION).add({
          data: { uploadId, chunkIndex, data, createdAt: Date.now() }
        })
      }
    } else {
      throw dbErr
    }
  }
  
  // 查询已接收的分片数
  const countResult = await db.collection(CHUNK_DOCS_COLLECTION)
    .where({ uploadId })
    .count()
  
  const received = countResult.total
  
  console.log(`[uploadFile] DB分片 ${chunkIndex + 1}/${totalChunks} 已存储, 已接收: ${received}`)
  
  return { success: true, chunkIndex, received, total: totalChunks }
}

/**
 * 完成分片上传：从数据库读取所有分片 → 合并 → 上传到云存储 → 清理
 */
async function finishChunkUpload({ uploadId }) {
  if (!uploadId) {
    return { success: false, message: '缺少 uploadId' }
  }
  
  // 验证会话存在
  const sessionResult = await db.collection(CHUNK_SESSIONS_COLLECTION).doc(uploadId).get()
  if (!sessionResult.data || sessionResult.data.length === 0) {
    return { success: false, message: '无效的 uploadId' }
  }
  
  const session = sessionResult.data
  const { fileName, folder, totalChunks } = session
  
  // 从数据库读取所有分片
  const MAX_LIMIT = 100
  let allChunks = []
  for (let offset = 0; offset < totalChunks; offset += MAX_LIMIT) {
    const batch = await db.collection(CHUNK_DOCS_COLLECTION)
      .where({ uploadId })
      .orderBy('chunkIndex', 'asc')
      .skip(offset)
      .limit(MAX_LIMIT)
      .get()
    allChunks = allChunks.concat(batch.data)
  }
  
  if (allChunks.length !== totalChunks) {
    return { success: false, message: `分片不完整：已接收 ${allChunks.length}/${totalChunks}` }
  }
  
  // 按 chunkIndex 排序并验证完整性
  allChunks.sort((a, b) => a.chunkIndex - b.chunkIndex)
  for (let i = 0; i < totalChunks; i++) {
    if (allChunks[i].chunkIndex !== i) {
      return { success: false, message: `缺少第 ${i} 个分片` }
    }
  }
  
  // 合并所有分片
  const buffers = allChunks.map(c => Buffer.from(c.data, 'base64'))
  const fullBuffer = Buffer.concat(buffers)
  console.log('[uploadFile] DB分片合并完成, 总大小:', fullBuffer.length)
  
  // 确定文件扩展名
  const ext = fileName.split('.').pop().toLowerCase() || 'bin'
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  const cloudPath = `${folder}/${timestamp}_${random}.${ext}`
  
  // 上传到云存储
  const uploadResult = await cloud.uploadFile({
    cloudPath: cloudPath,
    fileContent: fullBuffer
  })
  
  console.log('[uploadFile] DB分片最终上传成功:', uploadResult.fileID)
  
  // 获取临时URL
  let tempUrl = ''
  try {
    const tempResult = await cloud.getTempFileURL({
      fileList: [uploadResult.fileID]
    })
    if (tempResult.fileList && tempResult.fileList[0]) {
      tempUrl = tempResult.fileList[0].tempFileURL
    }
  } catch (e) {
    console.warn('[uploadFile] 获取临时URL失败:', e.message)
  }
  
  // ★ 清理数据库中的分片和会话
  try {
    // 批量删除分片文档
    const chunkIds = allChunks.map(c => c._id)
    const deletePromises = chunkIds.map(id => 
      db.collection(CHUNK_DOCS_COLLECTION).doc(id).remove().catch(() => {})
    )
    await Promise.all(deletePromises)
    
    // 删除会话
    await db.collection(CHUNK_SESSIONS_COLLECTION).doc(uploadId).remove()
    console.log('[uploadFile] DB清理完成:', uploadId)
  } catch (cleanupErr) {
    console.warn('[uploadFile] DB清理失败:', cleanupErr.message)
  }
  
  return {
    success: true,
    fileID: uploadResult.fileID,
    tempUrl: tempUrl,
    message: '分片上传完成'
  }
}
