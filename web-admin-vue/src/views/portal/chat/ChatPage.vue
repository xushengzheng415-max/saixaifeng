<template>
  <div class="team-page portal-container">
    <!-- Hero 区域 -->
    <div class="team-hero">
      <div class="hero-content">
        <h1 class="hero-title">球队数据库</h1>
        <p class="hero-subtitle">探索所有参赛球队，了解球队信息、球员阵容和赛事记录</p>
      </div>
    </div>

    <!-- 统计概览 -->
    <div class="stats-overview">
      <div class="stat-card">
        <div class="stat-icon">
          <el-icon><UserFilled /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.totalTeams }}</div>
          <div class="stat-label">球队总数</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon players">
          <el-icon><User /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.totalPlayers }}</div>
          <div class="stat-label">注册球员</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon tournaments">
          <el-icon><Trophy /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.totalTournaments }}</div>
          <div class="stat-label">参与赛事</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon categories">
          <el-icon><Trophy /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.categories }}</div>
          <div class="stat-label">赛事类别</div>
        </div>
      </div>
    </div>

    <!-- 搜索和筛选区域 -->
    <div class="filter-section">
      <div class="search-box">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索球队名称..."
          :prefix-icon="Search"
          clearable
          size="large"
          @keyup.enter="handleSearch"
          @clear="handleSearch"
        />
      </div>

      <div class="filter-controls">
        <div class="category-filters">
          <el-tag
            v-for="cat in categories"
            :key="cat.value"
            :effect="activeCategory === cat.value ? 'dark' : 'plain'"
            :type="activeCategory === cat.value ? 'success' : 'info'"
            class="category-tag"
            @click="switchCategory(cat.value)"
          >
            {{ cat.label }}
          </el-tag>
        </div>

        <div class="sort-controls">
          <span class="sort-label">排序：</span>
          <el-radio-group v-model="sortBy" size="small" @change="handleSearch">
            <el-radio-button value="name">名称</el-radio-button>
            <el-radio-button value="playerCount">球员数</el-radio-button>
            <el-radio-button value="tournamentCount">参赛数</el-radio-button>
          </el-radio-group>
        </div>
      </div>
    </div>

    <!-- 球队卡片列表 -->
    <div class="team-list-section">
      <div v-if="loading" class="loading-container">
        <el-skeleton :rows="3" animated />
      </div>

      <div v-else-if="teamList.length > 0" class="team-grid">
        <div
          v-for="team in teamList"
          :key="team._id"
          class="team-card"
          @click="goToTeamDetail(team)"
        >
          <div class="team-card-header">
            <div class="team-logo-wrapper">
              <img
                v-if="team.logo"
                :src="team.logo"
                :alt="team.name"
                class="team-logo"
              />
              <div v-else class="team-logo-placeholder">
                <el-icon><UserFilled /></el-icon>
              </div>
            </div>
            <div class="team-badge" :class="team.category">
              {{ getCategoryLabel(team.category) }}
            </div>
          </div>

          <div class="team-card-body">
            <h3 class="team-name">{{ team.name }}</h3>
            <p v-if="team.shortName" class="team-short-name">{{ team.shortName }}</p>

            <div class="team-info-list">
              <div v-if="team.city" class="team-info-item">
                <el-icon><Location /></el-icon>
                <span>{{ team.city }}</span>
              </div>
              <div v-if="team.coachName" class="team-info-item">
                <el-icon><User /></el-icon>
                <span>教练：{{ team.coachName }}</span>
              </div>
              <div class="team-info-item">
                <el-icon><UserFilled /></el-icon>
                <span>{{ team.playerCount || 0 }} 名球员</span>
              </div>
              <div class="team-info-item">
                <el-icon><Trophy /></el-icon>
                <span>{{ team.tournamentCount || 0 }} 项赛事</span>
              </div>
            </div>

            <p v-if="team.description" class="team-description">
              {{ team.description }}
            </p>
          </div>

          <div class="team-card-footer">
            <span v-if="team.foundedYear" class="team-founded">
              成立于 {{ team.foundedYear }} 年
            </span>
            <span class="team-detail-link">
              查看详情
              <el-icon><ArrowRight /></el-icon>
            </span>
          </div>
        </div>
      </div>

      <div v-else class="empty-container">
        <EmptyState
          description="暂无球队数据"
          :image-size="160"
        />
      </div>
    </div>

    <!-- 分页 -->
    <div v-if="totalPages > 1" class="pagination-container">
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="totalItems"
        layout="prev, pager, next"
        background
        @current-change="handlePageChange"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  Search, UserFilled, User, Trophy, Location, ArrowRight
} from '@element-plus/icons-vue'
import EmptyState from '../components/EmptyState.vue'
import { callFunction } from '@/utils/cloud'

/**
 * 球队数据展示页
 * 从侃球占位页改造而来
 * 功能：展示球队列表、搜索、筛选、排序
 */

const router = useRouter()

// 响应式数据
const loading = ref(false)
const searchKeyword = ref('')
const activeCategory = ref('all')
const sortBy = ref('name')
const currentPage = ref(1)
const pageSize = ref(20)
const totalItems = ref(0)
const totalPages = ref(0)
const teamList = ref([])
const isUsingMockData = ref(false)

// 统计数据
const stats = reactive({
  totalTeams: 0,
  totalPlayers: 0,
  totalTournaments: 0,
  categories: 3
})

// 分类选项
const categories = [
  { label: '全部', value: 'all' },
  { label: '青少年球队', value: 'youth' }
]

// Mock 数据（当云函数不可用时的降级方案）
const MOCK_TEAMS = [
  {
    _id: 'mock_001',
    name: '广州天河 FC',
    shortName: '天河FC',
    logo: '',
    city: '广州',
    category: 'youth',
    foundedYear: 2018,
    playerCount: 25,
    tournamentCount: 12,
    coachName: '李明',
    description: '广州天河区青少年足球队，注重基本功训练和团队配合。',
    contactPhone: '13800138001'
  },
  {
    _id: 'mock_002',
    name: '深圳龙岗青年军',
    shortName: '龙岗青年',
    logo: '',
    city: '深圳',
    category: 'youth',
    foundedYear: 2020,
    playerCount: 20,
    tournamentCount: 8,
    coachName: '王强',
    description: '由深圳龙岗区青年球员组成，充满活力，技术细腻，是未来之星。',
    contactPhone: '13800138002'
  },
  {
    _id: 'mock_003',
    name: '佛山南海雄鹰',
    shortName: '南海雄鹰',
    logo: '',
    city: '佛山',
    category: 'youth',
    foundedYear: 2015,
    playerCount: 28,
    tournamentCount: 15,
    coachName: '陈国华',
    description: '佛山南海区青训梯队，重视防守意识和比赛阅读能力。',
    contactPhone: '13800138003'
  },
  {
    _id: 'mock_004',
    name: '东莞寮步之星',
    shortName: '寮步之星',
    logo: '',
    city: '东莞',
    category: 'youth',
    foundedYear: 2021,
    playerCount: 18,
    tournamentCount: 6,
    coachName: '张伟',
    description: '东莞寮步镇青少年足球队，培养年轻球员，注重基本功训练。',
    contactPhone: '13800138004'
  },
  {
    _id: 'mock_005',
    name: '中山石岐老友',
    shortName: '石岐老友',
    logo: '',
    city: '中山',
    category: 'youth',
    foundedYear: 2012,
    playerCount: 22,
    tournamentCount: 20,
    coachName: '刘东海',
    description: '中山石岐区青少年足球队，帮助孩子在比赛中建立自信。',
    contactPhone: '13800138005'
  },
  {
    _id: 'mock_006',
    name: '珠海香洲勇士',
    shortName: '香洲勇士',
    logo: '',
    city: '珠海',
    category: 'youth',
    foundedYear: 2019,
    playerCount: 26,
    tournamentCount: 10,
    coachName: '赵勇',
    description: '珠海香洲区青少年代表队，拼搏精神强，团队协作出色。',
    contactPhone: '13800138006'
  },
  {
    _id: 'mock_007',
    name: '惠州惠城联队',
    shortName: '惠城联队',
    logo: '',
    city: '惠州',
    category: 'youth',
    foundedYear: 2017,
    playerCount: 24,
    tournamentCount: 14,
    coachName: '孙立',
    description: '惠州惠城区青训联队，汇聚区内优秀青少年球员。',
    contactPhone: '13800138007'
  },
  {
    _id: 'mock_008',
    name: '江门蓬江小将',
    shortName: '蓬江小将',
    logo: '',
    city: '江门',
    category: 'youth',
    foundedYear: 2022,
    playerCount: 16,
    tournamentCount: 5,
    coachName: '周小军',
    description: '江门蓬江区青少年足球队，平均年龄18岁，朝气蓬勃，潜力巨大。',
    contactPhone: '13800138008'
  },
  {
    _id: 'mock_009',
    name: '肇庆端州竞技',
    shortName: '端州竞技',
    logo: '',
    city: '肇庆',
    category: 'youth',
    foundedYear: 2016,
    playerCount: 30,
    tournamentCount: 18,
    coachName: '吴竞技',
    description: '肇庆端州区青少年梯队，攻防平衡，战术素养持续提升。',
    contactPhone: '13800138009'
  },
  {
    _id: 'mock_010',
    name: '清远清城FC',
    shortName: '清城FC',
    logo: '',
    city: '清远',
    category: 'youth',
    foundedYear: 2014,
    playerCount: 23,
    tournamentCount: 16,
    coachName: '黄清远',
    description: '清远清城区青少年足球队，长期培养本地校园足球苗子。',
    contactPhone: '13800138010'
  }
]

/**
 * 获取分类标签
 */
function getCategoryLabel(category) {
  const map = {
    youth: '青少年'
  }
  return map[category] || category
}

/**
 * 加载球队数据
 */
async function loadTeams() {
  loading.value = true
  isUsingMockData.value = false

  try {
    // 尝试调用云函数
    const result = await callFunction('getTeams', {
      keyword: searchKeyword.value || undefined,
      category: activeCategory.value === 'all' ? undefined : activeCategory.value,
      sortBy: sortBy.value,
      page: currentPage.value,
      pageSize: pageSize.value
    })

    if (result && result.data) {
      // 云函数返回成功
      const data = result.data
      teamList.value = data.list || []
      totalItems.value = data.total || 0
      totalPages.value = Math.ceil(totalItems.value / pageSize.value)

      // 更新统计数据
      if (data.stats) {
        stats.totalTeams = data.stats.totalTeams || 0
        stats.totalPlayers = data.stats.totalPlayers || 0
        stats.totalTournaments = data.stats.totalTournaments || 0
      } else {
        updateStatsFromList(teamList.value)
      }
    } else {
      throw new Error('云函数返回数据格式错误')
    }
  } catch (err) {
    console.warn('getTeams 云函数调用失败，使用 Mock 数据:', err.message)
    isUsingMockData.value = true

    // 使用 Mock 数据
    let filteredList = [...MOCK_TEAMS]

    // 按关键词过滤
    if (searchKeyword.value) {
      const keyword = searchKeyword.value.toLowerCase()
      filteredList = filteredList.filter(team =>
        team.name.toLowerCase().includes(keyword) ||
        team.city.toLowerCase().includes(keyword) ||
        (team.coachName && team.coachName.toLowerCase().includes(keyword))
      )
    }

    // 按分类过滤
    if (activeCategory.value !== 'all') {
      filteredList = filteredList.filter(team => team.category === activeCategory.value)
    }

    // 排序
    if (sortBy.value === 'name') {
      filteredList.sort((a, b) => a.name.localeCompare(b.name))
    } else if (sortBy.value === 'playerCount') {
      filteredList.sort((a, b) => (b.playerCount || 0) - (a.playerCount || 0))
    } else if (sortBy.value === 'tournamentCount') {
      filteredList.sort((a, b) => (b.tournamentCount || 0) - (a.tournamentCount || 0))
    }

    // 分页
    totalItems.value = filteredList.length
    totalPages.value = Math.ceil(totalItems.value / pageSize.value)
    const start = (currentPage.value - 1) * pageSize.value
    const end = start + pageSize.value
    teamList.value = filteredList.slice(start, end)

    // 更新统计数据
    updateStatsFromList(MOCK_TEAMS)

    // 显示提示（仅首次加载时）
    if (currentPage.value === 1 && !searchKeyword.value && activeCategory.value === 'all') {
      ElMessage.info('当前展示示例数据，云函数 getTeams 待部署')
    }
  } finally {
    loading.value = false
  }
}

/**
 * 从列表更新统计数据
 */
function updateStatsFromList(list) {
  stats.totalTeams = list.length
  stats.totalPlayers = list.reduce((sum, team) => sum + (team.playerCount || 0), 0)
  stats.totalTournaments = list.reduce((sum, team) => sum + (team.tournamentCount || 0), 0)
  stats.categories = 3
}

/**
 * 搜索处理
 */
function handleSearch() {
  currentPage.value = 1
  loadTeams()
}

/**
 * 切换分类
 */
function switchCategory(category) {
  activeCategory.value = category
  currentPage.value = 1
  loadTeams()
}

/**
 * 页码变化
 */
function handlePageChange(page) {
  currentPage.value = page
  loadTeams()
}

/**
 * 跳转到球队详情
 */
function goToTeamDetail(team) {
  // TODO: 预留球队详情页路由
  // router.push(`/portal/team/${team._id}`)
  ElMessage.info(`球队详情页开发中，当前查看：${team.name}`)
}

// 组件挂载时加载数据
onMounted(() => {
  loadTeams()
})
</script>

<style scoped>
.team-page {
  padding: 0 0 32px;
}

/* Hero 区域 */
.team-hero {
  background: linear-gradient(135deg, #1B5E20 0%, #2E7D32 50%, #43A047 100%);
  margin: -16px -24px 24px;
  padding: 48px 24px;
  position: relative;
  overflow: hidden;
}

.team-hero::before {
  content: '';
  position: absolute;
  top: -50%;
  right: -10%;
  width: 400px;
  height: 400px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 50%;
}

.team-hero::after {
  content: '';
  position: absolute;
  bottom: -60%;
  left: -5%;
  width: 300px;
  height: 300px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 50%;
}

.hero-content {
  position: relative;
  z-index: 1;
  text-align: center;
}

.hero-title {
  font-size: 36px;
  font-weight: 800;
  color: #FFFFFF;
  margin: 0 0 12px;
  letter-spacing: 2px;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.hero-subtitle {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.85);
  margin: 0;
  max-width: 600px;
  margin: 0 auto;
  line-height: 1.6;
}

/* 统计概览 */
.stats-overview {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  background: #FFFFFF;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  transition: all 0.3s ease;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1B5E20, #43A047);
  color: #FFFFFF;
  font-size: 24px;
  flex-shrink: 0;
}

.stat-icon.players {
  background: linear-gradient(135deg, #1976D2, #42A5F5);
}

.stat-icon.tournaments {
  background: linear-gradient(135deg, #F57C00, #FFA726);
}

.stat-icon.categories {
  background: linear-gradient(135deg, #7B1FA2, #AB47BC);
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 28px;
  font-weight: 800;
  color: #1B5E20;
  line-height: 1.2;
}

.stat-label {
  font-size: 13px;
  color: #909399;
  margin-top: 4px;
}

/* 搜索和筛选区域 */
.filter-section {
  background: #FFFFFF;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 24px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.search-box {
  margin-bottom: 16px;
}

.search-box :deep(.el-input__wrapper) {
  border-radius: 8px;
  padding: 12px 16px;
}

.filter-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.category-filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.category-tag {
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 14px;
  padding: 6px 16px;
  border-radius: 20px;
}

.category-tag:hover {
  transform: translateY(-1px);
}

.sort-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sort-label {
  font-size: 14px;
  color: #606266;
  white-space: nowrap;
}

/* 球队卡片列表 */
.team-list-section {
  margin-bottom: 24px;
}

.team-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}

.team-card {
  background: #FFFFFF;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  transition: all 0.3s ease;
  cursor: pointer;
  display: flex;
  flex-direction: column;
}

.team-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
}

.team-card-header {
  position: relative;
  padding: 20px;
  background: linear-gradient(135deg, #F5F5F5 0%, #FAFAFA 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.team-logo-wrapper {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  overflow: hidden;
  background: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.team-logo {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.team-logo-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1B5E20, #43A047);
  color: #FFFFFF;
  font-size: 36px;
}

.team-badge {
  position: absolute;
  top: 16px;
  right: 16px;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  color: #FFFFFF;
}

.team-badge.youth {
  background: linear-gradient(135deg, #1976D2, #42A5F5);
}

.team-card-body {
  padding: 20px;
  flex: 1;
}

.team-name {
  font-size: 20px;
  font-weight: 700;
  color: #1B5E20;
  margin: 0 0 4px;
  line-height: 1.3;
}

.team-short-name {
  font-size: 14px;
  color: #909399;
  margin: 0 0 12px;
}

.team-info-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.team-info-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #606266;
}

.team-info-item .el-icon {
  font-size: 16px;
  color: #1B5E20;
}

.team-description {
  font-size: 13px;
  color: #909399;
  line-height: 1.6;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.team-card-footer {
  padding: 16px 20px;
  border-top: 1px solid #F5F5F5;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.team-founded {
  font-size: 12px;
  color: #909399;
}

.team-detail-link {
  font-size: 14px;
  color: #1B5E20;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: gap 0.2s ease;
}

.team-card:hover .team-detail-link {
  gap: 8px;
}

/* 加载状态 */
.loading-container {
  padding: 40px 20px;
}

/* 空状态 */
.empty-container {
  padding: 60px 20px;
  background: #FFFFFF;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

/* 分页 */
.pagination-container {
  display: flex;
  justify-content: center;
  padding: 20px;
}

/* 响应式布局 */
@media (max-width: 768px) {
  .team-hero {
    margin: -12px -16px 16px;
    padding: 32px 16px;
  }

  .hero-title {
    font-size: 28px;
  }

  .hero-subtitle {
    font-size: 14px;
  }

  .stats-overview {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .stat-card {
    padding: 16px;
  }

  .stat-value {
    font-size: 24px;
  }

  .filter-controls {
    flex-direction: column;
    align-items: flex-start;
  }

  .team-grid {
    grid-template-columns: 1fr;
  }
}

@media (min-width: 769px) and (max-width: 1024px) {
  .team-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1025px) {
  .team-page {
    padding: 0 0 48px;
  }

  .team-hero {
    margin: -20px -48px 32px;
    padding: 64px 48px;
  }

  .hero-title {
    font-size: 42px;
  }

  .stats-overview {
    gap: 20px;
  }

  .team-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
