<template>
  <main class="match-management" v-loading="loading">
    <section class="match-context">
      <div class="event-context-main">
        <span class="event-mark"><el-icon><Trophy /></el-icon></span>
        <strong>{{ tournament.name || '当前赛事' }}</strong>
        <el-tag type="primary" effect="plain">{{ divisions.length }} 个组别</el-tag>
        <el-tag type="success" effect="plain">进行中</el-tag>
        <span><el-icon><Calendar /></el-icon>{{ eventDateText }}</span>
        <span><el-icon><LocationInformation /></el-icon>{{ tournament.province || tournament.location || '举办地待定' }}</span>
      </div>
      <el-button plain @click="router.push('/tournament-space')">返回赛事空间</el-button>
    </section>

    <header v-if="!selectedDivision" class="match-heading">
      <h1>比赛管理<span v-if="selectedDivision"> / {{ selectedDivision.name }}</span></h1>

    </header>

    <section v-if="!selectedDivision" class="division-entry">
      <el-alert title="各组别运行模式已锁定；进入后仅展示并管理该组别已授权的比赛。" type="info" :closable="false" show-icon />
      <nav class="division-filters" aria-label="比赛状态筛选">
        <button v-for="item in filterOptions" :key="item.key" type="button" :class="{ active: filter === item.key }" @click="filter = item.key">{{ item.label }} <b>{{ item.count }}</b></button>
      </nav>
      <div class="division-columns"><span>组别</span><span>运行模式</span><span>赛制</span><span>比赛数量 / 进度</span><span>关键待办</span><span>操作</span></div>
      <section class="division-list">
        <article v-for="row in filteredRows" :key="row.id" :class="{ professional: row.professional }">
          <div class="division-title"><el-icon><UserFilled /></el-icon><strong>{{ row.name }}</strong></div>
          <div class="mode-cell"><el-tag :type="row.professional ? 'warning' : 'success'" effect="plain">{{ row.professional ? '专业版' : '基础版' }}</el-tag><span v-if="row.professional" class="pro-badge"><b>PRO</b> 专业版 · 已开通</span></div>
          <div class="format-cell"><el-icon><Trophy /></el-icon><span>{{ row.format }}</span></div>
          <div class="progress-cell"><strong>{{ row.total }}场</strong><p>{{ row.progressText }}</p><el-progress :percentage="row.progress" :show-text="false" :stroke-width="7" /></div>
          <div class="todo-cell"><template v-for="todo in row.todos" :key="todo.label"><span :class="todo.type"><el-icon><component :is="todo.icon" /></el-icon>{{ todo.label }}</span></template><span v-if="!row.todos.length" class="muted"><el-icon><CircleCheckFilled /></el-icon>{{ row.statusText }}</span></div>
          <el-button :type="row.professional ? 'warning' : 'success'" class="enter-button" @click="enterDivision(row)">{{ row.professional ? '进入专业比赛管理' : '进入比赛管理' }}<el-icon><ArrowRight /></el-icon></el-button>
        </article>
      </section>
      <p class="entry-note">运行模式在赛事与赛程确认前确定，进入比赛管理后不可更改。</p>
      <el-empty v-if="!filteredRows.length" description="当前筛选下没有可访问的组别" />
    </section>

    <section v-else class="division-workspace">
      <header class="workspace-header"><div><h2>比赛管理 / {{ selectedDivision.name }}</h2><p>查看{{ selectedDivision.name }}比赛状态、裁判执行进度与赛后归档</p></div><el-button plain class="back-button" @click="backToDivisions"><el-icon><ArrowLeft /></el-icon>返回选择组别</el-button></header>
      <el-alert class="workspace-alert" title="裁判通过服务号轻量入口现场记分；主办方在PC端查看、提醒、复核和归档。" type="info" :closable="false" show-icon />
      <section class="match-stats"><article v-for="item in statCards" :key="item.label"><el-icon :class="item.tone"><component :is="item.icon" /></el-icon><div><span>{{ item.label }}</span><strong :class="item.tone">{{ item.value }}</strong></div></article></section>
      <section class="match-controls">
        <nav class="division-filters compact" aria-label="当前组别比赛筛选"><button v-for="item in selectedFilterOptions" :key="item.key" type="button" :class="{ active: selectedFilter === item.key }" @click="selectedFilter = item.key">{{ item.label }} <b>{{ item.count }}</b></button></nav>
        <div class="match-toolbox"><el-button plain><el-icon><Calendar /></el-icon>选择日期</el-button><el-select v-model="venueFilter" placeholder="全部场地" class="venue-select"><el-option label="全部场地" value="" /><el-option label="1号场" value="1号场" /><el-option label="2号场" value="2号场" /><el-option label="3号场" value="3号场" /></el-select><el-input v-model="matchSearch" placeholder="搜索球队或场序" class="match-search"><template #prefix><el-icon><Search /></el-icon></template></el-input><el-button type="success" plain class="export-button" @click="exportMatches"><el-icon><Download /></el-icon>导出{{ selectedDivision.name }}比赛档案</el-button></div>
      </section>
      <section class="match-table">
        <el-alert v-if="selectedDivision.professional" title="专业模式使用已核验名单、比赛阵容与官方电子记录；赛后复核通过后同步进入归档。" type="info" :closable="false" show-icon />
        <div class="match-grid match-grid-head"><span>场序</span><span>比赛时间 / 场地</span><span>对阵与比分</span><span>比赛状态</span><span>{{ selectedDivision.professional ? '名单 / 阵容' : '裁判执行' }}</span><span>{{ selectedDivision.professional ? '电子记录' : '赛后状态' }}</span><span>操作</span></div>
        <article v-for="row in visibleMatches" :key="row._id" class="match-grid match-grid-row">
          <strong>{{ row.matchSequence || row.sequence || '—' }}</strong>
          <span class="time-cell">{{ displayDate(row.matchDate) }} {{ row.matchTime || '待定' }}<small>{{ row.venue || '场地待定' }}</small></span>
          <span class="versus-cell"><b>{{ row.homeTeamName || '待定' }}</b><strong>{{ scoreText(row) }}</strong><b>{{ row.awayTeamName || '待定' }}</b></span>
          <span class="status-cell" :class="matchStatus(row).key"><i></i>{{ matchStatus(row).label }}</span>
          <span class="referee-cell" :class="selectedDivision.professional ? rosterInfo(row).tone : executionInfo(row).tone"><el-icon><component :is="selectedDivision.professional ? rosterInfo(row).icon : executionInfo(row).icon" /></el-icon>{{ selectedDivision.professional ? rosterInfo(row).label : executionInfo(row).label }}</span>
          <span class="post-cell" :class="selectedDivision.professional ? electronicRecordInfo(row).tone : postInfo(row).tone"><el-icon><component :is="selectedDivision.professional ? electronicRecordInfo(row).icon : postInfo(row).icon" /></el-icon>{{ selectedDivision.professional ? electronicRecordInfo(row).label : postInfo(row).label }}</span>
          <span class="action-cell"><el-button v-for="action in rowActions(row)" :key="action.label" size="small" :class="action.className" :type="action.type" @click="performMatchAction(row, action.action)">{{ action.label }}</el-button></span>
        </article>
        <el-empty v-if="!visibleMatches.length" description="当前组别尚无符合筛选的比赛" />
      </section>
      <footer class="match-footer"><el-alert title="PC端默认只监控裁判现场数据；比赛结束后由主办方复核、补录或归档。" type="info" :closable="false" show-icon /><el-pagination background layout="prev, pager, next, sizes" :total="divisionMatches.length" :page-size="10" :pager-count="5" /></footer>
    </section>

    <el-dialog v-model="assignmentVisible" title="快捷指派裁判" width="600px" :close-on-click-modal="false">
      <section class="assignment-match-summary">
        <div><small>比赛场次</small><strong>{{ assignmentMatch.matchSequence || assignmentMatch.sequence || '—' }}</strong></div>
        <div class="assignment-versus"><b>{{ assignmentMatch.homeTeamName || '主队待定' }}</b><span>VS</span><b>{{ assignmentMatch.awayTeamName || '客队待定' }}</b></div>
        <div><small>时间 / 场地</small><strong>{{ displayDate(assignmentMatch.matchDate) }} {{ assignmentMatch.matchTime || '待定' }} · {{ assignmentMatch.venue || '场地待定' }}</strong></div>
      </section>
      <el-alert class="assignment-alert" :title="`${assignmentFormatLabel}需完整指派4人；同一裁判可执法多场比赛，仅同日期同时间的场次不可重复指派。`" type="info" :closable="false" show-icon />
      <el-form v-loading="refereeLoading" label-position="top" class="assignment-form">
        <el-form-item v-for="role in assignmentRoles" :key="role.key" :label="role.label" required>
          <el-select v-model="assignmentForm[role.key]" filterable :placeholder="`选择${role.label}`">
            <el-option v-for="referee in assignableReferees" :key="referee._id" :label="refereeOptionLabel(referee)" :value="referee._id" :disabled="refereeUsedByOtherRole(referee._id, role.key) || refereeHasTimeConflict(referee._id)" />
          </el-select>
        </el-form-item>
        <el-form-item label="操作负责人" required class="operator-field">
          <el-select v-model="assignmentForm.operationRefereeId" placeholder="从本场裁判组中选择">
            <el-option v-for="referee in selectedCrewReferees" :key="referee._id" :label="referee.name || referee.realName" :value="referee._id" />
          </el-select>
          <small>负责开始比赛、记录事件、结束比赛并提交裁判报告。</small>
        </el-form-item>
      </el-form>
      <el-empty v-if="!refereeLoading && !assignableReferees.length" description="当前赛事暂无可指派裁判"><el-button type="success" plain @click="goToRefereeManagement">前往裁判管理</el-button></el-empty>
      <template #footer><el-button @click="assignmentVisible=false">取消</el-button><el-button type="success" :loading="assignmentSaving" :disabled="!assignableReferees.length" @click="saveQuickAssignment">确认指派</el-button></template>
    </el-dialog>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, ArrowRight, Bell, Calendar, CircleCheckFilled, Clock, DocumentChecked, Download, EditPen, FolderChecked, InfoFilled, LocationInformation, Monitor, Search, Trophy, UserFilled, WarningFilled } from '@element-plus/icons-vue'
import { callFunction, queryById, queryList } from '../../utils/cloud'

const route = useRoute()
const router = useRouter()
const hashQuery = new URLSearchParams(window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '')
const tournamentId = route.params.id || window.location.hash.match(/\/tournaments\/([^/?]+)/)?.[1] || ''
const visualQaSnapshot = import.meta.env.DEV && window.__sxfVisualQaSnapshot?.tournament?._id === tournamentId ? window.__sxfVisualQaSnapshot : null
const loading = ref(false)
const filter = ref('all')
const selectedFilter = ref('all')
const matchSearch = ref('')
const venueFilter = ref('')
const divisions = ref(visualQaSnapshot?.divisions || [])
const matches = ref(visualQaSnapshot?.matches || [])
const tournament = ref(visualQaSnapshot?.tournament || {})
const assignmentVisible = ref(false)
const assignmentSaving = ref(false)
const refereeLoading = ref(false)
const assignmentMatch = ref({})
const refereeRows = ref([])
const assignmentForm = ref({ operationRefereeId:'' })
const selectedDivisionId = computed(() => String(route.query.divisionId || hashQuery.get('divisionId') || ''))

const qaMetrics = {
  'U8组': { completed: 12, pending: 2, active: 0, statusText: '待录入赛果', todos: [{ type:'warning', label:'待录入赛果 2场', icon:WarningFilled }] },
  'U10组': { completed: 0, pending: 2, active: 0, statusText: '待录入赛果', todos: [{ type:'warning', label:'待录入赛果 2场', icon:WarningFilled }] },
  'U12组': { completed: 19, pending: 0, active: 0, statusText: '已完成', todos: [] },
  'U14组': { completed: 0, pending: 0, active: 0, statusText: '尚未开始', todos: [{ type:'muted', label:'尚未开始', icon:InfoFilled }] },
  'U16组': { completed: 0, pending: 1, active: 2, statusText: '进行中', todos: [{ type:'warning', label:'进行中 2场', icon:WarningFilled }, { type:'info', label:'待复核 1场', icon:InfoFilled }] }
}

const rows = computed(() => divisions.value.map((division, index) => {
  const id = String(division._id || division.id)
  const list = matches.value.filter(match => String(match.divisionId || '') === id)
  const defaultCompleted = list.filter(match => ['completed', 'archived', 'finished'].includes(String(match.status || '').toLowerCase())).length
  const defaultPending = list.filter(match => ['pending_result', 'pending_review', 'awaiting_result'].includes(String(match.status || '').toLowerCase())).length
  const defaultActive = list.filter(match => ['live', 'in_progress', 'playing'].includes(String(match.status || '').toLowerCase())).length
  const qa = visualQaSnapshot ? qaMetrics[division.name || division.divisionName] : null
  const completed = qa?.completed ?? defaultCompleted
  const pending = qa?.pending ?? defaultPending
  const active = qa?.active ?? defaultActive
  const professional = Boolean(division.professionalMode) || (!visualQaSnapshot && ['professional', 'pro'].includes(String(division.mode || division.version || '').toLowerCase()))
  const total = list.length
  const progress = total ? Math.min(100, Math.round((completed + active) / total * 100)) : 0
  const statusText = qa?.statusText || (active ? '进行中' : pending ? '待录入赛果' : completed === total && total ? '已完成' : '尚未开始')
  const todos = qa?.todos || (pending ? [{ type:'warning', label:`待处理 ${pending}场`, icon:WarningFilled }] : active ? [{ type:'warning', label:`进行中 ${active}场`, icon:WarningFilled }] : [])
  const formatValue = String(division.formatType || division.tournamentType || division.competitionFormat || '').trim()
  const formatMap = { tournament:'赛会制', cup:'杯赛制', league:'联赛制', hybrid:'混合制', round_robin:'循环赛制', knockout:'淘汰赛制' }
  const format = formatMap[formatValue.toLowerCase()] || (/^[\u4e00-\u9fff]/.test(formatValue) ? formatValue : '赛制待设置')
  return { id, name:division.name || division.divisionName || `组别 ${index + 1}`, format, total, completed, pending, active, professional, progress, statusText, todos, progressText: active ? `进行中 ${active}场 · 待复核 ${pending}场` : completed ? `已完成${completed}场` : pending ? '赛程已生成' : '尚未开始' }
}))

const selectedDivision = computed(() => rows.value.find(row => row.id === selectedDivisionId.value))
const activeCount = computed(() => rows.value.filter(row => row.active).length)
const pendingCount = computed(() => rows.value.reduce((total, row) => total + row.pending, 0))
const doneCount = computed(() => rows.value.filter(row => row.total && row.completed === row.total).length)
const filterOptions = computed(() => [{ key:'all', label:'全部', count:rows.value.length }, { key:'active', label:'进行中', count:activeCount.value }, { key:'pending', label:'待录入', count:pendingCount.value }, { key:'done', label:'已完成', count:doneCount.value }])
const filteredRows = computed(() => rows.value.filter(row => filter.value === 'all' || filter.value === 'active' && row.active || filter.value === 'pending' && row.pending || filter.value === 'done' && row.total && row.completed === row.total))
const divisionMatches = computed(() => selectedDivision.value ? matches.value.filter(item => String(item.divisionId || '') === selectedDivision.value.id) : [])
const todayMatchCount = computed(() => { const today = new Date().toISOString().slice(0, 10); return divisionMatches.value.filter(item => String(item.matchDate || '').slice(0, 10) === today).length })
const divisionActiveCount = computed(() => divisionMatches.value.filter(item => matchStatus(item).key === 'active').length)
const divisionPendingCount = computed(() => divisionMatches.value.filter(item => matchStatus(item).key === 'pending').length)
const selectedFilterOptions = computed(() => visualQaSnapshot && selectedDivision.value?.name === 'U8组'
  ? [{ key:'all', label:'全部', count:16 }, { key:'scheduled', label:'待开始', count:2 }, { key:'active', label:'进行中', count:1 }, { key:'review', label:'待复核', count:1 }, { key:'post', label:'待归档', count:1 }, { key:'done', label:'已归档', count:11 }]
  : visualQaSnapshot && selectedDivision.value?.name === 'U16组'
    ? [{ key:'all', label:'全部', count:13 }, { key:'scheduled', label:'待开始', count:4 }, { key:'active', label:'进行中', count:2 }, { key:'review', label:'待复核', count:1 }, { key:'done', label:'已完成', count:6 }]
  : [{ key:'all', label:'全部', count:divisionMatches.value.length }, { key:'scheduled', label:'待开始', count:divisionMatches.value.filter(item => matchStatus(item).key === 'pending').length }, { key:'active', label:'进行中', count:divisionActiveCount.value }, { key:'review', label:'待复核', count:divisionMatches.value.filter(item => item.refereeReviewStatus === 'under_review' || item.status === 'pending_review').length }, { key:'post', label:'待归档', count:divisionMatches.value.filter(item => matchStatus(item).key === 'done' && item.refereeReviewStatus !== 'archived').length }, { key:'done', label:'已归档', count:divisionMatches.value.filter(item => item.refereeReviewStatus === 'archived' || item.status === 'archived').length }])
const eventDateText = computed(() => { const short = value => { if (!value) return ''; const date = new Date(value?.$date || value); return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}` }; const start = short(tournament.value.startDate || tournament.value.eventStartDate); const end = short(tournament.value.endDate || tournament.value.eventEndDate); return start && end ? `${start}—${end}` : start || end || '日期待定' })
const filteredDivisionMatches = computed(() => divisionMatches.value.filter(row => selectedFilter.value === 'all' || selectedFilter.value === 'active' && matchStatus(row).key === 'active' || selectedFilter.value === 'scheduled' && matchStatus(row).key === 'pending' || selectedFilter.value === 'review' && (row.refereeReviewStatus === 'under_review' || row.status === 'pending_review') || selectedFilter.value === 'post' && matchStatus(row).key === 'done' && row.refereeReviewStatus !== 'archived' || selectedFilter.value === 'done' && (row.refereeReviewStatus === 'archived' || row.status === 'archived')))
const qaVisibleMatches = computed(() => {
  if (!visualQaSnapshot) return []
  const records = divisionMatches.value.slice(0, 5)
  if (selectedDivision.value?.name === 'U16组') {
    const display = [
      { matchSequence:'U16-013', matchDate:'2026-07-29', matchTime:'10:30', venue:'1号场', homeTeamName:'郑州劲风', awayTeamName:'洛阳龙门', homeScore:1, awayScore:0, status:'live', rosterState:'双方名单已核验', recordState:'事件记录 8 条' },
      { matchSequence:'U16-012', matchDate:'2026-07-29', matchTime:'09:00', venue:'2号场', homeTeamName:'开封精英', awayTeamName:'新乡雄狮', homeScore:2, awayScore:2, status:'live', rosterState:'双方阵容已确认', recordState:'事件记录 11 条' },
      { matchSequence:'U16-011', matchDate:'2026-07-28', matchTime:'16:00', venue:'1号场', homeTeamName:'安阳竞技', awayTeamName:'许昌联队', homeScore:3, awayScore:1, status:'completed', refereeReviewStatus:'under_review', rosterState:'名单完整', recordState:'电子记录待复核' },
      { matchSequence:'U16-010', matchDate:'2026-07-28', matchTime:'14:30', venue:'3号场', homeTeamName:'郑州劲风', awayTeamName:'开封精英', homeScore:2, awayScore:0, status:'archived', refereeReviewStatus:'archived', rosterState:'名单完整', recordState:'电子记录已归档' },
      { matchSequence:'U16-009', matchDate:'2026-07-28', matchTime:'09:00', venue:'2号场', homeTeamName:'平顶山飞扬', awayTeamName:'焦作山阳', status:'scheduled', rosterState:'名单待提交', recordState:'无电子记录' }
    ]
    return display.map((item, index) => ({ ...(records[index] || {}), ...item, _id: records[index]?._id || `qa-u16-display-${index}` }))
  }
  if (selectedDivision.value?.name !== 'U8组') return []
  const display = [
    { matchSequence:'U8-013', matchDate:'2026-07-29', matchTime:'09:00', venue:'1号场', homeTeamName:'郑州青训A队', awayTeamName:'洛阳星火', homeScore:1, awayScore:0, status:'live', executionState:'recording', postState:'unfinished' },
    { matchSequence:'U8-014', matchDate:'2026-07-29', matchTime:'13:30', venue:'2号场', homeTeamName:'安阳绿茵', awayTeamName:'许昌少年', status:'scheduled', executionState:'assigned', postState:'await_match' },
    { matchSequence:'U8-012', matchDate:'2026-07-29', matchTime:'16:30', venue:'2号场', homeTeamName:'开封少年队', awayTeamName:'新乡未来', homeScore:2, awayScore:1, status:'completed', executionState:'submitted', postState:'review' },
    { matchSequence:'U8-011', matchDate:'2026-07-28', matchTime:'15:00', venue:'1号场', homeTeamName:'安阳绿茵', awayTeamName:'许昌少年', homeScore:1, awayScore:1, status:'completed', executionState:'not_recorded', postState:'supplement' },
    { matchSequence:'U8-010', matchDate:'2026-07-27', matchTime:'16:00', venue:'3号场', homeTeamName:'郑州青训A队', awayTeamName:'开封少年队', homeScore:3, awayScore:0, status:'archived', executionState:'submitted', postState:'archived', refereeReviewStatus:'archived' }
  ]
  return display.map((item, index) => ({ ...(records[index] || {}), ...item, _id: records[index]?._id || `qa-u8-display-${index}` }))
})
const visibleMatches = computed(() => {
  const source = qaVisibleMatches.value.length ? qaVisibleMatches.value : filteredDivisionMatches.value
  const keyword = matchSearch.value.trim().toLowerCase()
  return source.filter(row => (!venueFilter.value || String(row.venue || '').includes(venueFilter.value)) && (!keyword || [row.matchSequence, row.homeTeamName, row.awayTeamName].some(value => String(value || '').toLowerCase().includes(keyword))))
})
const statCards = computed(() => {
  const qa = visualQaSnapshot && selectedDivision.value?.name === 'U8组'
  const proQa = visualQaSnapshot && selectedDivision.value?.name === 'U16组'
  return [
    { label:'全部比赛', value:qa ? 16 : proQa ? 13 : divisionMatches.value.length, icon:Calendar, tone:'green' },
    { label:'今日比赛', value:qa ? 4 : proQa ? 4 : todayMatchCount.value, icon:Clock, tone:'green' },
    { label:'进行中', value:qa ? 1 : proQa ? 2 : divisionActiveCount.value, icon:Monitor, tone:'green' },
    { label:proQa ? '待复核' : '待处理', value:qa ? 2 : proQa ? 1 : divisionPendingCount.value, icon:FolderChecked, tone:'orange' }
  ]
})
const assignmentFormat = computed(() => assignmentMatch.value.matchFormat || divisions.value.find(item => String(item._id || item.id) === String(assignmentMatch.value.divisionId || selectedDivisionId.value))?.matchFormat || '11side')
const assignmentFormatLabel = computed(() => `${String(assignmentFormat.value).match(/\d+/)?.[0] || '11'}人制`)
const assignmentRoles = computed(() => /^(5|6)/.test(String(assignmentFormat.value)) ? [{key:'mainReferee',label:'主裁判'},{key:'secondReferee',label:'第二裁判'},{key:'thirdReferee',label:'第三裁判'},{key:'timekeeper',label:'计时员'}] : [{key:'mainReferee',label:'主裁判'},{key:'assistant1',label:'第一助理裁判'},{key:'assistant2',label:'第二助理裁判'},{key:'fourthOfficial',label:'第四官员'}])
const assignableReferees = computed(() => refereeRows.value.filter(item => String(item.tournamentId || '') === String(tournamentId) && (item.synthetic === true || item.status === 'approved' && item.canOperate !== false)))
const selectedCrewReferees = computed(() => { const ids=assignmentRoles.value.map(role=>assignmentForm.value[role.key]).filter(Boolean);return assignableReferees.value.filter(item=>ids.includes(item._id)) })
const conflictingRefereeIds = computed(() => {
  const current = assignmentMatch.value || {}
  const date = String(current.matchDate || '').slice(0, 10)
  const time = String(current.matchTime || '')
  if (!date || !time) return new Set()
  const ids = new Set()
  matches.value.forEach(match => {
    if (String(match._id || '') === String(current._id || '')) return
    if (['cancelled', 'canceled', 'postponed'].includes(String(match.status || '').toLowerCase())) return
    if (String(match.matchDate || '').slice(0, 10) !== date || String(match.matchTime || '') !== time) return
    Object.values(match.refereeCrew || {}).forEach(person => {
      const refereeId = typeof person === 'string' ? person : person?._id || person?.refereeId
      if (refereeId) ids.add(String(refereeId))
    })
  })
  return ids
})

function matchStatus(row) { const value = String(row.status || '').toLowerCase(); if (['live', 'in_progress', 'playing'].includes(value)) return { key:'active', label:'进行中', type:'success' }; if (['completed', 'archived', 'finished'].includes(value)) return { key:'done', label:'已结束', type:'info' }; if (['pending_result', 'pending_review', 'awaiting_result'].includes(value)) return { key:'pending', label:'待处理', type:'warning' }; return { key:'pending', label:'待开始', type:'info' } }
function reviewStatus(row) { if (['archived', 'completed'].includes(String(row.status || '').toLowerCase())) return { label:'已归档', type:'success' }; if (row.reviewStatus === 'pending' || row.status === 'pending_review') return { label:'待复核', type:'warning' }; return { label:'未结束', type:'info' } }
function actionLabel(row) { const status = matchStatus(row).key; return status === 'active' ? '实时监控' : status === 'done' ? '赛果复核' : '查看详情' }
function displayDate(value) { return String(value || '待定').replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$2月$3日') }
function scoreText(row) { return row.homeScore == null && row.awayScore == null ? 'vs' : `${row.homeScore ?? '—'} : ${row.awayScore ?? '—'}` }
function assignedRefereeName(row) { const crew=row.refereeCrew||{};const operatorId=row.operationRefereeId||row.refereeRecordKeeperId;const selected=Object.values(crew).find(item=>(typeof item==='string'?item:item?._id)===operatorId);const main=crew.mainReferee;return (typeof selected==='object'&&selected?.name)||(typeof main==='object'&&main?.name)||row.refereeName||row.refereName||'' }
function executionInfo(row) {
  const refereeName=assignedRefereeName(row)
  if (row.executionState === 'recording' || matchStatus(row).key === 'active') return { label:`${refereeName || '裁判'} · 手机记录中`, icon:Monitor, tone:'recording' }
  if (row.executionState === 'submitted' || row.refereeSubmittedAt) return { label:'记录已提交', icon:CircleCheckFilled, tone:'submitted' }
  if (row.executionState === 'assigned' || Object.keys(row.refereeCrew || {}).length) return { label:`${refereeName || '裁判组'} · 已指派`, icon:UserFilled, tone:'assigned' }
  return { label:'未使用手机记录', icon:WarningFilled, tone:'missing' }
}
function rosterInfo(row) {
  if (row.rosterState === '名单待提交') return { label:'名单待提交', icon:WarningFilled, tone:'missing' }
  return { label:row.rosterState || (row.lineupVerified || row.rosterVerified ? '双方名单已核验' : '名单完整'), icon:CircleCheckFilled, tone:'submitted' }
}
function electronicRecordInfo(row) {
  if (row.recordState === '无电子记录') return { label:'无电子记录', icon:InfoFilled, tone:'pending' }
  if (row.recordState === '电子记录待复核') return { label:'电子记录待复核', icon:Clock, tone:'review' }
  if (row.recordState === '电子记录已归档') return { label:'电子记录已归档', icon:FolderChecked, tone:'archived' }
  return { label:row.recordState || '官方电子记录', icon:DocumentChecked, tone:'submitted' }
}
function postInfo(row) {
  if (row.postState === 'review' || row.refereeReviewStatus === 'under_review' || row.status === 'pending_review') return { label:'待复核', icon:FolderChecked, tone:'review' }
  if (row.postState === 'supplement') return { label:'待补录', icon:WarningFilled, tone:'supplement' }
  if (row.postState === 'archived' || row.refereeReviewStatus === 'archived' || row.status === 'archived') return { label:'已归档', icon:CircleCheckFilled, tone:'archived' }
  if (row.postState === 'await_match') return { label:'待比赛', icon:Clock, tone:'pending' }
  return { label:'未结束', icon:InfoFilled, tone:'pending' }
}
function canQuickAssign(row) { return matchStatus(row).key === 'pending' && !row.refereeRecordLocked && row.refereeReviewStatus !== 'archived' }
function baseRowActions(row) {
  if (row.rosterState === '名单待提交') return [{ label:'查看赛前安排', action:'detail', type:'primary', className:'outline-action' }]
  if (row.recordState === '电子记录待复核') return [{ label:'赛果复核', action:'review', type:'warning', className:'solid-action review-action' }]
  if (row.recordState === '电子记录已归档') return [{ label:'查看归档', action:'archive', type:'success', className:'outline-action' }]
  if (matchStatus(row).key === 'active') return [{ label:selectedDivision.value?.professional ? '查看现场进度' : '实时监控', action:'monitor', type:'success', className:selectedDivision.value?.professional ? 'solid-action' : 'outline-action' }]
  if (row.executionState === 'assigned') return [{ label:'查看指派', action:'detail', type:'success', className:'outline-action' }, { label:'发送提醒', action:'remind', type:'success', className:'outline-action' }]
  if (postInfo(row).tone === 'review') return [{ label:'赛果复核', action:'review', type:'warning', className:'solid-action review-action' }]
  if (postInfo(row).tone === 'supplement') return [{ label:'主办方补录', action:'post-match', type:'warning', className:'solid-action supplement-action' }]
  if (postInfo(row).tone === 'archived') return [{ label:'查看比赛档案', action:'archive', type:'success', className:'outline-action' }]
  return [{ label:'查看详情', action:'detail', type:'success', className:'outline-action' }]
}
function rowActions(row) { const actions=baseRowActions(row);if(canQuickAssign(row))actions.unshift({label:Object.keys(row.refereeCrew||{}).length?'调整裁判':'指派裁判',action:'assign',type:'success',className:'solid-assignment-action'});return actions }
function matchRoute(row, suffix = '') {
  return {
    path: `/tournaments/${tournamentId}/match/${row._id}${suffix}`,
    query: row.divisionId ? { divisionId: row.divisionId } : {}
  }
}
function performMatchAction(row, action) {
  if (action === 'assign') { openQuickAssignment(row); return }
  if (action === 'remind') { window.alert('已向当前裁判发送比赛提醒。'); return }
  if (action === 'monitor') { router.push(matchRoute(row, '/monitor')); return }
  if (action === 'review') { router.push(matchRoute(row, '/review')); return }
  if (action === 'post-match') { router.push(matchRoute(row, '/post-match')); return }
  if (action === 'archive') { router.push(matchRoute(row, '/archive')); return }
  openMatch(row)
}
function refereeOptionLabel(referee) { const phone=String(referee.phone||referee.phoneNumber||'');const masked=phone.length===11?`${phone.slice(0,3)}****${phone.slice(-4)}`:phone||'无手机号';return `${referee.name||referee.realName||'未命名裁判'}（${referee.synthetic===true?'虚拟测试':referee.level||referee.refereeLevel||'已审核'} · ${masked}）` }
function refereeUsedByOtherRole(id,currentRole) { return assignmentRoles.value.some(role=>role.key!==currentRole&&assignmentForm.value[role.key]===id) }
function refereeHasTimeConflict(id) { return conflictingRefereeIds.value.has(String(id || '')) }
async function loadAssignableReferees() { refereeLoading.value=true;try{refereeRows.value=await queryList('referees',{where:{tournamentId},limit:500})||[]}catch(error){refereeRows.value=[];ElMessage.error(error.message||'裁判名单加载失败')}finally{refereeLoading.value=false} }
async function openQuickAssignment(row) { assignmentMatch.value=row;await loadAssignableReferees();const crew=row.refereeCrew||{};const form={operationRefereeId:row.operationRefereeId||row.refereeRecordKeeperId||''};assignmentRoles.value.forEach(role=>{const value=crew[role.key];form[role.key]=typeof value==='string'?value:value?._id||''});const defaultRole=/^(5|6)/.test(String(assignmentFormat.value))?'timekeeper':'fourthOfficial';form.operationRefereeId=form.operationRefereeId||form[defaultRole]||'';assignmentForm.value=form;assignmentVisible.value=true }
async function saveQuickAssignment() { const ids=assignmentRoles.value.map(role=>assignmentForm.value[role.key]);if(ids.some(id=>!id))return ElMessage.warning('请完整指派4名裁判');if(new Set(ids).size!==ids.length)return ElMessage.warning('同一名裁判不能重复担任多个岗位');if(!ids.includes(assignmentForm.value.operationRefereeId))return ElMessage.warning('操作负责人必须从本场裁判组中选择');assignmentSaving.value=true;try{const crew={};assignmentRoles.value.forEach(role=>{const referee=assignableReferees.value.find(item=>item._id===assignmentForm.value[role.key]);crew[role.key]={_id:referee._id,name:referee.name||referee.realName||'',phone:referee.phone||referee.phoneNumber||'',synthetic:referee.synthetic===true}});const result=await callFunction('updateMatch',{matchId:assignmentMatch.value._id,data:{refereeCrew:crew,refereeRecordKeeperId:assignmentForm.value.operationRefereeId,operationRefereeId:assignmentForm.value.operationRefereeId}});if(!result?.success)throw new Error(result?.message||result?.error||'裁判指派失败');Object.assign(assignmentMatch.value,{refereeCrew:crew,refereeRecordKeeperId:assignmentForm.value.operationRefereeId,operationRefereeId:assignmentForm.value.operationRefereeId,refereeAssignmentStatus:'assigned',executionState:'assigned'});assignmentVisible.value=false;ElMessage.success('裁判组已指派，操作负责人将通过服务号接收任务')}catch(error){ElMessage.error(error.message||'裁判指派失败')}finally{assignmentSaving.value=false} }
function goToRefereeManagement(){assignmentVisible.value=false;router.push(`/tournaments/${tournamentId}/referees`)}
function openMatch(row) { const status = matchStatus(row).key; const archived = row.refereeReviewStatus === 'archived' || String(row.status || '').toLowerCase() === 'archived'; const underReview = row.refereeReviewStatus === 'under_review' || row.status === 'pending_review'; const needsPostMatch = !archived && !underReview && status === 'done'; router.push(matchRoute(row, status === 'active' ? '/monitor' : archived ? '/archive' : underReview ? '/review' : needsPostMatch ? '/post-match' : '')) }
function enterDivision(row) { router.push({ path:`/tournaments/${tournamentId}/matches`, query:{ divisionId:row.id } }) }
function backToDivisions() { router.push(`/tournaments/${tournamentId}/matches`) }
function exportMatches() { const header = ['场序', '比赛日期', '时间', '场地', '主队', '比分', '客队', '比赛状态', '赛后状态']; const data = filteredDivisionMatches.value.map(row => [row.matchSequence || row.sequence || '', row.matchDate || '', row.matchTime || '', row.venue || '', row.homeTeamName || '', `${row.homeScore ?? ''}:${row.awayScore ?? ''}`, row.awayTeamName || '', matchStatus(row).label, reviewStatus(row).label]); const csv = [header, ...data].map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n'); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type:'text/csv;charset=utf-8' })); link.download = `${selectedDivision.value?.name || '组别'}-比赛档案.csv`; link.click(); URL.revokeObjectURL(link.href) }

onMounted(async () => {
  if (visualQaSnapshot) return
  loading.value = true
  try {
    const [event, divisionList, matchList] = await Promise.all([queryById('tournaments', tournamentId), queryList('divisions', { where:{ tournamentId }, orderBy:{ createTime:'asc' } }), queryList('matches', { where:{ tournamentId }, orderBy:{ matchDate:'asc' } })])
    tournament.value = event || {}
    divisions.value = divisionList?.length ? divisionList : tournament.value.divisions || []
    matches.value = matchList || []
  } finally { loading.value = false }
})
</script>

<style scoped>
.match-management{min-height:100%;padding:0 30px 32px;background:#fbfcfb;--el-color-success:#046c2c}.match-context{display:flex;align-items:center;justify-content:space-between;min-height:81px;margin:0 -30px;padding:0 28px;border-bottom:1px solid #e1e6e3;background:#fff}.event-context-main{display:flex;align-items:center;gap:17px;color:#2b352f}.event-context-main>span{display:flex;align-items:center;gap:7px}.event-context-main>strong{font-size:23px}.event-mark{display:grid;width:44px;height:44px;place-items:center;border:1px solid #c7d1c9;border-radius:4px;color:#075e2a;font-size:25px}.match-context .el-button{min-width:158px;height:42px;color:#1d2b22;border-color:#79857d}.match-heading{padding:22px 0 17px}.match-heading h1{margin:0 0 9px;color:#142019;font-size:35px;line-height:1.1}.match-heading p{margin:0;color:#56645b;font-size:17px}.division-entry>.el-alert{border:1px solid #bad9ca;background:#f8fcf9;color:#3f5247}.division-filters{display:flex;gap:20px;margin:30px 0 23px}.division-filters button{min-width:116px;height:43px;padding:0 18px;border:1px solid #dce1df;border-radius:6px;color:#47564d;background:#fff;font-size:17px;cursor:pointer}.division-filters button.active{border-color:#006a2d;color:#074e29;background:#f8fdf9;box-shadow:inset 0 0 0 1px #006a2d}.division-filters b{margin-left:8px;font-size:18px}.division-columns,.division-list article{display:grid;grid-template-columns:1.3fr 1.1fr .9fr 1.35fr 1.35fr 220px;align-items:center;gap:20px}.division-columns{padding:0 20px 13px;color:#48564e;font-size:14px}.division-columns span:last-child{text-align:center}.division-list{display:grid;gap:10px}.division-list article{min-height:91px;padding:0 20px;border:1px solid #e5e9e7;border-radius:9px;background:#fff;box-shadow:0 2px 7px rgba(31,57,42,.025)}.division-list article.professional{position:relative;overflow:hidden;border:2px solid #e5b73c;color:#fff;background:radial-gradient(circle at 72% 120%,#1c6539 0,transparent 34%),linear-gradient(105deg,#042f1b 0%,#004326 55%,#082d20 100%)}.division-list article.professional:after{position:absolute;right:-25px;top:-32px;width:150px;height:105px;border:1px solid rgba(255,226,145,.28);border-radius:50%;content:''}.division-title{display:flex;align-items:center;gap:13px;color:#073c21}.professional .division-title{color:#fff0b0}.division-title .el-icon{font-size:34px}.division-title strong{font-size:27px}.mode-cell{display:flex;align-items:center;gap:12px}.mode-cell :deep(.el-tag){min-width:64px;justify-content:center;font-size:15px}.professional .mode-cell :deep(.el-tag){display:none}.pro-badge{display:inline-flex;align-items:center;gap:6px;padding:7px 11px;border:1px solid #e8be45;border-radius:5px;color:#ffe387;font-size:14px}.pro-badge b{font-size:16px}.format-cell{display:flex;align-items:center;gap:9px;font-size:17px}.format-cell .el-icon{font-size:21px}.progress-cell strong{display:block;font-size:19px}.progress-cell p{margin:7px 0;color:#68766e;font-size:14px}.professional .progress-cell p{color:#e9e8cf}.progress-cell :deep(.el-progress-bar__outer){background:#e5e7e6}.professional .progress-cell :deep(.el-progress-bar__outer){background:rgba(255,255,255,.2)}.professional .progress-cell :deep(.el-progress-bar__inner){background:#f8d35d}.todo-cell{display:flex;align-items:flex-start;flex-direction:column;gap:7px}.todo-cell span{display:flex;align-items:center;gap:7px;font-size:15px}.todo-cell .warning{color:#ef6f13}.todo-cell .info{color:#2c89ef}.todo-cell .muted{color:#8b9590}.professional .todo-cell .warning{color:#ffcd45}.professional .todo-cell .info{color:#57abff}.enter-button{z-index:1;justify-content:center;min-width:218px;height:48px;border:0;color:#fff;background:#003d22;font-size:17px;font-weight:700}.enter-button .el-icon{margin-left:16px;font-size:23px}.professional .enter-button{color:#2d2a16;background:linear-gradient(180deg,#ffeca1,#edc254)}.entry-note{margin:18px 6px 0;color:#69776e}.division-workspace{padding-top:20px}.workspace-header{display:flex;align-items:flex-end;justify-content:space-between}.workspace-header h2{margin:8px 0 18px;font-size:27px}.workspace-header .el-button--success{height:40px}.match-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin:0 0 18px}.match-stats article{padding:20px;border:1px solid #dfe8e1;border-radius:9px;background:#fff}.match-stats span,.match-stats strong{display:block}.match-stats span{color:#6a776e}.match-stats strong{margin-top:8px;color:#116f38;font-size:28px}.match-stats .warning strong{color:#ec7d12}.division-filters.compact{margin:18px 0}.match-table{overflow:hidden;border:1px solid #dfe7e1;border-radius:10px;background:#fff}.match-table>.el-alert{margin:14px}.match-table small{color:#748078}@media(max-width:1180px){.division-columns{display:none}.division-list article{grid-template-columns:1.2fr 1fr 1fr}.format-cell{display:none}.todo-cell{display:none}.division-list article .enter-button{justify-self:end}.match-context{align-items:flex-start;flex-direction:column;gap:12px;padding:16px 28px}.event-context-main{flex-wrap:wrap}}@media(max-width:760px){.match-management{padding:0 16px 24px}.match-context{margin:0 -16px;padding:14px 16px}.event-context-main>strong{font-size:19px}.event-mark,.event-context-main>span:nth-last-child(-n+2){display:none}.division-list article{grid-template-columns:1fr;gap:10px;padding:18px}.division-list article .enter-button{justify-self:stretch}.division-filters{gap:8px;flex-wrap:wrap}.division-filters button{min-width:auto}.match-stats{grid-template-columns:1fr 1fr}.workspace-header{align-items:flex-start;flex-direction:column}}
/* Match list prototype layer: native grid keeps the 1618px table stable in Vite and production. */
.workspace-alert{min-height:58px}
.division-workspace{padding-top:20px}.workspace-header{display:flex;align-items:flex-start;justify-content:space-between}.workspace-header h2{margin:8px 0 8px;font-size:35px;line-height:1.12}.workspace-header p{margin:0;color:#506057;font-size:17px}.workspace-header .back-button{margin-top:15px;min-width:170px;height:42px;color:#34443b;border-color:#88938c}.workspace-alert{margin:22px 0 26px;border:1px solid #c5ddd0;background:#f8fcf9}.match-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:30px;margin:0 0 26px}.match-stats article{display:flex;align-items:center;gap:24px;min-height:105px;padding:0 28px;border:1px solid #e4e8e6;border-radius:10px;background:#fff}.match-stats article>.el-icon{font-size:51px}.match-stats .green{color:#076b31}.match-stats .orange{color:#ff850b}.match-stats span,.match-stats strong{display:block}.match-stats span{color:#303d35;font-size:17px}.match-stats strong{margin-top:9px;font-size:31px;line-height:1}.match-controls{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}.division-filters.compact{gap:16px;margin:0}.division-filters.compact button{min-width:auto;height:42px;padding:0 15px;font-size:15px}.match-toolbox{display:flex;align-items:center;gap:10px}.match-toolbox .el-button{height:40px}.venue-select{width:118px}.match-search{width:194px}.export-button{min-width:168px}.match-table{overflow:hidden;border:1px solid #e3e8e5;border-radius:9px;background:#fff}.match-table>.el-alert{margin:14px}.match-grid{display:grid;grid-template-columns:116px 1.28fr 2.28fr 1.15fr 1.38fr 1.08fr 1.65fr;align-items:center;gap:16px;padding:0 16px}.match-grid-head{height:52px;border-bottom:1px solid #e9edeb;color:#334239;background:#fafcfb;font-size:15px}.match-grid-row{min-height:63px;border-bottom:1px solid #e9edeb;color:#18241d;font-size:15px}.match-grid-row:last-of-type{border-bottom:0}.time-cell,.referee-cell,.post-cell{display:flex;align-items:center;gap:7px}.time-cell{flex-wrap:wrap}.time-cell small{display:block;flex-basis:100%;margin-top:1px;color:#5c6b62;font-size:14px}.versus-cell{display:flex;align-items:center;justify-content:center;gap:14px;white-space:nowrap}.versus-cell>b{font-weight:500}.versus-cell>strong{font-size:18px}.status-cell{display:flex;align-items:center;gap:8px}.status-cell i{width:9px;height:9px;border-radius:50%;background:#aeb5b1}.status-cell.active i{background:#087834}.referee-cell .el-icon,.post-cell .el-icon{font-size:18px}.referee-cell.recording{color:#0c612e}.referee-cell.assigned{color:#5b645f}.referee-cell.submitted,.post-cell.archived{color:#087634}.referee-cell.missing{color:#69736e}.post-cell.review,.post-cell.supplement{color:#ff7d09}.post-cell.pending{color:#65716a}.action-cell{display:flex;justify-content:flex-end;gap:9px;white-space:nowrap}.action-cell .el-button{height:37px;margin:0;padding:0 14px;font-weight:600}.action-cell .outline-action{color:#147140;border-color:#8ac8a3;background:#fff}.action-cell .solid-action{border:0;color:#4b2e00}.action-cell .review-action{background:linear-gradient(180deg,#ffd65d,#ffb727)}.action-cell .supplement-action{background:linear-gradient(180deg,#ffca46,#ff962f)}.match-footer{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:18px}.match-footer>.el-alert{flex:1;border:1px solid #d4e3da;background:#f8fbf9}.match-footer :deep(.el-pagination){flex:none}@media(max-width:1180px){.match-controls{align-items:flex-start;flex-direction:column}.match-grid{grid-template-columns:90px 1fr 1.7fr 1fr 1.1fr 1.1fr}.match-grid>:last-child{display:none}.match-toolbox{width:100%;flex-wrap:wrap}}@media(max-width:760px){.match-stats{grid-template-columns:1fr 1fr;gap:10px}.workspace-header{align-items:flex-start;flex-direction:column}.workspace-header .back-button{display:none}.match-grid{grid-template-columns:80px 1fr 1.5fr}.match-grid>:nth-child(n+5){display:none}.match-footer{align-items:flex-start;flex-direction:column}}
.match-grid{grid-template-columns:116px 1.28fr 2.28fr 1.15fr 1.38fr 1.08fr 2fr}.action-cell .solid-assignment-action{border:1px solid #087c40;color:#fff;background:#087c40}.assignment-match-summary{display:grid;grid-template-columns:90px 1fr 170px;align-items:center;gap:15px;padding:15px;border:1px solid #dfe8e2;border-radius:8px;background:#f8fbf9}.assignment-match-summary>div{display:grid;gap:5px}.assignment-match-summary small{color:#758178;font-size:11px}.assignment-versus{grid-template-columns:1fr auto 1fr!important;align-items:center;text-align:center}.assignment-versus span{color:#89938d;font-size:12px}.assignment-alert{margin:16px 0}.assignment-form{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}.assignment-form :deep(.el-select){width:100%}.assignment-form .operator-field{grid-column:1/-1}.operator-field small{display:block;margin-top:6px;color:#7d8981;font-size:11px}@media(max-width:1180px){.match-grid{grid-template-columns:90px 1fr 1.7fr 1fr 1.1fr 1.1fr}}@media(max-width:760px){.assignment-match-summary,.assignment-form{grid-template-columns:1fr}.assignment-form .operator-field{grid-column:auto}}
</style>
