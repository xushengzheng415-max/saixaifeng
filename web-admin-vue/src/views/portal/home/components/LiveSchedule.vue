<template>
  <div class="live-schedule">
    <!-- 区块标题 -->
    <div class="section-header">
      <div class="title-left">
        <el-icon><Calendar /></el-icon>
        <span class="title-text">今日直播</span>
      </div>
      <router-link to="/portal/tournaments?view=calendar" class="title-right" @click="handleMore">
        查看日历
        <el-icon><ArrowRight /></el-icon>
      </router-link>
    </div>

    <!-- 时间轴 -->
    <div class="timeline">
      <div
        v-for="(item, index) in schedule"
        :key="index"
        class="timeline-item"
        :class="{ 'is-live': item.isLive }"
      >
        <!-- 时间线左侧 -->
        <div class="timeline-time">
          <span class="time-text">{{ item.time }}</span>
          <div v-if="item.isLive" class="live-indicator">
            <span class="live-dot"></span>
          </div>
        </div>

        <!-- 时间线中间 -->
        <div class="timeline-line">
          <div class="timeline-dot" :class="{ 'is-live': item.isLive }"></div>
          <div class="timeline-connector"></div>
        </div>

        <!-- 时间线右侧 -->
        <div class="timeline-content">
          <div class="match-teams">{{ item.homeTeam }} vs {{ item.awayTeam }}</div>
          <div class="match-tournament">{{ item.tournament }}</div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="schedule.length === 0" class="empty-state">
      <el-icon :size="40"><VideoCamera /></el-icon>
      <p>今日暂无直播</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { Calendar, ArrowRight, VideoCamera } from '@element-plus/icons-vue'

/**
 * 今日直播组件
 * 设计要求：
 * - 标题："今日直播" + 日历图标
 * - 时间轴样式：垂直时间线
 * - 左侧时间 + 右侧比赛信息
 * - 正在直播：红点 + 红色文字
 * - 无直播：空状态
 */
const emit = defineEmits(['more'])

// Mock 数据
const schedule = ref([
  {
    time: '14:00',
    homeTeam: '郑州东方',
    awayTeam: '濮阳友谊',
    tournament: '青少年锦标赛',
    isLive: false
  },
  {
    time: '16:30',
    homeTeam: '海港联',
    awayTeam: '城市竞技',
    tournament: '业余联赛',
    isLive: true
  },
  {
    time: '19:30',
    homeTeam: '洛阳龙门',
    awayTeam: '开封蹴鞠',
    tournament: '地协赛',
    isLive: false
  }
])

function handleMore() {
  emit('more')
}
</script>

<style scoped>
.live-schedule {
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
  margin-bottom: 16px;
}

.title-left {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  font-weight: 600;
  color: var(--portal-text-primary, #303133);
}

.title-left .el-icon {
  font-size: 18px;
  color: var(--portal-primary, #1B5E20);
}

.title-text {
  font-size: 15px;
}

.title-right {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 12px;
  color: var(--portal-primary, #1B5E20);
  text-decoration: none;
}

.title-right:hover {
  opacity: 0.8;
}

/* 时间轴 */
.timeline {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.timeline-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 0;
  transition: all 0.2s ease;
}

.timeline-item:hover {
  background: var(--portal-bg-page, #F5F7FA);
  margin: 0 -8px;
  padding: 10px 8px;
  border-radius: 8px;
}

.timeline-item.is-live .timeline-time {
  color: var(--portal-danger, #F56C6C);
}

.timeline-item.is-live .match-teams {
  color: var(--portal-danger, #F56C6C);
  font-weight: 600;
}

/* 时间线左侧 */
.timeline-time {
  flex-shrink: 0;
  width: 48px;
  text-align: right;
  font-size: 14px;
  font-weight: 600;
  color: var(--portal-text-secondary, #909399);
  padding-top: 2px;
}

.time-text {
  display: block;
}

.live-indicator {
  margin-top: 4px;
}

.live-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--portal-danger, #F56C6C);
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

/* 时间线中间 */
.timeline-line {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 16px;
}

.timeline-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--portal-border, #EBEEF5);
  border: 2px solid var(--portal-bg-card, #FFFFFF);
  z-index: 1;
}

.timeline-dot.is-live {
  background: var(--portal-danger, #F56C6C);
  box-shadow: 0 0 0 3px rgba(245, 108, 108, 0.2);
}

.timeline-connector {
  width: 2px;
  flex: 1;
  background: var(--portal-border, #EBEEF5);
  margin-top: 2px;
}

/* 时间线右侧 */
.timeline-content {
  flex: 1;
  min-width: 0;
}

.match-teams {
  font-size: 13px;
  color: var(--portal-text-primary, #303133);
  font-weight: 500;
  margin-bottom: 2px;
}

.match-tournament {
  font-size: 11px;
  color: var(--portal-text-secondary, #909399);
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: var(--portal-text-secondary, #909399);
}

.empty-state .el-icon {
  margin-bottom: 8px;
  opacity: 0.5;
}

.empty-state p {
  font-size: 13px;
}
</style>
