// 云函数：更新比赛信息
const cloud = require('wx-server-sdk')
const crypto = require('crypto')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex')
}

function recordBelongsToActor(record, actor) {
  if (!record || !actor) return false
  const orgIds = ['orgId', 'organizationId', 'organization_id']
    .map(field => record[field] == null ? '' : String(record[field]).trim())
    .filter(Boolean)
  const uniqueOrgIds = [...new Set(orgIds)]
  return uniqueOrgIds.length === 1 && uniqueOrgIds[0] === String(actor.orgId)
}

function competitionPlanLocked(record) {
  if (!record) return false
  return record.competitionPlanLocked === true ||
    record.finalPlanLocked === true ||
    ['locked', 'match_management', 'in_progress', 'completed'].includes(String(record.competitionPlanStatus || '').toLowerCase())
}

function divisionMatches(record, divisionId) {
  if (!record) return false
  const recordDivisionId = record.divisionId || record.division || record.divisionKey || ''
  if (!recordDivisionId) return String(divisionId || 'default') === 'default'
  return String(recordDivisionId) === String(divisionId || 'default')
}

function nestedDivisionLocked(tournament, divisionId) {
  const divisions = tournament && Array.isArray(tournament.divisions) ? tournament.divisions : []
  return divisions.some(item => divisionMatches(item, divisionId) && competitionPlanLocked(item))
}

async function getCompetitionPlanState(match, tournament) {
  const divisionId = String(match && (match.divisionId || match.division || '') || 'default')
  if (nestedDivisionLocked(tournament, divisionId)) return { locked: true }
  if (competitionPlanLocked(tournament) && divisionId === 'default') return { locked: true }
  if (divisionId === 'default') return { locked: false }
  try {
    const result = await db.collection('divisions').doc(divisionId).get()
    const division = Array.isArray(result.data) ? result.data[0] : result.data
    return { locked: competitionPlanLocked(division) }
  } catch (error) {
    return { locked: false, readError: error }
  }
}

const POST_PLAN_REFEREE_FIELDS = new Set([
  'refereeCrew', 'refereeRecordKeeperId', 'operationRefereeId', 'refereeAssignmentStatus',
  'refereeId', 'refereId', 'refereeName', 'refereName', 'refereePhone', 'mainRefereeId'
])

const EXECUTION_SNAPSHOT_BLOCKED_FIELDS = new Set([
  'homeTeamId', 'awayTeamId', 'homeTeam', 'awayTeam', 'homeTeamName', 'awayTeamName',
  'venue', 'venueId', 'field', 'matchDate', 'matchTime', 'startTime', 'scheduledAt',
  'duration', 'matchFormat', 'divisionId', 'division', 'status', 'homeScore', 'awayScore',
  'scoreHome', 'scoreAway'
])

function buildExecutionSnapshot(match, tournament, actor) {
  return {
    matchId: String(match && match._id || ''),
    tournamentId: String(match && match.tournamentId || ''),
    divisionId: String(match && (match.divisionId || match.division || '') || 'default'),
    organizationId: String(actor && actor.orgId || match && (match.orgId || match.organizationId) || ''),
    planVersion: String(match && (match.competitionPlanVersion || match.planVersion) || tournament && (tournament.competitionPlanVersion || tournament.planVersion) || ''),
    homeTeamId: String(match && (match.homeTeamId || match.homeTeam && (match.homeTeam._id || match.homeTeam.id) || '') || ''),
    awayTeamId: String(match && (match.awayTeamId || match.awayTeam && (match.awayTeam._id || match.awayTeam.id) || '') || ''),
    homeTeamName: String(match && (match.homeTeamName || match.homeTeam && (match.homeTeam.name || match.homeTeam.teamName) || '') || ''),
    awayTeamName: String(match && (match.awayTeamName || match.awayTeam && (match.awayTeam.name || match.awayTeam.teamName) || '') || ''),
    venue: String(match && (match.venue || match.field || '') || ''),
    matchDate: String(match && (match.matchDate || '') || ''),
    matchTime: String(match && (match.matchTime || match.startTime || '') || ''),
    capturedAt: new Date()
  }
}

async function authenticateActor(event) {
  const token = String((event && event.__authToken) || '').trim()
  if (!token) throw new Error('登录会话已失效，请重新登录')
  const _ = db.command
  const sessionResult = await db.collection('auth_sessions').where({
    tokenHash: hashSessionToken(token),
    active: true,
    expiresAt: _.gt(new Date())
  }).limit(2).get()
  const sessions = sessionResult.data || []
  if (sessions.length !== 1) throw new Error('登录会话已失效，请重新登录')
  const userResult = await db.collection('users').doc(sessions[0].userId).get()
  const user = Array.isArray(userResult.data) ? userResult.data[0] : userResult.data
  if (!user) throw new Error('登录账号不存在')
  const orgId = String(user.orgId || user.organizationId || '').trim()
  if (!orgId) throw new Error('当前账号尚未关联机构，请先完成机构引导')
  if (event.__actorUserId && event.__actorUserId !== user._id) throw new Error('登录身份校验失败')
  if (event.__actorOrgId && String(event.__actorOrgId) !== orgId) throw new Error('机构归属校验失败')
  const organizationResult = await db.collection('organizations').doc(orgId).get()
  const organization = Array.isArray(organizationResult.data) ? organizationResult.data[0] : organizationResult.data
  if (!organization) throw new Error('当前机构不存在或已失效，请重新完成机构引导')
  return { user: { ...user, orgId }, orgId }
}

function refereeTemplate(format) {
  return /^(5|6)/.test(String(format || ''))
    ? [
        { key: 'mainReferee', label: '主裁判' },
        { key: 'secondReferee', label: '第二裁判' },
        { key: 'thirdReferee', label: '第三裁判' },
        { key: 'timekeeper', label: '计时员' }
      ]
    : [
        { key: 'mainReferee', label: '主裁判' },
        { key: 'assistant1', label: '第一助理裁判' },
        { key: 'assistant2', label: '第二助理裁判' },
        { key: 'fourthOfficial', label: '第四官员' }
      ]
}

async function normalizeRefereeCrew(refereeCrew, format, actor, operationRefereeId, recordKeeperId) {
  const template = refereeTemplate(format)
  const crew = {}
  const ids = []
  for (const role of template) {
    const raw = refereeCrew && refereeCrew[role.key]
    const refereeId = typeof raw === 'string' ? raw : (raw && (raw._id || raw.refereeId))
    if (!refereeId) throw new Error('请完整安排' + role.label)
    if (ids.includes(refereeId)) throw new Error('同一名裁判不能重复担任多个岗位')
    const result = await db.collection('referees').doc(refereeId).get()
    const referee = Array.isArray(result.data) ? result.data[0] : result.data
    if (!referee || referee.status !== 'approved' || !recordBelongsToActor(referee, actor)) {
      throw new Error(role.label + '必须从本机构已通过的裁判中选择')
    }
    ids.push(refereeId)
    crew[role.key] = { _id: refereeId, name: referee.name || '', phone: referee.phone || referee.phoneNumber || '' }
  }
  const defaultKeeper = crew.timekeeper?._id || crew.fourthOfficial?._id || ''
  const keeperId = recordKeeperId || defaultKeeper
  const operatorId = operationRefereeId || keeperId
  if (!ids.includes(keeperId)) throw new Error('裁判记录员必须从本场4名裁判中选择')
  if (!ids.includes(operatorId)) throw new Error('操作负责人必须从本场4名裁判中选择')
  return { crew, template, keeperId, operatorId }
}

exports.main = async (event, context) => {
  const { matchId, data } = event

  if (!matchId || !data || typeof data !== 'object') {
    return { success: false, message: '缺少 matchId 或更新内容' }
  }

  try {
    const actor = await authenticateActor(event)
    const matchResult = await db.collection('matches').doc(matchId).get()
    const match = Array.isArray(matchResult.data) ? matchResult.data[0] : matchResult.data
    if (!match) return { success: false, message: '比赛不存在' }

    let tournament = null
    if (match.tournamentId) {
      const tournamentResult = await db.collection('tournaments').doc(match.tournamentId).get()
      tournament = Array.isArray(tournamentResult.data) ? tournamentResult.data[0] : tournamentResult.data
    }
    if (!recordBelongsToActor(match, actor) && !recordBelongsToActor(tournament, actor)) {
      return { success: false, message: '无权修改其他账号的比赛' }
    }

    const planState = await getCompetitionPlanState(match, tournament)
    if (planState.readError) {
      return { success: false, message: '无法确认当前竞赛方案状态，请稍后重试', code: 'COMPETITION_PLAN_STATE_UNAVAILABLE' }
    }

    const safeData = { ...data }
    ;['orgId', 'creatorId', 'organizerId', 'ownerId', 'userId', 'createdBy'].forEach(field => { delete safeData[field] })
    delete safeData.tournamentId
    delete safeData.updateTime
    delete safeData.executionSnapshot
    delete safeData.executionSnapshotAt
    if (match.executionSnapshot && Object.keys(safeData).some(field => EXECUTION_SNAPSHOT_BLOCKED_FIELDS.has(field))) {
      return { success: false, message: '比赛执行快照已经固化，不能直接修改对阵、场地、时间或比分', code: 'MATCH_EXECUTION_SNAPSHOT_LOCKED' }
    }
    if (planState.locked) {
      const blockedFields = Object.keys(safeData).filter(field => !POST_PLAN_REFEREE_FIELDS.has(field))
      if (blockedFields.length > 0 || !Object.keys(safeData).length) {
        return { success: false, message: '竞赛方案已经锁定，当前只允许调整受控裁判指派', code: 'COMPETITION_PLAN_LOCKED' }
      }
    }
    // 电子记录进入复核后，所有比赛现场字段均为不可变快照。归档/退回应
    // 仅可经 webLoginApi 的 reviewRefereeRecord 执行，不能绕过该入口直接 updateMatch。
    if (match.refereeRecordLocked) {
      return { success: false, message: '裁判报告已提交，比赛记录已锁定' }
    }

    let assignment = null
    if (safeData.refereeCrew) {
      assignment = await normalizeRefereeCrew(
        safeData.refereeCrew,
        safeData.matchFormat || match.matchFormat || (tournament && tournament.matchFormat) || '11side',
        actor,
        safeData.operationRefereeId,
        safeData.refereeRecordKeeperId
      )
      safeData.refereeCrew = assignment.crew
      safeData.refereeRecordKeeperId = assignment.keeperId
      safeData.operationRefereeId = assignment.operatorId
      safeData.refereeAssignmentStatus = 'assigned'
    }

    if (!match.executionSnapshot && planState.locked) {
      safeData.executionSnapshot = buildExecutionSnapshot(match, tournament, actor)
      safeData.executionSnapshotAt = db.serverDate()
    }

    // 更新 matches 集合
    await db.collection('matches').doc(matchId).update({
      data: {
        ...safeData,
        orgId: actor.orgId,
        updateTime: db.serverDate()
      }
    })

    let notificationRelay = null

    // 如果更新了裁判组，同步到 match_referees 集合
    if (safeData.refereeCrew) {
      await syncMatchReferees(matchId, safeData.refereeCrew, match.tournamentId, actor.orgId, assignment)
      const notification = await queueOperatorNotification(
        matchId,
        { ...match, ...safeData, _id: matchId },
        tournament,
        assignment,
        actor.orgId
      )
      if (notification && event.__notificationRelay === true) {
        notificationRelay = notification
      }
    }

    // 如果更新了比分且状态为 finished，同时更新联赛/小组积分榜
    if (safeData.status === 'finished' && safeData.homeScore != null && safeData.awayScore != null) {
      try {
        await updateStandings(matchId, safeData, actor.orgId)
      } catch (e) {
        console.warn('更新积分榜失败（非关键）', e)
      }
    }

    return {
      success: true,
      message: '更新成功',
      ...(notificationRelay ? { __notificationRelay: notificationRelay } : {})
    }
  } catch (err) {
    console.error('更新比赛失败:', err)
    return { success: false, message: '更新失败: ' + err.message }
  }
}

function firstValue() {
  for (let i = 0; i < arguments.length; i += 1) {
    const value = arguments[i]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return ''
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '').slice(-11)
}

function matchTeamName(match, side) {
  const direct = side === 'home' ? match.homeTeamName : match.awayTeamName
  const fallback = side === 'home' ? match.homeTeam : match.awayTeam
  if (direct) return direct
  if (fallback && typeof fallback === 'object') return fallback.name || fallback.teamName || ''
  return typeof fallback === 'string' ? fallback : ''
}

function matchTimeText(match) {
  const date = firstValue(match.matchDate, match.date, '')
  const time = firstValue(match.matchTime, match.startTime, '')
  if (typeof time === 'string') return date && time.indexOf(date) !== 0 ? (date + ' ' + time).trim() : time
  if (time) return new Date(time).toISOString().slice(0, 16).replace('T', ' ')
  return date || '时间待定'
}

async function queueOperatorNotification(matchId, match, tournament, assignment, orgId) {
  const refereeId = assignment && assignment.operatorId
  if (!refereeId) return ''
  const refereeResult = await db.collection('referees').doc(refereeId).get()
  const referee = Array.isArray(refereeResult.data) ? refereeResult.data[0] : refereeResult.data
  if (!referee) return ''
  const phone = normalizePhone(referee.phone || referee.phoneNumber)
  if (!phone) return ''
  const role = assignment.template.find(item => item.key && assignment.crew[item.key] && assignment.crew[item.key]._id === refereeId)
  const notificationResult = await db.collection('referee_notifications').where({
    matchId,
    type: 'match_assignment'
  }).limit(20).get()
  for (const item of notificationResult.data || []) {
    if (item.refereeId !== refereeId && item.status !== 'cancelled') {
      await db.collection('referee_notifications').doc(item._id).update({
        data: { status: 'cancelled', cancelledAt: db.serverDate(), updateTime: db.serverDate() }
      })
    }
  }
  const same = (notificationResult.data || []).find(item => item.refereeId === refereeId && item.status !== 'cancelled')
  const data = {
    type: 'match_assignment',
    status: 'pending',
    orgId,
    matchId,
    tournamentId: match.tournamentId || '',
    refereeId,
    phone,
    refereeName: referee.name || '',
    roleLabel: role ? role.label : '本场操作负责人',
    tournamentName: firstValue(match.tournamentName, tournament && tournament.name, '足球赛事'),
    teamsText: (matchTeamName(match, 'home') || '主队') + ' vs ' + (matchTeamName(match, 'away') || '客队'),
    matchTimeText: matchTimeText(match),
    venue: firstValue(match.venue, match.field, match.location, '场地待定'),
    updateTime: db.serverDate()
  }
  if (same) {
    if (same.status === 'sent') return null
    await db.collection('referee_notifications').doc(same._id).update({ data })
    return { notificationId: same._id, phone }
  }
  const added = await db.collection('referee_notifications').add({
    data: { ...data, createTime: db.serverDate() }
  })
  return { notificationId: added._id, phone }
}

// 同步 match_referees 集合
async function syncMatchReferees(matchId, refereeCrew, tournamentId, orgId, assignment) {
  try {
    // 1. 删除旧的裁判记录
    const oldRecords = await db.collection('match_referees').where({ matchId }).get()
    for (const doc of oldRecords.data) {
      await db.collection('match_referees').doc(doc._id).remove()
    }

    // 2. 插入新的裁判记录（只插入有姓名的）
    for (const roleInfo of assignment.template) {
      const role = roleInfo.key
      const ref = refereeCrew[role]
      if (!ref) continue

      let refId = ''

      // 支持两种格式：字符串 _id，或对象 { _id, name }
      if (typeof ref === 'string') {
        refId = ref
      } else if (typeof ref === 'object') {
        refId = ref._id || ''
        // 只有姓名没有 _id 时，按姓名查询 referees 集合
        if (!refId && ref.name) {
          const refRes = await db.collection('referees').where({ name: ref.name }).limit(1).get()
          if (refRes.data.length > 0) {
            refId = refRes.data[0]._id
          }
        }
      }

      if (refId) {
        await db.collection('match_referees').add({
          data: {
            matchId,
            tournamentId: tournamentId || '',
            orgId,
            refereeId: refId,
            role,
            roleLabel: roleInfo.label,
            canOperate: refId === assignment.operatorId,
            isRecordKeeper: refId === assignment.keeperId,
            assignedAt: db.serverDate(),
            notified: false
          }
        })
      }
    }

    console.log('[syncMatchReferees] 同步完成')
  } catch (err) {
    console.error('[syncMatchReferees] 同步失败:', err)
    throw err
  }
}

// 更新积分榜（联赛制/小组赛）
async function updateStandings(matchId, data, orgId) {
  // 查找这场比赛属于哪个赛事
  const matchRes = await db.collection('matches').doc(matchId).get()
  const match = Array.isArray(matchRes.data) ? matchRes.data[0] : matchRes.data
  if (!match) return

  const tournamentId = match.tournamentId
  const phase = match.phase  // 'group' | 'league' | 'knockout'
  // 只处理小组赛和联赛
  if (phase !== 'group' && phase !== 'league') return

  const homeId = match.homeTeamId
  const awayId = match.awayTeamId
  const homeScore = data.homeScore
  const awayScore = data.awayScore

  // 计算积分
  let homePoints = 0, awayPoints = 0
  if (homeScore > awayScore) homePoints = 3
  else if (homeScore < awayScore) awayPoints = 3
  else { homePoints = 1; awayPoints = 1 }

  const homeGF = homeScore, homeGA = awayScore
  const awayGF = awayScore, awayGA = homeScore

  // 查找 standings 记录
  const standingRes = await db.collection('standings').where({ tournamentId }).get()
  let standingId = null
  let standingsData = { groups: [] }

  if (standingRes.data.length > 0) {
    standingId = standingRes.data[0]._id
    standingsData = standingRes.data[0]
  }
  standingsData.orgId = orgId

  // 更新对应球队的积分
  function updateTeamInStandings(teamId, points, gf, ga) {
    const target = match.phase === 'group'
      ? standingRes.data[0]?.groups?.find(g => g.teams?.some(t => t.teamId === teamId))
      : null  // 联赛制直接存在顶层
    if (match.phase === 'group' && target) {
      // 更新小组赛积分
      const group = standingsData.groups.find(g => g.groupName === target.groupName)
      if (group) {
        const team = group.teams.find(t => t.teamId === teamId)
        if (team) {
          team.played = (team.played || 0) + 1
          team.wins = (team.wins || 0) + (points === 3 ? 1 : 0)
          team.draws = (team.draws || 0) + (points === 1 ? 1 : 0)
          team.losses = (team.losses || 0) + (points === 0 ? 1 : 0)
          team.points = (team.points || 0) + points
          team.gf = (team.gf || 0) + gf
          team.ga = (team.ga || 0) + ga
          team.gd = (team.gf || 0) - (team.ga || 0)
        }
      }
    } else {
      // 联赛制：直接更新顶层 teams 数组
      if (!standingsData.teams) standingsData.teams = []
      let team = standingsData.teams.find(t => t.teamId === teamId)
      if (!team) {
        standingsData.teams.push({
          teamId,
          teamName: match.homeTeamId === teamId ? match.homeTeamName : match.awayTeamName,
          played: 1, wins: points === 3 ? 1 : 0, draws: points === 1 ? 1 : 0,
          losses: points === 0 ? 1 : 0, points, gf, ga, gd: gf - ga
        })
      } else {
        team.played += 1
        team.wins += points === 3 ? 1 : 0
        team.draws += points === 1 ? 1 : 0
        team.losses += points === 0 ? 1 : 0
        team.points += points
        team.gf += gf
        team.ga += ga
        team.gd = team.gf - team.ga
      }
    }
  }

  updateTeamInStandings(homeId, homePoints, homeGF, homeGA)
  updateTeamInStandings(awayId, awayPoints, awayGF, awayGA)

  if (standingId) {
    await db.collection('standings').doc(standingId).update({ data: standingsData })
  } else {
    await db.collection('standings').add({
      data: {
        tournamentId,
        orgId,
        ...standingsData,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })
  }
}
