// decodePhoneNumber/index.js
// 解密微信授权手机号。支持新版 code，也保留旧版 cloudID 兜底。
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event) => {
  const code = event && event.code
  const cloudID = event && event.cloudID

  console.log('[decodePhoneNumber] request:', {
    hasCode: !!code,
    hasCloudID: !!cloudID
  })

  if (!code && !cloudID) {
    return {
      success: false,
      message: '缺少手机号授权凭证'
    }
  }

  if (code) {
    try {
      const result = await cloud.openapi.phonenumber.getPhoneNumber({ code })
      console.log('[decodePhoneNumber] phonenumber.getPhoneNumber result:', JSON.stringify(result))

      const phoneInfo = result && result.phoneInfo
      if (phoneInfo && phoneInfo.phoneNumber) {
        return {
          success: true,
          phoneNumber: phoneInfo.phoneNumber,
          purePhoneNumber: phoneInfo.purePhoneNumber || '',
          countryCode: phoneInfo.countryCode || '86'
        }
      }

      return {
        success: false,
        message: '手机号解密失败',
        rawResult: result
      }
    } catch (err) {
      console.error('[decodePhoneNumber] phonenumber.getPhoneNumber error:', err)
      if (cloudID) {
        return decodeByCloudID(cloudID)
      }
      return {
        success: false,
        message: '手机号解密失败：' + (err.errMsg || err.message || '未知错误'),
        errCode: err.errCode || err.code || '',
        error: err.toString()
      }
    }
  }

  return decodeByCloudID(cloudID)
}

async function decodeByCloudID(cloudID) {
  try {
    const result = await cloud.getOpenData({ list: [cloudID] })
    console.log('[decodePhoneNumber] getOpenData result:', JSON.stringify(result))

    const phoneData = result && result.list && result.list[0]
    if (!phoneData) {
      return {
        success: false,
        message: '手机号解密返回为空',
        rawResult: result
      }
    }

    if (phoneData.errCode !== 0) {
      return {
        success: false,
        message: '手机号解密失败：' + (phoneData.errMsg || '未知错误'),
        errCode: phoneData.errCode
      }
    }

    let phoneInfo = phoneData.data
    if (typeof phoneInfo === 'string') {
      try {
        phoneInfo = JSON.parse(phoneInfo)
      } catch (err) {
        console.error('[decodePhoneNumber] parse cloudID data failed:', err)
      }
    }

    if (!phoneInfo || !phoneInfo.phoneNumber) {
      return {
        success: false,
        message: '未获取到手机号'
      }
    }

    return {
      success: true,
      phoneNumber: phoneInfo.phoneNumber,
      purePhoneNumber: phoneInfo.purePhoneNumber || '',
      countryCode: phoneInfo.countryCode || '86'
    }
  } catch (err) {
    console.error('[decodePhoneNumber] getOpenData error:', err)
    return {
      success: false,
      message: '手机号解密异常：' + (err.errMsg || err.message || '未知错误'),
      errCode: err.errCode || err.code || '',
      error: err.toString()
    }
  }
}
