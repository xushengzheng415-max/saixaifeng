'use strict'
// 回归自测：云函数代码目录只读（EROFS）时，字体缓存必须写入系统临时目录，
// 不得在 __dirname/fonts 下创建临时文件。使用假清单、假字体字节和 https.get 桩，
// 不访问真实 CDN、不读写生产文件。
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { Readable } = require('stream')

const repo = path.resolve(__dirname, '..', 'cloudfunctions', 'webLoginApi')
const CACHE_ROOT = path.join(os.tmpdir(), 'sxf-player-card-fonts-v1')

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function makeReadable(bytes) {
  const stream = new Readable({ read() {} })
  stream.push(bytes)
  stream.push(null)
  return stream
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sxf-font-cache-test-'))
  const name = 'stage12-font-test-' + crypto.randomBytes(4).toString('hex') + '.ttf'
  const good = Buffer.from('good-font-bytes-' + name)
  const bad = Buffer.from('deployed-font-bytes-mismatch-' + name)
  const manifest = [{ name, url: 'https://example.invalid/font.ttf', sha256: sha256(good) }]

  fs.writeFileSync(path.join(dir, 'player-card-font-manifest.json'), JSON.stringify(manifest))
  fs.copyFileSync(path.join(repo, 'playerCardFontCache.cjs'), path.join(dir, 'playerCardFontCache.cjs'))
  fs.mkdirSync(path.join(dir, 'fonts'), { recursive: true })
  // 模拟线上部署目录里的字体与清单哈希不一致，且代码目录只读。
  fs.writeFileSync(path.join(dir, 'fonts', name), bad)

  const cacheFile = path.join(CACHE_ROOT, name)
  fs.rmSync(cacheFile, { force: true })

  const https = require('node:https')
  const originalGet = https.get
  https.get = (url, callback) => {
    const response = makeReadable(good)
    response.statusCode = 200
    process.nextTick(() => callback(response))
    return { setTimeout() {}, on() {}, destroy() {} }
  }

  try {
    const fontCache = require(path.join(dir, 'playerCardFontCache.cjs'))
    assert.strictEqual(fontCache.cacheRoot, CACHE_ROOT, '缓存根目录必须是系统临时目录')
    const resolved = fontCache.pathFor(name)
    assert.strictEqual(resolved, cacheFile, '哈希不匹配的部署字体不得作为缓存写入位置')
    assert.strictEqual(path.dirname(resolved), CACHE_ROOT)

    await fontCache.ensureFonts()

    assert.strictEqual(fs.existsSync(cacheFile), true, '字体应写入临时缓存')
    assert.strictEqual(sha256(fs.readFileSync(cacheFile)), sha256(good), '缓存字体哈希必须与清单一致')
    assert.strictEqual(sha256(fs.readFileSync(path.join(dir, 'fonts', name))), sha256(bad), '不得覆盖只读部署字体')
    const leftovers = fs.readdirSync(path.join(dir, 'fonts')).filter(file => file.includes(name))
    assert.deepStrictEqual(leftovers, [name], '不得在部署目录留下 .临时 文件')
  } finally {
    https.get = originalGet
    fs.rmSync(cacheFile, { force: true })
    fs.rmSync(dir, { recursive: true, force: true })
  }

  console.log('PASS test-player-card-font-cache: 只读代码目录 EROFS 防护、字体写入临时缓存、哈希校验')
}

main().catch(error => { console.error(error); process.exit(1) })
