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

    // 调试日志（隐藏敏感信息）
    console.log('[sendSms] 请求参数:')
    console.log('  SecretId:', CONFIG.SecretId ? CONFIG.SecretId.substring(0, 8) + '...' : '(空!)')
    console.log('  SecretKey:', CONFIG.SecretKey ? '(已配置, 长度=' + CONFIG.SecretKey.length + ')' : '(空!)')
    console.log('  SmsSdkAppId:', CONFIG.SmsSdkAppId || '(空!)')
    console.log('  timestamp:', timestamp)
    console.log('  Authorization前缀:', authorization.substring(0, 50) + '...')

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
            const errMsg = resp ? JSON.stringify(resp) : data
            reject(new Error('短信发送失败: ' + errMsg))
          }
        } catch (e) {
          reject(new Error('解析短信响应失败: ' + data))
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
  // ⚠️ 版本标记 - 如果日志里看不到这行，说明云端跑的是旧版代码！
  console.log('[sendSms] ========== v5-fix-region 新版代码运行中 ==========')
  console.log('[sendSms] TemplateId:', CONFIG.TemplateId, '类型:', typeof CONFIG.TemplateId)
  console.log('[sendSms] SmsSdkAppId:', CONFIG.SmsSdkAppId, '类型:', typeof CONFIG.SmsSdkAppId)
  console.log('[sendSms] SignName:', CONFIG.SignName)
  console.log('[sendSms] Region:', CONFIG.Region)

  const { phoneNumber } = event

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
    console.log('[sendSms] 短信发送成功，验证码：', code)

    // 存储验证码到云数据库（用于后续 verifySmsCode 校验）
    const db = cloud.database()
    await db.collection('sms_codes').add({
      data: {  // 必须用 data 包裹！
        phoneNumber,
        code,
        expireAt: new Date(expireAt),
        used: false,
        createdAt: db.serverDate(),
      }
    })

    return { success: true, message: '验证码发送成功' }
  } catch (err) {
    console.error('[sendSms] 发送失败:', err.message || err)
    return { success: false, error: err.message || '发送失败，请稍后重试' }
  }
}
