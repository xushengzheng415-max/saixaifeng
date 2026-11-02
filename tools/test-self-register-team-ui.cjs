'use strict'
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { chromium } = require('C:/Users/15043/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    let failed = false, requests = []
    await page.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/webLoginApi') {
        const data = route.request().postDataJSON(); requests.push(data)
        if (failed && data.action === 'selfRegisterSearchTeams') return route.fulfill({ json: { success: false, message: '网络异常，请重试' } })
        const results = {
          selfRegisterContext: { self: { id: 'p1', name: '测试球员' } },
          selfRegisterTeams: { teams: [{ id: 't1', name: '本人球队', city: '开封' }] },
          selfRegisterSearchTeams: { teams: data.keyword === '无此' ? [] : [{ id: 't2', name: '立洋球队', city: '开封' }], hasMore: false },
          selfRegisterRequestTeamJoin: { status: 'pending', teamName: '立洋球队' }
        }
        return route.fulfill({ json: { success: true, ...results[data.action] } })
      }
      if (url.hostname === 'res.wx.qq.com') return route.fulfill({ body: '' })
      const file = path.join(__dirname, '..', 'service-account-h5', path.basename(url.pathname))
      return fs.existsSync(file) ? route.fulfill({ path: file }) : route.abort()
    })
    await page.addInitScript(() => sessionStorage.setItem('sxf-self-register-session-v1', 'a'.repeat(64)))
    await page.goto('https://www.sxffootball.cn/service-account-h5/self-register.html')
    await page.getByText('本人球队', { exact: true }).waitFor()
    assert.equal(await page.locator('#create-team').isVisible(), false)
    await page.locator('#team-keyword').fill('立洋'); await page.getByRole('button', { name: '搜索', exact: true }).click()
    await page.getByText('立洋球队', { exact: true }).waitFor()
    assert.equal(await page.locator('#new-team-slot').isVisible(), false)
    await page.locator('#confirm-new-team').check()
    assert.equal(await page.locator('#new-team-slot').isVisible(), true)
    page.once('dialog', dialog => dialog.accept())
    await page.locator('#team-results').getByRole('button', { name: '选择此队' }).click()
    await page.getByRole('button', { name: '待球队确认' }).waitFor()
    assert.equal(requests.find(row => row.action === 'selfRegisterRequestTeamJoin').playerId, 'p1')
    await page.locator('#team-keyword').fill('无此')
    assert.equal(await page.locator('#create-team').isVisible(), false)
    await page.getByRole('button', { name: '搜索', exact: true }).click()
    await page.getByText('没有找到匹配的球队，可换个关键词再搜。').waitFor()
    failed = true
    await page.locator('#team-keyword').fill('失败'); await page.getByRole('button', { name: '搜索', exact: true }).click()
    await page.getByText('搜索未完成，请重试；暂不开放新建入口。').waitFor()
    assert.equal(await page.locator('#create-team').isVisible(), false)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    assert.deepEqual(errors, [])
    console.log('self-register mobile UI: managed teams / fuzzy search / apply / create gate / failure / no overflow passed (mock APIs; no production writes)')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
