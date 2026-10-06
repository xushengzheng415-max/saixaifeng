<template>
  <div class="top-nav-bar">
    <div class="nav-inner portal-container">
      <!-- Logo -->
      <div class="nav-logo" @click="goHome">
        <img :src="brandLogoUrl" alt="赛小蜂足球" class="logo-img" />
        <span class="logo-text">赛小蜂足球</span>
      </div>

      <!-- 主导航菜单 -->
      <nav class="nav-menu">
        <router-link
          v-for="item in menuItems"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          :class="{ active: isActive(item) }"
        >
          <el-icon v-if="item.icon"><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
          <div class="nav-item-indicator"></div>
        </router-link>
      </nav>

      <!-- 搜索框 -->
      <div class="nav-search">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索赛事/球队/球员"
          :prefix-icon="Search"
          clearable
          size="default"
          @keyup.enter="handleSearch"
        />
      </div>

      <!-- 登录/用户区 -->
      <div class="nav-user">
        <template v-if="isLoggedIn">
          <UserAvatar :src="userInfo.avatarUrl" :name="userInfo.userName" :size="32" clickable @click="goProfile" />
        </template>
        <template v-else>
          <el-button class="login-btn" round @click="handleLogin">
            <el-icon><User /></el-icon>
            登录
          </el-button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Search, User, HomeFilled, Trophy, ChatDotRound, UserFilled, TrendCharts } from '@element-plus/icons-vue'
import UserAvatar from '../components/UserAvatar.vue'

const brandLogoUrl = `${import.meta.env.BASE_URL}LOGO2.png`

/**
 * PC 端顶部导航栏
 * 设计要求：
 * - 高度 64px，绿色渐变背景 + 底部2px金色装饰线
 * - Logo白色 + 品牌名"赛小蜂足球"
 * - 导航菜单白色，hover/active效果
 * - 搜索框胶囊形，半透明
 * - 登录按钮白底绿字
 */
const router = useRouter()
const route = useRoute()

const searchKeyword = ref('')
const isLoggedIn = ref(false)
const userInfo = ref({})

onMounted(() => {
  isLoggedIn.value = localStorage.getItem('isLoggedIn') === 'true'
  try {
    const saved = localStorage.getItem('userInfo')
    if (saved) userInfo.value = JSON.parse(saved)
  } catch (e) {
    // ignore
  }
})

const menuItems = [
  { path: '/portal/home', label: '首页', icon: HomeFilled },
  { path: '/portal/tournaments', label: '赛事', icon: Trophy },
  { path: '/portal/chat', label: '球队', icon: UserFilled },
  { path: '/portal/profile', label: '我的', icon: UserFilled },
  { path: '/portal/tournament/all/rankings', label: '榜单', icon: TrendCharts }
]

function isActive(item) {
  if (item.path === '/portal/home') return route.path === '/portal/home' || route.path === '/portal'
  return route.path.startsWith(item.path)
}

function goHome() {
  router.push('/portal/home')
}

function goProfile() {
  router.push('/portal/profile')
}

function handleSearch() {
  if (!searchKeyword.value.trim()) return
  router.push({ path: '/portal/tournaments', query: { keyword: searchKeyword.value.trim() } })
}

function handleLogin() {
  router.push('/portal/profile')
}
</script>

<style scoped>
.top-nav-bar {
  height: var(--portal-navbar-height-pc, 64px);
  background: var(--portal-gradient-hero);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  position: sticky;
  top: 0;
  z-index: 1000;
  border-bottom: 2px solid var(--portal-gold);
}

.nav-inner {
  height: 100%;
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 0 24px;
}

/* Logo 区域 */
.nav-logo {
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
}

.logo-img {
  width: 36px;
  height: 36px;
  object-fit: contain;
}

.logo-text {
  font-size: 18px;
  font-weight: 700;
  color: #FFFFFF;
  letter-spacing: 1px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

/* 导航菜单 */
.nav-menu {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
}

.nav-item {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 8px 18px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 15px;
  text-decoration: none;
  border-radius: var(--portal-radius-sm, 6px);
  transition: all 0.2s ease;
  white-space: nowrap;
  overflow: hidden;
}

.nav-item:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.12);
}

.nav-item:hover .nav-item-indicator {
  opacity: 1;
  transform: scaleX(1);
}

.nav-item.active {
  color: #fff;
  font-weight: 600;
}

.nav-item.active .nav-item-indicator {
  opacity: 1;
  transform: scaleX(1);
  background: var(--portal-gold);
}

.nav-item-indicator {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%) scaleX(0);
  width: 20px;
  height: 2px;
  background: var(--portal-gold);
  border-radius: 1px;
  opacity: 0;
  transition: all 0.25s ease;
}

.nav-item .el-icon {
  font-size: 16px;
}

/* 搜索框 */
.nav-search {
  width: 260px;
  flex-shrink: 0;
}

.nav-search :deep(.el-input__wrapper) {
  background: rgba(255, 255, 255, 0.15);
  box-shadow: none;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 22px;
  transition: all 0.25s ease;
}

.nav-search :deep(.el-input__wrapper:hover) {
  background: rgba(255, 255, 255, 0.2);
}

.nav-search :deep(.el-input__wrapper.is-focus) {
  background: rgba(255, 255, 255, 0.25);
  border-color: rgba(255, 255, 255, 0.4);
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.2);
}

.nav-search :deep(.el-input__inner) {
  color: #fff;
}

.nav-search :deep(.el-input__inner::placeholder) {
  color: rgba(255, 255, 255, 0.6);
}

.nav-search :deep(.el-input__prefix) {
  color: rgba(255, 255, 255, 0.7);
}

/* 登录按钮 */
.nav-user {
  flex-shrink: 0;
}

.login-btn {
  background: #FFFFFF;
  color: var(--portal-primary);
  border: none;
  font-weight: 500;
  transition: all 0.2s ease;
}

.login-btn:hover {
  background: var(--portal-primary);
  color: #FFFFFF;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
</style>
