<template>
  <div class="tournament-detail-page portal-container">
    <div v-loading="loading" class="detail-content">
      <!-- 赛事头部 -->
      <TournamentHeader
        :id="tournamentId"
        v-bind="tournament"
        @follow="handleFollow"
        @unfollow="handleUnfollow"
      />

      <!-- 4 Tab 路由联动 -->
      <el-tabs v-model="activeTab" class="detail-tabs" @tab-change="handleTabChange">
        <el-tab-pane label="赛况" name="matches">
          <router-view v-if="isMatchesRoute" name="matches" />
          <MatchesTab v-else :tournament-id="tournamentId" />
        </el-tab-pane>
        <el-tab-pane label="阵容" name="squads">
          <router-view v-if="isSquadsRoute" name="squads" />
          <SquadsTab v-else :tournament-id="tournamentId" />
        </el-tab-pane>
        <el-tab-pane label="榜单" name="rankings">
          <router-view v-if="isRankingsRoute" name="rankings" />
          <RankingsTab v-else :tournament-id="tournamentId" :match-format="matchFormat" />
        </el-tab-pane>
        <el-tab-pane label="竞猜" name="guess">
          <router-view v-if="isGuessRoute" name="guess" />
          <GuessTab v-else :tournament-id="tournamentId" />
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { callFunction } from '@/utils/cloud'
import TournamentHeader from './components/TournamentHeader.vue'
import MatchesTab from './detail/MatchesTab.vue'
import SquadsTab from './detail/SquadsTab.vue'
import RankingsTab from './detail/RankingsTab.vue'
import GuessTab from './detail/GuessTab.vue'

/**
 * 赛事详情页框架
 * 赛事头部 + 4 Tab（赛况/阵容/榜单/竞猜）路由联动
 *
 * Tab 与子路由对应关系：
 *   matches   → /portal/tournament/:id/matches
 *   squads    → /portal/tournament/:id/squads
 *   rankings  → /portal/tournament/:id/rankings
 *   guess     → /portal/tournament/:id/guess
 *
 * 当前实现：Tab 内直接渲染组件（未启用命名路由视图），
 * 切换 Tab 时同步 URL，便于分享和刷新保持状态。
 */
const route = useRoute()
const router = useRouter()

const tournamentId = computed(() => route.params.id || 'all')
const loading = ref(false)
const matchFormat = ref('tournament') // 赛制：tournament/cup/league/combined

// 真实赛事信息
const tournament = ref({
  name: '',
  cover: '',
  season: '',
  organizer: '',
  teamCount: 0,
  status: '',
  categoryLabel: '',
  followed: false,
  matchFormat: 'tournament'
})

// 根据 URL 推断当前 Tab
const activeTab = ref('matches')

function syncTabFromRoute() {
  const path = route.path
  if (path.endsWith('/squads')) activeTab.value = 'squads'
  else if (path.endsWith('/rankings')) activeTab.value = 'rankings'
  else if (path.endsWith('/guess')) activeTab.value = 'guess'
  else activeTab.value = 'matches'
}

async function loadTournament() {
  loading.value = true
  try {
    const res = await callFunction('getTournamentDetail', { id: tournamentId.value })
    if (res.success && res.data) {
      const d = res.data
      tournament.value = {
        ...d,
        followed: false // 前端本地状态
      }
      matchFormat.value = d.matchFormat || 'tournament'
    }
  } catch (e) {
    console.error('加载赛事详情失败:', e)
  } finally {
    loading.value = false
  }
}

// 命名路由视图占位（当前未启用，保留扩展点）
const isMatchesRoute = computed(() => false)
const isSquadsRoute = computed(() => false)
const isRankingsRoute = computed(() => false)
const isGuessRoute = computed(() => false)

function handleTabChange(name) {
  // 切换 Tab 时同步 URL
  const id = tournamentId.value
  if (name === 'matches') router.push(`/portal/tournament/${id}/matches`)
  else if (name === 'squads') router.push(`/portal/tournament/${id}/squads`)
  else if (name === 'rankings') router.push(`/portal/tournament/${id}/rankings`)
  else if (name === 'guess') router.push(`/portal/tournament/${id}/guess`)
}

function handleFollow() {
  tournament.value.followed = true
  callFunction('followTournament', { tournamentId: tournamentId.value }).catch(() => {})
}

function handleUnfollow() {
  tournament.value.followed = false
  callFunction('unfollowTournament', { tournamentId: tournamentId.value }).catch(() => {})
}

watch(() => route.path, syncTabFromRoute)

onMounted(() => {
  syncTabFromRoute()
  loadTournament()
})
</script>

<style scoped>
.tournament-detail-page {
  padding: 12px 0 16px;
}

@media (min-width: 1024px) {
  .tournament-detail-page {
    padding: 20px 0 32px;
  }
}

.detail-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.detail-tabs {
  background: var(--portal-bg-card, #fff);
  border-radius: var(--portal-radius-md, 10px);
  padding: 0 14px 14px;
  box-shadow: var(--portal-shadow-sm, 0 1px 4px rgba(0,0,0,0.06));
}

.detail-tabs :deep(.el-tabs__header) {
  margin-bottom: 14px;
}

.detail-tabs :deep(.el-tabs__item) {
  font-size: 15px;
  height: 44px;
  padding: 0 16px;
}

.detail-tabs :deep(.el-tabs__item.is-active) {
  font-weight: 600;
  color: var(--portal-primary, #1B5E20);
}

.detail-tabs :deep(.el-tabs__active-bar) {
  background-color: var(--portal-primary-lighter, #43A047);
}
</style>
