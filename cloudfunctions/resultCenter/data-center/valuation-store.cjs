'use strict'
const crypto = require('node:crypto')
const contract = require('./hub-contract.cjs')

const text = value => value == null ? '' : String(value).trim()
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32)
const first = result => Array.isArray(result?.data) ? result.data[0] : result?.data
const NOT_FOUND = /document.*(not exist|not found)|DOCUMENT_NOT_FOUND/i
const NO_COLLECTION = /DATABASE_COLLECTION_NOT_EXIST|collection.*(not exist|不存在)/i

/**
 * 指数快照留痕（docs/PRODUCT_RULES.md 2026-10-21 已确认）。
 * 同一球员、算法版本、统计口径、授权范围、生涯积分、数据版本与日期只保留一份，
 * 重复读取同一个档案不会重复写入；待评估或未完整核定的指数不落库。
 */
async function record(db, statistics, { playerId, now } = {}) {
  const id = text(playerId)
  if (!id) return { status: 'skipped', reason: 'PLAYER_REQUIRED' }
  const value = statistics?.valuation || {}
  if (value.coverage !== 'complete' || !Number.isFinite(value.total)) return { status: 'skipped', reason: 'VALUATION_INCOMPLETE' }
  const minor = Boolean(value.minor)
  const computedAt = text(value.computedAt) || new Date(Number.isFinite(now) ? now : Date.now()).toISOString()
  const scopeKey = text(value.scopeKey) || contract.scopeKey({ mode: 'official' })
  const authorizationKey = text(value.authorizationKey) || 'unknown'
  const careerPoints = Number.isFinite(statistics?.playerCard?.points) ? statistics.playerCard.points : null
  const dataVersion = text(statistics?.dataVersion) || null
  const documentId = digest([id, text(value.version), scopeKey, authorizationKey, careerPoints, dataVersion, computedAt.slice(0, 10)])
  const data = {
    playerId: id,
    version: text(value.version),
    scopeKey,
    authorizationKey,
    coverage: value.coverage,
    dataVersion,
    careerPoints,
    index: Number.isFinite(value.index) ? value.index : null,
    total: value.total,
    tier: minor ? '' : text(value.tier),
    tierValue: minor || !Number.isFinite(value.tierValue) ? null : value.tierValue,
    money: minor || !Number.isFinite(value.money) ? null : value.money,
    estimated: Array.isArray(value.estimated) ? value.estimated : [],
    factors: value.factors || {},
    minor,
    computedAt,
    createTime: new Date()
  }
  const collection = db.collection('player_valuations')
  try {
    const existing = first(await collection.doc(documentId).get())
    if (existing) return { status: 'exists', id: documentId, snapshot: existing }
  } catch (failure) {
    if (!NOT_FOUND.test(String(failure?.errMsg || failure?.message || ''))) throw failure
  }
  try {
    await collection.doc(documentId).set({ data })
  } catch (failure) {
    if (!NO_COLLECTION.test(String(failure?.errMsg || failure?.message || ''))) throw failure
    try { await db.createCollection('player_valuations') }
    catch (createFailure) {
      if (!/already exist|已存在|COLLECTION_EXIST/i.test(String(createFailure?.errMsg || createFailure?.message || ''))) throw createFailure
    }
    await collection.doc(documentId).set({ data })
  }
  return { status: 'recorded', id: documentId }
}

module.exports = { record, digest }
