#!/usr/bin/env node
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const https = require('node:https')

const root = path.resolve(__dirname, '..')
const catalog = require('../cloudfunctions/webLoginApi/nationality-catalog.json')
const primary = path.join(root, 'cloudfunctions/webLoginApi/assets/flags')
const mirrors = [
  path.join(root, 'miniprogram/images/flags'),
  path.join(root, 'web-admin-vue/public/images/flags'),
  path.join(root, 'service-account-h5/assets/flags'),
  path.join(root, 'cloudfunctions/getMiniWorkspace/assets/flags'),
  path.join(root, 'cloudfunctions/playerCardPublishWorker/assets/flags')
]

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'sxf-football-flag-sync/1' }, timeout: 15000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        return fetchBuffer(res.headers.location).then(resolve, reject)
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
    })
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('timeout')))
  })
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index], index)
    }
  }))
  return results
}

async function main() {
  fs.mkdirSync(primary, { recursive: true })
  mirrors.forEach(dir => fs.mkdirSync(dir, { recursive: true }))
  const unknownSrc = path.join(root, 'miniprogram/images/flags/nationality-unknown.jpg')
  if (fs.existsSync(unknownSrc)) {
    fs.copyFileSync(unknownSrc, path.join(primary, 'nationality-unknown.jpg'))
    mirrors.forEach(dir => fs.copyFileSync(unknownSrc, path.join(dir, 'nationality-unknown.jpg')))
  }
  const codes = [...new Set((catalog.entries || []).map(item => item.code).filter(code => code && code !== 'cn'))]
  let ok = 0
  let fail = 0
  await mapLimit(codes, 10, async code => {
    const dest = path.join(primary, `${code}.png`)
    try {
      if (fs.existsSync(dest) && fs.statSync(dest).size > 50) {
        ok += 1
        return
      }
      const buffer = await fetchBuffer(`https://flagcdn.com/w80/${code}.png`)
      if (!buffer || buffer.length < 50) throw new Error('empty')
      fs.writeFileSync(dest, buffer)
      ok += 1
      process.stdout.write(`ok ${code}\n`)
    } catch (error) {
      fail += 1
      process.stderr.write(`fail ${code}: ${error.message}\n`)
    }
  })
  for (const file of fs.readdirSync(primary)) {
    const src = path.join(primary, file)
    if (!fs.statSync(src).isFile()) continue
    for (const dir of mirrors) fs.copyFileSync(src, path.join(dir, file))
  }
  console.log(JSON.stringify({ ok, fail, codes: codes.length, mirrored: mirrors.length }))
  if (fail) process.exitCode = 1
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
