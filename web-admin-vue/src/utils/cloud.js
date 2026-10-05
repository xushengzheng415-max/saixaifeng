// 云开发 SDK 2.x 初始化和封装
// ★ 零 SDK 模式：浏览器端完全不依赖 @cloudbase/js-sdk 的网络功能
//   登录 → fetch() → webLoginApi HTTP API
//   数据库 → fetch() → webLoginApi dbQuery action
import { ElMessage } from 'element-plus'
import { clearPlatformSession, getPlatformAuthToken, getPlatformSession, isPlatformContext, setPlatformAuthToken } from './platformSession'
import { sidebarRightForRoute } from './tournamentStaffRights'
import { isPayloadTooLargeError, resolveChunkUploadTarget } from './chunkUploadPath'

// ★ webLoginApi HTTP 访问服务 URL（零 SDK 登录方案）
const WEB_LOGIN_API_URL = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi'

// ★ 云函数直接 HTTP 调用的基础 URL（不经过 webLoginApi 中转）
const CLOUD_FUNCTION_BASE_URL = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com'
const AUTH_TOKEN_KEY = 'authToken'
const ASSISTANCE_CONTEXT_KEY = 'assistanceContext'
let visualQaModulePromise = null

function loadVisualQaModule() {
  if (!visualQaModulePromise) visualQaModulePromise = window.__sxfVisualQaModulePromise || import('./visualQaFixtures')
  return visualQaModulePromise
}

// 登录相关云函数名 → webLoginApi action 映射
const LOGIN_FUNCTION_MAP = {
  sendSms: 'sendSms',
  verifySmsCode: 'verifySmsCode',
  emailLogin: null,
  verifyPassword: 'passwordLogin',
  wechatWebLogin: 'wechatWebLogin',
  sendWechatLoginSms: 'sendWechatLoginSms',
  completeWechatPhoneLogin: 'completeWechatPhoneLogin',
  getCurrentAccountProfile: 'getCurrentAccountProfile',
  sendCurrentUserPhoneBindSms: 'sendCurrentUserPhoneBindSms',
  bindCurrentUserPhone: 'bindCurrentUserPhone',
  deleteCurrentAccount: 'deleteCurrentAccount',
  checkLogin: 'checkLogin',
}

// 云函数名 → 处理方式的映射（非登录类云函数）
const CLOUD_FUNCTION_MAP = {
  // ★ uploadFile 改用 relay 模式：direct 端点有严格的 body 限制，改走 webLoginApi 中转
  uploadFile: 'relay',
  parseTournamentRegulations: 'relay', // 竞赛规程解析统一经 webLoginApi
  bindPhone: 'relay', // 绑定手机号统一经 webLoginApi
  phoneLogin: 'relay', // 旧手机号登录入口统一经 webLoginApi 白名单校验
  // 抠图相关云函数 — 通过 webLoginApi 的 callFunction action 中转（服务端 cloud.callFunction 转发）
  // 注意：不能 'direct'，因为大多数云函数没有独立的 HTTP 触发端点
  baiduRemoveBg: 'relay', // 百度智能云人像分割
  removeImageBg: 'relay', // 通用抠图（rembg）
  removeLogoBg: 'relay', // 队徽/Logo 抠图
  generateAIImage: 'relay', // AI 生图必须经 webLoginApi 会话中转
  // 赛事中心后台内容管理（复用主办方登录，仅平台负责人可用）
  manageTournamentCenterContent: 'relay',
  platformOwner: 'relay',
  // 赛事中心公开数据与主办方业务操作
  getTeams: 'relay',
  getPlayers: 'relay',
  createTeam: 'relay',
  updateTeam: 'relay',
  deleteTeam: 'relay',
  createPlayer: 'relay',
  updatePlayer: 'relay',
  deletePlayer: 'relay',
  getBanners: 'relay',
  getTournaments: 'relay',
  getTournamentDetail: 'relay', // 公开赛事详情只读查询
  getTournamentMatches: 'relay', // 公开赛事赛况只读查询
  updateMatch: 'relay', // 比赛事件与中场换人通过会话代理保存
  setHeadReferee: 'relay', // 设置赛事裁判长必须经过机构会话中转
  getRegulations: 'relay', // PC 规程文件读取需登录后中转
  reviewRosterChange: 'relay', // 名单变更审核必须经过当前机构门禁
  onboardingWorkspace: 'relay',
  organizerClaimInvite: 'relay',
  resultCenter: 'relay',
  newsCenter: 'relay',
  tournamentStaffAccess: 'relay',
  dataCenter: 'relay',
}

/**
 * 通过 HTTP API 调用 webLoginApi（绕过浏览器端 CloudBase SDK）
 * @param {string} action - webLoginApi 的 action 参数
 * @param {object} data - 请求数据
 */
async function callFunctionHTTP(action, data = {}, timeout = 60000) {
  // 视觉验收样例仅在 Vite 开发模式按需加载；生产构建不会打包样例数据。
  if (import.meta.env.DEV) {
    const { handleVisualQaHttp } = await loadVisualQaModule()
    const qa = handleVisualQaHttp(action, data)
    if (qa.handled) return qa.result
  }
  const platformRequest = isPlatformContext()
  const assistance = platformRequest ? null : getAssistanceContext()
  const bypassAssistance = action === 'callFunction' &&
    ['platformOwner', 'manageTournamentCenterContent', 'generateMiniProgramCode'].includes(data.functionName)
  const staff = !platformRequest && sessionStorage.getItem('sxfTournamentStaff') === '1'
  const staffPath = staff ? window.location.hash.replace(/^#/, '').split('?')[0] : ''
  const payload = {
    ...data,
    action,
    authToken: platformRequest ? getPlatformAuthToken() : (localStorage.getItem(AUTH_TOKEN_KEY) || ''),
    assistanceGrantId: !bypassAssistance && assistance ? assistance.requestId : '',
    ...(staff ? { staffTournamentId: sessionStorage.getItem('sxfStaffTournamentId') || '', staffModule: sidebarRightForRoute(staffPath) } : {})
  }
  console.log(`[callFunctionHTTP] → ${action}`)

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timeoutId = controller && timeout > 0
    ? setTimeout(() => controller.abort(), timeout)
    : null

  try {
    const response = await fetch(WEB_LOGIN_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      ...(controller ? { signal: controller.signal } : {})
    })

    const responseText = await response.text()
    let result = null
    try { result = responseText ? JSON.parse(responseText) : null } catch { result = null }
    if (result && typeof result.body === 'string') {
      try { result = JSON.parse(result.body) } catch { /* 保留原响应，由调用方显示错误 */ }
    }
    if (!response.ok) {
      throw new Error(result?.error || result?.message || `HTTP ${response.status}: ${response.statusText}`)
    }
    if (result && result.authToken) {
      if (platformRequest) setPlatformAuthToken(result.authToken)
      else localStorage.setItem(AUTH_TOKEN_KEY, result.authToken)
    }
    if (result && result.code === 'ASSISTANCE_EXPIRED') {
      clearAssistanceContext()
    }
    if (result && result.code === 'AUTH_REQUIRED') {
      const platformSessionExpired = platformRequest
      await logout()
      const localPreview = import.meta.env.DEV || ['127.0.0.1', 'localhost'].includes(window.location.hostname)
      window.location.href = platformSessionExpired
        ? `${window.location.origin}${import.meta.env.BASE_URL}#/platform-login`
        : localPreview
        ? `${window.location.origin}${import.meta.env.BASE_URL}#/login`
        : 'https://www.sxffootball.cn/'
      throw new Error(result.error || (platformSessionExpired ? '平台登录已失效，请重新登录' : '登录会话已失效，请重新微信扫码登录'))
    }
    return result
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('请求处理时间较长，请稍后重试')
    }
    console.error('[callFunctionHTTP] ❌', err.message)
    throw err
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

export async function reviewRefereeRecord(data = {}) {
  return callFunctionHTTP('reviewRefereeRecord', data)
}

export function playerCardTemplateRequest(action, data = {}) {
  return callFunctionHTTP(action, data)
}

// 归档后比分异常纠错：服务端会校验正式归档状态并写入前后值审计。
export async function correctArchivedScore(data = {}) {
  return callFunction('resultCenter', { action: 'correctArchivedScore', ...data })
}

export async function listIdentityReviewQueue(data = {}) {
  return callFunctionHTTP('listIdentityReviewQueue', data)
}

export async function listTournamentInsuranceQueue(data = {}) {
  return callFunctionHTTP('listTournamentInsuranceQueue', data)
}

export async function reviewIdentityVerification(data = {}) {
  return callFunctionHTTP('reviewIdentityVerification', data)
}

// 赛事正式名单异常看板：由 webLoginApi 在服务端收敛赛事、球队和名单快照范围。
export async function rosterExceptionBoard(data = {}) {
  return callFunctionHTTP('rosterExceptionBoard', data)
}

// ========== 登录认证 ==========

export async function logout() {
  if (isPlatformContext()) {
    clearPlatformSession()
    return
  }
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
  localStorage.removeItem('wechatTemp')
  localStorage.removeItem('phone')
  localStorage.removeItem('phoneNumber')
  localStorage.removeItem('openid')
  localStorage.removeItem('unionid')
  localStorage.removeItem('authSessionVersion')
  localStorage.removeItem(AUTH_TOKEN_KEY)
  localStorage.removeItem(ASSISTANCE_CONTEXT_KEY)
  // 机构缓存属于账号会话，退出后必须清理，避免下一个账号误显示或误用旧机构。
  localStorage.removeItem('organizationInfo')
  localStorage.removeItem('currentOrganization')
  localStorage.removeItem('currentOrg')
  sessionStorage.removeItem('sxfServiceBoundCheck')
  sessionStorage.removeItem('sxfAfterServiceBinding')
  sessionStorage.removeItem('sxfStaffInvitationPrompted')
}

export async function checkAuth() {
  if (isPlatformContext()) return Boolean(getPlatformAuthToken())
  return localStorage.getItem('isLoggedIn') === 'true' && Boolean(localStorage.getItem(AUTH_TOKEN_KEY))
}

export function getCurrentUser() {
  if (isPlatformContext()) return getPlatformSession()?.user || null
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
  if (isPlatformContext()) return getPlatformSession()?.userId || null
  const assistance = getAssistanceContext()
  if (assistance && assistance.targetOwnerKey) return assistance.targetOwnerKey
  return localStorage.getItem('phone') || localStorage.getItem('userId') || null
}

export function getAssistanceContext() {
  try {
    const raw = localStorage.getItem(ASSISTANCE_CONTEXT_KEY)
    if (!raw) return null
    const context = JSON.parse(raw)
    if (!context.requestId || !context.expiresAt || new Date(context.expiresAt).getTime() <= Date.now()) {
      localStorage.removeItem(ASSISTANCE_CONTEXT_KEY)
      return null
    }
    return context
  } catch {
    localStorage.removeItem(ASSISTANCE_CONTEXT_KEY)
    return null
  }
}

export function setAssistanceContext(context) {
  if (!context || !context.requestId || !context.expiresAt) {
    throw new Error('协助上下文不完整')
  }
  localStorage.setItem(ASSISTANCE_CONTEXT_KEY, JSON.stringify({
    requestId: context.requestId,
    targetUserId: context.targetUserId || '',
    targetName: context.targetName || '被协助用户',
    targetOwnerKey: context.targetOwnerKey || context.targetUserId || '',
    expiresAt: context.expiresAt
  }))
}

export function clearAssistanceContext() {
  localStorage.removeItem(ASSISTANCE_CONTEXT_KEY)
}

export async function ensureLogin() {
  return checkAuth()
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
  return callFunctionHTTP('dbQuery', { collection, operation, ...params })
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
      if (options.throwOnError) throw new Error(result.error || '数据加载失败')
      console.error(`[queryList] ${collection} 失败:`, result.error)
      if (!options.silent) ElMessage.warning(`查询 ${collection} 失败: ${result.error || '未知错误'}`)
      return []
    }
    return result.data || []
  } catch (err) {
    if (options.throwOnError) throw err
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
export async function confirmDivisionRules(id, data = {}) {
  return callFunctionHTTP('dbQuery', {
    collection: 'divisions',
    operation: 'confirmDivisionRules',
    id,
    data
  })
}

export async function reviseDivisionRules(id) {
  return callFunctionHTTP('dbQuery', {
    collection: 'divisions',
    operation: 'reviseDivisionRules',
    id
  })
}

export async function deleteDivision(id) {
  return callFunctionHTTP('dbQuery', {
    collection: 'divisions',
    operation: 'deleteDivision',
    id
  })
}

export async function renameDivision(id, name) {
  return callFunctionHTTP('dbQuery', {
    collection: 'divisions',
    operation: 'renameDivision',
    id,
    data: { name }
  })
}

export async function assignTournamentTeamDivision(id, divisionId) {
  return callFunctionHTTP('dbQuery', {
    collection: 'tournament_teams',
    operation: 'assignTournamentTeamDivision',
    id,
    data: { divisionId }
  })
}

export async function upgradeDivisionToProfessional(id, data = {}) {
  return callFunctionHTTP('dbQuery', {
    collection: 'divisions',
    operation: 'upgradeDivisionToProfessional',
    id,
    data
  })
}

export async function confirmCompetitionPlan(tournamentId, data = {}) {
  return callFunctionHTTP('dbQuery', {
    collection: 'tournaments',
    operation: 'confirmCompetitionPlan',
    id: tournamentId,
    data
  })
}

export async function deleteTournamentWorkspace(tournamentId, confirmText) {
  return callFunctionHTTP('dbQuery', {
    collection: 'tournaments',
    operation: 'deleteTournamentWorkspace',
    id: tournamentId,
    data: { confirmText }
  })
}

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
export async function uploadImageViaWebApi(folder, file, tournamentId = '') {
  const base64Data = await fileToBase64(file)
  const result = await callFunctionHTTP('uploadImage', { base64Data, folder, tournamentId })
  if (result && result.success) {
    return {
      success: true,
      fileId: result.fileID || result.fileId,
      tempUrl: result.tempUrl || ''
    }
  }
  throw new Error(result?.message || result?.error || '图片上传失败')
}
export async function uploadLargeFileViaCloud(cloudPath, file, options = {}) {
  const initialChunkSize = Number(options.chunkSize) > 0 ? Number(options.chunkSize) : (48 * 1024)
  const fallbackChunkSize = Number(options.fallbackChunkSize) > 0 ? Number(options.fallbackChunkSize) : 0
  const { folder, fileName } = resolveChunkUploadTarget(cloudPath, file?.name)
  const arrayBuffer = await file.arrayBuffer()
  const totalBytes = arrayBuffer.byteLength

  async function abortUpload(uploadId) {
    if (!uploadId) return
    try {
      await callFunction('uploadFile', { action: 'abortChunk', uploadId }, 15000)
    } catch (cleanupError) {
      console.warn('[分片上传] 临时数据清理失败:', cleanupError.message)
    }
  }

  async function uploadWithChunkSize(chunkSize) {
    const totalChunks = Math.ceil(totalBytes / chunkSize)
    console.log(`[分片上传] 文件: ${file.name}, 大小: ${(totalBytes / 1024 / 1024).toFixed(2)}MB, 分片: ${chunkSize / 1024}KB × ${totalChunks}`)
    const initResult = await callFunction('uploadFile', {
      action: 'startChunk',
      fileName,
      totalChunks,
      folder
    })
    if (!initResult.success) throw new Error(initResult.message || '初始化分片上传失败')

    const uploadId = initResult.uploadId
    try {
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize
        const end = Math.min(start + chunkSize, totalBytes)
        const chunkBase64 = _arrayBufferToBase64(arrayBuffer.slice(start, end))
        const chunkResult = await callFunction('uploadFile', {
          action: 'uploadChunk',
          uploadId,
          chunkIndex: i,
          data: chunkBase64
        })
        if (!chunkResult.success) throw new Error(`分片 ${i + 1} 上传失败: ${chunkResult.message}`)
        if (options.onProgress) options.onProgress(i + 1, totalChunks, { chunkSize })
      }

      const finishResult = await callFunction('uploadFile', { action: 'finishChunk', uploadId })
      if (!finishResult.success) throw new Error(finishResult.message || '合并上传失败')
      return { success: true, fileId: finishResult.fileID, tempUrl: finishResult.tempUrl || '' }
    } catch (error) {
      await abortUpload(uploadId)
      throw error
    }
  }

  try {
    return await uploadWithChunkSize(initialChunkSize)
  } catch (error) {
    const canFallback = fallbackChunkSize > 0 && fallbackChunkSize < initialChunkSize && isPayloadTooLargeError(error)
    if (!canFallback) {
      console.error('[分片上传] 失败:', error.message)
      throw error
    }
    console.warn(`[分片上传] 请求体超限，自动从 ${initialChunkSize / 1024}KB 降为 ${fallbackChunkSize / 1024}KB`)
    if (options.onRetry) options.onRetry(fallbackChunkSize, error)
    return uploadWithChunkSize(fallbackChunkSize)
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
  }, timeout)
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
    }, timeout)
  } catch (err) {
    console.error(`[callFunction] ${name} 调用失败:`, err.message)
    throw new Error(`云函数调用失败: ${name} - ${err.message}`)
  }
}

export function updateDivisionSubstitutionRules(divisionId, data = {}) {
  return callFunctionHTTP('updateDivisionSubstitutionRules', { divisionId, ...data })
}

export async function getPublicTournamentCenter() {
  return callFunctionHTTP('publicTournamentCenter', {})
}
