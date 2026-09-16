// webLoginApi 通用数据层“记录不存在”回归测试
//
// 复现同一类缺陷：CloudBase 的 doc().get() 在文档不存在时抛异常，
// 通用 dbQuery 与球队管理 deleteTeam relay 的预读会把原始错误
//   document.getfail document with_id does not exist
// 直接返回给页面（删除按钮上出现红色原始数据库错误）。
//
// 运行：node tools/test-web-login-dbquery-missing-document.js

const assert = require('assert')
const Module = require('module')
const crypto = require('crypto')

const SDK_NOT_FOUND = 'document.getfail document with_id does not exist'
const TOKEN = 'test-session-token'

function matchField(value, expected) {
  if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
    if ('__in' in expected) return expected.__in.map(item => String(item)).includes(String(value))
    if ('__gt' in expected) return new Date(value).getTime() > new Date(expected.__gt).getTime()
  }
  if (expected instanceof Date) return new Date(value).getTime() === expected.getTime()
  return String(value == null ? '' : value) === String(expected == null ? '' : expected)
}

function matches(row, condition) {
  if (!condition) return true
  if (condition.__or) return condition.__or.some(sub => matches(row, sub))
  return Object.keys(condition).every(key => matchField(row[key], condition[key]))
}

function createDb(seed) {
  const store = {}
  for (const [name, rows] of Object.entries(seed)) store[name] = rows.map(row => ({ ...row }))
  const list = name => (store[name] = store[name] || [])
  const removed = []

  const chain = (name, condition) => {
    const api = {
      skip: () => api,
      limit: () => api,
      orderBy: () => api,
      get: async () => ({ data: list(name).filter(row => matches(row, condition)) }),
      count: async () => ({ total: list(name).filter(row => matches(row, condition)).length })
    }
    return api
  }

  const db = {
    serverDate: () => 'SERVER_DATE',
    command: {
      or: conditions => ({ __or: conditions }),
      in: values => ({ __in: values }),
      gt: value => ({ __gt: value })
    },
    createCollection: async () => ({}),
    collection(name) {
      return {
        doc(id) {
          const find = () => list(name).find(row => row._id === id)
          return {
            get: async () => {
              const found = find()
              if (!found) throw new Error(SDK_NOT_FOUND) // ★ CloudBase SDK 行为
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
        where: condition => chain(name, condition),
        limit: () => chain(name, null),
        get: async () => ({ data: list(name) }),
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

const baseSeed = () => ({
  auth_sessions: [{
    _id: 'session-1',
    tokenHash: crypto.createHash('sha256').update(TOKEN).digest('hex'),
    active: true,
    expiresAt: new Date(Date.now() + 3600 * 1000),
    userId: 'user-1'
  }],
  users: [{ _id: 'user-1', orgId: 'org-1', phone: '13800138000', nickname: '测试主办方' }],
  organizations: [{ _id: 'org-1', ownerId: 'user-1', name: '测试机构' }],
  organization_memberships: [],
  matches: []
})

async function callWebLoginApi(seed, params) {
  const { db, store, removed } = createDb(seed)
  const sdk = {
    SYMBOL_CURRENT_ENV: 'test',
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    getWXContext: () => ({}),
    database: () => db,
    callFunction: async () => ({ result: { success: true } })
  }
  const nodemailer = { createTransport: () => ({ sendMail: async () => ({}) }) }
  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === 'wx-server-sdk') return sdk
    if (request === 'nodemailer') return nodemailer
    return originalLoad.call(this, request, parent, isMain)
  }
  const modulePath = require.resolve('../cloudfunctions/webLoginApi/index.js')
  delete require.cache[modulePath]
  let main
  try {
    main = require(modulePath).main
  } finally {
    Module._load = originalLoad
  }
  const envelope = await main({ ...params, authToken: TOKEN })
  const body = typeof envelope === 'string' ? JSON.parse(envelope) : envelope
  const result = body && body.body && typeof body.body === 'string' ? JSON.parse(body.body) : body
  return { result: result || {}, store, removed }
}

function assertNoRawDatabaseError(result, label) {
  const text = JSON.stringify(result)
  assert.ok(
    !/getfail|does not exist/i.test(text),
    `${label}: 页面不应再收到原始数据库错误，实际收到「${text}」`
  )
}

async function run() {
  let passed = 0

  // 场景 A：dbQuery 删除一个已不存在的记录（重复点击/已被删除）
  {
    const { result, removed } = await callWebLoginApi(baseSeed(), { action: 'dbQuery', collection: 'teams', operation: 'delete', id: 'team-gone' })
    assert.strictEqual(result.success, false, '场景 A：应失败')
    assertNoRawDatabaseError(result, '场景 A')
    assert.strictEqual(result.code, 'RECORD_NOT_FOUND', '场景 A：应返回受控 code')
    assert.strictEqual(result.error, '记录不存在或已被删除', '场景 A：应返回中文受控提示')
    assert.strictEqual(removed.length, 0, '场景 A：不得删除任何记录')
    passed++
  }

  // 场景 B：dbQuery 删除正常记录必须仍然成功
  {
    const seed = { ...baseSeed(), teams: [{ _id: 'team-1', orgId: 'org-1', name: '金瓶足球队' }] }
    const { result, removed } = await callWebLoginApi(seed, { action: 'dbQuery', collection: 'teams', operation: 'delete', id: 'team-1' })
    assert.strictEqual(result.success, true, `场景 B：应删除成功，实际 ${JSON.stringify(result)}`)
    assert.deepStrictEqual(removed.map(item => `${item.collection}/${item.id}`), ['teams/team-1'], '场景 B：应删除目标记录')
    passed++
  }

  // 场景 C：dbQuery 读取一个已不存在的记录
  {
    const { result } = await callWebLoginApi(baseSeed(), { action: 'dbQuery', collection: 'teams', operation: 'get', id: 'team-gone' })
    assert.strictEqual(result.success, false, '场景 C：应失败')
    assertNoRawDatabaseError(result, '场景 C')
    assert.strictEqual(result.code, 'RECORD_NOT_FOUND', '场景 C：应返回受控 code')
    passed++
  }

  // 场景 D：球队管理“删除球队”relay 遇到已不存在的球队
  {
    const { result, removed } = await callWebLoginApi(baseSeed(), { action: 'callFunction', functionName: 'deleteTeam', functionParams: { id: 'team-gone' } })
    assert.strictEqual(result.success, false, '场景 D：应失败')
    assertNoRawDatabaseError(result, '场景 D')
    assert.strictEqual(result.code, 'TEAM_NOT_FOUND', '场景 D：应返回受控 code')
    assert.strictEqual(result.error, '球队不存在或已被删除', '场景 D：应返回中文受控提示')
    assert.strictEqual(removed.length, 0, '场景 D：不得删除任何记录')
    passed++
  }

  // 场景 E：球队管理“删除球队”正常链路必须仍然成功
  {
    const seed = { ...baseSeed(), teams: [{ _id: 'team-1', orgId: 'org-1', name: '金瓶足球队', playerCount: 0 }] }
    const { result, removed } = await callWebLoginApi(seed, { action: 'callFunction', functionName: 'deleteTeam', functionParams: { id: 'team-1' } })
    assert.strictEqual(result.success, true, `场景 E：应删除成功，实际 ${JSON.stringify(result)}`)
    assert.deepStrictEqual(removed.map(item => `${item.collection}/${item.id}`), ['teams/team-1'], '场景 E：应删除球队资料')
    passed++
  }

  console.log(`webLoginApi 记录不存在回归测试通过：${passed}/5`)
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
