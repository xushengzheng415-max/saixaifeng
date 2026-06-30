<template>
  <div class="tournament-list">
    <div class="page-card">
      <div class="page-header">
        <h2>{{ currentRole === ROLES.COACH ? '赛事报名' : '赛事管理' }}</h2>
        <el-button v-if="canCreateTournament" type="primary" @click="$router.push('/tournaments/create')">
          <el-icon><Plus /></el-icon>创建赛事
        </el-button>
      </div>

      <!-- 状态筛选 -->
      <el-tabs v-model="activeTab" @tab-change="handleTabChange">
        <el-tab-pane label="全部" name="all" />
        <el-tab-pane label="报名中" name="registering" />
        <el-tab-pane label="进行中" name="ongoing" />
        <el-tab-pane label="已结束" name="completed" />
      </el-tabs>

      <!-- 卡片列表 -->
      <div class="tournament-cards" v-loading="loading">
        <div
          v-for="tournament in filteredTournaments"
          :key="tournament._id"
          class="tournament-card"
          :style="{ '--card-gradient': getGradient(tournament.type) }"
          @click="$router.push('/tournaments/' + tournament._id)"
        >
          <!-- 卡片顶部：渐变背景 + Logo -->
          <div class="card-header">
            <div class="card-logo">
              <img v-if="tournament.logo || tournament.logoUrl" :src="tournament.logo || tournament.logoUrl" alt="logo" />
              <span v-else class="logo-placeholder">{{ getLogoEmoji(tournament.type) }}</span>
            </div>
            <div class="card-status" :class="tournament.status">
              {{ statusLabels[tournament.status] || tournament.status }}
            </div>
            <!-- 待审角标（主办方视角） -->
            <div v-if="tournament.pendingCount > 0 && currentRole === ROLES.ORGANIZER" class="pending-badge">
              {{ tournament.pendingCount }} 待审
            </div>
          </div>

          <!-- 卡片内容 -->
          <div class="card-body">
            <h3 class="card-title">{{ tournament.name }}</h3>
            <div class="card-info">
              <div class="info-item">
                <el-icon><Trophy /></el-icon>
                <span>{{ scheduleTypeNames[tournament.type] || tournament.type }}</span>
              </div>
              <div class="info-item">
                <el-icon><Calendar /></el-icon>
                <span>{{ formatDate(tournament.startDate) }}</span>
              </div>
            </div>
            <div class="card-teams">
              <div class="teams-bar">
                <div
                  class="teams-fill"
                  :style="{ width: getTeamPercent(tournament) + '%' }"
                ></div>
              </div>
              <span class="teams-text">
                {{ tournament.registeredTeams || 0 }} / {{ tournament.maxTeams || 0 }} 队
              </span>
            </div>
          </div>

          <!-- 卡片底部操作 -->
          <div class="card-footer" @click.stop>
            <template v-if="canManageTournament(tournament)">
              <el-button type="primary" link size="small" @click="$router.push('/tournaments/' + tournament._id + '/teams')">
                球队管理
              </el-button>
              <el-button type="primary" link size="small" @click="$router.push('/tournaments/' + tournament._id + '/schedule')">
                赛程安排
              </el-button>
              <el-button type="danger" link size="small" @click="quickDelete(tournament)">
                删除
              </el-button>
            </template>
            <template v-else-if="currentRole === ROLES.COACH">
              <el-button type="primary" link size="small" @click="signupTournament(tournament)">
                立即报名
              </el-button>
            </template>
          </div>
        </div>

        <!-- 空状态 -->
        <el-empty v-if="filteredTournaments.length === 0 && !loading" description="暂无赛事数据">
          <el-button type="primary" @click="$router.push('/tournaments/create')">
            创建第一个赛事
          </el-button>
        </el-empty>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox, ElEmpty } from 'element-plus'
import { Plus, Trophy, Calendar } from '@element-plus/icons-vue'
import { queryList, deleteRecord } from '../../utils/cloud'
import { permissions, getCurrentRole, ROLES } from '../../utils/permissions'
import { useRoute } from 'vue-router'

const route = useRoute()

const loading = ref(false)
const activeTab = ref('all')
const tournaments = ref([])

// 当前角色
const currentRole = ref(getCurrentRole())
const userId = ref(localStorage.getItem('userId') || 'dev-user-id')

// 权限检查
const canCreateTournament = computed(() => permissions.tournament.create())
const canManageTournament = (tournament) => permissions.tournament.manage(tournament)

const scheduleTypeNames = {
  tournament: '赛会制',
  cup: '杯赛制',
  league: '联赛制',
  combined: '复合制'
}

const statusLabels = {
  registering: '报名中',
  ongoing: '进行中',
  completed: '已结束'
}

// 不同赛制的渐变色
const gradients = {
  tournament: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  cup: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  league: 'linear-gradient(135deg, #4ade80 0%, #22c55e 100%)',
  combined: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)'
}

// 不同赛制的emoji
const logoEmojis = {
  tournament: '🏆',
  cup: '🥇',
  league: '⚽',
  combined: '🎯'
}

function getGradient(type) {
  return gradients[type] || gradients.tournament
}

function getLogoEmoji(type) {
  return logoEmojis[type] || logoEmojis.tournament
}

function formatDate(date) {
  if (!date) return '-'
  const d = new Date(date)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

function getTeamPercent(tournament) {
  const registered = tournament.registeredTeams || 0
  const max = tournament.maxTeams || 0
  if (max === 0) return 0
  return Math.min(100, (registered / max) * 100)
}

const filteredTournaments = computed(() => {
  if (activeTab.value === 'all') return tournaments.value
  return tournaments.value.filter(t => t.status === activeTab.value)
})

function handleTabChange() {
  // computed handles filtering
}

async function deleteTournament(row) {
  try {
    await ElMessageBox.confirm(
      `确定删除赛事「${row.name}」吗？相关赛程和报名数据也将被删除！`,
      '删除确认',
      {
        type: 'warning',
        confirmButtonText: '确定删除',
        cancelButtonText: '取消'
      }
    )
    loading.value = true
    const result = await deleteRecord('tournaments', row._id, { cascade: true })
    ElMessage.success('删除成功')
    // 重新加载列表
    await loadTournaments()
  } catch (err) {
    console.error('删除失败:', err)
    // ElMessageBox.confirm 取消时会抛出 Error { message: "cancel" }
    if (err && err.message !== 'cancel' && err !== 'cancel') {
      ElMessage.error('删除失败: ' + (err.message || String(err)))
    }
  } finally {
    loading.value = false
  }
}

// 快速删除（跳过确认，用于测试）
async function quickDelete(row) {
  try {
    loading.value = true
    await deleteRecord('tournaments', row._id, { cascade: true })
    ElMessage.success('删除成功')

    // 强制重新加载全部数据
    await new Promise(resolve => setTimeout(resolve, 500))
    tournaments.value = []
    await loadTournaments()

    // 强制刷新
    if (tournaments.value.some(t => t._id === row._id)) {
      console.warn('删除后数据仍在列表中，尝试从本地移除')
      tournaments.value = tournaments.value.filter(t => t._id !== row._id)
    }
  } catch (err) {
    console.error('删除失败:', err)
    ElMessage.error('删除失败: ' + (err.message || String(err)))
  } finally {
    loading.value = false
  }
}

// 报名赛事
async function signupTournament(tournament) {
  try {
    // 检查教练是否有球队
    const myTeams = await queryList('teams', { 
      where: { creatorId: userId.value } 
    })
    
    if (myTeams.length === 0) {
      ElMessage.warning('您还没有创建球队，请先创建球队后再报名')
      return
    }
    
    // 跳转到报名页面或显示报名对话框
    ElMessage.info('报名功能开发中，请选择球队：' + myTeams.map(t => t.name).join('、'))
  } catch (err) {
    console.error('加载球队失败:', err)
    ElMessage.error('加载球队信息失败')
  }
}

async function loadTournaments() {
  loading.value = true
  try {
    const list = await queryList('tournaments', { orderBy: { createTime: 'desc' } })
    
    // 主办方视角：加载每个赛事的待审报名数量
    if (currentRole.value === ROLES.ORGANIZER && list.length > 0) {
      const tournamentIds = list.map(t => t._id)
      const pendingRes = await queryList('tournament_teams', {
        where: {
          tournamentId: { $in: tournamentIds },
          status: 'pending'
        }
      })
      // 统计每个赛事的待审数量
      const pendingMap = {}
      pendingRes.forEach(item => {
        const tid = item.tournamentId
        pendingMap[tid] = (pendingMap[tid] || 0) + 1
      })
      // 合并到赛事数据中
      list.forEach(t => {
        t.pendingCount = pendingMap[t._id] || 0
      })
    }
    
    tournaments.value = list
  } catch (err) {
    console.error('加载赛事列表失败:', err)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  // 延迟加载：等待 CloudBase SDK 完全就绪（解决动态导入 SPA 时的时序竞态问题）
  nextTick(() => {
    setTimeout(() => loadTournaments(), 500)
  })
})

// 路由变化时重新加载（切侧边栏菜单时触发，确保数据刷新）
watch(() => route.path, (newPath) => {
  if (newPath === '/tournaments' || newPath === '/') {
    loadTournaments()
  }
})
</script>

<style scoped>
.tournament-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
  padding: 16px 0;
}

.tournament-card {
  background: #fff;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  transition: all 0.3s ease;
}

.tournament-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

/* 卡片顶部 */
.card-header {
  position: relative;
  height: 120px;
  background: var(--card-gradient, linear-gradient(135deg, #667eea 0%, #764ba2 100%));
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-logo {
  width: 80px;
  height: 80px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.card-logo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.logo-placeholder {
  font-size: 40px;
  line-height: 1;
}

.card-status {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
}

.card-status.registering {
  background: rgba(34, 197, 94, 0.9);
}

.card-status.ongoing {
  background: rgba(59, 130, 246, 0.9);
}

.card-status.completed {
  background: rgba(107, 114, 128, 0.9);
}

/* 待审角标 */
.pending-badge {
  position: absolute;
  top: 12px;
  left: 12px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background: #f59e0b;
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.4);
}

/* 卡片内容 */
.card-body {
  padding: 20px;
}

.card-title {
  margin: 0 0 12px 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-info {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #6b7280;
}

.info-item .el-icon {
  font-size: 14px;
}

.card-teams {
  display: flex;
  align-items: center;
  gap: 12px;
}

.teams-bar {
  flex: 1;
  height: 6px;
  background: #e5e7eb;
  border-radius: 3px;
  overflow: hidden;
}

.teams-fill {
  height: 100%;
  background: linear-gradient(90deg, #22c55e, #4ade80);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.teams-text {
  font-size: 13px;
  color: #6b7280;
  white-space: nowrap;
}

/* 卡片底部 */
.card-footer {
  padding: 12px 20px;
  border-top: 1px solid #f3f4f6;
  display: flex;
  gap: 8px;
  background: #fafafa;
}

/* 空状态 */
.el-empty {
  grid-column: 1 / -1;
  padding: 60px 0;
}
</style>
