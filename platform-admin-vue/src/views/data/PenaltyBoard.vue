<template>
  <section class="penalty-board">
    <div class="board-actions">
      <el-radio-group v-model="view" size="small">
        <el-radio-button label="pending">待审核 {{ counts.pendingReview }}</el-radio-button>
        <el-radio-button label="effective">生效处罚 {{ counts.effective }}</el-radio-button>
        <el-radio-button label="blacklist">跨赛事黑名单 {{ counts.platformScope }}</el-radio-button>
      </el-radio-group>
      <el-button :loading="loading" @click="load">刷新</el-button>
    </div>
    <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon />
    <el-alert title="主办方只能在本赛事内录入处罚；跨赛事黑名单必须由平台审核通过后才生效，到期自动解除。" type="info" :closable="false" show-icon />
    <el-table v-loading="loading" :data="rows" stripe empty-text="暂无记录">
      <el-table-column label="类型" width="110">
        <template #default="{ row }">
          <el-tag :type="row.kind === 'forfeit' ? 'warning' : 'danger'" effect="plain">{{ kindLabel(row) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="对象" min-width="190">
        <template #default="{ row }">{{ subjectText(row) }}</template>
      </el-table-column>
      <el-table-column label="赛事" min-width="170">
        <template #default="{ row }">{{ row.tournamentName || row.tournamentId || '—' }}</template>
      </el-table-column>
      <el-table-column label="扣联赛积分" width="100">
        <template #default="{ row }">{{ row.pointsDeduction > 0 ? '−' + row.pointsDeduction : '—' }}</template>
      </el-table-column>
      <el-table-column label="范围" width="110">
        <template #default="{ row }"><el-tag :type="row.scope === 'platform' ? 'danger' : 'info'" effect="plain">{{ row.scope === 'platform' ? '全平台' : '本赛事' }}</el-tag></template>
      </el-table-column>
      <el-table-column label="状态" width="130">
        <template #default="{ row }">{{ statusText(row) }}</template>
      </el-table-column>
      <el-table-column label="原因" min-width="220" show-overflow-tooltip>
        <template #default="{ row }">{{ row.reason || '—' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.platformReview === 'pending'" link type="primary" @click="openReview(row)">审核</el-button>
          <el-button v-if="row.status === 'effective'" link type="danger" @click="revoke(row)">撤销</el-button>
          <span v-if="row.platformReview !== 'pending' && row.status !== 'effective'">—</span>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="reviewVisible" title="跨赛事黑名单审核" width="min(520px, 92vw)" :close-on-click-modal="false">
      <dl class="review-detail">
        <dt>对象</dt><dd>{{ reviewRow ? subjectText(reviewRow) : '' }}</dd>
        <dt>赛事</dt><dd>{{ reviewRow?.tournamentName || reviewRow?.tournamentId || '—' }}</dd>
        <dt>原因</dt><dd>{{ reviewRow?.reason || '—' }}</dd>
        <dt>证据</dt><dd>{{ reviewRow?.evidenceFileIds?.length ? reviewRow.evidenceFileIds.length + ' 份' : '未附证据' }}</dd>
      </dl>
      <el-form label-position="top">
        <el-form-item label="黑名单期限">
          <el-select v-model="reviewForm.banDuration" :disabled="reviewForm.decision !== 'approve'">
            <el-option label="仅本赛事处罚（不列入黑名单）" value="matches" />
            <el-option label="3 个月" value="months3" />
            <el-option label="1 年" value="year1" />
            <el-option label="永久" value="permanent" />
          </el-select>
        </el-form-item>
        <el-form-item label="审核说明">
          <el-input v-model="reviewForm.reviewNote" type="textarea" maxlength="300" :rows="3" placeholder="驳回时必须填写原因" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reviewVisible = false">取消</el-button>
        <el-button :loading="submitting" @click="submitReview('reject')">驳回</el-button>
        <el-button type="danger" :loading="submitting" @click="submitReview('approve')">列入黑名单</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { callFunction } from '../../utils/cloud'

const loading = ref(false)
const submitting = ref(false)
const errorText = ref('')
const rows = ref([])
const counts = reactive({ effective: 0, pendingReview: 0, platformScope: 0 })
const view = ref('pending')
const reviewVisible = ref(false)
const reviewRow = ref(null)
const reviewForm = reactive({ decision: 'approve', banDuration: 'months3', reviewNote: '' })

const KIND_LABELS = { forfeit: '弃赛', discipline: '纪律处罚' }
const TYPE_LABELS = { forfeit: '弃赛', abuse_referee: '辱骂裁判', fight: '现场打架', serious_misconduct: '严重违纪' }

function kindLabel(row) {
  const extra = (row.types || []).filter(type => type !== 'forfeit').map(type => TYPE_LABELS[type] || type)
  return KIND_LABELS[row.kind] || row.kind + (extra.length ? ' · ' + extra.join('、') : '')
}
function subjectText(row) {
  if (row.subjectType === 'player') return [row.playerName, row.teamName].filter(Boolean).join(' · ')
  if (row.subjectType === 'staff') return row.personName || '工作人员'
  return row.teamName || row.teamId || '—'
}
function statusText(row) {
  if (row.status === 'revoked') return '已撤销'
  if (row.status === 'expired') return '已到期解除'
  if (row.platformReview === 'pending') return '待平台审核'
  if (row.platformReview === 'rejected') return '已驳回黑名单'
  if (row.scope === 'platform') return row.permanent ? '黑名单 · 永久' : '黑名单 · 至 ' + dateText(row.banUntil)
  return '本赛事生效'
}
function dateText(value) {
  if (!value) return ''
  const date = new Date(value.$date || value)
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('zh-CN') : ''
}

async function api(data) {
  const reply = await callFunction('dataCenter', data)
  if (!reply.success) throw new Error(reply.error || reply.message || '操作失败，请重试')
  return reply
}

async function load() {
  loading.value = true
  errorText.value = ''
  try {
    const reply = await api({ action: 'listPenalties', platformReview: view.value === 'pending' ? 'pending' : '', status: view.value === 'pending' ? 'effective' : 'effective' })
    rows.value = view.value === 'blacklist' ? (await api({ action: 'blacklist' })).items : reply.items
    Object.assign(counts, reply.summary || {})
  } catch (error) { errorText.value = error.message } finally { loading.value = false }
}

function openReview(row) {
  reviewRow.value = row
  Object.assign(reviewForm, { decision: 'approve', banDuration: 'months3', reviewNote: '' })
  reviewVisible.value = true
}

async function submitReview(decision) {
  submitting.value = true
  try {
    await api({ action: 'reviewPenalty', penaltyId: reviewRow.value.id, decision, banDuration: reviewForm.banDuration, reviewNote: reviewForm.reviewNote })
    ElMessage.success(decision === 'approve' ? '已列入黑名单' : '已驳回黑名单申请')
    reviewVisible.value = false
    await load()
  } catch (error) { ElMessage.error(error.message) } finally { submitting.value = false }
}

async function revoke(row) {
  try {
    const { value } = await ElMessageBox.prompt('撤销后处罚立即失效，须保留真实原因。', '撤销处罚', { inputPlaceholder: '撤销原因（2-300 字）', inputValidator: value => String(value || '').trim().length >= 2 || '请填写撤销原因' })
    await api({ action: 'revokePenalty', penaltyId: row.id, reason: value })
    ElMessage.success('处罚已撤销')
    await load()
  } catch (error) { if (error !== 'cancel') ElMessage.error(error.message || '撤销失败') }
}

onMounted(load)
</script>

<style scoped>
.penalty-board { display:flex; flex-direction:column; gap:12px }
.board-actions { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap }
.review-detail { display:grid; grid-template-columns:70px 1fr; gap:6px 12px; margin:0 0 16px; font-size:13px }
.review-detail dt { color:#909399 }
.review-detail dd { margin:0; color:#303133 }
</style>
