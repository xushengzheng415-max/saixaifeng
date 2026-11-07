// 报名材料配置的统一口径。
// 配置以组别为单位保存：materialRequirements（含身份证留存的 idDocParts）。
// 球员端与既有报名流程仍读取旧布尔字段，因此保存时必须由材料清单统一派生。
export const MATERIAL_ITEMS = [
  { key: 'photo', label: '标准形象照' },
  { key: 'jerseyNo', label: '球衣号码' },
  { key: 'idDocs', label: '身份证材料' },
  { key: 'realName', label: '实名认证', paid: true },
  { key: 'faceCheck', label: '人脸核验', noLiveness: true },
  { key: 'insurance', label: '意外保险' },
  { key: 'waiver', label: '免责协议' }
]

export const MATERIAL_OPTIONS = [
  { value: 'none', label: '不需要' },
  { value: 'optional', label: '选填' },
  { value: 'required', label: '必填' }
]

// 身份证材料只区分提交方式，不再使用“必填/选填”。
export const ID_DOC_OPTIONS = [
  { value: 'number', label: '提交身份证号' },
  { value: 'photos', label: '提交身份证正反面' },
  { value: 'none', label: '不提交' }
]

export const ID_DOC_PARTS = [
  { key: 'frontPhoto', label: '人像面' },
  { key: 'backPhoto', label: '国徽面' }
]

export const ID_DOC_MODES = ['none', 'number', 'photos']

export function materialDefaults() {
  return { photo: 'required', jerseyNo: 'required', idDocs: 'none', realName: 'none', faceCheck: 'none', insurance: 'required', waiver: 'optional' }
}

export function idDocPartDefaults() {
  return { frontPhoto: true, backPhoto: false }
}

function normalizeIdDocs(saved, source, fallback) {
  // 旧数据里 required / optional 都表示“提交正反面留存”。
  if (saved === 'required' || saved === 'optional') return 'photos'
  if (ID_DOC_MODES.includes(saved)) return saved
  const merged = source && source.materialRequirements && source.materialRequirements.identity
  if (merged === 'required' || merged === 'optional') return 'photos'
  if (merged === 'none') return 'none'
  if (typeof source?.identityDocumentRequired === 'boolean') return source.identityDocumentRequired ? 'photos' : 'none'
  return fallback
}

export function normalizeMaterialRequirements(source) {
  const defaults = materialDefaults()
  const stored = source && typeof source.materialRequirements === 'object' && source.materialRequirements ? source.materialRequirements : {}
  const result = {}
  MATERIAL_ITEMS.forEach(item => {
    const key = item.key
    const saved = stored[key]
    if (key === 'idDocs') { result[key] = normalizeIdDocs(saved, source, defaults[key]); return }
    if (['none', 'optional', 'required'].includes(saved)) { result[key] = saved; return }
    const legacyKey = { photo: 'portraitRequired', insurance: 'insuranceRequired', waiver: 'waiverRequired', faceCheck: 'faceVerificationRequired', realName: 'identityVerificationRequired' }[key]
    if (key === 'realName' && ['none', 'optional', 'required'].includes(stored.identity)) { result[key] = stored.identity; return }
    if (legacyKey && typeof source?.[legacyKey] === 'boolean') { result[key] = source[legacyKey] ? 'required' : 'none'; return }
    result[key] = defaults[key]
  })
  return result
}

// 身份证留存面统一存放在 materialRequirements.idDocParts，读取时兼容旧的顶层与 identityParts。
export function normalizeIdDocParts(source) {
  const materials = source && typeof source.materialRequirements === 'object' && source.materialRequirements ? source.materialRequirements : {}
  const stored = [materials.idDocParts, materials.identityParts, source?.idDocParts].find(item => item && typeof item === 'object')
  if (!stored) return idDocPartDefaults()
  const defaults = idDocPartDefaults()
  const result = {}
  ID_DOC_PARTS.forEach(part => { result[part.key] = typeof stored[part.key] === 'boolean' ? stored[part.key] : defaults[part.key] })
  return result
}

export function idDocsEnabled(materials) {
  return Boolean(materials) && materials.idDocs !== 'none'
}

// 旧布尔字段用于既有报名、名单与参赛证校验，必须随材料清单同步派生。
export function deriveLegacyRequirements(materials) {
  const state = key => (materials && materials[key]) || 'none'
  return {
    identityVerificationRequired: state('realName') === 'required',
    portraitRequired: state('photo') === 'required',
    identityDocumentRequired: idDocsEnabled(materials),
    faceVerificationRequired: state('faceCheck') === 'required',
    insuranceRequired: state('insurance') === 'required',
    waiverRequired: state('waiver') === 'required'
  }
}

export function buildMaterialPayload(materials, parts) {
  const requirements = { ...(materials || {}), idDocParts: { ...(parts || {}) } }
  return { materialRequirements: requirements, ...deriveLegacyRequirements(requirements) }
}
