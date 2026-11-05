'use strict'
// 小程序主包/分包体积统计（按微信上传口径）
// 用法：node tools/check-miniprogram-package-size.cjs [--limit 2048]
// 说明：
// 1. 分包划分严格按 app.json 的 subPackages / subpackages 的 root；
// 2. 「上传口径」会扣除 project.config.json 的 packOptions.ignore（file / folder / suffix / prefix），
//    与微信开发者工具上报的 main package source size 对齐，不能只看磁盘字节；
// 3. 同时校验主包页面不得位于分包根目录内、分包页面不得登记在主包 pages 里。

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..', 'miniprogram')
const PROJECT = path.resolve(__dirname, '..', 'project.config.json')
const args = process.argv.slice(2)
const limitIndex = args.indexOf('--limit')
const LIMIT_KB = limitIndex >= 0 ? Number(args[limitIndex + 1]) : 2048

const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'))
const projectConfig = fs.existsSync(PROJECT) ? JSON.parse(fs.readFileSync(PROJECT, 'utf8')) : {}
const ignoreRules = ((projectConfig.packOptions || {}).ignore || []).map(item => ({
  type: String(item.type || 'file'),
  value: String(item.value || '').replace(/^\/+/, '')
}))
const mainPages = (app.pages || []).map(item => String(item || ''))

const subPackages = (app.subPackages || app.subpackages || []).map(item => ({
  root: String(item.root || '').replace(/^\/+|\/+$/g, ''),
  pages: (item.pages || []).map(page => String(page || ''))
}))

function packageOf (rel) {
  const hit = subPackages.find(item => rel === item.root || rel.startsWith(item.root + '/'))
  return hit ? hit.root : 'main'
}

// packOptions.ignore 的 value 相对 miniprogramRoot
function ignored (rel) {
  for (const rule of ignoreRules) {
    if (rule.type === 'file' && rel === rule.value) return rule
    if (rule.type === 'folder' && (rel === rule.value || rel.startsWith(rule.value + '/'))) return rule
    if (rule.type === 'suffix' && rule.value && rel.endsWith(rule.value)) return rule
    if (rule.type === 'prefix' && rule.value && rel.startsWith(rule.value)) return rule
    if (rule.type === 'glob') {
      const pattern = rule.value
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '\u0000')
        .replace(/\*/g, '[^/]*')
        .replace(/\u0000/g, '.*')
        .replace(/\?/g, '.')
      if (new RegExp('^' + pattern + '$').test(rel)) return rule
    }
  }
  return null
}

const files = []
function walk (dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    const rel = path.relative(ROOT, full).split(path.sep).join('/')
    if (entry.isDirectory()) {
      walk(full)
      continue
    }
    if (/\.(map)$/.test(rel)) continue
    const rule = ignored(rel)
    files.push({ rel, pkg: packageOf(rel), size: fs.statSync(full).size, ignoredBy: rule })
  }
}
walk(ROOT)

const totals = new Map()
for (const file of files) {
  const item = totals.get(file.pkg) || { files: 0, bytes: 0, rawFiles: 0, rawBytes: 0, ignoredBytes: 0, ignoredFiles: 0 }
  item.rawFiles += 1
  item.rawBytes += file.size
  if (file.ignoredBy) {
    item.ignoredFiles += 1
    item.ignoredBytes += file.size
    continue
  }
  item.files += 1
  item.bytes += file.size
  totals.set(file.pkg, item)
}

const kb = value => (value / 1024).toFixed(1)
const ordered = [...totals.entries()].sort((a, b) => b[1].bytes - a[1].bytes)
console.log('包                  上传口径      原始      文件数    忽略')
for (const [pkg, item] of ordered) {
  const over = pkg === 'main' && item.bytes / 1024 > LIMIT_KB
  console.log(`${pkg.padEnd(20)} ${kb(item.bytes).padStart(9)} KB ${kb(item.rawBytes).padStart(9)} KB ${String(item.files).padStart(6)}  ${String(item.ignoredFiles).padStart(4)} 个 ${kb(item.ignoredBytes).padStart(8)} KB${over ? '   超出上限 ' + LIMIT_KB + ' KB' : ''}`)
}

const main = totals.get('main') || { bytes: 0, rawBytes: 0 }
console.log(`\n主包上传口径 ${kb(main.bytes)} KB / 上限 ${LIMIT_KB} KB，余量 ${kb(LIMIT_KB * 1024 - main.bytes)} KB（原始 ${kb(main.rawBytes)} KB）`)

const top = files
  .filter(file => file.pkg === 'main' && !file.ignoredBy)
  .sort((a, b) => b.size - a.size)
  .slice(0, 15)
console.log('\n主包最大的 15 个文件（上传口径）：')
for (const file of top) console.log(`${kb(file.size).padStart(9)} KB  ${file.rel}`)

// 分包归属校验：主包页面不能落在分包根目录内，分包页面不能被登记为主包页面
const problems = []
for (const page of mainPages) {
  const hit = subPackages.find(item => page === item.root || page.startsWith(item.root + '/'))
  if (hit) problems.push(`主包页面位于分包根目录 ${hit.root} 内：${page}`)
}
for (const item of subPackages) {
  for (const page of item.pages) {
    const full = item.root + '/' + page
    if (mainPages.includes(full)) problems.push(`分包页面仍登记为主包页面：${full}`)
    const missing = ['.js', '.wxml', '.json'].filter(ext => !fs.existsSync(path.join(ROOT, full + ext)))
    if (missing.length) problems.push(`分包页面缺少文件（${missing.join(' ')}）：${full}`)
  }
}
for (const page of mainPages) {
  const missing = ['.js', '.wxml', '.json'].filter(ext => !fs.existsSync(path.join(ROOT, page + ext)))
  if (missing.length) problems.push(`主包页面缺少文件（${missing.join(' ')}）：${page}`)
}
// 页面文件忽略校验：.js/.json/.wxml/.wxss 只忽略其中一部分时，开发者工具会把残留文件当成页面并报
// 「WXML file not found」，必须整页忽略或整页保留
const pageExts = ['.js', '.json', '.wxml', '.wxss']
const pageGroups = new Map()
for (const file of files) {
  const ext = path.posix.extname(file.rel)
  if (!pageExts.includes(ext)) continue
  const base = file.rel.slice(0, -ext.length)
  const group = pageGroups.get(base) || { exts: [], ignored: [] }
  group.exts.push(ext)
  if (file.ignoredBy) group.ignored.push(ext)
  pageGroups.set(base, group)
}
for (const [base, group] of pageGroups) {
  if (!group.ignored.length || group.ignored.length === group.exts.length) continue
  problems.push(`页面文件只忽略了一部分（留下 ${group.exts.filter(ext => !group.ignored.includes(ext)).join(' ')}）：${base}`)
}

if (problems.length) {
  console.log('\n分包归属校验未通过：')
  for (const line of problems) console.log(' - ' + line)
  process.exitCode = 1
} else {
  console.log('\n分包归属校验通过：主包页面均不在分包根目录内，分包页面文件齐全。')
}
if (main.bytes / 1024 > LIMIT_KB) process.exitCode = 1
