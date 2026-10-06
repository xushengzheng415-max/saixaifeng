<template>
  <div class="test-page">
    <div class="page-card" style="margin-bottom: 24px;">
      <div class="page-header">
        <h2>测试数据生成</h2>
        <el-tag type="info" effect="plain" size="small">开发模式专用</el-tag>
      </div>

    </div>

    <!-- 配置区域 -->
    <div class="config-grid">
      <!-- 球队配置 -->
      <div class="config-card">
        <div class="config-header">
          <div class="config-icon" style="background: #e3f2fd; color: #1976D2;">
            <el-icon :size="24"><UserFilled /></el-icon>
          </div>
          <div>
            <h3>球队数量</h3>
            <p>每个赛事下的球队数</p>
          </div>
        </div>
        <div class="config-control">
          <el-slider v-model="teamCount" :min="2" :max="32" :step="2" show-stops />
          <div class="config-value">{{ teamCount }} 支</div>
        </div>
      </div>

      <!-- 球员配置 -->
      <div class="config-card">
        <div class="config-header">
          <div class="config-icon" style="background: #fff3e0; color: #E65100;">
            <el-icon :size="24"><User /></el-icon>
          </div>
          <div>
            <h3>每队球员数</h3>
            <p>每支球队的球员人数</p>
          </div>
        </div>
        <div class="config-control">
          <el-slider v-model="playerCount" :min="5" :max="30" :step="1" show-stops />
          <div class="config-value">{{ playerCount }} 人</div>
        </div>
      </div>

      <!-- 赛事配置 -->
      <div class="config-card">
        <div class="config-header">
          <div class="config-icon" style="background: #e8f5e9; color: #2E7D32;">
            <el-icon :size="24"><Trophy /></el-icon>
          </div>
          <div>
            <h3>赛事数量</h3>
            <p>自动生成赛事(4种赛制)</p>
          </div>
        </div>
        <div class="config-control">
          <el-slider v-model="tournamentCount" :min="1" :max="8" :step="1" show-stops />
          <div class="config-value">{{ tournamentCount }} 个</div>
        </div>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="action-bar">
      <el-button
        type="primary"
        size="large"
        :loading="generating"
        :disabled="generating"
        @click="handleGenerateAll"
      >
        <el-icon v-if="!generating" style="margin-right: 6px;"><MagicStick /></el-icon>
        一键生成全部（含海报+小程序码）
      </el-button>

      <el-button
        size="large"
        :loading="generating"
        :disabled="generating"
        @click="handleGenerateTeams"
      >
        仅生成球队+球员
      </el-button>

      <el-button
        type="danger"
        size="large"
        plain
        :loading="cleaning"
        :disabled="generating || cleaning"
        @click="handleCleanAll"
      >
        <el-icon style="margin-right: 6px;"><Delete /></el-icon>
        清空所有测试数据
      </el-button>
    </div>

    <!-- 预估信息 -->
    <div class="estimate-card">
      <h4>生成预估</h4>
      <div class="estimate-grid">
        <div class="estimate-item">
          <span class="estimate-label">赛事</span>
          <span class="estimate-value">{{ tournamentCount }} 个</span>
        </div>
        <div class="estimate-item">
          <span class="estimate-label">球队</span>
          <span class="estimate-value">{{ teamCount * tournamentCount }} 支</span>
        </div>
        <div class="estimate-item">
          <span class="estimate-label">球员</span>
          <span class="estimate-value">约 {{ teamCount * tournamentCount * playerCount }} 人</span>
        </div>
        <div class="estimate-item">
          <span class="estimate-label">参赛记录</span>
          <span class="estimate-value">{{ teamCount * tournamentCount }} 条</span>
        </div>
      </div>
      <p class="estimate-hint">* 赛制自动循环：赛会制 → 杯赛制 → 联赛制 → 复合制</p>
    </div>

    <!-- 生成结果 -->
    <div v-if="result" class="result-card" :class="result.success ? 'success' : 'error'">
      <div class="result-header">
        <el-icon :size="20">
          <CircleCheckFilled v-if="result.success" />
          <CircleCloseFilled v-else />
        </el-icon>
        <h4>{{ result.success ? '生成成功' : '生成失败' }}</h4>
      </div>
      <p class="result-message">{{ result.message }}</p>
      <div v-if="result.success && result.data" class="result-detail">
        <el-tag v-if="result.data.tournamentIds" type="success" effect="plain">
          赛事: {{ result.data.tournamentIds.length }}
        </el-tag>
        <el-tag v-if="result.data.teamCount" type="primary" effect="plain">
          球队: {{ result.data.teamCount }}
        </el-tag>
        <el-tag v-if="result.data.playerCount" type="warning" effect="plain">
          球员: {{ result.data.playerCount }}
        </el-tag>
      </div>
    </div>

    <!-- 日志 -->
    <div v-if="logs.length > 0" class="log-card">
      <div class="log-header">
        <h4>操作日志</h4>
        <el-button text size="small" @click="logs = []">清空</el-button>
      </div>
      <div class="log-list">
        <div v-for="(log, idx) in logs" :key="idx" class="log-item" :class="log.type">
          <span class="log-time">{{ log.time }}</span>
          <span class="log-msg">{{ log.msg }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Trophy, User, UserFilled, MagicStick, Delete,
  CircleCheckFilled, CircleCloseFilled
} from '@element-plus/icons-vue'
import { callFunction, queryList, batchDelete, deleteAllRecords, countRecords } from '../../utils/cloud'

const teamCount = ref(8)
const playerCount = ref(18)
const tournamentCount = ref(4)
const generating = ref(false)
const cleaning = ref(false)
const result = ref(null)
const logs = ref([])

function addLog(msg, type = 'info') {
  const now = new Date()
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map(n => String(n).padStart(2, '0')).join(':')
  logs.value.unshift({ time, msg, type })
  if (logs.value.length > 50) logs.value.pop()
}

/**
 * 一键生成全部测试数据（含海报+小程序码）
 */
async function handleGenerateAll() {
  try {
    await ElMessageBox.confirm(
      `将生成 ${tournamentCount.value} 个赛事，每个赛事 ${teamCount.value} 支球队（每队约 ${playerCount.value} 名球员），每个赛事将自动生成小程序码海报，确认继续？`,
      '确认生成',
      { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }

  generating.value = true
  result.value = null
  addLog('开始生成全部测试数据（含海报+小程序码）...')

  try {
    addLog(`调用云函数: generateTestData(generateAllWithPoster, ${tournamentCount.value}赛事, ${teamCount.value}球队)`)
    const res = await callFunction('generateTestData', {
      action: 'generateAllWithPoster',
      tournamentCount: tournamentCount.value,
      teamCount: teamCount.value
    })

    if (res.success) {
      result.value = res
      addLog(res.message, 'success')
      ElMessage.success(res.message)
    } else {
      result.value = res
      addLog('生成失败: ' + (res.message || '未知错误'), 'error')
      ElMessage.error(res.message || '生成失败')
    }
  } catch (err) {
    const errMsg = err.message || '云函数调用失败'
    result.value = { success: false, message: errMsg }
    addLog('调用异常: ' + errMsg, 'error')
    ElMessage.error(errMsg)
  } finally {
    generating.value = false
  }
}

/**
 * 仅生成球队+球员
 */
async function handleGenerateTeams() {
  try {
    await ElMessageBox.confirm(
      `将生成 ${teamCount.value} 支球队，每队约 ${playerCount.value} 名球员，确认继续？`,
      '确认生成',
      { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }

  generating.value = true
  result.value = null
  addLog('开始生成球队和球员...')

  try {
    addLog(`调用云函数: generateTestData(generateTeams, ${teamCount.value}球队)`)
    // 先生成球队，云函数会自动生成球员
    const teamIds = []
    for (let i = 0; i < teamCount.value; i++) {
      const res = await callFunction('generateTestData', {
        action: 'generatePlayers',
        teamId: 'new',
        count: playerCount.value
      })
      if (res.success) {
        addLog(`第 ${i + 1} 批球员生成: ${res.message}`, 'success')
      }
    }

    // 用 generateAll 的简化方式：生成1个赛事但不要赛事
    // 直接生成球队
    const res = await callFunction('generateTestData', {
      action: 'generateAll',
      tournamentCount: 1,
      teamCount: teamCount.value
    })

    if (res.success) {
      result.value = { success: true, message: `成功生成 ${teamCount.value} 支球队及球员`, data: res.data }
      addLog(`球队+球员生成完成`, 'success')
      ElMessage.success('球队和球员生成完成')
    } else {
      result.value = res
      addLog('生成失败: ' + (res.message || '未知错误'), 'error')
    }
  } catch (err) {
    const errMsg = err.message || '云函数调用失败'
    result.value = { success: false, message: errMsg }
    addLog('调用异常: ' + errMsg, 'error')
    ElMessage.error(errMsg)
  } finally {
    generating.value = false
  }
}

/**
 * 清空所有测试数据
 */
async function handleCleanAll() {
  try {
    await ElMessageBox.confirm(
      '⚠️ 此操作将清空所有集合中的数据（teams, players, tournaments, tournament_teams, tournament_groups, matches），不可恢复！',
      '⚠️ 危险操作',
      { confirmButtonText: '确认清空', cancelButtonText: '取消', type: 'error', confirmButtonClass: 'el-button--danger' }
    )
  } catch {
    return
  }

  cleaning.value = true
  addLog('开始清空数据...', 'warning')

  // 按依赖顺序清空（先清子表，再清主表）
  const collections = [
    'player_cards',      // 球员证件（依赖 players）
    'identity_cards',    // 证件照片
    'matches',           // 比赛记录
    'tournament_groups', // 分组
    'tournament_teams',  // 参赛记录（依赖 teams, tournaments）
    'players',           // 球员（依赖 teams）
    'teams',            // 球队
    'tournaments'       // 赛事（最后）
  ]

  let totalDeleted = 0

  for (const col of collections) {
    try {
      // 使用批量删除云函数
      const result = await deleteAllRecords(col)

      if (result.deleted > 0) {
        addLog(`${col}: 删除 ${result.deleted} 条`, 'success')
        totalDeleted += result.deleted
      } else {
        addLog(`${col}: 无数据`)
      }
    } catch (err) {
      addLog(`${col}: 删除失败 - ${err.message}`, 'error')
      console.error(`清空 ${col} 失败:`, err)
    }
  }

  addLog(`清空完成，共删除 ${totalDeleted} 条记录`, totalDeleted > 0 ? 'success' : 'info')
  ElMessage.success(`已清空 ${totalDeleted} 条数据`)
  cleaning.value = false
}
</script>

<style scoped>
.test-page {
  max-width: 960px;
}

.page-desc {
  font-size: 13px;
  color: #909399;
  margin-top: 8px;
}

/* 配置卡片 */
.config-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-bottom: 24px;
}

.config-card {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

.config-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
}

.config-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.config-header h3 {
  font-size: 16px;
  color: #303133;
  margin-bottom: 2px;
}

.config-header p {
  font-size: 12px;
  color: #909399;
}

.config-control {
  display: flex;
  align-items: center;
  gap: 16px;
}

.config-control .el-slider {
  flex: 1;
}

.config-value {
  font-size: 18px;
  font-weight: 600;
  color: #43A047;
  white-space: nowrap;
  min-width: 56px;
  text-align: right;
}

/* 操作按钮 */
.action-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

/* 预估卡片 */
.estimate-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px 24px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  margin-bottom: 24px;
  border-left: 4px solid #43A047;
}

.estimate-card h4 {
  font-size: 14px;
  color: #303133;
  margin-bottom: 12px;
}

.estimate-grid {
  display: flex;
  gap: 32px;
}

.estimate-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.estimate-label {
  font-size: 12px;
  color: #909399;
}

.estimate-value {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.estimate-hint {
  font-size: 12px;
  color: #c0c4cc;
  margin-top: 12px;
}

/* 结果卡片 */
.result-card {
  border-radius: 12px;
  padding: 20px 24px;
  margin-bottom: 24px;
}

.result-card.success {
  background: #f0f9eb;
  border: 1px solid #e1f3d8;
}

.result-card.error {
  background: #fef0f0;
  border: 1px solid #fde2e2;
}

.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.result-header .el-icon {
  color: #67c23a;
}

.result-card.error .result-header .el-icon {
  color: #f56c6c;
}

.result-header h4 {
  font-size: 15px;
  color: #303133;
}

.result-message {
  font-size: 13px;
  color: #606266;
  margin-bottom: 12px;
}

.result-detail {
  display: flex;
  gap: 8px;
}

/* 日志卡片 */
.log-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px 24px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

.log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.log-header h4 {
  font-size: 14px;
  color: #303133;
}

.log-list {
  max-height: 300px;
  overflow-y: auto;
  background: #1e1e1e;
  border-radius: 8px;
  padding: 12px 16px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  line-height: 1.8;
}

.log-item {
  display: flex;
  gap: 12px;
}

.log-time {
  color: #6a9955;
  white-space: nowrap;
}

.log-msg {
  color: #d4d4d4;
}

.log-item.success .log-msg {
  color: #4ec9b0;
}

.log-item.error .log-msg {
  color: #f44747;
}

.log-item.warning .log-msg {
  color: #dcdcaa;
}
</style>
