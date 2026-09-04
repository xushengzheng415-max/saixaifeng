'use strict'

const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const SPORT = 'football'

function text(value) { return String(value == null ? '' : value).trim() }
function response(statusCode, body, contentType) { return { statusCode, headers: { 'content-type': contentType || 'text/plain; charset=utf-8' }, body: text(body) } }
function xmlValue(xml, tag) {
  const match = String(xml || '').match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return text(match && (match[1] || match[2]))
}
function signatureValid(token, timestamp, nonce, signature) {
  if (!token || !timestamp || !nonce || !signature) return false
  const digest = crypto.createHash('sha1').update([token, timestamp, nonce].sort().join('')).digest('hex')
  if (digest.length !== String(signature).length) return false
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature))
}
function query(event) { return event.queryStringParameters || event.query || {} }
function cdata(value) { return text(value).replace(/]]>/g, ']]]]><![CDATA[>') }
function textReply(toUser, fromUser, content) {
  return `<xml><ToUserName><![CDATA[${cdata(toUser)}]]></ToUserName><FromUserName><![CDATA[${cdata(fromUser)}]]></FromUserName><CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[${cdata(content)}]]></Content></xml>`
}
function followReplyContent(result) {
  if (result.purpose === 'referee_invite' && result.registerUrl) {
    const heading = result.eventType === 'subscribe' ? '感谢您关注赛小蜂足球助手！' : '裁判登记入口已发送！'
    return `${heading}\n\n您已完成裁判服务号关注绑定。请点击以下链接提交裁判证、头像和执裁资料：\n${result.registerUrl}\n\n审核通过后，比赛指派、时间调整、临场变更和退回修正等事项将通过本服务号通知。`
  }
  if (result.bound) {
    const heading = result.eventType === 'subscribe' ? '感谢您关注赛小蜂足球助手！' : '赛小蜂足球账号绑定成功！'
    return `${heading}\n\n已成功绑定您的赛小蜂足球账号。请返回赛小蜂足球小程序，点击“我已关注，刷新状态”，继续完成赛事报名。`
  }
  return '感谢您关注赛小蜂足球助手！\n\n当前尚未绑定赛小蜂足球账号。如需完成赛事报名，请返回赛小蜂足球小程序报名页，长按专属二维码重新进入并完成绑定。'
}

async function upsertBinding(miniOpenId, officialOpenId, subscribed) {
  const uniqueKey = `${SPORT}:${miniOpenId}`
  const result = await db.collection('service_account_bindings').where({ uniqueKey }).limit(2).get()
  const row = (result.data || [])[0]
  const data = { sport: SPORT, uniqueKey, miniOpenId, officialOpenId, subscribed, status: subscribed ? 'subscribed' : 'unsubscribed', updateTime: db.serverDate() }
  if (row) await db.collection('service_account_bindings').doc(row._id).update({ data })
  else await db.collection('service_account_bindings').add({ data: { ...data, createTime: db.serverDate() } })
}

async function handleFollowEvent(xml) {
  const eventType = xmlValue(xml, 'Event').toLowerCase()
  const officialOpenId = xmlValue(xml, 'FromUserName')
  let scene = xmlValue(xml, 'EventKey').replace(/^qrscene_/, '')
  if (eventType === 'unsubscribe') {
    const bindings = (await db.collection('service_account_bindings').where({ sport: SPORT, officialOpenId }).limit(10).get()).data || []
    await Promise.all(bindings.map(item => db.collection('service_account_bindings').doc(item._id).update({ data: { subscribed: false, status: 'unsubscribed', updateTime: db.serverDate() } })))
    const gates = (await db.collection('service_follow_gates').where({ sport: SPORT, officialOpenId }).limit(100).get()).data || []
    await Promise.all(gates.map(item => db.collection('service_follow_gates').doc(item._id).update({ data: { subscribed: false, status: 'unsubscribed', updateTime: db.serverDate() } })))
    const refereeInvites = (await db.collection('referee_invitations').where({ officialOpenId, status: 'active' }).limit(100).get()).data || []
    await Promise.all(refereeInvites.map(item => db.collection('referee_invitations').doc(item._id).update({ data: { followStatus: 'unsubscribed', updateTime: db.serverDate() } })))
    return { eventType, officialOpenId, bound: false, shouldReply: false }
  }
  if (!['subscribe', 'scan'].includes(eventType) || !officialOpenId) return { eventType, officialOpenId, bound: false, shouldReply: false }
  if (!scene) return { eventType, officialOpenId, bound: false, shouldReply: eventType === 'subscribe' }
  const gates = (await db.collection('service_follow_gates').where({ sport: SPORT, scene }).limit(2).get()).data || []
  const gate = gates[0]
  if (!gate) return { eventType, officialOpenId, bound: false, shouldReply: true }
  await db.collection('service_follow_gates').doc(gate._id).update({ data: { subscribed: true, status: 'subscribed', officialOpenId, updateTime: db.serverDate() } })
  if (gate.purpose === 'referee_invite' && gate.refereeInviteId) {
    const invite = await db.collection('referee_invitations').doc(gate.refereeInviteId).get()
    const invitation = Array.isArray(invite.data) ? invite.data[0] : invite.data
    if (invitation && invitation.status === 'active') {
      await db.collection('referee_invitations').doc(gate.refereeInviteId).update({ data: { followStatus: 'subscribed', officialOpenId, followedAt: db.serverDate(), updateTime: db.serverDate() } })
      return { eventType, officialOpenId, bound: true, shouldReply: true, purpose: 'referee_invite', registerUrl: gate.registerUrl || invitation.registerUrl || '' }
    }
  }
  await upsertBinding(gate.miniOpenId, officialOpenId, true)
  const waiting = (await db.collection('notification_outbox').where({ sport: SPORT, recipientMiniOpenId: gate.miniOpenId, channel: 'service_account', status: 'waiting_follow_bind' }).limit(100).get()).data || []
  await Promise.all(waiting.map(item => db.collection('notification_outbox').doc(item._id).update({ data: { status: 'queued', recipientOfficialOpenId: officialOpenId, updateTime: db.serverDate() } })))
  await db.collection('registration_audit_logs').add({ data: { sport: SPORT, action: 'service_account_bound', tournamentId: gate.tournamentId || '', inviteId: gate.inviteId || '', result: 'success', detail: { gateId: gate._id, releasedNotifications: waiting.length }, createTime: db.serverDate() } })
  return { eventType, officialOpenId, bound: true, shouldReply: true }
}

exports.main = async event => {
  if (text(event && event.path) === '/health') return response(200, 'ok')
  const token = text(process.env.SXF_FOOTBALL_SERVICE_CALLBACK_TOKEN)
  if (!token) return response(503, 'service callback token not configured')
  const params = query(event)
  if (!signatureValid(token, text(params.timestamp), text(params.nonce), text(params.signature))) return response(403, 'invalid signature')
  const method = text(event.httpMethod || event.requestContext && event.requestContext.httpMethod || 'GET').toUpperCase()
  if (method === 'GET') return response(200, params.echostr || '')
  try {
    const body = event.isBase64Encoded ? Buffer.from(text(event.body), 'base64').toString('utf8') : text(event.body)
    if (xmlValue(body, 'Encrypt')) return response(501, 'encrypted callback requires bridge decryption')
    const result = await handleFollowEvent(body)
    if (result && result.shouldReply) {
      const toUser = xmlValue(body, 'FromUserName')
      const fromUser = xmlValue(body, 'ToUserName')
      return response(200, textReply(toUser, fromUser, followReplyContent(result)), 'application/xml; charset=utf-8')
    }
    return response(200, 'success')
  } catch (error) {
    console.error('[serviceAccountCallback]', error.message || error)
    return response(500, 'failed')
  }
}
