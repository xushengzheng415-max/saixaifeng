<template>
  <div class="matches-tab">
    <!-- 轮次选择 -->
    <div class="round-selector">
      <el-select v-model="activeRound" size="small" @change="handleRoundChange">
        <el-option
          v-for="r in rounds"
          :key="r.value"
          :label="r.label"
          :value="r.value"
        />
      </el-select>
    </div>

    <!-- 状态分段 -->
    <el-tabs v-model="activeStatus" class="status-tabs" @tab-change="handleStatusChange">
      <el-tab-pane label="全部" name="all" />
      <el-tab-pane label="未开始" name="upcoming" />
      <el-tab-pane label="进行中" name="ongoing" />
      <el-tab-pane label="已结束" name="finished" />
    </el-tabs>

    <!-- 比赛列表 -->
    <div v-loading="loading" class="matches-list">
      <template v-if="filteredMatches.length > 0">
        <MatchCard
          v-for="match in filteredMatches"
          :key="match.id"
          v-bind="match"
          @click="goMatch(match)"
          @action="handleAction(match, $event)"
        />
      </template>
      <EmptyState v-else description="暂无比赛" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import MatchCard from '../../match/components/MatchCard.vue'
import EmptyState from '../../components/EmptyState.vue'

/**
 * 赛况 Tab
 * 轮次选择 + 状态分段 + 比赛列表
 */
const props = defineProps({
  tournamentId: { type: [String, Number], default: '' }
})

const router = useRouter()
const activeRound = ref('all')
const activeStatus = ref('all')
const loading = ref(false)

const rounds = [
  { value: 'all', label: '全部轮次' },
  { value: 'r1', label: '第1轮' },
  { value: 'r2', label: '第2轮' },
  { value: 'r3', label: '第3轮' },
  { value: 'r4', label: '第4轮' },
  { value: 'r5', label: '第5轮' },
  { value: 'qf', label: '1/4决赛' },
  { value: 'sf', label: '半决赛' },
  { value: 'final', label: '决赛' }
]

// Mock 比赛数据
const matches = ref([
  { id: 'm1', tournamentName: '青少年足球锦标赛', round: '第8轮', status: 'ongoing', homeName: '红魔联队', homeLogo: '', homeScore: 2, awayName: '蓝焰FC', awayLogo: '', awayScore: 1, matchMinute: "67'", venue: '奥林匹克体育场', liveUrl: '#' },
  { id: 'm2', tournamentName: '青少年足球锦标赛', round: '第8轮', status: 'today', homeName: '北风竞技', homeLogo: '', homeScore: 0, awayName: '南方雄狮', awayLogo: '', awayScore: 0, matchTime: '今天 21:00', venue: '北风球场' },
  { id: 'm3', tournamentName: '青少年足球锦标赛', round: '第7轮', status: 'finished', homeName: '绿茵之翼', homeLogo: '', homeScore: 3, awayName: '雷霆竞技', awayLogo: '', awayScore: 1, venue: '工人球场', replayUrl: '#' },
  { id: 'm4', tournamentName: '青少年足球锦标赛', round: '第7轮', status: 'finished', homeName: '海港之星', homeLogo: '', homeScore: 2, awayName: '山城联队', awayLogo: '', awayScore: 2, venue: '海港体育中心' },
  { id: 'm5', tournamentName: '青少年足球锦标赛', round: '第9轮', status: 'upcoming', homeName: '红魔联队', homeLogo: '', homeScore: 0, awayName: '绿茵之翼', awayLogo: '', awayScore: 0, matchTime: '下周一 19:30', venue: '奥林匹克体育场' }
])

const filteredMatches = computed(() => {
  let list = matches.value
  // 轮次过滤（mock 简单匹配 round 文本）
  if (activeRound.value !== 'all') {
    const roundLabel = rounds.find((r) => r.value === activeRound.value)?.label || ''
    if (roundLabel) {
      list = list.filter((m) => m.round === roundLabel)
    }
  }
  // 状态过滤
  if (activeStatus.value !== 'all') {
    list = list.filter((m) => m.status === activeStatus.value)
  }
  return list
})

function handleRoundChange() {
  // 预留：根据轮次请求数据
}

function handleStatusChange() {
  // 本地过滤即可
}

function goMatch(match) {
  router.push(`/portal/match/${match.id}`)
}

function handleAction(match, type) {
  if (type === 'live') router.push(`/portal/match/${match.id}?tab=live`)
  else if (type === 'replay') router.push(`/portal/match/${match.id}?tab=replay`)
}

onMounted(() => {
  // 预留：callFunction('getMatchesByTournament', { tournamentId: props.tournamentId })
})
</script>

<style scoped>
.matches-tab {
  padding: 4px 0;
}

.round-selector {
  margin-bottom: 10px;
}

.round-selector :deep(.el-select) {
  width: 140px;
}

.status-tabs :deep(.el-tabs__header) {
  margin: 0 0 10px 0;
}

.status-tabs :deep(.el-tabs__item) {
  font-size: 13px;
  height: 36px;
  padding: 0 12px;
}

.matches-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 200px;
}
</style>
