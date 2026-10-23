import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs'
import vm from 'node:vm'
const require=createRequire(import.meta.url)
const {registration,relationHistory,performanceDimensions,valuationSnapshots,scopeKey}=require('../cloudfunctions/dataCenter/shared/hub-contract.cjs')
const {createHubService}=require('../cloudfunctions/dataCenter/shared/hub.cjs')
const {readAll,readOptionalAll}=require('../cloudfunctions/dataCenter/shared/reader.cjs')
const {synthetic}=await import('../cloudfunctions/dataCenter/shared/statistics.mjs')
const r=registration({createTime:'2024-03-16',joinedTeamAt:'2026-08-01'})
assert.equal(r.registeredAt,null);assert.equal(r.status,'unknown');assert.equal(r.profileCreatedAt,'2024-03-16T00:00:00.000Z')
assert.equal(registration({platformJoinedAt:'2024-03-16',createTime:'2026-08-01'}).registeredAt,'2024-03-16T00:00:00.000Z')
assert.equal(registration({platformJoinedAt:'bad'}).status,'unknown')
let h=relationHistory({playerId:'p',currentTeamId:'B',memberships:[{_id:'m1',playerId:'p',teamId:'A',validFrom:'2024-01-01',validTo:'2025-01-01',status:'ended'}],history:[{_id:'h1',playerId:'p',teamId:'A',joinedAt:'2024-01-01',leftAt:'2025-01-01'},{_id:'h2',playerId:'p',teamId:'B',joinedAt:'2025-01-01'}]})
assert.equal(h.items.length,2);assert.equal(h.status,'recorded');assert.equal(h.items.find(x=>x.teamId==='A').evidence.length,2)
h=relationHistory({playerId:'p',currentTeamId:'B',memberships:[{_id:'m',playerId:'p',teamId:'A',validFrom:null,validTo:'2025-01-01'}]});assert.equal(h.items[0].joinedAt,null);assert.equal(h.items[0].startTimeUnknown,true)
h=relationHistory({playerId:'p',currentTeamId:'B',history:[{_id:'1',playerId:'p',teamId:'A',joinedAt:'2024-01-01'},{_id:'2',playerId:'p',teamId:'B',joinedAt:'2025-01-01'}]});assert.equal(h.status,'conflict');assert(h.issues.some(x=>x.code==='MULTIPLE_CURRENT_TEAMS'));assert(h.issues.some(x=>x.code==='RELATION_PERIOD_OVERLAP'))
assert.equal(relationHistory({playerId:'p',currentTeamId:'B'}).status,'not_recorded')
const stats={dataVersion:'dataset-1',generatedAt:'2026-10-23T00:00:00Z',coverage:{status:'partial'},playerTotal:{metrics:{goals:0,minutesPlayed:null},coverage:{goals:'complete'}},playerCard:{points:null},valuation:{version:'v1',coverage:'complete',factors:{core:.5,quality:.5,appearance:.8,trend:.5},estimated:['core','quality','trend'],historyStatus:'not_recorded'},memberships:[],pointsLedger:{rows:[]},teams:[],players:[]}
let f=performanceDimensions(stats);assert.equal(f.axes[0].score,null);assert.equal(f.axes[1].value,null);assert.equal(f.axes[2].score,80);assert.equal(f.axes[3].score,null);assert.equal(f.axes[4].score,null);assert.equal(f.status,'partial')
f=performanceDimensions({...stats,valuation:{...stats.valuation,positionBucket:'GK'}});assert.equal(f.axes[1].value,null)
assert.equal(scopeKey({playerId:'p',mode:'official'}),'career');assert.notEqual(scopeKey({tournamentId:'t1'}),'career')
const valid={_id:'s1',playerId:'p',version:'v1',scopeKey:'career',authorizationKey:'platform',coverage:'complete',computedAt:'2026-10-01',total:100,money:140,dataVersion:'d1'}
assert.equal(valuationSnapshots([valid,{...valid,_id:'s2',scopeKey:'scope:other'},{...valid,_id:'s3',version:'v0'}],{playerId:'p',version:'v1'}).items.length,1)
assert.equal(valuationSnapshots([valid],{playerId:'p',version:'v1',minor:true}).items[0].money,null)
assert.equal(valuationSnapshots([{...valid,computedAt:'2099-01-01'}],{playerId:'p',version:'v1'}).items.length,0)
assert.equal(valuationSnapshots([{...valid,authorizationKey:'another-org'}],{playerId:'p',version:'v1'}).items.length,0)
function dbFixture(data,failures={},cap=100){
 const c={gt:v=>({op:'gt',v}),in:v=>({op:'in',v}),and:v=>({op:'and',v}),or:v=>({op:'or',v})}
 const matches=(row,q)=>q.op==='and'?q.v.every(x=>matches(row,x)):q.op==='or'?q.v.some(x=>matches(row,x)):Object.entries(q).every(([k,v])=>v?.op==='regex'?new RegExp(v.regexp,v.options).test(String(row[k]||'')):v?.op==='gt'?String(row[k])>String(v.v):v?.op==='in'?v.v.includes(row[k]):row[k]===v)
 return {command:c,RegExp:options=>({op:'regex',...options}),collection:name=>{let where={},limit=cap,fields=null;const q={where(v){where=v;return this},orderBy(){return this},limit(v){limit=Math.min(v,cap);return this},field(v){fields=v;return this},doc(id){return {async get(){const row=data[name]?.find(x=>x._id===id);if(!row)throw new Error('document not exist');return {data:row}}}},async get(){if(failures[name])throw failures[name];if(!(name in data))throw new Error('database collection does not exist');let rows=data[name].filter(x=>matches(x,where)).sort((a,b)=>a._id.localeCompare(b._id)).slice(0,limit);if(fields)rows=rows.map(x=>Object.fromEntries(Object.keys(fields).filter(k=>fields[k]&&k in x).map(k=>[k,x[k]])));return {data:rows}}};return q}}
}
const missingDb=dbFixture({});assert.equal((await readOptionalAll(missingDb,'optional')).status,'not_recorded')
const failing=dbFixture({rows:[]},{rows:new Error('permission denied')});await assert.rejects(readOptionalAll(failing,'rows'),e=>e.code==='DATA_READ_FAILED')
await assert.rejects(readAll(dbFixture({rows:Array.from({length:110},(_,i)=>({_id:String(i).padStart(4,'0')}))}),'rows',{}, {maxRows:100}),e=>e.code==='DATA_SCOPE_TOO_LARGE')
const markerRows=[{synthetic:true},{isTest:true},{syntheticDatasetId:'fixture'},{syntheticKey:'f'},{source:'ai_fixture'},{originType:'virtual'},{dataKind:'test'}]
assert(markerRows.every(synthetic))
const teams=[{_id:'A',name:'正式甲队'},{_id:'B',name:'正式乙队'},{_id:'T',name:'测试队',synthetic:true}]
const players=[{_id:'p',name:'同名',teamId:'A',createTime:'2024-01-01',phone:'private-phone',idCard:'private-document'},{_id:'other',name:'同名',teamId:'B'},...markerRows.map((x,i)=>({_id:'test'+i,name:'测试',teamId:'A',...x})),{_id:'underTestTeam',name:'未标记球员',teamId:'T'}]
const data={teams,players,player_transfers:[],player_team_history:[],player_team_memberships:[],matches:[]}
const db=dbFixture(data),service={async catalog(){return {teams:teams.map(x=>({id:x._id})),players:players.map(x=>({id:x._id})),tournaments:[],generatedAt:'fixed'}},async query(){return structuredClone(stats)}}
const hub=createHubService(db,service),actor={platformOwner:true}
await assert.rejects(hub.catalog({platformOwner:false}),e=>e.code==='DATA_FORBIDDEN');await assert.rejects(hub.catalog({platformOwner:true,staff:true}),e=>e.code==='DATA_FORBIDDEN')
const directory=await hub.catalog(actor,{kind:'players'}),teamDirectory=await hub.catalog(actor,{kind:'teams'});assert.deepEqual(teamDirectory.items.map(x=>x.id),['A','B']);assert.deepEqual(directory.items.map(x=>x.id),['other','p']);assert(!JSON.stringify(directory).includes('private-phone'));assert(!JSON.stringify(directory).includes('private-document'))
await assert.rejects(hub.playerProfile(actor,{playerId:'test0'}),e=>e.code==='DATA_TEST_EXCLUDED');await assert.rejects(hub.playerProfile(actor,{playerId:'underTestTeam'}),e=>e.code==='DATA_TEST_EXCLUDED');await assert.rejects(hub.teamProfile(actor,{teamId:'T'}),e=>e.code==='DATA_TEST_EXCLUDED')
await assert.rejects(hub.playerProfile(actor,{playerId:'p',scope:{tournamentId:'t'}}),e=>e.code==='DATA_CAREER_SCOPE_FIXED')
const profile=await hub.playerProfile(actor,{playerId:'p'});assert.equal(profile.profile.registration.registeredAt,null);assert.equal(profile.memberships.status,'not_recorded');assert.equal(profile.snapshots.status,'not_recorded');assert.equal(profile.snapshots.storageStatus,'not_recorded');assert.equal(profile.transfers.items.length,0)
assert.equal((await hub.playerProfile(actor,{playerId:'p'})).dataVersion,profile.dataVersion,'same facts must retain the same data version')
assert(!JSON.stringify(profile).includes('private-phone'));assert(!JSON.stringify(profile).includes('private-document'))
await assert.rejects(createHubService(dbFixture(data,{player_team_history:new Error('network failed')}),service).playerProfile(actor,{playerId:'p'}),e=>e.code==='DATA_READ_FAILED')
console.log('PASS: platform-only hub, fixed career scope, duplicate-name isolation, all test-source markers and test-team players excluded, privacy projection, explicit registration provenance, dual-history reconciliation, overlap conflicts, missing snapshots, optional-vs-failed reads, pagination budget and stable data versions')
const largePlayers=Array.from({length:10000},(_,i)=>({_id:'p'+String(i).padStart(5,'0'),name:'隔离球员'+i,teamId:i%20===1?'T':'A',synthetic:i%10===0,createTime:'2024-01-01'})),largeDb=dbFixture({teams,players:largePlayers},{},20),largeHub=createHubService(largeDb,service)
const found=new Set();let cursor=null,pages=0,scanned=0,peakPayload=0;const started=performance.now()
do{const page=await largeHub.catalog(actor,{kind:'players',pageSize:100,cursor});pages++;scanned+=page.page.scanned;assert(page.items.length<=100);peakPayload=Math.max(peakPayload,Buffer.byteLength(JSON.stringify(page)));for(const item of page.items){assert(!found.has(item.id),'cursor duplicated a player');found.add(item.id)}cursor=page.page.nextCursor;if(pages>110)throw Error('pagination did not finish')}while(cursor)
assert.equal(found.size,8500);assert.equal(scanned,10000);assert(peakPayload<100000,'directory page payload must stay bounded')
const filteredPage=await largeHub.catalog(actor,{kind:'players',teamId:'A',pageSize:25});assert.equal(filteredPage.items.length,25)
assert.equal((await largeHub.catalog(actor,{kind:'players',keyword:'隔离球员9999'})).items[0].id,'p09999')
assert.equal((await largeHub.catalog(actor,{kind:'players',keyword:'.*'})).items.length,0,'search input is literal, not a regular expression')
await assert.rejects(largeHub.catalog(actor,{kind:'teams',cursor:filteredPage.page.nextCursor}),e=>e.code==='DATA_CURSOR_INVALID')
await assert.rejects(largeHub.catalog(actor,{kind:'players',pageSize:10000}),e=>e.code==='DATA_SCOPE_INVALID')
const blockedRows=Array.from({length:1100},(_,i)=>({_id:'t'+String(i).padStart(5,'0'),teamId:'A',synthetic:true})),blockedHub=createHubService(dbFixture({teams,players:blockedRows}),service)
const blockedPage=await blockedHub.catalog(actor,{kind:'players'});assert.equal(blockedPage.items.length,0);assert.equal(blockedPage.page.scanBudgetReached,true);assert.equal(blockedPage.page.hasMore,true,'filtered page is not falsely the end')
console.log('PASS: 10,000 isolated player records; '+found.size+' formal records, '+pages+' cursor pages, zero duplicates/omissions; largest response '+peakPayload+' bytes; in-memory validation '+Math.round(performance.now()-started)+'ms (not a production latency or concurrency benchmark)')
const friendlySource=fs.readFileSync(new URL('../cloudfunctions/friendlyMatchCenter/index.js',import.meta.url),'utf8')
const friendlyRows=Array.from({length:1200},(_,i)=>({_id:'f'+String(i).padStart(5,'0'),teamId:'A',opponentTeamId:'B',playerIds:['p'],status:'finished',homeScore:1,awayScore:0,isOfficial:true,matchDate:'2026-01-01',signupToken:'private-signup-token'}))
const friendlyDb=dbFixture({teams:[{_id:'A',ownerId:'u'},{_id:'B'}],users:[{_id:'u',openId:'wx-fixture'}],players:[{_id:'p'}],friendly_matches:friendlyRows,friendly_invites:[]},{},20)
let openid='wx-fixture';const cloud={init(){},database:()=>friendlyDb,getWXContext:()=>({OPENID:openid})},sandbox={exports:{},process:{env:{}},console,Buffer,URL,AbortController,setTimeout,clearTimeout,require:name=>name==='wx-server-sdk'?cloud:name==='./data-center/team-history.cjs'?require('../cloudfunctions/dataCenter/shared/team-history.cjs'):require(name)}
vm.runInNewContext(friendlySource,sandbox,{filename:'friendlyMatchCenter-fixture.js'})
let reply=await sandbox.exports.main({action:'teamFriendlyStats',teamId:'A'})
assert.equal(reply.ok,true);assert.equal(reply.data.stats.total,1200);assert.equal(reply.data.stats.win,1200);assert.equal(reply.data.stats.officialWin,1200);assert(!JSON.stringify(reply).includes('private-signup-token'))
friendlyRows[0].homeScore=null;reply=await sandbox.exports.main({action:'teamFriendlyStats',teamId:'A'});assert.equal(reply.data.stats.draw,null);assert.equal(reply.data.coverage,'partial')
openid='';reply=await sandbox.exports.main({action:'teamFriendlyStats',teamId:'A'});assert.equal(reply.code,'UNAUTHORIZED')
console.log('PASS: existing friendlyMatchCenter dispatcher uses the canonical reader; 1,200 records with SDK cap20 are complete, missing scores remain unknown, unauthenticated read denied, private signup token excluded')
