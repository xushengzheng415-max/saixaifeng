// pages/tournament/transfer/market/market-model.js
// 转会市场的展示投影：把服务端返回映射成页面字段，并统一身价与窗口文案口径。
// 页面不在这里推导合同、自由身或可报价能力，只做展示格式化。
var STATE_CHIPS = [
  { key: '', label: '全部球员' },
  { key: 'contracted', label: '在队球员' },
  { key: 'free', label: '自由球员' }
]

var WINDOW_TEXT = {
  open: '转会窗口开放中',
  scheduled: '转会窗口未开始',
  closed: '转会窗口已关闭',
  not_configured: '本赛事未配置转会窗口'
}

function pad(value) { return value < 10 ? '0' + value : String(value) }

function dateTextOf(value) {
  if (!value) return ''
  var date = value instanceof Date ? value : new Date(value)
  if (isNaN(date.getTime())) return ''
  return (date.getMonth() + 1) + '月' + date.getDate() + '日'
}

function moneyTextOf(value) {
  if (!Number.isFinite(Number(value))) return ''
  return '¥' + Number(value).toLocaleString('zh-CN')
}

// 与发现页身价展示同口径：青少年不公开、未测算待评估，不用 0 冒充。
function valuationTextOf(valuation) {
  if (!valuation) return { valueText: '待评估', hasValue: false, isHidden: false }
  if (valuation.minor === true) return { valueText: '不公开', hasValue: false, isHidden: true }
  if (String(valuation.coverage || '') !== 'complete' || !Number.isFinite(Number(valuation.money))) {
    return { valueText: '待评估', hasValue: false, isHidden: false }
  }
  return { valueText: moneyTextOf(valuation.money), hasValue: true, isHidden: false }
}

function rowOf(item) {
  var isFree = String(item.contractState || '') === 'free'
  var value = valuationTextOf(item.valuation)
  var conflict = item.contractConflict === true
  var loaned = String(item.loanState || '') === 'loaned'
  var metaText = item.position ? String(item.position) : '位置待登记'
  if (item.playerCode) metaText += ' · 编号 ' + String(item.playerCode)
  var teamText = isFree ? '暂无所属球队' : (item.teamName ? String(item.teamName) : '球队待核对')
  if (!isFree && loaned) teamText += ' · 租借中'
  return {
    key: String(item.id || '') + '-' + String(item.name || ''),
    playerId: String(item.id || ''),
    name: item.name ? String(item.name) : '未命名球员',
    hasBadge: isFree,
    badgeText: '自由球员',
    metaText: metaText,
    teamText: teamText,
    hasNote: conflict,
    noteText: conflict ? '合同记录存在冲突，需主办核对' : '',
    valueText: value.valueText,
    valueClass: value.hasValue ? 'tc-value tc-value-ready' : (value.isHidden ? 'tc-value tc-value-hidden' : 'tc-value tc-value-pending')
  }
}

function windowViewOf(result) {
  var windowInfo = (result || {}).window || {}
  var state = String(windowInfo.state || 'not_configured')
  var note = ''
  if (state === 'scheduled') note = '开始于 ' + dateTextOf(windowInfo.openFrom)
  if (state === 'open') note = '截至 ' + dateTextOf(windowInfo.openTo)
  if (state === 'closed') note = '关闭于 ' + dateTextOf(windowInfo.openTo)
  return {
    hasWindow: true,
    windowText: WINDOW_TEXT[state] || '窗口状态待核对',
    windowNote: note,
    windowClass: state === 'open' ? 'tc-window tc-window-open' : (state === 'closed' ? 'tc-window tc-window-closed' : 'tc-window')
  }
}

var WINDOW_UNKNOWN = { hasWindow: true, windowText: '窗口状态暂不可读', windowNote: '', windowClass: 'tc-window tc-window-unknown' }

function emptyTextOf(keyword, marketState) {
  if (keyword) return '没有匹配的球员，换个关键词试试'
  if (String(marketState || 'ready') === 'ready') return '本赛事暂无公开球员资料'
  return '球员资料尚未登记'
}

function chipsOf(activeKey) {
  return STATE_CHIPS.map(function (chip) {
    return { key: chip.key, label: chip.label, chipClass: chip.key === String(activeKey || '') ? 'tc-chip tc-chip-active' : 'tc-chip' }
  })
}

module.exports = { STATE_CHIPS, WINDOW_TEXT, WINDOW_UNKNOWN, dateTextOf, moneyTextOf, valuationTextOf, rowOf, windowViewOf, emptyTextOf, chipsOf }
