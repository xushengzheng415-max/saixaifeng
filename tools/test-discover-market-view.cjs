'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const model = require('../miniprogram/pages/discover/discover-model')

const payload = {
  updatedAt: '2026-10-26T02:28:52.617Z',
  playerMeasuredCount: 1,
  top: [{ playerId: 'p1', playerName: '真实测算球员', moneyText: '¥260', total: 999 }],
  players: [{ playerId: 'p1', playerName: '真实测算球员', moneyState: 'measured', moneyText: '¥260', trend: [260] }]
}
async function main () {
  const view = model.formatShowcase(payload)
  assert.equal(view.topItems[0].moneyText, '¥260', '沿服务端金额展示，不按指数另算')
  assert.equal(view.players[0].hasTrend, false, '单次快照不能伪造走势')
  assert.deepEqual(view.scopeChips.map(x => x.key), ['event', 'age'], '只保留真实可用的赛事与年龄段范围，时间未接入不再摆无效入口')
  assert.equal(model.formatShowcase({}).hasTop, false)
  assert.equal(model.formatShowcase({}).hasPlayers, false, '缺数据不能补造0元球员')
  const youth = model.formatShowcase({ players: [{ moneyState: 'hidden', moneyText: '¥999', trend: [] }] })
  assert.equal(youth.players[0].moneyText, '身价不公开')
  const pending = model.formatShowcase({ players: [{ moneyState: 'not_measured', money: null }] })
  assert.equal(pending.players[0].moneyText, '身价未测算')
  const scoped = model.formatShowcase({ ...payload, scope: { mode: 'tournament', tournamentName: '真实赛事', tournamentId: 't1', ageGroupText: '成人组' } })
  assert.equal(scoped.ageGroupText, '成人组')

  // 焦点由服务端单列，动态列表只放其余记录：同一条转会不能出现两次
  const withTransfers = model.formatShowcase({
    focus: { playerName: '焦点球员', fromTeamName: '甲队', toTeamName: '乙队', typeText: '正式转会', priceState: 'public', priceText: '¥100', completedAt: '2026-10-20T02:00:00.000Z' },
    transfers: [{ playerName: '第二位球员', fromTeamName: '丙队', toTeamName: '丁队', typeText: '租借', priceState: 'public', priceText: '¥100', completedAt: '2026-10-18T02:00:00.000Z' }]
  })
  assert.deepEqual(withTransfers.dynamicItems.map(x => x.playerName), ['第二位球员'], '焦点不在列表里重复出现')
  assert.equal(withTransfers.focus.visible, true)
  assert.equal(withTransfers.hasDynamic, true)
  assert.equal(withTransfers.dynamicItems[0].priceClass, 'trade-price trade-price-open', '列表金额沿用服务端公开状态')
  assert.equal(withTransfers.dynamicItems[0].routeText, '丙队 → 丁队', '去向合成一行')
  assert.equal(withTransfers.dynamicItems[0].hasPos, false, '缺位置时不显示“位置待记录”占位行')
  assert.ok(!('hasFromLogo' in withTransfers.dynamicItems[0]), '列表不再渲染双列队徽')
  const focusOnly = model.formatShowcase({
    focus: { playerName: '焦点球员', fromTeamName: '甲队', toTeamName: '乙队', completedAt: '2026-10-20T02:00:00.000Z' }
  })
  assert.equal(focusOnly.dynamicItems.length, 0)
  assert.equal(focusOnly.hasDynamic, true, '只有焦点也算有动态，不显示空态')
  assert.equal(model.formatShowcase({}).hasDynamic, false)
  assert.equal(model.formatShowcase({}).dynamicEmptyText, '暂无公开转会，完成后在此官宣')

  let definition, resolveRequest, requested, calls = 0
  const wx = { cloud: { callFunction: args => { calls++; requested = args.data; return new Promise(resolve => { resolveRequest = resolve }) } } }
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../miniprogram/pages/discover/discover.js'), 'utf8'), {
    Page: d => { definition = d }, wx, console,
    require: name => name === './discover-model' ? model : {}, setTimeout, clearTimeout
  })
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), _transferSeq: 0 }
  page.setData = function (patch, cb) { Object.assign(this.data, patch); if (cb) cb.call(this) }
  page.setTabState = function (tab, state) { this.lastState = state }
  const request = page.loadTransfer('init')
  resolveRequest({ result: { success: true, data: payload } })
  await request
  assert.equal(page.data.transferRankRows[0].moneyText, '¥260')
  assert.equal(page.data.transferRankTab, 'top')
  assert.equal(page.data.showTransferRankEmpty, false)
  assert.equal(page.data.transferRankFootText, '全平台 · 最新测算 · 参考身价不等于成交价')
  assert.equal(page.lastState.state, 'ready')
  const failed = page.loadTransfer('refresh')
  resolveRequest({ result: { success: false, code: 'DATA_READ_FAILED', error: '暂不可用' } })
  await failed
  assert.equal(page.lastState.state, 'error')
  assert.equal(page.data.transferRankRows[0].moneyText, '¥260', '刷新失败保留已知数据并显示错误')
  const older = page.loadTransfer('refresh'); const oldResolve = resolveRequest
  page._transferLoading = false // 模拟赛事范围变更作废旧请求。
  const newer = page.loadTransfer('scope'); const newResolve = resolveRequest
  newResolve({ result: { success: true, data: payload } }); await newer
  oldResolve({ result: { success: true, data: { ...payload, top: [{ moneyText: '¥999' }] } } }); await older
  assert.equal(page.data.transferRankRows[0].moneyText, '¥260', '过期响应不能覆盖当前范围')
  // 上升最快与最新身价共用一张卡：没有可比的两次快照时切过去显示空态，不伪造涨幅
  page.onTransferRankTab({ currentTarget: { dataset: { tab: 'rising' } } })
  assert.equal(page.data.transferRankTab, 'rising')
  assert.equal(page.data.showTransferRankEmpty, true)
  assert.equal(page.data.transferRankEmptyText, '暂无可比的上一次身价')
  assert.equal(page.data.transferRankFootText, '对比上一次快照 · 参考身价不等于成交价')
  page.onTransferRankTab({ currentTarget: { dataset: { tab: 'top' } } })
  assert.equal(page.data.transferRankRows[0].moneyText, '¥260')
  page.onTransferSearchInput({ detail: { value: '不存在的球员' } })
  assert.equal(page.data.hasTransferPlayers, false)
  assert.equal(page.data.transferPlayerEndText, '本页匹配 0 位球员')
  page.onTransferSearchInput({ detail: { value: '真实测算' } })
  assert.equal(page.data.transferPlayers.length, 1)
  assert.equal(page.data.transferPlayers[0].moneyText, '¥260')

  const paged = { ...payload, playerPool: 'public_roster', playerTotal: 322, playerPoolVersion: 'pool-v1', playerHasMore: true, nextPlayerCursor: 'cursor-1' }
  const firstPage = page.loadTransfer('refresh')
  resolveRequest({ result: { success: true, data: paged } }); await firstPage
  assert.equal(page.data.transferMoreVisible, true)
  const morePage = page.loadTransfer('more'); const beforeDoubleClick = calls
  await page.loadTransfer('more'); assert.equal(calls, beforeDoubleClick, '重复触底不重复发请求')
  assert.equal(requested.playerCursor, 'cursor-1')
  resolveRequest({ result: { success: true, data: { ...paged, nextPlayerCursor: 'cursor-2', players: [payload.players[0], { playerId: 'p2', playerName: '未测算球员', moneyState: 'not_measured' }] } } }); await morePage
  assert.equal(page.data.transferPlayers.length, 2, '追加分页按playerId去重')
  assert.equal(page.data.transferPlayers[1].moneyText, '身价未测算')
  const errorPage = page.loadTransfer('more')
  resolveRequest({ result: { success: false, code: 'DATA_VIEW_CHANGED' } }); await errorPage
  assert.equal(page.data.transferMoreText, '刷新列表')
  assert.equal(page.data.transferPlayers.length, 2, '续页失败不清空旧页')
  const refresh = page.onTransferLoadMore(); assert.equal(requested.playerCursor, '', '名单变更从首游标刷新')
  resolveRequest({ result: { success: true, data: { ...paged, playerHasMore: false, nextPlayerCursor: '' } } }); await refresh
  assert.equal(page.data.transferMoreVisible, false)
  page.resetCaches()
  assert.equal(page._transferCursor, '')
  assert.equal(page._transferHasMore, false)
  assert.equal(page.data.transferMoreVisible, false)

  const wxml = fs.readFileSync(path.resolve(__dirname, '../miniprogram/pages/discover/discover.wxml'), 'utf8')
  assert(!wxml.includes('valuation-overview'), '不能擅自添加大身价卡代替原型官宣')
  assert(wxml.includes('transferDynamicEmpty'), '没有成交时保留一个转会动态空态')
  assert(wxml.includes('rank-card'), '身价榜合成单卡')
  assert(!wxml.includes('rank-panels'), '不再保留双栏榜单')
  assert(!wxml.includes('query-shortcuts'), '移除球队等无效快捷筛选')
  assert(!wxml.includes('transfer-note-text'), '移除重复的长脚注')
  assert(!wxml.includes('trade-route'), '转会记录不再用双列队徽+队名挤成四栏')
  assert(wxml.includes('trade-move-text'), '去向合并成一行展示')
  for (const match of wxml.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
    assert(!/[?\[\]()=<>]/.test(match[1]), 'WXML复杂表达式: ' + match[1])
  }
  console.log('PASS: 真实身价状态、单卡榜单切换、动态合并、搜索、分页追加去重/防重、名单变化刷新、续页失败保留、切号清游标、迟到响应及WXML限制')
}
main().catch(e => { console.error(e); process.exitCode = 1 })
