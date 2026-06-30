// 云函数：球队报名参赛（外部报名）
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { tournamentId, teamId, message = '' } = event

  if (!tournamentId) {
    return { success: false, message: '缺少 tournamentId 参数' }
  }
  if (!teamId) {
    return { success: false, message: '缺少 teamId 参数' }
  }

  try {
    // 1. 查询赛事信息
    const tournamentRes = await db.collection('tournaments').doc(tournamentId).get()
    if (!tournamentRes.data) {
      return { success: false, message: '赛事不存在' }
    }
    const tournament = tournamentRes.data

    // 2. 检查赛事是否开放报名
    if (tournament.status !== 'registering' && tournament.status !== 'upcoming') {
      return { success: false, message: '该赛事已停止报名' }
    }

    // 3. 检查球队是否已报名
    const existRes = await db.collection('tournament_teams').where({
      tournamentId: tournamentId,
      teamId: teamId
    }).get()

    if (existRes.data && existRes.data.length > 0) {
      const exist = existRes.data[0]
      if (exist.status === 'pending') {
        return { success: false, message: '您已提交报名申请，请等待主办方审核' }
      }
      if (exist.status === 'approved') {
        return { success: false, message: '您的球队已通过审核，无需重复报名' }
      }
      if (exist.status === 'invited') {
        // 球队主动报名，删除旧的邀请记录，重新创建报名记录
        await db.collection('tournament_teams').doc(exist._id).remove()
      }
      if (exist.status === 'rejected') {
        // 被拒绝后可以重新报名，先删除旧记录
        await db.collection('tournament_teams').doc(exist._id).remove()
      }
    }

    // 4. 查询球队信息
    const teamRes = await db.collection('teams').doc(teamId).get()
    const team = teamRes.data
    if (!team) {
      return { success: false, message: '球队不存在' }
    }

    // 5. 检查赛事是否已满
    const approvedCount = await db.collection('tournament_teams').where({
      tournamentId: tournamentId,
      status: _.in(['approved', 'invited'])
    }).count()

    if (tournament.maxTeams && approvedCount.total >= tournament.maxTeams) {
      return { success: false, message: '该赛事名额已满' }
    }

    // 6. 创建报名记录
    const signupData = {
      tournamentId: tournamentId,
      tournamentName: tournament.name,
      teamId: teamId,
      teamName: team.name,
      teamLogo: team.logoUrl || team.logo || '',
      coachId: team.coachId || '',
      coachName: team.coachName || team.contactName || '',
      playerCount: 0,
      status: 'pending',
      type: 'signup',  // signup = 外部报名, invite = 内部邀请
      message: message,
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }

    const result = await db.collection('tournament_teams').add({
      data: signupData
    })

    // 7. 同步创建 invitations 记录（用于消息通知）
    try {
      await db.collection('invitations').add({
        data: {
          type: 'team_to_tournament',
          status: 'pending',
          fromUserId: team.coachId || '',
          fromName: team.coachName || team.contactName || team.name,
          toName: tournament.name,
          tournamentId: tournamentId,
          tournamentName: tournament.name,
          teamId: teamId,
          teamName: team.name,
          createdAt: db.serverDate(),
          message: message
        }
      })
    } catch (invErr) {
      console.warn('同步创建invitations记录失败:', invErr.message)
      // 不阻塞主流程
    }

    return {
      success: true,
      message: '报名申请已提交，请等待主办方审核',
      data: {
        signupId: result._id
      }
    }

  } catch (err) {
    console.error('报名失败:', err)
    return {
      success: false,
      message: err.message || '报名失败'
    }
  }
}
