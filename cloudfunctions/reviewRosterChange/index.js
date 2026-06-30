// 云函数：审核换人申请
// action: 'getList' | 'approve' | 'reject'
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { action } = event

  if (action === 'getList') {
    return await handleGetList(event)
  } else if (action === 'approve') {
    return await handleApprove(event)
  } else if (action === 'reject') {
    return await handleReject(event)
  } else {
    return { success: false, message: '未知 action：' + action }
  }
}

// 查询换人申请列表
async function handleGetList(event) {
  const { tournamentId, status, teamId, limit = 100 } = event
  if (!tournamentId) return { success: false, message: '缺少 tournamentId 参数' }

  try {
    let where = { tournamentId: tournamentId }
    if (status && status !== 'all') {
      where.status = status
    }
    if (teamId) {
      where.teamId = teamId
    }

    const res = await db.collection('roster_change_requests')
      .where(where)
      .orderBy('applyTime', 'desc')
      .limit(limit)
      .get()

    return {
      success: true,
      message: '查询成功',
      data: res.data || []
    }
  } catch (err) {
    console.error('[reviewRosterChange getList] 错误:', err)
    return { success: false, message: '查询失败：' + (err.message || '未知错误') }
  }
}

// 审核通过：事务内更新 rosters（移除换出+添加换入）+ 更新申请状态
// 注意：CloudBase 事务仅支持 doc() 操作，不支持 where()，需先在事务外查出 rosterId
async function handleApprove(event) {
  const { requestId, reviewerId, reviewerName, reviewNote } = event
  if (!requestId) return { success: false, message: '缺少 requestId 参数' }

  try {
    // 1. 查询申请记录（事务外）
    const reqRes = await db.collection('roster_change_requests').doc(requestId).get()
    if (!reqRes.data) {
      return { success: false, message: '换人申请记录不存在' }
    }
    const req = reqRes.data

    if (req.status !== 'pending') {
      return { success: false, message: '该申请已处理（当前状态：' + req.status + '）' }
    }

    // ★ P1-2: 校验剩余换人次数（事务前）
    const tournamentRes = await db.collection('tournaments').doc(req.tournamentId).get()
    if (!tournamentRes.data) {
      return { success: false, message: '赛事不存在' }
    }
    const maxRosterChanges = (tournamentRes.data.maxRosterChanges !== undefined && tournamentRes.data.maxRosterChanges !== null)
      ? tournamentRes.data.maxRosterChanges : 3

    const approvedCountRes = await db.collection('roster_change_requests').where({
      tournamentId: req.tournamentId,
      teamId: req.teamId,
      status: 'approved'
    }).count()
    const approvedCount = approvedCountRes.total || 0
    if (approvedCount >= maxRosterChanges) {
      return { success: false, message: '换人申请次数已用完，无法继续审批' }
    }

    // 2. 查询当前淘汰赛大名单记录的 _id（事务外，where 查询）
    const rosterQueryRes = await db.collection('rosters').where({
      tournamentId: req.tournamentId,
      teamId: req.teamId,
      stage: 'knockout'
    }).limit(1).get()

    if (!rosterQueryRes.data || rosterQueryRes.data.length === 0) {
      return { success: false, message: '未找到淘汰赛大名单，无法更新' }
    }
    const rosterId = rosterQueryRes.data[0]._id

    // 3. 事务：更新 rosters + 更新申请状态（事务内仅用 doc() 操作）
    const transactionResult = await db.runTransaction(async transaction => {
      // 3a. 读取当前大名单（事务内 doc().get()）
      const rosterDoc = await transaction.collection('rosters').doc(rosterId).get()
      if (!rosterDoc.data) {
        throw new Error('大名单记录不存在')
      }
      let players = rosterDoc.data.players || []

      // 3b. 移除换出球员
      var newPlayers = []
      var removed = false
      for (var i = 0; i < players.length; i++) {
        var pid = players[i]._id || players[i].id || players[i].name
        if (pid === req.outPlayerId) {
          removed = true
          continue // 跳过换出球员
        }
        newPlayers.push(players[i])
      }
      if (!removed) {
        throw new Error('换出球员不在大名单中，可能已被其他申请处理')
      }

      // 3c. 添加换入球员（★ P2-1: 保留完整信息，含 idCard/phone 等）
      var newInPlayer = {
        _id: req.inPlayerId,
        id: req.inPlayerId,
        name: req.inPlayerName,
        number: req.inPlayerNumber || '',
        position: ''
      }
      // 从 inPlayerInfo 补充完整字段（idCard、phone 等）
      if (req.inPlayerInfo && typeof req.inPlayerInfo === 'object') {
        var infoKeys = Object.keys(req.inPlayerInfo)
        for (var k = 0; k < infoKeys.length; k++) {
          var key = infoKeys[k]
          if (key !== '_id' && key !== 'id' && key !== 'name' && key !== 'number' && key !== 'position') {
            newInPlayer[key] = req.inPlayerInfo[key]
          }
        }
      }
      newPlayers.push(newInPlayer)

      // 3d. 更新 rosters（事务内 doc().update()）
      await transaction.collection('rosters').doc(rosterId).update({
        data: {
          players: newPlayers,
          updatedAt: db.serverDate()
        }
      })

      // 3e. 更新申请状态为 approved（事务内 doc().update()）
      await transaction.collection('roster_change_requests').doc(requestId).update({
        data: {
          status: 'approved',
          reviewerId: reviewerId || '',
          reviewerName: reviewerName || '',
          reviewNote: reviewNote || '',
          approveTime: db.serverDate()
        }
      })

      return { rosterId: rosterId, newPlayerCount: newPlayers.length }
    })

    return {
      success: true,
      message: '审核通过，名单已更新',
      data: transactionResult
    }
  } catch (err) {
    console.error('[reviewRosterChange approve] 错误:', err)
    return { success: false, message: '审核失败：' + (err.message || '未知错误') }
  }
}

// 审核拒绝：仅更新申请状态和备注
async function handleReject(event) {
  const { requestId, reviewerId, reviewerName, reviewNote } = event
  if (!requestId) return { success: false, message: '缺少 requestId 参数' }

  try {
    // 1. 查询申请记录
    const reqRes = await db.collection('roster_change_requests').doc(requestId).get()
    if (!reqRes.data) {
      return { success: false, message: '换人申请记录不存在' }
    }
    const req = reqRes.data

    if (req.status !== 'pending') {
      return { success: false, message: '该申请已处理（当前状态：' + req.status + '）' }
    }

    // 2. 更新申请状态为 rejected
    await db.collection('roster_change_requests').doc(requestId).update({
      data: {
        status: 'rejected',
        reviewerId: reviewerId || '',
        reviewerName: reviewerName || '',
        reviewNote: reviewNote || '',
        approveTime: db.serverDate()
      }
    })

    return {
      success: true,
      message: '已拒绝换人申请'
    }
  } catch (err) {
    console.error('[reviewRosterChange reject] 错误:', err)
    return { success: false, message: '操作失败：' + (err.message || '未知错误') }
  }
}
