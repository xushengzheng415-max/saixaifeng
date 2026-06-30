<template>
  <div class="referee-my-matches">
    <div class="page-header">
      <h2>我的执法</h2>
    </div>

    <!-- 比赛列表 -->
    <div v-loading="loading" class="match-list">
      <el-empty v-if="matches.length === 0 && !loading" description="暂无执法比赛" />

      <div v-for="item in matches" :key="item._id" class="match-card" @click="goMatchDetail(item)">
        <div class="match-teams">
          <span class="team-name">{{ item.homeTeamName || '待定' }}</span>
          <span class="match-vs">VS</span>
          <span class="team-name">{{ item.awayTeamName || '待定' }}</span>
        </div>
        <div class="match-info">
          <span class="match-time">{{ item.matchDate }} {{ item.matchTime }}</span>
          <el-tag :type="getStatusType(item.status)" size="small">{{ getStatusLabel(item.status) }}</el-tag>
          <el-tag type="info" size="small">{{ item.roleLabel }}</el-tag>
        </div>
        <div v-if="item.venue" class="match-venue">
          <el-icon><Location /></el-icon> {{ item.venue }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { queryList, queryById } from '../../utils/cloud'
import { ROLES } from '../../utils/permissions'

const router = useRouter()
const loading = ref(false)
const matches = ref([])
const currentUserId = ref('')

// 获取当前用户 ID
function getCurrentUserId() {
  return localStorage.getItem('userId') || ''
}

// 加载我的执法比赛
async function loadMyMatches() {
  loading.value = true
  try {
    const userId = getCurrentUserId()
    if (!userId) {
      ElMessage.warning('请先登录')
      return
    }

    // 1. 查询 match_referees 集合（若不存在说明还没有执法记录）
    let refRecords = []
    try {
      refRecords = await queryList('match_referees', {
        where: { refereeId: userId },
        orderBy: { createTime: 'desc' }
      })
    } catch (e) {
      // match_referees 集合尚不存在，返回空
      console.info('[myMatches] match_referees 集合尚不存在')
      refRecords = []
    }

    if (!refRecords || refRecords.length === 0) {
      matches.value = []
      return
    }

    // 2. 提取所有 matchId
    const matchIds = refRecords.map(r => r.matchId).filter(Boolean)

    // 3. 查询 matches 集合
    const matchRes = await queryList('matches', {
      where: { _id: { $in: matchIds } }
    })

    // 4. 组合数据
    const matchMap = {}
    if (matchRes) {
      matchRes.forEach(m => { matchMap[m._id] = m })
    }

    matches.value = refRecords.map(rec => {
      const match = matchMap[rec.matchId] || {}
      return {
        ...rec,
        homeTeamName: match.homeTeamName || '',
        awayTeamName: match.awayTeamName || '',
        matchDate: match.matchDate || '',
        matchTime: match.matchTime || '',
        venue: match.venue || '',
        status: match.status || 'scheduled'
      }
    })
  } catch (err) {
    console.error('加载执法比赛失败:', err)
    ElMessage.error('加载失败: ' + err.message)
  } finally {
    loading.value = false
  }
}

// 跳转到比赛详情
function goMatchDetail(item) {
  router.push(`/referee/match/${item.matchId}`)
}

// 状态标签类型
function getStatusType(status) {
  const map = {
    scheduled: 'info',
    ongoing: 'success',
    finished: '',
    postponed: 'warning',
    cancelled: 'danger'
  }
  return map[status] || 'info'
}

// 状态标签文字
function getStatusLabel(status) {
  const map = {
    scheduled: '未开始',
    ongoing: '进行中',
    finished: '已结束',
    postponed: '延期',
    cancelled: '已取消'
  }
  return map[status] || status
}

onMounted(() => {
  loadMyMatches()
})
</script>

<style scoped>
.referee-my-matches {
  padding: 20px;
}

.page-header {
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
  font-size: 20px;
}

.match-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.match-card {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: box-shadow 0.2s;
  border: 1px solid #ebeef5;
}

.match-card:hover {
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.match-teams {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-bottom: 12px;
}

.team-name {
  font-size: 16px;
  font-weight: 600;
  flex: 1;
  text-align: center;
}

.match-vs {
  font-size: 14px;
  color: #909399;
  font-weight: 600;
}

.match-info {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 14px;
  color: #606266;
}

.match-venue {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-top: 8px;
  font-size: 13px;
  color: #909399;
}
</style>
