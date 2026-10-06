<template>
  <div class="tournament-center">
    <!-- 顶部导航栏 -->
    <header class="center-header">
      <div class="header-left">
        <img :src="brandLogoUrl" alt="赛小蜂足球" class="logo" @click="goToHome" style="cursor: pointer;" />
      </div>
      <div class="header-right">
        <template v-if="isLoggedIn()">
          <div class="user-info">
            <el-tag v-if="userRole === 'ORGANIZER'" type="primary">主办方</el-tag>
            <el-tag v-else-if="userRole === 'COACH'" type="success">球队</el-tag>
            <el-tag v-else-if="userRole === 'REFEREE'" type="warning">裁判</el-tag>
            <span class="user-name">{{ userName }}</span>
            <el-button size="small" type="success" :icon="Management" @click="goToDashboard">管理后台</el-button>
          </div>
        </template>
        <template v-else>
          <el-button type="primary" @click="goToLogin">登录 / 注册</el-button>
        </template>
      </div>
    </header>

    <!-- 轮播图区域 -->
    <section class="banner-section">
      <el-carousel height="400px" indicator-position="outside">
        <el-carousel-item v-for="(banner, index) in banners" :key="index">
          <div class="banner-item" :style="{ backgroundImage: `url(${banner.image})` }">
            <div class="banner-content">
              <h2 class="banner-title">{{ banner.title }}</h2>

              <el-button type="primary" size="large" @click="goToTournament(banner.tournamentId)">
                立即查看
              </el-button>
            </div>
          </div>
        </el-carousel-item>
      </el-carousel>
    </section>

    <!-- 分类导航 -->
    <section class="category-section">
      <div class="category-tabs">
        <div class="tab-group">
          <span class="tab-label">赛事类型：</span>
          <div class="tab-items">
            <span
              v-for="type in tournamentTypes"
              :key="type.value"
              class="tab-item"
              :class="{ active: selectedType === type.value }"
              @click="selectType(type.value)"
            >
              {{ type.label }}
            </span>
          </div>
        </div>
        <div class="tab-group">
          <span class="tab-label">年龄段：</span>
          <div class="tab-items">
            <span
              v-for="age in ageGroups"
              :key="age.value"
              class="tab-item"
              :class="{ active: selectedAge === age.value }"
              @click="selectAge(age.value)"
            >
              {{ age.label }}
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- 赛事列表 -->
    <section class="tournament-list-section">
      <div class="section-header">
        <h3 class="section-title">热门赛事</h3>
        <div class="sort-options">
          <span
            v-for="sort in sortOptions"
            :key="sort.value"
            class="sort-item"
            :class="{ active: selectedSort === sort.value }"
            @click="selectSort(sort.value)"
          >
            {{ sort.label }}
          </span>
        </div>
      </div>

      <div v-loading="loading" class="tournament-grid">
        <div
          v-for="tournament in filteredTournaments"
          :key="tournament._id"
          class="tournament-card"
          @click="goToTournament(tournament._id)"
        >
          <div class="card-image">
            <img :src="tournament.logo || defaultTournamentLogo" :alt="tournament.name" />
            <div class="card-badge" :class="getStatusClass(tournament.status)">
              {{ getStatusText(tournament.status) }}
            </div>
          </div>
          <div class="card-content">
            <h4 class="card-title">{{ tournament.name }}</h4>
            <div class="card-meta">
              <span class="meta-item">
                <el-icon><Calendar /></el-icon>
                {{ formatDate(tournament.startDate) }}
              </span>
              <span class="meta-item">
                <el-icon><Location /></el-icon>
                {{ tournament.city || '待定' }}
              </span>
            </div>
            <div class="card-tags">
              <el-tag size="small" effect="plain">{{ tournament.type || '赛会制' }}</el-tag>
              <el-tag size="small" type="warning" effect="plain">{{ tournament.ageGroup || 'U12' }}</el-tag>
            </div>
            <div class="card-footer">
              <span class="team-count">{{ tournament.registeredTeams || 0 }} 支球队报名</span>
              <div class="card-actions">
                <el-button type="primary" size="small" @click.stop="goToTournament(tournament._id)">查看详情</el-button>
                <el-button
                  v-if="userRole === 'COACH' && (tournament.status === 'registering' || tournament.status === 'upcoming')"
                  type="success"
                  size="small"
                  @click.stop="handleSignup(tournament)"
                >
                  我要报名
                </el-button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <el-empty v-if="!loading && filteredTournaments.length === 0" description="暂无符合条件的赛事" />

      <!-- 分页 -->
      <div v-if="filteredTournaments.length > 0" class="pagination-wrapper">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :total="total"
          layout="prev, pager, next"
          @current-change="handlePageChange"
        />
      </div>
    </section>

    <!-- 页脚 -->
    <footer class="center-footer">
      <p>© 2026 赛小蜂足球赛事系统 - 让每场比赛都专业</p>
    </footer>

    <!-- 报名对话框 -->
    <el-dialog
      v-model="signupVisible"
      title="报名参赛"
      width="480px"
      :close-on-click-modal="false"
    >
      <div v-if="selectedTournament" class="signup-tournament-info">
        <h4>{{ selectedTournament.name }}</h4>
        <p>请选择要报名的球队：</p>
      </div>
      <el-select
        v-model="selectedTeamId"
        placeholder="选择球队"
        style="width: 100%"
        :loading="loadingTeams"
      >
        <el-option
          v-for="team in myTeams"
          :key="team._id"
          :label="team.name"
          :value="team._id"
        />
      </el-select>
      <div v-if="signupDivisions.length" class="signup-division-picker">
        <div class="signup-division-heading"><strong>选择报名组别</strong><span>已满或未开放的组别不可选择</span></div>
        <div class="signup-division-tags">
          <button
            v-for="division in signupDivisions"
            :key="division.id"
            type="button"
            :class="{ active: division.id === selectedDivisionId, disabled: division.disabled }"
            :disabled="division.disabled"
            @click="selectSignupDivision(division)"
          ><strong>{{ division.name }}</strong><small v-if="division.statusText">{{ division.statusText }}</small></button>
        </div>
      </div>
      <el-input
        v-model="signupMessage"
        type="textarea"
        :rows="3"
        placeholder="附言（可选）：想说的话..."
        style="margin-top: 16px"
      />
      <template #footer>
        <el-button @click="signupVisible = false">取消</el-button>
        <el-button type="primary" :loading="signupLoading" @click="submitSignup">提交报名</el-button>
      </template>
    </el-dialog>

    <!-- 登录提示对话框 -->
    <el-dialog
      v-model="loginPromptVisible"
      title="需要登录"
      width="360px"
      :show-close="false"
    >
      <p>报名参赛需要先登录账号</p>
      <template #footer>
        <el-button @click="loginPromptVisible = false">取消</el-button>
        <el-button type="primary" @click="goToLogin">去登录</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Calendar, Location, Management } from '@element-plus/icons-vue'
import { queryList, callFunction } from '../../utils/cloud'
import { getTempFileURL } from '../../utils/upload'

const router = useRouter()
const brandLogoUrl = `${import.meta.env.BASE_URL}LOGO2.png`
const defaultTournamentLogo = `${import.meta.env.BASE_URL}organization-logo-placeholder.svg`
const loading = ref(false)
const tournaments = ref([])
const currentPage = ref(1)
const pageSize = ref(12)
const total = ref(0)

// 用户信息（实时读取，支持切换身份）
const userRole = computed(() => (localStorage.getItem('currentRole') || localStorage.getItem('role') || '').toUpperCase())
const userName = ref('')

// 初始化用户信息
function initUserInfo() {
  const savedInfo = localStorage.getItem('userInfo')
  if (savedInfo) {
    try {
      const parsed = JSON.parse(savedInfo)
      userName.value = parsed.userName || parsed.nickName || '用户'
    } catch (e) {
      userName.value = '用户'
    }
  }
}

// 报名相关
const signupVisible = ref(false)
const loginPromptVisible = ref(false)
const selectedTournament = ref(null)
const selectedTeamId = ref('')
const selectedDivisionId = ref('')
const signupDivisions = ref([])
const myTeams = ref([])
const loadingTeams = ref(false)
const signupLoading = ref(false)
const signupMessage = ref('')

// 筛选条件
const selectedType = ref('all')
const selectedAge = ref('all')
const selectedSort = ref('newest')

// 轮播图数据
const banners = ref([])

// 赛事类型
const tournamentTypes = [
  { value: 'all', label: '全部' },
  { value: 'league', label: '联赛制' },
  { value: 'cup', label: '杯赛制' },
  { value: 'tournament', label: '赛会制' },
  { value: 'mixed', label: '复合制' }
]

// 年龄段
const ageGroups = [
  { value: 'all', label: '全部' },
  { value: 'U8', label: 'U8' },
  { value: 'U10', label: 'U10' },
  { value: 'U12', label: 'U12' },
  { value: 'U14', label: 'U14' },
  { value: 'U16', label: 'U16' },
  { value: 'U18', label: 'U18' },
  { value: 'adult', label: '成人组' }
]

// 排序选项
const sortOptions = [
  { value: 'newest', label: '最新发布' },
  { value: 'hot', label: '最热赛事' },
  { value: 'soon', label: '即将开始' }
]

// 筛选后的赛事列表
const filteredTournaments = computed(() => {
  let result = [...tournaments.value]

  // 按类型筛选
  if (selectedType.value !== 'all') {
    result = result.filter(t => t.type === selectedType.value)
  }

  // 按年龄段筛选
  if (selectedAge.value !== 'all') {
    result = result.filter(t => t.ageGroup === selectedAge.value)
  }

  // 排序
  switch (selectedSort.value) {
    case 'newest':
      result.sort((a, b) => {
        const featuredPriority = Number(Boolean(b.isFeatured || b.featured)) - Number(Boolean(a.isFeatured || a.featured))
        return featuredPriority || new Date(b.createdAt || b.createTime) - new Date(a.createdAt || a.createTime)
      })
      break
    case 'hot':
      result.sort((a, b) => {
        const featuredPriority = Number(Boolean(b.isFeatured || b.featured)) - Number(Boolean(a.isFeatured || a.featured))
        return featuredPriority || (b.registeredTeams || 0) - (a.registeredTeams || 0)
      })
      break
    case 'soon':
      result.sort((a, b) => {
        const featuredPriority = Number(Boolean(b.isFeatured || b.featured)) - Number(Boolean(a.isFeatured || a.featured))
        return featuredPriority || new Date(a.startDate) - new Date(b.startDate)
      })
      break
  }

  return result
})

// 加载轮播图
async function loadBanners() {
  try {
    const result = await callFunction('getBanners', {})
    if (result.success) {
      // 将 fileID 转换为临时 URL
      const bannersData = result.data || []
      const bannersWithUrl = await Promise.all(
        bannersData.map(async (banner) => {
          if (banner.imageUrl && banner.imageUrl.startsWith('cloud://')) {
            const urlResult = await getTempFileURL(banner.imageUrl)
            if (urlResult.success) {
              banner.imageUrl = urlResult.url
            }
          }
          return {
            image: banner.imageUrl,
            title: banner.title,
            description: '',
            tournamentId: banner.link
          }
        })
      )
      banners.value = bannersWithUrl
    }
  } catch (err) {
    console.error('加载轮播图失败:', err)
  }
}

// 加载赛事列表
async function loadTournaments() {
  loading.value = true
  try {
    const result = await callFunction('getTournaments', {
      pageIndex: currentPage.value - 1,
      pageSize: pageSize.value,
      includeLegacyCategory: true
    })
    if (!result.success) throw new Error(result.error || result.message || '加载赛事失败')
    tournaments.value = result.data || []
    total.value = Number(result.total || tournaments.value.length)
  } catch (err) {
    console.error('加载赛事失败:', err)
    ElMessage.error('加载赛事失败')
  } finally {
    loading.value = false
  }
}

// 选择类型
function selectType(type) {
  selectedType.value = type
  currentPage.value = 1
}

// 选择年龄段
function selectAge(age) {
  selectedAge.value = age
  currentPage.value = 1
}

// 选择排序
function selectSort(sort) {
  selectedSort.value = sort
}

// 分页变化
function handlePageChange(page) {
  currentPage.value = page
  loadTournaments()
}

// 跳转到赛事详情
function goToTournament(id) {
  router.push(`/tournaments/${id}`)
}

// 跳转到登录
function goToLogin() {
  loginPromptVisible.value = false
  router.push('/login')
}

// 跳转到首页
function goToHome() {
  router.push('/')
}

// 跳转到系统首页（让路由守卫根据角色自动转发）
function goToDashboard() {
  router.push('/tournament-space')
}

// 检查是否已登录
function isLoggedIn() {
  return localStorage.getItem('isLoggedIn') === 'true'
}

function normalizeSignupDivisions(source) {
  return (Array.isArray(source) ? source : []).map(item => ({
    id: String(item && (item.id || item._id || item.divisionId || item.division || item.divisionKey) || '').trim(),
    name: String(item && (item.name || item.divisionName || item.label || item.ageGroup) || '当前竞赛组别').trim(),
    maxTeams: Number([item && item.expectedTeams, item && item.requiredTeams, item && item.teamRequirement, item && item.participantTeams, item && item.maxTeams, item && item.teamLimit].map(Number).find(value => Number.isFinite(value) && value > 0) || 0),
    registrationEnabled: item && item.registrationEnabled === true
  })).filter(item => item.id)
}

async function loadSignupDivisions(tournament) {
  const embedded = normalizeSignupDivisions(tournament && tournament.divisions)
  let rows = []
  let registrations = []
  try {
    const loaded = await Promise.all([
      queryList('divisions', { limit: 100, where: { tournamentId: tournament && tournament._id } }),
      queryList('tournament_teams', { limit: 1000, where: { tournamentId: tournament && tournament._id } })
    ])
    rows = loaded[0] || []
    registrations = loaded[1] || []
  } catch (error) {
    rows = []
    registrations = []
  }
  const capacityCounts = registrations.reduce((counts, item) => {
    if (!['approved', 'invited'].includes(String(item.status || '').toLowerCase())) return counts
    const divisionId = String(item.divisionId || item.division || 'default')
    counts[divisionId] = Number(counts[divisionId] || 0) + 1
    return counts
  }, {})
  const tournamentStatus = String(tournament && tournament.status || '').toLowerCase()
  const source = rows.length ? normalizeSignupDivisions(rows) : embedded
  signupDivisions.value = source.map((division, order) => {
    const maxTeams = Number(division.maxTeams || tournament?.maxTeams || 0)
    const registeredTeams = Number(capacityCounts[division.id] || 0)
    const registrationOpen = tournament?.registrationEnabled !== false && division.registrationEnabled === true && ['registering', 'upcoming'].includes(tournamentStatus)
    const isFull = maxTeams > 0 && registeredTeams >= maxTeams
    return {
      ...division,
      maxTeams,
      registeredTeams,
      isFull,
      disabled: !registrationOpen || isFull,
      statusText: isFull ? '已满' : (!registrationOpen ? '已关闭' : ''),
      order
    }
  }).sort((a, b) => Number(a.disabled) - Number(b.disabled) || a.order - b.order)
  const firstSelectable = signupDivisions.value.find(item => !item.disabled)
  selectedDivisionId.value = firstSelectable ? firstSelectable.id : ''
}

function selectSignupDivision(division) {
  if (!division || division.disabled) return
  selectedDivisionId.value = division.id
}

// 处理报名按钮点击
async function handleSignup(tournament) {
  if (!isLoggedIn()) {
    loginPromptVisible.value = true
    return
  }
  selectedTournament.value = tournament
  selectedTeamId.value = ''
  selectedDivisionId.value = ''
  signupDivisions.value = []
  signupMessage.value = ''
  signupVisible.value = true
  await Promise.all([loadMyTeams(), loadSignupDivisions(tournament)])
}

// 加载我的球队
async function loadMyTeams() {
  loadingTeams.value = true
  try {
    const data = await queryList('teams', {
      limit: 100,
      where: {}
    })
    myTeams.value = data || []
  } catch (err) {
    console.error('加载球队失败:', err)
  } finally {
    loadingTeams.value = false
  }
}

// 提交报名
async function submitSignup() {
  if (!selectedTeamId.value) {
    ElMessage.warning('请选择球队')
    return
  }
  if (signupDivisions.value.length && !selectedDivisionId.value) {
    ElMessage.warning('请选择报名竞赛组别')
    return
  }
  const selectedDivision = signupDivisions.value.find(item => item.id === selectedDivisionId.value)
  if (selectedDivision && selectedDivision.disabled) {
    ElMessage.warning(selectedDivision.statusText || '当前组别暂不可报名')
    return
  }
  if (!selectedTournament.value) {
    ElMessage.warning('请选择赛事')
    return
  }

  signupLoading.value = true
  try {
    const res = await callFunction('applyTournament', {
      tournamentId: selectedTournament.value._id,
      teamId: selectedTeamId.value,
      ...(selectedDivisionId.value ? { divisionId: selectedDivisionId.value } : {}),
      message: signupMessage.value
    })

    if (res && res.success) {
      ElMessage.success(res.message || '报名申请已提交')
      signupVisible.value = false
    } else {
      ElMessage.warning(res?.message || '报名失败')
    }
  } catch (err) {
    console.error('报名失败:', err)
    ElMessage.error('报名失败: ' + (err.message || '未知错误'))
  } finally {
    signupLoading.value = false
  }
}

// 获取状态文本
function getStatusText(status) {
  const statusMap = {
    'registering': '报名中',
    'ongoing': '进行中',
    'finished': '已结束',
    'upcoming': '即将开始'
  }
  return statusMap[status] || '报名中'
}

// 获取状态样式
function getStatusClass(status) {
  const classMap = {
    'registering': 'status-registering',
    'ongoing': 'status-ongoing',
    'finished': 'status-finished',
    'upcoming': 'status-upcoming'
  }
  return classMap[status] || 'status-registering'
}

// 格式化日期
function formatDate(date) {
  if (!date) return '待定'
  const d = new Date(date)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

onMounted(() => {
  initUserInfo()
  loadBanners()
  loadTournaments()
})
</script>

<style scoped>
.tournament-center {
  min-height: 100vh;
  background: #f5f7fa;
}

/* 顶部导航 */
.center-header {
  height: 64px;
  background: linear-gradient(135deg, #1B5E20, #2E7D32);
  padding: 0 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 100;
}

.logo {
  height: 40px;
}

/* 轮播图 */
.banner-section {
  background: #fff;
  padding: 20px 40px;
}

.banner-item {
  height: 100%;
  background-size: cover;
  background-position: center;
  border-radius: 12px;
  display: flex;
  align-items: center;
  padding: 0 60px;
  position: relative;
}

.banner-item::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: linear-gradient(to right, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.2) 100%);
  border-radius: 12px;
}

.banner-content {
  position: relative;
  z-index: 1;
  color: #fff;
  max-width: 500px;
}

.banner-title {
  font-size: 36px;
  font-weight: 700;
  margin-bottom: 16px;
}

.banner-desc {
  font-size: 16px;
  margin-bottom: 24px;
  opacity: 0.9;
}

/* 分类导航 */
.category-section {
  background: #fff;
  padding: 20px 40px;
  border-bottom: 1px solid #ebeef5;
}

.category-tabs {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tab-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tab-label {
  font-size: 14px;
  color: #606266;
  font-weight: 500;
  white-space: nowrap;
}

.tab-items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tab-item {
  padding: 6px 16px;
  border-radius: 16px;
  font-size: 13px;
  color: #606266;
  background: #f5f7fa;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-item:hover {
  background: #e8f5e9;
  color: #2E7D32;
}

.tab-item.active {
  background: #2E7D32;
  color: #fff;
}

/* 赛事列表 */
.tournament-list-section {
  padding: 30px 40px;
  max-width: 1400px;
  margin: 0 auto;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.section-title {
  font-size: 24px;
  font-weight: 600;
  color: #303133;
}

.sort-options {
  display: flex;
  gap: 16px;
}

.sort-item {
  font-size: 14px;
  color: #606266;
  cursor: pointer;
  transition: color 0.2s;
}

.sort-item:hover {
  color: #2E7D32;
}

.sort-item.active {
  color: #2E7D32;
  font-weight: 500;
}

.tournament-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 24px;
}

.tournament-card {
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  cursor: pointer;
  transition: all 0.3s;
}

.tournament-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
}

.card-image {
  position: relative;
  height: 180px;
  overflow: hidden;
}

.card-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.card-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  color: #fff;
}

.status-registering { background: #67C23A; }
.status-ongoing { background: #409EFF; }
.status-finished { background: #909399; }
.status-upcoming { background: #E6A23C; }

.card-content {
  padding: 16px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 12px;
  line-height: 1.4;
}

.card-meta {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #606266;
}

.card-tags {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.team-count {
  font-size: 13px;
  color: #909399;
}

.card-actions {
  display: flex;
  gap: 8px;
}

.signup-tournament-info {
  margin-bottom: 16px;
}

.signup-tournament-info h4 {
  margin: 0 0 8px 0;
  color: #303133;
}

.signup-tournament-info p {
  margin: 0;
  color: #606266;
  font-size: 14px;
}

.signup-division-picker { margin-top:16px;padding:14px;border:1px solid #e0e8e3;border-radius:10px;background:#f8fbf9; }
.signup-division-heading { display:flex;justify-content:space-between;gap:16px;margin-bottom:12px; }
.signup-division-heading strong { color:#34453a;font-size:14px; }
.signup-division-heading span { color:#8b958f;font-size:12px; }
.signup-division-tags { display:flex;flex-wrap:wrap;gap:10px; }
.signup-division-tags button { display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 14px;border:1px solid #b9dcc6;border-radius:18px;background:#f1faf4;color:#24643d;cursor:pointer; }
.signup-division-tags button strong { font-size:14px; }
.signup-division-tags button small { font-size:11px; }
.signup-division-tags button.active { border-color:#168447;background:#168447;color:#fff; }
.signup-division-tags button.disabled { border-color:#e0e4e1;background:#ecefed;color:#a1a8a3;cursor:not-allowed; }

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 40px;
}

/* 页脚 */
.center-footer {
  background: #fff;
  padding: 30px;
  text-align: center;
  border-top: 1px solid #ebeef5;
  color: #909399;
  font-size: 14px;
}

/* 用户信息 */
.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-name {
  font-size: 14px;
  color: #303133;
  font-weight: 500;
}
</style>
