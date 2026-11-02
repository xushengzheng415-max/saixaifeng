'use strict'
const fs = require('fs'), path = require('path'), assert = require('assert/strict')
const { chromium } = require('./lib/load-playwright.cjs')
const root = path.resolve(__dirname, '..')
const output = path.join(root, 'output/ai-portrait-platform-20261028')
const models = ['hunyuan35', 'seedream45', 'seedream5flash'].map((key, i) => ({ key, label: ['混元影像 3.5', 'Seedream 4.5', 'Seedream 5.0 Flash'][i], ready: true, enabled: true, vendor: '本地验收桩件', tag: '测试', model: key }))
let setting = { defaultModel: 'seedream45', allowUserChoice: true, models: Object.fromEntries(models.map(m => [m.key, { enabled: true }])) }
const png = fs.readFileSync(path.join(root, 'output/ai-portrait-chain-20261028/transparent-chain-check.png')).toString('base64')
async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    await context.addInitScript(() => {
      localStorage.setItem('platformAuthToken', 'qa-platform-token')
      localStorage.setItem('platformSession', JSON.stringify({ userId: 'platform-owner', userName: '本地验收', user: { _id: 'platform-owner', userName: '本地验收' }, loginAt: Date.now() }))
      sessionStorage.setItem('sxfPlatformAuthContext', 'platform')
    })
    const generations = []
    await context.route('**/*', async route => {
      const url = new URL(route.request().url())
      const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
      if (url.hostname.includes('tcloudbase.com')) {
        const body = route.request().postDataJSON() || {}, params = body.functionParams || {}
        if (params.action === 'status') return json({ success: true, isPlatformOwner: true })
        if (params.action === 'getAiPortraitModels') return json({ success: true, models, setting })
        if (params.action === 'createAiPortraitToolSession') return json({ success: true, ticket: 'qa-admin-session' })
        if (params.action === 'getAiPortraitUsage') return json({ success: true, usage: { available: false, note: '本地验收' } })
        return json({ success: true, data: { stats: {}, tournaments: [], organizers: [], banners: [] }, rows: [], requests: [] })
      }
      if (url.hostname === 'www.sxffootball.cn' && url.pathname === '/aiPortraitDemo') {
        const body = route.request().postDataJSON() || {}
        assert.equal(body.adminTicket, 'qa-admin-session')
        if (body.action === 'adminToolModels') return json({ success: true, ...setting, models })
        if (body.action === 'adminToolGenerate') {
          generations.push(body)
          return json({ success: true, data: { image: 'data:image/png;base64,' + png, transparent: true, mimeType: 'image/png', poseLabel: '正面抱膀', modelLabel: body.model, mode: 'text2image', watermark: 'none' } })
        }
        throw new Error('Unexpected tool action')
      }
      let file
      if (url.hostname === 'pingtai.sxffootball.cn') file = path.join(root, 'platform-admin-vue/dist', url.pathname === '/' ? 'index.html' : url.pathname)
      else if (url.hostname === 'www.sxffootball.cn') file = path.join(root, decodeURIComponent(url.pathname))
      if (file && fs.existsSync(file) && fs.statSync(file).isFile()) {
        const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : file.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream'
        return route.fulfill({ contentType: type, body: fs.readFileSync(file) })
      }
      return route.abort()
    })
    const page = await context.newPage()
    await page.goto('https://pingtai.sxffootball.cn/#/tournament-center-admin')
    await page.locator('.sidebar nav button', { hasText: 'AI 形象照' }).click()
    await page.getByRole('tab', { name: '在线自主生成球衣照' }).click()
    const tool = page.frameLocator('iframe[title="在线自主生成球衣照"]')
    await tool.getByRole('button', { name: 'Seedream 5.0 Flash', exact: false }).click()
    await tool.getByRole('button', { name: '生成定妆照', exact: true }).click()
    await tool.locator('.shots img').waitFor({ state: 'visible' })
    assert.equal(generations[0].model, 'seedream5flash')
    assert.equal(generations[0].transparentOutput, true)
    const frame = page.frames().find(frame => frame.url().includes('adminTool=1'))
    const layout = await frame.evaluate(() => {
      const a = document.querySelector('.panel').getBoundingClientRect(), b = document.querySelector('.result').getBoundingClientRect()
      return { inputLeft: a.left, inputRight: a.right, resultLeft: b.left, width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }
    })
    assert.ok(layout.resultLeft >= layout.inputRight)
    assert.ok(layout.scrollWidth <= layout.width)
    await page.screenshot({ path: path.join(output, 'platform-tool-fixture.png'), fullPage: true })
    setting = { ...setting, defaultModel: 'hunyuan35', allowUserChoice: false }
    await tool.getByRole('button', { name: '再生成一张' }).click()
    await page.waitForTimeout(300)
    assert.equal(generations[1].model, 'hunyuan35')
    await context.close()
    console.log('PASS: authenticated iframe handshake, desktop horizontal layout, selected-model dispatch, config refresh before generation, platform-default mode, PNG preview (isolated mocks; no production writes)')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
