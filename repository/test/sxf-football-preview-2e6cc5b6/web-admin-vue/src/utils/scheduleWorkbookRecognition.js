const HEADER_ALIASES = {
  matchId: ['比赛ID', '场次ID', 'matchId'],
  divisionId: ['组别ID', 'divisionId'],
  matchNo: ['场序', '场次', '序号', '比赛序号'],
  date: ['比赛日期', '日期'],
  weekday: ['星期', '周'],
  time: ['开赛时间', '比赛时间', '时间'],
  division: ['竞赛组别', '比赛组别', '组别'],
  pairing: ['比赛对阵', '比赛队', '对阵'],
  home: ['主队', '主场'],
  away: ['客队', '客场'],
  venue: ['比赛场地', '场地']
}

function text(value) { return String(value == null ? '' : value).trim() }
function compact(value) { return text(value).replace(/[\s　]/g, '') }
function normalizeHeader(value) { return compact(value).replace(/[()（）:：]/g, '').toLowerCase() }

function headerKey(value) {
  const normalized = normalizeHeader(value)
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some(alias => normalizeHeader(alias) === normalized)) return key
  }
  return ''
}

function pad(value) { return String(value).padStart(2, '0') }

export function normalizeScheduleDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
  if (typeof value === 'number' && Number.isFinite(value) && value > 1000) {
    const utc = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000)
    return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`
  }
  const raw = text(value)
  if (!raw) return ''
  const chinese = raw.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/)
  if (chinese) return `${chinese[1]}-${pad(chinese[2])}-${pad(chinese[3])}`
  const parts = raw.replace(/[.\-]/g, '/').split('/').map(Number)
  if (parts.length === 3 && parts.every(Number.isFinite)) {
    let year, month, day
    if (parts[0] > 31) [year, month, day] = parts
    else [month, day, year] = parts
    if (year < 100) year += 2000
    if (year >= 2000 && month >= 1 && month <= 12 && day >= 1 && day <= 31) return `${year}-${pad(month)}-${pad(day)}`
  }
  return ''
}

export function normalizeScheduleTime(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return `${pad(value.getHours())}:${pad(value.getMinutes())}`
  if (typeof value === 'number' && Number.isFinite(value)) {
    const minutes = Math.round((value % 1) * 24 * 60)
    return `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`
  }
  const match = text(value).match(/^(\d{1,2})[:：](\d{1,2})/)
  if (!match) return ''
  const hour = Number(match[1]), minute = Number(match[2])
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? `${pad(hour)}:${pad(minute)}` : ''
}

export function parseDivisionAndPool(value) {
  const raw = compact(value)
  const pool = raw.match(/([A-Za-z])组$/i)?.[1]?.toUpperCase() || ''
  return { division:pool ? raw.slice(0, -2) : raw, pool:pool ? `${pool}组` : '' }
}

export function splitPairing(value) {
  const raw = text(value)
  if (!raw) return { home:'',away:'' }
  const parts = raw.split(/\s*(?:vs\.?|v\.?)\s*/i)
  return parts.length >= 2 ? { home:text(parts[0]),away:text(parts.slice(1).join(' VS ')) } : { home:'',away:'' }
}

export function normalizeOpponent(value) {
  let raw = compact(value).toLowerCase()
  raw = raw.replace(/[（(][^）)]*(?:\d+\s*[.．、\-]\s*\d+|名)[^）)]*[）)]$/g, '')
  raw = raw.replace(/(?:场序)?(\d+)(?:胜者|胜)/g, 'm$1w').replace(/(?:场序)?(\d+)(?:负者|负)/g, 'm$1l')
  raw = raw.replace(/([a-z])组第?(\d+)/g, '$1$2').replace(/^([a-z])(\d+)$/, '$1$2')
  raw = raw.replace(/[“”"'·,，。:：/\\]/g, '').replace(/足球队$/g, '').replace(/队$/g, '')
  return raw
}

function normalizeDivision(value) { return compact(value).toLowerCase().replace(/男子|女子|足球|比赛|竞赛/g, '') }
function divisionCompatible(imported, actual) {
  const left = normalizeDivision(parseDivisionAndPool(imported).division)
  const right = normalizeDivision(actual)
  if (!left || !right) return false
  return left === right || left.length >= 2 && right.includes(left) || right.length >= 2 && left.includes(right)
}

function pairingForMatch(match) {
  return {
    home:normalizeOpponent(match.homeTeamName || match.homeSourceLabel || ''),
    away:normalizeOpponent(match.awayTeamName || match.awaySourceLabel || '')
  }
}

function pairingScore(row, match) {
  const target = pairingForMatch(match)
  const home = normalizeOpponent(row.home), away = normalizeOpponent(row.away)
  if (!home || !away || !target.home || !target.away) return 0
  if (home === target.home && away === target.away) return 60
  if (home === target.away && away === target.home) return 52
  return 0
}

function recognizeRow(row, matches) {
  if (row.matchId) {
    const exact = matches.find(match => String(match._id) === row.matchId)
    if (exact) return { match:exact,score:200,reason:'比赛ID精确匹配' }
  }
  const scored = matches.map(match => {
    let score = 0
    const reasons = []
    if (row.matchNo && Number(match.matchSequence ?? match.matchNo ?? match.matchIndex ?? 0) === Number(row.matchNo)) { score += 34;reasons.push('场序') }
    if (row.divisionId && String(match.divisionId || '') === row.divisionId) { score += 35;reasons.push('组别ID') }
    else if (row.division && divisionCompatible(row.division, match.divisionName || '')) { score += 24;reasons.push('组别') }
    const importedPool = parseDivisionAndPool(row.division).pool
    if (importedPool && normalizeDivision(importedPool) === normalizeDivision(match.group || match.pool || '')) { score += 10;reasons.push('小组') }
    const pairScore = pairingScore(row, match)
    if (pairScore) { score += pairScore;reasons.push('对阵') }
    return { match,score,reason:reasons.join('＋') }
  }).filter(item => item.score > 0).sort((a,b) => b.score - a.score)
  const best = scored[0]
  if (!best || best.score < 50) return { match:null,score:best?.score || 0,reason:'未找到对应的已生成对阵' }
  if (scored[1] && best.score - scored[1].score < 10) return { match:null,score:best.score,reason:'匹配到多场比赛，需要比赛ID或更完整对阵' }
  return best
}

function mapVenue(value, venueResources) {
  const raw = compact(value)
  if (!raw) return ''
  const resources = Array.isArray(venueResources) ? venueResources : []
  const exact = resources.find(item => compact(item.name || item.venue) === raw)
  if (exact) return text(exact.name || exact.venue)
  const number = raw.match(/^(\d+)(?:号)?(?:场|场地)?$/)?.[1]
  if (number) {
    const numbered = resources.find(item => new RegExp(`^${number}号`).test(compact(item.name || item.venue)))
    if (numbered) return text(numbered.name || numbered.venue)
    return `${number}号场地`
  }
  return raw
}

function remapExternalReference(value, externalMatchMap) {
  const raw = text(value)
  const match = raw.match(/^(?:场序)?(\d+)\s*(胜者|胜|负者|负)/)
  if (!match) return raw
  const mapped = externalMatchMap.get(Number(match[1]))
  if (!mapped) return raw
  return `场序${mapped}${match[2].startsWith('胜') ? '胜者' : '负者'}`
}

export function isDeferredOpponent(value) {
  const raw=compact(value)
  return /^[A-Za-z]组第?\d+$/i.test(raw) || /^(?:场序)?\d+(?:胜者|胜|负者|负)/.test(raw)
}

function findHeader(matrix) {
  for (let rowIndex = 0; rowIndex < Math.min(matrix.length, 20); rowIndex += 1) {
    const fields = matrix[rowIndex].map(headerKey)
    if (fields.filter(Boolean).length >= 3 && (fields.includes('matchNo') || fields.includes('pairing'))) return { rowIndex,fields }
  }
  return null
}

export function extractScheduleRows(XLSX, sheet) {
  const matrix = XLSX.utils.sheet_to_json(sheet, { header:1,defval:'',raw:true })
  const displayMatrix = XLSX.utils.sheet_to_json(sheet, { header:1,defval:'',raw:false })
  const header = findHeader(displayMatrix)
  if (!header) return { rows:[],error:'未识别到赛程表头，至少需要场序、组别、对阵等列' }
  let carriedDate = '', carriedWeekday = ''
  const rows = []
  for (let rowIndex = header.rowIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
    const source = matrix[rowIndex]
    const displaySource = displayMatrix[rowIndex] || []
    const record = { sourceRow:rowIndex + 1 }
    const displayRecord = {}
    header.fields.forEach((key, columnIndex) => { if (key) { record[key] = source[columnIndex];displayRecord[key] = displaySource[columnIndex] } })
    const pairing = splitPairing(record.pairing)
    record.home = text(record.home || pairing.home)
    record.away = text(record.away || pairing.away)
    record.matchId = text(record.matchId)
    record.divisionId = text(record.divisionId)
    record.matchNo = Number(record.matchNo || 0) || ''
    record.division = text(record.division)
    record.matchDate = normalizeScheduleDate(displayRecord.date) || normalizeScheduleDate(record.date) || carriedDate
    record.weekday = text(record.weekday) || carriedWeekday
    record.matchTime = normalizeScheduleTime(displayRecord.time) || normalizeScheduleTime(record.time)
    record.venueRaw = text(record.venue)
    if (record.matchDate) carriedDate = record.matchDate
    if (record.weekday) carriedWeekday = record.weekday
    if (!record.matchId && !record.matchNo && !record.home && !record.away) continue
    rows.push(record)
  }
  return { rows,headerRow:header.rowIndex + 1,error:'' }
}

export function recognizeScheduleRows(rows, matches, venueResources = []) {
  const sourceRows = rows || []
  const availableMatches = matches || []
  let recognizedByIndex = sourceRows.map(row => recognizeRow(row, availableMatches))
  for (let pass = 0; pass < 2; pass += 1) {
    const externalMatchMap = new Map()
    sourceRows.forEach((row,index) => {
      const matched = recognizedByIndex[index]?.match
      const targetNo = Number(matched && (matched.matchNo || matched.matchIndex) || 0)
      if (row.matchNo && targetNo) externalMatchMap.set(Number(row.matchNo), targetNo)
    })
    recognizedByIndex = sourceRows.map((row,index) => {
      if (recognizedByIndex[index]?.match) return recognizedByIndex[index]
      return recognizeRow({ ...row,home:remapExternalReference(row.home,externalMatchMap),away:remapExternalReference(row.away,externalMatchMap) },availableMatches)
    })
  }
  return sourceRows.map((row,index) => {
    const recognized = recognizedByIndex[index]
    const venue = mapVenue(row.venueRaw, venueResources)
    const hasAnyPlacement = Boolean(row.matchDate || row.matchTime || venue)
    const completePlacement = Boolean(row.matchDate && row.matchTime && venue)
    const plannedKnockout = !recognized.match && isDeferredOpponent(row.home) && isDeferredOpponent(row.away)
    let status = 'recognized'
    let message = recognized.reason
    if (plannedKnockout) { status = 'planned_knockout';message = '淘汰/排位赛来源已识别，需先创建占位对阵' }
    else if (!recognized.match) status = 'unmatched'
    else if (hasAnyPlacement && !completePlacement) { status = 'incomplete';message = '日期、时间和场地需要同时完整' }
    else if (completePlacement) status = 'ready'
    else status = 'pairing_only'
    return {
      ...row,
      venue,
      matchId:recognized.match ? String(recognized.match._id) : row.matchId,
      matchedMatch:recognized.match || null,
      matchLabel:recognized.match ? `第${recognized.match.matchNo || recognized.match.matchIndex || '-'}场 · ${recognized.match.homeTeamName || recognized.match.homeSourceLabel || '待产生'} VS ${recognized.match.awayTeamName || recognized.match.awaySourceLabel || '待产生'}` : '',
      recognitionScore:recognized.score,
      status,
      message
    }
  })
}

export function recognitionSummary(rows) {
  const summary = { total:rows.length,recognized:0,ready:0,pairingOnly:0,plannedKnockout:0,incomplete:0,unmatched:0 }
  rows.forEach(row => {
    if (row.matchedMatch) summary.recognized += 1
    if (row.status === 'ready') summary.ready += 1
    if (row.status === 'pairing_only') summary.pairingOnly += 1
    if (row.status === 'planned_knockout') summary.plannedKnockout += 1
    if (row.status === 'incomplete') summary.incomplete += 1
    if (row.status === 'unmatched') summary.unmatched += 1
  })
  return summary
}
