'use strict'
const assert=require('node:assert/strict'),crypto=require('node:crypto')
const create=require(require.main===module&&process.argv[2]?require('node:path').resolve(process.argv[2]):'../cloudfunctions/webLoginApi/servicePrivate.cjs')
const token='a'.repeat(64),uid='fixture-user',phone='13900000000'
const hash=value=>crypto.createHash('sha256').update(value).digest('hex')
const op=(kind,value)=>({kind,value})
const command={or:value=>op('or',value),and:value=>op('and',value),gt:value=>op('gt',value),in:value=>op('in',value)}
function matches(row,condition){
  if(condition.kind==='or')return condition.value.some(value=>matches(row,value))
  if(condition.kind==='and')return condition.value.every(value=>matches(row,value))
  return Object.entries(condition).every(([key,value])=>value&&value.kind==='gt'?row[key]>value.value:value&&value.kind==='in'?value.value.includes(row[key]):row[key]===value)
}
function setup(edit=()=>{}){
  const rows={
    referee_h5_sessions:[{_id:'session',tokenHash:hash(token),active:true,expiresAt:new Date(Date.now()+60000),serviceAccountOpenId:'official-own'}],
    service_account_bindings:[{_id:'binding',sport:'football',officialOpenId:'official-own',userId:uid,subscribed:true}],
    users:[{_id:uid,phone,phoneNumber:phone,phoneVerified:true}],
    players:[{_id:'child',name:'fixture child',guardianUserId:uid,teamId:'other-team'},{_id:'self',name:'fixture player',playerUserId:uid},{_id:'foreign',name:'DO NOT EXPOSE',guardianUserId:'foreign'}],
    teams:[{_id:'mine',name:'My team',ownerId:uid},{_id:'managed',name:'Managed team'},{_id:'creator-only',name:'NOT OWNED',creatorId:uid},{_id:'other-team',name:'Child team'},{_id:'test-team',ownerId:uid,isTest:true}],
    team_memberships:[{_id:'member',userId:uid,teamId:'managed',status:'accepted'},{_id:'revoked',userId:uid,teamId:'other-team',status:'revoked'}],
    tournaments:[{_id:'hosted',name:'Host',creatorId:uid},{_id:'shared',name:'Shared',orgId:'org-a'},{_id:'participant',name:'Participant'},{_id:'foreign-event',name:'DO NOT EXPOSE',orgId:'org-b'}],
    tournament_staff_grants:[{_id:'grant',userId:uid,status:'active',tournamentId:'shared',orgId:'org-a',permissions:['event.dashboard']},{_id:'badgrant',userId:uid,status:'active',tournamentId:'foreign-event',orgId:'org-a',permissions:['event.dashboard']}],
    tournament_teams:[{_id:'registration',teamId:'mine',tournamentId:'participant',status:'approved'}],
    referees:[{_id:'ref',name:'Fixture referee',phone}],referee_oauth_states:[],service_identities:[]
  }
  edit(rows)
  const writes=[],requestedFiles=[]
  let failure=''
  const db={command,serverDate:()=>new Date(),collection(name){
    const collection={where(condition){let limit=100,fields=null
      const query={limit(value){limit=value;return query},field(value){fields=value;return query},orderBy(){return query},async get(){
        if(failure===name)throw new Error('network failed')
        const data=(rows[name]||[]).filter(row=>matches(row,condition)).sort((a,b)=>a._id.localeCompare(b._id)).slice(0,limit)
        return {data:data.map(row=>fields?Object.fromEntries(Object.keys(fields).filter(key=>fields[key]&&key in row).map(key=>[key,row[key]])):row)}
      }};return query
    },doc(id){return {get:async()=>{const row=(rows[name]||[]).find(row=>row._id===id);if(!row)throw new Error('document with _id does not exist');return{data:row}},set:async({data})=>{writes.push(name);(rows[name]||=[]).push({_id:id,...data})},update:async({data})=>{writes.push(name);Object.assign(rows[name].find(row=>row._id===id),data)}}}}
    return collection
  }}
  const cloud={database:()=>db,getTempFileURL:async({fileList})=>{requestedFiles.push(...fileList);return{fileList:fileList.map(fileID=>({fileID,tempFileURL:'https://assets.example/'+encodeURIComponent(fileID)}))}}}
  const handle=create({cloud,config:{APP_ID:'fixture-app',APP_SECRET:'fixture-secret'},hashSessionToken:hash,dateValue:value=>new Date(value).getTime(),httpsGet:async()=>({openid:'official-own'}),createSession:async()=>({token,expiresAt:new Date(Date.now()+60000)})})
  return {handle,rows,writes,requestedFiles,db,cloud,failOn:value=>failure=value}
}
async function main(){
  let count=0
  const test=async(name,fn)=>{await fn();count++;console.log('PASS '+name)}
  await test('missing and forged sessions fail closed',async()=>{const x=setup();for(const t of ['', 'b'.repeat(64)])assert.equal((await x.handle('servicePrivateOverview',{serviceSessionToken:t,userId:uid,phone})).code,'SERVICE_PRIVATE_AUTH_REQUIRED');assert.deepEqual(x.writes,[])})
  await test('expired session cannot read relationships',async()=>{const x=setup(rows=>rows.referee_h5_sessions[0].expiresAt=new Date(0));assert.equal((await x.handle('servicePrivateOverview',{serviceSessionToken:token})).code,'SERVICE_PRIVATE_AUTH_REQUIRED')})
  await test('own player and guardian identities only, no organization dashboard',async()=>{const x=setup();const result=await x.handle('servicePrivateOverview',{serviceSessionToken:token,userId:'foreign'});assert.equal(result.success,true);const d=result.data;assert.deepEqual(d.players.map(row=>row.id).sort(),['child','self']);assert.equal(d.teams,undefined);assert.equal(d.tournaments,undefined);assert.equal(d.hasReferee,true);assert(!JSON.stringify(d).includes('DO NOT EXPOSE'));assert(!JSON.stringify(d).includes(phone));assert.deepEqual(x.writes,[])})
  await test('duplicate phone across phone aliases is blocked',async()=>{const x=setup(rows=>rows.users.push({_id:'duplicate',phoneNumber:phone}));assert.equal((await x.handle('servicePrivateOverview',{serviceSessionToken:token})).code,'SERVICE_PRIVATE_ACCOUNT_CONFLICT')})
  await test('conflicting service account bindings blocked',async()=>{const x=setup(rows=>rows.service_account_bindings.push({_id:'conflict',sport:'football',officialOpenId:'official-own',subscribed:true,userId:'foreign'}));assert.equal((await x.handle('servicePrivateOverview',{serviceSessionToken:token})).code,'SERVICE_PRIVATE_ACCOUNT_CONFLICT')})
  await test('unbound does not search by browser phone',async()=>{const x=setup(rows=>rows.service_account_bindings=[]);assert.equal((await x.handle('servicePrivateOverview',{serviceSessionToken:token,phone})).needsBinding,true)})
  await test('stale subscription flag preserves existing account binding',async()=>{const x=setup(rows=>Object.assign(rows.service_account_bindings[0],{subscribed:false,status:'unsubscribed'}));assert.equal((await x.handle('servicePrivateOverview',{serviceSessionToken:token})).data.players.length,2)})
  await test('revoked binding cannot use legacy referee identity fallback',async()=>{const x=setup(rows=>{rows.service_account_bindings[0].status='revoked';rows.service_identities=[{_id:'identity',serviceAccountOpenId:'official-own',phoneVerified:true,phone}]});assert.equal((await x.handle('servicePrivateOverview',{serviceSessionToken:token})).needsBinding,true)})
  await test('verified referee binding resolves unique canonical account',async()=>{const x=setup(rows=>{rows.service_account_bindings=[];rows.service_identities=[{_id:'identity',serviceAccountOpenId:'official-own',phoneVerified:true,phone}]});assert.equal((await x.handle('servicePrivateOverview',{serviceSessionToken:token})).data.referee.name,'Fixture referee')})
  await test('database failure is not a successful empty overview',async()=>{const x=setup();x.failOn('players');assert.equal((await x.handle('servicePrivateOverview',{serviceSessionToken:token})).code,'SERVICE_PRIVATE_READ_FAILED')})
  await test('only authorized assets receive signed URLs',async()=>{const x=setup(rows=>{rows.players[0].photoUrl='cloud://fixture/own';rows.players[2].photoUrl='cloud://fixture/foreign'});assert.equal((await x.handle('servicePrivateOverview',{serviceSessionToken:token})).success,true);assert.deepEqual(x.requestedFiles,['cloud://fixture/own'])})
  await test('OAuth return is pinned to personal page',async()=>{const x=setup();const r=await x.handle('servicePrivateOAuthUrl',{returnUrl:'https://evil.example/'});assert.equal(new URL(r.authorizeUrl).searchParams.get('redirect_uri'),'https://www.sxffootball.cn/service-account-h5/me.html');assert.equal(x.rows.referee_oauth_states[0].purpose,'service_private')})
  await test('OAuth preview return and one-use purpose isolation',async()=>{const x=setup();let r=await x.handle('servicePrivateOAuthUrl',{returnUrl:'https://www.sxffootball.cn/preview/service-account-h5/me.html'});assert(new URL(r.authorizeUrl).searchParams.get('redirect_uri').includes('/preview/'));const state=x.rows.referee_oauth_states[0]._id;r=await x.handle('servicePrivateOAuth',{state,code:'fixture'});assert.equal(r.success,true);assert.equal((await x.handle('servicePrivateOAuth',{state,code:'fixture'})).code,'SERVICE_PRIVATE_OAUTH_INVALID');x.rows.referee_oauth_states[0].used=false;x.rows.referee_oauth_states[0].purpose='other';assert.equal((await x.handle('servicePrivateOAuth',{state,code:'fixture'})).code,'SERVICE_PRIVATE_OAUTH_INVALID')})
  await test('missing OAuth state uses expired-auth recovery',async()=>{assert.equal((await setup().handle('servicePrivateOAuth',{state:'a'.repeat(40),code:'invalid'})).code,'SERVICE_PRIVATE_OAUTH_INVALID')})
  await test('archived same-name profile is excluded by projected status',async()=>{const x=setup(rows=>rows.players.push({...rows.players[0],_id:'old-child',status:'archived'}));const result=await x.handle('servicePrivateOverview',{serviceSessionToken:token});assert.deepEqual(result.data.players.filter(row=>row.name==='fixture child').map(row=>row.id),['child'])})
  // UI integration is exercised with a real DOM by the formal-page browser QA.
  await test('registration list and resume require current authenticated account',async()=>{const x=setup();for(const action of ['servicePrivateRegistrationList','servicePrivateResumeRegistration'])assert.equal((await x.handle(action,{serviceSessionToken:'forged',registrationId:'other',userId:uid})).code,'SERVICE_PRIVATE_AUTH_REQUIRED');assert.deepEqual(x.writes,[])})
  await test('bound account receives an authenticated empty registration catalog without writes',async()=>{const x=setup();const r=await x.handle('servicePrivateRegistrationList',{serviceSessionToken:token,userId:'foreign'});assert.equal(r.success,true);assert.deepEqual(r.entries,[]);assert.deepEqual(x.writes,[])})
  await test('registration recovery OAuth returns only to the fixed official page',async()=>{const x=setup();const url='https://www.sxffootball.cn/service-account-h5/registration-resume.html';const r=await x.handle('servicePrivateOAuthUrl',{returnUrl:url});assert.equal(new URL(r.authorizeUrl).searchParams.get('redirect_uri'),url);const bad=await x.handle('servicePrivateOAuthUrl',{returnUrl:url+'?next=https://evil.example'});assert.equal(new URL(bad.authorizeUrl).searchParams.get('redirect_uri'),'https://www.sxffootball.cn/service-account-h5/me.html')})
  console.log(count+' personal service tests passed')
}
module.exports={setup,token,uid,phone}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1})
