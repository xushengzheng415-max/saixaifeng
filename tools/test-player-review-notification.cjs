'use strict'
const assert=require('node:assert/strict'),crypto=require('node:crypto'),notify=require('../cloudfunctions/tournamentRegistrationFlow/playerReviewNotification.cjs')
const taskId='a'.repeat(64),task={_id:taskId,kind:'materials',status:'open',recipientUserIds:['self'],teamId:'team',tournamentId:'event',playerId:'player',playerName:'隔离本人',reason:'照片模糊，请更换',tournamentName:'隔离赛事'},tables={player_review_tasks:[task],notification_outbox:[],service_account_bindings:[]}
function collection(name){return{where(w){return{limit(){return this},async get(){return{data:(tables[name]||[]).filter(r=>Object.entries(w).every(([k,v])=>r[k]===v))}}}},doc(id){return{async get(){return{data:(tables[name]||[]).find(r=>r._id===id)||null}},async set({data}){tables[name]||=[];const i=tables[name].findIndex(r=>r._id===id);if(i<0)tables[name].push({_id:id,...data});else tables[name][i]={_id:id,...data}}}}}}
const db={collection,serverDate:()=>new Date(),runTransaction:async fn=>fn({collection})};let sent=[]
const deps={db,configured:()=>true,rejectTemplate:()=> 'isolated-reject-template',bridge:async(action,p)=>{sent.push({action,p});return{success:true}}}
process.env.SXF_FOOTBALL_SERVICE_ACCOUNT_APPSECRET='isolated-notification-secret'
function request(){const timestamp=Date.now(),nonce='b'.repeat(32);return{taskId,bridgeTimestamp:timestamp,bridgeNonce:nonce,bridgeProof:crypto.createHmac('sha256',process.env.SXF_FOOTBALL_SERVICE_ACCOUNT_APPSECRET).update(['playerReviewTask',taskId,timestamp,nonce].join('|')).digest('hex')}}
;(async()=>{
 assert.equal((await notify({...request(),bridgeProof:'c'.repeat(64)},deps)).code,'BRIDGE_AUTH_FAILED');assert.equal(sent.length,0)
 let r=await notify(request(),deps);assert.equal(r.data.status,'waiting_follow_bind');assert.equal(sent.length,0)
 tables.service_account_bindings.push({_id:'binding',sport:'football',userId:'self',subscribed:true,officialOpenId:'isolated-openid'})
 r=await notify(request(),deps);assert.equal(r.data.status,'configuration_required');assert.equal(sent.length,0,'material reminder never misuses rejection template')
 task.kind='rejected';r=await notify(request(),deps);assert.equal(r.data.status,'delivered');assert.equal(sent.length,1);assert(sent[0].p.message.url.endsWith('task='+taskId));assert.equal(sent[0].p.message.data.thing6.value,'照片模糊，请更换')
 r=await notify(request(),deps);assert.equal(r.data.status,'delivered');assert.equal(sent.length,1,'delivered messages are not repeated')
 assert.equal((await notify({...request(),bridgeTimestamp:0},deps)).code,'BRIDGE_AUTH_FAILED')
 console.log('PASS: signed notification bridge, binding/configuration status, correct rejection template/link and retry deduplication; no external sends')
})().catch(e=>{console.error(e);process.exit(1)})
