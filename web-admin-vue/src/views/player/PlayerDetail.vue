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
                <h4 class="section-title">参赛统计</h4>
                <div class="stats-grid">
                  <div class="stat-item">
                    <div class="stat-value">{{ playerData.appearances || 0 }}</div>
                    <div class="stat-label">参赛场次</div>
                  </div>
                  <div class="stat-item">
                    <div class="stat-value">{{ playerData.points || 0 }}</div>
                    <div class="stat-label">参与积分</div>
                  </div>
                  <div class="stat-item">
                    <div class="stat-value">{{ playerData.goals || 0 }}</div>
                    <div class="stat-label">进球数</div>
                  </div>
                  <div class="stat-item">
                    <div class="stat-value">{{ playerData.assists || 0 }}</div>
                    <div class="stat-label">助攻数</div>
                  </div>
                </div>
              </div>

              <!-- 卡片升级进度 -->
              <div class="info-card">
                <h4 class="section-title">卡片等级</h4>
                <div class="level-progress">
                  <div class="level-info">
                    <span class="current-level">当前: {{ currentLevelText }}</span>
                    <span v-if="nextLevelText" class="next-level">下一级: {{ nextLevelText }}</span>
                  </div>
                  <el-progress 
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
              <el-icon><Edit /></el-icon>编辑
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
        <el-form-item label="参赛场次">
          <el-input-number v-model="editForm.appearances" :min="0" :max="999" />
        </el-form-item>
        <el-form-item label="参与积分">
          <el-input-number v-model="editForm.points" :min="0" :max="9999" />
        </el-form-item>
        <el-form-item label="进球数">
          <el-input-number v-model="editForm.goals" :min="0" :max="999" />
        </el-form-item>
        <el-form-item label="助攻数">
          <el-input-number v-model="editForm.assists" :min="0" :max="999" />
        </el-form-item>
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
          :team-logo="teamData.logo || teamData.logoUrl"
        />
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Back, Edit, View, Plus, Upload } from '@element-plus/icons-vue'
import { queryList, updateRecord } from '../../utils/cloud'
import { getTempFileURL } from '../../utils/upload'
import PlayerCard from '../../components/player/PlayerCard.vue'
import RemoveBgProcessor from '../../components/common/RemoveBgProcessor.vue'

const router = useRouter()
const route = useRoute()

const loading = ref(false)
const saving = ref(false)
const playerData = ref({})
const teamData = ref({})
const playerAvatarUrl = ref('')
const showEditDialog = ref(false)
const showPreviewDialog = ref(false)

const editForm = ref({
  name: '',
  height: null,
  weight: null,
  appearances: 0,
  points: 0,
  goals: 0,
  assists: 0,
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
  const appearances = playerData.value.appearances || 0
  if (appearances >= 20) return '金卡'
  if (appearances >= 10) return '银卡'
  return '铜卡'
})

// 下一级文本
const nextLevelText = computed(() => {
  const appearances = playerData.value.appearances || 0
  if (appearances < 10) return '银卡'
  if (appearances < 20) return '金卡'
  return ''
})

// 等级进度百分比
const levelProgress = computed(() => {
  const appearances = playerData.value.appearances || 0
  if (appearances >= 20) return 100
  if (appearances >= 10) {
    // 银卡阶段：10-20场
    return ((appearances - 10) / 10) * 100
  }
  // 铜卡阶段：0-10场
  return (appearances / 10) * 100
})

// 进度条颜色
const levelColor = computed(() => {
  const appearances = playerData.value.appearances || 0
  if (appearances >= 20) return '#FFD700'
  if (appearances >= 10) return '#C0C0C0'
  return '#CD7F32'
})

// 进度提示
const progressHint = computed(() => {
  const appearances = playerData.value.appearances || 0
  if (appearances >= 20) {
    return '恭喜！已达到最高等级金卡'
  }
  if (appearances >= 10) {
    const need = 20 - appearances
    return `再参赛 ${need} 场即可升级为金卡`
  }
  const need = 10 - appearances
  return `再参赛 ${need} 场即可升级为银卡`
})

function goBack() {
  router.back()
}

function goToTeam() {
  if (playerData.value.teamCode) {
    router.push('/teams/' + playerData.value.teamCode)
  }
}

function editPlayer() {
  editForm.value = {
    name: playerData.value.name || '',
    height: playerData.value.height || null,
    weight: playerData.value.weight || null,
    appearances: playerData.value.appearances || 0,
    points: playerData.value.points || 0,
    goals: playerData.value.goals || 0,
    assists: playerData.value.assists || 0,
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
      appearances: editForm.value.appearances,
      points: editForm.value.points,
      goals: editForm.value.goals,
      assists: editForm.value.assists,
      photoUrl: photoUrlToSave
    })

    // 更新本地数据
    playerData.value.height = editForm.value.height
    playerData.value.weight = editForm.value.weight
    playerData.value.appearances = editForm.value.appearances
    playerData.value.points = editForm.value.points
    playerData.value.goals = editForm.value.goals
    playerData.value.assists = editForm.value.assists
    
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

async function loadPlayerData() {
  const playerId = route.params.id
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
    
    if (players && players.length > 0) {
      playerData.value = players[0]
      
      // 处理头像URL（如果是云存储fileID，获取临时URL）
      if (playerData.value.photoUrl && playerData.value.photoUrl.startsWith('cloud://')) {
        try {
          const result = await getTempFileURL(playerData.value.photoUrl)
          if (result.success && result.url) {
            playerAvatarUrl.value = result.url
          }
        } catch (err) {
          console.error('获取头像临时URL失败:', err)
        }
      }
      
      // 加载球队数据
      if (playerData.value.teamCode) {
        const teams = await queryList('teams', {
          where: { _id: playerData.value.teamCode }
        })
        if (teams && teams.length > 0) {
          teamData.value = teams[0]
        }
      }
    } else {
      ElMessage.error('球员不存在')
    }
  } catch (err) {
    console.error('加载球员数据失败:', err)
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadPlayerData()
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
