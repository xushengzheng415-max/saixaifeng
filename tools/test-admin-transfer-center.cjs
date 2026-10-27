'use strict'
/**
 * 主办方 PC 转会中心（PC01 列表 / PC02 审核抽屉 / PC03 窗口配置 / PC04 只读记录）回归。
 *
 * 只校验展示投影与静态接线，不连接云端、不写入数据：
 * - 方式与状态文案取自服务端 typeText／statusText，页面不另写判定；
 * - 自由签约没有转会费，不显示 ¥0；青少年身价不公开，未测算不以 0 代替；
 * - 审核按钮只在“待审核 + 双方确认版本与当前条款一致”时出现，冲突先回读；
 * - 窗口四态与表单校验固定，保存入参用服务端 expectedVersion 防覆盖；
 * - 路由、侧栏入口与赛事子账号权限映射必须同时存在，避免有页无入口或有入口无权限。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const ROOT = path.resolve(__dirname, '..')
const WEB = path.join(ROOT, 'web-admin-vue')
const PAGE_PATH = path.join(WEB, 'src/views/tournament/TournamentTransferCenter.vue')
const VIEW_PATH = path.join(WEB, 'src/utils/transferCenterView.js')
const ROUTER_PATH = path.join(WEB, 'src/router/index.js')
const LAYOUT_PATH = path.join(WEB, 'src/views/layout/LayoutView.vue')
const RIGHTS_PATH = path.join(WEB, 'src/utils/tournamentStaffRights.js')

function read(file) {
  return fs.readFileSync(file, 'utf8')
}

function assertStatic(pageText) {
  // 1. 页面必须走 webLoginApi relay（零 SDK），只读球队下拉，不直接写库。
  assert.ok(pageText.includes("import { callFunction, queryList } from '../../utils/cloud'"), 'page must use cloud.js relay helpers')
  assert.ok(!pageText.includes('@cloudbase/js-sdk'), 'page must not import CloudBase web SDK')
  assert.ok(!/db\.collection|\.collection\(/.test(pageText), 'page must not touch collections directly')
  for (const action of ['transferWindowGet', 'transferAdminRequests', 'transferAdminRecord', 'transferReview']) {
    assert.ok(pageText.includes(`'${action}'`), `page must call ${action} through dataCenter`)
  }
  assert.ok(pageText.includes("callFunction('dataCenter'"), 'page must call the dataCenter function only')

  // 2. 审核必须带服务端条款版本，拒绝理由由页面先做 2—200 字校验。
  assert.ok(pageText.includes('expectedOfferVersion: detail.value.agreedVersion'), 'review must send agreedOfferVersion')
  assert.ok(pageText.includes('note.length < 2 || note.length > 200'), 'reject reason length gate must stay client-side first')
  assert.ok(pageText.includes('refreshAfterReviewFailure'), 'failed review must re-read the server record')

  // 3. 窗口配置使用服务端版本与 STALE 处理，不在前端猜测最新值。
  assert.ok(pageText.includes('windowSavePayload(tournamentId.value, windowForm.value)'), 'window save must use shared payload builder')
  assert.ok(pageText.includes("'TRANSFER_WINDOW_STALE'"), 'window save must handle stale version')

  // 4. 抽屉支持 #header／#footer 插槽，操作按钮固定底部。
  assert.ok(pageText.includes('<template #footer>'), 'drawer footer slot required')
  assert.ok(pageText.includes('<template #header>'), 'drawer header slot required')
  assert.ok(pageText.includes('class="transfer-drawer"'), 'drawer class required for layout overrides')

  // 5. 筛选说明诚实反映后端范围：自由签约不参与球队／方式／日期筛选。
  assert.ok(pageText.includes('球员编号（精确匹配）'), 'player filter must state exact-match only')
  assert.ok(pageText.includes('自由球员签约记录在已审核与全部标签中始终显示'), 'free-agent filter caveat required')

  const pkg = require(path.join(WEB, 'node_modules/@vue/compiler-sfc/package.json'))
  assert.ok(pkg.version, 'compiler-sfc must be installed for the build')
  const { parse } = require(path.join(WEB, 'node_modules/@vue/compiler-sfc'))
  const parsed = parse(pageText, { filename: PAGE_PATH })
  assert.deepEqual(parsed.errors, [], 'page SFC must parse without errors')
  assert.ok(parsed.descriptor.scriptSetup, 'page must use script setup')
  assert.ok(parsed.descriptor.template, 'page must have a template')

  // 6. 路由、侧栏与赛事子账号权限三处必须同向。
  const routerText = read(ROUTER_PATH)
  assert.match(routerText, /path: '\/tournaments\/:id\/transfer'/, 'route path must be registered')
  assert.match(routerText, /name: 'TournamentTransferCenter'/, 'route name must be registered')
  assert.ok(routerText.includes("title: '转会中心'"), 'route title must be 转会中心')

  const layoutText = read(LAYOUT_PATH)
  assert.ok(layoutText.includes("tournamentWorkspacePath('/transfer')"), 'sidebar entry must point at the transfer workspace')
  assert.ok(layoutText.includes("label: '转会中心'"), 'sidebar label must exist')

  const rightsText = read(RIGHTS_PATH)
  assert.ok(rightsText.includes("key: 'event.transfer'"), 'staff right key must exist')
  assert.ok(rightsText.includes("suffix: '/transfer'"), 'staff right must map to /transfer')

  // 6. 共享子账号侧栏必须按已授予权限过滤：否则入口可见、点击后被守卫退回账号管理。
  assert.ok(layoutText.includes('visibleStaffNavItems(organizerNavItems.value)'), 'sidebar must filter by granted staff rights')
  assert.ok(layoutText.includes("sxfStaffPermissions"), 'sidebar filter must read granted rights from session')

  // 7. 子账号授权校验与中转校验的权限清单必须认 event.transfer，否则机构主账号无法授予“转会中心”。
  const staffPolicyText = read(path.join(ROOT, 'cloudfunctions/webLoginApi/staffPolicy.cjs'))
  const staffAccessPolicyText = read(path.join(ROOT, 'cloudfunctions/tournamentStaffAccess/policy.cjs'))
  for (const [name, text] of [['webLoginApi', staffPolicyText], ['tournamentStaffAccess', staffAccessPolicyText]]) {
    assert.ok(text.includes("'event.transfer'"), `${name} SIDEBAR_RIGHTS must include event.transfer`)
  }
}

async function main() {
  const view = await import(pathToFileURL(VIEW_PATH).href)
  const rights = await import(pathToFileURL(RIGHTS_PATH).href)

  // 1. 金额以分存储（/100 换算成元），显示两位小数；缺失显示“—”，不用 0 冒充。
  assert.equal(view.moneyText(null), '—')
  assert.equal(view.moneyText(undefined), '—')
  assert.equal(view.moneyText(''), '—')
  assert.equal(view.moneyText('abc'), '—')
  assert.equal(view.moneyText(0), '¥ 0.00')
  assert.equal(view.moneyText(1234), '¥ 12.34')
  assert.equal(view.moneyText(12000000), '¥ 120,000.00')

  // 2. 列表标签计数与服务端 tab 范围一致：已审核含自由签约，全部为四项合计。
  assert.deepEqual(view.tabCountsOf(null), { pending: null, reviewed: null, all: null })
  assert.deepEqual(
    view.tabCountsOf({ pending: 2, reviewed: 5, negotiating: 1, freeSignings: 3 }),
    { pending: 2, reviewed: 8, all: 11 }
  )
  assert.equal(view.tabLabelOf('待审核', 2), '待审核（2）')
  assert.equal(view.tabLabelOf('待审核', null), '待审核')

  // 3. 列表行：待审核显示“查看审核”，自由签约显示“无转会费”。
  const pendingRow = view.rowOf({
    id: 'r1', recordKind: 'request', playerId: 'p1', playerName: '张伟',
    fromTeamName: '甲队', toTeamName: '乙队', typeText: '正式转会', amountFen: 12000000,
    roundText: '第 2/3 轮', status: 'pending_review', statusText: '待主办审核',
    waitingText: '待主办审核', submittedAt: '2026-10-26T03:00:00+08:00'
  })
  assert.equal(pendingRow.routeText, '甲队 → 乙队')
  assert.equal(pendingRow.amountText, '¥ 120,000.00')
  assert.equal(pendingRow.progressText, '第 2/3 轮')
  assert.equal(pendingRow.statusTone, 'warning')
  assert.equal(pendingRow.submittedText, '2026.10.26 03:00')
  assert.equal(pendingRow.canReview, true)
  assert.equal(pendingRow.actionText, '查看审核')
  // waitingText 与状态相同不再重复显示；不同时才作为补充提示。
  assert.equal(pendingRow.waitingText, '')
  assert.equal(view.rowOf({
    id: 'r2', recordKind: 'request', playerName: '王强', fromTeamName: '甲队', toTeamName: '乙队',
    typeText: '租借', amountFen: 0, status: 'pending_review', statusText: '待主办审核', waitingText: '等待原球队确认'
  }).waitingText, '等待原球队确认')

  const freeRow = view.rowOf({
    id: 'f1', recordKind: 'free_agent', playerId: 'p9', playerName: '李小明',
    fromTeamName: '自由球员', toTeamName: '丙队', type: 'free_agent', typeText: '自由球员签约',
    amountFen: 0, status: 'completed', statusText: '已完成'
  })
  assert.equal(freeRow.routeText, '自由球员 → 丙队')
  assert.equal(freeRow.amountText, '无转会费')
  assert.equal(freeRow.progressText, '—')
  assert.equal(freeRow.statusTone, 'success')
  assert.equal(freeRow.canReview, false)
  assert.equal(freeRow.actionText, '查看记录')
  assert.ok(!freeRow.amountText.includes('¥ 0'), 'free agent must not show ¥0')

  const emptyRow = view.rowOf({})
  assert.equal(emptyRow.playerName, '球员资料待核对')
  assert.equal(emptyRow.routeText, '球队待核对 → 球队待核对')
  assert.equal(emptyRow.typeText, '方式待核对')
  assert.equal(emptyRow.statusText, '状态待核对')
  assert.equal(emptyRow.submittedText, '—')
  assert.equal(emptyRow.canReview, false)

  assert.equal(view.emptyTextOf('pending'), '暂无待审核转会')
  assert.equal(view.emptyTextOf('reviewed'), '暂无已审核转会记录')
  assert.equal(view.emptyTextOf('all'), '本赛事暂无转会记录')

  // 4. 提交日期筛选补北京时间的当天边界，不下发本地时区偏移。
  assert.deepEqual(view.dateRangePayloadOf(null, null), { dateFrom: undefined, dateTo: undefined })
  const range = view.dateRangePayloadOf(new Date(2026, 9, 1), new Date(2026, 9, 8))
  assert.equal(range.dateFrom, '2026-10-01T00:00:00+08:00')
  assert.equal(range.dateTo, '2026-10-08T23:59:59.999+08:00')

  // 5. 窗口四态：未配置不伪造时间，未知态单独提示，notes 去掉空项。
  const openWindow = view.windowViewOf({
    tournament: { id: 't1', name: '秋季联赛' },
    window: {
      state: 'open', seasonKey: '2026秋季', openFrom: '2026-11-01T00:00:00+08:00',
      openTo: '2026-11-30T23:59:00+08:00', version: 3, updatedAt: '2026-10-20T10:00:00+08:00', updatedBy: 'u-admin'
    },
    canConfigure: true,
    notes: ['赛季标识规则待决（Q03）', '']
  })
  assert.equal(openWindow.state, 'open')
  assert.equal(openWindow.stateText, '窗口开放中')
  assert.equal(openWindow.tone, 'open')
  assert.equal(openWindow.rangeText, '2026.11.01 00:00 — 2026.11.30 23:59')
  assert.equal(openWindow.updatedText, '2026.10.20 10:00')
  assert.equal(openWindow.tournamentName, '秋季联赛')
  assert.equal(openWindow.canConfigure, true)
  assert.deepEqual(openWindow.notes, ['赛季标识规则待决（Q03）'])

  const notConfigured = view.windowViewOf({ window: { state: 'not_configured' } })
  assert.equal(notConfigured.stateText, '未配置转会窗口')
  assert.equal(notConfigured.rangeText, '未设置开窗时间')
  assert.equal(notConfigured.seasonText, '未配置赛季')
  assert.equal(notConfigured.tone, 'unknown')
  assert.equal(notConfigured.updatedText, '')
  assert.equal(notConfigured.canConfigure, false)

  assert.equal(view.windowViewOf({ window: { state: 'scheduled' } }).stateText, '窗口未开始')
  assert.equal(view.windowViewOf({ window: { state: 'closed' } }).stateText, '窗口已关闭')
  const unknownWindow = view.windowViewOf({ window: { state: 'other' } })
  assert.equal(unknownWindow.state, 'unknown')
  assert.equal(unknownWindow.stateText, '窗口状态待核对')
  assert.equal(unknownWindow.tone, 'unknown')

  // 6. 窗口表单：季赛标识必填、结束时间晚于开始，保存带服务端版本防覆盖。
  const form = view.windowFormOf({
    seasonKey: '2026秋季', openFrom: '2026-11-01T00:00:00+08:00',
    openTo: '2026-11-30T23:59:00+08:00', version: '3'
  })
  assert.equal(form.version, 3)
  assert.ok(form.openFrom instanceof Date)
  assert.equal(view.windowFormIssue(form), '')
  assert.equal(view.windowFormIssue({ seasonKey: '', openFrom: null, openTo: null }), '请填写赛季标识')
  assert.equal(view.windowFormIssue({ seasonKey: '2026秋季', openFrom: null, openTo: null }), '请填写窗口起止时间')
  assert.equal(view.windowFormIssue({
    seasonKey: '2026秋季',
    openFrom: '2026-11-30T00:00:00+08:00',
    openTo: '2026-11-01T00:00:00+08:00'
  }), '结束时间须晚于开始时间')
  const payload = view.windowSavePayload('t1', { seasonKey: '  2026秋季  ', openFrom: form.openFrom, openTo: form.openTo, version: 3 })
  assert.deepEqual(payload, {
    action: 'transferWindowSave',
    tournamentId: 't1',
    expectedVersion: 3,
    seasonKey: '2026秋季',
    openFrom: new Date('2026-11-01T00:00:00+08:00').toISOString(),
    openTo: new Date('2026-11-30T23:59:00+08:00').toISOString()
  })
  assert.equal(view.windowSavePayload('t1', { seasonKey: 'x', openFrom: form.openFrom, openTo: form.openTo }).expectedVersion, 0, 'first save must send version 0')

  // 7. 条款：合同起算日未定不编造，金额线下交付；租借按单场或日期区间展示。
  const permanent = view.termsRowsOf({ type: 'permanent', typeText: '正式转会', amountFen: 12000000, contractMonths: 12, targetSeasonKey: '2026秋季' })
  assert.deepEqual(permanent.map(row => row.key), ['type', 'amount', 'term', 'season', 'settlement'])
  assert.equal(permanent.find(row => row.key === 'term').value, '12 个月（起算日待核定）')
  assert.equal(permanent.find(row => row.key === 'settlement').value, '金额线下交付')
  assert.equal(permanent.find(row => row.key === 'season').value, '2026秋季')

  const singleMatch = view.termsRowsOf({
    type: 'loan', typeText: '租借', amountFen: 0, loanKind: 'single_match', matchId: 'm-1',
    startAt: '2026-11-01T00:00:00+08:00', endAt: '2026-11-02T00:00:00+08:00', expiryMode: 'fixed'
  })
  assert.deepEqual(singleMatch.map(row => row.key), ['type', 'amount', 'loan', 'match', 'settlement'])
  assert.equal(singleMatch.find(row => row.key === 'loan').value, '2026.11.01 至 2026.11.02')
  assert.equal(singleMatch.find(row => row.key === 'match').value, '比赛编号 m-1')
  assert.equal(
    view.termsRowsOf({ typeText: '租借', loanKind: 'single_match', expiryMode: 'match_end' }).find(row => row.key === 'loan').value,
    '至该场比赛结束'
  )

  // 8. 报价与日志只翻译服务端动作枚举，金额与时刻统一格式化。
  const offers = view.offersViewOf([{
    id: 'o1', version: 2, by: 'to', terms: { typeText: '正式转会', amountFen: 12000000, contractMonths: 12 },
    createTime: '2026-10-26T03:00:00+08:00', note: ''
  }])
  assert.equal(offers.length, 1)
  assert.equal(offers[0].versionText, 'v2')
  assert.equal(offers[0].byText, '买方球队')
  assert.equal(offers[0].amountText, '¥ 120,000.00')
  assert.equal(offers[0].summaryText, '正式转会 · 12 个月合同（起算日待核定）')
  assert.equal(offers[0].timeText, '2026.10.26 03:00')
  assert.equal(offers[0].noteText, '—')
  assert.deepEqual(view.offersViewOf(null), [])

  const events = view.eventsViewOf([{
    seq: 2, at: '2026-10-26T03:00:00+08:00', action: 'offer_accept', actorSide: 'to',
    fromStatus: 'negotiating', toStatus: 'pending_review', detail: { amountFen: 12000000, note: '同意' }
  }])
  assert.equal(events[0].actionText, '接受报价')
  assert.equal(events[0].actorText, '买方球队')
  assert.equal(events[0].transitionText, '谈判中 → 待主办审核')
  assert.equal(events[0].detailText, '同意；¥ 120,000.00')
  const unknownEvent = view.eventsViewOf([{ seq: 1, action: 'custom_action', detail: { brokenReason: '条件未达成' } }])[0]
  assert.equal(unknownEvent.actionText, '其他操作（custom_action）')
  assert.equal(unknownEvent.actorText, '系统')
  assert.equal(unknownEvent.transitionText, '—')
  assert.equal(unknownEvent.detailText, '破裂原因：条件未达成')

  // 9. 审核资格：只在待审核且双方确认版本等于当前条款版本时出现。
  const baseReply = {
    request: {
      id: 'r1', playerId: 'p1', playerName: '张伟', fromTeamName: '甲队', toTeamName: '乙队',
      typeText: '正式转会', status: 'pending_review', statusText: '待主办审核', agreedOfferVersion: 3,
      sellerConfirmedAt: '2026-10-25T20:00:00+08:00', buyerConfirmedAt: '2026-10-26T09:00:00+08:00', seasonKey: '2026秋季'
    },
    currentOffer: { id: 'o3', version: 3, terms: { typeText: '正式转会', amountFen: 12000000, contractMonths: 12 } },
    agreedOffer: { id: 'o3', version: 3, terms: { typeText: '正式转会', amountFen: 12000000, contractMonths: 12 } },
    offers: [{ id: 'o3', version: 3, by: 'from', terms: { typeText: '正式转会', amountFen: 12000000, contractMonths: 12 } }],
    events: [{ seq: 3, at: '2026-10-26T09:00:00+08:00', action: 'offer_accept', actorSide: 'from', fromStatus: 'negotiating', toStatus: 'pending_review' }],
    canReview: true,
    expectedOfferVersion: 3
  }
  const record = view.requestRecordView(baseReply)
  assert.equal(record.kind, 'request')
  assert.equal(record.versionsMatched, true)
  assert.equal(record.canReview, true)
  assert.equal(record.reviewBlockedText, '')
  assert.equal(record.termsNote, '')
  assert.equal(record.amountText, '¥ 120,000.00')
  assert.ok(!record.termsRows.some(row => row.key === 'season'), 'same season must not repeat in terms')
  assert.equal(record.seasonText, '2026秋季')
  assert.deepEqual(record.confirmations.map(row => row.value), ['2026.10.25 20:00', '2026.10.26 09:00', 'v3', 'v3'])
  assert.equal(record.offers.length, 1)
  assert.equal(record.events.length, 1)

  const staleVersion = view.requestRecordView({ ...baseReply, expectedOfferVersion: 4 })
  assert.equal(staleVersion.versionsMatched, false)
  assert.equal(staleVersion.canReview, false)
  assert.equal(staleVersion.reviewBlockedText, '双方确认版本与当前条款不一致，请读取最新条款后再审核')

  const missingAgreed = view.requestRecordView({ ...baseReply, agreedOffer: null })
  assert.equal(missingAgreed.canReview, false)
  assert.equal(missingAgreed.agreedOfferMissing, true)
  assert.equal(missingAgreed.reviewBlockedText, '最终条款版本缺失，请刷新后重试')
  assert.match(missingAgreed.termsNote, /缺少双方共同确认版本/)
  assert.equal(missingAgreed.amountText, '¥ 120,000.00', 'current offer still displays, but cannot be approved')

  const finished = view.requestRecordView({
    ...baseReply,
    request: { ...baseReply.request, status: 'completed', statusText: '已完成', agreedOfferVersion: 0 },
    canReview: false
  })
  assert.equal(finished.canReview, false)
  assert.equal(finished.reviewBlockedText, '该转会单已处理，当前为只读记录')

  const reviewed = view.requestRecordView({
    ...baseReply,
    request: {
      ...baseReply.request, status: 'rejected', statusText: '审核未通过',
      review: { decision: 'reject', reason: '材料不足', reviewerId: 'u9', reviewedAt: '2026-10-26T10:00:00+08:00', offerVersion: 3 },
      handover: { status: 'done', completedAt: '2026-10-26T10:00:00+08:00', contractId: 'c1', membershipId: 'm1' }
    },
    canReview: false
  })
  assert.equal(reviewed.review.decisionText, '审核拒绝')
  assert.equal(reviewed.review.tone, 'danger')
  assert.equal(reviewed.review.reviewerText, '审核人编号 u9')
  assert.equal(reviewed.review.reasonText, '材料不足')
  assert.equal(reviewed.review.versionText, '确认条款 v3')
  assert.equal(reviewed.handover.done, true)
  assert.equal(reviewed.handover.statusText, '归属交接已完成')
  assert.equal(reviewed.handover.contractText, '合同编号 c1')
  assert.equal(reviewed.handover.loanText, '')

  // 10. 自由签约记录：无转会费、不进入审核，身价按统一规则不公开／待评估。
  const freeRecord = view.freeAgentRecordView({
    recordKind: 'free_agent',
    record: {
      id: 'f1', playerId: 'p9', playerName: '小将', toTeamName: '丙队', status: 'completed', statusText: '已完成',
      seasonKey: '2026秋季', completedAt: '2026-10-20T10:00:00+08:00', contractId: 'c9',
      eventScopePolicy: 'outside_event_only', freeAgentWindowPolicy: 'conservative_requires_open_window',
      reviewPolicy: 'pending_q02', valuationSnapshot: { minor: true, coverage: 'complete', money: 900 }
    }
  })
  assert.equal(freeRecord.kind, 'free_agent')
  assert.equal(freeRecord.fromTeamName, '自由球员')
  assert.equal(freeRecord.routeText, '自由球员 → 丙队')
  assert.equal(freeRecord.amountText, '无转会费')
  assert.equal(freeRecord.valuationText, '不公开')
  assert.ok(!JSON.stringify(freeRecord).includes('900'), 'minor valuation must not leak into the page model')
  assert.deepEqual(freeRecord.policyRows.map(row => row.value), ['仅限赛事外球员', '需有开放窗口（保守实现）', '审核规则待决（Q02）'])
  assert.equal(freeRecord.termsRows.find(row => row.key === 'settlement').value, '不涉及金额交付')
  assert.equal(freeRecord.canReview, false)
  assert.equal(freeRecord.reviewBlockedText, '自由球员签约当前生效即完成，不进入主办审核')
  assert.ok(freeRecord.notes.some(note => note.includes('Q02')), 'pending policy must stay explicit')

  assert.equal(view.valuationTextOf(null), '—')
  assert.equal(view.valuationTextOf({ coverage: 'pending', money: null }), '待评估')
  assert.equal(view.valuationTextOf({ coverage: 'unavailable' }), '暂不可读')
  assert.equal(view.valuationTextOf({ coverage: 'complete', money: 680 }), '¥ 680')

  assert.equal(view.recordViewOf({ recordKind: 'free_agent', record: {} }).kind, 'free_agent')
  assert.equal(view.recordViewOf({ request: {} }).kind, 'request')

  // 11. 确认文案含关键条款，错误码映射保留可执行提示。
  const summary = view.reviewSummaryTextOf(record)
  assert.match(summary, /球员：张伟/)
  assert.match(summary, /球队：甲队 → 乙队/)
  assert.match(summary, /条款版本：v3/)
  assert.equal(view.errorTextOf({ code: 'TRANSFER_WINDOW_STALE' }), '窗口设置已更新，请刷新后再保存')
  assert.equal(view.errorTextOf({ code: 'TRANSFER_VERSION_CONFLICT' }), '条款已更新，请刷新后再审核')
  assert.equal(view.errorTextOf({ code: 'TRANSFER_STATE_CONFLICT' }), '该转会单已处理或状态已变化，请刷新后查看')
  assert.equal(view.errorTextOf({ code: 'TRANSFER_REVIEW_CONFLICT' }), '审核人与买卖任一方球队存在管理关系，不能审核本笔转会')
  assert.equal(view.errorTextOf({ code: 'TRANSFER_REVIEW_REASON_REQUIRED' }), '拒绝须填写 2 至 200 字的理由')
  assert.equal(view.errorTextOf({ message: '网络连接失败' }), '网络连接失败')
  assert.equal(view.errorTextOf({}), '操作未完成，请重试')
  assert.equal(view.errorTextOf({ code: 'DATA_FORBIDDEN' }), '无转会管理权限')
  assert.equal(view.isForbiddenError({ code: 'DATA_FORBIDDEN' }), true)
  assert.equal(view.isForbiddenError({ code: 'TRANSFER_STATE_CONFLICT' }), false)

  // 12. 赛事子账号权限映射：/transfer 只放 event.transfer，不被其他赛事权限顺带放行。
  assert.equal(rights.sidebarRightForRoute('/tournaments/t1/transfer'), 'event.transfer')
  assert.equal(rights.sidebarRightForRoute('/tournaments/t1/transfer/x'), 'event.transfer')
  assert.equal(rights.sidebarRightForRoute('/tournaments/t1/teams'), 'event.teams')
  assert.equal(rights.sidebarRightForRoute('/tournaments/t1/transfer-audit'), '')
  const transferRight = rights.TOURNAMENT_SIDEBAR_RIGHTS.find(item => item.key === 'event.transfer')
  assert.ok(transferRight, 'sidebar right list must expose event.transfer')
  assert.equal(transferRight.suffix, '/transfer')
  assert.equal(transferRight.label, '转会中心')

  assertStatic(read(PAGE_PATH))

  console.log('PASS: 主办方 PC 转会中心（列表/审核/窗口/记录投影、版本一致性、自由签约不显示 ¥0、青少年不公开、路由与 event.transfer 接线、零 SDK）')
}

if (require.main === module) {
  main().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}

module.exports = { main }
