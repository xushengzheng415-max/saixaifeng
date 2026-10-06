<template>
  <div class="player-list">
    <div class="page-card">
      <div class="page-header">
        <h2>{{ fromTeam ? '球队球员管理' : '球员管理' }}</h2>
      </div>

      <!-- 筛选栏 -->
      <div class="filter-bar">
        <el-input v-model="searchKey" placeholder="搜索球员姓名" prefix-icon="Search" clearable style="width: 200px;" @input="handleFilter" />
        <el-select v-model="filterTeam" placeholder="筛选球队" clearable :disabled="fromTeam" style="width: 200px;" @change="handleFilter">
          <el-option v-for="t in teamOptions" :key="t._id" :label="t.name" :value="t._id" />
        </el-select>
        <el-select v-model="filterPosition" placeholder="筛选位置" clearable style="width: 140px;" @change="handleFilter">
          <el-option label="守门员" value="GK" />
          <el-option label="后卫" value="DF" />
          <el-option label="前卫" value="MF" />
          <el-option label="前锋" value="FW" />
        </el-select>
        <div style="flex:1"></div>
        <el-button 
          type="warning" 
          size="small" 
          @click="associateAITeams"
          :loading="associating"
          style="margin-right: 12px;"
        >
          关联AI球队
        </el-button>
        <span class="result-count">共 {{ filteredPlayers.length }} 名球员</span>
      </div>

      <!-- 球员表格 -->
      <el-table :data="paginatedPlayers" v-loading="loading" style="width: 100%" empty-text="暂无球员数据" @sort-change="handleSortChange">
        <el-table-column label="头像" width="60" align="center">
          <template #default="{ row }">
            <el-avatar :size="32" :src="row.photoUrl" shape="square" style="background-color: #fff; color: #909399; border: 1px solid #ebeef5;">{{ row.name ? row.name[0] : '?' }}</el-avatar>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="姓名" width="100" />
        <el-table-column prop="jerseyNumber" label="球衣号" width="100" align="center" sortable="custom">
          <template #default="{ row }">
            <span class="jersey-number">{{ row.jerseyNumber || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column
          label="位置"
          width="110"
          align="center"
          :filters="positionFilters"
          :filter-method="onPositionFilter"
          filter-placement="bottom-start"
        >
          <template #default="{ row }">
            <el-tag :type="positionTypeMap[row.position]" size="small">{{ positionMap[row.position] || row.position || '-' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="jerseyName" label="球衣名" width="130" align="center">
          <template #default="{ row }">
            <span class="jersey-name">{{ row.jerseyName || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="age" label="年龄" width="90" align="center" sortable="custom">
          <template #default="{ row }">{{ calculateAge(row.birthDate) }}</template>
        </el-table-column>
        <el-table-column prop="appearances" label="出场" width="100" align="center" sortable="custom">
          <template #default="{ row }">
            <span>{{ row.appearances || 0 }}次</span>
            <span v-if="row.playTime" class="play-time">/{{ row.playTime }}'</span>
          </template>
        </el-table-column>
        <el-table-column prop="goals" label="进球" width="90" align="center" sortable="custom">
          <template #default="{ row }">
            <span class="goal-count">{{ row.goals || 0 }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="cardScore" label="红/黄牌" width="110" align="center" sortable="custom">
          <template #default="{ row }">
            <span class="card-red" v-if="row.redCards">{{ row.redCards }}红</span>
            <span class="card-yellow" v-if="row.yellowCards">{{ row.yellowCards }}黄</span>
            <span v-if="!row.redCards && !row.yellowCards">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="firstTeamName" label="球队" min-width="160" sortable="custom">
          <template #default="{ row }">
            <div class="team-tags">
              <el-button 
                v-for="tc in row.teamCodes" 
                :key="tc"
                type="primary" 
                link 
                size="small" 
                @click="$router.push('/teams/' + tc)"
                class="team-tag-btn"
              >
                {{ getTeamName(tc) }}
              </el-button>
              <span v-if="!row.teamCodes || row.teamCodes.length === 0">-</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" align="center">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="viewPlayerCard(row)">查看卡片</el-button>
            <el-button v-if="canEditPlayer(row)" type="primary" link size="small" @click="goToPlayerEdit(row)">编辑</el-button>
            <el-button v-if="canDeletePlayer(row)" type="danger" link size="small" @click="deletePlayer(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-bar">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :total="filteredPlayers.length"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          background
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { queryList, deleteRecord, updateRecord } from '../../utils/cloud'
import { permissions, getCurrentRole, ROLES } from '../../utils/permissions'

const router = useRouter()
const route = useRoute()

const loading = ref(false)
const searchKey = ref('')
const filterTeam = ref('')
const filterPosition = ref('')
const players = ref([])
const teamOptions = ref([])
const currentPage = ref(1)
const pageSize = ref(20)
const associating = ref(false)

// 当前角色
const currentRole = ref(getCurrentRole())
const userId = ref(localStorage.getItem('userId') || 'dev-user-id')

// 权限检查
const canCreatePlayer = computed(() => permissions.player.create())
const canViewAllPlayers = computed(() => permissions.player.viewAll())

// 是否从球队菜单进入
const fromTeam = ref(false)

// 获取球队ID（从URL参数）
const teamId = computed(() => route.query.teamId)

const positionMap = { GK: '守门员', DF: '后卫', MF: '前卫', FW: '前锋' }
const positionTypeMap = { GK: 'danger', DF: '', MF: 'success', FW: 'warning' }
const positionFilters = [
  { text: '守门员', value: 'GK' },
  { text: '后卫', value: 'DF' },
  { text: '前卫', value: 'MF' },
  { text: '前锋', value: 'FW' }
]
function onPositionFilter(value, row) {
  return row.position === value
}

const teamMap = computed(() => {
  const map = {}
  teamOptions.value.forEach(t => { 
    map[t._id] = t.name
    if (t.code) map[t.code] = t.name
    if (t.teamCode) map[t.teamCode] = t.name
  })
  return map
})

function getTeamName(teamCode) {
  if (!teamCode) return '-'
  return teamMap.value[teamCode] || '-'
}

// 计算年龄
function calculateAge(birthDate) {
  if (!birthDate) return '-'
  try {
    const birth = new Date(birthDate)
    const now = new Date()
    let age = now.getFullYear() - birth.getFullYear()
    const monthDiff = now.getMonth() - birth.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
      age--
    }
    return age > 0 ? age : '-'
  } catch (e) {
    return '-'
  }
}

const filteredPlayers = computed(() => {
  let result = players.value
  if (searchKey.value) {
    const key = searchKey.value.toLowerCase()
    result = result.filter(p => p.name && p.name.toLowerCase().includes(key))
  }
  if (filterTeam.value) {
    // 支持多球队筛选（合并后的球员有 teamCodes 数组）
    result = result.filter(p => {
      if (p.teamCodes && p.teamCodes.length > 0) {
        return p.teamCodes.includes(filterTeam.value)
      }
      // 兼容旧数据
      return p.teamCode === filterTeam.value || p.teamId === filterTeam.value
    })
  }
  if (filterPosition.value) {
    result = result.filter(p => p.position === filterPosition.value)
  }
  return result
})

// 排序状态
const sortState = ref({ prop: '', order: '' })

function handleSortChange({ prop, order }) {
  sortState.value = { prop, order }
}

// 获取年龄用于排序（返回数字）
function getAgeForSort(birthDate) {
  if (!birthDate) return 0
  try {
    const birth = new Date(birthDate)
    const now = new Date()
    let age = now.getFullYear() - birth.getFullYear()
    const monthDiff = now.getMonth() - birth.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
      age--
    }
    return age > 0 ? age : 0
  } catch (e) {
    return 0
  }
}

// 获取排序值
function getSortValue(row, prop) {
  switch (prop) {
    case 'jerseyNumber':
      return parseInt(row.jerseyNumber) || 0
    case 'age':
      return getAgeForSort(row.birthDate)
    case 'appearances':
      return row.appearances || 0
    case 'goals':
      return row.goals || 0
    case 'cardScore':
      return (row.redCards || 0) * 100 + (row.yellowCards || 0)
    case 'firstTeamName':
      return getTeamName(row.teamCodes?.[0] || row.teamCode) || ''
    default:
      return row[prop] || ''
  }
}

const sortedPlayers = computed(() => {
  let result = [...filteredPlayers.value]
  const { prop, order } = sortState.value
  if (!prop || !order) return result

  result.sort((a, b) => {
    const valA = getSortValue(a, prop)
    const valB = getSortValue(b, prop)

    if (typeof valA === 'string' && typeof valB === 'string') {
      const cmp = valA.localeCompare(valB, 'zh-CN')
      return order === 'ascending' ? cmp : -cmp
    }

    if (valA < valB) return order === 'ascending' ? -1 : 1
    if (valA > valB) return order === 'ascending' ? 1 : -1
    return 0
  })

  return result
})

const paginatedPlayers = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return sortedPlayers.value.slice(start, start + pageSize.value)
})

function handleFilter() {
  currentPage.value = 1
}

function goToPlayerEdit(row) {
  router.push('/players/' + row._id)
}

function viewPlayerCard(row) {
  router.push('/players/' + row._id)
}

async function deletePlayer(row) {
  try {
    await ElMessageBox.confirm(`确定删除球员「${row.name}」吗？`, '删除确认', { type: 'warning' })
    await deleteRecord('players', row._id)
    ElMessage.success('删除成功')
    loadPlayers()
  } catch (err) {
    if (err !== 'cancel') ElMessage.error('删除失败')
  }
}

// 检查是否可以编辑球员
function canEditPlayer(player) {
  // 管理员和主办方总是可以编辑
  if (permissions.player.edit(player, null)) return true
  // 检查球员所属的任何球队
  if (player.teamCodes && player.teamCodes.length > 0) {
    for (const tc of player.teamCodes) {
      const team = teamOptions.value.find(t => t._id === tc)
      if (team && permissions.player.edit(player, team)) return true
    }
  }
  // 兼容旧数据
  const team = teamOptions.value.find(t => t._id === player.teamCode || t._id === player.teamId)
  if (team && permissions.player.edit(player, team)) return true
  // AI生成的球员（没有creatorId）允许编辑
  if (!player.creatorId || player.creatorId === '') return true
  return false
}

// 检查是否可以删除球员
function canDeletePlayer(player) {
  // 管理员和主办方总是可以删除
  if (permissions.player.delete(player, null)) return true
  // 检查球员所属的任何球队
  if (player.teamCodes && player.teamCodes.length > 0) {
    for (const tc of player.teamCodes) {
      const team = teamOptions.value.find(t => t._id === tc)
      if (team && permissions.player.delete(player, team)) return true
    }
  }
  // 兼容旧数据
  const team = teamOptions.value.find(t => t._id === player.teamCode || t._id === player.teamId)
  if (team && permissions.player.delete(player, team)) return true
  // AI生成的球员（没有creatorId）允许删除
  if (!player.creatorId || player.creatorId === '') return true
  return false
}

async function loadPlayers() {
  loading.value = true
  try {
    let rawPlayers = []
    // 根据角色加载不同的球员数据
    if (canViewAllPlayers.value) {
      // 主办方/管理员可以查看所有球员
      rawPlayers = await queryList('players', { orderBy: { createTime: 'desc' } })
    } else if (currentRole.value === ROLES.COACH) {
      // 教练加载所有球员（前端按权限控制操作按钮）
      // 避免因 creatorId/userId 格式不匹配导致数据加载失败
      rawPlayers = await queryList('players', { orderBy: { createTime: 'desc' } })
    }
    
    // 按球员姓名+出生日期合并，聚合所属球队
    const playerMap = new Map()
    for (const p of rawPlayers) {
      const key = `${p.name}-${p.birthDate || ''}`
      if (playerMap.has(key)) {
        const existing = playerMap.get(key)
        // 添加球队到集合（去重）
        if (p.teamCode && !existing.teamCodes.includes(p.teamCode)) {
          existing.teamCodes.push(p.teamCode)
          existing.records.push(p)
        }
      } else {
        playerMap.set(key, {
          ...p,
          teamCodes: p.teamCode ? [p.teamCode] : [],
          records: [p]
        })
      }
    }
    
    players.value = Array.from(playerMap.values())
  } catch (err) {
    console.error('加载球员列表失败:', err)
  } finally {
    loading.value = false
  }
}

async function loadTeams() {
  try {
    teamOptions.value = await queryList('teams')
  } catch (err) {
    console.error('加载球队列表失败:', err)
  }
}

async function associateAITeams() {
  try {
    await ElMessageBox.confirm(
      '确定将AI生成的球队关联到当前账号吗？\n关联后，这些球队将归属于当前账号。\n同时会修复球员的球队关联信息。', 
      '关联确认', 
      { 
        type: 'warning',
        confirmButtonText: '确定关联',
        cancelButtonText: '取消'
      }
    )
    
    associating.value = true
    ElMessage.info('正在关联AI生成的球队和球员...')
    
    // 加载所有球队和球员
    const allTeams = await queryList('teams')
    const allPlayers = await queryList('players')
    
    // 筛选没有 creatorId 的球队（AI生成的）
    const unassociatedTeams = allTeams.filter(t => !t.creatorId || t.creatorId === '')
    
    if (unassociatedTeams.length === 0) {
      ElMessage.info('没有找到需要关联的AI球队')
      return
    }
    
    
    // 第一步：更新每个球队的 creatorId
    let teamSuccessCount = 0
    let teamFailCount = 0
    
    for (const team of unassociatedTeams) {
      try {
        await updateRecord('teams', team._id, { 
          creatorId: userId.value,
          updatedAt: new Date()
        })
        teamSuccessCount++
      } catch (err) {
        console.error(`关联球队 ${team.name} 失败:`, err)
        teamFailCount++
      }
    }
    
    // 第二步：修复没有 teamCode 的球员，将他们关联到AI球队
    const playersWithoutTeam = allPlayers.filter(p => !p.teamCode && !p.teamId)
    let playerSuccessCount = 0
    let playerFailCount = 0
    
    if (playersWithoutTeam.length > 0 && unassociatedTeams.length > 0) {
      ElMessage.info(`正在修复 ${playersWithoutTeam.length} 个球员的球队信息...`)
      
      // 轮流分配到各个AI球队
      for (let i = 0; i < playersWithoutTeam.length; i++) {
        const player = playersWithoutTeam[i]
        const team = unassociatedTeams[i % unassociatedTeams.length]
        try {
          await updateRecord('players', player._id, { 
            teamCode: team._id,
            teamId: team._id,
            updatedAt: new Date()
          })
          playerSuccessCount++
        } catch (err) {
          console.error(`关联球员 ${player.name} 到球队 ${team.name} 失败:`, err)
          playerFailCount++
        }
      }
    }
    
    // 显示结果
    let msg = `球队关联：成功 ${teamSuccessCount} 个`
    if (teamFailCount > 0) msg += `，失败 ${teamFailCount} 个`
    if (playersWithoutTeam.length > 0) {
      msg += `；球员关联：成功 ${playerSuccessCount} 个`
      if (playerFailCount > 0) msg += `，失败 ${playerFailCount} 个`
    }
    
    if (teamFailCount === 0 && playerFailCount === 0) {
      ElMessage.success('关联完成！' + msg)
    } else {
      ElMessage.warning('关联完成（部分失败）' + msg)
    }
    
    // 重新加载数据
    await loadTeams()
    await loadPlayers()
    
  } catch (err) {
    if (err !== 'cancel') {
      console.error('关联AI球队失败:', err)
      ElMessage.error('关联失败：' + (err.message || '未知错误'))
    }
  } finally {
    associating.value = false
  }
}

onMounted(() => {
  // 检查是否从球队菜单进入
  fromTeam.value = route.query.from === 'team'

  // 检查是否有teamId参数
  if (route.query.teamId) {
    filterTeam.value = route.query.teamId
    fromTeam.value = true
  }

  loadPlayers()
  loadTeams()
})
</script>

<style scoped>
.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.result-count {
  font-size: 13px;
  color: #909399;
}

.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.jersey-number {
  font-weight: 600;
  color: #2E7D32;
}

.team-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.team-tag-btn {
  padding: 0 4px;
  height: auto;
  line-height: 1.4;
}

.team-tag-btn + .team-tag-btn::before {
  content: '/';
  margin-right: 4px;
  color: #c0c4cc;
}

.jersey-name {
  font-weight: 500;
  color: #409EFF;
}

.goal-count {
  font-weight: 600;
  color: #E6A23C;
}

.card-red {
  color: #F56C6C;
  font-weight: 600;
  margin-right: 4px;
}

.card-yellow {
  color: #E6A23C;
  font-weight: 600;
}

.play-time {
  color: #909399;
  font-size: 12px;
}
</style>
