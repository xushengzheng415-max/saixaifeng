'use strict'
const crypto = require('node:crypto')
const { getCustomerProfile } = require('./customerProfile.cjs')
function archiveFields(row) {
  return { platformArchived: row.platformArchived === true, platformArchiveRevision: Number.isSafeInteger(row.platformArchiveRevision) ? row.platformArchiveRevision : 0 }
}
async function setCustomerAssetArchive(db, event, actor) {
  if (!actor?.isPlatformOwner) throw new Error('仅平台负责人可以归档')
  if (!['teams','tournaments'].includes(event.kind) || typeof event.archived !== 'boolean') throw new Error('归档类型或状态无效')
  const items = event.items
  if (!Array.isArray(items) || !items.length || items.length > 30 || new Set(items.map(row => row.id)).size !== items.length) throw new Error('请选择1至30条不重复记录')
  for (const row of items) if (typeof row.id !== 'string' || !row.id || row.id.length > 128 || !Number.isSafeInteger(row.revision) || row.revision < 0) throw new Error('记录或版本无效，请刷新')
  const profile = await getCustomerProfile(db, event)
  const allowed = new Set(profile.data[event.kind].map(row => row.id))
  if (items.some(row => !allowed.has(row.id))) throw new Error('选择包含其他客户的数据，请刷新档案')
  return db.runTransaction(async transaction => {
    const changes = []
    for (const item of items) {
      const result = await transaction.collection(event.kind).doc(item.id).get()
      const row = Array.isArray(result.data) ? result.data[0] : result.data
      if (!row) throw new Error('记录已变更，请刷新')
      const current = archiveFields(row)
      if (current.platformArchived === event.archived) continue
      if (current.platformArchiveRevision !== item.revision) throw new Error('归档状态已被更新，请刷新后重试')
      changes.push({ id: item.id, revision: current.platformArchiveRevision + 1 })
    }
    for (const row of changes) await transaction.collection(event.kind).doc(row.id).update({ data: {
      platformArchived: event.archived, platformArchiveRevision: row.revision,
      platformArchiveUpdatedBy: actor._id, platformArchiveUpdatedAt: db.serverDate()
    } })
    if (changes.length) await transaction.collection('platform_content_audit_logs').doc(crypto.randomBytes(16).toString('hex')).set({ data: {
      action: event.archived ? 'platform_asset_archive' : 'platform_asset_restore', actorId: actor._id,
      kind: event.kind, ids: changes.map(row => row.id), createTime: db.serverDate()
    } })
    return { success: true, changedCount: changes.length }
  })
}
module.exports = { archiveFields, setCustomerAssetArchive }
