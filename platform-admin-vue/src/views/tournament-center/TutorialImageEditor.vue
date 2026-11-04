<template>
  <el-dialog v-model="visible" title="编辑步骤截图" width="min(1160px, 98vw)" top="4vh" class="tutorial-image-dialog" :close-on-click-modal="false" :before-close="close">
    <div class="image-tools">
      <el-button type="primary" :loading="recognizing" :disabled="!ready || saving" @click="autoMask">一键遮隐私</el-button>
      <el-button v-if="previousMasks.length" :disabled="!ready || recognizing || saving" @click="reuse">沿用上一步</el-button>
      <el-radio-group v-model="tool" :disabled="recognizing || saving" aria-label="标注工具"><el-radio-button value="mask">遮盖</el-radio-button><el-radio-button value="box">方框</el-radio-button><el-radio-button value="arrow">箭头</el-radio-button><el-radio-button value="select">选择移动</el-radio-button></el-radio-group>
      <el-button :disabled="!undoStack.length || recognizing || saving" @click="undo">撤销</el-button><el-button :disabled="!redoStack.length || recognizing || saving" @click="redo">重做</el-button>
      <el-button :disabled="selected < 0 || recognizing || saving" @click="removeSelected">删除选中</el-button>
    </div>
    <p class="privacy-note">识别仅在本机进行。自动处理可能遗漏队徽、头像或文字，请核对并框选补盖。</p>
    <el-progress v-if="saving" :percentage="savingProgress" />
    <el-progress v-if="recognizing" :percentage="progress" :show-text="false" /><el-alert v-if="error" :title="error" type="error" :closable="false" />
    <div class="canvas-workspace" v-loading="!ready && !error"><canvas ref="canvas" tabindex="0" aria-label="截图标注画布，拖动绘制，选择移动工具后可选中或删除标注" :class="{drawing: tool !== 'select'}" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="cancelDrawing" @keydown.delete.prevent="removeSelected" /></div>
    <div class="image-status"><span>{{ ready ? width+' × '+height : '正在读取截图' }}<template v-if="shapes.length"> · {{ shapes.filter(s => s.type === 'mask').length }} 处遮盖 · {{ shapes.filter(s => s.type !== 'mask').length }} 个标注</template></span><el-checkbox v-model="reviewed" :disabled="recognizing || saving || !ready">已核对隐私区域</el-checkbox></div>
    <template #footer><el-button :disabled="!ready || saving || recognizing" :loading="exporting" @click="downloadImage">下载处理图</el-button><el-button :disabled="saving" @click="close()">取消</el-button><el-button type="primary" :disabled="!ready || !reviewed || recognizing" :loading="saving || exporting" @click="apply">使用处理后图片</el-button></template>
  </el-dialog>
</template>
<script setup>
import { nextTick, onBeforeUnmount, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { badgeCandidates, normalizedMasks, privacyTextRegions, recognizeLocally, renderAnnotations, scaleMasks } from '@/utils/tutorialPrivacy'
const props = defineProps({ saving: Boolean, savingProgress: { type:Number,default:0 } })
const emit = defineEmits(['apply'])
const visible = ref(false), canvas = ref(null), ready = ref(false), error = ref(''), tool = ref('mask'), recognizing = ref(false), progress = ref(0), reviewed = ref(false), selected = ref(-1), shapes = ref([]), undoStack = ref([]), redoStack = ref([]), previousMasks = ref([]), width = ref(0), height = ref(0), exporting = ref(false)
let image = null, source = '', gesture = null, cancelRecognition = null, generation = 0
function paint() { if (!ready.value || !canvas.value || !image) return; const c = canvas.value, ctx = c.getContext('2d'); ctx.clearRect(0,0,c.width,c.height); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,c.width,c.height); ctx.drawImage(image,0,0,c.width,c.height); renderAnnotations(ctx,shapes.value,selected.value) }
function remember() { undoStack.value.push(JSON.stringify(shapes.value)); if (undoStack.value.length > 50) undoStack.value.shift(); redoStack.value = []; reviewed.value = false }
async function open(options) {
  const current = ++generation; cancelRecognition?.(); visible.value = true; ready.value = false; error.value = ''; source = options.source; tool.value = 'mask'; selected.value = -1; shapes.value = JSON.parse(JSON.stringify(options.shapes || [])); undoStack.value = []; redoStack.value = []; reviewed.value = false; previousMasks.value = options.previousMasks || []
  await nextTick()
  try {
    const next = new Image(); if (/^https?:/.test(source)) { next.crossOrigin = 'anonymous'; next.referrerPolicy = 'no-referrer' }
    await new Promise((resolve,reject) => { next.onload = resolve; next.onerror = () => reject(new Error('截图读取失败，请重新上传图片')); next.src = source })
    if (current !== generation) return
    if (next.naturalWidth*next.naturalHeight > 50000000) throw new Error('截图像素过大，请裁小后重新上传')
    const factor = Math.min(1,2400/Math.max(next.naturalWidth,next.naturalHeight)); width.value = Math.round(next.naturalWidth*factor); height.value = Math.round(next.naturalHeight*factor)
    if (!width.value || !height.value) throw new Error('图片尺寸无效，请更换截图')
    image = next; canvas.value.width = width.value; canvas.value.height = height.value; ready.value = true; paint()
  } catch (e) { if (current === generation) error.value = e.message }
}
function point(e) { const r = canvas.value.getBoundingClientRect(); return { x: Math.max(0,Math.min(width.value,(e.clientX-r.left)*width.value/r.width)), y: Math.max(0,Math.min(height.value,(e.clientY-r.top)*height.value/r.height)) } }
function down(e) {
  if (!ready.value || recognizing.value || props.saving || e.button !== 0) return
  const p = point(e); canvas.value.focus(); canvas.value.setPointerCapture(e.pointerId)
  if (tool.value === 'select') {
    selected.value = -1
    for (let i = shapes.value.length-1; i >= 0; i--) { const s = shapes.value[i], pad = Math.max(10,width.value/70); if (p.x >= Math.min(s.x,s.x+s.w)-pad && p.x <= Math.max(s.x,s.x+s.w)+pad && p.y >= Math.min(s.y,s.y+s.h)-pad && p.y <= Math.max(s.y,s.y+s.h)+pad) { selected.value = i; remember(); gesture = { point:p, shape:{...s}, index:i, moving:true }; break } }
  } else { remember(); shapes.value.push({ type: tool.value, x:p.x, y:p.y, w:0, h:0 }); selected.value = shapes.value.length-1; gesture = { point:p, index:selected.value, moving:false } }
  paint()
}
function move(e) {
  if (!gesture) return
  const p = point(e), g = gesture, s = shapes.value[g.index]
  if (g.moving) {
    const left = Math.min(0,g.shape.w), top = Math.min(0,g.shape.h)
    s.x = Math.max(-left,Math.min(width.value-Math.max(0,g.shape.w),g.shape.x+p.x-g.point.x)); s.y = Math.max(-top,Math.min(height.value-Math.max(0,g.shape.h),g.shape.y+p.y-g.point.y))
  } else { s.w = p.x-g.point.x; s.h = p.y-g.point.y }
  paint()
}
function up(e) {
  if (!gesture) return; move(e)
  const s = shapes.value[gesture.index]
  if (!gesture.moving) {
    if (Math.hypot(s.w,s.h) < 5 || (s.type !== 'arrow' && (Math.abs(s.w)<3 || Math.abs(s.h)<3))) { shapes.value.splice(gesture.index,1); undoStack.value.pop(); selected.value = -1 }
    else if (s.type !== 'arrow') { if (s.w<0) { s.x+=s.w;s.w=-s.w } if (s.h<0) { s.y+=s.h;s.h=-s.h } }
  }
  gesture = null; paint()
}
function cancelDrawing() { if (!gesture) return; const previous = undoStack.value.pop(); if (previous) shapes.value = JSON.parse(previous); gesture = null; selected.value = -1; paint() }
function undo() { if (!undoStack.value.length) return; redoStack.value.push(JSON.stringify(shapes.value)); shapes.value = JSON.parse(undoStack.value.pop()); selected.value = -1; reviewed.value = false; paint() }
function redo() { if (!redoStack.value.length) return; undoStack.value.push(JSON.stringify(shapes.value)); shapes.value = JSON.parse(redoStack.value.pop()); selected.value = -1; reviewed.value = false; paint() }
function removeSelected() { if (selected.value < 0 || recognizing.value || props.saving) return; remember(); shapes.value.splice(selected.value,1); selected.value = -1; paint() }
function reuse() { remember(); shapes.value.push(...scaleMasks(previousMasks.value,width.value,height.value)); selected.value = -1; paint(); ElMessage.success('已沿用上一步遮盖，请核对位置') }
async function autoMask() {
  if (recognizing.value || !ready.value) return
  const current = generation; recognizing.value = true; progress.value = 0; error.value = ''
  try {
    // OCR sees the source locally; drawing/selection overlays are not sent to it.
    const sourceCanvas = document.createElement('canvas'); sourceCanvas.width = width.value; sourceCanvas.height = height.value; const ctx = sourceCanvas.getContext('2d'); ctx.fillStyle='#fff';ctx.fillRect(0,0,width.value,height.value);ctx.drawImage(image,0,0,width.value,height.value)
    const blocks = await recognizeLocally(sourceCanvas,p => { if (current === generation) progress.value = p }, cancel => { cancelRecognition = cancel; if (current !== generation) cancel?.() })
    if (current !== generation || !visible.value) return
    const text = privacyTextRegions(blocks,width.value,height.value), small = document.createElement('canvas'); small.width = Math.min(480,width.value); small.height = Math.round(height.value*small.width/width.value); const smallCtx = small.getContext('2d'); smallCtx.drawImage(image,0,0,small.width,small.height)
    const badges = badgeCandidates(smallCtx.getImageData(0,0,small.width,small.height),width.value,height.value,text)
    const next = [...text,...badges]
    if (!next.length) { error.value = '未找到可自动遮盖的区域，请手动框选隐私'; return }
    remember(); shapes.value = shapes.value.filter(s => !s.automatic).concat(next); selected.value = -1; paint(); ElMessage.success('已遮盖'+text.length+'处文字、'+badges.length+'处图形候选，请核对')
  } catch (e) { if (current === generation) error.value = e.message || '识别失败，请重试或手动遮盖' } finally { if (current === generation) recognizing.value = false }
}
async function exportFile() {
  const output = document.createElement('canvas'); output.width = width.value; output.height = height.value; const ctx = output.getContext('2d'); ctx.fillStyle = '#fff';ctx.fillRect(0,0,width.value,height.value);ctx.drawImage(image,0,0,width.value,height.value); renderAnnotations(ctx,shapes.value)
  let blob
  for (const quality of [.94,.85,.72]) { blob = await new Promise(resolve => output.toBlob(resolve,'image/jpeg',quality)); if (blob && blob.size <= 2*1024*1024) break }
  if (!blob || blob.size > 2*1024*1024) throw new Error('处理后图片仍超过2MB，请裁小截图后重新上传')
  return new File([blob],'tutorial-step.jpg',{type:'image/jpeg'})
}
async function downloadImage() {
  if (!ready.value || exporting.value || recognizing.value || props.saving) return
  exporting.value = true
  try { const file=await exportFile(),url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download='教程步骤-处理后.jpg';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000) } catch(e) { error.value='图片保存失败，请重新选择截图' } finally { exporting.value=false }
}
async function apply() {
  if (!reviewed.value || props.saving || exporting.value || recognizing.value) return
  exporting.value = true; error.value = ''
  try {
    const file=await exportFile()
    emit('apply',{ file, source, shapes:JSON.parse(JSON.stringify(shapes.value)), masks:normalizedMasks(shapes.value,width.value,height.value) })
  } catch (e) { error.value = e.name === 'SecurityError' ? '图片不允许在线编辑，请重新上传原截图' : e.message } finally { exporting.value = false }
}
function uploadFailed(message) { error.value = message || '图片上传中断，请重试，当前标注已保留' }
async function close(done) {
  if (props.saving) return
  if (shapes.value.length && !recognizing.value) { try { await ElMessageBox.confirm('本次图片编辑尚未使用，是否关闭？','关闭编辑器',{confirmButtonText:'关闭',cancelButtonText:'继续编辑'}) } catch { return } }
  ++generation; cancelRecognition?.(); recognizing.value = false; visible.value = false; image = null; source = ''; if (typeof done === 'function') done()
}
function saved() { ++generation; visible.value = false; image = null; source = ''; shapes.value = [] }
onBeforeUnmount(() => { ++generation; cancelRecognition?.() })
defineExpose({ open, saved, uploadFailed })
</script>
<style scoped>
.image-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.image-tools :deep(.el-button+.el-button){margin-left:0}.privacy-note{font-size:12px;color:#68766d;margin:12px 0}.canvas-workspace{margin-top:12px;height:min(65vh,700px);overflow:auto;background:#edf0ee;display:flex;align-items:flex-start;justify-content:center;border:1px solid #dce3de}.canvas-workspace canvas{display:block;max-width:100%;height:auto;max-height:none;touch-action:none;cursor:default;outline:none;background:#fff}.canvas-workspace canvas.drawing{cursor:crosshair}.image-status{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:10px;color:#647168;font-size:12px;flex-wrap:wrap}@media(max-width:700px){.canvas-workspace{height:55vh}.image-tools{gap:6px}.image-tools :deep(.el-button){padding:8px}.image-tools :deep(.el-radio-button__inner){padding:8px}}
</style>
