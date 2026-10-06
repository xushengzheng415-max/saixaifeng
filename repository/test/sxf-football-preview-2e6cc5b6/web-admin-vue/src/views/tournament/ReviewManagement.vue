<template>
  <div class="review-management">
    <div class="page-header">
      <h2>参赛审核管理</h2>

    </div>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <el-select v-model="filterStatus" placeholder="审核状态" clearable @change="loadReviewRequests">
        <el-option label="待审核" value="pending" />
        <el-option label="已批准" value="approved" />
        <el-option label="已拒绝" value="rejected" />
      </el-select>

      <el-select v-model="filterTournament" placeholder="选择赛事" clearable @change="loadReviewRequests">
        <el-option
          v-for="t in tournaments"
          :key="t._id"
          :label="t.name"
          :value="t._id"
        />
      </el-select>

      <el-button type="primary" @click="loadReviewRequests" :loading="loading">
        刷新
      </el-button>
    </div>

    <!-- 审核请求列表 -->
    <div class="review-list" v-loading="loading">
      <el-empty v-if="requests.length === 0" description="暂无审核请求" />

      <div v-for="req in requests" :key="req._id" class="review-card">
        <div class="review-header">
          <div class="review-title">
            <span class="team-name">{{ req.teamName || '未知球队' }}</span>
            <el-tag :type="getStatusType(req.status)" size="small">
              {{ getStatusText(req.status) }}
            </el-tag>
          </div>
          <div class="review-time">
            提交时间：{{ formatTime(req.submitTime) }}
          </div>
        </div>

        <div class="review-body">
          <div class="info-row">
            <span class="label">赛事名称：</span>
            <span class="value">{{ req.tournamentName || '未知赛事' }}</span>
          </div>
          <div class="info-row">
            <span class="label">球队代码：</span>
            <span class="value">{{ req.teamCode || '未设置' }}</span>
          </div>
          <div class="info-row">
            <span class="label">教练手机：</span>
            <span class="value">{{ req.coachPhone || '未绑定' }}</span>
          </div>
          <div class="info-row" v-if="req.reviewTime">
            <span class="label">审核时间：</span>
            <span class="value">{{ formatTime(req.reviewTime) }}</span>
          </div>
          <div class="info-row" v-if="req.reviewerName">
            <span class="label">审核人：</span>
            <span class="value">{{ req.reviewerName }}</span>
          </div>
          <div class="info-row" v-if="req.rejectReason">
            <span class="label">拒绝原因：</span>
            <span class="value reject-reason">{{ req.rejectReason }}</span>
          </div>
        </div>

        <!-- 快照数据预览 -->
        <div class="snapshot-preview" v-if="req.snapshot && Object.keys(req.snapshot).length > 0">
          <div class="snapshot-title">提交数据快照</div>
          <div class="snapshot-content">
            <div v-if="req.snapshot.teamLogo">
              队徽：<img :src="req.snapshot.teamLogo" class="snapshot-logo" />
            </div>
            <div v-if="req.snapshot.players && req.snapshot.players.length > 0">
              球员数量：{{ req.snapshot.players.length }} 人
            </div>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="review-actions" v-if="req.status === 'pending'">
          <el-button type="success" @click="handleApprove(req)" :loading="actionLoading">
            批准
          </el-button>
          <el-button type="danger" @click="handleReject(req)" :loading="actionLoading">
            拒绝
          </el-button>
        </div>
      </div>
    </div>

    <!-- 分页 -->
    <div class="pagination-wrapper" v-if="total > 0">
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        @current-change="handlePageChange"
      />
    </div>

    <!-- 拒绝原因对话框 -->
    <el-dialog v-model="rejectDialogVisible" title="填写拒绝原因" width="500px">
      <el-input
        v-model="rejectReason"
        type="textarea"
        :rows="4"
        placeholder="请输入拒绝原因"
      />
      <template #footer>
        <el-button @click="rejectDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmReject" :loading="actionLoading">
          确认拒绝
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { callFunction } from '../../utils/cloud'

const route = useRoute()
const loading = ref(false)
const actionLoading = ref(false)
const requests = ref([])
const tournaments = ref([])
const filterStatus = ref('')
const filterTournament = ref('')
const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(0)

const rejectDialogVisible = ref(false)
const rejectReason = ref('')
const currentRequest = ref(null)

onMounted(() => {
  loadTournaments()
  loadReviewRequests()
})

/**
 * 加载赛事列表
 */
async function loadTournaments() {
  try {
    const result = await callFunction('getTournaments', { limit: 100, tournamentId:String(route.params.id || '') })
    if (result && result.success) {
      tournaments.value = result.data || []
    }
  } catch (err) {
    console.error('加载赛事列表失败:', err)
  }
}

/**
 * 加载审核请求列表
 */
async function loadReviewRequests() {
  loading.value = true
  try {
    const params = {
      page: currentPage.value - 1,
      limit: pageSize.value
    }

    if (filterStatus.value) {
      params.status = filterStatus.value
    }

    if (filterTournament.value) {
      params.tournamentId = filterTournament.value
    }

    const result = await callFunction('tournamentReview', {
      action: 'getRequests',
      ...params
    })

    if (result && result.success) {
      requests.value = result.data || []
      total.value = result.total || 0
    } else {
      ElMessage.error(result?.error || '加载审核请求失败')
    }
  } catch (err) {
    console.error('加载审核请求失败:', err)
    ElMessage.error('加载审核请求失败：' + (err.message || '网络错误'))
  } finally {
    loading.value = false
  }
}

/**
 * 批准审核请求
 */
async function handleApprove(req) {
  try {
    await ElMessageBox.confirm(
      `确定批准 "${req.teamName}" 的参赛申请吗？`,
      '确认批准',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    actionLoading.value = true

    const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}')

    const result = await callFunction('tournamentReview', {
      action: 'approve',
      requestId: req._id,
      reviewerId: userInfo.uid || '',
      reviewerName: userInfo.userName || '管理员'
    })

    if (result && result.success) {
      ElMessage.success('已批准该参赛申请')
      loadReviewRequests()
    } else {
      ElMessage.error(result?.error || '操作失败')
    }
  } catch (err) {
    if (err !== 'cancel') {
      console.error('批准失败:', err)
      ElMessage.error('操作失败：' + (err.message || '网络错误'))
    }
  } finally {
    actionLoading.value = false
  }
}

/**
 * 拒绝审核请求
 */
function handleReject(req) {
  currentRequest.value = req
  rejectReason.value = ''
  rejectDialogVisible.value = true
}

/**
 * 确认拒绝
 */
async function confirmReject() {
  if (!rejectReason.value.trim()) {
    ElMessage.warning('请输入拒绝原因')
    return
  }

  actionLoading.value = true

  try {
    const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}')

    const result = await callFunction('tournamentReview', {
      action: 'reject',
      requestId: currentRequest.value._id,
      reviewerId: userInfo.uid || '',
      reviewerName: userInfo.userName || '管理员',
      rejectReason: rejectReason.value
    })

    if (result && result.success) {
      ElMessage.success('已拒绝该参赛申请')
      rejectDialogVisible.value = false
      loadReviewRequests()
    } else {
      ElMessage.error(result?.error || '操作失败')
    }
  } catch (err) {
    console.error('拒绝失败:', err)
    ElMessage.error('操作失败：' + (err.message || '网络错误'))
  } finally {
    actionLoading.value = false
  }
}

/**
 * 获取状态标签类型
 */
function getStatusType(status) {
  const map = {
    'pending': 'warning',
    'approved': 'success',
    'rejected': 'danger'
  }
  return map[status] || 'info'
}

/**
 * 获取状态文本
 */
function getStatusText(status) {
  const map = {
    'pending': '待审核',
    'approved': '已批准',
    'rejected': '已拒绝'
  }
  return map[status] || '未知'
}

/**
 * 格式化时间
 */
function formatTime(time) {
  if (!time) return '未知'
  const date = new Date(time)
  if (isNaN(date.getTime())) return '未知'
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * 处理分页变化
 */
function handlePageChange(page) {
  currentPage.value = page
  loadReviewRequests()
}
</script>

<style scoped>
.review-management {
  padding: 20px;
}

.page-header {
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0 0 8px 0;
  font-size: 24px;
  color: #1B5E20;
}

.page-description {
  margin: 0;
  color: #666;
  font-size: 14px;
}

.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  align-items: center;
}

.review-list {
  min-height: 300px;
}

.review-card {
  background: white;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.review-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.review-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.team-name {
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.review-time {
  font-size: 14px;
  color: #999;
}

.review-body {
  margin-bottom: 16px;
}

.info-row {
  margin-bottom: 8px;
  font-size: 14px;
}

.info-row .label {
  color: #666;
  margin-right: 8px;
}

.info-row .value {
  color: #333;
}

.reject-reason {
  color: #f56c6c;
}

.snapshot-preview {
  background: #f9f9f9;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 16px;
}

.snapshot-title {
  font-size: 14px;
  font-weight: 600;
  color: #666;
  margin-bottom: 8px;
}

.snapshot-content {
  font-size: 14px;
  color: #333;
}

.snapshot-logo {
  width: 60px;
  height: 60px;
  object-fit: contain;
  vertical-align: middle;
  margin-left: 8px;
}

.review-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}
</style>
