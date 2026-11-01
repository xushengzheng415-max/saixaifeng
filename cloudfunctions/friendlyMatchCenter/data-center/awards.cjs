'use strict'
// 赛事奖项统一评定：MVP、金靴、金手套、最佳阵容（8 人制基准 1-3-3-1）与球队奖项。
// 只使用已归档正式赛果与统一比赛事件口径，禁止在页面端另写评选算法。
const str = value => String(value == null ? '' : value).trim()
const num = value => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0 }

const POSITION_BUCKET = {
  GK: 'GK',
  CB1: 'DF', CB2: 'DF', CB3: 'DF', LCB: 'DF', RCB: 'DF', CB: 'DF', LB: 'DF', RB: 'DF', SW: 'DF',
  CM1: 'MF', CM2: 'MF', CM3: 'MF', CM: 'MF', DM: 'MF', AM: 'MF', LM: 'MF', RM: 'MF', LWB: 'MF', RWB: 'MF',
  FW: 'FW', ST: 'FW', ST1: 'FW', ST2: 'FW', CF: 'FW', LW: 'FW', RW: 'FW'
}
const POSITION_LABEL = {
  GK: '门将', DF: '后卫', MF: '中场', FW: '前锋'
}
// 8 人制基础阵容：1 门将 + 3 后卫 + 3 中场 + 1 前锋
const BEST_XI_SLOTS = [
  { key: 'GK', bucket: 'GK', count: 1, label: '门将' },
  { key: 'DF', bucket: 'DF', count: 3, label: '后卫' },
  { key: 'MF', bucket: 'MF', count: 3, label: '中场' },
  { key: 'FW', bucket: 'FW', count: 1, label: '前锋' }
]
const GOAL_TYPES = new Set(['goal', 'penalty_scored'])
const CARD_TYPES = { yellow_card: 'yellow', red_card: 'red', second_yellow_red: 'red' }

// 生涯荣誉归档：只取已归档正式赛事的系统评定结果，成就分与转会评估成就口径同刻度。
const HONOR_POINTS = Object.freeze({ mvp: 50, topScorer: 40, goalkeeper: 40, bestXI: 40 })
const HONOR_TITLES = { mvp: 'MVP·最有价值球员', topScorer: '金靴奖·最佳射手', goalkeeper: '金手套奖·最佳守门员', bestXI: '最佳阵容' }

function bucketOf(role) {
  return POSITION_BUCKET[str(role).toUpperCase()] || ''
}

function officialMatch(match) {
  return match && match.scoreReady && ['approved','official','archived'].includes(match.resultStatus)
}

// 已取消或轮空占位场次不会产生赛果，不能计入归档完备性；否则整届赛事永远无法评定荣誉。
const NOT_PLAYED_STATUS = new Set(['cancelled','canceled','void','abandoned'])
function expectedMatch(match) {
  return Boolean(match) && match.isBye !== true && !NOT_PLAYED_STATUS.has(str(match.status).toLowerCase())
}

// 首发来源优先级：比赛阵容（含槽位角色） → 阵容快照（starters 可能是球员 ID 列表）。
// 只统计首发，替补不计入出场与位置统计。
function lineupStarters(match, side) {
  const expand = raw => {
    if (!raw || typeof raw !== 'object') return []
    if (Array.isArray(raw)) return raw.filter(entry => typeof entry === 'string' || (entry && typeof entry === 'object'))
    const players = Array.isArray(raw.players) ? raw.players : []
    if (Array.isArray(raw.starters)) {
      return raw.starters.map(entry => {
        if (typeof entry !== 'string') return entry
        return players.find(row => str(row.playerId || row.id || row._id) === entry) || { playerId: entry }
      }).filter(Boolean)
    }
    return players
  }
  const primary = expand(match.lineups && match.lineups[side])
  if (primary.length) return primary
  return expand(match[side + 'Lineup'])
}

function playerIdentity(row) {
  if (typeof row === 'string') return str(row)
  const id = str(row && (row.playerId || row.id || row._id))
  return id || (str(row && (row.name || row.playerName)) ? `name:${str(row.name || row.playerName)}` : '')
}

function teamSideOfEvent(event) {
  return str(event && (event.teamSide || event.side)).toLowerCase() === 'away' ? 'away' : 'home'
}

// 统计单场赛果归属，供球队奖项与门将零封使用
function matchOutcome(match, side) {
  const home = num(match.homeScore), away = num(match.awayScore)
  const own = side === 'home' ? home : away
  const other = side === 'home' ? away : home
  return { win: own > other, draw: own === other, loss: own < other, conceded: other, scored: own }
}

function collectMetrics({ matches, eventsByMatchId = {}, divisionRows = [] }) {
  const players = new Map()
  const teams = new Map()
  const ensurePlayer = key => {
    if (!players.has(key)) players.set(key, {
      key, playerId: str(key).startsWith('name:') ? '' : key, name: '', teamId: '', teamName: '', divisionId: '',
      appearances: 0, goals: 0, assists: 0, yellow: 0, red: 0, wins: 0, draws: 0, losses: 0,
      gkAppearances: 0, gkConceded: 0, gkCleanSheets: 0, positionRoles: {}
    })
    return players.get(key)
  }
  const teamKeyOf = (teamId, teamName) => str(teamId) || `name:${str(teamName)}`
  const ensureTeam = (teamId, teamName, divisionId, divisionName) => {
    const key = teamKeyOf(teamId, teamName)
    if (!teams.has(key)) teams.set(key, { key, teamId: str(teamId), teamName: str(teamName) || '未命名球队', divisionId: str(divisionId), divisionName: str(divisionName) || '未分组别' })
    const row = teams.get(key)
    if (!row.teamName && teamName) row.teamName = str(teamName)
    return row
  }
  const divisionNameOf = id => {
    const found = (divisionRows || []).find(item => str(item.id || item._id) === str(id))
    return found ? str(found.name) || '未命名组别' : ''
  }

  for (const match of matches || []) {
    if (!officialMatch(match)) continue
    const divisionId = str(match.divisionId)
    const divisionName = str(match.divisionName) || divisionNameOf(divisionId) || '未分组别'
    const sides = [
      { side: 'home', teamId: str(match.homeTeamId), teamName: str(match.homeTeamName) },
      { side: 'away', teamId: str(match.awayTeamId), teamName: str(match.awayTeamName) }
    ]
    for (const row of sides) {
      if (!row.teamId && !row.teamName) continue
      const team = ensureTeam(row.teamId, row.teamName, divisionId, divisionName)
      const outcome = matchOutcome(match, row.side)
      team.played = num(team.played) + 1
      team.scored = num(team.scored) + outcome.scored
      team.conceded = num(team.conceded) + outcome.conceded
      team.wins = num(team.wins) + (outcome.win ? 1 : 0)
      team.draws = num(team.draws) + (outcome.draw ? 1 : 0)
      team.losses = num(team.losses) + (outcome.loss ? 1 : 0)
      team.points = num(team.points) + (outcome.win ? 3 : outcome.draw ? 1 : 0)

      const starters = lineupStarters(match, row.side)
      for (const entry of starters) {
        const key = playerIdentity(entry)
        if (!key) continue
        const player = ensurePlayer(key)
        if (!player.name) player.name = str(entry.name || entry.playerName)
        if (!player.teamId) { player.teamId = team.teamId; player.teamName = team.teamName; player.divisionId = team.divisionId }
        player.appearances += 1
        player.wins += outcome.win ? 1 : 0
        player.draws += outcome.draw ? 1 : 0
        player.losses += outcome.loss ? 1 : 0
        const role = str(entry.role || entry.position || entry.slotRole).toUpperCase()
        if (role) player.positionRoles[role] = num(player.positionRoles[role]) + 1
        if (role === 'GK') {
          player.gkAppearances += 1
          player.gkConceded += outcome.conceded
          if (outcome.conceded === 0) player.gkCleanSheets += 1
        }
      }
    }

    for (const event of eventsByMatchId[str(match.id || match._id)] || []) {
      const type = str(event && event.type)
      if (!type) continue
      const side = teamSideOfEvent(event)
      const sideRow = sides.find(item => item.side === side) || {}
      const team = ensureTeam(sideRow.teamId, sideRow.teamName, divisionId, divisionName)
      const scorerKey = str(event.playerId || event.player_id) || (str(event.playerName || event.player) ? `name:${str(event.playerName || event.player)}` : '')
      if (GOAL_TYPES.has(type) && scorerKey) {
        const player = ensurePlayer(scorerKey)
        if (!player.name) player.name = str(event.playerName || event.player)
        if (!player.teamId) { player.teamId = team.teamId; player.teamName = team.teamName; player.divisionId = team.divisionId }
        player.goals += 1
      }
      const assistKey = str(event.assistPlayerId || event.assist_player_id) || (str(event.assistName || event.assist) ? `name:${str(event.assistName || event.assist)}` : '')
      if (GOAL_TYPES.has(type) && assistKey && assistKey !== scorerKey) {
        const assist = ensurePlayer(assistKey)
        if (!assist.name) assist.name = str(event.assistName || event.assist)
        if (!assist.teamId) { assist.teamId = team.teamId; assist.teamName = team.teamName; assist.divisionId = team.divisionId }
        assist.assists += 1
      }
      const cardKind = CARD_TYPES[type]
      if (cardKind && scorerKey) {
        const player = ensurePlayer(scorerKey)
        if (!player.name) player.name = str(event.playerName || event.player)
        if (!player.teamId) { player.teamId = team.teamId; player.teamName = team.teamName; player.divisionId = team.divisionId }
        if (cardKind === 'red') player.red += 1
        else player.yellow += 1
      }
    }
  }

  const rows = [...players.values()].filter(row => row.appearances > 0 || row.goals > 0 || row.assists > 0)
  for (const row of rows) {
    const roles = Object.entries(row.positionRoles).sort((a, b) => b[1] - a[1])
    row.positionRole = roles.length ? roles[0][0] : ''
    row.positionBucket = bucketOf(row.positionRole)
    row.contribution = row.goals * 5 + row.assists * 3 + row.appearances * 1 + row.wins * 1 - row.red * 3 - row.yellow * 1
    row.goalsPerMatch = row.appearances ? row.goals / row.appearances : row.goals
    row.concededPerMatch = row.gkAppearances ? row.gkConceded / row.gkAppearances : null
  }
  return { players: rows, teams: [...teams.values()] }
}

function withTeamRank(rows, standings) {
  const rankByTeam = new Map()
  for (const group of standings || []) {
    const list = Array.isArray(group.officialTeams) ? group.officialTeams : []
    for (const team of list) {
      const key = str(team.teamId) || `name:${str(team.teamName)}`
      if (!rankByTeam.has(key)) rankByTeam.set(key, num(team.rank))
    }
  }
  return rows.map(row => Object.assign(row, { teamRank: rankByTeam.get(row.teamId) || rankByTeam.get(`name:${row.teamName}`) || 0 }))
}

function byTopScorer(a, b) {
  return b.goals - a.goals || b.assists - a.assists || a.appearances - b.appearances || (a.teamRank || 99) - (b.teamRank || 99) || a.name.localeCompare(b.name, 'zh-CN')
}

function byGlove(a, b) {
  return b.gkCleanSheets - a.gkCleanSheets ||
    (a.concededPerMatch == null ? 99 : a.concededPerMatch) - (b.concededPerMatch == null ? 99 : b.concededPerMatch) ||
    b.gkAppearances - a.gkAppearances ||
    (a.teamRank || 99) - (b.teamRank || 99) || a.name.localeCompare(b.name, 'zh-CN')
}

function byMvp(a, b) {
  return b.contribution - a.contribution || b.goals - a.goals || b.assists - a.assists || a.appearances - b.appearances || (a.teamRank || 99) - (b.teamRank || 99)
}

function playerView(row, extra) {
  return Object.assign({
    playerId: row.playerId, name: row.name, teamId: row.teamId, teamName: row.teamName,
    appearances: row.appearances, goals: row.goals, assists: row.assists, contribution: row.contribution,
    positionRole: row.positionRole, positionBucket: row.positionBucket,
    positionLabel: POSITION_LABEL[row.positionBucket] || '',
    yellow: row.yellow, red: row.red
  }, extra || {})
}

function pickBestXI(pool) {
  const remaining = [...pool]
  const take = (predicate) => {
    const index = remaining.findIndex(predicate)
    if (index < 0) return null
    return remaining.splice(index, 1)[0]
  }
  const slots = []
  // 先按位置自然选取，避免补位提前占用其他位置的合适人选
  for (const slot of BEST_XI_SLOTS) {
    for (let index = 0; index < slot.count; index += 1) {
      const natural = take(row => row.positionBucket === slot.bucket)
      if (natural) slots.push({ slot: slot.label, bucket: slot.bucket, row: natural, filled: false, note: '' })
    }
  }
  // 再对空缺位置按综合贡献补位（门将不从其他位置补）
  const filledSlots = []
  for (const slot of BEST_XI_SLOTS) {
    const owned = slots.filter(item => item.bucket === slot.bucket)
    const missing = slot.count - owned.length
    for (let index = 0; index < missing; index += 1) {
      const fallback = take(row => row.positionBucket !== 'GK')
      if (!fallback) break
      filledSlots.push({ slot: slot.label, bucket: slot.bucket, row: fallback, filled: true, note: `无本位置球员，按综合贡献补位（实际位置：${POSITION_LABEL[fallback.positionBucket] || '未记录'}）` })
    }
  }
  return [...slots, ...filledSlots].map(item => playerView(item.row, { slot: item.slot, bucket: item.bucket, filled: item.filled, note: item.note }))
    .sort((a, b) => BEST_XI_SLOTS.findIndex(x => x.key === a.bucket) - BEST_XI_SLOTS.findIndex(x => x.key === b.bucket))
}

const scoreOf = value => {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

// 名次排位赛（7-8 名决赛、5-6 名决赛、三四名决赛等）不是冠军决赛，不能用来判定冠军。
const PLACEMENT_FINAL = /半决赛|三四名|季军|名次|排位|交叉|名决赛|\d+\s*[-－—~至]\s*\d+\s*名/

function championshipFinals(divisionId, matches) {
  return (matches || []).filter(match => {
    if (!officialMatch(match) || str(match.divisionId) !== str(divisionId)) return false
    const label = [match.phase, match.phaseLabel, match.stageLabel, match.name, match.matchName].map(str).join(' ')
    if (!/final|决赛/i.test(label)) return false
    return !PLACEMENT_FINAL.test(label)
  }).sort((a, b) => num(b.round) - num(a.round) || num(b.matchNo) - num(a.matchNo) ||
    str(b.matchDate).localeCompare(str(a.matchDate)) || str(b.matchTime).localeCompare(str(a.matchTime)))
}

// 决赛胜方：先看比分，其次点球决胜，最后回退到已归档的晋级球队字段。
function decisiveWinnerSide(match) {
  const home = scoreOf(match.homeScore), away = scoreOf(match.awayScore)
  if (home == null || away == null) return ''
  if (home !== away) return home > away ? 'home' : 'away'
  const homePenalty = scoreOf(match.homePenaltyScore), awayPenalty = scoreOf(match.awayPenaltyScore)
  if (homePenalty != null && awayPenalty != null && homePenalty !== awayPenalty) return homePenalty > awayPenalty ? 'home' : 'away'
  const winnerTeamId = str(match.winnerTeamId), homeTeamId = str(match.homeTeamId), awayTeamId = str(match.awayTeamId)
  if (winnerTeamId && winnerTeamId === homeTeamId && winnerTeamId !== awayTeamId) return 'home'
  if (winnerTeamId && winnerTeamId === awayTeamId && winnerTeamId !== homeTeamId) return 'away'
  return ''
}

function divisionChampion(divisionId, matches, standings) {
  for (const finalMatch of championshipFinals(divisionId, matches)) {
    const winnerSide = decisiveWinnerSide(finalMatch)
    if (!winnerSide) continue
    const wonHome = winnerSide === 'home'
    return {
      champion: { teamId: wonHome ? finalMatch.homeTeamId : finalMatch.awayTeamId, teamName: wonHome ? finalMatch.homeTeamName : finalMatch.awayTeamName },
      runnerUp: { teamId: wonHome ? finalMatch.awayTeamId : finalMatch.homeTeamId, teamName: wonHome ? finalMatch.awayTeamName : finalMatch.homeTeamName },
      championBasis: '决赛胜者',
      runnerUpBasis: '决赛负者',
      basis: '决赛胜者'
    }
  }
  const group = (standings || []).filter(item => str(item.divisionId) === str(divisionId))
  const table = group.flatMap(item => (item.officialTeams || []).map(team => ({ ...team, groupName: item.groupName })))
    .sort((a, b) => num(a.rank) - num(b.rank))
  if (!table.length) return { champion: null, runnerUp: null, championBasis: '', runnerUpBasis: '', basis: '' }
  return {
    champion: { teamId: table[0].teamId, teamName: table[0].teamName },
    runnerUp: table[1] ? { teamId: table[1].teamId, teamName: table[1].teamName } : null,
    championBasis: '积分榜首位',
    runnerUpBasis: table[1] ? '积分榜第二位' : '',
    basis: '积分榜首位'
  }
}

function compute(input) {
  const { matches = [], eventsByMatchId = {}, standings = [], divisions = [], overrides = [] } = input || {}
  const divisionRows = (divisions || []).map(item => ({ id: str(item.id || item._id), name: str(item.name) }))
  const officialMatches = matches.filter(officialMatch)
  const totalMatches = matches.filter(expectedMatch).length
  const submittedMatches = officialMatches.length
  const { players, teams } = collectMetrics({ matches, eventsByMatchId, divisionRows })
  const ranked = withTeamRank(players, standings)

  const divisionIds = [...new Set([
    ...officialMatches.map(match => str(match.divisionId)),
    ...(standings || []).map(item => str(item.divisionId))
  ].filter(Boolean))]

  const overrideFor = (divisionId, awardKey) => (overrides || []).find(row => str(row.divisionId) === str(divisionId) && str(row.awardKey) === awardKey)
  const applyOverride = (divisionId, awardKey, fallback) => {
    const override = overrideFor(divisionId, awardKey)
    if (!override) return fallback
    const player = ranked.find(row => row.playerId === str(override.playerId)) || null
    const base = player ? playerView(player, player.gkAppearances ? {
      cleanSheets: player.gkCleanSheets, gkAppearances: player.gkAppearances, gkConceded: player.gkConceded, concededPerMatch: player.concededPerMatch
    } : {}) : { playerId: str(override.playerId), name: str(override.playerName) || '手动指定球员', teamId: '', teamName: '' }
    return Object.assign(base, { manual: true, note: str(override.note) || '主办方手动调整' })
  }

  const divisionResults = divisionIds.map(divisionId => {
    const divisionName = str((officialMatches.find(match => str(match.divisionId) === divisionId) || {}).divisionName) || str((divisionRows.find(row => row.id === divisionId) || {}).name) || '未分组别'
    const pool = ranked.filter(row => str(row.divisionId) === divisionId)
    const scorers = [...pool].sort(byTopScorer)
    const keepers = pool.filter(row => row.gkAppearances > 0).sort(byGlove)
    const mvpPool = [...pool].sort(byMvp)
    const teamTable = teams.filter(row => str(row.divisionId) === divisionId && row.played > 0)
    const outcome = divisionChampion(divisionId, matches, standings)
    const fairPlay = [...teamTable].sort((a, b) => {
      const cardsA = pool.filter(row => row.teamId === a.teamId).reduce((sum, row) => sum + row.yellow + row.red * 3, 0)
      const cardsB = pool.filter(row => row.teamId === b.teamId).reduce((sum, row) => sum + row.yellow + row.red * 3, 0)
      return cardsA - cardsB || a.played - b.played || a.teamName.localeCompare(b.teamName, 'zh-CN')
    })[0]
    const bestAttack = [...teamTable].sort((a, b) => b.scored - a.scored || a.played - b.played)[0]
    const bestDefense = [...teamTable].sort((a, b) => a.conceded - b.conceded || b.played - a.played)[0]

    return {
      divisionId, divisionName,
      matchCount: officialMatches.filter(match => str(match.divisionId) === divisionId).length,
      teamCount: teamTable.length,
      champion: outcome.champion,
      runnerUp: outcome.runnerUp,
      championBasis: outcome.championBasis || outcome.basis,
      runnerUpBasis: outcome.runnerUpBasis || '',
      topScorer: applyOverride(divisionId, 'topScorer', scorers[0] ? playerView(scorers[0], { goals: scorers[0].goals, assists: scorers[0].assists }) : null),
      goalkeeper: applyOverride(divisionId, 'goalkeeper', keepers[0] ? playerView(keepers[0], {
        cleanSheets: keepers[0].gkCleanSheets, gkAppearances: keepers[0].gkAppearances, gkConceded: keepers[0].gkConceded,
        concededPerMatch: keepers[0].concededPerMatch
      }) : null),
      mvp: applyOverride(divisionId, 'mvp', mvpPool[0] ? playerView(mvpPool[0]) : null),
      bestXI: (() => {
        const xi = pickBestXI(pool)
        return xi.map(slot => {
          const override = (overrides || []).find(row => str(row.divisionId) === str(divisionId) && str(row.awardKey) === `bestXI:${slot.slot}`)
          if (!override) return slot
          const player = ranked.find(row => row.playerId === str(override.playerId))
          return Object.assign({}, slot, player ? playerView(player) : { playerId: str(override.playerId), name: str(override.playerName) || '手动指定球员', teamName: '' }, { slot: slot.slot, bucket: slot.bucket, filled: false, manual: true, note: str(override.note) || '主办方手动调整' })
        })
      })(),
      candidates: [...pool].sort(byMvp).slice(0, 80).map(row => ({
        playerId: row.playerId, name: row.name, teamName: row.teamName, goals: row.goals, assists: row.assists,
        contribution: row.contribution, positionLabel: POSITION_LABEL[row.positionBucket] || '未记录位置'
      })),
      teamAwards: [
        { key: 'champion', title: '冠军', teamName: outcome.champion ? outcome.champion.teamName : '', note: outcome.championBasis || outcome.basis || '' },
        { key: 'runnerUp', title: '亚军', teamName: outcome.runnerUp ? outcome.runnerUp.teamName : '', note: outcome.runnerUpBasis || '' },
        { key: 'bestAttack', title: '最佳进攻球队', teamName: bestAttack ? bestAttack.teamName : '', note: bestAttack ? `进球 ${num(bestAttack.scored)}` : '' },
        { key: 'bestDefense', title: '失球最少球队', teamName: bestDefense ? bestDefense.teamName : '', note: bestDefense ? `失球 ${num(bestDefense.conceded)}` : '' },
        { key: 'fairPlay', title: '公平竞赛奖', teamName: fairPlay ? fairPlay.teamName : '', note: '红黄牌记分最少' }
      ].filter(item => item.teamName),
      standings: (standings || []).filter(item => str(item.divisionId) === divisionId).map(item => ({
        groupName: str(item.groupName) || '联赛',
        rows: (item.officialTeams || []).map(team => ({ rank: num(team.rank), teamName: team.teamName, played: num(team.played), wins: num(team.wins == null ? team.win : team.wins), draws: num(team.draws == null ? team.draw : team.draws), losses: num(team.losses == null ? team.loss : team.losses), goalsFor: num(team.goalsFor), goalsAgainst: num(team.goalsAgainst), goalDifference: num(team.goalDifference), points: num(team.points) }))
      }))
    }
  }).sort((a, b) => a.divisionName.localeCompare(b.divisionName, 'zh-CN', { numeric: true }))

  const allScorers = [...ranked].sort(byTopScorer)
  const divisionMvps = divisionResults.map(item => item.mvp).filter(Boolean)
  const overallMvp = divisionMvps.sort(byMvp)[0] || null

  return {
    awardsVersion: 'football-tournament-awards/2',
    ready: officialMatches.length > 0 && submittedMatches === totalMatches,
    totalMatches, submittedMatches,
    overall: {
      mvp: overallMvp ? Object.assign({}, overallMvp, {
        divisionName: (divisionResults.find(item => item.mvp && item.mvp.playerId === overallMvp.playerId) || {}).divisionName || ''
      }) : null,
      topScorer: allScorers[0] ? playerView(allScorers[0], {
        divisionName: (divisionResults.find(item => str(item.divisionId) === str(allScorers[0].divisionId)) || {}).divisionName || ''
      }) : null
    },
    divisions: divisionResults,
    rules: [
      '金靴奖（最佳射手）：总进球数（含点球）最多；进球相同比助攻，再比出场次数更少，最后比所在球队积分排名。',
      'MVP（最有价值球员）：球员贡献分 = 进球×5 + 助攻×3 + 首发场次×1 + 首发胜场×1 − 红牌×3 − 黄牌×1；同分依次比进球、助攻、出场更少、球队排名。各组 MVP 取组内最高分，总 MVP 取各组 MVP 中最高分。',
      '金手套奖（最佳守门员）：零封场次最多；相同比场均失球更低，再比出场次数更多，最后比球队排名。仅统计以门将位置首发的比赛。',
      '最佳阵容（每组，8 人制基准 1-3-3-1）：门将 1 名取金手套排名最高者；后卫、中场、前锋各按贡献分从高到低选取；本位置人数不足时按贡献分补位并标注。',
      '球队奖项：冠军取冠军决赛胜者（平局按点球决胜或晋级球队判定，名次排位赛不计入；无冠军决赛时取积分榜首位），最佳进攻取进球最多，失球最少取失球最少，公平竞赛奖按红黄牌记分（红牌×3＋黄牌）最少。',
      '统计口径：只计入已归档且无异常的正式赛果；奖项在全部比赛录入完成后生成，主办方可在成绩册中手动调整并留痕。'
    ]
  }
}

// 从单届赛事奖项结果中汇总某球员的生涯荣誉；赛事未全部归档时不产生荣誉记录。
function playerHonors(awards, meta = {}) {
  const playerId = str(meta.playerId)
  if (!playerId || !awards || awards.ready !== true) return []
  // 历史数据里同一个人可能同时以档案 _id 与球员编号出现在阵容中，按别名集合匹配，避免漏记荣誉。
  const aliasIds = new Set([playerId, ...(meta.aliasIds || []).map(str)].filter(Boolean))
  const base = { tournamentId: str(meta.tournamentId), tournamentName: str(meta.tournamentName), playerId }
  const rows = []
  const add = (key, division, row, extra) => {
    if (!row || !aliasIds.has(str(row.playerId))) return
    const slot = str(extra && extra.slot)
    rows.push({
      id: [base.tournamentId, str(division.divisionId), key, slot].join(':'),
      ...base,
      divisionId: str(division.divisionId), divisionName: str(division.divisionName),
      key, title: key === 'bestXI' ? `${HONOR_TITLES.bestXI}·${slot || '入选'}` : HONOR_TITLES[key],
      points: HONOR_POINTS[key],
      goals: num(row.goals), assists: num(row.assists), contribution: num(row.contribution),
      cleanSheets: row.cleanSheets == null ? null : num(row.cleanSheets),
      slot, filled: Boolean(extra && extra.filled), manual: row.manual === true
    })
  }
  for (const division of awards.divisions || []) {
    add('mvp', division, division.mvp)
    add('topScorer', division, division.topScorer)
    add('goalkeeper', division, division.goalkeeper)
    for (const slot of division.bestXI || []) add('bestXI', division, slot, { slot: slot.slot, filled: slot.filled })
  }
  return rows
}

module.exports = { compute, playerHonors, bucketOf, BEST_XI_SLOTS, HONOR_POINTS }
