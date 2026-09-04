// 赛事球队审核云函数
// 处理教练提交参赛请求，主办方审核的流程
const cloud = require('wx-server-sdk')
const db = cloud.database()

// 审核状态常量
const STATUS = {
  PENDING: 'pending',    // 待审核
  APPROVED: 'approved',  // 已批准
  REJECTED: 'rejected'    // 已拒绝
}

// 审核操作类型
const ACTION = {
  SUBMIT: 'submit',      // 教练提交审核请求
  APPROVE: 'approve',   // 主办方批准
  REJECT: 'reject'       // 主办方拒绝
}

function actorFailure(message, code) {
  return { success: false, error: message, code: code || 'AUTH_REQUIRED' }
}

async function requireActor(event) {
  const userId = String(event && event.__actorUserId || '').trim()
  const orgId = String(event && event.__actorOrgId || '').trim()
  if (!userId || !orgId) return { ok: false, result: actorFailure('登录会话或机构信息已失效，请重新登录') }
  const userResult = await db.collection('users').doc(userId).get()
  const user = Array.isArray(userResult.data) ? userResult.data[0] : userResult.data
  if (!user) return { ok: false, result: actorFailure('登录账号不存在') }
  const actualOrgId = String(user.orgId || user.organizationId || '').trim()
  if (!actualOrgId || actualOrgId !== orgId) return { ok: false, result: actorFailure('当前账号尚未关联有效机构', 'ORG_REQUIRED') }
  const organizationResult = await db.collection('organizations').doc(orgId).get()
  const organization = Array.isArray(organizationResult.data) ? organizationResult.data[0] : organizationResult.data
  if (!organization) return { ok: false, result: actorFailure('当前机构不存在或已失效', 'ORG_REQUIRED') }
  const phone = String(user.phone || user.phoneNumber || user.mobile || '').trim()
  return { ok: true, actor: { userId, orgId, phone, name: String(user.nickname || user.userName || user.name || phone || '主办方').trim().slice(0, 50) } }
}

async function authorizeTournament(actor, tournamentId) {
  const id = String(tournamentId || '').trim()
  if (!id) return { ok: false, result: { success: false, error: '缺少 tournamentId 参数' } }
  const result = await db.collection('tournaments').doc(id).get()
  const tournament = Array.isArray(result.data) ? result.data[0] : result.data
  if (!tournament) return { ok: false, result: { success: false, error: '赛事不存在' } }
  const tournamentOrgId = String(tournament.orgId || tournament.organizationId || tournament.organization_id || '').trim()
  if (!tournamentOrgId || tournamentOrgId !== actor.orgId) return { ok: false, result: actorFailure('无权访问当前机构之外的赛事', 'ORG_ACCESS_DENIED') }
  return { ok: true, tournament }
}

async function authorizeTeam(actor, teamId) {
  const id = String(teamId || '').trim()
  if (!id) return { ok: false, result: { success: false, error: '缺少 teamId 参数' } }
  const result = await db.collection('teams').doc(id).get()
  const team = Array.isArray(result.data) ? result.data[0] : result.data
  if (!team) return { ok: false, result: { success: false, error: '球队不存在' } }
  const teamOrgId = String(team.orgId || team.organizationId || team.organization_id || '').trim()
  if (!teamOrgId || teamOrgId !== actor.orgId) return { ok: false, result: actorFailure('无权访问当前机构之外的球队', 'ORG_ACCESS_DENIED') }
  return { ok: true, team }
}

/**
 * 提交参赛审核请求
 * 教练在提交参赛名单时调用
 */
async function submitReviewRequest(event, actor) {
  const { tournamentId, tournamentName, teamId, teamName, teamCode, snapshot } = event
  const coachPhone = actor.phone
  
  if (!tournamentId || !teamId || !coachPhone) {
    return { success: false, error: '缺少必要参数' }
  }

  const tournamentScope = await authorizeTournament(actor, tournamentId)
  if (!tournamentScope.ok) return tournamentScope.result
  const teamScope = await authorizeTeam(actor, teamId)
  if (!teamScope.ok) return teamScope.result
  
  try {
    // 检查是否已有待审核的请求
    const existRes = await db.collection('tournament_team_requests').where({
      tournamentId,
      teamId,
      coachPhone,
      status: STATUS.PENDING
    }).get()
    
    if (existRes.data && existRes.data.length > 0) {
      return { success: false, error: '已有待审核的请求，请勿重复提交' }
    }
    
    // 创建审核请求记录
    const requestData = {
      tournamentId,
      tournamentName: tournamentName || '',
      teamId,
      teamName: teamName || '',
      teamCode: teamCode || '',
      coachPhone,
      status: STATUS.PENDING,
      submitTime: db.serverDate(),
      snapshot: snapshot || {},  // 提交的快照数据（球员名单、队徽等）
      reviewTime: null,
      reviewerId: '',
      reviewerName: '',
      rejectReason: ''
    }
    
    const result = await db.collection('tournament_team_requests').add(requestData)
    
    // 触发消息通知（可选）
    try {
      await cloud.callFunction({
        name: 'sendNotification',
        data: {
          type: 'review_request',
          tournamentId,
          teamId,
          requestId: result._id
        }
      })
    } catch (e) {
      console.warn('[tournamentReview] 发送通知失败:', e)
    }
    
    return { 
      success: true, 
      message: '审核请求已提交，请等待主办方审核',
      requestId: result._id 
    }
  } catch (err) {
    console.error('[tournamentReview] 提交审核请求失败:', err)
    return { success: false, error: err.message || '提交失败' }
  }
}

/**
 * 获取审核请求列表
 * 主办方查看待审核/已审核的请求
 */
async function getReviewRequests(event, actor) {
  const { tournamentId, status, page, limit } = event
  const tournamentScope = await authorizeTournament(actor, tournamentId)
  if (!tournamentScope.ok) return tournamentScope.result
  
  try {
    let query = db.collection('tournament_team_requests').where({})
    
    // 按赛事筛选
    if (tournamentId) {
      query = query.where({ tournamentId })
    }
    
    // 按状态筛选
    if (status) {
      query = query.where({ status })
    }
    
    // 分页查询
    const offset = (page || 0) * (limit || 10)
    const result = await query
      .orderBy('submitTime', 'desc')
      .skip(offset)
      .limit(limit || 10)
      .get()
      
    // 获取总数
    const countRes = await query.count()
    
    return {
      success: true,
      data: result.data || [],
      total: countRes.total || 0,
      page: page || 0,
      limit: limit || 10
    }
  } catch (err) {
    console.error('[tournamentReview] 获取审核请求失败:', err)
    return { success: false, error: err.message || '查询失败' }
  }
}

/**
 * 审核请求（批准/拒绝）
 * 主办方操作
 */
async function reviewRequest(event, actor) {
  const { requestId, action, rejectReason } = event
  
  if (!requestId || !action) {
    return { success: false, error: '缺少必要参数' }
  }
  
  if (action !== ACTION.APPROVE && action !== ACTION.REJECT) {
    return { success: false, error: '无效的操作类型' }
  }
  
  try {
    // 获取审核请求详情
    const requestRes = await db.collection('tournament_team_requests').doc(requestId).get()
    if (!requestRes.data || requestRes.data.length === 0) {
      return { success: false, error: '审核请求不存在' }
    }
    
    const request = requestRes.data[0]

    const tournamentScope = await authorizeTournament(actor, request.tournamentId)
    if (!tournamentScope.ok) return tournamentScope.result
    const teamScope = await authorizeTeam(actor, request.teamId)
    if (!teamScope.ok) return teamScope.result
    
    // 检查状态是否已是最终状态
    if (request.status !== STATUS.PENDING) {
      return { success: false, error: '该请求已审核，请勿重复操作' }
    }
    
    // 更新审核请求状态
    const updateData = {
      status: action === ACTION.APPROVE ? STATUS.APPROVED : STATUS.REJECTED,
      reviewTime: db.serverDate(),
      reviewerId: actor.userId,
      reviewerName: actor.name,
      rejectReason: action === ACTION.REJECT ? (rejectReason || '') : ''
    }
    
    await db.collection('tournament_team_requests').doc(requestId).update(updateData)
    
    // 如果审核通过，更新 tournament_teams 集合
    if (action === ACTION.APPROVE) {
      try {
        // 检查是否已有记录
        const existTeamRes = await db.collection('tournament_teams').where({
          tournamentId: request.tournamentId,
          teamId: request.teamId
        }).get()
        
        if (existTeamRes.data && existTeamRes.data.length > 0) {
          // 更新已有记录
          await db.collection('tournament_teams').doc(existTeamRes.data[0]._id).update({
            ...request.snapshot,
            reviewedAt: db.serverDate(),
            reviewerId: actor.userId,
            reviewerName: actor.name,
            status: 'approved'
          })
        } else {
          // 创建新记录
          await db.collection('tournament_teams').add({
            ...request.snapshot,
            tournamentId: request.tournamentId,
            tournamentName: request.tournamentName,
            teamId: request.teamId,
            teamName: request.teamName,
            teamCode: request.teamCode,
            coachPhone: request.coachPhone,
            submittedAt: request.submitTime,
            reviewedAt: db.serverDate(),
            reviewerId: actor.userId,
            reviewerName: actor.name,
            status: 'approved',
            createdAt: db.serverDate()
          })
        }
      } catch (e) {
        console.error('[tournamentReview] 更新赛事球队数据失败:', e)
        return { success: false, error: '审核通过但更新数据失败：' + e.message }
      }
    }
    
    // 触发消息通知（可选）
    try {
      await cloud.callFunction({
        name: 'sendNotification',
        data: {
          type: 'review_result',
          requestId,
          teamId: request.teamId,
          coachPhone: request.coachPhone,
          isApproved: action === ACTION.APPROVE
        }
      })
    } catch (e) {
      console.warn('[tournamentReview] 发送通知失败:', e)
    }
    
    return { 
      success: true, 
      message: action === ACTION.APPROVE ? '审核已批准' : '审核已拒绝',
      status: updateData.status
    }
  } catch (err) {
    console.error('[tournamentReview] 审核操作失败:', err)
    return { success: false, error: err.message || '审核失败' }
  }
}

/**
 * 获取教练的审核请求状态
 * 教练查看自己提交的审核请求状态
 */
async function getCoachReviewStatus(event, actor) {
  const { tournamentId, teamId } = event
  const coachPhone = actor.phone
  
  if (!tournamentId || !teamId || !coachPhone) {
    return { success: false, error: '缺少必要参数' }
  }

  const tournamentScope = await authorizeTournament(actor, tournamentId)
  if (!tournamentScope.ok) return tournamentScope.result
  const teamScope = await authorizeTeam(actor, teamId)
  if (!teamScope.ok) return teamScope.result
  
  try {
    const result = await db.collection('tournament_team_requests').where({
      tournamentId,
      teamId,
      coachPhone
    }).orderBy('submitTime', 'desc').get()
    
    if (result.data && result.data.length > 0) {
      return { success: true, data: result.data[0] }
    } else {
      return { success: true, data: null, message: '暂无审核请求' }
    }
  } catch (err) {
    console.error('[tournamentReview] 获取教练审核状态失败:', err)
    return { success: false, error: err.message || '查询失败' }
  }
}

// 云函数入口
exports.main = async (event, context) => {
  event = event || {}
  const { action } = event
  const actorResult = await requireActor(event)
  if (!actorResult.ok) return actorResult.result
  const actor = actorResult.actor
  
  switch (action) {
    case ACTION.SUBMIT:
      return await submitReviewRequest(event, actor)
    case 'getRequests':
      return await getReviewRequests(event, actor)
    case ACTION.APPROVE:
    case ACTION.REJECT:
      return await reviewRequest(event, actor)
    case 'getCoachStatus':
      return await getCoachReviewStatus(event, actor)
    default:
      return { success: false, error: '无效的操作类型' }
  }
}
