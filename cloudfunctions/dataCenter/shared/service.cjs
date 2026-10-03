'use strict'
const { readAll, readByIds } = require('./reader.cjs')
const { readPlayerSupportTotals } = require('./support.cjs')
const id = value => value == null ? '' : String(value).trim()

function error(code, message) { const value = new Error(message); value.code = code; return value }
function validateScope(input = {}) {
  const scope = { sportType:'football', mode:input.mode || 'official' }
  if (!['official','provisional'].includes(scope.mode)) throw error('DATA_MODE_INVALID', '请选择正式或现场统计')
  if (input.sportType && input.sportType !== 'football') throw error('DATA_SPORT_INVALID', '当前接口仅支持足球统计')
  for (const field of ['teamId','playerId','tournamentId','divisionId']) {
    if (input[field] != null && (typeof input[field] !== 'string' || input[field].length > 100)) throw error('DATA_SCOPE_INVALID', '统计范围格式错误')
    if (id(input[field])) scope[field] = id(input[field])
  }
  for (const field of ['from','to']) {
    if (input[field]) {
      if (typeof input[field] !== 'string' || !Number.isFinite(new Date(input[field]).getTime())) throw error('DATA_DATE_INVALID', '统计日期无效')
      scope[field] = new Date(input[field]).toISOString()
    }
  }
  if (scope.from && scope.to && scope.from >= scope.to) throw error('DATA_DATE_INVALID', '结束日期应晚于开始日期')
  return scope
}

function createDataService(db) {
  // Call only after the caller has independently authorized access to this player.
  // A team-scoped query cannot prove full career coverage after transfers.
  async function playerCardForAuthorizedPlayer(playerId) {
    if (!id(playerId)) throw error('DATA_SCOPE_INVALID', '缺少球员信息')
    const result = await query({ platformOwner:true, teamIds:[], tournamentIds:[] }, { playerId:id(playerId), mode:'official' })
    return result.playerCard
  }
  async function catalog(actor) {
    const { synthetic } = await import('./statistics.mjs')
    const teams = actor.platformOwner ? await readAll(db, 'teams') : await readByIds(db, 'teams', '_id', actor.teamIds)
    const syntheticTeamIds = new Set(teams.filter(synthetic).map(row => id(row._id)))
    const tournaments = actor.platformOwner ? await readAll(db, 'tournaments') : await readByIds(db, 'tournaments', '_id', actor.tournamentIds)
    const players = actor.platformOwner ? await readAll(db, 'players') : [...await readByIds(db,'players','teamId',actor.teamIds), ...await readByIds(db,'players','teamCode',actor.teamIds)]
    return {
      success:true, accessScope:actor.platformOwner ? 'platform' : 'authorized',
      teams:teams.filter(row => !synthetic(row)).map(row => ({ id:id(row._id), name:id(row.name || row.teamName), orgId:id(row.orgId || row.organizationId) })),
      tournaments:tournaments.filter(row => !synthetic(row)).map(row => ({ id:id(row._id), name:id(row.name), orgId:id(row.orgId || row.organizationId) })),
      players:[...new Map(players.filter(row => !synthetic(row) && !syntheticTeamIds.has(id(row.teamId || row.teamCode))).map(row => [id(row._id), { id:id(row._id), name:id(row.name), teamId:id(row.teamId || row.teamCode), status:id(row.status) }])).values()]
    }
  }
  async function query(actor, input = {}) {
    const scope = validateScope(input)
    const teamIds = new Set((actor.teamIds || []).map(String)), tournamentIds = new Set((actor.tournamentIds || []).map(String))
    if (scope.teamId && !actor.platformOwner && !teamIds.has(scope.teamId)) throw error('DATA_FORBIDDEN', '无权查看该球队的数据')
    if (scope.tournamentId && !actor.platformOwner && !tournamentIds.has(scope.tournamentId) && !scope.teamId) throw error('DATA_FORBIDDEN', '无权查看该赛事的数据')
    let matches
    if (scope.tournamentId && (actor.platformOwner || tournamentIds.has(scope.tournamentId))) matches = await readAll(db,'matches',{ tournamentId:scope.tournamentId })
    else if (scope.teamId) matches = [...await readAll(db,'matches',{ homeTeamId:scope.teamId }), ...await readAll(db,'matches',{ awayTeamId:scope.teamId })]
    else if (actor.platformOwner) matches = await readAll(db,'matches')
    else matches = [...await readByIds(db,'matches','tournamentId',[...tournamentIds]), ...await readByIds(db,'matches','homeTeamId',[...teamIds]), ...await readByIds(db,'matches','awayTeamId',[...teamIds])]
    const { inScope, aggregateStatistics, sumPlayerRows, calculatePlayerCardPoints, PLAYER_CARD_SCORE_VERSION, PLAYER_CARD_ENTITLEMENT_VERSION, resultState, effectiveEvents, eventType, matchParticipantIds, synthetic } = await import('./statistics.mjs')
    matches = [...new Map(matches.filter(row => inScope(row,scope)).map(row => [id(row._id),row])).values()]
    if (actor.matchIds) { const allowed = new Set(actor.matchIds); matches = matches.filter(row => allowed.has(id(row._id))) }
    if (scope.playerId && !actor.platformOwner) {
      const profile = (await readByIds(db,'players','_id',[scope.playerId]))[0]
      const occurs = matches.some(match => ['home','away'].some(side => {
        const lineup = match[side + 'Lineup'] || match.lineups?.[side] || {}
        return (Array.isArray(lineup) ? lineup : [...(lineup.starters || lineup.players || []), ...(lineup.substitutes || [])]).some(row => id(row.playerId || row.id || row._id) === scope.playerId)
      }))
      if (!(profile && teamIds.has(id(profile.teamId || profile.teamCode))) && !occurs) throw error('DATA_FORBIDDEN', '无权查看该球员的数据')
    }
    const matchIds = matches.map(row => row._id)
    const events = await readByIds(db,'match_events','matchId',matchIds)
    const lineups = await readByIds(db,'match_lineup_snapshots','matchId',matchIds)
    const lineupByMatchSide = new Map()
    for (const lineup of lineups) {
      const match = matches.find(row => id(row._id) === id(lineup.matchId))
      if (!match || ['returned','rejected','draft'].includes(id(lineup.status))) continue
      const side = id(lineup.teamId) === id(match.homeTeamId) ? 'home' : id(lineup.teamId) === id(match.awayTeamId) ? 'away' : ''
      if (!side) continue
      const key = id(match._id) + ':' + side, previous = lineupByMatchSide.get(key)
      if (!previous || Number(lineup.version || 0) >= Number(previous.version || 0)) lineupByMatchSide.set(key,lineup)
    }
    matches = matches.map(match => {
      const row = { ...match }
      for (const side of ['home','away']) {
        if (!row[side + 'Lineup'] && !row.lineups?.[side]) row[side + 'Lineup'] = lineupByMatchSide.get(id(row._id) + ':' + side)
      }
      return row
    })
    const [divisions, tournaments, matchTeamProfiles] = await Promise.all([
      readByIds(db,'divisions','tournamentId',matches.map(row => row.tournamentId)),
      readByIds(db,'tournaments','_id',matches.map(row => row.tournamentId)),
      readByIds(db,'teams','_id',matches.flatMap(row => [row.homeTeamId,row.awayTeamId].filter(Boolean)))
    ])
    const divisionsById = Object.fromEntries(divisions.map(row => [id(row._id || row.id),row]))
    const tournamentsById = Object.fromEntries(tournaments.map(row => [id(row._id || row.id),row]))
    const teamsById = Object.fromEntries(matchTeamProfiles.map(row => [id(row._id),row]))
    const participantIds = [...new Set(matches.flatMap(match => [...matchParticipantIds(match,events)]))]
    const matchPlayerProfiles = await readByIds(db,'players','_id',participantIds)
    const playersById = Object.fromEntries(matchPlayerProfiles.map(row => [id(row._id),row]))
    const result = aggregateStatistics({ matches, events, scope, divisionsById, tournamentsById, teamsById, playersById, requireOriginEvidence:true, requirePlayerOriginEvidence:true })
    // Owning one team does not grant access to the opponent's personal archive.
    if (!actor.platformOwner && !scope.tournamentId) {
      result.players = result.players.filter(row => teamIds.has(row.teamId) || tournamentIds.has(row.tournamentId))
      result.teams = result.teams.filter(row => teamIds.has(row.teamId) || tournamentIds.has(row.tournamentId))
    }
    const profiles = actor.public ? [] : matchPlayerProfiles
    const profileById = new Map(profiles.map(row => [id(row._id),row]))
    result.players = result.players.map(row => ({ ...row, playerName:row.playerName || id(profileById.get(row.playerId)?.name) || '历史球员' }))
    const teamById = new Map(matchTeamProfiles.map(row => [id(row._id),row]))
    result.teams = result.teams.map(row => ({ ...row, teamName:id(teamById.get(row.teamId)?.name || teamById.get(row.teamId)?.teamName) || '历史球队' }))
    const { buildStandings } = require('./standings.cjs')
    result.standings = buildStandings(matches.map(match => {
      const matchEvents = effectiveEvents(match,events)
      const cardCount = (side,types) => matchEvents.filter(event => types.includes(eventType(event)) && (event.teamSide === side || id(event.teamId) === id(match[side + 'TeamId']))).length
      const phase = id(match.phase || match.stageType || match.matchType).toLowerCase()
      const state = resultState(match,{ teamsById,tournamentsById,playersById,events,requireOriginEvidence:true,requirePlayerOriginEvidence:true })
      const hasScore = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
      const divisionId = id(match.divisionId || match.division || 'default')
      return { ...match, divisionId, divisionName:id(divisionsById[divisionId]?.name || match.divisionName || '默认组别'), groupName:id(match.groupName || match.drawGroup || '联赛'),
        homeTeamName:id(teamById.get(id(match.homeTeamId))?.name || match.homeTeamName || '主队'), awayTeamName:id(teamById.get(id(match.awayTeamId))?.name || match.awayTeamName || '客队'),
        homeScore:Number(match.homeScore ?? match.scoreHome),awayScore:Number(match.awayScore ?? match.scoreAway),scoreReady:hasScore(match.homeScore ?? match.scoreHome) && hasScore(match.awayScore ?? match.scoreAway),
        resultStatus:state === 'official' ? 'approved' : state === 'provisional' ? 'pending_review' : 'not_submitted',
        standingsEligible:state === 'official' && match.standingsEligible !== false && match.isBye !== true && !['knockout','cup','placement','final','semifinal'].includes(phase) && (match.standingsEligible === true || ['group','league','round_robin'].includes(phase)),
        yellowHome:cardCount('home',['yellow_card','second_yellow']),yellowAway:cardCount('away',['yellow_card','second_yellow']),redHome:cardCount('home',['red_card','second_yellow']),redAway:cardCount('away',['red_card','second_yellow']) }
    }),divisionsById)
    const memberships = scope.playerId && !actor.public ? await readAll(db,'player_team_memberships',{ playerId:scope.playerId }) : []
    result.memberships = memberships.filter(row => actor.platformOwner || teamIds.has(id(row.teamId))).map(row => ({ id:id(row._id), playerId:id(row.playerId), teamId:id(row.teamId), status:id(row.status), validFrom:row.validFrom || null, validTo:row.validTo || null, startTimeUnknown:row.startTimeUnknown === true }))
    result.accessScope = actor.public ? 'published' : actor.platformOwner ? 'platform' : 'authorized'
    result.coverage.accessScope = result.accessScope
    result.summary.playerCount = new Set(result.players.map(row => row.playerId)).size
    if (scope.playerId) {
      result.playerTotal = sumPlayerRows(result.players)
      if (!result.players.length && result.summary.matchCount > 0) {
        for (const field of Object.keys(result.playerTotal.metrics)) { result.playerTotal.metrics[field] = null; result.playerTotal.coverage[field] = 'not_collected' }
      }
      const fullCareer = actor.platformOwner === true && scope.mode === 'official' && !['teamId','tournamentId','divisionId','matchId','from','to'].some(field => scope[field])
      let support = { drops:null, status:'unverified', dataVersion:null }
      if (fullCareer) {
        try { support = (await readPlayerSupportTotals(db,[scope.playerId])).get(scope.playerId) || support }
        catch (failure) { result.issues.push({ code:failure.code || 'SUPPORT_READ_FAILED', playerId:scope.playerId }) }
      }
      result.playerCard = fullCareer
        ? calculatePlayerCardPoints(result.playerTotal, { metricVersion:result.metricVersion, dataVersion:result.dataVersion, coverageStatus:result.coverage.cardScoreScopeComplete ? 'complete' : 'partial', supportDrops:support.drops, supportCoverageStatus:support.status, supportDataVersion:support.dataVersion })
        : { scoreVersion:PLAYER_CARD_SCORE_VERSION, entitlementVersion:PLAYER_CARD_ENTITLEMENT_VERSION, metricVersion:result.metricVersion, dataVersion:result.dataVersion, scope:'limited', mode:scope.mode, status:'scope_limited', points:null, tier:null, canReplacePhoto:false, canChangeBackground:false }
      const requestedPlayer = playersById[scope.playerId] || (await readByIds(db,'players','_id',[scope.playerId]))[0]
      const playerTeamId = id(requestedPlayer?.teamId || requestedPlayer?.teamCode)
      const requestedTeam = playerTeamId ? teamsById[playerTeamId] || (await readByIds(db,'teams','_id',[playerTeamId]))[0] : null
      const testIdentity = synthetic(requestedPlayer) || synthetic(requestedTeam)
      if (!requestedPlayer || testIdentity) {
        for (const field of Object.keys(result.playerTotal.metrics)) { result.playerTotal.metrics[field] = null; result.playerTotal.coverage[field] = testIdentity ? 'test_data' : 'identity_unverified' }
        result.playerCard = { scoreVersion:PLAYER_CARD_SCORE_VERSION, entitlementVersion:PLAYER_CARD_ENTITLEMENT_VERSION, metricVersion:result.metricVersion, dataVersion:result.dataVersion, scope:testIdentity ? 'test' : 'unknown', mode:scope.mode, status:testIdentity ? 'test_data_excluded' : 'unverified', points:null, tier:null, canReplacePhoto:false, canChangeBackground:false }
      }
    }
    return { success:true, ...result }
  }
  return { query, catalog, playerCardForAuthorizedPlayer }
}
module.exports = { createDataService, validateScope, error }
