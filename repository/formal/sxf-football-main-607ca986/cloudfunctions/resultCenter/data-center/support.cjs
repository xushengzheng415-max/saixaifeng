'use strict'
const { readAll, readByIds } = require('./reader.cjs')
const { digest } = require('./player-card-snapshot.cjs')
const id = value => String(value || '').trim()
const EMPTY_SUPPORT_VERSION = digest({ status:'complete', drops:0, supportIds:[], records:[] })

// Only a confirmed player support paired with its actual honey debit can
// contribute to a card. Legacy name-based targets stay outside this tally.
async function readPlayerSupportTotals(db, playerIds = null) {
  const ids = playerIds == null ? null : [...new Set(playerIds.map(id).filter(Boolean))]
  const supportRows = ids == null
    ? await readAll(db,'fan_supports',{ targetType:'player', status:'confirmed' })
    : await readByIds(db,'fan_supports','playerId',ids)
  const candidates = supportRows.filter(row => row.targetType === 'player' && row.status === 'confirmed' && id(row.playerId))
  const debitRows = await readByIds(db,'fan_points_ledger','supportId',candidates.map(row => row.supportId))
  const supportsById = new Map(), debitsById = new Map(), totals = new Map()
  for (const row of candidates) {
    const key = id(row.supportId)
    if (!supportsById.has(key)) supportsById.set(key,[])
    supportsById.get(key).push(row)
  }
  for (const row of debitRows) {
    const key = id(row.supportId)
    if (!debitsById.has(key)) debitsById.set(key,[])
    debitsById.get(key).push(row)
  }
  for (const row of candidates) {
    const playerId = id(row.playerId)
    if (!totals.has(playerId)) totals.set(playerId,{drops:0,status:'complete',supportIds:[]})
    const total = totals.get(playerId), key = id(row.supportId), debits = debitsById.get(key) || []
    const valid = Boolean(key) && supportsById.get(key)?.length === 1 && Number(row.cost) === 1 && debits.length === 1 &&
      Number(debits[0].delta) === -1 && debits[0].reason === 'fan-ranking-support' &&
      debits[0].targetType === 'player' && id(debits[0].playerId) === playerId &&
      id(debits[0].serviceAccountOpenId) === id(row.serviceAccountOpenId)
    if (!valid) { total.status = 'partial'; continue }
    total.drops++
    total.supportIds.push(key)
  }
  const wanted = ids || [...totals.keys()]
  for (const playerId of wanted) if (!totals.has(playerId)) totals.set(playerId,{drops:0,status:'complete',supportIds:[]})
  for (const [playerId,total] of totals) {
    total.dataVersion = digest({ status:total.status, drops:total.drops, supportIds:total.supportIds.sort(),
      records:supportRows.filter(row => id(row.playerId) === playerId).map(row => ({id:id(row._id),supportId:id(row.supportId),targetType:row.targetType,status:row.status,cost:row.cost})).sort((a,b) => a.id.localeCompare(b.id)) })
    delete total.supportIds
  }
  return totals
}

module.exports = { readPlayerSupportTotals, EMPTY_SUPPORT_VERSION }
