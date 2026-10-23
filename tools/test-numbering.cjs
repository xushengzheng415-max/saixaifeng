const assert = require('node:assert/strict')
const n = require('../cloudfunctions/dataCenter/shared/numbering.cjs')
const clone = value => structuredClone(value)
function fixture() {
 let state = { teams: {}, players: {}, platform_number_registry: {}, platform_number_sequences: {} }, tail = Promise.resolve(), failWrite = false
 const api = source => ({collection: name => ({doc: id => ({get: async () => ({data:clone(source[name]?.[id] || [])}),set: async ({data}) => {if(failWrite)throw Error('interrupted');source[name] ||= {};source[name][id]={_id:id,...clone(data)}},update:async ({data}) => {if(failWrite)throw Error('interrupted');Object.assign(source[name][id],clone(data))}})})})
 const db = { ...api(state), serverDate:()=>new Date('2026-10-23'), runTransaction: cb => {const result=tail.then(async()=>{const copy=clone(state),result=await cb(api(copy));for(const key of Object.keys(state))delete state[key];Object.assign(state,copy);return result});tail=result.catch(()=>{});return result} }
 return {db,state,fail:v=>failWrite=v}
}
const owner={platformOwner:true,userId:'owner'},region={provinceCode:'226',cityLetter:'A'}
;(async()=>{
 assert.equal(n.format('players',region,1),'P226A00000001')
 assert.equal(n.format('teams',region,1),'226A00001')
 assert.equal(n.format('teams',region,3,'226A00001'),'226A00001-03')
 assert.throws(()=>n.format('teams',region,100,'226A00001'),e=>e.code==='NUMBERING_EXHAUSTED')
 assert.equal(n.inferRegion({nativePlace:'河南省开封市'},'players').cityLetter,'B')
 assert.equal(n.inferRegion({nativePlace:'广西桂林'},'players'),null,'ambiguous historic city letters must not be guessed')
 assert.equal(n.inferRegion({teamId:'henan',cityName:'河南省郑州市',idCard:'not-used'},'players'),null)
 assert.equal(n.inferRegion({nativePlace:'开封'},'players'),null)
 assert.throws(()=>n.guardWrite({'numbering.region':region}),e=>e.code==='NUMBERING_READ_ONLY')
 assert.throws(()=>n.guardWrite({nativePlaceRegion:{provinceCode:'226'}}),e=>e.code==='NUMBERING_REGION_REQUIRED')
 assert.equal(n.view({_id:'invalid-number',businessNumber:123},'players').status,'conflict')
 const f=fixture();f.state.teams.t={_id:'t',orgId:'o',provinceCode:'226',cityCode:'A'}
 for(let i=0;i<100;i++)f.state.players['p'+i]={_id:'p'+i,teamId:'t',nativePlace:i%2?'河南省洛阳市':'河南省郑州市'}
 const results=await Promise.all(Array.from({length:100},(_,i)=>n.assign(f.db,owner,{kind:'players',id:'p'+i})))
 assert.equal(new Set(results.map(r=>r.number)).size,100);assert.equal(f.state.platform_number_sequences['players-global'].lastSequence,100)
 assert.equal(results[1].number,'P226C00000002','global sequence does not restart per city')
 const first=results[0].number;f.state.players.p0.teamId='';f.state.players.p0.nativePlace='河南省洛阳市'
 assert.equal((await n.assign(f.db,owner,{kind:'players',id:'p0'})).number,first,'transfer/corrected birthplace do not renumber')
 assert.equal(f.state.platform_number_sequences['players-global'].lastSequence,100)
 await assert.rejects(n.assign(f.db,{staff:true},{kind:'teams',id:'t',teamMode:'root'}),e=>e.code==='DATA_FORBIDDEN')
 const team=await n.assign(f.db,owner,{kind:'teams',id:'t',teamMode:'root'})
 for(const id of ['s1','s2','s3'])f.state.teams[id]={_id:id,parentTeamId:'t',orgId:'o'}
 for(let i=1;i<=3;i++)assert.equal((await n.assign(f.db,owner,{kind:'teams',id:'s'+i,teamMode:'squad'})).number,team.number+'-0'+i)
 f.state.teams.bad={_id:'bad',parentTeamId:'t',orgId:'other'}
 await assert.rejects(n.assign(f.db,owner,{kind:'teams',id:'bad',teamMode:'squad'}),e=>e.code==='NUMBERING_PARENT_INVALID')
 f.state.players.missing={_id:'missing',teamId:'t'}
 await assert.rejects(n.assign(f.db,owner,{kind:'players',id:'missing'}),e=>e.code==='NUMBERING_REGION_REQUIRED')
 f.state.players.test={_id:'test',teamId:'t',synthetic:true,nativePlace:'河南省郑州市'}
 await assert.rejects(n.assign(f.db,owner,{kind:'players',id:'test'}),e=>e.code==='NUMBERING_SOURCE_EXCLUDED')
 f.state.players.badReference={_id:'badReference',teamId:{unknown:true},nativePlace:'河南省郑州市'}
 await assert.rejects(n.assign(f.db,owner,{kind:'players',id:'badReference'}),e=>e.code==='NUMBERING_REFERENCE_INVALID')
 f.state.teams.test={_id:'test',synthetic:true};f.state.players.testParent={_id:'testParent',teamId:'test',nativePlace:'河南省郑州市'}
 await assert.rejects(n.assign(f.db,owner,{kind:'players',id:'testParent'}),e=>e.code==='NUMBERING_SOURCE_EXCLUDED')
 await assert.rejects(n.assign(f.db,owner,{kind:'players',id:'missing',region,expectedRevision:'stale'}),e=>e.code==='NUMBERING_STALE')
 const before=JSON.stringify(f.state);f.fail(true)
 await assert.rejects(n.assign(f.db,owner,{kind:'players',id:'missing',region}));assert.equal(JSON.stringify(f.state),before,'rollback leaves no half-issued code')
 f.fail(false);const r=await n.assign(f.db,owner,{kind:'players',id:'missing',region});assert.ok(r.number);assert.equal(f.state.players.missing.nativePlaceRegion.cityLetter,'A')
 console.log('PASS: global concurrent sequence, idempotency, transfers, immutable numbers, required origin, no team/ID-card inference, ambiguous mapping, squad lineage, tenant isolation, test exclusion, stale drafts and transactional rollback')
})().catch(e=>{console.error(e);process.exitCode=1})
