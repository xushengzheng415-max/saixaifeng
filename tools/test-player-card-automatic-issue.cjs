const assert=require('node:assert/strict'),crypto=require('node:crypto')
const h=require('./test-player-card-workflows.cjs')
const call=(workflowAction,data={})=>h.handle({workflowAction,...data},{userId:'owner'})
const photo='cloud://cloud1-7g8ckb3c7815a011.636c-cloud1-7g8ckb3c7815a011-1419431905/player-photos/test.png'
;(async()=>{
 h.tables.clear();h.grades.clear();h.table('teams').set('team',{_id:'team',name:'Fixture team'})
 const ids=Array.from({length:31},(_,i)=>'p'+String(i).padStart(2,'0'))
 for(const id of ids){h.table('players').set(id,{_id:id,teamId:'team',name:id,photoFileId:photo});h.grades.set(id,{status:'ready',tier:'bronze'})}
 let set=(await call('create',{kind:'honor',title:'自动发放测试',preload:{type:'team',targetId:'team'}})).set
 set=(await call('materials',{setId:set._id,variants:[{key:'single',revision:set.members.single.revision,backgroundFileId:photo,maskFileId:photo}]})).set
 const proof=await call('review',{setId:set._id});set=(await call('publish',{setId:set._id,proof:proof.proof})).set
 const sample=await call('issuePreviews',{setId:set._id,playerIds:ids});assert.equal(sample.cards.length,24);assert.equal(sample.nextOffset,24)
 const event={setId:set._id,playerIds:ids,previewRevision:sample.revision,requestId:'automatic-issue-fixture-01',setDisplay:true}
 const started=await call('beginIssue',event)
 h.table('players').delete('p03');delete h.table('players').get('p04').photoFileId
 const revoked=crypto.createHash('sha256').update(JSON.stringify(['p05',set.members.single.id])).digest('hex')
 h.table('player_card_library').set(revoked,{_id:revoked,playerId:'p05',templateId:set.members.single.id,status:'revoked'})
 let job=await call('continueIssue',{jobId:started.jobId});assert.equal(job.completed,10);assert.equal(job.succeeded,7);assert.equal(job.failures.length,3)
 assert.ok([...h.table('player_card_library').values()].some(x=>x.playerId==='p09'),'a player after failures is granted')
 const originalCollection=h.db.collection
 h.db.collection=function(name){const collection=originalCollection.call(this,name);if(name!=='players')return collection;const doc=collection.doc;collection.doc=function(id){const record=doc.call(this,id);if(id==='p14')record.get=async()=>{throw Error('fixture database offline')};return record};return collection}
 await assert.rejects(call('continueIssue',{jobId:job.jobId}),/database offline/)
 assert.equal(h.table('player_card_sets').get(job.jobId).cursor,14,'read failure pauses without skipping or zeroing')
 h.db.collection=originalCollection
 do{job=await call('continueIssue',{jobId:job.jobId})}while(job.status!=='complete')
 assert.equal(job.completed,31);assert.equal(job.succeeded,28);assert.equal(job.failures.length,3)
 assert.deepEqual((await call('issueStatus',{jobId:job.jobId})).failures,job.failures)
 assert.deepEqual(await call('continueIssue',{jobId:job.jobId}),job,'completed task is idempotent')
 h.table('players').set('p03',{_id:'p03',teamId:'team',name:'p03',photoFileId:photo});h.table('players').get('p04').photoFileId=photo
 const retryEvent={jobId:job.jobId,requestId:'automatic-retry-fixture-01'}
 const retry=await call('retryIssue',retryEvent);assert.equal(retry.total,3);assert.equal((await call('retryIssue',retryEvent)).jobId,retry.jobId)
 const retried=await call('continueIssue',{jobId:retry.jobId});assert.equal(retried.succeeded,2);assert.equal(retried.failures.length,1);assert.equal(retried.failures[0].code,'GRANT_REVOKED')
 assert.equal(h.table('player_card_library').get(revoked).status,'revoked')
 assert.equal([...h.table('player_card_library').values()].filter(x=>x.status!=='revoked').length,30)
 const scopeJob=await call('beginIssue',{...event,playerIds:['p01'],requestId:'automatic-scope-fixture-01'})
 h.table('players').get('p01').teamId='foreign'
 assert.equal((await call('continueIssue',{jobId:scopeJob.jobId})).failures[0].code,'SCOPE_CHANGED')
 const stored=h.table('player_card_sets').get(set._id);stored.revision++
 await assert.rejects(call('retryIssue',{jobId:retry.jobId,requestId:'automatic-stale-fixture-01'}),/样式已更新/)
 assert.equal((await call('issues')).issues.find(x=>x._id===job.jobId).failures.length,3)
 console.log('PASS: sample 24 then automatic 31-recipient issue; per-player failures do not stop later recipients; read errors pause with durable cursor; retry only failed IDs; revoked/scope/version guards and idempotency preserved; isolated database only')
})().catch(e=>{console.error(e);process.exitCode=1})
