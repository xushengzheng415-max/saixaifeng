<template>
  <main class="staff-page">
    <header><div class="header-title"><el-button v-if="isOwner" link @click="router.push('/tournament-space')">← 返回赛事空间</el-button><h1>账号管理</h1></div><div class="header-actions"><a class="guide-link" :href="guideUrl" target="_blank" rel="noopener">共享授权说明</a><el-button v-if="isOwner" type="primary" @click="openInvite">分发账号</el-button></div></header>
    <el-alert v-if="error" type="error" :title="error" show-icon :closable="false"><el-button link @click="load">重试</el-button></el-alert>
    <div v-if="loading" class="state">加载中…</div>
    <template v-else>
      <el-alert v-if="invitations.length" class="invitation-notice" type="info" :closable="false" title="共享赛事邀请待你确认；接受后只可使用已授权赛事和模块。" />
      <section v-if="invitations.length"><h2>待接受邀请</h2><div v-for="invite in invitations" :key="invite.id" class="line"><span><strong>{{ invite.tournamentName || invite.tournamentId }}</strong><small>{{ rightLabels(invite.permissions) }}</small></span><el-button type="primary" plain @click="accept(invite)">接受邀请</el-button></div></section>
      <template v-if="isOwner">
        <section><h2>已分发账号</h2><div v-if="!managed.length" class="state">尚未分发账号</div><div v-for="grant in managed" :key="grant.id" class="line"><span><strong>{{ grant.name || grant.phone }} · {{ grant.tournamentName || grant.tournamentId }}</strong><small>{{ grant.phone }}　{{ rightLabels(grant.permissions) }}　{{ statusLabel(grant.status) }}</small></span><div><el-button link @click="openEdit(grant)">{{ grant.status === 'disabled' ? '重新启用' : '修改' }}</el-button><el-button v-if="grant.status !== 'disabled'" link type="danger" @click="disable(grant)">停用</el-button></div></div></section>
      </template>
      <section v-else><h2>可管理赛事</h2><div v-if="!mine.length && !invitations.length" class="state">暂无授权赛事。若主办方已分发账号，请确认邀请手机号与当前登录账号一致。</div><div v-for="grant in mine" :key="grant.id" class="line"><span><strong>{{ grant.tournamentName || grant.tournamentId }}</strong><small>{{ rightLabels(grant.permissions) }}</small></span><el-button @click="go(grant)">进入赛事</el-button></div></section>
    </template>
    <el-dialog v-model="dialog" :title="editing ? '修改权限' : '分发账号'" width="540px" :close-on-click-modal="false">
      <el-form label-position="top"><el-form-item v-if="!editing" label="赛事"><el-select v-model="form.tournamentId" class="full"><el-option v-for="event in tournaments" :key="event.id" :value="event.id" :label="event.name" /></el-select></el-form-item><el-form-item v-if="!editing" label="手机号"><el-input v-model.trim="form.phone" maxlength="11" /></el-form-item><el-form-item v-if="!editing" label="姓名"><el-input v-model.trim="form.name" maxlength="40" /></el-form-item><el-form-item label="权限"><div class="rights-select"><el-checkbox :model-value="allSelected" :indeterminate="partlySelected" @change="toggleAll">全部权限</el-checkbox><el-checkbox-group v-model="form.permissions" class="rights-grid"><el-checkbox v-for="right in sidebarRights" :key="right.key" :label="right.key">{{ right.label }}</el-checkbox></el-checkbox-group></div></el-form-item><p v-if="!editing" class="share-notice">权限只限所选赛事。受邀者须使用填写的手机号登录并接受邀请。<a class="guide-link" :href="guideUrl" target="_blank" rel="noopener">查看/打印说明</a></p><p v-if="legacyExpansion" class="legacy-warning">保存后，原有补录或新闻编辑权限将扩大为对应模块的全部操作。</p></el-form>
      <template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" :loading="saving" @click="submit">保存</el-button></template>
    </el-dialog>
  </main>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { callFunction } from '@/utils/cloud'
import { TOURNAMENT_SIDEBAR_RIGHTS, TOURNAMENT_SIDEBAR_KEYS, visibleSidebarKeys } from '@/utils/tournamentStaffRights'

const router = useRouter()
const guideUrl = `${import.meta.env.BASE_URL}guides/shared-tournament-access.html`
const isOwner = ref(false), loading = ref(true), saving = ref(false), error = ref(''), dialog = ref(false), editing = ref('')
const managed = ref([]), mine = ref([]), invitations = ref([]), tournaments = ref([])
const form = reactive({ tournamentId: '', phone: '', name: '', permissions: [] })
const editingGrant = ref(null)
const sidebarRights = TOURNAMENT_SIDEBAR_RIGHTS
const allSelected = computed(() => TOURNAMENT_SIDEBAR_KEYS.every(key => form.permissions.includes(key)))
const partlySelected = computed(() => form.permissions.length > 0 && !allSelected.value)
const rightLabels = rights => sidebarRights.filter(item => visibleSidebarKeys(rights).has(item.key)).map(item => item.label).join('、')
function toggleAll(checked) { form.permissions = checked ? [...TOURNAMENT_SIDEBAR_KEYS] : [] }
const statusLabel = status => ({ pending: '待接受', active: '有效', disabled: '已停用' })[status] || status
async function request(action, data = {}) {
  const result = await callFunction('tournamentStaffAccess', { action, ...data })
  if (!result?.success) throw new Error(result?.message || result?.error || '请求失败')
  return result
}
async function load() {
  loading.value = true; error.value = ''
  try {
    const [own, pending, management] = await Promise.all([request('mine'), request('invitations'), request('managed').catch(() => null)])
    mine.value = own.grants || []; invitations.value = pending.invitations || []
    isOwner.value = Boolean(management); managed.value = management?.grants || []; tournaments.value = management?.tournaments || []
  } catch (cause) { error.value = cause.message || '加载失败' }
  finally { loading.value = false }
}
function openInvite() { editing.value = ''; editingGrant.value = null; Object.assign(form, { tournamentId: tournaments.value[0]?.id || '', phone: '', name: '', permissions: [] }); dialog.value = true }
function openEdit(grant) { editing.value = grant.id; editingGrant.value = grant; Object.assign(form, { tournamentId: grant.tournamentId, phone: grant.phone, name: grant.name, permissions: TOURNAMENT_SIDEBAR_KEYS.filter(key => visibleSidebarKeys(grant.permissions).has(key)) }); dialog.value = true }
const legacyExpansion = computed(() => Boolean(editingGrant.value && (
  editingGrant.value.permissions?.includes('result.supplement') && form.permissions.includes('event.results') ||
  editingGrant.value.permissions?.includes('news.edit') && !editingGrant.value.permissions?.includes('news.publish') && form.permissions.includes('event.news')
)))
async function submit() {
  if (!editing.value && (!form.tournamentId || !/^1[3-9]\d{9}$/.test(form.phone))) return ElMessage.error('请选择赛事并填写正确手机号')
  if (!form.permissions.length) return ElMessage.error('请选择权限')
  saving.value = true
  try {
    if (legacyExpansion.value) await ElMessageBox.confirm('保存后，原有权限将扩大为对应模块的全部操作。确认修改？', '扩大权限', { type:'warning' })
    await request(editing.value ? 'update' : 'invite', editing.value ? { grantId: editing.value, permissions: form.permissions } : { tournamentId: form.tournamentId, phone: form.phone, name: form.name, permissions: form.permissions }); dialog.value = false; ElMessage.success(editing.value ? '权限已更新' : '邀请已创建'); await load()
  } catch (cause) { if (cause !== 'cancel' && cause !== 'close') ElMessage.error(cause.message) } finally { saving.value = false }
}
async function accept(invite) { try { await request('accept', { grantId: invite.id }); ElMessage.success('邀请已接受'); await load() } catch (cause) { ElMessage.error(cause.message) } }
async function disable(grant) { try { await ElMessageBox.confirm('停用后，该账号将立即失去本赛事权限。', '停用授权', { type: 'warning' }); await request('disable', { grantId: grant.id }); ElMessage.success('已停用'); await load() } catch (cause) { if (cause !== 'cancel' && cause !== 'close') ElMessage.error(cause.message) } }
async function go(grant) {
  const first = sidebarRights.find(item => visibleSidebarKeys(grant.permissions).has(item.key))
  if (!first) return ElMessage.error('当前赛事没有可进入的模块')
  try { await request('activate', { grantId: grant.id }); await router.push(`/tournaments/${encodeURIComponent(grant.tournamentId)}${first.suffix}`) }
  catch (cause) { ElMessage.error(cause.message || '切换赛事失败') }
}
onMounted(load)
</script>

<style scoped>
.staff-page{max-width:1060px;margin:0 auto;padding:28px;color:#203027}.staff-page header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #dfe7e1;padding-bottom:18px}.header-title{display:flex;align-items:center;gap:18px}.staff-page h1{font-size:24px;margin:0}.header-actions{display:flex;align-items:center;gap:14px}.guide-link{color:#087d42;font-size:14px;text-decoration:none}.guide-link:hover{text-decoration:underline}.invitation-notice{margin-top:18px}.share-notice{margin:0;color:#59675f;font-size:13px}.staff-page section{margin-top:28px}.staff-page h2{font-size:17px;margin:0 0 8px}.line{display:flex;align-items:center;justify-content:space-between;gap:14px;min-height:74px;border-bottom:1px solid #e6ece7}.line span{display:grid;gap:5px}.line small{color:#6c7b70}.state{padding:30px 0;color:#748078}.full{width:100%}.line :deep(.el-button),.staff-page :deep(.el-button){display:inline-flex;align-items:center;justify-content:center}@media(max-width:720px){.staff-page{padding:18px}.staff-page header{align-items:flex-start;gap:12px}.header-title{flex-wrap:wrap;gap:6px}.header-actions{flex-wrap:wrap;justify-content:flex-end}.line{align-items:flex-start;flex-direction:column;padding:12px 0}}
.rights-select{display:grid;gap:8px;width:100%}.rights-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px 12px;padding-top:8px;border-top:1px solid #e6ece7}.rights-grid :deep(.el-checkbox){margin-right:0}.rights-grid :deep(.el-checkbox__label){white-space:normal}@media(max-width:520px){.rights-grid{grid-template-columns:1fr}}
.legacy-warning{margin:0;color:#9a6400;font-size:12px}
</style>
