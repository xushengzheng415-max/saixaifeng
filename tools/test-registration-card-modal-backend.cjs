'use strict'
const assert=require('node:assert/strict'),Module=require('node:module')
const target=require.resolve('../cloudfunctions/webLoginApi/serviceRegistrationMedia.cjs'),load=Module._load
const rows={service_entry_sessions:{s:{active:true,userId:'u',playerRegistrationChoice:{nonce:'choice'}}},player_card_template_states:{bronze:{active:{templateId:'published',version:1}}}}
let version=1,scoreStatus='ready',scoreReads=0,rendered=0,fingerprint='facts-1',holdNext=false,release=null
const db={command:{set:v=>v},runTransaction:fn=>fn(db),collection:n=>({doc:k=>({async update({data}){Object.assign(rows[n][k],data)}})})}
const suite={STATES:'player_card_template_states',document:async(_,c,k)=>structuredClone(rows[c]?.[k]),activeTemplate:async()=>({templateId:'published',version}),async renderPlayer(cloud,db,player,template,score,overrides){assert.equal(player._id,'prospective');assert.equal(template.templateId,'published');assert.equal(overrides.portraitFileId,'cloud://owned/portrait');rendered++;if(holdNext){holdNext=false;await new Promise(resolve=>{release=resolve})}return {png:Buffer.from('server-rendered-card')}}}
Module._load=function(name,parent,...rest){if(parent?.filename===target){
 if(name==='./playerCardSuite.cjs')return suite
 if(name==='./registrationCardContext.cjs')return {resolve:async()=>({template:await suite.activeTemplate(),stateId:'bronze',tournamentId:''})}
 if(name==='./playerCardDynamic.cjs')return {descriptor:async(cloud,db,player,template)=>{assert.equal(player.playerCardSourceFileId,'cloud://owned/portrait');assert.equal(player.idCard,undefined);return {status:'ready',cardScene:{protocolVersion:'player-card-dynamic/1',templateId:template.templateId}}}}
 if(name==='./data-center/service.cjs')return {createDataService:()=>({async playerCardForAuthorizedRegistrationDraft(p){assert.equal(p._id,'prospective');scoreReads++;return {status:scoreStatus,tier:scoreStatus==='ready'?'bronze':null,scoreVersion:'canonical'}},async playerCardForAuthorizedPlayer(){throw Error('must use prospective draft authority')}})}
 if(name==='./playerCards.cjs')return {normalizeCrop:c=>{assert.ok(c.zoom>=1&&c.zoom<=4);return c}}
 }return load.call(this,name,parent,...rest)}
const media=require(target)
const cloud={async callFunction({name,data}){assert.equal(name,'getMiniWorkspace');assert.equal(data.operation,'preview');assert.equal(data.action,'servicePlayerRegistration');return {result:{success:true,registrationDraft:{player:{_id:'prospective',teamId:'team',name:'测试草稿'},existing:false,fingerprint,portraitId:'portrait',portraitFileId:'cloud://owned/portrait',choiceToken:'choice',crop:{zoom:1,x:0,y:0}}}}}}
const loaded=()=>({session:{...structuredClone(rows.service_entry_sessions.s),_id:'s',phoneVerified:true},gate:{purpose:'player_invite_entry',teamId:'team'}})
async function main(){
 const first=await media.card(cloud,db,loaded(),{draft:true})
 assert.equal(first.draft,true);assert.equal(rows.service_entry_sessions.s.playerRegistrationCardDraft.confirmed,false)
 assert.equal(rows.players,undefined,'no player writes before confirmation')
 const moved=await media.card(cloud,db,loaded(),{draft:true,crop:{zoom:1.4,x:.09,y:-.03}})
 assert.equal(scoreReads,1,'crop previews reuse bounded private score metadata');assert.equal(rendered,2)
 await assert.rejects(()=>media.card(cloud,db,loaded(),{draft:true,confirm:true,previewToken:'forged',crop:moved.crop}),e=>e.code==='PLAYER_CARD_PREVIEW_CHANGED')
 const confirmed=await media.card(cloud,db,loaded(),{draft:true,confirm:true,previewToken:moved.previewToken,crop:moved.crop})
 assert.equal(confirmed.confirmed,true);assert.equal(rows.service_entry_sessions.s.playerRegistrationCardDraft.confirmed,true);assert.equal(rows.players,undefined)
 fingerprint='changed-facts'
 await assert.rejects(()=>media.card(cloud,db,loaded(),{draft:true,confirm:true,previewToken:moved.previewToken,crop:moved.crop}),e=>e.code==='PLAYER_CARD_PREVIEW_CHANGED')
 fingerprint='facts-1';version=2
 await assert.rejects(()=>media.card(cloud,db,loaded(),{draft:true,confirm:true,previewToken:moved.previewToken,crop:moved.crop}),e=>e.code==='PLAYER_CARD_TEMPLATE_CHANGED')
 scoreStatus='unverified';fingerprint='new-facts'
 await assert.rejects(()=>media.card(cloud,db,loaded(),{draft:true}),e=>e.code==='PLAYER_CARD_PENDING')
 rows.service_entry_sessions.s.userId='other'
 scoreStatus='ready'
 await assert.rejects(()=>media.card(cloud,db,{session:{_id:'s',userId:'u',phoneVerified:true},gate:{purpose:'player_invite_entry'}},{draft:true}),e=>e.code==='PLAYER_CARD_PREVIEW_CHANGED')
  rows.service_entry_sessions.s.userId='u';fingerprint='facts-1';scoreStatus='ready';holdNext=true
  const late=media.card(cloud,db,loaded(),{draft:true,crop:{zoom:1.1,x:.01,y:0}})
  while(!release)await new Promise(resolve=>setImmediate(resolve))
  const newest=await media.card(cloud,db,loaded(),{draft:true,crop:{zoom:1.5,x:.2,y:.1}})
  release()
  await assert.rejects(late,e=>e.code==='PLAYER_CARD_PREVIEW_CHANGED')
  assert.equal(rows.service_entry_sessions.s.playerRegistrationCardDraft.token,newest.previewToken,'late rendering must not overwrite latest preview')
 const count=rendered,local=await media.card(cloud,db,loaded(),{draft:true,editorScene:true})
 assert.equal(rendered,count,'local editing scene must not render a server PNG');assert.equal(local.cardScene.templateId,'published');assert.equal(local.imageData,'')
 rows.player_card_template_states.bronze.active.version=version
 const finalCrop={zoom:1.8,x:-.2,y:.1}
 await media.card(cloud,db,loaded(),{draft:true,confirm:true,previewToken:local.previewToken,crop:finalCrop})
 assert.equal(rendered,count+1);assert.deepEqual(rows.service_entry_sessions.s.playerRegistrationCardDraft.crop,finalCrop)
 rows.service_entry_sessions.s.playerRegistrationCardDraft.expiresAt=new Date(0)
 await assert.rejects(()=>media.card(cloud,db,loaded(),{draft:true,confirm:true,previewToken:local.previewToken,crop:finalCrop}),e=>e.code==='PLAYER_CARD_PREVIEW_CHANGED')
 await media.card(cloud,db,loaded(),{draft:true,confirm:true,restore:true,previewToken:local.previewToken,crop:finalCrop})
 assert.ok(new Date(rows.service_entry_sessions.s.playerRegistrationCardDraft.expiresAt)>new Date())
 rows.service_entry_sessions.s.playerRegistrationCardDraft.confirmed=false;rows.service_entry_sessions.s.playerRegistrationCardDraft.expiresAt=new Date(0)
 await assert.rejects(()=>media.card(cloud,db,loaded(),{draft:true,confirm:true,restore:true,previewToken:local.previewToken,crop:finalCrop}),e=>e.code==='PLAYER_CARD_PREVIEW_CHANGED')
 console.log('PASS card draft modal backend: private canonical scene without PNG rendering, one final render, locally adjusted crop, no early registration, score cache, changed facts, template/session and stale-response rejection')
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{Module._load=load})
