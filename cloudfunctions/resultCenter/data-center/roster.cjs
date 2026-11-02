'use strict'
/**
 * 赛事名单读取（单一实现）。
 *
 * “赛事内”指该球员已被列入本赛事的球队名单：名单快照 roster_snapshots 或旧名册 rosters。
 * 转会自由签约判定与发现页身价展示都只认这里，不读球队资料库冒充参赛名单。
 * 读取必须带赛事范围，缺集合时由 readOptionalAll 降级为 not_recorded。
 */
const { readOptionalAll } = require('./reader.cjs')
const id = value => String(value == null ? '' : value).trim()

const ROSTER_COLLECTIONS = ['roster_snapshots', 'rosters']
const ROSTER_PLAYER_FIELDS = ['playerIds', 'players']

function rosterPlayerIds(row) {
  const values = []
  for (const field of ROSTER_PLAYER_FIELDS) {
    const list = row ? row[field] : null
    if (!Array.isArray(list)) continue
    for (const item of list) {
      if (item && typeof item === 'object') values.push(id(item.playerId || item.id || item._id))
      else values.push(id(item))
    }
  }
  return values.filter(Boolean)
}

// 返回 { status, rows }：status 为 ready / not_recorded / partial，供调用方显式标注数据状态。
async function readRosters(db, tournamentId, { maxRows = 5000 } = {}) {
  const value = id(tournamentId)
  if (!value) return { status: 'not_recorded', rows: [] }
  const rows = []
  const states = []
  for (const collection of ROSTER_COLLECTIONS) {
    const read = await readOptionalAll(db, collection, { tournamentId: value }, { maxRows })
    states.push(read.status)
    rows.push(...read.rows)
  }
  const status = states.every(state => state === 'ready') ? 'ready'
    : states.every(state => state === 'not_recorded') ? 'not_recorded' : 'partial'
  return { status, rows }
}

function rosterLineAlive(row) {
  return id(row && row.status) !== 'deleted' && row && row.isDeleted !== true
}

// 已审核名单行：名单快照需 status=approved；旧名册没有状态字段时按有效处理。
function rosterLineApproved(row) {
  if (!rosterLineAlive(row)) return false
  const status = id(row.status)
  return !status || status === 'approved'
}

async function inEventRoster(db, tournamentId, playerId) {
  const value = id(tournamentId), player = id(playerId)
  if (!value || !player) return false
  const read = await readRosters(db, value)
  return read.rows.some(row => rosterLineAlive(row) && rosterPlayerIds(row).includes(player))
}

module.exports = { ROSTER_COLLECTIONS, ROSTER_PLAYER_FIELDS, rosterPlayerIds, readRosters, rosterLineApproved, inEventRoster }
