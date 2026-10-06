// 云函数：提交换人申请
// 校验赛事淘汰赛窗口开启 / 换出球员在大名单 / 换入球员在球员库且不在其他队 / 剩余次数>0
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const {
    tournamentId,
    teamId,
    outPlayerId,
    outPlayerName,
    outPlayerNumber,
    inPlayerId,
    inPlayerName,
    inPlayerNumber,
    inPlayerInfo,
    reason,
    reasonText
  } = event

  // 参数校验
  if (!tournamentId) return { success: false, message: '缺少 tournamentId 参数' }
  if (!teamId) return { success: false, message: '缺少 teamId 参数' }
  if (!outPlayerId) return { success: false, message: '请选择换出球员' }
  if (!inPlayerId) return { success: false, message: '请选择换入球员' }
  if (!reason) return { success: false, message: '请选择换人原因' }

  // ★ P2-2: 校验换出和换入球员不能相同
  if (outPlayerId === inPlayerId) {
    return { success: false, message: '换出和换入球员不能相同' }
  }

  try {
    // 1. 查询赛事信息，校验淘汰赛窗口是否开启
    const tournamentRes = await db.collection('tournaments').doc(tournamentId).get()
    if (!tournamentRes.data) {
      return { success: false, message: '赛事不存在' }
    }
    const tournament = tournamentRes.data

    if (!tournament.knockoutRosterEnabled) {
      return { success: false, message: '该赛事未启用淘汰赛独立名单功能' }
    }
    if (!tournament.knockoutRosterOpen) {
      return { success: false, message: '淘汰赛名单提交窗口未开启，无法发起换人申请' }
    }

    const maxRosterChanges = (tournament.maxRosterChanges !== undefined && tournament.maxRosterChanges !== null)
      ? tournament.maxRosterChanges : 3

    // 2. 查询当前淘汰赛大名单，校验换出球员在其中
    const rosterRes = await db.collection('rosters').where({
      tournamentId: tournamentId,
      teamId: teamId,
      stage: 'knockout'
    }).limit(1).get()

    if (!rosterRes.data || rosterRes.data.length === 0) {
      return { success: false, message: '未找到淘汰赛大名单，请先提交第二阶段名单' }
    }
    const roster = rosterRes.data[0]
    const rosterPlayers = roster.players || []

    let outPlayerInRoster = false
    for (let i = 0; i < rosterPlayers.length; i++) {
      const p = rosterPlayers[i]
      const pid = p._id || p.id || p.name
      if (pid === outPlayerId) {
        outPlayerInRoster = true
        break
      }
    }
    if (!outPlayerInRoster) {
      return { success: false, message: '换出球员不在当前淘汰赛大名单中' }
    }

    // ★ P1-1: 校验换入球员不在当前队大名单中（已在名单则无需换入）
    let inPlayerAlreadyInRoster = false
    for (let i = 0; i < rosterPlayers.length; i++) {
      const p = rosterPlayers[i]
      const pid = p._id || p.id || p.name
      if (pid === inPlayerId) {
        inPlayerAlreadyInRoster = true
        break
      }
    }
    if (inPlayerAlreadyInRoster) {
      return { success: false, message: '换入球员已在当前大名单中，无需换入' }
    }

    // 3. 查询球队球员库，校验换入球员存在
    const teamRes = await db.collection('teams').doc(teamId).get()
    if (!teamRes.data) {
      return { success: false, message: '球队不存在' }
    }
    const team = teamRes.data
    const teamPlayers = team.players || []

    let inPlayerInTeam = false
    let inPlayerFull = null
    for (let i = 0; i < teamPlayers.length; i++) {
      const p = teamPlayers[i]
      const pid = p._id || p.id || p.name
      if (pid === inPlayerId) {
        inPlayerInTeam = true
        inPlayerFull = p
        break
      }
    }
    if (!inPlayerInTeam) {
      return { success: false, message: '换入球员不在球队球员库中，请先注册球员' }
    }

    // 4. 校验换入球员不在赛事其他球队的大名单中（group 和 knockout 均查）
    const otherRostersRes = await db.collection('rosters').where({
      tournamentId: tournamentId,
      teamId: _.neq(teamId)
    }).limit(100).get()

    const otherRosters = otherRostersRes.data || []
    for (let i = 0; i < otherRosters.length; i++) {
      const otherPlayers = otherRosters[i].players || []
      for (let j = 0; j < otherPlayers.length; j++) {
        const pid = otherPlayers[j]._id || otherPlayers[j].id || otherPlayers[j].name
        if (pid === inPlayerId) {
          return { success: false, message: '换入球员已在其他球队大名单中，无法换入' }
        }
      }
    }

    // 5. 校验剩余换人次数 > 0（已通过申请数）
    const approvedCountRes = await db.collection('roster_change_requests').where({
      tournamentId: tournamentId,
      teamId: teamId,
      status: 'approved'
    }).count()

    const usedCount = approvedCountRes.total || 0
    if (usedCount >= maxRosterChanges) {
      return { success: false, message: '换人申请次数已用完（' + maxRosterChanges + '次）' }
    }

    // 6. 创建 roster_change_requests 记录
    const teamName = roster.teamName || team.name || ''
    const recordData = {
      tournamentId: tournamentId,
      teamId: teamId,
      teamName: teamName,
      stage: 'knockout',
      outPlayerId: outPlayerId,
      outPlayerName: outPlayerName || '',
      outPlayerNumber: outPlayerNumber || '',
      inPlayerId: inPlayerId,
      inPlayerName: inPlayerName || '',
      inPlayerNumber: inPlayerNumber || (inPlayerFull ? (inPlayerFull.number || '') : ''),
      inPlayerInfo: inPlayerInfo || {
        idCard: inPlayerFull ? (inPlayerFull.idCard || '') : '',
        phone: inPlayerFull ? (inPlayerFull.phone || inPlayerFull.phoneNumber || '') : ''
      },
      reason: reason,
      reasonText: reason === 'other' ? (reasonText || '') : '',
      status: 'pending',
      applyTime: db.serverDate()
    }

    const addRes = await db.collection('roster_change_requests').add({ data: recordData })

    return {
      success: true,
      message: '换人申请已提交',
      data: {
        _id: addRes._id,
        remainingChanges: maxRosterChanges - usedCount - 1
      }
    }
  } catch (err) {
    console.error('[submitRosterChange] 错误:', err)
    return { success: false, message: '提交失败：' + (err.message || '未知错误') }
  }
}
