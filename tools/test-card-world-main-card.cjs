'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const root = path.resolve(__dirname, '..', 'cloudfunctions', 'webLoginApi')

/* ---------------- 轻量 CloudBase Mock ---------------- */

function match(row, condition) {
  if (condition == null) return true
  if (Array.isArray(condition)) return condition.some(item => match(row, item))
  if (condition.__or) return condition.__or.some(item => match(row, item))
  if (condition.__and) return condition.__and.every(item => match(row, item))
  return Object.keys(condition).every(key => {
    const expected = condition[key]
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if (expected.__gt !== undefined) {
        const left = row[key], right = expected.__gt
        if (left instanceof Date || right instanceof Date) return new Date(left || 0).getTime() > new Date(right).getTime()
        return left > right
      }
      if (expected.__in) return expected.__in.includes(row[key])
    }
    return row[key] === expected
  })
}

function createDb(seed, options = {}) {
  const data = {}
  const counters = {}
  for (const name of Object.keys(seed)) {
    counters[name] = 0
    data[name] = seed[name].map(row => {
      counters[name] += 1
      return Object.assign({ _id: name.slice(0, 1) + '-' + String(counters[name]).padStart(3, '0') }, row)
    })
  }
  const existing = new Set(options.existing || Object.keys(data))
  const created = []

  function missing(name) {
    if (existing.has(name)) return null
    const error = new Error('Db or Table not exist: ' + name)
    error.errCode = -502005
    return error
  }

  function query(name, condition) {
    let limitCount = Infinity, skipCount = 0, order = null
    const chain = {
      limit(value) { limitCount = Number(value) || Infinity; return chain },
      skip(value) { skipCount = Number(value) || 0; return chain },
      orderBy(field, direction) { order = [field, direction || 'asc']; return chain },
      field() { return chain },
      async get() {
        const error = missing(name)
        if (error) throw error
        let rows = (data[name] || []).filter(row => match(row, condition))
        if (order) {
          const [field, direction] = order
          rows = rows.slice().sort((left, right) => {
            const a = left[field], b = right[field]
            return (a < b ? -1 : a > b ? 1 : 0) * (direction === 'desc' ? -1 : 1)
          })
        }
        return { data: rows.slice(skipCount, skipCount + limitCount) }
      },
      async count() {
        const error = missing(name)
        if (error) throw error
        return { total: (data[name] || []).filter(row => match(row, condition)).length }
      },
      async update(payload) {
        const error = missing(name)
        if (error) throw error
        let updated = 0
        for (const row of data[name] || []) {
          if (match(row, condition)) { Object.assign(row, payload.data || {}); updated += 1 }
        }
        return { stats: { updated } }
      }
    }
    return chain
  }

  const db = {
    serverDate: () => new Date(),
    command: {
      or: list => ({ __or: list }),
      and: list => ({ __and: list }),
      gt: value => ({ __gt: value }),
      in: list => ({ __in: list })
    },
    async createCollection(name) {
      if (existing.has(name)) {
        const error = new Error('collection already exists')
        error.errCode = -501001
        throw error
      }
      existing.add(name); created.push(name)
      if (!data[name]) data[name] = []
    },
    collection(name) {
      return {
        where: condition => query(name, condition),
        doc(id) {
          return {
            async get() {
              const error = missing(name)
              if (error) throw error
              return { data: (data[name] || []).find(row => row._id === id) || null }
            },
            async update(payload) {
              const error = missing(name)
              if (error) throw error
              const row = (data[name] || []).find(item => item._id === id)
              if (row) Object.assign(row, payload.data || {})
              return { stats: { updated: row ? 1 : 0 } }
            }
          }
        },
        async add(payload) {
          const error = missing(name)
          if (error) throw error
          if (payload.data && payload.data._openid) throw new Error('_openid is reserved')
          counters[name] = (counters[name] || 0) + 1
          const row = Object.assign({ _id: name.slice(0, 1) + '-' + String(counters[name]).padStart(3, '0') }, payload.data || {})
          ;(data[name] = data[name] || []).push(row)
          return { _id: row._id }
        }
      }
    }
  }
  return { db, data, existing, created }
}

/* ---------------- 模块桩：成卡读取与数据中心 ---------------- */

const readerPath = require.resolve(path.join(root, 'playerCardReader.cjs'))
require(readerPath)
const readerState = { cards: [], fail: false, lastCount: 0 }
require.cache[readerPath].exports.readCards = async (cloud, db, players) => {
  readerState.lastCount = (players || []).length
  if (readerState.fail) throw new Error('player card read failed')
  return readerState.cards.filter(card => (players || []).some(player => String(player._id) === String(card.playerId)))
}

const dcPath = path.join(root, 'data-center', 'service.cjs')
const dcState = {}
require.cache[dcPath] = {
  id: dcPath,
  filename: dcPath,
  loaded: true,
  exports: {
    createDataService: () => ({
      playerCardForAuthorizedPlayer: async playerId => dcState[playerId] || { status: 'unverified' }
    })
  }
}

const createCardWorld = require(path.join(root, 'cardWorld.cjs'))
const createServicePrivateAuth = require(path.join(root, 'servicePrivateAuth.cjs'))

/* ---------------- 测试数据 ---------------- */

const TOKEN = 'a'.repeat(64)
const EXPIRED_TOKEN = 'b'.repeat(64)
const USERS = [
  { _id: 'u-001', phone: '13800000001', phoneVerified: true, status: 'active' },
  { _id: 'u-002', phone: '13800000002', phoneVerified: true, status: 'active' },
  { _id: 'u-003', phone: '13800000003', phoneVerified: true, status: 'active' }
]
const SESSIONS = [
  { tokenHash: TOKEN, serviceAccountOpenId: 'openid-1', active: true, expiresAt: new Date(Date.now() + 3600e3) },
  { tokenHash: EXPIRED_TOKEN, serviceAccountOpenId: 'openid-1', active: true, expiresAt: new Date(Date.now() - 3600e3) }
]
const BINDINGS = [
  { sport: 'football', officialOpenId: 'openid-1', userId: 'u-001', active: true, status: 'active' },
  { sport: 'football', officialOpenId: 'openid-2', userId: 'u-002', active: true, status: 'active' },
  { sport: 'football', officialOpenId: 'openid-3', userId: 'u-003', active: true, status: 'active' }
]
const PLAYERS = [
  { _id: 'p-001', linkedUserId: 'u-001', name: '铁栋泽', number: 10, position: 'FW', positionLabel: '前锋', portraitAuthorized: true },
  { _id: 'p-002', playerUserId: 'u-001', name: '李昊', number: 8, position: 'MF', positionLabel: '中场', portraitAuthorized: true },
  { _id: 'p-003', guardianUserId: 'u-001', name: '王越', number: 1, position: 'GK', positionLabel: '门将', portraitAuthorized: true },
  { _id: 'p-004', guardianUserId: 'u-002', name: '周洋', number: 7, position: 'FW', positionLabel: '前锋', portraitAuthorized: true },
  { _id: 'p-005', linkedUserId: 'u-009', name: '外部球员', number: 9 }
]
let CARDS = [
  { playerId: 'p-001', status: 'ready', cardUrl: 'https://cdn/p1-v2.png', cardId: 'c-1', templateId: 't-1', publishedVersion: 2, cardDataVersion: 1, cardTypeId: 'gold' },
  { playerId: 'p-002', status: 'ready', cardUrl: 'https://cdn/p2-v3.png', cardId: 'c-2', templateId: 't-2', publishedVersion: 3, cardDataVersion: 2, cardTypeId: 'silver' },
  { playerId: 'p-003', status: 'ready', cardUrl: 'https://cdn/p3-v1.png', cardId: 'c-3', templateId: 't-3', publishedVersion: 1, cardDataVersion: 1, cardTypeId: 'bronze' },
  { playerId: 'p-004', status: 'ready', cardUrl: 'https://cdn/p4-v4.png', cardId: 'c-4', templateId: 't-4', publishedVersion: 4, cardDataVersion: 3, cardTypeId: 'gold' },
  { playerId: 'p-002', status: 'pending', cardId: 'c-2b', templateId: 't-9', publishedVersion: 9, cardDataVersion: 9 }
]

function seed(extraPlayers = []) {
  return {
    users: USERS.slice(),
    referee_h5_sessions: SESSIONS.slice(),
    service_account_bindings: BINDINGS.slice(),
    service_identities: [],
    players: PLAYERS.concat(extraPlayers).slice(),
    card_world_profiles: [],
    card_world_players: [],
    card_world_cards: [],
    teams: []
  }
}

function makeWorld(options = {}) {
  readerState.cards = options.cards || CARDS.slice()
  readerState.fail = !!options.failRead
  readerState.lastCount = 0
  const seeded = seed(options.extraPlayers || [])
  const env = createDb(seeded, { existing: options.existing })
  const auth = createServicePrivateAuth({ cloud: { database: () => env.db }, hashSessionToken: value => value })
  const service = createCardWorld({
    cloud: { database: () => env.db },
    authenticateServicePrivate: auth,
    authenticateWebSession: async () => ({ success: false }),
    httpsGet: async () => { throw new Error('not used') },
    httpsPost: async () => { throw new Error('not used') }
  })
  return { service, env, auth }
}

function call(service, action, params) {
  return service.handle(action, Object.assign({ serviceSessionToken: TOKEN, cityCode: '410100', cityName: '郑州市' }, params), {})
}

async function main() {
  /* 1. 入口确实注入服务号鉴权，而不是只留空参数。 */
  const indexSource = fs.readFileSync(path.join(root, 'index.js'), 'utf8')
  assert.ok(indexSource.includes("require('./servicePrivateAuth.cjs')"), 'index.js 未接入服务号鉴权模块')
  assert.ok(indexSource.includes('authenticateServicePrivate'), 'cardWorld 未注入 authenticateServicePrivate')

  /* 2. H5 会话鉴权：有效 / 过期 / 绑定冲突 / 未绑定。 */
  const authEnv = createDb({ users: USERS.slice(), referee_h5_sessions: SESSIONS.slice(), service_account_bindings: BINDINGS.slice(), service_identities: [] })
  const auth = createServicePrivateAuth({ cloud: { database: () => authEnv.db }, hashSessionToken: value => value })
  const valid = await auth({ serviceSessionToken: TOKEN })
  assert.strictEqual(valid.success, true)
  assert.strictEqual(valid.user._id, 'u-001')
  const expired = await auth({ serviceSessionToken: EXPIRED_TOKEN })
  assert.strictEqual(expired.code, 'SERVICE_PRIVATE_AUTH_REQUIRED')

  const conflictEnv = createDb({
    users: USERS.slice(), referee_h5_sessions: SESSIONS.slice(), service_identities: [],
    service_account_bindings: [
      { sport: 'football', officialOpenId: 'openid-1', userId: 'u-001', active: true, status: 'active' },
      { sport: 'football', officialOpenId: 'openid-1', userId: 'u-002', active: true, status: 'active' }
    ]
  })
  const conflict = await createServicePrivateAuth({ cloud: { database: () => conflictEnv.db }, hashSessionToken: value => value })({ serviceSessionToken: TOKEN })
  assert.strictEqual(conflict.code, 'SERVICE_PRIVATE_ACCOUNT_CONFLICT')

  const unboundEnv = createDb({ users: [], referee_h5_sessions: SESSIONS.slice(), service_account_bindings: [], service_identities: [] })
  const unbound = await createServicePrivateAuth({ cloud: { database: () => unboundEnv.db }, hashSessionToken: value => value })({ serviceSessionToken: TOKEN })
  assert.strictEqual(unbound.needsBinding, true)

  /* 3. 档案集合缺失 -> 自动建集合并建档；auto 选中 publishedVersion 最高的 p-002。 */
  const first = makeWorld({ existing: ['users', 'referee_h5_sessions', 'service_account_bindings', 'service_identities', 'players', 'card_world_players', 'card_world_cards', 'teams'] })
  const login = await call(first.service, 'cardWorldLogin')
  assert.strictEqual(login.success, true)
  assert.strictEqual(login.mainCardReady, true)
  assert.strictEqual(login.mainPlayerId, 'p-002')
  assert.ok(first.env.existing.has('card_world_profiles'), '档案集合未自动创建')
  const profile = first.env.data.card_world_profiles[0]
  assert.strictEqual(profile.mainCard.playerId, 'p-002')
  assert.strictEqual(profile.mainCard.publishedVersion, 3)
  assert.ok(!('name' in profile.mainCard), '档案不得复制球员主数据')

  /* 4. 手动选卡保持，不被自动逻辑改回。 */
  const switched = await call(first.service, 'cardWorldSetMainCard', { playerId: 'p-001' })
  assert.strictEqual(switched.success, true)
  assert.strictEqual(switched.playerId, 'p-001')
  assert.ok(switched.stats.find(item => item.label === '积分'), '主卡缺统计')
  const kept = await call(first.service, 'cardWorldMainCard')
  assert.strictEqual(kept.playerId, 'p-001')
  const relogin = await call(first.service, 'cardWorldLogin')
  assert.strictEqual(relogin.mainPlayerId, 'p-001', '人工选卡未保持')

  /* 5. 卡面版本更新：auto 选择应随更高 publishedVersion 切换。 */
  const versioned = makeWorld()
  await call(versioned.service, 'cardWorldLogin')
  assert.strictEqual(versioned.env.data.card_world_profiles[0].mainCard.playerId, 'p-002')
  readerState.cards = CARDS.map(card => card.playerId === 'p-001' && card.status === 'ready'
    ? Object.assign({}, card, { publishedVersion: 6, cardUrl: 'https://cdn/p1-v6.png' })
    : card)
  const upgraded = await call(versioned.service, 'cardWorldMainCard')
  assert.strictEqual(upgraded.playerId, 'p-001', '版本更新后未切换到最新已发布卡')

  /* 6. 无卡账号：登录成功、主卡空态、档案不写 mainCard。 */
  const empty = makeWorld()
  // u-001 有卡；换成 u-003 会话验证无卡账号
  empty.env.data.referee_h5_sessions.push({ _id: 's-900', tokenHash: 'c'.repeat(64), serviceAccountOpenId: 'openid-3', active: true, expiresAt: new Date(Date.now() + 3600e3) })
  const noCardService = createCardWorld({
    cloud: { database: () => empty.env.db },
    authenticateServicePrivate: createServicePrivateAuth({ cloud: { database: () => empty.env.db }, hashSessionToken: value => value }),
    authenticateWebSession: async () => ({ success: false }),
    httpsGet: async () => { throw new Error('not used') },
    httpsPost: async () => { throw new Error('not used') }
  })
  const noCardToken = 'c'.repeat(64)
  const noCardLogin = await noCardService.handle('cardWorldLogin', { serviceSessionToken: noCardToken, cityCode: '410100', cityName: '郑州市' }, {})
  assert.strictEqual(noCardLogin.success, true)
  assert.strictEqual(noCardLogin.mainCardReady, false)
  const noCardMain = await noCardService.handle('cardWorldMainCard', { serviceSessionToken: noCardToken, cityCode: '410100' }, {})
  assert.strictEqual(noCardMain.empty, true)

  /* 7. 成卡读取失败：不阻断登录，主卡回到空态而不是报档案失败。 */
  const broken = makeWorld({ failRead: true })
  const brokenLogin = await call(broken.service, 'cardWorldLogin')
  assert.strictEqual(brokenLogin.success, true)
  assert.strictEqual(brokenLogin.mainCardReady, false)
  const brokenMain = await call(broken.service, 'cardWorldMainCard')
  assert.strictEqual(brokenMain.empty, true)

  /* 8. 本人/监护权限边界：只读自己关联的球员，不能切到别人的卡。 */
  const guardian = makeWorld()
  guardian.env.data.referee_h5_sessions.push({ _id: 's-901', tokenHash: 'd'.repeat(64), serviceAccountOpenId: 'openid-2', active: true, expiresAt: new Date(Date.now() + 3600e3) })
  const guardianService = createCardWorld({
    cloud: { database: () => guardian.env.db },
    authenticateServicePrivate: createServicePrivateAuth({ cloud: { database: () => guardian.env.db }, hashSessionToken: value => value }),
    authenticateWebSession: async () => ({ success: false }),
    httpsGet: async () => { throw new Error('not used') },
    httpsPost: async () => { throw new Error('not used') }
  })
  const guardianToken = 'd'.repeat(64)
  const guardianLogin = await guardianService.handle('cardWorldLogin', { serviceSessionToken: guardianToken, cityCode: '410100', cityName: '郑州市' }, {})
  assert.strictEqual(guardianLogin.mainPlayerId, 'p-004', '监护人未读到被监护球员')
  const cross = await guardianService.handle('cardWorldSetMainCard', { serviceSessionToken: guardianToken, cityCode: '410100', playerId: 'p-001' }, {})
  assert.strictEqual(cross.code, 'WORLD_MAIN_CARD_NOT_FOUND', '监护人越权切到了他人球员卡')
  const selfCross = await call(first.service, 'cardWorldSetMainCard', { playerId: 'p-004' })
  assert.strictEqual(selfCross.code, 'WORLD_MAIN_CARD_NOT_FOUND', '本人账号越权切到了他人球员卡')

  /* 9. 统计来自数据中心；未核验值展示「—」，不补零。 */
  dcState['p-001'] = { status: 'ready', points: 120, metrics: { appearances: 8, goals: 3 } }
  dcState['p-002'] = { status: 'unverified' }
  const statsService = makeWorld()
  const autoLogin = await call(statsService.service, 'cardWorldLogin')
  const autoMain = await call(statsService.service, 'cardWorldMainCard')
  assert.deepStrictEqual(autoMain.stats.map(item => item.num), ['—', '—', '—', '—'], '未核验统计被补零')
  const toP1 = await call(statsService.service, 'cardWorldSetMainCard', { playerId: 'p-001' })
  assert.deepStrictEqual(toP1.stats.map(item => item.num), ['120', '8', '3', '—'], '数据中心统计映射错误')

  /* 10. 超过 100 条的本人球员读取必须完整分页，不再截断 20 条。 */
  const many = []
  for (let index = 0; index < 120; index += 1) many.push({ _id: 'q-' + String(index).padStart(3, '0'), linkedUserId: 'u-001', name: '批量球员' + index })
  const paged = makeWorld({ cards: [], extraPlayers: many })
  const pagedLogin = await call(paged.service, 'cardWorldLogin')
  assert.strictEqual(pagedLogin.success, true)
  assert.strictEqual(readerState.lastCount, 3 + 120, '本人球员查询仍被截断')
  assert.ok(readerState.lastCount > 100, '未覆盖多页读取')

  console.log(JSON.stringify({
    ok: true,
    cases: ['auth-valid', 'auth-expired', 'auth-conflict', 'auth-unbound', 'profiles-missing', 'auto-pick',
      'manual-keep', 'version-update', 'no-card', 'read-failure', 'guardian-scope', 'dc-stats', 'pagination-123'],
    autoPick: login.mainPlayerId,
    paginationRows: readerState.lastCount
  }))
}

main().catch(error => { console.error(error); process.exit(1) })
