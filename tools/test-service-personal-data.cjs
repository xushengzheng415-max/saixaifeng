const assert=require('node:assert/strict'),{setup,uid}=require('./test-service-private.cjs')
const create=require(process.argv[2]?require('node:path').resolve(process.argv[2]):'../cloudfunctions/webLoginApi/servicePersonalData.cjs')
async function main(){
 let count=0
 const test=async(name,fn)=>{await fn();count++;console.log('PASS '+name)}
 const factory=(x,service)=>create({db:x.db,cloud:x.cloud,user:x.rows.users[0],dataService:service})
 await test('two live names remain separate stable identities',async()=>{const x=setup(rows=>rows.players.push({...rows.players[0],_id:'distinct-child'}));const r=await factory(x).handle('servicePrivateOverview',{});assert.equal(r.data.players.filter(row=>row.name==='fixture child').length,2)})
 await test('archived player read is forbidden before career capability',async()=>{let called=false;const x=setup(rows=>rows.players[0].status='archived');const r=await factory(x,{query:async()=>{called=true}}).handle('servicePrivatePlayerData',{playerId:'child'});assert.equal(r.code,'SERVICE_PRIVATE_FORBIDDEN');assert.equal(called,false)})
 await test('foreign player never reaches statistics service',async()=>{let called=false;const r=await factory(setup(),{query:async()=>{called=true}}).handle('servicePrivatePlayerData',{playerId:'foreign'});assert.equal(r.code,'SERVICE_PRIVATE_FORBIDDEN');assert.equal(called,false)})
 await test('career statistics reused with only authorized player projection',async()=>{
  const x=setup(rows=>{rows.matches=[{_id:'m1',homeTeamId:'mine',awayTeamId:'other-team',tournamentId:'participant',status:'completed',homeScore:0,awayScore:1}];rows.players[0].status='active'})
  const service={query:async(actor,scope)=>{assert.equal(scope.playerId,'child');assert.equal(scope.mode,'official');return{playerTotal:{metrics:{appearances:1,goals:null},coverage:{goals:'partial'}},players:[{playerId:'child',matchIds:['m1']}],coverage:{playerCardMatchIds:{child:['m1']}},records:[{playerId:'child',matchId:'m1',type:'yellow_card',minute:12,counted:true},{playerId:'foreign',matchId:'m1',type:'goal',minute:20}],standings:[{secret:'must not return'}],dataVersion:'fixture-v'}}}
  const r=await factory(x,service).handle('servicePrivatePlayerData',{playerId:'child'});assert.equal(r.data.metrics.goals,null);assert.equal(r.data.matches[0].homeScore,0);assert.equal(r.data.events.length,1);assert.equal(r.data.events[0].minute,12);assert.equal(r.data.standings,undefined);assert(!JSON.stringify(r).includes('foreign'))
 })
 await test('referee distinct matches deduplicated, revoked and foreign excluded',async()=>{
  const x=setup(rows=>{rows.match_referees=[{_id:'a',refereeId:'ref',matchId:'m1',role:'mainReferee',canOperate:true},{_id:'b',refereeId:'ref',matchId:'m1',role:'fourthOfficial',canOperate:true},{_id:'c',refereeId:'ref',matchId:'m2',role:'assistant1',status:'accepted',canOperate:false},{_id:'d',refereeId:'ref',matchId:'revoked',canOperate:true,status:'revoked'},{_id:'e',refereeId:'other-ref',matchId:'foreign',canOperate:true}];rows.matches=['m1','m2','revoked','foreign'].map((id,i)=>({_id:id,homeTeamId:'mine',awayTeamId:'other-team',tournamentId:'participant',status:i===0?'completed':'scheduled'}))})
  const r=await factory(x).handle('servicePrivateRefereeData',{});assert.equal(r.data.summary.total,2);assert.equal(r.data.summary.completed,1);assert.equal(r.data.summary.upcoming,1);assert.equal(r.data.matches.find(row=>row.id==='m1').roles.length,2);assert(!JSON.stringify(r).includes('foreign'));assert.deepEqual(x.writes,[])
 })
 await test('test team removes its match from personal referee totals',async()=>{const x=setup(rows=>{rows.match_referees=[{_id:'a',refereeId:'ref',matchId:'test-match',canOperate:true}];rows.matches=[{_id:'test-match',homeTeamId:'test-team',awayTeamId:'mine',status:'completed'}]});assert.equal((await factory(x).handle('servicePrivateRefereeData',{})).data.summary.total,0)})
 console.log(count+' personal data tests passed')
}
main().catch(error=>{console.error(error);process.exitCode=1})
