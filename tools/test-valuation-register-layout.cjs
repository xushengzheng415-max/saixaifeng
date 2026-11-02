'use strict'
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const { chromium } = require('C:/Users/15043/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
  try {
    for (const width of [320, 390, 430, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } })
      const errors = []; page.on('pageerror', error => errors.push(error.message))
      await page.route('https://**/*', route => route.request().url().includes('res.wx.qq.com') ? route.fulfill({ body: '', contentType: 'application/javascript' }) : route.fulfill({ json: { success: false } }))
      await page.goto('file:///' + path.resolve(__dirname, '../service-account-h5/valuation-self-test.html').replace(/\\/g, '/'))
      await page.evaluate(() => {
        for (const [id,value] of Object.entries({ age: '41', position: '门将', height: '178', weight: '90' })) document.getElementById(id).value = value
        document.getElementById('form-stage').hidden = true
        document.getElementById('result-stage').hidden = false
        const wizard = document.getElementById('wizard-stage'); if (wizard) wizard.hidden = true
        document.querySelector('#result-stage .result-actions > .primary').click()
      })
      await page.locator('.onboard-register').waitFor()
      assert.equal(await page.locator('.onboard-register .primary').count(), 1)
      assert.equal(await page.locator('#register-mini-slot').count(), 0)
      assert.equal(await page.locator('#prefill-height').textContent(), '178 cm')
      assert.equal(await page.locator('#prefill-weight').textContent(), '90 kg')
      assert.match(await page.locator('#self-register-link').getAttribute('data-href'), /self-register\.html\?.*h=178&w=90/)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      const rect = await page.locator('#self-register-link').boundingBox()
      assert.ok(rect.width >= Math.min(width - 50, 380)); assert.ok(rect.height >= 48)
      if (width === 390) {
        const directory = path.resolve(__dirname, '../work/wechat/2026-10-23-valuation/register-layout-20261026')
        fs.mkdirSync(directory, { recursive: true })
        await page.screenshot({ path: path.join(directory, 'register-mobile.png'), fullPage: true })
      }
      await page.getByRole('button', { name: '返回身价结果' }).click()
      assert.equal(await page.locator('#result-stage').isVisible(), true)
      assert.deepEqual(errors, [])
      await page.close()
      console.log(width + 'px: single CTA / prefill / registration URL / return / no overflow passed')
    }
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
