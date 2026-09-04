const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8')

const appConfig = JSON.parse(read('miniprogram/app.json'))
const appSource = read('miniprogram/app.js')
const homeTemplate = read('miniprogram/pages/home/home.wxml')
const homeSource = read('miniprogram/pages/home/home.js')
const loginTemplate = read('miniprogram/pages/login/login.wxml')

assert.strictEqual(appConfig.pages[0], 'pages/home/home', '首次打开必须先进入可浏览的首页')
assert.doesNotMatch(appSource, /routeGuestHomeLaunchToLogin|reLaunch\s*\(\s*\{\s*url:\s*['"]\/pages\/login\/login/, '全局启动不得强制未登录用户进入授权页')
assert.match(homeTemplate, /免登录浏览公开赛事/, '游客首页必须提供真实的免登录浏览入口')
assert.match(homeTemplate, /自主选择登录/, '游客首页必须明确由用户主动选择登录')
assert.match(homeSource, /goToLogin:[\s\S]*wx\.navigateTo/, '登录页只能由首页用户动作打开')
assert.doesNotMatch(homeTemplate, /getPhoneNumber|chooseAvatar/, '游客首页不得请求手机号、头像或昵称授权')
assert.match(loginTemplate, /open-type="getPhoneNumber"/, '正式登录继续使用手机号唯一凭证')
assert.doesNotMatch(loginTemplate, /chooseAvatar|type="nickname"|getUserProfile/, '登录不得捆绑索取头像或昵称')

console.log('小程序先浏览后自愿登录测试通过：8/8')
