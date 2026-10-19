'use strict'
const assert=require('node:assert/strict'),crypto=require('node:crypto')
const recovery=require('../cloudfunctions/webLoginApi/serviceRegistrationRecovery.cjs')
const hash=v=>crypto.createHash('sha256').update(v).digest('hex'),actor={userId:'u',openId:'official',phone:'13800000000'},future=new Date(Date.now()+86400000)
const rows={users:{u:{_id:'u',phone:actor.phone,phoneNumber:actor.phone,phoneVerified:true}},teams:{team:{_id:'team',name:'测试球队'}},service_follow_gates:{g:{_id:'g',status:'active',purpose:'player_invite_entry',expiresAt:future,teamId:'team',inviteId:'invite',entryKey:'fixture-entry'}},team_invitations:{invite:{_id:'invite',type:'team_player',status:'active',expiresAt:future,teamId:'team',token:'fixture-entry'}},service_entry_scans:{[hash('g:official')]:{gateId:'g',subscribed:true}},service_entry_sessions:{s:{_id:'s',active:true,purpose:'player_invite_entry',phoneVerified:true,userId:'u',officialOpenId:'official',gateId:'g',entryKey:'fixture-entry',tokenHash:'old',expiresAt:new Date(0),playerRegistrationChoice:{nonce:'choice',mode:'new'},playerRegistrationFormDraft:{choiceToken:'choice',values:{name:'测试球员',idCard:'PRIVATE-IDENTITY'},updatedAt:new Date(1000)},playerRegistrationPortraits:[{id:'owned',fileId:'cloud://private/owned'}]},foreign:{_id:'foreign',active:true,purpose:'player_invite_entry',phoneVerified:true,userId:'other',officialOpenId:'other',gateId:'g',entryKey:'fixture-entry',playerRegistrationFormDraft:{values:{name:'DO NOT EXPOSE'}}}}}
let beforeTx=null,beforeWrite=null,writes=0
const db={command:{gt:v=>({gt:v})},serverDate:()=>new Date(),async runTransaction(fn){if(beforeTx){const hook=beforeTx;beforeTx=null;hook()}return fn(db)},collection(name){
 const match=where=>Object.values(rows[name]||{}).filter(row=>Object.entries(where).every(([k,v])=>v&&v.gt?row[k]>v.gt:row[k]===v))
 const concurrent=()=>{if(beforeWrite){const hook=beforeWrite;beforeWrite=null;hook()}}
 return {
  where(where){return {orderBy(){return this},limit(){return this},async get(){return {data:structuredClone(match(where))}},async update({data}){concurrent();const found=match(where);found.forEach(row=>{writes++;Object.assign(row,structuredClone(data))});return {stats:{updated:found.length}}}}},
  doc(id){return {async get(){return {data:rows[name]?.[id]?structuredClone(rows[name][id]):[]}},async update({data}){concurrent();writes++;Object.assign(rows[name][id],structuredClone(data))}}}
 }
}}
async function main(){
 const listed=await recovery.list(db,actor)
 assert.equal(listed.entries.length,1);assert.equal(listed.entries[0].playerName,'测试球员');assert.ok(!JSON.stringify(listed).includes('PRIVATE-IDENTITY'));assert.ok(!JSON.stringify(listed).includes('tokenHash'));assert.equal(writes,0)
 rows.service_entry_sessions.completed={_id:'completed',active:true,purpose:'player_invite_entry',phoneVerified:true,userId:'u',officialOpenId:'official',gateId:'g',entryKey:'fixture-entry',tokenHash:'completed',createTime:new Date(3000),updateTime:new Date(4000),playerRegistrationChoice:{nonce:'second',mode:'new'},playerRegistrationReceipt:{choiceToken:'first',playerId:'pr_once',name:'已完成球员'},registeredPlayerId:'pr_once',playerRegistrationFormDraft:{choiceToken:'second',values:{name:'第二个球员'},updatedAt:new Date(5000)}}
 rows.service_entry_sessions.emptyonly={_id:'emptyonly',active:true,purpose:'player_invite_entry',phoneVerified:true,userId:'u',officialOpenId:'official',gateId:'g',entryKey:'fixture-entry',tokenHash:'emptyonly',createTime:new Date(2000),playerRegistrationChoice:{nonce:'only',mode:'new'}}
 const listedReady=await recovery.list(db,actor)
 assert.deepEqual(listedReady.entries.map(entry=>[entry.playerName,entry.status]),[['已完成球员','registered'],['第二个球员','draft'],['测试球员','draft']],'completed receipt stays registered while the new draft stays resumable; choice-only sessions are dropped')
 delete rows.service_entry_sessions.completed;delete rows.service_entry_sessions.emptyonly
 await assert.rejects(()=>recovery.resume(db,{...actor,userId:'other'},'s'),e=>e.code==='REGISTRATION_RESUME_INVALID')
 await assert.rejects(()=>recovery.resume(db,{...actor,openId:'different'},'s'),e=>e.code==='REGISTRATION_RESUME_INVALID')
 const original=structuredClone(rows.service_entry_sessions.s)
 const resumed=await recovery.resume(db,actor,'s')
 assert.match(resumed.serviceEntrySession,/^[a-f0-9]{64}$/);assert.equal(rows.service_entry_sessions.s.tokenHash,hash(resumed.serviceEntrySession));assert.notEqual(rows.service_entry_sessions.s.tokenHash,original.tokenHash);assert.ok(new Date(resumed.expiresAt)>new Date())
 assert.deepEqual(rows.service_entry_sessions.s.playerRegistrationFormDraft,original.playerRegistrationFormDraft);assert.deepEqual(rows.service_entry_sessions.s.playerRegistrationChoice,original.playerRegistrationChoice);assert.deepEqual(rows.service_entry_sessions.s.playerRegistrationPortraits,original.playerRegistrationPortraits)
 beforeWrite=()=>rows.service_entry_sessions.s.tokenHash='rotated-elsewhere'
 await assert.rejects(()=>recovery.resume(db,actor,'s'),e=>e.code==='REGISTRATION_RESUME_CHANGED')
 rows.team_invitations.invite.status='revoked'
 await assert.rejects(()=>recovery.resume(db,actor,'s'),e=>e.code==='REGISTRATION_RESUME_INVALID')
 assert.equal((await recovery.list(db,actor)).entries.length,0)
 rows.team_invitations.invite.status='active'
 rows.service_entry_sessions.blank={...structuredClone(rows.service_entry_sessions.s),_id:'blank',playerRegistrationChoice:null,playerRegistrationFormDraft:null,createTime:new Date(),tokenHash:'blank'}
 const recovered=await recovery.afterOAuth(db,actor,'g')
 assert.equal(rows.service_entry_sessions.s.tokenHash,hash(recovered.serviceEntrySession),'fresh OAuth must recover the unfinished draft rather than start a blank session')
 rows.users.u.phoneNumber='13900000000'
 await assert.rejects(()=>recovery.resume(db,actor,'s'),e=>e.code==='SERVICE_PRIVATE_ACCOUNT_UNAVAILABLE')
 console.log('PASS registration recovery: own WeChat/user only, minimal catalog, fresh-auth renewal of expired session, draft/choice/portrait preservation, token rotation, revocation and concurrent rotation rejection, unfinished OAuth recovery and phone conflict')
}
main().catch(e=>{console.error(e);process.exitCode=1})
