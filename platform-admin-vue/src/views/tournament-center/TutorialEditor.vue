<template>
  <el-dialog v-model="visible" :title="id ? '编辑教程' : '新建教程'" width="min(780px, 96vw)" :close-on-click-modal="false" :before-close="close">
    <p v-if="source" class="source">来源反馈（不公开）：{{ source }}</p>
    <el-form label-position="top" :disabled="busy || uploading">
      <el-form-item label="标题" required><el-input v-model="form.title" maxlength="80" show-word-limit /></el-form-item>
      <div class="fields">
        <el-form-item label="分类"><el-select v-model="form.category" filterable allow-create><el-option v-for="v in categories" :key="v" :label="v" :value="v" /></el-select></el-form-item>
        <el-form-item label="适用端口"><el-select v-model="form.audience"><el-option v-for="v in ['通用','球队小程序','足球世界小程序','服务号H5','主办方PC']" :key="v" :label="v" :value="v" /></el-select></el-form-item>
      </div>
      <el-form-item label="适用条件"><el-input v-model="form.intro" type="textarea" :rows="2" maxlength="500" placeholder="仅填写必要的前提或限制" /></el-form-item>
      <section v-for="(step, i) in form.steps" :key="step.key" class="step">
        <div class="step-head"><strong>步骤 {{ i + 1 }}</strong><span><el-button link :disabled="i === 0" @click="move(i, -1)">上移</el-button><el-button link :disabled="i === form.steps.length - 1" @click="move(i, 1)">下移</el-button><el-button link type="danger" @click="form.steps.splice(i, 1)">删除</el-button></span></div>
        <el-form-item label="步骤标题"><el-input v-model="step.title" maxlength="80" /></el-form-item>
        <el-form-item label="操作说明"><el-input v-model="step.text" type="textarea" :rows="3" maxlength="3000" show-word-limit /></el-form-item>
        <div class="image-row">
          <el-image v-if="step.image" :src="imageUrls[step.image] || step.image" fit="contain" :preview-src-list="[imageUrls[step.image] || step.image]"><template #error>图片暂不可用，请重新上传</template></el-image>
          <label class="upload"><input type="file" accept="image/png,image/jpeg,image/webp" :disabled="busy || uploading" @change="upload($event, step)">{{ uploading ? '上传中…' : step.image ? '更换截图' : '上传截图' }}</label>
          <el-button v-if="step.image" link type="danger" @click="step.image = ''">移除图片</el-button>
        </div>
      </section>
      <el-button :disabled="form.steps.length >= 30" @click="addStep">添加步骤</el-button>
    </el-form>
    <el-alert v-if="published" title="保存草稿不会改变客户正在阅读的已发布版本" type="info" :closable="false" style="margin-top:16px" />
    <template #footer><el-button :disabled="busy || uploading" @click="close()">取消</el-button><el-button :disabled="busy || uploading" @click="preview = true">预览</el-button><el-button :loading="busy" :disabled="uploading" @click="save('draft')">保存草稿</el-button><el-button type="primary" :loading="busy" :disabled="uploading" @click="save('publish')">发布教程</el-button></template>
  </el-dialog>
  <el-dialog v-model="preview" title="教程预览" width="min(480px, 96vw)"><article class="article"><h1>{{ form.title || '未填写标题' }}</h1><small>{{ form.category }} · {{ form.audience }}</small><p v-if="form.intro">{{ form.intro }}</p><section v-for="(step, i) in form.steps" :key="step.key"><h3>{{ i + 1 }}. {{ step.title }}</h3><p>{{ step.text }}</p><img v-if="step.image" :src="imageUrls[step.image] || step.image" alt="步骤截图"></section></article></el-dialog>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { callFunction, uploadImageViaWebApi } from '@/utils/cloud'
const emit = defineEmits(['saved'])
const categories = ['通用操作','照片与图片','球员资料','球队管理','报名与上传','账号与绑定','比赛与数据']
const visible = ref(false), preview = ref(false), busy = ref(false), uploading = ref(false), id = ref(''), revision = ref(0), published = ref(false), source = ref(''), imageUrls = ref({})
const form = reactive({ title: '', category: '通用操作', audience: '通用', intro: '', steps: [] })
let original = ''
function addStep() { form.steps.push({ key: crypto.randomUUID(), title: '', text: '', image: '' }) }
function open(row = null, urls = {}, feedback = '') {
  id.value = row?._id || ''; revision.value = row?.revision || 0; published.value = !!row?.isPublished; source.value = feedback; imageUrls.value = { ...urls }
  Object.assign(form, row?.draft ? JSON.parse(JSON.stringify(row.draft)) : { title: '', category: '通用操作', audience: '通用', intro: '', steps: [] })
  form.steps.forEach(s => { s.key = crypto.randomUUID() }); if (!form.steps.length) addStep()
  original = JSON.stringify(form); visible.value = true
}
async function close(done) {
  if (busy.value || uploading.value) return
  if (JSON.stringify(form) !== original) { try { await ElMessageBox.confirm('未保存的内容将丢失', '关闭教程', { confirmButtonText: '关闭', cancelButtonText: '继续编辑', type: 'warning' }) } catch { return } }
  visible.value = false; if (typeof done === 'function') done()
}
function move(i, offset) { const [step] = form.steps.splice(i, 1); form.steps.splice(i + offset, 0, step) }
async function upload(event, step) {
  const file = event.target.files?.[0]; event.target.value = ''; if (!file) return
  if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) return ElMessage.warning('请上传2MB以内的PNG、JPG或WebP图片')
  uploading.value = true
  try { const r = await uploadImageViaWebApi('tutorial-images', file); if (!r.fileId || !r.tempUrl) throw new Error('图片上传结果不完整，请重试'); step.image = r.fileId; imageUrls.value[r.fileId] = r.tempUrl } catch (e) { ElMessage.error(e.message) } finally { uploading.value = false }
}
async function save(mode) {
  if (busy.value || uploading.value) return
  if (!form.title.trim()) return ElMessage.warning('请填写教程标题')
  if (mode === 'publish') {
    if (!form.steps.length || form.steps.some(s => !s.title.trim() || !s.text.trim())) return ElMessage.warning('请补全每一步的标题和说明')
    try { await ElMessageBox.confirm('发布后客户可通过链接阅读，请确认截图不含个人信息。', '发布教程', { confirmButtonText: '发布', cancelButtonText: '继续编辑' }) } catch { return }
  }
  busy.value = true
  try {
    const result = await callFunction('manageTournamentCenterContent', { action: 'tutorialSave', id: id.value, revision: revision.value, mode, content: { ...form, steps: form.steps.map(({ key, ...s }) => s) } })
    if (!result?.success) throw new Error(result?.error || '保存失败，请重试')
    visible.value = false; preview.value = false; ElMessage.success(mode === 'publish' ? '教程已发布' : '草稿已保存'); emit('saved', { id: result.id, title: form.title, published: mode === 'publish' })
  } catch (e) { ElMessage.error(e.message) } finally { busy.value = false }
}
defineExpose({ open })
</script>
<style scoped>
.source{padding:10px;background:#f5f7f6;color:#59665e;white-space:pre-wrap;overflow-wrap:anywhere}.fields{display:grid;grid-template-columns:1fr 1fr;gap:16px}.fields .el-select{width:100%}.step{border-top:1px solid #e5e9e6;padding:16px 0}.step-head{display:flex;justify-content:space-between;margin-bottom:12px}.image-row{display:flex;align-items:center;gap:16px;flex-wrap:wrap}.el-image{width:120px;height:140px;background:#f5f7f6}.upload{color:#176b43;cursor:pointer}.upload input{max-width:180px;display:block;font-size:12px;margin-bottom:6px}.article{overflow-wrap:anywhere}.article p{white-space:pre-wrap;line-height:1.8}.article h1{font-size:23px}.article small{color:#6b776e}.article img{max-width:100%;height:auto}.article section{margin-top:28px}@media(max-width:600px){.fields{grid-template-columns:1fr}}
</style>
