'use strict'
const {test}=require('node:test'),assert=require('node:assert/strict')
const moduleReady=import(require('node:url').pathToFileURL(require('node:path').resolve('web-admin-vue/src/utils/phoneCodeLogin.js')))
function storage(initial={}){const map=new Map(Object.entries(initial)),events=[];return{map,events,getItem:key=>map.get(key)||null,removeItem:key=>{events.push(['remove',key]);map.delete(key)},setItem:(key,value)=>{events.push(['set',key,value]);map.set(key,String(value))}}}
const valid={success:true,authToken:'c'.repeat(64),user:{_id:'user-new',phone:'13900000001',nickname:'测试账号',role:'coach'}}
test('request uses only HTTP auth fields and never forwards an old session or role claims',async()=>{
  const {phoneLoginRequest}=await moduleReady;let request
  await phoneLoginRequest('sendPhoneCodeLoginSms',{phoneNumber:'13900000001',authToken:'old',userId:'owner',isPlatformOwner:true},async(url,options)=>{request={url,options};return{ok:true,json:async()=>({success:true})}})
  assert.match(request.url,/\/webLoginApi$/);assert.equal(request.options.credentials,'omit');assert.equal(request.options.redirect,'error')
  assert.deepEqual(JSON.parse(request.options.body),{action:'sendPhoneCodeLoginSms',phoneNumber:'13900000001'})
})
test('wrapped responses and actionable network errors are handled without logging response data',async()=>{
  const {phoneLoginRequest}=await moduleReady
  assert.equal((await phoneLoginRequest('phoneCodeLoginOptions',{},async()=>({ok:true,json:async()=>({body:JSON.stringify({success:true,enabled:true})})}))).enabled,true)
  await assert.rejects(phoneLoginRequest('phoneCodeLoginOptions',{},async()=>{throw new TypeError('Failed to fetch')}),/重试/)
  await assert.rejects(phoneLoginRequest('other',{},async()=>{}),/操作无效/)
})
test('successful account switch clears tenant and staff caches before committing login last',async()=>{
  const {commitPhoneLoginSession}=await moduleReady
  const local=storage({authToken:'old',isLoggedIn:'true',userId:'old-user',currentOrg:'old-org',currentOrganization:'old-tenant',assistanceContext:'old-assistance',platformAuthToken:'keep-platform',platformSession:'keep-separate-channel'})
  const session=storage({sxfStaffPermissions:'old-permissions',sxfStaffTournamentId:'old-event',sxfPlatformAuthContext:'platform'})
  commitPhoneLoginSession(valid,{local,session})
  assert.equal(local.getItem('userId'),'user-new');assert.equal(local.getItem('currentOrg'),null);assert.equal(local.getItem('currentOrganization'),null);assert.equal(local.getItem('assistanceContext'),null)
  assert.equal(session.getItem('sxfStaffPermissions'),null);assert.equal(session.getItem('sxfPlatformAuthContext'),null)
  assert.equal(local.getItem('platformAuthToken'),'keep-platform');assert.equal(local.getItem('platformSession'),'keep-separate-channel')
  assert.deepEqual(local.events.at(-1),['set','isLoggedIn','true']);assert.equal(local.events[0][0],'remove')
})
test('incomplete backend session never mutates existing login',async()=>{
  const {commitPhoneLoginSession}=await moduleReady,local=storage({userId:'old'})
  assert.throws(()=>commitPhoneLoginSession({...valid,authToken:''},{local,session:storage()}),/不完整/)
  assert.equal(local.getItem('userId'),'old');assert.equal(local.events.length,0)
})
test('storage failure clears all partially committed authentication fields',async()=>{
  const {commitPhoneLoginSession}=await moduleReady,local=storage({userId:'old',authToken:'old',isLoggedIn:'true'}),original=local.setItem
  local.setItem=(key,value)=>{if(key==='authToken')throw Error('quota');original(key,value)}
  assert.throws(()=>commitPhoneLoginSession(valid,{local,session:storage()}),/存储/)
  assert.equal(local.getItem('isLoggedIn'),null);assert.equal(local.getItem('authToken'),null);assert.equal(local.getItem('userId'),null)
})
