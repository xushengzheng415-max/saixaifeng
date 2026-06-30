<template>
  <div class="roster-change-review">
    <el-page-header @back="$router.push('/tournaments/' + tournamentId)" title="返回赛事详情">
      <template #content>
        <span style="font-size: 18px;">换人申请审核</span>
      </template>
    </el-page-header>

    <div class="page-card" style="margin-top: 20px;">
      <!-- 状态筛选 Tab -->
      <el-tabs v-model="activeStatus" @tab-change="loadList">
        <el-tab-pane label="待审核" name="pending" />
        <el-tab-pane label="已通过" name="approved" />
        <el-tab-pane label="已拒绝" name="rejected" />
        <el-tab-pane label="全部" name="all" />
      </el-tabs>

      <el-table :data="requestList" v-loading="loading" style="width: 100%;" stripe>
        <el-table-column label="球队" prop="teamName" width="160" />
        <el-table-column label="换出球员" width="140">
          <template #default="{ row }">
            <div class="player-cell">
              <span class="player-out">↩ {{ row.outPlayerName }}</span>
              <span class="player-num" v-if="row.outPlayerNumber">#{{ row.outPlayerNumber }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="换入球员" width="140">
          <template #default="{ row }">
            <div class="player-cell">
              <span class="player-in">↪ {{ row.inPlayerName }}</span>
              <span class="player-num" v-if="row.inPlayerNumber">#{{ row.inPlayerNumber }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="换人原因" width="140">
          <template #default="{ row }">
            <el-tag size="small" :type="reasonTagType(row.reason)">{{ reasonLabel(row.reason) }}</el-tag>
            <div class="reason-text-detail" v-if="row.reason === 'other' && row.reasonText">
              {{ row.reasonText }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="申请时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.applyTime) }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <template v-if="row.status === 'pending'">
              <el-button type="success" size="small" @click="openReviewDialog(row, 'approve')">通过</el-button>
              <el-button type="danger" size="small" @click="openReviewDialog(row, 'reject')">拒绝</el-button>
            </template>
            <span v-else class="reviewed-text">
              {{ row.approveTime ? formatTime(row.approveTime) : '已处理' }}
            </span>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!loading && requestList.length === 0" description="暂无换人申请" />
    </div>

    <!-- 审核弹窗 -->
    <el-dialog v-model="reviewDialogVisible" :title="reviewDialogTitle" width="560px" :close-on-click-modal="false">
      <div class="review-detail" v-if="currentRequest">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="球队">{{ currentRequest.teamName }}</el-descriptions-item>
          <el-descriptions-item label="换出球员">
            {{ currentRequest.outPlayerName }}
            <span v-if="currentRequest.outPlayerNumber" class="num-badge">#{{ currentRequest.outPlayerNumber }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="换入球员">
            {{ currentRequest.inPlayerName }}
            <span v-if="currentRequest.inPlayerNumber" class="num-badge">#{{ currentRequest.inPlayerNumber }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="换人原因">
            {{ reasonLabel(currentRequest.reason) }}
            <span v-if="currentRequest.reason === 'other' && currentRequest.reasonText" class="reason-text-detail">
              （{{ currentRequest.reasonText }}）
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="申请时间">{{ formatTime(currentRequest.applyTime) }}</el-descriptions-item>
        </el-descriptions>

        <el-form-item label="审核备注" style="margin-top: 20px;">
          <el-input
            v-model="reviewNote"
            type="textarea"
            :rows="3"
            :placeholder="reviewAction === 'approve' ? '审核备注（可选）' : '请输入拒绝理由'"
          />
        </el-form-item>
      </div>

      <template #footer>
        <el-button @click="reviewDialogVisible = false">取消</el-button>
        <el-button
          :type="reviewAction === 'approve' ? 'success' : 'danger'"
          :loading="submitting"
          @click="submitReview"
        >
          {{ reviewAction === 'approve' ? '确认通过' : '确认拒绝' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { callFunction } from '../../utils/cloud'

const route = useRoute()
const tournamentId = route.params.id

const loading = ref(false)
const submitting = ref(false)
const activeStatus = ref('pending')
const requestList = ref([])

// 审核弹窗
const reviewDialogVisible = ref(false)
const reviewAction = ref('approve')
const currentRequest = ref(null)
const reviewNote = ref('')

const reviewDialogTitle = computed(() => {
  return reviewAction.value === 'approve' ? '审核通过换人申请' : '拒绝换人申请'
})

// 当前登录用户信息（审核人）
const reviewerId = ref('')
const reviewerName = ref('')

// 加载申请列表
async function loadList() {
  loading.value = true
  try {
    const result = await callFunction('reviewRosterChange', {
      action: 'getList',
      tournamentId: tournamentId,
      status: activeStatus.value
    })
    if (result && result.success) {
      requestList.value = result.data || []
    } else {
      ElMessage.warning(result?.message || '查询失败')
      requestList.value = []
    }
  } catch (err) {
    console.error('[RosterChangeReview] 加载列表失败:', err)
    ElMessage.error('加载失败: ' + (err.message || '未知错误'))
    requestList.value = []
  } finally {
    loading.value = false
  }
}

// 打开审核弹窗
function openReviewDialog(row, action) {
  currentRequest.value = row
  reviewAction.value = action
  reviewNote.value = ''
  reviewDialogVisible.value = true
}

// 提交审核
async function submitReview() {
  if (reviewAction.value === 'reject' && !reviewNote.value.trim()) {
    ElMessage.warning('请输入拒绝理由')
    return
  }

  submitting.value = true
  try {
    const result = await callFunction('reviewRosterChange', {
      action: reviewAction.value,
      requestId: currentRequest.value._id,
      reviewerId: reviewerId.value,
      reviewerName: reviewerName.value,
      reviewNote: reviewNote.value
    })

    if (result && result.success) {
      ElMessage.success(result.message || '操作成功')
      reviewDialogVisible.value = false
      loadList()
    } else {
      ElMessage.error(result?.message || '操作失败')
    }
  } catch (err) {
    console.error('[RosterChangeReview] 审核失败:', err)
    ElMessage.error('操作失败: ' + (err.message || '未知错误'))
  } finally {
    submitting.value = false
  }
}

// 工具函数：原因标签
function reasonLabel(reason) {
  const map = { injury: '伤病', suspension: '停赛', tactical: '战术调整', other: '其他' }
  return map[reason] || reason || '-'
}
function reasonTagType(reason) {
  const map = { injury: 'danger', suspension: 'warning', tactical: 'info', other: '' }
  return map[reason] || ''
}

// 工具函数：状态标签
function statusLabel(status) {
  const map = { pending: '待审核', approved: '已通过', rejected: '已拒绝' }
  return map[status] || status
}
function statusTagType(status) {
  const map = { pending: 'warning', approved: 'success', rejected: 'danger' }
  return map[status] || 'info'
}

// 工具函数：格式化时间
function formatTime(time) {
  if (!time) return '-'
  try {
    let d
    if (typeof time === 'string') {
      d = new Date(time)
    } else if (time.$date) {
      d = new Date(time.$date)
    } else {
      d = new Date(time)
    }
    if (isNaN(d.getTime())) return String(time)
    const pad = (n) => String(n).padStart(2, '0')
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
           ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
  } catch (e) {
    return String(time)
  }
}

onMounted(() => {
  // 读取当前登录用户作为审核人
  try {
    const savedUser = JSON.parse(localStorage.getItem('userInfo') || '{}')
    reviewerId.value = savedUser._id || savedUser.phone || ''
    reviewerName.value = savedUser.name || savedUser.nickname || savedUser.phone || '主办方'
  } catch (e) {
    reviewerName.value = '主办方'
  }
  loadList()
})
</script>

<style scoped>
.player-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.player-out {
  color: #f56c6c;
  font-size: 14px;
}
.player-in {
  color: #67c23a;
  font-size: 14px;
}
.player-num {
  font-size: 12px;
  color: #909399;
}
.reason-text-detail {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}
.reviewed-text {
  font-size: 12px;
  color: #909399;
}
.num-badge {
  display: inline-block;
  background: #f0f0f0;
  color: #666;
  font-size: 12px;
  padding: 1px 8px;
  border-radius: 10px;
  margin-left: 6px;
}
.review-detail {
  padding: 0 4px;
}
</style>
