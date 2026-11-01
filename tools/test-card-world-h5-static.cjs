'use strict'
// 阶段 2 静态验收：H5 只能读卡/换装/设主卡，不得出现签约、组阵、对战或任何价格/支付/充值入口。
const assert = require('assert')
const fs = require('fs')
const path = require('path')

const dir = path.resolve(__dirname, '..', 'service-account-h5', 'card-world')
const files = []
function walk(folder) {
  for (const name of fs.readdirSync(folder)) {
    const full = path.join(folder, name)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) walk(full)
    else if (/\.(html|js|css)$/.test(name)) files.push(full)
  }
}
walk(dir)
assert.ok(files.length >= 4, 'H5 目录应包含 html/js/css')

const all = files.map(file => fs.readFileSync(file, 'utf8')).join('\n')
const api = fs.readFileSync(path.join(dir, 'js', 'api.js'), 'utf8')
const app = fs.readFileSync(path.join(dir, 'js', 'app.js'), 'utf8')
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8')

const forbiddenActions = [
  'servicePrivateMembershipSubscribe', 'servicePrivateHoneyRecharge', 'servicePrivateHoneyOrders',
  'servicePrivateInsurancePurchaseClick', 'cardWorldSignSameCity', 'cardWorldLineup',
  'cardWorldBattle', 'cardWorldSaveLineup', 'cardWorldSetSlot', 'cardWorldSetRosterSize'
]
for (const action of forbiddenActions) {
  assert.ok(!all.includes(action), 'H5 不得调用玩法/交易接口: ' + action)
}

const forbiddenCode = ['wx.requestPayment', 'payParams', 'priceCents', 'outTradeNo']
for (const token of forbiddenCode) {
  assert.ok(!all.includes(token), 'H5 不得出现支付实现: ' + token)
}
const forbiddenMarkup = ['¥', '立即支付', '去支付', '充值', '开通会员', '续费']
for (const token of forbiddenMarkup) {
  assert.ok(!html.includes(token), 'H5 页面不得出现价格或支付入口: ' + token)
}
assert.ok(!/<button[^>]*>[^<]*(购买|续费|开通会员)/.test(html), 'H5 不得出现购买/续费按钮')

const requiredActions = [
  'cardWorldMainCard', 'cardWorldSetMainCard', 'listMyPlayerCards', 'getMyPlayerCard',
  'previewMyPlayerCard', 'saveMyPlayerCard', 'servicePrivateMembershipStatus', 'servicePrivateJsSdkConfig'
]
for (const action of requiredActions) {
  assert.ok(all.includes(action), '缺少 H5 必需接口: ' + action)
}

assert.ok(api.includes("var KEY = 'sxf_referee_h5_session'"), '必须复用现有服务号会话，不新增平行登录态')
assert.ok(!/sessionStorage\.setItem|localStorage\.setItem\(['"](?!sxf_referee_h5_session)/.test(api), '不得新增其他登录态存储')
assert.ok(html.includes('wx-open-launch-weapp'), '底部应接入足球世界小程序')
assert.ok(html.includes('path="pages/card/main/main"'), '小程序入口页应为 pages/card/main/main')
assert.ok(html.includes('library-empty') && html.includes('hero-placeholder'), '无卡时必须有空态')
assert.ok(html.includes('settings-mask') && html.includes('crop-zoom') && html.includes('background-list'), '必须有背景切换与构图设置')
assert.ok(html.includes('hero-glare') && html.includes('hero-hint'), '主卡必须有高光层与手势提示')
assert.ok(app.includes('setupHolo') && app.includes('pointermove') && app.includes("setProperty('--rx'"), '主卡必须有触摸倾斜与流光跟随')

console.log('PASS test-card-world-h5-static: 无交易/玩法入口、复用服务号会话、小程序入口、空态与换装设置齐备')
