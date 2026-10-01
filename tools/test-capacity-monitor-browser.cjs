// Local visual/regression test only. Every external request is intercepted or aborted.
// Usage: SXF_PLAYWRIGHT_MODULE=<existing module path> node tools/test-capacity-monitor-browser.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.SXF_PLAYWRIGHT_MODULE)
const root = path.resolve(__dirname, '..')
const output = path.join(root, '.codex-artifacts/team-player-read-performance-20261001')
const base = 'http://127.0.0.1:5197/admin/'
const monitorUrl = `${base}#/tournament-center-admin?section=capacity`
const source = '本地测试 fixture（非生产数据）'
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

function fixture(mode) {
  const sampled = new Date(), expires = new Date(sampled.getTime() + 300000)
  const definitions = [
    ['teams', '全平台球队记录', 24, '支'], ['players', '全平台球员记录', 510, '人'],
    ['tournaments', '全平台赛事记录', 8, '条'], ['matches', '全平台比赛记录', 151, '场'],
    ['snapshots', '已发布快照版本', 12, '条'], ['news', '已发布新闻记录', 0, '条'],
    ['publicTeams', '公开球队去重数量', null, '支'], ['publicPlayers', '公开球员去重人数', null, '人']
  ]
  const business = definitions.map(([key, label, value, unit]) => ({ key, label, value: mode === 'allFailed' ? null : value, unit,
    status: mode === 'allFailed' || value === null ? 'unavailable' : mode === 'stale' ? 'stale' : 'ready', source,
    sampledAt: value === null || mode === 'allFailed' ? null : sampled.toISOString(), definition: '仅用于本地布局和状态验证；不代表实际数据库规模',
    ...(mode === 'allFailed' ? { error: '本地模拟：聚合计数读取失败' } : {}) }))
  const metrics = [
    ['qps', '当前请求 QPS', null, 'QPS'], ['p95', '当前接口 P95 耗时', null, '毫秒'],
    ['errors', '当前错误率', null, '%'], ['storage', '当前数据库占用', null, 'MB'],
    ['rss', '当前采样函数进程 RSS', 48.2, 'MB'], ['sampling', '本次聚合采样耗时', 28.4, '毫秒'],
    ['historical', '审计历史峰值 QPS', 189, 'QPS']
  ].map(([key, label, value, unit]) => ({ key, label, value, unit, status: value === null ? 'unavailable' : key === 'historical' ? 'historical' : 'ready', source,
    sampledAt: value === null ? null : key === 'historical' ? '2026-10-01' : sampled.toISOString(), definition: key === 'historical' ? '历史测试示例；不是当前请求负载' : '布局测试数据；实时指标尚未接入' }))
  return { schemaVersion: 1, generatedAt: sampled.toISOString(), cache: { state: ['stale', 'expiredQuota'].includes(mode) ? 'stale' : 'fresh', sampledAt: sampled.toISOString(), expiresAt: expires.toISOString(), ttlSeconds: 300 }, business, metrics,
    quotas: [{ key: 'quota', label: 'QPS 额度', limit: 500, used: ['currentQuota', 'historicalQuota', 'expiredQuota'].includes(mode) ? 240 : null, unit: 'QPS', status: ['currentQuota', 'expiredQuota'].includes(mode) ? 'ready' : 'historical', source, sampledAt: '2026-10-01', definition: '配额示例；不是已验证的生产承载量' }],
    thresholds: { verifiedProductionSafeQps: null, verifiedAt: null, warningUtilizationPercent: 80, note: '生产安全阈值未验证；此页面不会启动压测' },
    alerts: [{ key: 'fixture', severity: 'info', message: source }],
    tests: [{ id: 'local-fixture', title: '本地页面状态与布局验证', type: 'local_synthetic', verifiedAt: '2026-10-01', scope: '浏览器拦截接口、身份门禁与响应布局', productionSafeQps: null,
      summary: '没有发出生产请求，没有运行生产压测', limitations: ['这些数字仅是明确标注的测试数据，不用于容量估算', '真实管理员登录与生产监控接入另行验收'] }]
  }
}

async function main() {
  fs.mkdirSync(output, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' })
  const results = [], requests = [], errors = [], screenshots = []
  let mode = 'normal', delay = 0
  const context = await browser.newContext()
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.hostname === '127.0.0.1') return route.continue()
    if (url.pathname === '/webLoginApi') {
      const payload = route.request().postDataJSON() || {}
      requests.push({ action: payload.action, functionName: payload.functionName, innerAction: payload.functionParams?.action })
      let response
      if (payload.action === 'platformCapacityOverview') {
        if (delay) await sleep(delay)
        response = mode === 'error' ? { success: false, code: 'CAPACITY_MONITOR_UNAVAILABLE', error: '本地测试：网络暂不可用' } : { success: true, data: fixture(mode) }
      } else if (payload.action === 'callFunction' && payload.functionName === 'platformOwner') response = { success: true, isPlatformOwner: true }
      else response = { success: false, error: `本地测试未配置此 action：${payload.action}` }
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(response) })
    }
    return route.abort()
  })
  await context.addInitScript(() => {
    localStorage.setItem('platformAuthToken', 'LOCAL_FIXTURE_ONLY_NOT_A_REAL_TOKEN')
    localStorage.setItem('platformSession', JSON.stringify({ userId: 'platform-owner', userName: '本地测试管理员', loginAt: 1 }))
    sessionStorage.setItem('sxfPlatformAuthContext', 'platform')
  })
  try {
    for (const viewport of [{ width: 1920, height: 1080 }, { width: 1365, height: 900 }, { width: 390, height: 844 }]) {
      const page = await context.newPage()
      await page.setViewportSize(viewport)
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(monitorUrl)
      await page.getByRole('heading', { name: '容量与性能监控', exact: true }).waitFor()
      await page.getByRole('heading', { name: '全平台球队记录', exact: true }).waitFor()
      await page.evaluate(() => {
        const label = document.createElement('div')
        label.id = 'capacity-local-fixture-marker'
        label.textContent = 'LOCAL TEST FIXTURE · 本地模拟数据 · 非生产监控'
        Object.assign(label.style, { position: 'fixed', top: '0', right: '0', zIndex: '99999', padding: '5px 9px', fontSize: '11px', color: '#fff', background: '#775016', pointerEvents: 'none' })
        document.body.append(label)
      })
      await page.getByText('当前使用率未接入', { exact: true }).waitFor()
      await page.locator('.business-card').first().getByText('已采集', { exact: true }).waitFor()
      const width = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }))
      assert.ok(width.document <= viewport.width + 1, `page overflows at ${viewport.width}: ${JSON.stringify(width)}`)
      const screenshot = `monitor-${viewport.width}.png`
      await page.screenshot({ path: path.join(output, screenshot), fullPage: true, animations: 'disabled' })
      screenshots.push(screenshot); results.push({ viewport, width })
      if (viewport.width === 1365) {
        const before = requests.filter(item => item.action === 'platformCapacityOverview').length
        delay = 150
        await page.getByRole('button', { name: '刷新数据' }).evaluate(button => { button.click(); button.click() })
        await page.waitForTimeout(400)
        assert.equal(requests.filter(item => item.action === 'platformCapacityOverview').length, before + 1)
        delay = 0; mode = 'error'
        await page.getByRole('button', { name: '刷新数据' }).click()
        await page.getByText('本地测试：网络暂不可用', { exact: true }).waitFor()
        assert.equal(await page.getByRole('heading', { name: '全平台球队记录', exact: true }).count(), 1)
        mode = 'currentQuota'; await page.getByRole('button', { name: '刷新数据' }).click()
        await page.locator('.quota-values strong').filter({ hasText: '240' }).waitFor()
        assert.equal(await page.getByRole('progressbar').count(), 1)
        mode = 'historicalQuota'; await page.getByRole('button', { name: '刷新数据' }).click()
        await page.locator('.quota-values strong').filter({ hasText: '—' }).waitFor()
        assert.equal(await page.getByRole('progressbar').count(), 0)
        mode = 'expiredQuota'; await page.getByRole('button', { name: '刷新数据' }).click()
        await page.getByText('快照已过期', { exact: true }).waitFor()
        assert.equal(await page.locator('.quota-values strong').textContent(), '—')
        assert.equal(await page.getByRole('progressbar').count(), 0)
        mode = 'stale'; await page.getByRole('button', { name: '刷新数据' }).click()
        await page.getByText('快照已过期', { exact: true }).waitFor()
        await page.screenshot({ path: path.join(output, 'monitor-stale-1365.png'), fullPage: true, animations: 'disabled' }); screenshots.push('monitor-stale-1365.png')
        mode = 'allFailed'; await page.getByRole('button', { name: '刷新数据' }).click()
        await page.getByText('本地模拟：聚合计数读取失败').first().waitFor()
        const countValues = await page.locator('.business-card .business-value').allTextContents()
        assert.ok(countValues.length === 8 && countValues.every(value => value.includes('—')))
        const beforeIdentityChange = requests.length
        await page.evaluate(() => { localStorage.removeItem('platformAuthToken'); window.dispatchEvent(new StorageEvent('storage', { key: 'platformAuthToken' })) })
        await page.getByText('仅平台管理员可以查看容量与性能监控', { exact: true }).waitFor()
        assert.equal(await page.getByRole('heading', { name: '全平台球队记录', exact: true }).count(), 0)
        assert.equal(requests.length, beforeIdentityChange)
        mode = 'normal'
      }
      await page.close()
    }
    assert.equal(requests.filter(item => item.innerAction === 'overview').length, 0, 'monitor deep link must not load the operational full-table overview')
    assert.deepEqual(errors, [])
    const organizer = await browser.newContext()
    let unauthorizedMonitorCalls = 0
    await organizer.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.hostname === '127.0.0.1') return route.continue()
      if (route.request().postData()?.includes('platformCapacityOverview')) unauthorizedMonitorCalls++
      return route.abort()
    })
    await organizer.addInitScript(() => { localStorage.setItem('authToken', 'LOCAL_ORGANIZER_FIXTURE'); localStorage.setItem('isLoggedIn', 'true'); localStorage.setItem('loginType', 'wechat') })
    const deniedPage = await organizer.newPage(); await deniedPage.goto(monitorUrl)
    await deniedPage.waitForURL(/platform-login/); assert.equal(unauthorizedMonitorCalls, 0); await organizer.close()
    const report = { verifiedAt: new Date().toISOString(), source, productionRequests: 0, productionPressureTests: 0, results, screenshots, requests, errors,
      checks: ['1920/1365/390 screenshots', 'no viewport overflow', 'in-flight duplicate refresh sharing', 'partial and stale evidence', 'error preserves prior evidence', 'only fresh ready quota usage displays progress', 'historical and expired quota usage stays unknown', 'all failed counts remain unknown', 'identity switch clears data', 'organizer frontend denial', 'no operational overview on monitoring deep link'] }
    fs.writeFileSync(path.join(output, 'monitor-browser-verification.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
  } finally { await context.close(); await browser.close() }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
