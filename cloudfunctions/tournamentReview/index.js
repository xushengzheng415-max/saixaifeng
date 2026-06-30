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

/**
 * 提交参赛审核请求
 * 教练在提交参赛名单时调用
 */
async function submitReviewRequest(event) {
  const { tournamentId, tournamentName, teamId, teamName, teamCode, coachPhone, snapshot } = event
  
  if (!tournamentId || !teamId || !coachPhone) {
    return { success: false, error: '缺少必要参数' }
  }
  
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
async function getReviewRequests(event) {
  const { tournamentId, status, page, limit } = event
  
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
async function reviewRequest(event) {
  const { requestId, action, reviewerId, reviewerName, rejectReason } = event
  
  if (!requestId || !action || !reviewerId) {
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
    
    // 检查状态是否已是最终状态
    if (request.status !== STATUS.PENDING) {
      return { success: false, error: '该请求已审核，请勿重复操作' }
    }
    
    // 更新审核请求状态
    const updateData = {
      status: action === ACTION.APPROVE ? STATUS.APPROVED : STATUS.REJECTED,
      reviewTime: db.serverDate(),
      reviewerId,
      reviewerName: reviewerName || '',
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
            reviewerId,
            reviewerName: reviewerName || '',
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
            reviewerId,
            reviewerName: reviewerName || '',
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
async function getCoachReviewStatus(event) {
  const { tournamentId, teamId, coachPhone } = event
  
  if (!tournamentId || !teamId || !coachPhone) {
    return { success: false, error: '缺少必要参数' }
  }
  
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
  const { action } = event
  
  switch (action) {
    case ACTION.SUBMIT:
      return await submitReviewRequest(event)
    case 'getRequests':
      return await getReviewRequests(event)
    case ACTION.APPROVE:
    case ACTION.REJECT:
      return await reviewRequest(event)
    case 'getCoachStatus':
      return await getCoachReviewStatus(event)
    default:
      return { success: false, error: '无效的操作类型' }
  }
}