const assert = require('assert')
const Module = require('module')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function matches(user, condition) {
  if (condition && condition.__or) return condition.__or.some(item => matches(user, item))
  return Object.keys(condition || {}).every(key => user[key] === condition[key])
}

function loadLoginFunction(seedUsers, context, authorizedPhone) {
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
        getPhoneNumber: async () => ({ phoneInfo: { purePhoneNumber: authorizedPhone } })
      }
    }
  }
  const originalLoad = Module._load
  Module._load = function(request, parent, isMain) {
    if (request === 'wx-server-sdk') return sdk
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

  console.log('小程序手机号主账号登录测试通过：6/6')
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
