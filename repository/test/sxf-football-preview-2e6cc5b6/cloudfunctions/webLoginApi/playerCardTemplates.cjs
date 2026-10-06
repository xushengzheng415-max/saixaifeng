const crypto = require('node:crypto')

const COLLECTION = 'player_card_templates'
const PAGE_SIZE = 25
const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const TIERS = new Set(['bronze', 'silver', 'gold'])
const DEFAULT_LAYOUT = Object.freeze({
  number: { x: 44, y: 70, size: 52, color: '#1c241d', weight: 900 },
  position: { x: 44, y: 130, size: 24, color: '#1c241d', weight: 700 },
  name: { x: 150, y: 307, size: 32, color: '#1c241d', weight: 800 },
  jerseyName: { x: 150, y: 343, size: 16, color: '#30312b', weight: 600 },
  height: { x: 98, y: 367, size: 14, color: '#30312b', weight: 600 },
  weight: { x: 202, y: 367, size: 14, color: '#30312b', weight: 600 }
})
const DEFAULT_PHOTO = Object.freeze({ x: 150, y: 2, scale: 108 })
const DEFAULT_BADGES = Object.freeze({ nationality: { x: 125, y: 394, size: 28 }, team: { x: 175, y: 388, size: 32 } })

function normalizeBadges(value) {
  if (value && (typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !(key in DEFAULT_BADGES)))) {
    throw Object.assign(new Error('国籍或球队元素无效'), { code: 'CARD_TEMPLATE_BADGES_INVALID' })
  }
  const result = {}
  for (const [key, defaults] of Object.entries(DEFAULT_BADGES)) {
    const raw = value?.[key] || defaults
    const x = Number(raw.x), y = Number(raw.y), size = Number(raw.size)
    if (![x, y, size].every(Number.isFinite) || x < 0 || x > 300 || y < 0 || y > 430 || size < 12 || size > 80) {
      throw Object.assign(new Error('国籍或球队元素大小、位置超出范围'), { code: 'CARD_TEMPLATE_BADGES_INVALID' })
    }
    result[key] = { x, y, size }
  }
  return result
}

function normalizePhoto(value) {
  const input = value || DEFAULT_PHOTO
  const x = Number(input.x), y = Number(input.y), scale = Number(input.scale)
  if (![x, y, scale].every(Number.isFinite) || x < 0 || x > 300 || y < 0 || y > 250 || scale < 50 || scale > 200) {
    throw Object.assign(new Error('照片大小或位置超出范围'), { code: 'CARD_TEMPLATE_PHOTO_INVALID' })
  }
  return { x, y, scale }
}

function normalizeLayout(value) {
  if (value && (typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !(key in DEFAULT_LAYOUT)))) {
    throw Object.assign(new Error('文字字段无效'), { code: 'CARD_TEMPLATE_LAYOUT_INVALID' })
  }
  const result = {}
  for (const [key, defaults] of Object.entries(DEFAULT_LAYOUT)) {
    const raw = value?.[key] || defaults
    const x = Number(raw.x), y = Number(raw.y), size = Number(raw.size), weight = Number(raw.weight)
    const color = String(raw.color || '')
    if (![x, y, size, weight].every(Number.isFinite) || x < 0 || x > 300 || y < 0 || y > 430 ||
        size < 8 || size > 80 || ![400, 500, 600, 700, 800, 900].includes(weight) || !/^#[0-9a-fA-F]{6}$/.test(color)) {
      throw Object.assign(new Error('文字颜色、字号或位置超出范围'), { code: 'CARD_TEMPLATE_LAYOUT_INVALID' })
    }
    result[key] = { x, y, size, color, weight }
  }
  return result
}

function pngBuffer(value, layer) {
  const match = String(value || '').match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/)
  if (!match) throw Object.assign(new Error('请上传 PNG 图片'), { code: 'CARD_TEMPLATE_PNG_REQUIRED' })
  const buffer = Buffer.from(match[1], 'base64')
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (buffer.length < 33 || buffer.length > MAX_IMAGE_BYTES || !buffer.subarray(0, 8).equals(signature) ||
      buffer.toString('ascii', 12, 16) !== 'IHDR' || buffer.readUInt32BE(16) !== 300 || buffer.readUInt32BE(20) !== 430 ||
      buffer[24] !== 8 || ![0, 2, 4, 6].includes(buffer[25])) {
    throw Object.assign(new Error('背景和黑白遮罩须为 300 × 430 PNG，单张不超过 2MB'), { code: 'CARD_TEMPLATE_IMAGE_INVALID' })
  }
  return buffer
}

function tierOf(value) {
  const tier = String(value || '')
  if (!TIERS.has(tier)) throw Object.assign(new Error('请选择铜、银或金卡等级'), { code: 'CARD_TEMPLATE_TIER_INVALID' })
  return tier
}

function titleOf(value) {
  const title = String(value || '').trim()
  if (title.length < 2 || title.length > 30) throw Object.assign(new Error('模板名称须为 2–30 个字'), { code: 'CARD_TEMPLATE_TITLE_INVALID' })
  return title
}

function itemOf(record, urls, publicOnly) {
  const published = record.published || null
  if (publicOnly) return {
    id: record._id, title: published.title, tier: record.tier,
    version: record.publishedVersion, backgroundUrl: urls[published.backgroundFileId] || '',
    maskUrl: urls[published.maskFileId] || '', layout: normalizeLayout(published.layout),
    photo: normalizePhoto(published.photo), badges: normalizeBadges(published.badges)
  }
  const draft = record.draft || null
  return {
    id: record._id, title: draft?.title || published?.title || '', tier: record.tier,
    status: record.status || 'draft', revision: Number(record.revision || 0),
    draftVersion: Number(record.draftVersion || 0), publishedVersion: Number(record.publishedVersion || 0),
    backgroundUrl: draft ? urls[draft.backgroundFileId] || '' : '',
    maskUrl: draft ? urls[draft.maskFileId] || '' : '',
    publishedBackgroundUrl: published ? urls[published.backgroundFileId] || '' : '',
    publishedMaskUrl: published ? urls[published.maskFileId] || '' : '',
    layout: normalizeLayout(draft?.layout), photo: normalizePhoto(draft?.photo), badges: normalizeBadges(draft?.badges)
  }
}

function createPlayerCardTemplates({ cloud, authenticateWebSession }) {
  const db = cloud.database()
  async function urlsFor(rows, publicOnly) {
    const ids = [...new Set(rows.flatMap(row => publicOnly
      ? [row.published?.backgroundFileId, row.published?.maskFileId]
      : [row.draft?.backgroundFileId, row.draft?.maskFileId, row.published?.backgroundFileId, row.published?.maskFileId]).filter(Boolean))]
    const urls = {}
    for (let i = 0; i < ids.length; i += 50) {
      const result = await cloud.getTempFileURL({ fileList: ids.slice(i, i + 50) })
      for (const file of result.fileList || []) if (file.tempFileURL) urls[file.fileID] = file.tempFileURL
    }
    return urls
  }
  async function owner(event) {
    const auth = await authenticateWebSession(event)
    if (!auth.success) return auth
    if (auth.principalType !== 'platform_owner' || auth.user?.isPlatformOwner !== true) {
      return { success: false, code: 'CARD_TEMPLATE_FORBIDDEN', error: '仅平台负责人可管理球员卡模板' }
    }
    return auth
  }
  async function read(id) {
    const result = await db.collection(COLLECTION).doc(id).get()
    return Array.isArray(result.data) ? result.data[0] : result.data
  }
  async function list(event, publicOnly) {
    const cursor = String(event.cursor || '').trim()
    if (cursor && !/^[a-f0-9]{32}$/.test(cursor)) return { success: false, code: 'CARD_TEMPLATE_CURSOR_INVALID', error: '列表游标无效' }
    const filter = { ...(publicOnly ? { status: 'published' } : {}), ...(cursor ? { _id: db.command.gt(cursor) } : {}) }
    const page = (await db.collection(COLLECTION).where(filter).orderBy('_id', 'asc').limit(PAGE_SIZE).get()).data || []
    const urls = await urlsFor(page, publicOnly)
    return { success: true, templates: page.map(row => itemOf(row, urls, publicOnly)), nextCursor: page.length === PAGE_SIZE ? String(page[page.length - 1]._id) : '' }
  }
  async function get(event) {
    const id = String(event.templateId || '')
    if (!/^[a-f0-9]{32}$/.test(id)) return { success: false, code: 'CARD_TEMPLATE_ID_INVALID', error: '模板编号无效' }
    const record = await read(id)
    if (!record) return { success: false, code: 'CARD_TEMPLATE_NOT_FOUND', error: '模板不存在' }
    const urls = await urlsFor([record], false)
    const template = itemOf(record, urls, false)
    if (record.draft?.backgroundFileId && record.draft?.maskFileId) {
      const [background, mask] = await Promise.all([
        cloud.downloadFile({ fileID: record.draft.backgroundFileId }),
        cloud.downloadFile({ fileID: record.draft.maskFileId })
      ])
      if (background.fileContent?.length > MAX_IMAGE_BYTES || mask.fileContent?.length > MAX_IMAGE_BYTES) throw new Error('模板素材过大，请重新上传')
      template.backgroundData = 'data:image/png;base64,' + background.fileContent.toString('base64')
      template.maskData = 'data:image/png;base64,' + mask.fileContent.toString('base64')
    }
    return { success: true, template }
  }
  async function save(event, auth) {
    const id = String(event.templateId || '')
    if (id && !/^[a-f0-9]{32}$/.test(id)) return { success: false, code: 'CARD_TEMPLATE_ID_INVALID', error: '模板编号无效' }
    const tier = tierOf(event.tier), title = titleOf(event.title), layout = normalizeLayout(event.layout)
    const record = id ? await read(id) : null
    if (id && !record) return { success: false, code: 'CARD_TEMPLATE_NOT_FOUND', error: '模板不存在，请刷新列表' }
    if (record && record.tier !== tier) return { success: false, code: 'CARD_TEMPLATE_TIER_LOCKED', error: '已有模板不能更换等级，请新建模板' }
    const photo = normalizePhoto(event.photo || record?.draft?.photo)
    const badges = normalizeBadges(event.badges || record?.draft?.badges)
    const background = event.backgroundData ? pngBuffer(event.backgroundData, 'background') : null
    const mask = event.maskData ? pngBuffer(event.maskData, 'mask') : null
    if ((!background && !record?.draft?.backgroundFileId) || (!mask && !record?.draft?.maskFileId)) return { success: false, code: 'CARD_TEMPLATE_INCOMPLETE', error: '请上传背景图和黑白遮罩' }
    const revision = Number(event.revision || 0)
    if (record && revision !== Number(record.revision || 0)) return { success: false, code: 'CARD_TEMPLATE_CONFLICT', error: '模板已更新，请重新加载' }
    const templateId = id || crypto.randomBytes(16).toString('hex')
    const draftVersion = Number(record?.draftVersion || 0) + 1
    const folder = `player-card-templates/${templateId}/${draftVersion}-${crypto.randomBytes(6).toString('hex')}`
    const uploaded = []
    try {
      const backgroundFileId = background ? (await cloud.uploadFile({ cloudPath: `${folder}/background.png`, fileContent: background })).fileID : record.draft.backgroundFileId
      if (background) uploaded.push(backgroundFileId)
      const maskFileId = mask ? (await cloud.uploadFile({ cloudPath: `${folder}/mask.png`, fileContent: mask })).fileID : record.draft.maskFileId
      if (mask) uploaded.push(maskFileId)
      const draft = { title, backgroundFileId, maskFileId, layout, photo, badges }
      if (record) {
        await db.runTransaction(async tx => {
          const currentResult = await tx.collection(COLLECTION).doc(templateId).get()
          const current = Array.isArray(currentResult.data) ? currentResult.data[0] : currentResult.data
          if (!current || Number(current.revision || 0) !== revision) throw Object.assign(new Error('模板已更新，请重新加载'), { code: 'CARD_TEMPLATE_CONFLICT' })
          await tx.collection(COLLECTION).doc(templateId).update({ data: { draft, draftVersion, revision: revision + 1, updateAt: db.serverDate(), updatedBy: auth.userId } })
        })
      } else {
        await db.collection(COLLECTION).add({ data: { _id: templateId, tier, draft, draftVersion, publishedVersion: 0, status: 'draft', revision: 1, createAt: db.serverDate(), updateAt: db.serverDate(), createdBy: auth.userId, updatedBy: auth.userId } })
      }
      return { success: true, templateId, revision: revision + 1, draftVersion }
    } catch (error) {
      if (uploaded.length) await cloud.deleteFile({ fileList: uploaded }).catch(() => {})
      throw error
    }
  }
  async function changeStatus(event, action, auth) {
    const id = String(event.templateId || '')
    if (!/^[a-f0-9]{32}$/.test(id)) return { success: false, code: 'CARD_TEMPLATE_ID_INVALID', error: '模板编号无效' }
    const revision = Number(event.revision)
    if (!Number.isSafeInteger(revision) || revision < 1) return { success: false, code: 'CARD_TEMPLATE_REVISION_INVALID', error: '请刷新模板后重试' }
    let publishedVersion = 0
    await db.runTransaction(async tx => {
      const result = await tx.collection(COLLECTION).doc(id).get()
      const row = Array.isArray(result.data) ? result.data[0] : result.data
      if (!row) throw Object.assign(new Error('模板不存在，请刷新列表'), { code: 'CARD_TEMPLATE_NOT_FOUND' })
      if (Number(row.revision || 0) !== revision) throw Object.assign(new Error('模板已更新，请重新加载'), { code: 'CARD_TEMPLATE_CONFLICT' })
      if (action === 'publish') {
        if (!row.draft?.backgroundFileId || !row.draft?.maskFileId) throw Object.assign(new Error('请先上传背景图和黑白遮罩'), { code: 'CARD_TEMPLATE_INCOMPLETE' })
        publishedVersion = Number(row.draftVersion || 0)
        await tx.collection(COLLECTION).doc(id).update({ data: { published: row.draft, publishedVersion, status: 'published', revision: revision + 1, publishedAt: db.serverDate(), publishedBy: auth.userId, updateAt: db.serverDate() } })
      } else {
        if (row.status !== 'published') throw Object.assign(new Error('模板尚未发布'), { code: 'CARD_TEMPLATE_NOT_PUBLISHED' })
        publishedVersion = Number(row.publishedVersion || 0)
        await tx.collection(COLLECTION).doc(id).update({ data: { status: 'withdrawn', revision: revision + 1, withdrawnAt: db.serverDate(), withdrawnBy: auth.userId, updateAt: db.serverDate() } })
      }
    })
    return { success: true, templateId: id, revision: revision + 1, publishedVersion, status: action === 'publish' ? 'published' : 'withdrawn' }
  }
  return async function handle(event) {
    const action = String(event.action || '')
    if (action === 'listPublishedPlayerCardTemplates') return list(event, true)
    const auth = await owner(event)
    if (!auth.success) return auth
    try {
      if (action === 'listPlayerCardTemplates') return await list(event, false)
      if (action === 'getPlayerCardTemplate') return await get(event)
      if (action === 'savePlayerCardTemplate') return await save(event, auth)
      if (action === 'publishPlayerCardTemplate') return await changeStatus(event, 'publish', auth)
      if (action === 'withdrawPlayerCardTemplate') return await changeStatus(event, 'withdraw', auth)
      return { success: false, code: 'CARD_TEMPLATE_ACTION_INVALID', error: '未知模板操作' }
    } catch (error) {
      return { success: false, code: error.code || 'CARD_TEMPLATE_ERROR', error: error.message || '模板操作失败，请重试' }
    }
  }
}

module.exports = { createPlayerCardTemplates, pngBuffer, normalizeLayout, normalizePhoto, normalizeBadges, DEFAULT_LAYOUT, DEFAULT_PHOTO, DEFAULT_BADGES }
