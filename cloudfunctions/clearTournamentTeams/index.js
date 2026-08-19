const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

function competitionPlanLocked(tournament) {
  if (!tournament) return false
  if (tournament.competitionPlanLocked === true || tournament.finalPlanLocked === true ||
    ['locked', 'match_management', 'in_progress', 'completed'].includes(String(tournament.competitionPlanStatus || '').toLowerCase())) return true
  return (Array.isArray(tournament.divisions) ? tournament.divisions : []).some(function(division) {
    return division && (division.competitionPlanLocked === true || division.finalPlanLocked === true ||
      ['locked', 'match_management', 'in_progress', 'completed'].includes(String(division.competitionPlanStatus || '').toLowerCase()))
  })
}

exports.main = async (event, context) => {
  const { tournamentId } = event
  if (!tournamentId) {
    return { code: -1, message: '缺少 tournamentId' }
  }

  try {
    const db = cloud.database()
    const _ = db.command
    const tournamentResult = await db.collection('tournaments').doc(tournamentId).get()
    const tournament = Array.isArray(tournamentResult.data) ? tournamentResult.data[0] : tournamentResult.data
    if (competitionPlanLocked(tournament)) {
      return { code: 'COMPETITION_PLAN_LOCKED', message: '竞赛方案已确认，不能清空参赛关系' }
    }
    const countRes = await db.collection('tournament_teams')
      .where({ tournamentId: tournamentId })
      .count()
    const total = countRes.total

    if (total === 0) {
      return { code: 0, message: '无记录可删', deleted: 0 }
    }

    // 小程序端 limit 100，分批删除
    let deleted = 0
    while (deleted < total) {
      const res = await db.collection('tournament_teams')
        .where({ tournamentId: tournamentId })
        .limit(100)
        .get()
      const batch = res.data || []
      if (batch.length === 0) break
      for (const doc of batch) {
        await db.collection('tournament_teams').doc(doc._id).remove()
      }
      deleted += batch.length
    }

    return { code: 0, message: `成功删除 ${deleted} 条记录`, deleted }
  } catch (e) {
    return { code: -1, message: e.message, error: e }
  }
}
