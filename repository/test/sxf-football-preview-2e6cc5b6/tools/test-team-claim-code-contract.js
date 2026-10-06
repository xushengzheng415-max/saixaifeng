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
  return Object.keys(where).every(key => {
    const expected = where[key]
    if (expected && Array.isArray(expected.__in)) return expected.__in.map(String).indexOf(String(row[key])) >= 0
    return row[key] === expected
  })
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

  // 场景 11：手机号命中时认领成功，并真正写入球队归属与邀请状态
  // 前十个场景证明「谁不能认领」，这一条证明「能认领的人确实认领成功」，
  // 否则严格的白名单可能在正常路径上把所有人都挡掉。
  {
    const { result, store } = await callWorkspace(baseSeed(), {
      action: 'acceptPrebuiltTeamInvite',
      inviteId: 'inv-1',
      choice: 'prebuilt',
      existingTeamId: '',
      disclaimerAgreed: true
    })
    assert.strictEqual(result.success, true, `场景 11：应认领成功，实际 ${JSON.stringify(result)}`)
    assert.strictEqual(result.teamId, 'team-1', '场景 11：应返回预建球队 ID')
    const team = store.teams.find(row => row._id === 'team-1')
    assert.strictEqual(team.claimStatus, 'claimed', '场景 11：球队应写入已认领')
    assert.strictEqual(String(team.ownerId), 'user-1', '场景 11：球队归属应写入认领人')
    const invite = store.team_invitations.find(row => row._id === 'inv-1')
    assert.strictEqual(invite.status, 'accepted', '场景 11：邀请应流转为 accepted')
    ok('手机号命中时认领成功并写入球队归属')
  }

  // 场景 12：未同意免责声明时不得认领
  {
    const { result, store } = await callWorkspace(baseSeed(), {
      action: 'acceptPrebuiltTeamInvite',
      inviteId: 'inv-1',
      choice: 'prebuilt',
      existingTeamId: ''
    })
    assert.strictEqual(result.success, false, '场景 12：应失败')
    const team = store.teams.find(row => row._id === 'team-1')
    assert.strictEqual(team.claimStatus, 'unclaimed', '场景 12：未确认免责声明不得改动球队归属')
    ok('未同意免责声明时认领被拒且不改动归属')
  }

  // 场景 13：同一自然人属于多个机构时，应返回多个隔离工作空间而不是全局阻断。
  {
    const seed = baseSeed({
      users: [{ _id: 'user-1', openId: OPEN_ID, phone: PHONE_A, phoneNumber: PHONE_A, orgId: 'org-a' }],
      organizations: [{ _id: 'org-a', name: '甲机构' }, { _id: 'org-b', name: '乙机构' }],
      organization_memberships: [
        { _id: 'om-a', userId: 'user-1', orgId: 'org-a', status: 'active', positions: ['球队负责人'], permissions: ['team.view', 'team.manage'] },
        { _id: 'om-b', userId: 'user-1', orgId: 'org-b', status: 'active', positions: ['球队负责人'], permissions: ['team.view', 'team.manage'] }
      ],
      teams: [
        { _id: 'team-a', name: '甲队', orgId: 'org-a', ownerId: 'user-1', claimStatus: 'claimed' },
        { _id: 'team-b', name: '乙队', orgId: 'org-b', ownerId: 'user-1', claimStatus: 'claimed' }
      ]
    })
    const { result } = await callWorkspace(seed, {})
    assert.strictEqual(result.success, true, `场景 13：多机构工作空间应加载成功，实际 ${JSON.stringify(result)}`)
    assert.deepStrictEqual(result.workspaces.map(item => item.id).sort(), ['org:org-a', 'org:org-b'], '场景 13：应返回两个机构工作空间')
    ok('同一账号可加载多个机构工作空间且数据边界独立')
  }

  // 场景 14：跨机构认领只新增球队关系，并返回目标工作空间；不能覆盖账号原机构。
  {
    const seed = baseSeed()
    seed.users = [{ _id: 'user-1', openId: OPEN_ID, phone: PHONE_A, phoneNumber: PHONE_A, orgId: 'org-a' }]
    seed.organizations = [{ _id: 'org-a', name: '原机构' }, { _id: 'org-b', name: '目标机构' }]
    seed.organization_memberships = [
      { _id: 'om-a', userId: 'user-1', orgId: 'org-a', status: 'active', positions: ['机构负责人'], permissions: ['team.view', 'team.manage'] },
      { _id: 'om-b', userId: 'user-1', orgId: 'org-b', status: 'active', positions: ['球队负责人'], permissions: ['team.view', 'team.manage'] }
    ]
    seed.teams = seed.teams.map(item => item._id === 'team-1' ? Object.assign({}, item, { orgId: 'org-b' }) : item)
    seed.team_invitations = seed.team_invitations.map(item => item._id === 'inv-1' ? Object.assign({}, item, { organizerOrgId: 'org-b' }) : item)
    const { result, store } = await callWorkspace(seed, {
      action: 'acceptPrebuiltTeamInvite',
      inviteId: 'inv-1',
      choice: 'prebuilt',
      disclaimerAgreed: true
    })
    assert.strictEqual(result.success, true, `场景 14：跨机构认领应成功，实际 ${JSON.stringify(result)}`)
    assert.strictEqual(result.workspaceId, 'org:org-b', '场景 14：应返回目标机构工作空间')
    assert.strictEqual(store.users[0].orgId, 'org-a', '场景 14：不得覆盖账号原机构兼容字段')
    assert.ok(store.team_memberships.some(item => item.teamId === 'team-1' && item.userId === 'user-1'), '场景 14：应新增目标球队成员关系')
    ok('跨机构认领保留原账号并返回目标球队工作空间')
  }

  // 场景 15：账号已是球队有效成员时，认领不能重复写入成员关系。
  {
    const seed = baseSeed({
      team_memberships: [{ _id: 'tm-existing', teamId: 'team-1', userId: 'user-1', role: 'manager', status: 'active' }]
    })
    const { result, store } = await callWorkspace(seed, {
      action: 'acceptPrebuiltTeamInvite',
      inviteId: 'inv-1',
      choice: 'prebuilt',
      disclaimerAgreed: true
    })
    assert.strictEqual(result.success, true, `场景 15：已有成员认领应成功，实际 ${JSON.stringify(result)}`)
    assert.strictEqual(store.team_memberships.filter(item => item.teamId === 'team-1' && item.userId === 'user-1').length, 1, '场景 15：不得重复创建球队成员关系')
    ok('已有有效球队成员关系时认领保持幂等')
  }

  // 场景 16：只认领外部机构球队、不属于目标机构时，只开放该球队协作空间。
  {
    const seed = baseSeed()
    seed.users = [{ _id: 'user-1', openId: OPEN_ID, phone: PHONE_A, phoneNumber: PHONE_A, orgId: 'org-a' }]
    seed.organizations = [{ _id: 'org-a', name: '原机构' }, { _id: 'org-b', name: '外部机构' }]
    seed.organization_memberships = [
      { _id: 'om-a', userId: 'user-1', orgId: 'org-a', status: 'active', positions: ['机构负责人'], permissions: ['team.view', 'team.manage'] }
    ]
    seed.teams = seed.teams.map(item => item._id === 'team-1' ? Object.assign({}, item, { orgId: 'org-b' }) : item)
    seed.team_invitations = seed.team_invitations.map(item => item._id === 'inv-1' ? Object.assign({}, item, { organizerOrgId: 'org-b' }) : item)
    const { result, store } = await callWorkspace(seed, {
      action: 'acceptPrebuiltTeamInvite',
      inviteId: 'inv-1',
      choice: 'prebuilt',
      disclaimerAgreed: true
    })
    assert.strictEqual(result.success, true, `场景 16：外部球队认领应成功，实际 ${JSON.stringify(result)}`)
    assert.strictEqual(result.workspaceId, 'team:team-1', '场景 16：无目标机构成员关系时应返回单球队协作空间')
    assert.strictEqual(store.users[0].orgId, 'org-a', '场景 16：不得修改账号原机构')
    ok('外部机构球队认领只开放单球队协作空间')
  }

  // 场景 17：本人认领完成后再次扫码，应返回“已由你认领”和可进入的工作空间。
  {
    const seed = baseSeed()
    seed.teams = seed.teams.map(item => item._id === 'team-1' ? Object.assign({}, item, { claimStatus:'claimed', ownerId:'user-1', claimedByUserId:'user-1' }) : item)
    seed.team_invitations = seed.team_invitations.map(item => item._id === 'inv-1' ? Object.assign({}, item, { status:'accepted', acceptedChoice:'prebuilt', acceptedTeamId:'team-1', acceptedUserId:'user-1', acceptedOpenId:OPEN_ID, allowedClaimPhones:[PHONE_B], managerPhone:PHONE_B }) : item)
    seed.team_memberships = [{ _id:'tm-claimed', teamId:'team-1', userId:'user-1', role:'owner', status:'accepted' }]
    const { result } = await callWorkspace(seed, { action:'claimableTeams', inviteKey:'key-1' })
    const row = result.teams.find(item => item.inviteId === 'inv-1')
    assert.ok(row, '场景 17：即使后台后来改了登记手机号，已接受邀请仍应对原 acceptedUserId 可见')
    assert.strictEqual(row.alreadyClaimed, true, '场景 17：应标记 alreadyClaimed')
    assert.strictEqual(row.statusText, '已由你认领', '场景 17：应显示已由你认领')
    assert.strictEqual(row.workspaceId, 'team:team-1', '场景 17：应返回可进入的球队工作空间')
    ok('本人认领后再次扫码可直接进入球队')
  }

  // 场景 18：原参赛关系已审核通过时，认领只补认领字段，不重复创建关系或降级状态。
  {
    const seed = baseSeed({
      tournament_teams: [{ _id:'reg-approved', tournamentId:'t-1', teamId:'team-1', divisionId:'default', status:'approved', claimStatus:'pending_confirmation' }]
    })
    const { result, store } = await callWorkspace(seed, {
      action:'acceptPrebuiltTeamInvite', inviteId:'inv-1', choice:'prebuilt', disclaimerAgreed:true
    })
    assert.strictEqual(result.success, true, `场景 18：已通过关系认领应成功，实际 ${JSON.stringify(result)}`)
    assert.strictEqual(store.tournament_teams.length, 1, '场景 18：不得重复创建参赛关系')
    assert.strictEqual(store.tournament_teams[0].status, 'approved', '场景 18：不得把已通过状态降级为 pending')
    assert.strictEqual(store.tournament_teams[0].claimStatus, 'claimed', '场景 18：应补齐认领状态')
    ok('已通过参赛关系认领保持单条且不降级')
  }

  // 场景 19：新负责人手机号只能看到明确发给自己的主账号转移邀请。
  {
    const seed = baseSeed()
    seed.users = [{ _id:'user-2', openId:OPEN_ID, phone:PHONE_B, phoneNumber:PHONE_B }]
    seed.teams = seed.teams.map(item => item._id === 'team-1' ? Object.assign({}, item, { claimStatus:'claimed', ownerId:'user-1', claimedByUserId:'user-1' }) : item)
    seed.team_invitations = seed.team_invitations.concat([{
      _id:'transfer-1', type:'team_owner_transfer', status:'active', tournamentId:'t-1', teamId:'team-1',
      fromOwnerId:'user-1', targetPhone:PHONE_B, inviteePhone:PHONE_B, inviteeUserId:'user-2', targetName:'新负责人', expiresAt:FUTURE
    }])
    const { result } = await callWorkspace(seed, { action:'claimableTeams', inviteKey:'key-1' })
    const transfer = result.teams.find(item => item.transferId === 'transfer-1')
    assert.ok(transfer, '场景 19：目标手机号应看到主账号转移邀请')
    assert.strictEqual(transfer.ownershipTransfer, true, '场景 19：应标记 ownershipTransfer')
    assert.strictEqual(transfer.statusText, '待接收主账号', '场景 19：应显示待接收主账号')
    ok('新负责人可通过赛事认领码发现待接收主账号邀请')
  }

  // 场景 20：接受主账号转移后，新账号成为 owner，旧账号保留为只读协作成员。
  {
    const seed = baseSeed()
    seed.users = [{ _id:'user-2', openId:OPEN_ID, phone:PHONE_B, phoneNumber:PHONE_B }]
    seed.teams = seed.teams.map(item => item._id === 'team-1' ? Object.assign({}, item, { claimStatus:'claimed', ownerId:'user-1', ownerUserId:'user-1', claimedByUserId:'user-1' }) : item)
    seed.team_memberships = [{ _id:'tm-old-owner', teamId:'team-1', userId:'user-1', role:'owner', roles:['owner'], permissions:['team.view','team.manage'], status:'accepted' }]
    seed.team_invitations = seed.team_invitations.concat([{
      _id:'transfer-1', type:'team_owner_transfer', status:'active', tournamentId:'t-1', teamId:'team-1',
      organizerOrgId:'org-1', fromOwnerId:'user-1', targetPhone:PHONE_B, inviteePhone:PHONE_B,
      inviteeUserId:'user-2', targetName:'新负责人', expiresAt:FUTURE
    }])
    const { result, store } = await callWorkspace(seed, { action:'acceptTeamOwnerTransfer', transferId:'transfer-1' })
    assert.strictEqual(result.success, true, `场景 20：主账号转移应成功，实际 ${JSON.stringify(result)}`)
    const team = store.teams.find(item => item._id === 'team-1')
    assert.strictEqual(team.ownerId, 'user-2', '场景 20：新账号应成为 owner')
    const oldMembership = store.team_memberships.find(item => item.userId === 'user-1')
    assert.strictEqual(oldMembership.role, 'member', '场景 20：旧主账号应降为协作成员')
    assert.deepStrictEqual(oldMembership.permissions, ['team.view'], '场景 20：旧主账号只保留查看权限')
    const newMembership = store.team_memberships.find(item => item.userId === 'user-2')
    assert.strictEqual(newMembership.role, 'owner', '场景 20：新账号成员关系应为 owner')
    assert.deepStrictEqual(newMembership.permissions, ['team.view','team.manage'], '场景 20：新主账号获得管理权限')
    assert.strictEqual(store.team_invitations.find(item => item._id === 'transfer-1').status, 'accepted', '场景 20：转移邀请应完成')
    ok('主账号转移保留旧负责人为只读协作成员')
  }

  // 场景 21：旧体验包对“已由你认领”再次提交时，服务端幂等返回成功而不是报邀请失效。
  {
    const seed = baseSeed()
    seed.teams = seed.teams.map(item => item._id === 'team-1' ? Object.assign({}, item, { claimStatus:'claimed', ownerId:'user-1', claimedByUserId:'user-1' }) : item)
    seed.team_invitations = seed.team_invitations.map(item => item._id === 'inv-1' ? Object.assign({}, item, { status:'accepted', acceptedChoice:'prebuilt', acceptedTeamId:'team-1', acceptedUserId:'user-1', acceptedOpenId:OPEN_ID }) : item)
    seed.team_memberships = [{ _id:'tm-claimed', teamId:'team-1', userId:'user-1', role:'owner', status:'accepted' }]
    const { result } = await callWorkspace(seed, { action:'acceptPrebuiltTeamInvite', inviteId:'inv-1', choice:'prebuilt', disclaimerAgreed:true })
    assert.strictEqual(result.success, true, `场景 21：重复提交应幂等成功，实际 ${JSON.stringify(result)}`)
    assert.strictEqual(result.alreadyClaimed, true, '场景 21：应返回 alreadyClaimed')
    assert.strictEqual(result.idempotent, true, '场景 21：应标记 idempotent')
    assert.strictEqual(result.teamId, 'team-1', '场景 21：应返回已认领球队')
    ok('旧体验包重复提交已认领邀请时服务端幂等恢复')
  }

  // 场景 22：进入单球队空间时，不得显示同账号其他球队的报名草稿待办。
  {
    const seed = baseSeed()
    seed.teams = [
      { _id:'team-1', name:'当前球队', ownerId:'user-1', claimStatus:'claimed' },
      { _id:'team-2', name:'其他球队', ownerId:'user-1', claimStatus:'claimed' }
    ]
    seed.team_memberships = [
      { _id:'tm-1', teamId:'team-1', userId:'user-1', role:'owner', status:'accepted' },
      { _id:'tm-2', teamId:'team-2', userId:'user-1', role:'owner', status:'accepted' }
    ]
    seed.tournament_tasks = [{
      _id:'draft-other-team', recipientUserId:'user-1', tournamentId:'t-other', divisionId:'default',
      teamId:'team-2', type:'registration_draft', status:'pending', title:'继续完成赛事报名'
    }]
    const { result } = await callWorkspace(seed, { workspaceId:'team:team-1' })
    assert.strictEqual(result.success, true, `场景 22：当前球队空间应加载成功，实际 ${JSON.stringify(result)}`)
    assert.ok(!result.eventTasks.some(item => item.teamId === 'team-2'), '场景 22：不得显示其他球队的报名草稿')
    ok('单球队空间隔离其他球队报名草稿待办')
  }

  // 场景 23：可删除待办只写当前用户隐藏记录，不删除原业务任务。
  {
    const seed = baseSeed()
    seed.teams = [{ _id:'team-1', name:'当前球队', ownerId:'user-1', claimStatus:'claimed' }]
    seed.team_memberships = [{ _id:'tm-1', teamId:'team-1', userId:'user-1', role:'owner', status:'accepted' }]
    seed.tournament_tasks = [{ _id:'draft-1', recipientUserId:'user-1', tournamentId:'t-1', divisionId:'default', teamId:'team-1', type:'registration_draft', status:'pending', title:'继续完成赛事报名' }]
    const dismissed = await callWorkspace(seed, { action:'dismissWorkspaceTask', workspaceId:'team:team-1', taskId:'registration-draft:draft-1' })
    assert.strictEqual(dismissed.result.success, true, `场景 23：删除提醒应成功，实际 ${JSON.stringify(dismissed.result)}`)
    assert.strictEqual(dismissed.store.tournament_tasks.length, 1, '场景 23：不得删除原业务任务')
    assert.strictEqual(dismissed.store.task_dismissals.length, 1, '场景 23：应写入个人隐藏记录')
    const refreshed = await callWorkspace(dismissed.store, { workspaceId:'team:team-1' })
    assert.ok(!refreshed.result.eventTasks.some(item => item.id === 'registration-draft:draft-1'), '场景 23：刷新后该用户不再看到已隐藏提醒')
    ok('右滑删除仅隐藏个人提醒并保留业务任务')
  }

  // 场景 24：强制业务待办没有 dismissible 标记，服务端必须拒绝删除。
  {
    const { result } = await callWorkspace(baseSeed(), { action:'dismissWorkspaceTask', workspaceId:'team:team-1', taskId:'registration:required-1' })
    assert.strictEqual(result.success, false, '场景 24：强制待办删除应失败')
    assert.strictEqual(result.code, 'TASK_NOT_DISMISSIBLE', '场景 24：应返回 TASK_NOT_DISMISSIBLE')
    ok('强制业务待办不可删除')
  }

  // 场景 25：PC 历史入口只写 teamCode 的抽签后补录球员，小程序球队库仍必须可见。
  {
    const seed = baseSeed()
    seed.teams = [{ _id:'team-1', name:'当前球队', ownerId:'user-1', claimStatus:'claimed' }]
    seed.team_memberships = [{ _id:'tm-1', teamId:'team-1', userId:'user-1', role:'owner', status:'accepted' }]
    seed.players = [{ _id:'player-team-code', teamCode:'team-1', name:'抽签后补录球员', jerseyNumber:'72' }]
    const { result } = await callWorkspace(seed, { action:'teamPlayers', workspaceId:'team:team-1', teamId:'team-1' })
    assert.strictEqual(result.success, true, `场景 25：球队球员读取应成功，实际 ${JSON.stringify(result)}`)
    assert.ok(result.players.some(item => item.id === 'player-team-code'), '场景 25：只含 teamCode 的补录球员必须可见')
    ok('球队球员库兼容 teamCode 历史归属字段')
  }

  console.log(`\n赛事级认领码契约：${passed}/25 通过`)
}

run().catch(error => {
  console.error('\nFAIL:', error && error.message)
  process.exitCode = 1
})
