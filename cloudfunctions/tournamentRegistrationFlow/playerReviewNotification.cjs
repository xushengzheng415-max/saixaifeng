'use strict'
const crypto=require('crypto')
const text=v=>String(v==null?'':v).trim()
module.exports=async function notify(event,{db,bridge,configured,rejectTemplate}){
 const secret=text(process.env.SXF_FOOTBALL_SERVICE_ACCOUNT_APPSECRET),timestamp=Number(event.bridgeTimestamp),nonce=text(event.bridgeNonce),proof=text(event.bridgeProof),taskId=text(event.taskId)
 if(!secret||! /^[a-f0-9]{64}$/.test(taskId)||! /^[a-f0-9]{64}$/.test(proof)||! /^[a-f0-9]{32}$/.test(nonce)||Math.abs(Date.now()-timestamp)>300000||!Number.isFinite(timestamp))return {success:false,code:'BRIDGE_AUTH_FAILED'}
 const expected=crypto.createHmac('sha256',secret).update(['playerReviewTask',taskId,timestamp,nonce].join('|')).digest()
 if(!crypto.timingSafeEqual(expected,Buffer.from(proof,'hex')))return {success:false,code:'BRIDGE_AUTH_FAILED'}
 const result=await db.collection('player_review_tasks').doc(taskId).get(),task=Array.isArray(result.data)?result.data[0]:result.data
 if(!task||task.status!=='open')return {success:false,code:'TASK_NOT_OPEN'}
 const url='https://www.sxffootball.cn/service-account-h5/player-review.html?task='+encodeURIComponent(taskId)
 const results=[]
 for(const userId of task.recipientUserIds||[]){
  const id=crypto.createHash('sha256').update(taskId+'|'+userId+'|service_account').digest('hex')
  const prior=(await db.collection('notification_outbox').where({_id:id}).limit(1).get()).data||[]
  if(prior[0]&&prior[0].status==='delivered'){results.push('delivered');continue}
  if(prior[0]&&prior[0].status==='sending'&&Date.now()-new Date(prior[0].attemptedAt).getTime()<60000){results.push('sending');continue}
  const record=async(status,extra={})=>db.collection('notification_outbox').doc(id).set({data:{sport:'football',businessEventId:'player_review_task:'+taskId,taskId,userId,recipientUserId:userId,tournamentId:task.tournamentId,teamId:task.teamId,playerId:task.playerId||'',channel:'service_account',targetPage:url,status,attemptedAt:db.serverDate(),...extra}})
  const bindings=(await db.collection('service_account_bindings').where({sport:'football',userId,subscribed:true}).limit(10).get()).data||[]
  const valid=bindings.filter(b=>b.active!==false&&b.disabled!==true&&!['revoked','replaced','deleted','unbound','disabled'].includes(text(b.status))&&text(b.officialOpenId))
  const openIds=[...new Set(valid.map(b=>text(b.officialOpenId)))]
  if(openIds.length!==1){await record('waiting_follow_bind',{errorCode:openIds.length?'BINDING_CONFLICT':'SERVICE_BINDING_REQUIRED'});results.push('waiting_follow_bind');continue}
  // Only use templates registered for this purpose. A reminder is never labelled a rejection.
  const templateId=task.kind==='rejected'?rejectTemplate():text(process.env.SXF_FOOTBALL_SERVICE_TEMPLATE_PLAYER_REMINDER)
  if(!templateId||!configured()){await record('configuration_required',{errorCode:!templateId?'REMINDER_TEMPLATE_REQUIRED':'SERVICE_BRIDGE_REQUIRED'});results.push('configuration_required');continue}
  const time=new Date(Date.now()+8*3600000).toISOString().slice(0,16).replace('T',' ')
  const short=v=>Array.from(text(v)).slice(0,20).join('')
  const data=task.kind==='rejected'?{thing2:{value:short(task.playerName)},time3:{value:time},thing6:{value:short(task.reason)},thing9:{value:short(task.tournamentName)}}:
   {thing1:{value:short(task.kind==='claim'?task.teamName:task.playerName)},thing2:{value:short(task.kind==='claim'?'请组织'+task.playerIds.length+'名球员认领':task.reason)},time3:{value:time}}
  const lease=await db.runTransaction(async tx=>{
   let current=null
   try{const r=await tx.collection('notification_outbox').doc(id).get();current=Array.isArray(r.data)?r.data[0]:r.data}catch(e){if(!/not exist|not found/i.test(e.message||''))throw e}
   if(current&&current.status==='delivered')return 'delivered'
   if(current&&current.status==='sending'&&Date.now()-new Date(current.attemptedAt).getTime()<300000)return 'sending'
   await tx.collection('notification_outbox').doc(id).set({data:{sport:'football',businessEventId:'player_review_task:'+taskId,taskId,recipientUserId:userId,tournamentId:task.tournamentId,teamId:task.teamId,channel:'service_account',targetPage:url,status:'sending',attemptedAt:db.serverDate()}})
   return 'acquired'
  })
  if(lease!=='acquired'){results.push(lease);continue}
  try{const sent=await bridge('template/send',{message:{touser:openIds[0],template_id:templateId,url,data}});const state=sent&&sent.success===true?'delivered':'failed';await record(state);results.push(state)}catch(e){await record('failed',{errorCode:text(e.code)||'SERVICE_SEND_FAILED'});results.push('failed')}
 }
 const status=results.length&&results.every(s=>s==='delivered')?'delivered':results.includes('failed')?'failed':results.includes('configuration_required')?'configuration_required':results.includes('sending')?'sending':'waiting_follow_bind'
 return {success:true,data:{status,delivered:results.filter(s=>s==='delivered').length,total:results.length}}
}
