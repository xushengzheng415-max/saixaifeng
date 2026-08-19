#!/usr/bin/env node
/*
 * 全链路 UI 台账静态门禁：不替代真实登录、按钮点击和截图叠比，
 * 但保证每个画板节点均有已批准素材、正式路由和可追溯验收记录。
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const root = path.resolve(__dirname, '..')
const inventory = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'ui-delivery-inventory.js'), '--json'], { encoding: 'utf8' }))
const failures = []
const warnings = []
const strictVisual = process.argv.includes('--strict-visual')
const VISUAL_PENDING_PATTERN = /visual-(?:capture|review)-pending/
const routerSource = fs.readFileSync(path.join(root, 'web-admin-vue', 'src', 'router', 'index.js'), 'utf8')
const vueRoutes = [...routerSource.matchAll(/\bpath\s*:\s*['"]([^'"]+)['"]/g)].map(match => match[1])

function normalizeMiniRoute(route) {
  return String(route || '')
    .split('?')[0]
    .split(' (')[0]
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}

function readRegisteredMiniRoutes() {
  const app = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram', 'app.json'), 'utf8'))
  const routes = new Set((app.pages || []).map(normalizeMiniRoute))
  for (const subpackage of app.subpackages || []) {
    for (const page of subpackage.pages || []) {
      routes.add(normalizeMiniRoute(`${subpackage.root}/${page}`))
    }
  }
  return routes
}

function collectMiniRouteReferences(directory, result = []) {
  if (!fs.existsSync(directory)) return result
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) collectMiniRouteReferences(fullPath, result)
    else if (/\.(js|wxml|json)$/.test(entry.name)) result.push(fullPath)
  }
  return result
}

function auditRegisteredMiniRoutes() {
  const registered = readRegisteredMiniRoutes()
  const roots = [
    path.join(root, 'miniprogram', 'pages'),
    path.join(root, 'miniprogram', 'utils'),
    path.join(root, 'cloudfunctions')
  ]
  const missing = new Map()
  for (const file of roots.flatMap(directory => collectMiniRouteReferences(directory))) {
    const source = fs.readFileSync(file, 'utf8')
    for (const match of source.matchAll(/[\x27\x22\x60]\/(pages\/[^\x27\x22\x60\s?\\]+)/g)) {
      const route = normalizeMiniRoute(match[1])
      if (!route || registered.has(route) || route.startsWith('packageA/')) continue
      if (!missing.has(route)) missing.set(route, [])
      missing.get(route).push(path.relative(root, file).replaceAll('\\', '/'))
    }
  }
  for (const [route, files] of missing) {
    failures.push(`小程序引用路由未在 app.json 登记：/${route}（${files.join('、')}）`)
  }
  return { registered: registered.size, missing: missing.size }
}

function auditRegisteredMiniPageFiles() {
  const app = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram', 'app.json'), 'utf8'))
  const pages = (app.pages || []).map(normalizeMiniRoute)
  for (const subpackage of app.subpackages || []) {
    for (const page of subpackage.pages || []) pages.push(normalizeMiniRoute(`${subpackage.root}/${page}`))
  }
  let gaps = 0
  for (const page of pages) {
    for (const extension of ['.js', '.wxml']) {
      if (fs.existsSync(path.join(root, 'miniprogram', `${page}${extension}`))) continue
      gaps += 1
      failures.push(`app.json 已登记页面缺少正式文件：/${page}${extension}`)
    }
  }
  return gaps
}

const legacyMissingMiniFunctions = new Map([
  ['generatePDF', 'miniprogram/pages/match/share/share.js is a legacy page outside the 162-node approved board']
])

function auditMiniCloudFunctionReferences() {
  const functionRoot = path.join(root, 'cloudfunctions')
  const availableFunctions = new Set(
    fs.readdirSync(functionRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && fs.existsSync(path.join(functionRoot, entry.name, 'index.js')))
      .map(entry => entry.name)
  )
  const references = new Map()
  const sourceFiles = collectMiniRouteReferences(path.join(root, 'miniprogram'))
    .filter(file => file.endsWith('.js'))
  for (const file of sourceFiles) {
    const source = fs.readFileSync(file, 'utf8')
    for (const call of source.matchAll(/(?:wx\.cloud\.|cloud\.)callFunction\s*\(\s*\{([\s\S]*?)\}\s*\)/g)) {
      const name = call[1].match(/\bname\s*:\s*['"`]([^'"`]+)['"`]/)?.[1]
      if (!name || availableFunctions.has(name)) continue
      if (!references.has(name)) references.set(name, [])
      references.get(name).push(path.relative(root, file).replaceAll('\\', '/'))
    }
  }
  for (const [name, files] of references) {
    const legacyReason = legacyMissingMiniFunctions.get(name)
    if (legacyReason) {
      warnings.push(`legacy cloud-function reference: ${name} (${legacyReason})`)
      continue
    }
    failures.push(`小程序调用了不存在的云函数：${name} (${files.join(', ')})`)
  }
  return { missing: references.size, warnings: warnings.length }
}

function auditMiniVisualQaGates() {
  const unsafe = []
  for (const file of collectMiniRouteReferences(path.join(root, 'miniprogram')).filter(file => file.endsWith('.js'))) {
    if (!file.replaceAll('\\', '/').includes('/miniprogram/pages/')) continue
    const source = fs.readFileSync(file, 'utf8')
    if (!source.includes('visualQa') && !source.includes('loadVisualFixture')) continue
    const hasDevtoolsGate = source.includes('workspace.isVisualQaEnabled') || source.includes('isDevtools()') || source.includes('function isDevtools')
    if (!hasDevtoolsGate) unsafe.push(path.relative(root, file).replaceAll('\\', '/'))
  }
  for (const file of unsafe) failures.push(`小程序视觉样例缺少开发者工具门禁：${file}`)
  return { unsafe: unsafe.length }
}

function fail(node, message) {
  failures.push(`${node.nodeId} · ${node.label || '未命名节点'}：${message}`)
}

function miniPageExists(route) {
  const normalized = route.split('（')[0].split(' (')[0].split('?')[0].trim()
  const relative = normalized.replace(/^\//, '')
  return fs.existsSync(path.join(root, 'miniprogram', `${relative}.js`))
}

function sameVueRoute(expected, actual) {
  const expectedParts = expected.replace(/\/+$/, '').split('/').filter(Boolean)
  const actualParts = actual.replace(/\/+$/, '').split('/').filter(Boolean)
  if (expectedParts.length !== actualParts.length) return false
  return expectedParts.every((part, index) => part === actualParts[index] || (part.startsWith(':') && actualParts[index].startsWith(':')))
}

function adminRouteExists(route) {
  const withoutPrefix = route.replace(/^\/admin\/#?/, '')
  const normalized = `/${withoutPrefix.split('（')[0].split(' (')[0].split('?')[0].replace(/^\/+/, '').trim()}`
  if (normalized === '/' || normalized === '') return true
  return vueRoutes.some(actual => actual.startsWith('/') && sameVueRoute(normalized, actual))
}

function routeTargetExists(route, nodeType) {
  if ((route.includes('→') || route.includes('服务号 OAuth')) && (nodeType === 'service' || nodeType === 'referee')) {
    return fs.existsSync(path.join(root, 'service-account-h5', 'app.js'))
  }
  if (route.startsWith('/pages/')) return miniPageExists(route)
  if (route.startsWith('/service-account-h5/')) return fs.existsSync(path.join(root, 'service-account-h5', 'app.js'))
  if (route.startsWith('/admin/')) return adminRouteExists(route)
  if (route === '/' || route.startsWith('/?') || route.includes('index.html')) return fs.existsSync(path.join(root, 'index.html'))
  return false
}

for (const node of inventory.nodes) {
  if (node.assetStatus !== 'approved') fail(node, `素材包状态为 ${node.assetStatus}`)
  if (!node.formalRoute) fail(node, '缺少正式路由')
  else if (!routeTargetExists(node.formalRoute, node.type)) fail(node, `路由目标不存在：${node.formalRoute}`)
  for (const [name, value] of [['button-destination', node.buttonDestination], ['flow-transition', node.flowTransition], ['build-verification', node.build]]) {
    if (!value || value === 'pending') fail(node, `缺少 ${name} 证据`)
  }
  if (!node.visual || node.visual === 'pending') fail(node, '缺少视觉验收状态')
  if (strictVisual && VISUAL_PENDING_PATTERN.test(String(node.visual))) fail(node, '缺少目标视口截图叠比证据')
}

const miniRouteAudit = auditRegisteredMiniRoutes()
const miniPageFileGaps = auditRegisteredMiniPageFiles()
const miniFunctionAudit = auditMiniCloudFunctionReferences()
const miniVisualQaAudit = auditMiniVisualQaGates()
const visualPending = inventory.nodes.filter(node => VISUAL_PENDING_PATTERN.test(String(node.visual))).length
console.log(`节点：${inventory.nodes.length}`)
console.log(`素材包已批准：${inventory.nodes.filter(node => node.assetStatus === 'approved').length}`)
console.log(`正式路由：${inventory.nodes.filter(node => node.formalRoute).length}`)
console.log(`小程序已登记路由：${miniRouteAudit.registered}`)
console.log(`小程序缺失路由：${miniRouteAudit.missing}`)
console.log(`小程序页面文件缺口：${miniPageFileGaps}`)
console.log(`小程序云函数引用缺口：${miniFunctionAudit.missing}（历史例外警告：${miniFunctionAudit.warnings}）`)
console.log(`小程序视觉样例门禁缺口：${miniVisualQaAudit.unsafe}`)
console.log(`视觉截图待执行：${visualPending}`)
for (const warning of warnings) console.warn(`- ${warning}`)
if (failures.length) {
  console.error(`静态门禁失败：${failures.length}`)
  for (const line of failures) console.error(`- ${line}`)
  process.exit(1)
}
console.log(strictVisual ? '全量 UI 交付门禁通过（含 visual-1:1）' : '静态 UI 交付门禁通过（不代表 visual-1:1 已完成）')
