'use strict'
// 队徽链路改动涉及的三份 WXML 结构检查：
// 1. 标签配对；2. 只允许简单插值/取反/||；3. 事件处理器在对应 JS 中存在。
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const targets = [
  { name: 'quick-create-sheet', wxml: 'miniprogram/components/quick-create-sheet/index.wxml', js: 'miniprogram/components/quick-create-sheet/index.js' },
  { name: 'guide/team-info', wxml: 'miniprogram/pages/guide/team-info/team-info.wxml', js: 'miniprogram/pages/guide/team-info/team-info.js' },
  { name: 'onboarding', wxml: 'miniprogram/pages/onboarding/onboarding.wxml', js: 'miniprogram/pages/onboarding/onboarding.js' }
]

const VOID = new Set(['image', 'input', 'canvas', 'slider', 'icon', 'progress', 'switch', 'checkbox', 'radio', 'textarea', 'map', 'camera', 'live-player', 'live-pusher', 'open-data', 'web-view'])

function checkTags (name, source) {
  const stack = []
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g
  let match
  while ((match = tagRe.exec(source))) {
    const closing = match[0].startsWith('</')
    const tag = match[1]
    const selfClose = match[3] === '/'
    if (closing) {
      // 自闭合类标签（image/input/canvas…）写不写闭合标签都接受
      if (VOID.has(tag) && stack[stack.length - 1] !== tag) continue
      const open = stack.pop()
      assert.equal(open, tag, `${name}: </${tag}> 与 <${open}> 不配对`)
    } else if (!selfClose && !VOID.has(tag)) {
      stack.push(tag)
    }
  }
  assert.deepEqual(stack, [], `${name}: 存在未闭合标签 ${stack.join(',')}`)
}

function checkExpressions (name, source) {
  const expressions = source.match(/\{\{[^}]*\}\}/g) || []
  for (const expression of expressions) {
    const body = expression.slice(2, -2).trim()
    assert.ok(!/(===|!==|>=|<=|>|<|\?|\.\w+\s*\(|\[)/.test(body), `${name}: 违反 WXML 表达式限制 -> ${expression}`)
    assert.ok(!/\band\b|\bor\b/.test(body), `${name}: 只允许 || 连接 -> ${expression}`)
  }
}

function checkHandlers (name, source, script) {
  const handlers = new Set()
  const re = /\b(?:bind|catch)[a-z]*="([^"]+)"/g
  let match
  while ((match = re.exec(source))) handlers.add(match[1])
  for (const handler of handlers) {
    assert.ok(new RegExp('\\b' + handler + '\\s*:\\s*function').test(script), `${name}: 缺少事件处理器 ${handler}`)
  }
  return handlers.size
}

for (const target of targets) {
  const wxml = fs.readFileSync(path.resolve(__dirname, '..', target.wxml), 'utf8')
  const script = fs.readFileSync(path.resolve(__dirname, '..', target.js), 'utf8')
  checkTags(target.name, wxml)
  checkExpressions(target.name, wxml)
  const handlers = checkHandlers(target.name, wxml, script)
  console.log(`  ${target.name}: 标签配对、表达式限制、${handlers} 个事件处理器`)
}

// 三个入口必须统一走 utils/logo-cutout，不能再出现各自为政的抠图调用
for (const target of targets) {
  const script = fs.readFileSync(path.resolve(__dirname, '..', target.js), 'utf8')
  assert.ok(script.includes("require('../../utils/logo-cutout')") || script.includes("require('../../../utils/logo-cutout')"), `${target.name}: 未接入统一的队徽处理模块`)
  assert.ok(script.includes('logoCutout.process('), `${target.name}: 未调用统一裁剪/去背景`)
  assert.ok(script.includes('logoCutout.uploadCrest('), `${target.name}: 未上传原图与透明图`)
  assert.ok(!script.includes("name: 'imageProcess'"), `${target.name}: 不应再调用未配置密钥的 imageProcess 抠图`)
}
const sheetCanvas = fs.readFileSync(path.resolve(__dirname, '../miniprogram/components/quick-create-sheet/index.wxml'), 'utf8')
assert.ok(sheetCanvas.includes('type="2d" id="teamLogoCutout"'), '快速创建弹层需要声明隐藏的 Canvas 2D 节点')
assert.ok(sheetCanvas.includes('{{logoHintText}}'), '队徽状态需在 JS 预计算后渲染')

console.log('PASS: 三个入口统一走 logo-cutout（裁剪+去背景），WXML 结构与表达式合规')
