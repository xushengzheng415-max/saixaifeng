<template>
  <div class="account-management">
    <div class="section-header">
      <h3>白名单账号管理</h3>
      <el-button type="primary" @click="showAddDialog">
        <el-icon><Plus /></el-icon>添加账号
      </el-button>
    </div>

    <!-- 账号列表 -->
    <el-table :data="accounts" v-loading="loading" border>
      <el-table-column type="index" width="60" label="序号" />
      <el-table-column prop="phone" label="手机号" width="140" />
      <el-table-column prop="displayName" label="姓名" width="120" />
      <el-table-column label="角色" width="130">
        <template #default="{ row }">
          <el-tag :type="row.role === 'super_admin' ? 'danger' : 'warning'" size="small">
            {{ row.role === 'super_admin' ? '超级管理员' : '管理员' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-switch
            :model-value="row.status === 'active'"
            :loading="row._toggling"
            @change="toggleStatus(row)"
            active-text="启用"
            inactive-text="禁用"
          />
        </template>
      </el-table-column>
      <el-table-column prop="createdBy" label="创建人" width="140" />
      <el-table-column label="创建时间" width="170">
        <template #default="{ row }">
          {{ formatTime(row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column label="最后登录" width="170">
        <template #default="{ row }">
          {{ formatTime(row.lastLoginAt) || '尚未登录' }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button
            type="danger"
            link
            :disabled="row.phone === currentUserPhone"
            @click="confirmRemove(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 添加账号弹窗 -->
    <el-dialog v-model="dialogVisible" title="添加白名单账号" width="480px" :close-on-click-modal="false">
      <el-form :model="form" :rules="formRules" ref="formRef" label-width="80px">
        <el-form-item label="手机号" prop="phone">
          <el-input
            v-model="form.phone"
            placeholder="请输入手机号"
            maxlength="11"
            :disabled="form._submitting"
          />
        </el-form-item>
        <el-form-item label="姓名" prop="displayName">
          <el-input
            v-model="form.displayName"
            placeholder="请输入姓名"
            maxlength="20"
            :disabled="form._submitting"
          />
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <el-select v-model="form.role" placeholder="请选择角色" style="width: 100%" :disabled="form._submitting">
            <el-option label="超级管理员" value="super_admin" />
            <el-option label="管理员" value="admin" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false" :disabled="form._submitting">取消</el-button>
        <el-button type="primary" @click="submitAdd" :loading="form._submitting">确定添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { callFunction } from '@/utils/cloud'

// ========== 当前用户 ==========
const currentUserPhone = computed(() => {
  return localStorage.getItem('tc_phone') || ''
})

// ========== 数据状态 ==========
const accounts = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const formRef = ref(null)

const form = reactive({
  phone: '',
  displayName: '',
  role: 'admin',
  _submitting: false
})

const formRules = {
  phone: [
    { required: true, message: '请输入手机号', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确', trigger: 'blur' }
  ],
  displayName: [
    { required: true, message: '请输入姓名', trigger: 'blur' }
  ],
  role: [
    { required: true, message: '请选择角色', trigger: 'change' }
  ]
}

// ========== 工具函数 ==========
function formatTime(dateVal) {
  if (!dateVal) return ''
  try {
    const d = new Date(dateVal)
    if (isNaN(d.getTime())) return ''
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return ''
  }
}

// ========== 数据获取 ==========
async function fetchAccounts() {
  loading.value = true
  try {
    const result = await callFunction('manageTournamentCenterAccounts', {
      action: 'list',
      operatorPhone: currentUserPhone.value
    })
    if (result.success) {
      accounts.value = (result.data || []).map(item => ({
        ...item,
        _toggling: false
      }))
    } else {
      ElMessage.error(result.error || '获取账号列表失败')
    }
  } catch (err) {
    console.error('获取账号列表失败:', err)
    ElMessage.error('获取账号列表失败')
  } finally {
    loading.value = false
  }
}

// ========== 操作 ==========

function showAddDialog() {
  form.phone = ''
  form.displayName = ''
  form.role = 'admin'
  form._submitting = false
  dialogVisible.value = true
  // 重置表单校验
  setTimeout(() => {
    formRef.value?.resetFields()
  }, 50)
}

async function submitAdd() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  form._submitting = true
  try {
    const result = await callFunction('manageTournamentCenterAccounts', {
      action: 'add',
      phone: form.phone,
      displayName: form.displayName,
      role: form.role,
      operatorPhone: currentUserPhone.value
    })

    if (result.success) {
      ElMessage.success('账号添加成功')
      dialogVisible.value = false
      fetchAccounts()
    } else {
      ElMessage.error(result.error || '添加失败')
    }
  } catch (err) {
    console.error('添加账号失败:', err)
    ElMessage.error('添加账号失败')
  } finally {
    form._submitting = false
  }
}

async function toggleStatus(row) {
  if (row.phone === currentUserPhone.value) {
    ElMessage.warning('不能禁用自己的账号')
    return
  }

  row._toggling = true
  try {
    const result = await callFunction('manageTournamentCenterAccounts', {
      action: 'toggle',
      phone: row.phone,
      operatorPhone: currentUserPhone.value
    })

    if (result.success) {
      row.status = result.newStatus
      ElMessage.success(result.message)
    } else {
      ElMessage.error(result.error || '操作失败')
    }
  } catch (err) {
    console.error('切换状态失败:', err)
    ElMessage.error('操作失败')
  } finally {
    row._toggling = false
  }
}

async function confirmRemove(row) {
  if (row.phone === currentUserPhone.value) {
    ElMessage.warning('不能删除自己的账号')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定要删除账号 ${row.displayName || row.phone} 吗？删除后不可恢复。`,
      '确认删除',
      { type: 'warning', confirmButtonText: '确定删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }

  try {
    const result = await callFunction('manageTournamentCenterAccounts', {
      action: 'remove',
      phone: row.phone,
      operatorPhone: currentUserPhone.value
    })

    if (result.success) {
      ElMessage.success('账号已删除')
      fetchAccounts()
    } else {
      ElMessage.error(result.error || '删除失败')
    }
  } catch (err) {
    console.error('删除账号失败:', err)
    ElMessage.error('删除失败')
  }
}

// ========== 初始化 ==========
onMounted(() => {
  fetchAccounts()
})
</script>

<style scoped>
.account-management {
  padding-top: 0;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.section-header h3 {
  margin: 0;
  font-size: 18px;
  color: #303133;
}
</style>
