<template>
  <div class="referee-list">
    <div class="page-card">
      <div class="page-header">
        <h2>{{ pageTitle }}</h2>
        <div class="header-actions">
          <template v-if="canAddReferee">
            <el-button type="primary" @click="showAddDialog = true">
              <el-icon><Plus /></el-icon>添加裁判
            </el-button>
          </template>
          <template v-else-if="currentRole === ROLES.REFEREE && !isRegistered">
            <el-button type="primary" @click="showApplyDialog = true">
              <el-icon><Edit /></el-icon>申请成为裁判
            </el-button>
          </template>
        </div>
      </div>

      <!-- 标签页切换 -->
      <el-tabs v-model="activeTab" @tab-change="handleTabChange">
        <el-tab-pane
          v-if="canViewAllReferees"
          label="裁判库"
          name="all"
        />
        <el-tab-pane
          v-if="canViewAllReferees"
          label="裁判组"
          name="groups"
        />
        <el-tab-pane
          v-if="canViewAllReferees"
          label="裁判委员会"
          name="committee"
        />
        <el-tab-pane
          v-if="currentRole === ROLES.REFEREE"
          label="我的执法"
          name="myAssignments"
        />
        <el-tab-pane
          v-if="canApproveReferee"
          label="待审核"
          name="pending"
        />
      </el-tabs>

      <!-- 裁判列表（仅在裁判库/待审核/我的执法标签显示）-->
      <div v-if="['all', 'pending', 'myAssignments'].includes(activeTab)" class="referee-cards" v-loading="loading">
        <div
          v-for="referee in filteredReferees"
          :key="referee._id"
          class="referee-card"
        >
          <div class="card-header">
            <el-avatar :size="60" :src="referee.avatarUrl" class="referee-avatar">
              {{ referee.name ? referee.name[0] : '?' }}
            </el-avatar>
            <div class="card-info">
              <h3 class="referee-name">{{ referee.name }}</h3>
              <div class="referee-level">
                <el-tag :type="getLevelType(referee.level)" size="small">
                  {{ referee.level || '初级裁判' }}
                </el-tag>
                <el-tag v-if="referee.status" :type="getStatusType(referee.status)" size="small" style="margin-left: 8px;">
                  {{ getStatusLabel(referee.status) }}
                </el-tag>
              </div>
            </div>
          </div>
          
          <div class="card-body">
            <div class="info-item">
              <span class="label">联系电话：</span>
              <span class="value">{{ referee.phone || '-' }}</span>
            </div>
            <div class="info-item">
              <span class="label">执法场次：</span>
              <span class="value">{{ referee.matchCount || 0 }} 场</span>
            </div>
            <div class="info-item">
              <span class="label">所在地区：</span>
              <span class="value">{{ referee.region || '-' }}</span>
            </div>
            <div v-if="referee.certNumber" class="info-item">
              <span class="label">证书编号：</span>
              <span class="value">{{ referee.certNumber }}</span>
            </div>
          </div>

          <div class="card-footer" @click.stop>
            <template v-if="canInviteReferee && referee.status === 'approved'">
              <el-button type="primary" link size="small" @click="inviteReferee(referee)">
                邀请执法
              </el-button>
            </template>
            <template v-if="canApproveReferee && referee.status === 'pending'">
              <el-button type="success" link size="small" @click="approveReferee(referee)">
                通过
              </el-button>
              <el-button type="danger" link size="small" @click="rejectReferee(referee)">
                拒绝
              </el-button>
            </template>
            <template v-if="canEditReferee(referee)">
              <el-button type="primary" link size="small" @click="editReferee(referee)">
                编辑
              </el-button>
              <el-button type="danger" link size="small" @click="deleteReferee(referee)">
                删除
              </el-button>
            </template>
          </div>
        </div>

        <!-- 空状态 -->
        <el-empty
          v-if="filteredReferees.length === 0 && !loading"
          :description="emptyText"
        >
          <el-button v-if="canAddReferee" type="primary" @click="showAddDialog = true">
            添加第一个裁判
          </el-button>
          <el-button v-else-if="currentRole === ROLES.REFEREE && !isRegistered" type="primary" @click="showApplyDialog = true">
            申请成为裁判
          </el-button>
        </el-empty>
      </div>

      <!-- 裁判组 -->
      <div v-if="activeTab === 'groups'" v-loading="groupsLoading" class="referee-groups">
        <el-empty v-if="tournamentGroups.length === 0 && !groupsLoading" description="暂无赛事裁判组">
          <p style="color: #999; font-size: 13px; margin-top: 8px;">请在比赛详情中分配裁判后查看</p>
        </el-empty>
        <div v-else class="group-list">
          <div
            v-for="group in tournamentGroups"
            :key="group.tournamentId"
            class="tournament-group-card"
          >
            <div class="group-header">
              <h3>{{ group.tournamentName }}</h3>
              <el-tag type="info" size="small">{{ group.referees.length }} 位裁判</el-tag>
            </div>
            <div class="group-referees">
              <div
                v-for="item in group.referees"
                :key="item.refereeId || item.refereeName"
                class="group-referee-row"
              >
                <div class="referee-info">
                  <el-tag v-if="item.isHeadReferee" type="danger" size="small">裁判长</el-tag>
                  <span class="referee-name">{{ item.refereeName }}</span>
                  <span class="referee-role">{{ item.roleLabel }}</span>
                </div>
                <div class="referee-actions">
                  <el-button
                    v-if="!item.isHeadReferee"
                    size="small"
                    type="primary"
                    plain
                    @click="setHeadReferee(group.tournamentId, item.refereeId, item.refereeName)"
                  >
                    设为裁判长
                  </el-button>
                  <el-tag v-else type="success" size="small">当前裁判长</el-tag>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 裁判委员会 -->
      <div v-if="activeTab === 'committee'" v-loading="committeeLoading" class="referee-groups">
        <el-empty v-if="tournamentCommittees.length === 0 && !committeeLoading" description="暂无赛事裁判委员会">
          <p style="color: #999; font-size: 13px; margin-top: 8px;">每个赛事可独立设立裁判委员会</p>
        </el-empty>
        <div v-else class="group-list">
          <div
            v-for="tc in tournamentCommittees"
            :key="tc.tournamentId"
            class="tournament-group-card"
          >
            <div class="group-header">
              <h3>{{ tc.tournamentName }}</h3>
              <el-switch
                v-model="tc.enabled"
                active-text="已启用"
                inactive-text="未启用"
                @change="val => toggleTournamentCommittee(tc.tournamentId, val)"
              />
            </div>

            <div v-if="!tc.enabled" style="padding: 20px; color: #999; text-align: center;">
              未启用裁判委员会
            </div>

            <div v-else>
              <div style="padding: 12px 20px 0;">
                <el-button type="primary" size="small" @click="openCommitteeDialog(tc.tournamentId, tc.tournamentName)">
                  <el-icon><Plus /></el-icon>添加委员会成员
                </el-button>
              </div>

              <div class="group-referees">
                <el-empty v-if="tc.members.length === 0" description="暂无委员会成员" />
                <div v-else class="committee-members">
                  <div v-for="roleGroup in tc.groupedMembers" :key="roleGroup.role" class="role-group" style="margin-bottom: 12px;">
                    <h4 class="role-title">
                      {{ roleGroup.label }}
                      <el-tag size="small">{{ roleGroup.members.length }} 人</el-tag>
                    </h4>
                    <div
                      v-for="member in roleGroup.members"
                      :key="member._id"
                      class="member-card"
                    >
                      <div class="member-info">
                        <el-avatar :size="36">{{ member.refereeName?.[0] || '?' }}</el-avatar>
                        <div class="member-detail">
                          <span class="member-name">{{ member.refereeName }}</span>
                          <span v-if="member.responsibilities" class="member-desc">{{ member.responsibilities }}</span>
                        </div>
                      </div>
                      <div class="member-actions">
                        <el-button size="small" @click="editCommitteeMember(member, tc.tournamentId)">编辑</el-button>
                        <el-button size="small" type="danger" @click="deleteCommitteeMember(member)">移除</el-button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 添加/编辑裁判对话框 -->
    <el-dialog
      v-model="showAddDialog"
      :title="isEditing ? '编辑裁判' : '添加裁判'"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form :model="refereeForm" label-width="90px">
        <el-form-item label="姓名" required>
          <el-input v-model="refereeForm.name" placeholder="请输入裁判姓名" />
        </el-form-item>
        <el-form-item label="联系电话" required>
          <el-input v-model="refereeForm.phone" placeholder="请输入联系电话" />
        </el-form-item>
        <el-form-item label="裁判等级">
          <el-select v-model="refereeForm.level" placeholder="选择裁判等级" style="width: 100%">
            <el-option label="国家级" value="国家级" />
            <el-option label="一级" value="一级" />
            <el-option label="二级" value="二级" />
            <el-option label="三级" value="三级" />
            <el-option label="初级" value="初级" />
          </el-select>
        </el-form-item>
        <el-form-item label="所在地区">
          <el-input v-model="refereeForm.region" placeholder="请输入所在地区" />
        </el-form-item>
        <el-form-item label="证书编号">
          <el-input v-model="refereeForm.certNumber" placeholder="请输入证书编号（如有）" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input 
            v-model="refereeForm.remark" 
            type="textarea" 
            :rows="2" 
            placeholder="备注信息"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitReferee">
          {{ isEditing ? '保存' : '添加' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 申请成为裁判对话框 -->
    <el-dialog
      v-model="showApplyDialog"
      title="申请成为裁判"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form :model="applyForm" label-width="90px">
        <el-form-item label="姓名" required>
          <el-input v-model="applyForm.name" placeholder="请输入您的姓名" />
        </el-form-item>
        <el-form-item label="联系电话" required>
          <el-input v-model="applyForm.phone" placeholder="请输入联系电话" />
        </el-form-item>
        <el-form-item label="裁判等级">
          <el-select v-model="applyForm.level" placeholder="选择裁判等级" style="width: 100%">
            <el-option label="国家级" value="国家级" />
            <el-option label="一级" value="一级" />
            <el-option label="二级" value="二级" />
            <el-option label="三级" value="三级" />
            <el-option label="初级" value="初级" />
          </el-select>
        </el-form-item>
        <el-form-item label="所在地区">
          <el-input v-model="applyForm.region" placeholder="请输入所在地区" />
        </el-form-item>
        <el-form-item label="证书编号">
          <el-input v-model="applyForm.certNumber" placeholder="请输入证书编号（如有）" />
        </el-form-item>
        <el-form-item label="个人简介">
          <el-input 
            v-model="applyForm.bio" 
            type="textarea" 
            :rows="3" 
            placeholder="请简要介绍您的执法经验"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showApplyDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitApply">
          提交申请
        </el-button>
      </template>
    </el-dialog>


    <!-- 裁判委员会成员对话框 -->
    <el-dialog
      v-model="showCommitteeDialog"
      :title="(isEditingCommittee ? '编辑' : '添加') + '委员会成员 - ' + currentCommitteeTournamentName"
      width="560px"
      :close-on-click-modal="false"
    >
      <el-form :model="committeeForm" label-width="100px">
        <el-form-item label="选择裁判" required>
          <el-select
            v-model="committeeForm.refereeId"
            placeholder="搜索并选择裁判"
            filterable
            :loading="committeeRefereeLoading"
            style="width: 100%"
            @change="onCommitteeRefereeChange"
          >
            <el-option
              v-for="r in committeeRefereeOptions"
              :key="r._id"
              :label="r.name + (r.level ? '（' + r.level + '）' : '')"
              :value="r._id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="委员会角色" required>
          <el-select v-model="committeeForm.role" placeholder="选择角色" style="width: 100%">
            <el-option
              v-for="r in committeeRoles"
              :key="r.value"
              :label="r.label"
              :value="r.value"
            />
          </el-select>
          <div style="color: #999; font-size: 12px; margin-top: 4px;">
            {{ committeeRoles.find(r => r.value === committeeForm.role)?.desc || '' }}
          </div>
        </el-form-item>
        <el-form-item label="职责说明">
          <el-input
            v-model="committeeForm.responsibilities"
            type="textarea"
            :rows="3"
            placeholder="可选：补充该成员的具体职责分工"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCommitteeDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitCommitteeForm">
          {{ isEditingCommittee ? '保存' : '添加' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 邀请裁判对话框 -->

    <el-dialog
      v-model="showInviteDialog"
      title="邀请裁判执法"
      width="500px"
    >
      <el-form :model="inviteForm" label-width="90px">
        <el-form-item label="选择赛事" required>
          <el-select v-model="inviteForm.tournamentId" placeholder="请选择赛事" style="width: 100%">
            <el-option 
              v-for="t in myTournaments" 
              :key="t._id" 
              :label="t.name" 
              :value="t._id" 
            />
          </el-select>
        </el-form-item>
        <el-form-item label="邀请信息">
          <el-input 
            v-model="inviteForm.message" 
            type="textarea" 
            :rows="3" 
            placeholder="请输入邀请信息（可选）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showInviteDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitInvite">
          发送邀请
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit } from '@element-plus/icons-vue'
import { queryList, addRecord, updateRecord, deleteRecord, callFunction } from '../../utils/cloud'
import { permissions, getCurrentRole, ROLES } from '../../utils/permissions'

const loading = ref(false)
const submitting = ref(false)
const activeTab = ref('all')
const referees = ref([])
const myTournaments = ref([])

// 裁判组数据
const tournamentGroups = ref([])
const groupsLoading = ref(false)

// 当前角色
const currentRole = ref(getCurrentRole())
const userId = ref(localStorage.getItem('userId') || 'dev-user-id')

// 权限检查
const canAddReferee = computed(() => permissions.referee.add())
const canViewAllReferees = computed(() => permissions.referee.view())
const canApproveReferee = computed(() => permissions.referee.approve())
const canInviteReferee = computed(() => permissions.referee.invite())

// 页面标题
const pageTitle = computed(() => {
  if (currentRole.value === ROLES.REFEREE) return '我的执法'
  return '裁判管理'
})

// 空状态文本
const emptyText = computed(() => {
  if (currentRole.value === ROLES.REFEREE) return '您还没有执法记录'
  return '暂无裁判数据'
})

// 是否已注册为裁判
const isRegistered = computed(() => {
  return referees.value.some(r => r.userId === userId.value)
})

// 对话框显示状态
const showAddDialog = ref(false)
const showApplyDialog = ref(false)
const showInviteDialog = ref(false)
const isEditing = ref(false)
const editingId = ref('')
const currentReferee = ref(null)

// 表单数据
const refereeForm = ref({
  name: '',
  phone: '',
  level: '初级',
  region: '',
  certNumber: '',
  remark: ''
})

const applyForm = ref({
  name: '',
  phone: '',
  level: '初级',
  region: '',
  certNumber: '',
  bio: ''
})

const inviteForm = ref({
  tournamentId: '',
  message: ''
})

// 等级标签类型
function getLevelType(level) {
  const map = {
    '国家级': 'danger',
    '一级': 'warning',
    '二级': 'success',
    '三级': 'info',
    '初级': 'info'
  }
  return map[level] || 'info'
}

// 状态标签类型
function getStatusType(status) {
  const map = {
    'pending': 'warning',
    'approved': 'success',
    'rejected': 'danger'
  }
  return map[status] || 'info'
}

// 状态标签文本
function getStatusLabel(status) {
  const map = {
    'pending': '待审核',
    'approved': '已通过',
    'rejected': '已拒绝'
  }
  return map[status] || status
}

// 过滤后的裁判列表
const filteredReferees = computed(() => {
  switch (activeTab.value) {
    case 'pending':
      return referees.value.filter(r => r.status === 'pending')
    case 'myAssignments':
      return referees.value.filter(r => r.userId === userId.value)
    default:
      return referees.value
  }
})

// 检查是否可以编辑裁判
function canEditReferee(referee) {
  if (canAddReferee.value || canApproveReferee.value) return true
  return referee.creatorId === userId.value || referee.userId === userId.value
}

// 加载赛事裁判组（从各场比赛聚合）
async function loadTournamentGroups() {
  groupsLoading.value = true
  try {
    // 1. 加载所有赛事
    const tournaments = await queryList('tournaments', {
      orderBy: { createTime: 'desc' }
    })

    // 2. 对每个赛事加载比赛并聚合裁判
    const groups = []
    for (const t of tournaments || []) {
      const matches = await queryList('matches', {
        where: { tournamentId: t._id }
      })

      const refereeMap = new Map()
      for (const match of matches || []) {
        const crew = match.refereeCrew || {}
        const roles = [
          { key: 'mainReferee', label: '主裁判' },
          { key: 'assistant1', label: '助理裁判1' },
          { key: 'assistant2', label: '助理裁判2' },
          { key: 'fourthOfficial', label: '第四官员' }
        ]
        for (const r of roles) {
          const ref = crew[r.key]
          if (ref && ref.name) {
            const refId = ref._id || ref.name
            if (!refereeMap.has(refId)) {
              refereeMap.set(refId, {
                refereeId: ref._id || '',
                refereeName: ref.name,
                roles: new Set(),
                isHeadReferee: false
              })
            }
            refereeMap.get(refId).roles.add(r.label)
          }
        }
      }

      if (refereeMap.size === 0) continue

      // 3. 查询 tournament_referees 获取裁判长标记
      try {
        const headRes = await queryList('tournament_referees', {
          where: { tournamentId: t._id, isHeadReferee: true }
        })
        if (headRes && headRes.length > 0) {
          const headId = headRes[0].refereeId
          for (const item of refereeMap.values()) {
            if (item.refereeId === headId) {
              item.isHeadReferee = true
            }
          }
        }
      } catch (e) {
        // ignore
      }

      groups.push({
        tournamentId: t._id,
        tournamentName: t.name,
        referees: Array.from(refereeMap.values()).map(item => ({
          ...item,
          roleLabel: Array.from(item.roles).join('、') || '裁判'
        }))
      })
    }

    tournamentGroups.value = groups
  } catch (err) {
    console.error('加载裁判组失败:', err)
    ElMessage.error('加载裁判组失败')
  } finally {
    groupsLoading.value = false
  }
}

// 设置裁判长
async function setHeadReferee(tournamentId, refereeId, refereeName) {
  try {
    await callFunction('setHeadReferee', {
      action: 'set',
      tournamentId,
      refereeId,
      refereeName
    })
    ElMessage.success('已设置裁判长')
    await loadTournamentGroups()
  } catch (err) {
    console.error('设置裁判长失败:', err)
    ElMessage.error('设置失败: ' + (err.message || '未知错误'))
  }
}

// 加载裁判列表
async function loadReferees() {
  loading.value = true
  try {
    if (canViewAllReferees.value) {
      // 主办方/管理员查看所有裁判（referees 集合可能尚不存在）
      try {
        referees.value = await queryList('referees', { orderBy: { createTime: 'desc' } })
      } catch (e) {
        console.info('[referees] referees 集合尚不存在')
        referees.value = []
      }
    } else if (currentRole.value === ROLES.REFEREE) {
      // 裁判查看自己
      try {
        referees.value = await queryList('referees', {
          where: { userId: userId.value },
          orderBy: { createTime: 'desc' }
        })
      } catch (e) {
        console.info('[referees] referees 集合尚不存在')
        referees.value = []
      }
    } else {
      referees.value = []
    }
  } catch (err) {
    console.error('加载裁判列表失败:', err)
    ElMessage.error('加载裁判列表失败')
  } finally {
    loading.value = false
  }
}

// 加载我的赛事（用于邀请裁判）
async function loadMyTournaments() {
  try {
    myTournaments.value = await queryList('tournaments', {
      where: { creatorId: userId.value },
      orderBy: { createTime: 'desc' }
    })
  } catch (err) {
    console.error('加载赛事列表失败:', err)
  }
}

// 提交裁判信息（添加/编辑）
async function submitReferee() {
  if (!refereeForm.value.name.trim()) {
    ElMessage.warning('请输入裁判姓名')
    return
  }
  if (!refereeForm.value.phone.trim()) {
    ElMessage.warning('请输入联系电话')
    return
  }

  submitting.value = true
  try {
    const data = {
      ...refereeForm.value,
      status: 'approved', // 主办方添加的直接通过
      creatorId: userId.value,
      creatorRole: currentRole.value
    }

    if (isEditing.value) {
      await updateRecord('referees', editingId.value, data)
      ElMessage.success('保存成功')
    } else {
      await addRecord('referees', data)
      ElMessage.success('添加成功')
    }
    showAddDialog.value = false
    resetForm()
    loadReferees()
  } catch (err) {
    ElMessage.error('操作失败: ' + err.message)
  } finally {
    submitting.value = false
  }
}

// 提交裁判申请
async function submitApply() {
  if (!applyForm.value.name.trim()) {
    ElMessage.warning('请输入您的姓名')
    return
  }
  if (!applyForm.value.phone.trim()) {
    ElMessage.warning('请输入联系电话')
    return
  }

  submitting.value = true
  try {
    const data = {
      ...applyForm.value,
      userId: userId.value,
      status: 'pending', // 申请状态为待审核
      applyTime: new Date().toISOString()
    }

    await addRecord('referees', data)
    ElMessage.success('申请已提交，请等待审核')
    showApplyDialog.value = false
    resetApplyForm()
    loadReferees()
  } catch (err) {
    ElMessage.error('申请失败: ' + err.message)
  } finally {
    submitting.value = false
  }
}

// 审核通过
async function approveReferee(referee) {
  try {
    await updateRecord('referees', referee._id, { 
      status: 'approved',
      approveTime: new Date().toISOString(),
      approverId: userId.value
    })
    ElMessage.success('审核通过')
    loadReferees()
  } catch (err) {
    ElMessage.error('操作失败: ' + err.message)
  }
}

// 审核拒绝
async function rejectReferee(referee) {
  try {
    await ElMessageBox.confirm(`确定拒绝「${referee.name}」的裁判申请吗？`, '确认', {
      type: 'warning'
    })
    await updateRecord('referees', referee._id, { 
      status: 'rejected',
      rejectTime: new Date().toISOString(),
      rejecterId: userId.value
    })
    ElMessage.success('已拒绝')
    loadReferees()
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error('操作失败: ' + err.message)
    }
  }
}

// 邀请裁判
function inviteReferee(referee) {
  currentReferee.value = referee
  inviteForm.value = { tournamentId: '', message: '' }
  showInviteDialog.value = true
  loadMyTournaments()
}

// 提交邀请
async function submitInvite() {
  if (!inviteForm.value.tournamentId) {
    ElMessage.warning('请选择赛事')
    return
  }

  submitting.value = true
  try {
    const tournament = myTournaments.value.find(t => t._id === inviteForm.value.tournamentId)
    
    // 创建邀请记录
    await addRecord('referee_invitations', {
      refereeId: currentReferee.value._id,
      refereeName: currentReferee.value.name,
      tournamentId: inviteForm.value.tournamentId,
      tournamentName: tournament?.name || '',
      message: inviteForm.value.message,
      status: 'pending',
      createTime: new Date().toISOString(),
      inviterId: userId.value
    })

    ElMessage.success('邀请已发送')
    showInviteDialog.value = false
  } catch (err) {
    ElMessage.error('邀请失败: ' + err.message)
  } finally {
    submitting.value = false
  }
}

// 编辑裁判
function editReferee(referee) {
  isEditing.value = true
  editingId.value = referee._id
  refereeForm.value = {
    name: referee.name || '',
    phone: referee.phone || '',
    level: referee.level || '初级',
    region: referee.region || '',
    certNumber: referee.certNumber || '',
    remark: referee.remark || ''
  }
  showAddDialog.value = true
}

// 删除裁判
async function deleteReferee(referee) {
  try {
    await ElMessageBox.confirm(`确定删除裁判「${referee.name}」吗？`, '确认', {
      type: 'warning'
    })
    await deleteRecord('referees', referee._id)
    ElMessage.success('删除成功')
    loadReferees()
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error('删除失败: ' + err.message)
    }
  }
}

// 重置表单
function resetForm() {
  refereeForm.value = {
    name: '',
    phone: '',
    level: '初级',
    region: '',
    certNumber: '',
    remark: ''
  }
  isEditing.value = false
  editingId.value = ''
}

function resetApplyForm() {
  applyForm.value = {
    name: '',
    phone: '',
    level: '初级',
    region: '',
    certNumber: '',
    bio: ''
  }
}

function handleTabChange(tab) {
  // 标签切换时重新加载数据
  if (tab === 'groups') {
    loadTournamentGroups()
  } else if (tab === 'committee') {
    loadCommittee()
  } else {
    loadReferees()
  }
}

// 监听对话框关闭
watch(showAddDialog, (val) => {
  if (!val) resetForm()
})

watch(showApplyDialog, (val) => {
  if (!val) resetApplyForm()
})


// ========= 裁判委员会相关 =========
const committeeLoading = ref(false)
const tournamentCommittees = ref([])
const showCommitteeDialog = ref(false)
const isEditingCommittee = ref(false)
const editingMemberId = ref('')
const currentCommitteeTournamentId = ref('')
const currentCommitteeTournamentName = ref('')
const committeeForm = ref({
  refereeId: '',
  refereeName: '',
  role: '',
  responsibilities: ''
})
const committeeRoles = [
  { value: 'director', label: '主任', desc: '全面领导裁判委员会工作，拥有最终决策权' },
  { value: 'deputy', label: '副主任', desc: '协助主任，分管特定领域（如技术、选派、评估、VAR等）' },
  { value: 'committee', label: '委员', desc: '由资深裁判专家、前国际级裁判等组成，参与政策制定与重大事项表决' },
  { value: 'supervisor', label: '裁判监督/评估员', desc: '负责现场观察与赛后评估裁判表现，提交评估报告' },
  { value: 'lecturer', label: '裁判讲师', desc: '负责赛前培训、规则解读及裁判员能力提升' },
  { value: 'coordinator', label: '裁判组协调员', desc: '负责裁判团队的日程、后勤、通讯等事务协调' }
]
const committeeRefereeOptions = ref([])
const committeeRefereeLoading = ref(false)

// 加载所有裁判（用于委员会成员选择，预加载后由 el-select filterable 本地过滤）
async function loadCommitteeReferees() {
  committeeRefereeLoading.value = true
  try {
    const res = await queryList('referees', { orderBy: { createTime: 'desc' } })
    committeeRefereeOptions.value = res || []
  } catch (err) {
    console.error('加载裁判列表失败:', err)
  } finally {
    committeeRefereeLoading.value = false
  }
}

// 裁判选择变更
function onCommitteeRefereeChange(refId) {
  const ref = committeeRefereeOptions.value.find(r => r._id === refId)
  if (ref) {
    committeeForm.value.refereeName = ref.name || ''
  }
}


// 按赛事加载裁判委员会
async function loadCommittee() {
  committeeLoading.value = true
  try {
    const tournaments = await queryList('tournaments', {
      orderBy: { createTime: 'desc' }
    })

    const result = []
    for (const t of tournaments || []) {
      let enabled = false
      try {
        const tRes = await callFunction('manageRefereeCommittee', {
          action: 'list',
          tournamentId: t._id
        })
        if (tRes.code === 0) {
          enabled = tRes.enabled || false
          const members = tRes.data || []
          const roleOrder = ['director', 'deputy', 'committee', 'supervisor', 'lecturer', 'coordinator']
          const groupedMembers = []
          for (const role of roleOrder) {
            const ms = members.filter(m => m.role === role)
            if (ms.length > 0) {
              const roleInfo = committeeRoles.find(r => r.value === role)
              groupedMembers.push({ role, label: roleInfo?.label || role, members: ms })
            }
          }
          const otherMembers = members.filter(m => !roleOrder.includes(m.role))
          if (otherMembers.length > 0) {
            groupedMembers.push({ role: 'other', label: '其他', members: otherMembers })
          }

          result.push({
            tournamentId: t._id,
            tournamentName: t.name,
            enabled,
            members,
            groupedMembers
          })
        }
      } catch (e) {
        result.push({
          tournamentId: t._id,
          tournamentName: t.name,
          enabled: false,
          members: [],
          groupedMembers: []
        })
      }
    }

    tournamentCommittees.value = result
  } catch (err) {
    console.error('加载裁判委员会失败:', err)
    ElMessage.error('加载裁判委员会失败')
  } finally {
    committeeLoading.value = false
  }
}
async function toggleTournamentCommittee(tournamentId, val) {
  try {
    const res = await callFunction('manageRefereeCommittee', {
      action: 'toggleEnabled',
      tournamentId,
      enabled: val
    })
    if (res.code === 0) {
      ElMessage.success(val ? '已启用裁判委员会' : '已禁用裁判委员会')
      await loadCommittee()
    } else {
      ElMessage.error(res.message)
      const tc = tournamentCommittees.value.find(t => t.tournamentId === tournamentId)
      if (tc) tc.enabled = !val
    }
  } catch (err) {
    console.error('切换失败:', err)
    ElMessage.error('操作失败: ' + (err.message || '未知错误'))
    const tc = tournamentCommittees.value.find(t => t.tournamentId === tournamentId)
    if (tc) tc.enabled = !val
  }
}
function openCommitteeDialog(tournamentId, tournamentName) {
  currentCommitteeTournamentId.value = tournamentId
  currentCommitteeTournamentName.value = tournamentName
  isEditingCommittee.value = false
  editingMemberId.value = ''
  committeeForm.value = { refereeId: '', refereeName: '', role: '', responsibilities: '' }
  showCommitteeDialog.value = true
  loadCommitteeReferees()
}
function editCommitteeMember(member, tournamentId) {
  currentCommitteeTournamentId.value = tournamentId
  isEditingCommittee.value = true
  editingMemberId.value = member._id
  committeeForm.value = { refereeId: member.refereeId || '', refereeName: member.refereeName || '', role: member.role || '', responsibilities: member.responsibilities || '' }
  showCommitteeDialog.value = true
  loadCommitteeReferees()
}
async function submitCommitteeForm() {
  if (!committeeForm.value.refereeId) { ElMessage.warning('请选择裁判'); return }
  if (!committeeForm.value.role) { ElMessage.warning('请选择角色'); return }
  if (!currentCommitteeTournamentId.value) { ElMessage.warning('缺少赛事信息'); return }
  submitting.value = true
  try {
    const params = {
      action: isEditingCommittee.value ? 'update' : 'create',
      tournamentId: currentCommitteeTournamentId.value,
      refereeId: committeeForm.value.refereeId,
      refereeName: committeeForm.value.refereeName,
      role: committeeForm.value.role,
      responsibilities: committeeForm.value.responsibilities
    }
    if (isEditingCommittee.value) params.memberId = editingMemberId.value
    const res = await callFunction('manageRefereeCommittee', params)
    if (res.code === 0) { ElMessage.success(isEditingCommittee.value ? '更新成功' : '添加成功'); showCommitteeDialog.value = false; await loadCommittee() } else { ElMessage.error(res.message || '操作失败') }
  } catch (err) { console.error('提交失败:', err); ElMessage.error('操作失败: ' + (err.message || '未知错误')) } finally { submitting.value = false }
}
async function deleteCommitteeMember(member) {
  try {
    await ElMessageBox.confirm(`确定移除「${member.refereeName}」的裁判委员会成员身份吗？`, '确认移除', { type: 'warning' })
    const res = await callFunction('manageRefereeCommittee', { action: 'delete', memberId: member._id })
    if (res.code === 0) { ElMessage.success('移除成功'); await loadCommittee() } else { ElMessage.error(res.message || '移除失败') }
  } catch (err) { if (err !== 'cancel') { console.error('删除失败:', err); ElMessage.error('移除失败: ' + (err.message || '未知错误')) } }
}

onMounted(() => {
  loadReferees()
  
  // 设置默认标签页
  if (currentRole.value === ROLES.REFEREE) {
    activeTab.value = 'myAssignments'
  } else if (canApproveReferee.value) {
    activeTab.value = 'all'
  }
})
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.referee-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
  padding: 16px 0;
}

.referee-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  border: 1px solid #ebeef5;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: all 0.3s ease;
}

.referee-card:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.referee-avatar {
  border: 2px solid #f0f0f0;
  flex-shrink: 0;
}

.card-info {
  flex: 1;
  min-width: 0;
}

.referee-name {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 8px 0;
}

.referee-level {
  display: flex;
  align-items: center;
}

.card-body {
  margin-bottom: 16px;
}

.info-item {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;
}

.info-item .label {
  color: #909399;
  min-width: 70px;
}

.info-item .value {
  color: #606266;
}

.card-footer {
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid #f5f7fa;
}

.el-empty {
  grid-column: 1 / -1;
  padding: 60px 0;
}

/* 裁判组 */
.referee-groups {
  padding: 16px 0;
}

.group-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.tournament-group-card {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #ebeef5;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #f8fafc;
  border-bottom: 1px solid #ebeef5;
}

.group-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}

.group-referees {
  padding: 12px 20px;
}

.group-referee-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
}

.group-referee-row:last-child {
  border-bottom: none;
}

.group-referee-row .referee-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.group-referee-row .referee-name {
  font-weight: 600;
  font-size: 15px;
  color: #1f2937;
}

.group-referee-row .referee-role {
  color: #64748b;
  font-size: 13px;
}

/* 裁判委员会 */
.committee-section {
  padding: 16px 0;
}

.committee-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 16px 20px;
  background: #f8fafc;
  border-radius: 10px;
}

.committee-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}

.committee-actions {
  margin-bottom: 16px;
}

.committee-members {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.role-group {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #ebeef5;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  overflow: hidden;
}

.role-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
  padding: 14px 20px;
  background: #f8fafc;
  border-bottom: 1px solid #ebeef5;
  display: flex;
  align-items: center;
  gap: 8px;
}

.role-title .el-tag {
  font-size: 12px;
}

.member-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  border-bottom: 1px solid #f0f0f0;
  transition: background 0.2s;
}

.member-card:last-child {
  border-bottom: none;
}

.member-card:hover {
  background: #f8fafc;
}

.member-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.member-detail {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.member-name {
  font-weight: 600;
  font-size: 14px;
  color: #1f2937;
}

.member-desc {
  font-size: 12px;
  color: #64748b;
}

.member-actions {
  display: flex;
  gap: 8px;
}

</style>
