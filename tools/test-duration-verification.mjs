import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {resolveMatchDurationEvidence} from '../cloudfunctions/dataCenter/shared/playing-time.mjs'
const require=createRequire(import.meta.url),{inspectDuration,verifyDuration}=require('../cloudfunctions/dataCenter/durationVerification.cjs')
let match={_id:'m1',tournamentId:'t1',homeTeamName:'A',awayTeamName:'B',status:'finished',events:[{type:'goal'}]}
const document={get:async()=>({data:structuredClone(match)}),update:async({data})=>Object.assign(match,data)}
const db={collection:()=>({doc:()=>document}),runTransaction:async fn=>fn(db)},owner={platformOwner:true,userId:'owner'}
await assert.rejects(()=>inspectDuration(db,{platformOwner:false},{matchId:'m1'}),e=>e.code==='DATA_FORBIDDEN')
const before=await inspectDuration(db,owner,{matchId:'m1'});assert.equal(before.editable,true)
await assert.rejects(()=>verifyDuration(db,owner,{matchId:'m1',minutes:40,minutesBasis:'period',periodCount:2,reason:'规则核实',expectedRevision:'old'}),e=>e.code==='DURATION_CONFLICT')
await verifyDuration(db,owner,{matchId:'m1',minutes:40,minutesBasis:'period',periodCount:2,reason:'赛事规程第三条，每半场40分钟',expectedRevision:before.revision})
assert.equal(resolveMatchDurationEvidence(match).totalMinutes,80);assert.equal(match.events.length,1);assert.equal(match.durationRulesSnapshot,undefined)
const after=await inspectDuration(db,owner,{matchId:'m1'});assert.equal(after.editable,false)
await assert.rejects(()=>verifyDuration(db,owner,{matchId:'m1',minutes:90,minutesBasis:'total',reason:'规则核实',expectedRevision:after.revision}),e=>e.code==='DURATION_ALREADY_VERIFIED')
require('../cloudfunctions/dataCenter/shared/write-policy.cjs').assertMatchRuleSnapshotWrite({status:'finished'})
assert.throws(()=>require('../cloudfunctions/dataCenter/shared/write-policy.cjs').assertMatchRuleSnapshotWrite({durationVerification:{}}))
console.log('PASS: platform permission, revision conflict, historical duration, preserved report, duplicate guard, browser write protection')
