const assert=require('node:assert/strict'),path=require('node:path')
const {fixture}=require('./test-player-card-audit-endpoint.cjs')
async function run(root=path.resolve('cloudfunctions/webLoginApi')){
 const {calculatePlayerCardPoints}=await import('../cloudfunctions/dataCenter/shared/statistics.mjs')
 const {playerCardSnapshot}=require(path.join(root,'data-center/player-card-snapshot.cjs'))
 const rules=require(path.join(root,'data-center/score-rules.cjs'))
 const Module=require('node:module'),load=Module._load
 let create
 try{Module._load=function(name,...args){if(name==='@resvg/resvg-js')return {Resvg:class{constructor(){throw Error('Score trial must not render cards')}}};return load.call(this,name,...args)};create=require(path.join(root,'playerCardScoreRules.cjs')).createScoreRulesManager}finally{Module._load=load}
 const f=fixture(root,{writable:true}),actor={principalType:'platform_owner',userId:'owner',user:{isPlatformOwner:true}}
 const metrics={appearances:null,starts:1,minutesPlayed:null,goals:null}
 const observed={appearances:2,starts:1,minutesPlayed:60,goals:1}
 const coverage={appearances:'partial',starts:'complete',minutesPlayed:'partial',goals:'partial'}
 const metadata={dataVersion:'career-fixture',metricVersion:'football-metrics/6',coverageStatus:'partial',supportDrops:2,supportCoverageStatus:'partial',supportDataVersion:'support-fixture'}
 let change=false,readFails=false
 const oldScore=calculatePlayerCardPoints({metrics,observed,coverage},metadata)
 assert.equal(oldScore.status,'ready');assert.equal(oldScore.points,7)
 assert.equal(calculatePlayerCardPoints({metrics:oldScore.metrics,coverage},metadata).status,'unverified','reproduce former trial bug: lost appearance evidence but retained complete starts')
 const canonical=playerCardSnapshot(oldScore,{playerId:'p1',playerTotal:{metrics,coverage},coverageStatus:'partial',careerDataVersion:metadata.dataVersion})
 const completeMetrics={appearances:0,starts:0,minutesPlayed:0,goals:0},completeCoverage=Object.fromEntries(Object.keys(completeMetrics).map(k=>[k,'complete']))
 const zero=playerCardSnapshot(calculatePlayerCardPoints({metrics:completeMetrics,coverage:completeCoverage},{...metadata,coverageStatus:'complete',supportDrops:0,supportCoverageStatus:'complete'}),{playerId:'p2',playerTotal:{metrics:completeMetrics,coverage:completeCoverage}})
 const service=()=>({playerCardsForAuthorizedPlayers:async ids=>{if(readFails)throw Error('fixture database failure');return new Map(ids.map(id=>[id,id==='p3'?{status:'test_data_excluded',snapshotRevision:'test'}:id==='p2'?zero:{...canonical,snapshotRevision:change?'new-evidence':canonical.snapshotRevision}]))}})
 const api=create({cloud:{database:()=>f.db},service}),call=(workflowAction,data={})=>api({workflowAction,...data},actor)
 const initial=await call('scoreRulesRead'),parameters={...rules.defaults().parameters,appearancePoints:10,startPoints:10,minutesPerPoint:5,goalPoints:20,goalCapPercent:100,supportDropsPerPoint:1}
 const saved=await call('scoreRulesSave',{revision:initial.revision,parameters,reason:'提高球员参与激励'})
 const before=JSON.stringify({players:f.data.players,matches:f.data.matches,canonical})
 const preview=await call('scoreRulesPreview',{revision:saved.revision})
 const expected=calculatePlayerCardPoints({metrics,observed,coverage},{...metadata,rules:{version:'test',parameters},retainedTier:canonical.tier})
 assert.equal(expected.points,64);assert.deepEqual(expected.creditedMetrics,observed)
 const row=preview.changes.find(x=>x.playerId==='p1');assert.equal(row.beforePoints,7);assert.equal(row.afterPoints,64);assert.equal(row.afterTier,'silver')
 assert.equal(preview.summary.unverified,0);assert.equal(preview.summary.excluded,1)
 assert.equal((await call('scoreRulesRead')).active.version,'football-player-card-points/2','trial does not activate parameters')
 readFails=true;await assert.rejects(call('scoreRulesPreview',{revision:saved.revision}),/database failure/);readFails=false
 change=true;await assert.rejects(call('scoreRulesBegin',{revision:saved.revision,proof:preview.proof}),/重新试算/);change=false
 const start=await call('scoreRulesBegin',{revision:saved.revision,proof:preview.proof})
 let job=start.job;while(job.status!=='complete')job=(await call('scoreRulesContinue',{jobId:job.id})).job
 const active=await call('scoreRulesRead');assert.equal(active.active.parameters.appearancePoints,10);assert.equal(active.draft,null)
 assert.equal(JSON.stringify({players:f.data.players,matches:f.data.matches,canonical}),before,'raw null facts and player/match data unchanged')
 assert.equal(canonical.metrics.appearances,null);assert.equal(canonical.metrics.minutesPlayed,null)
 await assert.rejects(api({workflowAction:'scoreRulesPreview'},{principalType:'user',user:{}}),/平台负责人/)
 console.log('PASS: reproduce lost observed-evidence failure; partial canonical trial 7→64 equals current calculator; raw nulls preserved; test excluded; trial does not activate, read failures/stale evidence stop, owner-only, explicit staged publication succeeds; isolated DB only')
}
run(process.argv[2]?path.resolve(process.argv[2]):undefined).catch(error=>{console.error(error);process.exitCode=1})
