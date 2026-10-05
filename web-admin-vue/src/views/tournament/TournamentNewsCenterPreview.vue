<template>
  <main class="news-center">
    <header class="heading">
      <div><h1>新闻中心</h1><p>{{ tournamentName }}</p></div>
      <el-button v-if="canEdit" type="success" @click="openNew">新建新闻</el-button>
    </header>
    <el-alert title="测试版发布也会公开展示，请使用测试赛事。" type="warning" :closable="false" class="load-alert" />

    <nav class="filters" aria-label="新闻状态">
      <button v-for="item in filters" :key="item.id" type="button" :class="{ active: filter === item.id }" @click="filter=item.id">{{ item.label }}</button>
      <span>{{ visibleArticles.length }} 篇</span>
    </nav>
    <el-alert v-if="loadError" :title="loadError" type="warning" :closable="false" class="load-alert" />
    <section class="article-list">
      <button v-for="item in visibleArticles" :key="item.id" type="button" class="article-row" @click="openArticle(item)">
        <img v-if="item.photo || item.cover" :src="item.photo || item.cover" alt="新闻封面">
        <span class="article-copy"><strong>{{ item.title }}</strong><small>{{ kindLabel(item.kind) }} · {{ item.detail }}</small></span>
        <em :class="item.status">{{ statusLabel(item.status) }}</em><span class="arrow">›</span>
      </button>
      <p v-if="!visibleArticles.length" class="empty">当前状态暂无新闻</p>
    </section>

    <el-drawer v-model="editorOpen" :title="editing ? '编辑新闻' : '新建新闻'" size="min(680px,100%)" destroy-on-close>
      <div v-if="!canEdit" class="publisher-review"><h2>{{ form.title }}</h2><p>{{ form.body }}</p><img v-if="form.photos.length" :src="form.photos[0]" alt="新闻封面"><footer><el-button @click="showPreview">预览</el-button><el-button v-if="canPublish && editingStatus === 'published'" type="warning" plain :loading="saving" @click="withdrawNews">撤回</el-button><el-button v-if="canPublish && editingStatus !== 'published'" type="success" :loading="saving" @click="publishNews">发布到H5</el-button></footer></div>
      <div v-else class="editor">
        <el-alert v-if="draftConflict" title="草稿已在其他设备更新" type="warning" :closable="false">
          <p class="conflict-copy">当前编辑内容仍保留。载入最新版本会替换当前内容。</p>
          <div class="conflict-actions">
            <el-button size="small" @click="reloadLatestDraft">载入最新版本</el-button>
            <el-button size="small" type="primary" plain @click="forkConflictDraft">另存为新草稿</el-button>
          </div>
        </el-alert>
        <label>类型</label>
        <el-select v-model="form.kind" @change="onKindChange">
          <el-option label="单场新闻" value="match" /><el-option label="每日新闻" value="daily" />
        </el-select>
        <label>比赛日期</label>
        <el-select v-model="form.date" placeholder="选择比赛日" :disabled="loadingMatches" @change="onDateChange">
          <el-option v-for="date in approvedDates" :key="date" :value="date" :label="`${date} · ${dayMatches(date).length} 场`" />
        </el-select>
        <template v-if="form.kind === 'match'">
          <label>关联比赛 · 已归档 {{ dayMatches(form.date).length }} 场</label>
          <el-select v-model="form.matchId" :placeholder="form.date ? '选择比赛' : '先选比赛日'" :disabled="loadingMatches || !form.date" @change="onMatchChange">
            <el-option v-for="match in dayMatches(form.date)" :key="match.id" :value="match.id" :label="matchLabel(match)" />
          </el-select>
        </template>
        <template v-if="form.kind === 'match'"><label>比赛图片 · 最多3张</label>
        <div class="photo-manager" @dragover.prevent @drop.prevent="dropPhotoFiles">
          <div v-for="(photo,index) in form.photos" :key="photo" class="photo-item" draggable="true" @dragstart="startPhotoDrag(index)" @dragover.prevent @drop.stop.prevent="dropOnPhoto($event,index)">
            <img :src="photo" :alt="index === 0 ? '封面图片' : `比赛现场照片${index+1}`">
            <strong v-if="index === 0" class="cover-badge">封面</strong><small v-else class="photo-order">{{ index + 1 }}</small>
            <button type="button" class="remove-photo" :aria-label="`删除第${index+1}张图片`" @click="removePhoto(index)">×</button>
          </div>
          <label v-if="form.photos.length < 3" class="photo-select" @dragover.prevent>选择或拖入照片<input type="file" accept="image/*" multiple @change="selectPhotos"></label>
          <div class="photo-limit" :class="{ full: form.photos.length === 3 }">{{ form.photos.length }}/3 · 首张为封面，可拖动调整顺序</div>
        </div></template>
        <img v-if="!form.photos.length && coverUrl" class="cover-preview" :src="coverUrl" alt="自动生成的比赛战报封面">
        <template v-if="form.kind === 'daily'">
          <label>积分榜快照</label>
          <el-checkbox v-model="form.includeStandings" @change="onStandingsChange">附正式积分榜</el-checkbox>
          <span v-if="standingsError" class="hint">{{ standingsError }}</span>
          <img v-if="standingsSnapshotUrl" class="standings-preview" :src="standingsSnapshotUrl" alt="正式积分榜快照">
          <label>停赛信息</label>
          <el-input v-model="form.suspensionNote" type="textarea" :rows="2" maxlength="300" placeholder="仅填写主办方已确认名单" @change="clearGenerated" />
        </template>
        <template v-else><label>现场看点</label><el-input v-model="form.note" type="textarea" :rows="2" maxlength="500" placeholder="只填写已核实的信息" /></template>
        <el-button type="success" plain :loading="generating" :disabled="!(form.kind === 'daily' ? form.date : form.matchId) || loadingMatches" @click="generate">生成新闻</el-button>
        <label>标题</label><el-input v-model="form.title" maxlength="80" />
        <template v-if="form.kind === 'daily'"><label>内容预览</label><NewsDailyContent v-if="form.dayResults.length" :results="form.dayResults" :fixtures="form.nextFixtures" :standings-image="standingsSnapshotUrl" :suspension-note="form.suspensionNote" /></template>
        <template v-else><label>正文</label><el-input v-model="form.body" type="textarea" :rows="10" maxlength="1800" /></template>
        <footer><el-button @click="showPreview">预览</el-button><el-button v-if="canEdit" :loading="saving" @click="saveDraft">存草稿</el-button><el-button v-if="canPublish && editingStatus === 'published'" type="warning" plain :loading="saving" @click="withdrawNews">撤回</el-button><el-button v-if="canPublish && editingStatus !== 'published'" type="success" :loading="saving" @click="publishNews">发布到H5</el-button></footer>
      </div>
    </el-drawer>
    <el-dialog v-model="previewOpen" :title="form.title || '新闻预览'" width="min(660px,94vw)">
      <article class="article-preview"><img v-if="form.kind === 'match' && form.photos.length" :src="form.photos[0]" alt="封面图片"><img v-else-if="coverUrl" :src="coverUrl" alt="新闻封面"><NewsDailyContent v-if="form.kind === 'daily'" :results="form.dayResults" :fixtures="form.nextFixtures" :standings-image="standingsSnapshotUrl" :suspension-note="form.suspensionNote" /><template v-else><template v-for="(block,index) in previewBlocks" :key="index"><p v-if="block.text">{{ block.text }}</p><img v-for="(photo,photoIndex) in block.photos" :key="`${index}-${photoIndex}`" :src="photo" alt="比赛现场照片"></template></template></article>
      <template #footer><el-button @click="previewOpen=false">关闭</el-button></template>
    </el-dialog>
  </main>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { callFunction, getFileUrl, uploadLargeFileViaCloud, uploadImageViaWebApi } from '@/utils/cloud'
import { createMatchNewsCover, createDailyNewsCover, createStandingsNewsSnapshot } from '@/utils/newsCover'
import NewsDailyContent from './NewsDailyContent.vue'

const route = useRoute()
const tournamentId = String(route.params.id || '')
const isStaff = ref(false), canEdit = ref(false), canPublish = ref(false)
const generateUrl = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/newsPreviewGenerate'
const tournamentName = ref('当前赛事')
const matches = ref([]), loadingMatches = ref(true), loadError = ref('')
const standingsSnapshotUrl = ref(''), standingsError = ref('')
const editorOpen = ref(false), previewOpen = ref(false), generating = ref(false), saving = ref(false), draftConflict = ref(false), editing = ref(''), editingStatus = ref(''), filter = ref('all')
const coverUrl = ref('')
const filters = [{ id: 'all', label: '全部' }, { id: 'published', label: '已发布' }, { id: 'draft', label: '草稿' }, { id: 'update', label: '待更新' }]
const articles = ref([])
const visibleArticles = computed(() => articles.value.filter(item => filter.value === 'all' || item.status === filter.value))
function matchSequenceValue(match) {
  const parts = String(match.matchNo || '').match(/\d+/g) || []
  return parts.length ? Number(parts.at(-1)) : Number.MAX_SAFE_INTEGER
}
const approvedMatches = computed(() => matches.value.filter(item => item.resultStatus === 'approved').sort((a, b) =>
  matchSequenceValue(a) - matchSequenceValue(b) ||
  String(a.matchDate || '').localeCompare(String(b.matchDate || '')) ||
  String(a.matchTime || '').localeCompare(String(b.matchTime || '')) ||
  String(a.id || '').localeCompare(String(b.id || ''))
))
const approvedDates = computed(() => [...new Set(approvedMatches.value.map(item => item.matchDate).filter(Boolean))].sort().reverse())
const dayMatches = date => approvedMatches.value.filter(item => item.matchDate === date)
const form = reactive({ kind: 'match', matchId: '', date: '', matchIds: [], dayResults: [], nextFixtures: [], newsId: '', title: '', body: '', note: '', suspensionNote: '', includeStandings: true, photos: [], photoFiles: [], photoFileIds: [], coverFileId: '', standingsSnapshotFileId: '' })
const draggingPhotoIndex = ref(-1)
const selectedMatch = computed(() => matches.value.find(item => item.id === form.matchId) || null)
const previewBlocks = computed(() => {
  let paragraphs = String(form.body || '').split(/\n\s*\n/).map(item => item.trim()).filter(Boolean)
  if (paragraphs.length === 1 && form.photos.length > 1) paragraphs = paragraphs[0].match(/[^。！？]+[。！？]?/g)?.map(item => item.trim()).filter(Boolean) || paragraphs
  if (!paragraphs.length) return []
  const slots = paragraphs.map(() => [])
  form.photos.slice(1).forEach((photo, index) => {
    const target = Math.min(paragraphs.length - 1, Math.floor(((index + 1) * paragraphs.length) / (form.photos.length + 1)))
    slots[target].push(photo)
  })
  return paragraphs.map((text, index) => ({ text, photos: slots[index] }))
})
const kindLabel = kind => ({ match: '单场新闻', daily: '每日新闻' })[kind] || '新闻'
const statusLabel = status => ({ published: '已发布', draft: '草稿', update: '待更新', withdrawn: '已撤回' })[status] || '草稿'
const matchLabel = match => [`场序${match.matchNo || '—'}`, `${match.matchDate || '日期待定'} ${match.matchTime || '时间待定'}`, match.divisionName, `${match.homeTeamName} 对 ${match.awayTeamName}`, `${match.homeScore}:${match.awayScore}`].filter(Boolean).join(' · ')

async function loadMatches() {
  loadingMatches.value = true; loadError.value = ''
  try {
    const result = await callFunction('resultCenter', { action: 'dashboard', tournamentId })
    if (!result?.success) throw new Error(result?.message || '比赛加载失败')
    matches.value = result.matches || []
    tournamentName.value = result.tournament?.name || '当前赛事'
    if (form.kind === 'match' && form.matchId && selectedMatch.value) form.date = selectedMatch.value.matchDate || ''
    if (form.kind === 'daily' && !form.date) form.date = approvedDates.value[0] || ''
    updateCover()
  } catch (error) { loadError.value = error.message || '比赛加载失败，请刷新重试' }
  finally { loadingMatches.value = false }
}

async function loadNews() {
  try {
    const result = await callFunction('newsCenter', { action: 'list', tournamentId })
    if (!result?.success) throw new Error(result?.message || result?.error || '新闻列表加载失败')
    articles.value = await Promise.all((result.articles || []).map(async item => {
      const photoFileIds = Array.isArray(item.photoFileIds) ? item.photoFileIds : []
      const [cover, photos, standingsSnapshot] = await Promise.all([
        item.coverFileId ? getFileUrl(item.coverFileId) : Promise.resolve(''),
        Promise.all(photoFileIds.map(getFileUrl)),
        item.standingsSnapshotFileId ? getFileUrl(item.standingsSnapshotFileId) : Promise.resolve('')
      ])
      const dateLabel = item.date || ((item.matchIds || []).length ? `${item.matchIds.length}场比赛` : '')
      return { ...item, id: item._id || item.id, rawStatus: item.status, status: item.needsUpdate ? 'update' : item.status, cover, photos, photo: photos[0] || cover, standingsSnapshot, detail: `${dateLabel}${item.needsUpdate ? ' · 赛果有更新' : item.status === 'published' ? ' · 已发布到H5' : ' · 云端草稿'}` }
    }))
    loadError.value = ''
    return true
  } catch (error) { loadError.value = error.message || '新闻列表加载失败，请刷新重试'; return false }
}

function reset() { Object.assign(form, { kind: 'match', matchId: '', date: '', matchIds: [], dayResults: [], nextFixtures: [], newsId: '', version: 0, title: '', body: '', note: '', suspensionNote: '', includeStandings: true, photos: [], photoFiles: [], photoFileIds: [], coverFileId: '', standingsSnapshotFileId: '' }); coverUrl.value = ''; standingsSnapshotUrl.value = ''; standingsError.value = ''; draftConflict.value = false; editing.value = ''; editingStatus.value = '' }
function updateCover() { coverUrl.value = form.kind === 'daily' ? createDailyNewsCover(form.date, tournamentName.value, form.matchIds.length || dayMatches(form.date).length) : createMatchNewsCover(selectedMatch.value, tournamentName.value) }
function clearGenerated() { form.title = ''; form.body = ''; form.matchIds = []; form.dayResults = []; form.nextFixtures = []; form.coverFileId = ''; form.standingsSnapshotFileId = ''; standingsSnapshotUrl.value = ''; standingsError.value = '' }
function onStandingsChange() { clearGenerated(); updateCover() }
function onMatchChange() { clearGenerated(); updateCover() }
function onDateChange() { if (form.kind === 'match') { form.matchId = ''; form.photos = []; form.photoFiles = []; form.photoFileIds = [] }; clearGenerated(); updateCover() }
function onKindChange() {
  form.matchId = ''; form.date = form.kind === 'daily' ? approvedDates.value[0] || '' : ''; form.photos = []; form.photoFiles = []; form.photoFileIds = []; clearGenerated(); updateCover()
}
function openNew() { reset(); editorOpen.value = true; loadMatches() }
function openArticle(item) { reset(); editing.value = item.id; editingStatus.value = item.rawStatus || item.status; Object.assign(form, { kind: item.kind, matchId: item.matchId || '', date: item.date || '', matchIds: item.matchIds || [], dayResults: item.dayResults || [], nextFixtures: item.nextFixtures || [], newsId: item.id, version: Number(item.version || 1), title: item.title, body: item.body || '', includeStandings: Boolean(item.standingsSnapshotFileId), suspensionNote: item.suspensionNote || '', photos: item.photos || (item.photo ? [item.photo] : []), photoFiles: (item.photos || []).map(() => null), photoFileIds: item.photoFileIds || [], coverFileId: item.coverFileId || '', standingsSnapshotFileId: item.standingsSnapshotFileId || '' }); coverUrl.value = item.cover || ''; standingsSnapshotUrl.value = item.standingsSnapshot || ''; editorOpen.value = true; loadMatches() }
function isVersionConflict(error) { return /(?:草稿|新闻)已在其他设备更新/.test(String(error?.message || error || '')) }
async function handleNewsActionError(error, fallback) {
  if (isVersionConflict(error)) {
    draftConflict.value = true
    await loadNews()
    ElMessage.warning('云端草稿已更新，当前编辑内容已保留')
    return
  }
  ElMessage.error(error?.message || fallback)
}
async function reloadLatestDraft() {
  const newsId = String(form.newsId || '')
  if (!newsId) return ElMessage.warning('当前新闻尚未保存为草稿')
  if (!await loadNews()) return ElMessage.error(loadError.value || '新闻列表加载失败，请重试')
  const latest = articles.value.find(item => String(item.id) === newsId)
  if (!latest) return ElMessage.error('云端草稿已不存在，请另存为新草稿')
  try {
    await ElMessageBox.confirm('载入最新版本会替换当前编辑内容，未保存的修改将丢失。', '载入最新版本', { confirmButtonText: '载入', cancelButtonText: '继续编辑', type: 'warning' })
    openArticle(latest)
    ElMessage.success('已载入云端最新版本')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error?.message || '载入失败')
  }
}
function forkConflictDraft() {
  if (!draftConflict.value) return
  form.newsId = ''
  form.version = 0
  editing.value = ''
  editingStatus.value = ''
  draftConflict.value = false
  ElMessage.info('当前编辑已切换为新草稿；核对内容后再保存或发布')
}
function addPhotos(files) {
  const selected = Array.from(files || []).filter(file => file.type.startsWith('image/'))
  const remaining = 3 - form.photos.length
  if (selected.length > remaining) ElMessage.warning(`最多3张，还能添加${remaining}张`)
  const accepted = selected.slice(0, remaining)
  form.photos = [...form.photos, ...accepted.map(file => URL.createObjectURL(file))]
  form.photoFiles = [...form.photoFiles, ...accepted]
  form.photoFileIds = [...form.photoFileIds, ...accepted.map(() => '')]
}
function selectPhotos(event) {
  addPhotos(event.target.files)
  event.target.value = ''
}
function dropPhotoFiles(event) {
  if (event.dataTransfer?.files?.length) addPhotos(event.dataTransfer.files)
}
function startPhotoDrag(index) { draggingPhotoIndex.value = index }
function dropOnPhoto(event, index) {
  if (event.dataTransfer?.files?.length) { addPhotos(event.dataTransfer.files); draggingPhotoIndex.value = -1; return }
  dropPhotoOrder(index)
}
function dropPhotoOrder(targetIndex) {
  const sourceIndex = draggingPhotoIndex.value
  if (sourceIndex < 0 || sourceIndex === targetIndex) return
  const photos = [...form.photos]
  const [photo] = photos.splice(sourceIndex, 1)
  photos.splice(targetIndex, 0, photo)
  form.photos = photos
  const files = [...form.photoFiles], [file] = files.splice(sourceIndex, 1); files.splice(targetIndex, 0, file); form.photoFiles = files
  const ids = [...form.photoFileIds], [fileId] = ids.splice(sourceIndex, 1); ids.splice(targetIndex, 0, fileId); form.photoFileIds = ids
  draggingPhotoIndex.value = -1
}
function removePhoto(index) {
  const [photo] = form.photos.splice(index, 1)
  if (String(photo).startsWith('blob:')) URL.revokeObjectURL(photo)
  form.photoFiles.splice(index, 1); form.photoFileIds.splice(index, 1)
}
async function generate() {
  if (!(form.kind === 'daily' ? form.date : form.matchId)) return
  const token = localStorage.getItem('authToken') || ''
  if (!token) return ElMessage.warning('请先登录主办方 PC 后台')
  generating.value = true
  try {
    const requestBody = JSON.stringify({ authToken: token, tournamentId, matchId: form.matchId, date: form.date, kind: form.kind, note: form.note, includeStandings: form.kind === 'daily' && form.includeStandings, suspensionNote: form.suspensionNote })
    let response
    for (let attempt = 0; attempt < 2; attempt += 1) {
      response = await fetch(generateUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: requestBody })
      if (response.status !== 429 || attempt === 1) break
      await new Promise(resolve => setTimeout(resolve, 800))
    }
    if (response.status === 429) throw new Error('服务繁忙，请稍后再生成')
    const result = await response.json()
    if (!result?.success) throw new Error(result?.message || '生成失败')
    const snapshot = result.standingsSnapshot?.tables?.length ? createStandingsNewsSnapshot(result.standingsSnapshot.tables, tournamentName.value, form.date) : ''
    if (form.kind === 'daily' && form.includeStandings && !snapshot) throw new Error('积分榜快照生成失败，请重试')
    form.title = result.title; form.body = result.body; form.matchIds = result.matchIds || (form.matchId ? [form.matchId] : []); form.dayResults = result.dayResults || []; form.nextFixtures = result.nextFixtures || []; standingsSnapshotUrl.value = snapshot; standingsError.value = ''; updateCover()
    ElMessage.success('标题和正文已生成')
  } catch (error) { standingsError.value = error.message || '生成失败，请重试'; ElMessage.error(standingsError.value) }
  finally { generating.value = false }
}
function showPreview() { if (!form.title.trim() || !form.body.trim()) return ElMessage.warning('请填写标题和正文'); previewOpen.value = true }
function dataUrlFile(dataUrl, filename) {
  const [header, encoded] = String(dataUrl || '').split(',')
  if (!header || !encoded) throw new Error('封面图片格式不正确')
  const mime = header.match(/^data:([^;]+)/)?.[1] || 'image/png'
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new File([bytes], filename, { type: mime })
}
async function uploadNewsAssets() {
  const uploadNewsFile = file => isStaff.value
    ? uploadImageViaWebApi(`tournament-news/${tournamentId}`, file, tournamentId)
    : uploadLargeFileViaCloud(`tournament-news/${tournamentId}/${file.name}`, file, { fallbackChunkSize: 32 * 1024 })
  const photoFileIds = [...form.photoFileIds]
  for (let index = 0; index < form.photos.length; index += 1) {
    if (photoFileIds[index]) continue
    const file = form.photoFiles[index]
    if (file) {
      const uploaded = await uploadNewsFile(file)
      photoFileIds[index] = uploaded.fileId
      form.photoFiles[index] = null
      form.photoFileIds[index] = uploaded.fileId
    } else if (String(form.photos[index]).startsWith('cloud://')) photoFileIds[index] = form.photos[index]
  }
  let coverFileId = photoFileIds[0] || form.coverFileId
  if (!coverFileId && coverUrl.value) {
    const uploaded = await uploadNewsFile(dataUrlFile(coverUrl.value, 'news-cover.png'))
    coverFileId = uploaded.fileId
    form.coverFileId = coverFileId
  }
  let standingsSnapshotFileId = form.standingsSnapshotFileId
  if (!standingsSnapshotFileId && standingsSnapshotUrl.value) {
    const uploaded = await uploadNewsFile(dataUrlFile(standingsSnapshotUrl.value, 'standings-snapshot.png'))
    standingsSnapshotFileId = uploaded.fileId
    form.standingsSnapshotFileId = standingsSnapshotFileId
  }
  return { photoFileIds, coverFileId, standingsSnapshotFileId }
}
async function saveDraftData() {
  if (!form.title.trim()) throw new Error('请填写标题')
  const imageFiles = await uploadNewsAssets()
  const result = await callFunction('newsCenter', { action: 'saveDraft', tournamentId, newsId: form.newsId, version: form.version, kind: form.kind, matchId: form.matchId, date: form.date, matchIds: form.matchIds, dayResults: form.dayResults, nextFixtures: form.nextFixtures, title: form.title.trim(), body: form.body.trim(), suspensionNote: form.suspensionNote, coverFileId: imageFiles.coverFileId, photoFileIds: imageFiles.photoFileIds, standingsSnapshotFileId: imageFiles.standingsSnapshotFileId })
  if (!result?.success) throw new Error(result?.message || result?.error || '保存草稿失败')
  form.newsId = result.newsId
  form.version = result.version
  editing.value = result.newsId
  editingStatus.value = 'draft'
  draftConflict.value = false
  return result.newsId
}
async function saveDraft() {
  if (saving.value) return
  saving.value = true
  try { await saveDraftData(); await loadNews(); editorOpen.value = false; ElMessage.success('草稿已保存') }
  catch (error) { await handleNewsActionError(error, '保存失败') }
  finally { saving.value = false }
}
async function publishNews() {
  if (!form.body.trim()) return ElMessage.warning('请先生成或填写正文')
  if (saving.value) return
  saving.value = true
  try {
    const newsId = canEdit.value ? await saveDraftData() : form.newsId
    if (!newsId) throw new Error('请选择已有草稿')
    const result = await callFunction('newsCenter', { action: 'publish', tournamentId, newsId, version: form.version })
    if (!result?.success) throw new Error(result?.message || result?.error || '发布失败')
    form.version = result.version ?? Number(form.version || 1) + 1
    draftConflict.value = false
    await loadNews(); editorOpen.value = false; ElMessage.success('新闻已发布到 H5')
  } catch (error) { await handleNewsActionError(error, '发布失败') }
  finally { saving.value = false }
}
async function withdrawNews() {
  if (!form.newsId || saving.value) return
  saving.value = true
  try {
    const result = await callFunction('newsCenter', { action: 'withdraw', tournamentId, newsId: form.newsId, version: form.version })
    if (!result?.success) throw new Error(result?.message || result?.error || '撤回失败')
    form.version = result.version ?? Number(form.version || 1) + 1
    draftConflict.value = false
    await loadNews(); editorOpen.value = false; ElMessage.success('新闻已从 H5 撤回')
  } catch (error) { await handleNewsActionError(error, '撤回失败') }
  finally { saving.value = false }
}
onMounted(async () => {
  try {
    const [own, managed] = await Promise.all([
      callFunction('tournamentStaffAccess', { action: 'mine' }),
      callFunction('tournamentStaffAccess', { action: 'managed' }).catch(() => null)
    ])
    const rights = (own?.grants || []).filter(row => row.tournamentId === tournamentId).flatMap(row => row.permissions || [])
    isStaff.value = rights.length > 0 && !managed?.success
    canEdit.value = !isStaff.value || rights.includes('event.news') || rights.includes('news.edit')
    canPublish.value = !isStaff.value || rights.includes('event.news') || rights.includes('news.publish')
  } catch (error) { canEdit.value = false; canPublish.value = false; loadError.value = error.message || '权限读取失败，请刷新'; return }
  loadMatches(); loadNews()
})
</script>

<style scoped>
.publisher-review{display:grid;gap:16px;padding:10px 14px}.publisher-review h2{font-size:21px;margin:0}.publisher-review p{white-space:pre-wrap;line-height:1.7}.publisher-review img{max-width:100%;height:auto}.publisher-review footer{display:flex;justify-content:flex-end;gap:8px}
.news-center{padding:24px 30px;color:#173025}.heading{display:flex;justify-content:space-between;align-items:end;gap:20px;margin-bottom:27px}.heading h1{font-size:26px;margin:18px 0 5px}.heading p{margin:0;color:#748379}.preview-label{display:inline-block;padding:5px 9px;background:#eaf6ee;border:1px solid #cae4d1;border-radius:4px;color:#126845;font-size:12px}.filters{display:flex;align-items:center;gap:28px;border-bottom:1px solid #dce6df}.filters button{border:0;border-bottom:3px solid transparent;padding:13px 2px;background:transparent;color:#687a6e;cursor:pointer}.filters button.active{color:#087e4b;border-bottom-color:#078a50;font-weight:700}.filters span{margin-left:auto;color:#748379;font-size:13px}.load-alert{margin-top:18px}.article-list{margin-top:5px;background:#fff;border:1px solid #e0e8e2;border-radius:7px}.article-row{display:flex;align-items:center;gap:18px;width:100%;padding:15px 20px;border:0;border-bottom:1px solid #e6ede7;background:#fff;text-align:left;color:inherit;cursor:pointer}.article-row:last-child{border-bottom:0}.article-row:hover{background:#f9fcfa}.article-row img{width:112px;height:72px;object-fit:cover}.article-copy{display:grid;gap:8px;flex:1;min-width:0}.article-copy strong{font-size:16px}.article-copy small{font-size:12px;color:#708076}.article-row em{font-size:12px;font-style:normal;padding:4px 8px;border-radius:4px;color:#117845;background:#e8f7ee}.article-row em.draft{color:#647268;background:#f0f2f0}.article-row em.update{color:#a96116;background:#fff1de}.arrow{color:#92a298;font-size:22px}.empty{padding:70px 20px;text-align:center;color:#748379}.editor{display:grid;gap:12px;padding:0 10px 30px}.editor>label{font-weight:600;margin-top:7px}.photo-manager{display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap;min-height:86px;padding:4px 0}.photo-item{position:relative;width:116px;height:82px;flex:none;cursor:grab;border:1px solid #dfe8e1;background:#f6faf7}.photo-item:active{cursor:grabbing}.photo-item img{width:100%;height:100%;object-fit:cover}.cover-badge,.photo-order{position:absolute;left:5px;top:5px;padding:3px 6px;border-radius:3px;background:rgba(4,63,40,.88);color:#fff;font-size:11px;font-weight:600}.photo-order{background:rgba(20,35,26,.72)}.remove-photo{position:absolute;right:4px;top:4px;width:22px;height:22px;border:0;border-radius:50%;background:rgba(25,35,28,.76);color:#fff;font-size:16px;line-height:20px;cursor:pointer}.photo-select{display:grid;place-items:center;width:116px;height:82px;border:1px dashed #9dbda7;color:#087b48;cursor:pointer;background:#fff;font-size:13px;text-align:center}.photo-select:hover{background:#f4faf6}.photo-select input{display:none}.photo-limit{flex-basis:100%;color:#687a6e;font-size:12px}.photo-limit.full{color:#a96116}.cover-preview{display:block;width:100%;max-width:360px;height:auto}.hint{font-size:12px;color:#a46523}.editor footer{display:flex;justify-content:flex-end;gap:8px;margin-top:12px;padding-top:16px;border-top:1px solid #e0e8e2}.article-preview p{white-space:pre-wrap;line-height:1.8}.article-preview img{display:block;width:100%;height:auto;margin:14px 0}.conflict-copy{margin:0 0 8px}.conflict-actions{display:flex;flex-wrap:wrap;gap:8px}
</style>
<style scoped>
.standings-preview{display:block;width:100%;max-width:360px;max-height:300px;object-fit:contain;object-position:top;border:1px solid #dce7df;background:#fff}
</style>
