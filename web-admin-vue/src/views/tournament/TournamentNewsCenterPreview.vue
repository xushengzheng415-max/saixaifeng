<template>
  <main class="news-center">
    <header class="heading">
      <div><span class="preview-label">测试预览 · 新闻不会公开发布</span><h1>新闻中心</h1><p>{{ tournamentName }}</p></div>
      <el-button type="success" @click="openNew">新建新闻</el-button>
    </header>

    <nav class="filters" aria-label="新闻状态">
      <button v-for="item in filters" :key="item.id" type="button" :class="{ active: filter === item.id }" @click="filter=item.id">{{ item.label }}</button>
      <span>{{ visibleArticles.length }} 篇</span>
    </nav>
    <el-alert v-if="loadError" :title="loadError" type="warning" :closable="false" class="load-alert" />
    <section class="article-list">
      <button v-for="item in visibleArticles" :key="item.id" type="button" class="article-row" @click="openArticle(item)">
        <img :src="item.photo || samplePhoto" alt="赛事照片">
        <span class="article-copy"><strong>{{ item.title }}</strong><small>{{ kindLabel(item.kind) }} · {{ item.detail }}</small></span>
        <em :class="item.status">{{ statusLabel(item.status) }}</em><span class="arrow">›</span>
      </button>
      <p v-if="!visibleArticles.length" class="empty">当前状态暂无新闻</p>
    </section>

    <el-drawer v-model="editorOpen" :title="editing ? '编辑新闻' : '新建新闻'" size="min(680px,100%)" destroy-on-close>
      <div class="editor">
        <label>类型</label>
        <el-select v-model="form.kind" @change="onKindChange">
          <el-option label="现场快讯" value="flash" :disabled="selectedApproved" /><el-option label="单场新闻" value="match" :disabled="Boolean(selectedMatch) && !selectedApproved" /><el-option label="每轮综述" value="round" />
        </el-select>
        <label>关联比赛</label>
        <el-select v-model="form.matchId" placeholder="选择比赛" :disabled="form.kind==='round' || loadingMatches" @change="onMatchChange">
          <el-option v-for="match in eligibleMatches" :key="match.id" :value="match.id" :label="matchLabel(match)" />
        </el-select>
        <label>现场照片</label>
        <div class="photos"><img v-for="photo in form.photos" :key="photo" :src="photo" alt="赛事照片"><label class="photo-select">选择照片<input type="file" accept="image/*" multiple @change="selectPhotos"></label></div>
        <label>现场看点</label>
        <el-input v-model="form.note" type="textarea" :rows="2" maxlength="500" placeholder="只填写已核实的信息" />
        <el-button type="success" plain :loading="generating" :disabled="!form.matchId || form.kind==='round' || loadingMatches" @click="generate">生成新闻</el-button>
        <span v-if="form.kind==='round'" class="hint">每轮综述需选择多场正式比赛，当前测试页先验单场生成。</span>
        <label>标题</label><el-input v-model="form.title" maxlength="80" />
        <label>正文</label><el-input v-model="form.body" type="textarea" :rows="10" maxlength="1500" />
        <footer><el-button @click="showPreview">预览</el-button><el-button @click="saveLocal">存草稿</el-button><el-button type="success" @click="publishLocal">模拟发布</el-button></footer>
      </div>
    </el-drawer>
    <el-dialog v-model="previewOpen" :title="form.title || '新闻预览'" width="min(660px,94vw)">
      <article class="article-preview"><p>{{ form.body }}</p><img v-for="photo in form.photos" :key="photo" :src="photo" alt="赛事照片"></article>
      <template #footer><el-button @click="previewOpen=false">关闭</el-button></template>
    </el-dialog>
  </main>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { callFunction } from '@/utils/cloud'
import { newsKindForMatch } from '@/utils/newsPreviewKind'

const route = useRoute()
const tournamentId = String(route.params.id || '')
const samplePhoto = '/preview/news-center-style-20260930/hero.jpg'
const generateUrl = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/newsPreviewGenerate'
const tournamentName = ref('当前赛事')
const matches = ref([]), loadingMatches = ref(true), loadError = ref('')
const editorOpen = ref(false), previewOpen = ref(false), generating = ref(false), editing = ref(''), filter = ref('all')
const filters = [{ id: 'all', label: '全部' }, { id: 'published', label: '已发布' }, { id: 'draft', label: '草稿' }, { id: 'update', label: '待更新' }]
const articles = ref([
  { id: 'sample-1', title: '开封U40队 5:1 开封市老友足球二队 · 赛后新闻示例', kind: 'match', status: 'published', detail: '9 月 26 日 · 示例稿，不在 H5 展示', photo: samplePhoto },
  { id: 'sample-2', title: '老年组赛后新闻草稿示例', kind: 'match', status: 'draft', detail: '示例稿 · 未保存到云端', photo: samplePhoto },
  { id: 'sample-3', title: '青年组本轮赛事综述示例', kind: 'round', status: 'update', detail: '示例稿 · 赛果更新待修订', photo: samplePhoto }
])
const visibleArticles = computed(() => articles.value.filter(item => filter.value === 'all' || item.status === filter.value))
const eligibleMatches = computed(() => matches.value.filter(item => !['warning', 'returned'].includes(item.resultStatus)))
const form = reactive({ kind: 'flash', matchId: '', title: '', body: '', note: '', photos: [samplePhoto] })
const selectedMatch = computed(() => matches.value.find(item => item.id === form.matchId) || null)
const selectedApproved = computed(() => selectedMatch.value?.resultStatus === 'approved')
const kindLabel = kind => ({ flash: '现场快讯', match: '单场新闻', round: '每轮综述' })[kind] || '新闻'
const statusLabel = status => ({ published: '已发布 · 示例', draft: '草稿 · 示例', update: '待更新 · 示例' })[status] || '草稿'
const matchLabel = match => [match.matchDate, match.divisionName, `${match.homeTeamName} 对 ${match.awayTeamName}`, match.resultStatus === 'approved' ? '正式赛果' : '赛果待确认'].filter(Boolean).join(' · ')

async function loadMatches() {
  loadingMatches.value = true; loadError.value = ''
  try {
    const result = await callFunction('resultCenter', { action: 'dashboard', tournamentId })
    if (!result?.success) throw new Error(result?.message || '比赛加载失败')
    matches.value = result.matches || []
    tournamentName.value = result.tournament?.name || '当前赛事'
    if (editorOpen.value && !form.matchId) selectDefaultMatch()
  } catch (error) { loadError.value = error.message || '比赛加载失败，请刷新重试' }
  finally { loadingMatches.value = false }
}

function reset() { Object.assign(form, { kind: 'flash', matchId: '', title: '', body: '', note: '', photos: [samplePhoto] }); editing.value = '' }
function selectDefaultMatch() {
  const approved = matches.value.find(item => item.resultStatus === 'approved')
  if (approved) { form.matchId = approved.id; form.kind = newsKindForMatch(approved) }
}
function onMatchChange() { form.kind = newsKindForMatch(selectedMatch.value) }
function onKindChange() {
  if (form.kind === 'round') { form.matchId = ''; return }
  if (selectedMatch.value) form.kind = newsKindForMatch(selectedMatch.value)
}
function openNew() { reset(); selectDefaultMatch(); editorOpen.value = true }
function openArticle(item) { reset(); editing.value = item.id; Object.assign(form, { kind: item.kind, title: item.title, body: item.body || '', photos: [item.photo || samplePhoto] }); editorOpen.value = true }
function selectPhotos(event) {
  const files = Array.from(event.target.files || []).filter(file => file.type.startsWith('image/')).slice(0, 6)
  event.target.value = ''
  if (files.length) form.photos = files.map(file => URL.createObjectURL(file))
}
async function generate() {
  if (!form.matchId || form.kind === 'round') return
  if (selectedApproved.value && form.kind !== 'match') form.kind = newsKindForMatch(selectedMatch.value)
  if (!selectedApproved.value && form.kind === 'match') return ElMessage.warning('赛果未确认，请先生成现场快讯')
  const token = localStorage.getItem('authToken') || ''
  if (!token) return ElMessage.warning('请先登录主办方 PC 后台')
  generating.value = true
  try {
    const response = await fetch(generateUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ authToken: token, tournamentId, matchId: form.matchId, kind: form.kind, note: form.note }) })
    const result = await response.json()
    if (!result?.success) throw new Error(result?.message || '生成失败')
    form.title = result.title; form.body = result.body
    ElMessage.success('标题和正文已生成')
  } catch (error) { ElMessage.error(error.message || '生成失败，请重试') }
  finally { generating.value = false }
}
function showPreview() { if (!form.title.trim() || !form.body.trim()) return ElMessage.warning('请填写标题和正文'); previewOpen.value = true }
function saveLocal() {
  if (!form.title.trim()) return ElMessage.warning('请填写标题')
  const row = { id: editing.value || `local-${Date.now()}`, title: form.title.trim(), body: form.body.trim(), kind: form.kind, status: 'draft', detail: '仅当前页面 · 未保存到云端', photo: form.photos[0] || samplePhoto }
  articles.value = [row, ...articles.value.filter(item => item.id !== row.id)]
  editing.value = row.id; editorOpen.value = false; ElMessage.success('已在当前页面保存草稿示例')
}
function publishLocal() {
  if (!form.title.trim() || !form.body.trim()) return ElMessage.warning('请填写标题和正文')
  const row = { id: editing.value || `local-${Date.now()}`, title: form.title.trim(), body: form.body.trim(), kind: form.kind, status: 'published', detail: '仅当前页面 · 未发布到 H5', photo: form.photos[0] || samplePhoto }
  articles.value = [row, ...articles.value.filter(item => item.id !== row.id)]
  editing.value = row.id; editorOpen.value = false; ElMessage.success('已模拟发布，未写入公开新闻')
}
onMounted(loadMatches)
</script>

<style scoped>
.news-center{padding:24px 30px;color:#173025}.heading{display:flex;justify-content:space-between;align-items:end;gap:20px;margin-bottom:27px}.heading h1{font-size:26px;margin:18px 0 5px}.heading p{margin:0;color:#748379}.preview-label{display:inline-block;padding:5px 9px;background:#eaf6ee;border:1px solid #cae4d1;border-radius:4px;color:#126845;font-size:12px}.filters{display:flex;align-items:center;gap:28px;border-bottom:1px solid #dce6df}.filters button{border:0;border-bottom:3px solid transparent;padding:13px 2px;background:transparent;color:#687a6e;cursor:pointer}.filters button.active{color:#087e4b;border-bottom-color:#078a50;font-weight:700}.filters span{margin-left:auto;color:#748379;font-size:13px}.load-alert{margin-top:18px}.article-list{margin-top:5px;background:#fff;border:1px solid #e0e8e2;border-radius:7px}.article-row{display:flex;align-items:center;gap:18px;width:100%;padding:15px 20px;border:0;border-bottom:1px solid #e6ede7;background:#fff;text-align:left;color:inherit;cursor:pointer}.article-row:last-child{border-bottom:0}.article-row:hover{background:#f9fcfa}.article-row img{width:112px;height:72px;object-fit:cover}.article-copy{display:grid;gap:8px;flex:1;min-width:0}.article-copy strong{font-size:16px}.article-copy small{font-size:12px;color:#708076}.article-row em{font-size:12px;font-style:normal;padding:4px 8px;border-radius:4px;color:#117845;background:#e8f7ee}.article-row em.draft{color:#647268;background:#f0f2f0}.article-row em.update{color:#a96116;background:#fff1de}.arrow{color:#92a298;font-size:22px}.empty{padding:70px 20px;text-align:center;color:#748379}.editor{display:grid;gap:12px;padding:0 10px 30px}.editor>label{font-weight:600;margin-top:7px}.photos{display:flex;gap:10px;flex-wrap:wrap}.photos img{width:116px;height:82px;object-fit:cover}.photo-select{display:grid;place-items:center;width:116px;height:82px;border:1px dashed #9dbda7;color:#087b48;cursor:pointer}.photo-select input{display:none}.hint{font-size:12px;color:#a46523}.editor footer{display:flex;justify-content:flex-end;gap:8px;margin-top:12px;padding-top:16px;border-top:1px solid #e0e8e2}.article-preview p{white-space:pre-wrap;line-height:1.8}.article-preview img{display:block;width:100%;height:auto;margin-top:14px}
</style>
