'use strict'

const assert = require('node:assert/strict')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const test = require('node:test')

const core = require('../core')
const { KfStateStore } = require('../state')
const { KfTestAllowlist } = require('../test-allowlist')

const routes = core.parseKfRoutes(JSON.stringify([
  { openKfId: 'kf-football', account: 'football', defaultRoute: 'football', scenes: { football: 'football' } },
  { openKfId: 'kf-basketball', account: 'basketball', defaultRoute: 'basketball', scenes: { basketball: 'basketball' } },
  { openKfId: 'kf-event', account: 'event', defaultRoute: 'event_service', requireChoiceWhenUnknown: true, scenes: { event_service: 'event_service', software_development: 'software_development' } }
]))

const welcomeRules = core.parseKfWelcomeRules(JSON.stringify({
  football: 'football welcome https://www.sxffootball.cn/admin/',
  basketball: 'basketball welcome https://www.sxfbasketball.cn/admin/index.html',
  event_service: 'event welcome',
  software_development: 'software welcome'
}))

const welcomeMenusSource = {
  football: {
    headContent: 'football menu',
    items: [
      { type: 'miniprogram', appid: 'wx57164cca8676f411', pagepath: 'pages/login/login.html', content: '打开足球小程序' }
    ],
    tailContent: 'football tail'
  },
  basketball: {
    headContent: 'basketball menu',
    items: [
      { type: 'miniprogram', appid: 'wx06d735da15276acd', pagepath: 'pages/home/index.html', content: '打开篮球小程序' }
    ],
    tailContent: 'basketball tail'
  }
}
const welcomeMenus = core.parseKfWelcomeMenus(JSON.stringify(welcomeMenusSource))

test('maps three accounts into four business routes', () => {
  assert.equal(core.resolveKfRoute('kf-football', 'football', routes).route, 'football')
  assert.equal(core.resolveKfRoute('kf-basketball', 'basketball', routes).route, 'basketball')
  assert.equal(core.resolveKfRoute('kf-event', 'event_service', routes).route, 'event_service')
  assert.equal(core.resolveKfRoute('kf-event', 'software_development', routes).route, 'software_development')
  const fallback = core.resolveKfRoute('kf-event', '', routes)
  assert.equal(fallback.route, 'event_service')
  assert.equal(fallback.needsChoice, true)
})

test('retains scene route for later messages in the same session', () => {
  const sessions = new Map()
  const enter = core.planKfItem({
    open_kfid: 'kf-event', external_userid: 'external-1', msgid: 'event-1',
    event: { event_type: 'enter_session', scene_param: 'software_development' }
  }, routes, sessions)
  const message = core.planKfItem({
    open_kfid: 'kf-event', external_userid: 'external-1', msgid: 'message-1', msgtype: 'text'
  }, routes, sessions)
  assert.equal(enter.route, 'software_development')
  assert.equal(message.route, 'software_development')
})

test('recognizes the scene value returned by a generated customer-service link', () => {
  const plan = core.planKfItem({
    event: {
      event_type: 'enter_session',
      open_kfid: 'kf-event',
      external_userid: 'external-scene',
      scene: 'event_service'
    }
  }, routes)
  assert.equal(plan.route, 'event_service')
  assert.equal(plan.sceneMatched, true)
  assert.equal(plan.needsChoice, false)
})

test('sync planner handles all four routes without sending', async () => {
  const seen = []
  const result = await core.syncKfMessages({ Token: 'sync-notification', OpenKfId: '' }, {
    corpId: 'corp', contactSecret: 'secret', kfRoutes: routes
  }, {
    getAccessToken: async () => 'access',
    requestJson: async () => ({
      has_more: 0,
      next_cursor: 'cursor-2',
      msg_list: [
        { open_kfid: 'kf-football', external_userid: 'u1', event: { event_type: 'enter_session', scene_param: 'football' } },
        { open_kfid: 'kf-basketball', external_userid: 'u2', event: { event_type: 'enter_session', scene_param: 'basketball' } },
        { open_kfid: 'kf-event', external_userid: 'u3', event: { event_type: 'enter_session', scene_param: 'event_service' } },
        { open_kfid: 'kf-event', external_userid: 'u4', event: { event_type: 'enter_session', scene_param: 'software_development' } }
      ]
    }),
    onPlan: async (plan) => seen.push(plan.route)
  })
  assert.deepEqual(seen, ['football', 'basketball', 'event_service', 'software_development'])
  assert.equal(result.cursor, 'cursor-2')
})

test('plans four welcome messages while the send switch is off', async () => {
  const seen = []
  let apiCalls = 0
  await core.syncKfMessages({ Token: 'sync-notification', OpenKfId: '' }, {
    corpId: 'corp', contactSecret: 'secret', kfRoutes: routes, kfWelcomeRules: welcomeRules, kfSendEnabled: false
  }, {
    getAccessToken: async () => 'access',
    requestJson: async () => {
      apiCalls += 1
      return {
        has_more: 0,
        next_cursor: 'cursor-welcome',
        msg_list: [
          { event: { event_type: 'enter_session', open_kfid: 'kf-football', external_userid: 'u1', scene: 'football', welcome_code: 'w1' } },
          { event: { event_type: 'enter_session', open_kfid: 'kf-basketball', external_userid: 'u2', scene: 'basketball', welcome_code: 'w2' } },
          { event: { event_type: 'enter_session', open_kfid: 'kf-event', external_userid: 'u3', scene: 'event_service', welcome_code: 'w3' } },
          { event: { event_type: 'enter_session', open_kfid: 'kf-event', external_userid: 'u4', scene: 'software_development', welcome_code: 'w4' } }
        ]
      }
    },
    onPlan: async (plan) => seen.push([plan.route, plan.welcomeStatus])
  })
  assert.equal(apiCalls, 1)
  assert.deepEqual(seen, [
    ['football', 'planned'],
    ['basketball', 'planned'],
    ['event_service', 'planned'],
    ['software_development', 'planned']
  ])
})

test('captures only the exact internal test code into the protected allowlist', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sxf-kf-allowlist-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const allowlistPath = path.join(directory, 'allowlist.json')
  const allowlist = new KfTestAllowlist(allowlistPath)
  const config = {
    corpId: 'corp', contactSecret: 'secret', kfRoutes: routes,
    kfWelcomeRules: welcomeRules, kfSendEnabled: false, kfTestCaptureCode: 'exact-internal-code'
  }
  await core.syncKfMessages({ Token: 'sync', OpenKfId: 'kf-football' }, config, {
    testAllowlist: allowlist,
    getAccessToken: async () => 'access',
    requestJson: async () => ({ has_more: 0, next_cursor: 'c1', msg_list: [{
      msgid: 'capture-1', open_kfid: 'kf-football', external_userid: 'internal-user', msgtype: 'text', text: { content: 'exact-internal-code' }
    }] })
  })
  assert.deepEqual(allowlist.summary(), { accounts: ['football'] })
  assert.equal(allowlist.get('football').externalUserId, 'internal-user')
  if (process.platform !== 'win32') assert.equal(fs.statSync(allowlistPath).mode & 0o777, 0o600)
})

test('builds a one-time test message request for one explicit target', async () => {
  let captured
  const result = await core.sendKfMessage('access', 'kf-football', 'internal-user', 'welcome', async (method, endpoint, body) => {
    captured = { method, endpoint, body }
    return { msgid: 'sent-1' }
  })
  assert.equal(captured.method, 'POST')
  assert.match(captured.endpoint, /^\/cgi-bin\/kf\/send_msg\?access_token=/)
  assert.equal(captured.body.open_kfid, 'kf-football')
  assert.equal(captured.body.touser, 'internal-user')
  assert.equal(captured.body.text.content, 'welcome')
  assert.equal(result.msgId, 'sent-1')
})

test('builds a website and mini-program menu for the test target', async () => {
  let captured
  const result = await core.sendKfMenu('access', 'kf-football', 'internal-user', welcomeMenus.football, async (method, endpoint, body) => {
    captured = { method, endpoint, body }
    return { msgid: 'menu-1' }
  })
  assert.equal(captured.body.msgtype, 'msgmenu')
  assert.equal(captured.body.msgmenu.list.length, 1)
  assert.equal(captured.body.msgmenu.list[0].miniprogram.appid, 'wx57164cca8676f411')
  assert.equal(captured.body.msgmenu.list[0].miniprogram.pagepath, 'pages/login/login.html')
  assert.equal(result.msgId, 'menu-1')
})

test('persists cursor and deduplicates messages without storing their content', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sxf-kf-state-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const statePath = path.join(directory, 'state.json')
  const stateStore = new KfStateStore(statePath)
  const seen = []
  const dependencies = {
    stateStore,
    getAccessToken: async () => 'access',
    requestJson: async () => ({
      has_more: 0,
      next_cursor: 'durable-cursor',
      msg_list: [{
        msgid: 'dedupe-message',
        open_kfid: 'kf-football',
        external_userid: 'external-private',
        msgtype: 'text',
        text: { content: 'must-not-be-persisted' }
      }]
    }),
    onPlan: async (plan) => seen.push(plan.route)
  }
  const event = { Token: 'sync-notification', OpenKfId: 'kf-football' }
  const config = { corpId: 'corp', contactSecret: 'secret', kfRoutes: routes }
  await core.syncKfMessages(event, config, dependencies)
  await core.syncKfMessages(event, config, dependencies)
  assert.deepEqual(seen, ['football'])
  assert.equal(stateStore.getCursor('kf-football'), 'durable-cursor')
  const persisted = fs.readFileSync(statePath, 'utf8')
  assert.equal(persisted.includes('must-not-be-persisted'), false)
  assert.equal(persisted.includes('external-private'), false)
})

test('keeps the existing external-contact welcome flow intact', async () => {
  const calls = []
  const result = await core.processCustomerEvent({
    Event: 'change_external_contact',
    ChangeType: 'add_external_contact',
    State: 'existing-channel',
    UserID: 'member-1',
    ExternalUserID: 'external-1',
    WelcomeCode: 'welcome-1'
  }, {
    corpId: 'corp',
    contactSecret: 'secret',
    rules: [{
      state: 'existing-channel',
      tagIds: ['tag-1'],
      identitySelector: false,
      welcome: { text: 'existing welcome', attachments: [] }
    }]
  }, {
    getAccessToken: async () => 'access',
    addCustomerTags: async () => { calls.push('tag'); return { ok: true } },
    sendWelcome: async () => { calls.push('welcome'); return { ok: true } }
  })
  assert.deepEqual(calls, ['tag', 'welcome'])
  assert.equal(result.handled, true)
  assert.equal(result.welcomed, true)
})

function encryptWechat(message, receiverId, encodingAesKey) {
  const key = Buffer.from(`${encodingAesKey}=`, 'base64')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(Buffer.byteLength(message))
  let plain = Buffer.concat([crypto.randomBytes(16), length, Buffer.from(message), Buffer.from(receiverId)])
  const pad = 32 - (plain.length % 32 || 32)
  const padLength = pad === 0 ? 32 : pad
  plain = Buffer.concat([plain, Buffer.alloc(padLength, padLength)])
  const cipher = crypto.createCipheriv('aes-256-cbc', key, key.subarray(0, 16))
  cipher.setAutoPadding(false)
  return Buffer.concat([cipher.update(plain), cipher.final()]).toString('base64')
}

test('encrypted customer-service callback stays dry and returns success', async () => {
  const original = { ...process.env }
  const receiverId = 'ww-dummy-corp'
  const callbackToken = 'dummy-callback-token'
  const encodingAesKey = crypto.randomBytes(32).toString('base64').slice(0, 43)
  Object.assign(process.env, {
    WECOM_ROUTER_ENABLED: 'false',
    WECOM_CORP_ID: receiverId,
    WECOM_CALLBACK_TOKEN: callbackToken,
    WECOM_ENCODING_AES_KEY: encodingAesKey,
    WECOM_KF_ENABLED: 'true',
    WECOM_KF_DRY_RUN: 'true',
    WECOM_KF_SEND_ENABLED: 'false',
    WECOM_KF_ACCOUNT_ROUTES_JSON: JSON.stringify(routes),
    WECOM_KF_WELCOME_RULES_JSON: JSON.stringify(welcomeRules),
    WECOM_KF_WELCOME_MENUS_JSON: JSON.stringify(welcomeMenusSource)
  })
  const message = '<xml><Event><![CDATA[kf_msg_or_event]]></Event><Token><![CDATA[dummy-sync]]></Token><OpenKfId><![CDATA[kf-event]]></OpenKfId></xml>'
  const encrypted = encryptWechat(message, receiverId, encodingAesKey)
  const timestamp = '1700000000'
  const nonce = 'dummy-nonce'
  const result = await require('../index').main({
    httpMethod: 'POST',
    queryStringParameters: {
      timestamp,
      nonce,
      msg_signature: core.createSignature(callbackToken, timestamp, nonce, encrypted)
    },
    body: `<xml><Encrypt><![CDATA[${encrypted}]]></Encrypt></xml>`
  })
  assert.equal(result.statusCode, 200)
  assert.equal(result.body, 'success')
  process.env = original
})
