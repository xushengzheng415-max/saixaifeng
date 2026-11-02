'use strict'
/**
 * 赛小蜂足球世界 · 本地状态与持久化
 *
 * 本层只做「读/写本机缓存 + 组装页面视图」，规则全部在 utils/engine.js。
 * 正式版换成服务端返回后，页面结构与视图字段保持不变。
 */

var engine = require('./engine')
var mock = require('./mock')
var mvp = require('../config/mvp')

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
    /* 虚拟卡与自制卡单独成册：不进阵容、不参与评估 */
    ownedVirtualIds: ['v_2001', 'v_2002'],
    ownedFanIds: ['f_3001'],
    cursor: 0,
    quota: {
      dateKey: todayKey(),
      freeTotal: engine.memberDailyFreeTotal(mock.MEMBERSHIP.tier),
      freeUsed: 0,
      directedLeft: 0
    },
    coupons: { balance: 0, lastGrantDateKey: '' },
    slotCapacity: engine.normalizeSlotCapacity(null, mvp.SLOT_DEFAULTS),
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
  if (Array.isArray(raw.ownedVirtualIds)) state.ownedVirtualIds = raw.ownedVirtualIds.slice()
  if (Array.isArray(raw.ownedFanIds)) state.ownedFanIds = raw.ownedFanIds.slice()
  if (Array.isArray(raw.slots)) state.slots = raw.slots.slice()
  if (Array.isArray(raw.battleLog)) state.battleLog = raw.battleLog.slice()
  if (raw.coupons && typeof raw.coupons === 'object') {
    state.coupons = {
      balance: raw.coupons.balance || 0,
      lastGrantDateKey: raw.coupons.lastGrantDateKey || ''
    }
  }
  if (raw.slotCapacity && typeof raw.slotCapacity === 'object') {
    state.slotCapacity = engine.normalizeSlotCapacity(raw.slotCapacity, mvp.SLOT_DEFAULTS)
  }
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
  state.slotCapacity = engine.normalizeSlotCapacity(state.slotCapacity, mvp.SLOT_DEFAULTS)
  state.coupons = engine.grantDailyCoupons(state.coupons, today, mvp.DAILY_COUPONS).coupons
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
  normalize(cached)
  persist(cached)
}

/** 页面 onShow 时调用：跨自然日后补发签约配额与每日兑换券。 */
function refreshDaily() {
  var state = getState()
  var beforeQuota = state.quota.dateKey
  var beforeGrant = state.coupons.lastGrantDateKey
  normalize(state)
  if (beforeQuota !== state.quota.dateKey || beforeGrant !== state.coupons.lastGrantDateKey) persist(state)
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

/** 三类卡全集索引：真实卡按 playerId，虚拟卡/自制卡按 cardId。 */
function cardsById() {
  var list = mock.allCards()
  var map = {}
  for (var i = 0; i < list.length; i++) map[list[i].cardId || list[i].playerId] = list[i]
  return map
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
    headHint: p.name + ' · ' + p.positionLabel + ' · #' + p.number,
    foilTip: '轻彩箔光已默认循环 · 按住卡面滑动略加强',
    cityText: state.cityName + ' · ' + state.cityCode,
    cardUrl: p.cardUrl,
    stats: [
      { label: '综合', num: String(p.ovr) },
      { label: '出场', num: String(p.appearances) },
      { label: '进球', num: String(p.goals) },
      { label: '助攻', num: String(p.assists) }
    ],
    stamps: [
      { key: 'frame', icon: '🥇', name: '熔金边框', stateText: '已点亮', lockedClass: '' },
      { key: 'debut', icon: '✨', name: '首秀贴纸', stateText: '已点亮', lockedClass: '' },
      { key: 'ten', icon: '🔒', name: '十场出勤', stateText: '未解锁', lockedClass: 'is-locked' },
      { key: 'night', icon: '🔒', name: '破门之夜', stateText: '未解锁', lockedClass: 'is-locked' }
    ],
    portraitNote: p.portraitAuthorized ? '' : '形象照未授权，分享使用号码与阵容卡'
  }
}

function ownedIdsOfKind(state, kind) {
  if (kind === 'virtual') return state.ownedVirtualIds || []
  if (kind === 'fanMade') return state.ownedFanIds || []
  return state.ownedIds || []
}

function albumCounts(state) {
  return {
    real: (state.ownedIds || []).length,
    virtual: (state.ownedVirtualIds || []).length,
    fanMade: (state.ownedFanIds || []).length
  }
}

/**
 * 卡册三分区视图。只有真实球员卡分区保留签约与阵容入口；
 * 虚拟卡只进娱乐图鉴，自制卡只做展示与分享。
 */
function albumView(kind) {
  var state = refreshDaily()
  var active = kind === 'virtual' ? 'virtual' : (kind === 'fanMade' ? 'fanMade' : 'real')
  var meta = engine.cardKindMeta(active)
  var map = cardsById()
  var ids = ownedIdsOfKind(state, active)
  var counts = albumCounts(state)
  var tiles = []
  for (var i = 0; i < ids.length; i++) {
    var c = map[ids[i]]
    if (!c) continue
    var isMain = active === 'real' && c.playerId === state.mainPlayerId
    tiles.push({
      id: ids[i],
      name: c.name,
      cardUrl: c.cardUrl,
      isMain: isMain,
      mainLabel: isMain ? '主卡' : '',
      metaText: c.metaText,
      skillText: c.skillLabel || '',
      scoreLine: c.scoreLine,
      tagText: active === 'real' ? '' : (c.tagText || meta.short),
      tagClass: active === 'real' ? '' : meta.tagClass
    })
  }
  var tabs = engine.CARD_KINDS.map(function (item) {
    return {
      key: item.key,
      label: item.short,
      countText: counts[item.key] + ' 张',
      activeClass: item.key === active ? 'is-active' : ''
    }
  })
  var quota = state.quota
  var freeLeft = engine.dailyFreeLeft(quota, state.membership.tier)
  var member = engine.membershipView(state.membership)
  var emptyText = '还没有球员卡，先完成一次同城签约'
  if (active === 'virtual') emptyText = '还没有虚拟卡 · 娱乐图鉴入口后续开放'
  if (active === 'fanMade') emptyText = '还没有自制卡 · 制作入口后续开放'
  return {
    tabs: tabs,
    activeKind: active,
    kindLabel: meta.label,
    kindHint: meta.hint,
    showReal: active === 'real',
    tiles: tiles,
    isEmpty: tiles.length === 0,
    countText: '共 ' + tiles.length + ' 张',
    emptyText: emptyText,
    noteText: active === 'real'
      ? ''
      : (active === 'virtual'
        ? '虚拟卡只进娱乐图鉴，不计分、不进阵容'
        : '自制卡只做展示与分享，不进 PK、不可交易'),
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

/* ---------------- 我的 / 卡商城（只售槽位） ---------------- */

/** 「我的」视图：券余额、槽位容量、卡片边界说明。 */
function meView() {
  var state = refreshDaily()
  var member = engine.membershipView(state.membership)
  var counts = albumCounts(state)
  var slots = engine.SLOT_KEYS.map(function (key) {
    var meta = mvp.SLOT_META[key] || {}
    var capacity = state.slotCapacity[key] || 0
    return {
      key: key,
      label: meta.label || key,
      hint: meta.hint || '',
      capacityText: capacity + ' 个',
      maxText: '上限 ' + mvp.SLOT_MAX[key] + ' 个'
    }
  })
  return {
    couponBalanceText: String(state.coupons.balance || 0),
    couponNote: '每日登录自动到账 ' + mvp.DAILY_COUPONS + ' 张券，只用于扩容槽位',
    slots: slots,
    slotNote: '槽位只决定能收藏/展示多少张卡，不改变卡片等级与胜负权重',
    membershipTierText: member.tierText,
    cardCountText: '真实 ' + counts.real + ' 张 · 虚拟 ' + counts.virtual + ' 张 · 自制 ' + counts.fanMade + ' 张',
    cardPoolText: '真实球员卡参与评估与真实 PK；虚拟卡只进娱乐图鉴；自制卡只做展示与分享',
    bgFreeText: '满 ' + mvp.FREE_BG_SCORE + ' 分或有效会员可免费更换背景（保留不缩减）',
    bgStoreText: mvp.BACKGROUND_STORE_OPEN
      ? '卡皮肤商城已开放：只售槽位容量，不售背景卡图'
      : '背景卡本期未上架；后期卡皮肤商城只售槽位，不售背景卡图',
    bgBtnText: mvp.BACKGROUND_STORE_OPEN ? '去换背景' : '暂未开放',
    bgBtnClass: mvp.BACKGROUND_STORE_OPEN ? '' : 'is-disabled'
  }
}

/** 卡商城视图：只售槽位容量，券不足或已达上限时按钮置灰（无支付）。 */
function shopView() {
  var state = refreshDaily()
  var balance = state.coupons.balance || 0
  var items = engine.SLOT_KEYS.map(function (key) {
    var meta = mvp.SLOT_META[key] || {}
    var capacity = state.slotCapacity[key] || 0
    var price = mvp.SLOT_PRICES[key] || 0
    var max = mvp.SLOT_MAX[key] || 0
    var maxed = capacity >= max
    var enough = balance >= price
    var canBuy = !maxed && enough
    var btnText = '券不足'
    if (maxed) btnText = '已达上限'
    else if (enough) btnText = '兑换 · ' + price + ' 券'
    return {
      key: key,
      label: meta.label || key,
      hint: meta.hint || '',
      progressText: capacity + ' / ' + max,
      priceText: price + ' 张兑换券 · +1 容量',
      btnText: btnText,
      btnClass: canBuy ? '' : 'is-disabled',
      canBuy: canBuy,
      disabledText: maxed ? '该槽位已达上限' : '兑换券不足，明天登录再领'
    }
  })
  var rules = mvp.SHOP_RULES.slice()
  rules.splice(3, 0, '背景卡：满 ' + mvp.FREE_BG_SCORE + ' 分或有效会员免费更换，超额才换槽位')
  return {
    couponBalanceText: String(balance),
    couponNote: '每日登录 +' + mvp.DAILY_COUPONS + ' 张券',
    items: items,
    rules: rules,
    emptyCouponText: balance < 1 ? mvp.COUPON_EMPTY_NOTICE : '',
    storeNote: mvp.BACKGROUND_STORE_OPEN ? '' : '背景卡与卡皮肤暂不上架，本期只开放槽位扩容'
  }
}

/** 兑换槽位（本地状态写入）。规则校验在 engine.buySlot。 */
function buySlot(kind) {
  var state = refreshDaily()
  var meta = mvp.SLOT_META[kind]
  if (!meta) return { ok: false, code: engine.CODES.SLOT_INVALID, message: engine.codeMessage(engine.CODES.SLOT_INVALID) }
  var result = engine.buySlot({
    capacity: state.slotCapacity,
    kind: kind,
    price: mvp.SLOT_PRICES[kind],
    max: mvp.SLOT_MAX[kind],
    balance: state.coupons.balance || 0
  })
  if (!result.ok) return { ok: false, code: result.code, message: result.message || engine.codeMessage(result.code) }
  state.slotCapacity = result.capacity
  state.coupons.balance = result.balance
  save()
  return {
    ok: true,
    kind: kind,
    label: meta.label,
    capacity: result.capacity,
    balance: result.balance
  }
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
  cardsById: cardsById,
  mainCardView: mainCardView,
  albumView: albumView,
  lineupView: lineupView,
  ownedChips: ownedChips,
  meView: meView,
  shopView: shopView,
  buySlot: buySlot,
  battleLogView: battleLogView,
  clone: clone
}
