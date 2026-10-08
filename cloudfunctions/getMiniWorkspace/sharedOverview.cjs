 'use strict'
const shared=require('./sharedEvents.cjs')
const {readAll,readByIds}=require('./data-center/reader.cjs')
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
  const all=canSchedule ? (await readAll(db,'matches',{tournamentId:tournament.id})).filter(row=>!row.deleted && !row.isDeleted && !synthetic(row) && !['deleted','removed'].includes(text(row.status))) : []
  const matches=all.filter(row=>!requested || text(row.divisionId)===requested)
  const teams=await readByIds(db,'teams','_id',matches.flatMap(row=>[row.homeTeamId,row.awayTeamId]))
  const byId=new Map(teams.map(row=>[text(row._id),row]))
  const divisionById=new Map(divisions.map(row=>[text(row._id),text(row.name || row.divisionName)]))
  let schedule=matches.map(row=>{
    const home=byId.get(text(row.homeTeamId)) || {},away=byId.get(text(row.awayTeamId)) || {}
    const raw=text(row.status).toLowerCase(),ended=['finished','completed','archived','cancelled','forfeited'].includes(raw)
    return {id:text(row._id),divisionId:text(row.divisionId),divisionName:divisionById.get(text(row.divisionId)) || text(row.divisionName),date:text(row.matchDate || row.date).slice(0,10),time:text(row.matchTime || row.time || row.startTime).slice(0,5),venue:text(row.venue || row.location),homeName:text(home.name || row.homeTeamName) || '主队待定',awayName:text(away.name || row.awayTeamName) || '客队待定',homeLogo:text(home.logoTransparent || home.logoUrl || home.logo || row.homeTeamLogo),awayLogo:text(away.logoTransparent || away.logoUrl || away.logo || row.awayTeamLogo),score:(ended || ['ongoing','live','in_progress','playing'].includes(raw)) && row.homeScore!=null && row.awayScore!=null ? row.homeScore+' : '+row.awayScore : 'VS',statusText:ended?'已结束':['ongoing','live','in_progress','playing'].includes(raw)?'进行中':'待开始',ended,canRecord:!ended && rights.has('event.matches'),canOpen:rights.has('event.matches') || rights.has('event.results'),mode:rights.has('event.matches')?'matches':'results'}
  }).sort((a,b)=>(a.date+' '+a.time).localeCompare(b.date+' '+b.time))
  let standings=[],standingsError='',standingsAllowed=rights.has('event.results') || rights.has('event.dashboard')
  if(standingsAllowed){
    try{
      const result=await require('./data-center/service.cjs').createDataService(db).query({teamIds:[],tournamentIds:[tournament.id],public:true},{tournamentId:tournament.id,...(requested?{divisionId:requested}:{}),mode:'official'})
      if((result.issues || []).some(issue=>issue.code==='DRAW_GROUP_UNRESOLVED'))standingsError='部分比赛分组待核对，未计入积分榜'
      standings=(result.standings || []).map(group=>({id:group.divisionId+':'+group.groupName,name:[group.divisionName,group.groupName].filter(Boolean).join(' · '),teams:group.officialTeams.map(team=>({id:team.teamId,name:team.teamName,rank:team.rank,played:team.played,points:team.points}))}))
    }catch(error){standingsError='积分榜读取失败，请下拉重试'}
  }
  const fileIds=[...new Set(schedule.flatMap(row=>[row.homeLogo,row.awayLogo]).filter(v=>v.startsWith('cloud://')))]
  const urls=new Map()
  for(let i=0;i<fileIds.length;i+=50){const result=await cloud.getTempFileURL({fileList:fileIds.slice(i,i+50)});(result.fileList || []).forEach(row=>{if(row.tempFileURL)urls.set(row.fileID,row.tempFileURL)})}
  schedule=schedule.map(row=>({...row,homeLogo:urls.get(row.homeLogo) || row.homeLogo,awayLogo:urls.get(row.awayLogo) || row.awayLogo}))
  return {success:true,tournament,divisions:[{id:'',name:'全部组别'},...divisions.map(row=>({id:text(row._id),name:text(row.name || row.divisionName) || '组别'}))],schedule,standings,standingsAllowed,standingsError,summary:{matchCount:canSchedule?matches.length:null,remaining:canSchedule?schedule.filter(row=>!row.ended).length:null,completed:canSchedule?schedule.filter(row=>row.ended).length:null}}
}
module.exports={overview}
