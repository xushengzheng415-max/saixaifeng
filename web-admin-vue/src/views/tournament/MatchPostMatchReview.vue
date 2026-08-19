<template>
  <main class="post-match-page" v-loading="loading">
    <header class="event-context">
      <div class="event-main">
        <span class="event-badge"><el-icon><Trophy /></el-icon></span>
        <strong>{{ tournament.name || '当前赛事' }}</strong>
        <el-tag type="primary" effect="plain">{{ divisionCount }} 个组别</el-tag>
        <el-tag type="success" effect="plain">进行中</el-tag>
        <span><el-icon><Calendar /></el-icon>{{ eventDateText }}</span>
        <span><el-icon><Location /></el-icon>{{ tournament.province || tournament.location || '举办地待定' }}</span>
      </div>
      <el-button plain @click="router.push('/tournament-space')"><el-icon><SwitchButton /></el-icon>退出赛事空间</el-button>
    </header>

    <section class="workspace">
      <div class="page-title-row">
        <h1>比赛管理&nbsp; / &nbsp;{{ divisionName }}&nbsp; / &nbsp;赛后资料接收与补充</h1>
        <el-button @click="backToList"><el-icon><Back /></el-icon>返回比赛列表</el-button>
      </div>

      <el-alert
        class="readonly-alert"
        type="success"
        :closable="false"
        show-icon
        title="裁判手机端已提交赛果与基础记录，主办方在赛后接收、补充材料并复核，不在 PC 模拟现场记录。"
      />

      <section class="match-meta-card">
        <div><el-icon><Tickets /></el-icon><span>场次<strong>{{ match.matchSequence || match.sequence || '—' }}</strong></span></div>
        <div><el-icon><Calendar /></el-icon><span>比赛日期<strong>{{ matchDateText }}</strong></span></div>
        <div><el-icon><Location /></el-icon><span>比赛地点<strong>{{ match.venue || '待定' }}</strong></span></div>
        <div><el-icon><Medal /></el-icon><span>赛事级别<strong>{{ divisionName }}杯赛</strong></span></div>
        <div><span>归档状态<strong class="status-value"><i />{{ reviewStatusText }}</strong></span></div>
      </section>

      <section class="score-card">
        <div class="score-team home">
          <img v-if="homeLogo" :src="homeLogo" alt="" />
          <span v-else class="logo-fallback">{{ teamInitial(homeName) }}</span>
          <strong>{{ homeName }}</strong>
        </div>
        <div class="score-center">
          <div><b>{{ match.homeScore ?? '—' }}</b><em>:</em><b>{{ match.awayScore ?? '—' }}</b></div>
          <el-tag type="success" effect="plain">赛果已由裁判提交</el-tag>
          <small>提交时间：{{ submittedAtText }}</small>
        </div>
        <div class="score-team away">
          <strong>{{ awayName }}</strong>
          <img v-if="awayLogo" :src="awayLogo" alt="" />
          <span v-else class="logo-fallback">{{ teamInitial(awayName) }}</span>
        </div>
      </section>

      <section class="material-grid">
        <article class="material-panel referee-panel">
          <div class="panel-title"><h2>裁判团队 <small>（{{ match.refereeRecord ? '已提交' : '待提交' }}）</small></h2><span>由裁判手机端提交</span></div>
          <dl>
            <template v-for="item in refereeCrew" :key="item.role">
              <dt>{{ item.role }}</dt><dd><el-icon><User /></el-icon>{{ item.name || '未设置' }}</dd>
            </template>
          </dl>
          <footer>提交时间：{{ submittedAtText }}</footer>
        </article>

        <article class="material-panel record-panel">
          <div class="panel-title"><h2>纸质记录与签字 <small>（{{ requiredRecordsReady ? '已上传' : '待补齐' }}）</small></h2><span>由裁判手机端提交</span></div>
          <div v-for="record in requiredRecords" :key="record.key" class="record-row">
            <div><strong>{{ record.label }}（必传）</strong><small :class="record.ready ? 'ready' : 'missing'">{{ record.ready ? '已上传 1 张' : '尚未上传' }}</small></div>
            <div class="paper-preview"><el-icon><Document /></el-icon></div>
            <el-button size="small" :disabled="!record.ready" @click="previewRecord(record)">查看</el-button>
          </div>
          <footer>提交时间：{{ submittedAtText }}</footer>
        </article>

        <article class="material-panel upload-panel">
          <div class="panel-title"><h2>补充材料 <small>（可选）</small></h2><span>由主办方补充上传</span></div>
          <el-upload
            class="supplement-upload"
            drag
            action="#"
            :auto-upload="false"
            :show-file-list="false"
            accept="image/*,.pdf"
            :on-change="onFileSelected"
          >
            <el-icon><UploadFilled /></el-icon>
            <div>上传<small>图片 / PDF</small></div>
          </el-upload>
          <p class="upload-hint">支持图片、PDF，单个文件不超过 10MB；多个文件请逐个上传。</p>
          <ul class="file-list">
            <li v-for="(file, index) in supplements" :key="file.fileId || file.url || index">
              <el-icon><Document /></el-icon><span><strong>{{ file.name }}</strong><small>{{ file.sizeText || formatSize(file.size) }}</small></span>
              <el-button link type="danger" :disabled="saving" @click="removeSupplement(index)"><el-icon><Close /></el-icon></el-button>
            </li>
          </ul>
          <footer>上传时间：{{ supplementUpdatedText }}</footer>
        </article>

        <article class="material-panel note-panel">
          <div class="panel-title"><h2>异常说明 <small>（可选）</small></h2><span>由主办方填写</span></div>
          <el-input v-model="note" type="textarea" :rows="8" maxlength="200" show-word-limit placeholder="如有异常情况，请在此填写，200字以内。" />
          <footer>填写时间：{{ note ? supplementUpdatedText : '未填写' }}</footer>
        </article>
      </section>

      <footer class="page-actions">
        <div class="audit-tips">
          <p><el-icon><InfoFilled /></el-icon>以上赛果、裁判团队及纸质记录均由裁判手机端提交，主办方仅负责接收、补充材料并复核。</p>
          <p><el-icon class="warning"><WarningFilled /></el-icon>请在确认资料完整、事实无误后提交复核，提交后将进入归档流程。</p>
        </div>
        <el-button size="large" :loading="saving" @click="saveDraft">保存补充资料</el-button>
        <el-button type="success" size="large" :disabled="!canSubmitReview" @click="openReview">提交复核</el-button>
      </footer>
    </section>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Back, Calendar, Close, Document, InfoFilled, Location, Medal, SwitchButton, Tickets, Trophy, UploadFilled, User, WarningFilled } from '@element-plus/icons-vue'
import { getFileUrl, queryById, queryList, updateRecord, uploadFileViaCloud } from '../../utils/cloud'

const route = useRoute()
const router = useRouter()
const tournamentId = route.params.id
const matchId = route.params.matchId
const visualQaSnapshot = import.meta.env.DEV && window.__sxfVisualQaSnapshot?.tournament?._id === tournamentId ? window.__sxfVisualQaSnapshot : null
const visualQaMatch = visualQaSnapshot?.matches?.find(item => String(item._id) === String(matchId)) || null
const match = ref(visualQaMatch || {})
const tournament = ref(visualQaSnapshot?.tournament || {})
const events = ref([])
const teams = ref(visualQaSnapshot?.teams || [])
const note = ref('')
const supplements = ref([])
const loading = ref(false)
const saving = ref(false)

const divisionName = computed(() => match.value.divisionName || match.value.division || 'U8组')
const divisionCount = computed(() => tournament.value.divisions?.length || tournament.value.divisionCount || 1)
const homeName = computed(() => match.value.homeTeamName || teamById(match.value.homeTeamId)?.name || '主队待定')
const awayName = computed(() => match.value.awayTeamName || teamById(match.value.awayTeamId)?.name || '客队待定')
const homeLogo = computed(() => match.value.homeTeamLogo || teamById(match.value.homeTeamId)?.logo || '')
const awayLogo = computed(() => match.value.awayTeamLogo || teamById(match.value.awayTeamId)?.logo || '')
const eventDateText = computed(() => {
  const start = tournament.value.startDate || '日期待定'
  const end = tournament.value.endDate
  return end ? `${start}—${end}` : start
})
const matchDateText = computed(() => [match.value.matchDate, match.value.matchTime].filter(Boolean).join(' ') || '待定')
const submittedAtText = computed(() => formatDate(match.value.refereeSubmittedAt || match.value.refereeRecord?.submittedAt || match.value.updatedAt))
const supplementUpdatedText = computed(() => formatDate(match.value.organizerSupplementUpdatedAt) || '未上传')
const reviewStatusText = computed(() => ({ under_review: '待复核', returned: '已退回', archived: '已归档' }[match.value.refereeReviewStatus] || '待复核'))
const refereeCrew = computed(() => {
  const crew = match.value.refereeCrew || match.value.refereeRecord?.crew || {}
  return [
    { role: '主裁判', name: personName(crew.main || crew.mainReferee || match.value.refereeName) },
    { role: '第一助理', name: personName(crew.assistant1 || crew.firstAssistant) },
    { role: '第二助理', name: personName(crew.assistant2 || crew.secondAssistant) },
    { role: '第四官员', name: personName(crew.fourth || crew.fourthOfficial) }
  ]
})
const requiredRecords = computed(() => {
  const record = match.value.refereeRecord || {}
  return [
    { key: 'matchSheet', label: '比赛记录单', value: record.matchSheet || record.matchRecordSheet || match.value.matchRecordSheet },
    { key: 'signatureSheet', label: '裁判签字页', value: record.signatureSheet || record.signatures || match.value.signatureSheet }
  ].map(item => ({ ...item, ready: Boolean(item.value) }))
})
const requiredRecordsReady = computed(() => requiredRecords.value.every(item => item.ready))
const canSubmitReview = computed(() => Boolean(match.value.refereeRecord) && !saving.value)

function normalizeRecord(value) { return Array.isArray(value) ? value[0] || {} : value || {} }
function teamById(id) { return teams.value.find(item => item._id === id || item.id === id) }
function teamInitial(name) { return (name || '队').slice(0, 1) }
function personName(value) { return typeof value === 'object' ? value?.name || value?.realName || '' : value || '' }
function formatDate(value) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', { hour12: false }).replaceAll('/', '-')
}
function formatSize(size) {
  if (!size) return ''
  return size < 1024 * 1024 ? `${Math.ceil(size / 1024)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`
}
function backToList() { router.push({ path: `/tournaments/${tournamentId}/matches`, query: { divisionId: match.value.divisionId } }) }

async function load() {
  if (visualQaSnapshot) {
    note.value = match.value.organizerSupplementNote || ''
    supplements.value = Array.isArray(match.value.organizerSupplementFiles) ? [...match.value.organizerSupplementFiles] : []
    return
  }
  loading.value = true
  try {
    const [matchResult, tournamentResult, eventResult, teamResult] = await Promise.all([
      queryById('matches', matchId),
      queryById('tournaments', tournamentId),
      queryList('match_events', { where: { matchId }, silent: true }),
      queryList('teams', { where: { tournamentId }, silent: true })
    ])
    match.value = normalizeRecord(matchResult)
    tournament.value = normalizeRecord(tournamentResult)
    events.value = eventResult || []
    teams.value = teamResult || []
    note.value = match.value.organizerSupplementNote || ''
    supplements.value = Array.isArray(match.value.organizerSupplementFiles) ? [...match.value.organizerSupplementFiles] : []
  } catch (error) {
    ElMessage.error(error.message || '赛后资料加载失败')
  } finally {
    loading.value = false
  }
}

async function onFileSelected(uploadFile) {
  const file = uploadFile.raw
  if (!file) return
  if (file.size > 10 * 1024 * 1024) return ElMessage.warning('单个文件不能超过 10MB')
  saving.value = true
  try {
    const suffix = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : ''
    const result = await uploadFileViaCloud(`match-supplements/${matchId}/${Date.now()}${suffix}`, file)
    const fileId = result.fileID || result.fileId || result.url || result.data?.fileID
    if (!fileId) throw new Error('文件上传结果缺少地址')
    supplements.value.push({ name: file.name, size: file.size, sizeText: formatSize(file.size), fileId, url: await getFileUrl(fileId).catch(() => '') })
    await persistSupplements()
    ElMessage.success('补充材料已上传')
  } catch (error) {
    ElMessage.error(error.message || '文件上传失败，已填写内容仍保留')
  } finally {
    saving.value = false
  }
}

async function persistSupplements() {
  const updatedAt = new Date().toISOString()
  await updateRecord('matches', matchId, { organizerSupplementFiles: supplements.value, organizerSupplementUpdatedAt: updatedAt })
  match.value.organizerSupplementUpdatedAt = updatedAt
}
async function removeSupplement(index) {
  const removed = supplements.value.splice(index, 1)[0]
  try { await persistSupplements() } catch (error) { supplements.value.splice(index, 0, removed); ElMessage.error(error.message || '移除失败') }
}
async function saveDraft() {
  saving.value = true
  try {
    const updatedAt = new Date().toISOString()
    await updateRecord('matches', matchId, { organizerSupplementNote: note.value, organizerSupplementFiles: supplements.value, organizerSupplementUpdatedAt: updatedAt })
    match.value.organizerSupplementNote = note.value
    match.value.organizerSupplementUpdatedAt = updatedAt
    ElMessage.success('补充资料已保存')
  } catch (error) {
    ElMessage.error(error.message || '保存失败，已填写内容仍保留')
  } finally {
    saving.value = false
  }
}
async function previewRecord(record) {
  const raw = typeof record.value === 'string' ? record.value : record.value?.url || record.value?.fileId || record.value?.fileID
  if (!raw) return ElMessage.warning('尚无可查看的记录')
  try { window.open(await getFileUrl(raw), '_blank', 'noopener') } catch (error) { ElMessage.error(error.message || '记录暂时无法打开') }
}
function openReview() {
  router.push({
    path: `/tournaments/${tournamentId}/match/${matchId}/review`,
    query: match.value.divisionId ? { divisionId: match.value.divisionId } : {}
  })
}

onMounted(load)
</script>

<style scoped>
.post-match-page{min-height:100%;background:#f6f8f7;color:#14241b}.event-context{height:76px;padding:0 28px;display:flex;align-items:center;justify-content:space-between;background:#fff;border-bottom:1px solid #e2e8e4}.event-main{display:flex;align-items:center;gap:14px}.event-main>strong{font-size:20px}.event-main>span:not(.event-badge){display:flex;align-items:center;gap:7px;color:#657169}.event-badge{width:38px;height:44px;display:grid;place-items:center;border-radius:8px;background:#e8f4ec;color:#07652f;font-size:24px}.workspace{padding:22px 28px 28px}.page-title-row{display:flex;align-items:center;justify-content:space-between}.page-title-row h1{margin:0;font-size:27px;font-weight:650}.readonly-alert{margin:18px 0;border:1px solid #cfe5d6;background:#f2f8f4}.match-meta-card{display:grid;grid-template-columns:repeat(5,1fr);padding:20px 26px;background:#fff;border:1px solid #dfe6e1;border-radius:8px}.match-meta-card>div{display:flex;align-items:center;gap:12px}.match-meta-card .el-icon{font-size:25px}.match-meta-card span{display:flex;flex-direction:column;color:#68736c;font-size:13px}.match-meta-card strong{margin-top:5px;color:#17251d;font-size:16px}.status-value{display:flex;align-items:center;gap:8px}.status-value i{width:8px;height:8px;border-radius:50%;background:#07833b}.score-card{margin-top:14px;min-height:164px;display:grid;grid-template-columns:1fr 280px 1fr;align-items:center;background:#fff;border:1px solid #dfe6e1;border-radius:8px}.score-team{display:flex;align-items:center;justify-content:center;gap:24px;font-size:23px}.score-team img,.logo-fallback{width:72px;height:72px;object-fit:contain}.logo-fallback{display:grid;place-items:center;border-radius:16px;background:#eaf4ed;color:#0c7138;font-weight:700}.score-center{text-align:center}.score-center>div{display:flex;justify-content:center;align-items:center;gap:32px}.score-center b{width:110px;padding:10px;border:1px solid #cfd8d2;border-radius:7px;font-size:39px;font-weight:500}.score-center em{font-size:34px;font-style:normal}.score-center .el-tag{display:flex;width:180px;margin:10px auto 4px}.score-center small{color:#8a948d}.material-grid{margin-top:14px;display:grid;grid-template-columns:1.05fr 1.2fr 1.15fr 1.05fr;gap:14px}.material-panel{min-height:300px;display:flex;flex-direction:column;background:#fff;border:1px solid #dfe6e1;border-radius:8px;overflow:hidden}.panel-title{height:58px;padding:0 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e8edea}.panel-title h2{margin:0;font-size:18px}.panel-title h2 small{font-size:13px;color:#7b867f}.panel-title>span{font-size:12px;color:#87918a}.material-panel footer{margin-top:auto;padding:13px 16px;color:#8a948d;font-size:12px}.referee-panel dl{display:grid;grid-template-columns:96px 1fr;gap:18px 8px;padding:16px;margin:0}.referee-panel dt{color:#36443b}.referee-panel dd{margin:0;display:flex;align-items:center;gap:8px}.record-row{min-height:86px;padding:10px 14px;display:grid;grid-template-columns:1fr 58px 48px;align-items:center;gap:10px;border-bottom:1px solid #edf1ee}.record-row>div:first-child{display:flex;flex-direction:column;gap:6px}.record-row small.ready{color:#087534}.record-row small.missing{color:#b36a00}.paper-preview{height:54px;display:grid;place-items:center;background:#f0f2f0;color:#66746b;font-size:27px}.supplement-upload{margin:12px 14px 0}.supplement-upload :deep(.el-upload-dragger){height:86px;padding:13px}.supplement-upload .el-icon{font-size:24px;color:#718078}.supplement-upload small{display:block;color:#8d978f}.upload-hint{margin:8px 14px;color:#8a948d;font-size:12px;line-height:1.5}.file-list{list-style:none;margin:0 14px;padding:0}.file-list li{display:flex;align-items:center;gap:8px;padding:7px;border:1px solid #e2e7e3;border-radius:6px}.file-list span{min-width:0;display:flex;flex:1;flex-direction:column}.file-list strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.file-list small{color:#87918a}.note-panel :deep(.el-textarea){padding:14px;box-sizing:border-box}.note-panel :deep(textarea){resize:none}.page-actions{margin-top:18px;display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:14px}.audit-tips{padding:12px 16px;border:1px solid #d7e5dc;border-radius:7px;background:#f5faf7}.audit-tips p{margin:3px 0;display:flex;align-items:center;gap:8px;color:#405047;font-size:13px}.audit-tips .el-icon{color:#08753a}.audit-tips .warning{color:#e47b15}.page-actions>.el-button{min-width:170px;height:48px}@media(max-width:1200px){.material-grid{grid-template-columns:1fr 1fr}.match-meta-card{grid-template-columns:repeat(3,1fr);gap:18px}}@media(max-width:850px){.event-context{height:auto;padding:14px}.event-main{flex-wrap:wrap}.workspace{padding:16px}.match-meta-card,.material-grid{grid-template-columns:1fr}.score-card{grid-template-columns:1fr;padding:18px}.score-team.away{flex-direction:row-reverse}.page-actions{grid-template-columns:1fr}.page-title-row h1{font-size:21px}}
</style>
