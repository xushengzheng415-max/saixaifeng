'use strict'
const https = require('https')
const crypto = require('crypto')

// 服务号 API 出口（固定出口中转模式）：
// CloudBase 动态出口 IP 不在服务号 API IP 白名单内，access_token 只能由 api.saixiaofeng.com 中转桥
// 用服务器侧 AppSecret 获取（见 ops/wechat-football-bridge/README.md，与 sendRefereeTemplateMessages 同一桥）。
// 本模块通过 HMAC 签名调用桥：
// - custom/send      客服消息（text / image / miniprogrampage）
// - material/upload  永久素材上传（由运维脚本调用，media_id 落到本函数环境变量 SERVICE_ACCOUNT_MATERIAL_<KEY>）
// 素材读取顺序：环境变量 → service_account_materials 集合（兼容登记模式）→ 未配置报错走文字降级。
const REQUEST_TIMEOUT = 5000

function text(value) { return String(value == null ? '' : value).trim() }

function createServiceAccountApi({ db, env }) {
  const bridgeUrl = text(env && env.SXF_FOOTBALL_WECHAT_BRIDGE_URL).replace(/\/+$/, '')
  const bridgeSecret = text(env && env.SXF_FOOTBALL_WECHAT_BRIDGE_SECRET)
  const materialMemo = new Map()

  function bridgePost(action, payload) {
    if (!bridgeUrl || !bridgeSecret) return Promise.reject(new Error('服务号固定出口中转未配置（SXF_FOOTBALL_WECHAT_BRIDGE_URL / SECRET）'))
    return new Promise((resolve, reject) => {
      const body = JSON.stringify(payload || {})
      const timestamp = Date.now()
      const nonce = crypto.randomBytes(12).toString('hex')
      const signature = crypto.createHmac('sha256', bridgeSecret).update(`${timestamp}\n${nonce}\n${body}`).digest('hex')
      let target
      try { target = new URL(bridgeUrl + '/' + action) } catch (error) { return reject(error) }
      const request = https.request({
        hostname: target.hostname,
        path: target.pathname + target.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'x-sxf-timestamp': String(timestamp),
          'x-sxf-nonce': nonce,
          'x-sxf-signature': signature
        },
        timeout: REQUEST_TIMEOUT
      }, response => {
        const chunks = []
        response.on('data', chunk => chunks.push(chunk))
        response.on('end', () => {
          let data
          try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch (error) { return reject(new Error('中转桥返回异常')) }
          if (response.statusCode !== 200 || data.success === false) {
            const error = new Error(text(data && data.message) || ('中转桥返回 HTTP ' + response.statusCode))
            error.wechatCode = data && data.code
            return reject(error)
          }
          resolve(data)
        })
      })
      request.on('timeout', () => request.destroy(new Error('中转桥请求超时')))
      request.on('error', reject)
      request.write(body)
      request.end()
    })
  }

  async function getMaterialMediaId(key) {
    const id = text(key)
    if (!id) return ''
    const envName = 'SERVICE_ACCOUNT_MATERIAL_' + id.toUpperCase()
    const fromEnv = text(env && env[envName])
    if (fromEnv) return fromEnv
    const memo = materialMemo.get(id)
    if (memo && memo.expiresAt > Date.now()) return memo.mediaId
    try {
      const rows = (await db.collection('service_account_materials').where({ key: id }).limit(1).get()).data || []
      const mediaId = text(rows[0] && rows[0].mediaId)
      if (mediaId) materialMemo.set(id, { mediaId, expiresAt: Date.now() + 10 * 60 * 1000 })
      return mediaId
    } catch (error) {
      return ''
    }
  }

  async function sendCustomMessage(message) {
    await bridgePost('custom/send', { message })
    return { errcode: 0, errmsg: 'ok' }
  }

  async function sendCustomerText(openid, content) {
    return sendCustomMessage({ touser: openid, msgtype: 'text', text: { content: String(content || '').slice(0, 2000) } })
  }

  async function sendCustomerImage(openid, mediaId) {
    return sendCustomMessage({ touser: openid, msgtype: 'image', image: { media_id: mediaId } })
  }

  // 小程序卡片：要求服务号已认证且已关联小程序，否则微信报错 → 调用方降级为文字回复
  async function sendMiniProgramCard(openid, card) {
    return sendCustomMessage({
      touser: openid,
      msgtype: 'miniprogrampage',
      miniprogrampage: {
        title: text(card && card.title).slice(0, 60),
        appid: text(card && card.appId),
        pagepath: text(card && card.pagePath),
        thumb_media_id: text(card && card.thumbMediaId)
      }
    })
  }

  return { sendCustomerText, sendCustomerImage, sendMiniProgramCard, getMaterialMediaId }
}

module.exports = { createServiceAccountApi }
