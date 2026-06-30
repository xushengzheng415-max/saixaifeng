<template>
  <div class="head-referee-management">
    <div class="page-header">
      <h2>裁判长管理</h2>
      <p class="page-desc">为各场比赛分配执法裁判组</p>
    </div>

    <!-- 赛事选择 -->
    <div class="tournament-selector">
      <el-select
        v-model="selectedTournamentId"
        placeholder="选择要管理的赛事"
        style="width: 320px"
        @change="onTournamentChange"
      >
        <el-option
          v-for="t in tournaments"
          :key="t._id"
          :label="t.tournamentName"
          :value="t._id"
        />
      </el-select>
    </div>

    <!-- 比赛列表 -->
    <div v-loading="loading" class="match-list">
      <el-empty v-if="matches.length === 0 && !loading" description="暂无比赛" />

      <div v-for="match in matches" :key="match._id" class="match-card">
        <div class="match-header">
          <div class="match-teams">
            <span class="team-name">{{ match.homeTeamName || '待定' }}</span>
            <span class="match-vs">VS</span>
            <span class="team-name">{{ match.awayTeamName || '待定' }}</span>
          </div>
          <div class="match-meta">
            <span>{{ match.matchDate }} {{ match.matchTime }}</span>
            <el-tag :type="getStatusType(match.status)" size="small">{{ getStatusLabel(match.status) }}</el-tag>
          </div>
        </div>

        <!-- 已分配裁判 -->
        <div class="referee-assignment">
          <div class="assignment-row">
            <span class="role-label">主裁判</span>
            <span class="referee-name">{{ match.refereeCrew?.mainReferee?.name || '未分配' }}</span>
          </div>
          <div class="assignment-row">
            <span class="role-label">助理裁判1</span>
            <span class="referee-name">{{ match.refereeCrew?.assistant1?.name || '未分配' }}</span>
          </div>
          <div class="assignment-row">
            <span class="role-label">助理裁判2</span>
            <span class="referee-name">{{ match.refereeCrew?.assistant2?.name || '未分配' }}</span>
          </div>
          <div class="assignment-row">
            <span class="role-label">第四官员</span>
            <span class="referee-name">{{ match.refereeCrew?.fourthOfficial?.name || '未分配' }}</span>
          </div>
        </div>

        <div class="match-actions">
          <el-button type="primary" size="small" @click="openAssignDialog(match)">
            <el-icon><SetUp /></el-icon> 分配裁判
          </el-button>
        </div>
      </div>
    </div>

    <!-- 分配裁判弹窗 -->
    <el-dialog v-model="assignDialogVisible" title="分配裁判组" width="520px">
      <el-form :model="assignForm" label-width="100px" size="default">
        <el-form-item label="主裁判">
          <el-select v-model="assignForm.mainReferee" placeholder="请选择主裁判" style="width:100%;" filterable clearable>
            <el-option v-for="r in availableReferees" :key="r._id" :label="r.name" :value="r._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="助理裁判1">
          <el-select v-model="assignForm.assistant1" placeholder="请选择助理裁判1" style="width:100%;" filterable clearable>
            <el-option v-for="r in availableReferees" :key="r._id" :label="r.name" :value="r._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="助理裁判2">
          <el-select v-model="assignForm.assistant2" placeholder="请选择助理裁判2" style="width:100%;" filterable clearable>
            <el-option v-for="r in availableReferees" :key="r._id" :label="r.name" :value="r._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="第四官员">
          <el-select v-model="assignForm.fourthOfficial" placeholder="请选择第四官员" style="width:100%;" filterable clearable>
            <el-option v-for="r in availableReferees" :key="r._id" :label="r.name" :value="r._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="视频裁判">
          <el-select v-model="assignForm.varReferee" placeholder="请选择视频助理裁判" style="width:100%;" filterable clearable>
            <el-option v-for="r in availableReferees" :key="r._id" :label="r.name" :value="r._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="比赛监督">
          <el-select v-model="assignForm.matchObserver" placeholder="请选择比赛监督" style="width:100%;" filterable clearable>
            <el-option v-for="r in availableReferees" :key="r._id" :label="r.name" :value="r._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="裁判监督">
          <el-select v-model="assignForm.refereeObserver" placeholder="请选择裁判监督" style="width:100%;" filterable clearable>
            <el-option v-for="r in availableReferees" :key="r._id" :label="r.name" :value="r._id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="assignDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveAssignment" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { SetUp } from '@element-plus/icons-vue'
import { queryList, callFunction } from '../../utils/cloud'

const tournaments = ref([])
const selectedTournamentId = ref('')
const matches = ref([])
const availableReferees = ref([])
const loading = ref(false)
const saving = ref(false)

// 分配弹窗
const assignDialogVisible = ref(false)
const currentMatch = ref(null)
const assignForm = ref({
  mainReferee: '',
  assistant1: '',
  assistant2: '',
  fourthOfficial: '',
  varReferee: '',
  matchObserver: '',
  refereeObserver: ''
})

// 加载赛事列表
async function loadTournaments() {
  try {
    const res = await queryList('tournaments', {
      orderBy: { createTime: 'desc' },
      limit: 100
    })
    tournaments.value = res || []
  } catch (err) {
    console.error('加载赛事失败:', err)
  }
}

// 加载比赛列表
async function loadMatches() {
  if (!selectedTournamentId.value) return
  loading.value = true
  try {
    const res = await queryList('matches', {
      where: { tournamentId: selectedTournamentId.value },
      orderBy: { matchDate: 'asc', matchTime: 'asc' }
    })
    matches.value = res || []
  } catch (err) {
    console.error('加载比赛失败:', err)
    ElMessage.error('加载比赛失败')
  } finally {
    loading.value = false
  }
}

// 加载可用裁判
async function loadReferees() {
  try {
    const res = await queryList('referees', {
      orderBy: { createTime: 'desc' },
      limit: 500
    })
    availableReferees.value = res || []
  } catch (err) {
    console.error('加载裁判失败:', err)
  }
}

function onTournamentChange() {
  loadMatches()
}

// 打开分配弹窗
function openAssignDialog(match) {
  currentMatch.value = match
  const c = match.refereeCrew || {}
  // 通过姓名反查 _id
  const findId = (name) => {
    if (!name) return ''
    const ref = availableReferees.value.find(r => r.name === name)
    return ref?._id || ''
  }
  assignForm.value = {
    mainReferee: findId(c.mainReferee?.name),
    assistant1: findId(c.assistant1?.name),
    assistant2: findId(c.assistant2?.name),
    fourthOfficial: findId(c.fourthOfficial?.name),
    varReferee: findId(c.varReferee?.name),
    matchObserver: findId(c.matchObserver?.name),
    refereeObserver: findId(c.refereeObserver?.name)
  }
  assignDialogVisible.value = true
}

// 保存分配
async function saveAssignment() {
  saving.value = true
  try {
    const data = { ...assignForm.value }
    // 过滤空值
    Object.keys(data).forEach(k => {
      if (!data[k]) delete data[k]
    })

    await callFunction('updateMatch', {
      matchId: currentMatch.value._id,
      data: {
        refereeCrew: data,
        tournamentId: selectedTournamentId.value
      }
    })

    // 更新本地数据
    currentMatch.value.refereeCrew = data
    ElMessage.success('裁判分配已保存')
    assignDialogVisible.value = false
  } catch (err) {
    ElMessage.error('保存失败: ' + err.message)
  } finally {
    saving.value = false
  }
}

function getStatusType(status) {
  const map = { scheduled: 'info', ongoing: 'success', finished: '', postponed: 'warning', cancelled: 'danger' }
  return map[status] || 'info'
}

function getStatusLabel(status) {
  const map = { scheduled: '未开始', ongoing: '进行中', finished: '已结束', postponed: '延期', cancelled: '已取消' }
  return map[status] || status
}

onMounted(() => {
  loadTournaments()
  loadReferees()
})
</script>

<style scoped>
.head-referee-management {
  padding: 20px;
}

.page-header {
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0 0 4px 0;
  font-size: 20px;
}

.page-desc {
  margin: 0;
  color: #909399;
  font-size: 14px;
}

.tournament-selector {
  margin-bottom: 20px;
}

.match-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.match-card {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  border: 1px solid #ebeef5;
}

.match-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #ebeef5;
}

.match-teams {
  display: flex;
  align-items: center;
  gap: 12px;
  font-weight: 600;
}

.match-vs {
  color: #909399;
}

.match-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #606266;
}

.referee-assignment {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}

.assignment-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.role-label {
  color: #909399;
  min-width: 70px;
}

.referee-name {
  font-weight: 500;
}

.match-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
