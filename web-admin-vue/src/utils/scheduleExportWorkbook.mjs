// 足球竞赛日程导出：八列标准行 → 页面预览 / A4 打印 / Excel 共用同一份数据
export const SCHEDULE_SHEET_COLUMNS = [
  { key: 'date', label: '日期' },
  { key: 'time', label: '时间' },
  { key: 'round', label: '轮次/阶段' },
  { key: 'division', label: '组别' },
  { key: 'group', label: '分组' },
  { key: 'teams', label: '比赛队' },
  { key: 'venue', label: '场地' },
  { key: 'serial', label: '场序' }
]
export const SCHEDULE_SHEET_NOTE = '比赛时间与场地以主办方最新发布的竞赛日程为准。'
const UNSCHEDULED = '未排'

// 从已保存比赛生成八列标准行；未排场次保留“未排”，不静默删除。
export function normalizeScheduleRows({ matches = [], divisionOrder = [], stageLabel, teamName, groupName, divisionLabel } = {}) {
  const order = new Map(divisionOrder.map((id, index) => [String(id), index]))
  return matches.map((match, index) => {
    const serial = Number(match.matchSequence ?? match.matchNo ?? match.matchIndex ?? 0) || index + 1
    const scheduled = Boolean(match.matchDate && match.matchTime && match.venue)
    return {
      id: String(match._id || ''),
      divisionKey: String(match.divisionId || 'default'),
      rawDate: String(match.matchDate || ''),
      rawTime: String(match.matchTime || ''),
      date: scheduled ? String(match.matchDate) : UNSCHEDULED,
      time: scheduled ? String(match.matchTime) : UNSCHEDULED,
      round: String(stageLabel?.(match) || ''),
      division: String(divisionLabel?.(match) || '竞赛组别'),
      group: String(groupName?.(match) || ''),
      teams: `${teamName?.(match, 'home') || '待产生'} VS ${teamName?.(match, 'away') || '待产生'}`,
      venue: scheduled ? String(match.venue) : UNSCHEDULED,
      serial,
      scheduled
    }
  }).sort((a, b) => {
    const left = order.has(a.divisionKey) ? order.get(a.divisionKey) : 999
    const right = order.has(b.divisionKey) ? order.get(b.divisionKey) : 999
    if (left !== right) return left - right
    if (a.scheduled !== b.scheduled) return a.scheduled ? -1 : 1
    // 已排场次按日期、时间先后排列（同一时刻再按场序），使表格按真实比赛时间顺序阅读：
    // 小组赛 → 排位赛 → 半决赛 → 三四名决赛 → 决赛，日期单调递增，决赛排在最后。
    if (a.scheduled && b.scheduled) {
      const byTime = `${a.rawDate} ${a.rawTime}`.localeCompare(`${b.rawDate} ${b.rawTime}`)
      if (byTime) return byTime
    }
    return a.serial - b.serial
  })
}

// 计算连续合并区间：只合并相邻且键相同的行，不跨越不连续记录。
export function groupContinuousRows(rows, keyOf) {
  const spans = new Map()
  let start = 0
  while (start < rows.length) {
    let end = start
    while (end + 1 < rows.length && keyOf(rows[end + 1]) === keyOf(rows[start])) end += 1
    spans.set(start, { span: end - start + 1, value: keyOf(rows[start]) })
    start = end + 1
  }
  return spans
}

// 同场地、同日期、同时间出现多场时标记为场地冲突。
function findVenueConflicts(rows) {
  const groups = new Map()
  for (const row of rows) {
    if (!row.scheduled) continue
    const key = `${row.rawDate}|${row.rawTime}|${row.venue}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  return [...groups.values()]
    .filter(list => list.length > 1)
    .map(list => `${list[0].rawDate} ${list[0].rawTime} ${list[0].venue}（第${list.map(row => row.serial).join('、')}场）`)
}

function formatPreparedAt(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// 生成页面预览 / A4 预览 / Excel 共用的表格模型。
export function buildScheduleSheet({ rows = [], tournament = {}, divisionName = '全部组别', orientation = 'portrait', filters = [], preparedAt = new Date() } = {}) {
  const dates = [...new Set(rows.filter(row => row.scheduled).map(row => row.rawDate))].sort()
  const unscheduled = rows.filter(row => !row.scheduled)
  const conflicts = findVenueConflicts(rows)
  const dateSpans = groupContinuousRows(rows, row => row.date)
  // 轮次合并只按组别+轮次，不按日期切断：一轮比赛因当天时段排满顺延到下一个比赛日时，
  // 轮次格跨日合并为一格，不再出现同轮标签（如两个“第二轮”）分段显示。
  const roundSpans = groupContinuousRows(rows, row => `${row.divisionKey}|${row.round}`)
  return {
    columns: SCHEDULE_SHEET_COLUMNS,
    rows,
    dateSpans,
    roundSpans,
    orientation,
    meta: {
      tournamentName: String(tournament.name || '赛事'),
      divisionName,
      dateRange: dates.length ? `${dates[0]} 至 ${dates[dates.length - 1]}` : '待定',
      venues: [...new Set(rows.filter(row => row.scheduled).map(row => row.venue))],
      orientation,
      orientationLabel: orientation === 'portrait' ? 'A4 竖版' : 'A4 横版',
      preparedAt: formatPreparedAt(preparedAt),
      note: SCHEDULE_SHEET_NOTE,
      total: rows.length,
      unscheduledCount: unscheduled.length,
      unscheduledSerials: unscheduled.map(row => row.serial),
      conflicts,
      filterNotice: filters.length ? `当前应用筛选：${filters.join('、')}，导出只包含筛选后的 ${rows.length} 场。` : ''
    }
  }
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
}

const PRINT_STYLE = `*{box-sizing:border-box}html,body{margin:0;background:#e9ecef;font-family:"微软雅黑",system-ui,sans-serif}
.print-toolbar{position:sticky;top:0;z-index:10;height:58px;padding:0 24px;background:#0f1613;color:#fff;display:flex;align-items:center;justify-content:space-between}
.print-toolbar div{display:flex;gap:10px}.print-toolbar button{height:36px;padding:0 20px;border:1px solid #087b43;border-radius:6px;background:#087b43;color:#fff;font-weight:700;cursor:pointer}
.print-toolbar button.secondary{background:transparent;color:#7fd2a4}
.print-page{padding:24px}.print-page .schedule-sheet{box-shadow:0 8px 30px #0003}
.schedule-sheet{background:#fff;padding:14mm 10mm;color:#111;font-size:11px}
.schedule-sheet h1{margin:0;font-size:11px;font-weight:700;color:#087b43;letter-spacing:1px}
.schedule-sheet h2{margin:6px 0 0;font-size:20px;text-align:center}
.schedule-sheet .sheet-meta{margin:8px 0 0;display:flex;flex-wrap:wrap;gap:6px 22px;justify-content:center;color:#3d4a42;font-size:11px}
.schedule-sheet .sheet-notice{margin:8px 0 0;padding:6px 10px;border:1px solid #f0c9a0;background:#fffaf3;color:#8a5a1f;font-size:11px;border-radius:4px}
.schedule-sheet table{width:100%;border-collapse:collapse;margin-top:10px;table-layout:fixed}
.schedule-sheet th,.schedule-sheet td{border:1px solid #6b7570;padding:5px 6px;text-align:center;vertical-align:middle;word-break:break-word}
.schedule-sheet thead th{background:#eaf3ee;font-weight:700}
.schedule-sheet .col-teams{width:34%}.schedule-sheet .col-serial{width:7%}
.schedule-sheet .cell-teams{text-align:left}.schedule-sheet .cell-teams b{font-weight:600}
.schedule-sheet .cell-teams span{color:#087b43;margin:0 6px;font-size:10px}
.schedule-sheet .is-unscheduled{color:#b4551f;font-weight:700}
.schedule-sheet footer{display:flex;justify-content:space-between;gap:16px;margin-top:8px;color:#55605a;font-size:10px}
.schedule-sheet-empty{padding:18px;text-align:center;color:#87938c}
@page{size:A4 var(--sheet-orientation,portrait);margin:9mm}
@media print{html,body{background:#fff}.print-toolbar{display:none!important}.print-page{padding:0}.print-page .schedule-sheet{box-shadow:none!important;padding:0!important}}`

// 与页面预览共用的 A4 文档结构。
export function scheduleSheetHtml(sheet) {
  const { meta, rows } = sheet
  const notices = []
  if (meta.unscheduledCount) notices.push(`有 ${meta.unscheduledCount} 场未排（第${meta.unscheduledSerials.join('、')}场），需补齐日期、时间与场地。`)
  if (meta.conflicts.length) notices.push(`存在场地冲突：${meta.conflicts.join('；')}。`)
  if (meta.filterNotice) notices.push(meta.filterNotice)
  const body = rows.length
    ? rows.map((row, index) => {
      const dateCell = sheet.dateSpans.has(index) ? `<td rowspan="${sheet.dateSpans.get(index).span}">${esc(row.date)}</td>` : ''
      const roundCell = sheet.roundSpans.has(index) ? `<td rowspan="${sheet.roundSpans.get(index).span}">${esc(row.round || '—')}</td>` : ''
      return `<tr>${dateCell}<td${row.scheduled ? '' : ' class="is-unscheduled"'}>${esc(row.time)}</td>${roundCell}<td>${esc(row.division)}</td><td>${esc(row.group || '—')}</td><td class="cell-teams"><b>${esc(row.teams.split(' VS ')[0])}</b><span>VS</span><b>${esc(row.teams.split(' VS ').slice(1).join(' VS '))}</b></td><td>${esc(row.venue)}</td><td>${row.serial}</td></tr>`
    }).join('')
    : '<tr><td colspan="8" class="schedule-sheet-empty">暂无符合当前筛选条件的竞赛日程</td></tr>'
  return `<section class="schedule-sheet">
    <h1>赛小蜂足球 · 正式竞赛文件</h1>
    <h2>竞赛日程（${esc(meta.divisionName)}）</h2>
    <p class="sheet-meta"><span>赛事：${esc(meta.tournamentName)}</span><span>竞赛组别：${esc(meta.divisionName)}</span><span>赛程日期：${esc(meta.dateRange)}</span><span>场馆：${esc(meta.venues.join('、') || '待安排')}</span><span>方向：${esc(meta.orientationLabel)}</span><span>制表日期：${esc(meta.preparedAt)}</span></p>
    ${notices.length ? `<p class="sheet-notice">${notices.map(esc).join('<br/>')}</p>` : ''}
    <table><colgroup>${sheet.columns.map(column => `<col${column.key === 'teams' ? ' class="col-teams"' : column.key === 'serial' ? ' class="col-serial"' : ''}/>`).join('')}</colgroup>
      <thead><tr>${sheet.columns.map(column => `<th>${esc(column.label)}</th>`).join('')}</tr></thead>
      <tbody>${body}</tbody>
    </table>
    <footer><span>注：${esc(meta.note)}</span><span>制表日期：${esc(meta.preparedAt)}</span></footer>
  </section>`
}

// 打开独立 A4 打印预览并调用浏览器打印。
export function openSchedulePrint(sheet) {
  const orientation = sheet.orientation === 'landscape' ? 'landscape' : 'portrait'
  const printWindow = window.open('', '_blank', 'popup=yes,width=1100,height=850')
  if (!printWindow) return false
  const label = orientation === 'portrait' ? 'A4 竖版' : 'A4 横版'
  printWindow.document.open()
  printWindow.document.write(`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>${esc(sheet.meta.tournamentName)}-竞赛日程打印预览</title><style>:root{--sheet-orientation:${orientation}}${PRINT_STYLE}</style></head><body>${printWindowToolbar(label)}<main class="print-page">${scheduleSheetHtml(sheet)}</main><script>window.addEventListener('load',()=>{setTimeout(()=>{try{window.print()}catch(_){ }},300)})<\/script></body></html>`)
  printWindow.document.close()
  printWindow.focus()
  return true
}

function printWindowToolbar(label) {
  return `<div class="print-toolbar"><b>竞赛日程 · ${label}</b><div><button type="button" onclick="window.print()">打印</button><button class="secondary" type="button" onclick="window.close()">关闭</button></div></div>`
}

// Word 导出：MIME HTML（.doc），复用同一份 A4 文档结构，Word/WPS 可直接打开编辑。
const WORD_STYLE = `body{font-family:"微软雅黑","宋体",sans-serif;color:#111}
.schedule-sheet h1{margin:0;font-size:11pt;font-weight:700;color:#087b43;letter-spacing:1px}
.schedule-sheet h2{margin:8pt 0 0;font-size:18pt;text-align:center}
.schedule-sheet .sheet-meta{margin:8pt 0 0;text-align:center;color:#3d4a42;font-size:10pt}
.schedule-sheet .sheet-meta span{margin:0 8pt}
.schedule-sheet .sheet-notice{margin:8pt 0 0;padding:5pt 8pt;border:1pt solid #f0c9a0;background:#fffaf3;color:#8a5a1f;font-size:9pt}
.schedule-sheet table{width:100%;border-collapse:collapse;margin-top:10pt;table-layout:fixed}
.schedule-sheet th,.schedule-sheet td{border:1pt solid #6b7570;padding:4pt 5pt;text-align:center;vertical-align:middle;word-break:break-word;font-size:9pt}
.schedule-sheet thead th{background:#eaf3ee;font-weight:700;font-size:10pt}
.schedule-sheet .col-teams{width:34%}.schedule-sheet .col-serial{width:7%}
.schedule-sheet .cell-teams{text-align:left}
.schedule-sheet .cell-teams span{color:#087b43;margin:0 5pt;font-size:8pt}
.schedule-sheet .is-unscheduled{color:#b4551f;font-weight:700}
.schedule-sheet .schedule-sheet-empty{padding:14pt;text-align:center;color:#87938c}
.schedule-sheet footer{margin-top:8pt;color:#55605a;font-size:8pt}
.schedule-sheet footer span:last-child{float:right}`

export function exportScheduleWord(sheet, { fileName = '赛事-竞赛日程' } = {}) {
  if (!sheet?.rows?.length) throw new Error('当前没有可导出的竞赛日程')
  const orientation = sheet.orientation === 'landscape' ? 'landscape' : 'portrait'
  const label = orientation === 'portrait' ? 'A4竖版' : 'A4横版'
  // Word 分页设置：@page Section1 控制整篇文档的纸型与方向。
  const pageW = orientation === 'portrait' ? '210mm' : '297mm'
  const pageH = orientation === 'portrait' ? '297mm' : '210mm'
  const pageCss = `@page Section1{size:${pageW} ${pageH};margin:9mm}div.Section1{page:Section1}`
  // 兼容 Word 对 border 属性的解析：table 同时带 border 属性。
  const html = scheduleSheetHtml(sheet).replace('<table>', '<table border="1" cellspacing="0" cellpadding="0">')
  const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]--><style>${pageCss}${WORD_STYLE}</style></head><body><div class="Section1">${html}</div></body></html>`
  const safeName = String(fileName).replace(/[\\/:*?"<>|]/g, '_')
  return {
    blob: new Blob(['﻿', doc], { type: 'application/msword' }),
    filename: `${safeName}-竞赛日程-${label}.doc`
  }
}

const EXCEL_BRAND = '赛小蜂足球 · 正式竞赛文件'

function sanitizeSheetName(value, usedNames) {
  const base = String(value || '竞赛日程').replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || '竞赛日程'
  let name = base, suffix = 1
  while (usedNames.has(name)) { suffix += 1; name = `${base.slice(0, 26)}-${suffix}` }
  usedNames.add(name)
  return name
}

async function writeScheduleWorksheet(workbook, { rows, sheet, sheetName, orientation }) {
  const dateSpans = groupContinuousRows(rows, row => row.date)
  const roundSpans = groupContinuousRows(rows, row => `${row.divisionKey}|${row.round}`)
  const dates = [...new Set(rows.filter(row => row.scheduled).map(row => row.rawDate))].sort()
  const unscheduled = rows.filter(row => !row.scheduled)
  const conflicts = findVenueConflicts(rows)
  const noticeParts = []
  if (unscheduled.length) noticeParts.push(`未排 ${unscheduled.length} 场（第${unscheduled.map(row => row.serial).join('、')}场）`)
  if (conflicts.length) noticeParts.push(`场地冲突 ${conflicts.length} 处（${conflicts.join('；')}）`)
  if (sheet.meta.filterNotice) noticeParts.push(sheet.meta.filterNotice)

  const worksheet = workbook.addWorksheet(sheetName, {
    views: [{ showGridLines: false, zoomScale: 100 }],
    pageSetup: {
      paperSize: 9,
      orientation,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.35, right: 0.35, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 }
    }
  })
  const widths = orientation === 'portrait' ? [12, 8, 14, 14, 8, 30, 11, 7] : [13, 9, 15, 15, 9, 44, 12, 7]
  worksheet.columns = widths.map(width => ({ width }))
  worksheet.properties.defaultRowHeight = 22

  const headingLines = [EXCEL_BRAND, `竞赛日程（${sheetName}）`, `赛事：${sheet.meta.tournamentName}　｜　竞赛组别：${rows[0]?.division || sheetName}　｜　赛程日期：${dates.length ? `${dates[0]} 至 ${dates[dates.length - 1]}` : '待定'}`, `场馆：${[...new Set(rows.filter(row => row.scheduled).map(row => row.venue))].join('、') || '待安排'}　｜　方向：${orientation === 'portrait' ? 'A4 竖版' : 'A4 横版'}　｜　制表日期：${sheet.meta.preparedAt}`]
  headingLines.forEach((value, index) => {
    const range = `A${index + 1}:H${index + 1}`
    worksheet.mergeCells(range)
    worksheet.getCell(`A${index + 1}`).value = value
  })
  worksheet.getRow(1).height = 20
  worksheet.getRow(2).height = 30
  worksheet.getRow(3).height = 20
  worksheet.getRow(4).height = 22
  worksheet.getCell('A1').font = { name: '微软雅黑', size: 10, bold: true, color: { argb: 'FF087B43' } }
  worksheet.getCell('A2').font = { name: '微软雅黑', size: 18, bold: true, color: { argb: 'FF111111' } }
  worksheet.getCell('A3').font = { name: '宋体', size: 10, color: { argb: 'FF3D4A42' } }
  worksheet.getCell('A4').font = { name: '宋体', size: 10, color: { argb: 'FF3D4A42' } }
  ;['A1', 'A2'].forEach(address => { worksheet.getCell(address).alignment = { horizontal: 'center', vertical: 'middle' } })
  ;['A3', 'A4'].forEach(address => { worksheet.getCell(address).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true } })

  let headerRowNumber = 5
  if (noticeParts.length) {
    worksheet.mergeCells('A5:H5')
    const notice = worksheet.getCell('A5')
    notice.value = noticeParts.join('；')
    notice.font = { name: '宋体', size: 9, color: { argb: 'FF8A5A1F' } }
    notice.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
    notice.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFAF3' } }
    worksheet.getRow(5).height = 24
    headerRowNumber = 6
  }

  const headerRow = worksheet.getRow(headerRowNumber)
  headerRow.values = sheet.columns.map(column => column.label)
  headerRow.height = 26
  // 日期与轮次为跨行（rowspan）合并：非区间首行不写值，避免破坏已建立的合并区域。
  rows.forEach((row, index) => {
    const excelRowNumber = headerRowNumber + index + 1
    const excelRow = worksheet.getRow(excelRowNumber)
    excelRow.height = 22
    const values = [
      dateSpans.has(index) ? row.date : null,
      row.time,
      roundSpans.has(index) ? (row.round || '—') : null,
      row.division,
      row.group || '—',
      row.teams.replace(' VS ', '  VS  '),
      row.venue,
      row.serial
    ]
    values.forEach((value, offset) => {
      if (value === null) return
      const target = worksheet.getCell(excelRowNumber, offset + 1)
      target.value = value
      if (!row.scheduled && (offset === 1 || offset === 6)) target.font = { name: '宋体', size: 9, color: { argb: 'FFB4551F' } }
    })
    if (dateSpans.has(index)) worksheet.mergeCells(excelRowNumber, 1, excelRowNumber + dateSpans.get(index).span - 1, 1)
    if (roundSpans.has(index)) worksheet.mergeCells(excelRowNumber, 3, excelRowNumber + roundSpans.get(index).span - 1, 3)
  })

  const lastDataRow = Math.max(headerRowNumber, headerRowNumber + rows.length)
  for (let row = headerRowNumber; row <= lastDataRow; row += 1) {
    for (let column = 1; column <= 8; column += 1) {
      const cell = worksheet.getCell(row, column)
      const unscheduledColor = row > headerRowNumber && worksheet.getCell(row, column).font?.color?.argb === 'FFB4551F'
      cell.font = unscheduledColor
        ? { name: '宋体', size: 9, bold: false, color: { argb: 'FFB4551F' } }
        : { name: '宋体', size: row === headerRowNumber ? 10 : 9, bold: row === headerRowNumber, color: { argb: 'FF111111' } }
      cell.alignment = { horizontal: row > headerRowNumber && column === 6 ? 'left' : 'center', vertical: 'middle', wrapText: true }
      cell.border = {
        top: { style: row === headerRowNumber ? 'medium' : 'thin', color: { argb: 'FF555555' } },
        left: { style: column === 1 ? 'medium' : 'thin', color: { argb: 'FF555555' } },
        bottom: { style: row === lastDataRow ? 'medium' : 'thin', color: { argb: 'FF555555' } },
        right: { style: column === 8 ? 'medium' : 'thin', color: { argb: 'FF555555' } }
      }
    }
  }
  worksheet.getRow(headerRowNumber).eachCell(cell => {
    cell.font = { name: '宋体', size: 10, bold: true, color: { argb: 'FF111111' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF3EE' } }
  })

  const footerRow = lastDataRow + 1
  worksheet.mergeCells(footerRow, 1, footerRow, 4)
  worksheet.mergeCells(footerRow, 5, footerRow, 8)
  worksheet.getCell(footerRow, 1).value = `注：${sheet.meta.note}`
  worksheet.getCell(footerRow, 5).value = `制表日期：${sheet.meta.preparedAt}`
  worksheet.getRow(footerRow).height = 20
  worksheet.getCell(footerRow, 1).alignment = { horizontal: 'left', vertical: 'middle' }
  worksheet.getCell(footerRow, 5).alignment = { horizontal: 'right', vertical: 'middle' }
  ;[worksheet.getCell(footerRow, 1), worksheet.getCell(footerRow, 5)].forEach(cell => {
    cell.font = { name: '宋体', size: 8, color: { argb: 'FF55605A' } }
  })
  worksheet.pageSetup.printArea = `A1:H${footerRow}`
  worksheet.pageSetup.printTitlesRow = `${headerRowNumber}:${headerRowNumber}`
}

// 按当前方向生成 Excel；多组别时同时生成“全部赛程”和每个竞赛组别工作表。
export async function exportScheduleXlsx({
  sheet,
  orientation = 'portrait',
  fileName = '赛事-竞赛日程'
} = {}) {
  if (!sheet?.rows?.length) throw new Error('当前没有可导出的竞赛日程')
  const mod = await import('exceljs')
  const ExcelJS = mod.default || mod
  const workbook = new ExcelJS.Workbook()
  workbook.creator = EXCEL_BRAND
  workbook.created = new Date()
  const groups = new Map()
  for (const row of sheet.rows) {
    if (!groups.has(row.divisionKey)) groups.set(row.divisionKey, [])
    groups.get(row.divisionKey).push(row)
  }
  const usedNames = new Set()
  if (groups.size > 1) {
    await writeScheduleWorksheet(workbook, { rows: sheet.rows, sheet, sheetName: sanitizeSheetName('全部赛程', usedNames), orientation })
  }
  for (const rows of groups.values()) {
    const name = groups.size > 1 ? sanitizeSheetName(rows[0]?.division || '竞赛组别', usedNames) : sanitizeSheetName('竞赛日程', usedNames)
    await writeScheduleWorksheet(workbook, { rows, sheet, sheetName: name, orientation })
  }
  workbook.views = [{ activeTab: 1 }]
  const safeName = String(fileName).replace(/[\\/:*?"<>|]/g, '_')
  return {
    buffer: await workbook.xlsx.writeBuffer(),
    filename: `${safeName}-竞赛日程-A4${orientation === 'portrait' ? '竖版' : '横版'}.xlsx`
  }
}

// ============ 裁判安排表导出套件（裁判中心专用） ============
export const REFEREE_SHEET_COLUMNS = [
  { key: 'date', label: '日期' },
  { key: 'time', label: '时间' },
  { key: 'venue', label: '场地' },
  { key: 'division', label: '组别' },
  { key: 'serial', label: '场序' },
  { key: 'teams', label: '比赛对阵' },
  { key: 'main', label: '主裁判' },
  { key: 'a1', label: '第一助理裁判' },
  { key: 'a2', label: '第二助理裁判' },
  { key: 'fourth', label: '第四官员' }
]
export const REFEREE_SHEET_NOTE = '「待安排」为尚未指派的岗位；三人制场次第四官员显示「—」。'

// RefereeCenter 的日期分组数据 → 裁判安排表 sheet；crew 顺序为 [主裁, 助理一, 助理二, 第四官员]。
export function buildRefereeSheet({ groups = [], tournament = {}, roundLabel = '全部轮次', filters = [], preparedAt = new Date() } = {}) {
  const rows = []
  for (const group of groups) {
    for (const match of group.matches) {
      rows.push({
        date: group.date,
        weekday: group.weekday || '',
        time: match.time,
        venue: match.venue,
        division: match.division,
        serial: match.serial,
        teams: match.teams,
        main: match.crew[0],
        a1: match.crew[1],
        a2: match.crew[2],
        fourth: match.crew[3]
      })
    }
  }
  const dates = [...new Set(rows.map(row => row.date))].sort()
  return {
    columns: REFEREE_SHEET_COLUMNS,
    rows,
    dateSpans: groupContinuousRows(rows, row => row.date),
    orientation: 'landscape',
    meta: {
      tournamentName: String(tournament.name || '赛事'),
      roundLabel: String(roundLabel || '全部轮次'),
      dateRange: dates.length ? `${dates[0]} 至 ${dates[dates.length - 1]}` : '待定',
      venues: [...new Set(rows.map(row => row.venue).filter(venue => venue && venue !== '待定'))],
      total: rows.length,
      preparedAt: formatPreparedAt(preparedAt),
      note: REFEREE_SHEET_NOTE,
      filterNotice: filters.length ? `当前应用筛选：${filters.join('、')}，导出只包含筛选后的 ${rows.length} 场。` : ''
    }
  }
}

const REFEREE_SHEET_STYLE = `
.schedule-sheet.referee-sheet .col-date{width:9%}
.schedule-sheet.referee-sheet .col-time{width:6%}
.schedule-sheet.referee-sheet .col-venue{width:8%}
.schedule-sheet.referee-sheet .col-division{width:6%}
.schedule-sheet.referee-sheet .col-serial{width:5%}
.schedule-sheet.referee-sheet .col-teams{width:28%}
.schedule-sheet.referee-sheet .col-crew{width:9.5%}
.schedule-sheet.referee-sheet td.vacant{color:#b4551f;font-weight:700}
.schedule-sheet.referee-sheet td.na{color:#87938c}
.schedule-sheet.referee-sheet td .weekday{color:#55605a;font-size:9px}
.schedule-sheet.referee-sheet .schedule-sheet-empty{padding:14pt;text-align:center;color:#87938c}`

export function refereeSheetHtml(sheet) {
  const { meta, rows } = sheet
  const notices = []
  if (meta.filterNotice) notices.push(meta.filterNotice)
  const crewCell = value => `<td${value === '待安排' ? ' class="vacant"' : value === '—' ? ' class="na"' : ''}>${esc(value)}</td>`
  const body = rows.length
    ? rows.map((row, index) => {
      const dateCell = sheet.dateSpans.has(index) ? `<td rowspan="${sheet.dateSpans.get(index).span}">${esc(row.date)}<br/><span class="weekday">${esc(row.weekday)}</span></td>` : ''
      return `<tr>${dateCell}<td>${esc(row.time)}</td><td>${esc(row.venue)}</td><td>${esc(row.division)}</td><td>${esc(row.serial)}</td><td class="cell-teams"><b>${esc(row.teams.split(' VS ')[0])}</b><span>VS</span><b>${esc(row.teams.split(' VS ').slice(1).join(' VS '))}</b></td>${crewCell(row.main)}${crewCell(row.a1)}${crewCell(row.a2)}${crewCell(row.fourth)}</tr>`
    }).join('')
    : '<tr><td colspan="10" class="schedule-sheet-empty">暂无符合条件的裁判安排</td></tr>'
  return `<section class="schedule-sheet referee-sheet">
    <h1>赛小蜂足球 · 正式竞赛文件</h1>
    <h2>裁判安排表（${esc(meta.roundLabel)}）</h2>
    <p class="sheet-meta"><span>赛事：${esc(meta.tournamentName)}</span><span>比赛日期：${esc(meta.dateRange)}</span><span>场次：${meta.total} 场</span><span>场馆：${esc(meta.venues.join('、') || '待安排')}</span><span>制表日期：${esc(meta.preparedAt)}</span></p>
    ${notices.length ? `<p class="sheet-notice">${notices.map(esc).join('<br/>')}</p>` : ''}
    <table><colgroup><col class="col-date"/><col class="col-time"/><col class="col-venue"/><col class="col-division"/><col class="col-serial"/><col class="col-teams"/><col class="col-crew"/><col class="col-crew"/><col class="col-crew"/><col class="col-crew"/></colgroup>
      <thead><tr>${sheet.columns.map(column => `<th>${esc(column.label)}</th>`).join('')}</tr></thead>
      <tbody>${body}</tbody>
    </table>
    <footer><span>注：${esc(meta.note)}</span><span>赛小蜂足球 · 裁判安排表</span></footer>
  </section>`
}

export function openRefereePrint(sheet) {
  const printWindow = window.open('', '_blank', 'popup=yes,width=1200,height=850')
  if (!printWindow) return false
  printWindow.document.open()
  printWindow.document.write(`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>${esc(sheet.meta.tournamentName)}-裁判安排表打印预览</title><style>:root{--sheet-orientation:landscape}${PRINT_STYLE}${REFEREE_SHEET_STYLE}</style></head><body>${printWindowToolbar('裁判安排表 · A4 横版')}<main class="print-page">${refereeSheetHtml(sheet)}</main><script>window.addEventListener('load',()=>{setTimeout(()=>{try{window.print()}catch(_){ }},300)})<\/script></body></html>`)
  printWindow.document.close()
  printWindow.focus()
  return true
}

export function exportRefereeWord(sheet, { fileName = '赛事-裁判安排表' } = {}) {
  if (!sheet?.rows?.length) throw new Error('当前没有可导出的裁判安排')
  // Word 分页：A4 横版；复用 WORD_STYLE 基础样式并补充裁判表专属配色。
  const pageCss = '@page Section1{size:297mm 210mm;margin:9mm}div.Section1{page:Section1}'
  const refereeWordStyle = `${WORD_STYLE}.schedule-sheet.referee-sheet td.vacant{color:#b4551f;font-weight:700}.schedule-sheet.referee-sheet td.na{color:#87938c}.schedule-sheet.referee-sheet td .weekday{color:#55605a;font-size:8pt}.schedule-sheet.referee-sheet .col-teams{width:28%}.schedule-sheet.referee-sheet .col-crew{width:9.5%}`
  const html = refereeSheetHtml(sheet).replace('<table>', '<table border="1" cellspacing="0" cellpadding="0">')
  const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]--><style>${pageCss}${refereeWordStyle}</style></head><body><div class="Section1">${html}</div></body></html>`
  const safeName = String(fileName).replace(/[\\/:*?"<>|]/g, '_')
  return {
    blob: new Blob(['\ufeff', doc], { type: 'application/msword' }),
    filename: `${safeName}-裁判安排表-A4横版.doc`
  }
}

export async function exportRefereeXlsx({ sheet, fileName = '赛事-裁判安排表' } = {}) {
  if (!sheet?.rows?.length) throw new Error('当前没有可导出的裁判安排')
  const mod = await import('exceljs')
  const ExcelJS = mod.default || mod
  const workbook = new ExcelJS.Workbook()
  workbook.creator = EXCEL_BRAND
  workbook.created = new Date()
  const worksheet = workbook.addWorksheet('裁判安排', {
    views: [{ showGridLines: false, zoomScale: 100 }],
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.35, right: 0.35, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 }
    }
  })
  worksheet.columns = [10, 6, 10, 8, 5, 46, 12, 12, 12, 12].map(width => ({ width }))
  worksheet.properties.defaultRowHeight = 22

  const headingLines = [EXCEL_BRAND, `裁判安排表（${sheet.meta.roundLabel}）`, `赛事：${sheet.meta.tournamentName}　｜　比赛日期：${sheet.meta.dateRange}　｜　场次：${sheet.meta.total} 场　｜　场馆：${sheet.meta.venues.join('、') || '待安排'}　｜　制表日期：${sheet.meta.preparedAt}`]
  headingLines.forEach((value, index) => {
    worksheet.mergeCells(`A${index + 1}:J${index + 1}`)
    worksheet.getCell(`A${index + 1}`).value = value
  })
  worksheet.getRow(1).height = 20
  worksheet.getRow(2).height = 30
  worksheet.getRow(3).height = 20
  worksheet.getCell('A1').font = { name: '微软雅黑', size: 10, bold: true, color: { argb: 'FF087B43' } }
  worksheet.getCell('A2').font = { name: '微软雅黑', size: 18, bold: true, color: { argb: 'FF111111' } }
  worksheet.getCell('A3').font = { name: '宋体', size: 10, color: { argb: 'FF3D4A42' } }
  ;['A1', 'A2'].forEach(address => { worksheet.getCell(address).alignment = { horizontal: 'center', vertical: 'middle' } })
  worksheet.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }

  let headerRowNumber = 4
  if (sheet.meta.filterNotice) {
    worksheet.mergeCells('A4:J4')
    const notice = worksheet.getCell('A4')
    notice.value = sheet.meta.filterNotice
    notice.font = { name: '宋体', size: 9, color: { argb: 'FF8A5A1F' } }
    notice.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
    notice.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFAF3' } }
    worksheet.getRow(4).height = 24
    headerRowNumber = 5
  }

  const headerRow = worksheet.getRow(headerRowNumber)
  headerRow.values = sheet.columns.map(column => column.label)
  headerRow.height = 26
  rows.forEach((row, index) => {
    const excelRowNumber = headerRowNumber + index + 1
    worksheet.getRow(excelRowNumber).height = 22
    const values = [
      sheet.dateSpans.has(index) ? row.date : null,
      row.time,
      row.venue,
      row.division,
      row.serial,
      row.teams.replace(' VS ', '  VS  '),
      row.main,
      row.a1,
      row.a2,
      row.fourth
    ]
    values.forEach((value, offset) => {
      if (value === null) return
      const target = worksheet.getCell(excelRowNumber, offset + 1)
      target.value = value
      if (offset >= 6 && value === '待安排') target.font = { name: '宋体', size: 9, bold: true, color: { argb: 'FFB4551F' } }
    })
    if (sheet.dateSpans.has(index)) worksheet.mergeCells(excelRowNumber, 1, excelRowNumber + sheet.dateSpans.get(index).span - 1, 1)
  })

  const lastDataRow = Math.max(headerRowNumber, headerRowNumber + sheet.rows.length)
  for (let row = headerRowNumber; row <= lastDataRow; row += 1) {
    for (let column = 1; column <= 10; column += 1) {
      const cell = worksheet.getCell(row, column)
      const vacantColor = row > headerRowNumber && cell.font?.color?.argb === 'FFB4551F'
      cell.font = vacantColor
        ? { name: '宋体', size: 9, bold: true, color: { argb: 'FFB4551F' } }
        : { name: '宋体', size: row === headerRowNumber ? 10 : 9, bold: row === headerRowNumber, color: { argb: 'FF111111' } }
      cell.alignment = { horizontal: row > headerRowNumber && column === 6 ? 'left' : 'center', vertical: 'middle', wrapText: true }
      cell.border = {
        top: { style: row === headerRowNumber ? 'medium' : 'thin', color: { argb: 'FF555555' } },
        left: { style: column === 1 ? 'medium' : 'thin', color: { argb: 'FF555555' } },
        bottom: { style: row === lastDataRow ? 'medium' : 'thin', color: { argb: 'FF555555' } },
        right: { style: column === 10 ? 'medium' : 'thin', color: { argb: 'FF555555' } }
      }
    }
  }
  worksheet.getRow(headerRowNumber).eachCell(cell => {
    cell.font = { name: '宋体', size: 10, bold: true, color: { argb: 'FF111111' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF3EE' } }
  })
  const footerRow = lastDataRow + 1
  worksheet.mergeCells(footerRow, 1, footerRow, 6)
  worksheet.mergeCells(footerRow, 7, footerRow, 10)
  worksheet.getCell(footerRow, 1).value = `注：${sheet.meta.note}`
  worksheet.getCell(footerRow, 7).value = `制表日期：${sheet.meta.preparedAt}`
  worksheet.getRow(footerRow).height = 20
  worksheet.getCell(footerRow, 1).alignment = { horizontal: 'left', vertical: 'middle' }
  worksheet.getCell(footerRow, 7).alignment = { horizontal: 'right', vertical: 'middle' }
  ;[worksheet.getCell(footerRow, 1), worksheet.getCell(footerRow, 7)].forEach(cell => {
    cell.font = { name: '宋体', size: 8, color: { argb: 'FF55605A' } }
  })
  worksheet.pageSetup.printArea = `A1:J${footerRow}`
  worksheet.pageSetup.printTitlesRow = `${headerRowNumber}:${headerRowNumber}`
  const safeName = String(fileName).replace(/[\\/:*?"<>|]/g, '_')
  return {
    buffer: await workbook.xlsx.writeBuffer(),
    filename: `${safeName}-裁判安排表-A4横版.xlsx`
  }
}
