<template>
  <section v-loading="loading" class="tournament-console" aria-labelledby="console-title">
    <header class="context-header">
      <div class="context-main">
        <img v-if="tournamentLogo" class="context-logo" :src="tournamentLogo" :alt="`${tournament.name} Logo`" />
        <span v-else class="context-logo placeholder"><el-icon><Trophy /></el-icon></span>
        <h1 id="console-title">{{ tournament.name || '赛事主控制台' }}</h1>
        <span class="context-chip">{{ divisions.length }} 个组别</span>
        <span class="context-state" :class="`state-${tournament.status || 'draft'}`">{{ tournamentStatus }}</span>
        <span class="context-meta"><el-icon><Calendar /></el-icon>{{ dateRange }}</span>
        <span class="context-meta"><el-icon><Location /></el-icon>{{ tournament.region || tournament.location || '地区待定' }}</span>
      </div>
      <el-button plain type="primary" :icon="Back" @click="router.push('/tournament-space')">返回赛事空间</el-button>
    </header>

    <div class="console-title"><div><h2>赛事主控制台</h2><p>查看各组别准备进度、当前待办与近期比赛。</p></div><el-button :icon="Refresh" plain :loading="loading" @click="loadConsole">刷新</el-button></div>

    <section class="metric-grid" aria-label="赛事概览">
      <article v-for="item in metrics" :key="item.label" class="metric-card" :class="item.tone"><span class="metric-icon"><el-icon><component :is="item.icon" /></el-icon></span><div><p>{{ item.label }}</p><strong>{{ item.value }}</strong><small>{{ item.note }}</small></div></article>
    </section>

    <el-alert class="console-tip" type="success" :closable="false" show-icon title="基础版组别按球队、比分和赛果运行；专业版组别增加球员档案、参赛名单和个人数据。" />
    <section v-if="!qaSnapshot && divisions.length" class="plan-confirm-panel" aria-label="最终竞赛方案确认"><div><strong>确认竞赛方案并进入比赛管理</strong><p>球队、抽签和赛程全部完成后执行；确认后当前组别版本永久锁定。</p></div><el-tag v-if="lockedDivisionCount" type="success" effect="plain">已锁定 {{ lockedDivisionCount }} 个组别</el-tag></section>

    <div class="middle-grid">
      <section class="panel stage-panel"><h2>赛事阶段总览</h2><div class="stage-row"><template v-for="(stage, index) in stages" :key="stage.label"><button type="button" class="stage-item" :class="{ done: stage.done, active: stage.active }" @click="go(stage.target)"><span><el-icon><component :is="stage.icon" /></el-icon></span><strong>{{ stage.label }}</strong><small>{{ stage.note }}</small></button><i v-if="index < stages.length - 1" class="stage-arrow" aria-hidden="true"><el-icon><ArrowRight /></el-icon></i></template></div><div class="stage-line"><span :style="{ width: `${stageCompletion}%` }"></span></div></section>
      <section class="panel todo-panel"><h2>当前待办</h2><el-empty v-if="todos.length === 0" :image-size="54" description="当前没有需要处理的事项" /><ul v-else><li v-for="todo in todos" :key="todo.key"><span class="todo-icon" :class="todo.tone"><el-icon><component :is="todo.icon" /></el-icon></span><p>{{ todo.text }}</p><el-button size="small" plain type="primary" @click="go(todo.target)">去处理</el-button></li></ul></section>
    </div>

    <div class="bottom-grid">
      <section class="panel division-panel"><h2>组别进度</h2><el-empty v-if="divisions.length === 0" :image-size="64" description="尚未创建竞赛组别"><el-button type="primary" size="small" @click="go(`/tournaments/${id}/edit?section=divisions`)">添加组别</el-button></el-empty><ul v-else><li v-for="division in divisions" :key="division.id || division._id || division.name"><span class="division-symbol"><el-icon><Grid /></el-icon></span><strong>{{ division.name || '未命名组别' }}</strong><span class="division-mode">{{ divisionMode(division) }}</span><span class="division-progress"><i><b :style="{ width: `${divisionProgress(division)}%` }"></b></i><em>{{ divisionProgressLabel(division) }}</em></span><el-button v-if="!competitionPlanLocked(division)" size="small" type="primary" plain :loading="confirmingDivisionId === divisionId(division)" @click="confirmPlan(division)">确认方案</el-button><el-tag v-else size="small" type="success" effect="plain">已锁定</el-tag></li></ul></section>
      <section class="panel matches-panel"><h2>近期比赛</h2><el-empty v-if="recentMatches.length === 0" :image-size="64" description="尚未编排比赛"><el-button type="primary" size="small" @click="go(`/tournaments/${id}/matches`)">打开比赛地图</el-button></el-empty><ul v-else><li v-for="match in recentMatches" :key="match._id"><time><strong>{{ matchDate(match) }}</strong><span>{{ matchTime(match) }}</span></time><p>{{ teamName(match, 'home') }}<b>VS</b>{{ teamName(match, 'away') }}</p><span class="match-state" :class="`match-${match.status || 'pending'}`">{{ matchStatus(match.status) }}</span></li></ul><button v-if="recentMatches.length" type="button" class="all-link" @click="go(`/tournaments/${id}/matches`)">进入比赛管理 <el-icon><ArrowRight /></el-icon></button></section>
      <section class="panel shortcuts-panel"><h2>快捷入口</h2><div class="shortcut-grid"><button v-for="item in shortcuts" :key="item.label" type="button" @click="go(item.target)"><span><el-icon><component :is="item.icon" /></el-icon></span><strong>{{ item.label }}</strong><small>{{ item.note }}</small></button></div></section>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, Back, Calendar, CircleCheck, DocumentChecked, Football, Grid, List, Location, Promotion, Refresh, Tickets, Timer, Trophy, UserFilled, WarningFilled } from '@element-plus/icons-vue'
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

const divisions = computed(() => divisionRecords.value.length
  ? divisionRecords.value
  : (Array.isArray(tournament.value.divisions) ? tournament.value.divisions : []))
const lockedDivisionCount = computed(() => divisions.value.filter(competitionPlanLocked).length)
const approvedTeams = computed(() => registrations.value.filter(item => item.status === 'approved'))
const pendingTeams = computed(() => registrations.value.filter(item => ['pending', 'invited', 'claim_pending'].includes(item.status)))
const activeMatches = computed(() => matches.value.filter(item => ['ongoing', 'in_progress', 'live'].includes(item.status)))
const reviewMatches = computed(() => matches.value.filter(item => ['submitted', 'pending_review', 'review_pending'].includes(item.status)))
const recentMatches = computed(() => [...matches.value].sort((a, b) => new Date(a.matchDate || a.date || a.startTime || 0) - new Date(b.matchDate || b.date || b.startTime || 0)).slice(0, 4))
const tournamentLogo = computed(() => {
  const source = String(tournament.value.logoTransparentUrl || tournament.value.logoUrl || tournament.value.logo || '')
  return resolvedTournamentLogo.value || (/^(https?:\/\/|\/)/i.test(source) ? source : '')
})
const dateRange = computed(() => tournament.value.startDate && tournament.value.endDate ? `${formatDate(tournament.value.startDate)} — ${formatDate(tournament.value.endDate)}` : '日期待定')
const tournamentStatus = computed(() => ({ draft: '筹备中', registering: '报名中', upcoming: '即将开始', ongoing: '进行中', completed: '已结束', finished: '已结束' })[tournament.value.status] || '筹备中')
const metrics = computed(() => [
  { label: '竞赛组别', value: `${divisions.value.length} 个`, note: divisions.value.length ? `已创建 ${divisions.value.length} 个组别` : '待创建组别', icon: Grid, tone: 'green' },
  { label: '参赛球队', value: `${approvedTeams.value.length} 支`, note: pendingTeams.value.length ? `待确认 ${pendingTeams.value.length} 支` : '参赛关系已确认', icon: UserFilled, tone: 'green' },
  { label: '已排比赛', value: `${matches.value.length} 场`, note: activeMatches.value.length ? `进行中 ${activeMatches.value.length} 场` : '待发布或执行', icon: Calendar, tone: 'orange' },
  { label: '当前待处理', value: `${todos.value.length} 项`, note: todos.value.length ? '需主办方处理' : '暂无待办', icon: WarningFilled, tone: 'orange' }
])
const stages = computed(() => [
  { label: '组别规则', note: divisions.value.length ? `${divisions.value.length} 个已创建` : '待创建', icon: DocumentChecked, done: divisions.value.length > 0, active: divisions.value.length === 0, target: `/tournaments/${id}/edit?section=divisions` },
  { label: '球队入驻', note: `${approvedTeams.value.length}/${registrations.value.length || 0} 已确认`, icon: UserFilled, done: registrations.value.length > 0 && pendingTeams.value.length === 0, active: pendingTeams.value.length > 0, target: `/tournaments/${id}/teams` },
  { label: '抽签分组', note: tournament.value.drawCompleted ? '已完成' : '待配置', icon: Tickets, done: tournament.value.drawCompleted === true, active: divisions.value.length > 0 && !tournament.value.drawCompleted, target: `/tournaments/${id}/draw` },
  { label: '赛程发布', note: matches.value.length ? `${matches.value.length} 场已编排` : '待编排', icon: Calendar, done: matches.value.length > 0 && tournament.value.schedulePublished === true, active: matches.value.length > 0 && !tournament.value.schedulePublished, target: `/tournaments/${id}/matches` },
  { label: '比赛执行', note: activeMatches.value.length ? `${activeMatches.value.length} 场进行中` : '待开赛', icon: Promotion, done: matches.value.some(item => ['completed', 'finished'].includes(item.status)), active: activeMatches.value.length > 0, target: `/tournaments/${id}/matches` },
  { label: '赛果归档', note: reviewMatches.value.length ? `${reviewMatches.value.length} 场待复核` : '待赛后复核', icon: CircleCheck, done: matches.value.length > 0 && reviewMatches.value.length === 0 && matches.value.every(item => ['completed', 'finished', 'archived'].includes(item.status)), active: reviewMatches.value.length > 0, target: `/tournaments/${id}/matches` }
])
const stageCompletion = computed(() => Math.round((stages.value.filter(item => item.done).length / stages.value.length) * 100))
const todos = computed(() => {
  const list = []
  if (!divisions.value.length) list.push({ key: 'division', text: '尚未创建竞赛组别', icon: Grid, tone: 'orange', target: `/tournaments/${id}/edit?section=divisions` })
  if (pendingTeams.value.length) list.push({ key: 'teams', text: `${pendingTeams.value.length} 支球队待确认或认领`, icon: UserFilled, tone: 'green', target: `/tournaments/${id}/teams` })
  if (divisions.value.length && !matches.value.length) list.push({ key: 'schedule', text: '尚未编排比赛赛程', icon: Calendar, tone: 'blue', target: `/tournaments/${id}/matches` })
  if (reviewMatches.value.length) list.push({ key: 'review', text: `${reviewMatches.value.length} 场赛果待复核归档`, icon: DocumentChecked, tone: 'orange', target: `/tournaments/${id}/matches` })
  return list
})
const shortcuts = computed(() => [
  { label: '组别管理', note: '配置规则与版本', icon: Grid, target: `/tournaments/${id}/competition` },
  { label: '球队入驻', note: '邀请申请与认领', icon: UserFilled, target: `/tournaments/${id}/teams` },
  { label: '参赛名单', note: '审核名单与异常', icon: DocumentChecked, target: `/tournaments/${id}/signups` },
  { label: '抽签分组', note: '分组与抽签管理', icon: Tickets, target: `/tournaments/${id}/draw` },
  { label: '比赛管理', note: '排赛、监控与复核', icon: Football, target: `/tournaments/${id}/matches` }
])

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
.plan-confirm-panel { display:flex; align-items:center; justify-content:space-between; gap:18px; margin:15px 0; padding:14px 18px; border:1px solid #c8e4d0; border-radius:9px; background:#f7fcf8; }.plan-confirm-panel strong { color:#1d4c31; font-size:15px; }.plan-confirm-panel p { margin:4px 0 0; color:#68786e; font-size:12px; }
.tournament-console { width:100%; max-width:var(--admin-content-max-width); margin:0 auto; padding-bottom:28px; }.context-header { display:flex; align-items:center; justify-content:space-between; min-height:74px; margin:0 calc(var(--admin-content-gutter-x) * -1); padding:0 var(--admin-content-gutter-x); border-bottom:1px solid #e2e9e4; background:#fff; }.context-main { display:flex; min-width:0; align-items:center; gap:13px; }.context-logo { width:46px; height:46px; flex:0 0 46px; object-fit:contain; }.context-logo.placeholder { display:grid; place-items:center; color:#087542; font-size:23px; background:transparent; }.context-main h1 { overflow:hidden; margin:0 8px 0 0; color:#17241d; font-size:24px; font-weight:650; text-overflow:ellipsis; white-space:nowrap; }.context-chip,.context-state { padding:4px 8px; border:1px solid #bcddff; border-radius:4px; color:#1375da; font-size:13px; white-space:nowrap; }.context-state { border-color:#bce5c9; color:#21844d; background:#f2fbf5; }.state-draft { border-color:#dce4df; color:#66756c; background:#f7f9f7; }.state-completed,.state-finished { border-color:#dce4df; color:#66756c; }.context-meta { display:inline-flex; align-items:center; gap:6px; margin-left:10px; color:#5e6c64; font-size:13px; white-space:nowrap; }.console-title { display:flex; align-items:end; justify-content:space-between; margin:20px 0 14px; }.console-title h2 { margin:0; color:#17241d; font-size:24px; }.console-title p { margin:5px 0 0; color:#7d8a82; font-size:13px; }.metric-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:22px; }.metric-card { display:flex; min-height:120px; align-items:center; gap:20px; padding:19px 25px; border:1px solid #e1e8e3; border-radius:9px; background:#fff; box-shadow:0 2px 9px rgba(21,52,35,.035); }.metric-icon { display:grid; width:60px; height:60px; place-items:center; border-radius:50%; font-size:31px; }.metric-card.green .metric-icon { color:#008642; background:#edf8f0; }.metric-card.orange .metric-icon { color:#ff7900; background:#fff3e7; }.metric-card p,.metric-card small { display:block; margin:0; color:#596860; font-size:14px; }.metric-card strong { display:block; margin:3px 0; color:#132119; font-size:30px; line-height:1.1; }.metric-card small { color:#718078; font-size:12px; }.console-tip { margin:15px 0; border:1px solid #c8e4d0; }.middle-grid { display:grid; grid-template-columns:1.45fr .85fr; gap:16px; }.bottom-grid { display:grid; grid-template-columns:.92fr .98fr 1.2fr; gap:16px; margin-top:16px; }.panel { min-width:0; padding:18px 19px; border:1px solid #e2e9e4; border-radius:9px; background:#fff; box-shadow:0 2px 9px rgba(21,52,35,.035); }.panel h2 { margin:0 0 16px; color:#1b2c22; font-size:17px; }.stage-row { display:flex; align-items:flex-start; justify-content:space-between; gap:6px; }.stage-item { display:flex; flex:1; flex-direction:column; align-items:center; gap:8px; padding:0; border:0; color:#1f2d25; text-align:center; background:transparent; cursor:pointer; }.stage-item>span { display:grid; width:54px; height:54px; place-items:center; border-radius:50%; color:#74827a; font-size:28px; background:#f0f3f1; }.stage-item.done>span,.stage-item.active>span { color:#078445; background:#e9f7ed; }.stage-item.active>span { box-shadow:0 0 0 5px #f4fbf6; }.stage-item strong { font-size:14px; white-space:nowrap; }.stage-item small { color:#718077; font-size:12px; white-space:nowrap; }.stage-arrow { padding-top:16px; color:#98a39d; font-size:19px; }.stage-line { height:4px; margin:19px 22px 7px; border-radius:3px; background:#e3e9e5; }.stage-line span { display:block; height:100%; border-radius:inherit; background:#078445; }.todo-panel ul,.division-panel ul,.matches-panel ul { margin:0; padding:0; list-style:none; }.todo-panel li { display:flex; align-items:center; gap:10px; min-height:39px; padding:6px 0; border-bottom:1px solid #edf1ee; }.todo-panel li:last-child { border-bottom:0; }.todo-icon { display:grid; width:25px; height:25px; place-items:center; border-radius:50%; font-size:15px; }.todo-icon.green { color:#058041; background:#e6f6eb; }.todo-icon.orange { color:#ef7600; background:#fff1df; }.todo-icon.blue { color:#287fd1; background:#e9f5ff; }.todo-panel p { flex:1; margin:0; color:#28382e; font-size:13px; }.division-panel li { display:flex; align-items:center; gap:9px; min-height:42px; border-bottom:1px solid #edf1ee; }.division-panel li:last-child { border-bottom:0; }.division-symbol { display:grid; width:28px; height:28px; place-items:center; border-radius:50%; color:#078344; background:#eaf7ed; }.division-panel strong { width:48px; color:#26362c; font-size:14px; }.division-mode { padding:3px 5px; border:1px solid #d8e0dc; border-radius:3px; color:#68776e; font-size:11px; white-space:nowrap; }.division-progress { display:flex; flex:1; align-items:center; gap:7px; min-width:0; }.division-progress i { display:block; flex:1; height:4px; overflow:hidden; border-radius:4px; background:#e5ebe7; }.division-progress b { display:block; height:100%; border-radius:inherit; background:#098946; }.division-progress em { color:#65746b; font-size:11px; font-style:normal; white-space:nowrap; }.matches-panel li { display:flex; align-items:center; gap:9px; min-height:43px; border-bottom:1px solid #edf1ee; }.matches-panel time { width:45px; color:#178647; font-size:12px; }.matches-panel time strong,.matches-panel time span { display:block; }.matches-panel time span { color:#748179; }.matches-panel li p { flex:1; overflow:hidden; display:flex; gap:7px; margin:0; color:#34443a; font-size:12px; text-overflow:ellipsis; white-space:nowrap; }.matches-panel li p b { color:#89958d; font-size:10px; }.match-state { padding:3px 5px; border-radius:3px; color:#738078; font-size:11px; background:#f0f3f1; white-space:nowrap; }.match-ongoing,.match-in_progress,.match-live { color:#078547; background:#e4f8eb; }.all-link { display:flex; align-items:center; justify-content:center; gap:5px; width:100%; margin-top:11px; padding:0; border:0; color:#497156; background:transparent; cursor:pointer; }.shortcut-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }.shortcut-grid button { display:grid; grid-template-columns:42px 1fr; align-items:center; gap:1px 9px; min-height:83px; padding:12px; border:1px solid #e4ebe6; border-radius:7px; color:#26362c; text-align:left; background:#fff; cursor:pointer; }.shortcut-grid button:hover { border-color:#a8d8b8; background:#f8fcf9; }.shortcut-grid button span { grid-row:1 / 3; display:grid; width:40px; height:40px; place-items:center; border-radius:50%; color:#078345; font-size:22px; background:#e9f7ed; }.shortcut-grid button strong { font-size:14px; }.shortcut-grid button small { overflow:hidden; color:#748179; font-size:11px; text-overflow:ellipsis; white-space:nowrap; }
.tournament-console{box-sizing:border-box;padding:0 var(--admin-content-gutter-x) 28px}.context-header{margin-inline:calc(var(--admin-content-gutter-x) * -1)}
@media (max-width:1400px) { .context-meta { display:none; }.metric-grid { gap:14px; }.bottom-grid { grid-template-columns:1fr 1fr; }.shortcuts-panel { grid-column:1 / -1; } }
@media (max-width:1120px) { .metric-grid { grid-template-columns:repeat(2,1fr); }.middle-grid,.bottom-grid { grid-template-columns:1fr; }.shortcuts-panel { grid-column:auto; } }
@media (max-width:760px) { .context-main h1 { font-size:18px; }.context-chip,.context-state { display:none; }.stage-row { overflow-x:auto; justify-content:flex-start; }.stage-item { min-width:84px; }.shortcut-grid { grid-template-columns:1fr 1fr; } }
</style>
