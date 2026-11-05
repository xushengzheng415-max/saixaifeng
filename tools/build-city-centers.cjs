#!/usr/bin/env node
'use strict'

/**
 * 生成 resolveCity 使用的离线城市中心点表。
 *
 * 背景：发现页只需要「我现在在哪个城市」这一个结论，用于同城赛事排序。
 * 走第三方逆地理（腾讯位置服务等）要申请 key、分配配额，属于额外成本与外部依赖；
 * 用全国地级市的官方中心点做最近距离判定，可以零 key、零配额、毫秒级、且不把坐标发给第三方。
 *
 * 数据来源：阿里 DataV 行政区划边界接口（公开、可直接比对）
 *   https://geo.datav.aliyun.com/areas_v3/bound/{省 adcode}_full.json
 *   每个要素的 properties.center 即该市的官方中心点（与地图产品口径一致）
 *
 * 用法：node tools/build-city-centers.cjs
 * 产物：cloudfunctions/resolveCity/city-centers.js（不要手改，重跑本脚本覆盖）
 */

const https = require('https')
const fs = require('fs')
const path = require('path')

const HOST = 'geo.datav.aliyun.com'
const BASE = '/areas_v3/bound/'
// 34 个省级行政区（含港澳台，取到即用，取不到的跳过并在日志里列出）
const PROVINCES = [
  110000, 120000, 130000, 140000, 150000, 210000, 220000, 230000,
  310000, 320000, 330000, 340000, 350000, 360000, 370000,
  410000, 420000, 430000, 440000, 450000, 460000, 500000,
  510000, 520000, 530000, 540000, 610000, 620000, 630000,
  640000, 650000, 710000, 810000, 820000
]

function getJson (urlPath) {
  return new Promise(function (resolve, reject) {
    const req = https.get({ host: HOST, path: urlPath, timeout: 20000 }, function (res) {
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error('HTTP_' + res.statusCode))
      }
      const chunks = []
      res.on('data', function (chunk) { chunks.push(chunk) })
      res.on('end', function () {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
        } catch (err) {
          reject(new Error('JSON_PARSE_FAILED'))
        }
      })
    })
    req.on('timeout', function () { req.destroy(new Error('TIMEOUT')) })
    req.on('error', reject)
  })
}

function centerOf (feature) {
  const props = (feature && feature.properties) || {}
  const center = props.center || props.centroid
  if (!Array.isArray(center) || center.length < 2) return null
  const lng = Number(center[0])
  const lat = Number(center[1])
  if (!isFinite(lng) || !isFinite(lat)) return null
  return { lat: lat, lng: lng }
}

function nameOf (feature) {
  const props = (feature && feature.properties) || {}
  return String(props.name || '').trim()
}

async function main () {
  const seen = new Set()
  const rows = []
  const skipped = []

  for (const code of PROVINCES) {
    let payload = null
    try {
      payload = await getJson(BASE + code + '_full.json')
    } catch (err) {
      skipped.push(code + ' 全量边界取回失败：' + err.message)
      continue
    }
    const features = (payload && payload.features) || []
    // 地级行政单位统一是 level=city：地级市之外还包括自治州、地区、盟
    // （只按「市」字结尾会漏掉新疆/西藏/内蒙/青海等地广人稀的州盟，最近城市会被拉远到几百公里）
    const cities = features.filter(function (item) {
      const props = (item && item.properties) || {}
      return props.level === 'city' && centerOf(item)
    })

    if (!cities.length) {
      // 直辖市 / 特别行政区：整块作为一个「城市」
      let single = null
      try {
        single = await getJson(BASE + code + '.json')
      } catch (err) {
        skipped.push(code + ' 单要素边界取回失败：' + err.message)
        continue
      }
      const first = ((single && single.features) || [])[0]
      const name = nameOf(first)
      const center = centerOf(first)
      if (name && center) cities.push(first)
      else skipped.push(code + ' 无可用中心点')
    }

    cities.forEach(function (item) {
      const name = nameOf(item)
      const center = centerOf(item)
      if (!name || !center) return
      if (seen.has(name)) return
      seen.add(name)
      rows.push([name, Math.round(center.lat * 1000) / 1000, Math.round(center.lng * 1000) / 1000])
    })
    process.stdout.write('· ' + code + ' → ' + cities.length + ' 个城市\n')
  }

  rows.sort(function (a, b) { return a[0].localeCompare(b[0], 'zh-Hans-CN') })

  const lines = []
  lines.push("'use strict'")
  lines.push('')
  lines.push('// 全国地级市中心点表（城市名, 纬度, 经度），由 tools/build-city-centers.cjs 生成。')
  lines.push('// 数据来源：阿里 DataV 行政区划边界接口 properties.center，只保留城市级结论，不含任何人信息。')
  lines.push('// 用途：resolveCity 在无第三方 key / 配额不足时，用最近城市中心点判定「当前在哪个城市」。')
  lines.push('// 覆盖：' + rows.length + ' 个城市（含直辖市、特别行政区）。勿手改，重跑生成脚本。')
  lines.push('')
  lines.push('module.exports = [')
  for (let i = 0; i < rows.length; i += 4) {
    const slice = rows.slice(i, i + 4).map(function (row) {
      return "['" + row[0].replace(/'/g, '') + "', " + row[1].toFixed(3) + ', ' + row[2].toFixed(3) + ']'
    })
    lines.push('  ' + slice.join(', ') + (i + 4 < rows.length ? ',' : ''))
  }
  lines.push(']')
  lines.push('')

  const target = path.join(__dirname, '..', 'cloudfunctions', 'resolveCity', 'city-centers.js')
  fs.writeFileSync(target, lines.join('\n'), 'utf8')
  const size = fs.statSync(target).size
  console.log('\n城市数：' + rows.length + '，产物 ' + target.replace(/\\/g, '/') + '（' + (size / 1024).toFixed(1) + ' KB）')
  if (skipped.length) console.log('跳过：\n  ' + skipped.join('\n  '))
}

main().catch(function (err) {
  console.error('生成失败：', err && err.message)
  process.exit(1)
})
