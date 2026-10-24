<template>
  <section class="penalty-board">
    <div class="board-actions">
      <el-radio-group v-model="view" size="small">
        <el-radio-button label="pending">待审核 {{ counts.pendingReview }}</el-radio-button>
        <el-radio-button label="effective">生效处罚 {{ counts.effective }}</el-radio-button>
        <el-radio-button label="blacklist">跨赛事黑名单 {{ counts.platformScope }}</el-radio-button>
      </el-radio-group>
      <el-button :loading="loading" @click="load">刷新</el-button>
      <el-button type="danger" @click="openCreate">登记处罚</el-button>
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

    <el-dialog v-model="createVisible" title="登记平台处罚" width="min(600px, 94vw)" :close-on-click-modal="false">
      <el-form label-width="100px">
        <el-form-item label="赛事编号">
          <el-select v-model="createForm.tournamentId" filterable allow-create default-first-option :loading="tournamentLoading" placeholder="选择赛事，或直接粘贴赛事 ID" style="width:100%">
            <el-option v-for="item in tournamentOptions" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="处罚对象">
          <el-radio-group v-model="createForm.subjectType">
            <el-radio label="player">球员</el-radio>
            <el-radio label="team">球队</el-radio>
            <el-radio label="staff">工作人员</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="createForm.subjectType === 'player'" label="球员">
          <el-select v-model="createForm.playerId" filterable clearable :loading="catalogLoading" placeholder="从球员库选择，或留空手填姓名" style="width:100%" @change="pickPlayer">
            <el-option v-for="item in playerOptions" :key="item.id" :label="item.label" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="createForm.subjectType === 'player' && !createForm.playerId" label="球员姓名">
          <el-input v-model="createForm.playerName" maxlength="40" />
        </el-form-item>
        <el-form-item v-if="createForm.subjectType === 'staff'" label="人员姓名">
          <el-input v-model="createForm.personName" maxlength="40" />
        </el-form-item>
        <el-form-item v-if="createForm.subjectType !== 'staff'" label="所属球队">
          <el-input v-model="createForm.teamName" maxlength="60" placeholder="球队名称" />
        </el-form-item>
        <el-form-item v-if="createForm.subjectType === 'team' || createForm.subjectType === 'player'" label="球队编号">
          <el-input v-model="createForm.teamId" placeholder="球队 ID（扣联赛积分时必填）" />
        </el-form-item>
        <el-form-item label="违纪类型">
          <el-checkbox-group v-model="createForm.types">
            <el-checkbox label="abuse_referee">辱骂裁判</el-checkbox>
            <el-checkbox label="fight">现场打架</el-checkbox>
            <el-checkbox label="serious_misconduct">严重违纪</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="处罚决定">
          <el-input v-model="createForm.reason" type="textarea" :rows="3" maxlength="300" placeholder="写明违纪事实、依据与追加处罚内容（不少于 4 字）" />
        </el-form-item>
        <el-form-item label="执行范围">
          <el-select v-model="createForm.banDuration">
            <el-option label="仅本赛事（按场次）" value="matches" />
            <el-option label="3 个月" value="months3" />
            <el-option label="1 年" value="year1" />
            <el-option label="永久" value="permanent" />
          </el-select>
        </el-form-item>
        <el-form-item label="停赛场次">
          <el-input-number v-model="createForm.suspensionMatches" :min="0" :max="50" />
        </el-form-item>
        <el-form-item label="扣联赛积分">
          <el-input-number v-model="createForm.pointsDeduction" :min="0" :max="15" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="danger" :loading="createSubmitting" @click="submitCreate">登记并生效</el-button>
      </template>
    </el-dialog>

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

const props = defineProps({ players: { type: Array, default: () => [] } })

const loading = ref(false)
const submitting = ref(false)
const errorText = ref('')
const rows = ref([])
const counts = reactive({ effective: 0, pendingReview: 0, platformScope: 0 })
const view = ref('pending')
const reviewVisible = ref(false)
const reviewRow = ref(null)
const reviewForm = reactive({ decision: 'approve', banDuration: 'months3', reviewNote: '' })
const createVisible = ref(false)
const createSubmitting = ref(false)
const createForm = reactive({ tournamentId: '', subjectType: 'player', playerId: '', playerName: '', personName: '', teamName: '', teamId: '', types: [], reason: '', banDuration: 'matches', suspensionMatches: 0, pointsDeduction: 0 })
const tournamentOptions = ref([])
const tournamentLoading = ref(false)
const catalogLoading = computed(() => !props.players.length)
const playerOptions = computed(() => props.players
  .map(item => ({ id: String(item.id || ''), label: [item.name, item.teamName].filter(Boolean).join(' · '), teamId: String(item.teamId || ''), teamName: String(item.teamName || ''), name: String(item.name || '') }))
  .filter(item => item.id && item.name))

function pickPlayer(playerId) {
  const found = playerOptions.value.find(item => item.id === String(playerId || ''))
  if (!found) return
  createForm.playerName = found.name
  if (found.teamId) createForm.teamId = found.teamId
  if (found.teamName) createForm.teamName = found.teamName
}

async function loadTournaments() {
  if (tournamentOptions.value.length || tournamentLoading.value) return
  tournamentLoading.value = true
  try {
    const reply = await callFunction('manageTournamentCenterContent', { action: 'overview' })
    if (!reply || !reply.success) return
    tournamentOptions.value = ((reply.data || {}).tournaments || [])
      .map(row => ({ id: String(row._id || row.id || ''), name: String(row.name || row.title || row._id || '') }))
      .filter(item => item.id)
  } catch (error) {
    console.error('[penalty] 赛事列表加载失败', error)
  } finally { tournamentLoading.value = false }
}

function openCreate() {
  Object.assign(createForm, { tournamentId: '', subjectType: 'player', playerId: '', playerName: '', personName: '', teamName: '', teamId: '', types: [], reason: '', banDuration: 'matches', suspensionMatches: 0, pointsDeduction: 0 })
  createVisible.value = true
  loadTournaments()
}

async function submitCreate() {
  if (createSubmitting.value) return
  if (!String(createForm.tournamentId || '').trim()) return ElMessage.warning('请填写赛事编号')
  if (createForm.subjectType === 'player' && !String(createForm.playerName || '').trim()) return ElMessage.warning('请选择球员或填写球员姓名')
  if (createForm.subjectType === 'staff' && !String(createForm.personName || '').trim()) return ElMessage.warning('请填写人员姓名')
  if (!createForm.types.length) return ElMessage.warning('请选择违纪类型')
  if (String(createForm.reason || '').trim().length < 4) return ElMessage.warning('处罚决定不少于 4 个字')
  createSubmitting.value = true
  try {
    await api({
      action: 'createPenalty',
      tournamentId: String(createForm.tournamentId || '').trim(),
      subjectType: createForm.subjectType,
      playerId: String(createForm.playerId || '').trim(),
      playerName: createForm.playerName,
      personName: createForm.personName,
      teamName: createForm.teamName,
      teamId: createForm.teamId,
      types: createForm.types,
      reason: createForm.reason,
      banDuration: createForm.banDuration,
      suspensionMatches: createForm.suspensionMatches,
      pointsDeduction: createForm.pointsDeduction
    })
    ElMessage.success('处罚已登记并生效')
    createVisible.value = false
    view.value = createForm.banDuration === 'matches' ? 'effective' : 'blacklist'
    await load()
  } catch (error) { ElMessage.error(error.message) } finally { createSubmitting.value = false }
}

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
