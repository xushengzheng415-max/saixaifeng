import crypto from 'node:crypto'
import { resolveMatchDuration, calculatePlayingMinutes } from './playing-time.mjs'

export const SCHEMA_VERSION = 'football-data-center/1'
export const METRIC_VERSION = 'football-metrics/4'
export const METRICS = Object.freeze({
  starts: { label:'首发', unit:'场', source:'match lineup', rule:'distinct matchId as starting player' },
  appearances: { label:'出场', unit:'场', source:'lineup/substitution', rule:'distinct matchId with actual appearance' },
  goals: { label:'进球', unit:'球', source:'goal/penalty_scored', rule:'effective event; excludes own goals and shootout' },
  assists: { label:'助攻', unit:'次', source:'goal.assistPlayerId/assist', rule:'one assist per player and goal' },
  yellowCards: { label:'黄牌', unit:'张', source:'yellow_card/second_yellow', rule:'second yellow adds one yellow and one red' },
  redCards: { label:'红牌', unit:'张', source:'red_card/second_yellow', rule:'effective event' },
  minutesPlayed: { label:'出场时间', unit:'分钟', source:'referee clock or match rules/lineup/substitution', rule:'played intervals; measured clock first, configured duration fallback' }
})
const text = value => value == null ? '' : String(value).trim()
const idOf = row => typeof row === 'string' ? row : text(row?.playerId || row?.id || row?._id)
const teamOf = (match, side) => text(match[side + 'TeamId'] || match[side + 'Team']?._id || match[side + 'Team']?.id || match[side === 'home' ? 'teamAId' : 'teamBId'])
const aliases = { score:'goal', penalty:'penalty_scored', penalty_goal:'penalty_scored', yellow:'yellow_card', yellowcard:'yellow_card', red:'red_card', redcard:'red_card', second_yellow_red:'second_yellow', 'own-goal':'own_goal', og:'own_goal', substitute:'substitution' }
export const eventType = event => aliases[text(event.type || event.eventType).toLowerCase()] || text(event.type || event.eventType).toLowerCase()
const eventId = event => text(event.eventId || event.sourceEventId || event._id)
const revision = event => Number(event.revision || event.version || 0)
const cancelled = event => event.deleted === true || ['deleted','cancelled','canceled','void','superseded'].includes(text(event.status).toLowerCase())
const score = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null

export const synthetic = row => row?.synthetic === true || row?.isTest === true || Boolean(text(row?.syntheticDatasetId || row?.syntheticKey)) || text(row?.source).toLowerCase() === 'ai_fixture' || ['test','virtual','synthetic','demo'].includes(text(row?.originType || row?.dataKind).toLowerCase())

export function matchParticipantIds(match, externalEvents = []) {
  const ids = new Set()
  for (const side of ['home','away']) {
    const lineup = lineupOf(match,side)
    for (const row of [...lineup.starters,...lineup.substitutes]) { const playerId = idOf(row); if (playerId) ids.add(playerId) }
  }
  for (const event of effectiveEvents(match,externalEvents)) {
    const nestedId = text(event.player?.id || event.player?._id)
    if (nestedId) ids.add(nestedId)
    for (const field of ['playerId','playerID','athleteId','inPlayerId','outPlayerId','assistPlayerId','assistId']) {
      const playerId = text(event[field]); if (playerId) ids.add(playerId)
    }
  }
  return ids
}

export function matchOrigin(match, context = {}) {
  const home = context.teamsById?.[teamOf(match,'home')]
  const away = context.teamsById?.[teamOf(match,'away')]
  const tournament = context.tournamentsById?.[text(match.tournamentId)]
  if (synthetic(match) || synthetic(home) || synthetic(away) || synthetic(tournament)) return 'test'
  if (context.requirePlayerOriginEvidence) {
    for (const playerId of matchParticipantIds(match,context.events)) {
      const profile = context.playersById?.[playerId]
      if (!profile) return 'unverified'
      if (synthetic(profile)) return 'test_player'
    }
  }
  if (['real','official'].includes(text(match.originType || match.dataKind).toLowerCase())) return 'real'
  if (context.requireOriginEvidence) return home && away && tournament ? 'real' : 'unverified'
  return 'real'
}

function recordedResultState(match) {
  const status = text(match.status).toLowerCase()
  if (match.isBye === true || ['cancelled','canceled','void','abandoned'].includes(status)) return 'excluded'
  const reviews = [match.resultReviewStatus, match.reviewStatus, match.refereeReviewStatus, match.refereeRecord?.reviewStatus].map(value => text(value).toLowerCase())
  if (reviews.some(value => ['returned','rejected','conflict','warning'].includes(value))) return 'excluded'
  if (reviews.some(value => ['approved','official','archived'].includes(value)) || status === 'archived') return 'official'
  if (reviews.some(value => ['pending','pending_review','under_review','submitted'].includes(value))) return 'provisional'
  if (['pending_review','under_review','live','playing','ongoing','in_progress','inprogress'].includes(status)) return 'provisional'
  // Explicitly retain the project's existing organizer post-match entry policy.
  if (['completed','finished','ended'].includes(status) && !(match.refereeRecord || match.refereeSubmittedAt || match.refereeReviewStatus)) return 'official'
  return ['completed','finished','ended'].includes(status) ? 'provisional' : 'excluded'
}

export function resultState(match, context = {}) {
  const state = recordedResultState(match)
  return state !== 'excluded' && matchOrigin(match,context) === 'real' ? state : 'excluded'
}

export function inScope(match, scope = {}) {
  if (scope.tournamentId && text(match.tournamentId) !== text(scope.tournamentId)) return false
  const division = text(match.divisionId || match.division || 'default')
  if (scope.divisionId && division !== text(scope.divisionId)) return false
  if (scope.teamId && !['home','away'].some(side => teamOf(match, side) === text(scope.teamId))) return false
  if (text(match.sportType || match.sportCode || 'football') !== (scope.sportType || 'football')) return false
  if (scope.from || scope.to) {
    const time = new Date(match.matchDate || match.startTime || match.matchTime || 0).getTime()
    if (!Number.isFinite(time) || !time) return false
    if (scope.from && time < new Date(scope.from).getTime()) return false
    if (scope.to && time >= new Date(scope.to).getTime()) return false
  }
  return true
}

export function effectiveEvents(match, externalEvents = []) {
  const matchId = text(match._id || match.id)
  const embedded = (Array.isArray(match.events) ? match.events : []).map(event => ({ ...event, matchId, __source:'embedded' }))
  const external = externalEvents.filter(event => text(event.matchId || event.match_id) === matchId).map(event => ({ ...event, __source:'external' }))
  const byId = new Map(), unkeyed = []
  // External wins equal revisions, including tombstones. Anonymous embedded mirrors
  // are not combined with external storage; ambiguous identity is reported instead.
  const externalExists = external.length > 0
  for (const event of [...embedded, ...external]) {
    const key = eventId(event)
    if (!key) { if (!externalExists || event.__source === 'external') unkeyed.push(event); continue }
    const previous = byId.get(key)
    if (!previous || revision(event) >= revision(previous)) byId.set(key, event)
  }
  return [...byId.values(), ...unkeyed].filter(event => !cancelled(event))
}

function lineupOf(match, side) {
  const source = match[side + 'Lineup'] || match['lineup' + (side === 'home' ? 'Home' : 'Away')] || match.lineups?.[side]
  if (Array.isArray(source)) return { known:true, starters:source, substitutes:[] }
  if (!source) return { known:false, starters:[], substitutes:[] }
  return { known:Array.isArray(source.starters) || Array.isArray(source.players), starters:source.starters || source.players || [], substitutes:source.substitutes || [] }
}

function eventTeam(event, match, participants) {
  const explicit = text(event.teamId || (typeof event.team === 'string' ? event.team : event.team?.id || event.team?._id))
  if (explicit) return ['home','away'].some(side => teamOf(match, side) === explicit) ? explicit : ''
  const side = text(event.teamSide || event.side)
  if (['home','away'].includes(side)) return teamOf(match, side)
  const playerId = text(event.playerId || event.playerID || event.athleteId)
  const teams = participants.get(playerId)
  return teams?.size === 1 ? [...teams][0] : ''
}

export function aggregateStatistics({ matches = [], events = [], scope = {}, readComplete = true, divisionsById = {}, tournamentsById = {}, teamsById = {}, playersById = {}, requireOriginEvidence = false, requirePlayerOriginEvidence = false }) {
  const selected = [...new Map(matches.filter(match => inScope(match, scope)).map(match => [text(match._id || match.id), match])).values()]
  const originContext = { teamsById, tournamentsById, playersById, events, requireOriginEvidence, requirePlayerOriginEvidence }
  const resultCandidates = selected.filter(match => recordedResultState(match) !== 'excluded')
  const testMatches = resultCandidates.filter(match => matchOrigin(match,originContext) === 'test')
  const testPlayerMatches = resultCandidates.filter(match => matchOrigin(match,originContext) === 'test_player')
  const originUnverifiedMatches = resultCandidates.filter(match => matchOrigin(match,originContext) === 'unverified')
  const eligible = selected.filter(match => resultState(match,originContext) === 'official' || (scope.mode === 'provisional' && resultState(match,originContext) === 'provisional'))
  const players = new Map(), teams = new Map(), issues = []
  testMatches.forEach(match => issues.push({ code:'TEST_MATCH_EXCLUDED', matchId:text(match._id || match.id) }))
  testPlayerMatches.forEach(match => issues.push({ code:'TEST_PLAYER_IN_MATCH', matchId:text(match._id || match.id) }))
  originUnverifiedMatches.forEach(match => issues.push({ code:'MATCH_ORIGIN_UNVERIFIED', matchId:text(match._id || match.id) }))
  let unlinkedEventCount = 0, coveredMatches = 0, missingLineupSides = 0
  const blank = () => ({ starts:0, appearances:0, goals:0, assists:0, yellowCards:0, redCards:0, minutesPlayed:0 })
  function playerRow(playerId, teamId, match, profile = {}) {
    const key = [playerId,teamId,text(match.tournamentId),text(match.divisionId || match.division || 'default')].join('|')
    if (!players.has(key)) players.set(key, { playerId, teamId, tournamentId:text(match.tournamentId), divisionId:text(match.divisionId || match.division || 'default'), playerName:text(profile.name || profile.playerName), observed:blank(), matchIds:new Set(), startMatches:new Set(), minuteUnknown:false, metricUnknown:new Set(), appearanceUnknown:false })
    return players.get(key)
  }
  for (const match of eligible) {
    const matchId = text(match._id || match.id)
    if (!matchId) { issues.push({ code:'MATCH_ID_MISSING' }); continue }
    let matchEvents = effectiveEvents(match, events)
    const eventsKnown = match.eventRecordingStatus === 'complete' || match.statisticsCoverage?.events === 'complete' || (Array.isArray(match.events) && match.eventRecordingStatus !== 'partial')
    if (eventsKnown) coveredMatches++
    else issues.push({ code:'EVENT_COVERAGE_PARTIAL', matchId })
    const participants = new Map(), lineups = {}
    for (const side of ['home','away']) {
      const teamId = teamOf(match, side), lineup = lineupOf(match, side)
      if (teamId && !lineup.known) { missingLineupSides++; issues.push({ code:'LINEUP_COVERAGE_MISSING', matchId, teamId }) }
      lineups[teamId] = lineup
      for (const profile of [...lineup.starters, ...lineup.substitutes]) {
        const playerId = idOf(profile)
        if (!playerId || !teamId) continue
        if (!participants.has(playerId)) participants.set(playerId, new Set())
        participants.get(playerId).add(teamId)
        playerRow(playerId, teamId, match, profile)
      }
    }
    // Link a legacy event only to an existing, unique player in that match's lineup.
    // This never creates or merges a permanent identity from a name.
    matchEvents = matchEvents.map(event => {
      const teamId = eventTeam(event,match,participants), lineup = lineups[teamId]
      if (!lineup) return event
      const profiles = [...lineup.starters,...lineup.substitutes]
      function resolve(name, number) {
        if (!name || number == null || number === '') return ''
        const ids = [...new Set(profiles.filter(profile => text(profile.name || profile.playerName) === text(name) && text(profile.number ?? profile.jerseyNumber) === text(number)).map(idOf).filter(Boolean))]
        return ids.length === 1 ? ids[0] : ''
      }
      return { ...event, playerId:text(event.playerId || event.playerID || event.athleteId) || resolve(event.playerName,event.playerNumber), assistPlayerId:text(event.assistPlayerId || event.assistId) || resolve(event.assistName,event.assistNumber) }
    })
    const appeared = new Map(), assistKeys = new Set(), teamsWithUnlinked = new Map()
    function markUnlinked(teamId,type) {
      const fields = { goal:['goals'], penalty_scored:['goals'], assist:['assists'], yellow_card:['yellowCards'], red_card:['redCards','minutesPlayed'], second_yellow:['yellowCards','redCards','minutesPlayed'], substitution:['appearances','minutesPlayed'] }
      if (!teamsWithUnlinked.has(teamId)) teamsWithUnlinked.set(teamId,new Set())
      for (const field of fields[type] || []) teamsWithUnlinked.get(teamId).add(field)
    }
    for (const side of ['home','away']) {
      const teamId = teamOf(match, side)
      if (!teamId) { issues.push({ code:'TEAM_ID_MISSING', matchId }); continue }
      const lineup = lineups[teamId]
      appeared.set(teamId, new Set(lineup.starters.map(idOf).filter(Boolean)))
      const own = score(match[side + 'Score'] ?? match[side === 'home' ? 'scoreHome' : 'scoreAway'])
      const against = score(match[(side === 'home' ? 'away' : 'home') + 'Score'] ?? match[side === 'home' ? 'scoreAway' : 'scoreHome'])
      const key = [teamId,text(match.tournamentId),text(match.divisionId || match.division || 'default')].join('|')
      if (!teams.has(key)) teams.set(key, { teamId, tournamentId:text(match.tournamentId), divisionId:text(match.divisionId || match.division || 'default'), played:0, wins:0, draws:0, losses:0, goalsFor:0, goalsAgainst:0, scoreCoveredMatches:0, matchIds:[] })
      const row = teams.get(key)
      row.played++; row.matchIds.push(matchId)
      if (own !== null && against !== null) {
        row.scoreCoveredMatches++; row.goalsFor += own; row.goalsAgainst += against
        if (own > against) row.wins++
        else if (own < against) row.losses++
        else row.draws++
      } else issues.push({ code:'SCORE_MISSING', matchId, teamId })
    }
    for (const event of matchEvents) {
      const type = eventType(event)
      if (event.shootout === true || ['shootout','penalty_shootout','penalties'].includes(text(event.phase || event.period))) continue
      const teamId = eventTeam(event, match, participants)
      if (!teamId) { unlinkedEventCount++; ['home','away'].forEach(side => markUnlinked(teamOf(match,side),type)); issues.push({ code:'EVENT_TEAM_UNLINKED', matchId, eventId:eventId(event) }); continue }
      const playerId = text((type === 'substitution' ? event.inPlayerId : '') || event.playerId || event.playerID || event.athleteId || event.player?.id || event.player?._id)
      if (playerId && participants.has(playerId) && !participants.get(playerId).has(teamId)) { unlinkedEventCount++; markUnlinked(teamId,type); issues.push({ code:'EVENT_PLAYER_TEAM_CONFLICT', matchId, eventId:eventId(event) }); continue }
      const row = playerId ? playerRow(playerId, teamId, match, { name:event.playerName }) : null
      if (!row && ['goal','penalty_scored','own_goal','yellow_card','red_card','second_yellow','substitution'].includes(type)) {
        unlinkedEventCount++; markUnlinked(teamId,type); issues.push({ code:'EVENT_PLAYER_UNLINKED', matchId, eventId:eventId(event) })
      }
      if (row) {
        if (['goal','penalty_scored'].includes(type)) row.observed.goals++
        if (['yellow_card','second_yellow'].includes(type)) row.observed.yellowCards++
        if (['red_card','second_yellow'].includes(type)) row.observed.redCards++
        if (['goal','penalty_scored','own_goal','substitution'].includes(type)) appeared.get(teamId)?.add(playerId)
      }
      const assistId = text(type === 'assist' ? (event.assistPlayerId || playerId) : (event.assistPlayerId || event.assistId))
      if (assistId && ['goal','penalty_scored','assist'].includes(type)) {
        const assistKey = [matchId, text(event.goalEventId || event.relatedEventId || eventId(event)), assistId].join('|')
        if (!assistKeys.has(assistKey) && (!participants.has(assistId) || participants.get(assistId).has(teamId))) {
          assistKeys.add(assistKey)
          playerRow(assistId, teamId, match).observed.assists++
          appeared.get(teamId)?.add(assistId)
        }
      }
    }
    for (const side of ['home','away']) {
      const teamId = teamOf(match, side), lineup = lineups[teamId]
      if (!teamId) continue
      const duration = resolveMatchDuration(match, { division:divisionsById[text(match.divisionId || match.division || 'default')], tournament:tournamentsById[text(match.tournamentId)] })
      const timeline = matchEvents.filter(event => eventTeam(event, match, participants) === teamId && ['substitution','red_card','second_yellow'].includes(eventType(event))).sort((a,b) => Number(a.minute) - Number(b.minute))
      const intervals = calculatePlayingMinutes(lineup.starters.map(idOf).filter(Boolean), timeline.map(event => ({ type:eventType(event), id:text(event.inPlayerId || event.playerId), out:text(event.outPlayerId || event.assistPlayerId), outName:event.assistName, minute:event.minute })), duration)
      const valid = lineup.known && eventsKnown && intervals.available
      const minutes = intervals.minutes
      const matchPlayerIds = new Set([...lineup.starters.map(idOf),...lineup.substitutes.map(idOf),...appeared.get(teamId)].filter(Boolean))
      for (const playerId of matchPlayerIds) {
        const row = playerRow(playerId,teamId,match)
        if (lineup.starters.some(profile => idOf(profile) === playerId)) row.startMatches.add(matchId)
        const wasPresent = participants.get(row.playerId)?.has(teamId) || appeared.get(teamId).has(row.playerId)
        if (!wasPresent) continue
        const unknown = teamsWithUnlinked.get(teamId) || new Set()
        for (const field of unknown) row.metricUnknown.add(field)
        if (!eventsKnown) ['goals','assists','yellowCards','redCards'].forEach(field => row.metricUnknown.add(field))
        if (!lineup.known) row.appearanceUnknown = true
        if (appeared.get(teamId).has(row.playerId)) {
          row.matchIds.add(matchId)
          if (!valid || intervals.unknown.has(row.playerId) || !minutes.has(row.playerId)) row.minuteUnknown = true
          else row.observed.minutesPlayed += minutes.get(row.playerId)
        }
      }
    }
  }
  let playerRows = [...players.values()].map(row => {
    row.observed.starts = row.startMatches.size
    row.observed.appearances = row.matchIds.size
    const metrics = { ...row.observed, minutesPlayed:row.minuteUnknown ? null : Math.round(row.observed.minutesPlayed) }
    const coverage = {}
    for (const metric of Object.keys(METRICS)) {
      const unknown = !readComplete || row.metricUnknown.has(metric) || (metric === 'minutesPlayed' ? row.minuteUnknown : ['starts','appearances'].includes(metric) ? row.appearanceUnknown : false)
      coverage[metric] = unknown ? 'partial' : 'complete'
      if (unknown) metrics[metric] = null
    }
    return { playerId:row.playerId, teamId:row.teamId, tournamentId:row.tournamentId, divisionId:row.divisionId, playerName:row.playerName, metrics, observed:{ ...row.observed, minutesPlayed:Math.round(row.observed.minutesPlayed) }, coverage, matchIds:[...row.matchIds], startMatchIds:[...row.startMatches] }
  })
  if (scope.playerId) playerRows = playerRows.filter(row => row.playerId === text(scope.playerId))
  if (scope.teamId) playerRows = playerRows.filter(row => row.teamId === text(scope.teamId))
  const teamRows = [...teams.values()].filter(row => !scope.teamId || row.teamId === text(scope.teamId)).map(row => {
    const known = readComplete && row.scoreCoveredMatches === row.played
    return { ...row, wins:known ? row.wins : null, draws:known ? row.draws : null, losses:known ? row.losses : null, goalsFor:known ? row.goalsFor : null, goalsAgainst:known ? row.goalsAgainst : null, scoreCoverage:known ? 'complete' : 'partial' }
  })
  const revisionInput = eligible.map(match => [text(match._id || match.id),match.updateTime || '',match.resultVersionId || '',match.resultCorrection || '',match.homeScore,match.awayScore,match.homeLineup || match.lineups || '',match.awayLineup || '',effectiveEvents(match, events)]).sort((a,b) => a[0].localeCompare(b[0]))
  return {
    schemaVersion:SCHEMA_VERSION, metricVersion:METRIC_VERSION,
    dataVersion:crypto.createHash('sha256').update(JSON.stringify([scope,revisionInput,eligible.map(match => [text(match._id || match.id),resolveMatchDuration(match,{ division:divisionsById[text(match.divisionId || match.division || 'default')],tournament:tournamentsById[text(match.tournamentId)] })])])).digest('hex').slice(0,24),
    generatedAt:new Date().toISOString(), scope:{ sportType:'football', mode:'official', ...scope },
    coverage:{ status:!readComplete || coveredMatches < eligible.length || unlinkedEventCount || missingLineupSides || originUnverifiedMatches.length || testPlayerMatches.length ? 'partial' : 'complete', cardScoreScopeComplete:Boolean(readComplete && !missingLineupSides && !originUnverifiedMatches.length && !testPlayerMatches.length && eligible.every(match => teamOf(match,'home') && teamOf(match,'away'))), expectedMatches:eligible.length, coveredMatches, unlinkedEventCount, missingLineupSides, excludedTestMatches:testMatches.length, testPlayerMatches:testPlayerMatches.length, originUnverifiedMatches:originUnverifiedMatches.length, pendingReviewCount:selected.filter(match => resultState(match,originContext) === 'provisional').length, readComplete },
    summary:{ matchCount:eligible.length, playerCount:new Set(playerRows.map(row => row.playerId)).size, teamCount:new Set(teamRows.map(row => row.teamId)).size },
    players:playerRows, teams:teamRows, issues
  }
}

export function sumPlayerRows(rows) {
  const observed = {}, metrics = {}, coverage = {}
  for (const field of Object.keys(METRICS)) {
    observed[field] = rows.reduce((sum,row) => sum + Number(row.observed[field] || 0), 0)
    coverage[field] = rows.some(row => row.coverage[field] !== 'complete') ? 'partial' : 'complete'
    metrics[field] = coverage[field] === 'complete' ? observed[field] : null
  }
  // A player who legitimately represents two teams in a match still played one match.
  observed.appearances = new Set(rows.flatMap(row => row.matchIds)).size
  if (coverage.appearances === 'complete') metrics.appearances = observed.appearances
  observed.starts = new Set(rows.flatMap(row => row.startMatchIds || [])).size
  if (coverage.starts === 'complete') metrics.starts = observed.starts
  return { metrics, observed, coverage }
}

export const PLAYER_CARD_SCORE_VERSION = 'football-player-card-points/2'
export const PLAYER_CARD_ENTITLEMENT_VERSION = 'football-player-card-entitlements/2'

export function calculatePlayerCardPoints(playerTotal, metadata = {}) {
  const fields = ['appearances','starts','minutesPlayed','goals']
  const metrics = playerTotal?.metrics || {}
  const coverage = playerTotal?.coverage || {}
  const missing = fields.filter(field => coverage[field] !== 'complete' || !Number.isSafeInteger(metrics[field]) || metrics[field] < 0)
  const supportDrops = metadata.supportDrops
  const supportDataVersion = metadata.supportDataVersion || null
  const dataVersion = supportDataVersion && metadata.dataVersion
    ? crypto.createHash('sha256').update(JSON.stringify([metadata.dataVersion,supportDataVersion])).digest('hex').slice(0,24)
    : null
  const base = { scoreVersion:PLAYER_CARD_SCORE_VERSION, entitlementVersion:PLAYER_CARD_ENTITLEMENT_VERSION, metricVersion:metadata.metricVersion || METRIC_VERSION, dataVersion, careerDataVersion:metadata.dataVersion || null, supportDataVersion, scope:'career', mode:'official' }
  if (metadata.coverageStatus && metadata.coverageStatus !== 'complete') return { ...base, status:'unverified', missing:['dataCoverage'], points:null, tier:null, canReplacePhoto:false, canChangeBackground:false }
  if (metadata.supportCoverageStatus !== 'complete' || !Number.isSafeInteger(supportDrops) || supportDrops < 0 || !supportDataVersion) return { ...base, status:'unverified', missing:['supportDrops'], points:null, tier:null, canReplacePhoto:false, canChangeBackground:false }
  if (missing.length || metrics.starts > metrics.appearances) {
    return { ...base, status:'unverified', missing:metrics.starts > metrics.appearances ? [...new Set([...missing,'starts'])] : missing, points:null, tier:null, canReplacePhoto:false, canChangeBackground:false }
  }
  const appearances = metrics.appearances, starts = metrics.starts, minutesPlayed = metrics.minutesPlayed, goals = metrics.goals
  const foundation = 2 * appearances + starts + Math.floor(minutesPlayed / 45)
  const goalBonus = Math.min(2 * goals, Math.floor(foundation / 5))
  const careerPoints = foundation + goalBonus
  const supportPoints = Math.floor(supportDrops / 10)
  const points = careerPoints + supportPoints
  if (!Number.isSafeInteger(points)) return { ...base, status:'unverified', missing:fields, points:null, tier:null, canReplacePhoto:false, canChangeBackground:false }
  const tier = points >= 100 ? 'gold' : points >= 45 ? 'silver' : 'bronze'
  const nextAt = tier === 'gold' ? null : tier === 'silver' ? 100 : 45
  return { ...base, status:'ready', missing:[], metrics:{ appearances, starts, minutesPlayed, goals }, foundation, goalBonus, careerPoints, supportDrops, supportPoints, points, tier, nextAt, pointsToNext:nextAt == null ? 0 : nextAt - points, canReplacePhoto:points >= 100, canChangeBackground:points >= 100 }
}

export function selectRosterMatches(matches, teamId, divisionId, allowLegacy) {
  return matches.filter(match => {
    const division = text(match.divisionId || match.division)
    return ['home','away'].some(side => teamOf(match,side) === text(teamId)) && (division ? division === text(divisionId || 'default') : allowLegacy === true)
  })
}

export function restoreHistoricalRosterPlayers(players, matches, teamId, rosterIds) {
  const result = players.slice(), historical = new Map()
  matches.forEach(match => {
    const side = teamOf(match,'home') === text(teamId) ? 'home' : 'away'
    const lineup = lineupOf(match,side)
    ;[...lineup.starters,...lineup.substitutes].forEach(row => { const playerId = idOf(row); if (playerId) historical.set(playerId,row) })
  })
  ;(rosterIds || []).forEach(playerId => {
    if (result.some(row => text(row.id || row._id) === text(playerId))) return
    const row = historical.get(text(playerId)) || {}
    result.push({ id:text(playerId), name:row.name || row.playerName || '历史名单球员', jerseyNumber:row.jerseyNumber ?? row.number ?? '', photoUrl:row.photoUrl || row.avatarUrl || '', profileStatus:'pending', statusText:'历史名单资料' })
  })
  return result
}
