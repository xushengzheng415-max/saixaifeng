<template>
  <el-dialog
    v-model="visible"
    title="发送邀请"
    width="580px"
    :close-on-click-modal="false"
    @close="handleClose"
  >
    <el-form label-width="90px">
      <!-- 选择球队 -->
      <el-form-item label="选择球队" required v-if="!defaultTeamId">
        <el-select v-model="form.teamId" placeholder="请选择球队" style="width: 100%">
          <el-option
            v-for="team in teamOptions"
            :key="team._id"
            :label="team.name"
            :value="team._id"
          />
        </el-select>
      </el-form-item>

      <!-- 邀请类型 -->
      <el-form-item label="邀请类型" required>
        <el-radio-group v-model="form.type">
          <el-radio value="coach">教练邀请</el-radio>
          <el-radio value="player">球员邀请</el-radio>
        </el-radio-group>
      </el-form-item>

      <!-- 担任角色（教练类型） -->
      <el-form-item label="担任角色" required v-if="form.type === 'coach'">
        <el-select v-model="form.role" placeholder="请选择角色" style="width: 100%">
          <el-option label="主教练" value="主教练" />
          <el-option label="助理教练" value="助理教练" />
          <el-option label="队医" value="队医" />
          <el-option label="领队" value="领队" />
        </el-select>
      </el-form-item>

      <!-- 球员角色 -->
      <el-form-item label="担任角色" required v-if="form.type === 'player'">
        <el-select v-model="form.role" placeholder="请选择角色" style="width: 100%">
          <el-option label="球员" value="球员" />
          <el-option label="守门员" value="守门员" />
        </el-select>
      </el-form-item>
    </el-form>

    <!-- 操作按钮 -->
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="generating" @click="handleGenerate">
        生成邀请链接
      </el-button>
    </template>

    <!-- 邀请结果 -->
    <div v-if="inviteLink" class="invite-result">
      <el-divider content-position="left">邀请信息</el-divider>
      <div class="result-row">
        <span class="result-label">邀请链接：</span>
        <el-input :model-value="inviteLink" readonly>
          <template #append>
            <el-button @click="copyLink">复制</el-button>
          </template>
        </el-input>
      </div>
      <div class="result-row">
        <span class="result-label">球队名称：</span>
        <span>{{ form.teamName }}</span>
      </div>
      <div class="result-row">
        <span class="result-label">邀请类型：</span>
        <el-tag :type="form.type === 'coach' ? 'primary' : 'success'">
          {{ form.type === 'coach' ? '教练邀请' : '球员邀请' }}
        </el-tag>
      </div>
      <div class="result-row">
        <span class="result-label">担任角色：</span>
        <span>{{ form.role }}</span>
      </div>
      <div class="invite-tip">
        <el-icon><InfoFilled /></el-icon>
        请在微信中打开此链接，将自动跳转至赛小蜂足球赛事小程序邀请页面
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { InfoFilled } from '@element-plus/icons-vue'
import { queryList } from '../../utils/cloud'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  defaultTeamId: { type: String, default: '' },
  defaultTeamName: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue'])

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const form = ref({
  teamId: props.defaultTeamId,
  teamName: props.defaultTeamName,
  type: 'coach',
  role: '主教练'
})

const teamOptions = ref([])
const generating = ref(false)
const inviteLink = ref('')

// 监听 defaultTeamId 变化
watch(() => props.defaultTeamId, (val) => {
  form.value.teamId = val
})

watch(() => props.defaultTeamName, (val) => {
  form.value.teamName = val
})

// 加载球队列表
async function loadTeams() {
  try {
    teamOptions.value = await queryList('teams', { orderBy: { createTime: 'desc' } })
  } catch (err) {
    console.error('加载球队失败:', err)
  }
}

// 生成邀请链接
function handleGenerate() {
  if (!form.value.teamId && !props.defaultTeamId) {
    ElMessage.warning('请选择球队')
    return
  }
  if (!form.value.role) {
    ElMessage.warning('请选择角色')
    return
  }

  // 获取球队名称
  let teamName = form.value.teamName
  if (!teamName && teamOptions.value.length > 0) {
    const team = teamOptions.value.find(t => t._id === form.value.teamId)
    teamName = team ? team.name : ''
  }

  // 构建邀请链接（小程序页面路径）
  const params = new URLSearchParams({
    type: form.value.type,
    teamId: form.value.teamId,
    teamName: teamName,
    role: form.value.role
  })
  const link = `pages/invite/invite?${params.toString()}`
  inviteLink.value = link

  ElMessage.success('邀请链接已生成，请在微信中分享此链接')
}

// 复制链接
async function copyLink() {
  try {
    await navigator.clipboard.writeText(inviteLink.value)
    ElMessage.success('链接已复制')
  } catch {
    ElMessage.error('复制失败，请手动复制')
  }
}

function handleClose() {
  inviteLink.value = ''
}

onMounted(() => {
  if (!props.defaultTeamId) {
    loadTeams()
  }
})
</script>

<style scoped>
.invite-result {
  margin-top: 16px;
}

.result-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.result-label {
  font-size: 14px;
  color: #606266;
  white-space: nowrap;
}

.invite-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 16px;
  padding: 12px;
  background: #f0f9ff;
  border-radius: 6px;
  font-size: 13px;
  color: #409eff;
}
</style>
