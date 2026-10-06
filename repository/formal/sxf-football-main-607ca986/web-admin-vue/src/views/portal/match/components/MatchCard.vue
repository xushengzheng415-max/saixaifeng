<template>
  <div class="match-card" :class="[`status-${status}`, { clickable }]" @click="handleClick">
    <!-- 赛事名 + 状态 -->
    <div class="match-header">
      <div class="match-tournament portal-text-ellipsis">
        <el-icon v-if="showTrophyIcon" class="trophy-icon"><Trophy /></el-icon>
        <span>{{ tournamentName || '友谊赛' }}</span>
        <span v-if="round" class="match-round">· {{ round }}</span>
      </div>
      <StatusBadge :status="status" />
    </div>

    <!-- 主队 vs 客队 + 比分/时间 -->
    <div class="match-body">
      <!-- 主队 -->
      <div class="team-side home-side">
        <TeamLogo :src="homeLogo" :name="homeName" :size="logoSize" />
        <div class="team-name-text portal-text-ellipsis">{{ homeName || '主队' }}</div>
      </div>

      <!-- 中间比分/时间 -->
      <div class="match-center">
        <template v-if="status === 'ongoing' || status === 'finished'">
          <div class="match-score">
            <span class="score-num">{{ homeScore }}</span>
            <span class="score-sep">:</span>
            <span class="score-num">{{ awayScore }}</span>
          </div>
          <div v-if="status === 'ongoing'" class="match-minute">{{ matchMinute }}</div>
          <div v-else class="match-status-text">已结束</div>
        </template>
        <template v-else>
          <div class="match-vs">VS</div>
          <div class="match-time">{{ matchTime }}</div>
        </template>
      </div>

      <!-- 客队 -->
      <div class="team-side away-side">
        <TeamLogo :src="awayLogo" :name="awayName" :size="logoSize" />
        <div class="team-name-text portal-text-ellipsis">{{ awayName || '客队' }}</div>
      </div>
    </div>

    <!-- 底部：直播/回放按钮 + 场馆 -->
    <div v-if="showFooter" class="match-footer">
      <div class="match-venue portal-text-ellipsis">
        <el-icon><Location /></el-icon>
        <span>{{ venue || '场地待定' }}</span>
      </div>
      <div class="match-actions">
        <button
          v-if="status === 'ongoing' && liveUrl"
          class="action-btn live-btn"
          @click.stop="handleAction('live')"
        >
          <span class="portal-live-pulse" />
          看直播
        </button>
        <button
          v-if="status === 'finished' && replayUrl"
          class="action-btn replay-btn"
          @click.stop="handleAction('replay')"
        >
          <el-icon><VideoPlay /></el-icon>
          看回放
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Trophy, Location, VideoPlay } from '@element-plus/icons-vue'
import StatusBadge from '../../components/StatusBadge.vue'
import TeamLogo from '../../components/TeamLogo.vue'

/**
 * 比赛卡片组件（双端共用）
 * 展示：赛事名 + 主队 vs 客队 + 比分/时间 + 状态 + 直播/回放按钮
 */
const props = defineProps({
  // 赛事信息
  tournamentName: { type: String, default: '' },
  round: { type: String, default: '' },
  // 状态：upcoming / ongoing / finished
  status: { type: String, default: 'upcoming' },
  // 主队
  homeName: { type: String, default: '' },
  homeLogo: { type: String, default: '' },
  homeScore: { type: [Number, String], default: 0 },
  // 客队
  awayName: { type: String, default: '' },
  awayLogo: { type: String, default: '' },
  awayScore: { type: [Number, String], default: 0 },
  // 时间/场地
  matchTime: { type: String, default: '' },     // 如 "今天 19:30"
  matchMinute: { type: String, default: '进行中' }, // 如 "67'"
  venue: { type: String, default: '' },
  // 媒体
  liveUrl: { type: String, default: '' },
  replayUrl: { type: String, default: '' },
  // UI
  logoSize: { type: Number, default: 44 },
  showTrophyIcon: { type: Boolean, default: true },
  showFooter: { type: Boolean, default: true },
  clickable: { type: Boolean, default: true }
})

const emit = defineEmits(['click', 'action'])

function handleClick() {
  if (props.clickable) emit('click')
}

function handleAction(type) {
  emit('action', type)
}
</script>

<style scoped>
.match-card {
  background: var(--portal-bg-card, #fff);
  border-radius: var(--portal-radius-md, 10px);
  box-shadow: var(--portal-shadow-sm, 0 1px 4px rgba(0,0,0,0.06));
  padding: 12px;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.match-card.clickable {
  cursor: pointer;
}

.match-card.clickable:hover {
  box-shadow: var(--portal-shadow-md, 0 2px 12px rgba(0,0,0,0.08));
  border-color: var(--portal-primary-bg-strong, #C8E6C9);
}

/* 进行中卡片左侧高亮条 */
.match-card.status-ongoing {
  border-left: 3px solid var(--portal-danger, #f56c6c);
}

.match-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.match-tournament {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--portal-text-secondary, #909399);
  flex: 1;
  min-width: 0;
}

.trophy-icon {
  color: var(--portal-gold, #FFC107);
  flex-shrink: 0;
}

.match-round {
  color: var(--portal-text-secondary, #909399);
}

.match-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.team-side {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.team-name-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--portal-text-primary, #303133);
  text-align: center;
  max-width: 100%;
}

.match-center {
  flex-shrink: 0;
  text-align: center;
  min-width: 80px;
  padding: 0 4px;
}

.match-score {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 20px;
  font-weight: 700;
  color: var(--portal-text-primary, #303133);
  font-variant-numeric: tabular-nums;
}

.score-sep {
  color: var(--portal-text-secondary, #909399);
  font-weight: 400;
}

.match-minute {
  font-size: 11px;
  color: var(--portal-danger, #f56c6c);
  margin-top: 2px;
  font-weight: 500;
}

.match-status-text {
  font-size: 11px;
  color: var(--portal-text-secondary, #909399);
  margin-top: 2px;
}

.match-vs {
  font-size: 16px;
  font-weight: 700;
  color: var(--portal-text-secondary, #909399);
}

.match-time {
  font-size: 12px;
  color: var(--portal-text-regular, #606266);
  margin-top: 2px;
}

.match-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--portal-border, #ebeef5);
}

.match-venue {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--portal-text-secondary, #909399);
  flex: 1;
  min-width: 0;
  max-width: 60%;
}

.match-actions {
  display: flex;
  gap: 6px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: none;
  border-radius: var(--portal-radius-pill, 999px);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  line-height: 1.2;
}

.live-btn {
  background: var(--portal-danger, #f56c6c);
  color: #fff;
}

.live-btn:hover {
  background: #e64a4a;
}

.replay-btn {
  background: var(--portal-primary-bg, #E8F5E9);
  color: var(--portal-primary-light, #2E7D32);
}

.replay-btn:hover {
  background: var(--portal-primary-bg-strong, #C8E6C9);
}

.action-btn .portal-live-pulse {
  width: 6px;
  height: 6px;
}

.action-btn .portal-live-pulse::after {
  width: 6px;
  height: 6px;
}

/* 桌面端放大 */
@media (min-width: 768px) {
  .match-card {
    padding: 16px;
  }
  .match-center {
    min-width: 100px;
  }
  .match-score {
    font-size: 24px;
  }
  .team-name-text {
    font-size: 14px;
  }
}
</style>
