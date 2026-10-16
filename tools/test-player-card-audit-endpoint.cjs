const assert=require('node:assert/strict'),path=require('node:path')
function fixture(root=path.resolve('cloudfunctions/webLoginApi'),options={}){
  const data={users:[],teams:[{_id:'A',name:'验收球队'},{_id:'opponent',name:'对手'}],tournaments:[{_id:'cup',name:'验收赛事'}],divisions:[{_id:'division',name:'成人组'}],players:[{_id:'p1',name:'待核定球员',teamId:'A',phone:'PRIVATE_PHONE',idCard:'PRIVATE_ID'},{_id:'p2',name:'零场球员',teamId:'A'},{_id:'p3',name:'虚构测试球员',teamId:'A',synthetic:true}],matches:[{_id:'m1',tournamentId:'cup',divisionId:'division',homeTeamId:'A',awayTeamId:'opponent',status:'completed',homeScore:0,awayScore:0,homeLineup:{starters:[{playerId:'p1',name:'待核定球员'}],substitutes:[]},awayLineup:{starters:[],substitutes:[]},events:[]}],match_events:[],match_lineup_snapshots:[],player_team_memberships:[],fan_supports:[],fan_points_ledger:[]}
  const command={in:values=>({op:'in',values}),gt:value=>({op:'gt',value}),and:values=>({op:'and',values}),or:values=>({op:'or',values})}
  function match(row,q){if(q.op==='and')return q.values.every(x=>match(row,x));if(q.op==='or')return q.values.some(x=>match(row,x));return Object.entries(q).every(([k,v])=>v?.op==='in'?v.values.includes(row[k]):v?.op==='gt'?row[k]>v.value:row[k]===v)}
  const db={command,fail:'',collection(name){let where={},limit=100,fields=null;const query={where(value){where=value;return query},orderBy(){return query},limit(value){limit=value;return query},field(value){fields=value;return query},async get(){if(db.fail===name)throw Error('fixture read failure');return {data:(data[name]||[]).filter(row=>match(row,where)).sort((a,b)=>a._id.localeCompare(b._id)).slice(0,limit).map(row=>fields?Object.fromEntries(Object.entries(row).filter(([key])=>fields[key])):structuredClone(row))}},doc(id){return {async get(){return {data:structuredClone((data[name]||[]).find(x=>x._id===id)||null)}},async set({data:value}){if(!options.writable)throw Error('Unexpected audit write');data[name]||=[];const old=data[name].find(x=>x._id===id),next={_id:id,...structuredClone(value)};if(old)Object.assign(old,next);else data[name].push(next)},async update({data:value}){if(!options.writable)throw Error('Unexpected audit write');const row=(data[name]||[]).find(x=>x._id===id);assert.ok(row);for(const [key,item]of Object.entries(value))row[key]=structuredClone(item&&Object.hasOwn(item,'$set')?item.$set:item)}}}};return query}}
  command.set=value=>({$set:value});db.runTransaction=async action=>{const before=structuredClone(data);try{return await action(db)}catch(error){for(const key of Object.keys(data))delete data[key];Object.assign(data,before);throw error}}
  let auth={success:true,principalType:'platform_owner',user:{_id:'platform-owner',isPlatformOwner:true}}
  // Downloaded production packages contain Linux raster bindings. Audits must never render.
  const Module=require('node:module'),originalLoad=Module._load
  let handler
  try{Module._load=function(name,...args){if(name==='@resvg/resvg-js')return {Resvg:class{constructor(){throw Error('Readonly audit attempted raster rendering')}}};return originalLoad.call(this,name,...args)};const cloud={database:()=>db};handler=require(path.join(root,'playerCardTemplates.cjs')).createPlayerCardTemplates({cloud,authenticateWebSession:async()=>auth})}finally{Module._load=originalLoad}
  return {data,db,handler,root,setAuth:value=>auth=value}
}
async function tests(root){const f=fixture(root),before=JSON.stringify(f.data),call=(workflowAction,params={})=>f.handler({action:'savePlayerCardTemplate',workflowAction,...params})
  let r=await call('auditPlayer',{playerId:'p1'});assert.equal(r.success,true);assert.equal(r.score.status,'ready');assert.equal(r.score.points,3);assert.ok(r.score.uncreditedFields.includes('minutesPlayed'));assert.ok(r.issues.some(x=>x.code.includes('DURATION')));assert.equal(r.careerRows[0].divisionName,'成人组');assert.ok(!JSON.stringify(r).includes('PRIVATE_'))
  const service=require(path.join(f.root,'data-center/service.cjs')).createDataService(f.db);assert.deepEqual(r.score,(await service.playerCardsForAuthorizedPlayers(['p1'])).get('p1'),'audit and issuance use identical canonical grades')
  const issueCodes=r.issues.map(x=>x.code);assert.ok(issueCodes.includes('MATCH_DURATION_MISSING')||issueCodes.includes('MATCH_DURATION_EVIDENCE_MISSING'))
  assert.equal((await call('auditPlayer',{playerId:'p3'})).score.status,'test_data_excluded')
  assert.equal((await call('auditPlayer',{playerId:'not-found'})).code,'DATA_PLAYER_NOT_FOUND')
  assert.equal((await call('auditPlayer',{playerId:'../bad'})).code,'DATA_SCOPE_INVALID')
  let cursor='',seen=[],verified=0;do{r=await call('auditQueue',{cursor,limit:1});assert.equal(r.success,true);assert.equal(r.totalPlayers,3);seen.push(...r.issues.map(x=>x.playerId));verified+=r.verifiedCount;cursor=r.nextCursor}while(cursor)
  assert.ok(!seen.includes('p1'),'missing minute evidence no longer blocks points or triggers mandatory player audit');assert.ok(seen.includes('p3'));assert.equal(new Set(seen).size,seen.length)
  f.db.fail='matches';r=await call('auditPlayer',{playerId:'p1'});assert.equal(r.success,false);assert.equal(r.code,'DATA_READ_FAILED');f.db.fail=''
  for(const role of [{success:false,code:'AUTH_REQUIRED'}, {success:true,principalType:'user',user:{_id:'organizer'}}]){f.setAuth(role);assert.equal((await call('auditPlayer',{playerId:'p1'})).success,false);assert.equal((await call('auditQueue')).success,false)}
  assert.equal(JSON.stringify(f.data),before,'all audits are read-only')
  console.log('PASS: real authenticated template dispatcher, canonical audit/issuance equality, duration unknown, source exclusion, paged scan, missing IDs, read failures, owner-only boundary, no PII and no writes')
}
module.exports={fixture}
if(require.main===module)tests(process.argv[2]?path.resolve(process.argv[2]):undefined).catch(e=>{console.error(e);process.exitCode=1})
