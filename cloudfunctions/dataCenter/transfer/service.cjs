'use strict'
/**
 * 赛事转会中心服务层（方案 V1.1）。
 *
 * 唯一写入入口：dataCenter 云函数。PC／小程序／服务号只通过 relay 调用下列 action，
 * 不得各自维护合同、轮次、到期或归属交接算法。
 *
 * 边界：
 * - 球队写操作只认 actor.manageTeamIds；浏览市场不授予报价、签约或审核权。
 * - 主办审核只认赛事范围（event.transfer 权限或机构 event.manage），平台负责人只做监督与到期任务。
 * - 转会不复制球员档案、不改比赛／事件／赛果、不自动转移赛事参赛资格；只增写关系流转。
 * - 审核通过与归属交接在同一事务内完成，失败整体回滚，不产生半成品归属。
 */
const { createDataService, error } = require('../shared/service.cjs')
const { readAll, readByIds, readOptionalAll } = require('../shared/reader.cjs')
const { inEventRoster } = require('../shared/roster.cjs')
const { valuationView, latestValuation, latestValuations } = require('../shared/valuation-view.cjs')
const staffPolicy = require('../staffPolicy.cjs')
const {
  COLLECTIONS, POLICY, MAX_OFFERS, MAX_EVENTS,
  id, first, hash, pending, dateValue, windowState, assertWindowOpen,
  normalizeTerms, normalizeWindow, assertNoAmountChange, buyerOfferPatch,
  buildRequest, sellerResponsePatch, withdrawPatch, reviewDecisionPatch,
  contractTerm, contractState, effectiveTeam, loanExpiryDecision,
  assertRenewalDates, playerResponseIdentity, paginate
} = require('./rules.cjs')

const NOT_FOUND = /document.*(not exist|not found)|DOCUMENT_NOT_FOUND|document\.get:document/i

const STATUS_TEXT = Object.freeze({
  negotiating: '谈判中',
  pending_review: '待主办审核',
  pending_effect: '待生效',
  completed: '已完成',
  rejected: '审核未通过',
  broken: '谈判已结束',
  withdrawn: '已撤回'
})
const CONTRACT_STATE_TEXT = Object.freeze({
  active: '有效', scheduled: '待生效', expired: '已到期', ended: '已结束', renewed: '已续约', pending_term: '合同日期待补齐', none: '无合同'
})
const TYPE_TEXT = Object.freeze({
  permanent: '正式转会', loan: '租借', loan_permanent: '租借转永久', loan_renewal: '租借续租', free_agent: '自由球员签约'
})
const LOAN_KIND_TEXT = Object.freeze({ season_full: '整赛季租借', single_match: '单场租借' })

const typeText = (type, loanKind) => type === 'loan' ? (LOAN_KIND_TEXT[loanKind] || '租借') : (TYPE_TEXT[type] || '转会')

async function getDoc(ref, docId) {
  if (!docId) return null
  try { return first(await ref.doc(docId).get()) } catch (failure) {
    if (NOT_FOUND.test(String(failure?.errMsg || failure?.message || ''))) return null
    throw failure
  }
}
const docOf = (ref, collection, docId) => getDoc(ref.collection(collection), docId)

async function ensureCollections(db, names) {
  for (const name of names) {
    try { await db.createCollection(name) } catch (failure) {
      if (!/exist|already|duplicate|已存在/i.test(String(failure?.message || failure?.errMsg || ''))) throw failure
    }
  }
}

// 读取必须带明确范围：整集合扫描会随数据增长撞上读取预算，也会把无关机构的数据带进内存。
async function readRows(db, collection, where = {}, maxRows = 20000) {
  return readOptionalAll(db, collection, where, { maxRows })
}

// 同一集合的多个等值范围分次读取后按 _id 去重。
// keyset 分页只接受简单条件，把 or／in 命令嵌进分页条件在不同 SDK 版本下行为不一致。
function mergedStatus(states) {
  if (states.every(state => state === 'ready')) return 'ready'
  if (states.every(state => state === 'not_recorded')) return 'not_recorded'
  return 'partial'
}

async function readEither(db, collection, wheres, maxRows = 20000) {
  const rows = new Map()
  const states = []
  for (const where of wheres) {
    const read = await readOptionalAll(db, collection, where, { maxRows })
    states.push(read.status)
    for (const row of read.rows) rows.set(id(row._id), row)
  }
  return { status: mergedStatus(states), rows: [...rows.values()] }
}

function timeText(value) {
  const date = dateValue(value)
  if (!date) return ''
  try { return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) } catch (_) { return date.toISOString() }
}

const teamNameOf = team => id(team?.name || team?.teamName)
const orgOf = team => id(team?.orgId || team?.organizationId)
const windowId = tournamentId => hash('transfer-window:' + id(tournamentId))
const offerId = (requestId, version) => hash('transfer-offer:' + requestId + ':' + version)
const eventId = (requestId, seq) => hash('transfer-event:' + requestId + ':' + seq)
const cooldownId = (teamId, playerId) => hash('transfer-cooldown:' + teamId + ':' + playerId)

// 版本必须由调用方显式提交：省略时一律拒绝，避免旧页面或不带版本的重试覆盖他人已确认的条款。
// window 首次保存允许 0，其余版本从 1 起。
function requiredVersion(value, label = '条款版本', minimum = 1) {
  if (value === undefined || value === null || value === '') throw error('TRANSFER_VERSION_REQUIRED', `缺少${label}，请刷新后重试`)
  const version = Number(value)
  if (!Number.isInteger(version) || version < minimum) throw error('TRANSFER_VERSION_REQUIRED', `${label}无效，请刷新后重试`)
  return version
}

// ---------------- 授权 ----------------

function requireTeamManager(actor, teamId) {
  const value = id(teamId)
  if (!value) throw error('TRANSFER_TEAM_REQUIRED', '请选择操作球队')
  if (!(actor.manageTeamIds || []).includes(value)) throw error('DATA_FORBIDDEN', '无权管理该球队的转会事务')
  return value
}

async function orgEventManager(db, actor) {
  const rows = (await db.collection('organization_memberships').where({ orgId: id(actor.orgId), userId: id(actor.userId) }).limit(20).get()).data || []
  return rows.some(row => row.source !== 'tournament_staff_invite' && (
    ['owner', 'admin', 'organizer'].includes(id(row.role).toLowerCase()) ||
    (Array.isArray(row.permissions) && row.permissions.includes('event.manage'))
  ))
}

// 主办审核权限：赛事必须属于当前机构，且具备转会权限或机构赛事管理权限。
// 赛事子账号默认没有 event.transfer，不会被默认放开。
async function requireReviewRights(db, actor, tournamentId) {
  const value = id(tournamentId)
  if (!value) throw error('DATA_SCOPE_INVALID', '请选择赛事')
  const tournament = await getDoc(db.collection('tournaments'), value)
  if (!tournament) throw error('DATA_FORBIDDEN', '赛事不存在或无权访问')
  const orgId = id(tournament.orgId || tournament.organizationId)
  if (actor.platformOwner) return tournament
  if (id(actor.orgId) !== orgId) throw error('DATA_FORBIDDEN', '赛事不属于当前机构')
  if (await staffPolicy.hasRight(db, actor.userId, actor.orgId, value, 'event.transfer')) return tournament
  if (!(await staffPolicy.isStaff(db, actor.userId, actor.orgId)) && await orgEventManager(db, actor)) return tournament
  throw error('DATA_FORBIDDEN', '当前赛事没有转会审核权限')
}

async function canReview(db, actor, tournamentId) {
  try { await requireReviewRights(db, actor, tournamentId); return true } catch (_) { return false }
}

async function isParticipant(db, tournamentId, teamId) {
  const value = id(tournamentId), team = id(teamId)
  if (!value || !team) return false
  const rows = await readAll(db, 'tournament_teams', { tournamentId: value }, { maxRows: 20000 })
  return rows.some(row => id(row.teamId) === team && !['deleted', 'rejected', 'cancelled', 'withdrawn', 'removed', 'replaced'].includes(id(row.status)))
}

async function loadWindow(db, tournamentId) {
  return getDoc(db.collection(COLLECTIONS.windows), windowId(tournamentId))
}

// 赛事内判定（用户 2026-10-26 已确认：自由签约只面向赛事外球员）。
// “赛事内”指该球员已被列入本赛事的球队名单：名单快照 roster_snapshots 或旧名册 rosters。
// 赛事内球员换队必须走两队转会与主办审核，不能借自由签约绕开。
// 名单读取与字段兼容统一在 shared/roster.cjs，发现页身价展示共用同一实现。

// 自审拦截（用户 2026-10-26 已确认）：审核人与买卖任一方球队存在管理关系时不得审核该笔转会。
// 赛事子账号的 manageTeamIds 来自赛事级 event.teams 授权，不代表某支球队的个人管理关系，
// 因此 staff 身份只按球队负责人字段判定，避免把“整赛事可见”误判成“管着这支球队”。
const TEAM_MANAGER_FIELDS = ['ownerId', 'creatorId', 'createdBy', 'managerUserId', 'managerId', 'headCoachUserId', 'coachUserId']
const TEAM_MANAGER_LIST_FIELDS = ['managerUserIds', 'ownerUserIds', 'adminUserIds']

async function teamManagerUserIds(db, teamId) {
  const team = await getDoc(db.collection('teams'), id(teamId))
  if (!team) return []
  const userIds = TEAM_MANAGER_FIELDS.map(field => id(team[field])).filter(Boolean)
  for (const field of TEAM_MANAGER_LIST_FIELDS) {
    if (Array.isArray(team[field])) userIds.push(...team[field].map(id).filter(Boolean))
    else if (id(team[field])) userIds.push(id(team[field]))
  }
  return userIds
}

async function assertNoSelfReview(db, actor, request) {
  const reviewer = id(actor.userId)
  const sides = [['from', id(request.fromTeamId), '原属球队'], ['to', id(request.toTeamId), '目标球队']]
  for (const [, teamId, label] of sides) {
    if (!teamId) continue
    if (actor.staff !== true && (actor.manageTeamIds || []).includes(teamId)) {
      throw error('TRANSFER_REVIEW_CONFLICT', `审核人管理着${label}，不能审核本笔转会，请换人处理`)
    }
    if (reviewer && (await teamManagerUserIds(db, teamId)).includes(reviewer)) {
      throw error('TRANSFER_REVIEW_CONFLICT', `审核人是${label}负责人，不能审核本笔转会，请换人处理`)
    }
  }
}

// ---------------- 估值与投影 ----------------

// 发起时冻结参考估值；读取失败保留 unavailable，不补 0、不改写历史。
async function frozenValuation(db, actor, playerId) {
  try {
    const stats = await createDataService(db).query(actor, { playerId, mode: 'official' }, { careerView: true, includeHonors: true })
    const value = stats.valuation || {}
    return {
      version: id(value.version) || null,
      computedAt: value.computedAt || null,
      scopeKey: 'career',
      coverage: id(value.coverage) || 'pending',
      total: value.minor ? null : (Number.isFinite(value.total) ? value.total : null),
      money: value.minor ? null : (Number.isFinite(value.money) ? value.money : null),
      tier: value.minor ? '' : id(value.tier),
      minor: value.minor === true,
      estimated: Array.isArray(value.estimated) ? value.estimated : [],
      frozenFor: 'transfer_reference',
      capturedAt: new Date().toISOString()
    }
  } catch (_) {
    return {
      version: null, computedAt: null, scopeKey: 'career', coverage: 'unavailable',
      total: null, money: null, tier: '', minor: null, estimated: [],
      frozenFor: 'transfer_reference', unavailable: true, capturedAt: new Date().toISOString()
    }
  }
}

// 身价展示与批量读取统一在 shared/valuation-view.cjs，市场、球员详情与发现页共用。

function termsView(terms = {}) {
  const loan = terms.loan || null
  const start = loan ? dateValue(loan.startAt) : null
  const end = loan ? dateValue(loan.endAt) : null
  return {
    type: id(terms.type),
    typeText: typeText(terms.type, loan ? loan.kind : ''),
    amountFen: Number(terms.amountFen || 0),
    amountText: (Number(terms.amountFen || 0) / 100).toFixed(2),
    contractMonths: Number(terms.contractMonths || 0) || null,
    loanKind: loan ? id(loan.kind) : '',
    matchId: loan ? id(loan.matchId) : '',
    targetSeasonKey: loan ? id(loan.targetSeasonKey) : '',
    startAt: start ? start.toISOString() : null,
    endAt: end ? end.toISOString() : null,
    expiryMode: loan ? id(loan.expiryMode) : '',
    settlement: 'offline'
  }
}

function requestSummary(row, context = {}) {
  const player = context.players?.get(id(row.playerId))
  const loan = row.offerTerms?.loan || {}
  const waitingMe = row.status === 'negotiating' && (
    (context.teamId && row.toTeamId === context.teamId && row.turn === 'to') ||
    (context.teamId && row.fromTeamId === context.teamId && row.turn === 'from')
  )
  return {
    id: id(row._id || row.id),
    playerId: id(row.playerId),
    playerName: id(row.playerName) || id(player?.name),
    fromTeamId: id(row.fromTeamId),
    fromTeamName: id(row.fromTeamName),
    toTeamId: id(row.toTeamId),
    toTeamName: id(row.toTeamName),
    type: id(row.type),
    typeText: typeText(row.type, loan.kind),
    loanKind: id(loan.kind),
    amountFen: Number(row.offerTerms?.amountFen || 0),
    amountText: (Number(row.offerTerms?.amountFen || 0) / 100).toFixed(2),
    status: id(row.status),
    statusText: STATUS_TEXT[id(row.status)] || id(row.status),
    round: Number(row.round || 0),
    maxRounds: Number(row.maxRounds || POLICY.maxRounds),
    roundText: row.round ? `第${Math.min(Number(row.round), Number(row.maxRounds || POLICY.maxRounds))}／${Number(row.maxRounds || POLICY.maxRounds)}轮` : '',
    turn: id(row.turn),
    waitingMe: Boolean(waitingMe),
    waitingText: row.status === 'negotiating' ? (row.turn === 'from' ? '等待原球队回复' : '等待买方报价') : '',
    createTime: row.createTime || null,
    updateTime: row.updateTime || null,
    brokenReason: id(row.brokenReason),
    cooldownUntil: row.cooldownUntil || null
  }
}

function contractView(contract, { loans = [], player, team, now = new Date() } = {}) {
  const state = contractState(contract, now)
  const active = effectiveTeam({ contract, loans, now })
  const loan = active.loan
  return {
    id: id(contract._id || contract.id),
    playerId: id(contract.playerId),
    playerName: id(player?.name),
    playerCode: id(player?.businessNumber || player?.playerId || player?.playerCode),
    teamId: id(contract.teamId),
    teamName: teamNameOf(team),
    status: id(contract.status),
    state,
    stateText: CONTRACT_STATE_TEXT[state] || state,
    termStatus: id(contract.termStatus) || 'pending_confirmation',
    termPendingRule: id(contract.termPendingRule) || (id(contract.termStatus) === 'confirmed' ? '' : 'Q08'),
    validFrom: contract.validFrom || null,
    validTo: contract.validTo || null,
    source: id(contract.source),
    sourceRequestId: id(contract.sourceRequestId || contract.transferId),
    sourceRenewalId: id(contract.sourceRenewalId),
    renewedByContractId: id(contract.renewedByContractId),
    pendingRenewalId: id(contract.pendingRenewalId),
    effectiveTeamId: active.conflict ? '' : active.teamId,
    effectiveState: active.conflict ? 'conflict' : active.loaned ? 'loaned' : 'contract',
    loan: loan ? {
      id: id(loan._id), kind: id(loan.kind), kindText: LOAN_KIND_TEXT[id(loan.kind)] || '',
      ownerTeamId: id(loan.ownerTeamId), borrowerTeamId: id(loan.borrowerTeamId),
      startAt: loan.startAt || null, endAt: loan.endAt || null, matchId: id(loan.matchId),
      status: id(loan.status), expiryMode: id(loan.expiryMode)
    } : null
  }
}

function renewalView(renewal, { player, team, contract, now = new Date() } = {}) {
  return {
    id: id(renewal._id || renewal.id),
    playerId: id(renewal.playerId),
    playerName: id(player?.name),
    teamId: id(renewal.teamId),
    teamName: teamNameOf(team),
    contractId: id(renewal.contractId),
    status: id(renewal.status),
    proposedFrom: renewal.proposedFrom || null,
    proposedTo: renewal.proposedTo || null,
    note: id(renewal.note),
    notifyStatus: id(renewal.notifyStatus) || 'pending',
    requestedBy: id(renewal.requestedBy),
    requestedAt: renewal.createTime || null,
    decidedAt: renewal.decidedAt || null,
    decisionNote: id(renewal.decisionNote),
    version: Number(renewal.version || 0),
    contractState: contract ? contractState(contract, now) : 'none',
    contractValidTo: contract?.validTo || null
  }
}

// ---------------- 市场与球员资料 ----------------

async function market(db, actor, event = {}) {
  const { synthetic } = await import('../shared/statistics.mjs')
  const state = id(event.state)
  const keyword = id(event.keyword).slice(0, 40).toLowerCase()
  const position = id(event.position)
  const teamId = id(event.teamId)
  const playersRead = await readOptionalAll(db, 'players', {}, { maxRows: 20000 })
  // 市场只关心仍然有效的合同与租借，按状态取范围，不整集合读取历史记录。
  const contractsRead = await readEither(db, COLLECTIONS.contracts, [{ status: 'active' }, { status: 'scheduled' }])
  const loansRead = await readRows(db, COLLECTIONS.loans, { status: 'active' })
  const activeContract = new Map()
  for (const row of contractsRead.rows) {
    if (!['active', 'scheduled'].includes(id(row.status))) continue
    const playerId = id(row.playerId)
    const previous = activeContract.get(playerId)
    activeContract.set(playerId, previous ? { conflict: true } : row)
  }
  const activeLoan = new Map()
  for (const row of loansRead.rows) {
    if (id(row.status) !== 'active') continue
    const playerId = id(row.playerId)
    const previous = activeLoan.get(playerId)
    activeLoan.set(playerId, previous ? { conflict: true } : row)
  }
  if (!playersRead.rows.length) {
    return { success: true, items: [], total: 0, page: 1, pageSize: 20, pageCount: 1, marketState: playersRead.status, notes: [] }
  }
  let rows = playersRead.rows.filter(row => {
    if (synthetic(row)) return false
    if (['deleted', 'archived'].includes(id(row.status))) return false
    return true
  })
  const freeOf = row => !id(row.teamId || row.teamCode)
  if (state === 'free') rows = rows.filter(freeOf)
  if (state === 'contracted') rows = rows.filter(row => !freeOf(row))
  if (keyword) rows = rows.filter(row => [id(row.name), id(row.playerId), id(row.playerCode), id(row.businessNumber)].some(value => value.toLowerCase().includes(keyword)))
  if (position) rows = rows.filter(row => id(row.position) === position)
  if (teamId) rows = rows.filter(row => id(row.teamId || row.teamCode) === teamId || id(activeLoan.get(id(row._id))?.borrowerTeamId) === teamId)
  rows = rows.slice().sort((left, right) => id(left.name).localeCompare(id(right.name), 'zh-CN') || id(left._id).localeCompare(id(right._id)))
  const page = paginate(rows, event)
  const teams = new Map()
  // 本页球员所属球队按 _id 批量读；读取失败向上抛，不能静默当成“没有球队”。
  const teamIds = [...new Set(page.items.map(row => id(row.teamId || row.teamCode)).filter(Boolean))]
  if (teamIds.length) for (const team of await readByIds(db, 'teams', '_id', teamIds, { maxRows: 200 })) teams.set(id(team._id), team)
  const valuations = await latestValuations(db, page.items.map(row => id(row._id)))
  const items = []
  for (const row of page.items) {
    const playerId = id(row._id)
    const contract = activeContract.get(playerId)
    const loan = activeLoan.get(playerId)
    const team = teams.get(id(row.teamId || row.teamCode))
    items.push({
      id: playerId,
      name: id(row.name),
      playerCode: id(row.businessNumber || row.playerId || row.playerCode),
      position: id(row.position),
      teamId: id(row.teamId || row.teamCode),
      teamName: teamNameOf(team),
      contractState: freeOf(row) ? 'free' : 'contracted',
      contractStateText: freeOf(row) ? '自由球员' : '在队',
      contractConflict: Boolean(contract?.conflict),
      loanState: loan ? (loan.conflict ? 'conflict' : 'loaned') : 'none',
      loanBorrowerTeamId: loan && !loan.conflict ? id(loan.borrowerTeamId) : '',
      valuation: valuationView(valuations.get(playerId))
    })
  }
  return {
    success: true,
    items,
    page: page.page,
    pageSize: page.pageSize,
    total: page.total,
    pageCount: page.pageCount,
    marketState: playersRead.status,
    notes: [
      '金额仅向转会双方与主办展示，市场不公开成交金额（Q09 待决）',
      '合同期限未核定的显示合同日期待补齐，不推断自由身'
    ]
  }
}

async function playerDetail(db, actor, event = {}) {
  const playerId = id(event.playerId)
  if (!playerId) throw error('DATA_SCOPE_INVALID', '缺少球员信息')
  const player = await getDoc(db.collection('players'), playerId)
  if (!player || ['deleted'].includes(id(player.status))) throw error('TRANSFER_PLAYER_NOT_FOUND', '球员资料不存在或已删除')
  const contractsRead = await readRows(db, COLLECTIONS.contracts, { playerId })
  const loansRead = await readRows(db, COLLECTIONS.loans, { playerId })
  const contracts = contractsRead.rows.filter(row => id(row.playerId) === playerId)
  const loans = loansRead.rows.filter(row => id(row.playerId) === playerId)
  const activeContracts = contracts.filter(row => ['active', 'scheduled'].includes(id(row.status)))
  const current = activeContracts.length === 1 ? activeContracts[0] : null
  const team = current ? await getDoc(db.collection('teams'), id(current.teamId)) : (id(player.teamId || player.teamCode) ? await getDoc(db.collection('teams'), id(player.teamId || player.teamCode)) : null)
  // 未登记合同时按球员档案当前球队兜底，但仍标 contract_conflict，不能把缺合同当成自由身。
  const effective = effectiveTeam({ contract: current || (id(player.teamId || player.teamCode) ? { teamId: id(player.teamId || player.teamCode) } : null), loans, now: new Date() })
  const teamId = id(event.teamId)
  if (teamId) requireTeamManager(actor, teamId)
  let negotiation = null
  let cooldown = null
  if (teamId) {
    const requests = await readRows(db, COLLECTIONS.requests, { playerId }, 2000)
    for (const row of requests.rows) {
      if (id(row.playerId) !== playerId) continue
      if (id(row.toTeamId) !== teamId) continue
      if (['negotiating', 'pending_review', 'pending_effect'].includes(id(row.status))) {
        negotiation = { id: id(row._id), status: id(row.status), statusText: STATUS_TEXT[id(row.status)] || '' }
        break
      }
    }
    cooldown = await getDoc(db.collection(COLLECTIONS.cooldowns), cooldownId(teamId, playerId))
  }
  const cooldownUntil = dateValue(cooldown?.until)
  const playerName = id(player.name)
  return {
    success: true,
    player: {
      id: playerId,
      name: playerName,
      playerCode: id(player.businessNumber || player.playerId || player.playerCode),
      position: id(player.position),
      status: id(player.status),
      teamId: id(player.teamId || player.teamCode),
      teamName: teamNameOf(team),
      effectiveTeamId: effective.conflict ? '' : effective.teamId,
      effectiveState: effective.conflict ? 'conflict' : effective.loaned ? 'loaned' : 'contracted'
    },
    contract: current ? {
      state: contractState(current, new Date()),
      termStatus: id(current.termStatus) || 'pending_confirmation',
      termPendingRule: id(current.termStatus) === 'confirmed' ? '' : 'Q08',
      validTo: id(current.termStatus) === 'confirmed' ? (current.validTo || null) : null
    } : { state: effective.teamId ? 'contract_conflict' : 'free', termStatus: '', termPendingRule: 'Q08', validTo: null },
    valuation: await latestValuation(db, playerId),
    negotiation,
    cooldown: cooldownUntil && cooldownUntil > new Date() ? { active: true, until: cooldownUntil, untilText: timeText(cooldownUntil), rule: 'max_3_rounds' } : { active: false, until: null, untilText: '', rule: '' },
    notes: [
      '市场资料只含公开字段，不含手机号、证件、保险、人脸或机构经营资料',
      '青少年估值沿用既有可见规则，不展示货币金额（Q09 待决）'
    ]
  }
}

// ---------------- 球队端：我的转会 ----------------

async function myRequests(db, actor, event = {}) {
  const teamId = requireTeamManager(actor, event.teamId)
  const direction = ['in', 'out', 'all'].includes(id(event.direction)) ? id(event.direction) : 'all'
  const tab = ['pending', 'ongoing', 'ended', 'all'].includes(id(event.tab)) ? id(event.tab) : 'all'
  // 本队相关单据分买卖两向等值读取后合并，避免整集合扫描。
  const read = await readEither(db, COLLECTIONS.requests, [{ fromTeamId: teamId }, { toTeamId: teamId }])
  let rows = read.rows.filter(row => id(row.fromTeamId) === teamId || id(row.toTeamId) === teamId)
  if (direction === 'in') rows = rows.filter(row => id(row.fromTeamId) === teamId)
  if (direction === 'out') rows = rows.filter(row => id(row.toTeamId) === teamId)
  const groupOf = row => {
    if (row.status === 'negotiating') return row.turn === (id(row.toTeamId) === teamId ? 'to' : 'from') ? 'pending' : 'ongoing'
    if (['pending_review', 'pending_effect'].includes(id(row.status))) return 'ongoing'
    if (['completed', 'rejected', 'broken', 'withdrawn'].includes(id(row.status))) return 'ended'
    return 'ongoing'
  }
  const totals = {
    pending: rows.filter(row => groupOf(row) === 'pending').length,
    ongoing: rows.filter(row => groupOf(row) === 'ongoing').length,
    ended: rows.filter(row => groupOf(row) === 'ended').length,
    all: rows.length
  }
  if (tab !== 'all') rows = rows.filter(row => groupOf(row) === tab)
  rows = rows.sort((left, right) => new Date(right.updateTime || right.createTime || 0) - new Date(left.updateTime || left.createTime || 0))
  const page = paginate(rows, event)
  const playerIds = [...new Set(page.items.map(row => id(row.playerId)))]
  const players = new Map()
  if (playerIds.length) {
    for (const player of await readByIds(db, 'players', '_id', playerIds, { maxRows: 200 })) players.set(id(player._id), player)
  }
  return {
    success: true,
    teamId,
    direction,
    tab,
    totals,
    items: page.items.map(row => requestSummary(row, { players, teamId })),
    page: page.page,
    pageSize: page.pageSize,
    total: page.total,
    pageCount: page.pageCount,
    requestsState: read.status
  }
}

async function requestDetail(db, actor, event = {}) {
  const requestIdValue = id(event.requestId)
  if (!requestIdValue) throw error('TRANSFER_NOT_FOUND', '缺少转会单编号')
  const request = await getDoc(db.collection(COLLECTIONS.requests), requestIdValue)
  if (!request) throw error('TRANSFER_NOT_FOUND', '转会单不存在')
  const teamId = id(event.teamId)
  if (teamId) requireTeamManager(actor, teamId)
  const side = teamId && id(request.toTeamId) === teamId ? 'to' : teamId && id(request.fromTeamId) === teamId ? 'from' : ''
  const admin = !side && await canReview(db, actor, id(request.tournamentId))
  if (!side && !admin) throw error('DATA_FORBIDDEN', '无权查看该转会单')
  const offers = []
  for (let version = 1; version <= MAX_OFFERS; version += 1) {
    const offer = await getDoc(db.collection(COLLECTIONS.offers), offerId(requestIdValue, version))
    if (!offer) continue
    offers.push({
      id: id(offer._id), version: Number(offer.version || version), by: id(offer.by),
      byText: id(offer.by) === 'to' ? '买方球队' : '原球队',
      terms: termsView(offer.terms || {}),
      note: id(offer.note), createTime: offer.createTime || null
    })
  }
  const events = []
  for (let seq = 1; seq <= Math.min(Number(request.eventSeq || 0), MAX_EVENTS); seq += 1) {
    const row = await getDoc(db.collection(COLLECTIONS.events), eventId(requestIdValue, seq))
    if (!row) continue
    events.push({
      seq: Number(row.seq || seq), action: id(row.action), actorSide: id(row.actorSide),
      fromStatus: id(row.fromStatus), toStatus: id(row.toStatus),
      round: Number(row.round || 0), offerVersion: Number(row.offerVersion || 0),
      detail: row.detail || {}, at: row.at || null
    })
  }
  const agreedOffer = offers.find(row => row.version === Number(request.agreedOfferVersion || 0)) || null
  const viewerSide = side || 'admin'
  const canAct = side && request.status === 'negotiating'
  return {
    success: true,
    request: {
      ...requestSummary(request, { teamId }),
      tournamentId: id(request.tournamentId),
      seasonKey: id(request.seasonKey),
      orgId: id(request.orgId),
      sourceLoanId: id(request.sourceLoanId),
      buyerConfirmedAt: request.buyerConfirmedAt || null,
      sellerConfirmedAt: request.sellerConfirmedAt || null,
      agreedOfferVersion: Number(request.agreedOfferVersion || 0),
      review: request.review || null,
      handover: request.handover || null,
      valuationSnapshot: request.valuationSnapshot || null,
      version: Number(request.version || 0)
    },
    currentOffer: offers.filter(row => row.version === Number(request.currentOfferVersion || 0))[0] || null,
    agreedOffer,
    offers,
    events,
    viewerSide,
    canAccept: Boolean(canAct && side === 'from' && request.turn === 'from'),
    canCounter: Boolean(canAct && ((side === 'to' && request.turn === 'to') || (side === 'from' && request.turn === 'from'))),
    canReject: Boolean(canAct && side === 'from' && request.turn === 'from'),
    canWithdraw: Boolean(canAct && side === 'to'),
    canReview: Boolean(admin && request.status === 'pending_review'),
    expectedOfferVersion: Number(request.currentOfferVersion || 0)
  }
}

// ---------------- 球队端：发起与谈判 ----------------

async function initiationContext(db, actor, event) {
  const requestKey = id(event.requestKey)
  if (!/^[A-Za-z0-9_-]{12,100}$/.test(requestKey)) throw error('TRANSFER_KEY_REQUIRED', '转会请求标识无效，请重新提交')
  const toTeamId = requireTeamManager(actor, event.teamId)
  const playerId = id(event.playerId)
  if (!playerId) throw error('TRANSFER_PLAYER_REQUIRED', '请选择球员')
  const tournamentId = id(event.tournamentId)
  if (!tournamentId) throw error('TRANSFER_TOURNAMENT_REQUIRED', '请选择办理转会所在赛事')
  const terms = normalizeTerms(event.terms || event)
  const player = await getDoc(db.collection('players'), playerId)
  if (!player || ['deleted'].includes(id(player.status))) throw error('TRANSFER_PLAYER_NOT_FOUND', '球员资料不存在或已删除')
  const fromTeamId = id(player.teamId || player.teamCode)
  if (!fromTeamId) throw error('TRANSFER_PLAYER_FREE', '该球员已无所属球队，请走自由球员签约')
  if (id(event.fromTeamId) && id(event.fromTeamId) !== fromTeamId) throw error('TRANSFER_PLAYER_CONFLICT', '球员归属已变化，请刷新')
  if (fromTeamId === toTeamId) throw error('TRANSFER_TEAM_INVALID', '不能向本队球员发起转会')
  const tournament = await getDoc(db.collection('tournaments'), tournamentId)
  if (!tournament) throw error('DATA_FORBIDDEN', '赛事不存在或无权访问')
  const orgId = id(tournament.orgId || tournament.organizationId)
  const window = await loadWindow(db, tournamentId)
  assertWindowOpen(window)
  if (!await isParticipant(db, tournamentId, toTeamId)) throw error('TRANSFER_TEAM_NOT_PARTICIPATING', '本队未参加该赛事，暂不支持转会')
  if (!await isParticipant(db, tournamentId, fromTeamId)) {
    if (POLICY.requireSameTournament) throw pending('Q01', '两队未参加同一赛事')
    throw error('TRANSFER_TEAM_NOT_PARTICIPATING', '原球队未参加该赛事，暂不支持转会')
  }
  const fromTeam = await getDoc(db.collection('teams'), fromTeamId)
  const toTeam = await getDoc(db.collection('teams'), toTeamId)
  if (!fromTeam || !toTeam) throw error('TRANSFER_TEAM_INVALID', '球队信息不存在或已删除')
  if (!orgOf(fromTeam) || orgOf(fromTeam) !== orgOf(toTeam)) throw error('TRANSFER_CROSS_ORG_REQUIRES_REVIEW', '跨机构转会需先完成双方授权与隐私资料交接')
  const loansRead = await readRows(db, COLLECTIONS.loans, { playerId }, 2000)
  const playerLoans = loansRead.rows.filter(row => id(row.playerId) === playerId && id(row.status) === 'active')
  let sourceLoan = null
  if (terms.type === 'loan_permanent' || terms.type === 'loan_renewal') {
    sourceLoan = await getDoc(db.collection(COLLECTIONS.loans), id(event.sourceLoanId))
    if (!sourceLoan || id(sourceLoan.playerId) !== playerId) throw error('TRANSFER_LOAN_NOT_FOUND', '租借记录不存在或已变化')
    if (id(sourceLoan.status) !== 'active') throw error('TRANSFER_STATE_CONFLICT', '该租借已结束，请重新核验')
    if (id(sourceLoan.ownerTeamId) !== fromTeamId || id(sourceLoan.borrowerTeamId) !== toTeamId) throw error('TRANSFER_LOAN_CONFLICT', '租借双方与当前关系不一致')
    if (id(sourceLoan.kind) !== 'season_full') throw pending('Q05', '只有整赛季租借可以续租或转永久')
    if (terms.type === 'loan_renewal') {
      if (terms.loan.targetSeasonKey === id(sourceLoan.seasonKey)) throw pending('Q05', '续租须对应下一赛季')
      if (!terms.loan.startAt && dateValue(sourceLoan.endAt)) terms.loan.startAt = dateValue(sourceLoan.endAt)
    }
  } else if (playerLoans.length) {
    throw error('TRANSFER_LOAN_ACTIVE', '球员处于租借期，请走整赛季租借续租或转永久')
  }
  const cooldown = await getDoc(db.collection(COLLECTIONS.cooldowns), cooldownId(toTeamId, playerId))
  const until = dateValue(cooldown?.until)
  if (until && until > new Date()) throw error('TRANSFER_COOLDOWN_ACTIVE', `该球员在 ${timeText(until)} 前不可再次发起`)
  const requestsRead = await readRows(db, COLLECTIONS.requests, { playerId }, 2000)
  const retryId = hash(actor.userId + ':' + requestKey)
  // 同一账号用同一请求标识重试属于幂等重放，交给事务内按确定性编号返回原单据；
  // 其他进行中的同队同球员申请仍然阻断。
  const duplicate = requestsRead.rows.find(row => id(row.playerId) === playerId && id(row.toTeamId) === toTeamId &&
    ['negotiating', 'pending_review', 'pending_effect'].includes(id(row.status)) && id(row._id) !== retryId)
  if (duplicate) throw error('TRANSFER_DUPLICATE', '本队与该球员已有进行中的转会单')
  return { requestKey, playerId, player, fromTeamId, toTeamId, tournamentId, orgId, seasonKey: id(window.seasonKey), terms, sourceLoan, fromTeam, toTeam }
}

async function initiate(db, actor, event = {}) {
  const context = await initiationContext(db, actor, event)
  const now = new Date()
  const requestId = hash(actor.userId + ':' + context.requestKey)
  const valuationSnapshot = await frozenValuation(db, actor, context.playerId)
  await ensureCollections(db, [COLLECTIONS.requests, COLLECTIONS.offers, COLLECTIONS.events, COLLECTIONS.contracts, COLLECTIONS.loans, COLLECTIONS.cooldowns])
  return db.runTransaction(async transaction => {
    const existing = await getDoc(transaction.collection(COLLECTIONS.requests), requestId)
    if (existing) {
      const same = id(existing.playerId) === context.playerId && id(existing.fromTeamId) === context.fromTeamId && id(existing.toTeamId) === context.toTeamId
      if (!same) throw error('TRANSFER_KEY_CONFLICT', '请求标识已用于其他转会')
      return { success: true, id: requestId, status: id(existing.status), idempotent: true }
    }
    const player = await getDoc(transaction.collection('players'), context.playerId)
    if (!player || id(player.teamId || player.teamCode) !== context.fromTeamId) throw error('TRANSFER_PLAYER_CONFLICT', '球员归属已变化，请刷新后重试')
    const nextOfferId = offerId(requestId, 1)
    const data = {
      requestKey: context.requestKey,
      playerId: context.playerId,
      playerName: id(player.name),
      fromTeamId: context.fromTeamId,
      fromTeamName: teamNameOf(context.fromTeam),
      toTeamId: context.toTeamId,
      toTeamName: teamNameOf(context.toTeam),
      tournamentId: context.tournamentId,
      seasonKey: context.seasonKey,
      orgId: context.orgId,
      sourceLoanId: id(context.sourceLoan?._id),
      ...buildRequest(null, nextOfferId, now, context.terms.type),
      offerTerms: context.terms,
      valuationSnapshot,
      eventSeq: 1,
      createdBy: id(actor.userId),
      createTime: now
    }
    await transaction.collection(COLLECTIONS.requests).doc(requestId).set({ data })
    await transaction.collection(COLLECTIONS.offers).doc(nextOfferId).set({ data: { requestId, version: 1, by: 'to', terms: context.terms, note: id(event.note).slice(0, 200), createdBy: id(actor.userId), immutable: true, createTime: now } })
    await transaction.collection(COLLECTIONS.events).doc(eventId(requestId, 1)).set({ data: {
      requestId, seq: 1, subject: 'request', action: 'request_created', actorUserId: id(actor.userId), actorSide: 'to',
      fromStatus: '', toStatus: 'negotiating', round: 1, offerVersion: 1, at: now,
      detail: { type: context.terms.type, loanKind: context.terms.loan?.kind || '', amountFen: context.terms.amountFen, fromTeamId: context.fromTeamId, toTeamId: context.toTeamId, tournamentId: context.tournamentId }
    } })
    return { success: true, id: requestId, status: 'negotiating', round: 1, expectedOfferVersion: 1 }
  })
}

async function submitOffer(db, actor, event = {}) {
  const requestIdValue = id(event.requestId)
  if (!requestIdValue) throw error('TRANSFER_NOT_FOUND', '缺少转会单编号')
  const teamId = requireTeamManager(actor, event.teamId)
  const request = await getDoc(db.collection(COLLECTIONS.requests), requestIdValue)
  if (!request) throw error('TRANSFER_NOT_FOUND', '转会单不存在')
  if (id(request.toTeamId) !== teamId) throw error('DATA_FORBIDDEN', '只有买方球队可以提交报价')
  const expected = requiredVersion(event.expectedVersion, '报价版本')
  if (expected !== Number(request.currentOfferVersion || 0)) throw error('TRANSFER_VERSION_CONFLICT', '报价已更新，请读取最新条款后再提交')
  const previous = await getDoc(db.collection(COLLECTIONS.offers), offerId(requestIdValue, Number(request.currentOfferVersion || 0)))
  const terms = normalizeTerms({ ...(event.terms || event), type: id(event.terms?.type || request.type) })
  assertNoAmountChange(previous?.terms, terms)
  const now = new Date()
  const version = Number(request.currentOfferVersion || 0) + 1
  const nextOfferId = offerId(requestIdValue, version)
  return db.runTransaction(async transaction => {
    const current = await getDoc(transaction.collection(COLLECTIONS.requests), requestIdValue)
    if (!current) throw error('TRANSFER_NOT_FOUND', '转会单不存在')
    if (Number(current.currentOfferVersion || 0) !== expected) throw error('TRANSFER_VERSION_CONFLICT', '报价已更新，请读取最新条款后再提交')
    const patch = buyerOfferPatch(current, nextOfferId, version, now)
    await transaction.collection(COLLECTIONS.offers).doc(nextOfferId).set({ data: { requestId: requestIdValue, version, by: 'to', terms, note: id(event.note).slice(0, 200), createdBy: id(actor.userId), immutable: true, createTime: now } })
    const seq = Number(current.eventSeq || 0) + 1
    await transaction.collection(COLLECTIONS.requests).doc(requestIdValue).update({ data: { ...patch, offerTerms: terms, eventSeq: seq } })
    await transaction.collection(COLLECTIONS.events).doc(eventId(requestIdValue, seq)).set({ data: {
      requestId: requestIdValue, seq, subject: 'request', action: 'offer_submitted', actorUserId: id(actor.userId), actorSide: 'to',
      fromStatus: id(current.status), toStatus: id(patch.status), round: Number(patch.round || current.round), offerVersion: version, at: now,
      detail: { amountFen: terms.amountFen, loanKind: terms.loan?.kind || '' }
    } })
    return { success: true, id: requestIdValue, status: id(patch.status), offerVersion: version, round: Number(patch.round || 0), turn: id(patch.turn) }
  })
}

async function respondOffer(db, actor, event = {}, decision = 'accept') {
  const requestIdValue = id(event.requestId)
  if (!requestIdValue) throw error('TRANSFER_NOT_FOUND', '缺少转会单编号')
  const teamId = requireTeamManager(actor, event.teamId)
  const request = await getDoc(db.collection(COLLECTIONS.requests), requestIdValue)
  if (!request) throw error('TRANSFER_NOT_FOUND', '转会单不存在')
  if (id(request.fromTeamId) !== teamId) throw error('DATA_FORBIDDEN', '只有原球队可以回应报价')
  const expected = requiredVersion(event.expectedOfferVersion, '报价版本')
  if (expected !== Number(request.currentOfferVersion || 0)) throw error('TRANSFER_VERSION_CONFLICT', '报价已更新，请读取最新条款后再回应')
  const now = new Date()
  const note = id(event.note).slice(0, 200)
  let counterTerms = null
  if (decision === 'counter') {
    counterTerms = normalizeTerms({ ...(event.terms || {}), type: id(event.terms?.type || request.type) })
    const previous = await getDoc(db.collection(COLLECTIONS.offers), offerId(requestIdValue, Number(request.currentOfferVersion || 0)))
    assertNoAmountChange(previous?.terms, counterTerms)
  }
  const nextVersion = Number(request.currentOfferVersion || 0) + (decision === 'counter' ? 1 : 0)
  return db.runTransaction(async transaction => {
    const current = await getDoc(transaction.collection(COLLECTIONS.requests), requestIdValue)
    if (!current) throw error('TRANSFER_NOT_FOUND', '转会单不存在')
    if (Number(current.currentOfferVersion || 0) !== expected) throw error('TRANSFER_VERSION_CONFLICT', '报价已更新，请读取最新条款后再回应')
    const patch = sellerResponsePatch(current, { decision: decision === 'counter' ? 'counter' : decision, offerId: offerId(requestIdValue, nextVersion), version: nextVersion, now })
    const seq = Number(current.eventSeq || 0) + 1
    const update = { ...patch, eventSeq: seq }
    if (decision === 'counter' && counterTerms) {
      update.offerTerms = counterTerms
      await transaction.collection(COLLECTIONS.offers).doc(offerId(requestIdValue, nextVersion)).set({ data: { requestId: requestIdValue, version: nextVersion, by: 'from', terms: counterTerms, note, createdBy: id(actor.userId), immutable: true, createTime: now } })
    }
    if (id(patch.status) === 'broken' && patch.cooldownUntil) {
      await transaction.collection(COLLECTIONS.cooldowns).doc(cooldownId(id(current.toTeamId), id(current.playerId))).set({ data: { playerId: id(current.playerId), teamId: id(current.toTeamId), requestId: requestIdValue, until: patch.cooldownUntil, reason: id(patch.brokenReason), updateTime: now } })
    }
    await transaction.collection(COLLECTIONS.requests).doc(requestIdValue).update({ data: update })
    await transaction.collection(COLLECTIONS.events).doc(eventId(requestIdValue, seq)).set({ data: {
      requestId: requestIdValue, seq, subject: 'request', action: `offer_${decision}`, actorUserId: id(actor.userId), actorSide: 'from',
      fromStatus: id(current.status), toStatus: id(patch.status), round: Number(patch.round || current.round), offerVersion: decision === 'counter' ? nextVersion : Number(current.currentOfferVersion || 0), at: now,
      detail: { amountFen: counterTerms?.amountFen || 0, note, brokenReason: id(patch.brokenReason) }
    } })
    return { success: true, id: requestIdValue, status: id(patch.status), offerVersion: Number(patch.currentOfferVersion || current.currentOfferVersion || 0), turn: id(patch.turn), cooldownUntil: patch.cooldownUntil || null }
  })
}
const acceptOffer = (db, actor, event) => respondOffer(db, actor, event, 'accept')
const rejectOffer = (db, actor, event) => respondOffer(db, actor, event, 'reject')
const counterOffer = (db, actor, event) => respondOffer(db, actor, event, 'counter')

async function withdraw(db, actor, event = {}) {
  const requestIdValue = id(event.requestId)
  if (!requestIdValue) throw error('TRANSFER_NOT_FOUND', '缺少转会单编号')
  const teamId = requireTeamManager(actor, event.teamId)
  const now = new Date()
  return db.runTransaction(async transaction => {
    const current = await getDoc(transaction.collection(COLLECTIONS.requests), requestIdValue)
    if (!current) throw error('TRANSFER_NOT_FOUND', '转会单不存在')
    if (id(current.toTeamId) !== teamId) throw error('DATA_FORBIDDEN', '只有发起方可以撤回')
    const expected = requiredVersion(event.expectedVersion, '报价版本')
    if (expected !== Number(current.currentOfferVersion || 0)) throw error('TRANSFER_VERSION_CONFLICT', '报价已更新，请读取最新条款后再撤回')
    const patch = withdrawPatch(current, now)
    const seq = Number(current.eventSeq || 0) + 1
    await transaction.collection(COLLECTIONS.requests).doc(requestIdValue).update({ data: { ...patch, eventSeq: seq } })
    await transaction.collection(COLLECTIONS.events).doc(eventId(requestIdValue, seq)).set({ data: {
      requestId: requestIdValue, seq, subject: 'request', action: 'withdrawn', actorUserId: id(actor.userId), actorSide: 'to',
      fromStatus: id(current.status), toStatus: 'withdrawn', round: Number(current.round || 0), offerVersion: Number(current.currentOfferVersion || 0), at: now, detail: {}
    } })
    return { success: true, id: requestIdValue, status: 'withdrawn' }
  })
}

// ---------------- 主办审核与归属交接 ----------------

async function prepareHandover(db, request, offer) {
  const now = new Date()
  const player = await getDoc(db.collection('players'), request.playerId)
  if (!player || id(player.status) === 'deleted') throw error('TRANSFER_PLAYER_NOT_FOUND', '球员资料不存在或已删除')
  if (id(player.teamId || player.teamCode) !== id(request.fromTeamId)) throw error('TRANSFER_PLAYER_CONFLICT', '球员归属已变化，请刷新后重新提交')
  const fromTeam = await getDoc(db.collection('teams'), id(request.fromTeamId))
  const toTeam = await getDoc(db.collection('teams'), id(request.toTeamId))
  if (!fromTeam || !toTeam) throw error('TRANSFER_TEAM_INVALID', '球队信息不存在或已删除')
  const contractsRead = await readRows(db, COLLECTIONS.contracts, { playerId: id(request.playerId) }, 500)
  const contracts = contractsRead.rows.filter(row => id(row.playerId) === id(request.playerId) && ['active', 'scheduled'].includes(id(row.status)))
  const loansRead = await readRows(db, COLLECTIONS.loans, { playerId: id(request.playerId) }, 500)
  const loans = loansRead.rows.filter(row => id(row.playerId) === id(request.playerId) && ['active', 'scheduled'].includes(id(row.status)))
  const type = id(request.type)
  const sourceLoan = id(request.sourceLoanId) ? loans.find(row => id(row._id) === id(request.sourceLoanId)) || await getDoc(db.collection(COLLECTIONS.loans), id(request.sourceLoanId)) : null
  if (type === 'loan') {
    if (loans.some(row => id(row.status) === 'active')) throw error('TRANSFER_LOAN_ACTIVE', '球员已有有效租借，不能重复租借')
  } else if (type === 'permanent') {
    if (loans.some(row => id(row.status) === 'active')) throw error('TRANSFER_LOAN_ACTIVE', '球员处于租借期，请走整赛季租借后续流程')
  } else {
    if (!sourceLoan) throw error('TRANSFER_LOAN_NOT_FOUND', '租借记录不存在')
    if (id(sourceLoan.status) !== 'active') throw error('TRANSFER_STATE_CONFLICT', '原租借已结束，请重新核验')
  }
  let match = null
  if (id(offer?.terms?.loan?.kind) === 'single_match') {
    match = await getDoc(db.collection('matches'), id(offer.terms.loan.matchId))
    if (!match) throw error('TRANSFER_MATCH_NOT_FOUND', '租借比赛不存在或已删除')
    if (id(match.tournamentId) !== id(request.tournamentId)) throw error('TRANSFER_MATCH_INVALID', '比赛不属于当前赛事')
    const { resultState } = await import('../shared/statistics.mjs')
    if (resultState(match, { requireOriginEvidence: false }) === 'excluded') throw error('TRANSFER_MATCH_CLOSED', '该比赛已取消或无效，不能办理单场租借')
  }
  return { player, fromTeam, toTeam, contracts, loans, sourceLoan, match, now }
}

async function handover(transaction, request, offer, prepared, actor) {
  const now = prepared.now
  const type = id(request.type)
  const permanentLike = type === 'permanent' || type === 'loan_permanent'
  const targetContractTeamId = id(request.toTeamId)
  const result = { status: 'done', completedAt: now, contractId: '', loanId: '', membershipId: '', closedMembershipId: '', historyIds: [] }

  // 校验关键文档仍与事务外预读一致；任何冲突整体回滚，不留半成品归属。
  const player = await getDoc(transaction.collection('players'), id(request.playerId))
  if (!player || id(player.teamId || player.teamCode) !== id(request.fromTeamId)) throw error('TRANSFER_PLAYER_CONFLICT', '球员归属已变化，请刷新后重新提交')
  for (const contract of prepared.contracts) {
    const current = await getDoc(transaction.collection(COLLECTIONS.contracts), id(contract._id))
    if (!current || id(current.status) !== id(contract.status)) throw error('TRANSFER_CONTRACT_CONFLICT', '合同状态已变化，请刷新后重新提交')
  }
  for (const loan of prepared.loans) {
    const current = await getDoc(transaction.collection(COLLECTIONS.loans), id(loan._id))
    if (!current || id(current.status) !== id(loan.status)) throw error('TRANSFER_LOAN_CONFLICT', '租借状态已变化，请刷新后重新提交')
  }

  if (permanentLike) {
    const collection = transaction.collection('player_team_memberships')
    const currentMembershipId = id(player.currentMembershipId)
    const currentMembership = currentMembershipId ? await getDoc(collection, currentMembershipId) : null
    if (currentMembership && (id(currentMembership.playerId) !== id(request.playerId) || id(currentMembership.teamId) !== id(request.fromTeamId) || id(currentMembership.status) === 'ended' || currentMembership.validTo)) {
      throw error('TRANSFER_MEMBERSHIP_CONFLICT', '原球队成员关系冲突，请先核验')
    }
    const closedMembershipId = currentMembershipId || hash('legacy:' + request.playerId + ':' + request.fromTeamId + ':' + request._id)
    const closedRow = currentMembership || { playerId: id(request.playerId), teamId: id(request.fromTeamId), orgId: id(request.orgId), validFrom: null, startTimeUnknown: true, source: 'legacy_transfer' }
    await collection.doc(closedMembershipId).set({ data: { ...closedRow, status: 'ended', validTo: now, transferId: request._id, updateTime: now } })
    const membershipId = hash('membership:' + request._id)
    await collection.doc(membershipId).set({ data: { playerId: id(request.playerId), teamId: targetContractTeamId, orgId: id(request.orgId), validFrom: now, validTo: null, status: 'active', transferId: request._id, source: 'transfer_request', createTime: now, updateTime: now } })
    result.membershipId = membershipId
    result.closedMembershipId = closedMembershipId

    const historyCollection = transaction.collection('player_team_history')
    const currentHistoryId = id(player.currentHistoryId)
    const currentHistory = currentHistoryId ? await getDoc(historyCollection, currentHistoryId) : null
    if (currentHistory && (id(currentHistory.playerId) !== id(request.playerId) || id(currentHistory.teamId) !== id(request.fromTeamId))) throw error('TRANSFER_HISTORY_CONFLICT', '原球队历史关系冲突，请先核验')
    if (currentHistory?.leftAt) throw error('TRANSFER_HISTORY_CONFLICT', '原球队历史关系已结束，请先核验')
    const closedHistoryId = currentHistoryId || hash('history-close:' + request._id)
    await historyCollection.doc(closedHistoryId).set({ data: { ...(currentHistory || { playerId: id(request.playerId), teamId: id(request.fromTeamId), orgId: id(request.orgId), joinedAt: null, joinSource: 'legacy', createTime: now }), leftAt: now, leftSource: type === 'loan_permanent' ? 'loan_permanent_transfer' : 'transfer_out', transferId: request._id, updateTime: now } })
    const historyId = hash('history-open:' + request._id)
    await historyCollection.doc(historyId).set({ data: { playerId: id(request.playerId), teamId: targetContractTeamId, orgId: id(request.orgId), teamName: teamNameOf(prepared.toTeam), joinedAt: now, leftAt: null, joinSource: type === 'loan_permanent' ? 'loan_permanent_in' : 'transfer_in', transferId: request._id, createTime: now, updateTime: now } })
    result.historyIds = [closedHistoryId, historyId]

    await transaction.collection('players').doc(id(request.playerId)).update({ data: {
      teamId: targetContractTeamId, teamCode: targetContractTeamId, teamName: teamNameOf(prepared.toTeam),
      currentMembershipId: membershipId, currentHistoryId: historyId, joinedTeamAt: now, status: 'active', transferId: request._id, updateTime: now
    } })
    for (const teamIdValue of [id(request.fromTeamId), targetContractTeamId]) {
      await transaction.collection('teams').doc(teamIdValue).update({ data: { rosterCountStatus: 'needs_refresh', updateTime: now } })
    }
    // 原合同全部结束，新队建立一年合同（起算日 Q08 未定，标待核定）。
    for (const contract of prepared.contracts) {
      await transaction.collection(COLLECTIONS.contracts).doc(id(contract._id)).update({ data: { status: 'ended', endReason: type === 'loan_permanent' ? 'permanent_transfer' : 'transferred', endedAt: now, transferId: request._id, updateTime: now } })
    }
    const contractId = hash('contract:' + request._id)
    const term = contractTerm(now)
    await transaction.collection(COLLECTIONS.contracts).doc(contractId).set({ data: {
      playerId: id(request.playerId), teamId: targetContractTeamId, orgId: id(request.orgId),
      status: 'active', ...term, source: type === 'loan_permanent' ? 'loan_permanent' : 'transfer',
      sourceRequestId: request._id, mayRenew: true, createTime: now, updateTime: now
    } })
    result.contractId = contractId
    if (type === 'loan_permanent' && prepared.sourceLoan) {
      await transaction.collection(COLLECTIONS.loans).doc(id(prepared.sourceLoan._id)).update({ data: { status: 'ended', endReason: 'permanent_transfer', endedAt: now, transferId: request._id, updateTime: now } })
    }
  } else {
    // 租借：原球队关系与合同保留，只新增借入效力；players.teamId 不变，历史成绩与名单不迁移。
    if (prepared.sourceLoan) {
      const current = await getDoc(transaction.collection(COLLECTIONS.loans), id(prepared.sourceLoan._id))
      if (!current || id(current.status) !== 'active') throw error('TRANSFER_LOAN_CONFLICT', '原租借已结束，请重新核验')
      await transaction.collection(COLLECTIONS.loans).doc(id(prepared.sourceLoan._id)).update({ data: { status: 'ended', endReason: 'renewed', endedAt: now, supersededByLoanId: hash('loan:' + request._id), updateTime: now } })
    }
    const loanId = hash('loan:' + request._id)
    const loan = offer?.terms?.loan || {}
    const start = dateValue(loan.startAt) || now
    await transaction.collection(COLLECTIONS.loans).doc(loanId).set({ data: {
      playerId: id(request.playerId), requestId: request._id,
      ownerTeamId: id(request.fromTeamId), borrowerTeamId: id(request.toTeamId),
      tournamentId: id(request.tournamentId), seasonKey: id(request.seasonKey),
      kind: id(loan.kind), matchId: id(loan.matchId), expiryMode: id(loan.expiryMode),
      startAt: start, endAt: dateValue(loan.endAt),
      status: start > now ? 'scheduled' : 'active', endReason: '', expiryState: '',
      createTime: now, updateTime: now
    } })
    result.loanId = loanId
  }
  return result
}

async function review(db, actor, event = {}) {
  const requestIdValue = id(event.requestId)
  if (!requestIdValue) throw error('TRANSFER_NOT_FOUND', '缺少转会单编号')
  const decision = id(event.decision)
  if (!['approve', 'reject'].includes(decision)) throw error('TRANSFER_REVIEW_INVALID', '请选择通过或拒绝')
  const request = await getDoc(db.collection(COLLECTIONS.requests), requestIdValue)
  if (!request) throw error('TRANSFER_NOT_FOUND', '转会单不存在')
  await requireReviewRights(db, actor, id(request.tournamentId))
  if (request.status === 'completed' && decision === 'approve') {
    return { success: true, id: requestIdValue, status: 'completed', idempotent: true }
  }
  // 幂等重放不受自审拦截影响；其余审核决定一律先校验审核人是否与买卖任一方球队存在管理关系。
  await assertNoSelfReview(db, actor, request)
  if (request.status !== 'pending_review') throw error('TRANSFER_STATE_CONFLICT', '该转会单不在待审核状态')
  const expected = requiredVersion(event.expectedOfferVersion, '确认条款版本')
  if (expected !== Number(request.agreedOfferVersion || 0)) throw error('TRANSFER_VERSION_CONFLICT', '条款已更新，请刷新后再审核')
  const offer = await getDoc(db.collection(COLLECTIONS.offers), offerId(requestIdValue, Number(request.agreedOfferVersion || 0)))
  if (!offer) throw error('TRANSFER_VERSION_CONFLICT', '最终条款版本缺失，请重新审核')
  const prepared = decision === 'approve' ? await prepareHandover(db, request, offer) : null
  const now = new Date()
  await ensureCollections(db, [COLLECTIONS.contracts, COLLECTIONS.loans])
  return db.runTransaction(async transaction => {
    const current = await getDoc(transaction.collection(COLLECTIONS.requests), requestIdValue)
    if (!current) throw error('TRANSFER_NOT_FOUND', '转会单不存在')
    if (current.status === 'completed' && decision === 'approve') return { success: true, id: requestIdValue, status: 'completed', idempotent: true }
    const patch = reviewDecisionPatch(current, { decision, reason: id(event.reason).slice(0, 200), reviewer: actor.userId, now })
    let handoverResult = null
    if (decision === 'approve') {
      handoverResult = await handover(transaction, current, offer, prepared, actor)
      patch.handover = handoverResult
      patch.contractId = handoverResult.contractId
      patch.loanId = handoverResult.loanId
    }
    const seq = Number(current.eventSeq || 0) + 1
    await transaction.collection(COLLECTIONS.requests).doc(requestIdValue).update({ data: { ...patch, eventSeq: seq } })
    await transaction.collection(COLLECTIONS.events).doc(eventId(requestIdValue, seq)).set({ data: {
      requestId: requestIdValue, seq, subject: 'request', action: decision === 'approve' ? 'review_approved' : 'review_rejected',
      actorUserId: id(actor.userId), actorSide: 'admin', fromStatus: id(current.status), toStatus: id(patch.status),
      round: Number(current.round || 0), offerVersion: Number(current.agreedOfferVersion || 0), at: now,
      detail: { reason: id(event.reason).slice(0, 200), contractId: handoverResult?.contractId || '', loanId: handoverResult?.loanId || '' }
    } })
    return { success: true, id: requestIdValue, status: id(patch.status), handover: handoverResult }
  })
}

// ---------------- 自由球员签约 ----------------

async function freeAgentContext(db, actor, event = {}) {
  const requestKey = id(event.requestKey)
  if (!/^[A-Za-z0-9_-]{12,100}$/.test(requestKey)) throw error('TRANSFER_KEY_REQUIRED', '签约请求标识无效，请重新提交')
  const teamId = requireTeamManager(actor, event.teamId)
  const playerId = id(event.playerId)
  if (!playerId) throw error('TRANSFER_PLAYER_REQUIRED', '请选择球员')
  const player = await getDoc(db.collection('players'), playerId)
  if (!player || ['deleted', 'archived'].includes(id(player.status))) throw error('TRANSFER_PLAYER_NOT_FOUND', '球员资料不存在或不可签约')
  if (id(player.teamId || player.teamCode)) throw error('TRANSFER_PLAYER_NOT_FREE', '该球员已有所属球队，请走两队转会流程')
  const contractsRead = await readRows(db, COLLECTIONS.contracts, { playerId }, 500)
  if (contractsRead.rows.some(row => id(row.playerId) === playerId && ['active', 'scheduled'].includes(id(row.status)))) throw error('TRANSFER_PLAYER_NOT_FREE', '该球员仍有有效合同，不能直接签约')
  const loansRead = await readRows(db, COLLECTIONS.loans, { playerId }, 500)
  if (loansRead.rows.some(row => id(row.playerId) === playerId && id(row.status) === 'active')) throw error('TRANSFER_LOAN_ACTIVE', '该球员处于租借期，不能直接签约')
  let tournamentId = id(event.tournamentId)
  if (!tournamentId) {
    const relations = await readAll(db, 'tournament_teams', { teamId }, { maxRows: 2000 })
    const candidates = []
    for (const relationId of [...new Set(relations.filter(row => !['deleted', 'rejected', 'cancelled', 'withdrawn', 'removed', 'replaced'].includes(id(row.status))).map(row => id(row.tournamentId)))]) {
      const window = await loadWindow(db, relationId)
      if (windowState(window) === 'open') candidates.push(relationId)
    }
    if (!candidates.length) throw error('TRANSFER_WINDOW_CLOSED', '当前没有开放的转会窗口')
    if (candidates.length > 1) throw error('TRANSFER_TOURNAMENT_REQUIRED', '本队有多个开放窗口的赛事，请选择签约赛事')
    tournamentId = candidates[0]
  } else if (!await isParticipant(db, tournamentId, teamId)) {
    throw error('TRANSFER_TEAM_NOT_PARTICIPATING', '本队未参加该赛事，暂不支持签约')
  }
  const tournament = await getDoc(db.collection('tournaments'), tournamentId)
  if (!tournament) throw error('DATA_FORBIDDEN', '赛事不存在或无权访问')
  if (await inEventRoster(db, tournamentId, playerId)) throw error('TRANSFER_FREE_AGENT_IN_EVENT', '该球员已列入本赛事名单，请走赛事内转会流程')
  const window = await loadWindow(db, tournamentId)
  if (POLICY.freeAgentRequiresOpenWindow) assertWindowOpen(window)
  const team = await getDoc(db.collection('teams'), teamId)
  if (!team) throw error('TRANSFER_TEAM_INVALID', '球队信息不存在或已删除')
  return { requestKey, playerId, player, teamId, team, tournamentId, orgId: id(tournament.orgId || tournament.organizationId), seasonKey: id(window.seasonKey) }
}

async function signFreeAgent(db, actor, event = {}) {
  // 幂等重放先按确定性编号回读；否则球员已属于本队时会被“非自由球员”规则误挡。
  const requestKey = id(event.requestKey)
  if (!/^[A-Za-z0-9_-]{12,100}$/.test(requestKey)) throw error('TRANSFER_KEY_REQUIRED', '签约请求标识无效，请重新提交')
  const teamIdValue = requireTeamManager(actor, event.teamId)
  const playerIdValue = id(event.playerId)
  if (!playerIdValue) throw error('TRANSFER_PLAYER_REQUIRED', '请选择球员')
  const signingId = hash('transfer-free:' + actor.userId + ':' + requestKey)
  const previousSigning = await getDoc(db.collection(COLLECTIONS.freeSignings), signingId)
  if (previousSigning) {
    if (id(previousSigning.playerId) !== playerIdValue || id(previousSigning.toTeamId) !== teamIdValue) throw error('TRANSFER_KEY_CONFLICT', '请求标识已用于其他签约')
    return { success: true, id: signingId, status: id(previousSigning.status), contractId: id(previousSigning.contractId), idempotent: true }
  }
  const context = await freeAgentContext(db, actor, event)
  const now = new Date()
  const valuationSnapshot = await frozenValuation(db, actor, context.playerId)
  await ensureCollections(db, [COLLECTIONS.freeSignings, COLLECTIONS.contracts, COLLECTIONS.events])
  return db.runTransaction(async transaction => {
    const existing = await getDoc(transaction.collection(COLLECTIONS.freeSignings), signingId)
    if (existing) {
      if (id(existing.playerId) !== context.playerId || id(existing.toTeamId) !== context.teamId) throw error('TRANSFER_KEY_CONFLICT', '请求标识已用于其他签约')
      return { success: true, id: signingId, status: id(existing.status), contractId: id(existing.contractId), idempotent: true }
    }
    const player = await getDoc(transaction.collection('players'), context.playerId)
    if (!player || id(player.teamId || player.teamCode) || ['deleted', 'archived'].includes(id(player.status))) throw error('TRANSFER_PLAYER_STATE_CHANGED', '球员状态已变化，请刷新后重试')
    const contractsRead = await readRows(db, COLLECTIONS.contracts, { playerId: context.playerId }, 500)
    if (contractsRead.rows.some(row => id(row.playerId) === context.playerId && ['active', 'scheduled'].includes(id(row.status)))) throw error('TRANSFER_PLAYER_STATE_CHANGED', '球员状态已变化，请刷新后重试')
    const membershipId = hash('membership-free:' + signingId)
    const historyId = hash('history-free:' + signingId)
    const contractId = hash('contract-free:' + signingId)
    await transaction.collection('player_team_memberships').doc(membershipId).set({ data: { playerId: context.playerId, teamId: context.teamId, orgId: context.orgId, validFrom: now, validTo: null, status: 'active', source: 'free_agent', signingId, createTime: now, updateTime: now } })
    await transaction.collection('player_team_history').doc(historyId).set({ data: { playerId: context.playerId, teamId: context.teamId, orgId: context.orgId, teamName: teamNameOf(context.team), joinedAt: now, leftAt: null, joinSource: 'free_agent', signingId, createTime: now, updateTime: now } })
    await transaction.collection('players').doc(context.playerId).update({ data: { teamId: context.teamId, teamCode: context.teamId, teamName: teamNameOf(context.team), currentMembershipId: membershipId, currentHistoryId: historyId, joinedTeamAt: now, status: 'active', updateTime: now } })
    await transaction.collection('teams').doc(context.teamId).update({ data: { rosterCountStatus: 'needs_refresh', updateTime: now } })
    const term = contractTerm(now)
    await transaction.collection(COLLECTIONS.contracts).doc(contractId).set({ data: { playerId: context.playerId, teamId: context.teamId, orgId: context.orgId, status: 'active', ...term, source: 'free_agent', sourceSigningId: signingId, mayRenew: true, createTime: now, updateTime: now } })
    await transaction.collection(COLLECTIONS.freeSignings).doc(signingId).set({ data: {
      requestKey: context.requestKey, playerId: context.playerId, playerName: id(context.player.name),
      toTeamId: context.teamId, toTeamName: teamNameOf(context.team), tournamentId: context.tournamentId, seasonKey: context.seasonKey,
      orgId: context.orgId, status: 'completed', contractId, membershipId, valuationSnapshot,
      eventScopePolicy: 'outside_event_only', freeAgentWindowPolicy: 'conservative_requires_open_window', reviewPolicy: 'pending_q02',
      createdBy: id(actor.userId), completedAt: now, createTime: now, updateTime: now
    } })
    return { success: true, id: signingId, status: 'completed', contractId }
  })
}

// ---------------- 合同与续约 ----------------

async function contracts(db, actor, event = {}) {
  const teamId = requireTeamManager(actor, event.teamId)
  const tab = ['active', 'loans', 'ended', 'expiring', 'all'].includes(id(event.tab)) ? id(event.tab) : 'active'
  const keyword = id(event.keyword).slice(0, 40).toLowerCase()
  const contractsRead = await readRows(db, COLLECTIONS.contracts, { teamId })
  const loansRead = await readEither(db, COLLECTIONS.loans, [{ ownerTeamId: teamId }, { borrowerTeamId: teamId }])
  const teamContracts = contractsRead.rows.filter(row => id(row.teamId) === teamId)
  const teamLoans = loansRead.rows.filter(row => id(row.ownerTeamId) === teamId || id(row.borrowerTeamId) === teamId)
  const playerIds = [...new Set([...teamContracts.map(row => id(row.playerId)), ...teamLoans.map(row => id(row.playerId))])]
  const players = new Map()
  if (playerIds.length) for (const row of await readByIds(db, 'players', '_id', playerIds, { maxRows: 2000 })) players.set(id(row._id), row)
  const team = await getDoc(db.collection('teams'), teamId)
  const now = new Date()
  let rows = teamContracts.map(contract => contractView(contract, { loans: teamLoans.filter(loan => id(loan.playerId) === id(contract.playerId)), player: players.get(id(contract.playerId)), team, now }))
  if (tab === 'active') rows = rows.filter(row => ['active', 'scheduled', 'pending_term'].includes(row.state))
  if (tab === 'ended') rows = rows.filter(row => ['ended', 'expired', 'renewed'].includes(row.state))
  if (tab === 'loans') {
    rows = rows.filter(row => row.loan && ['active', 'scheduled'].includes(row.loan.status))
    const lentOut = teamLoans.filter(loan => id(loan.ownerTeamId) === teamId && id(loan.status) === 'active' && !rows.some(row => row.loan?.id === id(loan._id)))
    for (const loan of lentOut) {
      const contract = teamContracts.find(row => id(row.playerId) === id(loan.playerId) && id(row.teamId) === teamId)
      rows.push({ ...(contract ? contractView(contract, { loans: [loan], player: players.get(id(loan.playerId)), team, now }) : { id: '', playerId: id(loan.playerId), teamId, teamName: teamNameOf(team), state: 'pending_term', stateText: CONTRACT_STATE_TEXT.pending_term }), loanDirection: 'out' })
    }
  }
  if (tab === 'expiring') {
    // Q07 未确认提醒阈值，不硬编码 30 天，也不伪造临期结论。
    return { success: true, teamId, tab, items: [], total: 0, page: 1, pageSize: 20, pageCount: 1, expiringState: 'pending_q07', contractsState: contractsRead.status, notes: ['即将到期阈值待决（Q07），暂不返回临期判定'] }
  }
  if (keyword) rows = rows.filter(row => [id(row.playerName), id(row.playerCode)].some(value => value.toLowerCase().includes(keyword)))
  rows = rows.sort((left, right) => String(row.playerName || '').localeCompare(String(right.playerName || ''), 'zh-CN'))
  const totals = {
    active: teamContracts.filter(row => ['active', 'scheduled'].includes(id(row.status))).length,
    loans: teamLoans.filter(row => id(row.status) === 'active').length,
    ended: teamContracts.filter(row => !['active', 'scheduled'].includes(id(row.status))).length
  }
  const page = paginate(rows, event)
  return { success: true, teamId, tab, totals, items: page.items, page: page.page, pageSize: page.pageSize, total: page.total, pageCount: page.pageCount, contractsState: contractsRead.status, notes: ['合同期限未核定的显示待补齐，不推断到期自由身（Q08）'] }
}

async function teamRenewals(db, actor, event = {}) {
  const teamId = requireTeamManager(actor, event.teamId)
  const renewalsRead = await readRows(db, COLLECTIONS.renewals, { teamId })
  const contractsRead = await readRows(db, COLLECTIONS.contracts, { teamId })
  const team = await getDoc(db.collection('teams'), teamId)
  const rows = renewalsRead.rows.filter(row => id(row.teamId) === teamId)
  const playerIds = [...new Set(rows.map(row => id(row.playerId)))]
  const players = new Map()
  if (playerIds.length) for (const row of await readByIds(db, 'players', '_id', playerIds, { maxRows: 2000 })) players.set(id(row._id), row)
  const contractOf = idValue => contractsRead.rows.find(row => id(row._id) === idValue) || null
  const items = rows
    .sort((left, right) => new Date(right.createTime || 0) - new Date(left.createTime || 0))
    .map(row => renewalView(row, { player: players.get(id(row.playerId)), team, contract: contractOf(row.contractId) }))
  const renewalId = id(event.renewalId)
  return {
    success: true,
    teamId,
    items,
    totals: { pending: items.filter(row => row.status === 'pending').length, accepted: items.filter(row => row.status === 'accepted').length, rejected: items.filter(row => row.status === 'rejected').length },
    detail: renewalId ? items.find(row => row.id === renewalId) || null : null,
    renewalsState: renewalsRead.status,
    canCreate: !rows.some(row => row.status === 'pending')
  }
}

async function playerRenewals(db, actor, event = {}) {
  let playerId = id(event.playerId)
  if (!playerId) {
    const candidates = []
    for (const field of ['linkedUserId', 'playerUserId']) {
      const rows = (await db.collection('players').where({ [field]: id(actor.userId) }).limit(20).get()).data || []
      for (const row of rows) if (!candidates.some(item => id(item._id) === id(row._id))) candidates.push(row)
    }
    if (candidates.length === 1) playerId = id(candidates[0]._id)
    if (candidates.length > 1) throw error('TRANSFER_PLAYER_REQUIRED', '当前账号关联多名球员，请选择后再查看续约')
  }
  if (!playerId) throw error('TRANSFER_PLAYER_REQUIRED', '当前账号未关联球员')
  const player = await getDoc(db.collection('players'), playerId)
  const identity = playerResponseIdentity(player, actor.userId)
  if (!identity.related && !actor.platformOwner) throw error('DATA_FORBIDDEN', '无权查看该球员的续约请求')
  const renewalsRead = await readRows(db, COLLECTIONS.renewals, { playerId }, 500)
  const contractsRead = await readRows(db, COLLECTIONS.contracts, { playerId }, 500)
  const teamIds = [...new Set(renewalsRead.rows.filter(row => id(row.playerId) === playerId).map(row => id(row.teamId)))]
  const teams = new Map()
  for (const teamIdValue of teamIds) {
    const team = await getDoc(db.collection('teams'), teamIdValue)
    if (team) teams.set(teamIdValue, team)
  }
  const contractOf = idValue => contractsRead.rows.find(row => id(row._id) === idValue) || null
  const items = renewalsRead.rows
    .filter(row => id(row.playerId) === playerId)
    .sort((left, right) => new Date(right.createTime || 0) - new Date(left.createTime || 0))
    .map(row => ({ ...renewalView(row, { player, team: teams.get(id(row.teamId)), contract: contractOf(row.contractId) }), canRespond: Boolean(identity.allowed && row.status === 'pending'), guardianPending: Boolean(identity.guardian) }))
  const renewalId = id(event.renewalId)
  return {
    success: true,
    playerId,
    items,
    detail: renewalId ? items.find(row => row.id === renewalId) || null : null,
    identityState: identity.allowed ? 'self' : identity.guardian ? 'guardian_pending_q07' : 'unrelated',
    renewalsState: renewalsRead.status,
    notes: ['通知只是提示，未送达也保留待办；未回复不自动续约（Q07）']
  }
}

async function createRenewal(db, actor, event = {}) {
  const requestKey = id(event.requestKey)
  if (!/^[A-Za-z0-9_-]{12,100}$/.test(requestKey)) throw error('TRANSFER_KEY_REQUIRED', '续约请求标识无效，请重新提交')
  const teamId = requireTeamManager(actor, event.teamId)
  const contractId = id(event.contractId)
  const dates = assertRenewalDates({ proposedFrom: event.proposedFrom, proposedTo: event.proposedTo })
  const now = new Date()
  const renewalId = hash('renewal:' + actor.userId + ':' + requestKey)
  await ensureCollections(db, [COLLECTIONS.renewals])
  return db.runTransaction(async transaction => {
    const existing = await getDoc(transaction.collection(COLLECTIONS.renewals), renewalId)
    if (existing) return { success: true, id: renewalId, status: id(existing.status), idempotent: true }
    const contract = await getDoc(transaction.collection(COLLECTIONS.contracts), contractId)
    if (!contract) throw error('TRANSFER_CONTRACT_NOT_FOUND', '合同不存在或已删除')
    if (id(contract.teamId) !== teamId) throw error('DATA_FORBIDDEN', '只有合同所属球队可以发起续约')
    if (id(contract.status) !== 'active') throw error('TRANSFER_CONTRACT_STATE', '该合同不在有效状态，不能发起续约')
    if (id(contract.renewedByContractId)) throw error('TRANSFER_CONTRACT_RENEWED', '该合同已续约，不能重复发起')
    if (id(contract.pendingRenewalId)) throw error('TRANSFER_RENEWAL_EXISTS', '该合同已有待回应的续约请求')
    const player = await getDoc(transaction.collection('players'), id(contract.playerId))
    if (!player) throw error('TRANSFER_PLAYER_NOT_FOUND', '球员资料不存在或已删除')
    const related = playerResponseIdentity(player, player.linkedUserId || player.playerUserId)
    const notifyStatus = related.allowed || (player.guardianUserId && !POLICY.guardianRenewalResponse) ? 'pending' : 'no_receiver'
    await transaction.collection(COLLECTIONS.renewals).doc(renewalId).set({ data: {
      requestKey, contractId, playerId: id(contract.playerId), teamId, orgId: id(contract.orgId),
      proposedFrom: dates.proposedFrom, proposedTo: dates.proposedTo, note: id(event.note).slice(0, 200),
      status: 'pending', version: 1, notifyStatus, requestedBy: id(actor.userId),
      createTime: now, updateTime: now
    } })
    await transaction.collection(COLLECTIONS.contracts).doc(contractId).update({ data: { pendingRenewalId: renewalId, renewalStatus: 'pending', updateTime: now } })
    return { success: true, id: renewalId, status: 'pending', notifyStatus }
  })
}

async function respondRenewal(db, actor, event = {}) {
  const renewalId = id(event.renewalId)
  if (!renewalId) throw error('TRANSFER_RENEWAL_NOT_FOUND', '缺少续约请求编号')
  const decision = id(event.decision)
  if (!['accept', 'reject'].includes(decision)) throw error('TRANSFER_RENEWAL_INVALID', '请选择接受或拒绝续约')
  const now = new Date()
  await ensureCollections(db, [COLLECTIONS.contracts])
  return db.runTransaction(async transaction => {
    const renewal = await getDoc(transaction.collection(COLLECTIONS.renewals), renewalId)
    if (!renewal) throw error('TRANSFER_RENEWAL_NOT_FOUND', '续约请求不存在')
    if (renewal.status !== 'pending') return { success: true, id: renewalId, status: id(renewal.status), idempotent: true }
    const expected = requiredVersion(event.expectedVersion, '续约版本')
    if (expected !== Number(renewal.version || 0)) throw error('TRANSFER_VERSION_CONFLICT', '续约请求已更新，请刷新后再回应')
    const player = await getDoc(transaction.collection('players'), id(renewal.playerId))
    const identity = playerResponseIdentity(player, actor.userId)
    if (!identity.allowed) {
      if (identity.guardian && !POLICY.guardianRenewalResponse) throw pending('Q07', '青少年代管人回应续约尚未开放')
      throw error('DATA_FORBIDDEN', '只有球员本人可以回应续约')
    }
    const contract = await getDoc(transaction.collection(COLLECTIONS.contracts), id(renewal.contractId))
    if (!contract) throw error('TRANSFER_CONTRACT_NOT_FOUND', '合同不存在或已删除')
    let newContractId = ''
    if (decision === 'accept') {
      newContractId = hash('contract-renewal:' + renewalId)
      const from = dateValue(renewal.proposedFrom), to = dateValue(renewal.proposedTo)
      if (!from || !to || to <= from) throw error('TRANSFER_RENEWAL_INVALID', '续约条款日期无效')
      await transaction.collection(COLLECTIONS.contracts).doc(newContractId).set({ data: {
        playerId: id(renewal.playerId), teamId: id(renewal.teamId), orgId: id(renewal.orgId),
        status: from > now ? 'scheduled' : 'active', validFrom: from, validTo: to,
        termStatus: 'confirmed', termMonths: null, source: 'renewal', sourceRenewalId: renewalId,
        renewedFromContractId: id(renewal.contractId), mayRenew: true, createTime: now, updateTime: now
      } })
      await transaction.collection(COLLECTIONS.contracts).doc(id(renewal.contractId)).update({ data: { renewedByContractId: newContractId, pendingRenewalId: '', renewalStatus: 'accepted', updateTime: now } })
    } else {
      await transaction.collection(COLLECTIONS.contracts).doc(id(renewal.contractId)).update({ data: { pendingRenewalId: '', renewalStatus: 'rejected', updateTime: now } })
    }
    await transaction.collection(COLLECTIONS.renewals).doc(renewalId).update({ data: {
      status: decision === 'accept' ? 'accepted' : 'rejected', decidedBy: id(actor.userId), decidedAt: now,
      decisionNote: id(event.note).slice(0, 200), newContractId, version: Number(renewal.version || 0) + 1, updateTime: now
    } })
    return { success: true, id: renewalId, status: decision === 'accept' ? 'accepted' : 'rejected', contractId: newContractId, contractContinues: decision === 'reject' }
  })
}

// Q08 的明确处理入口：仅平台负责人可核定合同起止，核定后才参与到期任务。
async function confirmContractTerm(db, actor, event = {}) {
  if (!actor.platformOwner) throw error('DATA_FORBIDDEN', '仅平台负责人可核定合同期限')
  const contractId = id(event.contractId)
  const from = dateValue(event.validFrom ? new Date(event.validFrom) : null)
  const to = dateValue(event.validTo ? new Date(event.validTo) : null)
  if (!from || !to || to <= from) throw error('TRANSFER_CONTRACT_TERM_INVALID', '请填写有效的合同起止时间')
  return db.runTransaction(async transaction => {
    const contract = await getDoc(transaction.collection(COLLECTIONS.contracts), contractId)
    if (!contract) throw error('TRANSFER_CONTRACT_NOT_FOUND', '合同不存在或已删除')
    await transaction.collection(COLLECTIONS.contracts).doc(contractId).update({ data: {
      validFrom: from, validTo: to, termStatus: 'confirmed', termPendingRule: '',
      termConfirmedBy: id(actor.userId), termConfirmedAt: new Date(), note: id(event.note).slice(0, 200), updateTime: new Date()
    } })
    return { success: true, id: contractId, termStatus: 'confirmed' }
  })
}

// ---------------- 主办窗口与记录 ----------------

async function windowGet(db, actor, event = {}) {
  const tournamentId = id(event.tournamentId)
  const tournament = await requireReviewRights(db, actor, tournamentId).catch(async failure => {
    // 球队成员也可读取窗口状态，以便判断能否发起；不授予配置权。
    if (id(event.teamId) && (actor.manageTeamIds || []).includes(id(event.teamId))) {
      const document = await getDoc(db.collection('tournaments'), tournamentId)
      if (document) return document
    }
    throw failure
  })
  const window = await loadWindow(db, tournamentId)
  const canConfigure = await canReview(db, actor, tournamentId)
  return {
    success: true,
    tournament: { id: tournamentId, name: id(tournament.name) },
    window: window ? {
      seasonKey: id(window.seasonKey), openFrom: window.openFrom, openTo: window.openTo,
      state: windowState(window), version: Number(window.version || 0),
      updatedAt: window.updateTime || null, updatedBy: id(window.updatedBy)
    } : { seasonKey: '', openFrom: null, openTo: null, state: 'not_configured', version: 0, updatedAt: null, updatedBy: '' },
    canConfigure,
    notes: ['赛季标识与窗口数量规则待决（Q03），当前每个赛事只维护一个窗口']
  }
}

async function saveWindow(db, actor, event = {}) {
  const tournamentId = id(event.tournamentId)
  const tournament = await requireReviewRights(db, actor, tournamentId)
  const values = normalizeWindow(event)
  const now = new Date()
  const documentId = windowId(tournamentId)
  await ensureCollections(db, [COLLECTIONS.windows, COLLECTIONS.events])
  return db.runTransaction(async transaction => {
    const existing = await getDoc(transaction.collection(COLLECTIONS.windows), documentId)
    const expected = requiredVersion(event.expectedVersion, '窗口版本', 0)
    if (existing && expected !== Number(existing.version || 0)) throw error('TRANSFER_WINDOW_STALE', '窗口设置已更新，请刷新后再保存')
    if (!existing && expected !== 0) throw error('TRANSFER_WINDOW_STALE', '窗口设置已更新，请刷新后再保存')
    const version = Number(existing?.version || 0) + 1
    await transaction.collection(COLLECTIONS.windows).doc(documentId).set({ data: {
      tournamentId, orgId: id(tournament.orgId || tournament.organizationId),
      seasonKey: values.seasonKey, openFrom: values.openFrom, openTo: values.openTo,
      version, updatedBy: id(actor.userId), createTime: existing?.createTime || now, updateTime: now
    } })
    const seq = Number(existing?.version || 0) + 1
    await transaction.collection(COLLECTIONS.events).doc(hash('transfer-event:window:' + tournamentId + ':' + seq)).set({ data: {
      requestId: '', subject: 'window', tournamentId, seq, action: 'window_saved', actorUserId: id(actor.userId), actorSide: 'admin',
      fromStatus: existing ? windowState(existing, now) : 'not_configured', toStatus: windowState(values, now), at: now,
      detail: { seasonKey: values.seasonKey }
    } })
    return { success: true, tournamentId, seasonKey: values.seasonKey, state: windowState(values, now), version }
  })
}

async function adminRequests(db, actor, event = {}) {
  const tournamentId = id(event.tournamentId)
  await requireReviewRights(db, actor, tournamentId)
  const tab = ['pending', 'reviewed', 'all'].includes(id(event.tab)) ? id(event.tab) : 'pending'
  const requestsRead = await readRows(db, COLLECTIONS.requests, { tournamentId })
  const freeRead = await readRows(db, COLLECTIONS.freeSignings, { tournamentId })
  let requests = requestsRead.rows.filter(row => id(row.tournamentId) === tournamentId)
  const freeSignings = freeRead.rows.filter(row => id(row.tournamentId) === tournamentId)
  if (tab === 'pending') requests = requests.filter(row => id(row.status) === 'pending_review')
  if (tab === 'reviewed') requests = requests.filter(row => !['negotiating', 'pending_review', 'pending_effect'].includes(id(row.status)))
  const playerId = id(event.playerId)
  const teamId = id(event.teamId)
  const type = id(event.type)
  const from = dateValue(event.dateFrom), to = dateValue(event.dateTo)
  requests = requests.filter(row => (!playerId || id(row.playerId) === playerId || id(row.playerCode) === playerId) &&
    (!teamId || id(row.fromTeamId) === teamId || id(row.toTeamId) === teamId) &&
    (!type || id(row.type) === type) &&
    (!from || new Date(row.createTime || 0) >= from) && (!to || new Date(row.createTime || 0) <= to))
  const playerIds = [...new Set(requests.map(row => id(row.playerId)))]
  const players = new Map()
  if (playerIds.length) for (const row of await readByIds(db, 'players', '_id', playerIds, { maxRows: 2000 })) players.set(id(row._id), row)
  const totals = {
    pending: requestsRead.rows.filter(row => id(row.tournamentId) === tournamentId && id(row.status) === 'pending_review').length,
    reviewed: requestsRead.rows.filter(row => id(row.tournamentId) === tournamentId && !['negotiating', 'pending_review', 'pending_effect'].includes(id(row.status))).length,
    negotiating: requestsRead.rows.filter(row => id(row.tournamentId) === tournamentId && id(row.status) === 'negotiating').length,
    freeSignings: freeSignings.length
  }
  let items = requests.map(row => ({ ...requestSummary(row, { players }), recordKind: 'request', tournamentId, submittedAt: row.sellerConfirmedAt || row.createTime }))
  if (tab !== 'pending') {
    items = items.concat(freeSignings.map(row => ({
      id: id(row._id), recordKind: 'free_agent', playerId: id(row.playerId), playerName: id(row.playerName),
      fromTeamId: '', fromTeamName: '自由球员', toTeamId: id(row.toTeamId), toTeamName: id(row.toTeamName),
      type: 'free_agent', typeText: TYPE_TEXT.free_agent, amountFen: 0, amountText: '0.00',
      status: id(row.status), statusText: STATUS_TEXT[id(row.status)] || '已完成',
      round: 0, maxRounds: 0, roundText: '', tournamentId, submittedAt: row.completedAt || row.createTime, createTime: row.createTime
    })))
  }
  items = items.sort((left, right) => {
    const pendingRank = value => value.status === 'pending_review' ? 0 : 1
    return pendingRank(left) - pendingRank(right) || new Date(right.submittedAt || right.createTime || 0) - new Date(left.submittedAt || left.createTime || 0)
  })
  const page = paginate(items, event)
  return { success: true, tournamentId, tab, totals, items: page.items, page: page.page, pageSize: page.pageSize, total: page.total, pageCount: page.pageCount, requestsState: requestsRead.status, recordsState: freeRead.status }
}

async function adminRecord(db, actor, event = {}) {
  const recordId = id(event.requestId || event.recordId)
  if (!recordId) throw error('TRANSFER_NOT_FOUND', '缺少记录编号')
  const request = await getDoc(db.collection(COLLECTIONS.requests), recordId)
  if (request) {
    await requireReviewRights(db, actor, id(request.tournamentId))
    const detail = await requestDetail(db, actor, { requestId: recordId })
    return { success: true, recordKind: 'request', ...detail }
  }
  const signing = await getDoc(db.collection(COLLECTIONS.freeSignings), recordId)
  if (!signing) throw error('TRANSFER_NOT_FOUND', '转会记录不存在')
  await requireReviewRights(db, actor, id(signing.tournamentId))
  const player = await getDoc(db.collection('players'), id(signing.playerId))
  const team = await getDoc(db.collection('teams'), id(signing.toTeamId))
  return {
    success: true,
    recordKind: 'free_agent',
    record: {
      id: recordId, playerId: id(signing.playerId), playerName: id(signing.playerName) || id(player?.name),
      toTeamId: id(signing.toTeamId), toTeamName: id(signing.toTeamName) || teamNameOf(team),
      status: id(signing.status), statusText: STATUS_TEXT[id(signing.status)] || '已完成',
      tournamentId: id(signing.tournamentId), seasonKey: id(signing.seasonKey),
      contractId: id(signing.contractId), completedAt: signing.completedAt || null,
      freeAgentWindowPolicy: id(signing.freeAgentWindowPolicy), reviewPolicy: id(signing.reviewPolicy),
      valuationSnapshot: signing.valuationSnapshot || null
    },
    offers: [], events: [], viewerSide: 'admin'
  }
}

// ---------------- 到期、激活与补偿 ----------------

async function expireDue(db, actor) {
  if (!actor.platformOwner) throw error('DATA_FORBIDDEN', '仅平台负责人可执行到期任务')
  const now = new Date()
  // 到期任务只处理仍可能到期的状态：待生效／有效租借与有效合同，历史记录不再参与。
  const loansRead = await readEither(db, COLLECTIONS.loans, [{ status: 'scheduled' }, { status: 'active' }])
  const contractsRead = await readRows(db, COLLECTIONS.contracts, { status: 'active' })
  const { resultState } = await import('../shared/statistics.mjs')
  const summary = { activatedLoans: 0, endedLoans: 0, reviewedLoans: 0, expiredContracts: 0, renewedContracts: 0, pendingContracts: 0, conflicts: 0 }
  for (const loan of loansRead.rows) {
    const loanId = id(loan._id)
    try {
      if (id(loan.status) === 'scheduled') {
        const start = dateValue(loan.startAt)
        if (start && start <= now) {
          await db.runTransaction(async transaction => {
            const current = await getDoc(transaction.collection(COLLECTIONS.loans), loanId)
            if (!current || id(current.status) !== 'scheduled') return
            const active = loansRead.rows.filter(row => id(row.playerId) === id(current.playerId) && id(row.status) === 'active' && id(row._id) !== loanId)
            for (const row of active) {
              const end = dateValue(row.endAt)
              if (end && end > now) throw error('TRANSFER_LOAN_OVERLAP', '租借期限重叠，请先核验')
              await transaction.collection(COLLECTIONS.loans).doc(id(row._id)).update({ data: { status: 'ended', endReason: 'renewed', endedAt: now, supersededByLoanId: loanId, updateTime: now } })
            }
            await transaction.collection(COLLECTIONS.loans).doc(loanId).update({ data: { status: 'active', updateTime: now } })
          })
          summary.activatedLoans += 1
        }
        continue
      }
      if (id(loan.status) !== 'active') continue
      let matchState = ''
      if (id(loan.kind) === 'single_match' || id(loan.expiryMode) === 'match_end') {
        const match = await getDoc(db.collection('matches'), id(loan.matchId))
        matchState = match ? resultState(match, { requireOriginEvidence: false }) : 'excluded'
      }
      const decision = loanExpiryDecision(loan, { now, matchState })
      if (decision.action === 'end') {
        await db.collection(COLLECTIONS.loans).doc(loanId).update({ data: { status: 'ended', endReason: decision.reason, endedAt: now, updateTime: now } })
        summary.endedLoans += 1
      } else if (decision.action === 'review') {
        await db.collection(COLLECTIONS.loans).doc(loanId).update({ data: { expiryState: 'pending_review', expiryReason: decision.reason, updateTime: now } })
        summary.reviewedLoans += 1
      }
    } catch (_) { summary.conflicts += 1 }
  }
  for (const contract of contractsRead.rows) {
    const contractId = id(contract._id)
    if (id(contract.status) !== 'active') continue
    if (id(contract.termStatus) !== 'confirmed') { summary.pendingContracts += 1; continue }
    const validTo = dateValue(contract.validTo)
    if (!validTo || validTo > now) continue
    const playerId = id(contract.playerId)
    const activeLoan = loansRead.rows.some(row => id(row.playerId) === playerId && id(row.status) === 'active')
    try {
      await db.runTransaction(async transaction => {
        const current = await getDoc(transaction.collection(COLLECTIONS.contracts), contractId)
        if (!current || id(current.status) !== 'active' || id(current.termStatus) !== 'confirmed') return
        if (id(current.renewedByContractId)) {
          await transaction.collection(COLLECTIONS.contracts).doc(contractId).update({ data: { status: 'renewed', endReason: 'renewed', endedAt: now, updateTime: now } })
          summary.renewedContracts += 1
          return
        }
        // 原合同到期但仍有有效租借：组合分支待决（Q06），只标待处理，不强行解除关系。
        if (activeLoan) {
          await transaction.collection(COLLECTIONS.contracts).doc(contractId).update({ data: { expiryState: 'pending_review', expiryReason: 'active_loan_pending_q06', updateTime: now } })
          summary.pendingContracts += 1
          return
        }
        const player = await getDoc(transaction.collection('players'), playerId)
        if (!player) throw error('TRANSFER_PLAYER_NOT_FOUND', '球员资料不存在')
        const membershipId = id(player.currentMembershipId)
        if (membershipId) {
          const membership = await getDoc(transaction.collection('player_team_memberships'), membershipId)
          if (membership && id(membership.status) === 'active') await transaction.collection('player_team_memberships').doc(membershipId).update({ data: { status: 'ended', validTo: now, endReason: 'contract_expired', updateTime: now } })
        }
        const historyId = id(player.currentHistoryId)
        if (historyId) {
          const history = await getDoc(transaction.collection('player_team_history'), historyId)
          if (history && !history.leftAt) await transaction.collection('player_team_history').doc(historyId).update({ data: { leftAt: now, leftSource: 'contract_expired', updateTime: now } })
        }
        await transaction.collection('players').doc(playerId).update({ data: { teamId: '', teamCode: '', currentMembershipId: '', currentHistoryId: '', leftTeamAt: now, updateTime: now } })
        await transaction.collection('teams').doc(id(contract.teamId)).update({ data: { rosterCountStatus: 'needs_refresh', updateTime: now } })
        await transaction.collection(COLLECTIONS.contracts).doc(contractId).update({ data: { status: 'expired', endReason: 'expired', endedAt: now, updateTime: now } })
        summary.expiredContracts += 1
      })
    } catch (_) { summary.conflicts += 1 }
  }
  return { success: true, ...summary, at: now }
}

module.exports = {
  market,
  playerDetail,
  myRequests,
  requestDetail,
  initiate,
  submitOffer,
  acceptOffer,
  rejectOffer,
  counterOffer,
  withdraw,
  review,
  signFreeAgent,
  contracts,
  teamRenewals,
  playerRenewals,
  createRenewal,
  respondRenewal,
  confirmContractTerm,
  windowGet,
  saveWindow,
  adminRequests,
  adminRecord,
  expireDue,
  STATUS_TEXT,
  CONTRACT_STATE_TEXT,
  TYPE_TEXT
}
