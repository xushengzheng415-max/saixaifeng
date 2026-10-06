<template>
  <div class="my-tournaments">
    <div class="page-header">
      <h2>{{ pageTitle }}</h2>
      <el-button v-if="isOrganizer" type="primary" @click="goToCreate">
        <el-icon><Plus /></el-icon>创建赛事
      </el-button>
      <el-button v-else-if="isCoach" type="primary" @click="goToTournamentCenter">
        <el-icon><Search /></el-icon>发现赛事
      </el-button>
      <el-button size="small" type="danger" plain @click="cleanupOrphanData">
        <el-icon><Delete /></el-icon>清理无效报名
      </el-button>
    </div>

    <!-- 统计卡片 -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-value">{{ stats.total }}</div>
        <div class="stat-label">{{ isOrganizer ? '创建赛事' : '报名赛事' }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.ongoing }}</div>
        <div class="stat-label">进行中</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.upcoming }}</div>
        <div class="stat-label">即将开始</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.finished }}</div>
        <div class="stat-label">已结束</div>
      </div>
    </div>

    <!-- 赛事列表 -->
    <div v-loading="loading" class="tournament-list">
      <div
        v-for="item in myTournaments"
        :key="item._id"
        class="tournament-card"
      >
        <div class="card-image">
          <!-- 球队LOGO -->
          <img :src="item.teamLogo || item.logo || defaultTeamLogo" :alt="item.teamName || item.name" />
          <!-- 赛事状态 -->
          <div class="card-badge" :class="getStatusClass(item.status)">
            {{ getStatusText(item.status) }}
          </div>
          <!-- 报名状态标签 -->
          <div v-if="isCoach && item.signupStatus" class="signup-badge" :class="item.signupStatus">
            {{ signupStatusText[item.signupStatus] }}
          </div>
        </div>
        <div class="card-content">
          <!-- 球队名称 -->
          <h4 class="card-title">{{ item.teamName || item.name }}</h4>
          <!-- 报名赛事 -->
          <div class="card-tournament-name">
            <el-icon><Trophy /></el-icon>
            <span>{{ item.tournamentName || '未知赛事' }}</span>
          </div>
          <div class="card-meta">
            <span class="meta-item">
              <el-icon><Calendar /></el-icon>
              {{ formatDate(item.startDate) }} - {{ formatDate(item.endDate) }}
            </span>
            <span class="meta-item">
              <el-icon><Location /></el-icon>
              {{ item.city || item.location || '待定' }}
            </span>
          </div>
          <div class="card-tags">
            <el-tag size="small" effect="plain">{{ item.type || '赛会制' }}</el-tag>
            <el-tag size="small" type="warning" effect="plain">{{ item.ageGroup || 'U12' }}</el-tag>
          </div>
          <!-- 主办方操作 -->
          <div v-if="isOrganizer" class="card-actions">
            <el-button type="primary" size="small" @click="goToDetail(item.tournamentId || item._id)">
              管理赛事
            </el-button>
            <el-button size="small" @click="goToEdit(item.tournamentId || item._id)">
              编辑
            </el-button>
            <el-button type="danger" size="small" plain @click="deleteTournament(item)">
              删除
            </el-button>
          </div>
          <!-- 球队操作 -->
          <div v-else-if="isCoach" class="card-actions">
            <el-button type="primary" size="small" @click="goToDetail(item.tournamentId || item._id)">
              查看赛事
            </el-button>
            <el-button
              v-if="item.signupStatus === 'invited'"
              type="success"
              size="small"
              @click="confirmInvite(item)"
            >
              确认参加
            </el-button>
            <el-button
              v-else-if="item.signupStatus === 'approved'"
              type="warning"
              size="small"
              plain
              @click="requestCancel(item)"
            >
              申请撤销报名
            </el-button>
            <el-tag v-else-if="item.signupStatus === 'pending'" type="warning" size="small">审核中</el-tag>
            <el-tag v-else-if="item.signupStatus === 'cancel_requested'" type="info" size="small">撤销申请中</el-tag>
            <el-tag v-else-if="item.signupStatus === 'rejected'" type="danger" size="small">已拒绝</el-tag>
          </div>
        </div>
      </div>
    </div>

    <el-empty v-if="!loading && myTournaments.length === 0" :description="emptyText" />

    <!-- 分页 -->
    <div v-if="myTournaments.length > 0" class="pagination-wrapper">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :total="total"
        layout="prev, pager, next"
        @current-change="handlePageChange"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Calendar, Location, Search, Trophy, Message, Delete } from '@element-plus/icons-vue'
import { queryList, deleteRecord as deleteTournamentApi, updateRecord, callFunction } from '../../utils/cloud'

const router = useRouter()
const defaultTeamLogo = `${import.meta.env.BASE_URL}organization-logo-placeholder.svg`
const loading = ref(false)
const myTournaments = ref([])
const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(0)

// 当前角色
const currentRole = ref((localStorage.getItem('currentRole') || localStorage.getItem('role') || 'ORGANIZER').toUpperCase())
const isOrganizer = computed(() => currentRole.value === 'ORGANIZER')
const isCoach = computed(() => currentRole.value === 'COACH')

// 页面标题
const pageTitle = computed(() => isOrganizer.value ? '我的赛事' : '我的报名')
const emptyText = computed(() => isOrganizer.value ? '您还没有创建任何赛事' : '您还没有报名任何赛事')

// 报名状态文本
const signupStatusText = {
  pending: '审核中',
  approved: '已通过',
  rejected: '已拒绝',
  invited: '待确认',
  cancel_requested: '撤销申请中'
}

// 统计数据
const stats = computed(() => {
  return {
    total: myTournaments.value.length,
    ongoing: myTournaments.value.filter(t => t.status === 'ongoing').length,
    upcoming: myTournaments.value.filter(t => t.status === 'upcoming' || t.status === 'registering').length,
    finished: myTournaments.value.filter(t => t.status === 'finished').length
  }
})

// 加载赛事
async function loadMyTournaments() {
  loading.value = true
  try {
    const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}')

    if (isOrganizer.value) {
      // 主办方：查询我创建的赛事
      const result = await queryList('tournaments', {
        where: { creatorId: userInfo.uid || userInfo._id },
        orderBy: { createTime: 'desc' },
        limit: pageSize.value,
        skip: (currentPage.value - 1) * pageSize.value
      })
      myTournaments.value = result || []
    } else {
      // 球队：查询我报名的赛事
      await loadCoachTournaments(userInfo)
    }
    total.value = myTournaments.value.length
  } catch (err) {
    console.error('加载赛事失败:', err)
    ElMessage.error('加载赛事失败')
  } finally {
    loading.value = false
  }
}

// 球队角色：加载报名的赛事（以球队为单位，每只球队单独一张卡片）
async function loadCoachTournaments(userInfo) {
  // 1. 获取我的球队
  const teamsData = await queryList('teams', {
    limit: 100,
    where: {}
  })

  if (!teamsData || teamsData.length === 0) {
    myTournaments.value = []
    return
  }

  const teamIds = teamsData.map(t => t._id)
  const teamMap = {}
  teamsData.forEach(t => { teamMap[t._id] = t })

  // 2. 查询 tournament_teams 关联记录
  const signupData = await queryList('tournament_teams', {
    where: {
      teamId: { $in: teamIds }
    },
    orderBy: { createTime: 'desc' }
  })

  if (!signupData || signupData.length === 0) {
    myTournaments.value = []
    return
  }

  // 3. 获取赛事详情
  const tournamentIds = [...new Set(signupData.map(s => s.tournamentId))]
  const tournamentsData = await queryList('tournaments', {
    where: { _id: { $in: tournamentIds } }
  })
  const tournamentMap = {}
  tournamentsData.forEach(t => { tournamentMap[t._id] = t })

  // 4. 构建列表：每个 signup 记录对应一张球队卡片
  const result = signupData.map(signup => {
    const tournament = tournamentMap[signup.tournamentId] || {}
    const team = teamMap[signup.teamId] || {}
    return {
      _id: signup._id,
      teamId: team._id,
      teamName: team.name || signup.teamName,
      teamLogo: team.logo || team.logoUrl,
      tournamentId: tournament._id,
      tournamentName: tournament.name,
      // 兼容原有字段（卡片展示用）
      name: team.name || signup.teamName,
      logo: team.logo || team.logoUrl,
      startDate: tournament.startDate,
      endDate: tournament.endDate,
      status: tournament.status,
      type: tournament.type,
      ageGroup: tournament.ageGroup,
      city: tournament.city || tournament.location,
      registeredTeams: tournament.registeredTeams,
      totalMatches: tournament.totalMatches,
      totalPlayers: tournament.totalPlayers,
      // 报名状态
      signupStatus: signup.status,
      signupId: signup._id,
      signupTime: signup.createTime
    }
  })

  myTournaments.value = result
}

// 创建赛事
function goToCreate() {
  router.push('/tournaments/create')
}

// 跳转到赛事中心
function goToTournamentCenter() {
  router.push('/tournament-center')
}

// 确认邀请
async function confirmInvite(item) {
  try {
    await updateRecord('tournament_teams', item.signupId, {
      status: 'approved',
      updateTime: new Date()
    })
    ElMessage.success('已确认参加')
    loadMyTournaments()
  } catch (err) {
    console.error('确认邀请失败:', err)
    ElMessage.error('确认失败')
  }
}

// 申请撤销报名
async function requestCancel(item) {
  try {
    await ElMessageBox.confirm(
      `确定要申请撤销「${item.teamName || item.name}」对「${item.tournamentName}」的报名吗？\n\n主办方审核通过后会正式撤销。`,
      '申请撤销报名',
      {
        confirmButtonText: '提交申请',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    await updateRecord('tournament_teams', item.signupId, {
      status: 'cancel_requested',
      cancelRequestTime: new Date(),
      updateTime: new Date()
    })
    ElMessage.success('撤销申请已提交，请等待主办方审核')
    loadMyTournaments()
  } catch (err) {
    if (err !== 'cancel') {
      console.error('申请撤销失败:', err)
      ElMessage.error('申请失败')
    }
  }
}

// 查看详情
function goToDetail(id) {
  router.push(`/tournaments/${id}`)
}

// 编辑赛事
function goToEdit(id) {
  router.push(`/tournaments/${id}/edit`)
}

// 删除赛事
async function deleteTournament(tournament) {
  try {
    await ElMessageBox.confirm(
      `确定要删除赛事 "${tournament.name}" 吗？此操作不可恢复！`,
      '确认删除',
      {
        confirmButtonText: '确定删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    const result = await deleteTournamentApi(tournament._id)
    if (result.success) {
      ElMessage.success('删除成功')
      loadMyTournaments()
    } else {
      ElMessage.error(result.error || '删除失败')
    }
  } catch (err) {
    if (err !== 'cancel') {
      console.error('删除失败:', err)
      ElMessage.error('删除失败')
    }
  }
}

// 分页变化
function handlePageChange(page) {
  currentPage.value = page
  loadMyTournaments()
}

// 获取状态文本
function getStatusText(status) {
  const statusMap = {
    'registering': '报名中',
    'ongoing': '进行中',
    'finished': '已结束',
    'upcoming': '即将开始',
    'draft': '草稿'
  }
  return statusMap[status] || '未知'
}

// 获取状态样式
function getStatusClass(status) {
  const classMap = {
    'registering': 'status-registering',
    'ongoing': 'status-ongoing',
    'finished': 'status-finished',
    'upcoming': 'status-upcoming',
    'draft': 'status-draft'
  }
  return classMap[status] || 'status-registering'
}

// 格式化日期
function formatDate(date) {
  if (!date) return '待定'
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 清理孤立数据
async function cleanupOrphanData() {
  try {
    let teamFilter = null

    // 球队身份：只清理自己球队的无效报名
    if (isCoach.value) {
      const teamsData = await queryList('teams', { limit: 100, where: {} })
      if (!teamsData || teamsData.length === 0) {
        ElMessage.warning('您还没有创建球队')
        return
      }
      teamFilter = teamsData.map(t => t._id)
    }

    // 第一步：预览模式
    loading.value = true
    const preview = await callFunction('cleanupOrphanTournamentTeams', {
      dryRun: true,
      teamFilter: teamFilter
    })
    loading.value = false

    if (!preview.success) {
      ElMessage.error(preview.message || '预览失败')
      return
    }

    if (preview.orphanCount === 0) {
      ElMessage.success('没有发现无效报名记录，数据很干净！')
      return
    }

    // 显示预览结果
    const detailList = preview.orphanRecords.map(r =>
      `- ${r.teamName || '未知球队'} (状态: ${r.status}, 记录ID: ${r._id})`
    ).join('\n')

    const scopeText = isCoach.value ? '（仅您自己的球队）' : '（全部赛事）'
    const confirmText = `发现 ${preview.orphanCount} 条无效报名记录${scopeText}：\n\n${detailList}\n\n是否删除这些记录？`

    try {
      await ElMessageBox.confirm(confirmText, '确认删除无效报名', {
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
        type: 'warning',
        dangerouslyUseHTMLString: false
      })
    } catch (e) {
      return // 用户取消
    }

    // 第二步：实际删除
    loading.value = true
    const result = await callFunction('cleanupOrphanTournamentTeams', {
      dryRun: false,
      teamFilter: teamFilter
    })
    loading.value = false

    if (result.success) {
      ElMessage.success(`已删除 ${result.deletedCount} 条无效报名记录`)
      loadMyTournaments()
    } else {
      ElMessage.error(result.message || '删除失败')
    }
  } catch (err) {
    loading.value = false
    console.error('清理失败:', err)
    ElMessage.error('清理失败: ' + (err.message || '未知错误'))
  }
}

onMounted(() => {
  loadMyTournaments()
})
</script>

<style scoped>
.my-tournaments {
  padding: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #303133;
}

/* 统计卡片 */
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  background: #fff;
  padding: 20px;
  border-radius: 12px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.stat-value {
  font-size: 32px;
  font-weight: 700;
  color: #2E7D32;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 14px;
  color: #909399;
}

/* 赛事列表 */
.tournament-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 20px;
}

.tournament-card {
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transition: all 0.3s;
}

.tournament-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.card-image {
  position: relative;
  height: 160px;
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

.signup-badge {
  position: absolute;
  top: 12px;
  left: 12px;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  color: #fff;
}

.signup-badge.pending { background: #E6A23C; }
.signup-badge.approved { background: #67C23A; }
.signup-badge.rejected { background: #F56C6C; }
.signup-badge.invited { background: #409EFF; }
.signup-badge.cancel_requested { background: #E6A23C; }

.status-registering { background: #67C23A; }
.status-ongoing { background: #409EFF; }
.status-finished { background: #909399; }
.status-upcoming { background: #E6A23C; }
.status-draft { background: #606266; }

.card-content {
  padding: 16px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 8px 0;
}

.card-tournament-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: #409eff;
  font-weight: 500;
  margin-bottom: 12px;
  padding: 6px 10px;
  background: #ecf5ff;
  border-radius: 6px;
}

.card-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #606266;
}

.card-tags {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.card-stats {
  display: flex;
  justify-content: space-around;
  padding: 12px 0;
  border-top: 1px solid #ebeef5;
  border-bottom: 1px solid #ebeef5;
  margin-bottom: 16px;
}

.stat-item {
  text-align: center;
}

.stat-num {
  display: block;
  font-size: 20px;
  font-weight: 600;
  color: #303133;
}

.stat-text {
  font-size: 12px;
  color: #909399;
}

.card-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 32px;
}
</style>
