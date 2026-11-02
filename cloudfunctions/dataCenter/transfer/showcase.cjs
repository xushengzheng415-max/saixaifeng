'use strict'
/**
 * 转会公开市场（发现页「转会」分栏，2026-10-27 用户确认的公开展示端）。
 *
 * 定位：面向所有小程序用户（含游客）的只读展示，不是转会办理入口。
 * 数据只取已有记录，不做估算、不补造：
 * - 转会焦点：范围内最近一条已完成的转会 / 租借 / 自由签约（同一条记录只出现一次）；
 * - 身价榜：`player_valuations` 每个球员最新一份快照，按货币身价倒序；
 * - 上升最快：同一球员最新与上一份快照的货币身价差（只有两份及以上快照才参与）；
 * - 球员身价列表：同一批快照按身价倒序取前 N 位，附真实历史快照走势点；
 * - 最新转会：已完成的转会单、租借与自由签约（球员、原球队、新球队、赛事来源）。
 *
 * 球员池（2026-10-28 用户确认 B2）：
 * - 赛事范围：该赛事已审核名单内的球员全部进「发现球员」，没有身价快照的标为未测算，
 *   有快照但属于青少年（不公开）的标为不公开，都不补造金额、不按 0 参与排序；
 * - 全平台范围（2026-10-28 充实内容本地候选）：公开赛事已审名单球员合并，按稳定ID去重；
 * - 身价榜与上升最快只收真实货币身价，未测算／不公开的球员不进榜，避免假名次。
 *
 * 范围（2026-10-27 用户确认）：
 * - 榜单按赛事出榜，再按年龄段（赛事竞赛组别 U8/U10…，不是抽签小组 A/B 组）细分；
 * - 赛事范围只认该赛事已审核名单（shared/roster.cjs），不拿球队资料库冒充参赛名单；
 * - 未选赛事时为全平台口径；时间范围筛选尚未接入。
 *
 * 金额（2026-10-27 用户确认）：成人成交金额公开、青少年不公开。
 * - 成人：只下发格式化展示文案（`priceText`），不下发 `amountFen`，页面无需遮挡；
 * - 青少年（minor=true 或按生日不足 18 岁）：只回 `priceState:'hidden'`，不返回任何金额或位数；
 * - 年龄无法判定时不猜测，回 `priceState:'unknown'`；无金额回 `priceState:'not_recorded'`。
 *
 * 其他红线：
 * - 转会动态可能涉及未成年球员，因此不下发球员形象照，页面用姓名首字头像；
 * - 不返回报价单、审核记录、手机号、证件或任何签到/登录凭据；
 * - 读取用单字段过滤 + `_id` 键集分页，扫描上限显式声明，达到上限即 scanLimited=true。
 */
const { readByIds, missingCollection } = require('../shared/reader.cjs')
const { formatMoney, positionBucketOf, parseAge } = require('../shared/valuation.cjs')
const { loadPublicMembers, readPublicProfiles, pageIds } = require('./public-roster-pool.cjs')

const SCHEMA = 'transfer-showcase/5'
const text = value => value == null ? '' : String(value).trim()
const num = value => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
const isoText = value => {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  const time = date.getTime()
  return Number.isFinite(time) ? date.toISOString() : ''
}
const PERCENT_TEXT = ratio => {
  if (!Number.isFinite(ratio)) return ''
  const percent = ratio * 100
  const digits = percent >= 10 ? 0 : 1
  return (percent > 0 ? '+' : '') + percent.toFixed(digits) + '%'
}
// 与 transfer/service.cjs 的类型口径一致；未知类型不翻译成猜测文案。
const TYPE_TEXT = Object.freeze({
  permanent: '正式转会',
  loan: '租借',
  loan_permanent: '租借转永久',
  loan_renewal: '租借续租',
  free_agent: '自由球员签约'
})
const LOAN_KIND_TEXT = Object.freeze({ season_full: '整赛季租借', single_match: '单场租借' })
const typeTextOf = (type, loanKind) => type === 'loan'
  ? (LOAN_KIND_TEXT[loanKind] || '租借')
  : (TYPE_TEXT[type] || '')
// 与数据中心 awards.cjs 的位置标签一致；认不出的位置回退原始值，不猜位置。
const POSITION_LABEL = Object.freeze({ GK: '门将', DF: '后卫', MF: '中场', FW: '前锋' })
// 成交金额状态文案由服务端给出，页面只展示，不在端上重新判断青少年或金额。
const PRICE_TEXT = Object.freeze({
  youth: '青少年金额不公开',
  unknown: '成交价待核实',
  missing: '成交价未记录',
  free: '无转会费'
})

const LIMITS = Object.freeze({
  valuations: 600,
  scopedValuations: 4000,
  transfers: 300,
  freeSignings: 200,
  top: 8,
  rising: 5,
  feed: 10,
  players: 30,
  trendPoints: 8
})

// 单字段过滤 + `_id` 键集分页：不依赖复合索引，也不会把截断结果当成完整结果。
async function scanPages(db, collection, where, maxRows) {
  const rows = []
  let cursor = ''
  for (;;) {
    const condition = cursor ? db.command.and([where, { _id: db.command.gt(cursor) }]) : where
    let page
    try {
      page = (await db.collection(collection).where(condition).orderBy('_id', 'asc').limit(Math.min(100, maxRows - rows.length)).get()).data || []
    } catch (failure) {
      if (missingCollection(failure)) return { status: 'not_recorded', rows: [], scanLimited: false }
      throw failure
    }
    if (!page.length) break
    rows.push(...page)
    cursor = text(page[page.length - 1]._id)
    if (rows.length >= maxRows) return { status: 'ready', rows, scanLimited: true }
  }
  return { status: 'ready', rows, scanLimited: false }
}

function latestSnapshots(rows) {
  const byPlayer = new Map()
  for (const row of rows) {
    const playerId = text(row.playerId)
    if (!playerId) continue
    if (!byPlayer.has(playerId)) byPlayer.set(playerId, [])
    byPlayer.get(playerId).push(row)
  }
  const result = []
  for (const [playerId, list] of byPlayer) {
    list.sort((left, right) => text(right.computedAt).localeCompare(text(left.computedAt)))
    result.push({ playerId, latest: list[0] || {}, previous: list[1] || null, history: list })
  }
  return result
}

async function readMaps(db, ids, collection, maxRows) {
  const unique = [...new Set((ids || []).map(text).filter(Boolean))]
  if (!unique.length) return new Map()
  try {
    const rows = await readByIds(db, collection, '_id', unique, { maxRows: maxRows || 400 })
    return new Map(rows.map(row => [text(row._id), row]))
  } catch (failure) {
    // 缺集合时按“资料缺失”处理，让页面显示缺少资料而不是整页读取失败
    if (missingCollection(failure)) return new Map()
    throw failure
  }
}

function playerNameOf(player) {
  return text(player && (player.name || player.playerName))
}

function teamNameOf(team) {
  return text(team && (team.name || team.teamName))
}

// 队徽/形象照在项目里都存云存储 fileID；只取展示字段，不取任何联系方式。
function logoOf(team) {
  return text(team && (team.logo || team.logoUrl))
}

function divisionNameOf(division) {
  return text(division && (division.name || division.divisionName || division.label || division.title))
}

function naturalCompare(left, right) {
  const a = text(left), b = text(right)
  const na = Number((a.match(/\d+/) || [])[0])
  const nb = Number((b.match(/\d+/) || [])[0])
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
  return a.localeCompare(b, 'zh-CN')
}

function positionTextOf(player) {
  const raw = text(player && player.position)
  if (!raw) return ''
  return POSITION_LABEL[positionBucketOf(raw)] || raw
}

// 走势只取真实快照里已算出的货币身价，少样本不补齐、不为空值填零。
function trendOf(history, points) {
  const values = (history || [])
    .map(row => num(row.money))
    .filter(value => value != null && value > 0)
  const tail = values.slice(0, points || LIMITS.trendPoints)
  return tail.reverse()
}

async function handle(db, event = {}) {
  try {
    const { synthetic } = await import('../shared/statistics.mjs')
    // 年龄段只在本赛事名单内成立：没有赛事时不接受年龄段条件，避免把全平台数据按空名单过滤成空
    const tournamentId = text(event.tournamentId)
    const ageGroupId = tournamentId ? text(event.ageGroupId) : ''

    // 赛事范围只认本赛事已审核名单；年龄段用名单上的竞赛组别（U8/U10…），不是抽签小组。
    const publicPool = await loadPublicMembers(db, tournamentId, synthetic)
    const members = publicPool.members
    const publicTournamentIds = new Set(publicPool.tournaments.map(row => text(row._id)))
    const inEventRoster = playerId => members.has(text(playerId))
    const inAgeGroup = playerId => {
      if (!ageGroupId) return true
      const member = members.get(text(playerId))
      return Boolean(member && member.divisionId === ageGroupId)
    }
    // 名单状态如实回传：赛事已选但没有已审核名单时，页面要说清原因，不能当成“平台没有身价”
    const rosterState = members.size ? 'ready' : publicPool.status === 'not_recorded' ? 'not_recorded' : 'none'

    // 身价：选定赛事时按名单球员批量读取该批球员的全部快照，不做全集合扫描后再过滤（避免漏人）
    let valuationStatus = 'not_recorded'
    let valuationLimited = false
    let valuationRows = []
    if (tournamentId) {
      const rosterPlayerIdsList = [...members.keys()]
      if (rosterPlayerIdsList.length) {
        try {
          valuationRows = await readByIds(db, 'player_valuations', 'playerId', rosterPlayerIdsList, { maxRows: LIMITS.scopedValuations })
          valuationStatus = 'ready'
        } catch (failure) {
          if (!missingCollection(failure)) throw failure
          valuationStatus = 'not_recorded'
          valuationRows = []
        }
      }
    } else {
      const read = await scanPages(db, 'player_valuations', { coverage: 'complete' }, LIMITS.valuations)
      valuationStatus = read.status
      valuationLimited = read.scanLimited
      valuationRows = read.rows
    }
    const snapshots = latestSnapshots(valuationRows.filter(row => text(row.coverage) === 'complete' && !synthetic(row)))

    // 身价榜：青少年不公开，未记录货币身价的快照（未测算／只有指数）不参与排序
    let topCandidates = []
    let risingCandidates = []
    for (const snapshot of snapshots) {
      if (!inEventRoster(snapshot.playerId) || !inAgeGroup(snapshot.playerId)) continue
      const latest = snapshot.latest || {}
      if (latest.minor === true) continue
      const money = num(latest.money)
      if (money == null || money <= 0) continue
      topCandidates.push({ ...snapshot, money })
      const previous = snapshot.previous
      const before = previous && previous.minor !== true ? num(previous.money) : null
      if (before == null || before <= 0) continue
      const delta = money - before
      if (delta <= 0) continue
      risingCandidates.push({ ...snapshot, money, before, delta, ratio: delta / before })
    }
    topCandidates.sort((left, right) => right.money - left.money || text(left.playerId).localeCompare(text(right.playerId)))
    risingCandidates.sort((left, right) => right.ratio - left.ratio || right.delta - left.delta)

    // 在分页和人数统计前校验球员/当前球队来源；测试、删除与缺资料不计入真实池。
    const prospectiveIds = [...new Set([...members.keys(), ...topCandidates.map(row => row.playerId)])]
    const publicProfiles = await readPublicProfiles(db, prospectiveIds, synthetic)
    const publicMoneyAllowed = (playerId, latest) => {
      if (!latest || latest.minor === true) return false
      const player = publicProfiles.get(text(playerId))
      const age = parseAge(player && (player.birthDate || player.birthday))
      if (age != null && age < 18) return false
      return latest.minor === false || (age != null && age >= 18)
    }
    for (const playerId of members.keys()) if (!publicProfiles.has(playerId)) members.delete(playerId)
    topCandidates = topCandidates.filter(row => publicProfiles.has(row.playerId) && publicMoneyAllowed(row.playerId, row.latest))
    risingCandidates = risingCandidates.filter(row => publicProfiles.has(row.playerId) && publicMoneyAllowed(row.playerId, row.latest))

    const top = topCandidates.slice(0, LIMITS.top)
    const rising = risingCandidates.slice(0, LIMITS.rising)

    // 球员池：赛事范围＝该赛事已审核名单全员（按名单顺序，已测算的排前面）；
    // 全平台范围＝公开赛事已审名单合并；未测算的只进「发现球员」，不进榜单。
    const snapshotById = new Map(snapshots.map(snapshot => [snapshot.playerId, snapshot]))
    const poolOrder = []
    const poolSeen = new Set()
    for (const row of topCandidates) {
      const playerId = text(row.playerId)
      if (!playerId || poolSeen.has(playerId)) continue
      poolSeen.add(playerId)
      poolOrder.push(playerId)
    }
    {
      for (const playerId of [...members.keys()].sort()) {
        if (!inAgeGroup(playerId) || poolSeen.has(playerId)) continue
        poolSeen.add(playerId)
        poolOrder.push(playerId)
      }
    }
    const playerPool = tournamentId ? 'roster' : 'public_roster'
    const poolTotal = poolOrder.length
    const playerPage = pageIds(poolOrder, tournamentId + ':' + ageGroupId, event.playerCursor || '', LIMITS.players)
    const displayPlayerIds = playerPage.ids

    const requestRead = await scanPages(db, 'transfer_requests', { status: 'completed' }, LIMITS.transfers)
    const freeRead = await scanPages(db, 'transfer_free_signings', { status: 'completed' }, LIMITS.freeSignings)
    const rawTransfers = []
    for (const row of requestRead.rows.filter(row => !synthetic(row))) {
      rawTransfers.push({
        kind: 'transfer',
        playerId: text(row.playerId),
        playerName: text(row.playerName),
        fromTeamId: text(row.fromTeamId),
        fromTeamName: text(row.fromTeamName),
        fromTeamLogo: text(row.fromTeamLogo),
        toTeamId: text(row.toTeamId),
        toTeamName: text(row.toTeamName),
        toTeamLogo: text(row.toTeamLogo),
        tournamentId: text(row.tournamentId),
        fromTournamentId: text(row.fromTournamentId),
        toTournamentId: text(row.toTournamentId),
        fromTournamentName: text(row.fromTournamentName),
        toTournamentName: text(row.toTournamentName),
        typeText: typeTextOf(text(row.type), text(row.offerTerms && row.offerTerms.loan && row.offerTerms.loan.kind)),
        amountFen: num(row.offerTerms && row.offerTerms.amountFen),
        completedAt: isoText(row.completedAt || row.updateTime)
      })
    }
    for (const row of freeRead.rows.filter(row => !synthetic(row))) {
      rawTransfers.push({
        kind: 'free',
        playerId: text(row.playerId),
        playerName: text(row.playerName),
        fromTeamId: '',
        fromTeamName: '',
        fromTeamLogo: '',
        toTeamId: text(row.toTeamId),
        toTeamName: text(row.toTeamName),
        toTeamLogo: text(row.toTeamLogo),
        tournamentId: text(row.tournamentId),
        fromTournamentId: text(row.fromTournamentId),
        toTournamentId: text(row.toTournamentId),
        fromTournamentName: text(row.fromTournamentName),
        toTournamentName: text(row.toTournamentName),
        typeText: '自由球员签约',
        amountFen: null,
        completedAt: isoText(row.completedAt || row.createTime || row.updateTime)
      })
    }
    // 跨赛事转会（2026-10-27 用户确认允许）：记录带两个赛事时按两个赛事匹配范围
    const inScopeTransfer = row => {
      if (![row.tournamentId, row.fromTournamentId, row.toTournamentId].some(id => publicTournamentIds.has(id))) return false
      if (tournamentId) {
        const ids = [row.tournamentId, row.fromTournamentId, row.toTournamentId]
        if (ids.indexOf(tournamentId) < 0) return false
      }
      return inAgeGroup(row.playerId)
    }
    const scopedTransfers = rawTransfers.filter(inScopeTransfer)
    scopedTransfers.sort((left, right) => text(right.completedAt).localeCompare(text(left.completedAt)))
    const transferCount = scopedTransfers.length
    const transfers = scopedTransfers.slice(0, LIMITS.feed)

    const playerIds = [...top, ...rising, ...displayPlayerIds.map(playerId => ({ playerId })), ...transfers].map(row => row.playerId).filter(Boolean)
    const playerMap = await readMaps(db, playerIds, 'players', 400)
    const teamIds = []
    for (const player of playerMap.values()) teamIds.push(text(player.teamId))
    for (const row of transfers) teamIds.push(row.fromTeamId, row.toTeamId)
    const teamMap = await readMaps(db, teamIds, 'teams', 400)
    const tournamentIds = [tournamentId]
    for (const row of transfers) tournamentIds.push(row.tournamentId, row.fromTournamentId, row.toTournamentId)
    const tournamentMap = await readMaps(db, tournamentIds, 'tournaments', 200)
    const divisionIds = tournamentId ? [...new Set([...members.values()].map(member => member.divisionId).filter(value => value && value !== 'default'))] : []
    const divisionMap = await readMaps(db, divisionIds, 'divisions', 200)
    const ageGroups = divisionIds
      .map(divisionId => ({ id: divisionId, text: divisionNameOf(divisionMap.get(divisionId)) || '未命名组别' }))
      .sort((left, right) => naturalCompare(left.text, right.text) || left.id.localeCompare(right.id))
    const ageGroupText = (ageGroups.find(group => group.id === ageGroupId) || {}).text || ''

    // 球员资料缺失或已删除的行不展示（没有名字的榜单没有意义），但把数量如实回传
    const skippedPlayers = new Set()
    const playerView = playerId => {
      const key = text(playerId)
      const player = playerMap.get(key)
      if (!player) return null
      if (text(player.status) === 'deleted' || player.isDeleted === true || synthetic(player)) { if (key) skippedPlayers.add(key); return null }
      const name = playerNameOf(player)
      if (!name) { if (key) skippedPlayers.add(key); return null }
      const team = teamMap.get(text(player.teamId))
      if (team && synthetic(team)) { skippedPlayers.add(key); return null }
      return {
        playerName: name,
        teamName: text(player.teamName) || teamNameOf(team),
        teamLogo: logoOf(team),
        photoUrl: text(player.photoUrl),
        positionBucket: positionBucketOf(player.position),
        positionText: positionTextOf(player)
      }
    }

    const rankItem = (row, rank) => {
      const view = playerView(row.playerId)
      if (!view) return null
      const latest = row.latest || {}
      const tier = text(latest.tier)
      const tierValue = num(latest.tierValue)
      return {
        rank,
        playerId: text(row.playerId),
        playerName: view.playerName,
        positionText: view.positionText,
        positionBucket: view.positionBucket,
        teamName: view.teamName,
        teamLogo: view.teamLogo,
        // 身价榜只含非青少年快照，因此可以带形象照
        photoUrl: view.photoUrl,
        money: row.money,
        moneyText: formatMoney(row.money),
        total: num(latest.total),
        tierText: tier ? (tierValue == null ? tier : tier + ' ' + tierValue) : '',
        computedAt: text(latest.computedAt)
      }
    }

    const topItems = []
    for (let index = 0; index < top.length; index += 1) {
      const item = rankItem(top[index], index + 1)
      if (item) topItems.push(item)
    }
    // 名次以最终进入榜单的行重新编号，资料缺失导致的空位不留断号
    topItems.forEach((item, index) => { item.rank = index + 1 })

    const risingItems = []
    for (let index = 0; index < rising.length; index += 1) {
      const row = rising[index]
      const item = rankItem(row, index + 1)
      if (!item) continue
      risingItems.push({
        ...item,
        previousMoney: row.before,
        previousMoneyText: formatMoney(row.before),
        deltaMoney: row.delta,
        deltaText: '+' + formatMoney(row.delta),
        percentText: PERCENT_TEXT(row.ratio)
      })
    }
    risingItems.forEach((item, index) => { item.rank = index + 1 })

    // 发现球员：赛事范围允许出现未测算（没有公开身价）的球员，身价状态如实回传
    const playerItems = []
    for (const playerId of displayPlayerIds) {
      const view = playerView(playerId)
      // 名单里有但球员资料缺失/已删除的行不展示，但要如实计入 skipped
      if (!view) { if (text(playerId)) skippedPlayers.add(text(playerId)); continue }
      const snapshot = snapshotById.get(text(playerId))
      const latest = (snapshot && snapshot.latest) || null
      const money = publicMoneyAllowed(playerId, latest) ? num(latest.money) : null
      if (latest && money != null && money > 0) {
        const measured = rankItem({ ...snapshot, money }, 0)
        if (!measured) continue
        playerItems.push({ ...measured, measured: true, moneyState: 'measured', trend: trendOf(snapshot.history, LIMITS.trendPoints) })
        continue
      }
      // 有快照但青少年不公开：只回状态，不回任何金额；形象照同样不下发（与转会动态口径一致）
      const hidden = Boolean(latest && num(latest.money) != null && num(latest.money) > 0)
      playerItems.push({
        rank: 0,
        playerId: text(playerId),
        playerName: view.playerName,
        positionText: view.positionText,
        positionBucket: view.positionBucket,
        teamName: view.teamName,
        teamLogo: view.teamLogo,
        photoUrl: hidden ? '' : view.photoUrl,
        money: null,
        moneyText: '',
        measured: false,
        moneyState: hidden ? 'hidden' : 'not_measured',
        total: null,
        tierText: '',
        computedAt: '',
        trend: []
      })
    }
    playerItems.forEach((item, index) => { item.rank = playerPage.offset + index + 1 })

    // 成交金额：成人公开（只下发展示文案）、青少年不公开、年龄无法判定不猜、无金额如实记录
    const latestByPlayer = new Map(snapshots.map(snapshot => [snapshot.playerId, snapshot.latest || {}]))
    const youthStateOf = playerId => {
      const latest = latestByPlayer.get(text(playerId)) || {}
      if (latest.minor === true) return true
      const player = playerMap.get(text(playerId))
      const age = parseAge(player && (player.birthDate || player.birthday))
      if (age != null) return age < 18
      if (latest.minor === false) return false
      return null
    }
    const priceOf = row => {
      if (row.kind === 'free') return { priceState: 'free', priceText: PRICE_TEXT.free }
      const youth = youthStateOf(row.playerId)
      if (youth === true) return { priceState: 'hidden', priceText: PRICE_TEXT.youth }
      if (youth === null) return { priceState: 'unknown', priceText: PRICE_TEXT.unknown }
      if (row.amountFen == null || row.amountFen <= 0) return { priceState: 'not_recorded', priceText: PRICE_TEXT.missing }
      return { priceState: 'public', priceText: formatMoney(row.amountFen / 100) }
    }
    const tournamentTextOf = row => {
      const fromName = text(row.fromTournamentName) || teamNameOf(tournamentMap.get(text(row.fromTournamentId)))
      const toName = text(row.toTournamentName) || teamNameOf(tournamentMap.get(text(row.toTournamentId)))
      const singleName = teamNameOf(tournamentMap.get(text(row.tournamentId)))
      if (fromName && toName && text(row.fromTournamentId) !== text(row.toTournamentId)) return fromName + ' → ' + toName
      return toName || fromName || singleName
    }

    const transferItems = []
    for (const row of transfers) {
      const key = text(row.playerId)
      const player = playerMap.get(key)
      // 已删除的球员不再出现在公开动态里；资料缺失时退回单据上的历史姓名
      if (player && (text(player.status) === 'deleted' || player.isDeleted === true || synthetic(player))) { if (key) skippedPlayers.add(key); continue }
      if (synthetic(teamMap.get(row.fromTeamId)) || synthetic(teamMap.get(row.toTeamId))) continue
      const view = playerView(row.playerId)
      const playerName = view ? view.playerName : row.playerName
      if (!playerName) continue
      const price = priceOf(row)
      transferItems.push({
        kind: row.kind,
        playerId: key,
        playerName: playerName,
        // 转会可能涉及青少年球员，不下发形象照，页面用姓名首字头像
        positionText: view ? view.positionText : '',
        fromTeamName: row.fromTeamName,
        fromTeamLogo: row.fromTeamLogo || logoOf(teamMap.get(row.fromTeamId)),
        toTeamName: row.toTeamName,
        toTeamLogo: row.toTeamLogo || logoOf(teamMap.get(row.toTeamId)),
        tournamentName: tournamentTextOf(row),
        fromTournamentName: text(row.fromTournamentName) || teamNameOf(tournamentMap.get(text(row.fromTournamentId))),
        toTournamentName: text(row.toTournamentName) || teamNameOf(tournamentMap.get(text(row.toTournamentId))),
        isCrossEvent: Boolean(row.fromTournamentId && row.toTournamentId && row.fromTournamentId !== row.toTournamentId),
        typeText: row.typeText,
        priceState: price.priceState,
        priceText: price.priceText,
        completedAt: row.completedAt
      })
    }

    const updatedAt = valuationRows
      .map(row => isoText(row.computedAt))
      .filter(Boolean)
      .sort()
      .pop() || ''

    return {
      success: true,
      data: {
        schema: SCHEMA,
        updatedAt,
        // 范围回显：赛事按 id 与名称，年龄段按竞赛组别；未选赛事时为全平台口径
        scope: {
          mode: tournamentId ? 'tournament' : 'platform',
          tournamentId,
          tournamentName: teamNameOf(tournamentMap.get(tournamentId)),
          ageGroupId,
          ageGroupText
        },
        ageGroups,
        rosterState,
        valuationStatus,
        transferStatus: requestRead.status === 'not_recorded' && freeRead.status === 'not_recorded' ? 'not_recorded' : 'ready',
        scanLimited: {
          valuations: valuationLimited,
          transfers: requestRead.scanLimited || freeRead.scanLimited
        },
        skipped: skippedPlayers.size,
        transferCount,
        focus: transferItems.length ? transferItems[0] : null,
        transfers: transferItems.slice(1),
        top: topItems,
        rising: risingItems,
        players: playerItems,
        // roster＝本赛事已审名单；public_roster＝公开赛事已审名单合并。均含未测算。
        playerPool,
        // 池子里的人数（含资料缺失未出行的行），页面据此判断是否还有更多，不按已出行数缩水
        playerTotal: poolTotal,
        // 已展示行里真正完成身价测算的数量，未测算与青少年不公开都不计入
        playerMeasuredCount: playerItems.filter(item => item.measured === true).length,
        playerLimit: LIMITS.players,
        playerHasMore: playerPage.hasMore,
        nextPlayerCursor: playerPage.nextCursor,
        playerPoolVersion: playerPage.version,
        playerPageOffset: playerPage.offset
      }
    }
  } catch (failure) {
    console.error('[transferShowcase]', failure && (failure.code || failure.message))
    return { success: false, code: (failure && failure.code) || 'DATA_READ_FAILED', error: failure && failure.code === 'DATA_SCOPE_TOO_LARGE' ? '数据量较大，请先选择赛事查看' : '转会市场加载失败，请稍后重试' }
  }
}

module.exports = { SCHEMA, LIMITS, handle }
