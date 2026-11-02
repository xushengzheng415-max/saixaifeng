'use strict'
// 品牌分享封面：复用原标识，通过 HTML/SVG 排版输出，不重画品牌标识。
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { chromium } = require('./lib/load-playwright.cjs')
const root = path.resolve(__dirname, '..')
const out = path.join(root, 'output/mini-share-cover-20261101')
const asset = path.join(root, 'miniprogram/images/brand/share-home-v1.jpg')

async function main() {
  fs.mkdirSync(out, { recursive: true })
  const logo = fs.readFileSync(path.join(root, 'miniprogram/images/brand/logo-saixiaofeng-football.png')).toString('base64')
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>
  *{box-sizing:border-box}html,body{margin:0;width:1000px;height:800px;overflow:hidden}
  body{background:#087842;color:#fff;font-family:"Microsoft YaHei",sans-serif}
  .pitch{position:absolute;inset:0;width:1000px;height:800px}
  .brand{position:absolute;left:180px;top:238px;width:640px;height:auto}
  .caption{position:absolute;top:495px;left:0;width:100%;text-align:center;font-size:40px;font-weight:600;letter-spacing:5px}
  .rule{position:absolute;left:464px;top:580px;width:72px;height:4px;background:#bce8cc}
  </style><svg class="pitch" viewBox="0 0 1000 800" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M66 144V66H144M856 66H934V144M66 656V734H144M856 734H934V656" stroke="#8acda8" stroke-width="2" opacity=".36"/>
  <g stroke="#a1dfbb" stroke-width="2" opacity=".13"><path d="M-80 710H1080M500 640V890"/><ellipse cx="500" cy="710" rx="130" ry="54"/><path d="M80 856L236 640H764L920 856M-44 110H1044"/></g>
  <circle cx="500" cy="710" r="4" fill="#a1dfbb" opacity=".3"/>
  </svg><img class="brand" src="data:image/png;base64,${logo}" alt="赛小蜂足球"><div class="caption">球队与赛事平台</div><div class="rule"></div></html>`
  const source = path.join(out, 'cover.html')
  fs.writeFileSync(source, html)
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: .8 })
    await page.goto(pathToFileURL(source).href)
    await page.locator('.brand').evaluate(img => img.decode())
    await page.screenshot({ path: asset, type: 'jpeg', quality: 86 })
    const bounds = await page.locator('.brand').boundingBox()
    if (bounds.x < 100 || bounds.x + bounds.width > 900) throw new Error('品牌标识超出方形裁切安全区')
    console.log(JSON.stringify({ asset, bytes: fs.statSync(asset).size, dimensions: '800x640', source, squareCropSafe: true }))
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
