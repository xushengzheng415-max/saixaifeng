'use strict'
/**
 * 赛事直播内核（服务端共享，纯函数）
 *
 * 被两端共用：
 * - 服务号 H5 球员卡玩法 `playerCardGame.cjs`（事件先于比分，事件反推比分）
 * - 球员端小程序卡世界 `cardWorld.cjs`（比分先于事件，事件只做逐分钟呈现）
 *
 * 约束：
 * 1. 事件流一律由种子确定性生成，同一 seed 重放结果一致。
 * 2. 直播只改「揭示」，不改最终比分；中场调整只重排本方下半场事件、进球数沿用原下半场。
 * 3. 本文件不读数据库、不发请求、不依赖页面，可在 node 下单测。
 */

const LIVE_SECONDS_PER_MINUTE = 1
const LIVE_FULL_MINUTE = 90
const LIVE_HALFTIME_MINUTE = 45
// 中场休息真实秒数：这段时间允许每方免费调整一次（换人），结束后自动进入下半场
const LIVE_HALFTIME_SECONDS = 20

/** 以 seedText 为种子的确定性随机源 */
function seededRand(seedText) {
  let h = 1779033703 ^ seedText.length
  for (let i = 0; i < seedText.length; i++) { h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19) }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

function poisson(lambda, rand) {
  const limit = Math.exp(-lambda)
  let k = 0, p = 1
  do { k++; p *= rand() } while (p > limit && k < 12)
  return k - 1
}

/** 位置进球权重：前锋最高、门将最低 */
function roleWeight(role) {
  return /^FW/.test(role) ? 5 : /^MF/.test(role) ? 3 : /^GK/.test(role) ? 0.15 : 1.2
}

/**
 * 直播进度：按真实时间把比赛映射成已进行到的分钟，支持中场暂停。
 * 老战绩没有 live 字段，一律视为已结束（不再揭示、不再补结算）。
 */
function liveProgressOf(match, nowMs) {
  const live = match && match.live && Number(match.live.startAtMs) > 0 ? match.live : null
  if (!live) {
    return { live: false, fulltime: true, minute: LIVE_FULL_MINUTE, fullMinute: LIVE_FULL_MINUTE, halftimeMinute: LIVE_HALFTIME_MINUTE, halftimeSeconds: 0, progress: 1, secPerMinute: LIVE_SECONDS_PER_MINUTE, phase: 'fulltime', halftimeRemainSec: 0 }
  }
  const secPerMinute = Number(live.secPerMinute) > 0 ? Number(live.secPerMinute) : LIVE_SECONDS_PER_MINUTE
  const fullMinute = Number(live.fullMinute) > 0 ? Number(live.fullMinute) : LIVE_FULL_MINUTE
  const halftimeMinute = Number(live.halftimeMinute) > 0 ? Number(live.halftimeMinute) : LIVE_HALFTIME_MINUTE
  const halftimeSeconds = Number(live.halftimeSeconds) >= 0 ? Number(live.halftimeSeconds) : 0
  const elapsedSec = Math.max(0, (Number(nowMs) - Number(live.startAtMs)) / 1000)
  const firstHalfEndSec = halftimeMinute * secPerMinute
  const secondHalfStartSec = firstHalfEndSec + halftimeSeconds
  let minute, phase
  if (elapsedSec < firstHalfEndSec) {
    minute = Math.min(halftimeMinute - 1, Math.floor(elapsedSec / secPerMinute))
    phase = 'firstHalf'
  } else if (elapsedSec < secondHalfStartSec) {
    minute = halftimeMinute
    phase = 'halftime'
  } else {
    minute = halftimeMinute + Math.floor((elapsedSec - secondHalfStartSec) / secPerMinute)
    phase = 'secondHalf'
  }
  const fulltime = minute >= fullMinute
  if (fulltime) { minute = fullMinute; phase = 'fulltime' }
  const halftimeRemainSec = phase === 'halftime' ? Math.max(0, Math.ceil(secondHalfStartSec - elapsedSec)) : 0
  return { live: true, fulltime, minute, fullMinute, halftimeMinute, halftimeSeconds, progress: minute / fullMinute, secPerMinute, phase, halftimeRemainSec }
}

/** 直播快照：只揭示已进行分钟的事件，比分按已发生进球累加。 */
function liveSnapshotOf(match, openId, progress) {
  const mineIsChallenger = String(match.challengerOpenId) === String(openId)
  const mineSide = mineIsChallenger ? match.challenger : match.defender
  const otherSide = mineIsChallenger ? match.defender : match.challenger
  const all = Array.isArray(match.events) ? match.events : []
  const visible = progress.fulltime ? all : all.filter(ev => Number(ev.minute) <= progress.minute)
  let mineGoals = 0, opponentGoals = 0
  const events = visible.map(ev => {
    const mineEvent = mineIsChallenger ? String(ev.side) === 'challenger' : String(ev.side) === 'defender'
    const type = String(ev.type || '')
    if (type === 'goal') { if (mineEvent) mineGoals += 1; else opponentGoals += 1 }
    return { minute: Number(ev.minute) || 0, type, side: String(ev.side || ''), mine: mineEvent, player: String(ev.player || ''), out: String(ev.out || '') }
  })
  return {
    matchId: match._id,
    role: mineIsChallenger ? 'challenger' : 'defender',
    mine: { name: String((mineSide && mineSide.name) || ''), points: Number(mineSide && mineSide.totalPoints) || 0 },
    theirs: { name: String((otherSide && otherSide.name) || ''), points: Number(otherSide && otherSide.totalPoints) || 0 },
    score: { mine: mineGoals, opponent: opponentGoals },
    events,
    totalEvents: all.length
  }
}

/** 我方下半场事件重建：进球数沿用原下半场，只换射手与人名来源。 */
function rebuildSideSecondHalf({ side, sideKey, goals, seedText, takenMinutes }) {
  const rand = seededRand(seedText)
  const usedMinutes = new Set(takenMinutes || [])
  const minuteOf = (min, max) => {
    for (let t = 0; t < 12; t++) { const m = min + Math.floor(rand() * (max - min + 1)); if (!usedMinutes.has(m)) { usedMinutes.add(m); return m } }
    return min + Math.floor(rand() * (max - min + 1))
  }
  const pool = (Array.isArray(side.slots) ? side.slots : []).filter(slot => slot.counted !== false)
  const pickScorer = () => {
    const total = pool.reduce((sum, slot) => sum + roleWeight(slot.role), 0) || 1
    let roll = rand() * total
    for (const slot of pool) { roll -= roleWeight(slot.role); if (roll <= 0) return slot.name }
    return pool.length ? pool[0].name : '球员'
  }
  const pickOne = () => pool.length ? pool[Math.floor(rand() * pool.length)].name : '球员'
  const events = []
  for (let g = 0; g < Math.max(0, Number(goals) || 0); g++) events.push({ minute: minuteOf(47, 90), type: 'goal', side: sideKey, player: pickScorer() })
  const yellows = Math.min(3, poisson(1.1, rand))
  for (let i = 0; i < yellows; i++) events.push({ minute: minuteOf(48, 90), type: 'yellow', side: sideKey, player: pickOne() })
  const subs = Math.min(2, poisson(0.9, rand))
  for (let i = 0; i < subs; i++) events.push({ minute: minuteOf(60, 88), type: 'sub', side: sideKey, player: pickOne() })
  return events
}

/**
 * 由「最终比分」派生 90 分钟事件（卡世界用法：比分是权威，事件只做呈现）。
 * @param {object} opts { sides:{challenger,defender}, goals:{challenger,defender}, seedText }
 */
function buildEventStream(opts) {
  const options = opts || {}
  const sides = options.sides || {}
  const goals = options.goals || {}
  const rand = seededRand(String(options.seedText || ''))
  const events = []
  const usedMinutes = new Set()
  const minuteOf = (min, max) => {
    for (let t = 0; t < 12; t++) { const m = min + Math.floor(rand() * (max - min + 1)); if (!usedMinutes.has(m)) { usedMinutes.add(m); return m } }
    return min + Math.floor(rand() * (max - min + 1))
  }
  const poolOf = key => {
    const side = sides[key] || {}
    return (Array.isArray(side.slots) ? side.slots : []).filter(slot => slot.counted !== false && String(slot.name || '').trim())
  }
  const pickScorer = key => {
    const pool = poolOf(key)
    const total = pool.reduce((sum, slot) => sum + roleWeight(slot.role), 0) || 1
    let roll = rand() * total
    for (const slot of pool) { roll -= roleWeight(slot.role); if (roll <= 0) return slot.name }
    return pool.length ? pool[0].name : '球员'
  }
  const pickOne = key => {
    const pool = poolOf(key)
    return pool.length ? pool[Math.floor(rand() * pool.length)].name : '球员'
  }
  const sideKeys = ['challenger', 'defender']
  for (const key of sideKeys) {
    const count = Math.max(0, Math.min(9, Math.round(Number(goals[key]) || 0)))
    for (let i = 0; i < count; i++) events.push({ minute: minuteOf(2, 90), type: 'goal', side: key, player: pickScorer(key) })
  }
  const yellows = Math.min(5, poisson(1.7, rand))
  for (let i = 0; i < yellows; i++) {
    const key = rand() < 0.5 ? 'challenger' : 'defender'
    events.push({ minute: minuteOf(5, 90), type: 'yellow', side: key, player: pickOne(key) })
  }
  if (rand() < 0.06) {
    const key = rand() < 0.5 ? 'challenger' : 'defender'
    events.push({ minute: minuteOf(30, 90), type: 'red', side: key, player: pickOne(key) })
  }
  for (const key of sideKeys) {
    const subs = Math.min(3, poisson(1.6, rand))
    for (let i = 0; i < subs; i++) {
      if (!poolOf(key).length) break
      events.push({ minute: minuteOf(46, 88), type: 'sub', side: key, player: pickOne(key) })
    }
  }
  events.sort((a, b) => a.minute - b.minute)
  return events
}

module.exports = {
  LIVE_SECONDS_PER_MINUTE,
  LIVE_FULL_MINUTE,
  LIVE_HALFTIME_MINUTE,
  LIVE_HALFTIME_SECONDS,
  seededRand,
  poisson,
  roleWeight,
  liveProgressOf,
  liveSnapshotOf,
  rebuildSideSecondHalf,
  buildEventStream
}
