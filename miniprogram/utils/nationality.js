const catalog = require('./nationality-catalog.json')
const ENTRIES = catalog.entries || []
const INDEX = new Map()
ENTRIES.forEach(function (entry) {
  INDEX.set(String(entry.code || '').toLowerCase(), entry)
  INDEX.set(String(entry.zh || ''), entry)
  INDEX.set(String(entry.en || '').toUpperCase(), entry)
  ;(entry.aliases || []).forEach(function (alias) { INDEX.set(String(alias).toUpperCase(), entry) })
})

const UNKNOWN_VALUES = {
  '': true, '未知': true, '不确定': true, '待填': true, '待填写': true, '待确认': true,
  '未知国籍': true, '国籍待填': true, '—': true, '-': true, 'N/A': true, 'NA': true,
  'UNKNOWN': true, 'UNCONFIRMED': true, 'PENDING': true
}

function normalize(value) {
  return String(value == null ? '' : value).trim()
}

function resolve(value) {
  const text = normalize(value)
  if (!text) return null
  return INDEX.get(text) || INDEX.get(text.toUpperCase()) || INDEX.get(text.toLowerCase()) || null
}

function isUnknown(value) {
  const text = normalize(value)
  if (!text) return true
  return Boolean(UNKNOWN_VALUES[text] || UNKNOWN_VALUES[text.toUpperCase()])
}

function isChina(value) {
  if (isUnknown(value)) return false
  const entry = resolve(value)
  return Boolean(entry && entry.code === 'cn')
}

function codeOf(value) {
  if (isUnknown(value)) return ''
  const entry = resolve(value)
  return entry ? entry.code : ''
}

function labels() {
  return ENTRIES.map(function (entry) { return entry.zh })
}

function options() {
  return ENTRIES.map(function (entry) { return { code: entry.code, zh: entry.zh, en: entry.en } })
}

function flagPath(value) {
  if (isUnknown(value)) return '/images/flags/nationality-unknown.jpg'
  const code = codeOf(value)
  if (!code) return ''
  if (code === 'cn') return '' // 成卡仍用矢量中国旗；列表页可用地球外其他展示
  return '/images/flags/' + code + '.png'
}

module.exports = {
  resolve: resolve,
  isUnknown: isUnknown,
  isChina: isChina,
  codeOf: codeOf,
  labels: labels,
  options: options,
  flagPath: flagPath,
  displayName: function (value) {
    if (isUnknown(value)) return ''
    const entry = resolve(value)
    return entry ? entry.zh : normalize(value)
  }
}
