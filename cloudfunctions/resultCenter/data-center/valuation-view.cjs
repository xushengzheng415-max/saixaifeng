'use strict'
/**
 * 身价展示投影（单一实现）。
 *
 * 转会市场、球员详情与发现页的“身价展示”共用同一函数，避免各端各写一套金额与段位口径。
 * 规则（docs/PRODUCT_RULES.md 2026-10-21 已确认）：
 * - 青少年只返回 minor 标记，不返回货币金额与段位；
 * - 指数待评估时返回 coverage=pending 与 null，不用 0 冒充；
 * - 只读展示，不在这里计算指数（计算统一在 valuation.cjs）。
 */
const { readOptionalAll } = require('./reader.cjs')
const id = value => String(value == null ? '' : value).trim()

function valuationView(latest) {
  if (!latest) return { coverage: 'pending', total: null, money: null, tier: '', minor: null, computedAt: null, historyStatus: 'not_recorded' }
  return {
    version: id(latest.version), computedAt: latest.computedAt || null,
    coverage: id(latest.coverage) || 'pending',
    total: latest.minor ? null : (Number.isFinite(latest.total) ? latest.total : null),
    money: latest.minor ? null : (Number.isFinite(latest.money) ? latest.money : null),
    tier: latest.minor ? '' : id(latest.tier),
    minor: latest.minor === true,
    historyStatus: 'recorded'
  }
}

async function latestValuation(db, playerId) {
  const read = await readOptionalAll(db, 'player_valuations', { playerId: id(playerId) }, { maxRows: 200 })
  let latest = null
  for (const row of read.rows) if (!latest || String(row.computedAt || '') > String(latest.computedAt || '')) latest = row
  return valuationView(latest)
}

// 批量取估值：逐个球员查询会把一页 20 条展示拖成 20 次读，且每次都带集合级预算。
async function latestValuations(db, playerIds) {
  const unique = [...new Set((playerIds || []).map(id).filter(Boolean))]
  const latest = new Map()
  for (let start = 0; start < unique.length; start += 20) {
    const chunk = unique.slice(start, start + 20)
    const read = await readOptionalAll(db, 'player_valuations', { playerId: db.command.in(chunk) }, { maxRows: 200 * chunk.length })
    for (const row of read.rows) {
      const key = id(row.playerId)
      const previous = latest.get(key)
      if (!previous || String(row.computedAt || '') > String(previous.computedAt || '')) latest.set(key, row)
    }
  }
  return latest
}

module.exports = { valuationView, latestValuation, latestValuations }
