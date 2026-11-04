// 入队申请服务号通知接收人回归（2026-11-02）
//
// 用户现场反馈：自己从未认领某支球队，却收到该队的服务号通知。
// 根因：notifyTeamPlayerJoin 的候选接收人里带了 team.creatorId，
// 而主办方用报名表预建的占位球队正是 creatorId = 主办方账号（claimStatus: unclaimed）。
// 用户确认口径：谁认领球队谁收通知；球队未认领时不发送，只记 waiting_team_claim。
//
// 运行：node tools/test-team-join-notification-recipient.cjs

'use strict'

const assert = require('node:assert/strict')
const Module = require('module')

function createDb(seed) {
  const store = {}
  for (const [name, rows] of Object.entries(seed)) store[name] = rows.map(row => ({ ...row }))
  const list = name => (store[name] = store[name] || [])
  const matches = (row, where) => Object.keys(where || {}).every(key => String(row[key] == null ? '' : row[key]) === String(where[key]))
  const db = {
    serverDate: () => new Date(),
    command: { or: conditions => ({ __or: conditions }), in: values => ({ __in: values }) },
    createCollection: async () => { throw new Error('collection already exists') },
    collection(name) {
      return {
        doc(id) {
          const found = () => list(name).find(row => row._id === id)
          return {
            get: async () => ({ data: found() ? { ...found() } : null }),
            update: async ({ data }) => {
              const row = found()
              if (!row) throw new Error('document.getfail document with_id does not exist')
              Object.assign(row, data)
            },
            remove: async () => {
              const rows = list(name)
              const index = rows.findIndex(row => row._id === id)
              if (index >= 0) rows.splice(index, 1)
            }
          }
        },
        where(where) {
          const chain = {
            skip: () => chain,
            limit: () => chain,
            get: async () => ({ data: list(name).filter(row => matches(row, where)).map(row => ({ ...row })) })
          }
          return chain
        },
        add: async ({ data }) => {
          const id = `${name}-${list(name).length + 1}`
          list(name).push({ _id: id, ...data })
          return { _id: id }
        }
      }
    }
  }
  return { db, store }
}

function seedFor(scenario) {
  const base = {
    users: [
      { _id: 'u-organizer', openId: 'mini-organizer', name: '主办方' },
      { _id: 'u-owner', openId: 'mini-owner', name: '认领人' },
      { _id: 'u-coach', openId: 'mini-coach', name: '教练' },
      { _id: 'u-unbound', openId: 'mini-unbound', name: '未关注负责人' }
    ],
    service_account_bindings: [
      { _id: 'b-organizer', sport: 'football', miniOpenId: 'mini-organizer', officialOpenId: 'official-organizer', subscribed: true },
      { _id: 'b-owner', sport: 'football', miniOpenId: 'mini-owner', officialOpenId: 'official-owner', subscribed: true },
      { _id: 'b-coach', sport: 'football', miniOpenId: 'mini-coach', officialOpenId: 'official-coach', subscribed: true }
    ],
    teams: [
      // 主办方用报名表预建、尚无人认领的占位球队：creatorId 是主办方账号
      { _id: 'team-unclaimed', name: '预建占位队', creatorId: 'u-organizer', claimStatus: 'unclaimed' },
      // 已认领：ownerId / claimedByUserId 指向认领人，creatorId 仍是主办方
      { _id: 'team-claimed', name: '已认领球队', creatorId: 'u-organizer', ownerId: 'u-owner', claimedByUserId: 'u-owner', claimStatus: 'claimed' },
      // 已认领但认领人没有服务号关注绑定
      { _id: 'team-claimed-unbound', name: '认领人未关注', creatorId: 'u-organizer', ownerId: 'u-unbound', claimedByUserId: 'u-unbound', claimStatus: 'claimed' }
    ],
    team_invitations: [
      { _id: 'inv-unclaimed', teamId: 'team-unclaimed', type: 'team_player', inviterUserId: 'u-coach', status: 'active' },
      { _id: 'inv-claimed', teamId: 'team-claimed', type: 'team_player', inviterUserId: 'u-coach', status: 'active' },
      { _id: 'inv-unbound', teamId: 'team-claimed-unbound', type: 'team_player', inviterUserId: 'u-unbound', status: 'active' }
    ],
    players: [{ _id: 'p-1', name: '测试球员' }],
    notification_outbox: []
  }
  return base
}

async function runNotify(scenario) {
  const { db, store } = createDb(seedFor(scenario))
  const sent = []
  const sdk = {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    getWXContext: () => ({}),
    database: () => db,
    openapi: { wxacode: { getUnlimited: async () => ({ buffer: Buffer.from('') }) } }
  }
  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === 'wx-server-sdk') return sdk
    return originalLoad.call(this, request, parent, isMain)
  }
  const modulePath = require.resolve('../cloudfunctions/tournamentRegistrationFlow/index.js')
  delete require.cache[modulePath]
  const originalFetch = global.fetch
  global.fetch = async (url, options) => {
    sent.push({ url: String(url), body: JSON.parse(String(options && options.body || '{}')) })
    return { ok: true, json: async () => ({ success: true }) }
  }
  let main
  try {
    main = require(modulePath).main
    const result = await main({
      action: 'notifyTeamPlayerJoin',
      bridgeKey: process.env.SXF_FOOTBALL_SERVICE_BRIDGE_KEY,
      teamId: scenario.teamId,
      playerId: 'p-1',
      playerName: '测试球员',
      teamName: '测试球队',
      inviteId: scenario.inviteId || ''
    })
    return { result, sent, store }
  } finally {
    global.fetch = originalFetch
    Module._load = originalLoad
  }
}

async function run() {
  // 通知模块在调用时读取环境变量：模板与固定出口中转都视为已配置，只验证接收人选择。
  process.env.SXF_FOOTBALL_SERVICE_BRIDGE_KEY = 'bridge-test'
  process.env.SXF_FOOTBALL_SERVICE_TEMPLATE_TEAM_JOIN = 'tpl-team-join'
  process.env.SXF_FOOTBALL_WECHAT_BRIDGE_URL = 'https://bridge.invalid'
  process.env.SXF_FOOTBALL_WECHAT_BRIDGE_SECRET = 'bridge-secret'

  let passed = 0

  // 场景 1：球队未认领（预建占位队），主办方与教练都有关注绑定 → 不得发送给任何人
  {
    const { result, sent, store } = await runNotify({ teamId: 'team-unclaimed', inviteId: 'inv-unclaimed' })
    assert.equal(result.success, true, '场景 1：接口本身应成功返回（通知不阻断主流程）')
    assert.equal(result.data.status, 'waiting_team_claim', `场景 1：未认领球队应记 waiting_team_claim，实际 ${JSON.stringify(result)}`)
    assert.equal(result.data.code, 'TEAM_CLAIM_REQUIRED')
    assert.equal(sent.length, 0, '场景 1：球队未认领时不得调用服务号发送')
    const row = (store.notification_outbox || [])[0]
    assert.ok(row, '场景 1：必须留审计记录')
    assert.equal(row.status, 'waiting_team_claim')
    assert.equal(row.errorCode, 'TEAM_CLAIM_REQUIRED')
    assert.equal(String(row.recipientUserId || ''), '', '场景 1：未认领球队不得把主办方/教练当成接收人')
    passed++
  }

  // 场景 2：球队未认领且没有球员邀请 → 同样不发送
  {
    const { result, sent } = await runNotify({ teamId: 'team-unclaimed', inviteId: '' })
    assert.equal(result.data.status, 'waiting_team_claim')
    assert.equal(sent.length, 0, '场景 2：无认领人时不得发送')
    passed++
  }

  // 场景 3：球队已认领，发起该球员邀请的负责人（教练）优先接收
  {
    const { result, sent, store } = await runNotify({ teamId: 'team-claimed', inviteId: 'inv-claimed' })
    assert.equal(result.data.status, 'delivered')
    assert.equal(sent.length, 1, '场景 3：已认领球队应发送一条通知')
    assert.equal(sent[0].body.message.touser, 'official-coach', '场景 3：应发给邀请发起人，而不是主办方')
    assert.equal(sent[0].body.message.url, 'https://www.sxffootball.cn/')
    const row = (store.notification_outbox || [])[0]
    assert.equal(row.recipientUserId, 'u-coach')
    assert.equal(row.status, 'delivered')
    passed++
  }

  // 场景 4：已认领但认领人未关注服务号、主办方有关注绑定 → 不得回落到 creatorId 发送
  {
    const { result, sent, store } = await runNotify({ teamId: 'team-claimed-unbound', inviteId: 'inv-unbound' })
    assert.equal(result.data.status, 'waiting_follow_bind', `场景 4：应等待负责人关注，实际 ${JSON.stringify(result)}`)
    assert.equal(result.data.code, 'SERVICE_BINDING_REQUIRED')
    assert.equal(sent.length, 0, '场景 4：不得把通知改发给未认领该队的主办方')
    const row = (store.notification_outbox || [])[0]
    assert.equal(row.recipientUserId, 'u-unbound', '场景 4：审计应记录真实负责人账号')
    passed++
  }

  // 场景 5：认领人自己也有关注绑定但邀请属于其他球队时，不得借用该邀请的发起人
  {
    const { result, sent } = await runNotify({ teamId: 'team-claimed', inviteId: 'inv-unclaimed' })
    assert.equal(result.data.status, 'delivered')
    assert.equal(sent[0].body.message.touser, 'official-owner', '场景 5：邀请与球队不匹配时只按认领账号发送')
    passed++
  }

  delete process.env.SXF_FOOTBALL_SERVICE_BRIDGE_KEY
  delete process.env.SXF_FOOTBALL_SERVICE_TEMPLATE_TEAM_JOIN
  delete process.env.SXF_FOOTBALL_WECHAT_BRIDGE_URL
  delete process.env.SXF_FOOTBALL_WECHAT_BRIDGE_SECRET

  console.log(`入队申请通知接收人回归测试通过：${passed}/5`)
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
