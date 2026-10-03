'use strict'
const { readByIds } = require('./data-center/reader.cjs')
module.exports = async function publicMatchRankings(db, event, publicCenter) {
  const matchId = String(event.matchId || ''), tournamentId = String(event.tournamentId || '')
  if (!matchId || !tournamentId) throw new Error('请选择当前比赛')
  const center = await publicCenter()
  const published = (center.data && center.data.matches || []).find(row => String(row.id) === matchId && String(row.tournamentId) === tournamentId)
  if (!published) throw new Error('该比赛尚未公开')
  const matches = await readByIds(db,'matches','_id',[matchId])
  const match = matches.find(row => String(row.tournamentId) === tournamentId)
  if (!match) throw new Error('比赛记录不存在')
  const events = await readByIds(db,'match_events','matchId',[matchId])
  const { aggregateStatistics } = await import('./data-center/statistics.mjs')
  const result = aggregateStatistics({ matches:[{ ...match,homeScore:published.homeScore,awayScore:published.awayScore }],events,scope:{ tournamentId,matchId } })
  const rankings = result.players.filter(row => row.metrics.goals != null && row.metrics.goals > 0).map(row => ({ id:row.playerId, name:row.playerName, team:row.teamId === String(match.homeTeamId) ? published.homeName : published.awayName, goals:row.metrics.goals })).sort((a,b)=>b.goals-a.goals || a.name.localeCompare(b.name,'zh-CN'))
  function count(teamId, metric) { const rows = result.players.filter(row=>row.teamId===String(teamId)); return rows.length && rows.every(row=>row.metrics[metric]!=null) ? rows.reduce((sum,row)=>sum+row.metrics[metric],0) : null }
  const metrics = [{label:'进球',home:published.status==='upcoming'?null:published.homeScore,away:published.status==='upcoming'?null:published.awayScore},{label:'黄牌',home:count(match.homeTeamId,'yellowCards'),away:count(match.awayTeamId,'yellowCards')},{label:'红牌',home:count(match.homeTeamId,'redCards'),away:count(match.awayTeamId,'redCards')}]
  return { success:true,data:{ scope:result.scope,rankings,metrics,coverage:result.coverage,metricVersion:result.metricVersion,dataVersion:result.dataVersion } }
}
