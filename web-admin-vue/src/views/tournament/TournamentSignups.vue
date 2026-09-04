<template>
  <div class="tournament-signups">
    <el-page-header @back="$router.push('/tournament-space')" title="返回赛事空间">
      <template #content>
        <span style="font-size: 18px;">报名审核 - {{ tournament.name || '赛事' }}</span>
      </template>
    </el-page-header>

    <div class="page-card" style="margin-top: 20px;">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="待审核" name="pending">
          <el-badge :value="pendingSignups.length" type="warning" />
        </el-tab-pane>
        <el-tab-pane label="待确认" name="invited">
          <el-badge :value="invitedSignups.length" type="info" />
        </el-tab-pane>
        <el-tab-pane label="已通过" name="approved" />
        <el-tab-pane label="已拒绝" name="rejected" />
      </el-tabs>

      <el-table :data="filteredSignups" v-loading="loading" style="width: 100%" :empty-text="'暂无' + tabLabels[activeTab] + '记录'">
        <el-table-column label="球队名称" min-width="160">
          <template #default="{ row }">{{ row.teamName || '-' }}</template>
        </el-table-column>
        <el-table-column label="报名人数" width="100" align="center">
          <template #default="{ row }">{{ row.playerCount || 0 }}</template>
        </el-table-column>
        <el-table-column label="类型" width="100" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.status === 'invited'" type="info" size="small">邀请</el-tag>
            <el-tag v-else type="primary" size="small">报名</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="180">
          <template #default="{ row }">{{ formatTime(row.createTime || row.inviteTime) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" size="small">
              {{ statusLabels[row.status] || row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <template v-if="row.status === 'pending'">
              <el-button type="success" size="small" @click="approveSignup(row)">通过</el-button>
              <el-button type="danger" size="small" @click="rejectSignup(row)">拒绝</el-button>
            </template>
            <template v-else-if="row.status === 'invited'">
              <span style="color: #909399; font-size: 13px;">等待球队确认</span>
              <el-button type="danger" size="small" link @click="cancelInvite(row)">取消</el-button>
            </template>
            <template v-else>
              <span style="color: #909399; font-size: 13px;">已处理</span>
            </template>
          </template>
        </el-table-column>
      </el-table>

      <!-- 批量操作 -->
      <div v-if="activeTab === 'pending' && pendingSignups.length > 0" style="margin-top: 16px;">
        <el-button type="success" @click="batchApprove">全部通过 ({{ pendingSignups.length }})</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { queryById, queryList, updateRecord, deleteRecord } from '../../utils/cloud'

const route = useRoute()
const tournamentId = route.params.id

const tournament = ref({})
const signups = ref([])
const loading = ref(false)
const activeTab = ref('pending')

const tabLabels = { pending: '待审核', invited: '待确认', approved: '已通过', rejected: '已拒绝' }
const statusLabels = { pending: '待审核', invited: '已邀请', approved: '已通过', rejected: '已拒绝' }

const statusTypes = {
  pending: 'warning',
  invited: 'info',
  approved: 'success',
  rejected: 'danger'
}

const filteredSignups = computed(() => {
  return signups.value.filter(s => s.status === activeTab.value)
})

const pendingSignups = computed(() => {
  return signups.value.filter(s => s.status === 'pending')
})

const invitedSignups = computed(() => {
  return signups.value.filter(s => s.status === 'invited')
})

function getStatusType(status) {
  return statusTypes[status] || 'info'
}

function formatTime(time) {
  if (!time) return '-'
  const d = new Date(time)
  return isNaN(d.getTime()) ? '-' : d.toLocaleString('zh-CN')
}

async function approveSignup(row) {
  try {
    await updateRecord('tournament_teams', row._id, { status: 'approved' })
    ElMessage.success('已通过')
    loadSignups()
  } catch (err) {
    ElMessage.error('操作失败')
  }
}

async function rejectSignup(row) {
  try {
    await updateRecord('tournament_teams', row._id, { status: 'rejected' })
    ElMessage.success('已拒绝')
    loadSignups()
  } catch (err) {
    ElMessage.error('操作失败')
  }
}

async function batchApprove() {
  try {
    await ElMessageBox.confirm(`确定通过全部 ${pendingSignups.value.length} 支球队的报名吗？`, '批量审核', { type: 'info' })
    for (const signup of pendingSignups.value) {
      await updateRecord('tournament_teams', signup._id, { status: 'approved' })
    }
    ElMessage.success('批量审核完成')
    loadSignups()
  } catch (err) {
    if (err !== 'cancel') ElMessage.error('操作失败')
  }
}

// 取消邀请
async function cancelInvite(row) {
  try {
    await ElMessageBox.confirm(`确定取消对「${row.teamName}」的邀请吗？`, '确认取消')
    await deleteRecord('tournament_teams', row._id)
    ElMessage.success('已取消邀请')
    loadSignups()
  } catch (err) {
    if (err !== 'cancel') ElMessage.error('操作失败')
  }
}

async function loadTournament() {
  try {
    tournament.value = await queryById('tournaments', tournamentId)
  } catch (err) {
    console.error('加载赛事失败:', err)
  }
}

async function loadSignups() {
  loading.value = true
  try {
    signups.value = await queryList('tournament_teams', {
      where: { tournamentId },
      orderBy: { createTime: 'desc' }
    })
  } catch (err) {
    console.error('加载报名列表失败:', err)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadTournament()
  loadSignups()
})
</script>
