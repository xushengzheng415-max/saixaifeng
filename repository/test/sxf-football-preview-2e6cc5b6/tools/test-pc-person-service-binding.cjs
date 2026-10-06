const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const Module = require('node:module')
const path = require('node:path')
const functionRoot = process.env.SXF_FUNCTION_ROOT || path.join(__dirname, '../cloudfunctions')

const user = { _id:'person-a', phone:'13800138000', phoneVerified:true, orgId:'event-org' }
const token = 'verified-pc-session'
const rows = {
  users:[user],
  auth_sessions:[{ _id:'session-a', tokenHash:crypto.createHash('sha256').update(token).digest('hex'), userId:user._id, active:true, expiresAt:new Date(Date.now()+3600000) }],
  service_account_bindings:[],
  service_follow_gates:[{ _id:'gate-a', sport:'football', purpose:'organizer_pc_bind', userId:user._id, orgId:'unrelated-team-org', scene:'op_existing', status:'waiting', subscribed:false, followUrl:'https://mp.weixin.qq.com/qr/test', qrExpireAt:new Date(Date.now()+3600000) }]
}
const command = { gt:value=>({ gt:value }), or:items=>({ or:items }) }
function matches(row, query) {
  return Object.entries(query || {}).every(([key,value]) => key === 'or'
    ? value.some(item => matches(row,item))
    : value && typeof value === 'object' && Object.hasOwn(value,'gt')
      ? new Date(row[key]).getTime() > new Date(value.gt).getTime()
      : row[key] === value)
}
const db = {
  command,
  serverDate:()=>new Date(),
  async createCollection(name) { rows[name] ||= [] },
  collection(name) { return {
    doc(id) { return {
      async get() { return { data:(rows[name] || []).find(row => row._id === id) || null } },
      async update({ data }) { const row=(rows[name] || []).find(item => item._id === id); if (!row) throw Error('missing document'); Object.assign(row,data) }
    } },
    where(query) { return { limit(limit) { return { async get() { return { data:(rows[name] || []).filter(row => matches(row,query)).slice(0,limit) } } } } } },
    async add({ data }) { const id=`${name}-${(rows[name] ||= []).length+1}`;rows[name].push({ _id:id,...data });return { _id:id } }
  } }
}
const cloud = { DYNAMIC_CURRENT_ENV:'mock', init(){}, database:()=>db }
const originalLoad = Module._load
Module._load = function(request,parent,isMain) { return request === 'wx-server-sdk' ? cloud : originalLoad.call(this,request,parent,isMain) }
let flow
try { flow = require(path.join(functionRoot, 'tournamentRegistrationFlow/index.js')) } finally { Module._load = originalLoad }
Module._load = function(request,parent,isMain) { return request === 'wx-server-sdk' ? cloud : originalLoad.call(this,request,parent,isMain) }
let callback
try { callback = require(path.join(functionRoot, 'serviceAccountCallback/index.js')) } finally { Module._load = originalLoad }

async function main() {
  const identity = { __authToken:token, __actorUserId:user._id }
  const created = await flow.main({ action:'createOrganizerServiceGate', ...identity })
  assert.equal(created.success,true)
  assert.equal(created.data.followUrl,'https://mp.weixin.qq.com/qr/test')
  assert.equal(created.data.gateId,'gate-a')
  const status = await flow.main({ action:'getOrganizerServiceBindingStatus', gateId:'gate-a', ...identity })
  assert.equal(status.success,true)
  assert.equal(status.data.status,'waiting')
  assert.equal((await flow.main({ action:'createOrganizerServiceGate', __authToken:token, __actorUserId:'other-person' })).code,'AUTH_REQUIRED')
  assert.equal((await flow.main({ action:'createOrganizerServiceGate' })).code,'AUTH_REQUIRED')
  process.env.SXF_FOOTBALL_SERVICE_CALLBACK_TOKEN = 'local-callback-test-token'
  const timestamp = '1790000000', nonce = 'nonce-a'
  const signature = crypto.createHash('sha1').update([process.env.SXF_FOOTBALL_SERVICE_CALLBACK_TOKEN,timestamp,nonce].sort().join('')).digest('hex')
  const xml = '<xml><ToUserName><![CDATA[service-account]]></ToUserName><FromUserName><![CDATA[official-person-a]]></FromUserName><MsgType><![CDATA[event]]></MsgType><Event><![CDATA[SCAN]]></Event><EventKey><![CDATA[op_existing]]></EventKey></xml>'
  const reply = await callback.main({ httpMethod:'POST', queryStringParameters:{ timestamp,nonce,signature }, body:xml })
  assert.equal(reply.statusCode,200)
  assert.match(reply.body,/绑定成功/)
  assert.doesNotMatch(reply.body,/机构：/)
  assert.equal(rows.service_account_bindings.length,1)
  assert.equal(rows.service_account_bindings[0].userId,user._id)
  assert.equal(rows.service_account_bindings[0].officialOpenId,'official-person-a')
  assert.equal(rows.service_follow_gates[0].subscribed,true)
  rows.users.push({ _id:'person-b', phone:'13900139000', phoneVerified:true })
  rows.service_follow_gates.push({ _id:'gate-b', sport:'football', purpose:'organizer_pc_bind', userId:'person-b', scene:'op_other', status:'waiting', subscribed:false })
  const conflict = await callback.main({ httpMethod:'POST', queryStringParameters:{ timestamp,nonce,signature }, body:xml.replace('op_existing','op_other') })
  assert.equal(conflict.statusCode,200)
  assert.equal(rows.service_follow_gates[1].status,'identity_conflict')
  assert.equal(rows.service_account_bindings.length,1)
  delete process.env.SXF_FOOTBALL_SERVICE_CALLBACK_TOKEN
  console.log('PC service binding: verified person can reuse QR across organization labels; spoofed session denied')
}
main().catch(error => { console.error(error); process.exitCode=1 })
