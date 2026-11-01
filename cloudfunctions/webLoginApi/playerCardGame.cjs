'use strict'
// 球员卡玩法（服务号 H5）：送出 / 收集图鉴 / 组建阵容 / 异步 PK。
// 已确认规则：
// - 卡片不转移所有权；送出 = 持卡人授权公开引用（写 players.playerCardPublic，
//   该字段是 data-center write-policy 唯一放行的 playerCard* 直写字段），可随时收回。
// - 收集范围：全平台已公开卡（share active 且 players.playerCardPublic===true）。
// - 等级与积分一律取 dataCenter 服务端口径；前端传入的分数、卡级只作展示，不作判定。
// - 身份 = fan_h5_sessions 的 serviceAccountOpenId；拥有关系与 playerCards.cjs 一致
//   （parent_profile_submissions + owns()）。
const crypto = require('node:crypto')
const service = require('./data-center/service.cjs')
const { readCards } = require('./playerCardReader.cjs')
const formations = require('./sharedFormation.cjs')

const SHARES = 'player_card_game_shares'
const COLLECTIONS = 'player_card_game_collections'
const LINEUPS = 'player_card_game_lineups'
const MATCHES = 'player_card_game_matches'
const COACH_CARDS = 'player_card_game_coaches'
const SKILLS = 'player_card_game_skills'
const RUNES = 'player_card_game_runes'
const RULES_VERSION = 'player-card-game/3'
const TIERS = ['bronze', 'silver', 'gold', 'epic', 'legendary']
// 卡种固定战力加成（在 powerFromAttrs 之后叠加）
const TIER_BONUS = { bronze: 0, silver: 0, gold: 0, epic: 3, legendary: 5 }
// ---------- 教练卡 ----------
const COACH_LEVEL_MAX = 30
const COACH_EXP_NEEDED = level => level * 80
const COACH_UNLOCKS = {
  1: { formations: [5], tacticSlots: 0, skillSlots: 0, runeSlots: 0 },
  5: { formations: [5, 7], tacticSlots: 1, skillSlots: 0, runeSlots: 0 },
  10: { formations: [5, 7, 8], tacticSlots: 1, skillSlots: 1, runeSlots: 0 },
  15: { formations: [5, 7, 8, 9], tacticSlots: 1, skillSlots: 1, runeSlots: 1 },
  20: { formations: [5, 7, 8, 9, 11], tacticSlots: 2, skillSlots: 1, runeSlots: 1 },
  25: { formations: [5, 7, 8, 9, 11], tacticSlots: 2, skillSlots: 2, runeSlots: 2 },
  30: { formations: [5, 7, 8, 9, 11], tacticSlots: 2, skillSlots: 2, runeSlots: 2 }
}
// ---------- 符文卡（有耐久度） ----------
const RUNE_QUALITIES = ['normal', 'fine', 'rare', 'epic']
const RUNE_ATTRS = {
  normal: { bonus: 2, maxDurability: 3 },
  fine: { bonus: 3, maxDurability: 5 },
  rare: { bonus: 4, maxDurability: 8 },
  epic: { bonus: 5, maxDurability: 12 }
}
const RUNE_TYPES = ['shooting', 'passing', 'defending', 'pace', 'stamina', 'awareness']
// ---------- 技能卡（消耗品，赛前使用） ----------
const SKILL_TYPES = {
  counter_attack: { name: '反击战术', effect: { type: 'team_boost', value: 5 } },
  iron_defense: { name: '铁桶阵', effect: { type: 'defense_boost', value: -0.3 } },
  core_motivation: { name: '核心激励', effect: { type: 'form_double', value: 2 } },
  target_deployment: { name: '针对部署', effect: { type: 'target_nerf', value: -10 } }
}
const MAX_LINEUPS = 5
const PAGE_LIMIT = 20
const FORMATION_COUNTS = [5, 7, 8, 9, 11]
// 人机对手：虚拟球队池（「赛小蜂平台演示数据」机构），前期填充挑战列表
const DEMO_ORG_ID = '6ad5e27d0c3bba9a50b65592'
const BOT_TARGET = 6
const BOT_OPENID_PREFIX = 'bot:pcg:'
const BOT_ID_PREFIX = 'botp:pcg:'
const BOT_NICKNAMES = ['铁血领队', '青训老炮', '冠军教头', '球场老司机', '战术大师', '蜜蜂助教']
// 人机阵容目标战力梯度：弱/中/强都有，胜负自然交替
const BOT_POWER = [245, 285, 315, 355, 395, 455]

const text = value => typeof value === 'string' ? value.trim() : ''
const sha = value => crypto.createHash('sha256').update(value).digest('hex')
const shareIdFor = playerId => sha(JSON.stringify([String(playerId)]))
const collectionIdFor = (collectorOpenId, shareId) => sha(JSON.stringify([String(collectorOpenId), String(shareId)]))
const lineupIdFor = (ownerOpenId, lineupKey) => sha(JSON.stringify([String(ownerOpenId), String(lineupKey)]))
const matchIdFor = (challengerOpenId, defenderLineupId, windowKey) => sha(JSON.stringify([String(challengerOpenId), String(defenderLineupId), String(windowKey)]))
const fail = (code, error) => ({ success: false, code, error })
const dataOf = result => Array.isArray(result?.data) ? result.data[0] : result?.data
const windowKeyNow = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)

// 以 matchId 为种子的确定性随机源：同一场比赛重放结果一致
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
function tierOfPoints(points) { return points >= 92 ? 'legendary' : points >= 82 ? 'epic' : points >= 76 ? 'gold' : points >= 56 ? 'silver' : 'bronze' }
// 方案A：基础属性随机生成，按卡级分档，按位置微调
function generateAttrs(tier, position) {
  const ranges = { bronze: [40, 70], silver: [60, 85], gold: [75, 99], epic: [82, 99], legendary: [88, 99] }
  const [min, max] = ranges[tier] || ranges.bronze
  const rand = () => Math.floor(min + Math.random() * (max - min + 1))
  const role = String(position || '').toUpperCase()
  const attrs = {
    shooting: rand(), passing: rand(), defending: rand(),
    pace: rand(), stamina: rand(), awareness: rand()
  }
  // 位置微调：前锋射门、中场传球、后卫防守、门将防守+意识
  if (/^FW/.test(role)) { attrs.shooting = Math.min(99, attrs.shooting + 15); attrs.pace = Math.min(99, attrs.pace + 5) }
  else if (/^MF/.test(role)) { attrs.passing = Math.min(99, attrs.passing + 15); attrs.awareness = Math.min(99, attrs.awareness + 5) }
  else if (/^DF/.test(role)) { attrs.defending = Math.min(99, attrs.defending + 15); attrs.stamina = Math.min(99, attrs.stamina + 5) }
  else if (/^GK/.test(role)) { attrs.defending = Math.min(99, attrs.defending + 20); attrs.awareness = Math.min(99, attrs.awareness + 10) }
  return attrs
}
// 主卡养成：喂卡经验表（同位置 ×1.5、同球队 ×1.3、赛季卡再 ×1.2）
const FEED_EXP = { bronze: 10, silver: 30, gold: 100, epic: 200, legendary: 500 }
// 竞技等级 → 养成上限锁
const COMPETITIVE_LEVEL_CAP = [10, 15, 20, 25, 30]
// 竞技等级战力加成：Lv.3 +2 / Lv.4 +5
const COMPETITIVE_BONUS = [0, 0, 0, 2, 5]
// 主卡升级所需经验：level N → N+1 需要 N*80
const expNeededFor = level => level * 80
// 教练卡 ID：'coach:' + sha256(openId)
const coachIdFor = openId => 'coach:' + sha(JSON.stringify(['coach', String(openId)]))
const isCoachId = id => String(id || '').startsWith('coach:')
// 符文 ID
const runeIdFor = (ownerOpenId, seed) => 'rune:' + sha(JSON.stringify(['rune', String(ownerOpenId), String(seed)]))
// 技能 ID
const skillIdFor = (ownerOpenId, skillType, seed) => 'skill:' + sha(JSON.stringify(['skill', String(ownerOpenId), String(skillType), String(seed)]))
const isBotOpenId = id => String(id || '').startsWith(BOT_OPENID_PREFIX)
// 方案A 状态加成：最近 3 场 match_events，进球 +2 / 黄牌 -1 / 红牌 -3；第二黄 = 一黄一红合计 -4
// 真实数据只影响 PK 战力临时加成，不改动基础 attrs（attrs 在收集时一次性随机生成）
const FORM_BONUS_MATCH_LIMIT = 3
const FORM_BONUS_WEIGHTS = {
  goal: 2, penalty_scored: 2, penalty: 2, score: 2,
  yellow_card: -1, yellow: -1, yellowcard: -1,
  red_card: -3, red: -3, redcard: -3,
  second_yellow: -4, second_yellow_red: -4
}
const matchTimeOf = match => new Date(match && (match.matchDate || match.startTime || match.matchTime) || 0).getTime() || 0
// FM 式按位置加权：基础 = 6 维均值，位置契合度 = 关键两维均值映射到 0.8-1.2
// FW 看射门+速度 / MF 看传球+意识 / DF 看防守+体能 / GK 看防守+意识
// 卡种加成（epic +3 / legendary +5）在契合度之后叠加
function powerFromAttrs(attrs, slotRole, tier) {
  if (!attrs) return 0
  const num = v => Number(v) || 0
  const base = (num(attrs.shooting) + num(attrs.passing) + num(attrs.defending) + num(attrs.pace) + num(attrs.stamina) + num(attrs.awareness)) / 6
  const role = String(slotRole || '').toUpperCase()
  let key = null
  if (/^FW/.test(role)) key = num(attrs.shooting) + num(attrs.pace)
  else if (/^MF/.test(role)) key = num(attrs.passing) + num(attrs.awareness)
  else if (/^DF/.test(role)) key = num(attrs.defending) + num(attrs.stamina)
  else if (/^GK/.test(role)) key = num(attrs.defending) + num(attrs.awareness)
  const fitness = key === null ? 1 : 0.8 + (key / 200) * 0.4
  return Math.round(base * fitness) + (TIER_BONUS[tier] || 0)
}
function botNicknameOf(id) {
  const index = Number(String(id || '').slice(BOT_OPENID_PREFIX.length))
  return BOT_NICKNAMES[index % BOT_NICKNAMES.length] || '微信球迷'
}
// 行锁冲突重试（与服务号登记链路同一口径）
async function withRetry(fn, attempts) {
  let last
  for (let i = 0; i < (attempts || 3); i++) {
    try { return await fn() } catch (error) {
      last = error
      if (!/transaction.*busy|TransactionBusy|conflict/i.test(String(error.message || error.errMsg || error.code || ''))) throw error
    }
  }
  throw last
}

async function readDoc(db, name, id) {
  try { return dataOf(await db.collection(name).doc(String(id)).get()) || null }
  catch (error) {
    if (/document.*(not exist|does not exist)|DOCUMENT_NOT_EXIST/i.test(String(error.message || error.errMsg || error.code || ''))) return null
    throw error
  }
}
async function readWhere(db, name, where, limit) {
  return (await db.collection(name).where(where).limit(limit || 200).get()).data || []
}
// 与 publicTournamentPlayerCard.cjs 保持一致的测试数据排除口径
function isTestPlayer(player) {
  return !player || player.synthetic === true || player.isTest === true || Boolean(player.syntheticDatasetId) || Boolean(player.syntheticKey) || String(player.source || '').toLowerCase() === 'synthetic'
}
function owns(player, relation) {
  const owner = text(relation.registrantUserId)
  return Boolean(owner && (relation.registrantType === 'self' ? [player.linkedUserId, player.playerUserId].map(String).includes(owner) : text(player.guardianUserId) === owner))
}

function createPlayerCardGame({ cloud, hashSessionToken, dateValue }) {
  const db = cloud.database()
  const dataService = () => service.createDataService(db)

  async function authenticate(event) {
    const token = text(event.fanSessionToken)
    if (!token) throw Object.assign(new Error('请先完成微信授权'), { code: 'PLAYER_CARD_AUTH_REQUIRED' })
    const sessions = await readWhere(db, 'fan_h5_sessions', { tokenHash: hashSessionToken(token), active: true }, 2)
    if (sessions.length !== 1 || dateValue(sessions[0].expiresAt) <= Date.now()) throw Object.assign(new Error('微信会话已失效，请重新进入'), { code: 'PLAYER_CARD_AUTH_REQUIRED' })
    const openId = text(sessions[0].serviceAccountOpenId)
    if (!openId) throw Object.assign(new Error('微信会话已失效，请重新进入'), { code: 'PLAYER_CARD_AUTH_REQUIRED' })
    return { openId }
  }
  async function nicknameOf(openId) {
    const rows = await readWhere(db, 'fan_profiles', { serviceAccountOpenId: openId }, 2)
    return text(rows[0] && rows[0].nickname) || '微信球迷'
  }
  // 与 playerCards.cjs playersFor 的 fan 分支一致：本人或已绑定孩子的球员
  async function ownedPlayers(openId) {
    const submissions = await readWhere(db, 'parent_profile_submissions', { serviceAccountOpenId: openId, status: 'submitted' }, 200)
    const unique = new Map()
    for (const relation of submissions) {
      const playerId = text(relation.playerId)
      if (!playerId || unique.has(playerId)) continue
      const player = await readDoc(db, 'players', playerId)
      if (!player || !owns(player, relation)) continue
      const team = player.teamId ? await readDoc(db, 'teams', String(player.teamId)) : null
      unique.set(playerId, { player, relation, teamName: (team && (team.name || team.teamName)) || '' })
    }
    return [...unique.values()]
  }
  // 当前持有卡：我收集的有效卡 + 我送出且未收回的卡 + 我的主卡（用于阵容槽位与 PK 核算）
  async function holdingsOf(openId) {
    const [collections, shares] = await Promise.all([
      readWhere(db, COLLECTIONS, { collectorOpenId: openId, status: 'active' }, 500),
      readWhere(db, SHARES, { ownerOpenId: openId, status: 'active' }, 100)
    ])
    const set = new Set([...collections.map(row => text(row.playerId)), ...shares.map(row => text(row.playerId))].filter(Boolean))
    set.add(coachIdFor(openId)) // 教练卡永远可上阵（作为教练，不占球员位）
    return set
  }
  async function cardUrls(players) {
    const cards = await readCards(cloud, db, players, { dynamic: false, restrictedAssets: true })
    const byId = new Map()
    for (const card of cards) byId.set(text(card.playerId), { cardStatus: card.status || 'unavailable', cardUrl: card.status === 'ready' ? text(card.cardUrl) : '' })
    return byId
  }
  // 状态加成：按 playerId 批量取最近 FORM_BONUS_MATCH_LIMIT 场 match_events 算加成
  // 返回 Map<playerId, bonus>；缺失/异常一律按 0 处理，不阻断 PK
  async function formBonusFor(playerIds) {
    const unique = [...new Set((playerIds || []).map(String).filter(Boolean))]
    const result = new Map()
    if (!unique.length) return result
    let events = [], matches = []
    try {
      const _ = db.command
      const eventsRes = await db.collection('match_events').where({ playerId: _.in(unique) }).limit(1000).get()
      events = eventsRes.data || []
      const matchIds = [...new Set(events.map(e => text(e.matchId)).filter(Boolean))]
      if (matchIds.length) {
        const matchesRes = await db.collection('matches').where({ _id: _.in(matchIds) }).limit(500).get()
        matches = matchesRes.data || []
      }
    } catch (error) { return result }
    const matchById = new Map(matches.map(m => [text(m._id), m]))
    const byPlayer = new Map()
    for (const event of events) {
      const pid = text(event.playerId)
      if (!pid) continue
      if (!byPlayer.has(pid)) byPlayer.set(pid, [])
      byPlayer.get(pid).push(event)
    }
    for (const [pid, list] of byPlayer.entries()) {
      const recent3 = new Set(
        [...new Set(list.map(e => text(e.matchId)).filter(Boolean))]
          .map(mid => ({ mid, t: matchById.has(mid) ? matchTimeOf(matchById.get(mid)) : 0 }))
          .sort((a, b) => b.t - a.t)
          .slice(0, FORM_BONUS_MATCH_LIMIT)
          .map(x => x.mid)
      )
      let bonus = 0
      for (const event of list) {
        if (!recent3.has(text(event.matchId))) continue
        const type = String(event.type || event.eventType || '').toLowerCase()
        bonus += FORM_BONUS_WEIGHTS[type] || 0
      }
      result.set(pid, bonus)
    }
    return result
  }
  // 持卡人/收集者视角下的 attrs + tier：一次查两套集合，避免 slot 级 N+1
  async function attrsOf(openId, playerIds) {
    const result = new Map()
    const unique = [...new Set((playerIds || []).map(String).filter(Boolean))]
    if (!openId || !unique.length) return result
    try {
      const _ = db.command
      const [collections, shares] = await Promise.all([
        db.collection(COLLECTIONS).where({ collectorOpenId: openId, playerId: _.in(unique), status: 'active' }).limit(500).get(),
        db.collection(SHARES).where({ ownerOpenId: openId, playerId: _.in(unique), status: 'active' }).limit(200).get()
      ])
      for (const row of (shares.data || [])) { if (row.attrs) result.set(text(row.playerId), { attrs: row.attrs, tier: text(row.tier) || 'bronze' }) }
      for (const row of (collections.data || [])) { if (row.attrs) result.set(text(row.playerId), { attrs: row.attrs, tier: text(row.tier) || 'bronze' }) }
    } catch (error) { /* 查询失败按无 attrs 兜底 */ }
    return result
  }
  async function teamNameOf(player) {
    if (!player || !player.teamId) return ''
    const team = await readDoc(db, 'teams', String(player.teamId))
    return (team && (team.name || team.teamName)) || ''
  }
  // ---------- 教练卡：每个 openId 一张，喂收集卡升级解锁玩法深度 ----------
  async function ensureCoachCard(openId) {
    const id = coachIdFor(openId)
    const existing = await readDoc(db, COACH_CARDS, id)
    if (existing) return existing
    const nickname = await nicknameOf(openId)
    const unlocks = COACH_UNLOCKS[1]
    const data = {
      _id: id, ownerOpenId: openId,
      name: nickname, level: 1, exp: 0,
      formations: unlocks.formations, tacticSlots: unlocks.tacticSlots,
      skillSlots: unlocks.skillSlots, runeSlots: unlocks.runeSlots,
      title: '青训教练',
      createdAt: db.serverDate(), updatedAt: db.serverDate()
    }
    await db.collection(COACH_CARDS).doc(id).set({ data })
    return Object.assign({}, data, { createdAt: Date.now(), updatedAt: Date.now() })
  }
  // 教练升级：应用 COACH_UNLOCKS 解锁内容
  function applyCoachLevelUp(coach, fromLevel, toLevel) {
    const next = Object.assign({}, coach)
    for (let lv = fromLevel + 1; lv <= toLevel; lv++) {
      const unlock = COACH_UNLOCKS[lv]
      if (unlock) {
        next.formations = unlock.formations
        next.tacticSlots = unlock.tacticSlots
        next.skillSlots = unlock.skillSlots
        next.runeSlots = unlock.runeSlots
      }
    }
    if (toLevel >= 30) next.title = '传奇教头'
    else if (toLevel >= 20) next.title = '战术大师'
    else if (toLevel >= 10) next.title = '职业教练'
    else if (toLevel >= 5) next.title = '资深教练'
    return next
  }
  // ---------- 人机对手：从平台虚拟球队池生成，确定性 _id 天然幂等 ----------
  async function ensureBots() {
    const existing = await readWhere(db, LINEUPS, { isBot: true }, BOT_TARGET + 2)
    if (existing.filter(row => row.deleted !== true && row.pkEnabled === true).length >= BOT_TARGET) return
    const [teams, players] = await Promise.all([
      readWhere(db, 'teams', { orgId: DEMO_ORG_ID }, 60),
      readWhere(db, 'players', { orgId: DEMO_ORG_ID }, 200)
    ])
    if (!teams.length || players.length < 30) return // 池子未就绪时静默跳过，真人对手不受影响
    for (let i = 0; i < BOT_TARGET; i++) {
      const lineupId = lineupIdFor(BOT_OPENID_PREFIX + i, 'main')
      if (existing.some(row => row._id === lineupId)) continue
      const rand = seededRand('pcg-bot:' + i)
      const team = teams[Math.floor(rand() * teams.length)]
      const formation = formations.formationsFor(5)[0]
      if (!formation) continue
      const picked = new Set()
      const target = BOT_POWER[i % BOT_POWER.length]
      const per = target / formation.positions.length
      const slots = formation.positions.map(position => {
        let player = null
        for (let t = 0; t < 20; t++) {
          const candidate = players[Math.floor(rand() * players.length)]
          const pid = text(candidate && candidate._id)
          if (pid && !picked.has(pid)) { picked.add(pid); player = candidate; break }
        }
        const points = Math.max(35, Math.min(97, Math.round(per + (rand() * 24 - 12))))
        return {
          role: position.role, playerId: BOT_ID_PREFIX + i + ':' + text(player && player._id),
          name: text(player && player.name) || '青训球员', tier: tierOfPoints(points), points
        }
      })
      const totalPoints = slots.reduce((sum, slot) => sum + slot.points, 0)
      try {
        await db.collection(LINEUPS).doc(lineupId).set({ data: {
          ownerOpenId: BOT_OPENID_PREFIX + i, isBot: true,
          name: ((team.name || team.teamName || '平台青训队') + ' 主力').slice(0, 20),
          formation: { count: 5, id: formation.id }, slots, totalPoints,
          pkEnabled: true, lineupVersion: 1, rulesVersion: RULES_VERSION,
          createTime: db.serverDate(), updatedAt: db.serverDate()
        } })
      } catch (error) {
        if (!/already exist|duplicate/i.test(String(error.message || error.errMsg || ''))) throw error
      }
    }
  }
  // ---------- 比赛模拟：90 分钟事件流（进球/黄牌/红牌/换人），确定性种子 ----------
  function simulateMatch(challenger, defender, seedText) {
    const rand = seededRand(seedText)
    const diff = challenger.totalPoints - defender.totalPoints
    const homeGoals = Math.min(6, poisson(Math.max(0.25, Math.min(4.5, 1.9 + diff / 95)), rand))
    const awayGoals = Math.min(6, poisson(Math.max(0.25, Math.min(4.5, 1.9 - diff / 95)), rand))
    const events = []
    const roleWeight = role => /^FW/.test(role) ? 5 : /^MF/.test(role) ? 3 : /^GK/.test(role) ? 0.15 : 1.2
    const pickScorer = side => {
      const pool = side.slots.filter(slot => slot.counted !== false)
      const total = pool.reduce((sum, slot) => sum + roleWeight(slot.role), 0) || 1
      let roll = rand() * total
      for (const slot of pool) { roll -= roleWeight(slot.role); if (roll <= 0) return slot.name }
      return pool.length ? pool[0].name : '球员'
    }
    const usedMinutes = new Set()
    const minuteOf = (min, max) => {
      for (let t = 0; t < 12; t++) { const m = min + Math.floor(rand() * (max - min + 1)); if (!usedMinutes.has(m)) { usedMinutes.add(m); return m } }
      return min + Math.floor(rand() * (max - min + 1))
    }
    const goalsOf = (side, count, sideKey) => {
      for (let g = 0; g < count; g++) events.push({ minute: minuteOf(2, 90), type: 'goal', side: sideKey, player: pickScorer(side) })
    }
    goalsOf(challenger, homeGoals, 'challenger'); goalsOf(defender, awayGoals, 'defender')
    const cardPool = side => {
      const pool = side.slots.filter(slot => slot.counted !== false)
      return pool.length ? pool[Math.floor(rand() * pool.length)].name : '球员'
    }
    const yellows = Math.min(5, poisson(1.7, rand))
    for (let i = 0; i < yellows; i++) {
      const sideKey = rand() < 0.5 ? 'challenger' : 'defender'
      events.push({ minute: minuteOf(5, 90), type: 'yellow', side: sideKey, player: cardPool(sideKey === 'challenger' ? challenger : defender) })
    }
    if (rand() < 0.06) {
      const sideKey = rand() < 0.5 ? 'challenger' : 'defender'
      events.push({ minute: minuteOf(30, 90), type: 'red', side: sideKey, player: cardPool(sideKey === 'challenger' ? challenger : defender) })
    }
    for (const sideKey of ['challenger', 'defender']) {
      const subs = Math.min(3, poisson(1.6, rand))
      const side = sideKey === 'challenger' ? challenger : defender
      for (let i = 0; i < subs; i++) {
        const pool = side.slots.filter(slot => slot.counted !== false)
        if (!pool.length) break
        events.push({ minute: minuteOf(46, 88), type: 'sub', side: sideKey, player: pool[Math.floor(rand() * pool.length)].name })
      }
    }
    events.sort((a, b) => a.minute - b.minute)
    return { score: { challenger: homeGoals, defender: awayGoals }, events }
  }
  // ---------- 抽卡转移：赢家抽走输家 1 张已收集的卡；人机局从全平台卡池补 ----------
  // 说明：转移的是玩法层「收集记录」，球员卡资产所有权永不转移；本人送出的卡不参与被抽。
  async function applySteal(tx, { winnerOpenId, loserOpenId, matchId, seedText }) {
    const rand = seededRand(seedText + ':steal')
    const loserCollections = isBotOpenId(loserOpenId) ? []
      : (await tx.collection(COLLECTIONS).where({ collectorOpenId: loserOpenId, status: 'active' }).limit(200).get()).data || []
    if (loserCollections.length) {
      const picked = loserCollections[Math.floor(rand() * loserCollections.length)]
      await tx.collection(COLLECTIONS).doc(picked._id).update({ data: { status: 'stolen', stolenBy: winnerOpenId, stolenMatchId: matchId, updatedAt: db.serverDate() } })
      if (!isBotOpenId(winnerOpenId)) {
        const winnerCollectionId = collectionIdFor(winnerOpenId, text(picked.shareId))
        const existing = await readDoc(tx, COLLECTIONS, winnerCollectionId)
        if (existing) await tx.collection(COLLECTIONS).doc(winnerCollectionId).update({ data: { status: 'active', updatedAt: db.serverDate() } })
        else await tx.collection(COLLECTIONS).doc(winnerCollectionId).set({ data: {
          collectorOpenId: winnerOpenId, shareId: text(picked.shareId), playerId: text(picked.playerId),
          tier: text(picked.tier), pointsAtCollect: Number(picked.pointsAtCollect) || 0,
          status: 'active', wonFrom: loserOpenId, wonMatchId: matchId, rulesVersion: RULES_VERSION,
          createTime: db.serverDate(), updatedAt: db.serverDate()
        } })
      }
      return { transferred: true, playerId: text(picked.playerId), shareId: text(picked.shareId), tier: text(picked.tier) }
    }
    // 人机局（或输家没有可抽的卡）：赢家从全平台已公开卡池随机抽 1 张未持有的
    if (!isBotOpenId(winnerOpenId)) {
      const shares = (await tx.collection(SHARES).where({ status: 'active' }).limit(200).get()).data || []
      const mine = new Set((await tx.collection(COLLECTIONS).where({ collectorOpenId: winnerOpenId, status: 'active' }).limit(500).get()).data.map(row => text(row.shareId)))
      const pool = shares.filter(row => text(row.ownerOpenId) !== winnerOpenId && !mine.has(text(row._id)))
      if (!pool.length) return { transferred: false, reason: 'poolEmpty' }
      const picked = pool[Math.floor(rand() * pool.length)]
      const grade = picked.gradeSnapshot || {}
      await tx.collection(COLLECTIONS).doc(collectionIdFor(winnerOpenId, text(picked._id))).set({ data: {
        collectorOpenId: winnerOpenId, shareId: text(picked._id), playerId: text(picked.playerId),
        tier: text(grade.tier), pointsAtCollect: Number(grade.points) || 0,
        status: 'active', wonFrom: loserOpenId, wonMatchId: matchId, rulesVersion: RULES_VERSION,
        createTime: db.serverDate(), updatedAt: db.serverDate()
      } })
      return { transferred: true, playerId: text(picked.playerId), shareId: text(picked._id), tier: text(grade.tier), fromPool: true }
    }
    return { transferred: false, reason: 'noCards' }
  }
  function gradeOf(score) {
    return score && score.status === 'ready' && TIERS.includes(score.tier) && Number.isSafeInteger(score.points)
      ? { tier: score.tier, points: score.points, scoreVersion: text(score.dataVersion) }
      : null
  }

  // ---------- 读：玩法首页 ----------
  async function getHome(event) {
    const { openId } = await authenticate(event)
    const [owned, shares, collections, lineups, asChallenger, asDefender, nickname] = await Promise.all([
      ownedPlayers(openId),
      readWhere(db, SHARES, { ownerOpenId: openId, status: 'active' }, 100),
      readWhere(db, COLLECTIONS, { collectorOpenId: openId, status: 'active' }, 500),
      readWhere(db, LINEUPS, { ownerOpenId: openId }, MAX_LINEUPS + 1),
      readWhere(db, MATCHES, { challengerOpenId: openId }, 200),
      readWhere(db, MATCHES, { defenderOpenId: openId }, 200),
      nicknameOf(openId)
    ])
    const sharedIds = new Set(shares.map(row => text(row.playerId)))
    const record = { wins: 0, losses: 0, draws: 0 }
    for (const row of asChallenger) record[row.result === 'win' ? 'wins' : row.result === 'lose' ? 'losses' : 'draws']++
    for (const row of asDefender) record[row.result === 'lose' ? 'wins' : row.result === 'win' ? 'losses' : 'draws']++
    return {
      success: true,
      home: {
        nickname,
        sharableCount: owned.filter(entry => !isTestPlayer(entry.player) && !sharedIds.has(text(entry.player._id))).length,
        sharedCount: shares.length,
        collectedCount: collections.length,
        lineupCount: Math.min(lineups.filter(row => row.deleted !== true).length, MAX_LINEUPS),
        maxLineups: MAX_LINEUPS,
        wins: record.wins, losses: record.losses, draws: record.draws
      }
    }
  }
  // ---------- 读：我的送出 ----------
  async function getMyShares(event) {
    const { openId } = await authenticate(event)
    const owned = await ownedPlayers(openId)
    const shares = await readWhere(db, SHARES, { ownerOpenId: openId }, 100)
    const shareByPlayer = new Map(shares.map(row => [text(row.playerId), row]))
    const urls = await cardUrls(owned.map(entry => entry.player))
    const rows = owned.filter(entry => !isTestPlayer(entry.player)).map(entry => {
      const playerId = text(entry.player._id), share = shareByPlayer.get(playerId), active = share && share.status === 'active'
      const card = urls.get(playerId) || {}
      return {
        playerId, name: text(entry.player.name) || '球员', teamName: entry.teamName, jerseyNumber: text(entry.player.jerseyNumber),
        shared: Boolean(active), shareId: active ? share._id : '',
        tier: active ? text(share.gradeSnapshot && share.gradeSnapshot.tier) : '',
        points: active ? Number(share.gradeSnapshot && share.gradeSnapshot.points) : null,
        cardStatus: card.cardStatus || 'unavailable', cardUrl: card.cardUrl || ''
      }
    })
    return { success: true, rows }
  }
  // ---------- 读：收集大厅（全平台已公开卡，游标分页） ----------
  async function listCollectible(event) {
    const { openId } = await authenticate(event)
    const after = text(event.after), tier = TIERS.includes(event.tier) ? event.tier : ''
    const limit = Math.min(Math.max(Number(event.limit) || PAGE_LIMIT, 1), PAGE_LIMIT)
    const query = { status: 'active' }
    if (after) query._id = db.command.gt(after)
    const page = (await db.collection(SHARES).where(query).orderBy('_id', 'asc').limit(limit + 1).get()).data || []
    const hasMore = page.length > limit, shares = page.slice(0, limit)
    const mine = new Set((await readWhere(db, COLLECTIONS, { collectorOpenId: openId }, 500)).filter(row => row.status === 'active').map(row => text(row.shareId)))
    const players = [], kept = []
    for (const share of shares) {
      if (text(share.ownerOpenId) === openId) continue
      const player = await readDoc(db, 'players', share.playerId)
      if (isTestPlayer(player) || player.playerCardPublic !== true) continue
      if (tier && text(share.gradeSnapshot && share.gradeSnapshot.tier) !== tier) continue
      kept.push(share); players.push(player)
    }
    const urls = await cardUrls(players)
    const rows = []
    for (let index = 0; index < kept.length; index++) {
      const share = kept[index], player = players[index], playerId = text(player._id), card = urls.get(playerId) || {}
      rows.push({
        shareId: share._id, playerId,
        name: text(player.name) || '球员', teamName: await teamNameOf(player), jerseyNumber: text(player.jerseyNumber),
        tier: text(share.gradeSnapshot && share.gradeSnapshot.tier), points: Number(share.gradeSnapshot && share.gradeSnapshot.points) || 0,
        cardStatus: card.cardStatus || 'unavailable', cardUrl: card.cardUrl || '',
        collected: mine.has(text(share._id))
      })
    }
    return { success: true, rows, nextAfter: hasMore ? text(shares[shares.length - 1]._id) : '' }
  }
  // ---------- 读：我的图鉴 ----------
  async function getMyCodex(event) {
    const { openId } = await authenticate(event)
    const collections = await readWhere(db, COLLECTIONS, { collectorOpenId: openId }, 500)
    const players = [], kept = []
    for (const row of collections) {
      const player = await readDoc(db, 'players', row.playerId)
      if (isTestPlayer(player)) continue
      kept.push(row); players.push(player)
    }
    const urls = await cardUrls(players)
    const stats = { total: 0, active: 0, bronze: 0, silver: 0, gold: 0 }
    const rows = []
    for (let index = 0; index < kept.length; index++) {
      const row = kept[index], player = players[index], playerId = text(player._id), active = row.status === 'active'
      const card = active ? (urls.get(playerId) || {}) : {}
      stats.total++
      if (active) { stats.active++; const tier = text(row.tier); if (TIERS.includes(tier)) stats[tier]++ }
      rows.push({
        playerId, name: text(player.name) || '球员', teamName: await teamNameOf(player), jerseyNumber: text(player.jerseyNumber),
        tier: text(row.tier), pointsAtCollect: Number(row.pointsAtCollect) || 0, status: active ? 'active' : row.status === 'stolen' ? 'stolen' : 'stale',
        cardStatus: card.cardStatus || 'unavailable', cardUrl: card.cardUrl || '', collectedAt: row.createTime || null
      })
    }
    rows.sort((a, b) => (a.status === b.status ? 0 : a.status === 'active' ? -1 : 1))
    return { success: true, rows, stats }
  }
  // ---------- 读：阵型目录（共享 lineup 数据源，页面不得自造槽位） ----------
  async function listFormations(event) {
    await authenticate(event)
    return {
      success: true,
      formations: FORMATION_COUNTS.map(count => ({
        count,
        options: formations.formationsFor(count).map(row => ({
          id: row.id, name: row.name,
          positions: (row.positions || []).map(position => ({ role: position.role, label: position.label, x: position.x, y: position.y }))
        }))
      })).filter(group => group.options.length)
    }
  }
  async function lineupView(lineup, withCards) {
    const slots = Array.isArray(lineup.slots) ? lineup.slots : []
    if (!withCards) {
      return {
        lineupId: lineup._id, name: text(lineup.name), formation: lineup.formation || null,
        filled: slots.length, totalPoints: Number(lineup.totalPoints) || 0,
        pkEnabled: lineup.pkEnabled === true, lineupVersion: Number(lineup.lineupVersion) || 0, updatedAt: lineup.updatedAt || null
      }
    }
    const formation = formations.formationFor(Number(lineup.formation && lineup.formation.count), text(lineup.formation && lineup.formation.id))
    const playerIds = slots.map(slot => text(slot.playerId)).filter(Boolean)
    const [scores, holdings] = await Promise.all([
      playerIds.length ? dataService().playerCardsForAuthorizedPlayers(playerIds) : new Map(),
      holdingsOf(text(lineup.ownerOpenId))
    ])
    const players = new Map()
    for (const playerId of playerIds) { const player = await readDoc(db, 'players', playerId); if (!isTestPlayer(player)) players.set(playerId, player) }
    const urls = await cardUrls([...players.values()])
    let totalPoints = 0
    const slotViews = slots.map(slot => {
      const playerId = text(slot.playerId), player = players.get(playerId), score = scores.get(playerId)
      const grade = player && holdings.has(playerId) ? gradeOf(score) : null
      if (grade) totalPoints += grade.points
      const card = urls.get(playerId) || {}, position = formation ? formation.positions.find(row => row.role === text(slot.role)) : null
      return {
        role: text(slot.role), label: position ? position.label : text(slot.role), x: position ? position.x : 0, y: position ? position.y : 0,
        playerId, name: player ? text(player.name) || '球员' : '', tier: grade ? grade.tier : '', points: grade ? grade.points : null,
        counted: Boolean(grade), cardStatus: card.cardStatus || 'unavailable', cardUrl: card.cardUrl || ''
      }
    })
    return {
      lineupId: lineup._id, name: text(lineup.name), formation: lineup.formation || null,
      slots: slotViews, totalPoints, pkEnabled: lineup.pkEnabled === true,
      lineupVersion: Number(lineup.lineupVersion) || 0, updatedAt: lineup.updatedAt || null
    }
  }
  async function listMyLineups(event) {
    const { openId } = await authenticate(event)
    const rows = (await readWhere(db, LINEUPS, { ownerOpenId: openId }, MAX_LINEUPS + 1)).filter(row => row.deleted !== true)
    return { success: true, rows: await Promise.all(rows.slice(0, MAX_LINEUPS).map(row => lineupView(row, false))) }
  }
  async function getMyLineup(event) {
    const { openId } = await authenticate(event)
    const lineup = await readDoc(db, LINEUPS, event.lineupId)
    if (!lineup || lineup.deleted === true || text(lineup.ownerOpenId) !== openId) return fail('PLAYER_CARD_GAME_LINEUP_FORBIDDEN', '阵容不存在或无权查看')
    return { success: true, lineup: await lineupView(lineup, true) }
  }
  // ---------- 读：可挑战对手（人机补充 + 战力保密，不返回 totalPoints） ----------
  async function listOpponents(event) {
    const { openId } = await authenticate(event)
    await ensureBots()
    const rows = (await readWhere(db, LINEUPS, { pkEnabled: true }, 100)).filter(row => row.deleted !== true && text(row.ownerOpenId) !== openId)
    // 人机与真人混排：每天按用户重排一次顺序，避免固定刷出顺序被摸透
    const rand = seededRand(openId + ':' + windowKeyNow())
    rows.sort(() => rand() - 0.5)
    const nicknames = new Map()
    for (const row of rows) {
      const owner = text(row.ownerOpenId)
      if (!nicknames.has(owner)) nicknames.set(owner, isBotOpenId(owner) ? botNicknameOf(owner) : await nicknameOf(owner))
    }
    return {
      success: true,
      rows: rows.slice(0, 50).map(row => ({
        lineupId: row._id, name: text(row.name), formation: row.formation || null,
        ownerNickname: nicknames.get(text(row.ownerOpenId)) || '微信球迷',
        updatedAt: row.updatedAt || null
      }))
    }
  }
  function matchView(row, openId, nicknames) {
    const mine = text(row.challengerOpenId) === openId
    const mySide = mine ? row.challenger : row.defender, otherSide = mine ? row.defender : row.challenger
    const result = mine ? row.result : row.result === 'win' ? 'lose' : row.result === 'lose' ? 'win' : 'draw'
    const opponentId = mine ? text(row.defenderOpenId) : text(row.challengerOpenId)
    const score = row.score && Number.isSafeInteger(Number(row.score.challenger))
      ? { mine: mine ? Number(row.score.challenger) : Number(row.score.defender), opponent: mine ? Number(row.score.defender) : Number(row.score.challenger) }
      : null
    const steal = row.steal || null
    const stealView = steal && steal.transferred
      ? { direction: text(steal.winnerOpenId) === openId ? 'won' : text(steal.loserOpenId) === openId ? 'lost' : 'none', playerId: text(steal.playerId), tier: text(steal.tier) }
      : null
    return {
      matchId: row._id, role: mine ? 'challenger' : 'defender', result,
      myPoints: Number(mySide && mySide.totalPoints) || 0, opponentPoints: Number(otherSide && otherSide.totalPoints) || 0,
      myLineupName: text(mySide && mySide.name), opponentLineupName: text(otherSide && otherSide.name),
      opponentNickname: nicknames.get(opponentId) || (isBotOpenId(opponentId) ? botNicknameOf(opponentId) : '微信球迷'),
      powerDiff: mine ? Number(row.powerDiff) || 0 : -Number(row.powerDiff || 0),
      score, steal: stealView,
      createdAt: row.createTime || null
    }
  }
  async function listMyMatches(event) {
    const { openId } = await authenticate(event)
    const [asChallenger, asDefender] = await Promise.all([
      readWhere(db, MATCHES, { challengerOpenId: openId }, 100),
      readWhere(db, MATCHES, { defenderOpenId: openId }, 100)
    ])
    const rows = [...asChallenger, ...asDefender].sort((a, b) => String(b.createTime || '').localeCompare(String(a.createTime || ''))).slice(0, 50)
    const nicknames = new Map()
    for (const row of rows) {
      for (const side of ['challengerOpenId', 'defenderOpenId']) {
        const id = text(row[side])
        if (id && id !== openId && !nicknames.has(id) && !isBotOpenId(id)) nicknames.set(id, await nicknameOf(id))
      }
    }
    return { success: true, rows: rows.map(row => matchView(row, openId, nicknames)) }
  }
  async function getMatchDetail(event) {
    const { openId } = await authenticate(event)
    const match = await readDoc(db, MATCHES, event.matchId)
    if (!match || (text(match.challengerOpenId) !== openId && text(match.defenderOpenId) !== openId)) return fail('PLAYER_CARD_GAME_MATCH_FORBIDDEN', '战绩不存在或无权查看')
    return { success: true, match: Object.assign(matchView(match, openId, new Map()), {
      challenger: match.challenger || null, defender: match.defender || null,
      events: Array.isArray(match.events) ? match.events : [],
      rulesVersion: text(match.rulesVersion)
    }) }
  }

  // ---------- 写：送出球员卡（授权公开引用，不转移所有权） ----------
  async function publishShare(event) {
    const { openId } = await authenticate(event)
    const playerId = text(event.playerId)
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(playerId)) return fail('PLAYER_CARD_GAME_PLAYER_INVALID', '球员编号无效')
    const owned = await ownedPlayers(openId)
    const entry = owned.find(item => text(item.player._id) === playerId)
    if (!entry) return fail('PLAYER_CARD_GAME_FORBIDDEN', '只能送出本人或已绑定孩子的球员卡')
    if (isTestPlayer(entry.player)) return fail('PLAYER_CARD_GAME_FORBIDDEN', '测试资料不能送出')
    const grade = gradeOf(await dataService().playerCardForAuthorizedPlayer(playerId))
    if (!grade) return fail('PLAYER_CARD_GAME_SCORE_PENDING', '生涯积分待核定，暂不能送出')
    const shareId = shareIdFor(playerId)
    await db.runTransaction(async tx => {
      const player = await readDoc(tx, 'players', playerId)
      if (!player || isTestPlayer(player)) throw Object.assign(new Error('球员卡访问权限已变化'), { code: 'PLAYER_CARD_GAME_FORBIDDEN' })
      await tx.collection('players').doc(playerId).update({ data: { playerCardPublic: true } })
      const existing = await readDoc(tx, SHARES, shareId)
      if (existing) {
        // 老数据无 attrs 时补齐（用现有卡级 + 球员位置）
        const patch = { status: 'active', ownerOpenId: openId, gradeSnapshot: grade, revokedAt: '', updatedAt: db.serverDate() }
        if (!existing.attrs) patch.attrs = generateAttrs(text(grade.tier), player.position)
        await tx.collection(SHARES).doc(shareId).update({ data: patch })
      } else {
        const attrs = generateAttrs(text(grade.tier), player.position)
        await tx.collection(SHARES).doc(shareId).set({ data: { playerId, ownerOpenId: openId, status: 'active', gradeSnapshot: grade, attrs, consentAt: db.serverDate(), revokedAt: '', rulesVersion: RULES_VERSION, updatedAt: db.serverDate() } })
      }
    })
    return { success: true, share: { shareId, playerId, tier: grade.tier, points: grade.points } }
  }
  // ---------- 写：收回送出的卡 ----------
  async function revokeShare(event) {
    const { openId } = await authenticate(event)
    const playerId = text(event.playerId)
    const shareId = shareIdFor(playerId)
    const share = await readDoc(db, SHARES, shareId)
    if (!share || text(share.ownerOpenId) !== openId) return fail('PLAYER_CARD_GAME_FORBIDDEN', '只能收回本人送出的球员卡')
    await db.runTransaction(async tx => {
      const current = await readDoc(tx, SHARES, shareId)
      if (!current || current.status !== 'active') return
      await tx.collection(SHARES).doc(shareId).update({ data: { status: 'closed', revokedAt: db.serverDate(), updatedAt: db.serverDate() } })
      const player = await readDoc(tx, 'players', playerId)
      if (player) await tx.collection('players').doc(playerId).update({ data: { playerCardPublic: false } })
    })
    // 已收集的引用保留但标记「已收回」，不再计入阵容与 PK
    const collected = await readWhere(db, COLLECTIONS, { shareId, status: 'active' }, 500)
    for (const row of collected) await db.collection(COLLECTIONS).doc(row._id).update({ data: { status: 'stale', updatedAt: db.serverDate() } })
    return { success: true, shareId, staleCount: collected.length }
  }
  // ---------- 写：收集（幂等） ----------
  async function collectCard(event) {
    const { openId } = await authenticate(event)
    const shareId = text(event.shareId)
    if (!/^[a-f0-9]{64}$/.test(shareId)) return fail('PLAYER_CARD_GAME_SHARE_INVALID', '收集目标无效')
    const collectionId = collectionIdFor(openId, shareId)
    const result = await db.runTransaction(async tx => {
      const existing = await readDoc(tx, COLLECTIONS, collectionId)
      if (existing) return { already: true, status: existing.status === 'active' ? 'active' : 'stale' }
      const share = await readDoc(tx, SHARES, shareId)
      if (!share || share.status !== 'active') throw Object.assign(new Error('这张卡已被收回，暂时不能收集'), { code: 'PLAYER_CARD_GAME_SHARE_CLOSED' })
      if (text(share.ownerOpenId) === openId) throw Object.assign(new Error('不能收集自己送出的卡'), { code: 'PLAYER_CARD_GAME_COLLECT_SELF' })
      const player = await readDoc(tx, 'players', share.playerId)
      if (isTestPlayer(player) || player.playerCardPublic !== true) throw Object.assign(new Error('这张卡已被收回，暂时不能收集'), { code: 'PLAYER_CARD_GAME_SHARE_CLOSED' })
      const grade = share.gradeSnapshot || {}
      const tier = text(grade.tier)
      const attrs = generateAttrs(tier, player && player.position)
      await tx.collection(COLLECTIONS).doc(collectionId).set({ data: {
        collectorOpenId: openId, shareId, playerId: text(share.playerId),
        tier, pointsAtCollect: Number(grade.points) || 0,
        attrs,
        status: 'active', rulesVersion: RULES_VERSION, createTime: db.serverDate(), updatedAt: db.serverDate()
      } })
      return { already: false, status: 'active' }
    })
    return { success: true, collected: { collectionId, shareId, already: result.already, status: result.status } }
  }
  // ---------- 教练卡：读取（首次进入自动创建） ----------
  async function getCoachCard(event) {
    const { openId } = await authenticate(event)
    const coach = await ensureCoachCard(openId)
    const level = Number(coach.level) || 1
    return {
      success: true,
      coach: {
        level,
        exp: Number(coach.exp) || 0,
        expNeeded: level >= COACH_LEVEL_MAX ? 0 : COACH_EXP_NEEDED(level),
        maxLevel: COACH_LEVEL_MAX,
        title: text(coach.title) || '青训教练',
        formations: coach.formations || [],
        tacticSlots: Number(coach.tacticSlots) || 0,
        skillSlots: Number(coach.skillSlots) || 0,
        runeSlots: Number(coach.runeSlots) || 0
      }
    }
  }
  // ---------- 教练卡：喂收集卡升级 ----------
  async function feedCard(event) {
    const { openId } = await authenticate(event)
    const collectionId = text(event.collectionId)
    if (!collectionId) return fail('PLAYER_CARD_GAME_INVALID', '请选择要喂的卡')
    const collection = await readDoc(db, COLLECTIONS, collectionId)
    if (!collection || text(collection.collectorOpenId) !== openId) return fail('PLAYER_CARD_GAME_FORBIDDEN', '这张卡不在你的收藏中')
    if (text(collection.status) !== 'active') return fail('PLAYER_CARD_GAME_CARD_CONSUMED', '这张卡已消耗')
    const tier = text(collection.tier)
    let gain = FEED_EXP[tier] || 0
    if (!gain) return fail('PLAYER_CARD_GAME_INVALID', '该卡不可作为材料')
    // 赛季卡/限定卡额外 ×1.2；同位置 ×1.5、同球队 ×1.3 需教练绑定偏好后启用
    if (text(collection.cardType) && text(collection.cardType) !== 'base') gain = Math.round(gain * 1.2)
    const coach = await ensureCoachCard(openId)
    const fromLevel = Number(coach.level) || 1
    if (fromLevel >= COACH_LEVEL_MAX) return fail('PLAYER_CARD_GAME_COACH_MAX', '教练等级已满')
    let level = fromLevel
    let exp = (Number(coach.exp) || 0) + gain
    while (level < COACH_LEVEL_MAX) {
      const need = COACH_EXP_NEEDED(level)
      if (exp < need) break
      exp -= need
      level++
    }
    const next = applyCoachLevelUp(coach, fromLevel, level)
    await db.collection(COLLECTIONS).doc(collectionId).update({ data: { status: 'consumed', consumedAt: db.serverDate(), updatedAt: db.serverDate() } })
    await db.collection(COACH_CARDS).doc(coachIdFor(openId)).update({ data: {
      level,
      exp,
      title: next.title,
      formations: next.formations,
      tacticSlots: next.tacticSlots,
      skillSlots: next.skillSlots,
      runeSlots: next.runeSlots,
      updatedAt: db.serverDate()
    } })
    return {
      success: true,
      gain,
      coach: {
        level,
        exp,
        expNeeded: level >= COACH_LEVEL_MAX ? 0 : COACH_EXP_NEEDED(level),
        maxLevel: COACH_LEVEL_MAX,
        title: next.title,
        formations: next.formations,
        tacticSlots: next.tacticSlots,
        skillSlots: next.skillSlots,
        runeSlots: next.runeSlots
      }
    }
  }
  // ---------- 符文：生成（卡包/活动调用） ----------
  async function createRune(openId, runeType, quality) {
    if (!RUNE_TYPES.includes(runeType)) return null
    const q = RUNE_ATTRS[quality] || RUNE_ATTRS.normal
    const id = runeIdFor(openId, crypto.randomBytes(8).toString('hex'))
    const data = {
      _id: id, ownerOpenId: openId, runeType, quality,
      bonus: q.bonus, durability: q.maxDurability, maxDurability: q.maxDurability,
      equippedPlayerId: '', equippedAt: null,
      createdAt: db.serverDate(), updatedAt: db.serverDate()
    }
    await db.collection(RUNES).doc(id).set({ data })
    return data
  }
  // ---------- 符文：列表 ----------
  async function listRunes(event) {
    const { openId } = await authenticate(event)
    const runes = await readWhere(db, RUNES, { ownerOpenId: openId }, 200)
    return { success: true, runes: runes.map(r => ({ ...r, runeId: r._id, qualityName: { normal: '普通', fine: '精良', rare: '稀有', epic: '史诗' }[r.quality] || '普通', typeName: { shooting: '射门', passing: '传球', defending: '防守', pace: '速度', stamina: '体能', awareness: '意识' }[r.runeType] || r.runeType })) }
  }
  // ---------- 符文：装备到球员卡 ----------
  async function equipRune(event) {
    const { openId } = await authenticate(event)
    const runeId = text(event.runeId), playerId = text(event.playerId)
    if (!runeId || !playerId) return fail('PLAYER_CARD_GAME_INVALID', '参数无效')
    const rune = await readDoc(db, RUNES, runeId)
    if (!rune || text(rune.ownerOpenId) !== openId) return fail('PLAYER_CARD_GAME_FORBIDDEN', '符文不存在')
    if (rune.durability <= 0) return fail('PLAYER_CARD_GAME_RUNE_BROKEN', '符文已碎裂')
    if (text(rune.equippedPlayerId)) return fail('PLAYER_CARD_GAME_RUNE_EQUIPPED', '符文已装备，请先卸下')
    const holdings = await holdingsOf(openId)
    if (!holdings.has(playerId)) return fail('PLAYER_CARD_GAME_FORBIDDEN', '这张球员卡不在你的收藏中')
    await db.collection(RUNES).doc(runeId).update({ data: { equippedPlayerId: playerId, equippedAt: db.serverDate(), updatedAt: db.serverDate() } })
    return { success: true }
  }
  // ---------- 符文：卸下 ----------
  async function unequipRune(event) {
    const { openId } = await authenticate(event)
    const runeId = text(event.runeId)
    const rune = await readDoc(db, RUNES, runeId)
    if (!rune || text(rune.ownerOpenId) !== openId) return fail('PLAYER_CARD_GAME_FORBIDDEN', '符文不存在')
    await db.collection(RUNES).doc(runeId).update({ data: { equippedPlayerId: '', equippedAt: null, updatedAt: db.serverDate() } })
    return { success: true }
  }
  // ---------- 符文：分解（3 个同品质合成 1 个高一级） ----------
  async function decomposeRune(event) {
    const { openId } = await authenticate(event)
    const runeIds = Array.isArray(event.runeIds) ? event.runeIds.map(text).filter(Boolean) : []
    if (runeIds.length !== 3) return fail('PLAYER_CARD_GAME_INVALID', '需要 3 个同品质符文')
    const runes = []
    for (const id of runeIds) {
      const r = await readDoc(db, RUNES, id)
      if (!r || text(r.ownerOpenId) !== openId) return fail('PLAYER_CARD_GAME_FORBIDDEN', '符文不存在')
      if (text(r.equippedPlayerId)) return fail('PLAYER_CARD_GAME_RUNE_EQUIPPED', '已装备的符文不能分解')
      runes.push(r)
    }
    const quality = runes[0].quality
    if (!runes.every(r => r.quality === quality)) return fail('PLAYER_CARD_GAME_INVALID', '符文品质不一致')
    const nextQuality = { normal: 'fine', fine: 'rare', rare: 'epic', epic: null }[quality]
    if (!nextQuality) return fail('PLAYER_CARD_GAME_INVALID', '史诗符文无法继续合成')
    // 删除旧符文，生成新符文
    for (const r of runes) await db.collection(RUNES).doc(r._id).remove()
    const newRune = await createRune(openId, runes[0].runeType, nextQuality)
    return { success: true, decomposed: runeIds.length, newRune: newRune && { ...newRune, runeId: newRune._id } }
  }
  // ---------- 技能：生成 ----------
  async function createSkill(openId, skillType) {
    const conf = SKILL_TYPES[skillType]
    if (!conf) return null
    const id = skillIdFor(openId, skillType, crypto.randomBytes(8).toString('hex'))
    const data = { _id: id, ownerOpenId: openId, skillType, name: conf.name, effect: conf.effect, used: false, usedAt: null, createdAt: db.serverDate() }
    await db.collection(SKILLS).doc(id).set({ data })
    return data
  }
  // ---------- 技能：列表 ----------
  async function listSkills(event) {
    const { openId } = await authenticate(event)
    const skills = await readWhere(db, SKILLS, { ownerOpenId: openId, used: false }, 100)
    return { success: true, skills: skills.map(s => ({ ...s, skillId: s._id })) }
  }
  // ---------- 技能：使用（标记为已用，PK 时生效） ----------
  async function useSkill(event) {
    const { openId } = await authenticate(event)
    const skillId = text(event.skillId)
    const skill = await readDoc(db, SKILLS, skillId)
    if (!skill || text(skill.ownerOpenId) !== openId) return fail('PLAYER_CARD_GAME_FORBIDDEN', '技能卡不存在')
    if (skill.used) return fail('PLAYER_CARD_GAME_SKILL_USED', '技能卡已使用')
    await db.collection(SKILLS).doc(skillId).update({ data: { used: true, usedAt: db.serverDate(), updatedAt: db.serverDate() } })
    return { success: true }
  }
  // ---------- 写：保存阵容（乐观锁 + 槽位/持有校验） ----------
  async function saveLineup(event) {
    const { openId } = await authenticate(event)
    const name = text(event.name).slice(0, 20)
    if (!name) return fail('PLAYER_CARD_GAME_LINEUP_INVALID', '请填写阵容名称')
    const count = Number(event.formation && event.formation.count), formationId = text(event.formation && event.formation.id)
    const formation = formations.formationFor(count, formationId)
    if (!formation) return fail('PLAYER_CARD_GAME_FORMATION_INVALID', '阵型不可用，请重新选择')
    const slots = Array.isArray(event.slots) ? event.slots : []
    if (!slots.length) return fail('PLAYER_CARD_GAME_LINEUP_EMPTY', '请至少安排一名球员')
    const holdings = await holdingsOf(openId)
    const playerIds = slots.map(slot => text(slot.playerId)).filter(Boolean)
    try {
      formations.validate(count, { formation: formation.id, positions: slots.map(slot => ({ role: text(slot.role), id: text(slot.playerId) })) }, playerIds)
    } catch (error) {
      return fail('PLAYER_CARD_GAME_LINEUP_INVALID', '首发位置与球员不一致，请重新排阵')
    }
    for (const playerId of playerIds) {
      if (!holdings.has(playerId)) return fail('PLAYER_CARD_GAME_LINEUP_FORBIDDEN', '阵容包含未持有或已收回的球员卡')
      const player = await readDoc(db, 'players', playerId)
      if (isTestPlayer(player)) return fail('PLAYER_CARD_GAME_LINEUP_FORBIDDEN', '阵容包含不可用球员卡')
    }
    // 保存时按服务端口径核算一次战力用于列表展示；PK 时仍会重算
    // FM 体系：优先 attrs + 位置加权；无 attrs 回退 dataCenter 积分
    const [scores, myAttrsForSave] = await Promise.all([
      dataService().playerCardsForAuthorizedPlayers(playerIds),
      attrsOf(openId, playerIds)
    ])
    let totalPoints = 0
    for (const slot of slots) {
      const playerId = text(slot.playerId)
      const cardInfo = myAttrsForSave.get(playerId)
      if (cardInfo && cardInfo.attrs) { totalPoints += powerFromAttrs(cardInfo.attrs, slot.role, cardInfo.tier); continue }
      const grade = gradeOf(scores.get(playerId)); if (grade) totalPoints += grade.points
    }
    // 编辑现有阵容：前端只持有 lineupId（sha256 不可反推），必须支持 lineupId 直接定位
    const lineupIdInput = text(event.lineupId)
    if (lineupIdInput && !/^[a-f0-9]{64}$/.test(lineupIdInput)) return fail('PLAYER_CARD_GAME_LINEUP_INVALID', '阵容编号无效')
    const lineupKey = text(event.lineupKey) || crypto.randomBytes(12).toString('hex')
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(lineupKey)) return fail('PLAYER_CARD_GAME_LINEUP_INVALID', '阵容编号无效')
    const lineupId = lineupIdInput || lineupIdFor(openId, lineupKey)
    const expectedVersion = event.expectedVersion === undefined || event.expectedVersion === null ? null : Number(event.expectedVersion)
    const pkEnabled = event.pkEnabled === true
    let saved
    try {
      saved = await db.runTransaction(async tx => {
      const existing = await readDoc(tx, LINEUPS, lineupId)
      if (existing && text(existing.ownerOpenId) !== openId) throw Object.assign(new Error('阵容不存在或无权修改'), { code: 'PLAYER_CARD_GAME_LINEUP_FORBIDDEN' })
      if (existing && (expectedVersion === null || Number(existing.lineupVersion || 0) !== expectedVersion)) throw Object.assign(new Error('阵容已在别处更新，请重新打开'), { code: 'PLAYER_CARD_GAME_LINEUP_CONFLICT' })
      if (!existing) {
        const mine = await tx.collection(LINEUPS).where({ ownerOpenId: openId }).limit(MAX_LINEUPS + 1).get()
        if ((mine.data || []).length >= MAX_LINEUPS) throw Object.assign(new Error('最多保存 ' + MAX_LINEUPS + ' 套阵容'), { code: 'PLAYER_CARD_GAME_LINEUP_LIMIT' })
      }
      const version = Number(existing && existing.lineupVersion || 0) + 1
      const data = {
        ownerOpenId: openId, name, formation: { count, id: formation.id },
        slots: slots.map(slot => ({ role: text(slot.role), playerId: text(slot.playerId) })),
        totalPoints, pkEnabled, lineupVersion: version, rulesVersion: RULES_VERSION, updatedAt: db.serverDate()
      }
      if (existing) await tx.collection(LINEUPS).doc(lineupId).update({ data })
      else await tx.collection(LINEUPS).doc(lineupId).set({ data: Object.assign({ createTime: db.serverDate() }, data) })
      return version
      })
    } catch (error) {
      if (['PLAYER_CARD_GAME_LINEUP_FORBIDDEN', 'PLAYER_CARD_GAME_LINEUP_CONFLICT', 'PLAYER_CARD_GAME_LINEUP_LIMIT'].includes(error.code)) return fail(error.code, error.message)
      throw error
    }
    return { success: true, lineupId, lineupVersion: saved, totalPoints }
  }
  async function deleteLineup(event) {
    const { openId } = await authenticate(event)
    const lineup = await readDoc(db, LINEUPS, event.lineupId)
    if (!lineup || lineup.deleted === true || text(lineup.ownerOpenId) !== openId) return fail('PLAYER_CARD_GAME_LINEUP_FORBIDDEN', '阵容不存在或无权删除')
    // 软删除：历史战绩快照仍可回看，阵容本身不再参与展示与挑战
    await db.collection(LINEUPS).doc(lineup._id).update({ data: { pkEnabled: false, deleted: true, updatedAt: db.serverDate() } })
    return { success: true, lineupId: lineup._id }
  }
  // ---------- 写：发起异步挑战（服务端重算战力 + 90 分钟事件模拟 + 输赢抽卡，同窗幂等） ----------
  async function challenge(event) {
    const { openId } = await authenticate(event)
    const [mine, defender] = await Promise.all([readDoc(db, LINEUPS, event.lineupId), readDoc(db, LINEUPS, event.defenderLineupId)])
    if (!mine || mine.deleted === true || text(mine.ownerOpenId) !== openId) return fail('PLAYER_CARD_GAME_LINEUP_FORBIDDEN', '阵容不存在或无权使用')
    if (!defender || defender.deleted === true || defender.pkEnabled !== true) return fail('PLAYER_CARD_GAME_OPPONENT_UNAVAILABLE', '对方阵容暂不可挑战')
    if (text(defender.ownerOpenId) === openId) return fail('PLAYER_CARD_GAME_CHALLENGE_SELF', '不能挑战自己的阵容')
    const defenderIsBot = defender.isBot === true || isBotOpenId(defender.ownerOpenId)
    const matchId = matchIdFor(openId, defender._id, windowKeyNow())
    const existing = await readDoc(db, MATCHES, matchId)
    if (existing) return { success: true, idempotent: true, match: Object.assign({}, existing, { matchId: existing._id }) }
    const sideIds = lineup => (Array.isArray(lineup.slots) ? lineup.slots : []).map(slot => text(slot.playerId)).filter(Boolean)
    const allIds = [...new Set([...sideIds(mine), ...sideIds(defender)])].filter(id => !id.startsWith(BOT_ID_PREFIX))
    if (!sideIds(mine).length || !sideIds(defender).length) return fail('PLAYER_CARD_GAME_CARD_PENDING', '双方都还没有可用球员卡')
    const [scores, myHoldings, defenderHoldings, formBonus, myAttrs, defenderAttrs] = await Promise.all([
      allIds.length ? dataService().playerCardsForAuthorizedPlayers(allIds) : new Map(),
      holdingsOf(openId),
      defenderIsBot ? Promise.resolve(null) : holdingsOf(text(defender.ownerOpenId)),
      formBonusFor(allIds),
      attrsOf(openId, sideIds(mine)),
      defenderIsBot ? Promise.resolve(new Map()) : attrsOf(text(defender.ownerOpenId), sideIds(defender))
    ])
    const names = new Map()
    for (const playerId of allIds) { const player = await readDoc(db, 'players', playerId); if (!isTestPlayer(player)) names.set(playerId, text(player.name) || '球员') }
    // 查双方装备的符文：按 ownerOpenId + equippedPlayerId 匹配
    const [myRunes, defenderRunes] = await Promise.all([
      readWhere(db, RUNES, { ownerOpenId: openId, durability: db.command.gt(0) }, 100),
      defenderIsBot ? Promise.resolve([]) : readWhere(db, RUNES, { ownerOpenId: text(defender.ownerOpenId), durability: db.command.gt(0) }, 100)
    ])
    const runesByOwner = new Map()
    for (const r of myRunes) if (text(r.equippedPlayerId)) runesByOwner.set(text(r.equippedPlayerId), [...(runesByOwner.get(text(r.equippedPlayerId)) || []), r])
    for (const r of defenderRunes) if (text(r.equippedPlayerId)) runesByOwner.set(text(r.equippedPlayerId), [...(runesByOwner.get(text(r.equippedPlayerId)) || []), r])
    // 应用符文加成后的 attrs
    function attrsWithRunes(playerId, baseAttrs) {
      const equipped = runesByOwner.get(playerId) || []
      if (!equipped.length) return baseAttrs
      const next = Object.assign({}, baseAttrs)
      for (const r of equipped) {
        const field = text(r.runeType)
        if (field && next[field] !== undefined) next[field] = Math.min(99, (Number(next[field]) || 0) + (Number(r.bonus) || 0))
      }
      return next
    }
    // 记录本场参战符文（赛后扣耐久）
    const battleRuneIds = []
    async function sideOfAsync(lineup, holdings, attrsMap, ownerOpenId) {
      const isBotSide = lineup.isBot === true || isBotOpenId(lineup.ownerOpenId)
      let totalPoints = 0
      const slots = []
      for (const slot of (Array.isArray(lineup.slots) ? lineup.slots : [])) {
        if (isBotSide) {
          const points = Number(slot.points) || 0
          totalPoints += points
          slots.push({ role: text(slot.role), playerId: text(slot.playerId), name: text(slot.name) || '青训球员', tier: tierOfPoints(points), points, counted: true })
          continue
        }
        const playerId = text(slot.playerId)
        if (!holdings || !holdings.has(playerId)) { slots.push({ role: text(slot.role), playerId, name: names.get(playerId) || '球员', tier: '', points: null, counted: false }); continue }
        const bonus = formBonus.get(playerId) || 0
        const cardInfo = attrsMap && attrsMap.get(playerId)
        // FM 体系：优先按 attrs + 位置加权；旧卡无 attrs 时回退到 dataCenter 积分
        if (cardInfo && cardInfo.attrs) {
          const boostedAttrs = attrsWithRunes(playerId, cardInfo.attrs)
          const equipped = runesByOwner.get(playerId) || []
          for (const r of equipped) battleRuneIds.push(r._id)
          const base = powerFromAttrs(boostedAttrs, slot.role, cardInfo.tier)
          const points = base + bonus
          totalPoints += points
          slots.push({ role: text(slot.role), playerId, name: names.get(playerId) || '球员', tier: cardInfo.tier, points, basePoints: base, formBonus: bonus, attrs: boostedAttrs, runes: equipped.map(r => ({ runeType: r.runeType, bonus: r.bonus, quality: r.quality })), counted: true })
          continue
        }
        const grade = gradeOf(scores.get(playerId))
        if (!grade) { slots.push({ role: text(slot.role), playerId, name: names.get(playerId) || '球员', tier: '', points: null, counted: false }); continue }
        totalPoints += grade.points + bonus
        slots.push({ role: text(slot.role), playerId, name: names.get(playerId) || '球员', tier: grade.tier, points: grade.points + bonus, basePoints: grade.points, formBonus: bonus, counted: true })
      }
      return { name: text(lineup.name), formation: lineup.formation || null, totalPoints, slots }
    }
    const challengerSide = await sideOfAsync(mine, myHoldings, myAttrs, openId)
    const defenderSide = await sideOfAsync(defender, defenderHoldings, defenderAttrs, text(defender.ownerOpenId))
    if (!challengerSide.slots.some(slot => slot.counted) || !defenderSide.slots.some(slot => slot.counted)) return fail('PLAYER_CARD_GAME_CARD_PENDING', '球员卡积分待核定，暂不能发起挑战')
    const powerDiff = challengerSide.totalPoints - defenderSide.totalPoints
    // 后端一次性模拟全场事件并落库：比分由事件决定，两端一致、可复盘
    const simulated = simulateMatch(challengerSide, defenderSide, matchId)
    const result = simulated.score.challenger > simulated.score.defender ? 'win' : simulated.score.challenger < simulated.score.defender ? 'lose' : 'draw'
    const winnerOpenId = result === 'win' ? openId : result === 'lose' ? text(defender.ownerOpenId) : ''
    const loserOpenId = result === 'win' ? text(defender.ownerOpenId) : result === 'lose' ? openId : ''
    const match = {
      challengerOpenId: openId, defenderOpenId: text(defender.ownerOpenId),
      challengerLineupId: mine._id, defenderLineupId: defender._id,
      challenger: challengerSide, defender: defenderSide,
      result, powerDiff, score: simulated.score, events: simulated.events,
      defenderIsBot,
      rulesVersion: RULES_VERSION, windowKey: windowKeyNow(), createTime: db.serverDate()
    }
    await withRetry(() => db.runTransaction(async tx => {
      if (await readDoc(tx, MATCHES, matchId)) return null
      await tx.collection(MATCHES).doc(matchId).set({ data: match })
      // 输赢抽卡：赢家抽走输家 1 张已收集的卡；平局不抽；本人送出的卡不参与被抽
      if (!winnerOpenId) return null
      const steal = await applySteal(tx, { winnerOpenId, loserOpenId, matchId, seedText: matchId })
      await tx.collection(MATCHES).doc(matchId).update({ data: { steal: Object.assign({ winnerOpenId, loserOpenId }, steal) } })
      return steal
    }))
    // 赛后：所有参战符文耐久 -1，耐久 0 自动卸下
    for (const runeId of battleRuneIds) {
      await db.collection(RUNES).doc(runeId).get().then(r => {
        const rune = dataOf(r)
        if (!rune) return null
        const newDurability = Math.max(0, (Number(rune.durability) || 0) - 1)
        const update = { durability: newDurability, updatedAt: db.serverDate() }
        if (newDurability <= 0) { update.equippedPlayerId = ''; update.equippedAt = null }
        return db.collection(RUNES).doc(runeId).update({ data: update })
      }).catch(() => null)
    }
    const saved = await readDoc(db, MATCHES, matchId)
    return { success: true, idempotent: false, match: Object.assign({}, saved || match, { matchId }) }
  }

  return async function handle(event = {}) {
    try {
      switch (event.action) {
        case 'getPlayerCardGameHome': return await getHome(event)
        case 'getMyGameShares': return await getMyShares(event)
        case 'listCollectiblePlayerCards': return await listCollectible(event)
        case 'getMyCollectionCodex': return await getMyCodex(event)
        case 'listGameFormations': return await listFormations(event)
        case 'listMyGameLineups': return await listMyLineups(event)
        case 'getMyGameLineup': return await getMyLineup(event)
        case 'listGameOpponents': return await listOpponents(event)
        case 'listMyGameMatches': return await listMyMatches(event)
        case 'getGameMatchDetail': return await getMatchDetail(event)
        case 'publishPlayerCardShare': return await publishShare(event)
        case 'revokePlayerCardShare': return await revokeShare(event)
        case 'collectPlayerCard': return await collectCard(event)
        case 'saveGameLineup': return await saveLineup(event)
        case 'deleteGameLineup': return await deleteLineup(event)
        case 'challengeGameLineup': return await challenge(event)
        case 'getCoachCard': return await getCoachCard(event)
        case 'feedCoachCard': return await feedCard(event)
        case 'listGameRunes': return await listRunes(event)
        case 'equipGameRune': return await equipRune(event)
        case 'unequipGameRune': return await unequipRune(event)
        case 'decomposeGameRune': return await decomposeRune(event)
        case 'listGameSkills': return await listSkills(event)
        case 'useGameSkill': return await useSkill(event)
        default: return fail('PLAYER_CARD_GAME_ACTION_INVALID', '操作不可用，请重新打开')
      }
    } catch (error) {
      if (error && error.code) return fail(error.code, error.message || '操作失败，请重试')
      return fail('PLAYER_CARD_GAME_FAILED', '操作失败，请重试')
    }
  }
}
module.exports = { createPlayerCardGame, SHARES, COLLECTIONS, LINEUPS, MATCHES, COACH_CARDS, SKILLS, RUNES, RULES_VERSION, shareIdFor, collectionIdFor, lineupIdFor, matchIdFor, coachIdFor, isCoachId, runeIdFor, skillIdFor }
