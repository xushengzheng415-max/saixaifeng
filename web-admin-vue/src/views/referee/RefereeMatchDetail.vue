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

    <!-- 现场执行边界：PC 仅查看，签到、开赛、比分和事件统一在裁判服务号/H5完成 -->
    <div class="referee-workflow-boundary">
      <strong>现场执行已迁移到裁判服务号/H5</strong>
      <span>本页面只读展示比赛和事件流水，不能修改现场数据。</span>
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
import { queryById, queryList } from '../../utils/cloud'

const router = useRouter()
const route = useRoute()
const matchId = route.params.id
const match = ref({})
const matchEvents = ref([])

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

.referee-workflow-boundary {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 20px 0;
  padding: 12px 16px;
  border: 1px solid #cfe8d5;
  border-radius: 8px;
  background: #f4fbf6;
  color: #31633d;
}

.referee-workflow-boundary strong {
  color: #176b35;
}

.referee-workflow-boundary span {
  font-size: 13px;
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
