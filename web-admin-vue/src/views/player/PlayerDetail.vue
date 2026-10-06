<template>
  <div class="player-detail">
    <div class="page-card">
      <!-- 页面头部 -->
      <div class="page-header">
        <div class="header-left">
          <el-button text @click="goBack">
            <el-icon><Back /></el-icon>
          </el-button>
          <h2>球员详情</h2>
        </div>
        <div class="header-right">
          <el-tag v-if="playerData.status === 'active'" type="success" effect="dark">当前使用</el-tag>
        </div>
      </div>

      <div v-loading="loading" class="detail-content">
        <template v-if="playerData._id">
          <!-- 顶部信息区 -->
          <div class="player-header-section">
            <!-- 左侧：头像和基本信息 -->
            <div class="player-basic-info">
              <img 
                v-if="playerAvatarUrl || playerData.photoUrl" 
                :src="playerAvatarUrl || playerData.photoUrl" 
                class="player-header-avatar"
                alt="头像"
              />
              <el-avatar v-else :size="80" class="player-avatar">
                {{ playerData.name ? playerData.name[0] : '?' }}
              </el-avatar>
              <div class="basic-text">
                <h3 class="player-name">{{ playerData.name }}</h3>
                <div class="player-tags">
                  <el-tag size="small" effect="plain">球员</el-tag>
                  <el-tag size="small" type="warning" effect="dark" v-if="playerData.jerseyNumber">
                    #{{ playerData.jerseyNumber }}
                  </el-tag>
                </div>
              </div>
            </div>
          </div>

          <!-- 主要内容区：球员卡 + 详细信息 -->
          <div class="main-content">
            <!-- 左侧：球员卡展示 -->
            <div class="card-section">
              <PlayerCard 
                :player="playerData" 
                :player-card="playerCard"
                :team-logo="teamData.logo || teamData.logoUrl"
              />
            </div>

            <!-- 右侧：详细信息 -->
            <div class="info-section">
              <div class="info-card">
                <h4 class="section-title">基本信息</h4>
                <div class="info-grid">
                  <div class="info-item">
                    <span class="info-label">球员ID</span>
            <span class="info-value"><strong>{{ playerData.playerId || '-' }}</strong></span>
          </div>
          <div class="info-row">
            <span class="info-label">位置</span>
                    <span class="info-value">{{ positionMap[playerData.position] || playerData.position || '-' }}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">球衣名</span>
                    <span class="info-value jersey-name">{{ playerData.jerseyName || jerseyName || '-' }}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">国籍</span>
                    <span class="info-value">{{ playerData.nationality || '中国' }}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">出生年月日</span>
                    <span class="info-value">{{ playerData.birthDate || playerData.birthday || '-' }}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">年龄</span>
                    <span class="info-value">{{ playerAge }}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">身高/体重</span>
                    <span class="info-value">{{ playerData.height || '-' }} / {{ playerData.weight || '-' }} kg</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">籍贯</span>
                    <span class="info-value">{{ playerData.nativePlace || '-' }}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">所属球队</span>
                    <span class="info-value team-name" @click="goToTeam">{{ teamData.name || '-' }}</span>
                  </div>
                </div>
              </div>

              <div class="info-card">
                <h4 class="section-title">{{ route.params.playerId ? '本届表现' : '球员历史' }}</h4><p v-if="statisticsMessage">{{ statisticsMessage }}</p>
                <div class="stats-grid">
                  <div class="stat-item">
                    <div class="stat-value">{{ metric(statistics.appearances) }}</div>
                    <div class="stat-label">参赛场次</div>
                  </div>
                  <div class="stat-item">
                    <div class="stat-value">{{ metric(statistics.minutesPlayed) }}</div>
                    <div class="stat-label">出场分钟</div>
                  </div>
                  <div class="stat-item">
                    <div class="stat-value">{{ metric(statistics.goals) }}</div>
                    <div class="stat-label">进球数</div>
                  </div>
                  <div class="stat-item">
                    <div class="stat-value">{{ metric(statistics.assists) }}</div>
                    <div class="stat-label">助攻数</div>
                  </div>
                </div>
              </div>

              <!-- 卡片升级进度 -->
              <div class="info-card">
                <h4 class="section-title">卡片等级 <el-button text :loading="statisticsLoading" @click="refreshStatistics">刷新统计</el-button></h4>
                <div class="level-progress">
                  <div class="level-info">
                    <span class="current-level">{{ currentLevelText }} · {{ cardPointsText }} 分</span>
                    <span v-if="nextLevelText" class="next-level">下一级：{{ nextLevelText }}</span>
                  </div>
                  <el-progress v-if="playerCard.status === 'ready' && playerCard.progress && nextLevelText"
                    :percentage="levelProgress" 
                    :color="levelColor"
                    :stroke-width="12"
                    striped
                    striped-flow
                  />
                  <div class="progress-hint">
                    {{ progressHint }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 底部操作按钮 -->
          <div class="action-buttons">
            <el-button type="primary" size="large" @click="editPlayer">
              <el-icon><Edit /></el-icon>补充资料
            </el-button>
            <el-button type="warning" size="large" @click="previewCard">
              <el-icon><View /></el-icon>预览
            </el-button>
          </div>

          <!-- 创建身份卡按钮 -->
          <div class="create-card-section">
            <el-button type="success" size="large" class="create-card-btn" @click="createIdentityCard">
              <el-icon><Plus /></el-icon>创建身份卡
            </el-button>
          </div>
        </template>

        <el-empty v-else description="球员不存在或已删除" />
      </div>
    </div>

    <!-- 编辑对话框 -->
    <el-dialog v-model="showEditDialog" title="编辑球员" width="600px" :close-on-click-modal="false">
      <el-form :model="editForm" label-width="100px">
        <!-- 头像上传区域 -->
        <el-form-item label="球员头像">
          <div class="avatar-upload-section">
            <div class="current-avatar">
              <img 
                v-if="editForm.photoUrl || editForm.photoPreview" 
                :src="editForm.photoPreview || editForm.photoUrl" 
                class="player-avatar-img"
                alt="球员头像"
              />
              <el-avatar v-else :size="80" class="player-avatar">
                {{ editForm.name ? editForm.name[0] : '?' }}
              </el-avatar>
              <span class="avatar-label">当前头像</span>
            </div>
            <div class="avatar-actions">
              <RemoveBgProcessor
                type="playerAvatar"
                buttonText="上传并抠图"
                buttonType="primary"
                @success="handleAvatarSuccess"
                @error="handleAvatarError"
              />
              <el-text type="info" size="small">
                支持 JPG、PNG 格式，建议上传半身照
              </el-text>
            </div>
          </div>
        </el-form-item>
        
        <el-form-item label="球员姓名">
          <el-input v-model="editForm.name" disabled />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="身高(cm)">
              <el-input-number v-model="editForm.height" :min="100" :max="250" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="体重(kg)">
              <el-input-number v-model="editForm.weight" :min="30" :max="150" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="savePlayer">保存</el-button>
      </template>
    </el-dialog>

    <!-- 预览对话框 -->
    <el-dialog v-model="showPreviewDialog" title="球员卡预览" width="400px" center>
      <div class="preview-container">
        <PlayerCard 
          :player="playerData" 
          :player-card="playerCard"
          :team-logo="teamData.logo || teamData.logoUrl"
        />
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Back, Edit, View, Plus, Upload } from '@element-plus/icons-vue'
import { queryList, updateRecord, callFunction, getPlayerReadIdentity } from '../../utils/cloud'
import { getTempFileURL } from '../../utils/upload'
import PlayerCard from '../../components/player/PlayerCard.vue'
import RemoveBgProcessor from '../../components/common/RemoveBgProcessor.vue'
import { useReadCacheRefresh } from '../../utils/useReadCacheRefresh.js'

const router = useRouter()
const route = useRoute()

const loading = ref(false)
const saving = ref(false)
const playerData = ref({})
const teamData = ref({})
const statistics = ref({})
const playerCard = ref({ status:'unverified', points:null, tier:null })
const statisticsMessage = ref('')
const statisticsLoading = ref(false)
let statisticsRequest = 0
let profileRequest = 0
function metric(value) { return typeof value === 'number' && Number.isFinite(value) ? value : '—' }
const playerAvatarUrl = ref('')
const showEditDialog = ref(false)
const showPreviewDialog = ref(false)

const editForm = ref({
  name: '',
  height: null,
  weight: null,
  photoUrl: '',
  photoPreview: '',
  photoFileID: ''
})

const positionMap = {
  GK: '守门员',
  DF: '后卫',
  MF: '前卫',
  FW: '前锋'
}

const playerAge = computed(() => {
  const raw = playerData.value.birthDate || playerData.value.birthday
  if (!raw) return '-'
  const birth = new Date(raw)
  if (Number.isNaN(birth.getTime())) return '-'
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const beforeBirthday = today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  if (beforeBirthday) age -= 1
  return age >= 0 ? String(age) : '-'
})

// 计算球衣名（根据规则：二字姓名取姓全拼+名首字母，三字姓名取姓全拼+名首字母+名首字母）
const jerseyName = computed(() => {
  const name = playerData.value.name
  if (!name || name.length < 2) return name?.toUpperCase() || ''
  
  // 简单的拼音映射
  const pinyinMap = {
    '郑': 'ZHENG', '旭': 'XU', '升': 'SHENG',
    '李': 'LI', '王': 'WANG', '张': 'ZHANG', '刘': 'LIU',
    '陈': 'CHEN', '杨': 'YANG', '赵': 'ZHAO', '黄': 'HUANG',
    '周': 'ZHOU', '吴': 'WU', '徐': 'XU', '孙': 'SUN',
    '马': 'MA', '朱': 'ZHU', '胡': 'HU', '郭': 'GUO',
    '林': 'LIN', '何': 'HE', '高': 'GAO', '罗': 'LUO'
  }
  
  if (name.length === 2) {
    // 二字姓名：姓全拼 + 名首字母
    const surname = pinyinMap[name[0]] || name[0]
    const givenName = pinyinMap[name[1]] ? pinyinMap[name[1]][0] : name[1]
    return (surname + '.' + givenName).substring(0, 10)
  } else {
    // 三字及以上：姓全拼 + 名1首字母 + 名2首字母
    const surname = pinyinMap[name[0]] || name[0]
    const given1 = pinyinMap[name[1]] ? pinyinMap[name[1]][0] : name[1]
    const given2 = pinyinMap[name[2]] ? pinyinMap[name[2]][0] : name[2]
    return (surname + '.' + given1 + given2).substring(0, 10)
  }
})

// 当前等级文本
const currentLevelText = computed(() => {
  return playerCard.value.status === 'ready' ? ({ bronze:'铜卡', silver:'银卡', gold:'金卡' }[playerCard.value.tier] || '待核定') : '待核定'
})

// 下一级文本
const nextLevelText = computed(() => {
  return playerCard.value.status === 'ready' ? ({ bronze:'银卡', silver:'金卡' }[playerCard.value.tier] || '') : ''
})
const cardPointsText = computed(() => playerCard.value.status === 'ready' ? playerCard.value.points : '—')

// 等级进度百分比
const levelProgress = computed(() => playerCard.value.progress?.percent ?? 0)

// 进度条颜色
const levelColor = computed(() => {
  return ({ gold:'#D2A748', silver:'#8D99A4', bronze:'#A76C45' })[playerCard.value.tier] || '#8D99A4'
})

// 进度提示
const progressHint = computed(() => {
  const score = playerCard.value
  if (score.status === 'request_failed') return '等级暂时读取失败，请刷新重试'
  if (score.status === 'not_connected') return '等级统计接口待接入'
  if (score.status === 'loading') return '正在读取生涯积分'
  if (score.status !== 'ready') {
    if (score.reasonCodes?.some(code => code.startsWith('MATCH_DURATION_'))) return '比赛时长来源待核对，升级进度待核定'
    if (score.reasonCodes?.includes('PLAYER_CARD_SUPPORT_UNVERIFIED')) return '应援数据待核定，升级进度待核定'
    return '生涯比赛记录待核定'
  }
  if (!score.progress) return '升级进度接口待接入'
  return score.progress.nextAt == null ? '已达金卡，可更换照片和背景' : `距${nextLevelText.value}还差 ${score.progress.pointsToNext} 分`
})

function goBack() {
  router.back()
}

function goToTeam() {
  const tournamentId = String(route.params.id || route.query.fromTournament || '')
  const teamId = String(route.query.teamId || playerData.value.teamId || playerData.value.teamCode || '')
  if (tournamentId && teamId) {
    router.push({ path: `/tournaments/${tournamentId}/teams/${teamId}`, query: { divisionId: route.query.divisionId || '' } })
  }
}

function editPlayer() {
  editForm.value = {
    name: playerData.value.name || '',
    height: playerData.value.height || null,
    weight: playerData.value.weight || null,
    photoUrl: playerData.value.photoUrl || '',
    photoPreview: '',
    photoFileID: ''
  }
  showEditDialog.value = true
}

// 头像上传成功
function handleAvatarSuccess(data) {
  editForm.value.photoUrl = data.url
  editForm.value.photoPreview = data.previewUrl
  editForm.value.photoFileID = data.fileID
  ElMessage.success('头像已生成，请点击保存按钮保存更改')
}

// 头像上传失败
function handleAvatarError(error) {
  ElMessage.error('头像上传失败: ' + error)
}

async function savePlayer() {
  saving.value = true
  try {
    // 如果有新的头像上传，使用 fileID 保存到数据库
    const photoUrlToSave = editForm.value.photoFileID || editForm.value.photoUrl
    
    await updateRecord('players', playerData.value._id, {
      height: editForm.value.height,
      weight: editForm.value.weight,
      photoUrl: photoUrlToSave
    })

    // 更新本地数据
    playerData.value.height = editForm.value.height
    playerData.value.weight = editForm.value.weight
    
    // 如果有新头像，使用预览 URL 立即显示；否则使用保存的 URL
    if (editForm.value.photoPreview) {
      playerData.value.photoUrl = editForm.value.photoPreview
    } else {
      playerData.value.photoUrl = photoUrlToSave
    }

    ElMessage.success('保存成功')
    showEditDialog.value = false
  } catch (err) {
    ElMessage.error('保存失败: ' + err.message)
  } finally {
    saving.value = false
  }
}

function previewCard() {
  showPreviewDialog.value = true
}

function createIdentityCard() {
  ElMessage.info('身份卡功能开发中...')
}

async function refreshStatistics() {
  const playerId = String(route.params.playerId || route.params.id || '')
  if (!playerId || statisticsLoading.value) return
  const request = ++statisticsRequest
  const identity = getPlayerReadIdentity()
  statisticsLoading.value = true
  try {
    const scope = route.params.playerId ? {tournamentId:String(route.params.id),...(route.query.teamId ? {teamId:String(route.query.teamId)} : {}),...(route.query.divisionId ? {divisionId:String(route.query.divisionId)} : {})} : {}
    const result = await callFunction('dataCenter',{action:'playerDetail',playerId,scope})
    if (!result.success || !result.statistics || !result.playerCard) throw Object.assign(new Error(result.error || '统计加载失败'),{code:result.code})
    if (request !== statisticsRequest || identity !== getPlayerReadIdentity()) return
    statistics.value = result.statistics.playerTotal?.metrics || {}
    playerCard.value = result.playerCard
    statisticsMessage.value = result.statistics.coverage?.status === 'complete' ? '' : '部分比赛记录不完整，“—”表示未知。'
  } catch (error) {
    if (request !== statisticsRequest || identity !== getPlayerReadIdentity()) return
    statistics.value = {}
    playerCard.value = {status:error.code === 'DATA_ACTION_INVALID' ? 'not_connected' : 'request_failed',points:null,tier:null,progress:null}
    statisticsMessage.value = '统计暂不可用，请刷新重试。'
  } finally { if (request === statisticsRequest) statisticsLoading.value = false }
}
function refreshOnVisibility() { if (document.visibilityState === 'visible') refreshStatistics() }

async function loadPlayerData() {
  const request = ++profileRequest
  const identity = getPlayerReadIdentity()
  const current = () => request === profileRequest && identity === getPlayerReadIdentity()
  const playerId = route.params.playerId || route.params.id
  if (!playerId) {
    ElMessage.error('球员ID不存在')
    return
  }

  loading.value = true
  try {
    // 查询球员数据
    const players = await queryList('players', {
      where: { _id: playerId }
    })
    if (!current()) return
    
    if (players && players.length > 0) {
      playerData.value = players[0]
      await refreshStatistics()
      if (!current()) return

      // 处理头像URL（如果是云存储fileID，获取临时URL）
      if (playerData.value.photoUrl && playerData.value.photoUrl.startsWith('cloud://')) {
        try {
          const result = await getTempFileURL(playerData.value.photoUrl)
          if (current() && result.success && result.url) {
            playerAvatarUrl.value = result.url
          }
        } catch (err) {
          console.error('获取头像临时URL失败:', err)
        }
      }
      
      // 加载球队数据
      const relatedTeamId = (route.params.playerId ? route.query.teamId : '') || playerData.value.teamId || playerData.value.teamCode
      if (relatedTeamId) {
        const teams = await queryList('teams', {
          where: { _id: String(relatedTeamId) }
        })
        if (!current()) return
        if (teams && teams.length > 0) {
          teamData.value = teams[0]
        }
      }
    } else {
      ElMessage.error('球员不存在')
    }
  } catch (err) {
    if (!current()) return
    console.error('加载球员数据失败:', err)
    ElMessage.error('加载失败')
  } finally {
    if (current()) loading.value = false
  }
}

useReadCacheRefresh({
  tags: ['players', 'statistics'],
  refresh: loadPlayerData,
  clear: () => {
    ++statisticsRequest
    ++profileRequest
    statisticsLoading.value = false
    loading.value = false
    playerData.value = {}
    teamData.value = {}
    playerAvatarUrl.value = ''
    statistics.value = {}
    playerCard.value = { status: 'unverified', points: null, tier: null }
    statisticsMessage.value = '数据暂不可用，请重新加载。'
  },
  onError: () => { statisticsMessage.value = '数据更新失败，请重试。' }
})
onMounted(() => {
  loadPlayerData()
  document.addEventListener('visibilitychange',refreshOnVisibility)
  window.addEventListener('focus',refreshStatistics)
})
watch(() => route.fullPath,() => {
  ++profileRequest
  ++statisticsRequest; statisticsLoading.value = false
  statistics.value = {}; playerCard.value = {status:'loading',points:null,tier:null}
  loadPlayerData()
})
onUnmounted(() => {
  ++profileRequest
  ++statisticsRequest
  document.removeEventListener('visibilitychange',refreshOnVisibility)
  window.removeEventListener('focus',refreshStatistics)
})
</script>

<style scoped>
.player-detail {
  padding: 20px;
}

.page-card {
  background: white;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid #ebeef5;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-left h2 {
  margin: 0;
  font-size: 20px;
  color: #303133;
}

/* 顶部信息区 */
.player-header-section {
  margin-bottom: 24px;
}

.player-basic-info {
  display: flex;
  align-items: center;
  gap: 16px;
}

.player-avatar {
  border: 3px solid #e4e7ed;
}

.player-header-avatar {
  width: 60px;
  height: 80px;
  object-fit: contain;
  border-radius: 4px;
  background-color: transparent;
  display: block;
}

.basic-text {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.player-name {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #303133;
}

.player-tags {
  display: flex;
  gap: 8px;
}

/* 主要内容区 */
.main-content {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 32px;
  margin-bottom: 24px;
}

.card-section {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border-radius: 16px;
  padding: 24px;
}

.info-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.info-card {
  background: #f5f7fa;
  border-radius: 12px;
  padding: 20px;
}

.section-title {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

/* 信息网格 */
.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px dashed #dcdfe6;
}

.info-item:last-child {
  border-bottom: none;
}

.info-label {
  color: #909399;
  font-size: 14px;
}

.info-value {
  color: #303133;
  font-size: 14px;
  font-weight: 500;
}

.jersey-name {
  color: #303133;
  font-weight: 500;
}

.team-name {
  color: #303133;
  font-weight: 500;
  cursor: pointer;
}

.team-name:hover {
  color: #409eff;
}

/* 统计网格 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.stat-item {
  text-align: center;
  padding: 16px;
  background: white;
  border-radius: 8px;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #2E7D32;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 12px;
  color: #909399;
}

/* 等级进度 */
.level-progress {
  background: white;
  border-radius: 8px;
  padding: 16px;
}

.level-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
}

.current-level {
  font-weight: 600;
  color: #303133;
}

.next-level {
  color: #909399;
}

.progress-hint {
  margin-top: 12px;
  text-align: center;
  color: #606266;
  font-size: 13px;
}

/* 操作按钮 */
.action-buttons {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-bottom: 24px;
}

.action-buttons .el-button {
  min-width: 140px;
}

/* 创建身份卡 */
.create-card-section {
  display: flex;
  justify-content: center;
}

.create-card-btn {
  min-width: 200px;
  background: linear-gradient(135deg, #43A047, #2E7D32);
  border: none;
}

/* 预览容器 */
.preview-container {
  display: flex;
  justify-content: center;
  padding: 20px;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border-radius: 12px;
}

/* 头像上传区域 */
.avatar-upload-section {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 12px;
}

.current-avatar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.player-avatar-img {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid #e4e7ed;
}

.avatar-label {
  font-size: 12px;
  color: #909399;
}

.avatar-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 响应式 */
@media (max-width: 900px) {
  .main-content {
    grid-template-columns: 1fr;
  }

  .info-grid {
    grid-template-columns: 1fr;
  }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .avatar-upload-section {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
