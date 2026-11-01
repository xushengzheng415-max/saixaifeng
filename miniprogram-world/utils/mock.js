'use strict'
/**
 * 赛小蜂足球世界 · 本地演示数据
 *
 * 说明：本期是球员端工程搭建阶段，同城名册用本地样例数据跑通闭环；
 * 正式版这些字段由现有赛小蜂足球后端（球员主档 + 球员卡统一读取接口）返回，
 * 页面不得自行改写球员身份、卡面或等级。样例卡图统一使用一张演示卡。
 */

var CARD_IMAGE = '/assets/card/main-card.png'

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

function withCard(player) {
  var p = {}
  for (var k in player) {
    if (Object.prototype.hasOwnProperty.call(player, k)) p[k] = player[k]
  }
  p.cardUrl = CARD_IMAGE
  p.positionLabel = POSITION_LABELS[p.group] || ''
  p.skillLabel = SKILL_LABELS[p.skillTag] || ''
  return p
}

function allPlayers() {
  return PLAYERS.map(withCard)
}

module.exports = {
  CARD_IMAGE: CARD_IMAGE,
  CITY: CITY,
  POSITION_LABELS: POSITION_LABELS,
  SKILL_LABELS: SKILL_LABELS,
  PLAYERS: PLAYERS,
  MEMBERSHIP: MEMBERSHIP,
  allPlayers: allPlayers
}
