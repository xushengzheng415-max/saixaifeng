<template>
  <section class="data-center" :class="{embedded:props.embedded}">
    <header v-if="!props.embedded" class="page-head"><h1>数据中心</h1><el-button :loading="catalogLoading" @click="loadCatalog">刷新目录</el-button></header>
    <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon />
    <el-tabs v-model="activeTab">
      <el-tab-pane label="统一统计" name="statistics" />
      <el-tab-pane label="数据质量" name="quality" />
      <el-tab-pane v-if="platformOwner" label="球员卡核验" name="playerAudit" />
      <el-tab-pane label="转会记录" name="transfers" />
    </el-tabs>
    <template v-if="activeTab === 'playerAudit'">
      <div class="audit-queue-head"><div><strong>{{ auditQueue ? '待核验 ' + auditQueue.issueCount + ' 人' : '尚未扫描' }}</strong><span v-if="auditQueue">已核定 {{ auditQueue.verifiedCount }} / {{ auditQueue.totalPlayers }}</span><small v-if="auditQueue?.generatedAt">上次扫描 {{ dateText(auditQueue.generatedAt) }}</small></div><el-button :loading="auditQueueLoading" @click="loadAuditQueue">{{ auditQueue ? '重新扫描' : '扫描异常' }}</el-button></div>
      <el-alert v-if="auditQueueError" :title="auditQueueError" type="error" :closable="false" show-icon />
      <el-alert v-if="auditMutationNotice" :title="auditMutationNotice" type="success" :closable="false" />
      <el-form class="filters player-audit-filters" label-position="top" @submit.prevent="auditSelectedPlayer">
        <el-form-item label="球员"><el-select v-model="auditPlayerId" filterable clearable :loading="catalogLoading" placeholder="搜索球员姓名或球队"><el-option v-for="player in catalog.players" :key="player.id" :label="player.name + ' · ' + teamName(player.teamId)" :value="player.id" /></el-select></el-form-item>
        <el-button type="primary" native-type="submit" :loading="auditLoading" :disabled="!auditPlayerId">核验数据</el-button>
      </el-form>
      <div v-if="!auditQueue && !auditQueueLoading && !auditQueueError" class="state">点击“扫描异常”检查球员卡等级数据。</div>
      <div v-if="auditQueue?.issues?.length" class="audit-search-row"><el-input v-model="auditKeyword" clearable class="audit-search" placeholder="搜索球员姓名、球队或异常项" /><span>显示 {{ filteredAuditIssues.length }} / {{ auditQueue.issueCount }} 人</span></div>
      <el-table v-if="filteredAuditIssues.length" :data="filteredAuditIssues" stripe max-height="560">
        <el-table-column prop="playerName" label="球员" min-width="130" />
        <el-table-column prop="teamName" label="球队" min-width="150" />
        <el-table-column label="未通过项" min-width="300"><template #default="{ row }"><el-tag v-for="item in row.missing" :key="item" type="danger" effect="plain">{{ missingLabel(item) }}</el-tag><span v-if="!row.missing.length">{{ auditStatusTextFor(row.status) }}</span></template></el-table-column>
        <el-table-column label="操作" width="115"><template #default="{ row }"><el-button link type="primary" @click="selectAuditIssue(row)">核验明细</el-button></template></el-table-column>
      </el-table>
      <el-empty v-else-if="auditQueue?.issues?.length" description="没有符合条件的球员" />
      <el-empty v-else-if="auditQueue && !auditQueue.issues.length" description="未发现待核验球员" />
      <div v-else-if="auditQueueLoading && !auditQueue" class="state" role="status">正在扫描球员数据…</div>

      <div v-if="auditLoading" class="state" role="status">正在核对正式生涯数据…</div>
      <template v-else-if="playerAudit">
        <div class="result-meta"><span>{{ playerAudit.player.name }} · {{ playerAudit.player.teamName || '球队待补充' }}</span><el-tag :type="auditStatusType">{{ auditStatusText }}</el-tag><el-tag v-if="playerAudit.score?.tier" type="success">{{ tierText(playerAudit.score.tier) }} · {{ playerAudit.score.points }} 分</el-tag></div>
        <el-alert :title="auditSummary" :type="playerAudit.score?.status === 'ready' ? 'success' : playerAudit.score?.status === 'test_data_excluded' ? 'warning' : 'error'" :closable="false" show-icon />
        <div v-if="playerAudit.score?.missing?.length" class="audit-missing"><strong>未通过项</strong><el-tag v-for="item in playerAudit.score.missing" :key="item" type="danger" effect="plain">{{ missingLabel(item) }}</el-tag></div>
        <h2>生涯指标</h2>
        <el-table :data="auditMetricRows" stripe>
          <el-table-column prop="label" label="指标" width="130" />
          <el-table-column label="已采集"><template #default="{ row }">{{ number(row.observed) }}</template></el-table-column>
          <el-table-column label="核定值"><template #default="{ row }">{{ row.complete ? number(row.value) : '—' }}</template></el-table-column>
          <el-table-column label="覆盖状态"><template #default="{ row }"><el-tag :type="row.complete ? 'success' : 'warning'">{{ coverageText(row.coverage) }}</el-tag></template></el-table-column>
        </el-table>
        <div class="audit-coverage">
          <span>比赛读取 {{ playerAudit.coverage.coveredMatches }}/{{ playerAudit.coverage.expectedMatches }} 场</span>
          <span>阵容缺失 {{ playerAudit.coverage.missingLineupSides || 0 }} 侧</span>
          <span>来源待核 {{ playerAudit.coverage.originUnverifiedMatches || 0 }} 场</span>
          <span>未关联事件 {{ playerAudit.coverage.unlinkedEventCount || 0 }} 条</span>
          <span v-if="playerAudit.score?.supportDrops != null">已核定应援 {{ playerAudit.score.supportDrops }} 次</span>
          <span>规则 {{ playerAudit.score?.scoreVersion || '—' }}</span>
        </div>
        <h2>球队与赛事记录</h2>
        <el-table :data="playerAudit.careerRows" stripe>
          <el-table-column label="赛事" min-width="140"><template #default="{ row }">{{ tournamentName(row.tournamentId) }}</template></el-table-column>
          <el-table-column label="当时球队" min-width="140"><template #default="{ row }">{{ teamName(row.teamId) }}</template></el-table-column>
          <el-table-column label="组别" min-width="100" show-overflow-tooltip><template #default="{row}">{{ row.divisionName || (row.divisionId === 'default' ? '默认组别' : '组别名称待核对') }}</template></el-table-column>
          <el-table-column label="比赛" width="90"><template #default="{ row }">{{ row.matchIds.length }} 场</template></el-table-column>
          <el-table-column v-for="field in auditMetricFields" :key="field.id" :label="field.label" width="100"><template #default="{ row }">{{ row.coverage[field.id] === 'complete' ? number(row.metrics[field.id]) : '—' }} · {{ coverageText(row.coverage[field.id]) }}</template></el-table-column>
          <el-table-column label="比赛编号" min-width="160"><template #default="{ row }"><el-button v-if="row.matchIds.length" link @click="copyMatchIds(row.matchIds)">复制 {{ row.matchIds.length }} 个编号</el-button><span v-else>—</span></template></el-table-column>
          <el-table-column label="处理" width="90"><template #default="{ row }"><el-button v-if="row.tournamentId" link type="primary" @click="openTournamentMatches(row.tournamentId)">查询赛事</el-button><span v-else>—</span></template></el-table-column>
        </el-table>
        <el-table v-if="playerAudit.issues.length" :data="playerAudit.issues" stripe class="audit-issues">
          <el-table-column label="数据问题" min-width="180"><template #default="{ row }">{{ issueLabel(row.code) }}</template></el-table-column>
          <el-table-column prop="matchId" label="比赛编号" min-width="180" show-overflow-tooltip />
          <el-table-column prop="eventId" label="事件编号" min-width="180" show-overflow-tooltip />
          <el-table-column prop="teamId" label="球队编号" min-width="160" show-overflow-tooltip />
          <el-table-column label="事件内容" min-width="180"><template #default="{ row }">{{ row.event ? `${eventTypeText(row.event.type)} · ${row.event.playerName || row.event.playerId || '球员未关联'} · ${row.event.teamSide || row.event.teamId || '球队未关联'}` : '源事件不可用' }}</template></el-table-column>
          <el-table-column label="纠正" width="180"><template #default="{ row }"><el-button v-if="canCorrectAuditEvent(row)" link type="primary" @click="openEventCorrection(row)">修正关联</el-button><el-button v-if="row.event" link type="danger" @click="deleteInvalidAuditEvent(row)">删除无效</el-button><DurationVerification :issue="row" :allowed="platformOwner" @saved="onDurationVerified" /><span v-if="!row.event && !String(row.code).startsWith('MATCH_DURATION')">—</span></template></el-table-column>
        </el-table>
        <p class="metric-note">修正或删除比赛原始事件后，手动重新扫描核验。</p>
        <details class="version"><summary>数据版本</summary><dl><dt>积分规则</dt><dd>{{ playerAudit.score?.scoreVersion }}</dd><dt>比赛数据</dt><dd>{{ playerAudit.score?.careerDataVersion || playerAudit.score?.dataVersion || '—' }}</dd><dt>应援数据</dt><dd>{{ playerAudit.score?.supportDataVersion || '—' }}</dd><dt>生成时间</dt><dd>{{ dateText(playerAudit.coverage.generatedAt) }}</dd></dl></details>
      </template>
      <div v-else-if="!auditLoading" class="state">选择球员后查看积分核验明细。</div>
      <el-dialog v-model="eventCorrectionOpen" title="修正比赛事件" width="min(500px, 94vw)">
        <template v-if="eventCorrectionIssue">
          <p class="metric-note">{{ eventTypeText(eventCorrectionIssue.event?.type) }} · {{ eventCorrectionIssue.matchId }} · {{ eventCorrectionIssue.eventId }}</p>
          <el-form label-position="top">
            <el-form-item label="正确球员"><el-select v-model="eventCorrection.playerId" filterable><el-option v-for="player in catalog.players" :key="player.id" :label="player.name + ' · ' + teamName(player.teamId)" :value="player.id" /></el-select></el-form-item>
            <el-form-item label="正确球队"><el-select v-model="eventCorrection.teamId"><el-option v-for="team in correctionTeams" :key="team.id" :label="team.name" :value="team.id" /></el-select></el-form-item>
            <el-form-item label="事件类型"><el-select v-model="eventCorrection.type"><el-option v-for="item in correctionEventTypes" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
            <el-form-item label="事件分钟"><el-input-number v-model="eventCorrection.minute" :min="0" :max="300" :step="1" /></el-form-item>
            <el-form-item label="纠正原因"><el-input v-model="eventCorrection.reason" type="textarea" :rows="3" maxlength="200" show-word-limit /></el-form-item>
          </el-form>
        </template>
        <template #footer><el-button @click="eventCorrectionOpen=false">取消</el-button><el-button type="primary" :loading="eventMutationLoading" @click="saveAuditEventCorrection">保存纠正</el-button></template>
      </el-dialog>
    </template>
    <template v-else-if="activeTab !== 'transfers'">
      <el-form class="filters" label-position="top" @submit.prevent="query">
        <el-form-item label="统计对象"><el-select v-model="subject" @change="resetScope"><el-option label="球队历史" value="team" /><el-option label="球员历史" value="player" /><el-option label="赛事" value="tournament" /><el-option v-if="platformOwner" label="全平台" value="platform" /></el-select></el-form-item>
        <el-form-item v-if="['team','player','tournament','platform'].includes(subject)" label="赛事"><el-select v-model="scope.tournamentId" filterable clearable :loading="catalogLoading" placeholder="先选择赛事" @change="changeTournament"><el-option v-for="item in catalog.tournaments" :key="item.id" :label="item.name" :value="item.id" /></el-select></el-form-item>
        <el-form-item v-if="['team','player','tournament','platform'].includes(subject)" label="球队"><el-select v-model="scope.teamId" filterable clearable :disabled="!scope.tournamentId" :loading="tournamentTeamsLoading" placeholder="选择赛事后筛选球队" @change="changeScopeTeam"><el-option v-for="team in scopedTeams" :key="team.id" :label="team.name" :value="team.id" /></el-select></el-form-item>
        <el-form-item v-if="subject === 'player'" label="球员"><el-select v-model="scope.playerId" filterable :loading="catalogLoading" :disabled="!scope.teamId" placeholder="先选择球队"><el-option v-for="player in scopedPlayers" :key="player.id" :label="player.name" :value="player.id" /></el-select></el-form-item>
        <el-form-item label="统计口径"><el-select v-model="scope.mode"><el-option label="正式结果" value="official" /><el-option label="含现场暂定" value="provisional" /></el-select></el-form-item>
        <el-form-item label="时间范围"><el-date-picker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" /></el-form-item>
        <el-button type="primary" native-type="submit" :loading="loading" :disabled="catalogLoading">查询</el-button>
      </el-form>
      <div v-if="loading" class="state" role="status">正在统计…</div>
      <template v-else-if="result">
        <div class="result-meta"><span>{{ result.scope.mode === 'official' ? '正式结果' : '含现场暂定' }} · {{ result.accessScope === 'platform' ? '平台范围' : '当前授权范围' }}</span><span>记录覆盖 {{ result.coverage.coveredMatches }}/{{ result.coverage.expectedMatches }} 场</span><el-tag :type="result.coverage.status === 'complete' ? 'success' : 'warning'">{{ result.coverage.status === 'complete' ? '记录完整' : '部分记录不完整' }}</el-tag><el-button @click="download">导出结果</el-button></div>
        <template v-if="activeTab === 'quality'">
          <p class="quality-summary">检查比赛、阵容和事件来源；问题需在对应业务页修正。</p>
          <p class="quality-summary">未关联事件 {{ result.coverage.unlinkedEventCount }} 条 · 待审核比赛 {{ result.coverage.pendingReviewCount }} 场 · 质量问题 {{ result.issues.length }} 条</p>
          <el-table :data="issuePage" stripe>
            <el-table-column label="问题" min-width="250"><template #default="{ row }"><strong>{{ issueLabel(row.code) }}</strong><small class="issue-hint">{{ issueHint(row.code) }}</small></template></el-table-column>
            <el-table-column v-if="result.issues.some(row=>row.matchId)" label="比赛 ID" min-width="210"><template #default="{ row }"><code v-if="row.matchId" class="quality-id">{{ row.matchId }}</code><span v-else>—</span><el-button v-if="row.matchId" link @click="copyIdentifier(row.matchId)">复制</el-button></template></el-table-column>
            <el-table-column v-if="result.issues.some(row=>row.eventId)" label="事件 ID" min-width="180"><template #default="{ row }"><code v-if="row.eventId" class="quality-id">{{ row.eventId }}</code><span v-else>—</span><el-button v-if="row.eventId" link @click="copyIdentifier(row.eventId)">复制</el-button></template></el-table-column>
            <el-table-column v-if="result.issues.some(row=>row.teamId)" label="球队 ID" min-width="180"><template #default="{ row }"><span v-if="row.teamId">{{ teamName(row.teamId) }}</span><span v-else>—</span></template></el-table-column>
          <el-table-column label="操作" width="110"><template #default="{row}"><DurationVerification :issue="row" :allowed="platformOwner" @saved="query" /></template></el-table-column></el-table>
          <el-pagination v-if="result.issues.length > 20" v-model:current-page="issuePageIndex" :page-size="20" :total="result.issues.length" layout="prev, pager, next, total" />
        </template>
        <template v-else>
          <div v-if="result.playerTotal" class="player-total"><span v-for="field in metricFields" :key="field.id">{{ field.label }}：{{ number(result.playerTotal.metrics[field.id]) }}</span></div>
          <h2 v-if="subject !== 'player'">球队成绩</h2>
          <el-table v-if="subject !== 'player'" :data="result.teams" stripe><el-table-column label="球队" min-width="160"><template #default="{ row }">{{ row.teamName }}</template></el-table-column><el-table-column label="赛事" min-width="150"><template #default="{ row }">{{ tournamentName(row.tournamentId) }}</template></el-table-column><el-table-column label="组别" min-width="130"><template #default="{ row }">{{ divisionLabel(row.divisionId,row.divisionName) }}</template></el-table-column><el-table-column prop="played" label="场次" width="70" /><el-table-column v-for="field in teamFields" :key="field.id" :label="field.label" width="80"><template #default="{ row }">{{ number(row[field.id]) }}</template></el-table-column></el-table>
          <h2>{{ subject === 'player' ? '历史贡献' : '球员表现' }}</h2>
          <el-table :data="result.players" stripe><el-table-column prop="playerName" label="球员" min-width="120" /><el-table-column label="当时球队" min-width="150"><template #default="{ row }">{{ teamName(row.teamId) }}</template></el-table-column><el-table-column label="赛事" min-width="150"><template #default="{ row }">{{ tournamentName(row.tournamentId) }}</template></el-table-column><el-table-column label="组别" min-width="130"><template #default="{ row }">{{ divisionLabel(row.divisionId,row.divisionName) }}</template></el-table-column><el-table-column v-for="field in metricFields" :key="field.id" :label="field.label" width="90"><template #default="{ row }">{{ number(row.metrics[field.id]) }}</template></el-table-column></el-table>
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
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import DurationVerification from './DurationVerification.vue'
import { callFunction, playerCardTemplateRequest } from '../../utils/cloud'
const props = defineProps({ embedded:Boolean, initialPlayerId:{type:String,default:''} })
const router = useRouter()
const catalog = reactive({ teams:[], tournaments:[], players:[] })
const catalogLoading = ref(false), loading = ref(false), tournamentTeamsLoading=ref(false), errorText = ref(''), result = ref(null), subject = ref('team'), activeTab = ref('statistics'), tournamentTeamIds=ref([])
const platformOwner = ref(false), scope = reactive({ teamId:'', playerId:'', tournamentId:'', mode:'official' }), dateRange = ref([])
const auditPlayerId = ref(''), auditLoading = ref(false), playerAudit = ref(null)
const auditQueue = ref(null), auditQueueLoading = ref(false), auditQueueError = ref(''), auditKeyword = ref(''), manualAuditOpen=ref(false)
const auditMutationNotice=ref(''),eventCorrectionOpen=ref(false),eventMutationLoading=ref(false),eventCorrectionIssue=ref(null),eventCorrection=reactive({playerId:'',teamId:'',type:'goal',minute:0,reason:''})
const transfers = ref([]), transferLoading = ref(false), transferDialog = ref(false), submittingTransfer = ref(false), accepting = ref(''), initializing = ref(false)
let querySequence=0,auditSequence=0
const transfer = reactive({ playerId:'', toTeamId:'', reason:'', requestKey:'' }), issuePageIndex = ref(1)
const metricFields = [{ id:'appearances',label:'出场' },{ id:'goals',label:'进球' },{ id:'assists',label:'助攻' },{ id:'yellowCards',label:'黄牌' },{ id:'redCards',label:'红牌' },{ id:'minutesPlayed',label:'分钟' }]
const auditMetricFields = [{id:'appearances',label:'出场'},{id:'starts',label:'首发'},{id:'minutesPlayed',label:'分钟'},{id:'goals',label:'进球'}]
const correctionEventTypes=[{value:'goal',label:'进球'},{value:'penalty_goal',label:'点球'},{value:'own_goal',label:'乌龙球'},{value:'assist',label:'助攻'},{value:'yellow_card',label:'黄牌'},{value:'red_card',label:'红牌'},{value:'second_yellow',label:'两黄变红'},{value:'substitution',label:'换人'}]
const teamFields = [{ id:'wins',label:'胜' },{ id:'draws',label:'平' },{ id:'losses',label:'负' },{ id:'goalsFor',label:'进球' },{ id:'goalsAgainst',label:'失球' }]
const selectedTransferPlayer = computed(() => catalog.players.find(row => row.id === transfer.playerId))
const issuePage = computed(() => (result.value?.issues || []).slice((issuePageIndex.value - 1) * 20,issuePageIndex.value * 20))
const scopedTeams = computed(()=>{const ids=new Set(tournamentTeamIds.value.map(String));return catalog.teams.filter(team=>ids.has(String(team.id)))})
const scopedPlayers = computed(()=>catalog.players.filter(player=>String(player.teamId)===String(scope.teamId)))
const filteredAuditIssues = computed(()=>{const key=auditKeyword.value.trim().toLocaleLowerCase();return (auditQueue.value?.issues||[]).filter(row=>!key||[row.playerName,row.teamName,row.playerId,...(row.missing||[]).map(missingLabel)].some(value=>String(value||'').toLocaleLowerCase().includes(key)))})
const auditMetricRows = computed(() => auditMetricFields.map(field=>({ ...field,value:playerAudit.value?.playerTotal?.metrics?.[field.id],observed:playerAudit.value?.playerTotal?.observed?.[field.id],coverage:playerAudit.value?.playerTotal?.coverage?.[field.id]||'not_collected',complete:playerAudit.value?.playerTotal?.coverage?.[field.id]==='complete' })))
const correctionTeams=computed(()=>{const ids=[eventCorrectionIssue.value?.match?.homeTeamId,eventCorrectionIssue.value?.match?.awayTeamId].filter(Boolean).map(String);return ids.map(id=>({id,name:catalog.teams.find(team=>String(team.id)===id)?.name||id}))})
const auditStatusText = computed(() => ({ready:'已核定',unverified:'待核验',test_data_excluded:'测试来源已排除',scope_limited:'统计范围不足'}[playerAudit.value?.score?.status]||'未核定'))
const auditStatusType = computed(() => playerAudit.value?.score?.status==='ready'?'success':playerAudit.value?.score?.status==='test_data_excluded'?'warning':'danger')
const auditSummary = computed(() => {const score=playerAudit.value?.score;if(score?.status==='ready')return `正式生涯积分 ${score.points} 分，核定为${tierText(score.tier)}。`;if(score?.status==='test_data_excluded')return '球员或球队标记为测试来源，不进入正式制卡。';const missing=(score?.missing||[]).map(missingLabel);return missing.length?`制卡暂停：${missing.join('、')}。修复来源数据后可重新核验。`:'未取得完整的正式生涯积分，暂不能制卡。'})
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : '—'
const teamName = id => catalog.teams.find(row => row.id === id)?.name || id
const playerName = id => catalog.players.find(row => row.id === id)?.name || id
const tournamentName = id => catalog.tournaments.find(row => row.id === id)?.name || id
const divisionLabel = (id,name='') => name || result.value?.standings?.find(row=>String(row.divisionId)===String(id))?.divisionName || (String(id||'')==='default'?'默认组别':'组别名称待核对')
const dateText = value => new Date(value?.$date || value).toLocaleString('zh-CN')
const tierText = value => ({bronze:'铜卡',silver:'银卡',gold:'金卡'})[value]||'等级待核定'
const coverageText = value => ({complete:'完整',partial:'部分',not_collected:'未采集',test_data:'测试数据',identity_unverified:'身份待核',undefined:'未知'})[value]||'未知'
const missingLabel = value => ({dataCoverage:'正式比赛来源或整体覆盖不完整',supportDrops:'应援记录与蜂蜜扣账未完整核对',appearances:'出场记录不完整',starts:'首发记录不完整',minutesPlayed:'出场分钟不完整',goals:'有效进球记录不完整'})[value]||value
const auditStatusTextFor = value => ({unverified:'生涯数据待核验',scope_limited:'统计范围不足',test_data_excluded:'测试来源已排除'})[value]||'积分待核验'
const eventTypeText = value => ({goal:'进球',penalty_goal:'点球',penalty_scored:'点球',own_goal:'乌龙球',assist:'助攻',yellow_card:'黄牌',red_card:'红牌',substitution:'换人',second_yellow:'两黄变红'})[String(value||'').toLowerCase()]||String(value||'比赛事件')
const canCorrectAuditEvent = row => Boolean(row.event&&['EVENT_PLAYER_UNLINKED','EVENT_TEAM_UNLINKED','EVENT_PLAYER_TEAM_CONFLICT'].includes(row.code))
const issueLabels = { EVENT_COVERAGE_PARTIAL:'比赛事件记录不足', EVENT_PLAYER_UNLINKED:'球员身份未关联', EVENT_TEAM_UNLINKED:'事件球队未关联', EVENT_PLAYER_TEAM_CONFLICT:'球员与球队冲突', SCORE_MISSING:'比分缺失', TEAM_ID_MISSING:'参赛球队缺失', MATCH_ID_MISSING:'比赛编号缺失',LINEUP_COVERAGE_MISSING:'阵容覆盖缺失',MATCH_ORIGIN_UNVERIFIED:'比赛来源待核验',TEST_PLAYER_IN_MATCH:'涉及测试球员',MATCH_DURATION_EVIDENCE_MISSING:'比赛时长未核实', MATCH_DURATION_MISSING:'比赛时长缺失', MATCH_TEAM_MISSING:'参赛球队缺失', TOURNAMENT_MISSING:'赛事未关联', EVENT_COVERAGE_MISSING:'比赛事件未完整记录' }
const issueLabel = code => issueLabels[code] || '待核验的数据项'
const issueHint = code => ({MATCH_DURATION_EVIDENCE_MISSING:'直接核实该场比赛的时长及依据。',MATCH_DURATION_MISSING:'到赛事比赛记录中填写比赛时长。',LINEUP_COVERAGE_MISSING:'补齐比赛双方已审核的阵容记录。',MATCH_ORIGIN_UNVERIFIED:'核对比赛来源并完成审核。',EVENT_PLAYER_UNLINKED:'在球员卡核验中关联正确球员。',EVENT_TEAM_UNLINKED:'在球员卡核验中关联正确球队。',EVENT_PLAYER_TEAM_CONFLICT:'核对事件球员与球队归属。',SCORE_MISSING:'补录正式比分并完成比赛审核。',TEAM_ID_MISSING:'补齐比赛的参赛球队。',MATCH_ID_MISSING:'为记录补齐比赛关联。',TEST_PLAYER_IN_MATCH:'检查测试来源标记；测试数据不计入正式统计。',EVENT_COVERAGE_PARTIAL:'补齐比赛事件记录后重新查询。'})[code] || '查看对应比赛记录并补齐缺失信息。'
async function copyIdentifier(value){try{await navigator.clipboard.writeText(String(value));ElMessage.success('编号已复制')}catch{ElMessage.error('复制失败，请手动选择编号')}}
async function api(data) { const {action,...params}=data;const reply = ['auditPlayer','auditQueue'].includes(action) ? await playerCardTemplateRequest('savePlayerCardTemplate',{...params,workflowAction:action}) : await callFunction('dataCenter',data); if (!reply.success) throw new Error(reply.error || reply.message || '数据操作失败，请重试'); return reply }
async function loadCatalog() { catalogLoading.value = true; errorText.value = ''; try { const reply = await api({ action:'catalog' }); Object.assign(catalog,reply); platformOwner.value = reply.accessScope === 'platform' } catch (error) { errorText.value = error.message } finally { catalogLoading.value = false } }
async function auditSelectedPlayer() {
  if(!auditPlayerId.value){ElMessage.warning('请选择球员');return}
  const sequence=++auditSequence
  auditLoading.value=true;playerAudit.value=null;errorText.value=''
  try{const reply=await api({action:'auditPlayer',playerId:auditPlayerId.value});if(sequence!==auditSequence)return;playerAudit.value={...reply,issues:reply.issues||[],careerRows:reply.careerRows||[]}}
  catch(error){if(sequence===auditSequence)errorText.value=error.message||'球员核验失败，请重试'}finally{if(sequence===auditSequence)auditLoading.value=false}
}
async function loadAuditQueue(){
  if(auditQueueLoading.value)return
  auditQueueLoading.value=true;auditQueueError.value=''
  try{let cursor='',issues=[],verifiedCount=0,totalPlayers=0;const seen=new Set();do{const reply=await api({action:'auditQueue',cursor});issues.push(...(reply.issues||[]));verifiedCount+=reply.verifiedCount;totalPlayers=reply.totalPlayers;cursor=reply.nextCursor;if(cursor){if(seen.has(cursor))throw new Error('扫描分页异常，请重试');seen.add(cursor)}}while(cursor);auditQueue.value={issues,verifiedCount,totalPlayers,issueCount:issues.length,generatedAt:new Date().toISOString()};if(auditPlayerId.value&&playerAudit.value&&!issues.some(row=>row.playerId===auditPlayerId.value))await auditSelectedPlayer()}
  catch(error){auditQueueError.value=error.message||'异常球员扫描失败，请重试'}finally{auditQueueLoading.value=false}
}
async function onDurationVerified(){await auditSelectedPlayer();if(auditQueue.value)await loadAuditQueue()}
function selectAuditIssue(row){auditPlayerId.value=row.playerId;auditSelectedPlayer()}
function openEventCorrection(row){eventCorrectionIssue.value=row;eventCorrection.playerId=auditPlayerId.value||row.event?.playerId||'';eventCorrection.teamId=row.event?.teamId||row.teamId||row.match?.homeTeamId||'';eventCorrection.type=correctionEventTypes.some(item=>item.value===row.event?.type)?row.event.type:'goal';eventCorrection.minute=Number(row.event?.minute||0);eventCorrection.reason='';eventCorrectionOpen.value=true}
async function saveAuditEventCorrection(){const issue=eventCorrectionIssue.value;if(!issue)return;if(!eventCorrection.playerId||!eventCorrection.teamId||eventCorrection.reason.trim().length<4){ElMessage.warning('请填写球员、球队和至少 4 字的纠正原因');return}eventMutationLoading.value=true;try{const reply=await playerCardTemplateRequest('correctPlayerCardAuditEvent',{playerId:auditPlayerId.value,matchId:issue.matchId,eventId:issue.eventId,targetPlayerId:eventCorrection.playerId,targetTeamId:eventCorrection.teamId,targetType:eventCorrection.type,targetMinute:eventCorrection.minute,reason:eventCorrection.reason,expectedRevision:issue.event.revision,expectedOverrideRevision:issue.event.overrideRevision});if(!reply?.success)throw new Error(reply?.error||'事件纠正失败');eventCorrectionOpen.value=false;playerAudit.value=null;auditQueue.value=null;auditMutationNotice.value='事件已纠正；点击“扫描异常”重新核验。';ElMessage.success('事件已纠正，请重新扫描')}catch(error){ElMessage.error(error.message||'事件纠正失败，请重试')}finally{eventMutationLoading.value=false}}
async function deleteInvalidAuditEvent(row){let reason='';try{const result=await ElMessageBox.prompt('删除后该事件将从统计中排除，并保留操作审计记录。请填写原因。','删除无效事件',{confirmButtonText:'删除无效数据',cancelButtonText:'取消',inputType:'textarea',inputPlaceholder:'例如：事件球员与比赛名单不符',inputValidator:value=>String(value||'').trim().length>=4||'请填写至少 4 字的删除原因'});reason=String(result.value||'').trim()}catch{return}eventMutationLoading.value=true;try{const reply=await playerCardTemplateRequest('deletePlayerCardAuditEvent',{playerId:auditPlayerId.value,matchId:row.matchId,eventId:row.eventId,reason,expectedRevision:row.event.revision,expectedOverrideRevision:row.event.overrideRevision});if(!reply?.success)throw new Error(reply?.error||'删除无效事件失败');playerAudit.value=null;auditQueue.value=null;auditMutationNotice.value='无效事件已从统计中排除并记录审计；点击“扫描异常”更新队列。';ElMessage.success('无效事件已删除')}catch(error){ElMessage.error(error.message||'删除无效事件失败，请重试')}finally{eventMutationLoading.value=false}}
async function copyMatchIds(ids){try{await navigator.clipboard.writeText(ids.join('\n'));ElMessage.success(`已复制 ${ids.length} 个比赛编号`)}catch{ElMessage.error('复制失败，请手动选择比赛编号')}}
async function openTournamentMatches(tournamentId){if(!tournamentId)return;subject.value='tournament';Object.assign(scope,{tournamentId,teamId:'',playerId:''});activeTab.value='statistics';await query()}
function resetScope() { querySequence++;loading.value=false; Object.assign(scope,{ teamId:'', playerId:'', tournamentId:'' }); tournamentTeamIds.value=[];result.value = null }
async function changeTournament(){querySequence++;loading.value=false;const selectedTournament=scope.tournamentId;scope.teamId='';scope.playerId='';result.value=null;tournamentTeamIds.value=[];if(!scope.tournamentId)return;tournamentTeamsLoading.value=true;try{const data=await api({action:'query',scope:{tournamentId:scope.tournamentId,mode:scope.mode}});if(selectedTournament!==scope.tournamentId)return;const ids=[...new Set((data.teams||[]).map(row=>String(row.teamId||'')).filter(Boolean))];tournamentTeamIds.value=ids;if(!ids.length)ElMessage.info('该赛事暂无可统计的球队记录')}catch(error){errorText.value=error.message||'赛事球队读取失败'}finally{tournamentTeamsLoading.value=false}}
function changeScopeTeam(){querySequence++;loading.value=false;scope.playerId='';result.value=null}
async function query() {
  if(subject.value==='team'&&(!scope.tournamentId||!scope.teamId)){ElMessage.warning('请先选择赛事，再选择球队');return}
  if(subject.value==='player'&&(!scope.tournamentId||!scope.teamId||!scope.playerId)){ElMessage.warning('请依次选择赛事、球队和球员');return}
  if(subject.value==='tournament'&&!scope.tournamentId){ElMessage.warning('请选择赛事');return}
  const sequence=++querySequence
  loading.value = true; errorText.value = ''
  try {
    const input = { mode:scope.mode }
    if(['team','player','tournament','platform'].includes(subject.value)&&scope.tournamentId)input.tournamentId=scope.tournamentId
    if(['team','player','tournament','platform'].includes(subject.value)&&scope.teamId)input.teamId=scope.teamId
    if(subject.value==='player')input.playerId=scope.playerId
    if (dateRange.value?.length === 2) { input.from = new Date(dateRange.value[0] + 'T00:00:00+08:00').toISOString(); const end = new Date(dateRange.value[1] + 'T00:00:00+08:00'); end.setUTCDate(end.getUTCDate() + 1); input.to = end.toISOString() }
    const reply=await api({ action:subject.value === 'platform' ? 'platformStatistics' : 'query', scope:input }); if(sequence!==querySequence)return;result.value=reply; issuePageIndex.value = 1
  } catch (error) { if(sequence===querySequence)errorText.value = error.message } finally { if(sequence===querySequence)loading.value = false }
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
watch(activeTab,value => { if (value === 'transfers') loadTransfers(); if(value==='playerAudit'&&!catalog.players.length)loadCatalog() })
watch(auditPlayerId,()=>{auditSequence++;auditLoading.value=false;playerAudit.value=null})
watch(() => [transfer.playerId,transfer.toTeamId],() => { transfer.requestKey = '' })
onBeforeUnmount(()=>{querySequence++;auditSequence++})
async function refresh(){await loadCatalog();if(activeTab.value==='playerAudit'){if(auditQueue.value)await loadAuditQueue();if(auditPlayerId.value)await auditSelectedPlayer()}else if(activeTab.value==='transfers')await loadTransfers();else if(result.value)await query()}
defineExpose({refresh,loading})
onMounted(async()=>{await loadCatalog();if(props.initialPlayerId&&platformOwner.value){activeTab.value='playerAudit';auditPlayerId.value=props.initialPlayerId;await nextTick();await auditSelectedPlayer()}})
</script>

<style scoped>
.data-center{padding:24px;max-width:1600px;margin:auto;color:#25332c}.page-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}.page-head h1{font-size:22px;margin:0}.filters{display:flex;flex-wrap:wrap;gap:12px;align-items:end;padding:12px 0 20px}.filters .el-form-item{margin:0;width:190px}.filters .el-form-item:last-of-type{width:300px}.filters .el-select{width:100%}.result-meta{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin:0 0 18px;font-size:14px}.result-meta .el-button{margin-left:auto}.state{padding:24px 16px;text-align:center;color:#68776e}.data-center h2{font-size:16px;margin:24px 0 12px}.player-total{display:flex;gap:24px;flex-wrap:wrap;padding:16px 0;border-bottom:1px solid #e3e9e5}.metric-note,.quality-summary{font-size:13px;color:#68776e}.version{margin-top:20px;font-size:12px;color:#68776e}.version dl{display:grid;grid-template-columns:90px 1fr;gap:8px}.version dd{margin:0;overflow-wrap:anywhere}.transfer-actions{display:flex;gap:10px;margin:8px 0 20px}.el-pagination{margin-top:16px}.data-center :deep(.el-dialog .el-select){width:100%}@media(max-width:640px){.data-center{padding:16px}.filters .el-form-item,.filters .el-form-item:last-of-type{width:100%}.result-meta{gap:8px}.result-meta .el-button{margin-left:0}.player-total{gap:12px}.transfer-actions{flex-wrap:wrap}}
.player-audit-filters .el-form-item{width:min(520px,100%)}.audit-queue-head{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:8px 0 12px}.audit-queue-head>div{display:flex;align-items:center;gap:14px;flex-wrap:wrap}.audit-queue-head small{font-size:12px;color:#718078}.audit-search-row{display:flex;align-items:center;gap:14px;margin:4px 0 12px;color:#718078;font-size:12px}.audit-search{max-width:420px}.manual-audit-toggle{margin:14px 0}.data-center :deep(.el-table .el-tag){margin:2px 4px 2px 0}.audit-missing,.audit-coverage{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:14px 0}.audit-missing strong{margin-right:4px}.audit-coverage{font-size:13px;color:#56655c;border-bottom:1px solid #e3e9e5}.audit-coverage span{padding-right:12px;border-right:1px solid #dce5df}.audit-coverage span:last-child{border-right:0}.audit-issues{margin-top:16px}
.issue-hint{display:block;margin-top:4px;color:#68776e;font-size:12px;line-height:1.5}.quality-id{overflow-wrap:anywhere;color:#56655c;font-size:12px}
</style>

<style scoped>
.data-center.embedded{padding:0;max-width:none;margin:0;width:100%;min-width:0}.data-center{font-size:14px}.filters{display:grid;grid-template-columns:repeat(4,minmax(160px,1fr));gap:16px;align-items:end;padding:16px 0 20px}.filters .el-form-item,.filters .el-form-item:last-of-type{width:auto;min-width:0}.filters :deep(.el-date-editor){width:100%}.filters>.el-button{justify-self:start;margin:0}.result-meta{padding:12px 0;border-top:1px solid #e3e9e5;margin:0 0 16px}.state{min-height:72px;display:flex;align-items:center;justify-content:center}.audit-queue-head{padding:16px 0;border-bottom:1px solid #e3e9e5}.manual-audit-toggle{margin:16px 0 8px}.player-audit-filters{grid-template-columns:minmax(260px,520px) auto;justify-content:start}.player-audit-filters .el-form-item{width:100%}.audit-missing,.audit-coverage{padding:12px 0}.version{margin-top:16px}.data-center :deep(.el-tabs__item){height:44px;font-size:14px}.data-center :deep(.el-table){width:100%}.data-center :deep(.el-table__cell){padding:12px 0}@media(max-width:1100px){.filters{grid-template-columns:repeat(2,minmax(160px,1fr))}}@media(max-width:620px){.filters,.player-audit-filters{grid-template-columns:1fr}.result-meta{gap:8px}.audit-queue-head{align-items:start}}
</style>
