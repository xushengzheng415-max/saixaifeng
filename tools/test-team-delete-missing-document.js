// 报名管理“删除队伍”缺失文档回归测试
//
// 复现用户现场报错：报名管理页点击“删除队伍”后，页面出现红色原始数据库错误
//   document.getfail document with_id does not exist
// CloudBase 的 doc().get() 在文档不存在时抛异常，而不是返回空结果；
// tournamentRegistrationFlow 的所有调用点却都按“返回 null”写了 !x 守卫，
// 导致守卫不可达，原始错误穿透到页面。
//
// 运行：node tools/test-team-delete-missing-document.js

const assert = require('assert')
const Module = require('module')

const SDK_NOT_FOUND = 'document.getfail document with_id does not exist'

function createDb(seed) {
  const store = {}
  for (const [name, rows] of Object.entries(seed)) store[name] = rows.map(row => ({ ...row }))
  const list = name => (store[name] = store[name] || [])
  const matches = (row, where) => Object.keys(where || {}).every(key => row[key] === where[key])
  const removed = []

  const db = {
    serverDate: () => 'SERVER_DATE',
    command: { or: conditions => ({ __or: conditions }), in: values => ({ __in: values }) },
    createCollection: async () => ({}),
    collection(name) {
      return {
        doc(id) {
          const find = () => list(name).find(row => row._id === id)
          return {
            // ★ CloudBase SDK 行为：文档不存在时抛异常，而不是返回 { data: null }
            get: async () => {
              const found = find()
              if (!found) throw new Error(SDK_NOT_FOUND)
              return { data: found }
            },
            update: async ({ data }) => {
              const found = find()
              if (!found) throw new Error(SDK_NOT_FOUND)
              Object.assign(found, data)
            },
            remove: async () => {
              const rows = list(name)
              const index = rows.findIndex(row => row._id === id)
              if (index < 0) throw new Error(SDK_NOT_FOUND)
              rows.splice(index, 1)
              removed.push({ collection: name, id })
            }
          }
        },
        where(where) {
          const chain = {
            skip: () => chain,
            limit: () => chain,
            get: async () => ({ data: list(name).filter(row => matches(row, where)) }),
            count: async () => ({ total: list(name).filter(row => matches(row, where)).length })
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
  return { db, store, removed }
}

async function callDeleteTeam(seed, event = {}) {
  const { db, store, removed } = createDb(seed)
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
  let main
  try {
    main = require(modulePath).main
  } finally {
    Module._load = originalLoad
  }
  const result = await main({
    action: 'deleteUnclaimedTournamentTeam',
    confirmText: '删除队伍',
    __actorUserId: 'user-1',
    __actorOrgId: 'org-1',
    ...event
  })
  return { result, store, removed }
}

const baseSeed = {
  users: [{ _id: 'user-1', orgId: 'org-1' }],
  organizations: [{ _id: 'org-1', ownerId: 'user-1' }],
  tournaments: [{ _id: 't-1', orgId: 'org-1', name: '测试赛事' }]
}

function assertNoRawDatabaseError(result, label) {
  const message = String(result.message || '')
  assert.ok(
    !/getfail|does not exist/i.test(message),
    `${label}: 页面不应再收到原始数据库错误，实际收到「${message}」`
  )
}

async function run() {
  let passed = 0

  // 场景 A：重复提交 / 关系已被前一次删除成功删除，第二次点击不能再抛原始错误
  {
    const { result, removed } = await callDeleteTeam({ ...baseSeed, tournament_teams: [] }, { registrationId: 'reg-1' })
    assert.strictEqual(result.success, false, '场景 A：应失败')
    assertNoRawDatabaseError(result, '场景 A')
    assert.strictEqual(result.code, 'REGISTRATION_NOT_FOUND', '场景 A：应返回受控的“球队参赛关系不存在”')
    assert.strictEqual(result.message, '球队参赛关系不存在', '场景 A：应返回中文受控提示')
    assert.strictEqual(removed.length, 0, '场景 A：不得删除任何记录')
    passed++
  }

  // 场景 B：报名关系仍在，但球队长期资料已不存在（孤儿关系）
  // 用户已确认语义：允许清理残留报名关系并报告成功，但不删除任何登录账号。
  {
    const seed = {
      ...baseSeed,
      tournament_teams: [
        { _id: 'reg-1', tournamentId: 't-1', teamId: 'team-gone', orgId: 'org-1', status: 'approved', claimStatus: 'unclaimed' },
        { _id: 'reg-2', tournamentId: 't-2', teamId: 'team-2', orgId: 'org-1', status: 'approved', claimStatus: 'unclaimed' }
      ],
      teams: [],
      team_invitations: [{ _id: 'inv-1', teamId: 'team-gone', status: 'pending' }],
      registration_player_drafts: [{ _id: 'draft-1', teamId: 'team-gone' }],
      team_tasks: [{ _id: 'task-1', teamId: 'team-gone' }],
      matches: [{ _id: 'm-1', homeTeamId: 'team-gone', tournamentId: 't-1' }]
    }
    // 先删掉比赛，避免命中“已有比赛历史只能移出赛事”的产品规则，单独验证孤儿清理链路
    seed.matches = []
    const { result, removed, store } = await callDeleteTeam(seed, { registrationId: 'reg-1' })
    assert.strictEqual(result.success, true, `场景 B：应清理成功，实际 ${JSON.stringify(result)}`)
    assertNoRawDatabaseError(result, '场景 B')
    assert.match(result.message, /球队长期资料已不存在/, '场景 B：应明确告知球队资料已不存在')
    assert.strictEqual(result.data.teamProfileMissing, true, '场景 B：应标记球队资料缺失')
    assert.strictEqual(result.data.deletedUsers, 0, '场景 B：不得删除登录账号')
    assert.deepStrictEqual(
      removed.map(item => `${item.collection}/${item.id}`).sort(),
      ['registration_player_drafts/draft-1', 'team_invitations/inv-1', 'team_tasks/task-1', 'tournament_teams/reg-1'],
      '场景 B：应只清理该球队的残留记录，不触碰其他赛事关系'
    )
    assert.strictEqual(store.tournament_teams.length, 1, '场景 B：不得删除其他赛事的报名关系')
    assert.strictEqual(store.tournament_teams[0]._id, 'reg-2', '场景 B：其他赛事关系应保留')
    passed++
  }

  // 场景 C：正常未认领球队删除主链路必须保持可用
  {
    const seed = {
      ...baseSeed,
      tournament_teams: [{ _id: 'reg-1', tournamentId: 't-1', teamId: 'team-1', orgId: 'org-1', status: 'approved', claimStatus: 'unclaimed' }],
      teams: [{ _id: 'team-1', orgId: 'org-1', name: '金瓶足球队', playerCount: 0 }]
    }
    const { result, removed } = await callDeleteTeam(seed, { registrationId: 'reg-1' })
    assert.strictEqual(result.success, true, `场景 C：应删除成功，实际 ${JSON.stringify(result)}`)
    assert.strictEqual(result.data.deletedUsers, 0, '场景 C：不得删除登录账号')
    assert.deepStrictEqual(
      removed.map(item => `${item.collection}/${item.id}`).sort(),
      ['teams/team-1', 'tournament_teams/reg-1'],
      '场景 C：应删除球队资料与当前赛事关系'
    )
    passed++
  }

  // 场景 D：赛事已不存在（赛事被删除后残留报名关系）
  {
    const seed = {
      ...baseSeed,
      tournaments: [],
      tournament_teams: [{ _id: 'reg-1', tournamentId: 't-1', teamId: 'team-1', orgId: 'org-1', status: 'approved', claimStatus: 'unclaimed' }],
      teams: [{ _id: 'team-1', orgId: 'org-1', name: '金瓶足球队' }]
    }
    const { result, removed } = await callDeleteTeam(seed, { registrationId: 'reg-1' })
    assert.strictEqual(result.success, false, '场景 D：应失败')
    assertNoRawDatabaseError(result, '场景 D')
    assert.strictEqual(result.code, 'REGISTRATION_SCOPE_DENIED', '场景 D：应返回受控的赛事范围提示')
    assert.strictEqual(removed.length, 0, '场景 D：不得删除记录')
    passed++
  }

  console.log(`报名管理删除队伍缺失文档回归测试通过：${passed}/4`)
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
