'use strict'
/**
 * 赛小蜂足球世界 · 数据访问层
 *
 * 当前实现：本地演示适配器（utils/store.js + utils/engine.js），用于没有后端时跑通玩法闭环。
 * 正式版：下面每个方法换成 webLoginApi 的 action 调用（例如 cardWorldMainCard / cardWorldAlbum /
 * cardWorldSignSameCity / cardWorldLineup / cardWorldBattle / cardWorldBattleLog / cardWorldMembership），
 * 页面不改。接入时只允许服务端返回确定性结果，前端不得上传分数、卡级或自判资格。
 */

var engine = require('./engine')
var mock = require('./mock')
var store = require('./store')

var MODE = 'local' // 'local' | 'cloud'

function fail(code, message) {
  var err = new Error(message || engine.codeMessage(code) || '操作失败，请重试')
  err.code = code || ''
  return err
}

function wrap(fn) {
  return new Promise(function (resolve, reject) {
    try {
      resolve(fn())
    } catch (e) {
      reject(e)
    }
  })
}

/* ---------------- 只读 ---------------- */

function login() {
  return wrap(function () {
    var state = store.getState()
    return { userId: state.userId, cityCode: state.cityCode, cityName: state.cityName, mode: MODE }
  })
}

function getMainCard() {
  return wrap(function () {
    return store.mainCardView()
  })
}

function getAlbum() {
  return wrap(function () {
    return store.albumView()
  })
}

function getLineup() {
  return wrap(function () {
    return store.lineupView('')
  })
}

function getBattleLog() {
  return wrap(function () {
    return store.battleLogView()
  })
}

function getOwnedCards() {
  return wrap(function () {
    return store.ownedChips()
  })
}

function getMembership() {
  return wrap(function () {
    var state = store.refreshDaily()
    var view = engine.membershipView(state.membership)
    return {
      tier: view.tier,
      tierText: view.tierText,
      dailySignQuota: view.dailySignQuota,
      rosterUnlocks: view.rosterUnlocks,
      autoRenew: view.autoRenew,
      autoRenewAllowed: view.autoRenewAllowed,
      isMinor: view.isMinor,
      minorNotice: view.isMinor ? '未成年账号不能开启自动续费' : ''
    }
  })
}

/* ---------------- 写 ---------------- */

/**
 * 同城确定性签约。
 * @param {object} options { mode, filter }
 */
function signSameCity(options) {
  return wrap(function () {
    var opts = options || {}
    var state = store.refreshDaily()
    var result = engine.signSameCity({
      players: store.allPlayers(),
      cityCode: state.cityCode,
      ownedIds: state.ownedIds,
      cursor: state.cursor,
      mode: opts.mode || 'free_daily',
      filter: opts.filter || null,
      dateKey: store.todayKey(),
      userId: state.userId,
      quota: state.quota,
      tier: state.membership.tier
    })
    if (!result.ok) throw fail(result.code, result.message)

    state.ownedIds.push(result.player.playerId)
    state.cursor = result.nextCursor
    state.quota = result.quota
    state.lastSignedName = result.player.name
    state.lastSignAt = Date.now()
    store.save()

    var p = store.player(result.player.playerId) || result.player
    return {
      ok: true,
      card: {
        cardId: 'c_' + p.playerId,
        playerId: p.playerId,
        name: p.name,
        nameEn: p.nameEn,
        numberText: '#' + p.number,
        positionLabel: p.positionLabel,
        skillLabel: p.skillLabel,
        ovrText: String(p.ovr),
        cardUrl: p.cardUrl,
        cityCode: p.cityCode
      },
      signQuota: {
        dailyFreeLeft: engine.dailyFreeLeft(state.quota, state.membership.tier),
        dailyFreeTotal: state.quota.freeTotal,
        directedLeft: state.quota.directedLeft
      },
      deterministicKey: result.deterministicKey
    }
  })
}

/** 切换编制：未解锁返回 ROSTER_LOCKED。已解锁时保留同组球员位置。 */
function setRosterSize(size) {
  return wrap(function () {
    var state = store.refreshDaily()
    var next = Math.round(size || 0)
    if (next !== 5 && next !== 8 && next !== 11) {
      throw fail(engine.CODES.MODE_INVALID, '编制人数无效')
    }
    var check = engine.validateLineup({
      slots: engine.buildSlots(next),
      rosterSize: next,
      ownedIds: state.ownedIds,
      playersById: store.playersById(),
      unlocks: state.membership.rosterUnlocks
    })
    /* 未解锁时 validateLineup 会先返回 ROSTER_LOCKED；空阵容返回 LINEUP_INVALID 属正常 */
    if (!check.ok && check.code === engine.CODES.ROSTER_LOCKED) throw fail(check.code, check.message)

    var map = store.playersById()
    var old = state.slots || []
    var slots = engine.buildSlots(next)
    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i]
      for (var j = 0; j < old.length; j++) {
        var prev = old[j]
        if (!prev.playerId) continue
        if (prev.playerId === slot.playerId) continue
        var p = map[prev.playerId]
        if (!p) continue
        if (p.group === slot.group) {
          var used = false
          for (var k = 0; k < slots.length; k++) {
            if (slots[k].playerId === prev.playerId) used = true
          }
          if (!used) slot.playerId = prev.playerId
        }
      }
    }
    state.rosterSize = next
    state.slots = slots
    store.save()
    return store.lineupView('')
  })
}

function setSlot(key, playerId) {
  return wrap(function () {
    var state = store.refreshDaily()
    if (!key) throw fail(engine.CODES.LINEUP_INVALID, '缺少槽位')
    if (playerId && state.ownedIds.indexOf(playerId) < 0) {
      throw fail(engine.CODES.LINEUP_INVALID, '只能使用卡册内的球员卡')
    }
    for (var i = 0; i < state.slots.length; i++) {
      if (state.slots[i].playerId === playerId) state.slots[i].playerId = ''
    }
    for (var j = 0; j < state.slots.length; j++) {
      if (state.slots[j].key === key) state.slots[j].playerId = playerId || ''
    }
    store.save()
    return store.lineupView(key)
  })
}

function saveLineup(slots) {
  return wrap(function () {
    var state = store.refreshDaily()
    var candidate = slots || state.slots
    var check = engine.validateLineup({
      slots: candidate,
      rosterSize: state.rosterSize,
      ownedIds: state.ownedIds,
      playersById: store.playersById(),
      unlocks: state.membership.rosterUnlocks
    })
    if (!check.ok) throw fail(check.code, check.message)
    state.slots = candidate
    store.save()
    return { ok: true, power: check.power, rosterSize: state.rosterSize }
  })
}

/** 发起轻对战：同阵容 + 同对手 + 同规则 = 同一结果。 */
function battle(options) {
  return wrap(function () {
    var opts = options || {}
    var state = store.refreshDaily()
    if (state.rosterSize !== 5) throw fail(engine.CODES.ROSTER_LOCKED, '本期仅开放 5 人新手场')
    var map = store.playersById()
    var check = engine.validateLineup({
      slots: state.slots,
      rosterSize: 5,
      ownedIds: state.ownedIds,
      playersById: map,
      unlocks: state.membership.rosterUnlocks
    })
    if (!check.ok) throw fail(check.code, check.message)

    var seed = store.todayKey() + '|' + state.userId
    var opponent = engine.buildSystemOpponent({
      players: store.allPlayers(),
      cityCode: state.cityCode,
      seed: seed
    })
    var result = engine.battleResult({
      lineupId: 'lu_' + state.rosterSize + '_' + state.userId,
      lineupSlots: state.slots,
      opponentSlots: opponent.slots,
      playersById: map,
      opponent: { type: opponent.type, opponentId: opponent.opponentId }
    })

    var entry = engine.battleLogEntry(result, {
      mode: 'newbie_5v5',
      opponentLabel: opponent.label
    })
    state.battleLog.unshift(entry)
    state.battleLog = engine.trimBattleLog(state.battleLog, 20)
    store.save()

    return {
      battleId: result.battleId,
      scoreMine: result.scoreMine,
      scoreOpp: result.scoreOpp,
      result: result.result,
      comment: result.comment,
      badges: result.badges,
      deterministicKey: result.deterministicKey,
      opponentLabel: opponent.label,
      opponentRows: engine.pitchRows(opponent.slots, map, ''),
      myRows: engine.pitchRows(state.slots, map, ''),
      myPower: result.powerMine,
      oppPower: result.powerOpp
    }
  })
}

function setAutoRenew(enabled) {
  return wrap(function () {
    var state = store.getState()
    var result = engine.setAutoRenew(state.membership, enabled)
    if (!result.ok) throw fail(result.code, result.message)
    state.membership = result.member
    store.save()
    return getMembership()
  })
}

module.exports = {
  MODE: MODE,
  login: login,
  getMainCard: getMainCard,
  getAlbum: getAlbum,
  getLineup: getLineup,
  getOwnedCards: getOwnedCards,
  getBattleLog: getBattleLog,
  getMembership: getMembership,
  signSameCity: signSameCity,
  setRosterSize: setRosterSize,
  setSlot: setSlot,
  saveLineup: saveLineup,
  battle: battle,
  setAutoRenew: setAutoRenew
}
