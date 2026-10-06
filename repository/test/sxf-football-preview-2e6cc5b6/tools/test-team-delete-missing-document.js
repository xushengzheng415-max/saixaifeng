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

  // 场景 E：批量添加资料创建的预建球队必须可以删除（现场球队编号形如 T-181424，即 T- + 参赛关系 _id 后 6 位）
  // 现场现象：点击「删除队伍」永久失败，红色提示「该报名关系缺少球队标识，无法安全清理」。
  // 数据结构严格复刻真实生产者 web-admin-vue/.../TournamentTeams.vue -> submitBulkTeams() 的
  // addRecord('tournament_teams', {...})：只有参赛关系、没有长期 teams 资料，因此整条记录
  // 既没有 teamId 字段也没有 orgId 字段（对照 openCreateTeamDialog：先建 teams 再带 teamId 建关系，旧链路可删）。
  {
    const bulkRelation = {
      _id: 'reg-181424',
      tournamentId: 't-1',
      divisionId: 'd-1',
      divisionName: 'U8组',
      teamName: '郑州绿城U8',
      joinSource: 'organizer',
      source: 'organizer',
      sourceType: '主办方录入',
      contactName: '',
      contactPhone: '',
      logoUrl: '',
      prebuiltTeamProfile: { name: '郑州绿城U8' },
      isTemporary: true,
      claimStatus: 'pending_claim',
      status: 'invited',
      riskStatus: '',
      manualReviewRequired: false,
      createTime: 'CLIENT_DATE',
      updateTime: 'CLIENT_DATE'
    }
    assert.ok(!('teamId' in bulkRelation), '场景 E：真实批量创建记录不含 teamId 字段')
    assert.ok(!('orgId' in bulkRelation), '场景 E：真实批量创建记录不含 orgId 字段')
    const seed = {
      ...baseSeed,
      tournaments: [
        { _id: 't-1', orgId: 'org-1', name: '测试赛事' },
        { _id: 't-2', orgId: 'org-1', name: '另一赛事' }
      ],
      tournament_teams: [
        bulkRelation,
        // 反误删哨兵：同赛事另一支同属“无 teamId”的预建球队，必须保留
        { _id: 'reg-181425', tournamentId: 't-1', divisionId: 'd-1', teamName: '洛阳龙门U8', isTemporary: true, status: 'invited', claimStatus: 'pending_claim' },
        // 反误删哨兵：其他赛事的预建球队，必须保留
        { _id: 'reg-900001', tournamentId: 't-2', divisionId: 'd-2', teamName: '开封未来U8', isTemporary: true, status: 'invited', claimStatus: 'pending_claim' },
        // 反误删哨兵：带 teamId 的正常关系及其长期资料，必须保留
        { _id: 'reg-900002', tournamentId: 't-2', divisionId: 'd-2', teamId: 'team-9', teamName: '新乡雄鹰U8', status: 'approved', claimStatus: 'unclaimed' }
      ],
      // 认领链接邀请按参赛关系自身 id（tournamentTeamId）归属，删除时应只清理该关系的邀请
      team_invitations: [
        { _id: 'inv-181424', tournamentTeamId: 'reg-181424', status: 'pending' },
        { _id: 'inv-181425', tournamentTeamId: 'reg-181425', status: 'pending' }
      ],
      teams: [{ _id: 'team-9', orgId: 'org-1', name: '新乡雄鹰U8', playerCount: 0 }],
      // 反误删哨兵：这些记录同样“缺少 teamId”，绝不能被空 teamId 的集合查询带走
      players: [
        { _id: 'p-empty', teamId: '', name: '不得被误删' },
        { _id: 'p-team9', teamId: 'team-9', name: '其他球队球员' }
      ],
      coaches: [{ _id: 'c-empty', teamId: '', name: '不得被误删' }],
      registration_player_drafts: [{ _id: 'draft-empty', teamId: '', name: '不得被误删' }],
      team_memberships: [{ _id: 'mem-empty', teamId: '', status: 'active' }],
      matches: [{ _id: 'm-1', homeTeamId: 'team-9', tournamentId: 't-2' }]
    }
    const { result, removed, store } = await callDeleteTeam(seed, { registrationId: 'reg-181424' })
    assert.strictEqual(result.success, true, `场景 E：预建球队应可删除，实际 ${JSON.stringify(result)}`)
    assertNoRawDatabaseError(result, '场景 E')
    assert.strictEqual(result.data.relationOnly, true, '场景 E：应标记为“只有报名关系”')
    assert.strictEqual(result.data.deletedUsers, 0, '场景 E：不得删除登录账号')
    assert.deepStrictEqual(
      removed.map(item => `${item.collection}/${item.id}`).sort(),
      ['team_invitations/inv-181424', 'tournament_teams/reg-181424'],
      '场景 E：只应删除该报名关系本身及其未完成邀请'
    )
    assert.deepStrictEqual(
      store.tournament_teams.map(row => row._id).sort(),
      ['reg-181425', 'reg-900001', 'reg-900002'],
      '场景 E：不得删除其他参赛关系'
    )
    assert.strictEqual(store.team_invitations.length, 1, '场景 E：不得删除其他关系的邀请')
    assert.strictEqual(store.team_invitations[0]._id, 'inv-181425', '场景 E：其他关系的邀请必须保留')
    assert.strictEqual(store.teams.length, 1, '场景 E：不得删除长期球队资料')
    assert.strictEqual(store.teams[0]._id, 'team-9', '场景 E：其他球队资料必须保留')
    assert.strictEqual(store.players.length, 2, '场景 E：不得用空 teamId 误删球员记录')
    assert.strictEqual(store.coaches.length, 1, '场景 E：不得用空 teamId 误删工作人员记录')
    assert.strictEqual(store.registration_player_drafts.length, 1, '场景 E：不得用空 teamId 误删报名草稿')
    assert.strictEqual(store.team_memberships.length, 1, '场景 E：不得用空 teamId 误删成员关系')
    assert.strictEqual(store.matches.length, 1, '场景 E：不得删除其他球队的比赛')
    assert.ok(store.users.some(user => user._id === 'user-1'), '场景 E：登录账号必须保留')
    // 删除必须留痕：开始/完成两条审计，且审计里明确“只有参赛关系、没有长期球队资料”
    const audits = (store.registration_audit_logs || []).filter(row => row.registrationId === 'reg-181424')
    assert.deepStrictEqual(
      audits.map(row => row.action).sort(),
      ['unclaimed_team_hard_delete_started', 'unclaimed_team_hard_deleted'],
      '场景 E：删除参赛关系必须写入开始与完成审计'
    )
    audits.forEach(row => {
      assert.strictEqual(row.detail.relationOnly, true, `场景 E：审计 ${row.action} 应标记只有参赛关系`)
      assert.strictEqual(row.detail.teamId, '', `场景 E：审计 ${row.action} 不得伪造 teamId`)
      assert.strictEqual(row.actorOrgId, 'org-1', `场景 E：审计 ${row.action} 应记录操作机构`)
    })
    passed++
  }

  // 场景 F：预建球队但已被认领时，仍必须受“只能移出赛事”保护，不得删除
  {
    const seed = {
      ...baseSeed,
      tournament_teams: [{ _id: 'reg-1', tournamentId: 't-1', teamName: '已认领的预建球队', status: 'approved', claimStatus: 'claimed' }]
    }
    const { result, removed } = await callDeleteTeam(seed, { registrationId: 'reg-1' })
    assert.strictEqual(result.success, false, '场景 F：已认领球队不得删除')
    assert.strictEqual(result.code, 'TEAM_ALREADY_CLAIMED', '场景 F：应返回受控的“已认领”提示')
    assert.strictEqual(removed.length, 0, '场景 F：不得删除任何记录')
    passed++
  }

  // 场景 G：其他机构赛事中的预建球队不得被跨机构删除，且不得发生部分清理
  // （机构权限校验仍由赛事归属把关，不因“关系没有 teamId”放宽越权）
  {
    const seed = {
      ...baseSeed,
      tournaments: [
        { _id: 't-1', orgId: 'org-1', name: '本机构赛事' },
        { _id: 't-9', orgId: 'org-9', name: '其他机构赛事' }
      ],
      tournament_teams: [
        { _id: 'reg-181424', tournamentId: 't-9', teamName: '其他机构预建球队', isTemporary: true, status: 'invited', claimStatus: 'pending_claim' },
        { _id: 'reg-181425', tournamentId: 't-1', teamName: '本机构预建球队', isTemporary: true, status: 'invited', claimStatus: 'pending_claim' }
      ],
      team_invitations: [{ _id: 'inv-181424', tournamentTeamId: 'reg-181424', status: 'pending' }]
    }
    const { result, removed, store } = await callDeleteTeam(seed, { registrationId: 'reg-181424' })
    assert.strictEqual(result.success, false, '场景 G：其他机构赛事的球队不得删除')
    assert.strictEqual(result.code, 'REGISTRATION_SCOPE_DENIED', '场景 G：应返回受控的赛事范围提示')
    assertNoRawDatabaseError(result, '场景 G')
    assert.strictEqual(removed.length, 0, '场景 G：不得删除任何记录')
    assert.strictEqual(store.tournament_teams.length, 2, '场景 G：不得删除任何参赛关系')
    assert.strictEqual(store.team_invitations.length, 1, '场景 G：不得删除邀请')
    passed++
  }

  console.log(`报名管理删除队伍缺失文档回归测试通过：${passed}/7`)
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
