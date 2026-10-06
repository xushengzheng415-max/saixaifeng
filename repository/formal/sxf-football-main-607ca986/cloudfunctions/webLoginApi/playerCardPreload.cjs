const crypto = require('node:crypto')
const COLLECTIONS = { team: 'teams', tournament: 'tournaments', player: 'players' }
const LABELS = { platform: '全平台', team: '球队', tournament: '赛事', player: '球员' }
function normalizePreload(value) {
  if (value == null) return { type: 'platform', targetId: '', targetName: '' }
  if (typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(LABELS, value.type)) {
    throw Object.assign(new Error('请选择预装分类'), { code: 'CARD_PRELOAD_INVALID' })
  }
  if (value.type === 'platform') return { type: 'platform', targetId: '', targetName: '' }
  const targetId = String(value.targetId || '').trim()
  if (!targetId || targetId.length > 128 || /[\s/\\]/.test(targetId)) {
    throw Object.assign(new Error(`请选择${LABELS[value.type]}`), { code: 'CARD_PRELOAD_TARGET_REQUIRED' })
  }
  return { type: value.type, targetId, targetName: String(value.targetName || '').slice(0, 100) }
}
function stateId(tier, value, templateId) {
  const scope = normalizePreload(value)
  if (templateId) return `${tier}_preload_${crypto.createHash('sha256').update(String(templateId)).digest('hex').slice(0, 32)}`
  return scope.type === 'platform' ? tier : `${tier}_${scope.type}_${crypto.createHash('sha256').update(scope.targetId).digest('hex').slice(0, 32)}`
}
async function readAll(db, collection, where) {
  const rows = []; let after = ''
  for (;;) {
    const page = (await db.collection(collection).where({ ...where, ...(after ? { _id:db.command.gt(after) } : {}) }).orderBy('_id','asc').limit(100).get()).data || []
    rows.push(...page)
    if (rows.length > 10000) throw new Error('球员卡关联记录过多，请联系平台处理')
    if (page.length < 100) return rows
    after = String(page[page.length-1]._id)
  }
}
async function tournamentPlayerIds(db, tournamentId) {
  const latest = new Map(), ids = new Set()
  ids.evidenceByPlayer = new Map()
  for (const row of await readAll(db, 'roster_snapshots', { tournamentId })) {
    if (!row.teamId || !['approved','locked'].includes(row.status)) continue
    const old = latest.get(row.teamId)
    if (!old || Number(row.version || 0) > Number(old.version || 0)) latest.set(row.teamId,row)
  }
  for (const row of latest.values()) if (['approved','locked'].includes(row.status)) {
    const players = new Set((row.playerIds || []).filter(id=>typeof id === 'string'))
    for (const item of row.players || []) if (item && (item.playerId || item.id || item._id)) players.add(String(item.playerId || item.id || item._id))
    for (const id of players) {
      ids.add(id)
      const evidence = ids.evidenceByPlayer.get(id) || []
      evidence.push({snapshotId:String(row._id),version:Number(row.version || 0),tournamentId:String(tournamentId)})
      ids.evidenceByPlayer.set(id,evidence)
    }
  }
  return ids
}
async function playersForScope(db, value) {
  const scope=normalizePreload(value)
  let rows=[]
  if(scope.type==='player') {
    const result=await db.collection('players').doc(scope.targetId).get()
    const player=Array.isArray(result.data)?result.data[0]:result.data
    if(player)rows.push(player)
  } else if(scope.type==='team') rows=await readAll(db,'players',{teamId:scope.targetId})
  else if(scope.type==='platform') rows=await readAll(db,'players',{})
  else {
    const ids=await tournamentPlayerIds(db,scope.targetId)
    for(const id of ids) {
      const result=await db.collection('players').doc(id).get()
      const player=Array.isArray(result.data)?result.data[0]:result.data
      if(player)rows.push(player)
    }
    const unique=[...new Map(rows.filter(row=>row.deleted!==true&&row.isDeleted!==true&&row.status!=='deleted').map(row=>[String(row._id),row])).values()]
    return {scope,players:unique,evidenceByPlayer:ids.evidenceByPlayer}
  }
  rows=rows.filter(row=>row.deleted!==true&&row.isDeleted!==true&&row.status!=='deleted')
  return {scope,players:[...new Map(rows.map(row=>[String(row._id),row])).values()],evidenceByPlayer:new Map()}
}
function nameOf(type, row) { return String(row.name || row[`${type}Name`] || row.title || row._id) }
async function validatePreload(db, value, document) {
  const scope = normalizePreload(value)
  if (scope.type === 'platform') return scope
  const row = await document(db, COLLECTIONS[scope.type], scope.targetId)
  if (!row || row.deleted === true || row.isDeleted === true || row.status === 'deleted') {
    throw Object.assign(new Error(`${LABELS[scope.type]}不存在，请重新选择`), { code: 'CARD_PRELOAD_TARGET_NOT_FOUND' })
  }
  return { ...scope, targetName: nameOf(scope.type, row) }
}
async function targets(db, event) {
  const type = String(event.type || '')
  if (!Object.hasOwn(COLLECTIONS, type)) throw new Error('请选择球队、赛事或球员')
  const keyword = String(event.keyword || '').trim().slice(0, 80)
  const cursor = String(event.cursor || '').trim()
  if (cursor.length > 128 || /[\s/\\]/.test(cursor)) throw new Error('对象列表游标无效')
  let filter = cursor ? { _id: db.command.gt(cursor) } : {}
  if (keyword) {
    const regexp = db.RegExp({ regexp: keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), options: 'i' })
    const fields = type === 'player' ? ['name'] : ['name', `${type}Name`]
    const names = db.command.or(fields.map(key => ({ [key]: regexp })))
    filter = cursor ? db.command.and([filter, names]) : names
  }
  const rows = (await db.collection(COLLECTIONS[type]).where(filter).orderBy('_id', 'asc').limit(25).get()).data || []
  return { success: true, targets: rows.filter(row => row.deleted !== true && row.isDeleted !== true && row.status !== 'deleted')
    .map(row => ({ id: String(row._id), name: nameOf(type, row), teamId: type === 'player' ? String(row.teamId || '') : '' })),
    nextCursor: rows.length === 25 ? String(rows[rows.length - 1]._id) : '' }
}
module.exports = { normalizePreload, validatePreload, stateId, targets, readAll, tournamentPlayerIds, playersForScope, COLLECTIONS }
