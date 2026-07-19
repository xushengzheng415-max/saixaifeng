<template>
  <div class="tournament-teams" v-loading="loading">
    <!-- 页面头部 -->
    <el-page-header @back="$router.push(`/tournaments/${tournamentId}`)" title="返回赛事详情">
      <template #content>
        <span style="font-size: 18px;">参赛球队 - {{ tournament.name || '赛事' }}</span>
      </template>
    </el-page-header>

    <div class="page-content">
      <div v-if="divisionOptions.length > 1" class="division-switch-bar">
        <span class="division-switch-label">赛事组别</span>
        <el-radio-group v-model="activeDivisionId" @change="onDivisionChange">
          <el-radio-button v-for="division in divisionOptions" :key="division.id" :value="division.id">{{ division.name }}</el-radio-button>
        </el-radio-group>
        <span class="division-switch-hint">当前：{{ activeDivision.name }}</span>
      </div>

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
        <el-button type="success" @click="openCreateTeamDialog">
          <el-icon><Plus /></el-icon>添加球队
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
            <el-badge :value="divisionTournamentTeams.length" class="tab-badge" />
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
              <el-button type="primary" size="small" plain @click="openTeamPlayers(team)">添加球员</el-button>
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
        <el-alert v-if="divisionOptions.length > 1" :title="`当前邀请至 ${activeDivision.name} 组`" type="success" :closable="false" style="margin-bottom: 14px" />
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

    <!-- 添加球队弹窗：字段与球队身份创建球队保持一致 -->
    <el-dialog
      v-model="showCreateTeamDialog"
      title="添加球队"
      width="620px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form :model="createTeamForm" label-position="top">
        <div class="create-mode-switch">
          <div>
            <div class="create-mode-title">创建模式</div>
            <div class="create-mode-tip">简易模式只填写球队名称和 Logo，完整模式可补充球队资料</div>
          </div>
          <el-radio-group v-model="createTeamMode">
            <el-radio-button value="simple">简易模式</el-radio-button>
            <el-radio-button value="full">完整模式</el-radio-button>
          </el-radio-group>
        </div>

        <div v-if="createTeamMode === 'full'" class="create-word-import">
          <div class="create-word-import-main">
            <div>
              <div class="create-word-import-title">Word 报名表快速填充</div>
              <div class="create-word-import-tip">自动识别球队名称和报名表中的第一张图片（球队 Logo）</div>
            </div>
            <el-upload
              accept=".docx"
              :auto-upload="false"
              :show-file-list="false"
              :on-change="handleCreateWordFileChange"
            >
              <el-button type="success" plain :loading="parsingCreateWord">
                <el-icon v-if="!parsingCreateWord"><Upload /></el-icon>
                {{ parsingCreateWord ? '正在识别...' : '上传 Word 报名表' }}
              </el-button>
            </el-upload>
          </div>
          <div v-if="createWordImportFileName" class="create-word-import-result">
            <span>已读取：{{ createWordImportFileName }}</span>
            <span>{{ createWordImportHasLogo ? '已提取球队 Logo，请核对下方内容' : '未找到 Logo，可在下方手动上传' }}</span>
          </div>
        </div>
        <el-alert v-if="divisionOptions.length > 1" :title="`新球队将直接加入 ${activeDivision.name} 组`" type="success" :closable="false" style="margin-bottom: 14px" />
        <el-row :gutter="16">
          <el-col :span="createTeamMode === 'simple' ? 24 : 12">
            <el-form-item :label="createTeamMode === 'simple' ? '球队名称' : '球队全称'" required>
              <el-input v-model="createTeamForm.name" :placeholder="createTeamMode === 'simple' ? '请输入球队名称' : '请输入球队全称'" maxlength="50" />
            </el-form-item>
          </el-col>
          <el-col v-if="createTeamMode === 'full'" :span="12">
            <el-form-item label="球队简称" required>
              <el-input v-model="createTeamForm.shortName" placeholder="请输入球队简称" maxlength="20" />
            </el-form-item>
          </el-col>
        </el-row>

        <template v-if="createTeamMode === 'full'">
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="所属省份" required>
                <el-select v-model="createTeamForm.province" placeholder="选择省份" style="width: 100%" @change="onCreateProvinceChange">
                  <el-option v-for="province in provinceCodeMap" :key="province.code" :label="province.code + ' - ' + province.name" :value="province.code" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="城市" required>
                <el-select v-model="createTeamForm.city" placeholder="先选择省份" style="width: 100%" :disabled="createCityOptions.length === 0" @change="onCreateCityChange">
                  <el-option v-for="city in createCityOptions" :key="city.l" :label="city.n + ' (' + city.l + ')'" :value="city.l" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="队伍类型" required>
                <el-select v-model="createTeamForm.teamType" placeholder="选择队伍类型" style="width: 100%" @change="autoGenerateCreateTeamCode">
                  <el-option v-for="option in teamTypeOptions" :key="option.value" :label="option.label" :value="option.value" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="球队编号">
                <el-input v-model="createTeamForm.teamCode" placeholder="选择地区和类型后自动生成" maxlength="9" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="成立时间" required>
                <el-date-picker v-model="createTeamForm.establishedDate" type="date" placeholder="选择成立时间" value-format="YYYY-MM-DD" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="绑定手机号">
                <el-input v-model="createTeamForm.ownerPhone" disabled placeholder="自动使用当前登录手机号" />
              </el-form-item>
            </el-col>
          </el-row>
        </template>

        <el-form-item label="球队Logo">
          <div class="create-logo-row">
            <el-upload
              :show-file-list="false"
              :before-upload="beforeCreateLogoUpload"
              :http-request="handleCreateLogoUpload"
              accept="image/*"
            >
              <el-button type="primary" plain :loading="uploadingCreateLogo">
                <el-icon v-if="!uploadingCreateLogo"><Upload /></el-icon>
                {{ uploadingCreateLogo ? '压缩上传中...' : '上传Logo' }}
              </el-button>
            </el-upload>
            <img v-if="createTeamForm.logoUrl" :src="createTeamForm.logoUrl" class="create-logo-preview" alt="球队Logo预览" />
            <span class="create-logo-tip">上传前会自动压缩</span>
          </div>
        </el-form-item>

        <el-form-item v-if="createTeamMode === 'full'" label="球队简介">
          <el-input v-model="createTeamForm.description" type="textarea" :rows="3" maxlength="200" show-word-limit placeholder="请输入球队简介" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showCreateTeamDialog = false">取消</el-button>
        <el-button type="primary" :loading="creatingTeam" @click="submitCreateTeam">创建并加入赛事</el-button>
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
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, User, InfoFilled, Picture, CircleCloseFilled, Upload } from '@element-plus/icons-vue'
import { queryById, queryList, addRecord, updateRecord, deleteRecord, callFunction, uploadLargeFileViaCloud, getFileUrl } from '../../utils/cloud'
import { provinceCodeMap, cityLetterMap } from '../../data/teamCodeRegions'

const route = useRoute()
const router = useRouter()
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
const activeDivisionId = ref('default')

// 主办方直接添加球队
const showCreateTeamDialog = ref(false)
const creatingTeam = ref(false)
const createTeamMode = ref('simple')
const uploadingCreateLogo = ref(false)
const parsingCreateWord = ref(false)
const createWordImportFileName = ref('')
const createWordImportHasLogo = ref(false)
const createCityOptions = ref([])
const createTeamForm = ref({
  name: '',
  shortName: '',
  province: '',
  city: '',
  cityName: '',
  teamType: '',
  teamCode: '',
  establishedDate: '',
  logoUrl: '',
  description: '',
  ownerPhone: ''
})
const teamTypeOptions = [
  { label: '一线队', value: '01' },
  { label: '二线队', value: '02' },
  { label: 'U8', value: '08' },
  { label: 'U9', value: '09' },
  { label: 'U10', value: '10' },
  { label: 'U11', value: '11' },
  { label: 'U12', value: '12' },
  { label: 'U13', value: '13' },
  { label: 'U14', value: '14' },
  { label: 'U15', value: '15' },
  { label: 'U16', value: '16' },
  { label: 'U17', value: '17' },
  { label: 'U18', value: '18' }
]

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

// 组别与统计（旧赛事自动归入默认组）
const divisionOptions = computed(() => {
  const divisions = Array.isArray(tournament.value.divisions) ? tournament.value.divisions : []
  if (divisions.length > 0) return divisions
  return [{
    id: 'default',
    name: '默认组',
    tournamentType: tournament.value.type || tournament.value.tournamentType || 'tournament',
    matchFormat: tournament.value.matchFormat || '11side',
    maxTeams: Number(tournament.value.maxTeams || 0),
    maxPlayersPerTeam: Number(tournament.value.maxPlayersPerTeam || tournament.value.maxPlayers || 35)
  }]
})
const activeDivision = computed(() => divisionOptions.value.find(item => item.id === activeDivisionId.value) || divisionOptions.value[0])
const divisionTournamentTeams = computed(() => tournamentTeams.value.filter(item => (item.divisionId || 'default') === activeDivisionId.value))
const approvedTeams = computed(() => divisionTournamentTeams.value.filter(t => t.status === 'approved'))
const pendingTeams = computed(() => divisionTournamentTeams.value.filter(t => t.status === 'pending'))
const invitedTeams = computed(() => divisionTournamentTeams.value.filter(t => t.status === 'invited'))
const cancelRequestedTeams = computed(() => divisionTournamentTeams.value.filter(t => t.status === 'cancel_requested'))

const availableSlots = computed(() => {
  // 如果没有设置maxTeams，默认允许邀请（不限制）
  const max = activeDivision.value?.maxTeams || tournament.value.maxTeams
  if (!max || max <= 0) {
    return 999 // 返回一个大数字表示无限制
  }
  const current = approvedTeams.value.length
  const slots = Math.max(0, max - current)
  return slots
})

const filteredTeams = computed(() => {
  let list = divisionTournamentTeams.value
  
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
  const invitedTeamIds = divisionTournamentTeams.value.map(t => t.teamId).filter(Boolean)


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

function getStoredUserInfo() {
  try {
    return JSON.parse(localStorage.getItem('userInfo') || '{}')
  } catch {
    return {}
  }
}

function resetCreateTeamForm() {
  const user = getStoredUserInfo()
  createTeamMode.value = 'simple'
  createTeamForm.value = {
    name: '',
    shortName: '',
    province: '',
    city: '',
    cityName: '',
    teamType: '',
    teamCode: '',
    establishedDate: '',
    logoUrl: '',
    description: '',
    ownerPhone: user.phone || user.phoneNumber || user.mobile || localStorage.getItem('phone') || ''
  }
  createCityOptions.value = []
  createWordImportFileName.value = ''
  createWordImportHasLogo.value = false
}

function openCreateTeamDialog() {
  if (availableSlots.value <= 0) {
    ElMessage.warning('参赛名额已满，无法继续添加球队')
    return
  }
  resetCreateTeamForm()
  showCreateTeamDialog.value = true
}

function onCreateProvinceChange(value) {
  createTeamForm.value.city = ''
  createTeamForm.value.cityName = ''
  createTeamForm.value.teamCode = ''
  createCityOptions.value = cityLetterMap[value] || []
}

function onCreateCityChange(value) {
  const city = createCityOptions.value.find(item => item.l === value)
  createTeamForm.value.cityName = city ? city.n : ''
  autoGenerateCreateTeamCode()
}

function autoGenerateCreateTeamCode() {
  const form = createTeamForm.value
  if (!form.province || !form.city || !form.teamType) return
  const prefix = form.province + form.city
  let maxSequence = 0
  allTeams.value.forEach(team => {
    const code = team.teamCode || ''
    if (code.startsWith(prefix)) {
      const sequence = Number.parseInt(code.substring(4, 7), 10)
      if (Number.isFinite(sequence)) maxSequence = Math.max(maxSequence, sequence)
    }
  })
  form.teamCode = prefix + String(maxSequence + 1).padStart(3, '0') + form.teamType
}

function beforeCreateLogoUpload(file) {
  if (!file.type || !file.type.startsWith('image/')) {
    ElMessage.error('只能上传图片文件')
    return false
  }
  if (file.size > 20 * 1024 * 1024) {
    ElMessage.error('原图大小不能超过20MB')
    return false
  }
  return true
}

function extractTeamNameFromWord(text) {
  const normalized = String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const match = normalized.match(/队\s*名\s*[：:]\s*(.+?)(?=\s*(?:队员人数|教练人数|参赛组别|清真餐人数|比赛服装颜色|$))/)
  return match ? match[1].trim() : ''
}

function dataUrlToFile(dataUrl, fileName) {
  const parts = String(dataUrl || '').split(',')
  const header = parts[0] || ''
  const base64 = parts[1] || ''
  const mimeMatch = header.match(/^data:([^;]+);base64$/)
  if (!mimeMatch || !base64) throw new Error('Word 中的球队 Logo 格式无效')

  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], fileName, { type: mimeMatch[1] })
}

async function handleCreateWordFileChange(file) {
  const rawFile = file.raw || file
  const fileName = file.name || rawFile.name || ''
  if (!fileName.toLowerCase().endsWith('.docx')) {
    ElMessage.error('仅支持 .docx 格式的 Word 报名表')
    return
  }
  if (rawFile.size > 20 * 1024 * 1024) {
    ElMessage.error('Word 报名表不能超过 20MB')
    return
  }

  parsingCreateWord.value = true
  try {
    const arrayBuffer = await rawFile.arrayBuffer()
    const mammothModule = await import('mammoth')
    const mammoth = mammothModule.default || mammothModule
    let firstImageDataUrl = ''
    const result = await mammoth.convertToHtml(
      { arrayBuffer },
      {
        convertImage: mammoth.images.imgElement(async image => {
          const base64 = await image.read('base64')
          const src = `data:${image.contentType || 'image/png'};base64,${base64}`
          if (!firstImageDataUrl) firstImageDataUrl = src
          return { src }
        })
      }
    )
    const doc = new DOMParser().parseFromString(result.value || '', 'text/html')
    const teamName = extractTeamNameFromWord(doc.body.textContent || '')
    if (!teamName) {
      throw new Error('未识别到“队名”字段，请确认报名表格式与样表一致')
    }

    createTeamForm.value.name = teamName.slice(0, 50)
    createTeamForm.value.shortName = Array.from(teamName).slice(0, 20).join('')
    if (firstImageDataUrl) createTeamForm.value.logoUrl = firstImageDataUrl
    createWordImportFileName.value = fileName
    createWordImportHasLogo.value = Boolean(firstImageDataUrl)

    ElMessage.success(firstImageDataUrl ? '已识别球队名称和 Logo，请核对后补全必填项' : '已识别球队名称，请手动上传 Logo')
  } catch (err) {
    console.error('解析球队 Word 报名表失败:', err)
    createWordImportFileName.value = ''
    createWordImportHasLogo.value = false
    ElMessage.error('Word 报名表识别失败: ' + (err.message || '未知错误'))
  } finally {
    parsingCreateWord.value = false
  }
}

function compressCreateLogo(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const ratio = Math.min(1, 640 / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * ratio))
      canvas.height = Math.max(1, Math.round(image.height * ratio))
      const context = canvas.getContext('2d')
      context.drawImage(image, 0, 0, canvas.width, canvas.height)

      const targetSize = 180 * 1024
      const encode = quality => {
        canvas.toBlob(blob => {
          if (!blob) {
            reject(new Error('图片压缩失败'))
            return
          }
          if (blob.size > targetSize && quality > 0.42) {
            encode(quality - 0.08)
            return
          }
          resolve(new File([blob], `team-logo-${Date.now()}.webp`, { type: 'image/webp' }))
        }, 'image/webp', quality)
      }
      encode(0.82)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('无法读取图片'))
    }
    image.src = objectUrl
  })
}

async function uploadCreateLogoFile(file) {
  const compressedFile = await compressCreateLogo(file)
  const cloudPath = `team-logos/${Date.now()}-${compressedFile.name}`
  const result = await uploadLargeFileViaCloud(cloudPath, compressedFile, { chunkSize: 32 * 1024 })
  if (!result.success) throw new Error(result.message || '上传失败')
  return {
    url: result.tempUrl || await getFileUrl(result.fileId),
    size: compressedFile.size
  }
}

async function handleCreateLogoUpload({ file }) {
  uploadingCreateLogo.value = true
  try {
    const result = await uploadCreateLogoFile(file)
    createTeamForm.value.logoUrl = result.url
    ElMessage.success(`Logo已压缩并上传（${Math.ceil(result.size / 1024)}KB）`)
  } catch (err) {
    console.error('球队Logo上传失败:', err)
    ElMessage.error('Logo上传失败: ' + (err.message || '未知错误'))
  } finally {
    uploadingCreateLogo.value = false
  }
}

function openTeamPlayers(team) {
  const teamId = team.teamId || team._id
  if (!teamId) {
    ElMessage.warning('未找到球队信息')
    return
  }
  router.push({
    path: `/teams/${teamId}`,
    query: { fromTournament: tournamentId, divisionId: activeDivisionId.value }
  })
}

async function submitCreateTeam() {
  const form = createTeamForm.value
  const isSimpleMode = createTeamMode.value === 'simple'
  const teamName = form.name.trim()
  if (!teamName) {
    ElMessage.warning('请填写球队名称')
    return
  }
  if (isSimpleMode) {
    form.shortName = ''
  } else {
    if (!form.shortName.trim()) {
      ElMessage.warning('请填写球队简称')
      return
    }
    if (!form.province || !form.city || !form.teamType) {
      ElMessage.warning('请选择所属省份、城市和队伍类型')
      return
    }
    if (!form.establishedDate) {
      ElMessage.warning('请选择球队成立时间')
      return
    }
  }
  if (availableSlots.value <= 0) {
    ElMessage.warning('参赛名额已满')
    return
  }

  creatingTeam.value = true
  let createdTeamId = ''
  let linkedToTournament = false
  try {
    const user = getStoredUserInfo()
    const userId = user._id || localStorage.getItem('userId') || ''
    const ownerPhone = form.ownerPhone || user.phone || user.phoneNumber || ''
    const now = new Date()
    if (form.logoUrl.startsWith('data:image/')) {
      uploadingCreateLogo.value = true
      try {
        const wordLogoFile = dataUrlToFile(form.logoUrl, `word-team-logo-${Date.now()}.png`)
        const uploadedLogo = await uploadCreateLogoFile(wordLogoFile)
        form.logoUrl = uploadedLogo.url
      } finally {
        uploadingCreateLogo.value = false
      }
    }
    const teamData = {
      name: teamName,
      logo: form.logoUrl || '',
      logoUrl: form.logoUrl || '',
      isTemporary: isSimpleMode,
      ownerPhone,
      creatorPhone: ownerPhone,
      contactPhone: ownerPhone,
      phoneNumber: ownerPhone,
      phone: ownerPhone,
      mobile: ownerPhone,
      creatorId: userId,
      source: 'saixiaofeng',
      claimStatus: 'claimed',
      playerCount: 0,
      createTime: now,
      updateTime: now
    }
    if (!isSimpleMode) {
      Object.assign(teamData, {
        shortName: form.shortName.trim(),
        provinceCode: form.province,
        cityCode: form.city,
        cityName: form.cityName,
        teamType: form.teamType,
        teamCode: form.teamCode,
        establishedDate: form.establishedDate,
        description: form.description || ''
      })
    }
    const created = await addRecord('teams', teamData)
    createdTeamId = created._id
    if (!createdTeamId) throw new Error('球队创建成功但未返回球队ID')

    await addRecord('tournament_teams', {
      tournamentId,
      teamId: createdTeamId,
      teamName: teamData.name,
      divisionId: activeDivisionId.value,
      divisionName: activeDivision.value.name,
      isTemporary: isSimpleMode,
      status: 'approved',
      approveTime: now,
      createTime: now,
      updateTime: now
    })
    linkedToTournament = true

    showCreateTeamDialog.value = false
    await Promise.all([loadTournamentTeams(), loadAllTeams()])

    try {
      await ElMessageBox.confirm('球队已创建并加入赛事，是否现在添加球员？', '创建成功', {
        confirmButtonText: '添加球员',
        cancelButtonText: '稍后添加',
        type: 'success'
      })
      router.push({
        path: `/teams/${createdTeamId}`,
        query: { fromTournament: tournamentId, divisionId: activeDivisionId.value }
      })
    } catch (choice) {
      if (choice !== 'cancel' && choice !== 'close') throw choice
    }
  } catch (err) {
    console.error('添加球队失败:', err)
    if (createdTeamId && !linkedToTournament) {
      try { await deleteRecord('teams', createdTeamId) } catch (rollbackError) { console.warn('回滚球队失败:', rollbackError) }
    }
    ElMessage.error('添加球队失败: ' + (err.message || '未知错误'))
  } finally {
    creatingTeam.value = false
  }
}

// 加载赛事信息
async function loadTournament() {
  try {
    tournament.value = await queryById('tournaments', tournamentId)
    const routeDivisionId = typeof route.query.divisionId === 'string' ? route.query.divisionId : ''
    const preferred = routeDivisionId || tournament.value.defaultDivisionId || tournament.value.divisions?.[0]?.id || 'default'
    activeDivisionId.value = divisionOptions.value.some(item => item.id === preferred) ? preferred : divisionOptions.value[0].id
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
          divisionId: item.divisionId || 'default',
          divisionName: item.divisionName || '',
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
        divisionId: activeDivisionId.value,
        divisionName: activeDivision.value.name,
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

function onDivisionChange() {
  activeTab.value = 'all'
  selectedTeams.value = []
  inviteSearchKeyword.value = ''
  router.replace({ query: { ...route.query, divisionId: activeDivisionId.value } })
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

.division-switch-bar { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 14px 16px; margin-bottom: 16px; background: #f0f8f1; border: 1px solid #d8ead9; border-radius: 10px; }
.division-switch-label { color: #1b5e20; font-weight: 600; }
.division-switch-hint { color: #6b7280; font-size: 13px; }

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

.create-mode-switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  padding: 14px;
  border: 1px solid #d9ecff;
  border-radius: 8px;
  background: #f4f9ff;
}

.create-mode-title {
  color: #303133;
  font-size: 14px;
  font-weight: 600;
}

.create-mode-tip {
  margin-top: 4px;
  color: #606266;
  font-size: 12px;
  line-height: 1.5;
}

.create-word-import {
  margin-bottom: 16px;
  padding: 14px;
  border: 1px solid #c2e7b0;
  border-radius: 8px;
  background: #f0f9eb;
}

.create-word-import-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.create-word-import-title {
  color: #1b5e20;
  font-size: 14px;
  font-weight: 600;
}

.create-word-import-tip,
.create-word-import-result {
  margin-top: 4px;
  color: #606266;
  font-size: 12px;
  line-height: 1.6;
}

.create-word-import-result {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding-top: 8px;
  border-top: 1px dashed #c2e7b0;
}

.create-logo-row {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 72px;
}

.create-logo-preview {
  width: 64px;
  height: 64px;
  object-fit: contain;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  background: #fff;
}

.create-logo-tip {
  color: #909399;
  font-size: 12px;
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

  .create-word-import-main,
  .create-word-import-result {
    align-items: flex-start;
    flex-direction: column;
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
