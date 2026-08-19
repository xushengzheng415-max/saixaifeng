<template>
  <div class="portal-layout portal-root">
    <!-- 顶部导航栏（双端共用，PC 端功能更全） -->
    <header v-if="isDesktop" class="portal-header-pc">
      <TopNavBar />
    </header>
    <header v-else class="portal-header-mobile">
      <div class="mobile-header-inner">
        <img :src="brandLogoUrl" alt="赛小蜂足球" class="mobile-logo" @click="goHome" />
        <div class="mobile-search" @click="goSearch">
          <el-icon><Search /></el-icon>
          <span class="search-placeholder">搜索赛事/球队</span>
        </div>
        <div v-if="!isLoggedIn" class="mobile-login" @click="goProfile">登录</div>
        <UserAvatar v-else :src="userInfo.avatarUrl" :name="userInfo.userName" :size="28" clickable @click="goProfile" />
      </div>
    </header>

    <!-- 主内容区 -->
    <main class="portal-main">
      <router-view />
    </main>

    <!-- 移动端底部 Tab 栏 -->
    <BottomTabBar v-if="!isDesktop" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import { useResponsive } from '../../../composables/useResponsive'
import TopNavBar from './TopNavBar.vue'
import BottomTabBar from './BottomTabBar.vue'
import UserAvatar from '../components/UserAvatar.vue'

const brandLogoUrl = `${import.meta.env.BASE_URL}LOGO2.png`

/**
 * 门户独立布局
 * - 移动端：顶部精简导航栏 + 底部 4 Tab
 * - PC 端：顶部完整导航栏（Logo+菜单+搜索+登录），无底部 Tab
 * 与现有 LayoutView 完全隔离
 */

const router = useRouter()
const { isDesktop } = useResponsive()

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

function goHome() {
  router.push('/portal/home')
}

function goSearch() {
  router.push('/portal/tournaments')
}

function goProfile() {
  router.push('/portal/profile')
}
</script>

<style scoped>
.portal-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* PC 顶部导航 */
.portal-header-pc {
  flex-shrink: 0;
}

/* 移动端顶部精简栏 */
.portal-header-mobile {
  height: var(--portal-navbar-height, 56px);
  background: linear-gradient(135deg, var(--portal-primary, #1B5E20), var(--portal-primary-light, #2E7D32));
  position: sticky;
  top: 0;
  z-index: 1000;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.mobile-header-inner {
  height: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 12px;
}

.mobile-logo {
  width: 88px;
  height: auto;
  max-height: 32px;
  object-fit: contain;
  cursor: pointer;
  flex-shrink: 0;
}

.mobile-search {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: var(--portal-radius-pill, 999px);
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  cursor: pointer;
}

.mobile-login {
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  flex-shrink: 0;
  padding: 4px 8px;
}

.portal-main {
  flex: 1;
  width: 100%;
}
</style>
