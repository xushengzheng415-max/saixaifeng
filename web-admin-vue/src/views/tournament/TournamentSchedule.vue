<template>
  <div class="tournament-schedule">
    <el-page-header @back="$router.push('/tournaments')" title="返回赛事列表">
      <template #content>
        <span style="font-size: 18px;">赛程管理 - {{ tournament.name || '赛事' }}</span>
        <el-tag v-if="tournamentType" style="margin-left: 8px;">{{ formatLabel }}</el-tag>
      </template>
    </el-page-header>

    <div class="page-card" style="margin-top: 20px;">
      <!-- Tab 导航 -->
      <el-tabs v-model="activeTab" class="schedule-tabs">
        <!-- 抽签分组 Tab -->
        <el-tab-pane name="draw">
          <template #label>
            <span class="tab-label"><el-icon><Grid /></el-icon>抽签分组</span>
          </template>
          <TournamentDraw :embedded="true" :tournament-id="tournamentId" :readonly="true" />
        </el-tab-pane>

        <!-- 赛程列表 Tab -->
        <el-tab-pane name="schedule">
          <template #label>
            <span class="tab-label"><el-icon><Calendar /></el-icon>赛程列表</span>
          </template>

          <!-- 工具栏 -->
          <div class="toolbar">
            <div class="toolbar-left">
              <el-button type="primary" @click="showConfigDialog = true" :loading="generating">
                <el-icon><MagicStick /></el-icon> 自动生成赛程
              </el-button>
              <el-button type="success" @click="openManualAddDialog">
                <el-icon><Plus /></el-icon> 手动添加比赛
              </el-button>
              <el-button @click="loadMatches">刷新</el-button>
            </div>
            <div class="toolbar-right">
              <el-radio-group v-model="viewMode" size="small">
                <el-radio-button value="round">
                  <el-icon><List /></el-icon> 按轮次
                </el-radio-button>
                <el-radio-button value="calendar">
                  <el-icon><Calendar /></el-icon> 日历
                </el-radio-button>
              </el-radio-group>
            </div>
          </div>

          <!-- 按轮次视图 -->
          <div v-if="viewMode === 'round'" v-loading="loading">
            <div v-for="group in groupedByRound" :key="group.round" class="round-group">
              <div class="round-header">
                <el-tag :type="group.phaseType" size="large">{{ group.roundLabel }}</el-tag>
                <span class="round-meta">{{ group.matches.length }} 场比赛 · {{ group.dateRange }}</span>
              </div>
              <div class="round-matches">
                <div
                  v-for="m in group.matches"
                  :key="m._id"
                  class="match-card"
                  :class="[ 'status-' + (m.status || 'scheduled'), m.isBye ? 'is-bye' : '' ]"
                  :data-phase="m.phase || 'other'"
                  @click="openMatchDetail(m)"
                >
                  <!-- 顶部：场号 + 时间 -->
                  <div class="match-header">
                    <span class="match-seq" v-if="m.matchSequence != null">场 {{ m.matchSequence }}</span>
                    <span class="match-seq" v-else-if="m.sequence != null">场 {{ m.sequence }}</span>
                    <span class="match-datetime">{{ m.matchDate || '--' }} {{ m.matchTime || '--:--' }}</span>
                  </div>

                  <!-- 中部：队徽 + 队名 + 球衣色 + 比分 -->
                  <div class="match-teams">
                    <div class="match-team home">
                      <img
                        v-if="teamLogos[m.homeTeamId]"
                        :src="teamLogos[m.homeTeamId]"
                        class="team-logo"
                        @error="$event.target.style.display='none'"
                      />
                      <div v-else class="team-logo-placeholder">{{ (m.homeTeamName || '?')[0] }}</div>
                      <span class="team-name">{{ m.homeTeamName || '待定' }}</span>
                      <span
                        v-if="m.kitColors?.home?.jersey"
                        class="kit-dot"
                        :style="{ backgroundColor: m.kitColors.home.jersey }"
                        :title="'主队球衣: ' + m.kitColors.home.jersey"
                      />
                      <template v-if="m.status === 'finished'">
                        <span class="team-score">{{ m.homeScore ?? '-' }}</span>
                      </template>
                    </div>
                    <div class="match-vs">VS</div>
                    <div class="match-team away">
                      <template v-if="m.status === 'finished'">
                        <span class="team-score">{{ m.awayScore ?? '-' }}</span>
                      </template>
                      <span class="team-name">{{ m.awayTeamName || '待定' }}</span>
                      <span
                        v-if="m.kitColors?.away?.jersey"
                        class="kit-dot"
                        :style="{ backgroundColor: m.kitColors.away.jersey }"
                        :title="'客队球衣: ' + m.kitColors.away.jersey"
                      />
                      <img
                        v-if="teamLogos[m.awayTeamId]"
                        :src="teamLogos[m.awayTeamId]"
                        class="team-logo"
                        @error="$event.target.style.display='none'"
                      />
                      <div v-else class="team-logo-placeholder">{{ (m.awayTeamName || '?')[0] }}</div>
                    </div>
                  </div>

                  <!-- 底部：状态 + 场地 + 裁判组 -->
                  <div class="match-status-bar">
                    <el-tag :type="statusTagType(m.status)" size="small">{{ statusLabel(m) }}</el-tag>
                    <span class="match-venue-small">{{ m.venue || '待定场地' }}</span>
                    <span v-if="m.refereeCrew?.mainReferee?.name || m.refereeName" class="match-ref">
                      主裁：{{ m.refereeCrew?.mainReferee?.name || m.refereeName }}
                      <template v-if="m.refereeCrew?.assistant1?.name">
                        &nbsp;边裁：{{ m.refereeCrew.assistant1.name }}
                        <template v-if="m.refereeCrew?.assistant2?.name">/{{ m.refereeCrew.assistant2.name }}</template>
                      </template>
                      <template v-if="m.refereeCrew?.fourthOfficial?.name">
                        &nbsp;第四官员：{{ m.refereeCrew.fourthOfficial.name }}
                      </template>
                    </span>
                    <span v-else class="match-ref empty">未指派裁判</span>
                  </div>
                </div>
              </div>
            </div>
            <el-empty v-if="!loading && groupedByRound.length === 0" description="暂无赛程，请先生成" />
          </div>

          <!-- 日历视图 -->
          <div v-if="viewMode === 'calendar'" v-loading="loading">
            <div class="calendar-nav">
              <el-button @click="shiftCalendar(-7)"><el-icon><ArrowLeft /></el-icon></el-button>
              <span class="calendar-range">{{ calendarLabel }}</span>
              <el-button @click="shiftCalendar(7)"><el-icon><ArrowRight /></el-icon></el-button>
            </div>
            <div class="calendar-grid">
              <div v-for="day in calendarDays" :key="day.date" class="calendar-day">
                <div class="calendar-day-header" :class="{ 'is-today': day.isToday }">
                  <span class="day-name">{{ day.dayName }}</span>
                  <span class="day-date">{{ day.dateLabel }}</span>
                  <span v-if="day.matches.length" class="day-count">{{ day.matches.length }}</span>
                </div>
                <div class="calendar-day-body">
                  <div
                    v-for="m in day.matches"
                    :key="m._id"
                    class="calendar-match"
                    :class="'status-' + (m.status || 'scheduled')"
                    @click="openMatchDetail(m)"
                  >
                    <span class="cm-time">{{ m.matchTime || '--:--' }}</span>
                    <span class="cm-teams">{{ m.homeTeamName || '待定' }} vs {{ m.awayTeamName || '待定' }}</span>
                    <span v-if="m.homeScore != null" class="cm-score">{{ m.homeScore }}:{{ m.awayScore }}</span>
                  </div>
                  <div v-if="day.matches.length === 0" class="calendar-empty">无比赛</div>
                </div>
              </div>
            </div>
          </div>

        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- 比赛编辑弹窗 -->
    <el-dialog v-model="editDialogVisible" title="编辑比赛" width="520px">
      <el-form :model="editForm" label-width="80px">
        <el-form-item label="日期">
          <el-date-picker v-model="editForm.matchDate" type="date" format="YYYY-MM-DD" value-format="YYYY-MM-DD" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="时间">
          <el-time-select v-model="editForm.matchTime" start="06:00" step="00:15" end="23:00" format="HH:mm" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="场地">
          <el-select v-model="editForm.venue" allow-create filterable style="width: 100%;">
            <el-option v-for="v in venueOptions" :key="v" :label="v" :value="v" />
          </el-select>
        </el-form-item>
        <el-form-item label="主队">
          <el-select v-model="editForm.homeTeamId" style="width: 100%;">
            <el-option v-for="t in allTeams" :key="t.teamId" :label="t.teamName" :value="t.teamId" />
          </el-select>
        </el-form-item>
        <el-form-item label="客队">
          <el-select v-model="editForm.awayTeamId" style="width: 100%;">
            <el-option v-for="t in allTeams" :key="t.teamId" :label="t.teamName" :value="t.teamId" />
          </el-select>
        </el-form-item>
        <el-form-item label="裁判">
          <el-select v-model="editForm.refereeId" style="width: 100%;">
            <el-option label="未指派" :value="null" />
            <el-option v-for="r in referees" :key="r._id" :label="r.name" :value="r._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="editForm.status" style="width: 100%;">
            <el-option label="未开始" value="scheduled" />
            <el-option label="进行中" value="ongoing" />
            <el-option label="已结束" value="finished" />
            <el-option label="延期" value="postponed" />
            <el-option label="已取消" value="cancelled" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="danger" @click="handleDeleteMatch" :loading="saving">删除比赛</el-button>
        <el-button type="primary" @click="saveMatchEdit" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <!-- 赛程配置弹窗 -->
    <el-dialog v-model="showConfigDialog" title="生成赛程" width="600px" :close-on-click-modal="false">
      <div class="config-content">
        <el-alert type="info" :closable="false" show-icon>
          将根据抽签分组结果自动生成赛程，已有赛程将被覆盖。
        </el-alert>
        <div class="config-section">
          <h4>比赛日期</h4>
          <el-date-picker v-model="scheduleConfig.startDate" type="date" format="YYYY-MM-DD" value-format="YYYY-MM-DD" placeholder="开始日期" style="width: 180px; margin-right: 12px;" />
          <span style="margin-right: 12px;">至</span>
          <el-date-picker v-model="scheduleConfig.endDate" type="date" format="YYYY-MM-DD" value-format="YYYY-MM-DD" placeholder="结束日期（可选）" style="width: 180px;" />
        </div>
        <div class="config-section">
          <h4>比赛场地</h4>
          <div class="tag-input-row">
            <el-tag v-for="(v, i) in scheduleConfig.venues" :key="i" closable @close="scheduleConfig.venues.splice(i, 1)">{{ v }}</el-tag>
            <el-input v-model="venueInput" placeholder="输入场地名回车添加" size="small" style="width: 140px;" @keyup.enter="addVenue" />
          </div>
        </div>
        <div class="config-section">
          <h4>比赛时段</h4>
          <div class="tag-input-row">
            <el-tag v-for="(t, i) in scheduleConfig.timeSlots" :key="i" closable @close="scheduleConfig.timeSlots.splice(i, 1)">{{ t }}</el-tag>
            <el-time-select v-model="timeInput" start="06:00" step="00:15" end="23:00" format="HH:mm" placeholder="选择时段" style="width: 130px;" @change="addTimeSlot" />
          </div>
        </div>
        <div class="config-section" v-if="tournamentType === 'cup'">
          <h4>淘汰赛规则</h4>
          <el-radio-group v-model="scheduleConfig.cupMode">
            <el-radio-button value="single">单场淘汰</el-radio-button>
            <el-radio-button value="two-leg">主客场两回合</el-radio-button>
          </el-radio-group>
        </div>
      </div>
      <template #footer>
        <el-button @click="showConfigDialog = false">取消</el-button>
        <el-button type="primary" @click="handleGenerate" :loading="generating">生成赛程</el-button>
      </template>
    </el-dialog>

    <!-- 手动添加比赛弹窗 -->
    <el-dialog v-model="manualAddVisible" title="手动添加比赛" width="520px">
      <el-form :model="manualForm" label-width="80px">
        <el-form-item label="日期">
          <el-date-picker v-model="manualForm.matchDate" type="date" format="YYYY-MM-DD" value-format="YYYY-MM-DD" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="时间">
          <el-time-select v-model="manualForm.matchTime" start="06:00" step="00:15" end="23:00" format="HH:mm" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="场地">
          <el-select v-model="manualForm.venue" allow-create filterable style="width: 100%;">
            <el-option v-for="v in venueOptions" :key="v" :label="v" :value="v" />
          </el-select>
        </el-form-item>
        <el-form-item label="主队">
          <el-select v-model="manualForm.homeTeamId" style="width: 100%;">
            <el-option v-for="t in allTeams" :key="t.teamId" :label="t.teamName" :value="t.teamId" />
          </el-select>
        </el-form-item>
        <el-form-item label="客队">
          <el-select v-model="manualForm.awayTeamId" style="width: 100%;">
            <el-option v-for="t in allTeams" :key="t.teamId" :label="t.teamName" :value="t.teamId" />
          </el-select>
        </el-form-item>
        <el-form-item label="裁判">
          <el-select v-model="manualForm.refereeId" style="width: 100%;">
            <el-option label="未指派" :value="null" />
            <el-option v-for="r in referees" :key="r._id" :label="r.name" :value="r._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="阶段">
          <el-input v-model="manualForm.roundName" placeholder="如：小组赛 A组、淘汰赛 1/4决赛" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="manualAddVisible = false">取消</el-button>
        <el-button type="primary" @click="saveManualMatch" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { MagicStick, Calendar, Grid, List, ArrowLeft, ArrowRight, Plus } from '@element-plus/icons-vue'
import { queryById, queryList, callFunction, deleteRecord, addRecord } from '../../utils/cloud'
import TournamentDraw from './TournamentDraw.vue'

const route = useRoute()
const router = useRouter()
const tournamentId = route.params.id

const activeTab = ref('schedule')
const tournament = ref({})
const tournamentType = ref('')
const formatLabel = ref('')
const matches = ref([])
const allTeams = ref([])
const referees = ref([])
const teamLogos = ref({})
const loading = ref(false)
const generating = ref(false)
const saving = ref(false)
const viewMode = ref('round')
const showConfigDialog = ref(false)
const editDialogVisible = ref(false)
const venueInput = ref('')
const timeInput = ref('')
const calendarBaseDate = ref(new Date())

const scheduleConfig = ref({
  startDate: '',
  endDate: '',
  venues: ['1号场地'],
  timeSlots: ['09:00', '14:00', '16:30'],
  cupMode: 'single'
})

const manualAddVisible = ref(false)
const manualForm = ref({
  matchDate: '',
  matchTime: '',
  venue: '',
  homeTeamId: null,
  awayTeamId: null,
  refereeId: null,
  roundName: ''
})

const editForm = ref({
  _id: '',
  matchDate: '',
  matchTime: '',
  venue: '',
  homeTeamId: null,
  awayTeamId: null,
  refereId: null,
  status: 'scheduled'
})

const phaseLabels = { group: '小组赛', league: '联赛', cup: '淘汰赛', knockout: '淘汰赛', final: '决赛' }

// 场地选项（编辑弹窗用）
const venueOptions = computed(() => {
  const set = new Set(scheduleConfig.value.venues)
  matches.value.forEach(m => { if (m.venue) set.add(m.venue) })
  return [...set]
})

// 按轮次分组
const groupedByRound = computed(() => {
  const map = {}
  matches.value.forEach(m => {
    const key = m.round != null ? m.round : m.roundName || 'other'
    if (!map[key]) {
      map[key] = { round: key, roundLabel: '', phaseType: '', matches: [], dateRange: '', dates: new Set() }
    }
    map[key].matches.push(m)
    if (m.matchDate) map[key].dates.add(m.matchDate)
  })
  return Object.values(map).map(g => {
    g.roundLabel = buildRoundLabel(g)
    g.phaseType = getPhaseType(g.matches)
    const dates = [...g.dates].sort()
    g.dateRange = dates.length ? (dates.length === 1 ? dates[0] : `${dates[0]} ~ ${dates[dates.length - 1]}`) : ''
    delete g.dates
    return g
  }).sort((a, b) => {
    // 小组赛/联赛排在前面，淘汰赛排在后面
    const aPhase = a.matches[0]?.phase || ''
    const bPhase = b.matches[0]?.phase || ''
    const aIsGroup = aPhase === 'group' || aPhase === 'league'
    const bIsGroup = bPhase === 'group' || bPhase === 'league'
    if (aIsGroup && !bIsGroup) return -1
    if (!aIsGroup && bIsGroup) return 1
    // 同阶段按轮次排
    if (a.round < b.round) return -1
    if (a.round > b.round) return 1
    return 0
  })
})

// 日历视图
const calendarDays = computed(() => {
  const base = new Date(calendarBaseDate.value)
  const day = base.getDay()
  const monday = new Date(base)
  monday.setDate(base.getDate() - (day === 0 ? 6 : day - 1))
  const days = []
  const todayStr = formatDateStr(new Date())
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const ds = formatDateStr(d)
    days.push({
      date: ds,
      dateLabel: `${d.getMonth() + 1}/${d.getDate()}`,
      dayName: ['一','二','三','四','五','六','日'][i],
      isToday: ds === todayStr,
      matches: matches.value.filter(m => m.matchDate === ds)
    })
  }
  return days
})

const calendarLabel = computed(() => {
  const days = calendarDays.value
  if (!days.length) return ''
  return `${days[0].date} ~ ${days[6].date}`
})

function shiftCalendar(days) {
  calendarBaseDate.value = new Date(calendarBaseDate.value.getTime() + days * 86400000)
}

function formatDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function buildRoundLabel(group) {
  const first = group.matches[0]
  if (!first) return `第${group.round}轮`
  const phase = first.phase || ''
  if (phase === 'group') {
    const groupName = (first.group || '').replace(/组$/, '')
    return groupName ? `小组赛 ${groupName}组 第${group.round}轮` : `小组赛 第${group.round}轮`
  }
  if (phase === 'league') return `联赛 第${group.round}轮`
  if (phase === 'knockout' || phase === 'cup') return first.roundName || `淘汰赛 第${group.round}轮`
  return first.roundName || `第${group.round}轮`
}

function getPhaseType(ms) {
  const phase = ms[0]?.phase
  if (phase === 'group') return 'success'
  if (phase === 'league') return ''
  return 'warning'
}

function statusLabel(m) {
  if (m.isBye) return '轮空'
  const s = m.status || 'scheduled'
  return { scheduled: '未开始', ongoing: '进行中', finished: '已结束', postponed: '延期', cancelled: '已取消' }[s] || s
}

function statusTagType(s) {
  const map = { scheduled: 'info', ongoing: '', finished: 'success', postponed: 'warning', cancelled: 'danger' }
  return map[s || 'scheduled'] || 'info'
}

// 打开比赛编辑
async function openMatchDetail(match) {
  // 跳转到比赛详情页
  router.push(`/tournaments/${tournamentId}/match/${match._id}`)
}

// 编辑比赛（弹窗）
function openMatchEdit(match) {
  editForm.value = {
    _id: match._id,
    matchDate: match.matchDate || '',
    matchTime: match.matchTime || '',
    venue: match.venue || '',
    homeTeamId: match.homeTeamId || null,
    awayTeamId: match.awayTeamId || null,
    refereId: match.refereeId || null,
    status: match.status || 'scheduled'
  }
  referees.value = []
  loadReferees()
  editDialogVisible.value = true
}

async function loadReferees() {
  try {
    referees.value = await queryList('users', {
      where: { role: 'referee', tournamentId }
    })
  } catch {
    try {
      referees.value = await queryList('referees', { where: { tournamentId } })
    } catch (e2) { console.warn('加载裁判失败', e2) }
  }
}

async function saveMatchEdit() {
  saving.value = true
  try {
    const f = editForm.value
    const homeTeam = allTeams.value.find(t => t.teamId === f.homeTeamId)
    const awayTeam = allTeams.value.find(t => t.teamId === f.awayTeamId)
    const ref = referees.value.find(r => r._id === f.refereeId)
    await callFunction('updateMatch', {
      matchId: f._id,
      data: {
        matchDate: f.matchDate,
        matchTime: f.matchTime,
        venue: f.venue,
        homeTeamId: f.homeTeamId,
        homeTeamName: homeTeam?.teamName || '',
        awayTeamId: f.awayTeamId,
        awayTeamName: awayTeam?.teamName || '',
        refereId: f.refereeId,
        refereName: ref?.name || '',
        status: f.status,
        updateTime: new Date()
      }
    })
    ElMessage.success('保存成功')
    editDialogVisible.value = false
    loadMatches()
  } catch (err) {
    ElMessage.error('保存失败: ' + err.message)
  } finally {
    saving.value = false
  }
}

async function handleDeleteMatch() {
  try {
    await ElMessageBox.confirm('确定删除这场比赛？此操作不可恢复。', '删除比赛', { type: 'warning' })
    await deleteRecord('matches', editForm.value._id)
    ElMessage.success('已删除')
    editDialogVisible.value = false
    loadMatches()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败')
  }
}

// 手动添加比赛
function openManualAddDialog() {
  manualForm.value = {
    matchDate: formatDateStr(new Date()),
    matchTime: '09:00',
    venue: scheduleConfig.value.venues[0] || '1号场地',
    homeTeamId: null,
    awayTeamId: null,
    refereeId: null,
    roundName: ''
  }
  loadReferees()
  manualAddVisible.value = true
}

async function saveManualMatch() {
  const f = manualForm.value
  if (!f.homeTeamId || !f.awayTeamId) {
    ElMessage.warning('请选择主队和客队')
    return
  }
  if (f.homeTeamId === f.awayTeamId) {
    ElMessage.warning('主队和客队不能相同')
    return
  }

  saving.value = true
  try {
    const homeTeam = allTeams.value.find(t => t.teamId === f.homeTeamId)
    const awayTeam = allTeams.value.find(t => t.teamId === f.awayTeamId)
    const ref = referees.value.find(r => r._id === f.refereeId)

    await addRecord('matches', {
      tournamentId,
      scheduleType: tournamentType.value,
      phase: 'group',
      roundName: f.roundName || '手动添加',
      matchDate: f.matchDate,
      matchTime: f.matchTime,
      venue: f.venue,
      homeTeamId: f.homeTeamId,
      homeTeamName: homeTeam?.teamName || '',
      awayTeamId: f.awayTeamId,
      awayTeamName: awayTeam?.teamName || '',
      refereeId: f.refereeId,
      refereeName: ref?.name || '',
      homeScore: 0,
      awayScore: 0,
      status: 'scheduled',
      statusText: '未开始',
      isBye: false,
      createTime: new Date(),
      updateTime: new Date()
    })

    ElMessage.success('比赛添加成功')
    manualAddVisible.value = false
    loadMatches()
  } catch (err) {
    ElMessage.error('添加失败: ' + err.message)
  } finally {
    saving.value = false
  }
}

// 添加场地
function addVenue() {
  const v = venueInput.value.trim()
  if (v && !scheduleConfig.value.venues.includes(v)) {
    scheduleConfig.value.venues.push(v)
  }
  venueInput.value = ''
}

// 添加时段
function addTimeSlot() {
  const t = timeInput.value
  if (t && !scheduleConfig.value.timeSlots.includes(t)) {
    scheduleConfig.value.timeSlots.push(t)
  }
  timeInput.value = ''
}

// 生成赛程
async function handleGenerate() {
  showConfigDialog.value = false
  try {
    await ElMessageBox.confirm('将覆盖已有赛程，确定继续吗？', '生成赛程', { type: 'warning' })
  } catch {
    showConfigDialog.value = true
    return
  }

  generating.value = true
  try {
    const result = await callFunction('generateSchedule', {
      tournamentId,
      scheduleType: tournamentType.value,
      scheduleConfig: {
        startDate: scheduleConfig.value.startDate,
        endDate: scheduleConfig.value.endDate,
        venues: scheduleConfig.value.venues,
        timeSlots: scheduleConfig.value.timeSlots,
        cupMode: scheduleConfig.value.cupMode
      }
    })

    if (result && result.success) {
      ElMessage.success(`赛程生成成功！共 ${result.matchCount || 0} 场比赛`)
      loadMatches()
    } else {
      ElMessage.error('生成失败: ' + (result?.error || '未知错误'))
    }
  } catch (err) {
    ElMessage.error('调用云函数失败: ' + err.message)
  } finally {
    generating.value = false
  }
}

async function loadTournament() {
  try {
    const t = await queryById('tournaments', tournamentId)
    tournament.value = t
    tournamentType.value = t.tournamentType || t.format || 'tournament'
    formatLabel.value = { tournament: '赛会制', cup: '杯赛制', league: '联赛制' }[tournamentType.value] || ''
    // 回填配置
    if (t.scheduleConfig) {
      scheduleConfig.value = { ...scheduleConfig.value, ...t.scheduleConfig }
    }
    if (t.startDate) scheduleConfig.value.startDate = t.startDate
  } catch (err) {
    console.error('加载赛事失败:', err)
  }
}

async function loadMatches() {
  loading.value = true
  try {
    matches.value = await queryList('matches', {
      where: { tournamentId },
      orderBy: { matchDate: 'asc', matchTime: 'asc' }
    })
  } catch (err) {
    console.error('加载赛程失败:', err)
  } finally {
    loading.value = false
  }
}

async function loadAllTeams() {
  try {
    const groups = await queryList('tournament_groups', { where: { tournamentId } })
    const teams = []
    groups.forEach(g => {
      ;(g.groups || []).forEach(gp => {
        (gp.teams || []).forEach(t => {
          if (t && t.teamId) teams.push({ teamId: t.teamId, teamName: t.teamName || t.name || '' })
        })
      })
      ;(g.ranking || []).forEach(r => {
        if (r.teamId) teams.push({ teamId: r.teamId, teamName: r.teamName || '' })
      })
    })
    // 也加载 approved teams
    const approved = await queryList('tournament_teams', { where: { tournamentId, status: 'approved' } })
    approved.forEach(t => teams.push({ teamId: t.teamId || t._id, teamName: t.teamName || t.name || '' }))
    allTeams.value = [...new Map(teams.map(t => [t.teamId, t])).values()]
  } catch (err) {
    console.warn('加载球队列表失败', err)
  }
}

async function loadTeamLogos() {
  try {
    const teamIds = new Set()
    matches.value.forEach(m => {
      if (m.homeTeamId) teamIds.add(m.homeTeamId)
      if (m.awayTeamId) teamIds.add(m.awayTeamId)
    })
    if (teamIds.size === 0) return

    const teams = await queryList('teams', {})
    const map = {}
    ;(teams || []).forEach(t => {
      const logo = t.logoUrl || t.logo || t.logoImage || ''
      if (logo && t._id) map[t._id] = logo
    })
    teamLogos.value = map
  } catch (err) {
    console.warn('加载队徽失败', err)
  }
}

onMounted(async () => {
  await loadTournament()
  await loadMatches()
  await loadTeamLogos()
  await loadAllTeams()
})
</script>

<style scoped>
.tournament-schedule { padding: 20px; max-width: 1600px; margin: 0 auto; }
.schedule-tabs :deep(.el-tabs__header) { margin-bottom: 20px; }
.tab-label { display: flex; align-items: center; gap: 6px; }

.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
.toolbar-left, .toolbar-right { display: flex; gap: 12px; align-items: center; }

/* 按轮次视图 */
.round-group { margin-bottom: 24px; }
.round-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.round-meta { font-size: 13px; color: #909399; }
.round-matches { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 16px; }

/* 比赛卡片 */
.match-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px 18px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  border-left: 4px solid #409eff;
  position: relative;
  overflow: hidden;
}
.match-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: linear-gradient(135deg, rgba(64,158,255,0.03) 0%, transparent 60%);
  pointer-events: none;
}
.match-card:hover {
  box-shadow: 0 8px 25px rgba(0,0,0,0.1);
  transform: translateY(-3px);
}
.match-card.status-finished { border-left-color: #67c23a; }
.match-card.status-finished::before {
  background: linear-gradient(135deg, rgba(103,194,58,0.04) 0%, transparent 60%);
}
.match-card.status-ongoing { border-left-color: #e6a23c; }
.match-card.status-ongoing::before {
  background: linear-gradient(135deg, rgba(230,162,60,0.04) 0%, transparent 60%);
}
.match-card.status-postponed { border-left-color: #f56c6c; opacity: 0.75; }
.match-card.status-cancelled { border-left-color: #f56c6c; opacity: 0.5; text-decoration: line-through; }
.match-card.is-bye { opacity: 0.35; border-left-color: #c0c4cc; }

/* 小组赛卡片风格 */
.match-card[data-phase="group"] {
  border-left-color: #43a047;
}
.match-card[data-phase="group"]::before {
  background: linear-gradient(135deg, rgba(67,160,71,0.05) 0%, transparent 60%);
}
.match-card[data-phase="group"] .match-vs {
  background: #e8f5e9;
  color: #2e7d32;
}

/* 淘汰赛卡片风格 */
.match-card[data-phase="knockout"],
.match-card[data-phase="cup"] {
  border-left-color: #ed6c02;
}
.match-card[data-phase="knockout"]::before,
.match-card[data-phase="cup"]::before {
  background: linear-gradient(135deg, rgba(237,108,2,0.05) 0%, transparent 60%);
}
.match-card[data-phase="knockout"] .match-vs,
.match-card[data-phase="cup"] .match-vs {
  background: #fff3e0;
  color: #e65100;
}

/* 卡片头部：场号 + 时间 */
.match-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid #f0f0f0;
}
.match-seq {
  font-size: 13px;
  font-weight: 700;
  color: #1B5E20;
  background: #e8f5e9;
  padding: 2px 10px;
  border-radius: 12px;
}
.match-datetime {
  font-size: 12px;
  color: #909399;
  font-weight: 500;
}

/* 旧样式兼容 */
.match-venue {
  font-size: 11px;
  color: #909399;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.match-venue::before {
  content: '';
  display: inline-block;
  width: 6px; height: 6px;
  border-radius: 50%;
  background: #c0c4cc;
}
.match-time {
  display: flex;
  gap: 10px;
  font-size: 13px;
  color: #606266;
  margin-bottom: 12px;
  font-weight: 500;
}
.match-date { color: #303133; }
.match-time-str { color: #606266; }

.match-teams {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding: 10px 0;
}
.match-team {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}
.match-team.home { justify-content: flex-end; text-align: right; }
.match-team.away { justify-content: flex-start; }
.team-name {
  font-size: 15px;
  font-weight: 600;
  color: #1a1a1a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 130px;
}
.team-logo {
  width: 32px;
  height: 32px;
  object-fit: contain;
  border-radius: 6px;
  flex-shrink: 0;
}
.team-logo-placeholder {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: linear-gradient(135deg, #1B5E20, #43A047);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.kit-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px #d0d0d0;
  flex-shrink: 0;
  display: inline-block;
}
.team-score {
  font-size: 22px;
  font-weight: 800;
  color: #f59e0b;
  min-width: 32px;
  text-align: center;
  background: #fffbeb;
  border-radius: 8px;
  padding: 3px 8px;
  line-height: 1.2;
}
.match-vs {
  font-size: 12px;
  font-weight: 700;
  color: #909399;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #f5f7fa;
  letter-spacing: 0.5px;
}
.match-status-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  font-size: 12px;
  padding-top: 8px;
  border-top: 1px solid #f0f0f0;
}
.match-venue-small {
  font-size: 11px;
  color: #909399;
  flex: 1;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.match-ref { color: #606266; font-size: 11px; white-space: nowrap; }
.match-ref.empty { color: #f56c6c; font-size: 11px; }

/* 日历视图 */
.calendar-nav { display: flex; justify-content: center; align-items: center; gap: 16px; margin-bottom: 16px; }
.calendar-range { font-size: 15px; font-weight: 600; }
.calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
.calendar-day { background: #f9fafb; border-radius: 10px; overflow: hidden; min-height: 200px; }
.calendar-day-header { padding: 8px 10px; background: #f3f4f6; display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; }
.calendar-day-header.is-today { background: #409eff; color: #fff; }
.day-name { color: inherit; opacity: 0.7; }
.day-count { margin-left: auto; background: rgba(0,0,0,0.1); border-radius: 8px; padding: 0 6px; font-size: 11px; }
.is-today .day-count { background: rgba(255,255,255,0.3); }
.calendar-day-body { padding: 6px; display: flex; flex-direction: column; gap: 4px; }
.calendar-match {
  background: #fff;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 12px;
  cursor: pointer;
  border-left: 3px solid #409eff;
  transition: all 0.15s;
}
.calendar-match:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
.calendar-match.status-finished { border-left-color: #67c23a; }
.calendar-match.status-ongoing { border-left-color: #e6a23c; }
.cm-time { font-weight: 600; margin-right: 4px; }
.cm-teams { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cm-score { margin-left: auto; font-weight: 700; color: #f59e0b; flex-shrink: 0; }
.calendar-empty { text-align: center; color: #c0c4cc; font-size: 12px; padding: 20px 0; }

/* 配置弹窗 */
.config-content { display: flex; flex-direction: column; gap: 20px; }
.config-section h4 { margin: 0 0 8px 0; font-size: 14px; color: #303133; }
.tag-input-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
</style>
