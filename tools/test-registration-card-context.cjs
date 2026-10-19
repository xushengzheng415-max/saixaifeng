'use strict'
const assert=require('node:assert/strict')
const context=require('../cloudfunctions/webLoginApi/registrationCardContext.cjs')
const resume=require('../cloudfunctions/webLoginApi/serviceRegistrationResume.cjs')
const rows={tournament_teams:{r:{_id:'r',teamId:'team',tournamentId:'event',status:'approved'},old:{_id:'old',teamId:'team',tournamentId:'removed',status:'removed'}},tournaments:{event:{_id:'event',name:'立洋杯'},other:{_id:'other',name:'第二赛事'}},player_card_template_states:{bronze:{_id:'bronze',active:{templateId:'base',version:1}},eventBronze:{_id:'eventBronze',active:{templateId:'event-card',version:6}}},player_card_template_versions:{base_1:{templateId:'base',version:1,cardTypeId:'bronze'},'event-card_6':{templateId:'event-card',version:6,cardTypeId:'bronze',preload:{type:'tournament',targetId:'event'},setId:'set'}},player_card_sets:{set:{status:'published',published:{members:{bronze:{templateId:'event-card',version:6}}}}},service_entry_sessions:{s:{_id:'s',active:true,userId:'owner',phoneVerified:true,playerRegistrationChoice:{nonce:'choice',mode:'new'},playerRegistrationPortraits:[{id:'portrait',fileId:'cloud://private/owned',processingStatus:'ready'}]}}}
const db={
 command:{set:v=>v,gt:v=>({gt:v})},runTransaction:fn=>fn(db),
 collection(name){return {
  where(where){const found=Object.values(rows[name]||{}).filter(row=>Object.entries(where).every(([k,v])=>v&&v.gt?row[k]>v.gt:row[k]===v));return {orderBy(){return this},limit(){return this},async get(){return {data:structuredClone(found)}}}},
  doc(id){return {async get(){return {data:rows[name]?.[id]?structuredClone(rows[name][id]):[]}},async update({data}){Object.assign(rows[name][id],structuredClone(data))}}}
 }}
}
const gate={teamId:'team',purpose:'player_invite_entry'},loaded=()=>({session:structuredClone(rows.service_entry_sessions.s),gate})
async function main(){
 const selected=await context.resolve(db,gate,'bronze')
 assert.equal(selected.template.templateId,'event-card');assert.equal(selected.stateId,'eventBronze');assert.equal(selected.template.version,6)
 assert.equal(rows.players,undefined);assert.equal(rows.player_card_library,undefined,'preview must not grant cards or roster qualification')
 await assert.rejects(()=>context.resolve(db,gate,'bronze',{cardTournamentId:'other'}),e=>e.code==='PLAYER_CARD_EVENT_INVALID')
 rows.tournament_teams.second={_id:'second',teamId:'team',tournamentId:'other',status:'confirmed'}
 await assert.rejects(()=>context.resolve(db,gate,'bronze'),e=>e.code==='PLAYER_CARD_EVENT_REQUIRED')
 await assert.rejects(()=>context.resolve(db,gate,'bronze',{cardTournamentId:'other'}),e=>e.code==='PLAYER_CARD_TEMPLATE_UNAVAILABLE')
 assert.equal((await context.resolve(db,gate,'bronze',{cardTournamentId:'event'})).template.templateId,'event-card')
 delete rows.tournament_teams.second
 rows.player_card_sets.set.published.members.bronze.templateId='replacement'
 await assert.rejects(()=>context.resolve(db,gate,'bronze'),e=>e.code==='PLAYER_CARD_TEMPLATE_UNAVAILABLE')
 rows.player_card_sets.set.published.members.bronze.templateId='event-card'
 const event={choiceToken:'choice',draftRevision:10,name:'测试草稿',idCard:'incomplete',portraitId:'portrait',authorizationAgreed:true,cardTournamentId:'event',crop:{zoom:1.3,x:.1,y:-.1}}
 await resume.save(db,loaded(),event)
 assert.equal(rows.service_entry_sessions.s.playerRegistrationFormDraft.values.authorizationAgreed,undefined)
 await resume.save(db,loaded(),{...event,name:'late',draftRevision:9})
 assert.equal(rows.service_entry_sessions.s.playerRegistrationFormDraft.values.name,'测试草稿')
 await assert.rejects(()=>resume.save(db,loaded(),{...event,portraitId:'foreign'}),e=>e.code==='PLAYER_PHOTO_INVALID')
 await assert.rejects(()=>resume.save(db,loaded(),{...event,choiceToken:'other'}),e=>e.code==='PLAYER_CHOICE_STALE')
 const restored=await resume.restore({getTempFileURL:async({fileList})=>{assert.deepEqual(fileList,['cloud://private/owned']);return {fileList:[{fileID:fileList[0],tempFileURL:'https://private/owned'}]}}},loaded())
 assert.equal(restored.selection.choiceToken,'choice');assert.equal(restored.values.name,'测试草稿');assert.equal(restored.portraitId,'portrait');assert.deepEqual(restored.crop,event.crop)
 rows.service_entry_sessions.s.playerRegistrationChoice.nonce='changed'
 assert.equal(await resume.restore({},loaded()),null)
 console.log('PASS event-card context and resume: stable participation, active published event version, no generic fallback, multi-event selection, no grants, private draft/portrait ownership, consent and stale-write isolation')
}
main().catch(e=>{console.error(e);process.exitCode=1})
