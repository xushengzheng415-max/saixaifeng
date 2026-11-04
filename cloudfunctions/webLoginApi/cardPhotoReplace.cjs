'use strict'
// 球员卡「换形象照 · 上传自己的照片」：本人上传一张单人照，服务端抠图成透明 PNG，
// 确认后写回卡面素材。与 AI 形象照分成两条路径，但共用同一套卡面字段与素材归属：
//   1. prepare：校验照片 → 调 baiduRemoveBg 抠图 → 存受限目录 → 签一次性凭证（15 分钟）。
//   2. apply：校验凭证归属与球员，按既有「换照片」规则扣蜂蜜，再写回 players 卡面字段。
//   3. cancel：没生效过的凭证直接作废并删除临时文件，不产生扣费。
// 计费不做第二套口径：沿用 playerCards.cjs 的 photoReplace（满 100 分免费，未满按
// PLAYER_CARD_PHOTO_REPLACE_HONEY_COST，默认 100 滴），由调用方传入 photoReplace。
// 卡面素材写 playerCardSourceFileId / playerCardSourceType='uploaded_photo'，
// 与 AI 路径的 playerCardAiPortraitFileId 分开记账，不互相覆盖。
const crypto = require('node:crypto')
const text = value => String(value == null ? '' : value).trim()
const fail = (code, message) => { throw Object.assign(new Error(message), { code }) }

const MAX_BYTES = 3 * 1024 * 1024
const TICKET_TTL_MS = 15 * 60 * 1000
const REQUEST_ID = /^[0-9A-Za-z_-]{12,64}$/
const HONEY_REASON = 'player-card-photo-replace'
const HONEY_REFUND_REASON = 'player-card-photo-replace-refund'
const PORTRAIT_PREFIX = 'restricted/player-card-portraits/'

function wallet() { return require('./honeyWallet.cjs') }
function documentOf(db, collection, id) { return require('./playerCardSuite.cjs').document(db, collection, id) }

function requestIdOf(event) {
  const requestId = text(event && event.requestId)
  if (!REQUEST_ID.test(requestId)) fail('CARD_PHOTO_REQUEST_INVALID', '请求编号无效，请回到页面重新上传')
  return requestId
}

function ownerKey(auth) {
  return crypto.createHash('sha256').update(text(auth.userId) || text(auth.openId)).digest('hex').slice(0, 24)
}

// 只接受 JPG/PNG 的 data URL；抠图前先自己判一遍大小与文件头，不把脏数据丢给分割接口。
function photoBytes(value) {
  const matched = String(value || '').match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/)
  if (!matched) fail('CARD_PHOTO_INVALID', '仅支持 JPG 或 PNG 照片，请重新选择')
  const buffer = Buffer.from(matched[2], 'base64')
  const png = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const jpg = buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255
  if (!png && !jpg) fail('CARD_PHOTO_INVALID', '照片无法识别，请换一张')
  if (buffer.length < 1024 || buffer.length > MAX_BYTES) fail('CARD_PHOTO_TOO_LARGE', '照片须在 3MB 以内，请压缩后重新上传')
  return { buffer, base64: matched[2] }
}

function ticketIdOf(ticket) {
  const value = text(ticket)
  if (!/^[a-f0-9]{64}$/.test(value)) fail('CARD_PHOTO_TICKET_INVALID', '照片会话已失效，请重新上传')
  return 'card_photo_' + crypto.createHash('sha256').update(value).digest('hex')
}

function contextOf(context) {
  const { auth, entry } = context
  const playerId = text(entry && entry.player && entry.player._id)
  if (!text(auth.userId) && !text(auth.openId)) fail('CARD_PHOTO_AUTH_REQUIRED', '换照片只支持服务号内的本人或监护球员')
  if (!playerId) fail('PLAYER_CARD_FORBIDDEN', '只能为自己的球员换照片')
  return { playerId }
}

// 换照片的价格与余额：免费（满 100 分）时也照实下发，页面不用自己算门槛。
async function info(context, photoReplace) {
  const { db, auth } = contextOf(context)
  let balance = null
  if (text(auth.openId)) {
    try { balance = Number((await wallet().readHoney(db, auth.openId)).balance) } catch (error) { balance = null }
  }
  return {
    success: true,
    photoReplace: {
      free: photoReplace.free === true,
      cost: Number(photoReplace.cost) || 0,
      balance,
      available: photoReplace.free === true || (balance != null && balance >= (Number(photoReplace.cost) || 0))
    }
  }
}

async function prepare(context, event) {
  const { db, cloud, auth } = context
  const { playerId } = contextOf(context)
  const photo = photoBytes(event && event.photoData)
  let cutout
  try {
    const processed = await cloud.callFunction({ name: 'baiduRemoveBg', data: { action: 'removeBackground', imageBase64: photo.base64 } })
    const result = processed && processed.result
    if (!result || !result.success || !text(result.data)) fail('CARD_PHOTO_SEGMENT_FAILED', '未能识别清晰单人正面照片，请换一张正对镜头、光线均匀的照片')
    cutout = Buffer.from(text(result.data).replace(/^data:image\/png;base64,/, ''), 'base64')
  } catch (error) {
    if (error && error.code) throw error
    fail('CARD_PHOTO_SEGMENT_FAILED', '照片处理失败，请换一张正对镜头的照片后重试')
  }
  if (!cutout.length || cutout.length > 4 * 1024 * 1024) fail('CARD_PHOTO_INVALID', '处理后的照片无效，请换一张后重试')
  const uploaded = await cloud.uploadFile({
    cloudPath: PORTRAIT_PREFIX + ownerKey(auth) + '/upload-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '.png',
    fileContent: cutout
  })
  const ticket = crypto.randomBytes(32).toString('hex')
  const ticketId = ticketIdOf(ticket)
  await db.collection('auth_sessions').doc(ticketId).set({
    data: {
      principalType: 'card_photo',
      scope: 'card-photo',
      active: true,
      userId: text(auth.userId),
      officialOpenId: text(auth.openId),
      playerId,
      fileId: text(uploaded.fileID),
      size: cutout.length,
      expiresAt: Date.now() + TICKET_TTL_MS,
      createdAt: db.serverDate()
    }
  })
  return {
    success: true,
    playerId,
    photoTicket: ticket,
    expiresIn: Math.round(TICKET_TTL_MS / 1000),
    // 透明成片直接给页面预览：用户先看抠图效果，确认后才扣费并写进卡面。
    preview: 'data:image/png;base64,' + cutout.toString('base64')
  }
}

async function grantOf(db, context, event) {
  const { auth } = context
  const { playerId } = contextOf(context)
  const ticketId = ticketIdOf(event && event.photoTicket)
  const grant = await documentOf(db, 'auth_sessions', ticketId)
  if (!grant) fail('CARD_PHOTO_TICKET_INVALID', '照片会话无效，请重新上传')
  if (text(grant.userId) !== text(auth.userId) || text(grant.playerId) !== playerId) fail('CARD_PHOTO_TICKET_INVALID', '照片会话与当前球员不一致，请重新上传')
  return { ticketId, grant, playerId }
}

async function apply(context, event, photoReplace) {
  const { db, auth, isStillOwned } = context
  const requestId = requestIdOf(event)
  const { ticketId, grant, playerId } = await grantOf(db, context, event)
  // 网络重试：上一次已经写进卡面就直接返回结果，不重复扣费，也不因为凭证已消费而报错。
  const live = await documentOf(db, 'players', playerId)
  if (!live || !isStillOwned(live)) fail('PLAYER_CARD_FORBIDDEN', '球员关联已变化，请重新进入')
  if (text(live.playerCardPhotoRequestId) === requestId) {
    return { success: true, playerId, version: Number(live.playerCardVersion || 0), photoReplaceCharge: null, replayed: true }
  }
  if (grant.active !== true || !(Number(grant.expiresAt) > Date.now())) fail('CARD_PHOTO_EXPIRED', '这张照片已过期，请重新上传')
  const fileId = text(grant.fileId)
  if (!fileId.startsWith('cloud://')) fail('CARD_PHOTO_TICKET_INVALID', '照片会话无效，请重新上传')

  const free = photoReplace.free === true
  const cost = Number(photoReplace.cost) || 0
  if (!free && event.confirmPhotoReplaceHoney !== true) {
    return { success: false, code: 'PLAYER_CARD_PHOTO_PAY_REQUIRED', error: '未满 100 分更换照片需消耗 ' + cost + ' 滴蜂蜜', photoReplaceCost: cost }
  }
  const refId = 'card-photo-replace:' + requestId
  let charge = null
  if (!free) {
    if (!text(auth.openId)) fail('HONEY_ACCOUNT_NOT_OPEN', '蜂蜜账户未开通，请先在服务号「我的」完成注册')
    try {
      const spend = await wallet().spendHoney(db, auth.openId, { cost, reason: HONEY_REASON, refId })
      charge = { cost: Number(spend.cost), balance: Number(spend.balance), deduped: spend.deduped === true }
    } catch (error) {
      if (text(error.code) === 'HONEY_INSUFFICIENT') return { success: false, code: 'HONEY_INSUFFICIENT', error: '蜂蜜不足，暂时不能换照片', photoReplaceCost: cost }
      throw error
    }
  }

  let version = null
  try {
    await db.runTransaction(async tx => {
      const live = await documentOf(tx, 'players', playerId)
      if (!live || !isStillOwned(live)) fail('PLAYER_CARD_FORBIDDEN', '球员关联已变化，请重新进入')
      // 同一请求重复提交（网络重试）不再涨版本，也不重复写素材。
      if (text(live.playerCardPhotoRequestId) === requestId) { version = Number(live.playerCardVersion || 0); return }
      const ticket = await documentOf(tx, 'auth_sessions', ticketId)
      if (!ticket || ticket.active !== true || !(Number(ticket.expiresAt) > Date.now())) fail('CARD_PHOTO_EXPIRED', '这张照片已过期，请重新上传')
      version = Number(live.playerCardVersion || 0) + 1
      await tx.collection('players').doc(playerId).update({
        data: {
          playerCardSourceFileId: fileId,
          playerCardSourceType: 'uploaded_photo',
          playerCardPhotoRequestId: requestId,
          playerCardPhotoTicketId: ticketId,
          playerCardVersion: version,
          playerCardSchemaVersion: 'player-card/5',
          playerCardUpdatedBy: text(auth.userId) || text(auth.openId),
          playerCardUpdatedAt: db.serverDate()
        }
      })
      await tx.collection('auth_sessions').doc(ticketId).update({ data: { active: false, appliedAt: db.serverDate() } })
    })
  } catch (error) {
    if (charge && text(auth.openId)) {
      try { await wallet().refundHoney(db, auth.openId, { reason: HONEY_REFUND_REASON, refId }) } catch (refundError) { /* 保留原失败原因，退款异常由平台按流水处理 */ }
    }
    throw error
  }
  const result = { success: true, playerId, version, photoReplaceCharge: charge }
  return result
}

async function cancel(context, event) {
  const { db, cloud } = context
  const { ticketId, grant } = await grantOf(db, context, event)
  if (grant.active !== true) return { success: true, applied: true }
  await db.collection('auth_sessions').doc(ticketId).update({ data: { active: false, cancelledAt: db.serverDate() } })
  try { await cloud.deleteFile({ fileList: [text(grant.fileId)] }) } catch (error) { /* 临时文件过期自动清理，失败不影响结果 */ }
  return { success: true }
}

module.exports = { info, prepare, apply, cancel, ticketIdOf, requestIdOf, photoBytes }
