<template>
  <div class="dashboard">
    <!-- 统计卡片 -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-icon" style="background: #e8f5e9; color: #2E7D32;">
          <el-icon :size="28"><Trophy /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-label">赛事总数</div>
          <div class="stat-value">{{ stats.tournaments }}</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon" style="background: #e3f2fd; color: #1976D2;">
          <el-icon :size="28"><UserFilled /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-label">球队总数</div>
          <div class="stat-value">{{ stats.teams }}</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon" style="background: #fff3e0; color: #E65100;">
          <el-icon :size="28"><User /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-label">球员总数</div>
          <div class="stat-value">{{ stats.players }}</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon" style="background: #fce4ec; color: #c62828;">
          <el-icon :size="28"><SetUp /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-label">裁判总数</div>
          <div class="stat-value">{{ stats.referees }}</div>
        </div>
      </div>
    </div>

    <!-- 测试数据管理 -->
    <div class="page-card" style="margin-bottom: 24px;">
      <div class="page-header">
        <h2>测试数据管理</h2>
        <div style="display: flex; gap: 12px;">
          <el-button type="primary" @click="generateTestData" :loading="generating" size="small">
            生成测试数据
          </el-button>
          <el-button type="danger" @click="clearAllData" :loading="clearing" size="small">
            清空所有数据
          </el-button>
        </div>
      </div>
      <div style="color: #909399; font-size: 13px; margin-top: 8px;">
        ⚠️ 清空操作不可恢复，请谨慎操作！
      </div>
    </div>

    <!-- 待处理事项 -->
    <div class="page-card" style="margin-bottom: 24px;">
      <div class="page-header">
        <h2>待处理事项</h2>
      </div>
      <el-table :data="pendingItems" style="width: 100%" empty-text="暂无待处理事项">
        <el-table-column prop="type" label="类型" width="120">
          <template #default="{ row }">
            <el-tag :type="row.tagType" size="small">{{ row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="content" label="内容" />
        <el-table-column prop="time" label="时间" width="180" />
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="handlePending(row)">处理</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 最近赛事 -->
    <div class="page-card">
      <div class="page-header">
        <h2>最近赛事</h2>
        <el-button type="primary" size="small" @click="$router.push('/tournaments')">查看全部</el-button>
      </div>
      <el-table :data="recentTournaments" style="width: 100%" empty-text="暂无赛事数据">
        <el-table-column prop="name" label="赛事名称" min-width="200" />
        <el-table-column prop="typeName" label="赛制" width="100">
          <template #default="{ row }">
            <el-tag
              :type="row.type === 'tournament' ? 'success' : row.type === 'cup' ? 'warning' : row.type === 'league' ? '' : 'danger'"
              size="small"
            >
              {{ row.typeName || getScheduleTypeName(row.type) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <span :class="['status-tag', row.status]">{{ getStatusLabel(row.status) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="参赛球队" width="120">
          <template #default="{ row }">
            {{ row.registeredTeams || 0 }} / {{ row.maxTeams || 0 }}
          </template>
        </el-table-column>
        <el-table-column prop="startDate" label="开始时间" width="140" />
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Trophy, User, UserFilled, SetUp } from '@element-plus/icons-vue'
import { countRecords, queryList, callFunction } from '../../utils/cloud'
import { ElMessage, ElMessageBox } from 'element-plus'

const router = useRouter()

const stats = ref({
  tournaments: 0,
  teams: 0,
  players: 0,
  referees: 0
})

const recentTournaments = ref([])
const pendingItems = ref([])
const generating = ref(false)
const clearing = ref(false)

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

function getScheduleTypeName(type) {
  return scheduleTypeNames[type] || type || '-'
}

function getStatusLabel(status) {
  return statusLabels[status] || status || '-'
}

function handlePending(row) {
  if (row.route) {
    router.push(row.route)
  }
}

// 生成测试数据
async function generateTestData() {
  try {
    generating.value = true
    const result = await callFunction('generateTestData', {
      action: 'generateAll',
      tournamentCount: 1,
      teamCount: 4
    })
    
    if (result.success) {
      ElMessage.success(result.message)
      loadData() // 刷新数据
    } else {
      ElMessage.error(result.message || '生成失败')
    }
  } catch (err) {
    ElMessage.error('生成失败: ' + err.message)
  } finally {
    generating.value = false
  }
}

// 清空所有数据
async function clearAllData() {
  try {
    await ElMessageBox.confirm(
      '此操作将清空所有数据（赛事、球队、球员、比赛等），清空后不可恢复！',
      '警告',
      {
        confirmButtonText: '确认清空',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger'
      }
    )
    
    clearing.value = true
    const result = await callFunction('clearDatabase')
    
    if (result.success) {
      ElMessage.success(result.message)
      loadData() // 刷新数据
    } else {
      ElMessage.error(result.message || '清空失败')
    }
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error('清空失败: ' + (err.message || err))
    }
  } finally {
    clearing.value = false
  }
}

async function loadData() {
  try {
    const [tournaments, teams, players, referees] = await Promise.all([
      countRecords('tournaments'),
      countRecords('teams'),
      countRecords('players'),
      countRecords('management')
    ])

    stats.value = { tournaments, teams, players, referees }

    // 加载待审核报名
    const pendingCount = await countRecords('tournament_teams', { status: 'pending' })
    if (pendingCount > 0) {
      pendingItems.value = [
        {
          type: '报名审核',
          tagType: 'warning',
          content: `${pendingCount} 支球队待审核`,
          time: '刚刚',
          route: '/tournaments'
        }
      ]
    }

    // 加载最近赛事
    const tournamentsList = await queryList('tournaments', {
      orderBy: { createTime: 'desc' },
      limit: 5
    })
    recentTournaments.value = tournamentsList
  } catch (err) {
    console.error('加载仪表板数据失败:', err)
  }
}

onMounted(() => {
  loadData()
})
</script>
