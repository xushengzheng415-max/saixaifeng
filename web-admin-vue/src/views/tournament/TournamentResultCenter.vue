<template>
  <main class="result-center" v-loading="loading">
    <header class="result-context">
      <div class="result-context-main">
        <span class="result-mark"><el-icon><DataAnalysis /></el-icon></span>
        <div><small>当前赛事</small><strong>{{ dashboard.tournament?.name || '赛事赛果中心' }}</strong></div>
        <el-tag type="success" effect="plain">足球</el-tag>
        <span><el-icon><LocationInformation /></el-icon>{{ dashboard.tournament?.location || '举办地待定' }}</span>
      </div>
      <el-button plain :loading="loading" @click="loadDashboard"><el-icon><Refresh /></el-icon>刷新赛果</el-button>
    </header>

    <section class="result-workspace">
      <header class="result-title">
        <div><span>赛事运营 / 赛果管理</span><h1>赛果、积分排名与赛事战报</h1><p>赛果是唯一事实源；积分、晋级和战报只读取已复核版本，待复核比分仅供后台试算。</p></div>
        <div class="title-actions"><el-button @click="router.push(`/tournaments/${tournamentId}/matches`)" plain>返回比赛管理</el-button><el-button type="success" @click="activeTab='review'">处理待复核</el-button></div>
      </header>

      <section class="result-filters">
        <label><span>竞赛组别</span><el-select v-model="divisionFilter" clearable placeholder="全部组别"><el-option v-for="item in dashboard.divisions || []" :key="item.id" :label="item.name" :value="item.id" /></el-select></label>
        <label><span>比赛日期</span><el-select v-model="dateFilter" clearable placeholder="全部日期"><el-option v-for="date in dateOptions" :key="date" :label="date" :value="date" /></el-select></label>
        <label><span>赛果状态</span><el-select v-model="statusFilter" clearable placeholder="全部状态"><el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></label>
        <el-input v-model="keyword" clearable placeholder="搜索球队或场序" :prefix-icon="Search" />
      </section>

      <section class="result-summary">
        <article><span class="summary-icon neutral"><el-icon><EditPen /></el-icon></span><div><small>待录入</small><strong>{{ filteredSummary.notSubmitted }}</strong><span>场</span></div></article>
        <article><span class="summary-icon orange"><el-icon><Clock /></el-icon></span><div><small>待复核</small><strong>{{ filteredSummary.pendingReview }}</strong><span>场</span></div></article>
        <article><span class="summary-icon red"><el-icon><WarningFilled /></el-icon></span><div><small>异常提醒</small><strong>{{ filteredSummary.warning }}</strong><span>场</span></div></article>
        <article><span class="summary-icon green"><el-icon><CircleCheckFilled /></el-icon></span><div><small>正式赛果</small><strong>{{ filteredSummary.approved }}</strong><span>场</span></div></article>
      </section>

      <el-tabs v-model="activeTab" class="result-tabs">
        <el-tab-pane label="赛果与复核" name="review" />
        <el-tab-pane label="积分排名" name="standings" />
        <el-tab-pane label="淘汰晋级" name="bracket" />
        <el-tab-pane label="赛事战报" name="report" />
      </el-tabs>

      <section v-if="activeTab==='review'" class="review-layout">
        <article class="review-list panel">
          <header><div><h2>比赛赛果</h2><p>{{ reviewScopeLabel }} · 默认按比赛时间升序排列</p></div><span>{{ visibleMatches.length }} 场</span></header>
          <div class="review-list-filters"><label><span>组别</span><el-select v-model="divisionFilter" clearable placeholder="全部组别"><el-option v-for="item in dashboard.divisions || []" :key="item.id" :label="item.name" :value="item.id" /></el-select></label><label><span>日期</span><el-select v-model="dateFilter" clearable placeholder="全部日期"><el-option v-for="date in dateOptions" :key="date" :label="date" :value="date" /></el-select></label></div>
          <div class="result-table-head result-row"><span>场次</span><span>对阵与比分</span><span>时间 / 场地</span><span>来源</span><span>复核状态</span><span>操作</span></div>
          <button v-for="row in visibleMatches" :key="row.id" type="button" class="result-row result-data-row" :class="{ selected:selectedMatch?.id===row.id }" @click="selectedMatchId=row.id">
            <span><b>{{ row.matchNo || '—' }}</b><small>{{ row.divisionName }} · {{ row.reviewStageLabel || row.groupName }}</small></span>
            <span class="versus"><b>{{ row.homeTeamName }}</b><strong>{{ scoreText(row) }}</strong><b>{{ row.awayTeamName }}</b><small v-if="row.resolution==='penalties' || row.resolution==='penalty_shootout'">点球决胜</small></span>
            <span><b>{{ row.matchDate || '日期待定' }} {{ row.matchTime }}</b><small>{{ row.venue }}</small></span>
            <span>{{ row.source }}</span>
            <span><el-tag :type="statusMeta(row.resultStatus).type" effect="light">{{ statusMeta(row.resultStatus).label }}</el-tag><small v-if="row.warnings?.length" class="warning-copy">{{ row.warnings[0] }}</small></span>
            <span class="row-action"><el-button link type="primary" @click.stop="openMatchResult(row)">{{ row.resultStatus==='approved' ? '查看归档' : row.scoreReady ? '进入复核' : '查看比赛' }}</el-button></span>
          </button>
          <el-empty v-if="!visibleMatches.length" description="当前筛选范围暂无比赛" />
        </article>

        <aside class="review-detail panel" v-if="selectedMatch">
          <header><div><small>{{ selectedMatch.matchNo || '比赛' }} · {{ selectedMatch.phaseLabel }}</small><h2>单场赛果详情</h2></div><el-tag :type="statusMeta(selectedMatch.resultStatus).type">{{ statusMeta(selectedMatch.resultStatus).label }}</el-tag></header>
          <section class="detail-score"><div><span class="team-avatar">{{ teamInitial(selectedMatch.homeTeamName) }}</span><b>{{ selectedMatch.homeTeamName }}</b></div><strong><b>{{ selectedMatch.homeScore ?? '—' }}</b><em>:</em><b>{{ selectedMatch.awayScore ?? '—' }}</b><small>{{ resolutionLabel(selectedMatch) }}</small></strong><div><span class="team-avatar">{{ teamInitial(selectedMatch.awayTeamName) }}</span><b>{{ selectedMatch.awayTeamName }}</b></div></section>
          <dl class="detail-grid"><div><dt>比赛时间</dt><dd>{{ selectedMatch.matchDate || '待定' }} {{ selectedMatch.matchTime }}</dd></div><div><dt>比赛场地</dt><dd>{{ selectedMatch.venue }}</dd></div><div><dt>记录来源</dt><dd>{{ selectedMatch.source }}</dd></div><div><dt>积分资格</dt><dd>{{ selectedMatch.standingsEligible ? '计入循环赛积分' : '不计入小组积分' }}</dd></div></dl>
          <section class="review-gate"><h3>发布闸门</h3><div><span>比分结构</span><b :class="selectedMatch.scoreReady?'ok':'wait'">{{ selectedMatch.scoreReady ? '完整' : '待录入' }}</b></div><div><span>项目校验</span><b :class="selectedMatch.warnings?.length?'danger':'ok'">{{ selectedMatch.warnings?.length ? '需处理' : '通过' }}</b></div><div><span>主办方复核</span><b :class="selectedMatch.resultStatus==='approved'?'ok':'wait'">{{ selectedMatch.resultStatus==='approved' ? '已批准' : '未批准' }}</b></div></section>
          <el-alert v-if="selectedMatch.resultCorrection" class="correction-alert" :title="`已异常纠错：${selectedMatch.resultCorrection.reason}`" type="warning" :closable="false" show-icon />
          <el-alert v-if="selectedMatch.warnings?.length" :title="selectedMatch.warnings.join('；')" type="warning" :closable="false" show-icon />
          <footer><el-button v-if="selectedMatch.resultStatus!=='approved'" type="success" :disabled="!selectedMatch.scoreReady" @click="openMatchResult(selectedMatch)">进入赛果复核</el-button><template v-else><el-button type="warning" plain @click="openScoreCorrection(selectedMatch)">异常纠错</el-button><el-button plain @click="openMatchResult(selectedMatch)">查看正式归档</el-button></template></footer>
        </aside>
      </section>

      <section v-else-if="activeTab==='standings'" class="standings-section">
        <header class="section-heading"><div><h2>小组积分排名</h2><p>按竞赛组别和抽签小组分别列榜，正式排名只计入已归档赛果。</p></div><div><el-radio-group v-model="standingsMode"><el-radio-button label="official">正式积分</el-radio-button><el-radio-button label="preview">后台试算</el-radio-button></el-radio-group><el-button type="success" :loading="publishing" @click="publishStandings"><el-icon><Upload /></el-icon>发布积分榜</el-button></div></header>
        <el-alert class="football-rule-alert" type="success" :closable="false" show-icon title="足球排名依次比较：积分 → 相互比赛积分/净胜球/进球数 → 总净胜球 → 总进球 → 红牌少 → 黄牌少 → 抽签；淘汰赛不进入小组积分。" />
        <article v-for="group in visibleStandings" :key="`${group.divisionId}-${group.groupName}`" class="standings-card panel">
          <header><div><h3>{{ group.divisionName }} · {{ group.groupName }}</h3><p v-if="group.pointsRule.drawResolution === 'penalties'">常规胜 {{ group.pointsRule.win }} / 负 {{ group.pointsRule.loss }}；战平点球胜 {{ group.pointsRule.penaltyWin }} / 负 {{ group.pointsRule.penaltyLoss }}（无平局）· {{ group.pointsRule.source }}</p><p v-else>胜 {{ group.pointsRule.win }} 分 / 平 {{ group.pointsRule.draw }} 分 / 负 {{ group.pointsRule.loss }} 分 · {{ group.pointsRule.source }}</p></div><span>{{ group.officialMatchCount }} 场正式赛果<template v-if="standingsMode==='preview' && group.provisionalMatchCount"> · {{ group.provisionalMatchCount }} 场试算</template></span></header>
          <div class="standing-table-wrap"><table><thead><tr><th>排名</th><th>球队</th><th>赛</th><th>胜</th><th v-if="group.pointsRule.drawResolution !== 'penalties'">平</th><th>负</th><th>进球</th><th>失球</th><th>净胜球</th><th>红/黄牌</th><th>积分</th></tr></thead><tbody><tr v-for="team in standingTeams(group)" :key="team.teamId || team.teamName"><td><b class="rank-number">{{ team.rank }}</b></td><td class="team-cell"><img v-if="teamLogoVisible(team)" :src="team.logo" :alt="`${team.teamName}队徽`" @error="markTeamLogoFailed(team)" /><span v-else>{{ teamInitial(team.teamName) }}</span><b>{{ team.teamName }}</b></td><td>{{ team.played }}</td><td>{{ team.win }}</td><td v-if="group.pointsRule.drawResolution !== 'penalties'">{{ team.draw }}</td><td>{{ team.loss }}</td><td>{{ team.goalsFor }}</td><td>{{ team.goalsAgainst }}</td><td :class="{ positive:team.goalDifference>0 }">{{ signed(team.goalDifference) }}</td><td>{{ team.redCards }}/{{ team.yellowCards }}</td><td><strong>{{ team.points }}</strong><small v-if="team.provisionalMatches" class="provisional-tag">试算</small></td></tr></tbody></table></div>
          <el-empty v-if="!standingTeams(group).length" :description="standingsMode==='official' ? '本组暂无已归档赛果' : '本组暂无可试算赛果'" :image-size="70" />
        </article>
        <el-empty v-if="!visibleStandings.length" description="当前范围尚未生成小组赛赛程" />
        <footer class="snapshot-note"><el-icon><Lock /></el-icon><span>发布会生成不可变积分快照；后续赛果变化需重新发布新版本，旧版本保留追溯。</span><b>{{ latestStandingPublication }}</b></footer>
      </section>

      <section v-else-if="activeTab==='bracket'" class="bracket-section">
        <header class="section-heading"><div><h2>淘汰赛与排位晋级</h2><p>淘汰赛平局必须记录加时或点球结果，并明确 winnerTeamId 后才能推进下游。</p></div></header>
        <div class="bracket-grid"><article v-for="row in visibleKnockout" :key="row.id" class="knockout-card" :class="{ ready:row.progressionReady, warning:row.resultStatus==='warning' }"><header><span>{{ row.divisionName }}</span><b>{{ row.roundName || row.phaseLabel }}</b><el-tag :type="row.progressionReady?'success':'warning'" size="small">{{ row.progressionLabel }}</el-tag></header><div><span>{{ row.homeTeamName }}</span><strong>{{ scoreText(row) }}</strong><span>{{ row.awayTeamName }}</span></div><footer><small>{{ row.matchDate || '日期待定' }} · {{ row.venue }}</small><el-button link type="primary" @click="openMatchResult(row)">查看赛果</el-button></footer></article></div>
        <el-empty v-if="!visibleKnockout.length" description="当前范围暂无淘汰赛或排位赛" />
      </section>

      <section v-else class="report-section">
        <header class="section-heading report-heading"><div><h2>赛事战报</h2><p>动态高度 PNG · 日期、时间、组别与正式赛果</p></div><div class="report-controls"><el-select v-model="reportDate" placeholder="选择比赛日"><el-option v-for="date in approvedDateOptions" :key="date" :label="date" :value="date" /></el-select><el-radio-group v-model="reportMode"><el-radio-button label="score-only">纯比分</el-radio-button><el-radio-button label="scorers">比分＋进球球员</el-radio-button></el-radio-group><el-checkbox v-model="reportShowCards" border>红黄牌</el-checkbox><el-radio-group v-model="reportTheme"><el-radio-button label="emerald">绿色</el-radio-button><el-radio-button label="navy">蓝色</el-radio-button><el-radio-button label="paper">白色</el-radio-button></el-radio-group><el-button type="success" :disabled="!reportMatches.length" :loading="exportingReport" @click="exportReportPng"><el-icon><Download /></el-icon>导出PNG战报</el-button></div></header>
        <div class="report-workspace"><article ref="reportPoster" class="report-poster board-poster" :class="[reportTheme, reportMode]"><header class="board-header"><div class="board-tournament-slot"><h2 v-if="dashboard.tournament?.name">{{ dashboard.tournament.name }}</h2></div><p class="board-date">{{ formatReportDate(reportDate) }} · 比赛日</p></header><section class="board-matches"><div v-for="(row,index) in reportMatches" :key="row.id" class="board-match"><div class="board-match-meta"><span>{{ row.matchTime || '时间待定' }}</span><i>·</i><span>{{ row.divisionName || '组别待定' }}</span></div><div class="board-match-main"><div class="board-team home"><div class="board-crest"><img v-if="reportTeamLogo(row,'home')" :src="reportTeamLogo(row,'home')" :alt="`${row.homeTeamName}队徽`" @error="markReportLogoFailed(row,'home')" /><b v-else>{{ teamInitial(row.homeTeamName) }}</b></div><strong>{{ row.homeTeamName }}</strong></div><div class="board-score"><b>{{ row.homeScore ?? '—' }}</b><em>:</em><b>{{ row.awayScore ?? '—' }}</b><small>全场</small></div><div class="board-team away"><strong>{{ row.awayTeamName }}</strong><div class="board-crest"><img v-if="reportTeamLogo(row,'away')" :src="reportTeamLogo(row,'away')" :alt="`${row.awayTeamName}队徽`" @error="markReportLogoFailed(row,'away')" /><b v-else>{{ teamInitial(row.awayTeamName) }}</b></div></div></div><div v-if="reportMode==='scorers'" class="board-scorers"><div><small>主队进球</small><span v-for="event in reportGoalEvents(row,'home')" :key="`${row.id}-home-${event.minute}-${event.playerName}`"><img class="board-goal-icon" :src="reportGoalIcon(event)" :alt="reportGoalIconLabel(event)" />{{ reportGoalPlayerName(event) }} <i>{{ event.minute }}′</i></span><div v-if="reportShowCards && reportCardEvents(row,'home').length" class="board-card-events"><span v-for="event in reportCardEvents(row,'home')" :key="event._id || event.minute + event.playerName"><i class="board-card-chip" :class="cardEventClass(event)"></i>{{ event.playerName || '球员未记录' }} <em>{{ event.minute }}′</em></span></div></div><div><small>客队进球</small><span v-for="event in reportGoalEvents(row,'away')" :key="`${row.id}-away-${event.minute}-${event.playerName}`"><img class="board-goal-icon" :src="reportGoalIcon(event)" :alt="reportGoalIconLabel(event)" />{{ reportGoalPlayerName(event) }} <i>{{ event.minute }}′</i></span><div v-if="reportShowCards && reportCardEvents(row,'away').length" class="board-card-events"><span v-for="event in reportCardEvents(row,'away')" :key="event._id || event.minute + event.playerName"><i class="board-card-chip" :class="cardEventClass(event)"></i>{{ event.playerName || '球员未记录' }} <em>{{ event.minute }}′</em></span></div></div></div></div><div v-if="!reportMatches.length" class="report-empty">当前比赛日暂无已复核赛果</div></section><footer class="board-footer"><span>数据版本：{{ reportVersionText }}</span><b>正式赛果</b></footer></article><aside class="report-guardrail"><h3>战报发布边界</h3><ul><li><el-icon><CircleCheckFilled /></el-icon>仅展示正式批准赛果</li><li><el-icon><CircleCheckFilled /></el-icon>日期标题，不固定轮次</li><li><el-icon><CircleCheckFilled /></el-icon>卡片顶部显示时间与组别</li><li><el-icon><CircleCheckFilled /></el-icon>导出不会修改比赛与积分</li></ul><el-alert type="info" :closable="false" title="待复核、退回和异常比分不会进入正式战报。" /></aside></div>
      </section>
    </section>
    <el-dialog v-model="correctionVisible" title="归档赛果异常纠错" width="500px">
      <el-alert title="原裁判提交和归档记录会保留；本次更正将记录处理人、原因及前后比分。" type="warning" :closable="false" show-icon />
      <el-form label-position="top" class="correction-form">
        <el-form-item label="修正后比分">
          <div class="correction-score-input"><el-input-number v-model="correctionForm.homeScore" :min="0" :max="99" :step="1" controls-position="right" /><b>:</b><el-input-number v-model="correctionForm.awayScore" :min="0" :max="99" :step="1" controls-position="right" /></div>
        </el-form-item>
        <el-form-item label="纠错原因（必填）"><el-input v-model="correctionForm.reason" type="textarea" :rows="4" maxlength="300" show-word-limit placeholder="例如：裁判报告录入时主队进球数填写错误。" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="correctionVisible=false">取消</el-button><el-button type="warning" :loading="correctionSaving" @click="submitScoreCorrection">记录并更正</el-button></template>
    </el-dialog>
  </main>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CircleCheckFilled, Clock, DataAnalysis, Download, EditPen, LocationInformation, Lock, Refresh, Search, Upload, WarningFilled } from '@element-plus/icons-vue'
import { callFunction } from '../../utils/cloud'
import { isGoalEvent, isOwnGoal, isPenaltyMissed, isPenaltyScored, scorerDisplayName } from '../../utils/matchEvent'
import footballEventIcon from '../../assets/report/events/football.svg'
import ownGoalEventIcon from '../../assets/report/events/own-goal.svg'
import penaltyEventIcon from '../../assets/report/events/penalty.svg'
import penaltyMissedEventIcon from '../../assets/report/events/penalty-missed.svg'

const route = useRoute()
const router = useRouter()
const tournamentId = String(route.params.id || '')
const loading = ref(false)
const publishing = ref(false)
const dashboard = ref({ tournament:{}, divisions:[], matches:[], standings:[], knockout:[], publications:[], summary:{} })
const activeTab = ref(String(route.query.tab || 'review'))
const divisionFilter = ref(String(route.query.divisionId || ''))
const dateFilter = ref('')
const statusFilter = ref('')
const keyword = ref('')
const selectedMatchId = ref('')
const standingsMode = ref('official')
const reportDate = ref('')
const reportTheme = ref('emerald')
const reportMode = ref('scorers')
const reportShowCards = ref(false)
const reportPoster = ref(null)
const exportingReport = ref(false)
const failedTeamLogos = ref({})
const failedReportLogos = ref({})
const statusOptions = [{ value:'not_submitted',label:'待录入' },{ value:'pending_review',label:'待复核' },{ value:'warning',label:'异常' },{ value:'returned',label:'已退回' },{ value:'approved',label:'正式赛果' }]

const selectedDivision = computed(() => (dashboard.value.divisions || []).find(item => item.id===divisionFilter.value) || null)
const reviewScopeLabel = computed(() => selectedDivision.value?.name || '全部竞赛组别')
function normalizedDivisionName(value){ return String(value || '').replace(/[\s　]/g,'').toLowerCase() }
function matchesSelectedDivision(row){ return !divisionFilter.value || row.divisionId===divisionFilter.value || Boolean(selectedDivision.value && normalizedDivisionName(row.divisionName)===normalizedDivisionName(selectedDivision.value.name)) }
function reviewStageOrder(row){ return ({group:0,knockout:1,placement:2,other:3}[row.reviewStage] ?? 3) }
function matchSequenceValue(row){ const parts=String(row.matchNo || '').match(/\d+/g) || []; return parts.length?Number(parts.at(-1)):Number.MAX_SAFE_INTEGER }
function scheduleValue(row){
  const rawDate=String(row?.matchDate||'').trim()
  const rawTime=String(row?.matchTime||'').trim()
  const embeddedTime=!rawTime && rawDate.match(/\d{1,2}:\d{2}/)
  if(embeddedTime){
    const embeddedValue=Date.parse(rawDate)
    if(Number.isFinite(embeddedValue))return embeddedValue
  }
  const dateMatch=rawDate.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  const timeMatch=rawTime.match(/(\d{1,2}):(\d{2})/)
  if(dateMatch){
    const date=`${dateMatch[1]}-${dateMatch[2].padStart(2,'0')}-${dateMatch[3].padStart(2,'0')}`
    const time=timeMatch ? `${timeMatch[1].padStart(2,'0')}:${timeMatch[2]}` : '23:59'
    const value=Date.parse(`${date}T${time}:00`)
    if(Number.isFinite(value))return value
  }
  const fallback=Date.parse(rawDate)
  return Number.isFinite(fallback)?fallback:Number.MAX_SAFE_INTEGER
}
function compareReviewRows(a,b){ return scheduleValue(a)-scheduleValue(b)||reviewStageOrder(a)-reviewStageOrder(b)||matchSequenceValue(a)-matchSequenceValue(b)||String(a.id||'').localeCompare(String(b.id||'')) }
const filteredByScope = computed(() => (dashboard.value.matches || []).filter(row => matchesSelectedDivision(row) && (!dateFilter.value || row.matchDate===dateFilter.value)))
const visibleMatches = computed(() => filteredByScope.value.filter(row => (!statusFilter.value || row.resultStatus===statusFilter.value) && (!keyword.value.trim() || `${row.matchNo} ${row.homeTeamName} ${row.awayTeamName}`.toLowerCase().includes(keyword.value.trim().toLowerCase()))).sort(compareReviewRows))
const selectedMatch = computed(() => visibleMatches.value.find(row => row.id===selectedMatchId.value) || visibleMatches.value[0] || null)
const dateOptions = computed(() => [...new Set((dashboard.value.matches || []).map(row => row.matchDate).filter(Boolean))].sort())
const approvedDateOptions = computed(() => [...new Set((dashboard.value.matches || []).filter(row => row.resultStatus==='approved').map(row => row.matchDate).filter(Boolean))].sort())
const filteredSummary = computed(() => visibleMatches.value.reduce((sum,row)=>{ if(row.resultStatus==='not_submitted')sum.notSubmitted++; else if(row.resultStatus==='pending_review')sum.pendingReview++; else if(row.resultStatus==='approved')sum.approved++; else sum.warning++; return sum },{notSubmitted:0,pendingReview:0,warning:0,approved:0}))
const visibleStandings = computed(() => (dashboard.value.standings || []).filter(item => !divisionFilter.value || item.divisionId===divisionFilter.value).sort((a,b)=>String(a.divisionName||'').localeCompare(String(b.divisionName||''),'zh-CN',{numeric:true})||String(a.groupName||'').localeCompare(String(b.groupName||''),'zh-CN',{numeric:true})))
const visibleKnockout = computed(() => (dashboard.value.knockout || []).filter(item => (!divisionFilter.value || item.divisionId===divisionFilter.value) && (!dateFilter.value || item.matchDate===dateFilter.value)))
const reportEvents = computed(() => Array.isArray(dashboard.value.events) ? dashboard.value.events : [])
const reportMatches = computed(() => (dashboard.value.matches || []).filter(row => row.resultStatus==='approved' && (!divisionFilter.value || row.divisionId===divisionFilter.value) && (!reportDate.value || row.matchDate===reportDate.value)).map(row => ({ ...row, events: Array.isArray(row.events) ? row.events : reportEvents.value.filter(event => String(event.matchId || event.match_id || '') === String(row.id)) })))
const latestStandingPublication = computed(() => { const item=(dashboard.value.publications || []).find(row=>row.type==='standings'&&(!divisionFilter.value||row.divisionId===divisionFilter.value));return item?`最新发布 V${item.version}`:'尚未发布正式快照' })
const reportVersionText = computed(() => latestStandingPublication.value==='尚未发布正式快照' ? `赛果读取 ${formatDate(dashboard.value.generatedAt)}` : latestStandingPublication.value)

function statusMeta(status){ return ({not_submitted:{label:'待录入',type:'info'},pending_review:{label:'待复核',type:'warning'},warning:{label:'异常',type:'danger'},returned:{label:'已退回',type:'warning'},approved:{label:'正式赛果',type:'success'}}[status]||{label:'待处理',type:'info'}) }
function scoreText(row){ return row.scoreReady ? `${row.homeScore} : ${row.awayScore}` : 'VS' }
function teamInitial(name){ return Array.from(name || '队')[0] || '队' }
function signed(value){ return Number(value)>0?`+${value}`:String(value||0) }
function standingTeams(group){ return standingsMode.value==='preview' ? group.previewTeams || [] : group.officialTeams || [] }
function teamIdentityKey(team){ return String(team?.teamId || team?.teamName || '') }
function teamLogoVisible(team){ return Boolean(team?.logo && !failedTeamLogos.value[teamIdentityKey(team)]) }
function markTeamLogoFailed(team){ failedTeamLogos.value={...failedTeamLogos.value,[teamIdentityKey(team)]:true} }
function reportLogoKey(row, side){ return `${row?.id || 'match'}:${side}` }
function reportTeamLogo(row, side){ const key=reportLogoKey(row,side); if(failedReportLogos.value[key])return''; return side==='home' ? (row?.homeTeamLogo || '') : (row?.awayTeamLogo || '') }
function markReportLogoFailed(row, side){ failedReportLogos.value={...failedReportLogos.value,[reportLogoKey(row,side)]:true} }
function isReportGoalEvent(event){ return isGoalEvent(event) || isPenaltyMissed(event) }
function reportGoalEvents(row, side){ const teamId=side==='home'?row?.homeTeamId:row?.awayTeamId; const teamName=side==='home'?row?.homeTeamName:row?.awayTeamName; return (Array.isArray(row?.events)?row.events:[]).filter(event=>isReportGoalEvent(event) && (event.teamSide===side || (teamId && String(event.teamId||'')===String(teamId)) || (teamName && String(event.teamName||'')===String(teamName)))).map(event=>({...event,playerName:scorerDisplayName(event)})).sort((a,b)=>Number(a.minute||0)-Number(b.minute||0)) }
function reportGoalPlayerName(event){ return isPenaltyMissed(event) ? `${event.playerName || '球员未记录'}（点球未进）` : (event.playerName || '球员未记录') }
function reportGoalIcon(event){ if(isPenaltyMissed(event))return penaltyMissedEventIcon; if(isOwnGoal(event))return ownGoalEventIcon; if(isPenaltyScored(event))return penaltyEventIcon; return footballEventIcon }
function reportGoalIconLabel(event){ if(isPenaltyMissed(event))return'点球未进'; if(isOwnGoal(event))return'乌龙球'; if(isPenaltyScored(event))return'点球'; return'进球' }
function cardEventKind(event){ const raw=event?.type ?? event?.eventType ?? event?.cardType ?? event?.card_type ?? ''; const type=String(raw||'').trim().toLowerCase().replace(/[\s-]+/g,'_'); if(['second_yellow','second_yellow_card','second_yellow_red','yellow_red','yellow_red_card','two_yellow'].includes(type)||event?.secondYellow===true||event?.isSecondYellow===true)return'yellow-red'; if(['red_card','red','redcard'].includes(type))return'red'; if(['yellow_card','yellow','yellowcard'].includes(type))return'yellow'; return'' }
function reportCardEvents(row, side){ const teamId=side==='home'?row?.homeTeamId:row?.awayTeamId; const teamName=side==='home'?row?.homeTeamName:row?.awayTeamName; return (Array.isArray(row?.events)?row.events:[]).filter(event=>cardEventKind(event) && (event.teamSide===side || (teamId && String(event.teamId||'')===String(teamId)) || (teamName && String(event.teamName||'')===String(teamName)))).sort((a,b)=>Number(a.minute||0)-Number(b.minute||0)) }
function cardEventClass(event){ return cardEventKind(event)||'yellow' }
function resolutionLabel(row){ return ({regular_time:'常规时间',extra_time:'加时赛',penalties:'点球大战',penalty_shootout:'点球大战',walkover:'弃权判定'}[row.resolution] || (row.scoreReady?'正式比分待复核':'尚未录入')) }
function formatDate(value){ if(!value)return'—';const date=new Date(value);return Number.isNaN(date.getTime())?String(value):date.toLocaleString('zh-CN',{hour12:false}).replaceAll('/','-') }
function formatReportDate(value){ const text=String(value || '').slice(0,10); return text ? text.replaceAll('-','.') : '比赛日期待定' }
function openMatchResult(row){ const suffix=row.resultStatus==='approved'?'/archive':row.scoreReady?'/review':'';router.push({path:`/tournaments/${tournamentId}/match/${row.id}${suffix}`,query:row.divisionId?{divisionId:row.divisionId}:{}}) }

async function loadDashboard(){ loading.value=true;try{const result=await callFunction('resultCenter',{action:'dashboard',tournamentId});if(!result?.success)throw new Error(result?.message||result?.error||'赛果中心加载失败');dashboard.value=result;if(!selectedMatchId.value&&result.matches?.length)selectedMatchId.value=[...result.matches].sort(compareReviewRows)[0]?.id||'';if(!reportDate.value)reportDate.value=(result.matches||[]).filter(row=>row.resultStatus==='approved').map(row=>row.matchDate).filter(Boolean).sort().at(-1)||''}catch(error){ElMessage.error(error.message||'赛果中心加载失败')}finally{loading.value=false} }
const correctionVisible = ref(false)
const correctionSaving = ref(false)
const correctionForm = ref({ matchId:'', homeScore:0, awayScore:0, reason:'' })
function openScoreCorrection(row){
  if(!row || row.resultStatus!=='approved') return ElMessage.warning('只有已归档的正式赛果可以异常纠错')
  correctionForm.value={ matchId:row.id, homeScore:Number(row.homeScore ?? 0), awayScore:Number(row.awayScore ?? 0), reason:'' }
  correctionVisible.value=true
}
async function submitScoreCorrection(){
  const form=correctionForm.value
  if(!Number.isInteger(Number(form.homeScore))||!Number.isInteger(Number(form.awayScore))||Number(form.homeScore)<0||Number(form.homeScore)>99||Number(form.awayScore)<0||Number(form.awayScore)>99)return ElMessage.warning('请输入0至99之间的整数比分')
  if(!String(form.reason||'').trim())return ElMessage.warning('请填写比分更正原因')
  try{
    await ElMessageBox.confirm(`将比分更正为 ${form.homeScore} : ${form.awayScore}，并保留当前归档记录。确认继续？`,'确认异常纠错',{type:'warning',confirmButtonText:'确认更正',cancelButtonText:'取消'})
    correctionSaving.value=true
    const result=await callFunction('resultCenter',{action:'correctArchivedScore',tournamentId,matchId:form.matchId,homeScore:Number(form.homeScore),awayScore:Number(form.awayScore),reason:String(form.reason).trim()})
    if(!result?.success)throw new Error(result?.message||result?.error||'比分更正失败')
    correctionVisible.value=false
    ElMessage.success(result.message||'比分已更正')
    await loadDashboard()
  }catch(error){if(error!=='cancel'&&error!=='close')ElMessage.error(error.message||'比分更正失败')}finally{correctionSaving.value=false}
}
async function publishStandings(){try{await ElMessageBox.confirm('发布将生成不可变积分榜快照；待复核比分不会进入正式榜单。确认继续？','发布正式积分榜',{type:'warning',confirmButtonText:'生成发布快照',cancelButtonText:'取消'});publishing.value=true;const result=await callFunction('resultCenter',{action:'publishStandings',tournamentId,divisionId:divisionFilter.value});if(!result?.success)throw new Error(result?.message||'发布失败');ElMessage.success(result.message);await loadDashboard()}catch(error){if(error!=='cancel'&&error!=='close')ElMessage.error(error.message||'发布失败')}finally{publishing.value=false} }
async function printReport(){await nextTick();if(!reportPoster.value)return;const popup=window.open('','_blank','width=760,height=1140');if(!popup)return ElMessage.warning('浏览器拦截了打印窗口，请允许弹窗后重试');popup.document.write(`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>足球赛事战报</title><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#eef2ef;font-family:Arial,"Microsoft YaHei",sans-serif}.report-poster{width:1080px;min-height:1620px;margin:auto;padding:76px 70px 50px;border-radius:24px;color:#fff;background:#064b2b url('/admin/images/report/emerald-stadium-v1.png') center/cover no-repeat}.report-poster.navy{background-color:#071b4e;background-image:url('/admin/images/report/navy-broadcast-v1.png')}.report-poster.paper{color:#10213f;background-color:#fff;background-image:url('/admin/images/report/paper-cobalt-v1.png');border:1px solid #dbe5f2}.poster-header{text-align:center}.poster-brand{display:flex;align-items:center;justify-content:center;gap:10px;font-size:15px;letter-spacing:.16em}.poster-brand-mark{display:grid;width:36px;height:36px;place-items:center;border:1px solid currentColor;border-radius:50%;font-size:12px;font-weight:800;letter-spacing:0}.poster-kicker{margin:28px 0 12px;font-size:14px;letter-spacing:.18em;opacity:.75}.poster-header h2{margin:0;font-size:42px;line-height:1.25}.poster-date{margin:16px 0 0;font-size:16px;opacity:.78}.poster-date i{font-style:normal;margin:0 8px}.poster-matches{margin-top:48px}.poster-match{padding:24px 0;border-top:1px solid rgba(255,255,255,.23)}.paper .poster-match{border-color:#cbd9eb}.poster-match-meta{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px;font-size:13px;opacity:.72}.poster-match-meta>span{font-size:18px;font-weight:800;letter-spacing:.08em}.poster-scoreline{display:grid;grid-template-columns:1fr 230px 1fr;align-items:center;gap:18px}.poster-team{display:flex;align-items:center;gap:16px;min-width:0;font-size:22px;font-weight:800}.poster-team.away{justify-content:flex-end;text-align:right}.poster-crest{display:grid;width:68px;height:68px;flex:none;place-items:center;border:1px solid rgba(255,255,255,.44);border-radius:18px;background:rgba(255,255,255,.12)}.paper .poster-crest{border-color:#c2d1e4;background:#f3f7fc}.poster-crest img{width:54px;height:54px;object-fit:contain}.poster-crest b{font-size:27px}.poster-score-block{display:grid;grid-template-columns:1fr 20px 1fr;align-items:center;text-align:center}.poster-score-block b{font-size:56px;line-height:1}.poster-score-block em{font-size:34px;font-style:normal;opacity:.75}.poster-score-block small{grid-column:1/-1;margin-top:10px;font-size:12px;opacity:.68}.poster-scorers{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:18px 0 0;padding:13px 16px;border-radius:12px;background:rgba(0,0,0,.18);font-size:13px}.paper .poster-scorers{background:rgba(25,82,143,.08)}.poster-scorers>div{display:grid;gap:5px}.poster-scorers>div:last-child{text-align:right}.poster-scorers small{font-size:11px;opacity:.68}.poster-scorers span{font-weight:650}.poster-scorers i{margin-left:4px;font-style:normal;opacity:.78}.poster-scorers .muted{opacity:.58}.poster-footer{display:flex;justify-content:space-between;gap:20px;margin-top:38px;padding-top:17px;border-top:1px solid rgba(255,255,255,.25);font-size:12px;opacity:.72}.paper .poster-footer{border-color:#cbd9eb}@page{size:1080px 1620px;margin:0}@media print{body{padding:0;background:#fff}.report-poster{width:1080px;min-height:1620px;border-radius:0}}</style></head><body>${reportPoster.value.outerHTML}<script>setTimeout(()=>window.print(),300)<\/script></body></html>`);popup.document.close()}

async function exportReportPng(){
  if(!reportPoster.value||exportingReport.value)return
  exportingReport.value=true
  try{
    await nextTick()
    const html2canvas=(await import('html2canvas')).default
    const target=reportPoster.value
    const rect=target.getBoundingClientRect()
    const posterWidth=Math.ceil(target.clientWidth||rect.width)
    const posterHeight=Math.ceil(target.scrollHeight)
    const canvas=await html2canvas(target,{scale:2,useCORS:true,allowTaint:false,backgroundColor:null,logging:false,imageTimeout:15000,width:posterWidth,height:posterHeight,windowWidth:Math.max(window.innerWidth,1280),windowHeight:Math.max(window.innerHeight,posterHeight),onclone:(doc)=>{const cloned=doc.querySelector('.board-poster');if(cloned){cloned.style.width=`${posterWidth}px`;cloned.style.height='auto';cloned.style.minHeight='0';cloned.style.overflow='visible';cloned.querySelectorAll('.board-match-main').forEach((el)=>{el.style.width='100%';el.style.maxWidth='100%';el.style.gridTemplateColumns='minmax(0,1fr) 108px minmax(0,1fr)' });cloned.querySelectorAll('.board-team').forEach((el)=>{el.style.minWidth='0';el.style.maxWidth='100%'});cloned.querySelectorAll('.board-team strong').forEach((el)=>{el.style.minWidth='0';el.style.maxWidth='100%';el.style.overflowWrap='anywhere';el.style.wordBreak='break-all'})}}})
    const safeName=String(dashboard.value.tournament?.name||'足球赛事').replace(/[\\/:*?"<>|]/g,'-')
    const modeName=reportMode.value==='scorers'?'比分与进球球员':'比分'
    const cardName=reportShowCards.value?'-含红黄牌':''
    const link=document.createElement('a')
    link.download=`${safeName}-${reportDate.value||'比赛日'}-${modeName}${cardName}战报.png`
    link.href=canvas.toDataURL('image/png',1)
    document.body.appendChild(link)
    link.click()
    link.remove()
    ElMessage.success('PNG战报已导出')
  }catch(error){ElMessage.error(error.message||'PNG战报导出失败')}
  finally{exportingReport.value=false}
}

watch(activeTab,value=>router.replace({query:{...route.query,tab:value}}))
watch(divisionFilter,value=>router.replace({query:{...route.query,divisionId:value||undefined}}))
watch(visibleMatches,rows=>{if(rows.length&&!rows.some(row=>row.id===selectedMatchId.value))selectedMatchId.value=rows[0].id})
onMounted(loadDashboard)
</script>

<style scoped>
.result-center{min-height:100%;padding:0 30px 38px;background:#f7f9f7;color:#18251d;--result-green:#087b3f;--result-dark:#06351f}.result-context{display:flex;align-items:center;justify-content:space-between;min-height:80px;margin:0 -30px;padding:0 30px;border-bottom:1px solid #e1e7e3;background:#fff}.result-context-main{display:flex;align-items:center;gap:16px}.result-context-main>div{display:flex;flex-direction:column;gap:3px}.result-context-main small{color:#7a867e}.result-context-main strong{font-size:21px}.result-context-main>span:last-child{display:flex;align-items:center;gap:6px;color:#657269}.result-mark{display:grid;width:43px;height:43px;place-items:center;border-radius:10px;background:#e7f6ec;color:#087c40;font-size:24px}.result-workspace{max-width:1560px;margin:0 auto}.result-title{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;padding:25px 0 18px}.result-title>div>span{color:#118247;font-size:13px;font-weight:700}.result-title h1{margin:7px 0 6px;font-size:31px}.result-title p{margin:0;color:#68766d}.title-actions{display:flex;gap:10px}.result-filters{display:grid;grid-template-columns:220px 180px 180px minmax(240px,1fr);gap:12px;padding:14px 16px;border:1px solid #e0e7e2;border-radius:10px;background:#fff}.result-filters label{display:flex;align-items:center;gap:9px}.result-filters label>span{flex:none;color:#66736a;font-size:13px}.result-filters :deep(.el-select){flex:1}.result-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:15px;margin:16px 0}.result-summary article{display:flex;align-items:center;gap:16px;min-height:88px;padding:0 20px;border:1px solid #e0e6e2;border-radius:10px;background:#fff}.summary-icon{display:grid!important;width:48px;height:48px;place-items:center;border-radius:50%;font-size:24px}.summary-icon.neutral{color:#66736c;background:#eff2f0}.summary-icon.orange{color:#e68111;background:#fff2df}.summary-icon.red{color:#db443c;background:#ffefee}.summary-icon.green{color:#078142;background:#e5f6eb}.result-summary small{display:block;color:#66736b;font-size:13px}.result-summary strong{margin-right:4px;font-size:29px}.result-summary article div>span{color:#77837b;font-size:12px}.result-tabs{margin-top:6px}.result-tabs :deep(.el-tabs__header){margin:0}.result-tabs :deep(.el-tabs__nav-wrap){padding:0 14px;border:1px solid #e0e7e2;border-radius:10px 10px 0 0;background:#fff}.result-tabs :deep(.el-tabs__item){height:52px;padding:0 30px;font-weight:650}.result-tabs :deep(.el-tabs__item.is-active){color:#08763d}.result-tabs :deep(.el-tabs__active-bar){height:3px;background:#078443}.panel{border:1px solid #e0e6e2;border-radius:10px;background:#fff}.review-layout{display:grid;grid-template-columns:minmax(780px,1.7fr) minmax(310px,.68fr);gap:16px;margin-top:16px}.review-list{overflow:hidden}.review-list>header,.review-detail>header,.standings-card>header{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:17px 20px;border-bottom:1px solid #e8ece9}.review-list h2,.review-detail h2,.standings-card h3{margin:0;font-size:18px}.review-list p,.standings-card p{margin:4px 0 0;color:#7b877f;font-size:12px}.review-list>header>span{padding:5px 10px;border-radius:99px;color:#087d41;background:#e8f7ed;font-size:12px}.result-row{display:grid;grid-template-columns:112px minmax(250px,1.5fr) minmax(150px,.9fr) 118px 135px 86px;align-items:center;gap:12px;width:100%;padding:0 15px;text-align:left}.result-table-head{height:43px;color:#657269;background:#f7f9f7;font-size:12px}.result-data-row{min-height:70px;border:0;border-top:1px solid #edf0ee;background:#fff;color:#26342b;cursor:pointer}.result-data-row:hover,.result-data-row.selected{background:#f2faf5}.result-data-row.selected{box-shadow:inset 3px 0 #078443}.result-data-row span{min-width:0}.result-data-row b,.result-data-row small{display:block}.result-data-row small{margin-top:4px;color:#7b8780;font-size:11px}.versus{display:grid!important;grid-template-columns:1fr 64px 1fr;align-items:center;gap:7px}.versus>b:last-of-type{text-align:right}.versus strong{text-align:center;font-size:18px}.versus small{grid-column:1/-1;text-align:center;color:#bd7012}.warning-copy{color:#c35034!important;line-height:1.3}.row-action{text-align:right}.review-detail{align-self:start;position:sticky;top:15px;overflow:hidden}.review-detail>header small{color:#718078}.detail-score{display:grid;grid-template-columns:1fr 105px 1fr;align-items:center;gap:12px;padding:24px 18px;text-align:center}.detail-score>div{display:grid;justify-items:center;gap:8px}.team-avatar,.team-cell span{display:grid;width:42px;height:42px;place-items:center;border-radius:50%;color:#087840;background:#e4f5ea;font-weight:800}.detail-score>strong{display:grid;grid-template-columns:1fr 10px 1fr;align-items:center}.detail-score>strong b{font-size:30px}.detail-score>strong em{font-style:normal}.detail-score>strong small{grid-column:1/-1;margin-top:7px;color:#7c887f;font-size:10px;font-weight:400}.detail-grid{display:grid;grid-template-columns:1fr 1fr;margin:0;padding:0 18px}.detail-grid div{padding:12px 0;border-top:1px solid #edf0ee}.detail-grid dt{color:#7a867e;font-size:11px}.detail-grid dd{margin:5px 0 0;font-size:13px}.review-gate{margin:15px 18px;padding:14px;border-radius:8px;background:#f7faf8}.review-gate h3{margin:0 0 8px;font-size:14px}.review-gate div{display:flex;justify-content:space-between;padding:7px 0;color:#69766d;font-size:12px}.review-gate b.ok{color:#078142}.review-gate b.wait{color:#c67b15}.review-gate b.danger{color:#d6473e}.review-detail>.el-alert{margin:0 18px}.review-detail>footer{padding:17px 18px;text-align:right}.section-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin:18px 0 14px}.section-heading h2{margin:0 0 5px;font-size:23px}.section-heading p{margin:0;color:#6d7a72}.section-heading>div:last-child{display:flex;align-items:center;gap:10px}.football-rule-alert{margin-bottom:14px}.standings-card{overflow:hidden;margin-bottom:14px}.standings-card>header>span{color:#bc7216;font-size:12px}.standing-table-wrap{overflow:auto}.standings-card table{width:100%;min-width:900px;border-collapse:collapse}.standings-card th,.standings-card td{height:50px;padding:0 13px;border-bottom:1px solid #edf0ee;text-align:center}.standings-card th{height:42px;color:#607067;background:#f7f9f7;font-size:12px}.standings-card th:nth-child(2),.standings-card td:nth-child(2){text-align:left}.rank-number{display:inline-grid;width:25px;height:25px;place-items:center;border-radius:50%;background:#f0f3f1}.team-cell{display:flex;align-items:center;gap:9px}.team-cell span{display:inline-grid;width:30px;height:30px}.positive{color:#078443;font-weight:700}.standings-card td:last-child strong{font-size:19px}.provisional-tag{margin-left:6px;padding:2px 5px;border-radius:4px;color:#b96a0b;background:#fff1dc;font-size:9px}.snapshot-note{display:flex;align-items:center;gap:9px;padding:14px 16px;border:1px solid #dce8df;border-radius:8px;color:#5b6b60;background:#f4faf6;font-size:13px}.snapshot-note b{margin-left:auto;color:#087b40}.bracket-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.knockout-card{overflow:hidden;border:1px solid #dfe6e1;border-radius:10px;background:#fff}.knockout-card.ready{border-top:3px solid #078443}.knockout-card.warning{border-top:3px solid #d84e45}.knockout-card header{display:grid;grid-template-columns:1fr auto;gap:5px;padding:14px 16px;border-bottom:1px solid #ebefec}.knockout-card header>span{color:#7b877f;font-size:11px}.knockout-card header>b{grid-column:1;font-size:15px}.knockout-card header>.el-tag{grid-column:2;grid-row:1/3;align-self:center}.knockout-card>div{display:grid;grid-template-columns:1fr 80px 1fr;align-items:center;gap:8px;padding:25px 16px;text-align:center}.knockout-card>div strong{font-size:22px}.knockout-card footer{display:flex;align-items:center;justify-content:space-between;padding:10px 15px;border-top:1px solid #edf0ee;color:#77837b}.report-workspace{display:grid;grid-template-columns:minmax(620px,1.35fr) minmax(260px,.5fr);gap:18px}.report-poster{overflow:hidden;min-height:620px;padding:36px;border-radius:16px;color:#fff;background:radial-gradient(circle at 90% 10%,#2ba36355,transparent 26%),linear-gradient(145deg,#04351f,#087a42 62%,#034329);box-shadow:0 18px 45px rgba(9,56,33,.18)}.report-poster.paper{color:#17251b;background:#fff;border:1px solid #dfe7e1}.report-poster.night{color:#fff;background:radial-gradient(circle at 85% 15%,#1c694155,transparent 27%),linear-gradient(145deg,#111a17,#182c23)}.report-poster>header{text-align:center;padding-bottom:24px;border-bottom:1px solid rgba(255,255,255,.23)}.report-poster.paper>header{border-color:#e2e8e4}.report-poster>header small{letter-spacing:.15em}.report-poster h2{margin:13px 0 8px;font-size:30px}.report-poster>header p{margin:0;opacity:.75}.report-match{display:grid;grid-template-columns:34px 1fr 104px 1fr;align-items:center;gap:13px;padding:18px 0;border-bottom:1px solid rgba(255,255,255,.17)}.report-poster.paper .report-match{border-color:#e9edea}.report-match>b{opacity:.55}.report-match>span:last-of-type{text-align:right}.report-match>strong{text-align:center;font-size:23px}.report-match em{font-style:normal;opacity:.55}.report-match small{grid-column:2/5;text-align:center;opacity:.62}.report-empty{padding:100px 0;text-align:center;opacity:.65}.report-poster>footer{display:flex;justify-content:space-between;padding-top:26px;font-size:12px;opacity:.72}.report-workspace>aside{align-self:start;padding:22px;border:1px solid #e0e7e2;border-radius:10px;background:#fff}.report-workspace>aside h3{margin:0 0 16px}.report-workspace>aside ul{display:grid;gap:13px;margin:0 0 20px;padding:0;list-style:none}.report-workspace>aside li{display:flex;align-items:center;gap:8px;color:#526158}.report-workspace>aside li .el-icon{color:#078443}.report-section .section-heading :deep(.el-select){width:150px}@media(max-width:1180px){.review-layout,.report-workspace{grid-template-columns:1fr}.review-detail{position:static}.bracket-grid{grid-template-columns:1fr 1fr}.result-filters{grid-template-columns:1fr 1fr}.result-row{grid-template-columns:90px 1.4fr 1fr 115px 85px}.result-row>:nth-child(4){display:none}}@media(max-width:760px){.result-center{padding:0 14px 28px}.result-context{margin:0 -14px;padding:12px 14px}.result-context-main>span:last-child,.result-context .el-button{display:none}.result-title{align-items:flex-start;flex-direction:column}.result-title h1{font-size:26px}.result-filters,.result-summary{grid-template-columns:1fr 1fr}.result-summary article{padding:0 12px}.result-tabs :deep(.el-tabs__item){padding:0 12px}.result-table-head{display:none}.result-row{grid-template-columns:70px 1fr 80px}.result-row>:nth-child(3),.result-row>:nth-child(4),.result-row>:nth-child(5){display:none}.bracket-grid{grid-template-columns:1fr}.section-heading,.section-heading>div:last-child{align-items:flex-start;flex-direction:column}.report-poster{padding:24px}.report-match{grid-template-columns:28px 1fr 78px 1fr}}
.standings-card th{font-size:14px}.standings-card td{font-size:16px}.team-cell img{width:38px;height:38px;object-fit:contain}.team-cell b{font-size:18px}.team-cell span{width:38px;height:38px;font-size:16px}.rank-number{font-size:16px}.standings-card td:last-child strong{font-size:22px}
.review-list-filters{display:flex;gap:12px;padding:12px 15px;border-bottom:1px solid #e8ece9;background:#fbfcfb}.review-list-filters label{display:flex;align-items:center;gap:8px;color:#657269;font-size:12px}.review-list-filters .el-select{width:180px}.review-list-filters label:first-child .el-select{width:220px}
.review-detail>.el-alert{margin:0 18px}.correction-alert{margin:0 18px 12px}.review-detail>footer{display:flex;justify-content:flex-end;gap:8px;padding:17px 18px;text-align:right}.correction-form{margin-top:18px}.correction-score-input{display:flex;align-items:center;gap:14px}.correction-score-input .el-input-number{width:150px}
.report-heading{align-items:flex-start}.report-controls{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:9px}.report-controls :deep(.el-select){width:150px}.report-workspace{grid-template-columns:minmax(620px,1fr) 280px;align-items:start}.portrait-poster{width:min(100%,620px);min-height:930px;aspect-ratio:2/3;margin:0 auto;padding:42px 36px 25px;border-radius:18px;background:#064b2b url('/admin/images/report/emerald-stadium-v1.png') center/cover no-repeat;box-shadow:0 22px 50px rgba(10,55,31,.22)}.portrait-poster.navy{background-color:#071b4e;background-image:url('/admin/images/report/navy-broadcast-v1.png')}.portrait-poster.paper{color:#10213f;background-color:#fff;background-image:url('/admin/images/report/paper-cobalt-v1.png');border:1px solid #dbe5f2;box-shadow:0 22px 50px rgba(25,66,122,.14)}.poster-header{text-align:center}.poster-brand{display:flex;align-items:center;justify-content:center;gap:8px;font-size:11px;letter-spacing:.14em}.poster-brand-mark{display:grid;width:29px;height:29px;place-items:center;border:1px solid currentColor;border-radius:50%;font-size:10px;font-weight:800;letter-spacing:0}.poster-kicker{margin:21px 0 8px;font-size:10px;letter-spacing:.16em;opacity:.78}.poster-header h2{margin:0;font-size:25px;line-height:1.28}.poster-date{margin:10px 0 0;font-size:12px;opacity:.78}.poster-date i{font-style:normal;margin:0 5px}.poster-matches{margin-top:30px}.poster-match{padding:17px 0;border-top:1px solid rgba(255,255,255,.24)}.paper .poster-match{border-color:#cbd9eb}.poster-match-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;font-size:10px;opacity:.75}.poster-match-meta>span{font-size:12px;font-weight:800;letter-spacing:.08em}.poster-scoreline{display:grid;grid-template-columns:1fr 100px 1fr;align-items:center;gap:9px}.poster-team{display:flex;align-items:center;gap:8px;min-width:0;font-size:14px;font-weight:800}.poster-team.away{justify-content:flex-end;text-align:right}.poster-crest{display:grid;width:39px;height:39px;flex:none;place-items:center;border:1px solid rgba(255,255,255,.48);border-radius:11px;background:rgba(255,255,255,.13)}.paper .poster-crest{border-color:#c2d1e4;background:#f3f7fc}.poster-crest img{width:31px;height:31px;object-fit:contain}.poster-crest b{font-size:17px}.poster-score-block{display:grid;grid-template-columns:1fr 12px 1fr;align-items:center;text-align:center}.poster-score-block b{font-size:32px;line-height:1}.poster-score-block em{font-size:20px;font-style:normal;opacity:.75}.poster-score-block small{grid-column:1/-1;margin-top:5px;font-size:9px;opacity:.7}.poster-scorers{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:11px 0 0;padding:9px 10px;border-radius:9px;background:rgba(0,0,0,.19);font-size:10px}.paper .poster-scorers{background:rgba(25,82,143,.08)}.poster-scorers>div{display:grid;gap:4px}.poster-scorers>div:last-child{text-align:right}.poster-scorers small{font-size:9px;opacity:.68}.poster-scorers span{font-weight:650}.poster-scorers i{margin-left:3px;font-style:normal;opacity:.78}.poster-scorers .muted{opacity:.58}.poster-footer{display:flex;justify-content:space-between;gap:10px;margin-top:24px;padding-top:11px;border-top:1px solid rgba(255,255,255,.25);font-size:9px;opacity:.72}.paper .poster-footer{border-color:#cbd9eb}.report-guardrail{align-self:start}.report-guardrail :deep(.el-alert){margin-top:18px}.report-section{min-width:0}@media(max-width:1180px){.report-workspace{grid-template-columns:1fr}.report-guardrail{max-width:620px;margin:0 auto}.report-controls{justify-content:flex-start}}@media(max-width:760px){.report-heading{gap:12px}.report-controls{align-items:flex-start;flex-direction:column}.report-controls :deep(.el-select),.report-controls :deep(.el-radio-group),.report-controls :deep(.el-button){width:100%}.report-controls :deep(.el-radio-group){display:flex}.report-controls :deep(.el-radio-button){flex:1}.report-controls :deep(.el-radio-button__inner){width:100%;padding:10px 6px}.portrait-poster{width:100%;min-height:0;padding:32px 22px 20px}.poster-header h2{font-size:22px}.poster-scoreline{grid-template-columns:1fr 88px 1fr}.poster-team{font-size:12px}.poster-crest{width:34px;height:34px}.poster-crest img{width:27px;height:27px}.poster-score-block b{font-size:28px}}
</style>
<style scoped>
/* 红黄牌明细逐条纵向排列，保持与进球明细一致。 */
.board-card-events{flex-direction:column;align-items:flex-start;gap:3px}
.board-scorers>div:last-child .board-card-events{align-items:flex-end}
</style>
<style scoped>
/* 主客队进球明细各自从顶部向下排列，避免短列表被网格拉伸到中间。 */
.board-scorers{align-items:start}
.board-scorers>div{align-content:start;grid-auto-rows:max-content}
</style>
<style scoped>
/* 进球使用足球图标，牌面使用提供的黄牌、红牌和黄红牌图标。 */
.board-scorers>div>span{display:flex;align-items:center;gap:4px}
.board-scorers>div:last-child>span{justify-content:flex-end}
.board-scorers>div>span::before{display:none}
.board-goal-icon{width:13px;height:13px;flex:none;object-fit:contain}
.board-card-chip{width:11px!important;height:15px!important;border:0;border-radius:0;box-shadow:none!important;background-color:transparent!important;background-position:center;background-repeat:no-repeat;background-size:contain;filter:drop-shadow(0 0 1px rgba(0,0,0,.72))}
.board-card-chip.yellow{background-image:url('../../assets/report/events/yellow-card.svg')!important}
.board-card-chip.yellow{background-color:#f2c94c!important;border:1px solid rgba(63,52,0,.7)!important}
.board-card-chip.red{background-image:url('../../assets/report/events/red-card.svg')!important}
.board-card-chip.red{background-color:#d81e06!important;border:1px solid rgba(55,0,0,.7)!important}
.board-card-chip.yellow-red{background-image:url('../../assets/report/events/yellow-red-card.svg')!important}
.board-card-chip.yellow-red{width:14px!important;height:18px!important}
</style>
<style scoped>
/* 赛事战报卡片顶部的时间与组别是识别比赛的关键信息。 */
.board-match-meta>span{font-size:15px;font-weight:800}
@media(max-width:760px){.board-match-meta>span{font-size:14px}}
</style>
<style scoped>
.board-poster{background-image:url('../../assets/report/flat-blue-v1.png')!important}
.board-poster.emerald{background-image:url('../../assets/report/flat-green-v1.png')!important}
.board-poster.paper{background-image:url('../../assets/report/flat-white-v2.png')!important}
.board-poster.emerald .board-score{border:0!important;background:#123f2b!important;clip-path:polygon(8px 0,calc(100% - 8px) 0,100% 8px,100% calc(100% - 8px),calc(100% - 8px) 100%,8px 100%,0 calc(100% - 8px),0 8px)!important;box-shadow:inset 0 0 0 1px #d8bc70!important}
.board-footer{display:grid!important;grid-template-columns:1fr auto!important;align-items:end!important;min-height:88px!important;margin-top:24px!important;padding:18px 6px 20px!important}
.board-footer::before{content:'赛事数据由赛小蜂足球提供';grid-column:1/-1;justify-self:center;min-height:36px;padding-left:126px;background:url('../../assets/logo-saixiaofeng.png') left center/112px auto no-repeat;font-size:11px;font-weight:700;line-height:36px;letter-spacing:.04em;opacity:.92}
.board-footer>span,.board-footer>b{font-size:9px;opacity:.72}
.board-poster{height:auto!important;min-height:0!important;aspect-ratio:auto!important;overflow:hidden!important;padding-bottom:28px!important}
.board-poster.scorers .board-match{padding-bottom:10px!important;margin-bottom:7px!important}
.board-poster.scorers .board-scorers{gap:5px!important;margin-top:4px!important;padding:4px 8px!important;line-height:1.2!important}
.board-poster.scorers .board-scorers>div{gap:1px!important}
.board-poster.scorers .board-scorers span{line-height:1.2!important}
.board-team{overflow:hidden}
.board-match-main{width:100%;min-width:0}
.board-team{max-width:100%}
.board-team strong{min-width:0;overflow:hidden;white-space:normal;overflow-wrap:anywhere;word-break:break-all;line-height:1.25}
.board-footer>span,.board-footer>b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.board-card-events{display:flex;flex-wrap:wrap;gap:3px 7px;margin-top:3px}
.board-scorers>div:last-child .board-card-events{justify-content:flex-end}
.board-card-events span{display:inline-flex;align-items:center;gap:4px;font-size:9px;line-height:1.2}
.board-card-events em{font-style:normal;opacity:.8}
.board-card-chip{display:inline-block;width:7px;height:10px;flex:none;border-radius:1px;box-shadow:0 0 0 1px rgba(255,255,255,.24)}
.board-card-chip.yellow{background:#f2c52d}.board-card-chip.red{background:#d93b32}
</style>
<style scoped>
.portrait-poster.paper .poster-header{padding:12px 10px;background:rgba(255,255,255,.82);border-radius:12px}
</style>
<style scoped>
.board-poster{width:min(100%,620px);min-height:930px;aspect-ratio:2/3;margin:0 auto;padding:28px 28px 20px;border-radius:14px;color:#fff;background:#0b326b url('/admin/images/report/flat-blue-v1.png') center/cover no-repeat;box-shadow:0 18px 42px rgba(6,37,79,.18);overflow:hidden}.board-poster.emerald{background-color:#0d4b2d;background-image:url('/admin/images/report/flat-green-v1.png')}.board-poster.paper{color:#14284d;background-color:#f7f5ee;background-image:url('/admin/images/report/flat-white-v2.png');border:1px solid #dbe2e8;box-shadow:0 18px 42px rgba(34,51,72,.12)}.board-header{min-height:124px;text-align:center}.board-tournament-slot{min-height:76px;display:grid;place-items:center;padding:4px 10px}.board-tournament-slot h2{margin:0;font-size:25px;line-height:1.25;font-weight:750;letter-spacing:.04em}.board-date{margin:8px 0 0;font-size:13px;letter-spacing:.12em;opacity:.82}.board-matches{margin-top:10px}.board-match{padding:0 0 16px;margin-bottom:12px;border-bottom:1px solid rgba(255,255,255,.28)}.board-poster.paper .board-match{border-color:#bfcfe0}.board-match-meta{display:flex;justify-content:center;align-items:center;gap:7px;min-height:22px;margin-bottom:4px;font-size:11px;letter-spacing:.08em;font-weight:700}.board-match-meta i{font-style:normal;opacity:.64}.board-match-main{display:grid;grid-template-columns:1fr 108px 1fr;align-items:center;gap:8px;min-height:70px}.board-team{display:flex;align-items:center;gap:8px;min-width:0;padding:8px 9px;border:1px solid rgba(255,255,255,.72);background:rgba(255,255,255,.92);color:#0d3368;clip-path:polygon(0 0,96% 0,100% 50%,96% 100%,0 100%);font-size:14px;font-weight:800}.board-team.away{justify-content:flex-end;text-align:right;clip-path:polygon(4% 0,100% 0,100% 100%,4% 100%,0 50%)}.board-poster.emerald .board-team{border-color:#d8bc70;background:rgba(13,65,40,.52);color:#fff4d5;clip-path:none}.board-poster.emerald .board-team.away{clip-path:none}.board-poster.paper .board-team{border-color:#1853a3;background:rgba(255,255,255,.74);color:#133c78}.board-crest{display:grid;width:40px;height:40px;flex:none;place-items:center;border:2px solid #fff;border-radius:50%;background:#f9fbff;overflow:hidden}.board-poster.emerald .board-crest{border-color:#d8bc70;background:#0b4a2d}.board-poster.paper .board-crest{border-color:#1853a3}.board-crest img{width:33px;height:33px;object-fit:contain}.board-crest b{font-size:17px}.board-score{display:grid;grid-template-columns:1fr 13px 1fr;align-items:center;min-height:70px;padding:8px 8px;text-align:center;background:#075acb;color:#fff;clip-path:polygon(10% 0,90% 0,100% 50%,90% 100%,10% 100%,0 50%)}.board-poster.emerald .board-score{background:#123f2b;border:1px solid #d8bc70;color:#fff4d5}.board-poster.paper .board-score{background:#1853a3;color:#fff}.board-score b{font-size:27px;line-height:1}.board-score em{font-style:normal;font-size:18px;opacity:.8}.board-score small{grid-column:1/-1;margin-top:3px;font-size:9px;opacity:.82}.board-scorers{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:8px 4px 0;padding:7px 9px;border-top:1px solid rgba(255,255,255,.3);font-size:10px}.board-poster.paper .board-scorers{border-color:#bfcfe0}.board-scorers>div{display:grid;gap:3px}.board-scorers>div:last-child{text-align:right}.board-scorers small{font-size:9px;opacity:.75}.board-scorers span{font-weight:650}.board-scorers i{font-style:normal;margin-left:3px;opacity:.8}.board-scorers .muted{opacity:.58}.board-footer{display:flex;justify-content:space-between;gap:10px;margin-top:15px;padding-top:10px;border-top:1px solid rgba(255,255,255,.32);font-size:9px;opacity:.72}.board-poster.paper .board-footer{border-color:#bfcfe0}.board-poster.score-only .board-match{padding-bottom:13px;margin-bottom:10px}.board-poster.score-only .board-match-main{min-height:64px}.board-poster.score-only .board-score{min-height:64px}@media(max-width:760px){.board-poster{width:100%;min-height:0;padding:23px 18px 16px}.board-header{min-height:110px}.board-tournament-slot{min-height:65px}.board-tournament-slot h2{font-size:21px}.board-date{font-size:11px}.board-match-main{grid-template-columns:1fr 92px 1fr}.board-team{font-size:12px;padding:6px}.board-crest{width:34px;height:34px}.board-crest img{width:28px;height:28px}.board-score{min-height:62px}.board-score b{font-size:23px}}
</style>
