'use strict'
// Isolated browser fixture: all network calls are intercepted; no real orders, generation or profile writes.
const fs = require('fs'), path = require('path'), assert = require('assert/strict')
const { chromium } = require('./lib/load-playwright.cjs')
const root = path.resolve(__dirname, '..'), out = path.join(root, 'output/registration-ai-sheet-20261028')
const png = fs.readFileSync('C:/Users/15043/Desktop/微信图片_20261028190202_120_1931.png').toString('base64')
let source = fs.readFileSync(path.join(root, 'service-account-h5/service-entry.js'), 'utf8')
source = source.replace(/\n  start\(\)\r?\n\}\)\(\)\s*$/, '\n  window.__showAiFixture = showPlayer\n})()')
assert.ok(source.includes('__showAiFixture'))
async function run(browser, width, height, balance, ios = false, reason = '') {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', userAgent: ios ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger' : undefined })
  const calls = [], errors = []
  let failDraft = false
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    const json = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
    if (url.hostname.includes('tcloudbase.com')) {
      const data = route.request().postDataJSON(); calls.push(data)
      if (data.action === 'serviceEntrySavePlayerDraft' && failDraft) return json({ success: false, error: '测试草稿未保存' })
      if (data.action === 'serviceEntryAiPortraitPrepare') {
        const account = { cost: 100, listCost: 150, balance, available: balance >= 100, reason }
        return json(balance >= 100 ? { success: true, generationTicket: 'a'.repeat(64), aiPortrait: account } : { success: false, code: reason || 'HONEY_INSUFFICIENT', error: '蜂蜜余额不足', aiPortrait: account })
      }
      if (data.action === 'serviceEntryAiPortraitApply') return json({ success: true, fileID: 'cloud://fixture/transparent.png', portraitId: 'fixture-portrait', transparentPreview: 'data:image/png;base64,' + png, aiPortrait: { balance: balance - 100, cost: 100 } })
      return json({ success: true, revision: 1, available: true })
    }
    if (url.hostname === 'fixture-storage.invalid') {
      calls.push({ action: 'upload', bytes: route.request().postDataBuffer().length })
      return route.fulfill({ status: 200, body: '' })
    }
    if (url.pathname === '/aiPortraitDemo') {
      const data = route.request().postDataJSON(); calls.push(data)
      if (data.action === 'registrationPrepare') return json({ success: true, data: { url: 'https://fixture-storage.invalid/reference.jpg', headers: {}, ticket: 'fixture-reference' } })
      if (data.action === 'registrationCancel') return json({ success: true })
      assert.equal(data.action, 'registrationGenerate')
      assert.equal(data.jerseyRef, true)
      assert.equal(data.referenceTicket, 'fixture-reference')
      assert.equal(data.photo, undefined)
      return json({ success: true, data: { image: 'data:image/png;base64,' + png, transparent: true, generatedPortraitId: 'b'.repeat(32), modelLabel: 'Fixture', durationMs: 100 } })
    }
    if (url.pathname.endsWith('/fixture.js')) return route.fulfill({ contentType: 'application/javascript; charset=utf-8', body: source })
    if (url.pathname.endsWith('/fixture.html')) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./service-entry.css"><main class="entry"><header><h1>球员登记 · 隔离界面验收</h1></header><div id="status"></div><section id="content"></section></main><script>window.SXF_SERVICE_ENTRY_MODE="player";window.SxfRegistrationCardModal=function(){return {invalidate(){},isOpen(){return false},begin(){},fail(){},generate(){},restore(){},isConfirmed(){return false},crop(){return {zoom:1,x:0,y:0}},token(){return ""},dispose(){}}}</script><script src="./fixture.js"></script>' })
    const file = path.join(root, decodeURIComponent(url.pathname))
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return route.fulfill({ contentType: file.endsWith('.css') ? 'text/css' : file.endsWith('.webp') ? 'image/webp' : 'image/jpeg', body: fs.readFileSync(file) })
    return route.abort()
  })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('https://www.sxffootball.cn/service-account-h5/fixture.html?entry=fixture-entry')
  await page.evaluate(balance => {
    sessionStorage.setItem('sxf_entry_session_fixture-entry', 'qa-session')
    window.__showAiFixture({ teamName: '隔离测试球队', selection: { mode: 'new', choiceToken: 'fixture-choice', player: {} }, aiPortrait: { cost: 100, listCost: 150, balance, available: balance >= 100, reason: '' } })
  }, balance)
  await page.locator('#aiPortraitOpen').click()
  assert.equal(await page.locator('#aiPaywall').isVisible(), false)
  for (const id of ['aiPortraitColor', 'aiPortraitStyle', 'aiPortraitTake', 'aiPacks', 'aiPlans']) assert.equal(await page.locator('#' + id).count(), 0)
  const layout = await page.locator('#aiPortraitGenerate').evaluate(button => ({ bottom: button.getBoundingClientRect().bottom, viewport: innerHeight, width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }))
  assert.ok(layout.bottom <= layout.viewport)
  assert.ok(layout.scrollWidth <= layout.width)
  await page.screenshot({ path: path.join(out, `initial-${width}-${balance}.png`) })
  await page.locator('#aiPortraitGenerate').click()
  assert.ok((await page.locator('#aiPortraitState').innerText()).includes('上传头像和球服'))
  assert.equal(calls.filter(c => c.action === 'serviceEntryAiPortraitPrepare').length, 0)
  await page.locator('#aiPortraitRef').setInputFiles('C:/Users/15043/Desktop/AI证件照.png')
  await page.locator('#aiFaceThumb').waitFor({ state: 'visible' })
  await page.locator('#aiPortraitGenerate').waitFor({ state: 'visible' })
  await page.waitForFunction(() => !document.getElementById('aiPortraitGenerate').disabled)
  await page.locator('#aiPortraitJersey').setInputFiles('C:/Users/15043/Desktop/图片_图片处理.png')
  await page.locator('#aiJerseyThumb').waitFor({ state: 'visible' })
  await page.waitForFunction(() => !document.getElementById('aiPortraitGenerate').disabled)
  assert.equal(calls.filter(c => c.action === 'serviceEntryAiPortraitPrepare').length, 0)
  await page.locator('#aiPortraitGenerate').click()
  if (balance < 100) {
    await page.locator('#aiPaywall').waitFor({ state: 'visible' })
    assert.equal(calls.filter(c => c.action === 'registrationGenerate' || c.action === 'upload').length, 0)
    if (ios) assert.equal(await page.locator('#aiGoRecharge').isEnabled(), false)
    else if (reason) { assert.ok((await page.locator('#aiFundingTitle').innerText()).includes('未开通')); assert.ok(!(await page.locator('#aiPayHint').innerText()).includes('余额 0')) }
    else assert.ok((await page.locator('#aiPayHint').innerText()).includes('还差 80 滴'))
    await page.screenshot({ path: path.join(out, `insufficient-${width}${ios ? '-ios' : ''}.png`) })
    if (!ios) {
      failDraft = true
      await page.locator('#aiGoRecharge').click()
      await page.waitForFunction(() => document.getElementById('aiPayHint').textContent.includes('测试草稿未保存'))
      assert.ok(page.url().includes('fixture.html'))
      assert.equal(await page.locator('#aiGoRecharge').isEnabled(), true)
      failDraft = false
    }
    await page.locator('#aiFundingClose').click()
    assert.equal(await page.locator('#aiPaywall').isVisible(), false)
  } else {
    await page.locator('#aiPortraitResult').waitFor({ state: 'visible' })
    const upload = calls.find(c => c.action === 'upload')
    assert.ok(upload.bytes > 95000)
    const generated = calls.find(c => c.action === 'registrationGenerate')
    assert.ok(Buffer.byteLength(JSON.stringify(generated)) < 2048)
    await page.screenshot({ path: path.join(out, `result-${width}.png`) })
    await page.locator('#aiPortraitUse').click()
    await page.locator('#aiSheetMask').waitFor({ state: 'hidden' })
    assert.equal(calls.filter(c => c.action === 'serviceEntryAiPortraitApply').length, 0)
    await page.locator('#aiPortraitOpen').click()
    await page.evaluate(() => { document.getElementById('form').reportValidity = () => true })
    await page.locator('#aiPortraitUse').click()
    await page.waitForFunction(() => document.getElementById('aiPortraitState').textContent.includes('已扣'))
    const applied = calls.find(c => c.action === 'serviceEntryAiPortraitApply')
    assert.equal(applied.generatedPortraitId, 'b'.repeat(32)); assert.equal(applied.base64Data, undefined)
  }
  assert.deepEqual(errors, [])
  await context.close()
  return { width, height, balance, ios, reason, passed: true }
}
async function main() {
  fs.mkdirSync(out, { recursive: true })
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const results = []
    for (const params of [[375, 812, 1004], [375, 812, 20], [320, 568, 1004], [390, 844, 20, true], [375, 812, 0, false, 'HONEY_ACCOUNT_NOT_OPEN']]) results.push(await run(browser, ...params))
    fs.writeFileSync(path.join(out, 'ui-results.json'), JSON.stringify(results, null, 2))
    console.log(JSON.stringify(results))
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
