<template>
  <div class="tournament-detail" v-loading="loading">
    <!-- 返回按钮 -->
    <div class="back-bar">
      <el-button @click="$router.push('/tournaments')" :icon="Back">返回赛事列表</el-button>
    </div>

    <!-- 赛事主信息卡片 -->
    <div class="hero-card" :style="{ '--hero-gradient': getGradient(tournament.type) }">
      <div class="hero-content">
        <div class="hero-logo">
          <img v-if="tournament.logoUrl || tournament.logo" :src="tournament.logoUrl || tournament.logo" alt="logo" />
          <span v-else class="logo-placeholder">{{ getLogoEmoji(tournament.type) }}</span>
          <!-- AI生成LOGO按钮 -->
          <AIImageGenerator
            v-if="editable"
            type="tournamentLogo"
            :name="tournament.name"
            class="ai-logo-btn"
            @success="handleAISuccess"
          />
        </div>
        <div class="hero-info">
          <h1>{{ tournament.name }}</h1>
          <div class="hero-tags">
            <el-tag :type="getTypeTagType(tournament.type)">
              {{ scheduleTypeNames[tournament.type] }}
            </el-tag>
            <el-tag :class="['status-tag', tournament.status]">
              {{ statusLabels[tournament.status] }}
            </el-tag>
          </div>
          <p class="hero-desc" v-if="tournament.description">
            {{ tournament.description }}
          </p>
        </div>
      </div>

      <!-- 关键数据 -->
      <div class="hero-stats">
        <div class="stat-item">
          <div class="stat-value">{{ approvedTeamCount }}</div>
          <div class="stat-label">已参赛球队</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">{{ tournament.maxTeams || 0 }}</div>
          <div class="stat-label">总球队数</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">{{ getMatchCount() }}</div>
          <div class="stat-label">比赛场次</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">{{ getDayCount() }}</div>
          <div class="stat-label">赛程天数</div>
        </div>
      </div>
    </div>

    <!-- 快捷操作 - 主办方 -->
    <div class="quick-actions" v-if="isOrganizer">
      <div class="action-card" @click="$router.push(`/tournaments/${id}/teams`)">
        <el-icon :size="32"><UserFilled /></el-icon>
        <span>参赛球队</span>
        <em>{{ approvedTeamCount }} 队</em>
      </div>
      <div class="action-card" @click="$router.push(`/tournaments/${id}/draw`)">
        <el-icon :size="32"><DataBoard /></el-icon>
        <span>抽签分组</span>
        <em>查看分组</em>
      </div>
      <div class="action-card" @click="$router.push(`/tournaments/${id}/schedule`)">
        <el-icon :size="32"><Calendar /></el-icon>
        <span>赛程安排</span>
        <em>{{ getMatchCount() }} 场</em>
      </div>
      <div class="action-card" @click="$router.push(`/tournaments/${id}/signups`)">
        <el-icon :size="32"><Bell /></el-icon>
        <span>报名审核</span>
        <em>{{ pendingSignups }} 待审</em>
      </div>
      <!-- ★ 换人审核入口（T04 新增） -->
      <div class="action-card" @click="$router.push(`/tournaments/${id}/roster-changes`)">
        <el-icon :size="32"><Switch /></el-icon>
        <span>换人审核</span>
        <em>淘汰赛换人</em>
      </div>
      <!-- ★ 清空参赛球队（危险操作） -->
      <div class="action-card action-danger" @click="handleClearTeams">
        <el-icon :size="32"><Delete /></el-icon>
        <span>清空参赛球队</span>
        <em>危险操作</em>
      </div>
    </div>

    <!-- 快捷操作 - 球队（只读视图） -->
    <div class="quick-actions" v-else-if="currentRole === 'COACH'">
      <div class="action-card" @click="$router.push(`/tournaments/${id}/teams`)">
        <el-icon :size="32"><UserFilled /></el-icon>
        <span>参赛球队</span>
        <em>{{ approvedTeamCount }} 队</em>
      </div>
      <div class="action-card" @click="$router.push(`/tournaments/${id}/draw`)">
        <el-icon :size="32"><DataBoard /></el-icon>
        <span>分组情况</span>
        <em>查看分组</em>
      </div>
      <div class="action-card" @click="$router.push(`/tournaments/${id}/schedule`)">
        <el-icon :size="32"><Calendar /></el-icon>
        <span>赛程安排</span>
        <em>{{ getMatchCount() }} 场</em>
      </div>
      <div class="action-card" @click="scrollToRules">
        <el-icon :size="32"><Document /></el-icon>
        <span>竞赛规程</span>
        <em>查看规则</em>
      </div>
      <!-- 我要报名（未报名时显示） -->
      <div
        v-if="!mySignupStatus && (tournament.status === 'registering' || tournament.status === 'upcoming')"
        class="action-card signup-action"
        @click="handleSignup"
      >
        <el-icon :size="32" color="#67C23A"><CirclePlus /></el-icon>
        <span>我要报名</span>
        <em>点击报名参赛</em>
      </div>
    </div>

    <!-- 基本信息 -->
    <div class="info-section">
      <h3><el-icon><InfoFilled /></el-icon>基本信息</h3>
      <div class="info-grid">
        <div class="info-item">
          <label>赛事名称</label>
          <span>{{ tournament.name }}</span>
        </div>
        <div class="info-item">
          <label>赛制类型</label>
          <span>{{ scheduleTypeNames[tournament.type] || tournament.type }}</span>
        </div>
        <div class="info-item">
          <label>开始日期</label>
          <span>{{ tournament.startDate || '-' }}</span>
        </div>
        <div class="info-item">
          <label>结束日期</label>
          <span>{{ tournament.endDate || '-' }}</span>
        </div>
        <div class="info-item">
          <label>报名截止</label>
          <span>{{ tournament.registerDeadline || '-' }}</span>
        </div>
        <div class="info-item">
          <label>赛事地点</label>
          <span>{{ tournament.location || '待定' }}</span>
        </div>
        <div class="info-item">
          <label>参赛球队</label>
          <span>{{ approvedTeamCount }} / {{ tournament.maxTeams || 0 }} 队</span>
        </div>
        <div class="info-item">
          <label>创建时间</label>
          <span>{{ formatDateTime(tournament.createTime) }}</span>
        </div>
      </div>
    </div>

    <!-- 竞赛规程 -->
    <div id="rules-section" class="info-section">
      <h3><el-icon><Document /></el-icon>竞赛规程</h3>
      <!-- 已上传的规程文件 -->
      <div v-if="tournament.regulationsFileId" class="regulations-file-section">
        <div class="regulations-file-card">
          <el-icon class="file-icon" :size="32"><Document /></el-icon>
          <div class="file-info">
            <div class="file-name">{{ tournament.regulationsFileName || '竞赛规程' }}</div>
            <div class="file-meta">已上传的竞赛规程文档</div>
          </div>
          <div class="file-actions">
            <el-button type="primary" size="small" @click="viewRegulations">
              <el-icon><View /></el-icon> 查看
            </el-button>
            <el-button size="small" @click="downloadRegulations">
              <el-icon><Download /></el-icon> 下载
            </el-button>
          </div>
        </div>
      </div>
      <!-- 原有的 HTML 规程内容 -->
      <div v-if="tournament.rules && typeof tournament.rules === 'string'" class="rules-content" v-html="tournament.rules"></div>
      <!-- 无规程提示 -->
      <div v-if="!tournament.regulationsFileId && (!tournament.rules || typeof tournament.rules !== 'string')" class="no-rules">
        <el-empty description="暂无竞赛规程" />
      </div>
    </div>

    <!-- 赛制规则 -->
    <div v-if="tournament.rules && typeof tournament.rules === 'object'" class="info-section">
      <h3><el-icon><Setting /></el-icon>赛制规则</h3>
      
      <!-- 积分规则 -->
      <div v-if="tournament.rules.pointsRule" class="rule-subsection">
        <h4>积分规则</h4>
        <div class="rule-grid">
          <div class="rule-item">
            <label>胜场得分</label>
            <span>{{ tournament.rules.pointsRule.winPoints ?? 3 }} 分</span>
          </div>
          <div class="rule-item">
            <label>平局得分</label>
            <span>{{ tournament.rules.pointsRule.drawPoints ?? 1 }} 分</span>
          </div>
          <div class="rule-item">
            <label>负场得分</label>
            <span>{{ tournament.rules.pointsRule.lossPoints ?? 0 }} 分</span>
          </div>
          <div class="rule-item">
            <label>弃权得分</label>
            <span>{{ tournament.rules.pointsRule.forfeitPoints ?? 0 }} 分</span>
          </div>
        </div>

        <!-- 进球加分 -->
        <div v-if="tournament.rules.pointsRule.enableGoalBonus" class="rule-extra">
          <el-tag type="success" size="small">已启用进球加分</el-tag>
          <span class="rule-extra-text">每进一个球额外加 {{ tournament.rules.pointsRule.goalBonusPoints ?? 0 }} 分</span>
        </div>
        <div v-else class="rule-extra">
          <el-tag size="small">未启用进球加分</el-tag>
        </div>

        <!-- 红黄牌扣分 -->
        <div v-if="tournament.rules.pointsRule.enableCardDeduction" class="rule-extra">
          <el-tag type="danger" size="small">已启用红黄牌扣分</el-tag>
          <span class="rule-extra-text">
            黄牌扣 {{ tournament.rules.pointsRule.yellowCardDeduction ?? 0 }} 分，
            红牌扣 {{ tournament.rules.pointsRule.redCardDeduction ?? 0 }} 分
          </span>
        </div>
        <div v-else class="rule-extra">
          <el-tag size="small">未启用红黄牌扣分</el-tag>
        </div>
      </div>

      <!-- 换人规则 -->
      <div v-if="tournament.rules.substitutionRule" class="rule-subsection">
        <h4>换人规则</h4>
        <div class="rule-grid">
          <div class="rule-item">
            <label>最大换人次数</label>
            <span>{{ tournament.rules.substitutionRule.maxSubstitutions ?? 5 }} 次</span>
          </div>
          <div class="rule-item">
            <label>是否允许换回</label>
            <span>
              <el-tag :type="tournament.rules.substitutionRule.allowReturnSubstitution ? 'success' : 'info'" size="small">
                {{ tournament.rules.substitutionRule.allowReturnSubstitution ? '允许' : '不允许' }}
              </el-tag>
            </span>
          </div>
          <div class="rule-item">
            <label>中场额外换人</label>
            <span>
              <el-tag :type="tournament.rules.substitutionRule.extraSubstitutionAtHalftime ? 'success' : 'info'" size="small">
                {{ tournament.rules.substitutionRule.extraSubstitutionAtHalftime ? '允许' : '不允许' }}
              </el-tag>
            </span>
          </div>
          <div v-if="tournament.rules.substitutionRule.extraSubstitutionAtHalftime" class="rule-item">
            <label>中场额外换人次数</label>
            <span>{{ tournament.rules.substitutionRule.halftimeSubstitutions ?? 0 }} 次</span>
          </div>
        </div>
      </div>

      <!-- 停赛规则 -->
      <div v-if="tournament.rules.suspensionRule" class="rule-subsection">
        <h4>停赛规则</h4>
        <div class="rule-grid">
          <div class="rule-item">
            <label>累计黄牌停赛</label>
            <span>
              <template v-if="tournament.rules.suspensionRule.yellowCardsForSuspension > 0">
                累计 {{ tournament.rules.suspensionRule.yellowCardsForSuspension ?? 4 }} 张黄牌停赛
                {{ tournament.rules.suspensionRule.yellowCardSuspensionMatches ?? 1 }} 场
              </template>
              <template v-else>不启用</template>
            </span>
          </div>
          <div class="rule-item">
            <label>直接红牌停赛</label>
            <span>{{ tournament.rules.suspensionRule.redCardSuspensionMatches ?? 1 }} 场</span>
          </div>
          <div v-if="tournament.rules.suspensionRule.secondYellowSuspensionMatches > 0" class="rule-item">
            <label>两黄变红停赛</label>
            <span>{{ tournament.rules.suspensionRule.secondYellowSuspensionMatches }} 场</span>
          </div>
          <div class="rule-item">
            <label>红牌带入下赛季</label>
            <span>
              <el-tag :type="tournament.rules.suspensionRule.carryRedCardToNextSeason ? 'warning' : 'info'" size="small">
                {{ tournament.rules.suspensionRule.carryRedCardToNextSeason ? '带入' : '不带入' }}
              </el-tag>
            </span>
          </div>
          <div class="rule-item">
            <label>黄牌带入下赛季</label>
            <span>
              <el-tag :type="tournament.rules.suspensionRule.carryYellowCardToNextSeason ? 'warning' : 'info'" size="small">
                {{ tournament.rules.suspensionRule.carryYellowCardToNextSeason ? '带入' : '不带入' }}
              </el-tag>
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 赛事官网 -->
    <div class="info-section">
      <h3><el-icon><Link /></el-icon>赛事官网</h3>
      <div class="website-section">
        <div class="website-info">
          <div class="info-item">
            <label>官网链接</label>
            <div class="link-row">
              <el-input :value="websiteUrl" readonly>
                <template #append>
                  <el-button @click="copyLink(websiteUrl)">复制</el-button>
                </template>
              </el-input>
            </div>
          </div>
          <div class="info-item">
            <label>分享链接</label>
            <div class="link-row">
              <el-input :value="shareUrl" readonly>
                <template #append>
                  <el-button @click="copyLink(shareUrl)">复制</el-button>
                </template>
              </el-input>
            </div>
          </div>
        </div>
        <div class="qrcode-section">
          <div class="qrcode-box">
            <img v-if="qrcodeUrl" :src="qrcodeUrl" alt="官网二维码" class="qrcode-img" />
            <div v-else class="qrcode-placeholder">
              <el-icon :size="48"><Picture /></el-icon>
              <span>二维码生成中...</span>
            </div>
          </div>
          <el-button type="primary" size="small" @click="downloadQRCode" :disabled="!qrcodeUrl">
            下载二维码
          </el-button>
        </div>
      </div>
    </div>


    <!-- 赛制规则 -->

    <!-- 底部操作 - 仅主办方显示管理按钮 -->
    <div class="detail-actions" v-if="isOrganizer">
      <el-button type="primary" size="large" @click="$router.push(`/tournaments/${id}/schedule`)">
        <el-icon><Calendar /></el-icon>管理赛程
      </el-button>
      <el-button size="large" @click="$router.push(`/tournaments/${id}/edit`)">
        <el-icon><Edit /></el-icon>编辑赛事
      </el-button>
      <el-button type="danger" size="large" @click="deleteTournament">
        <el-icon><Delete /></el-icon>删除赛事
      </el-button>
    </div>

    <!-- 底部操作 - 球队方显示报名状态 -->
    <div class="detail-actions team-actions" v-else-if="currentRole === 'COACH'">
      <div v-if="mySignupStatus === 'approved'" class="signup-status approved">
        <el-icon><CircleCheck /></el-icon>
        <span>已报名</span>
      </div>
      <div v-else-if="mySignupStatus === 'pending'" class="signup-status pending">
        <el-icon><Clock /></el-icon>
        <span>审核中</span>
      </div>
      <div v-else-if="mySignupStatus === 'invited'" class="signup-status invited">
        <el-icon><Message /></el-icon>
        <span>已收到邀请</span>
        <el-button type="primary" size="small" @click="handleConfirmInvite">确认参加</el-button>
      </div>
      <div v-else-if="mySignupStatus === 'rejected'" class="signup-status rejected">
        <el-icon><CircleClose /></el-icon>
        <span>报名被拒绝</span>
      </div>
      <div v-else-if="tournament.status === 'registering' || tournament.status === 'upcoming'" class="signup-action">
        <el-button type="success" size="large" @click="handleSignup">
          <el-icon><CirclePlus /></el-icon>我要报名
        </el-button>
      </div>
      <div v-else class="signup-status closed">
        <el-icon><Lock /></el-icon>
        <span>报名已截止</span>
      </div>
    </div>

    <!-- 报名对话框 -->
    <el-dialog
      v-model="signupVisible"
      title="报名参赛"
      width="480px"
      :close-on-click-modal="false"
    >
      <div class="signup-tournament-info">
        <h4>{{ tournament.name }}</h4>
        <p>请选择要报名的球队：</p>
      </div>
      <el-select
        v-model="selectedTeamId"
        placeholder="选择球队"
        style="width: 100%"
        :loading="loadingTeams"
      >
        <el-option
          v-for="team in myTeams"
          :key="team._id"
          :label="team.name"
          :value="team._id"
        />
      </el-select>
      <el-select
        v-if="signupDivisions.length"
        v-model="selectedDivisionId"
        placeholder="选择竞赛组别"
        style="width: 100%; margin-top: 16px"
      >
        <el-option
          v-for="division in signupDivisions"
          :key="division.id"
          :label="division.name"
          :value="division.id"
        />
      </el-select>
      <el-input
        v-model="signupMessage"
        type="textarea"
        :rows="3"
        placeholder="附言（可选）：想说的话..."
        style="margin-top: 16px"
      />
      <template #footer>
        <el-button @click="signupVisible = false">取消</el-button>
        <el-button type="primary" :loading="signupLoading" @click="submitSignup">提交报名</el-button>
      </template>
    </el-dialog>

    <!-- 登录提示对话框 -->
    <el-dialog
      v-model="loginPromptVisible"
      title="需要登录"
      width="360px"
      :show-close="false"
    >
      <p>报名参赛需要先登录账号</p>
      <template #footer>
        <el-button @click="loginPromptVisible = false">取消</el-button>
        <el-button type="primary" @click="goToLogin">去登录</el-button>
      </template>
    </el-dialog>

    <!-- 竞赛规程在线查看弹窗 -->
    <el-dialog
      v-model="rulesDialogVisible"
      title="竞赛规程"
      width="800px"
      :close-on-click-modal="true"
      class="rules-dialog"
    >
      <div v-if="rulesLoading" class="rules-loading">
        <el-icon class="is-loading" :size="32"><Loading /></el-icon>
        <p>正在加载文档...</p>
      </div>
      <div v-else class="rules-html-content" v-html="rulesHtmlContent"></div>
      <template #footer>
        <el-button @click="rulesDialogVisible = false">关闭</el-button>
        <el-button @click="exportRulesAsPdf">
          <el-icon><Printer /></el-icon> 导出为 PDF
        </el-button>
        <el-button type="primary" @click="downloadRegulations">
          <el-icon><Download /></el-icon> 下载原文档
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Back,
  UserFilled,
  Calendar,
  Bell,
  DataBoard,
  InfoFilled,
  Document,
  Edit,
  Delete,
  Link,
  CirclePlus,
  CircleCheck,
  Clock,
  Message,
  CircleClose,
  Lock,
  View,
  Download,
  Loading,
  Printer,
  Setting,
  Switch
} from '@element-plus/icons-vue'
import mammoth from 'mammoth'
import { queryList, queryById, deleteRecord, updateRecord, callFunction } from '../../utils/cloud'

const route = useRoute()
const router = useRouter()
const id = route.params.id

const loading = ref(false)
const currentRole = ref((localStorage.getItem('currentRole') || localStorage.getItem('role') || 'ORGANIZER').toUpperCase())
const isOrganizer = computed(() => currentRole.value === 'ORGANIZER')
const editable = computed(() => isOrganizer.value)
const tournament = ref({})
const websiteUrl = ref('')
const shareUrl = ref('')
const qrcodeUrl = ref('')
const matches = ref([])
const pendingSignups = ref(0)
const approvedTeamCount = ref(0)

// 竞赛规程在线查看
const rulesDialogVisible = ref(false)
const rulesHtmlContent = ref('')
const rulesLoading = ref(false)

// 球队报名状态
const mySignupStatus = ref('') // '', 'pending', 'approved', 'invited', 'rejected'
const mySignupRecord = ref(null)

// 报名相关
const signupVisible = ref(false)
const loginPromptVisible = ref(false)
const selectedTeamId = ref('')
const selectedDivisionId = ref('')
const signupDivisions = ref([])
const myTeams = ref([])
const loadingTeams = ref(false)
const signupLoading = ref(false)
const signupMessage = ref('')

// 报名状态显示文本
const signupStatusText = computed(() => {
  const statusMap = {
    'pending': '审核中',
    'approved': '已报名',
    'invited': '已邀请',
    'rejected': '已拒绝'
  }
  return statusMap[mySignupStatus.value] || ''
})

// 报名状态样式
const signupStatusClass = computed(() => {
  const classMap = {
    'pending': 'status-pending',
    'approved': 'status-approved',
    'invited': 'status-invited',
    'rejected': 'status-rejected'
  }
  return classMap[mySignupStatus.value] || ''
})

const scheduleTypeNames = {
  tournament: '赛会制',
  cup: '杯赛制',
  league: '联赛制',
  combined: '复合制'
}

const statusLabels = {
  registering: '报名中',
  ongoing: '进行中',
  completed: '已结束'
}

const gradients = {
  tournament: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  cup: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  league: 'linear-gradient(135deg, #4ade80 0%, #22c55e 100%)',
  combined: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)'
}

const logoEmojis = {
  tournament: '🏆',
  cup: '🥇',
  league: '⚽',
  combined: '🎯'
}

const typeTagTypes = {
  tournament: 'primary',
  cup: 'danger',
  league: 'success',
  combined: 'warning'
}

function getGradient(type) {
  return gradients[type] || gradients.tournament
}

function getLogoEmoji(type) {
  return logoEmojis[type] || logoEmojis.tournament
}

function getTypeTagType(type) {
  return typeTagTypes[type] || 'info'
}

function formatDateTime(dt) {
  if (!dt) return '-'
  const d = new Date(dt)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function getMatchCount() {
  return matches.value.length || 0
}

function getDayCount() {
  if (!tournament.value.startDate || !tournament.value.endDate) return 0
  const start = new Date(tournament.value.startDate)
  const end = new Date(tournament.value.endDate)
  const diff = Math.ceil((end - start) / (1000 * 60 * 60 * 24))
  return diff + 1
}

// 检查是否已登录
function isLoggedIn() {
  return localStorage.getItem('isLoggedIn') === 'true'
}

function normalizeSignupDivisions(source) {
  return (Array.isArray(source) ? source : []).map(item => ({
    id: String(item && (item.id || item._id || item.divisionId || item.division || item.divisionKey) || '').trim(),
    name: String(item && (item.name || item.divisionName || item.label || item.ageGroup) || '当前竞赛组别').trim()
  })).filter(item => item.id)
}

async function loadSignupDivisions() {
  const embedded = normalizeSignupDivisions(tournament.value && tournament.value.divisions)
  if (embedded.length) {
    signupDivisions.value = embedded
    selectedDivisionId.value = embedded.length === 1 ? embedded[0].id : ''
    return
  }
  try {
    const rows = await queryList('divisions', { limit: 100, where: { tournamentId: id } })
    signupDivisions.value = normalizeSignupDivisions(rows)
  } catch (error) {
    signupDivisions.value = []
  }
  selectedDivisionId.value = signupDivisions.value.length === 1 ? signupDivisions.value[0].id : ''
}

// 加载当前球队的报名状态
async function loadMySignupStatus() {
  try {
    // 先获取我的球队列表
    const teamsData = await queryList('teams', {
      limit: 100,
      where: {}
    })
    myTeams.value = teamsData || []

    if (!teamsData || teamsData.length === 0) {
      mySignupStatus.value = ''
      return
    }

    // 获取所有球队ID
    const teamIds = teamsData.map(t => t._id)

    // 查询 tournament_teams 中是否有记录
    const signupData = await queryList('tournament_teams', {
      where: {
        tournamentId: id,
        teamId: { $in: teamIds }
      }
    })

    if (signupData && signupData.length > 0) {
      // 找到最新的记录
      const latestSignup = signupData.sort((a, b) => {
        return new Date(b.createTime || b.updateTime || 0) - new Date(a.createTime || a.updateTime || 0)
      })[0]
      mySignupRecord.value = latestSignup
      mySignupStatus.value = latestSignup.status || ''
    } else {
      mySignupStatus.value = ''
      mySignupRecord.value = null
    }
  } catch (err) {
    console.error('加载报名状态失败:', err)
    mySignupStatus.value = ''
  }
}

// 处理确认邀请
async function handleConfirmInvite() {
  if (!mySignupRecord.value) return
  try {
    await callFunction('webBatchUpdate', {
      collection: 'tournament_teams',
      id: mySignupRecord.value._id,
      data: {
        status: 'approved',
        updateTime: new Date()
      }
    })
    ElMessage.success('已确认参加')
    mySignupStatus.value = 'approved'
  } catch (err) {
    ElMessage.error('确认失败')
  }
}

// 处理报名
async function handleSignup() {
  if (!isLoggedIn()) {
    loginPromptVisible.value = true
    return
  }
  selectedTeamId.value = ''
  selectedDivisionId.value = ''
  signupDivisions.value = []
  signupMessage.value = ''
  signupVisible.value = true
  await Promise.all([loadMyTeams(), loadSignupDivisions()])
}

// 加载我的球队
async function loadMyTeams() {
  loadingTeams.value = true
  try {
    const data = await queryList('teams', {
      limit: 100,
      where: {}
    })
    myTeams.value = data || []
  } catch (err) {
    console.error('加载球队失败:', err)
  } finally {
    loadingTeams.value = false
  }
}

// 提交报名
async function submitSignup() {
  if (!selectedTeamId.value) {
    ElMessage.warning('请选择球队')
    return
  }
  if (signupDivisions.value.length > 1 && !selectedDivisionId.value) {
    ElMessage.warning('请选择报名竞赛组别')
    return
  }

  signupLoading.value = true
  try {
    const res = await callFunction('applyTournament', {
      tournamentId: id,
      teamId: selectedTeamId.value,
      ...(selectedDivisionId.value ? { divisionId: selectedDivisionId.value } : {}),
      message: signupMessage.value
    })

    if (res && res.success) {
      ElMessage.success(res.message || '报名申请已提交')
      signupVisible.value = false
    } else {
      ElMessage.warning(res?.message || '报名失败')
    }
  } catch (err) {
    console.error('报名失败:', err)
    ElMessage.error('报名失败: ' + (err.message || '未知错误'))
  } finally {
    signupLoading.value = false
  }
}

// 跳转到登录
function goToLogin() {
  loginPromptVisible.value = false
  router.push('/login')
}

async function loadTournament() {
  loading.value = true
  try {
    const result = await queryById('tournaments', id)
    tournament.value = Array.isArray(result) ? result[0] : result
    if (!tournament.value) {
      ElMessage.error('赛事不存在')
      router.push('/tournaments')
      return
    }

    // 加载相关数据
    const [matchesData, allSignups] = await Promise.all([
      queryList('matches', { where: { tournamentId: id } }),
      queryList('tournament_teams', { where: { tournamentId: id } })
    ])

    matches.value = matchesData
    pendingSignups.value = allSignups.filter(t => t.status === 'pending').length
    approvedTeamCount.value = allSignups.filter(t => t.status === 'approved').length

    // 同步更新 tournament 的 registeredTeams 字段
    if (approvedTeamCount.value > 0 && approvedTeamCount.value !== (tournament.value.registeredTeams || 0)) {
      tournament.value.registeredTeams = approvedTeamCount.value
    }

    // 如果是球队角色，查询报名状态
    if (currentRole.value === 'COACH') {
      await loadMySignupStatus()
    }
    
    // 设置官网链接
    const baseUrl = window.location.origin
    websiteUrl.value = `${baseUrl}/t/${id}`
    shareUrl.value = `${baseUrl}/t/${id}?share=1`
    
    // 生成二维码（使用第三方服务）
    qrcodeUrl.value = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(websiteUrl.value)}`
  } catch (err) {
    console.error('加载赛事详情失败:', err)
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

// 清空参赛球队（调用云函数）
async function handleClearTeams() {
  try {
    await ElMessageBox.confirm(
      '确定清空该赛事的所有参赛球队记录吗？\n此操作不可恢复！',
      '警告',
      { type: 'warning', confirmButtonText: '确认清空', cancelButtonText: '取消' }
    )
  } catch (e) {
    return // 用户取消
  }
  try {
    const res = await callFunction('clearTournamentTeams', { tournamentId: id })
    if (res && res.code === 0) {
      ElMessage.success(res.message || '清空成功')
      approvedTeamCount.value = 0
    } else {
      ElMessage.error((res && res.message) || '清空失败')
    }
  } catch (err) {
    console.error('清空参赛球队失败:', err)
    ElMessage.error('清空失败：' + (err.message || '未知错误'))
  }
}

async function deleteTournament() {
  try {
    await ElMessageBox.confirm(
      `确定删除赛事「${tournament.value.name}」吗？此操作不可恢复！`,
      '删除确认',
      { type: 'warning' }
    )
    await deleteRecord('tournaments', id, { cascade: true })
    ElMessage.success('删除成功')
    router.push('/tournaments')
  } catch (err) {
    if (err !== 'cancel') ElMessage.error('删除失败')
  }
}

// AI生成LOGO成功回调
async function handleAISuccess(url) {
  try {

    // 确保URL有效
    if (!url || url.trim() === '') {
      console.error('[赛事LOGO] URL为空，跳过保存')
      ElMessage.warning('图片URL无效，无法保存')
      return
    }

    // 检查id是否有效
    if (!id) {
      console.error('[赛事LOGO] 赛事ID为空:', id)
      ElMessage.warning('赛事ID无效，无法保存')
      return
    }


    // 使用云函数更新（确保权限）
    const res = await callFunction('webBatchUpdate', {
      collection: 'tournaments',
      id: id,
      data: { logo: url, logoUrl: url }
    })


    // 检查云函数返回结果
    if (res && res.success) {
      // 更新本地数据
      tournament.value.logo = url
      tournament.value.logoUrl = url

      // 强制刷新UI
      tournament.value = { ...tournament.value }

      ElMessage.success('赛事LOGO已保存')
    } else {
      console.error('[赛事LOGO] 云函数返回失败:', res)
      ElMessage.error('保存失败: ' + (res?.message || '未知错误'))
    }
  } catch (err) {
    console.error('[赛事LOGO] 更新失败:', err)
    console.error('[赛事LOGO] 错误详情:', err.message, err.stack)
    ElMessage.error('更新失败: ' + (err.message || '未知错误'))
  }
}

// AI生成海报成功回调


// 下载海报


// 重新生成海报



// 滚动到竞赛规程
function scrollToRules() {
  const el = document.getElementById('rules-section')
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

// 查看竞赛规程（通过云函数代理，绕过 CORS）
async function viewRegulations() {
  if (!tournament.value.regulationsUrl) {
    ElMessage.warning('暂无竞赛规程')
    return
  }

  rulesDialogVisible.value = true
  rulesLoading.value = true
  rulesHtmlContent.value = ''

  try {
    // 通过云函数代理获取文件（服务器侧下载，无 CORS 限制）
    const res = await callFunction('getRegulations', {
      fileUrl: tournament.value.regulationsUrl
    })

    if (!res.success) {
      throw new Error(res.message || '云函数调用失败')
    }

    // 将 base64 解码为 ArrayBuffer
    const base64 = res.data
    const binaryString = atob(base64)
    const arrayBuffer = new ArrayBuffer(binaryString.length)
    const uint8Array = new Uint8Array(arrayBuffer)
    for (let i = 0; i < binaryString.length; i++) {
      uint8Array[i] = binaryString.charCodeAt(i)
    }

    // 用 mammoth 解析为 HTML
    const result = await mammoth.convertToHtml({ arrayBuffer })
    rulesHtmlContent.value = result.value

    if (result.messages && result.messages.length > 0) {
    }
  } catch (err) {
    console.error('解析竞赛规程失败:', err)
    ElMessage.error('文档解析失败: ' + (err.message || '未知错误'))
    rulesHtmlContent.value = '<p style="color:#999;text-align:center;padding:40px 0;">文档加载失败，请尝试下载查看</p>'
  } finally {
    rulesLoading.value = false
  }
}

// 下载竞赛规程
async function downloadRegulations() {
  if (!tournament.value.regulationsUrl) {
    ElMessage.warning('暂无竞赛规程')
    return
  }
  const link = document.createElement('a')
  link.href = tournament.value.regulationsUrl
  link.download = tournament.value.regulationsFileName || '竞赛规程'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// 导出竞赛规程为 PDF（调用浏览器打印）
function exportRulesAsPdf() {
  if (!rulesHtmlContent.value || rulesHtmlContent.value.includes('文档加载失败') || rulesHtmlContent.value.includes('无法在线预览')) {
    ElMessage.warning('暂无内容可导出，请先等待文档加载完成')
    return
  }
  // 打开新窗口，写入纯 HTML 内容后打印
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    ElMessage.warning('请允许弹窗，以便导出 PDF')
    return
  }
  const title = tournament.value.regulationsFileName || '竞赛规程'
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>
        body { font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif; line-height: 1.8; color: #333; padding: 40px; max-width: 800px; margin: 0 auto; }
        h1, h2, h3 { color: #212121; }
        p { margin: 8px 0; }
        table { width: 100%; border-collapse: collapse; margin: 12px 0; }
        td, th { border: 1px solid #ddd; padding: 8px 12px; }
        th { background: #f5f5f5; }
        @media print { body { padding: 20px; } }
      </style>
    </head>
    <body>
      <h1 style="text-align:center;margin-bottom:30px;">${title}</h1>
      ${rulesHtmlContent.value}
    </body>
    </html>
  `)
  printWindow.document.close()
  // 等待样式加载后打印
  setTimeout(() => {
    printWindow.print()
  }, 500)
}

// 复制链接
function copyLink(url) {
  if (!url) return
  navigator.clipboard.writeText(url).then(() => {
    ElMessage.success('链接已复制到剪贴板')
  }).catch(() => {
    // 降级方案
    const input = document.createElement('input')
    input.value = url
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    document.body.removeChild(input)
    ElMessage.success('链接已复制到剪贴板')
  })
}

// 下载二维码
function downloadQRCode() {
  if (!qrcodeUrl.value) return
  const link = document.createElement('a')
  link.href = qrcodeUrl.value
  link.download = `${tournament.value.name}_二维码.png`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

onMounted(() => {
  loadTournament()
})
</script>

<style scoped>
.tournament-detail {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.back-bar {
  margin-bottom: 20px;
}

/* Hero卡片 */
.hero-card {
  background: var(--hero-gradient, linear-gradient(135deg, #667eea 0%, #764ba2 100%));
  border-radius: 20px;
  padding: 30px;
  color: #fff;
  margin-bottom: 20px;
}

.hero-content {
  display: flex;
  align-items: center;
  gap: 24px;
  margin-bottom: 24px;
}

.hero-logo {
  width: 100px;
  height: 100px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  flex-shrink: 0;
  position: relative;
}

.hero-logo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 20px;
}

.logo-placeholder {
  font-size: 50px;
}

.hero-logo .ai-logo-btn {
  position: absolute;
  bottom: 4px;
  right: 4px;
  opacity: 0;
  transition: opacity 0.3s;
}

.hero-logo:hover .ai-logo-btn {
  opacity: 1;
}

.hero-info h1 {
  margin: 0 0 12px 0;
  font-size: 28px;
  font-weight: 700;
}

.hero-tags {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.hero-tags .el-tag {
  border: none;
}

.status-tag.registering {
  background: rgba(34, 197, 94, 0.9) !important;
  color: #fff !important;
}

.status-tag.ongoing {
  background: rgba(59, 130, 246, 0.9) !important;
  color: #fff !important;
}

.status-tag.completed {
  background: rgba(107, 114, 128, 0.9) !important;
  color: #fff !important;
}

.hero-desc {
  margin: 0;
  font-size: 14px;
  opacity: 0.9;
  line-height: 1.6;
  max-width: 600px;
}

/* 数据统计 */
.hero-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.stat-item {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  padding: 16px;
  text-align: center;
  backdrop-filter: blur(4px);
}

.stat-value {
  font-size: 32px;
  font-weight: 700;
  line-height: 1;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 13px;
  opacity: 0.85;
}

/* 快捷操作 */
.quick-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

.signup-action {
  border: 2px dashed #67C23A;
  background: #f0f9eb;
}

.signup-action:hover {
  background: #e1f3d8;
}

.signup-tournament-info {
  margin-bottom: 16px;
}

.signup-tournament-info h4 {
  margin: 0 0 8px 0;
  color: #303133;
}

.signup-tournament-info p {
  margin: 0;
  color: #606266;
  font-size: 14px;
}

.action-card {
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.action-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
}

.action-card .el-icon {
  color: #409eff;
  margin-bottom: 8px;
}

.action-card span {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 4px;
}

.action-card em {
  display: block;
  font-style: normal;
  font-size: 13px;
  color: #6b7280;
}

/* 信息区块 */
.info-section {
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.info-section h3 {
  margin: 0 0 20px 0;
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
  display: flex;
  align-items: center;
  gap: 8px;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-item label {
  font-size: 13px;
  color: #6b7280;
}

.info-item span {
  font-size: 15px;
  color: #1f2937;
  font-weight: 500;
}

.rules-content {
  font-size: 14px;
  line-height: 1.8;
  color: #4b5563;
  white-space: pre-wrap;
}

/* AI生成海报 */
.poster-section {
  text-align: center;
  padding: 20px;
}

.poster-desc {
  color: #6b7280;
  margin-bottom: 16px;
  font-size: 14px;
}

.poster-preview {
  margin-top: 20px;
  padding: 20px;
  background: #f9fafb;
  border-radius: 12px;
}

/* 底部操作 */
.detail-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  padding: 20px;
}


/* 赛事官网 */
.website-section {
  display: flex;
  gap: 30px;
  align-items: flex-start;
}

.website-info {
  flex: 1;
}

.link-row {
  display: flex;
  gap: 8px;
}

.qrcode-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.qrcode-box {
  width: 200px;
  height: 200px;
  border: 2px dashed #d9d9d9;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.qrcode-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.qrcode-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #909399;
  font-size: 14px;
}

/* 响应式 */
@media (max-width: 768px) {
  .hero-content {
    flex-direction: column;
    text-align: center;
  }

  .hero-stats {
    grid-template-columns: repeat(2, 1fr);
  }

  .quick-actions {
    grid-template-columns: repeat(2, 1fr);
  }

  .info-grid {
    grid-template-columns: 1fr;
  }

  .detail-actions {
    flex-direction: column;
  }

  .detail-actions .el-button {
    width: 100%;
  }
}

/* 球队报名状态 */
.team-actions {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
}

.signup-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 500;
}

.signup-status.approved {
  background: #f0f9eb;
  color: #67c23a;
}

.signup-status.pending {
  background: #fdf6ec;
  color: #e6a23c;
}

.signup-status.invited {
  background: #ecf5ff;
  color: #409eff;
}

.signup-status.rejected {
  background: #fef0f0;
  color: #f56c6c;
}

.signup-status.closed {
  background: #f4f4f5;
  color: #909399;
}

.signup-action {
  display: flex;
  justify-content: center;
}

/* 竞赛规程文件展示 */
.regulations-file-section {
  margin-bottom: 16px;
}

/* 赛制规则展示 */
.rule-subsection {
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid #e4e7ed;
}

.rule-subsection:last-child {
  border-bottom: none;
  margin-bottom: 0;
}

.rule-subsection h4 {
  margin: 0 0 16px 0;
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.rule-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.rule-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 8px;
}

.rule-item label {
  font-size: 13px;
  color: #909399;
}

.rule-item span {
  font-size: 15px;
  color: #303133;
  font-weight: 500;
}

.rule-extra {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.rule-extra-text {
  font-size: 13px;
  color: #606266;
}

.regulations-file-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: #f5f7fa;
  border-radius: 10px;
  border: 1px solid #e4e7ed;
}

.regulations-file-card .file-icon {
  color: #409eff;
  flex-shrink: 0;
}

.regulations-file-card .file-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.regulations-file-card .file-name {
  font-size: 15px;
  font-weight: 500;
  color: #303133;
}

.regulations-file-card .file-meta {
  font-size: 12px;
  color: #909399;
}

.regulations-file-card .file-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.no-rules {
  padding: 20px 0;
}

/* 竞赛规程弹窗 */
.rules-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
  color: #999;
}

.rules-loading p {
  margin-top: 16px;
  font-size: 14px;
}

.rules-html-content {
  max-height: 60vh;
  overflow-y: auto;
  padding: 0 8px;
  line-height: 1.8;
  color: #333;
}

.rules-html-content :deep(h1),
.rules-html-content :deep(h2),
.rules-html-content :deep(h3) {
  color: #212121;
  margin: 16px 0 8px;
  font-weight: 600;
}

.rules-html-content :deep(p) {
  margin: 8px 0;
}

.rules-html-content :deep(strong) {
  color: #2E7D32;
}

.rules-html-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
}

.rules-html-content :deep(td),
.rules-html-content :deep(th) {
  border: 1px solid #ddd;
  padding: 8px 12px;
  font-size: 14px;
}

.rules-html-content :deep(th) {
  background: #f5f5f5;
  font-weight: 600%;
}

/* 清空参赛球队 - 危险操作红色 */
.action-danger {
  border: 1px solid #F56C6C;
  background: #FEF0F0;
}
.action-danger:hover {
  background: #F56C6C;
  color: #fff;
}
.action-danger .el-icon {
  color: #F56C6C;
}
.action-danger:hover .el-icon {
  color: #fff;
}

</style>
