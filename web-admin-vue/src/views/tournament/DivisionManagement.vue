<template>
  <section v-loading="loading" class="division-management" aria-labelledby="division-page-title">
    <header class="tournament-context">
      <div class="context-left">
        <img v-if="tournamentLogo" class="tournament-logo" :src="tournamentLogo" :alt="`${tournament.name} Logo`" />
        <span v-else class="tournament-logo logo-placeholder"><el-icon><Trophy /></el-icon></span>
        <h1>{{ tournament.name || '赛事竞赛管理' }}</h1>
        <span class="header-chip">{{ divisionRows.length }} 个组别</span>
        <span class="status-chip" :class="`status-${tournament.status || 'draft'}`">{{ tournamentStatus }}</span>
        <span class="header-meta"><el-icon><Calendar /></el-icon>{{ dateRange }}</span>
        <span class="header-meta"><el-icon><Location /></el-icon>{{ tournament.region || tournament.location || '地区待定' }}</span>
      </div>
      <el-button plain :icon="Back" @click="router.push('/tournament-space')">退出赛事空间</el-button>
    </header>

    <div class="page-heading">
      <div>
        <h2 id="division-page-title">竞赛管理</h2>
        <p>先选择组别，再配置该组别的赛制与竞赛规则。</p>
      </div>
      <el-button type="primary" :icon="Plus" :disabled="!canManage" @click="openDivisionEditor()">添加组别</el-button>
    </div>

    <div class="summary-grid" aria-label="竞赛组别概览">
      <article v-for="item in summaryMetrics" :key="item.label" class="summary-card" :class="item.tone">
        <span class="metric-icon"><el-icon><component :is="item.icon" /></el-icon></span>
        <div><p>{{ item.label }}</p><strong>{{ item.value }}</strong></div>
      </article>
    </div>

    <section class="division-table-wrap" aria-label="竞赛组别列表">
      <el-empty v-if="!loading && divisionRows.length === 0" description="当前赛事还没有竞赛组别">
        <el-button type="primary" :disabled="!canManage" @click="openDivisionEditor()">添加第一个组别</el-button>
      </el-empty>
      <table v-else class="division-table">
        <thead><tr><th>组别</th><th>参赛与赛制</th><th>运行模式</th><th>规则进度与版本</th><th>配置状态</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="division in divisionRows" :key="division.id">
            <td><div class="division-name"><span class="division-avatar"><el-icon><UserFilled /></el-icon></span><strong>{{ division.name }}</strong></div></td>
            <td><span class="team-count"><el-icon><User /></el-icon>{{ division.teamCount }} 支球队</span><span class="player-format-text">{{ division.playerFormatText }}</span><span class="format-text">{{ division.formatText }}</span></td>
            <td><span class="mode-tag" :class="division.modeClass">{{ division.modeText }}</span></td>
            <td><div class="rule-progress"><span>规则进度</span><el-progress :percentage="division.progress" :show-text="false" :stroke-width="7" /><b>{{ division.progress }}%</b></div><div class="rule-version">规则版本　{{ division.versionText }}</div></td>
            <td><span class="configuration-state" :class="division.stateClass">{{ division.stateText }}</span><span class="registration-state" :class="{ open: division.registrationEnabled }">{{ division.registrationEnabled ? '报名中' : '报名未开启' }}</span></td>
            <td>
              <div class="operation-cell">
                <el-button size="small" :type="division.primaryActionType" :disabled="!canManage" @click="openDivisionEditor(division)">{{ division.primaryAction }}</el-button>
                <el-button v-if="division.finalized" size="small" plain :disabled="!canManage" @click="startRuleRevision(division)">调整规则</el-button>
                <div class="row-menu"><el-button text circle aria-label="组别更多操作" @click.stop="toggleRowMenu(division.id)"><el-icon><MoreFilled /></el-icon></el-button><div v-if="activeMenuId === division.id" class="row-menu-panel"><button type="button" :disabled="togglingRegistrationId === division.id" @click="toggleDivisionRegistration(division)">{{ togglingRegistrationId === division.id ? '正在处理…' : (division.registrationEnabled ? '关闭报名' : '开启报名') }}</button><button type="button" @click="openDivisionEditor(division)">编辑组别信息</button><button type="button" :disabled="division.finalized" @click="openModeGuide(division)">升级为专业模式</button><button type="button" @click="openModeGuide(division)">查看模式对比</button><button type="button" @click="handleRowCommand('teams', division)">查看参赛球队</button><button type="button" @click="handleRowCommand('draw', division)">进入抽签分组</button><button type="button" @click="handleRowCommand('schedule', division)">进入赛程管理</button><button class="danger-action" type="button" :disabled="deletingDivisionId === division.id" @click="handleDeleteDivision(division)">{{ deletingDivisionId === division.id ? '正在删除…' : '删除组别' }}</button></div></div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="configuration-flow" aria-label="组别规则配置流程">
      <div v-for="(step, index) in flowSteps" :key="step.title" class="flow-step"><span class="flow-icon"><el-icon><component :is="step.icon" /></el-icon></span><div><strong>{{ step.title }}</strong><small>{{ step.description }}</small></div><el-icon v-if="index < flowSteps.length - 1" class="flow-arrow"><ArrowRight /></el-icon></div>
    </section>

    <el-alert v-if="!canManage" class="permission-alert" type="warning" show-icon :closable="false" title="你只有查看该赛事的权限，不能创建或修改竞赛组别。" />
  </section>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, Back, Calendar, CircleCheck, DocumentChecked, Grid, Location, MoreFilled, Plus, Tickets, Trophy, User, UserFilled } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { callFunction, deleteDivision, queryById, queryList, reviseDivisionRules } from '../../utils/cloud'
import { permissions } from '../../utils/permissions'

const route = useRoute()
const router = useRouter()
const id = String(route.params.id || '')
const loading = ref(false)
const tournament = ref({})
const divisionRecords = ref([])
const registrations = ref([])
const deletingDivisionId = ref('')
const togglingRegistrationId = ref('')
const activeMenuId = ref(import.meta.env.DEV && route.query.view === 'card-menu' ? 'qa-division-u10' : '')

const tournamentLogo = computed(() => tournament.value.logoTransparentUrl || tournament.value.logoUrl || tournament.value.logo || '')
const tournamentStatus = computed(() => ({ draft: '筹备中', registering: '报名中', upcoming: '即将开始', ongoing: '进行中', completed: '已结束', finished: '已结束' })[tournament.value.status] || '筹备中')
const dateRange = computed(() => tournament.value.startDate && tournament.value.endDate ? `${formatDate(tournament.value.startDate)} — ${formatDate(tournament.value.endDate)}` : '日期待定')
const canManage = computed(() => permissions.tournament.manage(tournament.value))
const sourceDivisions = computed(() => divisionRecords.value.length ? divisionRecords.value : (Array.isArray(tournament.value.divisions) ? tournament.value.divisions : []))
const divisionRows = computed(() => sourceDivisions.value.map((division, index) => normalizeDivision(division, index)))
const finalizedCount = computed(() => divisionRows.value.filter(item => item.finalized).length)
const configuringCount = computed(() => divisionRows.value.filter(item => !item.finalized).length)
const teamCount = computed(() => registrations.value.filter(item => isConfirmedRegistration(item)).length)
const summaryMetrics = computed(() => [
  { label: '赛事组别', value: `${divisionRows.value.length} 个`, icon: UserFilled, tone: 'green' },
  { label: '参赛球队', value: `${teamCount.value} 支`, icon: User, tone: 'green' },
  { label: '已完成定版', value: `${finalizedCount.value} 个`, icon: CircleCheck, tone: 'green' },
  { label: '待完善规则', value: `${configuringCount.value} 个`, icon: DocumentChecked, tone: 'orange' }
])
const flowSteps = [
  { title: '选择组别', description: '创建或选择年龄组别', icon: UserFilled },
  { title: '选择运行模式', description: '简易模式或专业模式', icon: Grid },
  { title: '赛制设置', description: '选择赛制与比赛形式', icon: Trophy },
  { title: '规则配置', description: '配置规则与赛事参数', icon: DocumentChecked },
  { title: '规则定版', description: '完成审核与规则发布', icon: CircleCheck }
]

function isConfirmedRegistration(row) {
  return ['approved', 'confirmed', 'active', 'accepted', 'registered'].includes(String(row.status || '').toLowerCase())
}

function registrationMatchesDivision(registration, division) {
  const divisionId = String(division._id || division.id || '')
  const registrationDivisionId = String(registration.divisionId || registration.categoryId || registration.groupId || '')
  if (divisionId && registrationDivisionId) return divisionId === registrationDivisionId
  const divisionName = String(division.name || division.divisionName || division.label || '')
  const registrationName = String(registration.divisionName || registration.category || registration.division || '')
  return Boolean(divisionName && registrationName && divisionName === registrationName)
}

function normalizeDivision(division, index) {
  const status = String(division.ruleStatus || division.status || '').toLowerCase()
  const explicitProgress = Number(division.ruleProgress ?? division.progress ?? division.completionRate)
  const finalized = division.rulesLocked === true || division.ruleFinalized === true || ['completed', 'finalized', 'locked', 'published'].includes(status)
  const modeProfessional = division.mode === 'professional' || division.isProfessional === true || division.plan === 'professional'
  const progress = Number.isFinite(explicitProgress) ? Math.min(100, Math.max(0, Math.round(explicitProgress))) : (finalized ? 100 : 0)
  const teamRows = registrations.value.filter(item => registrationMatchesDivision(item, division) && isConfirmedRegistration(item))
  const stateText = finalized ? '已定版' : (progress > 0 ? '配置中' : '未配置')
  const primaryAction = finalized ? (modeProfessional ? '查看专业规则' : '查看规则') : (progress > 0 ? '继续配置' : '开始配置')
  return {
    id: String(division._id || division.id || `division-${index}`),
    name: division.name || division.divisionName || division.label || '未命名组别',
    teamCount: teamRows.length,
    playerFormatText: playerFormatLabel(division.matchFormat,division.playersOnField),
    formatText: division.formatName || division.tournamentTypeName || formatLabel(division.formatType || division.tournamentType),
    modeText: modeProfessional ? '专业模式' : '简易模式 · 免费',
    modeClass: modeProfessional ? 'professional' : 'simple',
    progress,
    versionText: division.rulesVersion || division.ruleVersion || (finalized ? '已定版' : '暂未定版'),
    finalized,
    registrationEnabled: division.registrationEnabled === true,
    stateText,
    stateClass: finalized ? 'finalized' : (progress > 0 ? 'configuring' : 'unconfigured'),
    primaryAction,
    primaryActionType: finalized ? 'primary' : (progress > 0 ? 'warning' : 'success')
  }
}

function formatLabel(value) {
  return ({ cup:'杯赛制',tournament:'赛会制',league:'联赛制',hybrid:'混合制',knockout:'淘汰赛制' })[String(value || '').toLowerCase()] || '赛制待设置'
}

function playerFormatLabel(matchFormat,playersOnField) {
  const matched=String(matchFormat || '').match(/(5|7|8|9|11)/)
  const players=Number(matched?.[1] || playersOnField || 0)
  return players ? `${players}人制` : '人数制式待设置'
}

function openDivisionEditor(division) {
  if (!canManage.value) return
  if (!division) {
    router.push(`/tournaments/${id}/competition/create`)
    return
  }
  router.push({ path: `/tournaments/${id}/competition/rules`, query: { divisionId: division.id, step: division.finalized ? 'effective' : 'format' } })
}

async function startRuleRevision(division) {
  if (!canManage.value || !division?.id) return
  try {
    const result = await reviseDivisionRules(division.id)
    if (!result?.success) throw new Error(result?.error || '创建规则草稿失败')
    ElMessage.success(result.message || '已创建新的规则草稿')
    router.push({ path: `/tournaments/${id}/competition/rules`, query: { divisionId: division.id, step: 'finalize' } })
  } catch (error) {
    ElMessage.error(error.message || '创建规则草稿失败')
  }
}

function handleRowCommand(command, division) {
  activeMenuId.value = ''
  const query = division.id ? { divisionId: division.id } : {}
  if (command === 'teams') router.push({ path: `/tournaments/${id}/teams`, query })
  if (command === 'draw') router.push({ path: `/tournaments/${id}/draw`, query: division.modeClass === 'professional' ? { ...query, mode: 'professional', step: 'pool' } : query })
  if (command === 'schedule') router.push({ path: `/tournaments/${id}/schedule`, query })
}
function toggleRowMenu(divisionId) { activeMenuId.value = activeMenuId.value === divisionId ? '' : divisionId }
function closeRowMenu() { activeMenuId.value = '' }
async function toggleDivisionRegistration(division) {
  if (!canManage.value || !division?.id) return
  activeMenuId.value = ''
  const enabled = !division.registrationEnabled
  try {
    await ElMessageBox.confirm(
      enabled ? `开启“${division.name}”报名后，才能生成该组别的报名海报，球队也可扫码提交报名。是否继续？` : `关闭“${division.name}”报名后，已有报名保留，但不能再提交新报名。是否继续？`,
      enabled ? '开启组别报名' : '关闭组别报名',
      { type:'warning', confirmButtonText:enabled ? '开启报名' : '关闭报名', cancelButtonText:'取消' }
    )
  } catch { return }
  togglingRegistrationId.value = division.id
  try {
    const result = await callFunction('tournamentRegistrationFlow', { action:'setDivisionRegistration', tournamentId:id, divisionId:division.id, enabled })
    if (!result?.success) throw new Error(result?.message || '报名状态更新失败')
    ElMessage.success(result.message || '报名状态已更新')
    await loadDivisionManagement()
  } catch (error) {
    ElMessage.error(error.message || '报名状态更新失败')
  } finally {
    togglingRegistrationId.value = ''
  }
}
function openModeGuide(division) {
  activeMenuId.value = ''
  router.push({ path: `/tournaments/${id}/competition/create`, query: { view: 'mode-compare', divisionId: division.id } })
}

async function handleDeleteDivision(division) {
  if (!canManage.value || !division?.id) return
  activeMenuId.value = ''
  try {
    await ElMessageBox.confirm(
      `确定删除组别“${division.name}”吗？仅未定版且没有参赛球队、抽签或赛程数据的空白组别可以删除。删除后不能恢复。`,
      '删除竞赛组别',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消', confirmButtonClass: 'el-button--danger' }
    )
  } catch {
    return
  }
  deletingDivisionId.value = division.id
  try {
    const result = await deleteDivision(division.id)
    if (!result?.success) throw new Error(result?.error || '删除组别失败')
    ElMessage.success(result.message || '组别已删除')
    await loadDivisionManagement()
  } catch (error) {
    ElMessage.error(error.message || '删除组别失败')
  } finally {
    deletingDivisionId.value = ''
  }
}

async function loadDivisionManagement() {
  loading.value = true
  try {
    const [currentTournament, divisions, teamRegistrations] = await Promise.all([
      queryById('tournaments', id),
      queryList('divisions', { where: { tournamentId: id }, orderBy: { createTime: 'asc' }, silent: true }),
      queryList('tournament_teams', { where: { tournamentId: id }, orderBy: { createTime: 'asc' } })
    ])
    tournament.value = Array.isArray(currentTournament) ? currentTournament[0] || {} : currentTournament || {}
    divisionRecords.value = divisions || []
    registrations.value = teamRegistrations || []
  } finally {
    loading.value = false
  }
}

function formatDate(value) { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? '日期待定' : `${parsed.getFullYear()}.${String(parsed.getMonth() + 1).padStart(2, '0')}.${String(parsed.getDate()).padStart(2, '0')}` }
function applyVisualQaSnapshot() {
  const snapshot = window.__sxfVisualQaSnapshot
  if (snapshot) {
    tournament.value = snapshot.tournament
    divisionRecords.value = snapshot.divisions
    registrations.value = snapshot.tournamentTeams
  }
}

if (import.meta.env.DEV && (window.location.href.includes('visualQa=1') || localStorage.getItem('sxfVisualQa') === '1')) {
  applyVisualQaSnapshot()
  window.addEventListener('sxf-visual-qa-ready', applyVisualQaSnapshot)
} else {
  onMounted(loadDivisionManagement)
}
onMounted(() => document.addEventListener('click', closeRowMenu))
onUnmounted(() => { window.removeEventListener('sxf-visual-qa-ready', applyVisualQaSnapshot); document.removeEventListener('click', closeRowMenu) })
</script>

<style scoped>
.division-management { width:100%; max-width:var(--admin-content-max-width); margin:0 auto; padding-bottom:30px; }
.tournament-context { display:flex; align-items:center; justify-content:space-between; min-height:74px; margin:0 calc(var(--admin-content-gutter-x) * -1); padding:0 var(--admin-content-gutter-x); border-bottom:1px solid #e1e8e3; background:#fff; }
.context-left { display:flex; min-width:0; align-items:center; gap:12px; }.tournament-logo { width:45px; height:45px; flex:0 0 45px; object-fit:contain; }.logo-placeholder { display:grid; place-items:center; border-radius:50%; color:#087542; background:#eaf6ed; font-size:22px; }.context-left h1 { overflow:hidden; margin:0 5px 0 0; color:#17241d; font-size:23px; font-weight:650; text-overflow:ellipsis; white-space:nowrap; }.header-chip,.status-chip { padding:4px 8px; border:1px solid #bce0ff; border-radius:4px; color:#1375da; font-size:13px; white-space:nowrap; }.status-chip { border-color:#bde6ca; color:#21844d; background:#f2fbf5; }.status-draft { border-color:#dce4df; color:#66756c; background:#f7f9f7; }.status-completed,.status-finished { border-color:#dce4df; color:#66756c; }.header-meta { display:inline-flex; align-items:center; gap:5px; margin-left:6px; color:#5e6c64; font-size:13px; white-space:nowrap; }
.page-heading { display:flex; align-items:flex-end; justify-content:space-between; margin:18px 0 14px; }.page-heading h2 { margin:0; color:#17241d; font-size:25px; }.page-heading p { margin:5px 0 0; color:#728077; font-size:14px; }.page-heading :deep(.el-button) { min-width:172px; min-height:48px; font-size:16px; }
.summary-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:20px; }.summary-card { display:flex; min-height:96px; align-items:center; gap:19px; padding:17px 24px; border:1px solid #e0e8e2; border-radius:8px; background:#fff; box-shadow:0 2px 9px rgba(21,52,35,.03); }.metric-icon { display:grid; width:54px; height:54px; place-items:center; border-radius:50%; color:#008642; background:#edf8f0; font-size:29px; }.summary-card.orange .metric-icon { color:#ff7900; background:#fff3e7; }.summary-card p { margin:0; color:#637168; font-size:14px; }.summary-card strong { display:block; margin-top:3px; color:#142119; font-size:29px; line-height:1.1; }
.division-table-wrap { margin-top:31px; overflow:visible; border:1px solid #e1e8e3; border-radius:8px; background:#fff; }.division-table { width:100%; min-width:1120px; border-collapse:collapse; table-layout:auto; }.division-table th { height:44px; padding:0 18px; color:#65726a; text-align:left; font-size:13px; font-weight:500; background:#fafcfb; }.division-table th:nth-child(1) { width:16%; }.division-table th:nth-child(2) { width:17%; }.division-table th:nth-child(3) { width:15%; }.division-table th:nth-child(4) { width:21%; }.division-table th:nth-child(5) { width:11%; }.division-table th:nth-child(6) { width:20%; }.division-table td { min-height:86px; padding:14px 18px; border-top:1px solid #edf1ee; color:#2b3a30; font-size:14px; vertical-align:middle; }.division-name { display:flex; align-items:center; gap:12px; color:#054b29; font-size:25px; }.division-avatar { display:grid; width:40px; height:40px; place-items:center; border-radius:50%; color:#087c41; background:#e9f7ed; font-size:25px; }.team-count,.format-text { display:inline-flex; align-items:center; gap:6px; margin-right:18px; color:#3f4e45; white-space:nowrap; }.format-text { color:#66756b; }.mode-tag { display:inline-block; padding:6px 14px; border:1px solid #cce6d6; border-radius:5px; color:#197a48; font-size:13px; white-space:nowrap; }.mode-tag.professional { border-color:#ffcb7a; color:#ed7800; background:#fffaf0; }.rule-progress { display:flex; align-items:center; gap:10px; }.rule-progress>span { color:#6a776f; font-size:12px; white-space:nowrap; }.rule-progress :deep(.el-progress) { flex:1; }.rule-progress b { color:#1b2b21; font-size:13px; }.rule-version { margin-top:8px; color:#68756d; font-size:12px; }.configuration-state,.registration-state { display:inline-block; padding:5px 12px; border:1px solid #d2e6d9; border-radius:4px; color:#1d824a; font-size:13px; white-space:nowrap; }.configuration-state.configuring { border-color:#ffd18b; color:#e77b08; }.configuration-state.unconfigured { border-color:#ffc9c9; color:#ed3c3c; }.registration-state { display:block; width:max-content; margin-top:6px; border-color:#e1e6e2; color:#7a857e; background:#f7f9f7; }.registration-state.open { border-color:#b9e1c7; color:#087c41; background:#eef9f1; }.operation-cell { display:flex; min-width:240px; align-items:center; gap:6px; flex-wrap:wrap; white-space:normal; }
.row-menu{position:relative}.row-menu-panel{position:absolute;z-index:30;top:34px;right:0;width:188px;padding:7px 0;border:1px solid #d8dfda;border-radius:10px;background:#fff;box-shadow:0 10px 28px rgba(24,48,34,.18)}.row-menu-panel button{display:block;width:100%;padding:10px 17px;border:0;color:#27362d;text-align:left;background:#fff;font:inherit;cursor:pointer}.row-menu-panel button:hover{color:#075c33;background:#f1f8f3}.row-menu-panel button:disabled{color:#a4ada7;cursor:not-allowed;background:#fff}.row-menu-panel .danger-action{margin-top:6px;padding-top:12px;border-top:1px solid #edf0ee;color:#d73a3a}.row-menu-panel .danger-action:hover{color:#b42323;background:#fff4f4}
.configuration-flow { display:flex; align-items:center; gap:11px; margin-top:35px; padding:14px 26px; border:1px solid #dce8df; border-radius:8px; background:#fff; }.flow-step { display:flex; flex:1; align-items:center; gap:11px; min-width:0; }.flow-icon { display:grid; width:48px; height:48px; place-items:center; flex:0 0 48px; border:1px solid #dce8df; border-radius:50%; color:#078345; background:#f5fbf7; font-size:24px; }.flow-step strong,.flow-step small { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.flow-step strong { color:#26352b; font-size:14px; }.flow-step small { margin-top:4px; color:#7b8880; font-size:11px; }.flow-arrow { flex:0 0 auto; color:#416596; font-size:19px; }.permission-alert { margin-top:16px; }
.division-management :deep(.el-button--primary){border-color:#087d47;background:#087d47}.division-management :deep(.el-button--primary:hover){border-color:#056a3a;background:#056a3a}
@media (max-width:1400px) { .header-meta { display:none; }.summary-grid { gap:13px; }.division-table th,.division-table td { padding:0 12px; }.format-text { display:none; }.configuration-flow { gap:7px; padding:12px; } }
@media (max-width:1050px) { .summary-grid { grid-template-columns:repeat(2,1fr); }.division-table-wrap { overflow-x:auto; }.division-table { min-width:1020px; }.configuration-flow { overflow-x:auto; }.flow-step { min-width:156px; } }
.player-format-text{display:inline-flex;align-items:center;margin-right:12px;padding:3px 8px;border:1px solid #b9dfc6;border-radius:4px;color:#087c41;background:#f1faf3;font-weight:600;white-space:nowrap}
@media (max-width:680px) { .context-left h1 { font-size:18px; }.header-chip,.status-chip { display:none; }.tournament-context>.el-button { font-size:12px; }.summary-grid { grid-template-columns:1fr; }.page-heading { align-items:flex-start; }.page-heading p { max-width:240px; }.configuration-flow { margin-top:20px; } }
</style>
