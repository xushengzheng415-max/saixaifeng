'use strict'
/**
 * 赛事转会中心小程序页（market / player）展示投影回归。
 *
 * 覆盖用户 2026-10-26 的入口决定：转会中心开在赛事详情（本地赛事 → 具体赛事 → 转会中心）。
 * 本测试只校验页面与服务端返回之间的展示口径，不连接云端、不写入数据：
 * - 市场只由服务端给出的合同状态决定自由球员徽标，不按姓名或球队猜测；
 * - 青少年一律“不公开”，未测算“待评估”，不用 0 冒充；
 * - 窗口四态文案固定，读不到状态时明确“暂不可读”，不伪造开放；
 * - 球员页合同期限未核定时提示不推断自由身；
 * - 页面输出不含手机号、证件、报价或审核字段。
 */
const assert = require('node:assert/strict')
const market = require('../miniprogram/pages/tournament/transfer/market/market-model.js')
const playerModel = require('../miniprogram/pages/tournament/transfer/player/player-model.js')

function main() {
  // 1. 在队球员：球队、位置与编号来自服务端字段，不做姓名合并。
  const contracted = market.rowOf({
    id: 'p1', name: '张伟', position: '前锋', playerCode: 'SXF-001', teamId: 't1', teamName: '甲队',
    contractState: 'contracted', contractStateText: '在队', loanState: 'none',
    valuation: { coverage: 'complete', money: 680, tier: 'A', minor: false }
  })
  assert.equal(contracted.playerId, 'p1')
  assert.equal(contracted.name, '张伟')
  assert.equal(contracted.hasBadge, false)
  assert.equal(contracted.metaText, '前锋 · 编号 SXF-001')
  assert.equal(contracted.teamText, '甲队')
  assert.equal(contracted.valueText, '¥680')
  assert.equal(contracted.valueClass, 'tc-value tc-value-ready')
  assert.equal(contracted.hasNote, false)

  // 2. 自由球员：徽标只来自 contractState=free；租借中单独标注。
  const free = market.rowOf({ id: 'p2', name: '李小明', position: '中场', contractState: 'free', valuation: { coverage: 'pending', money: null } })
  assert.equal(free.hasBadge, true)
  assert.equal(free.badgeText, '自由球员')
  assert.equal(free.teamText, '暂无所属球队')
  assert.equal(free.valueText, '待评估')
  const loaned = market.rowOf({ id: 'p3', name: '王强', teamName: '乙队', contractState: 'contracted', loanState: 'loaned', valuation: { coverage: 'complete', money: 0 } })
  assert.equal(loaned.teamText, '乙队 · 租借中')
  assert.equal(loaned.valueText, '¥0', 'A真实测算为零分与待评估必须分开')

  // 3. 青少年与合同冲突：不公开金额，冲突提示交给页面而不是自行修正数据。
  const minor = market.rowOf({ id: 'p4', name: '小将', contractState: 'contracted', teamName: '丙队', valuation: { coverage: 'complete', money: 900, tier: 'A', minor: true } })
  assert.equal(minor.valueText, '不公开')
  assert.equal(minor.valueClass, 'tc-value tc-value-hidden')
  assert.ok(!JSON.stringify(minor).includes('900'), '青少年金额不得进入页面数据')
  const conflict = market.rowOf({ id: 'p5', name: '丁一', contractState: 'contracted', teamName: '丁队', contractConflict: true, valuation: null })
  assert.equal(conflict.hasNote, true)
  assert.equal(conflict.valueText, '待评估')
  // 位置缺失不冒充具体位置。
  assert.equal(market.rowOf({ id: 'p6', name: '戊二', contractState: 'free' }).metaText, '位置待登记')

  // 4. 窗口四态与未知态文案固定。
  assert.deepEqual(market.windowViewOf({ window: { state: 'open', openTo: '2026-11-30T00:00:00.000Z' } }).windowText, '转会窗口开放中')
  assert.equal(market.windowViewOf({ window: { state: 'scheduled', openFrom: '2026-11-01T00:00:00.000Z' } }).windowNote, '开始于 11月1日')
  assert.equal(market.windowViewOf({ window: { state: 'closed', openTo: '2026-10-20T00:00:00.000Z' } }).windowClass, 'tc-window tc-window-closed')
  assert.equal(market.windowViewOf({ window: { state: 'not_configured' } }).windowText, '本赛事未配置转会窗口')
  assert.equal(market.windowViewOf({ window: { state: 'other' } }).windowText, '窗口状态待核对')
  assert.equal(market.WINDOW_UNKNOWN.windowText, '窗口状态暂不可读')
  assert.equal(market.WINDOW_UNKNOWN.windowClass, 'tc-window tc-window-unknown')

  // 5. 空态与筛选：关键词无结果与“资料未登记”分开，筛选按钮由 key 决定高亮。
  assert.equal(market.emptyTextOf('张', 'ready'), '没有匹配的球员，换个关键词试试')
  assert.equal(market.emptyTextOf('', 'ready'), '本赛事暂无公开球员资料')
  assert.equal(market.emptyTextOf('', 'not_recorded'), '球员资料尚未登记')
  assert.deepEqual(market.chipsOf('').map(chip => chip.chipClass), ['tc-chip tc-chip-active', 'tc-chip', 'tc-chip'])
  assert.deepEqual(market.chipsOf('free').map(chip => chip.chipClass), ['tc-chip', 'tc-chip', 'tc-chip tc-chip-active'])

  // 6. 球员资料页：合同与效力状态只翻译服务端枚举。
  const confirmed = playerModel.playerViewOf({
    player: { id: 'p1', name: '张伟', playerCode: 'SXF-001', position: '前锋', teamName: '甲队', effectiveState: 'contracted' },
    contract: { state: 'active', termStatus: 'confirmed', validTo: '2026-12-31' },
    valuation: { coverage: 'complete', money: 680, tier: 'A', computedAt: '2026-10-20T00:00:00.000Z' },
    negotiation: { status: 'pending_review' },
    cooldown: { active: true, untilText: '10月27日 18:00' },
    notes: ['市场资料只含公开字段']
  })
  assert.equal(confirmed.hasPlayer, true)
  assert.equal(confirmed.hasBadge, false)
  assert.equal(confirmed.metaText, '前锋 · 编号 SXF-001')
  assert.equal(confirmed.teamName, '甲队')
  assert.equal(confirmed.effectiveText, '在队')
  assert.equal(confirmed.contractText, '合同有效')
  assert.equal(confirmed.contractNote, '合同至 2026-12-31')
  assert.equal(confirmed.tierText, 'A 段')
  assert.equal(confirmed.hasNegotiation, true)
  assert.equal(confirmed.negotiationText, '待主办审核')
  assert.equal(confirmed.hasCooldown, true)
  assert.match(confirmed.cooldownText, /10月27日 18:00/)
  assert.deepEqual(confirmed.notes, ['市场资料只含公开字段'])

  // 7. 期限未核定：不推断自由身；自由球员徽标仍由服务端 contract.state 决定。
  const pendingTerm = playerModel.playerViewOf({ player: { id: 'p2', name: '李小明', teamName: '乙队', effectiveState: 'loaned' }, contract: { state: 'pending_term', termStatus: 'pending_confirmation', termPendingRule: 'Q08' }, valuation: { minor: true, coverage: 'complete', money: 900, tier: 'A' } })
  assert.equal(pendingTerm.contractText, '合同日期待补齐')
  assert.match(pendingTerm.contractNote, /Q08/)
  assert.match(pendingTerm.contractNote, /不推断自由身/)
  assert.equal(pendingTerm.effectiveText, '租借中')
  assert.equal(pendingTerm.valueText, '不公开')
  assert.equal(pendingTerm.hasTier, false)
  const freePlayer = playerModel.playerViewOf({ player: { id: 'p3', name: '王强', effectiveState: 'contracted' }, contract: { state: 'free' }, valuation: null })
  assert.equal(freePlayer.hasBadge, true)
  assert.equal(freePlayer.teamName, '暂无所属球队')
  assert.equal(freePlayer.valueText, '待评估')
  const conflictPlayer = playerModel.playerViewOf({ player: { id: 'p4', name: '丁一', effectiveState: 'conflict' }, contract: { state: 'contract_conflict' } })
  assert.equal(conflictPlayer.contractText, '合同记录待核对')
  assert.equal(conflictPlayer.effectiveText, '效力关系待核对')

  // 8. 无联系方式或报价字段泄漏。
  const payload = JSON.stringify([contracted, free, loaned, minor, conflict, confirmed, pendingTerm, freePlayer, conflictPlayer])
  for (const field of ['mobile', 'phone', 'phoneNumber', 'idCard', 'idNumber', 'openId', 'unionId', 'offer', 'amountFen']) {
    assert.ok(!payload.includes('"' + field + '"'), `Page model must not expose ${field}`)
  }

  console.log('PASS: 转会中心页展示口径（自由球员徽标只认服务端、青少年与待评估分开、窗口四态、空态区分、合同期限未核定不推断自由身、无联系方式泄漏）')
}

if (require.main === module) main()
module.exports = { main }
