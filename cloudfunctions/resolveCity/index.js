'use strict'

// 逆地理（经纬度 → 城市），发现页同城排序用
//
// 策略（2026-11-03 起）：
// 1. 主路径是**离线城市中心点表**（./city-centers.js，全国 318 个地级市）：取最近城市，
//    零 key、零配额、无外部依赖，毫秒级返回，且坐标不出云函数；
// 2. 配置了 TENCENT_LBS_KEY 时再尝试在线逆地理，能拿到更精确的省/区与边界判定；
//    在线失败（未分配配额、IP 未授权、网络异常）一律回落到离线结果并标记 degraded，
//    不把上游错误抛给小程序 —— 没有 key 或配额用尽也不影响同城排序；
// 3. 只返回城市级结论，不返回详细地址、不落库、不记录调用者身份；
// 4. key 只从环境变量读取，不写死、不打日志、不回传。

const https = require('https')
const centers = require('./city-centers')

const KEY_ENV = 'TENCENT_LBS_KEY'
const HOST = 'apis.map.qq.com'
const API_PATH = '/ws/geocoder/v1/'
const TIMEOUT_MS = 5000
// 最近城市距离超过该值视为境外/无人区，不硬猜城市（全国地级市中心点最远覆盖不会到这个量级）
const MAX_NEAREST_KM = 300
// 城市级结果按约 1km 网格复用；在线结果缓存 6 小时，降级结果 30 分钟后重试在线
const CACHE_MAX = 200
const CACHE_TTL_MS = 6 * 3600 * 1000
const DEGRADED_TTL_MS = 30 * 60 * 1000
const cityCache = new Map()

function text (value) {
  return value == null ? '' : String(value).trim()
}

function fail (code, message) {
  return { success: false, code: code, message: message }
}

function toNumber (value) {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  return isFinite(num) ? num : null
}

function readCoords (event) {
  const latitude = toNumber(event && (event.latitude !== undefined ? event.latitude : event.lat))
  const longitude = toNumber(event && (event.longitude !== undefined ? event.longitude : event.lng))
  if (latitude === null || longitude === null) return null
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null
  // 0,0 与国内业务无关，视为无效定位，不能当城市用
  if (latitude === 0 && longitude === 0) return null
  return { latitude: latitude, longitude: longitude }
}

function cacheKeyOf (coords) {
  return Math.round(coords.latitude * 100) / 100 + ',' + Math.round(coords.longitude * 100) / 100
}

function remember (key, value, ttl) {
  if (cityCache.size >= CACHE_MAX) cityCache.clear()
  cityCache.set(key, { value: value, expireAt: Date.now() + (ttl || CACHE_TTL_MS) })
}

function recall (key) {
  const entry = cityCache.get(key)
  if (!entry) return null
  if (entry.expireAt <= Date.now()) {
    cityCache.delete(key)
    return null
  }
  return entry.value
}

// Haversine 距离（km），城市级判定精度足够
function distanceKm (lat1, lng1, lat2, lng2) {
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLng = (lng2 - lng1) * rad
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)))
}

// 离线：取最近的城市中心点。只做城市级结论，不编造省份与区县。
function nearestCity (coords) {
  let best = null
  for (let i = 0; i < centers.length; i += 1) {
    const name = centers[i][0]
    const km = distanceKm(coords.latitude, coords.longitude, centers[i][1], centers[i][2])
    if (!best || km < best.distanceKm) best = { city: name, distanceKm: km }
  }
  if (!best || best.distanceKm > MAX_NEAREST_KM) return null
  return {
    success: true,
    city: best.city,
    province: '',
    district: '',
    adcode: '',
    source: 'offline',
    distanceKm: Math.round(best.distanceKm * 10) / 10
  }
}

// 上游地址：key 放在 query 里由腾讯位置服务校验，不拼进任何返回内容
function requestGeocoder (coords, key) {
  return new Promise(function (resolve, reject) {
    const query = 'location=' + coords.latitude + ',' + coords.longitude + '&key=' + encodeURIComponent(key) + '&get_poi=0'
    const req = https.request({
      host: HOST,
      path: API_PATH + '?' + query,
      method: 'GET',
      timeout: TIMEOUT_MS
    }, function (res) {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', function (chunk) { body += chunk })
      res.on('end', function () {
        try {
          resolve(JSON.parse(body))
        } catch (err) {
          reject(new Error('JSON_PARSE_FAILED'))
        }
      })
    })
    req.on('timeout', function () { req.destroy(new Error('UPSTREAM_TIMEOUT')) })
    req.on('error', function (err) { reject(err) })
    req.end()
  })
}

function cityOf (adInfo) {
  const province = text(adInfo.province)
  const city = text(adInfo.city)
  const district = text(adInfo.district)
  // 直辖市的 city 可能为空，用省份兜底；两者都没有即视为没解析到城市
  const name = city || province
  return { city: name, province: province, cityName: city, district: district }
}

function reverseCity (coords, key) {
  return requestGeocoder(coords, key).then(function (payload) {
    const status = Number(payload && payload.status)
    const adInfo = (payload && payload.result && payload.result.ad_info) || null
    if (status !== 0 || !adInfo) {
      // 上游 business code 原样带回，便于排查；不含 key 与坐标
      return fail('UPSTREAM_FAILED', '腾讯位置服务返回 status ' + (isFinite(status) ? status : 'unknown') + (payload && payload.message ? ' / ' + text(payload.message) : ''))
    }
    const name = cityOf(adInfo)
    if (!name.city) return fail('NO_CITY', '该坐标没有解析到城市')
    return {
      success: true,
      city: name.city,
      province: name.province,
      district: name.district,
      adcode: text(adInfo.adcode),
      source: 'tencent-lbs'
    }
  })
}

// 在线失败时用离线结果兜底：结果可用，但标记降级并保留上游原因便于排查（仍不含 key）
function degrade (online, local) {
  return Object.assign({}, local, {
    degraded: true,
    upstreamCode: text(online && online.code),
    upstreamMessage: text(online && online.message)
  })
}

exports.main = async (event, context) => {
  const coords = readCoords(event)
  if (!coords) return fail('BAD_LOCATION', '经纬度缺失或非法')

  const cacheKey = cacheKeyOf(coords)
  const cached = recall(cacheKey)
  if (cached) return Object.assign({}, cached, { cached: true })

  const key = text(process.env[KEY_ENV])
  if (!key) {
    const local = nearestCity(coords)
    if (!local) return fail('NO_CITY', '该坐标超出城市中心点覆盖范围')
    remember(cacheKey, local)
    return local
  }

  let online = null
  try {
    online = await reverseCity(coords, key)
  } catch (err) {
    online = fail('UPSTREAM_ERROR', '逆地理编码失败：' + (text(err && err.message) || 'UPSTREAM_ERROR'))
  }
  if (online.success) {
    remember(cacheKey, online)
    return online
  }

  const local = nearestCity(coords)
  if (!local) return online
  const result = degrade(online, local)
  remember(cacheKey, result, DEGRADED_TTL_MS)
  return result
}
