<template>
  <nav class="bottom-tab-bar portal-tabbar">
    <router-link
      v-for="(tab, index) in tabs"
      :key="tab.path"
      :to="tab.path"
      class="tab-item"
      :class="{ active: isActive(tab) }"
    >
      <span class="tab-icon">
        <el-icon v-if="isActive(tab) && tab.activeIcon"><component :is="tab.activeIcon" /></el-icon>
        <el-icon v-else><component :is="tab.icon" /></el-icon>
      </span>
      <span class="tab-label">{{ tab.label }}</span>
      <div class="tab-indicator"></div>
    </router-link>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import {
  HomeFilled, House,
  Trophy, TrophyBase,
  User, UserFilled
} from '@element-plus/icons-vue'

/**
 * 移动端底部导航 Tab 栏
 * 设计要求：
 * - 高度 56px + safe-area
 * - 白色背景，上方阴影
 * - Tab项：图标24px + 文字11px
 * - Active：绿色 + 字重600 + 底部指示条
 * - Active图标放大1.1x过渡动画
 */
const route = useRoute()

const tabs = [
  {
    path: '/portal/home',
    label: '首页',
    icon: HomeFilled,
    activeIcon: House
  },
  {
    path: '/portal/tournaments',
    label: '赛事',
    icon: Trophy,
    activeIcon: TrophyBase
  },
  {
    path: '/portal/chat',
    label: '球队',
    icon: UserFilled,
    activeIcon: UserFilled
  },
  {
    path: '/portal/profile',
    label: '我的',
    icon: User,
    activeIcon: UserFilled
  }
]

function isActive(tab) {
  if (tab.path === '/portal/home') {
    return route.path === '/portal/home' || route.path === '/portal'
  }
  if (tab.path === '/portal/tournaments') {
    return route.path.startsWith('/portal/tournament') || route.path.startsWith('/portal/match')
  }
  return route.path.startsWith(tab.path)
}
</script>

<style scoped>
.bottom-tab-bar {
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 0 8px;
}

.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  text-decoration: none;
  color: var(--portal-text-secondary, #909399);
  font-size: 11px;
  height: var(--portal-tabbar-height, 56px);
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

.tab-item.active {
  color: var(--portal-primary, #1B5E20);
  font-weight: 600;
}

.tab-item.active .tab-icon {
  transform: scale(1.1);
}

.tab-icon {
  font-size: 24px;
  line-height: 1;
  transition: transform 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tab-icon .el-icon {
  font-size: 24px;
}

.tab-label {
  font-size: 11px;
  line-height: 1.2;
}

/* 底部指示条 */
.tab-indicator {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%) scaleX(0);
  width: 20px;
  height: 3px;
  background: var(--portal-primary, #1B5E20);
  border-radius: 2px 2px 0 0;
  transition: transform 0.2s ease;
}

.tab-item.active .tab-indicator {
  transform: translateX(-50%) scaleX(1);
}
</style>
