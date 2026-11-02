'use strict'
const crypto=require('crypto'),{editableImportedProfile}=require('./importPersonFields.cjs')
module.exports=async function identity(event,{db}){
 const taskId=String(event.taskId||''),playerId=String(event.playerId||''),number=String(event.identityNumber||'').trim().toUpperCase(),type=String(event.documentType||''),timestamp=Number(event.bridgeTimestamp),nonce=String(event.bridgeNonce||''),proof=String(event.bridgeProof||''),secret=String(process.env.SXF_FOOTBALL_SERVICE_ACCOUNT_APPSECRET||'')
 if(!secret||!Number.isFinite(timestamp)||Math.abs(Date.now()-timestamp)>300000||!/^[a-f0-9]{32}$/.test(nonce)||!/^[a-f0-9]{64}$/.test(proof)||!/^[a-f0-9]{64}$/.test(taskId)||number.length>30)return{success:false,code:'BRIDGE_AUTH_FAILED'}
 const canonical=['playerReviewIdentity',taskId,playerId,type,crypto.createHash('sha256').update(number).digest('hex'),timestamp,nonce].join('|'),expected=crypto.createHmac('sha256',secret).update(canonical).digest()
 if(!crypto.timingSafeEqual(expected,Buffer.from(proof,'hex')))return{success:false,code:'BRIDGE_AUTH_FAILED'}
 const r=await db.collection('player_review_tasks').doc(taskId).get(),task=Array.isArray(r.data)?r.data[0]:r.data
 if(!task||task.status!=='open'||!(task.playerIds||[]).includes(playerId))return{success:false,code:'TASK_NOT_OPEN'}
 try{editableImportedProfile({identityNumber:number,documentType:type})}catch(e){return{success:false,code:'PROFILE_INVALID',error:e.message}}
 const key=String(process.env.SXF_IDENTITY_HASH_KEY||'')
 if(!key)return{success:false,code:'IDENTITY_HASH_KEY_REQUIRED',error:'证件核验暂不可用，请稍后重试'}
 return{success:true,identityDigest:crypto.createHmac('sha256',key).update('football:identity:'+number).digest('hex')}
}
