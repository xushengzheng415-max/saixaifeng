<template>
  <div class="hot-matches">
    <!-- 区块标题 -->
    <div class="section-header">
      <div class="title-left">
        <span class="title-icon">📺</span>
        <span class="title-text">热点赛事</span>
      </div>
      <router-link to="/portal/tournaments" class="title-right">
        查看更多
        <el-icon><ArrowRight /></el-icon>
      </router-link>
    </div>

    <!-- Tab 切换 -->
    <div class="tab-bar">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="tab-item"
        :class="{ active: activeTab === tab.key }"
        @click="switchTab(tab.key)"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- 比赛列表 -->
    <div class="match-list">
      <div
        v-for="match in matches"
        :key="match.id"
        class="match-card"
        :class="{ 'is-live': match.status === 'ongoing' }"
        @click="goMatchDetail(match)"
      >
        <!-- 进行中标识 -->
        <div v-if="match.status === 'ongoing'" class="live-badge">
          <span class="live-dot"></span>
          直播中
        </div>

        <!-- 比赛信息 -->
        <div class="match-content">
          <!-- 主队 -->
          <div class="team-info team-home">
            <img :src="match.homeTeam.logo" :alt="match.homeTeam.name" class="team-logo" />
            <span class="team-name">{{ match.homeTeam.name }}</span>
          </div>

          <!-- 比分/时间 -->
          <div class="match-status">
            <template v-if="match.status === 'ongoing'">
              <div class="score">
                <span class="score-num">{{ match.homeScore }}</span>
                <span class="score-separator">-</span>
                <span class="score-num">{{ match.awayScore }}</span>
              </div>
              <div class="match-time">{{ match.currentTime }}</div>
            </template>
            <template v-else-if="match.status === 'upcoming'">
              <div class="match-time">{{ match.startTime }}</div>
              <div class="match-status-text">未开始</div>
            </template>
            <template v-else>
              <div class="score">
                <span class="score-num">{{ match.homeScore }}</span>
                <span class="score-separator">-</span>
                <span class="score-num">{{ match.awayScore }}</span>
              </div>
              <div class="match-status-text">已结束</div>
            </template>
          </div>

          <!-- 客队 -->
          <div class="team-info team-away">
            <img :src="match.awayTeam.logo" :alt="match.awayTeam.name" class="team-logo" />
            <span class="team-name">{{ match.awayTeam.name }}</span>
          </div>
        </div>

        <!-- 赛事信息 -->
        <div class="match-footer">
          <span class="tournament-name">{{ match.tournamentName }}</span>
          <span class="match-round">{{ match.round }}</span>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="matches.length === 0" class="empty-state">
      <el-icon :size="48"><Football /></el-icon>
      <p>暂无{{ activeTabLabel }}比赛</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, Football } from '@element-plus/icons-vue'

/**
 * 热点赛事组件
 * 设计要求：
 * - 区块标题：左"📺 热点赛事" + 右"查看更多 >"
 * - Tab切换：进行中/今日/即将开始（药丸标签）
 * - 比赛卡片：白色圆角 + 队徽 + 比分 + 状态
 * - 进行中：左侧红色边框 + 脉冲点
 * - hover: 阴影加深 + 微上移
 */
const emit = defineEmits(['tab-change'])

const router = useRouter()
const activeTab = ref('ongoing')

const tabs = [
  { key: 'ongoing', label: '进行中' },
  { key: 'today', label: '今日' },
  { key: 'upcoming', label: '即将开始' }
]

const activeTabLabel = computed(() => {
  const tab = tabs.find(t => t.key === activeTab.value)
  return tab ? tab.label : ''
})

// Mock 数据
const matches = ref([
  {
    id: 1,
    status: 'ongoing',
    homeTeam: { name: '郑州东方', logo: '/team-placeholder.png' },
    awayTeam: { name: '濮阳友谊', logo: '/team-placeholder.png' },
    homeScore: 2,
    awayScore: 1,
    currentTime: '第78\'',
    tournamentName: '2026青少年足球锦标赛',
    round: '小组赛第3轮'
  },
  {
    id: 2,
    status: 'upcoming',
    homeTeam: { name: '海港联', logo: '/team-placeholder.png' },
    awayTeam: { name: '城市竞技', logo: '/team-placeholder.png' },
    homeScore: null,
    awayScore: null,
    startTime: '19:30',
    tournamentName: '2026业余足球联赛',
    round: '1/8决赛'
  },
  {
    id: 3,
    status: 'ongoing',
    homeTeam: { name: '洛阳龙门', logo: '/team-placeholder.png' },
    awayTeam: { name: '开封蹴鞠', logo: '/team-placeholder.png' },
    homeScore: 0,
    awayScore: 0,
    currentTime: '第23\'',
    tournamentName: '2026地协挑战赛',
    round: '第5轮'
  }
])

function switchTab(tabKey) {
  activeTab.value = tabKey
  emit('tab-change', tabKey)
  // 预留：根据tab加载不同数据
}

function goMatchDetail(match) {
  router.push(`/portal/match/${match.id}`)
}
</script>

<style scoped>
.hot-matches {
  background: var(--portal-bg-card, #FFFFFF);
  border-radius: 12px;
  padding: 16px;
  box-shadow: var(--portal-card-shadow, 0 2px 12px rgba(0, 0, 0, 0.08));
}

/* 区块标题 */
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.title-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.title-icon {
  font-size: 18px;
}

.title-text {
  font-size: 16px;
  font-weight: 600;
  color: var(--portal-text-primary, #303133);
}

.title-right {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 13px;
  color: var(--portal-primary, #1B5E20);
  text-decoration: none;
  font-weight: 500;
}

.title-right:hover {
  opacity: 0.8;
}

/* Tab 切换 */
.tab-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.tab-item {
  padding: 6px 16px;
  border: none;
  border-radius: var(--portal-radius-pill, 999px);
  background: var(--portal-bg-page, #F5F7FA);
  color: var(--portal-text-regular, #606266);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-weight: 500;
}

.tab-item:hover {
  background: var(--portal-primary-bg, #E8F5E9);
  color: var(--portal-primary, #1B5E20);
}

.tab-item.active {
  background: var(--portal-gradient-hero);
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(27, 94, 32, 0.3);
}

/* 比赛列表 */
.match-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.match-card {
  position: relative;
  background: var(--portal-bg-card, #FFFFFF);
  border: 1px solid var(--portal-border, #EBEEF5);
  border-radius: 12px;
  padding: 14px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.match-card:hover {
  box-shadow: var(--portal-card-shadow-hover, 0 6px 24px rgba(27, 94, 32, 0.15));
  transform: translateY(-2px);
  border-color: var(--portal-primary-lighter, #43A047);
}

.match-card.is-live {
  border-left: 3px solid var(--portal-danger, #F56C6C);
}

/* 直播标识 */
.live-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: var(--portal-gradient-live);
  color: #FFFFFF;
  font-size: 11px;
  border-radius: var(--portal-radius-pill, 999px);
  font-weight: 500;
}

.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #FFFFFF;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

/* 比赛内容 */
.match-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.team-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.team-home {
  justify-content: flex-end;
  text-align: right;
}

.team-away {
  justify-content: flex-start;
  text-align: left;
}

.team-logo {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--portal-bg-page, #F5F7FA);
  padding: 2px;
}

.team-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--portal-text-primary, #303133);
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 比分/时间 */
.match-status {
  flex-shrink: 0;
  text-align: center;
  min-width: 80px;
}

.score {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 20px;
  font-weight: 700;
  color: var(--portal-text-primary, #303133);
}

.score-num {
  min-width: 24px;
}

.score-separator {
  color: var(--portal-text-secondary, #909399);
}

.match-time {
  font-size: 12px;
  color: var(--portal-text-secondary, #909399);
  margin-top: 2px;
}

.match-status-text {
  font-size: 12px;
  color: var(--portal-text-secondary, #909399);
  margin-top: 2px;
}

/* 赛事信息 */
.match-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--portal-border, #EBEEF5);
  font-size: 12px;
  color: var(--portal-text-secondary, #909399);
}

.tournament-name {
  font-weight: 500;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  color: var(--portal-text-secondary, #909399);
}

.empty-state .el-icon {
  margin-bottom: 8px;
  opacity: 0.5;
}

.empty-state p {
  font-size: 14px;
}
</style>
