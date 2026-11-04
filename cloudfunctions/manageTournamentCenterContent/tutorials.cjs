'use strict'
const crypto = require('crypto')
const COLLECTION = 'service_tutorials'
const first = data => Array.isArray(data) ? data[0] : data
const text = (v, max) => { const s = typeof v === 'string' ? v.trim() : ''; if (s.length > max) throw new Error('教程内容超出长度限制'); return s }
function content(value = {}, publish = false) {
  const title = text(value.title, 80), category = text(value.category, 30) || '通用操作', audience = text(value.audience, 30) || '通用'
  const intro = text(value.intro, 500)
  if (!title) throw new Error('请填写教程标题')
  if (!Array.isArray(value.steps) || value.steps.length > 30) throw new Error('最多添加30个步骤')
  const steps = value.steps.map(s => {
    const image = text(s.image, 1500)
    if (image && !/^cloud:\/\//.test(image) && !/^https:\/\//.test(image)) throw new Error('图片地址不合法')
    return { title: text(s.title, 80), text: text(s.text, 3000), image }
  })
  if (publish && (!steps.length || steps.some(s => !s.title || !s.text))) throw new Error('发布前请补全每一步的标题和说明')
  return { title, category, audience, intro, steps }
}
async function list(db, params, cloud) {
  const page = Math.max(1, Math.min(100000, Number(params.page) || 1)), pageSize = 20
  let query = db.collection(COLLECTION)
  const where = {}
  if (params.publishedOnly) where.isPublished = true
  if (params.keyword) where[params.publishedOnly ? 'published.title' : 'draft.title'] = db.RegExp({ regexp: String(params.keyword).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), options: 'i' })
  query = query.where(where)
  const total = (await query.count()).total
  const result = await query.orderBy('updatedAt', 'desc').skip((page - 1) * pageSize).limit(pageSize).get()
  const rows = result.data || []
  const ids = [...new Set(rows.flatMap(r => (r.draft?.steps || []).map(s => s.image).filter(v => v?.startsWith('cloud://'))))]
  const imageUrls = {}
  for (let i = 0; i < ids.length; i += 50) {
    const urls = await cloud.getTempFileURL({ fileList: ids.slice(i, i + 50) })
    for (const f of urls.fileList || []) imageUrls[f.fileID] = f.tempFileURL || ''
  }
  return { success: true, rows, imageUrls, total, page }
}
async function save(db, params, user) {
  const id = text(params.id, 64) || 'tutorial_' + crypto.randomUUID()
  if (!/^tutorial_[a-f0-9-]{36}$/.test(id)) throw new Error('教程编号不合法')
  const mode = params.mode || 'draft'
  if (!['draft', 'publish', 'withdraw'].includes(mode)) throw new Error('教程操作不合法')
  const draft = mode === 'withdraw' ? null : content(params.content, mode === 'publish')
  // A transaction prevents two editors from silently overwriting one another.
  await db.runTransaction(async transaction => {
    let old = null
    if (params.id) old = first((await transaction.collection(COLLECTION).doc(id).get()).data)
    if (params.id && !old) throw new Error('教程不存在，请刷新列表')
    if (old && old.revision !== params.revision) throw new Error('教程已被更新，请关闭后重新打开')
    const patch = { revision: (old?.revision || 0) + 1, updatedAt: db.serverDate(), updatedBy: user._id }
    if (draft) patch.draft = draft
    if (mode === 'publish') { patch.published = draft; patch.isPublished = true; patch.publishedAt = db.serverDate() }
    if (mode === 'withdraw') { patch.published = null; patch.isPublished = false }
    if (old) await transaction.collection(COLLECTION).doc(id).update({ data: patch })
    else await transaction.collection(COLLECTION).doc(id).set({ data: { ...patch, isPublished: mode === 'publish', createdAt: db.serverDate() } })
    await transaction.collection('platform_content_audit_logs').add({ data: { action: 'tutorial_' + mode, tutorialId: id, actorId: user._id, createTime: db.serverDate() } })
  })
  return { success: true, id }
}
async function references(db, ids) {
  if (!Array.isArray(ids) || ids.length > 3) throw new Error('最多引用3篇教程')
  const unique = [...new Set(ids)]
  const refs = []
  for (const id of unique) {
    if (typeof id !== 'string' || !/^tutorial_[a-f0-9-]{36}$/.test(id)) throw new Error('教程编号不合法')
    const row = first((await db.collection(COLLECTION).doc(id).get()).data)
    if (!row?.isPublished || !row.published) throw new Error('引用的教程已下架，请重新选择')
    refs.push({ id, title: row.published.title })
  }
  return refs
}
module.exports = { list, save, references, content }
