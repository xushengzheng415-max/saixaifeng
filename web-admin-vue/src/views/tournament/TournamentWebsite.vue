<template>
  <div class="tournament-website">
    <!-- 顶部导航 -->
    <header class="website-header">
      <div class="header-content">
        <div class="logo-area">
          <span class="logo-icon">⚽</span>
          <span class="logo-text">赛小蜂足球</span>
        </div>
        <nav class="nav-tabs">
          <a :class="{ active: activeTab === 'info' }" @click="activeTab = 'info'">赛事首页</a>
          <a :class="{ active: activeTab === 'matches' }" @click="activeTab = 'matches'">赛程赛果</a>
          <a :class="{ active: activeTab === 'standings' }" @click="activeTab = 'standings'">积分榜</a>
          <a :class="{ active: activeTab === 'news' }" @click="activeTab = 'news'">赛事新闻</a>
        </nav>
      </div>
    </header>

    <!-- Hero 区域 -->
    <section class="hero-section" :style="{ background: getGradient() }">
      <div class="hero-content">
        <div class="hero-logo">
          <img v-if="tournament.logoUrl || tournament.logo" :src="tournament.logoUrl || tournament.logo" alt="logo" />
          <span v-else class="logo-placeholder">{{ getLogoEmoji() }}</span>
        </div>
        <div class="hero-info">
          <h1>{{ tournament.name }}</h1>
          <div class="hero-meta">
            <span class="meta-item">
              <el-icon><Calendar /></el-icon>
              {{ tournament.startDate }} ~ {{ tournament.endDate }}
            </span>
            <span class="meta-item">
              <el-icon><Location /></el-icon>
              {{ tournament.location || '待定' }}
            </span>
            <span class="meta-item">
              <el-icon><User /></el-icon>
              {{ tournament.registeredTeams || 0 }} 支球队参赛
            </span>
          </div>
          <div class="hero-status">
            <el-tag :class="['status-tag', tournament.status]" size="large">
              {{ statusLabels[tournament.status] }}
            </el-tag>
          </div>
        </div>
      </div>
    </section>

    <!-- 主要内容区 -->
    <section class="main-content">
      <!-- 赛事首页 -->
      <div v-if="activeTab === 'info'" class="tab-content">
        <div class="content-grid">
          <!-- 左侧：赛事信息 -->
          <div class="left-column">
            <div class="card" v-if="tournament.description">
              <h3>📋 赛事简介</h3>
              <p class="description">{{ tournament.description }}</p>
            </div>

            <div class="card">
              <h3>📅 赛程信息</h3>
              <div class="info-list">
                <div class="info-row">
                  <label>赛制类型</label>
                  <span>{{ scheduleTypeNames[tournament.type] }}</span>
                </div>
                <div class="info-row">
                  <label>比赛场次</label>
                  <span>{{ matches.length }} 场</span>
                </div>
                <div class="info-row">
                  <label>参赛球队</label>
                  <span>{{ tournament.registeredTeams || 0 }} / {{ tournament.maxTeams || 0 }} 队</span>
                </div>
                <div class="info-row">
                  <label>报名截止</label>
                  <span>{{ tournament.registerDeadline || '待定' }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 右侧：最近比赛 -->
          <div class="right-column">
            <div class="card">
              <h3>⚽ 最近比赛</h3>
              <div v-if="recentMatches.length === 0" class="empty-tip">
                暂无比赛数据
              </div>
              <div v-else class="match-list">
                <div v-for="match in recentMatches" :key="match._id" class="match-item">
                  <div class="match-teams">
                    <span class="team-name">{{ getTeamName(match.homeTeamId) }}</span>
                    <span class="vs">VS</span>
                    <span class="team-name">{{ getTeamName(match.awayTeamId) }}</span>
                  </div>
                  <div class="match-time">
                    {{ formatDate(match.matchTime) }}
                  </div>
                  <div v-if="match.status === 'finished'" class="match-score">
                    {{ match.homeScore }} : {{ match.awayScore }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 赛程赛果 -->
      <div v-if="activeTab === 'matches'" class="tab-content">
        <div class="card">
          <h3>📅 全部赛程</h3>
          <div v-if="matches.length === 0" class="empty-tip">
            暂无赛程数据
          </div>
          <div v-else class="match-table">
            <div v-for="match in sortedMatches" :key="match._id" class="match-row">
              <div class="match-date">{{ formatDate(match.matchTime) }}</div>
              <div class="match-info">
                <span class="team">{{ getTeamName(match.homeTeamId) }}</span>
                <span v-if="match.status === 'finished'" class="score">
                  {{ match.homeScore }} : {{ match.awayScore }}
                </span>
                <span v-else class="vs-text">VS</span>
                <span class="team">{{ getTeamName(match.awayTeamId) }}</span>
              </div>
              <div class="match-status">
                <el-tag :type="getMatchStatusType(match.status)" size="small">
                  {{ matchStatusLabels[match.status] }}
                </el-tag>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 积分榜 -->
      <div v-if="activeTab === 'standings'" class="tab-content">
        <div class="card">
          <h3>🏆 积分榜</h3>
          <div v-if="standings.length === 0" class="empty-tip">
            暂无积分数据
          </div>
          <div v-else class="standings-table">
            <table>
              <thead>
                <tr>
                  <th>排名</th>
                  <th>球队</th>
                  <th>已赛</th>
                  <th>胜</th>
                  <th>平</th>
                  <th>负</th>
                  <th>积分</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(team, index) in standings" :key="team.teamId">
                  <td class="rank">{{ index + 1 }}</td>
                  <td class="team-name">{{ team.teamName }}</td>
                  <td>{{ team.played }}</td>
                  <td>{{ team.wins }}</td>
                  <td>{{ team.draws }}</td>
                  <td>{{ team.losses }}</td>
                  <td class="points">{{ team.points }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 赛事新闻 -->
      <div v-if="activeTab === 'news'" class="tab-content">
        <div class="card">
          <h3>📰 赛事新闻</h3>
          <div class="empty-tip">
            <el-icon :size="48"><Document /></el-icon>
            <p>新闻功能即将上线，敬请期待...</p>
          </div>
        </div>
      </div>
    </section>

    <!-- 页脚 -->
    <footer class="website-footer">
      <p>© 2026 赛小蜂足球 · 青少年足球赛事平台</p>
      <p class="footer-desc">提供专业青少年足球赛事管理系统，让赛事组织更简单</p>
    </footer>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { Calendar, Location, User, Document } from '@element-plus/icons-vue'
import { queryById, queryList } from '../../utils/cloud'

const route = useRoute()
const id = route.params.id

const activeTab = ref('info')
const tournament = ref({})
const matches = ref([])
const teams = ref([])
const loading = ref(false)

const scheduleTypeNames = {
  tournament: '赛会制',
  cup: '杯赛制',
  league: '联赛制',
  combined: '复合制'
}

const statusLabels = {
  registering: '报名中',
  ongoing: '进行中',
  completed: '已结束'
}

const matchStatusLabels = {
  scheduled: '未开始',
  ongoing: '进行中',
  finished: '已结束',
  postponed: '延期'
}

const gradients = {
  tournament: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  cup: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  league: 'linear-gradient(135deg, #1B5E20 0%, #43A047 100%)',
  combined: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)'
}

const logoEmojis = {
  tournament: '🏆',
  cup: '🥇',
  league: '⚽',
  combined: '🎯'
}

// 最近比赛（按时间排序，取前5）
const recentMatches = computed(() => {
  return matches.value
    .slice()
    .sort((a, b) => new Date(b.matchTime) - new Date(a.matchTime))
    .slice(0, 5)
})

// 赛程排序（按时间正序）
const sortedMatches = computed(() => {
  return matches.value
    .slice()
    .sort((a, b) => new Date(a.matchTime) - new Date(b.matchTime))
})

// 积分榜（简化计算）
const standings = computed(() => {
  const stats = {}

  teams.value.forEach(team => {
    stats[team._id] = {
      teamId: team._id,
      teamName: team.name,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0
    }
  })

  matches.value.forEach(match => {
    if (match.status === 'finished' && match.homeScore !== undefined) {
      const home = stats[match.homeTeamId]
      const away = stats[match.awayTeamId]

      if (home && away) {
        home.played++
        away.played++

        if (match.homeScore > match.awayScore) {
          home.wins++
          home.points += 3
          away.losses++
        } else if (match.homeScore < match.awayScore) {
          away.wins++
          away.points += 3
          home.losses++
        } else {
          home.draws++
          away.draws++
          home.points += 1
          away.points += 1
        }
      }
    }
  })

  return Object.values(stats)
    .sort((a, b) => b.points - a.points)
})

function getGradient() {
  return gradients[tournament.value.type] || gradients.league
}

function getLogoEmoji() {
  return logoEmojis[tournament.value.type] || '⚽'
}

function getTeamName(teamId) {
  const team = teams.value.find(t => t._id === teamId)
  return team ? team.name : '未知球队'
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function getMatchStatusType(status) {
  const map = {
    scheduled: 'info',
    ongoing: 'warning',
    finished: 'success',
    postponed: 'danger'
  }
  return map[status] || 'info'
}

async function loadData() {
  loading.value = true
  try {
    const [tournamentData, matchesData, teamsData] = await Promise.all([
      queryById('tournaments', id),
      queryList('matches', { where: { tournamentId: id } }),
      queryList('tournament_teams', { where: { tournamentId: id } })
    ])

    tournament.value = Array.isArray(tournamentData) ? tournamentData[0] : tournamentData

    // 获取球队详情
    const teamIds = teamsData.map(t => t.teamId)
    if (teamIds.length > 0) {
      const teamDetails = await queryList('teams', {})
      teams.value = teamDetails.filter(t => teamIds.includes(t._id))
    }

    matches.value = matchesData
  } catch (err) {
    console.error('加载数据失败:', err)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.tournament-website {
  min-height: 100vh;
  background: #f5f7fa;
}

/* 顶部导航 */
.website-header {
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
}

.logo-area {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo-icon {
  font-size: 32px;
}

.logo-text {
  font-size: 20px;
  font-weight: 700;
  color: #1B5E20;
}

.nav-tabs {
  display: flex;
  gap: 8px;
}

.nav-tabs a {
  padding: 8px 16px;
  text-decoration: none;
  color: #606266;
  border-radius: 8px;
  transition: all 0.3s;
  cursor: pointer;
  font-size: 15px;
}

.nav-tabs a:hover {
  background: #f5f7fa;
  color: #1B5E20;
}

.nav-tabs a.active {
  background: #1B5E20;
  color: #fff;
}

/* Hero 区域 */
.hero-section {
  padding: 60px 20px;
  color: #fff;
}

.hero-content {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 40px;
}

.hero-logo {
  width: 150px;
  height: 150px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  flex-shrink: 0;
}

.hero-logo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 20px;
}

.logo-placeholder {
  font-size: 80px;
}

.hero-info h1 {
  margin: 0 0 16px 0;
  font-size: 36px;
  font-weight: 700;
}

.hero-meta {
  display: flex;
  gap: 24px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  opacity: 0.95;
}

.status-tag {
  border: none;
  font-size: 14px;
  padding: 6px 16px;
}

.status-tag.registering {
  background: rgba(34, 197, 94, 0.9) !important;
  color: #fff !important;
}

.status-tag.ongoing {
  background: rgba(59, 130, 246, 0.9) !important;
  color: #fff !important;
}

.status-tag.completed {
  background: rgba(107, 114, 128, 0.9) !important;
  color: #fff !important;
}

/* 主要内容区 */
.main-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 30px 20px;
}

.tab-content {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.content-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 20px;
}

.card {
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.card h3 {
  margin: 0 0 20px 0;
  font-size: 18px;
  color: #1f2937;
}

.description {
  color: #4b5563;
  line-height: 1.8;
  font-size: 15px;
}

.info-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #f3f4f6;
}

.info-row label {
  color: #6b7280;
  font-size: 14px;
}

.info-row span {
  color: #1f2937;
  font-weight: 500;
  font-size: 14px;
}

/* 比赛列表 */
.match-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.match-item {
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
}

.match-teams {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.team-name {
  font-weight: 600;
  color: #1f2937;
  font-size: 14px;
}

.vs {
  color: #909399;
  font-size: 12px;
}

.match-time {
  font-size: 13px;
  color: #6b7280;
}

.match-score {
  text-align: center;
  font-size: 18px;
  font-weight: 700;
  color: #1B5E20;
  margin-top: 4px;
}

/* 赛程表格 */
.match-table {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.match-row {
  display: grid;
  grid-template-columns: 140px 1fr 100px;
  gap: 16px;
  align-items: center;
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
}

.match-date {
  font-size: 13px;
  color: #6b7280;
}

.match-info {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: center;
}

.match-info .team {
  font-weight: 600;
  color: #1f2937;
  font-size: 14px;
}

.vs-text {
  color: #909399;
  font-size: 13px;
}

.score {
  font-size: 16px;
  font-weight: 700;
  color: #1B5E20;
}

.match-status {
  text-align: right;
}

/* 积分榜 */
.standings-table table {
  width: 100%;
  border-collapse: collapse;
}

.standings-table th {
  text-align: left;
  padding: 12px;
  background: #f9fafb;
  color: #6b7280;
  font-size: 13px;
  font-weight: 600;
}

.standings-table td {
  padding: 12px;
  border-bottom: 1px solid #f3f4f6;
  font-size: 14px;
  color: #1f2937;
}

.standings-table .rank {
  font-weight: 700;
  color: #1B5E20;
}

.standings-table .team-name {
  font-weight: 600;
}

.standings-table .points {
  font-weight: 700;
  color: #1B5E20;
}

/* 空状态 */
.empty-tip {
  text-align: center;
  padding: 60px 20px;
  color: #909399;
}

.empty-tip .el-icon {
  display: block;
  margin: 0 auto 16px;
  color: #d9d9d9;
}

/* 页脚 */
.website-footer {
  background: #1f2937;
  color: #fff;
  text-align: center;
  padding: 40px 20px;
  margin-top: 60px;
}

.website-footer p {
  margin: 0;
  font-size: 14px;
  opacity: 0.8;
}

.footer-desc {
  margin-top: 8px !important;
  font-size: 13px !important;
  opacity: 0.6 !important;
}

/* 响应式 */
@media (max-width: 768px) {
  .hero-content {
    flex-direction: column;
    text-align: center;
  }

  .hero-meta {
    justify-content: center;
  }

  .content-grid {
    grid-template-columns: 1fr;
  }

  .match-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .nav-tabs {
    flex-wrap: wrap;
    justify-content: center;
  }
}
</style>
