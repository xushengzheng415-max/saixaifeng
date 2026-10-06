// 云函数：更新比赛信息
const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const staffPolicy = require('./staffPolicy.cjs')
const { writeRights } = require('./staffDbRights.cjs')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const EVENT_TYPE_ALIASES = {
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

function normalizeMatchEvents(events, match) {
  const seen = new Set()
  return (Array.isArray(events) ? events : []).map((event, index) => {
    if (!event || typeof event !== 'object') return null
    const rawType = String(event.type || event.eventType || '').trim().toLowerCase()
    const type = EVENT_TYPE_ALIASES[rawType] || rawType
    const teamSide = event.teamSide === 'away' || event.side === 'away' ? 'away' : 'home'
    const playerName = String(event.playerName || event.player || '').trim()
    const playerId = String(event.playerId || '').trim()
    const teamId = String(event.teamId || (teamSide === 'away' ? match.awayTeamId : match.homeTeamId) || '').trim()
    const minute = Number.isFinite(Number(event.minute)) ? Number(event.minute) : 0
    const identity = String(event.eventId || event._id || event.id || '') || [type, minute, playerId, playerName, teamSide, teamId, event.penaltyOutcome || ''].join('|')
    const eventId = String(event.eventId || event._id || event.id || '') || `legacy-${crypto.createHash('sha1').update(String(match._id || '') + '|' + identity + '|' + index).digest('hex').slice(0, 16)}`
    if (seen.has(identity)) return null
    seen.add(identity)
    return {
      ...event,
      eventId,
      type,
      minute,
      teamSide,
      teamId,
      playerId,
      playerName,
      assistPlayerId: String(event.assistPlayerId || event.assistId || '').trim(),
      assistName: String(event.assistName || event.assist || '').trim()
    }
  }).filter(Boolean)
}

let scheduleAdjustmentLogsReady = false

async function ensureScheduleAdjustmentLogs() {
  if (scheduleAdjustmentLogsReady) return
  try {
    await db.createCollection('schedule_adjustment_logs')
  } catch (error) {
    const message=String(error && (error.message || error.errMsg) || '').toLowerCase()
    if (!message.includes('exist') && !message.includes('duplicate') && !message.includes('已存在')) throw error
  }
  scheduleAdjustmentLogsReady = true
}

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

const ORGANIZER_FINISHABLE_STATUSES = new Set(['ongoing', 'live', 'in_progress', 'playing'])

function refereeHasTakenOverOrLocked(match) {
  const reportStatus = String(match && match.refereeReportStatus || '').toLowerCase()
  const reviewStatus = String(match && match.refereeReviewStatus || '').toLowerCase()
  return Boolean(match && (
    match.refereeRecordLocked === true ||
    match.executionState === 'recording' ||
    match.refereeReportSubmittedAt ||
    match.refereeRecord ||
    match.refereeReport ||
    ['draft', 'submitted', 'approved', 'archived'].includes(reportStatus) ||
    ['under_review', 'returned', 'archived'].includes(reviewStatus)
  ))
}

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
  const orgId = String(sessions[0].activeOrgId || event.__actorOrgId || user.orgId || user.organizationId || '').trim()
  if (!orgId) throw new Error('当前账号尚未关联机构，请先完成机构引导')
  if (event.__actorUserId && event.__actorUserId !== user._id) throw new Error('登录身份校验失败')
  if (event.__actorOrgId && String(event.__actorOrgId) !== orgId) throw new Error('机构归属校验失败')
  const organizationResult = await db.collection('organizations').doc(orgId).get()
  const organization = Array.isArray(organizationResult.data) ? organizationResult.data[0] : organizationResult.data
  if (!organization) throw new Error('当前机构不存在或已失效，请重新完成机构引导')
  return { user: { ...user, orgId }, orgId }
}

async function undoLastScheduleAdjustment(event) {
  const actor=await authenticateActor(event)
  await ensureScheduleAdjustmentLogs()
  const tournamentId=String(event.tournamentId || '')
  if(!tournamentId) return { success:false,message:'缺少赛事信息' }
  if (await staffPolicy.isStaff(db, actor.user._id, actor.orgId) && !await staffPolicy.owner(db, actor.user._id, actor.orgId) && !await staffPolicy.hasRight(db, actor.user._id, actor.orgId, tournamentId, 'event.matches')) return { success:false,message:'当前赛事没有比赛管理权限' }
  const tournamentResult=await db.collection('tournaments').doc(tournamentId).get()
  const tournament=Array.isArray(tournamentResult.data)?tournamentResult.data[0]:tournamentResult.data
  if(!recordBelongsToActor(tournament,actor)) return { success:false,message:'无权恢复其他机构的赛程' }
  const where={ tournamentId,status:'applied',undone:false }
  if(event.divisionId && event.divisionId!=='all') where.divisionId=String(event.divisionId)
  const latestResult=await db.collection('schedule_adjustment_logs').where(where).orderBy('createTime','desc').limit(1).get()
  const latest=(latestResult.data || [])[0]
  if(!latest) return { success:false,code:'NO_ADJUSTMENT_HISTORY',message:'当前没有可撤销的赛程调整记录' }
  const groupResult=await db.collection('schedule_adjustment_logs').where({ tournamentId,operationGroupId:latest.operationGroupId,status:'applied',undone:false }).limit(20).get()
  const logs=groupResult.data || []
  if(!logs.length) return { success:false,code:'NO_ADJUSTMENT_HISTORY',message:'未找到完整的调整记录' }
  for(const log of logs){const matchResult=await db.collection('matches').doc(log.matchId).get();const match=Array.isArray(matchResult.data)?matchResult.data[0]:matchResult.data;if(!match) return { success:false,message:'原比赛已不存在，不能直接撤销' };if(match.executionSnapshot || ['ongoing','finished'].includes(match.status)) return { success:false,message:'相关比赛已开始或固化，不能撤销调整' }}
  await Promise.all(logs.map(log=>db.collection('matches').doc(log.matchId).update({ data:{ matchDate:String(log.before && log.before.matchDate || ''),matchTime:String(log.before && log.before.matchTime || ''),venue:String(log.before && log.before.venue || ''),updateTime:db.serverDate() } })))
  await Promise.all(logs.map(log=>db.collection('schedule_adjustment_logs').doc(log._id).update({ data:{ undone:true,undoneAt:db.serverDate(),undoneBy:actor.user._id,updateTime:db.serverDate() } })))
  return { success:true,message:'已撤销上次赛程调整',operationGroupId:latest.operationGroupId,restoredMatches:logs.length }
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

async function normalizeRefereeCrew(refereeCrew, format, actor, tournamentId, operationRefereeId, recordKeeperId, options) {
  const config = options || {}
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
    const approvedTemporaryReferee = referee && referee.temporaryReferee === true && referee.status === 'approved' && referee.canOperate !== false && referee.eventScoped === true && referee.organizerTemporaryApproval === true && referee.temporaryClaimStatus === 'approved' && referee.wechatBound === true && recordBelongsToActor(referee, actor) && String(referee.tournamentId || '') === String(tournamentId || '')
    const approvedRealReferee = referee && referee.temporaryReferee !== true && referee.status === 'approved' && recordBelongsToActor(referee, actor)
    const scopedSyntheticReferee = config.allowSynthetic !== false && referee && referee.synthetic === true && String(referee.tournamentId || '') === String(tournamentId || '')
    if (!approvedRealReferee && !approvedTemporaryReferee && !scopedSyntheticReferee) {
      throw new Error(role.label + '必须从本机构已审核裁判或当前赛事虚拟裁判中选择')
    }
    ids.push(refereeId)
    crew[role.key] = { _id: refereeId, name: referee.name || '', phone: referee.phone || referee.phoneNumber || '', synthetic: referee.synthetic === true }
  }
  const defaultKeeper = crew.timekeeper?._id || crew.fourthOfficial?._id || ''
  const keeperId = recordKeeperId || defaultKeeper
  const operatorId = operationRefereeId || keeperId
  if (!ids.includes(keeperId)) throw new Error('裁判记录员必须从本场4名裁判中选择')
  if (!ids.includes(operatorId)) throw new Error('操作负责人必须从本场4名裁判中选择')
  return { crew, template, keeperId, operatorId }
}

async function authenticateHeadRefereeSession(event, match, tournament) {
  const token = String(event && event.__refereeSessionToken || '').trim()
  if (!token) throw new Error('服务号登录状态已失效，请重新进入裁判任务')
  const sessions = (await db.collection('referee_h5_sessions').where({ tokenHash:hashSessionToken(token),active:true,expiresAt:_.gt(new Date()) }).limit(2).get()).data || []
  if (sessions.length !== 1 || !sessions[0].workflowOpenId) throw new Error('服务号登录状态已失效，请重新进入裁判任务')
  const openId = String(sessions[0].workflowOpenId)
  const identities = (await db.collection('service_identities').where(_.or([{openId},{miniProgramOpenId:openId},{serviceWorkflowOpenId:openId}])).limit(2).get()).data || []
  if (identities.length !== 1) throw new Error('裁判手机号身份不存在或存在冲突')
  const phone = normalizePhone(identities[0].phone)
  if (!phone || identities[0].phoneVerified !== true) throw new Error('请先验证组委会登记的手机号')
  const referees = (await db.collection('referees').where(_.or([{phone},{phoneNumber:phone},{mobile:phone},{contactPhone:phone}])).limit(50).get()).data || []
  const approvedReferees = referees.filter(item => item && item.status === 'approved' && item.canOperate !== false)
  const refereeIds = approvedReferees.map(item => String(item._id || '')).filter(Boolean)
  if (!refereeIds.length) throw new Error('当前账号没有已审核裁判身份')
  const tournamentId = String(match && match.tournamentId || '')
  let relation = null
  let headReferee = null
  for (const refereeId of refereeIds) {
    const rows = (await db.collection('tournament_referees').where({ tournamentId,refereeId,isHeadReferee:true }).limit(2).get()).data || []
    if (rows.length) { relation = rows[0]; headReferee = approvedReferees.find(item => String(item._id || '') === refereeId) || null; break }
  }
  if (!relation) throw new Error('您不是该赛事的裁判长')
  const orgId = String(tournament && (tournament.orgId || tournament.organizationId) || relation.orgId || '').trim()
  if (!orgId || (relation.orgId && String(relation.orgId) !== orgId)) throw new Error('裁判长赛事权限校验失败')
  if (!headReferee || !recordBelongsToActor(headReferee, { orgId })) throw new Error('裁判长机构权限校验失败')
  if (headReferee.temporaryReferee === true && (headReferee.eventScoped !== true || headReferee.organizerTemporaryApproval !== true || headReferee.temporaryClaimStatus !== 'approved' || String(headReferee.tournamentId || '') !== tournamentId)) throw new Error('临时裁判长资格已失效')
  return { orgId,relation,identity:identities[0] }
}

async function assignByHeadReferee(event) {
  const matchId=String(event.matchId||'')
  if(!matchId||!event.data||!event.data.refereeCrew)return {success:false,code:'ASSIGNMENT_REQUIRED',message:'缺少比赛或裁判排班信息'}
  let matchResult=null
  try{matchResult=await db.collection('matches').doc(matchId).get()}catch(error){if(!/does not exist|DOCUMENT_NOT_FOUND|ResourceNotFound/i.test(String(error&&error.message||'')))throw error}
  const match=matchResult?(Array.isArray(matchResult.data)?matchResult.data[0]:matchResult.data):null
  if(!match)return {success:false,code:'MATCH_NOT_FOUND',message:'比赛不存在'}
  if(!['scheduled','pending','checked_in'].includes(String(match.status||'scheduled'))||match.refereeRecordLocked)return {success:false,code:'MATCH_ASSIGNMENT_LOCKED',message:'比赛已开始或记录已锁定，不能调整裁判'}
  const tournamentResult=await db.collection('tournaments').doc(String(match.tournamentId||'')).get()
  const tournament=Array.isArray(tournamentResult.data)?tournamentResult.data[0]:tournamentResult.data
  if(!tournament)return {success:false,code:'TOURNAMENT_NOT_FOUND',message:'赛事不存在'}
  const actor=await authenticateHeadRefereeSession(event,match,tournament)
  const assignment=await normalizeRefereeCrew(event.data.refereeCrew,match.matchFormat||(tournament&&tournament.matchFormat)||'11side',actor,match.tournamentId,event.data.operationRefereeId,event.data.refereeRecordKeeperId,{allowSynthetic:false})
  await ensureNoRefereeScheduleConflicts(matchId,match,assignment.crew)
  const planState=await getCompetitionPlanState(match,tournament)
  if(planState.readError)return {success:false,code:'COMPETITION_PLAN_STATE_UNAVAILABLE',message:'无法确认当前竞赛方案状态，请稍后重试'}
  const updateData={refereeCrew:assignment.crew,refereeRecordKeeperId:assignment.keeperId,operationRefereeId:assignment.operatorId,refereeAssignmentStatus:'assigned',orgId:actor.orgId,updatedByHeadReferee:true,updateTime:db.serverDate()}
  if(!match.executionSnapshot&&planState.locked){updateData.executionSnapshot=buildExecutionSnapshot(match,tournament,actor);updateData.executionSnapshotAt=db.serverDate()}
  await db.collection('matches').doc(matchId).update({data:updateData})
  await syncMatchReferees(matchId,assignment.crew,match.tournamentId,actor.orgId,assignment)
  await db.collection('registration_audit_logs').add({data:{sport:'football',action:'head_referee_assignment_saved',tournamentId:String(match.tournamentId||''),actorOrgId:actor.orgId,result:'success',detail:{matchId,headRefereeRelationId:String(actor.relation._id||''),refereeIds:Object.values(assignment.crew).map(item=>String(item._id||''))},createTime:db.serverDate()}})
  const notification=await queueOperatorNotification(matchId,{...match,...updateData,_id:matchId},tournament,assignment,actor.orgId)
  return {success:true,message:'裁判排班已保存',__notificationRelay:notification||null}
}

async function ensureNoRefereeScheduleConflicts(matchId, match, refereeCrew) {
  const tournamentId = String(match.tournamentId || '')
  const matchDate = String(match.matchDate || '').slice(0, 10)
  const matchTime = String(match.matchTime || '')
  if (!tournamentId || !matchDate || !matchTime) return
  const refereeIds = new Set(Object.values(refereeCrew || {}).map(person => String(person && (person._id || person.refereeId) || '')).filter(Boolean))
  if (!refereeIds.size) return
  const result = await db.collection('matches').where({ tournamentId }).limit(1000).get()
  const conflicts = (result.data || []).filter(item => {
    if (String(item._id || '') === String(matchId || '')) return false
    if (['cancelled', 'canceled', 'postponed'].includes(String(item.status || '').toLowerCase())) return false
    if (String(item.matchDate || '').slice(0, 10) !== matchDate || String(item.matchTime || '') !== matchTime) return false
    return Object.values(item.refereeCrew || {}).some(person => {
      const refereeId = typeof person === 'string' ? person : person && (person._id || person.refereeId)
      return refereeId && refereeIds.has(String(refereeId))
    })
  })
  if (!conflicts.length) return
  const names = new Set()
  conflicts.forEach(item => Object.values(item.refereeCrew || {}).forEach(person => {
    const refereeId = typeof person === 'string' ? person : person && (person._id || person.refereeId)
    if (refereeId && refereeIds.has(String(refereeId))) names.add(typeof person === 'object' && person.name ? person.name : '所选裁判')
  }))
  throw new Error(`${Array.from(names).join('、')}在${matchDate} ${matchTime}已有执法场次，请调整后再指派`)
}

exports.main = async (event, context) => {
  const { matchId, data } = event

  if(event.action==='undoLastScheduleAdjustment') {
    try{return await undoLastScheduleAdjustment(event)}catch(err){console.error('撤销赛程调整失败:',err);return { success:false,message:'撤销失败: '+err.message }}
  }

  if(event.action==='assignByHeadReferee') {
    try{return await assignByHeadReferee(event)}catch(err){console.error('裁判长排班失败:',err);return {success:false,message:err.message||'裁判排班失败',code:err.code||'HEAD_REFEREE_ASSIGNMENT_FAILED'}}
  }

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
    if (await staffPolicy.isStaff(db, actor.user._id, actor.orgId) && !await staffPolicy.owner(db, actor.user._id, actor.orgId)) {
      const required = event.action === 'finishOrganizerMatch' ? ['event.results'] : event.action === 'forfeitMatch' ? ['event.matches'] : writeRights('matches', 'update', data)
      if (!required.length || !(await Promise.all(required.map(right => staffPolicy.hasRight(db, actor.user._id, actor.orgId, match.tournamentId, right)))).every(Boolean)) return { success:false,message:'当前赛事没有对应比赛操作权限' }
    }

    const planState = await getCompetitionPlanState(match, tournament)
    if (planState.readError) {
      return { success: false, message: '无法确认当前竞赛方案状态，请稍后重试', code: 'COMPETITION_PLAN_STATE_UNAVAILABLE' }
    }

    const safeData = { ...data }
    ;['orgId', 'creatorId', 'organizerId', 'ownerId', 'userId', 'createdBy'].forEach(field => { delete safeData[field] })
    delete safeData.tournamentId
    delete safeData.updateTime
    delete safeData.forfeitTeamId
    delete safeData.executionSnapshot
    delete safeData.executionSnapshotAt
    // A browser cannot overwrite the server's frozen duration provenance.
    delete safeData.durationRulesSnapshot
    delete safeData.rulesSnapshot
    for (const field of Object.keys(safeData)) if (/^(durationRulesSnapshot|rulesSnapshot)\./.test(field)) delete safeData[field]
    let eventValidation = null
    delete safeData.matchEventRevision
    if (Array.isArray(safeData.events)) {
      if (event.expectedEventRevision != null && Number(event.expectedEventRevision) !== Number(match.matchEventRevision || 0)) {
        return { success:false, code:'MATCH_EVENTS_CHANGED', message:'比赛事件已更新，请刷新后重新录入' }
      }
      let division = null
      if (match.divisionId && match.divisionId !== 'default') {
        const record = await db.collection('divisions').doc(String(match.divisionId)).get()
        division = Array.isArray(record.data) ? record.data[0] : record.data
      }
      division = division || (tournament?.divisions || []).find(row=>String(row._id || row.id || '')===String(match.divisionId || '')) || {}
      const { substitutionRules, assertSubstitutionChange, normalizeSubstitutionRecords } = await import('./data-center/substitution.mjs')
      eventValidation = assertSubstitutionChange(match,substitutionRules(match,division,tournament || {}),safeData.events)
      safeData.events = normalizeMatchEvents(normalizeSubstitutionRecords(match,safeData.events), match)
      safeData.matchEventRevision = Number(match.matchEventRevision || 0) + 1
      const { calculateMatchEventScore } = await import('./data-center/statistics.mjs')
      const eventScore = calculateMatchEventScore({ ...match, events:safeData.events })
      safeData.homeScore = eventScore.home
      safeData.awayScore = eventScore.away
      safeData.scoreHome = eventScore.home
      safeData.scoreAway = eventScore.away
    }
    const finishing = event.action === 'finishOrganizerMatch'
    const forfeiting = event.action === 'forfeitMatch'
    const currentStatus = String(match.status || '').toLowerCase()
    if (forfeiting) {
      if (Object.keys(data).some(key => key !== 'forfeitTeamId')) return { success:false, code:'FORFEIT_FIELDS_INVALID', message:'弃赛操作只能提交弃赛方' }
      if (!['scheduled','ongoing'].includes(currentStatus)) return { success:false, code:'MATCH_NOT_FORFEITABLE', message:'只有未开始或进行中的比赛可以登记弃赛' }
      if (refereeHasTakenOverOrLocked(match)) return { success:false, code:'MATCH_RECORD_LOCKED', message:'裁判已接管或裁判报告已提交/锁定，不能登记弃赛' }
      if (event.expectedEventRevision == null || Number(event.expectedEventRevision) !== Number(match.matchEventRevision || 0)) return { success:false, code:'MATCH_EVENTS_CHANGED', message:'比赛事件已更新，请刷新后再登记弃赛' }
      if (Array.isArray(match.events) && match.events.length) return { success:false, code:'MATCH_HAS_EVENTS', message:'本场已有比赛事件，不能直接登记弃赛' }
      try {
        const externalEvents = (await db.collection('match_events').where({ matchId }).limit(1).get()).data || []
        if (externalEvents.length) return { success:false, code:'MATCH_HAS_EVENTS', message:'本场已有比赛事件，不能直接登记弃赛' }
      } catch (error) {
        const message = String(error && (error.message || error.errMsg) || '').toLowerCase()
        const code = String(error && (error.code || error.errCode) || '').toLowerCase()
        const collectionMissing = code.includes('collection_not_exist') || message.includes('collection not exist') ||
          message.includes('collection does not exist') || message.includes('table not exist')
        if (!collectionMissing) return { success:false, code:'MATCH_EVENT_CHECK_FAILED', message:'暂时无法核实比赛事件，请重试' }
      }
      const forfeitingTeamId = String(data.forfeitTeamId || '')
      if (!forfeitingTeamId || ![String(match.homeTeamId || ''), String(match.awayTeamId || '')].includes(forfeitingTeamId)) return { success:false, code:'FORFEIT_TEAM_INVALID', message:'弃赛方必须是本场参赛球队' }
      const homeForfeited = forfeitingTeamId === String(match.homeTeamId || '')
      Object.assign(safeData, {
        status:'finished',
        homeScore:homeForfeited ? 0 : 3, awayScore:homeForfeited ? 3 : 0,
        scoreHome:homeForfeited ? 0 : 3, scoreAway:homeForfeited ? 3 : 0,
        resultType:'forfeit', resolution:'forfeit', forfeitingTeamId,
        winnerTeamId:homeForfeited ? String(match.awayTeamId || '') : String(match.homeTeamId || '')
      })
    }
    if (finishing) {
      if (safeData.status !== 'finished' || Object.keys(safeData).some(key => !['status','homeScore','awayScore'].includes(key))) return { success:false, code:'FINISH_FIELDS_INVALID', message:'结束比赛只能提交最终比分和状态' }
      if (event.expectedEventRevision == null || Number(event.expectedEventRevision) !== Number(match.matchEventRevision || 0)) return { success:false, code:'MATCH_EVENTS_CHANGED', message:'比赛事件已更新，请刷新后结束比赛' }
      const { calculateMatchEventScore } = await import('./data-center/statistics.mjs')
      const score = calculateMatchEventScore(match)
      const home = score ? score.home : safeData.homeScore, away = score ? score.away : safeData.awayScore
      if (![home,away].every(value => Number.isInteger(value) && value >= 0 && value <= 99)) return { success:false, code:'SCORE_INVALID', message:'请录入0至99之间的整数比分' }
      Object.assign(safeData, { homeScore:home, awayScore:away, scoreHome:home, scoreAway:away })
    }
    const organizerCanFinish = ORGANIZER_FINISHABLE_STATUSES.has(currentStatus) && !refereeHasTakenOverOrLocked(match)
    if (finishing && !ORGANIZER_FINISHABLE_STATUSES.has(currentStatus)) return { success:false, code:'MATCH_NOT_IN_PROGRESS', message:'只有进行中的比赛可以结束' }
    if (finishing && !organizerCanFinish) return { success:false, code:'MATCH_RECORD_LOCKED', message:'裁判已接管或裁判报告已提交/锁定，请通过裁判记录流程结束比赛' }
    const organizerRecordAllowed = !refereeHasTakenOverOrLocked(match) && !['ongoing','live','in_progress','playing','archived','cancelled'].includes(currentStatus)
    const canSupplement = (organizerRecordAllowed && Array.isArray(safeData.events)) || (finishing && organizerCanFinish) || (forfeiting && !refereeHasTakenOverOrLocked(match))

    if (match.executionSnapshot && Object.keys(safeData).some(field => EXECUTION_SNAPSHOT_BLOCKED_FIELDS.has(field) && !(canSupplement && ['homeScore','awayScore','scoreHome','scoreAway',...(finishing || forfeiting ? ['status','resultType','forfeitingTeamId'] : [])].includes(field)))) {
      return { success: false, message: '比赛执行快照已经固化，不能直接修改对阵、场地、时间或比分', code: 'MATCH_EXECUTION_SNAPSHOT_LOCKED' }
    }
    const preMatchSetupEditable = !match.refereeRecordLocked && !match.refereeReportSubmittedAt && match.executionState !== 'recording' && ['scheduled','pending','checked_in','not_started','upcoming',''].includes(String(match.status || '').toLowerCase())
    if (planState.locked) {
      const supplementFields = new Set(['events','homeScore','awayScore','scoreHome','scoreAway','matchEventRevision',...(finishing || forfeiting ? ['status','resultType','forfeitingTeamId'] : [])])
      const blockedFields = Object.keys(safeData).filter(field => !POST_PLAN_REFEREE_FIELDS.has(field) && !(preMatchSetupEditable && (field === 'kitColors' || field === 'kitSelection' || field === 'matchSequence' && !match.executionSnapshot)) && !(canSupplement && supplementFields.has(field)))
      if (blockedFields.length > 0 || !Object.keys(safeData).length) {
        return { success: false, message: '竞赛方案已锁定，当前只能安排裁判或修改未开赛比赛的球服颜色与场序', code: 'COMPETITION_PLAN_LOCKED' }
      }
    }
    if (safeData.kitColors !== undefined) {
      if (!preMatchSetupEditable) return { success:false, code:'MATCH_KIT_LOCKED', message:'比赛已进入执行或记录已锁定，不能修改球服颜色' }
      const incoming = safeData.kitColors
      if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming) || Object.keys(incoming).some(key => !['home','away'].includes(key))) return { success:false, code:'MATCH_KIT_INVALID', message:'球服颜色格式不正确' }
      const cleaned = {}
      for (const side of ['home','away']) {
        const partColors = incoming[side]
        if (!partColors || typeof partColors !== 'object' || Array.isArray(partColors) || Object.keys(partColors).some(key => !['jersey','shorts','socks'].includes(key))) return { success:false, code:'MATCH_KIT_INVALID', message:'球服颜色格式不正确' }
        cleaned[side] = {}
        for (const part of ['jersey','shorts','socks']) {
          const color = String(partColors[part] || '').trim()
          if (color && !/^(?:[\u4e00-\u9fa5]{1,12}|#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?)$/.test(color)) return { success:false, code:'MATCH_KIT_INVALID', message:'请使用颜色名称或十六进制颜色值' }
          cleaned[side][part] = color
        }
      }
      safeData.kitColors = db.command.set(cleaned)
    }
    if (safeData.kitSelection !== undefined) {
      if (!preMatchSetupEditable) return { success:false, code:'MATCH_KIT_LOCKED', message:'比赛已进入执行或记录已锁定，不能修改球服套装' }
      const selection = safeData.kitSelection
      if (!selection || typeof selection !== 'object' || Array.isArray(selection) || Object.keys(selection).some(key => !['home','away'].includes(key)) || !['home','away'].every(side => ['primary','secondary'].includes(selection[side]))) return { success:false, code:'MATCH_KIT_INVALID', message:'球服套装格式不正确' }
      safeData.kitSelection = db.command.set({ home:selection.home,away:selection.away })
    }
    if (safeData.matchSequence !== undefined) {
      if (match.executionSnapshot || !preMatchSetupEditable) {
        return { success:false, code:'MATCH_SEQUENCE_LOCKED', message:'比赛已进入执行或记录已锁定，不能修改场序' }
      }
      const sequence = Number(safeData.matchSequence)
      if (!Number.isInteger(sequence) || sequence < 1 || sequence > 9999) {
        return { success:false, code:'MATCH_SEQUENCE_INVALID', message:'场序号须为1至9999的整数' }
      }
      const peersResult = await db.collection('matches').where({ tournamentId:match.tournamentId }).limit(1000).get()
      const peers = (peersResult.data || []).filter(item => String(item.divisionId || 'default') === String(match.divisionId || 'default'))
      if ((peersResult.data || []).length >= 1000) return { success:false, code:'MATCH_SEQUENCE_CHECK_INCOMPLETE', message:'当前赛事场次过多，无法确认场序是否重复' }
      if (peers.some(item => String(item._id) !== String(matchId) && Number(item.matchSequence ?? item.matchNo ?? item.matchIndex) === sequence)) {
        return { success:false, code:'MATCH_SEQUENCE_CONFLICT', message:'该组别已有相同场序号，请换一个' }
      }
      safeData.matchSequence = sequence
    }
    // 电子记录进入复核后，所有比赛现场字段均为不可变快照。归档/退回应
    // 仅可经 webLoginApi 的 reviewRefereeRecord 执行，不能绕过该入口直接 updateMatch。
    if (match.refereeRecordLocked) {
      return { success: false, message: '裁判报告已提交，比赛记录已锁定' }
    }

    if (!match.durationRulesSnapshot && ['ongoing','live'].includes(String(safeData.status || ''))) {
      let division = null
      if (match.divisionId && match.divisionId !== 'default') {
        const record = await db.collection('divisions').doc(String(match.divisionId)).get()
        division = Array.isArray(record.data) ? record.data[0] : record.data
      }
      const { freezePreMatchDuration } = await import('./data-center/playing-time.mjs')
      const snapshot = freezePreMatchDuration(match,division || {},tournament || {})
      if (snapshot) safeData.durationRulesSnapshot = snapshot
    }

    let assignment = null
    if (safeData.refereeCrew) {
      assignment = await normalizeRefereeCrew(
        safeData.refereeCrew,
        safeData.matchFormat || match.matchFormat || (tournament && tournament.matchFormat) || '11side',
        actor,
        match.tournamentId,
        safeData.operationRefereeId,
        safeData.refereeRecordKeeperId
      )
      safeData.refereeCrew = assignment.crew
      safeData.refereeRecordKeeperId = assignment.keeperId
      safeData.operationRefereeId = assignment.operatorId
      safeData.refereeAssignmentStatus = 'assigned'
      await ensureNoRefereeScheduleConflicts(matchId, match, assignment.crew)
    }

    const setupOnly = Object.keys(safeData).every(field => field === 'kitColors' || field === 'kitSelection' || field === 'matchSequence')
    if (!match.executionSnapshot && planState.locked && !setupOnly) {
      safeData.executionSnapshot = buildExecutionSnapshot(match, tournament, actor)
      safeData.executionSnapshotAt = db.serverDate()
    }

    const scheduleChanged=['matchDate','matchTime','venue'].some(field=>safeData[field]!==undefined && String(safeData[field] || '')!==String(match[field] || ''))
    let adjustmentLogId=''
    if(scheduleChanged){await ensureScheduleAdjustmentLogs();const operationGroupId=String(event.adjustmentGroupId || ('adjust-'+Date.now()+'-'+crypto.randomBytes(3).toString('hex')));const logResult=await db.collection('schedule_adjustment_logs').add({ data:{ tournamentId:String(match.tournamentId || ''),divisionId:String(match.divisionId || 'default'),matchId:String(matchId),operationGroupId,adjustmentType:String(event.adjustmentType || 'manual'),before:{ matchDate:String(match.matchDate || ''),matchTime:String(match.matchTime || ''),venue:String(match.venue || '') },after:{ matchDate:String(safeData.matchDate!==undefined?safeData.matchDate:match.matchDate || ''),matchTime:String(safeData.matchTime!==undefined?safeData.matchTime:match.matchTime || ''),venue:String(safeData.venue!==undefined?safeData.venue:match.venue || '') },actorUserId:String(actor.user._id || ''),actorOrgId:actor.orgId,status:'pending',undone:false,createTime:db.serverDate(),updateTime:db.serverDate() } });adjustmentLogId=String(logResult._id || '')}

    // 更新 matches 集合
    const saveMatch = async target => target.collection('matches').doc(matchId).update({
      data: {
        ...safeData,
        orgId: actor.orgId,
        updateTime: db.serverDate()
      }
    })
    if (eventValidation || finishing || forfeiting || safeData.durationRulesSnapshot) {
      await db.runTransaction(async transaction => {
        const freshResult = await transaction.collection('matches').doc(matchId).get()
        const fresh = Array.isArray(freshResult.data) ? freshResult.data[0] : freshResult.data
        if (fresh?.durationRulesSnapshot) delete safeData.durationRulesSnapshot
        if (!fresh || refereeHasTakenOverOrLocked(fresh) || fresh.status !== match.status || fresh.executionState !== match.executionState || Number(fresh.matchEventRevision || 0) !== Number(match.matchEventRevision || 0) || JSON.stringify(fresh.events || []) !== JSON.stringify(match.events || []) || JSON.stringify(fresh.lineups || {}) !== JSON.stringify(match.lineups || {}) || JSON.stringify(fresh.homeLineup || {}) !== JSON.stringify(match.homeLineup || {}) || JSON.stringify(fresh.awayLineup || {}) !== JSON.stringify(match.awayLineup || {})) {
          throw Object.assign(new Error('比赛事件或阵容已更新，请刷新后重试'),{code:'MATCH_EVENTS_CHANGED'})
        }
        await saveMatch(transaction)
        if (forfeiting) await transaction.collection('registration_audit_logs').add({ data:{
          sport:'football', action:'match_forfeit_recorded', tournamentId:String(match.tournamentId || ''), matchId,
          actorUserId:String(actor.user._id || ''), actorOrgId:actor.orgId, result:'success',
          detail:{ forfeitingTeamId:String(safeData.forfeitingTeamId || ''), winnerTeamId:String(safeData.winnerTeamId || ''),
            before:{ status:String(fresh.status || ''), homeScore:fresh.homeScore ?? null, awayScore:fresh.awayScore ?? null },
            after:{ status:String(safeData.status || ''), homeScore:safeData.homeScore, awayScore:safeData.awayScore, resultType:String(safeData.resultType || '') } },
          createTime:db.serverDate()
        } })
      })
    } else await saveMatch(db)
    if(adjustmentLogId) await db.collection('schedule_adjustment_logs').doc(adjustmentLogId).update({ data:{ status:'applied',appliedAt:db.serverDate(),updateTime:db.serverDate() } })

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
    if (safeData.status === 'finished' && !['finished','completed','ended'].includes(String(match.status || '').toLowerCase()) && safeData.homeScore != null && safeData.awayScore != null) {
      try {
        await updateStandings(matchId, safeData, actor.orgId)
      } catch (e) {
        console.warn('更新积分榜失败（非关键）', e)
      }
    }

    return {
      success: true,
      message: '更新成功',
      ...((Array.isArray(safeData.events) || finishing || forfeiting) ? { data: { homeScore: safeData.homeScore, awayScore: safeData.awayScore, matchEventRevision:safeData.matchEventRevision, substitutionIssues:eventValidation?.issues || [] } } : {}),
      ...(notificationRelay ? { __notificationRelay: notificationRelay } : {})
    }
  } catch (err) {
    console.error('更新比赛失败:', err)
    return { success: false, code:err.code || 'MATCH_UPDATE_FAILED', message: '更新失败: ' + err.message }
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
