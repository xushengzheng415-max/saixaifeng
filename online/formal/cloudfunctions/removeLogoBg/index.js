/**
 * 队徽/Logo 抠图 - 使用百度智能云
 * 针对纯白/纯色背景的 Logo 进行抠图
 */

const axios = require('axios')
const cloud = require('wx-server-sdk')

// 初始化云开发
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const BAIDU_API_KEY = process.env.BAIDU_API_KEY || '';
const BAIDU_SECRET_KEY = process.env.BAIDU_SECRET_KEY || '';
const TOKEN_URL = 'https://aip.baidubce.com/oauth/2.0/token'
// 使用通用物体分割 API，更适合 Logo/图标
const SEGMENT_URL = 'https://aip.baidubce.com/rest/2.0/image-classify/v1/object_segment'
const TOKEN_COLLECTION = 'system_config'
const TOKEN_DOC_ID = 'baidu_access_token'

// 内存缓存
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
    console.log('[LogoRemoveBg] 数据库中没有缓存的 token')
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
    console.log('[LogoRemoveBg] Token 已保存到数据库')
  } catch (err) {
    console.error('[LogoRemoveBg] 保存 Token 到数据库失败:', err)
  }
}

/**
 * 获取百度 Access Token
 */
async function getAccessToken(forceRefresh = false) {
  const now = Date.now()
  
  // 1. 检查内存缓存
  if (!forceRefresh && memoryToken && now < memoryExpireTime) {
    console.log('[LogoRemoveBg] 使用内存缓存的 Token')
    return memoryToken
  }
  
  // 2. 检查数据库缓存
  if (!forceRefresh) {
    const dbToken = await getTokenFromDB()
    if (dbToken && now < dbToken.expireTime) {
      console.log('[LogoRemoveBg] 使用数据库缓存的 Token')
      memoryToken = dbToken.token
      memoryExpireTime = dbToken.expireTime
      return dbToken.token
    }
  }
  
  // 3. 重新获取
  console.log('[LogoRemoveBg] 重新获取 Access Token...')
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
      memoryExpireTime = now + (data.expires_in - 3600) * 1000
      await saveTokenToDB(memoryToken, memoryExpireTime)
      console.log('[LogoRemoveBg] Access Token 获取成功')
      return memoryToken
    } else {
      throw new Error(data.error_description || '获取 Token 失败')
    }
  } catch (err) {
    console.error('[LogoRemoveBg] 获取 Token 失败:', err.message)
    throw err
  }
}

/**
 * 队徽/Logo 抠图
 * 使用百度通用物体分割 API
 */
async function removeLogoBackground(imageBase64) {
  try {
    console.log('[LogoRemoveBg] 开始队徽抠图')

    // 1. 获取 Access Token
    const accessToken = await getAccessToken()

    // 2. 调用百度通用物体分割 API
    const encodedImage = encodeURIComponent(imageBase64)
    const postData = `image=${encodedImage}`

    console.log('[LogoRemoveBg] 请求数据长度:', postData.length)

    const response = await axios.post(`${SEGMENT_URL}?access_token=${accessToken}`, postData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      maxBodyLength: 10 * 1024 * 1024,
      maxContentLength: 10 * 1024 * 1024
    })

    const data = response.data

    if (data.error_code) {
      throw new Error(data.error_msg || '百度 API 调用失败')
    }

    // 3. 处理返回结果
    // 通用物体分割返回 foreground 透明背景图
    if (data.foreground) {
      console.log('[LogoRemoveBg] 队徽抠图成功')
      return {
        success: true,
        data: data.foreground
      }
    }

    // 尝试 scoremap
    if (data.scoremap) {
      console.log('[LogoRemoveBg] 使用 scoremap 结果')
      return {
        success: true,
        data: data.scoremap
      }
    }

    throw new Error('百度 API 未返回有效图片数据')

  } catch (err) {
    console.error('[LogoRemoveBg] 队徽抠图失败:', err.message)
    return {
      success: false,
      message: err.message || '队徽抠图失败'
    }
  }
}

// 云函数入口
exports.main = async (event, context) => {
  const { action, imageBase64 } = event

  console.log('[LogoRemoveBg] 收到请求, action:', action)

  try {
    if (action === 'removeBackground') {
      if (!imageBase64) {
        return {
          success: false,
          message: '缺少 imageBase64 参数'
        }
      }

      const result = await removeLogoBackground(imageBase64)
      return result
    }

    if (action === 'test') {
      const token = await getAccessToken()
      return {
        success: true,
        message: '队徽抠图服务正常'
      }
    }

    return {
      success: false,
      message: '未知的 action: ' + action
    }

  } catch (err) {
    console.error('[LogoRemoveBg] 云函数执行失败:', err)
    return {
      success: false,
      message: err.message || '云函数执行失败'
    }
  }
}
