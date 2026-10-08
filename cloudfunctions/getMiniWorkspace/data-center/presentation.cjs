'use strict'
const id = value => String(value ?? '').trim()
const PLAYER_METRICS = ['goals','assists','appearances','starts','minutesPlayed','yellowCards','redCards']
const TEAM_METRICS = ['wins','goalsFor','goalsAgainst','yellowCards','redCards']
function table(rows, metric, valueOf) {
  const known=rows.filter(row=>Number.isFinite(valueOf(row))).sort((a,b)=>valueOf(b)-valueOf(a)||id(a.name).localeCompare(id(b.name),'zh-CN')||id(a.id).localeCompare(id(b.id)))
  let previous=null,rank=0
  return {metric,unverifiedCount:rows.length-known.length,rows:known.map((row,index)=>{const value=valueOf(row);if(value!==previous)rank=index+1;previous=value;return {...row,rank,value}})}
}
async function rankings(result) {
  const {sumPlayerRows}=await import('./statistics.mjs')
  const groups=new Map()
  for(const row of result.players||[]){if(!groups.has(row.playerId))groups.set(row.playerId,[]);groups.get(row.playerId).push(row)}
  const players=[...groups].map(([playerId,rows])=>({id:playerId,name:rows.find(row=>row.playerName)?.playerName||'历史球员',teamIds:[...new Set(rows.map(row=>row.teamId))],...sumPlayerRows(rows)}))
  const teamGroups=new Map()
  for(const row of result.teams||[]){if(!teamGroups.has(row.teamId))teamGroups.set(row.teamId,[]);teamGroups.get(row.teamId).push(row)}
  const teams=[...teamGroups].map(([teamId,rows])=>{const totals={};for(const metric of ['played','wins','goalsFor','goalsAgainst'])totals[metric]=rows.every(row=>Number.isFinite(row[metric]))?rows.reduce((n,row)=>n+row[metric],0):null;const participants=(result.players||[]).filter(row=>row.teamId===teamId);const cards=participants.length?sumPlayerRows(participants).metrics:{};totals.yellowCards=cards.yellowCards??null;totals.redCards=cards.redCards??null;return {id:teamId,name:rows[0].teamName||'历史球队',metrics:totals}})
  return {players:Object.fromEntries(PLAYER_METRICS.map(metric=>[metric,table(players,metric,row=>row.metrics[metric])])),teams:Object.fromEntries(TEAM_METRICS.map(metric=>[metric,table(teams,metric,row=>row.metrics[metric])])),teamTotals:teams}
}
async function journal({matches,events,actor,scope,context}) {
  const {effectiveEvents,eventType,matchOrigin,resultState}=await import('./statistics.mjs')
  const rows=[]
  for(const match of matches){
    const origin=matchOrigin(match,context)
    if(['test','test_player'].includes(origin))continue
    const state=origin==='unverified'?'unverified':resultState(match,context)
    const home=id(match.homeTeamId),away=id(match.awayTeamId),matchId=id(match._id||match.id)
    for(const [index,event] of effectiveEvents(match,events).entries()){
      const playerId=id(event.playerId||event.playerID||event.athleteId||event.player?._id||event.player?.id||event.inPlayerId)
      const teamId=id(event.teamId)||(event.teamSide==='home'?home:event.teamSide==='away'?away:'')
      if(scope.playerId&&![playerId,id(event.assistPlayerId),id(event.inPlayerId),id(event.outPlayerId)].includes(scope.playerId))continue
      if(scope.teamId&&teamId!==scope.teamId)continue
      if(!actor.platformOwner&&!(actor.tournamentIds||[]).includes(id(match.tournamentId))&&!(actor.teamIds||[]).includes(teamId))continue
      const profile=actor.public?null:context.playersById?.[playerId]
      rows.push({id:id(event.eventId||event.sourceEventId||event._id)||`${matchId}:${index}`,matchId,tournamentId:id(match.tournamentId),divisionId:id(match.divisionId||match.division||'default'),
        groupName:id(match.groupName||match.drawGroup||match.pool||match.group||match.groupCode)||'联赛',matchName:id(match.name)||`${id(match.homeTeamName||context.teamsById?.[home]?.name)||'主队'} vs ${id(match.awayTeamName||context.teamsById?.[away]?.name)||'客队'}`,
        teamId,teamName:id(context.teamsById?.[teamId]?.name||context.teamsById?.[teamId]?.teamName),playerId,playerName:id(event.playerName||event.player?.name||profile?.name),type:eventType(event),minute:event.minute??null,
        status:state,counted:state==='official'||(state==='provisional'&&scope.mode==='provisional'),revision:Number(event.revision||event.version||0),matchDate:match.matchDate||match.startTime||match.matchTime||null})
    }
  }
  return rows
}
module.exports={rankings,journal,PLAYER_METRICS,TEAM_METRICS}
