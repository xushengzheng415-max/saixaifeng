import assert from 'node:assert/strict'
import { createDemoWorkspace } from '../web-admin-vue/src/utils/demoWorkspace.mjs'
const w=createDemoWorkspace(), api=(action,p)=>w.request(action,p)
const list=(collection,where={})=>api('dbQuery',{collection,operation:'list',where}).data
const event=api('dbQuery',{collection:'tournaments',operation:'add',data:{name:'审核测试'}}).data
const divisionId=event.defaultDivisionId
const teams=list('teams',{ageGroup:'U8'}).slice(0,2)
api('tournamentRegistrationFlow',{action:'addSyntheticTeams',tournamentId:event._id,divisionId,teamIds:teams.map(t=>t._id)})
// Player reviews occur before team registration confirmation.
const scope={tournamentId:event._id,divisionId,teamId:teams[0]._id}
const players=list('players',{teamId:teams[0]._id})
assert.equal(api('rosterExceptionBoard',{...scope,rosterAction:'listRoster'}).snapshot.playerIds.length,0)
for(const player of players.slice(0,4))api('rosterExceptionBoard',{...scope,rosterAction:'approvePlayer',playerId:player._id})
assert.equal(api('rosterExceptionBoard',{...scope,rosterAction:'listRoster'}).snapshot.playerIds.length,4)
assert.throws(()=>api('rosterExceptionBoard',{...scope,rosterAction:'approvePlayer',playerId:list('players',{teamId:teams[1]._id})[0]._id}),/不属于/)
assert.throws(()=>api('rosterExceptionBoard',{...scope,divisionId:'foreign',rosterAction:'approvePlayer',playerId:players[4]._id}),/不属于/)
api('rosterExceptionBoard',{...scope,rosterAction:'approvePlayer',playerId:players[0]._id})
const restored=createDemoWorkspace();restored.restore(w.snapshot())
assert.equal(restored.request('rosterExceptionBoard',{...scope,rosterAction:'listRoster'}).snapshot.playerIds.length,4)
assert.equal(list('players',{teamId:teams[0]._id})[0].identityStatus,players[0].identityStatus)
assert.equal(list('players',{teamId:teams[0]._id})[0].organizerReviewStatus,'approved')
assert.ok(list('roster_snapshots').every(r=>r.synthetic&&r.isTest))
console.log('PASS: single + batch API approvals, reload persistence, idempotency, team/division scope, unchanged identity, synthetic isolation')

const rejected=players[5]
const beforeSnapshotCount=list('roster_snapshots').length
assert.throws(()=>api('rosterExceptionBoard',{...scope,rosterAction:'rejectPlayer',playerId:rejected._id,reason:'  '}),/原因/)
assert.equal(api('rosterExceptionBoard',{...scope,rosterAction:'rejectPlayer',playerId:rejected._id,reason:'请补充清晰头像'}).reviewStatus,'rejected')
assert.equal(list('players',{teamId:teams[0]._id}).find(p=>p._id===rejected._id).organizerReviewReason,'请补充清晰头像')
assert.equal(list('roster_snapshots').length,beforeSnapshotCount,'rejection preserves existing snapshots')
assert.throws(()=>api('rosterExceptionBoard',{...scope,rosterAction:'rejectPlayer',playerId:players[0]._id,reason:'不能撤销正式名单'}),/正式名单/)
assert.throws(()=>api('rosterExceptionBoard',{...scope,rosterAction:'rejectPlayer',playerId:list('players',{teamId:teams[1]._id})[0]._id,reason:'跨队应拒绝'}),/不属于/)
const reload=createDemoWorkspace();reload.restore(w.snapshot());assert.equal(reload.request('dbQuery',{collection:'players',operation:'get',id:rejected._id}).data.organizerReviewStatus,'rejected')
console.log('PASS: individual rejection reason, reload persistence, formal-roster lock, cross-team denial, no deletion or snapshot rewrite')
