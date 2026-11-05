'use strict'
// 发现页城市定位（方案 B）：定位城市优先、球队资料城市兜底、失败静默回落
// 覆盖：resolveCity 云函数（入参校验/上游解析/key 不外泄/缓存）、utils/location 定位与缓存、
// discover.js 城市来源与同城重排、WXML/WXSS 约束。

const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const model = require('../miniprogram/pages/discover/discover-model')

const root = path.resolve(__dirname, '..')
const read = p => fs.readFileSync(path.resolve(root, p), 'utf8')

// ===== 1. resolveCity 云函数 =====
function makeHttps (reply, counter) {
  return {
    request: function (options, cb) {
      if (counter) counter.count += 1
      const listeners = {}
      const res = {
        setEncoding: function () {},
        on: function (ev, fn) { listeners[ev] = fn; return res }
      }
      const req = {
        on: function () { return req },
        destroy: function () {},
        end: function () {
          cb(res)
          if (listeners.data) listeners.data(JSON.stringify(reply))
          if (listeners.end) listeners.end()
        }
      }
      return req
    }
  }
}

function loadResolveCity (reply, env, counter) {
  const moduleObj = { exports: {} }
  const sandbox = {
    require: name => {
      if (name === 'https') return makeHttps(reply, counter)
      if (name === './city-centers') return require(path.resolve(root, 'cloudfunctions/resolveCity/city-centers.js'))
      return require(name)
    },
    module: moduleObj,
    exports: moduleObj.exports,
    process: { env: env || {} },
    console,
    Promise,
    Map,
    Number,
    String,
    Object,
    Boolean,
    isFinite,
    JSON,
    encodeURIComponent
  }
  vm.runInNewContext(read('cloudfunctions/resolveCity/index.js'), sandbox)
  return moduleObj.exports.main
}

async function testResolveCity () {
  // 无 key：走离线城市中心点表，不依赖第三方配额，也不该报错
  const noKey = loadResolveCity({}, {})
  const offline = await noKey({ latitude: 34.746, longitude: 113.625 })
  assert.equal(offline.success, true, '无 key 时用离线城市表给出城市')
  assert.equal(offline.city, '郑州市', '最近城市中心点判定')
  assert.equal(offline.source, 'offline')
  assert(offline.distanceKm < 20, '离线结果带回距离，便于排查精度')
  assert(!JSON.stringify(offline).includes('tencent-lbs'), '离线结果不冒充在线来源')
  assert.equal((await noKey({ latitude: 34.7 })).code, 'BAD_LOCATION', '坐标缺失拒绝')
  assert.equal((await noKey({ latitude: 120, longitude: 113.6 })).code, 'BAD_LOCATION', '超范围坐标拒绝')
  assert.equal((await noKey({ lat: 0, lng: 0 })).code, 'BAD_LOCATION', '0,0 视为无效定位')
  assert.equal((await noKey({})).code, 'BAD_LOCATION')
  const abroad = await noKey({ latitude: 51.5, longitude: -0.12 })
  assert.equal(abroad.code, 'NO_CITY', '境外坐标超出覆盖范围，不硬猜国内城市')

  // 有 key + 上游正常：用在线结果（更精确）
  const counter = { count: 0 }
  const okMain = loadResolveCity({
    status: 0,
    result: { ad_info: { province: '河南省', city: '郑州市', district: '金水区', adcode: '410105' } }
  }, { TENCENT_LBS_KEY: 'fake-key-should-not-leak' }, counter)
  const first = await okMain({ latitude: 34.746, longitude: 113.625 })
  assert.equal(first.success, true)
  assert.equal(first.city, '郑州市', '按 ad_info.city 取城市')
  assert.equal(first.province, '河南省')
  assert.equal(first.district, '金水区')
  assert.equal(first.source, 'tencent-lbs')
  assert(!JSON.stringify(first).includes('fake-key-should-not-leak'), 'key 不能出现在返回体')
  assert.equal(counter.count, 1)
  const second = await okMain({ latitude: 34.7462, longitude: 113.6251 })
  assert.equal(second.city, '郑州市', '同网格坐标复用缓存')
  assert.equal(second.cached, true)
  assert.equal(counter.count, 1, '缓存命中不再打上游')

  const direct = loadResolveCity({
    status: 0,
    result: { ad_info: { province: '北京市', city: '', district: '朝阳区' } }
  }, { TENCENT_LBS_KEY: 'k2' })
  assert.equal((await direct({ latitude: 39.9, longitude: 116.4 })).city, '北京市', '直辖市 city 为空时用省份兜底')

  // 在线配额用尽 / 签名错误 / 没解析到城市：一律回落离线表，不让用户看到失败
  const quota = loadResolveCity({ status: 121, message: '此key每日调用量已达到上限' }, { TENCENT_LBS_KEY: 'k5' })
  const quotaResult = await quota({ latitude: 35.215, longitude: 113.242 })
  assert.equal(quotaResult.success, true, '配额用尽不影响同城排序')
  assert.equal(quotaResult.city, '焦作市', '回落离线最近城市')
  assert.equal(quotaResult.source, 'offline')
  assert.equal(quotaResult.degraded, true, '标记为降级结果')
  assert(quotaResult.upstreamMessage.includes('121'), '带回上游状态码便于排查')
  assert(!JSON.stringify(quotaResult).includes('k5'), '错误信息不得包含 key')
  const quotaAgain = await quota({ latitude: 35.2151, longitude: 113.2421 })
  assert.equal(quotaAgain.cached, true, '降级结果按短 TTL 缓存，避免反复打上游')

  const upstream = loadResolveCity({ status: 311, message: 'key格式错误' }, { TENCENT_LBS_KEY: 'k4' })
  const bad = await upstream({ latitude: 39.9, longitude: 116.4 })
  assert.equal(bad.success, true, '签名校验失败也回落离线结果')
  assert.equal(bad.city, '北京市')
  assert.equal(bad.degraded, true)
  assert(bad.upstreamMessage.includes('311'), '带回上游状态码便于排查，且不含 key')
  assert(!bad.upstreamMessage.includes('k4'), '错误信息不得包含 key')

  const emptyAd = loadResolveCity({ status: 0, result: { ad_info: { province: '', city: '', district: '' } } }, { TENCENT_LBS_KEY: 'k3' })
  const emptyResult = await emptyAd({ latitude: 34.746, longitude: 113.625 })
  assert.equal(emptyResult.city, '郑州市', '在线没解析到城市时用离线表，不编造省区')
  assert.equal(emptyResult.district, '')
  assert.equal(emptyResult.degraded, true)
  const emptyAbroad = await loadResolveCity({ status: 0, result: { ad_info: {} } }, { TENCENT_LBS_KEY: 'k6' })({ latitude: 51.5, longitude: -0.12 })
  assert.equal(emptyAbroad.success, false, '离线也覆盖不到时如实失败，由页面回落球队城市')
  assert.equal(emptyAbroad.code, 'NO_CITY')
}

// ===== 2. utils/location 定位与缓存 =====
function loadLocation (wx) {
  const moduleObj = { exports: {} }
  const sandbox = {
    wx,
    console,
    module: moduleObj,
    exports: moduleObj.exports,
    Promise,
    Date,
    String,
    Number,
    Object,
    Boolean,
    JSON,
    isFinite,
    setTimeout,
    clearTimeout
  }
  vm.runInNewContext(read('miniprogram/utils/location.js'), sandbox)
  return moduleObj.exports
}

function baseWx (overrides) {
  const store = {}
  const wx = Object.assign({
    getStorageSync: key => store[key] || '',
    setStorageSync: (key, value) => { store[key] = value },
    removeStorageSync: key => { delete store[key] },
    getSetting: opts => opts.success({ authSetting: { 'scope.userLocation': true } }),
    getPrivacySetting: opts => opts.success({ needAuthorization: false }),
    getFuzzyLocation: opts => {
      wx.calls.locate += 1
      opts.success({ latitude: 34.746, longitude: 113.625 })
    },
    cloud: {
      callFunction: args => {
        wx.calls.cloud += 1
        return Promise.resolve({ result: { success: true, city: '郑州市', province: '河南省', source: 'tencent-lbs' } })
      }
    },
    showToast: () => {},
    showModal: () => {}
  }, overrides || {})
  wx.calls = { locate: 0, cloud: 0 }
  wx._store = store
  return wx
}

async function testLocation () {
  // (a) 缓存命中：1 次定位都不发
  const cachedWx = baseWx({
    getStorageSync: key => (key === 'sxf_discover_city_v1' ? { city: '焦作市', province: '河南省', ts: Date.now() } : '')
  })
  const cached = loadLocation(cachedWx)
  const hit = await cached.locateCity()
  assert.equal(hit.ok, true)
  assert.equal(hit.city, '焦作市')
  assert.equal(hit.source, 'cache')
  assert.equal(cachedWx.calls.locate, 0, '缓存命中不请求定位')
  assert.equal(cachedWx.calls.cloud, 0, '缓存命中不调云函数')

  // (b) 过期缓存 → 重新定位
  const staleWx = baseWx({
    getStorageSync: key => (key === 'sxf_discover_city_v1' ? { city: '焦作市', ts: Date.now() - 30 * 3600 * 1000 } : '')
  })
  const stale = loadLocation(staleWx)
  const fresh = await stale.locateCity()
  assert.equal(fresh.city, '郑州市', '过期缓存走真实定位')
  assert.equal(staleWx.calls.locate, 1)
  assert.equal(staleWx._store['sxf_discover_city_v1'].city, '郑州市', '成功结果写入缓存')

  // (c) 授权被拒 → 明确失败，不调云函数
  const deniedWx = baseWx({
    getFuzzyLocation: opts => { deniedWx.calls.locate += 1; opts.fail({ errMsg: 'getFuzzyLocation:fail auth deny' }) }
  })
  const denied = loadLocation(deniedWx)
  const denyResult = await denied.locateCity()
  assert.equal(denyResult.ok, false)
  assert.equal(denyResult.reason, 'denied')
  assert.equal(deniedWx.calls.cloud, 0, '拒绝授权不再请求逆地理')

  // (d) 已经拒绝过授权时不再自动弹窗
  const deniedState = await denied.locateAuthState.call(null)
  assert.equal(deniedState, 'granted', '未设置 authSetting 时按已授权处理')
  const deniedSettingWx = baseWx({ getSetting: opts => opts.success({ authSetting: { 'scope.userLocation': false } }) })
  const deniedSetting = loadLocation(deniedSettingWx)
  assert.equal(await deniedSetting.locateAuthState(), 'denied', '用户拒绝过就不能自动请求')
  const unknownWx = baseWx({ getSetting: opts => opts.success({ authSetting: {} }) })
  assert.equal(await loadLocation(unknownWx).locateAuthState(), 'unknown')

  // (e) 隐私协议未同意 → privacy_denied，不弹阻断
  const privacyWx = baseWx({
    getPrivacySetting: opts => opts.success({ needAuthorization: true }),
    requirePrivacyAuthorize: opts => opts.fail({ errMsg: 'requirePrivacyAuthorize:fail' })
  })
  const privacy = loadLocation(privacyWx)
  const privacyResult = await privacy.locateCity()
  assert.equal(privacyResult.reason, 'privacy_denied')
  assert.equal(privacyWx.calls.locate, 0, '未同意隐私协议不调用定位')

  // (f) 云函数未部署 / 缺 key：失败码透传，由页面回落
  const keyMissingWx = baseWx({
    cloud: { callFunction: () => Promise.resolve({ result: { success: false, code: 'KEY_MISSING', message: '尚未配置' } }) }
  })
  const keyMissing = loadLocation(keyMissingWx)
  const noKeyResult = await keyMissing.locateCity()
  assert.equal(noKeyResult.ok, false)
  assert.equal(noKeyResult.reason, 'KEY_MISSING')
  assert.equal(keyMissingWx._store['sxf_discover_city_v1'], undefined, '失败结果不写缓存')

  const cloudFailWx = baseWx({ cloud: undefined })
  const cloudFail = loadLocation(cloudFailWx)
  assert.equal((await cloudFail.locateCity()).reason, 'cloud_unavailable')

  // (g) 没有模糊定位接口时明确 unsupported
  const noApiWx = baseWx({ getFuzzyLocation: undefined })
  const noApi = loadLocation(noApiWx)
  assert.equal(noApi.canLocate(), false)
  assert.equal((await noApi.locateCity()).reason, 'unsupported')

  // (h) force 忽略缓存
  const forceWx = baseWx({
    getStorageSync: key => (key === 'sxf_discover_city_v1' ? { city: '焦作市', ts: Date.now() } : '')
  })
  const forced = await loadLocation(forceWx).locateCity({ force: true })
  assert.equal(forced.city, '郑州市', 'force 时重新定位')
  assert.equal(forceWx.calls.locate, 1)

  // 原有地图选点入口仍导出，签名不变
  const picked = loadLocation(baseWx()).pickLocation
  assert.equal(typeof picked, 'function')
}

// ===== 3. discover.js 城市来源与同城重排 =====
function pageStub (locationStub) {
  let definition = null
  const sandbox = {
    Page: d => { definition = d },
    wx: { showToast: () => {}, showModal: () => {}, cloud: { callFunction: () => Promise.resolve({ result: {} }) } },
    console,
    require: name => {
      if (name === './discover-model') return model
      if (name === '../../utils/location') return locationStub
      return {}
    },
    Promise,
    setTimeout,
    clearTimeout
  }
  vm.runInNewContext(read('miniprogram/pages/discover/discover.js'), sandbox)
  const page = Object.assign({}, definition, { data: JSON.parse(JSON.stringify(definition.data)) })
  page.setData = function (patch, cb) { Object.assign(this.data, patch); if (cb) cb.call(this) }
  page.setTabState = function () {}
  return page
}

async function testDiscoverPage () {
  const calls = { locate: 0, resolve: 0 }
  const locationStub = {
    canLocate: () => true,
    locateAuthState: () => Promise.resolve('granted'),
    locateCity: () => { calls.locate += 1; return Promise.resolve({ ok: true, city: '郑州市', province: '河南省', source: 'tencent-lbs' }) }
  }
  const page = pageStub(locationStub)
  page._cityCache = { 'team-a': '开封市' }
  page.data.teamId = 'team-a'
  page._eventRows = [
    model.formatPublicEvent({ _id: 'a', city: '开封市', province: '河南省' }),
    model.formatPublicEvent({ _id: 'b', city: '郑州市', province: '河南省' })
  ]
  page.renderEvents()
  assert.equal(page.data.eventItems[0].id, 'a', '没有定位时先按球队资料城市（开封）排')

  calls.resolve = 0
  await page.requestCity(false)
  assert.equal(calls.locate, 1)
  assert.equal(page._locatedCity, '郑州市', '定位城市写入页面状态')
  assert.equal(page.data.cityText, '郑州市', '头部优先显示定位城市')
  assert.equal(page.data.cityFromGps, true)
  assert.equal(page.data.citySource, 'gps')
  assert.equal(page.data.eventItems[0].id, 'b', '按定位城市重新排序，同城排前面')
  assert.equal(page.data.eventItems[0].hasSameCityTag, true)
  assert.equal(page.citySortValue(), '郑州市', '排序值优先定位城市')

  // 清掉定位 → 回落球队资料城市，标记消失
  page._locatedCity = ''
  page.applyCityDisplay()
  assert.equal(page.data.cityText, '开封市', '定位缺失时回落到球队资料城市')
  assert.equal(page.data.cityFromGps, false)
  assert.equal(page.data.citySource, 'team')
  page.renderEvents()
  assert.equal(page.data.eventItems[0].id, 'a', '回落后按球队城市排序')

  // 双缺失 → 待定，不编造城市
  page._cityCache = {}
  page.data.teamId = ''
  page.applyCityDisplay()
  assert.equal(page.data.cityText, '城市待定')
  assert.equal(page.data.cityRegistered, false)
  assert.equal(page.data.citySource, 'none')

  // 已拒绝授权：自动流程直接跳过，不弹窗
  const deniedCalls = { locate: 0 }
  const deniedPage = pageStub({
    canLocate: () => true,
    locateAuthState: () => Promise.resolve('denied'),
    locateCity: () => { deniedCalls.locate += 1; return Promise.resolve({ ok: false, reason: 'denied' }) }
  })
  deniedPage.locateCityIfNeeded(false)
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(deniedCalls.locate, 0, '拒绝过授权不再自动请求定位')

  // 未开通接口：canLocate 为 false 时直接返回，不发请求、不做标记
  const noApiCalls = { locate: 0 }
  const noApiPage = pageStub({
    canLocate: () => false,
    locateAuthState: () => Promise.resolve('unknown'),
    locateCity: () => { noApiCalls.locate += 1; return Promise.resolve({ ok: false, reason: 'unsupported' }) }
  })
  noApiPage._locateDone = false
  noApiPage.locateCityIfNeeded(true)
  assert.equal(noApiCalls.locate, 0, '接口不可用时不发定位请求')
  assert.equal(noApiPage._locateDone, false, '接口不可用时不做无意义标记')
}

// ===== 4. WXML / WXSS / app.json 约束 =====
function testMarkup () {
  const wxml = read('miniprogram/pages/discover/discover.wxml')
  assert(wxml.includes('city-badge'), '头部有定位来源标记')
  assert(wxml.includes('cityFromGps'), '定位标记由 js 预计算')
  for (const match of wxml.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
    assert(!/[?\[\]()=<>]/.test(match[1]), 'WXML复杂表达式: ' + match[1])
  }
  const wxss = read('miniprogram/pages/discover/discover.wxss')
  assert(wxss.includes('.city-badge'), '定位小标有样式')
  const app = JSON.parse(read('miniprogram/app.json'))
  assert(app.requiredPrivateInfos.includes('getFuzzyLocation'), '模糊定位必须声明到 requiredPrivateInfos')
  assert(app.requiredPrivateInfos.includes('chooseLocation'), '原有地图选点声明不能丢')
  assert(app.permission['scope.userLocation'].desc.includes('同城赛事'), '位置授权说明要覆盖同城赛事用途')
}

async function main () {
  await testResolveCity()
  await testLocation()
  await testDiscoverPage()
  testMarkup()
  console.log('PASS: 逆地理云函数、定位与缓存、拒绝授权回落、同城重排、定位标记与声明约束')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
