'use strict'
/**
 * 赛事转会中心底层验证（方案 V1.1）。
 *
 * 覆盖两段：
 * 1. transfer/rules.cjs 的纯规则：金额、条款、窗口、轮次、冷却、审核版本、合同期限、租借到期。
 * 2. transfer/index.cjs + transfer/service.cjs 的路由与事务流程：内存数据库桩模拟 CloudBase，
 *    验证权限边界、幂等、三轮破裂冷却、审核交接、自由签约、续约、到期任务和赛事子账号限制。
 *
 * 未确认的 Q01—Q09 只验证“显式拦截”，不把建议当成规则。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const rules = require('../cloudfunctions/dataCenter/transfer/rules.cjs')
const transferCenter = require('../cloudfunctions/dataCenter/transfer/index.cjs')
const staffPolicy = require('../cloudfunctions/dataCenter/staffPolicy.cjs')
const { relayRights } = require('../cloudfunctions/webLoginApi/staffRelayRights.cjs')
const staffAccessPolicy = require('../cloudfunctions/tournamentStaffAccess/policy.cjs')

const {
  hash, amountFen, normalizeTerms, normalizeWindow, windowState, assertWindowOpen,
  buyerOfferPatch, sellerResponsePatch, withdrawPatch, reviewDecisionPatch,
  contractTerm, contractState, effectiveTeam, loanExpiryDecision, assertRenewalDates,
  playerResponseIdentity, paginate, POLICY, PENDING_RULES
} = rules

// ---------------- 内存数据库桩（与 tools/test-data-center.mjs 同一形态） ----------------

function mockDatabase(initial, cap = 100) {
  let store = structuredClone(initial)
  const queries = []
  const command = {
    in: values => ({ operator: 'in', values }),
    gt: value => ({ operator: 'gt', value }),
    and: clauses => ({ operator: 'and', clauses }),
    or: clauses => ({ operator: 'or', clauses })
  }
  function matches(row, where) {
    if (where.operator === 'and') return where.clauses.every(clause => matches(row, clause))
    if (where.operator === 'or') return where.clauses.some(clause => matches(row, clause))
    return Object.entries(where).every(([key, value]) => value?.operator === 'in' ? value.values.includes(row[key]) : value?.operator === 'gt' ? row[key] > value.value : row[key] === value)
  }
  const db = {
    command,
    data: () => store,
    // 记录查询条件，用于校验“读取必须带范围”，防止悄悄退回整集合扫描。
    queries,
    clearQueries: () => { queries.length = 0 },
    fail: '',
    createCollection: async name => { if (store[name]) throw new Error('already exists'); store[name] = [] },
    collection(name) {
      let where = {}, limit = cap, projection = null
      const query = {
        field(value) { projection = value; return query },
        where(value) { where = value; return query },
        orderBy() { return query },
        limit(value) { limit = Math.min(value, cap); return query },
        async get() {
          if (db.fail === name) throw new Error('database unavailable')
          queries.push({ collection: name, where })
          return { data: (store[name] || []).filter(row => matches(row, where)).sort((a, b) => a._id < b._id ? -1 : 1).slice(0, limit).map(row => projection ? Object.fromEntries(Object.entries(row).filter(([key]) => projection[key])) : row) }
        },
        doc(documentId) {
          return {
            async get() { const row = (store[name] || []).find(row => row._id === documentId); if (!row) throw new Error('document not exist'); return { data: structuredClone(row) } },
            async set({ data }) { store[name] ||= []; const index = store[name].findIndex(row => row._id === documentId); const row = { ...structuredClone(data), _id: documentId }; if (index < 0) store[name].push(row); else store[name][index] = row },
            async update({ data }) { const row = (store[name] || []).find(row => row._id === documentId); if (!row) throw new Error('document not exist'); Object.assign(row, structuredClone(data)) }
          }
        }
      }
      return query
    },
    async runTransaction(action) {
      const snapshot = structuredClone(store)
      try { return await action(db) } catch (error) { store = snapshot; throw error }
    }
  }
  return db
}

// ---------------- 夹具 ----------------

const TOURNAMENT = 't1'
const TEAM_A = 'teamA'
const TEAM_B = 'teamB'
const WINDOW_ID = hash('transfer-window:' + TOURNAMENT)
const future = days => new Date(Date.now() + days * 86400000)
const past = days => new Date(Date.now() - days * 86400000)

function baseStore() {
  return {
    tournaments: [{ _id: TOURNAMENT, name: '测试赛事', orgId: 'org1' }],
    organizations: [{ _id: 'org1', name: '测试机构', ownerId: 'uO' }],
    organization_memberships: [{ _id: 'm1', orgId: 'org1', userId: 'uO', role: 'owner' }],
    tournament_staff_grants: [],
    tournament_teams: [
      { _id: 'tt1', tournamentId: TOURNAMENT, teamId: TEAM_A, status: 'approved' },
      { _id: 'tt2', tournamentId: TOURNAMENT, teamId: TEAM_B, status: 'approved' }
    ],
    teams: [
      { _id: TEAM_A, name: '甲队', orgId: 'org1' },
      { _id: TEAM_B, name: '乙队', orgId: 'org1' },
      { _id: 'teamE', name: '到期队', orgId: 'org1' }
    ],
    players: [
      { _id: 'p1', name: '小明', teamId: TEAM_A, teamCode: TEAM_A, status: 'active', linkedUserId: 'uP1' },
      { _id: 'pR', name: '小刚', teamId: TEAM_A, teamCode: TEAM_A, status: 'active' },
      { _id: 'pR2', name: '小破裂', teamId: TEAM_A, teamCode: TEAM_A, status: 'active' },
      { _id: 'pV', name: '小版本', teamId: TEAM_A, teamCode: TEAM_A, status: 'active' },
      { _id: 'pFree', name: '小自由', teamId: '', teamCode: '', status: 'active' },
      { _id: 'p3', name: '小代管', teamId: TEAM_A, teamCode: TEAM_A, status: 'active', guardianUserId: 'uG' },
      { _id: 'p4', name: '小续约', teamId: TEAM_A, teamCode: TEAM_A, status: 'active', linkedUserId: 'uP4' }
    ],
    transfer_windows: [{
      _id: WINDOW_ID, tournamentId: TOURNAMENT, orgId: 'org1', seasonKey: '2026',
      openFrom: past(1), openTo: future(7), version: 1
    }]
  }
}

const buyer = { userId: 'uB', orgId: 'org1', manageTeamIds: [TEAM_B], tournamentIds: [TOURNAMENT], platformOwner: false, staff: false }
const seller = { userId: 'uA', orgId: 'org1', manageTeamIds: [TEAM_A], tournamentIds: [TOURNAMENT], platformOwner: false, staff: false }
const organizer = { userId: 'uO', orgId: 'org1', manageTeamIds: [], tournamentIds: [TOURNAMENT], platformOwner: false, staff: false }
const outsider = { userId: 'uZ', orgId: 'org2', manageTeamIds: [], tournamentIds: [], platformOwner: false, staff: false }
const platform = { userId: 'uP', orgId: 'org1', manageTeamIds: [], tournamentIds: [], platformOwner: true, staff: false }
const playerUser = { userId: 'uP1', orgId: 'org1', manageTeamIds: [], tournamentIds: [], platformOwner: false, staff: false }

const run = (db, actor, action, payload = {}) => transferCenter.handle(db, actor, { action, ...payload })

async function rejectsCode(promise, code) {
  let caught = null
  try { await promise } catch (error) { caught = error }
  assert.ok(caught, `期望抛出 ${code}`)
  assert.equal(caught.code, code, `期望 ${code}，实际 ${caught.code}：${caught.message}`)
  return caught
}
function throwsCode(action, code) {
  let caught = null
  try { action() } catch (error) { caught = error }
  assert.ok(caught, `期望抛出 ${code}`)
  assert.equal(caught.code, code, `期望 ${code}，实际 ${caught.code}：${caught.message}`)
  return caught
}
const byId = (store, collection, id) => (store[collection] || []).find(row => row._id === id)

// ---------------- 一、纯规则 ----------------

function testRules() {
  assert.equal(POLICY.maxRounds, 3)
  assert.equal(POLICY.cooldownHours, 24)
  assert.equal(POLICY.contractMonths, 12)
  for (const code of ['Q01', 'Q02', 'Q03', 'Q04', 'Q05', 'Q06', 'Q07', 'Q08', 'Q09']) assert.ok(PENDING_RULES[code], `缺少待决项 ${code}`)

  // 金额：分存储、两位小数、零元 Q09 拦截。
  assert.equal(amountFen({ amount: '1,000.50' }), 100050)
  assert.equal(amountFen({ amountFen: 12345 }), 12345)
  throwsCode(() => amountFen({ amount: '0' }), 'Q09_PENDING')
  throwsCode(() => amountFen({ amount: '10.555' }), 'TRANSFER_AMOUNT_INVALID')
  throwsCode(() => amountFen({ amount: '-1' }), 'TRANSFER_AMOUNT_INVALID')

  // 条款：一年合同、单场/整赛季租借、续租与转永久。
  assert.equal(normalizeTerms({ type: 'permanent', amount: '100' }).contractMonths, 12)
  assert.equal(normalizeTerms({ type: 'loan_permanent', amount: '100' }).contractMonths, 12)
  throwsCode(() => normalizeTerms({ type: 'permanent', amount: '100', loanKind: 'single_match' }), 'TRANSFER_LOAN_KIND_INVALID')
  throwsCode(() => normalizeTerms({ type: 'loan', amount: '100' }), 'TRANSFER_LOAN_KIND_REQUIRED')
  throwsCode(() => normalizeTerms({ type: 'loan', amount: '100', loanKind: 'week' }), 'Q05_PENDING')
  throwsCode(() => normalizeTerms({ type: 'loan', amount: '100', loanKind: 'single_match' }), 'TRANSFER_MATCH_REQUIRED')
  throwsCode(() => normalizeTerms({ type: 'loan', amount: '100', loanKind: 'season_full' }), 'Q03_PENDING')
  throwsCode(() => normalizeTerms({ type: 'loan_renewal', amount: '100', loanKind: 'season_full', endAt: future(30).toISOString() }), 'Q05_PENDING')
  const seasonLoan = normalizeTerms({ type: 'loan', amount: '100', loanKind: 'season_full', endAt: future(30).toISOString() })
  assert.equal(seasonLoan.loan.expiryMode, 'date')
  const singleMatch = normalizeTerms({ type: 'loan', amount: '100', loanKind: 'single_match', matchId: 'm1' })
  assert.equal(singleMatch.loan.expiryMode, 'match_end')
  assert.equal(singleMatch.loan.endAt, null)

  // 窗口：赛季标识 Q03 待决，起止校验与状态。
  throwsCode(() => normalizeWindow({ openFrom: past(1), openTo: future(1) }), 'Q03_PENDING')
  throwsCode(() => normalizeWindow({ seasonKey: '2026', openFrom: future(2), openTo: future(1) }), 'TRANSFER_WINDOW_INVALID')
  assert.equal(windowState(null), 'not_configured')
  assert.equal(windowState({ openFrom: future(1), openTo: future(2) }), 'scheduled')
  assert.equal(windowState({ openFrom: past(2), openTo: past(1) }), 'closed')
  assert.equal(windowState({ openFrom: past(1), openTo: future(1) }), 'open')
  throwsCode(() => assertWindowOpen(null), 'TRANSFER_WINDOW_NOT_CONFIGURED')
  throwsCode(() => assertWindowOpen({ openFrom: future(1), openTo: future(2) }), 'TRANSFER_WINDOW_NOT_OPEN')
  throwsCode(() => assertWindowOpen({ openFrom: past(2), openTo: past(1) }), 'TRANSFER_WINDOW_CLOSED')
  assert.equal(assertWindowOpen({ openFrom: past(1), openTo: future(1) }), 'open')

  // 状态机：买方报价轮次与回合。
  const now = new Date()
  const first = { status: 'negotiating', turn: 'to', round: 1, currentOfferVersion: 1, version: 1 }
  assert.equal(buyerOfferPatch(first, 'o2', 2, now).round, 2)
  throwsCode(() => buyerOfferPatch({ ...first, turn: 'from' }, 'o2', 2, now), 'TRANSFER_TURN_CONFLICT')
  throwsCode(() => buyerOfferPatch({ ...first, round: 3 }, 'o2', 2, now), 'TRANSFER_ROUNDS_EXHAUSTED')

  // 卖方接受：双方确认同一版本，进入主办审核。
  const waitingFirst = { status: 'negotiating', turn: 'from', round: 1, currentOfferVersion: 1, buyerConfirmedAt: now, version: 1 }
  const accepted = sellerResponsePatch(waitingFirst, { decision: 'accept', now })
  assert.equal(accepted.status, 'pending_review')
  assert.equal(accepted.agreedOfferVersion, 1)
  assert.equal(accepted.sellerConfirmedAt, now)
  throwsCode(() => sellerResponsePatch({ ...waitingFirst, turn: 'to' }, { decision: 'accept', now }), 'TRANSFER_TURN_CONFLICT')

  // 提前拒绝不写冷却（Q04 待决），第三轮还价破裂写 24 小时冷却。
  const rejected = sellerResponsePatch(waitingFirst, { decision: 'reject', now })
  assert.equal(rejected.status, 'broken')
  assert.equal(rejected.cooldownUntil, null)
  assert.equal(rejected.cooldownRule, 'pending_q04')
  const thirdRound = sellerResponsePatch({ ...waitingFirst, round: 3 }, { decision: 'counter', offerId: 'o6', version: 6, now })
  assert.equal(thirdRound.status, 'broken')
  assert.equal(thirdRound.brokenReason, 'rounds_exhausted')
  assert.equal(Math.round((thirdRound.cooldownUntil.getTime() - now.getTime()) / 3600000), 24)
  assert.equal(thirdRound.cooldownRule, 'max_3_rounds')
  assert.equal(sellerResponsePatch({ ...waitingFirst, round: 1 }, { decision: 'counter', offerId: 'o2', version: 2, now }).turn, 'to')

  assert.equal(withdrawPatch(waitingFirst, now).status, 'withdrawn')

  // 审核：只认待审核、版本一致、拒绝必须写理由。
  const reviewable = { status: 'pending_review', agreedOfferVersion: 2, currentOfferVersion: 2, version: 4 }
  throwsCode(() => reviewDecisionPatch({ ...reviewable, status: 'completed' }, { decision: 'approve', now }), 'TRANSFER_STATE_CONFLICT')
  throwsCode(() => reviewDecisionPatch({ ...reviewable, currentOfferVersion: 3 }, { decision: 'approve', now }), 'TRANSFER_VERSION_CONFLICT')
  throwsCode(() => reviewDecisionPatch(reviewable, { decision: 'reject', reason: 'x', now }), 'TRANSFER_REVIEW_REASON_REQUIRED')
  assert.equal(reviewDecisionPatch(reviewable, { decision: 'approve', now }).status, 'completed')
  assert.equal(reviewDecisionPatch(reviewable, { decision: 'reject', reason: '材料不完整', now }).status, 'rejected')

  // 合同：一年已确认，起算日 Q08 未核定前不落入到期任务。
  const term = contractTerm(now)
  assert.equal(term.termMonths, 12)
  assert.equal(term.termStatus, 'pending_confirmation')
  assert.equal(term.termPendingRule, 'Q08')
  const months = Math.round((term.validTo - term.validFrom) / (30 * 86400000))
  assert.ok(months >= 11 && months <= 12, `一年期限异常：${months}`)
  assert.equal(contractState({ status: 'active', ...term }), 'pending_term')
  assert.equal(contractState({ status: 'active', termStatus: 'confirmed', validFrom: past(10), validTo: future(10) }), 'active')
  assert.equal(contractState({ status: 'active', termStatus: 'confirmed', validFrom: future(5), validTo: future(365) }), 'scheduled')
  assert.equal(contractState({ status: 'ended', termStatus: 'confirmed', validFrom: past(10), validTo: future(10) }), 'ended')

  // 当前效力球队：租借分离原合同队，多条有效租借视为冲突。
  const contract = { teamId: TEAM_A }
  assert.equal(effectiveTeam({ contract, loans: [] }).teamId, TEAM_A)
  assert.equal(effectiveTeam({ contract, loans: [{ status: 'active', borrowerTeamId: TEAM_B, startAt: past(1), endAt: future(1) }] }).teamId, TEAM_B)
  assert.equal(effectiveTeam({ contract, loans: [{ status: 'active', borrowerTeamId: TEAM_B }, { status: 'active', borrowerTeamId: 'teamE' }] }).conflict, true)

  // 租借到期：单场以正式赛果结束，取消转待核对（Q06）。
  assert.equal(loanExpiryDecision({ status: 'active', kind: 'single_match' }, { matchState: 'official' }).action, 'end')
  assert.equal(loanExpiryDecision({ status: 'active', kind: 'single_match' }, { matchState: 'excluded' }).action, 'review')
  assert.equal(loanExpiryDecision({ status: 'active', kind: 'single_match' }, { matchState: 'provisional' }).action, 'none')
  assert.equal(loanExpiryDecision({ status: 'active', kind: 'season_full', endAt: past(1) }).action, 'end')
  assert.equal(loanExpiryDecision({ status: 'active', kind: 'season_full' }).action, 'review')

  // 续约与球员本人身份。
  throwsCode(() => assertRenewalDates({ proposedFrom: future(10), proposedTo: future(5) }), 'TRANSFER_RENEWAL_INVALID')
  throwsCode(() => assertRenewalDates({ proposedFrom: past(10), proposedTo: past(1) }), 'TRANSFER_RENEWAL_INVALID')
  assert.equal(assertRenewalDates({ proposedFrom: future(1), proposedTo: future(365) }).proposedTo > future(300), true)
  assert.equal(playerResponseIdentity({ linkedUserId: 'u1' }, 'u1').allowed, true)
  assert.equal(playerResponseIdentity({ playerUserId: 'u1' }, 'u1').allowed, true)
  const guardian = playerResponseIdentity({ linkedUserId: 'u1', guardianUserId: 'u2' }, 'u2')
  assert.equal(guardian.related, true)
  assert.equal(guardian.allowed, false)
  assert.equal(playerResponseIdentity({}, 'u2').related, false)

  const paged = paginate(Array.from({ length: 45 }, (_, index) => ({ index })), { page: 3, pageSize: 20 })
  assert.equal(paged.items.length, 5)
  assert.equal(paged.pageCount, 3)
}

// ---------------- 二、路由与领域流程 ----------------

async function testMarketAndPlayerDetail() {
  const db = mockDatabase(baseStore())
  const free = await run(db, buyer, 'transferMarket', { state: 'free' })
  assert.equal(free.success, true)
  assert.deepEqual(free.items.map(row => row.id), ['pFree'])
  assert.equal(free.items[0].contractState, 'free')

  db.clearQueries()
  const all = await run(db, buyer, 'transferMarket', { pageSize: 50 })
  assert.equal(all.schemaVersion, 1)
  assert.ok(!Number.isNaN(new Date(all.serverNow).getTime()), '响应信封须提供服务端时间')
  assert.ok(all.items.length >= 6)
  assert.ok(all.items.some(row => row.id === 'p1' && row.contractState === 'contracted'))
  for (const row of all.items) assert.ok(!('phone' in row) && !('idCard' in row), '市场不得返回隐私字段')
  assert.ok(all.notes.some(note => note.includes('Q09')))

  // 查询规模：合同、租借、估值都必须带范围，不能整集合扫描；估值按整页批量读而不是逐个球员读。
  const marketQueries = db.queries
  for (const query of marketQueries.filter(row => ['player_contracts', 'player_loans', 'player_valuations'].includes(row.collection))) {
    assert.ok(Object.keys(query.where || {}).length > 0, '市场读取 ' + query.collection + ' 未带查询范围')
  }
  assert.ok(marketQueries.filter(row => row.collection === 'player_valuations').length <= Math.ceil(all.items.length / 20), '估值应按整页批量读取')

  db.clearQueries()
  const detail = await run(db, buyer, 'transferPlayerDetail', { playerId: 'p1', teamId: TEAM_B })
  assert.equal(detail.player.effectiveTeamId, TEAM_A)
  assert.equal(detail.contract.state, 'contract_conflict')
  assert.equal(detail.cooldown.active, false)
  assert.equal(detail.negotiation, null)
  assert.ok(detail.notes.some(note => note.includes('青少年') || note.includes('Q09')))
  for (const query of db.queries.filter(row => ['player_contracts', 'player_loans', 'transfer_requests'].includes(row.collection))) {
    assert.equal(query.where.playerId, 'p1', '球员详情读取 ' + query.collection + ' 未按球员收敛')
  }
}

async function initiateRequest(db, actor = buyer, overrides = {}) {
  return run(db, actor, 'transferInitiate', {
    requestKey: 'transferkey' + Math.random().toString(36).slice(2, 10).padEnd(8, '0'),
    playerId: 'p1', teamId: TEAM_B, tournamentId: TOURNAMENT,
    terms: { type: 'permanent', amount: '1000' },
    ...overrides
  })
}

async function testInitiateGuards() {
  const db = mockDatabase(baseStore())
  await rejectsCode(run(db, buyer, 'transferInitiate', { requestKey: 'keyguards00001', playerId: 'p1', teamId: TEAM_B, terms: { type: 'permanent', amount: '100' } }), 'TRANSFER_TOURNAMENT_REQUIRED')
  await rejectsCode(run(db, organizer, 'transferInitiate', { requestKey: 'keyguards00002', playerId: 'p1', teamId: TEAM_B, tournamentId: TOURNAMENT, terms: { type: 'permanent', amount: '100' } }), 'DATA_FORBIDDEN')
  await rejectsCode(run(db, buyer, 'transferInitiate', { requestKey: 'keyguards00003', playerId: 'pFree', teamId: TEAM_B, tournamentId: TOURNAMENT, terms: { type: 'permanent', amount: '100' } }), 'TRANSFER_PLAYER_FREE')
  await rejectsCode(run(db, buyer, 'transferInitiate', { requestKey: 'keyguards00004', playerId: 'p1', teamId: TEAM_B, tournamentId: TOURNAMENT, terms: { type: 'permanent', amount: '0' } }), 'Q09_PENDING')
  await rejectsCode(run(db, buyer, 'transferInitiate', { requestKey: 'keyguards00005', playerId: 'p1', fromTeamId: 'teamE', teamId: TEAM_B, tournamentId: TOURNAMENT, terms: { type: 'permanent', amount: '100' } }), 'TRANSFER_PLAYER_CONFLICT')

  const window = byId(db.data(), 'transfer_windows', WINDOW_ID)
  const openTo = window.openTo
  window.openTo = past(1)
  await rejectsCode(run(db, buyer, 'transferInitiate', { requestKey: 'keyguards00006', playerId: 'p1', teamId: TEAM_B, tournamentId: TOURNAMENT, terms: { type: 'permanent', amount: '100' } }), 'TRANSFER_WINDOW_CLOSED')
  window.openTo = openTo

  // 同 key 幂等，重复提交不产生第二张转会单。
  const first = await initiateRequest(db, buyer, { requestKey: 'idempotentkey001' })
  const again = await initiateRequest(db, buyer, { requestKey: 'idempotentkey001' })
  assert.equal(again.idempotent, true)
  assert.equal(again.id, first.id)
  assert.equal(db.data().transfer_requests.length, 1)
  assert.equal(db.data().transfer_offers.length, 1)
  assert.equal(db.data().transfer_events.length, 1)
}

async function testAcceptReviewAndHandover() {
  const db = mockDatabase(baseStore())
  const created = await initiateRequest(db, buyer, { requestKey: 'handoverkey0001' })
  assert.equal(created.status, 'negotiating')

  await rejectsCode(run(db, seller, 'transferAcceptOffer', { requestId: created.id, teamId: TEAM_A, expectedOfferVersion: 99 }), 'TRANSFER_VERSION_CONFLICT')
  // 版本必须显式提交：不带版本的重试不能覆盖别人已确认的条款。
  await rejectsCode(run(db, seller, 'transferAcceptOffer', { requestId: created.id, teamId: TEAM_A }), 'TRANSFER_VERSION_REQUIRED')
  await rejectsCode(run(db, buyer, 'transferAcceptOffer', { requestId: created.id, teamId: TEAM_B, expectedOfferVersion: 1 }), 'DATA_FORBIDDEN')

  const accepted = await run(db, seller, 'transferAcceptOffer', { requestId: created.id, teamId: TEAM_A, expectedOfferVersion: 1 })
  assert.equal(accepted.status, 'pending_review')
  const request = byId(db.data(), 'transfer_requests', created.id)
  assert.equal(request.agreedOfferVersion, 1)
  assert.equal(request.status, 'pending_review')

  await rejectsCode(run(db, organizer, 'transferReview', { requestId: created.id, decision: 'approve', expectedOfferVersion: 99 }), 'TRANSFER_VERSION_CONFLICT')
  await rejectsCode(run(db, organizer, 'transferReview', { requestId: created.id, decision: 'approve' }), 'TRANSFER_VERSION_REQUIRED')
  await rejectsCode(run(db, outsider, 'transferReview', { requestId: created.id, decision: 'approve', expectedOfferVersion: 1 }), 'DATA_FORBIDDEN')

  const approved = await run(db, organizer, 'transferReview', { requestId: created.id, decision: 'approve', expectedOfferVersion: 1 })
  assert.equal(approved.status, 'completed')
  assert.ok(approved.handover.contractId)
  assert.ok(approved.handover.membershipId)
  assert.equal(approved.handover.status, 'done')

  const player = byId(db.data(), 'players', 'p1')
  assert.equal(player.teamId, TEAM_B)
  assert.equal(player.currentMembershipId, approved.handover.membershipId)
  assert.ok(player.currentHistoryId)
  const memberships = db.data().player_team_memberships
  assert.equal(memberships.length, 2)
  assert.equal(memberships.find(row => row._id === approved.handover.membershipId).status, 'active')
  assert.equal(memberships.find(row => row._id === approved.handover.closedMembershipId).status, 'ended')
  assert.equal(db.data().player_team_history.length, 2)
  assert.equal(byId(db.data(), 'teams', TEAM_A).rosterCountStatus, 'needs_refresh')
  assert.equal(byId(db.data(), 'teams', TEAM_B).rosterCountStatus, 'needs_refresh')
  const contract = byId(db.data(), 'player_contracts', approved.handover.contractId)
  assert.equal(contract.teamId, TEAM_B)
  assert.equal(contract.status, 'active')
  assert.equal(contract.termStatus, 'pending_confirmation')
  assert.equal(contract.termPendingRule, 'Q08')

  // 已完成审核重复提交返回幂等，不再改归属。
  const repeated = await run(db, organizer, 'transferReview', { requestId: created.id, decision: 'approve' })
  assert.equal(repeated.idempotent, true)
  assert.equal(db.data().player_team_memberships.length, 2)

  const adminRecord = await run(db, organizer, 'transferAdminRecord', { requestId: created.id })
  assert.equal(adminRecord.success, true)
  assert.equal(adminRecord.request.status, 'completed')
  assert.ok(adminRecord.events.length >= 3)

  const adminList = await run(db, organizer, 'transferAdminRequests', { tournamentId: TOURNAMENT, tab: 'reviewed' })
  assert.equal(adminList.totals.reviewed, 1)
  assert.equal(adminList.items[0].recordKind, 'request')

  db.clearQueries()
  const teamRequests = await run(db, seller, 'transferMyRequests', { teamId: TEAM_A, tab: 'all' })
  assert.equal(teamRequests.total, 1)
  assert.equal(teamRequests.items[0].status, 'completed')
  // 我的转会按买卖两向等值读取，不能整集合扫描单据。
  const requestQueries = db.queries.filter(row => row.collection === 'transfer_requests')
  assert.ok(requestQueries.length >= 1)
  for (const query of requestQueries) assert.ok(Object.keys(query.where || {}).length > 0, '我的转会读取未带球队范围')

  db.clearQueries()
  const contracts = await run(db, buyer, 'transferContracts', { teamId: TEAM_B })
  assert.equal(contracts.items.length, 1)
  assert.equal(contracts.items[0].state, 'pending_term')
  assert.ok(contracts.notes.some(note => note.includes('Q08')))
  for (const query of db.queries.filter(row => ['player_contracts', 'player_loans'].includes(row.collection))) {
    assert.ok(Object.keys(query.where || {}).length > 0, '合同页读取 ' + query.collection + ' 未带球队范围')
  }
  const expiring = await run(db, buyer, 'transferContracts', { teamId: TEAM_B, tab: 'expiring' })
  assert.equal(expiring.expiringState, 'pending_q07')
  assert.equal(expiring.items.length, 0)
}

async function testThreeRoundsAndCooldown() {
  const db = mockDatabase(baseStore())
  const created = await run(db, buyer, 'transferInitiate', { requestKey: 'roundskey000001', playerId: 'pR', teamId: TEAM_B, tournamentId: TOURNAMENT, terms: { type: 'permanent', amount: '1000' } })
  const counter = amount => ({ requestId: created.id, teamId: TEAM_A, terms: { type: 'permanent', amount } })

  const round1 = await run(db, seller, 'transferCounterOffer', { ...counter('900'), expectedOfferVersion: 1 })
  assert.equal(round1.turn, 'to')
  // 买方不带版本加价一律拒绝，避免覆盖对方刚提交的还价。
  await rejectsCode(run(db, buyer, 'transferSubmitOffer', { requestId: created.id, teamId: TEAM_B, terms: { type: 'permanent', amount: '950' } }), 'TRANSFER_VERSION_REQUIRED')
  const round2Offer = await run(db, buyer, 'transferSubmitOffer', { requestId: created.id, teamId: TEAM_B, expectedVersion: 2, terms: { type: 'permanent', amount: '950' } })
  assert.equal(round2Offer.round, 2)
  assert.equal(round2Offer.turn, 'from')
  await run(db, seller, 'transferCounterOffer', { ...counter('920'), expectedOfferVersion: 3 })
  const round3Offer = await run(db, buyer, 'transferSubmitOffer', { requestId: created.id, teamId: TEAM_B, expectedVersion: 4, terms: { type: 'permanent', amount: '930' } })
  assert.equal(round3Offer.round, 3)
  const broken = await run(db, seller, 'transferCounterOffer', { ...counter('925'), expectedOfferVersion: 5 })
  assert.equal(broken.status, 'broken')
  assert.equal(broken.offerVersion, 6)
  assert.ok(broken.cooldownUntil)

  const record = byId(db.data(), 'transfer_requests', created.id)
  assert.equal(record.status, 'broken')
  assert.equal(record.brokenReason, 'rounds_exhausted')
  assert.equal(record.brokenRound, 3)
  const cooldown = byId(db.data(), 'transfer_cooldowns', hash('transfer-cooldown:' + TEAM_B + ':pR'))
  assert.ok(cooldown)
  assert.ok(new Date(cooldown.until).getTime() > Date.now())

  // 冷却期内同买方不能再向同一球员发起。
  await rejectsCode(run(db, buyer, 'transferInitiate', { requestKey: 'roundskey000002', playerId: 'pR', teamId: TEAM_B, tournamentId: TOURNAMENT, terms: { type: 'permanent', amount: '1000' } }), 'TRANSFER_COOLDOWN_ACTIVE')

  // 提前拒绝不写冷却，可重新发起（Q04 待决）。
  const second = await run(db, buyer, 'transferInitiate', { requestKey: 'earlyreject00001', playerId: 'pR2', teamId: TEAM_B, tournamentId: TOURNAMENT, terms: { type: 'permanent', amount: '500' } })
  const rejected = await run(db, seller, 'transferRejectOffer', { requestId: second.id, teamId: TEAM_A, expectedOfferVersion: 1 })
  assert.equal(rejected.status, 'broken')
  assert.equal(rejected.cooldownUntil, null)
  assert.equal(byId(db.data(), 'transfer_cooldowns', hash('transfer-cooldown:' + TEAM_B + ':pR2')), undefined)
  const retry = await run(db, buyer, 'transferInitiate', { requestKey: 'earlyreject00002', playerId: 'pR2', teamId: TEAM_B, tournamentId: TOURNAMENT, terms: { type: 'permanent', amount: '500' } })
  assert.equal(retry.status, 'negotiating')
}

async function testReviewReject() {
  const db = mockDatabase(baseStore())
  const created = await run(db, buyer, 'transferInitiate', { requestKey: 'rejectkey000001', playerId: 'pV', teamId: TEAM_B, tournamentId: TOURNAMENT, terms: { type: 'permanent', amount: '800' } })
  await run(db, seller, 'transferAcceptOffer', { requestId: created.id, teamId: TEAM_A, expectedOfferVersion: 1 })
  await rejectsCode(run(db, organizer, 'transferReview', { requestId: created.id, decision: 'reject', reason: 'x', expectedOfferVersion: 1 }), 'TRANSFER_REVIEW_REASON_REQUIRED')
  const rejected = await run(db, organizer, 'transferReview', { requestId: created.id, decision: 'reject', reason: '材料不完整，需补充协议', expectedOfferVersion: 1 })
  assert.equal(rejected.status, 'rejected')
  const player = byId(db.data(), 'players', 'pV')
  assert.equal(player.teamId, TEAM_A)
  assert.equal((db.data().player_team_memberships || []).length, 0)
  const record = byId(db.data(), 'transfer_requests', created.id)
  assert.equal(record.review.decision, 'reject')
  assert.equal(record.review.reason, '材料不完整，需补充协议')

  // 已撤回后不能再回应。
  const second = await run(db, buyer, 'transferInitiate', { requestKey: 'rejectkey000002', playerId: 'pR', teamId: TEAM_B, tournamentId: TOURNAMENT, terms: { type: 'permanent', amount: '800' } })
  await rejectsCode(run(db, buyer, 'transferWithdraw', { requestId: second.id, teamId: TEAM_B }), 'TRANSFER_VERSION_REQUIRED')
  const withdrawn = await run(db, buyer, 'transferWithdraw', { requestId: second.id, teamId: TEAM_B, expectedVersion: 1 })
  assert.equal(withdrawn.status, 'withdrawn')
  await rejectsCode(run(db, seller, 'transferAcceptOffer', { requestId: second.id, teamId: TEAM_A, expectedOfferVersion: 1 }), 'TRANSFER_STATE_CONFLICT')
}

async function testFreeAgentSigning() {
  const db = mockDatabase(baseStore())
  const signed = await run(db, buyer, 'transferSignFreeAgent', { requestKey: 'freeagentkey001', playerId: 'pFree', teamId: TEAM_B, tournamentId: TOURNAMENT })
  assert.equal(signed.status, 'completed')
  const player = byId(db.data(), 'players', 'pFree')
  assert.equal(player.teamId, TEAM_B)
  assert.ok(player.currentMembershipId)
  const contract = byId(db.data(), 'player_contracts', signed.contractId)
  assert.equal(contract.teamId, TEAM_B)
  assert.equal(contract.termStatus, 'pending_confirmation')
  const signing = byId(db.data(), 'transfer_free_signings', signed.id)
  assert.equal(signing.eventScopePolicy, 'outside_event_only')
  assert.equal(signing.freeAgentWindowPolicy, 'conservative_requires_open_window')
  assert.equal(signing.reviewPolicy, 'pending_q02')
  assert.equal(db.data().player_team_history.length, 1)

  const repeat = await run(db, buyer, 'transferSignFreeAgent', { requestKey: 'freeagentkey001', playerId: 'pFree', teamId: TEAM_B, tournamentId: TOURNAMENT })
  assert.equal(repeat.idempotent, true)
  assert.equal(db.data().player_team_memberships.length, 1)

  await rejectsCode(run(db, buyer, 'transferSignFreeAgent', { requestKey: 'freeagentkey002', playerId: 'p1', teamId: TEAM_B, tournamentId: TOURNAMENT }), 'TRANSFER_PLAYER_NOT_FREE')

  const admin = await run(db, organizer, 'transferAdminRequests', { tournamentId: TOURNAMENT, tab: 'all' })
  assert.equal(admin.totals.freeSignings, 1)
  assert.ok(admin.items.some(row => row.recordKind === 'free_agent'))

  // 用户 2026-10-26 已确认：自由签约只面向赛事外球员，已列入本赛事名单的一律拦截。
  const rosterStore = baseStore()
  rosterStore.roster_snapshots = [{ _id: 'rs1', tournamentId: TOURNAMENT, teamId: 'teamE', status: 'approved', version: 1, playerIds: ['pFree'] }]
  await rejectsCode(run(mockDatabase(rosterStore), buyer, 'transferSignFreeAgent', { requestKey: 'freeagentkey010', playerId: 'pFree', teamId: TEAM_B, tournamentId: TOURNAMENT }), 'TRANSFER_FREE_AGENT_IN_EVENT')

  const legacyStore = baseStore()
  legacyStore.rosters = [{ _id: 'legacy1', tournamentId: TOURNAMENT, teamId: 'teamE', players: [{ playerId: 'pFree' }] }]
  await rejectsCode(run(mockDatabase(legacyStore), buyer, 'transferSignFreeAgent', { requestKey: 'freeagentkey011', playerId: 'pFree', teamId: TEAM_B, tournamentId: TOURNAMENT }), 'TRANSFER_FREE_AGENT_IN_EVENT')

  // 其他赛事的名单不影响本赛事签约资格（“赛事内”按本次签约所选赛事判定）。
  const otherEventStore = baseStore()
  otherEventStore.roster_snapshots = [{ _id: 'rs2', tournamentId: 'tOther', teamId: 'teamE', status: 'approved', version: 1, playerIds: ['pFree'] }]
  const otherEventSigned = await run(mockDatabase(otherEventStore), buyer, 'transferSignFreeAgent', { requestKey: 'freeagentkey012', playerId: 'pFree', teamId: TEAM_B, tournamentId: TOURNAMENT })
  assert.equal(otherEventSigned.status, 'completed')
}

async function testSelfReviewGuard() {
  const db = mockDatabase(baseStore())
  const created = await run(db, buyer, 'transferInitiate', { requestKey: 'selfreview00001', playerId: 'pV', teamId: TEAM_B, tournamentId: TOURNAMENT, terms: { type: 'permanent', amount: '900' } })
  await run(db, seller, 'transferAcceptOffer', { requestId: created.id, teamId: TEAM_A, expectedOfferVersion: 1 })

  // 审核人管理着买方球队：通过与拒绝都不允许，且不改变单据状态。
  const buyerManager = { userId: 'uO', orgId: 'org1', manageTeamIds: [TEAM_B], tournamentIds: [TOURNAMENT], platformOwner: false, staff: false }
  await rejectsCode(run(db, buyerManager, 'transferReview', { requestId: created.id, decision: 'reject', reason: '测试自审拦截' }), 'TRANSFER_REVIEW_CONFLICT')
  await rejectsCode(run(db, buyerManager, 'transferReview', { requestId: created.id, decision: 'approve', expectedOfferVersion: 1 }), 'TRANSFER_REVIEW_CONFLICT')
  assert.equal(byId(db.data(), 'transfer_requests', created.id).status, 'pending_review')

  // 球队文件上的负责人字段同样构成管理关系。
  const fieldStore = baseStore()
  fieldStore.teams.find(row => row._id === TEAM_A).ownerId = 'uO2'
  fieldStore.organization_memberships.push({ _id: 'm2', orgId: 'org1', userId: 'uO2', role: 'admin' })
  const fieldDb = mockDatabase(fieldStore)
  const fieldCreated = await run(fieldDb, buyer, 'transferInitiate', { requestKey: 'selfreview00002', playerId: 'pV', teamId: TEAM_B, tournamentId: TOURNAMENT, terms: { type: 'permanent', amount: '700' } })
  await run(fieldDb, seller, 'transferAcceptOffer', { requestId: fieldCreated.id, teamId: TEAM_A, expectedOfferVersion: 1 })
  const fieldManager = { userId: 'uO2', orgId: 'org1', manageTeamIds: [], tournamentIds: [TOURNAMENT], platformOwner: false, staff: false }
  await rejectsCode(run(fieldDb, fieldManager, 'transferReview', { requestId: fieldCreated.id, decision: 'approve', expectedOfferVersion: 1 }), 'TRANSFER_REVIEW_CONFLICT')

  // 无管理关系的赛事负责人可以正常审核。
  const approved = await run(db, organizer, 'transferReview', { requestId: created.id, decision: 'approve', expectedOfferVersion: 1 })
  assert.equal(approved.status, 'completed')
}

async function testRenewals() {
  const store = baseStore()
  store.player_contracts = [
    { _id: 'c1', playerId: 'p1', teamId: TEAM_A, orgId: 'org1', status: 'active', termStatus: 'confirmed', validFrom: past(30), validTo: future(300) },
    { _id: 'c3', playerId: 'p3', teamId: TEAM_A, orgId: 'org1', status: 'active', termStatus: 'confirmed', validFrom: past(30), validTo: future(300) },
    { _id: 'c4', playerId: 'p4', teamId: TEAM_A, orgId: 'org1', status: 'active', termStatus: 'confirmed', validFrom: past(30), validTo: future(300) }
  ]
  const db = mockDatabase(store)

  const first = await run(db, seller, 'transferCreateRenewal', { requestKey: 'renewalkey00001', teamId: TEAM_A, contractId: 'c1', proposedFrom: future(300), proposedTo: future(660) })
  assert.equal(first.status, 'pending')
  await rejectsCode(run(db, seller, 'transferCreateRenewal', { requestKey: 'renewalkey00002', teamId: TEAM_A, contractId: 'c1', proposedFrom: future(300), proposedTo: future(660) }), 'TRANSFER_RENEWAL_EXISTS')

  const teamList = await run(db, seller, 'transferTeamRenewals', { teamId: TEAM_A })
  assert.equal(teamList.items.length, 1)
  assert.equal(teamList.canCreate, false)

  const playerList = await run(db, playerUser, 'transferPlayerRenewals', {})
  assert.equal(playerList.identityState, 'self')
  assert.equal(playerList.items[0].canRespond, true)

  // 续约回应同样必须带版本，防止用旧页面默认值覆盖球队刚调整的条款。
  await rejectsCode(run(db, playerUser, 'transferRespondRenewal', { renewalId: first.id, decision: 'accept' }), 'TRANSFER_VERSION_REQUIRED')
  const accepted = await run(db, playerUser, 'transferRespondRenewal', { renewalId: first.id, decision: 'accept', expectedVersion: 1 })
  assert.equal(accepted.status, 'accepted')
  const newContract = byId(db.data(), 'player_contracts', accepted.contractId)
  assert.equal(newContract.termStatus, 'confirmed')
  assert.equal(newContract.status, 'scheduled')
  assert.equal(newContract.renewedFromContractId, 'c1')
  assert.equal(byId(db.data(), 'player_contracts', 'c1').renewedByContractId, accepted.contractId)
  const repeated = await run(db, playerUser, 'transferRespondRenewal', { renewalId: first.id, decision: 'accept' })
  assert.equal(repeated.idempotent, true)

  // 拒绝续约不结束现合同。
  const second = await run(db, seller, 'transferCreateRenewal', { requestKey: 'renewalkey00003', teamId: TEAM_A, contractId: 'c4', proposedFrom: future(300), proposedTo: future(660) })
  const rejected = await run(db, { userId: 'uP4', orgId: 'org1', manageTeamIds: [], platformOwner: false, staff: false }, 'transferRespondRenewal', { renewalId: second.id, decision: 'reject', note: '暂不续约', expectedVersion: 1 })
  assert.equal(rejected.status, 'rejected')
  assert.equal(rejected.contractContinues, true)
  const c4 = byId(db.data(), 'player_contracts', 'c4')
  assert.equal(c4.status, 'active')
  assert.equal(c4.pendingRenewalId, '')

  // 代管人回应续约按 Q07 显式拦截，不代替球员本人决定。
  const guardianRenewal = await run(db, seller, 'transferCreateRenewal', { requestKey: 'renewalkey00004', teamId: TEAM_A, contractId: 'c3', proposedFrom: future(300), proposedTo: future(660) })
  assert.equal(guardianRenewal.notifyStatus, 'pending')
  await rejectsCode(run(db, { userId: 'uG', orgId: 'org1', manageTeamIds: [], platformOwner: false, staff: false }, 'transferRespondRenewal', { renewalId: guardianRenewal.id, decision: 'accept', expectedVersion: 1 }), 'Q07_PENDING')
}

async function testWindowAndExpiry() {
  const store = baseStore()
  store.tournaments.push({ _id: 't2', name: '空窗口赛事', orgId: 'org1' })
  store.player_contracts = [
    { _id: 'cE', playerId: 'pE', teamId: 'teamE', orgId: 'org1', status: 'active', termStatus: 'confirmed', validFrom: past(400), validTo: past(1) },
    { _id: 'cL', playerId: 'pL2', teamId: TEAM_A, orgId: 'org1', status: 'active', termStatus: 'confirmed', validFrom: past(400), validTo: past(1) },
    { _id: 'cX', playerId: 'p4', teamId: TEAM_A, orgId: 'org1', status: 'active', termStatus: 'pending_confirmation', validFrom: past(10), validTo: future(355) }
  ]
  store.player_loans = [
    { _id: 'lDone', playerId: 'pL1', ownerTeamId: TEAM_A, borrowerTeamId: TEAM_B, kind: 'single_match', matchId: 'mDone', status: 'active', startAt: past(2) },
    { _id: 'lReview', playerId: 'pL2', ownerTeamId: TEAM_A, borrowerTeamId: TEAM_B, kind: 'single_match', matchId: 'mCancel', status: 'active', startAt: past(2) }
  ]
  store.matches = [
    { _id: 'mDone', tournamentId: TOURNAMENT, status: 'completed' },
    { _id: 'mCancel', tournamentId: TOURNAMENT, status: 'cancelled' }
  ]
  store.players.push(
    { _id: 'pE', name: '到期球员', teamId: 'teamE', teamCode: 'teamE', status: 'active', currentMembershipId: 'memE', currentHistoryId: 'histE' },
    { _id: 'pL1', name: '单场球员', teamId: TEAM_A, teamCode: TEAM_A, status: 'active' },
    { _id: 'pL2', name: '取消球员', teamId: TEAM_A, teamCode: TEAM_A, status: 'active' }
  )
  store.player_team_memberships = [{ _id: 'memE', playerId: 'pE', teamId: 'teamE', status: 'active', validFrom: past(400), validTo: null }]
  store.player_team_history = [{ _id: 'histE', playerId: 'pE', teamId: 'teamE', joinedAt: past(400), leftAt: null }]
  const db = mockDatabase(store)

  // 窗口：每个赛事一个窗口，版本不一致直接拦截。
  const saved = await run(db, organizer, 'transferWindowSave', { tournamentId: 't2', seasonKey: '2026', openFrom: past(1).toISOString(), openTo: future(7).toISOString(), expectedVersion: 0 })
  assert.equal(saved.version, 1)
  assert.equal(saved.state, 'open')
  await rejectsCode(run(db, organizer, 'transferWindowSave', { tournamentId: 't2', seasonKey: '2026', openFrom: past(1).toISOString(), openTo: future(7).toISOString(), expectedVersion: 0 }), 'TRANSFER_WINDOW_STALE')
  const window = await run(db, organizer, 'transferWindowGet', { tournamentId: 't2' })
  assert.equal(window.window.state, 'open')
  assert.equal(window.canConfigure, true)
  const teamWindow = await run(db, buyer, 'transferWindowGet', { tournamentId: 't2', teamId: TEAM_B })
  assert.equal(teamWindow.canConfigure, false)
  await rejectsCode(run(db, outsider, 'transferWindowSave', { tournamentId: 't2', seasonKey: '2026', openFrom: past(1).toISOString(), openTo: future(7).toISOString(), expectedVersion: 1 }), 'DATA_FORBIDDEN')

  // 到期任务：平台负责人专属。
  await rejectsCode(run(db, organizer, 'transferExpireDue', {}), 'DATA_FORBIDDEN')
  const summary = await run(db, platform, 'transferExpireDue', {})
  assert.equal(summary.success, true)
  assert.ok(summary.endedLoans >= 1)
  assert.ok(summary.reviewedLoans >= 1)
  assert.ok(summary.expiredContracts >= 1)
  assert.ok(summary.pendingContracts >= 1)
  assert.equal(byId(db.data(), 'player_loans', 'lDone').status, 'ended')
  assert.equal(byId(db.data(), 'player_loans', 'lReview').expiryState, 'pending_review')
  assert.equal(byId(db.data(), 'player_contracts', 'cL').expiryState, 'pending_review')
  assert.equal(byId(db.data(), 'player_contracts', 'cE').status, 'expired')
  assert.equal(byId(db.data(), 'players', 'pE').teamId, '')
  assert.equal(byId(db.data(), 'player_team_memberships', 'memE').status, 'ended')
  assert.ok(byId(db.data(), 'player_team_history', 'histE').leftAt)

  // 合同期限核定（Q08 的显式入口）：仅平台负责人。
  await rejectsCode(run(db, organizer, 'transferConfirmContractTerm', { contractId: 'cX', validFrom: past(10).toISOString(), validTo: future(355).toISOString() }), 'DATA_FORBIDDEN')
  const confirmed = await run(db, platform, 'transferConfirmContractTerm', { contractId: 'cX', validFrom: past(10).toISOString(), validTo: future(355).toISOString() })
  assert.equal(confirmed.termStatus, 'confirmed')
  assert.equal(byId(db.data(), 'player_contracts', 'cX').termStatus, 'confirmed')
}

async function testStaffBoundaryAndWiring() {
  const store = baseStore()
  store.tournament_staff_grants = [{ _id: 'g1', orgId: 'org1', tournamentId: TOURNAMENT, userId: 'uS', status: 'active', permissions: ['event.transfer'] }]
  const db = mockDatabase(store)
  const staff = { userId: 'uS', orgId: 'org1', staff: true, tournamentIds: [TOURNAMENT], teamIds: [TEAM_A], manageTeamIds: [TEAM_A] }
  const staffNoRight = { userId: 'uS2', orgId: 'org1', staff: true, tournamentIds: [TOURNAMENT], teamIds: [TEAM_A], manageTeamIds: [TEAM_A] }

  const adminList = await run(db, staff, 'transferAdminRequests', { tournamentId: TOURNAMENT, tab: 'pending' })
  assert.equal(adminList.success, true)
  assert.equal(adminList.total, 0)

  await rejectsCode(run(db, staffNoRight, 'transferAdminRequests', { tournamentId: TOURNAMENT }), 'DATA_FORBIDDEN')
  await rejectsCode(run(db, staff, 'transferAdminRequests', { tournamentId: 't2' }), 'DATA_FORBIDDEN')
  await rejectsCode(run(db, staff, 'transferContracts', { teamId: TEAM_A }), 'DATA_FORBIDDEN')
  await rejectsCode(run(db, staff, 'transferInitiate', { requestKey: 'staffblock00001', playerId: 'p1', teamId: TEAM_A, tournamentId: TOURNAMENT, terms: { type: 'permanent', amount: '100' } }), 'DATA_FORBIDDEN')

  await rejectsCode(run(db, buyer, 'transferUnknown', {}), 'DATA_ACTION_INVALID')
  assert.ok(transferCenter.ACTIONS.includes('transferPlayerDetail'))
  assert.ok(!transferCenter.ACTIONS.includes('playerDetail'), '转会动作不得覆盖 dataCenter 同名动作')
  assert.ok(staffPolicy.SIDEBAR_RIGHTS.includes('event.transfer'), '赛事权限目录缺少转会权限')

  // 跨函数接线：中转层必须按 event.transfer 放行转会动作，子账号授权接口必须接受该权限码。
  assert.deepEqual(relayRights('dataCenter', { action: 'transferReview' }).any, ['event.transfer'], '中转层未要求赛事转会权限')
  assert.ok(relayRights('dataCenter', { action: 'catalog' }).any.includes('event.dashboard'), '既有数据读取中转权限被改动')
  assert.ok(staffAccessPolicy.SIDEBAR_RIGHTS.includes('event.transfer'), '子账号授权接口不接受转会权限')

  const indexSource = fs.readFileSync(path.join(__dirname, '..', 'cloudfunctions', 'dataCenter', 'index.js'), 'utf8')
  assert.ok(indexSource.includes('transferCenter.ACTIONS.includes(event.action)'), 'dataCenter 未接入转会路由')
  assert.ok(indexSource.includes('...Object.values(TRANSFER_COLLECTIONS)'), '初始化集合未登记转会集合')
}

async function main() {
  testRules()
  await testMarketAndPlayerDetail()
  await testInitiateGuards()
  await testAcceptReviewAndHandover()
  await testThreeRoundsAndCooldown()
  await testReviewReject()
  await testSelfReviewGuard()
  await testFreeAgentSigning()
  await testRenewals()
  await testWindowAndExpiry()
  await testStaffBoundaryAndWiring()
  console.log('PASS: 转会中心规则（轮次/冷却/条款/窗口）、审核交接、自由签约、续约、到期与赛事子账号边界')
}

main().catch(error => { console.error(error); process.exit(1) })
