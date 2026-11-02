'use strict'
/**
 * 赛小蜂足球世界 · 本地演示数据
 *
 * 说明：本期是球员端工程搭建阶段，赛事名册用本地样例数据跑通闭环；
 * 正式版这些字段由现有赛小蜂足球后端（球员主档 + 球员卡统一读取接口）返回，
 * 页面不得自行改写球员身份、卡面或等级。样例卡图统一使用一张演示卡。
 *
 * 开放范围（2026-11-02 用户确认）：
 *   1. 玩法只对「已认领球员卡」的用户开放；
 *   2. 只能玩「本赛事」的球员，跨赛事球员一律不进入卡池；
 *   3. 不开放球迷自制卡；
 *   4. 本赛事内没有比赛记录的球员不进入卡池。
 */

var CARD_IMAGE = '/assets/card/main-card.png'
var VIRTUAL_CARD_IMAGE = '/assets/card/main-card.png'

/**
 * 当前开放赛事。正式版由服务端按登录用户所在赛事下发；
 * 前端只读展示，不得自行改写赛事范围或跨赛事拼池。
 */
var EVENT = {
  eventId: 'e_1001',
  name: '2026 杭州市青少年足球联赛',
  shortName: '杭青联赛',
  divisionLabel: 'U10 竞赛组别',
  cityCode: '330100',
  statusText: '进行中'
}

/**
 * 当前账号已认领的球员卡。正式版由服务端认领关系返回；
 * 缺失、未审核通过或指向其他赛事时，玩法一律不开放。
 */
var CLAIM = {
  claimed: true,
  playerId: 'p_1001',
  eventId: 'e_1001',
  statusText: '已认领'
}

var POSITION_LABELS = {
  GK: '门将',
  DF: '后卫',
  MF: '中场',
  FW: '前锋'
}

var SKILL_LABELS = {
  finishing: '终结',
  passing: '传球',
  dribbling: '盘带',
  tackling: '拦截',
  aerial: '争顶',
  saving: '扑救',
  pace: '速度'
}

var CITY = { code: '330100', name: '杭州' }

/* 名册内 eventId 标记所属赛事，appearances 为本赛事已出场次数（无比赛记录为 0）。 */
var PLAYERS = [
  { playerId: 'p_1001', eventId: 'e_1001', name: '铁栋泽', nameEn: 'TIE D.Z.', number: 10, position: 'FW', group: 'FW', skillTag: 'finishing', ovr: 84, appearances: 18, goals: 7, assists: 3, honors: 2, rosterOrder: 101, cityCode: '330100', main: true, portraitAuthorized: true },
  { playerId: 'p_1002', eventId: 'e_1001', name: '周凯', nameEn: 'ZHOU K.', number: 8, position: 'MF', group: 'MF', skillTag: 'passing', ovr: 78, appearances: 16, goals: 3, assists: 6, honors: 1, rosterOrder: 102, cityCode: '330100', main: false, portraitAuthorized: true },
  { playerId: 'p_1003', eventId: 'e_1001', name: '李昊', nameEn: 'LI H.', number: 4, position: 'DF', group: 'DF', skillTag: 'tackling', ovr: 76, appearances: 20, goals: 1, assists: 0, honors: 0, rosterOrder: 103, cityCode: '330100', main: false, portraitAuthorized: true },
  { playerId: 'p_1004', eventId: 'e_1001', name: '陈宇', nameEn: 'CHEN Y.', number: 1, position: 'GK', group: 'GK', skillTag: 'saving', ovr: 79, appearances: 15, goals: 0, assists: 0, honors: 1, rosterOrder: 104, cityCode: '330100', main: false, portraitAuthorized: true },
  { playerId: 'p_1005', eventId: 'e_1001', name: '王磊', nameEn: 'WANG L.', number: 9, position: 'FW', group: 'FW', skillTag: 'finishing', ovr: 80, appearances: 14, goals: 9, assists: 1, honors: 2, rosterOrder: 105, cityCode: '330100', main: false, portraitAuthorized: true },
  { playerId: 'p_1006', eventId: 'e_1001', name: '赵鹏', nameEn: 'ZHAO P.', number: 5, position: 'DF', group: 'DF', skillTag: 'aerial', ovr: 74, appearances: 12, goals: 0, assists: 0, honors: 0, rosterOrder: 106, cityCode: '330100', main: false, portraitAuthorized: true },
  { playerId: 'p_1007', eventId: 'e_1001', name: '孙浩', nameEn: 'SUN H.', number: 6, position: 'MF', group: 'MF', skillTag: 'passing', ovr: 77, appearances: 17, goals: 2, assists: 5, honors: 0, rosterOrder: 107, cityCode: '330100', main: false, portraitAuthorized: true },
  { playerId: 'p_1008', eventId: 'e_1001', name: '吴辰', nameEn: 'WU C.', number: 3, position: 'DF', group: 'DF', skillTag: 'tackling', ovr: 72, appearances: 11, goals: 0, assists: 1, honors: 0, rosterOrder: 108, cityCode: '330100', main: false, portraitAuthorized: true },
  { playerId: 'p_1009', eventId: 'e_1001', name: '郑凯文', nameEn: 'ZHENG K.W.', number: 7, position: 'MF', group: 'MF', skillTag: 'dribbling', ovr: 81, appearances: 19, goals: 4, assists: 4, honors: 1, rosterOrder: 109, cityCode: '330100', main: false, portraitAuthorized: true },
  { playerId: 'p_1010', eventId: 'e_1001', name: '冯睿', nameEn: 'FENG R.', number: 22, position: 'GK', group: 'GK', skillTag: 'saving', ovr: 75, appearances: 9, goals: 0, assists: 0, honors: 0, rosterOrder: 110, cityCode: '330100', main: false, portraitAuthorized: true },
  { playerId: 'p_1011', eventId: 'e_1001', name: '许卓', nameEn: 'XU Z.', number: 11, position: 'FW', group: 'FW', skillTag: 'pace', ovr: 78, appearances: 13, goals: 5, assists: 2, honors: 0, rosterOrder: 111, cityCode: '330100', main: false, portraitAuthorized: true },
  { playerId: 'p_1012', eventId: 'e_1001', name: '何川', nameEn: 'HE C.', number: 14, position: 'MF', group: 'MF', skillTag: 'passing', ovr: 73, appearances: 10, goals: 1, assists: 3, honors: 0, rosterOrder: 112, cityCode: '330100', main: false, portraitAuthorized: true },
  /* 负例：本赛事在册但本赛季尚无比赛记录，不进入卡池与签约池 */
  { playerId: 'p_1013', eventId: 'e_1001', name: '林越', nameEn: 'LIN Y.', number: 16, position: 'MF', group: 'MF', skillTag: 'passing', ovr: 70, appearances: 0, goals: 0, assists: 0, honors: 0, rosterOrder: 113, cityCode: '330100', main: false, portraitAuthorized: true },
  /* 负例：其他赛事球员，不进入本赛事卡池（即使同城） */
  { playerId: 'p_2001', eventId: 'e_2002', name: '邵然', nameEn: 'SHAO R.', number: 10, position: 'FW', group: 'FW', skillTag: 'finishing', ovr: 79, appearances: 12, goals: 6, assists: 1, honors: 0, rosterOrder: 201, cityCode: '330100', main: false, portraitAuthorized: true }
]

var MEMBERSHIP = {
  tier: 'none',
  isMinor: false,
  autoRenew: false,
  rosterUnlocks: { size8: false, size11: false }
}

/**
 * 国漫虚拟卡样例：只进娱乐图鉴，不计分、不进阵容、不参与评估与榜单。
 * 正式版由活动/图鉴接口发放，卡面不得由前端合成。
 */
var VIRTUAL_CARDS = [
  { cardId: 'v_2001', name: '青锋少年', nameEn: 'QING FENG', series: '国漫 · 青锋篇', tagText: '虚拟 #01' },
  { cardId: 'v_2002', name: '赤焰门将', nameEn: 'BLAZE GK', series: '国漫 · 赤焰篇', tagText: '虚拟 #02' }
]

function copyCard(card, kind, image) {
  var p = {}
  for (var k in card) {
    if (Object.prototype.hasOwnProperty.call(card, k)) p[k] = card[k]
  }
  p.cardKind = kind
  p.cardUrl = image
  p.positionLabel = POSITION_LABELS[p.group] || ''
  p.skillLabel = SKILL_LABELS[p.skillTag] || ''
  p.numberText = typeof p.number === 'number' ? '#' + p.number : ''
  p.metaText = p.positionLabel ? (p.positionLabel + ' · ' + p.numberText) : (p.series || '')
  p.scoreLine = typeof p.ovr === 'number' ? ('综合 ' + p.ovr) : '不计分'
  return p
}

/** 全部球员（含跨赛事与无比赛负例），仅用于负例校验与调试，不进玩法池。 */
function allPlayers() {
  return PLAYERS.map(function (player) {
    return copyCard(player, 'real', CARD_IMAGE)
  })
}

/** 是否属于可玩池：本赛事 + 有比赛记录。 */
function isPlayablePlayer(player, eventId) {
  if (!player) return false
  if (player.eventId !== eventId) return false
  return typeof player.appearances === 'number' && player.appearances > 0
}

/** 可玩球员池：本赛事内且已有比赛记录的球员。 */
function eventPlayers(eventId) {
  var target = eventId || EVENT.eventId
  return allPlayers().filter(function (player) {
    return isPlayablePlayer(player, target)
  })
}

/** 两类卡全集：真实（本赛事球员）+ 虚拟（娱乐图鉴）。球迷自制卡本期不开放。 */
function allCards() {
  var list = eventPlayers()
  for (var i = 0; i < VIRTUAL_CARDS.length; i++) {
    list.push(copyCard(VIRTUAL_CARDS[i], 'virtual', VIRTUAL_CARD_IMAGE))
  }
  return list
}

module.exports = {
  CARD_IMAGE: CARD_IMAGE,
  VIRTUAL_CARD_IMAGE: VIRTUAL_CARD_IMAGE,
  CITY: CITY,
  EVENT: EVENT,
  CLAIM: CLAIM,
  POSITION_LABELS: POSITION_LABELS,
  SKILL_LABELS: SKILL_LABELS,
  PLAYERS: PLAYERS,
  VIRTUAL_CARDS: VIRTUAL_CARDS,
  MEMBERSHIP: MEMBERSHIP,
  allPlayers: allPlayers,
  eventPlayers: eventPlayers,
  isPlayablePlayer: isPlayablePlayer,
  allCards: allCards
}
