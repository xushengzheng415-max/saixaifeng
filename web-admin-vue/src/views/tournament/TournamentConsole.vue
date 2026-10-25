<template>
  <section v-loading="loading" class="tournament-console" aria-labelledby="console-title">
    <header class="console-head">
      <div class="head-identity">
        <img v-if="tournamentLogo" class="head-logo" :src="tournamentLogo" :alt="`${tournament.name} Logo`" />
        <span v-else class="head-logo placeholder"><el-icon><Trophy /></el-icon></span>
        <div class="head-copy">
          <h1 id="console-title">{{ tournament.name || '赛事主控制台' }}</h1>
          <p class="head-meta">
            <span class="head-state" :class="`state-${tournament.status || 'draft'}`">{{ tournamentStatus }}</span>
            <span>{{ divisions.length }} 个组别</span>
            <i aria-hidden="true">·</i>
            <span>{{ dateRange }}</span>
            <i aria-hidden="true">·</i>
            <span>{{ regionLabel }}</span>
          </p>
        </div>
      </div>
      <div class="head-actions">
        <el-button :icon="Refresh" plain :loading="loading" @click="loadConsole">刷新</el-button>
        <el-button plain type="primary" :icon="Back" @click="router.push('/tournament-space')">返回赛事空间</el-button>
      </div>
    </header>

    <div class="console-main">
      <section class="chat-panel" aria-label="AI 办赛助手对话">
        <div class="chat-bar">
          <span class="chat-status"><i aria-hidden="true"></i>AI 办赛助手</span>
          <button v-if="messages.length" type="button" class="text-button" @click="resetChat">清空对话</button>
        </div>

        <div ref="threadEl" class="thread">
          <div v-if="!messages.length" class="welcome">
            <h2>今天想处理哪件事？</h2>
            <p>我只看得到本赛事已录入的数据，不会读取别家赛事或球队的私有信息。</p>
            <div class="suggest-grid">
              <button v-for="card in suggestionCards" :key="card.question" type="button" class="suggest-card" @click="ask(card.question)">
                <span class="suggest-icon"><el-icon><component :is="card.icon" /></el-icon></span>
                <span class="suggest-text"><strong>{{ card.title }}</strong><small>{{ card.desc }}</small></span>
                <el-icon class="suggest-arrow"><ArrowRight /></el-icon>
              </button>
            </div>
          </div>

          <template v-for="message in messages" :key="message.id">
            <div v-if="message.role === 'user'" class="msg user"><div class="bubble">{{ message.text }}</div></div>
            <div v-else class="msg assistant">
              <span class="avatar" aria-hidden="true">蜂</span>
              <div class="msg-body">
                <p>{{ message.text }}</p>
                <ul v-if="message.list && message.list.length" class="msg-list">
                  <li v-for="(line, index) in message.list" :key="index">{{ line }}</li>
                </ul>
                <button v-if="message.action" type="button" class="msg-action" @click="go(message.action.target)">
                  {{ message.action.label }}<el-icon><ArrowRight /></el-icon>
                </button>
                <div v-if="message.quickReplies && message.quickReplies.length" class="quick-replies">
                  <button v-for="item in message.quickReplies" :key="item" type="button" @click="ask(item)">{{ item }}</button>
                </div>
              </div>
            </div>
          </template>

          <div v-if="thinking" class="msg assistant">
            <span class="avatar" aria-hidden="true">蜂</span>
            <div class="typing" aria-label="正在回答"><i></i><i></i><i></i></div>
          </div>
        </div>

        <div class="composer-wrap">
          <div class="composer" :class="{ active: chatInput.trim() }">
            <textarea ref="composerEl" v-model="chatInput" rows="1" placeholder="问点什么，或选择上面的建议…" @input="resizeComposer" @keydown.enter.exact.prevent="ask(chatInput)" />
            <button type="button" class="send-button" :disabled="!chatInput.trim()" aria-label="发送" @click="ask(chatInput)">
              <el-icon><Promotion /></el-icon>
            </button>
          </div>
          <p class="composer-hint">Enter 发送 · Shift + Enter 换行 · 回答基于本赛事数据</p>
        </div>
      </section>

      <aside class="rail" aria-label="AI 办赛助手">
        <section class="rail-card assistant-card">
          <header class="assistant-head">
            <span class="assistant-avatar" aria-hidden="true">蜂</span>
            <div class="assistant-id">
              <h2>AI 办赛助手</h2>
              <p><i aria-hidden="true"></i>只读本赛事数据</p>
            </div>
          </header>
          <p class="assistant-insight">{{ aiInsight }}</p>
          <ul v-if="aiSuggestions.length" class="assistant-actions">
            <li v-for="item in aiSuggestions" :key="item.label">
              <button type="button" @click="ask(item.question)">
                <span>{{ item.label }}</span>
                <el-icon><ArrowRight /></el-icon>
              </button>
            </li>
          </ul>
          <div class="assistant-todo">
            <header class="rail-head">
              <h2>建议处理</h2>
              <button v-if="todos.length > 3" type="button" class="text-button" @click="showAllTodos = !showAllTodos">{{ showAllTodos ? '收起' : `全部 ${todos.length}` }}</button>
            </header>
            <p v-if="!todos.length" class="rail-empty">当前没有需要处理的事项</p>
            <ul v-else class="todo-list">
              <li v-for="todo in visibleTodos" :key="todo.key">
                <span class="todo-dot" :class="todo.tone" aria-hidden="true"></span>
                <span class="todo-text">{{ todo.text }}</span>
                <button type="button" class="text-button" @click="go(todo.target)">去处理</button>
              </li>
            </ul>
          </div>
          <button type="button" class="assistant-cta" @click="ask('这届还差什么没做')">让助手盘点一遍</button>
        </section>

        <section class="rail-card">
          <header class="rail-head"><h2>今日赛程</h2><button type="button" class="text-button" @click="go(`/tournaments/${id}/matches`)">比赛管理</button></header>
          <p v-if="!todayMatches.length" class="rail-empty">今天没有安排比赛</p>
          <ul v-else class="match-list">
            <li v-for="match in todayMatches" :key="match._id">
              <time>{{ matchTime(match) }}</time>
              <span class="match-text">{{ teamName(match, 'home') }} <b>VS</b> {{ teamName(match, 'away') }}</span>
              <span class="match-state" :class="`match-${match.status || 'pending'}`">{{ matchStatus(match.status) }}</span>
            </li>
          </ul>
          <p v-if="!todayMatches.length && nextMatch" class="rail-note">下一场 {{ matchDate(nextMatch) }} {{ matchTime(nextMatch) }} · {{ teamName(nextMatch, 'home') }} VS {{ teamName(nextMatch, 'away') }}</p>
        </section>

        <section class="rail-card">
          <header class="rail-head"><h2>赛事概览</h2></header>
          <div class="overview-row">
            <button type="button" @click="go(`/tournaments/${id}/competition`)"><strong>{{ divisions.length }}</strong><span>竞赛组别</span></button>
            <button type="button" @click="go(`/tournaments/${id}/teams`)"><strong>{{ approvedTeams.length }}</strong><span>参赛球队</span></button>
            <button type="button" @click="go(`/tournaments/${id}/matches`)"><strong>{{ matches.length }}</strong><span>已排比赛</span></button>
          </div>
          <p class="rail-note">{{ overviewNote }}</p>
        </section>

        <section class="rail-card">
          <header class="rail-head"><h2>筹备阶段</h2><span class="rail-count">{{ doneStageCount }}/{{ stages.length }}</span></header>
          <div class="stage-bar"><i :style="{ width: `${stageCompletion}%` }"></i></div>
          <ul class="stage-list">
            <li v-for="stage in stages" :key="stage.label">
              <span class="stage-dot" :class="{ done: stage.done, active: stage.active }" aria-hidden="true"></span>
              <span class="stage-name">{{ stage.label }}</span>
              <span class="stage-note">{{ stage.note }}</span>
            </li>
          </ul>
          <div v-if="divisions.length" class="division-block">
            <p class="division-title">组别方案</p>
            <ul class="division-list">
              <li v-for="division in divisions" :key="division.id || division._id || division.name">
                <strong>{{ division.name || '未命名组别' }}</strong>
                <span class="division-mode">{{ divisionMode(division) }}</span>
                <span class="division-state">{{ divisionProgressLabel(division) }}</span>
                <el-button v-if="!qaSnapshot && !competitionPlanLocked(division)" size="small" type="primary" link :loading="confirmingDivisionId === divisionId(division)" @click="confirmPlan(division)">确认方案</el-button>
                <el-tag v-else-if="competitionPlanLocked(division)" size="small" type="success" effect="plain">已锁定</el-tag>
              </li>
            </ul>
          </div>
          <p v-else class="rail-empty">尚未创建竞赛组别 <button type="button" class="text-button" @click="go(`/tournaments/${id}/edit?section=divisions`)">去添加</button></p>
        </section>
      </aside>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, Back, Calendar, CircleCheck, DocumentChecked, Grid, Location, Promotion, Refresh, Tickets, Trophy, UserFilled } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { callFunction, confirmCompetitionPlan, getFileUrl, queryById, queryList } from '../../utils/cloud'
import { getVisualQaSnapshot, visualQaActive } from '../../utils/visualQaFixtures'

const route = useRoute()
const router = useRouter()
const id = route.params.id
const qaSnapshot = import.meta.env.DEV && visualQaActive() ? getVisualQaSnapshot() : null
const loading = ref(false)
const tournament = ref(qaSnapshot?.tournament || {})
const registrations = ref(qaSnapshot?.tournamentTeams || [])
const matches = ref(qaSnapshot?.matches || [])
const divisionRecords = ref(qaSnapshot?.tournament?.divisions || [])
const confirmingDivisionId = ref('')
const resolvedTournamentLogo = ref('')
const showAllTodos = ref(false)

const divisions = computed(() => divisionRecords.value.length
  ? divisionRecords.value
  : (Array.isArray(tournament.value.divisions) ? tournament.value.divisions : []))
const approvedTeams = computed(() => registrations.value.filter(item => item.status === 'approved'))
const pendingTeams = computed(() => registrations.value.filter(item => ['pending', 'invited', 'claim_pending'].includes(item.status)))
const activeMatches = computed(() => matches.value.filter(item => ['ongoing', 'in_progress', 'live'].includes(item.status)))
const reviewMatches = computed(() => matches.value.filter(item => ['submitted', 'pending_review', 'review_pending'].includes(item.status)))
const completedMatches = computed(() => matches.value.filter(item => ['completed', 'finished', 'archived'].includes(item.status)))
const todayMatches = computed(() => {
  const now = new Date()
  return matches.value.filter(item => {
    const date = matchTimestamp(item)
    return !Number.isNaN(date.getTime()) && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
  })
})
const nextMatch = computed(() => {
  const now = Date.now()
  return matches.value
    .filter(item => ['scheduled', 'pending', undefined].includes(item.status) && matchTimestamp(item).getTime() > now)
    .sort((a, b) => matchTimestamp(a) - matchTimestamp(b))[0] || null
})
const tournamentLogo = computed(() => {
  const source = String(tournament.value.logoTransparentUrl || tournament.value.logoUrl || tournament.value.logo || '')
  return resolvedTournamentLogo.value || (/^(https?:\/\/|\/)/i.test(source) ? source : '')
})
const dateRange = computed(() => tournament.value.startDate && tournament.value.endDate ? `${formatDate(tournament.value.startDate)} — ${formatDate(tournament.value.endDate)}` : '日期待定')
const regionLabel = computed(() => tournament.value.region || tournament.value.location || '地区待定')
const tournamentStatus = computed(() => ({ draft: '筹备中', registering: '报名中', upcoming: '即将开始', ongoing: '进行中', completed: '已结束', finished: '已结束' })[tournament.value.status] || '筹备中')
const stages = computed(() => [
  { label: '组别规则', note: divisions.value.length ? `${divisions.value.length} 个` : '待创建', icon: DocumentChecked, done: divisions.value.length > 0, active: divisions.value.length === 0, target: `/tournaments/${id}/edit?section=divisions` },
  { label: '球队入驻', note: `${approvedTeams.value.length}/${registrations.value.length || 0}`, icon: UserFilled, done: registrations.value.length > 0 && pendingTeams.value.length === 0, active: pendingTeams.value.length > 0, target: `/tournaments/${id}/teams` },
  { label: '抽签分组', note: tournament.value.drawCompleted ? '已完成' : '待配置', icon: Tickets, done: tournament.value.drawCompleted === true, active: divisions.value.length > 0 && !tournament.value.drawCompleted, target: `/tournaments/${id}/draw` },
  { label: '赛程发布', note: matches.value.length ? `${matches.value.length} 场` : '待编排', icon: Calendar, done: matches.value.length > 0 && tournament.value.schedulePublished === true, active: matches.value.length > 0 && !tournament.value.schedulePublished, target: `/tournaments/${id}/matches` },
  { label: '比赛执行', note: activeMatches.value.length ? `${activeMatches.value.length} 进行中` : '待开赛', icon: Promotion, done: matches.value.some(item => ['completed', 'finished'].includes(item.status)), active: activeMatches.value.length > 0, target: `/tournaments/${id}/matches` },
  { label: '赛果归档', note: reviewMatches.value.length ? `${reviewMatches.value.length} 待复核` : '待复核', icon: CircleCheck, done: matches.value.length > 0 && reviewMatches.value.length === 0 && matches.value.every(item => ['completed', 'finished', 'archived'].includes(item.status)), active: reviewMatches.value.length > 0, target: `/tournaments/${id}/matches` }
])
const stageCompletion = computed(() => Math.round((stages.value.filter(item => item.done).length / stages.value.length) * 100))
const doneStageCount = computed(() => stages.value.filter(item => item.done).length)
const todos = computed(() => {
  const list = []
  if (!divisions.value.length) list.push({ key: 'division', text: '尚未创建竞赛组别', icon: Grid, tone: 'orange', target: `/tournaments/${id}/edit?section=divisions` })
  if (pendingTeams.value.length) list.push({ key: 'teams', text: `${pendingTeams.value.length} 支球队待确认或认领`, icon: UserFilled, tone: 'green', target: `/tournaments/${id}/teams` })
  if (divisions.value.length && !matches.value.length) list.push({ key: 'schedule', text: '尚未编排比赛赛程', icon: Calendar, tone: 'blue', target: `/tournaments/${id}/matches` })
  if (reviewMatches.value.length) list.push({ key: 'review', text: `${reviewMatches.value.length} 场赛果待复核归档`, icon: DocumentChecked, tone: 'orange', target: `/tournaments/${id}/matches` })
  return list
})
const visibleTodos = computed(() => (showAllTodos.value ? todos.value : todos.value.slice(0, 3)))
const overviewNote = computed(() => {
  const parts = []
  if (pendingTeams.value.length) parts.push(`${pendingTeams.value.length} 支球队待确认`)
  if (activeMatches.value.length) parts.push(`${activeMatches.value.length} 场进行中`)
  if (reviewMatches.value.length) parts.push(`${reviewMatches.value.length} 场赛果待复核`)
  return parts.length ? parts.join(' · ') : '当前没有异常项目'
})
// 右侧 AI 办赛助手：洞察基于本赛事已加载数据，建议点击后直接进入对话
const aiInsight = computed(() => {
  const name = tournament.value.name || '本赛事'
  if (!divisions.value.length) return `${name}还没有竞赛组别。建议先确定年龄区间、赛制与名额，再邀请球队报名。`
  if (pendingTeams.value.length) return `已有 ${divisions.value.length} 个组别、${approvedTeams.value.length} 支球队确认，还有 ${pendingTeams.value.length} 支待确认。建议先处理球队，再安排赛程。`
  if (!matches.value.length) return `${divisions.value.length} 个组别、${approvedTeams.value.length} 支球队已就位，还没有编排比赛。下一步是抽签分组并发布赛程。`
  if (reviewMatches.value.length) return `共 ${matches.value.length} 场比赛，今天 ${todayMatches.value.length} 场，${reviewMatches.value.length} 场赛果待复核。复核归档后积分榜才会更新。`
  if (activeMatches.value.length) return `现在 ${activeMatches.value.length} 场比赛进行中，共 ${matches.value.length} 场已编排。赛果出来可以直接问我要积分榜。`
  return `已排 ${matches.value.length} 场比赛，${completedMatches.value.length} 场已结束。待办、赛程、积分榜都可以直接问我。`
})
const aiSuggestions = computed(() => {
  const list = []
  if (!divisions.value.length) list.push({ label: '怎么建第一个组别', question: '帮我加一个组别' })
  if (pendingTeams.value.length) list.push({ label: `处理 ${pendingTeams.value.length} 支待确认球队`, question: '球队情况怎么样' })
  if (divisions.value.length && !matches.value.length) list.push({ label: '赛程该怎么排', question: '赛程怎么安排' })
  if (reviewMatches.value.length) list.push({ label: `复核 ${reviewMatches.value.length} 场赛果`, question: '哪些赛果待复核' })
  if (list.length < 2 && completedMatches.value.length) list.push({ label: '看下积分榜', question: '看下积分榜' })
  if (list.length < 2) list.push({ label: '这届还差什么', question: '这届还差什么没做' })
  return list.slice(0, 3)
})
const suggestionCards = computed(() => [
  { title: '筹备进度', desc: todos.value.length ? `还有 ${todos.value.length} 项待处理` : '当前没有待办', icon: DocumentChecked, question: '这届还差什么没做' },
  { title: '赛果与积分榜', desc: completedMatches.value.length ? `${completedMatches.value.length} 场已出结果` : '暂无已确认赛果', icon: Trophy, question: '看下积分榜' },
  { title: '组别与赛制', desc: divisions.value.length ? `${divisions.value.length} 个组别已创建` : '尚未创建组别', icon: Grid, question: '帮我加一个组别' },
  { title: '球队与名单', desc: pendingTeams.value.length ? `${pendingTeams.value.length} 支待确认` : `${approvedTeams.value.length} 支已确认`, icon: UserFilled, question: '球队情况怎么样' }
])

// 赛事助手：只读取本赛事已加载数据作答，任何输入都给出实质回复与后续选项
const messages = ref([])
const chatInput = ref('')
const threadEl = ref(null)
const composerEl = ref(null)
const thinking = ref(false)
const thinkingLabel = ref('正在查询本赛事数据…')
let messageSeed = 0
let lastTopic = ''

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

function numberFromChinese(value) {
  const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
  return map[value] || Number(value) || 0
}

function findDivision(text) {
  const direct = divisions.value.find(item => item.name && text.includes(String(item.name)))
  if (direct) return direct
  const ordinal = text.match(/第\s*([一二三四五六七八九十\d])\s*(个|组)/)
  return ordinal ? divisions.value[numberFromChinese(ordinal[1]) - 1] || null : null
}

function divisionLines() {
  return divisions.value.map(item => `${item.name || '未命名组别'}：${divisionMode(item)}，${divisionProgressLabel(item)}${competitionPlanLocked(item) ? '，方案已锁定' : '，方案待确认'}`)
}

function teamLines() {
  return registrations.value.slice(0, 10).map(item => `${item.teamName || item.name || '未命名球队'}：${({ approved: '已确认', pending: '待确认', invited: '已邀请', claim_pending: '待认领' })[item.status] || '待确认'}`)
}

function venueList() {
  return [...new Set(matches.value.map(item => item.venue || item.location || item.field || item.ground).filter(Boolean))]
}

function matchLines() {
  return todayMatches.value.map(item => `${matchTime(item)}　${teamName(item, 'home')} VS ${teamName(item, 'away')}（${matchStatus(item.status)}）`)
}

function overviewSentence() {
  const pending = todos.value.length ? `，还有 ${todos.value.length} 项待办` : '，暂时没有待办'
  return `${tournament.value.name || '本赛事'}现在是「${tournamentStatus.value}」，共 ${divisions.value.length} 个组别、${approvedTeams.value.length} 支参赛球队、${matches.value.length} 场比赛${pending}。`
}

// 用本赛事已完赛的比分现算组别排名：胜 3 分、平 1 分，同分看净胜球
function standingsForDivision(division) {
  const targetId = divisionId(division)
  const targetName = String(division.name || '')
  const table = new Map()
  const ensure = (key, label) => {
    if (!table.has(key)) table.set(key, { name: label, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 })
    return table.get(key)
  }
  const isFinished = status => ['completed', 'finished', 'archived'].includes(String(status || ''))
  let counted = 0
  matches.value.forEach(match => {
    if (!isFinished(match.status) || match.homeScore === null || match.awayScore === null || match.homeScore === undefined || match.awayScore === undefined) return
    const homeScore = Number(match.homeScore)
    const awayScore = Number(match.awayScore)
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return
    const sameDivision = (targetId && String(match.divisionId || '') === targetId)
      || (targetName && String(match.divisionName || '').includes(targetName))
    if (!sameDivision) return
    counted += 1
    const home = ensure(String(match.homeTeamId || match.homeTeamName || 'home'), match.homeTeamName || '主队')
    const away = ensure(String(match.awayTeamId || match.awayTeamName || 'away'), match.awayTeamName || '客队')
    home.played += 1
    away.played += 1
    home.gf += homeScore
    home.ga += awayScore
    away.gf += awayScore
    away.ga += homeScore
    if (homeScore > awayScore) { home.won += 1; away.lost += 1; home.points += 3 }
    else if (homeScore < awayScore) { away.won += 1; home.lost += 1; away.points += 3 }
    else { home.drawn += 1; away.drawn += 1; home.points += 1; away.points += 1 }
  })
  const rows = [...table.values()].sort((a, b) => b.points - a.points || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf)
  return { rows, counted }
}

function standingsLines(rows) {
  return rows.slice(0, 5).map((row, index) => `${index + 1}. ${row.name}　${row.points} 分（${row.played} 场 ${row.won} 胜 ${row.drawn} 平 ${row.lost} 负，净胜 ${row.gf - row.ga}）`)
}

// 已录入的参赛球队名称，用于按队名回答战绩与交锋
function teamNames() {
  return [...new Set(registrations.value.map(item => String(item.teamName || item.name || '').trim()).filter(Boolean))]
}

function mentionedTeams(text) {
  return teamNames().filter(name => text.includes(name))
}

// 单支球队在这届的战绩：只统计已出比分的比赛
function isScoredMatch(match) {
  return ['completed', 'finished', 'archived'].includes(String(match.status || '')) && Number.isFinite(Number(match.homeScore)) && Number.isFinite(Number(match.awayScore))
}

// 进球统计：只算已出比分的比赛
function scoreStats() {
  const scored = matches.value.filter(isScoredMatch)
  const total = scored.reduce((sum, match) => sum + Number(match.homeScore) + Number(match.awayScore), 0)
  const biggest = scored.reduce((best, match) => {
    const goals = Number(match.homeScore) + Number(match.awayScore)
    return !best || goals > best.goals ? { match, goals } : best
  }, null)
  return { count: scored.length, total, average: scored.length ? (total / scored.length).toFixed(1) : '0', biggest }
}

function teamRecord(name) {
  const isFinished = status => ['completed', 'finished', 'archived'].includes(String(status || ''))
  const record = { name, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 }
  matches.value.forEach(match => {
    if (!isFinished(match.status)) return
    const homeScore = Number(match.homeScore)
    const awayScore = Number(match.awayScore)
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return
    const isHome = String(match.homeTeamName || '') === name
    const isAway = String(match.awayTeamName || '') === name
    if (!isHome && !isAway) return
    record.played += 1
    record.gf += isHome ? homeScore : awayScore
    record.ga += isHome ? awayScore : homeScore
    const own = isHome ? homeScore : awayScore
    const other = isHome ? awayScore : homeScore
    if (own > other) record.won += 1
    else if (own < other) record.lost += 1
    else record.drawn += 1
  })
  return record
}

// 两队之间的已完赛交锋记录
function headToHead(first, second) {
  const isFinished = status => ['completed', 'finished', 'archived'].includes(String(status || ''))
  return matches.value
    .filter(match => isFinished(match.status) && Number.isFinite(Number(match.homeScore)) && Number.isFinite(Number(match.awayScore)))
    .filter(match => {
      const home = String(match.homeTeamName || '')
      const away = String(match.awayTeamName || '')
      return (home === first && away === second) || (home === second && away === first)
    })
    .map(match => `${matchDate(match)}　${teamName(match, 'home')} ${match.homeScore}:${match.awayScore} ${teamName(match, 'away')}`)
}

function detailReply(topic) {
  if (topic === 'todos' && todos.value.length) return { text: '这届的全部待办：', list: todos.value.map(item => item.text), action: { label: '去处理', target: todos.value[0].target }, quickReplies: ['这届什么时候开始', '看下积分榜'], topic: 'todos' }
  if (topic === 'schedule') return { text: todayMatches.value.length ? `今天安排 ${todayMatches.value.length} 场比赛：` : '今天没有安排比赛，下一场信息在右侧今日赛程里。', list: matchLines(), action: { label: '进入比赛管理', target: `/tournaments/${id}/matches` }, quickReplies: ['看下积分榜', '这届有多少支球队'], topic: 'schedule' }
  if (topic === 'divisions') return { text: divisions.value.length ? `${divisions.value.length} 个组别的当前状态：` : `${tournament.value.name || '本赛事'}还没有创建组别。`, list: divisionLines(), action: { label: '去组别管理', target: `/tournaments/${id}/competition` }, quickReplies: ['这届还差什么没做', '这届什么时候开始'], topic: 'divisions' }
  if (topic === 'teams') return { text: `参赛记录共 ${registrations.value.length} 条：`, list: teamLines(), action: { label: '去球队管理', target: `/tournaments/${id}/teams` }, quickReplies: ['这届有多少场比赛', '这届还差什么没做'], topic: 'teams' }
  return null
}

// 问题指向具体模块时，直接把人带到对应窗口（按具体度排序，先匹配先用）
const PAGE_TARGETS = [
  { keys: ['报名审核', '审核报名', '报名申请', '待审核'], label: '报名审核', path: 'signups' },
  { keys: ['报名管理', '赛事报名'], label: '赛事报名管理', path: 'registration' },
  { keys: ['认领冲突', '认领审核', '球队认领'], label: '认领冲突审核', path: 'claim-reviews' },
  { keys: ['竞赛规则', '规则设置', '赛制设置'], label: '竞赛规则设置', path: 'competition/rules' },
  { keys: ['添加组别', '新建组别', '加一个组别', '建组别'], label: '添加竞赛组别', path: 'competition/create' },
  { keys: ['抽签', '分组'], label: '抽签分组', path: 'draw' },
  { keys: ['补录成绩', '补录'], label: '补录成绩', path: 'staff-results' },
  { keys: ['名单异常', '异常名单'], label: '名单异常处理', path: 'roster-exceptions' },
  { keys: ['换人'], label: '换人审核', path: 'roster-changes' },
  { keys: ['赛果复核', '复核'], label: '赛果与排名', path: 'results' },
  { keys: ['裁判'], label: '赛事裁判管理', path: 'referees' },
  { keys: ['新闻', '公告', '资讯'], label: '新闻中心', path: 'news' },
  { keys: ['球员', '名单'], label: '参赛球队', path: 'teams' },
  { keys: ['组别', '竞赛管理'], label: '竞赛管理', path: 'competition' },
  { keys: ['比赛管理', '赛程', '编排', '排赛'], label: '比赛管理', path: 'matches' },
  { keys: ['赛果', '成绩', '排名', '积分榜', '榜单'], label: '赛果与排名', path: 'results' },
  { keys: ['球队', '参赛'], label: '参赛球队', path: 'teams' },
  { keys: ['赛事信息', '基本信息', '编辑赛事'], label: '编辑赛事', path: 'edit' }
]

function respond(raw) {
  const text = String(raw || '').trim()
  const name = tournament.value.name || '本赛事'
  const has = (...keys) => keys.some(key => text.includes(key))

  // 追问：沿用上一话题给出更细的清单
  if (lastTopic && has('详细', '展开', '具体', '继续', '然后', '多说', '还有呢', '全部', '状态', '都有', '名单')) {
    const detail = detailReply(lastTopic)
    if (detail) return detail
  }

  if (has('你好', '您好', '在吗', '有人吗') || /^(hi|hello|hey)[!！。.\s]*$/i.test(text)) {
    return { text: `你好，我是${name}的赛事助手。${overviewSentence()}想先看哪一部分？`, quickReplies: ['这届还差什么没做', '看下积分榜', '这届什么时候开始'], topic: 'greeting' }
  }

  if (has('谢谢', '感谢', '辛苦了')) {
    return { text: '不客气。还要查哪一块直接问我就行。', quickReplies: ['这届还差什么没做', '今天有几场比赛'], topic: 'thanks' }
  }

  // 明确表达要去某个模块：直接带入对应窗口
  if (has('去', '打开', '进入', '带我', '怎么去', '入口', '页面', '窗口', '跳转') && !has('场地', '地点', '在哪', '赛区', '身价', '收费')) {
    const page = PAGE_TARGETS.find(item => item.keys.some(key => text.includes(key)))
    if (page) {
      return {
        text: `好的，这就带你去「${page.label}」。${page.path === 'signups' || page.path === 'registration' ? `这届当前有 ${pendingTeams.value.length} 支球队待确认。` : ''}`,
        action: { label: `打开${page.label}`, target: `/tournaments/${id}/${page.path}` },
        quickReplies: ['这届还差什么没做', '看下积分榜'],
        topic: 'navigate'
      }
    }
  }

  if (has('新建赛事', '创建赛事', '新建一个赛事', '建一个赛事', '开一个赛事') || (has('新建', '创建') && has('赛事', '比赛'))) {
    return {
      text: `可以。创建赛事在「赛事空间」里完成：填好赛事名称、起止日期、赛区和组别，就能邀请球队报名。如果你其实是想在「${name}」里加一个组别，我可以直接带你去组别管理。`,
      action: { label: '去赛事空间', target: '/tournament-space' },
      quickReplies: ['在这届里加一个组别', '这届还差什么没做'],
      topic: 'create'
    }
  }

  if (has('收费', '价格', '多少钱', '费用', '免费', '付费', '试用')) {
    return { text: '赛事的价格、试用和免费边界还在平台确认中，我不在这里给报价。可以先把组别和赛程准备好，等规则公布后再决定开通范围。', quickReplies: ['这届还差什么没做', '这届什么时候开始'], topic: 'pricing' }
  }

  if (has('待办', '进度', '还差', '缺什么', '没做', '下一步', '准备')) {
    if (!todos.value.length) return { text: `${overviewSentence()}目前没有需要你处理的事项。`, quickReplies: ['看下积分榜', '今天有几场比赛'], topic: 'todos' }
    return { text: `这届目前还差 ${todos.value.length} 项：`, list: todos.value.map(item => item.text), action: { label: '去处理', target: todos.value[0].target }, quickReplies: ['详细看一下', '这届什么时候开始'], topic: 'todos' }
  }

  // 身价、财务这类平台统一口径或本控制台未接入的数据：直说去哪里查，不拿别的话题糊过去
  if (has('身价', '市值', '估值', '转会', '工资', '薪水', '赞助', '财务', '预算', '门票', '收入')) {
    return {
      text: '球员身价是平台统一口径的转会评估指数，由数据中心计算，主控台只读本赛事的比赛数据，不重算也不编造。具体球员身价请到球员数据中心或球员卡查看；这届我能直接答的是比分、名次、球队战绩和赛程。',
      quickReplies: ['看下积分榜', '这届有多少支球队', '今天有几场比赛'],
      topic: 'valuation'
    }
  }

  if (has('射手', '金靴', '谁进的球', '进球榜')) {
    return {
      text: `射手榜按数据中心统一口径统计，主控台不另算。这届已有 ${completedMatches.value.length} 场比分，我可以先给你组别名次；完整进球榜请到赛事榜单或数据中心查看。`,
      action: { label: '进入赛果与排名', target: `/tournaments/${id}/results` },
      quickReplies: ['看下积分榜', '这届有多少支球队'],
      topic: 'scorers'
    }
  }

  // 问题里点了具体球队名：两队交锋优先，其次单队战绩
  const mentioned = mentionedTeams(text)
  if (mentioned.length >= 2) {
    const lines = headToHead(mentioned[0], mentioned[1])
    return {
      text: lines.length ? `${mentioned[0]} 与 ${mentioned[1]} 的已完赛交锋：` : `${mentioned[0]} 与 ${mentioned[1]} 目前还没有已出比分的交锋记录。`,
      list: lines,
      action: { label: '进入比赛管理', target: `/tournaments/${id}/matches` },
      quickReplies: ['看下积分榜', '这届有多少支球队'],
      topic: 'headToHead'
    }
  }
  if (mentioned.length === 1 && has('战绩', '成绩', '几胜', '胜率', '进几', '丢几', '怎么样', '如何', '打得', '表现', '实力')) {
    const record = teamRecord(mentioned[0])
    return {
      text: record.played
        ? `${record.name} 已完赛 ${record.played} 场：${record.won} 胜 ${record.drawn} 平 ${record.lost} 负，进 ${record.gf} 球、失 ${record.ga} 球。`
        : `${record.name} 目前还没有已出比分的比赛，等比赛结束并复核后我就能给出战绩。`,
      action: { label: '进入比赛管理', target: `/tournaments/${id}/matches` },
      quickReplies: ['看下积分榜', '这届有多少支球队'],
      topic: 'teamRecord'
    }
  }

  if (has('积分', '排名', '名次', '榜', '第一', '冠军', '头名', '最强')) {
    if (!divisions.value.length) {
      return {
        text: `${name}还没有竞赛组别，暂时没有排名可比。先建组别并确认赛制，之后有比分我就能算出名次。`,
        action: { label: '去创建组别', target: `/tournaments/${id}/edit?section=divisions` },
        quickReplies: ['帮我加一个组别', '这届还差什么没做'],
        topic: 'standings'
      }
    }
    const target = findDivision(text)
    const results = (target ? [target] : divisions.value).map(item => ({ division: item, ...standingsForDivision(item) }))
    const finishedCount = results.reduce((sum, item) => sum + item.counted, 0)
    if (!finishedCount) {
      return {
        text: `这届已编排 ${matches.value.length} 场比赛，但还没有已完赛的比分，所以现在算不出名次。比赛结束并复核后我就能直接告诉你第一名是谁。`,
        action: { label: '进入比赛管理', target: `/tournaments/${id}/matches` },
        quickReplies: ['今天有几场比赛', '这届有多少支球队'],
        topic: 'standings'
      }
    }
    if (target) {
      const result = results[0]
      if (!result.rows.length) {
        return { text: `${target.name || '未命名组别'}还没有已完赛的比分，暂时排不出名次。`, action: { label: '进入比赛管理', target: `/tournaments/${id}/matches` }, quickReplies: ['看看全部组别排名', '这届还差什么没做'], topic: 'standings' }
      }
      const champion = result.rows[0]
      return {
        text: `${target.name || '未命名组别'}目前第 1 名是 ${champion.name}，${champion.points} 分（${champion.played} 场 ${champion.won} 胜 ${champion.drawn} 平 ${champion.lost} 负，净胜 ${champion.gf - champion.ga}）。按已完赛的 ${result.counted} 场比分现算，前 ${Math.min(5, result.rows.length)} 名如下：`,
        list: standingsLines(result.rows),
        action: { label: '进入比赛管理', target: `/tournaments/${id}/matches` },
        quickReplies: ['看看全部组别排名', '这届还差什么没做'],
        topic: 'standings'
      }
    }
    const ranked = results.filter(item => item.rows.length)
    return {
      text: `各组别第 1 名（按已完赛比分现算）：`,
      list: ranked.map(item => `${item.division.name || '未命名组别'}：${item.rows[0].name}，${item.rows[0].points} 分（${item.rows[0].played} 场 ${item.rows[0].won} 胜 ${item.rows[0].drawn} 平 ${item.rows[0].lost} 负）`),
      action: { label: '进入比赛管理', target: `/tournaments/${id}/matches` },
      quickReplies: [`${ranked[0] ? ranked[0].division.name || '第一组' : '第一组'}排名`, '今天有几场比赛'],
      topic: 'standings'
    }
  }

  if (has('赛果', '复核', '成绩', '归档')) {
    return {
      text: reviewMatches.value.length ? `这届有 ${reviewMatches.value.length} 场赛果待复核归档。` : `没有待复核的赛果，${completedMatches.value.length} 场比赛已结束归档。`,
      action: { label: '进入赛果与排名', target: `/tournaments/${id}/results` },
      quickReplies: ['看下积分榜', '今天有几场比赛'],
      topic: 'results'
    }
  }

  if (has('最大比分', '进球最多', '总进球', '平均进球', '多少球', '几个球')) {
    const stats = scoreStats()
    if (!stats.count) {
      return {
        text: `这届还没有已复核的比分，暂时没有进球统计。`,
        action: { label: '进入比赛管理', target: `/tournaments/${id}/matches` },
        quickReplies: ['今天有几场比赛', '这届有多少支球队'],
        topic: 'scoreStats'
      }
    }
    const biggest = stats.biggest
    return {
      text: `这届已出比分 ${stats.count} 场，共 ${stats.total} 个进球，场均 ${stats.average} 个。${biggest ? `进球最多的一场是 ${matchDate(biggest.match)} ${teamName(biggest.match, 'home')} ${biggest.match.homeScore}:${biggest.match.awayScore} ${teamName(biggest.match, 'away')}，共 ${biggest.goals} 球。` : ''}`,
      action: { label: '进入比赛管理', target: `/tournaments/${id}/matches` },
      quickReplies: ['看下积分榜', '今天有几场比赛'],
      topic: 'scoreStats'
    }
  }

  if (has('没出比分', '未出比分', '没有比分', '待录入', '没录', '待出成绩')) {
    const missing = matches.value.filter(match => !isScoredMatch(match))
    return {
      text: missing.length ? `还有 ${missing.length} 场没有已复核的比分（共 ${matches.value.length} 场）。` : `这届 ${matches.value.length} 场比赛都已出比分。`,
      list: missing.slice(0, 6).map(match => `${matchDate(match)}　${teamName(match, 'home')} VS ${teamName(match, 'away')}`),
      action: { label: '进入比赛管理', target: `/tournaments/${id}/matches` },
      quickReplies: ['看下积分榜', '今天有几场比赛'],
      topic: 'missingScores'
    }
  }

  if (has('名单', '有哪些队', '都有哪些', '列一下', '都是谁')) {
    const approvedNames = approvedTeams.value.map(item => String(item.teamName || item.name || '').trim()).filter(Boolean)
    const names = approvedNames.length ? approvedNames : teamNames()
    return {
      text: names.length ? `已记录 ${registrations.value.length} 条参赛记录，其中已确认 ${approvedTeams.value.length} 支。球队名单如下（最多列 20 支）：` : '这届还没有参赛球队记录。',
      list: names.slice(0, 20),
      action: { label: '去球队管理', target: `/tournaments/${id}/teams` },
      quickReplies: ['这届有多少支球队', '看下积分榜'],
      topic: 'teamList'
    }
  }

  if (has('什么时候', '几号', '几月', '日期', '多久', '几天', '开始', '结束', '截止')) {
    return {
      text: `${name}的赛期是 ${dateRange.value}，当前状态「${tournamentStatus.value}」。${todayMatches.value.length ? `今天安排了 ${todayMatches.value.length} 场比赛。` : '今天没有安排比赛。'}`,
      quickReplies: ['今天有几场比赛', '这届还差什么没做'],
      topic: 'schedule'
    }
  }

  if (has('场地', '地点', '在哪', '哪里', '赛区', '城市')) {
    const venues = venueList()
    return {
      text: venues.length ? `这届赛场在${regionLabel.value}，比赛场地包括：${venues.slice(0, 6).join('、')}${venues.length > 6 ? ' 等' : ''}。` : `这届的赛区是${regionLabel.value}，具体场地还没有写进比赛记录，可以在比赛管理里补上。`,
      action: { label: '进入比赛管理', target: `/tournaments/${id}/matches` },
      quickReplies: ['今天有几场比赛', '这届什么时候开始'],
      topic: 'venue'
    }
  }

  if (has('赛程', '比赛', '对阵', '开赛', '场次')) {
    return {
      text: `这届已编排 ${matches.value.length} 场比赛，今天 ${todayMatches.value.length} 场，进行中 ${activeMatches.value.length} 场。`,
      list: matchLines(),
      action: { label: '进入比赛管理', target: `/tournaments/${id}/matches` },
      quickReplies: ['看下积分榜', '这届有多少支球队'],
      topic: 'schedule'
    }
  }

  if (has('球队', '参赛', '报名', '认领')) {
    return {
      text: `这届共 ${registrations.value.length} 条参赛记录：已确认 ${approvedTeams.value.length} 支${pendingTeams.value.length ? `，待确认 ${pendingTeams.value.length} 支` : ''}。`,
      action: pendingTeams.value.length ? { label: '去处理球队', target: `/tournaments/${id}/teams` } : null,
      quickReplies: ['看看球队名单', '这届有多少场比赛'],
      topic: 'teams'
    }
  }

  if (has('球员', '球员卡', '头像', '照片')) {
    return {
      text: '球员资料和球员卡在各球队详情里查看，只能看到本赛事已报名的球员；别家赛事或球队的私有数据不会出现在这里。',
      action: { label: '去球队管理', target: `/tournaments/${id}/teams` },
      quickReplies: ['这届有多少支球队', '这届还差什么没做'],
      topic: 'players'
    }
  }

  if (has('裁判')) {
    return {
      text: `裁判安排按场次记录：这届共 ${matches.value.length} 场比赛，每场裁判在比赛详情里查看或设置；裁判长在赛事人员里配置。控制台不汇总裁判名单。`,
      action: { label: '进入裁判管理', target: `/tournaments/${id}/referees` },
      quickReplies: ['今天有几场比赛', '这届还差什么没做'],
      topic: 'referee'
    }
  }

  if (has('新闻', '公告', '发布')) {
    return { text: '新闻和公告在「新闻中心」发布，可以发图文和赛事通知；控制台这边只负责筹备与比赛执行。', action: { label: '进入新闻中心', target: `/tournaments/${id}/news` }, quickReplies: ['这届还差什么没做', '今天有几场比赛'], topic: 'news' }
  }

  if (has('规则', '赛制', '版本', '专业版', '基础版')) {
    return {
      text: divisions.value.length ? `这届 ${divisions.value.length} 个组别的赛制与版本：` : '这届还没有创建组别，先建组别才能设置赛制。',
      list: divisionLines(),
      action: { label: '去组别管理', target: `/tournaments/${id}/competition` },
      quickReplies: ['这届还差什么没做', '这届什么时候开始'],
      topic: 'divisions'
    }
  }

  if (has('你能', '会什么', '帮什么', '功能', '怎么用', '帮助')) {
    return {
      text: '我可以基于这届赛事已录入的数据回答：筹备进度与待办、组别与赛制、球队和参赛名单、赛程与今日比赛、赛果复核和积分榜、进球统计与未出比分场次、某支球队战绩和两队交锋、赛期与场地，也可以直接带你去对应的管理页面。',
      quickReplies: ['这届还差什么没做', '看下积分榜', '这届什么时候开始'],
      topic: 'help'
    }
  }

  // 具体某个组别：支持“U10”“第一个组”这类问法
  const division = findDivision(text)
  if (division) {
    return {
      text: `${division.name || '未命名组别'}：${divisionMode(division)}，当前${divisionProgressLabel(division)}，${competitionPlanLocked(division) ? '竞赛方案已锁定' : '竞赛方案还没锁定，可在右侧组别方案里确认'}。`,
      action: division && !competitionPlanLocked(division) ? { label: '去组别管理', target: `/tournaments/${id}/competition` } : null,
      quickReplies: ['看看全部组别', '这届还差什么没做'],
      topic: 'division'
    }
  }

  if (has('组别', '级别', '加一个组', '建组') || /U\d{1,2}/i.test(text)) {
    if (!divisions.value.length) return { text: `${name}还没有创建竞赛组别。新增组别需要先确定年龄区间、赛制与名额。`, action: { label: '去创建组别', target: `/tournaments/${id}/edit?section=divisions` }, quickReplies: ['这届还差什么没做', '这届什么时候开始'], topic: 'divisions' }
    return {
      text: `${name}目前有 ${divisions.value.length} 个竞赛组别：${divisions.value.map(item => item.name || '未命名组别').join('、')}。新增组别在组别管理里填写年龄区间、赛制与名额。`,
      action: { label: '去组别管理', target: `/tournaments/${id}/competition` },
      quickReplies: ['看看全部组别', '这届还差什么没做'],
      topic: 'divisions'
    }
  }

  // 兜底也给出真实数据和可继续的方向，不留空回答
  return {
    text: `我没完全对上你想问的部分。${overviewSentence()}你可以直接问比分、组别名次、某支球队的战绩、两队交锋、赛程、球队名单、赛期和场地；身价这类平台统一口径的数据请到数据中心查看。`,
    quickReplies: ['这届还差什么没做', '看下积分榜', '今天有几场比赛', '这届什么时候开始'],
    topic: 'fallback'
  }
}

// 回答前的进度提示：按问题类型展示正在做的检索动作
function progressStages(text) {
  const stages = []
  if (/积分|排名|名次|榜|第一|冠军|头名|最强/.test(text)) stages.push('正在查询比赛记录，计算组别排名…')
  else if (/球队|参赛|报名|认领|名单|球员/.test(text)) stages.push('正在查询参赛球队与名单…')
  else if (/赛程|比赛|对阵|场次|什么时候|场地/.test(text)) stages.push('正在检索赛程与比赛记录…')
  else stages.push('正在查询本赛事数据…')
  stages.push('正在整理回答…')
  return stages
}

// 零成本模式：默认不调用大模型，全部由本地规则基于本赛事数据作答；模型通道就绪后改为 true
const USE_MODEL = false

// 先请大模型基于本赛事数据作答；模型不可用时回落到本地规则引擎，保证一定有回答
async function askModel(question) {
  const history = messages.value.slice(0, -1).slice(-6).map(item => ({ role: item.role, content: item.text || '' })).filter(item => item.content)
  try {
    const raw = await callFunction('tournamentAssistant', { action: 'chat', tournamentId: id, question, history }, 30000)
    const payload = raw && raw.result ? raw.result : raw
    const content = payload && payload.success && payload.data && payload.data.content
    return content ? String(content).trim() : ''
  } catch (error) {
    return ''
  }
}

async function ask(raw) {
  const text = String(raw || '').trim()
  if (!text || thinking.value) return
  messages.value.push({ id: ++messageSeed, role: 'user', text })
  chatInput.value = ''
  thinking.value = true
  thinkingLabel.value = progressStages(text)[0]
  resizeComposer()
  scrollThread()
  let reply = null
  const modelAnswer = USE_MODEL ? await askModel(text) : ''
  if (modelAnswer) {
    reply = { text: modelAnswer, quickReplies: ['详细说明一下', '这届还差什么没做', '看下积分榜'], topic: 'model' }
  }
  if (!reply) {
    try {
      const fallbackStages = ['正在核对本赛事数据…', '正在整理回答…']
      for (let index = 0; index < fallbackStages.length; index += 1) {
        thinkingLabel.value = fallbackStages[index]
        scrollThread()
        await sleep(380)
      }
      reply = respond(text) || { text: overviewSentence(), quickReplies: ['这届还差什么没做'], topic: 'fallback' }
    } catch (error) {
      reply = { text: '刚才读取本赛事数据时出错了。刷新页面后再问一次，或者直接去对应管理页处理。', quickReplies: ['这届还差什么没做', '今天有几场比赛'], topic: 'error' }
    }
  }
  thinking.value = false
  messages.value.push({ id: ++messageSeed, role: 'assistant', ...reply })
  lastTopic = reply.topic || ''
  await nextTick()
  scrollThread()
}

function scrollThread() {
  if (!threadEl.value) return
  threadEl.value.scrollTop = threadEl.value.scrollHeight
}

function resetChat() {
  messages.value = []
  chatInput.value = ''
  lastTopic = ''
  thinking.value = false
  resizeComposer()
}

function resizeComposer() {
  const el = composerEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight || 22, 120)}px`
}

async function loadConsole() {
  if (qaSnapshot) return
  loading.value = true
  try {
    const [currentTournament, currentRegistrations, currentMatches, currentDivisions] = await Promise.all([
      queryById('tournaments', id),
      queryList('tournament_teams', { where: { tournamentId: id }, orderBy: { createTime: 'desc' } }),
      queryList('matches', { where: { tournamentId: id }, orderBy: { matchDate: 'asc' } }),
      queryList('divisions', { where: { tournamentId: id }, orderBy: { createTime: 'asc' }, silent: true })
    ])
    tournament.value = Array.isArray(currentTournament) ? currentTournament[0] || {} : currentTournament || {}
    const logoSource = String(tournament.value.logoTransparentUrl || tournament.value.logoUrl || tournament.value.logo || '')
    if (logoSource.startsWith('cloud://')) {
      const resolved = await getFileUrl(logoSource)
      resolvedTournamentLogo.value = /^https?:\/\//i.test(String(resolved || '')) ? resolved : ''
    } else {
      resolvedTournamentLogo.value = ''
    }
    registrations.value = currentRegistrations || []
    matches.value = currentMatches || []
    divisionRecords.value = currentDivisions || []
  } finally {
    loading.value = false
  }
}

function go(target) { router.push(target) }
function divisionId(division) { return String(division?.id || division?._id || '') }
function competitionPlanLocked(division) { return division?.competitionPlanLocked === true || ['locked', 'match_management', 'in_progress', 'completed'].includes(String(division?.competitionPlanStatus || '').toLowerCase()) }
async function confirmPlan(division) {
  const selectedDivisionId = divisionId(division)
  if (!selectedDivisionId || confirmingDivisionId.value) return
  try {
    await ElMessageBox.confirm(`确认“${division.name || '当前组别'}”的竞赛方案并进入比赛管理吗？确认后该组别版本永久锁定。`, '确认竞赛方案', { type: 'warning', confirmButtonText: '确认并进入比赛管理', cancelButtonText: '返回检查' })
  } catch { return }
  confirmingDivisionId.value = selectedDivisionId
  try {
    const result = await confirmCompetitionPlan(id, { divisionId: selectedDivisionId })
    if (!result?.success) throw new Error(result?.error || '竞赛方案确认失败')
    ElMessage.success(result.message || '竞赛方案已锁定')
    await router.push(result.nextRoute || { path: `/tournaments/${id}/matches`, query: { divisionId: selectedDivisionId } })
  } catch (error) {
    ElMessage.error(error.message || '竞赛方案确认失败')
  } finally {
    confirmingDivisionId.value = ''
  }
}
function matchTimestamp(match) { return new Date(match.matchDate || match.date || match.startTime || 0) }
function formatDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '日期待定' : `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}` }
function divisionMode(division) { return division.mode === 'professional' || division.isProfessional ? '专业版' : '基础版' }
function divisionProgressLabel(division) { if (division.status === 'completed') return '已完成'; if (division.status === 'ongoing') return '比赛进行中'; if (division.rulesLocked) return '规则已定版'; if (division.status === 'configured') return '配置中'; return '待配置' }
function matchDate(match) { return formatDate(match.matchDate || match.date || match.startTime).slice(5).replace(/\./g, '-') }
function matchTime(match) { const value = match.matchTime || match.time || match.startTime; if (!value) return '时间待定'; if (typeof value === 'string' && value.includes('T')) return value.slice(11, 16); return String(value).slice(0, 5) }
function teamName(match, side) { return match[`${side}TeamName`] || match[`${side}Name`] || (side === 'home' ? '主队待定' : '客队待定') }
function matchStatus(status) { return ({ ongoing: '进行中', in_progress: '进行中', live: '进行中', completed: '已结束', finished: '已结束', scheduled: '未开始', pending: '未开始' })[status] || '待确认' }
onMounted(loadConsole)
</script>

<style scoped>
.tournament-console { box-sizing:border-box; width:100%; max-width:1280px; margin:0 auto; padding:0 0 20px; color:#17241d; }
.console-head { display:flex; align-items:center; justify-content:space-between; gap:16px; min-height:60px; margin-bottom:14px; padding:0 18px; border:1px solid #e6ece8; border-radius:14px; background:#fff; }
.head-identity { display:flex; min-width:0; align-items:center; gap:11px; }
.head-logo { width:34px; height:34px; flex:0 0 34px; object-fit:contain; }
.head-logo.placeholder { display:grid; place-items:center; border-radius:8px; color:#078545; font-size:17px; background:#eef7f1; }
.head-copy { min-width:0; }
.head-copy h1 { overflow:hidden; margin:0; color:#17241d; font-size:16px; font-weight:650; letter-spacing:.2px; text-overflow:ellipsis; white-space:nowrap; }
.head-meta { display:flex; align-items:center; flex-wrap:wrap; gap:6px; margin:3px 0 0; color:#7c8a82; font-size:12px; }
.head-meta i { color:#c3ccc6; font-style:normal; }
.head-state { padding:1px 7px; border-radius:999px; color:#21844d; font-size:11px; background:#eef8f1; }
.state-draft { color:#77857c; background:#f1f4f2; }
.state-completed,.state-finished { color:#77857c; background:#f1f4f2; }
.head-actions { display:flex; flex:0 0 auto; gap:8px; }

.console-main { display:grid; grid-template-columns:minmax(0,1fr) 304px; align-items:stretch; gap:14px; height:calc(100vh - 168px); min-height:520px; }

.chat-panel { display:flex; min-width:0; min-height:0; flex-direction:column; border:1px solid #e6ece8; border-radius:16px; background:#fff; box-shadow:0 1px 2px rgba(18,42,30,.04); }
.chat-bar { display:flex; align-items:center; justify-content:space-between; flex:0 0 auto; padding:12px 18px; border-bottom:1px solid #f0f3f1; }
.chat-status { display:inline-flex; align-items:center; gap:7px; color:#33453a; font-size:13px; font-weight:600; }
.chat-status i { width:6px; height:6px; border-radius:50%; background:#12b76a; box-shadow:0 0 0 3px #e7f7ee; }
.text-button { padding:0; border:0; color:#5c7d6a; font-size:12px; white-space:nowrap; background:transparent; cursor:pointer; }
.text-button:hover { color:#078545; }

.thread { flex:1; min-height:0; overflow-y:auto; padding:24px 22px 8px; scroll-behavior:smooth; }
.welcome { display:flex; max-width:640px; margin:6vh auto 0; flex-direction:column; align-items:center; text-align:center; }
.welcome h2 { margin:0; color:#12211a; font-size:22px; font-weight:650; }
.welcome p { margin:8px 0 22px; color:#7c8a82; font-size:13px; line-height:1.6; }
.suggest-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; width:100%; }
.suggest-card { display:flex; min-width:0; align-items:center; gap:10px; padding:12px 13px; border:1px solid #e6ece8; border-radius:12px; text-align:left; background:#fff; cursor:pointer; transition:border-color .15s ease,background .15s ease; }
.suggest-card:hover { border-color:#a9d8bd; background:#f7fcf9; }
.suggest-icon { display:grid; width:32px; height:32px; flex:0 0 32px; place-items:center; border-radius:9px; color:#078545; font-size:16px; background:#eef7f1; }
.suggest-text { display:flex; min-width:0; flex:1; flex-direction:column; gap:2px; }
.suggest-text strong { color:#1e2f26; font-size:13px; font-weight:600; }
.suggest-text small { overflow:hidden; color:#84908a; font-size:11px; text-overflow:ellipsis; white-space:nowrap; }
.suggest-arrow { flex:0 0 auto; color:#b3c0b8; font-size:13px; }

.msg { display:flex; margin-bottom:18px; }
.msg.user { justify-content:flex-end; }
.bubble { max-width:76%; padding:10px 14px; border-radius:14px 14px 4px 14px; color:#fff; font-size:14px; line-height:1.6; background:#078545; }
.msg.assistant { gap:10px; }
.avatar { display:grid; width:28px; height:28px; flex:0 0 28px; place-items:center; border-radius:50%; color:#078545; font-size:12px; font-weight:600; background:#eef7f1; }
.msg-body { min-width:0; flex:1; max-width:600px; padding-top:2px; }
.msg-body p { margin:0; color:#243a2d; font-size:14px; line-height:1.75; white-space:pre-line; }
.msg-list { margin:8px 0 0; padding-left:18px; color:#2f4738; font-size:13px; line-height:1.9; }
.msg-action { display:inline-flex; align-items:center; gap:3px; margin-top:8px; padding:5px 10px; border:1px solid #cde6d8; border-radius:8px; color:#078545; font-size:12px; background:#f7fcf9; cursor:pointer; }
.msg-action:hover { border-color:#a9d8bd; background:#f0faf4; }
.quick-replies { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }
.quick-replies button { padding:4px 10px; border:1px solid #e2ebe6; border-radius:999px; color:#4c6a58; font-size:12px; background:#fff; cursor:pointer; transition:border-color .15s ease,color .15s ease; }
.quick-replies button:hover { border-color:#a9d8bd; color:#078545; }
.typing { display:flex; align-items:center; gap:4px; height:28px; }
.thinking-row { display:flex; align-items:center; gap:9px; min-height:28px; }
.thinking-text { color:#8b9791; font-size:12px; }
.typing i { width:6px; height:6px; border-radius:50%; background:#b7c5bc; animation:typing-bounce 1.2s infinite ease-in-out; }
.typing i:nth-child(2) { animation-delay:.15s; }
.typing i:nth-child(3) { animation-delay:.3s; }
@keyframes typing-bounce { 0%,60%,100% { opacity:.35; transform:translateY(0); } 30% { opacity:1; transform:translateY(-3px); } }

.composer-wrap { flex:0 0 auto; padding:10px 18px 14px; }
.composer { display:flex; align-items:flex-end; gap:8px; padding:8px 8px 8px 14px; border:1px solid #dfe7e2; border-radius:14px; background:#fff; transition:border-color .15s ease,box-shadow .15s ease; }
.composer.active { border-color:#9dcdb2; box-shadow:0 0 0 3px rgba(7,133,69,.06); }
.composer textarea { flex:1; min-width:0; max-height:120px; padding:6px 0; border:0; color:#1d2f25; font-size:14px; font-family:inherit; line-height:1.6; background:transparent; outline:none; resize:none; }
.composer textarea::placeholder { color:#9aa79f; }
.send-button { display:grid; width:32px; height:32px; flex:0 0 32px; place-items:center; border:0; border-radius:10px; color:#fff; font-size:15px; background:#078545; cursor:pointer; transition:opacity .15s ease; }
.send-button:disabled { color:#a9b6ae; background:#eef1ef; cursor:not-allowed; }
.composer-hint { margin:7px 2px 0; color:#9aa79f; font-size:11px; }

.rail { display:flex; min-height:0; flex-direction:column; gap:12px; overflow-y:auto; padding-right:2px; }
.rail-card { flex:0 0 auto; padding:14px 16px; border:1px solid #e6ece8; border-radius:14px; background:#fff; }
.rail-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px; }
.rail-head h2 { margin:0; color:#1d3025; font-size:13px; font-weight:600; }
.rail-count { color:#8b9791; font-size:11px; }
.rail-empty { margin:0; color:#93a099; font-size:12px; line-height:1.6; }
.assistant-card { border-color:#d5e9de; background:#fbfefc; }
.assistant-head { display:flex; align-items:center; gap:9px; }
.assistant-avatar { display:grid; width:30px; height:30px; flex:0 0 30px; place-items:center; border-radius:50%; color:#078545; font-size:12px; font-weight:600; background:#e7f6ed; }
.assistant-id h2 { margin:0; color:#1d3025; font-size:13px; font-weight:650; }
.assistant-id p { display:flex; align-items:center; gap:5px; margin:2px 0 0; color:#8b9791; font-size:11px; }
.assistant-id p i { width:5px; height:5px; border-radius:50%; background:#12b76a; }
.assistant-insight { margin:10px 0 0; color:#2f4738; font-size:12px; line-height:1.7; }
.assistant-actions { margin:10px 0 0; padding:0; list-style:none; }
.assistant-actions li + li { margin-top:6px; }
.assistant-actions button { display:flex; width:100%; align-items:center; justify-content:space-between; gap:8px; padding:7px 10px; border:1px solid #e2ebe6; border-radius:9px; color:#33503f; font-size:12px; text-align:left; background:#fff; cursor:pointer; transition:border-color .15s ease,color .15s ease; }
.assistant-actions button:hover { border-color:#a9d8bd; color:#078545; }
.assistant-todo { margin-top:12px; padding-top:11px; border-top:1px solid #eaf2ed; }
.assistant-cta { width:100%; margin-top:11px; padding:7px 0; border:1px solid #cde6d8; border-radius:9px; color:#078545; font-size:12px; background:#fff; cursor:pointer; transition:background .15s ease; }
.assistant-cta:hover { background:#f0faf4; }
.rail-note { margin:8px 0 0; color:#8b9791; font-size:11px; line-height:1.6; }
.todo-list,.match-list,.stage-list,.division-list { margin:0; padding:0; list-style:none; }
.todo-list li,.match-list li { display:flex; align-items:center; gap:7px; min-height:30px; }
.todo-dot { width:5px; height:5px; flex:0 0 5px; border-radius:50%; background:#b9c4bd; }
.todo-dot.green { background:#12b76a; }
.todo-dot.orange { background:#f79009; }
.todo-dot.blue { background:#2e90fa; }
.todo-text { flex:1; overflow:hidden; color:#2b3f33; font-size:12px; text-overflow:ellipsis; white-space:nowrap; }
.match-list time { flex:0 0 38px; color:#078545; font-size:11px; }
.match-text { flex:1; overflow:hidden; color:#33473b; font-size:12px; text-overflow:ellipsis; white-space:nowrap; }
.match-text b { color:#a7b3ab; font-size:9px; }
.match-state { padding:1px 5px; border-radius:4px; color:#75837b; font-size:10px; white-space:nowrap; background:#f1f4f2; }
.match-ongoing,.match-in_progress,.match-live { color:#078547; background:#e8f8ee; }
.overview-row { display:flex; gap:10px; }
.overview-row button { display:flex; flex:1; min-width:0; flex-direction:column; gap:1px; padding:8px 0; border:0; border-radius:8px; text-align:left; background:transparent; cursor:pointer; }
.overview-row button:hover { background:#f7fbf8; }
.overview-row strong { color:#132119; font-size:20px; line-height:1.2; }
.overview-row span { color:#7f8c85; font-size:11px; }
.stage-bar { height:3px; margin-bottom:10px; overflow:hidden; border-radius:3px; background:#edf1ee; }
.stage-bar i { display:block; height:100%; border-radius:inherit; background:#078545; }
.stage-list li { display:flex; align-items:center; gap:7px; min-height:25px; }
.stage-dot { width:5px; height:5px; flex:0 0 5px; border-radius:50%; background:#d5ded8; }
.stage-dot.done { background:#12b76a; }
.stage-dot.active { background:#f79009; box-shadow:0 0 0 3px #fef3e6; }
.stage-name { flex:1; color:#33473b; font-size:12px; }
.stage-note { color:#8b9791; font-size:11px; white-space:nowrap; }
.division-block { margin-top:11px; padding-top:10px; border-top:1px solid #f0f3f1; }
.division-title { margin:0 0 6px; color:#8b9791; font-size:11px; }
.division-list li { display:flex; align-items:center; gap:7px; min-height:27px; font-size:12px; }
.division-list strong { color:#2b3f33; font-size:12px; }
.division-mode { padding:1px 4px; border-radius:3px; color:#8b9791; font-size:10px; background:#f4f6f5; }
.division-state { flex:1; color:#8b9791; font-size:11px; }

@media (max-width:1180px) {
  .console-main { grid-template-columns:minmax(0,1fr); height:auto; }
  .chat-panel { height:calc(100vh - 210px); min-height:460px; }
  .rail { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); overflow:visible; }
}
@media (max-width:760px) {
  .console-head { flex-direction:column; align-items:flex-start; padding:12px 14px; }
  .head-actions { width:100%; }
  .rail { grid-template-columns:minmax(0,1fr); }
  .suggest-grid { grid-template-columns:minmax(0,1fr); }
  .thread { padding:18px 14px 4px; }
  .bubble { max-width:88%; }
}
</style>
