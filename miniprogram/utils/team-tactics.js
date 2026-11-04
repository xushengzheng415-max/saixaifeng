var layout = require('./lineup-layout')
var rules = require('./formation-rules')

var MATCH_SIZE_OPTIONS = [
  { size: 5, label: '5 人制', hint: '小场快速轮转' },
  { size: 7, label: '7 人制', hint: '边路与过渡' },
  { size: 8, label: '8 人制', hint: '中场层次' },
  { size: 9, label: '9 人制', hint: '整体推进' },
  { size: 11, label: '11 人制', hint: '全场体系' }
]
var MAX_SUBSTITUTES = 15
var DIRECTIONS = [
  { id: 'attack', label: '我方进攻', short: '进攻', hint: '我方压上进攻，对方收缩防守', arrow: '→ 我方进攻方向' },
  { id: 'defend', label: '我方防守', short: '防守', hint: '我方收缩防守，对方压上进攻', arrow: '← 对方进攻方向' }
]
var MAX_OPPONENT_NUMBER = 99
// 横版球场：我方球门在左、对方球门在右；点位以屏幕百分比保存，可自由拖拽。
var POINT_MIN_X = 4
var POINT_MAX_X = 96
var POINT_MIN_Y = 10
var POINT_MAX_Y = 90

function text(value) {
  return String(value == null ? '' : value).trim()
}

function formationOptions(size) {
  return layout.formationsFor(size).map(function(row) {
    return { id: row.id, label: row.id, name: row.name || row.id }
  })
}

function formationName(size, formation) {
  var info = rules.formationFor(size, formation)
  return info ? (info.name || info.id) : text(formation)
}

function normalizeDirection(value) {
  return text(value) === 'defend' ? 'defend' : 'attack'
}

function directionLabel(value) {
  var id = normalizeDirection(value)
  var row = DIRECTIONS.filter(function(item) { return item.id === id })[0]
  return row ? row.label : '我方进攻'
}

function directionRow(value) {
  var id = normalizeDirection(value)
  return DIRECTIONS.filter(function(item) { return item.id === id })[0] || DIRECTIONS[0]
}

// 对方只记号码：去掉非数字，去前导 0，超过两位或为 0 视为无效，返回空串。
function normalizeOpponentNumber(value) {
  var digits = String(value == null ? '' : value).replace(/\D/g, '')
  if (!digits) return ''
  digits = digits.replace(/^0+/, '')
  if (!digits || digits.length > 2) return ''
  var number = Number(digits)
  if (!(number >= 1 && number <= MAX_OPPONENT_NUMBER)) return ''
  return String(number)
}

function round1(value) {
  return Math.round(Number(value) * 10) / 10
}

// 拖拽点位：限制在球场内，保留 1 位小数，非法值返回 null。
function normalizePoint(value, min, max) {
  var number = Number(value)
  if (!isFinite(number)) return null
  if (number < min) number = min
  if (number > max) number = max
  return round1(number)
}

function clampX(value) {
  var point = normalizePoint(value, POINT_MIN_X, POINT_MAX_X)
  return point == null ? POINT_MIN_X : point
}

function clampY(value) {
  var point = normalizePoint(value, POINT_MIN_Y, POINT_MAX_Y)
  return point == null ? POINT_MIN_Y : point
}

function slotStyle(x, y) {
  return 'left:' + clampX(x).toFixed(2) + '%;top:' + clampY(y).toFixed(2) + '%;'
}

// 阵型默认点位：depth 为距本方球门深度，lateral 为横向；对方整体镜像到右侧球门。
function defaultPoint(depth, lateral, mirror) {
  var rawX = 8 + Number(depth || 0) * 0.84
  var rawY = 8 + Number(lateral || 0) * 0.84
  return {
    x: round1(mirror ? (92 - Number(depth || 0) * 0.84) : rawX),
    y: round1(mirror ? (92 - Number(lateral || 0) * 0.84) : rawY)
  }
}

function boardSlots(size, formation) {
  var info = rules.formationFor(size, formation)
  if (!info) return { ours: [], rivals: [] }
  return {
    ours: info.positions.map(function(item) {
      var point = defaultPoint(item.x, item.y, false)
      return { role: item.role, label: item.label || item.role, x: point.x, y: point.y, style: slotStyle(point.x, point.y) }
    }),
    rivals: info.positions.map(function(item) {
      var point = defaultPoint(item.x, item.y, true)
      return { role: item.role, label: item.label || item.role, x: point.x, y: point.y, style: slotStyle(point.x, point.y) }
    })
  }
}

function pointFromRow(item, fallback) {
  var x = normalizePoint(item && item.x, POINT_MIN_X, POINT_MAX_X)
  var y = normalizePoint(item && item.y, POINT_MIN_Y, POINT_MAX_Y)
  return {
    x: x == null ? fallback.x : x,
    y: y == null ? fallback.y : y
  }
}

function slotsFor(size, formation, positions) {
  var board = boardSlots(size, formation)
  var byRole = {}
  ;(positions || []).forEach(function(item) {
    var role = text(item && item.role)
    var playerId = text(item && (item.playerId || item.id || item._id))
    if (role && playerId) byRole[role] = item
  })
  return board.ours.map(function(slot) {
    var row = byRole[slot.role]
    var point = pointFromRow(row, slot)
    return { id: 'slot-' + slot.role, role: slot.role, label: slot.label, x: point.x, y: point.y, slotStyle: slotStyle(point.x, point.y), playerId: row ? text(row.playerId || row.id || row._id) : '' }
  })
}

function rivalSlotsFor(size, formation, opponentPositions) {
  var board = boardSlots(size, formation)
  var byRole = {}
  ;(opponentPositions || []).forEach(function(item) {
    var role = text(item && item.role)
    var number = normalizeOpponentNumber(item && item.number)
    if (role && number) byRole[role] = item
  })
  return board.rivals.map(function(slot) {
    var row = byRole[slot.role]
    var point = pointFromRow(row, slot)
    return { id: 'rival-' + slot.role, role: slot.role, label: slot.label, x: point.x, y: point.y, slotStyle: slotStyle(point.x, point.y), number: row ? normalizeOpponentNumber(row.number) : '' }
  })
}

function preserveSlots(size, formation, current) {
  var board = boardSlots(size, formation)
  var byRole = {}
  ;(current || []).forEach(function(slot) {
    if (slot && slot.role) byRole[slot.role] = slot
  })
  return board.ours.map(function(slot) {
    var row = byRole[slot.role]
    var point = row ? pointFromRow(row, slot) : slot
    return {
      id: 'slot-' + slot.role,
      role: slot.role,
      label: slot.label,
      x: point.x,
      y: point.y,
      slotStyle: slotStyle(point.x, point.y),
      playerId: text(row && row.playerId)
    }
  })
}

function preserveRivalSlots(size, formation, current) {
  var board = boardSlots(size, formation)
  var byRole = {}
  ;(current || []).forEach(function(slot) {
    if (slot && slot.role) byRole[slot.role] = slot
  })
  return board.rivals.map(function(slot) {
    var row = byRole[slot.role]
    var point = row ? pointFromRow(row, slot) : slot
    return {
      id: 'rival-' + slot.role,
      role: slot.role,
      label: slot.label,
      x: point.x,
      y: point.y,
      slotStyle: slotStyle(point.x, point.y),
      number: row ? normalizeOpponentNumber(row.number) : ''
    }
  })
}

function assignStarter(slots, index, playerId) {
  var target = Number(index)
  if (!slots[target] || !text(playerId)) return slots
  slots.forEach(function(slot) {
    if (text(slot.playerId) === text(playerId)) slot.playerId = ''
  })
  slots[target].playerId = text(playerId)
  return slots
}

function validateOpponentRows(opponentSlots) {
  var rows = opponentSlots || []
  var numbers = []
  var invalid = false
  var duplicated = false
  rows.forEach(function(slot) {
    var raw = text(slot && slot.number)
    if (!raw) return
    var number = normalizeOpponentNumber(raw)
    if (!number) {
      invalid = true
      return
    }
    if (numbers.indexOf(number) >= 0) duplicated = true
    numbers.push(number)
  })
  if (invalid) return { ok: false, message: '对方号码只能填 1—' + MAX_OPPONENT_NUMBER + ' 的整数' }
  if (duplicated) return { ok: false, message: '对方号码不能重复，请改成不同号码' }
  return { ok: true, numbers: numbers }
}

function validateDraft(draft, players) {
  var name = text(draft && draft.name)
  if (!name) return { ok: false, message: '请填写战术名称' }
  if (name.length > 24) return { ok: false, message: '战术名称最多 24 个字' }
  var size = Number(draft && draft.matchSize)
  if ([5, 7, 8, 9, 11].indexOf(size) < 0) return { ok: false, message: '请选择比赛人数' }
  var formation = text(draft && draft.formation)
  var positions = (draft.slots || []).map(function(slot) {
    return { role: text(slot && slot.role), playerId: text(slot && slot.playerId), x: clampX(slot && slot.x), y: clampY(slot && slot.y) }
  })
  if (positions.some(function(item) { return !item.playerId })) return { ok: false, message: '请排满我方位置' }
  var rosterIds = (players || []).map(function(player) { return text(player.id || player._id) }).filter(Boolean)
  var validated
  try {
    validated = rules.validate(size, { formation: formation, positions: positions }, rosterIds)
  } catch (error) {
    return { ok: false, message: error.message || '我方位置与球员不一致，请重新排阵' }
  }
  var opponentCheck = validateOpponentRows(draft.opponentSlots)
  if (!opponentCheck.ok) return opponentCheck
  var substituteIds = (draft.substituteIds || []).map(text).filter(Boolean)
  substituteIds = substituteIds.filter(function(id, index, rows) { return rows.indexOf(id) === index })
  if (substituteIds.length > MAX_SUBSTITUTES) return { ok: false, message: '替补最多 ' + MAX_SUBSTITUTES + ' 人' }
  if (substituteIds.some(function(id) { return rosterIds.indexOf(id) < 0 })) return { ok: false, message: '替补包含不在本队的球员' }
  if (positions.some(function(item) { return substituteIds.indexOf(item.playerId) >= 0 })) return { ok: false, message: '我方球员不能同时放在替补席' }
  var opponentPositions = (draft.opponentSlots || []).map(function(slot) {
    return { role: text(slot && slot.role), number: normalizeOpponentNumber(slot && slot.number), x: clampX(slot && slot.x), y: clampY(slot && slot.y) }
  }).filter(function(item) { return item.role && item.number })
  return {
    ok: true,
    message: opponentPositions.length ? '双方已就位，可以保存' : '我方已排满，可以保存',
    formation: validated.formation,
    positions: positions,
    substituteIds: substituteIds,
    opponentPositions: opponentPositions,
    direction: normalizeDirection(draft && draft.direction),
    opponentCount: opponentPositions.length
  }
}

module.exports = {
  MATCH_SIZE_OPTIONS: MATCH_SIZE_OPTIONS,
  MAX_SUBSTITUTES: MAX_SUBSTITUTES,
  DIRECTIONS: DIRECTIONS,
  MAX_OPPONENT_NUMBER: MAX_OPPONENT_NUMBER,
  POINT_MIN_X: POINT_MIN_X,
  POINT_MAX_X: POINT_MAX_X,
  POINT_MIN_Y: POINT_MIN_Y,
  POINT_MAX_Y: POINT_MAX_Y,
  formationOptions: formationOptions,
  formationName: formationName,
  normalizeDirection: normalizeDirection,
  directionLabel: directionLabel,
  directionRow: directionRow,
  normalizeOpponentNumber: normalizeOpponentNumber,
  normalizePoint: normalizePoint,
  clampX: clampX,
  clampY: clampY,
  slotStyle: slotStyle,
  defaultPoint: defaultPoint,
  boardSlots: boardSlots,
  slotsFor: slotsFor,
  rivalSlotsFor: rivalSlotsFor,
  preserveSlots: preserveSlots,
  preserveRivalSlots: preserveRivalSlots,
  assignStarter: assignStarter,
  validateOpponentRows: validateOpponentRows,
  validateDraft: validateDraft
}
