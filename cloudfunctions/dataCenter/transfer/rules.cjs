'use strict'
/**
 * 赛事转会中心底层规则（方案 V1.1，2026-10-26）。
 *
 * 这里只放纯函数与常量：金额换算、条款校验、窗口状态、状态机、轮次、冷却、到期判定。
 * 不读写数据库，PC／小程序／H5 也不得另写一套。
 *
 * 已确认规则（docs/PRODUCT_RULES.md 2026-10-26）：
 * - 转会依托赛事转会窗口；未参赛球队不支持转会；市场可浏览但不扩大隐私。
 * - 两队谈判最多三轮；破裂后该买方球队 24 小时内不得再向同一球员发起申请。
 * - 转会费为人民币，线上只记录报价与成交金额，线下交付；平台不收款、不设收款门禁。
 * - 两队同意同一版本后由赛事主办方审核；转会不需要球员同意；赛果、名单、历史不随转会改写。
 * - 新进及正式转会先按一年合同记录；续约由球队发起、球员服务号回应，拒绝不立即离队。
 * - 租借最短一场、最长本赛季末；仅整赛季租借可提前谈续租或转永久；原合同球队与当前效力球队分开。
 *
 * 方案第九章 Q01—Q09 仍待决。未确认分支一律显式拦截并给出 PENDING 错误码，
 * 不用默认值、页面选项或迁移脚本替用户做决定。
 */
const crypto = require('node:crypto')
const { error } = require('../shared/service.cjs')

const MAX_ROUNDS = 3
const COOLDOWN_HOURS = 24
const CONTRACT_MONTHS = 12
// 买方报价与卖方还价交替，三轮最多 6 个不可变条款版本（第 6 版用于记录第三轮还价后即破裂）。
const MAX_OFFERS = MAX_ROUNDS * 2
const MAX_EVENTS = 60
const MAX_PAGE_SIZE = 50

const REQUEST_TYPES = Object.freeze(['permanent', 'loan', 'loan_permanent', 'loan_renewal'])
const LOAN_KINDS = Object.freeze(['season_full', 'single_match'])
const REQUEST_STATUSES = Object.freeze([
  'negotiating', 'pending_review', 'pending_effect', 'completed', 'rejected', 'broken', 'withdrawn'
])
const TERMINAL_STATUSES = Object.freeze(['completed', 'rejected', 'broken', 'withdrawn'])
const CONTRACT_STATUSES = Object.freeze(['scheduled', 'active', 'renewed', 'expired', 'ended'])
const LOAN_STATUSES = Object.freeze(['scheduled', 'active', 'ended'])
const RENEWAL_STATUSES = Object.freeze(['pending', 'accepted', 'rejected', 'cancelled', 'superseded'])
const MARKET_STATES = Object.freeze(['all', 'contracted', 'free'])

const COLLECTIONS = Object.freeze({
  windows: 'transfer_windows',
  requests: 'transfer_requests',
  offers: 'transfer_offers',
  events: 'transfer_events',
  cooldowns: 'transfer_cooldowns',
  contracts: 'player_contracts',
  loans: 'player_loans',
  renewals: 'contract_renewals',
  freeSignings: 'transfer_free_signings'
})

// 待决编号→待决内容，错误与页面提示都引用编号，避免把建议说成已确认规则。
const PENDING_RULES = Object.freeze({
  Q01: '两队是否必须参加同一赛事、跨赛事由谁审核',
  Q02: '自由签约是否另需主办方审核（球员资格已确认：2026-10-26 仅赛事外球员可签）',
  Q03: '赛季起止由何处定义、是否允许多个窗口',
  Q04: '轮次计数口径、提前拒绝／撤回／超时是否触发冷却',
  Q05: '整赛季认定、续租对应赛季与是否重审',
  Q06: '单场取消／延期／赛果撤销时租借何时到期',
  Q07: '续约提醒、新期限、未回复与代管回应规则',
  Q08: '存量球员合同起止及新合同生效日',
  Q09: '是否允许零元转会费、成交金额公开范围'
})

/**
 * 未确认分支的保守实现：宁可拦截，也不按猜测放行。
 * 每项都写明对应待决编号，确认后只需改这里和对应分支。
 */
const POLICY = Object.freeze({
  maxRounds: MAX_ROUNDS,
  cooldownHours: COOLDOWN_HOURS,
  contractMonths: CONTRACT_MONTHS,
  // Q01：跨赛事审批归属未定，底层只允许两队同为所选赛事有效参赛球队。
  requireSameTournament: true,
  // Q02：自由签约窗口适用未定，按“转会依托窗口”保守要求当前有开放窗口。
  freeAgentRequiresOpenWindow: true,
  // Q02：是否另需主办审核未定，当前不生成审核节点，生效即完成。
  freeAgentRequiresReview: false,
  // Q09：零元转会费未确认，金额必须大于 0。
  zeroFeeAllowed: false,
  // Q04：提前拒绝是否冷却未定，当前只记录破裂原因，不写冷却。
  earlyRejectTriggersCooldown: false,
  // Q04：撤回是否冷却未定，当前不写冷却。
  withdrawTriggersCooldown: false,
  // Q07：青少年代管人能否代回应未定，当前只允许本人账号回应。
  guardianRenewalResponse: false,
  // Q07：未回复不自动续约，也不自动失效。
  autoRenewUnanswered: false,
  // Q06：单场比赛取消／延期时租借不自动结束，转待核对。
  singleMatchExpiryOnCancel: 'pending_review',
  // Q07：即将到期阈值未定，TM05 不返回临期判断。
  expiryWarningDays: null
})

const id = value => value == null ? '' : String(value).trim()
const first = result => Array.isArray(result?.data) ? result.data[0] : result?.data
const hash = (value, length = 32) => crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, length)

function pending(code, message) {
  const reason = PENDING_RULES[code] || ''
  return error(code + '_PENDING', `${message}（待决 ${code}：${reason}）`)
}

// CloudBase 可能返回 Date、ISO 字符串或 {$date} 包装；统一转 Date，无效返回 null。
function dateValue(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null
  if (typeof value === 'object') return dateValue(value.$date || value.value || value.date)
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

// 日期输入统一按北京时间解释；只给日期时取当日 00:00(+08:00)，不按服务器时区猜。
function toDate(value, label = '日期') {
  const text = id(value)
  if (!text) return null
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(text) ? text + 'T00:00:00+08:00' : text
  const date = dateValue(normalized)
  if (!date) throw error('TRANSFER_DATE_INVALID', `${label}格式无效，请重新选择`)
  return date
}

function fenFromYuan(value) {
  const raw = typeof value === 'string' ? value.replace(/[,，\s]/g, '') : value
  if (raw === '' || raw == null) throw error('TRANSFER_AMOUNT_INVALID', '请填写人民币金额')
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(String(raw))) throw error('TRANSFER_AMOUNT_INVALID', '金额请填写最多两位小数的非负数')
  const fen = Math.round(Number(raw) * 100)
  if (!Number.isSafeInteger(fen)) throw error('TRANSFER_AMOUNT_INVALID', '金额超出可记录范围')
  return fen
}

// 底层以分存储；零元和负数都不进入已确认规则。
function amountFen(input = {}) {
  let fen
  if (input.amountFen !== undefined && input.amountFen !== null && input.amountFen !== '') {
    const raw = Number(input.amountFen)
    if (!Number.isInteger(raw)) throw error('TRANSFER_AMOUNT_INVALID', '金额分值必须为整数')
    fen = raw
  } else fen = fenFromYuan(input.amount)
  if (fen < 0) throw error('TRANSFER_AMOUNT_INVALID', '金额不能为负数')
  if (fen === 0 && !POLICY.zeroFeeAllowed) throw pending('Q09', '零元转会费尚未确认，请填写大于 0 的金额')
  return fen
}

function yuanText(fen) {
  return Number.isInteger(fen) ? (fen / 100).toFixed(2) : ''
}

/**
 * 条款归一：方式、金额、期限与比赛／赛季。
 * 正式转会与转永久只保留一年期限，起算日按 Q08 待决不预填；
 * 租借只支持已确认的单场与整赛季，其他短期口径显式拦截。
 */
function normalizeTerms(input = {}) {
  const type = id(input.type)
  if (!REQUEST_TYPES.includes(type)) throw error('TRANSFER_TYPE_INVALID', '请选择正式转会、租借、转永久或续租')
  const terms = { type, amountFen: amountFen(input), currency: 'CNY', settlement: 'offline' }
  if (type === 'permanent' || type === 'loan_permanent') {
    // 正式转会和转永久承接的是原合同／原整赛季租借，不接收租借期限参数，避免两项口径互相覆盖。
    if (id(input.loanKind)) throw error('TRANSFER_LOAN_KIND_INVALID', '正式转会与转永久不使用租借期限')
    return { ...terms, contractMonths: CONTRACT_MONTHS }
  }
  let kind = id(input.loanKind)
  if (type === 'loan') {
    if (!kind) throw error('TRANSFER_LOAN_KIND_REQUIRED', '请选择单场或整赛季租借')
    if (!LOAN_KINDS.includes(kind)) throw pending('Q05', '多场或按日期的短期租借尚未确认')
  } else {
    // 转永久与续租都承接整赛季租借，不能退化成单场。
    if (kind && kind !== 'season_full') throw error('TRANSFER_LOAN_KIND_INVALID', '只有整赛季租借可以续租或转永久')
    kind = 'season_full'
  }
  const loan = {
    kind,
    matchId: id(input.matchId),
    targetSeasonKey: id(input.targetSeasonKey),
    startAt: toDate(input.startAt, '租借开始时间'),
    endAt: toDate(input.endAt, '租借结束时间')
  }
  if (kind === 'single_match') {
    if (!loan.matchId) throw error('TRANSFER_MATCH_REQUIRED', '单场租借须选择具体比赛')
    loan.endAt = null
    loan.expiryMode = 'match_end'
  } else {
    loan.endAt = loan.endAt || null
    if (loan.startAt && loan.endAt && loan.endAt <= loan.startAt) throw error('TRANSFER_DATE_INVALID', '租借结束时间须晚于开始时间')
    loan.expiryMode = loan.endAt ? 'date' : 'pending'
    // Q03：赛季起止尚无权威对象，整赛季租借必须显式给出结束时间。
    if (!loan.endAt && type === 'loan') throw pending('Q03', '整赛季租借须明确结束时间')
    if (!loan.endAt && type === 'loan_renewal') throw pending('Q05', '续租须明确新租借结束时间')
    if (type === 'loan_renewal' && !loan.targetSeasonKey) throw pending('Q05', '续租须明确对应赛季')
  }
  return { ...terms, loan }
}

function assertNoAmountChange(previous, next) {
  if (!previous) return
  if (previous.type !== next.type) throw error('TRANSFER_TYPE_IMMUTABLE', '转会方式已确定，不能在对价阶段变更')
  if (previous.loan && next.loan && previous.loan.kind !== next.loan.kind) throw error('TRANSFER_TYPE_IMMUTABLE', '租借期限类型已确定，不能在对价阶段变更')
}

function normalizeWindow(input = {}) {
  // Q03：当前以主办方显式填写的赛季标识区分窗口，不创建赛季主数据、不从赛事名猜赛季。
  const seasonKey = id(input.seasonKey)
  if (!seasonKey) throw pending('Q03', '请填写明确的赛季标识')
  if (seasonKey.length > 40) throw error('TRANSFER_SEASON_INVALID', '赛季标识过长')
  const openFrom = toDate(input.openFrom, '窗口开始时间')
  const openTo = toDate(input.openTo, '窗口结束时间')
  if (!openFrom || !openTo) throw error('TRANSFER_WINDOW_INVALID', '请填写窗口起止时间')
  if (openTo <= openFrom) throw error('TRANSFER_WINDOW_INVALID', '结束时间须晚于开始时间')
  return { seasonKey, openFrom, openTo }
}

function windowState(window, now = new Date()) {
  if (!window) return 'not_configured'
  const from = dateValue(window.openFrom), to = dateValue(window.openTo)
  if (!from || !to) return 'not_configured'
  const at = dateValue(now) || new Date()
  if (at < from) return 'scheduled'
  if (at > to) return 'closed'
  return 'open'
}

function assertWindowOpen(window, now = new Date()) {
  const state = windowState(window, now)
  if (state === 'open') return state
  if (state === 'not_configured') throw error('TRANSFER_WINDOW_NOT_CONFIGURED', '本赛事尚未配置转会窗口')
  if (state === 'scheduled') throw error('TRANSFER_WINDOW_NOT_OPEN', '转会窗口尚未开始')
  throw error('TRANSFER_WINDOW_CLOSED', '转会窗口已关闭')
}

function roundLabel(request) {
  const round = Number(request?.round || 0)
  const max = Number(request?.maxRounds || MAX_ROUNDS)
  return round > 0 ? `第${Math.min(round, max)}／${max}轮` : ''
}

function assertNegotiating(request) {
  if (!request) throw error('TRANSFER_NOT_FOUND', '转会单不存在')
  if (request.status !== 'negotiating') throw error('TRANSFER_STATE_CONFLICT', '转会单状态已变化，请刷新后重试')
}

function offerPatch(request, offerId, version, now) {
  return {
    currentOfferId: offerId,
    currentOfferVersion: version,
    updateTime: now,
    version: Number(request.version || 0) + 1
  }
}

// 买方报价：首份报价在第 1 轮；对方还价后买方再次提交即进入下一轮。
function buyerOfferPatch(request, offerId, version, now) {
  assertNegotiating(request)
  if (request.turn !== 'to') throw error('TRANSFER_TURN_CONFLICT', '当前等待对方处理，不能重复提交报价')
  const round = Number(request.round || 1)
  if (round >= MAX_ROUNDS) throw error('TRANSFER_ROUNDS_EXHAUSTED', '第三轮已结束，不能继续加价')
  return {
    ...offerPatch(request, offerId, version, now),
    status: 'negotiating',
    round: round + 1,
    turn: 'from',
    buyerConfirmedAt: null,
    sellerConfirmedAt: null,
    agreedOfferVersion: null
  }
}

function buildRequest(request, offerId, now, type) {
  return {
    type,
    status: 'negotiating',
    round: 1,
    maxRounds: MAX_ROUNDS,
    turn: 'from',
    currentOfferId: offerId,
    currentOfferVersion: 1,
    buyerConfirmedAt: now,
    sellerConfirmedAt: null,
    agreedOfferVersion: null,
    version: 1,
    createTime: now,
    updateTime: now
  }
}

function cooldownUntil(now) {
  return new Date(now.getTime() + COOLDOWN_HOURS * 3600000)
}

/**
 * 卖方回应：接受即双方对同一版本达成一致，进入主办审核；
 * 拒绝结束本次谈判但不写冷却（Q04 待决）；第三轮还价视为三轮未达成，写 24 小时冷却。
 */
function sellerResponsePatch(request, { decision, offerId = '', version = 0, now }) {
  assertNegotiating(request)
  if (request.turn !== 'from') throw error('TRANSFER_TURN_CONFLICT', '当前等待买方报价，无法处理')
  const base = { updateTime: now, version: Number(request.version || 0) + 1 }
  if (decision === 'accept') {
    return {
      ...base,
      status: 'pending_review',
      turn: '',
      agreedOfferVersion: Number(request.currentOfferVersion || 0),
      sellerConfirmedAt: now,
      buyerConfirmedAt: request.buyerConfirmedAt || null
    }
  }
  if (decision === 'reject') {
    return {
      ...base,
      status: 'broken',
      turn: '',
      brokenReason: 'seller_rejected',
      brokenRound: Number(request.round || 0),
      cooldownUntil: POLICY.earlyRejectTriggersCooldown ? cooldownUntil(now) : null,
      cooldownRule: POLICY.earlyRejectTriggersCooldown ? `max_${MAX_ROUNDS}_rounds` : 'pending_q04'
    }
  }
  const round = Number(request.round || 1)
  if (round >= MAX_ROUNDS) {
    return {
      ...base,
      status: 'broken',
      turn: '',
      round,
      currentOfferId: offerId,
      currentOfferVersion: version,
      brokenReason: 'rounds_exhausted',
      brokenRound: round,
      cooldownUntil: cooldownUntil(now),
      cooldownRule: `max_${MAX_ROUNDS}_rounds`
    }
  }
  return {
    ...base,
    status: 'negotiating',
    turn: 'to',
    currentOfferId: offerId,
    currentOfferVersion: version,
    buyerConfirmedAt: null,
    sellerConfirmedAt: null,
    agreedOfferVersion: null
  }
}

function withdrawPatch(request, now) {
  assertNegotiating(request)
  return {
    status: 'withdrawn',
    turn: '',
    withdrawnAt: now,
    cooldownUntil: POLICY.withdrawTriggersCooldown ? cooldownUntil(now) : null,
    cooldownRule: POLICY.withdrawTriggersCooldown ? `max_${MAX_ROUNDS}_rounds` : 'pending_q04',
    updateTime: now,
    version: Number(request.version || 0) + 1
  }
}

function reviewDecisionPatch(request, { decision, reason, reviewer, now }) {
  if (!request) throw error('TRANSFER_NOT_FOUND', '转会单不存在')
  if (request.status !== 'pending_review') throw error('TRANSFER_STATE_CONFLICT', '该转会单不在待审核状态')
  const agreed = Number(request.agreedOfferVersion || 0)
  if (!agreed || agreed !== Number(request.currentOfferVersion || 0)) throw error('TRANSFER_VERSION_CONFLICT', '条款版本已变化，请重新读取后再审核')
  if (decision === 'reject') {
    const note = id(reason)
    if (note.length < 2 || note.length > 200) throw error('TRANSFER_REVIEW_REASON_REQUIRED', '拒绝须填写 2 至 200 字的理由')
    return {
      status: 'rejected',
      review: { decision: 'reject', reason: note, reviewerId: id(reviewer), reviewedAt: now, offerVersion: agreed },
      rejectedAt: now,
      updateTime: now,
      version: Number(request.version || 0) + 1
    }
  }
  return {
    status: 'completed',
    review: { decision: 'approve', reason: id(reason).slice(0, 200), reviewerId: id(reviewer), reviewedAt: now, offerVersion: agreed },
    approvedAt: now,
    updateTime: now,
    version: Number(request.version || 0) + 1
  }
}

/**
 * 合同期限：一年已确认，但起算日 Q08 未定。
 * 因此只记录生效时刻与暂定一年期限，termStatus=pending_confirmation，
 * 到期任务只处理 termStatus=confirmed 的记录，不推断自由身。
 */
function contractTerm(effectiveAt) {
  const start = dateValue(effectiveAt) || new Date()
  const end = new Date(start.getTime())
  end.setMonth(end.getMonth() + CONTRACT_MONTHS)
  return {
    validFrom: start,
    validTo: end,
    termMonths: CONTRACT_MONTHS,
    termStatus: 'pending_confirmation',
    termPendingRule: 'Q08'
  }
}

function contractState(contract, now = new Date()) {
  if (!contract) return 'none'
  const status = id(contract.status)
  if (status && status !== 'active' && status !== 'scheduled') return status
  const from = dateValue(contract.validFrom), to = dateValue(contract.validTo)
  if (contract.termStatus !== 'confirmed' || !from || !to) return 'pending_term'
  const at = dateValue(now) || new Date()
  if (at < from) return 'scheduled'
  if (at > to) return 'expired'
  return 'active'
}

/**
 * 当前效力球队：有效租借期内为借入队，否则为合同球队。
 * 同一时间只允许一段有效租借，两段重叠即数据冲突，不取“第一条”。
 */
function effectiveTeam({ contract, loans = [], now = new Date() } = {}) {
  const at = dateValue(now) || new Date()
  const active = loans.filter(row => id(row.status) === 'active')
  if (active.length > 1) return { conflict: true, teamId: '', loan: null }
  const loan = active[0] || null
  if (loan) {
    const from = dateValue(loan.startAt), to = dateValue(loan.endAt)
    const inRange = (!from || from <= at) && (!to || to >= at)
    if (inRange) return { conflict: false, teamId: id(loan.borrowerTeamId), loan, loaned: true }
  }
  return { conflict: false, teamId: id(contract?.teamId), loan: null, loaned: false }
}

/**
 * 租借到期：整赛季／按日期到 endAt 结束；
 * 单场以比赛正式结束为到期，取消或无效不直接结束而是转待核对（Q06）。
 */
function loanExpiryDecision(loan, { now = new Date(), matchState = '' } = {}) {
  if (!loan || id(loan.status) !== 'active') return { action: 'none' }
  const at = dateValue(now) || new Date()
  if (id(loan.kind) === 'single_match' || loan.expiryMode === 'match_end') {
    if (matchState === 'official') return { action: 'end', reason: 'match_finished' }
    if (matchState === 'excluded') {
      if (POLICY.singleMatchExpiryOnCancel === 'pending_review') return { action: 'review', reason: 'match_closed_pending_q06' }
      return { action: 'end', reason: 'match_closed' }
    }
    return { action: 'none' }
  }
  const end = dateValue(loan.endAt)
  if (!end) return { action: 'review', reason: 'end_date_missing' }
  if (end <= at) return { action: 'end', reason: 'loan_expired' }
  return { action: 'none' }
}

function assertRenewalDates(input, now = new Date()) {
  const from = toDate(input.proposedFrom, '续约开始时间')
  const to = toDate(input.proposedTo, '续约结束时间')
  if (!from || !to) throw error('TRANSFER_RENEWAL_INVALID', '请填写续约起止时间')
  if (to <= from) throw error('TRANSFER_RENEWAL_INVALID', '续约结束时间须晚于开始时间')
  const at = dateValue(now) || new Date()
  if (to <= at) throw error('TRANSFER_RENEWAL_INVALID', '续约结束时间须晚于当前时间')
  return { proposedFrom: from, proposedTo: to }
}

// 球员本人关系：续约应答只允许 linkedUserId/playerUserId；Q07 未确认前不含代管人。
function playerResponseIdentity(player, userId) {
  const uid = id(userId)
  if (!player || !uid) return { allowed: false, related: false, guardian: false }
  if ([player.linkedUserId, player.playerUserId].some(key => key && id(key) === uid)) return { allowed: true, related: true, guardian: false }
  if (player.guardianUserId && id(player.guardianUserId) === uid) return { allowed: false, related: true, guardian: true }
  return { allowed: false, related: false, guardian: false }
}

function pageInput(event = {}) {
  const page = Math.max(1, Math.floor(Number(event.page) || 1))
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(event.pageSize) || 20)))
  return { page, pageSize }
}

function paginate(rows, event = {}) {
  const { page, pageSize } = pageInput(event)
  const total = rows.length
  return {
    items: rows.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    total,
    pageCount: Math.max(1, Math.ceil(total / pageSize))
  }
}

module.exports = {
  MAX_ROUNDS,
  COOLDOWN_HOURS,
  CONTRACT_MONTHS,
  MAX_OFFERS,
  MAX_EVENTS,
  MAX_PAGE_SIZE,
  REQUEST_TYPES,
  LOAN_KINDS,
  REQUEST_STATUSES,
  TERMINAL_STATUSES,
  CONTRACT_STATUSES,
  LOAN_STATUSES,
  RENEWAL_STATUSES,
  MARKET_STATES,
  COLLECTIONS,
  PENDING_RULES,
  POLICY,
  id,
  first,
  hash,
  pending,
  dateValue,
  toDate,
  amountFen,
  yuanText,
  normalizeTerms,
  assertNoAmountChange,
  normalizeWindow,
  windowState,
  assertWindowOpen,
  roundLabel,
  assertNegotiating,
  buyerOfferPatch,
  buildRequest,
  sellerResponsePatch,
  withdrawPatch,
  reviewDecisionPatch,
  contractTerm,
  contractState,
  effectiveTeam,
  loanExpiryDecision,
  assertRenewalDates,
  playerResponseIdentity,
  pageInput,
  paginate
}
