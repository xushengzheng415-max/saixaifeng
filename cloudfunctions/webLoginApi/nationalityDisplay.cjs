'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { resolveNationality, nationalityOptions, nationalityLabels } = require('./nationalityCatalog.cjs')

const UNKNOWN_VALUES = new Set([
  '', '未知', '不确定', '待填', '待填写', '待确认', '未知国籍', '国籍待填',
  '—', '-', 'N/A', 'NA', 'UNKNOWN', 'UNCONFIRMED', 'PENDING'
])

const FLAG_DIR = path.join(__dirname, 'assets', 'flags')
const UNKNOWN_FLAG_PATH = path.join(FLAG_DIR, 'nationality-unknown.jpg')
const flagBuffers = new Map()

function normalizeNationality(value) {
  return String(value == null ? '' : value).trim()
}

function isUnknownNationality(value) {
  const text = normalizeNationality(value)
  if (!text) return true
  if (UNKNOWN_VALUES.has(text) || UNKNOWN_VALUES.has(text.toUpperCase())) return true
  return false
}

function isChinaNationality(value) {
  if (isUnknownNationality(value)) return false
  const entry = resolveNationality(value)
  return Boolean(entry && entry.code === 'cn')
}

function nationalityCode(value) {
  if (isUnknownNationality(value)) return ''
  const entry = resolveNationality(value)
  return entry ? entry.code : ''
}

function nationalityDisplayName(value) {
  if (isUnknownNationality(value)) return ''
  const entry = resolveNationality(value)
  return entry ? entry.zh : normalizeNationality(value)
}

function readFlagFile(fileName) {
  if (flagBuffers.has(fileName)) return flagBuffers.get(fileName)
  const full = path.join(FLAG_DIR, fileName)
  if (!fs.existsSync(full)) {
    flagBuffers.set(fileName, null)
    return null
  }
  const buffer = fs.readFileSync(full)
  flagBuffers.set(fileName, buffer)
  return buffer
}

function unknownNationalityFlagBuffer() {
  return readFlagFile('nationality-unknown.jpg')
}

function nationalityFlagBuffer(value) {
  if (isUnknownNationality(value)) return unknownNationalityFlagBuffer()
  const code = nationalityCode(value)
  if (!code) return null
  return readFlagFile(`${code}.png`) || readFlagFile(`${code}.jpg`)
}

function flagAssetRelativePath(value) {
  if (isUnknownNationality(value)) return 'images/flags/nationality-unknown.jpg'
  const code = nationalityCode(value)
  if (!code) return ''
  if (fs.existsSync(path.join(FLAG_DIR, `${code}.png`))) return `images/flags/${code}.png`
  if (fs.existsSync(path.join(FLAG_DIR, `${code}.jpg`))) return `images/flags/${code}.jpg`
  return ''
}

module.exports = {
  isChinaNationality,
  isUnknownNationality,
  normalizeNationality,
  nationalityCode,
  nationalityDisplayName,
  nationalityFlagBuffer,
  unknownNationalityFlagBuffer,
  flagAssetRelativePath,
  nationalityOptions,
  nationalityLabels,
  resolveNationality,
  UNKNOWN_FLAG_PATH,
  FLAG_DIR
}
