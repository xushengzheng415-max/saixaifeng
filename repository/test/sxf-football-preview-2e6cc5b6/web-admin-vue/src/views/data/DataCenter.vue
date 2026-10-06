<template>
  <section class="data-center">
    <header class="page-head"><h1>数据中心</h1><el-button :loading="catalogLoading" @click="loadCatalog">刷新目录</el-button></header>
    <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon />
    <el-tabs v-model="activeTab">
      <el-tab-pane label="统一统计" name="statistics" />
      <el-tab-pane label="数据质量" name="quality" />
      <el-tab-pane label="转会记录" name="transfers" />
    </el-tabs>
    <template v-if="activeTab !== 'transfers'">
      <el-form class="filters" label-position="top" @submit.prevent="query">
        <el-form-item label="统计对象"><el-select v-model="subject" @change="resetScope"><el-option label="球队历史" value="team" /><el-option label="球员历史" value="player" /><el-option label="赛事" value="tournament" /><el-option v-if="platformOwner" label="全平台" value="platform" /></el-select></el-form-item>
        <el-form-item v-if="subject === 'team'" label="球队"><el-select v-model="scope.teamId" filterable :loading="catalogLoading"><el-option v-for="team in catalog.teams" :key="team.id" :label="team.name" :value="team.id" /></el-select></el-form-item>
        <el-form-item v-if="subject === 'player'" label="球员"><el-select v-model="scope.playerId" filterable :loading="catalogLoading"><el-option v-for="player in catalog.players" :key="player.id" :label="player.name + ' · ' + teamName(player.teamId)" :value="player.id" /></el-select></el-form-item>
        <el-form-item v-if="subject === 'tournament'" label="赛事"><el-select v-model="scope.tournamentId" filterable :loading="catalogLoading"><el-option v-for="item in catalog.tournaments" :key="item.id" :label="item.name" :value="item.id" /></el-select></el-form-item>
        <el-form-item label="统计口径"><el-select v-model="scope.mode"><el-option label="正式结果" value="official" /><el-option label="含现场暂定" value="provisional" /></el-select></el-form-item>
        <el-form-item label="时间范围"><el-date-picker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" /></el-form-item>
        <el-button type="primary" native-type="submit" :loading="loading" :disabled="catalogLoading">查询</el-button>
      </el-form>
      <div v-if="loading" class="state" role="status">正在统计…</div>
      <template v-else-if="result">
        <div class="result-meta"><span>{{ result.scope.mode === 'official' ? '正式结果' : '含现场暂定' }} · {{ result.accessScope === 'platform' ? '平台范围' : '当前授权范围' }}</span><span>记录覆盖 {{ result.coverage.coveredMatches }}/{{ result.coverage.expectedMatches }} 场</span><el-tag :type="result.coverage.status === 'complete' ? 'success' : 'warning'">{{ result.coverage.status === 'complete' ? '记录完整' : '部分记录不完整' }}</el-tag><el-button @click="download">导出结果</el-button></div>
        <template v-if="activeTab === 'quality'">
          <p class="quality-summary">未关联事件 {{ result.coverage.unlinkedEventCount }} 条 · 待审核比赛 {{ result.coverage.pendingReviewCount }} 场</p>
          <el-table :data="issuePage" stripe><el-table-column label="问题"><template #default="{ row }">{{ issueLabel(row.code) }}</template></el-table-column><el-table-column prop="matchId" label="比赛编号" show-overflow-tooltip /><el-table-column prop="eventId" label="事件编号" show-overflow-tooltip /><el-table-column prop="teamId" label="球队编号" show-overflow-tooltip /></el-table>
          <el-pagination v-if="result.issues.length > 20" v-model:current-page="issuePageIndex" :page-size="20" :total="result.issues.length" layout="prev, pager, next, total" />
        </template>
        <template v-else>
          <div v-if="result.playerTotal" class="player-total"><span v-for="field in metricFields" :key="field.id">{{ field.label }}：{{ number(result.playerTotal.metrics[field.id]) }}</span></div>
          <h2 v-if="subject !== 'player'">球队成绩</h2>
          <el-table v-if="subject !== 'player'" :data="result.teams" stripe><el-table-column label="球队" min-width="160"><template #default="{ row }">{{ row.teamName }}</template></el-table-column><el-table-column label="赛事" min-width="150"><template #default="{ row }">{{ tournamentName(row.tournamentId) }}</template></el-table-column><el-table-column prop="divisionId" label="组别" show-overflow-tooltip /><el-table-column prop="played" label="场次" width="70" /><el-table-column v-for="field in teamFields" :key="field.id" :label="field.label" width="80"><template #default="{ row }">{{ number(row[field.id]) }}</template></el-table-column></el-table>
          <h2>{{ subject === 'player' ? '历史贡献' : '球员表现' }}</h2>
          <el-table :data="result.players" stripe><el-table-column prop="playerName" label="球员" min-width="120" /><el-table-column label="当时球队" min-width="150"><template #default="{ row }">{{ teamName(row.teamId) }}</template></el-table-column><el-table-column label="赛事" min-width="150"><template #default="{ row }">{{ tournamentName(row.tournamentId) }}</template></el-table-column><el-table-column prop="divisionId" label="组别" show-overflow-tooltip /><el-table-column v-for="field in metricFields" :key="field.id" :label="field.label" width="90"><template #default="{ row }">{{ number(row.metrics[field.id]) }}</template></el-table-column></el-table>
          <p class="metric-note">“—”表示记录不足，不能确认数值。</p>
          <el-table v-if="result.memberships?.length" :data="result.memberships" stripe><el-table-column label="所属球队"><template #default="{ row }">{{ teamName(row.teamId) }}</template></el-table-column><el-table-column label="加入时间"><template #default="{ row }">{{ row.validFrom ? dateText(row.validFrom) : '历史时间未知' }}</template></el-table-column><el-table-column label="离队时间"><template #default="{ row }">{{ row.validTo ? dateText(row.validTo) : '当前所属' }}</template></el-table-column></el-table>
        </template>
        <details class="version"><summary>数据版本</summary><dl><dt>接口</dt><dd>{{ result.schemaVersion }}</dd><dt>指标</dt><dd>{{ result.metricVersion }}</dd><dt>数据</dt><dd>{{ result.dataVersion }}</dd><dt>生成时间</dt><dd>{{ dateText(result.generatedAt) }}</dd></dl></details>
      </template>
      <div v-else-if="!loading" class="state">选择统计对象后查询。</div>
    </template>
    <template v-else>
      <div class="transfer-actions"><el-button type="primary" @click="transferDialog = true">申请转会</el-button><el-button :loading="transferLoading" @click="loadTransfers">刷新记录</el-button><el-button v-if="platformOwner" :loading="initializing" @click="initialize">初始化关系表</el-button></div>
      <el-table :data="transfers" v-loading="transferLoading" stripe><el-table-column label="球员"><template #default="{ row }">{{ playerName(row.playerId) }}</template></el-table-column><el-table-column label="原球队"><template #default="{ row }">{{ teamName(row.fromTeamId) }}</template></el-table-column><el-table-column label="目标球队"><template #default="{ row }">{{ teamName(row.toTeamId) }}</template></el-table-column><el-table-column label="状态"><template #default="{ row }">{{ row.status === 'accepted' ? '已转会' : row.status === 'pending' ? '待确认' : row.status }}</template></el-table-column><el-table-column prop="reason" label="原因" show-overflow-tooltip /><el-table-column label="操作" width="110"><template #default="{ row }"><el-button v-if="row.status === 'pending'" link type="primary" :disabled="accepting === row.id" @click="accept(row)">确认转会</el-button></template></el-table-column></el-table>
    </template>
    <el-dialog v-model="transferDialog" title="申请转会" width="min(480px, 92vw)">
      <el-form label-position="top"><el-form-item label="球员"><el-select v-model="transfer.playerId" filterable><el-option v-for="player in catalog.players.filter(item => item.status !== 'deleted')" :key="player.id" :label="player.name + ' · ' + teamName(player.teamId)" :value="player.id" /></el-select></el-form-item><el-form-item label="目标球队"><el-select v-model="transfer.toTeamId" filterable><el-option v-for="team in catalog.teams.filter(item => item.id !== selectedTransferPlayer?.teamId)" :key="team.id" :label="team.name" :value="team.id" /></el-select></el-form-item><el-form-item label="原因"><el-input v-model="transfer.reason" maxlength="200" /></el-form-item></el-form>
      <p class="metric-note">当前支持同机构转会。历史成绩保留原球队归属。</p>
      <template #footer><el-button @click="transferDialog = false">取消</el-button><el-button type="primary" :loading="submittingTransfer" @click="submitTransfer">提交申请</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { callFunction } from '../../utils/cloud'
const catalog = reactive({ teams:[], tournaments:[], players:[] })
const catalogLoading = ref(false), loading = ref(false), errorText = ref(''), result = ref(null), subject = ref('team'), activeTab = ref('statistics')
const platformOwner = ref(false), scope = reactive({ teamId:'', playerId:'', tournamentId:'', mode:'official' }), dateRange = ref([])
const transfers = ref([]), transferLoading = ref(false), transferDialog = ref(false), submittingTransfer = ref(false), accepting = ref(''), initializing = ref(false)
const transfer = reactive({ playerId:'', toTeamId:'', reason:'', requestKey:'' }), issuePageIndex = ref(1)
const metricFields = [{ id:'appearances',label:'出场' },{ id:'goals',label:'进球' },{ id:'assists',label:'助攻' },{ id:'yellowCards',label:'黄牌' },{ id:'redCards',label:'红牌' },{ id:'minutesPlayed',label:'分钟' }]
const teamFields = [{ id:'wins',label:'胜' },{ id:'draws',label:'平' },{ id:'losses',label:'负' },{ id:'goalsFor',label:'进球' },{ id:'goalsAgainst',label:'失球' }]
const selectedTransferPlayer = computed(() => catalog.players.find(row => row.id === transfer.playerId))
const issuePage = computed(() => (result.value?.issues || []).slice((issuePageIndex.value - 1) * 20,issuePageIndex.value * 20))
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : '—'
const teamName = id => catalog.teams.find(row => row.id === id)?.name || id
const playerName = id => catalog.players.find(row => row.id === id)?.name || id
const tournamentName = id => catalog.tournaments.find(row => row.id === id)?.name || id
const dateText = value => new Date(value?.$date || value).toLocaleString('zh-CN')
const issueLabel = code => ({ EVENT_COVERAGE_PARTIAL:'比赛事件记录不足', EVENT_PLAYER_UNLINKED:'球员身份未关联', EVENT_TEAM_UNLINKED:'事件球队未关联', EVENT_PLAYER_TEAM_CONFLICT:'球员与球队冲突', SCORE_MISSING:'比分缺失', TEAM_ID_MISSING:'参赛球队缺失', MATCH_ID_MISSING:'比赛编号缺失' })[code] || code
async function api(data) { const reply = await callFunction('dataCenter',data); if (!reply.success) throw new Error(reply.error || reply.message || '数据操作失败，请重试'); return reply }
async function loadCatalog() { catalogLoading.value = true; errorText.value = ''; try { const reply = await api({ action:'catalog' }); Object.assign(catalog,reply); platformOwner.value = reply.accessScope === 'platform' } catch (error) { errorText.value = error.message } finally { catalogLoading.value = false } }
function resetScope() { Object.assign(scope,{ teamId:'', playerId:'', tournamentId:'' }); result.value = null }
async function query() {
  const field = { team:'teamId',player:'playerId',tournament:'tournamentId' }[subject.value]
  if (field && !scope[field]) { ElMessage.warning('请选择统计对象'); return }
  loading.value = true; errorText.value = ''; result.value = null
  try {
    const input = { mode:scope.mode, ...(field ? { [field]:scope[field] } : {}) }
    if (dateRange.value?.length === 2) { input.from = new Date(dateRange.value[0] + 'T00:00:00+08:00').toISOString(); const end = new Date(dateRange.value[1] + 'T00:00:00+08:00'); end.setUTCDate(end.getUTCDate() + 1); input.to = end.toISOString() }
    result.value = await api({ action:subject.value === 'platform' ? 'platformStatistics' : 'query', scope:input }); issuePageIndex.value = 1
  } catch (error) { errorText.value = error.message } finally { loading.value = false }
}
function download() { if (!result.value) return; const url = URL.createObjectURL(new Blob([JSON.stringify(result.value,null,2)],{ type:'application/json' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = '赛小蜂统计-' + result.value.dataVersion + '.json'; anchor.click(); URL.revokeObjectURL(url) }
async function loadTransfers() { transferLoading.value = true; errorText.value = ''; try { transfers.value = (await api({ action:'listTransfers' })).items } catch (error) { errorText.value = error.message } finally { transferLoading.value = false } }
async function submitTransfer() {
  if (!selectedTransferPlayer.value || !transfer.toTeamId) { ElMessage.warning('请选择球员和目标球队'); return }
  submittingTransfer.value = true
  if (!transfer.requestKey) transfer.requestKey = crypto.randomUUID()
  try { await api({ action:'requestTransfer', ...transfer, fromTeamId:selectedTransferPlayer.value.teamId }); transferDialog.value = false; Object.assign(transfer,{ playerId:'', toTeamId:'', reason:'', requestKey:'' }); ElMessage.success('转会申请已提交'); await loadTransfers() } catch (error) { ElMessage.error(error.message) } finally { submittingTransfer.value = false }
}
async function accept(row) {
  try { await ElMessageBox.confirm('球员将加入目标球队，原球队的历史贡献保留。','确认转会',{ confirmButtonText:'确认转会',cancelButtonText:'取消' }) } catch { return }
  accepting.value = row.id
  try { await api({ action:'acceptTransfer', transferId:row.id }); ElMessage.success('转会已完成'); result.value = null; await Promise.all([loadCatalog(),loadTransfers()]) } catch (error) { ElMessage.error(error.message) } finally { accepting.value = '' }
}
async function initialize() { initializing.value = true; try { await api({ action:'initializeCollections' }); ElMessage.success('关系表已就绪'); await loadTransfers() } catch (error) { ElMessage.error(error.message) } finally { initializing.value = false } }
watch(activeTab,value => { if (value === 'transfers') loadTransfers() })
watch(() => [transfer.playerId,transfer.toTeamId],() => { transfer.requestKey = '' })
onMounted(loadCatalog)
</script>

<style scoped>
.data-center{padding:24px;max-width:1600px;margin:auto;color:#25332c}.page-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}.page-head h1{font-size:22px;margin:0}.filters{display:flex;flex-wrap:wrap;gap:12px;align-items:end;padding:12px 0 20px}.filters .el-form-item{margin:0;width:190px}.filters .el-form-item:last-of-type{width:300px}.filters .el-select{width:100%}.result-meta{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin:0 0 18px;font-size:14px}.result-meta .el-button{margin-left:auto}.state{padding:60px 16px;text-align:center;color:#68776e}.data-center h2{font-size:16px;margin:24px 0 12px}.player-total{display:flex;gap:24px;flex-wrap:wrap;padding:16px 0;border-bottom:1px solid #e3e9e5}.metric-note,.quality-summary{font-size:13px;color:#68776e}.version{margin-top:20px;font-size:12px;color:#68776e}.version dl{display:grid;grid-template-columns:90px 1fr;gap:8px}.version dd{margin:0;overflow-wrap:anywhere}.transfer-actions{display:flex;gap:10px;margin:8px 0 20px}.el-pagination{margin-top:16px}.data-center :deep(.el-dialog .el-select){width:100%}@media(max-width:640px){.data-center{padding:16px}.filters .el-form-item,.filters .el-form-item:last-of-type{width:100%}.result-meta{gap:8px}.result-meta .el-button{margin-left:0}.player-total{gap:12px}.transfer-actions{flex-wrap:wrap}}
</style>
