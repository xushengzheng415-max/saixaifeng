'use strict'
/*
 * H5 中英文切换自检（2026-11-03）
 * 1) 线上问题：球员登记页右上角「中文」按钮自己不停闪。
 *    原因：translateUi 返回 TRANSLATE_NOT_CONFIGURED（生产未配置翻译密钥），
 *    i18n-runtime.js 每次失败后都会重排下一轮翻译；而 updateToggle 改写按钮文案
 *    本身就是一次 body 子树 mutation，会再次触发 MutationObserver → 无限重试。
 * 2) 用户确认改走「人工字典」方案：英文由 i18n-fixed-en.js 提供，机器翻译默认关闭。
 *    另外 i18n-fixed-en.js 曾因一处字面 \n 整个文件语法错误，字典一直未生效。
 * 覆盖：字典生效、按钮不闪、日志类中文不翻译（KEEP_ZH）、失败不无限重试、用户点击可重试。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { chromium } = require('./lib/load-playwright.cjs')

const H5_DIR = path.join(__dirname, '..', 'service-account-h5')
const PAGE_PATH = '/__i18n-toggle-test.html'
const PAGE_HTML = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>球员登记</title></head>
<body><main><header><h1>球员登记</h1></header><div id="status">正在确认微信身份…</div>
<section id="content"><p>未找到，可新建球员</p><div><button id="find">查找球员</button></div>
<div><button id="keep">确认使用</button><em id="unknown">今天天气不错</em></div></section></main>
<script src="./i18n-fixed-en.js"></script>
<script src="./i18n-runtime.js"></script>
</body></html>`

const STATIC_TYPES = { '.js': 'text/javascript; charset=utf-8', '.html': 'text/html; charset=utf-8' }

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = req.url.split('?')[0]
      if (url === PAGE_PATH) {
        res.writeHead(200, { 'Content-Type': STATIC_TYPES['.html'], 'Cache-Control': 'no-store' })
        res.end(PAGE_HTML)
        return
      }
      const file = path.join(H5_DIR, path.basename(url))
      // SXF_I18N_RUNTIME 可指向另一份 i18n-runtime.js，用于「修复前」基线复现。
      const override = process.env.SXF_I18N_RUNTIME
      const target = override && path.basename(url) === 'i18n-runtime.js' ? override : file
      if (!fs.existsSync(target)) {
        res.writeHead(404)
        res.end('not found')
        return
      }
      res.writeHead(200, {
        'Content-Type': STATIC_TYPES[path.extname(target)] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      })
      res.end(fs.readFileSync(target))
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

const EXECUTABLE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

async function launch() {
  try {
    return await chromium.launch({ executablePath: EXECUTABLE, headless: true })
  } catch (_) {
    return await chromium.launch({ headless: true })
  }
}

let failures = 0
let checks = 0
async function test(name, fn) {
  checks += 1
  try {
    await fn()
    console.log('[通过] ' + name)
  } catch (error) {
    failures += 1
    console.error('[失败] ' + name)
    console.error('       ' + String((error && error.message) || error))
  }
}

function trackTranslateRequests(page, bodies) {
  page.on('request', (request) => {
    if (!request.url().includes('webLoginApi')) return
    const body = request.postData() || ''
    if (!body.includes('translateUi')) return
    bodies.push(body)
  })
}

function mockTranslate(page, respond) {
  return page.route('**/webLoginApi', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(respond(route.request().postData() || ''))
    })
  })
}

function failResponder() {
  return () => ({ success: false, code: 'TRANSLATE_NOT_CONFIGURED', error: '翻译服务尚未配置' })
}

function okResponder() {
  return (body) => {
    let params = {}
    try { params = JSON.parse(body) } catch (_) {}
    const translations = {}
    ;(params.texts || []).forEach((source) => { translations[source] = 'EN:' + source })
    return { success: true, translations }
  }
}

/** 预置 en 语言；machine=true 时打开机器翻译兜底（默认关闭）。 */
async function prepare(page, machine) {
  await page.addInitScript((enable) => {
    try { localStorage.setItem('sxf_h5_lang', 'en') } catch (_) {}
    window.SXF_I18N_MACHINE_ENABLED = enable
  }, !!machine)
  await page.addInitScript(() => {
    window.__labelLog = []
    const watch = () => {
      const btn = document.getElementById('sxf-i18n-toggle')
      if (!btn) { setTimeout(watch, 10); return }
      const push = () => window.__labelLog.push(btn.textContent + (btn.disabled ? '(disabled)' : ''))
      push()
      new MutationObserver(push).observe(btn, { childList: true, characterData: true, subtree: true })
    }
    watch()
  })
}

async function labelSettled(page, expected, maxBusy) {
  const log = await page.evaluate(() => window.__labelLog)
  assert.ok(log.length > 0, '按钮文案没有记录到，按钮可能未创建')
  const tail = log[log.length - 1]
  assert.equal(tail, expected, '按钮文案未停到「' + expected + '」，实际「' + tail + '」')
  const flip = log.filter((row) => row.indexOf('…') >= 0).length
  const allowance = typeof maxBusy === 'number' ? maxBusy : 1
  assert.ok(flip <= allowance, '按钮仍在「…」与文案间反复切换，共 ' + flip + ' 次（上限 ' + allowance + '）')
}

async function textOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)
    return el ? el.textContent.trim() : '(missing)'
  }, selector)
}

;(async () => {
  const server = await startServer()
  const port = server.address().port
  const pageUrl = 'http://127.0.0.1:' + port + PAGE_PATH
  const browser = await launch()
  let page

  try {
    // 1) 人工字典方案（机器翻译默认关闭）：不发请求，页面直接变英文，业务状态词保持中文
    await test('人工字典生效：不发请求、页面变英文、状态词保持中文', async () => {
      page = await browser.newPage()
      const bodies = []
      trackTranslateRequests(page, bodies)
      await mockTranslate(page, failResponder())
      await prepare(page, false)
      await page.goto(pageUrl, { waitUntil: 'load' })
      await page.waitForTimeout(1200)
      const dict = await page.evaluate(() => ({
        loaded: typeof window.SXF_I18N_FIXED_EN,
        count: Object.keys(window.SXF_I18N_FIXED_EN || {}).length,
        machine: window.SXF_I18N_MACHINE_ENABLED,
        keep: (window.SXF_I18N_KEEP_ZH || []).length
      }))
      assert.equal(dict.loaded, 'object', 'i18n-fixed-en.js 没有加载成功（可能仍是语法错误）')
      assert.ok(dict.count >= 300, '字典词条过少：' + dict.count)
      assert.equal(dict.machine, false, '机器翻译默认应为关闭')
      assert.equal(bodies.length, 0, '机器翻译关闭时不应发出 translateUi 请求，实际 ' + bodies.length + ' 次')
      assert.equal(await textOf(page, '#status'), 'Verifying WeChat identity…')
      assert.equal(await textOf(page, '#content p'), 'Not found. You can create a new player')
      assert.equal(await textOf(page, '#find'), 'Find player')
      assert.equal(await textOf(page, '#keep'), '确认使用', '状态词「确认使用」被翻译会让页面脚本比较失效')
      assert.equal(await textOf(page, '#unknown'), '今天天气不错', '字典没有的词条在关闭机器翻译时应保持中文')
      await labelSettled(page, '中文')
      await page.close()
    })

    // 2) 页面动态新增内容同样走字典（不需要请求）
    await test('动态新增内容走字典且不再请求', async () => {
      page = await browser.newPage()
      const bodies = []
      trackTranslateRequests(page, bodies)
      await mockTranslate(page, failResponder())
      await prepare(page, false)
      await page.goto(pageUrl, { waitUntil: 'load' })
      await page.waitForTimeout(800)
      const before = bodies.length
      await page.evaluate(() => {
        const p = document.createElement('p')
        p.id = 'added'
        p.textContent = '未找到本队档案'
        document.getElementById('content').appendChild(p)
      })
      await page.waitForTimeout(700)
      assert.equal(await textOf(page, '#added'), 'No record in this team')
      assert.equal(bodies.length, before, '字典命中不该再发翻译请求')
      await page.close()
    })

    // 3) 用户点击切换：EN 立即套字典，点回中文完整还原
    await test('点击切换语言：EN 套字典、切回中文还原', async () => {
      page = await browser.newPage()
      const bodies = []
      trackTranslateRequests(page, bodies)
      await mockTranslate(page, failResponder())
      await prepare(page, false)
      await page.goto(pageUrl, { waitUntil: 'load' })
      await page.waitForTimeout(800)
      assert.equal(await textOf(page, '#find'), 'Find player')
      await page.click('#sxf-i18n-toggle')
      await page.waitForTimeout(500)
      assert.equal(await textOf(page, '#find'), '查找球员', '切回中文后页面没有还原')
      assert.equal(await textOf(page, '#content p'), '未找到，可新建球员')
      const label = await textOf(page, '#sxf-i18n-toggle')
      assert.equal(label, 'EN')
      await page.click('#sxf-i18n-toggle')
      await page.waitForTimeout(500)
      assert.equal(await textOf(page, '#find'), 'Find player')
      assert.equal(await textOf(page, '#sxf-i18n-toggle'), '中文')
      assert.equal(bodies.length, 0, '字典方案下切换语言不应发翻译请求')
      await page.close()
    })

    // 4) 机器翻译开启且服务正常时，字典外的文案仍可翻译
    await test('机器翻译开启时字典外文案走接口', async () => {
      page = await browser.newPage()
      const bodies = []
      trackTranslateRequests(page, bodies)
      await mockTranslate(page, okResponder())
      await prepare(page, true)
      await page.goto(pageUrl, { waitUntil: 'load' })
      await page.waitForTimeout(1200)
      assert.equal(bodies.length, 1, '字典外文案应合并成 1 次请求，实际 ' + bodies.length)
      assert.equal(await textOf(page, '#unknown'), 'EN:今天天气不错')
      assert.equal(await textOf(page, '#find'), 'Find player', '字典优先，不应被接口译文覆盖')
      await labelSettled(page, '中文', 2)
      await page.close()
    })

    // 5) 生产现状（翻译服务未配置）：只尝试 1 次，字典照常生效，按钮不闪
    await test('翻译服务未配置时只尝试一次且按钮不再闪烁', async () => {
      page = await browser.newPage()
      const bodies = []
      trackTranslateRequests(page, bodies)
      await mockTranslate(page, failResponder())
      await prepare(page, true)
      await page.goto(pageUrl, { waitUntil: 'load' })
      await page.waitForTimeout(2500)
      assert.equal(bodies.length, 1, '失败后仍在自动重试，共发出 ' + bodies.length + ' 次翻译请求')
      assert.ok(!bodies.some((body) => body.includes('中文')), '按钮文案「中文」被送去翻译了')
      assert.equal(await textOf(page, '#find'), 'Find player', '暂停后字典仍应生效')
      await labelSettled(page, '中文')
      await page.evaluate(() => {
        const p = document.createElement('p')
        p.id = 'added'
        p.textContent = '球员卡待确认'
        document.getElementById('content').appendChild(p)
      })
      await page.waitForTimeout(600)
      assert.equal(await textOf(page, '#added'), 'Player card pending confirmation')
      assert.equal(bodies.length, 1, '暂停后新增内容不应再发翻译请求')
      await page.close()
    })

    // 6) 网络连续失败（可恢复错误）最多自动重试 3 次
    await test('网络连续失败最多自动重试 3 次', async () => {
      page = await browser.newPage()
      const bodies = []
      trackTranslateRequests(page, bodies)
      await page.route('**/webLoginApi', (route) => route.abort('failed'))
      await prepare(page, true)
      await page.goto(pageUrl, { waitUntil: 'load' })
      await page.waitForTimeout(3000)
      assert.ok(bodies.length <= 3, '网络失败后重试次数超出上限：' + bodies.length)
      assert.equal(await textOf(page, '#find'), 'Find player')
      await labelSettled(page, '中文')
      await page.close()
    })
  } finally {
    if (page && !page.isClosed()) await page.close()
    await browser.close()
    server.close()
  }

  console.log('\n检查项 ' + checks + '，失败 ' + failures)
  if (failures) process.exitCode = 1
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
