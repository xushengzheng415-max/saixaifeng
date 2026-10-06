'use strict'

const cloud = require('wx-server-sdk')

cloud.init({ env:cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async function(event) {
  event = event || {}
  const execute = event.execute === true || event.Type === 'Timer'
  try { await db.createCollection('sensitive_file_deletion_tasks') } catch (error) {
    if (!/exist|already|duplicate/i.test(String(error && error.message || ''))) throw error
  }
  const due = (await db.collection('sensitive_file_deletion_tasks').where({ status:'scheduled', executeAfter:_.lte(new Date()) }).limit(100).get()).data || []
  if (!execute) return { success:true, dryRun:true, dueCount:due.length, taskIds:due.map(item => String(item._id)) }
  let deleted = 0
  let failed = 0
  for (const task of due) {
    try {
      if (task.fileId) await cloud.deleteFile({ fileList:[String(task.fileId)] })
      if (['player_identity_document', 'player_identity_document_review_copy'].includes(String(task.businessType || '')) && task.businessId) {
        const data = { status:'deleted_after_retention', deletedAt:db.serverDate(), updateTime:db.serverDate() }
        if (task.businessType === 'player_identity_document') data.fileId = ''
        if (task.businessType === 'player_identity_document_review_copy') data.reviewFileId = ''
        await db.collection('parent_identity_documents').doc(String(task.businessId)).update({ data })
      }
      await db.collection('sensitive_file_deletion_tasks').doc(task._id).update({ data:{ status:'completed', completedAt:db.serverDate(), updateTime:db.serverDate() } })
      deleted += 1
    } catch (error) {
      failed += 1
      await db.collection('sensitive_file_deletion_tasks').doc(task._id).update({ data:{ status:'scheduled', lastError:String(error && error.message || error).slice(0,300), executeAfter:new Date(Date.now() + 6 * 60 * 60 * 1000), retryCount:Number(task.retryCount || 0) + 1, updateTime:db.serverDate() } }).catch(function() {})
    }
  }
  return { success:failed === 0, dueCount:due.length, deleted, failed }
}
