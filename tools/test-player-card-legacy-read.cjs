const assert=require('node:assert/strict'),{PNG}=require('../cloudfunctions/webLoginApi/node_modules/pngjs')
const h=require('./test-player-card-workflows.cjs'),{createPlayerCardAccess,attachPublicPlayerCards}=require('../cloudfunctions/webLoginApi/playerCardAccess.cjs')
const {readCards}=require('../cloudfunctions/webLoginApi/playerCardReader.cjs'),renderer=require('../cloudfunctions/webLoginApi/playerCardRender.cjs')
const service=require('../cloudfunctions/webLoginApi/data-center/service.cjs')
const createService=service.createDataService,ensureFonts=renderer.ensureFonts
const prefix='cloud://cloud1-7g8ckb3c7815a011.636c-cloud1-7g8ckb3c7815a011-1419431905/'
const files=new Map(),urlCalls=[];let uploads=0
const cloud={database:()=>h.db,downloadFile:async({fileID})=>{assert(files.has(fileID));return {fileContent:files.get(fileID)}},uploadFile:async({cloudPath,fileContent})=>{uploads++;const fileID=prefix+cloudPath;files.set(fileID,fileContent);return {fileID}},getTempFileURL:async({fileList})=>{assert(fileList.every(x=>typeof x==='string'&&x.startsWith(prefix)),'never convert missing fileId on an already exported card');urlCalls.push(fileList);return {fileList:fileList.map(fileID=>({fileID,tempFileURL:'https://636c-cloud1-7g8ckb3c7815a011-1419431905.tcb.qcloud.la/'+fileID.slice(prefix.length)}))}}}
const originalCollection=h.db.collection
h.db.command.in=ids=>({$in:ids})
h.db.collection=function(name){const collection=originalCollection.call(this,name),where=collection.where;collection.where=function(filter){if(name==='players'&&filter._id?.$in){const ids=filter._id.$in;return {limit(){return this},get:async()=>({data:ids.map(id=>h.table(name).get(id)).filter(Boolean)})}}return where.call(this,filter)};return collection}
const call=(workflowAction,data={})=>h.handle({workflowAction,...data},{userId:'owner'})
;(async()=>{try{
 h.tables.clear();h.grades.clear();renderer.ensureFonts=async()=>{};service.createDataService=()=>({playerCardsForAuthorizedPlayers:async ids=>new Map(ids.map(id=>[id,h.grades.get(id)]))})
 const png=new PNG({width:300,height:430});png.data.fill(255);for(const key of ['background','mask','portrait'])files.set(prefix+key+'.png',PNG.sync.write(png))
 h.table('teams').set('team',{_id:'team',name:'Shared team'})
 for(const id of ['p1','p2']){h.table('players').set(id,{_id:id,name:id,teamId:'team',photoFileId:prefix+'portrait.png',playerCardPublic:true});h.grades.set(id,{status:'ready',tier:'bronze',dataVersion:'fixture-points'})}
 h.table('tournaments').set('cup',{_id:'cup',name:'Fixture cup'})
 h.table('roster_snapshots').set('roster',{_id:'roster',tournamentId:'cup',teamId:'team',status:'approved',version:1,playerIds:['p1','p2']})
 let set=(await call('create',{kind:'progression',title:'赛事升级套系',preload:{type:'tournament',targetId:'cup'}})).set
 set=(await call('materials',{setId:set._id,variants:Object.entries(set.members).map(([key,row])=>({key,revision:row.revision,backgroundFileId:prefix+'background.png',maskFileId:prefix+'mask.png'}))})).set
 const proof=await call('review',{setId:set._id});set=(await call('publish',{setId:set._id,proof:proof.proof})).set
 const job=await call('beginIssue',{setId:set._id,previewRevision:set.revision,requestId:'legacy-read-test-0001',playerIds:['p1','p2'],setDisplay:true});await call('continueIssue',{jobId:job.jobId})
 // A different active base must never replace an already verified event export.
 h.table('player_card_template_states').set('bronze',{_id:'bronze',active:{templateId:'different-base',version:99}})
 const handler=createPlayerCardAccess({cloud,authenticateWebSession:async()=>({success:true,userId:'owner',user:{isPlatformOwner:true},principalType:'platform_owner'})})
 const old=await handler({action:'getPlayerCardsForViewer',playerIds:['p1','p2']})
 assert.equal(old.success,true);assert(old.cards.every(row=>row.status==='ready'&&row.displayMode==='static-export'&&row.cardUrl.startsWith('https://')))
 assert(old.cards.every(row=>row.templateId===set.members.bronze.id&&row.publishedVersion===1));assert.equal(uploads,2)
 const storedUrl=old.cards[0].cardUrl;assert.equal((await handler({action:'getPlayerCardForViewer',playerId:'p1'})).cardUrl,storedUrl);assert.equal(uploads,2,'reuse immutable on-demand export')
 const dynamic=await handler({action:'getPlayerCardsForViewer',playerIds:['p1','p2'],dynamicCardProtocol:'player-card-dynamic/1'})
 assert(dynamic.cards.every(row=>row.status==='ready'&&row.cardScene&&!row.cardUrl));assert.equal(uploads,2,'dynamic protocol does not generate all static images')
 const publicRows=await attachPublicPlayerCards(cloud,h.db,[{playerId:'p1'}],{dynamic:false});assert.equal(publicRows[0].cardUrl,storedUrl)
 const denied=createPlayerCardAccess({cloud,authenticateWebSession:async()=>({success:true,userId:'other',orgId:'other',user:{}}),buildOrganizerScope:async()=>({}),organizerRecordAllowed:()=>false})
 const blocked=await denied({action:'getPlayerCardsForViewer',playerIds:['p1']});assert.equal(blocked.cards[0].status,'forbidden');assert.equal(blocked.cards[0].cardUrl,'')
 h.grades.set('p1',{status:'ready',tier:'gold',dataVersion:'fixture-upgrade'})
 const upgrade=await handler({action:'getPlayerCardForViewer',playerId:'p1'});assert.equal(upgrade.templateId,set.members.gold.id);assert.equal(upgrade.status,'ready')
 const current=h.table('player_card_templates').get(set.members.gold.id),state=require('../cloudfunctions/webLoginApi/playerCardPreload.cjs').stateId('gold',current.published.preload,current._id)
 h.table('player_card_template_states').get(state).active=null
 assert.notEqual((await readCards(cloud,h.db,[h.table('players').get('p1')],{dynamic:false}))[0].cardUrl,upgrade.cardUrl,'inactive template cannot return a cached former export')
 console.log('PASS: actual owner read handler + native renderer; old PC and public compatibility preserve awarded event URLs, cache + upgrade, dynamic scenes, denial and inactive-template guards; no invalid fileId requests; no real writes')
 }finally{service.createDataService=createService;renderer.ensureFonts=ensureFonts;h.db.collection=originalCollection}})().catch(error=>{console.error(error);process.exitCode=1})
