export const KIT_COLOR_OPTIONS = Object.freeze([
  { label:'纯白', value:'#FFFFFF' },
  { label:'炭黑', value:'#161A18' },
  { label:'深灰', value:'#59615D' },
  { label:'银灰', value:'#A8B0AC' },
  { label:'正红', value:'#D72631' },
  { label:'酒红', value:'#7E1731' },
  { label:'亮橙', value:'#F47A1F' },
  { label:'比赛黄', value:'#F5C518' },
  { label:'荧光黄', value:'#D7F300' },
  { label:'草地绿', value:'#138A4B' },
  { label:'深绿', value:'#075B35' },
  { label:'天蓝', value:'#47A9E8' },
  { label:'皇家蓝', value:'#1455B5' },
  { label:'海军蓝', value:'#14264A' },
  { label:'藏青', value:'#1F3A6E' },
  { label:'竞技紫', value:'#6B3FA0' },
  { label:'亮粉', value:'#E64A8A' }
])

const REGISTRATION_COLOR_MAP = Object.freeze({
  白:'#FFFFFF', 黑:'#161A18', 深灰:'#59615D', 灰:'#A8B0AC',
  红:'#D72631', 酒红:'#7E1731', 橙:'#F47A1F', 黄:'#F5C518', 荧光黄:'#D7F300',
  绿:'#138A4B', 深绿:'#075B35', 天蓝:'#47A9E8', 浅蓝:'#47A9E8',
  蓝:'#1455B5', 深蓝:'#14264A', 海军蓝:'#14264A', 藏青:'#1F3A6E', 紫:'#6B3FA0', 粉:'#E64A8A',
  white:'#FFFFFF', black:'#161A18', gray:'#A8B0AC', grey:'#A8B0AC', red:'#D72631',
  orange:'#F47A1F', yellow:'#F5C518', green:'#138A4B', blue:'#1455B5', purple:'#6B3FA0', pink:'#E64A8A'
})

const COLOR_TOKEN_PATTERN = /荧光黄|海军蓝|藏青|深灰|酒红|深绿|天蓝|浅蓝|深蓝|白|黑|灰|红|橙|黄|绿|蓝|紫|粉|white|black|gray|grey|red|orange|yellow|green|blue|purple|pink/i

export function registrationColorToHex(value) {
  const normalized = String(value || '').trim().toLowerCase()
  const token = normalized.match(COLOR_TOKEN_PATTERN)?.[0] || ''
  return REGISTRATION_COLOR_MAP[token] || ''
}

function cellAt(row, column) {
  return row?.cells?.find(cell => column >= Number(cell.column || 0) && column < Number(cell.column || 0) + Math.max(1, Number(cell.span || 1))) || null
}

function kitRow(table, label, startIndex) {
  return (table?.rows || []).slice(startIndex, startIndex + 5).find(row => row.cells?.some(cell => String(cell.text || '').trim().toUpperCase() === label)) || null
}

export function parseRegistrationKitColors(table) {
  const rows = table?.rows || []
  const headerIndex = rows.findIndex(row => row.cells?.some(cell => /运动员服装|球员服装/.test(String(cell.text || ''))))
  if (headerIndex < 0) return { kitColors:{}, kitColorLabels:{}, warnings:[] }

  const kitHeader = rows[headerIndex].cells.find(cell => /运动员服装|球员服装/.test(String(cell.text || '')))
  const equipmentRow = rows.slice(headerIndex + 1, headerIndex + 4).find(row => row.cells?.some(cell => /上衣|球衣/.test(String(cell.text || ''))))
  const primaryRow = kitRow(table, 'A', headerIndex + 1)
  const secondaryRow = kitRow(table, 'B', headerIndex + 1)
  if (!kitHeader || !equipmentRow || !primaryRow || !secondaryRow) return { kitColors:{}, kitColorLabels:{}, warnings:['未完整识别比赛服 A/B 颜色'] }

  const start = Number(kitHeader.column || 0)
  const end = start + Math.max(1, Number(kitHeader.span || 1))
  const equipmentCells = equipmentRow.cells.filter(cell => Number(cell.column || 0) >= start && Number(cell.column || 0) < end)
  const columns = {
    jersey: equipmentCells.find(cell => /上衣|球衣/.test(String(cell.text || '')))?.column,
    shorts: equipmentCells.find(cell => /短裤|球裤/.test(String(cell.text || '')))?.column,
    socks: equipmentCells.find(cell => /长袜|球袜|袜/.test(String(cell.text || '')))?.column
  }
  const warnings = []
  const readSet = (row, label) => {
    const colors = {}
    const labels = {}
    Object.entries(columns).forEach(([key, column]) => {
      if (column == null) return
      const raw = String(cellAt(row, column)?.text || '').trim()
      if (!raw) return
      labels[key] = raw
      const color = registrationColorToHex(raw)
      if (color) colors[key] = color
      else warnings.push(`${label}${{jersey:'球衣',shorts:'球裤',socks:'球袜'}[key]}颜色“${raw}”未识别`)
    })
    return { colors, labels }
  }
  const primary = readSet(primaryRow, '主比赛服')
  const secondary = readSet(secondaryRow, '备用比赛服')
  return {
    kitColors: { primary:primary.colors, secondary:secondary.colors },
    kitColorLabels: { primary:primary.labels, secondary:secondary.labels },
    warnings
  }
}
