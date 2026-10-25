<template>
  <section v-loading="loading" class="tournament-console" aria-labelledby="console-title">
    <header class="console-head">
      <div class="head-main">
        <img v-if="tournamentLogo" class="head-logo" :src="tournamentLogo" :alt="`${tournament.name} Logo`" />
        <span v-else class="head-logo placeholder"><el-icon><Trophy /></el-icon></span>
        <div class="head-text">
          <h1 id="console-title">{{ tournament.name || '赛事主控制台' }}</h1>
          <p class="head-sub">
            <span class="head-chip">{{ divisions.length }} 个组别</span>
            <span class="head-state" :class="`state-${tournament.status || 'draft'}`">{{ tournamentStatus }}</span>
            <span class="head-meta"><el-icon><Calendar /></el-icon>{{ dateRange }}</span>
            <span class="head-meta"><el-icon><Location /></el-icon>{{ regionLabel }}</span>
          </p>
        </div>
      </div>
      <div class="head-actions">
        <el-button :icon="Refresh" plain :loading="loading" @click="loadConsole">刷新</el-button>
        <el-button plain type="primary" :icon="Back" @click="router.push('/tournament-space')">返回赛事空间</el-button>
      </div>
    </header>

    <section class="assistant" aria-label="赛事助手">
      <div ref="threadEl" class="thread">
        <div class="bubble assistant">
          <p>我是{{ tournament.name || '本赛事' }}的赛事助手。可以问我筹备进度、组别、球队、赛程和赛果，回答只使用本赛事已录入的数据。</p>
        </div>
        <div v-for="message in messages" :key="message.id" class="bubble" :class="message.role">
          <p>{{ message.text }}</p>
          <ul v-if="message.list && message.list.length">
            <li v-for="(line, index) in message.list" :key="index">{{ line }}</li>
          </ul>
          <button v-if="message.action" type="button" class="bubble-link" @click="go(message.action.target)">
            {{ message.action.label }}
            <el-icon><ArrowRight /></el-icon>
          </button>
        </div>
      </div>

      <div v-if="!messages.length" class="suggestions">
        <button v-for="item in suggestions" :key="item" type="button" @click="ask(item)">{{ item }}</button>
      </div>

      <div class="ask-bar">
        <el-input v-model="chatInput" placeholder="问问这届赛事的情况…" @keyup.enter="ask(chatInput)" />
        <el-button type="primary" :icon="Promotion" :disabled="!chatInput.trim()" @click="ask(chatInput)">发送</el-button>
      </div>
    </section>

    <div class="module-row">
      <section class="module">
        <header class="module-head">
          <h2>今日待办</h2>
          <button v-if="todos.length > 3" type="button" class="module-link" @click="showAllTodos = !showAllTodos">{{ showAllTodos ? '收起' : `全部 ${todos.length} 项` }}</button>
        </header>
        <p v-if="!todos.length" class="module-empty">当前没有需要处理的事项</p>
        <ul v-else class="todo-list">
          <li v-for="todo in visibleTodos" :key="todo.key">
            <span class="todo-dot" :class="todo.tone"></span>
            <span class="todo-text">{{ todo.text }}</span>
            <button type="button" class="module-link" @click="go(todo.target)">去处理</button>
          </li>
        </ul>
      </section>

      <section class="module">
        <header class="module-head">
          <h2>今日赛程</h2>
          <button type="button" class="module-link" @click="go(`/tournaments/${id}/matches`)">比赛管理</button>
        </header>
        <p v-if="!todayMatches.length" class="module-empty">今天没有安排比赛</p>
        <ul v-else class="match-list">
          <li v-for="match in todayMatches" :key="match._id">
            <time>{{ matchTime(match) }}</time>
            <span class="match-text">{{ teamName(match, 'home') }} <b>VS</b> {{ teamName(match, 'away') }}</span>
            <span class="match-state" :class="`match-${match.status || 'pending'}`">{{ matchStatus(match.status) }}</span>
          </li>
        </ul>
        <p v-if="!todayMatches.length && nextMatch" class="next-match">下一场 {{ matchDate(nextMatch) }} {{ matchTime(nextMatch) }} · {{ teamName(nextMatch, 'home') }} VS {{ teamName(nextMatch, 'away') }}</p>
      </section>

      <section class="module overview">
        <header class="module-head"><h2>赛事概览</h2></header>
        <div class="overview-row">
          <div><strong>{{ divisions.length }}</strong><span>竞赛组别</span></div>
          <div><strong>{{ approvedTeams.length }}</strong><span>参赛球队</span></div>
          <div><strong>{{ matches.length }}</strong><span>已排比赛</span></div>
        </div>
        <p class="overview-note">{{ overviewNote }}</p>
      </section>
    </div>

    <section class="stage-panel">
      <button type="button" class="stage-toggle" :aria-expanded="showStages" @click="showStages = !showStages">
        <span>比赛筹备阶段 · 已完成 {{ doneStageCount }}/{{ stages.length }}</span>
        <el-icon><component :is="showStages ? ArrowDown : ArrowRight" /></el-icon>
      </button>
      <div v-if="showStages" class="stage-body">
        <div class="stage-row">
          <template v-for="(stage, index) in stages" :key="stage.label">
            <button type="button" class="stage-item" :class="{ done: stage.done, active: stage.active }" @click="go(stage.target)">
              <span><el-icon><component :is="stage.icon" /></el-icon></span>
              <strong>{{ stage.label }}</strong>
              <small>{{ stage.note }}</small>
            </button>
            <i v-if="index < stages.length - 1" class="stage-arrow" aria-hidden="true"><el-icon><ArrowRight /></el-icon></i>
          </template>
        </div>
        <div class="stage-line"><span :style="{ width: `${stageCompletion}%` }"></span></div>

        <ul class="division-list">
          <li v-for="division in divisions" :key="division.id || division._id || division.name">
            <strong>{{ division.name || '未命名组别' }}</strong>
            <span class="division-mode">{{ divisionMode(division) }}</span>
            <span class="division-progress"><i><b :style="{ width: `${divisionProgress(division)}%` }"></b></i><em>{{ divisionProgressLabel(division) }}</em></span>
            <el-button v-if="!qaSnapshot && !competitionPlanLocked(division)" size="small" type="primary" plain :loading="confirmingDivisionId === divisionId(division)" @click="confirmPlan(division)">确认方案</el-button>
            <el-tag v-else-if="competitionPlanLocked(division)" size="small" type="success" effect="plain">已锁定</el-tag>
            <span v-else class="division-note">方案待确认</span>
          </li>
        </ul>
        <p v-if="!divisions.length" class="module-empty">尚未创建竞赛组别 <el-button link type="primary" @click="go(`/tournaments/${id}/edit?section=divisions`)">添加组别</el-button></p>
      </div>
    </section>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowDown, ArrowRight, Back, Calendar, CircleCheck, DocumentChecked, Grid, Location, Promotion, Refresh, Tickets, Trophy, UserFilled } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { confirmCompetitionPlan, getFileUrl, queryById, queryList } from '../../utils/cloud'
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
const showStages = ref(false)
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
  { label: '组别规则', note: divisions.value.length ? `${divisions.value.length} 个已创建` : '待创建', icon: DocumentChecked, done: divisions.value.length > 0, active: divisions.value.length === 0, target: `/tournaments/${id}/edit?section=divisions` },
  { label: '球队入驻', note: `${approvedTeams.value.length}/${registrations.value.length || 0} 已确认`, icon: UserFilled, done: registrations.value.length > 0 && pendingTeams.value.length === 0, active: pendingTeams.value.length > 0, target: `/tournaments/${id}/teams` },
  { label: '抽签分组', note: tournament.value.drawCompleted ? '已完成' : '待配置', icon: Tickets, done: tournament.value.drawCompleted === true, active: divisions.value.length > 0 && !tournament.value.drawCompleted, target: `/tournaments/${id}/draw` },
  { label: '赛程发布', note: matches.value.length ? `${matches.value.length} 场已编排` : '待编排', icon: Calendar, done: matches.value.length > 0 && tournament.value.schedulePublished === true, active: matches.value.length > 0 && !tournament.value.schedulePublished, target: `/tournaments/${id}/matches` },
  { label: '比赛执行', note: activeMatches.value.length ? `${activeMatches.value.length} 场进行中` : '待开赛', icon: Promotion, done: matches.value.some(item => ['completed', 'finished'].includes(item.status)), active: activeMatches.value.length > 0, target: `/tournaments/${id}/matches` },
  { label: '赛果归档', note: reviewMatches.value.length ? `${reviewMatches.value.length} 场待复核` : '待赛后复核', icon: CircleCheck, done: matches.value.length > 0 && reviewMatches.value.length === 0 && matches.value.every(item => ['completed', 'finished', 'archived'].includes(item.status)), active: reviewMatches.value.length > 0, target: `/tournaments/${id}/matches` }
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

// 赛事助手：仅使用本赛事已加载数据拼装固定回答，不调用模型
const suggestions = ['这届还差什么没做', '看下积分榜', '帮我加一个组别']
const messages = ref([])
const chatInput = ref('')
const threadEl = ref(null)
let messageSeed = 0

function buildReply(raw) {
  const text = String(raw || '').trim()
  const name = tournament.value.name || '本赛事'
  const has = (...keys) => keys.some(key => text.includes(key))

  if (has('待办', '进度', '还差', '缺什么', '没做', '下一步', '准备')) {
    if (!todos.value.length) return { text: `${name}目前没有待处理事项：${divisions.value.length} 个组别、${approvedTeams.value.length} 支参赛球队、${matches.value.length} 场比赛都已录入。` }
    return { text: `${name}目前还差 ${todos.value.length} 项：`, list: todos.value.map(item => item.text), action: { label: '去处理', target: todos.value[0].target } }
  }

  if (has('积分', '排名', '榜', '名次')) {
    return {
      text: completedMatches.value.length
        ? `积分榜按竞赛组别分别生成。本赛事已有 ${completedMatches.value.length} 场比赛结束，${divisions.value.length} 个组别的积分榜可在比赛管理中查看。`
        : '本赛事还没有已确认的赛果。比赛结束并完成复核后，系统才会按组别生成积分榜。',
      action: { label: '进入比赛管理', target: `/tournaments/${id}/matches` }
    }
  }

  if (has('组别', '级别', '加一个组', '建组') || /U\d{1,2}/i.test(text)) {
    if (!divisions.value.length) return { text: `${name}还没有创建竞赛组别。新增组别需要先确定年龄区间、赛制与名额。`, action: { label: '去创建组别', target: `/tournaments/${id}/edit?section=divisions` } }
    const names = divisions.value.map(item => item.name || '未命名组别').join('、')
    return { text: `${name}目前有 ${divisions.value.length} 个竞赛组别：${names}。新增组别请在组别管理中填写年龄区间、赛制与名额。`, action: { label: '去组别管理', target: `/tournaments/${id}/competition` } }
  }

  if (has('球队', '参赛', '报名', '名单', '认领')) {
    return {
      text: `共 ${registrations.value.length} 条参赛记录：已确认 ${approvedTeams.value.length} 支${pendingTeams.value.length ? `，待确认 ${pendingTeams.value.length} 支` : ''}。`,
      action: pendingTeams.value.length ? { label: '去处理球队', target: `/tournaments/${id}/teams` } : null
    }
  }

  if (has('赛果', '复核', '成绩', '归档')) {
    return {
      text: reviewMatches.value.length ? `${reviewMatches.value.length} 场赛果待复核归档。` : `没有待复核的赛果，${completedMatches.value.length} 场比赛已结束归档。`,
      action: { label: '进入比赛管理', target: `/tournaments/${id}/matches` }
    }
  }

  if (has('赛程', '比赛', '对阵', '开赛', '场地')) {
    return {
      text: `已编排 ${matches.value.length} 场比赛，今天 ${todayMatches.value.length} 场，进行中 ${activeMatches.value.length} 场。`,
      action: { label: '进入比赛管理', target: `/tournaments/${id}/matches` }
    }
  }

  return { text: '这个功能还在接入中。现在我可以用本赛事已录入的数据回答筹备进度、组别、球队、赛程和赛果相关的问题。' }
}

async function ask(raw) {
  const text = String(raw || '').trim()
  if (!text) return
  messages.value.push({ id: ++messageSeed, role: 'user', text })
  chatInput.value = ''
  messages.value.push({ id: ++messageSeed, role: 'assistant', ...buildReply(text) })
  await nextTick()
  if (threadEl.value) threadEl.value.scrollTop = threadEl.value.scrollHeight
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
function divisionProgress(division) { if (division.status === 'completed' || division.rulesLocked) return 100; if (division.status === 'ongoing') return 68; if (division.status === 'configured') return 42; return 8 }
function divisionProgressLabel(division) { if (division.status === 'completed') return '已完成'; if (division.status === 'ongoing') return '比赛进行中'; if (division.rulesLocked) return '规则已定版'; if (division.status === 'configured') return '配置中'; return '待配置' }
function matchDate(match) { return formatDate(match.matchDate || match.date || match.startTime).slice(5).replace('.', '-') }
function matchTime(match) { const value = match.matchTime || match.time || match.startTime; if (!value) return '时间待定'; if (typeof value === 'string' && value.includes('T')) return value.slice(11, 16); return String(value).slice(0, 5) }
function teamName(match, side) { return match[`${side}TeamName`] || match[`${side}Name`] || (side === 'home' ? '主队待定' : '客队待定') }
function matchStatus(status) { return ({ ongoing: '进行中', in_progress: '进行中', live: '进行中', completed: '已结束', finished: '已结束', scheduled: '未开始', pending: '未开始' })[status] || '待确认' }
onMounted(loadConsole)
</script>

<style scoped>
.tournament-console { box-sizing:border-box; width:100%; max-width:var(--admin-content-max-width); margin:0 auto; padding:0 var(--admin-content-gutter-x) 28px; }
.console-head { display:flex; align-items:center; justify-content:space-between; gap:16px; min-height:72px; margin:0 calc(var(--admin-content-gutter-x) * -1); padding:0 var(--admin-content-gutter-x); border-bottom:1px solid #e2e9e4; background:#fff; }
.head-main { display:flex; min-width:0; align-items:center; gap:13px; }
.head-logo { width:44px; height:44px; flex:0 0 44px; object-fit:contain; }
.head-logo.placeholder { display:grid; place-items:center; color:#087542; font-size:22px; background:transparent; }
.head-text { min-width:0; }
.head-text h1 { overflow:hidden; margin:0; color:#17241d; font-size:20px; font-weight:650; text-overflow:ellipsis; white-space:nowrap; }
.head-sub { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin:5px 0 0; }
.head-chip,.head-state { padding:2px 7px; border:1px solid #bcddff; border-radius:4px; color:#1375da; font-size:12px; white-space:nowrap; }
.head-state { border-color:#bce5c9; color:#21844d; background:#f2fbf5; }
.state-draft { border-color:#dce4df; color:#66756c; background:#f7f9f7; }
.state-completed,.state-finished { border-color:#dce4df; color:#66756c; }
.head-meta { display:inline-flex; align-items:center; gap:4px; color:#5e6c64; font-size:12px; white-space:nowrap; }
.head-actions { display:flex; gap:10px; flex:0 0 auto; }

.assistant { max-width:760px; margin:28px auto 0; padding:20px 20px 16px; border:1px solid #e2e9e4; border-radius:14px; background:#fff; box-shadow:0 4px 20px rgba(21,52,35,.045); }
.thread { display:flex; flex-direction:column; gap:12px; max-height:400px; overflow-y:auto; }
.bubble { max-width:86%; padding:11px 14px; border-radius:12px; font-size:14px; line-height:1.6; }
.bubble.assistant { align-self:flex-start; border:1px solid #e6ede8; border-top-left-radius:4px; color:#26362c; background:#f4f8f5; }
.bubble.user { align-self:flex-end; border-top-right-radius:4px; color:#fff; background:#078545; }
.bubble p { margin:0; }
.bubble ul { margin:8px 0 0; padding-left:18px; }
.bubble li { font-size:13px; }
.bubble-link { display:inline-flex; align-items:center; gap:3px; margin-top:8px; padding:0; border:0; color:#078545; font-size:13px; background:transparent; cursor:pointer; }
.bubble-link:hover { text-decoration:underline; }
.suggestions { display:flex; flex-wrap:wrap; gap:8px; margin-top:16px; }
.suggestions button { padding:8px 13px; border:1px solid #dbe6df; border-radius:999px; color:#31503d; font-size:13px; background:#fff; cursor:pointer; }
.suggestions button:hover { border-color:#9bcfae; color:#076b3a; background:#f6fbf7; }
.ask-bar { display:flex; gap:10px; margin-top:16px; padding-top:16px; border-top:1px solid #edf1ee; }

.module-row { display:grid; grid-template-columns:1.1fr 1.1fr .8fr; gap:16px; margin-top:18px; }
.module { display:flex; min-width:0; flex-direction:column; padding:16px 18px; border:1px solid #e2e9e4; border-radius:12px; background:#fff; }
.module-head { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:12px; }
.module-head h2 { margin:0; color:#1b2c22; font-size:15px; font-weight:600; }
.module-link { padding:0; border:0; color:#4c7560; font-size:12px; white-space:nowrap; background:transparent; cursor:pointer; }
.module-link:hover { color:#078545; }
.module-empty { margin:0; color:#8a968f; font-size:13px; }
.todo-list,.match-list { display:flex; flex-direction:column; gap:2px; margin:0; padding:0; list-style:none; }
.todo-list li,.match-list li { display:flex; align-items:center; gap:8px; min-height:34px; border-bottom:1px solid #f1f4f2; }
.todo-list li:last-child,.match-list li:last-child { border-bottom:0; }
.todo-dot { width:6px; height:6px; flex:0 0 6px; border-radius:50%; background:#9aa79f; }
.todo-dot.green { background:#078545; }
.todo-dot.orange { background:#ff7900; }
.todo-dot.blue { background:#287fd1; }
.todo-text { flex:1; overflow:hidden; color:#28382e; font-size:13px; text-overflow:ellipsis; white-space:nowrap; }
.match-list time { flex:0 0 40px; color:#178647; font-size:12px; }
.match-text { flex:1; overflow:hidden; color:#34443a; font-size:13px; text-overflow:ellipsis; white-space:nowrap; }
.match-text b { color:#89958d; font-size:10px; }
.match-state { padding:2px 5px; border-radius:3px; color:#738078; font-size:11px; white-space:nowrap; background:#f0f3f1; }
.match-ongoing,.match-in_progress,.match-live { color:#078547; background:#e4f8eb; }
.next-match { margin:10px 0 0; color:#7d8a82; font-size:12px; }
.overview-row { display:flex; align-items:baseline; justify-content:space-between; gap:10px; }
.overview-row div { display:flex; flex-direction:column; gap:2px; }
.overview-row strong { color:#132119; font-size:24px; line-height:1.1; }
.overview-row span { color:#718078; font-size:12px; }
.overview-note { margin:12px 0 0; color:#7d8a82; font-size:12px; }

.stage-panel { margin-top:18px; border:1px solid #e2e9e4; border-radius:12px; background:#fff; }
.stage-toggle { display:flex; align-items:center; justify-content:space-between; width:100%; padding:14px 18px; border:0; color:#4a5c51; font-size:13px; background:transparent; cursor:pointer; }
.stage-toggle:hover { color:#078545; }
.stage-body { padding:0 18px 18px; }
.stage-row { display:flex; align-items:flex-start; justify-content:space-between; gap:6px; }
.stage-item { display:flex; flex:1; flex-direction:column; align-items:center; gap:6px; padding:0; border:0; color:#1f2d25; text-align:center; background:transparent; cursor:pointer; }
.stage-item>span { display:grid; width:44px; height:44px; place-items:center; border-radius:50%; color:#74827a; font-size:22px; background:#f0f3f1; }
.stage-item.done>span,.stage-item.active>span { color:#078445; background:#e9f7ed; }
.stage-item.active>span { box-shadow:0 0 0 4px #f4fbf6; }
.stage-item strong { font-size:13px; white-space:nowrap; }
.stage-item small { color:#718077; font-size:11px; white-space:nowrap; }
.stage-arrow { padding-top:13px; color:#98a39d; font-size:16px; }
.stage-line { height:4px; margin:16px 16px 4px; border-radius:3px; background:#e3e9e5; }
.stage-line span { display:block; height:100%; border-radius:inherit; background:#078445; }
.division-list { margin:12px 0 0; padding:0; list-style:none; }
.division-list li { display:flex; align-items:center; gap:9px; min-height:40px; border-top:1px solid #f1f4f2; }
.division-list strong { width:60px; color:#26362c; font-size:13px; }
.division-mode { padding:2px 5px; border:1px solid #d8e0dc; border-radius:3px; color:#68776e; font-size:11px; white-space:nowrap; }
.division-progress { display:flex; flex:1; align-items:center; gap:7px; min-width:0; }
.division-progress i { display:block; flex:1; height:4px; overflow:hidden; border-radius:4px; background:#e5ebe7; }
.division-progress b { display:block; height:100%; border-radius:inherit; background:#098946; }
.division-progress em { color:#65746b; font-size:11px; font-style:normal; white-space:nowrap; }
.division-note { color:#8a968f; font-size:12px; }

@media (max-width:1280px) {
  .head-meta { display:none; }
  .module-row { grid-template-columns:1fr 1fr; }
  .module.overview { grid-column:1 / -1; }
  .overview-row { justify-content:flex-start; gap:36px; }
}
@media (max-width:900px) {
  .module-row { grid-template-columns:1fr; }
  .module.overview { grid-column:auto; }
  .thread { max-height:320px; }
  .bubble { max-width:94%; }
  .stage-row { overflow-x:auto; justify-content:flex-start; }
  .stage-item { min-width:76px; }
}
@media (max-width:760px) {
  .head-text h1 { font-size:17px; }
  .head-chip,.head-state { display:none; }
  .head-actions .el-button span { display:none; }
}
</style>
