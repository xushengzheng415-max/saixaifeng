'use strict'
const {test}=require('node:test'),assert=require('node:assert/strict')
const {createPhoneCodeLogin,createCloudStore,COLLECTION,hash}=require('../cloudfunctions/webLoginApi/phoneCodeLogin.cjs')
function fixture(){
  let stamp=Date.UTC(2026,9,28), serial=0, sessions=0, sends=0, lock=Promise.resolve()
  let tables=new Map([['users',new Map([['user-1',{phone:'13900000001',role:'coach',openId:'mini-original',orgId:'org-original'}]])],['sms_codes',new Map()],[COLLECTION,new Map()]])
  const clone=value=>value==null?value:structuredClone(value)
  const match=(row,where)=>where.$or?where.$or.some(item=>match(row,item)):Object.entries(where).every(([key,value])=>row[key]===value)
  const table=name=>{if(!tables.has(name))throw Error('Collection does not exist');return tables.get(name)}
  const collection=name=>{
    const query=(where={},max=Infinity)=>({limit:n=>query(where,n),get:async()=>({data:[...table(name)].map(([id,row])=>({_id:id,...clone(row)})).filter(row=>match(row,where)).slice(0,max)})})
    return {where:where=>query(where),limit:max=>query({},max),doc:id=>({
      get:async()=>({data:table(name).has(id)?{_id:id,...clone(table(name).get(id))}:null}),
      set:async({data})=>{table(name).set(id,clone(data))},
      update:async({data})=>{if(!table(name).has(id))throw Error('document does not exist');table(name).set(id,{...table(name).get(id),...clone(data)})}
    })}
  }
  const db={collection,command:{or:clauses=>({$or:clauses})},runTransaction:async fn=>{
    const previous=lock;let release;lock=new Promise(resolve=>{release=resolve});await previous
    const snapshot=clone(tables);try{return await fn(db)}catch(error){tables=snapshot;throw error}finally{release()}
  }}
  const store=createCloudStore(db)
  const service=createPhoneCodeLogin({store,now:()=>stamp,token:()=>String(++serial).padStart(64,'0'),sendSms:async data=>{
    sends++;table('sms_codes').set('sms-'+sends,{...data,code:String(100000+sends),used:false,expireAt:new Date(stamp+300000)});return{success:true}
  },issueSession:async userId=>{assert.equal(userId,'user-1');sessions++;return{authToken:'c'.repeat(64)}}})
  return {db,store,service,phone:'13900000001',advance:ms=>{stamp+=ms},table,sessions:()=>sessions,sends:()=>sends,now:()=>stamp}
}
test('options and successful existing-account login preserve account ownership and channel IDs',async()=>{
  const f=fixture();assert.equal((await f.service.options()).enabled,true)
  const sent=await f.service.send({phoneNumber:f.phone},'ip-a');assert.equal(sent.success,true)
  const done=await f.service.complete({phoneNumber:f.phone,smsCode:'100001',loginChallenge:sent.loginChallenge,userId:'other',isPlatformOwner:true})
  assert.equal(done.success,true);assert.equal(done.user._id,'user-1');assert.equal(done.user.isPlatformOwner,false)
  assert.equal(f.table('users').get('user-1').role,'coach');assert.equal(f.table('users').get('user-1').openId,'mini-original');assert.equal(f.table('users').get('user-1').orgId,'org-original')
  assert.equal(f.table('users').size,1);assert.equal(f.sessions(),1)
})
test('cross-field duplicate accounts block before sending and never select the first account',async()=>{
  const f=fixture();f.table('users').set('user-2',{phoneNumber:f.phone})
  assert.equal((await f.service.send({phoneNumber:f.phone},'ip-a')).code,'PHONE_ACCOUNT_CONFLICT');assert.equal(f.sends(),0)
})
test('unknown and disabled accounts do not create users or send SMS',async()=>{
  const f=fixture();assert.equal((await f.service.send({phoneNumber:'13900000002'},'ip-a')).success,false)
  f.table('users').get('user-1').disabled=true
  assert.equal((await f.service.send({phoneNumber:f.phone},'ip-a')).success,false);assert.equal(f.sends(),0);assert.equal(f.table('users').size,1)
})
test('concurrent send requests reserve the cooldown atomically',async()=>{
  const f=fixture();const results=await Promise.all([f.service.send({phoneNumber:f.phone},'ip-a'),f.service.send({phoneNumber:f.phone},'ip-b')])
  assert.equal(results.filter(row=>row.success).length,1);assert.equal(results.find(row=>!row.success).code,'SMS_COOLDOWN');assert.equal(f.sends(),1)
})
test('five wrong codes lock the challenge even if the next code is correct',async()=>{
  const f=fixture(),sent=await f.service.send({phoneNumber:f.phone},'ip-a')
  for(let i=0;i<5;i++){const result=await f.service.complete({phoneNumber:f.phone,smsCode:'999999',loginChallenge:sent.loginChallenge});assert.equal(result.success,false)}
  assert.equal((await f.service.complete({phoneNumber:f.phone,smsCode:'100001',loginChallenge:sent.loginChallenge})).success,false)
  assert.equal(f.table(COLLECTION).get(hash(sent.loginChallenge)).status,'locked');assert.equal(f.sessions(),0)
})
test('concurrent OTP replay issues exactly one session',async()=>{
  const f=fixture(),sent=await f.service.send({phoneNumber:f.phone},'ip-a'),input={phoneNumber:f.phone,smsCode:'100001',loginChallenge:sent.loginChallenge}
  const results=await Promise.all([f.service.complete(input),f.service.complete(input)])
  assert.equal(results.filter(row=>row.success).length,1);assert.equal(f.sessions(),1);assert.equal(f.table('sms_codes').get('sms-1').used,true)
})
test('expired, wrong-phone and cross-challenge codes are rejected',async()=>{
  const f=fixture(),sent=await f.service.send({phoneNumber:f.phone},'ip-a')
  assert.equal((await f.service.complete({phoneNumber:'13900000002',smsCode:'100001',loginChallenge:sent.loginChallenge})).success,false)
  f.advance(60001);const next=await f.service.send({phoneNumber:f.phone},'ip-a')
  assert.equal((await f.service.complete({phoneNumber:f.phone,smsCode:'100001',loginChallenge:next.loginChallenge})).success,false)
  f.advance(300001);assert.equal((await f.service.complete({phoneNumber:f.phone,smsCode:'100002',loginChallenge:next.loginChallenge})).success,false);assert.equal(f.sessions(),0)
})
test('account conflicts introduced after sending block verification',async()=>{
  const f=fixture(),sent=await f.service.send({phoneNumber:f.phone},'ip-a');f.table('users').set('user-2',{phoneNumber:f.phone})
  assert.equal((await f.service.complete({phoneNumber:f.phone,smsCode:'100001',loginChallenge:sent.loginChallenge})).code,'PHONE_ACCOUNT_CONFLICT');assert.equal(f.sessions(),0)
})
test('daily and client quotas enforce limits without storing raw identifiers',async()=>{
  const f=fixture(),store=createCloudStore(f.db,{dailyMax:1,hourlyIpMax:1})
  assert.equal((await store.reserve({phoneHash:hash(f.phone),ipHash:hash('ip-a'),now:f.now()})).success,true)
  f.advance(60001);assert.equal((await store.reserve({phoneHash:hash(f.phone),ipHash:hash('ip-b'),now:f.now()})).code,'SMS_DAILY_LIMIT')
  assert.equal((await store.reserve({phoneHash:hash('other'),ipHash:hash('ip-a'),now:f.now()})).code,'SMS_CLIENT_LIMIT')
  assert.equal(JSON.stringify([...f.table(COLLECTION)]).includes(f.phone),false)
})
test('global send budgets also apply across different phones and client keys',async()=>{
  const f=fixture(),store=createCloudStore(f.db,{globalHourlyMax:1,globalDailyMax:1})
  assert.equal((await store.reserve({phoneHash:hash('p-a'),ipHash:hash('ip-a'),now:f.now()})).success,true)
  assert.equal((await store.reserve({phoneHash:hash('p-b'),ipHash:hash('ip-b'),now:f.now()})).code,'SMS_SERVICE_LIMIT')
})
test('unavailable auth collection keeps phone-login capability disabled',async()=>{
  const f=fixture(),service=createPhoneCodeLogin({store:{...f.store,ready:async()=>{throw Error('missing collection')}},sendSms:async()=>{throw Error('not called')},issueSession:async()=>{throw Error('not called')}})
  assert.equal((await service.options()).enabled,false)
})
test('malformed input, failed sender and failed session never return success',async()=>{
  const f=fixture();assert.equal((await f.service.send({phoneNumber:'bad'},'ip')).success,false)
  assert.equal((await f.service.complete({phoneNumber:f.phone,smsCode:'bad',loginChallenge:'bad'})).success,false)
  const sender=createPhoneCodeLogin({store:f.store,now:f.now,sendSms:async()=>({success:false,error:'opaque'}),issueSession:async()=>{throw Error('should not run')}})
  assert.equal((await sender.send({phoneNumber:f.phone},'ip')).code,'SMS_SEND_FAILED')
  f.advance(60001);const sent=await f.service.send({phoneNumber:f.phone},'ip')
  const session=createPhoneCodeLogin({store:f.store,now:f.now,sendSms:async()=>({success:true}),issueSession:async()=>{throw Error('down')}})
  assert.equal((await session.complete({phoneNumber:f.phone,smsCode:'100001',loginChallenge:sent.loginChallenge})).code,'PHONE_SESSION_FAILED')
})
