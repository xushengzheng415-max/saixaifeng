<template>
  <main class="discipline-page" v-loading="loading">
    <header class="discipline-hero">
      <div class="hero-main">
        <span class="hero-mark"><el-icon><WarningFilled /></el-icon></span>
        <div class="hero-copy">
          <small>赛事运营 / 纪律处罚</small>
          <h1>{{ tournamentName || '赛事纪律处罚' }}</h1>
          <p>登记本赛事签发的赛事级与单场处罚，处罚决定书（PDF/Word）在线留存。跨赛事与全平台禁赛由平台运营后台单独审核下发，主办方无权发起。</p>
        </div>
      </div>
      <div class="hero-actions">
        <el-button plain :loading="loading" @click="loadAll"><el-icon><Refresh /></el-icon>刷新</el-button>
        <el-button type="danger" @click="openCreate"><el-icon><Plus /></el-icon>追加处罚</el-button>
      </div>
    </header>

    <section class="discipline-summary">
      <article><small>生效处罚</small><strong>{{ stats.effective }}</strong><span>条</span></article>
      <article class="warn"><small>涉及追加停赛</small><strong>{{ stats.suspension }}</strong><span>条</span></article>
      <article class="muted"><small>已留存处罚文书</small><strong>{{ stats.withFiles }}</strong><span>条</span></article>
    </section>

    <section class="discipline-toolbar">
      <el-input v-model="keyword" clearable placeholder="搜索球队、球员或处罚原因" :prefix-icon="Search" />
      <el-select v-model="subjectFilter" clearable placeholder="全部处罚对象">
        <el-option label="球员" value="player" /><el-option label="球队" value="team" /><el-option label="工作人员" value="staff" />
      </el-select>
      <el-select v-model="scopeFilter" clearable placeholder="全部作用范围">
        <el-option label="赛事级处罚" value="tournament" /><el-option label="单场处罚" value="match" />
      </el-select>
      <span class="toolbar-count">{{ visibleActions.length }} 条 / 共 {{ actions.length }} 条</span>
    </section>

    <el-alert v-if="loadError" :title="loadError" type="warning" :closable="false" show-icon class="discipline-alert" />

    <section class="discipline-section">
      <header class="section-head">
        <div><h2>本赛事处罚记录</h2><p>可直接登记赛事级处罚，不受单场比赛限制；处罚文书可在生效期间持续补传。</p></div>
        <span class="section-count">{{ visibleActions.length }} 条生效</span>
      </header>
      <ul v-if="visibleActions.length" class="discipline-cards">
        <li v-for="item in visibleActions" :key="item.id" class="discipline-card" :class="item.subjectType">
          <header>
            <span class="card-mark">{{ subjectInitial(item) }}</span>
            <div class="card-subject"><b>{{ subjectName(item) }}</b><small>{{ subjectMeta(item) }}</small></div>
            <span class="card-status">生效中</span>
          </header>
          <div class="card-badges">
            <span class="badge scope">{{ item.scope === 'tournament' ? '赛事级' : `单场 · ${item.matchNo || '未编号'}` }}</span>
          </div>
          <div class="card-tags">
            <span v-for="tag in typeTags(item)" :key="tag.key" class="card-tag" :class="tag.tone">{{ tag.label }}</span>
          </div>
          <p class="card-reason">{{ item.reason }}</p>
          <div v-if="item.attachments?.length" class="card-files">
            <button v-for="file in item.attachments" :key="file.fileId" type="button" class="card-file" @click="openFile(file)">
              <el-icon><Document /></el-icon><span>{{ file.name }}</span><small>{{ fileSize(file.size) }}</small>
            </button>
          </div>
          <footer>
            <span>{{ item.createdByName || '主办方' }} · {{ formatDate(item.createdAt) }}</span>
            <em class="card-actions">
              <el-button link :loading="supplementingId === item.id" @click="chooseFiles(item)">{{ item.attachments?.length ? '继续补传' : '补传文书' }}</el-button>
              <el-button link type="danger" @click="revoke(item)">撤销</el-button>
            </em>
          </footer>
        </li>
      </ul>
      <div v-else class="discipline-empty">
        <el-icon><CircleCheckFilled /></el-icon>
        <b>{{ actions.length ? '当前筛选范围暂无处罚' : '本赛事暂无生效处罚' }}</b>
        <small>出现违规时点击右上角「追加处罚」，登记处罚内容并留存处罚决定书。</small>
      </div>
    </section>

    <el-dialog v-model="createVisible" title="追加纪律处罚" width="560px">
      <el-alert title="处罚确认后立即生效并写入审计日志；本页只办理本赛事范围内的处罚。全平台禁赛由平台运营后台审核下发，主办方无权限发起。" type="warning" :closable="false" show-icon />
      <el-form label-position="top" class="discipline-form">
        <el-form-item label="处罚对象">
          <el-radio-group v-model="form.subjectType" @change="onSubjectTypeChange">
            <el-radio-button label="player">球员</el-radio-button>
            <el-radio-button label="team">球队</el-radio-button>
            <el-radio-button label="staff">工作人员</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.subjectType !== 'staff'" label="所属参赛球队">
          <el-select v-model="form.teamId" filterable placeholder="选择本赛事参赛球队" style="width:100%" @change="onTeamChange">
            <el-option v-for="team in teams" :key="team.teamId" :label="team.label" :value="team.teamId" />
          </el-select>
        </el-form-item>
        <template v-if="form.subjectType === 'player'">
          <el-form-item label="处罚球员">
            <el-select v-if="roster.length" v-model="form.playerId" filterable :loading="rosterLoading" placeholder="从本队名单选择球员" style="width:100%" @change="onPlayerChange">
              <el-option v-for="player in roster" :key="player.playerId" :label="`${player.number ? player.number + '号 ' : ''}${player.name}`" :value="player.playerId" />
            </el-select>
            <el-input v-else v-model="form.playerName" maxlength="40" placeholder="填写受处罚球员姓名" />
          </el-form-item>
          <el-form-item v-if="!roster.length" label="球员编号（追加停赛时必填）"><el-input v-model="form.playerId" maxlength="60" placeholder="球员在赛事名单中的编号" /></el-form-item>
          <el-alert v-if="rosterError" :title="`${rosterError}，可手工填写球员编号`" type="info" :closable="false" show-icon />
        </template>
        <el-form-item v-else-if="form.subjectType === 'staff'" label="工作人员姓名"><el-input v-model="form.personName" maxlength="40" placeholder="填写受处罚工作人员姓名" /></el-form-item>
        <el-form-item label="处罚类型（可多选）">
          <el-checkbox-group v-model="form.types">
            <el-checkbox label="suspension">追加停赛</el-checkbox>
            <el-checkbox label="fine">罚款</el-checkbox>
            <el-checkbox label="warning">警告/通报</el-checkbox>
            <el-checkbox label="disqualification">取消参赛资格</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item v-if="form.types.includes('suspension')" label="停赛场次"><el-input-number v-model="form.suspensionMatches" :min="1" :max="99" :step="1" controls-position="right" /></el-form-item>
        <el-form-item v-if="form.types.includes('fine')" label="罚款金额（元）"><el-input-number v-model="form.fineAmount" :min="0.01" :max="999999" :precision="2" :step="100" controls-position="right" /></el-form-item>
        <el-form-item label="处罚原因（必填，2-300字）"><el-input v-model="form.reason" type="textarea" :rows="3" maxlength="300" show-word-limit placeholder="例如：赛后冲突中推搡对方球员，造成不良影响。" /></el-form-item>
        <el-form-item label="处罚文书（选填：PDF 或 Word，单个≤10MB，最多5个）">
          <div class="upload-row">
            <el-button plain :disabled="uploading || draftFiles.length >= 5" :loading="uploading" @click="chooseFiles()"><el-icon><Upload /></el-icon>选择文书</el-button>
            <span v-if="uploadStage" class="upload-stage">{{ uploadStage }}</span>
          </div>
          <ul v-if="draftFiles.length" class="upload-list">
            <li v-for="(file, index) in draftFiles" :key="file.fileId"><b>{{ file.name }}</b><small>{{ fileSize(file.size) }}</small><el-button link type="danger" @click="removeDraftFile(index)">移除</el-button></li>
          </ul>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="danger" :loading="saving" :disabled="uploading" @click="submit">确认追加</el-button>
      </template>
    </el-dialog>
    <input ref="fileInput" class="hidden-input" type="file" accept=".pdf,.doc,.docx" multiple @change="onFileChange" />
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CircleCheckFilled, Document, Plus, Refresh, Search, Upload, WarningFilled } from '@element-plus/icons-vue'
import { callFunction, queryAll, rosterExceptionBoard, uploadLargeFileViaCloud } from '../../utils/cloud'

const route = useRoute()
const tournamentId = String(route.params.id || '')

const loading = ref(false)
const loadError = ref('')
const tournamentName = ref('')
const actions = ref([])
const teams = ref([])
const keyword = ref('')
const subjectFilter = ref('')
const scopeFilter = ref('')

const typeLabels = { suspension: '追加停赛', fine: '罚款', warning: '警告/通报', disqualification: '取消参赛资格' }
const typeTones = { suspension: 'danger', fine: 'warning', disqualification: 'severe', warning: 'muted' }
// 处罚文书留存：PDF/Word 单文件≤10MB，每条处罚最多 5 个。
const FILE_TYPES = ['pdf', 'doc', 'docx']
const FILE_LIMIT = 5
const FILE_MAX_BYTES = 10 * 1024 * 1024

const createVisible = ref(false)
const saving = ref(false)
const roster = ref([])
const rosterLoading = ref(false)
const rosterError = ref('')
const draftFiles = ref([])
const uploading = ref(false)
const uploadStage = ref('')
const supplementingId = ref('')
const fileInput = ref(null)
const supplementTarget = ref(null)
const form = ref({
  subjectType: 'player', teamId: '', playerId: '', playerName: '', personName: '',
  types: ['warning'], suspensionMatches: 1, fineAmount: 100, reason: ''
})

const stats = computed(() => ({
  effective: actions.value.length,
  suspension: actions.value.filter(item => (item.types || []).includes('suspension')).length,
  withFiles: actions.value.filter(item => (item.attachments || []).length).length
}))

const visibleActions = computed(() => {
  const text = keyword.value.trim().toLowerCase()
  return actions.value.filter(item => {
    if (subjectFilter.value && item.subjectType !== subjectFilter.value) return false
    if (scopeFilter.value && item.scope !== scopeFilter.value) return false
    if (!text) return true
    return [item.teamName, item.playerName, item.personName, item.reason, item.matchNo].map(value => String(value || '').toLowerCase()).join(' ').includes(text)
  })
})

function fileExtension(file) {
  const name = String(file?.name || '')
  return (name.includes('.') ? name.split('.').pop() : '').toLowerCase() || 'pdf'
}
function fileSize(size) {
  const bytes = Number(size || 0)
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`
}
function formatDate(value) {
  const date = new Date(value || 0)
  if (!Number.isFinite(date.getTime()) || !value) return '时间待记录'
  const pad = number => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
function typeTags(item) {
  const tags = (item.types || []).map(type => ({
    key: type,
    tone: typeTones[type] || 'muted',
    label: type === 'suspension' ? `停赛 ${Number(item.suspensionMatches || 0)} 场`
      : type === 'fine' ? `罚款 ¥${Number(item.fineAmount || 0)}`
        : typeLabels[type] || type
  }))
  return tags.length ? tags : [{ key: 'default', tone: 'muted', label: '纪律处罚' }]
}
function subjectName(item) {
  if (item.subjectType === 'player') return item.playerName || '球员未记录'
  if (item.subjectType === 'staff') return item.personName || '工作人员未记录'
  return item.teamName || '球队未记录'
}
function subjectMeta(item) {
  if (item.subjectType === 'player') return [item.teamName || '', item.playerId ? `编号 ${item.playerId}` : ''].filter(Boolean).join(' · ') || '球员'
  if (item.subjectType === 'staff') return '赛事工作人员'
  return '球队处罚'
}
function subjectInitial(item) {
  return String(subjectName(item)).slice(0, 1) || '罚'
}
function openFile(file) {
  const url = String(file?.url || '')
  if (!url) return ElMessage.warning('文书下载地址已失效，请刷新后重试')
  window.open(url, '_blank', 'noopener')
}

async function loadTeams() {
  const relations = await queryAll('tournament_teams', { where: { tournamentId } })
  const directory = new Map()
  relations.forEach(row => {
    const teamId = String(row.teamId || '')
    if (!teamId) return
    const name = String(row.name || row.teamName || '')
    const current = directory.get(teamId)
    if (!current) directory.set(teamId, { teamId, name, divisionId: String(row.divisionId || row.division || 'default'), divisionName: String(row.divisionName || row.division || '') })
    else if (!current.name && name) current.name = name
  })
  teams.value = [...directory.values()].map(team => ({
    ...team,
    name: team.name || team.teamId,
    label: [team.name || team.teamId, team.divisionName].filter(Boolean).join(' · ')
  }))
}

async function loadAll() {
  loading.value = true
  loadError.value = ''
  try {
    const result = await callFunction('resultCenter', { action: 'listDisciplinaryActions', tournamentId })
    if (!result?.success) throw new Error(result?.message || result?.error || '处罚记录加载失败')
    actions.value = result.actions || []
    if (result.tournamentName) tournamentName.value = result.tournamentName
  } catch (error) {
    loadError.value = error.message || '处罚记录加载失败'
    actions.value = []
  } finally {
    loading.value = false
  }
}

async function openCreate() {
  if (!teams.value.length) await loadTeams().catch(() => {})
  form.value = {
    subjectType: 'player', teamId: teams.value[0]?.teamId || '', playerId: '', playerName: '', personName: '',
    types: ['warning'], suspensionMatches: 1, fineAmount: 100, reason: ''
  }
  roster.value = []
  rosterError.value = ''
  draftFiles.value = []
  uploadStage.value = ''
  createVisible.value = true
  if (form.value.teamId) await loadRoster()
}

function onSubjectTypeChange() {
  if (form.value.subjectType === 'staff') {
    form.value.teamId = ''
    form.value.playerId = ''
    form.value.playerName = ''
    roster.value = []
    rosterError.value = ''
    return
  }
  form.value.personName = ''
  if (!form.value.teamId) form.value.teamId = teams.value[0]?.teamId || ''
  if (form.value.subjectType === 'team') { form.value.playerId = ''; form.value.playerName = '' }
  loadRoster()
}
function onTeamChange() {
  form.value.playerId = ''
  form.value.playerName = ''
  if (form.value.subjectType !== 'team') loadRoster()
}
// 处罚球员优先从本队正式名单选择，保证停赛处罚能定位到名单球员。
async function loadRoster() {
  roster.value = []
  rosterError.value = ''
  if (form.value.subjectType !== 'player' || !form.value.teamId) return
  const team = teams.value.find(item => item.teamId === form.value.teamId)
  rosterLoading.value = true
  try {
    const result = await rosterExceptionBoard({ tournamentId, teamId: form.value.teamId, divisionId: team?.divisionId || '', rosterAction: 'listRoster' })
    if (!result?.success) throw new Error(result?.error || '球队名单读取失败')
    roster.value = (result.rows || []).map(player => ({
      playerId: String(player.id || player._id || ''),
      name: String(player.name || ''),
      number: String(player.jerseyNumber || '')
    })).filter(player => player.playerId && player.name)
  } catch (error) {
    rosterError.value = error.message || '球队名单读取失败，请手工填写球员编号'
  } finally {
    rosterLoading.value = false
  }
}
function onPlayerChange(playerId) {
  const player = roster.value.find(item => item.playerId === String(playerId || ''))
  if (player) form.value.playerName = player.name
}

function chooseFiles(item) {
  if (uploading.value) return ElMessage.warning('文书上传中，请稍候')
  supplementTarget.value = item || null
  if (!fileInput.value) return
  fileInput.value.value = ''
  fileInput.value.click()
}
async function onFileChange(event) {
  const input = event.target
  const files = Array.from(input.files || [])
  input.value = ''
  const target = supplementTarget.value
  supplementTarget.value = null
  if (!files.length) return
  if (target) await supplementFiles(target, files)
  else await addDraftFiles(files)
}
function pickFiles(files, allowance) {
  const accepted = []
  for (const file of files) {
    if (!FILE_TYPES.includes(fileExtension(file))) { ElMessage.warning(`${file.name} 格式不支持，仅接收 PDF、Word 文书`); continue }
    if (Number(file.size || 0) > FILE_MAX_BYTES) { ElMessage.warning(`${file.name} 超过 10MB，请压缩后重试`); continue }
    if (accepted.length >= allowance) { ElMessage.warning(`每条处罚最多留存 ${FILE_LIMIT} 个文书`); break }
    accepted.push(file)
  }
  return accepted
}
async function uploadFile(file) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const result = await uploadLargeFileViaCloud(`disciplinary/${tournamentId}/${stamp}/${file.name}`, file, {
    chunkSize: 48 * 1024,
    fallbackChunkSize: 24 * 1024,
    onProgress: (done, total) => { uploadStage.value = `上传 ${file.name} ${done}/${total}` }
  })
  if (!result?.success || !result.fileId) throw new Error(`${file.name} 上传未完成，请重试`)
  return { fileId: result.fileId, name: file.name, size: Number(file.size || 0), type: fileExtension(file) }
}
async function addDraftFiles(files) {
  const accepted = pickFiles(files, FILE_LIMIT - draftFiles.value.length)
  if (!accepted.length) return
  uploading.value = true
  try {
    for (const file of accepted) {
      uploadStage.value = `上传 ${file.name}`
      const uploaded = await uploadFile(file)
      if (createVisible.value) draftFiles.value = [...draftFiles.value, uploaded]
    }
    ElMessage.success('处罚文书已上传，确认追加后随处罚留存')
  } catch (error) { ElMessage.error(error.message || '处罚文书上传失败') }
  finally { uploading.value = false; uploadStage.value = '' }
}
function removeDraftFile(index) {
  draftFiles.value = draftFiles.value.filter((file, position) => position !== index)
}
async function supplementFiles(item, files) {
  const existing = Array.isArray(item.attachments) ? item.attachments.length : 0
  const accepted = pickFiles(files, FILE_LIMIT - existing)
  if (!accepted.length) return
  supplementingId.value = item.id
  uploading.value = true
  try {
    const additions = []
    for (const file of accepted) {
      uploadStage.value = `上传 ${file.name}`
      additions.push(await uploadFile(file))
    }
    const result = await callFunction('resultCenter', { action: 'addDisciplinaryAttachments', tournamentId, id: item.id, attachments: additions })
    if (!result?.success) throw new Error(result?.message || result?.error || '处罚文书留存失败')
    ElMessage.success(result.message || '处罚文书已留存')
    await loadAll()
  } catch (error) { ElMessage.error(error.message || '处罚文书留存失败') }
  finally { uploading.value = false; uploadStage.value = ''; supplementingId.value = '' }
}

async function submit() {
  const value = form.value
  if (!value.types.length) return ElMessage.warning('请选择处罚类型')
  if (value.subjectType !== 'staff' && !value.teamId) return ElMessage.warning('请选择所属参赛球队')
  if (value.subjectType === 'player') {
    if (!String(value.playerName || '').trim()) return ElMessage.warning('请填写处罚球员姓名')
    if (value.types.includes('suspension') && !String(value.playerId || '').trim()) return ElMessage.warning('追加停赛须选择或填写球员编号')
  }
  if (value.subjectType === 'staff' && !String(value.personName || '').trim()) return ElMessage.warning('请填写受处罚工作人员姓名')
  const suspensionMatches = Number(value.suspensionMatches)
  if (value.types.includes('suspension') && (!Number.isInteger(suspensionMatches) || suspensionMatches < 1 || suspensionMatches > 99)) return ElMessage.warning('停赛场次须为1至99的整数')
  const fineAmount = Number(value.fineAmount)
  if (value.types.includes('fine') && (!Number.isFinite(fineAmount) || fineAmount < 0.01 || fineAmount > 999999)) return ElMessage.warning('罚款金额须在0.01至999999之间')
  const reason = String(value.reason || '').trim()
  if (reason.length < 2 || reason.length > 300) return ElMessage.warning('处罚原因须为2至300个字符')
  if (uploading.value) return ElMessage.warning('处罚文书上传中，请稍候')
  saving.value = true
  try {
    const result = await callFunction('resultCenter', {
      action: 'createDisciplinaryAction', tournamentId, subjectType: value.subjectType,
      teamId: value.teamId, playerName: String(value.playerName || '').trim(), playerId: String(value.playerId || '').trim(),
      personName: String(value.personName || '').trim(), types: [...value.types],
      suspensionMatches, fineAmount, reason,
      attachments: draftFiles.value.map(file => ({ fileId: file.fileId, name: file.name, size: file.size, type: file.type }))
    })
    if (!result?.success) throw new Error(result?.message || result?.error || '处罚保存失败')
    createVisible.value = false
    ElMessage.success('处罚已生效')
    await loadAll()
  } catch (error) { ElMessage.error(error.message || '处罚保存失败') }
  finally { saving.value = false }
}

async function revoke(item) {
  try {
    const response = await ElMessageBox.prompt('撤销后该处罚不再生效，记录和撤销原因会保留。', '撤销处罚', {
      confirmButtonText: '确认撤销', cancelButtonText: '取消', inputType: 'textarea',
      inputPlaceholder: '填写撤销原因（2-300字）',
      inputValidator: value => (String(value || '').trim().length >= 2 && String(value || '').trim().length <= 300) || '撤销原因须为2至300个字符'
    })
    const result = await callFunction('resultCenter', { action: 'revokeDisciplinaryAction', tournamentId, id: item.id, reason: String(response.value || '').trim() })
    if (!result?.success) throw new Error(result?.message || result?.error || '撤销失败')
    ElMessage.success(result.message || '处罚已撤销')
    await loadAll()
  } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message || '撤销失败') }
}

onMounted(async () => {
  await loadAll()
  await loadTeams().catch(() => {})
})
</script>

<style scoped>
.discipline-page{display:grid;gap:16px;padding:20px 24px 32px;background:#f6f9f7;min-height:100%}
.discipline-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:18px 20px;border:1px solid #e4ede7;border-radius:16px;background:linear-gradient(135deg,#ffffff,#f3f8f4)}
.hero-main{display:flex;align-items:flex-start;gap:14px;min-width:0}
.hero-mark{display:grid;width:44px;height:44px;flex:none;place-items:center;border-radius:13px;background:#fdeee9;color:#b6422b;font-size:20px}
.hero-copy small{color:#8a988f;font-size:11px;letter-spacing:.06em}
.hero-copy h1{margin:4px 0 6px;color:#1d3226;font-size:22px;line-height:1.3}
.hero-copy p{margin:0;max-width:720px;color:#6c7d72;font-size:12px;line-height:1.65}
.hero-actions{display:flex;flex:none;gap:8px}
.discipline-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.discipline-summary article{display:flex;align-items:baseline;gap:8px;padding:14px 16px;border:1px solid #e7eee9;border-radius:13px;background:#fff}
.discipline-summary small{flex:1;color:#7f8d84;font-size:12px}
.discipline-summary strong{color:#1f3a2a;font-size:22px;line-height:1}
.discipline-summary span{color:#93a097;font-size:11px}
.discipline-summary article.warn strong{color:#b6422b}
.discipline-summary article.muted strong{color:#54675a}
.discipline-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 14px;border:1px solid #e7eee9;border-radius:13px;background:#fff}
.discipline-toolbar .el-input{max-width:280px}
.discipline-toolbar .el-select{width:150px}
.toolbar-count{margin-left:auto;color:#8a988f;font-size:12px}
.discipline-alert{margin:0}
.discipline-section{display:grid;gap:12px}
.section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.section-head h2{margin:0;color:#22352a;font-size:15px}
.section-head p{margin:4px 0 0;color:#8a988f;font-size:12px;line-height:1.55}
.section-count{flex:none;padding:3px 10px;border-radius:99px;background:#fdeee9;color:#b6422b;font-size:11px;font-weight:700}
.discipline-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px;margin:0;padding:0;list-style:none}
.discipline-card{position:relative;padding:14px 15px 11px;border:1px solid #e7ece8;border-left:3px solid #d9563f;border-radius:13px;background:#fff;box-shadow:0 2px 8px rgba(31,58,42,.05)}
.discipline-card.team{border-left-color:#c05a2c}
.discipline-card.staff{border-left-color:#8a6b2f}
.discipline-card>header{display:flex;align-items:center;gap:9px}
.card-mark{display:grid;width:32px;height:32px;flex:none;place-items:center;border-radius:9px;background:#fdeee9;color:#b6422b;font-size:13px;font-weight:800}
.discipline-card.team .card-mark{background:#fdf1e9;color:#b2542a}
.discipline-card.staff .card-mark{background:#f6f1e3;color:#8a6b2f}
.card-subject{flex:1;min-width:0}
.card-subject b{display:block;color:#22352a;font-size:13px;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.card-subject small{display:block;margin-top:2px;color:#8a958d;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.card-status{flex:none;padding:2px 8px;border-radius:99px;border:1px solid #cfe3d7;background:#eef7f1;color:#2f7a52;font-size:10px;font-weight:700}
.card-badges{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}
.badge{padding:2px 8px;border-radius:6px;font-size:11px;font-weight:650}
.badge.scope{background:#eef2ee;color:#54675a}
.card-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
.card-tag{padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700}
.card-tag.danger{background:#fdeceb;color:#c23b2b}
.card-tag.severe{background:#fbe3e0;color:#a32216}
.card-tag.warning{background:#fdf4e3;color:#a97516}
.card-tag.muted{background:#eef2ee;color:#54675a}
.card-reason{margin:9px 0 0;color:#4d5d53;font-size:12px;line-height:1.6}
.card-files{display:flex;flex-wrap:wrap;gap:6px;margin:9px 0 0}
.card-file{display:inline-flex;align-items:center;gap:5px;max-width:100%;padding:4px 8px;border:1px solid #dfe8e2;border-radius:7px;background:#f7faf8;color:#2f5a42;font-size:11px;cursor:pointer}
.card-file span{max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.card-file small{flex:none;color:#8a958d;font-size:10px}
.card-file:hover{border-color:#9dc0ab;background:#eef5f0}
.discipline-card>footer{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:11px;padding-top:8px;border-top:1px dashed #edf1ee;color:#9aa59d;font-size:11px}
.card-actions{display:inline-flex;align-items:center;gap:2px;font-style:normal}
.discipline-empty{display:grid;justify-items:center;gap:5px;padding:30px 16px;border:1px dashed #d7e2da;border-radius:13px;background:#fff;color:#8a988f;text-align:center}
.discipline-empty .el-icon{font-size:22px;color:#5f9c78}
.discipline-empty b{color:#38503f;font-size:13px}
.discipline-empty small{padding:0 10px;font-size:11px;line-height:1.6}
.upload-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.upload-stage{color:#7b877f;font-size:12px}
.upload-list{display:grid;gap:6px;width:100%;margin:6px 0 0;padding:0;list-style:none}
.upload-list li{display:flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid #e5ece7;border-radius:8px;background:#f9fbfa;font-size:12px}
.upload-list li b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#2f4a3a}
.upload-list li small{flex:none;color:#8a958d}
.hidden-input{display:none}
@media (max-width:1100px){.discipline-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.discipline-cards{grid-template-columns:1fr}}
</style>
