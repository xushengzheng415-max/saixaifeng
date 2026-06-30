const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

/**
 * 获取赛事所有比赛
 * 用于 portal 赛事详情页的赛况、积分榜等
 * 
 * 输入：
 *   - tournamentId: 赛事ID
 *   - phase: 可选，筛选阶段（group/league/cup）
 *   - status: 可选，筛选状态（completed/pending/ongoing）
 *   - pageSize: 可选，默认 100
 */
exports.main = async (event, context) => {
  const { tournamentId, phase, status, pageSize = 100 } = event

  if (!tournamentId) {
    return { success: false, message: '缺少赛事ID' }
  }

  try {
    let query = db.collection('matches').where({
      tournamentId: tournamentId
    })

    if (phase) {
      query = query.where({ phase })
    }

    if (status) {
      query = query.where({ status })
    }

    const res = await query
      .orderBy('matchTime', 'asc')
      .limit(pageSize)
      .get()

    // 补充球队名称
    const matches = res.data || []
    const teamIds = [...new Set([
      ...matches.map(m => m.homeTeamId),
      ...matches.map(m => m.awayTeamId)
    ].filter(Boolean))}

    let teamMap = {}
    if (teamIds.length > 0) {
      const teamRes = await db.collection('tournament_teams')
        .where({ _id: _.in(teamIds) })
        .get()
      teamMap = {}
      ;(teamRes.data || []).forEach(t => { teamMap[t._id] = t })
    }

    const list = matches.map(m => ({
      _id: m._id,
      tournamentId: m.tournamentId,
      phase: m.phase || 'league',   // group/league/cup/knockout
      matchTime: m.matchTime,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeTeamName: teamMap[m.homeTeamId]?.teamName || '',
      awayTeamName: teamMap[m.awayTeamId]?.teamName || '',
      homeScore: m.homeScore ?? null,
      awayScore: m.awayScore ?? null,
      status: m.status || 'pending',    // pending/ongoing/completed
      groupName: m.groupName || '',    // 小组赛组别
      round: m.round || '',          // 轮次（联赛第几轮）
      field: m.field || '',
      events: m.events || []            // 进球/黄牌/红牌/换人等事件
    }))

    return {
      success: true,
      data: list
    }
  } catch (err) {
    console.error('获取赛事比赛失败:', err)
    return {
      success: false,
      message: err.message || '获取失败'
    }
  }
}
