'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')

let component, definition
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../miniprogram/custom-tab-bar/index.js'), 'utf8'), { Component: value => { component = value }, require: () => ({hasAuthenticatedUser:()=>true,getPortalRole:()=>'organizer',readContext:()=>null}) })
const bar = { ...component.methods, data: { ready: true, visible: true, overlayHidden: false }, setData(value) { Object.assign(this.data, value) } }
let role = 'organizer', pending, calls = 0
const nativeVisibility = [], routes = []
const context = { user: {}, currentWorkspace: { type: 'tournament_shared', name: '共享赛事' } }
const workspace = {
  readContext: () => context,
  getPortalRole: () => role,
  portalRoleOptions: () => ['team_coach', 'organizer'].map(id => ({ id, title: id === 'organizer' ? '赛事组织者' : '球队管理者', selectable: id !== role, selectedClass: id === role ? 'is-current' : '', selectedText: id === role ? '当前使用' : '' })),
  switchPortalRole(id) { calls++; return new Promise((resolve, reject) => { pending = { resolve() { role = id; resolve(context) }, reject } }) }
}
const wx = { hideTabBar() { nativeVisibility.push(false) }, showTabBar() { nativeVisibility.push(true) }, switchTab(args) { routes.push(args.url) } }
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../miniprogram/pages/profile/profile.js'), 'utf8'), {
  Page: value => { definition = value }, require: name => name.includes('workspace') ? workspace : { version: 'test' }, wx, Promise
})
const page = { ...definition, data: structuredClone(definition.data), getTabBar: () => bar, setData(value) { Object.assign(this.data, value) } }
async function run() {
  page.applyContext(context)
  page.openIdentitySheet()
  assert.equal(bar.data.visible, false)
  assert.equal(nativeVisibility.length, 0, 'Custom tab visibility must not invoke native tab APIs')
  page.selectIdentity({ currentTarget: { dataset: { id: 'team_coach' } } })
  page.applyContext(context)
  assert.equal(page.data.selectedIdentity, 'team_coach', 'Background refresh preserves a still-authorized choice')
  assert.equal(page.data.confirmDisabled, false)
  const request = page.confirmIdentitySwitch()
  page.confirmIdentitySwitch()
  page.closeIdentitySheet()
  assert.equal(calls, 1, 'Repeated confirm cannot issue another switch')
  assert.equal(page.data.isIdentitySheet, true, 'Pending switch cannot be dismissed')
  pending.reject(new Error('网络异常，请重试'))
  await request
  assert.equal(page.data.isIdentitySheet, true)
  assert.equal(bar.data.visible, false)
  assert.match(page.data.errorText, /重试/)
  assert.equal(page.data.confirmDisabled, false, 'Failed switch can be retried')
  page.closeIdentitySheet()
  assert.equal(bar.data.visible, true)
  assert.equal(page.data.selectedIdentity, '')
  page.openIdentitySheet()
  assert.equal(page.data.confirmDisabled, true, 'Reopening discards cancelled choice')
  assert.equal(page.data.identityOptions[1].selectedText, '当前使用')
  page.selectIdentity({ currentTarget: { dataset: { id: 'team_coach' } } })
  const success = page.confirmIdentitySwitch()
  pending.resolve()
  await success
  assert.equal(page.data.currentIdentityName, '球队管理者')
  assert.equal(page.data.isIdentitySheet, false)
  assert.equal(bar.data.visible, true)
  assert.deepEqual(routes, ['/pages/home/home'])
  page.openIdentitySheet()
  page.onHide()
  assert.equal(bar.data.visible, true)
  assert.equal(page.data.isIdentitySheet, false)
  page.openIdentitySheet()
  page.onUnload()
  assert.equal(bar.data.visible, true)
  assert.equal(nativeVisibility.length, 0, 'Closing or leaving must not display a second native tab bar')
  const markup = fs.readFileSync(path.resolve(__dirname, '../miniprogram/pages/profile/profile.wxml'), 'utf8')
  assert.doesNotMatch(markup, /账号授权|共享授权|授权岗位|权限范围/)
  console.log('我的双身份：底栏隐藏/恢复、取消重开、重复确认、失败重试、切换成功与离页恢复通过；授权摘要已移除')
}
run().catch(error => { console.error(error); process.exitCode = 1 })
