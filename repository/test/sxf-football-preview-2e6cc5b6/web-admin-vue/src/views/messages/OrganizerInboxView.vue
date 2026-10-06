<template>
  <section class="inbox-page">
    <header class="inbox-heading">
      <div>
        <h2>站内信</h2>
        <small v-if="unreadCount">未读 {{ unreadCount }} 条</small>
      </div>
      <el-button :loading="loading" @click="loadMessages"><el-icon><Refresh /></el-icon>刷新</el-button>
    </header>
    <el-alert v-if="invitationLoadError" type="warning" :closable="false" title="赛事邀请暂时未能加载，请刷新重试" />

    <div v-if="loading && !messages.length && !invitations.length" class="inbox-loading">正在加载站内信…</div>
    <div v-else-if="messages.length || invitations.length" class="inbox-list" v-loading="loading">
      <article v-for="invite in invitations" :key="`invite-${invite.id}`" class="inbox-item unread invitation-item">
        <div class="inbox-item-heading">
          <div><h3>赛事账号邀请</h3><el-tag type="warning" size="small">待接受</el-tag></div>
        </div>
        <p class="inbox-preview">{{ invite.tournamentName || '赛事' }}：{{ permissionSummary(invite.permissions) }}</p>
        <footer><el-button type="primary" link @click="openInvitations">查看并处理</el-button></footer>
      </article>
      <article v-for="message in messages" :key="message._id" class="inbox-item" :class="{ unread: !message.readAt }">
        <div class="inbox-item-heading">
          <div><h3>{{ message.title }}</h3><el-tag v-if="!message.readAt" type="warning" size="small">未读</el-tag></div>
          <time>{{ formatTime(message.createTime) }}</time>
        </div>
        <p class="inbox-preview">{{ message.body }}</p>
        <footer>
          <el-button link type="primary" @click="openMessage(message)">查看</el-button>
        </footer>
      </article>
    </div>
    <el-empty v-else-if="loadError" description="加载失败，请重试" />
    <el-empty v-else description="暂无站内信" />
    <el-dialog v-model="detailVisible" :title="selectedMessage?.title || '站内信'" width="min(560px, 92vw)">
      <p class="inbox-body">{{ selectedMessage?.body }}</p>
      <template #footer><el-button @click="detailVisible=false">关闭</el-button><el-button v-if="selectedMessage?.linkPath" type="primary" @click="openLink(selectedMessage)">{{ selectedMessage.linkLabel || '查看' }}</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { callFunction } from '@/utils/cloud'
import { TOURNAMENT_SIDEBAR_RIGHTS, visibleSidebarKeys } from '@/utils/tournamentStaffRights'

const router = useRouter()
const loading = ref(false)
const loadError = ref(false)
const messages = ref([])
const invitations = ref([])
const invitationLoadError = ref(false)
const unreadCount = ref(0)
const detailVisible = ref(false)
const selectedMessage = ref(null)

function formatTime(value) {
  if (!value) return '时间待补充'
  const date = new Date(value?.$date || value)
  return Number.isNaN(date.getTime()) ? '时间待补充' : date.toLocaleString('zh-CN', { hour12: false })
}

function permissionSummary(permissions = []) {
  const visible = visibleSidebarKeys(permissions)
  return TOURNAMENT_SIDEBAR_RIGHTS.filter(right => visible.has(right.key)).map(right => right.label).join('、') || '权限待确认'
}

function openInvitations() {
  router.push('/tournament-staff')
}

async function loadMessages() {
  if (loading.value) return
  loading.value = true
  loadError.value = false
  try {
    const [result, invitationResult] = await Promise.all([
      callFunction('onboardingWorkspace', { action: 'organizerInboxList' }),
      callFunction('tournamentStaffAccess', { action: 'invitations' }).catch(() => null)
    ])
    if (!result?.success) throw new Error(result?.message || '站内信加载失败')
    messages.value = Array.isArray(result.data?.messages) ? result.data.messages : []
    invitations.value = Array.isArray(invitationResult?.invitations) ? invitationResult.invitations : []
    invitationLoadError.value = !invitationResult?.success
    unreadCount.value = Number(result.data?.unreadCount || 0) + invitations.value.length
  } catch (error) {
    loadError.value = true
    ElMessage.error(error.message || '站内信加载失败')
  } finally {
    loading.value = false
  }
}

async function markRead(message) {
  if (!message?._id || message.readAt) return true
  try {
    const result = await callFunction('onboardingWorkspace', {
      action: 'organizerInboxMarkRead',
      messageId: message._id
    })
    if (!result?.success) throw new Error(result?.message || result?.error || '标记已读失败')
    message.readAt = result.data?.readAt || new Date().toISOString()
    unreadCount.value = Math.max(0, unreadCount.value - 1)
    window.dispatchEvent(new Event('sxf-organizer-inbox-updated'))
    return true
  } catch (error) {
    ElMessage.error(error.message || '标记已读失败')
    return false
  }
}

async function openLink(message) {
  if (!await markRead(message)) return
  const path = String(message.linkPath || '')
  if (!/^\/tournament-space\?openContactInfo=(organization|profile)$/.test(path)) {
    ElMessage.error('通知链接无效，请联系平台管理员')
    return
  }
  await router.push(path)
}

async function openMessage(message) {
  if (!await markRead(message)) return
  selectedMessage.value = message
  detailVisible.value = true
}

onMounted(loadMessages)
</script>

<style scoped>
.inbox-page{max-width:980px;margin:0 auto;padding:24px 20px 40px}
.inbox-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}
.inbox-heading h2{margin:0;font-size:20px}
.inbox-heading small{display:block;margin-top:5px;color:#77847c;font-size:12px}
.inbox-list{border-top:1px solid #e4ebe6}
.inbox-loading{padding:32px 4px;color:#77847c;font-size:13px}
.inbox-item{padding:18px 4px;border-bottom:1px solid #e4ebe6}
.inbox-item.unread{background:#f8fcf9}
.inbox-item-heading{display:flex;align-items:center;justify-content:space-between;gap:16px}
.inbox-item-heading>div{display:flex;align-items:center;gap:10px;min-width:0}
.inbox-item h3{margin:0;font-size:15px}
.inbox-item time{flex:none;color:#829087;font-size:12px}
.inbox-item p{margin:10px 0 12px;color:#48564d;font-size:13px;line-height:1.7}
.inbox-preview{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.inbox-body{margin:0;color:#48564d;font-size:14px;line-height:1.8;white-space:pre-wrap;overflow-wrap:anywhere}
.inbox-item footer{display:flex;align-items:center;justify-content:flex-end;gap:14px}
@media(max-width:640px){.inbox-page{padding:18px 14px 30px}.inbox-item-heading{align-items:flex-start;flex-direction:column;gap:7px}.inbox-item footer{justify-content:flex-start}}
</style>
