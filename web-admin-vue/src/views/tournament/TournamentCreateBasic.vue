<template>
  <section class="create-page" aria-labelledby="create-title">
    <div class="create-breadcrumb"><button type="button" @click="requestBack">赛事空间</button><span>/</span><strong>创建赛事</strong></div>
    <header class="create-heading">
      <h1 id="create-title">创建赛事</h1>
      <p>先完成赛事基础资料，创建后再配置竞赛组别、赛制、球队、抽签与赛程。</p>
    </header>
    <el-alert class="create-tip" type="success" :closable="false" show-icon title="这里只创建赛事级基础信息，不在此页设置竞赛组别和比赛规则。" />

    <div class="create-layout">
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="basic-form">
        <section class="form-card">
          <h2>赛事基本信息</h2>
          <div class="form-grid">
            <el-form-item label="赛事名称" prop="name" required><el-input v-model="form.name" maxlength="50" show-word-limit placeholder="请输入赛事名称" /></el-form-item>
            <el-form-item label="赛事简称"><el-input v-model="form.shortName" maxlength="20" placeholder="用于赛事卡片和通知展示" /></el-form-item>
            <el-form-item class="logo-form-item" label="赛事 Logo">
              <button class="logo-select" type="button" @click="logoDialogVisible = true">
                <img v-if="logoPreview" class="crest-image" :src="logoPreview" alt="赛事队徽预览" />
                <span v-else class="crest-placeholder"><el-icon><Trophy /></el-icon></span>
                <span><strong>{{ logoPreview ? '更换赛事 Logo' : '上传赛事 Logo' }}</strong><small>建议使用正方形 PNG；可裁剪并生成透明图层</small></span>
              </button>
            </el-form-item>
            <el-form-item label="赛事类别" prop="category" required>
              <el-select v-model="form.category" placeholder="请选择赛事类别"><el-option label="青少年足球赛事" value="youth" /><el-option label="成人足球赛事" value="adult" /><el-option label="校园足球赛事" value="campus" /></el-select>
            </el-form-item>
          </div>
        </section>

        <section class="form-card">
          <h2>举办信息</h2>
          <div class="form-grid">
            <el-form-item label="举办地区" prop="region" required><el-input v-model="form.region" placeholder="例如：河南省郑州市" /></el-form-item>
            <el-form-item label="赛事日期" prop="dateRange" required><el-date-picker v-model="form.dateRange" type="daterange" value-format="YYYY-MM-DD" range-separator="—" start-placeholder="开始日期" end-placeholder="结束日期" /></el-form-item>
            <el-form-item class="wide" label="主办单位" prop="organizerName" required><el-input v-model="form.organizerName" placeholder="请输入主办单位名称" /></el-form-item>
            <el-form-item label="赛事联系人" prop="contactName" required><el-input v-model="form.contactName" placeholder="请输入联系人姓名" /></el-form-item>
            <el-form-item label="联系电话" prop="contactPhone" required><el-input v-model="form.contactPhone" inputmode="tel" maxlength="20" placeholder="请输入联系电话" /></el-form-item>
          </div>
        </section>
      </el-form>

      <aside class="preview-panel">
        <h2>赛事预览</h2>
        <div class="preview-card">
          <img v-if="logoPreview" class="preview-crest" :src="logoPreview" alt="赛事 Logo" />
          <span v-else class="preview-mark"><el-icon><Trophy /></el-icon></span>
          <h3>{{ form.name || '赛事名称' }}</h3>
          <span class="preview-status">筹备中</span>
          <p><el-icon><Location /></el-icon>{{ form.region || '举办地区' }}</p>
          <p><el-icon><Calendar /></el-icon>{{ previewDate }}</p>
        </div>
        <div class="next-steps"><h3>创建后下一步</h3><ol><li>创建竞赛组别</li><li>确认球队加入</li><li>配置抽签与赛程</li></ol></div>
      </aside>
    </div>

    <footer class="create-actions">
      <span><el-icon><InfoFilled /></el-icon>所有信息创建后仍可在赛事设置中修改。</span>
      <div><el-button @click="requestBack">返回赛事空间</el-button><el-button :loading="savingDraft" @click="saveDraft">保存草稿</el-button><el-button type="primary" :loading="creating" @click="createAndEnter">创建赛事并进入主控制台</el-button></div>
    </footer>

    <el-dialog v-model="logoDialogVisible" title="上传赛事 Logo" width="620px" :close-on-click-modal="false" destroy-on-close>
      <RemoveBgProcessor type="tournamentLogo" @success="handleLogoReady" />
      <template #footer><el-button @click="logoDialogVisible = false">取消</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Calendar, InfoFilled, Location, Trophy } from '@element-plus/icons-vue'
import { addRecord, updateRecord, uploadFileViaCloud } from '../../utils/cloud'
import RemoveBgProcessor from '../../components/common/RemoveBgProcessor.vue'

const router = useRouter()
const formRef = ref(null)
const savingDraft = ref(false)
const creating = ref(false)
const logoDialogVisible = ref(false)
const logoPreview = ref('')
const pendingSourceFile = ref(null)
const draftId = ref('')
const isVisualQa = import.meta.env.DEV && (window.location.href.includes('visualQa=1') || localStorage.getItem('sxfVisualQa') === '1')

const form = ref(isVisualQa
  ? { name: '2026河南青少年足球冠军联赛', shortName: '河南青少年冠军联赛', category: 'youth', region: '河南省', dateRange: ['2026-07-20', '2026-08-18'], organizerName: '河南青少年体育联合会', contactName: '许老师', contactPhone: '138****2468', logoSourceUrl: '', logoTransparentUrl: '', logoTransparentFileId: '' }
  : { name: '', shortName: '', category: 'youth', region: '', dateRange: [], organizerName: '', contactName: '', contactPhone: '', logoSourceUrl: '', logoTransparentUrl: '', logoTransparentFileId: '' })
const rules = {
  name: [{ required: true, message: '请输入赛事名称', trigger: 'blur' }],
  category: [{ required: true, message: '请选择赛事类别', trigger: 'change' }],
  region: [{ required: true, message: '请输入举办地区', trigger: 'blur' }],
  dateRange: [{ type: 'array', required: true, min: 2, message: '请选择赛事日期', trigger: 'change' }],
  organizerName: [{ required: true, message: '请输入主办单位', trigger: 'blur' }],
  contactName: [{ required: true, message: '请输入赛事联系人', trigger: 'blur' }],
  contactPhone: [{ required: true, message: '请输入联系电话', trigger: 'blur' }]
}
const previewDate = computed(() => form.value.dateRange.length === 2 ? `${form.value.dateRange[0]} — ${form.value.dateRange[1]}` : '赛事日期')

function currentOrgId() {
  if (isVisualQa) return 'qa-org'
  try { const user = JSON.parse(localStorage.getItem('userInfo') || '{}'); return user.orgId || user.organizationId || '' } catch { return '' }
}

function handleLogoReady(asset) {
  logoPreview.value = asset.previewUrl || asset.url
  pendingSourceFile.value = asset.sourceFile || null
  form.value.logoTransparentUrl = asset.url || ''
  form.value.logoTransparentFileId = asset.fileID || ''
  logoDialogVisible.value = false
}

async function ensureSourceLogo() {
  if (!pendingSourceFile.value || form.value.logoSourceUrl) return
  const extension = pendingSourceFile.value.name.split('.').pop() || 'png'
  const result = await uploadFileViaCloud(`tournament-logo-source/${Date.now()}.${extension}`, pendingSourceFile.value)
  form.value.logoSourceUrl = result.tempUrl || result.fileId || ''
}

async function validateForm() {
  if (!currentOrgId()) { ElMessage.error('未识别到当前机构，请重新登录后再创建赛事'); return false }
  try { await formRef.value.validate(); return true } catch { return false }
}

function payload(status) {
  const [startDate, endDate] = form.value.dateRange
  return { name: form.value.name.trim(), shortName: form.value.shortName.trim(), category: form.value.category, region: form.value.region.trim(), location: form.value.region.trim(), startDate, endDate, organizerName: form.value.organizerName.trim(), contactName: form.value.contactName.trim(), contactPhone: form.value.contactPhone.trim(), logo: form.value.logoTransparentUrl, logoTransparentUrl: form.value.logoTransparentUrl, logoTransparentFileId: form.value.logoTransparentFileId, logoSourceUrl: form.value.logoSourceUrl, status, createFlowVersion: 'space-basic-v1' }
}

async function writeTournament(status) {
  await ensureSourceLogo()
  const data = payload(status)
  if (draftId.value) { await updateRecord('tournaments', draftId.value, data); return draftId.value }
  const result = await addRecord('tournaments', data)
  const id = result._id || result.id || result.data?._id
  if (!id) throw new Error('赛事已保存但未返回赛事标识，请刷新赛事空间确认')
  draftId.value = id
  return id
}

async function saveDraft() {
  savingDraft.value = true
  try { const id = await writeTournament('draft'); ElMessage.success('赛事草稿已保存'); return id } catch (error) { ElMessage.error(`保存草稿失败：${error.message || '请稍后重试'}`) } finally { savingDraft.value = false }
}

async function createAndEnter() {
  if (!await validateForm()) return
  creating.value = true
  try { const id = await writeTournament('draft'); ElMessage.success('赛事已创建'); router.push(`/tournaments/${id}`) } catch (error) { ElMessage.error(`创建赛事失败：${error.message || '请稍后重试'}`) } finally { creating.value = false }
}

async function requestBack() {
  const changed = form.value.name || form.value.region || form.value.dateRange.length || form.value.logoTransparentUrl
  if (changed && !draftId.value) { try { await ElMessageBox.confirm('当前填写的信息尚未保存，确定返回赛事空间吗？', '确认返回', { confirmButtonText: '返回', cancelButtonText: '继续填写', type: 'warning' }) } catch { return } }
  router.push('/tournament-space')
}
</script>

<style scoped>
.create-page { width:min(calc(100% - 116px),1470px); margin:0 auto; padding:24px 0 118px; }.create-breadcrumb { display:flex; gap:10px; color:#66736c; font-size:14px; }.create-breadcrumb button { padding:0; border:0; color:#52645a; background:transparent; cursor:pointer; }.create-breadcrumb button:hover { color:#087d47; }.create-heading { margin:22px 0 14px; }.create-heading h1 { margin:0; color:#151c18; font-size:30px; line-height:1.25; }.create-heading p { margin:7px 0 0; color:#4f5e55; font-size:14px; }.create-tip { height:47px; margin-bottom:10px; border:1px solid #acd7bb; border-radius:8px; background:#f0faf3; }.create-layout { display:grid; grid-template-columns:minmax(0,1050px) 374px; gap:20px; align-items:stretch; }.basic-form,.preview-panel { border:1px solid #dfe5e1; border-radius:10px; background:#fff; box-shadow:0 3px 12px rgba(16,52,32,.06); }.basic-form { overflow:hidden; }.form-card { padding:22px 28px 0; border:0; background:#fff; box-shadow:none; }.form-card + .form-card { padding-top:2px; padding-bottom:14px; }.form-card h2,.preview-panel>h2 { margin:0 0 20px; color:#1d3024; font-size:18px; }.form-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 48px; }.wide { grid-column:1 / -1; }.basic-form :deep(.el-form-item) { margin-bottom:18px; }.basic-form :deep(.el-input__wrapper),.basic-form :deep(.el-select__wrapper),.basic-form :deep(.el-date-editor) { min-height:44px; }.basic-form :deep(.el-select),.basic-form :deep(.el-date-editor) { width:100%; }.logo-form-item :deep(.el-form-item__content) { min-height:84px; }.logo-select { display:flex; width:100%; min-height:88px; align-items:center; gap:18px; padding:12px 24px; border:1px dashed #cbd4ce; border-radius:7px; color:#376047; text-align:left; background:#fff; cursor:pointer; }.logo-select:hover { border-color:#159153; background:#f7fcf8; }.crest-image,.crest-placeholder { width:64px; height:64px; flex:0 0 64px; object-fit:contain; }.crest-placeholder { display:grid; place-items:center; color:#aab1ad; font-size:34px; background:transparent; }.logo-select strong,.logo-select small { display:block; }.logo-select strong { color:#078344; font-size:14px; }.logo-select small { margin-top:5px; color:#7d8982; font-size:12px; }.preview-panel { padding:23px 26px; }.preview-card { padding:28px 28px 20px; border:1px solid #e2e7e4; border-radius:9px; text-align:center; background:#fff; }.preview-crest,.preview-mark { width:92px; height:92px; margin:auto; object-fit:contain; }.preview-mark { display:grid; place-items:center; color:#b0b8b3; font-size:48px; background:transparent; }.preview-card h3 { margin:17px 0 9px; color:#1d2c23; font-size:18px; line-height:1.4; }.preview-status { display:inline-block; padding:4px 8px; border-radius:4px; color:#1687df; font-size:12px; background:#e9f5ff; }.preview-card p { display:flex; align-items:center; gap:7px; margin:13px 0 0; color:#56665d; font-size:13px; text-align:left; }.next-steps { margin-top:24px; padding-top:22px; border-top:1px solid #e3eae5; }.next-steps h3 { margin:0; color:#24392c; font-size:16px; }.next-steps ol { display:grid; gap:18px; margin:18px 0 0; padding:0; list-style:none; counter-reset:step; }.next-steps li { position:relative; display:flex; align-items:center; gap:11px; color:#46594d; font-size:14px; }.next-steps li::before { display:grid; width:28px; height:28px; place-items:center; border-radius:50%; color:#fff; font-weight:600; background:#09874b; counter-increment:step; content:counter(step); }.next-steps li:not(:last-child)::after { position:absolute; top:28px; left:13px; width:1px; height:18px; border-left:1px dashed #8dccaa; content:''; }.create-actions { position:fixed; right:0; bottom:0; left:0; z-index:10; display:flex; min-height:94px; align-items:center; justify-content:space-between; gap:20px; padding:17px 58px; border-top:1px solid #dfe5e1; background:rgba(255,255,255,.98); box-shadow:0 -4px 16px rgba(24,52,37,.06); }.create-actions>span { display:flex; align-items:center; gap:8px; color:#425249; }.create-actions>span .el-icon { color:#078545; font-size:24px; }.create-actions>div { display:flex; gap:16px; }.create-actions :deep(.el-button) { min-width:188px; min-height:50px; font-size:16px; }.create-actions :deep(.el-button--primary) { min-width:330px; border-color:#087d47; background:#087d47; }.create-actions :deep(.el-button--primary:hover) { border-color:#056a3a; background:#056a3a; }
@media (max-width:1180px) { .create-layout { grid-template-columns:1fr; }.preview-panel { display:none; } }
@media (max-width:780px) { .form-grid { grid-template-columns:1fr; }.wide { grid-column:auto; }.create-actions { align-items:flex-start; flex-direction:column; }.create-actions>div { width:100%; flex-wrap:wrap; }.create-actions :deep(.el-button) { flex:1; min-width:auto; } }
</style>
