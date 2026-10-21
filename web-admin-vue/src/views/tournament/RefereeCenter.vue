<template>
  <section class="referee-center">
    <header class="rc-header">
      <div class="rc-heading">
        <el-button text @click="emit('navigate','workbench')">返回赛程中心</el-button>
        <h1>裁判中心</h1>
        <div class="rc-context">
          <strong>{{ tournament.name || '当前赛事' }}</strong>
          <span>已排 {{ scheduledMatches.length }} / {{ matches.length }} 场</span>
          <el-tag effect="plain" :type="unassignedCount ? 'warning' : 'success'">未安排裁判 {{ unassignedCount }} 场</el-tag>
          <el-tag v-if="lockedCount" effect="plain" type="info">记录锁定 {{ lockedCount }} 场</el-tag>
        </div>
      </div>
      <div class="rc-actions">
        <el-button type="warning" :loading="assigning" @click="emit('autoAssign')"><el-icon><MagicStick /></el-icon>一键安排裁判</el-button>
        <el-button type="success" plain :disabled="!scheduledMatches.length" @click="openExport"><el-icon><Download /></el-icon>导出安排表</el-button>
        <el-button plain @click="emit('docs')"><el-icon><Tickets /></el-icon>裁判赛前文档</el-button>
      </div>
    </header>

    <el-alert v-if="unscheduledCount" class="rc-note" type="info" :closable="false" show-icon>
      <template #title>还有 {{ unscheduledCount }} 场比赛未排定日期或时间，安排裁判前请先完成赛程编排。<el-button link type="primary" @click="emit('navigate','workbench')">去编排</el-button></template>
    </el-alert>

    <div v-if="!scheduledMatches.length" class="rc-empty"><el-empty description="还没有已排定日期和时间的比赛，先到赛程中心完成编排再安排裁判" /></div>

    <article v-for="group in dateGroups" :key="group.date" class="rc-date-group">
      <header class="rc-date-head"><strong>{{ group.date }}</strong><span>{{ group.weekday }} · {{ group.matches.length }} 场</span><i /></header>
      <div v-for="match in group.matches" :key="match._id" class="rc-match" :class="{ 'is-locked': match.refereeRecordLocked, 'is-incomplete': !isCrewComplete(match) }">
        <div class="rc-match-main">
          <span class="rc-seq">#{{ match.matchSequence || match.matchNo || '—' }}</span>
          <span class="rc-time">{{ match.matchTime }}</span>
          <span class="rc-venue">{{ match.venue || '场地待定' }}</span>
          <span class="rc-division">{{ match.divisionName || '—' }}</span>
          <strong class="rc-teams">{{ teamLabel(match,'home') }} <em>VS</em> {{ teamLabel(match,'away') }}</strong>
        </div>
        <div class="rc-crew">
          <span v-for="role in crewOf(match)" :key="role.key" :class="{ vacant: !role.filled }"><label>{{ role.label }}</label><b>{{ role.name || (role.optional ? '—' : role.filled ? '已指派' : '待安排') }}</b></span>
        </div>
        <div class="rc-side">
          <el-tag v-if="match.refereeRecordLocked" size="small" type="info" effect="plain">已锁定</el-tag>
          <el-tag v-else-if="isCrewComplete(match)" size="small" type="success" effect="plain">已安排</el-tag>
          <el-tag v-else size="small" type="warning" effect="plain">待补 {{ vacancyCount(match) }} 岗</el-tag>
          <el-button link type="success" :disabled="!canAssign || !canAssign(match)" @click="emit('referee',match)">调整</el-button>
        </div>
      </div>
    </article>

    <el-dialog v-model="exportVisible" title="导出裁判安排表" width="min(1180px,96vw)" class="referee-export-dialog" :close-on-click-modal="false">
      <div class="export-toolbar">
        <el-select v-model="roundFilter" class="round-select" aria-label="按轮次筛选">
          <el-option label="全部轮次" value="all" />
          <el-option v-for="round in rounds" :key="round" :label="round" :value="round" />
        </el-select>
        <span class="export-summary">共 {{ exportSheet.meta.total }} 场 · 比赛日期 {{ exportSheet.meta.dateRange }} · {{ exportSheet.meta.venues.length }} 个场地</span>
      </div>
      <div ref="exportPreviewEl" class="export-preview" v-html="previewHtml" />
      <template #footer><span class="export-foot-hint">{{ roundFilter === 'all' ? '导出全部轮次的裁判安排；可在上方选择单个轮次只导出该轮。' : `当前只导出「${roundFilter}」的 ${exportSheet.meta.total} 场。` }}</span><el-button @click="exportVisible=false">关闭</el-button><el-button :loading="printing" @click="printSheet">打印</el-button><el-button :loading="exportingPdf" @click="runExportPdf">导出 PDF</el-button><el-button :loading="exportingWord" @click="runExportWord">导出 Word</el-button><el-button type="success" :loading="exportingXlsx" @click="runExportXlsx">导出 Excel</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { MagicStick, Tickets, Download } from '@element-plus/icons-vue'
import { buildRefereeSheet, refereeSheetHtml, openRefereePrint, exportRefereeWord, exportRefereeXlsx } from '../../utils/scheduleExportWorkbook.mjs'

const props = defineProps({
  matches: { type: Array, default: () => [] },
  event: { type: Object, default: () => ({}) },
  canAssign: { type: Function, default: null },
  config: { type: Object, default: () => ({ defaultCrewSize: 4, allowMainAsFourth: true, defaultAllRoles: true }) },
  assigning: { type: Boolean, default: false }
})
const emit = defineEmits(['navigate', 'referee', 'autoAssign', 'docs'])

const tournament = computed(() => props.event)
const scheduledMatches = computed(() => props.matches.filter(match => match.matchDate && match.matchTime))
const unscheduledCount = computed(() => props.matches.length - scheduledMatches.value.length)
const unassignedCount = computed(() => scheduledMatches.value.filter(match => !match.refereeRecordLocked && !isCrewComplete(match)).length)
const lockedCount = computed(() => scheduledMatches.value.filter(match => match.refereeRecordLocked).length)

const WEEKDAYS = ['周日','周一','周二','周三','周四','周五','周六']
function weekdayOf(date) { const parsed = new Date(`${date}T00:00:00`); return Number.isNaN(parsed.getTime()) ? '' : WEEKDAYS[parsed.getDay()] }
function sequenceValue(match) { return Number(match.matchSequence || match.matchNo || 0) }
function groupMatches(list) {
  const map = new Map()
  list.slice().sort((a, b) => `${a.matchDate} ${a.matchTime}`.localeCompare(`${b.matchDate} ${b.matchTime}`) || sequenceValue(a) - sequenceValue(b)).forEach(match => {
    if (!map.has(match.matchDate)) map.set(match.matchDate, [])
    map.get(match.matchDate).push(match)
  })
  return [...map.entries()].map(([date, matches]) => ({ date, weekday: weekdayOf(date), matches }))
}
const dateGroups = computed(() => groupMatches(scheduledMatches.value))

function roleKeysFor(match) {
  const format = match.matchFormat || ''
  return /^(5|6)/.test(String(format))
    ? [{ key:'mainReferee', label:'主裁判' },{ key:'secondReferee', label:'第一助理裁判' },{ key:'thirdReferee', label:'第二助理裁判' },{ key:'timekeeper', label:'第四官员' }]
    : [{ key:'mainReferee', label:'主裁判' },{ key:'assistant1', label:'第一助理裁判' },{ key:'assistant2', label:'第二助理裁判' },{ key:'fourthOfficial', label:'第四官员' }]
}
function crewSizeOf(match) { return Math.min(4, Number(match.refereeCrewSize) || Number(props.config.defaultCrewSize) || 4) }
function crewName(match, key) { const person = match.refereeCrew?.[key]; if (!person || typeof person === 'string') return ''; return person.name || person.realName || person.refereeName || '' }
function crewId(match, key) { const person = match.refereeCrew?.[key]; if (!person) return ''; return typeof person === 'string' ? person : String(person._id || person.refereeId || '') }
function crewOf(match) { return roleKeysFor(match).slice(0, crewSizeOf(match)).map(role => ({ ...role, name: crewName(match, role.key), filled: Boolean(crewId(match, role.key)) })) }
function vacancyCount(match) { return crewOf(match).filter(role => !role.filled).length }
function isCrewComplete(match) { return crewOf(match).every(role => role.filled) }
function teamLabel(match, side) { return String(match?.[`${side}TeamName`] || match?.[`${side}SourceLabel`] || '待产生') }

// ============ 安排表导出（轮次筛选 + 打印 / PDF / Word / Excel） ============
const ROUND_DIGITS = ['','一','二','三','四','五','六','七','八','九','十']
function chineseRoundLabel(round) { const n = Math.max(1, Number(round) || 1); if (n <= 10) return `第${ROUND_DIGITS[n]}轮`; if (n < 20) return `第十${ROUND_DIGITS[n-10]}轮`; return `第${ROUND_DIGITS[Math.floor(n/10)]}十${ROUND_DIGITS[n%10]}轮` }
function roundLabelOf(match) {
  if (match.phase === 'group' || match.stage === 'group') return '小组赛'
  const named = match.roundName || match.scheduleStageName || match.stageName || ''
  if (named && named !== '联赛') return named
  const phase = String(match.phase || match.stage || '').toLowerCase()
  if (phase === 'knockout' || phase === 'placement') return '淘汰赛'
  if (Number(match.round) > 0) return chineseRoundLabel(match.round)
  return named || '联赛'
}
const rounds = computed(() => [...new Set(scheduledMatches.value.map(roundLabelOf))])
const roundFilter = ref('all')

const exportVisible = ref(false)
const printing = ref(false)
const exportingPdf = ref(false)
const exportingWord = ref(false)
const exportingXlsx = ref(false)
const exportPreviewEl = ref(null)

const roundFilteredMatches = computed(() => roundFilter.value === 'all' ? scheduledMatches.value : scheduledMatches.value.filter(match => roundLabelOf(match) === roundFilter.value))
const exportSheet = computed(() => buildRefereeSheet({
  groups: groupMatches(roundFilteredMatches.value).map(group => ({
    date: group.date,
    weekday: group.weekday,
    matches: group.matches.map(match => ({
      time: match.matchTime,
      venue: match.venue || '待定',
      division: match.divisionName || '—',
      serial: match.matchSequence || match.matchNo || '—',
      teams: `${teamLabel(match,'home')} VS ${teamLabel(match,'away')}`,
      crew: crewOf(match).map(role => role.name || (role.optional ? '—' : role.filled ? '已指派' : '待安排'))
    }))
  })),
  tournament: tournament.value,
  roundLabel: roundFilter.value === 'all' ? '全部轮次' : roundFilter.value
}))
const previewHtml = computed(() => exportSheet.value.meta.total ? refereeSheetHtml(exportSheet.value) : '<section class="rc-preview-empty">当前轮次暂无已排定日期和时间的比赛</section>')

function openExport() { if (!scheduledMatches.value.length) return ElMessage.info('还没有已排定日期和时间的比赛'); exportVisible.value = true }

function printSheet() {
  if (printing.value) return
  printing.value = true
  try { if (!openRefereePrint(exportSheet.value)) ElMessage.warning('打印预览被浏览器拦截，请允许打开新窗口后重试') }
  catch (error) { ElMessage.error(error.message || '打开打印预览失败') }
  finally { printing.value = false }
}

function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000) }

async function runExportPdf() {
  if (exportingPdf.value) return
  const sheetEl = exportPreviewEl.value?.querySelector('.referee-sheet')
  if (!sheetEl) return ElMessage.warning('预览尚未渲染完成，请稍后重试')
  exportingPdf.value = true
  try {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
    const canvas = await html2canvas(sheetEl, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false })
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
    const pageW = 297, pageH = 210, margin = 9
    const imgW = pageW - margin * 2, pagePxH = canvas.width * (pageH - margin * 2) / imgW
    // 分页切割对齐表格行边界，避免把一行切成两页。
    const sheetRect = sheetEl.getBoundingClientRect()
    const pxPerCss = canvas.width / sheetRect.width
    const rowTops = [...sheetEl.querySelectorAll('tbody tr')].map(tr => (tr.getBoundingClientRect().top - sheetRect.top) * pxPerCss).filter(top => top > 0).sort((a, b) => a - b)
    const pages = []; let startY = 0
    while (startY < canvas.height - 1) {
      let endY = Math.min(startY + pagePxH, canvas.height)
      if (endY < canvas.height - 1) { const boundary = rowTops.filter(top => top > startY + 4 && top <= endY).pop(); if (boundary && boundary > startY + pagePxH * 0.35) endY = boundary }
      pages.push({ startY, endY }); startY = endY
    }
    pages.forEach((page, index) => {
      const slice = document.createElement('canvas'); slice.width = canvas.width; slice.height = Math.ceil(page.endY - page.startY)
      slice.getContext('2d').drawImage(canvas, 0, page.startY, canvas.width, slice.height, 0, 0, canvas.width, slice.height)
      if (index > 0) pdf.addPage()
      pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, imgW, slice.height * imgW / canvas.width)
    })
    const safeName = String(tournament.value.name || '赛事').replace(/[\\/:*?"<>|]/g, '_')
    pdf.save(`${safeName}-裁判安排表-A4横版.pdf`)
    ElMessage.success('PDF 已导出')
  } catch (error) { ElMessage.error(error.message || '导出 PDF 失败，请重试') }
  finally { exportingPdf.value = false }
}

async function runExportWord() {
  if (exportingWord.value) return
  exportingWord.value = true
  try { const { blob, filename } = exportRefereeWord(exportSheet.value, { fileName: tournament.value.name || '赛事' }); downloadBlob(blob, filename); ElMessage.success(`已导出 ${filename}`) }
  catch (error) { ElMessage.error(error.message || '导出 Word 失败，请重试') }
  finally { exportingWord.value = false }
}

async function runExportXlsx() {
  if (exportingXlsx.value) return
  exportingXlsx.value = true
  try {
    const { buffer, filename } = await exportRefereeXlsx({ sheet: exportSheet.value, fileName: tournament.value.name || '赛事' })
    downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename)
    ElMessage.success(`已导出 ${filename}`)
  } catch (error) { ElMessage.error(error.message || '导出失败，请重试') }
  finally { exportingXlsx.value = false }
}
</script>

<style scoped>
.referee-center { display: flex; flex-direction: column; gap: 16px; }
.rc-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.rc-heading { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.rc-heading h1 { margin: 0; font-size: 22px; color: #14352a; }
.rc-context { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #5c6f65; }
.rc-context strong { color: #14352a; font-size: 14px; }
.rc-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.rc-note { border-radius: 10px; }
.rc-empty { background: #fff; border: 1px dashed #cfe0d6; border-radius: 14px; padding: 40px 0; }
.rc-date-group { background: #fff; border: 1px solid #e3ede7; border-radius: 14px; overflow: hidden; }
.rc-date-head { display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: #f2f8f4; border-bottom: 1px solid #e3ede7; }
.rc-date-head strong { font-size: 15px; color: #1b5e20; }
.rc-date-head span { font-size: 12px; color: #5c6f65; }
.rc-date-head i { flex: 1; }
.rc-match { display: grid; grid-template-columns: minmax(240px, auto) 1fr auto; gap: 20px; align-items: center; padding: 10px 16px; border-bottom: 1px solid #eef4f0; }
.rc-match:last-child { border-bottom: none; }
.rc-match.is-locked { background: #fafbfa; }
.rc-match.is-incomplete:not(.is-locked) { background: #fffdf7; }
.rc-match-main { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 13px; color: #33453c; }
.rc-seq { font-weight: bold; color: #1b5e20; min-width: 34px; }
.rc-time { font-variant-numeric: tabular-nums; color: #14352a; font-weight: 600; }
.rc-venue, .rc-division { color: #5c6f65; font-size: 12px; }
.rc-teams { color: #14352a; font-size: 14px; }
.rc-teams em { font-style: normal; color: #8aa598; font-size: 12px; margin: 0 4px; }
.rc-crew { display: flex; align-items: center; flex-wrap: wrap; flex: 1; justify-content: space-between; gap: 6px 12px; }
.rc-crew span { display: flex; align-items: baseline; gap: 6px; }
.rc-crew label { font-size: 12px; color: #6f8579; white-space: nowrap; }
.rc-crew b { font-size: 14px; color: #14352a; font-weight: 600; white-space: nowrap; }
.rc-crew span.vacant b { color: #c05621; font-weight: 500; }
.rc-side { display: flex; align-items: center; gap: 8px; justify-content: flex-end; }
.export-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.export-toolbar .round-select { width: 180px; }
.export-summary { font-size: 13px; color: #5c6f65; }
.export-preview { background: #eef3f0; border: 1px solid #dfe7e2; border-radius: 10px; padding: 18px; overflow: auto; max-height: 62vh; }
.export-preview :deep(.schedule-sheet) { background: #fff; padding: 18px 22px; margin: 0 auto; max-width: 1000px; font-size: 11px; color: #111; box-shadow: 0 6px 22px rgba(15, 40, 28, 0.10); }
.export-preview :deep(.schedule-sheet h1) { margin: 0; font-size: 11px; font-weight: 700; color: #087b43; letter-spacing: 1px; }
.export-preview :deep(.schedule-sheet h2) { margin: 6px 0 0; font-size: 20px; text-align: center; }
.export-preview :deep(.sheet-meta) { margin: 8px 0 0; display: flex; flex-wrap: wrap; gap: 6px 20px; justify-content: center; color: #3d4a42; font-size: 11px; }
.export-preview :deep(.sheet-notice) { margin: 8px 0 0; padding: 6px 10px; border: 1px solid #f0c9a0; background: #fffaf3; color: #8a5a1f; font-size: 11px; border-radius: 4px; }
.export-preview :deep(table) { width: 100%; border-collapse: collapse; margin-top: 10px; table-layout: fixed; }
.export-preview :deep(.col-date) { width: 9%; }
.export-preview :deep(.col-time) { width: 6%; }
.export-preview :deep(.col-venue) { width: 8%; }
.export-preview :deep(.col-division) { width: 6%; }
.export-preview :deep(.col-serial) { width: 5%; }
.export-preview :deep(.col-teams) { width: 28%; }
.export-preview :deep(.col-crew) { width: 9.5%; }
.export-preview :deep(th), .export-preview :deep(td) { border: 1px solid #6b7570; padding: 5px 6px; text-align: center; vertical-align: middle; word-break: break-word; }
.export-preview :deep(thead th) { background: #eaf3ee; font-weight: 700; }
.export-preview :deep(.cell-teams) { text-align: left; }
.export-preview :deep(.cell-teams b) { font-weight: 600; }
.export-preview :deep(.cell-teams span) { color: #087b43; margin: 0 5px; font-size: 10px; }
.export-preview :deep(td.vacant) { color: #b4551f; font-weight: 700; }
.export-preview :deep(td.na) { color: #87938c; }
.export-preview :deep(td .weekday) { color: #55605a; font-size: 9px; }
.export-preview :deep(footer) { display: flex; justify-content: space-between; gap: 16px; margin-top: 8px; color: #55605a; font-size: 10px; }
.export-preview :deep(.schedule-sheet-empty) { padding: 14pt; text-align: center; color: #87938c; }
.rc-preview-empty { padding: 32px; text-align: center; color: #87938c; }
.export-foot-hint { margin-right: auto; font-size: 12px; color: #66746b; }
@media (max-width: 960px) {
  .rc-match { grid-template-columns: 1fr; }
  .rc-side { justify-content: flex-start; }
}
</style>
