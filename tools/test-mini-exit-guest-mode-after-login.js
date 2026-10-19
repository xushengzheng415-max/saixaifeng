const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const pages = [
  'miniprogram/pages/event/index.js',
  'miniprogram/pages/teams/index.js',
  'miniprogram/pages/training/index.js',
  'miniprogram/pages/profile/profile.js'
]

pages.forEach(file => {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  assert.doesNotMatch(source, /if \(this\.data\.guestMode\) return\s*\n\s*if \(!workspace\.hasAuthenticatedUser\(\)\)/, file + ' 登录后不能因旧 guestMode 直接返回')
  assert.match(source, /if \(this\.data\.guestMode\) this\.setData\(\{ guestMode: false \}\)/, file + ' 登录后必须清除 guestMode')
  assert.match(source, /if \(!workspace\.hasAuthenticatedUser\(\)\) \{\s*this\.loadGuestDemo\(\)/, file + ' 未登录时仍应进入演示模式')
})

console.log('登录后退出演示态回归测试通过')
