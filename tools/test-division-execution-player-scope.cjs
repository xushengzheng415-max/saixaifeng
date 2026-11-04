const assert=require('node:assert/strict'),path=require('node:path')
const moduleRoot=process.env.SXF_EXECUTION_TEST_ROOT||path.resolve(__dirname,'../cloudfunctions/webLoginApi')
const {buildDivisionExecutionUpdate:build,createDivisionExecutionRules:create}=require(path.join(moduleRoot,'divisionExecutionRules.cjs'))
const {buildStaffEventScope,recordBelongsToStaffEvent}=require(path.join(moduleRoot,'staffEventScope.cjs'))
const copy=x=>structuredClone(x),now=new Date('2026-11-04T10:00:00Z')
const base={_id:'d',tournamentId:'t',orgId:'org',rulesVersion:'V1',activeRulesVersion:'V1',rulesLocked:true,matchMinutes:30,playersOnField:8,regulationDetails:{benchTotalLimit:15,benchPlayerLimit:8,benchOfficialLimit:5,substitutionReentryForbidden:false,unlimitedPlayersPerWindow:true},substitutionMode:'free',substitutionLimit:null,substitutionWindows:null,substitutionReentryAllowed:true}
base.activeRulesSnapshot={matchMinutes:30,playersOnField:8,pointsWin:3,...copy(base)}
const input={divisionId:'d',expectedRulesVersion:'V1',substitutionMode:'free',substitutionLimit:null,substitutionWindows:null,substitutionReentryAllowed:true,regulationDetails:{benchPlayerLimit:10}}
const before=copy(base),updated=build(base,input,{id:'u'},now)
assert.equal(updated.regulationDetails.benchPlayerLimit,10)
assert.equal(updated.regulationDetails.benchTotalLimit,15)
assert.equal(updated.regulationDetails.benchOfficialLimit,5)
assert.equal(updated.activeRulesSnapshot.regulationDetails.benchPlayerLimit,10)
assert.equal(updated.rulesHistory[0].snapshot.regulationDetails.benchPlayerLimit,8)
assert.deepEqual(base,before)
assert.equal(updated.activeRulesSnapshot.matchMinutes,30)
assert.equal(updated.activeRulesSnapshot.pointsWin,3)
for(const value of [0,null])assert.equal(build(base,{...input,regulationDetails:{benchPlayerLimit:value}},{id:'u'},now).regulationDetails.benchPlayerLimit,value)
for(const details of [{benchPlayerLimit:-1},{benchPlayerLimit:31},{benchPlayerLimit:1.5},{benchPlayerLimit:true},{benchPlayerLimit:[8]},{benchOfficialLimit:2},{benchTotalLimit:10},{matchMinutes:40}])assert.throws(()=>build(base,{...input,regulationDetails:details},{id:'u'},now))
assert.throws(()=>build(base,{...input,pointsWin:9},{id:'u'},now),/锁定/)
assert.equal(build(base,{...input,substitutionMode:'limited',substitutionLimit:5,substitutionWindows:3},{id:'u'},now).regulationDetails.unlimitedPlayersPerWindow,false)
assert.equal(build(base,{...input,regulationDetails:undefined},{id:'u'},now).regulationDetails.benchPlayerLimit,8)
assert.equal(require(path.join(moduleRoot,'divisionSubstitutionRules.cjs')).buildSubstitutionRuleUpdate,build)
async function run(event=input,{record=copy(base),auth={success:true,userId:'u',orgId:'org',user:{_id:'u',orgId:'default-other-org'}},staff=false,right=true}={}){
 const writes=[],scopeCalls=[]
 const tables={divisions:[record],tournaments:[{_id:'t',orgId:'org'}]}
 const db={runTransaction:async fn=>fn(db),collection(name){return{
  doc:id=>({get:async()=>({data:(tables[name]||[]).find(row=>row._id===id)||null}),update:async({data})=>{assert.equal(name,'divisions');writes.push(data)}}),
  where:where=>{let skip=0,limit=100;const query={skip(n){skip=n;return query},limit(n){limit=n;return query},async get(){return{data:(tables[name]||[]).filter(row=>Object.entries(where).every(([key,value])=>row[key]===value)).slice(skip,skip+limit)}}};return query}
 }}}
 // 使用生产赛事范围构建器，复现“本人默认机构与当前共享赛事不同”的实际链路。
 const handler=create({cloud:{database:()=>db},authenticateWebSession:async()=>auth,
  buildOrganizerScope:async()=>{scopeCalls.push('organization');if(staff)throw new Error('共享账号不能退回默认机构范围');return{orgId:'org'}},
  buildStaffEventScope:async(...args)=>{scopeCalls.push('event');return buildStaffEventScope(...args)},
  organizerRecordAllowed:(_,row,scope)=>scope.staff?recordBelongsToStaffEvent('divisions',row,scope):row.orgId===scope.orgId,
  staffPolicy:{isStaff:async()=>staff,owner:async()=>false,hasRight:async()=>right}})
 return{result:await handler(event),writes,scopeCalls}
}
;(async()=>{
 const own=await run();assert.equal(own.result.success,true);assert.equal(own.writes.length,1)
 const delegated=await run({...input,staffTournamentId:'t'},{staff:true});assert.equal(delegated.result.success,true,JSON.stringify(delegated.result));assert.deepEqual(delegated.scopeCalls,['event']);assert.equal(delegated.writes[0].regulationDetails.benchPlayerLimit,10)
 assert.equal((await run(input,{staff:true})).result.success,true,'旧客户端未附带工作区标记时仍按目标组别的真实赛事与授权校验')
 assert.equal((await run({...input,staffTournamentId:'other'},{staff:true})).result.success,false)
 assert.equal((await run({...input,staffTournamentId:'t'},{staff:true,right:false})).result.code,'DIVISION_SCOPE_DENIED')
 assert.equal((await run({...input,staffTournamentId:'t'},{staff:true,record:{...base,orgId:'other'}})).result.code,'DIVISION_SCOPE_DENIED')
 assert.equal((await run({...input,staffTournamentId:'t'},{staff:true,record:{...base,tournamentId:'other'}})).result.code,'DIVISION_SCOPE_DENIED')
 const stale=await run({...input,expectedRulesVersion:'old'});assert.equal(stale.result.code,'DIVISION_RULE_VERSION_CHANGED');assert.equal(stale.writes.length,0)
 assert.equal((await run({...input,assistanceGrantId:'assist'})).result.code,'ASSISTANCE_OPERATION_DENIED')
 assert.equal((await run(input,{record:{...base,rulesLocked:false,activeRulesVersion:''}})).result.code,'DIVISION_RULE_NOT_FINALIZED')
 const current={...copy(base),...updated},noop=await run({...input,expectedRulesVersion:current.rulesVersion},{record:current});assert.equal(noop.result.data.alreadyCurrent,true);assert.equal(noop.writes.length,0)
 const inconsistent=copy(base);inconsistent.regulationDetails.benchPlayerLimit=10;assert.equal((await run(input,{record:inconsistent})).writes.length,1)
 const legacySnapshot=copy(base);delete legacySnapshot.activeRulesSnapshot.regulationDetails.benchPlayerLimit;assert.equal((await run({...input,regulationDetails:{benchPlayerLimit:8}},{record:legacySnapshot})).writes.length,1)
 console.log('球员替补人数与真实赛事共享范围回归通过：默认机构不同仍可保存，跨机构/赛事/撤权拒绝，历史与版本保护')
})().catch(e=>{console.error(e);process.exitCode=1})
