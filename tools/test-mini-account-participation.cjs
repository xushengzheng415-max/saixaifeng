'use strict'
const assert=require('node:assert/strict'),service=require('../cloudfunctions/getMiniWorkspace/accountParticipation.cjs'),cards=require('../miniprogram/utils/workspace-entry-cards')
function database(tables,cap=3,fail='',allowed=['tournament_teams','tournaments','divisions']) {
 const reads=[],command={in:values=>({$in:values}),gt:value=>({$gt:value}),and:values=>({$and:values})}
 function matches(row,where){return Object.entries(where).every(([key,value])=>key==='$and'?value.every(part=>matches(row,part)):value && value.$in?value.$in.includes(row[key]):value && value.$gt!==undefined?row[key]>value.$gt:row[key]===value)}
 const db={command,collection(name){assert.ok(allowed.includes(name),'Reads only declared collections');return {where(where){let limit=100,fields;const query={orderBy(){return query},limit(value){limit=value;return query},field(value){fields=value;return query},async get(){reads.push({name,where,fields});if(name===fail)throw Error('Read failed');let rows=(tables[name]||[]).filter(row=>matches(row,where)).sort((a,b)=>a._id.localeCompare(b._id)).slice(0,Math.min(cap,limit));if(fields)rows=rows.map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>fields[key])));return {data:rows}}};return query}}}}
 return {db,reads}
}
const format=row=>({id:row._id,name:row.name,logo:row.logoUrl||'',status:row.status,dateText:'2026-09-26 — 2026-10-31'}),division=row=>String(row.divisionId||row.division||'default')
async function main(){
 const entries=[{type:'team',id:'a',name:'甲队',workspaceId:'team:a'},{type:'team',id:'b',name:'乙队',workspaceId:'org:b'},{type:'tournament',id:'unrelated',workspaceId:'shared:unrelated'}]
 const seed={tournament_teams:[
  {_id:'1',teamId:'a',tournamentId:'e1',divisionId:'old',status:'pending'},
  {_id:'2',teamId:'a',tournamentId:'e1',divisionId:'old',status:'approved'},
  {_id:'3',teamId:'b',tournamentId:'e1',divisionId:'young',divisionName:'青年组',status:'approved'},
  {_id:'4',teamId:'a',tournamentId:'e2',divisionId:'open',status:'approved'},
  {_id:'5',teamId:'a',tournamentId:'e1',divisionId:'young',status:'approved'},
  {_id:'6',teamId:'other',tournamentId:'e3',divisionId:'open',status:'approved'},
  {_id:'7',teamId:'a',tournamentId:'e3',status:'removed'},
  {_id:'8',teamId:'a',tournamentId:'synthetic',status:'approved'},
  {_id:'9',teamId:'b',tournamentId:'e3',status:'approved',synthetic:true}
 ],tournaments:[{_id:'e1',name:'赛事一',status:'ongoing'},{_id:'e2',name:'赛事二',status:'finished'},{_id:'e3',name:'无权赛事',status:'ongoing'},{_id:'synthetic',name:'虚拟赛事',isTest:true}],divisions:[{_id:'old',tournamentId:'e1',name:'老年组'},{_id:'young',tournamentId:'e1',name:'青年组'},{_id:'open',tournamentId:'e2',name:'公开组'}]}
 const fixture=database(seed),result=await service.load(fixture.db,entries,format,division)
 assert.equal(result.state,'ready');assert.equal(result.entries.length,4)
 assert.equal(new Set(result.entries.map(row=>row.key)).size,4)
 assert.equal(result.entries.find(row=>row.key==='participating:e1:a:old').registrationStatus,'approved')
 assert.equal(result.entries.find(row=>row.key==='participating:e1:a:old').divisionName,'老年组')
 assert.equal(result.entries.find(row=>row.teamId==='b').workspaceId,'org:b')
 assert.ok(!result.entries.some(row=>row.teamId==='other'||row.id==='e3'||row.id==='synthetic'))
 const context={homeEntriesVersion:'home-entries/2',homeEntries:entries,participatingEntriesVersion:'team-participation/1',participatingEntriesState:result.state,participatingEntries:result.entries,currentWorkspace:{id:'shared:unrelated'},teams:[],tournaments:[],registrations:[]}
 const displayed=cards.teamEvents(context)
 assert.equal(displayed.length,4,'Shared or another selected workspace must not hide all-account participating teams')
 assert.equal(displayed.find(row=>row.teamId==='b').participantText,'乙队 · 青年组')
 assert.ok(displayed.every(row=>row.hasParticipant))
 const failed=await service.load(database(seed,3,'tournament_teams').db,entries,format,division);assert.equal(failed.state,'failed');assert.equal(failed.entries.length,0);assert.match(failed.error,/重试/)
 assert.equal(cards.teamEvents({...context,participatingEntriesState:'failed'}).length,0)
 const empty=await service.load(database(seed).db,[],format,division);assert.equal(empty.state,'ready');assert.deepEqual(empty.entries,[])
 const many=Array.from({length:107},(_,i)=>({type:'team',id:'team-'+i,name:'隔离队'+i,workspaceId:'team:team-'+i}))
 const large={...seed,tournament_teams:many.map((row,i)=>({_id:String(i).padStart(4,'0'),teamId:row.id,tournamentId:'e1',divisionId:'old',status:'approved'}))}
 assert.equal((await service.load(database(large,2).db,many,format,division)).entries.length,107,'Short SDK pages must not truncate managed teams')
 console.log('PASS: 多队同赛事、一队多赛事/多组别、跨已验证空间、卡片球队标签、明确队组入口、重复优先已审、撤销/测试/无权排除、107队短页、真实空与失败分开')
}
module.exports={database}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1})
