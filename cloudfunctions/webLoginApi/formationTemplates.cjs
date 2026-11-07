// 阵型模板：唯一真源为 shared/formation-templates.json（经 tools/sync-formation-templates.mjs 同步到本目录）。
// 坐标口径：x = 本方半场纵深（0 = 本方球门线，100 = 中线）；y = 横向（0 = 左边线，100 = 右边线）。
// 横版主队 left = x / 2、top = y；横版客队 left = 50 + x / 2、top = y；竖版 left = y、top = 100 - x。不做客队镜像。
// 本模块只做两件事：给各端只读下发已发布模板；给平台运营后台做草稿、发布、归档与历史版本。
const BUILTIN = require('./formation-templates.json')

const COLLECTION = 'formation_templates'
const VERSION_COLLECTION = 'formation_template_versions'
const FORMAT_SIZES = [5, 7, 8, 9, 11]
const MAX_NAME = 40
const MAX_DESCRIPTION = 200
const MAX_LABEL = 20
const VERSION_LIMIT = 30

const DF = new Set(['SW', 'LB', 'RB', 'CB', 'CB1', 'CB2', 'CB3', 'LWB', 'RWB', 'DF'])
const MF = new Set(['DM', 'CM', 'CM1', 'CM2', 'CM3', 'CM4', 'LM', 'RM', 'AM', 'MF'])

function deriveSlotRole(role) {
  const code = String(role || '').trim().toUpperCase()
  if (code === 'GK') return 'GK'
  if (DF.has(code) || /^(CB|LB|RB|LWB|RWB|SW)/.test(code)) return 'DF'
  if (MF.has(code) || /^(DM|CM|LM|RM|AM)/.test(code)) return 'MF'
  return 'FW'
}

function invalid(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function formatOf(size) {
  return BUILTIN.formats[String(size)] || null
}

function builtinTemplate(size, code) {
  const format = formatOf(size)
  return (format && format.templates && format.templates[code]) || null
}

function isRetired(size, code) {
  const format = formatOf(size)
  return Boolean(format && Array.isArray(format.retired) && format.retired.includes(code))
}

function templateKeyOf(size, code) {
  return `${size}-${code}`
}

function builtinSlots(size, code) {
  const template = builtinTemplate(size, code)
  if (!template) return []
  return template.positions.map((position, index) => ({
    slotId: `slot-${index}`,
    role: position.role,
    label: position.label,
    position: template.slotRoles[index],
    x: position.x,
    y: position.y
  }))
}

function normalizeText(value, max, field, allowEmpty) {
  const text = String(value == null ? '' : value).trim()
  if (!text && !allowEmpty) throw invalid('FORMATION_TEMPLATE_TEXT_INVALID', `${field}不能为空`)
  if (text.length > max) throw invalid('FORMATION_TEMPLATE_TEXT_INVALID', `${field}不能超过 ${max} 个字符`)
  return text
}

function normalizeCode(size, code) {
  const value = String(code == null ? '' : code).trim()
  if (!/^\d+(?:-\d+)*$/.test(value) || value.length > 20) throw invalid('FORMATION_TEMPLATE_CODE_INVALID', '阵型编号只能用数字和短横线，例如 3-3-1')
  const rows = value.split('-').map(Number)
  const total = rows.reduce((sum, row) => sum + row, 0)
  if (rows.some(row => !Number.isInteger(row) || row <= 0 || row > size) || total + 1 !== size) {
    throw invalid('FORMATION_TEMPLATE_CODE_INVALID', `阵型编号与 ${size} 人制不匹配（各行之和应等于场上人数 - 1）`)
  }
  return value
}

function normalizeSlots(raw, size) {
  if (!Array.isArray(raw)) throw invalid('FORMATION_TEMPLATE_SLOTS_INVALID', '阵型点位数据无效')
  if (raw.length !== size) throw invalid('FORMATION_TEMPLATE_SLOTS_INVALID', `点位数必须等于 ${size} 人，当前 ${raw.length} 个`)
  const seen = new Set()
  let goalkeeper = 0
  const slots = raw.map((item, index) => {
    const role = String(item && item.role ? item.role : '').trim().toUpperCase()
    const label = String(item && item.label ? item.label : '').trim()
    const x = Math.round(Number(item && item.x) * 100) / 100
    const y = Math.round(Number(item && item.y) * 100) / 100
    if (!role || role.length > 8) throw invalid('FORMATION_TEMPLATE_SLOTS_INVALID', `第 ${index + 1} 个点位缺少角色码`)
    if (!label || label.length > MAX_LABEL) throw invalid('FORMATION_TEMPLATE_SLOTS_INVALID', `第 ${index + 1} 个点位的位置名称为空或超过 ${MAX_LABEL} 个字符`)
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) {
      throw invalid('FORMATION_TEMPLATE_SLOTS_INVALID', `第 ${index + 1} 个点位坐标必须在 0-100 之间`)
    }
    if (seen.has(role)) throw invalid('FORMATION_TEMPLATE_SLOTS_INVALID', `角色码重复：${role}`)
    seen.add(role)
    if (role === 'GK') goalkeeper += 1
    return { slotId: `slot-${index}`, role, label, position: deriveSlotRole(role), x, y }
  })
  if (goalkeeper !== 1) throw invalid('FORMATION_TEMPLATE_SLOTS_INVALID', '阵型必须且只能有 1 名守门员（GK）')
  return slots
}

function createFormationTemplates({ cloud, authenticateWebSession }) {
  const db = cloud.database()
  const _ = db.command

  async function readSession(event) {
    const auth = await authenticateWebSession(event)
    if (!auth || !auth.success) {
      return { error: { success: false, code: 'AUTH_REQUIRED', error: '登录会话已失效，请重新登录' } }
    }
    return { auth }
  }

  function ownerOnly(auth) {
    return auth.principalType === 'platform_owner' && auth.user && auth.user.isPlatformOwner === true
  }

  function forbidden() {
    return { success: false, code: 'FORMATION_TEMPLATE_FORBIDDEN', error: '仅平台运营可维护阵型模板' }
  }

  async function readDoc(key) {
    try {
      const result = await db.collection(COLLECTION).doc(key).get()
      return (result && result.data && (Array.isArray(result.data) ? result.data[0] : result.data)) || null
    } catch (error) {
      return null
    }
  }

  async function readAllDocs() {
    // 集合未创建时（首次部署、尚未初始化）按空集处理，保证只读接口与内置模板不受影响。
    try {
      const result = await db.collection(COLLECTION).limit(200).get()
      const map = new Map()
      for (const row of result.data || []) map.set(String(row._id), row)
      return map
    } catch (error) {
      return new Map()
    }
  }

  // 坐标只认代码种子：formation_templates 里的 slots 仅作为草稿与历史版本回查，不参与任何渲染。
  function publishedSlotsOf(doc, size, code) {
    const builtin = builtinTemplate(size, code)
    if (builtin) return builtinSlots(size, code)
    return doc && Array.isArray(doc.slots) ? doc.slots : []
  }

  function summarize(size, code, doc) {
    const builtin = builtinTemplate(size, code)
    const retired = isRetired(size, code) || Boolean(doc && doc.status === 'archived')
    return {
      templateKey: templateKeyOf(size, code),
      playersOnField: size,
      code,
      name: String((doc && doc.name) || (builtin && builtin.name) || code),
      description: String((doc && doc.description) || (builtin && builtin.description) || ''),
      retired,
      status: retired ? 'archived' : 'active',
      version: Number((doc && doc.version) || (builtin ? 1 : 0)),
      hasDraft: Boolean(doc && doc.draft && Array.isArray(doc.draft.slots) && doc.draft.slots.length),
      draftUpdatedAt: (doc && doc.draft && doc.draft.updatedAt) || null,
      source: doc ? 'database' : 'builtin',
      slotCount: publishedSlotsOf(doc, size, code).length
    }
  }

  async function list(event) {
    const session = await readSession(event)
    if (session.error) return session.error
    const docs = await readAllDocs()
    const formats = Object.values(BUILTIN.formats).map(format => {
      const size = Number(format.playersOnField)
      const codes = [...format.active, ...format.retired]
      for (const doc of docs.values()) {
        const code = String((doc && doc.formation) || '')
        if (Number(doc && doc.playersOnField) === size && code && !codes.includes(code)) codes.push(code)
      }
      return {
        size,
        label: format.label,
        playersOnField: size,
        description: format.description || '',
        active: format.active.slice(),
        retired: format.retired.slice(),
        templates: codes.map(code => summarize(size, code, docs.get(templateKeyOf(size, code))))
      }
    })
    return { success: true, canEdit: ownerOnly(session.auth), coordinateSystem: BUILTIN.coordinateSystem, formats }
  }

  async function get(event) {
    const session = await readSession(event)
    if (session.error) return session.error
    const size = Number(event.playersOnField)
    const code = String(event.formation || '').trim()
    if (!FORMAT_SIZES.includes(size) || !code) return { success: false, code: 'FORMATION_TEMPLATE_PARAMS_INVALID', error: '缺少人数制或阵型编号' }
    const key = templateKeyOf(size, code)
    const doc = await readDoc(key)
    const builtin = builtinTemplate(size, code)
    if (!doc && !builtin) return { success: false, code: 'FORMATION_TEMPLATE_NOT_FOUND', error: '阵型模板不存在' }
    const slots = publishedSlotsOf(doc, size, code)
    let versions = []
    try {
      const result = await db.collection(VERSION_COLLECTION).where({ templateKey: key }).orderBy('version', 'desc').limit(VERSION_LIMIT).get()
      versions = (result.data || []).map(row => ({
        version: Number(row.version),
        publishedAt: row.publishedAt || null,
        publishedBy: String(row.publishedBy || ''),
        slotCount: Array.isArray(row.slots) ? row.slots.length : 0
      }))
    } catch (error) {
      versions = []
    }
    return {
      success: true,
      canEdit: ownerOnly(session.auth),
      coordinateSystem: BUILTIN.coordinateSystem,
      template: {
        templateKey: key,
        playersOnField: size,
        code,
        name: String((doc && doc.name) || (builtin && builtin.name) || code),
        description: String((doc && doc.description) || (builtin && builtin.description) || ''),
        status: doc && doc.status === 'archived' ? 'archived' : (isRetired(size, code) ? 'archived' : 'active'),
        retired: isRetired(size, code),
        version: Number((doc && doc.version) || (builtin ? 1 : 0)),
        slots,
        draft: doc && doc.draft && Array.isArray(doc.draft.slots) ? {
          name: String(doc.draft.name || ''),
          description: String(doc.draft.description || ''),
          slots: doc.draft.slots,
          updatedAt: doc.draft.updatedAt || null
        } : null,
        updatedAt: (doc && doc.updateTime) || null,
        publishedAt: (doc && doc.publishedAt) || null
      },
      versions
    }
  }

  async function saveDraft(event) {
    const session = await readSession(event)
    if (session.error) return session.error
    if (!ownerOnly(session.auth)) return forbidden()
    const size = Number(event.playersOnField)
    if (!FORMAT_SIZES.includes(size)) return { success: false, code: 'FORMATION_TEMPLATE_PARAMS_INVALID', error: '人数制必须是 5/7/8/9/11' }
    const code = normalizeCode(size, event.formation)
    if (isRetired(size, code)) return { success: false, code: 'FORMATION_TEMPLATE_RETIRED', error: '该阵型已停用，只能历史回看，不能新建或修改点位' }
    const slots = normalizeSlots(event.slots, size)
    const name = normalizeText(event.name, MAX_NAME, '阵型名称')
    const description = normalizeText(event.description, MAX_DESCRIPTION, '阵型说明', true)
    const key = templateKeyOf(size, code)
    const existing = await readDoc(key)
    const builtin = builtinTemplate(size, code)
    if (existing && existing.status === 'archived') {
      return { success: false, code: 'FORMATION_TEMPLATE_ARCHIVED', error: '已归档的阵型不能继续编辑，请改为新建阵型' }
    }
    if (existing && existing.formation && String(existing.formation) !== code) {
      return { success: false, code: 'FORMATION_TEMPLATE_KEY_LOCKED', error: '阵型编号不可修改' }
    }
    const published = publishedSlotsOf(existing, size, code)
    if (published.length && published.map(slot => slot.role).join('|') !== slots.map(slot => slot.role).join('|')) {
      return { success: false, code: 'FORMATION_TEMPLATE_ROLES_LOCKED', error: '已发布阵型的位置角色不可增删或换序，只能调整坐标与名称' }
    }
    if (!existing && !builtin) {
      // 全新阵型：先落草稿，版本号从 0 开始，首次发布才是 v1。
      await db.collection(COLLECTION).doc(key).set({
        data: {
          playersOnField: size,
          formation: code,
          name,
          description,
          aliasOf: '',
          orientation: 'landscape',
          status: 'active',
          version: 0,
          slots: [],
          draft: { slots, name, description, updatedBy: session.auth.user._id, updatedAt: new Date() },
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      })
      return { success: true, templateKey: key, version: 0, draftSaved: true }
    }
    const draft = { slots, name, description, updatedBy: session.auth.user._id, updatedAt: new Date() }
    if (existing) {
      await db.collection(COLLECTION).doc(key).update({ data: { draft, updateTime: db.serverDate() } })
      return { success: true, templateKey: key, version: Number(existing.version || 0), draftSaved: true }
    }
    // 内置模板第一次编辑：把内置内容固化为 v1 已发布版本，再挂草稿。
    await db.collection(COLLECTION).doc(key).set({
      data: {
        playersOnField: size,
        formation: code,
        name: builtin.name,
        description: builtin.description || '',
        aliasOf: '',
        orientation: 'landscape',
        status: 'active',
        version: 1,
        slots: builtinSlots(size, code),
        draft,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })
    return { success: true, templateKey: key, version: 1, draftSaved: true }
  }

  async function publish(event) {
    const session = await readSession(event)
    if (session.error) return session.error
    if (!ownerOnly(session.auth)) return forbidden()
    const size = Number(event.playersOnField)
    const code = String(event.formation || '').trim()
    if (!FORMAT_SIZES.includes(size) || !code) return { success: false, code: 'FORMATION_TEMPLATE_PARAMS_INVALID', error: '缺少人数制或阵型编号' }
    const key = templateKeyOf(size, code)
    const doc = await readDoc(key)
    if (!doc || !doc.draft || !Array.isArray(doc.draft.slots) || !doc.draft.slots.length) {
      return { success: false, code: 'FORMATION_TEMPLATE_DRAFT_REQUIRED', error: '没有待发布的草稿' }
    }
    if (doc.status === 'archived') return { success: false, code: 'FORMATION_TEMPLATE_ARCHIVED', error: '已归档的阵型不能发布' }
    const published = publishedSlotsOf(doc, size, code)
    if (published.length && published.map(slot => slot.role).join('|') !== doc.draft.slots.map(slot => slot.role).join('|')) {
      return { success: false, code: 'FORMATION_TEMPLATE_ROLES_LOCKED', error: '已发布阵型的位置角色不可增删或换序' }
    }
    const slots = normalizeSlots(doc.draft.slots, size)
    const name = normalizeText(doc.draft.name || doc.name, MAX_NAME, '阵型名称')
    const description = normalizeText(doc.draft.description || '', MAX_DESCRIPTION, '阵型说明', true)
    const version = Number(doc.version || 0) + 1
    await db.collection(VERSION_COLLECTION).add({
      data: {
        templateKey: key,
        playersOnField: size,
        formation: code,
        version,
        name,
        description,
        slots,
        publishedBy: session.auth.user._id,
        publishedAt: db.serverDate()
      }
    })
    await db.collection(COLLECTION).doc(key).update({
      data: {
        name,
        description,
        slots,
        version,
        status: 'active',
        publishedBy: session.auth.user._id,
        publishedAt: db.serverDate(),
        draft: _.remove(),
        updateTime: db.serverDate()
      }
    })
    return { success: true, templateKey: key, version }
  }

  async function archive(event) {
    const session = await readSession(event)
    if (session.error) return session.error
    if (!ownerOnly(session.auth)) return forbidden()
    const size = Number(event.playersOnField)
    const code = String(event.formation || '').trim()
    if (!FORMAT_SIZES.includes(size) || !code) return { success: false, code: 'FORMATION_TEMPLATE_PARAMS_INVALID', error: '缺少人数制或阵型编号' }
    const key = templateKeyOf(size, code)
    const doc = await readDoc(key)
    if (!doc) return { success: false, code: 'FORMATION_TEMPLATE_NOT_FOUND', error: '内置阵型无需归档，可直接停用或改造；集合内没有该模板' }
    await db.collection(COLLECTION).doc(key).update({
      data: { status: 'archived', draft: _.remove(), archivedBy: session.auth.user._id, archivedAt: db.serverDate(), updateTime: db.serverDate() }
    })
    return { success: true, templateKey: key }
  }

  async function versions(event) {
    const session = await readSession(event)
    if (session.error) return session.error
    const size = Number(event.playersOnField)
    const code = String(event.formation || '').trim()
    if (!FORMAT_SIZES.includes(size) || !code) return { success: false, code: 'FORMATION_TEMPLATE_PARAMS_INVALID', error: '缺少人数制或阵型编号' }
    const key = templateKeyOf(size, code)
    const result = await db.collection(VERSION_COLLECTION).where({ templateKey: key }).orderBy('version', 'desc').limit(VERSION_LIMIT).get()
    return {
      success: true,
      canEdit: ownerOnly(session.auth),
      versions: (result.data || []).map(row => ({
        version: Number(row.version),
        name: String(row.name || ''),
        description: String(row.description || ''),
        slots: Array.isArray(row.slots) ? row.slots : [],
        publishedAt: row.publishedAt || null,
        publishedBy: String(row.publishedBy || '')
      }))
    }
  }

  async function restoreVersion(event) {
    const session = await readSession(event)
    if (session.error) return session.error
    if (!ownerOnly(session.auth)) return forbidden()
    const size = Number(event.playersOnField)
    const code = String(event.formation || '').trim()
    const version = Number(event.version)
    if (!FORMAT_SIZES.includes(size) || !code || !Number.isFinite(version)) {
      return { success: false, code: 'FORMATION_TEMPLATE_PARAMS_INVALID', error: '缺少人数制、阵型编号或版本号' }
    }
    const key = templateKeyOf(size, code)
    const result = await db.collection(VERSION_COLLECTION).where({ templateKey: key, version }).limit(1).get()
    const target = (result.data || [])[0]
    if (!target) return { success: false, code: 'FORMATION_TEMPLATE_VERSION_NOT_FOUND', error: '该历史版本不存在' }
    const doc = await readDoc(key)
    const published = publishedSlotsOf(doc, size, code)
    const slots = normalizeSlots(target.slots, size)
    if (published.length && published.map(slot => slot.role).join('|') !== slots.map(slot => slot.role).join('|')) {
      return { success: false, code: 'FORMATION_TEMPLATE_ROLES_LOCKED', error: '该历史版本的位置角色与当前不一致，无法直接另存为新版本' }
    }
    const draft = {
      slots,
      name: String(target.name || ''),
      description: String(target.description || ''),
      updatedBy: session.auth.user._id,
      updatedAt: new Date()
    }
    if (doc) await db.collection(COLLECTION).doc(key).update({ data: { draft, updateTime: db.serverDate() } })
    else {
      const builtin = builtinTemplate(size, code)
      await db.collection(COLLECTION).doc(key).set({
        data: {
          playersOnField: size,
          formation: code,
          name: (builtin && builtin.name) || code,
          description: (builtin && builtin.description) || '',
          aliasOf: '',
          orientation: 'landscape',
          status: 'active',
          version: 1,
          slots: builtinSlots(size, code),
          draft,
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      })
    }
    return { success: true, templateKey: key, restoredFrom: version, draftSaved: true }
  }

  async function seed(event) {
    const session = await readSession(event)
    if (session.error) return session.error
    if (!ownerOnly(session.auth)) return forbidden()
    const docs = await readAllDocs()
    const planned = []
    for (const format of Object.values(BUILTIN.formats)) {
      const size = Number(format.playersOnField)
      for (const code of [...format.active, ...format.retired]) {
        const key = templateKeyOf(size, code)
        if (docs.has(key)) continue
        const builtin = builtinTemplate(size, code)
        planned.push({
          templateKey: key,
          playersOnField: size,
          formation: code,
          name: builtin.name,
          status: isRetired(size, code) ? 'archived' : 'active',
          slotCount: builtin.positions.length
        })
      }
    }
    if (event.confirm !== true) return { success: true, dryRun: true, planned, written: 0 }
    const written = []
    for (const item of planned) {
      const builtin = builtinTemplate(item.playersOnField, item.formation)
      await db.collection(COLLECTION).doc(item.templateKey).set({
        data: {
          playersOnField: item.playersOnField,
          formation: item.formation,
          name: builtin.name,
          description: builtin.description || '',
          aliasOf: '',
          orientation: 'landscape',
          status: item.status,
          version: 1,
          slots: builtinSlots(item.playersOnField, item.formation),
          seededBy: session.auth.user._id,
          publishedAt: db.serverDate(),
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      })
      written.push(item.templateKey)
    }
    return { success: true, dryRun: false, planned, written: written.length }
  }

  return async function handle(event) {
    const params = event || {}
    try {
      switch (params.action) {
        case 'listFormationTemplates': return await list(params)
        case 'getFormationTemplate': return await get(params)
        case 'listFormationTemplateVersions': return await versions(params)
        case 'saveFormationTemplateDraft': return await saveDraft(params)
        case 'publishFormationTemplate': return await publish(params)
        case 'archiveFormationTemplate': return await archive(params)
        case 'restoreFormationTemplateVersion': return await restoreVersion(params)
        case 'seedFormationTemplates': return await seed(params)
        default: return { success: false, code: 'FORMATION_TEMPLATE_ACTION_INVALID', error: '不支持的阵型模板操作' }
      }
    } catch (error) {
      return { success: false, code: error.code || 'FORMATION_TEMPLATE_FAILED', error: error.message || '阵型模板操作失败' }
    }
  }
}

module.exports = { createFormationTemplates, deriveSlotRole }
