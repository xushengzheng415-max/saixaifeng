import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { createSessionReadCache, stableReadKey } from '../web-admin-vue/src/utils/sessionReadCache.js'
import { playerReadCacheTags, isReadOnlyRequest } from '../web-admin-vue/src/utils/playerReadCachePolicy.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let passed = 0
const scenarios = []
const tick = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
async function test(name, run) { await run(); passed++; scenarios.push(name); console.log('PASS', name) }
function fixture(options = {}) {
  let context = 'account-a|org-a|permission-a', time = 1000
  const changes = []
  const cache = createSessionReadCache({ identity: () => context, now: () => time, freshMs: 10, staleMs: 50, onChange: event => changes.push(event), ...options })
  return { cache, changes, advance: delta => { time += delta }, identity: value => { context = value } }
}
await test('stable keys preserve pagination, filtering and field semantics', async () => {
  assert.equal(stableReadKey({ skip: 0, where: { orgId: 'a', name: 'b' } }), stableReadKey({ where: { name: 'b', orgId: 'a' }, skip: 0 }))
  assert.notEqual(stableReadKey({ skip: 0 }), stableReadKey({ skip: 1000 }))
  assert.notEqual(stableReadKey({ fields: ['a', 'b'] }), stableReadKey({ fields: ['b', 'a'] }))
})
await test('warm reads avoid requests and do not invent zero grades', async () => {
  const { cache } = fixture(); let calls = 0
  const value = { success: true, playerCard: { status: 'unverified', points: null, tier: null }, metrics: { minutes: null }, coverage: { status: 'partial' } }
  const load = async () => { calls++; return value }
  const first = await cache.read('player', load)
  first.playerCard.points = 0
  assert.deepEqual(await cache.read('player', load), value)
  assert.equal(calls, 1)
})
await test('concurrent callers share one request and receive separate objects', async () => {
  const { cache } = fixture(); const request = deferred(); let calls = 0
  const reads = Array.from({ length: 12 }, () => cache.read('same-page', () => { calls++; return request.promise }))
  await tick(); assert.equal(calls, 1)
  request.resolve({ success: true, data: [{ _id: 'p1' }] })
  const rows = await Promise.all(reads)
  rows[0].data[0]._id = 'mutated'
  assert.equal(rows[1].data[0]._id, 'p1')
})
await test('stale response is immediate with one background refresh and update event', async () => {
  const f = fixture(); let calls = 0; const fresh = deferred()
  await f.cache.read('page', async () => ({ success: true, data: [1] }), { tags: ['players'] })
  f.advance(11)
  const load = () => { calls++; return fresh.promise }
  const returned = await Promise.all(Array.from({ length: 6 }, () => f.cache.read('page', load, { tags: ['players'] })))
  assert(returned.every(r => r.data[0] === 1)); assert.equal(calls, 1)
  fresh.resolve({ success: true, data: [2] }); await tick()
  assert.deepEqual((await f.cache.read('page', load)).data, [2])
  assert.equal(f.changes.filter(e => e.reason === 'refresh').length, 1)
})
await test('expired entries block for fresh data and backwards clocks cannot serve stale entries', async () => {
  const f = fixture(); let calls = 0
  const load = async () => ({ success: true, data: [++calls] })
  await f.cache.read('page', load); f.advance(51)
  assert.deepEqual((await f.cache.read('page', load)).data, [2])
  f.advance(-100); assert.deepEqual((await f.cache.read('page', load)).data, [3])
})
await test('account, organization, permission and platform changes purge old results', async () => {
  const f = fixture(); let calls = 0
  for (const identity of ['account-a|org-a|read', 'account-b|org-a|read', 'account-b|org-b|read', 'account-b|org-b|restricted', 'platform-owner']) {
    f.identity(identity)
    assert.equal((await f.cache.read('same', async () => ({ success: true, data: ++calls }))).data, calls)
  }
  assert.equal(calls, 5); assert.equal(f.cache.inspect().entries, 1)
})
await test('logout and anonymous requests retain no completed response', async () => {
  const f = fixture(); let calls = 0
  const load = async () => ({ success: true, data: ++calls })
  await f.cache.read('same', load); f.cache.clear('session'); assert.equal(f.cache.inspect().entries, 0)
  f.identity(''); await f.cache.read('same', load); await f.cache.read('same', load)
  assert.equal(calls, 3); assert.equal(f.cache.inspect().entries, 0)
})
await test('mutation invalidates pending reads and a new read does not join the old one', async () => {
  const f = fixture(), old = deferred()
  const stale = f.cache.read('same', () => old.promise)
  await tick(); f.cache.clear('mutation')
  const current = await f.cache.read('same', async () => ({ success: true, data: 'after' }))
  old.resolve({ success: true, data: 'before' })
  await assert.rejects(stale, { code: 'READ_CACHE_INVALIDATED' })
  assert.equal(current.data, 'after'); assert.equal((await f.cache.read('same', async () => { throw Error('unexpected') })).data, 'after')
})
await test('account switch while a response is pending rejects the old response', async () => {
  const f = fixture(), old = deferred(); const read = f.cache.read('same', () => old.promise)
  await tick(); f.identity('account-b'); old.resolve({ success: true, data: 'a' })
  await assert.rejects(read, { code: 'READ_CACHE_INVALIDATED' })
})
await test('failed responses are never cached; genuine empty results are cached', async () => {
  const f = fixture(); let calls = 0
  const fail = async () => { calls++; return { success: false, code: 'READ_FAILED', error: 'fixture' } }
  await f.cache.read('same', fail); await f.cache.read('same', fail); assert.equal(calls, 2)
  await f.cache.read('empty', async () => ({ success: true, data: [] }))
  assert.deepEqual((await f.cache.read('empty', async () => { throw Error('unexpected') })).data, [])
})
await test('access revocation during background refresh purges all cached records', async () => {
  const f = fixture()
  for (const key of ['players', 'stats']) await f.cache.read(key, async () => ({ success: true, data: key }))
  f.advance(11)
  await f.cache.read('players', async () => ({ success: false, code: 'PERMISSION_DENIED' }))
  await tick(); assert.equal(f.cache.inspect().entries, 0); assert(f.changes.some(e => e.reason === 'access'))
})
await test('network refresh failure is reported without replacing data by empty or zero', async () => {
  const f = fixture(); await f.cache.read('same', async () => ({ success: true, data: [null] })); f.advance(11)
  assert.deepEqual((await f.cache.read('same', async () => { throw Error('network fixture') })).data, [null])
  await tick(); assert(f.changes.some(e => e.reason === 'refresh-error'))
})
await test('manual bypass replaces the same cached query', async () => {
  const f = fixture(); await f.cache.read('same', async () => ({ success: true, data: [1] }))
  await f.cache.read('same', async () => ({ success: true, data: [2] }), { bypass: true })
  assert.deepEqual((await f.cache.read('same', async () => { throw Error('unexpected') })).data, [2])
})
await test('LRU and byte budgets bound memory without truncating returned data', async () => {
  const f = fixture({ maxEntries: 2, maxBytes: 500 })
  for (const key of ['a', 'b', 'c']) await f.cache.read(key, async () => ({ success: true, data: key }))
  assert.equal(f.cache.inspect().entries, 2); assert(f.cache.inspect().bytes <= 500)
  const big = 'x'.repeat(1000)
  assert.equal((await f.cache.read('big', async () => ({ success: true, data: big }))).data.length, 1000)
  assert.equal(f.cache.inspect().entries, 2)
})
await test('player/team profiles are cached while authoritative grade snapshots remain live', async () => {
  assert.deepEqual(playerReadCacheTags('dbQuery', { collection: 'players', operation: 'list' }), ['players'])
  assert.equal(playerReadCacheTags('dbQuery', { collection: 'players', operation: 'update' }), null)
  assert.equal(playerReadCacheTags('dbQuery', { collection: 'users', operation: 'get' }), null)
  assert.equal(playerReadCacheTags('platformCapacityOverview', {}), null)
  assert.equal(playerReadCacheTags('callFunction', { functionName: 'dataCenter', functionParams: { action: 'playerCard' } }), null)
  assert.equal(isReadOnlyRequest('callFunction', { functionName: 'dataCenter', functionParams: { action: 'playerDetail' } }), true)
  assert.equal(isReadOnlyRequest('callFunction', { functionName: 'updateMatch', functionParams: {} }), false)
})

class Storage { data = new Map(); getItem(k) { return this.data.get(k) ?? null } setItem(k, v) { this.data.set(k, String(v)) } removeItem(k) { this.data.delete(k) } }
class DetailEvent extends Event { constructor(type, options = {}) { super(type); this.detail = options.detail } }
async function harness(handler) {
  const localStorage = new Storage(), sessionStorage = new Storage(), window = new EventTarget(), calls = []
  localStorage.setItem('authToken', 'synthetic-test-token-a'); localStorage.setItem('userInfo', JSON.stringify({ _id: 'fixture-user', orgId: 'fixture-org' }))
  window.location = { hostname: 'localhost', origin: 'https://fixture.invalid', href: '' }
  const clock = { value: 1000 }
  class ClockDate extends Date { static now() { return clock.value } }
  const context = vm.createContext({ localStorage, sessionStorage, window, CustomEvent: DetailEvent, Date: ClockDate, AbortController, setTimeout, clearTimeout, console: { log() {}, warn() {}, error() {} }, fetch: async (url, options) => {
    assert.equal(url, 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi')
    const payload = JSON.parse(options.body); calls.push(payload)
    const result = await handler(payload, calls)
    return { ok: true, text: async () => JSON.stringify(result) }
  } })
  const modules = new Map()
  async function module(filename) {
    if (modules.has(filename)) return modules.get(filename)
    const instance = new vm.SourceTextModule(await fs.readFile(filename, 'utf8'), { context, identifier: filename, initializeImportMeta: meta => { meta.env = { DEV: false, BASE_URL: '/admin/' } } })
    modules.set(filename, instance)
    await instance.link(async (specifier, importer) => {
      if (specifier === 'element-plus') return new vm.SyntheticModule(['ElMessage'], function () { this.setExport('ElMessage', { warning() {}, error() {} }) }, { context })
      let target = path.resolve(path.dirname(importer.identifier), specifier)
      if (!path.extname(target)) target += '.js'
      return module(target)
    })
    return instance
  }
  const cloud = await module(path.join(root, 'web-admin-vue/src/utils/cloud.js'))
  await cloud.evaluate()
  return { api: cloud.namespace, calls, localStorage, sessionStorage, window, clock, module }
}
await test('real cloud queryAll caches only a complete 1250-row aggregate', async () => {
  const rows = Array.from({ length: 1250 }, (_, i) => ({ _id: `fixture-${i}`, grade: null }))
  const h = await harness(p => ({ success: true, data: rows.slice(p.skip || 0, (p.skip || 0) + p.limit) }))
  assert.equal((await h.api.queryAll('players')).length, 1250); assert.equal(h.calls.length, 2)
  assert.equal((await h.api.queryAll('players')).length, 1250); assert.equal(h.calls.length, 2)
  assert.equal((await h.api.queryAll('players', { cache: 'reload' })).length, 1250); assert.equal(h.calls.length, 4)
  await h.api.queryAll('players'); assert.equal(h.calls.length, 4)
})
await test('real cloud pagination failure cannot create a cached partial aggregate', async () => {
  let fail = true
  const h = await harness(p => p.skip && fail ? { success: false, error: 'fixture page failure' } : { success: true, data: p.skip ? [] : Array.from({ length: 1000 }, (_, i) => ({ _id: `fixture-${i}` })) })
  await assert.rejects(h.api.queryAll('players'), /fixture page failure/)
  fail = false; assert.equal((await h.api.queryAll('players')).length, 1000); assert.equal(h.calls.length, 4)
})
await test('real cloud page, filter and sort queries cannot share mismatched cached data', async () => {
  const h = await harness(p => ({ success: true, data: [{ _id: String(p.skip || 0), filter: p.where, sort: p.orderBy }] }))
  for (const options of [{ skip: 0 }, { skip: 100 }, { skip: 0, where: { teamId: 'fixture-t' } }, { skip: 0, orderBy: { name: 'desc' } }]) await h.api.queryList('players', options)
  assert.equal(h.calls.length, 4)
  await h.api.queryList('players', { skip: 100 }); assert.equal(h.calls.length, 4)
})
await test('real cloud CRUD invalidates reads before and after the write', async () => {
  let revision = 0
  const h = await harness(p => p.operation === 'list' ? { success: true, data: [{ _id: 'fixture-p', revision }] } : { success: true, revision: ++revision })
  for (const operation of ['add', 'update', 'delete']) {
    await h.api.queryList('players'); const previous = h.calls.length
    await h.api.callFunctionHTTP('dbQuery', { collection: 'players', operation, id: 'fixture-p', data: {} })
    assert.equal((await h.api.queryList('players'))[0].revision, revision)
    assert.equal(h.calls.length, previous + 2)
  }
})
await test('real cloud auth, org, role and platform boundaries invalidate hits', async () => {
  const h = await harness(() => ({ success: true, data: [{ _id: 'fixture-p' }] }))
  await h.api.queryList('players')
  for (const [key, value] of [['authToken', 'synthetic-test-token-b'], ['currentOrg', 'fixture-org-b'], ['currentRole', 'fixture-restricted']]) {
    const before = h.calls.length; h.localStorage.setItem(key, value); await h.api.queryList('players'); assert.equal(h.calls.length, before + 1)
  }
  h.localStorage.setItem('platformAuthToken', 'synthetic-test-platform-token'); h.localStorage.setItem('platformSession', JSON.stringify({ user: { _id: 'fixture-platform', isPlatformOwner: true } })); h.sessionStorage.setItem('sxfPlatformAuthContext', 'platform')
  await h.api.queryList('players'); assert.equal(h.calls.at(-1).authToken, 'synthetic-test-platform-token')
  await h.api.logout(true); h.sessionStorage.removeItem('sxfPlatformAuthContext'); await h.api.queryList('players'); assert.equal(h.calls.at(-1).authToken, 'synthetic-test-token-b')
})
await test('real authoritative grade response retains null, coverage and rule version', async () => {
  const value = { success: true, playerCard: { status: 'unverified', tier: null, points: null, metricVersion: 'fixture/1' }, coverage: { status: 'partial', missing: ['minutes'] } }
  const h = await harness(() => value)
  const first = await h.api.callFunction('dataCenter', { action: 'playerCard', playerId: 'fixture-p' })
  const second = await h.api.callFunction('dataCenter', { action: 'playerCard', playerId: 'fixture-p' })
  assert.deepEqual(JSON.parse(JSON.stringify(first)), value); assert.deepEqual(JSON.parse(JSON.stringify(second)), value); assert.equal(h.calls.length, 2)
})
await test('platform capacity remains live instead of using the player session cache', async () => {
  const h = await harness(() => ({ success: true, generatedAt: h.calls.length }))
  await h.api.callFunctionHTTP('platformCapacityOverview'); await h.api.callFunctionHTTP('platformCapacityOverview')
  assert.equal(h.calls.length, 2)
})
await test('real batched card reader uses at most 50 IDs, preserves unknown status and refreshes on retry', async () => {
  const h = await harness(p => ({ success: true, cards: p.playerIds.map(playerId => ({ playerId, status: 'pending', tier: null, points: null })) }))
  const cards = await h.module(path.join(root, 'web-admin-vue/src/utils/playerCard.js')); await cards.evaluate()
  const ids = Array.from({ length: 62 }, (_, i) => `fixture-p${i}`)
  const first = await Promise.all(ids.map(id => cards.namespace.readPlayerCard(id)))
  assert.equal(h.calls.length, 2); assert(h.calls.every(c => c.playerIds.length <= 50)); assert(first.every(c => c.tier === null && c.points === null))
  await Promise.all(ids.map(id => cards.namespace.readPlayerCard(id))); assert.equal(h.calls.length, 2)
  await cards.namespace.readPlayerCard(ids[0], { cache: 'reload' }); assert.equal(h.calls.length, 3)
})

const report = { passed, failed: 0, scenarios, networkAccess: false, productionDatabaseActions: false, syntheticFixtureSize: 1250, warmFullReadHttpCalls: 0, coldFullReadHttpCalls: 2, cacheStorage: 'tab-local memory, not persisted', freshMs: 15000, maximumStaleMs: 60000, maxEntries: 80, maxBytes: 4 * 1024 * 1024 }
await fs.writeFile(path.resolve(root, '../session-cache-test-results.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
