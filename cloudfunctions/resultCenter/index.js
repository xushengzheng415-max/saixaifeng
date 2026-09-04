const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex')
}

function text(value) {
  return value == null ? '' : String(value).trim()
}

function number(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function rawDate(value) {
  return value && typeof value === 'object' && value.$date ? value.$date : value
}

function timeValue(value) {
  const time = new Date(rawDate(value) || 0).getTime()
  return Number.isFinite(time) ? time : 0
}

function recordOrgIds(record) {
  return [...new Set(['orgId', 'organizationId', 'organization_id']
    .map(field => text(record && record[field]))
    .filter(Boolean))]
}

function belongsToActor(record, actor) {
  const ids = recordOrgIds(record)
  return ids.length === 1 && ids[0] === actor.orgId
}

async function authenticate(event) {
  const token = text(event && event.__authToken)
  if (!token) throw new Error('登录会话已失效，请重新登录')
  const sessions = (await db.collection('auth_sessions').where({
    tokenHash: hashSessionToken(token),
    active: true,
    expiresAt: db.command.gt(new Date())
  }).limit(2).get()).data || []
  if (sessions.length !== 1) throw new Error('登录会话已失效，请重新登录')
  const userResult = await db.collection('users').doc(sessions[0].userId).get()
  const user = Array.isArray(userResult.data) ? userResult.data[0] : userResult.data
  if (!user) throw new Error('登录账号不存在')
  const orgId = text(user.orgId || user.organizationId)
  if (!orgId) throw new Error('当前账号尚未关联机构，请先完成机构引导')
  if (event.__actorUserId && text(event.__actorUserId) !== text(user._id)) throw new Error('登录身份校验失败')
  if (event.__actorOrgId && text(event.__actorOrgId) !== orgId) throw new Error('机构归属校验失败')
  return { user, orgId }
}

async function getDocument(collection, id) {
  if (!id) return null
  try {
    const result = await db.collection(collection).doc(id).get()
    return Array.isArray(result.data) ? result.data[0] || null : result.data || null
  } catch (error) {
    return null
  }
}

async function listAll(collection, where, max = 1000) {
  const rows = []
  for (let skip = 0; skip < max; skip += 100) {
    const page = (await db.collection(collection).where(where).skip(skip).limit(Math.min(100, max - skip)).get()).data || []
    rows.push(...page)
    if (page.length < 100) break
  }
  return rows
}

function divisionIdOf(match) {
  return text(match.divisionId || match.division || match.divisionKey) || 'default'
}

function groupNameOf(match) {
  return text(match.pool || match.group || match.groupName || match.groupCode) || '联赛积分榜'
}

function teamIdOf(match, side) {
  const direct = side === 'home' ? match.homeTeamId : match.awayTeamId
  const nested = side === 'home' ? match.homeTeam : match.awayTeam
  return text(direct || (nested && (nested._id || nested.id)))
}

function teamNameOf(match, side) {
  const direct = side === 'home' ? match.homeTeamName : match.awayTeamName
  const nested = side === 'home' ? match.homeTeam : match.awayTeam
  return text(direct || (nested && (nested.name || nested.teamName)) || nested) || (side === 'home' ? '主队待定' : '客队待定')
}

function teamLogoOf(match, side) {
  const direct = side === 'home' ? match.homeTeamLogo : match.awayTeamLogo
  const nested = side === 'home' ? match.homeTeam : match.awayTeam
  return text(direct || (nested && (nested.logoTransparentUrl || nested.logoUrl || nested.logo)))
}

function scoreReady(match) {
  const home = Number(match.homeScore)
  const away = Number(match.awayScore)
  if (!Number.isFinite(home) || !Number.isFinite(away)) return false
  const status = text(match.status).toLowerCase()
  return Boolean(match.refereeRecord || match.refereeSubmittedAt || match.resultSubmittedAt || match.resultVersionId ||
    match.refereeReviewStatus || match.resultReviewStatus ||
    ['finished', 'completed', 'archived', 'pending_review', 'pending_result', 'ended'].includes(status))
}

function resultStatus(match) {
  if (!scoreReady(match)) return 'not_submitted'
  const statuses = [
    match.resultReviewStatus,
    match.reviewStatus,
    match.refereeReviewStatus,
    match.refereeRecord && match.refereeRecord.reviewStatus,
    match.status
  ].map(value => text(value).toLowerCase())
  if (statuses.some(value => ['archived', 'approved', 'official'].includes(value))) return 'approved'
  if (statuses.some(value => ['returned', 'rejected'].includes(value))) return 'returned'
  if (statuses.some(value => ['warning', 'conflict', 'abandoned'].includes(value))) return 'warning'
  return 'pending_review'
}

function phaseOf(match) {
  return text(match.phase || match.scheduleType || match.stage).toLowerCase()
}

function standingsEligible(match) {
  const phase = phaseOf(match)
  if (match.standingsEligible === false) return false
  if (['knockout', 'cup', 'placement', 'final', 'semifinal'].includes(phase)) return false
  return match.standingsEligible === true || ['group', 'league', 'round_robin'].includes(phase)
}

function footballWarnings(match, status) {
  const warnings = []
  const phase = phaseOf(match)
  const knockout = ['knockout', 'cup', 'placement', 'final', 'semifinal'].includes(phase)
  const tied = scoreReady(match) && number(match.homeScore) === number(match.awayScore)
  if (knockout && tied && !text(match.winnerTeamId) && !text(match.resolution || match.decisionMethod)) {
    warnings.push('淘汰赛平局缺少加时/点球决胜与晋级球队')
  }
  if (status === 'warning') warnings.push(text(match.resultWarning || match.exceptionReason) || '赛果存在异常，需人工核验')
  return warnings
}

function normalizedMatch(match, divisionsById) {
  const status = resultStatus(match)
  const divisionId = divisionIdOf(match)
  const homeScore = scoreReady(match) ? number(match.homeScore) : null
  const awayScore = scoreReady(match) ? number(match.awayScore) : null
  const warnings = footballWarnings(match, status)
  return {
    id: text(match._id || match.id),
    matchNo: text(match.matchNo || match.matchSequence || match.sequence || match.matchIndex),
    divisionId,
    divisionName: text(match.divisionName || (divisionsById[divisionId] && divisionsById[divisionId].name)) || '未分组别',
    groupName: groupNameOf(match),
    phase: phaseOf(match),
    phaseLabel: text(match.phaseLabel || match.roundName || match.stageName) || '比赛阶段',
    roundName: text(match.roundName || match.roundLabel || match.round),
    matchDate: text(match.matchDate || match.date),
    matchTime: text(match.matchTime || match.startTime),
    venue: text(match.venue || match.field) || '场地待定',
    homeTeamId: teamIdOf(match, 'home'),
    homeTeamName: teamNameOf(match, 'home'),
    homeTeamLogo: teamLogoOf(match, 'home'),
    awayTeamId: teamIdOf(match, 'away'),
    awayTeamName: teamNameOf(match, 'away'),
    awayTeamLogo: teamLogoOf(match, 'away'),
    homeScore,
    awayScore,
    scoreReady: scoreReady(match),
    resultStatus: warnings.length ? 'warning' : status,
    warnings,
    source: match.refereeRecord || match.refereeSubmittedAt ? '裁判/计分台回传' : match.resultVersionId ? '赛果版本' : scoreReady(match) ? '后台记录' : '尚未录入',
    submittedAt: rawDate(match.refereeSubmittedAt || match.resultSubmittedAt || match.updateTime || ''),
    reviewedAt: rawDate(match.refereeRecordArchivedAt || match.resultReviewedAt || match.updateTime || ''),
    winnerTeamId: text(match.winnerTeamId),
    resolution: text(match.resolution || match.decisionMethod || (homeScore !== null && awayScore !== null && homeScore !== awayScore ? 'regular_time' : '')),
    standingsEligible: standingsEligible(match),
    yellowHome: number(match.homeYellowCards || match.yellowCardsHome),
    yellowAway: number(match.awayYellowCards || match.yellowCardsAway),
    redHome: number(match.homeRedCards || match.redCardsHome),
    redAway: number(match.awayRedCards || match.redCardsAway)
  }
}

function pointsRule(division) {
  const ranking = division && (division.rankingRules || division.rankingRule || division.rules && division.rules.ranking) || {}
  const points = ranking.points || {}
  return {
    win: number(points.win ?? (division && division.winPoints), 3),
    draw: number(points.draw ?? (division && division.drawPoints), 1),
    loss: number(points.loss ?? (division && division.lossPoints), 0),
    source: points.win != null || division && division.winPoints != null ? '组别规则' : '足球标准规则'
  }
}

function addTeam(table, id, name, logo) {
  const key = id || `name:${name}`
  if (!table[key]) table[key] = { teamId: id, teamName: name, logo, played: 0, win: 0, draw: 0, loss: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, fairPlay: 0, provisionalMatches: 0 }
  return table[key]
}

function applyResult(table, match, rule, provisional) {
  const home = addTeam(table, match.homeTeamId, match.homeTeamName, match.homeTeamLogo)
  const away = addTeam(table, match.awayTeamId, match.awayTeamName, match.awayTeamLogo)
  home.played += 1; away.played += 1
  home.goalsFor += match.homeScore; home.goalsAgainst += match.awayScore
  away.goalsFor += match.awayScore; away.goalsAgainst += match.homeScore
  if (match.homeScore > match.awayScore) { home.win += 1; away.loss += 1; home.points += rule.win; away.points += rule.loss }
  else if (match.homeScore < match.awayScore) { away.win += 1; home.loss += 1; away.points += rule.win; home.points += rule.loss }
  else { home.draw += 1; away.draw += 1; home.points += rule.draw; away.points += rule.draw }
  home.fairPlay -= match.yellowHome + match.redHome * 3
  away.fairPlay -= match.yellowAway + match.redAway * 3
  if (provisional) { home.provisionalMatches += 1; away.provisionalMatches += 1 }
  home.goalDifference = home.goalsFor - home.goalsAgainst
  away.goalDifference = away.goalsFor - away.goalsAgainst
}

function headToHeadScore(team, tied, matches, rule) {
  const ids = new Set(tied.map(item => item.teamId || `name:${item.teamName}`))
  const mini = { points: 0, goalsFor: 0, goalsAgainst: 0 }
  matches.forEach(match => {
    const homeKey = match.homeTeamId || `name:${match.homeTeamName}`
    const awayKey = match.awayTeamId || `name:${match.awayTeamName}`
    if (!ids.has(homeKey) || !ids.has(awayKey)) return
    const currentKey = team.teamId || `name:${team.teamName}`
    if (currentKey !== homeKey && currentKey !== awayKey) return
    const currentHome = currentKey === homeKey
    const scored = currentHome ? match.homeScore : match.awayScore
    const conceded = currentHome ? match.awayScore : match.homeScore
    mini.goalsFor += scored; mini.goalsAgainst += conceded
    mini.points += scored > conceded ? rule.win : scored < conceded ? rule.loss : rule.draw
  })
  return { ...mini, goalDifference: mini.goalsFor - mini.goalsAgainst }
}

function rankTeams(teams, officialMatches, rule) {
  const byPoints = {}
  teams.forEach(team => { (byPoints[team.points] ||= []).push(team) })
  Object.values(byPoints).forEach(tied => tied.forEach(team => { team.headToHead = headToHeadScore(team, tied, officialMatches, rule) }))
  return teams.sort((a, b) => b.points - a.points ||
    b.headToHead.points - a.headToHead.points ||
    b.headToHead.goalDifference - a.headToHead.goalDifference ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    b.fairPlay - a.fairPlay ||
    a.teamName.localeCompare(b.teamName, 'zh-CN'))
    .map((team, index) => ({ ...team, rank: index + 1 }))
}

function buildStandings(matches, divisionsById) {
  const buckets = {}
  matches.filter(match => match.scoreReady && match.standingsEligible && !['returned', 'warning'].includes(match.resultStatus)).forEach(match => {
    const key = `${match.divisionId}:${match.groupName}`
    const bucket = buckets[key] ||= { divisionId: match.divisionId, divisionName: match.divisionName, groupName: match.groupName, official: [], all: [] }
    bucket.all.push(match)
    if (match.resultStatus === 'approved') bucket.official.push(match)
  })
  return Object.values(buckets).map(bucket => {
    const rule = pointsRule(divisionsById[bucket.divisionId] || {})
    const officialTable = {}; bucket.official.forEach(match => applyResult(officialTable, match, rule, false))
    const previewTable = {}; bucket.all.forEach(match => applyResult(previewTable, match, rule, match.resultStatus !== 'approved'))
    return {
      divisionId: bucket.divisionId,
      divisionName: bucket.divisionName,
      groupName: bucket.groupName,
      pointsRule: rule,
      tieBreakers: ['积分', '相互比赛积分', '相互比赛净胜球', '总净胜球', '总进球', '公平竞赛积分', '球队名称'],
      officialTeams: rankTeams(Object.values(officialTable), bucket.official, rule),
      previewTeams: rankTeams(Object.values(previewTable), bucket.all, rule),
      officialMatchCount: bucket.official.length,
      provisionalMatchCount: bucket.all.length - bucket.official.length
    }
  })
}

function buildKnockout(matches) {
  return matches.filter(match => ['knockout', 'cup', 'placement', 'final', 'semifinal'].includes(match.phase)).map(match => ({
    ...match,
    progressionReady: match.resultStatus === 'approved' && (match.homeScore !== match.awayScore || Boolean(match.winnerTeamId)),
    progressionLabel: match.resultStatus !== 'approved' ? '待正式赛果' : match.homeScore === match.awayScore && !match.winnerTeamId ? '待确认点球/晋级者' : '晋级关系可用'
  }))
}

function summary(matches) {
  return matches.reduce((result, match) => {
    if (match.resultStatus === 'not_submitted') result.notSubmitted += 1
    else if (match.resultStatus === 'pending_review') result.pendingReview += 1
    else if (match.resultStatus === 'approved') result.approved += 1
    else result.warning += 1
    return result
  }, { total: matches.length, notSubmitted: 0, pendingReview: 0, warning: 0, approved: 0 })
}

async function latestPublications(tournamentId) {
  try {
    const rows = await listAll('publication_snapshots', { tournamentId, sportCode: 'football' }, 200)
    return rows.sort((a, b) => timeValue(b.publishedAt || b.createTime) - timeValue(a.publishedAt || a.createTime)).slice(0, 20).map(item => ({
      id: text(item._id), type: text(item.type), version: number(item.version, 1), status: text(item.status), divisionId: text(item.divisionId), publishedAt: rawDate(item.publishedAt || item.createTime), publishedByName: text(item.publishedByName)
    }))
  } catch (error) {
    return []
  }
}

async function buildDashboard(event, actor) {
  const tournamentId = text(event.tournamentId)
  if (!tournamentId) throw new Error('缺少赛事信息')
  const tournament = await getDocument('tournaments', tournamentId)
  if (!tournament || !belongsToActor(tournament, actor)) throw new Error('无权查看其他机构的赛事赛果')
  const [divisionRows, matchRows, publications] = await Promise.all([
    listAll('divisions', { tournamentId }, 300),
    listAll('matches', { tournamentId }, 1000),
    latestPublications(tournamentId)
  ])
  const divisions = divisionRows.length ? divisionRows : Array.isArray(tournament.divisions) ? tournament.divisions : []
  const divisionsById = Object.fromEntries(divisions.map(item => [text(item._id || item.id), item]))
  const matches = matchRows.map(item => normalizedMatch(item, divisionsById)).sort((a, b) => `${a.matchDate} ${a.matchTime} ${a.matchNo}`.localeCompare(`${b.matchDate} ${b.matchTime} ${b.matchNo}`, 'zh-CN'))
  return {
    success: true,
    tournament: { id: tournamentId, name: text(tournament.name) || '当前赛事', startDate: rawDate(tournament.startDate), endDate: rawDate(tournament.endDate), location: text(tournament.location || tournament.province), logo: text(tournament.logo || tournament.logoUrl) },
    divisions: divisions.map(item => ({ id: text(item._id || item.id), name: text(item.name) || '未命名组别', pointsRule: pointsRule(item) })),
    matches,
    summary: summary(matches),
    standings: buildStandings(matches, divisionsById),
    knockout: buildKnockout(matches),
    publications,
    generatedAt: new Date().toISOString()
  }
}

async function publishStandings(event, actor) {
  const dashboard = await buildDashboard(event, actor)
  const divisionId = text(event.divisionId)
  const standings = dashboard.standings.filter(item => !divisionId || item.divisionId === divisionId)
  if (!standings.some(item => item.officialMatchCount > 0)) return { success: false, code: 'NO_OFFICIAL_RESULTS', message: '当前范围还没有已复核赛果，不能发布积分榜' }
  if (dashboard.matches.some(item => (!divisionId || item.divisionId === divisionId) && item.resultStatus === 'warning')) return { success: false, code: 'RESULT_WARNING', message: '当前范围存在异常赛果，请先完成复核' }
  const previous = (await listAll('publication_snapshots', { tournamentId: text(event.tournamentId), sportCode: 'football', type: 'standings' }, 200)).filter(item => !divisionId || text(item.divisionId) === divisionId)
  const version = previous.reduce((max, item) => Math.max(max, number(item.version, 0)), 0) + 1
  const sourceResultVersions = dashboard.matches.filter(item => item.resultStatus === 'approved' && item.standingsEligible && (!divisionId || item.divisionId === divisionId)).map(item => `${item.id}:${timeValue(item.reviewedAt)}`)
  const added = await db.collection('publication_snapshots').add({ data: {
    sportCode: 'football', tournamentId: text(event.tournamentId), divisionId, orgId: actor.orgId,
    type: 'standings', version, status: 'published', sourceResultVersions, payload: { standings },
    publishedBy: text(actor.user._id), publishedByName: text(actor.user.nickname || actor.user.userName || actor.user.phone) || '赛事主办方',
    publishedAt: db.serverDate(), createTime: db.serverDate(), updateTime: db.serverDate()
  } })
  return { success: true, snapshotId: added._id, version, message: `积分榜 V${version} 已生成正式发布快照` }
}

exports.main = async (event = {}) => {
  try {
    const actor = await authenticate(event)
    const action = text(event.action || 'dashboard')
    if (action === 'dashboard') return await buildDashboard(event, actor)
    if (action === 'publishStandings') return await publishStandings(event, actor)
    return { success: false, code: 'UNSUPPORTED_ACTION', message: '不支持的赛果中心操作' }
  } catch (error) {
    console.error('resultCenter failed:', error)
    return { success: false, code: 'RESULT_CENTER_FAILED', message: error.message || '赛果中心加载失败' }
  }
}
