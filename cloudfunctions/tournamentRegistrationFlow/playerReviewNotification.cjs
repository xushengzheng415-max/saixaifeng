'use strict'
const crypto=require('crypto')
const text=v=>String(v==null?'':v).trim()
const unique=a=>[...new Set(a.map(text).filter(Boolean))]
const REMINDER_SUBSCRIBE_TEMPLATE_ID=(text(process.env.SXF_FOOTBALL_SERVICE_PARENT_PROFILE_REVIEW_TEMPLATE_ID)||'wx5nOaRkbHMb97LTkTA95ShbEIZhVILIgapcU9VDBqk')
// 客服消息只能在家长与公众号互动后的 48 小时内发送；没有互动时间就按“未知”处理。
const CUSTOM_WINDOW_MS=48*3600*1000
const taskUrl=id=>'https://www.sxffootball.cn/service-account-h5/player-review.html?task='+encodeURIComponent(id)
const shanghaiMinute=()=>{const d=new Date(Date.now()+8*3600000);return d.toISOString().slice(0,16).replace('T',' ')}
const short=(v,max)=>Array.from(text(v)).slice(0,max||20).join('')
const stamp=v=>{
 if(!v)return 0
 if(v instanceof Date)return v.getTime()
 if(typeof v==='number')return v
 const raw=v&&typeof v==='object'?(v.$date||v._date||v.date||v):v
 const at=new Date(raw).getTime()
 return Number.isFinite(at)?at:0
}
let tokenCache=null

// 订阅通知必须用服务号 AccessToken。本函数已有 SXF_FOOTBALL_SERVICE_ACCOUNT_APPID/APPSECRET 环境变量，
// 与 webLoginApi 既有 bizsend 实现同一条微信接口写法；失败时记录真实 errcode，不静默降级。
async function subscribeAccessToken(){
 if(tokenCache&&tokenCache.expiresAt>Date.now()+120000)return tokenCache.value
 const appId=text(process.env.SXF_FOOTBALL_SERVICE_ACCOUNT_APPID),appSecret=text(process.env.SXF_FOOTBALL_SERVICE_ACCOUNT_APPSECRET)
 if(!appId||!appSecret){const error=new Error('服务号 AppID/AppSecret 未配置');error.code='SERVICE_CREDENTIALS_REQUIRED';throw error}
 const response=await fetch('https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid='+encodeURIComponent(appId)+'&secret='+encodeURIComponent(appSecret))
 const data=await response.json().catch(()=>({}))
 if(!data.access_token){const error=new Error(text(data.errmsg)||('获取服务号接口凭据失败('+(data.errcode||response.status)+')'));error.code='WECHAT_'+(data.errcode||response.status);throw error}
 tokenCache={value:data.access_token,expiresAt:Date.now()+Math.max(300,Number(data.expires_in||7200)-300)*1000}
 return tokenCache.value
}

async function sendSubscribeNotification(openId,task){
 const accessToken=await subscribeAccessToken()
 const playerId=text(task.playerId)
 const message={
  touser:openId,
  template_id:REMINDER_SUBSCRIBE_TEMPLATE_ID,
  data:{
   thing19:{value:short(task.kind==='claim'?'球员认领提醒':'球员资料登记')},
   thing32:{value:short(task.teamName||'球队')},
   thing29:{value:short(task.kind==='claim'?('未认领'+Number((task.playerIds||[]).length||0)+'人'):(task.playerName||'球员'))},
   thing10:{value:short(task.kind==='claim'?'待认领':'待补资料')},
   time9:{value:shanghaiMinute()}
  }
 }
 if(playerId)message.miniprogram={appid:text(process.env.SXF_FOOTBALL_MINIPROGRAM_APPID||'wx57164cca8676f411'),pagepath:'pages/team/player-detail/player-detail?teamId='+encodeURIComponent(text(task.teamId))+'&playerId='+encodeURIComponent(playerId)}
 const response=await fetch('https://api.weixin.qq.com/cgi-bin/message/subscribe/bizsend?access_token='+encodeURIComponent(accessToken),{method:'POST',headers:{'content-type':'application/json; charset=utf-8'},body:JSON.stringify(message)})
 const payload=await response.json().catch(()=>({}))
 if(!response.ok||Number(payload.errcode||0)!==0){const error=new Error(text(payload.errmsg)||'服务号订阅通知发送失败');error.code='WECHAT_'+(payload.errcode||response.status);throw error}
 return payload
}

function customText(task,url){
 const headline=task.kind==='claim'?'认领提醒':'补资料提醒'
 const detail=task.kind==='claim'
  ?('球队“'+text(task.teamName)+'”还有'+Number((task.playerIds||[]).length||0)+'名球员未认领')
  :('球员“'+text(task.playerName)+'”需要补充：'+short(task.reason,80))
 return ['【赛小蜂足球】'+headline,detail,'点此处理：'+url,'也可在服务号「我的参赛资料」查看“待补 N 项”直接补交。'].join('\n')
}

module.exports=async function notify(event,{db,bridge,configured,rejectTemplate}){
 const secret=text(process.env.SXF_FOOTBALL_SERVICE_ACCOUNT_APPSECRET),timestamp=Number(event.bridgeTimestamp),nonce=text(event.bridgeNonce),proof=text(event.bridgeProof),taskId=text(event.taskId)
 if(!secret||! /^[a-f0-9]{64}$/.test(taskId)||! /^[a-f0-9]{64}$/.test(proof)||! /^[a-f0-9]{32}$/.test(nonce)||Math.abs(Date.now()-timestamp)>300000||!Number.isFinite(timestamp))return {success:false,code:'BRIDGE_AUTH_FAILED'}
 const expected=crypto.createHmac('sha256',secret).update(['playerReviewTask',taskId,timestamp,nonce].join('|')).digest()
 if(!crypto.timingSafeEqual(expected,Buffer.from(proof,'hex')))return {success:false,code:'BRIDGE_AUTH_FAILED'}
 const result=await db.collection('player_review_tasks').doc(taskId).get(),task=Array.isArray(result.data)?result.data[0]:result.data
 if(!task||task.status!=='open')return {success:false,code:'TASK_NOT_OPEN'}
 const url=taskUrl(taskId)
 const results=[]
 for(const userId of task.recipientUserIds||[]){
  const id=crypto.createHash('sha256').update(taskId+'|'+userId+'|service_account').digest('hex')
  const prior=(await db.collection('notification_outbox').where({_id:id}).limit(1).get()).data||[]
  if(prior[0]&&prior[0].status==='delivered'&&text(prior[0].deliveryChannel)){results.push({status:'delivered',channel:text(prior[0].deliveryChannel)});continue}
  if(prior[0]&&prior[0].status==='sending'&&Date.now()-stamp(prior[0].attemptedAt)<60000){results.push({status:'queued',channel:'inbox',errorCode:'SENDING'});continue}
  const record=async(status,extra={})=>db.collection('notification_outbox').doc(id).set({data:{sport:'football',businessEventId:'player_review_task:'+taskId,taskId,userId,recipientUserId:userId,tournamentId:task.tournamentId,teamId:task.teamId,playerId:task.playerId||'',channel:'service_account',targetPage:url,status,attemptedAt:db.serverDate(),updateTime:db.serverDate(),...extra}})
  const bindings=(await db.collection('service_account_bindings').where({sport:'football',userId,subscribed:true}).limit(10).get()).data||[]
  const valid=bindings.filter(b=>b.active!==false&&b.disabled!==true&&!['revoked','replaced','deleted','unbound','disabled'].includes(text(b.status))&&text(b.officialOpenId))
  const openIds=unique(valid.map(b=>text(b.officialOpenId)))
  const attempts=[]
  if(openIds.length!==1){
   const errorCode=openIds.length?'BINDING_CONFLICT':'SERVICE_BINDING_REQUIRED'
   await record('queued',{deliveryChannel:'inbox',errorCode,attempts})
   results.push({status:'queued',channel:'inbox',errorCode});continue
  }
  const openId=openIds[0],binding=valid.find(b=>text(b.officialOpenId)===openId)||{}
  // 第一层：家长仍有剩余次数的服务号订阅通知，可随时发送，不受 48 小时限制。
  let subscription=null
  if(REMINDER_SUBSCRIBE_TEMPLATE_ID&&text(task.playerId)){
   const rows=(await db.collection('parent_profile_review_subscriptions').where({teamId:text(task.teamId),playerId:text(task.playerId),officialOpenId:openId,templateId:REMINDER_SUBSCRIBE_TEMPLATE_ID,status:'accepted'}).limit(5).get()).data||[]
   subscription=rows.map(row=>({...row,remaining:Number(row.remaining==null?1:row.remaining)})).filter(row=>row.remaining>0).sort((a,b)=>stamp(b.authorizedAt)-stamp(a.authorizedAt))[0]||null
  }
  if(subscription){
   try{
    const sent=await sendSubscribeNotification(openId,task)
    const remaining=Math.max(0,Number(subscription.remaining||1)-1)
    await db.collection('parent_profile_review_subscriptions').doc(subscription._id).update({data:{remaining,status:remaining>0?'accepted':'sent',lastSentAt:db.serverDate(),lastSendTaskId:taskId,lastSendErrorCode:'',lastSendErrorMessage:'',updateTime:db.serverDate()}})
    await record('delivered',{deliveryChannel:'service_subscribe',messageId:text(sent.msgid),subscriptionId:text(subscription._id),remaining,attempts})
    results.push({status:'delivered',channel:'service_subscribe'});continue
   }catch(error){
    const errorCode=text(error.code||'SERVICE_SUBSCRIBE_SEND_FAILED'),errorMessage=short(error.message||'服务号订阅通知发送失败',200)
    await db.collection('parent_profile_review_subscriptions').doc(subscription._id).update({data:{lastSendErrorCode:errorCode,lastSendErrorMessage:errorMessage,lastSendAttemptAt:db.serverDate(),updateTime:db.serverDate()}})
    attempts.push({channel:'service_subscribe',status:'failed',errorCode,errorMessage})
   }
  }
  // 驳回类任务保留已登记的驳回模板（历史 kind='rejected' 记录），只发已登记用途的模板，不冒充。
  const rejectionTemplate=task.kind==='rejected'?text(rejectTemplate&&rejectTemplate()):''
  if(rejectionTemplate&&configured()){
   try{
    const time=shanghaiMinute()
    const sent=await bridge('template/send',{message:{touser:openId,template_id:rejectionTemplate,url,data:{thing2:{value:short(task.playerName)},time3:{value:time},thing6:{value:short(task.reason)},thing9:{value:short(task.tournamentName)}}}})
    if(!sent||sent.success!==true)throw Object.assign(new Error(text(sent&&sent.message)||'服务号模板消息发送失败'),{code:'SERVICE_TEMPLATE_SEND_FAILED'})
    await record('delivered',{deliveryChannel:'service_template',attempts})
    results.push({status:'delivered',channel:'service_template'});continue
   }catch(error){
    attempts.push({channel:'service_template',status:'failed',errorCode:text(error.code||error.wechatCode||'SERVICE_TEMPLATE_SEND_FAILED'),errorMessage:short(error.message||'服务号模板消息发送失败',200)})
   }
  }
  // 第二层：48 小时内互动过的家长走客服消息（零授权成本）；互动时间缺失即按未知处理。
  const lastInteractAt=stamp(binding.lastInteractAt)
  if(!configured()){
   attempts.push({channel:'service_custom',status:'skipped',errorCode:'SERVICE_BRIDGE_REQUIRED',errorMessage:'服务号固定出口中转未配置'})
  }else if(!lastInteractAt){
   attempts.push({channel:'service_custom',status:'skipped',errorCode:'INTERACTION_UNKNOWN',errorMessage:'未记录家长最近互动时间，按未知处理'})
  }else if(Date.now()-lastInteractAt>CUSTOM_WINDOW_MS){
   attempts.push({channel:'service_custom',status:'skipped',errorCode:'INTERACTION_EXPIRED',errorMessage:'家长最近互动已超过 48 小时'})
  }else{
   try{
    const sent=await bridge('custom/send',{message:{touser:openId,msgtype:'text',text:{content:customText(task,url)}}})
    if(!sent||sent.success!==true)throw Object.assign(new Error(text(sent&&sent.message)||'客服消息发送失败'),{code:'SERVICE_CUSTOM_SEND_FAILED'})
    await record('delivered',{deliveryChannel:'service_custom',lastInteractAt:binding.lastInteractAt,attempts})
    results.push({status:'delivered',channel:'service_custom'});continue
   }catch(error){
    attempts.push({channel:'service_custom',status:'failed',errorCode:text(error.code||error.wechatCode||'SERVICE_CUSTOM_SEND_FAILED'),errorMessage:short(error.message||'客服消息发送失败',200)})
   }
  }
  // 第三层：站内待办。任务与站内消息已在 webLoginApi 创建，家长在「我的参赛资料」看到「待补 N 项」。
  const lastAttempt=attempts[attempts.length-1]||{}
  await record('queued',{deliveryChannel:'inbox',errorCode:text(lastAttempt.errorCode)||'TASK_ONLY',errorMessage:text(lastAttempt.errorMessage),attempts})
  results.push({status:'queued',channel:'inbox',errorCode:text(lastAttempt.errorCode)||'TASK_ONLY',attempts})
 }
 const total=results.length,delivered=results.filter(r=>r.status==='delivered').length,queued=results.filter(r=>r.status==='queued').length
 const status=total&&delivered===total?'delivered':total&&queued===total?'queued':'partial'
 // 只记录通道与错误码，便于线上只读日志核对，不含任何凭据。
 console.log('[playerReviewNotify]',taskId,JSON.stringify({status,delivered,queued,total,results}))
 // 短信兜底：本轮不发送，只在返回值里保留通道位，接入时由运维配置后在此补实现。
 return {success:true,data:{status,channel:results[0]&&results[0].channel||'inbox',delivered,queued,total,todo:'inbox',sms:'unavailable',results}}
}
