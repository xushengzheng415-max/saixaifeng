const assert = require('node:assert/strict')
const path = require('node:path')

function pageAt(relative, storage = {}) {
  let definition
  const routes = []
  global.Page = value => { definition = value }
  global.wx = {
    getStorageSync: key => storage[key],
    setStorageSync: (key, value) => { storage[key] = value },
    removeStorageSync: key => { delete storage[key] },
    redirectTo: ({ url }) => routes.push(url)
  }
  const file = path.resolve(__dirname, '..', relative)
  delete require.cache[require.resolve(file)]
  require(file)
  const page = Object.assign({}, definition, { data: JSON.parse(JSON.stringify(definition.data)) })
  page.setData = function(patch, callback) {
    Object.assign(this.data, patch)
    if (callback) callback.call(this)
  }
  return { page, routes, storage }
}

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

async function main() {
  for (const url of [
    '/pages/team/claim-code/claim-code?scene=c%3Dleague-code',
    '/pages/team/prebuilt-invite/prebuilt-invite?inviteId=team-invite'
  ]) {
    for (const cached of [false, true]) {
      const test = pageAt('miniprogram/pages/login/login.js', cached ? { loginRedirectUrl: url } : {})
      if (!cached) test.page.data.redirectUrl = url
      test.page.callCloud = () => { throw new Error('认领登录不能先走开户分流') }
      test.page.goToPostLogin()
      assert.deepEqual(test.routes, [url])
      assert.equal(test.storage.loginRedirectUrl, undefined)
    }
  }

  const test = pageAt('miniprogram/pages/team/claim-code/claim-code.js')
  const context = deferred(), teams = deferred()
  const calls = []
  test.page.data.inviteKey = 'league-code'
  test.page.call = action => {
    calls.push(action)
    return action === 'claimCodeContext' ? context.promise : teams.promise
  }
  const pending = test.page.loadContext()
  test.page.loadContext()
  assert.deepEqual(calls, ['claimCodeContext'], '重复点击不能并发请求')
  context.resolve({ result: { success: true, tournament: { name: '测试联赛' } } })
  await Promise.resolve()
  assert.deepEqual(calls, ['claimCodeContext', 'claimableTeams'])
  assert.equal(test.page.data.loading, true, '慢请求返回前不能显示空球队状态')
  assert.deepEqual(test.routes, [])
  teams.resolve({ result: { success: true, teams: [{ inviteId: 'invite-1', teamName: '测试队' }] } })
  await pending
  assert.equal(test.page.data.loading, false)
  assert.equal(test.page.data.hasTeams, true)
  assert.equal(test.page.data.teams[0].teamName, '测试队')
  assert.equal(test.page.data.acceptDisabled, true, '仍须选择球队并同意免责声明')

  test.page.call = () => Promise.reject(new Error('网络断开，请重试'))
  await test.page.loadContext()
  assert.equal(test.page.data.loading, false)
  assert.match(test.page.data.errorText, /网络/)
  test.page.call = action => Promise.resolve({ result: action === 'claimCodeContext'
    ? { success: true } : { success: true, teams: [] } })
  await test.page.loadContext()
  assert.equal(test.page.data.errorText, '')
  assert.equal(test.page.data.loading, false)
  assert.equal(test.page.data.hasTeams, false, '只有服务端核对完成才显示无匹配球队')

  test.page.call = () => Promise.resolve({ result: { success: false, code: 'PHONE_AUTH_REQUIRED' } })
  await test.page.loadContext()
  assert.equal(test.page.data.needsPhone, true)
  assert.equal(test.page.data.loading, false)

  let entered = null
  test.page.enterClaimedTeam = team => { entered = team.teamId }
  test.page.call = action => Promise.resolve({ result: action === 'claimCodeContext'
    ? { success: true } : { success: true, teams: [{ teamId: 'claimed-team', alreadyClaimed: true }] } })
  await test.page.loadContext()
  assert.equal(entered, 'claimed-team', '本人已认领的唯一球队仍直接进入')
  assert.deepEqual(test.routes, [], '核对、失败、无匹配均不能转到建队页')
  test.page.onLoad({ scene: '%' })
  assert.match(test.page.data.errorText, /认领码无效/)
  console.log('球队认领路由、慢请求、重试及手机号门禁测试通过')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
