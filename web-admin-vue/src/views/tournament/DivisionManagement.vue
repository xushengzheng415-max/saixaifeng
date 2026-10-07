<template>
  <section v-loading="loading" class="division-management" aria-labelledby="division-page-title">
    <header class="tournament-context">
      <div class="context-left">
        <img v-if="tournamentLogo" class="tournament-logo" :src="tournamentLogo" :alt="`${tournament.name} Logo`" @error="handleTournamentLogoError" />
        <span v-else class="tournament-logo logo-placeholder"><el-icon><Trophy /></el-icon></span>
        <h1>{{ tournament.name || '赛事竞赛管理' }}</h1>
        <span class="status-chip" :class="`status-${tournament.status || 'draft'}`">{{ tournamentStatus }}</span>
        <span class="header-meta"><el-icon><Calendar /></el-icon>{{ dateRange }}</span>
        <span class="header-meta"><el-icon><Location /></el-icon>{{ tournament.region || tournament.location || '地区待定' }}</span>
      </div>
      <el-button plain :icon="Back" @click="router.push('/tournament-space')">返回赛事空间</el-button>
    </header>

    <div class="page-heading">
      <div>
        <h2 id="division-page-title">竞赛管理</h2>

      </div>
      <el-button type="primary" :icon="Plus" :disabled="!canManage" @click="openDivisionEditor()">添加组别</el-button>
    </div>

    <div class="summary-grid" aria-label="竞赛组别概览">
      <article v-for="item in summaryMetrics" :key="item.label" class="summary-card" :class="item.tone">
        <div><p>{{ item.label }}</p><strong>{{ item.value }}</strong></div>
      </article>
    </div>

    <section class="division-table-wrap" aria-label="竞赛组别列表">
      <el-empty v-if="!loading && divisionRows.length === 0" description="当前赛事还没有竞赛组别">
        <el-button type="primary" :disabled="!canManage" @click="openDivisionEditor()">添加第一个组别</el-button>
      </el-empty>
      <table v-else class="division-table">
        <thead><tr><th>组别</th><th>参赛球队</th><th>赛制</th><th>规则</th><th>报名</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="division in divisionRows" :key="division.id">
            <td class="group-cell"><strong class="division-name">{{ division.name }}</strong></td>
            <td data-label="参赛球队"><span class="team-count"><b>{{ division.teamCount }}</b><span>/ {{ division.capacityText }} 支</span></span></td>
            <td data-label="赛制"><div class="format-cell"><span>{{ division.playerFormatText }}</span><span class="format-text">{{ division.formatText }}</span></div></td>
            <td data-label="规则"><div class="rule-cell"><span class="configuration-state" :class="division.stateClass">{{ division.stateText }}</span><span v-if="!division.finalized" class="progress-value">{{ division.progress }}%</span><el-tooltip v-if="division.finalized" :content="division.versionText" placement="top"><span class="rule-version" tabindex="0" :aria-label="'规则版本：' + division.versionText">版本信息</span></el-tooltip></div><el-progress v-if="!division.finalized" class="rule-progress" :percentage="division.progress" :show-text="false" :stroke-width="4" /></td>
            <td data-label="报名"><span class="registration-state" :class="{ open: division.registrationEnabled }"><i aria-hidden="true" />{{ division.registrationEnabled ? '报名中' : '未开启' }}</span></td>
            <td class="actions-cell" data-label="操作"><div class="operation-cell">
              <el-button link type="primary" :disabled="!canManage" @click="openDivisionEditor(division)">{{ division.primaryAction }}</el-button>
              <el-button v-if="division.finalized" link :disabled="!canManage" @click="startRuleRevision(division)">调整规则</el-button>
              <el-dropdown trigger="click" placement="bottom-end" popper-class="competition-row-menu" @command="command => handleRowCommand(command, division)">
                <el-button text circle :aria-label="division.name + '更多操作'"><el-icon><MoreFilled /></el-icon></el-button>
                <template #dropdown><el-dropdown-menu>
                  <el-dropdown-item command="settings" :disabled="!canManage">组别设置</el-dropdown-item>
                  <el-dropdown-item command="teams">参赛球队</el-dropdown-item>
                  <el-dropdown-item command="draw">抽签分组</el-dropdown-item>
                  <el-dropdown-item command="schedule">比赛地图</el-dropdown-item>
                  <el-dropdown-item command="registration" divided :disabled="!canManage || togglingRegistrationId === division.id">{{ division.registrationEnabled ? '关闭报名' : '开启报名' }}</el-dropdown-item>
                  <el-dropdown-item command="rename" :disabled="!canManage || renamingDivisionId === division.id">重命名组别</el-dropdown-item>
                  <el-dropdown-item v-if="division.pairingGenerated || division.teamCount > 0" command="reset" divided :disabled="!canManage" class="danger-action">清空赛程并重新抽签</el-dropdown-item>
                  <el-dropdown-item command="delete" :divided="!(division.pairingGenerated || division.teamCount > 0)" :disabled="!canManage || deletingDivisionId === division.id" class="danger-action">删除组别</el-dropdown-item>
                </el-dropdown-menu></template>
              </el-dropdown>
            </div></td>
          </tr>
        </tbody>
      </table>
    </section>

    <el-alert v-if="!canManage" class="permission-alert" type="warning" show-icon :closable="false" title="你只有查看该赛事的权限，不能创建或修改竞赛组别。" />
  </section>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Back, Calendar, Location, MoreFilled, Plus, Trophy } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { addRecord, callFunction, deleteDivision, getFileUrl, queryById, queryList, renameDivision, reviseDivisionRules, updateRecord } from '../../utils/cloud'
import { permissions } from '../../utils/permissions'
import { divisionParticipantType } from '../../utils/divisionBasics'

const route = useRoute()
const router = useRouter()
const id = String(route.params.id || '')
const loading = ref(false)
const tournament = ref({})
const resolvedTournamentLogo = ref('')
const tournamentLogoFailed = ref(false)
const divisionRecords = ref([])
const registrations = ref([])
const deletingDivisionId = ref('')
const renamingDivisionId = ref('')
const togglingRegistrationId = ref('')

const tournamentLogoSource = computed(() => String(
  tournament.value.logoTransparentFileId ||
  tournament.value.logoFileId ||
  tournament.value.logoCloudFileId ||
  tournament.value.logoTransparentUrl ||
  tournament.value.logoUrl ||
  tournament.value.logo ||
  ''
).trim())
const tournamentLogo = computed(() => {
  if (tournamentLogoFailed.value) return ''
  return resolvedTournamentLogo.value || (/^(https?:\/\/|\/)/i.test(tournamentLogoSource.value) ? tournamentLogoSource.value : '')
})
const tournamentStatus = computed(() => ({ draft: '筹备中', registering: '报名中', upcoming: '即将开始', ongoing: '进行中', completed: '已结束', finished: '已结束' })[tournament.value.status] || '筹备中')
const dateRange = computed(() => tournament.value.startDate && tournament.value.endDate ? `${formatDate(tournament.value.startDate)} — ${formatDate(tournament.value.endDate)}` : '日期待定')
const canManage = computed(() => permissions.tournament.manage(tournament.value))
const sourceDivisions = computed(() => divisionRecords.value.length ? divisionRecords.value : (Array.isArray(tournament.value.divisions) ? tournament.value.divisions : []))
const divisionRows = computed(() => sourceDivisions.value.map((division, index) => normalizeDivision(division, index)))
const finalizedCount = computed(() => divisionRows.value.filter(item => item.finalized).length)
const configuringCount = computed(() => divisionRows.value.filter(item => !item.finalized).length)
const teamCount = computed(() => registrations.value.filter(item => isConfirmedRegistration(item)).length)
const summaryMetrics = computed(() => [
  { label: '赛事组别', value: `${divisionRows.value.length} 个`, tone: 'green' },
  { label: '参赛球队', value: `${teamCount.value} 支`, tone: 'green' },
  { label: '已定版', value: `${finalizedCount.value} 个`, tone: 'green' },
  { label: '待完善', value: `${configuringCount.value} 个`, tone: 'orange' }
])

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
  const allowedTeams = [division.expectedTeams, division.requiredTeams, division.teamRequirement, division.participantTeams, division.maxTeams, division.teamLimit].map(Number).find(value => Number.isFinite(value) && value > 0) || 0
  const stateText = finalized ? '已定版' : (progress > 0 ? '配置中' : '未配置')
  const primaryAction = finalized ? '查看规则' : (progress > 0 ? '继续配置' : '开始配置')
  return {
    id: String(division._id || division.id || `division-${index}`),
    name: division.name || division.divisionName || division.label || '未命名组别',
    teamCount: teamRows.length,
    capacityText: allowedTeams > 0 ? String(allowedTeams) : '未设置',
    playerFormatText: playerFormatLabel(division.matchFormat,division.playersOnField),
    formatText: division.formatName || division.tournamentTypeName || formatLabel(division.formatType || division.tournamentType),
    modeText: divisionParticipantType(division,tournament.value)==='adult'?'成人模式':'青少年模式',
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
  const query = division.id ? { divisionId: division.id } : {}
  if(command==='settings')return router.push({path:`/tournaments/${id}/competition/create`,query})
  if (command === 'registration') return toggleDivisionRegistration(division)
  if (command === 'rename') return handleRenameDivision(division)
  if (command === 'reset') return resetDivisionPairings(division)
  if (command === 'delete') return handleDeleteDivision(division)
  if (command === 'teams') router.push({ path: `/tournaments/${id}/teams`, query })
  if (command === 'draw') router.push({ path: `/tournaments/${id}/draw`, query: division.modeClass === 'professional' ? { ...query, mode: 'professional', step: 'pool' } : query })
  if (command === 'schedule') router.push({ path: `/tournaments/${id}/matches`, query })
}
async function resetDivisionPairings(division) {
  if (!canManage.value || !division?.id) return
  try {
    await ElMessageBox.confirm(`将清空“${division.name}”当前未开赛的对阵结果，并回到抽签页面重新抽签。已排赛、已发布或已有赛果的组别不能清空。是否继续？`, '清空赛程并重新抽签', { type:'warning', confirmButtonText:'确认清空并重抽', cancelButtonText:'取消' })
  } catch { return }
  try {
    const result = await callFunction('generateSchedule', { action:'resetPairings', tournamentId:id, divisionId:division.id })
    if (!result?.success) throw new Error(result?.message || '清空对阵失败')
    ElMessage.success(result.message || '已清空，可以重新抽签')
    router.push({ path:`/tournaments/${id}/draw`, query:{ divisionId:division.id, reset:'1' } })
  } catch (error) { ElMessage.error(error.message || '清空对阵失败') }
}
async function handleRenameDivision(division) {
  if (!canManage.value || !division?.id || renamingDivisionId.value) return
  let confirmation
  try {
    confirmation = await ElMessageBox.prompt('只修改当前赛事中的组别显示名称，不改变年龄、性别或已定版竞赛规则。', '重命名组别', {
      confirmButtonText: '保存名称', cancelButtonText: '取消', inputValue: division.name,
      inputPattern: /^.{2,30}$/, inputErrorMessage: '请输入 2—30 个字符'
    })
  } catch { return }
  renamingDivisionId.value = division.id
  try {
    const result = await renameDivision(division.id, confirmation.value)
    if (!result?.success) throw new Error(result?.error || '组别重命名失败')
    ElMessage.success(result.message || '组别名称已更新')
    await loadDivisionManagement()
  } catch (error) {
    ElMessage.error(error.message || '组别重命名失败')
  } finally {
    renamingDivisionId.value = ''
  }
}
async function toggleDivisionRegistration(division) {
  if (!canManage.value || !division?.id) return
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


async function handleDeleteDivision(division) {
  if (!canManage.value || !division?.id) return
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
    await resolveTournamentLogo()
    divisionRecords.value = divisions || []
    registrations.value = teamRegistrations || []
    const created = await createSuggestedDivisionDrafts(tournament.value, divisionRecords.value)
    if (created > 0) {
      divisionRecords.value = await queryList('divisions', { where: { tournamentId: id }, orderBy: { createTime: 'asc' }, silent: true })
      ElMessage.success('已根据竞赛规程生成 ' + created + ' 个组别草稿')
    }
  } finally {
  loading.value = false
}

async function resolveTournamentLogo() {
  tournamentLogoFailed.value = false
  resolvedTournamentLogo.value = ''
  const source = tournamentLogoSource.value
  if (!source.startsWith('cloud://')) return
  const resolved = await getFileUrl(source)
  resolvedTournamentLogo.value = /^https?:\/\//i.test(String(resolved || '')) ? resolved : ''
}

function handleTournamentLogoError() {
  tournamentLogoFailed.value = true
  resolvedTournamentLogo.value = ''
}

function suggestionGender(value) {
  const text = String(value || '').toLowerCase()
  if (text.includes('女') || text === 'female') return '女子组'
  if (text.includes('男') || text === 'male') return '男子组'
  return '混合组'
}

function suggestionFormat(value) {
  const text = String(value || '').toLowerCase().replace(/人制$/, 'side')
  return ['5side', '7side', '8side', '9side', '11side'].includes(text) ? text : '7side'
}

async function createSuggestedDivisionDrafts(currentTournament, existingDivisions) {
  const suggestions = Array.isArray(currentTournament?.regulationDivisionSuggestions)
    ? currentTournament.regulationDivisionSuggestions
    : []
  if (!suggestions.length || !permissions.tournament.manage(currentTournament)) return 0
  const existingNames = new Set((existingDivisions || []).map(item => String(item.name || item.divisionName || '').trim().toLowerCase()))
  const maxPlayers = { '5side': 12, '7side': 16, '8side': 18, '9side': 20, '11side': 23 }
  let created = 0
  for (const source of suggestions) {
    const name = String(source?.name || '').trim()
    if (!name || existingNames.has(name.toLowerCase())) continue
    const matchFormat = suggestionFormat(source.matchFormat)
    try {
      await addRecord('divisions', {
        tournamentId: id,
        name,
        customName: name,
        nameSource: 'custom',
        ageGroup: String(source.ageGroup || name),
        gender: suggestionGender(source.gender),
        matchFormat,
        playersOnField: Number(matchFormat.replace('side', '')),
        maxPlayersPerTeam: maxPlayers[matchFormat],
        expectedTeams: Math.max(2, Number(source.expectedTeams || 8)),
        mode: 'simple',
        isProfessional: false,
        ruleStatus: 'draft',
        ruleProgress: 0,
        rulesVersion: '暂未定版',
        formatType: ['cup', 'tournament', 'league', 'hybrid'].includes(source.formatType) ? source.formatType : 'cup',
        groupCount: Number(source.groupCount || 0),
        teamsPerGroup: Number(source.teamsPerGroup || 0),
        groupCycle: source.groupCycle === 'double' ? 'double' : 'single',
        advancePerGroup: Number(source.advancePerGroup || 0),
        knockoutSize: Number(source.knockoutSize || 0),
        periodMode: source.periodMode === 'quarters' ? 'quarters' : 'halves',
        matchMinutes: Number(source.matchMinutes || 0),
        breakMinutes: Number(source.breakMinutes || 0),
        substitutionLimit: Number(source.substitutionLimit || 0),
        substitutionReentryAllowed: source.substitutionReentryAllowed === true,
        yellowCardSuspension: Number(source.yellowCardSuspension || 0),
        redCardSuspension: Number(source.redCardSuspension || 0),
        winPoints: Number(source.winPoints ?? 3),
        drawPoints: Number(source.drawPoints ?? 1),
        lossPoints: Number(source.lossPoints ?? 0),
        regulationSourceFileId: currentTournament.regulationsFileId || '',
        regulationRecognition: true,
        createTime: new Date(),
        updateTime: new Date()
      })
      existingNames.add(name.toLowerCase())
      created += 1
    } catch (error) {
      console.warn('[competition] 规程组别建议生成失败:', name, error.message)
    }
  }
  if (created > 0) {
    await updateRecord('tournaments', id, {
      regulationRecognitionStatus: 'suggestions_applied',
      regulationSuggestionsAppliedAt: new Date()
    })
  }
  return created
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
onUnmounted(() => { window.removeEventListener('sxf-visual-qa-ready', applyVisualQaSnapshot) })
</script>

<style scoped>
.division-management{width:100%;max-width:var(--admin-content-max-width);margin:0 auto;padding-bottom:24px;color:#203229}
.tournament-context{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:74px;margin:0 calc(var(--admin-content-gutter-x)*-1);padding:12px var(--admin-content-gutter-x);border-bottom:1px solid #e1e8e3;background:#fff;box-sizing:border-box}
.context-left{display:flex;min-width:0;align-items:center;gap:12px}.tournament-logo{width:36px;height:36px;flex:0 0 36px;object-fit:contain}.logo-placeholder{display:grid;place-items:center;color:#087542;font-size:26px}.context-left h1{overflow:hidden;margin:0;color:#17241d;font-size:20px;font-weight:650;text-overflow:ellipsis;white-space:nowrap}.status-chip{padding:3px 7px;border:1px solid #bde6ca;border-radius:4px;color:#21844d;background:#f2fbf5;font-size:14px;white-space:nowrap}.status-draft,.status-completed,.status-finished{border-color:#dce4df;color:#66756c;background:#f7f9f7}.header-meta{display:inline-flex;align-items:center;gap:5px;color:#65756b;font-size:14px;white-space:nowrap}
.page-heading{display:flex;align-items:center;justify-content:space-between;margin:24px 0 16px}.page-heading h2{margin:0;color:#17241d;font-size:26px}.page-heading :deep(.el-button){height:36px;padding:0 16px}
.summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));padding:18px 0;border:1px solid #e1e8e3;border-radius:6px;background:#fff}.summary-card{padding:0 24px;border-right:1px solid #e8eee9}.summary-card:last-child{border:0}.summary-card div{display:flex;align-items:baseline;justify-content:space-between;gap:10px}.summary-card p{margin:0;color:#67786d;font-size:15px}.summary-card strong{color:#17392a;font-size:26px;line-height:1.2;font-weight:650;white-space:nowrap}.summary-card.orange strong{color:#a66812}
.division-table-wrap{margin-top:20px;border:1px solid #e1e8e3;border-radius:6px;background:#fff}.division-table{width:100%;border-collapse:collapse;table-layout:fixed}.division-table th{padding:13px 18px;color:#728178;text-align:left;font-size:14px;font-weight:500;background:#f8faf8}.division-table th:first-child{border-radius:6px 0 0 0;width:17%}.division-table th:nth-child(2){width:13%}.division-table th:nth-child(3){width:14%}.division-table th:nth-child(4){width:18%}.division-table th:nth-child(5){width:12%}.division-table th:last-child{border-radius:0 6px 0 0;width:26%}.division-table td{padding:22px 18px;border-top:1px solid #edf1ee;font-size:16px;vertical-align:middle}.division-table tbody tr:hover{background:#fbfcfb}.division-name{display:block;color:#203a2b;font-size:20px;font-weight:650;overflow-wrap:anywhere}.team-count{display:flex;align-items:baseline;gap:6px;white-space:nowrap}.team-count b{font-size:20px;font-weight:600}.team-count>span{font-size:15px;color:#728178}.format-cell{display:grid;gap:6px}.format-text{color:#728178;font-size:14px}.rule-cell{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.configuration-state{padding:3px 7px;border-radius:4px;color:#247449;background:#edf6ef;font-size:14px;white-space:nowrap}.configuration-state.configuring{background:#fff5e4;color:#a66b15}.configuration-state.unconfigured{background:#f1f3f2;color:#738078}.rule-version{color:#7a8880;font-size:14px;white-space:nowrap;cursor:help;text-decoration:underline dotted;text-underline-offset:3px}.rule-version:focus-visible{outline:2px solid #72b994;outline-offset:3px}.progress-value{font-size:14px;color:#728178}.rule-progress{max-width:100px;margin-top:8px}.registration-state{display:inline-flex;align-items:center;gap:6px;color:#7b8780;font-size:15px;white-space:nowrap}.registration-state i{width:5px;height:5px;border-radius:50%;background:#a4aea7}.registration-state.open{color:#23744b}.registration-state.open i{background:#269359}
.operation-cell{display:flex;align-items:center;gap:12px;white-space:nowrap}.operation-cell :deep(.el-button){margin:0;font-size:15px}.operation-cell :deep(.el-button.is-link){height:auto;padding:0}.operation-cell :deep(.el-button--text){width:28px;height:28px}.division-management :deep(.el-button--primary:not(.is-link)){border-color:#087d47;background:#087d47}.division-management :deep(.el-button--primary.is-link){color:#087d47}.permission-alert{margin-top:16px}:global(.competition-row-menu .danger-action){color:#c34d44!important}
@media(max-width:1200px){.header-meta{display:none}.context-left h1{font-size:20px}.summary-card{padding:0 16px}.summary-card div{display:grid;gap:6px}.division-table th,.division-table td{padding-left:12px;padding-right:12px}.operation-cell{gap:9px}}
@media(max-width:760px){.tournament-context{min-height:62px;gap:8px;margin:0;padding:12px 0;width:100%}.context-left{gap:8px}.context-left h1{font-size:15px}.tournament-logo{width:28px;height:28px;flex-basis:28px}.status-chip{display:none}.tournament-context>:deep(.el-button){padding:0 8px;font-size:14px}.page-heading{margin-top:18px}.page-heading h2{font-size:21px}.summary-grid{grid-template-columns:repeat(2,minmax(0,1fr));row-gap:16px}.summary-card:nth-child(2){border:0}.summary-card div{display:flex}.summary-card strong{font-size:20px}.division-table,.division-table tbody{display:block;width:100%}.division-table thead{display:none}.division-table tr{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);padding:14px 16px;gap:14px 18px;border-top:1px solid #edf1ee}.division-table tr:first-child{border-top:0}.division-table td{padding:0;border:0;min-width:0}.division-table td[data-label]::before{content:attr(data-label);display:block;margin-bottom:7px;font-size:12px;color:#7b8780}.division-table .group-cell,.division-table .actions-cell{grid-column:1/-1}.division-table .actions-cell{padding-top:12px;border-top:1px solid #edf1ee}.division-table .actions-cell::before{display:none}.operation-cell{gap:18px}.division-name{font-size:18px}.format-cell{display:flex;align-items:center;gap:10px}}
</style>
