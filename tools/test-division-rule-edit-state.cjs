const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const root = path.resolve(__dirname, '..')
const policy = require('../cloudfunctions/webLoginApi/divisionRuleEditState.cjs')
const source = fs.readFileSync(path.join(root,'cloudfunctions/webLoginApi/index.js'),'utf8')
const division = { _id:'division-a',tournamentId:'event-a',orgId:'org-a',rulesLocked:true,ruleFinalized:true,ruleStatus:'finalized',rulesVersion:'V2',rulesSnapshot:{playersOnField:8},competitionPlanLocked:true,status:'ongoing',startDate:'2020-01-01' }
function fixture(rows=[],fail=false,record={...division}) {
  let queries=0,writes=0
  const db={collection(name){
    if(name==='divisions')return {doc(){return {get:async()=>({data:record}),update:async({data})=>{writes++;Object.assign(record,data)}}}}
    assert.equal(name,'matches')
    return {where(query){let offset=0,count=100;return {skip(value){offset=value;return this},limit(value){count=value;return this},async get(){queries++;if(fail)throw Error('database unavailable');return {data:rows.filter(row=>row.tournamentId===query.tournamentId).slice(offset,offset+count)}}}}}
  }}
  return {db,record,queries:()=>queries,writes:()=>writes}
}
const functionBody=source.slice(source.indexOf('async function reviseDivisionRules(db,'),source.indexOf('async function confirmDivisionRules(db,'))
async function revise(state,scope={orgId:'org-a',user:{_id:'user-a'}}) {
  const context={require:name=>{assert.equal(name,'./divisionRuleEditState.cjs');return policy},Date,
    organizerRecordAllowed:(_collection,record,actor)=>record.orgId===actor.orgId,
    divisionRulesLocked:record=>record.rulesLocked===true,
    divisionRuleSnapshot:()=>({playersOnField:8})}
  vm.runInNewContext(functionBody+'\nglobalThis.run=reviseDivisionRules',context)
  return context.run(state.db,'division-a',scope)
}
async function readStateAction(state,scope={orgId:'org-a'},assistance=null) {
  const begin=source.indexOf("      case 'divisionRuleEditState': {")
  const end=source.indexOf("      case 'confirmDivisionRules':",begin)
  const context={collection:'divisions',assistanceScope:assistance,organizerScope:scope,id:'division-a',db:state.db,
    require:()=>policy,readDocumentOrNull:async()=>state.record,
    organizerRecordAllowed:(_collection,record,actor)=>record.orgId===actor.orgId}
  vm.runInNewContext("async function read(){switch('divisionRuleEditState'){"+source.slice(begin,end)+"}};globalThis.run=read",context)
  return context.run()
}
;(async()=>{
  for(const flags of [{},{ruleStatus:'published'},{rulesLocked:true,ruleFinalized:true},{competitionPlanLocked:true,status:'completed',startDate:'2019-01-01'}]){
    const state=fixture([],false,{...division,...flags})
    assert.equal((await policy.readEditState(state.db,state.record)).canEdit,true)
  }
  for(const extra of [{divisionId:'division-a'},{division:'division-a'},{divisionKey:'division-a'},{divisionId:'division-a',status:'cancelled'},{divisionId:'division-a',isBye:true}]){
    const state=fixture([{tournamentId:'event-a',...extra}])
    assert.equal((await policy.readEditState(state.db,state.record)).hasSchedule,true)
    await assert.rejects(()=>revise(state),{code:'DIVISION_SCHEDULE_EXISTS'})
    assert.equal(state.writes(),0)
  }
  const foreign=fixture([{tournamentId:'event-b',divisionId:'division-a'},{tournamentId:'event-a',divisionId:'division-b'}])
  assert.equal((await policy.readEditState(foreign.db,foreign.record)).canEdit,true)
  const unscoped=fixture([{tournamentId:'event-a'}])
  assert.equal((await policy.readEditState(unscoped.db,unscoped.record)).canEdit,false)
  const large=fixture([...Array.from({length:1100},(_,index)=>({_id:String(index),tournamentId:'event-a',divisionId:'division-b'})),{tournamentId:'event-a',divisionId:'division-a'}])
  assert.equal((await policy.readEditState(large.db,large.record)).canEdit,false)
  assert.equal(large.queries(),12,'must not truncate after 1000 matches')
  await assert.rejects(()=>policy.readEditState(fixture([],true).db,division),/unavailable/)
  const state=fixture()
  const result=await revise(state)
  assert.equal(result.success,true)
  assert.equal(state.record.rulesLocked,false)
  assert.equal(state.record.competitionPlanLocked,false)
  assert.equal(state.record.rulesHistory[0].version,'V2')
  assert.equal(state.record.activeRulesSnapshot.playersOnField,8)
  const denied=fixture()
  assert.equal((await revise(denied,{orgId:'other-org',user:{_id:'user-a'}})).code,'DIVISION_SCOPE_DENIED')
  assert.equal(denied.queries(),0)
  assert.equal(denied.writes(),0)
  assert.equal((await revise(fixture(),null)).code,'ORG_REQUIRED')
  assert.equal((await readStateAction(fixture())).data.canEdit,true)
  assert.equal((await readStateAction(fixture(),{orgId:'other-org'})).code,'DIVISION_SCOPE_DENIED')
  assert.equal((await readStateAction(fixture(),{orgId:'org-a'},{grant:true})).code,'DIVISION_SCOPE_DENIED')
  const lateRows=[];const late=fixture(lateRows)
  assert.equal((await policy.readEditState(late.db,late.record)).canEdit,true)
  lateRows.push({tournamentId:'event-a',divisionId:'division-a'})
  await assert.rejects(()=>revise(late),{code:'DIVISION_SCHEDULE_EXISTS'})
  console.log('PASS: past dates/status/finalization do not lock empty schedules; actual, cancelled, bye, legacy and unscoped fixtures lock; other-division isolation, >1000 pagination, query failure, late schedule, scope denial and revision history')
})().catch(error=>{console.error(error);process.exitCode=1})
