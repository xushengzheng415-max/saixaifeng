const assert = require('assert')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')

function loadPage(relativePath, initialStorage) {
  const storage = Object.assign({}, initialStorage || {})
  const calls = { redirectTo: [], reLaunch: [], switchTab: [] }
  let definition = null
  global.getApp = function() { return { globalData: {} } }
  global.getCurrentPages = function() { return [] }
  global.Page = function(page) { definition = page }
  global.wx = {
    getStorageSync: function(key) { return storage[key] },
    setStorageSync: function(key, value) { storage[key] = value },
    removeStorageSync: function(key) { delete storage[key] },
    getSystemInfoSync: function() { return { platform: 'android' } },
    redirectTo: function(options) { calls.redirectTo.push(options.url); if (options.success) options.success({ errMsg: 'redirectTo:ok' }) },
    reLaunch: function(options) { calls.reLaunch.push(options.url); if (options.success) options.success({ errMsg: 'reLaunch:ok' }) },
    switchTab: function(options) { calls.switchTab.push(options.url); if (options.success) options.success({ errMsg: 'switchTab:ok' }) },
    showToast: function() {},
    showModal: function() {},
    cloud: { callFunction: function() {} }
  }
  const absolutePath = path.join(projectRoot, relativePath)
  delete require.cache[require.resolve(absolutePath)]
  require(absolutePath)
  assert(definition, 'Page definition was not registered for ' + relativePath)
  const page = Object.assign({}, definition)
  page.data = JSON.parse(JSON.stringify(definition.data || {}))
  page.setData = function(patch, callback) {
    Object.assign(page.data, patch || {})
    if (callback) callback.call(page)
  }
  return { page, storage, calls }
}

const signupPath = '/pages/tournament/signup/signup?id=tournament-1&divisionId=division-u12&inviteKey=invite-1&from=share'

{
  const test = loadPage('miniprogram/pages/login/login.js', { loginRedirectUrl: signupPath })
  test.page.data.redirectUrl = signupPath
  test.page.callCloud = function(name, data, success) {
    success({ result: { success: true, requiresOnboarding: true } })
  }
  test.page.goToPostLogin()
  assert.strictEqual(test.calls.redirectTo.length, 1)
  assert(test.calls.redirectTo[0].indexOf('/pages/onboarding/onboarding?scene=team&step=team') === 0)
  assert.strictEqual(test.storage.teamOnboardingReturnUrl, signupPath)
}

{
  const test = loadPage('miniprogram/pages/onboarding/onboarding.js')
  test.page.onLoad({
    scene: 'team',
    step: 'team',
    fromTournamentSignup: '1',
    returnUrl: encodeURIComponent(signupPath)
  })
  assert.strictEqual(test.page.data.isSceneStep, false)
  assert.strictEqual(test.page.data.isTeamProfileStep, true)
  assert.strictEqual(test.page.data.isTournamentSignupFlow, true)
  assert.strictEqual(test.page.data.pageTitle, '填写球队资料')
  assert.strictEqual(test.page.data.primaryText, '保存球队并继续报名')
}

{
  const test = loadPage('miniprogram/pages/onboarding/onboarding.js', { userId: 'user-1', openId: 'open-1' })
  test.page.data.createdTeam = { id: 'team-1', name: '测试球队', logo: '' }
  test.page.enterTeamHome()
  assert.deepStrictEqual(test.calls.reLaunch, ['/pages/teams/index'])
  assert.deepStrictEqual(test.calls.switchTab, [])
  assert.strictEqual(test.storage.currentWorkspaceId, 'team:team-1')
}

{
  const test = loadPage('miniprogram/pages/tournament/signup/signup.js')
  test.page.data.tournamentId = 'tournament-1'
  test.page.data.activeDivisionId = 'division-u12'
  test.page.data.inviteKey = 'invite-1'
  test.page.goCreateTeamForSignup()
  assert.strictEqual(test.calls.redirectTo.length, 1)
  assert(test.calls.redirectTo[0].indexOf('/pages/onboarding/onboarding?scene=team&step=team') === 0)
  assert.strictEqual(test.storage.teamOnboardingReturnUrl, signupPath)
}

console.log('赛事邀约球队开户与回跳路由测试通过：4/4')
