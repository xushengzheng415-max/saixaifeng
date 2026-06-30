<template>
  <div class="rankings-tab">
    <!-- 联赛制 / 赛会制：积分榜表格 -->
    <template v-if="showStandings">
      <!-- 积分规则提示 -->
      <div v-if="pointsRule" class="points-rule-hint">
        <span class="rule-badge">积分: 胜{{ pointsRule.winPoints }} 平{{ pointsRule.drawPoints }} 负{{ pointsRule.lossPoints }}</span>
        <span v-if="pointsRule.enableGoalBonus" class="rule-badge">进球奖励 +{{ pointsRule.goalBonusPoints }}</span>
        <span v-if="pointsRule.enableCardDeduction" class="rule-badge">黄牌-{{ pointsRule.yellowCardDeduction }} 红牌-{{ pointsRule.redCardDeduction }}</span>
      </div>

      <div class="ranking-type-tabs">
        <button
          v-for="t in types"
          :key="t.value"
          class="type-btn"
          :class="{ active: activeType === t.value }"
          @click="switchType(t.value)"
        >{{ t.label }}</button>
      </div>

      <div v-loading="loading" class="ranking-table">
        <template v-if="list.length > 0">
          <div class="table-header">
            <div class="col-no">排名</div>
            <div class="col-name">名称</div>
            <div class="col-stat" v-for="c in statColumns" :key="c.key">{{ c.label }}</div>
          </div>
          <div
            v-for="(item, index) in list"
            :key="item.id"
            class="table-row"
            @click="goDetail(item)"
          >
            <div class="col-no rank-no" :class="rankClass(index)">{{ index + 1 }}</div>
            <div class="col-name">
              <TeamLogo v-if="activeType === 'team'" :src="item.logo" :name="item.name" :size="28" :show-name="true" />
              <PlayerAvatar v-else :src="item.logo" :name="item.name" :size="28" :show-number="false" :show-name="true" />
            </div>
            <div class="col-stat" v-for="c in statColumns" :key="c.key">{{ item[c.key] }}</div>
          </div>
        </template>
        <EmptyState v-else description="暂无榜单数据" />
      </div>
    </template>

    <!-- 杯赛制 / 复合制：淘汰赛对阵树（占位） -->
    <template v-else-if="showKnockout">
      <div class="knockout-placeholder">
        <el-empty description="淘汰赛对阵图开发中…" />
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { callFunction } from '@/utils/cloud'
import TeamLogo from '../../components/TeamLogo.vue'
import PlayerAvatar from '../../components/PlayerAvatar.vue'
import EmptyState from '../../components/EmptyState.vue'

/**
 * 榜单组件 — 支持动态积分规则 & 同分排序
 *
 * 核心能力：
 * 1. 从赛事详情读取积分规则（胜/平/负分值、进球奖励、扣分等）
 * 2. 按配置的 tiebreakerOrder 同分排序（7种规则）
 * 3. 按 matchFormat 切换显示（联赛积分榜 / 小组赛 / 淘汰赛）
 */
const props = defineProps({
  tournamentId: { type: [String, Number], default: '' },
  matchFormat: { type: String, default: 'tournament' }
})

const activeType = ref('team')
const loading = ref(false)
const matchFormat = computed(() => props.matchFormat || 'tournament')

// === 动态数据 ===
const standings = ref([])           // 计算后的积分榜
const groupStandings = ref([])      // 小组积分榜（赛会制）
const knockoutBracket = ref([])     // 淘汰赛对阵（杯赛制）

// 从赛事详情读取的积分规则
const pointsRule = ref(null)        // 完整的 pointsRule 对象
const tiebreakerOrder = ref([])     // 同分排序规则顺序数组

// 原始比赛数据（缓存，避免重复请求）
const allMatches = ref([])
const tournamentDetail = ref(null)

// === 榜单类型 ===
const types = [
  { value: 'team', label: '球队榜' },
  { value: 'player', label: '射手榜' },
  { value: 'assist', label: '助攻榜' }
]

const statColumns = computed(() => {
  if (activeType.value === 'team') {
    return [
      { key: 'played', label: '场' },
      { key: 'win', label: '胜' },
      { key: 'draw', label: '平' },
      { key: 'lose', label: '负' },
      { key: 'gf', label: '进' },
      { key: 'ga', label: '失' },
      { key: 'gd', label: '净胜' },
      { key: 'points', label: '积分' }
    ]
  }
  return [
    { key: 'team', label: '所属球队' },
    { key: 'played', label: '出场' },
    { key: 'goals', label: activeType.value === 'assist' ? '助攻' : '进球' }
  ]
})

// 显示控制
const showStandings = computed(() => {
  return matchFormat.value === 'league' || matchFormat.value === 'tournament'
})
const showKnockout = computed(() => {
  return matchFormat.value === 'cup' || matchFormat.value === 'combined'
})

const list = computed(() => {
  if (activeType.value === 'team') return standings.value
  return playerList.value
})

// 球员榜 Mock（后续对接真实数据）
const playerList = ref([])

function switchType(value) {
  activeType.value = value
  if (value === 'team') recalculateStandings()
}

function rankClass(index) {
  if (index === 0) return 'no-1'
  if (index === 1) return 'no-2'
  if (index === 2) return 'no-3'
  return ''
}

function goDetail(item) {
  // 预留：跳转球队/球员详情
}

// ============================================================
// 核心：根据动态积分规则计算积分榜
// ============================================================

/**
 * 同分排序规则映射表
 * 每个 ruleKey 对应一个比较函数，返回正数表示 a 排在 b 后面
 */
const TIEBREAKER_COMPARATORS = {
  /**
   * 相互胜负关系 — 两队之间比赛的积分高低
   */
  headToHead(a, b, matches) {
    const h2h = getHeadToHead(a.id, b.id, matches)
    if (!h2h) return 0
    // 比较 H2H 总积分
    return h2h.bPoints - h2h.aPoints
  },

  /**
   * 相互净胜球 — 两队之间比赛的净胜球差
   */
  headToHeadGoalDiff(a, b, matches) {
    const h2h = getHeadToHead(a.id, b.id, matches)
    if (!h2h) return 0
    return (h2h.bGf - h2h.bGa) - (h2h.aGf - h2h.aGa)
  },

  /**
   * 相互进球 — 两队之间的总进球数
   */
  headToHeadGoals(a, b, matches) {
    const h2h = getHeadToHead(a.id, b.id, matches)
    if (!h2h) return 0
    return h2h.bGf - h2h.aGf
  },

  /**
   * 总净胜球
   */
  goalDiff(a, b) {
    return b.gd - a.gd
  },

  /**
   * 总进球
   */
  totalGoals(a, b) {
    return b.gf - a.gf
  },

  /**
   * 红黄牌数少优先（牌少者排前面 → 返回 aCards - bCards，让牌少的前面）
   */
  fewestCards(a, b) {
    const aCards = (a.yellowCards || 0) + (a.redCards || 0) * 2
    const bCards = (b.yellowCards || 0) + (b.redCards || 0) * 2
    return aCards - bCards
  },

  /**
   * 总失球（失球少者排前面 → 返回 a.ga - b.ga）
   */
  goalsConceded(a, b) {
    return a.ga - b.ga
  }
}

/**
 * 获取两支球队相互交战的统计数据
 */
function getHeadToHead(teamAId, teamBId, matches) {
  let aGf = 0, aGa = 0, aPoints = 0
  let bGf = 0, bGa = 0, bPoints = 0
  const rule = pointsRule.value || { winPoints: 3, drawPoints: 1, lossPoints: 0 }

  ;(matches || []).forEach(m => {
    if (m.status !== 'completed') return
    const isHomeA = m.homeTeamId === teamAId && m.awayTeamId === teamBId
    const isHomeB = m.homeTeamId === teamBId && m.awayTeamId === teamAId
    if (!isHomeA && !isHomeB) return

    const hs = m.homeScore || 0
    const as = m.awayScore || 0

    if (isHomeA) {
      aGf += hs; aGa += as
      bGf += as; bGa += hs
      if (hs > as) aPoints += rule.winPoints
      else if (hs < as) bPoints += rule.winPoints
      else { aPoints += rule.drawPoints; bPoints += rule.drawPoints }
    } else {
      bGf += hs; bGa += as
      aGf += as; aGa += hs
      if (hs > as) bPoints += rule.winPoints
      else if (hs < as) aPoints += rule.winPoints
      else { aPoints += rule.drawPoints; bPoints += rule.drawPoints }
    }
  })

  // 如果两队没有交手记录，返回 null 表示无法比较
  if (aGf === 0 && bGf === 0 && aPoints === 0 && bPoints === 0) return null

  return { aGf, aGa, aPoints, bGf, bGa, bPoints }
}

/**
 * 主计算函数：从比赛结果计算完整积分榜
 *
 * 流程：
 * 1. 遍历所有已完成的比赛，统计每队基础数据
 * 2. 应用动态积分规则计算各队积分
 * 3. 按积分降序排列
 * 4. 对同分队应用 tiebreakerOrder 中的规则逐级比较
 */
function calculateStandings(matches, rule) {
  const r = rule || { winPoints: 3, drawPoints: 1, lossPoints: 0 }
  const map = {}

  // 第一轮：统计基础数据
  ;(matches || []).forEach(m => {
    if (m.status !== 'completed') return
    const h = m.homeTeamId, a = m.awayTeamId
    if (!h || !a) return

    // 初始化队伍数据
    if (!map[h]) map[h] = initTeamRecord(h, m.homeTeamName)
    if (!map[a]) map[a] = initTeamRecord(a, m.awayTeamName)

    const hs = m.homeScore || 0
    const as = m.awayScore || 0

    // 进球/失球
    map[h].gf += hs; map[h].ga += as
    map[a].gf += as; map[a].ga += hs
    map[h].played++; map[a].played++

    // 黄红牌统计
    if (m.events) {
      ;(m.events || []).forEach(evt => {
        if (evt.teamId === h) {
          if (evt.type === 'yellow_card') map[h].yellowCards++
          if (evt.type === 'red_card') map[h].redCards++
        }
        if (evt.teamId === a) {
          if (evt.type === 'yellow_card') map[a].yellowCards++
          if (evt.type === 'red_card') map[a].redCards++
        }
      })
    }

    // 比赛结果判定 & 积分计算
    if (hs > as) {
      // 主队赢
      map[h].win++
      map[h].points += r.winPoints
      map[a].lose++
      map[a].points += r.lossPoints
      // 进球奖励分
      if (r.enableGoalBonus) {
        map[h].points += r.goalBonusPoints * hs
        map[a].points += r.goalBonusPoints * as
      }
    } else if (hs < as) {
      // 客队赢
      map[a].win++
      map[a].points += r.winPoints
      map[h].lose++
      map[h].points += r.lossPoints
      if (r.enableGoalBonus) {
        map[a].points += r.goalBonusPoints * as
        map[h].points += r.goalBonusPoints * hs
      }
    } else {
      // 平局
      map[h].draw++; map[a].draw++
      map[h].points += r.drawPoints; map[a].points += r.drawPoints
      if (r.enableGoalBonus) {
        map[h].points += r.goalBonusPoints * hs
        map[a].points += r.goalBonusPoints * as
      }
    }

    // 牌扣分
    if (r.enableCardDeduction) {
      map[h].points -= (map[h].yellowCards * r.yellowCardDeduction) + (map[h].redCards * r.redCardDeduction)
      map[a].points -= (map[a].yellowCards * r.yellowCardDeduction) + (map[a].redCards * r.redCardDeduction)
    }
  })

  // 第二轮：计算净胜球
  Object.values(map).forEach(t => {
    t.gd = t.gf - t.ga
  })

  // 第三轮：获取同分排序规则顺序
  const order = tiebreakerOrder.value || ['headToHead', 'headToHeadGoalDiff', 'headToHeadGoals', 'goalDiff', 'totalGoals', 'fewestCards', 'goalsConceded']

  // 第四轮：排序 — 先按积分降序，再按同分规则逐级比较
  const teams = Object.values(map).sort((a, b) => {
    // 先比积分（降序）
    if (b.points !== a.points) return b.points - a.points

    // 积分相同，按 tiebreakerOrder 逐级比较
    for (const ruleKey of order) {
      const comparator = TIEBREAKER_COMPARATORS[ruleKey]
      if (!comparator) continue // 未知规则跳过
      const result = comparator(a, b, matches)
      if (result !== 0) return result
    }

    // 所有规则都一样，按 ID 排序保证稳定性
    return String(a.id).localeCompare(String(b.id))
  })

  // 第五轮：添加排名
  return teams.map((t, i) => ({ ...t, rank: i + 1 }))
}

/**
 * 初始化一条队伍记录
 */
function initTeamRecord(id, name) {
  return {
    id,
    name: name || '',
    logo: '',
    played: 0,
    win: 0,
    draw: 0,
    lose: 0,
    gf: 0,       // 总进球
    ga: 0,       // 总失球
    gd: 0,       // 净胜球（计算后填入）
    points: 0,
    yellowCards: 0,
    redCards: 0
  }
}

/**
 * 重新计算积分榜（当切换 tab 或数据更新时调用）
 */
function recalculateStandings() {
  if (allMatches.value.length > 0) {
    standings.value = calculateStandings(allMatches.value, pointsRule.value)
  }
}

// ============================================================
// 数据加载
// ============================================================

/** 加载赛事详情（获取积分规则） */
async function loadTournamentDetail() {
  try {
    const res = await callFunction('getTournamentDetail', { id: props.tournamentId })
    if (res.success && res.data) {
      tournamentDetail.value = res.data
      // 提取积分规则
      if (res.data.rules && res.data.rules.pointsRule) {
        pointsRule.value = res.data.rules.pointsRule
        tiebreakerOrder.value = res.data.rules.pointsRule.tiebreakerOrder || []
      }
    }
  } catch (e) {
    console.error('加载赛事详情失败:', e)
  }
}

/** 加载比赛列表 */
async function loadMatches() {
  loading.value = true
  try {
    // 并行加载：赛事详情（积分规则）+ 比赛数据
    const [detailRes, matchesRes] = await Promise.allSettled([
      loadTournamentDetail(),
      callFunction('getTournamentMatches', { tournamentId: props.tournamentId })
    ])

    if (matchesRes.status === 'fulfilled' && matchesRes.value?.success) {
      allMatches.value = matchesRes.value.data || []
      // 数据就绪后立即计算
      recalculateStandings()
    }
  } catch (e) {
    console.error('加载比赛数据失败:', e)
  } finally {
    loading.value = false
  }
}

// 监听 tournamentId 变化（父组件传入时可能变化）
watch(() => props.tournamentId, () => {
  if (props.tournamentId) loadMatches()
}, { immediate: true })

onMounted(() => {
  if (props.tournamentId) loadMatches()
})
</script>

<style scoped>
.rankings-tab {
  padding: 4px 0;
}

/* 积分规则提示条 */
.points-rule-hint {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.rule-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: #f0f9ff;
  color: #0369a1;
  border: 1px solid #bae6fd;
  white-space: nowrap;
}

.ranking-type-tabs {
  display: flex;
  background: var(--portal-bg-page, #f5f7fa);
  border-radius: var(--portal-radius-sm, 6px);
  padding: 3px;
  margin-bottom: 12px;
  width: fit-content;
}

.type-btn {
  padding: 6px 16px;
  border: none;
  background: transparent;
  font-size: 13px;
  color: var(--portal-text-secondary, #909399);
  cursor: pointer;
  border-radius: var(--portal-radius-sm, 6px);
  transition: all 0.2s;
}

.type-btn.active {
  background: #fff;
  color: var(--portal-primary-light, #2E7D32);
  font-weight: 500;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.ranking-table {
  min-height: 200px;
}

.table-header,
.table-row {
  display: grid;
  grid-template-columns: 40px 1fr repeat(8, 48px);
  align-items: center;
  gap: 2px;
  padding: 7px 6px;
}

.table-header {
  font-size: 11px;
  color: var(--portal-text-secondary, #909399);
  font-weight: 500;
  border-bottom: 1px solid var(--portal-border, #ebeef5);
}

.table-row {
  font-size: 12px;
  color: var(--portal-text-primary, #303133);
  border-bottom: 1px solid var(--portal-border, #ebeef5);
  cursor: pointer;
  transition: background 0.2s;
}

.table-row:hover {
  background: var(--portal-primary-bg, #E8F5E9);
}

.col-no {
  text-align: center;
  font-weight: 600;
}

.rank-no.no-1 { color: #F44336; }
.rank-no.no-2 { color: #FF9800; }
.rank-no.no-3 { color: #FFB300; }

.col-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-stat {
  text-align: center;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
}

.knockout-placeholder {
  min-height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
}

@media (min-width: 768px) {
  .table-header,
  .table-row {
    grid-template-columns: 48px 1fr repeat(8, 56px);
    padding: 10px 12px;
  }
  .table-header {
    font-size: 12px;
  }
  .table-row {
    font-size: 13px;
  }
}
</style>
