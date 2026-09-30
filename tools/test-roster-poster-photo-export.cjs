const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require(process.env.SXF_PLAYWRIGHT_MODULE)

;(async () => {
  const browser = await chromium.launch({ headless:true, executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' })
  const page = await browser.newPage({ viewport:{ width:1515, height:1155 }, acceptDownloads:true })
  const realPortrait = process.env.SXF_QA_PORTRAIT
  if (realPortrait) await page.route('**/qa-real-portrait.png', route => route.fulfill({ body:fs.readFileSync(realPortrait), contentType:'image/png' }))
  await page.route('https://**/*', route => route.abort())
  await page.goto('http://127.0.0.1:5197/admin/#/tournaments/qa-tournament-2026/teams/qa-team-zhengzhou?divisionId=qa-division-u16&from=teams&mode=professional&visualQa=1')
  await page.getByRole('button', { name:'球队名单海报' }).click()
  const dialog = page.locator('.roster-poster-dialog')
  await dialog.locator('.roster-poster-player').first().waitFor()
  const portrait = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="300"><rect width="180" height="300" fill="#d4ebff"/><circle cx="90" cy="80" r="60" fill="#eb7979"/><rect x="55" y="150" width="70" height="140" fill="#3566cc"/></svg>').toString('base64')
  const bounds = await page.evaluate(async ({ src, realPortrait }) => {
    const poster = document.querySelector('.roster-poster-canvas')
    const card = poster.querySelector('.roster-poster-player')
    card.querySelector('.roster-poster-photo-fallback').style.display = 'none'
    const img = document.createElement('img')
    img.src = realPortrait ? `${location.origin}/qa-real-portrait.png` : `data:image/svg+xml;base64,${src}`
    img.alt = '测试肖像'
    card.append(img)
    await img.decode()
    const zoom = poster.style.zoom
    poster.style.zoom = '1'
    const rect = card.getBoundingClientRect(), parent = poster.getBoundingClientRect()
    poster.style.zoom = zoom
    return { left:Math.round((rect.left-parent.left)*1.5), top:Math.round((rect.top-parent.top)*1.5), width:Math.round(rect.width*1.5), height:Math.round(rect.height*1.5) }
  }, { src:portrait, realPortrait:Boolean(realPortrait) })
  if (realPortrait) await dialog.locator('.roster-poster-player').first().screenshot({ path:'qa-real-card-preview.png' })
  const downloadPromise = page.waitForEvent('download', { timeout:45000 })
  await dialog.getByRole('button', { name:'下载PNG' }).click()
  await (await downloadPromise).saveAs('qa-roster-portrait-export.png')
  const png = fs.readFileSync('qa-roster-portrait-export.png').toString('base64')
  const result = await page.evaluate(async ({ png, bounds, realPortrait }) => {
    const image = new Image()
    image.src = `data:image/png;base64,${png}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = bounds.width; canvas.height = bounds.height
    const context = canvas.getContext('2d')
    context.drawImage(image, bounds.left, bounds.top, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height)
    if (realPortrait) return { crop:canvas.toDataURL('image/png').split(',')[1] }
    const data = context.getImageData(0, 0, bounds.width, bounds.height).data
    let minX=bounds.width, maxX=0, minY=bounds.height, maxY=0, hits=0
    for (let y=0;y<bounds.height;y++) for (let x=0;x<bounds.width;x++) {
      const i=(y*bounds.width+x)*4
      const r=data[i],g=data[i+1],b=data[i+2]
      if (r>210 && g>85 && g<170 && b>85 && b<170) { minX=Math.min(minX,x); maxX=Math.max(maxX,x); minY=Math.min(minY,y); maxY=Math.max(maxY,y); hits++ }
    }
    return { aspect:(maxX-minX+1)/(maxY-minY+1), hits }
  }, { png, bounds, realPortrait:Boolean(realPortrait) })
  if (realPortrait) {
    fs.writeFileSync('qa-real-card-export.png', Buffer.from(result.crop,'base64'))
    console.log(JSON.stringify({ realPortrait:true, bounds }))
    await browser.close()
    return
  }
  const { aspect, hits } = result
  assert.ok(hits>1000, 'test circle not found')
  assert.ok(aspect>0.88 && aspect<1.12, `portrait circle stretched: ${aspect}`)
  console.log(JSON.stringify({ aspect:Number(aspect.toFixed(3)), hits, bounds }))
  await browser.close()
})().catch(error => { console.error(error); process.exitCode=1 })
