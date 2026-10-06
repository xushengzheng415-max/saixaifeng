const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const staffPolicy = require('./staffPolicy.cjs')

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

function scoreValue(value) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 99 ? parsed : null
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
  const orgId = text(sessions[0].activeOrgId || event.__actorOrgId || user.orgId || user.organizationId)
  if (!orgId) throw new Error('当前账号尚未关联机构，请先完成机构引导')
  if (event.__actorUserId && text(event.__actorUserId) !== text(user._id)) throw new Error('登录身份校验失败')
  if (event.__actorOrgId && text(event.__actorOrgId) !== orgId) throw new Error('机构归属校验失败')
  return { user, orgId, staff: await staffPolicy.isStaff(db, user._id, orgId) && !await staffPolicy.owner(db, user._id, orgId) }
}

async function staffMatches(event, actor) {
  const tournamentId = text(event.tournamentId)
  if (!await staffPolicy.hasRight(db, actor.user._id, actor.orgId, tournamentId, 'result.supplement')) throw new Error('当前赛事没有补录权限')
  const tournament = await getDocument('tournaments', tournamentId)
  if (!tournament || !belongsToActor(tournament, actor)) throw new Error('赛事不存在或无权访问')
  const rows = await listAll('matches', { tournamentId }, 20000)
  if (rows.length >= 20000) throw new Error('赛事比赛超过补录读取范围')
  const registrations = await listAll('tournament_teams', { tournamentId }, 20000)
  const teamDirectory = await buildTeamDirectory(rows, registrations)
  return { success: true, orgId: actor.orgId, tournament: { id: tournamentId, name: text(tournament.name) }, matches: rows.map(match => ({
    id: text(match._id),
    homeName: teamNameOf(match, 'home', teamDirectory[teamIdOf(match, 'home')] || {}),
    homeLogo: teamLogoOf(match, 'home', teamDirectory[teamIdOf(match, 'home')] || {}),
    awayName: teamNameOf(match, 'away', teamDirectory[teamIdOf(match, 'away')] || {}),
    awayLogo: teamLogoOf(match, 'away', teamDirectory[teamIdOf(match, 'away')] || {}),
    homeTeamId: text(match.homeTeamId), awayTeamId: text(match.awayTeamId), date: text(match.matchDate || match.date), time: text(match.matchTime), divisionName: text(match.divisionName),
    status: text(match.status), homeScore: match.homeScore == null ? null : Number(match.homeScore), awayScore: match.awayScore == null ? null : Number(match.awayScore),
    phase: text(match.phase || match.scheduleType || match.stage), hasRefereeRecord: Boolean(match.refereeRecord || match.refereeSubmittedAt),
    hasResult: Boolean(match.resultVersionId || match.resultSubmittedAt || [match.homeScore, match.awayScore].every(score => score !== null && score !== undefined && score !== ''))
  })) }
}

async function supplementResult(event, actor) {
  const tournamentId = text(event.tournamentId), matchId = text(event.matchId)
  if (!await staffPolicy.hasRight(db, actor.user._id, actor.orgId, tournamentId, 'result.supplement')) throw new Error('当前赛事没有补录权限')
  const tournament = await getDocument('tournaments', tournamentId)
  if (!tournament || !belongsToActor(tournament, actor)) throw new Error('赛事不存在或无权访问')
  const scores = [event.homeScore, event.awayScore].map(Number)
  if (!matchId || [event.homeScore, event.awayScore].some(score => score === '' || score === null || score === undefined) || scores.some(score => !Number.isInteger(score) || score < 0 || score > 99)) throw new Error('请输入 0 至 99 的整数比分')
  const files = Array.isArray(event.evidenceFileIds) ? event.evidenceFileIds.map(text) : []
  if (files.length < 1 || files.length > 2 || files.some(id => !id.startsWith('cloud://') || !id.includes('/match-result-evidence/' + actor.orgId + '/' + matchId + '/'))) throw new Error('请上传 1 至 2 张本场纸质比赛记录')
  const checked = await cloud.getTempFileURL({ fileList: files }).catch(() => ({ fileList: [] }))
  if ((checked.fileList || []).filter(item => item.tempFileURL || item.tempFileUrl).length !== files.length) throw new Error('比赛记录照片读取失败，请重新上传')
  const versionId = 'ORG-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex')
  await db.runTransaction(async transaction => {
    const response = await transaction.collection('matches').doc(matchId).get()
    const match = Array.isArray(response.data) ? response.data[0] : response.data
    if (!match || text(match.tournamentId) !== tournamentId || match.orgId && text(match.orgId) !== actor.orgId) throw new Error('比赛不存在或无权访问')
    if (!['finished', 'completed', 'ended', 'pending_result', 'pending_review'].includes(text(match.status).toLowerCase())) throw new Error('比赛尚未完赛')
    if (match.refereeRecord || match.refereeSubmittedAt || match.refereeReviewStatus) throw new Error('已有裁判记录，请走赛果复核')
    if (match.resultVersionId || match.resultSubmittedAt || [match.homeScore, match.awayScore].every(score => score !== null && score !== undefined && score !== '') || ['approved', 'archived', 'official'].includes(text(match.resultReviewStatus).toLowerCase())) throw new Error('已有赛果，请走异常纠错')
    const knockout = /knockout|elimination|淘汰/i.test(text(match.phase || match.scheduleType || match.stage))
    const homeId = text(match.homeTeamId), awayId = text(match.awayTeamId)
    if (!homeId || !awayId || homeId === awayId) throw new Error('本场球队身份不完整，请先核对对阵')
    const winnerTeamId = scores[0] === scores[1] ? text(event.winnerTeamId) : scores[0] > scores[1] ? homeId : awayId
    if (knockout && scores[0] === scores[1] && (![homeId, awayId].includes(winnerTeamId) || !['penalties', 'extra_time'].includes(text(event.resolution)))) throw new Error('淘汰赛平局须填写决胜方式和晋级球队')
    const data = {
      homeScore: scores[0], awayScore: scores[1], scoreHome: scores[0], scoreAway: scores[1],
      resultReviewStatus: 'approved', resultSource: 'organizer_supplement', resultEntryMode: 'organizer_supplement', resultVersionId: versionId,
      resultSubmittedAt: db.serverDate(), resultArchivedAt: db.serverDate(), resultArchivedBy: text(actor.user._id),
      organizerSupplementFiles: files, organizerSupplementNote: text(event.note).slice(0, 300), organizerSupplementUpdatedAt: db.serverDate(), updateTime: db.serverDate()
    }
    if (winnerTeamId) data.winnerTeamId = winnerTeamId
    if (event.resolution) data.resolution = text(event.resolution)
    await transaction.collection('matches').doc(matchId).update({ data })
    await transaction.collection('registration_audit_logs').add({ data: { sport: 'football', action: 'organizer_result_supplement_archived', tournamentId, matchId, actorUserId: text(actor.user._id), actorOrgId: actor.orgId, detail: { versionId, homeScore: scores[0], awayScore: scores[1], evidenceFileIds: files }, createTime: db.serverDate() } })
  })
  return { success: true, resultVersionId: versionId }
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

async function listByDocumentIds(collection, ids) {
  const rows = []
  const uniqueIds = [...new Set((ids || []).map(text).filter(Boolean))]
  for (let index = 0; index < uniqueIds.length; index += 10) {
    const chunk = uniqueIds.slice(index, index + 10)
    const page = (await db.collection(collection).where({ _id: db.command.in(chunk) }).limit(chunk.length).get()).data || []
    rows.push(...page)
  }
  return rows
}

async function listMatchEvents(matchIds) {
  const uniqueIds = [...new Set((matchIds || []).map(text).filter(Boolean))]
  const rows = []
  for (let index = 0; index < uniqueIds.length; index += 50) {
    const chunk = uniqueIds.slice(index, index + 50)
    try {
      const page = (await db.collection('match_events').where({ matchId: db.command.in(chunk) }).limit(200).get()).data || []
      rows.push(...page)
    } catch (error) {
      console.warn('比赛事件读取失败:', error && error.message)
    }
  }
  return rows
}

function eventIdentity(event) {
  const typeAlias = {
    score: 'goal',
    penalty_goal: 'penalty_scored',
    penalty_miss: 'penalty_missed',
    missed_penalty: 'penalty_missed',
    yellow: 'yellow_card',
    yellowcard: 'yellow_card',
    red: 'red_card',
    redcard: 'red_card',
    second_yellow: 'second_yellow_red',
    yellow_red: 'second_yellow_red'
  }
  const rawType = text(event && (event.type || event.eventType))
  const stableId = text(event && (event._id || event.eventId || event.id))
  if (stableId) return `id:${stableId}`
  return [
    typeAlias[rawType] || rawType,
    number(event && event.minute, 0),
    text(event && (event.playerId || event.player_id)),
    text(event && (event.playerName || event.player_name)),
    text(event && (event.teamSide || event.side)),
    text(event && (event.teamId || event.team_id)),
    text(event && (event.teamName || event.team_name)),
    text(event && event.penaltyOutcome)
  ].join('|')
}

function mergeMatchEvents(externalEvents, embeddedEvents) {
  const seen = new Set()
  // matches.events 是裁判电子记录的当前真源；旧 match_events 只作为历史兼容补充。
  return [...(embeddedEvents || []), ...(externalEvents || [])].map(event => {
    if (!event || typeof event !== 'object') return null
    const rawType = text(event.type || event.eventType)
    const type = ({ score: 'goal', penalty_goal: 'penalty_scored', penalty_miss: 'penalty_missed', missed_penalty: 'penalty_missed', yellow: 'yellow_card', yellowcard: 'yellow_card', red: 'red_card', redcard: 'red_card', second_yellow: 'second_yellow_red', yellow_red: 'second_yellow_red' })[rawType] || rawType
    return { ...event, type, teamSide: event.teamSide === 'away' || event.side === 'away' ? 'away' : 'home', playerName: String(event.playerName || event.player || '').trim(), assistName: String(event.assistName || event.assist || '').trim() }
  }).filter(event => {
    if (!event) return false
    const key = eventIdentity(event)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
function teamProfileName(record) {
  return text(record && (record.name || record.teamName))
}

function teamProfileLogo(record) {
  if (!record) return ''
  return text(record.teamLogo || record.logoTransparentUrl || record.logoUrl || record.logoTransparent || record.logo || record.logoOriginal || record.logoFileID || record.logoFileId)
}

async function resolveTeamLogoUrls(directory) {
  const cloudIds = [...new Set(Object.values(directory).map(item => text(item.logo)).filter(value => value && !/^https?:\/\//i.test(value)))]
  const urlByFileId = new Map()
  for (let index = 0; index < cloudIds.length; index += 50) {
    try {
      const result = await cloud.getTempFileURL({ fileList: cloudIds.slice(index, index + 50) })
      ;(result.fileList || []).forEach(item => {
        const fileId = text(item.fileID || item.fileId)
        const url = text(item.tempFileURL || item.tempFileUrl)
        if (fileId && url) urlByFileId.set(fileId, url)
      })
    } catch (error) {
      console.warn('球队队徽临时地址解析失败:', error && error.message)
    }
  }
  Object.values(directory).forEach(item => {
    if (urlByFileId.has(item.logo)) item.logo = urlByFileId.get(item.logo)
  })
  return directory
}

async function buildTeamDirectory(matchRows, registrationRows) {
  const matchTeamIds = (matchRows || []).flatMap(match => [teamIdOf(match, 'home'), teamIdOf(match, 'away')]).filter(Boolean)
  const registrationTeamIds = (registrationRows || []).map(row => text(row.teamId)).filter(Boolean)
  const teamRows = await listByDocumentIds('teams', [...matchTeamIds, ...registrationTeamIds])
  const directory = {}
  teamRows.forEach(row => {
    const id = text(row._id || row.id)
    const profile = { name: teamProfileName(row), logo: teamProfileLogo(row), synthetic:row.synthetic === true, syntheticDatasetId:text(row.syntheticDatasetId) }
    if (id) directory[id] = profile
    if (profile.name) directory[`name:${profile.name}`] = profile
  })
  ;(registrationRows || []).forEach(row => {
    const id = text(row.teamId || row._id)
    if (!id) return
    const current = directory[id] || { name: '', logo: '' }
    directory[id] = {
      name: current.name || teamProfileName(row),
      logo: current.logo || teamProfileLogo(row),
      synthetic:current.synthetic === true || row.synthetic === true,
      syntheticDatasetId:current.syntheticDatasetId || text(row.syntheticDatasetId)
    }
    const relationId = text(row._id)
    if (relationId) directory[relationId] = directory[id]
    if (directory[id].name) directory[`name:${directory[id].name}`] = directory[id]
  })
  return resolveTeamLogoUrls(directory)
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

function teamNameOf(match, side, profile = {}) {
  const direct = side === 'home' ? match.homeTeamName : match.awayTeamName
  const nested = side === 'home' ? match.homeTeam : match.awayTeam
  const nestedName = nested && typeof nested === 'object' ? nested.name || nested.teamName : nested
  return text(direct || nestedName || profile.name) || (side === 'home' ? '主队待定' : '客队待定')
}

function teamLogoOf(match, side, profile = {}) {
  const direct = side === 'home' ? match.homeTeamLogo : match.awayTeamLogo
  const nested = side === 'home' ? match.homeTeam : match.awayTeam
  return text(direct || (nested && (nested.logoTransparentUrl || nested.logoUrl || nested.logo)) || profile.logo)
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

function scoreFromEvents(events, match) {
  const score = { home: 0, away: 0 }
  ;(Array.isArray(events) ? events : []).forEach(function (event) {
    const type = text(event && (event.type || event.eventType)).toLowerCase()
    if (!['goal', 'penalty', 'penalty_scored', 'penalty_goal', 'own_goal', 'own-goal', 'og'].includes(type)) return
    let side = text(event && (event.teamSide || event.side)).toLowerCase() === 'away' || text(event && event.teamId) === teamIdOf(match || {}, 'away') || text(event && event.teamName) === teamNameOf(match || {}, 'away') ? 'away' : 'home'
    if (['own_goal', 'own-goal', 'og'].includes(type)) side = side === 'home' ? 'away' : 'home'
    score[side] = Math.min(99, score[side] + 1)
  })
  return score
}

function refereeSubmissionExists(match) {
  return Boolean(match && (match.refereeRecord || match.refereeSubmittedAt || match.refereeReviewStatus))
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
  // PC 后台补录是主办方的正式录入，比分齐全且没有裁判提交时直接成为正式赛果。
  // 只有裁判/计分台回传才进入复核状态机；保留显式异常和退回状态，避免吞掉人工阻断。
  if (!refereeSubmissionExists(match)) {
    if (statuses.some(value => ['warning', 'conflict', 'abandoned'].includes(value))) return 'warning'
    if (statuses.some(value => ['returned', 'rejected'].includes(value))) return 'returned'
    return 'approved'
  }
  if (statuses.some(value => ['archived', 'approved', 'official'].includes(value))) return 'approved'
  if (statuses.some(value => ['returned', 'rejected'].includes(value))) return 'returned'
  if (statuses.some(value => ['warning', 'conflict', 'abandoned'].includes(value))) return 'warning'
  return 'pending_review'
}

function phaseOf(match) {
  return text(match.phase || match.scheduleType || match.stage).toLowerCase()
}

function reviewStageOf(match) {
  const phase = phaseOf(match)
  const hint = `${phase} ${text(match.phaseLabel || match.roundName || match.stageName)}`.toLowerCase()
  if (['group', 'league', 'round_robin'].includes(phase) || /小组|联赛|循环/.test(hint)) return 'group'
  if (['knockout', 'cup', 'final', 'semifinal'].includes(phase) || /淘汰|半决|决赛|八强|四强|杯赛/.test(hint)) return 'knockout'
  if (phase === 'placement' || /排位|名次/.test(hint)) return 'placement'
  return 'other'
}

function reviewStageOrder(stage) {
  return ({ group: 0, knockout: 1, placement: 2, other: 3 }[stage] ?? 3)
}

function matchSequenceValue(match) {
  const value = text(match.matchNo || match.matchSequence || match.sequence || match.matchIndex)
  const parts = value.match(/\d+/g) || []
  return parts.length ? number(parts.at(-1), Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER
}

function compareReviewMatches(a, b) {
  return text(a.divisionName).localeCompare(text(b.divisionName), 'zh-CN', { numeric: true }) ||
    reviewStageOrder(a.reviewStage) - reviewStageOrder(b.reviewStage) ||
    matchSequenceValue(a) - matchSequenceValue(b) ||
    `${a.matchDate} ${a.matchTime}`.localeCompare(`${b.matchDate} ${b.matchTime}`, 'zh-CN')
}

function standingsEligible(match) {
  const phase = phaseOf(match)
  const status = text(match.status).toLowerCase()
  if (match.isBye === true || ['cancelled', 'canceled', 'void'].includes(status)) return false
  if (match.standingsEligible === false) return false
  if (['knockout', 'cup', 'placement', 'final', 'semifinal'].includes(phase)) return false
  return match.standingsEligible === true || ['group', 'league', 'round_robin'].includes(phase)
}

function winnerTeamIdOf(match) {
  const explicit = text(match.winnerTeamId)
  if (explicit) return explicit
  const homePenalty = Number(match.homePenaltyScore ?? match.penaltyHomeScore ?? match.penaltiesHome)
  const awayPenalty = Number(match.awayPenaltyScore ?? match.penaltyAwayScore ?? match.penaltiesAway)
  if (Number.isFinite(homePenalty) && Number.isFinite(awayPenalty) && homePenalty !== awayPenalty) {
    return homePenalty > awayPenalty ? teamIdOf(match, 'home') : teamIdOf(match, 'away')
  }
  const side = text(match.winnerSide).toLowerCase()
  if (side === 'home') return teamIdOf(match, 'home')
  if (side === 'away') return teamIdOf(match, 'away')
  return ''
}

function footballWarnings(match, status, division) {
  const warnings = []
  const phase = phaseOf(match)
  const knockout = ['knockout', 'cup', 'placement', 'final', 'semifinal'].includes(phase)
  const tied = scoreReady(match) && number(match.homeScore) === number(match.awayScore)
  const winnerTeamId = winnerTeamIdOf(match)
  const winnerValid = winnerTeamId && [teamIdOf(match, 'home'), teamIdOf(match, 'away')].includes(winnerTeamId)
  if (knockout && tied && !winnerTeamId && !text(match.resolution || match.decisionMethod)) {
    warnings.push('淘汰赛平局缺少加时/点球决胜与晋级球队')
  }
  if (!knockout && standingsEligible(match) && tied && pointsRule(division).drawResolution === 'penalties' && !winnerValid) {
    warnings.push('常规时间战平，缺少点球决胜结果和胜者')
  }
  if (status === 'warning') warnings.push(text(match.resultWarning || match.exceptionReason) || '赛果存在异常，需人工核验')
  return warnings
}

function normalizedMatch(match, divisionsById, teamDirectory = {}) {
  const status = resultStatus(match)
  const divisionId = divisionIdOf(match)
  const division = divisionsById[divisionId] || {}
  const homeTeamId = teamIdOf(match, 'home')
  const awayTeamId = teamIdOf(match, 'away')
  const rawHomeName = text(match.homeTeamName || (match.homeTeam && (match.homeTeam.name || match.homeTeam.teamName)))
  const rawAwayName = text(match.awayTeamName || (match.awayTeam && (match.awayTeam.name || match.awayTeam.teamName)))
  const homeProfile = teamDirectory[homeTeamId] || teamDirectory[`name:${rawHomeName}`] || {}
  const awayProfile = teamDirectory[awayTeamId] || teamDirectory[`name:${rawAwayName}`] || {}
  const eventScore = Array.isArray(match.events) && !match.resultCorrection && match.resultType !== 'forfeit' ? scoreFromEvents(match.events, match) : null
  const scoreMatch = eventScore ? { ...match, homeScore: eventScore.home, awayScore: eventScore.away } : match
  const homeScore = scoreReady(scoreMatch) ? number(scoreMatch.homeScore) : null
  const awayScore = scoreReady(scoreMatch) ? number(scoreMatch.awayScore) : null
  const winnerTeamId = winnerTeamIdOf(scoreMatch)
  const phaseLabel = text(match.phaseLabel || match.roundName || match.stageName) || '比赛阶段'
  const reviewStage = reviewStageOf(match)
  const groupName = reviewStage === 'group' ? groupNameOf(match) : phaseLabel
  const warnings = footballWarnings(scoreMatch, status, division)
  return {
    id: text(match._id || match.id),
    matchNo: text(match.matchNo || match.matchSequence || match.sequence || match.matchIndex),
    divisionId,
    divisionName: text(match.divisionName || (divisionsById[divisionId] && divisionsById[divisionId].name)) || '未分组别',
    groupName,
    phase: phaseOf(match),
    phaseLabel,
    reviewStage,
    reviewStageLabel: reviewStage === 'group' ? groupName : phaseLabel,
    roundName: text(match.roundName || match.roundLabel || match.round),
    matchDate: text(match.matchDate || match.date),
    matchTime: text(match.matchTime || match.startTime),
    venue: text(match.venue || match.field) || '场地待定',
    homeTeamId,
    homeTeamName: teamNameOf(match, 'home', homeProfile),
    homeTeamLogo: teamLogoOf(match, 'home', homeProfile),
    awayTeamId,
    awayTeamName: teamNameOf(match, 'away', awayProfile),
    awayTeamLogo: teamLogoOf(match, 'away', awayProfile),
    homeScore,
    awayScore,
    scoreReady: scoreReady(scoreMatch),
    resultStatus: warnings.length ? 'warning' : status,
    warnings,
    source: match.resultCorrection ? '归档后异常纠错' : (match.refereeRecord || match.refereeSubmittedAt ? '裁判/计分台回传' : match.resultVersionId ? '赛果版本' : scoreReady(match) ? '后台记录' : '尚未录入'),
    submittedAt: rawDate(match.refereeSubmittedAt || match.resultSubmittedAt || match.updateTime || ''),
    reviewedAt: rawDate(match.resultCorrectedAt || (match.resultCorrection && match.resultCorrection.correctedAt) || match.refereeRecordArchivedAt || match.resultReviewedAt || match.updateTime || ''),
    resultCorrection: match.resultCorrection && typeof match.resultCorrection === 'object' ? {
      correctionId: text(match.resultCorrection.correctionId),
      previousVersionId: text(match.resultCorrection.previousVersionId),
      reason: text(match.resultCorrection.reason),
      actorName: text(match.resultCorrection.actorName || match.resultCorrection.correctedByName),
      correctedAt: rawDate(match.resultCorrection.correctedAt || match.resultCorrection.updateTime),
      before: match.resultCorrection.before && typeof match.resultCorrection.before === 'object' ? {
        homeScore: number(match.resultCorrection.before.homeScore),
        awayScore: number(match.resultCorrection.before.awayScore)
      } : null,
      after: match.resultCorrection.after && typeof match.resultCorrection.after === 'object' ? {
        homeScore: number(match.resultCorrection.after.homeScore),
        awayScore: number(match.resultCorrection.after.awayScore)
      } : null
    } : null,
    winnerTeamId,
    homePenaltyScore: number(match.homePenaltyScore ?? match.penaltyHomeScore ?? match.penaltiesHome, 0),
    awayPenaltyScore: number(match.awayPenaltyScore ?? match.penaltyAwayScore ?? match.penaltiesAway, 0),
    resolution: text(match.resolution || match.decisionMethod || (homeScore !== null && awayScore !== null && homeScore !== awayScore ? 'regular_time' : winnerTeamId ? 'penalties' : '')),
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
  const drawResolution = text(points.drawResolution || (division && division.drawResolution) || 'draw').toLowerCase()
  return {
    win: number(points.win ?? (division && division.winPoints), 3),
    draw: number(points.draw ?? (division && division.drawPoints), 1),
    loss: number(points.loss ?? (division && division.lossPoints), 0),
    drawResolution: ['penalties', 'penalty_shootout', 'shootout'].includes(drawResolution) ? 'penalties' : 'draw',
    penaltyWin: number(points.penaltyWin ?? (division && division.penaltyWinPoints), 2),
    penaltyLoss: number(points.penaltyLoss ?? (division && division.penaltyLossPoints), 0),
    tieBreakers: Array.isArray(division && division.rankingTieBreakers) ? division.rankingTieBreakers : [
      'headToHeadPoints', 'headToHeadGoalDifference', 'headToHeadGoalsFor',
      'goalDifference', 'goalsFor', 'redCardsFewest', 'yellowCardsFewest', 'drawingLots'
    ],
    source: points.win != null || division && division.winPoints != null ? '组别规则' : '足球标准规则'
  }
}

function addTeam(table, id, name, logo) {
  const key = id || `name:${name}`
  if (!table[key]) table[key] = { teamId: id, teamName: name, logo, played: 0, win: 0, draw: 0, loss: 0, penaltyWin: 0, penaltyLoss: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, fairPlay: 0, yellowCards: 0, redCards: 0, provisionalMatches: 0 }
  return table[key]
}

function addScheduledTeam(table, id, name, logo) {
  const normalizedId = text(id)
  const normalizedName = text(name)
  if (!normalizedId && (!normalizedName || ['主队待定', '客队待定'].includes(normalizedName))) return
  addTeam(table, normalizedId, normalizedName || '球队待定', text(logo))
}

function applyResult(table, match, rule, provisional) {
  const home = addTeam(table, match.homeTeamId, match.homeTeamName, match.homeTeamLogo)
  const away = addTeam(table, match.awayTeamId, match.awayTeamName, match.awayTeamLogo)
  home.played += 1; away.played += 1
  home.goalsFor += match.homeScore; home.goalsAgainst += match.awayScore
  away.goalsFor += match.awayScore; away.goalsAgainst += match.homeScore
  if (match.homeScore > match.awayScore) { home.win += 1; away.loss += 1; home.points += rule.win; away.points += rule.loss }
  else if (match.homeScore < match.awayScore) { away.win += 1; home.loss += 1; away.points += rule.win; home.points += rule.loss }
  else if (rule.drawResolution === 'penalties') {
    const homeWon = text(match.winnerTeamId) === text(match.homeTeamId)
    const awayWon = text(match.winnerTeamId) === text(match.awayTeamId)
    if (homeWon) { home.win += 1; home.penaltyWin += 1; away.loss += 1; away.penaltyLoss += 1; home.points += rule.penaltyWin; away.points += rule.penaltyLoss }
    else if (awayWon) { away.win += 1; away.penaltyWin += 1; home.loss += 1; home.penaltyLoss += 1; away.points += rule.penaltyWin; home.points += rule.penaltyLoss }
  } else { home.draw += 1; away.draw += 1; home.points += rule.draw; away.points += rule.draw }
  home.fairPlay -= match.yellowHome + match.redHome * 3
  away.fairPlay -= match.yellowAway + match.redAway * 3
  home.yellowCards += match.yellowHome; away.yellowCards += match.yellowAway
  home.redCards += match.redHome; away.redCards += match.redAway
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
    if (scored > conceded) mini.points += rule.win
    else if (scored < conceded) mini.points += rule.loss
    else if (rule.drawResolution === 'penalties') mini.points += text(match.winnerTeamId) === text(team.teamId) ? rule.penaltyWin : rule.penaltyLoss
    else mini.points += rule.draw
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
    b.headToHead.goalsFor - a.headToHead.goalsFor ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    a.redCards - b.redCards ||
    a.yellowCards - b.yellowCards ||
    a.teamName.localeCompare(b.teamName, 'zh-CN'))
    .map((team, index) => ({ ...team, rank: index + 1 }))
}

function buildStandings(matches, divisionsById) {
  const buckets = {}
  matches.filter(match => match.standingsEligible).forEach(match => {
    const key = `${match.divisionId}:${match.groupName}`
    const bucket = buckets[key] ||= { divisionId: match.divisionId, divisionName: match.divisionName, groupName: match.groupName, teams: {}, official: [], all: [] }
    addScheduledTeam(bucket.teams, match.homeTeamId, match.homeTeamName, match.homeTeamLogo)
    addScheduledTeam(bucket.teams, match.awayTeamId, match.awayTeamName, match.awayTeamLogo)
    if (!match.scoreReady || ['returned', 'warning'].includes(match.resultStatus)) return
    bucket.all.push(match)
    if (match.resultStatus === 'approved') bucket.official.push(match)
  })
  return Object.values(buckets).map(bucket => {
    const rule = pointsRule(divisionsById[bucket.divisionId] || {})
    const officialTable = {}; const previewTable = {}
    Object.values(bucket.teams).forEach(team => {
      addTeam(officialTable, team.teamId, team.teamName, team.logo)
      addTeam(previewTable, team.teamId, team.teamName, team.logo)
    })
    bucket.official.forEach(match => applyResult(officialTable, match, rule, false))
    bucket.all.forEach(match => applyResult(previewTable, match, rule, match.resultStatus !== 'approved'))
    return {
      divisionId: bucket.divisionId,
      divisionName: bucket.divisionName,
      groupName: bucket.groupName,
      pointsRule: rule,
      tieBreakers: ['积分', '相互比赛积分', '相互比赛净胜球', '相互比赛进球数', '总净胜球', '总进球', '红牌数少者', '黄牌数少者', '抽签决定'],
      officialTeams: rankTeams(Object.values(officialTable), bucket.official, rule),
      previewTeams: rankTeams(Object.values(previewTable), bucket.all, rule),
      officialMatchCount: bucket.official.length,
      provisionalMatchCount: bucket.all.length - bucket.official.length
    }
  }).sort((a, b) => a.divisionName.localeCompare(b.divisionName, 'zh-CN', { numeric: true }) || a.groupName.localeCompare(b.groupName, 'zh-CN', { numeric: true }))
}

function normalizedGroupName(value) {
  return text(value).replace(/[\s　]/g,'').toUpperCase()
}

function sourceForSide(match, side) {
  const direct = side === 'home' ? match.homeSource : match.awaySource
  if (direct && typeof direct === 'object' && direct.type) return direct
  const type = text(side === 'home' ? match.homeSourceType : match.awaySourceType)
  const label = text(side === 'home' ? match.homeSourceLabel : match.awaySourceLabel)
  if (type === 'group_rank') {
    const group = label.match(/^(.+?组)第?(\d+)$/)
    return group ? { type:'group_rank',groupName:group[1],rank:Number(group[2]) } : null
  }
  if (type === 'match_winner' || type === 'match_loser') {
    const no = Number((label.match(/(?:场序)?(\d+)/) || [])[1] || 0)
    return no ? { type,matchNo:no } : null
  }
  return null
}

function teamFromMatch(match, side) {
  return {
    teamId: teamIdOf(match, side),
    teamName: teamNameOf(match, side),
    logo: teamLogoOf(match, side)
  }
}

function resolvedWinnerAndLoser(match) {
  if (!match || resultStatus(match) !== 'approved') return null
  const home = teamFromMatch(match,'home'), away = teamFromMatch(match,'away')
  let winnerId = winnerTeamIdOf(match)
  if (!winnerId && scoreReady(match) && number(match.homeScore) !== number(match.awayScore)) winnerId = number(match.homeScore) > number(match.awayScore) ? home.teamId : away.teamId
  if (!winnerId || !home.teamId || !away.teamId) return null
  if (winnerId === home.teamId) return { winner:home,loser:away }
  if (winnerId === away.teamId) return { winner:away,loser:home }
  return null
}

function buildOfficialGroupRankMap(matches, standings) {
  const completeGroups = new Set()
  const groupBuckets = {}
  matches.filter(match => phaseOf(match) === 'group').forEach(match => {
    const key = `${divisionIdOf(match)}:${normalizedGroupName(groupNameOf(match))}`
    ;(groupBuckets[key] ||= []).push(match)
  })
  Object.entries(groupBuckets).forEach(([key,rows]) => {
    if (rows.length && rows.every(match => resultStatus(match) === 'approved')) completeGroups.add(key)
  })
  const rankMap = new Map()
  standings.forEach(table => {
    const key = `${table.divisionId}:${normalizedGroupName(table.groupName)}`
    if (!completeGroups.has(key)) return
    table.officialTeams.forEach(team => rankMap.set(`${key}:${team.rank}`,{ teamId:text(team.teamId),teamName:text(team.teamName),logo:text(team.logo) }))
  })
  return rankMap
}

function resolveSourceTeam(source,targetMatch,matchByNo,groupRankMap) {
  if (!source) return null
  const divisionId = divisionIdOf(targetMatch)
  if (source.type === 'group_rank') {
    return groupRankMap.get(`${divisionId}:${normalizedGroupName(source.groupName)}:${Number(source.rank || 0)}`) || null
  }
  if (source.type === 'match_winner' || source.type === 'match_loser') {
    const sourceMatch = matchByNo.get(`${divisionId}:${Number(source.matchNo || 0)}`)
    const result = resolvedWinnerAndLoser(sourceMatch)
    return result ? (source.type === 'match_winner' ? result.winner : result.loser) : null
  }
  return null
}

async function resolvePairingSources(tournamentId,matches,standings,actor) {
  const matchByNo = new Map(matches.map(match => [`${divisionIdOf(match)}:${Number(match.matchNo || match.matchIndex || 0)}`,match]))
  const groupRankMap = buildOfficialGroupRankMap(matches,standings)
  const changes = []
  for (const match of matches) {
    if (!match || match.isBye || match.executionSnapshot || ['ongoing','live','finished','completed','archived'].includes(text(match.status).toLowerCase())) continue
    const update = {}
    for (const side of ['home','away']) {
      const source = sourceForSide(match,side)
      if (!source || !['group_rank','match_winner','match_loser'].includes(source.type)) continue
      const team = resolveSourceTeam(source,match,matchByNo,groupRankMap)
      if (!team || !team.teamId) continue
      if (text(match[`${side}TeamId`]) !== team.teamId) {
        update[`${side}TeamId`] = team.teamId
        update[`${side}TeamName`] = team.teamName
        if (team.logo) update[`${side}TeamLogo`] = team.logo
        update[`${side}SourceResolvedAt`] = db.serverDate()
        update[`${side}SourceResolvedFrom`] = source.type
      }
    }
    const homeId = text(update.homeTeamId || match.homeTeamId)
    const awayId = text(update.awayTeamId || match.awayTeamId)
    if (!Object.keys(update).length) continue
    update.pairingResolutionStatus = homeId && awayId ? 'resolved' : 'partial'
    update.placeholderUntilResolved = !(homeId && awayId)
    update.statusText = homeId && awayId ? '未开始' : '待产生'
    update.updateTime = db.serverDate()
    await db.collection('matches').doc(text(match._id)).update({ data:update })
    Object.assign(match,update)
    changes.push({ matchId:text(match._id),matchNo:Number(match.matchNo || match.matchIndex || 0),divisionId:divisionIdOf(match),homeTeamId:homeId,awayTeamId:awayId,status:update.pairingResolutionStatus })
  }
  if (changes.length) {
    await db.collection('registration_audit_logs').add({ data:{ sport:'football',action:'pairing_sources_auto_resolved',tournamentId:text(tournamentId),actorOrgId:text(actor && actor.orgId),result:'success',detail:{ count:changes.length,matches:changes.slice(0,100) },createTime:db.serverDate() } })
  }
  return { updatedCount:changes.length,changes }
}

function buildKnockout(matches) {
  return matches.filter(match => ['knockout', 'placement'].includes(match.reviewStage)).map(match => ({
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

function applyMatchOrigin(normalized, events, origin) {
  return { ...normalized, events, originStatus:origin,
    resultStatus:origin === 'real' ? normalized.resultStatus : 'not_submitted',
    standingsEligible:origin === 'real' && normalized.standingsEligible }
}

async function buildDashboard(event, actor) {
  const tournamentId = text(event.tournamentId)
  if (!tournamentId) throw new Error('缺少赛事信息')
  const tournament = await getDocument('tournaments', tournamentId)
  if (!tournament || !belongsToActor(tournament, actor)) throw new Error('无权查看其他机构的赛事赛果')
  const [divisionRows, matchRows, publications, registrationRows] = await Promise.all([
    listAll('divisions', { tournamentId }, 300),
    listAll('matches', { tournamentId }, 1000),
    latestPublications(tournamentId),
    listAll('tournament_teams', { tournamentId }, 1000)
  ])
  const divisions = divisionRows.length ? divisionRows : Array.isArray(tournament.divisions) ? tournament.divisions : []
  const divisionsById = Object.fromEntries(divisions.map(item => [text(item._id || item.id), item]))
  const teamDirectory = await buildTeamDirectory(matchRows, registrationRows)
  const eventRows = await listMatchEvents(matchRows.map(item => item._id || item.id))
  const { matchOrigin, matchParticipantIds } = await import('./data-center/statistics.mjs')
  const preliminaryOrigin = { teamsById:teamDirectory, tournamentsById:{ [tournamentId]:tournament }, requireOriginEvidence:true }
  const participantMatches = matchRows.filter(match => resultStatus(match) !== 'not_submitted' && matchOrigin(match,preliminaryOrigin) === 'real')
  const participantIds = [...new Set(participantMatches.flatMap(match => [...matchParticipantIds(match,eventRows)]))]
  const playerProfiles = await listByDocumentIds('players',participantIds)
  const playersById = Object.fromEntries(playerProfiles.map(player => [text(player._id),player]))
  const originContext = { teamsById:teamDirectory, tournamentsById:{ [tournamentId]:tournament }, playersById, events:eventRows, requireOriginEvidence:true, requirePlayerOriginEvidence:true }
  const eventsByMatchId = eventRows.reduce((map, item) => {
    const matchId = text(item.matchId || item.match_id)
    if (!matchId) return map
    if (!map[matchId]) map[matchId] = []
    map[matchId].push(item)
    return map
  }, {})
  const normalizeWithEvents = item => {
    const sourceEvents = (eventsByMatchId[String(item._id || item.id)] || []).length ? eventsByMatchId[String(item._id || item.id)] : (Array.isArray(item.events) ? item.events : [])
    const normalized = normalizedMatch(sourceEvents.length ? { ...item, events: sourceEvents } : item, divisionsById, teamDirectory)
    const origin = matchOrigin(item,originContext)
    return applyMatchOrigin(normalized,sourceEvents,origin)
  }
  let matches = matchRows.map(normalizeWithEvents).sort(compareReviewMatches)
  let standings = buildStandings(matches, divisionsById)
  const pairingResolution = await resolvePairingSources(tournamentId,matchRows,standings,actor)
  if (pairingResolution.updatedCount) {
    matches = matchRows.map(normalizeWithEvents).sort(compareReviewMatches)
    standings = buildStandings(matches, divisionsById)
  }
  return {
    success: true,
    tournament: { id: tournamentId, name: text(tournament.name) || '当前赛事', startDate: rawDate(tournament.startDate), endDate: rawDate(tournament.endDate), location: text(tournament.location || tournament.province), logo: text(tournament.logo || tournament.logoUrl) },
    divisions: divisions.map(item => ({ id: text(item._id || item.id), name: text(item.name) || '未命名组别', pointsRule: pointsRule(item) })),
    matches,
    events: eventRows,
    summary: summary(matches),
    standings,
    knockout: buildKnockout(matches),
    publications,
    pairingResolution,
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

async function correctArchivedScore(event, actor) {
  const matchId = text(event.matchId)
  const tournamentId = text(event.tournamentId)
  const reason = text(event.reason).slice(0, 300)
  const homeScore = scoreValue(event.homeScore)
  const awayScore = scoreValue(event.awayScore)
  if (!matchId || !tournamentId) return { success: false, code: 'MATCH_REQUIRED', message: '缺少比赛信息' }
  if (homeScore === null || awayScore === null) return { success: false, code: 'SCORE_INVALID', message: '请输入0至99之间的整数比分' }
  if (reason.length < 2) return { success: false, code: 'CORRECTION_REASON_REQUIRED', message: '请填写比分更正原因' }

  const match = await getDocument('matches', matchId)
  if (!match || text(match.tournamentId) !== tournamentId) return { success: false, code: 'MATCH_NOT_FOUND', message: '比赛不存在或不属于当前赛事' }
  const tournament = await getDocument('tournaments', tournamentId)
  if (!tournament || !belongsToActor(tournament, actor) || (match.orgId && !belongsToActor(match, actor))) {
    return { success: false, code: 'ORG_FORBIDDEN', message: '无权更正其他机构的比赛赛果' }
  }
  if (resultStatus(match) !== 'approved') return { success: false, code: 'MATCH_NOT_ARCHIVED', message: '只有已归档的正式赛果可以发起异常纠错' }

  const beforeHome = scoreValue(match.homeScore)
  const beforeAway = scoreValue(match.awayScore)
  if (beforeHome === homeScore && beforeAway === awayScore) return { success: false, code: 'SCORE_UNCHANGED', message: '更正后的比分与当前归档比分相同' }

  const actorName = text(actor.user.nickname || actor.user.userName || actor.user.phone || actor.user._id) || '赛事主办方'
  const correctionId = `COR-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
  const correctedAt = new Date()
  const correction = {
    correctionId,
    previousVersionId: text(match.resultVersionId),
    reason,
    actorName,
    correctedByUserId: text(actor.user._id),
    correctedAt,
    before: { homeScore: beforeHome === null ? number(match.homeScore) : beforeHome, awayScore: beforeAway === null ? number(match.awayScore) : beforeAway },
    after: { homeScore, awayScore }
  }
  const history = Array.isArray(match.resultCorrectionHistory) ? match.resultCorrectionHistory.slice(-49) : []
  history.push(correction)
  const updateData = {
    homeScore,
    awayScore,
    scoreHome: homeScore,
    scoreAway: awayScore,
    resultVersionId: correctionId,
    resultCorrection: correction,
    resultCorrectionHistory: history,
    resultCorrectedAt: db.serverDate(),
    resultCorrectedBy: text(actor.user._id),
    resultCorrectionReason: reason,
    updateTime: db.serverDate()
  }
  const phase = phaseOf(match)
  const currentResolution = text(match.resolution || match.decisionMethod).toLowerCase()
  if (!['penalties', 'penalty_shootout', 'shootout'].includes(currentResolution)) {
    if (homeScore === awayScore) updateData.winnerTeamId = db.command.remove()
    else updateData.winnerTeamId = homeScore > awayScore ? teamIdOf(match, 'home') : teamIdOf(match, 'away')
  }
  const auditData = {
    sport: 'football',
    action: 'archived_match_score_corrected',
    tournamentId,
    divisionId: divisionIdOf(match),
    matchId,
    actorUserId: text(actor.user._id),
    actorOrgId: text(actor.orgId),
    result: 'pending',
    detail: { correctionId, previousVersionId: correction.previousVersionId, reason, before: correction.before, after: correction.after, phase },
    createTime: db.serverDate(),
    updateTime: db.serverDate()
  }
  const audit = await db.collection('registration_audit_logs').add({ data: auditData })
  try {
    await db.collection('matches').doc(matchId).update({ data: updateData })
    await db.collection('registration_audit_logs').doc(audit._id).update({ data: { result: 'success', completedAt: db.serverDate(), updateTime: db.serverDate() } })
  } catch (error) {
    await db.collection('registration_audit_logs').doc(audit._id).update({ data: { result: 'failed', error: text(error && error.message) || '比赛更新失败', completedAt: db.serverDate(), updateTime: db.serverDate() } }).catch(() => {})
    throw error
  }
  return {
    success: true,
    correctionId,
    requiresStandingsRepublish: standingsEligible(match),
    message: standingsEligible(match) ? '比分已更正，积分榜需重新发布' : '比分已更正，已记录异常纠错'
  }
}

exports.main = async (event = {}) => {
  try {
    const actor = await authenticate(event)
    const action = text(event.action || 'dashboard')
    if (actor.staff) {
      const eventId = text(event.tournamentId)
      const right = key => staffPolicy.hasRight(db, actor.user._id, actor.orgId, eventId, key)
      const allowed = action === 'dashboard'
        ? await right('event.dashboard') || await right('event.results') || await right('event.news') || await right('news.edit') || await right('news.publish')
        : ['staffMatches', 'supplementResult'].includes(action)
          ? await right('event.results') || await right('result.supplement')
          : ['resolvePairingSources', 'publishStandings', 'correctArchivedScore'].includes(action) && await right('event.results')
      if (!allowed) throw new Error('当前子账号无权执行该赛果操作')
    }
    if (action === 'staffMatches') return await staffMatches(event, actor)
    if (action === 'supplementResult') return await supplementResult(event, actor)
    if (action === 'dashboard') return await buildDashboard(event, actor)
    if (action === 'resolvePairingSources') return await buildDashboard(event, actor)
    if (action === 'publishStandings') return await publishStandings(event, actor)
    if (action === 'correctArchivedScore') return await correctArchivedScore(event, actor)
    return { success: false, code: 'UNSUPPORTED_ACTION', message: '不支持的赛果中心操作' }
  } catch (error) {
    console.error('resultCenter failed:', error)
    return { success: false, code: 'RESULT_CENTER_FAILED', message: error.message || '赛果中心加载失败' }
  }
}

exports.__test = { resultStatus,winnerTeamIdOf,buildStandings,buildOfficialGroupRankMap,sourceForSide,resolveSourceTeam,resolvedWinnerAndLoser,scoreValue,applyMatchOrigin }
