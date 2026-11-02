'use strict'
// 赛事处罚与平台黑名单。
// 数据边界：主办方只能读写的本赛事处罚；跨赛事黑名单由平台负责人审核后生效。
const staffPolicy = require('./staffPolicy.cjs')
const { readAll, readByIds, missingCollection } = require('./shared/reader.cjs')
const { error } = require('./shared/service.cjs')

const COLLECTION = 'tournament_penalties'
// 赛事赛果页已有的「追加纪律处罚」写入该集合，平台侧按同一套视图读取，避免同一处罚出现两套口径。
const LEGACY_COLLECTION = 'disciplinary_actions'
const SERIOUS_TYPES = ['abuse_referee', 'fight', 'serious_misconduct']
const BAN_DURATIONS = ['matches', 'months3', 'year1', 'permanent']
const id = value => value == null ? '' : String(value).trim()
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0
const first = result => Array.isArray(result.data) ? result.data[0] : result.data

// CloudBase 对 where + orderBy 组合查询要求索引，新集合尚无索引时会直接读失败。
// 处罚记录量级很小，统一整表读取后在内存过滤，既避开索引依赖，也能容忍集合尚未创建。
async function readRows(db, collection, maxRows = 3000) {
  try { return await readAll(db, collection, {}, { maxRows }) } catch (failure) {
    if (missingCollection(failure)) return []
    throw failure
  }
}

async function getDoc(db, collection, docId) {
  if (!docId) return null
  try { return first(await db.collection(collection).doc(docId).get()) } catch (failure) { return null }
}

async function ensureCollection(db) {
  try { await db.createCollection(COLLECTION) } catch (failure) {
    if (!/exist|already|duplicate|已存在/i.test(String(failure && (failure.message || failure.errMsg) || ''))) throw failure
  }
}

function banUntilOf(duration) {
  const start = new Date()
  if (duration === 'months3') { const date = new Date(start); date.setMonth(date.getMonth() + 3); return date }
  if (duration === 'year1') { const date = new Date(start); date.setMonth(date.getMonth() + 12); return date }
  return null
}

function view(row) {
  return {
    id: id(row._id || row.id),
    collection: COLLECTION,
    orgId: id(row.orgId),
    tournamentId: id(row.tournamentId),
    tournamentName: id(row.tournamentName),
    divisionId: id(row.divisionId),
    matchId: id(row.matchId),
    matchNo: id(row.matchNo),
    kind: id(row.kind),
    subjectType: id(row.subjectType) || 'team',
    teamId: id(row.teamId),
    teamName: id(row.teamName),
    playerId: id(row.playerId),
    playerName: id(row.playerName),
    personName: id(row.personName),
    types: Array.isArray(row.types) ? row.types.map(id).filter(Boolean) : [],
    severity: id(row.severity) || 'normal',
    scope: id(row.scope) || 'tournament',
    status: id(row.status) || 'effective',
    platformReview: id(row.platformReview) || 'not_required',
    pointsDeduction: num(row.pointsDeduction),
    suspensionMatches: num(row.suspensionMatches),
    fineAmount: num(row.fineAmount),
    banDuration: id(row.banDuration),
    banUntil: row.banUntil || null,
    permanent: row.permanent === true,
    reason: id(row.reason),
    evidenceFileIds: Array.isArray(row.evidenceFileIds) ? row.evidenceFileIds.map(id).filter(Boolean) : [],
    source: id(row.source),
    createdByName: id(row.createdByName),
    createdAt: row.createdAt || null,
    reviewedByName: id(row.reviewedByName),
    reviewedAt: row.reviewedAt || null,
    reviewNote: id(row.reviewNote),
    revokedAt: row.revokedAt || null,
    revokeReason: id(row.revokeReason)
  }
}

// 赛事赛果页录入的追加纪律处罚（无证据、录入即生效），按统一视图只读并入平台列表，
// 未经过平台审核的标记为 pending，平台审核后同样可升级为跨赛事黑名单。
function legacyView(row) {
  return {
    ...view(row),
    collection: LEGACY_COLLECTION,
    kind: 'discipline',
    subjectType: id(row.subjectType) || 'player',
    severity: 'serious',
    scope: id(row.scope) || 'tournament',
    status: id(row.status) || 'effective',
    platformReview: id(row.platformReview) || 'pending',
    evidenceFileIds: Array.isArray(row.evidenceFileIds) ? row.evidenceFileIds.map(id).filter(Boolean) : [],
    source: 'resultCenter'
  }
}

async function expireDue(db) {
  const rows = (await readRows(db, COLLECTION, 500)).filter(row => id(row.status) === 'effective' && id(row.scope) === 'platform' && row.banUntil)
  let expired = 0
  for (const row of rows) {
    const until = new Date(row.banUntil && row.banUntil.$date || row.banUntil)
    if (!Number.isFinite(until.getTime()) || until.getTime() > Date.now()) continue
    await db.collection(COLLECTION).doc(id(row._id)).update({ data: { status: 'expired', updateTime: db.serverDate() } })
    expired += 1
  }
  return expired
}

async function requireTournamentScope(db, actor, tournamentId) {
  if (!tournamentId) throw error('DATA_SCOPE_INVALID', '缺少赛事信息')
  const tournament = await getDoc(db, 'tournaments', tournamentId)
  if (!tournament) throw error('DATA_FORBIDDEN', '赛事不存在或无权访问')
  const orgIds = [...new Set(['orgId', 'organizationId'].map(field => id(tournament[field])).filter(Boolean))]
  if (orgIds.length === 1 && orgIds[0] === id(actor.orgId)) return tournament
  if (actor.tournamentIds && actor.tournamentIds.includes(tournamentId)) return tournament
  throw error('DATA_FORBIDDEN', '赛事不属于当前机构')
}

async function fillTournamentNames(db, items) {
  const ids = [...new Set(items.filter(item => !item.tournamentName && item.tournamentId).map(item => item.tournamentId))]
  if (!ids.length) return
  try {
    const rows = await readByIds(db, 'tournaments', '_id', ids.slice(0, 100))
    const names = new Map(rows.map(row => [id(row._id), id(row.name)]))
    items.forEach(item => { if (!item.tournamentName) item.tournamentName = names.get(item.tournamentId) || '' })
  } catch (failure) { /* 名称只是辅助展示，读取失败不影响处罚记录本身 */ }
}

async function listPenalties(db, actor, event) {
  await expireDue(db)
  const tournamentId = id(event.tournamentId)
  const status = id(event.status)
  const platformReview = id(event.platformReview)
  if (tournamentId) await requireTournamentScope(db, actor, tournamentId)
  else if (!actor.platformOwner) throw error('DATA_SCOPE_INVALID', '请指定赛事后查看处罚记录')
  let items = [
    ...(await readRows(db, COLLECTION)).map(view),
    ...(await readRows(db, LEGACY_COLLECTION)).map(legacyView)
  ]
  if (tournamentId) items = items.filter(item => item.tournamentId === tournamentId)
  if (!actor.platformOwner) {
    const tournamentIds = new Set(actor.tournamentIds || [])
    items = items.filter(item => id(item.orgId) === id(actor.orgId) || tournamentIds.has(item.tournamentId))
  }
  // 页签计数取全部记录，不随当前筛选变化。
  const totals = {
    effective: items.filter(item => item.status === 'effective').length,
    pendingReview: items.filter(item => item.platformReview === 'pending' && item.status === 'effective').length,
    platformScope: items.filter(item => item.scope === 'platform' && item.status === 'effective').length,
    forfeits: items.filter(item => item.kind === 'forfeit').length
  }
  if (status) items = items.filter(item => item.status === status)
  if (platformReview) items = items.filter(item => item.platformReview === platformReview)
  await fillTournamentNames(db, items)
  items.sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0))
  return {
    success: true,
    items,
    totals,
    summary: {
      effective: items.filter(item => item.status === 'effective').length,
      pendingReview: items.filter(item => item.platformReview === 'pending').length,
      platformScope: items.filter(item => item.scope === 'platform' && item.status === 'effective').length,
      forfeits: items.filter(item => item.kind === 'forfeit').length
    }
  }
}

async function createPenalty(db, actor, event) {
  const tournamentId = id(event.tournamentId)
  if (!tournamentId) throw error('DATA_INVALID', '请填写赛事编号')
  // 平台负责人可直接登记跨赛事处罚并立即生效；主办方只能录本赛事处罚并等待平台审核。
  const platformScope = Boolean(actor.platformOwner)
  let tournament
  if (platformScope) {
    tournament = await getDoc(db, 'tournaments', tournamentId)
    if (!tournament) throw error('DATA_INVALID', '赛事不存在，请核对赛事编号')
  } else {
    tournament = await requireTournamentScope(db, actor, tournamentId)
    if (actor.staff) {
      const allowed = await staffPolicy.hasRight(db, actor.userId, actor.orgId, tournamentId, 'event.results')
        || await staffPolicy.hasRight(db, actor.userId, actor.orgId, tournamentId, 'result.supplement')
      if (!allowed) throw error('DATA_FORBIDDEN', '当前赛事没有处罚录入权限')
    }
  }
  const types = [...new Set((Array.isArray(event.types) ? event.types : []).map(id).filter(Boolean))]
  if (!types.length || types.some(type => !SERIOUS_TYPES.includes(type))) throw error('DATA_INVALID', '请选择重点纪律类型')
  const subjectType = id(event.subjectType) || 'team'
  if (!['team', 'player', 'staff'].includes(subjectType)) throw error('DATA_INVALID', '处罚对象类型不支持')
  const teamId = id(event.teamId)
  const teamName = id(event.teamName)
  const playerName = id(event.playerName)
  const personName = id(event.personName)
  if (subjectType === 'team' && !teamId && !(platformScope && teamName)) throw error('DATA_INVALID', '请填写处罚球队')
  if (subjectType === 'player' && !playerName) throw error('DATA_INVALID', '请填写处罚球员姓名')
  if (subjectType === 'staff' && !personName) throw error('DATA_INVALID', '请填写受处罚人员姓名')
  const reason = id(event.reason)
  if (reason.length < 4 || reason.length > 300) throw error('DATA_INVALID', '处罚原因须为 4 至 300 个字符')
  const evidenceFileIds = (Array.isArray(event.evidenceFileIds) ? event.evidenceFileIds : []).map(id).filter(Boolean)
  if (evidenceFileIds.length > 3) throw error('DATA_INVALID', '处罚证据最多 3 份')
  if (!platformScope && !evidenceFileIds.length) throw error('DATA_INVALID', '请上传 1 至 3 份处罚证据')
  const matchId = id(event.matchId)
  const match = matchId ? await getDoc(db, 'matches', matchId) : null
  if (matchId && (!match || id(match.tournamentId) !== tournamentId)) throw error('DATA_INVALID', '比赛不属于当前赛事')
  const banDuration = platformScope ? (id(event.banDuration) || 'matches') : ''
  if (platformScope && !BAN_DURATIONS.includes(banDuration)) throw error('DATA_INVALID', '黑名单期限不支持')
  const deduction = Number(event.pointsDeduction)
  const pointsDeduction = platformScope && Number.isInteger(deduction) && deduction >= 0 && deduction <= 15 ? deduction : 0
  if (pointsDeduction > 0 && !teamId) throw error('DATA_INVALID', '扣联赛积分须填写球队编号')
  const suspension = Number(event.suspensionMatches)
  const suspensionMatches = platformScope && Number.isInteger(suspension) && suspension >= 0 ? suspension : 0
  const reviewNote = id(event.reviewNote).slice(0, 300)
  await ensureCollection(db)
  const data = {
    orgId: id(actor.orgId) || id(tournament.orgId),
    tournamentId,
    tournamentName: id(tournament.name),
    divisionId: id(match && (match.divisionId || match.division)),
    matchId,
    matchNo: id(match && (match.matchNo || match.matchSequence || match.sequence)),
    kind: 'discipline',
    subjectType,
    teamId,
    teamName,
    playerId: id(event.playerId),
    playerName,
    personName,
    types,
    severity: 'serious',
    scope: platformScope ? 'platform' : 'tournament',
    status: 'effective',
    platformReview: platformScope ? 'approved' : 'pending',
    pointsDeduction,
    suspensionMatches,
    banDuration,
    banUntil: platformScope ? banUntilOf(banDuration) : null,
    permanent: platformScope && banDuration === 'permanent',
    reason,
    evidenceFileIds,
    source: platformScope ? 'platform' : 'organizer',
    createdBy: id(actor.userId),
    createdByName: id(event.createdByName),
    createdAt: db.serverDate(),
    updateTime: db.serverDate()
  }
  if (platformScope) {
    Object.assign(data, { reviewedBy: id(actor.userId), reviewedByName: id(event.createdByName), reviewedAt: db.serverDate(), reviewNote })
  }
  const created = await db.collection(COLLECTION).add({ data })
  await db.collection('registration_audit_logs').add({ data: {
    sport: 'football', action: platformScope ? 'tournament_penalty_platform_recorded' : 'tournament_penalty_created', tournamentId, divisionId: data.divisionId, matchId,
    actorUserId: id(actor.userId), actorOrgId: id(actor.orgId), result: 'success',
    detail: { penaltyId: id(created._id), kind: data.kind, types, subjectType, teamId, reason, evidenceCount: evidenceFileIds.length, scope: data.scope, banDuration },
    createTime: db.serverDate()
  } }).catch(() => {})
  return { success: true, id: id(created._id), message: platformScope ? '平台处罚已登记并立即生效' : '重点处罚已登记，等待平台审核是否列入跨赛事黑名单' }
}

async function reviewPenalty(db, actor, event) {
  if (!actor.platformOwner) throw error('DATA_FORBIDDEN', '仅平台负责人可审核跨赛事黑名单')
  const collection = id(event.collection) === LEGACY_COLLECTION ? LEGACY_COLLECTION : COLLECTION
  const penaltyId = id(event.penaltyId || event.id)
  if (!penaltyId) throw error('DATA_INVALID', '缺少处罚记录编号')
  const penalty = await getDoc(db, collection, penaltyId)
  if (!penalty) throw error('DATA_INVALID', '处罚记录不存在')
  if ((id(penalty.platformReview) || 'pending') !== 'pending') throw error('DATA_INVALID', '该处罚不在待审核状态')
  const decision = id(event.decision)
  const reviewNote = id(event.reviewNote).slice(0, 300)
  if (!['approve', 'reject'].includes(decision)) throw error('DATA_INVALID', '请选择审核结论')
  if (decision === 'reject' && reviewNote.length < 2) throw error('DATA_INVALID', '驳回须填写原因')
  const data = { platformReview: decision === 'approve' ? 'approved' : 'rejected', reviewedBy: id(actor.userId), reviewedByName: id(event.reviewedByName), reviewedAt: db.serverDate(), reviewNote, updateTime: db.serverDate() }
  if (decision === 'approve') {
    const banDuration = id(event.banDuration) || 'matches'
    if (!BAN_DURATIONS.includes(banDuration)) throw error('DATA_INVALID', '黑名单期限不支持')
    const banUntil = banUntilOf(banDuration)
    data.scope = 'platform'
    data.banDuration = banDuration
    data.banUntil = banUntil
    data.permanent = banDuration === 'permanent'
    data.effectiveAt = db.serverDate()
  }
  await db.collection(collection).doc(penaltyId).update({ data })
  await db.collection('registration_audit_logs').add({ data: {
    sport: 'football', action: decision === 'approve' ? 'tournament_penalty_approved' : 'tournament_penalty_rejected',
    tournamentId: id(penalty.tournamentId), divisionId: id(penalty.divisionId), matchId: id(penalty.matchId),
    actorUserId: id(actor.userId), actorOrgId: id(penalty.orgId), result: 'success',
    detail: { penaltyId, collection, decision, banDuration: data.banDuration || '', reviewNote },
    createTime: db.serverDate()
  } }).catch(() => {})
  return { success: true, message: decision === 'approve' ? '已列入全平台黑名单' : '已驳回跨赛事黑名单申请' }
}

async function revokePenalty(db, actor, event) {
  const collection = id(event.collection) === LEGACY_COLLECTION ? LEGACY_COLLECTION : COLLECTION
  const penaltyId = id(event.penaltyId || event.id)
  if (!penaltyId) throw error('DATA_INVALID', '缺少处罚记录编号')
  const reason = id(event.reason)
  if (reason.length < 2 || reason.length > 300) throw error('DATA_INVALID', '撤销原因须为 2 至 300 个字符')
  const penalty = await getDoc(db, collection, penaltyId)
  if (!penalty) throw error('DATA_INVALID', '处罚记录不存在')
  if (!actor.platformOwner) {
    if (id(penalty.orgId) !== id(actor.orgId)) throw error('DATA_FORBIDDEN', '无权撤销其他机构的处罚')
    if (id(penalty.scope) === 'platform') throw error('DATA_FORBIDDEN', '跨赛事黑名单须由平台撤销')
    await requireTournamentScope(db, actor, id(penalty.tournamentId))
  }
  if (id(penalty.status) !== 'effective') throw error('DATA_INVALID', '该处罚已失效，无需重复操作')
  await db.collection(collection).doc(penaltyId).update({ data: {
    status: 'revoked', revokedBy: id(actor.userId), revokedAt: db.serverDate(), revokeReason: reason, updateTime: db.serverDate()
  } })
  await db.collection('registration_audit_logs').add({ data: {
    sport: 'football', action: 'tournament_penalty_revoked', tournamentId: id(penalty.tournamentId), divisionId: id(penalty.divisionId), matchId: id(penalty.matchId),
    actorUserId: id(actor.userId), actorOrgId: id(penalty.orgId), result: 'success',
    detail: { penaltyId, collection, reason }, createTime: db.serverDate()
  } }).catch(() => {})
  return { success: true, message: '处罚已撤销并留痕' }
}

async function blacklist(db, actor) {
  await expireDue(db)
  let items = [
    ...(await readRows(db, COLLECTION)).map(view),
    ...(await readRows(db, LEGACY_COLLECTION)).map(legacyView)
  ].filter(item => item.scope === 'platform' && item.status === 'effective')
  if (!actor.platformOwner) {
    const tournamentIds = new Set(actor.tournamentIds || [])
    const teamIds = new Set(actor.teamIds || [])
    items = items.filter(item => tournamentIds.has(item.tournamentId) || teamIds.has(item.teamId))
  }
  await fillTournamentNames(db, items)
  items.sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0))
  return { success: true, items }
}

module.exports = { listPenalties, createPenalty, reviewPenalty, revokePenalty, blacklist, expireDue, view, COLLECTION, LEGACY_COLLECTION, SERIOUS_TYPES }
