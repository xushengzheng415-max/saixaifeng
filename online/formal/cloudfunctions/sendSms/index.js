// sendSms - 赛小蜂短信验证码发送云函数
// 使用腾讯云官方 TC3 签名示例（修复签名失败问题）
const cloud = require('wx-server-sdk')
const https = require('https')
const crypto = require('crypto')
const url = require('url')

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })

// ========== 配置（从云函数环境变量读取）==========
const CONFIG = {
  SecretId:  process.env.SMS_SECRET_ID  || '',
  SecretKey: process.env.SMS_SECRET_KEY || '',
  // 腾讯云 SMS API 要求这两个字段必须是字符串类型
  SmsSdkAppId: String(process.env.SMS_SDK_APP_ID || ''),
  TemplateId: String(2657871),               // 已审核通过的模板ID（2026-06-05审核通过）
  SignName: '河南麦步体育',                   // 签名：702724（审核通过后可用）
  Region: 'ap-beijing',    // ⚠️ 改为北京区域，需与SDKAppId创建时一致
}

// 生成6位随机验证码
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// ========== 腾讯云 SMS 失败码 → 用户可读文案 ==========
// 腾讯云原始响应含手机号（PhoneNumber）和 RequestId，属敏感信息：
// 既不能返回给浏览器，也不能写入云函数日志。前端只接收可读文案，
// 服务端只记录失败码用于排查。
const SMS_ERROR_MESSAGES = {
  'FailedOperation.InsufficientSMS package': '短信套餐包余量不足，请联系管理员充值后再试',
  'FailedOperation.InsufficientSmsPackage': '短信套餐包余量不足，请联系管理员充值后再试',
  'FailedOperation.InsufficientBalance': '短信账户余额不足，请联系管理员充值后再试',
  'FailedOperation.PhoneNumberInBlacklist': '该手机号已被限制接收短信，请联系管理员处理',
  'FailedOperation.PhoneNumberUnsupported': '该手机号暂不支持接收短信',
  'FailedOperation.SignatureIncorrectOrUnapproved': '短信签名未通过审核，请联系管理员处理',
  'FailedOperation.TemplateIncorrectOrUnapproved': '短信模板未通过审核，请联系管理员处理',
  'FailedOperation.MissingPhoneNumber': '接收短信的手机号无效',
  'FailedOperation.MissingTemplateParam': '短信模板参数缺失，请联系管理员处理',
  'LimitExceeded.PhoneNumberDailyLimit': '该手机号今日短信发送次数已达上限，请明日再试',
  'LimitExceeded.PhoneNumberOneHourLimit': '该手机号发送次数过多，请1小时后重试',
  'LimitExceeded.PhoneNumberThirtySecondLimit': '发送过于频繁，请稍后重试',
  'LimitExceeded.PhoneNumberFiveMinuteLimit': '发送过于频繁，请稍后重试',
  'AuthFailure.SignatureFailure': '短信服务认证失败，请联系管理员处理',
  'AuthFailure.SecretIdNotFound': '短信服务认证失败，请联系管理员处理',
  'AuthFailure.UnauthorizedOperation': '短信服务未授权，请联系管理员处理',
  'UnauthorizedOperation.RequestIpNotInWhitelist': '短信服务IP白名单未配置，请联系管理员处理',
  'RequestLimitExceeded': '短信请求过于频繁，请稍后重试',
  'InternalError': '短信服务内部错误，请稍后重试',
}

// 从腾讯云响应中只提取失败码，绝不回传原始响应体。
function extractSmsFailureCode(resp) {
  const set = resp && Array.isArray(resp.SendStatusSet) ? resp.SendStatusSet : []
  const failed = set.find(item => item && item.Code && item.Code !== 'Ok')
  if (failed) return String(failed.Code)
  if (resp && resp.Error && resp.Error.Code) return String(resp.Error.Code)
  return ''
}

function toUserFacingSmsError(code) {
  if (code && SMS_ERROR_MESSAGES[code]) return SMS_ERROR_MESSAGES[code]
  return '短信发送失败，请稍后重试'
}

// ========== TC3-HMAC-SHA256 签名（腾讯云官方示例）==========
function getSignature(secretKey, date, service, stringToSign) {
  const kDate    = crypto.createHmac('sha256', 'TC3' + secretKey).update(date).digest()
  const kService = crypto.createHmac('sha256', kDate).update(service).digest()
  const kSigning = crypto.createHmac('sha256', kService).update('tc3_request').digest()
  return crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex')
}

function getAuthorization(secretId, secretKey, host, service, action, version, timestamp, payload) {
  // 1. 拼接规范请求串（CanonicalRequest）
  const httpRequestMethod = 'POST'
  const canonicalUri = '/'
  const canonicalQueryString = ''
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`
  const signedHeaders = 'content-type;host'
  const hashedRequestPayload = crypto.createHash('sha256').update(payload).digest('hex')
  const canonicalRequest = [
    httpRequestMethod,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    hashedRequestPayload
  ].join('\n')

  // 2. 计算待签名字符串（StringToSign）
  const algorithm = 'TC3-HMAC-SHA256'
  const requestTimestamp = timestamp.toString()  // 确保是字符串
  const date = new Date(requestTimestamp * 1000).toISOString().slice(0, 10)
  const credentialScope = `${date}/${service}/tc3_request`
  const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex')
  const stringToSign = [
    algorithm,
    requestTimestamp,
    credentialScope,
    hashedCanonicalRequest
  ].join('\n')

  // 3. 计算签名（Signature）
  const signature = getSignature(secretKey, date, service, stringToSign)

  // 4. 拼接Authorization
  const authorization = [
    `${algorithm} Credential=${secretId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`
  ].join(', ')

  return authorization
}

// ========== 调用腾讯云 SMS SendSms 接口 ==========
function callSendSms(phoneNumber, code) {
  return new Promise((resolve, reject) => {
    const timestamp = Math.floor(Date.now() / 1000).toString()  // 转成字符串
    const host = 'sms.tencentcloudapi.com'
    const service = 'sms'
    const action = 'SendSms'
    const version = '2021-01-11'

    const payloadObj = {
      SmsSdkAppId: CONFIG.SmsSdkAppId,
      SignName:     CONFIG.SignName,
      TemplateId:   CONFIG.TemplateId,
      TemplateParamSet: [code, '5'],   // {1}=验证码, {2}=5分钟有效
      PhoneNumberSet: ['+86' + phoneNumber],
    }
    const payload = JSON.stringify(payloadObj)

    const authorization = getAuthorization(
      CONFIG.SecretId, CONFIG.SecretKey,
      host, service, action, version, timestamp, payload
    )

    const options = {
      hostname: host,
      port: 443,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload),
        'Host': host,
        'X-TC-Action': action,
        'X-TC-Version': version,
        'X-TC-Timestamp': timestamp,
        'X-TC-Region': CONFIG.Region,
        'Authorization': authorization,
      },
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          const result = JSON.parse(data)
          const resp = result.Response
          if (resp && resp.SendStatusSet && resp.SendStatusSet[0] && resp.SendStatusSet[0].Code === 'Ok') {
            resolve({ success: true, data: resp })
          } else {
            // 只带失败码和可读文案，原始响应（含手机号、RequestId）不出函数。
            const smsCode = extractSmsFailureCode(resp)
            const err = new Error(toUserFacingSmsError(smsCode))
            err.smsCode = smsCode
            reject(err)
          }
        } catch (e) {
          const err = new Error('短信服务响应异常，请稍后重试')
          err.smsCode = 'PARSE_ERROR'
          reject(err)
        }
      })
    })

    req.on('error', (e) => reject(e))
    req.write(payload)
    req.end()
  })
}

// ========== 云函数入口 ==========
exports.main = async (event) => {

  const { phoneNumber } = event
  const loginChallengeId = /^[a-f0-9]{64}$/i.test(String(event.loginChallengeId || ''))
    ? String(event.loginChallengeId)
    : ''

  // 参数校验
  if (!phoneNumber || !/^1[3-9]\d{9}$/.test(phoneNumber)) {
    return { success: false, error: '手机号格式不正确' }
  }

  // 配置检查
  if (!CONFIG.SecretId || !CONFIG.SecretKey || !CONFIG.SmsSdkAppId) {
    return { success: false, error: 'SMS配置不完整，请检查云函数环境变量（SMS_SECRET_ID / SMS_SECRET_KEY / SMS_SDK_APP_ID）' }
  }

  // 生成验证码
  const code = generateCode()
  const expireAt = Date.now() + 5 * 60 * 1000   // 5分钟后过期

  try {
    // 调用腾讯云 SMS API 发送短信
    await callSendSms(phoneNumber, code)
    console.log('[sendSms] 验证码短信发送成功')

    // 存储验证码到云数据库（用于后续 verifySmsCode 校验）
    const db = cloud.database()
    await db.collection('sms_codes').add({
      data: {  // 必须用 data 包裹！
        phoneNumber,
        code,
        loginChallengeId,
        expireAt: new Date(expireAt),
        used: false,
        createdAt: db.serverDate(),
      }
    })

    return { success: true, message: '验证码发送成功' }
  } catch (err) {
    // 只记录失败码或可读原因，不记录手机号、验证码或腾讯云原始响应。
    console.error('[sendSms] 发送失败:', err.smsCode || err.message || 'UNKNOWN')
    return { success: false, error: err.message || '发送失败，请稍后重试' }
  }
}
