'use strict'
// 微信支付结果识别自检：把 service-account-h5/service-personal.js 里的 invokeWechatPay 抽出来，
// 用假的 WeixinJSBridge 回调各种 err_msg，确认「支付成功」不会被判成失败。
// 背景（2026-10-30 真实支付事故）：微信 JSAPI 的 err_msg 在不同客户端/文档里写成
// get_brand_wcpay_request:ok 或 getBrandWCPayRequest:ok，旧代码只认后者，
// 于是用户已经扣款却看到「支付未完成，请重新发起」。
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const SOURCE = path.join(__dirname, '..', 'service-account-h5', 'service-personal.js')
const source = fs.readFileSync(SOURCE, 'utf8')
const start = source.indexOf(' function invokeWechatPay(pay){')
const end = source.indexOf(' function pollHoneyOrder(')
assert.ok(start > 0 && end > start, '未能定位 invokeWechatPay，脚本结构可能已变化，请更新自检切片标记')
const block = source.slice(start, end)

const FACTORY = `
 var honeyReasonText = function(code){ return 'REASON:' + code }
 var document = stubDocument
 var WeixinJSBridge = stubBridge
 ${block}
 return invokeWechatPay
`

function build(options) {
  const opts = options || {}
  const sandbox = {
    stubBridge: opts.bridge === undefined ? undefined : opts.bridge,
    stubDocument: opts.document === undefined ? {} : opts.document
  }
  return new Function('sandbox', 'with (sandbox) { return (function(){' + FACTORY + '})() }')(sandbox)
}

const DEFAULT_PAY = { appId: 'wx', timeStamp: '1', nonceStr: 'n', package: 'prepay_id=1', signType: 'RSA', paySign: 's' }

function invoke(options, pay) {
  const fn = build(options)
  return fn(pay || DEFAULT_PAY)
}

function bridgeReturning(errMsg) {
  return { invoke: (name, params, callback) => callback({ err_msg: errMsg }) }
}

let failures = 0
let checks = 0
async function test(name, fn) {
  checks += 1
  try { await fn() } catch (error) {
    failures += 1
    console.error('[失败] ' + name)
    console.error('       ' + String((error && error.message) || error))
  }
}

;(async () => {
  // 两种写法的成功都必须认成 ok，否则会误伤已扣款的用户
  await test('官方写法 get_brand_wcpay_request:ok 识别为成功', async () => {
    assert.equal(await invoke({ bridge: bridgeReturning('get_brand_wcpay_request:ok') }), 'ok')
  })
  await test('驼峰写法 getBrandWCPayRequest:ok 识别为成功', async () => {
    assert.equal(await invoke({ bridge: bridgeReturning('getBrandWCPayRequest:ok') }), 'ok')
  })
  await test('大小写混写依然识别为成功', async () => {
    assert.equal(await invoke({ bridge: bridgeReturning('GET_BRAND_WCPAY_REQUEST:OK') }), 'ok')
  })

  // 取消只做取消，不提示失败
  await test('两种取消写法都识别为 cancel', async () => {
    assert.equal(await invoke({ bridge: bridgeReturning('get_brand_wcpay_request:cancel') }), 'cancel')
    assert.equal(await invoke({ bridge: bridgeReturning('getBrandWCPayRequest:cancel') }), 'cancel')
  })

  // 真正失败/无法识别的一律交给服务端查单，不能直接判定支付失败
  await test('fail 与空结果都归为 unknown（交给服务端查单）', async () => {
    assert.equal(await invoke({ bridge: bridgeReturning('get_brand_wcpay_request:fail') }), 'unknown')
    assert.equal(await invoke({ bridge: bridgeReturning('') }), 'unknown')
    assert.equal(await invoke({ bridge: { invoke: (name, params, callback) => callback(undefined) } }), 'unknown')
  })
  await test('调用抛错也归为 unknown，不提示用户重新支付', async () => {
    const bridge = { invoke: () => { throw new Error('boom') } }
    assert.equal(await invoke({ bridge }), 'unknown')
  })

  // 参数缺失与微信未就绪属于「根本没发起支付」，仍按错误处理
  await test('缺少 package 时按参数异常拒绝，不创建成功结论', async () => {
    await assert.rejects(() => invoke({ bridge: bridgeReturning('get_brand_wcpay_request:ok') }, { appId: 'wx' }), /支付参数异常/)
  })
  await test('微信未就绪时给出可重开本页的说明', async () => {
    await assert.rejects(() => invoke({ bridge: undefined, document: {} }), /REASON:WECHAT_NOT_READY/)
  })

  // 页面不得再出现旧文案「请重新发起」，避免让已扣款用户重复支付
  await test('页面不再提示「支付未完成，请重新发起」', () => {
    assert.ok(!source.includes('支付未完成，请重新发起'), '旧文案会让已扣款的用户重复支付')
    assert.ok(source.includes('如已扣款不会重复扣费'), '待确认时必须告知不会重复扣费')
    // 服务端查单失败时必须把原因说出来，不能只显示一句「待确认」让用户以为点了没反应
    assert.ok(source.includes('function payQueryHint('), '需要统一的支付查单提示函数')
    assert.ok(source.includes("r.queryError"), '轮询与手动刷新都要读取服务端回传的查单原因')
    const meHtml = fs.readFileSync(path.join(__dirname, '..', 'service-account-h5', 'me.html'), 'utf8')
    assert.ok(/service-personal\.js\?v=20261030-payresult/.test(meHtml), '资源版本需更新以避开旧脚本缓存')
  })

  if (failures) {
    console.error('\n微信支付结果识别自检失败：' + failures + ' / ' + checks + ' 项未通过')
    process.exitCode = 1
  } else {
    console.log('微信支付结果识别自检全部通过：' + checks + ' 项（成功 / 取消 / 待核实 / 未就绪 / 旧文案）')
  }
})()
