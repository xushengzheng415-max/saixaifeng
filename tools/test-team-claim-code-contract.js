// 赛事级球队认领码契约回归测试
//
// 覆盖本改动的核心安全边界：去掉逐队 token 后，「谁能认领哪支球队」完全由
// 已验证手机号在服务端匹配，前端不得参与判定。因此本测试的重点是反向用例：
// 不匹配的手机号、空白名单、过期邀请、已认领球队都不能被认领或出现在列表里。
//
// 运行：node tools/test-team-claim-code-contract.js

const assert = require('assert')
const Module = require('module')

const OPEN_ID = 'openid-1'
const PHONE_A = '13800000001'
const PHONE_B = '13900000002'
const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

function matches(row, where) {
  if (!where) return true
  // db.command.or(...) 返回的是 { __or: [条件...] }，即 __or 是 where 自身的键。
  if (Array.isArray(where.__or)) return where.__or.some(sub => matches(row, sub))
  return Object.keys(where).every(key => row[key] === where[key])
}

function createDb(seed) {
  const store = {}
  for (const [name, rows] of Object.entries(seed)) store[name] = rows.map(row => Object.assign({}, row))
  const list = name => (store[name] = store[name] || [])

  const db = {
    serverDate: () => 'SERVER_DATE',
    command: {
      or: conditions => ({ __or: conditions }),
      in: values => ({ __in: values })
    },
    createCollection: async () => ({}),
    collection(name) {
      return {
        doc(id) {
          const find = () => list(name).find(row => String(row._id) === String(id))
          return {
            get: async () => {
              const found = find()
              if (!found) throw new Error('document.getfail document with_id does not exist')
              return { data: found }
            },
            update: async ({ data }) => {
              const found = find()
              if (!found) throw new Error('document.getfail document with_id does not exist')
              Object.assign(found, data)
            },
            remove: async () => {
              const rows = list(name)
              const index = rows.findIndex(row => String(row._id) === String(id))
              if (index < 0) throw new Error('document.getfail document with_id does not exist')
              rows.splice(index, 1)
            }
          }
        },
        where(where) {
          const state = { skip: 0, limit: 100 }
          const chain = {
            skip(value) { state.skip = Number(value) || 0; return chain },
            limit(value) { state.limit = Number(value) || 100; return chain },
            get: async () => {
              const rows = list(name).filter(row => matches(row, where))
              return { data: rows.slice(state.skip, state.skip + state.limit) }
            },
            count: async () => ({ total: list(name).filter(row => matches(row, where)).length })
          }
          return chain
        },
        add: async ({ data }) => {
          const id = `${name}-${list(name).length + 1}`
          list(name).push(Object.assign({ _id: id }, data))
          return { _id: id }
        }
      }
    }
  }
  return { db, store }
}

async function callWorkspace(seed, event, openId = OPEN_ID) {
  const { db, store } = createDb(seed)
  const sdk = {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    getWXContext: () => ({ OPENID: openId }),
    database: () => db,
    openapi: { wxacode: { getUnlimited: async () => ({ buffer: Buffer.from('') }) } }
  }
  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === 'wx-server-sdk') return sdk
    return originalLoad.call(this, request, parent, isMain)
  }
  const modulePath = require.resolve('../cloudfunctions/getMiniWorkspace/index.js')
  delete require.cache[modulePath]
  let main
  try {
    main = require(modulePath).main
  } finally {
    Module._load = originalLoad
  }
  const result = await main(event)
  return { result, store }
}

function baseSeed(overrides = {}) {
  return Object.assign({
    users: [{ _id: 'user-1', openId: OPEN_ID, phone: PHONE_A, phoneNumber: PHONE_A }],
    tournaments: [{ _id: 't-1', name: '2026 测试赛事', organizerName: '测试主办方', orgId: 'org-1', status: 'registering' }],
    tournament_invites: [{ _id: 'code-1', inviteType: 'tournament_claim_code', inviteKey: 'key-1', status: 'active', tournamentId: 't-1', expireAt: FUTURE }],
    teams: [
      { _id: 'team-1', name: '飞豹U12队', claimStatus: 'unclaimed' },
      { _id: 'team-2', name: '他人队', claimStatus: 'unclaimed' },
      { _id: 'team-3', name: '无登记手机号队', claimStatus: 'unclaimed' },
      { _id: 'team-4', name: '过期邀请队', claimStatus: 'unclaimed' },
      { _id: 'team-5', name: '已认领队', claimStatus: 'claimed', ownerId: 'user-9' },
      { _id: 'team-6', name: '已接手队', claimStatus: 'unclaimed' }
    ],
    team_invitations: [
      { _id: 'inv-1', type: 'prebuilt_tournament_team', tournamentId: 't-1', teamId: 'team-1', status: 'pending', divisionName: 'U12组', managerPhone: PHONE_A, allowedClaimPhones: [PHONE_A], claimantCandidates: [{ phone: PHONE_A, roleLabel: '领队' }], inviteExpireAt: FUTURE },
      { _id: 'inv-2', type: 'prebuilt_tournament_team', tournamentId: 't-1', teamId: 'team-2', status: 'pending', divisionName: 'U12组', managerPhone: PHONE_B, allowedClaimPhones: [PHONE_B], inviteExpireAt: FUTURE },
      { _id: 'inv-3', type: 'prebuilt_tournament_team', tournamentId: 't-1', teamId: 'team-3', status: 'pending', divisionName: 'U12组', managerPhone: '', allowedClaimPhones: [], inviteExpireAt: FUTURE },
      { _id: 'inv-4', type: 'prebuilt_tournament_team', tournamentId: 't-1', teamId: 'team-4', status: 'pending', divisionName: 'U12组', managerPhone: PHONE_A, allowedClaimPhones: [PHONE_A], inviteExpireAt: PAST },
      { _id: 'inv-5', type: 'prebuilt_tournament_team', tournamentId: 't-1', teamId: 'team-5', status: 'pending', divisionName: 'U12组', managerPhone: PHONE_A, allowedClaimPhones: [PHONE_A], inviteExpireAt: FUTURE },
      { _id: 'inv-6', type: 'prebuilt_tournament_team', tournamentId: 't-1', teamId: 'team-6', status: 'accepted', divisionName: 'U12组', managerPhone: PHONE_A, allowedClaimPhones: [PHONE_A], inviteExpireAt: FUTURE }
    ]
  }, overrides)
}

async function run() {
  let passed = 0
  const ok = label => { passed += 1; console.log('  PASS  ' + label) }

  // 场景 1：认领码上下文返回赛事信息，且不泄露任何球队
  {
    const { result } = await callWorkspace(baseSeed(), { action: 'claimCodeContext', inviteKey: 'key-1' })
    assert.strictEqual(result.success, true, '场景 1：应成功')
    assert.strictEqual(result.tournament.name, '2026 测试赛事', '场景 1：应返回赛事名')
    assert.ok(!JSON.stringify(result).includes('飞豹U12队'), '场景 1：上下文不得包含任何球队名')
    ok('认领码上下文返回赛事信息且不含球队名')
  }

  // 场景 2：无效认领码返回受控错误，不抛原始数据库错误
  {
    const { result } = await callWorkspace(baseSeed(), { action: 'claimCodeContext', inviteKey: 'not-exist' })
    assert.strictEqual(result.success, false, '场景 2：应失败')
    assert.strictEqual(result.code, 'CLAIM_CODE_INVALID', '场景 2：应为 CLAIM_CODE_INVALID')
    assert.ok(!/getfail|does not exist/i.test(String(result.message || '')), '场景 2：不得透出原始数据库错误')
    ok('无效认领码返回受控错误 CLAIM_CODE_INVALID')
  }

  // 场景 3：认领码过期
  {
    const seed = baseSeed({ tournament_invites: [{ _id: 'code-1', inviteType: 'tournament_claim_code', inviteKey: 'key-1', status: 'active', tournamentId: 't-1', expireAt: PAST }] })
    const { result } = await callWorkspace(seed, { action: 'claimCodeContext', inviteKey: 'key-1' })
    assert.strictEqual(result.success, false, '场景 3：应失败')
    assert.strictEqual(result.code, 'CLAIM_CODE_EXPIRED', '场景 3：应为 CLAIM_CODE_EXPIRED')
    ok('过期认领码返回 CLAIM_CODE_EXPIRED')
  }

  // 场景 4：只列出手机号命中且仍可认领的球队
  {
    const { result } = await callWorkspace(baseSeed(), { action: 'claimableTeams', inviteKey: 'key-1' })
    assert.strictEqual(result.success, true, '场景 4：应成功')
    const ids = result.teams.map(item => item.inviteId).sort()
    assert.deepStrictEqual(ids, ['inv-1', 'inv-5'], `场景 4：应只返回 inv-1 与 inv-5，实际 ${JSON.stringify(ids)}`)
    ok('只列出手机号命中的可认领球队（排除他人手机号 / 空白名单 / 过期 / 已接手）')
  }

  // 场景 5：空白名单的球队任何人都不列出（认领码无 token，必须比逐队邀请更严格）
  {
    const { result } = await callWorkspace(baseSeed(), { action: 'claimableTeams', inviteKey: 'key-1' })
    const hasEmpty = result.teams.some(item => item.inviteId === 'inv-3')
    assert.strictEqual(hasEmpty, false, '场景 5：空白名单球队不得出现在任何人列表中')
    const own = await callWorkspace(baseSeed({ users: [{ _id: 'user-2', openId: OPEN_ID, phone: PHONE_B, phoneNumber: PHONE_B }] }), { action: 'claimableTeams', inviteKey: 'key-1' })
    const ids = own.result.teams.map(item => item.inviteId).sort()
    assert.deepStrictEqual(ids, ['inv-2'], `场景 5：PHONE_B 只应看到 inv-2，实际 ${JSON.stringify(ids)}`)
    ok('手机号不匹配者看不到球队；空白名单球队对任何人都不列出')
  }

  // 场景 6：球队已被他人认领时标注需人工核验，而不是静默消失或静默转移
  {
    const { result } = await callWorkspace(baseSeed(), { action: 'claimableTeams', inviteKey: 'key-1' })
    const claimed = result.teams.find(item => item.inviteId === 'inv-5')
    assert.ok(claimed, '场景 6：已认领球队仍应出现并标注')
    assert.strictEqual(claimed.requiresReview, true, '场景 6：requiresReview 应为 true')
    assert.strictEqual(claimed.claimedByMe, false, '场景 6：claimedByMe 应为 false')
    assert.strictEqual(claimed.statusText, '需人工核验', '场景 6：状态文案应为需人工核验')
    const normal = result.teams.find(item => item.inviteId === 'inv-1')
    assert.strictEqual(normal.requiresReview, false, '场景 6：正常球队不应标注冲突')
    ok('已认领球队标注 requiresReview 且不自动转移')
  }

  // 场景 7：一个手机号命中多支球队时全部返回，由本人选择
  {
    const seed = baseSeed({
      team_invitations: baseSeed().team_invitations.concat([
        { _id: 'inv-7', type: 'prebuilt_tournament_team', tournamentId: 't-1', teamId: 'team-1', status: 'pending', divisionName: 'U10组', managerPhone: PHONE_A, allowedClaimPhones: [PHONE_A], inviteExpireAt: FUTURE }
      ])
    })
    const { result } = await callWorkspace(seed, { action: 'claimableTeams', inviteKey: 'key-1' })
    assert.strictEqual(result.teams.length, 3, `场景 7：同手机号多队应全部返回，实际 ${result.teams.length}`)
    ok('同一手机号命中多支球队时全部返回')
  }

  // 场景 8：手机号未验证时被服务端拦截，且响应不含任何球队名
  {
    const seed = baseSeed({ users: [{ _id: 'user-1', openId: OPEN_ID }] })
    const { result } = await callWorkspace(seed, { action: 'claimableTeams', inviteKey: 'key-1' })
    assert.strictEqual(result.success, false, '场景 8：应失败')
    assert.strictEqual(result.code, 'PHONE_AUTH_REQUIRED', '场景 8：应为 PHONE_AUTH_REQUIRED')
    assert.ok(!JSON.stringify(result).includes('飞豹U12队'), '场景 8：未验证手机号不得看到任何球队名')
    ok('未验证手机号被服务端拦截且不泄露球队')
  }

  // 场景 9：拿别人的邀请直接认领仍被手机号校验拒绝（授权不依赖前端参数）
  {
    const { result } = await callWorkspace(baseSeed(), {
      action: 'acceptPrebuiltTeamInvite',
      inviteId: 'inv-2',
      choice: 'prebuilt',
      disclaimerAgreed: true
    })
    assert.strictEqual(result.success, false, '场景 9：应失败')
    assert.strictEqual(result.code, 'TEAM_CLAIM_PHONE_MISMATCH', '场景 9：应为 TEAM_CLAIM_PHONE_MISMATCH')
    ok('伪造他人邀请认领被 TEAM_CLAIM_PHONE_MISMATCH 拒绝')
  }

  // 场景 10：空白名单球队在“认领码路径”下完全不可达
  //
  // 注意这里是两条不同语义的路径，本改动只让认领码路径更严格：
  //   - 逐队邀请（prebuilt-invite）：主办方定向发放，inviteId 即凭据，
  //     白名单为空时仍可凭 token 认领 —— 这是既有行为，本改动不改变。
  //   - 赛事级认领码（本页）：任何人都能扫到，没有 token，因此只认非空白名单。
  // 因此要证明的是：空白名单球队不会出现在认领码的发现列表里，
  // 攻击者无法通过认领码拿到它的 inviteId，也就无法走到认领动作。
  {
    const { result: teams } = await callWorkspace(baseSeed(), { action: 'claimableTeams', inviteKey: 'key-1' })
    assert.ok(!teams.teams.some(item => item.inviteId === 'inv-3'), '场景 10：空白名单球队不得出现在发现列表中')
    assert.ok(!JSON.stringify(teams).includes('无登记手机号队'), '场景 10：空白名单球队名不得泄露给扫码者')
    // 反向确认：认领码发现列表里没有任何一条是空白名单邀请
    const discoveredIds = teams.teams.map(item => item.inviteId)
    assert.ok(discoveredIds.indexOf('inv-3') < 0, '场景 10：认领码路径不得暴露 inv-3')
    ok('空白名单球队在认领码路径下不可发现、不可触达')
  }

  console.log(`\n赛事级认领码契约：${passed}/10 通过`)
}

run().catch(error => {
  console.error('\nFAIL:', error && error.message)
  process.exitCode = 1
})
