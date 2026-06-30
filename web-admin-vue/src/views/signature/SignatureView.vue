<template>
  <div class="signature-page">
    <div class="header">
      <h2>比赛监督签字</h2>
      <p v-if="matchInfo">{{ matchInfo.homeTeam }} vs {{ matchInfo.awayTeam }}</p>
      <p v-else class="warn-text">⚠️ 未获取到比赛信息，签字可能无法保存</p>
    </div>

    <!-- 横版 Canvas -->
    <div class="canvas-wrapper">
      <div class="canvas-label">请在下方横版区域手写签字</div>
      <div class="canvas-container" ref="containerRef">
        <canvas
          ref="canvasRef"
          class="signature-canvas"
          @touchstart.prevent="onTouchStart"
          @touchmove.prevent="onTouchMove"
          @touchend.prevent="onTouchEnd"
          @mousedown.prevent="onMouseDown"
          @mousemove.prevent="onMouseMove"
          @mouseup.prevent="onMouseUp"
          @mouseleave.prevent="onMouseUp"
        ></canvas>
        <div v-if="!hasDrawn" class="placeholder">请在此处手写签字</div>
      </div>
      <div v-if="pressureSupported" class="pressure-badge">
        ✓ 支持压感笔
      </div>
    </div>

    <div class="actions">
      <button class="btn-clear" @click="clearCanvas">清除重写</button>
      <button class="btn-submit" :disabled="!hasDrawn || submitting" @click="submitSignature">
        {{ submitting ? '提交中...' : '提交签字' }}
      </button>
    </div>

    <div v-if="message" class="message" :class="messageType">{{ message }}</div>

    <!-- 调试信息（开发时用） -->
    <div v-if="debugInfo" class="debug-info">
      <pre>{{ debugInfo }}</pre>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const canvasRef = ref(null)
const containerRef = ref(null)
const ctx = ref(null)
const isDrawing = ref(false)
const hasDrawn = ref(false)
const submitting = ref(false)
const message = ref('')
const messageType = ref('')
const matchInfo = ref(null)
const pressureSupported = ref(false)
const debugInfo = ref('')

// 笔触模拟相关
const lastX = ref(0)
const lastY = ref(0)
const lastTime = ref(0)
const lastPressure = ref(0.5)

const matchId = route.query.matchId || ''

onMounted(() => {
  // 延迟初始化，确保 DOM 已渲染
  nextTick(() => {
    initCanvas()
  })
  if (matchId) {
    loadMatchInfo()
  } else {
    message.value = '⚠️ 缺少比赛ID，无法保存签字'
    messageType.value = 'error'
  }
})

onUnmounted(() => {
  ctx.value = null
})

function initCanvas() {
  const canvas = canvasRef.value
  const container = containerRef.value
  if (!canvas || !container) {
    console.error('[initCanvas] canvas 或 container 未找到', { canvas, container })
    return
  }

  const dpr = window.devicePixelRatio || 1
  const w = container.clientWidth
  const h = container.clientHeight


  canvas.width = w * dpr
  canvas.height = h * dpr
  canvas.style.width = w + 'px'
  canvas.style.height = h + 'px'

  const context = canvas.getContext('2d')
  // 关键：重置变换矩阵后再 scale
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.strokeStyle = '#1B5E20'
  context.lineWidth = 3
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.imageSmoothingEnabled = true

  // 检测是否支持压感
  try {
    const te = new TouchEvent('touchstart', { touches: [new TouchEvent('touchstart')] })
    pressureSupported.value = ('force' in TouchEvent.prototype)
  } catch (e) {
    pressureSupported.value = false
  }

  ctx.value = context
}

async function loadMatchInfo() {
  try {
    const res = await callFunction('getMatchById', { matchId })
    if (res && res.code === 0 && res.data) {
      matchInfo.value = res.data
    }
  } catch (e) {
    console.error('[loadMatchInfo] 失败:', e)
  }
}

/**
 * 计算笔触压力（根据移动速度模拟）
 */
function calcPressure(x, y, timestamp) {
  if (!lastTime.value || lastTime.value === 0) {
    lastX.value = x
    lastY.value = y
    lastTime.value = timestamp
    return 0.5
  }

  const dx = x - lastX.value
  const dy = y - lastY.value
  const dist = Math.sqrt(dx * dx + dy * dy)
  const dt = timestamp - lastTime.value

  lastX.value = x
  lastY.value = y
  lastTime.value = timestamp

  if (dt <= 0 || dist < 2) return lastPressure.value || 0.5

  const speed = dist / dt
  const pressure = Math.max(0.15, Math.min(1.0, 1.0 - speed * 1.8))
  const smoothed = pressure * 0.4 + (lastPressure.value || 0.5) * 0.6
  lastPressure.value = smoothed
  return smoothed
}

function getPos(e) {
  const canvas = canvasRef.value
  if (!canvas) return { x: 0, y: 0 }
  const rect = canvas.getBoundingClientRect()
  const clientX = e.touches ? e.touches[0].clientX : e.clientX
  const clientY = e.touches ? e.touches[0].clientY : e.clientY
  return {
    x: clientX - rect.left,
    y: clientY - rect.top
  }
}

// ========== 触摸事件 ==========
function onTouchStart(e) {
  isDrawing.value = true
  hasDrawn.value = true
  const pos = getPos(e)
  const now = Date.now()

  let pressure = 0.5
  if (e.touches && e.touches[0] && e.touches[0].force !== undefined && e.touches[0].force > 0) {
    pressure = e.touches[0].force
  } else {
    pressure = calcPressure(pos.x, pos.y, now)
  }

  ctx.value.beginPath()
  ctx.value.moveTo(pos.x, pos.y)
  applyPressure(pressure)
}

function onTouchMove(e) {
  if (!isDrawing.value) return
  const pos = getPos(e)
  const now = Date.now()

  let pressure = 0.5
  if (e.touches && e.touches[0] && e.touches[0].force !== undefined && e.touches[0].force > 0) {
    pressure = e.touches[0].force
  } else {
    pressure = calcPressure(pos.x, pos.y, now)
  }

  applyPressure(pressure)
  ctx.value.lineTo(pos.x, pos.y)
  ctx.value.stroke()
}

function onTouchEnd() {
  isDrawing.value = false
}

// ========== 鼠标事件 ==========
function onMouseDown(e) {
  isDrawing.value = true
  hasDrawn.value = true
  const pos = getPos(e)
  calcPressure(pos.x, pos.y, Date.now())
  ctx.value.beginPath()
  ctx.value.moveTo(pos.x, pos.y)
  ctx.value.lineWidth = 2.5
  ctx.value.strokeStyle = 'rgba(27, 94, 32, 0.75)'
}

function onMouseMove(e) {
  if (!isDrawing.value) return
  const pos = getPos(e)
  const now = Date.now()
  const pressure = calcPressure(pos.x, pos.y, now)
  ctx.value.lineWidth = 1 + pressure * 5
  ctx.value.strokeStyle = `rgba(27, 94, 32, ${0.35 + pressure * 0.65})`
  ctx.value.lineTo(pos.x, pos.y)
  ctx.value.stroke()
}

function onMouseUp() {
  isDrawing.value = false
}

function applyPressure(pressure) {
  ctx.value.lineWidth = 1 + pressure * 6
  const alpha = 0.3 + pressure * 0.7
  ctx.value.strokeStyle = `rgba(27, 94, 32, ${alpha})`
}

function clearCanvas() {
  const canvas = canvasRef.value
  if (!canvas || !ctx.value) return
  const dpr = window.devicePixelRatio || 1
  ctx.value.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.value.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
  hasDrawn.value = false
  lastX.value = 0
  lastY.value = 0
  lastTime.value = 0
  lastPressure.value = 0.5
  ctx.value.strokeStyle = '#1B5E20'
  ctx.value.lineWidth = 3
}

async function submitSignature() {
  if (!hasDrawn.value || !matchId) {
    message.value = '请先手写签字，且比赛ID不能为空'
    messageType.value = 'error'
    return
  }

  submitting.value = true
  message.value = '正在提交...'
  messageType.value = 'info'

  try {
    const canvas = canvasRef.value
    if (!canvas) throw new Error('Canvas 未找到')

    const base64 = canvas.toDataURL('image/png')

    if (!base64 || base64 === 'data:,' || base64.length < 100) {
      throw new Error('签字图片生成失败，请重新签字')
    }

    const res = await callFunction('saveSignature', {
      matchId: matchId,
      signatureImage: base64,
      signedBy: '比赛监督',
      signedAt: new Date().toISOString()
    })


    if (res && res.code === 0) {
      message.value = '✓ 签字提交成功！'
      messageType.value = 'success'
      setTimeout(() => {
        try { window.close() } catch (e) {}
      }, 2000)
    } else {
      const errMsg = (res && res.message) || '提交失败，请重试'
      message.value = '❌ ' + errMsg
      messageType.value = 'error'
      alert('提交失败：' + errMsg)
    }
  } catch (e) {
    console.error('[submitSignature] 异常:', e)
    const errMsg = '提交失败：' + (e.message || e)
    message.value = errMsg
    messageType.value = 'error'
    alert(errMsg)
    // 显示调试信息
    debugInfo.value = JSON.stringify({
      error: e.message,
      matchId,
      hasCanvas: !!canvasRef.value,
      hasCtx: !!ctx.value,
    }, null, 2)
  } finally {
    submitting.value = false
  }
}

// ========== cloud.js 中的 callFunction 调用封装 ==========
// 如果 @/utils/cloud.js 的 callFunction 有问题，直接用 fetch 调用云函数
async function callFunction(name, data) {
  try {
    // 方法1：用项目已有的 callFunction
    const { callFunction: cf } = await import('@/utils/cloud.js')
    const res = await cf(name, data)
    return res
  } catch (e) {
    console.error('[callFunction] 失败:', e)
    // 方法2：如果上面失败，尝试直接调用（需要云开发初始化）
    throw e
  }
}
</script>

<style>
/* 全局样式（不用 scoped，确保生效） */
.signature-page {
  min-height: 100vh;
  background: #f5f5f5;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;
  box-sizing: border-box;
}

.header {
  text-align: center;
  margin-bottom: 16px;
  width: 100%;
  max-width: 700px;
}

.header h2 {
  color: #1B5E20;
  margin: 0 0 8px 0;
  font-size: 22px;
}

.header p {
  color: #666;
  margin: 0;
  font-size: 15px;
}

.warn-text {
  color: #E6A23C;
  font-size: 13px;
  margin-top: 4px;
}

/* 横版容器 */
.canvas-wrapper {
  width: 100%;
  max-width: 700px;
  margin-bottom: 16px;
}

.canvas-label {
  font-size: 13px;
  color: #909399;
  margin-bottom: 8px;
  text-align: center;
}

.canvas-container {
  position: relative;
  width: 100%;
  height: 260px;
  background: white;
  border: 2px dashed #bbb;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  overflow: hidden;
}

.signature-canvas {
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: crosshair;
}

.placeholder {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #ccc;
  font-size: 18px;
  pointer-events: none;
  font-style: italic;
}

.pressure-badge {
  position: absolute;
  top: 8px;
  right: 12px;
  font-size: 11px;
  color: #43A047;
  background: #E8F5E9;
  padding: 2px 8px;
  border-radius: 10px;
}

.actions {
  display: flex;
  gap: 16px;
  width: 100%;
  max-width: 700px;
  margin-bottom: 12px;
}

.btn-clear {
  flex: 1;
  padding: 14px;
  border: 1px solid #ccc;
  background: white;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-clear:hover {
  background: #f5f5f5;
  border-color: #999;
}

.btn-submit {
  flex: 2;
  padding: 14px;
  border: none;
  background: linear-gradient(135deg, #1B5E20, #43A047);
  color: white;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(27, 94, 32, 0.3);
}

.btn-submit:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(27, 94, 32, 0.4);
}

.btn-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.message {
  margin-top: 8px;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 14px;
  width: 100%;
  max-width: 700px;
  box-sizing: border-box;
  text-align: center;
}

.message.success {
  background: #E8F5E9;
  color: #1B5E20;
}

.message.error {
  background: #ffebee;
  color: #c62828;
}

.message.info {
  background: #E3F2FD;
  color: #1565C0;
}

.debug-info {
  margin-top: 12px;
  padding: 8px;
  background: #f5f5f5;
  border-radius: 4px;
  width: 100%;
  max-width: 700px;
  overflow: auto;
  font-size: 11px;
}

.debug-info pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

/* 手机横屏适配 */
@media (max-width: 500px) {
  .canvas-container {
    height: 200px;
  }
}
</style>
