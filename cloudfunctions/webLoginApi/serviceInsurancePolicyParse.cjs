'use strict'
// Pure insurance-policy text helpers. No cloud I/O — unit-tested offline.
// Tuned for common Chinese e-policy layouts (e.g. 安诚「个人体育健身运动意外伤害保险」).

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

const DATE_TOKEN = '(\\d{4}\\s*年\\s*\\d{1,2}\\s*月\\s*\\d{1,2}\\s*日(?:\\s*\\d{1,2}\\s*时(?:\\s*\\d{1,2}\\s*分(?:\\s*\\d{1,2}\\s*秒)?)?)?|\\d{4}[./-]\\d{1,2}[./-]\\d{1,2}(?:\\s+\\d{1,2}:\\d{2}(?::\\d{2})?)?)'

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
  const labeled = source.match(/保单(?:号码|号|编号)?[:：\s]*([A-Za-z0-9][A-Za-z0-9\-]{7,40})/)
  if (labeled) return labeled[1]
  const policy = source.match(/(?:Policy\s*(?:No\.?|Number)|policyno)[:：\s]*([A-Za-z0-9][A-Za-z0-9\-]{7,40})/i)
  if (policy) return policy[1]
  // 安诚等：无标签时抓长数字+字母保单号
  const compact = source.match(/\b(\d{15,28}[A-Za-z]?)\b/)
  if (compact) return compact[1]
  return ''
}

function extractInsurer(rawText) {
  const source = String(rawText || '')
  const labeled = source.match(/(?:承保公司|保险公司)[:：\s]*([^\n\r，,；;]{4,40})/)
  if (labeled) {
    const value = text(labeled[1]).replace(/[（(].*$/, '').slice(0, 40)
    if (value && !/姓名|期限|保单|意外/.test(value)) return value
  }
  const known = [
    '安诚财产保险股份有限公司',
    '中国人民财产保险股份有限公司',
    '中国平安财产保险股份有限公司',
    '中国太平洋财产保险股份有限公司',
    '中国人寿财产保险股份有限公司',
    '阳光财产保险股份有限公司',
    '泰康在线财产保险股份有限公司'
  ]
  for (const name of known) if (source.includes(name)) return name
  const loose = source.match(/([\u4e00-\u9fff]{2,12}(?:财产|人寿)?保险(?:股份有限)?公司)/)
  return loose ? loose[1] : ''
}

function extractProductType(rawText) {
  const source = String(rawText || '')
  // 标题常见：个人体育健身运动意外伤害保险（互联网专属电子保单）
  const title = source.match(/(个人[\u4e00-\u9fff]{0,12}(?:体育|健身|运动)?[\u4e00-\u9fff]{0,8}意外伤害保险)/)
  if (title) return text(title[1]).slice(0, 40)
  const labeled = source.match(/(?:险种|保险名称|产品名称|保险产品|保障项目)[:：\s]*([^\n\r，,；;]{2,40})/)
  if (labeled) {
    const value = text(labeled[1]).replace(/[（(].*$/, '').slice(0, 40)
    if (value && !/^名称$/.test(value)) return value
  }
  const catalog = [
    ['个人体育健身运动意外伤害保险', /体育健身运动意外|个人体育健身/],
    ['运动意外伤害保险', /运动意外|体育意外|赛事意外|健身运动意外/],
    ['人身意外伤害保险', /人身意外|意外伤害保险|意外伤害险|个意/],
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
  const rangePatterns = [
    // 安诚：自2026年10月22日00时00分00秒起至2026年10月25日00时00分00秒止
    new RegExp('自\\s*' + DATE_TOKEN + '[^至]{0,24}?起?\\s*至\\s*' + DATE_TOKEN + '[^\\n]{0,8}?止?', 'i'),
    // 保险期限：…至…
    new RegExp('(?:保险期间|保障期间|保险期限|保障期限|保险起止|保险起讫)[^\\d自]{0,24}(?:自\\s*)?' + DATE_TOKEN + '[^至]{0,24}?至\\s*' + DATE_TOKEN, 'i'),
    // 宽松：date 至 date
    new RegExp(DATE_TOKEN + '\\s*至\\s*' + DATE_TOKEN)
  ]
  for (const pattern of rangePatterns) {
    const labeled = source.match(pattern)
    if (!labeled) continue
    const start = parseLooseDate(labeled[1]), end = parseLooseDate(labeled[2])
    if (start && end) return { coverStart: start, coverEnd: end }
  }
  // 仅在「保险期限」段落后取日期，避免签单日/成立日干扰
  const section = source.match(/保险期限[:：]?([\s\S]{0,180})/)
  if (section) {
    const dates = extractDates(section[1])
    if (dates.length >= 2) return { coverStart: dates[0], coverEnd: dates[1] }
    if (dates.length === 1) return { coverStart: dates[0], coverEnd: dates[0] }
  }
  return { coverStart: '', coverEnd: '' }
}

function extractInsuredName(rawText) {
  const source = String(rawText || '')
  const patterns = [
    /被保险人姓名[:：\s]+([^\n\r，,；;：:\s]{2,20})/,
    /被保险人[:：\s]+([^\n\r，,；;：:\s]{2,20})/,
    /被保险人信息[\s\S]{0,120}?姓名[:：\s]+([^\n\r，,；;：:\s]{2,20})/,
    /(?:^|\n)\s*姓名[:：\s]+([^\n\r，,；;：:\s]{2,20})/
  ]
  for (const pattern of patterns) {
    const match = source.match(pattern)
    if (!match) continue
    let name = text(match[1]).replace(/[（(].*$/, '')
    if (/^(姓名|名称|投保人|被保险人|性别|证件|联系|信息)$/.test(name)) continue
    if (/保险|公司|期限|保单|意外/.test(name)) continue
    if (name.length >= 2 && name.length <= 20) return name.slice(0, 20)
  }
  return ''
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
  const insurer = extractInsurer(source)
  const extractedName = extractInsuredName(source)
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
    insuredName: nameMatched ? playerName : extractedName,
    coverStart: cover.coverStart,
    coverEnd: cover.coverEnd,
    policyNo,
    productType: productType || '未识别险种',
    insurer,
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
  extractInsurer,
  extractProductType,
  extractCoverRange,
  extractInsuredName,
  nameAppears,
  coverageOk,
  analyzeInsuranceText,
  readableChinese
}
