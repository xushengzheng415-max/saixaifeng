'use strict'
const crypto = require('node:crypto')
const text = v => String(v == null ? '' : v).trim()
const digest = v => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')
const live = p => p && !p.isDeleted && !['archived','deleted','removed'].includes(text(p.status).toLowerCase())
const belongs = (p,teamId) => p && (text(p.teamId)?text(p.teamId)===text(teamId):text(p.teamCode)===text(teamId))
const time = v => v ? new Date(v.$date || v._date || v).getTime() || 0 : 0
const fail = (code, message) => { throw Object.assign(new Error(message), {code}) }
const owners = p => [p.linkedUserId,p.playerUserId,p.guardianUserId].map(text).filter(Boolean)
const revision = p => digest([p._id,p.teamId,p.teamCode,p.orgId,p.name,p.idCard,p.birthDate,p.birthday,p.jerseyNumber,p.position,p.height,p.weight,p.photoUrl,p.playerCardSourceFileId,p.contactPhone,p.playerPhone,p.guardianPhone,p.status,owners(p)])
// 球员档案个人持有（2026-10-18）：账号迁移合并残留档案禁止自动恢复，仍走人工核验。
const blockedArchived = p => ['account_transfer_duplicate','incomplete_account_adoption','manual_placeholder_merge'].includes(text(p&&p.archivedReason))
const busy = e => /transactionbusy|transaction.*busy/i.test(text(e&&(e.code||e.errCode||e.message||e.errMsg)))
const historyIdFor = (playerId,teamId,nonce) => 'ph_'+digest([playerId,teamId,nonce]).slice(0,28)
async function doc(db, collection, id) {
  try { const r=await db.collection(collection).doc(text(id)).get(); return Array.isArray(r.data)?r.data[0]:r.data }
  catch(e) { if (/DOCUMENT_NOT_EXIST|document.*(not exist|does not exist)/i.test(text(e.message||e.code))) return null; throw e }
}
function idDetails(value) {
  const id=text(value).toUpperCase()
  if (!/^\d{17}[\dX]$/.test(id)) fail('IDCARD_INVALID','请填写18位身份证号')
  const birthDate=id.slice(6,10)+'-'+id.slice(10,12)+'-'+id.slice(12,14)
  const date=new Date(birthDate+'T00:00:00+08:00')
  if (!Number.isFinite(+date)||+date>Date.now()||new Date(+date+8*3600000).toISOString().slice(0,10)!==birthDate||Number(id.slice(6,10))<1900) fail('IDCARD_INVALID','身份证出生日期不正确，请核对')
  const weights=[7,9,10,5,8,4,2,1,6,3,7,9,10,5,8,4,2]
  const check='10X98765432'[id.slice(0,17).split('').reduce((sum,n,i)=>sum+Number(n)*weights[i],0)%11]
  if (check!==id[17]) fail('IDCARD_INVALID','身份证校验不通过，请核对号码')
  return {idCard:id,birthDate,gender:Number(id[16])%2?'male':'female'}
}
function number(value) {
  const v=text(value)
  if (!/^\d{1,3}$/.test(v)||Number(v)>99) fail('JERSEY_INVALID','球衣号码请填写0至99')
  return String(Number(v))
}
function fields(event, options = {}) {
  const identity=idDetails(event.idCard), name=text(event.name)
  if (name.length<2||name.length>30) fail('NAME_REQUIRED','请填写真实球员姓名')
  if (event.birthDate && text(event.birthDate)!==identity.birthDate) fail('BIRTHDATE_MISMATCH','出生日期与身份证不一致，请核对')
  const jerseyNumber=number(event.jerseyNumber), position=text(event.position)
  if (!['GK','DF','MF','FW'].includes(position)) fail('POSITION_REQUIRED','请选择场上位置')
  const height=Number(event.height), weight=Number(event.weight)
  if (!text(event.height)||!Number.isFinite(height)||height<50||height>250) fail('HEIGHT_REQUIRED','身高请填写50至250厘米')
  if (!text(event.weight)||!Number.isFinite(weight)||weight<10||weight>200) fail('WEIGHT_REQUIRED','体重请填写10至200公斤')
  const jerseyName=text(event.jerseyName).toUpperCase()
  if (jerseyName && !/^[A-Z][A-Z. ]{1,19}$/.test(jerseyName)) fail('JERSEYNAME_INVALID','请核对球衣名拼音')
  if (options.requireAuthorization!==false && event.authorizationAgreed!==true) fail('AUTHORIZATION_REQUIRED','请确认本人或监护人资料授权')
  return {...identity,name,jerseyNumber,position,height,weight,jerseyName}
}
function sameNumber(a,b) { return text(a)!=='' && /^\d+$/.test(text(a)) && Number(a)===Number(b) }
const draftFingerprint = (choice,values,portrait) => digest([choice.nonce,values,portrait.id,portrait.fileId])
function conflicts(rows, values, targetId) {
  const others=rows.filter(p=>live(p)&&text(p._id)!==text(targetId))
  const same=others.find(p=>text(p.idCard).toUpperCase()===values.idCard)
  if (same) fail(pendingJoin(same)?'PLAYER_IDCARD_PENDING':'PLAYER_IDCARD_CONFLICT',pendingJoin(same)?'本队已有该身份证的入队申请正在等待球队确认，请等待球队处理':'本队已有该身份证档案，请返回查找并认领')
  if (others.some(p=>sameNumber(p.jerseyNumber,values.jerseyNumber))) fail('PLAYER_JERSEY_CONFLICT',values.jerseyNumber+'号已被本队使用，请修改球衣号码')
}
function claimProof(p, loaded, idCard, invite) {
  if (!owners(p).length && [p.linkedOpenId,p.playerOpenId,p.guardianOpenId].some(text)) fail('PLAYER_IDENTITY_REVIEW','此档案有历史微信关联，请联系负责人核对')
  if (owners(p).length && !owners(p).includes(text(loaded.user._id))) fail('PLAYER_ALREADY_CLAIMED','此球员已由其他账号认领，请联系球队负责人')
  if (text(p.idCard) && text(p.idCard).toUpperCase()!==text(idCard).toUpperCase()) fail('PLAYER_IDENTITY_MISMATCH','身份证与所选档案不一致，请重新选择或新建')
  const phones=[p.playerPhone,p.guardianPhone,p.contactPhone].map(text).filter(v=>/^1[3-9]\d{9}$/.test(v))
  const phoneMatch=phones.includes(text(loaded.phone))
  if(phones.length&&!phoneMatch&&!owners(p).includes(text(loaded.user._id)))fail('PLAYER_PHONE_MISMATCH','请使用档案登记的联系手机号，或联系负责人核对')
  const targeted=text(invite.playerId)===text(p._id) && p.manualPlaceholder===true
  if (!text(p.idCard)&&!phoneMatch&&!targeted&&!owners(p).includes(text(loaded.user._id))) fail('PLAYER_IDENTITY_REVIEW','该档案缺少身份凭据，请让负责人从此球员详情发送补资料邀请')
}
// 递卡确认（恢复/转队）的身份核验：本人持有档案才可递交，不静默换绑、不恢复迁移残留。
function restoreProof(p, loaded) {
  if (blockedArchived(p)) fail('PLAYER_IDENTITY_REVIEW','此档案为账号迁移合并残留，请联系负责人人工核验')
  if (owners(p).length && !owners(p).includes(text(loaded.user._id))) fail('PLAYER_ALREADY_CLAIMED','此球员已由其他账号认领，请联系球队负责人')
  if (!owners(p).length) {
    const phones=[p.playerPhone,p.guardianPhone,p.contactPhone].map(text).filter(v=>/^1[3-9]\d{9}$/.test(v))
    if (!phones.includes(text(loaded.phone))) fail('PLAYER_IDENTITY_REVIEW','该档案缺少身份凭据，请联系负责人核对')
  }
}
async function inviteFor(deps, loaded) {
  const {db}=deps, {gate}=loaded
  const invite=await doc(db,'team_invitations',gate.inviteId)
  if (!invite||invite.type!=='team_player'||!['active','pending'].includes(invite.status)||time(invite.expiresAt)<=Date.now()||text(invite.teamId)!==text(gate.teamId)||text(invite.token)!==text(gate.entryKey)) fail('PLAYER_INVITE_INVALID','邀请已失效，请重新扫码')
  if (text(invite.expectedPhone)&&text(invite.expectedPhone)!==text(loaded.phone)) fail('PLAYER_PHONE_MISMATCH','请使用球队登记的联系手机号验证')
  const team=await doc(db,'teams',invite.teamId)
  if (!live(team)) fail('PLAYER_TEAM_INVALID','球队已变化，请联系负责人')
  return {invite,team}
}
function view(p) { return {id:text(p._id),name:text(p.name)||'待补姓名',birthYear:text(p.birthDate||p.birthday).slice(0,4),jerseyNumber:p.jerseyNumber==null?'':text(p.jerseyNumber),idCardMasked:text(p.idCard)?text(p.idCard).slice(0,3)+'***********'+text(p.idCard).slice(-4):'',claimed:owners(p).length>0} }
// 待球队确认的新登记：档案已进入球员库但尚未建立球队归属，不能借递卡确认绕过球队审核。
function pendingJoin(p) { return text(p&&p.pendingJoinStatus)==='pending' }
// 号码与身份证查重必须覆盖本队「待球队确认」档案：新登记在球队确认前不写 teamId，
// 但姓名、身份证与球衣号已经被占住，否则两次登记会同时占用同一号码，确认时才互相冲突。
async function pendingJoinPlayers(db,teamId){
  try {
    const result=await db.collection('players').where({pendingJoinTeamId:text(teamId)}).limit(200).get()
    return ((result&&result.data)||[]).filter(p=>pendingJoin(p))
  } catch(error) {
    console.warn('[playerRegistration] 待确认入队档案读取失败',text(error&&error.message))
    return []
  }
}
async function run(deps,event) {
  const {db,cloud,loadServiceEntryRegistration}=deps
  const readPlayers=async teamId=>(await deps.readPlayers(teamId)).filter(p=>belongs(p,teamId)).concat(await pendingJoinPlayers(db,teamId))
  const loaded=await loadServiceEntryRegistration(event,'player_invite_entry')
  const {invite,team}=await inviteFor(deps,loaded)
  const operation=text(event.operation), sid=text(loaded.session._id)
  if(operation==='authorize_media')return {success:true}
  if (operation==='search') {
    const query=text(event.query).toUpperCase()
    if (!text(invite.playerId)&&query.length<2) fail('PLAYER_QUERY_REQUIRED','请输入完整姓名或身份证号')
    const recent=loaded.session.playerSearchWindow||{}
    if (Number(recent.at)>Date.now()-60000 && Number(recent.count)>=15) fail('PLAYER_SEARCH_LIMIT','查找较频繁，请稍后再试')
    // 待球队确认的档案不进入查找列表：它们还不是本队在队球员，命中时由 conflicts 明确告知。
    const all=(await readPlayers(invite.teamId)).filter(p=>live(p)&&!pendingJoin(p))
    const rows=text(invite.playerId)?all.filter(p=>text(p._id)===text(invite.playerId)):all.filter(p=>/^\d{17}[\dX]$/.test(query)?text(p.idCard).toUpperCase()===query:text(p.name).toUpperCase()===query)
    if(rows.length>20) fail('PLAYER_SEARCH_AMBIGUOUS','同名档案较多，请使用身份证号查找')
    // 递卡确认：本队未命中且按完整身份证查找时，全局找本人持有的历史档案（含他队在队=转队、
    // 存量被移出=恢复）；迁移合并残留禁止恢复，多档案命中转人工核验。
    let restorable=null
    if(!rows.length&&!text(invite.playerId)&&/^\d{17}[\dX]$/.test(query)) {
      const found=(await db.collection('players').where({idCard:query}).limit(10).get()).data||[]
      const candidates=found.filter(p=>p&&text(p._id)&&!p.isDeleted&&!blockedArchived(p)&&!pendingJoin(p)&&!(live(p)&&belongs(p,invite.teamId)))
      const owned=candidates.filter(p=>owners(p).includes(text(loaded.user._id)))
      const pool=owned.length?owned:candidates.filter(p=>[p.playerPhone,p.guardianPhone,p.contactPhone].map(text).includes(text(loaded.phone)))
      if(pool.length>1) fail('PLAYER_IDENTITY_REVIEW','命中多份本人历史档案，请联系负责人人工核验')
      const cand=pool[0]
      if(cand) {
        const fromTeamId=text(cand.teamId||cand.teamCode)
        let fromTeamName=''
        if(live(cand)&&fromTeamId){const fromTeam=await doc(db,'teams',fromTeamId);fromTeamName=text(fromTeam&&(fromTeam.name||fromTeam.teamName))}
        restorable=Object.assign(view(cand),{fromTeamName,transfer:Boolean(live(cand)&&fromTeamId),hasPhoto:Boolean(text(cand.playerCardSourceFileId||cand.photoUrl||cand.photoFileId))})
      }
    }
    await db.collection('service_entry_sessions').doc(sid).update({data:{playerSearchIds:db.command.set(rows.map(p=>text(p._id))),playerRestorableId:restorable?restorable.id:'',playerSearchWindow:{at:Number(recent.at)>Date.now()-60000?recent.at:Date.now(),count:Number(recent.at)>Date.now()-60000?Number(recent.count||0)+1:1}}})
    return {success:true,players:rows.map(view),targeted:Boolean(invite.playerId),restorable}
  }
  if (operation==='select') {
    if(!loaded.session.playerSearchWindow || Number(loaded.session.playerSearchWindow.at)<Date.now()-10*60000)fail('PLAYER_CHOICE_REQUIRED','请先查找球队已有球员')
    const mode=text(event.mode)
    if (!['claim','new','restore'].includes(mode)) fail('PLAYER_CHOICE_REQUIRED','请选择认领、恢复或新建')
    if (invite.playerId && (mode!=='claim'||text(event.playerId)!==text(invite.playerId))) fail('PLAYER_CHOICE_REQUIRED','请认领邀请指定的球员档案')
    let player=null, detail={}
    if (mode==='claim') {
      if (!(loaded.session.playerSearchIds||[]).map(text).includes(text(event.playerId))) fail('PLAYER_CHOICE_STALE','请重新查找后选择球员')
      player=await doc(db,'players',event.playerId)
      if (!live(player)||!belongs(player,team._id)) fail('PLAYER_CHOICE_STALE','球员档案已变化，请重新查找')
      claimProof(player,loaded,event.idCard,invite)
      detail={name:text(player.name),birthDate:text(player.birthDate||player.birthday),jerseyNumber:player.jerseyNumber==null?'':text(player.jerseyNumber),position:text(player.position),height:player.height||'',weight:player.weight||'',jerseyName:text(player.jerseyName),hasIdentity:Boolean(text(player.idCard)),hasPhoto:Boolean(text(player.playerCardSourceFileId||player.photoUrl||player.photoFileId||player.photoFileID||player.photo))}
    } else if (mode==='restore') {
      if (text(loaded.session.playerRestorableId)!==text(event.playerId)||!text(event.playerId)) fail('PLAYER_CHOICE_STALE','请重新查找后确认本人档案')
      player=await doc(db,'players',event.playerId)
      if (!player||blockedArchived(player)||(live(player)&&belongs(player,team._id))) fail('PLAYER_CHOICE_STALE','球员档案已变化，请重新查找')
      restoreProof(player,loaded)
      const fromTeamId=text(player.teamId||player.teamCode)
      let fromTeamName=''
      if(live(player)&&fromTeamId){const fromTeam=await doc(db,'teams',fromTeamId);fromTeamName=text(fromTeam&&(fromTeam.name||fromTeam.teamName))}
      detail={name:text(player.name),birthDate:text(player.birthDate||player.birthday),jerseyNumber:player.jerseyNumber==null?'':text(player.jerseyNumber),position:text(player.position),idCardMasked:text(player.idCard)?text(player.idCard).slice(0,3)+'***********'+text(player.idCard).slice(-4):'',hasPhoto:Boolean(text(player.playerCardSourceFileId||player.photoUrl||player.photoFileId)),fromTeamName,transfer:Boolean(live(player)&&fromTeamId)}
    }
    const choice={mode,playerId:player?text(player._id):'',revision:player?revision(player):'',nonce:crypto.randomBytes(12).toString('hex')}
    await db.collection('service_entry_sessions').doc(sid).update({data:{playerRegistrationChoice:db.command.set(choice)}})
    return {success:true,choiceToken:choice.nonce,mode,player:detail}
  }
  if (!['submit','preview','check_number','confirm_restore'].includes(operation)) fail('PLAYER_ACTION_INVALID','不支持的球员登记操作')
  const choice=loaded.session.playerRegistrationChoice
  if (!choice||text(event.choiceToken)!==text(choice.nonce)) fail('PLAYER_CHOICE_REQUIRED','请先查找并选择认领或新建')
  if(operation==='check_number') {
    const jerseyNumber=number(event.jerseyNumber),rows=await readPlayers(team._id)
    const used=rows.some(p=>live(p)&&text(p._id)!==text(choice.playerId)&&sameNumber(p.jerseyNumber,jerseyNumber))
    return {success:true,available:!used,jerseyNumber,message:used?jerseyNumber+'号已被本队使用，请更换号码':''}
  }
  // 递卡确认：个人资料只读，仅允许修改球衣号码与更换形象照；确认即恢复原 playerId 在队关系，
  // 写 player_team_history（他队在队=转出补 leftAt+转入新日志；存量被移出=恢复新日志）。
  if (operation==='confirm_restore') {
    if (choice.mode!=='restore') fail('PLAYER_CHOICE_REQUIRED','请先查找并确认本人档案')
    if (loaded.session.playerRegistrationReceipt?.choiceToken===choice.nonce) return {success:true,...loaded.session.playerRegistrationReceipt,idempotent:true}
    const restored=await doc(db,'players',choice.playerId)
    if (!restored||revision(restored)!==choice.revision) fail('PLAYER_CHOICE_STALE','档案已更新，请重新查找')
    restoreProof(restored,loaded)
    if (pendingJoin(restored)) fail('PLAYER_JOIN_PENDING','该球员的入队申请正在等待球队确认，请等待球队处理')
    if (event.authorizationAgreed!==true) fail('AUTHORIZATION_REQUIRED','请确认本人或监护人资料授权')
    const jerseyNumber=number(event.jerseyNumber)
    let portrait=null
    if (text(event.portraitId)) {
      portrait=(loaded.session.playerRegistrationPortraits||[]).find(p=>p.id===text(event.portraitId)&&p.processingStatus==='ready')
      if (!portrait) fail('PLAYER_PHOTO_REQUIRED','形象照已失效，请重新上传')
      if(restored.registrationVersion==='player-registration/2' && owners(restored).length && (restored.playerCardDynamic||restored.playerCardFileId) && portrait.fileId!==text(restored.playerCardSourceFileId)) {
        const score=await require('./data-center/service.cjs').createDataService(db).playerCardForAuthorizedPlayer(restored._id)
        if(score?.status!=='ready'||!score.canReplacePhoto)fail('PLAYER_CARD_PHOTO_LOCKED','当前球员卡暂不能更换照片，请保留原照')
      }
    }
    const playerId=text(restored._id), fromTeamId=text(restored.teamId||restored.teamCode)
    const transfer=live(restored)&&Boolean(fromTeamId)&&fromTeamId!==text(team._id)
    const receipt={choiceToken:choice.nonce,playerId,restored:true,transfer,name:text(restored.name)}
    for(let attempt=0;attempt<3;attempt++) {
      const before=await doc(db,'teams',team._id), pool=await readPlayers(team._id)
      if (pool.some(p=>live(p)&&text(p._id)!==playerId&&sameNumber(p.jerseyNumber,jerseyNumber))) fail('PLAYER_JERSEY_CONFLICT',jerseyNumber+'号已被本队使用，请修改球衣号码')
      try {
        await db.runTransaction(async tx=>{
          const currentTeam=await doc(tx,'teams',team._id), currentSession=await doc(tx,'service_entry_sessions',sid)
          if (currentSession?.playerRegistrationReceipt?.choiceToken===choice.nonce) return
          const currentInvite=await doc(tx,'team_invitations',invite._id)
          if(!live(currentTeam)||!currentInvite||!['active','pending'].includes(currentInvite.status)||time(currentInvite.expiresAt)<=Date.now()||text(currentInvite.teamId)!==text(team._id)||text(currentInvite.token)!==text(invite.token)||text(currentInvite.playerId)!==text(invite.playerId)||text(currentInvite.expectedPhone)&&text(currentInvite.expectedPhone)!==text(loaded.phone))fail('PLAYER_INVITE_INVALID','邀请已变化或失效，请重新扫码')
          if (currentSession?.active!==true||time(currentSession.expiresAt)<=Date.now()||text(currentSession.userId)!==text(loaded.user._id)||currentSession.playerRegistrationChoice?.nonce!==choice.nonce) fail('PLAYER_CHOICE_STALE','登记会话已变化，请重新进入')
          if (Number(currentTeam?.playerRegistrationRevision||0)!==Number(before?.playerRegistrationRevision||0)) fail('PLAYER_POOL_CHANGED','号码库已更新，请重试')
          const current=await doc(tx,'players',playerId)
          if(!current||revision(current)!==choice.revision)fail('PLAYER_CHOICE_STALE','球员档案已更新，请重新查找')
          const now=db.serverDate()
          const newHistoryId=historyIdFor(playerId,text(team._id),choice.nonce)
          const update={teamId:text(team._id),teamCode:'',orgId:text(current.orgId||invite.orgId||currentTeam.orgId),jerseyNumber,status:'',archivedAt:'',archivedBy:'',archivedReason:'',archivedTeamId:'',currentHistoryId:newHistoryId,rejoinedAt:now,updateTime:now}
          if (portrait) Object.assign(update,{photoUrl:portrait.fileId,playerCardSourceFileId:portrait.fileId,playerCardSourceType:'standard_portrait',playerCardCrop:{zoom:1,x:0,y:0}})
          if (transfer) {
            const oldHistoryId=text(current.currentHistoryId)
            let closed=false
            if (oldHistoryId){const old=await doc(tx,'player_team_history',oldHistoryId);if(old&&!old.leftAt){await tx.collection('player_team_history').doc(oldHistoryId).update({data:{leftAt:now,leftSource:'transfer_out',updateTime:now}});closed=true}}
            if(!closed) await tx.collection('player_team_history').add({data:{playerId,teamId:fromTeamId,orgId:text(current.orgId),joinedAt:null,leftAt:now,joinSource:'legacy',leftSource:'transfer_out',createTime:now,updateTime:now}})
            const fromTeam=await doc(tx,'teams',fromTeamId)
            if (fromTeam) await tx.collection('teams').doc(fromTeamId).update({data:{rosterCountStatus:'needs_refresh',updateTime:now}})
          }
          await tx.collection('player_team_history').doc(newHistoryId).set({data:{playerId,teamId:text(team._id),orgId:update.orgId,teamName:text(currentTeam.name||currentTeam.teamName),joinedAt:now,leftAt:null,joinSource:transfer?'transfer_in':'restore',actorUserId:text(loaded.user._id),createTime:now,updateTime:now}})
          await tx.collection('players').doc(playerId).update({data:update})
          await tx.collection('teams').doc(team._id).update({data:{playerRegistrationRevision:Number(currentTeam.playerRegistrationRevision||0)+1}})
          await tx.collection('service_entry_sessions').doc(sid).update({data:{registeredPlayerId:playerId,playerRegistrationReceipt:db.command.set(receipt)}})
        })
        if (text(process.env.SXF_FOOTBALL_SERVICE_BRIDGE_KEY)) {
          try { await cloud.callFunction({name:'tournamentRegistrationFlow',data:{action:'notifyTeamPlayerJoin',bridgeKey:text(process.env.SXF_FOOTBALL_SERVICE_BRIDGE_KEY),teamId:text(team._id),teamName:text(team.name||team.teamName),playerId,playerName:text(restored.name),inviteId:text(invite._id),eventId:choice.nonce}}) } catch(notifyError) { console.warn('[playerRegistration] 恢复入队通知发送失败',text(notifyError&&notifyError.message)) }
        }
        return {success:true,...receipt}
      } catch(e) { if((e.code!=='PLAYER_POOL_CHANGED'&&!busy(e))||attempt===2)throw e }
    }
  }
  if (loaded.session.playerRegistrationReceipt?.choiceToken===choice.nonce) {
    if(operation==='submit')return {success:true,...loaded.session.playerRegistrationReceipt,idempotent:true}
    fail('PLAYER_REGISTRATION_COMPLETE','登记已完成，请重新打开球员卡')
  }
  const values=fields(event,{requireAuthorization:operation!=='preview'})
  const birth=new Date(values.birthDate+'T00:00:00'), today=new Date()
  let age=today.getFullYear()-birth.getFullYear(); if(today.getMonth()<birth.getMonth()||today.getMonth()===birth.getMonth()&&today.getDate()<birth.getDate())age--
  const registrantType=age>=18?'self':'guardian'
  if (registrantType==='guardian'&&!['father','mother','other'].includes(text(event.guardianRelation))) fail('GUARDIAN_REQUIRED','请选择监护关系')
  const target=choice.mode==='claim'?await doc(db,'players',choice.playerId):null
  if (choice.mode==='claim') {
    if (!live(target)||!belongs(target,team._id)||revision(target)!==choice.revision) fail('PLAYER_CHOICE_STALE','档案已更新，请重新查找并确认')
    claimProof(target,loaded,values.idCard,invite)
    if (text(target.name)&&text(target.name)!==values.name) fail('PLAYER_NAME_MISMATCH','姓名与所选档案不一致，请重新查找')
  }
  const portrait=(loaded.session.playerRegistrationPortraits||[]).find(p=>p.id===text(event.portraitId)&&p.processingStatus==='ready')
  if (!portrait) fail('PLAYER_PHOTO_REQUIRED','请先拍摄或上传形象照并完成抠图')
  if(target?.registrationVersion==='player-registration/2' && owners(target).length && (target.playerCardDynamic||target.playerCardFileId) && portrait.fileId!==text(target.playerCardSourceFileId)) {
    const score=await require('./data-center/service.cjs').createDataService(db).playerCardForAuthorizedPlayer(target._id)
    if(score?.status!=='ready'||!score.canReplacePhoto)fail('PLAYER_CARD_PHOTO_LOCKED','当前球员卡暂不能更换照片，请保留原照')
  }
  const playerId=target?text(target._id):'pr_'+digest([sid,choice.nonce]).slice(0,28)
  // 新登记在球队确认前只占位，不建立球队归属；用请求指纹作为确认入队时的幂等键。
  const pendingJoinRequestId='jr_'+digest([sid,choice.nonce]).slice(0,28)
  const profileId='sp_'+digest([sid,choice.nonce]).slice(0,28), parentInvite='pp_'+crypto.randomBytes(24).toString('hex')
  const data={...values,teamId:text(team._id),orgId:text(target?.orgId||invite.orgId||team.orgId),registrantType,registrantMode:'age_based',contactPhone:loaded.phone,photoUrl:portrait.fileId,profileStatus:'complete',manualPlaceholder:false,needsParentCompletion:false,standardProfileFlow:true,registrationVersion:'player-registration/2',authorizationAgreed:true,authorizationConfirmedAt:db.serverDate(),claimSource:'service_account_h5',playerInviteId:text(invite._id),updateTime:db.serverDate()}
  Object.assign(data,{playerCardSourceFileId:portrait.fileId,playerCardSourceType:'standard_portrait',playerCardCrop:portrait.fileId===target?.playerCardSourceFileId?(target.playerCardCrop||{zoom:1,x:0,y:0}):{zoom:1,x:0,y:0}})
  Object.assign(data,{recentPortraitId:profileId,parentProfileSubmissionStatus:'submitted',parentProfileCompletedAt:db.serverDate()})
  if (registrantType==='self') Object.assign(data,{playerPhone:loaded.phone,linkedUserId:loaded.user._id})
  else Object.assign(data,{guardianPhone:loaded.phone,guardianUserId:loaded.user._id,guardianRelation:text(event.guardianRelation)})
  const fingerprint=draftFingerprint(choice,values,portrait)
  if(operation==='preview') {
    conflicts(await readPlayers(team._id),values,target?playerId:'')
    // This descriptor is consumed by webLoginApi, never a committed player or a
    // card grant. Existing claims retain their canonical career identity.
    const cardPlayer={_id:playerId,teamId:text(team._id),orgId:data.orgId,source:target?.source||'team_player_invite',name:values.name,jerseyNumber:values.jerseyNumber,jerseyName:values.jerseyName,position:values.position,height:values.height,weight:values.weight,nationality:text(target?.nationality)}
    return {success:true,registrationDraft:{player:cardPlayer,existing:Boolean(target),fingerprint,portraitId:portrait.id,portraitFileId:portrait.fileId,crop:data.playerCardCrop,choiceToken:choice.nonce}}
  }
  const cardDraft=loaded.session.playerRegistrationCardDraft
  if(event.cardPreviewRequired===true || event.cardPreviewToken) {
    if(!cardDraft?.confirmed||!cardDraft.renderRequest||cardDraft.renderRequest!==loaded.session.playerRegistrationCardRenderRequest||text(event.cardPreviewToken)!==text(cardDraft.token)||cardDraft.fingerprint!==fingerprint||time(cardDraft.expiresAt)<=Date.now())fail('PLAYER_CARD_CONFIRM_REQUIRED','请先生成并确认球员卡')
    data.playerCardCrop=cardDraft.crop
    data.playerCardDynamic=true
  }
  const receipt={choiceToken:choice.nonce,playerId,claimed:Boolean(target),name:values.name,pendingTeamConfirm:!target}
  // All H5 registration writers serialize on the team revision; retry rereads the
  // complete active pool. No name-based merge and no stale number reservation.
  for(let attempt=0;attempt<3;attempt++) {
    const before=await doc(db,'teams',team._id), pool=await readPlayers(team._id)
    conflicts(pool,values,target?playerId:'')
    try {
      await db.runTransaction(async tx=>{
        const currentTeam=await doc(tx,'teams',team._id), currentSession=await doc(tx,'service_entry_sessions',sid)
        if (currentSession?.playerRegistrationReceipt?.choiceToken===choice.nonce) return
        const currentInvite=await doc(tx,'team_invitations',invite._id)
        if(!live(currentTeam)||!currentInvite||!['active','pending'].includes(currentInvite.status)||time(currentInvite.expiresAt)<=Date.now()||text(currentInvite.teamId)!==text(team._id)||text(currentInvite.token)!==text(invite.token)||text(currentInvite.playerId)!==text(invite.playerId)||text(currentInvite.expectedPhone)&&text(currentInvite.expectedPhone)!==text(loaded.phone))fail('PLAYER_INVITE_INVALID','邀请已变化或失效，请重新扫码')
        if (currentSession?.active!==true||time(currentSession.expiresAt)<=Date.now()||text(currentSession.userId)!==text(loaded.user._id)||currentSession.playerRegistrationChoice?.nonce!==choice.nonce) fail('PLAYER_CHOICE_STALE','登记会话已变化，请重新进入')
        if (Number(currentTeam?.playerRegistrationRevision||0)!==Number(before?.playerRegistrationRevision||0)) fail('PLAYER_POOL_CHANGED','号码库已更新，请重试')
        if(event.cardPreviewRequired===true || event.cardPreviewToken) {
          const currentDraft=currentSession.playerRegistrationCardDraft,state=await doc(tx,'player_card_template_states',cardDraft.templateStateId||cardDraft.tier)
          if(!currentDraft?.confirmed||!currentDraft.renderRequest||currentDraft.renderRequest!==currentSession.playerRegistrationCardRenderRequest||currentDraft.token!==cardDraft.token||currentDraft.fingerprint!==fingerprint||time(currentDraft.expiresAt)<=Date.now())fail('PLAYER_CARD_CONFIRM_REQUIRED','球员卡预览已变化，请重新确认')
          if(text(state?.active?.templateId)!==text(cardDraft.templateId)||Number(state?.active?.version)!==Number(cardDraft.templateVersion))fail('PLAYER_CARD_TEMPLATE_CHANGED','卡片模板已更新，请重新预览')
          if(cardDraft.templateSetId){const set=await doc(tx,'player_card_sets',cardDraft.templateSetId),member=set?.published?.members?.[cardDraft.tier];if(set?.status!=='published'||text(member?.templateId)!==text(cardDraft.templateId)||Number(member?.version)!==Number(cardDraft.templateVersion))fail('PLAYER_CARD_TEMPLATE_CHANGED','赛事卡模板已更新，请重新预览')}
          if(cardDraft.cardTournamentId){const registrations=await Promise.all((cardDraft.registrationIds||[]).map(id=>doc(tx,'tournament_teams',id)));if(!registrations.some(r=>text(r?.teamId)===text(team._id)&&text(r?.tournamentId)===text(cardDraft.cardTournamentId)&&['approved','confirmed','active','locked','accepted'].includes(text(r?.status))))fail('PLAYER_CARD_EVENT_INVALID','球队参赛关系已变化，请重新进入')}
        }
        if (target) {
          const current=await doc(tx,'players',playerId)
          if(!live(current)||revision(current)!==choice.revision)fail('PLAYER_CHOICE_STALE','球员档案已更新，请重新查找')
          const patch=Object.assign({},data)
          if(!text(current.currentHistoryId)){
            await tx.collection('player_team_history').doc(historyIdFor(playerId,text(team._id),choice.nonce)).set({data:{playerId,teamId:text(team._id),orgId:data.orgId,teamName:text(currentTeam.name||currentTeam.teamName),joinedAt:db.serverDate(),leftAt:null,joinSource:'claim',actorUserId:text(loaded.user._id),createTime:db.serverDate(),updateTime:db.serverDate()}})
            patch.currentHistoryId=historyIdFor(playerId,text(team._id),choice.nonce)
          }
          await tx.collection('players').doc(playerId).update({data:patch})
        } else {
          // 用户确认口径（2026-10-19）：新登记只进入球队长期球员库「待球队确认」，
          // 此时不写 teamId、不写归属流转日志；球队负责人在小程序确认入队后才正式建立关系。
          await tx.collection('players').doc(playerId).set({data:{...data,teamId:'',teamCode:'',currentHistoryId:'',pendingJoinTeamId:text(team._id),pendingJoinStatus:'pending',pendingJoinRequestId,joinRequestedAt:db.serverDate(),source:'team_player_invite',createTime:db.serverDate(),identityVerificationRequired:false,portraitRequired:true}})
        }
        await tx.collection('parent_profile_invites').doc(profileId).set({data:{token:parentInvite,playerId,teamId:text(team._id),orgId:data.orgId,profileScope:'team',registrantType,registrantMode:'age_based',registrantUserId:text(loaded.user._id),registrantPhone:loaded.phone,status:'active',serviceFirst:true,serviceAccountOpenId:text(loaded.officialOpenId),identityVerificationRequired:false,portraitRequired:true,standardProfileFlow:true,expiresAt:new Date(Date.now()+7*86400000),createTime:db.serverDate(),updateTime:db.serverDate()}})
        await tx.collection('parent_portraits').doc(profileId).set({data:{parentInvite,playerId,teamId:text(team._id),version:1,rawFileId:portrait.originalId||portrait.fileId,transparentFileId:portrait.fileId,avatarFileId:portrait.fileId,status:'confirmed',processingStatus:'confirmed',sourceChannel:'service_account_h5',serviceAccountOpenId:text(loaded.officialOpenId),confirmedAt:db.serverDate(),createTime:db.serverDate(),updateTime:db.serverDate()}})
        await tx.collection('parent_profile_submissions').doc(profileId).set({data:{parentInvite,playerId,teamId:text(team._id),registrantType,registrantUserId:text(loaded.user._id),portraitId:profileId,avatarFileId:portrait.fileId,requirementsSnapshot:{realName:false,portrait:true},submissionVersion:1,serviceAccountOpenId:text(loaded.officialOpenId),status:'submitted',sourceChannel:'service_account_h5',createTime:db.serverDate(),updateTime:db.serverDate()}})
        await tx.collection('teams').doc(team._id).update({data:{playerRegistrationRevision:Number(currentTeam.playerRegistrationRevision||0)+1}})
        await tx.collection('service_entry_sessions').doc(sid).update({data:{registeredPlayerId:playerId,playerRegistrationReceipt:db.command.set(receipt)}})
      })
      // 用户确认口径（2026-10-19）：球员提交成功后，球队负责人在服务号收到一条待审核的入队申请通知。
      // 新登记的档案在球队确认前不属于球队，通知直接指向本队待确认入队列表；认领/恢复沿用原通知。
      // 尽力而为、不阻断登记结果；幂等重放已在上方提前返回，不会重复通知。
      if (text(process.env.SXF_FOOTBALL_SERVICE_BRIDGE_KEY)) {
        try {
          await cloud.callFunction({name:'tournamentRegistrationFlow',data:{action:'notifyTeamPlayerJoin',bridgeKey:text(process.env.SXF_FOOTBALL_SERVICE_BRIDGE_KEY),teamId:text(team._id),teamName:text(team.name||team.teamName),playerId,playerName:values.name,inviteId:text(invite._id),eventId:choice.nonce,pendingTeamConfirm:!target,pagePath:target?'':'pages/team/player-library/player-library?teamId='+text(team._id)}})
        } catch(notifyError) { console.warn('[playerRegistration] 入队申请通知发送失败',text(notifyError&&notifyError.message)) }
      }
      await require('./data-center/numbering.cjs').afterWrite(db,'players',playerId)
      return {success:true,...receipt}
    } catch(e) { if((e.code!=='PLAYER_POOL_CHANGED'&&!busy(e))||attempt===2)throw e }
  }
}
async function saveDraft(deps,event,identity) {
  const {db,findWorkspaceForAction,loadTeams}=deps
  const readPlayers=async teamId=>(await deps.readPlayers(teamId)).filter(p=>belongs(p,teamId)).concat(await pendingJoinPlayers(db,teamId))
  const scope=await findWorkspaceForAction(identity.user,identity.openId,event.workspaceId)
  if(!(scope.workspace.permissions||[]).includes('team.manage'))fail('PLAYER_FORBIDDEN','当前身份没有管理球队的权限')
  const team=(await loadTeams(scope.workspace,identity.user,identity.openId)).find(t=>text(t._id)===text(event.teamId))
  if(!team)fail('PLAYER_FORBIDDEN','球队不属于当前工作空间')
  const name=text(event.name),phone=text(event.contactPhone),birthDate=text(event.birthDate)
  if(!name&&!phone)fail('PLAYER_DRAFT_REQUIRED','姓名或联系手机号至少填写一项')
  if(name&&name.length>30)fail('NAME_INVALID','姓名不能超过30字')
  if(phone&&!/^1[3-9]\d{9}$/.test(phone))fail('PHONE_INVALID','请核对联系手机号')
  if(birthDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)||!Number.isFinite(+new Date(birthDate))||+new Date(birthDate)>Date.now()))fail('BIRTHDATE_INVALID','请核对出生日期')
  const id=text(event.playerId),existing=id?await doc(db,'players',id):null
  if(id&&(!live(existing)||!belongs(existing,team._id)))fail('PLAYER_FORBIDDEN','球员不属于本队或已移出')
  if(existing&&text(existing.idCard)&&(text(existing.name)!==name||text(existing.birthDate||existing.birthday)!==birthDate))fail('PLAYER_IDENTITY_LOCKED','已有身份证资料的姓名和生日请在认领时核对')
  const duplicate=(await readPlayers(team._id)).filter(p=>live(p)&&text(p._id)!==id&&name&&birthDate&&text(p.name)===name&&text(p.birthDate||p.birthday)===birthDate)
  if(duplicate.length)fail('PLAYER_DRAFT_CONFLICT','本队已有同名同生日档案，请先核对')
  const playerId=id||'pd_'+digest([identity.user._id,team._id,text(event.requestId)||crypto.randomBytes(16).toString('hex')]).slice(0,28)
  const data={name,birthDate,birthday:birthDate,contactPhone:phone,updateTime:db.serverDate(),lastEditedBy:identity.user._id}
  await db.runTransaction(async tx=>{
    const current=await doc(tx,'players',playerId)
    if(existing) {
      if(!live(current)||revision(current)!==revision(existing))fail('PLAYER_DRAFT_CHANGED','档案已更新，请重新打开')
      await tx.collection('players').doc(playerId).update({data})
    } else if(!current) {
      const joinHistoryId=historyIdFor(playerId,text(team._id),'draft')
      await tx.collection('player_team_history').doc(joinHistoryId).set({data:{playerId,teamId:text(team._id),orgId:text(scope.workspace.orgId),teamName:text(team.name||team.teamName),joinedAt:db.serverDate(),leftAt:null,joinSource:'team_manual_placeholder',actorUserId:identity.user._id,createTime:db.serverDate(),updateTime:db.serverDate()}})
      await tx.collection('players').doc(playerId).set({data:{...data,currentHistoryId:joinHistoryId,teamId:text(team._id),orgId:text(scope.workspace.orgId),manualPlaceholder:true,profileStatus:'pending',needsParentCompletion:true,creatorId:identity.user._id,source:'team_manual_placeholder',createTime:db.serverDate()}})
    }
    else if(text(current.teamId)!==text(team._id)||text(current.name)!==name||text(current.contactPhone)!==phone||text(current.birthDate)!==birthDate)fail('PLAYER_DRAFT_REQUEST_CHANGED','此保存请求已完成，请重新打开添加页面')
  })
  await require('./data-center/numbering.cjs').afterWrite(db,'players',playerId)
  return {success:true,playerId,updated:Boolean(existing)}
}
async function targetedInvite(deps,event,identity,scope,team) {
  const {db}=deps,p=await doc(db,'players',event.playerId)
  if(!live(p)||!belongs(p,team._id))fail('PLAYER_FORBIDDEN','球员不属于本队或已移出')
  const token='tp_'+crypto.randomBytes(18).toString('hex'),expiresAt=new Date(Date.now()+7*86400000)
  const created=await db.collection('team_invitations').add({data:{type:'team_player',purpose:'player_targeted_completion',teamId:text(team._id),orgId:text(scope.workspace.orgId),playerId:text(p._id),expectedPhone:text(p.contactPhone||p.playerPhone||p.guardianPhone),token,status:'active',usageMode:'single',inviterUserId:identity.user._id,registrantMode:'age_based',expiresAt,createTime:db.serverDate(),updateTime:db.serverDate()}})
  return {success:true,inviteId:created._id,token,registrantMode:'age_based',expiresAtText:expiresAt.toISOString().slice(5,16).replace('T',' ')}
}
module.exports={run,saveDraft,targetedInvite,idDetails,fields,conflicts,claimProof,revision,live,doc,draftFingerprint}
