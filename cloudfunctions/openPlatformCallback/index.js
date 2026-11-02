'use strict'

/**
 * openPlatformCallback —— 微信开放平台「网站应用」消息推送回调（微信授权撤回复规）
 *
 * 配置入口：开放平台 open.weixin.qq.com → 管理中心 → 网站应用 → 消息推送
 *   - URL 服务器地址：本函数 HTTP 访问地址
 *   - Token：与环境变量 SXF_FOOTBALL_OPEN_CALLBACK_TOKEN 一致
 *   - 建议配置：明文模式 + JSON 数据格式
 *
 * 处理事件（2026 微信合规要求）：
 * - user_authorization_revoke：用户撤回网站应用授权（RevokeInfo=301 撤回全部）→ 删除
 * - user_authorization_cancellation：用户完成注销 → 删除全部微信身份
 * - user_info_modified：平台清理风险资料 → 清理本地昵称头像
 * 注意：事件里用户 OpenID 在 <OpenID> 标签，FromUserName 是平台推送服务号，不能混用。
 */

const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const AUTHORIZATION_EVENTS = ['user_info_modified', 'user_authorization_revoke', 'user_authorization_cancellation']
const EXPECTED_APPID = 'wx5a42aae0e5d0669c'

function text(value) { return String(value == null ? '' : value).trim() }
function response(statusCode, body) { return { statusCode, headers: { 'content-type': 'text/plain; charset=utf-8' }, body: text(body) } }
function signatureValid(token, timestamp, nonce, signature) {
  if (!token || !timestamp || !nonce || !signature) return false
  const digest = crypto.createHash('sha1').update([token, timestamp, nonce].sort().join('')).digest('hex')
  if (digest.length !== String(signature).length) return false
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature))
}
function xmlValue(xml, tag) {
  const match = String(xml || '').match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return text(match && (match[1] || match[2]))
}
function query(event) { return event.queryStringParameters || event.query || {} }

function decodeBody(event) {
  const raw = text(event.body)
  if (!raw) return ''
  return event.isBase64Encoded ? Buffer.from(raw, 'base64').toString('utf8') : raw
}

function extractEventFields(payload) {
  if (typeof payload === 'object' && payload !== null) {
    return {
      eventType: text(payload.Event || payload.event),
      openid: text(payload.OpenID || payload.openid || payload.FromUserName),
      unionid: text(payload.UnionID || payload.unionid),
      appId: text(payload.AppID || payload.appid),
      revokeInfo: text(payload.RevokeInfo || payload.revokeInfo)
    }
  }
  const body = String(payload || '')
  if (body.includes('<xml')) {
    return {
      eventType: xmlValue(body, 'Event'),
      openid: xmlValue(body, 'OpenID') || xmlValue(body, 'FromUserName'),
      unionid: xmlValue(body, 'UnionID'),
      appId: xmlValue(body, 'AppID'),
      revokeInfo: xmlValue(body, 'RevokeInfo')
    }
  }
  try {
    return extractEventFields(JSON.parse(body))
  } catch (error) {
    return { eventType: '', openid: '', unionid: '', appId: '', revokeInfo: '' }
  }
}

exports.main = async event => {
  const token = text(process.env.SXF_FOOTBALL_OPEN_CALLBACK_TOKEN)
  const params = query(event)
  const method = text(event.httpMethod || event.requestContext && event.requestContext.httpMethod || '').toUpperCase()

  if (method === 'GET' || method === 'POST') {
    if (!token) return response(503, 'open platform callback token not configured')
    if (!signatureValid(token, text(params.timestamp), text(params.nonce), text(params.signature))) return response(403, 'invalid signature')
    if (method === 'GET') return response(200, params.echostr || '')
  }

  try {
    const body = decodeBody(event)
    const fields = extractEventFields(body)
    if (fields.appId && EXPECTED_APPID && fields.appId !== EXPECTED_APPID) return response(200, 'success')
    if (fields.eventType && AUTHORIZATION_EVENTS.includes(fields.eventType.toLowerCase())) {
      await cloud.callFunction({
        name: 'authorizationRevocation',
        data: {
          action: 'processRevocation',
          source: 'open_platform_callback',
          appType: 'website',
          eventType: fields.eventType,
          openid: fields.openid,
          unionid: fields.unionid,
          appId: fields.appId,
          revokeInfo: fields.revokeInfo
        }
      })
    }
    return response(200, 'success')
  } catch (error) {
    console.error('[openPlatformCallback]', error.message || error)
    if (method === 'POST') return response(500, 'process failed')
    return response(200, 'success')
  }
}
