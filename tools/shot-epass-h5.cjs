'use strict'
// 电子参赛证版式截图：file:// + ?mock=1，不联网
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { chromium } = require('./lib/load-playwright.cjs')

const ROOT = path.join(__dirname, '..', 'service-account-h5')
const OUT = path.join(__dirname, '..', 'output', 'epass-design-20261030')
const VIEWS = [
  { name: 'home-participation', query: '?mock=1', click: [] },
  { name: 'pass-adult', query: '?mock=1&view=pass&player=p1', click: [] },
  { name: 'pass-youth', query: '?mock=1&view=pass&player=p2', click: [] },
  { name: 'pass-present', query: '?mock=1&view=pass&player=p1', click: ['[data-pass-present]'] },
  { name: 'pass-waiting', query: '?mock=1&view=pass&player=p2', click: ['[data-pass-filter="all"]'] },
  { name: 'profile', query: '?mock=1&view=profile&player=p1', click: [] }
]

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true
  })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-S9180) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.44 NetType/WIFI Language/zh_CN'
  })
  const report = []
  for (const view of VIEWS) {
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const url = pathToFileURL(path.join(ROOT, 'me.html')).href + view.query
    await page.goto(url, { waitUntil: 'load' })
    await page.waitForTimeout(500)
    if (view.query.includes('view=pass') || view.query.includes('view=profile')) {
      await page.waitForSelector('.pp-pass, .pp-card, .pp-empty', { timeout: 10000 }).catch(() => {})
    } else {
      await page.waitForSelector('.me-home-participation', { timeout: 10000 }).catch(() => {})
    }
    for (const selector of view.click) {
      await page.click(selector).catch(error => report.push(view.name + ' click failed: ' + error.message.split('\n')[0]))
      await page.waitForTimeout(600)
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
    const file = path.join(OUT, view.name + '.png')
    await page.screenshot({ path: file, fullPage: view.name!=='pass-present' })
    report.push(view.name + ' ' + fs.statSync(file).size + 'B' + (overflow ? ' OVERFLOW' : '') + (errors.length ? ' ERR ' + errors.join(' | ') : ''))
    await page.close()
  }
  await browser.close()
  console.log(report.join('\n'))
  console.log('OUT ' + OUT)
})().catch(error => {
  console.error(error.stack || error)
  process.exitCode = 1
})
