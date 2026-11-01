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
  'previewMyPlayerCard', 'saveMyPlayerCard', 'servicePrivateMembershipStatus', 'servicePrivateJsSdkConfig',
  'getMyPreloadedPlayerCard', 'previewMyPreloadedPlayerCard', 'saveMyPreloadedPlayerCard', 'selectMyPlayerCard'
]
for (const action of requiredActions) {
  assert.ok(all.includes(action), '缺少 H5 必需接口: ' + action)
}

assert.ok(api.includes("var KEY = 'sxf_referee_h5_session'"), '必须复用现有服务号会话，不新增平行登录态')
assert.ok(!/sessionStorage\.setItem|localStorage\.setItem\(['"](?!sxf_referee_h5_session)/.test(api), '不得新增其他登录态存储')
assert.ok(html.includes('wx-open-launch-weapp'), '底部应接入足球世界小程序')
assert.ok(html.includes('path="pages/card/main/main"'), '小程序入口页应为 pages/card/main/main')
assert.ok(html.includes('library-empty') && html.includes('hero-placeholder'), '无卡时必须有空态')
assert.ok(html.includes('id="field-background"') && html.includes('id="field-photo"'), '卡面设置必须拆成「卡面背景」「球员照片」两项')
assert.ok(html.includes('卡面背景') && html.includes('球员照片'), '两项必须有明确标题')
assert.ok(html.includes('background-list') && html.includes('crop-zoom'), '必须有背景选择与照片构图设置')
assert.ok(html.includes('background-empty') && html.includes('暂无可用的卡面背景'), '没有可用背景时必须显示明确空态')
assert.ok(html.includes('background-error') && html.includes('btn-retry-backgrounds'), '背景读取失败时必须提供重试')
assert.ok(html.includes('btn-reload-backgrounds'), '背景区必须提供重新加载入口')
assert.ok(app.includes('bg-option__thumb') && app.includes('backgroundUrl'), '背景必须使用后台已发布缩略图')
assert.ok(app.includes('当前使用') && app.includes('可选') && app.includes('未解锁'), '背景必须标明当前使用/可选/未解锁')
assert.ok(app.includes('preloadedCards') && app.includes('skinOptions'), '赛季与限定皮肤必须按已拥有卡库数据展示')
assert.ok(app.includes('previewPreloadedCard') && app.includes('savePreloadedCard') && app.includes('selectCard'), '皮肤背景必须走预览/保存/装备同一链路')
assert.ok(app.includes('loadError') && app.includes('retrySettings'), '背景读取失败必须保留弹层并提供重试')
assert.ok(html.includes('holo-card__shine') && html.includes('holo-card__glare') && html.includes('hero-hint'), '主卡必须有星云箔光层与手势提示')
assert.ok(html.includes('css/holo-cosmos.css'), '必须复用原型星云箔光样式')
assert.ok(app.includes('syncHolo') && app.includes('HoloCosmos.bindCard') && app.includes('HoloCosmos.showcase'), '主卡必须绑定原型箔光与入场扫光')

console.log('PASS test-card-world-h5-static: 无交易/玩法入口、复用服务号会话、小程序入口、空态与换装设置齐备')
