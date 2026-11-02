'use strict'

/**
 * 微信授权撤回复规单元测试（2026-10-20）
 * 覆盖：
 * 1. authorizationRevocation 执行器：范围解析、字段删除、手机号匿名化、注销全清、渠道清理、幂等、审计留痕
 * 2. miniProgramCallback：URL 模式签名验证 + JSON/XML 事件解析转发
 * 3. openPlatformCallback：XML 事件解析（OpenID 标签优先于 FromUserName）
 * 4. platformOwner.parseRevocationText：邮件名单行解析
 * 运行：node tools/test-authorization-revocation.cjs
 */

const assert = require('assert')
const crypto = require('crypto')
const Module = require('module')
const fs = require('fs')
const os = require('os')
const path = require('path')

// ---------- wx-server-sdk 内存桩 ----------
function createDbStub(initial = {}) {
  const store = initial
  const command = {
    in: arr => ({ __op: 'in', arr }),
    gt: v => ({ __op: 'gt', v })
  }
  function matchCond(row, cond) {
    return Object.entries(cond).every(([key, value]) => {
      if (value && typeof value === 'object' && value.__op === 'in') return value.arr.includes(row[key])
      return row[key] === value
    })
  }
  function collection(name) {
    if (!store[name]) store[name] = []
    const rows = store[name]
    return {
      where(cond) {
        return {
          limit(n) {
            return {
              async get() {
                return { data: rows.filter(row => matchCond(row, cond)).slice(0, n || 20) }
              }
            }
          },
          async get() { return { data: rows.filter(row => matchCond(row, cond)) } }
        }
      },
      doc(id) {
        return {
          async get() {
            const row = rows.find(item => item._id === id)
            if (!row) throw new Error('document.get:document not exists')
            return { data: row }
          },
          async update({ data }) {
            const row = rows.find(item => item._id === id)
            if (row) Object.assign(row, data)
            return { updated: row ? 1 : 0 }
          }
        }
      },
      orderBy() {
        return {
          limit(n) {
            return { async get() { return { data: rows.slice(0, n) } } }
          }
        }
      },
      async add({ data }) {
        const _id = `${name}_${rows.length + 1}`
        rows.push({ _id, ...data })
        return { _id }
      }
    }
  }
  return { store, command, collection, serverDate: () => ({ $date: 'server' }) }
}

function createCloudStub(dbStub) {
  const calls = []
  return {
    DYNAMIC_CURRENT_ENV: Symbol('env'),
    SYMBOL_CURRENT_ENV: Symbol('env'),
    calls,
    init() {},
    database() { return dbStub },
    getWXContext() { return {} },
    async callFunction(options) {
      calls.push(options)
      return { result: { success: true } }
    }
  }
}

function installWxServerSdkStub(cloudStub) {
  const stubPath = path.join(os.tmpdir(), `wx-server-sdk-stub-${process.pid}.js`)
  fs.writeFileSync(stubPath, 'module.exports = require(' + JSON.stringify(stubPath.replace(/\\/g, '/')) + '.stub.json ? "" : "")')
  // 直接写一个可 require 的桩文件
  fs.writeFileSync(stubPath, 'module.exports = global.__WX_SERVER_SDK_STUB__')
  const originalResolve = Module._resolveFilename
  Module._resolveFilename = function(request, ...args) {
    if (request === 'wx-server-sdk') return stubPath
    return originalResolve.call(this, request, ...args)
  }
  global.__WX_SERVER_SDK_STUB__ = cloudStub
  return () => {
    Module._resolveFilename = originalResolve
    delete global.__WX_SERVER_SDK_STUB__
    try { fs.unlinkSync(stubPath) } catch (error) { /* 清理失败不影响测试结果 */ }
  }
}

function freshStore() {
  return {
    users: [
      { _id: 'user_mini', openId: 'oMINI123', unionId: 'uUNION1', nickname: '小明', nickName: '小明', avatarUrl: 'https://a/x.png', headimgurl: 'https://a/y.png', phone: '13800001111', phoneNumber: '' },
      { _id: 'user_pc', wechatOpenId: 'oWEB456', unionId: 'uUNION1', openId: 'oLEGACY789', nickname: '网页用户', phone: '13900002222', phoneNumber: '' },
      { _id: 'user_service', unionId: 'uUNION1', nickname: '服务号用户', phone: '', phoneNumber: '13700003333' },
      { _id: 'user_extra', unionId: 'uUNION2', nickname: '额外用户', phone: '13600004444', phoneNumber: '' }
    ],
    service_account_bindings: [
      { _id: 'bind_1', userId: 'user_service', officialOpenId: 'oSERVICE111', miniOpenId: 'oMINI123', subscribed: true, status: 'active' },
      { _id: 'bind_2', userId: 'user_service', officialOpenId: 'oSERVICE111', miniOpenId: 'oMINI123', subscribed: true, status: 'active' }
    ],
    service_entry_sessions: [{ _id: 'sess_1', officialOpenId: 'oSERVICE111', unionId: 'uUNION1', active: true }],
    service_follow_gates: [{ _id: 'gate_1', officialOpenId: 'oSERVICE111', subscribed: true }],
    service_entry_scans: [{ _id: 'scan_1', officialOpenId: 'oSERVICE111', subscribed: true }],
    referee_invitations: [{ _id: 'ref_1', officialOpenId: 'oSERVICE111', followStatus: 'subscribed' }],
    notification_outbox: [
      { _id: 'out_1', recipientMiniOpenId: 'oMINI123', status: 'queued' },
      { _id: 'out_2', recipientMiniOpenId: 'oMINI123', status: 'sent' }
    ]
  }
}

async function main() {
  const dbStub = createDbStub(freshStore())
  const cloudStub = createCloudStub(dbStub)
  const restore = installWxServerSdkStub(cloudStub)
  let passed = 0
  const test = (name, fn) => Promise.resolve()
    .then(fn)
    .then(() => { passed += 1; console.log('  ok -', name) })

  const executor = require(path.join(__dirname, '..', 'cloudfunctions', 'authorizationRevocation', 'index.js'))

  console.log('authorizationRevocation')
  await test('小程序撤回手机号(8)：手机号匿名化、昵称头像不受影响', async () => {
    const reply = await executor.main({
      action: 'processRevocation', appType: 'miniprogram', eventType: 'user_authorization_revoke',
      openid: 'oMINI123', revokeInfo: '8', source: 'test'
    })
    assert.equal(reply.success, true)
    assert.equal(reply.result.status, 'processed')
    const user = dbStub.store.users.find(row => row._id === 'user_mini')
    assert.ok(user.phone.startsWith('revoked-') && user.phone.length === 24)
    assert.equal(user.nickname, '小明')
    assert.equal(user.openId, 'oMINI123')
  })

  await test('手机号匿名化幂等：重复执行结果一致', async () => {
    await executor.main({ action: 'processRevocation', appType: 'miniprogram', eventType: 'user_authorization_revoke', openid: 'oMINI123', revokeInfo: '8' })
    const user = dbStub.store.users.find(row => row._id === 'user_mini')
    assert.ok(user.phone.startsWith('revoked-') && user.phone.length === 24)
  })

  await test('服务号撤回昵称头像(205)：仅清昵称头像字段', async () => {
    const reply = await executor.main({ action: 'processRevocation', appType: 'service', eventType: 'user_authorization_revoke', openid: 'oSERVICE111', unionid: 'uUNION1', revokeInfo: '205' })
    assert.equal(reply.result.status, 'processed')
    const user = dbStub.store.users.find(row => row._id === 'user_service')
    assert.equal(user.nickname, '')
    assert.equal(user.phoneNumber, '13700003333')
    assert.equal(user.unionId, 'uUNION1')
    const other = dbStub.store.users.find(row => row._id === 'user_mini')
    assert.equal(other.unionId, 'uUNION1')
  })

  await test('未收集的授权范围(204 麦克风)：无需删除', async () => {
    const reply = await executor.main({ action: 'processRevocation', appType: 'service', eventType: 'user_authorization_revoke', openid: 'oSERVICE111', revokeInfo: '204' })
    assert.equal(reply.result.status, 'no_relevant_scope')
  })

  await test('网站应用撤回全部(301)：清该渠道微信身份+匿名化手机号，不跨渠道误删 openId', async () => {
    const reply = await executor.main({ action: 'processRevocation', appType: 'website', eventType: 'user_authorization_revoke', openid: 'oWEB456', revokeInfo: '301' })
    assert.equal(reply.result.status, 'processed')
    const user = dbStub.store.users.find(row => row._id === 'user_pc')
    assert.equal(user.wechatOpenId, '')
    assert.equal(user.openId, 'oLEGACY789')
    assert.equal(user.nickname, '')
    assert.ok(user.phone.startsWith('revoked-'))
  })

  await test('小程序注销：全清身份字段+取消待发通知+解绑服务号小程序侧', async () => {
    const reply = await executor.main({ action: 'processRevocation', appType: 'miniprogram', eventType: 'user_authorization_cancellation', openid: 'oMINI123', unionid: 'uUNION1' })
    assert.equal(reply.result.status, 'processed')
    const user = dbStub.store.users.find(row => row._id === 'user_mini')
    assert.equal(user.openId, '')
    assert.equal(user.unionId, '')
    assert.equal(user.nickname, '')
    const binding = dbStub.store.service_account_bindings.find(row => row._id === 'bind_1')
    assert.equal(binding.miniOpenId, '')
    assert.equal(binding.status, 'revoked')
    const outbox = dbStub.store.notification_outbox.find(row => row._id === 'out_1')
    assert.equal(outbox.status, 'cancelled')
    const sent = dbStub.store.notification_outbox.find(row => row._id === 'out_2')
    assert.equal(sent.status, 'sent')
  })

  await test('服务号注销：全清+渠道集合清理', async () => {
    const reply = await executor.main({ action: 'processRevocation', appType: 'service', eventType: 'user_authorization_cancellation', openid: 'oSERVICE111', unionid: 'uUNION2' })
    assert.equal(reply.result.status, 'processed')
    const user = dbStub.store.users.find(row => row._id === 'user_service')
    assert.equal(user.unionId, '')
    const binding = dbStub.store.service_account_bindings.find(row => row._id === 'bind_1')
    assert.equal(binding.officialOpenId, '')
    assert.equal(dbStub.store.service_entry_sessions[0].active, false)
    assert.equal(dbStub.store.referee_invitations[0].followStatus, 'revoked')
  })

  await test('注销携带 unionid：共享同一 unionid 的其他账号一并删除微信身份', async () => {
    const extra = dbStub.store.users.find(row => row._id === 'user_extra')
    assert.equal(extra.unionId, '')
    assert.ok(extra.phone.startsWith('revoked-'))
    assert.equal(extra.nickname, '')
  })

  await test('资料变更事件(user_info_modified)：清理昵称头像', async () => {
    const reply = await executor.main({ action: 'processRevocation', appType: 'website', eventType: 'user_info_modified', openid: 'oNEWUSER' })
    assert.equal(reply.result.status, 'no_match')
  })

  await test('未知撤回码按撤回全部处理；缺 openid 返回 invalid', async () => {
    const unknown = await executor.main({ action: 'processRevocation', appType: 'miniprogram', eventType: 'user_authorization_revoke', openid: 'oUNKNOWN', revokeInfo: '999' })
    assert.equal(unknown.result.status, 'no_match')
    const invalid = await executor.main({ action: 'processRevocation', appType: 'miniprogram', openid: '' })
    assert.equal(invalid.result.status, 'invalid')
  })

  await test('批量处理：统计正确，非法 appType 记为 invalid', async () => {
    const reply = await executor.main({
      action: 'processBatch',
      items: [
        { appType: 'miniprogram', openid: 'oNOBODY', revokeInfo: '6' },
        { appType: 'wechat', openid: 'oX' },
        { appType: 'service', openid: '', revokeInfo: '' }
      ]
    })
    assert.equal(reply.summary.total, 3)
    assert.equal(reply.summary.processed, 0)
    assert.equal(reply.summary.noMatch, 1)
    assert.equal(reply.summary.invalid, 2)
  })

  await test('审计日志已写入', async () => {
    assert.ok(dbStub.store.authorization_revocation_logs.length >= 9)
    const log = dbStub.store.authorization_revocation_logs[0]
    assert.ok(log.openid)
    assert.ok(log.status)
  })

  // ---------- miniProgramCallback ----------
  console.log('miniProgramCallback')
  process.env.SXF_FOOTBALL_MINI_CALLBACK_TOKEN = 'mini-test-token'
  const miniCallback = require(path.join(__dirname, '..', 'cloudfunctions', 'miniProgramCallback', 'index.js'))
  const miniSignature = (ts, nonce) => crypto.createHash('sha1')
    .update(['mini-test-token', ts, nonce].sort().join('')).digest('hex')

  await test('URL 模式 GET 验证：签名正确时回显 echostr', async () => {
    const ts = '1626857200', nonce = 'abc123'
    const reply = await miniCallback.main({
      httpMethod: 'GET',
      queryStringParameters: { signature: miniSignature(ts, nonce), timestamp: ts, nonce, echostr: 'ECHO_9527' }
    })
    assert.equal(reply.statusCode, 200)
    assert.equal(reply.body, 'ECHO_9527')
  })

  await test('URL 模式 GET 验证：签名错误返回 403', async () => {
    const reply = await miniCallback.main({
      httpMethod: 'GET',
      queryStringParameters: { signature: 'deadbeef', timestamp: '1', nonce: 'x', echostr: 'E' }
    })
    assert.equal(reply.statusCode, 403)
  })

  await test('URL 模式 POST：JSON 撤回事件转发执行器（openid 取自 OpenID 字段）', async () => {
    const ts = '1626857201', nonce = 'abc124'
    cloudStub.calls.length = 0
    const reply = await miniCallback.main({
      httpMethod: 'POST',
      queryStringParameters: { signature: miniSignature(ts, nonce), timestamp: ts, nonce },
      isBase64Encoded: false,
      body: JSON.stringify({
        ToUserName: 'gh_xxx', FromUserName: 'platform-push-user', CreateTime: 1626857201,
        MsgType: 'event', Event: 'user_authorization_revoke',
        OpenID: 'oMINI123', UnionID: 'uUNION1', AppID: 'wx57164cca8676f411', RevokeInfo: '8'
      })
    })
    assert.equal(reply.statusCode, 200)
    assert.equal(reply.body, 'success')
    assert.equal(cloudStub.calls.length, 1)
    assert.equal(cloudStub.calls[0].name, 'authorizationRevocation')
    assert.equal(cloudStub.calls[0].data.appType, 'miniprogram')
    assert.equal(cloudStub.calls[0].data.openid, 'oMINI123')
    assert.equal(cloudStub.calls[0].data.revokeInfo, '8')
  })

  await test('普通消息（text）不触发转发', async () => {
    const ts = '1626857202', nonce = 'abc125'
    cloudStub.calls.length = 0
    const reply = await miniCallback.main({
      httpMethod: 'POST',
      queryStringParameters: { signature: miniSignature(ts, nonce), timestamp: ts, nonce },
      isBase64Encoded: false,
      body: JSON.stringify({ ToUserName: 'gh_x', FromUserName: 'oUSER', MsgType: 'text', Content: 'hi' })
    })
    assert.equal(reply.body, 'success')
    assert.equal(cloudStub.calls.length, 0)
  })

  // ---------- openPlatformCallback ----------
  console.log('openPlatformCallback')
  process.env.SXF_FOOTBALL_OPEN_CALLBACK_TOKEN = 'open-test-token'
  const openCallback = require(path.join(__dirname, '..', 'cloudfunctions', 'openPlatformCallback', 'index.js'))
  const openSignature = (ts, nonce) => crypto.createHash('sha1')
    .update(['open-test-token', ts, nonce].sort().join('')).digest('hex')

  await test('网站应用 XML 撤回事件：OpenID 标签优先于 FromUserName', async () => {
    const ts = '1626857203', nonce = 'abc126'
    cloudStub.calls.length = 0
    const xml = '<xml><ToUserName><![CDATA[gh_870882ca4b1]]></ToUserName>' +
      '<FromUserName><![CDATA[owAqB1v0ahK_Xlc7GshIDdf2yf7E]]></FromUserName>' +
      '<CreateTime>1626857200</CreateTime><MsgType><![CDATA[event]]></MsgType>' +
      '<Event><![CDATA[user_authorization_revoke]]></Event>' +
      '<OpenID><![CDATA[oWEB456]]></OpenID>' +
      '<AppID><![CDATA[wx5a42aae0e5d0669c]]></AppID>' +
      '<RevokeInfo><![CDATA[301]]></RevokeInfo></xml>'
    const reply = await openCallback.main({
      httpMethod: 'POST',
      queryStringParameters: { signature: openSignature(ts, nonce), timestamp: ts, nonce },
      isBase64Encoded: false,
      body: xml
    })
    assert.equal(reply.body, 'success')
    assert.equal(cloudStub.calls.length, 1)
    assert.equal(cloudStub.calls[0].data.appType, 'website')
    assert.equal(cloudStub.calls[0].data.openid, 'oWEB456')
    assert.equal(cloudStub.calls[0].data.revokeInfo, '301')
  })

  await test('网站应用：其他 AppID 的事件不转发', async () => {
    const ts = '1626857204', nonce = 'abc127'
    cloudStub.calls.length = 0
    const xml = '<xml><MsgType><![CDATA[event]]></MsgType><Event><![CDATA[user_authorization_revoke]]></Event><OpenID><![CDATA[oX]]></OpenID><AppID><![CDATA[wxOTHER]]></AppID></xml>'
    await openCallback.main({
      httpMethod: 'POST',
      queryStringParameters: { signature: openSignature(ts, nonce), timestamp: ts, nonce },
      isBase64Encoded: false, body: xml
    })
    assert.equal(cloudStub.calls.length, 0)
  })

  // ---------- serviceAccountCallback 撤回事件分支 ----------
  console.log('serviceAccountCallback')
  process.env.SXF_FOOTBALL_SERVICE_CALLBACK_TOKEN = 'service-test-token'
  const serviceCallback = require(path.join(__dirname, '..', 'cloudfunctions', 'serviceAccountCallback', 'index.js'))
  const serviceSignature = (ts, nonce) => crypto.createHash('sha1')
    .update(['service-test-token', ts, nonce].sort().join('')).digest('hex')

  await test('服务号 XML 撤回事件转发执行器', async () => {
    const ts = '1626857205', nonce = 'abc128'
    cloudStub.calls.length = 0
    const xml = '<xml><ToUserName><![CDATA[gh_xxx]]></ToUserName><FromUserName><![CDATA[platform-user]]></FromUserName>' +
      '<MsgType><![CDATA[event]]></MsgType><Event><![CDATA[user_authorization_revoke]]></Event>' +
      '<OpenID><![CDATA[oSERVICE111]]></OpenID><AppID><![CDATA[wxSERVICE]]></AppID><RevokeInfo><![CDATA[205]]></RevokeInfo></xml>'
    const reply = await serviceCallback.main({
      httpMethod: 'POST',
      queryStringParameters: { signature: serviceSignature(ts, nonce), timestamp: ts, nonce },
      isBase64Encoded: false, body: xml
    })
    assert.equal(reply.statusCode, 200)
    assert.equal(reply.body, 'success')
    assert.equal(cloudStub.calls.length, 1)
    assert.equal(cloudStub.calls[0].data.appType, 'service')
    assert.equal(cloudStub.calls[0].data.openid, 'oSERVICE111')
  })

  await test('服务号 unsubscribe 事件不受新分支影响', async () => {
    const ts = '1626857206', nonce = 'abc129'
    cloudStub.calls.length = 0
    const xml = '<xml><ToUserName><![CDATA[gh_xxx]]></ToUserName><FromUserName><![CDATA[oREALUSER]]></FromUserName>' +
      '<MsgType><![CDATA[event]]></MsgType><Event><![CDATA[unsubscribe]]></Event></xml>'
    const reply = await serviceCallback.main({
      httpMethod: 'POST',
      queryStringParameters: { signature: serviceSignature(ts, nonce), timestamp: ts, nonce },
      isBase64Encoded: false, body: xml
    })
    assert.equal(reply.statusCode, 200)
    assert.equal(cloudStub.calls.filter(call => call.name === 'authorizationRevocation').length, 0)
  })

  // ---------- platformOwner.parseRevocationText ----------
  console.log('platformOwner 邮件名单解析')
  await test('名单行解析：合法行、分隔符兼容、非法行收集', async () => {
    const platformSource = fs.readFileSync(path.join(__dirname, '..', 'cloudfunctions', 'platformOwner', 'index.js'), 'utf8')
    assert.ok(platformSource.includes('parseRevocationText'))
    const fnMatch = platformSource.match(/const REVOCATION_APP_TYPES[\s\S]*?function parseRevocationText[\s\S]*?\n}/)
    assert.ok(fnMatch, 'parseRevocationText 函数存在')
    const parseRevocationText = new Function(fnMatch[0] + '; return parseRevocationText;')()
    const parsed = parseRevocationText([
      'miniprogram,oAAA111',
      'service,oBBB222,uUNION9,205',
      'website\t,oCCC333',
      'badline',
      'miniprogram,',
      ''
    ].join('\n'))
    assert.equal(parsed.items.length, 3)
    assert.deepEqual(parsed.items[0], { appType: 'miniprogram', openid: 'oAAA111', unionid: '', revokeInfo: '', source: 'email_batch' })
    assert.equal(parsed.items[1].revokeInfo, '205')
    assert.equal(parsed.invalidLines.length, 2)
  })

  restore()
  console.log(`\n全部 ${passed} 项测试通过`)
}

main().catch(error => {
  console.error('测试失败:', error)
  process.exit(1)
})
