export function calculatePreMatchSuspensions({
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
