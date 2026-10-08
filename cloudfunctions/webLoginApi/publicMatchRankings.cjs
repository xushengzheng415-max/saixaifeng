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
  const result=await require('./data-center/service.cjs').createDataService(db).query({public:true,platformOwner:false,teamIds:[String(match.homeTeamId),String(match.awayTeamId)],tournamentIds:[tournamentId],matchIds:[matchId]},{tournamentId,matchId,mode:'official'})
  const rankings=result.rankings.players.goals.rows.filter(row=>row.value>0).map(row=>({id:row.id,name:row.name,team:row.teamIds.includes(String(match.homeTeamId))?published.homeName:published.awayName,goals:row.value}))
  const count=(teamId,metric)=>result.rankings.teams[metric].rows.find(row=>row.id===String(teamId))?.value??null
  const score=teamId=>result.teams.find(row=>row.teamId===String(teamId))?.goalsFor??null
  const metrics=[{label:'进球',home:score(match.homeTeamId),away:score(match.awayTeamId)},{label:'黄牌',home:count(match.homeTeamId,'yellowCards'),away:count(match.awayTeamId,'yellowCards')},{label:'红牌',home:count(match.homeTeamId,'redCards'),away:count(match.awayTeamId,'redCards')}]
  return { success:true,data:{ scope:result.scope,rankings,metrics,coverage:result.coverage,metricVersion:result.metricVersion,dataVersion:result.dataVersion } }
}
