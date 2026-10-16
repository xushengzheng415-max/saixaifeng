const assert=require('node:assert/strict')
const {createPlayerCardWorkflows}=require('../cloudfunctions/webLoginApi/playerCardWorkflows.cjs')
const {createPlayerCardTemplates,normalizeLayout,normalizePhoto,normalizeBadges}=require('../cloudfunctions/webLoginApi/playerCardTemplates.cjs')
const {resolveSeriesPlayer}=require('../cloudfunctions/webLoginApi/playerCardSeriesReader.cjs')
const {tierPermission}=require('../cloudfunctions/webLoginApi/playerCardLibrary.cjs')
const suite=require('../cloudfunctions/webLoginApi/playerCardSuite.cjs')
const tables=new Map(),table=name=>{if(!tables.has(name))tables.set(name,new Map());return tables.get(name)}
const clone=x=>structuredClone(x),unwrap=x=>x?.$set!==undefined?x.$set:x
const matches=(row,filter)=>Object.entries(filter||{}).every(([key,value])=>value?.$gt!==undefined?String(row[key])>value.$gt:row[key]===value)
const db={command:{gt:value=>({$gt:value}),set:value=>({$set:value})},serverDate:()=>new Date(),async createCollection(){},collection(name){const rows=table(name);return {
  doc(id){return {async get(){return {data:clone(rows.get(id)||null)}},async set({data}){rows.set(id,{_id:id,...clone(data)})},async update({data}){assert(rows.has(id));for(const [k,v]of Object.entries(data))rows.get(id)[k]=clone(unwrap(v))}}},
  where(filter){let count=100;const q={orderBy(){return q},limit(n){count=n;return q},async get(){return {data:[...rows.values()].filter(row=>matches(row,filter)).sort((a,b)=>a._id.localeCompare(b._id)).slice(0,count).map(clone)}}};return q}
}},async runTransaction(fn){const before=clone(tables);try{return await fn(db)}catch(e){tables.clear();for(const [k,v]of before)tables.set(k,v);throw e}}}
const cloud={database:()=>db,async getTempFileURL({fileList}){return {fileList:fileList.map(fileID=>({fileID,tempFileURL:'https://fixture/'+fileID}))}}}
const read=id=>suite.document(db,suite.TEMPLATES,id)
const grades=new Map(),scoreService={async playerCardsForAuthorizedPlayers(ids){return new Map(ids.map(id=>[id,grades.get(id)||{status:'unverified'}]))}}
const factory={cloud,read,normalizeLayout,normalizePhoto,normalizeBadges,scoreService,
  async save(event){const row=table(suite.TEMPLATES).get(event.templateId);if(Number(row.revision)!==Number(event.revision))return {success:false,error:'版本冲突'};row.draft={...row.draft,backgroundFileId:event.backgroundFileId||row.draft.backgroundFileId,maskFileId:event.maskFileId||row.draft.maskFileId};row.revision++;row.draftVersion++;return {success:true}},
  async preview(event){const row=await read(event.templateId);assert(row.draft.backgroundFileId&&row.draft.maskFileId);return {success:true,imageUrl:'https://fixture/preview/'+row._id}},
  async urlsFor(){return {}},itemOf(row){return {id:row._id,revision:row.revision,draftVersion:row.draftVersion,publishedVersion:row.publishedVersion,...row.draft}}
}
const handle=createPlayerCardWorkflows(factory),auth={userId:'platform-owner'},call=(workflowAction,data={})=>handle({workflowAction,...data},auth)
async function fill(set){const variants=Object.entries(set.members).map(([key,row])=>({key,revision:row.revision,backgroundFileId:'cloud://bg/'+key,maskFileId:'cloud://mask'}));return (await call('materials',{setId:set._id,variants})).set}
async function publish(set){const preview=await call('review',{setId:set._id});return (await call('publish',{setId:set._id,proof:preview.proof})).set}
const file='cloud://cloud1-7g8ckb3c7815a011.636c-cloud1-7g8ckb3c7815a011-1419431905/player-photos/fixture.png'
async function runTests(){
  const boundary=createPlayerCardTemplates({cloud,authenticateWebSession:async()=>({success:true,principalType:'user',user:{isPlatformOwner:false}})})
  assert.equal((await boundary({action:'savePlayerCardTemplate',workflowAction:'create',kind:'progression'})).code,'CARD_TEMPLATE_FORBIDDEN')
  for(const workflowAction of ['continueIssue','retryIssue','issueStatus'])assert.equal((await boundary({action:'savePlayerCardTemplate',workflowAction,jobId:'foreign'})).code,'CARD_TEMPLATE_FORBIDDEN')
  let global=(await call('create',{kind:'progression',title:'经典套系',preload:{type:'platform'}})).set
  assert.equal(Object.keys(global.members).length,3)
  await assert.rejects(call('review',{setId:global._id}),/缺少/)
  assert.equal(table(suite.STATES).size,0)
  global=await fill(global)
  let proof=await call('review',{setId:global._id})
  table(suite.TEMPLATES).get(global.members.gold.id).revision++
  await assert.rejects(call('publish',{setId:global._id,proof:proof.proof}),/草稿已变化/)
  assert.equal(table(suite.STATES).size,0);assert.equal(table(suite.VERSIONS).size,0)
  global=await publish(global)
  for(const tier of ['bronze','silver','gold'])assert.equal(table(suite.STATES).get(tier).active.templateId,global.members[tier].id)
  const baseline=clone(table(suite.STATES))
  table('teams').set('team',{_id:'team',name:'正式球队'})
  table('teams').set('elsewhere',{_id:'elsewhere',name:'其他球队'})
  for(const player of [{_id:'p1',teamId:'team',name:'球员甲'},{_id:'p2',teamId:'elsewhere',name:'球员乙'},{_id:'test',teamId:'team',name:'虚拟球员',synthetic:true}]){table('players').set(player._id,{...player,photoFileId:file,playerCardTier:'bronze',points:20});grades.set(player._id,{status:player.synthetic?'test_data_excluded':'ready',tier:'bronze'})}
  let honor=(await call('create',{kind:'honor',title:'冠军纪念卡',preload:{type:'team',targetId:'team'}})).set
  honor=await fill(honor);honor=await publish(honor)
  assert.equal(Object.keys(honor.members).length,1)
  assert.equal(table('player_card_library').size,0,'publishing a style must not grant it')
  for(const tier of ['bronze','silver','gold'])assert.deepEqual(table(suite.STATES).get(tier),baseline.get(tier),'honor publishing must not change upgrade pointers')
  const candidates=await call('candidates',{setId:honor._id});assert.equal(candidates.players.find(p=>p.id==='test').eligible,false)
  await assert.rejects(call('beginIssue',{setId:honor._id,previewRevision:honor.revision,playerIds:['p2'],requestId:'request-foreign-0001'}),/名单含/)
  const before=clone(table('players').get('p1'))
  const issue=await call('beginIssue',{setId:honor._id,previewRevision:honor.revision,playerIds:['p1'],setDisplay:true,requestId:'request-honor-000001'})
  assert.equal((await call('continueIssue',{jobId:issue.jobId})).status,'complete')
  assert.equal(table('players').get('p1').playerCardDisplayTemplateId,honor.members.single.id)
  assert.equal(table('players').get('p1').points,before.points);assert.equal(table('players').get('p1').playerCardTier,before.playerCardTier)
  assert.equal(table('players').get('p2').playerCardDisplayTemplateId,undefined)
  assert.equal((await call('beginIssue',{setId:honor._id,previewRevision:honor.revision,playerIds:['p1'],setDisplay:true,requestId:'request-honor-000001'})).jobId,issue.jobId)
  assert.equal(table('player_card_library').size,1)
  assert.equal(tierPermission({status:'unverified'},'bronze','team','honor'),'')
  assert.ok(tierPermission({status:'ready',tier:'bronze',canChangeBackground:true},'gold','tournament','progression'))
  table('tournaments').set('event',{_id:'event',name:'正式赛事'})
  table('roster_snapshots').set('roster',{_id:'roster',tournamentId:'event',teamId:'team',status:'approved',version:1,playerIds:['p1','p2']})
  let event=(await call('create',{kind:'progression',title:'赛事升级套系',preload:{type:'tournament',targetId:'event'}})).set
  event=await fill(event);event=await publish(event)
  const eventIssue=await call('beginIssue',{setId:event._id,previewRevision:event.revision,playerIds:['p1','p2'],setDisplay:true,requestId:'request-series-00001'})
  await call('continueIssue',{jobId:eventIssue.jobId})
  const player=clone(table('players').get('p1'))
  assert.equal(player.playerCardDisplayTemplateId,event.members.bronze.id)
  const upgraded=await resolveSeriesPlayer(db,player,{status:'ready',tier:'gold'},suite.document)
  assert.equal(upgraded.playerCardDisplayTemplateId,event.members.gold.id)
  assert.equal(table('players').get('p1').playerCardTier,'bronze','reader must not mutate career tier')
  assert.equal(table('player_card_library').size,7,'original honor plus both three-level grants retained')
  const listed=await call('list');assert.equal(listed.sets.length,3);assert.equal(listed.sets.filter(x=>x.status==='published').length,3)
  console.log('PASS: owner-only workflows, incomplete drafts, stale preview rejection, atomic trio publication, explicit honor recipients, test/cross-scope exclusion, idempotent grants, retained cards and authoritative upgrade selection')
}
module.exports={db,cloud,tables,table,grades,factory,handle,read}
if(require.main===module)runTests().catch(e=>{console.error(e);process.exitCode=1})
