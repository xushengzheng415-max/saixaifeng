const assert = require('assert')
const Module = require('module')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function matches(user, condition) {
  if (condition && condition.__or) return condition.__or.some(item => matches(user, item))
  return Object.keys(condition || {}).every(key => user[key] === condition[key])
}

function createHttpsMock(handler) {
  const { EventEmitter } = require('events')
  return function request(url, options, callback) {
    const req = new EventEmitter()
    req.write = () => {}
    req.end = () => {
      let payload
      try {
        payload = handler(url, options)
      } catch (error) {
        process.nextTick(() => req.emit('error', error))
        return
      }
      const response = new EventEmitter()
      response.statusCode = 200
      callback(response)
      process.nextTick(() => {
        response.emit('data', Buffer.from(JSON.stringify(payload)))
        response.emit('end')
      })
    }
    return req
  }
}

function loadLoginFunction(seedUsers, context, authorizedPhone, phoneError, httpsRequest) {
  const users = clone(seedUsers)
  const writes = []
  const command = { or: conditions => ({ __or: conditions }) }
  const db = {
    command,
    serverDate: () => 'SERVER_DATE',
    collection(name) {
      assert.strictEqual(name, 'users')
      return {
        where(condition) {
          return {
            limit() {
              return { get: async () => ({ data: users.filter(user => matches(user, condition)) }) }
            }
          }
        },
        doc(id) {
          return {
            update: async ({ data }) => {
              const user = users.find(item => item._id === id)
              assert(user, 'updated user must exist')
              Object.assign(user, data)
              writes.push({ type: 'update', id, data: clone(data) })
            }
          }
        },
        add: async ({ data }) => {
          const id = 'created-' + (users.length + 1)
          users.push(Object.assign({ _id: id }, clone(data)))
          writes.push({ type: 'add', id, data: clone(data) })
          return { _id: id }
        }
      }
    }
  }
  const sdk = {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    getWXContext: () => context,
    database: () => db,
    openapi: {
      phonenumber: {
        getPhoneNumber: async () => { if(phoneError)throw phoneError;return { phoneInfo: { purePhoneNumber: authorizedPhone } } }
      }
    }
  }
  const originalLoad = Module._load
  Module._load = function(request, parent, isMain) {
    if (request === 'wx-server-sdk') return sdk
    if (request === 'https' && httpsRequest) return { request: httpsRequest }
    return originalLoad.call(this, request, parent, isMain)
  }
  const modulePath = require.resolve('../cloudfunctions/checkUserByOpenId/index.js')
  delete require.cache[modulePath]
  let main
  try {
    main = require(modulePath).main
  } finally {
    Module._load = originalLoad
  }
  return { main, users, writes }
}

async function run() {
  {
    const fixture = loadLoginFunction([
      { _id: 'phone-user', phone: '13800138000', role: 'coach', wechatOpenId: 'pc-open-id', orgId: 'org-1' }
    ], { OPENID: 'mini-open-id', UNIONID: 'union-1' }, '13800138000')
    const result = await fixture.main({ phoneCode: 'valid-code' })
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.user._id, 'phone-user')
    assert.strictEqual(result.user.orgId, 'org-1')
    assert.strictEqual(fixture.users[0].openId, 'mini-open-id')
    assert.strictEqual(fixture.users[0].wechatOpenId, 'pc-open-id')
    assert.strictEqual(fixture.users[0].role, 'coach')
  }

  {
    const fixture = loadLoginFunction([
      { _id: 'duplicate-a', phone: '13800138000' },
      { _id: 'duplicate-b', phoneNumber: '13800138000' }
    ], { OPENID: 'mini-open-id' }, '13800138000')
    const result = await fixture.main({ phoneCode: 'valid-code' })
    assert.strictEqual(result.success, false)
    assert.match(result.message, /重复账号/)
    assert.strictEqual(fixture.writes.length, 0)
  }

  {
    const fixture = loadLoginFunction([
      { _id: 'phone-user', phone: '13800138000' },
      { _id: 'wechat-user', openId: 'mini-open-id', phone: '13900139000' }
    ], { OPENID: 'mini-open-id' }, '13800138000')
    const result = await fixture.main({ phoneCode: 'valid-code' })
    assert.strictEqual(result.success, false)
    assert.match(result.message, /指向不同账号/)
    assert.strictEqual(fixture.writes.length, 0)
  }

  {
    const fixture = loadLoginFunction([], { OPENID: 'new-mini-open-id' }, '13700137000')
    const result = await fixture.main({ phoneCode: 'valid-code' })
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.isNewUser, true)
    assert.strictEqual(fixture.users[0].phone, '13700137000')
    assert.strictEqual(fixture.users[0].role, undefined)
  }

  {
    const fixture = loadLoginFunction([
      { _id: 'bound-user', openId: 'mini-open-id', phone: '13600136000', phoneNumber: '13600136000' }
    ], { OPENID: 'mini-open-id' }, '13600136000')
    const result = await fixture.main({})
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.isRegistered, true)
    assert.strictEqual(result.user._id, 'bound-user')
  }

  {
    const fixture = loadLoginFunction([
      { _id: 'legacy-open-id-only', openId: 'mini-open-id' }
    ], { OPENID: 'mini-open-id' }, '13500135000')
    const result = await fixture.main({})
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.isRegistered, false)
    assert.strictEqual(result.requiresPhoneAuthorization, true)
  }

  {
    const fixture=loadLoginFunction([
      {_id:'real-user',openId:'trusted-context',phone:'13800138000'},
      {_id:'other-user',openId:'forged-client-id',phone:'13900139000'}
    ],{OPENID:'trusted-context'},'13800138000')
    const result=await fixture.main({openId:'forged-client-id'})
    assert.strictEqual(result.user._id,'real-user')
    assert.strictEqual(fixture.writes.length,0)
  }
  for(const [errCode,expected]of [[-604101,'PHONE_API_PERMISSION_DENIED'],[-604102,'PHONE_API_TIMEOUT'],[40029,'PHONE_CODE_INVALID'],[40163,'PHONE_CODE_INVALID'],[-604103,'PHONE_API_UNAVAILABLE']]){
    const fixture=loadLoginFunction([],{OPENID:'isolated-mini'},'',{errCode,errMsg:'isolated API failure'})
    const result=await fixture.main({phoneCode:'isolated-code'})
    assert.equal(result.success,false);assert.equal(result.code,expected);assert.equal(fixture.writes.length,0)
    if(errCode===-604101)assert.doesNotMatch(result.message,/失效|重新授权/)
  }
  process.env.SXF_FOOTBALL_MINIPROGRAM_APPSECRET='test-mini-secret'
  try {
    {
      const fixture=loadLoginFunction([],{OPENID:'official-api-openid'},'',{errCode:-604101,errMsg:'openapi.phonenumber.getPhoneNumber:fail system error: error code: -604101'},createHttpsMock(url=>{
        if(url.indexOf('/cgi-bin/token')>=0)return {access_token:'mock-access-token',expires_in:7200}
        if(url.indexOf('/wxa/business/getuserphonenumber')>=0)return {errcode:0,errmsg:'ok',phone_info:{purePhoneNumber:'13700137000'}}
        throw new Error('unexpected url')
      }))
      const result=await fixture.main({phoneCode:'official-code'})
      assert.strictEqual(result.success,true)
      assert.strictEqual(result.isNewUser,true)
      assert.strictEqual(result.user.phone,'13700137000')
      assert.strictEqual(fixture.users[0].phoneVerified,true)
    }
    {
      const fixture=loadLoginFunction([],{OPENID:'official-api-openid'},'',{errCode:-604101,errMsg:'system error: error code: -604101'},createHttpsMock(url=>{
        if(url.indexOf('/cgi-bin/token')>=0)return {access_token:'mock-access-token',expires_in:7200}
        return {errcode:40029,errmsg:'invalid code'}
      }))
      const result=await fixture.main({phoneCode:'used-code'})
      assert.strictEqual(result.success,false)
      assert.strictEqual(result.code,'PHONE_CODE_INVALID')
      assert.strictEqual(fixture.writes.length,0)
    }
  } finally {
    delete process.env.SXF_FOOTBALL_MINIPROGRAM_APPSECRET
  }
  assert.deepEqual(require('../cloudfunctions/checkUserByOpenId/config.json').permissions.openapi,['phonenumber.getPhoneNumber'])
  console.log('小程序手机号主账号登录测试通过：7身份场景+5错误分类+2官方接口回退，最小手机号接口权限，无失败写入或身份绕过')
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
