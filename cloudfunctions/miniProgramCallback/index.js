'use strict'

/**
 * miniProgramCallback —— 小程序消息推送回调（微信授权撤回复规）
 *
 * 支持两种接入方式：
 * 1. 小程序后台「开发设置 → 消息推送」选择 URL 服务器地址（HTTP 云函数）：
 *    - GET 请求：Token 签名验证，原样返回 echostr；
 *    - POST 请求：验证签名后解析 JSON（兼容 XML）事件体，转发给执行器。
 *    建议配置：明文模式 + JSON 数据格式，Token 填环境变量 SXF_FOOTBALL_MINI_CALLBACK_TOKEN 的值。
 * 2. 小程序后台消息推送选择「云函数」模式时，事件以 Event 调用直接进入本函数。
 *
 * 处理事件（2026 微信合规要求）：
 * - user_authorization_revoke：用户撤回授权信息 → 按撤回范围删除
 * - user_authorization_cancellation：用户完成注销 → 删除全部微信身份
 * - user_info_modified：平台清理风险资料 → 清理本地昵称头像
 * 其他消息/事件仅记录并返回 success，不做业务处理。
 */

const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const AUTHORIZATION_EVENTS = ['user_info_modified', 'user_authorization_revoke', 'user_authorization_cancellation']
const EXPECTED_APPID = 'wx57164cca8676f411'

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

// 从 JSON / XML 事件体提取统一字段
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
    const parsed = JSON.parse(body)
    return extractEventFields(parsed)
  } catch (error) {
    return { eventType: '', openid: '', unionid: '', appId: '', revokeInfo: '' }
  }
}

async function forwardToExecutor(fields, source) {
  return cloud.callFunction({
    name: 'authorizationRevocation',
    data: {
      action: 'processRevocation',
      source,
      appType: 'miniprogram',
      eventType: fields.eventType,
      openid: fields.openid,
      unionid: fields.unionid,
      appId: fields.appId,
      revokeInfo: fields.revokeInfo
    }
  })
}

exports.main = async event => {
  const token = text(process.env.SXF_FOOTBALL_MINI_CALLBACK_TOKEN)
  const params = query(event)
  const method = text(event.httpMethod || event.requestContext && event.requestContext.httpMethod || '').toUpperCase()

  // URL 模式：HTTP 调用，必须验签
  if (method === 'GET' || method === 'POST') {
    if (!token) return response(503, 'mini callback token not configured')
    if (!signatureValid(token, text(params.timestamp), text(params.nonce), text(params.signature))) return response(403, 'invalid signature')
    if (method === 'GET') return response(200, params.echostr || '')
  }

  try {
    // URL 模式 POST：解析请求体
    if (method === 'POST') {
      const body = decodeBody(event)
      const fields = extractEventFields(body)
      if (fields.appId && EXPECTED_APPID && fields.appId !== EXPECTED_APPID) return response(200, 'success')
      if (fields.eventType && AUTHORIZATION_EVENTS.includes(fields.eventType.toLowerCase())) {
        await forwardToExecutor(fields, 'miniprogram_callback_url')
      }
      return response(200, 'success')
    }

    // 云函数模式：事件对象直接进入
    const fields = extractEventFields(event)
    if (fields.eventType && AUTHORIZATION_EVENTS.includes(fields.eventType.toLowerCase())) {
      await forwardToExecutor(fields, 'miniprogram_callback_event')
    }
    return { success: true }
  } catch (error) {
    console.error('[miniProgramCallback]', error.message || error)
    // 返回 500 让微信重试，避免漏处理
    if (method === 'POST') return response(500, 'process failed')
    return { success: false, error: text(error.message || error) }
  }
}
