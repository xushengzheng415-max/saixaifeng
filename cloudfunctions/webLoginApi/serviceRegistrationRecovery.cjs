'use strict'
const crypto=require('node:crypto')
const suite={document:require('./playerCardReader.cjs').document}
const preload=require('./playerCardPreload.cjs')
const text=v=>String(v==null?'':v).trim()
const time=v=>v?new Date(v.$date||v._date||v).getTime()||0:0
const hash=v=>crypto.createHash('sha256').update(text(v)).digest('hex')
const fail=(code,message)=>{throw Object.assign(new Error(message),{code})}
// CloudBase 行锁冲突（TransactionBusy / -501001）属瞬时并发保护，做有限退避重试；
// 业务错误（邀请已变化等）立即抛出，不做无意义重试。
const BUSY_PATTERN=/transactionbusy|transaction is busy|-501001/i
const asBusyText=failure=>text(failure&&failure.code)+' '+text(failure&&(failure.message||failure.error))
async function retryBusy(run,attempts,label){
  for(let attempt=0;;attempt++){
    try{return await run()}
    catch(error){
      if(attempt>=attempts-1||!BUSY_PATTERN.test(asBusyText(error)))throw error
      console.warn('[service-recovery] busy retry',label,attempt+1)
      await new Promise(resolve=>setTimeout(resolve,200*(attempt+1)))
    }
  }
}
const read=(db,collection,id)=>retryBusy(()=>suite.document(db,collection,id),4,'doc:'+collection)
function identity(actor){if(!text(actor?.userId)||!text(actor?.openId)||!/^1[3-9]\d{9}$/.test(text(actor?.phone)))fail('SERVICE_PRIVATE_AUTH_REQUIRED','请先验证当前微信账号')}
async function scope(db,row,actor){
  if(!row?.active||row.phoneVerified!==true||text(row.userId)!==actor.userId||text(row.officialOpenId)!==actor.openId||row.purpose!=='player_invite_entry')return null
  const gate=await read(db,'service_follow_gates',row.gateId)
  if(!gate||gate.status!=='active'||gate.purpose!=='player_invite_entry'||time(gate.expiresAt)<=Date.now()||text(gate.entryKey)!==text(row.entryKey))return null
  const [invite,team,scan]=await Promise.all([read(db,'team_invitations',gate.inviteId),read(db,'teams',gate.teamId),read(db,'service_entry_scans',hash(text(gate._id)+':'+actor.openId))])
  if(!invite||invite.type!=='team_player'||!['active','pending'].includes(invite.status)||time(invite.expiresAt)<=Date.now()||text(invite.token)!==text(gate.entryKey)||text(invite.teamId)!==text(gate.teamId))return null
  if(!team||team.isDeleted||['deleted','archived'].includes(text(team.status))||!scan||scan.subscribed!==true||text(scan.gateId)!==text(gate._id))return null
  if(text(invite.expectedPhone)&&text(invite.expectedPhone)!==actor.phone)return null
  return {gate,team}
}
async function candidates(db,actor,gateId){
  identity(actor)
  const rows=await retryBusy(()=>preload.readAll(db,'service_entry_sessions',{userId:actor.userId,officialOpenId:actor.openId,active:true}),4,'candidates')
  const result=[]
  for(const row of rows){if(gateId&&text(row.gateId)!==text(gateId))continue;const loaded=await scope(db,row,actor);if(loaded)result.push({...loaded,row})}
  return result.sort((a,b)=>time(b.row.playerRegistrationFormDraft?.updatedAt||b.row.updateTime||b.row.createTime)-time(a.row.playerRegistrationFormDraft?.updatedAt||a.row.updateTime||a.row.createTime)||text(a.row._id).localeCompare(text(b.row._id)))
}
async function list(db,actor){
  const rows=await candidates(db,actor),seen=new Set(),entries=[]
  const push=(gateId,reference,entry)=>{
    const key=JSON.stringify([gateId,reference])
    if(seen.has(key))return
    seen.add(key)
    entries.push(entry)
  }
  for(const {row,team} of rows){
    const teamName=text(team.name||team.teamName)
    const receipt=row.playerRegistrationReceipt,choice=row.playerRegistrationChoice,draft=row.playerRegistrationFormDraft
    const draftName=text(draft&&draft.values&&draft.values.name)
    // 已完成的登记以回执为唯一凭据：同一会话完成后再登记其他球员（邀请usageMode=multi）会生成
    // 新的choice并覆盖draft，不能因此把已提交成功的那次显示成「待提交」。
    if(receipt&&text(receipt.playerId))push(row.gateId,'registered:'+text(receipt.playerId),{id:text(row._id),teamName,playerName:text(receipt.name)||draftName,status:'registered',updatedAt:time(row.updateTime||row.createTime)})
    // 进行中的登记：只有确实填过内容（草稿属于当前choice且不属于已完成的那次提交）才值得继续，
    // 只选过模式或只传过照片的空会话不再堆在列表里。
    if(draftName&&text(draft.choiceToken)&&text(draft.choiceToken)===text(choice&&choice.nonce)&&text(draft.choiceToken)!==text(receipt&&receipt.choiceToken))
      push(row.gateId,'draft:'+text(draft.choiceToken),{id:text(row._id),teamName,playerName:draftName,status:'draft',updatedAt:time(draft.updatedAt||row.updateTime||row.createTime)})
  }
  return {success:true,entries}
}
async function rotate(db,actor,record){
  identity(actor)
  const token=crypto.randomBytes(32).toString('hex'),expiresAt=new Date(Date.now()+12*3600000)
  // 令牌轮换只用一次原子条件写入，不开事务：同一会话可能被多个页面/多次重试同时打开，
  // 事务会让它们互相加锁并反复出现 TransactionBusy。条件写入保证只有一个请求轮换成功。
  const current=await read(db,'service_entry_sessions',record._id)
  if(!current||!await scope(db,current,actor))fail('REGISTRATION_RESUME_INVALID','登记邀请已变化，请重新扫码')
  if(text(current.tokenHash)!==text(record.tokenHash))fail('REGISTRATION_RESUME_CHANGED','登记已在别处打开，请重新选择')
  const user=await read(db,'users',actor.userId)
  if(!user||user.phoneVerified!==true||user.disabled===true||['deleted','disabled','banned'].includes(text(user.status))||text(user.phone||user.phoneNumber)!==actor.phone||user.phone&&user.phoneNumber&&text(user.phone)!==text(user.phoneNumber))fail('SERVICE_PRIVATE_ACCOUNT_UNAVAILABLE','账号状态已变化，请重新验证')
  const written=await retryBusy(()=>db.collection('service_entry_sessions').where({_id:current._id,tokenHash:record.tokenHash}).update({data:{tokenHash:hash(token),phone:actor.phone,expiresAt,updateTime:db.serverDate()}}),4,'rotate-write')
  if(Number(written?.stats?.updated||0)!==1)fail('REGISTRATION_RESUME_CHANGED','登记已在别处打开，请重新选择')
  return {success:true,entry:text(record.entryKey),serviceEntrySession:token,expiresAt:expiresAt.toISOString()}
}
async function resume(db,actor,id){
  identity(actor)
  const row=await read(db,'service_entry_sessions',text(id))
  if(!await scope(db,row,actor))fail('REGISTRATION_RESUME_INVALID','登记不可用，请重新选择')
  return rotate(db,actor,row)
}
async function afterOAuth(db,actor,gateId){
  const rows=await candidates(db,actor,gateId)
  const unfinished=rows.filter(({row})=>row.playerRegistrationFormDraft&&row.playerRegistrationChoice?.nonce!==row.playerRegistrationReceipt?.choiceToken)
  const selected=(unfinished.length?unfinished:rows)[0]
  return selected?rotate(db,actor,selected.row):null
}
module.exports={list,resume,afterOAuth,scope}
