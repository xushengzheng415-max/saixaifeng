<template>
  <section class="card-library">
    <div class="library-head">
      <div><h2>球员卡模板</h2><span>背景与黑白遮罩使用同一张 300 × 430 画布</span></div>
      <el-button type="primary" @click="startCreate">新建卡片</el-button>
    </div>
    <el-alert v-if="!backendReady && !loading" title="模板保存和发布服务尚未开放，当前调整仅在本页保留" type="info" :closable="false" />
    <el-alert v-if="error" :title="error" type="error" :closable="false"><template #default><el-button link @click="load">重试</el-button></template></el-alert>
    <div class="library-body" v-loading="loading">
      <aside class="template-list" aria-label="模板列表">
        <label class="preload-filter">预装分类<el-select v-model="category"><el-option label="全部" value="all" /><el-option v-for="scope in PRELOAD_TYPES" :key="scope.value" :label="scope.label" :value="scope.value" /></el-select></label>
        <button v-for="item in visibleTemplates" :key="item.id" type="button" :class="{ selected: form.id === item.id || (!form.id && form.tier === item.tier) }" @click="select(item)">
          <img v-if="item.backgroundUrl" :src="item.backgroundUrl" alt="">
          <span><strong>{{ item.title }}</strong><small>{{ tierName(item.tier) }} · {{ statusName(item) }} · {{ preloadName(item.preload) }}{{ item.preload?.targetName ? ' · ' + item.preload.targetName : '' }}</small></span>
        </button>
        <div v-if="!visibleTemplates.length && !loading" class="list-empty">暂无模板</div>
        <el-button v-if="nextCursor" text @click="loadMore" :loading="loadingMore">加载更多</el-button>
      </aside>

      <div class="template-workspace">
        <div class="editor-fields">
          <div class="form-head"><strong>{{ form.id ? '编辑卡片' : '新建卡片' }}</strong><el-tag v-if="form.id" :type="form.status === 'published' ? 'success' : 'info'">{{ statusName(form) }}</el-tag></div>
          <label>模板名称<el-input v-model.trim="form.title" maxlength="30" @input="dirty = true" /></label>
          <label>适用等级<el-select v-model="form.tier" :disabled="Boolean(form.id)" @change="dirty = true"><el-option label="铜卡" value="bronze" /><el-option label="银卡" value="silver" /><el-option label="金卡" value="gold" /></el-select></label>
          <label>预装分类<el-select v-model="form.preload.type" :disabled="Boolean(form.publishedVersion) || publishing" @change="changePreload"><el-option v-for="scope in PRELOAD_TYPES" :key="scope.value" :label="scope.label" :value="scope.value" /></el-select></label>
          <label v-if="form.preload.type !== 'platform'">预装{{ preloadName(form.preload) }}
            <el-select v-model="form.preload.targetId" filterable remote :remote-method="searchTargets" :loading="targetsLoading" :disabled="Boolean(form.publishedVersion) || publishing" placeholder="搜索名称" @visible-change="openTargets" @change="chooseTarget">
              <el-option v-for="target in targetOptions" :key="target.id" :value="target.id" :label="target.name + ' · ' + target.id" />
              <template #footer><el-button v-if="targetCursor" link :loading="targetsLoading" @click="loadTargetPage(true)">加载更多</el-button></template>
            </el-select>
          </label>
          <p v-if="targetsError" class="field-error" role="alert">{{ targetsError }} <el-button link @click="searchTargets(targetKeyword)">重试</el-button></p>
          <div class="file-fields">
            <label class="file-picker"><strong>背景 PNG</strong><span class="file-target">{{ form.backgroundUrl ? '更换背景' : '上传背景' }}</span><input type="file" accept=".png,image/png" aria-label="选择背景 PNG" @change="chooseFile($event, 'background')"><small v-if="selectedFiles.background">{{ selectedFiles.background }} · 待保存</small></label>
            <label class="file-picker"><strong>黑白遮罩 PNG</strong><span class="file-target">{{ form.maskUrl ? '更换遮罩' : '上传遮罩' }}</span><input type="file" accept=".png,image/png" aria-label="选择黑白遮罩 PNG" @change="chooseFile($event, 'mask')"><small v-if="selectedFiles.mask">{{ selectedFiles.mask }} · 待保存</small></label>
          </div>
          <p v-if="uploadError" class="field-error" role="alert">{{ uploadError }}</p>
          <p v-else-if="selectedFiles.background || selectedFiles.mask" class="file-feedback" role="status">素材已选入；保存草稿后生效。</p>
          <div class="layout-presets">
            <strong>排版模板</strong>
            <el-select v-model="selectedLayoutPreset" filterable remote :remote-method="searchLayoutPresets" :loading="layoutsLoading" :disabled="layoutApplying" placeholder="选择模板" no-data-text="暂无模板" no-match-text="未找到模板" @visible-change="openLayoutPresets">
              <el-option v-for="preset in layoutPresets" :key="preset.id" :label="preset.title" :value="preset.id" />
              <template #footer><el-button v-if="layoutCursor" link :loading="layoutsLoading" @click="loadLayoutPresets(true)">加载更多</el-button></template>
            </el-select>
            <div class="layout-actions"><el-button size="small" :loading="layoutSaving" :disabled="!backendReady || layoutApplying" @click="saveLayoutPreset">新建模板</el-button><el-button size="small" :loading="layoutApplying" :disabled="!selectedLayoutPreset || publishing || saving" @click="applyLayoutPreset">导入模板</el-button></div>
            <p v-if="layoutsError" class="field-error" role="alert">{{ layoutsError }} <el-button link @click="loadLayoutPresets(false)">重试</el-button></p>
          </div>
          <div class="photo-editor">
            <div class="photo-editor-head"><strong>示例照片</strong><el-button link @click="resetPhoto">恢复默认</el-button></div>
            <label>大小 <span>{{ form.photo.scale }}%</span><el-slider v-model="form.photo.scale" :min="50" :max="200" :step="5" @change="dirty = true" /></label>
            <div class="photo-position"><label>横向 X<el-input-number v-model="form.photo.x" :min="0" :max="300" @change="dirty = true" /></label><label>纵向 Y<el-input-number v-model="form.photo.y" :min="0" :max="250" @change="dirty = true" /></label></div>
          </div>
          <div class="badge-editor">
            <div class="photo-editor-head"><strong>国籍和球队</strong><el-button link @click="resetBadge">恢复默认</el-button></div>
            <el-select v-model="selectedBadge" aria-label="选择国籍或球队元素"><el-option label="国籍旗帜" value="nationality" /><el-option label="球队队徽" value="team" /></el-select>
            <div class="badge-controls"><label>大小<el-input-number v-model="currentBadge.size" :min="12" :max="80" @change="dirty = true" /></label><label>横向 X<el-input-number v-model="currentBadge.x" :min="0" :max="300" @change="dirty = true" /></label><label>纵向 Y<el-input-number v-model="currentBadge.y" :min="0" :max="430" @change="dirty = true" /></label></div>
          </div>
          <div class="text-editor">
            <strong>文字字段</strong>
            <el-select v-model="selectedField" aria-label="选择文字字段"><el-option v-for="field in TEXT_FIELDS" :key="field.key" :label="field.label" :value="field.key" /></el-select>
            <div v-if="currentStyle" class="text-controls">
              <label>字体<el-select v-model="currentStyle.font" @change="dirty = true"><el-option v-for="font in TEXT_STYLE_CONTRACT.fonts" :key="font.id" :value="font.id" :label="font.label" /></el-select></label>
              <label>填色<el-select v-model="currentStyle.fillMode" @change="dirty = true"><el-option label="纯色" value="solid" /><el-option label="渐变" value="gradient" /></el-select></label>
              <label v-if="currentStyle.fillMode === 'solid'">颜色<input v-model="currentStyle.color" type="color" @input="dirty = true"></label>
              <label>字号<el-input-number v-model="currentStyle.size" :min="8" :max="80" :step="1" @change="dirty = true" /></label>
              <label>横向 X<el-input-number v-model="currentStyle.x" :min="0" :max="300" :step="1" @change="dirty = true" /></label>
              <label>纵向 Y<el-input-number v-model="currentStyle.y" :min="0" :max="430" :step="1" @change="dirty = true" /></label>
              <label>字重<el-select v-model="currentStyle.weight" @change="dirty = true"><el-option label="常规" :value="400" /><el-option label="中等" :value="500" /><el-option label="半粗" :value="600" /><el-option label="粗体" :value="700" /><el-option label="加粗" :value="800" /><el-option label="极粗" :value="900" /></el-select></label>
            </div>
            <div v-if="currentStyle" class="text-effects">
              <div class="effect-presets"><el-button size="small" @click="applyTextPreset('gold')">金色渐变</el-button><el-button size="small" @click="applyTextPreset('silver')">银色渐变</el-button><el-button link @click="clearTextEffects">清除效果</el-button></div>
              <div v-if="currentStyle.fillMode === 'gradient'" class="gradient-controls">
                <label>起始色<input v-model="currentStyle.gradient.start" type="color" @input="dirty = true"></label>
                <label>结束色<input v-model="currentStyle.gradient.end" type="color" @input="dirty = true"></label>
                <label>中间色<el-switch v-model="currentStyle.gradient.middleEnabled" @change="dirty = true" /><input v-if="currentStyle.gradient.middleEnabled" v-model="currentStyle.gradient.middle" type="color" @input="dirty = true"></label>
                <label>方向<el-input-number v-model="currentStyle.gradient.angle" :min="0" :max="360" :step="15" @change="dirty = true" /></label>
              </div>
              <div class="text-controls">
                <label>字距<el-input-number v-model="currentStyle.letterSpacing" :min="-2" :max="20" :step="0.5" @change="dirty = true" /></label>
                <label>倾斜<el-select v-model="currentStyle.fontStyle" @change="dirty = true"><el-option label="常规" value="normal" /><el-option label="斜体" value="italic" /></el-select></label>
                <label>描边宽度<el-input-number v-model="currentStyle.stroke.width" :min="0" :max="5" :step="0.2" @change="dirty = true" /></label>
                <label v-if="currentStyle.stroke.width > 0">描边色<input v-model="currentStyle.stroke.color" type="color" @input="dirty = true"></label>
                <label>阴影<el-switch v-model="currentStyle.shadow.enabled" @change="dirty = true" /></label>
              </div>
              <div v-if="currentStyle.shadow.enabled" class="text-controls">
                <label>阴影色<input v-model="currentStyle.shadow.color" type="color" @input="dirty = true"></label>
                <label>透明度<el-input-number v-model="currentStyle.shadow.opacity" :min="0" :max="1" :step="0.1" @change="dirty = true" /></label>
                <label>横向偏移<el-input-number v-model="currentStyle.shadow.x" :min="-10" :max="10" @change="dirty = true" /></label>
                <label>纵向偏移<el-input-number v-model="currentStyle.shadow.y" :min="-10" :max="10" @change="dirty = true" /></label>
                <label>模糊<el-input-number v-model="currentStyle.shadow.blur" :min="0" :max="6" :step="0.5" @change="dirty = true" /></label>
              </div>
            </div>
          </div>
          <p class="version" v-if="form.id">草稿 {{ form.draftVersion }} · 已发布 {{ form.publishedVersion || '—' }}</p>
          <div class="editor-actions">
            <el-button type="primary" :loading="saving" :disabled="!backendReady || !scopeReady || !dirty || !form.title || !form.backgroundUrl || !form.maskUrl || previewState !== 'ready'" @click="save">保存草稿</el-button>
            <el-button :loading="publishing" :disabled="!publishServiceReady || !canPublish" @click="publish">发布</el-button>
            <el-button v-if="publishJob?.jobId" :disabled="!publishServiceReady" :loading="publishing" @click="resumePublish">{{ publishJob.status === 'blocked' ? '重试发布' : '继续发布' }}</el-button>
          </div>
          <div v-if="publishJob?.status === 'blocked'" class="field-error" role="alert">
            <span>{{ publishJob.failed }} 张成卡待修复</span>
            <p v-for="item in publishJob.failures" :key="item.playerId">{{ item.playerId }}：{{ item.reason }}</p>
          </div>
          <p v-if="publishProgress" class="release-note" role="status">{{ publishProgress }}</p>
          <p v-else class="release-note">发布后添加到符合范围的球员 H5 卡库。</p>
        </div>
        <div ref="previewSlot" class="preview-slot"><div id="player-card-editor-preview" v-show="previewVisible" class="preview-pane preview-docked" :style="dockStyle">
          <div class="preview-title"><strong>排版预览</strong><el-button link :loading="finalPreviewLoading" :disabled="!backendReady || previewState !== 'ready'" @click="showFinalPreview">查看大图</el-button></div>
          <div class="preview-size" :style="previewSizeStyle"><div ref="previewRef" class="card-preview" :style="previewScaleStyle" role="img" aria-label="球员卡模板预览">
            <img v-if="form.backgroundUrl" class="back" :src="form.backgroundUrl" alt="">
            <div v-if="previewState === 'ready'" class="portrait-mask" :style="portraitMaskStyle"><img class="portrait" :src="previewPortrait" :style="photoStyle" alt="" @pointerdown="beginPhotoDrag"></div>

            <span v-if="previewState === 'ready'" class="card-badge nationality" :style="badgeStyle('nationality')" title="国籍旗帜示例" @pointerdown="beginBadgeDrag($event, 'nationality')"><svg viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" fill="#d92d24"/><polygon points="6,2 7,5 10,5 8,7 9,10 6,8 3,10 4,7 2,5 5,5" fill="#ffdf45"/></svg></span>
            <span v-if="previewState === 'ready'" class="card-badge team" :style="badgeStyle('team')" title="球队队徽示例" @pointerdown="beginBadgeDrag($event, 'team')">队</span>
            <span v-for="field in previewState === 'ready' ? TEXT_FIELDS : []" :key="field.key" class="card-text" :class="{ active: selectedField === field.key }"
              :style="fieldStyle(field.key)" @pointerdown="beginTextDrag($event, field.key)">{{ field.sample }}</span>
          </div></div>
          <span v-if="!form.backgroundUrl || !form.maskUrl" class="preview-state">上传背景和遮罩后可预览</span>
          <span v-else-if="previewState === 'loading'" class="preview-state" role="status">正在合成预览…</span>
          <div v-else-if="previewState === 'error'" class="preview-error" role="alert"><span>{{ previewError }}</span><el-button link @click="composePreview">重试预览</el-button></div>
          <span v-else class="preview-state">{{ selectedFiles.background || selectedFiles.mask ? '新素材预览已更新 · 待保存' : '拖动预览文字可调整位置' }}</span>
        </div></div>
      </div>
    </div>
    <el-button class="preview-toggle" type="primary" :aria-expanded="previewVisible" aria-controls="player-card-editor-preview" @click="previewVisible = !previewVisible">{{ previewVisible ? '隐藏预览' : '显示预览' }}</el-button>
    <el-dialog v-model="previewOpen" title="服务端成卡预览" width="min(650px, 96vw)" append-to-body>
      <img v-if="finalPreviewImage" :src="finalPreviewImage" alt="服务端生成的完整球员卡" style="display:block;width:min(100%,450px);height:auto;margin:auto">
    </el-dialog>

  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { playerCardTemplateRequest } from '@/utils/cloud'
import { renderMaskedCardLayers } from '@/utils/playerCardMask'
import TEXT_STYLE_CONTRACT from '../../../../cloudfunctions/webLoginApi/player-card-text-styles.json'


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
const freshTextStyle = () => JSON.parse(JSON.stringify(TEXT_STYLE_CONTRACT.defaults))
function styleLayout(value) { return Object.fromEntries(Object.entries(DEFAULT_LAYOUT).map(([key,base]) => { const raw = value?.[key] || base, defaults=freshTextStyle(); return [key,{...base,...defaults,...raw,gradient:{...defaults.gradient,...raw.gradient},stroke:{...defaults.stroke,...raw.stroke},shadow:{...defaults.shadow,...raw.shadow}}] })) }
function freshLayout() { return styleLayout(DEFAULT_LAYOUT) }
const DEFAULT_PHOTO = { x: 150, y: 35, scale: 108 }
function freshPhoto() { return { ...DEFAULT_PHOTO } }
const DEFAULT_BADGES = { nationality: { x: 125, y: 394, size: 28 }, team: { x: 175, y: 388, size: 32 } }
function freshBadges(value = {}) { return Object.fromEntries(Object.entries(DEFAULT_BADGES).map(([key, defaults]) => [key, { ...defaults, ...(value?.[key] || {}) }])) }

const backendReady = ref(false), publishServiceReady = ref(false)
const templates = ref([]), nextCursor = ref(''), loading = ref(false), loadingMore = ref(false)
const saving = ref(false), publishing = ref(false), error = ref(''), uploadError = ref(''), dirty = ref(false)
const publishProgress = ref('')
const publishJob = ref(null)
const selectedFiles = reactive({ background: '', mask: '' })
const selectedField = ref('name'), selectedBadge = ref('nationality'), previewRef = ref(null), previewSlot = ref(null)
const finalPreviewLoading = ref(false), finalPreviewImage = ref('')
const previewState = ref('idle'), previewError = ref(''), previewOpen = ref(false)
const PRELOAD_TYPES = [{ value:'platform', label:'全平台' }, { value:'team', label:'球队' }, { value:'tournament', label:'赛事' }, { value:'player', label:'球员' }]
const freshPreload = () => ({ type:'platform', targetId:'', targetName:'' })
const category = ref('all'), targets = ref([]), targetsLoading = ref(false), targetsError = ref(''), targetCursor = ref(''), targetKeyword = ref('')
let targetRequest = 0, formEpoch = 0
const layoutPresets=ref([]),selectedLayoutPreset=ref(''),layoutsLoading=ref(false),layoutsError=ref(''),layoutCursor=ref(''),layoutKeyword=ref(''),layoutSaving=ref(false),layoutApplying=ref(false)
let layoutRequest=0
const visibleTemplates = computed(() => templates.value.filter(item => category.value === 'all' || (item.preload?.type || 'platform') === category.value))
const targetOptions = computed(() => form.preload.targetId && !targets.value.some(item => item.id === form.preload.targetId) ? [{id:form.preload.targetId,name:form.preload.targetName || form.preload.targetId}, ...targets.value] : targets.value)
const scopeReady = computed(() => form.preload.type === 'platform' || Boolean(form.preload.targetId))
const form = reactive({ preload:freshPreload(), id: '', title: '', tier: 'bronze', status: 'draft', revision: 0, draftVersion: 0, publishedVersion: 0,
  backgroundUrl: '', maskUrl: '', backgroundData: '', maskData: '', layout: freshLayout(), photo: freshPhoto(), badges: freshBadges() })
const previewPortrait = `${import.meta.env.BASE_URL}images/player-card-layers/preview-portrait.png`
const currentStyle = computed(() => form.layout[selectedField.value])
const currentBadge = computed(() => form.badges[selectedBadge.value])
const photoStyle = computed(() => {
  const width = 270 * form.photo.scale / 100, height = 300 * form.photo.scale / 100
  return { left: `${form.photo.x}px`, top: `${form.photo.y + 300 - height}px`,
    width: `${width}px`, height: `${height}px`, transform: 'translateX(-50%)' }
})
const canPublish = computed(() => Boolean(scopeReady.value && form.id && !dirty.value && form.backgroundUrl && form.maskUrl && previewState.value === 'ready' &&
  (form.status !== 'published' || form.draftVersion > form.publishedVersion)))
const previewVisible=ref(true),portraitMaskUrl=ref(''),dockBounds=reactive({left:0,width:340,height:800})
const dockStyle=computed(()=>({left:`${dockBounds.left}px`,width:`${dockBounds.width}px`}))
const previewScale=computed(()=>Math.max(.25,Math.min(1,(dockBounds.width-28)/300,(dockBounds.height-112)/430)))
const previewSizeStyle=computed(()=>({width:`${300*previewScale.value}px`,height:`${430*previewScale.value}px`}))
const previewScaleStyle=computed(()=>({transform:`scale(${previewScale.value})`,transformOrigin:'top left'}))
const portraitMaskStyle=computed(()=>({maskImage:`url("${portraitMaskUrl.value}")`,WebkitMaskImage:`url("${portraitMaskUrl.value}")`,maskSize:'300px 430px',WebkitMaskSize:'300px 430px',maskRepeat:'no-repeat',WebkitMaskRepeat:'no-repeat'}))
let dockObserver=null,dockFrame=0,activeDragEnd=null,previewRequest=0,pendingMaskReview=false
function updateDock(){
  if(dockFrame)return
  dockFrame=requestAnimationFrame(()=>{dockFrame=0;const rect=previewSlot.value?.getBoundingClientRect();if(!rect)return;const width=Math.min(window.innerWidth<900?250:340,rect.width,window.innerWidth-24);dockBounds.width=width;dockBounds.height=window.innerHeight;dockBounds.left=window.innerWidth<1100?Math.max(12,window.innerWidth-width-16):Math.max(12,Math.min(rect.left,window.innerWidth-width-12))})
}
async function composePreview(){
  const requestId=++previewRequest,background=form.backgroundUrl,mask=form.maskUrl
  previewState.value=background&&mask?'loading':'idle';previewError.value='';portraitMaskUrl.value=''
  if(!background||!mask)return
  try{const layers=await renderMaskedCardLayers(background,mask);if(requestId!==previewRequest)return;portraitMaskUrl.value=layers.portraitMaskUrl;previewState.value='ready'}
  catch(cause){if(requestId===previewRequest){previewState.value='error';previewError.value=cause.message||'遮罩预览失败'}}
}
watch([()=>form.backgroundUrl,()=>form.maskUrl],composePreview)
onMounted(async()=>{await nextTick();dockObserver=new ResizeObserver(updateDock);if(previewSlot.value)dockObserver.observe(previewSlot.value);window.addEventListener('resize',updateDock);updateDock()})
onBeforeUnmount(()=>{previewRequest++;dockObserver?.disconnect();window.removeEventListener('resize',updateDock);cancelAnimationFrame(dockFrame);activeDragEnd?.()})
function trackDrag(event,apply){
  activeDragEnd?.();let pending=null,frame=0
  const flush=()=>{frame=0;if(pending){apply(pending);pending=null;dirty.value=true}}
  const move=pointer=>{if(pointer.pointerId!==event.pointerId)return;pending=pointer;if(!frame)frame=requestAnimationFrame(flush)}
  const end=()=>{if(frame)cancelAnimationFrame(frame);flush();window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);activeDragEnd=null}
  activeDragEnd=end;window.addEventListener('pointermove',move);window.addEventListener('pointerup',end);window.addEventListener('pointercancel',end)
}
watch(previewState, state => {
  if (state === 'ready' && pendingMaskReview) pendingMaskReview = false
  if (state === 'error') pendingMaskReview = false
})

function openLayoutPresets(open) { if(open && !layoutPresets.value.length) searchLayoutPresets('') }
function searchLayoutPresets(keyword) { layoutKeyword.value=keyword;return loadLayoutPresets(false) }
async function loadLayoutPresets(more=false) {
  const id=++layoutRequest;layoutsLoading.value=true;layoutsError.value=''
  try {
    const result=await request('listPlayerCardLayoutPresets',{keyword:layoutKeyword.value,cursor:more?layoutCursor.value:''})
    if(id!==layoutRequest) return
    layoutPresets.value=more?[...layoutPresets.value,...result.presets]:result.presets
    layoutCursor.value=result.nextCursor || ''
  } catch(cause) { if(id===layoutRequest) layoutsError.value=cause.message }
  finally { if(id===layoutRequest) layoutsLoading.value=false }
}
async function saveLayoutPreset() {
  let title
  try { const result=await ElMessageBox.prompt('保存文字样式、人物构图和徽标位置。','新建模板',{confirmButtonText:'创建',inputPlaceholder:'模板名称',inputValidator:value=>String(value || '').trim().length>=2 && String(value || '').trim().length<=30 || '名称须为 2–30 个字'});title=result.value.trim() } catch { return }
  layoutSaving.value=true
  try {
    const result=await request('savePlayerCardLayoutPreset',{title,layout:form.layout,photo:form.photo,badges:form.badges})
    layoutPresets.value.unshift({id:result.preset.id,title:result.preset.title});selectedLayoutPreset.value=result.preset.id;ElMessage.success('模板已创建')
  } catch(cause) { ElMessage.error(cause.message) } finally { layoutSaving.value=false }
}
async function applyLayoutPreset() {
  if(!selectedLayoutPreset.value || layoutApplying.value) return
  const epoch=formEpoch;layoutApplying.value=true
  try {
    const result=await request('getPlayerCardLayoutPreset',{presetId:selectedLayoutPreset.value})
    if(epoch!==formEpoch) return
    form.layout=styleLayout(result.preset.layout);form.photo={...result.preset.photo};form.badges=freshBadges(result.preset.badges)
    dirty.value=true;ElMessage.success('模板已导入，待保存草稿')
  } catch(cause) { ElMessage.error(cause.message) } finally { layoutApplying.value=false }
}
function preloadName(value) { return PRELOAD_TYPES.find(item => item.value === (value?.type || 'platform'))?.label || '全平台' }
function changePreload() {
  form.preload.targetId = ''; form.preload.targetName = ''; dirty.value = true
  targetRequest++; targetsLoading.value = false; targets.value = []; targetsError.value = ''; targetCursor.value = ''; targetKeyword.value = ''
  publishJob.value = null; publishProgress.value = ''
}
function chooseTarget(id) { form.preload.targetName = targets.value.find(item => item.id === id)?.name || ''; dirty.value = true }
function openTargets(open) { if (open && !targets.value.length) searchTargets('') }
function searchTargets(keyword) { targetKeyword.value = keyword; return loadTargetPage(false) }
async function loadTargetPage(more) {
  const id = ++targetRequest, type = form.preload.type
  if (type === 'platform') return
  targetsLoading.value = true; targetsError.value = ''
  try {
    const result = await request('listPlayerCardPreloadTargets', { type, keyword:targetKeyword.value, cursor:more ? targetCursor.value : '' })
    if (id !== targetRequest || type !== form.preload.type) return
    targets.value = more ? [...targets.value, ...(result.targets || [])] : (result.targets || [])
    targetCursor.value = result.nextCursor || ''
  } catch (cause) { if (id === targetRequest) { targetsError.value = cause.message; if (!more) { targets.value = []; targetCursor.value = '' } } }
  finally { if (id === targetRequest) targetsLoading.value = false }
}
function tierName(value) { return { bronze: '铜卡', silver: '银卡', gold: '金卡' }[value] || '未知等级' }
function statusName(value) {
  if (value.status === 'local') return '基础素材 · 未保存'
  if (value.status === 'published') return value.draftVersion > value.publishedVersion ? '已发布 · 有新草稿' : '已发布'
  return value.status === 'withdrawn' ? '已撤回' : '草稿'
}
async function request(action, data = {}) {
  const result = await playerCardTemplateRequest(action, data)
  if (!result?.success) throw new Error(result?.error || '操作失败，请重试')
  return result
}
function assign(item) {
  formEpoch++;selectedLayoutPreset.value=''
  targetRequest++; targetsLoading.value = false; targets.value = []; targetsError.value = ''; targetCursor.value = ''
  Object.assign(form, { preload:{...freshPreload(), ...item.preload}, id: item.id, title: item.title, tier: item.tier, status: item.status, revision: item.revision,
    draftVersion: item.draftVersion, publishedVersion: item.publishedVersion,
    backgroundUrl: item.backgroundData || item.backgroundUrl || '', maskUrl: item.maskData || item.maskUrl || '',
    backgroundData: '', maskData: '', layout: styleLayout(item.layout),
    photo: { ...(item.photo || DEFAULT_PHOTO) }, badges: freshBadges(item.badges) })
  dirty.value = false; uploadError.value = ''; selectedFiles.background = ''; selectedFiles.mask = ''; pendingMaskReview = false; previewOpen.value = false
}
async function select(item) {
  publishServiceReady.value = false
  if (item.status === 'local') { assign({ ...item, id: '' }); return }
  try {
    const result = await request('getPlayerCardTemplate', { templateId: item.id })
    assign(result.template)
    const status = await request('getPlayerCardTemplatePublishStatus', { tier:item.tier, preload:item.preload || freshPreload(), templateId:item.id })
    publishServiceReady.value = true
    publishJob.value = status.jobId ? status : null
  }
  catch (cause) { ElMessage.error(cause.message || '模板读取失败') }
}
function startCreate() {
  formEpoch++;selectedLayoutPreset.value=''
  targetRequest++; targetsLoading.value = false; targets.value = []; targetsError.value = ''; targetCursor.value = ''
  Object.assign(form, { preload:freshPreload(), id: '', title: '', tier: 'bronze', status: 'draft', revision: 0, draftVersion: 0, publishedVersion: 0,
    backgroundUrl: '', maskUrl: '', backgroundData: '', maskData: '', layout: freshLayout(), photo: freshPhoto(), badges: freshBadges() })
  dirty.value = true; uploadError.value = ''; selectedFiles.background = ''; selectedFiles.mask = ''; pendingMaskReview = false; previewOpen.value = false
  publishJob.value = null
}
async function load() {
  loading.value = true; error.value = ''
  try {
    const result = await request('listPlayerCardTemplates')
    backendReady.value = true
    templates.value = result.templates || []; nextCursor.value = result.nextCursor || ''
    if (form.id) { const current = templates.value.find(item => item.id === form.id); if (current) await select(current) }
    else if (templates.value.length && !dirty.value) await select(templates.value[0])
  } catch (cause) {
    backendReady.value = false; publishServiceReady.value = false
    const unavailable = /未知|不支持|unknown|unsupported|not found/i.test(cause.message || '')
    error.value = unavailable ? '' : '模板读取失败，请重试'
    templates.value = ['bronze','silver','gold'].map(tier => ({ id: `local:${tier}`, tier, title: `经典${tierName(tier)}`, status: 'local', revision: 0, draftVersion: 0, publishedVersion: 0, backgroundUrl: `${import.meta.env.BASE_URL}images/player-card-layers/${tier}-background.png`, maskUrl: `${import.meta.env.BASE_URL}images/player-card-layers/foreground-mask-source.png`, layout: freshLayout(), photo: freshPhoto(), badges: freshBadges() }))
    if (!dirty.value) assign({ ...templates.value[0], id: '' })
  } finally { loading.value = false }
}
async function loadMore() {
  loadingMore.value = true
  try { const result = await request('listPlayerCardTemplates', { cursor: nextCursor.value }); templates.value.push(...(result.templates || [])); nextCursor.value = result.nextCursor || '' }
  catch (cause) { ElMessage.error(cause.message) } finally { loadingMore.value = false }
}
function readDataUrl(file) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = () => reject(new Error('图片读取失败')); reader.readAsDataURL(file) })
}
function imageFrom(url) {
  return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('图片无法读取')); image.src = url })
}
async function chooseFile(event, layer) {
  const file = event.target.files?.[0]; event.target.value = ''
  if (!file) return
  uploadError.value = ''
  selectedFiles[layer] = ''
  try {
    if (!(file.type === 'image/png' || /\.png$/i.test(file.name)) || file.size > 2 * 1024 * 1024) throw new Error('请上传不超过 2MB 的 PNG')
    const url = await readDataUrl(file), image = await imageFrom(url)
    if (image.width !== 300 || image.height !== 430) throw new Error('图片尺寸必须为 300 × 430')
    if (layer === 'mask') {
      const canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 430
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0)
      const pixels = ctx.getImageData(0, 0, 300, 430).data
      let dark = false, light = false
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] < 128) continue
        const brightness = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3
        if (brightness < 32) dark = true
        if (brightness > 223) light = true
        if (dark && light) break
      }
      if (!dark || !light) throw new Error('遮罩需要同时包含黑色前景区和白色透出区')
    }
    const previous = form[`${layer}Url`]
    if (layer === 'mask') pendingMaskReview = true
    form[`${layer}Url`] = url; form[`${layer}Data`] = url; dirty.value = true
    selectedFiles[layer] = file.name
    if (previous === url) await composePreview()
  } catch (cause) { pendingMaskReview = false; uploadError.value = cause.message || '图片读取失败' }
}
async function refreshSelected(id) {
  const result = await request('getPlayerCardTemplate', { templateId: id })
  const index = templates.value.findIndex(item => item.id === id)
  if (index >= 0) templates.value.splice(index, 1, result.template)
  else templates.value.unshift(result.template)
  assign(result.template)
  const status = await request('getPlayerCardTemplatePublishStatus', { tier:result.template.tier, preload:result.template.preload || freshPreload(), templateId:result.template.id })
  publishServiceReady.value = true
  publishJob.value = status.jobId ? status : null
}
async function showFinalPreview() {
  if (!backendReady.value || finalPreviewLoading.value) return false
  finalPreviewLoading.value = true
  try {
    const result = await request('previewPlayerCardTemplate', { templateId:form.id, backgroundData:form.backgroundData, maskData:form.maskData, layout:form.layout, photo:form.photo, badges:form.badges })
    finalPreviewImage.value = result.imageData
    previewOpen.value = true
    return true
  } catch (cause) { ElMessage.error(cause.message || '成卡预览失败，请重试'); return false }
  finally { finalPreviewLoading.value = false }
}
async function save() {
  if (!backendReady.value) return
  saving.value = true
  try {
    const result = await request('savePlayerCardTemplate', { templateId: form.id, revision: form.revision, title: form.title,
      tier: form.tier, preload:form.preload, backgroundData: form.backgroundData, maskData: form.maskData, layout: form.layout, photo: form.photo, badges: form.badges })
    await refreshSelected(result.templateId); ElMessage.success('草稿已保存')
  } catch (cause) { ElMessage.error(cause.message) } finally { saving.value = false }
}
async function publish() {
  if (!publishServiceReady.value) return
  try { await ElMessageBox.confirm(`将添加到${preloadName(form.preload)}${form.preload.targetName ? '：' + form.preload.targetName : ''}球员的 H5 卡库，保留已有卡。该模板已制作的成卡全部更新成功后生效。`, '发布模板', { confirmButtonText: '发布' }) } catch { return }
  publishing.value = true
  publishProgress.value = '正在准备发布…'
  try {
    let result = await request('publishPlayerCardTemplate', { templateId: form.id, revision: form.revision })
    await finishPublish(result)
  }
  catch (cause) { publishProgress.value = '发布未完成，可重试'; ElMessage.error(cause.message) } finally { publishing.value = false }
}
async function finishPublish(initial) {
  let result = initial
  while (result.status === 'pending') {
    publishJob.value = result
    publishProgress.value = `正在更新成卡 ${result.completed || 0}/${result.total || 0}`
    if(result.busy)await new Promise(resolve=>setTimeout(resolve,1500))
    result = await playerCardTemplateRequest('continuePlayerCardTemplatePublish', { jobId: result.jobId })
    if (!result.success && result.status !== 'blocked') throw new Error(result.error || '发布失败')
  }
  if (result.status === 'blocked') {
    publishJob.value = result
    publishProgress.value = `${result.failed} 张成卡待修复；当前版本仍在使用`
    throw new Error('部分成卡生成失败，请查看质量队列')
  }
  await refreshSelected(form.id)
  const active = await request('getActivePlayerCardTemplate', {tier:form.tier, preload:form.preload, templateId:form.id})
  if (active.status !== 'ready' || active.template?.id !== form.id || Number(active.template?.version) !== Number(result.publishedVersion)) throw new Error('活动版本回读不一致，请刷新核对')
  publishJob.value = null
  publishProgress.value = result.affected ? `预装已发布 · 更新 ${result.affected} 张专属卡` : '预装已发布'
  ElMessage.success('预装已发布')
  localStorage.setItem('sxfPlayerCardTemplateUpdate',JSON.stringify({tier:form.tier,templateId:form.id,version:result.publishedVersion,at:Date.now()}))
}
async function resumePublish() {
  if (!publishServiceReady.value) return
  if (!publishJob.value?.jobId) return
  publishing.value = true
  try {
    const start = publishJob.value.status === 'blocked'
      ? await request('retryPlayerCardTemplatePublish', { jobId:publishJob.value.jobId })
      : publishJob.value
    await finishPublish(start)
  } catch (cause) { publishProgress.value = '发布未完成，可重试'; ElMessage.error(cause.message) } finally { publishing.value = false }
}
function clearTextEffects() { Object.assign(currentStyle.value,freshTextStyle()); dirty.value = true }
function applyTextPreset(type) {
  const style=currentStyle.value
  Object.assign(style,freshTextStyle(),{fillMode:'gradient',font:selectedField.value === 'number' ? 'sport' : selectedField.value === 'name' ? 'brush' : 'sans'})
  if (type === 'silver') { style.gradient={start:'#ffffff',middle:'#c6d2df',end:'#66768c',middleEnabled:true,angle:90};style.stroke={width:0.6,color:'#445061'} }
  else style.stroke={width:0.6,color:'#755018'}
  style.shadow.enabled=true;dirty.value=true
}
function fieldStyle(key) {
  const style = form.layout[key] || DEFAULT_LAYOUT[key]
  const font=TEXT_STYLE_CONTRACT.fonts.find(item=>item.id===style.font) || TEXT_STYLE_CONTRACT.fonts[0], colors=style.gradient ? [style.gradient.start,...(style.gradient.middleEnabled?[style.gradient.middle]:[]),style.gradient.end] : []
  return {left:style.x+'px',top:style.y+'px',fontSize:style.size+'px',fontWeight:style.weight,transform:'translateX(-50%)'+(style.fontStyle==='italic'?' skewX(-12deg)':''),fontFamily:font.family+', Noto Sans SC, sans-serif',fontStyle:'normal',letterSpacing:(style.letterSpacing || 0)+'px',fontSynthesis:'none',
    color:style.fillMode==='gradient'?'transparent':style.color,backgroundImage:style.fillMode==='gradient'?'linear-gradient('+((style.gradient.angle || 0)+90)+'deg,'+colors.join(',')+')':'none',backgroundClip:style.fillMode==='gradient'?'text':'border-box',WebkitBackgroundClip:style.fillMode==='gradient'?'text':'border-box',WebkitTextStroke:style.stroke?.width ? style.stroke.width+'px '+style.stroke.color : '0',paintOrder:'stroke fill',
    filter:style.shadow?.enabled?'drop-shadow('+style.shadow.x+'px '+style.shadow.y+'px '+style.shadow.blur+'px '+style.shadow.color+Math.round(style.shadow.opacity*255).toString(16).padStart(2,'0')+')':'none'}

}
function resetPhoto() { Object.assign(form.photo, DEFAULT_PHOTO); dirty.value = true }
function resetBadge() { Object.assign(form.badges[selectedBadge.value], DEFAULT_BADGES[selectedBadge.value]); dirty.value = true }
function badgeStyle(key) {
  const badge = form.badges[key] || DEFAULT_BADGES[key]
  return { left: `${badge.x}px`, top: `${badge.y}px`, width: `${badge.size}px`,
    height: `${key === 'nationality' ? Math.round(badge.size * 2 / 3) : badge.size}px`, transform: 'translateX(-50%)' }
}
function beginBadgeDrag(event, key) {
  event.preventDefault(); selectedBadge.value = key
  const rect = event.currentTarget.closest('.card-preview')?.getBoundingClientRect(), badge = form.badges[key]
  if (!rect || !badge) return
  const startX = event.clientX, startY = event.clientY, x = badge.x, y = badge.y
  trackDrag(event, pointer => {
    badge.x = Math.max(0, Math.min(300, Math.round(x + (pointer.clientX - startX) * 300 / rect.width)))
    badge.y = Math.max(0, Math.min(430, Math.round(y + (pointer.clientY - startY) * 430 / rect.height)))
  })
}
function beginPhotoDrag(event) {
  event.preventDefault()
  const rect = event.currentTarget.closest('.card-preview')?.getBoundingClientRect()
  if (!rect) return
  const startX = event.clientX, startY = event.clientY, x = form.photo.x, y = form.photo.y
  trackDrag(event, pointer => {
    form.photo.x = Math.max(0, Math.min(300, Math.round(x + (pointer.clientX - startX) * 300 / rect.width)))
    form.photo.y = Math.max(0, Math.min(250, Math.round(y + (pointer.clientY - startY) * 430 / rect.height)))
  })
}
function beginTextDrag(event, key) {
  event.preventDefault(); selectedField.value = key
  const element = previewRef.value, style = form.layout[key], rect = element?.getBoundingClientRect()
  if (!rect || !style) return
  const startX = event.clientX, startY = event.clientY, x = style.x, y = style.y
  trackDrag(event, pointer => {
    style.x = Math.max(0, Math.min(300, Math.round(x + (pointer.clientX - startX) * 300 / rect.width)))
    style.y = Math.max(0, Math.min(430, Math.round(y + (pointer.clientY - startY) * 430 / rect.height)))
  })
}
onMounted(() => {
  if(!document.getElementById('player-card-fonts')) {
    const sheet=document.createElement('style');sheet.id='player-card-fonts'
    sheet.textContent=TEXT_STYLE_CONTRACT.fonts.filter(font=>font.id!=='sans').map(font=>'@font-face{font-family:"'+font.family+'";src:url("'+import.meta.env.BASE_URL+'fonts/player-card/'+font.files[0]+'");font-weight:400;font-style:normal;font-display:swap}').join('')
    document.head.appendChild(sheet)
  }
  load()
})
</script>

<style scoped>
.card-library{padding:20px;color:#172a20;box-sizing:border-box}.platform-console .card-library{padding:20px 0 0}.library-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}.library-head h2{margin:0 0 4px;font-size:20px}.library-head span{color:#6f7d73;font-size:12px}.library-body{display:grid;grid-template-columns:250px minmax(0,1fr);min-height:620px;border:1px solid #dde7e0;background:#fff}.template-list{border-right:1px solid #e5ede8;padding:8px;overflow-y:auto}.template-list>button:not(.el-button){display:flex;align-items:center;gap:11px;width:100%;padding:9px;border:0;border-radius:6px;background:#fff;text-align:left;cursor:pointer}.template-list>button.selected{background:#eaf5ed}.template-list img{width:38px;height:55px;object-fit:contain}.template-list span{min-width:0;display:grid;gap:5px}.template-list strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.template-list small,.list-empty{color:#758078;font-size:11px}.list-empty{padding:20px 10px}.template-workspace{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:28px;padding:24px}.editor-fields{max-width:470px;display:grid;align-content:start;gap:19px}.form-head{display:flex;align-items:center;gap:10px;font-size:17px}.editor-fields>label{display:grid;gap:7px;font-size:13px;font-weight:600}.file-fields{display:flex;gap:12px}.file-fields label{width:50%;display:grid;gap:7px;font-size:13px;font-weight:600}.file-fields input{position:absolute;width:1px;height:1px;opacity:0}.file-fields span{display:grid;place-items:center;height:72px;border:1px dashed #91b99f;border-radius:6px;color:#167445;font-weight:500;cursor:pointer}.field-error{margin:0;color:#b5372b;font-size:12px}.version{margin:0;color:#748078;font-size:12px}.editor-actions{display:flex;flex-wrap:wrap;gap:8px;padding-top:8px}.preview-pane{display:grid;justify-items:center;align-content:start;gap:12px;padding:14px;background:#f1f5f2}.preview-pane>strong{font-size:13px}.card-preview{position:relative;width:300px;height:430px;overflow:hidden;background:#e4ebe5}.card-preview img{position:absolute;display:block}.card-preview .back,.card-preview .front{inset:0;width:100%;height:100%}.card-preview .back{z-index:1}.card-preview .portrait{z-index:2;top:18px;left:33px;width:234px;height:280px;object-fit:contain;object-position:center bottom}.card-preview .front{z-index:3}.card-preview b,.card-preview span,.card-preview strong{position:absolute;z-index:4;color:#1c241d}.card-preview .number{top:70px;left:25px;font-size:52px;line-height:1}.card-preview .position{top:125px;left:28px;font-size:22px;font-weight:700}.card-preview .name{right:20px;bottom:82px;left:20px;text-align:center;font-size:28px}.card-preview .jersey{right:20px;bottom:65px;left:20px;text-align:center;font-size:13px;font-weight:600}.card-preview .physical{right:20px;bottom:44px;left:20px;text-align:center;font-size:11px;font-weight:600}.preview-state{color:#758078;font-size:12px}@media(max-width:1100px){.template-workspace{grid-template-columns:minmax(0,1fr)}.preview-pane{justify-items:start}.library-body{grid-template-columns:210px minmax(0,1fr)}}@media(max-width:680px){.library-body{display:block}.template-list{display:flex;gap:4px;overflow-x:auto;border-right:0;border-bottom:1px solid #e5ede8}.template-list>button:not(.el-button){min-width:150px}.template-workspace{padding:16px}.library-head h2{font-size:18px}.card-preview{transform:scale(.85);transform-origin:top left;margin-bottom:-64px}}
.release-note{margin:0;color:#697a6d;font-size:12px;line-height:1.5}
.text-editor{display:grid;gap:10px;padding-top:10px;border-top:1px solid #e4ebe6}.text-editor>strong{font-size:14px}.text-controls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.text-controls label{display:grid;gap:5px;font-size:12px;color:#5d6f63}.text-controls input[type=color]{width:100%;height:34px;padding:3px;border:1px solid #d5dfd8;border-radius:5px;background:#fff}.text-controls .el-input-number,.text-controls .el-select{width:100%}.card-preview .card-text{position:absolute;z-index:4;line-height:1;white-space:nowrap;cursor:grab;touch-action:none;user-select:none}.card-preview .card-text.active{outline:1px dashed #157d49;outline-offset:4px}
.card-preview canvas.front{position:absolute;display:block;inset:0;width:100%;height:100%;z-index:3;pointer-events:none}
.preview-title{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;font-size:13px}.preview-error{display:flex;align-items:center;gap:8px;color:#b5392f;font-size:12px}.preview-pane.expanded{position:fixed;inset:0;z-index:3000;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;overflow:auto;padding:24px;background:#eaf0ec;box-sizing:border-box}.preview-pane.expanded .preview-title{max-width:460px}.preview-pane.expanded .card-preview{flex:none;margin:14px auto;transform:none}@media(min-width:700px){.preview-pane.expanded .card-preview{transform:scale(1.25);transform-origin:top center;margin:14px auto 122px}}
.file-fields .file-picker{position:relative;min-width:0;cursor:pointer}.file-picker strong{font-size:13px}.file-picker .file-target{position:relative;display:grid;place-items:center;height:72px;border:1px dashed #91b99f;border-radius:6px;color:#167445;font-weight:500;box-sizing:border-box}.file-fields .file-picker input[type=file]{position:absolute;top:23px;left:0;width:100%;height:72px;opacity:0;z-index:2;cursor:pointer}.file-picker:focus-within .file-target{outline:2px solid #168149;outline-offset:2px}.file-picker small{overflow:hidden;color:#1b7245;font-size:11px;font-weight:500;text-overflow:ellipsis;white-space:nowrap}.file-feedback{margin:0;color:#1b7245;font-size:12px}
.mask-review-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px;justify-items:center}.review-column{display:grid;justify-items:center;align-content:start;gap:10px;min-width:0}.review-column>strong{font-size:14px;color:#233d2e}.mask-source{display:block;width:300px;height:430px;max-width:100%;object-fit:fill;border:1px solid #dce6df;background:#fff;box-sizing:border-box}.review-note{margin:15px 0 0;color:#697a6d;font-size:12px;text-align:center}@media(max-width:680px){.mask-review-grid{grid-template-columns:1fr}.review-column+.review-column{margin-top:16px}}
.photo-editor{display:grid;gap:11px;padding-top:10px;border-top:1px solid #e4ebe6}.photo-editor-head{display:flex;align-items:center;justify-content:space-between}.photo-editor-head strong{font-size:14px}.photo-editor>label{display:grid;grid-template-columns:60px 45px minmax(0,1fr);align-items:center;gap:8px;font-size:12px;color:#5d6f63}.photo-editor>label .el-slider{min-width:0}.photo-position{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.photo-position label{display:grid;gap:5px;font-size:12px;color:#5d6f63}.photo-position .el-input-number{width:100%}.card-preview .portrait{cursor:grab;touch-action:none;user-select:none}
.badge-editor{display:grid;gap:10px;padding-top:10px;border-top:1px solid #e4ebe6}.badge-controls{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.badge-controls label{display:grid;gap:5px;color:#5d6f63;font-size:12px}.badge-controls .el-input-number{width:100%}.card-preview .card-badge{position:absolute;z-index:4;display:grid;place-items:center;overflow:hidden;cursor:grab;touch-action:none;user-select:none;box-sizing:border-box}.card-badge.nationality svg{width:100%;height:100%;display:block}.card-badge.team{border:2px solid #fff;background:#087744;color:#fff;font-size:14px;font-weight:800;clip-path:polygon(50% 0,100% 13%,100% 68%,50% 100%,0 68%,0 13%)}
.form-head .el-button{margin-left:auto}.pc-reference{position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none;width:300px}
.preload-filter{display:grid;gap:6px;font-size:13px;margin-bottom:8px}.editor-fields,.template-workspace,.preview-pane{min-width:0}.template-list small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}@media(max-width:680px){.preload-filter{flex:0 0 140px}.preview-pane{overflow:hidden}}
.text-effects{display:grid;gap:12px}.gradient-controls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.gradient-controls label{display:grid;gap:5px;font-size:12px;color:#5d6f63}.gradient-controls input[type=color]{width:100%;height:30px;padding:2px;border:1px solid #cbd9d0;border-radius:4px}.effect-presets{display:flex;flex-wrap:wrap;gap:6px}.effect-presets .el-button+.el-button{margin-left:0}
.layout-presets{display:grid;gap:10px;padding-top:10px;border-top:1px solid #e4ebe6}.layout-presets>strong{font-size:14px}.layout-actions{display:flex;gap:8px}.layout-actions .el-button+.el-button{margin-left:0}

.preview-slot{min-width:0}.preview-pane.preview-docked{position:fixed;top:50%;transform:translateY(-50%);z-index:30;box-sizing:border-box;max-height:calc(100dvh - 32px);overflow:auto;align-content:start;justify-items:center;box-shadow:0 4px 18px #163a2218;contain:layout paint}.preview-size{position:relative;flex:none}.preview-docked .card-preview{margin:0}.portrait-mask{position:absolute;inset:0;width:300px;height:430px;z-index:2;pointer-events:none}.portrait-mask .portrait{pointer-events:auto}.preview-toggle{position:fixed;right:22px;bottom:20px;z-index:40;margin:0!important}.preview-docked .preview-state{line-height:1.5;text-align:center}.preview-docked .preview-title{gap:8px}.preview-docked .preview-error{flex-wrap:wrap}@media(max-width:1100px){.preview-slot{min-height:1px}.preview-docked{justify-items:center}}@media(max-width:680px){.preview-docked .card-preview{margin:0;transform-origin:top left}.preview-toggle{right:16px;bottom:16px}}
</style>
