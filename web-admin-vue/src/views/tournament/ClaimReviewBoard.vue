<template>
  <div class="claim-review-page" v-loading="loading">
    <header class="page-header">
      <div>

        <h1>认领冲突人工审核</h1>
        <p class="subtitle">只处理归属争议的审核结论，不自动合并球队，也不覆盖球队长期资料。</p>
      </div>
      <div class="header-actions">
        <el-button plain @click="router.push({ path: `/tournaments/${tournamentId}/teams`, query: { tab: 'pending' } })">
          <el-icon><ArrowLeft /></el-icon>返回参赛球队
        </el-button>
        <el-button :loading="loading" @click="loadRequests">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
      </div>
    </header>

    <section class="boundary-card">
      <div class="boundary-icon"><el-icon><WarningFilled /></el-icon></div>
      <div>
        <strong>审核边界</strong>
        <p>通过后仅解锁球队负责人继续确认接收主办方预建球队；最终认领仍由小程序中的负责人明确确认完成。</p>
      </div>
    </section>

    <section class="summary-grid">
      <article><span>待核验</span><strong>{{ pendingCount }}</strong><small>需要主办方处理</small></article>
      <article><span>核验中</span><strong>{{ underReviewCount }}</strong><small>已开始人工核对</small></article>
      <article><span>待补材料</span><strong>{{ moreInfoCount }}</strong><small>等待负责人补充</small></article>
      <article><span>当前请求</span><strong>{{ requests.length }}</strong><small>本赛事审核队列</small></article>
    </section>

    <section class="table-card">
      <div class="table-heading">
        <div>
          <h2>审核队列</h2>
          <span>仅显示当前机构有权处理的认领冲突请求</span>
        </div>
        <el-select v-model="statusFilter" style="width: 150px" @change="loadRequests">
          <el-option label="未完成" value="active" />
          <el-option label="全部记录" value="all" />
          <el-option label="已通过" value="approved" />
          <el-option label="未通过" value="rejected" />
        </el-select>
      </div>

      <el-empty v-if="!loading && requests.length === 0" description="当前没有认领冲突审核请求" />
      <div v-else class="review-list">
        <article v-for="row in requests" :key="row.id" class="review-row">
          <div class="row-main">
            <div class="team-mark">{{ teamInitial(row.teamName) }}</div>
            <div class="team-info">
              <h3>{{ row.teamName }}</h3>
              <p>{{ row.tournamentName }} · {{ row.divisionName }}</p>
              <p class="muted">申请人：{{ row.requesterName }} {{ row.requesterPhoneMasked || '' }} · {{ formatTime(row.createdAt) }}</p>
            </div>
          </div>
          <div class="row-reason">
            <el-tag type="danger" effect="plain">{{ row.reasonLabel }}</el-tag>
            <span class="proof-state" :class="{ missing: row.proofRequired && !row.hasProofMaterials }">
              {{ row.hasProofMaterials ? `已关联 ${row.proofMaterialCount} 份材料` : '尚未关联证明材料' }}
            </span>
          </div>
          <div class="row-status">
            <el-tag :type="statusType(row.status)" effect="light">{{ row.statusLabel }}</el-tag>
            <small v-if="row.reviewNote">{{ row.reviewNote }}</small>
          </div>
          <div class="row-actions">
            <el-button v-if="row.hasProofMaterials" link type="primary" @click="viewProofs(row)">查看证明材料</el-button>
            <el-button v-if="row.status === 'pending'" link type="primary" @click="decide(row, 'under_review')">开始核验</el-button>
            <el-button v-if="['pending', 'under_review', 'needs_more_info'].includes(row.status)" link type="success" @click="decide(row, 'approved')">通过核验</el-button>
            <el-button v-if="['pending', 'under_review'].includes(row.status)" link type="warning" @click="decide(row, 'needs_more_info')">要求补材料</el-button>
            <el-button v-if="['pending', 'under_review', 'needs_more_info'].includes(row.status)" link type="danger" @click="decide(row, 'rejected')">不通过</el-button>
          </div>
        </article>
      </div>
    </section>

    <el-dialog v-model="proofDialogVisible" title="证明材料" width="560px">
      <div v-loading="proofLoading" class="proof-dialog">
        <p class="proof-dialog-intro">{{ proofRow?.teamName || '当前球队' }} · 材料只提供给当前机构审核人员查看。</p>
        <el-empty v-if="!proofLoading && proofMaterials.length === 0" description="暂时无法读取证明材料" />
        <div v-for="material in proofMaterials" :key="material.fileId" class="proof-dialog-row">
          <div>
            <strong>{{ material.fileName }}</strong>
            <small>{{ proofTypeLabel(material.proofType) }}</small>
          </div>
          <el-link v-if="material.url" :href="material.url" target="_blank" type="primary">打开材料</el-link>
          <span v-else class="proof-unavailable">链接暂不可用</span>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Refresh, WarningFilled } from '@element-plus/icons-vue'
import { callFunction } from '../../utils/cloud'

const route = useRoute()
const router = useRouter()
const tournamentId = String(route.params.id || '')
const loading = ref(false)
const requests = ref([])
const statusFilter = ref('active')
const proofDialogVisible = ref(false)
const proofLoading = ref(false)
const proofRow = ref(null)
const proofMaterials = ref([])

const pendingCount = computed(() => requests.value.filter(row => row.status === 'pending').length)
const underReviewCount = computed(() => requests.value.filter(row => row.status === 'under_review').length)
const moreInfoCount = computed(() => requests.value.filter(row => row.status === 'needs_more_info').length)

function teamInitial(name) {
  return Array.from(String(name || '队'))[0] || '队'
}

function formatTime(value) {
  const raw = value && typeof value === 'object' && value.$date ? value.$date : value
  if (!raw) return '时间未知'
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return String(raw)
  const pad = number => String(number).padStart(2, '0')
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function statusType(status) {
  return ({ pending: 'warning', under_review: 'primary', needs_more_info: 'warning', approved: 'success', rejected: 'danger' })[status] || 'info'
}

function proofTypeLabel(type) {
  return ({ authorization: '负责人授权书', club_certificate: '俱乐部证明', tournament_invite: '赛事邀请/参赛证明' })[type] || '证明材料'
}

async function loadRequests() {
  if (!tournamentId) return
  loading.value = true
  try {
    const result = await callFunction('organizerClaimInvite', { action: 'listClaimReviewRequests', tournamentId, status: statusFilter.value })
    if (!result?.success) throw new Error(result?.error || result?.message || '审核队列加载失败')
    requests.value = Array.isArray(result.requests) ? result.requests : []
  } catch (error) {
    ElMessage.error(error.message || '审核队列加载失败')
  } finally {
    loading.value = false
  }
}

async function decide(row, decision) {
  let note = ''
  try {
    if (decision === 'approved') {
      await ElMessageBox.confirm(
        `确认通过“${row.teamName}”的人工归属核验吗？通过后仅允许负责人继续确认接收，不会自动认领或合并球队。`,
        '通过人工核验',
        { confirmButtonText: '确认通过', cancelButtonText: '取消', type: 'warning' }
      )
    } else if (decision === 'rejected') {
      const prompt = await ElMessageBox.prompt('请填写未通过原因，便于负责人理解后续处理方式。', '不通过审核', {
        confirmButtonText: '提交不通过', cancelButtonText: '取消', inputPlaceholder: '例如：暂未核实负责人归属', inputValidator: value => String(value || '').trim().length >= 2 ? true : '请填写至少 2 个字的原因'
      })
      note = String(prompt.value || '').trim()
    } else if (decision === 'needs_more_info') {
      const prompt = await ElMessageBox.prompt('请说明需要负责人补充的材料。', '要求补充材料', {
        confirmButtonText: '提交要求', cancelButtonText: '取消', inputPlaceholder: '例如：请补充盖章授权或赛事邀请证明', inputValidator: value => String(value || '').trim().length >= 2 ? true : '请填写至少 2 个字的说明'
      })
      note = String(prompt.value || '').trim()
    } else {
      await ElMessageBox.confirm('开始核验后，该请求会进入核验中状态。', '开始人工核验', { confirmButtonText: '开始核验', cancelButtonText: '取消', type: 'info' })
    }
    const result = await callFunction('organizerClaimInvite', { action: 'decideClaimReview', requestId: row.id, decision, note })
    if (!result?.success) throw new Error(result?.error || result?.message || '审核操作失败')
    ElMessage.success(decision === 'approved' ? '已通过人工核验，等待负责人确认接收' : '审核状态已更新')
    await loadRequests()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message || '审核操作失败')
  }
}

async function viewProofs(row) {
  proofRow.value = row
  proofMaterials.value = []
  proofDialogVisible.value = true
  proofLoading.value = true
  try {
    const result = await callFunction('organizerClaimInvite', { action: 'getClaimReviewProofUrls', requestId: row.id })
    if (!result?.success) throw new Error(result?.error || result?.message || '证明材料读取失败')
    proofMaterials.value = Array.isArray(result.materials) ? result.materials : []
  } catch (error) {
    ElMessage.error(error.message || '证明材料读取失败')
  } finally {
    proofLoading.value = false
  }
}

onMounted(loadRequests)
</script>

<style scoped>
.claim-review-page { min-height: 100%; padding: 28px 32px 48px; background: #f4f7f5; color: #17221a; }
.page-header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; margin-bottom: 22px; }
.eyebrow { margin: 0 0 8px; color: #16834b; font-size: 13px; font-weight: 700; letter-spacing: .04em; }
h1 { margin: 0; font-size: 28px; line-height: 1.25; }
.subtitle { margin: 10px 0 0; color: #69766d; font-size: 14px; }
.header-actions { display: flex; gap: 10px; }
.boundary-card { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 18px; padding: 16px 18px; border: 1px solid #cce8d7; border-radius: 14px; background: #effaf3; }
.boundary-icon { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 10px; color: #c77918; background: #fff4dc; }
.boundary-card strong { display: block; margin-bottom: 4px; }
.boundary-card p { margin: 0; color: #4e6254; font-size: 13px; line-height: 1.6; }
.summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 18px; }
.summary-grid article { padding: 17px 18px; border: 1px solid #e0e9e2; border-radius: 14px; background: #fff; box-shadow: 0 5px 18px rgba(36, 82, 52, .05); }
.summary-grid span, .summary-grid small { display: block; color: #6b776e; font-size: 13px; }
.summary-grid strong { display: block; margin: 7px 0 2px; color: #12653a; font-size: 27px; }
.table-card { padding: 20px; border: 1px solid #e0e9e2; border-radius: 16px; background: #fff; box-shadow: 0 8px 22px rgba(36, 82, 52, .06); }
.table-heading { display: flex; justify-content: space-between; gap: 16px; align-items: center; padding-bottom: 15px; border-bottom: 1px solid #edf1ee; }
.table-heading h2 { margin: 0 0 4px; font-size: 18px; }
.table-heading span { color: #7a867d; font-size: 13px; }
.review-list { display: grid; gap: 10px; padding-top: 10px; }
.review-row { display: grid; grid-template-columns: minmax(250px, 1.5fr) minmax(170px, .9fr) minmax(120px, .7fr) auto; gap: 18px; align-items: center; padding: 16px; border: 1px solid #edf1ee; border-radius: 12px; background: #fbfdfb; }
.row-main { display: flex; gap: 11px; align-items: center; min-width: 0; }
.team-mark { display: grid; flex: 0 0 40px; place-items: center; width: 40px; height: 40px; border-radius: 12px; color: #0d7040; background: #dff4e6; font-weight: 800; }
.team-info { min-width: 0; }
.team-info h3 { overflow: hidden; margin: 0 0 4px; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; }
.team-info p { overflow: hidden; margin: 2px 0; color: #56645a; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.team-info .muted { color: #8b958e; }
.row-reason { display: grid; gap: 6px; }
.proof-state { color: #368053; font-size: 12px; }
.proof-state.missing { color: #b36b16; }
.row-status { display: grid; gap: 5px; }
.row-status small { max-width: 190px; overflow: hidden; color: #7a867d; text-overflow: ellipsis; white-space: nowrap; }
.row-actions { display: flex; justify-content: flex-end; gap: 2px; white-space: nowrap; }
.proof-dialog-intro { margin: 0 0 14px; color: #6b776e; font-size: 13px; }
.proof-dialog-row { display: flex; justify-content: space-between; gap: 16px; align-items: center; padding: 13px 0; border-top: 1px solid #edf1ee; }
.proof-dialog-row strong, .proof-dialog-row small { display: block; }
.proof-dialog-row strong { color: #24352a; font-size: 14px; }
.proof-dialog-row small { margin-top: 4px; color: #7a867d; font-size: 12px; }
.proof-unavailable { color: #b36b16; font-size: 12px; }
@media (max-width: 1050px) { .review-row { grid-template-columns: 1fr 1fr; } .row-actions { justify-content: flex-start; grid-column: 1 / -1; } }
@media (max-width: 720px) { .claim-review-page { padding: 20px 14px 32px; } .page-header { display: block; } .header-actions { margin-top: 14px; } .summary-grid { grid-template-columns: repeat(2, 1fr); } .review-row { grid-template-columns: 1fr; gap: 10px; } }
</style>
