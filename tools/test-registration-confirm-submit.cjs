'use strict'
// 隔离浏览器验收：确认取卡后应直接提交并进入结果页（2026-10-29 用户反馈）。
// 全部网络被拦截，真实加载 service-entry.js / registration-card-modal.js / registration-idcheck.js，
// 不产生任何线上请求、不写数据库、不扣蜂蜜。
const fs = require('fs')
const path = require('path')
const assert = require('assert/strict')
const { chromium } = require('./lib/load-playwright.cjs')

const root = path.resolve(__dirname, '..')
const out = path.join(root, 'output/registration-confirm-submit-20261029')
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const pngData = 'data:image/png;base64,' + png.toString('base64')
const idCard = '410102199102050128'

let source = fs.readFileSync(process.env.SXF_SERVICE_ENTRY_SOURCE || path.join(root, 'service-account-h5/service-entry.js'), 'utf8')
source = source.replace(/\n  start\(\)\r?\n\}\)\(\)\s*$/, '\n  window.__showPlayerFixture = showPlayer\n})()')
assert.ok(source.includes('__showPlayerFixture'), 'service-entry.js 需要暴露 showPlayerFixture')

const fixtureHtml = [
  '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<link rel="stylesheet" href="./service-entry.css"><link rel="stylesheet" href="./registration-idcheck.css">',
  '</head><body><main class="entry"><header><h1>球员登记</h1></header>',
  '<div id="status" role="status"></div><section id="content" hidden></section></main>',
  '<script>window.SXF_SERVICE_ENTRY_MODE="player"</script>',
  '<script>window.SxfDynamicCard={createWebResources:function(){return {}},web:function(){var c=document.createElement("canvas");c.width=420;c.height=560;return Promise.resolve(c)}}</script>',
  '<script src="./service-entry.fixture.js"></script>',
  '<script src="./registration-card-modal.js"></script>',
  '<script src="./registration-idcheck.js"></script>',
  '</body></html>'
].join('')

function contentTypeOf(file) {
  if (file.endsWith('.css')) return 'text/css; charset=utf-8'
  if (file.endsWith('.js')) return 'application/javascript; charset=utf-8'
  if (file.endsWith('.html')) return 'text/html; charset=utf-8'
  if (file.endsWith('.webp')) return 'image/webp'
  if (file.endsWith('.png')) return 'image/png'
  return 'image/jpeg'
}

async function open(browser) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' })
  const calls = []
  const errors = []
  let joinPlayer = 0
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    const json = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
    if (url.hostname.includes('tcloudbase.com')) {
      const data = route.request().postDataJSON() || {}
      calls.push(data.action)
      if (data.action === 'serviceEntryJoinPlayer') { joinPlayer += 1; return json({ success: true, playerId: 'fixture-player', pendingTeamConfirm: true }) }
      if (data.action === 'serviceEntryPlayerCard') {
        if (data.confirm) return json({ success: true, previewToken: 'confirmed-token', crop: { zoom: 1, x: 0, y: 0 }, imageData: pngData })
        return json({ success: true, previewToken: 'draft-token', crop: { zoom: 1, x: 0, y: 0 }, imageData: pngData, cardScene: {} })
      }
      if (data.action === 'serviceEntryUploadPhoto') return json({ success: true, fileID: 'cloud://fixture/transparent.png', portraitId: 'fixture-portrait', transparentPreview: pngData })
      if (data.action === 'serviceEntryCheckPlayerId') return json({ success: true, available: true, idCard: data.idCard, birthDate: '1991-02-05' })
      return json({ success: true, revision: 1, available: true })
    }
    if (url.pathname.endsWith('/fixture.html')) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixtureHtml })
    if (url.pathname.endsWith('/service-entry.fixture.js')) return route.fulfill({ contentType: 'application/javascript; charset=utf-8', body: source })
    const file = path.join(root, decodeURIComponent(url.pathname))
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return route.fulfill({ contentType: contentTypeOf(file), body: fs.readFileSync(file) })
    return route.abort()
  })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('https://www.sxffootball.cn/service-account-h5/fixture.html?entry=fixture-entry')
  await page.evaluate(() => {
    sessionStorage.setItem('sxf_entry_session_fixture-entry', 'qa-session')
    window.__showPlayerFixture({ teamName: '隔离测试球队', selection: { mode: 'new', choiceToken: 'fixture-choice', player: {} }, aiPortrait: { cost: 100, listCost: 150, balance: 1004, available: true } })
  })
  return { context, page, calls, errors, joinPlayerCount: () => joinPlayer }
}

async function fillForm(page, agree) {
  await page.locator('#name').fill('测试球员')
  await page.locator('#idCard').fill(idCard)
  await page.selectOption('#birthYear', '1991')
  await page.selectOption('#birthMonth', '2')
  await page.selectOption('#birthDay', '5')
  await page.locator('#jerseyNumber').fill('1')
  await page.selectOption('#position', 'GK')
  await page.locator('#height').fill('178')
  await page.locator('#weight').fill('90')
  if (agree) await page.locator('#agree').check()
}
// 真实链路：选完形象照后页面会自动打开球员卡弹层并生成；用户「确认取卡」后就该提交。
async function confirmCard(page) {
  await page.locator('#photo').setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: png })
  const confirm = page.locator('.registration-card-overlay [data-card="confirm"]')
  await confirm.waitFor({ state: 'visible' })
  await page.waitForFunction(() => { const b = document.querySelector('.registration-card-overlay [data-card="confirm"]'); return b && !b.disabled })
  return confirm
}

async function main() {
  fs.mkdirSync(out, { recursive: true })
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const results = []
  try {
    // 场景一：填完资料并上传形象照 → 弹层自动生成球员卡 → 确认取卡 → 应自动提交并进入结果页
    {
      const { context, page, errors, calls, joinPlayerCount } = await open(browser)
      await fillForm(page, true)
      const confirm = await confirmCard(page)
      assert.equal((await confirm.innerText()).trim(), '确认并提交登记', '自己取卡时按钮文案要说清楚是提交')
      await page.screenshot({ path: path.join(out, 'card-modal-375.png') })
      await confirm.click()
      await page.waitForFunction(() => !document.querySelector('#form'))
      assert.equal(joinPlayerCount(), 1, '确认取卡后应只提交一次')
      const resultText = await page.locator('#content').innerText()
      assert.match(resultText, /注册完成|登记成功|已提交球队确认/, '应进入提交结果页：' + resultText.slice(0, 80))
      assert.ok(calls.includes('serviceEntryJoinPlayer'))
      assert.deepEqual(errors, [])
      await page.screenshot({ path: path.join(out, 'done-page-375.png') })
      results.push({ scenario: 'manual-confirm-auto-submit', joinPlayerCount: 1, passed: true })
      await context.close()
    }
    // 场景二：没勾选授权时确认取卡，不能偷偷提交，要给出明确提示
    {
      const { context, page, errors, joinPlayerCount } = await open(browser)
      await fillForm(page, false)
      const confirm = await confirmCard(page)
      await confirm.click()
      await page.waitForFunction(() => String(document.getElementById('status').textContent || '').includes('授权'))
      assert.equal(joinPlayerCount(), 0, '资料授权未勾选时不得提交')
      assert.ok(await page.locator('#form').count(), '未提交时应留在表单')
      assert.deepEqual(errors, [])
      await page.screenshot({ path: path.join(out, 'agree-required-375.png') })
      results.push({ scenario: 'agree-required-guard', joinPlayerCount: 0, passed: true })
      await context.close()
    }
    fs.writeFileSync(path.join(out, 'ui-results.json'), JSON.stringify(results, null, 2))
    console.log(JSON.stringify(results))
  } finally {
    await browser.close()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
