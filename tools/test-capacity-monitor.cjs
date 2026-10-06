'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createCapacityMonitor, buildAlerts, TTL_MS } = require('../cloudfunctions/webLoginApi/capacityMonitor.cjs')
const { mockDatabase } = require('./performance/mock-db.cjs')
const { root, loadSource } = require('./performance/load-source.cjs')

const owner = { success: true, principalType: 'platform_owner', user: { isPlatformOwner: true }, userId: '' }
function countDatabase() {
  const stats = { count: 0, get: 0, writes: 0, active: 0, maxActive: 0, byCollection: {} }
  let fail = new Set(), total = 0
  const db = { stats, setFail(names) { fail = new Set(names) }, setTotal(value) { total = value }, collection(name) {
    return { where() { return this }, async count() {
      stats.count++; stats.active++; stats.maxActive = Math.max(stats.maxActive, stats.active); stats.byCollection[name] = (stats.byCollection[name] || 0) + 1
      try { await new Promise(resolve => setImmediate(resolve)); if (fail.has(name)) throw new Error('SYNTHETIC_PRIVATE_SENTINEL'); return { total } }
      finally { stats.active-- }
    }, async get() { stats.get++; throw new Error('full reads disabled') }, async add() { stats.writes++; throw new Error('writes disabled') }, doc() { throw new Error('document reads disabled') } }
  } }
  return db
}

;(async () => {
  let clock = Date.parse('2026-10-01T08:00:00Z'), authCalls = 0, auth = owner, assertions = 0
  const db = countDatabase()
  const monitor = createCapacityMonitor({ cloud: { database: () => db }, authenticateWebSession: async () => { authCalls++; return auth }, now: () => clock, memoryUsage: () => ({ rss: 64 * 1048576 }) })
  auth = { success: false, code: 'AUTH_REQUIRED' }
  assert.equal((await monitor({})).code, 'AUTH_REQUIRED'); assert.equal(db.stats.count, 0); assertions += 2
  for (const value of [
    { success: true, principalType: 'organizer', user: { role: 'admin', isPlatformOwner: true } },
    { success: true, principalType: 'platform_owner', user: {} },
    { success: true, principalType: 'organizer', user: { orgId: 'forged', role: 'admin' } }
  ]) { auth = value; assert.equal((await monitor({ role: 'platform_owner', isPlatformOwner: true })).code, 'CAPACITY_MONITOR_FORBIDDEN'); assertions++ }
  assert.equal(db.stats.count, 0); assertions++
  auth = owner
  const results = await Promise.all(Array.from({ length: 20 }, () => monitor({ forceRefresh: true, collection: 'users' })))
  const data = results[0].data
  assert(results.every(result => result.success)); assert.equal(db.stats.count, 6); assert.equal(db.stats.maxActive, 3); assertions += 3
  assert(data.business.filter(row => row.status === 'ready').every(row => row.value === 0)); assertions++
  assert(data.business.filter(row => row.key.startsWith('public') && row.status === 'unavailable').every(row => row.value === null)); assertions++
  assert.equal(data.thresholds.verifiedProductionSafeQps, null); assert.equal(data.quotas[0].limit, 500); assert.equal(data.quotas[0].used, null); assertions += 3
  assert.equal(data.metrics.find(row => row.key === 'liveQps').value, null); assert.equal(data.metrics.find(row => row.key === 'auditPeakQps').status, 'historical'); assertions += 2
  assert.equal(data.metrics.find(row => row.key === 'sampleRss').value, 64); assert(data.tests.every(test => test.productionSafeQps === null)); assertions += 2
  const cached = await monitor({ forceRefresh: true }); assert.equal(cached.data.cache.state, 'cached'); assert.equal(db.stats.count, 6); assertions += 2
  auth = { success: false, code: 'AUTH_REQUIRED' }; assert.equal((await monitor({})).code, 'AUTH_REQUIRED'); auth = owner; assertions++
  assert.equal(authCalls, 26); assertions++
  clock += TTL_MS
  db.setTotal(7); db.setFail(['players'])
  const partial = (await monitor({})).data
  const player = partial.business.find(row => row.key === 'players')
  assert.equal(player.value, 0); assert.equal(player.status, 'stale'); assert.equal(player.sampledAt, data.business[1].sampledAt); assertions += 3
  assert.equal(partial.business.find(row => row.key === 'teams').value, 7); assert.equal(partial.cache.state, 'stale'); assertions += 2
  assert(!JSON.stringify(partial).includes('SYNTHETIC_PRIVATE_SENTINEL')); assert(partial.alerts.some(alert => alert.key === 'stale')); assertions += 2
  await monitor({ forceRefresh: true }); assert.equal(db.stats.count, 12); assertions++
  clock += TTL_MS; db.setFail([])
  assert.equal((await monitor({})).data.business.find(row => row.key === 'players').status, 'ready'); assertions++
  const failedDb = countDatabase(); failedDb.setFail(['teams','players','tournaments','matches','publication_snapshots','tournament_news'])
  const empty = await createCapacityMonitor({ cloud: { database: () => failedDb }, authenticateWebSession: async () => owner })({})
  assert(empty.success); assert(empty.data.business.every(row => row.value === null)); assert(empty.data.alerts.some(alert => alert.key === 'partial')); assertions += 3
  const warningData = { business: [], thresholds: { warningUtilizationPercent: 80 }, quotas: [{ key: 'qps', label: 'QPS', limit: 500, used: 400, status: 'ready' }] }
  assert(buildAlerts(warningData).some(alert => alert.key === 'quota:qps')); assertions++
  warningData.quotas[0].status = 'historical'; assert(!buildAlerts(warningData).some(alert => alert.key === 'quota:qps')); assertions++
  assert.equal(db.stats.get + db.stats.writes + failedDb.stats.get + failedDb.stats.writes, 0); assertions++
  const routed = loadSource('webLoginApi', mockDatabase({}))
  const forbidden = await routed.main({ action: 'platformCapacityOverview', _testAuth: { success: true, principalType: 'organizer', user: {} } })
  assert.equal(forbidden.code, 'CAPACITY_MONITOR_FORBIDDEN'); assertions++
  const allowed = await routed.main({ action: 'platformCapacityOverview', _testAuth: owner })
  assert.equal(allowed.data.schemaVersion, 1); assertions++
  const output = path.join(root, '.codex-artifacts/team-player-read-performance-20261001')
  fs.mkdirSync(output, { recursive: true })
  fs.writeFileSync(path.join(output, 'monitor-regression.json'), JSON.stringify({ verifiedAt: new Date().toISOString(), assertions, duplicateRefreshes: 20, countOperationsPerWarmInstanceSample: 6, countConcurrencyMax: 3, cacheSeconds: 300, unauthorizedCountOperations: 0, documentReads: 0, databaseWrites: 0, cases: ['unauthenticated','organization-admin','forged-role','platform-principal-without-owner-flag','zero-is-known','unknown-is-null','cache-hit-re-authentication','TTL-and-force-does-not-bypass','concurrent-refresh','stale-and-original-timestamp','partial-failure','all-failed','recovery','historical-is-not-current-utilization','actual-action-dispatch'] }, null, 2) + '\n')
  console.log(`PASS: ${assertions} monitor assertions; 20 refreshes -> 6 counts, max 3 active; 300s authenticated cache; no document reads or writes.`)
})().catch(error => { console.error(error); process.exitCode = 1 })
