'use strict'
// 球员登记「形象照」步骤的 AI 抱膀定妆照入库入口。
// 分工：
//   1. 登记会话获取专属生图凭证，生成透明 PNG 并保存受控成片编号。
//   2. 用户确认「用这张」后校验编号归属、入库，直接复用透明原图，再进球员卡。
// 扣费时序（2026-10-29 用户确认）：先扣费后生成。页面在 prepare 时带 chargeFirst + requestId，
// 服务端先扣蜂蜜再签发凭证；生成失败由页面调 refund 原路退回；入库时同一 refId 只去重、不再扣第二次。
// 扣费一定发生在服务端：金额来自服务端配置，前端只拿到展示值与本次结果，不能自己决定扣多少。
const text = value => String(value == null ? '' : value).trim()
const fail = (code, message) => { throw Object.assign(new Error(message), { code }) }

// 每次生成并保存进登记资料的统一价格（滴）。
// 可用云函数环境变量 AI_PORTRAIT_HONEY_COST 覆盖，避免改代码才能调价；
// 非法值一律回落默认值，不允许出现 0 或负数把收费变成免费。
const DEFAULT_COST = 100
const MAX_COST = 5000
function portraitCost() {
  const raw = Number(process.env.AI_PORTRAIT_HONEY_COST || DEFAULT_COST)
  return Number.isSafeInteger(raw) && raw > 0 && raw <= MAX_COST ? raw : DEFAULT_COST
}

// 对外标价（原价锚），2026-10-27 用户确认「标价 150 滴、活动实售 100 滴」。
// 只用于展示折扣感，实际扣费始终是 portraitCost()；会员折扣尚未上线，
// 以后接会员时必须作用在活动实售价上，不能拿原价去打折。
const LIST_COST = 150
function portraitListCost() {
  const raw = Number(process.env.AI_PORTRAIT_HONEY_LIST_COST || LIST_COST)
  const value = Number.isSafeInteger(raw) && raw > 0 && raw <= MAX_COST ? raw : LIST_COST
  const cost = portraitCost()
  return value > cost ? value : cost
}

// 云开发 HTTP 访问的 JSON 请求体上限是 102400 字节，前端已把成片压到 96k 字符内，
// 这里再挡一次，避免大包进入抠图。
const MAX_BASE64_CHARS = 96000

function wallet() { return require('./honeyWallet.cjs') }
const membership = require('./membership.cjs')

// 会员折扣（2026-10-29 用户授权接入）：只作用在活动实售价 portraitCost() 上，
// 绝不拿 150 滴标价去打折。有效期外、会员读取失败一律回落原价，不阻断定妆照主流程。
async function currentPricing(db, serviceAccountOpenId) {
  const baseCost = portraitCost()
  const member = await membership.discountFor(db, text(serviceAccountOpenId))
  return {
    cost: membership.discountedCost(baseCost, member.discount),
    baseCost,
    discount: member.discount,
    memberActive: member.active === true,
    memberLevel: text(member.levelCode),
    memberName: text(member.planName)
  }
}

// 页面进入登记表单时读一次：价格、当前余额、能不能直接用。
// 读不到（未开通/账本待核对）时如实返回原因，不把余额当成 0 显示成“余额不足”。
async function info(db, loaded) {
  const { session } = loaded
  const listCost = portraitListCost()
  const openId = text(session && session.officialOpenId)
  const pricing = await currentPricing(db, openId)
  const cost = pricing.cost
  const priceView = { cost, listCost, discount: pricing.discount, memberActive: pricing.memberActive, memberLevel: pricing.memberLevel, memberName: pricing.memberName }
  if (!session || session.phoneVerified !== true) return Object.assign({ available: false, balance: 0, reason: 'PHONE_REQUIRED' }, priceView)
  try {
    const walletState = await wallet().readHoney(db, openId)
    return Object.assign({ available: walletState.balance >= cost, balance: walletState.balance, reason: '' }, priceView)
  } catch (failure) {
    return Object.assign({ available: false, balance: 0, reason: text(failure.code) || 'HONEY_UNAVAILABLE' }, priceView)
  }
}

async function apply(cloud, db, loaded, event) {
  const { session, gate } = loaded
  if (!session.phoneVerified || gate.purpose !== 'player_invite_entry') fail('PLAYER_AUTH_REQUIRED', '请先验证登记手机号')
  const requestId = text(event.requestId)
  if (!/^[0-9A-Za-z_-]{12,64}$/.test(requestId)) fail('AI_PORTRAIT_REQUEST_INVALID', '请求编号无效，请刷新页面后重试')
  const base64 = text(event.base64Data)
  const generatedId = text(event.generatedPortraitId)
  let trustedAsset = null
  if (generatedId) {
    const current = await require('./playerCardSuite.cjs').document(db, 'service_entry_sessions', session._id)
    if (!current || !current.active || text(current.userId) !== text(session.userId) || text(current.gateId) !== text(gate._id)) fail('ENTRY_SESSION_INVALID', '登记会话已变化，请重新打开')
    const asset = (current.aiGeneratedPortraits || []).find(item => text(item.id) === generatedId)
    if (!asset || !(asset.expiresAt > Date.now()) || !text(asset.fileId).startsWith('cloud://')) fail('AI_PORTRAIT_EXPIRED', '透明成片已过期，请重新生成')
    const bytes = (await cloud.downloadFile({ fileID: asset.fileId })).fileContent
    if (!bytes || bytes.length > 4 * 1024 * 1024 || !require('./playerCardRender.cjs').isTransparentPng(bytes)) fail('PHOTO_INVALID', '未获得有效透明成片，请重新生成')
    trustedAsset = { fileID: asset.fileId, bytes }
  } else {
    if (!/^data:image\/(png|jpeg|jpg);base64,[A-Za-z0-9+/=]+$/.test(base64)) fail('PHOTO_INVALID', '请先生成 AI 形象照')
    if (base64.length > MAX_BASE64_CHARS) fail('PHOTO_TOO_LARGE', '照片数据过大，请重新生成')
  }

  const listCost = portraitListCost()
  const openId = text(session.officialOpenId)
  // 实际扣费一律按服务端当前会员价计算；refId 幂等保证「prepare 已扣费」时不会按新价再扣一次
  const pricing = await currentPricing(db, openId)
  const cost = pricing.cost
  const refId = 'ai-portrait:' + requestId
  const reserved = await db.runTransaction(async tx => {
    const current = await require('./playerCardSuite.cjs').document(tx, 'service_entry_sessions', session._id)
    if (!current || !current.active || current.phoneVerified !== true || text(current.userId) !== text(session.userId) || text(current.gateId) !== text(gate._id) || !(new Date(current.expiresAt).getTime() > Date.now())) fail('ENTRY_SESSION_INVALID', '登记会话已变化，请重新打开')
    const cached = (current.playerRegistrationPortraits || []).find(item => item.aiRequestId === requestId)
    if (cached) return { cached }
    if (current.aiPortraitApplyLock && current.aiPortraitApplyLock.startedAt > Date.now() - 120000) fail('AI_PORTRAIT_IN_PROGRESS', '形象照正在保存，请稍后重试')
    await tx.collection('service_entry_sessions').doc(session._id).update({ data: { aiPortraitApplyLock: db.command.set({ requestId, startedAt: Date.now() }) } })
    return { cached: null }
  })
  if (reserved.cached) {
    const cached = reserved.cached, raw = (await cloud.downloadFile({ fileID: cached.fileId })).fileContent
    const state = await wallet().readHoney(db, openId)
    return { success: true, portraitId: cached.id, fileID: cached.fileId, processingStatus: 'ready', transparentPreview: 'data:image/png;base64,' + raw.toString('base64'), aiPortrait: { cost, listCost, discount: pricing.discount, balance: state.balance, requestId, deduped: true, source: 'ai_pose_portrait' } }
  }
  let spend = null
  try {
    spend = await wallet().spendHoney(db, openId, {
    cost,
    reason: 'ai-portrait-generation',
    refId,
    sessionId: text(session._id)
  })

    // 服务端持有的透明原图按成片编号复用；旧内联白底调用保持兼容。
    // 入库时标记来源与本次请求编号：形象照记录与蜂蜜流水（refId=ai-portrait:<requestId>）可互相核对，
    // 客服/退款排查不用再靠时间点猜是哪一张。
    const uploaded = await require('./serviceRegistrationMedia.cjs').upload(cloud, db, loaded, {
      base64Data: base64,
      portraitSource: 'ai_pose_portrait',
      aiRequestId: requestId
    }, trustedAsset)
    return Object.assign({ success: true }, uploaded, {
      aiPortrait: { cost, listCost, discount: pricing.discount, balance: spend.balance, requestId, deduped: spend.deduped, source: 'ai_pose_portrait' }
    })
  } catch (failure) {
    if (!spend) throw failure
    // 已扣费但没生成成功：原路退回，并把退还后的余额告诉页面。
    // 退回失败（例如账本待核对）时如实标记，由平台按流水人工处理，不静默吞掉。
    // 退回后用户用同一 requestId 再生成会重新扣一次（见 honeyWallet 的 attempt 口径），
    // 因此既不会白送，也不会因为失败重试被扣两次。
    let refunded = false, refundedAmount = 0, balance = spend.balance, refundError = ''
    try {
      const refund = await wallet().refundHoney(db, openId, {
        reason: 'ai-portrait-failed',
        refId,
        sessionId: text(session._id)
      })
      refunded = true
      refundedAmount = Number(refund.amount) > 0 ? Number(refund.amount) : 0
      balance = refund.balance
    } catch (error) {
      refundError = text(error.code) || 'HONEY_REFUND_FAILED'
      console.warn('[serviceAiPortrait] 退回失败:', refundError, text(error.message))
    }
    return {
      success: false,
      code: text(failure.code) || 'AI_PORTRAIT_FAILED',
      error: text(failure.message) || '形象照处理失败，请重试',
      refunded,
      refundedAmount,
      refundError,
      balance,
      cost,
      listCost
    }
  } finally {
    try {
      await db.runTransaction(async tx => {
        const current = await require('./playerCardSuite.cjs').document(tx, 'service_entry_sessions', session._id)
        if (current && current.aiPortraitApplyLock && current.aiPortraitApplyLock.requestId === requestId) await tx.collection('service_entry_sessions').doc(session._id).update({ data: { aiPortraitApplyLock: null } })
      })
    } catch { console.warn('[serviceAiPortrait] 保存状态待恢复') }
  }
}

const REQUEST_ID_PATTERN = /^[0-9A-Za-z_-]{12,64}$/

// 生图凭证。2026-10-29 用户确认改为「先扣费后生成」：页面带 chargeFirst + requestId 时，
// 签发凭证之前就把蜂蜜扣掉，用与入库完全相同的 refId（ai-portrait:<requestId>）记账。
// 生成失败由页面调 refund 原路退回；成功后 apply 复用同一 refId 天然去重，不会扣第二次。
// 不带 chargeFirst 的旧调用保持原样（只校验余额、不扣费），便于新旧页面共用同一后端。
async function prepare(db, loaded, event) {
  const { session, gate } = loaded
  if (!session || session.phoneVerified !== true || !session.active || !session.userId || !session.officialOpenId || gate.purpose !== 'player_invite_entry') fail('PLAYER_AUTH_REQUIRED', '请先验证登记手机号')
  const account = await info(db, loaded)
  if (!account.available) return { success: false, code: account.reason || 'HONEY_INSUFFICIENT', error: account.reason ? '蜂蜜账户暂不可用，请查看账户状态' : '蜂蜜余额不足', aiPortrait: account }
  const chargeFirst = Boolean(event && event.chargeFirst === true)
  const requestId = text(event && event.requestId)
  const refId = 'ai-portrait:' + requestId
  let charged = null
  if (chargeFirst) {
    if (!REQUEST_ID_PATTERN.test(requestId)) fail('AI_PORTRAIT_REQUEST_INVALID', '请求编号无效，请刷新页面后重试')
    try {
      charged = await wallet().spendHoney(db, text(session.officialOpenId), {
        cost: account.cost,
        reason: 'ai-portrait-generation',
        refId,
        sessionId: text(session._id)
      })
    } catch (failure) {
      const state = await info(db, loaded)
      return { success: false, code: text(failure.code) || 'HONEY_SPEND_FAILED', error: text(failure.message) || '蜂蜜扣费失败，请重试', aiPortrait: state }
    }
  }
  const crypto = require('crypto'), ticket = crypto.randomBytes(32).toString('hex')
  const id = crypto.createHash('sha256').update(ticket).digest('hex')
  await db.collection('auth_sessions').doc('portrait_registration_' + id).set({ data: {
    principalType: 'portrait_registration', scope: 'registration-portrait', active: true,
    sessionId: session._id, gateId: gate._id, userId: session.userId, officialOpenId: session.officialOpenId,
    expiresAt: Date.now() + 15 * 60 * 1000, createdAt: db.serverDate()
  } })
  const result = { success: true, generationTicket: ticket, expiresIn: 900, aiPortrait: account }
  if (charged) {
    const balance = Number.isSafeInteger(Number(charged.balance)) ? Number(charged.balance) : account.balance
    result.aiPortrait = Object.assign({}, account, { balance, available: balance >= account.cost })
    result.charge = { requestId, cost: account.cost, balance, deduped: charged.deduped === true }
  }
  return result
}

// 先扣费后生成的总退路：生成失败、上传失败或用户放弃时按同一 requestId 原路退回。
// 幂等来自 honeyWallet 的 attempt 口径，重复调用只会返回 amount=0，不会多退。
// 已经入库的形象照不允许退回（否则可以先退钱再白拿成片），按 aiRequestId 直接识别。
async function refund(db, loaded, event) {
  const { session, gate } = loaded
  if (!session || session.phoneVerified !== true || !session.active || !session.userId || !session.officialOpenId || !gate || gate.purpose !== 'player_invite_entry') fail('PLAYER_AUTH_REQUIRED', '请先验证登记手机号')
  const requestId = text(event && event.requestId)
  if (!REQUEST_ID_PATTERN.test(requestId)) fail('AI_PORTRAIT_REQUEST_INVALID', '请求编号无效，请刷新页面后重试')
  const current = await require('./playerCardSuite.cjs').document(db, 'service_entry_sessions', session._id)
  if (current && (current.playerRegistrationPortraits || []).some(item => text(item.aiRequestId) === requestId)) fail('AI_PORTRAIT_ALREADY_SAVED', '这张形象照已保存，不能退回蜂蜜')
  const listCost = portraitListCost()
  // 退回金额始终以账本里那笔实际扣费为准；这里只按当前会员价取展示值
  const cost = (await currentPricing(db, text(session.officialOpenId))).cost
  let amount = 0
  try {
    const result = await wallet().refundHoney(db, text(session.officialOpenId), {
      reason: 'ai-portrait-not-generated',
      refId: 'ai-portrait:' + requestId,
      sessionId: text(session._id)
    })
    amount = Number(result.amount) > 0 ? Number(result.amount) : 0
  } catch (failure) {
    const state = await info(db, loaded)
    return { success: false, code: text(failure.code) || 'HONEY_REFUND_FAILED', error: text(failure.message) || '蜂蜜退回失败，请联系平台核对', refunded: false, refundedAmount: 0, cost, listCost, aiPortrait: state }
  }
  const state = await info(db, loaded)
  return { success: true, refunded: amount > 0, refundedAmount: amount, cost, listCost, balance: state.balance, aiPortrait: state }
}
module.exports = { apply, info, portraitCost, prepare, refund }