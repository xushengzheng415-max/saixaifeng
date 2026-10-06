<template>
  <div class="data-manager">
    <div class="page-card">
      <div class="page-header">
        <h2>数据管理</h2>
        <el-button type="primary" @click="refreshData">
          <el-icon><Refresh /></el-icon>刷新数据
        </el-button>
      </div>

      <!-- 警告提示 -->
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        style="margin-bottom: 20px;"
      >
        <template #title>
          <strong>危险操作区域！</strong> 删除数据将永久清除，且无法恢复。
          请谨慎操作！
        </template>
      </el-alert>

      <!-- 数据概览 -->
      <div class="data-overview">
        <el-row :gutter="16">
          <el-col :span="6" v-for="item in dataStats" :key="item.name">
            <div class="stat-card">
              <div class="stat-value">{{ item.count }}</div>
              <div class="stat-label">{{ item.name }}</div>
            </div>
          </el-col>
        </el-row>
      </div>

      <!-- 批量操作 -->
      <div class="batch-actions">
        <h3>批量操作</h3>

        <!-- 一键清空所有测试数据 -->
        <div class="action-section">
          <h4>清空测试数据（推荐）</h4>
          <p class="action-desc">一键清空所有生成的测试数据（赛事、球队、球员、证件等），保留系统基础数据。</p>
          <el-button type="danger" @click="clearAllTestData" :loading="clearing">
            <el-icon><Delete /></el-icon>一键清空测试数据
          </el-button>
        </div>

        <!-- 单独清空各集合 -->
        <div class="action-section">
          <h4>单独清空集合</h4>
          <p class="action-desc">单独清空某个集合的数据，请谨慎操作。</p>
          
          <div class="collection-list">
            <div v-for="item in dataStats" :key="item.name" class="collection-item">
              <span class="collection-name">{{ item.name }}</span>
              <span class="collection-count">{{ item.count }} 条</span>
              <el-button 
                type="danger" 
                size="small" 
                plain
                @click="clearCollection(item.name)"
                :loading="clearing"
                :disabled="item.count === 0"
              >
                清空
              </el-button>
            </div>
          </div>
        </div>
      </div>

      <!-- 重新生成测试数据 -->
      <div class="action-section" style="margin-top: 30px;">
        <h3>生成测试数据</h3>
        <p class="action-desc">生成完整的测试数据，包括赛事、球队、球员等。</p>
        <el-button type="success" @click="generateTestData" :loading="generating">
          <el-icon><Plus /></el-icon>生成测试数据
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Delete, Plus } from '@element-plus/icons-vue'
import { queryList, batchDelete, deleteAllRecords, callFunction } from '../../utils/cloud'

const clearing = ref(false)
const generating = ref(false)

const dataStats = ref([
  { name: '赛事', collection: 'tournaments', count: 0 },
  { name: '球队', collection: 'teams', count: 0 },
  { name: '球员', collection: 'players', count: 0 },
  { name: '赛事-球队关联', collection: 'tournament_teams', count: 0 },
  { name: '球员证件', collection: 'player_cards', count: 0 },
  { name: '证件照片', collection: 'identity_cards', count: 0 }
])

async function refreshData() {
  for (const item of dataStats.value) {
    try {
      const records = await queryList(item.collection, { limit: 1000 })
      item.count = records.length
    } catch (err) {
      console.error(`查询 ${item.collection} 失败:`, err)
      item.count = '?'
    }
  }
}

async function clearCollection(collectionName) {
  try {
    await ElMessageBox.confirm(
      `确定要清空「${collectionName}」集合的所有数据吗？此操作不可恢复！`,
      '危险操作确认',
      {
        type: 'warning',
        confirmButtonText: '确定清空',
        cancelButtonText: '取消',
        confirmButtonClass: 'el-button--danger'
      }
    )

    clearing.value = true
    ElMessage.info('正在清空数据...')

    const result = await deleteAllRecords(collectionName)
    
    ElMessage.success(result.message || '清空成功')
    await refreshData()
  } catch (err) {
    if (err !== 'cancel') {
      console.error('清空失败:', err)
      ElMessage.error('清空失败: ' + err.message)
    }
  } finally {
    clearing.value = false
  }
}

async function clearAllTestData() {
  try {
    await ElMessageBox.confirm(
      '确定要清空所有测试数据吗？这将删除所有赛事、球队、球员、证件等数据！\n\n此操作不可恢复！',
      '危险操作确认',
      {
        type: 'warning',
        confirmButtonText: '确定清空所有数据',
        cancelButtonText: '取消',
        confirmButtonClass: 'el-button--danger'
      }
    )

    clearing.value = true
    ElMessage.info('正在清空所有测试数据...')

    // 按顺序清空（考虑外键关系）
    const collections = [
      'player_cards',
      'identity_cards',
      'tournament_teams',
      'players',
      'teams',
      'matches',
      'tournaments'
    ]

    for (const collection of collections) {
      try {
        const result = await deleteAllRecords(collection)
      } catch (err) {
        console.error(`清空 ${collection} 失败:`, err)
      }
    }

    ElMessage.success('所有测试数据已清空！')
    await refreshData()
  } catch (err) {
    if (err !== 'cancel') {
      console.error('清空失败:', err)
      ElMessage.error('清空失败: ' + err.message)
    }
  } finally {
    clearing.value = false
  }
}

async function generateTestData() {
  try {
    await ElMessageBox.confirm(
      '将生成完整的测试数据，包括：\n\n• 1 个赛事\n• 8 支球队\n• 80 名球员\n• 球队报名信息\n• 球员证件\n\n是否继续？',
      '生成测试数据',
      {
        type: 'info',
        confirmButtonText: '开始生成',
        cancelButtonText: '取消'
      }
    )

    generating.value = true
    ElMessage.info('正在生成测试数据，请稍候...')

    const result = await callFunction('generateTestData', {})
    
    if (result && result.success) {
      ElMessage.success({
        message: `测试数据生成成功！\n${result.message}`,
        duration: 5000
      })
    } else {
      throw new Error(result?.message || '生成失败')
    }
    
    await refreshData()
  } catch (err) {
    if (err !== 'cancel') {
      console.error('生成测试数据失败:', err)
      ElMessage.error('生成失败: ' + (err.message || '请检查云函数是否已部署'))
    }
  } finally {
    generating.value = false
  }
}

onMounted(() => {
  refreshData()
})
</script>

<style scoped>
.data-overview {
  margin-bottom: 30px;
}

.stat-card {
  background: linear-gradient(135deg, #1B5E20 0%, #2E7D32 100%);
  color: white;
  padding: 20px;
  border-radius: 12px;
  text-align: center;
}

.stat-value {
  font-size: 32px;
  font-weight: bold;
  margin-bottom: 8px;
}

.stat-label {
  font-size: 14px;
  opacity: 0.9;
}

.batch-actions {
  margin-top: 20px;
}

.batch-actions h3 {
  margin-bottom: 16px;
  color: #303133;
}

.action-section {
  background: #f5f7fa;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.action-section h4 {
  margin: 0 0 8px 0;
  color: #303133;
}

.action-desc {
  color: #909399;
  font-size: 13px;
  margin-bottom: 12px;
}

.collection-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.collection-item {
  display: flex;
  align-items: center;
  gap: 8px;
  background: white;
  padding: 8px 16px;
  border-radius: 20px;
  border: 1px solid #e4e7ed;
}

.collection-name {
  font-weight: 500;
}

.collection-count {
  color: #909399;
  font-size: 12px;
}
</style>
