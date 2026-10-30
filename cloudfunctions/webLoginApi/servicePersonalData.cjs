'use strict'
const crypto=require('crypto')
const {readAll,readByIds}=require('./data-center/reader.cjs')
const text=value=>typeof value==='string'?value.trim():''
const ids=values=>[...new Set(values.map(text).filter(Boolean))]
const fail=(code,error)=>({success:false,code,error})
const originFields={synthetic:true,isTest:true,syntheticDatasetId:true,syntheticKey:true,source:true,originType:true,dataKind:true}
const playerFields={...originFields,status:true,isDeleted:true,name:true,gender:true,birthDate:true,birthday:true,idCard:true,identityMasked:true,position:true,profileStatus:true,registrantType:true,participantType:true,teamId:true,teamCode:true,jerseyNumber:true,guardianUserId:true,playerUserId:true,linkedUserId:true,photoUrl:true,photoFileID:true,photoFileId:true,avatar:true,organizerReviewStatus:true,organizerReviewReason:true}
const refFields={...originFields,status:true,isDeleted:true,name:true,realName:true,level:true,avatarUrl:true,avatarFileId:true}
const ended=new Set(['finished','completed','ended'])
const removed=new Set(['archived','deleted','removed','replaced','cancelled','canceled','withdrawn','invite_cancelled'])
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
 // ============ 我的参赛资料 / 电子参赛证 ============
 const stamp=value=>{if(!value)return 0;if(typeof value==='number')return value;if(value instanceof Date)return value.getTime();const raw=value.$date||value._date||value;const result=new Date(raw).getTime();return Number.isFinite(result)?result:0}
 const lower=value=>text(value).toLowerCase()
 const ownValue=(source,key)=>Boolean(source&&Object.prototype.hasOwnProperty.call(source,key)&&source[key]!==undefined&&source[key]!==null&&source[key]!=='')
 const readBool=(sources,keys)=>{for(const source of sources||[])for(const key of keys||[])if(ownValue(source,key))return{defined:true,value:typeof source[key]==='string'?['true','1','on','yes','enabled'].includes(source[key].trim().toLowerCase()):Boolean(source[key])};return{defined:false,value:false}}
 function requirementsFor(tournament,division){
  const sources=[division,division&&division.rulesSnapshot,tournament]
  const identity=readBool(sources,['identityVerificationRequired','requiresRealName','requireRealName'])
  const insurance=readBool(sources,['insuranceRequired'])
  const electronicPass=readBool(sources,['electronicPassVerificationRequired'])
  return{identityVerificationRequired:identity.value,insuranceRequired:insurance.value,electronicPassVerificationRequired:electronicPass.value}
 }
 function readPurchaseUrl(sources){
  for(const source of sources||[]){
   if(!source||typeof source!=='object')continue
   for(const key of['insurancePurchaseUrl','insuranceBuyUrl','purchaseUrl']){
    const value=text(source[key])
    if(/^https?:\/\//i.test(value))return value
   }
   if(source.rulesSnapshot&&typeof source.rulesSnapshot==='object'){
    for(const key of['insurancePurchaseUrl','insuranceBuyUrl','purchaseUrl']){
     const value=text(source.rulesSnapshot[key])
     if(/^https?:\/\//i.test(value))return value
    }
   }
  }
  return ''
 }
 async function platformInsuranceLink(){
  try{
   const result=await db.collection('platform_settings').doc('insurance-purchase').get()
   const data=Array.isArray(result.data)?result.data[0]:result.data
   const url=text(data&&data.purchaseUrl)
   return{
    purchaseUrl:/^https?:\/\//i.test(url)?url:text(process.env.INSURANCE_PURCHASE_URL),
    purchaseLabel:text(data&&data.purchaseLabel)||'去购买保险'
   }
  }catch(error){
   return{purchaseUrl:text(process.env.INSURANCE_PURCHASE_URL),purchaseLabel:'去购买保险'}
  }
 }
 function rosterPlayerIds(row){const values=[];for(const field of['playerIds','players']){const list=row&&row[field];if(!Array.isArray(list))continue;for(const item of list)values.push(text(item&&typeof item==='object'?item.playerId||item.id||item._id:item))}return values.filter(Boolean)}
 function ageAt(birthDate,reference){const birth=new Date(text(birthDate));const date=new Date(reference||Date.now());if(!text(birthDate)||Number.isNaN(birth.getTime())||Number.isNaN(date.getTime()))return null;let age=date.getFullYear()-birth.getFullYear();const month=date.getMonth()-birth.getMonth();if(month<0||(month===0&&date.getDate()<birth.getDate()))age-=1;return age}
 function maskIdentity(player){if(text(player.identityMasked))return text(player.identityMasked);const raw=text(player.idCard);return raw.length>=7?raw.slice(0,3)+'***********'+raw.slice(-4):''}
 function registrationState(registration){return lower(registration&&registration.status)}
 const APPROVED_REG=new Set(['approved','confirmed','accepted','claimed','active'])
 const REJECTED_REG=new Set(['rejected','failed','invalid','cancelled','canceled','withdrawn','removed','deleted'])
 const LISTED_ROSTER=new Set(['approved','locked'])
 async function optionalRead(collection,where,fields){try{return await read(collection,where,fields)}catch(error){return[]}}
 async function participations(){
  const profiles=await players()
  if(!profiles.length)return{success:true,data:{schemaVersion:'service-personal/3',items:[]}}
  const teamIds=ids(profiles.flatMap(player=>[player.teamId,player.teamCode]))
  if(!teamIds.length)return{success:true,data:{schemaVersion:'service-personal/3',items:[]}}
  const registrations=(await read('tournament_teams',{teamId:_.in(teamIds)},{tournamentId:true,tournamentName:true,teamId:true,teamName:true,divisionId:true,division:true,divisionName:true,status:true,updateTime:true,createTime:true}))
    .filter(row=>!removed.has(lower(row.status)))
  if(!registrations.length)return{success:true,data:{schemaVersion:'service-personal/3',items:[]}}
  const tournamentIds=ids(registrations.map(row=>row.tournamentId)),divisionIds=ids(registrations.map(row=>row.divisionId||row.division))
  const playerIds=ids(profiles.map(row=>row._id))
  const [tournaments,divisions,snapshots,qualifications,certificates,teamRows,matchRows]=await Promise.all([
   byIds('tournaments',tournamentIds,{name:true,status:true,startDate:true,startTime:true,endDate:true,endTime:true,location:true,venue:true,region:true,divisionName:true,divisions:true,insuranceRequired:true,insurancePurchaseUrl:true,insuranceBuyUrl:true,purchaseUrl:true}),
   byIds('divisions',divisionIds,{name:true,divisionName:true,title:true,tournamentId:true,rulesSnapshot:true,identityVerificationRequired:true,requiresRealName:true,requireRealName:true,insuranceRequired:true,electronicPassVerificationRequired:true,insurancePurchaseUrl:true,insuranceBuyUrl:true,purchaseUrl:true}),
   read('roster_snapshots',{teamId:_.in(teamIds)},{tournamentId:true,teamId:true,divisionId:true,division:true,status:true,playerIds:true,players:true,version:true,updateTime:true,createTime:true,returnReason:true}),
   read('tournament_player_qualifications',{playerId:_.in(playerIds),tournamentId:_.in(tournamentIds)},{tournamentId:true,divisionId:true,playerId:true,status:true,identityVerificationId:true,insurance:true,insuranceReviewFlag:true,updateTime:true,createTime:true}),
   optionalRead('player_electronic_passes',{playerId:_.in(playerIds)},{playerId:true,status:true,certificateNumber:true,issuedAt:true}),
   byIds('teams',teamIds,{name:true,teamName:true,logoTransparent:true,transparentLogo:true,logoUrl:true,logo:true,teamLogo:true,logoFileId:true,logoFileID:true}),
   optionalRead('matches',{tournamentId:_.in(tournamentIds)},{tournamentId:true,divisionId:true,homeTeamId:true,awayTeamId:true,homeTeamName:true,awayTeamName:true,homeLineup:true,awayLineup:true,status:true,matchDate:true,matchTime:true,startTime:true})
  ])
  const verificationIds=ids(qualifications.map(row=>row.identityVerificationId))
  const verifications=verificationIds.length?await optionalRead('parent_identity_verifications',{_id:_.in(verificationIds)},{status:true}):[]
  const tournamentMap=new Map(tournaments.map(row=>[text(row._id),row]))
  const divisionMap=new Map(divisions.map(row=>[text(row._id),row]))
  const verificationMap=new Map(verifications.map(row=>[text(row._id),lower(row.status)]))
  const certificateMap=new Map(certificates.filter(row=>lower(row.status)==='active').map(row=>[text(row.playerId),row]))
  const teamMapExtra=new Map(teamRows.map(row=>[text(row._id),row]))
  const teamLogoRaw=id=>text((teamMapExtra.get(text(id))||{}).logoTransparent||(teamMapExtra.get(text(id))||{}).transparentLogo||(teamMapExtra.get(text(id))||{}).logoUrl||(teamMapExtra.get(text(id))||{}).logo||(teamMapExtra.get(text(id))||{}).teamLogo||(teamMapExtra.get(text(id))||{}).logoFileId||(teamMapExtra.get(text(id))||{}).logoFileID)
  const endedMatch=new Set(['finished','completed','ended','cancelled','canceled','archived'])
  // 2026-10-30 用户确认：成人动态码供助理裁判赛前资格审查随时扫，不要求已进阵容、不要求主裁判确认。
  const matchCandidatesFor=(tournamentId,teamId)=>matchRows.filter(row=>{
    if(text(row.tournamentId)!==tournamentId)return false
    if(endedMatch.has(lower(row.status)))return false
    const side=text(row.homeTeamId)===teamId?'home':(text(row.awayTeamId)===teamId?'away':'')
    return Boolean(side)
  }).sort((a,b)=>{
    const ta=[text(a.matchDate),text(a.matchTime||a.startTime)].join(' ')
    const tb=[text(b.matchDate),text(b.matchTime||b.startTime)].join(' ')
    return ta.localeCompare(tb)||text(a._id).localeCompare(text(b._id))
  }).map(row=>({
    matchId:text(row._id),
    teamsText:(text(row.homeTeamName)||'主队')+' vs '+(text(row.awayTeamName)||'客队'),
    timeText:[text(row.matchDate),text(row.matchTime||row.startTime)].filter(Boolean).join(' ')
  }))
  const qualificationsByPlayer=new Map()
  qualifications.forEach(row=>{const key=text(row.playerId);if(!qualificationsByPlayer.has(key))qualificationsByPlayer.set(key,[]);qualificationsByPlayer.get(key).push(row)})
  const divisionsByEventTeam=new Map()
  registrations.forEach(row=>{const key=text(row.tournamentId)+'|'+text(row.teamId);if(!divisionsByEventTeam.has(key))divisionsByEventTeam.set(key,new Set());divisionsByEventTeam.get(key).add(text(row.divisionId||row.division)||'default')})
  const stateMeta={approved:['已进入正式名单','ok'],reviewing:['名单待主办方审核','pending'],returned:['名单被退回，待球队修改','warn'],rejected:['主办方驳回','warn'],not_listed:['未进入正式名单','muted'],registered:['报名已通过，待提交名单','pending'],registration_pending:['报名待审核','pending'],registration_rejected:['报名未通过','warn']}
  const platformLink=await platformInsuranceLink()
  const items=[],seen=new Set()
  for(const profile of profiles){
   const playerTeamIds=new Set(ids([profile.teamId,profile.teamCode])),playerId=text(profile._id)
   for(const registration of registrations){
    if(!playerTeamIds.has(text(registration.teamId)))continue
    const tournamentId=text(registration.tournamentId),teamId=text(registration.teamId),divisionId=text(registration.divisionId||registration.division)||'default'
    const key=[playerId,tournamentId,teamId,divisionId].join('|')
    if(seen.has(key))continue
    seen.add(key)
    const tournament=tournamentMap.get(tournamentId)||{},registrationDivision=divisionMap.get(divisionId)||null
    const division=registrationDivision||((tournament.divisions||[]).find(item=>text(item&&(item.id||item._id))===divisionId)||null)
    const requirements=requirementsFor(tournament,division)
    const allowLegacy=(divisionsByEventTeam.get(tournamentId+'|'+teamId)||new Set()).size<=1
    const relatedSnapshots=snapshots.filter(row=>text(row.tournamentId)===tournamentId&&text(row.teamId)===teamId&&(text(row.divisionId||row.division)?text(row.divisionId||row.division)===divisionId:allowLegacy))
      .sort((a,b)=>stamp(b.updateTime||b.createTime)-stamp(a.updateTime||a.createTime))
    const snapshot=relatedSnapshots[0]||null
    const listed=Boolean(snapshot&&rosterPlayerIds(snapshot).includes(playerId))
    const rosterStatus=lower(snapshot&&snapshot.status)
    const review=lower(profile.organizerReviewStatus),reviewReason=text(profile.organizerReviewReason).slice(0,60)
    let stateValue='registration_pending'
    if(review==='rejected')stateValue='rejected'
    else if(listed){
      if(LISTED_ROSTER.has(rosterStatus))stateValue='approved'
      else if(rosterStatus==='returned')stateValue='returned'
      else stateValue='reviewing'
    }else if(snapshot&&rosterStatus==='returned')stateValue='returned'
    else if(snapshot)stateValue='not_listed'
    else if(APPROVED_REG.has(registrationState(registration)))stateValue='registered'
    else if(REJECTED_REG.has(registrationState(registration)))stateValue='registration_rejected'
    else stateValue='registration_pending'
    const divisionName=text(registration.divisionName)||text(division&&(division.name||division.divisionName||division.title))||text(tournament.divisionName)||'未分组'
    const registrationStatus=registrationState(registration)
    const registrationText=APPROVED_REG.has(registrationStatus)?'报名已通过':REJECTED_REG.has(registrationStatus)?'报名未通过':registrationStatus==='submitted'?'报名待审核':'报名待审核'
    const rosterText=!snapshot?'球队尚未提交名单':LISTED_ROSTER.has(rosterStatus)?'名单已审核':rosterStatus==='returned'?'名单已退回':rosterStatus==='submitted'||rosterStatus==='pending'?'名单待审核':listed?'已列入名单':'未列入本次名单'
    const qualificationRows=(qualificationsByPlayer.get(playerId)||[]).filter(row=>text(row.tournamentId)===tournamentId&&(text(row.divisionId)||'default')===divisionId).sort((a,b)=>stamp(b.updateTime||b.createTime)-stamp(a.updateTime||a.createTime))
    const qualification=qualificationRows[0]||null
    const verificationStatus=qualification&&text(qualification.identityVerificationId)?verificationMap.get(text(qualification.identityVerificationId))||'pending_review':''
    const identityRequired=requirements.identityVerificationRequired||requirements.electronicPassVerificationRequired
    const identityVerified=['approved','verified','complete','passed'].includes(verificationStatus)
    const identityText=!identityRequired?'未要求':identityVerified?'已通过':verificationStatus?'审核中':qualification?'待审核':'未提交'
    const insurancePayload=qualification&&qualification.insurance&&typeof qualification.insurance==='object'?qualification.insurance:null
    const insuranceSubmitted=Boolean(qualification&&lower(qualification.status)==='submitted'&&insurancePayload)
    const insuranceFlag=lower((insurancePayload&&insurancePayload.reviewFlag)||qualification&&qualification.insuranceReviewFlag||'')
    const insuranceReady=insuranceSubmitted&&insuranceFlag!=='needs_manual_review'
    const insuranceManual=insuranceSubmitted&&insuranceFlag==='needs_manual_review'
    const insuranceText=!requirements.insuranceRequired?'本赛事未要求保险':insuranceReady?'保险资料已提交':insuranceManual?'已提交，待人工核对':'保险资料待提交'
    const insuranceTone=!requirements.insuranceRequired?'muted':insuranceReady?'ok':insuranceManual?'pending':'warn'
    const insuranceState=!requirements.insuranceRequired?'not_required':insuranceReady?'submitted':insuranceManual?'manual_review':'pending'
    const insuranceCanUpload=requirements.insuranceRequired&&(!insuranceSubmitted||insuranceManual)
    const purchaseUrl=readPurchaseUrl([division,tournament])||(requirements.insuranceRequired?platformLink.purchaseUrl:'')
    const purchaseLabel=text(platformLink.purchaseLabel)||'去购买保险'
    const birthDate=text(profile.birthDate||profile.birthday),photoUrl=text(profile.photoUrl||profile.photoFileID||profile.photoFileId||profile.avatar),identityMasked=maskIdentity(profile)
    const eventStart=text(tournament.startDate||tournament.startTime)
    const registrantType=lower(profile.registrantType)
    const age=ageAt(birthDate,eventStart||Date.now())
    const youth=registrantType==='guardian'||lower(profile.participantType)==='youth'||(age!=null&&age<18)
    const mode=age==null&&registrantType!=='guardian'?'unknown':(youth?'youth':'adult')
    const certificate=certificateMap.get(playerId)||null
    const passEligible=stateValue==='approved'&&(!identityRequired||identityVerified)
    const stateText=stateMeta[stateValue]?stateMeta[stateValue][0]:'状态待确认'
    let passText=passEligible?'可出示':stateValue==='approved'?'需先完成本赛事人证核验':stateValue==='rejected'?'资料被驳回，暂不可用':stateValue==='not_listed'?'未进入正式名单':'正式名单通过后可出示'
    if(passEligible&&mode==='youth')passText='可出示 · 现场按照片核验'
    if(passEligible&&mode==='unknown')passText='可出示 · 出生日期待补'
    const reason=review==='rejected'?reviewReason:(stateValue==='returned'?text(snapshot&&snapshot.returnReason).slice(0,60):'')
    items.push({
      id:key,playerId,playerName:text(profile.name)||'球员',relation:text(profile.playerUserId||profile.linkedUserId)===uid?'self':'guardian',
      photoUrl,gender:text(profile.gender),birthDate,identityMasked,jerseyNumber:profile.jerseyNumber==null?'':String(profile.jerseyNumber),position:text(profile.position),
      tournamentId,tournamentName:text(tournament.name||registration.tournamentName)||'赛事',eventStatus:lower(tournament.status),startDate:eventStart,endDate:text(tournament.endDate||tournament.endTime),venue:text(tournament.location||tournament.venue||tournament.region),
      divisionId,divisionName,teamId,teamName:text(registration.teamName)||'球队',
      registrationStatus,registrationStatusText:registrationText,rosterStatus,rosterStatusText:rosterText,rosterVersion:snapshot&&snapshot.version!=null?Number(snapshot.version):null,
      state:stateValue,stateText,stateTone:stateMeta[stateValue]?stateMeta[stateValue][1]:'muted',reason,
      materials:[
        {key:'name',label:'姓名',value:text(profile.name)||'待补',state:text(profile.name)?'ok':'warn'},
        {key:'birthDate',label:'出生日期',value:birthDate||'待补',state:birthDate?'ok':'warn'},
        {key:'identity',label:'证件信息',value:identityMasked||'未登记',state:identityMasked?'ok':'warn'},
        {key:'photo',label:'形象照',value:photoUrl?'已上传':'待补',state:photoUrl?'ok':'warn'},
        {key:'jersey',label:'球衣号',value:profile.jerseyNumber==null||profile.jerseyNumber===''?'待定':String(profile.jerseyNumber),state:profile.jerseyNumber==null||profile.jerseyNumber===''?'pending':'ok'},
        {key:'identityCheck',label:'人证核验',value:identityText,state:!identityRequired?'muted':identityVerified?'ok':qualification?'pending':'warn'},
        {key:'insurance',label:'保险资料',value:insuranceText,state:!requirements.insuranceRequired?'muted':insuranceReady?'ok':insuranceManual?'pending':'warn',actionable:insuranceCanUpload}
      ],
      teamLogoUrl:teamLogoRaw(teamId),
      insurance:{required:requirements.insuranceRequired,ready:insuranceReady,canUpload:insuranceCanUpload,state:insuranceState,text:insuranceText,tone:insuranceTone,matchResult:insurancePayload?text(insurancePayload.matchResult):'',reviewFlag:insuranceFlag,policyNo:insurancePayload?text(insurancePayload.policyNo):'',productType:insurancePayload?text(insurancePayload.productType):'',coverStart:insurancePayload?text(insurancePayload.coverStart):'',coverEnd:insurancePayload?text(insurancePayload.coverEnd):'',message:insurancePayload?text(insurancePayload.message):'',disclaimer:insurancePayload?text(insurancePayload.disclaimer):'平台仅核验保单文字与赛事要求，不替代保险公司承保确认。',purchaseUrl,purchaseLabel:purchaseUrl?purchaseLabel:'',uploaderHint:mode==='youth'?'请由监护人上传保单 PDF':'请由球员本人上传保单 PDF'},
      pass:{eligible:passEligible,stateText:passText,mode,number:certificate?text(certificate.certificateNumber):'',issuedAt:certificate&&certificate.issuedAt?certificate.issuedAt:null,
        note:mode==='youth'?'青少年现场不扫码，由助理裁判按照片逐人核验。':mode==='unknown'?'出生日期缺失，暂不能确认证件类型，请先补齐资料。':'成人电子参赛证；进入正式名单后可随时刷新动态签名二维码，供第二/第三助理裁判现场扫码做资格审查，扫码后仍须当面核对照片。',
        qr:(()=>{
          if(mode==='youth')return{status:'not_applicable',reason:'青少年现场按名单核验，不使用二维码',matches:[]}
          if(!passEligible)return{status:'locked',reason:passText,matches:[]}
          const matches=matchCandidatesFor(tournamentId,teamId).slice(0,5)
          if(matches.length)return{status:'ready',reason:'点击即可刷新，供助理裁判现场扫码',matches}
          return{status:'waiting_schedule',reason:'本队赛程公布后即可生成动态码，供助理裁判扫码核验',matches:[]}
        })()}
    })
   }
  }
  items.sort((a,b)=>text(b.startDate).localeCompare(text(a.startDate))||a.playerName.localeCompare(b.playerName)||a.tournamentName.localeCompare(b.tournamentName))
  const crestAssets=items.map(row=>({logo:row.teamLogoUrl||'',avatar:row.photoUrl||''}))
  await assets(crestAssets)
  items.forEach((row,i)=>{row.teamLogoUrl=crestAssets[i].logo||'';row.photoUrl=crestAssets[i].avatar||row.photoUrl||''})
  return{success:true,data:{schemaVersion:'service-personal/4',items}}
 }

 async function adultMatchPass(event){
  const matchId=text(event.matchId),playerId=text(event.playerId)
  if(!matchId||!playerId)return fail('ADULT_PASS_CONTEXT_REQUIRED','缺少比赛或球员信息')
  const secret=String(process.env.SXF_MATCH_PASS_SECRET||'').trim()
  if(!secret)return fail('MATCH_PASS_SECRET_MISSING','电子参赛证签名尚未配置，请联系管理员')
  const profiles=await players()
  const profile=profiles.find(row=>text(row._id)===playerId)
  if(!profile)return fail('SERVICE_PRIVATE_FORBIDDEN','无权调取该球员参赛证')
  const match=(await byIds('matches',[matchId],{tournamentId:true,divisionId:true,homeTeamId:true,awayTeamId:true,homeTeamName:true,awayTeamName:true,homeLineup:true,awayLineup:true,status:true,matchDate:true,matchTime:true,startTime:true}))[0]
  if(!match)return fail('ADULT_PASS_NOT_FOUND','比赛不存在')
  const tournament=(await byIds('tournaments',[text(match.tournamentId)],{name:true,identityVerificationRequired:true,requiresRealName:true,requireRealName:true,electronicPassVerificationRequired:true,insuranceRequired:true,divisions:true}))[0]||{}
  const division=text(match.divisionId)?(await byIds('divisions',[text(match.divisionId)],{rulesSnapshot:true,identityVerificationRequired:true,requiresRealName:true,requireRealName:true,electronicPassVerificationRequired:true,insuranceRequired:true}))[0]:null
  const requirements=requirementsFor(tournament,division)
  const registrantType=lower(profile.registrantType)
  const age=ageAt(text(profile.birthDate||profile.birthday),text(tournament.startDate||tournament.startTime)||Date.now())
  const youth=registrantType==='guardian'||lower(profile.participantType)==='youth'||(age!=null&&age<18)
  if(youth)return fail('YOUTH_PASS_NO_QR','青少年现场按名单核验，不签发动态二维码')
  const teamId=text(profile.teamId||profile.teamCode)
  const side=text(match.homeTeamId)===teamId?'home':(text(match.awayTeamId)===teamId?'away':'')
  if(!side)return fail('PLAYER_NOT_IN_MATCH_TEAM','球员所属球队不参加本场比赛')
  // 助理裁判赛前资格审查：进入正式名单即可扫，不要求本场阵容或主裁判确认。
  const divisionId=text(match.divisionId)||'default'
  const snapshots=await read('roster_snapshots',{tournamentId:text(match.tournamentId),teamId},{divisionId:true,division:true,status:true,playerIds:true,players:true,updateTime:true,createTime:true})
  const related=snapshots.filter(row=>!text(row.divisionId||row.division)||text(row.divisionId||row.division)===divisionId).sort((a,b)=>stamp(b.updateTime||b.createTime)-stamp(a.updateTime||a.createTime))
  const snapshot=related[0]
  const rosterIds=[]
  if(snapshot){for(const field of['playerIds','players']){const list=snapshot[field];if(!Array.isArray(list))continue;for(const item of list)rosterIds.push(text(item&&typeof item==='object'?item.playerId||item.id||item._id:item))}}
  if(!(snapshot&&['approved','locked'].includes(lower(snapshot.status))&&rosterIds.includes(playerId)))return fail('ROSTER_REQUIRED','请先进入本赛事正式名单后再出示动态码')
  const qualificationRows=(await read('tournament_player_qualifications',{tournamentId:text(match.tournamentId),divisionId,playerId},{status:true,identityVerificationId:true,updateTime:true,createTime:true}))
    .sort((a,b)=>stamp(b.updateTime||b.createTime)-stamp(a.updateTime||a.createTime))
  const qualification=qualificationRows[0]
  const identityRequired=requirements.identityVerificationRequired||requirements.electronicPassVerificationRequired
  const verificationId=qualification&&text(qualification.identityVerificationId)
  if(identityRequired){
    if(!verificationId)return fail('PLAYER_IDENTITY_REQUIRED','请先完成本赛事的人证核验')
    const ver=(await optionalRead('parent_identity_verifications',{_id:verificationId},{status:true}))[0]
    if(!['approved','verified','complete','passed'].includes(lower(ver&&ver.status)))return fail('PLAYER_IDENTITY_REQUIRED','请先完成本赛事的人证核验')
  }
  for(const name of ['player_electronic_passes','adult_match_passes']){try{await db.createCollection(name)}catch(error){}}
  let certificate=(await optionalRead('player_electronic_passes',{playerId,status:'active'},{certificateNumber:true,status:true}))[0]
  if(!certificate){
    const number='SXF-'+Date.now().toString(36).toUpperCase()+'-'+playerId.slice(-5).toUpperCase()
    const added=await db.collection('player_electronic_passes').add({data:{sport:'football',playerId,ownerUserId:uid,certificateNumber:number,status:'active',issuedAt:db.serverDate(),source:'service_account_h5',createTime:db.serverDate(),updateTime:db.serverDate()}})
    certificate={_id:added._id,certificateNumber:number,status:'active'}
  }
  // 每次点击重新签发，旧码立即失效。
  const oldPasses=await optionalRead('adult_match_passes',{matchId,playerId,status:'active'},{status:true})
  for(const oldPass of oldPasses){
    try{await db.collection('adult_match_passes').doc(text(oldPass._id)).update({data:{status:'revoked',revokedAt:db.serverDate(),revokeReason:'refresh',updateTime:db.serverDate()}})}catch(error){}
  }
  const passId=crypto.randomBytes(12).toString('base64url'),expiresAt=new Date(Date.now()+6*60*60*1000)
  await db.collection('adult_match_passes').doc(passId).set({data:{sport:'football',matchId,playerId,teamId,side,certificateId:text(certificate._id),status:'active',expiresAt,issuedByUserId:uid,purpose:'assistant_qualification_scan',createTime:db.serverDate(),updateTime:db.serverDate()}})
  const pass={_id:passId,expiresAt}
  const token='SXFMP1.'+text(pass._id)+'.'+crypto.createHmac('sha256',secret).update('football:adult-match-pass:'+text(pass._id)).digest('base64url').slice(0,32)
  let qrUrl=''
  try{
    const qr=await cloud.callFunction({name:'generateQRCode',data:{type:'adult_match_pass',passId:text(pass._id),passToken:token,width:520}})
    const body=qr&&qr.result||qr||{}
    qrUrl=text(body.data&&body.data.tempUrl)
    if(!body.success)return fail(body.code||'QR_GENERATE_FAILED',body.message||body.error||'动态二维码生成失败')
  }catch(error){
    return fail('QR_GENERATE_FAILED',error&&error.message||'动态二维码生成失败')
  }
  return{success:true,data:{
    certificate:{id:text(certificate._id),number:text(certificate.certificateNumber)},
    matchPass:{id:text(pass._id),expiresAt:pass.expiresAt||pass.expireAt||null,qrUrl},
    match:{id:matchId,teamsText:(text(match.homeTeamName)||'主队')+' vs '+(text(match.awayTeamName)||'客队'),timeText:[text(match.matchDate),text(match.matchTime||match.startTime)].filter(Boolean).join(' ')},
    player:{id:playerId,name:text(profile.name)||'球员',jerseyNumber:profile.jerseyNumber==null?'':String(profile.jerseyNumber)}
  }}
 }
 return {handle:async(action,event)=>{
  if(action==='servicePrivateOverview')return overview()
  if(action==='servicePrivatePlayerData')return playerData(event)
  if(action==='servicePrivateRefereeData')return refereeData()
  if(action==='servicePrivateParticipation')return participations()
  if(action==='servicePrivateAdultMatchPass')return adultMatchPass(event)
  return fail('SERVICE_PRIVATE_ACTION_INVALID','操作不可用，请重新打开')
 }}
}
