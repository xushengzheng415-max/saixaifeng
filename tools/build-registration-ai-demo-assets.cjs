const fs = require('fs'), path = require('path'), crypto = require('crypto')
const { chromium } = require('./lib/load-playwright.cjs')
const root = path.resolve(__dirname, '..'), out = path.join(root, 'service-account-h5/assets/ai-portrait-guide')
const sources = [
  ['C:/Users/15043/Desktop/AI证件照.png', 'face.webp'],
  ['C:/Users/15043/Desktop/图片_图片处理.png', 'jersey.webp'],
  ['C:/Users/15043/Desktop/微信图片_20261028190202_120_1931.png', 'result.webp']
]
async function main() {
  fs.mkdirSync(out, { recursive: true })
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage()
    const manifest = []
    for (const [file, name] of sources) {
      const source = fs.readFileSync(file)
      const result = await page.evaluate(async data => {
        const img = new Image(); img.src = data
        await img.decode()
        const scale = Math.min(1, 480 / img.naturalHeight)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale)
        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        let transparent = 0
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
        for (let i = 3; i < pixels.length; i += 4) if (!pixels[i]) transparent++
        return { data: canvas.toDataURL('image/webp', .88), width: canvas.width, height: canvas.height, transparent }
      }, 'data:image/png;base64,' + source.toString('base64'))
      const bytes = Buffer.from(result.data.split(',')[1], 'base64')
      fs.writeFileSync(path.join(out, name), bytes)
      manifest.push({ file: name, width: result.width, height: result.height, bytes: bytes.length, transparentPixels: result.transparent, sourceSha256: crypto.createHash('sha256').update(source).digest('hex') })
    }
    fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2))
    console.log(JSON.stringify(manifest))
  } finally { await browser.close() }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
