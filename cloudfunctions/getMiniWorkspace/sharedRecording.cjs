'use strict'
const crypto=require('crypto')
const str=value=>String(value==null?'':value).trim()
const pid=item=>str(typeof item==='string'?item:item && (item.playerId || item._id || item.id))
function revision(match) {return crypto.createHash('sha256').update(JSON.stringify([match.lineups || {},match.status,match.executionState,match.refereeRecordLocked,match.refereeRecord,Number(match.matchEventRevision || 0)])).digest('hex')}
async function pool(db,match,rows,doc) {
  const result=[]
  for(const side of ['home','away']) {
    const teamId=str(side==='home'?match.homeTeamId:match.awayTeamId)
    const snapshots=(await rows(db,'roster_snapshots',{tournamentId:match.tournamentId,teamId},true)).filter(item=>['approved','locked'].includes(str(item.status)) && (!match.divisionId || str(item.divisionId || 'default')===str(match.divisionId)))
    snapshots.sort((a,b)=>Number(b.version || 0)-Number(a.version || 0))
    const current=(match.lineups || {})[side] || {}
    const snapshot=snapshots[0] || {}
    const people=[].concat(snapshot.players || [],snapshot.playerIds || [],current.players || [],current.starters || [],current.substitutes || [])
    const relations=await rows(db,'tournament_teams',{tournamentId:match.tournamentId,teamId})
    for(const row of relations) if(['approved','confirmed','active','locked','accepted','claimed'].includes(str(row.status))) people.push(...(row.players || []),...(row.playerIds || []))
    for(const id of [...new Set(people.map(pid).filter(Boolean))]) {
      let player=people.find(item=>typeof item==='object' && pid(item)===id && (item.name || item.playerName))
      if(!player) player=await doc(db,'players',id)
      if(!player || ['deleted','archived'].includes(str(player.status))) continue
      result.push({id,name:str(player.name || player.playerName),jerseyNumber:str(player.jerseyNumber || player.number),teamId,teamSide:side})
    }
  }
  return [...new Map(result.map(item=>[item.teamSide+':'+item.id,item])).values()]
}
async function makeLineups(context,selections,bench=context.event.bench || {}) {
  const {db,match,rows,doc}=context, players=await pool(db,match,rows,doc)
  const tournament=await doc(db,'tournaments',match.tournamentId)
  let division=match.divisionId && match.divisionId!=='default' ? await doc(db,'divisions',match.divisionId) : null
  division=division || (tournament.divisions || []).find(row=>str(row._id || row.id)===str(match.divisionId)) || {}
  let format=str(match.matchFormat || division.matchFormat || division.playersPerSide || division.playerCount || tournament.matchFormat)
  const count=Number((format.match(/\d+/) || [])[0])
  if(!Number.isInteger(count) || count<3 || count>11) throw new Error('比赛人数未配置，请先在 PC 核对组别规则')
  const lineups={}
  for(const side of ['home','away']) {
    const ids=Array.isArray(selections && selections[side]) ? selections[side].map(str) : []
    if(ids.length!==count || new Set(ids).size!==ids.length) throw new Error('双方必须各选择 '+count+' 名首发')
    const own=players.filter(item=>item.teamSide===side)
    if(ids.some(id=>!own.some(player=>player.id===id))) throw new Error('首发必须来自本赛事有效名单或本场已保存阵容')
    const clean=player=>({playerId:player.id,id:player.id,name:player.name,jerseyNumber:player.jerseyNumber,teamId:player.teamId})
    const substituteIds=Array.isArray(bench[side]) ? bench[side].map(str) : []
    if(new Set(substituteIds).size!==substituteIds.length || substituteIds.some(id=>ids.includes(id) || !own.some(player=>player.id===id))) throw new Error('替补必须来自本队名单，且不能与首发重复')
    const benchLimit=[match.benchPlayerLimit,division.benchPlayerLimit,tournament.benchPlayerLimit].find(value=>value!=null && str(value)!=='' && Number.isInteger(Number(value)) && Number(value)>=0)
    if(benchLimit!=null && substituteIds.length>Number(benchLimit)) throw new Error('替补人数超过本场规则上限')
    lineups[side]={players:ids.map(id=>clean(own.find(player=>player.id===id))),substitutes:substituteIds.map(id=>clean(own.find(player=>player.id===id)))}
  }
  return {lineups,players}
}
async function run(context) {
  if(['reportTicket','recognizeReport','confirmReport'].includes(String(context.event && context.event.operation || ''))) throw new Error('裁判表识别等待接入 PC 百度智能云服务，请先使用手动录入')
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
  if(operation==='reportTicket') {
    if(!['scheduled','pending','upcoming','checked_in','not_started',''].includes(str(match.status)) || (match.events || []).length) throw new Error('已有比赛记录不能覆盖，请走赛果核查或事件补录')
    const path='match-result-evidence/'+grant.orgId+'/'+match._id+'/'+identity.user._id+'-'+crypto.randomBytes(16).toString('hex')+'.jpg'
    const record=await db.collection('match_report_imports').add({data:{tournamentId:grant.id,matchId:match._id,userId:identity.user._id,orgId:grant.orgId,path,status:'awaiting_upload',recordRevision:revision(match),revision:Number(match.matchEventRevision || 0),expiresAt:new Date(Date.now()+86400000),createTime:db.serverDate()}})
    return {success:true,id:record._id,path}
  }
  const draft=await doc(db,'match_report_imports',event.draftId)
  if(!draft || str(draft.userId)!==str(identity.user._id) || str(draft.matchId)!==str(match._id) || str(draft.tournamentId)!==grant.id || new Date(draft.expiresAt).getTime()<Date.now() || draft.status==='confirmed') throw new Error('识别草稿已失效，请重新上传')
  if(operation==='recognizeReport') {
    const fileId=str(event.fileId)
    if(!fileId.startsWith('cloud://') || !fileId.endsWith('/'+draft.path)) throw new Error('上传文件与本场识别任务不一致')
    const download=await cloud.downloadFile({fileID:fileId})
    if(!download.fileContent || download.fileContent.length>6*1024*1024) throw new Error('裁判表照片不得超过 6 MB')
    const result=await relay(db,cloud,identity,grant,'serviceMatchWorkflow',{action:'organizerRecognizeReport',miniOperation:'recognizeReport',matchId:match._id,imageBase64:download.fileContent.toString('base64')})
    await db.collection('match_report_imports').doc(draft._id).update({data:{status:'recognized',fileId,recognition:result.data,updateTime:db.serverDate()}})
    return result
  }
  if(operation==='confirmReport') {
    await authorized(db,identity,event,'event.results')
    if(draft.status!=='recognized' || !draft.fileId) throw new Error('请先上传并识别裁判表')
    if(str(draft.recordRevision)!==revision(match)) throw new Error('比赛或首发已变化，请重新上传裁判表核对')
    const scores=[event.homeScore,event.awayScore]
    if(scores.some(value=>value==null || str(value)==='' || !/^\d{1,2}$/.test(str(value)))) throw new Error('请核对双方 0 至 99 的整数比分')
    const {lineups,players}=await makeLineups(context,event.starters)
    const events=(Array.isArray(event.events)?event.events:[]).map(row=>{
      const player=players.find(item=>item.id===str(row.playerId) && item.teamSide===str(row.side)),minute=Number(row.minute),type=str(row.type)
      if(!player || str(row.minute)==='' || !Number.isInteger(minute) || minute<0 || minute>180 || !['goal','own_goal','yellow_card','red_card','penalty_scored','penalty_missed','substitution'].includes(type)) throw new Error('请核对每条事件的球队、球员、类型和分钟')
      const output={eventId:crypto.randomBytes(16).toString('hex'),type,minute,playerId:player.id,playerName:player.name,playerNumber:player.jerseyNumber,teamId:player.teamId,teamSide:player.teamSide}
      if(type==='substitution') { const out=players.find(item=>item.id===str(row.outPlayerId) && item.teamId===player.teamId && item.id!==player.id); if(!out) throw new Error('请核对换下球员'); Object.assign(output,{inPlayerId:player.id,outPlayerId:out.id,assistPlayerId:out.id,assistName:out.name,assistNumber:out.jerseyNumber}) }
      return output
    })
    const result=await relay(db,cloud,identity,grant,'updateMatch',{action:'importOrganizerReport',miniOperation:'import',miniRecordRevision:draft.recordRevision,matchId:match._id,expectedEventRevision:draft.revision,data:{lineups,events,status:'finished',homeScore:Number(scores[0]),awayScore:Number(scores[1]),organizerSupplementFiles:[draft.fileId]}})
    await db.collection('match_report_imports').doc(draft._id).update({data:{status:'confirmed',confirmedBy:identity.user._id,confirmedAt:db.serverDate()}})
    return result
  }
  throw new Error('录入操作无效')
}
module.exports={run,pool,revision}
