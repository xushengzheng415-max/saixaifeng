'use strict'
const suite=require('./playerCardSuite.cjs')
const text=v=>String(v==null?'':v).trim()
const fail=(code,message)=>{throw Object.assign(new Error(message),{code})}
const fields={name:40,idCard:18,birthDate:10,jerseyName:40,jerseyNumber:3,position:16,height:8,weight:8,guardianRelation:20,cardTournamentId:128}
// 草稿是客户端持有的缓存，同一会话可能被多个页面同时自动保存。写入不开事务，
// 只做一次读校验 + 单文档更新，避免与令牌轮换/提交互相加锁。
const BUSY_PATTERN=/transactionbusy|transaction is busy|-501001/i
const asBusyText=failure=>text(failure&&failure.code)+' '+text(failure&&(failure.message||failure.error))
async function retryBusy(run,attempts,label){
  for(let attempt=0;;attempt++){
    try{return await run()}
    catch(error){
      if(attempt>=attempts-1||!BUSY_PATTERN.test(asBusyText(error)))throw error
      console.warn('[service-draft] busy retry',label,attempt+1)
      await new Promise(resolve=>setTimeout(resolve,200*(attempt+1)))
    }
  }
}
const read=(db,collection,id)=>retryBusy(()=>suite.document(db,collection,id),4,'doc:'+collection)
async function save(db,loaded,event){
  const {session,gate}=loaded,choice=session.playerRegistrationChoice
  if(!session.phoneVerified||gate.purpose!=='player_invite_entry'||!choice||choice.nonce!==text(event.choiceToken))fail('PLAYER_CHOICE_STALE','登记对象已变化，请重新进入')
  const revision=Number(event.draftRevision)
  if(!Number.isSafeInteger(revision)||revision<0)fail('PLAYER_DRAFT_INVALID','草稿版本无效')
  const values={}
  for(const [key,max] of Object.entries(fields))values[key]=text(event[key]).slice(0,max)
  const portraitId=text(event.portraitId)
  const crop=event.crop?require('./playerCards.cjs').normalizeCrop(event.crop):null
  if(portraitId&&!(session.playerRegistrationPortraits||[]).some(p=>p.id===portraitId&&p.processingStatus==='ready'))fail('PLAYER_PHOTO_INVALID','照片已变化，请重新上传')
  const current=await read(db,'service_entry_sessions',session._id)
  if(!current?.active||current.expiresAt&&new Date(current.expiresAt.$date||current.expiresAt).getTime()<=Date.now()||text(current.userId)!==text(session.userId)||current.playerRegistrationChoice?.nonce!==choice.nonce)fail('PLAYER_CHOICE_STALE','登记对象已变化，请重新进入')
  if(current.playerRegistrationReceipt?.choiceToken===choice.nonce)return {success:true,draftRevision:revision}
  const old=current.playerRegistrationFormDraft
  if(old?.choiceToken===choice.nonce&&Number(old.revision)>=revision)return {success:true,draftRevision:revision}
  await retryBusy(()=>db.collection('service_entry_sessions').doc(session._id).update({data:{playerRegistrationFormDraft:db.command.set({choiceToken:choice.nonce,mode:choice.mode,values,portraitId,crop,revision,updatedAt:new Date()})}}),4,'save')
  return {success:true,draftRevision:revision}
}
async function restore(cloud,loaded){
  const {session,gate}=loaded,draft=session.playerRegistrationFormDraft,choice=session.playerRegistrationChoice
  if(!session.phoneVerified||gate.purpose!=='player_invite_entry'||!draft||draft.choiceToken!==choice?.nonce||session.playerRegistrationReceipt?.choiceToken===choice.nonce)return null
  const result={selection:{choiceToken:choice.nonce,mode:choice.mode,player:{}},values:draft.values,crop:draft.crop,revision:draft.revision,portraitId:'',photoUrl:'',photoPreview:''}
  const portrait=(session.playerRegistrationPortraits||[]).find(p=>p.id===draft.portraitId&&p.processingStatus==='ready')
  if(portrait){
    const files=await cloud.getTempFileURL({fileList:[portrait.fileId]})
    const url=files.fileList?.find(f=>f.fileID===portrait.fileId)?.tempFileURL
    if(url)Object.assign(result,{portraitId:portrait.id,photoUrl:portrait.fileId,photoPreview:url})
  }
  const card=session.playerRegistrationCardDraft
  if(card?.confirmed&&card.choiceToken===choice.nonce&&card.portraitId===result.portraitId)result.confirmedCard={previewToken:card.token,crop:card.crop}
  return result
}
module.exports={save,restore,fields}
