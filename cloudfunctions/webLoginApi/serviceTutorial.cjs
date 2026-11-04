'use strict'
// Public projection: never return draft content, feedback context, or editor IDs.
module.exports = async function getTutorial(cloud, event) {
  const id = typeof event.id === 'string' ? event.id : ''
  if (!/^tutorial_[a-f0-9-]{36}$/.test(id)) return { success: false, error: '教程链接不正确，请向客服获取新链接' }
  const result = await cloud.database().collection('service_tutorials').where({ _id: id, isPublished: true }).limit(1).get()
  const row = (result.data || [])[0]
  if (!row?.published) return { success: false, error: '教程暂不可用，请联系客服' }
  const p = row.published
  const steps = (p.steps || []).map(s => ({ title: s.title, text: s.text, image: s.image || '' }))
  const ids = [...new Set(steps.map(s => s.image).filter(s => s.startsWith('cloud://')))]
  if (ids.length) {
    const urls = await cloud.getTempFileURL({ fileList: ids })
    const map = new Map((urls.fileList || []).map(f => [f.fileID, f.tempFileURL || '']))
    steps.forEach(s => { if (s.image.startsWith('cloud://')) { s.image = map.get(s.image) || ''; if (!s.image) s.imageError = true } })
  }
  return { success: true, article: { id, title: p.title, category: p.category, audience: p.audience, intro: p.intro, steps, updatedAt: row.publishedAt } }
}
