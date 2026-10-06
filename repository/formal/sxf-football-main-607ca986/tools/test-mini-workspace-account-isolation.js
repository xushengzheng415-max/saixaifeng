const assert = require('assert')

async function run() {
  const storage = {}
  const pendingCalls = []
  const app = { globalData: {}, logoutCalled: 0, logout() { this.logoutCalled += 1 } }
  global.getApp = () => app
  global.getCurrentPages = () => [{ route: 'pages/home/home' }]
  global.wx = {
    getStorageSync(key) { return storage[key] },
    setStorageSync(key, value) { storage[key] = value },
    removeStorageSync(key) { delete storage[key] },
    reLaunch() {},
    redirectTo() {},
    cloud: {
      callFunction(options) { pendingCalls.push(options) }
    }
  }

  const modulePath = require.resolve('../miniprogram/utils/workspace.js')
  delete require.cache[modulePath]
  const workspace = require(modulePath)

  storage.userInfo = { _id: 'user-b', phone: '13900139000' }
  storage.workspaceContext = {
    user: { id: 'user-a', phone: '13800138000' },
    accountOwner: { id: 'user-a', phone: '13800138000' },
    currentWorkspace: { id: 'team:a' }
  }
  storage.currentWorkspaceId = 'team:a'
  assert.strictEqual(workspace.readContext(), null)
  assert.strictEqual(storage.workspaceContext, undefined)
  assert.strictEqual(storage.currentWorkspaceId, undefined)

  storage.userInfo = { _id: 'user-a', phone: '13800138000' }
  const oldLoad = workspace.loadContext()
  assert.strictEqual(pendingCalls.length, 1)
  workspace.clearContext()
  storage.userInfo = { _id: 'user-b', phone: '13900139000' }
  pendingCalls[0].success({ result: {
    success: true,
    user: { id: 'user-a', phone: '13800138000' },
    currentWorkspace: { id: 'team:a', name: '旧账号球队' }
  } })
  await assert.rejects(oldLoad, error => error && error.code === 'SESSION_ACCOUNT_MISMATCH')
  assert.strictEqual(storage.workspaceContext, undefined)

  const currentLoad = workspace.loadContext()
  assert.strictEqual(pendingCalls.length, 2)
  pendingCalls[1].success({ result: {
    success: true,
    user: { id: 'user-b', phone: '13900139000', phoneNumber: '13900139000' },
    currentWorkspace: { id: 'team:b', name: '新账号球队' },
    currentIdentity: { id: 'team_coach' }
  } })
  const context = await currentLoad
  assert.strictEqual(context.currentWorkspace.id, 'team:b')
  assert.strictEqual(workspace.readContext().accountOwner.id, 'user-b')
  assert.strictEqual(app.logoutCalled, 0)

  console.log('小程序账号与工作空间缓存隔离测试通过：3/3')
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
