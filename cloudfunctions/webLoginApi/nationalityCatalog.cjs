'use strict'
const ENTRIES = Object.freeze(require('./nationality-catalog.json').entries || [])

const INDEX = new Map()
for (const entry of ENTRIES) {
  INDEX.set(String(entry.code || '').toLowerCase(), entry)
  INDEX.set(String(entry.zh || ''), entry)
  INDEX.set(String(entry.en || '').toUpperCase(), entry)
  for (const alias of entry.aliases || []) INDEX.set(String(alias).toUpperCase(), entry)
}

function resolveNationality(value) {
  const text = String(value == null ? '' : value).trim()
  if (!text) return null
  return INDEX.get(text) || INDEX.get(text.toUpperCase()) || INDEX.get(text.toLowerCase()) || null
}

function nationalityOptions() {
  return ENTRIES.map(entry => ({ code: entry.code, zh: entry.zh, en: entry.en }))
}

function nationalityLabels() {
  return ENTRIES.map(entry => entry.zh)
}

module.exports = { ENTRIES, resolveNationality, nationalityOptions, nationalityLabels }
