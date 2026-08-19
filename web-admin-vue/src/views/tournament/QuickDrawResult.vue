<template>
  <section class="quick-result" v-loading="loading">
    <header class="event-header">
      <div class="event-main"><span class="event-mark">赛</span><div><h2>{{ tournament.name || '2026 赛小蜂青少年足球邀请赛' }}</h2><p>{{ eventMeta }}</p></div><el-tag>{{ divisionName }}</el-tag><el-tag type="success">进行中</el-tag></div>
      <el-button plain @click="exitSpace"><el-icon><SwitchButton /></el-icon>退出赛事空间</el-button>
    </header>

    <div class="page-heading">
      <div><h1>抽签与分组</h1><p>查看并确认快速分组结果</p></div>
      <label><span>当前组别</span><el-select v-model="divisionId" :placeholder="divisionName" @change="load"><el-option v-for="item in displayDivisions" :key="item.id" :label="item.name" :value="item.id" /></el-select></label>
    </div>

    <nav class="steps"><button @click="backConfig">分组设置</button><button @click="backConsole">分组操作台</button><button class="active">分组结果</button></nav>

    <section v-if="hasSavedResult" class="summary">
      <span>参赛球队 <b>{{ teamCount }}</b></span><i /><span>已分组 <b>{{ assignedCount }}</b></span><i /><span>{{ resultUnitCount }} {{ unitLabel }}</span><i /><span>{{ sizeLabel }}</span><i /><em><el-icon><CircleCheckFilled /></el-icon>分组校验通过</em><strong>{{ statusLabel }}</strong><el-button plain @click="backConsole"><el-icon><Back /></el-icon>返回分组操作台</el-button>
    </section>

    <section v-if="hasSavedResult" class="toolbar">
      <el-select v-model="groupFilter"><el-option label="全部小组" value="all" /><el-option v-for="group in groups" :key="group.name" :label="group.name" :value="group.name" /></el-select>
      <el-input v-model="keyword" placeholder="搜索球队名称"><template #prefix><el-icon><Search /></el-icon></template></el-input>
      <el-button-group><el-button :type="viewMode === 'card' ? 'success' : ''" @click="viewMode = 'card'"><el-icon><Grid /></el-icon>卡片视图</el-button><el-button :type="viewMode === 'list' ? 'success' : ''" @click="viewMode = 'list'"><el-icon><List /></el-icon>列表视图</el-button></el-button-group>
      <el-button plain @click="exportResult"><el-icon><DocumentAdd /></el-icon>导出分组表</el-button>
    </section>

    <main v-if="hasSavedResult && format === 'tournament'" :class="['group-grid', viewMode]">
      <article v-for="group in visibleGroups" :key="group.name"><header><h3>{{ group.name }}</h3><b>{{ group.teams.length }}/{{ group.maxTeams }}</b></header><ol><li v-for="(team,index) in group.teams" :key="team.id"><b>{{ group.code }}{{ index + 1 }}</b><span class="crest">{{ team.name.slice(0,1) }}</span><strong>{{ team.name }}</strong><el-icon><Rank /></el-icon></li></ol></article>
    </main>

    <main v-else-if="hasSavedResult" class="format-result">
      <section class="result-card"><header><div><h3>{{ formatTitle }}</h3><p>{{ formatDescription }}</p></div><el-tag type="success" effect="light">{{ statusLabel }}</el-tag></header><ol><li v-for="(team,index) in filteredRankedTeams" :key="team.id"><b>{{ index + 1 }}</b><span class="crest">{{ team.name.slice(0,1) }}</span><strong>{{ team.name }}</strong><em v-if="format === 'hybrid' && index < advanceCount">晋级种子 {{ index + 1 }}</em></li></ol></section>
      <section class="result-card stage-preview"><header><div><h3>{{ format === 'league' ? '赛程草稿摘要' : '淘汰赛阶段摘要' }}</h3><p>只读展示当前组别已保存快照</p></div></header><div class="stage-metrics"><span><b>{{ resultUnitCount }}</b><small>{{ unitLabel }}</small></span><span><b>{{ assignedCount }}</b><small>已保存球队</small></span><span><b>{{ format === 'hybrid' ? advanceCount : format === 'cup' ? bracketCapacity : leagueRoundCount }}</b><small>{{ format === 'league' ? '轮单循环' : '签位容量' }}</small></span></div><p class="boundary-note">当前结果仍未发布赛程。确认只锁定本组抽签快照，随后进入赛程编排。</p></section>
    </main>

    <section v-else class="empty-result"><el-icon><WarningFilled /></el-icon><h3>当前组别还没有已保存的分组结果</h3><p>未保存的操作台状态不能显示为正式结果。请返回操作台完成并保存当前赛制草稿。</p><el-button type="success" @click="backConsole">返回分组操作台</el-button></section>

    <footer v-if="hasSavedResult" class="action-bar">
      <div class="checks"><span><el-icon><CircleCheckFilled /></el-icon>分组校验通过</span><span><el-icon><CircleCheckFilled /></el-icon>球队无重复</span><span><el-icon><CircleCheckFilled /></el-icon>{{ sizeLabel }}</span><span><el-icon><CircleCheckFilled /></el-icon>签位编号正确</span><i /><em>{{ isArchived ? '归档结果只读' : isConfirmed ? '当前结果已确认' : '当前结果尚未确认' }}</em></div>
      <div class="footer-actions"><el-button :disabled="isArchived" @click="backConsole"><el-icon><Refresh /></el-icon>继续调整</el-button><el-button type="success" :disabled="isArchived || isConfirmed" :loading="confirming" @click="confirm"><el-icon><Check /></el-icon>确认分组结果</el-button><small>确认后进入赛程编排，仍不会发布赛程。</small></div>
    </footer>
  </section>
</template>

<script setup>
import { computed, getCurrentInstance, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Back, Check, CircleCheckFilled, DocumentAdd, Grid, List, Rank, Refresh, Search, SwitchButton, WarningFilled } from '@element-plus/icons-vue'
import { queryById, queryList, updateRecord } from '../../utils/cloud'
import { getVisualQaSnapshot } from '../../utils/visualQaFixtures'

const props = defineProps({ tournamentId: { type: String, required: true } })
const route = useRoute()
const router = useRouter()
const instance = getCurrentInstance()
const tournamentId = props.tournamentId
const visualQa = typeof window !== 'undefined' && window.location.hostname === '127.0.0.1' && window.location.href.includes('visualQa=1')
const qaSnapshot = visualQa ? (window.__sxfVisualQaSnapshot || getVisualQaSnapshot()) : null
const format = computed(() => ['tournament', 'league', 'cup', 'hybrid'].includes(String(route.query.format || '')) ? String(route.query.format) : 'tournament')
const divisionId = ref(String(route.query.divisionId || 'default'))
const loading = ref(false)
const confirming = ref(false)
const tournament = ref({})
const divisions = ref([])
const records = ref([])
const teams = ref([])
const groups = ref([])
const keyword = ref('')
const groupFilter = ref('all')
const viewMode = ref('card')
const resultStatus = ref('draft')
const advanceCount = ref(8)
const bracketCapacity = ref(0)
const leagueRoundCount = ref(0)

const inferredDivisionName = computed(() => `${divisionId.value.match(/u\d+/i)?.[0]?.toUpperCase() || '当前'}组`)
const displayDivisions = computed(() => divisions.value.length ? divisions.value : [{ id: divisionId.value, name: inferredDivisionName.value }])
const divisionName = computed(() => displayDivisions.value.find(item => String(item.id) === divisionId.value)?.name || inferredDivisionName.value)
const eventMeta = computed(() => `${tournament.value.startDate || '2026-08-18'} 至 ${tournament.value.endDate || '2026-08-24'} · ${tournament.value.location || '郑州足球公园'}`)
const hasSavedResult = computed(() => records.value.length > 0)
const isArchived = computed(() => resultStatus.value === 'archived')
const isConfirmed = computed(() => ['confirmed', 'published'].includes(resultStatus.value))
const statusLabel = computed(() => isArchived.value ? '已归档' : isConfirmed.value ? '已确认' : '待确认')
const teamCount = computed(() => teams.value.length)
const assignedCount = computed(() => format.value === 'tournament' ? groups.value.reduce((sum, group) => sum + group.teams.length, 0) : teams.value.length)
const resultUnitCount = computed(() => format.value === 'tournament' ? groups.value.length : format.value === 'league' ? leagueRoundCount.value : Math.max(1, Number(bracketCapacity.value || advanceCount.value) - 1))
const unitLabel = computed(() => format.value === 'tournament' ? '个小组' : format.value === 'league' ? '轮赛程' : '场淘汰赛')
const sizeLabel = computed(() => format.value === 'tournament' ? `每组 ${groups.value[0]?.maxTeams || 0} 支` : format.value === 'hybrid' ? `晋级 ${advanceCount.value} 支` : format.value === 'cup' ? `${bracketCapacity.value} 个签位` : '单循环赛制')
const formatTitle = computed(() => ({ league: '联赛制排序结果', cup: '淘汰赛签位结果', hybrid: '混合制联赛阶段排序' })[format.value] || '分组结果')
const formatDescription = computed(() => ({ league: '按当前队伍顺序生成单循环赛程草稿', cup: '当前组别第一轮淘汰赛签位快照', hybrid: `联赛阶段前 ${advanceCount.value} 名进入淘汰赛` })[format.value] || '')
const visibleGroups = computed(() => groups.value.filter(group => groupFilter.value === 'all' || group.name === groupFilter.value).map(group => ({ ...group, teams: group.teams.filter(team => !keyword.value || team.name.includes(keyword.value)) })))
const filteredRankedTeams = computed(() => teams.value.filter(team => !keyword.value || team.name.includes(keyword.value)))

function qaTeamNames(count, suffix) {
  const cities = ['郑州青训','洛阳龙门','开封少年','南阳竞技','安阳星火','许昌未来','新乡联队','焦作山阳','周口先锋','商丘雄鹰','信阳绿茵','驻马店精英','郑州未来','洛阳少年','开封雄狮','南阳先锋','焦作未来','周口绿茵','平顶山少年','漯河飞翼','濮阳竞技','三门峡之星','安阳竞技','许昌青训','新乡星火','焦作先锋','周口少年','商丘未来','信阳雄鹰','驻马店竞技','平顶山竞速','漯河青训']
  return cities.slice(0, count).map((name, index) => ({ id: `qa-result-${index + 1}`, name: `${name}${suffix}` }))
}
function seedQaResult() {
  const suffix = divisionId.value.includes('u14') ? 'U14' : divisionId.value.includes('u10') ? 'U10' : 'U12'
  tournament.value = { ...(qaSnapshot?.tournament || {}), name: '2026 赛小蜂青少年足球邀请赛', startDate: '2026-08-18', endDate: '2026-08-24', location: '郑州足球公园' }
  divisions.value = [{ id: divisionId.value, name: `${suffix}组` }]
  const scenario = String(route.query.scenario || '')
  resultStatus.value = scenario === 'archived' ? 'archived' : 'draft'
  if (scenario === 'empty') {
    records.value = []
    teams.value = []
    groups.value = []
    return
  }
  if (format.value === 'tournament') {
    teams.value = qaTeamNames(32, '')
    groups.value = Array.from({ length: 8 }, (_, index) => ({ id: `qa-group-${index}`, name: `${String.fromCharCode(65 + index)}组`, code: String.fromCharCode(65 + index), maxTeams: 4, teams: teams.value.slice(index * 4, index * 4 + 4) }))
    records.value = groups.value.map(group => ({ _id: group.id, status: resultStatus.value }))
  } else {
    teams.value = qaTeamNames(format.value === 'cup' ? 8 : 12, suffix)
    advanceCount.value = 8
    bracketCapacity.value = format.value === 'cup' ? 16 : 8
    leagueRoundCount.value = format.value === 'league' ? 11 : 0
    records.value = [{ _id: `qa-${format.value}-result`, status: resultStatus.value }]
  }
}

async function load() {
  loading.value = true
  records.value = []
  teams.value = []
  groups.value = []
  try {
    if (visualQa) { seedQaResult(); return }
    const event = await queryById('tournaments', tournamentId)
    tournament.value = Array.isArray(event) ? event[0] || {} : event || {}
    divisions.value = (tournament.value.divisions || []).map(item => ({ id: String(item.id || item._id), name: item.name || item.divisionName || '未命名组别' }))
    if (format.value === 'tournament') {
      const saved = await queryList('tournament_groups', { where: { tournamentId }, limit: 1000 })
      const scoped = saved.filter(row => String(row.divisionId || 'default') === divisionId.value && row.type === 'tournament')
      const active = scoped.filter(row => row.status !== 'archived')
      records.value = active.length ? active : scoped.filter(row => row.status === 'archived')
      groups.value = records.value.map((row, index) => ({ id: row._id, name: row.groupName || `${String.fromCharCode(65 + index)}组`, code: row.groupCode || String.fromCharCode(65 + index), maxTeams: Number(row.maxTeams || row.teams?.length || 0), teams: (row.teams || []).map((team, teamIndex) => ({ id: String(team.teamId || `${row._id}-${teamIndex}`), name: String(team.teamName || '未命名球队') })) }))
      teams.value = groups.value.flatMap(group => group.teams)
    } else {
      const collection = format.value === 'cup' ? 'tournament_bracket' : 'tournament_league_tables'
      const saved = await queryList(collection, { where: { tournamentId }, limit: 1000 })
      const scoped = saved.filter(row => String(row.divisionId || 'default') === divisionId.value && row.type === format.value)
      const active = scoped.filter(row => row.status !== 'archived')
      records.value = active.length ? active : scoped.filter(row => row.status === 'archived')
      const primary = records.value[0]
      teams.value = (primary?.teams || []).map((team, index) => ({ id: String(team.teamId || index), name: String(team.teamName || '未命名球队') }))
      if (format.value === 'cup' && primary) teams.value = (primary.slots || []).filter(slot => slot.teamId).map(slot => ({ id: String(slot.teamId), name: String(slot.teamName || '未命名球队') }))
      advanceCount.value = Number(primary?.advanceCount || 8)
      bracketCapacity.value = Number(primary?.capacity || primary?.advanceCount || 0)
      leagueRoundCount.value = teams.value.length > 1 ? teams.value.length - 1 : 0
    }
    const statuses = records.value.map(row => row.status)
    resultStatus.value = statuses.length && statuses.every(status => status === 'archived') ? 'archived' : statuses.includes('published') ? 'published' : statuses.length && statuses.every(status => status === 'confirmed') ? 'confirmed' : 'draft'
  } catch (error) {
    ElMessage.error(error.message || '加载分组结果失败')
  } finally {
    loading.value = false
    instance?.update?.()
  }
}

function navigationQuery(view) { return { divisionId: divisionId.value, mode: 'quick', view, format: format.value, ...(visualQa ? { visualQa: '1' } : {}) } }
function backConfig() { router.push({ path: route.path, query: navigationQuery('config') }) }
function backConsole() { router.push({ path: route.path, query: navigationQuery('console') }) }
function exitSpace() { router.push('/tournament-space') }
function exportResult() {
  const rows = format.value === 'tournament' ? groups.value.flatMap(group => group.teams.map((team, index) => [group.name, `${group.code}${index + 1}`, team.name])) : teams.value.map((team, index) => [formatTitle.value, index + 1, team.name])
  if (visualQa) { window.__sxfQuickResultExport = { tournamentId, divisionId: divisionId.value, format: format.value, rows: rows.length, cloudWrite: false }; ElMessage.success('导出内容已校验'); return }
  const csv = [['阶段/小组', '签位/排名', '球队'], ...rows].map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n')
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })); link.download = `${divisionName.value}-${formatTitle.value}.csv`; link.click(); URL.revokeObjectURL(link.href)
}
async function confirm() {
  if (!hasSavedResult.value || isArchived.value || isConfirmed.value) return
  try {
    const scope = { phase: 'confirmation-opened', tournamentId, divisionId: divisionId.value, format: format.value, recordIds: records.value.map(row => row._id), targetStatus: 'confirmed', published: false, schedulePublished: false, deletedRecords: false, changedOtherDivisions: false, changedOtherFormats: false }
    if (visualQa) window.__sxfQuickResultAction = scope
    if (!visualQa) await ElMessageBox.confirm('确认只锁定当前组别的分组快照，并进入赛程编排；不会发布赛程，也不会覆盖其他组别或归档结果。', '确认分组结果', { type: 'warning', confirmButtonText: '确认并进入赛程编排', cancelButtonText: '取消' })
    confirming.value = true
    if (visualQa) {
      window.__sxfQuickResultAction = { ...scope, phase: 'confirmed', cloudWrite: false }
    } else {
      const collection = format.value === 'tournament' ? 'tournament_groups' : format.value === 'cup' ? 'tournament_bracket' : 'tournament_league_tables'
      for (const record of records.value.filter(row => row.status === 'draft')) await updateRecord(collection, record._id, { status: 'confirmed', confirmedAt: new Date(), updateTime: new Date() })
    }
    ElMessage.success('当前组别分组结果已确认')
    router.push({ path: `/tournaments/${tournamentId}/schedule`, query: { divisionId: divisionId.value, view: 'editor', ...(visualQa ? { visualQa: '1' } : {}) } })
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(error.message || '确认失败')
  } finally { confirming.value = false }
}

onMounted(load)
</script>

<style scoped>
.quick-result{min-height:100%;padding:0 28px 92px;background:#f7f9f8;color:#26352c}.event-header{display:flex;align-items:center;justify-content:space-between;margin:0 -28px;padding:15px 28px;border-bottom:1px solid #e2e8e4;background:#fff}.event-main{display:flex;align-items:center;gap:11px}.event-main h2{margin:0 0 5px;font-size:21px}.event-main p{margin:0;color:#7c8880;font-size:12px}.event-mark{display:grid;place-items:center;width:41px;height:41px;border-radius:8px;background:#078348;color:#fff;font-weight:800}.page-heading{display:flex;align-items:center;justify-content:space-between;height:88px}.page-heading>div{display:flex;align-items:baseline;gap:22px}.page-heading h1{margin:0;font-size:27px}.page-heading p{margin:0;color:#68766d;font-size:13px}.page-heading label{display:flex;align-items:center;gap:12px;font-size:13px}.page-heading :deep(.el-select){width:130px}.steps{display:flex;height:45px;margin:0 -16px;border-bottom:1px solid #e0e6e2}.steps button{position:relative;padding:0 30px;border:0;background:transparent;color:#536158;font-size:14px;cursor:pointer}.steps button.active{color:#078348;font-weight:700}.steps button.active:after{position:absolute;right:20px;bottom:-1px;left:20px;height:3px;background:#078348;content:''}.summary,.toolbar{display:flex;align-items:center;gap:19px;margin-top:15px;padding:12px 15px;border:1px solid #dfe6e1;border-radius:7px;background:#fff}.summary i{height:20px;border-left:1px solid #dfe6e1}.summary span{white-space:nowrap;font-size:12px}.summary span b{margin-left:4px;font-size:15px}.summary em{display:flex;align-items:center;gap:5px;color:#078348;font-style:normal;font-size:12px}.summary strong{color:#ef6c23;font-size:12px}.summary .el-button{margin-left:auto}.toolbar :deep(.el-select){width:145px}.toolbar :deep(.el-input){width:310px}.toolbar .el-button-group{margin-left:auto}.group-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px;margin-top:15px}.group-grid article{overflow:hidden;border:1px solid #dfe6e1;border-radius:7px;background:#fff}.group-grid article header{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;border-bottom:1px solid #e8edea}.group-grid h3{margin:0;color:#087b44;font-size:16px}.group-grid ol{margin:0;padding:0;list-style:none}.group-grid li{display:flex;align-items:center;gap:8px;height:35px;padding:0 12px;border-bottom:1px solid #edf1ee}.group-grid li:last-child{border-bottom:0}.group-grid li>b{width:26px;font-size:12px}.group-grid li strong{flex:1;font-size:12px}.group-grid li .el-icon{color:#9ca69f}.crest{display:grid;flex:none;place-items:center;width:23px;height:23px;border-radius:50%;background:linear-gradient(135deg,#078348,#69b982);color:#fff;font-size:10px}.group-grid.list{grid-template-columns:1fr}.group-grid.list article{display:grid;grid-template-columns:120px 1fr}.group-grid.list ol{display:grid;grid-template-columns:repeat(4,1fr)}.format-result{display:grid;grid-template-columns:1.25fr .75fr;gap:14px;margin-top:15px}.result-card{height:485px;padding:16px;border:1px solid #dfe6e1;border-radius:7px;background:#fff}.result-card>header{display:flex;justify-content:space-between}.result-card h3{margin:0 0 5px;font-size:17px}.result-card header p{margin:0;color:#7f8b83;font-size:12px}.result-card ol{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:15px 0 0;padding:0;list-style:none}.result-card li{display:flex;align-items:center;gap:8px;min-height:39px;padding:0 10px;border:1px solid #e2e8e4;border-radius:5px}.result-card li>b{width:20px;color:#078348}.result-card li strong{flex:1;font-size:12px}.result-card li em{color:#078348;font-size:10px;font-style:normal}.stage-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:25px}.stage-metrics span{display:grid;place-items:center;min-height:100px;border-radius:7px;background:#f1f7f3}.stage-metrics b{color:#078348;font-size:28px}.stage-metrics small{color:#7c8980}.boundary-note{margin-top:22px;padding:13px;border-left:3px solid #078348;background:#f6faf7;color:#65736a;font-size:12px;line-height:1.7}.empty-result{display:grid;place-items:center;min-height:460px;margin-top:16px;border:1px dashed #ccd7d0;border-radius:8px;background:#fff}.empty-result>.el-icon{font-size:46px;color:#dd8f39}.empty-result h3{margin:12px 0 0}.empty-result p{margin:8px 0 16px;color:#748078;font-size:13px}.action-bar{position:fixed;right:0;bottom:0;left:220px;z-index:6;display:flex;align-items:center;justify-content:space-between;min-height:78px;padding:0 30px;border-top:1px solid #dce4df;background:#fff;box-shadow:0 -4px 14px rgba(35,65,46,.06)}.checks{display:flex;align-items:center;gap:19px}.checks span{display:flex;align-items:center;gap:5px;color:#087c45;font-size:11px}.checks i{height:20px;border-left:1px solid #dfe6e1}.checks em{color:#ef6c23;font-size:11px;font-style:normal}.footer-actions{display:grid;grid-template-columns:auto auto;gap:8px}.footer-actions small{grid-column:1/-1;color:#7f8b83;font-size:10px;text-align:right}@media(max-width:1200px){.group-grid{grid-template-columns:repeat(2,1fr)}.action-bar{left:0}.format-result{grid-template-columns:1fr}}@media(max-width:760px){.event-header,.page-heading,.summary,.toolbar,.action-bar{align-items:stretch;flex-direction:column}.group-grid{grid-template-columns:1fr}.action-bar{position:static;margin:16px -28px -92px;padding:16px}}
</style>
