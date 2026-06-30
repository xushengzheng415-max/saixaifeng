<template>
  <div class="player-management">
    <!-- 操作栏 -->
    <div class="section-header">
      <h3>球员管理</h3>
      <div class="header-actions">
        <el-select v-model="filterTeam" placeholder="筛选球队" clearable style="width: 200px; margin-right: 12px;">
          <el-option v-for="team in teams" :key="team._id || team.id" :label="team.name" :value="team._id || team.id" />
        </el-select>
        <el-input
          v-model="searchKeyword"
          placeholder="搜索球员姓名/身份证号"
          prefix-icon="Search"
          clearable
          style="width: 250px; margin-right: 12px;"
          @input="handleSearch"
        />
        <el-button type="primary" @click="showPlayerDialog()">
          <el-icon><Plus /></el-icon>添加球员
        </el-button>
      </div>
    </div>

    <!-- 统计信息 -->
    <div class="stats-bar">
      <span>总球员数: <strong>{{ totalPlayers }}</strong></span>
      <span>已认证: <strong>{{ verifiedPlayers }}</strong></span>
      <span>未认证: <strong>{{ unverifiedPlayers }}</strong></span>
    </div>

    <!-- 球员表格 -->
    <el-table :data="filteredPlayers" v-loading="loading" border style="width: 100%">
      <el-table-column type="index" width="60" label="序号" />
      <el-table-column label="头像" width="70">
        <template #default="{ row }">
          <img :src="row.photoUrl || '/default-player.png'" class="player-avatar-small" />
        </template>
      </el-table-column>
      <el-table-column prop="name" label="姓名" width="100" />
      <el-table-column prop="jerseyNumber" label="号码" width="60" align="center" />
      <el-table-column prop="position" label="位置" width="80">
        <template #default="{ row }">
          <el-tag size="small">{{ formatPosition(row.position) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="teamName" label="所属球队" min-width="120" />
      <el-table-column prop="idCard" label="身份证号" width="160" />
      <el-table-column label="年龄" width="60" align="center">
        <template #default="{ row }">
          {{ row.birthDate ? calculateAge(row.birthDate) : '-' }}
        </template>
      </el-table-column>
      <el-table-column label="认证状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.isVerified ? 'success' : 'info'">
            {{ row.isVerified ? '已认证' : '未认证' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="creatorPhone" label="创建人" width="130" />
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" link @click="viewPlayerDetail(row)">查看</el-button>
          <el-button type="primary" link @click="showPlayerDialog(row)">编辑</el-button>
          <el-button type="danger" link @click="deletePlayer(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div class="pagination-wrapper">
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="filteredPlayers.length"
        layout="total, prev, pager, next"
        @current-change="handlePageChange"
      />
    </div>

    <!-- 球员表单弹窗 -->
    <el-dialog v-model="dialogVisible" :title="playerForm.id ? '编辑球员' : '添加球员'" width="700px">
      <el-form :model="playerForm" label-width="100px">
        <el-form-item label="所属球队" required>
          <el-select v-model="playerForm.teamId" style="width: 100%;" placeholder="请选择球队">
            <el-option v-for="team in teams" :key="team._id || team.id" :label="team.name" :value="team._id || team.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="球员姓名" required>
          <el-input v-model="playerForm.name" placeholder="请输入球员姓名" />
        </el-form-item>
        <el-form-item label="球衣号码">
          <el-input-number v-model="playerForm.jerseyNumber" :min="0" :max="99" />
        </el-form-item>
        <el-form-item label="位置">
          <el-select v-model="playerForm.position" style="width: 100%;" placeholder="请选择位置">
            <el-option label="前锋" value="forward" />
            <el-option label="中场" value="midfielder" />
            <el-option label="后卫" value="defender" />
            <el-option label="守门员" value="goalkeeper" />
          </el-select>
        </el-form-item>
        <el-form-item label="头像">
          <el-upload
            class="avatar-uploader"
            action="#"
            :auto-upload="false"
            :on-change="handleAvatarChange"
            :show-file-list="false"
          >
            <img v-if="playerForm.photoUrl" :src="playerForm.photoUrl" class="uploaded-avatar" />
            <div v-else class="upload-placeholder">
              <el-icon><Plus /></el-icon>
              <span>上传头像</span>
            </div>
          </el-upload>
        </el-form-item>
        <el-form-item label="身份证号">
          <el-input v-model="playerForm.idCard" placeholder="请输入身份证号" @blur="parseIdCard" />
          <div class="form-tip">输入后自动解析出生日期、性别、籍贯</div>
        </el-form-item>
        <el-form-item label="出生日期">
          <el-date-picker v-model="playerForm.birthDate" type="date" placeholder="自动解析" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="性别">
          <el-radio-group v-model="playerForm.gender">
            <el-radio label="male">男</el-radio>
            <el-radio label="female">女</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="联系电话">
          <el-input v-model="playerForm.phone" placeholder="请输入联系电话" />
        </el-form-item>
        <el-form-item label="认证状态">
          <el-switch v-model="playerForm.isVerified" active-text="已认证" inactive-text="未认证" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="savePlayer" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <!-- 球员详情弹窗 -->
    <el-dialog v-model="detailVisible" title="球员详情" width="600px">
      <div v-if="currentPlayer" class="player-detail">
        <div class="detail-header">
          <img :src="currentPlayer.photoUrl || '/default-player.png'" class="detail-avatar" />
          <div class="detail-info">
            <h2>{{ currentPlayer.name }}</h2>
            <p>球员ID: {{ currentPlayer.playerId }}</p>
            <p>号码: {{ currentPlayer.jerseyNumber || '未设置' }}</p>
            <p>位置: {{ formatPosition(currentPlayer.position) }}</p>
          </div>
        </div>
        <div class="detail-body">
          <p><strong>所属球队:</strong> {{ currentPlayer.teamName }}</p>
          <p><strong>身份证号:</strong> {{ currentPlayer.idCard || '未设置' }}</p>
          <p><strong>出生日期:</strong> {{ currentPlayer.birthDate || '未设置' }}</p>
          <p><strong>性别:</strong> {{ currentPlayer.gender === 'male' ? '男' : '女' }}</p>
          <p><strong>联系电话:</strong> {{ currentPlayer.phone || '未设置' }}</p>
          <p><strong>认证状态:</strong> 
            <el-tag :type="currentPlayer.isVerified ? 'success' : 'info'" size="small">
              {{ currentPlayer.isVerified ? '已认证' : '未认证' }}
            </el-tag>
          </p>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'
import { callFunction } from '@/utils/cloud'

// 数据列表
const players = ref([])
const teams = ref([])
const loading = ref(false)
const saving = ref(false)
const searchKeyword = ref('')
const filterTeam = ref('')
const currentPage = ref(1)
const pageSize = ref(10)

// 统计
const totalPlayers = ref(0)
const verifiedPlayers = ref(0)
const unverifiedPlayers = ref(0)

// 弹窗
const dialogVisible = ref(false)
const detailVisible = ref(false)
const currentPlayer = ref(null)

// 表单
const playerForm = reactive({
  id: null,
  teamId: '',
  name: '',
  jerseyNumber: null,
  position: '',
  photoUrl: '',
  idCard: '',
  birthDate: '',
  gender: 'male',
  phone: '',
  isVerified: false,
  creatorPhone: ''
})

// 过滤后的球员列表
const filteredPlayers = computed(() => {
  let result = players.value
  
  // 按球队筛选
  if (filterTeam.value) {
    result = result.filter(p => (p.teamId === filterTeam.value))
  }
  
  // 按关键词搜索
  if (searchKeyword.value) {
    const keyword = searchKeyword.value.toLowerCase()
    result = result.filter(p => 
      p.name?.toLowerCase().includes(keyword) ||
      p.idCard?.toLowerCase().includes(keyword) ||
      p.playerId?.toLowerCase().includes(keyword)
    )
  }
  
  return result
})

// 获取球员列表
async function fetchPlayers() {
  loading.value = true
  try {
    const result = await callFunction('getPlayers', {
      pageSize: 1000 // 获取所有球员
    })
    if (result.success) {
      players.value = result.data || []
      totalPlayers.value = players.value.length
      verifiedPlayers.value = players.value.filter(p => p.isVerified).length
      unverifiedPlayers.value = players.value.filter(p => !p.isVerified).length
      
      // 补充球队名称
      players.value.forEach(player => {
        const team = teams.value.find(t => (t._id || t.id) === player.teamId)
        if (team) {
          player.teamName = team.name
        }
      })
    } else {
      // 云函数不存在或返回空时优雅降级，不弹错误提示
      console.warn('获取球员列表返回失败:', result.message)
      players.value = []
      totalPlayers.value = 0
      verifiedPlayers.value = 0
      unverifiedPlayers.value = 0
    }
  } catch (err) {
    // 云函数调用失败时优雅降级，不弹错误提示
    console.warn('获取球员列表失败:', err.message)
    players.value = []
    totalPlayers.value = 0
    verifiedPlayers.value = 0
    unverifiedPlayers.value = 0
  } finally {
    loading.value = false
  }
}

// 获取球队列表
async function fetchTeams() {
  try {
    const result = await callFunction('getTeams', {
      pageSize: 1000
    })
    if (result.success) {
      teams.value = result.data || []
    }
  } catch (err) {
    console.error('获取球队列表失败:', err)
  }
}

// 搜索
function handleSearch() {
  currentPage.value = 1
}

// 翻页
function handlePageChange(page) {
  currentPage.value = page
}

// 显示表单弹窗
function showPlayerDialog(player = null) {
  if (player) {
    Object.assign(playerForm, {
      id: null,
      teamId: '',
      name: '',
      jerseyNumber: null,
      position: '',
      photoUrl: '',
      idCard: '',
      birthDate: '',
      gender: 'male',
      phone: '',
      isVerified: false,
      creatorPhone: ''
    })
    Object.assign(playerForm, player)
  } else {
    Object.assign(playerForm, {
      id: null,
      teamId: '',
      name: '',
      jerseyNumber: null,
      position: '',
      photoUrl: '',
      idCard: '',
      birthDate: '',
      gender: 'male',
      phone: '',
      isVerified: false,
      creatorPhone: ''
    })
  }
  dialogVisible.value = true
}

// 处理头像上传
function handleAvatarChange(file) {
  const reader = new FileReader()
  reader.readAsDataURL(file.raw)
  reader.onload = () => {
    playerForm.photoUrl = reader.result
  }
}

// 解析身份证号
function parseIdCard() {
  if (!playerForm.idCard || playerForm.idCard.length < 15) return
  
  // 简单的身份证解析逻辑
  const idCard = playerForm.idCard
  if (idCard.length === 18 || idCard.length === 15) {
    // 提取出生日期
    let birthDateStr = ''
    if (idCard.length === 18) {
      birthDateStr = idCard.substring(6, 14)
    } else {
      birthDateStr = '19' + idCard.substring(6, 12)
    }
    
    if (birthDateStr.length === 8) {
      const year = birthDateStr.substring(0, 4)
      const month = birthDateStr.substring(4, 6)
      const day = birthDateStr.substring(6, 8)
      playerForm.birthDate = `${year}-${month}-${day}`
    }
    
    // 提取性别（第17位，奇数为男，偶数为女）
    const genderCode = idCard.length === 18 ? parseInt(idCard.charAt(16)) : parseInt(idCard.charAt(14))
    playerForm.gender = genderCode % 2 === 1 ? 'male' : 'female'
  }
}

// 计算年龄
function calculateAge(birthDate) {
  if (!birthDate) return '-'
  const today = new Date()
  const birth = new Date(birthDate)
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--
  }
  return age
}

// 格式化位置
function formatPosition(position) {
  const map = {
    'forward': '前锋',
    'midfielder': '中场',
    'defender': '后卫',
    'goalkeeper': '守门员'
  }
  return map[position] || position || '-'
}

// 保存球员
async function savePlayer() {
  if (!playerForm.name) {
    ElMessage.error('请输入球员姓名')
    return
  }
  if (!playerForm.teamId) {
    ElMessage.error('请选择所属球队')
    return
  }
  saving.value = true
  try {
    // 自动设置创建人手机号
    playerForm.creatorPhone = localStorage.getItem('tc_phone') || ''
    const data = { ...playerForm }
    if (data.id) {
      await callFunction('updatePlayer', data)
      ElMessage.success('更新成功')
    } else {
      await callFunction('createPlayer', data)
      ElMessage.success('添加成功')
    }
    dialogVisible.value = false
    fetchPlayers()
  } catch (err) {
    console.error('保存球员失败:', err)
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

// 查看球员详情
function viewPlayerDetail(player) {
  currentPlayer.value = player
  detailVisible.value = true
}

// 删除球员
async function deletePlayer(player) {
  try {
    await ElMessageBox.confirm(`确定要删除球员"${player.name}"吗？`, '提示', {
      type: 'warning'
    })
    await callFunction('deletePlayer', { id: player._id || player.id })
    ElMessage.success('删除成功')
    fetchPlayers()
  } catch {
    // 取消删除
  }
}

onMounted(() => {
  fetchTeams()
  fetchPlayers()
})
</script>

<style scoped>
.player-management {
  padding: 20px 0;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-header h3 {
  margin: 0;
  font-size: 18px;
  color: #303133;
}

.header-actions {
  display: flex;
  align-items: center;
}

.stats-bar {
  background: #f5f7fa;
  padding: 12px 16px;
  border-radius: 4px;
  margin-bottom: 16px;
  display: flex;
  gap: 24px;
  font-size: 14px;
  color: #606266;
}

.stats-bar strong {
  color: #303133;
  margin-left: 4px;
}

.player-avatar-small {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: 50%;
}

.pagination-wrapper {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

/* 上传组件 */
.avatar-uploader {
  border: 2px dashed #d9d9d9;
  border-radius: 8px;
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.3s;
  width: 100px;
  height: 100px;
}

.avatar-uploader:hover {
  border-color: #409EFF;
}

.uploaded-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.upload-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #8c939d;
  font-size: 14px;
}

.upload-placeholder .el-icon {
  font-size: 28px;
  margin-bottom: 8px;
}

.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

/* 球员详情 */
.player-detail {
  padding: 20px 0;
}

.detail-header {
  display: flex;
  gap: 24px;
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid #ebeef5;
}

.detail-avatar {
  width: 100px;
  height: 100px;
  object-fit: cover;
  border-radius: 50%;
  border: 1px solid #ebeef5;
}

.detail-info h2 {
  margin: 0 0 12px;
  font-size: 24px;
  color: #303133;
}

.detail-info p {
  margin: 6px 0;
  color: #606266;
  font-size: 14px;
}

.detail-body {
  padding: 16px 0;
}

.detail-body p {
  margin: 8px 0;
  color: #606266;
  font-size: 14px;
}
</style>
