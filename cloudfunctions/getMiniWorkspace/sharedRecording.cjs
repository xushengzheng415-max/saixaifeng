'use strict'
const crypto=require('crypto')
const str=value=>String(value==null?'':value).trim()
const pid=item=>str(typeof item==='string'?item:item && (item.playerId || item._id || item.id))
function revision(match) {return crypto.createHash('sha256').update(JSON.stringify([match.lineups || {},match.status,match.executionState,match.refereeRecordLocked,match.refereeRecord,Number(match.matchEventRevision || 0)])).digest('hex')}
async function pool(db,match,rows,doc,options={}) {
  const sides=options.side?[options.side]:['home','away']
  const groups=await Promise.all(sides.map(async side=>{
    const teamId=str(match[side+'TeamId'])
    const [allSnapshots,relations]=await Promise.all([rows(db,'roster_snapshots',{tournamentId:match.tournamentId,teamId},true),rows(db,'tournament_teams',{tournamentId:match.tournamentId,teamId})])
    const snapshots=allSnapshots.filter(item=>['approved','locked'].includes(str(item.status))&&(!match.divisionId||str(item.divisionId||'default')===str(match.divisionId)))
    snapshots.sort((a,b)=>Number(b.version||0)-Number(a.version||0))
    const current=(match.lineups||{})[side]||{},snapshot=snapshots[0]||{},people=[].concat(snapshot.players||[],snapshot.playerIds||[],current.players||[],current.starters||[],current.substitutes||[])
    for(const row of relations)if(['approved','confirmed','active','locked','accepted','claimed'].includes(str(row.status)))people.push(...(row.players||[]),...(row.playerIds||[]))
    return (await Promise.all([...new Set(people.map(pid).filter(Boolean))].map(async id=>{
      let player=people.find(item=>typeof item==='object'&&pid(item)===id&&(item.name||item.playerName));if(!player)player=await doc(db,'players',id)
      return !player||['deleted','archived'].includes(str(player.status))?null:{id,name:str(player.name||player.playerName),jerseyNumber:str(player.jerseyNumber??player.number),teamId,teamSide:side}
    }))).filter(Boolean)
  }))
  return [...new Map(groups.flat().map(item=>[item.teamSide+':'+item.id,item])).values()]
}
async function lineupRules(context) {
  const {db,match,doc}=context
  const [tournament,storedDivision]=await Promise.all([doc(db,'tournaments',match.tournamentId),match.divisionId&&match.divisionId!=='default'?doc(db,'divisions',match.divisionId):null])
  let division=storedDivision
  division=division || (tournament.divisions || []).find(row=>str(row._id || row.id)===str(match.divisionId)) || {}
  let format=str(match.matchFormat || division.matchFormat || division.playersPerSide || division.playerCount || tournament.matchFormat)
  const count=Number((format.match(/\d+/) || [])[0])
  if(!Number.isInteger(count) || count<3 || count>11) throw new Error('比赛人数未配置，请先在 PC 核对组别规则')
  const benchLimit=[match.benchPlayerLimit,division.benchPlayerLimit,tournament.benchPlayerLimit].find(value=>value!=null && str(value)!=='' && Number.isInteger(Number(value)) && Number(value)>=0)
  return {playersOnField:count,benchLimit:benchLimit==null?null:Number(benchLimit)}
}
async function makeLineups(context,selections,bench=context.event.bench || {}) {
  const {db,match,rows,doc}=context, players=await pool(db,match,rows,doc)
  const {playersOnField:count,benchLimit}=await lineupRules(context)
  const lineups={}
  for(const side of ['home','away']) {
    const ids=Array.isArray(selections && selections[side]) ? selections[side].map(str) : []
    if(ids.length!==count || new Set(ids).size!==ids.length) throw new Error('双方必须各选择 '+count+' 名首发')
    const own=players.filter(item=>item.teamSide===side)
    if(ids.some(id=>!own.some(player=>player.id===id))) throw new Error('首发必须来自本赛事有效名单或本场已保存阵容')
    const clean=player=>({playerId:player.id,id:player.id,name:player.name,jerseyNumber:player.jerseyNumber,number:player.jerseyNumber,teamId:player.teamId})
    const substituteIds=Array.isArray(bench[side]) ? bench[side].map(str) : []
    if(new Set(substituteIds).size!==substituteIds.length || substituteIds.some(id=>ids.includes(id) || !own.some(player=>player.id===id))) throw new Error('替补必须来自本队名单，且不能与首发重复')
    if(benchLimit!=null && substituteIds.length>Number(benchLimit)) throw new Error('替补人数超过本场规则上限')
    const formationRules=require('./sharedFormation.cjs'),requested=context.event.lineupLayout&&context.event.lineupLayout[side],previous=(match.lineups||{})[side]||{}
    let layout=null
    if(requested)layout=formationRules.validate(count,requested,ids)
    else if(formationRules.formationFor(count,previous.formation)){
      const validRoles=formationRules.formationFor(count,previous.formation).positions.map(row=>row.role),roles={},seen=new Set()
      for(const player of previous.players||[]){const id=pid(player);if(ids.includes(id)&&validRoles.includes(player.role)&&!seen.has(player.role)){roles[id]=player.role;seen.add(player.role)}}
      layout={formation:formationRules.normalizeId(count,previous.formation),roles}
    }
    lineups[side]={...(layout?{formation:layout.formation}:{}),players:ids.map(id=>({...clean(own.find(player=>player.id===id)),...(layout&&layout.roles[id]?{role:layout.roles[id]}:{})})),substitutes:substituteIds.map(id=>clean(own.find(player=>player.id===id)))}
  }
  return {lineups,players}
}
async function run(context) {
  if(['reportTicket','recognizeReport','confirmReport'].includes(String(context.event && context.event.operation || ''))) return require('./sharedPaperReport.cjs').run(context)
  const {db,cloud,identity,event,grant,match,relay,rows,doc,authorized}=context,operation=str(event.operation)
  const locked=match.refereeRecordLocked || match.refereeSubmittedAt || match.refereeReportSubmittedAt || match.executionState==='recording'
  if(locked) throw new Error('裁判已接管或电子记录已锁定，请通过赛果核查处理')
  if(['lineup','start'].includes(operation) && str(event.recordRevision)!==revision(match)) throw new Error('首发或比赛状态已更新，请重新打开比赛')
  if(operation==='lineup') {
    if(!['scheduled','pending','upcoming','checked_in','not_started',''].includes(str(match.status))) throw new Error('比赛已开始，不能覆盖首发阵容')
    const {lineups}=await makeLineups(context,event.starters)
    return relay(db,cloud,identity,grant,'updateMatch',{matchId:match._id,miniOperation:'lineup',miniRecordRevision:revision(match),data:{lineups}})
  }
  if(operation==='start') {
    if(!['scheduled','pending','upcoming','checked_in','not_started',''].includes(str(match.status))) throw new Error('比赛状态已变化，请刷新')
    const sides=match.lineups || {}
    await makeLineups(context,{home:(sides.home && sides.home.players || []).map(pid),away:(sides.away && sides.away.players || []).map(pid)},{home:(sides.home && sides.home.substitutes || []).map(pid),away:(sides.away && sides.away.substitutes || []).map(pid)})
    if((match.events || []).length) throw new Error('已有比赛事件，请先核对记录')
    return relay(db,cloud,identity,grant,'updateMatch',{matchId:match._id,miniOperation:'start',miniRecordRevision:revision(match),data:{status:'ongoing',events:[]}})
  }
  if(operation==='finish') {
    await authorized(db,identity,event,'event.results')
    return relay(db,cloud,identity,grant,'updateMatch',{matchId:match._id,miniOperation:'finish',action:'finishOrganizerMatch',expectedEventRevision:Number(event.revision),data:{status:'finished'}})
  }
  throw new Error('录入操作无效')
}
module.exports={run,pool,revision,lineupRules}
