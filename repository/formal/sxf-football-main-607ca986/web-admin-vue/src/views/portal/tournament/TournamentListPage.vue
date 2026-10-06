<template>
  <div class="tournament-list-page portal-container">
    <!-- 页面头部 -->
    <div class="page-header">
      <div class="header-content">
        <h1 class="page-title">赛事中心</h1>

      </div>
    </div>

    <!-- 分类筛选 -->
    <CategoryFilter
      v-model="category"
      v-model:status="status"
      class="filter-section"
      @change="handleFilterChange"
    />

    <!-- 赛事列表 -->
    <div v-loading="loading" class="list-section">
      <template v-if="filteredTournaments.length > 0">
        <div class="tournament-grid">
          <TournamentCard
            v-for="t in filteredTournaments"
            :key="t.id"
            v-bind="t"
          />
        </div>
      </template>
      <EmptyState v-else description="暂无符合条件的赛事" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import CategoryFilter from './components/CategoryFilter.vue'
import TournamentCard from './components/TournamentCard.vue'
import EmptyState from '../components/EmptyState.vue'

/**
 * 赛事列表页 - 增强版本
 * 设计要求：
 * - 页面头部：大标题"赛事中心"(24px 粗体 绿色) + 副标题(14px 灰色)
 * - CategoryFilter 横向滚动Tab
 * - 赛事网格：移动端2列 / 平板3列 / PC 4列
 */
const route = useRoute()

const category = ref('all')
const status = ref('all')
const loading = ref(false)

// Mock 赛事数据
const tournaments = ref([
  { id: 't1', name: '2026 青少年足球锦标赛', cover: '', season: '2026 赛季', organizer: '青训中心', teamCount: 30, status: 'ongoing', category: 'youth', categoryLabel: '青少年赛事', hot: 5420 },
  { id: 't2', name: '校园青少年联赛', cover: '', season: '2026 春', organizer: '教育局', teamCount: 28, status: 'ongoing', category: 'youth', categoryLabel: '青少年赛事', hot: 4109 },
  { id: 't3', name: 'U12 青训邀请赛', cover: '', season: '2026 春', organizer: '青训联盟', teamCount: 24, status: 'registering', category: 'youth', categoryLabel: '青少年赛事', hot: 3210 },
  { id: 't4', name: 'U15 校园冠军杯', cover: '', season: '2026 夏', organizer: '校园足球中心', teamCount: 32, status: 'registering', category: 'youth', categoryLabel: '青少年赛事', hot: 2876 },
  { id: 't5', name: 'U18 青少年精英赛', cover: '', season: '2026 赛季', organizer: '赛小蜂足球', teamCount: 16, status: 'completed', category: 'youth', categoryLabel: '青少年赛事', hot: 2345 }
])

const filteredTournaments = computed(() => {
  let list = tournaments.value
  if (category.value !== 'all') {
    list = list.filter((t) => t.category === category.value)
  }
  if (status.value !== 'all') {
    list = list.filter((t) => t.status === status.value)
  }
  return list
})

function handleFilterChange(payload) {
  // 预留：根据筛选条件重新请求数据
}

function syncFromQuery() {
  if (route.query.category) category.value = String(route.query.category)
}

watch(() => route.query, syncFromQuery)

onMounted(() => {
  syncFromQuery()
})
</script>

<style scoped>
.tournament-list-page {
  padding: 16px 0 24px;
}

@media (min-width: 1024px) {
  .tournament-list-page {
    padding: 24px 0 40px;
  }
}

/* 页面头部 */
.page-header {
  margin-bottom: 20px;
}

.header-content {
  padding: 24px 20px;
  background: var(--portal-gradient-hero);
  border-radius: 12px;
  color: #FFFFFF;
  box-shadow: 0 4px 16px rgba(27, 94, 32, 0.2);
}

.page-title {
  font-size: 24px;
  font-weight: 700;
  margin: 0 0 6px 0;
  letter-spacing: 0.5px;
}

.page-subtitle {
  font-size: 14px;
  opacity: 0.85;
  margin: 0;
}

/* 筛选区 */
.filter-section {
  margin-bottom: 16px;
}

/* 列表区 */
.list-section {
  min-height: 200px;
}

/* 赛事网格 */
.tournament-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

@media (min-width: 768px) {
  .tournament-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
  }
}

@media (min-width: 1024px) {
  .tournament-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
</style>
