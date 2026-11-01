'use strict'
/**
 * 赛小蜂足球世界 · 卡世界玩法引擎
 *
 * 约束（与 docs/PRODUCT_RULES 的现行玩法一致）：
 * 1. 签约按「同城 + 名册顺序 + 游标」确定性取人，不使用随机数发放。
 * 2. 轻对战按同一确定性键产出同一结果，会员/付费不改变胜负权重。
 * 3. 本文件是纯函数集合：不读 storage、不发请求、不依赖页面，可在 node 下单测。
 * 4. 5 人新手场长期免费；8 人（社区）与 11 人（城市）需已解锁编制，否则 ROSTER_LOCKED。
 */

var SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000
var RULE_VERSION = 1
var MS_PER_DAY = 24 * 60 * 60 * 1000

var ROSTER_SIZES = { NEWBIE: 5, COMMUNITY: 8, CITY: 11 }

var CODES = {
  ROLE_OK: '',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  NOT_SAME_CITY: 'NOT_SAME_CITY',
  NO_ELIGIBLE_CARD: 'NO_ELIGIBLE_CARD',
  ROSTER_LOCKED: 'ROSTER_LOCKED',
  LINEUP_INVALID: 'LINEUP_INVALID',
  MINOR_NO_AUTORENEW: 'MINOR_NO_AUTORENEW',
  MODE_INVALID: 'MODE_INVALID'
}

var DEFAULT_QUOTA = {
  dateKey: '',
  freeTotal: 1,
  freeUsed: 0,
  directedLeft: 0
}

/* ---------------- 通用 ---------------- */

function pad2(n) {
  return n < 10 ? '0' + n : '' + n
}

/**
 * 按 Asia/Shanghai（UTC+8）取自然日键，结果与设备时区无关。
 * @param {number} [ms] 毫秒时间戳
 * @returns {string} YYYY-MM-DD
 */
function dateKeyShanghai(ms) {
  var value = typeof ms === 'number' ? ms : Date.now()
  var d = new Date(value + SHANGHAI_OFFSET_MS)
  return '' + d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate())
}

/**
 * FNV-1a 32 位稳定散列。仅用于确定性排序与战报取分，不可用于付费发放。
 * @param {string} input
 * @returns {number} uint32
 */
function stableHash(input) {
  var text = String(input == null ? '' : input)
  var h = 0x811c9dc5
  for (var i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = (h * 0x01000193) >>> 0
  }
  return h >>> 0
}

function clamp(n, min, max) {
  if (n < min) return min
  if (n > max) return max
  return n
}

function includes(list, value) {
  if (!list) return false
  for (var i = 0; i < list.length; i++) {
    if (list[i] === value) return true
  }
  return false
}

function codeMessage(code) {
  var map = {}
  map[CODES.QUOTA_EXCEEDED] = '今日签约次数已用完'
  map[CODES.NOT_SAME_CITY] = '只能签约同城球员'
  map[CODES.NO_ELIGIBLE_CARD] = '同城已无可签球员'
  map[CODES.ROSTER_LOCKED] = '该编制尚未解锁'
  map[CODES.LINEUP_INVALID] = '阵容不完整或不合规'
  map[CODES.MINOR_NO_AUTORENEW] = '未成年账号不能开启自动续费'
  map[CODES.MODE_INVALID] = '签约方式无效'
  return map[code] || code || ''
}

/* ---------------- 签约配额 ---------------- */

function memberDailyFreeTotal(tier) {
  return tier === 'member' ? 2 : 1
}

function normalizeQuota(quota, tier, dateKey) {
  var base = quota || DEFAULT_QUOTA
  if (base.dateKey !== dateKey) {
    return {
      dateKey: dateKey,
      freeTotal: memberDailyFreeTotal(tier),
      freeUsed: 0,
      directedLeft: base.directedLeft || 0
    }
  }
  return {
    dateKey: dateKey,
    freeTotal: memberDailyFreeTotal(tier),
    freeUsed: base.freeUsed || 0,
    directedLeft: base.directedLeft || 0
  }
}

function dailyFreeLeft(quota, tier) {
  var q = quota || DEFAULT_QUOTA
  var total = q.freeTotal || memberDailyFreeTotal(tier)
  return Math.max(0, total - (q.freeUsed || 0))
}

function isFreeMode(mode) {
  return mode === 'free_daily' || mode === 'member_extra' || !mode
}

function isDirectedMode(mode) {
  return mode === 'directed_position' || mode === 'directed_skill'
}

function consumeQuota(quota, tier, mode, dateKey) {
  var q = normalizeQuota(quota, tier, dateKey)
  if (isFreeMode(mode)) {
    if (dailyFreeLeft(q, tier) < 1) {
      return { ok: false, code: CODES.QUOTA_EXCEEDED, quota: q }
    }
    q.freeUsed = (q.freeUsed || 0) + 1
    return { ok: true, quota: q }
  }
  if (isDirectedMode(mode)) {
    if ((q.directedLeft || 0) < 1) {
      return { ok: false, code: CODES.QUOTA_EXCEEDED, quota: q }
    }
    q.directedLeft = (q.directedLeft || 0) - 1
    return { ok: true, quota: q }
  }
  return { ok: false, code: CODES.MODE_INVALID, quota: q }
}

/* ---------------- 同城确定性签约 ---------------- */

function playerSortKey(p) {
  var order = typeof p.rosterOrder === 'number' ? p.rosterOrder : 9999
  return pad2(Math.round(order)) + '|' + (p.playerId || '')
}

function sortByNameOrder(players) {
  var list = (players || []).slice()
  list.sort(function (a, b) {
    var ka = playerSortKey(a)
    var kb = playerSortKey(b)
    if (ka < kb) return -1
    if (ka > kb) return 1
    return 0
  })
  return list
}

function matchesFilter(player, filter) {
  if (!filter) return true
  if (filter.position && player.position !== filter.position) return false
  if (filter.skillTag && player.skillTag !== filter.skillTag) return false
  return true
}

function signKey(cityCode, dateKey, userId, cursor) {
  return 'sc:' + String(cityCode) + ':' + dateKey + ':' + String(userId) + ':cursor:' + String(cursor)
}

/**
 * 从同城名册按游标取「下一位未拥有且满足过滤」的球员。
 * 相同 名册 + 已拥有集合 + 游标 + 过滤 必然得到同一结果。
 *
 * @param {object} opts
 * @param {Array} opts.players 同城球员库（含 cityCode / position / skillTag / rosterOrder）
 * @param {string} opts.cityCode 当前用户城市码
 * @param {Array<string>} opts.ownedIds 已拥有球员 ID
 * @param {number} opts.cursor 游标
 * @param {string} [opts.mode] free_daily / member_extra / directed_position / directed_skill
 * @param {object} [opts.filter] { position, skillTag }
 * @param {string} opts.dateKey 自然日键
 * @param {string} opts.userId 当前自然人 ID
 * @param {object} opts.quota 日签配额
 * @param {string} opts.tier 会员档位 none / member
 * @returns {object}
 */
function signSameCity(opts) {
  var options = opts || {}
  var pool = options.players || []
  var cityCode = options.cityCode
  var owned = options.ownedIds || []
  var cursor = Math.max(0, Math.round(options.cursor || 0))
  var mode = options.mode || 'free_daily'
  var quota = normalizeQuota(options.quota, options.tier, options.dateKey)

  if (!isFreeMode(mode) && !isDirectedMode(mode)) {
    return { ok: false, code: CODES.MODE_INVALID, message: codeMessage(CODES.MODE_INVALID), quota: quota }
  }
  if (isDirectedMode(mode) && !options.filter) {
    return { ok: false, code: CODES.MODE_INVALID, message: '定向签约必须指定筛选条件', quota: quota }
  }

  var sameCity = []
  for (var i = 0; i < pool.length; i++) {
    if (pool[i] && pool[i].cityCode === cityCode) sameCity.push(pool[i])
  }
  if (!sameCity.length) {
    return { ok: false, code: CODES.NOT_SAME_CITY, message: codeMessage(CODES.NOT_SAME_CITY), quota: quota }
  }

  var consumed = consumeQuota(quota, options.tier, mode, options.dateKey)
  if (!consumed.ok) {
    return { ok: false, code: consumed.code, message: codeMessage(consumed.code), quota: consumed.quota }
  }

  var ordered = sortByNameOrder(sameCity)
  var found = null
  var nextCursor = cursor
  for (var step = 0; step < ordered.length; step++) {
    var index = (cursor + step) % ordered.length
    var candidate = ordered[index]
    if (includes(owned, candidate.playerId)) continue
    if (!matchesFilter(candidate, options.filter)) continue
    found = candidate
    nextCursor = index + 1
    break
  }
  if (!found) {
    return { ok: false, code: CODES.NO_ELIGIBLE_CARD, message: codeMessage(CODES.NO_ELIGIBLE_CARD), quota: quota }
  }

  return {
    ok: true,
    player: found,
    nextCursor: nextCursor,
    deterministicKey: signKey(cityCode, options.dateKey, options.userId, cursor),
    quota: consumed.quota
  }
}

/* ---------------- 阵容编制 ---------------- */

var SLOT_TEMPLATES = {
  5: [
    { key: 'fw', label: '前锋', posTag: 'FW', group: 'FW' },
    { key: 'lm', label: '左边', posTag: 'LM', group: 'MF' },
    { key: 'rm', label: '右边', posTag: 'RM', group: 'MF' },
    { key: 'cb', label: '中卫', posTag: 'CB', group: 'DF' },
    { key: 'gk', label: '门将', posTag: 'GK', group: 'GK' }
  ],
  8: [
    { key: 'fw', label: '前锋', posTag: 'FW', group: 'FW' },
    { key: 'lm', label: '左边', posTag: 'LM', group: 'MF' },
    { key: 'cm', label: '中场', posTag: 'CM', group: 'MF' },
    { key: 'rm', label: '右边', posTag: 'RM', group: 'MF' },
    { key: 'cb1', label: '中卫', posTag: 'CB', group: 'DF' },
    { key: 'cb2', label: '中卫', posTag: 'CB', group: 'DF' },
    { key: 'cb3', label: '中卫', posTag: 'CB', group: 'DF' },
    { key: 'gk', label: '门将', posTag: 'GK', group: 'GK' }
  ],
  11: [
    { key: 'lw', label: '左边锋', posTag: 'LW', group: 'FW' },
    { key: 'st', label: '中锋', posTag: 'ST', group: 'FW' },
    { key: 'rw', label: '右边锋', posTag: 'RW', group: 'FW' },
    { key: 'lm', label: '左中场', posTag: 'LM', group: 'MF' },
    { key: 'cm', label: '中场', posTag: 'CM', group: 'MF' },
    { key: 'rm', label: '右中场', posTag: 'RM', group: 'MF' },
    { key: 'lb', label: '左后卫', posTag: 'LB', group: 'DF' },
    { key: 'cb1', label: '中卫', posTag: 'CB', group: 'DF' },
    { key: 'cb2', label: '中卫', posTag: 'CB', group: 'DF' },
    { key: 'rb', label: '右后卫', posTag: 'RB', group: 'DF' },
    { key: 'gk', label: '门将', posTag: 'GK', group: 'GK' }
  ]
}

var PITCH_ROWS = {
  5: [['fw'], ['lm', 'rm'], ['cb'], ['gk']],
  8: [['fw'], ['lm', 'cm', 'rm'], ['cb1', 'cb2', 'cb3'], ['gk']],
  11: [['lw', 'st', 'rw'], ['lm', 'cm', 'rm'], ['lb', 'cb1', 'cb2', 'rb'], ['gk']]
}

function rosterUnlocked(size, unlocks) {
  if (size === 5) return true
  var u = unlocks || {}
  if (size === 8) return !!u.size8
  if (size === 11) return !!u.size11
  return false
}

function buildSlots(size) {
  var template = SLOT_TEMPLATES[size] || SLOT_TEMPLATES[5]
  return template.map(function (slot) {
    return {
      key: slot.key,
      label: slot.label,
      posTag: slot.posTag,
      group: slot.group,
      playerId: ''
    }
  })
}

/** 把阵容槽位组织成球场行（含已填球员的可视字段）。 */
function pitchRows(slots, playersById, activeKey) {
  var size = (slots || []).length
  var rows = PITCH_ROWS[size] || PITCH_ROWS[5]
  var byKey = {}
  var list = slots || []
  for (var i = 0; i < list.length; i++) byKey[list[i].key] = list[i]

  function cellOf(key) {
    var slot = byKey[key]
    if (!slot) return null
    var player = slot.playerId ? playersById[slot.playerId] : null
    return {
      key: slot.key,
      posTag: slot.posTag,
      label: slot.label,
      group: slot.group,
      filled: !!player,
      name: player ? player.name : '点选占位',
      numberText: player ? '#' + player.number : '',
      cardUrl: player ? player.cardUrl : '',
      filledClass: player ? 'is-filled' : '',
      activeClass: activeKey === slot.key ? 'is-active' : '',
      mismatch: player ? (player.group !== slot.group) : false,
      mismatchClass: player && player.group !== slot.group ? 'is-mismatch' : ''
    }
  }

  return rows.map(function (row, rowIndex) {
    return {
      rowIndex: rowIndex,
      cells: row.map(cellOf).filter(function (cell) { return !!cell })
    }
  })
}

function lineupPower(slots, playersById) {
  var total = 0
  var list = slots || []
  for (var i = 0; i < list.length; i++) {
    var slot = list[i]
    var player = slot.playerId ? playersById[slot.playerId] : null
    if (!player) continue
    total += player.ovr || 0
    if (player.group === slot.group) total += 6
  }
  return total
}

function validateLineup(opts) {
  var options = opts || {}
  var slots = options.slots || []
  var size = Math.round(options.rosterSize || slots.length || 5)
  var owned = options.ownedIds || []
  var playersById = options.playersById || {}
  var unlocks = options.unlocks || {}

  if (size !== 5 && size !== 8 && size !== 11) {
    return { ok: false, code: CODES.LINEUP_INVALID, message: '编制人数无效' }
  }
  if (!rosterUnlocked(size, unlocks)) {
    return { ok: false, code: CODES.ROSTER_LOCKED, message: codeMessage(CODES.ROSTER_LOCKED) }
  }
  if (slots.length !== size) {
    return { ok: false, code: CODES.LINEUP_INVALID, message: '阵容人数与编制不一致' }
  }

  var seen = {}
  var gk = null
  for (var i = 0; i < slots.length; i++) {
    var slot = slots[i]
    if (!slot.playerId) {
      return { ok: false, code: CODES.LINEUP_INVALID, message: '还有空位未安排球员' }
    }
    if (!includes(owned, slot.playerId)) {
      return { ok: false, code: CODES.LINEUP_INVALID, message: '只能使用卡册内的球员卡' }
    }
    if (seen[slot.playerId]) {
      return { ok: false, code: CODES.LINEUP_INVALID, message: '同一球员不能重复上阵' }
    }
    seen[slot.playerId] = true
    if (slot.group === 'GK') gk = playersById[slot.playerId] || null
  }
  if (!gk) {
    return { ok: false, code: CODES.LINEUP_INVALID, message: '门将位必须有球员' }
  }
  if (gk.group !== 'GK') {
    return { ok: false, code: CODES.LINEUP_INVALID, message: '门将位只能安排门将' }
  }

  return { ok: true, code: CODES.ROLE_OK, message: '', power: lineupPower(slots, playersById) }
}

/* ---------------- 轻对战 ---------------- */

/**
 * 确定性生成同城系统对手（新手场），不用随机数。
 * @param {object} opts { players, cityCode, seed }
 */
function buildSystemOpponent(opts) {
  var options = opts || {}
  var seed = String(options.seed || options.dateKey || '')
  var pool = []
  var players = options.players || []
  for (var i = 0; i < players.length; i++) {
    if (players[i] && players[i].cityCode === options.cityCode) pool.push(players[i])
  }
  var remaining = sortByNameOrder(pool)
  var template = SLOT_TEMPLATES[5]
  var slots = template.map(function (slot) {
    var best = null
    var bestScore = null
    var bestPreferred = false
    for (var j = 0; j < remaining.length; j++) {
      var candidate = remaining[j]
      var score = stableHash(seed + '|' + slot.key + '|' + candidate.playerId)
      var preferred = candidate.group === slot.group
      if (best === null || (preferred && !bestPreferred) || (preferred === bestPreferred && score < bestScore)) {
        best = candidate
        bestScore = score
        bestPreferred = preferred
      }
    }
    var chosen = best
    if (chosen) {
      remaining = remaining.filter(function (p) { return p.playerId !== chosen.playerId })
    }
    return {
      key: slot.key,
      label: slot.label,
      posTag: slot.posTag,
      group: slot.group,
      playerId: chosen ? chosen.playerId : ''
    }
  })

  return {
    type: 'system_bot',
    opponentId: 'bot_' + stableHash(seed + '|' + String(options.cityCode)).toString(36),
    label: '同城新手场对手',
    slots: slots
  }
}

function battleKey(input) {
  var opts = input || {}
  var opponent = opts.opponent || {}
  var opponentKey = opponent.type === 'share_challenge'
    ? 'share:' + String(opponent.shareId || '')
    : (opponent.type || 'system_bot') + ':' + String(opponent.opponentId || '')
  return 'bt:' + String(opts.lineupId || '') + ':' + opponentKey + ':rule_v' + RULE_VERSION
}

/**
 * 轻对战出分：仅由阵容战力 + 确定性键决定。
 * 会员档位、支付状态、前端传入的分数都不参与计算。
 */
function battleResult(input) {
  var opts = input || {}
  var key = battleKey(opts)
  var h = stableHash(key)
  var powerMine = lineupPower(opts.lineupSlots || [], opts.playersById || {})
  var powerOpp = lineupPower(opts.opponentSlots || [], opts.playersById || {})

  var scoreMine = clamp(Math.round(powerMine / 100) + (h % 3) - 1, 0, 5)
  var scoreOpp = clamp(Math.round(powerOpp / 100) + ((h >>> 7) % 3) - 1, 0, 5)
  var diff = scoreMine - scoreOpp
  var result = diff > 0 ? 'win' : (diff < 0 ? 'lose' : 'draw')

  var comment = ''
  if (result === 'win') comment = diff >= 2 ? '前场压制奏效' : '同城编队完成度更高'
  else if (result === 'lose') comment = diff <= -2 ? '对手位置契合更好' : '末段机会把握不足'
  else comment = '双方完成度接近，本场记平'

  var badges = ['light-challenge']
  if (Math.abs(diff) >= 2) badges.push('dominant')
  var hasGk = false
  var mine = opts.lineupSlots || []
  for (var i = 0; i < mine.length; i++) {
    var p = mine[i].playerId ? (opts.playersById || {})[mine[i].playerId] : null
    if (p && p.group === 'GK') hasGk = true
  }
  if (hasGk) badges.push('solid-gk')

  return {
    battleId: 'b_' + h.toString(36),
    scoreMine: scoreMine,
    scoreOpp: scoreOpp,
    result: result,
    comment: comment,
    badges: badges,
    deterministicKey: key,
    powerMine: powerMine,
    powerOpp: powerOpp
  }
}

/* ---------------- 会员 ---------------- */

function membershipView(member) {
  var m = member || {}
  var tier = m.tier === 'member' ? 'member' : 'none'
  var isMinor = !!m.isMinor
  var unlocks = m.rosterUnlocks || {}
  return {
    tier: tier,
    tierText: tier === 'member' ? '会员' : '普通用户',
    dailySignQuota: memberDailyFreeTotal(tier),
    rosterUnlocks: { size8: !!unlocks.size8, size11: !!unlocks.size11 },
    isMinor: isMinor,
    autoRenew: isMinor ? false : !!m.autoRenew,
    autoRenewAllowed: !isMinor,
    autoRenewBlockedCode: isMinor ? CODES.MINOR_NO_AUTORENEW : ''
  }
}

function setAutoRenew(member, enabled) {
  var view = membershipView(member)
  if (view.isMinor) {
    return { ok: false, code: CODES.MINOR_NO_AUTORENEW, message: codeMessage(CODES.MINOR_NO_AUTORENEW) }
  }
  var next = {}
  var base = member || {}
  for (var k in base) {
    if (Object.prototype.hasOwnProperty.call(base, k)) next[k] = base[k]
  }
  next.autoRenew = !!enabled
  return { ok: true, member: next }
}

/* ---------------- 战报 ---------------- */

function battleLogEntry(result, extras) {
  var e = extras || {}
  var at = typeof e.at === 'number' ? e.at : Date.now()
  return {
    id: String(result.battleId),
    playedAt: at,
    mode: e.mode || 'newbie_5v5',
    scoreMine: result.scoreMine,
    scoreOpp: result.scoreOpp,
    result: result.result,
    comment: result.comment,
    opponentLabel: e.opponentLabel || '同城新手场对手',
    deterministicKey: result.deterministicKey
  }
}

function trimBattleLog(log, max) {
  var limit = typeof max === 'number' ? max : 20
  var list = (log || []).slice(0, limit)
  return list
}

module.exports = {
  SHANGHAI_OFFSET_MS: SHANGHAI_OFFSET_MS,
  RULE_VERSION: RULE_VERSION,
  ROSTER_SIZES: ROSTER_SIZES,
  CODES: CODES,
  DEFAULT_QUOTA: DEFAULT_QUOTA,
  dateKeyShanghai: dateKeyShanghai,
  stableHash: stableHash,
  codeMessage: codeMessage,
  memberDailyFreeTotal: memberDailyFreeTotal,
  normalizeQuota: normalizeQuota,
  dailyFreeLeft: dailyFreeLeft,
  consumeQuota: consumeQuota,
  signSameCity: signSameCity,
  SLOT_TEMPLATES: SLOT_TEMPLATES,
  PITCH_ROWS: PITCH_ROWS,
  buildSlots: buildSlots,
  rosterUnlocked: rosterUnlocked,
  pitchRows: pitchRows,
  lineupPower: lineupPower,
  validateLineup: validateLineup,
  buildSystemOpponent: buildSystemOpponent,
  battleKey: battleKey,
  battleResult: battleResult,
  membershipView: membershipView,
  setAutoRenew: setAutoRenew,
  battleLogEntry: battleLogEntry,
  trimBattleLog: trimBattleLog
}
