<template>
  <el-dialog v-model="visible" :title="id ? '编辑教程' : '新建教程'" width="min(1080px, 96vw)" top="4vh" :close-on-click-modal="false" :before-close="close">
    <p v-if="source" class="source">来源反馈（不公开）：{{ source }}</p>
    <el-form label-position="top" :disabled="busy || uploading" @paste="pasteImage">
      <div class="basics"><el-form-item label="标题" required><el-input v-model="form.title" maxlength="80" show-word-limit /></el-form-item>
        <el-form-item label="分类"><el-select v-model="form.category" filterable allow-create><el-option v-for="v in categories" :key="v" :label="v" :value="v" /></el-select></el-form-item>
        <el-form-item label="适用端口"><el-select v-model="form.audience"><el-option v-for="v in ['通用','球队小程序','足球世界小程序','服务号H5','主办方PC']" :key="v" :label="v" :value="v" /></el-select></el-form-item>
      </div>
      <el-form-item label="适用条件"><el-input v-model="form.intro" maxlength="500" aria-label="适用条件" /></el-form-item>
      <div class="step-builder">
        <nav class="step-directory" aria-label="教程步骤"><button v-for="(step, i) in form.steps" :key="step.key" type="button" :class="{active: activeIndex === i}" :disabled="busy || uploading" @click="activeIndex = i"><span class="step-number">{{ i + 1 }}</span><span class="step-summary"><strong>{{ step.title || '第'+(i+1)+'步' }}</strong><small>{{ step.image ? '已添加截图' : '未添加截图' }} · {{ step.text.trim() ? '已填写描述' : '待填写描述' }}</small></span></button><el-button class="add-step" :disabled="form.steps.length >= 30" @click="addStep">添加步骤</el-button></nav>
        <section v-if="activeStep" class="active-step">
          <div class="step-head"><strong>第 {{ activeIndex + 1 }} 步</strong><span><el-button link :disabled="activeIndex === 0" @click="move(activeIndex, -1)">上移</el-button><el-button link :disabled="activeIndex === form.steps.length - 1" @click="move(activeIndex, 1)">下移</el-button><el-button link type="danger" @click="removeStep">删除</el-button></span></div>
          <div class="step-content"><div class="step-picture"><div class="picture-preview" tabindex="0" role="group" aria-label="步骤截图粘贴区" @pointerdown="$event.currentTarget.focus({ preventScroll: true })" @dragover.prevent @drop.prevent="dropImage"><el-image v-if="activeStep.image" :src="imageUrls[activeStep.image] || activeStep.image" fit="contain"><template #error><span>图片暂不可用，请重新上传</span></template></el-image><div v-else class="upload-empty"><strong>步骤截图</strong><span>点击后按 Ctrl＋V，或拖入截图</span></div></div><div class="picture-actions"><label class="upload-button"><input type="file" accept="image/png,image/jpeg,image/webp" :disabled="busy || uploading" @change="chooseImage">{{ activeStep.image ? '更换截图' : '选择截图' }}</label><el-button v-if="activeStep.image" :disabled="uploading" @click="editImage">编辑截图</el-button><el-button v-if="activeStep.image" link type="danger" @click="activeStep.image = ''">移除</el-button></div><small class="image-hint">先处理隐私和标注，再上传成图</small></div>
          <div class="step-description"><el-form-item label="步骤名称（选填）"><el-input v-model="activeStep.title" maxlength="80" aria-label="步骤名称" /></el-form-item><el-form-item label="步骤描述" required><el-input v-model="activeStep.text" type="textarea" :rows="7" maxlength="3000" show-word-limit aria-label="步骤描述" /></el-form-item></div></div>
          <div class="step-paging"><el-button :disabled="activeIndex === 0" @click="activeIndex--">上一步</el-button><span>{{ activeIndex + 1 }} / {{ form.steps.length }}</span><el-button v-if="activeIndex < form.steps.length - 1" @click="activeIndex++">下一步</el-button><el-button v-else :disabled="form.steps.length >= 30" @click="addStep">添加下一步</el-button></div>
        </section>
      </div>
    </el-form>
    <el-alert v-if="published" title="保存草稿不会改变客户正在阅读的已发布版本" type="info" :closable="false" style="margin-top:16px" />
    <template #footer><el-button :disabled="busy || uploading" @click="close()">取消</el-button><el-button :disabled="busy || uploading" @click="preview = true">预览</el-button><el-button :loading="busy" :disabled="uploading" @click="save('draft')">保存草稿</el-button><el-button type="primary" :loading="busy" :disabled="uploading" @click="save('publish')">发布教程</el-button></template>
  </el-dialog>
  <el-dialog v-model="preview" title="教程预览" width="min(480px, 96vw)"><article class="article"><h1>{{ form.title || '未填写标题' }}</h1><small>{{ form.category }} · {{ form.audience }}</small><p v-if="form.intro">{{ form.intro }}</p><section v-for="(step, i) in form.steps" :key="step.key"><h3>{{ i + 1 }}. {{ step.title }}</h3><img v-if="step.image" :src="imageUrls[step.image] || step.image" alt="步骤截图"><p>{{ step.text }}</p></section></article></el-dialog>
  <TutorialImageEditor ref="imageEditor" :saving="uploading" :saving-progress="uploadProgress" @apply="useImage" />
  <TutorialShare ref="share" />
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { callFunction } from '@/utils/cloud'
import { uploadTutorialImage } from '@/utils/tutorialUpload'
import TutorialImageEditor from './TutorialImageEditor.vue'
import TutorialShare from './TutorialShare.vue'
const emit = defineEmits(['saved'])
const categories = ['通用操作','照片与图片','球员资料','球队管理','报名与上传','账号与绑定','比赛与数据']
const visible = ref(false), preview = ref(false), busy = ref(false), uploading = ref(false), id = ref(''), revision = ref(0), published = ref(false), source = ref(''), imageUrls = ref({})
const form = reactive({ title: '', category: '通用操作', audience: '通用', intro: '', steps: [] })
const uploadProgress = ref(0)
const activeIndex = ref(0), imageEditor = ref(null), share = ref(null)
const activeStep = computed(() => form.steps[activeIndex.value])
let original = '', editingKey = '', edits = new Map()
function addStep() { if(form.steps.length >= 30)return; form.steps.push({ key: crypto.randomUUID(), title: '', text: '', image: '' }); activeIndex.value = form.steps.length-1 }
function open(row = null, urls = {}, feedback = '') {
  edits.clear(); activeIndex.value = 0
  id.value = row?._id || ''; revision.value = row?.revision || 0; published.value = !!row?.isPublished; source.value = feedback; imageUrls.value = { ...urls }
  Object.assign(form, row?.draft ? JSON.parse(JSON.stringify(row.draft)) : { title: '', category: '通用操作', audience: '通用', intro: '', steps: [] })
  form.steps.forEach(s => { s.key = crypto.randomUUID() }); if (!form.steps.length) addStep()
  original = JSON.stringify(form); visible.value = true
}
async function close(done) {
  if (busy.value || uploading.value) return
  if (JSON.stringify(form) !== original) { try { await ElMessageBox.confirm('未保存的内容将丢失', '关闭教程', { confirmButtonText: '关闭', cancelButtonText: '继续编辑', type: 'warning' }) } catch { return } }
  visible.value = false; edits.clear(); if (typeof done === 'function') done()
}
function move(i, offset) { const [step] = form.steps.splice(i, 1); form.steps.splice(i + offset, 0, step); activeIndex.value = i+offset }
async function removeStep() { if(!activeStep.value)return;try{await ElMessageBox.confirm('删除第'+(activeIndex.value+1)+'步？','删除步骤',{confirmButtonText:'删除',cancelButtonText:'取消',type:'warning'})}catch{return};edits.delete(activeStep.value.key);form.steps.splice(activeIndex.value,1);activeIndex.value=Math.max(0,Math.min(activeIndex.value,form.steps.length-1));if(!form.steps.length)addStep() }
const previousMasks = () => activeIndex.value > 0 ? edits.get(form.steps[activeIndex.value-1].key)?.masks || [] : []
function chooseImage(e) { const f=e.target.files?.[0];e.target.value='';if(f)readImage(f) }
function dropImage(e) { const f=e.dataTransfer?.files?.[0];if(f)readImage(f) }
function pasteImage(e) {
  if(!visible.value || busy.value || uploading.value)return
  const item=[...(e.clipboardData?.items || [])].find(i=>i.type.startsWith('image/'))
  const file=item?.getAsFile() || [...(e.clipboardData?.files || [])].find(f=>f.type.startsWith('image/'))
  if(!file)return
  e.preventDefault();e.stopPropagation();readImage(file)
}
async function readImage(file) {
  if(busy.value || uploading.value || !activeStep.value)return
  if(!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size>12*1024*1024)return ElMessage.warning('请选择12MB以内的PNG、JPG或WebP截图')
  const key=activeStep.value.key
  try{const source=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('截图读取失败，请重新选择'));r.readAsDataURL(file)});if(!form.steps.some(s=>s.key===key))return;editingKey=key;imageEditor.value.open({source,previousMasks:previousMasks()})}catch(e){ElMessage.error(e.message)}
}
function editImage() { if(!activeStep.value?.image)return;editingKey=activeStep.value.key;const saved=edits.get(editingKey);imageEditor.value.open({source:saved?.source || imageUrls.value[activeStep.value.image] || activeStep.value.image,shapes:saved?.shapes || [],previousMasks:previousMasks()}) }
async function useImage(result) {
  const step=form.steps.find(s=>s.key===editingKey);if(!step || uploading.value)return;uploading.value=true
  try{const r=await uploadTutorialImage(result.file,p=>{uploadProgress.value=p});if(!r.fileId || !r.tempUrl)throw new Error('图片上传结果不完整，请重试');step.image=r.fileId;imageUrls.value[r.fileId]=r.tempUrl;edits.set(step.key,{source:result.source,shapes:result.shapes,masks:result.masks});imageEditor.value.saved();ElMessage.success('处理后图片已上传')}catch(e){imageEditor.value.uploadFailed(e.message);ElMessage.error(e.message)}finally{uploading.value=false}
}
function contentPayload() { return {title:form.title,category:form.category,audience:form.audience,intro:form.intro,steps:form.steps.map((s,i)=>({title:s.title.trim() || '第'+(i+1)+'步',text:s.text,image:s.image}))} }
async function save(mode) {
  if (busy.value || uploading.value) return
  if (!form.title.trim()) return ElMessage.warning('请填写教程标题')
  if (mode === 'publish') {
    if (!form.steps.length || form.steps.some(s => !s.text.trim())) { activeIndex.value = Math.max(0,form.steps.findIndex(s=>!s.text.trim())); return ElMessage.warning('请填写每一步的描述') }
    try { await ElMessageBox.confirm('发布后客户可通过链接阅读，请确认截图不含个人信息。', '发布教程', { confirmButtonText: '发布', cancelButtonText: '继续编辑' }) } catch { return }
  }
  busy.value = true
  try {
    const result = await callFunction('manageTournamentCenterContent', { action: 'tutorialSave', id: id.value, revision: revision.value, mode, content: contentPayload() })
    if (!result?.success) throw new Error(result?.error || '保存失败，请重试')
    visible.value = false; preview.value = false; ElMessage.success(mode === 'publish' ? '教程已发布' : '草稿已保存'); emit('saved', { id: result.id, title: form.title, published: mode === 'publish' }); edits.clear(); if(mode === 'publish') share.value.open({id:result.id,...contentPayload()})
  } catch (e) { ElMessage.error(e.message) } finally { busy.value = false }
}
defineExpose({ open })
</script>
<style scoped>
.basics{display:grid;grid-template-columns:2fr 1fr 1fr;gap:16px}.basics .el-select{width:100%}@media(max-width:760px){.basics{grid-template-columns:1fr 1fr;gap:0 12px}.basics>.el-form-item:first-child{grid-column:1/-1}}.source{padding:10px;background:#f5f7f6;color:#59665e;white-space:pre-wrap;overflow-wrap:anywhere}.fields{display:grid;grid-template-columns:1fr 1fr;gap:16px}.fields .el-select{width:100%}.step{border-top:1px solid #e5e9e6;padding:16px 0}.step-head{display:flex;justify-content:space-between;margin-bottom:12px}.image-row{display:flex;align-items:center;gap:16px;flex-wrap:wrap}.el-image{width:120px;height:140px;background:#f5f7f6}.upload{color:#176b43;cursor:pointer}.upload input{max-width:180px;display:block;font-size:12px;margin-bottom:6px}.article{overflow-wrap:anywhere}.article p{white-space:pre-wrap;line-height:1.8}.article h1{font-size:23px}.article small{color:#6b776e}.article img{max-width:100%;height:auto}.article section{margin-top:28px}@media(max-width:600px){.fields{grid-template-columns:1fr}}
.step-builder{display:grid;grid-template-columns:200px minmax(0,1fr);border-block:1px solid #e3e9e5;min-height:390px}.step-directory{min-width:0;padding:16px 14px 16px 0;border-right:1px solid #e3e9e5;max-height:510px;overflow:auto}.step-directory>button:not(.add-step){display:flex;align-items:flex-start;gap:9px;background:transparent;border:0;width:100%;padding:12px 8px;text-align:left;cursor:pointer;color:#38473d}.step-directory>button.active{background:#edf6f0;color:#176b43}.step-number{font-size:14px;font-weight:700;min-width:20px}.step-summary{display:flex;flex-direction:column;min-width:0;gap:7px}.step-summary strong{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.step-summary small{font-size:11px;color:#7a887e;line-height:1.6}.add-step{width:100%;margin-top:10px}.active-step{padding:16px 0 16px 20px;min-width:0}.step-content{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px}.picture-preview{height:255px;background:#f4f7f5;border:1px dashed #c8d6cd;display:flex;align-items:center;justify-content:center;overflow:hidden}.picture-preview:focus-visible{outline:2px solid #176b43;outline-offset:2px}.picture-preview .el-image{width:100%;height:100%}.upload-empty{display:flex;flex-direction:column;gap:10px;text-align:center;color:#7b8b80;font-size:12px}.upload-empty strong{font-size:14px;color:#586d5f;font-weight:500}.picture-actions{display:flex;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap}.picture-actions .el-button{margin-left:0}.upload-button{position:relative;color:#176b43;border:1px solid #b9cfc1;border-radius:4px;padding:8px 12px;font-size:13px;cursor:pointer}.upload-button input{position:absolute;width:1px;height:1px;opacity:0}.upload-button:focus-within{outline:2px solid #176b43}.image-hint{display:block;color:#7a887e;font-size:11px;margin-top:10px}.step-paging{display:flex;justify-content:space-between;align-items:center;margin-top:24px;padding-top:14px;border-top:1px solid #edf0ee;color:#6d7c72;font-size:12px}@media(max-width:760px){.step-builder{grid-template-columns:minmax(0,1fr)}.step-directory{border-right:0;border-bottom:1px solid #e3e9e5;display:flex;gap:6px;max-height:100px;padding:10px 0}.step-directory>button:not(.add-step){min-width:160px;width:160px}.add-step{width:auto;flex-shrink:0;margin:0}.active-step{padding:16px 0}}@media(max-width:560px){.step-content{grid-template-columns:1fr}.picture-preview{height:240px}}
</style>
