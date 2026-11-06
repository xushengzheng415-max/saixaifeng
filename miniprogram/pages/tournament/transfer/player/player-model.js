// pages/tournament/transfer/player/player-model.js
// 球员资料的展示投影：合同、效力、身价与谈判状态全部由服务端给出，
// 这里只做文案与展示字段，不推断自由身、不计算身价、不判定能否报价。
var EFFECTIVE_TEXT = { contracted: '在队', loaned: '租借中', conflict: '效力关系待核对' }
var CONTRACT_TEXT = {
  active: '合同有效',
  scheduled: '合同待生效',
  expired: '合同已到期',
  ended: '合同已结束',
  renewed: '已续约',
  pending_term: '合同日期待补齐',
  contract_conflict: '合同记录待核对',
  none: '无合同记录'
}
var NEGOTIATION_TEXT = { negotiating: '谈判中', pending_review: '待主办审核', pending_effect: '待生效' }

function pad(value) { return value < 10 ? '0' + value : String(value) }

function dateTextOf(value) {
  if (!value) return ''
  var date = value instanceof Date ? value : new Date(value)
  if (isNaN(date.getTime())) return ''
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
}

function moneyTextOf(value) {
  if (!Number.isFinite(Number(value))) return ''
  return '¥' + Number(value).toLocaleString('zh-CN')
}

function valuationTextOf(valuation) {
  if (!valuation) return { valueText: '待评估', hasValue: false, isHidden: false, tierText: '', computedText: '' }
  if (valuation.minor === true) return { valueText: '不公开', hasValue: false, isHidden: true, tierText: '', computedText: '' }
  var computedText = valuation.computedAt ? '测算于 ' + dateTextOf(valuation.computedAt) : ''
  if (String(valuation.coverage || '') !== 'complete' || !Number.isFinite(Number(valuation.money))) {
    return { valueText: '待评估', hasValue: false, isHidden: false, tierText: '', computedText: computedText }
  }
  return {
    valueText: moneyTextOf(valuation.money),
    hasValue: true,
    isHidden: false,
    tierText: valuation.tier ? String(valuation.tier) + ' 段' : '',
    computedText: computedText
  }
}

function playerViewOf(result) {
  var player = (result || {}).player || {}
  var contract = (result || {}).contract || {}
  var value = valuationTextOf((result || {}).valuation)
  var negotiation = (result || {}).negotiation || null
  var cooldown = (result || {}).cooldown || {}
  var isFree = String(contract.state || '') === 'free'
  var metaParts = []
  if (player.position) metaParts.push(String(player.position))
  if (player.playerCode) metaParts.push('编号 ' + String(player.playerCode))
  var contractNote = ''
  if (String(contract.termStatus || '') === 'confirmed' && contract.validTo) contractNote = '合同至 ' + dateTextOf(contract.validTo)
  else if (contract.termPendingRule) contractNote = '合同期限未核定（' + String(contract.termPendingRule) + '），不推断自由身'
  var notes = ((result || {}).notes || []).filter(function (text) { return Boolean(text) })
  return {
    hasPlayer: true,
    name: player.name ? String(player.name) : '未命名球员',
    hasBadge: isFree,
    badgeText: '自由球员',
    metaText: metaParts.join(' · ') || '资料待补充',
    teamName: player.teamName ? String(player.teamName) : (isFree ? '暂无所属球队' : '球队待核对'),
    effectiveText: EFFECTIVE_TEXT[String(player.effectiveState || '')] || '效力状态待核对',
    contractText: CONTRACT_TEXT[String(contract.state || '')] || '合同状态待核对',
    hasContractNote: Boolean(contractNote),
    contractNote: contractNote,
    valueText: value.valueText,
    valueClass: value.hasValue ? 'tp-value tp-value-ready' : (value.isHidden ? 'tp-value tp-value-hidden' : 'tp-value tp-value-pending'),
    hasTier: Boolean(value.tierText),
    tierText: value.tierText,
    computedText: value.computedText,
    hasComputed: Boolean(value.computedText),
    hasNegotiation: Boolean(negotiation),
    negotiationText: negotiation ? (NEGOTIATION_TEXT[String(negotiation.status || '')] || String(negotiation.statusText || '谈判中')) : '',
    hasCooldown: cooldown.active === true,
    cooldownText: cooldown.active === true ? ('本队在 ' + String(cooldown.untilText || '') + ' 前不能再次申请该球员') : '',
    notes: notes,
    hasNotes: notes.length > 0
  }
}

module.exports = { EFFECTIVE_TEXT, CONTRACT_TEXT, NEGOTIATION_TEXT, dateTextOf, moneyTextOf, valuationTextOf, playerViewOf }
