'use strict'
const {readAll,readByIds}=require('./data-center/reader.cjs')
const text=value=>typeof value==='string'?value.trim():''
const ids=values=>[...new Set(values.map(text).filter(Boolean))]
const fail=(code,error)=>({success:false,code,error})
const originFields={synthetic:true,isTest:true,syntheticDatasetId:true,syntheticKey:true,source:true,originType:true,dataKind:true}
const playerFields={...originFields,status:true,isDeleted:true,name:true,teamId:true,teamCode:true,jerseyNumber:true,guardianUserId:true,playerUserId:true,linkedUserId:true,photoUrl:true,photoFileID:true,photoFileId:true,avatar:true}
const refFields={...originFields,status:true,isDeleted:true,name:true,realName:true,level:true,avatarUrl:true,avatarFileId:true}
const ended=new Set(['finished','completed','ended'])
const removed=new Set(['archived','deleted','removed','replaced','cancelled','canceled'])
module.exports=function createPersonalData({cloud,db,user,dataService}){
 const uid=text(user._id),phone=text(user.phone||user.phoneNumber),_=db.command
 const read=(collection,where,fields)=>readAll(db,collection,where,{fields,maxRows:5000})
 const byIds=(collection,values,fields)=>readByIds(db,collection,'_id',values,{fields,maxRows:5000})
 async function live(rows){const {synthetic}=await import('./data-center/statistics.mjs');return rows.filter(row=>row.isDeleted!==true&&!removed.has(text(row.status))&&!synthetic(row))}
 async function players(){return live(await read('players',_.or([{guardianUserId:uid},{playerUserId:uid},{linkedUserId:uid}]),playerFields))}
 async function referees(){return live((await read('referees',_.or([{phone},{phoneNumber:phone}]),refFields)).filter(row=>!row.status||row.status==='approved'))}
 async function assets(entries){
  const files=ids(entries.flatMap(row=>[row.avatar,row.logo])).filter(value=>value.startsWith('cloud://')),urls=new Map()
  for(let i=0;i<files.length;i+=50){const result=await cloud.getTempFileURL({fileList:files.slice(i,i+50)});for(const file of result.fileList||[])if(file.tempFileURL)urls.set(file.fileID,file.tempFileURL)}
  for(const row of entries)for(const field of ['avatar','logo'])if(text(row[field]).startsWith('cloud://'))row[field]=urls.get(row[field])||''
 }
 async function playerList(rows){
  const teams=await live(await byIds('teams',ids(rows.map(row=>row.teamId||row.teamCode)),{...originFields,name:true,teamName:true,status:true,isDeleted:true}))
  const names=new Map(teams.map(row=>[row._id,text(row.name||row.teamName)]))
  const knownTeams=new Set(teams.map(row=>row._id))
  const result=rows.filter(row=>!text(row.teamId)||knownTeams.has(text(row.teamId))).map(row=>({id:row._id,name:text(row.name),teamName:names.get(text(row.teamId||row.teamCode))||'',jerseyNumber:row.jerseyNumber==null?'':String(row.jerseyNumber),avatar:text(row.photoFileID||row.photoFileId||row.photoUrl||row.avatar),relation:row.playerUserId===uid||row.linkedUserId===uid?'self':'guardian'}))
  await assets(result);return result
 }
 async function overview(){
  const [profiles,refs]=await Promise.all([players(),referees()])
  const entries=await playerList(profiles)
  const referee=refs.length?{name:text(refs[0].name||refs[0].realName),level:text(refs[0].level),avatar:text(refs[0].avatarFileId||refs[0].avatarUrl)}:null
  if(referee)await assets([referee])
  return {success:true,data:{schemaVersion:'service-personal/2',players:entries,hasReferee:refs.length>0,referee,phoneMasked:phone.slice(0,3)+'****'+phone.slice(-4)}}
 }
 async function matches(values){
  const rows=await live(await byIds('matches',ids(values)))
  const [teams,events]=await Promise.all([byIds('teams',ids(rows.flatMap(row=>[row.homeTeamId,row.awayTeamId]))),byIds('tournaments',ids(rows.map(row=>row.tournamentId)))])
  const teamMap=new Map(teams.map(row=>[row._id,row])),eventMap=new Map(events.map(row=>[row._id,row]))
  const {synthetic}=await import('./data-center/statistics.mjs')
  const valid=rows.filter(row=>!synthetic(teamMap.get(row.homeTeamId))&&!synthetic(teamMap.get(row.awayTeamId))&&!synthetic(eventMap.get(row.tournamentId)))
  const number=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null
  return valid.map(row=>({id:row._id,tournamentName:text(eventMap.get(row.tournamentId)?.name),homeName:text(teamMap.get(row.homeTeamId)?.name||row.homeTeamName)||'主队',awayName:text(teamMap.get(row.awayTeamId)?.name||row.awayTeamName)||'客队',status:text(row.status),homeScore:number(row.homeScore??row.scoreHome),awayScore:number(row.awayScore??row.scoreAway),matchDate:text(row.matchDate||row.date),matchTime:text(row.matchTime||row.time),venue:text(row.venue||row.venueName||row.location)})).sort((a,b)=>(b.matchDate+' '+b.matchTime).localeCompare(a.matchDate+' '+a.matchTime)||a.id.localeCompare(b.id))
 }
 async function playerData(event){
  const profile=(await players()).find(row=>row._id===text(event.playerId))
  if(!profile)return fail('SERVICE_PRIVATE_FORBIDDEN','该球员档案已失效或无权查看，请返回刷新')
  const display=(await playerList([profile]))[0]
  if(!display)return fail('SERVICE_PRIVATE_FORBIDDEN','该球员档案暂不可查看')
  // This canonical career capability is issued only after the exact self/guardian check.
  // Do not return the service dataset or its other players, standings or identity fields.
  const service=dataService||require('./data-center/service.cjs').createDataService(db)
  const result=await service.query({platformOwner:true},{playerId:profile._id,mode:'official'})
  const rows=(result.players||[]).filter(row=>row.playerId===profile._id)
  const matchIds=ids(rows.flatMap(row=>row.matchIds||[]).concat(result.coverage?.playerCardMatchIds?.[profile._id]||[]))
  const records=(result.records||[]).filter(row=>row.playerId===profile._id&&matchIds.includes(row.matchId)).map(row=>({matchId:row.matchId,type:row.type,minute:row.minute??null,status:row.status,counted:row.counted===true}))
  const total=result.playerTotal||{}
  return {success:true,data:{player:display,metrics:total.metrics||{},coverage:total.coverage||{},dataVersion:result.dataVersion,metricVersion:result.metricVersion,matches:await matches(matchIds),events:records}}
 }
 async function refereeData(){
  const refs=await referees(),refIds=ids(refs.map(row=>row._id))
  if(!refIds.length)return fail('SERVICE_PRIVATE_FORBIDDEN','当前账号没有有效裁判档案')
  const assignments=await readByIds(db,'match_referees','refereeId',refIds,{maxRows:5000})
  const accepted=assignments.filter(row=>!['revoked','removed','cancelled','rejected','pending'].includes(text(row.status))&&(row.canOperate===true||['approved','accepted','assigned','completed','finished'].includes(text(row.status))))
  const roleLabels={main:'主裁判',mainReferee:'主裁判',referee:'主裁判',head_referee:'主裁判',assistant1:'第一助理裁判',assistant2:'第二助理裁判',assistant_referee_1:'第一助理裁判',assistant_referee_2:'第二助理裁判',fourth:'第四官员',fourthOfficial:'第四官员',fourth_official:'第四官员'}
  const list=await matches(accepted.map(row=>row.matchId))
  for(const match of list)match.roles=ids(accepted.filter(row=>row.matchId===match.id).map(row=>text(row.roleLabel)||roleLabels[text(row.role)]||'裁判'))
  return{success:true,data:{referee:{name:text(refs[0].name||refs[0].realName),level:text(refs[0].level)},summary:{total:list.length,completed:list.filter(row=>ended.has(row.status)).length,upcoming:list.filter(row=>!ended.has(row.status)).length},matches:list,workbenchUrl:'./?entry=workbench'}}
 }
 return {handle:async(action,event)=>{
  if(action==='servicePrivateOverview')return overview()
  if(action==='servicePrivatePlayerData')return playerData(event)
  if(action==='servicePrivateRefereeData')return refereeData()
  return fail('SERVICE_PRIVATE_ACTION_INVALID','操作不可用，请重新打开')
 }}
}
