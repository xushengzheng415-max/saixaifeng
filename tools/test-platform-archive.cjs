'use strict'
const assert = require('node:assert/strict')
const { setCustomerAssetArchive } = require('../cloudfunctions/manageTournamentCenterContent/platformArchive.cjs')
const data = {users:[{_id:'u'}], teams:[{_id:'t',creatorId:'u',name:'保留球队',status:'active',playerCount:3},{_id:'other',creatorId:'other'}], tournaments:[{_id:'e',creatorId:'u',name:'正式赛',status:'ongoing'}], players:[{_id:'p',teamId:'t',name:'保留球员'}],platform_content_audit_logs:[]}
const db = {command:{or:rows=>({or:rows})},serverDate:()=>new Date(),collection(name){
  let condition,offset=0,size=100
  const matches=(row,c)=>c?.or?c.or.some(x=>matches(row,x)):Object.entries(c||{}).every(([k,v])=>row[k]===v)
  const query={where(c){condition=c;return query},orderBy(){return query},skip(v){offset=v;return query},limit(v){size=v;return query},async get(){return {data:(data[name]||[]).filter(row=>matches(row,condition)).slice(offset,offset+size)}},doc(id){return {async get(){return {data:(data[name]||[]).filter(row=>row._id===id)}},async update({data:patch}){Object.assign(data[name].find(row=>row._id===id),patch)},async set({data:row}){(data[name] ||= []).push({_id:id,...row})}}}};return query
},async runTransaction(fn){const before=structuredClone(data);try{return await fn(db)}catch(e){for(const k of Object.keys(data))delete data[k];Object.assign(data,before);throw e}}}
const owner={_id:'platform-owner',isPlatformOwner:true}
const event={userId:'u',kind:'teams',archived:true,items:[{id:'t',revision:0}]}
;(async()=>{
  await assert.rejects(setCustomerAssetArchive(db,event,{_id:'ordinary'}),/平台负责人/)
  await assert.rejects(setCustomerAssetArchive(db,{...event,items:[{id:'other',revision:0}]},owner),/其他客户/)
  assert.equal((await setCustomerAssetArchive(db,event,owner)).changedCount,1)
  assert.equal(data.teams[0].platformArchived,true)
  assert.equal(data.teams[0].status,'active');assert.equal(data.players.length,1)
  assert.equal((await setCustomerAssetArchive(db,event,owner)).changedCount,0)
  await assert.rejects(setCustomerAssetArchive(db,{...event,archived:false},owner),/状态已被更新/)
  assert.equal((await setCustomerAssetArchive(db,{...event,archived:false,items:[{id:'t',revision:1}]},owner)).changedCount,1)
  assert.equal(data.teams[0].platformArchived,false)
  await setCustomerAssetArchive(db,{...event,kind:'tournaments',items:[{id:'e',revision:0}]},owner)
  assert.equal(data.tournaments[0].status,'ongoing')
  assert.equal(data.platform_content_audit_logs.length,3)
  console.log('PASS: archive/restore, owner-only access, customer scope, retries, revision conflicts, audit and preserved business data')
})().catch(e=>{console.error(e);process.exitCode=1})
