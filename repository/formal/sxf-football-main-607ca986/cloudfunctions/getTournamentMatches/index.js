const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

function eventScoreFromEvents(events) {
  const score = { home: 0, away: 0 }
  ;(Array.isArray(events) ? events : []).forEach(function (event) {
    const type = String(event && (event.type || event.eventType) || '').trim().toLowerCase()
    if (!['goal', 'penalty', 'penalty_scored', 'penalty_goal', 'own_goal', 'own-goal', 'og'].includes(type)) return
    let side = event && event.teamSide === 'away' ? 'away' : 'home'
    if (['own_goal', 'own-goal', 'og'].includes(type)) side = side === 'home' ? 'away' : 'home'
    score[side] = Math.min(99, score[side] + 1)
  })
  return score
}

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
    // 抽签确认后的待排对阵只供后台继续编排，不进入公开竞赛日程。
    const matches = (res.data || []).filter(m => !(m.pairingStatus === 'confirmed' && m.scheduleStatus !== 'scheduled' && !m.schedulePublished))
    const teamIds = [...new Set([
      ...matches.map(m => m.homeTeamId),
      ...matches.map(m => m.awayTeamId)
    ].filter(Boolean))]

    let teamMap = {}
    if (teamIds.length > 0) {
      const [teamRes, relationRes] = await Promise.all([
        db.collection('teams').where({ _id: _.in(teamIds) }).get(),
        db.collection('tournament_teams').where(_.and([{ tournamentId }, _.or([{ _id: _.in(teamIds) }, { teamId: _.in(teamIds) }])])).get()
      ])
      teamMap = {}
      ;(relationRes.data || []).forEach(t => { if (t._id) teamMap[t._id] = t; if (t.teamId) teamMap[t.teamId] = t })
      ;(teamRes.data || []).forEach(t => { teamMap[t._id] = t })
    }

    const list = matches.map(m => {
      const eventSeen = new Set()
      const events = (Array.isArray(m.events) ? m.events : []).map((event, index) => {
        if (!event || typeof event !== 'object') return null
        const rawType = String(event.type || event.eventType || '').trim().toLowerCase()
        const type = ({ score: 'goal', penalty_goal: 'penalty_scored', penalty_miss: 'penalty_missed', missed_penalty: 'penalty_missed', yellow: 'yellow_card', yellowcard: 'yellow_card', red: 'red_card', redcard: 'red_card', second_yellow: 'second_yellow_red', yellow_red: 'second_yellow_red' })[rawType] || rawType
        const teamSide = event.teamSide === 'away' || event.side === 'away' ? 'away' : 'home'
        const identity = String(event.eventId || event._id || event.id || '') || [type, Number(event.minute || 0), event.playerId || event.player || '', event.playerName || '', teamSide, event.penaltyOutcome || ''].join('|')
        if (eventSeen.has(identity)) return null
        eventSeen.add(identity)
        return { ...event, eventId: String(event.eventId || event._id || event.id || `legacy-${index}`), type, teamSide, teamId: String(event.teamId || (teamSide === 'away' ? m.awayTeamId : m.homeTeamId) || ''), playerId: String(event.playerId || event.player || ''), playerName: String(event.playerName || event.player || ''), assistPlayerId: String(event.assistPlayerId || event.assistId || ''), assistName: String(event.assistName || event.assist || '') }
      }).filter(Boolean).sort((a, b) => Number(a.minute || 0) - Number(b.minute || 0))
      const reviewStatus = String(m.resultReviewStatus || m.reviewStatus || m.refereeReviewStatus || '').toLowerCase()
      return {
      _id: m._id,
      tournamentId: m.tournamentId,
      phase: m.phase || 'league',   // group/league/cup/knockout
      matchTime: m.matchTime,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeTeamName: teamMap[m.homeTeamId]?.name || teamMap[m.homeTeamId]?.teamName || m.homeTeamName || '',
      awayTeamName: teamMap[m.awayTeamId]?.name || teamMap[m.awayTeamId]?.teamName || m.awayTeamName || '',
      homeTeamLogo: teamMap[m.homeTeamId]?.logoUrl || teamMap[m.homeTeamId]?.logo || teamMap[m.homeTeamId]?.teamLogo || m.homeTeamLogo || '',
      awayTeamLogo: teamMap[m.awayTeamId]?.logoUrl || teamMap[m.awayTeamId]?.logo || teamMap[m.awayTeamId]?.teamLogo || m.awayTeamLogo || '',
      homeScore: Array.isArray(m.events) && !m.resultCorrection ? eventScoreFromEvents(m.events).home : (m.homeScore ?? null),
      awayScore: Array.isArray(m.events) && !m.resultCorrection ? eventScoreFromEvents(m.events).away : (m.awayScore ?? null),
      status: m.status || 'pending',    // pending/ongoing/completed
      reviewStatus,
      official: ['approved', 'archived', 'official'].indexOf(reviewStatus) >= 0,
      groupName: m.groupName || '',
      round: m.round || '',
      field: m.field || '',
      events
      }
    })

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
