'use strict'
const { permanentFile } = require('./playerCardSource.cjs')
const ORIGINAL = ['logo', 'logoUrl', 'logoFileID', 'logoFileId', 'teamLogoFileID', 'teamLogoFileId']
const DERIVED = ['logoTransparent', 'logoTransparentUrl', 'logoTransparentFileID', 'logoTransparentFileId']
const has = (row, key) => Object.prototype.hasOwnProperty.call(row || {}, key)
const raw = value => value && typeof value === 'object' ? value.fileID || value.fileId || value.url || '' : String(value || '')
function normalizeTeamLogoPatch(before = {}, patch = {}) {
  const supplied = ORIGINAL.filter(key => has(patch, key))
  if (!supplied.length) return { ...patch }
  const candidates = supplied.map(key => ({ key, raw: raw(patch[key]), id: permanentFile(raw(patch[key])) }))
  if (candidates.some(item => item.raw && !item.id)) throw new Error('队徽地址无效，请重新上传')
  const changed = candidates.filter(item => item.id !== permanentFile(raw(before[item.key])))
  const ids = [...new Set((changed.length ? changed : candidates).map(item => item.id))]
  if (ids.length > 1) throw new Error('队徽地址不一致，请重新上传')
  const id = ids[0] || ''
  const picked = candidates.find(item => item.id === id && /^https:\/\//.test(item.raw)) || candidates.find(item => item.id === id)
  const display = picked?.raw || ''
  const previous = ORIGINAL.map(key => permanentFile(raw(before[key]))).find(Boolean) || ''
  const stored = permanentFile(raw(before.logoFileID || before.logoFileId || before.teamLogoFileID || before.teamLogoFileId))
  const sourceChanged = id !== previous || Boolean(stored && stored !== id)
  const result = { ...patch, logo: display, logoUrl: display, logoFileID: id, logoFileId: id }
  // Derived cutouts belong to the selected source. Never reuse an old cutout
  // after the user replaces the logo, and never modify pixels in the new file.
  if (sourceChanged) {
    for (const key of DERIVED) if (has(before, key) && !has(patch, key)) result[key] = ''
    result.logoVersion = Math.max(0, Number(before.logoVersion) || 0) + 1
  }
  return result
}
module.exports = { normalizeTeamLogoPatch }
