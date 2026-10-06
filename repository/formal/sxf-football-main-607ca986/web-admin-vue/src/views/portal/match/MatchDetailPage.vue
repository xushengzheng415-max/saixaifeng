<template>
  <div class="match-detail-page portal-container">
    <div v-loading="loading" class="detail-content">
      <!-- 返回按钮（移动端） -->
      <div class="back-bar">
        <el-button text @click="goBack">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
      </div>

      <!-- 比赛卡片 -->
      <MatchCard
        v-if="match"
        v-bind="match"
        :show-footer="true"
        :clickable="false"
        class="match-card-block"
      />

      <!-- 比赛信息 -->
      <div v-if="match" class="info-card">
        <div class="info-row">
          <span class="info-label">赛事</span>
          <span class="info-value">{{ match.tournamentName }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">轮次</span>
          <span class="info-value">{{ match.round || '-' }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">时间</span>
          <span class="info-value">{{ match.matchTime || '待定' }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">场地</span>
          <span class="info-value">{{ match.venue || '待定' }}</span>
        </div>
      </div>

      <!-- 直播/回放区（占位） -->
      <div class="media-area">
        <EmptyState
          :description="match && match.status === 'ongoing' ? '直播流加载中...' : (match && match.status === 'finished' ? '回放加载中...' : '比赛尚未开始')"
          :image-size="100"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import MatchCard from './components/MatchCard.vue'
import EmptyState from '../components/EmptyState.vue'

/**
 * 比赛详情页（占位）
 * 展示比赛卡片 + 基本信息 + 直播/回放区
 */
const route = useRoute()
const router = useRouter()
const loading = ref(false)

const matchId = computed(() => route.params.id)

// Mock 比赛数据
const match = ref(null)

function loadMockMatch() {
  match.value = {
    id: matchId.value,
    tournamentName: '黄冠联赛',
    round: '第8轮',
    status: 'ongoing',
    homeName: '红魔联队',
    homeLogo: '',
    homeScore: 2,
    awayName: '蓝焰FC',
    awayLogo: '',
    awayScore: 1,
    matchMinute: "67'",
    matchTime: '今天 19:30',
    venue: '奥林匹克体育场',
    liveUrl: '#'
  }
}

function goBack() {
  router.back()
}

onMounted(() => {
  loadMockMatch()
  // 预留：callFunction('getMatchDetail', { id: matchId.value })
})
</script>

<style scoped>
.match-detail-page {
  padding: 12px 0 16px;
}

@media (min-width: 1024px) {
  .match-detail-page {
    padding: 20px 0 32px;
  }
}

.detail-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.back-bar {
  padding: 0 4px;
}

.match-card-block {
  cursor: default !important;
}

.info-card {
  background: var(--portal-bg-card, #fff);
  border-radius: var(--portal-radius-md, 10px);
  padding: 14px 16px;
  box-shadow: var(--portal-shadow-sm, 0 1px 4px rgba(0,0,0,0.06));
}

.info-row {
  display: flex;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--portal-border, #ebeef5);
}

.info-row:last-child {
  border-bottom: none;
}

.info-label {
  width: 60px;
  font-size: 13px;
  color: var(--portal-text-secondary, #909399);
  flex-shrink: 0;
}

.info-value {
  flex: 1;
  font-size: 14px;
  color: var(--portal-text-primary, #303133);
}

.media-area {
  background: var(--portal-bg-card, #fff);
  border-radius: var(--portal-radius-md, 10px);
  padding: 30px 16px;
  box-shadow: var(--portal-shadow-sm, 0 1px 4px rgba(0,0,0,0.06));
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
