const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.resolve(__dirname, '..')
const webRoot = path.join(root, 'web-admin-vue')
const helperPath = path.join(webRoot, 'src/utils/capacityMonitor.js')
const Vue = require(path.join(webRoot, 'node_modules/vue'))
const compiler = require(path.join(webRoot, 'node_modules/@vue/compiler-sfc'))
const renderer = require(path.join(webRoot, 'node_modules/vue/server-renderer'))
const helperSource = fs.readFileSync(helperPath, 'utf8').replace(/export\s+(?=(?:const|function)\b)/g, '')
const helperContext = { module: { exports: {} }, setTimeout, clearTimeout, Date }
vm.runInNewContext(`${helperSource}\nmodule.exports = { CAPACITY_POLL_MS, normalizeCapacitySnapshot, formatCapacityNumber, formatCapacityTime, currentQuotaUsage, quotaUtilization, capacitySnapshotState, createCapacityMonitor }`, helperContext, { filename: helperPath })
const helper = helperContext.module.exports
const timestamp = Date.parse('2026-10-01T10:00:00Z')
const iso = value => new Date(value).toISOString()
const flush = async () => { for (let index = 0; index < 12; index++) await Promise.resolve() }
let checks = 0
async function check(label, task) { await task(); checks++; console.log(`PASS ${label}`) }

function snapshot(overrides = {}) {
  return {
    schemaVersion: 1, generatedAt: iso(timestamp),
    cache: { state: 'fresh', sampledAt: iso(timestamp), expiresAt: iso(timestamp + helper.CAPACITY_POLL_MS), ttlSeconds: 300 },
    business: [
      { key: 'teams', label: '平台球队记录', value: 0, unit: '支', status: 'ready', source: 'database.count:teams', sampledAt: iso(timestamp), definition: '全平台记录计数，包含草稿；不是公开球队去重人数' },
      { key: 'publicPlayers', label: '公开球员去重人数', value: null, unit: '人', status: 'unavailable', source: '未接入', sampledAt: null, definition: '公开快照内稳定身份去重；尚未接入' }
    ],
    metrics: [{ key: 'peakQps', label: '历史峰值 QPS', value: 189, unit: 'QPS', status: 'historical', source: '2026-10-01只读审计', sampledAt: '2026-10-01', definition: '历史小时指标，包含开发测试活动' }],
    quotas: [{ key: 'qps', label: 'QPS 额度', limit: 500, used: null, unit: 'QPS', status: 'historical', source: '套餐只读审计', sampledAt: '2026-10-01', definition: '不是已验证的生产并发人数或安全负载' }],
    thresholds: { verifiedProductionSafeQps: null, verifiedAt: null, warningUtilizationPercent: 80, note: '生产压测尚未开展' },
    alerts: [{ key: 'unverified', severity: 'info', message: '生产承载阈值尚未验证' }],
    tests: [{ id: 'local', title: '读取链路本地基准', type: 'local_synthetic', verifiedAt: '2026-10-01', scope: '合成数据与身份分页回归', productionSafeQps: null, summary: '比较数据库操作与返回字段', limitations: ['不是生产压测；不能推算同时在线人数'] }],
    ...overrides
  }
}

function harness(options = {}) {
  let clock = timestamp, identity = 'platform:owner:token-1', visible = true, state, calls = 0, nextId = 1
  const timers = new Map(), replies = []
  const controller = helper.createCapacityMonitor({
    request: () => { calls++; return replies.length ? replies.shift()() : Promise.resolve({ success: true, data: snapshot() }) },
    getIdentity: () => identity,
    isVisible: () => visible,
    now: () => clock,
    setTimer: (callback, delay) => { const id = nextId++; timers.set(id, { callback, due: clock + delay }); return id },
    clearTimer: id => timers.delete(id),
    onStateChange: value => { state = value },
    ...options
  })
  return {
    controller, timers, replies, get state() { return state }, get calls() { return calls },
    identity(value) { identity = value }, visible(value) { visible = value },
    async advance(milliseconds) {
      clock += milliseconds
      const due = [...timers.entries()].filter(([, timer]) => timer.due <= clock)
      for (const [id, timer] of due) { if (timers.delete(id)) timer.callback() }
      await flush()
    }
  }
}

function loadSfc(file, imports, { ssr = false } = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  const parsed = compiler.parse(source)
  assert.equal(parsed.errors.length, 0, `${file} must parse`)
  const compiled = compiler.compileScript(parsed.descriptor, { id: 'capacity-ui-test', inlineTemplate: ssr, templateOptions: { ssr } })
  let code = compiled.content.replace(/import\s+\{([\s\S]*?)\}\s+from\s+['"]([^'"]+)['"]/g, (_, names, specifier) => {
    const bindings = names.trim().split(',').filter(Boolean).map(name => name.trim().replace(/\s+as\s+/g, ': ')).join(', ')
    return `const { ${bindings} } = __imports[${JSON.stringify(specifier)}]`
  }).replace(/import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g, (_, name, specifier) => `const ${name} = __imports[${JSON.stringify(specifier)}].default`)
  code = code.replace('export default', 'module.exports =').replace(/import\.meta\.env\.BASE_URL/g, "'/admin/'")
  const listeners = new Map(), intervalCallbacks = new Map()
  const context = {
    module: { exports: {} }, __imports: imports, Date, console, Promise,
    document: { title: '', visibilityState: 'visible', addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) },
    window: { setInterval: fn => { const id = intervalCallbacks.size + 1; intervalCallbacks.set(id, fn); return id }, clearInterval: id => intervalCallbacks.delete(id), addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) },
    localStorage: { getItem: () => null, setItem: () => {} }
  }
  vm.runInNewContext(code, context, { filename: file })
  return { component: context.module.exports, listeners, intervalCallbacks }
}

async function renderMonitor(value, stateOverrides = {}) {
  const rowState = { data: value && helper.normalizeCapacitySnapshot(value), loading: false, error: '', accessDenied: false, lastLoadedAt: iso(timestamp), now: timestamp, ...stateOverrides }
  const imports = {
    vue: Vue, 'vue/server-renderer': renderer,
    '@element-plus/icons-vue': { Loading: Vue.defineComponent({ render: () => null }) },
    '@/utils/cloud': { callFunctionHTTP: () => { throw new Error('SSR must not request production') } },
    '@/utils/platformSession': { getPlatformAuthToken: () => 'local-test-token', getPlatformSession: () => ({ userId: 'platform-owner', loginAt: 1 }), isPlatformSession: () => true },
    '@/utils/capacityMonitor': { ...helper, createCapacityMonitor: options => { options.onStateChange(rowState); return { refresh() {}, start() {}, dispose() {}, notifyVisibility() {}, notifyIdentityChange() {} } } }
  }
  const { component } = loadSfc('web-admin-vue/src/views/tournament-center/CapacityPerformanceMonitor.vue', imports, { ssr: true })
  const app = Vue.createSSRApp(component)
  const elementPlus = require(path.join(webRoot, 'node_modules/element-plus'))
  app.use(elementPlus.default || elementPlus)
  app.provide(elementPlus.ID_INJECTION_KEY, { prefix: 1026, current: 0 })
  return renderer.renderToString(app)
}

async function main() {
  await check('null and nonfinite metrics stay unknown; actual zero is preserved', () => {
    const value = helper.normalizeCapacitySnapshot(snapshot({ metrics: [{ value: NaN }, { value: Infinity }, { value: '12' }, { value: 0 }] }))
    assert.equal(value.metrics[0].value, null); assert.equal(value.metrics[1].value, null); assert.equal(value.metrics[2].value, null); assert.equal(value.metrics[3].value, 0)
    assert.equal(helper.formatCapacityNumber(null), '—'); assert.equal(helper.formatCapacityNumber(0), '0')
  })
  await check('historical audit dates do not fabricate collection clock times', () => {
    assert.equal(helper.formatCapacityTime('2026-10-01'), '2026-10-01')
    assert.equal(helper.formatCapacityTime(null), '未采集'); assert.equal(helper.formatCapacityTime('invalid'), '未采集')
  })
  await check('unknown quota usage produces no percentage; historical QPS is not current usage', () => {
    const value = helper.normalizeCapacitySnapshot(snapshot())
    assert.equal(value.quotas[0].limit, 500); assert.equal(value.quotas[0].used, null)
    assert.equal(helper.quotaUtilization(value.quotas[0]), null)
    assert.equal(helper.quotaUtilization({ status: 'ready', used: 80, limit: 100 }), 80)
    assert.equal(helper.quotaUtilization({ status: 'ready', used: 2, limit: 0 }), null)
    assert.equal(helper.quotaUtilization({ status: 'historical', used: 80, limit: 100 }), null)
    assert.equal(helper.quotaUtilization({ status: 'stale', used: 80, limit: 100 }), null)
    assert.equal(helper.currentQuotaUsage({ status: 'historical', used: 80 }), null)
    assert.equal(helper.currentQuotaUsage({ status: 'ready', used: 80 }, true), null)
    assert.equal(value.thresholds.verifiedProductionSafeQps, null)
  })
  await check('empty, partial and expired snapshots are distinguished', () => {
    const normalized = helper.normalizeCapacitySnapshot(snapshot())
    assert.equal(helper.capacitySnapshotState(normalized, timestamp).partial, true)
    assert.equal(helper.capacitySnapshotState(normalized, timestamp).stale, false)
    assert.equal(helper.capacitySnapshotState(normalized, timestamp + 300001).stale, true)
    assert.equal(helper.capacitySnapshotState(helper.normalizeCapacitySnapshot(snapshot({ business: [], metrics: [], quotas: [], tests: [] })), timestamp).empty, true)
    assert.throws(() => helper.normalizeCapacitySnapshot({ schemaVersion: 2 }), /格式/)
  })
  await check('organizer or signed-out identity never requests monitor data', async () => {
    const h = harness(); h.identity(null); h.controller.start(); await h.controller.refresh()
    assert.equal(h.calls, 0); assert.equal(h.state.data, null); assert.equal(h.state.accessDenied, true); assert.equal(h.timers.size, 0)
    h.controller.dispose()
  })
  await check('overlapping manual refreshes share one request and successful reads are not retained as a request cache', async () => {
    const h = harness(); let release
    h.replies.push(() => new Promise(resolve => { release = resolve }))
    const first = h.controller.refresh(), second = h.controller.refresh()
    assert.equal(first, second); await flush(); assert.equal(h.calls, 1)
    release({ success: true, data: snapshot() }); await first
    assert.equal(h.state.data.business[0].value, 0); assert.equal(h.state.loading, false)
    await h.controller.refresh(); assert.equal(h.calls, 2); h.controller.dispose()
  })
  await check('late results after account switch are discarded and old data is cleared', async () => {
    const h = harness(); await h.controller.refresh(); let release
    h.replies.push(() => new Promise(resolve => { release = resolve }))
    const previous = h.controller.refresh(); await flush()
    h.identity('platform:owner:token-2'); h.controller.notifyIdentityChange()
    assert.equal(h.state.data, null); assert.equal(h.state.lastLoadedAt, null)
    await h.controller.refresh(); const current = h.state.data
    release({ success: true, data: snapshot({ business: [{ key: 'secret', label: 'old account data', value: 999 }] }) }); await previous
    assert.equal(h.state.data, current); assert.notEqual(h.state.data.business[0].key, 'secret'); h.controller.dispose()
  })
  await check('a late switch without a storage event is checked before applying the response', async () => {
    const h = harness(); let release
    h.replies.push(() => new Promise(resolve => { release = resolve }))
    const pending = h.controller.refresh(); await flush(); h.identity(null)
    release({ success: true, data: snapshot() }); await pending
    assert.equal(h.state.data, null); assert.equal(h.state.accessDenied, true); h.controller.dispose()
  })
  await check('request failure preserves same-identity evidence; retry recovers', async () => {
    const h = harness(); await h.controller.refresh(); const current = h.state.data
    h.replies.push(() => Promise.reject(new Error('网络暂不可用'))); await h.controller.refresh()
    assert.equal(h.state.data, current); assert.equal(h.state.error, '网络暂不可用'); assert.equal(h.state.loading, false)
    await h.controller.refresh(); assert.equal(h.state.error, ''); assert.equal(h.calls, 3); h.controller.dispose()
  })
  await check('backend permission rejection clears data and stops automatic polling until identity changes', async () => {
    const h = harness(); h.controller.start(); await flush()
    h.replies.push(() => Promise.resolve({ success: false, code: 'CAPACITY_MONITOR_FORBIDDEN', error: '平台权限不足' }))
    await h.controller.refresh(); assert.equal(h.state.data, null); assert.equal(h.state.accessDenied, true); assert.equal(h.timers.size, 0)
    await h.advance(600000); await h.controller.refresh(); assert.equal(h.calls, 2)
    h.identity('platform:owner:token-2'); h.controller.notifyIdentityChange(); await h.controller.refresh()
    assert.equal(h.calls, 3); assert.equal(h.state.accessDenied, false); h.controller.dispose()
  })
  await check('polling waits five minutes, pauses while hidden and deduplicates repeated visibility events', async () => {
    const h = harness(); h.controller.start(); await flush(); assert.equal(h.calls, 1)
    await h.advance(299999); assert.equal(h.calls, 1)
    h.visible(false); h.controller.notifyVisibility(); assert.equal(h.timers.size, 0)
    await h.advance(600000); assert.equal(h.calls, 1)
    h.visible(true); h.controller.notifyVisibility(); h.controller.notifyVisibility(); await flush()
    assert.equal(h.calls, 2); assert.equal(h.timers.size, 1)
    await h.advance(299999); assert.equal(h.calls, 2)
    await h.advance(1); assert.equal(h.calls, 3); h.controller.dispose()
  })
  await check('manual refresh resets automatic deadline and local identity checks do not add requests', async () => {
    const h = harness(); h.controller.start(); await flush(); await h.advance(120000)
    await h.controller.refresh(); const calls = h.calls
    h.controller.notifyIdentityChange(); await h.advance(180000); assert.equal(h.calls, calls)
    await h.advance(120000); assert.equal(h.calls, calls + 1); h.controller.dispose()
  })
  await check('unmount removes scheduled work and ignores pending completions', async () => {
    const h = harness(); h.controller.start(); await flush(); let release
    h.replies.push(() => new Promise(resolve => { release = resolve }))
    const pending = h.controller.refresh(); await flush(); h.controller.dispose()
    release({ success: true, data: snapshot() }); await pending; await h.advance(900000)
    assert.equal(h.state.data, null); assert.equal(h.timers.size, 0); assert.equal(h.calls, 2)
  })
  await check('actual Vue template renders unknown data, true zero, historical dates and unverified production capacity', async () => {
    const html = await renderMonitor(snapshot())
    assert.match(html, /平台球队记录/); assert.match(html, /business-value[^>]*>0/)
    assert.match(html, /公开球员去重人数/); assert.match(html, /business-value[^>]*>—/)
    assert.match(html, /当前使用率未接入/); assert.match(html, /500/); assert.match(html, /尚无已验证的生产压测安全阈值/)
    assert.match(html, /2026-10-01/); assert.match(html, /本地合成测试/); assert.match(html, /不能推算同时在线人数/)
  })
  await check('actual Vue template distinguishes empty, error, expired and denied states', async () => {
    assert.match(await renderMonitor(null), /暂无监控数据/)
    assert.match(await renderMonitor(null, { error: '网络暂不可用' }), /网络暂不可用/)
    assert.match(await renderMonitor(snapshot({ cache: { state: 'stale', sampledAt: iso(timestamp), expiresAt: iso(timestamp - 1), ttlSeconds: 300 } })), /快照已过期/)
    const denied = await renderMonitor(snapshot(), { accessDenied: true })
    assert.match(denied, /仅平台管理员/); assert.doesNotMatch(denied, /平台球队记录/)
    assert.match(await renderMonitor(snapshot({ business: [], metrics: [], quotas: [], tests: [] })), /尚未包含业务计数/)
  })
  await check('actual Vue template never labels historical or expired quota usage as current', async () => {
    const quota = { key: 'testQuota', label: 'test', limit: 500, used: 240, unit: 'QPS', status: 'historical', source: 'local test' }
    const historical = await renderMonitor(snapshot({ quotas: [quota] }))
    assert.match(historical, /quota-values[^>]*>当前用量[^]*?<strong[^>]*>—/)
    assert.doesNotMatch(historical, /role="progressbar"/)
    const expired = await renderMonitor(snapshot({ cache: { state: 'stale', sampledAt: iso(timestamp), expiresAt: iso(timestamp - 1), ttlSeconds: 300 }, quotas: [{ ...quota, status: 'ready' }] }))
    assert.match(expired, /quota-values[^>]*>当前用量[^]*?<strong[^>]*>—/)
    assert.doesNotMatch(expired, /role="progressbar"/)
    const current = await renderMonitor(snapshot({ quotas: [{ ...quota, status: 'ready' }] }))
    assert.match(current, /quota-values[^>]*>当前用量[^]*?<strong[^>]*>240/)
    assert.match(current, /role="progressbar"/)
  })
  await check('monitor component uses only the authorized overview action and removes listeners on unmount', async () => {
    const mounted = [], unmounted = [], requests = []; let platform = false
    const imports = {
      vue: { ...Vue, onMounted: fn => mounted.push(fn), onBeforeUnmount: fn => unmounted.push(fn) },
      '@element-plus/icons-vue': {},
      '@/utils/cloud': { callFunctionHTTP: async (...args) => { requests.push(args); return { success: true, data: snapshot() } } },
      '@/utils/platformSession': { getPlatformAuthToken: () => 'local-test-token', getPlatformSession: () => ({ userId: 'platform-owner', loginAt: 1 }), isPlatformSession: () => platform },
      '@/utils/capacityMonitor': helper
    }
    const loaded = loadSfc('web-admin-vue/src/views/tournament-center/CapacityPerformanceMonitor.vue', imports)
    const setup = loaded.component.setup({}, { expose() {} })
    mounted.forEach(fn => fn()); await flush(); assert.equal(requests.length, 0)
    platform = true; await setup.refresh(); assert.equal(requests.length, 1)
    assert.equal(requests[0][0], 'platformCapacityOverview'); assert.equal(requests[0][2], 30000)
    unmounted.forEach(fn => fn()); assert.equal(loaded.listeners.size, 0); assert.equal(loaded.intervalCallbacks.size, 0)
  })
  await check('platform deep link and global refresh avoid the full operational overview; legacy tabs load it lazily once', async () => {
    const mounted = [], unmounted = [], requests = []
    const icons = new Proxy({}, { get: (_, name) => name })
    const imports = {
      vue: { ...Vue, onMounted: fn => mounted.push(fn), onBeforeUnmount: fn => unmounted.push(fn) },
      'vue-router': { useRoute: () => ({ query: { section: 'capacity' } }), useRouter: () => ({ push() {}, async replace() {} }) },
      'element-plus': { ElMessage: { error: message => { throw new Error(message) }, warning() {} }, ElMessageBox: {} },
      '@element-plus/icons-vue': icons,
      '@/utils/cloud': { callFunction: async (name, params) => { requests.push([name, params.action]); return name === 'platformOwner' ? { success: true, isPlatformOwner: true } : { success: true, data: {} } }, logout: async () => {} },
      '@/utils/platformSession': { getPlatformSession: () => ({ userId: 'platform-owner' }), isPlatformSession: () => true },
      '@/utils/upload': { getTempFileURL: async () => ({ success: true, url: '' }), uploadBase64Image: async () => ({}) },
      '@/components/common/ImageCropper.vue': {}, '@/views/system/SystemAdmin.vue': {},
      './PlayerCardTemplateLibrary.vue': {}, './CapacityPerformanceMonitor.vue': {}
    }
    const loaded = loadSfc('web-admin-vue/src/views/tournament-center/TournamentCenterAdmin.vue', imports)
    const setup = loaded.component.setup({}, { expose() {} })
    await mounted[0](); assert.equal(setup.activeTab.value, 'capacity'); assert.equal(requests.filter(([, action]) => action === 'overview').length, 0)
    let monitorRefreshes = 0
    setup.capacityMonitorRef.value = { refresh: () => { monitorRefreshes++ }, loading: false }
    setup.refreshActiveSection(); assert.equal(monitorRefreshes, 1); assert.equal(requests.filter(([, action]) => action === 'overview').length, 0)
    setup.activeTab.value = 'overview'; await Vue.nextTick(); await flush()
    assert.equal(requests.filter(([, action]) => action === 'overview').length, 1)
    setup.activeTab.value = 'capacity'; await Vue.nextTick(); setup.activeTab.value = 'teams'; await Vue.nextTick(); await flush()
    assert.equal(requests.filter(([, action]) => action === 'overview').length, 1)
    assert.ok(setup.navigation.value.some(item => item.key === 'capacity'))
    unmounted.forEach(fn => fn()); assert.equal(loaded.listeners.size, 0); assert.equal(loaded.intervalCallbacks.size, 0)
  })
  console.log(`Capacity monitor UI: ${checks} checks passed. All API calls were local mocks; no cloud requests or pressure tests ran.`)
}

main().catch(error => { console.error(error); process.exitCode = 1 })
