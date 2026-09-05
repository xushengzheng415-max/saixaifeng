const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8')

const workspaceSource = read('miniprogram/utils/workspace.js')
const tabSource = read('miniprogram/custom-tab-bar/index.js')
const pages = [
  { name: '赛事', base: 'miniprogram/pages/event/index' },
  { name: '球队', base: 'miniprogram/pages/teams/index' },
  { name: '青训', base: 'miniprogram/pages/training/index' },
  { name: '我的', base: 'miniprogram/pages/profile/profile' }
]

assert.match(workspaceSource, /AUTH_SESSION_VERSION = 'phone-canonical-v1'[\s\S]*function hasAuthenticatedUser\([\s\S]*authSessionVersion/, '游客判断必须校验手机号登录会话')
assert.match(workspaceSource, /function promptLogin\([\s\S]*继续浏览[\s\S]*\/pages\/login\/login/, '游客管理动作必须允许继续浏览或主动登录')
assert.match(workspaceSource, /function isGuestReviewEnabled\([\s\S]*reviewGuest[\s\S]*platform === 'devtools'/, '开发者工具必须能固定复验游客状态')

const tabPaths = ['/pages/event/index', '/pages/teams/index', '/pages/training/index', '/pages/profile/profile']
tabPaths.forEach(tabPath => assert.match(tabSource, new RegExp(tabPath.replace(/\//g, '\\/')), `底部菜单必须保留独立页面 ${tabPath}`))

pages.forEach(page => {
  const source = read(page.base + '.js')
  const template = read(page.base + '.wxml')
  assert.match(source, /!workspace\.hasAuthenticatedUser\(\)[\s\S]*loadGuestDemo\(\)/, `${page.name}页未登录时必须进入演示状态`)
  assert.match(source, /loadGuestDemo:[\s\S]*guestMode[^\n]*true/, `${page.name}页必须提供演示数据`)
  assert.match(source, /onShow:[\s\S]*this\.data\.guestMode\) return/, `${page.name}页显示时不得被登录缓存覆盖演示状态`)
  assert.match(template, /guestMode[\s\S]*当前未登录[\s\S]*示例数据/, `${page.name}页必须明确标注未登录和示例数据`)
})

console.log('小程序底部四页游客演示测试通过：23/23')
