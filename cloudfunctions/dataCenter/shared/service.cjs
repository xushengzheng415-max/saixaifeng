'use strict'
const { readAll, readByIds } = require('./reader.cjs')
const { readPlayerSupportTotals } = require('./support.cjs')
const scoreRuleStore=require('./score-rule-store.cjs')
const valuation=require('./valuation.cjs')
const id = value => value == null ? '' : String(value).trim()

function error(code, message) { const value = new Error(message); value.code = code; return value }
function validateScope(input = {}) {
  const scope = { sportType:'football', mode:input.mode || 'official' }
  if (!['official','provisional'].includes(scope.mode)) throw error('DATA_MODE_INVALID', '请选择正式或现场统计')
  if (input.sportType && input.sportType !== 'football') throw error('DATA_SPORT_INVALID', '当前接口仅支持足球统计')
  for (const field of ['teamId','playerId','tournamentId','divisionId','matchId','groupName']) {
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
  async function buildPlayerCard(result, playerId, options = {}) {
    const {createPlayerCardSnapshot,synthetic}=await import('./statistics.mjs')
    const rows=result.players.filter(row=>row.playerId===playerId)
    const profile=options.profile === undefined ? (await readByIds(db,'players','_id',[playerId]))[0] : options.profile
    const teamId=id(profile?.teamId || profile?.teamCode)
    const team=options.team === undefined && teamId ? (await readByIds(db,'teams','_id',[teamId]))[0] : options.team
    const testIdentity=synthetic(profile)||synthetic(team), fullCareer=options.fullCareer===true
    const {complete:coverageComplete,issues}=require('./player-card-snapshot.cjs').playerCardScope(result,playerId)
    let support=options.support || {drops:null,status:'unverified',dataVersion:null}
    if(options.supportFailure)issues.push({code:'SUPPORT_READ_FAILED',playerId})
    if(fullCareer && options.support===undefined && !options.supportFailure){
      try{support=(await readPlayerSupportTotals(db,[playerId])).get(playerId)||support}
      catch(failure){issues.push({code:'SUPPORT_READ_FAILED',playerId})}
    }
    const ruleContext=options.ruleContext||await scoreRuleStore.context(db,[playerId])
    const built=createPlayerCardSnapshot(rows,{playerId,fullCareer,rules:ruleContext.rules,retainedTier:ruleContext.floorById.get(playerId),identityVerified:Boolean(profile),testIdentity,
      matchCount:result.summary.matchCount,metricVersion:result.metricVersion,dataVersion:result.dataVersion,mode:result.scope.mode,
      coverageStatus:coverageComplete?'complete':'partial',supportDrops:support.drops,
      supportCoverageStatus:support.status,supportDataVersion:support.dataVersion,issues})
    return {...built,issues,ruleContext,...(options.includeLedger?{ledger:require('./points-ledger.cjs').buildPointsLedger(playerId,result.playerContributions||[],built.card,ruleContext.rules.parameters)}:{})}
  }
  // 转会评估身价：只读聚合结果，分位与年龄对比都在同组别内完成。
  async function buildPlayerValuation(result, playerId, options = {}) {
    const rows = (result.players || []).filter(row => row.playerId === playerId)
    const profile = options.profile || {}
    const params = options.ruleContext?.rules?.parameters || null
    const divisionsById = options.divisionsById || {}
    const profilesById = options.profilesById || {}
    const divisionNameOf = value => id(divisionsById[id(value)]?.name || divisionsById[id(value)]?.divisionName)
    const keyOf = row => divisionNameOf(row.divisionId) || id(row.divisionId || 'default')
    const positionBucket = value => {
      const text = id(value).toUpperCase()
      if (/GK|GOALKEEPER|守门/.test(text)) return 'GK'
      if (/DF|DEF|后卫/.test(text)) return 'DF'
      if (/MF|MID|前卫|中场/.test(text)) return 'MF'
      if (/FW|ST|CF|前锋/.test(text)) return 'FW'
      return ''
    }
    const aggregate = list => {
      const matchIds = new Set(), startIds = new Set()
      let goals = 0, minutesPlayed = 0
      for (const row of list) {
        for (const matchId of row.matchIds || []) matchIds.add(id(matchId))
        for (const matchId of row.startMatchIds || []) startIds.add(id(matchId))
        goals += Number(row.metrics?.goals ?? row.observed?.goals ?? 0)
        minutesPlayed += Number(row.metrics?.minutesPlayed ?? row.observed?.minutesPlayed ?? 0)
      }
      return { appearances: matchIds.size, starts: startIds.size, goals, minutesPlayed, totalMatches: matchIds.size }
    }
    const pointsOf = totals => {
      if (!params) return null
      const foundation = Number(params.appearancePoints || 0) * totals.appearances + Number(params.startPoints || 0) * totals.starts + Math.floor(totals.minutesPlayed / (Number(params.minutesPerPoint) || 1))
      const goalBonus = Math.min(Number(params.goalPoints || 0) * totals.goals, Math.floor(foundation * (Number(params.goalCapPercent) || 0) / 100))
      return foundation + goalBonus
    }
    const ageOf = pid => valuation.parseAge(profilesById[id(pid)]?.birthDate || profilesById[id(pid)]?.birthday)
    const qualityOf = (totals, bucket) => bucket === 'GK' || !(totals.minutesPlayed > 0) ? null : totals.goals / (totals.minutesPlayed / 90)
    // 核心三项（出场稳定性、生涯积分、表现质量）任一指标未覆盖完整即待评估，不按 0 计。
    const FOUNDATION_METRICS = ['appearances', 'starts', 'minutesPlayed']
    const coreComplete = rows.length > 0 && rows.every(row => FOUNDATION_METRICS.every(metric => row.coverage?.[metric] === 'complete'))
    if (!coreComplete) return valuation.compute({ playerId, coreCoverage: 'pending', positionBucket: positionBucket(profile.position) })
    const scopedKey = id(options.divisionId) ? divisionNameOf(options.divisionId) || id(options.divisionId) : ''
    const counts = new Map()
    for (const row of rows) counts.set(keyOf(row), (counts.get(keyOf(row)) || 0) + (row.matchIds || []).length)
    let divisionKey = scopedKey && counts.has(scopedKey) ? scopedKey : ''
    if (!divisionKey) {
      let best = '', bestCount = -1
      for (const [key, count] of counts) if (count > bestCount) { best = key; bestCount = count }
      divisionKey = best
    }
    const rowsByPlayer = new Map()
    for (const row of result.players || []) {
      if (keyOf(row) !== divisionKey) continue
      if (!rowsByPlayer.has(row.playerId)) rowsByPlayer.set(row.playerId, [])
      rowsByPlayer.get(row.playerId).push(row)
    }
    const positionCounts = {}, teamIds = new Set()
    for (const [pid, list] of rowsByPlayer) {
      const bucket = positionBucket(profilesById[id(pid)]?.position)
      if (bucket) positionCounts[bucket] = (positionCounts[bucket] || 0) + 1
      for (const row of list) teamIds.add(id(row.teamId))
    }
    const inputFor = pid => {
      const totals = aggregate(rowsByPlayer.get(pid) || [])
      const bucket = positionBucket(profilesById[id(pid)]?.position)
      return {
        playerId: pid,
        points: pointsOf(totals),
        birthDate: profilesById[id(pid)]?.birthDate || profilesById[id(pid)]?.birthday,
        qualityMetric: qualityOf(totals, bucket),
        appearance: { appearances: totals.appearances, starts: totals.starts, minutesPlayed: totals.minutesPlayed, totalMatches: totals.totalMatches },
        positionBucket: bucket,
        scarcity: { positionCounts, teamCount: teamIds.size },
        card: { supportDrops: pid === playerId ? options.supportDrops : undefined, limitedCardCount: 0 },
        achievements: []
      }
    }
    const peerIds = [...rowsByPlayer.keys()].filter(pid => pid !== playerId)
    const peerPoints = [], peerAges = [], peerQuality = [], peerTotals = []
    for (const pid of peerIds) {
      const input = inputFor(pid)
      if (input.points != null) peerPoints.push(input.points)
      if (input.qualityMetric != null) peerQuality.push(input.qualityMetric)
      const age = ageOf(pid)
      if (age != null) peerAges.push(age)
      const computed = valuation.compute(input)
      if (computed.total != null) peerTotals.push(computed.total)
    }
    const snapshots = await readAll(db, 'player_valuations', { playerId: id(playerId) }).catch(() => [])
    let latest = null
    for (const row of snapshots) if (!latest || String(row.computedAt || '') > String(latest.computedAt || '')) latest = row
    const totals = aggregate(rowsByPlayer.get(playerId) || rows)
    const age = ageOf(playerId)
    return valuation.compute({
      ...inputFor(playerId),
      coreCoverage: 'complete',
      peerPoints,
      peerAges,
      peerQuality,
      previousPoints: latest && latest.index != null ? latest.index : null,
      previousTotal: latest && latest.total != null ? latest.total : null,
      minor: age != null && age < 18,
      peerTotals
    })
  }
  // One canonical career dataset per batch; identical scope and scoring rules to
  // playerCardForAuthorizedPlayer, without re-reading every match per player.
  async function playerCardsForAuthorizedPlayers(ids) {
    const playerIds=[...new Set(ids.map(id).filter(Boolean))]
    const result=await query({platformOwner:true,teamIds:[],tournamentIds:[]},{mode:'official'})
    const profiles=await readByIds(db,'players','_id',playerIds)
    const teams=await readByIds(db,'teams','_id',profiles.map(p=>id(p.teamId||p.teamCode)))
    const teamById=new Map(teams.map(t=>[id(t._id),t]))
    const profileById=new Map(profiles.map(p=>[id(p._id),p]))
    let supportTotals=new Map(), supportFailure=false
    try{supportTotals=await readPlayerSupportTotals(db,playerIds)}catch(failure){supportFailure=true}
    const ruleContext=await scoreRuleStore.context(db,playerIds)
    return new Map(await Promise.all(playerIds.map(async playerId=>{
      const profile=profileById.get(playerId)
      const built=await buildPlayerCard(result,playerId,{fullCareer:true,profile,ruleContext,team:teamById.get(id(profile?.teamId||profile?.teamCode)),support:supportTotals.get(playerId)||{drops:null,status:'unverified',dataVersion:null},supportFailure})
      return [playerId,built.card]
    })))
  }

  // Call only after the caller has independently authorized access to this player.
  // A team-scoped query cannot prove full career coverage after transfers.
  async function playerCardForAuthorizedPlayer(playerId) {
    if (!id(playerId)) throw error('DATA_SCOPE_INVALID', '缺少球员信息')
    const result = await query({ platformOwner:true, teamIds:[], tournamentIds:[] }, { playerId:id(playerId), mode:'official' })
    return result.playerCard
  }
  // Internal preview only: the registration service has validated the complete
  // form and assigned the exact future player ID. No profile/card grant is
  // persisted, and existing IDs must use the normal authorized career reader.
  async function playerCardForAuthorizedRegistrationDraft(profile) {
    const playerId=id(profile?._id)
    if(!playerId||!id(profile?.teamId)||profile?.source!=='team_player_invite')throw error('DATA_SCOPE_INVALID','登记草稿无效')
    if((await readByIds(db,'players','_id',[playerId])).length)throw error('DATA_SCOPE_INVALID','球员档案已存在，请重新进入认领')
    const result=await query({platformOwner:true,teamIds:[],tournamentIds:[]},{playerId,mode:'official'})
    const built=await buildPlayerCard(result,playerId,{profile,fullCareer:true})
    return {...built.card,registrationPreview:true}
  }
  async function catalog(actor) {
    if(actor.public)throw error('DATA_FORBIDDEN','公开目录须通过赛事公开接口读取')
    const { synthetic } = await import('./statistics.mjs')
    const teams = actor.platformOwner ? await readAll(db, 'teams') : await readByIds(db, 'teams', '_id', actor.teamIds)
    const syntheticTeamIds = new Set(teams.filter(synthetic).map(row => id(row._id)))
    const tournaments = actor.platformOwner ? await readAll(db, 'tournaments') : await readByIds(db, 'tournaments', '_id', actor.tournamentIds)
    const players = actor.platformOwner ? await readAll(db, 'players') : [...await readByIds(db,'players','teamId',actor.teamIds), ...await readByIds(db,'players','teamCode',actor.teamIds)]
    const tournamentIds=tournaments.filter(row=>!synthetic(row)).map(row=>id(row._id))
    const [divisions,registrations,rosterRows]=await Promise.all([readByIds(db,'divisions','tournamentId',tournamentIds),readByIds(db,'tournament_teams','tournamentId',tournamentIds),readByIds(db,'roster_snapshots','tournamentId',tournamentIds)])
    const links=registrations.filter(row=>!synthetic(row)&&!['deleted','rejected','cancelled','withdrawn'].includes(id(row.status))).map(row=>({tournamentId:id(row.tournamentId),divisionId:id(row.divisionId||row.division||'default'),teamId:id(row.teamId||row.teamCode),groupName:id(row.groupName||row.drawGroup||row.group||row.groupCode)}))
    const rosterMap=new Map()
    for(const row of rosterRows.filter(row=>row.status==='approved'&&!synthetic(row))){const key=[row.tournamentId,row.divisionId||row.division||'default',row.teamId].join(':');const old=rosterMap.get(key);if(!old||Number(row.version||0)>Number(old.version||0)||(Number(row.version||0)===Number(old.version||0)&&new Date(row.updateTime||row.createTime||0)>new Date(old.updateTime||old.createTime||0)))rosterMap.set(key,row)}
    const live=row=>!synthetic(row)&&row.isDeleted!==true&&id(row.status)!=='deleted'
    return {
      success:true, accessScope:actor.platformOwner ? 'platform' : 'authorized',
      teams:teams.filter(live).map(row=>({id:id(row._id),name:id(row.name||row.teamName),orgId:id(row.orgId||row.organizationId),city:id(row.cityName||row.city),teamType:id(row.teamType),status:id(row.status),tournamentLinks:links.filter(link=>link.teamId===id(row._id))})),
      tournaments:tournaments.filter(live).map(row=>({id:id(row._id),name:id(row.name),orgId:id(row.orgId||row.organizationId)})),
      divisions:divisions.filter(live).map(row=>({id:id(row._id),tournamentId:id(row.tournamentId),name:id(row.name)})),
      players:[...new Map(players.filter(row=>live(row)&&!syntheticTeamIds.has(id(row.teamId||row.teamCode))).map(row=>[id(row._id),{id:id(row._id),name:id(row.name),teamId:id(row.teamId||row.teamCode),status:id(row.status),jerseyNumber:row.jerseyNumber??row.number??null,position:id(row.position),playerCode:id(row.playerId||row.playerCode)}])).values()],
      rosters:[...rosterMap.values()].map(row=>({tournamentId:id(row.tournamentId),divisionId:id(row.divisionId||row.division||'default'),teamId:id(row.teamId),playerIds:Array.isArray(row.playerIds)?row.playerIds.map(id).filter(Boolean):[]})),
      generatedAt:new Date().toISOString()
    }
  }

  async function query(actor, input = {}, options = {}) {
    const scope = validateScope(input)
    const teamIds = new Set((actor.teamIds || []).map(String)), tournamentIds = new Set((actor.tournamentIds || []).map(String))
    if (scope.teamId && !actor.platformOwner && !teamIds.has(scope.teamId)) throw error('DATA_FORBIDDEN', '无权查看该球队的数据')
    if (scope.tournamentId && !actor.platformOwner && !tournamentIds.has(scope.tournamentId) && !scope.teamId) throw error('DATA_FORBIDDEN', '无权查看该赛事的数据')
    let matches
    if (scope.tournamentId && (actor.platformOwner || tournamentIds.has(scope.tournamentId))) matches = await readAll(db,'matches',{ tournamentId:scope.tournamentId })
    else if (scope.teamId) matches = [...await readAll(db,'matches',{ homeTeamId:scope.teamId }), ...await readAll(db,'matches',{ awayTeamId:scope.teamId })]
    else if (actor.platformOwner) matches = await readAll(db,'matches')
    else matches = [...await readByIds(db,'matches','tournamentId',[...tournamentIds]), ...await readByIds(db,'matches','homeTeamId',[...teamIds]), ...await readByIds(db,'matches','awayTeamId',[...teamIds])]
    const { inScope, aggregateStatistics, resultState, effectiveEvents, eventType, matchParticipantIds, synthetic, matchGroupName } = await import('./statistics.mjs')
    matches = [...new Map(matches.filter(row => inScope(row,scope)).map(row => [id(row._id),row])).values()]
    if (actor.matchIds) { const allowed = new Set(actor.matchIds); matches = matches.filter(row => allowed.has(id(row._id))) }
    // careerView：生涯口径已在上面按授权赛事/球队收窄，不再要求球员当前属于某支球队。
    if (scope.playerId && !actor.platformOwner && !options.careerView) {
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
    const normalizedMatches = matches.map(match => {
      const matchEvents = effectiveEvents(match,events)
      const cardCount = (side,types) => matchEvents.filter(event => types.includes(eventType(event)) && (event.teamSide === side || id(event.teamId) === id(match[side + 'TeamId']))).length
      const phase = id(match.phase || match.stageType || match.matchType).toLowerCase()
      const state = resultState(match,{ teamsById,tournamentsById,playersById,events,requireOriginEvidence:true,requirePlayerOriginEvidence:true })
      const hasScore = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
      const divisionId = id(match.divisionId || match.division || 'default')
      return { ...match, divisionId, divisionName:id(divisionsById[divisionId]?.name || match.divisionName || '默认组别'), groupName:matchGroupName(match),
        homeTeamName:id(teamById.get(id(match.homeTeamId))?.name || match.homeTeamName || '主队'), awayTeamName:id(teamById.get(id(match.awayTeamId))?.name || match.awayTeamName || '客队'),
        homeScore:Number(match.homeScore ?? match.scoreHome),awayScore:Number(match.awayScore ?? match.scoreAway),scoreReady:hasScore(match.homeScore ?? match.scoreHome) && hasScore(match.awayScore ?? match.scoreAway),
        resultStatus:state === 'official' ? 'approved' : state === 'provisional' ? 'pending_review' : 'not_submitted',
        standingsEligible:state === 'official' && match.standingsEligible !== false && match.isBye !== true && !['knockout','cup','placement','final','semifinal'].includes(phase) && (match.standingsEligible === true || ['group','league','round_robin'].includes(phase)),
        yellowHome:cardCount('home',['yellow_card','second_yellow']),yellowAway:cardCount('away',['yellow_card','second_yellow']),redHome:cardCount('home',['red_card','second_yellow']),redAway:cardCount('away',['red_card','second_yellow']) }
    })
    result.standings = buildStandings(normalizedMatches, divisionsById)
    if (scope.tournamentId) {
      const eventsByMatchId = Object.fromEntries(normalizedMatches.map(row => [id(row._id || row.id), effectiveEvents(row, events)]))
      const awardOverrides = await readAll(db, 'award_overrides', { tournamentId: id(scope.tournamentId) }).catch(() => [])
      result.awards = require('./awards.cjs').compute({
        matches: normalizedMatches,
        eventsByMatchId,
        standings: result.standings,
        divisions: divisions.map(row => ({ id: id(row._id || row.id), name: row.name })),
        overrides: awardOverrides
      })
    }
    const presentation=require('./presentation.cjs')
    result.rankings=await presentation.rankings(result)
    result.records=await presentation.journal({matches,events,actor,scope,context:{teamsById,tournamentsById,playersById,events,requireOriginEvidence:true,requirePlayerOriginEvidence:true}})
    const memberships = scope.playerId && !actor.public ? await readAll(db,'player_team_memberships',{ playerId:scope.playerId }) : []
    result.memberships = memberships.filter(row => actor.platformOwner || teamIds.has(id(row.teamId))).map(row => ({ id:id(row._id), playerId:id(row.playerId), teamId:id(row.teamId), status:id(row.status), validFrom:row.validFrom || null, validTo:row.validTo || null, startTimeUnknown:row.startTimeUnknown === true }))
    result.accessScope = actor.public ? 'published' : actor.platformOwner ? 'platform' : 'authorized'
    result.coverage.accessScope = result.accessScope
    result.summary.playerCount = new Set(result.players.map(row => row.playerId)).size
    if (scope.playerId) {
      // 不带赛事/球队/组别等范围即为生涯口径，按账号可读范围累计，不再要求平台负责人。
      const careerScope = scope.mode === 'official' && !actor.public && !['teamId','tournamentId','divisionId','groupName','matchId','from','to'].some(field => scope[field])
      const built=await buildPlayerCard(result,scope.playerId,{fullCareer:careerScope,includeLedger:options.includeLedger===true})
      result.playerTotal=built.total
      result.playerCard=built.card
      result.valuation=await buildPlayerValuation(result,scope.playerId,{
        profile:playersById[id(scope.playerId)],
        profilesById:playersById,
        divisionsById,
        ruleContext:built.ruleContext,
        supportDrops:built.card?.supportDrops,
        divisionId:scope.divisionId
      })
      if(options.includeLedger)result.pointsLedger=built.ledger
      result.issues=built.issues
    }
    if (!actor.platformOwner) {
      const visible = new Set(result.players.map(row => row.playerId))
      for(const field of ['playerCardComplete','playerCardMatchIds']) result.coverage[field] = Object.fromEntries(Object.entries(result.coverage[field] || {}).filter(([playerId]) => visible.has(playerId)))
    }
    delete result.playerContributions
    return { success:true, ...result }
  }
  async function playerPointsLedgerForAuthorizedPlayer(playerId){const result=await query({platformOwner:true},{playerId:id(playerId),mode:'official'},{includeLedger:true});return result.pointsLedger}
  return { query, catalog, playerCardForAuthorizedPlayer, playerCardForAuthorizedRegistrationDraft, playerCardsForAuthorizedPlayers,playerPointsLedgerForAuthorizedPlayer }
}
module.exports = { createDataService, validateScope, error }
