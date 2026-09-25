<template>
  <div class="coach-group-list">
    <div class="page-card">
      <!-- 开发工具（仅 dev=1 时显示） -->
      <div v-if="showDevTools" class="dev-tools">
        <el-alert type="warning" :closable="false" show-icon>
          <template #title>开发工具</template>
          <div class="dev-actions">
            <el-button size="small" @click="runMigration">运行教练数据迁移</el-button>
            <el-button size="small" @click="checkMigration">检查迁移状态</el-button>
          </div>
        </el-alert>
      </div>

      <div class="page-header">
        <div class="header-left">
          <h2>教练组管理</h2>

        </div>
      </div>

      <!-- 教练组列表（按球队分组） -->
      <div v-loading="loading">
        <!-- 已有教练组的球队 -->
        <div v-for="group in coachGroups" :key="group.teamId" class="team-group-card">
          <div class="team-group-header">
            <div class="team-info">
              <el-tag type="success" size="large">{{ group.teamName }}</el-tag>
              <span class="member-count">{{ getMemberCount(group.members) }}名成员</span>
            </div>
            <div class="team-actions">
              <el-button type="primary" size="small" @click="addMember(group.teamId, group.teamName)">
                <el-icon><Plus /></el-icon>添加教练
              </el-button>
            </div>
          </div>

          <!-- 教练组成员表格 -->
          <el-table :data="group.members" size="small" style="width: 100%">
            <el-table-column label="头像" width="80">
              <template #default="{ row }">
                <img
                  v-if="row.photoUrl"
                  :src="row.photoUrl"
                  class="player-header-avatar"
                  alt="头像"
                />
                <el-avatar v-else :size="80" class="player-avatar">
                  {{ row.name ? row.name[0] : '?' }}
                </el-avatar>
              </template>
            </el-table-column>
            <el-table-column label="角色" width="100">
              <template #default="{ row }">
                <el-tag :type="getRoleTagType(row.type || row.role)" size="small">
                  {{ getRoleName(row.type || row.role) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="编号" width="150">
              <template #default="{ row }">{{ row.playerId || row.memberId || '-' }}</template>
            </el-table-column>
            <el-table-column prop="name" label="姓名" min-width="120" />
            <el-table-column prop="phone" label="联系电话" width="140" />
            <el-table-column prop="description" label="备注" min-width="150" show-overflow-tooltip />
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" link size="small" @click="editMember(group.teamId, group.teamName, group.members, row)">编辑</el-button>
                <el-button type="danger" link size="small" @click="deleteMember(group.teamId, row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <!-- 未添加教练组的球队 -->
        <div v-if="teamsWithoutCoachGroup.length > 0" class="empty-section">
          <el-divider content-position="left">
            <span class="divider-text">尚未添加教练组的球队</span>
          </el-divider>
          <div class="quick-add-grid">
            <div v-for="team in teamsWithoutCoachGroup" :key="team._id" class="quick-add-item">
              <span class="team-name">{{ team.name }}</span>
              <el-button type="primary" plain size="small" @click="addMember(team._id, team.name)">
                <el-icon><Plus /></el-icon>添加教练组
              </el-button>
            </div>
          </div>
        </div>

        <!-- 全部球队都没有数据 -->
        <el-empty v-if="coachGroups.length === 0 && teamsWithoutCoachGroup.length === 0 && !loading"
          description="暂无球队数据，请先在球队管理中添加球队"></el-empty>
      </div>
    </div>

    <!-- 添加/编辑成员对话框 -->
    <el-dialog
      v-model="showMemberDialog"
      :title="isEditingMember ? '编辑教练组成员' : '添加教练组成员'"
      width="700px"
      :close-on-click-modal="false"
    >
      <!-- 新增模式：选项卡切换 -->
      <el-tabs v-if="!isEditingMember" v-model="activeTab" type="border-card" class="member-tabs">
        <el-tab-pane label="手动新建" name="manual">
          <div class="tab-content">
            <el-form :model="memberForm" label-width="100px">
              <el-form-item label="所属球队">
                <el-input :model-value="currentTeamName" disabled />
              </el-form-item>

              <!-- 头像上传 -->
              <el-form-item label="教练头像">
                <div class="avatar-upload-section">
                  <div class="current-avatar">
                    <img
                      v-if="memberForm.photoUrl"
                      :src="memberForm.photoUrl"
                      class="player-avatar-img"
                      alt="教练头像"
                    />
                    <el-avatar v-else :size="80" class="player-avatar">
                      {{ memberForm.name ? memberForm.name[0] : '?' }}
                    </el-avatar>
                    <span class="avatar-label">当前头像</span>
                  </div>
                  <div class="avatar-actions">
                    <RemoveBgProcessor
                      ref="avatarProcessorRef"
                      type="playerAvatar"
                      @success="handleAvatarSuccess"
                      @error="handleAvatarError"
                    />
                    <el-text type="info" size="small">
                      支持 JPG、PNG 格式，建议上传半身照
                    </el-text>
                  </div>
                </div>
              </el-form-item>

              <el-form-item label="成员角色" required>
                <el-select v-model="memberForm.type" placeholder="请选择角色" style="width: 100%">
                  <el-option v-for="role in memberTypes" :key="role.value" :label="role.label" :value="role.value">
                    <div class="role-option">
                      <el-tag :type="role.tagType" size="small">{{ role.label }}</el-tag>

                    </div>
                  </el-option>
                </el-select>
              </el-form-item>

              <el-form-item label="姓名" required>
                <el-input v-model="memberForm.name" placeholder="请输入姓名" maxlength="30" />
              </el-form-item>

              <el-form-item label="联系电话" required>
                <el-input v-model="memberForm.phone" placeholder="请输入联系电话" maxlength="20" />
              </el-form-item>

              <el-form-item label="备注">
                <el-input
                  v-model="memberForm.description"
                  type="textarea"
                  :rows="2"
                  placeholder="如：负责球员伤病情况记录（队医）/ 负责阵容提交（助理教练）"
                  maxlength="100"
                  show-word-limit
                />
              </el-form-item>
            </el-form>
          </div>
        </el-tab-pane>

        <el-tab-pane label="从库中选择" name="library">
          <div class="tab-content">
            <!-- 搜索栏 -->
            <div class="library-search">
              <el-input v-model="libraryKeyword" placeholder="搜索姓名/手机号" clearable @clear="loadCoachLibrary" @keyup.enter="loadCoachLibrary">
                <template #append>
                  <el-button :icon="Search" @click="loadCoachLibrary" />
                </template>
              </el-input>
            </div>
            <!-- 教练库列表 -->
            <el-table :data="coachLibraryList" v-loading="libraryLoading" style="width: 100%" max-height="350px" size="small">
              <el-table-column label="头像" width="70">
                <template #default="{ row }">
                  <img v-if="row.photoUrl || row.avatarUrl" :src="row.photoUrl || row.avatarUrl" class="library-avatar" />
                  <el-avatar v-else :size="40">{{ row.name ? row.name[0] : '?' }}</el-avatar>
                </template>
              </el-table-column>
              <el-table-column prop="name" label="姓名" width="100" />
              <el-table-column prop="phone" label="手机号" width="130" />
              <el-table-column prop="certLevel" label="证书等级" width="100" />
              <el-table-column label="操作" width="120">
                <template #default="{ row }">
                  <el-button type="primary" link size="small" @click="selectFromLibrary(row)">选择</el-button>
                </template>
              </el-table-column>
            </el-table>
            <div class="library-empty-tip">
              <el-empty v-if="coachLibraryList.length === 0 && !libraryLoading" description="教练库中暂无数据，请先手动新建教练" />
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>

      <!-- 编辑模式：直接显示表单 -->
      <template v-else>
        <el-form :model="memberForm" label-width="100px">
          <el-form-item label="所属球队">
            <el-input :model-value="currentTeamName" disabled />
          </el-form-item>

          <!-- 头像上传 -->
          <el-form-item label="教练头像">
            <div class="avatar-upload-section">
              <div class="current-avatar">
                <img
                  v-if="memberForm.photoUrl"
                  :src="memberForm.photoUrl"
                  class="player-avatar-img"
                  alt="教练头像"
                />
                <el-avatar v-else :size="80" class="player-avatar">
                  {{ memberForm.name ? memberForm.name[0] : '?' }}
                </el-avatar>
                <span class="avatar-label">当前头像</span>
              </div>
              <div class="avatar-actions">
                <RemoveBgProcessor
                  ref="avatarProcessorRef"
                  type="playerAvatar"
                  @success="handleAvatarSuccess"
                  @error="handleAvatarError"
                />
                <el-text type="info" size="small">
                  支持 JPG、PNG 格式，建议上传半身照
                </el-text>
              </div>
            </div>
          </el-form-item>

          <el-form-item label="成员角色" required>
            <el-select v-model="memberForm.type" placeholder="请选择角色" style="width: 100%">
              <el-option v-for="role in memberTypes" :key="role.value" :label="role.label" :value="role.value">
                <div class="role-option">
                  <el-tag :type="role.tagType" size="small">{{ role.label }}</el-tag>

                </div>
              </el-option>
            </el-select>
          </el-form-item>

          <el-form-item label="姓名" required>
            <el-input v-model="memberForm.name" placeholder="请输入姓名" maxlength="30" />
          </el-form-item>

          <el-form-item label="联系电话" required>
            <el-input v-model="memberForm.phone" placeholder="请输入联系电话" maxlength="20" />
          </el-form-item>

          <el-form-item label="备注">
            <el-input
              v-model="memberForm.description"
              type="textarea"
              :rows="2"
              placeholder="如：负责球员伤病情况记录（队医）/ 负责阵容提交（助理教练）"
              maxlength="100"
              show-word-limit
            />
          </el-form-item>
        </el-form>
      </template>

      <template #footer>
        <el-button @click="showMemberDialog = false">取消</el-button>
        <el-button v-if="isEditingMember || activeTab === 'manual'" type="primary" :loading="submitting" @click="submitMember">
          {{ isEditingMember ? '保存' : '添加' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Back, Edit, View, Plus, Upload, Search } from '@element-plus/icons-vue'
import { queryList, addRecord, updateRecord, deleteRecord, queryById, getCurrentUser, getFileUrl } from '../../utils/cloud'
import RemoveBgProcessor from '../../components/common/RemoveBgProcessor.vue'
import { actualStaffRecords } from '../../utils/staffRecords.js'

const showDevTools = ref(false)
const libraryKeyword = ref('')
const coachLibraryList = ref([])
const libraryLoading = ref(false)
const loading = ref(false)
const submitting = ref(false)
const teams = ref([])
const coachGroups = ref([])

const showMemberDialog = ref(false)
const isEditingMember = ref(false)
const activeTab = ref('manual')
const currentTeamId = ref('')
const currentTeamName = ref('')
const currentMembers = ref([])
const editingMemberIndex = ref(-1)
const avatarProcessorRef = ref(null)  // RemoveBgProcessor 组件 ref

const memberForm = ref({
  type: 'head_coach',
  name: '',
  phone: '',
  description: '',
  photoUrl: '',
  photoFileID: ''
})

// 成员角色类型定义
const memberTypes = [
  { value: 'head_coach', label: '主教练', tagType: 'primary', description: '负责战术安排、阵容提交' },
  { value: 'assistant_coach', label: '助理教练', tagType: 'success', description: '主教练不在时代替行使职权' },
  { value: 'goalkeeper_coach', label: '守门员教练', tagType: 'success', description: '负责守门员专项训练' },
  { value: 'team_leader', label: '领队', tagType: 'info', description: '负责球队信息化管理' },
  { value: 'doctor', label: '队医', tagType: 'warning', description: '负责球员伤病情况记录' },
  { value: 'translator', label: '翻译', tagType: 'info', description: '负责沟通翻译' },
  { value: 'press_officer', label: '新闻官', tagType: 'info', description: '负责媒体与新闻事务' },
  { value: 'other', label: '其他', tagType: 'info', description: '其他工作人员' }
]
const roleTypeAliases = {
  assistant: 'assistant_coach',
  leader: 'team_leader',
  '助理教练': 'assistant_coach',
  '主教练': 'head_coach',
  '领队': 'team_leader',
  '队医': 'doctor',
  '翻译': 'translator',
  '新闻官': 'press_officer',
  '守门员教练': 'goalkeeper_coach'
}

function normalizeRoleType(type) {
  const value = String(type || '').trim()
  return roleTypeAliases[value] || value || 'other'
}

// 获取角色显示名称
function getRoleName(type) {
  const normalizedType = normalizeRoleType(type)
  const role = memberTypes.find(r => r.value === normalizedType)
  return role ? role.label : (type || '-')
}

// 获取角色标签颜色
function getRoleTagType(type) {
  const normalizedType = normalizeRoleType(type)
  const role = memberTypes.find(r => r.value === normalizedType)
  return role ? role.tagType : 'info'
}
// 获取成员数量描述
function getMemberCount(members) {
  return members ? members.length : 0
}

// 计算尚未添加教练组的球队
const teamsWithoutCoachGroup = computed(() => {
  const groupedTeamIds = coachGroups.value.map(g => g.teamId)
  return teams.value.filter(team => !groupedTeamIds.includes(team._id))
})

// 加载球队列表
async function loadTeams() {
  try {
    teams.value = await queryList('teams', { orderBy: { createTime: 'desc' } })
  } catch (err) {
    console.error('加载球队列表失败:', err)
  }
}

// 加载教练组数据（按球队分组）
async function loadCoachGroups() {
  loading.value = true
  try {
    // 并行获取：所有教练 + 所有球队
    const [rawCoaches, allTeams] = await Promise.all([
      queryList('coaches', { orderBy: { createTime: 'desc' } }),
      queryList('teams', {})
    ])
    const coaches = actualStaffRecords(rawCoaches)

    // 建立球队ID -> 球队名称的映射（始终用 teams 集合的最新名称）
    const teamNameMap = new Map()
    allTeams.forEach(team => {
      teamNameMap.set(team._id, team.name || '未知球队')
    })

    // 按球队分组
    const groupMap = new Map()
    coaches.forEach(coach => {
      if (coach.teamId) {
        if (!groupMap.has(coach.teamId)) {
          groupMap.set(coach.teamId, {
            teamId: coach.teamId,
            teamName: teamNameMap.get(coach.teamId) || coach.teamName || '未知球队',
            members: []
          })
        }
        groupMap.get(coach.teamId).members.push(coach)
      }
    })

    coachGroups.value = Array.from(groupMap.values())
  } catch (err) {
    console.error('加载教练组数据失败:', err)
    ElMessage.error('加载教练组数据失败')
  } finally {
    loading.value = false
  }
}

// 头像上传成功
function handleAvatarSuccess(data) {
  memberForm.value.photoUrl = data.url
  memberForm.value.photoFileID = data.fileID || ''
  ElMessage.success('头像上传成功')
}

// 头像上传失败
function handleAvatarError(error) {
  ElMessage.error('头像上传失败: ' + (error.message || error))
}

// 添加成员
function addMember(teamId, teamName) {
  currentTeamId.value = teamId
  currentTeamName.value = teamName
  currentMembers.value = []
  isEditingMember.value = false
  editingMemberIndex.value = -1
  activeTab.value = 'manual'
  memberForm.value = { type: 'head_coach', name: '', phone: '', description: '', photoUrl: '', photoFileID: '' }
  // 重置头像上传组件状态
  avatarProcessorRef.value?.reset()
  showMemberDialog.value = true
  // 预加载教练库数据
  loadCoachLibrary()
}

// 编辑成员
function editMember(teamId, teamName, members, member) {
  currentTeamId.value = teamId
  currentTeamName.value = teamName || ''
  currentMembers.value = members
  isEditingMember.value = true
  editingMemberIndex.value = members.indexOf(member)
  memberForm.value = {
    type: normalizeRoleType(member.type || member.role || 'head_coach'),
    name: member.name || '',
    phone: member.phone || '',
    description: member.description || '',
    photoUrl: member.photoUrl || '',
    photoFileID: member.photoFileID || ''
  }
  avatarProcessorRef.value?.reset()
  showMemberDialog.value = true
}

// 删除成员
async function deleteMember(teamId, member) {
  try {
    await ElMessageBox.confirm(
      `确定删除「${member.name}」（${getRoleName(member.type)}）吗？`,
      '删除确认',
      { type: 'warning' }
    )
    await deleteRecord('coaches', member._id)
    ElMessage.success('删除成功')
    loadCoachGroups()
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

// 提交成员
async function submitMember() {
  if (!memberForm.value.name.trim()) {
    ElMessage.warning('请输入姓名')
    return
  }
  if (!memberForm.value.phone.trim()) {
    ElMessage.warning('请输入联系电话')
    return
  }

  submitting.value = true
  try {
    const currentUser = getCurrentUser()
    const uid = currentUser ? currentUser.uid : ''

    const normalizedType = normalizeRoleType(memberForm.value.type)
    const memberData = {
      ...memberForm.value,
      type: normalizedType,
      role: getRoleName(normalizedType),
      teamId: currentTeamId.value,
      teamName: currentTeamName.value,
      creator: uid,
      updateTime: new Date()
    }

    if (isEditingMember.value && editingMemberIndex.value >= 0) {
      // 编辑模式
      const memberId = currentMembers.value[editingMemberIndex.value]._id
      await updateRecord('coaches', memberId, memberData)
      ElMessage.success('保存成功')
    } else {
      // 添加模式：同时写入 coaches 和 coach_library（个人库）
      await addRecord('coaches', { ...memberData, createTime: new Date() })

      // 同步到教练库（按手机号去重）
      try {
        const exist = await queryList('coach_library', { where: { phone: memberForm.value.phone } })
        if (!exist || exist.length === 0) {
          await addRecord('coach_library', {
            name: memberForm.value.name,
            phone: memberForm.value.phone,
            idNumber: memberForm.value.idNumber || '',
            avatarUrl: memberForm.value.avatarUrl || '',
            specialty: memberForm.value.specialty || '',
            certLevel: memberForm.value.certLevel || '',
            creator: uid,
            createTime: new Date(),
            updateTime: new Date()
          })
        }
      } catch (err) {
        console.warn('同步到教练库失败:', err)
      }

      ElMessage.success('添加成功')
    }

    showMemberDialog.value = false
    loadCoachGroups()
  } catch (err) {
    ElMessage.error('操作失败: ' + (err.message || '未知错误'))
  } finally {
    submitting.value = false
  }
}

// 运行数据迁移
async function runMigration() {
  try {
    await ElMessageBox.confirm(
      '确定运行教练数据迁移吗？这会将现有 coaches 数据迁移到教练库（coach_library）和分配记录（coach_assignments）。',
      '确认迁移',
      { type: 'warning' }
    )
    ElMessage.info('请在云开发控制台中手动触发 migrateCoachData 云函数，参数：{ "action": "migrate" }')
  } catch {
    // 用户取消
  }
}

// 检查迁移状态
async function checkMigration() {
  try {
    const res = await queryList('coach_library', { limit: 5 })
    if (res && res.length > 0) {
      ElMessage.success(`教练库已有 ${res.length} 条记录（仅显示前5条）`)
    } else {
      ElMessage.info('教练库为空，请先运行迁移')
    }
  } catch (err) {
    ElMessage.error('检查失败：' + (err.message || err))
  }
}

// 加载教练库列表
async function loadCoachLibrary() {
  libraryLoading.value = true
  try {
    const params = { orderBy: { createTime: 'desc' } }
    if (libraryKeyword.value.trim()) {
      // 简单前端过滤，云开发不支持模糊搜索，改为精确匹配
      params.name = libraryKeyword.value.trim()
    }
    const res = await queryList('coach_library', params)
    let list = res || []

    // 按当前用户过滤（只显示当前用户创建的教练，兼容没有 creator 的旧数据）
    const currentUser = getCurrentUser()
    const uid = currentUser ? currentUser.uid : ''
    if (uid) {
      list = list.filter(coach => {
        return !coach.creator || coach.creator === uid || coach.creator === ''
      })
    }

    // 转换 cloud:// 格式的头像为临时 URL，保留原始 fileID
    for (const coach of list) {
      if (coach.avatarUrl && coach.avatarUrl.startsWith('cloud://')) {
        coach._avatarFileID = coach.avatarUrl  // 保留原始 fileID 用于保存
        try {
          coach.avatarUrl = await getFileUrl(coach.avatarUrl)
        } catch (err) {
          console.warn('获取头像临时URL失败:', coach.name, err)
        }
      }
    }

    coachLibraryList.value = list
  } catch (err) {
    console.error('加载教练库失败:', err)
    coachLibraryList.value = []
  } finally {
    libraryLoading.value = false
  }
}

// 从教练库选择教练 — 填充到手动新建表单
async function selectFromLibrary(coach) {
  // 将库中的教练数据填充到表单
  memberForm.value = {
    type: 'head_coach',
    name: coach.name || '',
    phone: coach.phone || '',
    description: coach.description || '',
    photoUrl: coach.avatarUrl || '',
    photoFileID: coach._avatarFileID || coach.avatarUrl || ''
  }
  // 切换到手新建选项卡，让用户选择角色后提交
  activeTab.value = 'manual'
  ElMessage.success(`已选择「${coach.name}」，请确认角色后提交`)
}

onMounted(() => {
  // 开发工具：URL 中含 dev=1 时显示
  const urlParams = new URLSearchParams(window.location.search)
  showDevTools.value = urlParams.has('dev')

  loadTeams()
  loadCoachGroups()
})
</script>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.header-left h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.header-tip {
  font-size: 12px;
  color: #909399;
}

.header-actions {
  display: flex;
  gap: 12px;
}

/* 教练组卡片 */
.team-group-card {
  background: #f5f7fa;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.team-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.team-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.member-count {
  font-size: 13px;
  color: #909399;
}

/* 空状态区域 */
.empty-section {
  margin-top: 20px;
}

.divider-text {
  font-size: 13px;
  color: #909399;
}

.quick-add-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.quick-add-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 12px 16px;
}

.quick-add-item .team-name {
  font-size: 14px;
  color: #303133;
}

/* 头像上传 */
.avatar-upload-section {
  display: flex;
  align-items: center;
  gap: 16px;
}

.current-avatar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.avatar-actions {
  display: flex;
  flex-direction: column;
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

/* 角色选项 */
.role-option {
  display: flex;
  align-items: center;
  gap: 8px;
}

.role-desc {
  font-size: 12px;
  color: #909399;
  margin-left: 8px;
}

/* 开发工具 */
.dev-tools {
  margin-bottom: 16px;
}

.dev-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

/* 教练库对话框 */
.library-search {
  margin-bottom: 16px;
}

.library-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
}

.library-empty-tip {
  margin-top: 16px;
}

.team-actions {
  display: flex;
  gap: 8px;
}

/* 选项卡样式 */
.member-tabs {
  margin-top: -10px;
}

.member-tabs :deep(.el-tabs__content) {
  padding: 16px 0 0 0;
}

.tab-content {
  min-height: 300px;
}

/* 表格头像 - 与球员详情页一致 */
.player-header-avatar {
  width: 60px;
  height: 80px;
  object-fit: contain;
  border-radius: 4px;
  background-color: transparent;
  display: block;
}

.player-avatar {
  border: 3px solid #e4e7ed;
}
</style>
