'use strict'
/**
 * 赛小蜂足球世界 · 本地状态与持久化
 *
 * 本层只做「读/写本机缓存 + 组装页面视图」，规则全部在 utils/engine.js。
 * 正式版换成服务端返回后，页面结构与视图字段保持不变。
 */

var engine = require('./engine')
var mock = require('./mock')

var STORAGE_KEY = 'sxf-world-card-state-v1'
var STATE_VERSION = 1

var cached = null

function nowMs() {
  return Date.now()
}

function todayKey() {
  return engine.dateKeyShanghai(nowMs())
}

function defaultState() {
  var slots = engine.buildSlots(5)
  /* 演示种子：主卡 + 门将 + 中场 + 后卫，留 1 个空位用当日免费签约补齐 */
  slots[0].playerId = 'p_1001'
  slots[1].playerId = 'p_1007'
  slots[2].playerId = ''
  slots[3].playerId = 'p_1003'
  slots[4].playerId = 'p_1004'
  return {
    version: STATE_VERSION,
    userId: 'demo_natural_person',
    cityCode: mock.CITY.code,
    cityName: mock.CITY.name,
    mainPlayerId: 'p_1001',
    ownedIds: ['p_1001', 'p_1004', 'p_1007', 'p_1003'],
    cursor: 0,
    quota: {
      dateKey: todayKey(),
      freeTotal: engine.memberDailyFreeTotal(mock.MEMBERSHIP.tier),
      freeUsed: 0,
      directedLeft: 0
    },
    rosterSize: 5,
    slots: slots,
    battleLog: [],
    membership: {
      tier: mock.MEMBERSHIP.tier,
      isMinor: mock.MEMBERSHIP.isMinor,
      autoRenew: mock.MEMBERSHIP.autoRenew,
      rosterUnlocks: {
        size8: mock.MEMBERSHIP.rosterUnlocks.size8,
        size11: mock.MEMBERSHIP.rosterUnlocks.size11
      }
    },
    lastSignedName: '',
    lastSignAt: 0
  }
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj))
}

function loadRaw() {
  try {
    return wx.getStorageSync(STORAGE_KEY) || null
  } catch (e) {
    return null
  }
}

function persist(state) {
  try {
    wx.setStorageSync(STORAGE_KEY, state)
  } catch (e) {
    /* 本地缓存失败不阻断页面，仅记录 */
    console.error('[world] state persist failed', e)
  }
}

/** 兼容历史缓存：补齐缺失字段，并做自然日配额归一。 */
function mergeState(raw) {
  var base = defaultState()
  if (!raw || typeof raw !== 'object' || raw.version !== STATE_VERSION) return base
  var state = base
  var keys = ['userId', 'cityCode', 'cityName', 'mainPlayerId', 'cursor', 'rosterSize', 'lastSignedName', 'lastSignAt']
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i]
    if (raw[k] !== undefined) state[k] = raw[k]
  }
  if (Array.isArray(raw.ownedIds)) state.ownedIds = raw.ownedIds.slice()
  if (Array.isArray(raw.slots)) state.slots = raw.slots.slice()
  if (Array.isArray(raw.battleLog)) state.battleLog = raw.battleLog.slice()
  if (raw.quota && typeof raw.quota === 'object') {
    state.quota = {
      dateKey: raw.quota.dateKey || '',
      freeTotal: raw.quota.freeTotal,
      freeUsed: raw.quota.freeUsed || 0,
      directedLeft: raw.quota.directedLeft || 0
    }
  }
  if (raw.membership && typeof raw.membership === 'object') {
    state.membership = {
      tier: raw.membership.tier === 'member' ? 'member' : 'none',
      isMinor: !!raw.membership.isMinor,
      autoRenew: !!raw.membership.autoRenew,
      rosterUnlocks: {
        size8: !!(raw.membership.rosterUnlocks || {}).size8,
        size11: !!(raw.membership.rosterUnlocks || {}).size11
      }
    }
  }
  return state
}

function normalize(state) {
  var today = todayKey()
  state.quota = engine.normalizeQuota(state.quota, state.membership.tier, today)
  return state
}

function getState() {
  if (!cached) {
    cached = normalize(mergeState(loadRaw()))
    persist(cached)
  }
  return cached
}

function save() {
  if (!cached) return
  cached.quota = engine.normalizeQuota(cached.quota, cached.membership.tier, todayKey())
  persist(cached)
}

/** 页面 onShow 时调用：跨自然日后补发配额。 */
function refreshDaily() {
  var state = getState()
  var before = state.quota.dateKey
  state.quota = engine.normalizeQuota(state.quota, state.membership.tier, todayKey())
  if (before !== state.quota.dateKey) persist(state)
  return state
}

function resetDemoState() {
  cached = defaultState()
  persist(cached)
  return cached
}

function allPlayers() {
  return mock.allPlayers()
}

function playersById() {
  var list = allPlayers()
  var map = {}
  for (var i = 0; i < list.length; i++) map[list[i].playerId] = list[i]
  return map
}

function player(playerId) {
  return playersById()[playerId] || null
}

/* ---------------- 页面视图组装 ---------------- */

function mainCardView() {
  var state = getState()
  var p = player(state.mainPlayerId) || player(state.ownedIds[0]) || allPlayers()[0]
  return {
    playerId: p.playerId,
    name: p.name,
    nameEn: p.nameEn,
    numberText: '#' + p.number,
    positionLabel: p.positionLabel,
    cityText: state.cityName + ' · ' + state.cityCode,
    cardUrl: p.cardUrl,
    stats: [
      { label: '综合', num: String(p.ovr) },
      { label: '出场', num: String(p.appearances) },
      { label: '进球', num: String(p.goals) },
      { label: '助攻', num: String(p.assists) }
    ],
    stamps: [
      { key: 'frame', icon: '🥇', name: '熔金边框', lockedClass: '' },
      { key: 'debut', icon: '✨', name: '首秀贴纸', lockedClass: '' },
      { key: 'ten', icon: '🔒', name: '十场出勤', lockedClass: 'is-locked' },
      { key: 'night', icon: '🔒', name: '破门之夜', lockedClass: 'is-locked' }
    ],
    portraitNote: p.portraitAuthorized ? '' : '形象照未授权，分享使用号码与阵容卡'
  }
}

function albumView() {
  var state = refreshDaily()
  var list = allPlayers()
  var map = playersById()
  var tiles = []
  for (var i = 0; i < state.ownedIds.length; i++) {
    var p = map[state.ownedIds[i]]
    if (!p) continue
    var isMain = p.playerId === state.mainPlayerId
    tiles.push({
      id: p.playerId,
      name: p.name,
      cardUrl: p.cardUrl,
      isMain: isMain,
      mainLabel: isMain ? '主卡' : '',
      metaText: p.positionLabel + ' · #' + p.number,
      skillText: p.skillLabel,
      ovrText: String(p.ovr)
    })
  }
  var quota = state.quota
  var freeLeft = engine.dailyFreeLeft(quota, state.membership.tier)
  var member = engine.membershipView(state.membership)
  return {
    tiles: tiles,
    isEmpty: tiles.length === 0,
    countText: '共 ' + tiles.length + ' 张',
    freeLeft: freeLeft,
    freeTotal: quota.freeTotal || engine.memberDailyFreeTotal(state.membership.tier),
    remainText: freeLeft > 0 ? ('今日剩余 ' + freeLeft + ' 次') : '明日再来 · 免费 ' + (quota.freeTotal || 1) + ' 次/日',
    signDisabled: freeLeft < 1,
    signBtn: freeLeft > 0 ? '免费签约' : '今日已签约',
    directedLeft: quota.directedLeft || 0,
    directedText: (quota.directedLeft || 0) > 0 ? ('定向剩余 ' + quota.directedLeft + ' 次') : '定向签约次数可在活动中获得',
    membershipTierText: member.tierText,
    memberDailyText: '会员每日 ' + member.dailySignQuota + ' 次',
    minorText: member.isMinor ? '未成年账号不开启自动续费' : '',
    unlock8Text: member.rosterUnlocks.size8 ? '社区 8 人编制已解锁' : '社区 8 人编制未解锁',
    unlock11Text: member.rosterUnlocks.size11 ? '城市 11 人编制已解锁' : '城市 11 人编制未解锁',
    lastSignedName: state.lastSignedName,
    lastSignText: state.lastSignedName ? ('签约成功 · ' + state.lastSignedName) : '',
    cityText: state.cityName
  }
}

function lineupView(activeKey) {
  var state = refreshDaily()
  var map = playersById()
  var rows = engine.pitchRows(state.slots, map, activeKey || '')
  var filled = 0
  for (var i = 0; i < state.slots.length; i++) {
    if (state.slots[i].playerId) filled++
  }
  var size = state.rosterSize
  var check = engine.validateLineup({
    slots: state.slots,
    rosterSize: size,
    ownedIds: state.ownedIds,
    playersById: map,
    unlocks: state.membership.rosterUnlocks
  })
  var pct = Math.min(100, Math.round((filled / size) * 100))
  return {
    rows: rows,
    rosterSize: size,
    filledText: filled + ' / ' + size + ' 人',
    pctText: pct + '%',
    pctWidth: pct + '%',
    canChallenge: size === 5 && check.ok,
    challengeDisabled: !(size === 5 && check.ok),
    tip: size === 5
      ? (check.ok ? '可发起轻对战 · 新手场不上榜' : (check.message || '凑齐 5 人（含门将）'))
      : (check.ok ? '该编制阵容已完整' : (check.message || '该编制尚未解锁')),
    size5On: size === 5 ? 'is-on' : '',
    size8On: size === 8 ? 'is-on' : '',
    size11On: size === 11 ? 'is-on' : '',
    unlock8Class: state.membership.rosterUnlocks.size8 ? '' : 'is-locked',
    unlock11Class: state.membership.rosterUnlocks.size11 ? '' : 'is-locked',
    unlock8Text: state.membership.rosterUnlocks.size8 ? '社区 8' : '社区 8 🔒',
    unlock11Text: state.membership.rosterUnlocks.size11 ? '城市 11' : '城市 11 🔒',
    cityText: state.cityName
  }
}

function ownedChips() {
  var state = getState()
  var map = playersById()
  return state.ownedIds.map(function (id) {
    var p = map[id]
    if (!p) return null
    return {
      id: p.playerId,
      label: p.name + ' · ' + p.positionLabel + ' · ' + p.ovr,
      group: p.group
    }
  }).filter(function (x) { return !!x })
}

function battleLogView() {
  var state = getState()
  var rows = state.battleLog.map(function (entry) {
    var d = new Date(entry.playedAt || nowMs())
    var mm = d.getMonth() + 1
    var dd = d.getDate()
    var hh = d.getHours()
    var mi = d.getMinutes()
    return {
      id: entry.id,
      resultText: entry.result === 'win' ? '胜' : (entry.result === 'lose' ? '负' : '平'),
      resultClass: entry.result === 'win' ? 'is-win' : (entry.result === 'lose' ? 'is-lose' : 'is-draw'),
      scoreText: entry.scoreMine + ' – ' + entry.scoreOpp,
      comment: entry.comment || '',
      opponentText: entry.opponentLabel || '',
      timeText: mm + '/' + dd + ' ' + hh + ':' + (mi < 10 ? '0' + mi : mi)
    }
  })
  return { isEmpty: rows.length === 0, rows: rows }
}

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  getState: getState,
  save: save,
  refreshDaily: refreshDaily,
  resetDemoState: resetDemoState,
  todayKey: todayKey,
  allPlayers: allPlayers,
  playersById: playersById,
  player: player,
  mainCardView: mainCardView,
  albumView: albumView,
  lineupView: lineupView,
  ownedChips: ownedChips,
  battleLogView: battleLogView,
  clone: clone
}
