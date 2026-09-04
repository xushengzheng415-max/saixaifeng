// 从原型生成源（03-机构协作-小程序/00-全局规范/设计说明/原型生成源/app.js）提取 SVG 图标，
// 生成带显式颜色的独立 .svg 文件到 miniprogram/images/icons/，供 <image> 引用。
// 用法：node tools/generate_proto_icons.js
const fs = require('fs')
const path = require('path')

const ICONS = {
  home: '<path d="M3 11.2 12 3l9 8.2V21h-6v-6H9v6H3z"/>',
  event: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-12 5 2 2 4-4"/>',
  team: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 21c0-4.5 2.4-7 6-7s6 2.5 6 7m0-6.5c3.2 0 5.5 2.2 5.5 6"/>',
  training: '<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M8 2v4m8-4v4M8 10h8m-8 4h8m-8 4h5"/>',
  me: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-5.2 3-8 8-8s8 2.8 8 8"/>',
  scan: '<path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5M8 8h8v8H8z"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  qr: '<path d="M3 3h7v7H3zM14 3h7v7H3zM3 14h7v7H3zM14 14h3v3h-3zM18 18h3v3h-3zM18 14h3M14 18v3"/>',
  players: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 21c0-4.5 2.4-7 6-7s6 2.5 6 7m6-6.5c3.2 0 5.5 2.2 5.5 6"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="m12 7 3 2-1 4h-4L9 9zM5 10l4-1M7 18l3-5m7 5-3-5m5-3-4-1"/>',
  shield: '<path d="M12 3 20 6v6c0 5-3.4 8-8 10-4.6-2-8-5-8-10V6z"/><path d="m8 12 2.5 2.5L16 9"/>',
  chart: '<path d="M4 20V10h4v10m2 0V4h4v16m2 0v-7h4v7M3 20h18"/>',
  bell: '<path d="M6 17h12l-1.5-2v-4a4.5 4.5 0 0 0-9 0v4zM10 20h4"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.6 2.6L16.5 9"/>',
  warning: '<path d="m12 3 10 18H2z"/><path d="M12 9v5m0 3v.1"/>'
}

const GRAY = '#8e9993'
const GREEN = '#087A48'
const WHITE = '#FFFFFF'

function svg(body, color) {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' + color +
    '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>\n'
}

const outDir = path.join(__dirname, '..', 'miniprogram', 'images', 'icons')
fs.mkdirSync(outDir, { recursive: true })

let count = 0
function write(name, body, color) {
  fs.writeFileSync(path.join(outDir, name + '.svg'), svg(body, color))
  count++
}

// 底部导航：灰 / 绿 两态
;['home', 'event', 'team', 'training', 'me'].forEach(function(key) {
  write('tab-' + key, ICONS[key], GRAY)
  write('tab-' + key + '-active', ICONS[key], GREEN)
})

// 页面内功能图标：操作绿
;['scan', 'list', 'qr', 'players', 'ball', 'shield', 'chart', 'lock', 'check', 'warning', 'event', 'team', 'training', 'bell'].forEach(function(key) {
  write(key, ICONS[key], GREEN)
})

// 深绿版头上的白色图标
write('bell-white', ICONS.bell, WHITE)

console.log('generated ' + count + ' svg icons into ' + outDir)
