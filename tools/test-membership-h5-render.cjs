'use strict'
// 会员中心 H5 渲染离线自检：不启浏览器，只把 service-personal.js 里的会员预览数据与
// 会员卡/会员中心两段渲染函数抽出来，注入最小桩后直接核对生成的 HTML。
// 目的：在没有真实微信与真实后端的条件下，确认档位价、首月/续费文案、当前档位、置灰、
// iOS 与「不可购买」文案、权益清单都能按服务端字段正确显示（样式仍以真机为准）。
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const SOURCE = path.join(__dirname, '..', 'service-account-h5', 'service-personal.js')
const source = fs.readFileSync(SOURCE, 'utf8')

const mockStart = source.indexOf(' // 会员本地预览')
const mockEnd = source.indexOf(' function mockResponse(p){')
const blockStart = source.indexOf(' // ============ 会员（一期 A')
const blockEnd = source.indexOf(' function homeAction(action){')
;[['会员预览数据块', mockStart, mockEnd], ['会员渲染块', blockStart, blockEnd]].forEach(([name, start, end]) => {
  assert.ok(start > 0 && end > start, '未能定位 ' + name + '，脚本结构可能已变化，请更新自检切片标记')
})
const selected = source.slice(mockStart, mockEnd) + '\n' + source.slice(blockStart, blockEnd)

const runner = new Function(`
 var state = { memberBusy: false };
 var homeAccount = null;
 var location = { search: '?mock=1' };
 var modalHtml = '', toastText = '';
 function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
 function yuanText(cents){var n=Number(cents)/100;return Number.isFinite(n)?(n%1===0?String(n):n.toFixed(2)):'—'}
 function isIosClient(){return iosFlag}
 function modal(title, html){ modalHtml = html }
 function toast(message){ toastText = message }
 function api(){ return Promise.reject(new Error('自检不请求接口')) }
 function loadHomeAccount(){ return Promise.resolve(homeAccount) }
 function isWechatClient(){ return true }
 function invokeWechatPay(){ return Promise.resolve('cancel') }
 ${selected}
 return {
  homeMemberCard: homeMemberCard,
  membershipCenterHtml: membershipCenterHtml,
  mockMembershipCard: mockMembershipCard,
  mockMembershipStatus: mockMembershipStatus,
  mockMembershipOrders: mockMembershipOrders,
  setSearch: function(value){ location.search = value },
  setAccount: function(value){ homeAccount = value },
  setIos: function(value){ iosFlag = value }
 };
`)

function runWith(factorySource, options) {
  const sandbox = { iosFlag: Boolean(options && options.ios), require, console }
  const factory = new Function('sandbox', 'with (sandbox) { return (' + factorySource + ')() }')
  return factory(sandbox)
}

let failures = 0
let checks = 0
function test(name, fn) {
  checks += 1
  try { fn() } catch (error) {
    failures += 1
    console.error('[失败] ' + name)
    console.error('       ' + String((error && error.message) || error))
  }
}

// ---- 未开通：首月价、只展示三档、四类即将开放权益如实标注 ----
const opened = runWith(runner.toString(), { ios: false })
opened.setSearch('?mock=1')
opened.setAccount({ membership: opened.mockMembershipCard() })

test('未开通：首页会员卡展示首月起价与赠滴，不写死价格', () => {
  const html = opened.homeMemberCard()
  assert.ok(html.includes('开通会员 · 首月 9.90 元起'), '首页卡应显示服务端最低首月价')
  assert.ok(html.includes('每月赠 200 滴'))
  assert.ok(html.includes('定妆照折扣'))
  assert.ok(html.includes('data-action="membershipCenter"'), '会员卡点击进入会员中心')
})

test('未开通：会员中心显示三档可售、首月价与权益清单', () => {
  const html = opened.membershipCenterHtml(opened.mockMembershipStatus())
  assert.ok(html.includes('尚未开通会员'))
  assert.ok(html.includes('首次开通享首月价'))
  assert.ok(html.includes('data-price-cents="990"') && html.includes('data-price-cents="1990"') && html.includes('data-price-cents="3990"'), '按服务端首月价展示')
  assert.equal((html.match(/data-price-tier="first"/g) || []).length, 3, '未开通账号一律按首月价')
  assert.ok(!html.includes('家庭会员'), '家庭档 visible=false 不得出现在可售列表')
  assert.equal((html.match(/data-member-plan=/g) || []).length, 3)
  assert.ok(!/data-member-plan="[a-z]+" disabled/.test(html), '未开通时各档都可点击')
  assert.ok(html.includes('每期赠 200 滴'))
  assert.ok(html.includes('会员生效后享定妆照折扣'))
  assert.equal((html.match(/class="pending"/g) || []).length, 4, '四项未开放权益必须标「即将开放」')
  assert.ok(html.includes('会员不会自动续费'))
  assert.ok(html.includes('买蜂蜜（1 元 = 10 滴）'))
})

// ---- 已开通：当前档位标记、低档置灰、续费价 ----
const active = runWith(runner.toString(), { ios: false })
active.setSearch('?mock=1&member=active')
active.setAccount({ membership: active.mockMembershipCard() })

test('已开通：首页会员卡显示档位、剩余天数与到期日，明确不自动续费', () => {
  const html = active.homeMemberCard()
  assert.ok(html.includes('进阶会员 · 剩余 20 天'))
  assert.ok(html.includes('到期不自动续费'))
  assert.ok(html.includes('me-member-badge'))
  assert.ok(html.includes('./assets/membership/member-badge-96.png'), '会员标识徽章要显示在会员卡内')
})

test('已开通：当前档位标「续费」，低档置灰，价格一律用续费价', () => {
  const html = active.membershipCenterHtml(active.mockMembershipStatus())
  assert.ok(html.includes('进阶会员 · 剩余 20 天'))
  assert.ok(html.includes('每期赠 500 滴'))
  assert.ok(html.includes('定妆照享 9 折'))
  assert.ok(html.includes('class="me-member-plan current selected"') && html.includes('data-member-plan="plus"'), '当前档位需高亮并默认选中')
  assert.ok(/data-member-plan="basic"[^>]*disabled/.test(html), '低档必须置灰')
  assert.ok(html.includes('当前档位更高，暂不支持降档'))
  assert.ok(html.includes('data-price-cents="4990"'), '专业档按续费价展示')
  assert.equal((html.match(/data-price-tier="renew"/g) || []).length, 3, '已开通账号一律按续费价')
  assert.ok(!html.includes('data-price-tier="first"'), '已开通账号不再展示首月价')
  assert.ok(html.includes('./assets/membership/member-badge-96.png'), '已开通的会员中心头部要显示会员标识')
})

// ---- iOS：不展示可点击购买入口 ----
const ios = runWith(runner.toString(), { ios: true })
ios.setSearch('?mock=1')
test('iOS：只给说明，不渲染任何档位按钮', () => {
  const html = ios.membershipCenterHtml(ios.mockMembershipStatus())
  assert.ok(html.includes('iOS 暂不支持购买会员'))
  assert.ok(!html.includes('data-member-plan='), 'iOS 不得出现可点击档位')
})

// ---- 支付未就绪：如实说明原因，不创建订单 ----
test('不可购买：按服务端原因显示，且不渲染档位按钮', () => {
  const state = opened.mockMembershipStatus()
  state.purchaseEnabled = false
  state.reason = 'PAYMENT_NOT_CONFIGURED'
  const html = opened.membershipCenterHtml(state)
  assert.ok(html.includes('微信支付待开通'))
  assert.ok(html.includes('不会创建订单'))
  assert.ok(!html.includes('data-member-plan='))
})

// ---- 订单列表结构（只核对数据行渲染所需字段） ----
test('订单样例：已支付与待支付两种状态都带可核对字段', () => {
  const rows = opened.mockMembershipOrders()
  assert.equal(rows.length, 2)
  assert.equal(rows[0].statusLabel, '已支付')
  assert.equal(rows[1].status, 'pending')
  assert.ok(rows.every(row => row.outTradeNo.startsWith('MT') && row.grantDrops > 0 && row.priceCents > 0))
})

if (failures) {
  console.error('\n会员 H5 渲染自检失败：' + failures + ' / ' + checks + ' 项未通过')
  process.exitCode = 1
} else {
  console.log('会员 H5 渲染自检全部通过：' + checks + ' 项（未开通 / 已开通 / iOS / 不可购买 / 订单字段）')
}
