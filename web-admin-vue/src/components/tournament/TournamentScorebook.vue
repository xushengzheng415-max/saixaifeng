<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { callFunction } from '../../utils/cloud'
import MatchDecision from '../match/MatchDecision.vue'
import matchScore from '../../../../cloudfunctions/dataCenter/shared/match-score.cjs'

const props = defineProps({
  awards: { type: Object, default: () => ({}) },
  tournament: { type: Object, default: () => ({}) },
  matches: { type: Array, default: () => [] },
  tournamentId: { type: String, default: '' }
})
const emit = defineEmits(['refresh'])

const divisions = computed(() => props.awards.divisions || [])
const ready = computed(() => Boolean(props.awards.ready))
const activeDivisionId = ref('')
const printScope = ref('all')
const printRoot = ref(null)
const exportingPdf = ref(false)
watch(divisions, items => {
  if (!items.some(item => String(item.divisionId) === activeDivisionId.value)) activeDivisionId.value = String(items[0]?.divisionId || '')
}, { immediate: true })
const selectedDivision = computed(() => divisions.value.find(item => String(item.divisionId) === activeDivisionId.value) || null)
function divisionMatches(division) {
  return props.matches.filter(match => String(match.divisionId || '') === String(division.divisionId || '')).slice().sort((a,b) => `${a.matchDate || '9999'} ${a.matchTime || ''}`.localeCompare(`${b.matchDate || '9999'} ${b.matchTime || ''}`) || Number(a.matchNo || a.matchSequence || 0) - Number(b.matchNo || b.matchSequence || 0))
}
function resultPages(division) {
  const rows = divisionMatches(division), pages = []
  for (let index=0; index<rows.length; index+=18) pages.push(rows.slice(index,index+18))
  return pages
}
function stageText(match) {
  const phase = match.phaseLabel || match.reviewStageLabel || '', round = match.roundName || ''
  return phase && round && !phase.includes(round) && !round.includes(phase) ? `${phase} · ${round}` : round || phase || '—'
}
function winnerText(match) {
  const decision = matchScore.decision(match)
  if (decision.isShootout) return decision.winnerName || (decision.winnerSide === 'home' ? match.homeTeamName : decision.winnerSide === 'away' ? match.awayTeamName : '待核对')
  if (match.homeScore == null || match.awayScore == null) return '待录入'
  if (Number(match.homeScore) === Number(match.awayScore)) return '平局'
  return Number(match.homeScore) > Number(match.awayScore) ? match.homeTeamName : match.awayTeamName
}
const printDivisions = computed(() => printScope.value === 'all' ? divisions.value : divisions.value.filter(item => String(item.divisionId) === printScope.value))
function divisionProgress(division) {
  const rows = props.matches.filter(match => String(match.divisionId || '') === String(division.divisionId || ''))
  const completed = rows.filter(match => match.resultStatus === 'approved').length
  return { total: rows.length, completed, remaining: Math.max(0, rows.length - completed), ready: rows.length > 0 && completed === rows.length }
}
const summary = computed(() => {
  const totalGoals = divisions.value.reduce((sum, item) => sum + (item.standings || []).reduce((groupSum, group) => groupSum + (group.rows || []).reduce((rowSum, row) => rowSum + Number(row.goalsFor || 0), 0), 0), 0)
  const totalTeams = divisions.value.reduce((sum, item) => sum + Number(item.teamCount || 0), 0)
  return { matches: props.awards.totalMatches || 0, submitted: props.awards.submittedMatches || 0, goals: totalGoals, teams: totalTeams }
})
const printedAt = computed(() => new Date().toLocaleDateString('zh-CN'))

const dialogVisible = ref(false)
const dialogForm = ref({ divisionId: '', awardKey: '', awardTitle: '', playerId: '', playerName: '', note: '' })
const saving = ref(false)
const dialogCandidates = computed(() => {
  const division = divisions.value.find(item => item.divisionId === dialogForm.value.divisionId)
  return division ? division.candidates || [] : []
})

function openAdjust(division, awardKey, awardTitle) {
  dialogForm.value = { divisionId: division.divisionId, awardKey, awardTitle, playerId: '', playerName: '', note: '' }
  dialogVisible.value = true
}

async function saveAdjust() {
  if (!dialogForm.value.playerId && !dialogForm.value.playerName) { ElMessage.warning('请选择或填写获奖球员'); return }
  saving.value = true
  try {
    const result = await callFunction('resultCenter', {
      action: 'saveAwardOverride',
      tournamentId: props.tournamentId,
      divisionId: dialogForm.value.divisionId,
      awardKey: dialogForm.value.awardKey,
      playerId: dialogForm.value.playerId,
      playerName: dialogForm.value.playerName,
      note: dialogForm.value.note
    })
    if (result && result.success === false) throw new Error(result.message || '调整失败')
    ElMessage.success(result.message || '已保存')
    dialogVisible.value = false
    emit('refresh')
  } catch (error) {
    ElMessage.error(error.message || '调整失败')
  } finally {
    saving.value = false
  }
}

async function restoreAuto(division, awardKey) {
  try {
    await ElMessageBox.confirm('恢复后该奖项将按数据自动评定，确定继续？', '恢复自动评定', { type: 'warning' })
  } catch { return }
  try {
    const result = await callFunction('resultCenter', { action: 'clearAwardOverride', tournamentId: props.tournamentId, divisionId: division.divisionId, awardKey })
    if (result && result.success === false) throw new Error(result.message || '操作失败')
    ElMessage.success('已恢复自动评定')
    emit('refresh')
  } catch (error) {
    ElMessage.error(error.message || '操作失败')
  }
}

async function printScorebook(division = null) {
  if (division && !divisionProgress(division).ready) return ElMessage.warning(`本组还有 ${divisionProgress(division).remaining} 场未形成正式赛果`)
  if (!division && !ready.value) return ElMessage.warning('全部比赛形成正式赛果后才能打印整届成绩册')
  printScope.value = division ? String(division.divisionId) : 'all'
  await nextTick()
  window.print()
}
async function exportDivisionPdf(division = null) {
  if (division && !divisionProgress(division).ready) return ElMessage.warning(`本组还有 ${divisionProgress(division).remaining} 场未形成正式赛果`)
  if (!division && !ready.value) return ElMessage.warning('全部比赛形成正式赛果后才能导出整届成绩册')
  if (exportingPdf.value) return
  exportingPdf.value = true
  printScope.value = division ? String(division.divisionId) : 'all'
  try {
    await nextTick()
    const pages = [...(printRoot.value?.querySelectorAll('.print-page') || [])]
    if (!pages.length) throw new Error('未找到成绩册内容')
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
    const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' })
    for (const [index, page] of pages.entries()) {
      const canvas = await html2canvas(page, {
        scale:2, backgroundColor:'#fff', useCORS:true, logging:false,
        onclone(doc) {
          const root = doc.querySelector('[data-scorebook-print-root]')
          if (root) { root.style.display = 'block'; root.style.position = 'static'; root.style.width = '210mm' }
        }
      })
      if (index) pdf.addPage()
      const pageWidth=pdf.internal.pageSize.getWidth(),pageHeight=pdf.internal.pageSize.getHeight()
      const ratio=Math.min(pageWidth/canvas.width,pageHeight/canvas.height)
      const width=canvas.width*ratio,height=canvas.height*ratio
      pdf.addImage(canvas.toDataURL('image/jpeg',0.88),'JPEG',(pageWidth-width)/2,0,width,height)
    }
    const safeName = `${props.tournament.name || '赛事'}-${division?.divisionName || '整届'}-成绩册`.replace(/[\\/:*?"<>|]/g,'-')
    pdf.save(`${safeName}.pdf`)
    ElMessage.success('成绩册已下载')
  } catch (error) { ElMessage.error(error.message || 'PDF 导出失败，请重试') }
  finally { exportingPdf.value = false }
}

function playerLine(player) {
  if (!player) return '待评定'
  return player.name || '待评定'
}
function playerMeta(player) {
  if (!player) return ''
  const parts = [player.teamName]
  if (player.positionLabel) parts.push(player.positionLabel)
  return parts.filter(Boolean).join(' · ')
}
</script>

<template>
  <section class="scorebook-section">
    <header class="section-heading">
      <div>
        <h2>成绩册</h2>
      </div>
      <div class="scorebook-actions">
        <el-tag :type="ready ? 'success' : 'warning'" effect="plain">{{ ready ? '全部赛果已完成' : `待完成 ${summary.matches - summary.submitted} 场` }}</el-tag>
        <el-button type="success" :disabled="!selectedDivision || !divisionProgress(selectedDivision).ready" :loading="exportingPdf" @click="exportDivisionPdf(selectedDivision)">导出本组</el-button>
        <el-button plain :disabled="!ready" :loading="exportingPdf" @click="exportDivisionPdf()">导出整届</el-button>
        <el-button plain :disabled="!ready || exportingPdf" @click="printScorebook()">打印整届</el-button>
      </div>
    </header>

    <div v-if="!divisions.length" class="panel"><el-empty description="当前赛事暂无可用奖项数据" /></div>

    <el-tabs v-if="divisions.length" v-model="activeDivisionId" class="division-tabs">
      <el-tab-pane v-for="division in divisions" :key="division.divisionId" :name="String(division.divisionId)" :label="division.divisionName" />
    </el-tabs>

    <article v-if="selectedDivision" :key="selectedDivision.divisionId" class="panel scorebook-card">
      <template v-for="division in [selectedDivision]" :key="division.divisionId">
      <header class="card-head">
        <div><h3>{{ division.divisionName }}</h3><p>{{ divisionProgress(division).completed }} / {{ divisionProgress(division).total }} 场正式赛果 · {{ division.teamCount }} 支球队</p></div>
        <div class="division-actions">
          <span v-if="!divisionProgress(division).ready">还差 {{ divisionProgress(division).remaining }} 场</span>
          <el-button size="small" :disabled="!divisionProgress(division).ready || exportingPdf" @click="printScorebook(division)">打印本组</el-button>
        </div>
      </header>

      <div class="award-grid">
        <section class="award-box">
          <div class="award-title"><span>金靴奖 · 最佳射手</span><el-button link type="primary" @click="openAdjust(division, 'topScorer', '金靴奖')">调整</el-button></div>
          <b class="award-name">{{ playerLine(division.topScorer) }}</b>
          <p class="award-meta">{{ playerMeta(division.topScorer) }}</p>
          <p class="award-stat">{{ division.topScorer ? `进球 ${division.topScorer.goals} · 助攻 ${division.topScorer.assists || 0}` : '暂无进球记录' }}</p>
          <el-button v-if="division.topScorer && division.topScorer.manual" link type="warning" @click="restoreAuto(division, 'topScorer')">恢复自动</el-button>
        </section>

        <section class="award-box">
          <div class="award-title"><span>MVP · 最有价值球员</span><el-button link type="primary" @click="openAdjust(division, 'mvp', 'MVP')">调整</el-button></div>
          <b class="award-name">{{ playerLine(division.mvp) }}</b>
          <p class="award-meta">{{ playerMeta(division.mvp) }}</p>
          <p class="award-stat">{{ division.mvp ? `贡献分 ${division.mvp.contribution} · 进球 ${division.mvp.goals} · 助攻 ${division.mvp.assists || 0}` : '暂无可评球员' }}</p>
          <el-button v-if="division.mvp && division.mvp.manual" link type="warning" @click="restoreAuto(division, 'mvp')">恢复自动</el-button>
        </section>

        <section class="award-box">
          <div class="award-title"><span>金手套奖 · 最佳守门员</span><el-button link type="primary" @click="openAdjust(division, 'goalkeeper', '金手套奖')">调整</el-button></div>
          <b class="award-name">{{ playerLine(division.goalkeeper) }}</b>
          <p class="award-meta">{{ playerMeta(division.goalkeeper) }}</p>
          <p class="award-stat">{{ division.goalkeeper ? `零封 ${division.goalkeeper.cleanSheets ?? 0} 场 · 出场 ${division.goalkeeper.gkAppearances ?? 0} 场 · 失球 ${division.goalkeeper.gkConceded ?? 0}` : '未记录门将首发' }}</p>
          <el-button v-if="division.goalkeeper && division.goalkeeper.manual" link type="warning" @click="restoreAuto(division, 'goalkeeper')">恢复自动</el-button>
        </section>
      </div>

      <section class="best-xi">
        <div class="award-title"><span>最佳阵容（8 人制 1-3-3-1）</span></div>
        <div class="xi-grid">
          <div v-for="(slot, index) in division.bestXI" :key="`${division.divisionId}-xi-${index}`" class="xi-slot">
            <small>{{ slot.slot }}</small>
            <b>{{ slot.name }}</b>
            <span>{{ slot.teamName }}</span>
            <em v-if="slot.filled">补位</em>
            <el-button v-if="slot.manual" link type="warning" @click="restoreAuto(division, `bestXI:${slot.slot}`)">恢复自动</el-button>
          </div>
          <el-empty v-if="!division.bestXI.length" description="暂无足够出场数据评定最佳阵容" :image-size="60" />
        </div>
      </section>

      <section class="team-awards">
        <div class="award-title"><span>球队奖项</span></div>
        <ul>
          <li v-for="award in division.teamAwards" :key="award.key"><span>{{ award.title }}</span><b>{{ award.teamName }}</b><small>{{ award.note }}</small></li>
        </ul>
      </section>
      <section class="scorebook-results">
        <h4>全部赛果 · {{ divisionMatches(division).length }} 场</h4>
        <table class="results-table"><thead><tr><th>场序</th><th>阶段</th><th>日期 / 场地</th><th>主队</th><th>比分</th><th>客队</th><th>胜方</th></tr></thead><tbody><tr v-for="row in divisionMatches(division)" :key="row.id || row._id"><td>{{ row.matchSequence || row.matchNo || '—' }}</td><td>{{ stageText(row) }}</td><td>{{ row.matchDate || '待定' }} {{ row.matchTime }}<small>{{ row.venue }}</small></td><td>{{ row.homeTeamName }}</td><td><b>{{ row.homeScore ?? '—' }} : {{ row.awayScore ?? '—' }}</b><MatchDecision :match="row" /></td><td>{{ row.awayTeamName }}</td><td>{{ winnerText(row) }}</td></tr></tbody></table>
      </section>
      </template>
    </article>

    <el-collapse v-if="selectedDivision" class="rules-collapse"><el-collapse-item title="颁奖依据"><ol><li v-for="(rule, index) in awards.rules || []" :key="index">{{ rule }}</li></ol></el-collapse-item></el-collapse>

    <el-dialog v-model="dialogVisible" :title="`调整${dialogForm.awardTitle}`" width="460px">
      <el-form label-width="90px">
        <el-form-item label="候选球员">
          <el-select v-model="dialogForm.playerId" filterable placeholder="按姓名筛选本组球员" style="width:100%" @change="value => { const hit = dialogCandidates.find(item => item.playerId === value); dialogForm.playerName = hit ? hit.name : dialogForm.playerName }">
            <el-option v-for="player in dialogCandidates" :key="player.playerId" :label="`${player.name} · ${player.teamName || '无球队'} · ${player.positionLabel}`" :value="player.playerId" />
          </el-select>
        </el-form-item>
        <el-form-item label="获奖球员"><el-input v-model="dialogForm.playerName" placeholder="未在候选列表时可直接填写姓名" /></el-form-item>
        <el-form-item label="调整说明"><el-input v-model="dialogForm.note" type="textarea" :rows="2" maxlength="120" placeholder="例如：门将位置数据缺失，按现场评选补充" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="saveAdjust">保存</el-button></template>
    </el-dialog>

    <!-- A4 打印稿：仅打印时可见 -->
    <div ref="printRoot" class="print-root" data-scorebook-print-root>
      <section v-if="printScope === 'all'" class="print-page cover">
        <div class="cover-brand">赛小蜂足球</div>
        <h1>{{ tournament.name || '赛事成绩册' }}</h1>
        <p class="cover-sub">{{ (tournament.startDate || '').slice(0, 10) }}<template v-if="tournament.endDate"> — {{ tournament.endDate.slice(0, 10) }}</template><template v-if="tournament.location"> · {{ tournament.location }}</template></p>
        <div class="cover-meta">
          <div><b>{{ summary.teams }}</b><span>参赛球队</span></div>
          <div><b>{{ summary.matches }}</b><span>比赛场次</span></div>
          <div><b>{{ summary.goals }}</b><span>总进球</span></div>
        </div>
        <p class="cover-foot">成绩册由赛小蜂足球赛事系统依据正式赛果自动生成 · {{ printedAt }}</p>
      </section>

      <section v-if="printScope === 'all'" class="print-page">
        <h2 class="print-h2">全赛事奖项</h2>
        <div class="print-overall">
          <div><small>总 MVP</small><b>{{ playerLine(awards.overall && awards.overall.mvp) }}</b><span>{{ awards.overall && awards.overall.mvp ? `${awards.overall.mvp.teamName} · ${awards.overall.mvp.divisionName}` : '' }}</span></div>
          <div><small>总最佳射手（金靴）</small><b>{{ playerLine(awards.overall && awards.overall.topScorer) }}</b><span>{{ awards.overall && awards.overall.topScorer ? `${awards.overall.topScorer.teamName} · ${awards.overall.topScorer.goals} 球` : '' }}</span></div>
        </div>
        <table class="print-table">
          <thead><tr><th>组别</th><th>冠军</th><th>亚军</th><th>最佳射手</th><th>MVP</th><th>最佳守门员</th></tr></thead>
          <tbody><tr v-for="division in divisions" :key="`print-sum-${division.divisionId}`"><td>{{ division.divisionName }}</td><td>{{ division.champion ? division.champion.teamName : '—' }}</td><td>{{ division.runnerUp ? division.runnerUp.teamName : '—' }}</td><td>{{ division.topScorer ? division.topScorer.name : '—' }}</td><td>{{ division.mvp ? division.mvp.name : '—' }}</td><td>{{ division.goalkeeper ? division.goalkeeper.name : '—' }}</td></tr></tbody>
        </table>
        <h3 class="print-h3">颁奖依据</h3>
        <ol class="print-rules"><li v-for="(rule, index) in awards.rules || []" :key="index">{{ rule }}</li></ol>
      </section>

      <template v-for="division in printDivisions" :key="`print-${division.divisionId}`">
      <section class="print-page">
        <h2 class="print-h2">{{ division.divisionName }}</h2>
        <div class="print-awards">
          <div><small>冠军</small><b>{{ division.champion ? division.champion.teamName : '—' }}</b></div>
          <div><small>亚军</small><b>{{ division.runnerUp ? division.runnerUp.teamName : '—' }}</b></div>
          <div><small>金靴奖</small><b>{{ playerLine(division.topScorer) }}</b><span>{{ division.topScorer ? division.topScorer.teamName + ' · ' + division.topScorer.goals + ' 球' : '' }}</span></div>
          <div><small>MVP</small><b>{{ playerLine(division.mvp) }}</b><span>{{ division.mvp ? division.mvp.teamName : '' }}</span></div>
          <div><small>金手套</small><b>{{ playerLine(division.goalkeeper) }}</b><span>{{ division.goalkeeper ? division.goalkeeper.teamName + ' · 零封 ' + (division.goalkeeper.cleanSheets || 0) : '' }}</span></div>
        </div>
        <h3 class="print-h3">最佳阵容（1-3-3-1）</h3>
        <div class="print-xi"><span v-for="(slot, index) in division.bestXI" :key="index">{{ slot.slot }}：{{ slot.name }}<i v-if="slot.filled">（补位）</i></span></div>
        <h3 class="print-h3">球队奖项</h3>
        <table class="print-table"><thead><tr><th>奖项</th><th>球队</th><th>依据</th></tr></thead><tbody><tr v-for="award in division.teamAwards" :key="award.key"><td>{{ award.title }}</td><td>{{ award.teamName }}</td><td>{{ award.note }}</td></tr></tbody></table>
        <p class="print-foot">{{ tournament.name }} · {{ division.divisionName }} · 赛小蜂足球</p>
      </section>
      <section class="print-page">
        <h2 class="print-h2">{{ division.divisionName }} · 积分与依据</h2>
        <template v-for="group in division.standings" :key="`print-standings-${group.groupName}`">
          <h3 class="print-h3">{{ group.groupName }} 积分榜</h3>
          <table class="print-table">
            <thead><tr><th>名次</th><th>球队</th><th>赛</th><th>胜</th><th>平</th><th>负</th><th>进球</th><th>失球</th><th>净胜</th><th>积分</th></tr></thead>
            <tbody><tr v-for="row in group.rows" :key="`${group.groupName}-${row.rank}`"><td>{{ row.rank }}</td><td>{{ row.teamName }}</td><td>{{ row.played }}</td><td>{{ row.wins }}</td><td>{{ row.draws }}</td><td>{{ row.losses }}</td><td>{{ row.goalsFor }}</td><td>{{ row.goalsAgainst }}</td><td>{{ row.goalDifference > 0 ? '+' + row.goalDifference : row.goalDifference }}</td><td><b>{{ row.points }}</b></td></tr></tbody>
          </table>
        </template>
        <h3 class="print-h3">颁奖依据</h3>
        <ol class="print-rules"><li v-for="(rule, index) in awards.rules || []" :key="index">{{ rule }}</li></ol>
        <p class="print-foot">{{ tournament.name }} · {{ division.divisionName }} · 赛小蜂足球</p>
      </section>
      <section v-for="(rows, pageIndex) in resultPages(division)" :key="`results-${division.divisionId}-${pageIndex}`" class="print-page results-page">
        <h2 class="print-h2">{{ division.divisionName }} · 全部赛果</h2>
        <p>共 {{ divisionMatches(division).length }} 场 · 第 {{ pageIndex + 1 }} / {{ resultPages(division).length }} 页</p>
        <table class="print-table result-print-table"><thead><tr><th>场序</th><th>阶段</th><th>日期 / 场地</th><th>主队</th><th>比分</th><th>客队</th><th>胜方</th></tr></thead><tbody><tr v-for="row in rows" :key="row.id || row._id"><td>{{ row.matchSequence || row.matchNo || '—' }}</td><td>{{ stageText(row) }}</td><td>{{ row.matchDate || '待定' }} {{ row.matchTime }}<small>{{ row.venue }}</small></td><td>{{ row.homeTeamName }}</td><td><b>{{ row.homeScore ?? '—' }} : {{ row.awayScore ?? '—' }}</b><MatchDecision :match="row" /></td><td>{{ row.awayTeamName }}</td><td>{{ winnerText(row) }}</td></tr></tbody></table>
        <p class="print-foot">{{ tournament.name }} · {{ division.divisionName }} · 赛小蜂足球</p>
      </section>
      </template>
    </div>
  </section>
</template>

<style scoped>
.scorebook-section{display:flex;flex-direction:column;gap:16px}
.scorebook-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.scorebook-results{margin-top:22px}.scorebook-results h4{margin:0 0 10px}.results-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px}.results-table th,.results-table td{padding:10px 6px;border-bottom:1px solid #e3eae5;text-align:center;overflow-wrap:anywhere}.results-table th{background:#f1f6f2}.results-table td small,.result-print-table td small{display:block;margin-top:3px;font-size:10px}.results-table th:first-child{width:5%}.results-table th:nth-child(2){width:11%}.results-table th:nth-child(3){width:16%}.results-table th:nth-child(5){width:16%}.result-print-table{table-layout:fixed}.result-print-table td{overflow-wrap:anywhere;line-height:1.4}.result-print-table th:first-child{width:5%}.result-print-table th:nth-child(2){width:10%}.result-print-table th:nth-child(3){width:16%}.result-print-table th:nth-child(5){width:17%}
.scorebook-card{padding:18px 20px;max-width:1400px}
.division-tabs :deep(.el-tabs__header){margin:0}.division-tabs :deep(.el-tabs__item){font-weight:600}
.card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;border-bottom:1px solid #eef1ee;padding-bottom:12px}
.card-head h3{margin:0;font-size:18px;color:#1B5E20}
.card-head p{margin:4px 0 0;font-size:13px;color:#7a8a80}
.division-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.division-actions>span{font-size:12px;color:#9a6a16}
.award-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:14px}
.award-box{background:#f7faf7;border:1px solid #e6eee7;border-radius:10px;padding:14px}
.award-title{display:flex;justify-content:space-between;align-items:center;font-size:13px;color:#5c6b62;font-weight:600}
.award-name{display:block;font-size:20px;color:#17321f;margin:6px 0 2px}
.award-meta{margin:0;font-size:13px;color:#6f8077}
.award-stat{margin:6px 0 0;font-size:13px;color:#1B5E20}
.best-xi{margin-top:16px}
.xi-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:10px}
.xi-slot{background:#fff;border:1px dashed #cfdad2;border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:2px}
.xi-slot small{font-size:12px;color:#8b9a91}
.xi-slot b{font-size:16px;color:#17321f}
.xi-slot span{font-size:12px;color:#6f8077}
.xi-slot em{font-style:normal;font-size:11px;color:#b07b1e}
.team-awards{margin-top:16px}
.team-awards ul{list-style:none;margin:10px 0 0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 18px}
.team-awards li{display:grid;grid-template-columns:132px minmax(0,1fr);align-items:center;gap:3px 10px;border-bottom:1px solid #e5ebe7;padding:9px 2px;font-size:13px}
.team-awards li b{color:#1B5E20;font-size:15px}
.team-awards li small{grid-column:2;color:#8b9a91}
.rules-collapse{max-width:1400px}.rules-collapse ol{margin:10px 0 0;padding-left:20px;font-size:13px;line-height:1.8;color:#4d5b53}
@media(max-width:900px){.xi-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.team-awards ul{grid-template-columns:1fr}.card-head{flex-wrap:wrap}}
.print-root{display:none}
@media print{
  @page{size:A4;margin:0}
  :global(body *){visibility:hidden!important}
  .print-root,.print-root *{visibility:visible!important}
  .print-root{display:block!important;position:absolute;left:0;top:0;width:210mm}
}
.print-page{width:210mm;min-height:297mm;padding:18mm 16mm;box-sizing:border-box;page-break-after:always;color:#16301f;background:#fff}
.print-page:last-child{page-break-after:auto}
  .cover{display:flex;flex-direction:column;justify-content:center;align-items:center;background:#0f3d22;color:#fff;text-align:center}
  .cover-brand{letter-spacing:6px;font-size:13px;opacity:.8}
  .cover h1{font-size:34px;margin:18px 0 10px;line-height:1.35}
  .cover-sub{font-size:14px;opacity:.85;margin:0}
  .cover-meta{display:flex;gap:44px;margin:44px 0}
  .cover-meta div{display:flex;flex-direction:column;align-items:center}
  .cover-meta b{font-size:30px}
  .cover-meta span{font-size:12px;opacity:.75;margin-top:4px}
  .cover-foot{font-size:11px;opacity:.7;margin-top:30px}
  .print-h2{font-size:21px;color:#0f3d22;border-bottom:2px solid #0f3d22;padding-bottom:8px;margin:0 0 14px}
  .print-h3{font-size:14px;color:#0f3d22;margin:18px 0 8px}
  .print-overall{display:flex;gap:14px;margin-bottom:16px}
  .print-overall div{flex:1;border:1px solid #d9e3db;border-radius:8px;padding:12px}
  .print-overall small{font-size:11px;color:#6f8077}
  .print-overall b{display:block;font-size:19px;margin:4px 0 2px}
  .print-overall span{font-size:11px;color:#6f8077}
  .print-table{width:100%;border-collapse:collapse;font-size:11px}
  .print-table th{background:#0f3d22;color:#fff;padding:6px 4px;font-weight:600}
  .print-table td{border-bottom:1px solid #e3eae5;padding:6px 4px;text-align:center}
  .print-table td:nth-child(2),.print-table td:nth-child(4),.print-table td:nth-child(5),.print-table td:nth-child(6){text-align:left}
  .print-rules{font-size:10.5px;line-height:1.7;padding-left:16px;color:#4d5b53}
  .print-awards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
  .print-awards div{border:1px solid #d9e3db;border-radius:8px;padding:10px}
  .print-awards small{font-size:10px;color:#6f8077}
  .print-awards b{display:block;font-size:15px;margin:3px 0}
  .print-awards span{font-size:10px;color:#6f8077}
  .print-xi{display:flex;flex-wrap:wrap;gap:8px;font-size:11.5px}
  .print-xi span{border:1px dashed #b9c9be;border-radius:6px;padding:5px 9px}
  .print-xi i{font-style:normal;color:#b07b1e}
  .print-foot{margin-top:22px;font-size:10px;color:#8b9a91;text-align:center}
</style>
