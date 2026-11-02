const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const crypto = require('node:crypto')
const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'cloudfunctions/tournamentStaffAccess/index.js'), 'utf8')
const policy = require('../cloudfunctions/tournamentStaffAccess/policy.cjs')
const token = 'isolated-test-session'
function fixture({ status = 'active', userId = 'guest', failAudit = false } = {}) {
  let store = {
    users: [{ _id: 'guest' }, { _id: 'other' }],
    auth_sessions: [{ _id: 'session', userId: 'guest', tokenHash: crypto.createHash('sha256').update(token).digest('hex'), active: true, expiresAt: new Date(Date.now() + 60000) }],
    organizations: [{ _id: 'org', ownerId: 'owner' }],
    tournaments: [{ _id: 'event', orgId: 'org', name: '隔离测试赛事' }],
    tournament_staff_grants: [
      { _id: 'grant', userId, status, orgId: 'org', tournamentId: 'event', permissions: ['event.matches'] },
      { _id: 'other-grant', userId: 'guest', status: 'active', orgId: 'org', tournamentId: 'other-event', permissions: ['event.matches'] }
    ]
  }
  const matches = (row, query) => Object.entries(query).every(([key, expected]) => expected?.gt ? new Date(row[key]) > expected.gt : row[key] === expected)
  function api(getStore) {
    return { collection(name) {
      const rows = () => getStore()[name] ||= []
      return {
        where(query) { return { limit(count) { return { async get() { return { data: rows().filter(row => matches(row, query)).slice(0, count) } } } } } },
        doc(id) { return {
          async get() { return { data: rows().find(row => row._id === id) || null } },
          async update({ data }) { Object.assign(rows().find(row => row._id === id), data) }
        } },
        async add({ data }) { if (failAudit && name === 'tournament_staff_audit') throw Error('audit unavailable'); rows().push(structuredClone(data)); return { _id: 'audit' } }
      }
    } }
  }
  const db = { ...api(() => store), command: { gt: value => ({ gt: value }) }, serverDate: () => new Date(),
    async runTransaction(fn) { const candidate = structuredClone(store); await fn(api(() => candidate)); store = candidate }
  }
  const exports = {}
  vm.runInNewContext(source, { exports, require(name) {
    if (name === 'wx-server-sdk') return { init() {}, database: () => db, getWXContext: () => ({}) }
    if (name === './policy.cjs') return policy
    return require(name)
  } })
  return { main: event => exports.main({ __authToken: token, ...event }), rows: () => store, db }
}
async function checkPageActions() {
  const page = fs.readFileSync(path.join(root, 'web-admin-vue/src/views/tournament/TournamentSpace.vue'), 'utf8')
  const script = page.match(/<script setup>([\s\S]*?)<\/script>/)[1]
    .replace(/^import .*$/gm, '').replaceAll('import.meta.env', 'env')
  function pageFixture({ confirmError, failure = false, changeAccount = false } = {}) {
    const storage = new Map([['authToken', 'session'], ['userId', 'guest']])
    const session = new Map([['sxfStaffTournamentId', 'event'], ['sxfStaffPermissions', '["event.matches"]'], ['sxfTournamentStaff', '1']])
    const adapter = map => ({ getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) })
    let calls = 0
    const messages = []
    const context = {
      ref: value => ({ value }), computed: fn => ({ get value() { return fn() } }),
      useRouter: () => ({ push() {} }), onMounted() {}, onUnmounted() {},
      env: { DEV: false }, window: { location: { href: '' } },
      localStorage: adapter(storage), sessionStorage: adapter(session),
      isDemoMode: () => false, isDemoModeAvailable: () => false,
      ElMessageBox: { async confirm() { if (confirmError) throw confirmError; if (changeAccount) storage.set('authToken', 'different-account') } },
      ElMessage: { success: message => messages.push(message), error: message => messages.push(message) },
      async callFunction() { calls++; return { success: !failure, message: '模拟网络失败' } }
    }
    vm.runInNewContext(script + '\nglobalThis.actions={leaveSharedTournament,tournaments,leavingGrantId};', context)
    const card = { _id: 'event', grantId: 'grant', name: '隔离赛事', isShared: true }
    context.actions.tournaments.value = [card, { _id: 'another', grantId: 'another-grant', isShared: true }]
    return { ...context.actions, card, session, messages, calls: () => calls }
  }
  const success = pageFixture()
  await success.leaveSharedTournament(success.card)
  assert.equal(success.calls(), 1)
  assert.equal(success.tournaments.value.length, 1)
  assert.equal(success.session.has('sxfStaffPermissions'), false)
  assert.equal(success.leavingGrantId.value, '')
  for (const options of [{ confirmError: 'cancel' }, { failure: true }, { changeAccount: true }]) {
    const result = pageFixture(options)
    await result.leaveSharedTournament(result.card)
    assert.equal(result.tournaments.value.length, 2)
    assert.equal(result.session.has('sxfStaffPermissions'), true)
    assert.equal(result.calls(), options.failure ? 1 : 0)
    assert.equal(result.leavingGrantId.value, '')
  }
  const own = pageFixture()
  await own.leaveSharedTournament({ ...own.card, isShared: false })
  assert.equal(own.calls(), 0)
  const repeated = pageFixture()
  await Promise.all([repeated.leaveSharedTournament(repeated.card), repeated.leaveSharedTournament(repeated.card)])
  assert.equal(repeated.calls(), 1)
}
;(async () => {
  const test = fixture()
  assert.equal(await policy.hasRight(test.db, 'guest', 'org', 'event', 'event.matches'), true)
  const untouched = structuredClone(test.rows().tournaments)
  assert.equal((await test.main({ action: 'leave', grantId: 'grant' })).success, true)
  assert.equal(test.rows().tournament_staff_grants[0].status, 'disabled')
  assert.equal(test.rows().tournament_staff_grants[0].exitedBy, 'guest')
  assert.equal(test.rows().tournament_staff_grants[1].status, 'active')
  assert.deepEqual(test.rows().tournaments, untouched)
  assert.equal(await policy.hasRight(test.db, 'guest', 'org', 'event', 'event.matches'), false)
  assert.equal((await test.main({ action: 'activate', grantId: 'grant' })).success, false)
  assert.equal((await test.main({ action: 'mine' })).grants.length, 1)
  assert.equal(test.rows().tournament_staff_audit[0].action, 'leave')
  assert.equal((await test.main({ action: 'leave', grantId: 'grant' })).success, true)
  assert.equal(test.rows().tournament_staff_audit.length, 1)
  for (const options of [{ userId: 'other' }, { status: 'pending' }, { status: 'disabled' }]) {
    const denied = fixture(options)
    assert.equal((await denied.main({ action: 'leave', grantId: 'grant', userId: 'other', __actorUserId: 'guest' })).success, false)
    assert.equal(denied.rows().tournament_staff_grants[0].status, options.status || 'active')
  }
  assert.equal((await fixture().main({ action: 'leave', grantId: 'missing' })).success, false)
  assert.equal((await fixture().main({ action: 'leave' })).success, false)
  assert.equal((await fixture().main({ action: 'leave', grantId: 'grant', __authToken: 'forged' })).success, false)
  assert.equal((await fixture().main({ action: 'leave', grantId: 'grant', __actorUserId: 'other' })).success, false)
  const rollback = fixture({ failAudit: true })
  assert.equal((await rollback.main({ action: 'leave', grantId: 'grant' })).success, false)
  assert.equal(rollback.rows().tournament_staff_grants[0].status, 'active')
  await checkPageActions()
  console.log('PASS: self exit, revoked access, activation denied, isolated scope, idempotency, forged identity, invalid grants, transaction rollback; page confirmation cancellation, failed request, account change, owner protection and repeated clicks')
})().catch(error => { console.error(error); process.exitCode = 1 })
