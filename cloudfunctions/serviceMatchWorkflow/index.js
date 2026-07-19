const crypto = require('crypto')
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const CLAIM_TTL_MS = 48 * 60 * 60 * 1000
const ACTIVE_CLAIM_STATUS = 'claimed'
const ROSTER_READY_STATUS = ['approved', 'confirmed']
const REFEREE_EVENT_TYPES = ['goal', 'yellow_card', 'red_card', 'substitution', 'penalty', 'own_goal']

function ok(data, message) {
  return { success: true, message: message || '操作成功', data: data || {} }
}

function fail(message, code) {
  return { success: false, message: message || '操作失败', code: code || 'WORKFLOW_ERROR' }
}

function firstNonEmpty() {
  for (let i = 0; i < arguments.length; i += 1) {
    const value = arguments[i]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return ''
}

function docData(result) {
  if (!result) return null
  if (Array.isArray(result.data)) return result.data[0] || null
  return result.data || null
}

function listData(result) {
  return result && Array.isArray(result.data) ? result.data : []
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-11)
}

function maskPhone(phone) {
  const value = normalizePhone(phone)
  if (value.length !== 11) return ''
  return value.slice(0, 3) + '****' + value.slice(7)
}

function valueToTime(value) {
  if (!value) return 0
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value > 1e12 ? value : value * 1000
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

function isExpired(token) {
  const expireAt = valueToTime(token && token.expireAt)
  return expireAt > 0 && expireAt < Date.now()
}

function matchTeamId(match, side) {
  const direct = side === 'home' ? match.homeTeamId : match.awayTeamId
  const fallback = side === 'home' ? match.homeTeam : match.awayTeam
  if (direct) return direct
  if (fallback && typeof fallback === 'object') return fallback._id || fallback.teamId || ''
  return ''
}

function matchTeamName(match, side) {
  const direct = side === 'home' ? match.homeTeamName : match.awayTeamName
  const fallback = side === 'home' ? match.homeTeam : match.awayTeam
  if (direct) return direct
  if (fallback && typeof fallback === 'object') return fallback.name || fallback.teamName || ''
  if (typeof fallback === 'string' && fallback !== matchTeamId(match, side)) return fallback
  return ''
}

function matchTimeText(match) {
  const dateText = firstNonEmpty(match.matchDate, match.date, '')
  const timeValue = firstNonEmpty(match.matchTime, match.startTime, '')
  if (typeof timeValue === 'string') {
    if (dateText && timeValue.indexOf(dateText) !== 0) return (dateText + ' ' + timeValue).trim()
    return timeValue
  }
  const time = valueToTime(timeValue)
  if (!time) return dateText || '时间待定'
  const date = new Date(time + 8 * 60 * 60 * 1000)
  return date.toISOString().slice(0, 16).replace('T', ' ')
}

function lineupField(side) {
  return side === 'home' ? 'homeLineup' : 'awayLineup'
}

function lineupStatusField(side) {
  return side === 'home' ? 'homeLineupStatus' : 'awayLineupStatus'
}

function lineupStatus(match, side) {
  const field = lineupStatusField(side)
  const lineup = match[lineupField(side)] || {}
  return firstNonEmpty(match[field], lineup.status, lineup.submitted ? 'submitted' : '', 'unclaimed')
}

function lineupStatusText(status) {
  const map = {
    unclaimed: '待认领',
    claimed: '已认领，待提交',
    pending: '待提交',
    returned: '已退回修改',
    submitted: '已提交，待核验',
    verified: '裁判已确认',
    locked: '名单已锁定'
  }
  return map[status] || '待处理'
}

function matchStatusText(status) {
  const map = {
    scheduled: '未开始',
    pending: '未开始',
    checked_in: '已签到',
    ongoing: '进行中',
    live: '进行中',
    finished: '已结束',
    completed: '已结束',
    postponed: '已延期',
    cancelled: '已取消'
  }
  return map[status] || '待处理'
}

function refereeActionText(status) {
  if (['scheduled', 'pending', 'checked_in'].indexOf(status) >= 0) return '开始执裁'
  if (['ongoing', 'live'].indexOf(status) >= 0) return '继续执裁'
  if (['finished', 'completed'].indexOf(status) >= 0) return '录入比赛事件'
  return '查看比赛'
}

function eventTypeText(type) {
  const map = {
    goal: '进球',
    yellow_card: '黄牌',
    red_card: '红牌',
    substitution: '换人',
    penalty: '点球',
    own_goal: '乌龙球',
    assist: '助攻'
  }
  return map[type] || '比赛事件'
}

function eventTypeIcon(type) {
  const map = {
    goal: '⚽',
    yellow_card: '🟨',
    red_card: '🟥',
    substitution: '🔄',
    penalty: '🥅',
    own_goal: '⚽',
    assist: '👟'
  }
  return map[type] || '•'
}

function refereeEventView(item, index, homeTeamName, awayTeamName) {
  const event = item || {}
  const teamSide = event.teamSide === 'away' ? 'away' : 'home'
  return {
    eventId: event.eventId || ('legacy-' + index),
    type: event.type || '',
    typeText: eventTypeText(event.type),
    typeIcon: eventTypeIcon(event.type),
    minute: Number(event.minute || 0),
    teamSide,
    teamName: teamSide === 'home' ? homeTeamName : awayTeamName,
    playerName: event.playerName || '',
    assistName: event.assistName || '',
    assistText: event.type === 'substitution'
      ? (event.assistName ? '换下：' + event.assistName : '')
      : (event.assistName ? '助攻：' + event.assistName : '')
  }
}

function workflowLogs(match, action, identity, detail) {
  const logs = Array.isArray(match.refereeWorkflowLogs) ? match.refereeWorkflowLogs.slice(-99) : []
  logs.push({
    action,
    detail: detail || {},
    actorOpenId: identity.openId,
    actorPhoneMasked: maskPhone(identity.phone),
    at: new Date()
  })
  return logs
}

function scoreNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const score = Number(value)
  if (!Number.isInteger(score) || score < 0 || score > 99) return null
  return score
}

async function getDoc(collection, id) {
  if (!id) return null
  try {
    return docData(await db.collection(collection).doc(id).get())
  } catch (error) {
    return null
  }
}

async function getIdentity(openId) {
  if (!openId) return null
  const result = await db.collection('service_identities').where({ openId }).limit(1).get()
  return listData(result)[0] || null
}

async function requireIdentity(openId) {
  const identity = await getIdentity(openId)
  if (!identity || !normalizePhone(identity.phone)) {
    const error = new Error('请先授权微信手机号')
    error.code = 'PHONE_REQUIRED'
    throw error
  }
  return identity
}

async function bindPhone(openId, phoneCode) {
  if (!openId) return fail('无法获取微信身份，请重新打开小程序', 'OPENID_REQUIRED')
  if (!phoneCode) return fail('请点击微信手机号授权按钮', 'PHONE_CODE_REQUIRED')

  let phoneResult
  try {
    const decodeResult = await cloud.callFunction({
      name: 'decodePhoneNumber',
      data: { code: phoneCode }
    })
    phoneResult = decodeResult && decodeResult.result
  } catch (error) {
    console.error('[serviceMatchWorkflow] phone decode failed:', error)
    return fail('手机号授权失败，请重试', 'PHONE_DECODE_FAILED')
  }

  if (!phoneResult || !phoneResult.success) {
    console.error('[serviceMatchWorkflow] phone decode rejected:', phoneResult)
    return fail((phoneResult && phoneResult.message) || '手机号授权失败，请重试', 'PHONE_DECODE_FAILED')
  }

  const phone = normalizePhone(phoneResult.phoneNumber || phoneResult.purePhoneNumber)
  if (!/^1[3-9]\d{9}$/.test(phone)) return fail('未获取到有效手机号', 'PHONE_INVALID')

  const samePhone = listData(await db.collection('service_identities').where({ phone }).limit(5).get())
  const occupied = samePhone.find(function(item) { return item.openId && item.openId !== openId })
  if (occupied) return fail('该手机号已绑定其他微信，请联系主办方处理', 'PHONE_OCCUPIED')

  const existing = await getIdentity(openId)
  if (existing) {
    await db.collection('service_identities').doc(existing._id).update({
      data: { phone, phoneVerified: true, updateTime: db.serverDate() }
    })
  } else {
    await db.collection('service_identities').add({
      data: {
        openId,
        phone,
        phoneVerified: true,
        source: 'service_miniprogram',
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })
  }

  return ok({ phoneMasked: maskPhone(phone) }, '手机号绑定成功')
}

async function queryByPhone(collection, phone) {
  if (!phone) return []
  try {
    const result = await db.collection(collection).where(_.or([
      { phone },
      { phoneNumber: phone },
      { mobile: phone },
      { contactPhone: phone }
    ])).limit(20).get()
    return listData(result)
  } catch (error) {
    console.warn('[serviceMatchWorkflow] phone query failed:', collection, error.message)
    return []
  }
}

async function getRefereeRecords(identity) {
  const phone = normalizePhone(identity.phone)
  const primary = await queryByPhone('referees', phone)
  const legacy = await queryByPhone('referee_library', phone)
  const map = {}
  primary.concat(legacy).forEach(function(item) {
    if (item && item._id) map[item._id] = item
  })
  return Object.keys(map).map(function(id) { return map[id] })
}

function refereeCrewContains(match, refereeIds, phone) {
  if (!match) return false
  if (refereeIds.indexOf(match.refereeId) >= 0) return true
  const directPhone = normalizePhone(firstNonEmpty(match.refereePhone, match.mainRefereePhone, ''))
  if (directPhone && directPhone === phone) return true

  const crew = match.refereeCrew || {}
  const roles = ['mainReferee', 'assistant1', 'assistant2', 'fourthOfficial', 'varReferee', 'matchObserver', 'refereeObserver']
  return roles.some(function(role) {
    const person = crew[role]
    if (!person) return false
    if (typeof person === 'string') return refereeIds.indexOf(person) >= 0
    const personId = person._id || person.refereeId || ''
    const personPhone = normalizePhone(firstNonEmpty(person.phone, person.phoneNumber, person.mobile, ''))
    return refereeIds.indexOf(personId) >= 0 || (personPhone && personPhone === phone)
  })
}

async function isAssignedReferee(identity, match) {
  if (!identity || !match) return false
  const refs = await getRefereeRecords(identity)
  const refereeIds = refs.map(function(item) { return item._id }).filter(Boolean)
  const phone = normalizePhone(identity.phone)
  if (refereeCrewContains(match, refereeIds, phone)) return true
  if (!match._id || refereeIds.length === 0) return false

  const result = await db.collection('match_referees').where({ matchId: match._id }).limit(20).get()
  return listData(result).some(function(item) {
    return refereeIds.indexOf(item.refereeId) >= 0
  })
}

async function getAssignedMatches(identity) {
  const refs = await getRefereeRecords(identity)
  const refereeIds = refs.map(function(item) { return item._id }).filter(Boolean)
  const matchIds = {}

  for (let i = 0; i < refereeIds.length; i += 1) {
    const result = await db.collection('match_referees').where({ refereeId: refereeIds[i] }).limit(50).get()
    listData(result).forEach(function(item) {
      if (item.matchId) matchIds[item.matchId] = true
    })
  }

  const phone = normalizePhone(identity.phone)
  try {
    const directMatches = await db.collection('matches').where(_.or([
      { refereePhone: phone },
      { mainRefereePhone: phone }
    ])).limit(50).get()
    listData(directMatches).forEach(function(item) {
      if (item._id) matchIds[item._id] = true
    })
  } catch (error) {
    console.warn('[serviceMatchWorkflow] direct referee match query failed:', error.message)
  }

  const matches = []
  const ids = Object.keys(matchIds).slice(0, 50)
  for (let i = 0; i < ids.length; i += 1) {
    const match = await getDoc('matches', ids[i])
    if (match) matches.push(match)
  }
  return matches
}

async function getTeamName(teamId, fallback) {
  if (fallback) return fallback
  const team = await getDoc('teams', teamId)
  return team ? firstNonEmpty(team.name, team.teamName, '球队') : '球队'
}

async function getTournamentName(tournamentId, fallback) {
  if (fallback) return fallback
  const tournament = await getDoc('tournaments', tournamentId)
  return tournament ? firstNonEmpty(tournament.name, tournament.tournamentName, '赛事') : '赛事'
}

async function decorateMatch(match) {
  const homeTeamId = matchTeamId(match, 'home')
  const awayTeamId = matchTeamId(match, 'away')
  const homeTeamName = await getTeamName(homeTeamId, matchTeamName(match, 'home'))
  const awayTeamName = await getTeamName(awayTeamId, matchTeamName(match, 'away'))
  const tournamentName = await getTournamentName(match.tournamentId, match.tournamentName)
  const status = match.status || 'scheduled'
  const events = (Array.isArray(match.events) ? match.events : []).map(function(item, index) {
    return refereeEventView(item, index, homeTeamName, awayTeamName)
  }).sort(function(a, b) {
    return a.minute - b.minute
  })
  return {
    matchId: match._id,
    tournamentId: match.tournamentId || '',
    tournamentName,
    homeTeamId,
    awayTeamId,
    homeTeamName,
    awayTeamName,
    teamsText: homeTeamName + ' vs ' + awayTeamName,
    matchTimeText: matchTimeText(match),
    venue: firstNonEmpty(match.venue, match.field, match.location, '场地待定'),
    matchStatus: status,
    matchStatusText: matchStatusText(status),
    refereeActionText: refereeActionText(status),
    canStart: ['scheduled', 'pending', 'checked_in'].indexOf(status) >= 0,
    canFinish: ['ongoing', 'live'].indexOf(status) >= 0,
    canRecordEvents: ['finished', 'completed'].indexOf(status) >= 0,
    homeScore: scoreNumber(match.homeScore) === null ? 0 : scoreNumber(match.homeScore),
    awayScore: scoreNumber(match.awayScore) === null ? 0 : scoreNumber(match.awayScore),
    events,
    hasEvents: events.length > 0,
    lineupRequestStatus: match.lineupRequestStatus || 'not_requested',
    homeLineupStatus: lineupStatus(match, 'home'),
    awayLineupStatus: lineupStatus(match, 'away'),
    lineupsLocked: !!match.lineupsLocked
  }
}

async function getIdentityClaims(identity) {
  const conditions = [{ openId: identity.openId }]
  if (identity.phone) conditions.push({ phone: normalizePhone(identity.phone) })
  const result = await db.collection('tournament_team_claims').where(_.or(conditions)).limit(50).get()
  return listData(result).filter(function(item) { return item.status === ACTIVE_CLAIM_STATUS })
}

async function getWorkbench(openId) {
  const identity = await getIdentity(openId)
  if (!identity || !identity.phone) {
    return ok({ needsPhone: true, refereeTasks: [] })
  }

  const refereeMatches = await getAssignedMatches(identity)
  const refereeTasks = []
  for (let i = 0; i < refereeMatches.length; i += 1) {
    refereeTasks.push(await decorateMatch(refereeMatches[i]))
  }

  refereeTasks.sort(function(a, b) { return String(a.matchTimeText).localeCompare(String(b.matchTimeText)) })

  return ok({
    needsPhone: false,
    phoneMasked: maskPhone(identity.phone),
    refereeTasks
  })
}

async function getActiveClaim(tournamentId, teamId) {
  const result = await db.collection('tournament_team_claims').where({
    tournamentId,
    teamId,
    status: ACTIVE_CLAIM_STATUS
  }).limit(5).get()
  return listData(result)[0] || null
}

function newTokenId() {
  return crypto.randomBytes(6).toString('hex')
}

async function createClaimToken(match, side, openId) {
  const teamId = matchTeamId(match, side)
  if (!teamId) throw new Error((side === 'home' ? '主队' : '客队') + '缺少球队ID')

  const existingResult = await db.collection('service_claim_tokens').where({
    matchId: match._id,
    side,
    status: 'active'
  }).limit(5).get()
  const existing = listData(existingResult).find(function(item) { return !isExpired(item) })
  if (existing) return existing

  const tokenId = newTokenId()
  const token = {
    tokenId,
    matchId: match._id,
    tournamentId: match.tournamentId || '',
    teamId,
    side,
    status: 'active',
    createdByOpenId: openId,
    expireAt: new Date(Date.now() + CLAIM_TTL_MS),
    createTime: db.serverDate(),
    updateTime: db.serverDate()
  }
  await db.collection('service_claim_tokens').doc(tokenId).set({ data: token })
  return Object.assign({ _id: tokenId }, token)
}

async function writeAudit(action, data, identity) {
  try {
    await db.collection('match_lineup_audit_logs').add({
      data: Object.assign({}, data || {}, {
        action,
        operatorOpenId: identity ? identity.openId : '',
        operatorPhoneMasked: identity ? maskPhone(identity.phone) : '',
        createTime: db.serverDate()
      })
    })
  } catch (error) {
    console.warn('[serviceMatchWorkflow] audit log failed:', error.message)
  }
}

async function publishLineupRequest(openId, matchId) {
  const identity = await requireIdentity(openId)
  const match = await getDoc('matches', matchId)
  if (!match) return fail('比赛不存在', 'MATCH_NOT_FOUND')
  match._id = match._id || matchId
  if (!(await isAssignedReferee(identity, match))) return fail('您不是本场已指派裁判', 'REFEREE_FORBIDDEN')

  const sides = ['home', 'away']
  const response = {}
  const updateData = {
    lineupRequestStatus: 'requested',
    lineupRequestedAt: db.serverDate(),
    lineupRequestedByPhoneMasked: maskPhone(identity.phone),
    updateTime: db.serverDate()
  }

  for (let i = 0; i < sides.length; i += 1) {
    const side = sides[i]
    const teamId = matchTeamId(match, side)
    const claim = await getActiveClaim(match.tournamentId || '', teamId)
    const currentStatus = lineupStatus(match, side)
    let token = null
    if (!claim) token = await createClaimToken(match, side, openId)
    const nextStatus = ['submitted', 'verified', 'locked'].indexOf(currentStatus) >= 0
      ? currentStatus
      : (claim ? 'claimed' : 'unclaimed')
    updateData[lineupStatusField(side)] = nextStatus
    response[side] = {
      teamId,
      claimed: !!claim,
      claimCode: token ? token._id : '',
      lineupStatus: nextStatus
    }
  }

  await db.collection('matches').doc(matchId).update({ data: updateData })
  await writeAudit('publish_lineup_request', { matchId, tournamentId: match.tournamentId || '' }, identity)
  return ok(response, '已通知双方提交首发')
}

async function getClaimToken(tokenId) {
  if (!tokenId) return null
  return getDoc('service_claim_tokens', tokenId)
}

async function getClaimPreview(tokenId) {
  const token = await getClaimToken(tokenId)
  if (!token) return fail('认领码不存在', 'TOKEN_NOT_FOUND')
  if (isExpired(token) && token.status === 'active') return fail('认领码已过期，请让裁判重新发布', 'TOKEN_EXPIRED')

  const match = await getDoc('matches', token.matchId)
  if (!match) return fail('对应比赛不存在', 'MATCH_NOT_FOUND')
  match._id = match._id || token.matchId
  const display = await decorateMatch(match)
  const side = token.side === 'away' ? 'away' : 'home'
  const claim = await getActiveClaim(token.tournamentId, token.teamId)
  return ok({
    tokenId,
    matchId: token.matchId,
    tournamentId: token.tournamentId,
    tournamentName: display.tournamentName,
    teamId: token.teamId,
    teamName: side === 'home' ? display.homeTeamName : display.awayTeamName,
    opponentName: side === 'home' ? display.awayTeamName : display.homeTeamName,
    matchTimeText: display.matchTimeText,
    venue: display.venue,
    tokenStatus: token.status,
    alreadyClaimed: !!claim
  })
}

async function claimTeam(openId, tokenId) {
  const identity = await requireIdentity(openId)
  const token = await getClaimToken(tokenId)
  if (!token) return fail('认领码不存在', 'TOKEN_NOT_FOUND')
  if (isExpired(token) && token.status === 'active') return fail('认领码已过期，请让裁判重新发布', 'TOKEN_EXPIRED')

  const existing = await getActiveClaim(token.tournamentId, token.teamId)
  if (existing) {
    const samePerson = existing.openId === openId || normalizePhone(existing.phone) === normalizePhone(identity.phone)
    if (!samePerson) return fail('该球队已被其他负责人认领，请联系裁判重置', 'TEAM_ALREADY_CLAIMED')
    return ok({ matchId: token.matchId, teamId: token.teamId }, '您已认领该球队')
  }
  if (token.status !== 'active') return fail('认领码已经使用，请联系裁判重置', 'TOKEN_USED')

  await db.collection('tournament_team_claims').add({
    data: {
      tournamentId: token.tournamentId,
      teamId: token.teamId,
      matchId: token.matchId,
      side: token.side,
      openId,
      phone: normalizePhone(identity.phone),
      role: 'team_representative',
      status: ACTIVE_CLAIM_STATUS,
      tokenId,
      claimedAt: db.serverDate(),
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }
  })
  await db.collection('service_claim_tokens').doc(tokenId).update({
    data: {
      status: 'used',
      usedByOpenId: openId,
      usedByPhoneMasked: maskPhone(identity.phone),
      usedAt: db.serverDate(),
      updateTime: db.serverDate()
    }
  })

  const match = await getDoc('matches', token.matchId)
  if (match) {
    const current = lineupStatus(match, token.side)
    if (['submitted', 'verified', 'locked'].indexOf(current) < 0) {
      const updateData = { updateTime: db.serverDate() }
      updateData[lineupStatusField(token.side)] = 'claimed'
      await db.collection('matches').doc(token.matchId).update({ data: updateData })
    }
  }

  await writeAudit('claim_team', {
    matchId: token.matchId,
    tournamentId: token.tournamentId,
    teamId: token.teamId,
    side: token.side
  }, identity)
  return ok({ matchId: token.matchId, teamId: token.teamId }, '认领成功')
}

function rosterPlayerId(player) {
  return String(firstNonEmpty(player && player._id, player && player.id, player && player.playerId, ''))
}

function sanitizePlayer(player) {
  return {
    _id: rosterPlayerId(player),
    name: firstNonEmpty(player && player.name, player && player.playerName, '未命名球员'),
    jerseyNumber: String(firstNonEmpty(player && player.jerseyNumber, player && player.number, '')),
    position: firstNonEmpty(player && player.position, player && player.positionName, '')
  }
}

async function getApprovedRoster(tournamentId, teamId, match) {
  const result = await db.collection('rosters').where({ tournamentId, teamId }).limit(20).get()
  let rosters = listData(result).filter(function(item) {
    return ROSTER_READY_STATUS.indexOf(item.status) >= 0
  })
  if (rosters.length === 0) return null

  const wantsKnockout = match && (match.phase === 'knockout' || match.stage === 'knockout')
  const exactStage = rosters.find(function(item) {
    return wantsKnockout ? item.stage === 'knockout' : item.stage !== 'knockout'
  })
  return exactStage || rosters[0]
}

async function resolveStartingCount(match) {
  const direct = Number(firstNonEmpty(
    match.startingPlayersPerTeam,
    match.startingPlayerCount,
    match.playersPerTeam,
    match.teamSize,
    0
  ))
  if (direct >= 3 && direct <= 11) return direct

  let format = firstNonEmpty(match.matchFormat, match.gameFormat, '')
  if (!format && match.tournamentId) {
    const tournament = await getDoc('tournaments', match.tournamentId)
    if (tournament) {
      format = firstNonEmpty(tournament.matchFormat, '')
      const divisions = Array.isArray(tournament.divisions) ? tournament.divisions : []
      const division = divisions.find(function(item) {
        return item && match.divisionId && (item.id === match.divisionId || item._id === match.divisionId)
      })
      if (division && division.matchFormat) format = division.matchFormat
    }
  }
  const matched = String(format || '').match(/(\d+)/)
  const count = matched ? Number(matched[1]) : 11
  return count >= 3 && count <= 11 ? count : 11
}

async function requireTeamClaim(identity, tournamentId, teamId) {
  const claim = await getActiveClaim(tournamentId, teamId)
  const samePerson = claim && (claim.openId === identity.openId || normalizePhone(claim.phone) === normalizePhone(identity.phone))
  if (!samePerson) {
    const error = new Error('您尚未认领该球队名单')
    error.code = 'TEAM_CLAIM_REQUIRED'
    throw error
  }
  return claim
}

async function getLineupTask(openId, matchId, teamId) {
  const identity = await requireIdentity(openId)
  const match = await getDoc('matches', matchId)
  if (!match) return fail('比赛不存在', 'MATCH_NOT_FOUND')
  match._id = match._id || matchId
  if (match.lineupRequestStatus !== 'requested') return fail('裁判尚未发布首发上报', 'LINEUP_NOT_REQUESTED')

  const homeTeamId = matchTeamId(match, 'home')
  const awayTeamId = matchTeamId(match, 'away')
  const side = teamId === homeTeamId ? 'home' : (teamId === awayTeamId ? 'away' : '')
  if (!side) return fail('该球队不属于本场比赛', 'TEAM_NOT_IN_MATCH')
  await requireTeamClaim(identity, match.tournamentId || '', teamId)

  const roster = await getApprovedRoster(match.tournamentId || '', teamId, match)
  if (!roster) return fail('主办方尚未确认本队参赛名单', 'ROSTER_NOT_APPROVED')
  const startingCount = await resolveStartingCount(match)
  const display = await decorateMatch(match)
  const lineup = match[lineupField(side)] || {}
  const selectedPlayers = Array.isArray(lineup.starters) ? lineup.starters : (Array.isArray(lineup.players) ? lineup.players : [])
  const selectedIds = selectedPlayers.map(rosterPlayerId).filter(Boolean)
  const players = []
  const seen = {}
  ;(Array.isArray(roster.players) ? roster.players : []).forEach(function(item) {
    const player = sanitizePlayer(item)
    if (!player._id || seen[player._id]) return
    seen[player._id] = true
    players.push(player)
  })

  const status = lineupStatus(match, side)
  return ok({
    matchId,
    teamId,
    side,
    tournamentName: display.tournamentName,
    teamName: side === 'home' ? display.homeTeamName : display.awayTeamName,
    opponentName: side === 'home' ? display.awayTeamName : display.homeTeamName,
    matchTimeText: display.matchTimeText,
    venue: display.venue,
    startingCount,
    players,
    selectedIds,
    lineupStatus: status,
    lineupStatusText: lineupStatusText(status),
    readOnly: ['submitted', 'verified', 'locked'].indexOf(status) >= 0
  })
}

async function submitLineup(openId, event) {
  const identity = await requireIdentity(openId)
  const matchId = event.matchId || ''
  const teamId = event.teamId || ''
  const selectedPlayerIds = Array.isArray(event.selectedPlayerIds) ? event.selectedPlayerIds.map(String) : []
  const uniqueIds = Array.from(new Set(selectedPlayerIds))
  const match = await getDoc('matches', matchId)
  if (!match) return fail('比赛不存在', 'MATCH_NOT_FOUND')
  match._id = match._id || matchId
  if (match.lineupRequestStatus !== 'requested') return fail('裁判尚未发布首发上报', 'LINEUP_NOT_REQUESTED')

  const homeTeamId = matchTeamId(match, 'home')
  const awayTeamId = matchTeamId(match, 'away')
  const side = teamId === homeTeamId ? 'home' : (teamId === awayTeamId ? 'away' : '')
  if (!side) return fail('该球队不属于本场比赛', 'TEAM_NOT_IN_MATCH')
  await requireTeamClaim(identity, match.tournamentId || '', teamId)

  const currentStatus = lineupStatus(match, side)
  if (['verified', 'locked'].indexOf(currentStatus) >= 0) return fail('名单已经裁判确认，不能再次提交', 'LINEUP_LOCKED')
  if (currentStatus === 'submitted') return fail('名单已经提交，请等待裁判核验', 'LINEUP_ALREADY_SUBMITTED')

  const roster = await getApprovedRoster(match.tournamentId || '', teamId, match)
  if (!roster) return fail('主办方尚未确认本队参赛名单', 'ROSTER_NOT_APPROVED')
  const startingCount = await resolveStartingCount(match)
  if (uniqueIds.length !== startingCount) {
    return fail('请准确选择' + startingCount + '名首发球员', 'STARTER_COUNT_INVALID')
  }

  const rosterMap = {}
  ;(Array.isArray(roster.players) ? roster.players : []).forEach(function(item) {
    const player = sanitizePlayer(item)
    if (player._id) rosterMap[player._id] = player
  })
  const invalid = uniqueIds.find(function(id) { return !rosterMap[id] })
  if (invalid) return fail('选中的球员不在主办方确认名单中', 'PLAYER_NOT_IN_ROSTER')
  const starters = uniqueIds.map(function(id) { return rosterMap[id] })

  const previousLineup = match[lineupField(side)] || {}
  const version = Number(previousLineup.version || 0) + 1
  const lineup = {
    teamId,
    starters,
    players: starters,
    substitutes: [],
    submitted: true,
    status: 'submitted',
    version,
    submittedAt: db.serverDate(),
    submittedByOpenId: openId,
    submittedByPhoneMasked: maskPhone(identity.phone)
  }
  const updateData = { updateTime: db.serverDate() }
  updateData[lineupField(side)] = lineup
  updateData[lineupStatusField(side)] = 'submitted'
  await db.collection('matches').doc(matchId).update({ data: updateData })
  await writeAudit('submit_lineup', {
    matchId,
    tournamentId: match.tournamentId || '',
    teamId,
    side,
    version,
    selectedPlayerIds: uniqueIds
  }, identity)
  return ok({ lineupStatus: 'submitted', version }, '首发名单提交成功')
}

async function getTokenForSide(matchId, side) {
  const result = await db.collection('service_claim_tokens').where({ matchId, side }).limit(20).get()
  const tokens = listData(result)
  return tokens.find(function(item) { return item.status === 'active' && !isExpired(item) }) || null
}

async function sideSummary(match, display, side) {
  const teamId = matchTeamId(match, side)
  const claim = await getActiveClaim(match.tournamentId || '', teamId)
  const status = lineupStatus(match, side)
  const token = claim ? null : await getTokenForSide(match._id, side)
  return {
    side,
    teamId,
    teamName: side === 'home' ? display.homeTeamName : display.awayTeamName,
    claimStatus: claim ? 'claimed' : 'unclaimed',
    claimStatusText: claim ? '已认领' : '待认领',
    claimPhoneMasked: claim ? maskPhone(claim.phone) : '',
    claimCode: token ? token._id : '',
    lineupStatus: status,
    lineupStatusText: lineupStatusText(status),
    canViewLineup: ['submitted', 'verified', 'locked', 'returned'].indexOf(status) >= 0,
    canReviewLineup: status === 'submitted',
    canResetClaim: !!claim && ['submitted', 'verified', 'locked'].indexOf(status) < 0
  }
}

async function getRefereeMatch(openId, matchId) {
  const identity = await requireIdentity(openId)
  const match = await getDoc('matches', matchId)
  if (!match) return fail('比赛不存在', 'MATCH_NOT_FOUND')
  match._id = match._id || matchId
  if (!(await isAssignedReferee(identity, match))) return fail('您不是本场已指派裁判', 'REFEREE_FORBIDDEN')
  const display = await decorateMatch(match)
  return ok({ match: display })
}

async function getAssignedRefereeMatch(openId, matchId) {
  const identity = await requireIdentity(openId)
  const match = await getDoc('matches', matchId)
  if (!match) {
    const error = new Error('比赛不存在')
    error.code = 'MATCH_NOT_FOUND'
    throw error
  }
  match._id = match._id || matchId
  if (!(await isAssignedReferee(identity, match))) {
    const error = new Error('您不是本场已指派裁判')
    error.code = 'REFEREE_FORBIDDEN'
    throw error
  }
  return { identity, match }
}

async function startRefereeMatch(openId, matchId) {
  const context = await getAssignedRefereeMatch(openId, matchId)
  const status = context.match.status || 'scheduled'
  if (['ongoing', 'live'].indexOf(status) >= 0) return ok({}, '比赛已经开始')
  if (['finished', 'completed'].indexOf(status) >= 0) return fail('比赛已经结束，不能再次开始', 'MATCH_ALREADY_FINISHED')
  if (['postponed', 'cancelled'].indexOf(status) >= 0) return fail('当前比赛状态不能开始执裁', 'MATCH_STATUS_INVALID')

  await db.collection('matches').doc(matchId).update({
    data: {
      status: 'ongoing',
      refereeStartedAt: db.serverDate(),
      refereeStartedByOpenId: context.identity.openId,
      refereeStartedByPhoneMasked: maskPhone(context.identity.phone),
      refereeWorkflowLogs: workflowLogs(context.match, 'start_match', context.identity),
      updateTime: db.serverDate()
    }
  })
  return ok({}, '已开始执裁')
}

async function finishRefereeMatch(openId, event) {
  const matchId = event.matchId || ''
  const context = await getAssignedRefereeMatch(openId, matchId)
  const status = context.match.status || 'scheduled'
  if (['finished', 'completed'].indexOf(status) >= 0) return fail('比赛已经结束', 'MATCH_ALREADY_FINISHED')
  if (['ongoing', 'live'].indexOf(status) < 0) return fail('请先点击开始执裁', 'MATCH_NOT_STARTED')

  const homeScore = scoreNumber(event.homeScore)
  const awayScore = scoreNumber(event.awayScore)
  if (homeScore === null || awayScore === null) return fail('请输入0至99之间的有效比分', 'SCORE_INVALID')

  const updateResult = await cloud.callFunction({
    name: 'updateMatch',
    data: {
      matchId,
      data: {
        status: 'finished',
        homeScore,
        awayScore,
        refereeFinishedAt: new Date(),
        refereeFinishedByOpenId: context.identity.openId,
        refereeFinishedByPhoneMasked: maskPhone(context.identity.phone),
        refereeWorkflowLogs: workflowLogs(context.match, 'finish_match', context.identity, { homeScore, awayScore })
      }
    }
  })
  const result = updateResult && updateResult.result
  if (!result || !result.success) return fail((result && result.message) || '比分保存失败', 'MATCH_FINISH_FAILED')
  return ok({ homeScore, awayScore }, '比赛已结束，请继续录入事件')
}

async function addRefereeEvent(openId, event) {
  const matchId = event.matchId || ''
  const context = await getAssignedRefereeMatch(openId, matchId)
  const status = context.match.status || 'scheduled'
  if (['finished', 'completed'].indexOf(status) < 0) return fail('请先结束比赛并录入比分', 'MATCH_NOT_FINISHED')

  const type = String(event.type || '')
  if (REFEREE_EVENT_TYPES.indexOf(type) < 0) return fail('请选择有效的事件类型', 'EVENT_TYPE_INVALID')
  const minute = Number(event.minute)
  if (!Number.isInteger(minute) || minute < 0 || minute > 130) return fail('比赛分钟须为0至130的整数', 'EVENT_MINUTE_INVALID')
  const playerName = String(event.playerName || '').trim().slice(0, 30)
  const assistName = String(event.assistName || '').trim().slice(0, 30)
  if (!playerName) return fail(type === 'substitution' ? '请输入换上球员姓名' : '请输入球员姓名', 'PLAYER_NAME_REQUIRED')
  const teamSide = event.teamSide === 'away' ? 'away' : 'home'
  const refereeEvent = {
    eventId: crypto.randomBytes(8).toString('hex'),
    type,
    minute,
    teamSide,
    playerName,
    assistName,
    source: 'referee_service',
    createdAt: new Date(),
    createdByPhoneMasked: maskPhone(context.identity.phone)
  }
  const events = Array.isArray(context.match.events) ? context.match.events.slice() : []
  events.push(refereeEvent)

  await db.collection('matches').doc(matchId).update({
    data: {
      events,
      refereeWorkflowLogs: workflowLogs(context.match, 'add_event', context.identity, {
        eventId: refereeEvent.eventId,
        type,
        minute,
        teamSide,
        playerName
      }),
      updateTime: db.serverDate()
    }
  })
  return ok({ eventId: refereeEvent.eventId }, '比赛事件已保存')
}

async function deleteRefereeEvent(openId, event) {
  const matchId = event.matchId || ''
  const eventId = String(event.eventId || '')
  const context = await getAssignedRefereeMatch(openId, matchId)
  const status = context.match.status || 'scheduled'
  if (['finished', 'completed'].indexOf(status) < 0) return fail('比赛尚未结束', 'MATCH_NOT_FINISHED')
  const events = Array.isArray(context.match.events) ? context.match.events.slice() : []
  let index = events.findIndex(function(item) { return item && item.eventId === eventId })
  if (index < 0 && eventId.indexOf('legacy-') === 0) index = Number(eventId.slice(7))
  if (!Number.isInteger(index) || index < 0 || index >= events.length) return fail('事件不存在或已被删除', 'EVENT_NOT_FOUND')
  const removed = events.splice(index, 1)[0] || {}

  await db.collection('matches').doc(matchId).update({
    data: {
      events,
      refereeWorkflowLogs: workflowLogs(context.match, 'delete_event', context.identity, {
        eventId,
        type: removed.type || '',
        minute: Number(removed.minute || 0),
        teamSide: removed.teamSide || '',
        playerName: removed.playerName || ''
      }),
      updateTime: db.serverDate()
    }
  })
  return ok({}, '事件已删除')
}

async function getRefereeLineup(openId, matchId, side) {
  const identity = await requireIdentity(openId)
  const match = await getDoc('matches', matchId)
  if (!match) return fail('比赛不存在', 'MATCH_NOT_FOUND')
  match._id = match._id || matchId
  if (!(await isAssignedReferee(identity, match))) return fail('您不是本场已指派裁判', 'REFEREE_FORBIDDEN')
  const safeSide = side === 'away' ? 'away' : 'home'
  const lineup = match[lineupField(safeSide)] || {}
  const players = (Array.isArray(lineup.starters) ? lineup.starters : (Array.isArray(lineup.players) ? lineup.players : [])).map(sanitizePlayer)
  return ok({
    side: safeSide,
    teamId: matchTeamId(match, safeSide),
    teamName: await getTeamName(matchTeamId(match, safeSide), matchTeamName(match, safeSide)),
    lineupStatus: lineupStatus(match, safeSide),
    lineupStatusText: lineupStatusText(lineupStatus(match, safeSide)),
    players
  })
}

async function reviewLineup(openId, event) {
  const identity = await requireIdentity(openId)
  const matchId = event.matchId || ''
  const side = event.side === 'away' ? 'away' : 'home'
  const decision = event.decision === 'returned' ? 'returned' : 'verified'
  const match = await getDoc('matches', matchId)
  if (!match) return fail('比赛不存在', 'MATCH_NOT_FOUND')
  match._id = match._id || matchId
  if (!(await isAssignedReferee(identity, match))) return fail('您不是本场已指派裁判', 'REFEREE_FORBIDDEN')

  const currentStatus = lineupStatus(match, side)
  if (currentStatus !== 'submitted') return fail('当前名单不是待核验状态', 'LINEUP_NOT_REVIEWABLE')
  const lineup = Object.assign({}, match[lineupField(side)] || {})
  const updateData = { updateTime: db.serverDate() }

  if (decision === 'returned') {
    lineup.status = 'returned'
    lineup.submitted = false
    lineup.returnedAt = db.serverDate()
    lineup.returnedByPhoneMasked = maskPhone(identity.phone)
    updateData[lineupField(side)] = lineup
    updateData[lineupStatusField(side)] = 'returned'
  } else {
    lineup.status = 'verified'
    lineup.verifiedAt = db.serverDate()
    lineup.verifiedByPhoneMasked = maskPhone(identity.phone)
    updateData[lineupField(side)] = lineup
    updateData[lineupStatusField(side)] = 'verified'

    const otherSide = side === 'home' ? 'away' : 'home'
    if (lineupStatus(match, otherSide) === 'verified') {
      const otherLineup = Object.assign({}, match[lineupField(otherSide)] || {})
      lineup.status = 'locked'
      otherLineup.status = 'locked'
      updateData[lineupField(side)] = lineup
      updateData[lineupField(otherSide)] = otherLineup
      updateData[lineupStatusField(side)] = 'locked'
      updateData[lineupStatusField(otherSide)] = 'locked'
      updateData.lineupsLocked = true
      updateData.lineupsLockedAt = db.serverDate()
    }
  }

  await db.collection('matches').doc(matchId).update({ data: updateData })
  await writeAudit(decision === 'returned' ? 'return_lineup' : 'verify_lineup', {
    matchId,
    tournamentId: match.tournamentId || '',
    teamId: matchTeamId(match, side),
    side
  }, identity)
  return ok({ decision, lineupsLocked: !!updateData.lineupsLocked }, decision === 'returned' ? '已退回球队修改' : '名单核验通过')
}

async function resetClaim(openId, matchId, side) {
  const identity = await requireIdentity(openId)
  const match = await getDoc('matches', matchId)
  if (!match) return fail('比赛不存在', 'MATCH_NOT_FOUND')
  match._id = match._id || matchId
  if (!(await isAssignedReferee(identity, match))) return fail('您不是本场已指派裁判', 'REFEREE_FORBIDDEN')
  const safeSide = side === 'away' ? 'away' : 'home'
  const currentStatus = lineupStatus(match, safeSide)
  if (['submitted', 'verified', 'locked'].indexOf(currentStatus) >= 0) {
    return fail('球队已提交首发，不能直接重置认领', 'CLAIM_RESET_FORBIDDEN')
  }

  const teamId = matchTeamId(match, safeSide)
  const claim = await getActiveClaim(match.tournamentId || '', teamId)
  if (claim) {
    await db.collection('tournament_team_claims').doc(claim._id).update({
      data: {
        status: 'revoked',
        revokedAt: db.serverDate(),
        revokedByPhoneMasked: maskPhone(identity.phone),
        updateTime: db.serverDate()
      }
    })
  }
  const token = await createClaimToken(match, safeSide, openId)
  const updateData = { updateTime: db.serverDate() }
  updateData[lineupStatusField(safeSide)] = 'unclaimed'
  await db.collection('matches').doc(matchId).update({ data: updateData })
  await writeAudit('reset_team_claim', {
    matchId,
    tournamentId: match.tournamentId || '',
    teamId,
    side: safeSide
  }, identity)
  return ok({ claimCode: token._id }, '认领已重置')
}

exports.main = async function(event) {
  event = event || {}
  const action = event.action || 'getWorkbench'
  const wxContext = cloud.getWXContext()
  const openId = wxContext.OPENID || ''

  try {
    if (action === 'bindPhone') return bindPhone(openId, event.phoneCode)
    if (action === 'getWorkbench') return getWorkbench(openId)
    if (action === 'publishLineupRequest') return publishLineupRequest(openId, event.matchId)
    if (action === 'getClaimPreview') return getClaimPreview(event.tokenId || event.code)
    if (action === 'claimTeam') return claimTeam(openId, event.tokenId || event.code)
    if (action === 'getLineupTask') return getLineupTask(openId, event.matchId, event.teamId)
    if (action === 'submitLineup') return submitLineup(openId, event)
    if (action === 'getRefereeMatch') return getRefereeMatch(openId, event.matchId)
    if (action === 'startRefereeMatch') return startRefereeMatch(openId, event.matchId)
    if (action === 'finishRefereeMatch') return finishRefereeMatch(openId, event)
    if (action === 'addRefereeEvent') return addRefereeEvent(openId, event)
    if (action === 'deleteRefereeEvent') return deleteRefereeEvent(openId, event)
    if (action === 'getRefereeLineup') return getRefereeLineup(openId, event.matchId, event.side)
    if (action === 'reviewLineup') return reviewLineup(openId, event)
    if (action === 'resetClaim') return resetClaim(openId, event.matchId, event.side)
    return fail('不支持的操作', 'ACTION_NOT_SUPPORTED')
  } catch (error) {
    console.error('[serviceMatchWorkflow] action failed:', action, error)
    return fail(error.message || '服务异常，请稍后重试', error.code || 'UNEXPECTED_ERROR')
  }
}
