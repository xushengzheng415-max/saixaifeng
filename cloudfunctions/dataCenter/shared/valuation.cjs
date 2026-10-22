'use strict'

/**
 * 球员转会评估指数（虚拟身价）统一算法。
 * 规则来源：docs/PRODUCT_RULES.md「2026-10-21 已确认：球员转会评估指数」。
 * 各端只读结果，不得自算；本模块只做纯函数计算，不读写数据库。
 */

const VERSION = 'football-player-valuation/1'
const TIER_STEP = 1000
const LIMITED_CARD_CAP = 2

// 质量分八项权重，合计 1。
const WEIGHTS = Object.freeze({
  core: 0.30,       // 竞技基线：生涯积分在同组别内的分位
  age: 0.15,        // 年龄潜力
  quality: 0.14,    // 表现质量：非门将看每 90 分钟进球，门将看零封率
  appearance: 0.12, // 出场稳定性
  scarcity: 0.08,   // 位置稀缺
  tier: 0.08,       // 赛事级别（暂无 tier 字段时取中性 0.5）
  trend: 0.07,      // 成长趋势
  card: 0.06        // 卡种与应援
})

const ACHIEVEMENT_POINTS = Object.freeze({
  champion: 60,     // 赛事冠军
  mvp: 50,          // 赛事 MVP
  bestXI: 40,       // 最佳阵容入选
  topScorer: 40,    // 金靴
  limitedCard: 40,  // 限定卡，最多计 2 张
  supportRank: 30   // 应援榜前列
})

const TIER_NAMES = ['', 'S', 'SS', 'SSS']

const num = value => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const clamp01 = value => clamp(value, 0, 1)

function median(values) {
  const rows = (values || []).map(num).filter(value => value != null).sort((a, b) => a - b)
  if (!rows.length) return null
  const middle = Math.floor(rows.length / 2)
  return rows.length % 2 ? rows[middle] : (rows[middle - 1] + rows[middle]) / 2
}

/** 分位值：0 表示同组别最低，1 表示最高；并列取中点。 */
function percentile(value, peers) {
  const target = num(value)
  const rows = (peers || []).map(num).filter(row => row != null)
  if (target == null || !rows.length) return null
  let below = 0
  let equal = 0
  for (const row of rows) {
    if (row < target) below++
    else if (row === target) equal++
  }
  return clamp01((below + equal / 2) / rows.length)
}

/** 年龄：只认身份证号或 birthday 解析结果，缺失返回 null。 */
function parseAge(birthDate, now = new Date()) {
  if (!birthDate) return null
  const born = birthDate instanceof Date ? birthDate : new Date(birthDate)
  if (Number.isNaN(born.getTime())) return null
  const current = now instanceof Date ? now : new Date(now)
  if (Number.isNaN(current.getTime())) return null
  let age = current.getFullYear() - born.getFullYear()
  const beforeBirthday = current.getMonth() < born.getMonth() ||
    (current.getMonth() === born.getMonth() && current.getDate() < born.getDate())
  if (beforeBirthday) age -= 1
  return age >= 0 && age <= 100 ? age : null
}

/**
 * 年龄因子。
 * 成人：23–28 岁 1.00；19–22 岁 0.90–0.96；29–31 岁 0.90；32–34 岁 0.78；
 *      35–37 岁 0.65；38–40 岁 0.52；41 岁以上 0.40。
 * 青少年：18 岁 0.90，每降 2 岁减 0.05，最低 0.75（不设越小越贵）。
 * 组内微调：相对中位年龄每岁 ±0.02，封顶 ±0.1。
 */
function ageFactor(age, options = {}) {
  const years = num(age)
  if (years == null) return null
  let base
  if (years <= 18) base = Math.max(0.75, 0.9 - ((18 - years) / 2) * 0.05)
  else if (years <= 22) base = 0.9 + (years - 19) * 0.02
  else if (years <= 28) base = 1
  else if (years <= 31) base = 0.9
  else if (years <= 34) base = 0.78
  else if (years <= 37) base = 0.65
  else if (years <= 40) base = 0.52
  else base = 0.4
  const peerMedian = median(options.peerAges)
  if (peerMedian != null) base += clamp((years - peerMedian) * 0.02, -0.1, 0.1)
  return clamp01(base)
}

/** 出场稳定性：出场率 40% + 首发率 35% + 分钟占比 25%；无单场时长口径时按前两项 55%/45% 计。 */
function appearanceFactor(input = {}) {
  const appearances = num(input.appearances)
  const starts = num(input.starts)
  const totalMatches = num(input.totalMatches)
  const minutes = num(input.minutesPlayed)
  const minutesPerMatch = num(input.minutesPerMatch)
  if (appearances == null || starts == null || !totalMatches) return null
  const appearanceRate = clamp01(appearances / totalMatches)
  const startRate = appearances > 0 ? clamp01(starts / appearances) : 0
  if (minutes == null || !minutesPerMatch) return clamp01(appearanceRate * 0.55 + startRate * 0.45)
  const minuteShare = clamp01(minutes / (totalMatches * minutesPerMatch))
  return clamp01(appearanceRate * 0.4 + startRate * 0.35 + minuteShare * 0.25)
}

/**
 * 表现质量原始值：非门将取每 90 分钟进球，门将取零封率。
 * 归一化仍需同位置组的 peers.quality，由调用方按同一口径准备。
 */
function qualityMetric(input = {}) {
  if (input.positionBucket === 'GK') {
    const cleanSheets = num(input.cleanSheets)
    const appearances = num(input.appearances)
    if (cleanSheets == null || !appearances) return null
    return cleanSheets / appearances
  }
  const goals = num(input.goals)
  const minutes = num(input.minutesPlayed)
  if (goals == null || minutes == null || minutes <= 0) return null
  return goals / (minutes / 90)
}

/** 位置稀缺：每个位置按「每队应有 1 人」的供需比取值，供给越少越高。 */
function scarcityFactor(input = {}) {
  const counts = input.positionCounts || {}
  const own = num(counts[input.positionBucket])
  const teamCount = num(input.teamCount)
  if (!own || own <= 0 || !teamCount) return null
  return clamp01(teamCount / own)
}

/** 成长趋势：与上一份快照积分对比，无历史时取中性。 */
function trendFactor(input = {}) {
  const current = num(input.points)
  const previous = num(input.previousPoints)
  if (current == null) return null
  if (previous == null || previous <= 0) return 0.5
  return clamp01(0.5 + (current - previous) / previous / 2)
}

/** 卡种与应援：应援滴数取对数封顶占 80%，限定卡每张 +0.1（最多 2 张）。 */
function cardFactor(input = {}) {
  const drops = num(input.supportDrops)
  const limited = clamp(num(input.limitedCardCount) || 0, 0, LIMITED_CARD_CAP)
  const support = drops == null || drops <= 0 ? 0 : clamp01(Math.log10(1 + drops) / 4)
  return clamp01(support * 0.8 + limited * 0.1)
}

/** 成就分：跨届累加，不重置。 */
function achievementScore(achievements = [], limitedCardCount = 0) {
  const rows = Array.isArray(achievements) ? achievements : []
  let total = 0
  for (const row of rows) {
    const points = ACHIEVEMENT_POINTS[row && row.type]
    const count = num(row && row.count)
    if (!points || !count || count <= 0) continue
    total += points * (row.type === 'limitedCard' ? Math.min(count, LIMITED_CARD_CAP) : count)
  }
  // 限定卡也可直接通过卡池数量传入，避免两处口径不一致。
  if (limitedCardCount) {
    const explicit = rows.some(row => row && row.type === 'limitedCard')
    if (!explicit) total += ACHIEVEMENT_POINTS.limitedCard * clamp(num(limitedCardCount) || 0, 0, LIMITED_CARD_CAP)
  }
  return total
}

function tierOf(total) {
  const value = num(total)
  if (value == null || value < 0) return { level: 0, name: '', value: null, display: '待评估' }
  const level = Math.floor(value / TIER_STEP)
  const name = TIER_NAMES[level] || 'S'.repeat(Math.min(level, 6))
  const inTier = value - level * TIER_STEP
  return { level, name, value: inTier, display: level === 0 ? String(value) : `${name} ${inTier}` }
}

/**
 * 计算单个球员的转会评估指数。
 * 必填：playerId、points、metrics（含 coreCoverage）、positionBucket。
 * 核心三项覆盖不全时返回待评估，不按 0 计入。
 */
function compute(input = {}) {
  const computedAt = input.now ? new Date(input.now).toISOString() : new Date().toISOString()
  const playerId = input.playerId == null ? '' : String(input.playerId).trim()
  const coreCoverage = input.coreCoverage || 'complete'
  const result = {
    playerId,
    version: VERSION,
    computedAt,
    index: null,
    total: null,
    tier: '',
    tierValue: null,
    display: '待评估',
    money: null,
    moneyText: '',
    stars: null,
    starsFull: 0,
    starHalf: false,
    trendArrow: '→',
    trendTone: 'flat',
    coverage: coreCoverage === 'complete' ? 'complete' : 'pending',
    estimated: [],
    factors: {}
  }
  if (coreCoverage !== 'complete') {
    result.factors = { core: null, age: null, quality: null, appearance: null, scarcity: null, tier: 0.5, trend: null, card: null }
    return result
  }

  const estimated = []
  const mark = (key, value) => {
    if (value == null) {
      estimated.push(key)
      return 0.5
    }
    return value
  }

  const core = percentile(input.points, input.peerPoints)
  const factors = {
    core: mark('core', core),
    age: mark('age', ageFactor(parseAge(input.birthDate, input.now), { peerAges: input.peerAges })),
    quality: mark('quality', percentile(input.qualityMetric, input.peerQuality)),
    appearance: mark('appearance', appearanceFactor(input.appearance || {})),
    scarcity: mark('scarcity', scarcityFactor({ ...(input.scarcity || {}), positionBucket: input.positionBucket })),
    tier: num(input.tierScore) == null ? 0.5 : clamp01(input.tierScore),
    trend: mark('trend', trendFactor(input)),
    card: mark('card', cardFactor(input.card || {}))
  }
  if (num(input.tierScore) == null) estimated.push('tier')

  let weighted = 0
  for (const key of Object.keys(WEIGHTS)) weighted += WEIGHTS[key] * clamp01(factors[key])
  const qualityPoints = Math.round(clamp(weighted, 0, 1) * 100) * 10 // 0–100 加权分 → 0–1000 质量分
  const achievementPoints = achievementScore(input.achievements, input.limitedCardCount)
  const total = Math.max(0, qualityPoints + achievementPoints)
  const tier = tierOf(total)
  const presentation = present({ total, previousTotal: input.previousTotal, peers: input.peerTotals, minor: input.minor })

  return {
    ...result,
    index: qualityPoints,
    total,
    tier: tier.name,
    tierValue: tier.value,
    display: tier.display,
    money: presentation.money,
    moneyText: presentation.moneyText,
    stars: presentation.stars,
    starsFull: presentation.starsFull,
    starHalf: presentation.starHalf,
    trendArrow: presentation.trendArrow,
    trendTone: presentation.trendTone,
    achievements: achievementPoints,
    coverage: 'complete',
    estimated,
    factors
  }
}

/**
 * 展示层（FM 模式）：
 * 业余球员 100 元起步，按指数分段递增；星级 0.5–5 按同组别分位；
 * 走势按与上一份快照比较（±2% 内为平）。
 * 未成年人不展示货币与希望值，仅返回星级，供组委会与球队管理端内部使用。
 */
// 分段单价（元/点）与分段起点，段内线性累加，最低从 100 元起步。
const MONEY_CURVE = Object.freeze([
  { upTo: 500, perPoint: 0.4 },    // 0–500：100 → 300 元
  { upTo: 1000, perPoint: 2.4 },   // 500–1000：300 → 1500 元
  { upTo: 2000, perPoint: 6.5 },   // 1000–2000：1500 → 8000 元
  { upTo: 3000, perPoint: 12 },    // 2000–3000：8000 → 20000 元
  { upTo: Infinity, perPoint: 20 } // 3000 以上：每点 20 元
])
const MONEY_FLOOR = 100

function moneyOf(total) {
  const value = num(total)
  if (value == null || value < 0) return null
  if (value <= 0) return MONEY_FLOOR
  let money = MONEY_FLOOR
  let start = 0
  for (const segment of MONEY_CURVE) {
    const end = Math.min(value, segment.upTo)
    if (end <= start) break
    money += (end - start) * segment.perPoint
    start = end
    if (value <= segment.upTo) break
  }
  return Math.max(MONEY_FLOOR, Math.round(money / 10) * 10)
}

function formatMoney(yuan) {
  if (!(yuan > 0)) return '¥0'
  if (yuan < 10000) return `¥${Math.round(yuan).toLocaleString('en-US')}`
  if (yuan < 1000000) return `¥${(yuan / 10000).toFixed(1)} 万`
  return `¥${(yuan / 1000000).toFixed(1)} 百万`
}

function starOf(total, peers) {
  const ratio = percentile(total, peers)
  if (ratio == null) return null
  return clamp(0.5 + Math.round(ratio * 9) / 2, 0.5, 5)
}

function trendArrowOf(total, previousTotal) {
  const now = num(total)
  const before = num(previousTotal)
  if (now == null || before == null || before <= 0) return '→'
  const delta = (now - before) / before
  if (delta > 0.02) return '↑'
  if (delta < -0.02) return '↓'
  return '→'
}

function present({ total, previousTotal, peers, minor } = {}) {
  const value = num(total)
  const money = value == null ? null : moneyOf(value)
  const stars = starOf(value, peers)
  const trendArrow = trendArrowOf(value, previousTotal)
  return {
    money: minor ? null : money,
    moneyText: minor || money == null ? '' : formatMoney(money),
    stars,
    starsFull: stars == null ? 0 : Math.floor(stars),
    starHalf: stars == null ? false : stars - Math.floor(stars) >= 0.5,
    trendArrow,
    trendTone: trendArrow === '↑' ? 'up' : trendArrow === '↓' ? 'down' : 'flat',
    minor: Boolean(minor)
  }
}

module.exports = {
  VERSION,
  WEIGHTS,
  ACHIEVEMENT_POINTS,
  TIER_STEP,
  TIER_NAMES,
  MONEY_CURVE,
  MONEY_FLOOR,
  moneyOf,
  parseAge,
  ageFactor,
  appearanceFactor,
  qualityMetric,
  scarcityFactor,
  trendFactor,
  cardFactor,
  achievementScore,
  tierOf,
  percentile,
  formatMoney,
  starOf,
  trendArrowOf,
  present,
  compute
}
