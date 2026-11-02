// 回归：球队认领必须直接进入球队主页，且不再经过“赛事组织者/球队管理者”身份选择和建队“跳过”链路。
// 覆盖三处：认领页手机号验证写入本机会话、认领成功后按球队管理者视角进入球队页、登录已有球队关系时不再跳身份选择页。
const assert = require('node:assert/strict')
const path = require('node:path')

const storage = {}
const routes = []
let cloudHandler = null
let definition = null

global.getApp = () => ({ globalData: {} })
global.getCurrentPages = () => []
global.Page = value => { definition = value }
global.wx = {
  getStorageSync: key => storage[key],
  setStorageSync: (key, value) => { storage[key] = value },
  removeStorageSync: key => { delete storage[key] },
  showToast: () => {},
  showModal: () => {},
  redirectTo: options => routes.push(options.url),
  navigateTo: options => routes.push(options.url),
  reLaunch: options => routes.push(options.url),
  switchTab: options => routes.push(options.url),
  cloud: {
    callFunction: options => {
      const promise = Promise.resolve(cloudHandler(options))
      promise.then(result => { if (options.success) options.success(result) }, error => { if (options.fail) options.fail(error) })
      return promise
    }
  }
}

function loadPage(relative) {
  const file = path.resolve(__dirname, '..', relative)
  delete require.cache[require.resolve(file)]
  require(file)
  assert.ok(definition, '未注册 Page：' + relative)
  const page = Object.assign({}, definition, { data: JSON.parse(JSON.stringify(definition.data)) })
  page.setData = function (patch, callback) {
    Object.assign(this.data, patch)
    if (callback) callback.call(this)
  }
  return page
}

function settle() {
  return new Promise(resolve => setTimeout(resolve, 20))
}

async function phoneVerificationWritesSession() {
  const page = loadPage('miniprogram/pages/team/claim-code/claim-code.js')
  page.data.inviteKey = 'league-code'
  let contextLoads = 0
  page.call = () => {
    contextLoads += 1
    return Promise.resolve({ result: { success: true, needsPhone: false, teams: [] } })
  }
  cloudHandler = options => {
    assert.equal(options.name, 'checkUserByOpenId', '认领页必须由服务端核验手机号')
    return { result: { success: true, isRegistered: true, user: { _id: 'user-1', phone: '13800138000', openId: 'openid-1', nickName: '教练' } } }
  }
  page.onGetPhoneNumber({ detail: { code: 'phone-code-1' } })
  await settle()
  assert.equal(storage.userInfo._id, 'user-1', '手机号验证后必须写入本机会话')
  assert.equal(storage.userInfo.phone, '13800138000')
  assert.equal(storage.authSessionVersion, 'phone-canonical-v1', '会话必须带手机号登录标记')
  assert.equal(storage.phoneNumber, '13800138000')
  assert.equal(page.data.needsPhone, false)
  assert.ok(contextLoads > 0, '会话写入后应继续加载认领上下文')
}

async function claimEntersTeamDirectly() {
  const page = loadPage('miniprogram/pages/team/claim-code/claim-code.js')
  page.data.selectedInviteId = 'invite-1'
  page.data.disclaimerAgreed = true
  page.call = action => {
    assert.equal(action, 'acceptPrebuiltTeamInvite')
    return Promise.resolve({ result: { success: true, teamId: 'team-1', workspaceId: 'team:team-1', pendingPlayerDraftCount: 0 } })
  }
  cloudHandler = options => {
    if (options.name !== 'getMiniWorkspace') throw new Error('认领后只应读取工作空间：' + options.name)
    return {
      result: {
        success: true,
        user: { id: 'user-1', phone: '13800138000' },
        workspaces: [{ id: 'team:team-1', type: 'team', permissions: ['team.view', 'team.manage'] }],
        currentWorkspace: { id: 'team:team-1', type: 'team', permissions: ['team.view', 'team.manage'] },
        currentIdentity: { id: 'team_admin' },
        teams: [{ id: 'team-1' }]
      }
    }
  }
  routes.length = 0
  page.acceptClaim()
  await settle()
  assert.deepEqual(routes, ['/pages/team/team?teamId=team-1'], '认领后必须直接进入球队主页')
  assert.ok(!routes.some(url => url.indexOf('/pages/onboarding/') === 0 || url.indexOf('/pages/login/') === 0), '认领后不得进入身份选择或登录页')
  assert.equal(storage.miniPortalRolePreferences.roles['user-1'], 'team_coach', '认领人默认按球队管理者视角进入')
  assert.equal(storage.currentWorkspaceId, 'team:team-1', '认领后应切换到目标球队空间')
}

async function loginSkipsRoleChoiceForExistingTeam() {
  const page = loadPage('miniprogram/pages/login/login.js')
  page.data.redirectUrl = ''
  let homeEntered = false
  page.goToHome = () => { homeEntered = true }
  page.callCloud = (name, data, success) => {
    assert.equal(name, 'onboardingWorkspace')
    success({ result: { success: true, requiresOnboarding: false, hasTeamRelation: true } })
  }
  routes.length = 0
  page.goToPostLogin()
  assert.equal(storage.miniPortalRolePreferences.roles['user-1'], 'team_coach', '已有球队关系时直接按球队管理者视角进入')
  assert.equal(routes.length, 0, '已有球队关系时不得再跳“赛事组织者/球队管理者”身份选择页')
  assert.equal(homeEntered, true)

  delete storage.miniPortalRolePreferences
  page.callCloud = (name, data, success) => {
    success({ result: { success: true, requiresOnboarding: true, hasTeamRelation: false } })
  }
  routes.length = 0
  page.goToPostLogin()
  assert.deepEqual(routes, ['/pages/onboarding/first-use'], '没有任何球队关系时才允许进入身份选择')
}

async function invitePhoneGateThenDirectEntry() {
  const page = loadPage('miniprogram/pages/team/prebuilt-invite/prebuilt-invite.js')
  page.data.inviteId = 'invite-2'
  let phoneVerified = false
  let inviteLoads = 0
  cloudHandler = options => {
    const data = options.data || {}
    if (options.name === 'checkUserByOpenId') {
      phoneVerified = true
      return { result: { success: true, isRegistered: true, user: { _id: 'user-1', phone: '13800138000', openId: 'openid-1' } } }
    }
    if (data.action === 'prebuiltTeamInvite') {
      inviteLoads += 1
      if (!phoneVerified) return { result: { success: false, code: 'PHONE_AUTH_REQUIRED', message: '当前账号未完成手机号验证，请重新登录' } }
      return { result: { success: true, invite: { divisionName: 'U12组' }, tournament: { name: '测试联赛' }, prebuiltTeam: { name: '预建队', requiresReview: false }, candidateTeams: [] } }
    }
    if (data.action === 'acceptPrebuiltTeamInvite') {
      return { result: { success: true, teamId: 'team-1', workspaceId: 'team:team-1', pendingPlayerDraftCount: 0 } }
    }
    if (options.name === 'getMiniWorkspace') {
      return {
        result: {
          success: true,
          user: { id: 'user-1', phone: '13800138000' },
          workspaces: [{ id: 'team:team-1', type: 'team', permissions: ['team.view', 'team.manage'] }],
          currentWorkspace: { id: 'team:team-1', type: 'team', permissions: ['team.view', 'team.manage'] },
          currentIdentity: { id: 'team_admin' },
          teams: [{ id: 'team-1' }]
        }
      }
    }
    throw new Error('未预期的云调用：' + options.name + ' ' + String(data.action || ''))
  }

  await page.load()
  await settle()
  assert.equal(page.data.needsPhone, true, '定向认领未验证手机号时应提供授权入口，而不是只显示错误')
  assert.equal(page.data.errorText, '')

  page.onGetPhoneNumber({ detail: { code: 'phone-code-2' } })
  await settle()
  assert.equal(storage.userInfo._id, 'user-1', '定向认领验证手机号后必须写入本机会话')
  assert.equal(storage.authSessionVersion, 'phone-canonical-v1')
  assert.equal(page.data.needsPhone, false)
  assert.equal(inviteLoads, 2, '验证成功后应重新加载邀请')

  page.data.disclaimerAgreed = true
  routes.length = 0
  page.acceptPrebuilt()
  await settle()
  assert.deepEqual(routes, ['/pages/team/team?teamId=team-1'], '定向认领后也必须直接进入球队主页')
  assert.ok(!routes.some(url => url.indexOf('/pages/onboarding/') === 0 || url.indexOf('/pages/login/') === 0))
  assert.equal(storage.miniPortalRolePreferences.roles['user-1'], 'team_coach')
}

async function main() {
  await phoneVerificationWritesSession()
  await claimEntersTeamDirectly()
  await invitePhoneGateThenDirectEntry()
  await loginSkipsRoleChoiceForExistingTeam()
  console.log('球队认领直接进入球队主页、免身份选择测试通过：4/4')
}

main().catch(error => {
  console.error('FAIL:', error && error.message)
  process.exitCode = 1
})
