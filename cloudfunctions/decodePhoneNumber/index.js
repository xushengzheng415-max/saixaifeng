// decodePhoneNumber/index.js
// 解密微信手机号 - 支持 code（新）和 cloudID（旧）两种方案

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  const { code, cloudID } = event

  console.log('[decodePhoneNumber] 收到请求, code:', code ? '有值' : '无', 'cloudID:', cloudID ? '有值' : '无')

  if (!code && !cloudID) {
    return {
      success: false,
      message: '缺少 code 或 cloudID 参数'
    }
  }

  // 方案A：使用 code（新版本微信，2023+）
  if (code) {
    try {
      console.log('[decodePhoneNumber] 使用 code 方案')
      
      // 调用微信 API 解密手机号
      const result = await cloud.openapi.phonenumber.getPhoneNumber({
        code: code
      })

      console.log('[decodePhoneNumber] code 方案返回:', JSON.stringify(result))

      if (result && result.phoneInfo) {
        return {
          success: true,
          phoneNumber: result.phoneInfo.phoneNumber,
          purePhoneNumber: result.phoneInfo.purePhoneNumber || '',
          countryCode: result.phoneInfo.countryCode || '86'
        }
      } else {
        return {
          success: false,
          message: 'code 方案解密失败',
          rawResult: result
        }
      }
    } catch (err) {
      console.error('[decodePhoneNumber] code 方案异常:', err)
      // 如果 code 方案失败，尝试 cloudID 方案（如果有的话）
      if (cloudID) {
        console.log('[decodePhoneNumber] code 方案失败，尝试 cloudID 方案')
        return await decodeByCloudID(cloudID)
      }
      return {
        success: false,
        message: 'code 方案失败: ' + (err.message || '未知错误'),
        error: err.toString()
      }
    }
  }

  // 方案B：使用 cloudID（旧版本微信）
  if (cloudID) {
    return await decodeByCloudID(cloudID)
  }
}

// 使用 cloudID 解密手机号
async function decodeByCloudID(cloudID) {
  try {
    console.log('[decodeByCloudID] 开始调用 getOpenData')
    const result = await cloud.getOpenData({
      list: [cloudID]
    })

    console.log('[decodeByCloudID] getOpenData 返回:', JSON.stringify(result))

    const phoneData = result && result.list && result.list[0]

    if (!phoneData) {
      return {
        success: false,
        message: 'cloudID 方案: 解密返回数据为空',
        rawResult: result
      }
    }

    if (phoneData.errCode !== 0) {
      return {
        success: false,
        message: 'cloudID 方案: 解密失败: ' + (phoneData.errMsg || '未知错误'),
        errCode: phoneData.errCode
      }
    }

    // data 可能是字符串或对象
    let phoneInfo = phoneData.data
    if (typeof phoneInfo === 'string') {
      try {
        phoneInfo = JSON.parse(phoneInfo)
      } catch (e) {
        console.error('[decodeByCloudID] JSON.parse 失败:', e)
      }
    }

    console.log('[decodeByCloudID] 手机号信息:', JSON.stringify(phoneInfo))

    if (!phoneInfo || !phoneInfo.phoneNumber) {
      return {
        success: false,
        message: 'cloudID 方案: 未获取到手机号'
      }
    }

    return {
      success: true,
      phoneNumber: phoneInfo.phoneNumber,
      purePhoneNumber: phoneInfo.purePhoneNumber || '',
      countryCode: phoneInfo.countryCode || '86'
    }

  } catch (err) {
    console.error('[decodeByCloudID] 异常:', err)
    return {
      success: false,
      message: 'cloudID 方案异常: ' + (err.message || '未知错误'),
      error: err.toString()
    }
  }
}
