const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
const path=require('node:path')
const {createRequire}=require('node:module')
const {editableImportedProfile:profile}=require('../cloudfunctions/tournamentRegistrationFlow/importPersonFields.cjs')
const identityNumber='11010519491231002X' // public validation example; never sent to a service
const resident=profile({identityNumber,documentType:'resident_id',strongFoot:'left',height:178,weight:72,position:'中场'})
assert.equal(profile({identityNumber,nationality:''}).nationality,'')
assert.equal(resident.birthDate,'1949-12-31');assert.equal(resident.gender,'female');assert.equal(resident.nationality,'中国')
assert.throws(()=>profile({identityNumber:identityNumber.slice(0,-1)+'1'}),/校验/)
assert.throws(()=>profile({identityNumber,birthDate:'2000-01-01'}),/出生日期与/)
assert.throws(()=>profile({identityNumber,gender:'male'}),/性别与/)
assert.throws(()=>profile({birthDate:'2025-02-30'}),/出生日期/)
assert.throws(()=>profile({height:0}),/身高/)
assert.throws(()=>profile({weight:Infinity}),/体重/)
assert.throws(()=>profile({strongFoot:'unknown'}),/惯用脚/)
assert.throws(()=>profile({documentType:'unsupported'}),/请选择/)
const passport=profile({documentType:'passport',identityNumber:'QA00012345',nationality:'法国',birthDate:'1998-06-03',gender:'male',position:'前锋',strongFoot:'both',height:181.5,weight:76})
assert.equal(passport.identityNumber,'QA00012345');assert.equal(passport.nationality,'法国')
assert.equal(profile({documentType:'passport',identityNumber:'QA00012345'}).nationality,'')
const missing=profile({height:'',weight:''});assert.equal(missing.height,null);assert.equal(missing.weight,null);assert.equal(missing.identityIncomplete,true)
// Execute actual import handler with in-memory DB; no network or real users.
const writes=[]
const chain=name=>({where(){return this},limit(){return this},skip(){return this},orderBy(){return this},async get(){return {data:[]}},async add({data}){const _id='qa-'+writes.length;writes.push({name,_id,data});return {_id}},doc(id){return {async get(){return {data:writes.find(w=>w._id===id)?.data || null}},async update({data}){const row=writes.find(w=>w._id===id);if(row)Object.assign(row.data,data)},async remove(){}}}})
const db={command:{in:values=>values,neq:value=>value},collection:chain,serverDate:()=>new Date('2026-11-01T00:00:00Z')}
const cloud={init(){},database:()=>db}
const entry=path.resolve('cloudfunctions/tournamentRegistrationFlow/index.js')
const localRequire=createRequire(entry)
const sandbox={require:name=>name==='wx-server-sdk'?cloud:localRequire(name),exports:{},console,process:{env:{SXF_IDENTITY_HASH_KEY:'isolated-test-only'}},Buffer,Date,Set,Map}
vm.createContext(sandbox)
vm.runInContext(fs.readFileSync(entry,'utf8')+`
webActor=async()=>({userId:'qa-user',orgId:'qa-org'});getDocument=async(name)=>name==='tournaments'?{_id:'qa-event',orgId:'qa-org',status:'registering'}:{_id:'qa-division',tournamentId:'qa-event',registrationEnabled:true};listAll=async()=>[];addAudit=async()=>{};exports.importBatch=importTeamRegistrationBatch;`,sandbox)
async function run(){
 const result=await sandbox.exports.importBatch({tournamentId:'qa-event',divisionId:'qa-division',teams:[{name:'隔离资料编辑测试队',contactName:'测试负责人',contactPhone:'13800000000',sourceFileId:'cloud://qa/football/team-registration-imports/qa-event/source.docx',players:[{name:'测试护照球员',...passport,jerseyNumber:'9',jerseyName:'QA',photoFileId:'cloud://qa/player-photos/imports/qa-event/portrait.png'}]}]})
 assert.equal(result.success,true,JSON.stringify(result))
 const draft=writes.find(w=>w.name==='registration_player_drafts').data
 const player=writes.find(w=>w.name==='players').data
 const snapshot=writes.find(w=>w.name==='registration_import_batches').data.snapshot.players[0]
 for(const row of [draft,player,snapshot]){for(const key of ['position','strongFoot','height','weight','documentType','nationality','birthDate','gender'])assert.equal(row[key],passport[key],key);assert.equal(JSON.stringify(row).includes(passport.identityNumber),false,'raw number must not leak into profile/snapshot')}
 assert.equal(player.photoFileID,'cloud://qa/player-photos/imports/qa-event/portrait.png')
 const count=writes.length
 await assert.rejects(()=>sandbox.exports.importBatch({tournamentId:'qa-event',divisionId:'qa-division',teams:[{name:'非法资料测试队',contactName:'测试',contactPhone:'13800000000',sourceFileId:'cloud://qa/football/team-registration-imports/qa-event/source.docx',players:[{name:'测试',height:-1}]}]}),/身高/)
 assert.equal(writes.length,count,'invalid profile rejected before writes')
 const pendingStart=writes.length
 const pendingResult=await sandbox.exports.importBatch({tournamentId:'qa-event',divisionId:'qa-division',teams:[{name:'证件待补齐隔离测试队',contactName:'测试负责人',contactPhone:'13800000000',sourceFileId:'cloud://qa/football/team-registration-imports/qa-event/pending.docx',players:[{name:'待补齐测试球员',identityNumber:'',documentType:'resident_id',identityIncomplete:true,eligibilityReviewRequired:true,birthDate:'1998-06-03',gender:'male',nationality:'中国',strongFoot:'left',height:178,weight:72}]}]})
 assert.equal(pendingResult.success,true,JSON.stringify(pendingResult))
 const pendingWrites=writes.slice(pendingStart)
 const pendingDraft=pendingWrites.find(w=>w.name==='registration_player_drafts').data
 const pendingPlayer=pendingWrites.find(w=>w.name==='players').data
 const pendingRoster=pendingWrites.find(w=>w.name==='roster_snapshots').data
 assert.equal(pendingDraft.reviewStatus,'draft');assert.equal(pendingDraft.eligibilityReviewRequired,true)
 assert.equal(pendingPlayer.identityStatus,'not_verified');assert.equal(pendingPlayer.eligibilityReviewRequired,true);assert.equal(pendingPlayer.strongFoot,'left')
 assert.equal(pendingRoster.playerIds.length,0,'pending identity must not become a qualified roster entry')
 console.log('PASS: profile validation and actual import handler persist extended fields in draft, player and immutable snapshot; invalid input makes zero writes')
}
run().catch(e=>{console.error(e);process.exit(1)})
