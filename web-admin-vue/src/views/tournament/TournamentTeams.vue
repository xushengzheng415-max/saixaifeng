<template>
  <div class="tournament-teams" v-loading="loading">
    <!-- 页面头部 -->
    <el-page-header @back="$router.push(`/tournaments/${tournamentId}`)" title="返回赛事详情">
      <template #content>
        <span style="font-size: 18px;">参赛球队 - {{ tournament.name || '赛事' }}</span>
      </template>
    </el-page-header>

    <div class="page-content">
      <!-- 统计卡片 -->
      <div class="stats-bar">
        <div class="stat-card">
          <div class="stat-value">{{ approvedTeams.length }}</div>
          <div class="stat-label">已参赛</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ pendingTeams.length }}</div>
          <div class="stat-label">待确认</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ invitedTeams.length }}</div>
          <div class="stat-label">已邀请</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ cancelRequestedTeams.length }}</div>
          <div class="stat-label">撤销申请</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ availableSlots }}</div>
          <div class="stat-label">剩余名额</div>
        </div>
      </div>

      <!-- 操作栏 -->
      <div class="action-bar">
        <el-button type="primary" @click="openInviteDialog">
          <el-icon><Plus /></el-icon>邀请球队
        </el-button>
        <el-button @click="openQrDialog">
          <el-icon><Picture /></el-icon>生成报名二维码
        </el-button>
        <el-input
          v-model="searchKeyword"
          placeholder="搜索球队"
          style="width: 240px"
          clearable
          :prefix-icon="Search"
        />
      </div>

      <!-- 球队列表 -->
      <el-tabs v-model="activeTab">
        <el-tab-pane name="all">
          <template #label>
            <span>全部</span>
            <el-badge :value="tournamentTeams.length" class="tab-badge" />
          </template>
        </el-tab-pane>
        <el-tab-pane name="approved">
          <template #label>
            <span>已参赛</span>
            <el-badge :value="approvedTeams.length" type="success" class="tab-badge" />
          </template>
        </el-tab-pane>
        <el-tab-pane name="pending">
          <template #label>
            <span>待确认</span>
            <el-badge :value="pendingTeams.length" type="warning" class="tab-badge" />
          </template>
        </el-tab-pane>
        <el-tab-pane name="invited">
          <template #label>
            <span>已邀请</span>
            <el-badge :value="invitedTeams.length" type="info" class="tab-badge" />
          </template>
        </el-tab-pane>
        <el-tab-pane name="cancel_requested">
          <template #label>
            <span>撤销申请</span>
            <el-badge :value="cancelRequestedTeams.length" type="warning" class="tab-badge" />
          </template>
        </el-tab-pane>
      </el-tabs>

      <!-- 球队卡片列表 -->
      <div class="teams-grid">
        <div v-for="team in filteredTeams" :key="team.recordId || team._id" class="team-card" :class="{ 'team-invited': team.status === 'invited', 'team-cancel-requested': team.status === 'cancel_requested' }">
          <div class="team-header">
            <img
              v-if="team.logo || team.logoUrl"
              :src="team.logo || team.logoUrl"
              class="team-logo"
              @error="$event.target.style.display='none'; $event.target.nextElementSibling.style.display='flex'"
            />
            <div class="team-logo-placeholder" :style="(team.logo || team.logoUrl) ? 'display:none' : ''">
              {{ (team.name || team.teamName || '?')[0] }}
            </div>
            <div class="team-info">
              <h4>{{ team.name || team.teamName }}</h4>
              <el-tag :type="getStatusType(team.status)" size="small">
                {{ getStatusLabel(team.status) }}
              </el-tag>
            </div>
          </div>
          <div class="team-body">
            <div class="team-stat">
              <span>联系人</span>
              <em>{{ team.contactName || team.coachName || '-' }}</em>
            </div>
            <div class="team-stat">
              <span>电话</span>
              <em>{{ team.contactPhone || team.phone || '-' }}</em>
            </div>
            <div class="team-stat">
              <span>邀请时间</span>
              <em>{{ formatTime(team.createTime || team.inviteTime) }}</em>
            </div>
          </div>
          <div class="team-actions">
            <template v-if="team.status === 'invited'">
              <el-button type="danger" size="small" @click="cancelInvite(team)">取消邀请</el-button>
            </template>
            <template v-else-if="team.status === 'pending'">
              <el-button type="success" size="small" @click="approveTeam(team)">通过</el-button>
              <el-button type="danger" size="small" @click="rejectTeam(team)">拒绝</el-button>
            </template>
            <template v-else-if="team.status === 'approved'">
              <el-button type="danger" size="small" plain @click="removeTeam(team)">移除</el-button>
            </template>
            <template v-else-if="team.status === 'cancel_requested'">
              <el-button type="danger" size="small" @click="approveCancel(team)">同意撤销</el-button>
              <el-button size="small" @click="rejectCancel(team)">拒绝撤销</el-button>
            </template>
          </div>
        </div>

        <!-- 空状态 -->
        <el-empty v-if="filteredTeams.length === 0" description="暂无球队" />
      </div>
    </div>

    <!-- 邀请球队弹窗 -->
    <el-dialog
      v-model="showInviteDialog"
      title="邀请球队参赛"
      width="700px"
      destroy-on-close
      @closed="onInviteDialogClose"
    >
      <div class="invite-dialog">
        <!-- 顶部信息栏 -->
        <div class="invite-header">
          <div class="invite-info">
            <span class="info-item">
              <label>剩余名额:</label>
              <em :class="{ 'text-danger': availableSlots <= 0 }">{{ availableSlots }}</em>
            </span>
            <span class="info-item">
              <label>已选择:</label>
              <em>{{ selectedTeams.length }}</em>
            </span>
          </div>
          <el-input
            v-model="inviteSearchKeyword"
            placeholder="搜索球队名称"
            clearable
            :prefix-icon="Search"
            style="width: 240px"
          />
        </div>
        
        <el-alert
          v-if="availableSlots <= 0"
          title="参赛名额已满，无法邀请更多球队"
          type="warning"
          :closable="false"
          show-icon
          style="margin-bottom: 16px"
        />

        <el-alert
          v-else-if="selectedTeams.length > availableSlots"
          :title="`选择数量超过剩余名额，请减少 ${selectedTeams.length - availableSlots} 支球队`"
          type="error"
          :closable="false"
          show-icon
          style="margin-bottom: 16px"
        />

        <!-- 球队列表 -->
        <div class="available-teams" v-if="availableTeamsToInvite.length > 0">
          <div
            v-for="team in availableTeamsToInvite"
            :key="team._id"
            class="available-team-item"
            :class="{ 
              selected: selectedTeams.includes(team._id),
              disabled: availableSlots <= 0 && !selectedTeams.includes(team._id)
            }"
            @click="toggleSelectTeam(team._id)"
          >
            <el-checkbox 
              :model-value="selectedTeams.includes(team._id)" 
              :disabled="availableSlots <= 0 && !selectedTeams.includes(team._id)"
            />
            <img v-if="team.logo || team.logoUrl" :src="team.logo || team.logoUrl" class="team-thumb" />
            <div v-else class="team-thumb-placeholder">{{ (team.name || '?')[0] }}</div>
            <div class="team-info">
              <span class="team-name">{{ team.name }}</span>
              <span class="team-coach">
                <el-icon><User /></el-icon>
                教练: {{ team.coachName || '-' }}
                <span v-if="team.playerCount" class="player-count">
                  <el-icon><Football /></el-icon>
                  {{ team.playerCount }}人
                </span>
              </span>
            </div>
          </div>
        </div>

        <el-empty v-else description="没有可邀请的球队">
          <template #description>
            <p>没有可邀请的球队</p>
            <p style="font-size: 13px; color: #909399; margin-top: 8px;">所有球队已加入赛事或已被邀请</p>
          </template>
        </el-empty>
      </div>

      <template #footer>
        <div class="dialog-footer">
          <div class="footer-info">
            <span v-if="selectedTeams.length > 0" class="selected-preview">
              已选 {{ selectedTeams.length }} 支球队
              <el-tooltip v-if="selectedTeams.length > 3" :content="getSelectedTeamNames" placement="top">
                <el-icon><InfoFilled /></el-icon>
              </el-tooltip>
              <span v-else class="team-names">: {{ getSelectedTeamNames }}</span>
            </span>
          </div>
          <div class="footer-actions">
            <el-button @click="showInviteDialog = false">取消</el-button>
            <el-button
              type="primary"
              @click="sendInvites"
              :disabled="selectedTeams.length === 0 || selectedTeams.length > availableSlots"
              :loading="sendingInvites"
            >
              发送邀请
            </el-button>
          </div>
        </div>
      </template>
    </el-dialog>

    <!-- 报名二维码弹窗 -->
    <el-dialog
      v-model="showQrDialog"
      :title="qrDialogTitle"
      width="400px"
      destroy-on-close
    >
      <div class="qr-dialog">
        <div v-loading="qrLoading" class="qr-image-wrapper">
          <img v-if="qrCodeImage" :src="qrCodeImage" class="qr-image" alt="报名二维码" />
          <el-empty v-else-if="!qrLoading && !qrError" description="生成中..." />
          <div v-else-if="qrError" class="qr-error">
            <el-icon :size="40" color="#f56c6c"><CircleCloseFilled /></el-icon>
            <p class="error-text">二维码生成失败</p>
            <p class="error-detail">{{ qrError }}</p>
            <p class="error-hint">请手动复制下方小程序路径给教练</p>
          </div>
        </div>
        <div class="qr-tips" v-if="!qrError">
          <p>📱 使用微信扫码即可进入报名页</p>
          <p>✅ 教练提交报名后，您将在此页收到审核通知</p>
        </div>
        <div class="qr-actions">
          <el-button :disabled="!qrCodeImage" @click="downloadQRCode">
            下载二维码
          </el-button>
          <el-button type="primary" @click="copySignupLink">
            复制小程序路径
          </el-button>
        </div>
        <div class="qr-path">
          <span class="label">小程序路径：</span>
          <code class="path-code">pages/tournament/signup/signup?id={{ tournamentId }}</code>
        </div>
      </div>
    </el-dialog>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, User, InfoFilled, Picture, CircleCloseFilled } from '@element-plus/icons-vue'
import { queryById, queryList, addRecord, updateRecord, deleteRecord, callFunction } from '../../utils/cloud'

const route = useRoute()
const tournamentId = route.params.id

const loading = ref(false)
const tournament = ref({})
const tournamentTeams = ref([])
const allTeams = ref([])
const activeTab = ref('all')
const searchKeyword = ref('')
const showInviteDialog = ref(false)
const inviteSearchKeyword = ref('')
const selectedTeams = ref([])
const sendingInvites = ref(false)

// 报名二维码弹窗
const showQrDialog = ref(false)
const qrCodeImage = ref('')
const qrLoading = ref(false)
const qrError = ref('')

// 二维码弹窗标题
const qrDialogTitle = computed(() => `赛事报名二维码 - ${tournament.value.name || '赛事'}`)

// 状态标签
const statusLabels = {
  invited: '已邀请',
  pending: '待确认',
  approved: '已参赛',
  rejected: '已拒绝',
  cancel_requested: '撤销申请'
}

const statusTypes = {
  invited: 'info',
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancel_requested: 'warning'
}

// 计算属性
const approvedTeams = computed(() => tournamentTeams.value.filter(t => t.status === 'approved'))
const pendingTeams = computed(() => tournamentTeams.value.filter(t => t.status === 'pending'))
const invitedTeams = computed(() => tournamentTeams.value.filter(t => t.status === 'invited'))
const cancelRequestedTeams = computed(() => tournamentTeams.value.filter(t => t.status === 'cancel_requested'))

const availableSlots = computed(() => {
  // 如果没有设置maxTeams，默认允许邀请（不限制）
  const max = tournament.value.maxTeams
  if (!max || max <= 0) {
    return 999 // 返回一个大数字表示无限制
  }
  const current = approvedTeams.value.length
  const slots = Math.max(0, max - current)
  return slots
})

const filteredTeams = computed(() => {
  let list = tournamentTeams.value
  
  // 按标签筛选
  if (activeTab.value !== 'all') {
    list = list.filter(t => t.status === activeTab.value)
  }
  
  // 搜索筛选
  if (searchKeyword.value) {
    const kw = searchKeyword.value.toLowerCase()
    list = list.filter(t => 
      (t.name || t.teamName || '').toLowerCase().includes(kw) ||
      (t.contactName || t.coachName || '').toLowerCase().includes(kw)
    )
  }
  
  return list
})

// 已选球队名称预览
const getSelectedTeamNames = computed(() => {
  const names = selectedTeams.value.map(id => {
    const team = allTeams.value.find(t => t._id === id)
    return team?.name || '未知'
  })
  return names.join('、')
})

// 可邀请的球队列表
const availableTeamsToInvite = computed(() => {
  // 已关联赛事的球队ID（包括已邀请、待确认、已参赛、已拒绝）
  const invitedTeamIds = tournamentTeams.value.map(t => t.teamId).filter(Boolean)


  const available = allTeams.value
    .filter(team => team && team._id) // 确保球队数据有效
    .filter(team => !invitedTeamIds.includes(team._id))
    .filter(team => {
      if (!inviteSearchKeyword.value) return true
      return team.name && team.name.toLowerCase().includes(inviteSearchKeyword.value.toLowerCase())
    })

  return available
})

// 方法
function getStatusLabel(status) {
  return statusLabels[status] || status
}

function getStatusType(status) {
  return statusTypes[status] || 'info'
}

function formatTime(time) {
  if (!time) return '-'
  const d = new Date(time)
  return isNaN(d.getTime()) ? '-' : `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

function toggleSelectTeam(teamId) {
  const idx = selectedTeams.value.indexOf(teamId)
  if (idx > -1) {
    selectedTeams.value.splice(idx, 1)
  } else {
    selectedTeams.value.push(teamId)
  }
}

// 加载赛事信息
async function loadTournament() {
  try {
    tournament.value = await queryById('tournaments', tournamentId)
  } catch (err) {
    console.error('加载赛事失败:', err)
  }
}

// 加载已关联的球队
async function loadTournamentTeams() {
  loading.value = true
  try {
    const list = await queryList('tournament_teams', {
      where: { tournamentId },
      orderBy: { createTime: 'desc' }
    })
    
    // 获取球队详情
    const teamIds = list.map(t => t.teamId).filter(Boolean)
    if (teamIds.length > 0) {
      const teamsData = await queryList('teams', {
        where: { _id: { $in: teamIds } }
      })
      
      const teamMap = {}
      teamsData.forEach(t => {
        teamMap[t._id] = t
      })
      
      tournamentTeams.value = list.map(item => {
        const teamData = teamMap[item.teamId] || {}
        return {
          // 先放球队数据
          ...teamData,
          // 再放 tournament_teams 关联数据（避免 _id 被覆盖）
          recordId: item._id,
          recordStatus: item.status,
          recordCreateTime: item.createTime,
          recordUpdateTime: item.updateTime,
          teamId: item.teamId,
          tournamentId: item.tournamentId,
          teamName: item.teamName || teamData.name,
          status: item.status,
          createTime: item.createTime,
          inviteTime: item.inviteTime,
          approveTime: item.approveTime,
          cancelRequestTime: item.cancelRequestTime
        }
      })
    } else {
      tournamentTeams.value = list
    }
  } catch (err) {
    console.error('加载球队列表失败:', err)
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

// 加载所有球队（用于邀请）
async function loadAllTeams() {
  try {
    loading.value = true
    const list = await queryList('teams', {
      orderBy: { createTime: 'desc' }
    })
    allTeams.value = list || []
  } catch (err) {
    console.error('加载球队列表失败:', err)
    ElMessage.error('加载球队列表失败')
    allTeams.value = []
  } finally {
    loading.value = false
  }
}

// 发送邀请
async function sendInvites() {
  if (selectedTeams.value.length === 0) return
  if (selectedTeams.value.length > availableSlots.value) {
    ElMessage.warning('超出剩余名额限制')
    return
  }

  sendingInvites.value = true
  try {
    for (const teamId of selectedTeams.value) {
      const team = allTeams.value.find(t => t._id === teamId)
      await addRecord('tournament_teams', {
        tournamentId,
        teamId,
        teamName: team.name,
        status: 'invited', // 邀请状态
        inviteTime: new Date(),
        createTime: new Date()
      })
    }

    ElMessage.success(`已成功邀请 ${selectedTeams.value.length} 支球队`)
    showInviteDialog.value = false
    selectedTeams.value = []
    inviteSearchKeyword.value = ''
    await loadTournamentTeams()
  } catch (err) {
    console.error('发送邀请失败:', err)
    ElMessage.error('邀请发送失败')
  } finally {
    sendingInvites.value = false
  }
}

// 打开邀请弹窗
async function openInviteDialog() {
  // 重新加载数据确保最新
  await Promise.all([
    loadTournamentTeams(),
    loadAllTeams()
  ])

  // 检查是否有可邀请的球队
  if (availableTeamsToInvite.value.length === 0) {
    if (allTeams.value.length === 0) {
      ElMessage.warning('系统中暂无球队，请先创建球队')
    } else {
      ElMessage.info('所有球队已加入该赛事或已被邀请')
    }
    return
  }

  showInviteDialog.value = true
}

// 弹窗关闭回调
function onInviteDialogClose() {
  selectedTeams.value = []
  inviteSearchKeyword.value = ''
}

// 打开报名二维码弹窗
async function openQrDialog() {
  showQrDialog.value = true
  await generateSignupQRCode()
}

// 生成报名二维码（调用云函数）
async function generateSignupQRCode() {
  qrLoading.value = true
  qrCodeImage.value = ''
  qrError.value = ''
  try {
    const res = await callFunction('generateMiniProgramCode', {
      action: 'signup',
      tournamentId: tournamentId,
      width: 300
    })
    if (res.success) {
      qrCodeImage.value = res.data.imageUrl
    } else {
      qrError.value = res.message || '生成二维码失败'
      console.error('[QR] 云函数返回失败:', res)
    }
  } catch (err) {
    console.error('[QR] 生成二维码异常:', err)
    qrError.value = err.message || String(err)
  } finally {
    qrLoading.value = false
  }
}

// 下载二维码图片
function downloadQRCode() {
  if (!qrCodeImage.value) return
  const link = document.createElement('a')
  link.href = qrCodeImage.value
  link.download = `赛事报名二维码_${tournament.value.name || tournamentId}.png`
  link.click()
}

// 复制小程序报名路径
async function copySignupLink() {
  const path = `pages/tournament/signup/signup?id=${tournamentId}`
  try {
    await navigator.clipboard.writeText(path)
    ElMessage.success('小程序路径已复制')
  } catch {
    ElMessage.info('复制失败，路径: ' + path)
  }
}

// 获取 tournament_teams 记录 ID
function getRecordId(team) {
  return team.recordId || team._id
}

// 取消邀请
async function cancelInvite(team) {
  try {
    await ElMessageBox.confirm(`确定取消对「${team.name || team.teamName}」的邀请吗？`, '确认取消')
    await deleteRecord('tournament_teams', getRecordId(team))
    ElMessage.success('已取消邀请')
    await loadTournamentTeams()
  } catch (err) {
    if (err !== 'cancel') {
      console.error('取消邀请失败:', err)
      ElMessage.error('操作失败')
    }
  }
}

// 通过报名/确认
async function approveTeam(team) {
  try {
    await updateRecord('tournament_teams', getRecordId(team), {
      status: 'approved',
      approveTime: new Date()
    })
    ElMessage.success('已通过')
    await loadTournamentTeams()
  } catch (err) {
    console.error('操作失败:', err)
    ElMessage.error('操作失败')
  }
}

// 拒绝报名
async function rejectTeam(team) {
  try {
    await ElMessageBox.confirm(`确定拒绝「${team.name || team.teamName}」的参赛申请吗？`, '确认拒绝')
    await updateRecord('tournament_teams', getRecordId(team), {
      status: 'rejected',
      rejectTime: new Date()
    })
    ElMessage.success('已拒绝')
    await loadTournamentTeams()
  } catch (err) {
    if (err !== 'cancel') {
      console.error('操作失败:', err)
      ElMessage.error('操作失败')
    }
  }
}

// 移除已参赛球队
async function removeTeam(team) {
  try {
    await ElMessageBox.confirm(`确定将「${team.name || team.teamName}」从赛事中移除吗？`, '确认移除', {
      type: 'warning'
    })
    await deleteRecord('tournament_teams', getRecordId(team))
    ElMessage.success('已移除')
    await loadTournamentTeams()
  } catch (err) {
    if (err !== 'cancel') {
      console.error('移除失败:', err)
      ElMessage.error('操作失败')
    }
  }
}

// 同意撤销报名
async function approveCancel(team) {
  try {
    await ElMessageBox.confirm(
      `确定同意「${team.name || team.teamName}」撤销报名吗？\n\n同意后该球队将退出本次赛事。`,
      '同意撤销报名',
      {
        confirmButtonText: '同意撤销',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    // 删除记录（撤销报名）
    await deleteRecord('tournament_teams', getRecordId(team))
    ElMessage.success('已同意撤销报名')
    await loadTournamentTeams()
  } catch (err) {
    if (err !== 'cancel') {
      console.error('同意撤销失败:', err)
      ElMessage.error('操作失败')
    }
  }
}

// 拒绝撤销报名（恢复为已参赛）
async function rejectCancel(team) {
  try {
    await ElMessageBox.confirm(
      `确定拒绝「${team.name || team.teamName}」的撤销申请吗？\n\n拒绝后该球队将继续参赛。`,
      '拒绝撤销申请',
      {
        confirmButtonText: '拒绝撤销',
        cancelButtonText: '取消',
        type: 'info'
      }
    )
    // 恢复状态为 approved
    await updateRecord('tournament_teams', getRecordId(team), {
      status: 'approved',
      cancelRequestTime: null,
      updateTime: new Date()
    })
    ElMessage.success('已拒绝撤销申请，球队继续参赛')
    await loadTournamentTeams()
  } catch (err) {
    if (err !== 'cancel') {
      console.error('拒绝撤销失败:', err)
      ElMessage.error('操作失败')
    }
  }
}

onMounted(() => {
  loadTournament()
  loadTournamentTeams()
  loadAllTeams()
})
</script>

<style scoped>
.tournament-teams {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.page-content {
  margin-top: 20px;
}

/* 统计栏 */
.stats-bar {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

.stat-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.stat-value {
  font-size: 32px;
  font-weight: 700;
  color: #1f2937;
  line-height: 1;
  margin-bottom: 8px;
}

.stat-label {
  font-size: 14px;
  color: #6b7280;
}

/* 操作栏 */
.action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

/* 标签徽章 */
.tab-badge {
  margin-left: 8px;
}

/* 球队网格 */
.teams-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
  margin-top: 20px;
}

.team-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transition: all 0.3s;
  border: 2px solid transparent;
}

.team-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.team-card.team-invited {
  border-color: #409eff;
  background: #f5f9ff;
}

.team-card.team-cancel-requested {
  border-color: #e6a23c;
  background: #fdf6ec;
}

.team-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.team-logo {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  object-fit: cover;
}

.team-logo-placeholder {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 600;
}

.team-info h4 {
  margin: 0 0 4px 0;
  font-size: 16px;
  color: #1f2937;
}

.team-body {
  margin-bottom: 16px;
}

.team-stat {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #f3f4f6;
}

.team-stat:last-child {
  border-bottom: none;
}

.team-stat span {
  font-size: 13px;
  color: #6b7280;
}

.team-stat em {
  font-style: normal;
  font-size: 13px;
  color: #1f2937;
}

.team-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

/* 邀请弹窗 */
.invite-dialog {
  max-height: 450px;
  overflow-y: auto;
}

/* 弹窗顶部信息栏 */
.invite-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e4e7ed;
}

.invite-info {
  display: flex;
  gap: 24px;
}

.info-item {
  font-size: 14px;
}

.info-item label {
  color: #909399;
  margin-right: 4px;
}

.info-item em {
  font-style: normal;
  font-weight: 600;
  color: #409eff;
  font-size: 16px;
}

.info-item em.text-danger {
  color: #f56c6c;
}

/* 球队列表 */
.available-teams {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.available-team-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  border: 2px solid transparent;
  background: #fafafa;
}

.available-team-item:hover {
  background: #f3f4f6;
}

.available-team-item.selected {
  background: #ecf5ff;
  border-color: #409eff;
}

.available-team-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.team-thumb {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  object-fit: cover;
}

.team-thumb-placeholder {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
}

.available-team-item .team-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.team-name {
  font-size: 15px;
  font-weight: 500;
  color: #1f2937;
}

.team-coach {
  font-size: 13px;
  color: #6b7280;
  display: flex;
  align-items: center;
  gap: 12px;
}

.team-coach .el-icon {
  font-size: 14px;
  margin-right: 2px;
}

.player-count {
  color: #409eff;
}

/* 弹窗底部 */
.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.footer-info {
  flex: 1;
}

.selected-preview {
  font-size: 14px;
  color: #606266;
  display: flex;
  align-items: center;
  gap: 8px;
}

.selected-preview .team-names {
  color: #409eff;
  font-weight: 500;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.footer-actions {
  display: flex;
  gap: 12px;
}

/* 响应式 */
@media (max-width: 768px) {
  .stats-bar {
    grid-template-columns: repeat(3, 1fr);
  }
  
  .teams-grid {
    grid-template-columns: 1fr;
  }
  
  .action-bar {
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }
}

/* 报名二维码弹窗 */
.qr-dialog {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
}

.qr-image-wrapper {
  width: 100%;
  display: flex;
  justify-content: center;
  min-height: 180px;
  align-items: center;
}

.qr-image {
  width: 220px;
  height: 220px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
}

.qr-tips {
  text-align: center;
  font-size: 13px;
  color: #909399;
  line-height: 1.8;
}

.qr-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.qr-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px;
  text-align: center;
}

.qr-error .error-text {
  font-size: 16px;
  font-weight: 600;
  color: #f56c6c;
  margin: 0;
}

.qr-error .error-detail {
  font-size: 12px;
  color: #909399;
  margin: 0;
  max-width: 280px;
  word-break: break-all;
}

.qr-error .error-hint {
  font-size: 13px;
  color: #e6a23c;
  margin: 8px 0 0 0;
}

.qr-path {
  background: #f5f7fa;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 12px;
  width: 100%;
  box-sizing: border-box;
  word-break: break-all;
}

.qr-path .label {
  color: #909399;
}

.qr-path .path-code {
  background: #fff;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  color: #409eff;
  margin-left: 4px;
  font-size: 11px;
}
</style>
