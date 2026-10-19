 'use strict'
const shared=require('./sharedEvents.cjs')
const {readAll,readByIds}=require('./data-center/reader.cjs')
const matchViews=require('./sharedMatchView.cjs')
const text=v=>String(v==null?'':v).trim()
async function overview(db,cloud,identity,event){
  const tournament=(await shared.list(db,identity.user._id)).find(row=>row.id===text(event.tournamentId))
  if(!tournament)throw new Error('共享授权已失效，请返回赛事列表')
  const rights=new Set(tournament.permissions)
  const canSchedule=['event.dashboard','event.matches','event.results'].some(right=>rights.has(right))
  const divisions=(await readAll(db,'divisions',{tournamentId:tournament.id})).filter(row=>!row.deleted && !row.isDeleted)
  const requested=text(event.divisionId)
  if(requested && !divisions.some(row=>text(row._id)===requested))throw new Error('竞赛组别不存在，请重新选择')
  const {synthetic}=await import('./data-center/statistics.mjs')
  const all=canSchedule ? (await readAll(db,'matches',{tournamentId:tournament.id})).filter(row=>matchViews.currentMatch(row) && !synthetic(row)) : []
  const matches=all.filter(row=>!requested || text(row.divisionId)===requested)
  const teams=await readByIds(db,'teams','_id',matches.flatMap(row=>[row.homeTeamId,row.awayTeamId]))
  const byId=new Map(teams.map(row=>[text(row._id),row]))
  const divisionById=new Map(divisions.map(row=>[text(row._id),text(row.name || row.divisionName)]))
  let schedule=matches.map(row=>{
    const item=matchViews.view(row,byId,divisionById),hasMatches=rights.has('event.matches'),hasResults=rights.has('event.results') && Boolean(item.resultState)
    return {...item,phase:text(row.phase || row.stageType || row.matchType).toLowerCase(),round:text(row.roundName || row.roundText || row.phaseName),groupName:text(row.groupName || row.drawGroup || row.pool || row.group || row.groupCode),statusText:item.status,ended:item.matchState==='finished',canRecord:hasMatches && !item.recordLocked && ['scheduled','live'].includes(item.matchState),canOpen:hasMatches || hasResults,mode:hasMatches?'matches':'results',actionText:hasMatches?item.matchAction:hasResults?(item.canReview?'复核赛果':'查看赛果'):'仅查看赛程'}
  }).sort((a,b)=>(a.date+' '+a.time).localeCompare(b.date+' '+b.time))
  let standings=[],scorers=[],discipline={players:[],teams:[]},standingsError='',standingsAllowed=rights.has('event.results') || rights.has('event.dashboard')
  if(standingsAllowed){
    try{
      const result=await require('./data-center/service.cjs').createDataService(db).query({teamIds:[],tournamentIds:[tournament.id],public:true},{tournamentId:tournament.id,...(requested?{divisionId:requested}:{}),mode:'official'})
      if((result.issues || []).some(issue=>issue.code==='DRAW_GROUP_UNRESOLVED'))standingsError='部分比赛分组待核对，未计入积分榜'
      standings=(result.standings || []).map(group=>({id:group.divisionId+':'+group.groupName,divisionId:text(group.divisionId),divisionName:text(group.divisionName),groupName:text(group.groupName),name:[group.divisionName,group.groupName].filter(Boolean).join(' · '),teams:group.officialTeams.map(team=>({id:team.teamId,name:team.teamName,rank:team.rank,played:team.played,points:team.points}))}))
      const teamName=teamId=>{const team=byId.get(teamId) || {};return text(team.name || team.teamName)}
      scorers=(result.players || []).filter(row=>Number(row.metrics && row.metrics.goals)>0).map(row=>({playerId:text(row.playerId),name:text(row.playerName) || '待核对球员',teamId:text(row.teamId),teamName:teamName(text(row.teamId)),divisionId:text(row.divisionId),goals:Number(row.metrics.goals)})).sort((a,b)=>b.goals-a.goals || a.name.localeCompare(b.name,'zh-CN'))
      const cardPlayers=(result.players || []).filter(row=>row.metrics && (Number(row.metrics.yellowCards)>0 || Number(row.metrics.redCards)>0)).map(row=>({playerId:text(row.playerId),name:text(row.playerName) || '待核对球员',teamId:text(row.teamId),teamName:teamName(text(row.teamId)),divisionId:text(row.divisionId),yellowCards:Number(row.metrics.yellowCards) || 0,redCards:Number(row.metrics.redCards) || 0})).sort((a,b)=>b.redCards-a.redCards || b.yellowCards-a.yellowCards || a.name.localeCompare(b.name,'zh-CN'))
      const cardTeamMap=new Map()
      cardPlayers.forEach(row=>{const team=cardTeamMap.get(row.teamId) || {teamId:row.teamId,name:teamName(row.teamId) || row.teamName,yellowCards:0,redCards:0};team.yellowCards+=row.yellowCards;team.redCards+=row.redCards;cardTeamMap.set(row.teamId,team)})
      discipline={players:cardPlayers,teams:[...cardTeamMap.values()].sort((a,b)=>b.redCards-a.redCards || b.yellowCards-a.yellowCards || a.name.localeCompare(b.name,'zh-CN'))}
    }catch(error){console.error('[sharedOverview] dataCenter query failed',error && error.code || '',error && error.message);standingsError='积分榜读取失败，请下拉重试'}
  }
  const fileIds=[...new Set(schedule.flatMap(row=>[row.homeLogo,row.awayLogo]).filter(v=>v.startsWith('cloud://')))]
  const urls=new Map()
  for(let i=0;i<fileIds.length;i+=50){const result=await cloud.getTempFileURL({fileList:fileIds.slice(i,i+50)});(result.fileList || []).forEach(row=>{if(row.tempFileURL)urls.set(row.fileID,row.tempFileURL)})}
  schedule=schedule.map(row=>({...row,homeLogo:urls.get(row.homeLogo) || row.homeLogo,awayLogo:urls.get(row.awayLogo) || row.awayLogo}))
  return {success:true,tournament,divisions:[{id:'',name:'全部组别'},...divisions.map(row=>({id:text(row._id),name:text(row.name || row.divisionName) || '组别'}))],schedule,standings,scorers,discipline,standingsAllowed,standingsError,summary:{matchCount:canSchedule?matches.length:null,remaining:canSchedule?schedule.filter(row=>!row.ended).length:null,completed:canSchedule?schedule.filter(row=>row.ended).length:null}}
}
module.exports={overview}
