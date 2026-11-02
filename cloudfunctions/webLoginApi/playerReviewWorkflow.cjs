'use strict'
const crypto=require('crypto')
const {readAll,readByIds}=require('./data-center/reader.cjs')
const {resolveNativePlace}=require('./data-center/idcard-region.cjs')
const {editableImportedProfile}=require('./playerCorrectionValidation.cjs')
const text=v=>String(v==null?'':v).trim()
const unique=a=>[...new Set(a.map(text).filter(Boolean))]
const claims=p=>unique([p.guardianUserId,p.playerUserId,p.linkedUserId])
const removed=r=>r.isDeleted===true||['deleted','archived','cancelled','withdrawn','removed','rejected','replaced','invite_cancelled'].includes(text(r.status))
const snapshotIds=s=>unique([].concat(s.playerIds||[],(s.players||[]).map(p=>p.playerId||p.id||p._id)))
const fail=(code,error)=>({success:false,code,error})
const taskUrl=id=>'https://www.sxffootball.cn/service-account-h5/player-review.html?task='+encodeURIComponent(id)
const jsonDoc=r=>Array.isArray(r.data)?r.data[0]:r.data
module.exports=function createWorkflow({cloud,db,secret}){
 const read=(c,w,f)=>readAll(db,c,w,{fields:f,maxRows:10000})
 const get=async(c,id)=>{try{return jsonDoc(await db.collection(c).doc(id).get())}catch(e){if(/not exist|not found/i.test(e.message||''))return null;throw e}}
 async function managers(team){
  const rows=await read('team_memberships',{teamId:team._id})
  return unique([team.ownerId,team.ownerUserId,...rows.filter(m=>{
   const roles=[].concat(m.roles||[],m.role||[],m.positions||[],m.position||[]).map(text)
   return ['active','accepted','claimed'].includes(text(m.status))&&(roles.some(r=>['owner','team_owner','team_admin','team_manager','manager','admin'].includes(r))||(Array.isArray(m.permissions)?m.permissions.includes('team.manage'):m.permissions&&m.permissions['team.manage']===true))
  }).map(m=>m.userId||m.memberUserId)])
 }
 async function players(teamId){const all=await read('players',db.command.or([{teamId},{teamCode:teamId}]));return all.filter(p=>!removed(p))}
 async function deliver(task){
  const timestamp=Date.now(),nonce=crypto.randomBytes(16).toString('hex')
  if(!secret)return {status:'configuration_required',error:'服务号签名未配置；站内通知已创建'}
  const proof=crypto.createHmac('sha256',secret).update(['playerReviewTask',task._id,timestamp,nonce].join('|')).digest('hex')
  try{const r=await cloud.callFunction({name:'tournamentRegistrationFlow',data:{action:'notifyPlayerReviewTask',taskId:task._id,bridgeTimestamp:timestamp,bridgeNonce:nonce,bridgeProof:proof}});return r.result&&r.result.data||{status:'failed',error:'微信通知未发送，可重试'}}catch(e){return {status:'failed',error:'微信通知未发送，可重试'}}
 }
 async function createTask({tournament,team,player,kind,reason,actorId,requestId,divisionId}){
  const list=kind==='claim'? (await players(team._id)).filter(p=>!claims(p).length):[player]
  if(!list.length)return {success:true,skipped:true,message:'没有未认领球员'}
  const recipientType=kind==='claim'||!claims(player||{}).length?'team_manager':'player_guardian'
  const recipients=recipientType==='team_manager'?await managers(team):claims(player)
  if(!recipients.length)return fail('RECIPIENT_REQUIRED','未找到有效球队管理员，请先配置管理员')
  const id=crypto.createHash('sha256').update([actorId,tournament._id,team._id,player&&player._id||'',kind,requestId].join('|')).digest('hex')
  let task=await get('player_review_tasks',id)
  if(task && task.actorId!==actorId)return fail('TASK_CONFLICT','通知请求冲突，请重试')
  if(!task){
   const now=db.serverDate()
   task={_id:id,sport:'football',tournamentId:tournament._id,teamId:team._id,divisionId:text(divisionId),playerId:player&&player._id||'',playerIds:list.map(p=>p._id),kind,reason:text(reason),recipientType,recipientUserIds:recipients,actorId,title:kind==='claim'?'请组织未认领球员认领':kind==='rejected'?'球员资料已驳回':'请补全球员资料',tournamentName:text(tournament.name||tournament.tournamentName),teamName:text(team.name||team.teamName),playerName:text(player&&player.name),status:'open',revision:1,createdAt:now,updateTime:now}
   const data={...task};delete data._id
   await db.collection('player_review_tasks').doc(id).set({data})
  }
  for(const userId of task.recipientUserIds){
   const messageId=crypto.createHash('sha256').update(id+'|'+userId).digest('hex')
   if((await db.collection('messages').where({_id:messageId}).limit(1).get()).data.length)continue
   await db.collection('messages').doc(messageId).set({data:{sport:'football',orgId:text(team.orgId||team.organizationId),userId,teamId:team._id,category:'team',title:task.title,subtitle:task.teamName+'：'+(kind==='claim'?task.playerIds.length+'名球员尚未认领，请联系球员或监护人认领':task.playerName+'；'+task.reason),path:'/pages/team/player-detail/player-detail?teamId='+encodeURIComponent(team._id)+'&id='+encodeURIComponent(task.playerId||task.playerIds[0]),webPath:taskUrl(id),taskId:id,dedupeKey:messageId,createTime:task.createdAt,createdAt:task.createdAt,updateTime:db.serverDate()}})
  }
  const service=await deliver(task)
  return {success:true,data:{taskId:id,recipientType,recipientCount:task.recipientUserIds.length,playerCount:task.playerIds.length,channels:{inbox:'created',serviceAccount:service.status},delivery:service,message:'站内通知已创建'}}
 }
 async function organizer(event,context){
  const {tournament,relations,allowedTeam,actorId}=context,action=event.rosterAction
  if(action!=='reviewQueue'&&['finished','completed','ended','archived','cancelled'].includes(text(tournament.status)))return fail('TOURNAMENT_READONLY','赛事已结束，不能发送资料通知')
  const scoped=relations.filter(r=>!removed(r)&&(!event.divisionId||text(r.divisionId||r.division||'default')===text(event.divisionId))&&(!event.teamId||text(r.teamId)===text(event.teamId)))
  if(action==='reviewQueue'){
   const rows=[]
   for(const teamId of unique(scoped.map(r=>r.teamId))){
    const team=await get('teams',teamId);if(!team||!allowedTeam(team))continue
    const ps=await players(teamId),snapshots=await read('roster_snapshots',{tournamentId:tournament._id,teamId})
    for(const relation of scoped.filter(r=>r.teamId===teamId)){
     const divisionId=text(relation.divisionId||relation.division||'default')
     const latest=snapshots.filter(s=>text(s.divisionId||s.division||'default')===divisionId).sort((a,b)=>Number(b.version||1)-Number(a.version||1)||new Date(b.updateTime||b.createTime||0)-new Date(a.updateTime||a.createTime||0))[0]
     const approved=new Set(latest&&['approved','locked'].includes(text(latest.status))?snapshotIds(latest):[])
     for(const p of ps){
      const imported=Boolean(p.registrationImportBatchId||p.importDraftId||p.registrationSourceFileId||text(p.source).startsWith('registration_docx_import'))
      const scopeMatches=!p.organizerReviewTournamentId||p.organizerReviewTournamentId===tournament._id
      const state=approved.has(p._id)?'approved':(scopeMatches&&['rejected','resubmitted'].includes(p.organizerReviewStatus))?p.organizerReviewStatus:p.organizerReviewStatus==='approved'&&imported?'approved':'pending'
      rows.push({_id:p._id,teamId,teamName:text(team.name||team.teamName),divisionId,divisionName:text(relation.divisionName),name:text(p.name),jerseyNumber:p.jerseyNumber,photoFileID:text(p.photoFileID||p.photoFileId||p.photoUrl||p.avatar),claimed:claims(p).length>0,organizerReviewStatus:state,organizerReviewReason:text(p.organizerReviewReason),organizerResubmittedAt:p.organizerResubmittedAt||null})
      if(rows.length>10000)throw Object.assign(new Error('队员过多，请按竞赛组别筛选'),{code:'DATA_SCOPE_TOO_LARGE'})
     }
    }
   }
   return {success:true,rows}
  }
  const teamId=text(event.teamId),team=await get('teams',teamId)
  if(!scoped.some(r=>text(r.teamId)===teamId)||!team||!allowedTeam(team))return fail('TEAM_SCOPE_DENIED','无权通知该球队')
  const playerId=text(event.playerId),player=playerId?await get('players',playerId):null
  if(playerId&&(!player||removed(player)||![text(player.teamId),text(player.teamCode)].includes(teamId)))return fail('PLAYER_SCOPE_DENIED','球员不属于当前球队')
  const kind=action==='notifyUnclaimed'?'claim':'materials'
  const reason=text(event.reason)
  if(kind==='materials'&&(!player||!reason||reason.length>500))return fail('REASON_REQUIRED','请选择需补充事项，最多500字')
  if(!/^[a-zA-Z0-9_-]{16,80}$/.test(text(event.requestId)))return fail('REQUEST_ID_REQUIRED','通知请求已失效，请重新打开')
  return createTask({tournament,team,player,kind,reason,actorId,requestId:event.requestId,divisionId:event.divisionId})
 }
 async function access(taskId,userId){
  const task=await get('player_review_tasks',text(taskId));if(!task)return fail('TASK_NOT_FOUND','通知不存在，请重新打开')
  const team=await get('teams',task.teamId);if(!team||removed(team))return fail('TEAM_UNAVAILABLE','球队已不可用')
  const list=(await players(team._id)).filter(p=>task.playerIds.includes(p._id))
  const manageable=(await managers(team)).includes(userId)
  const visible=list.filter(p=>claims(p).length?claims(p).includes(userId):manageable)
  if(!visible.length)return fail('TASK_ACCESS_DENIED','当前账号无权处理这些球员资料')
  return {task,team,visible}
 }
 async function personal(action,event,user){
  const ctx=await access(event.taskId,text(user._id));if(!ctx.task)return ctx
  const {task,visible}=ctx
  if(action==='servicePrivateReviewTask'){
   const rows=[]
   for(const p of visible){let photo=text(p.photoFileID||p.photoFileId||p.photoUrl||p.avatar);if(photo.startsWith('cloud://')){const r=await cloud.getTempFileURL({fileList:[photo]});photo=text(r.fileList&&r.fileList[0]&&r.fileList[0].tempFileURL)}
    rows.push({playerId:p._id,name:text(p.name),claimed:claims(p).length>0,photo,jerseyNumber:p.jerseyNumber,position:text(p.position),jerseyName:text(p.jerseyName),birthDate:text(p.birthDate),nativePlace:text(p.nativePlace),nationality:text(p.nationality),gender:text(p.gender),strongFoot:text(p.strongFoot),height:p.height||'',weight:p.weight||'',documentType:text(p.documentType)||'resident_id',identityMasked:text(p.identityMasked)||text(p.idCard).replace(/^(.{6}).*(.{4})$/,'$1********$2'),reviewStatus:text(p.organizerReviewStatus),reason:text(p.organizerReviewReason),revision:task.revision})
   }
   return {success:true,task:{taskId:task._id,kind:task.kind,title:task.title,reason:task.reason,teamName:task.teamName,status:task.status,revision:task.revision},rows}
  }
  const player=visible.find(p=>p._id===text(event.playerId));if(!player)return fail('PLAYER_SCOPE_DENIED','当前账号无权修改该球员')
  if(task.kind==='claim')return fail('CLAIM_REQUIRED','请通过球队小程序邀请球员认领')
  if(action==='servicePrivateReviewPhoto'){
   const raw=text(event.imageBase64),buffer=Buffer.from(raw,'base64')
   const png=buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpg=buffer[0]===255&&buffer[1]===216&&buffer[2]===255
   if(buffer.length<32||buffer.length>2*1024*1024||(!png&&!jpg))return fail('PHOTO_INVALID','请上传2MB以内的PNG或JPG照片')
   const uploaded=await cloud.uploadFile({cloudPath:'football/player-review/'+task._id+'/'+crypto.randomBytes(12).toString('hex')+(png?'.png':'.jpg'),fileContent:buffer})
   await db.collection('player_review_tasks').doc(task._id).update({data:{uploadedPhoto:uploaded.fileID,updateTime:db.serverDate()}})
   return {success:true,fileId:uploaded.fileID}
  }
  if(action!=='servicePrivateReviewSubmit')return fail('ACTION_INVALID','操作不可用')
  if(task.status==='submitted')return fail('ALREADY_SUBMITTED','已重新提交，等待主办方复审')
  if(Number(event.revision)!==Number(task.revision))return fail('REVISION_CONFLICT','资料已有更新，请刷新后再提交')
  // A correction never rewrites approved or locked roster snapshots.
  const snapshots=await read('roster_snapshots',{tournamentId:task.tournamentId,teamId:task.teamId})
  if(snapshots.some(s=>['approved','locked'].includes(text(s.status))&&snapshotIds(s).includes(player._id)))return fail('IN_FORMAL_ROSTER','该球员已进入正式名单，请联系主办方办理名单变更')
  const input=event.profile||{},identity=text(input.identityNumber).replace(/\s/g,'').toUpperCase()
  const safe={...input,identityNumber:identity||(/^[0-9]{17}[0-9X]$/.test(text(player.idCard||player.idNumber))?text(player.idCard||player.idNumber):''),documentType:input.documentType||player.documentType||'resident_id'}
  let profile
  try{profile=editableImportedProfile(safe)}catch(e){return fail('PROFILE_INVALID',e.message)}
  const name=text(input.name),number=Number(input.jerseyNumber)
  if(!name||name.length>50||!Number.isInteger(number)||number<1||number>99||!['GK','DF','MF','FW'].includes(text(profile.position)))return fail('PROFILE_REQUIRED','请填写姓名、有效球衣号码和场上位置')
  const duplicate=(await players(task.teamId)).some(p=>p._id!==player._id&&p.jerseyNumber!=null&&text(p.jerseyNumber)===String(number))
  if(duplicate)return fail('NUMBER_DUPLICATE','球衣号码与本队重复，请更换')
  const photo=text(task.uploadedPhoto||player.photoFileID||player.photoFileId||player.photoUrl||player.avatar)
  if(!photo)return fail('PHOTO_REQUIRED','请上传球员照片')
  const identityChanged=identity&&identity!==text(player.idCard||player.idNumber)
  let identityDigest=''
  if(identityChanged){
   const timestamp=Date.now(),nonce=crypto.randomBytes(16).toString('hex')
   if(!secret)return fail('IDENTITY_HASH_KEY_REQUIRED','证件核验暂不可用，请稍后重新提交')
   const canonical=['playerReviewIdentity',task._id,player._id,profile.documentType,crypto.createHash('sha256').update(identity).digest('hex'),timestamp,nonce].join('|')
   const proof=crypto.createHmac('sha256',secret).update(canonical).digest('hex')
   const hashed=await cloud.callFunction({name:'tournamentRegistrationFlow',data:{action:'hashPlayerReviewIdentity',taskId:task._id,playerId:player._id,identityNumber:identity,documentType:profile.documentType,bridgeTimestamp:timestamp,bridgeNonce:nonce,bridgeProof:proof}})
   if(!hashed.result||!hashed.result.success||!/^[a-f0-9]{64}$/.test(text(hashed.result.identityDigest)))return fail('IDENTITY_HASH_KEY_REQUIRED','证件核验暂不可用，请稍后重新提交')
   identityDigest=hashed.result.identityDigest
   const conflicts=await read('players',db.command.or([{identityDigest},{idCard:identity},{idNumber:identity}]),{status:true})
   const staffConflicts=await read('coaches',{identityDigest},{status:true})
   if(staffConflicts.some(c=>c._id!==text(player.linkedCoachId)&&!removed(c)))return fail('IDENTITY_CONFLICT','证件已关联其他人员，请联系主办方核对')
   if(conflicts.some(p=>p._id!==player._id&&!removed(p)))return fail('IDENTITY_CONFLICT','证件已关联其他球员，请联系主办方核对')
  }
  if(profile.nativePlace&&profile.nativePlace!==text(player.nativePlace))profile.nativePlaceSource='manual'
  if(!profile.nativePlace){const inferred=resolveNativePlace(identity||text(player.idCard||player.idNumber));if(inferred){profile.nativePlace=inferred.nativePlace;profile.nativePlaceSource='id_card'}}
  const patch={...profile,name,jerseyName:text(input.jerseyName).slice(0,40),jerseyNumber:number,photoFileID:photo,photoFileId:photo,photoUrl:photo,organizerReviewStatus:['rejected','approved'].includes(player.organizerReviewStatus)?'resubmitted':player.organizerReviewStatus||'pending',organizerResubmittedAt:db.serverDate(),organizerReviewTournamentId:task.tournamentId,updateTime:db.serverDate()}
  delete patch.identityNumber;delete patch.identityIncomplete
  if(identityChanged||name!==text(player.name)||profile.birthDate!==text(player.birthDate)||profile.documentType!==text(player.documentType||'resident_id')){patch.identityStatus='pending';patch.identityVerified=false}
  if(identityChanged){patch.idCard=identity;patch.idNumber=identity;patch.identityDigest=identityDigest;patch.identityStatus='pending';patch.identityVerified=false;patch.identityNumberMasked=identity.length===18?identity.slice(0,6)+'********'+identity.slice(-4):identity.slice(0,2)+'****'+identity.slice(-2);patch.identityMasked=identity.length===18?identity.slice(0,6)+'********'+identity.slice(-4):identity.slice(0,2)+'****'+identity.slice(-2)}
  await db.runTransaction(async tx=>{
   const current=jsonDoc(await tx.collection('player_review_tasks').doc(task._id).get())
   const latest=jsonDoc(await tx.collection('players').doc(player._id).get())
   if(!current||current.status==='submitted'||current.revision!==task.revision||text(latest.organizerReviewStatus)!==text(player.organizerReviewStatus)||JSON.stringify(claims(latest))!==JSON.stringify(claims(player)))throw Object.assign(new Error('资料已更新，请刷新后重新提交'),{code:'REVISION_CONFLICT'})
   await tx.collection('players').doc(player._id).update({data:patch})
   await tx.collection('player_review_tasks').doc(task._id).update({data:{status:'submitted',revision:task.revision+1,submittedBy:text(user._id),submittedAt:db.serverDate(),updateTime:db.serverDate()}})
  })
  return {success:true,message:'已提交，等待主办方审核'}
 }
 return {organizer,personal,createTask,managers,access}
}
module.exports.claims=claims
