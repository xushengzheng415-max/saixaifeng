// 云开发 SDK 2.x 初始化和封装
// ★ 零 SDK 模式：浏览器端完全不依赖 @cloudbase/js-sdk 的网络功能
//   登录 → fetch() → webLoginApi HTTP API
//   数据库 → fetch() → webLoginApi dbQuery action
import { ElMessage } from 'element-plus'

// ★ webLoginApi HTTP 访问服务 URL（零 SDK 登录方案）
const WEB_LOGIN_API_URL = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi'

// ★ 云函数直接 HTTP 调用的基础 URL（不经过 webLoginApi 中转）
const CLOUD_FUNCTION_BASE_URL = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com'

// 登录相关云函数名 → webLoginApi action 映射
const LOGIN_FUNCTION_MAP = {
  sendSms: 'sendSms',
  verifySmsCode: 'verifySmsCode',
  emailLogin: null,
  verifyPassword: 'passwordLogin',
  wechatWebLogin: 'wechatWebLogin',
  checkLogin: 'checkLogin',
}

// 云函数名 → 处理方式的映射（非登录类云函数）
const CLOUD_FUNCTION_MAP = {
  // ★ uploadFile 改用 relay 模式：direct 端点有严格的 body 限制，改走 webLoginApi 中转
  uploadFile: 'relay',
  parseTournamentRegulations: 'direct', // 竞赛规程解析云函数
  bindPhone: 'direct', // 直接调用 bindPhone 云函数
  phoneLogin: 'direct', // 直接调用 phoneLogin 云函数
  // 抠图相关云函数 — 通过 webLoginApi 的 callFunction action 中转（服务端 cloud.callFunction 转发）
  // 注意：不能 'direct'，因为大多数云函数没有独立的 HTTP 触发端点
  baiduRemoveBg: 'relay', // 百度智能云人像分割
  removeImageBg: 'relay', // 通用抠图（rembg）
  removeLogoBg: 'relay', // 队徽/Logo 抠图
  // 赛事中心独立登录系统
  tournamentCenterLogin: 'relay', // 赛事中心手机号+密码登录
  setTournamentCenterPassword: 'relay', // 赛事中心首次设置密码
  manageTournamentCenterAccounts: 'relay', // 赛事中心账号管理（list/add/remove/toggle）
  // 赛事中心后台数据操作（共享赛小蜂数据库）
  getTeams: 'relay',
  getPlayers: 'relay',
  createTeam: 'relay',
  updateTeam: 'relay',
  deleteTeam: 'relay',
  createPlayer: 'relay',
  updatePlayer: 'relay',
  deletePlayer: 'relay',
  getBanners: 'relay',
  saveBanner: 'relay',
  getTournaments: 'relay',
}

/**
 * 通过 HTTP API 调用 webLoginApi（绕过浏览器端 CloudBase SDK）
 * @param {string} action - webLoginApi 的 action 参数
 * @param {object} data - 请求数据
 */
async function callFunctionHTTP(action, data = {}) {
  const payload = { ...data, action }
  console.log(`[callFunctionHTTP] → ${action}`)

  try {
    const response = await fetch(WEB_LOGIN_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const result = await response.json()
    return result
  } catch (err) {
    console.error('[callFunctionHTTP] ❌', err.message)
    throw err
  }
}

// ========== 登录认证 ==========

export async function logout() {
  localStorage.removeItem('isLoggedIn')
  localStorage.removeItem('userInfo')
  localStorage.removeItem('role')
  localStorage.removeItem('currentRole')
  localStorage.removeItem('userId')
  localStorage.removeItem('loginType')
  localStorage.removeItem('wx_login_state')
  localStorage.removeItem('dev_mode')
  localStorage.removeItem('needBindPhone')
  localStorage.removeItem('needSetPassword')
  localStorage.removeItem('needBindEmail')
  localStorage.removeItem('needSelectRole')
}

export async function checkAuth() {
  // 零 SDK 模式：信任 localStorage
  return localStorage.getItem('isLoggedIn') === 'true'
}

export function getCurrentUser() {
  // 零 SDK 模式：从 localStorage 获取用户信息
  const userInfo = localStorage.getItem('userInfo')
  if (!userInfo) return null
  try {
    const parsed = JSON.parse(userInfo)
    // ★ 兼容 uid 和 _id 两种字段名（不同登录页面存储键名不同）
    if (!parsed._id && parsed.uid) parsed._id = parsed.uid
    return parsed
  } catch { return null }
}

export function getCurrentOwner() {
  // 零 SDK 模式：返回手机号或用户 ID 作为 owner 标识
  return localStorage.getItem('phone') || localStorage.getItem('userId') || null
}

export async function ensureLogin() {
  // 零 SDK 模式：不需要登录，直接通过
  return true
}

export async function anonymousLogin() {
  return { success: true, uid: 'anonymous', type: 'anonymous' }
}

export async function refreshCurrentUser() {
  return getCurrentUser()
}

export function isDevMode() {
  return localStorage.getItem('dev_mode') === 'true'
}

// 兼容旧代码的空函数（零 SDK 模式下不再需要）
export function initCloud() { return {} }
export function getDb() { return null }
export function getAuth() { return null }

// ========== 数据库操作封装 ==========
// ★ 全部走 HTTP API → webLoginApi dbQuery（绕过浏览器端 SDK）

/**
 * 通过 HTTP API 执行数据库查询
 */
async function dbQuery(collection, operation, params = {}) {
  // ★ 附加当前用户 ID 用于后端鉴权
  const user = getCurrentUser()
  const userId = user ? user._id : null
  return callFunctionHTTP('dbQuery', { collection, operation, userId, ...params })
}

/**
 * 查询集合列表
 */
export async function queryList(collection, options = {}) {
  try {
    const result = await dbQuery(collection, 'list', {
      where: options.where,
      orderBy: options.orderBy,
      limit: options.limit || 100,
      skip: options.skip
    })
    if (!result.success) {
      console.error(`[queryList] ${collection} 失败:`, result.error)
      if (!options.silent) ElMessage.warning(`查询 ${collection} 失败: ${result.error || '未知错误'}`)
      return []
    }
    return result.data || []
  } catch (err) {
    console.error(`[queryList] ${collection} 异常:`, err)
    if (!options.silent) ElMessage.error(`查询 ${collection} 异常: ${err.message}`)
    return []
  }
}

/**
 * 查询单条记录
 */
export async function queryById(collection, id) {
  const result = await dbQuery(collection, 'get', { id })
  if (!result.success) throw new Error(result.error || '查询失败')
  return result.data
}

/**
 * 统计数量
 */
export async function countRecords(collection, where = {}) {
  const result = await dbQuery(collection, 'count', { where })
  if (!result.success) return 0
  return result.total || 0
}

/**
 * 新增记录
 */
export async function addRecord(collection, data) {
  const result = await dbQuery(collection, 'add', { data })
  if (!result.success) throw new Error(result.error || '新增失败')
  return result
}

/**
 * 更新记录
 */
export async function updateRecord(collection, id, data) {
  const result = await dbQuery(collection, 'update', { id, data })
  if (!result.success) throw new Error(result.error || '更新失败')
  return result
}

/**
 * 删除记录
 */
export async function deleteRecord(collection, id, options = {}) {
  const result = await dbQuery(collection, 'delete', { id })
  if (!result.success) throw new Error(result.error || '删除失败')
  return result
}

/**
 * 批量删除记录
 */
export async function batchDelete(collection, ids) {
  if (!ids || ids.length === 0) return { success: true, deleted: 0 }
  let deleted = 0
  for (const id of ids) {
    try {
      await deleteRecord(collection, id)
      deleted++
    } catch (e) {
      console.warn('[batchDelete] 删除失败:', id, e.message)
    }
  }
  return { success: true, deleted }
}

/**
 * 删除所有记录（慎用！）
 */
export async function deleteAllRecords(collection) {
  const records = await queryList(collection, { limit: 1000 })
  if (records.length === 0) return { success: true, deleted: 0, message: '集合为空' }
  const ids = records.map(r => r._id)
  return await batchDelete(collection, ids)
}

// ========== 文件上传 ==========

/**
 * 直接调用云函数 HTTP 端点（不经过 webLoginApi 中转）
 * 支持 FormData（文件上传）和 JSON 格式
 */
async function callFunctionDirect(functionName, data) {
  const url = `${CLOUD_FUNCTION_BASE_URL}/${functionName}`
  console.log(`[callFunctionDirect] → ${url}`, 'data keys:', Object.keys(data || {}))
  
  try {
    let body, headers = {}
    
    // 根据数据类型选择发送方式
    if (data instanceof FormData) {
      // FormData：让浏览器自动设置 Content-Type（带 boundary）
      body = data
    } else {
      // JSON 数据
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(data)
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[callFunctionDirect] HTTP ${response.status}:`, errorText)
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const result = await response.json()
    return result
  } catch (err) {
    console.error('[callFunctionDirect] ❌', err.message)
    throw err
  }
}

export async function uploadFile(cloudPath, filePath) {
  // TODO: 改为通过云函数代理上传
  throw new Error('uploadFile 需要云函数支持，请使用 uploadFileViaCloud')
}

export async function getFileUrl(fileId) {
  if (!fileId) return ''
  // 如果已经是 HTTP URL，直接返回
  if (fileId.startsWith('http://') || fileId.startsWith('https://')) {
    return fileId
  }
  try {
    const result = await callFunction('uploadFile', {
      action: 'getTempFileURL',
      fileID: fileId
    })
    if (result && result.success && result.url) {
      return result.url
    }
    // 如果获取失败，返回原始 fileId（可能已过期或无效）
    console.warn('[getFileUrl] 获取临时URL失败:', result)
    return fileId
  } catch (err) {
    console.error('[getFileUrl] 异常:', err)
    return fileId
  }
}

/**
 * 通过云函数中转上传文件
 * 使用 callFunction() 走 CLOUD_FUNCTION_MAP 路由，通过 webLoginApi.callFunction 中转
 */
export async function uploadFileViaCloud(cloudPath, file) {
  try {
    // 将文件转换为 Base64
    const base64Data = await fileToBase64(file)
    
    // 提取文件夹路径
    const folder = cloudPath.split('/')[0] || 'images'
    
    // 通过 callFunction() 中转调用 uploadFile 云函数
    // 这会走 CLOUD_FUNCTION_MAP 的路由，通过 webLoginApi.callFunction 中转
    const result = await callFunction('uploadFile', {
      action: 'uploadBase64',
      base64Data: base64Data,
      folder: folder
    })
    
    if (result && result.success) {
      return { 
        success: true, 
        fileId: result.fileID || result.fileId, 
        tempUrl: result.tempUrl || '' 
      }
    }
    throw new Error(result?.message || '上传失败')
  } catch (err) {
    console.error('[uploadFileViaCloud] ❌', err.message)
    throw err
  }
}

/**
 * 将 File 对象转换为 Base64 字符串
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      resolve(e.target.result)
    }
    reader.onerror = (err) => {
      reject(err)
    }
    reader.readAsDataURL(file)
  })
}

/**
 * 分片上传大文件（解决 HTTP 413 Payload Too Large）
 * 将大文件分割成多个小块逐个上传，在云端合并后存入云存储
 * 
 * @param {string} cloudPath - 云存储路径（如 'regulations/file.pdf'）
 * @param {File} file - 文件对象
 * @param {object} options - 配置选项
 * @param {number} options.chunkSize - 每片大小（字节），默认 500KB
 * @param {Function} options.onProgress - 进度回调 (received, total)
 * @returns {Promise<{success:boolean, fileId:string, tempUrl:string}>}
 */

/**
 * Upload small compressed images directly to cloud storage through webLoginApi.
 * Database records should store only the returned URL/fileId, not image base64.
 */
export async function uploadImageViaWebApi(folder, file) {
  const base64Data = await fileToBase64(file)
  const result = await callFunctionHTTP('uploadImage', { base64Data, folder })
  if (result && result.success) {
    return {
      success: true,
      fileId: result.fileID || result.fileId,
      tempUrl: result.tempUrl || ''
    }
  }
  throw new Error(result?.message || result?.error || 'Image upload failed')
}
export async function uploadLargeFileViaCloud(cloudPath, file, options = {}) {
  const CHUNK_SIZE = options.chunkSize || (100 * 1024) // ★ 默认 100KB/片（Base64后~133KB，远低于网关限制）
  const folder = cloudPath.split('/')[0] || 'regulations'
  
  // 读取文件为 ArrayBuffer
  const arrayBuffer = await file.arrayBuffer()
  const totalBytes = arrayBuffer.byteLength
  const totalChunks = Math.ceil(totalBytes / CHUNK_SIZE)
  
  console.log(`[分片上传] 文件: ${file.name}, 大小: ${(totalBytes / 1024 / 1024).toFixed(2)}MB, 分成 ${totalChunks} 片`)
  
  // 步骤 1：初始化分片上传
  const initResult = await callFunction('uploadFile', {
    action: 'startChunk',
    fileName: file.name,
    totalChunks: totalChunks,
    folder: folder
  })
  
  if (!initResult.success) {
    throw new Error(initResult.message || '初始化分片上传失败')
  }
  
  const uploadId = initResult.uploadId
  
  try {
    // 步骤 2：逐个上传分片
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE
      const end = Math.min(start + CHUNK_SIZE, totalBytes)
      const chunkBuffer = arrayBuffer.slice(start, end)
      
      // 将 chunk 转为 base64
      const chunkBase64 = _arrayBufferToBase64(chunkBuffer)
      
      const chunkResult = await callFunction('uploadFile', {
        action: 'uploadChunk',
        uploadId: uploadId,
        chunkIndex: i,
        data: chunkBase64
      })
      
      if (!chunkResult.success) {
        throw new Error(`分片 ${i + 1} 上传失败: ${chunkResult.message}`)
      }
      
      // 报告进度
      if (options.onProgress) {
        options.onProgress(i + 1, totalChunks)
      }
    }
    
    // 步骤 3：完成上传（合并 + 上传到云存储）
    const finishResult = await callFunction('uploadFile', {
      action: 'finishChunk',
      uploadId: uploadId
    })
    
    if (!finishResult.success) {
      throw new Error(finishResult.message || '合并上传失败')
    }
    
    return {
      success: true,
      fileId: finishResult.fileID,
      tempUrl: finishResult.tempUrl || ''
    }
    
  } catch (err) {
    console.error('[分片上传] 失败:', err.message)
    throw err
  }
}

/**
 * ArrayBuffer 转 Base64（内部工具函数）
 * @param {ArrayBuffer|Buffer} buffer 
 * @returns {string}
 */
export function _arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

// ========== 云函数调用 ==========

/**
 * 调用云函数
 * ★ 登录相关函数自动走 HTTP API（webLoginApi）
 * 其他函数也走 HTTP API（通过 dbQuery 或直接调用）
 *
 * @param {string} name 云函数名称
 * @param {object} data 请求数据
 */
export async function callFunction(name, data = {}, timeout = 60000) {
  // ★ 路由判断：登录相关函数走 HTTP API
  if (name in LOGIN_FUNCTION_MAP) {
    const mappedAction = LOGIN_FUNCTION_MAP[name]

    if (name === 'emailLogin' && data && data.action) {
      const emailActionMap = {
        sendCode: 'emailSendCode',
        verifyCode: 'emailVerifyCode',
        checkExists: null,
        setRole: 'emailSetRole',
        setPassword: 'emailSetPassword',
        forgotPassword: null,
      }
      const actualAction = emailActionMap[data.action]
      if (actualAction) return callFunctionHTTP(actualAction, data)
    } else if (mappedAction) {
      if ((name === 'verifyPassword') && data && data.account) {
        return callFunctionHTTP(mappedAction, { ...data, phoneNumber: data.account })
      }
      return callFunctionHTTP(mappedAction, data)
    }
  }

// ★ 其他云函数调用
if (name in CLOUD_FUNCTION_MAP) {
  // 如果标记为 'direct'，直接调用云函数 HTTP 端点（不走 webLoginApi 中转）
  if (CLOUD_FUNCTION_MAP[name] === 'direct') {
    console.log(`[callFunction] ${name} → 直接调用（不走 webLoginApi）`)
    return callFunctionDirect(name, data)
  }
  
  // 否则通过 webLoginApi.callFunction 中转
  console.log(`[callFunction] ${name} → 通过 webLoginApi.callFunction 中转`)
  return callFunctionHTTP('callFunction', {
    functionName: name,
    functionParams: data
  })
}

  // 其他云函数调用（如 webBatchUpdate、deleteRecord 等）→ 也走 HTTP API
  // 将其转换为 dbQuery 操作
  if (name === 'webBatchUpdate' || name === 'deleteRecord') {
    const action = data.action || 'unknown'
    const opMap = { add: 'add', update: 'update', delete: 'delete' }
    if (opMap[action]) {
      return callFunctionHTTP('dbQuery', {
        collection: data.collection,
        operation: opMap[action],
        id: data.id,
        data: data.data
      })
    }
  }

  // 未匹配的函数 → 尝试通过 webLoginApi.callFunction 中转
  console.warn(`[callFunction] ${name} 未在路由表中，尝试通过 webLoginApi.callFunction 中转...`)
  try {
    return await callFunctionHTTP('callFunction', {
      functionName: name,
      functionParams: data
    })
  } catch (err) {
    console.error(`[callFunction] ${name} 调用失败:`, err.message)
    throw new Error(`云函数调用失败: ${name} - ${err.message}`)
  }
}
