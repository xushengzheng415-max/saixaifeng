export function calculatePreMatchSuspensions({
  matches = [],
  currentMatch,
  homeRoster = { players: [] },
  awayRoster = { players: [] },
  rules,
  tournamentId = '',
  divisionId = '',
  manualActions = []
}) {
  const automatic = calculateEventSuspensions({ matches, currentMatch, homeRoster, awayRoster, rules, tournamentId, divisionId })
  // 追加停赛单独折算；任一来源无法可靠计算时整体视为不完整，不凭空标记停赛。
  const manual = calculateManualSuspensions(manualActions, matches, currentMatch, divisionId, tournamentId)
  if (!automatic.complete) return { ids: new Set(), complete: false, reason: automatic.reason }
  if (!manual.complete) return { ids: new Set(), complete: false, reason: manual.reason }
  return { ids: new Set([...automatic.ids, ...manual.ids]), complete: true, reason: '' }
}

function calculateEventSuspensions({
  matches = [],
  currentMatch,
  homeRoster = { players: [] },
  awayRoster = { players: [] },
  rules,
  tournamentId = '',
  divisionId = ''
}) {
  if (!rules) return { ids: new Set(), complete: false, reason: '当前组别未找到停赛规则' }
  const yellowThreshold = Number(rules.yellowCardsForSuspension)
  const yellowBan = Number(rules.yellowCardSuspensionMatches ?? 1)
  const redBan = Number(rules.redCardSuspensionMatches)
  const secondYellowBan = Number(rules.secondYellowSuspensionMatches)
  if (!(yellowThreshold > 0) || !(yellowBan >= 0) || !(redBan >= 0) || !(secondYellowBan >= 0)) {
    return { ids: new Set(), complete: false, reason: '停赛规则不完整' }
  }

  const currentTime = `${currentMatch.matchDate || ''} ${currentMatch.matchTime || ''}`
  const teamIds = new Set([String(currentMatch.homeTeamId || ''), String(currentMatch.awayTeamId || '')])
  const relevant = matches.filter(item => {
    if (String(item._id) === String(currentMatch._id)) return false
    if (String(item.tournamentId || '') !== String(currentMatch.tournamentId || tournamentId)) return false
    if (String(item.divisionId || '') !== String(currentMatch.divisionId || divisionId)) return false
    const includesTeam = [item.homeTeamId, item.awayTeamId].some(id => teamIds.has(String(id || '')))
    const time = `${item.matchDate || ''} ${item.matchTime || ''}`
    return includesTeam && time < currentTime && ['finished', 'completed'].includes(String(item.status || '').toLowerCase())
  }).sort((a, b) => `${a.matchDate || ''} ${a.matchTime || ''}`.localeCompare(`${b.matchDate || ''} ${b.matchTime || ''}`))

  if (matches.length >= 1000) return { ids: new Set(), complete: false, reason: '历史比赛超过读取上限，未自动标记停赛' }
  if (relevant.some(item => !Array.isArray(item.events))) return { ids: new Set(), complete: false, reason: '历史比赛事件记录不完整，未自动标记停赛' }
  const stageOf = item => String(item.stage || item.phase || item.stageName || item.roundType || '').trim()
  const isKnockout = value => /knockout|淘汰|决赛|半决赛|四分之一|八强|四强/i.test(value)
  if ((rules.clearYellowCardsAfterGroup || rules.carryCardsToKnockout === false)
    && (!stageOf(currentMatch) || relevant.some(item => !stageOf(item)))) {
    return { ids: new Set(), complete: false, reason: '历史阶段信息不完整，无法按组别规则计算停赛' }
  }

  const bans = new Map()
  const yellows = new Map()
  const previousStageByTeam = new Map()
  for (const item of relevant) {
    const stage = stageOf(item)
    for (const teamId of [item.homeTeamId, item.awayTeamId].map(value => String(value || ''))) {
      if (!teamIds.has(teamId)) continue
      const previousStage = previousStageByTeam.get(teamId) || ''
      if (stage && previousStage && isKnockout(stage) && !isKnockout(previousStage)
        && (rules.clearYellowCardsAfterGroup || rules.carryCardsToKnockout === false)) {
        for (const key of yellows.keys()) if (key.startsWith(`${teamId}:`)) yellows.set(key, 0)
      }
      if (stage) previousStageByTeam.set(teamId, stage)
      for (const [key, remaining] of bans) {
        if (key.startsWith(`${teamId}:`) && remaining > 0) bans.set(key, remaining - 1)
      }
    }
    for (const event of item.events) {
      const type = String(event?.type || event?.eventType || '').toLowerCase()
      const isYellow = ['yellow_card', 'second_yellow_red'].includes(type)
      const isRed = ['red_card', 'second_yellow_red'].includes(type)
      if (!isYellow && !isRed) continue
      const playerId = String(event.playerId || event.player_id || '').trim()
      const eventTeamId = String(event.teamId || (event.teamSide === 'away' ? item.awayTeamId : item.homeTeamId) || '').trim()
      if (!playerId || !eventTeamId || !teamIds.has(eventTeamId)) {
        return { ids: new Set(), complete: false, reason: '历史红黄牌缺少稳定球员或球队编号，未自动标记停赛' }
      }
      const playerKey = `${eventTeamId}:${playerId}`
      if (isYellow) {
        const yellowCount = Number(event.yellowCardCount || event.cardCount || (type === 'second_yellow_red' ? 2 : 1))
        const count = (yellows.get(playerKey) || 0) + Math.max(1, yellowCount)
        if (count >= yellowThreshold) {
          if (yellowBan > 0) bans.set(playerKey, Math.max(bans.get(playerKey) || 0, yellowBan))
          yellows.set(playerKey, 0)
        } else yellows.set(playerKey, count)
      }
      if (isRed) {
        const matchesToBan = type === 'second_yellow_red' ? secondYellowBan : redBan
        if (matchesToBan > 0) bans.set(playerKey, Math.max(bans.get(playerKey) || 0, matchesToBan))
      }
    }
  }

  const ids = new Set()
  for (const [teamId, roster] of [[String(currentMatch.homeTeamId || ''), homeRoster], [String(currentMatch.awayTeamId || ''), awayRoster]]) {
    roster.players.forEach(player => {
      if (player.playerId && bans.get(`${teamId}:${player.playerId}`) > 0) ids.add(player.playerId)
    })
  }
  return { ids, complete: true, reason: '' }
}

// 追加停赛：从处罚场次之后的该队同组别比赛起，依次顺延 suspensionMatches 场。
// 缺球员编号、处罚场次无法定位或比赛时间顺序不完整时，返回不完整而不是猜测。
function calculateManualSuspensions(manualActions = [], matches = [], currentMatch, divisionId = '', tournamentId = '') {
  const ids = new Set()
  const effective = (manualActions || []).filter(item => item && String(item.status || '') === 'effective')
  if (!effective.length) return { ids, complete: true, reason: '' }
  const teamIds = [currentMatch.homeTeamId, currentMatch.awayTeamId].map(value => String(value || '')).filter(Boolean)
  const currentId = String(currentMatch._id || currentMatch.id || '')
  const tournamentKey = String(currentMatch.tournamentId || tournamentId || '')
  const divisionKey = String(currentMatch.divisionId || divisionId || '')
  const scheduleKey = item => `${item.matchDate || ''} ${item.matchTime || ''}`
  for (const action of effective) {
    const teamId = String(action.teamId || '')
    if (!teamId || !teamIds.includes(teamId)) continue
    const banCount = Number(action.suspensionMatches)
    if (!Number.isInteger(banCount) || banCount < 1) {
      return { ids: new Set(), complete: false, reason: '追加停赛缺少有效停赛场次，未自动标记' }
    }
    const playerId = String(action.playerId || '').trim()
    if (!playerId) return { ids: new Set(), complete: false, reason: '追加停赛缺少球员编号，未自动标记' }
    const teamMatches = (matches || []).filter(item => {
      if (!item || item.isBye || ['cancelled', 'canceled'].includes(String(item.status || '').toLowerCase())) return false
      if (String(item.tournamentId || '') !== tournamentKey) return false
      if (String(item.divisionId || '') !== divisionKey) return false
      return [item.homeTeamId, item.awayTeamId].some(id => String(id || '') === teamId)
    })
    if (teamMatches.some(item => !item.matchDate || !item.matchTime)) {
      return { ids: new Set(), complete: false, reason: '追加停赛的该队比赛时间不完整，无法确定顺延顺序' }
    }
    const ordered = teamMatches.slice().sort((a, b) => scheduleKey(a).localeCompare(scheduleKey(b))
      || String(a.matchNo || a.matchSequence || '').localeCompare(String(b.matchNo || b.matchSequence || ''), 'zh-CN', { numeric: true }))
    const keys = ordered.map(scheduleKey)
    if (new Set(keys).size !== keys.length) {
      return { ids: new Set(), complete: false, reason: '追加停赛的该队比赛时间重复，无法确定顺延顺序' }
    }
    const anchorId = String(action.matchId || '')
    const anchorNo = String(action.matchNo || '')
    let anchorIndex = anchorId ? ordered.findIndex(item => String(item._id || item.id || '') === anchorId) : -1
    if (anchorIndex < 0 && anchorNo) {
      const byNo = ordered.map((item, index) => ({ index, no: String(item.matchNo || item.matchSequence || item.sequence || '') })).filter(item => item.no && item.no === anchorNo)
      if (byNo.length === 1) anchorIndex = byNo[0].index
      else if (byNo.length > 1) return { ids: new Set(), complete: false, reason: '追加停赛的场次编号重复，未自动标记' }
    }
    if (anchorIndex < 0) return { ids: new Set(), complete: false, reason: '追加停赛无法定位处罚场次，未自动标记' }
    const currentIndex = ordered.findIndex(item => String(item._id || item.id || '') === currentId)
    if (currentIndex < 0) continue
    if (currentIndex > anchorIndex && currentIndex <= anchorIndex + banCount) ids.add(playerId)
  }
  return { ids, complete: true, reason: '' }
}
