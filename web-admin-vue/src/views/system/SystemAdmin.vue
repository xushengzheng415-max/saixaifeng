<template>
  <div class="system-admin">
    <div class="page-card">
      <div class="page-header">
        <h2>系统管理</h2>
      </div>

      <!-- 数据清理区域 -->
      <el-card class="admin-card" style="margin-top: 20px;">
        <template #header>
          <div class="card-header">
            <h3>数据清理</h3>
          </div>
        </template>

        <div class="cleanup-section">
          <p class="description">清理不再被任何球队引用的球员记录（孤儿记录）</p>
          
          <div class="actions">
            <el-button 
              type="warning" 
              :loading="scanning" 
              @click="scanOrphanPlayers"
            >
              <el-icon><Search /></el-icon>
              扫描冗余数据
            </el-button>

            <el-button 
              v-if="orphanPlayers.length > 0" 
              type="danger" 
              :loading="deleting" 
              @click="deleteOrphanPlayers"
            >
              <el-icon><Delete /></el-icon>
              删除冗余数据 ({{ orphanPlayers.length }} 条)
            </el-button>
          </div>

          <!-- 扫描结果 -->
          <div v-if="orphanPlayers.length > 0" class="scan-result">
            <el-alert
              :title="`找到 ${orphanPlayers.length} 条孤儿球员记录`"
              type="warning"
              :closable="false"
              show-icon
              style="margin-bottom: 16px;"
            />

            <el-table :data="orphanPlayers" style="width: 100%;" max-height="400">
              <el-table-column prop="name" label="姓名" width="120" />
              <el-table-column prop="idCard" label="身份证号" width="180" />
              <el-table-column label="关联球队ID" width="200">
                <template #default="{ row }">
                  <span v-if="row.teamId">{{ row.teamId }}</span>
                  <span v-else-if="row.teamCode">{{ row.teamCode }}</span>
                  <el-tag v-else type="danger" size="small">无关联</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="100">
                <template #default="{ row }">
                  <el-button type="primary" link size="small" @click="viewPlayer(row)">
                    查看
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <div v-else-if="scanned" class="scan-result">
            <el-alert
              title="未找到孤儿球员记录"
              type="success"
              :closable="false"
              show-icon
            />
          </div>
        </div>
      </el-card>

      <!-- 其他系统管理功能可以在这里添加 -->
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Delete } from '@element-plus/icons-vue'
import { callFunction } from '@/utils/cloud'

const scanning = ref(false)
const deleting = ref(false)
const scanned = ref(false)
const orphanPlayers = ref([])

// 扫描孤儿球员记录
async function scanOrphanPlayers() {
  scanning.value = true
  try {
    const res = await callFunction('cleanupOrphanPlayers', { dryRun: true })
    
    if (res && res.success) {
      orphanPlayers.value = res.orphanPlayers || []
      scanned.value = true
      
      if (orphanPlayers.value.length > 0) {
        ElMessage.warning(`找到 ${orphanPlayers.value.length} 条孤儿球员记录`)
      } else {
        ElMessage.success('未找到孤儿球员记录')
      }
    } else {
      const msg = res?.message || '扫描失败'
      ElMessage.error(msg)
    }
  } catch (err) {
    console.error('扫描失败:', err)
    ElMessage.error('扫描失败: ' + err.message)
  } finally {
    scanning.value = false
  }
}

// 删除孤儿球员记录
async function deleteOrphanPlayers() {
  if (orphanPlayers.value.length === 0) return
  
  try {
    await ElMessageBox.confirm(
      `确定删除 ${orphanPlayers.value.length} 条孤儿球员记录吗？此操作不可恢复！`,
      '删除确认',
      { type: 'warning' }
    )
    
    deleting.value = true
    
    const res = await callFunction('cleanupOrphanPlayers', { dryRun: false })
    
    if (res && res.success) {
      ElMessage.success(`成功删除 ${res.deletedCount} 条记录`)
      orphanPlayers.value = []
      scanned.value = true
    } else {
      const msg = res?.message || '删除失败'
      ElMessage.error(msg)
    }
  } catch (err) {
    if (err !== 'cancel') {
      console.error('删除失败:', err)
      ElMessage.error('删除失败: ' + err.message)
    }
  } finally {
    deleting.value = false
  }
}

// 查看球员详情（可以跳转到球员详情页面）
function viewPlayer(player) {
  // TODO(2024-01): 可以实现一个预览对话框，或者跳转到球员详情页
  ElMessage.info('球员详情功能开发中...')
}
</script>

<style scoped>
.system-admin {
  padding: 20px;
}

.page-card {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.admin-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header h3 {
  margin: 0;
  font-size: 16px;
}

.cleanup-section {
  padding: 10px 0;
}

.description {
  color: #606266;
  margin-bottom: 20px;
  font-size: 14px;
}

.actions {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.scan-result {
  margin-top: 20px;
}
</style>
