const crypto = require('crypto')

function date(value) {
  const text = String(value || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('请选择有效的赛事日期')
  const parsed = new Date(text + 'T00:00:00Z')
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== text) throw new Error('请选择有效的赛事日期')
  return text
}
exports.dates = function(event) {
  if (!event.startDate && !event.endDate && event.entryPoint !== 'mini_quick_create') return {}
  const startDate = date(event.startDate), endDate = date(event.endDate)
  if (endDate < startDate) throw new Error('结束日期不能早于开始日期')
  return { startDate, endDate }
}
exports.create = async function(db, identity, event, data) {
  if (!event.requestId) return { id:(await db.collection('tournaments').add({data}))._id, duplicate:false }
  const requestId = String(event.requestId)
  if (!/^[a-zA-Z0-9_-]{12,80}$/.test(requestId)) throw new Error('创建凭证无效，请关闭后重试')
  const userId = String(identity.user._id)
  const id = 'quick_' + crypto.createHash('sha256').update(userId + '|' + requestId).digest('hex').slice(0,32)
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify([data.orgId,data.name,data.provinceCode,data.city,data.startDate || '',data.endDate || '',data.logo || ''])).digest('hex')
  return db.runTransaction(async transaction => {
    let previous
    try { previous = (await transaction.collection('tournaments').doc(id).get()).data }
    catch(error) {
      if (!/not.?exist|not.?found|不存在|DOCUMENT_NOT_FOUND/i.test(String(error.code || '') + ' ' + String(error.message || error.errMsg || ''))) throw error
    }
    if (previous && previous._id) {
      if (String(previous.creatorId) !== userId || String(previous.orgId) !== String(data.orgId) || previous.quickCreateFingerprint !== fingerprint) throw new Error('该创建请求已处理，刷新列表后再创建')
      return {id,duplicate:true}
    }
    await transaction.collection('tournaments').doc(id).set({data:{...data,quickCreateFingerprint:fingerprint}})
    return {id,duplicate:false}
  })
}
