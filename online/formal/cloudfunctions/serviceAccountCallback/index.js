'use strict'

const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
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
function linkReply(toUser, fromUser, title, description, url) {
  return '<xml><ToUserName><![CDATA[' + cdata(toUser) + ']]></ToUserName>' +
    '<FromUserName><![CDATA[' + cdata(fromUser) + ']]></FromUserName>' +
    '<CreateTime>' + Math.floor(Date.now() / 1000) + '</CreateTime>' +
    '<MsgType><![CDATA[news]]></MsgType><ArticleCount>1</ArticleCount><Articles><item>' +
    '<Title><![CDATA[' + cdata(title) + ']]></Title>' +
    '<Description><![CDATA[' + cdata(description) + ']]></Description>' +
    '<PicUrl><![CDATA[]]></PicUrl><Url><![CDATA[' + cdata(url) + ']]></Url>' +
    '</item></Articles></xml>'
}
function linkReplyDetails(result) {
  if (result.purpose === 'player_invite_entry') return { title: '登记球员', description: '点击继续填写球员资料' }
  if (result.purpose === 'team_claim_entry') return { title: '认领球队', description: '点击核对并认领球队' }
  if (result.purpose === 'referee_invite' && result.claimMode === 'temporary_no_certificate') return { title: '认领临时裁判', description: '验证手机号并上传头像，提交后等待确认' }
  if (result.purpose === 'referee_invite') return { title: '提交裁判资料', description: '上传裁判证和头像，提交资格审核' }
  return null
}
function followReplyContent(result) {
  if (result.purpose === 'organizer_pc_bind') {
    if (result.bound) return [
      '绑定成功',
      result.organizationName ? `机构：${result.organizationName}` : '',
      result.organizationName && result.roleLabel ? `身份：${result.roleLabel}` : '',
      '请返回电脑继续。'
    ].filter(Boolean).join('\n')
    return '本次主办方账号绑定未完成。\n\n请返回电脑后台刷新二维码后重试；如仍失败，请联系赛小蜂客服核验账号。'
  }
  if (result.purpose === 'team_claim_entry') return '球队认领邀请已失效，请联系赛事主办方。'
  if (result.purpose === 'player_invite_entry') return '球员邀请已失效，请联系球队负责人。'
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

async function organizerGateContext(gate, user) {
  const personal = { orgId:'', organizationName:'', roleLabel:'账号本人' }
  const userId = text(user && user._id)
  const orgId = text(gate && gate.orgId)
  if (!userId || !orgId) return personal
  let organization = null
  try {
    const organizationResult = await db.collection('organizations').doc(orgId).get()
    organization = Array.isArray(organizationResult.data) ? organizationResult.data[0] : organizationResult.data
  } catch { return personal }
  if (!organization) return personal
  const isOwner = [organization.ownerId, organization.creatorId, organization.createdBy].some(value => text(value) === userId)
  const memberships = (await db.collection('organization_memberships').where(_.or([
    { orgId, userId }, { orgId, memberUserId: userId },
    { organizationId: orgId, userId }, { organizationId: orgId, memberUserId: userId }
  ])).limit(20).get()).data || []
  const membership = memberships.find(row => ['active', 'accepted', 'claimed'].includes(text(row && row.status || 'active').toLowerCase())) || null
  if (!isOwner && !membership) return personal
  const positions = Array.isArray(membership && membership.positions) ? membership.positions : []
  const roles = Array.isArray(membership && membership.roles) ? membership.roles : []
  return {
    orgId,
    organizationName: text(organization.name || organization.organizationName).slice(0, 80),
    roleLabel: text(isOwner ? '机构负责人' : positions[0] || roles[0] || membership && (membership.roleLabel || membership.position || membership.role) || '机构成员').slice(0, 30)
  }
}

async function bindOrganizerPcAccount(gate, officialOpenId, eventType) {
  const userId = text(gate.userId)
  const userResult = await db.collection('users').doc(userId).get()
  const user = Array.isArray(userResult.data) ? userResult.data[0] : userResult.data
  if (!user || !/^1\d{10}$/.test(text(user.phone || user.phoneNumber))) {
    await db.collection('service_follow_gates').doc(gate._id).update({ data: { status: 'account_invalid', subscribed: false, updateTime: db.serverDate() } })
    return { eventType, officialOpenId, bound: false, shouldReply: true, purpose: 'organizer_pc_bind' }
  }
  const context = await organizerGateContext(gate, user)
  const officialBindings = (await db.collection('service_account_bindings').where({ sport: SPORT, officialOpenId, subscribed: true }).limit(10).get()).data || []
  if (officialBindings.some(item => !text(item.userId) || text(item.userId) !== userId)) {
    await db.collection('service_follow_gates').doc(gate._id).update({ data: { status: 'identity_conflict', subscribed: false, officialOpenId, updateTime: db.serverDate() } })
    return { eventType, officialOpenId, bound: false, shouldReply: true, purpose: 'organizer_pc_bind' }
  }
  const userBindings = (await db.collection('service_account_bindings').where({ sport: SPORT, userId, subscribed: true }).limit(10).get()).data || []
  if (userBindings.some(item => text(item.officialOpenId) !== officialOpenId)) {
    await db.collection('service_follow_gates').doc(gate._id).update({ data: { status: 'identity_conflict', subscribed: false, officialOpenId, updateTime: db.serverDate() } })
    return { eventType, officialOpenId, bound: false, shouldReply: true, purpose: 'organizer_pc_bind' }
  }
  const uniqueKey = SPORT + ':user:' + userId
  const canonicalRows = (await db.collection('service_account_bindings').where({ uniqueKey }).limit(2).get()).data || []
  const data = { sport: SPORT, uniqueKey, userId, orgId: context.orgId, organizationName: context.organizationName, roleLabel: context.roleLabel, officialOpenId, organizerPcBound: true, subscribed: true, status: 'subscribed', updateTime: db.serverDate() }
  if (canonicalRows[0]) await db.collection('service_account_bindings').doc(canonicalRows[0]._id).update({ data })
  else await db.collection('service_account_bindings').add({ data: { ...data, createTime: db.serverDate() } })
  await db.collection('users').doc(userId).update({ data: { pcServiceRebindRequired: false, updateTime: db.serverDate() } })
  await db.collection('service_follow_gates').doc(gate._id).update({ data: { subscribed: true, status: 'subscribed', officialOpenId, boundUserId: userId, orgId: context.orgId, organizationName: context.organizationName, roleLabel: context.roleLabel, updateTime: db.serverDate() } })
  return { eventType, officialOpenId, bound: true, shouldReply: true, purpose: 'organizer_pc_bind', ...context }
}

async function recordServiceEntryScan(gate, officialOpenId, eventType) {
  const purpose = text(gate.purpose)
  const path = purpose === 'team_claim_entry' ? 'claim-team.html' : 'join-player.html'
  const expiresAt = gate.expiresAt && new Date(gate.expiresAt.$date || gate.expiresAt._date || gate.expiresAt).getTime()
  if (!['team_claim_entry', 'player_invite_entry'].includes(purpose) ||
      gate.status === 'disabled' || (expiresAt && expiresAt <= Date.now())) {
    return { eventType, officialOpenId, bound: false, shouldReply: true, purpose, registerUrl: '' }
  }
  const proof = crypto.randomBytes(24).toString('hex')
  const id = crypto.createHash('sha256').update(`${text(gate._id)}:${officialOpenId}`).digest('hex')
  const data = {
    sport: SPORT, gateId: text(gate._id), purpose, officialOpenId,
    proofHash: crypto.createHash('sha256').update(proof).digest('hex'),
    subscribed: true, status: 'scanned', scannedAt: db.serverDate(),
    expiresAt: new Date(Math.min(Date.now() + 30 * 60 * 1000, expiresAt || Infinity)),
    updateTime: db.serverDate()
  }
  let row = null
  try {
    const old = await db.collection('service_entry_scans').doc(id).get()
    row = Array.isArray(old.data) ? old.data[0] : old.data
  } catch (error) {
    if (!/document.*(not exist|getfail)|not found/i.test(text(error.message))) throw error
  }
  if (row) await db.collection('service_entry_scans').doc(id).update({ data })
  else await db.collection('service_entry_scans').doc(id).set({ data: { ...data, createTime: db.serverDate() } })
  const registerUrl = `https://www.sxffootball.cn/service-account-h5/${path}?v=20261003-3&entry=${encodeURIComponent(text(gate.entryKey))}&proof=${encodeURIComponent(proof)}`
  return { eventType, officialOpenId, bound: true, shouldReply: true, purpose, registerUrl }
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
    const scans = (await db.collection('service_entry_scans').where({ sport: SPORT, officialOpenId }).limit(100).get()).data || []
    await Promise.all(scans.map(item => db.collection('service_entry_scans').doc(item._id).update({ data: { subscribed: false, status: 'unsubscribed', updateTime: db.serverDate() } })))
    const refereeInvites = (await db.collection('referee_invitations').where({ officialOpenId, status: 'active' }).limit(100).get()).data || []
    await Promise.all(refereeInvites.map(item => db.collection('referee_invitations').doc(item._id).update({ data: { followStatus: 'unsubscribed', updateTime: db.serverDate() } })))
    return { eventType, officialOpenId, bound: false, shouldReply: false }
  }
  if (!['subscribe', 'scan'].includes(eventType) || !officialOpenId) return { eventType, officialOpenId, bound: false, shouldReply: false }
  if (!scene) return { eventType, officialOpenId, bound: false, shouldReply: eventType === 'subscribe' }
  const gates = (await db.collection('service_follow_gates').where({ sport: SPORT, scene }).limit(2).get()).data || []
  const gate = gates[0]
  if (!gate) return { eventType, officialOpenId, bound: false, shouldReply: true }
  if (['team_claim_entry', 'player_invite_entry'].includes(text(gate.purpose))) {
    return recordServiceEntryScan(gate, officialOpenId, eventType)
  }
  if (gate.purpose === 'organizer_pc_bind' && gate.userId) {
    return bindOrganizerPcAccount(gate, officialOpenId, eventType)
  }
  await db.collection('service_follow_gates').doc(gate._id).update({ data: { subscribed: true, status: 'subscribed', officialOpenId, updateTime: db.serverDate() } })
  if (gate.purpose === 'referee_invite' && gate.refereeInviteId) {
    const invite = await db.collection('referee_invitations').doc(gate.refereeInviteId).get()
    const invitation = Array.isArray(invite.data) ? invite.data[0] : invite.data
    if (invitation && invitation.status === 'active') {
      await db.collection('referee_invitations').doc(gate.refereeInviteId).update({ data: { followStatus: 'subscribed', officialOpenId, followedAt: db.serverDate(), updateTime: db.serverDate() } })
      return { eventType, officialOpenId, bound: true, shouldReply: true, purpose: 'referee_invite', claimMode: invitation.claimMode || '', registerUrl: gate.registerUrl || invitation.registerUrl || '' }
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
      const link = result.registerUrl && linkReplyDetails(result)
      const reply = link
        ? linkReply(toUser, fromUser, link.title, link.description, result.registerUrl)
        : textReply(toUser, fromUser, followReplyContent(result))
      return response(200, reply, 'application/xml; charset=utf-8')
    }
    return response(200, 'success')
  } catch (error) {
    console.error('[serviceAccountCallback]', error.message || error)
    return response(500, 'failed')
  }
}
