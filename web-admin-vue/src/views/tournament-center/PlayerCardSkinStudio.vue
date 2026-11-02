<template>
  <section class="skin-studio">
    <div class="studio-head">
      <div>
        <h2>背景卡 / 皮肤</h2>
        <span>按平台、赛事、球队或球员标签圈定范围；背景、遮罩与落位统一维护，发布前整套预览。</span>
      </div>
      <el-button type="primary" @click="openCreate">新建卡面项目</el-button>
    </div>

    <nav class="studio-tabs" aria-label="背景卡系统">
      <button v-for="tab in TABS" :key="tab.key" type="button" :class="{ active: activePanel === tab.key }" @click="switchPanel(tab.key)">
        {{ tab.label }}<em v-if="tabCount(tab.key)">{{ tabCount(tab.key) }}</em>
      </button>
    </nav>

    <el-alert v-if="error" :title="error" type="error" :closable="false">
      <template #default><el-button link @click="loadSets">重试</el-button></template>
    </el-alert>

    <div v-loading="loading" class="studio-body">
      <template v-if="activePanel === 'projects'">
        <aside class="project-list" aria-label="卡面项目">
          <button v-for="set in sets" :key="set._id" type="button" :class="{ selected: selectedSet && selectedSet._id === set._id }" @click="selectSet(set._id)">
            <span class="project-thumb" :style="thumbStyle(set)"></span>
            <span class="project-copy">
              <strong>{{ set.title }}</strong>
              <small>{{ scopeLabel(set.preload) }} · {{ kindLabel(set.kind) }} · {{ setStatus(set) }}</small>
            </span>
          </button>
          <div v-if="!sets.length && !loading" class="list-empty">暂无卡面项目</div>
        </aside>

        <div v-if="selectedSet" class="project-workspace">
          <div class="project-head">
            <div>
              <h3>{{ selectedSet.title }}</h3>
              <div class="tag-row">
                <el-tag size="small" effect="plain">{{ kindLabel(selectedSet.kind) }}</el-tag>
                <el-tag size="small" effect="plain">{{ scopeLabel(selectedSet.preload) }}</el-tag>
                <el-tag size="small" :type="selectedSet.status === 'published' ? 'success' : 'info'">{{ setStatus(selectedSet) }}</el-tag>
              </div>
            </div>
            <div class="project-actions">
              <el-button :loading="reviewing" :disabled="!setReady || reviewing || publishing" @click="reviewSet">整套预览</el-button>
              <el-button type="success" :loading="publishing" :disabled="!proof || publishing" @click="publishSet">发布</el-button>
            </div>
          </div>

          <div class="tier-grid">
            <article v-for="member in memberRows" :key="member.key" class="tier-card">
              <div class="tier-thumb" :style="thumbStyle(member, member.backgroundUrl || member.publishedBackgroundUrl)">
                <span>{{ tierName(member.tier) }}</span>
                <em v-if="!member.backgroundFileId || !member.maskFileId">待上传</em>
              </div>
              <div class="tier-copy">
                <strong>{{ member.title }}</strong>
                <small>{{ memberStatus(member) }}</small>
              </div>
              <div class="tier-upload">
                <label class="file-picker">
                  <span>{{ member.backgroundFileId ? '更换背景' : '上传背景' }}</span>
                  <input type="file" accept=".png,image/png" @change="chooseAsset(member.key, 'background', $event)">
                </label>
                <label class="file-picker">
                  <span>{{ member.maskFileId ? '更换遮罩' : '上传遮罩' }}</span>
                  <input type="file" accept=".png,image/png" @change="chooseAsset(member.key, 'mask', $event)">
                </label>
              </div>
              <small v-if="fileLabel(member.key)" class="file-label">{{ fileLabel(member.key) }}</small>
              <div class="tier-actions">
                <el-button :disabled="!assetReady(member)" @click="openPlacement(member)">落位</el-button>
                <el-button type="primary" :loading="savingKey === member.key" :disabled="savingKey === member.key" @click="saveMember(member)">保存素材</el-button>
              </div>
              <small v-if="member.publishedVersion" class="published-note">已发布 V{{ member.publishedVersion }}</small>
            </article>
          </div>

          <p class="studio-hint">先保存每个档位的背景与遮罩，再调整落位；整套预览通过后才会解锁发布。发放沿用现有球员卡发放流程。</p>
        </div>
        <el-empty v-else description="选择左侧项目，或新建一个卡面项目" class="studio-empty" />
      </template>

      <template v-else-if="activePanel === 'library'">
        <div v-if="publishedSets.length" class="library-grid">
          <article v-for="set in publishedSets" :key="set._id" class="library-card">
            <div class="library-thumbs">
              <span v-for="style in set.styles" :key="style.key" :style="thumbStyle(style, style.backgroundUrl)"></span>
            </div>
            <strong>{{ set.title }}</strong>
            <div class="tag-row">
              <el-tag size="small" effect="plain">{{ kindLabel(set.kind) }}</el-tag>
              <el-tag size="small" effect="plain">{{ scopeLabel(set.preload) }}</el-tag>
              <el-tag v-if="set.hasDraft" size="small" type="warning">有新草稿</el-tag>
            </div>
            <small>{{ publishedLabel(set) }}</small>
          </article>
          <article v-if="legacyCount" class="library-card legacy">
            <strong>旧版单卡模板</strong>
            <small>另有 {{ legacyCount }} 个未归入套系的旧模板，可继续在「球员卡系统」中维护。</small>
          </article>
        </div>
        <el-empty v-else description="暂无已发布的背景卡项目" />
      </template>

      <template v-else>
        <el-table v-if="issues.length" :data="issues" row-key="_id" class="issue-table">
          <el-table-column prop="title" label="发放项目" min-width="220" />
          <el-table-column label="范围" min-width="170"><template #default="{ row }">{{ scopeLabel(row.preload) }}</template></el-table-column>
          <el-table-column label="进度" width="170"><template #default="{ row }">{{ row.succeeded || 0 }} / {{ row.total || 0 }}</template></el-table-column>
          <el-table-column label="失败" width="100"><template #default="{ row }">{{ (row.failures || []).length }}</template></el-table-column>
          <el-table-column label="状态" width="110"><template #default="{ row }"><el-tag :type="issueType(row.status)" size="small">{{ issueStatus(row.status) }}</el-tag></template></el-table-column>
          <el-table-column label="时间" width="180"><template #default="{ row }">{{ formatTime(row.createAt || row.updatedAt) }}</template></el-table-column>
          <template #empty><el-empty description="暂无发放记录" /></template>
        </el-table>
        <el-empty v-else description="暂无发放记录" />
      </template>
    </div>

    <el-dialog v-model="createOpen" title="新建卡面项目" width="min(560px, 94vw)" append-to-body>
      <el-form label-position="top">
        <el-form-item label="项目类型">
          <el-radio-group v-model="createForm.kind" @change="changeKind">
            <el-radio-button label="progression">升级套系（铜 / 银 / 金）</el-radio-button>
            <el-radio-button label="honor">荣誉单卡</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="项目名称"><el-input v-model.trim="createForm.title" maxlength="24" show-word-limit placeholder="如：立洋杯 2026 赛季" /></el-form-item>
        <el-form-item label="发放标签">
          <el-select v-model="createForm.preloadType" @change="changeScope">
            <el-option v-for="scope in scopeOptions" :key="scope.value" :label="scope.label" :value="scope.value" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="createForm.preloadType !== 'platform'" :label="'选择' + scopeLabel({ type: createForm.preloadType })">
          <el-select v-model="createForm.targetId" filterable remote :remote-method="searchTargets" :loading="targetsLoading" placeholder="输入名称搜索" @visible-change="openTargets" @change="chooseTarget">
            <el-option v-for="target in targets" :key="target.id" :value="target.id" :label="target.name + ' · ' + target.id" />
          </el-select>
        </el-form-item>
        <p class="dialog-hint">标签决定这套背景卡发给谁；保存范围后不能单独改绑，只能新建项目。</p>
      </el-form>
      <template #footer>
        <el-button @click="createOpen = false">取消</el-button>
        <el-button type="primary" :loading="creating" :disabled="!canCreate" @click="submitCreate">创建项目</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="placementOpen" :title="placementTitle" size="min(760px, 96vw)" append-to-body>
      <template v-if="placement">
        <div class="placement-layout">
          <div class="placement-preview" :style="placementBackgroundStyle">
            <div class="photo-frame" :style="photoFrameStyle"><span>照片框</span></div>
            <span v-for="field in TEXT_FIELDS" :key="field.key" class="preview-text" :class="{ hidden: placement.layout[field.key]?.hidden }" :style="textStyle(field.key)">{{ field.sample }}</span>
            <span class="preview-badge nationality" :style="badgeStyle('nationality')">国籍</span>
            <span class="preview-badge team" :style="badgeStyle('team')">队徽</span>
          </div>
          <div class="placement-controls">
            <section class="control-group">
              <div class="control-head"><strong>照片位置</strong><el-button link @click="resetPhoto">恢复默认</el-button></div>
              <label>大小 <span>{{ placement.photo.scale }}%</span><el-slider v-model="placement.photo.scale" :min="50" :max="200" :step="5" /></label>
              <div class="control-row">
                <label>横向 X<el-input-number v-model="placement.photo.x" :min="0" :max="300" /></label>
                <label>纵向 Y<el-input-number v-model="placement.photo.y" :min="0" :max="250" /></label>
              </div>
              <p class="control-hint">坐标以 300 × 430 卡面为准，照片框会随大小和位置变化。</p>
            </section>

            <section class="control-group">
              <div class="control-head">
                <strong>文字落位</strong>
                <el-select v-model="selectedField" size="small">
                  <el-option v-for="field in TEXT_FIELDS" :key="field.key" :label="field.label" :value="field.key" />
                </el-select>
              </div>
              <template v-if="activeTextStyle">
                <label v-if="['height', 'weight'].includes(selectedField)" class="visibility-row">隐藏{{ selectedField === 'height' ? '身高' : '体重' }}<el-switch v-model="activeTextStyle.hidden" /></label>
                <div class="control-row">
                  <label>横向 X<el-input-number v-model="activeTextStyle.x" :min="0" :max="300" /></label>
                  <label>纵向 Y<el-input-number v-model="activeTextStyle.y" :min="0" :max="430" /></label>
                </div>
                <div class="control-row">
                  <label>字号<el-input-number v-model="activeTextStyle.size" :min="8" :max="80" /></label>
                  <label>字重<el-select v-model="activeTextStyle.weight"><el-option label="常规" :value="400" /><el-option label="中等" :value="500" /><el-option label="半粗" :value="600" /><el-option label="粗体" :value="700" /><el-option label="加粗" :value="800" /><el-option label="极粗" :value="900" /></el-select></label>
                </div>
                <label class="color-row">颜色<input v-model="activeTextStyle.color" type="color"></label>
              </template>
            </section>

            <section class="control-group">
              <div class="control-head"><strong>国籍与队徽</strong><el-button link @click="resetBadges">恢复默认</el-button></div>
              <div class="control-row">
                <label>国籍 X<el-input-number v-model="placement.badges.nationality.x" :min="0" :max="300" /></label>
                <label>国籍 Y<el-input-number v-model="placement.badges.nationality.y" :min="0" :max="430" /></label>
                <label>大小<el-input-number v-model="placement.badges.nationality.size" :min="12" :max="80" /></label>
              </div>
              <div class="control-row">
                <label>队徽 X<el-input-number v-model="placement.badges.team.x" :min="0" :max="300" /></label>
                <label>队徽 Y<el-input-number v-model="placement.badges.team.y" :min="0" :max="430" /></label>
                <label>大小<el-input-number v-model="placement.badges.team.size" :min="12" :max="80" /></label>
              </div>
            </section>
          </div>
        </div>
      </template>
      <template #footer>
        <el-button @click="placementOpen = false">取消</el-button>
        <el-button v-if="selectedSet && selectedSet.kind === 'progression'" :loading="placementSaving" :disabled="!placementMemberSaves" @click="savePlacement(true)">保存并同步其他档位</el-button>
        <el-button type="primary" :loading="placementSaving" :disabled="!placementMemberSaves" @click="savePlacement(false)">保存落位</el-button>
      </template>
    </el-drawer>

    <el-dialog v-model="reviewOpen" title="整套预览" width="min(980px, 96vw)" append-to-body>
      <p class="dialog-hint">服务端按每档位的背景、遮罩和落位生成真实成卡；确认无误后再发布。</p>
      <div class="review-grid">
        <article v-for="card in reviewCards" :key="card.key">
          <img :src="card.imageUrl" :alt="tierName(card.key) + '成卡预览'">
          <strong>{{ tierName(card.key) }}</strong>
        </article>
      </div>
      <template #footer>
        <el-button @click="reviewOpen = false">返回修改</el-button>
        <el-button type="success" :loading="publishing" :disabled="!proof" @click="publishSet">确认发布</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { playerCardTemplateRequest, uploadLargeFileViaCloud } from '@/utils/cloud'

const TABS = [
  { key: 'projects', label: '制作项目' },
  { key: 'library', label: '已发布样式库' },
  { key: 'issues', label: '发放记录' }
]
const SCOPES = [
  { value: 'platform', label: '全平台' },
  { value: 'tournament', label: '赛事' },
  { value: 'team', label: '球队' },
  { value: 'player', label: '球员' }
]
const TEXT_FIELDS = [
  { key: 'number', label: '球衣号码', sample: '10' },
  { key: 'position', label: '位置', sample: '前锋' },
  { key: 'name', label: '姓名', sample: '示例球员' },
  { key: 'jerseyName', label: '球衣名', sample: 'SAMPLE' },
  { key: 'height', label: '身高', sample: '身高 178cm' },
  { key: 'weight', label: '体重', sample: '体重 72kg' }
]
const DEFAULT_LAYOUT = {
  number: { x: 44, y: 70, size: 52, color: '#1c241d', weight: 900 },
  position: { x: 44, y: 130, size: 24, color: '#1c241d', weight: 700 },
  name: { x: 150, y: 307, size: 32, color: '#1c241d', weight: 800 },
  jerseyName: { x: 150, y: 343, size: 16, color: '#30312b', weight: 600 },
  height: { x: 98, y: 367, size: 14, color: '#30312b', weight: 600 },
  weight: { x: 202, y: 367, size: 14, color: '#30312b', weight: 600 }
}
const DEFAULT_PHOTO = { x: 150, y: 35, scale: 108 }
const DEFAULT_BADGES = { nationality: { x: 125, y: 394, size: 28 }, team: { x: 175, y: 388, size: 32 } }

const activePanel = ref('projects')
const sets = ref([])
const legacyCount = ref(0)
const loading = ref(false)
const error = ref('')
const selectedSet = ref(null)
const proof = ref('')
const reviewOpen = ref(false)
const reviewCards = ref([])
const reviewing = ref(false)
const publishing = ref(false)
const issues = ref([])
const issuesLoaded = ref(false)

const fileState = reactive({})
const savingKey = ref('')
const assetProgress = reactive({})
const placementOpen = ref(false)
const placement = ref(null)
const placementKey = ref('')
const placementSaving = ref(false)
const selectedField = ref('name')

const createOpen = ref(false)
const creating = ref(false)
const targets = ref([])
const targetsLoading = ref(false)
const createForm = reactive({ kind: 'progression', title: '', preloadType: 'platform', targetId: '', targetName: '' })

const memberRows = computed(() => {
  if (!selectedSet.value) return []
  const keys = selectedSet.value.kind === 'progression' ? ['bronze', 'silver', 'gold'] : ['single']
  return keys.map(key => ({ ...selectedSet.value.members[key], key })).filter(Boolean)
})
const publishedSets = computed(() => sets.value.filter(set => set.status === 'published'))
const scopeOptions = computed(() => createForm.kind === 'progression' ? SCOPES.filter(item => ['platform', 'tournament'].includes(item.value)) : SCOPES)
const canCreate = computed(() => Boolean(createForm.title && (createForm.preloadType === 'platform' || createForm.targetId)))
const setReady = computed(() => Boolean(selectedSet.value && memberRows.value.length && memberRows.value.every(member => assetReady(member))))
const placementMemberSaves = computed(() => Boolean(placement.value && !placementSaving.value))
const activeTextStyle = computed(() => placement.value?.layout?.[selectedField.value] || null)

function tabCount(key) {
  if (key === 'projects') return sets.value.length
  if (key === 'library') return publishedSets.value.length
  return issues.value.length
}
function switchPanel(key) {
  activePanel.value = key
  if (key === 'issues' && !issuesLoaded.value) loadIssues()
}
async function wf(workflowAction, data = {}) {
  const result = await playerCardTemplateRequest('savePlayerCardTemplate', { workflowAction, ...data })
  if (!result?.success) throw new Error(result?.error || result?.message || '操作失败，请重试')
  return result
}
async function loadSets() {
  loading.value = true; error.value = ''
  try {
    const result = await wf('list')
    sets.value = result.sets || []
    legacyCount.value = (result.legacy || []).length
    if (selectedSet.value) {
      const existing = sets.value.find(item => item._id === selectedSet.value._id)
      if (existing) await selectSet(existing._id, true)
      else selectedSet.value = null
    }
  } catch (cause) {
    error.value = cause.message || '卡面项目读取失败'
  } finally { loading.value = false }
}
async function selectSet(setId, silent = false) {
  if (!setId) return
  try {
    const result = await wf('get', { setId })
    selectedSet.value = result.set
    proof.value = ''
    reviewCards.value = []
    memberRows.value.forEach(member => { fileState[member.key] = { background: null, mask: null } })
  } catch (cause) { if (!silent) ElMessage.error(cause.message || '项目读取失败') }
}
function thumbStyle(item, url) {
  const source = url || item?.backgroundUrl || (item?.styles && item.styles[0]?.backgroundUrl) || ''
  return { backgroundImage: source ? `url("${source}")` : 'none' }
}
function kindLabel(kind) { return kind === 'honor' ? '荣誉单卡' : '升级套系' }
function scopeLabel(preload) {
  const scope = SCOPES.find(item => item.value === (preload?.type || 'platform'))
  return (scope?.label || '全平台') + (preload?.targetName ? ' · ' + preload.targetName : '')
}
function tierName(value) { return { bronze: '铜卡', silver: '银卡', gold: '金卡', single: '单卡' }[value] || '卡面' }
function setStatus(set) {
  if (set.status === 'published') return set.hasDraft ? '已发布 · 有新草稿' : '已发布'
  return '草稿'
}
function memberStatus(member) {
  if (!member.backgroundFileId || !member.maskFileId) return '待上传背景与遮罩'
  if (member.publishedVersion && Number(member.draftVersion) <= Number(member.publishedVersion)) return '已发布'
  if (member.publishedVersion) return '已发布 · 有新草稿'
  return '草稿'
}
function publishedLabel(set) {
  return set.publishedAt ? '发布于 ' + formatTime(set.publishedAt) : '已发布'
}
function issueStatus(value) { return { complete: '已完成', running: '进行中', pending: '待处理', failed: '失败' }[value] || value || '—' }
function issueType(value) { return value === 'complete' ? 'success' : value === 'failed' ? 'danger' : 'warning' }
function formatTime(value) {
  if (!value) return '—'
  const date = typeof value === 'number' ? new Date(value) : new Date(String(value))
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('zh-CN', { hour12: false })
}
function assetReady(member) { return Boolean(member.backgroundFileId && member.maskFileId) }
function fileLabel(key) {
  const state = fileState[key]
  const names = []
  if (state?.background?.name) names.push('背景：' + state.background.name)
  if (state?.mask?.name) names.push('遮罩：' + state.mask.name)
  return names.join(' · ')
}
async function chooseAsset(key, layer, event) {
  const file = event.target.files && event.target.files[0]
  event.target.value = ''
  if (!file) return
  try {
    if (!/png/i.test(file.type) && !/\.png$/i.test(file.name)) throw new Error('请上传 PNG 图片')
    if (file.size > 2 * 1024 * 1024) throw new Error('单张 PNG 不能超过 2MB')
    const size = await readImageSize(file)
    if (size.width !== 300 || size.height !== 430) throw new Error(`背景与遮罩须为 300 × 430，当前 ${size.width} × ${size.height}`)
    if (!fileState[key]) fileState[key] = { background: null, mask: null }
    fileState[key][layer] = file
    ElMessage.success((layer === 'background' ? '背景' : '遮罩') + '已选入，保存后生效')
  } catch (cause) { ElMessage.error(cause.message || '图片读取失败') }
}
function readImageSize(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve({ width: image.naturalWidth, height: image.naturalHeight }) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片无法读取')) }
    image.src = url
  })
}
async function saveMember(member) {
  if (savingKey.value) return
  savingKey.value = member.key
  assetProgress[member.key] = ''
  try {
    let backgroundFileId = member.backgroundFileId
    let maskFileId = member.maskFileId
    const files = fileState[member.key] || {}
    if (files.background) {
      assetProgress[member.key] = '正在上传背景…'
      const uploaded = await uploadLargeFileViaCloud(`card-skin-studio/${selectedSet.value._id}/${member.key}/background-${Date.now()}.png`, files.background, {
        onProgress: (done, total) => { assetProgress[member.key] = `背景上传 ${done}/${total}` }
      })
      backgroundFileId = uploaded.fileId
    }
    if (files.mask) {
      assetProgress[member.key] = '正在上传遮罩…'
      const uploaded = await uploadLargeFileViaCloud(`card-skin-studio/${selectedSet.value._id}/${member.key}/mask-${Date.now()}.png`, files.mask, {
        onProgress: (done, total) => { assetProgress[member.key] = `遮罩上传 ${done}/${total}` }
      })
      maskFileId = uploaded.fileId
    }
    if (!backgroundFileId || !maskFileId) throw new Error('请先上传背景和黑白遮罩')
    assetProgress[member.key] = '正在保存…'
    await saveTemplate({
      templateId: member.id, revision: member.revision, title: member.title, tier: member.tier,
      preload: selectedSet.value.preload, positionOverride: member.positionOverride || '',
      backgroundFileId, maskFileId, layout: member.layout, photo: member.photo, badges: member.badges
    })
    fileState[member.key] = { background: null, mask: null }
    ElMessage.success(tierName(member.tier) + '素材已保存')
    await refreshSelectedSet()
  } catch (cause) { ElMessage.error(cause.message || '素材保存失败') }
  finally { savingKey.value = ''; assetProgress[member.key] = '' }
}
async function saveTemplate(data) {
  const result = await playerCardTemplateRequest('savePlayerCardTemplate', data)
  if (!result?.success) throw new Error(result?.error || result?.message || '落位保存失败')
  return result
}
async function refreshSelectedSet() {
  if (!selectedSet.value) return
  const result = await wf('get', { setId: selectedSet.value._id })
  selectedSet.value = result.set
}

function openPlacement(member) {
  placementKey.value = member.key
  placement.value = {
    layout: JSON.parse(JSON.stringify(member.layout || DEFAULT_LAYOUT)),
    photo: { ...DEFAULT_PHOTO, ...(member.photo || {}) },
    badges: JSON.parse(JSON.stringify(member.badges || DEFAULT_BADGES))
  }
  selectedField.value = 'name'
  placementOpen.value = true
}
function resetPhoto() { if (placement.value) placement.value.photo = { ...DEFAULT_PHOTO } }
function resetBadges() { if (placement.value) placement.value.badges = JSON.parse(JSON.stringify(DEFAULT_BADGES)) }
function placementBackgroundStyle() {
  const member = memberRows.value.find(item => item.key === placementKey.value)
  const url = member?.backgroundUrl || ''
  return { backgroundImage: url ? `url("${url}")` : 'none' }
}
function photoFrameStyle() {
  const photo = placement.value?.photo || DEFAULT_PHOTO
  const width = 270 * photo.scale / 100, height = 300 * photo.scale / 100
  return { left: photo.x + 'px', top: (photo.y + 300 - height) + 'px', width: width + 'px', height: height + 'px', transform: 'translateX(-50%)' }
}
function textStyle(key) {
  const style = placement.value?.layout?.[key] || DEFAULT_LAYOUT[key]
  return { left: style.x + 'px', top: style.y + 'px', fontSize: style.size + 'px', fontWeight: style.weight, color: style.color, transform: 'translateX(-50%)' }
}
function badgeStyle(key) {
  const badge = placement.value?.badges?.[key] || DEFAULT_BADGES[key]
  return { left: badge.x + 'px', top: badge.y + 'px', width: badge.size + 'px', height: (key === 'nationality' ? Math.round(badge.size * 2 / 3) : badge.size) + 'px', transform: 'translateX(-50%)' }
}
async function savePlacement(syncOthers) {
  if (!placement.value || !selectedSet.value || placementSaving.value) return
  const member = selectedSet.value.members[placementKey.value]
  if (!member || !assetReady(member)) { ElMessage.error('请先保存背景和遮罩'); return }
  placementSaving.value = true
  try {
    const result = await saveTemplate({
      templateId: member.id, revision: member.revision, title: member.title, tier: member.tier,
      preload: selectedSet.value.preload, positionOverride: member.positionOverride || '',
      backgroundFileId: member.backgroundFileId, maskFileId: member.maskFileId,
      layout: placement.value.layout, photo: placement.value.photo, badges: placement.value.badges
    })
    if (syncOthers && selectedSet.value.kind === 'progression') {
      await wf('copyLayout', { setId: selectedSet.value._id, sourceKey: placementKey.value, revision: result.revision, shareMask: false })
    }
    placementOpen.value = false
    ElMessage.success('落位已保存')
    await refreshSelectedSet()
  } catch (cause) { ElMessage.error(cause.message || '落位保存失败') }
  finally { placementSaving.value = false }
}
async function reviewSet() {
  if (!selectedSet.value || reviewing.value) return
  if (!setReady.value) { ElMessage.error('请先为每个档位保存背景和遮罩'); return }
  reviewing.value = true
  try {
    const result = await wf('review', { setId: selectedSet.value._id })
    reviewCards.value = result.cards || []
    proof.value = result.proof || ''
    reviewOpen.value = true
  } catch (cause) { ElMessage.error(cause.message || '整套预览失败') }
  finally { reviewing.value = false }
}
async function publishSet() {
  if (!selectedSet.value || !proof.value || publishing.value) return
  try { await ElMessageBox.confirm('确认将整套背景卡发布为正式版本？发布后客户端会按标签读取最新版本。', '确认发布', { confirmButtonText: '发布', cancelButtonText: '再检查' }) }
  catch { return }
  publishing.value = true
  try {
    await wf('publish', { setId: selectedSet.value._id, proof: proof.value })
    proof.value = ''
    reviewOpen.value = false
    ElMessage.success('背景卡已发布')
    await loadSets()
    await refreshSelectedSet()
  } catch (cause) { ElMessage.error(cause.message || '发布失败') }
  finally { publishing.value = false }
}

function openCreate() {
  createForm.kind = 'progression'
  createForm.title = ''
  createForm.preloadType = 'platform'
  createForm.targetId = ''
  createForm.targetName = ''
  targets.value = []
  createOpen.value = true
}
function changeKind() {
  if (!scopeOptions.value.some(item => item.value === createForm.preloadType)) changeScope('platform')
}
function changeScope(value) {
  createForm.preloadType = value
  createForm.targetId = ''
  createForm.targetName = ''
  targets.value = []
  if (value !== 'platform') searchTargets('')
}
function openTargets(open) { if (open) searchTargets('') }
async function searchTargets(keyword) {
  const type = createForm.preloadType
  if (type === 'platform') return
  targetsLoading.value = true
  try {
    const result = await playerCardTemplateRequest('listPlayerCardPreloadTargets', { type, keyword: keyword || '', cursor: '' })
    targets.value = result.targets || []
  } catch (cause) { ElMessage.error(cause.message || '标签范围读取失败'); targets.value = [] }
  finally { targetsLoading.value = false }
}
function chooseTarget(id) {
  const target = targets.value.find(item => item.id === id)
  createForm.targetName = target?.name || ''
}
async function submitCreate() {
  if (!canCreate.value || creating.value) return
  creating.value = true
  try {
    const result = await wf('create', {
      kind: createForm.kind, title: createForm.title,
      preload: { type: createForm.preloadType, targetId: createForm.preloadType === 'platform' ? '' : createForm.targetId, targetName: createForm.preloadType === 'platform' ? '' : createForm.targetName }
    })
    createOpen.value = false
    ElMessage.success('卡面项目已创建')
    await loadSets()
    if (result.set?._id) await selectSet(result.set._id)
  } catch (cause) { ElMessage.error(cause.message || '创建失败') }
  finally { creating.value = false }
}
async function loadIssues() {
  issuesLoaded.value = true
  try {
    const result = await wf('issues')
    issues.value = result.issues || []
  } catch (cause) { ElMessage.error(cause.message || '发放记录读取失败') }
}

onMounted(loadSets)
</script>

<style scoped>
.skin-studio { padding: 20px; color: #172a20; box-sizing: border-box; }
.studio-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
.studio-head h2 { margin: 0 0 4px; font-size: 20px; }
.studio-head span { color: #6f7d73; font-size: 12px; line-height: 1.6; }
.studio-tabs { display: flex; gap: 4px; margin-bottom: 14px; border-bottom: 1px solid #dce7df; }
.studio-tabs button { padding: 9px 14px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: #607168; font: inherit; font-size: 13px; cursor: pointer; }
.studio-tabs button.active { border-bottom-color: #16804d; color: #176b43; font-weight: 700; }
.studio-tabs em { display: inline-block; margin-left: 6px; padding: 0 5px; border-radius: 8px; background: #e8f4ec; color: #1a7047; font-size: 10px; font-style: normal; }
.studio-body { min-height: 480px; }
.project-list { display: grid; gap: 6px; float: left; width: 250px; max-height: 680px; overflow-y: auto; padding: 8px; border: 1px solid #e0e9e2; border-right: 0; background: #fff; box-sizing: border-box; }
.project-list > button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px; border: 0; border-radius: 6px; background: #fff; text-align: left; cursor: pointer; }
.project-list > button.selected { background: #eaf5ed; }
.project-thumb { flex: 0 0 38px; height: 55px; border-radius: 4px; background: #eef2ef center/contain no-repeat; }
.project-copy { min-width: 0; display: grid; gap: 4px; }
.project-copy strong { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 13px; }
.project-copy small { color: #758078; font-size: 11px; }
.list-empty { padding: 20px 10px; color: #758078; font-size: 12px; }
.project-workspace { margin-left: 250px; padding: 20px; border: 1px solid #e0e9e2; background: #fff; box-sizing: border-box; }
.project-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 18px; }
.project-head h3 { margin: 0 0 8px; font-size: 17px; }
.tag-row { display: flex; flex-wrap: wrap; gap: 6px; }
.project-actions { display: flex; gap: 8px; }
.tier-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.tier-card { display: grid; gap: 9px; align-content: start; padding: 12px; border: 1px solid #e1ebe4; background: #fbfdfb; }
.tier-thumb { position: relative; width: 100%; aspect-ratio: 300/430; border-radius: 6px; background: #eef2ef center/contain no-repeat; }
.tier-thumb > span { position: absolute; left: 8px; top: 8px; padding: 2px 6px; border-radius: 4px; background: rgba(23, 42, 32, .78); color: #fff; font-size: 10px; }
.tier-thumb > em { position: absolute; right: 8px; bottom: 8px; padding: 2px 6px; border-radius: 4px; background: rgba(180, 90, 30, .9); color: #fff; font-size: 10px; font-style: normal; }
.tier-copy { display: grid; gap: 3px; }
.tier-copy strong { font-size: 13px; }
.tier-copy small { color: #758078; font-size: 11px; }
.tier-upload { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.file-picker { position: relative; display: grid; place-items: center; min-height: 34px; border: 1px dashed #91b99f; border-radius: 5px; color: #167445; font-size: 12px; cursor: pointer; }
.file-picker input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.file-label { color: #597366; font-size: 11px; word-break: break-all; }
.tier-actions { display: flex; gap: 8px; justify-content: flex-end; }
.published-note { color: #7a8a80; font-size: 11px; }
.studio-hint { margin: 16px 0 0; color: #6f7d73; font-size: 12px; line-height: 1.7; }
.studio-empty { margin-left: 250px; }
.library-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
.library-card { display: grid; gap: 8px; padding: 14px; border: 1px solid #e0e9e2; background: #fff; }
.library-thumbs { display: flex; gap: 8px; }
.library-thumbs span { flex: 1; aspect-ratio: 300/430; border-radius: 5px; background: #eef2ef center/contain no-repeat; }
.library-card > strong { font-size: 14px; }
.library-card > small { color: #758078; font-size: 11px; }
.library-card.legacy { align-content: center; border-style: dashed; color: #6f7d73; }
.issue-table { background: #fff; }
.dialog-hint { margin: 0; color: #6f7d73; font-size: 12px; line-height: 1.6; }
.placement-layout { display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: 24px; }
.placement-preview { position: relative; width: 300px; height: 430px; border-radius: 8px; background: #edf2ee center/300px 430px no-repeat; overflow: hidden; box-shadow: 0 8px 24px rgba(20, 50, 34, .12); }
.photo-frame { position: absolute; display: grid; place-items: center; border: 1px dashed rgba(255, 255, 255, .65); background: rgba(255, 255, 255, .12); color: rgba(255, 255, 255, .8); font-size: 11px; }
.preview-text { position: absolute; white-space: nowrap; pointer-events: none; }
.preview-text.hidden { display: none; }
.preview-badge { position: absolute; display: grid; place-items: center; border-radius: 4px; background: rgba(20, 40, 30, .6); color: #fff; font-size: 10px; }
.placement-controls { display: grid; align-content: start; gap: 14px; max-height: 620px; overflow-y: auto; padding-right: 4px; }
.control-group { display: grid; gap: 9px; padding: 12px; border: 1px solid #e2ece5; background: #fbfdfb; }
.control-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.control-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.control-row label, .control-group > label { display: grid; gap: 4px; color: #52645a; font-size: 11px; }
.control-hint { margin: 0; color: #7a8a80; font-size: 11px; line-height: 1.5; }
.visibility-row { display: flex; align-items: center; justify-content: space-between; font-size: 12px; }
.color-row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.review-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.review-grid article { display: grid; gap: 6px; justify-items: center; }
.review-grid img { width: 100%; max-width: 300px; border-radius: 8px; background: #edf2ee; }
.review-grid strong { font-size: 12px; color: #52645a; }
@media (max-width: 1100px) {
  .tier-grid { grid-template-columns: 1fr; }
  .placement-layout { grid-template-columns: 1fr; justify-items: center; }
}
@media (max-width: 760px) {
  .project-list { float: none; width: 100%; max-height: 220px; border-right: 1px solid #e0e9e2; border-bottom: 0; }
  .project-workspace, .studio-empty { margin-left: 0; }
  .project-head { flex-direction: column; }
  .review-grid { grid-template-columns: 1fr; }
}
</style>
