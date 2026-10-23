'use strict'
// Sole authority for public business numbers. Never replace document IDs or relations.
const crypto = require('node:crypto')
const regions = require('./numbering-regions.json')
const VERSION = 'football-numbering/1'
const text = value => typeof value === 'string' ? value.trim() : ''
const fail = (code, message) => { throw Object.assign(new Error(message), { code }) }
const compact = value => text(value).replace(/[\s·,，/\-]/g, '').replace(/特别行政区|自治区|自治州|省|市/g, '')
const synthetic = row => Boolean(row && (row.synthetic === true || row.isTest === true || text(row.syntheticDatasetId || row.syntheticKey) || text(row.source).toLowerCase() === 'ai_fixture' || ['test', 'virtual', 'synthetic', 'demo'].includes(text(row.originType || row.dataKind).toLowerCase())))
const active = row => row && !synthetic(row) && row.isDeleted !== true && row.status !== 'deleted'
const keys = ['businessNumber', 'numbering']
function guardWrite(data = {}) {
  if (Object.keys(data).some(key => keys.some(field => key === field || key.startsWith(field + '.')))) fail('NUMBERING_READ_ONLY', '平台编号由统一后端分配，不能直接修改')
  for (const field of ['nativePlaceRegion', 'registrationRegion']) if (Object.prototype.hasOwnProperty.call(data, field) && !validateRegion(data[field])) fail('NUMBERING_REGION_REQUIRED', '省份和城市为必填项，请完整选择有效地区')
}
function validateRegion(input) {
  if (!input || typeof input !== 'object') return null
  const provinceCode = text(input.provinceCode), cityLetter = text(input.cityLetter).toUpperCase()
  const province = regions.provinceCodeMap.find(row => row.code === provinceCode)
  const city = (regions.cityLetterMap[provinceCode] || []).find(row => row.l === cityLetter)
  return province && city ? { provinceCode, cityLetter, provinceName: province.name, cityName: city.n } : null
}
function inferRegion(row, kind) {
  const player = kind === 'players'
  const structured = validateRegion(player ? row.nativePlaceRegion : row.registrationRegion)
  if (structured) return { ...structured, source: player ? 'native_place_region' : 'team_registration_region' }
  const explicit = player
    ? validateRegion({ provinceCode: row.nativePlaceProvinceCode, cityLetter: row.nativePlaceCityLetter })
    : validateRegion({ provinceCode: row.provinceCode, cityLetter: row.cityCode })
  if (explicit) return { ...explicit, source: player ? 'native_place_fields' : 'team_registration_fields' }
  // A player's team, ID card address and current residence are deliberately absent.
  const raw = player ? (typeof row.nativePlace === 'string' ? row.nativePlace : '') : [row.provinceName, row.province, row.cityName, row.city].filter(v => typeof v === 'string').join(' ')
  const value = compact(raw)
  if (!value) return null
  const provinces = regions.provinceCodeMap.filter(p => value.includes(compact(p.name)))
  const coded = !player && regions.provinceCodeMap.find(p => p.code === text(row.provinceCode))
  const province = coded || (provinces.length === 1 ? provinces[0] : null)
  if (!province) return null
  const candidates = (regions.cityLetterMap[province.code] || []).filter(c => !/出租|城区|郊区|增补|系统|油田|进入|农垦/.test(c.n) && value.includes(compact(c.n)))
  const longest = candidates.length ? Math.max(...candidates.map(c => compact(c.n).length)) : 0
  const matches = candidates.filter(c => compact(c.n).length === longest)
  if (matches.length !== 1) return null
  return { provinceCode: province.code, cityLetter: matches[0].l, provinceName: province.name, cityName: matches[0].n, source: player ? 'native_place_text' : 'team_registration_text' }
}
function validNumber(value, kind) {
  return typeof value === 'string' && (kind === 'players' ? /^P\d{3}[A-Z]\d{8}$/.test(value) : /^\d{3}[A-Z]\d{5}(?:-\d{2})?$/.test(value))
}
function revision(row, kind) {
  const fields = kind === 'players' ? ['nativePlace', 'nativePlaceRegion', 'nativePlaceProvinceCode', 'nativePlaceCityLetter', 'teamId', 'teamCode'] : ['registrationRegion', 'provinceCode', 'provinceName', 'province', 'cityCode', 'cityName', 'city', 'parentTeamId']
  return crypto.createHash('sha256').update(JSON.stringify(Object.fromEntries(['_id', ...fields, ...keys, 'isDeleted', 'status', 'synthetic', 'isTest', 'syntheticDatasetId', 'syntheticKey', 'source', 'originType', 'dataKind'].map(k => [k, row[k] ?? null])))).digest('hex')
}
function view(row, kind) {
  const number = text(row.businessNumber), meta = row.numbering
  const region = validateRegion(meta?.region)
  const verified = validNumber(number, kind) && meta?.version === VERSION && meta.kind === kind && region && number.startsWith((kind === 'players' ? 'P' : '') + region.provinceCode + region.cityLetter)
  if (number) return { kind, number: verified ? number : '', status: verified ? 'issued' : 'conflict', region: verified ? region : null, revision: revision(row, kind) }
  const inferred = inferRegion(row, kind)
  return { kind, number: '', status: kind === 'teams' && row.parentTeamId ? 'parent_required' : inferred ? 'ready' : 'region_required', region: inferred, revision: revision(row, kind) }
}
async function doc(db, collection, id) {
  try { const value = (await db.collection(collection).doc(id).get()).data; return Array.isArray(value) ? value[0] || null : value || null }
  catch (e) { if (/DOCUMENT_NOT_EXIST|DATABASE_DOCUMENT_NOT_EXIST|document.*(?:not exist|not found)|文档不存在/i.test(String(e.code || '') + ' ' + String(e.message || e.errMsg || ''))) return null; throw e }
}
function owner(actor) { if (!actor?.platformOwner || actor.public || actor.staff) fail('DATA_FORBIDDEN', '仅平台负责人可管理平台编号') }
function format(kind, region, sequence, rootNumber) {
  const max = rootNumber ? 99 : kind === 'players' ? 99999999 : 99999
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > max) fail('NUMBERING_EXHAUSTED', '当前编号号段已用尽，请联系平台处理')
  return rootNumber ? rootNumber + '-' + String(sequence).padStart(2, '0') : (kind === 'players' ? 'P' : '') + region.provinceCode + region.cityLetter + String(sequence).padStart(kind === 'players' ? 8 : 5, '0')
}
async function target(db, kind, id) {
  if (!['teams', 'players'].includes(kind) || !text(id) || id.length > 128) fail('NUMBERING_TARGET_INVALID', '请选择有效球队或球员')
  const row = await doc(db, kind, id)
  if (!active(row)) fail('NUMBERING_SOURCE_EXCLUDED', '档案不存在、已删除或属于测试来源')
  if (kind === 'players') {
    if (row.teamId && row.teamCode && row.teamId !== row.teamCode) fail('NUMBERING_TEAM_CONFLICT', '球队归属存在冲突，请先核验')
    const teamId = text(row.teamId || row.teamCode || row.pendingJoinTeamId)
    if (teamId && !active(await doc(db, 'teams', teamId))) fail('NUMBERING_SOURCE_EXCLUDED', '所属球队来源待核验或属于测试来源')
  }
  return row
}
async function assign(db, actor, event = {}, options = {}) {
  if (!options.trustedWrite) owner(actor)
  const { kind, id } = event
  if (kind === 'teams' && !options.trustedWrite && !['root', 'squad'].includes(event.teamMode)) fail('NUMBERING_TEAM_MODE_REQUIRED', '请选择主体球队或分队')
  return db.runTransaction(async tx => {
    const row = await target(tx, kind, id), current = view(row, kind)
    if (current.status === 'issued') {
      const record = await doc(tx, 'platform_number_registry', current.number)
      if (record?.targetId !== id || record?.kind !== kind) fail('NUMBERING_REGISTRY_CONFLICT', '编号账本与档案不一致，请核验')
      return { success: true, number: current.number, unchanged: true, version: VERSION }
    }
    if (current.status === 'conflict') fail('NUMBERING_CONFLICT', '已有编号不符合现行规则，请核验，不能自动覆盖')
    if (event.expectedRevision && event.expectedRevision !== current.revision) fail('NUMBERING_STALE', '档案已变化，请重新核对后发号')
    if (event.region && options.trustedWrite) fail('NUMBERING_REGION_INVALID', '自动发号不能覆盖档案地区')
    let region = event.region ? validateRegion(event.region) : inferRegion(row, kind)
    let rootNumber = '', rootId = '', counterId
    const selectedParent = kind === 'teams' ? text(event.parentTeamId || row.parentTeamId) : ''
    if (kind === 'teams' && event.teamMode === 'squad' && !selectedParent) fail('NUMBERING_PARENT_REQUIRED', '请选择主体球队')
    if (kind === 'teams' && event.teamMode === 'root' && row.parentTeamId) fail('NUMBERING_PARENT_INVALID', '该档案已关联主体，请先核验球队关系')
    if (row.parentTeamId && event.parentTeamId && row.parentTeamId !== event.parentTeamId) fail('NUMBERING_PARENT_INVALID', '主体关系已变化，请重新核验')
    if (selectedParent) {
      rootId = selectedParent
      if (rootId === id) fail('NUMBERING_PARENT_INVALID', '分队不能关联自身')
      const root = await target(tx, 'teams', rootId)
      if (root.parentTeamId || view(root, 'teams').status !== 'issued' || !/^\d{3}[A-Z]\d{5}$/.test(root.businessNumber)) fail('NUMBERING_PARENT_REQUIRED', '请先核验并发放主体球队编号')
      if (!text(root.orgId || root.organizationId) || text(root.orgId || root.organizationId) !== text(row.orgId || row.organizationId)) fail('NUMBERING_PARENT_INVALID', '主体和分队不属于同一机构，请先核验')
      const rootRegistry = await doc(tx, 'platform_number_registry', root.businessNumber)
      if (rootRegistry?.targetId !== rootId || rootRegistry?.kind !== 'teams') fail('NUMBERING_REGISTRY_CONFLICT', '主体球队编号账本不一致')
      rootNumber = root.businessNumber; region = root.numbering.region; counterId = 'squad-' + rootId
    } else counterId = kind === 'players' ? 'players-global' : region ? 'teams-' + region.provinceCode + region.cityLetter : ''
    if (!region) fail('NUMBERING_REGION_REQUIRED', kind === 'players' ? '籍贯地区待完善，不能使用球队所在地代替' : '球队登记地区待完善')
    const counter = await doc(tx, 'platform_number_sequences', counterId)
    if (counter && (counter.version !== VERSION || !Number.isSafeInteger(counter.lastSequence) || counter.lastSequence < 0)) fail('NUMBERING_COUNTER_INVALID', '编号计数器异常，请联系平台核验')
    const sequence = (counter?.lastSequence || 0) + 1, number = format(kind, region, sequence, rootNumber)
    if (await doc(tx, 'platform_number_registry', number)) fail('NUMBERING_COLLISION', '编号已占用，请联系平台核验计数器')
    const now = db.serverDate(), actorId = text(actor?.userId) || 'authenticated-creation'
    const metadata = { version: VERSION, kind, region: { ...region }, regionSource: event.region ? 'platform_confirmed' : region.source || 'root_team', sequence, counterId, rootTeamId: rootId, issuedAt: now, issuedBy: actorId }
    await tx.collection('platform_number_sequences').doc(counterId).set({ data: { version: VERSION, lastSequence: sequence, updatedAt: now } })
    await tx.collection('platform_number_registry').doc(number).set({ data: { version: VERSION, kind, targetId: id, number, counterId, sequence, rootTeamId: rootId, region: { ...region }, issuedAt: now, issuedBy: actorId } })
    await tx.collection(kind).doc(id).update({ data: { businessNumber: number, numbering: metadata, ...(rootId ? { parentTeamId: rootId } : {}), [kind === 'players' ? 'nativePlaceRegion' : 'registrationRegion']: { provinceCode: region.provinceCode, cityLetter: region.cityLetter, provinceName: region.provinceName, cityName: region.cityName } } })
    return { success: true, number, unchanged: false, version: VERSION }
  })
}
async function afterWrite(db, kind, id) {
  // Called only after the existing authorized writer has committed the target.
  try {
    const row = await target(db, kind, id)
    if (!row.businessNumber && !row.parentTeamId && !inferRegion(row, kind)) return { status: 'region_required' }
    return await assign(db, { userId: 'authenticated-creation' }, { kind, id }, { trustedWrite: true })
  } catch (error) {
    // Creation has succeeded. Do not misreport it as failed or cause duplicate retries.
    console.warn('[numbering]', error.code || 'NUMBERING_PENDING')
    return { status: 'pending', code: error.code || 'NUMBERING_PENDING' }
  }
}
function rules() { return { success: true, version: VERSION, regionVersion: regions.version, team: '省份3位+城市字母1位+城市内流水5位', squad: '主体球队编号+连字符+分队序号2位', player: 'P+籍贯省份3位+城市字母1位+全平台流水8位', immutable: true, playerSequence: 'global', regionMeaning: { teams: '首次登记地区', players: '首次登记籍贯' }, regions } }
module.exports = { VERSION, regions, guardWrite, inferRegion, validateRegion, validNumber, revision, view, format, assign, afterWrite, target, synthetic, rules, owner }
