<template>
  <div class="system-admin">
    <div class="page-card">
      <div class="page-header">
        <div>
          <h2>微信客服协助中心</h2>
          <p>通过微信客服私发协助码，用户本人确认后，临时进入其赛事、球队和球员资料。</p>
        </div>
        <el-button v-if="ownerStatus.isPlatformOwner" :loading="requestLoading" @click="refreshRequests">
          <el-icon><Refresh /></el-icon>
          刷新状态
        </el-button>
      </div>

      <el-skeleton v-if="ownerLoading" :rows="6" animated />

      <el-result
        v-else-if="!ownerStatus.isPlatformOwner"
        icon="warning"
        title="隐藏协助服务不可用"
        sub-title="该入口只对服务端已配置的平台所有者开放，不支持用户自行激活。"
      />

      <template v-else>
        <el-card class="admin-card service-card">
          <template #header>
            <div class="card-header">
              <div class="header-title">
                <h3>微信客服衔接流程</h3>
                <el-tag type="success">隐藏服务</el-tag>
              </div>
            </div>
          </template>
          <div class="service-flow">
            <div class="flow-step"><strong>1</strong><span>用户关注服务号并通过微信客服申请协助</span></div>
            <div class="flow-step"><strong>2</strong><span>总控生成一次性协助码和小程序码</span></div>
            <div class="flow-step"><strong>3</strong><span>客服私发给用户，由用户在小程序确认</span></div>
            <div class="flow-step"><strong>4</strong><span>授权生效后进入资料，全部修改保留操作记录</span></div>
          </div>
          <el-alert
            title="关注服务号只是服务入口，资料权限必须由用户本人在小程序中再次确认。"
            type="info"
            :closable="false"
            show-icon
          />
        </el-card>

        <el-card class="admin-card">
          <template #header>
            <div class="card-header">
              <h3>发起一次协助</h3>
            </div>
          </template>
          <el-form class="request-form" label-position="top">
            <el-form-item label="协助原因">
              <el-input
                v-model="requestForm.reason"
                maxlength="120"
                show-word-limit
                placeholder="例如：协助导入球队报名资料并排查图片上传问题"
              />
            </el-form-item>
            <el-form-item label="授权有效期">
              <el-select v-model="requestForm.durationHours" style="width: 220px;">
                <el-option label="2小时（推荐）" :value="2" />
                <el-option label="24小时" :value="24" />
                <el-option label="7天" :value="168" />
              </el-select>
            </el-form-item>
            <el-alert
              title="权限范围：查看、添加、修改；删除功能始终关闭。"
              type="warning"
              :closable="false"
              show-icon
            />
            <el-button type="primary" size="large" :loading="creating" @click="createAssistanceRequest">
              生成微信客服协助码
            </el-button>
          </el-form>
        </el-card>

        <el-card v-if="createdRequest" class="admin-card code-card">
          <template #header>
            <div class="card-header">
              <div class="header-title">
                <h3>发送给微信客服用户</h3>
                <el-tag type="warning">10分钟内有效</el-tag>
              </div>
            </div>
          </template>
          <div class="code-layout">
            <div class="code-main">
              <span class="code-label">8位协助码</span>
              <strong class="assist-code">{{ createdRequest.code }}</strong>
              <div class="code-actions">
                <el-button type="primary" @click="copyCustomerServiceMessage">
                  <el-icon><CopyDocument /></el-icon>
                  复制客服话术
                </el-button>
                <el-button @click="copyAssistCode">只复制协助码</el-button>
              </div>
              <div class="message-preview">
                <span>微信客服发送内容</span>
                <p>{{ customerServiceMessage }}</p>
              </div>
            </div>
            <div class="qr-panel">
              <div v-if="qrLoading" class="qr-placeholder">正在生成小程序码…</div>
              <img v-else-if="createdRequest.qrCodeUrl" :src="createdRequest.qrCodeUrl" alt="协助确认小程序码" />
              <div v-else class="qr-placeholder">小程序码生成失败，可发送数字码</div>
              <small>客服可发送此图，用户扫码后直接进入隐藏确认页</small>
            </div>
          </div>
        </el-card>

        <el-card class="admin-card">
          <template #header>
            <div class="card-header">
              <h3>最近协助申请</h3>
              <span class="muted">网页每15秒自动检查一次用户确认状态</span>
            </div>
          </template>
          <el-empty v-if="!requestLoading && requests.length === 0" description="尚未发起协助" />
          <el-table v-else :data="requests" v-loading="requestLoading" style="width: 100%;">
            <el-table-column label="用户" min-width="150">
              <template #default="{ row }">
                <strong>{{ row.targetName || '等待用户确认' }}</strong>
                <small class="table-sub">{{ row.targetPhoneMasked || `尾号 ${row.codeLast4}` }}</small>
              </template>
            </el-table-column>
            <el-table-column prop="reason" label="协助原因" min-width="240" show-overflow-tooltip />
            <el-table-column label="状态" width="130">
              <template #default="{ row }">
                <el-tag :type="statusType(row.status)">{{ row.statusLabel }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="授权期限" width="180">
              <template #default="{ row }">
                <span>{{ row.status === 'active' ? formatTime(row.grantExpiresAt) : `${row.durationHours}小时` }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="210" fixed="right">
              <template #default="{ row }">
                <el-button v-if="row.status === 'active'" type="primary" link @click="openAssistance(row)">
                  进入协助
                </el-button>
                <el-button v-if="canRevoke(row)" type="danger" link @click="revokeRequest(row)">
                  撤销
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <el-card v-if="activeRequestId" class="admin-card overview-card">
          <template #header>
            <div class="card-header">
              <div class="header-title">
                <h3>正在协助：{{ activeTargetName }}</h3>
                <el-tag type="success">用户已授权</el-tag>
              </div>
              <el-button type="danger" plain @click="exitAssistance">退出协助模式</el-button>
            </div>
          </template>
          <el-alert
            :title="`临时权限截止 ${activeExpiresLabel}；删除功能已关闭。`"
            type="success"
            :closable="false"
            show-icon
          />
          <div class="totals-grid">
            <div class="total-item"><strong>{{ overview.totals.teamCount || 0 }}</strong><span>球队</span></div>
            <div class="total-item"><strong>{{ overview.totals.playerCount || 0 }}</strong><span>球员</span></div>
            <div class="total-item"><strong>{{ overview.totals.tournamentCount || 0 }}</strong><span>赛事</span></div>
            <div class="total-item"><strong>{{ overview.totals.matchCount || 0 }}</strong><span>比赛</span></div>
          </div>
          <div v-for="account in overview.accounts" :key="account._id" class="resource-grid">
            <section class="resource-section">
              <div class="resource-heading"><h4>球队</h4><span>{{ account.teamCount }} 支</span></div>
              <el-empty v-if="account.teams.length === 0" description="该用户暂无球队" :image-size="60" />
              <button
                v-for="team in account.teams"
                :key="team._id"
                type="button"
                class="resource-row"
                @click="openTeam(team._id)"
              >
                <el-avatar :size="36" :src="team.logo">队</el-avatar>
                <span class="resource-name">{{ team.name }}</span>
                <span>{{ team.playerCount }} 名球员</span>
                <span class="resource-link">管理 →</span>
              </button>
            </section>
            <section class="resource-section">
              <div class="resource-heading"><h4>赛事</h4><span>{{ account.tournamentCount }} 项</span></div>
              <el-empty v-if="account.tournaments.length === 0" description="该用户暂无赛事" :image-size="60" />
              <button
                v-for="tournament in account.tournaments"
                :key="tournament._id"
                type="button"
                class="resource-row"
                @click="openTournament(tournament._id)"
              >
                <span class="resource-badge">赛</span>
                <span class="resource-name">{{ tournament.name }}</span>
                <span>{{ tournament.registeredTeams }} 支参赛队</span>
                <span class="resource-link">管理 →</span>
              </button>
            </section>
          </div>
        </el-card>

        <!-- 保留原有数据清理能力；进入用户协助模式时隐藏，避免误操作。 -->
        <el-card v-if="!activeRequestId" class="admin-card">
          <template #header><div class="card-header"><h3>数据清理</h3></div></template>
          <div class="cleanup-section">
            <p class="description">清理不再被任何球队引用的球员记录（孤儿记录）</p>
            <div class="actions">
              <el-button type="warning" :loading="scanning" @click="scanOrphanPlayers">
                <el-icon><Search /></el-icon>扫描冗余数据
              </el-button>
              <el-button v-if="orphanPlayers.length > 0" type="danger" :loading="deleting" @click="deleteOrphanPlayers">
                <el-icon><Delete /></el-icon>删除冗余数据 ({{ orphanPlayers.length }} 条)
              </el-button>
            </div>
            <div v-if="orphanPlayers.length > 0" class="scan-result">
              <el-alert :title="`找到 ${orphanPlayers.length} 条孤儿球员记录`" type="warning" :closable="false" show-icon />
              <el-table :data="orphanPlayers" style="width: 100%; margin-top: 16px;" max-height="400">
                <el-table-column prop="name" label="姓名" width="120" />
                <el-table-column prop="idCard" label="身份证号" width="180" />
                <el-table-column label="关联球队ID" width="200">
                  <template #default="{ row }">
                    <span v-if="row.teamId">{{ row.teamId }}</span>
                    <span v-else-if="row.teamCode">{{ row.teamCode }}</span>
                    <el-tag v-else type="danger" size="small">无关联</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="100">
                  <template #default="{ row }"><el-button type="primary" link size="small" @click="viewPlayer(row)">查看</el-button></template>
                </el-table-column>
              </el-table>
            </div>
            <div v-else-if="scanned" class="scan-result">
              <el-alert title="未找到孤儿球员记录" type="success" :closable="false" show-icon />
            </div>
          </div>
        </el-card>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CopyDocument, Delete, Refresh, Search } from '@element-plus/icons-vue'
import {
  callFunction,
  clearAssistanceContext,
  setAssistanceContext
} from '@/utils/cloud'

const router = useRouter()
const ownerLoading = ref(true)
const requestLoading = ref(false)
const creating = ref(false)
const qrLoading = ref(false)
const overviewLoading = ref(false)
const ownerStatus = ref({ isPlatformOwner: false, ownerExists: false })
const requestForm = ref({
  reason: '协助排查并处理赛小蜂足球使用问题',
  durationHours: 2
})
const createdRequest = ref(null)
const requests = ref([])
const activeRequestId = ref('')
const activeTargetName = ref('')
const activeExpiresAt = ref('')
const overview = ref({
  totals: { teamCount: 0, playerCount: 0, tournamentCount: 0, matchCount: 0 },
  accounts: []
})
const scanning = ref(false)
const deleting = ref(false)
const scanned = ref(false)
const orphanPlayers = ref([])
let pollTimer = null

const customerServiceMessage = computed(() => {
  if (!createdRequest.value) return ''
  return `您好，赛小蜂已为您创建临时协助申请。请打开客服发送的赛小蜂足球小程序确认页，输入8位协助码：${createdRequest.value.code}。协助码10分钟内有效；授权前可查看协助原因、权限和有效期，删除功能默认关闭。`
})

const activeExpiresLabel = computed(() => formatTime(activeExpiresAt.value))

async function requestPlatformOwner(action, payload = {}) {
  const result = await callFunction('platformOwner', { action, ...payload })
  if (!result || !result.success) throw new Error(result?.error || '隐藏协助服务调用失败')
  return result
}

function persistOwnerFlag() {
  try {
    const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}')
    userInfo.isPlatformOwner = true
    localStorage.setItem('userInfo', JSON.stringify(userInfo))
  } catch (err) {
    console.warn('保存平台所有者状态失败:', err)
  }
}

async function loadOwnerStatus() {
  ownerLoading.value = true
  try {
    const result = await requestPlatformOwner('status')
    ownerStatus.value = result
    if (result.isPlatformOwner) {
      persistOwnerFlag()
      await refreshRequests()
      startPolling()
    }
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    ownerLoading.value = false
  }
}

async function createAssistanceRequest() {
  if (!requestForm.value.reason.trim()) {
    ElMessage.warning('请填写本次协助原因')
    return
  }
  creating.value = true
  clearAssistanceContext()
  try {
    const result = await requestPlatformOwner('createRequest', requestForm.value)
    createdRequest.value = { ...result.request, qrCodeUrl: '' }
    qrLoading.value = true
    try {
      const qrResult = await callFunction('generateMiniProgramCode', {
        action: 'getQRCode',
        page: 'pages/admin/index',
        scene: `a=${result.request.code}`,
        width: 320,
        envVersion: 'release'
      })
      if (qrResult && qrResult.success && qrResult.data) {
        createdRequest.value.qrCodeUrl = qrResult.data.qrCodeUrl || ''
      }
    } catch (qrError) {
      console.warn('生成协助小程序码失败:', qrError)
    } finally {
      qrLoading.value = false
    }
    ElMessage.success('协助码已生成，请通过微信客服私发给用户')
    await refreshRequests()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    creating.value = false
  }
}

async function writeClipboard(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(successMessage)
  } catch (err) {
    ElMessage.error('复制失败，请手动选择文字复制')
  }
}

function copyCustomerServiceMessage() {
  writeClipboard(customerServiceMessage.value, '微信客服话术已复制')
}

function copyAssistCode() {
  if (createdRequest.value) writeClipboard(createdRequest.value.code, '协助码已复制')
}

async function refreshRequests() {
  if (!ownerStatus.value.isPlatformOwner) return
  requestLoading.value = true
  try {
    const result = await requestPlatformOwner('listRequests')
    requests.value = result.requests || []
    if (activeRequestId.value) {
      const active = requests.value.find(item => item._id === activeRequestId.value)
      if (!active || active.status !== 'active') exitAssistance(false)
    }
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    requestLoading.value = false
  }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = setInterval(() => refreshRequests(), 15000)
}

function statusType(status) {
  return { pending: 'warning', active: 'success', rejected: 'danger', revoked: 'info', expired: 'info' }[status] || 'info'
}

function canRevoke(request) {
  return request.status === 'pending' || request.status === 'active'
}

function formatTime(value) {
  if (!value) return '未知'
  const raw = value && typeof value === 'object' && value.$date ? value.$date : value
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return '未知'
  return date.toLocaleString('zh-CN', { hour12: false })
}

async function openAssistance(request) {
  overviewLoading.value = true
  try {
    const result = await requestPlatformOwner('overview', { requestId: request._id })
    const account = (result.accounts || [])[0]
    const grant = result.grant || request
    activeRequestId.value = request._id
    activeTargetName.value = (account && account.name) || request.targetName || '被协助用户'
    activeExpiresAt.value = grant.grantExpiresAt
    overview.value = {
      totals: result.totals || overview.value.totals,
      accounts: result.accounts || []
    }
    setAssistanceContext({
      requestId: request._id,
      targetUserId: grant.targetUserId || request.targetUserId,
      targetName: activeTargetName.value,
      targetOwnerKey: grant.targetUserId || request.targetUserId,
      expiresAt: grant.grantExpiresAt
    })
    ElMessage.success(`已进入 ${activeTargetName.value} 的临时协助空间`)
  } catch (err) {
    clearAssistanceContext()
    ElMessage.error(err.message)
  } finally {
    overviewLoading.value = false
  }
}

function exitAssistance(showMessage = true) {
  clearAssistanceContext()
  activeRequestId.value = ''
  activeTargetName.value = ''
  activeExpiresAt.value = ''
  overview.value = {
    totals: { teamCount: 0, playerCount: 0, tournamentCount: 0, matchCount: 0 },
    accounts: []
  }
  if (showMessage) ElMessage.success('已退出协助模式')
}

function openTeam(teamId) {
  router.push(`/teams/${teamId}`)
}

function openTournament(tournamentId) {
  router.push(`/tournaments/${tournamentId}`)
}

async function revokeRequest(request) {
  try {
    await ElMessageBox.confirm('撤销后，用户资料的临时访问权限会立即失效。确认继续吗？', '撤销协助', {
      type: 'warning', confirmButtonText: '确认撤销', cancelButtonText: '取消'
    })
    await requestPlatformOwner('revokeRequest', { requestId: request._id })
    if (activeRequestId.value === request._id) exitAssistance(false)
    ElMessage.success('协助权限已撤销')
    await refreshRequests()
  } catch (err) {
    if (err !== 'cancel') ElMessage.error(err.message || '撤销失败')
  }
}

async function scanOrphanPlayers() {
  scanning.value = true
  clearAssistanceContext()
  try {
    const res = await callFunction('cleanupOrphanPlayers', { dryRun: true })
    if (res && res.success) {
      orphanPlayers.value = res.orphanPlayers || []
      scanned.value = true
      if (orphanPlayers.value.length > 0) ElMessage.warning(`找到 ${orphanPlayers.value.length} 条孤儿球员记录`)
      else ElMessage.success('未找到孤儿球员记录')
    } else {
      ElMessage.error(res?.message || '扫描失败')
    }
  } catch (err) {
    ElMessage.error('扫描失败: ' + err.message)
  } finally {
    scanning.value = false
  }
}

async function deleteOrphanPlayers() {
  if (orphanPlayers.value.length === 0) return
  try {
    await ElMessageBox.confirm(`确定删除 ${orphanPlayers.value.length} 条孤儿球员记录吗？此操作不可恢复！`, '删除确认', { type: 'warning' })
    deleting.value = true
    clearAssistanceContext()
    const res = await callFunction('cleanupOrphanPlayers', { dryRun: false })
    if (res && res.success) {
      ElMessage.success(`成功删除 ${res.deletedCount} 条记录`)
      orphanPlayers.value = []
      scanned.value = true
    } else {
      ElMessage.error(res?.message || '删除失败')
    }
  } catch (err) {
    if (err !== 'cancel') ElMessage.error('删除失败: ' + err.message)
  } finally {
    deleting.value = false
  }
}

function viewPlayer() {
  ElMessage.info('球员详情功能开发中...')
}

onMounted(() => {
  clearAssistanceContext()
  loadOwnerStatus()
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<style scoped>
.system-admin { padding: 20px; }
.page-card { padding: 20px; border-radius: 8px; background: #fff; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1); }
.page-header, .card-header, .header-title { display: flex; align-items: center; }
.page-header, .card-header { justify-content: space-between; }
.page-header { margin-bottom: 20px; }
.page-header h2, .card-header h3, .resource-heading h4 { margin: 0; }
.page-header p { margin: 8px 0 0; color: #606266; }
.header-title { gap: 10px; }
.admin-card { margin-bottom: 20px; }
.service-card { border-top: 3px solid #2e7d32; }
.service-flow { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }
.flow-step { display: flex; gap: 10px; align-items: flex-start; padding: 15px; border-radius: 10px; background: #f4f9f5; color: #455a64; }
.flow-step strong { display: inline-flex; flex: 0 0 26px; align-items: center; justify-content: center; height: 26px; border-radius: 50%; background: #2e7d32; color: #fff; }
.request-form { max-width: 760px; }
.request-form > .el-button { margin-top: 20px; }
.code-card { border-left: 4px solid #43a047; }
.code-layout { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 28px; }
.code-main { display: flex; flex-direction: column; align-items: flex-start; }
.code-label, .muted, .table-sub { color: #909399; font-size: 12px; }
.assist-code { margin: 6px 0 16px; color: #1b5e20; font-size: 46px; letter-spacing: 10px; }
.code-actions { display: flex; gap: 10px; }
.message-preview { width: 100%; margin-top: 22px; padding: 16px; box-sizing: border-box; border-radius: 10px; background: #f5f7fa; }
.message-preview span { color: #606266; font-weight: 600; }
.message-preview p { margin: 8px 0 0; color: #606266; line-height: 1.7; }
.qr-panel { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; }
.qr-panel img, .qr-placeholder { width: 240px; height: 240px; border-radius: 8px; }
.qr-placeholder { display: flex; align-items: center; justify-content: center; box-sizing: border-box; padding: 20px; background: #f5f7fa; color: #909399; }
.qr-panel small { color: #909399; line-height: 1.5; }
.table-sub { display: block; margin-top: 4px; }
.overview-card { border-top: 3px solid #43a047; }
.totals-grid { display: grid; grid-template-columns: repeat(4, minmax(110px, 1fr)); gap: 12px; margin: 20px 0; }
.total-item { display: flex; flex-direction: column; align-items: center; padding: 18px 12px; border-radius: 10px; background: #f1f8f2; }
.total-item strong { color: #1b5e20; font-size: 28px; }
.total-item span { margin-top: 5px; color: #606266; font-size: 13px; }
.resource-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
.resource-section { overflow: hidden; min-width: 0; border: 1px solid #ebeef5; border-radius: 8px; }
.resource-heading { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; background: #fafafa; }
.resource-heading span { color: #909399; font-size: 12px; }
.resource-row { display: grid; grid-template-columns: 36px minmax(100px, 1fr) auto auto; align-items: center; width: 100%; gap: 10px; padding: 11px 14px; border: 0; border-bottom: 1px solid #f0f2f5; background: #fff; color: #606266; cursor: pointer; text-align: left; }
.resource-row:hover { background: #f5fbf6; }
.resource-name { overflow: hidden; color: #303133; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.resource-badge { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 50%; background: #e8f5e9; color: #2e7d32; font-weight: 700; }
.resource-link { color: #2e7d32; white-space: nowrap; }
.cleanup-section { padding: 10px 0; }
.description { margin-bottom: 20px; color: #606266; }
.actions { display: flex; gap: 12px; }
.scan-result { margin-top: 20px; }
@media (max-width: 1000px) {
  .service-flow, .totals-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .resource-grid, .code-layout { grid-template-columns: 1fr; }
  .qr-panel { align-items: flex-start; text-align: left; }
}
</style>
