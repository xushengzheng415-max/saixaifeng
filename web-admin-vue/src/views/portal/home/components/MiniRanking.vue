<template>
  <div class="mini-ranking">
    <!-- 区块标题 -->
    <div class="section-header">
      <div class="title-left">
        <el-icon><Trophy /></el-icon>
        <span class="title-text">人气榜</span>
      </div>
      <div class="title-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="tab-btn"
          :class="{ active: activeTab === tab.key }"
          @click="switchTab(tab.key)"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <!-- 排行榜列表 -->
    <div class="ranking-list">
      <div
        v-for="(item, index) in ranking"
        :key="item.id"
        class="ranking-item"
        :class="{ 'top-three': index < 3 }"
        :style="index < 3 ? { '--rank-color': rankColors[index] } : {}"
      >
        <!-- 排名 -->
        <div class="rank-number" :class="{ 'top-rank': index < 3 }">
          {{ index + 1 }}
        </div>

        <!-- 头像/图标 -->
        <div class="rank-avatar">
          <img v-if="item.avatar" :src="item.avatar" :alt="item.name" class="avatar-img" />
          <div v-else class="avatar-placeholder">
            {{ item.name.charAt(0) }}
          </div>
        </div>

        <!-- 名称 -->
        <div class="rank-info">
          <div class="rank-name">{{ item.name }}</div>
          <div class="rank-extra">{{ item.extra }}</div>
        </div>

        <!-- 热度 -->
        <div class="rank-heat">
          <span class="heat-icon">🔥</span>
          <span class="heat-value">{{ item.heat }}</span>
        </div>
      </div>
    </div>

    <!-- 查看更多 -->
    <router-link to="/portal/tournament/all/rankings" class="view-all">
      完整榜单
      <el-icon><ArrowRight /></el-icon>
    </router-link>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { Trophy, ArrowRight } from '@element-plus/icons-vue'

/**
 * 迷你人气榜组件
 * 设计要求：
 * - 标题："人气榜" + 切换(球队/球员)
 * - 列表：排名数字 + 头像 + 名字 + 热度值
 * - 前3名特殊样式（金/银/铜）
 * - 底部"完整榜单"链接
 */
const emit = defineEmits(['more'])

const activeTab = ref('team')
const tabs = [
  { key: 'team', label: '球队' },
  { key: 'player', label: '球员' }
]

const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32']

// Mock 数据
const ranking = ref([
  {
    id: 1,
    name: '郑州东方',
    avatar: '/team-placeholder.png',
    extra: '青少年赛事',
    heat: 12856,
    type: 'team'
  },
  {
    id: 2,
    name: '海港联',
    avatar: '/team-placeholder.png',
    extra: '业余赛事',
    heat: 10234,
    type: 'team'
  },
  {
    id: 3,
    name: '洛阳龙门',
    avatar: '/team-placeholder.png',
    extra: '地协赛',
    heat: 8934,
    type: 'team'
  },
  {
    id: 4,
    name: '濮阳友谊',
    avatar: '/team-placeholder.png',
    extra: '青少年赛事',
    heat: 7654,
    type: 'team'
  },
  {
    id: 5,
    name: '开封蹴鞠',
    avatar: '/team-placeholder.png',
    extra: '地协赛',
    heat: 6234,
    type: 'team'
  }
])

function switchTab(tabKey) {
  activeTab.value = tabKey
  // 预留：根据tab加载不同数据
}
</script>

<style scoped>
.mini-ranking {
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
  color: var(--portal-gold, #FFC107);
}

.title-text {
  font-size: 15px;
}

.title-tabs {
  display: flex;
  gap: 4px;
}

.tab-btn {
  padding: 4px 10px;
  border: none;
  border-radius: var(--portal-radius-sm, 6px);
  background: transparent;
  color: var(--portal-text-secondary, #909399);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-weight: 500;
}

.tab-btn:hover {
  background: var(--portal-bg-page, #F5F7FA);
}

.tab-btn.active {
  background: var(--portal-primary-bg, #E8F5E9);
  color: var(--portal-primary, #1B5E20);
}

/* 排行榜列表 */
.ranking-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ranking-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.ranking-item:hover {
  background: var(--portal-bg-page, #F5F7FA);
}

.ranking-item.top-three {
  background: linear-gradient(135deg, var(--rank-color, #FFD700) 0%, transparent 100%);
  background-size: 100% 100%;
  background-repeat: no-repeat;
  opacity: 0.95;
}

/* 排名数字 */
.rank-number {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--portal-text-secondary, #909399);
  border-radius: 50%;
  background: var(--portal-bg-page, #F5F7FA);
}

.rank-number.top-rank {
  color: #FFFFFF;
  background: var(--rank-color, #FFD700);
  font-weight: 700;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

/* 头像 */
.rank-avatar {
  flex-shrink: 0;
}

.avatar-img {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--portal-bg-page, #F5F7FA);
}

.avatar-placeholder {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--portal-primary-bg, #E8F5E9);
  color: var(--portal-primary, #1B5E20);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
}

/* 信息 */
.rank-info {
  flex: 1;
  min-width: 0;
}

.rank-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--portal-text-primary, #303133);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rank-extra {
  font-size: 11px;
  color: var(--portal-text-secondary, #909399);
  margin-top: 1px;
}

/* 热度 */
.rank-heat {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 2px;
}

.heat-icon {
  font-size: 12px;
}

.heat-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--portal-warning, #E6A23C);
}

/* 查看更多 */
.view-all {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-top: 12px;
  padding: 8px;
  font-size: 13px;
  color: var(--portal-primary, #1B5E20);
  text-decoration: none;
  border-top: 1px solid var(--portal-border, #EBEEF5);
  transition: all 0.2s ease;
  border-radius: 0 0 8px 8px;
}

.view-all:hover {
  background: var(--portal-primary-bg, #E8F5E9);
}
</style>
