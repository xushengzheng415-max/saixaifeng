'use strict'
// Pure insurance-policy text helpers. No cloud I/O — unit-tested offline.

const text = value => String(value == null ? '' : value).trim()

function normalizeName(value) {
  return text(value)
    .replace(/[\s·•．.．]/g, '')
    .replace(/（.*?）|\(.*?\)/g, '')
    .toLowerCase()
}

function pad2(n) { return String(n).padStart(2, '0') }

function toIsoDate(year, month, day) {
  const y = Number(year), m = Number(month), d = Number(day)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return ''
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return ''
  const stamp = Date.UTC(y, m - 1, d)
  const check = new Date(stamp)
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return ''
  return y + '-' + pad2(m) + '-' + pad2(d)
}

function parseLooseDate(raw) {
  const value = text(raw)
  let match = value.match(/^(\d{4})[年./-](\d{1,2})[月./-](\d{1,2})/)
  if (match) return toIsoDate(match[1], match[2], match[3])
  match = value.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (match) return toIsoDate(match[1], match[2], match[3])
  return ''
}

function extractDates(rawText) {
  const source = String(rawText || '')
  const found = []
  const patterns = [
    /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g,
    /(\d{4})[./-](\d{1,2})[./-](\d{1,2})/g
  ]
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(source))) {
      const iso = toIsoDate(match[1], match[2], match[3])
      if (iso && !found.includes(iso)) found.push(iso)
    }
  }
  found.sort()
  return found
}

function extractPolicyNo(rawText) {
  const source = String(rawText || '')
  const labeled = source.match(/保单(?:号码|号|编号)?[:：\s]*([A-Za-z0-9][A-Za-z0-9\-]{7,31})/)
  if (labeled) return labeled[1]
  const policy = source.match(/(?:Policy\s*(?:No\.?|Number)|policyno)[:：\s]*([A-Za-z0-9][A-Za-z0-9\-]{7,31})/i)
  if (policy) return policy[1]
  return ''
}

function extractProductType(rawText) {
  const source = String(rawText || '')
  const labeled = source.match(/(?:险种|保险名称|产品名称|保险产品|保障项目)[:：\s]*([^\n\r，,；;]{2,40})/)
  if (labeled) {
    const value = text(labeled[1]).replace(/[（(].*$/, '').slice(0, 40)
    if (value) return value
  }
  const catalog = [
    ['运动意外伤害保险', /运动意外|体育意外|赛事意外/],
    ['人身意外伤害保险', /人身意外|意外伤害保险|意外伤害险/],
    ['团体意外伤害保险', /团体意外|团体人身意外/],
    ['旅行意外伤害保险', /旅行意外|旅游意外/],
    ['综合意外伤害保险', /综合意外/],
    ['赛事保险', /赛事保险|比赛保险/]
  ]
  for (const item of catalog) if (item[1].test(source)) return item[0]
  return ''
}

function extractCoverRange(rawText) {
  const source = String(rawText || '')
  const labeled = source.match(/(?:保险期间|保障期间|保险期限|保障期限|保险起止|保险起讫)[^\d]{0,12}(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日|\d{4}[./-]\d{1,2}[./-]\d{1,2}).{0,20}?至.{0,12}?(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日|\d{4}[./-]\d{1,2}[./-]\d{1,2})/)
  if (labeled) {
    const start = parseLooseDate(labeled[1]), end = parseLooseDate(labeled[2])
    if (start && end) return { coverStart: start, coverEnd: end }
  }
  const dates = extractDates(source)
  if (dates.length >= 2) return { coverStart: dates[0], coverEnd: dates[dates.length - 1] }
  if (dates.length === 1) return { coverStart: dates[0], coverEnd: dates[0] }
  return { coverStart: '', coverEnd: '' }
}

function nameAppears(rawText, playerName) {
  const needle = normalizeName(playerName)
  if (!needle || needle.length < 2) return false
  const hay = normalizeName(rawText)
  return hay.includes(needle)
}

function coverageOk(coverStart, coverEnd, eventStart, eventEnd) {
  const start = parseLooseDate(coverStart) || text(coverStart)
  const end = parseLooseDate(coverEnd) || text(coverEnd)
  const from = parseLooseDate(eventStart) || text(eventStart).slice(0, 10)
  const to = parseLooseDate(eventEnd) || text(eventEnd).slice(0, 10) || from
  if (!start || !end || !from) return false
  return start <= from && end >= to
}

function analyzeInsuranceText(rawText, options = {}) {
  const source = text(rawText)
  const playerName = text(options.playerName)
  const eventStart = text(options.eventStart)
  const eventEnd = text(options.eventEnd)
  const cover = extractCoverRange(source)
  const policyNo = extractPolicyNo(source)
  const productType = extractProductType(source)
  const nameMatched = nameAppears(source, playerName)
  const hasCover = Boolean(cover.coverStart && cover.coverEnd)
  const covered = hasCover && coverageOk(cover.coverStart, cover.coverEnd, eventStart, eventEnd)

  let matchResult = 'unclear'
  if (nameMatched && covered) matchResult = 'matched'
  else if (playerName && source && !nameMatched && hasCover) matchResult = 'name_mismatch'
  else if (nameMatched && hasCover && !covered) matchResult = 'coverage_gap'
  else if (nameMatched && !hasCover) matchResult = 'unclear'
  else if (!source) matchResult = 'unclear'

  const reviewFlag = matchResult === 'matched' ? 'auto_matched' : 'needs_manual_review'
  const messages = {
    matched: '姓名与保障期已与本场球员、赛事日期核对一致（平台文字核对，不替代保险公司承保确认）',
    name_mismatch: '保单文字中未找到与当前球员一致的姓名，确认提交后将进入人工核对',
    coverage_gap: '保障期未能覆盖本赛事日期，确认提交后将进入人工核对',
    unclear: '未能可靠识别姓名或保障期，确认提交后将进入人工核对'
  }

  return {
    insuredName: nameMatched ? playerName : '',
    coverStart: cover.coverStart,
    coverEnd: cover.coverEnd,
    policyNo,
    productType: productType || '未识别险种',
    matchResult,
    reviewFlag,
    message: messages[matchResult] || messages.unclear,
    disclaimer: '平台仅核验保单文字与赛事要求，不替代保险公司承保确认。'
  }
}

function readableChinese(rawText) {
  return (String(rawText || '').match(/[\u4e00-\u9fff]/g) || []).length >= 8
}

module.exports = {
  text,
  normalizeName,
  parseLooseDate,
  extractDates,
  extractPolicyNo,
  extractProductType,
  extractCoverRange,
  nameAppears,
  coverageOk,
  analyzeInsuranceText,
  readableChinese
}
