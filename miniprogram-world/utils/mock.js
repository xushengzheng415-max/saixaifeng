'use strict'
/**
 * 赛小蜂足球世界 · 本地演示数据
 *
 * 说明：本期是球员端工程搭建阶段，同城名册用本地样例数据跑通闭环；
 * 正式版这些字段由现有赛小蜂足球后端（球员主档 + 球员卡统一读取接口）返回，
 * 页面不得自行改写球员身份、卡面或等级。样例卡图统一使用一张演示卡。
 */

var CARD_IMAGE = '/assets/card/main-card.png'
var VIRTUAL_CARD_IMAGE = '/assets/card/main-card.png'
var FAN_CARD_IMAGE = '/assets/card/card-back.jpg'

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

var PLAYERS = [
  { playerId: 'p_1001', name: '铁栋泽', nameEn: 'TIE D.Z.', number: 10, position: 'FW', group: 'FW', skillTag: 'finishing', ovr: 84, appearances: 18, goals: 7, assists: 3, honors: 2, rosterOrder: 101, cityCode: '330100', main: true, portraitAuthorized: true },
  { playerId: 'p_1002', name: '周凯', nameEn: 'ZHOU K.', number: 8, position: 'MF', group: 'MF', skillTag: 'passing', ovr: 78, appearances: 16, goals: 3, assists: 6, honors: 1, rosterOrder: 102, cityCode: '330100', main: false, portraitAuthorized: true },
  { playerId: 'p_1003', name: '李昊', nameEn: 'LI H.', number: 4, position: 'DF', group: 'DF', skillTag: 'tackling', ovr: 76, appearances: 20, goals: 1, assists: 0, honors: 0, rosterOrder: 103, cityCode: '330100', main: false, portraitAuthorized: true },
  { playerId: 'p_1004', name: '陈宇', nameEn: 'CHEN Y.', number: 1, position: 'GK', group: 'GK', skillTag: 'saving', ovr: 79, appearances: 15, goals: 0, assists: 0, honors: 1, rosterOrder: 104, cityCode: '330100', main: false, portraitAuthorized: true },
  { playerId: 'p_1005', name: '王磊', nameEn: 'WANG L.', number: 9, position: 'FW', group: 'FW', skillTag: 'finishing', ovr: 80, appearances: 14, goals: 9, assists: 1, honors: 2, rosterOrder: 105, cityCode: '330100', main: false, portraitAuthorized: true },
  { playerId: 'p_1006', name: '赵鹏', nameEn: 'ZHAO P.', number: 5, position: 'DF', group: 'DF', skillTag: 'aerial', ovr: 74, appearances: 12, goals: 0, assists: 0, honors: 0, rosterOrder: 106, cityCode: '330100', main: false, portraitAuthorized: true },
  { playerId: 'p_1007', name: '孙浩', nameEn: 'SUN H.', number: 6, position: 'MF', group: 'MF', skillTag: 'passing', ovr: 77, appearances: 17, goals: 2, assists: 5, honors: 0, rosterOrder: 107, cityCode: '330100', main: false, portraitAuthorized: true },
  { playerId: 'p_1008', name: '吴辰', nameEn: 'WU C.', number: 3, position: 'DF', group: 'DF', skillTag: 'tackling', ovr: 72, appearances: 11, goals: 0, assists: 1, honors: 0, rosterOrder: 108, cityCode: '330100', main: false, portraitAuthorized: true },
  { playerId: 'p_1009', name: '郑凯文', nameEn: 'ZHENG K.W.', number: 7, position: 'MF', group: 'MF', skillTag: 'dribbling', ovr: 81, appearances: 19, goals: 4, assists: 4, honors: 1, rosterOrder: 109, cityCode: '330100', main: false, portraitAuthorized: true },
  { playerId: 'p_1010', name: '冯睿', nameEn: 'FENG R.', number: 22, position: 'GK', group: 'GK', skillTag: 'saving', ovr: 75, appearances: 9, goals: 0, assists: 0, honors: 0, rosterOrder: 110, cityCode: '330100', main: false, portraitAuthorized: true },
  { playerId: 'p_1011', name: '许卓', nameEn: 'XU Z.', number: 11, position: 'FW', group: 'FW', skillTag: 'pace', ovr: 78, appearances: 13, goals: 5, assists: 2, honors: 0, rosterOrder: 111, cityCode: '330100', main: false, portraitAuthorized: true },
  { playerId: 'p_1012', name: '何川', nameEn: 'HE C.', number: 14, position: 'MF', group: 'MF', skillTag: 'passing', ovr: 73, appearances: 10, goals: 1, assists: 3, honors: 0, rosterOrder: 112, cityCode: '330100', main: false, portraitAuthorized: true },
  /* 非同城样例：用于验证「只签同城」与跨城拒绝 */
  { playerId: 'p_2001', name: '邵然', nameEn: 'SHAO R.', number: 10, position: 'FW', group: 'FW', skillTag: 'finishing', ovr: 79, appearances: 12, goals: 6, assists: 1, honors: 0, rosterOrder: 201, cityCode: '330200', main: false, portraitAuthorized: true }
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

/**
 * 球迷自制卡样例：第一版只做展示与分享，不进 PK、不可交易、不可被他人用于阵容。
 * 正式版须经服务端内容安全校验与审核后才可见。
 */
var FAN_CARDS = [
  { cardId: 'f_3001', name: '看台大王', nameEn: 'STAND KING', series: '球迷自制 · 看台文化', tagText: '自制 #01' }
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

function allPlayers() {
  return PLAYERS.map(function (player) {
    return copyCard(player, 'real', CARD_IMAGE)
  })
}

/** 三类卡全集：真实（赛事发放）+ 虚拟（娱乐图鉴）+ 球迷自制（展示分享）。 */
function allCards() {
  var list = allPlayers()
  for (var i = 0; i < VIRTUAL_CARDS.length; i++) {
    list.push(copyCard(VIRTUAL_CARDS[i], 'virtual', VIRTUAL_CARD_IMAGE))
  }
  for (var j = 0; j < FAN_CARDS.length; j++) {
    list.push(copyCard(FAN_CARDS[j], 'fanMade', FAN_CARD_IMAGE))
  }
  return list
}

module.exports = {
  CARD_IMAGE: CARD_IMAGE,
  VIRTUAL_CARD_IMAGE: VIRTUAL_CARD_IMAGE,
  FAN_CARD_IMAGE: FAN_CARD_IMAGE,
  CITY: CITY,
  POSITION_LABELS: POSITION_LABELS,
  SKILL_LABELS: SKILL_LABELS,
  PLAYERS: PLAYERS,
  VIRTUAL_CARDS: VIRTUAL_CARDS,
  FAN_CARDS: FAN_CARDS,
  MEMBERSHIP: MEMBERSHIP,
  allPlayers: allPlayers,
  allCards: allCards
}
