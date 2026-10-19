// 服务号 H5 登记受控动作本地测试（P0-1 接口断点 / P0-2 建档默认值 / P0-3 认领匹配 / 球员认领闭环）。
// 用法：node tools/test-service-entry-registration.cjs
// 说明：用内存数据库 mock 云函数入口，只验证 getMiniWorkspace 的
// acceptServiceTeamPlayer / acceptServiceTeamClaim 鉴权链与业务分支，
// 不连接真实 CloudBase、不产生任何线上数据；本地 PASS 不代替真实账号验收。
'use strict'

const assert = require('assert')
const crypto = require('crypto')
const Module = require('module')

// ---------- 内存数据库 mock ----------
function createMockDb(initialSeed) {
  const store = {}
  let idCounter = 0

  function cmpValue(value) {
    if (value instanceof Date) return { type: 'date', value: value.getTime() }
    if (value && typeof value === 'object' && (value.$date || value._date)) return { type: 'date', value: new Date(value.$date || value._date).getTime() }
    if (typeof value === 'number') return { type: 'num', value }
    return { type: 'str', value: String(value == null ? '' : value) }
  }

  function matchCondition(doc, condition) {
    if (condition && condition.__op) {
      if (condition.__op === 'or') return condition.conditions.some(item => matchCondition(doc, item))
      if (condition.__op === 'and') return condition.conditions.every(item => matchCondition(doc, item))
      if (condition.__op === 'in') return condition.values.map(String).indexOf(String(doc[condition.field] == null ? '' : doc[condition.field])) >= 0
      if (condition.__op === 'gt' || condition.__op === 'gte') {
        const left = cmpValue(doc[condition.field]), right = cmpValue(condition.value)
        if (left.type !== right.type) return false
        return condition.__op === 'gt' ? left.value > right.value : left.value >= right.value
      }
      throw new Error('mock 不支持的命令: ' + condition.__op)
    }
    return Object.keys(condition || {}).every(key => {
      const expected = condition[key]
      if (expected && expected.__op) {
        const scoped = Object.assign({}, expected, { field: key })
        return matchCondition(doc, scoped)
      }
      return String(doc[key] == null ? '' : doc[key]) === String(expected == null ? '' : expected)
    })
  }

  function collection(name) {
    if (!store[name]) store[name] = []
    const rows = () => store[name]
    return {
      where(condition) {
        const state = { condition, skipCount: 0, limitCount: Infinity, order: null }
        const run = () => {
          let matched = rows().filter(doc => matchCondition(doc, state.condition))
          if (state.order) matched = matched.slice().sort((a, b) => (String(a[state.order.field]) > String(b[state.order.field]) ? 1 : -1))
          if (state.skipCount) matched = matched.slice(state.skipCount)
          if (state.limitCount !== Infinity) matched = matched.slice(0, state.limitCount)
          return matched.map(doc => structuredClone(doc))
        }
        const query = {
          limit(count) { state.limitCount = count; return query },
          skip(count) { state.skipCount = count; return query },
          orderBy(field, direction) { state.order = { field, direction }; return query },
          field() { return query },
          async get() { return { data: run() } }
        }
        return query
      },
      doc(id) {
        const found = () => rows().find(doc => String(doc._id) === String(id))
        const missing = () => { const error = new Error('document.getfail document with_id ' + id + ' does not exist'); error.code = 'DOCUMENT_NOT_FOUND'; throw error }
        return {
          async get() { const row = found(); if (!row) missing(); return { data: structuredClone(row) } },
          async update(payload) {
            const row = found(); if (!row) missing()
            const data = payload && payload.data || {}
            Object.keys(data).forEach(key => {
              const value = data[key]
              if (value && value.__op === 'inc') row[key] = (Number(row[key]) || 0) + value.value
              else row[key] = value
            })
            return { stats: { updated: 1 } }
          },
          async set(payload) {
            const data = payload && payload.data || {}
            const row = found()
            if (row) Object.assign(row, data)
            else store[name].push(Object.assign({ _id: String(id) }, data))
            return { stats: { updated: 1 } }
          },
          async remove() { const index = rows().findIndex(doc => String(doc._id) === String(id)); if (index < 0) missing(); rows().splice(index, 1); return { stats: { removed: 1 } } }
        }
      },
      async add(payload) {
        const data = (payload && payload.data) || {}
        idCounter += 1
        const doc = Object.assign({}, data, { _id: data._id || name + '_' + idCounter })
        rows().push(doc)
        return { _id: doc._id }
      }
    }
  }

  const command = {
    or: conditions => ({ __op: 'or', conditions }),
    and: conditions => ({ __op: 'and', conditions }),
    in: values => ({ __op: 'in', values: values || [] }),
    gt: value => ({ __op: 'gt', value }),
    gte: value => ({ __op: 'gte', value }),
    inc: value => ({ __op: 'inc', value })
  }

  const db = {
    collection,
    command,
    serverDate: () => new Date(),
    __reset(seed) {
      Object.keys(store).forEach(key => { delete store[key] })
      Object.keys(seed || {}).forEach(key => { store[key] = structuredClone(seed[key]) })
      idCounter = 0
    },
    __store: store
  }
  db.__reset(initialSeed)
  return db
}

// ---------- 用 mock 加载云函数入口 ----------
function loadWorkspaceEntry(db) {
  const mockSdk = {
    init: () => {},
    DYNAMIC_CURRENT_ENV: 'mock-env',
    database: () => db,
    getWXContext: () => ({ OPENID: '', APPID: '', UNIONID: '' }),
    callFunction: async () => ({ result: { success: false, code: 'MOCK_UNSUPPORTED', message: 'mock 不支持跨函数调用' } }),
    getTempFileURL: async () => ({ fileList: [] }),
    uploadFile: async () => ({ fileID: '' })
  }
  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === 'wx-server-sdk') return mockSdk
    return originalLoad.apply(this, arguments)
  }
  try {
    return require('../cloudfunctions/getMiniWorkspace/index.js').main
  } finally {
    Module._load = originalLoad
  }
}

// ---------- 测试数据 ----------
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const NOW = Date.now()
const HOUR = 3600000
const DAY = 86400000
const TOKEN_PLAYER = 'a'.repeat(64)
const TOKEN_CLAIM = 'b'.repeat(64)
const TOKEN_CLAIM_OTHER = 'c'.repeat(64)

function baseSeed() {
  return {
    users: [
      { _id: 'user_parent', phone: '13812345678', phoneNumber: '13812345678', phoneVerified: true, role: 'user', nickname: '家长甲' },
      { _id: 'user_owner', phone: '13911112222', phoneNumber: '13911112222', phoneVerified: true, role: 'user', nickname: '领队乙' },
      { _id: 'user_other', phone: '13700001111', phoneNumber: '13700001111', phoneVerified: true, role: 'user' }
    ],
    service_entry_sessions: [
      { _id: 'sess_player', tokenHash: sha256(TOKEN_PLAYER), gateId: 'gate_player', purpose: 'player_invite_entry', officialOpenId: 'official_open_1', phoneVerified: true, userId: 'user_parent', phone: '13812345678', active: true, expiresAt: new Date(NOW + 12 * HOUR) },
      { _id: 'sess_claim', tokenHash: sha256(TOKEN_CLAIM), gateId: 'gate_claim', purpose: 'team_claim_entry', officialOpenId: 'official_open_2', phoneVerified: true, userId: 'user_owner', phone: '13911112222', active: true, expiresAt: new Date(NOW + 12 * HOUR) },
      { _id: 'sess_claim_other', tokenHash: sha256(TOKEN_CLAIM_OTHER), gateId: 'gate_claim', purpose: 'team_claim_entry', officialOpenId: 'official_open_3', phoneVerified: true, userId: 'user_other', phone: '13700001111', active: true, expiresAt: new Date(NOW + 12 * HOUR) }
    ],
    service_follow_gates: [
      { _id: 'gate_player', sport: 'football', purpose: 'player_invite_entry', entryKey: 'tp_token_1', teamId: 'team_1', inviteId: 'invite_player', status: 'active', expiresAt: new Date(NOW + DAY) },
      { _id: 'gate_claim', sport: 'football', purpose: 'team_claim_entry', entryKey: 'invite_claim', teamId: 'team_prebuilt', tournamentId: 't_1', inviteId: 'invite_tournament_claim', targetedInviteId: '', status: 'active', expiresAt: new Date(NOW + DAY) }
    ],
    service_entry_scans: [
      { _id: sha256('gate_player:official_open_1'), gateId: 'gate_player', officialOpenId: 'official_open_1', subscribed: true, expiresAt: new Date(NOW + DAY) },
      { _id: sha256('gate_claim:official_open_2'), gateId: 'gate_claim', officialOpenId: 'official_open_2', subscribed: true, expiresAt: new Date(NOW + DAY) },
      { _id: sha256('gate_claim:official_open_3'), gateId: 'gate_claim', officialOpenId: 'official_open_3', subscribed: true, expiresAt: new Date(NOW + DAY) }
    ],
    service_account_bindings: [
      { _id: 'bind_1', sport: 'football', uniqueKey: 'football:user:user_parent', userId: 'user_parent', officialOpenId: 'official_open_1', subscribed: true },
      { _id: 'bind_2', sport: 'football', uniqueKey: 'football:user:user_owner', userId: 'user_owner', officialOpenId: 'official_open_2', subscribed: true },
      { _id: 'bind_3', sport: 'football', uniqueKey: 'football:user:user_other', userId: 'user_other', officialOpenId: 'official_open_3', subscribed: true }
    ],
    team_invitations: [
      { _id: 'invite_player', type: 'team_player', teamId: 'team_1', orgId: '', token: 'tp_token_1', status: 'active', expiresAt: new Date(NOW + DAY), participantMode: 'age_based' },
      { _id: 'invite_claim', type: 'prebuilt_tournament_team', teamId: 'team_prebuilt', tournamentId: 't_1', divisionId: 'default', divisionName: 'U8', status: 'pending', inviteExpireAt: new Date(NOW + DAY), allowedClaimPhones: ['13911112222'], organizerOrgId: '' }
    ],
    teams: [
      { _id: 'team_1', name: '测试青训队', orgId: '' },
      { _id: 'team_prebuilt', name: '预建队甲', claimStatus: 'unclaimed', orgId: '' }
    ],
    tournaments: [{ _id: 't_1', name: '测试赛事', organizerOrgId: '' }],
    players: [],
    team_memberships: [],
    tournament_teams: [],
    parent_profile_invites: [],
    tournament_tasks: [],
    notification_outbox: [],
    registration_audit_logs: [],
    registration_player_drafts: [],
    registration_import_batches: [],
    roster_snapshots: [],
    organization_memberships: [],
    organizations: [],
    sms_codes: []
  }
}

// ---------- 用例执行 ----------
const db = createMockDb(baseSeed())
const entry = loadWorkspaceEntry(db)
const results = []

async function test(name, fn) {
  db.__reset(baseSeed())
  try {
    await fn()
    results.push({ name, ok: true })
    console.log('PASS  ' + name)
  } catch (error) {
    results.push({ name, ok: false, error })
    console.log('FAIL  ' + name + '\n      ' + (error && error.message || error))
  }
}

function expectCode(promise, code, messageIncludes) {
  return promise.then(
    result => {
      assert.strictEqual(result && result.success, false, '期望失败 ' + code + '，实际成功: ' + JSON.stringify(result).slice(0, 200))
      assert.strictEqual(result.code, code, '期望错误码 ' + code + '，实际 ' + result.code + ' / ' + result.message)
      if (messageIncludes) assert.ok(String(result.message || '').indexOf(messageIncludes) >= 0, '错误信息应包含 ' + messageIncludes + '，实际: ' + result.message)
      return result
    },
    error => { throw new Error('期望返回错误 ' + code + '，实际抛出异常: ' + (error && error.message || error)) }
  )
}

async function main() {
  // ===== 会话鉴权链 =====
  await test('旧小程序入队不能绕过明确选择和必填校验', async () => {
    await expectCode(entry({action:'acceptTeamPlayerInvite',name:'张小球',birthDate:'2015-05-01',authorizationAgreed:true}), 'SERVICE_PLAYER_REGISTRATION_REQUIRED')
    assert.strictEqual(db.__store.players.length,0)
  })

  await test('无效会话令牌 → ENTRY_SESSION_INVALID', async () => {
    await expectCode(entry({ action: 'acceptServiceTeamPlayer', serviceEntrySession: 'short' }), 'ENTRY_SESSION_INVALID')
  })

  await test('会话过期 → ENTRY_SESSION_EXPIRED', async () => {
    const seed = baseSeed()
    seed.service_entry_sessions[0].expiresAt = new Date(NOW - HOUR)
    db.__reset(seed)
    await expectCode(entry({ action: 'acceptServiceTeamPlayer', serviceEntrySession: TOKEN_PLAYER }), 'ENTRY_SESSION_EXPIRED')
  })

  await test('手机号未验证 → ENTRY_PHONE_REQUIRED', async () => {
    const seed = baseSeed()
    seed.service_entry_sessions[0].phoneVerified = false
    db.__reset(seed)
    await expectCode(entry({ action: 'acceptServiceTeamPlayer', serviceEntrySession: TOKEN_PLAYER }), 'ENTRY_PHONE_REQUIRED')
  })

  await test('入口已停用 → ENTRY_GATE_INVALID', async () => {
    const seed = baseSeed()
    seed.service_follow_gates[0].status = 'expired'
    db.__reset(seed)
    await expectCode(entry({ action: 'acceptServiceTeamPlayer', serviceEntrySession: TOKEN_PLAYER }), 'ENTRY_GATE_INVALID')
  })

  await test('入口用途不匹配 → ENTRY_PURPOSE_MISMATCH', async () => {
    await expectCode(entry({ action: 'acceptServiceTeamPlayer', serviceEntrySession: TOKEN_CLAIM }), 'ENTRY_PURPOSE_MISMATCH')
  })

  await test('未关注服务号 → ENTRY_SUBSCRIPTION_REQUIRED', async () => {
    const seed = baseSeed()
    seed.service_entry_scans[0].subscribed = false
    db.__reset(seed)
    await expectCode(entry({ action: 'acceptServiceTeamPlayer', serviceEntrySession: TOKEN_PLAYER }), 'ENTRY_SUBSCRIPTION_REQUIRED')
  })

  await test('手机号重复账号 → ACCOUNT_CONFLICT', async () => {
    const seed = baseSeed()
    seed.users.push({ _id: 'user_parent_dup', phone: '13812345678', phoneNumber: '13812345678', phoneVerified: true })
    db.__reset(seed)
    await expectCode(entry({ action: 'acceptServiceTeamPlayer', serviceEntrySession: TOKEN_PLAYER }), 'ACCOUNT_CONFLICT')
  })

  await test('会话账号与手机号不一致 → ENTRY_SESSION_STALE', async () => {
    const seed = baseSeed()
    seed.service_entry_sessions[0].userId = 'user_other'
    db.__reset(seed)
    await expectCode(entry({ action: 'acceptServiceTeamPlayer', serviceEntrySession: TOKEN_PLAYER }), 'ENTRY_SESSION_STALE')
  })

  await test('微信已绑定其他账号 → WECHAT_ACCOUNT_CONFLICT', async () => {
    const seed = baseSeed()
    seed.service_account_bindings[0].userId = 'user_other'
    db.__reset(seed)
    await expectCode(entry({ action: 'acceptServiceTeamPlayer', serviceEntrySession: TOKEN_PLAYER }), 'WECHAT_ACCOUNT_CONFLICT')
  })

  // ===== 球员登记 =====
  await test('旧客户端不能跳过查找选择直接登记', async () => {
    await expectCode(entry({action:'acceptServiceTeamPlayer', serviceEntrySession:TOKEN_PLAYER, name:'张小球',birthDate:'2015-05-01',authorizationAgreed:true}), 'PLAYER_CHOICE_REQUIRED')
    assert.strictEqual(db.__store.players.length,0)
  })

  await test('邀请类型不匹配 → PLAYER_INVITE_INVALID', async () => {
    const seed = baseSeed()
    seed.service_follow_gates[0].inviteId = 'invite_claim'
    db.__reset(seed)
    await expectCode(entry({ action: 'acceptServiceTeamPlayer', serviceEntrySession: TOKEN_PLAYER, name: '张小球', birthDate: '2015-05-01', authorizationAgreed: true }), 'PLAYER_INVITE_INVALID')
  })

  await test('入口与邀请球队不一致 → PLAYER_INVITE_INVALID', async () => {
    const seed = baseSeed()
    seed.service_follow_gates[0].teamId = 'team_prebuilt'
    db.__reset(seed)
    await expectCode(entry({ action: 'acceptServiceTeamPlayer', serviceEntrySession: TOKEN_PLAYER, name: '张小球', birthDate: '2015-05-01', authorizationAgreed: true }), 'PLAYER_INVITE_INVALID')
  })

  await test('入口与邀请令牌不一致 → PLAYER_INVITE_INVALID', async () => {
    const seed = baseSeed()
    seed.service_follow_gates[0].entryKey = 'tp_wrong_token'
    db.__reset(seed)
    await expectCode(entry({ action: 'acceptServiceTeamPlayer', serviceEntrySession: TOKEN_PLAYER, name: '张小球', birthDate: '2015-05-01', authorizationAgreed: true }), 'PLAYER_INVITE_INVALID')
  })

  // Registration v2 explicit choice, mandatory fields, identity proof, number
  // conflict, archive exclusion and concurrent writes: test-player-registration.cjs.
  // The former name+DOB auto-claim expectations were superseded on 2026-10-18.

  // ===== 球队认领 =====
  await test('认领全链路：归属、参赛关系、待办与审计', async () => {
    const result = await entry({ action: 'acceptServiceTeamClaim', serviceEntrySession: TOKEN_CLAIM, inviteId: 'invite_claim', disclaimerAgreed: true })
    assert.strictEqual(result.success, true, '认领应成功')
    assert.strictEqual(result.teamName, '预建队甲')
    const team = db.__store.teams.find(item => item._id === 'team_prebuilt')
    assert.strictEqual(team.ownerId, 'user_owner', '应设置球队负责人')
    assert.strictEqual(team.claimStatus, 'claimed')
    const invite = db.__store.team_invitations.find(item => item._id === 'invite_claim')
    assert.strictEqual(invite.status, 'accepted', '邀请应标记已接受')
    assert.strictEqual(invite.acceptedUserId, 'user_owner')
    const membership = db.__store.team_memberships.find(item => item.userId === 'user_owner')
    assert.ok(membership && membership.role === 'owner', '应建立负责人成员关系')
    const relation = db.__store.tournament_teams.find(item => item.teamId === 'team_prebuilt')
    assert.ok(relation && relation.claimStatus === 'claimed', '应建立/更新参赛关系')
    assert.ok(db.__store.tournament_tasks.some(item => item.type === 'registration_review' && item.audience === 'organizer'), '应生成组委会审核待办')
    assert.ok(db.__store.tournament_tasks.some(item => item.type === 'registration_status' && item.audience === 'team'), '应生成球队报名状态待办')
    assert.ok(db.__store.registration_audit_logs.some(item => item.action === 'targeted_registration_confirmed'), '应记录审计日志')
  })

  await test('手机号不在认领范围 → CLAIM_NOT_ALLOWED', async () => {
    const seed = baseSeed()
    seed.team_invitations[1].allowedClaimPhones = ['10225262771']
    db.__reset(seed)
    await expectCode(entry({ action: 'acceptServiceTeamClaim', serviceEntrySession: TOKEN_CLAIM, inviteId: 'invite_claim', disclaimerAgreed: true }), 'CLAIM_NOT_ALLOWED')
  })

  await test('球队已有其他负责人 → CLAIM_REVIEW_REQUIRED（不静默换绑）', async () => {
    const seed = baseSeed()
    seed.teams[1].ownerId = 'user_other'
    seed.teams[1].claimStatus = 'claimed'
    db.__reset(seed)
    await expectCode(entry({ action: 'acceptServiceTeamClaim', serviceEntrySession: TOKEN_CLAIM, inviteId: 'invite_claim', disclaimerAgreed: true }), 'CLAIM_REVIEW_REQUIRED')
  })

  await test('重复进入已认领邀请 → 幂等返回', async () => {
    const seed = baseSeed()
    seed.team_invitations[1].status = 'accepted'
    seed.team_invitations[1].acceptedUserId = 'user_owner'
    seed.team_invitations[1].acceptedTeamId = 'team_prebuilt'
    seed.teams[1].ownerId = 'user_owner'
    seed.teams[1].claimStatus = 'claimed'
    db.__reset(seed)
    const result = await entry({ action: 'acceptServiceTeamClaim', serviceEntrySession: TOKEN_CLAIM, inviteId: 'invite_claim', disclaimerAgreed: true })
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.alreadyClaimed, true)
    assert.strictEqual(db.__store.tournament_teams.length, 0, '幂等路径不得重复创建参赛关系')
  })

  await test('未同意免责声明 → DISCLAIMER_REQUIRED', async () => {
    await expectCode(entry({ action: 'acceptServiceTeamClaim', serviceEntrySession: TOKEN_CLAIM, inviteId: 'invite_claim', disclaimerAgreed: false }), 'DISCLAIMER_REQUIRED')
  })

  await test('认领赛事与入口不一致 → CLAIM_INVITE_INVALID', async () => {
    const seed = baseSeed()
    seed.team_invitations[1].tournamentId = 't_other'
    db.__reset(seed)
    await expectCode(entry({ action: 'acceptServiceTeamClaim', serviceEntrySession: TOKEN_CLAIM, inviteId: 'invite_claim', disclaimerAgreed: true }), 'CLAIM_INVITE_INVALID')
  })

  const failed = results.filter(item => !item.ok)
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' 通过')
  if (failed.length) {
    failed.forEach(item => console.error('失败详情: ' + item.name + '\n' + (item.error && item.error.stack || item.error)))
    process.exitCode = 1
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
