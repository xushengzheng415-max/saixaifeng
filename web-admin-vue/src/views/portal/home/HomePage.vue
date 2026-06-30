<template>
  <div class="home-page portal-container">
    <ResponsiveContainer :has-left="true" :has-right="true">
      <!-- 左栏：赛事分类树（仅 PC） -->
      <template #left>
        <div class="left-panel">
          <div class="panel-title">
            <span class="title-bar"></span>
            赛事分类
          </div>
          <ul class="category-tree">
            <li
              v-for="cat in categories"
              :key="cat.key"
              class="cat-item"
              :class="{ active: activeCategory === cat.key }"
              @click="selectCategory(cat.key)"
            >
              <el-icon><component :is="cat.icon" /></el-icon>
              <span>{{ cat.label }}</span>
              <span class="cat-count">{{ cat.count }}</span>
            </li>
          </ul>
        </div>
      </template>

      <!-- 中栏：搜索栏(移动端) + 轮播图 + 快速入口 + banner + 热点赛事 -->
      <div class="main-content">
        <!-- 轮播图 -->
        <BannerCarousel :banners="banners" @click="handleBannerClick" />

        <!-- 快速入口宫格 -->
        <QuickEntryGrid class="section" @select="handleEntrySelect" />

        <!-- 推广 banner -->
        <div class="promo-banner section">
          <div class="promo-content">
            <div class="promo-title">竞猜赢蜂蜜币</div>
            <div class="promo-desc">参与赛事竞猜，赢取丰厚奖励</div>
          </div>
          <el-button type="warning" round @click="goGuess">立即参与</el-button>
        </div>

        <!-- 热点赛事 -->
        <HotMatches class="section" @tab-change="handleTabChange" />
      </div>

      <!-- 右栏：今日直播 + 迷你榜（平板+PC） -->
      <template #right>
        <div class="right-panel">
          <LiveSchedule class="section" @more="goCalendar" />
          <MiniRanking class="section" @more="goRanking" />
        </div>
      </template>
    </ResponsiveContainer>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  Trophy, Medal, Flag, Sunny, Basketball, Collection, MoreFilled, Star
} from '@element-plus/icons-vue'
import ResponsiveContainer from '../components/ResponsiveContainer.vue'
import BannerCarousel from './components/BannerCarousel.vue'
import QuickEntryGrid from './components/QuickEntryGrid.vue'
import HotMatches from './components/HotMatches.vue'
import LiveSchedule from './components/LiveSchedule.vue'
import MiniRanking from './components/MiniRanking.vue'

/**
 * 首页主组件
 * - 移动端：单列信息流（搜索栏→轮播图→快速入口→banner→热点赛事）
 * - PC 端：三栏（左分类树 + 中轮播/热点 + 右直播/迷你榜）
 */
const router = useRouter()

// Mock 轮播图
const banners = ref([
  { id: 1, title: '2026 青少年足球锦标赛', subtitle: '30 支球队逐梦绿茵', image: '', link: '/portal/tournaments?category=youth' },
  { id: 2, title: '业余足球联赛报名开启', subtitle: '各类业余球队均可参赛', image: '', link: '/portal/tournaments?category=amateur' },
  { id: 3, title: '地协赛火热进行中', subtitle: '各地足协主办精品赛事', image: '', link: '/portal/tournaments?category=local' },
  { id: 4, title: '城市联赛火热开战', subtitle: '各城市代表队巅峰对决', image: '', link: '/portal/tournaments?category=city' },
  { id: 5, title: '职业联赛精彩回顾', subtitle: '顶级赛事数据一网打尽', image: '', link: '/portal/tournaments?category=professional' }
])

// 赛事分类（左栏）
const categories = ref([
  { key: 'all', label: '全部赛事', icon: Trophy, count: 100 },
  { key: 'youth', label: '青少年赛事', icon: Sunny, count: 30 },
  { key: 'amateur', label: '业余赛事', icon: Basketball, count: 20 },
  { key: 'local', label: '地协赛', icon: Flag, count: 16 },
  { key: 'city', label: '城市联赛', icon: Medal, count: 18 },
  { key: 'professional', label: '职业联赛', icon: Trophy, count: 16 }
])

const activeCategory = ref('all')

function selectCategory(key) {
  activeCategory.value = key
  router.push({ path: '/portal/tournaments', query: { category: key } })
}

function handleBannerClick(banner) {
  // 点击逻辑由 BannerCarousel 内部 router.push 处理
}

function handleEntrySelect(item) {
  // 点击逻辑由 QuickEntryGrid 内部 router.push 处理
}

function handleTabChange(tab) {
  // 预留：根据 Tab 切换加载不同数据
}

function goGuess() {
  router.push('/portal/tournament/all/guess')
}

function goCalendar() {
  router.push('/portal/tournaments?view=calendar')
}

function goRanking() {
  router.push('/portal/tournament/all/rankings')
}

onMounted(() => {
  // 预留：加载首页数据
  // callFunction('getHomeData')
})
</script>

<style scoped>
.home-page {
  padding: 12px 0 16px;
}

@media (min-width: 1024px) {
  .home-page {
    padding: 20px 0 32px;
  }
}

.section {
  margin-top: 12px;
}

@media (min-width: 768px) {
  .section {
    margin-top: 16px;
  }
}

/* 左栏分类树 */
.left-panel {
  background: var(--portal-bg-card, #fff);
  border-radius: var(--portal-radius-md, 10px);
  padding: 14px;
  box-shadow: var(--portal-shadow-sm, 0 1px 4px rgba(0,0,0,0.06));
}

.panel-title {
  display: flex;
  align-items: center;
  font-size: 15px;
  font-weight: 600;
  color: var(--portal-text-primary, #303133);
  margin-bottom: 10px;
}

.title-bar {
  display: inline-block;
  width: 4px;
  height: 15px;
  background: var(--portal-primary-lighter, #43A047);
  border-radius: 2px;
  margin-right: 8px;
}

.category-tree {
  list-style: none;
  padding: 0;
  margin: 0;
}

.cat-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border-radius: var(--portal-radius-sm, 6px);
  font-size: 13px;
  color: var(--portal-text-regular, #606266);
  cursor: pointer;
  transition: all 0.2s;
}

.cat-item:hover {
  background: var(--portal-primary-bg, #E8F5E9);
  color: var(--portal-primary-light, #2E7D32);
}

.cat-item.active {
  background: var(--portal-primary-bg-strong, #C8E6C9);
  color: var(--portal-primary, #1B5E20);
  font-weight: 600;
}

.cat-item .el-icon {
  font-size: 16px;
}

.cat-count {
  margin-left: auto;
  font-size: 11px;
  color: var(--portal-text-secondary, #909399);
  background: var(--portal-bg-page, #f5f7fa);
  padding: 1px 6px;
  border-radius: var(--portal-radius-pill, 999px);
}

.cat-item.active .cat-count {
  background: rgba(27, 94, 32, 0.15);
  color: var(--portal-primary, #1B5E20);
}

/* 推广 banner */
.promo-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: linear-gradient(135deg, #FFC107, #FF9800);
  border-radius: var(--portal-radius-md, 10px);
  box-shadow: var(--portal-shadow-sm, 0 1px 4px rgba(0,0,0,0.06));
}

.promo-title {
  font-size: 16px;
  font-weight: 700;
  color: #5D4037;
}

.promo-desc {
  font-size: 12px;
  color: rgba(93, 64, 55, 0.85);
  margin-top: 2px;
}

/* 右栏 */
.right-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
