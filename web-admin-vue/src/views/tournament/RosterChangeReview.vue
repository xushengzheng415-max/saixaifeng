<template>
  <div class="roster-change-review" v-loading="loading">
    <header class="change-context-header">
      <div class="context-event"><img :src="brandLogo" alt="赛事徽标" /><strong>{{ tournament.name || '当前赛事' }}</strong><el-tag type="primary" effect="plain">{{ tournament.divisions?.length || 1 }}个组别</el-tag><el-tag type="success" effect="plain">进行中</el-tag><span class="context-divider"></span><span class="context-meta"><el-icon><Calendar /></el-icon>{{ tournamentDateRange }}</span><span class="context-meta"><el-icon><Location /></el-icon>{{ tournament.province || '赛事地点待定' }}</span></div>
      <el-button type="success" plain @click="router.push('/tournament-space')">退出赛事空间</el-button>
    </header>

    <main class="change-page">
      <div class="change-title"><h1>球队管理</h1><div class="division-control"><span>当前组别</span><el-select v-model="divisionId" placeholder="选择组别" @change="loadList"><el-option v-for="division in tournament.divisions || []" :key="division.id || division._id" :label="division.name" :value="division.id || division._id" /></el-select></div></div>
      <nav class="change-tabs"><span @click="goTeams">参赛球队</span><span @click="goPending">加入申请</span><span @click="goRoster">参赛名单</span><span @click="goExceptions">名单异常</span><strong>名单变更 <em>{{ requestList.length }}</em></strong></nav>

      <section class="change-stats">
        <article><i class="blue">▣</i><div><span>赛事名单</span><strong>{{ rosterLocked ? '已锁定' : '可变更' }}</strong></div></article>
        <article><i class="orange">◷</i><div><span>历史申请</span><strong>{{ requestList.length }}<small> 项</small></strong></div></article>
        <article><i class="green">✓</i><div><span>已通过</span><strong>{{ changeCounts.approved }}<small> 项</small></strong></div></article>
        <article><i class="red">×</i><div><span>已驳回</span><strong>{{ changeCounts.rejected }}<small> 项</small></strong></div></article>
      </section>

      <el-alert class="lock-note" type="info" :closable="false" show-icon :title="deadlineNotice" />

      <section class="change-filter-row">
        <el-input v-model="teamKeyword" placeholder="球队" clearable />
        <el-select v-model="typeFilter" placeholder="全部类型" clearable><el-option label="新增球员" value="add" /><el-option label="移除球员" value="remove" /><el-option label="替换球员" value="replace" /></el-select>
        <el-select v-model="activeStatus" placeholder="全部状态" clearable><el-option label="待审核" value="pending" /><el-option label="已通过" value="approved" /><el-option label="已驳回" value="rejected" /></el-select>
        <el-date-picker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" />
        <el-select v-model="reviewerFilter" placeholder="全部处理人" clearable><el-option v-for="name in reviewerOptions" :key="name" :label="name" :value="name" /></el-select>
        <span class="filter-spacer"></span>
        <el-button type="success" plain @click="exportChanges">导出记录</el-button>
        <el-button type="success" plain @click="rulesVisible = true">变更规则</el-button>
      </section>

      <section class="change-table-wrap">
        <h2>历史名单变更记录</h2>
        <table v-if="filteredRequests.length" class="change-table"><thead><tr><th class="select-col"><el-checkbox /></th><th>申请编号</th><th>申请球队</th><th>变更类型</th><th>涉及球员</th><th>变更前</th><th>变更后</th><th>申请原因</th><th>提交时间</th><th>处理人</th><th>处理结果</th><th>操作</th></tr></thead><tbody><tr v-for="row in filteredRequests" :key="row._id"><td><el-checkbox /></td><td>{{ row.requestNo || `RQ${String(row._id || '').slice(-10).toUpperCase()}` }}</td><td>{{ row.teamName }}</td><td><el-tag :type="changeTypeTag(row)">{{ changeTypeLabel(row) }}</el-tag></td><td>{{ row.inPlayerName || row.outPlayerName || '—' }}</td><td>{{ row.outPlayerName || '—' }}<small v-if="row.outPlayerNumber">（#{{ row.outPlayerNumber }}）</small></td><td>{{ row.inPlayerName || '—' }}<small v-if="row.inPlayerNumber">（#{{ row.inPlayerNumber }}）</small></td><td>{{ row.reasonText || reasonLabel(row.reason) }}</td><td>{{ formatTime(row.applyTime) }}</td><td>{{ row.reviewerName || '—' }}</td><td><el-tag :type="statusTagType(row.status)" effect="plain">{{ statusLabel(row.status) }}</el-tag></td><td><template v-if="row.status === 'pending'"><el-button link type="success" @click="openReviewDialog(row, 'approve')">通过</el-button><el-button link type="danger" @click="openReviewDialog(row, 'reject')">驳回</el-button></template><el-button v-else link type="primary" @click="openReviewDialog(row, row.status === 'approved' ? 'approve' : 'reject')">查看记录</el-button></td></tr></tbody></table><el-empty v-else-if="!loading" description="暂无名单变更记录" />
      </section>

      <el-alert class="change-footer-note" type="success" :closable="false" show-icon title="球员变更仅限报名截止前；截止后特殊纠错需由主办方异常处理并完整留痕。" />
    </main>

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
          v-if="currentRequest?.status === 'pending'"
          :type="reviewAction === 'approve' ? 'success' : 'danger'"
          :loading="submitting"
          @click="submitReview"
        >
          {{ reviewAction === 'approve' ? '确认通过' : '确认拒绝' }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="rulesVisible" title="赛事名单变更规则" width="560px">
      <el-alert type="warning" :closable="false" show-icon title="赛事名单锁定后，普通流程不允许新增、移除或替换球员。" />
      <ul class="rule-list"><li>变更仅作用于当前赛事名单快照，不修改球队日常球员库。</li><li>主办方审核通过后生成新版本，并保留变更前后记录。</li><li>实名或资料纠错请从名单异常入口处理，不作为常规名单变更。</li></ul>
      <template #footer><el-button type="primary" @click="rulesVisible = false">我知道了</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Calendar, Location } from '@element-plus/icons-vue'
import { callFunction, queryById } from '../../utils/cloud'
import { getVisualQaSnapshot, visualQaActive } from '../../utils/visualQaFixtures'
import brandLogo from '../../assets/logo-saixiaofeng.png'

const route = useRoute()
const router = useRouter()
const tournamentId = route.params.id
const visualQaSnapshot = typeof window !== 'undefined' && window.location.hostname === '127.0.0.1' && visualQaActive() ? getVisualQaSnapshot() : null
const visualQaChanges = visualQaSnapshot ? [
  { _id: 'qa-change-1', requestNo: 'RQ20260729001', tournamentId, divisionId: 'qa-division-u16', teamName: '郑州劲风U16', outPlayerName: '赵晨', outPlayerNumber: 7, inPlayerName: '周航', inPlayerNumber: 18, reason: 'injury', reasonText: '伤病替换', status: 'pending', applyTime: '2026-07-29T09:10:00+08:00' },
  { _id: 'qa-change-2', requestNo: 'RQ20260728002', tournamentId, divisionId: 'qa-division-u16', teamName: '洛阳龙门U16', outPlayerName: '孙博', outPlayerNumber: 11, inPlayerName: '高远', inPlayerNumber: 16, reason: 'profile_error', reasonText: '资料纠错', status: 'approved', reviewerName: '赛事管理员', applyTime: '2026-07-28T14:30:00+08:00' }
] : []

const loading = ref(false)
const submitting = ref(false)
const activeStatus = ref('')
const requestList = ref(visualQaChanges)
const tournament = ref(visualQaSnapshot?.tournament || {})
const divisionId = ref(String(route.query.divisionId || ''))
const teamKeyword = ref('')
const typeFilter = ref('')
const reviewerFilter = ref('')
const dateRange = ref([])
const rulesVisible = ref(false)
const rosterLocked = computed(() => tournament.value.rosterLocked === true || Boolean(tournament.value.registrationDeadline && new Date(tournament.value.registrationDeadline) < new Date()))
const changeCounts = computed(() => requestList.value.reduce((counts, item) => { if (item.status === 'approved') counts.approved += 1; if (item.status === 'rejected') counts.rejected += 1; return counts }, { approved: 0, rejected: 0 }))
const reviewerOptions = computed(() => [...new Set(requestList.value.map(item => item.reviewerName).filter(Boolean))])
const tournamentDateRange = computed(() => tournament.value.startDate && tournament.value.endDate ? `${tournament.value.startDate.replaceAll('-', '.')}—${tournament.value.endDate.replaceAll('-', '.')}` : '赛期待定')
const filteredRequests = computed(() => requestList.value.filter(item => {
  const keyword = teamKeyword.value.trim().toLowerCase()
  const text = `${item.teamName || ''} ${item.requestNo || ''} ${item._id || ''}`.toLowerCase()
  const date = String(item.applyTime || '').slice(0, 10)
  const inDateRange = !dateRange.value.length || (date >= dateRange.value[0] && date <= dateRange.value[1])
  return (!divisionId.value || item.divisionId === divisionId.value) && (!activeStatus.value || item.status === activeStatus.value) && (!typeFilter.value || changeType(item) === typeFilter.value) && (!reviewerFilter.value || item.reviewerName === reviewerFilter.value) && inDateRange && (!keyword || text.includes(keyword))
}))
const deadlineNotice = computed(() => tournament.value.registrationDeadline
  ? `本组报名已于 ${formatTime(tournament.value.registrationDeadline)} 截止；赛事参赛名单${rosterLocked.value ? '已锁定，普通流程不再允许新增、移除或替换球员。' : '仍可按规则提交变更。'}`
  : '报名截止时间尚未设置；名单变更仍需主办方审核并保留完整版本记录。')

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
      status: 'all'
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

function changeType(row) {
  if (row.changeType) return row.changeType
  if (row.inPlayerName && row.outPlayerName) return 'replace'
  if (row.inPlayerName) return 'add'
  return 'remove'
}
function changeTypeLabel(row) { return ({ add: '新增球员', remove: '移除球员', replace: '替换球员' })[changeType(row)] || '名单变更' }
function changeTypeTag(row) { return ({ add: 'success', remove: 'warning', replace: 'primary' })[changeType(row)] || 'info' }
function goTeams() { router.push({ path: `/tournaments/${tournamentId}/teams`, query: divisionId.value ? { divisionId: divisionId.value, mode: 'professional' } : { mode: 'professional' } }) }
function goPending() { router.push({ path: `/tournaments/${tournamentId}/teams`, query: { ...(divisionId.value ? { divisionId: divisionId.value } : {}), mode: 'professional', tab: 'pending' } }) }
function goRoster() { router.push({ path: `/tournaments/${tournamentId}/teams`, query: { ...(divisionId.value ? { divisionId: divisionId.value } : {}), mode: 'professional', tab: 'roster' } }) }
function goExceptions() { router.push({ path: `/tournaments/${tournamentId}/roster-exceptions`, query: divisionId.value ? { divisionId: divisionId.value } : {} }) }

function exportChanges() {
  const header = ['申请编号', '球队', '变更类型', '换出球员', '换入球员', '原因', '提交时间', '处理人', '结果']
  const rows = filteredRequests.value.map(item => [item.requestNo || item._id, item.teamName, changeTypeLabel(item), item.outPlayerName || '', item.inPlayerName || '', item.reasonText || reasonLabel(item.reason), formatTime(item.applyTime), item.reviewerName || '', statusLabel(item.status)])
  const csv = [header, ...rows].map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
  link.download = `${tournament.value.name || '赛事'}-名单变更记录.csv`
  link.click()
  URL.revokeObjectURL(link.href)
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

onMounted(async () => {
  // 读取当前登录用户作为审核人
  try {
    const savedUser = JSON.parse(localStorage.getItem('userInfo') || '{}')
    reviewerId.value = savedUser._id || savedUser.phone || ''
    reviewerName.value = savedUser.name || savedUser.nickname || savedUser.phone || '主办方'
  } catch (e) {
    reviewerName.value = '主办方'
  }
  try { tournament.value = await queryById('tournaments', tournamentId) || {} } catch (error) { console.error('加载赛事失败:', error) }
  await loadList()
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
.roster-change-review { min-height: 100%; background: #fff; color: #1d271f; }
.change-context-header { display: flex; align-items: center; justify-content: space-between; min-height: 78px; padding: 0 30px 0 16px; border-bottom: 1px solid #e7ebea; background: #fff; }
.change-context-header > div { display: flex; align-items: center; gap: 14px; }
.context-event img { width: 42px; height: 48px; object-fit: contain; }
.change-context-header strong { max-width: 390px; overflow: hidden; font-size: 20px; text-overflow: ellipsis; white-space: nowrap; }
.context-divider { width: 1px; height: 25px; margin: 0 5px; background: #e3e7e4; }
.context-meta { display: flex; align-items: center; gap: 8px; color: #3f4942; font-size: 14px; white-space: nowrap; }
.change-page { width: min(1360px, calc(100% - 40px)); margin: 0 auto; padding: 26px 0 28px; }
.change-title { display: flex; align-items: center; justify-content: space-between; }
.change-title h1 { margin: 0; font-size: 29px; }
.division-control { display: flex; align-items: center; gap: 12px; color: #4e5850; font-size: 14px; }
.change-title .el-select { width: 135px; }
.change-tabs { display: flex; align-items: end; gap: 40px; height: 64px; border-bottom: 1px solid #dfe5e0; font-size: 16px; }
.change-tabs span,.change-tabs strong { display: flex; align-items: center; height: 64px; cursor: pointer; font-weight: 450; }
.change-tabs strong { border-bottom: 3px solid #168343; color: #13773c; font-weight: 700; }
.change-tabs em { margin-left: 9px; color: #10813f; font-style: normal; }
.change-stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 20px; margin: 18px 0 20px; }
.change-stats article { display: flex; align-items: center; gap: 17px; min-height: 100px; padding: 0 22px; border: 1px solid #e5e9e7; border-radius: 7px; background: #fff; }
.change-stats i { display: grid; width: 47px; height: 47px; place-items: center; border-radius: 50%; color: #fff; font-size: 24px; font-style: normal; }
.change-stats i.blue{background:#1476ea}.change-stats i.orange{background:#f28a13}.change-stats i.green{background:#16823f}.change-stats i.red{background:#df3434}
.change-stats div { display: flex; flex-direction: column; gap: 7px; }
.change-stats span { color: #667168; font-size: 13px; }
.change-stats strong { font-size: 24px; }
.change-stats small { font-size: 12px; font-weight: 450; }
.lock-note { margin-bottom: 24px; border-radius: 6px; }
.change-filter-row { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
.change-filter-row .el-input { width: 150px; }
.change-filter-row .el-select { width: 150px; }
.change-filter-row :deep(.el-date-editor) { width: 278px; }
.filter-spacer { flex: 1; }
.change-table-wrap { overflow: auto; border: 1px solid #dfe5e0; border-radius: 9px; background: #fff; }
.change-table-wrap h2 { margin: 0; padding: 17px 18px; border-bottom: 1px solid #e6ebe7; font-size: 15px; }
.change-table { width: 100%; min-width: 1320px; border-collapse: collapse; font-size: 12px; }
.change-table th { height: 46px; padding: 0 12px; background: #f7f9f7; color: #647067; text-align: left; font-weight: 600; white-space: nowrap; }
.change-table td { height: 57px; padding: 0 12px; border-top: 1px solid #edf0ee; white-space: nowrap; }
.change-table .select-col { width: 34px; }
.change-table tbody tr:hover td { background: #f7fcf8; }
.change-table-wrap :deep(th.el-table__cell) { height: 46px; background: #f7f9f7; color: #647067; font-size: 12px; }
.change-table-wrap :deep(td.el-table__cell) { height: 57px; font-size: 12px; }
.change-table-wrap small { color: #8a948c; }
.change-footer-note { margin-top: 18px; }
.rule-list { margin: 18px 0 0; padding-left: 22px; color: #566159; line-height: 2; }
@media(max-width:1200px){.context-meta{display:none}.context-divider{display:none}}@media(max-width:1100px){.change-stats{grid-template-columns:repeat(2,1fr)}.change-filter-row{flex-wrap:wrap}.filter-spacer{display:none}.change-tabs{gap:20px}}
</style>
