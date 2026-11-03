'use strict'
// 球员卡「AI 定妆照」入口：卡面页直接生成一张定妆照并用到自己的卡上，
// 不再绕到「球员登记 · 形象照」。
// 分工（与登记链路一致，不新建计费口径）：
//   1. prepare：服务端先按当前会员价扣蜂蜜，再签发一次性的生图凭证（15 分钟）。
//   2. 前端拿凭证调 aiPortraitDemo 生成透明 PNG，成片写回凭证文档的 assets。
//   3. apply：校验凭证归属与成片，写回球员卡面素材；同一 requestId 只生效一次。
//   4. cancel：没有生效过才原路退回蜂蜜。
// 卡面素材只落在 players.playerCardAiPortraitFileId，用于卡面渲染；
// 不覆盖登记/人脸核验使用的 parent_portraits 与照片版本。
const crypto = require('node:crypto')
const text = value => String(value == null ? '' : value).trim()
const fail = (code, message) => { throw Object.assign(new Error(message), { code }) }

const REQUEST_ID = /^[0-9A-Za-z_-]{12,64}$/
const TICKET_TTL_MS = 15 * 60 * 1000
const REF_PREFIX = 'card-ai-portrait:'
const HONEY_REASON = 'card-ai-portrait-generation'
const HONEY_REFUND_REASON = 'card-ai-portrait-refund'

function wallet() { return require('./honeyWallet.cjs') }
function pricingModule() { return require('./serviceAiPortrait.cjs') }
function documentOf(db, collection, id) { return require('./playerCardSuite.cjs').document(db, collection, id) }

function requestIdOf(event) {
  const requestId = text(event && event.requestId)
  if (!REQUEST_ID.test(requestId)) fail('CARD_AI_PORTRAIT_REQUEST_INVALID', '请求编号无效，请回到页面重新进入')
  return requestId
}

// 只允许服务号 H5 的本人/监护球员使用：卡面 AI 定妆照按 users._id 归属校验，
// 登记邀请等旧会话没有自助生成能力，如实拒绝，不另开一条隐式授权。
function contextOf(context) {
  const { db, cloud, auth, entry, isStillOwned } = context
  if (!text(auth.userId)) fail('CARD_AI_PORTRAIT_AUTH_REQUIRED', 'AI 定妆照只支持服务号内的本人或监护球员')
  const playerId = text(entry && entry.player && entry.player._id)
  if (!playerId) fail('PLAYER_CARD_FORBIDDEN', '只能为自己的球员生成定妆照')
  return {
    db,
    cloud,
    auth,
    player: entry.player,
    playerId,
    relation: entry.relation || null,
    isStillOwned: typeof isStillOwned === 'function' ? isStillOwned : null
  }
}

function priceView(pricing, extra) {
  return Object.assign({
    cost: Number(pricing.cost),
    listCost: Number(pricingModule().portraitListCost()),
    discount: Number(pricing.discount || 0),
    memberActive: pricing.memberActive === true,
    memberLevel: text(pricing.memberLevel),
    memberName: text(pricing.memberName)
  }, extra || {})
}

// 生成前读一次：价格、余额、能不能直接用。读不到余额时如实给原因，不把余额显示成 0。
async function info(context) {
  const { db, auth, player, playerId } = contextOf(context)
  const pricing = await pricingModule().currentPricing(db, text(auth.openId))
  let balance = null
  let available = false
  let reason = ''
  if (!text(auth.openId)) {
    reason = 'HONEY_ACCOUNT_NOT_OPEN'
  } else {
    try {
      const state = await wallet().readHoney(db, auth.openId)
      balance = Number(state.balance)
      available = balance >= Number(pricing.cost)
      if (!available) reason = 'HONEY_INSUFFICIENT'
    } catch (error) {
      reason = text(error.code) || 'HONEY_UNAVAILABLE'
    }
  }
  return {
    success: true,
    playerId,
    playerName: text(player.name),
    aiPortrait: priceView(pricing, { balance, available, reason })
  }
}

// 先扣费后生成：扣费一定发生在服务端，金额来自服务端配置与会员价；
// refId 按 requestId 幂等，同一页面重复点击不会重复扣费。
async function prepare(context, event) {
  const { db, auth, playerId } = contextOf(context)
  const requestId = requestIdOf(event)
  if (!text(auth.openId)) fail('HONEY_ACCOUNT_NOT_OPEN', '蜂蜜账户未开通，请先在服务号「我的」完成注册')
  const pricing = await pricingModule().currentPricing(db, text(auth.openId))
  const refId = REF_PREFIX + requestId
  let spend
  try {
    spend = await wallet().spendHoney(db, auth.openId, { cost: pricing.cost, reason: HONEY_REASON, refId })
  } catch (error) {
    if (text(error.code) === 'HONEY_INSUFFICIENT') {
      return Object.assign({ success: false, code: 'HONEY_INSUFFICIENT', error: text(error.message) || '蜂蜜不足，暂时不能生成' }, { aiPortrait: priceView(pricing, { balance: null, available: false, reason: 'HONEY_INSUFFICIENT' }) })
    }
    throw error
  }
  const ticket = crypto.randomBytes(32).toString('hex')
  const ticketId = 'portrait_card_' + crypto.createHash('sha256').update(ticket).digest('hex')
  await db.collection('auth_sessions').doc(ticketId).set({
    data: {
      principalType: 'portrait_card',
      scope: 'card-portrait',
      active: true,
      userId: text(auth.userId),
      officialOpenId: text(auth.openId),
      playerId,
      requestId,
      assets: [],
      expiresAt: Date.now() + TICKET_TTL_MS,
      createdAt: db.serverDate()
    }
  })
  return {
    success: true,
    playerId,
    requestId,
    generationTicket: ticket,
    expiresIn: Math.round(TICKET_TTL_MS / 1000),
    aiPortrait: priceView(pricing, { balance: Number(spend.balance), available: true, reason: '' })
  }
}

function ticketIdOf(ticket) {
  const value = text(ticket)
  if (!/^[a-f0-9]{64}$/.test(value)) fail('CARD_AI_PORTRAIT_TICKET_INVALID', 'AI 定妆照会话已失效，请重新生成')
  return 'portrait_card_' + crypto.createHash('sha256').update(value).digest('hex')
}

// 用户点「使用这张」：校验成片属于本次请求与本人球员，把它写成卡面素材。
// 版本号同时 +1 并刷新 playerCardSourceFileId，避免再走一次「换照片」扣费。
async function apply(context, event) {
  const { db, cloud, auth, playerId, isStillOwned } = contextOf(context)
  const requestId = requestIdOf(event)
  const ticketId = ticketIdOf(event.cardTicket)
  const grant = await documentOf(db, 'auth_sessions', ticketId)
  if (!grant) fail('CARD_AI_PORTRAIT_TICKET_INVALID', 'AI 定妆照会话无效，请重新生成')
  if (grant.active !== true || !(Number(grant.expiresAt) > Date.now())) fail('CARD_AI_PORTRAIT_EXPIRED', 'AI 定妆照会话已过期，请重新生成')
  if (text(grant.userId) !== text(auth.userId) || text(grant.playerId) !== playerId || text(grant.requestId) !== requestId) fail('CARD_AI_PORTRAIT_TICKET_INVALID', 'AI 定妆照会话与当前球员不一致，请重新生成')
  const assets = Array.isArray(grant.assets) ? grant.assets : []
  const wanted = text(event.generatedPortraitId)
  const asset = (wanted ? assets.filter(item => text(item && item.id) === wanted)[0] : null) || assets[assets.length - 1] || null
  if (!asset || !(Number(asset.expiresAt) > Date.now()) || !text(asset.fileId).startsWith('cloud://')) fail('CARD_AI_PORTRAIT_EXPIRED', '这张成片已过期，请重新生成')
  const bytes = (await cloud.downloadFile({ fileID: text(asset.fileId) })).fileContent
  if (!bytes || bytes.length > 4 * 1024 * 1024 || !require('./playerCardRender.cjs').isTransparentPng(bytes)) fail('CARD_AI_PORTRAIT_INVALID', '未拿到有效的透明成片，请重新生成')

  let version = null
  await db.runTransaction(async tx => {
    const live = await documentOf(tx, 'players', playerId)
    if (!live || !isStillOwned(live)) fail('PLAYER_CARD_FORBIDDEN', '球员关联已变化，请重新进入')
    if (text(live.playerCardAiPortraitRequestId) === requestId) { version = Number(live.playerCardVersion || 0); return }
    const ticket = await documentOf(tx, 'auth_sessions', ticketId)
    if (!ticket || ticket.active !== true || !(Number(ticket.expiresAt) > Date.now())) fail('CARD_AI_PORTRAIT_EXPIRED', 'AI 定妆照会话已过期，请重新生成')
    version = Number(live.playerCardVersion || 0) + 1
    await tx.collection('players').doc(playerId).update({
      data: {
        playerCardAiPortraitFileId: text(asset.fileId),
        playerCardAiPortraitId: text(asset.id),
        playerCardAiPortraitRequestId: requestId,
        playerCardAiPortraitModel: text(asset.model),
        playerCardAiPortraitUpdatedAt: db.serverDate(),
        playerCardSourceFileId: text(asset.fileId),
        playerCardSourceType: 'ai_card_portrait',
        playerCardVersion: version,
        playerCardSchemaVersion: 'player-card/5',
        playerCardUpdatedBy: text(auth.userId),
        playerCardUpdatedAt: db.serverDate()
      }
    })
    await tx.collection('auth_sessions').doc(ticketId).update({
      data: { active: false, appliedPortraitId: text(asset.id), appliedAt: db.serverDate() }
    })
  })
  return {
    success: true,
    playerId,
    version,
    portraitId: text(asset.id)
  }
}

// 生成失败或用户放弃：只有这张成片还没生效过才退回蜂蜜，已生效的按流水保留。
async function cancel(context, event) {
  const { db, auth, playerId } = contextOf(context)
  const requestId = requestIdOf(event)
  if (!text(auth.openId)) fail('HONEY_ACCOUNT_NOT_OPEN', '蜂蜜账户未开通，请先在服务号「我的」完成注册')
  const current = await documentOf(db, 'players', playerId)
  if (current && text(current.playerCardAiPortraitRequestId) === requestId) {
    return { success: false, code: 'CARD_AI_PORTRAIT_APPLIED', error: '这张定妆照已经用到卡面上了，不能退回蜂蜜' }
  }
  const result = await wallet().refundHoney(db, auth.openId, { reason: HONEY_REFUND_REASON, refId: REF_PREFIX + requestId })
  return { success: true, playerId, refunded: Number(result.amount || 0), balance: Number(result.balance), deduped: result.deduped === true }
}

module.exports = { info, prepare, apply, cancel, ticketIdOf, requestIdOf }
