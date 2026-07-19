// 云函数：更新比赛信息
const cloud = require('wx-server-sdk')
const crypto = require('crypto')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex')
}

function recordBelongsToActor(record, actor) {
  if (!record || !actor) return false
  if (record.orgId && String(record.orgId) === String(actor.orgId)) return true
  const ids = [actor.user._id, actor.user.uid, actor.user.userId].filter(Boolean)
  if (['creatorId', 'organizerId', 'ownerId', 'userId', 'createdBy']
    .some(field => record[field] && ids.includes(record[field]))) return true
  const phones = [actor.user.phone, actor.user.phoneNumber].filter(Boolean)
  return phones.length > 0 && ['creatorPhone', 'organizerPhone', 'ownerPhone', 'contactPhone', 'phoneNumber', 'phone']
    .some(field => record[field] && phones.includes(record[field]))
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
  const orgId = String(user.orgId || user._id)
  if (event.__actorUserId && event.__actorUserId !== user._id) throw new Error('登录身份校验失败')
  if (event.__actorOrgId && String(event.__actorOrgId) !== orgId) throw new Error('机构归属校验失败')
  if (!user.orgId) {
    await db.collection('users').doc(user._id).update({ data: { orgId, updateTime: db.serverDate() } })
  }
  return { user: { ...user, orgId }, orgId }
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

    const safeData = { ...data }
    ;['orgId', 'creatorId', 'organizerId', 'ownerId', 'userId', 'createdBy'].forEach(field => { delete safeData[field] })
    delete safeData.tournamentId

    // 更新 matches 集合
    await db.collection('matches').doc(matchId).update({
      data: {
        ...safeData,
        orgId: actor.orgId,
        updateTime: db.serverDate()
      }
    })

    // 如果更新了裁判组，同步到 match_referees 集合
    if (safeData.refereeCrew) {
      await syncMatchReferees(matchId, safeData.refereeCrew, match.tournamentId, actor.orgId)
    }

    // 如果更新了比分且状态为 finished，同时更新联赛/小组积分榜
    if (safeData.status === 'finished' && safeData.homeScore != null && safeData.awayScore != null) {
      try {
        await updateStandings(matchId, safeData, actor.orgId)
      } catch (e) {
        console.warn('更新积分榜失败（非关键）', e)
      }
    }

    return { success: true, message: '更新成功' }
  } catch (err) {
    console.error('更新比赛失败:', err)
    return { success: false, message: '更新失败: ' + err.message }
  }
}

// 同步 match_referees 集合
async function syncMatchReferees(matchId, refereeCrew, tournamentId, orgId) {
  try {
    // 1. 删除旧的裁判记录
    const oldRecords = await db.collection('match_referees').where({ matchId }).get()
    for (const doc of oldRecords.data) {
      await db.collection('match_referees').doc(doc._id).remove()
    }

    // 2. 插入新的裁判记录（只插入有姓名的）
    const roles = ['mainReferee', 'assistant1', 'assistant2', 'fourthOfficial', 'varReferee', 'matchObserver', 'refereeObserver']
    const roleLabels = {
      mainReferee: '主裁判',
      assistant1: '助理裁判1',
      assistant2: '助理裁判2',
      fourthOfficial: '第四官员',
      varReferee: '视频裁判',
      matchObserver: '比赛监督',
      refereeObserver: '裁判监督'
    }

    for (const role of roles) {
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
            roleLabel: roleLabels[role] || role,
            assignedAt: db.serverDate(),
            notified: false
          }
        })
      }
    }

    console.log('[syncMatchReferees] 同步完成')
  } catch (err) {
    console.error('[syncMatchReferees] 同步失败:', err)
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
