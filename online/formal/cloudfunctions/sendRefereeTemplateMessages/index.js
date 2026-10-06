const cloud = require('wx-server-sdk')
const https = require('https')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const CONFIG = {
  appId: process.env.SERVICE_ACCOUNT_APP_ID || '',
  appSecret: process.env.SERVICE_ACCOUNT_APP_SECRET || '',
  templateId: process.env.SERVICE_ACCOUNT_REFEREE_TEMPLATE_ID || '',
  h5Url: process.env.SERVICE_ACCOUNT_H5_URL || 'https://www.sxffootball.cn/service-account-h5/',
  tournamentKey: process.env.SERVICE_TEMPLATE_TOURNAMENT_KEY || 'thing1',
  matchKey: process.env.SERVICE_TEMPLATE_MATCH_KEY || 'thing2',
  timeKey: process.env.SERVICE_TEMPLATE_TIME_KEY || 'time3',
  roleKey: process.env.SERVICE_TEMPLATE_ROLE_KEY || 'thing4',
  bridgeUrl: process.env.SXF_FOOTBALL_WECHAT_BRIDGE_URL || '',
  bridgeSecret: process.env.SXF_FOOTBALL_WECHAT_BRIDGE_SECRET || ''
}

function getConfigurationStatus() {
  const missing = []
  const bridgeConfigured = Boolean(CONFIG.bridgeUrl && CONFIG.bridgeSecret)
  if (!bridgeConfigured && !CONFIG.appId) missing.push('SERVICE_ACCOUNT_APP_ID')
  if (!bridgeConfigured && !CONFIG.appSecret) missing.push('SERVICE_ACCOUNT_APP_SECRET')
  if (!bridgeConfigured) {
    if (!CONFIG.bridgeUrl) missing.push('SXF_FOOTBALL_WECHAT_BRIDGE_URL')
    if (!CONFIG.bridgeSecret) missing.push('SXF_FOOTBALL_WECHAT_BRIDGE_SECRET')
  }
  if (!CONFIG.templateId) missing.push('SERVICE_ACCOUNT_REFEREE_TEMPLATE_ID')
  if (!/^https:\/\//i.test(CONFIG.h5Url)) missing.push('SERVICE_ACCOUNT_H5_URL')
  return { configured: missing.length === 0, missing }
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '').slice(-11)
}

function notificationUrl(value) {
  const url = String(value || '').trim()
  return /^https:\/\/www\.sxffootball\.cn\//i.test(url) ? url : CONFIG.h5Url
}

function hasValidRelayProof(event) {
  const phone = normalizePhone(event && event.phone)
  const timestamp = Number(event && event.__relayTimestamp)
  const signature = String(event && event.__relaySignature || '').trim().toLowerCase()
  if (!CONFIG.appSecret || !phone || !Number.isFinite(timestamp) || !signature) return false
  if (Math.abs(Date.now() - timestamp) > 60 * 1000) return false
  const expected = crypto.createHmac('sha256', CONFIG.appSecret)
    .update(phone + '.' + String(timestamp))
    .digest('hex')
  const providedBuffer = Buffer.from(signature, 'utf8')
  const expectedBuffer = Buffer.from(expected, 'utf8')
  return providedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(providedBuffer, expectedBuffer)
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, response => {
      let body = ''
      response.on('data', chunk => { body += chunk })
      response.on('end', () => {
        try { resolve(JSON.parse(body)) } catch (error) { reject(new Error('微信接口返回异常')) }
      })
    })
    req.on('error', reject)
    req.setTimeout(10000, () => req.destroy(new Error('微信接口超时')))
  })
}

function httpsPost(url, payload, extraHeaders) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload)
    const target = new URL(url)
    const req = https.request({
      hostname: target.hostname,
      port: 443,
      path: target.pathname + target.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), ...(extraHeaders || {}) }
    }, response => {
      let result = ''
      response.on('data', chunk => { result += chunk })
      response.on('end', () => {
        try { resolve(JSON.parse(result)) } catch (error) { reject(new Error('微信接口返回异常')) }
      })
    })
    req.on('error', reject)
    req.setTimeout(10000, () => req.destroy(new Error('微信接口超时')))
    req.write(body); req.end()
  })
}

async function bridgePost(action, payload) {
  const baseUrl = String(CONFIG.bridgeUrl || '').replace(/\/+$/, '')
  if (!baseUrl || !CONFIG.bridgeSecret) throw new Error('服务号固定出口中转尚未配置')
  const body = JSON.stringify(payload || {})
  const timestamp = Date.now()
  const nonce = crypto.randomBytes(16).toString('hex')
  const signature = crypto.createHmac('sha256', CONFIG.bridgeSecret).update(`${timestamp}\n${nonce}\n${body}`).digest('hex')
  const target = new URL(baseUrl + '/' + action)
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: target.hostname, port: 443, path: target.pathname + target.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'X-Sxf-Timestamp': String(timestamp), 'X-Sxf-Nonce': nonce, 'X-Sxf-Signature': signature }
    }, response => {
      let result = ''
      response.on('data', chunk => { result += chunk })
      response.on('end', () => {
        try {
          const parsed = JSON.parse(result)
          if (response.statusCode < 200 || response.statusCode >= 300 || parsed.success !== true) return reject(new Error(parsed.message || '服务号固定出口中转请求失败'))
          resolve(parsed)
        } catch (error) { reject(error) }
      })
    })
    req.on('error', reject)
    req.setTimeout(10000, () => req.destroy(new Error('服务号固定出口中转超时')))
    req.write(body); req.end()
  })
}

function value(text, maxLength) {
  return { value: String(text || '').slice(0, maxLength || 20) }
}

async function getAccessToken() {
  const cached = await db.collection('service_account_tokens').where({
    appId: CONFIG.appId,
    expiresAt: _.gt(new Date(Date.now() + 2 * 60 * 1000))
  }).limit(1).get()
  if (cached.data && cached.data[0]) return cached.data[0].accessToken
  const url = 'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=' +
    encodeURIComponent(CONFIG.appId) + '&secret=' + encodeURIComponent(CONFIG.appSecret)
  const result = await httpsGet(url)
  if (!result.access_token) throw new Error('获取服务号 access_token 失败：' + (result.errmsg || result.errcode || '未知错误'))
  const old = await db.collection('service_account_tokens').where({ appId: CONFIG.appId }).limit(10).get()
  for (const item of old.data || []) await db.collection('service_account_tokens').doc(item._id).remove()
  await db.collection('service_account_tokens').add({
    data: {
      appId: CONFIG.appId,
      accessToken: result.access_token,
      expiresAt: new Date(Date.now() + Number(result.expires_in || 7200) * 1000),
      createTime: db.serverDate()
    }
  })
  return result.access_token
}

async function pendingNotifications(event) {
  if (event.notificationId) {
    try {
      const result = await db.collection('referee_notifications').doc(String(event.notificationId)).get()
      const record = Array.isArray(result.data) ? result.data[0] : result.data
      return record ? [record] : []
    } catch (error) { return [] }
  }
  const phone = normalizePhone(event.phone)
  if (!phone) return []
  const result = await db.collection('referee_notifications').where({
    phone,
    status: _.in(['pending', 'awaiting_binding', 'configuration_required', 'failed'])
  }).limit(20).get()
  return result.data || []
}

async function sendOne(notification) {
  if (!notification || notification.status === 'sent' || notification.status === 'cancelled') return { skipped: true }
  const configuration = getConfigurationStatus()
  if (!configuration.configured) {
    await db.collection('referee_notifications').doc(notification._id).update({
      data: { status: 'configuration_required', updateTime: db.serverDate() }
    })
    return { configured: false }
  }
  const identityResult = await db.collection('service_identities').where({
    phone: notification.phone,
    phoneVerified: true
  }).limit(5).get()
  let identity = (identityResult.data || []).find(item => item.serviceAccountOpenId)
  if (!identity) {
    const refereeResult = await db.collection('referees').where({ phone: notification.phone, wechatBound: true }).limit(10).get()
    const referee = (refereeResult.data || []).find(item => item.wechatWorkflowOpenId)
    if (referee) identity = { serviceAccountOpenId: String(referee.wechatWorkflowOpenId).replace(/^service:/, '') }
  }
  if (!identity) {
    await db.collection('referee_notifications').doc(notification._id).update({
      data: { status: 'awaiting_binding', updateTime: db.serverDate() }
    })
    return { bound: false }
  }
  const data = {}
  data[CONFIG.tournamentKey] = value(notification.tournamentName, 20)
  data[CONFIG.matchKey] = value(notification.teamsText, 20)
  data[CONFIG.timeKey] = value(notification.matchTimeText, 20)
  data[CONFIG.roleKey] = value(notification.roleLabel, 20)
  const message = {
    touser: identity.serviceAccountOpenId,
    template_id: CONFIG.templateId,
    url: notificationUrl(notification.url),
    data
  }
  let result
  if (CONFIG.bridgeUrl && CONFIG.bridgeSecret) result = await bridgePost('template/send', { message })
  else {
    const token = await getAccessToken()
    result = await httpsPost('https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=' + encodeURIComponent(token), message)
  }
  if (result.errcode) throw new Error('模板消息发送失败：' + (result.errmsg || result.errcode))
  await db.collection('referee_notifications').doc(notification._id).update({
    data: { status: 'sent', msgId: result.msgid || '', sentAt: db.serverDate(), updateTime: db.serverDate() }
  })
  return { sent: true }
}

exports.main = async event => {
  const configuration = getConfigurationStatus()
  if (event && event.action === 'configurationStatus') {
    return { success: true, configured: configuration.configured, missingConfig: configuration.missing, results: [] }
  }
  if (!hasValidRelayProof(event)) {
    return { success: false, configured: configuration.configured, missingConfig: configuration.missing, results: [], error: '通知发送仅允许服务端中转调用', code: 'INTERNAL_RELAY_REQUIRED' }
  }
  const notifications = await pendingNotifications(event || {})
  const results = []
  for (const notification of notifications) {
    try {
      results.push({ notificationId: notification._id, ...(await sendOne(notification)) })
    } catch (error) {
      console.error('[sendRefereeTemplateMessages] send failed:', notification._id, error)
      await db.collection('referee_notifications').doc(notification._id).update({
        data: { status: 'failed', lastError: error.message, updateTime: db.serverDate() }
      }).catch(() => {})
      results.push({ notificationId: notification._id, sent: false, error: error.message })
    }
  }
  return { success: true, configured: configuration.configured, missingConfig: configuration.missing, results }
}
