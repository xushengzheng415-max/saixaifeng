// tools/test-invite-qr.cjs
// 约球海报二维码自检：把小程序端纯 JS QR 编码结果导出为 JSON，供 tools/check-invite-qr.py
// 与 Python 参考实现逐模块比对（同版本、同纠错等级、同掩码）。
// 用法：node tools/test-invite-qr.cjs

const fs = require('fs')
const path = require('path')
const { buildMatrix } = require('../miniprogram/pages/discover/invite-qr.js')

const SAFE_TOKEN = 'abcdef0123456789abcdef0123456789'
const SAMPLES = [
  { name: 'signin-short', text: 'https://www.sxffootball.cn/service-account-h5/friendly-signin.html?token=' + SAFE_TOKEN },
  { name: 'signin-plain', text: 'https://a.cn/f?token=' + SAFE_TOKEN },
  { name: 'ascii-60', text: 'https://www.sxffootball.cn/x?token=' + SAFE_TOKEN.slice(0, 12) }
]

const outDir = path.join(__dirname, '..', 'work', 'invite-qr')
fs.mkdirSync(outDir, { recursive: true })

let failures = 0
SAMPLES.forEach(sample => {
  const masks = []
  for (let mask = 0; mask <= 7; mask += 1) masks.push(mask)
  masks.forEach(mask => {
    const matrix = buildMatrix(sample.text, { mask })
    if (!matrix) {
      failures += 1
      console.error(`FAIL ${sample.name} mask=${mask}: 编码失败`)
      return
    }
    const payload = { name: sample.name, text: sample.text, version: matrix.version, mask, size: matrix.size, modules: matrix.modules }
    fs.writeFileSync(path.join(outDir, `${sample.name}-m${mask}.json`), JSON.stringify(payload))
  })
  const auto = buildMatrix(sample.text)
  if (!auto) {
    failures += 1
    console.error(`FAIL ${sample.name}: 自动掩码编码失败`)
    return
  }
  fs.writeFileSync(path.join(outDir, `${sample.name}-auto.json`), JSON.stringify({ name: sample.name, text: sample.text, version: auto.version, mask: auto.mask, size: auto.size, modules: auto.modules }))
  console.log(`OK ${sample.name}: version=${auto.version} mask=${auto.mask} size=${auto.size} bytes=${Buffer.byteLength(sample.text, 'utf8')}`)
})

console.log(failures ? `FAILED ${failures}` : '全部样本编码成功，等待 Python 参考实现比对')
process.exit(failures ? 1 : 0)
