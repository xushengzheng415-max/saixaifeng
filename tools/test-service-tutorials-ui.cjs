'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { pathToFileURL } = require('node:url')
const { chromium } = require('./lib/load-playwright.cjs')
const root = path.resolve(__dirname, '..'), output = path.join(root, 'output/tutorial-library-20261104')
const tutorialId = 'tutorial_11111111-1111-4111-8111-111111111111'
const rows = [], calls = [], errors = []
let failure = false
async function response(body) {
  const p = body.functionParams || {}; calls.push(body)
  if (body.action === 'serviceTutorialGet') return { success: true, article: { ...rows[0].published, id: tutorialId, updatedAt: '2026-11-04T02:00:00Z' } }
  if (body.action === 'checkLogin') return { success: true, user: { _id: 'platform-owner', isPlatformOwner: true } }
  if (body.functionName === 'platformOwner') return { success: true, isPlatformOwner: true, requests: [] }
  if (p.action === 'tutorialList') {
    if (failure) return { success: false, error: '测试：暂时无法加载教程' }
    const listed = rows.filter(r => (!p.publishedOnly || r.isPublished) && (!p.keyword || (p.publishedOnly ? r.published.title : r.draft.title).includes(p.keyword)))
    return { success: true, rows: listed, total: listed.length }
  }
  if (p.action === 'tutorialSave') {
    if (p.mode === 'withdraw') rows[0].isPublished = false
    else { const row = rows[0] || { _id: tutorialId, revision: 0 }; row.draft = p.content; row.revision++; if (p.mode === 'publish') { row.published = structuredClone(p.content); row.isPublished = true }; rows[0] = row }
    return { success: true, id: tutorialId }
  }
  if (p.action === 'serviceFeedbackList') return { success: true, rows: [{ feedbackId: 'offline-feedback', type: 'other', typeLabel: '其他', content: '验收反馈：如何更换图片？', status: 'pending' }], total: 1, counts: { all: 1, pending: 1 } }
  if (p.action === 'serviceFeedbackReply') return { success: true, notify: { skipped: true, reason: '离线验收不发送通知' } }
  return { success: true, data: { banners: [], tournaments: [], organizers: [], accounts: [], teams: [], supportRequests: [], stats: {} } }
}
;(async () => {
  fs.mkdirSync(output, { recursive: true })
  const { createServer } = await import(pathToFileURL(path.join(root, 'platform-admin-vue/node_modules/vite/dist/node/index.js')))
  const server = await createServer({ root: path.join(root, 'platform-admin-vue'), configFile: path.join(root, 'platform-admin-vue/vite.config.js'), server: { host: '127.0.0.1', port: 5197, strictPort: true, watch: { ignored: ['**/dist*/**','**/node_modules/**'] } } })
  const staticServer = http.createServer((req, res) => {
    const filename = path.join(root, 'service-account-h5', path.basename(new URL(req.url, 'http://localhost').pathname))
    if (!fs.existsSync(filename)) { res.writeHead(404); return res.end() }
    res.setHeader('Content-Type', filename.endsWith('.js') ? 'application/javascript' : filename.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8'); res.end(fs.readFileSync(filename))
  })
  let browser
  try {
    await server.listen(); await new Promise(resolve => staticServer.listen(5198, '127.0.0.1', resolve))
    browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    await context.addInitScript(() => { localStorage.setItem('platformAuthToken', 'offline-qa'); localStorage.setItem('platformSession', JSON.stringify({ userId: 'platform-owner', userName: '平台负责人', user: { _id: 'platform-owner', isPlatformOwner: true }, loginAt: Date.now() })); sessionStorage.setItem('sxfPlatformAuthContext', 'platform') })
    await context.route('**/webLoginApi', async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(await response(route.request().postDataJSON())) }))
    const page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', e => errors.push(e.message))
    await page.goto('http://127.0.0.1:5197/#/tournament-center-admin?section=tutorials')
    await page.getByRole('button', { name: '新建教程', exact: true }).click()
    let dialog = page.getByRole('dialog', { name: '新建教程', exact: true })
    await dialog.getByRole('textbox').nth(0).fill('离线验收：更换图片教程')
    await dialog.getByRole('textbox').nth(1).fill('离线验收截图，仅测试阅读与回复流程。')
    await dialog.getByRole('textbox').nth(2).fill('选择图片')
    await dialog.getByRole('textbox').nth(3).fill('这是验收示例步骤，不代表实际业务入口。')
    await dialog.getByRole('button', { name: '保存草稿', exact: true }).click()
    await page.getByText('未发布', { exact: true }).waitFor()
    await page.getByRole('button', { name: '编辑', exact: true }).click()
    dialog = page.getByRole('dialog', { name: '编辑教程', exact: true })
    await dialog.getByRole('button', { name: '预览', exact: true }).click()
    await page.getByRole('dialog', { name: '教程预览' }).getByRole('heading', { name: '离线验收：更换图片教程' }).waitFor()
    await page.getByRole('dialog', { name: '教程预览' }).locator('.el-dialog__headerbtn').click()
    await dialog.getByRole('button', { name: '发布教程', exact: true }).click()
    await page.getByRole('button', { name: '发布', exact: true }).click()
    await page.getByText('已发布', { exact: true }).waitFor()
    await dialog.waitFor({ state: 'hidden' }); await page.locator('.el-message-box').waitFor({ state: 'hidden' })
    await page.screenshot({ path: path.join(output, 'library-desktop.png') })
    // Error and retry states must not show stale selectable results.
    failure = true; await page.locator('.library').getByRole('button', { name: '查询', exact: true }).click(); await page.getByText('测试：暂时无法加载教程').waitFor(); assert.equal(await page.locator('.library .el-table__row').count(), 0)
    failure = false; await page.getByRole('button', { name: '重新加载', exact: true }).click(); await page.getByText('已发布', { exact: true }).waitFor()
    await page.locator('.sidebar').getByRole('button', { name: '反馈管理', exact: true }).click()
    await page.getByRole('button', { name: '处理', exact: true }).click()
    await page.getByRole('button', { name: '引用教程', exact: true }).click()
    await page.getByRole('dialog', { name: '引用教程', exact: true }).getByRole('button', { name: '引用', exact: true }).click()
    await page.locator('.fb-tutorial-tags').getByText('离线验收：更换图片教程').waitFor()
    await page.getByRole('dialog', { name: '引用教程', exact: true }).waitFor({ state: 'hidden' })
    await page.screenshot({ path: path.join(output, 'feedback-reference.png') })
    await page.getByRole('button', { name: '回复并通知用户', exact: true }).click()
    await page.getByText('回复已保存（离线验收不发送通知）').waitFor()
    assert.deepEqual(calls.find(c => c.functionParams?.action === 'serviceFeedbackReply').functionParams.tutorialIds, [tutorialId])
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    await mobile.route('**/webLoginApi', async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(await response(route.request().postDataJSON())) }))
    const reader = await mobile.newPage(); reader.on('pageerror', e => errors.push(e.message)); await reader.goto('http://127.0.0.1:5198/tutorial.html?id=' + tutorialId)
    await reader.getByRole('heading', { name: '离线验收：更换图片教程' }).waitFor(); assert.equal(await reader.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await reader.screenshot({ path: path.join(output, 'tutorial-mobile.png'), fullPage: true })
    await mobile.route('**/webLoginApi', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: false, error: '教程暂不可用，请联系客服' }) }))
    await reader.reload(); await reader.getByRole('button', { name: '重新加载' }).waitFor()
    assert.deepEqual(errors, [])
    console.log('PASS: create draft, edit, preview, publish, list error/retry, feedback reference, reply payload, mobile reader, unavailable article; no browser errors')
  } finally { if (browser) await browser.close(); await server.close(); staticServer.close() }
})().catch(e => { console.error(e); process.exitCode = 1 })
