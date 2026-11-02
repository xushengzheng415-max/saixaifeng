'use strict'
// 临时截图脚本：本地核对「我的」首页会员卡、会员中心（整屏订阅页）、买蜂蜜面板的版式。
// 仅用 file:// + ?mock=1 的假数据，不联网、不下单。
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { chromium } = require('./lib/load-playwright.cjs')

const ROOT = path.join(__dirname, '..', 'service-account-h5')
const OUT = path.join(__dirname, '..', 'output', 'member-design-20261029')
const VIEWS = [
  { name: 'home', query: '?mock=1', click: [] },
  { name: 'member-open', query: '?mock=1', click: ['[data-action="membershipCenter"]'] },
  { name: 'member-open-basic', query: '?mock=1', click: ['[data-action="membershipCenter"]', '[data-member-plan="basic"]'] },
  { name: 'member-active', query: '?mock=1&member=active', click: ['[data-action="membershipCenter"]'] },
  { name: 'honey', query: '?mock=1', click: ['[data-action="honeyRecharge"]'] }
]

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-S9180) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.44(0x18002c2f) NetType/WIFI Language/zh_CN'
  })
  const report = []
  for (const view of VIEWS) {
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const url = pathToFileURL(path.join(ROOT, 'me.html')).href + view.query
    await page.goto(url, { waitUntil: 'load' })
    await page.waitForSelector('.me-home-member', { timeout: 15000 }).catch(() => {})
    for (const selector of view.click) {
      await page.click(selector).catch(error => report.push(view.name + ' click failed: ' + error.message.split('\n')[0]))
      await page.waitForTimeout(700)
    }
    await page.waitForTimeout(300)
    const file = path.join(OUT, view.name + '.png')
    await page.screenshot({ path: file })
    report.push(view.name + ' ' + fs.statSync(file).size + 'B' + (errors.length ? ' ERR ' + errors.join(' | ') : ''))
    await page.close()
  }
  await browser.close()
  console.log(report.join('\n'))
})().catch(error => {
  console.error(error.stack || error)
  process.exitCode = 1
})
