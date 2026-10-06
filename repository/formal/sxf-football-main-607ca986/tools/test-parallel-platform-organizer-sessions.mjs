import assert from 'node:assert/strict'
import {
  activateOrganizerContext,
  activatePlatformContext,
  clearPlatformSession,
  getPlatformAuthToken,
  isPlatformContext,
  isPlatformSession,
  storePlatformSession
} from '../web-admin-vue/src/utils/platformSession.js'

function storage() {
  const values = new Map()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  }
}

globalThis.localStorage = storage()
const platformTab = storage()
const organizerTab = storage()
globalThis.sessionStorage = platformTab

localStorage.setItem('authToken', 'organizer-one')
localStorage.setItem('loginType', 'wechat')
localStorage.setItem('userInfo', JSON.stringify({ _id: 'organizer-one', userName: '机构负责人' }))
assert.equal(storePlatformSession({
  authToken: 'platform-one',
  user: { _id: 'platform-owner', userName: '平台负责人' }
}), true)
assert.equal(localStorage.getItem('authToken'), 'organizer-one')
assert.equal(getPlatformAuthToken(), 'platform-one')
assert.equal(isPlatformSession(), true)

globalThis.sessionStorage = organizerTab
activateOrganizerContext()
localStorage.setItem('authToken', 'organizer-two')
localStorage.setItem('userInfo', JSON.stringify({ _id: 'organizer-two', userName: '机构负责人' }))
assert.equal(isPlatformContext(), false)
assert.equal(isPlatformSession(), false)

globalThis.sessionStorage = platformTab
assert.equal(isPlatformSession(), true)
assert.equal(getPlatformAuthToken(), 'platform-one')
assert.equal(localStorage.getItem('authToken'), 'organizer-two')

clearPlatformSession()
assert.equal(getPlatformAuthToken(), '')
assert.equal(localStorage.getItem('authToken'), 'organizer-two')

globalThis.sessionStorage = organizerTab
storePlatformSession({ authToken: 'platform-two', user: { _id: 'platform-owner' } })
activateOrganizerContext()
assert.equal(isPlatformSession(), false)
globalThis.sessionStorage = platformTab
activatePlatformContext()
assert.equal(isPlatformSession(), true)
assert.equal(getPlatformAuthToken(), 'platform-two')
console.log('PASS: 平台与机构在不同标签页同时登录，令牌和退出范围相互独立')
