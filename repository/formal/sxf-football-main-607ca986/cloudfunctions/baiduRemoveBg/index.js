/**
 * 百度智能云人像分割 - 云函数
 * 解决前端直接调用百度 API 的 CORS 问题
 * 
 * 重要：此云函数仅用于人像分割（球员头像），不适用于 Logo/队徽
 * Logo/队徽请使用前端本地"抠白"算法 + remove.bg API
 * 
 * Token 管理策略：
 * 1. 内存缓存 + 云数据库持久化双保险
 * 2. 提前 1 小时自动刷新
 * 3. 支持手动强制刷新
 */

const axios = require('axios')
const cloud = require('wx-server-sdk')

// 初始化云开发
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const BAIDU_API_KEY = process.env.BAIDU_API_KEY || ''
const BAIDU_SECRET_KEY = process.env.BAIDU_SECRET_KEY || ''
const TOKEN_URL = 'https://aip.baidubce.com/oauth/2.0/token'
const SEGMENT_URL = 'https://aip.baidubce.com/rest/2.0/image-classify/v1/body_seg'
const TOKEN_COLLECTION = 'system_config'  // 存储 token 的集合
const TOKEN_DOC_ID = 'baidu_access_token' // 文档 ID

// 内存缓存（热启动时有效）
let memoryToken = null
let memoryExpireTime = 0

/**
 * 从数据库获取 Token
 */
async function getTokenFromDB() {
  try {
    const res = await db.collection(TOKEN_COLLECTION).doc(TOKEN_DOC_ID).get()
    if (res.data) {
      return {
        token: res.data.token,
        expireTime: res.data.expireTime
      }
    }
  } catch (err) {
    console.log('[BaiduCloud] 数据库中没有缓存的 token')
  }
  return null
}

/**
 * 保存 Token 到数据库
 */
async function saveTokenToDB(token, expireTime) {
  try {
    await db.collection(TOKEN_COLLECTION).doc(TOKEN_DOC_ID).set({
      data: {
        token: token,
        expireTime: expireTime,
        updateTime: Date.now()
      }
    })
    console.log('[BaiduCloud] Token 已保存到数据库')
  } catch (err) {
    console.error('[BaiduCloud] 保存 Token 到数据库失败:', err)
  }
}

/**
 * 获取百度 Access Token
 * @param {boolean} forceRefresh - 是否强制刷新
 */
async function getAccessToken(forceRefresh = false) {
  const now = Date.now()
  
  // 1. 检查内存缓存（热启动快速返回）
  if (!forceRefresh && memoryToken && now < memoryExpireTime) {
    console.log('[BaiduCloud] 使用内存缓存的 Token')
    return memoryToken
  }
  
  // 2. 检查数据库缓存（冷启动恢复）
  if (!forceRefresh) {
    const dbToken = await getTokenFromDB()
    if (dbToken && now < dbToken.expireTime) {
      console.log('[BaiduCloud] 使用数据库缓存的 Token')
      // 同步到内存
      memoryToken = dbToken.token
      memoryExpireTime = dbToken.expireTime
      return dbToken.token
    }
  }
  
  // 3. 重新获取新 Token
  console.log('[BaiduCloud] 重新获取 Access Token...')
  try {
    const response = await axios.post(TOKEN_URL, null, {
      params: {
        grant_type: 'client_credentials',
        client_id: BAIDU_API_KEY,
        client_secret: BAIDU_SECRET_KEY
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })

    const data = response.data

    if (data.access_token) {
      memoryToken = data.access_token
      // 提前 1 小时过期（3600 秒），避免边界时间误差
      memoryExpireTime = now + (data.expires_in - 3600) * 1000
      
      // 同时保存到数据库
      await saveTokenToDB(memoryToken, memoryExpireTime)
      
      console.log('[BaiduCloud] Access Token 获取成功，有效期:', data.expires_in, '秒')
      return memoryToken
    } else {
      throw new Error(data.error_description || '获取 Token 失败')
    }
  } catch (err) {
    console.error('[BaiduCloud] 获取 Token 失败:', err.message)
    throw err
  }
}

/**
 * 调用百度人像分割 API（仅用于人像/球员头像）
 * 返回透明背景 PNG 的 Base64
 */
async function removeBackground(imageBase64) {
  try {
    console.log('[BaiduCloud] 开始人像分割')

    // 1. 获取 Access Token
    const accessToken = await getAccessToken()

    // 2. 调用百度 API
    // 注意：百度 API 要求 image 参数进行 URL Encode
    // type=foreground 直接返回透明背景 PNG，无需二次处理
    const encodedImage = encodeURIComponent(imageBase64)
    const postData = `image=${encodedImage}&type=foreground`

    console.log('[BaiduCloud] 请求数据长度:', postData.length)

    const response = await axios.post(`${SEGMENT_URL}?access_token=${accessToken}`, postData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      maxBodyLength: 4 * 1024 * 1024,  // 百度限制：base64+urlencode 后不超过 4MB
      maxContentLength: 4 * 1024 * 1024,  // 4MB
      timeout: 30000  // 30秒超时
    })

    const data = response.data

    // 明确透传百度错误码
    if (data.error_code) {
      const errMsg = `[百度API错误] code=${data.error_code}, msg=${data.error_msg}, request_id=${data.request_id || 'N/A'}`
      console.error('[BaiduCloud]', errMsg)
      throw new Error(errMsg)
    }

    // 3. 检查是否检测到人像
    if (data.person_num === 0) {
      console.warn('[BaiduCloud] 未检测到人像')
      throw new Error('未检测到人像，请确保上传的是人物照片')
    }

    console.log('[BaiduCloud] 检测到', data.person_num, '个人像')

    // 4. 处理返回结果
    // foreground：透明背景 PNG，直接可用（优先）
    if (data.foreground) {
      console.log('[BaiduCloud] 人像分割成功（foreground）')
      return {
        success: true,
        data: data.foreground,
        personNum: data.person_num,
        method: 'baidu'
      }
    }

    // labelmap：二值掩码图，需要前端二次处理（兜底）
    if (data.labelmap) {
      console.log('[BaiduCloud] 使用 labelmap 结果，需要二次处理')
      return {
        success: true,
        data: data.labelmap,
        type: 'labelmap',
        personNum: data.person_num,
        method: 'baidu'
      }
    }

    // scoremap：灰度图（兜底）
    if (data.scoremap) {
      console.log('[BaiduCloud] 使用 scoremap 结果')
      return {
        success: true,
        data: data.scoremap,
        type: 'scoremap',
        personNum: data.person_num,
        method: 'baidu'
      }
    }

    throw new Error('百度 API 未返回有效图片数据')

  } catch (err) {
    console.error('[BaiduCloud] 人像分割失败:', err.message)
    return {
      success: false,
      message: err.message || '百度抠图失败'
    }
  }
}

// 云函数入口
exports.main = async (event, context) => {
  const { action, imageBase64, forceRefresh } = event

  console.log('[BaiduCloud] 收到请求, action:', action)

  try {
    if (action === 'removeBackground') {
      if (!imageBase64) {
        return {
          success: false,
          message: '缺少 imageBase64 参数'
        }
      }

      const result = await removeBackground(imageBase64)
      return result
    }

    if (action === 'test') {
      // 测试接口
      const token = await getAccessToken(forceRefresh)
      return {
        success: true,
        message: '百度 API 连接正常',
        tokenPreview: token.substring(0, 20) + '...',
        expireTime: new Date(memoryExpireTime).toLocaleString()
      }
    }
    
    if (action === 'refreshToken') {
      // 手动刷新 token
      const token = await getAccessToken(true)
      return {
        success: true,
        message: 'Token 已强制刷新',
        tokenPreview: token.substring(0, 20) + '...',
        expireTime: new Date(memoryExpireTime).toLocaleString()
      }
    }

    return {
      success: false,
      message: '未知的 action: ' + action
    }

  } catch (err) {
    console.error('[BaiduCloud] 云函数执行失败:', err)
    return {
      success: false,
      message: err.message || '云函数执行失败'
    }
  }
}
