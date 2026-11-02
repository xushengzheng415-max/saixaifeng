/** 国籍展示：统一目录 + 国旗路径 + 不确定地球图标 */

import catalogJson from '../../../cloudfunctions/webLoginApi/nationality-catalog.json'

const ENTRIES = catalogJson.entries || []
const INDEX = new Map()
for (const entry of ENTRIES) {
  INDEX.set(String(entry.code || '').toLowerCase(), entry)
  INDEX.set(String(entry.zh || ''), entry)
  INDEX.set(String(entry.en || '').toUpperCase(), entry)
  for (const alias of entry.aliases || []) INDEX.set(String(alias).toUpperCase(), entry)
}

const UNKNOWN_NATIONALITY_ASSET = 'images/flags/nationality-unknown.jpg'
const UNKNOWN_VALUES = new Set([
  '', '未知', '不确定', '待填', '待填写', '待确认', '未知国籍', '国籍待填',
  '—', '-', 'N/A', 'NA', 'UNKNOWN', 'UNCONFIRMED', 'PENDING'
])

export function normalizeNationality(value) {
  return String(value == null ? '' : value).trim()
}

export function resolveNationality(value) {
  const text = normalizeNationality(value)
  if (!text) return null
  return INDEX.get(text) || INDEX.get(text.toUpperCase()) || INDEX.get(text.toLowerCase()) || null
}

export function isUnknownNationality(value) {
  const text = normalizeNationality(value)
  if (!text) return true
  return UNKNOWN_VALUES.has(text) || UNKNOWN_VALUES.has(text.toUpperCase())
}

export function isChinaNationality(value) {
  if (isUnknownNationality(value)) return false
  const entry = resolveNationality(value)
  return Boolean(entry && entry.code === 'cn')
}

export function nationalityCode(value) {
  if (isUnknownNationality(value)) return ''
  return resolveNationality(value)?.code || ''
}

export function nationalityDisplayName(value) {
  if (isUnknownNationality(value)) return ''
  return resolveNationality(value)?.zh || normalizeNationality(value)
}

export function nationalityOptions() {
  return ENTRIES.map(entry => ({ code: entry.code, zh: entry.zh, en: entry.en }))
}

export function nationalityLabels() {
  return ENTRIES.map(entry => entry.zh)
}

export function unknownNationalityUrl(baseUrl = '/') {
  const base = String(baseUrl || '/').replace(/\/?$/, '/')
  return `${base}${UNKNOWN_NATIONALITY_ASSET}`
}

export function nationalityFlagUrl(value, baseUrl = '/') {
  const base = String(baseUrl || '/').replace(/\/?$/, '/')
  if (isUnknownNationality(value)) return `${base}${UNKNOWN_NATIONALITY_ASSET}`
  const code = nationalityCode(value)
  if (!code) return ''
  return `${base}images/flags/${code}.png`
}

export { UNKNOWN_NATIONALITY_ASSET }
