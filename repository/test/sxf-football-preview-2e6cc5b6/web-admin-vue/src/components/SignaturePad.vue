<template>
  <el-dialog
    v-model="visible"
    :title="title"
    width="620px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    @close="handleClose"
  >
    <div class="sp-container">
      <div class="sp-toolbar">
        <span class="sp-label">签字板</span>
        <el-button size="small" @click="clearCanvas">清除重签</el-button>
        <el-button size="small" @click="undoStroke">撤销一笔</el-button>
        <el-color-picker v-model="penColor" size="small" />
        <span class="sp-pen-label">粗细</span>
        <el-slider v-model="penWidth" :min="1" :max="5" style="width:90px" />
      </div>
      <div class="sp-canvas-wrap" ref="wrapRef">
        <canvas
          ref="canvasRef"
          :width="cw"
          :height="ch"
          @mousedown="onMouseDown"
          @mousemove="onMouseMove"
          @mouseup="onMouseUp"
          @mouseleave="onMouseUp"
          @touchstart.prevent="onTouchStart"
          @touchmove.prevent="onTouchMove"
          @touchend.prevent="onMouseUp"
          class="sp-canvas"
        />
        <div v-if="strokeStack.length === 0" class="sp-placeholder">请在此处手写签名</div>
      </div>
      <div class="sp-actions">
        <el-button @click="handleCancel">取消</el-button>
        <el-button type="primary" @click="handleConfirm" :disabled="strokeStack.length === 0">确认签字</el-button>
      </div>
    </div>

    <!-- 预设签名模式 -->
    <div v-if="mode === 'preset'" class="sp-preset-section">
      <el-divider>预设签名（快捷模式）</el-divider>
      <div class="sp-preset-list" v-if="savedSignatures && savedSignatures.length">
        <div
          v-for="(sig, idx) in savedSignatures"
          :key="idx"
          class="sp-preset-item"
          :class="{ 'sp-active': selectedIdx === idx }"
          @click="selectedIdx = idx"
        >
          <img :src="sig.dataUrl" class="sp-preset-img" />
          <span class="sp-preset-name">{{ sig.name || '签名' + (idx+1) }}</span>
        </div>
      </div>
      <el-empty v-else description="暂无预设签名，请现场签署后保存" />
      <div v-if="savedSignatures && savedSignatures.length" class="sp-preset-actions">
        <el-button type="primary" @click="handlePresetConfirm" :disabled="selectedIdx === null">使用选中签名</el-button>
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, defineProps, defineEmits, defineExpose } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '在线签字' },
  mode: { type: String, default: 'live' },
  savedSignatures: { type: Array, default: () => [] },
  refereeId: { type: String, default: '' },
  refereeName: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue', 'confirm', 'cancel'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const wrapRef = ref(null)
const canvasRef = ref(null)
const cw = ref(560)
const ch = ref(200)
const penColor = ref('#000000')
const penWidth = ref(2)
const selectedIdx = ref(null)

let ctx = null
let drawing = false
let lastX = 0
let lastY = 0
const strokeStack = ref([])
let currentStroke = []

const isEmpty = computed(() => strokeStack.value.length === 0)

onMounted(() => {
  nextTick(() => { initCanvas() })
})

function initCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, cw.value, ch.value)
  drawGuideLine()
}

function drawGuideLine() {
  if (!ctx) return
  ctx.save()
  ctx.strokeStyle = '#cccccc'
  ctx.setLineDash([6, 4])
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(30, ch.value - 40)
  ctx.lineTo(cw.value - 30, ch.value - 40)
  ctx.stroke()
  ctx.restore()
}

function getPos(e) {
  const rect = canvasRef.value.getBoundingClientRect()
  return {
    x: (e.clientX - rect.left) * (cw.value / rect.width),
    y: (e.clientY - rect.top) * (ch.value / rect.height)
  }
}

function onMouseDown(e) {
  drawing = true
  const p = getPos(e)
  lastX = p.x
  lastY = p.y
  currentStroke = [{ x: p.x, y: p.y }]
}

function onMouseMove(e) {
  if (!drawing) return
  const p = getPos(e)
  currentStroke.push({ x: p.x, y: p.y })
  ctx.beginPath()
  ctx.strokeStyle = penColor.value
  ctx.lineWidth = penWidth.value
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.moveTo(lastX, lastY)
  ctx.lineTo(p.x, p.y)
  ctx.stroke()
  lastX = p.x
  lastY = p.y
}

function onMouseUp() {
  if (drawing) {
    drawing = false
    if (currentStroke.length > 1) {
      strokeStack.value = [...strokeStack.value, currentStroke]
    }
    currentStroke = []
  }
}

function onTouchStart(e) {
  const t = e.touches[0]
  const me = new MouseEvent('mousedown', { clientX: t.clientX, clientY: t.clientY })
  onMouseDown(me)
}

function onTouchMove(e) {
  const t = e.touches[0]
  const me = new MouseEvent('mousemove', { clientX: t.clientX, clientY: t.clientY })
  onMouseMove(me)
}

function clearCanvas() {
  if (!ctx) return
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, cw.value, ch.value)
  drawGuideLine()
  strokeStack.value = []
  currentStroke = []
}

function undoStroke() {
  if (!strokeStack.value.length || !ctx) return
  strokeStack.value = strokeStack.value.slice(0, -1)
  redrawAll()
}

function redrawAll() {
  if (!ctx) return
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, cw.value, ch.value)
  drawGuideLine()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const stroke of strokeStack.value) {
    if (stroke.length < 2) continue
    ctx.beginPath()
    ctx.strokeStyle = penColor.value
    ctx.lineWidth = penWidth.value
    ctx.moveTo(stroke[0].x, stroke[0].y)
    for (let i = 1; i < stroke.length; i++) {
      ctx.lineTo(stroke[i].x, stroke[i].y)
    }
    ctx.stroke()
  }
}

function getBase64() {
  return canvasRef.value.toDataURL('image/png')
}

function handleConfirm() {
  if (strokeStack.value.length === 0) {
    ElMessage.warning('请先签名')
    return
  }
  const dataUrl = getBase64()
  emit('confirm', {
    dataUrl,
    refereeId: props.refereeId,
    refereeName: props.refereeName,
    timestamp: new Date().toISOString(),
    mode: 'live'
  })
  visible.value = false
}

function handlePresetConfirm() {
  if (selectedIdx.value === null) return
  const sig = props.savedSignatures[selectedIdx.value]
  emit('confirm', {
    ...sig,
    refereeId: props.refereeId,
    refereeName: props.refereeName,
    timestamp: new Date().toISOString(),
    mode: 'preset'
  })
  visible.value = false
}

function handleCancel() {
  emit('cancel')
  visible.value = false
}

function handleClose() {
  emit('cancel')
  visible.value = false
}

defineExpose({ getBase64: getBase64, clearCanvas })
</script>

<style scoped>
.sp-container { display:flex; flex-direction:column; gap:10px; }
.sp-toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.sp-label { font-size:13px; color:#666; font-weight:500; }
.sp-pen-label { font-size:12px; color:#999; }
.sp-canvas-wrap { position:relative; border:2px dashed #d0d0d0; border-radius:8px; background:#fafafa; overflow:hidden; }
.sp-canvas { display:block; cursor:crosshair; touch-action:none; }
.sp-placeholder { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); color:#bbbbbb; font-size:16px; pointer-events:none; }
.sp-actions { display:flex; justify-content:flex-end; gap:10px; }
.sp-preset-section { margin-top:16px; }
.sp-preset-list { display:flex; gap:12px; flex-wrap:wrap; margin:12px 0; }
.sp-preset-item { border:2px solid #dcdfe6; border-radius:8px; padding:8px; cursor:pointer; text-align:center; transition:border-color 0.2s; width:130px; }
.sp-preset-item:hover { border-color:#409eff; }
.sp-preset-item.sp-active { border-color:#409eff; box-shadow:0 0 6px rgba(64,158,255,0.3); }
.sp-preset-img { width:100%; height:50px; object-fit:contain; display:block; margin-bottom:4px; }
.sp-preset-name { display:block; font-size:12px; color:#333; }
.sp-preset-actions { display:flex; justify-content:center; }
</style>
