<template>
  <div class="referee-match-detail">
    <el-page-header @back="goBack" :title="`裁判执法 - ${homeName} vs ${awayName}`">
      <template #content>
        <span class="header-match-name">
          {{ homeName }} vs {{ awayName }}
        </span>
        <el-tag :type="statusTagType" size="small" style="margin-left: 8px;">{{ statusLabel }}</el-tag>
      </template>
    </el-page-header>

    <!-- 比赛核心信息 -->
    <div class="match-hero" :class="'status-bg-' + (match.status || 'scheduled')">
      <div class="hero-team hero-home">
        <img v-if="homeLogo" :src="homeLogo" class="hero-logo" @error="$event.target.style.display='none'" />
        <div class="hero-logo-placeholder" v-else>{{ homeName?.[0] || '?' }}</div>
        <div class="hero-team-name">{{ homeName || '待定' }}</div>
      </div>

      <div class="hero-score-area">
        <template v-if="match.status === 'finished'">
          <div class="hero-score">
            <span class="score-num">{{ match.homeScore }}</span>
            <span class="score-sep">:</span>
            <span class="score-num">{{ match.awayScore }}</span>
          </div>
          <div class="hero-match-time">{{ match.matchDate }} {{ match.matchTime }}</div>
        </template>
        <template v-else>
          <div class="hero-vs">VS</div>
          <div class="hero-match-time">{{ match.matchDate || '--' }} {{ match.matchTime || '--:--' }}</div>
          <div class="hero-venue">{{ match.venue || '场地待定' }}</div>
        </template>
      </div>

      <div class="hero-team hero-away">
        <img v-if="awayLogo" :src="awayLogo" class="hero-logo" @error="$event.target.style.display='none'" />
        <div class="hero-logo-placeholder" v-else>{{ awayName?.[0] || '?' }}</div>
        <div class="hero-team-name">{{ awayName || '待定' }}</div>
      </div>
    </div>

    <!-- 裁判操作栏 -->
    <div class="referee-actions">
      <el-button
        v-if="match.status === 'scheduled'"
        type="success"
        size="small"
        @click="handleCheckIn"
        :loading="saving"
      >GPS 签到</el-button>
      <el-button
        v-if="match.status === 'checked_in' || match.status === 'scheduled'"
        type="primary"
        size="small"
        @click="handleStartMatch"
        :loading="saving"
      >开始比赛</el-button>
      <el-button
        v-if="match.status === 'ongoing'"
        type="warning"
        size="small"
        @click="handleFinishMatch"
        :loading="saving"
      >结束比赛</el-button>
    </div>

    <!-- 首发阵容 -->
    <div class="match-lineup" v-if="hasLineups">
      <h3>首发阵容</h3>
      <!-- 主队阵容 -->
      <div class="lineup-side">
        <h4>{{ homeName }}</h4>
        <div v-for="(p, i) in match.lineups.home?.players || []" :key="'h-'+i" class="lineup-player">
          <span class="player-number">{{ p.number }}</span>
          <span class="player-name">{{ p.name }}</span>
        </div>
      </div>
      <!-- 客队阵容 -->
      <div class="lineup-side">
        <h4>{{ awayName }}</h4>
        <div v-for="(p, i) in match.lineups.away?.players || []" :key="'a-'+i" class="lineup-player">
          <span class="player-number">{{ p.number }}</span>
          <span class="player-name">{{ p.name }}</span>
        </div>
      </div>
    </div>

    <!-- 比赛事件时间线 -->
    <div class="match-events">
      <h3>比赛事件</h3>
      <el-empty v-if="matchEvents.length === 0" description="暂无比赛事件" />
      <div v-for="(evt, i) in matchEvents" :key="i" class="event-row">
        <span class="event-time">{{ evt.minute }}'</span>
        <span class="event-type">{{ eventLabel(evt.type) }}</span>
        <span class="event-player">{{ evt.playerName }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { queryById, callFunction, queryList } from '../../utils/cloud'

const router = useRouter()
const route = useRoute()
const matchId = route.params.id
const match = ref({})
const matchEvents = ref([])
const saving = ref(false)

// 球队名
const homeName = computed(() => match.value.homeTeamName || '主队')
const awayName = computed(() => match.value.awayTeamName || '客队')
const homeLogo = computed(() => match.value.homeTeamLogo || '')
const awayLogo = computed(() => match.value.awayTeamLogo || '')

// 状态标签
const statusTagType = computed(() => {
  const map = { scheduled: 'info', checked_in: 'success', ongoing: 'success', finished: '', postponed: 'warning', cancelled: 'danger' }
  return map[match.value.status] || 'info'
})
const statusLabel = computed(() => {
  const map = { scheduled: '未开始', checked_in: '已签到', ongoing: '进行中', finished: '已结束', postponed: '延期', cancelled: '已取消' }
  return map[match.value.status] || match.value.status
})

// 是否有阵容
const hasLineups = computed(() => {
  return match.value.lineups && (match.value.lineups.home || match.value.lineups.away)
})

// 加载比赛详情
async function loadMatch() {
  try {
    const res = await queryById('matches', matchId)
    if (res) {
      match.value = res
    }
    // 加载比赛事件
    const eventsRes = await queryList('match_events', {
      where: { matchId },
      orderBy: { minute: 'asc' }
    })
    if (eventsRes) {
      matchEvents.value = eventsRes
    }
  } catch (err) {
    ElMessage.error('加载失败: ' + err.message)
  }
}

// GPS 签到
async function handleCheckIn() {
  saving.value = true
  try {
    // 获取 GPS 位置
    const getLocation = () => {
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('浏览器不支持地理位置'))
          return
        }
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              timestamp: position.timestamp
            })
          },
          (err) => {
            reject(err)
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        )
      })
    }

    const location = await getLocation()

    // 保存位置和状态
    await callFunction('updateMatch', {
      matchId,
      data: {
        status: 'checked_in',
        checkInLocation: location,
        updateTime: new Date()
      }
    })

    match.value.status = 'checked_in'
    match.value.checkInLocation = location
    ElMessage.success('签到成功！位置已记录')
  } catch (err) {
    console.error('[handleCheckIn] 签到失败:', err)
    ElMessage.error('签到失败: ' + err.message)
  } finally {
    saving.value = false
  }
}

// 开始比赛
async function handleStartMatch() {
  saving.value = true
  try {
    await callFunction('updateMatch', {
      matchId,
      data: { status: 'ongoing', startTime: new Date(), updateTime: new Date() }
    })
    match.value.status = 'ongoing'
    ElMessage.success('比赛已开始')
  } catch (err) {
    ElMessage.error('操作失败: ' + err.message)
  } finally {
    saving.value = false
  }
}

// 结束比赛
async function handleFinishMatch() {
  saving.value = true
  try {
    await callFunction('updateMatch', {
      matchId,
      data: { status: 'finished', endTime: new Date(), updateTime: new Date() }
    })
    match.value.status = 'finished'
    ElMessage.success('比赛已结束')
  } catch (err) {
    ElMessage.error('操作失败: ' + err.message)
  } finally {
    saving.value = false
  }
}

// 事件标签
function eventLabel(type) {
  const map = { goal: '进球', yellow_card: '黄牌', red_card: '红牌', substitution: '换人', foul: '犯规' }
  return map[type] || type
}

// 返回列表
function goBack() {
  router.push('/referee/my-matches')
}

onMounted(() => {
  loadMatch()
})
</script>

<style scoped>
.referee-match-detail {
  padding: 20px;
}

.match-hero {
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 20px;
  border-radius: 8px;
  margin: 20px 0;
}

.status-bg-scheduled { background: #f0f2f5; }
.status-bg-checked_in { background: #f0f9eb; }
.status-bg-ongoing { background: #f0f9eb; }
.status-bg-finished { background: #f5f7fa; }
.status-bg-postponed { background: #fdf6ec; }
.status-bg-cancelled { background: #fef0f0; }

.hero-team {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.hero-logo {
  width: 60px;
  height: 60px;
  object-fit: contain;
}

.hero-logo-placeholder {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: #409eff;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.hero-team-name {
  font-size: 14px;
  font-weight: 600;
}

.hero-score-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.hero-score {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 32px;
  font-weight: 700;
}

.score-num {
  min-width: 40px;
  text-align: center;
}

.hero-vs {
  font-size: 24px;
  font-weight: 700;
  color: #909399;
}

.referee-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin: 20px 0;
}

.match-lineup {
  margin: 20px 0;
}

.match-lineup h3 {
  margin-bottom: 12px;
}

.lineup-side {
  margin-bottom: 16px;
}

.lineup-side h4 {
  margin-bottom: 8px;
}

.lineup-player {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid #ebeef5;
}

.player-number {
  font-weight: 700;
  min-width: 30px;
}

.match-events {
  margin: 20px 0;
}

.match-events h3 {
  margin-bottom: 12px;
}

.event-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid #ebeef5;
}

.event-time {
  font-weight: 600;
  min-width: 40px;
}

.event-type {
  min-width: 60px;
}
</style>
