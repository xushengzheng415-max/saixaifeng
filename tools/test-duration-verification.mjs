import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {resolveMatchDurationEvidence} from '../cloudfunctions/dataCenter/shared/playing-time.mjs'
const require=createRequire(import.meta.url),{inspectDuration,verifyDuration}=require('../cloudfunctions/dataCenter/durationVerification.cjs')
let match={_id:'m1',tournamentId:'t1',homeTeamName:'A',awayTeamName:'B',status:'finished',events:[{type:'goal'}]}
const fixture=require('./test-player-card-audit-endpoint.cjs').fixture(undefined,{writable:true});fixture.data.matches=[match];fixture.data.tournaments=[{_id:'t1',name:'验收赛事',rulesLocked:true,activeRulesVersion:'rules-v1',activeRulesSnapshot:{matchMinutes:30,periodMode:'halves'}}];const db=fixture.db,owner={platformOwner:true,userId:'owner'}
await assert.rejects(()=>inspectDuration(db,{platformOwner:false},{matchId:'m1'}),e=>e.code==='DATA_FORBIDDEN')
const before=await inspectDuration(db,owner,{matchId:'m1'});assert.equal(before.editable,true);assert.equal(before.suggestion.minutes,30);assert.equal(before.suggestion.periodCount,2);assert.equal(before.suggestion.totalMinutes,60);assert.equal(fixture.data.matches[0].durationVerification,undefined,'inspection never writes history')
await assert.rejects(()=>verifyDuration(db,owner,{matchId:'m1',minutes:40,minutesBasis:'period',periodCount:2,reason:'规则核实',expectedRevision:'old'}),e=>e.code==='DURATION_CONFLICT')
await verifyDuration(db,owner,{matchId:'m1',minutes:40,minutesBasis:'period',periodCount:2,reason:'赛事规程第三条，每半场40分钟',expectedRevision:before.revision})
assert.equal(resolveMatchDurationEvidence(fixture.data.matches[0]).totalMinutes,80);assert.equal(fixture.data.matches[0].events.length,1);assert.equal(fixture.data.matches[0].durationRulesSnapshot,undefined)
const after=await inspectDuration(db,owner,{matchId:'m1'});assert.equal(after.editable,false)
await assert.rejects(()=>verifyDuration(db,owner,{matchId:'m1',minutes:90,minutesBasis:'total',reason:'规则核实',expectedRevision:after.revision}),e=>e.code==='DURATION_ALREADY_VERIFIED')
require('../cloudfunctions/dataCenter/shared/write-policy.cjs').assertMatchRuleSnapshotWrite({status:'finished'})
assert.throws(()=>require('../cloudfunctions/dataCenter/shared/write-policy.cjs').assertMatchRuleSnapshotWrite({durationVerification:{}}))
console.log('PASS: platform permission, revision conflict, historical duration, preserved report, duplicate guard, browser write protection')
