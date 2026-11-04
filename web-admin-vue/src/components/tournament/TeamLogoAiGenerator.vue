<template>
  <el-dialog
    :model-value="modelValue"
    width="760px"
    :close-on-click-modal="false"
    :close-on-press-escape="!generating && !processing"
    :show-close="!generating && !processing"
    title="AI 生成球队队徽"
    @update:model-value="handleClose"
  >
    <div class="ai-logo-dialog">
      <header class="ai-logo-head">
        <div class="ai-logo-team">
          <span class="label">球队</span>
          <strong>{{ teamName || '未命名球队' }}</strong>
        </div>
        <el-tag type="warning" effect="plain" round>AI 生成</el-tag>
      </header>

      <section v-if="!candidates.length" class="ai-logo-form">
        <div class="ai-logo-row">
          <span class="label">风格</span>
          <el-radio-group v-model="form.style" :disabled="generating">
            <el-radio-button label="shield">盾牌</el-radio-button>
            <el-radio-button label="circle">圆形</el-radio-button>
            <el-radio-button label="minimal">极简</el-radio-button>
            <el-radio-button label="mascot">吉祥物</el-radio-button>
          </el-radio-group>
        </div>
        <div class="ai-logo-row">
          <span class="label">主色</span>
          <el-radio-group v-model="form.color" :disabled="generating">
            <el-radio-button v-for="item in colorOptions" :key="item.value" :label="item.value">
              <span class="color-dot" :style="{ background: item.swatch }"></span>{{ item.label }}
            </el-radio-button>
          </el-radio-group>
        </div>
        <p class="ai-logo-tip">
          生成耗时约十几秒到几十秒，每批 {{ batchSize }} 张；接口限流时会自动退避重试。
        </p>
      </section>

      <section v-if="candidates.length" class="ai-logo-gallery">
        <article
          v-for="item in candidates"
          :key="item.id"
          class="ai-logo-card"
          :class="{ selected: selectedId === item.id, applied: appliedId === item.id }"
        >
          <div class="ai-logo-canvas checkerboard">
            <img :src="item.url" :alt="`候选队徽 ${item.index}`" crossorigin="anonymous" />
            <span v-if="!item.backgroundRemoved" class="ai-logo-flag">白底（未抠图）</span>
            <span v-else class="ai-logo-flag removed">已抠图</span>
          </div>
          <p v-if="!item.backgroundRemoved" class="ai-logo-note">
            {{ item.backgroundRemovalError || '服务端未返回抠图原因' }}
          </p>
          <div class="ai-logo-card-actions">
            <el-button
              size="small"
              :type="appliedId === item.id ? 'success' : 'primary'"
              :loading="processing && selectedId === item.id"
              :disabled="generating || (processing && selectedId !== item.id)"
              @click="applyCandidate(item)"
            >
              {{ appliedId === item.id ? '已写入队徽' : '使用这张' }}
            </el-button>
          </div>
        </article>
      </section>

      <div v-if="generating" class="ai-logo-loading">
        <el-icon class="is-loading"><Loading /></el-icon>
        <div>
          <strong>{{ progressText }}</strong>
          <small>已用时 {{ elapsedText }}，可关闭弹窗稍后重试（不会中断已生成的候选）</small>
        </div>
        <el-button link type="primary" @click="cancelGeneration">取消本次生成</el-button>
      </div>

      <el-alert v-if="errorMessage" :title="errorMessage" type="error" :closable="false" show-icon class="ai-logo-alert" />
      <el-alert v-for="notice in notices" :key="notice" :title="notice" type="warning" :closable="false" show-icon class="ai-logo-alert" />

      <footer class="ai-logo-footer">
        <span class="ai-logo-compliance">AI 生成图像仅用于本赛事展示，不含真实俱乐部、品牌或人物元素。</span>
        <div class="ai-logo-footer-actions">
          <el-button v-if="candidates.length" :disabled="generating || processing" @click="clearCandidates">重新开始</el-button>
          <el-button type="primary" :loading="generating" :disabled="processing" @click="generateBatch">
            {{ candidates.length ? '换一批' : '生成候选队徽' }}
          </el-button>
        </div>
      </footer>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed, watch, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import { callFunction, getFileUrl, uploadLargeFileViaCloud } from '../../utils/cloud'
import { removeWhiteBackground } from '../../utils/whiteBgRemover'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  teamName: { type: String, default: '' },
  teamId: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue', 'select'])

const batchSize = 2
const logoSizes = [512, 256, 128]
const colorOptions = [
  { value: 'blue', label: '蓝', swatch: 'linear-gradient(135deg,#1d4ed8,#60a5fa)' },
  { value: 'red', label: '红', swatch: 'linear-gradient(135deg,#b91c1c,#f59e0b)' },
  { value: 'green', label: '绿', swatch: 'linear-gradient(135deg,#047857,#a3e635)' },
  { value: 'yellow', label: '黄', swatch: 'linear-gradient(135deg,#f59e0b,#111827)' },
  { value: 'purple', label: '紫', swatch: 'linear-gradient(135deg,#6d28d9,#c4b5fd)' },
  { value: 'orange', label: '橙', swatch: 'linear-gradient(135deg,#ea580c,#fed7aa)' },
  { value: 'black', label: '黑', swatch: 'linear-gradient(135deg,#111827,#9ca3af)' },
  { value: 'teal', label: '青', swatch: 'linear-gradient(135deg,#0f766e,#67e8f9)' }
]

const form = reactive({ style: 'shield', color: 'blue' })
const candidates = ref([])
const notices = ref([])
const errorMessage = ref('')
const generating = ref(false)
const progressText = ref('')
const elapsedSeconds = ref(0)
const processing = ref(false)
const selectedId = ref('')
const appliedId = ref('')
const aiCompliance = ref('')
let cancelToken = 0
let timerId = null

const elapsedText = computed(() => `${elapsedSeconds.value}s`)

function resetState() {
  candidates.value = []
  notices.value = []
  errorMessage.value = ''
  progressText.value = ''
  elapsedSeconds.value = 0
  selectedId.value = ''
  appliedId.value = ''
  processing.value = false
  stopTimer()
}

function stopTimer() {
  if (timerId) {
    clearInterval(timerId)
    timerId = null
  }
}

function startTimer() {
  stopTimer()
  elapsedSeconds.value = 0
  timerId = setInterval(() => { elapsedSeconds.value += 1 }, 1000)
}

watch(() => props.modelValue, visible => {
  if (visible) {
    resetState()
    form.style = 'shield'
    form.color = 'blue'
  } else {
    cancelGeneration()
  }
})

onUnmounted(() => {
  stopTimer()
  cancelToken += 1
})

function handleClose(visible) {
  if (!visible && (generating.value || processing.value)) {
    ElMessage.info('正在生成或写入队徽，请稍候再关闭')
    return
  }
  emit('update:modelValue', visible)
}

function cancelGeneration() {
  cancelToken += 1
  if (generating.value) {
    generating.value = false
    progressText.value = ''
    stopTimer()
    ElMessage.info('已取消本次生成，已生成的候选会保留')
  }
}

async function generateBatch() {
  if (generating.value || processing.value) return
  const name = String(props.teamName || '').trim()
  if (!name) {
    ElMessage.warning('请先填写球队名称，再生成队徽')
    return
  }
  generating.value = true
  errorMessage.value = ''
  notices.value = []
  startTimer()
  const token = ++cancelToken
  try {
    for (let index = 0; index < batchSize; index += 1) {
      if (token !== cancelToken) break
      progressText.value = `正在生成第 ${index + 1}/${batchSize} 张候选…`
      const result = await callFunction('generateAIImage', {
        action: 'generateTeamLogoCandidates',
        teamName: name,
        style: form.style,
        color: form.color,
        count: 1
      }, 120000)
      if (token !== cancelToken) break
      if (!result || result.success !== true) {
        const message = result?.message || 'AI 队徽生成失败'
        if (result?.code === 'AI_RATE_LIMITED') {
          throw new Error('AI 生图接口当前较繁忙（限流），请稍后点「换一批」重试')
        }
        throw new Error(message)
      }
      const data = result.data || {}
      if (Array.isArray(data.notices) && data.notices.length) notices.value = [...new Set([...notices.value, ...data.notices])]
      if (data.compliance) aiCompliance.value = data.compliance
      const rows = Array.isArray(data.candidates) ? data.candidates : []
      const offset = candidates.value.length
      candidates.value = [...candidates.value, ...rows.map((item, rowIndex) => ({
        ...item,
        id: `${item.id || Date.now()}-${offset + rowIndex}`,
        index: offset + rowIndex + 1
      }))]
    }
  } catch (err) {
    if (token === cancelToken) errorMessage.value = err.message || 'AI 队徽生成失败'
  } finally {
    if (token === cancelToken) {
      generating.value = false
      progressText.value = ''
      stopTimer()
    }
  }
}

function clearCandidates() {
  resetState()
}

function dataUrlToBlob(dataUrl) {
  const parts = String(dataUrl || '').split(',')
  const mimeMatch = (parts[0] || '').match(/:(.*?);/)
  const binary = window.atob(parts[1] || '')
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeMatch ? mimeMatch[1] : 'image/png' })
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('候选图加载失败'))
    image.src = source
  })
}

/**
 * 取回候选图字节。优先 fetch；受限时退回同源临时文件。
 * 两种方式都失败时返回 null，由调用方走白底原图兜底。
 */
async function fetchCandidateFile(candidate) {
  try {
    const response = await fetch(candidate.url, { mode: 'cors', credentials: 'omit' })
    if (response.ok) {
      const blob = await response.blob()
      if (blob.size > 0) return new File([blob], `ai-team-logo-${Date.now()}.png`, { type: blob.type || 'image/png' })
    }
  } catch (err) {
    console.warn('[AI队徽] fetch 候选图失败，尝试服务端链接:', err.message)
  }
  if (candidate.fileID) {
    try {
      const url = await getFileUrl(candidate.fileID)
      if (!url) return null
      const response = await fetch(url, { mode: 'cors', credentials: 'omit' })
      if (response.ok) {
        const blob = await response.blob()
        if (blob.size > 0) return new File([blob], `ai-team-logo-${Date.now()}.png`, { type: blob.type || 'image/png' })
      }
    } catch (err) {
      console.warn('[AI队徽] 服务端链接取图失败:', err.message)
    }
  }
  return null
}

/**
 * 与成人模式队徽链路一致：先铺白底压缩到最长边 ≤500（对应 RemoveBgProcessor.compressImage）。
 * 先铺白底再绘制的目的与那边相同：避免透明 PNG 的白色在 Canvas 预乘后丢失 RGB，
 * 后续本地抠白只移除与外边缘连通的白底，队徽内部白色仍然保留。
 */
function compressToMaxSide(file, maxSide = 500) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(file)
    image.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = image
      if (width > maxSide || height > maxSide) {
        const ratio = Math.min(maxSide / width, maxSide / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, width)
      canvas.height = Math.max(1, height)
      const context = canvas.getContext('2d')
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(blob => {
        if (!blob) {
          reject(new Error('候选图压缩失败'))
          return
        }
        resolve(new File([blob], 'ai-team-logo.png', { type: 'image/png' }))
      }, 'image/png')
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('候选图加载失败'))
    }
    image.src = url
  })
}

/**
 * 预留 8% 安全边距并转成正方形（对应 RemoveBgProcessor.addLogoSafeArea）
 */
function addLogoSafeArea(file, paddingRatio = 0.08) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(file)
    image.onload = () => {
      URL.revokeObjectURL(url)
      const longestSide = Math.max(image.width, image.height)
      const canvasSide = Math.max(1, Math.ceil(longestSide / (1 - paddingRatio * 2)))
      const canvas = document.createElement('canvas')
      canvas.width = canvasSide
      canvas.height = canvasSide
      const context = canvas.getContext('2d')
      context.clearRect(0, 0, canvasSide, canvasSide)
      context.drawImage(image, Math.round((canvasSide - image.width) / 2), Math.round((canvasSide - image.height) / 2))
      canvas.toBlob(blob => {
        if (!blob) {
          reject(new Error('队徽安全边距处理失败'))
          return
        }
        resolve(new File([blob], 'ai-team-logo.png', { type: 'image/png' }))
      }, 'image/png')
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('队徽安全边距处理失败'))
    }
    image.src = url
  })
}

/**
 * 统计透明像素占比，用于校验抠图是否真的生效：
 * < 3% 视为没抠掉背景（仍是白底），> 97% 视为抠成了空图（如 body_seg 对图形输出全透明）。
 */
async function computeAlphaRatio(file) {
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await loadImage(objectUrl)
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0)
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    const total = canvas.width * canvas.height
    let transparent = 0
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] < 8) transparent += 1
    }
    return { transparentRatio: total ? transparent / total : 0, total }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/**
 * 按 512/256/128 生成多档尺寸。此时图片已带 8% 安全边距且为正方形，等比缩放即可。
 */
async function renderSquareSizes(file) {
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await loadImage(objectUrl)
    if (!image.width || !image.height) throw new Error('候选图尺寸无效')
    const output = []
    for (const size of logoSizes) {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const context = canvas.getContext('2d')
      context.clearRect(0, 0, size, size)
      context.drawImage(image, 0, 0, image.width, image.height, 0, 0, size, size)
      const dataUrl = canvas.toDataURL('image/png')
      output.push({ size, dataUrl, blob: dataUrlToBlob(dataUrl) })
    }
    return output
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function applyCandidate(candidate) {
  if (processing.value || generating.value) return
  processing.value = true
  selectedId.value = candidate.id
  errorMessage.value = ''
  try {
    let file = await fetchCandidateFile(candidate)
    if (!file) throw new Error('无法读取候选图，请重试或手动上传队徽')
    // 与成人模式队徽链路一致：先压到 500 内，服务端未抠图时再做本地抠白。
    file = await compressToMaxSide(file, 500)
    let backgroundMethod = 'removeLogoBg-object_segment'
    if (!candidate.backgroundRemoved) {
      backgroundMethod = 'white-bg'
      const stripped = await removeWhiteBackground(file)
      if (stripped?.success && stripped.data) {
        file = new File([dataUrlToBlob(stripped.data)], `ai-team-logo-${Date.now()}.png`, { type: 'image/png' })
        backgroundMethod = 'local-white-bg'
      }
    }
    const alpha = await computeAlphaRatio(file)
    const transparentRatio = Number(alpha.transparentRatio.toFixed(4))
    // 3%~97% 之外视为抠图无效（白底未抠掉或抠成空图），必须提示，不能伪装成透明效果。
    const cutoutVerified = transparentRatio >= 0.03 && transparentRatio <= 0.97
    if (!cutoutVerified) {
      notices.value = [...new Set([...notices.value,
        `候选图透明像素占比 ${(transparentRatio * 100).toFixed(1)}%，未达到可用抠图标准，写入后将保留白底`])]
    }
    const withSafeArea = await addLogoSafeArea(file)
    const sizes = await renderSquareSizes(withSafeArea)
    if (!sizes.length) throw new Error('队徽裁剪失败')
    const uploaded = {}
    let primary = null
    for (const item of sizes) {
      const result = await uploadLargeFileViaCloud(
        `team-logos/${Date.now()}-${item.size}.png`,
        new File([item.blob], `team-logo-${item.size}.png`, { type: 'image/png' }),
        { chunkSize: 32 * 1024 }
      )
      if (!result?.success || !result.fileId) throw new Error(`队徽 ${item.size}px 上传失败`)
      const url = result.tempUrl || await getFileUrl(result.fileId)
      uploaded[item.size] = { fileID: result.fileId, url }
      if (item.size === 512) primary = { fileID: result.fileId, url }
    }
    if (!primary) throw new Error('队徽主图上传失败')
    const payload = {
      logo: primary.url || '',
      logoUrl: primary.url || '',
      logoFileId: primary.fileID,
      logoTransparentFileId: primary.fileID,
      logoTransparentUrl: primary.url || '',
      logoSizes: Object.fromEntries(Object.entries(uploaded).map(([size, item]) => [size, item.fileID])),
      logoSizeUrls: Object.fromEntries(Object.entries(uploaded).map(([size, item]) => [size, item.url])),
      logoSource: 'ai',
      logoAiGenerated: true,
      logoAiProvider: candidate.aiGenerated ? 'hunyuan-image' : '',
      logoAiGeneratedAt: new Date().toISOString(),
      logoAiPrompt: candidate.prompt || '',
      logoAiCompliance: aiCompliance.value || 'AI 生成图像，仅用于本赛事球队展示',
      logoBackgroundMethod: backgroundMethod,
      logoBackgroundStatus: cutoutVerified ? 'transparent' : 'not_cutout',
      logoBackgroundRemovalError: candidate.backgroundRemovalError || '',
      logoAlphaTransparentRatio: transparentRatio,
      updateTime: new Date()
    }
    appliedId.value = candidate.id
    emit('select', { candidate, payload })
    ElMessage.success(cutoutVerified
      ? '队徽已生成（透明底）并写入，记得保存球队信息'
      : '队徽已生成（白底未抠图）并写入，建议补一张透明 PNG')
  } catch (err) {
    console.error('[AI队徽] 写入失败:', err)
    errorMessage.value = err.message || '队徽处理失败，请重试'
  } finally {
    processing.value = false
  }
}
</script>

<style scoped>
.ai-logo-dialog { display: flex; flex-direction: column; gap: 16px; }
.ai-logo-head { display: flex; align-items: center; justify-content: space-between; }
.ai-logo-team { display: flex; align-items: baseline; gap: 10px; }
.ai-logo-team .label { color: #909399; font-size: 13px; }
.ai-logo-team strong { font-size: 18px; color: #1f2d3d; }
.ai-logo-form { display: flex; flex-direction: column; gap: 14px; }
.ai-logo-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.ai-logo-row .label { width: 40px; color: #606266; font-size: 13px; }
.color-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
.ai-logo-tip { margin: 0; color: #909399; font-size: 12px; }
.ai-logo-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; }
.ai-logo-card { border: 1px solid #e4e7ed; border-radius: 12px; padding: 10px; background: #fff; display: flex; flex-direction: column; gap: 10px; }
.ai-logo-card.selected { border-color: #409eff; }
.ai-logo-card.applied { border-color: #67c23a; }
.ai-logo-canvas { position: relative; width: 100%; aspect-ratio: 1 / 1; border-radius: 10px; overflow: hidden; display: flex; align-items: center; justify-content: center; }
.ai-logo-canvas img { width: 100%; height: 100%; object-fit: contain; }
.checkerboard {
  background-image:
    linear-gradient(45deg, #e9eef5 25%, transparent 25%),
    linear-gradient(-45deg, #e9eef5 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e9eef5 75%),
    linear-gradient(-45deg, transparent 75%, #e9eef5 75%);
  background-size: 18px 18px;
  background-position: 0 0, 0 9px, 9px -9px, -9px 0;
  background-color: #fff;
}
.ai-logo-flag { position: absolute; left: 8px; bottom: 8px; padding: 2px 8px; border-radius: 8px; background: rgba(0, 0, 0, .55); color: #fff; font-size: 12px; }
.ai-logo-flag.removed { background: rgba(22, 163, 74, .75); }
.ai-logo-card-actions { display: flex; justify-content: center; }
.ai-logo-note { margin: 0; color: #b45309; font-size: 12px; line-height: 1.4; word-break: break-all; }
.ai-logo-loading { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 10px; background: #f4f8ff; color: #1f2d3d; }
.ai-logo-loading small { display: block; color: #909399; font-size: 12px; margin-top: 2px; }
.ai-logo-alert { margin: 0; }
.ai-logo-footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.ai-logo-compliance { color: #909399; font-size: 12px; }
.ai-logo-footer-actions { display: flex; gap: 10px; }
</style>
