const assert=require('node:assert/strict')
const path=require('node:path')
const moduleRoot=process.env.SXF_EXECUTION_TEST_ROOT||path.resolve(__dirname,'../cloudfunctions/webLoginApi')
const {buildDivisionExecutionUpdate:build,createDivisionExecutionRules:create}=require(path.join(moduleRoot,'divisionExecutionRules.cjs'))
const copy=x=>structuredClone(x),now=new Date('2026-11-04T10:00:00Z')
const base={_id:'d',tournamentId:'t',orgId:'org',rulesVersion:'V1',activeRulesVersion:'V1',rulesLocked:true,matchMinutes:30,playersOnField:8,regulationDetails:{benchTotalLimit:8,benchPlayerLimit:8,benchOfficialLimit:2,substitutionReentryForbidden:false,unlimitedPlayersPerWindow:true},substitutionMode:'free',substitutionLimit:null,substitutionWindows:null,substitutionReentryAllowed:true}
base.activeRulesSnapshot={matchMinutes:30,playersOnField:8,pointsWin:3,...copy(base)}
const input={divisionId:'d',expectedRulesVersion:'V1',substitutionMode:'free',substitutionLimit:null,substitutionWindows:null,substitutionReentryAllowed:true,regulationDetails:{benchTotalLimit:10,benchPlayerLimit:8,benchOfficialLimit:2}}
const before=copy(base),updated=build(base,input,{id:'u'},now)
assert.equal(updated.regulationDetails.benchTotalLimit,10)
assert.equal(updated.activeRulesSnapshot.regulationDetails.benchTotalLimit,10)
assert.equal(updated.rulesHistory[0].snapshot.regulationDetails.benchTotalLimit,8)
assert.deepEqual(base,before,'历史对象不得原地改写')
assert.equal(updated.activeRulesSnapshot.matchMinutes,30)
assert.equal(updated.activeRulesSnapshot.pointsWin,3)
assert.equal(build(base,{...input,regulationDetails:{benchTotalLimit:0}},{id:'u'},now).regulationDetails.benchTotalLimit,0)
assert.equal(build(base,{...input,regulationDetails:{benchTotalLimit:null}},{id:'u'},now).regulationDetails.benchTotalLimit,null)
for(const details of [{benchTotalLimit:-1},{benchTotalLimit:31},{benchOfficialLimit:21},{benchPlayerLimit:1.5},{benchPlayerLimit:true},{benchPlayerLimit:[8]},{matchMinutes:40}])assert.throws(()=>build(base,{...input,regulationDetails:details},{id:'u'},now))
assert.throws(()=>build(base,{...input,pointsWin:9},{id:'u'},now),/锁定/)
assert.equal(build(base,{...input,substitutionMode:'limited',substitutionLimit:5,substitutionWindows:3},{id:'u'},now).regulationDetails.unlimitedPlayersPerWindow,false)
assert.equal(build(base,{...input,regulationDetails:undefined},{id:'u'},now).regulationDetails.benchTotalLimit,8,'旧客户端只改换人时保留替补席')
assert.equal(require(path.join(moduleRoot,'divisionSubstitutionRules.cjs')).buildSubstitutionRuleUpdate,build)
async function run(event=input,{record=copy(base),auth={success:true,userId:'u',orgId:'org',user:{_id:'u'}},staff=false,right=true}={}){
 const writes=[]
 const db={runTransaction:async fn=>fn(db),collection(name){assert.equal(name,'divisions','不得改写已开赛/完赛比赛或其他集合');return{doc:id=>({get:async()=>({data:record}),update:async({data})=>writes.push(data)})}}}
 const handler=create({cloud:{database:()=>db},authenticateWebSession:async()=>auth,buildOrganizerScope:async()=>({orgId:'org'}),organizerRecordAllowed:(_,row)=>row.orgId==='org',staffPolicy:{isStaff:async()=>staff,owner:async()=>false,hasRight:async()=>right}})
 return{result:await handler(event),writes}
}
;(async()=>{
 const ok=await run();assert.equal(ok.result.success,true);assert.equal(ok.writes.length,1)
 const stale=await run({...input,expectedRulesVersion:'old'});assert.equal(stale.result.code,'DIVISION_RULE_VERSION_CHANGED');assert.equal(stale.writes.length,0)
 assert.equal((await run(input,{record:{...base,orgId:'other'}})).result.code,'DIVISION_SCOPE_DENIED')
 assert.equal((await run({...input,staffTournamentId:'other'},{staff:true})).result.code,'DIVISION_SCOPE_DENIED')
 assert.equal((await run({...input,staffTournamentId:'t'},{staff:true,right:false})).result.code,'DIVISION_SCOPE_DENIED')
 assert.equal((await run({...input,staffTournamentId:'t'},{staff:true})).result.success,true)
 assert.equal((await run({...input,assistanceGrantId:'assist'})).result.code,'ASSISTANCE_OPERATION_DENIED')
 assert.equal((await run(input,{record:{...base,rulesLocked:false,activeRulesVersion:''}})).result.code,'DIVISION_RULE_NOT_FINALIZED')
 const current={...copy(base),...updated};const noop=await run({...input,expectedRulesVersion:current.rulesVersion},{record:current});assert.equal(noop.result.data.alreadyCurrent,true);assert.equal(noop.writes.length,0)
 const inconsistent=copy(base);inconsistent.regulationDetails.benchTotalLimit=10
 assert.equal((await run(input,{record:inconsistent})).writes.length,1,'当前记录与活动快照不一致时不得错误地跳过版本更新')
 console.log('比赛执行规则：换人与三项替补席、空值/0、结构锁定、历史快照、事务版本、权限边界和幂等测试通过')
})().catch(e=>{console.error(e);process.exitCode=1})
