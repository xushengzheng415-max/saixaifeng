'use strict'
/**
 * 球员端「赛小蜂足球世界」玩法开放范围校验（2026-11-02 用户确认）
 *
 * 覆盖：已认领准入、认领赛事一致性、只玩本赛事球员、
 * 本赛事无比赛记录球员不进卡池、球迷自制卡不开放、卡册分区收敛。
 *
 * 运行：node tools/verify-world-scope.cjs
 */

var path = require('path')
var BASE = path.join(__dirname, '..', 'miniprogram-world', 'utils') + path.sep

var storage = {}
global.wx = {
  getStorageSync: function (key) { return storage[key] || '' },
  setStorageSync: function (key, val) { storage[key] = val },
  removeStorageSync: function (key) { delete storage[key] },
  showToast: function () {}
}

var mock = require(BASE + 'mock.js')
var engine = require(BASE + 'engine.js')
var store = require(BASE + 'store.js')

var fails = []
function check(name, cond, detail) {
  if (cond) {
    console.log('PASS  ' + name + (detail === undefined ? '' : '  -> ' + detail))
  } else {
    fails.push(name)
    console.log('FAIL  ' + name + (detail === undefined ? '' : '  -> ' + detail))
  }
}

/* 1. 卡池：只含本赛事 + 本赛事已有比赛记录 */
check('本赛事可玩球员数 = 12（14 名册 - 1 无比赛 - 1 跨赛事）', mock.eventPlayers().length === 12, mock.eventPlayers().length)
check('全部名册仍保留 14 条用于负例', mock.allPlayers().length === 14, mock.allPlayers().length)

var ids = mock.eventPlayers().map(function (p) { return p.playerId })
check('无比赛球员 p_1013 被排除', ids.indexOf('p_1013') === -1)
check('跨赛事球员 p_2001 被排除', ids.indexOf('p_2001') === -1)

var kinds = {}
mock.allCards().forEach(function (c) { kinds[c.cardKind] = (kinds[c.cardKind] || 0) + 1 })
check('卡全集不含球迷自制卡', !kinds.fanMade, JSON.stringify(kinds))
check('卡全集 = 12 真实 + 2 虚拟', kinds.real === 12 && kinds.virtual === 2, JSON.stringify(kinds))

/* 2. 准入：只对已认领且认领赛事一致的用户开放 */
var kindKeys = engine.CARD_KINDS.map(function (k) { return k.key })
check('卡种类只保留 real / virtual', kindKeys.length === 2 && kindKeys.indexOf('fanMade') === -1, kindKeys.join(','))

var ok = engine.worldAccess({ claim: mock.CLAIM, event: mock.EVENT })
check('已认领 + 同赛事 -> 允许', ok.allowed === true, ok.code)

var none = engine.worldAccess({ claim: null, event: mock.EVENT })
check('未认领 -> CLAIM_REQUIRED', none.allowed === false && none.code === engine.CODES.CLAIM_REQUIRED, none.reasonText)

var unverified = engine.worldAccess({ claim: { claimed: false, playerId: 'p_1001', eventId: 'e_1001' }, event: mock.EVENT })
check('认领未通过 -> 不允许', unverified.allowed === false && unverified.code === engine.CODES.CLAIM_REQUIRED)

var cross = engine.worldAccess({ claim: { claimed: true, playerId: 'p_2001', eventId: 'e_2002' }, event: mock.EVENT })
check('认领赛事不符 -> EVENT_MISMATCH', cross.allowed === false && cross.code === engine.CODES.EVENT_MISMATCH, cross.reasonText)

check('playablePool 过滤跨赛事', engine.playablePool(mock.allPlayers(), 'e_1001').length === 12, engine.playablePool(mock.allPlayers(), 'e_1001').length)

/* 3. 签约池：跨赛事 / 无比赛球员不可签 */
var pool = engine.playablePool(mock.allCards(), 'e_1001')
var state0 = store.refreshDaily()
var sign = engine.signSameCity({
  players: store.playablePlayers(),
  eventId: state0.eventId,
  cityCode: state0.cityCode,
  ownedIds: state0.ownedIds,
  cursor: state0.cursor,
  mode: 'free_daily',
  dateKey: store.todayKey(),
  userId: state0.userId,
  quota: state0.signQuota,
  tier: state0.membership.tier
})
check('签约成功', sign.ok === true, sign.ok ? sign.player && sign.player.name : sign.message)
check('签约结果落在可玩池内', sign.ok === true && pool.some(function (p) { return p.playerId === sign.player.playerId }), sign.player && sign.player.playerId)
check('签约不会命中 p_1013 / p_2001', sign.ok === true && sign.player.playerId !== 'p_1013' && sign.player.playerId !== 'p_2001', sign.player && sign.player.playerId)

/* 4. 视图层：卡册分区收敛与范围文案 */
var access = store.accessView()
check('store.accessView 默认已认领 -> 允许', access.allowed === true, access.reasonText)

var albumReal = store.albumView('real')
check('卡册只两分区', albumReal.tabs.length === 2, albumReal.tabs.map(function (t) { return t.key }).join(','))
check('卡册无球迷分区', albumReal.tabs.every(function (t) { return t.key !== 'fanMade' }))

var albumFan = store.albumView('fanMade')
check('请求球迷分区自动落回真实分区', albumFan.activeKind === 'real', albumFan.activeKind)

var tiles = albumReal.tiles.map(function (t) { return t.id })
check('卡册真实分区全部属于本赛事可玩池', tiles.every(function (id) { return ids.indexOf(id) !== -1 }), tiles.join(','))

check('主卡范围文案含本赛事', /本赛事/.test(store.mainCardView().scopeText), store.mainCardView().scopeText)
check('我的页玩法范围可读', /本赛事/.test(store.meView().scopeText), store.meView().scopeText)

console.log('')
if (fails.length) {
  console.log('FAILED: ' + fails.length + ' 项')
  process.exit(1)
}
console.log('ALL PASSED')
