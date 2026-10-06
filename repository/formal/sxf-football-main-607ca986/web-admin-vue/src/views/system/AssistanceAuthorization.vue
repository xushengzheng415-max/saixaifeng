<template>
  <div class="assistance-page">
    <section class="hero-card">
      <div>

        <h1>远程协助授权</h1>

      </div>
      <span class="shield">✓</span>
    </section>

    <section class="flow-card">
      <div><strong>1</strong><span>输入客服发送的8位协助码</span></div>
      <i></i>
      <div><strong>2</strong><span>核对原因、时长和权限</span></div>
      <i></i>
      <div><strong>3</strong><span>本人确认后授权生效</span></div>
    </section>

    <div class="content-grid">
      <section class="panel code-panel">
        <div class="panel-head"><div><h2>输入协助码</h2><p>协助码10分钟内有效，且只能使用一次</p></div><span>PC 主入口</span></div>
        <div class="code-entry">
          <input v-model="code" inputmode="numeric" maxlength="8" placeholder="请输入8位数字" @input="normalizeCode" @keyup.enter="previewCode" />
          <button type="button" :disabled="previewLoading || code.length !== 8" @click="previewCode">{{ previewLoading ? '正在核对…' : '核对申请' }}</button>
        </div>
        <p class="safe-tip">请只使用赛小蜂官方客服发送的协助码，不要把协助码转发给其他人。</p>

        <div v-if="preview" class="preview-card">
          <div class="preview-title"><span>✓</span><div><h3>请确认本次协助申请</h3></div></div>
          <dl>
            <div><dt>协助人员</dt><dd>{{ preview.helperName }}</dd></div>
            <div><dt>协助原因</dt><dd>{{ preview.reason }}</dd></div>
            <div><dt>授权时长</dt><dd>{{ durationText(preview.durationHours) }}</dd></div>
            <div><dt>权限范围</dt><dd>查看、添加和修改；不允许删除</dd></div>
            <div><dt>协助码截止</dt><dd>{{ formatTime(preview.codeExpiresAt) }}</dd></div>
          </dl>
          <div class="warning">授权后，工作人员只能在有效期和已确认范围内操作；您可以随时撤销。</div>
          <div class="preview-actions"><button class="reject" type="button" :disabled="actionLoading" @click="rejectCode">拒绝</button><button class="accept" type="button" :disabled="actionLoading" @click="acceptCode">{{ actionLoading ? '正在处理…' : '同意协助' }}</button></div>
        </div>
      </section>

      <section class="panel records-panel">
        <div class="panel-head"><div><h2>我的协助记录</h2></div><button class="refresh" type="button" @click="loadGrants">刷新</button></div>
        <div v-if="loading" class="state-line">正在同步协助记录…</div>
        <div v-else-if="!grants.length" class="empty-state"><span>盾</span><strong>暂无协助记录</strong><p>您尚未同意任何远程协助</p></div>
        <div v-else class="grant-list">
          <article v-for="grant in grants" :key="grant._id">
            <div><strong>{{ grant.helperName }}</strong><span :class="{ active: grant.status === 'active' }">{{ grant.statusLabel }}</span></div>
            <p>{{ grant.reason }}</p>
            <small>{{ grant.status === 'active' ? '权限截止：' + formatTime(grant.grantExpiresAt) : '该授权已结束' }}</small>
            <button v-if="grant.status === 'active'" type="button" @click="revokeGrant(grant)">立即撤销权限</button>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { callFunction } from '@/utils/cloud'

const route = useRoute()
const code = ref('')
const preview = ref(null)
const grants = ref([])
const loading = ref(false)
const previewLoading = ref(false)
const actionLoading = ref(false)

async function requestService(action, payload = {}) {
  const result = await callFunction('platformOwner', { action, ...payload })
  if (!result || !result.success) throw new Error(result && (result.error || result.message) || '协助服务调用失败')
  return result
}
function normalizeCode() {
  code.value = String(code.value || '').replace(/\D/g, '').slice(0, 8)
  preview.value = null
}
function formatTime(value) {
  if (!value) return '—'
  const raw = value && typeof value === 'object' && value.$date ? value.$date : value
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { hour12: false })
}
function durationText(hours) {
  return Number(hours) === 168 ? '7天' : String(Number(hours) || 2) + '小时'
}
async function previewCode() {
  if (!/^\d{8}$/.test(code.value)) { ElMessage.warning('请输入8位数字协助码'); return }
  previewLoading.value = true
  preview.value = null
  try {
    const result = await requestService('previewCode', { code: code.value })
    preview.value = result.request || null
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    previewLoading.value = false
  }
}
async function acceptCode() {
  if (!preview.value) return
  try {
    await ElMessageBox.confirm('同意后，赛小蜂工作人员可在有效期内查看、添加和修改您创建的资料，但不能删除。', '确认临时协助', { confirmButtonText: '同意协助', cancelButtonText: '再核对一下', type: 'warning' })
    actionLoading.value = true
    const result = await requestService('acceptCode', { code: code.value })
    ElMessage.success(result.message || '协助授权已生效')
    code.value = ''
    preview.value = null
    await loadGrants()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message)
  } finally {
    actionLoading.value = false
  }
}
async function rejectCode() {
  if (!preview.value) return
  try {
    await ElMessageBox.confirm('拒绝后，该协助码将立即失效。', '拒绝本次协助', { confirmButtonText: '确认拒绝', cancelButtonText: '取消', type: 'warning' })
    actionLoading.value = true
    await requestService('rejectCode', { code: code.value })
    ElMessage.success('已拒绝本次协助')
    code.value = ''
    preview.value = null
    await loadGrants()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message)
  } finally {
    actionLoading.value = false
  }
}
async function loadGrants() {
  loading.value = true
  try {
    const result = await requestService('listMyGrants')
    grants.value = result.requests || []
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    loading.value = false
  }
}
async function revokeGrant(grant) {
  try {
    await ElMessageBox.confirm('撤销后，工作人员将立即无法继续查看或修改您的资料。', '立即撤销协助', { confirmButtonText: '立即撤销', cancelButtonText: '取消', type: 'warning' })
    await requestService('revokeMyGrant', { requestId: grant._id })
    ElMessage.success('协助权限已撤销')
    await loadGrants()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message)
  }
}
onMounted(async () => {
  document.title = '远程协助授权 - 赛小蜂足球'
  code.value = String(route.query.code || '').replace(/\D/g, '').slice(0, 8)
  await loadGrants()
  if (code.value.length === 8) await previewCode()
})
</script>

<style scoped>
.assistance-page{min-height:calc(100vh - 96px);padding:30px;background:#f4f7f5;box-sizing:border-box}.hero-card{display:flex;align-items:center;justify-content:space-between;min-height:174px;padding:34px 42px;color:#fff;border-radius:18px;background:linear-gradient(120deg,#0b4b30,#13794a);box-sizing:border-box;box-shadow:0 14px 34px rgba(13,91,54,.15)}.eyebrow{color:#86e3ae;font-size:12px;font-weight:700}.hero-card h1{margin:12px 0 9px;font-size:31px}.hero-card p{margin:0;color:rgba(255,255,255,.68);font-size:14px}.shield{width:72px;height:72px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.26);border-radius:22px;background:rgba(255,255,255,.1);font-size:34px}.flow-card{display:grid;grid-template-columns:1fr 60px 1fr 60px 1fr;align-items:center;margin-top:16px;padding:17px 24px;border:1px solid #dfe7e2;border-radius:14px;background:#fff}.flow-card div{display:flex;align-items:center;gap:11px;color:#526158;font-size:12px}.flow-card strong{width:28px;height:28px;display:grid;place-items:center;color:#147044;border-radius:9px;background:#e9f6ef;font-size:11px}.flow-card i{height:1px;background:#dfe7e2}.content-grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(330px,.8fr);gap:16px;margin-top:16px}.panel{border:1px solid #dfe7e2;border-radius:15px;background:#fff;box-shadow:0 5px 20px rgba(28,68,43,.04)}.panel-head{display:flex;align-items:center;justify-content:space-between;padding:20px 22px;border-bottom:1px solid #e9eeeb}.panel-head h2{margin:0;font-size:17px}.panel-head p{margin:5px 0 0;color:#87938b;font-size:11px}.panel-head>span{padding:5px 9px;color:#157145;border-radius:999px;background:#eaf7f0;font-size:10px}.code-entry{display:flex;gap:10px;padding:26px 26px 10px}.code-entry input{min-width:0;flex:1;height:52px;padding:0 16px;border:1px solid #cfdad3;border-radius:10px;outline:0;font-size:22px;font-weight:700;letter-spacing:.22em}.code-entry input:focus{border-color:#218151;box-shadow:0 0 0 3px rgba(33,129,81,.1)}.code-entry button{width:132px;color:#fff;border:0;border-radius:10px;background:#177847;font-weight:700;cursor:pointer}.code-entry button:disabled{opacity:.45;cursor:not-allowed}.safe-tip{margin:0;padding:0 26px 24px;color:#8d958f;font-size:11px}.preview-card{margin:0 26px 26px;padding:20px;border:1px solid #cfe1d6;border-radius:12px;background:#f7fbf8}.preview-title{display:flex;align-items:center;gap:11px}.preview-title>span{width:34px;height:34px;display:grid;place-items:center;color:#fff;border-radius:10px;background:#18814c}.preview-title h3{margin:0;font-size:15px}.preview-title p{margin:4px 0 0;color:#859189;font-size:10px}.preview-card dl{margin:17px 0 0}.preview-card dl div{display:grid;grid-template-columns:90px 1fr;gap:12px;padding:10px 0;border-bottom:1px solid #e3ebe6}.preview-card dt{color:#7e8a82;font-size:11px}.preview-card dd{margin:0;color:#26382d;font-size:12px;text-align:right}.warning{margin-top:15px;padding:11px;color:#96651f;border-radius:8px;background:#fff7e9;font-size:11px}.preview-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}.preview-actions button{height:38px;padding:0 21px;border-radius:9px;cursor:pointer}.reject{color:#56645b;border:1px solid #ccd7d0;background:#fff}.accept{color:#fff;border:1px solid #177847;background:#177847}.refresh{color:#177847;border:0;background:transparent;cursor:pointer}.state-line,.empty-state{min-height:250px;display:grid;place-content:center;justify-items:center;color:#859088;font-size:12px}.empty-state span{width:58px;height:58px;display:grid;place-items:center;margin-bottom:12px;color:#31865a;border-radius:18px;background:#eaf6ef}.empty-state strong{color:#3e5045;font-size:13px}.empty-state p{margin:6px 0 0}.grant-list{padding:10px 18px 18px}.grant-list article{padding:15px 4px;border-bottom:1px solid #edf1ee}.grant-list article>div{display:flex;align-items:center;justify-content:space-between}.grant-list article span{padding:3px 7px;color:#7f8983;border-radius:999px;background:#f0f3f1;font-size:10px}.grant-list article span.active{color:#147044;background:#e7f6ed}.grant-list article p{margin:9px 0;color:#435149;font-size:12px}.grant-list article small{color:#87918b;font-size:10px}.grant-list article button{float:right;color:#c3453d;border:0;background:transparent;font-size:11px;cursor:pointer}@media(max-width:900px){.assistance-page{padding:16px}.hero-card{padding:26px}.shield{display:none}.flow-card{grid-template-columns:1fr;gap:9px}.flow-card i{display:none}.content-grid{grid-template-columns:1fr}.code-entry{flex-direction:column}.code-entry button{width:100%;height:46px}}
</style>
