// 赛事转会中心 PC 展示投影（主办方审核、窗口与记录）。
//
// 只做展示格式化与入参组装，不判定审核资格、不计算金额、不推断合同状态：
// - 方式与状态文案一律使用服务端 transferAdminRequests／transferAdminRecord 返回的
//   typeText／statusText，页面不另写一套规则；
// - 自由签约没有转会费，不用 ¥0 冒充；青少年身价不公开，未测算不以 0 代替；
// - 窗口四态、待决提示以服务端 window.state／notes 为准；
// - 金额以分存储，显示为 ¥ 1,200.00，最多两位小数。

const TIME_ZONE = 'Asia/Shanghai'

const STATUS_TEXT = Object.freeze({
  negotiating: '谈判中',
  pending_review: '待主办审核',
  pending_effect: '待生效',
  completed: '已完成',
  rejected: '审核未通过',
  broken: '谈判已结束',
  withdrawn: '已撤回'
})

const WINDOW_STATE_TEXT = Object.freeze({
  not_configured: '未配置转会窗口',
  scheduled: '窗口未开始',
  open: '窗口开放中',
  closed: '窗口已关闭'
})

const EVENT_ACTION_TEXT = Object.freeze({
  request_created: '发起转会',
  offer_submitted: '提交报价',
  offer_accept: '接受报价',
  offer_reject: '拒绝报价',
  offer_counter: '提出还价',
  withdrawn: '撤回转会申请',
  review_approved: '主办审核通过',
  review_rejected: '主办审核拒绝',
  window_saved: '保存转会窗口'
})

const ACTOR_SIDE_TEXT = Object.freeze({ admin: '主办方', to: '买方球队', from: '原球队' })

const POLICY_TEXT = Object.freeze({
  eventScopePolicy: { outside_event_only: '仅限赛事外球员' },
  freeAgentWindowPolicy: { conservative_requires_open_window: '需有开放窗口（保守实现）' },
  reviewPolicy: { pending_q02: '审核规则待决（Q02）', required: '需主办审核', none: '无需主办审核' }
})

// 服务端错误码 → 页面可执行提示；未登记的错误码直接使用服务端中文消息。
export const TRANSFER_ERROR_TEXT = Object.freeze({
  DATA_FORBIDDEN: '无转会管理权限',
  TRANSFER_WINDOW_STALE: '窗口设置已更新，请刷新后再保存',
  TRANSFER_WINDOW_INVALID: '窗口起止时间无效，结束时间须晚于开始时间',
  TRANSFER_WINDOW_NOT_CONFIGURED: '本赛事尚未配置转会窗口',
  TRANSFER_VERSION_CONFLICT: '条款已更新，请刷新后再审核',
  TRANSFER_VERSION_REQUIRED: '缺少条款版本，请刷新后重试',
  TRANSFER_STATE_CONFLICT: '该转会单已处理或状态已变化，请刷新后查看',
  TRANSFER_REVIEW_CONFLICT: '审核人与买卖任一方球队存在管理关系，不能审核本笔转会',
  TRANSFER_REVIEW_REASON_REQUIRED: '拒绝须填写 2 至 200 字的理由',
  TRANSFER_DATE_INVALID: '日期格式无效，请重新选择',
  Q03_PENDING: '赛季标识规则待决（Q03），请按当前要求填写明确赛季'
})

export const STATUS_TEXT_MAP = STATUS_TEXT
export const WINDOW_STATE_TEXT_MAP = WINDOW_STATE_TEXT

// CloudBase 可能返回 Date、ISO 字符串或 {$date} 包装；无效返回 null，不补当前时间。
export function dateOf(value) {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'object') return dateOf(value.$date || value.value || value.date)
  const text = String(value).trim()
  if (!text) return null
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(text) ? text + 'T00:00:00+08:00' : text
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

function beijingParts(date) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(date)
  const get = type => {
    const part = parts.find(item => item.type === type)
    return part ? part.value : ''
  }
  const hour = get('hour') === '24' ? '00' : get('hour')
  return { year: get('year'), month: get('month'), day: get('day'), hour, minute: get('minute') }
}

// 日期与时刻统一按北京时间展示，避免本机时区造成窗口与确认时刻偏移。
export function dateText(value) {
  const date = dateOf(value)
  if (!date) return '—'
  const parts = beijingParts(date)
  return `${parts.year}.${parts.month}.${parts.day}`
}

export function dateTimeText(value) {
  const date = dateOf(value)
  if (!date) return '—'
  const parts = beijingParts(date)
  return `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`
}

// 服务端以分存储金额（service.cjs 显示口径为 amountFen / 100），这里同样换算成元。
export function moneyText(fen) {
  if (fen === null || fen === undefined || fen === '') return '—'
  const amount = Number(fen)
  if (!Number.isFinite(amount)) return '—'
  return '¥ ' + (amount / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function statusTone(status) {
  return ({
    negotiating: 'primary',
    pending_review: 'warning',
    pending_effect: 'warning',
    completed: 'success',
    rejected: 'danger',
    broken: 'info',
    withdrawn: 'info'
  })[String(status || '')] || 'info'
}

function statusTextOf(status) {
  const value = String(status || '')
  if (!value) return ''
  return STATUS_TEXT[value] || WINDOW_STATE_TEXT[value] || value
}

// ---------------- 窗口 ----------------

export function windowViewOf(reply = {}) {
  const window = reply && reply.window ? reply.window : {}
  const state = WINDOW_STATE_TEXT[window.state] ? String(window.state) : 'unknown'
  const openFromText = dateTimeText(window.openFrom)
  const openToText = dateTimeText(window.openTo)
  const rangeText = window.openFrom || window.openTo
    ? `${openFromText} — ${openToText}`
    : '未设置开窗时间'
  const updatedText = dateTimeText(window.updatedAt)
  return {
    state,
    stateText: WINDOW_STATE_TEXT[state] || '窗口状态待核对',
    tone: ['open', 'scheduled', 'closed'].includes(state) ? state : 'unknown',
    // 窗口已配置（开放中／未开始／已关闭）后，页面不再展示“未配置转会窗口”引导卡：
    // 赛季与窗口状态由页头副标题给出，配置入口固定在右上角「窗口管理」，同一信息不重复占版面。
    configured: ['open', 'scheduled', 'closed'].includes(state),
    seasonKey: String(window.seasonKey || ''),
    seasonText: String(window.seasonKey || '') || '未配置赛季',
    rangeText,
    openFromText,
    openToText,
    updatedText: updatedText === '—' ? '' : updatedText,
    updatedBy: String(window.updatedBy || ''),
    version: Number(window.version || 0),
    canConfigure: Boolean(reply && reply.canConfigure),
    tournamentName: String((reply && reply.tournament && reply.tournament.name) || ''),
    notes: Array.isArray(reply && reply.notes) ? reply.notes.filter(Boolean) : []
  }
}

export function windowFormOf(window = {}) {
  return {
    seasonKey: String((window && window.seasonKey) || ''),
    openFrom: dateOf(window && window.openFrom),
    openTo: dateOf(window && window.openTo),
    version: Number((window && window.version) || 0)
  }
}

export function windowFormIssue(form = {}) {
  if (!String(form.seasonKey || '').trim()) return '请填写赛季标识'
  const from = dateOf(form.openFrom)
  const to = dateOf(form.openTo)
  if (!from || !to) return '请填写窗口起止时间'
  if (to <= from) return '结束时间须晚于开始时间'
  return ''
}

export function windowSavePayload(tournamentId, form = {}) {
  return {
    action: 'transferWindowSave',
    tournamentId: String(tournamentId || ''),
    expectedVersion: Number(form.version || 0),
    seasonKey: String(form.seasonKey || '').trim(),
    openFrom: dateOf(form.openFrom) ? dateOf(form.openFrom).toISOString() : '',
    openTo: dateOf(form.openTo) ? dateOf(form.openTo).toISOString() : ''
  }
}

// ---------------- 列表 ----------------

export function tabCountsOf(totals) {
  if (!totals) return { pending: null, reviewed: null, all: null }
  const pending = Number(totals.pending || 0)
  const reviewed = Number(totals.reviewed || 0)
  const negotiating = Number(totals.negotiating || 0)
  const freeSignings = Number(totals.freeSignings || 0)
  return {
    pending,
    // 已审核标签同时包含生效即完成的自由球员签约（服务端 tab=reviewed 的实际范围）。
    reviewed: reviewed + freeSignings,
    all: pending + negotiating + reviewed + freeSignings
  }
}

export function tabLabelOf(label, count) {
  return Number.isFinite(count) ? `${label}（${count}）` : label
}

export function rowOf(item = {}) {
  const recordKind = item.recordKind === 'free_agent' ? 'free_agent' : 'request'
  const freeAgent = recordKind === 'free_agent'
  const fromTeamName = String(item.fromTeamName || '') || (freeAgent ? '自由球员' : '球队待核对')
  const toTeamName = String(item.toTeamName || '') || '球队待核对'
  const statusText = String(item.statusText || '') || '状态待核对'
  const waitingText = String(item.waitingText || '')
  return {
    id: String(item.id || item._id || ''),
    recordKind,
    playerName: String(item.playerName || '') || '球员资料待核对',
    playerId: String(item.playerId || ''),
    fromTeamName,
    toTeamName,
    routeText: `${fromTeamName} → ${toTeamName}`,
    typeText: String(item.typeText || '') || '方式待核对',
    amountText: freeAgent ? '无转会费' : moneyText(item.amountFen),
    progressText: freeAgent ? '—' : (String(item.roundText || '') || '—'),
    status: String(item.status || ''),
    statusText,
    statusTone: statusTone(item.status),
    submittedText: dateTimeText(item.submittedAt || item.createTime),
    // waitingText 是“轮到谁处理”；与状态文案相同时不重复显示，避免同一行出现两次相同文字。
    waitingText: waitingText && waitingText !== statusText ? waitingText : '',
    canReview: !freeAgent && item.status === 'pending_review',
    actionText: !freeAgent && item.status === 'pending_review' ? '查看审核' : '查看记录'
  }
}

export function emptyTextOf(tab) {
  if (tab === 'pending') return '暂无待审核转会'
  if (tab === 'reviewed') return '暂无已审核转会记录'
  return '本赛事暂无转会记录'
}

export function dateRangePayloadOf(from, to) {
  const start = dateOf(from)
  const end = dateOf(to)
  return {
    dateFrom: start ? `${localDay(start)}T00:00:00+08:00` : undefined,
    dateTo: end ? `${localDay(end)}T23:59:59.999+08:00` : undefined
  }
}

function localDay(date) {
  const pad = number => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// ---------------- 条款与记录 ----------------

function loanExpiryText(terms = {}) {
  if (terms.expiryMode === 'match_end') return '至该场比赛结束'
  const start = dateOf(terms.startAt)
  const end = dateOf(terms.endAt)
  if (start && end) return `${dateText(start)} 至 ${dateText(end)}`
  if (start) return `自 ${dateText(start)} 起，结束时间待核定`
  if (end) return `至 ${dateText(end)}，开始时间待核定`
  return '结束时间待核定'
}

function termsSummaryOf(terms) {
  if (!terms) return '条款待核对'
  const parts = [String(terms.typeText || '') || '方式待核对']
  if (terms.loanKind) parts.push(loanExpiryText(terms))
  else if (Number(terms.contractMonths || 0)) parts.push(`${Number(terms.contractMonths)} 个月合同（起算日待核定）`)
  return parts.filter(Boolean).join(' · ')
}

export function termsRowsOf(terms = {}, { seasonKey = '' } = {}) {
  const rows = [
    { key: 'type', label: '方式', value: String(terms.typeText || '') || '方式待核对' },
    { key: 'amount', label: '金额', value: moneyText(terms.amountFen) }
  ]
  if (!terms.loanKind && Number(terms.contractMonths || 0)) {
    rows.push({ key: 'term', label: '合同期限', value: `${Number(terms.contractMonths)} 个月（起算日待核定）` })
  }
  if (terms.loanKind) {
    rows.push({ key: 'loan', label: '租借期限', value: loanExpiryText(terms) })
    if (terms.loanKind === 'single_match') {
      rows.push({ key: 'match', label: '租借比赛', value: terms.matchId ? `比赛编号 ${terms.matchId}` : '—' })
    }
  }
  const season = String(terms.targetSeasonKey || seasonKey || '')
  if (season) rows.push({ key: 'season', label: '赛季', value: season })
  rows.push({ key: 'settlement', label: '结算方式', value: '金额线下交付' })
  return rows
}

export function offersViewOf(offers) {
  const rows = Array.isArray(offers) ? offers : []
  return rows.map(offer => ({
    id: String(offer.id || ''),
    versionText: `v${Number(offer.version || 0)}`,
    byText: String(offer.byText || '') || (offer.by === 'to' ? '买方球队' : '原球队'),
    amountText: moneyText(offer && offer.terms ? offer.terms.amountFen : null),
    summaryText: termsSummaryOf(offer && offer.terms),
    timeText: dateTimeText(offer.createTime),
    noteText: String(offer.note || '') || '—'
  }))
}

export function eventsViewOf(events) {
  const rows = Array.isArray(events) ? events : []
  return rows.map(event => {
    const from = statusTextOf(event.fromStatus)
    const to = statusTextOf(event.toStatus)
    return {
      seq: Number(event.seq || 0),
      timeText: dateTimeText(event.at),
      actionText: EVENT_ACTION_TEXT[String(event.action || '')] || `其他操作（${String(event.action || '') || '未登记'}）`,
      actorText: ACTOR_SIDE_TEXT[String(event.actorSide || '')] || '系统',
      transitionText: from && to && from !== to ? `${from} → ${to}` : (from || to || '—'),
      detailText: eventDetailText(event.detail)
    }
  })
}

function eventDetailText(detail = {}) {
  const parts = []
  if (detail && detail.reason) parts.push(String(detail.reason))
  if (detail && detail.note) parts.push(String(detail.note))
  if (detail && detail.brokenReason) parts.push(`破裂原因：${String(detail.brokenReason)}`)
  if (detail && detail.seasonKey) parts.push(`赛季 ${String(detail.seasonKey)}`)
  const amount = Number(detail && detail.amountFen)
  if (Number.isFinite(amount) && amount > 0) parts.push(moneyText(amount))
  return parts.length ? parts.join('；') : '—'
}

export function reviewViewOf(review) {
  if (!review) return null
  return {
    decisionText: review.decision === 'approve' ? '审核通过' : review.decision === 'reject' ? '审核拒绝' : '审核结果待核对',
    tone: review.decision === 'approve' ? 'success' : 'danger',
    reviewerText: review.reviewerId ? `审核人编号 ${String(review.reviewerId)}` : '审核人待记录',
    atText: dateTimeText(review.reviewedAt),
    reasonText: String(review.reason || '') || '—',
    versionText: Number(review.offerVersion || 0) ? `确认条款 v${Number(review.offerVersion)}` : ''
  }
}

export function handoverViewOf(handover) {
  if (!handover) return null
  const done = handover.status === 'done'
  return {
    done,
    statusText: done ? '归属交接已完成' : '归属交接待核实',
    completedText: dateTimeText(handover.completedAt),
    contractText: handover.contractId ? `合同编号 ${String(handover.contractId)}` : '未生成合同',
    loanText: handover.loanId ? `租借编号 ${String(handover.loanId)}` : '',
    membershipText: handover.membershipId ? `成员关系 ${String(handover.membershipId)}` : ''
  }
}

export function valuationTextOf(snapshot) {
  if (!snapshot) return '—'
  if (snapshot.minor === true) return '不公开'
  const coverage = String(snapshot.coverage || '')
  if (coverage === 'unavailable' || snapshot.unavailable === true) return '暂不可读'
  const money = Number(snapshot.money)
  if (coverage === 'pending' || snapshot.money === null || snapshot.money === undefined || !Number.isFinite(money)) return '待评估'
  return '¥ ' + money.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function valuationNoteOf(snapshot) {
  if (!snapshot) return '发起时未记录参考身价'
  if (snapshot.minor === true) return '青少年身价沿用既有可见规则，不展示货币金额'
  if (String(snapshot.coverage || '') === 'unavailable' || snapshot.unavailable === true) return '发起时估值读取失败，未补零，保留不可读状态'
  const money = Number(snapshot.money)
  if (String(snapshot.coverage || '') === 'pending' || !Number.isFinite(money)) return '尚未测算，不以 0 代替'
  return '参考身价，不代表成交价'
}

function policyValueOf(field, value) {
  const table = POLICY_TEXT[field] || {}
  return table[String(value || '')] || (String(value || '') || '—')
}

export function requestRecordView(reply = {}) {
  const request = reply.request || {}
  const agreedVersion = Number(request.agreedOfferVersion || 0)
  const expectedVersion = Number(reply.expectedOfferVersion || 0)
  const versionsMatched = agreedVersion > 0 && agreedVersion === expectedVersion
  // 审核只认服务端明确给出的 agreedOffer；currentOffer 仅在缺少共同条款时用于展示当前报价。
  const agreedOffer = reply.agreedOffer || null
  const terms = (agreedOffer || reply.currentOffer || {}).terms || {}
  const seasonKey = String(request.seasonKey || '')
  // 赛季已在“球员与双方球队”上方展示，条款区不再重复同值；目标赛季不同（如跨赛季租借）时保留。
  const termsRows = termsRowsOf(terms, { seasonKey })
    .filter(row => !(row.key === 'season' && seasonKey && row.value === seasonKey))
  const pending = request.status === 'pending_review'
  return {
    kind: 'request',
    id: String(request.id || ''),
    playerName: String(request.playerName || '') || '球员资料待核对',
    playerId: String(request.playerId || ''),
    fromTeamName: String(request.fromTeamName || '') || '球队待核对',
    toTeamName: String(request.toTeamName || '') || '球队待核对',
    routeText: `${String(request.fromTeamName || '') || '球队待核对'} → ${String(request.toTeamName || '') || '球队待核对'}`,
    typeText: String(request.typeText || '') || '方式待核对',
    amountText: (termsRows.find(row => row.key === 'amount') || {}).value || '—',
    status: String(request.status || ''),
    statusText: String(request.statusText || '') || '状态待核对',
    statusTone: statusTone(request.status),
    seasonText: String(request.seasonKey || '') || '—',
    agreedVersion,
    expectedVersion,
    versionsMatched,
    agreedOfferMissing: !agreedOffer,
    canReview: Boolean(reply.canReview) && pending && versionsMatched && Boolean(agreedOffer),
    reviewBlockedText: !pending
      ? '该转会单已处理，当前为只读记录'
      : (!agreedOffer ? '最终条款版本缺失，请刷新后重试' : (versionsMatched ? '' : '双方确认版本与当前条款不一致，请读取最新条款后再审核')),
    termsNote: !pending ? '' : (agreedOffer ? '' : '以下为当前报价条款，缺少双方共同确认版本，不能审核'),
    termsRows,
    confirmations: [
      { key: 'seller', label: '原球队确认', value: dateTimeText(request.sellerConfirmedAt) },
      { key: 'buyer', label: '买方球队确认', value: dateTimeText(request.buyerConfirmedAt) },
      { key: 'agreed', label: '共同条款版本', value: agreedVersion ? `v${agreedVersion}` : '—' },
      { key: 'current', label: '当前条款版本', value: expectedVersion ? `v${expectedVersion}` : '—' }
    ],
    offers: offersViewOf(reply.offers),
    events: eventsViewOf(reply.events),
    review: reviewViewOf(request.review),
    handover: handoverViewOf(request.handover),
    freeAgent: null,
    notes: [
      '金额线下交付，平台不收款、不校验付款凭证',
      '审核通过后服务端在同一事务内完成归属交接；名单、赛果与历史不随转会改写',
      '转会不需要球员同意，本页不显示薪资或付款状态'
    ]
  }
}

export function freeAgentRecordView(reply = {}) {
  const record = reply.record || {}
  return {
    kind: 'free_agent',
    id: String(record.id || ''),
    playerName: String(record.playerName || '') || '球员资料待核对',
    playerId: String(record.playerId || ''),
    fromTeamName: '自由球员',
    toTeamName: String(record.toTeamName || '') || '球队待核对',
    routeText: `自由球员 → ${String(record.toTeamName || '') || '球队待核对'}`,
    typeText: '自由球员签约',
    amountText: '无转会费',
    status: String(record.status || ''),
    statusText: String(record.statusText || '') || '状态待核对',
    statusTone: statusTone(record.status),
    seasonText: String(record.seasonKey || '') || '—',
    completedText: dateTimeText(record.completedAt),
    contractText: record.contractId ? `合同编号 ${String(record.contractId)}` : '合同编号待核对',
    valuationText: valuationTextOf(record.valuationSnapshot),
    valuationNote: valuationNoteOf(record.valuationSnapshot),
    policyRows: [
      { key: 'scope', label: '参赛范围', value: policyValueOf('eventScopePolicy', record.eventScopePolicy) },
      { key: 'window', label: '窗口要求', value: policyValueOf('freeAgentWindowPolicy', record.freeAgentWindowPolicy) },
      { key: 'review', label: '审核规则', value: policyValueOf('reviewPolicy', record.reviewPolicy) }
    ],
    termsRows: [
      { key: 'type', label: '方式', value: '自由球员签约' },
      { key: 'amount', label: '转会费', value: '无转会费' },
      { key: 'settlement', label: '结算方式', value: '不涉及金额交付' }
    ],
    termsNote: '',
    confirmations: [],
    offers: [],
    events: [],
    review: null,
    handover: null,
    agreedVersion: 0,
    expectedVersion: 0,
    versionsMatched: true,
    canReview: false,
    reviewBlockedText: '自由球员签约当前生效即完成，不进入主办审核',
    freeAgent: true,
    notes: [
      '自由球员签约仅面向本赛事名单之外的球员',
      '审核规则待决（Q02），当前不生成审核节点，也不补造审批记录'
    ]
  }
}

export function recordViewOf(reply = {}) {
  return reply && reply.recordKind === 'free_agent' ? freeAgentRecordView(reply) : requestRecordView(reply)
}

export function reviewSummaryTextOf(view = {}) {
  return [
    `球员：${view.playerName || '—'}`,
    `球队：${view.routeText || '—'}`,
    `方式：${view.typeText || '—'}`,
    `金额：${view.amountText || '—'}`,
    `条款版本：${view.agreedVersion ? 'v' + view.agreedVersion : '—'}`
  ].join('\n')
}

export function errorTextOf(error) {
  const code = String((error && error.code) || '')
  const message = String((error && error.message) || '').trim()
  return TRANSFER_ERROR_TEXT[code] || message || '操作未完成，请重试'
}

export function isForbiddenError(error) {
  return String((error && error.code) || '') === 'DATA_FORBIDDEN'
}
