'use strict'
/**
 * 赛事身价展示（发现页只做身价展示，用户 2026-10-26 确认）。
 *
 * 边界：
 * - 范围只取本赛事已审核名单（shared 的 roster.cjs），不拿球队资料库冒充参赛名单；
 * - 只读投影：只有球员公开资料、所属球队／组别与身价，不返回联系方式、证件、报价或审核字段；
 * - 身价统一取 player_valuations 最新快照（shared 的 valuation-view.cjs），页面不得自行计算；
 * - 青少年只返回“不公开”状态，不返回金额与段位；
 * - 待评估与未测算返回 pending，不用 0 冒充；
 * - 名单读取失败向上抛，由调用方显式报错，不静默当成空名单。
 */
const { readByIds } = require('./data-center/reader.cjs')
const { readRosters, rosterPlayerIds, rosterLineApproved } = require('./data-center/roster.cjs')
const { valuationView, latestValuations } = require('./data-center/valuation-view.cjs')

const PAGE_SIZE = 20
const id = value => String(value == null ? '' : value).trim()

function moneyTextOf(valuation) {
  if (!valuation || !Number.isFinite(valuation.money)) return ''
  return '¥' + Number(valuation.money).toLocaleString('zh-CN')
}

// 展示状态全部在服务端预计算，WXML 只做简单插值与简单取反。
function valuationStateOf(valuation) {
  if (!valuation || valuation.minor === true) return 'hidden'
  if (valuation.coverage !== 'complete' || !Number.isFinite(valuation.money)) return 'pending'
  return 'ready'
}

function sortKey(row) {
  return [id(row.name), id(row.playerId)].join('\u0000')
}

async function load(db, input = {}) {
  const tournamentId = id(input.tournamentId)
  if (!tournamentId) throw new Error('缺少赛事信息')
  const divisionId = id(input.divisionId)
  const teamId = id(input.teamId)
  const keyword = id(input.keyword).slice(0, 40).toLowerCase()
  const requestedPage = Math.max(1, Math.floor(Number(input.page) || 1))
  const requestedPageSize = Math.floor(Number(input.pageSize) || PAGE_SIZE)
  const pageSize = Math.min(PAGE_SIZE, Math.max(1, requestedPageSize))

  const roster = await readRosters(db, tournamentId)
  const members = new Map()
  for (const row of roster.rows) {
    if (!rosterLineApproved(row)) continue
    const rowTeamId = id(row.teamId)
    const rowDivisionId = id(row.divisionId || row.division) || 'default'
    for (const playerId of rosterPlayerIds(row)) {
      if (!members.has(playerId)) members.set(playerId, { teamId: rowTeamId, divisionId: rowDivisionId })
    }
  }
  let entries = [...members.entries()].map(([playerId, meta]) => ({ playerId, teamId: meta.teamId, divisionId: meta.divisionId }))
  if (divisionId) entries = entries.filter(entry => entry.divisionId === divisionId)
  if (teamId) entries = entries.filter(entry => entry.teamId === teamId)
  const empty = {
    success: true, tournamentId, items: [], total: 0, page: 1, pageCount: 1, pageSize,
    rosterState: roster.status, state: entries.length ? 'ready' : 'empty',
    stateText: roster.status === 'ready' ? '本赛事暂无名单球员' : '本赛事名单未登记'
  }
  if (!entries.length) return empty

  const players = await readByIds(db, 'players', '_id', entries.map(entry => entry.playerId), { maxRows: 2000 })
  const playerById = new Map(players.map(row => [id(row._id), row]))
  const { synthetic } = await import('./data-center/statistics.mjs')
  let rows = entries.filter(entry => {
    const player = playerById.get(entry.playerId)
    if (!player) return false
    if (['deleted', 'archived'].includes(id(player.status))) return false
    return !synthetic(player)
  }).map(entry => {
    const player = playerById.get(entry.playerId)
    return {
      playerId: entry.playerId,
      name: id(player.name),
      playerCode: id(player.businessNumber || player.playerId || player.playerCode),
      teamId: entry.teamId || id(player.teamId || player.teamCode),
      divisionId: entry.divisionId
    }
  })
  if (keyword) {
    rows = rows.filter(row => [row.name, row.playerCode].some(value => value.toLowerCase().includes(keyword)))
  }
  rows = rows.sort((left, right) => sortKey(left).localeCompare(sortKey(right), 'zh-CN'))
  const total = rows.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(requestedPage, pageCount)
  const start = (page - 1) * pageSize
  const pageRows = rows.slice(start, start + pageSize)

  const teamIds = [...new Set(pageRows.map(row => id(row.teamId)).filter(Boolean))]
  const divisionIds = [...new Set(pageRows.map(row => id(row.divisionId)).filter(Boolean).filter(value => value !== 'default'))]
  // 球队与组别只按本页稳定 ID 读取，不整集合扫描。
  const teams = teamIds.length ? await readByIds(db, 'teams', '_id', teamIds, { maxRows: 200 }) : []
  const divisions = divisionIds.length ? await readByIds(db, 'divisions', '_id', divisionIds, { maxRows: 200 }) : []
  const teamNameById = new Map(teams.map(row => [id(row._id), id(row.name || row.teamName)]))
  const divisionNameById = new Map(divisions.map(row => [id(row._id), id(row.name)]))
  const valuations = await latestValuations(db, pageRows.map(row => row.playerId))

  const items = pageRows.map(row => {
    const valuation = valuationView(valuations.get(row.playerId))
    const state = valuationStateOf(valuation)
    return {
      playerId: row.playerId,
      name: row.name || '未命名球员',
      playerCode: row.playerCode,
      teamId: row.teamId,
      teamName: teamNameById.get(row.teamId) || '',
      divisionId: row.divisionId,
      divisionName: divisionNameById.get(row.divisionId) || '',
      valuationState: state,
      // 状态文案由服务端给出，页面只负责展示，不在端上重新判断青少年或待评估。
      valueText: state === 'ready' ? moneyTextOf(valuation) : (state === 'hidden' ? '不公开' : '待评估'),
      tierText: state === 'ready' ? id(valuation.tier) : '',
      computedAt: valuation.computedAt || null,
      hasValue: state === 'ready',
      isHidden: state === 'hidden'
    }
  })
  return {
    success: true, tournamentId, items, total, page, pageCount, pageSize,
    rosterState: roster.status, state: 'ready', stateText: ''
  }
}

module.exports = { load, PAGE_SIZE, valuationStateOf, moneyTextOf }
