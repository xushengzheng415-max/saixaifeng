const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto')
const source=fs.readFileSync('cloudfunctions/webLoginApi/index.js','utf8')
const start=source.indexOf('async function handleRosterExceptionBoard(event) {')
const match=/\n(?:async )?function [A-Za-z_]/.exec(source.slice(start+1));const code=source.slice(start,start+1+match.index)
const tables={tournaments:[{_id:'event',orgId:'org'}],teams:[{_id:'team',orgId:'org'}],tournament_teams:[{_id:'relation',tournamentId:'event',teamId:'team',divisionId:'division',status:'approved'}],players:[{_id:'pending',teamId:'team',teamCode:'team',identityStatus:'not_verified'},{_id:'formal',teamId:'team',identityStatus:'verified'},{_id:'foreign',teamId:'other'}],roster_snapshots:[{_id:'snapshot',tournamentId:'event',teamId:'team',divisionId:'division',status:'approved',version:1,playerIds:['formal']}]}
let writes=[],delegated=false,permission=true,authenticated=true
const clone=x=>JSON.parse(JSON.stringify(x))
const collection=name=>({where(where){return {limit(){return this},async get(){return {data:clone((tables[name]||[]).filter(row=>Object.entries(where).every(([k,v])=>row[k]===v)))}}}},doc(id){return {async get(){return {data:clone((tables[name]||[]).find(row=>row._id===id)||null)}},async update({data}){const row=(tables[name]||[]).find(row=>row._id===id);assert(row);Object.assign(row,data);writes.push({name,id,data:clone(data)})}}},async add({data}){const _id='isolated-'+writes.length;(tables[name]||=[]).push({_id,...clone(data)});writes.push({name,id:_id,data:clone(data)});return {_id}}})
const db={collection,serverDate:()=>new Date().toISOString()}
const scope={orgId:'org',tournamentIds:new Set(['event'])}
const context={cloud:{database:()=>db,callFunction:async()=>{throw new Error('No real notifications allowed')}},crypto,SERVICE_ACCOUNT_CONFIG:{APP_SECRET:''},console,authenticateWebSession:async()=>authenticated?{success:true,orgId:'org',userId:'actor',user:{_id:'actor',orgId:'org',nickname:'隔离审核员'}}:{success:false,code:'AUTH_REQUIRED'},staffPolicy:{isStaff:async()=>delegated,owner:async()=>!delegated,hasRight:async()=>permission},buildStaffEventScope:async()=>scope,buildOrganizerScope:async()=>scope,organizerRecordAllowed:(_c,row,s)=>row.orgId===s.orgId,mergeRosterPlayerRows:groups=>[...new Map(groups.flat().map(row=>[row._id,row])).values()],rosterSnapshotPlayerIds:row=>row?.playerIds||[]}
vm.createContext(context);vm.runInContext(code+'\n;globalThis.review=handleRosterExceptionBoard',context)
const params={rosterAction:'rejectPlayer',tournamentId:'event',divisionId:'division',teamId:'team',playerId:'pending'}
async function run(){
 const snapshots=JSON.stringify(tables.roster_snapshots)
 let result=await context.review({...params,reason:'  '});assert.equal(result.code,'REASON_REQUIRED');assert.equal(writes.length,0)
 result=await context.review({...params,divisionId:'other',reason:'应拒绝'});assert.equal(result.success,false);assert.equal(writes.length,0)
 result=await context.review({...params,playerId:'foreign',reason:'应拒绝'});assert.equal(result.success,false);assert.equal(writes.length,0)
 result=await context.review({...params,playerId:'formal',reason:'应保留正式名单'});assert.equal(result.code,'IN_FORMAL_ROSTER');assert.equal(writes.length,0)
 delegated=true;permission=false;result=await context.review({...params,staffTournamentId:'event',reason:'无权限'});assert.equal(result.code,'TOURNAMENT_STAFF_SCOPE_DENIED');assert.equal(writes.length,0)
 permission=true;result=await context.review({...params,staffTournamentId:'other',reason:'跨赛事'});assert.equal(result.code,'TOURNAMENT_STAFF_SCOPE_DENIED');assert.equal(writes.length,0)
 delegated=false;authenticated=false;result=await context.review({...params,reason:'未登录'});assert.equal(result.code,'AUTH_REQUIRED');assert.equal(writes.length,0)
 authenticated=true;result=await context.review({...params,reason:'请补充清晰头像'});assert.equal(result.success,true);assert.equal(result.reviewStatus,'rejected')
 const player=tables.players.find(p=>p._id==='pending');assert.equal(player.organizerReviewStatus,'rejected');assert.equal(player.organizerReviewReason,'请补充清晰头像');assert.equal(player.identityStatus,'not_verified');assert.equal(tables.players.length,3);assert.equal(JSON.stringify(tables.roster_snapshots),snapshots);assert(writes.every(row=>['players','tournament_teams'].includes(row.name)))
 console.log('PASS: deployed rejection handler requires reason/auth/event/team/division scope; formal membership protected; reason persists; identity/history/players preserved; zero production writes or notifications')
}
run().catch(error=>{console.error(error);process.exit(1)})
