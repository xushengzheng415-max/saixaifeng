'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { transferDirect, bindPending } = require('../cloudfunctions/getMiniWorkspace/teamOwnerTransfer.cjs')

const owner = { user: { _id: 'owner-user', phone: '17300000000' }, openId: 'owner-openid', phone: '17300000000' }
const scope = { id: 'team:demo', type: 'team', teamId: 'demo', orgId: 'demo-org', permissions: ['team.view', 'team.manage'] }
const team = { _id: 'demo', name: '隔离测试队', orgId: 'demo-org', ownerId: 'owner-user', ownerPhone: '17300000000', claimStatus: 'claimed' }
const targetUser = { _id: 'target-user', phone: '13900000000', openId: 'target-openid' }
const ownerMembership = { _id: 'membership-owner', teamId: 'demo', userId: 'owner-user', role: 'owner', roles: ['owner'], status: 'accepted', source: 'organizer_team_access' }
const maskPhone = value => /^1\d{10}$/.test(String(value || '')) ? String(value).slice(0, 3) + '****' + String(value).slice(-4) : ''

function database(extra = {}) {
  let store = {
    teams: [structuredClone(team)],
    users: [structuredClone(targetUser)],
    team_memberships: [structuredClone(ownerMembership)],
    team_invitations: [],
    team_owner_transfers: [],
    ...structuredClone(extra)
  }
  const writes = []
  const command = { or: parts => ({ $or: parts }), and: parts => ({ $and: parts }), gt: value => ({ $gt: value }), in: values => ({ $in: values }) }
  const value = (row, key) => key.split('.').reduce((current, part) => current && current[part], row)
  const match = (row, where) => Object.entries(where || {}).every(([key, want]) => {
    if (key === '$or') return want.some(part => match(row, part))
    if (key === '$in') return want.indexOf(value(row, key)) >= 0
    return want && typeof want === 'object' && !Array.isArray(want) && !(want instanceof Date)
      ? match(value(row, key) || {}, Object.entries(want).reduce((acc, [k, v]) => Object.assign(acc, { [k]: v }), {}))
      : value(row, key) === want
  })
  function collections(data, events, name, inTransaction) {
    return {
      where(where) {
        assert.equal(inTransaction, false, 'CloudBase transactions cannot use where()')
        let limit = 100
        const q = { limit(n) { limit = n; return q }, orderBy() { return q }, get: async () => ({ data: (data[name] || []).filter(row => match(row, where)).slice(0, limit) }) }
        return q
      },
      doc(id) {
        return {
          get: async () => {
            const row = (data[name] || []).find(item => item._id === id)
            if (!row) throw Error('document.getfail document with_id does not exist')
            return { data: structuredClone(row) }
          },
          set: async ({ data: row }) => {
            data[name] = data[name] || []
            const index = data[name].findIndex(item => item._id === id)
            if (index >= 0) data[name][index] = { _id: id, ...row }
            else data[name].push({ _id: id, ...row })
            events.push({ collection: name, operation: 'set', id })
          },
          update: async ({ data: patch }) => {
            data[name] = data[name] || []
            const index = data[name].findIndex(item => item._id === id)
            if (index < 0) throw Error('document.updatefail document with_id does not exist')
            data[name][index] = { ...data[name][index], ...patch }
            events.push({ collection: name, operation: 'update', id, patch })
          },
          remove: async () => {
            data[name] = (data[name] || []).filter(item => item._id !== id)
            events.push({ collection: name, operation: 'remove', id })
          }
        }
      },
      add: async ({ data: row }) => {
        data[name] = data[name] || []
        const id = name + '-' + (data[name].length + 1)
        data[name].push({ _id: id, ...row })
        events.push({ collection: name, operation: 'add', id })
        return { _id: id }
      }
    }
  }
  const db = {
    command,
    get store() { return store },
    get writes() { return writes },
    createCollection: async () => ({}),
    serverDate: () => new Date('2026-10-28T08:00:00Z'),
    collection: name => collections(store, writes, name, false),
    runTransaction: async callback => {
      if (db.beforeTransaction) db.beforeTransaction(store)
      const copy = structuredClone(store)
      const events = []
      const result = await callback({ collection: name => collections(copy, events, name, true) })
      store = copy
      writes.push(...events)
      return result
    }
  }
  return db
}
const safeGet = db => async (collection, where, limit) => ((await db.collection(collection).where(where).limit(limit || 100).get()).data || [])
const run = (db, event, identity = owner, activeScope = scope) => transferDirect({ db, safeGet: safeGet(db), maskPhone }, identity, activeScope, event)
const bind = (db, user) => bindPending({ db, safeGet: safeGet(db) }, user, user.openId || '')

function profilePage(responses, modalAnswers) {
  const actions = [], storage = { userInfo: { _id: owner.user._id }, teamInfo: { _id: 'demo' } }, context = { currentWorkspace: scope }
  let definition, cleared = false, index = 0
  const wx = {
    getStorageSync: key => storage[key],
    removeStorageSync: key => delete storage[key],
    showToast: args => actions.push(['toast', args.title]),
    reLaunch: args => { actions.push(['navigate', args.url]); return Promise.resolve() },
    showModal: args => {
      const answer = modalAnswers[index++] || { confirm: false }
      args.success({ confirm: answer.confirm === true, content: answer.content || '' })
    },
    cloud: {
      callFunction: async ({ data }) => {
        actions.push(['call', data.action, data])
        const result = responses[data.action]
        if (result instanceof Error) throw result
        return { result: typeof result === 'function' ? result(data) : result }
      }
    }
  }
  const workspace = { readContext: () => context, clearContext: () => { cleared = true } }
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../miniprogram/pages/team/profile/profile.js'), 'utf8'),
    { Page: value => { definition = value }, require: () => workspace, wx, Promise, String, Number, Boolean, setTimeout, clearTimeout })
  const page = {
    ...definition,
    data: { ...structuredClone(definition.data), teamId: 'demo', profile: { name: team.name } },
    setData(value) { Object.assign(this.data, value) }
  }
  return { page, actions, storage, get cleared() { return cleared } }
}

async function main() {
  // 1. 已有账号：立即完成所有权移交，原主账号退出管理。
  const existing = database()
  const result = await run(existing, { teamId: 'demo', targetPhone: '13900000000' })
  assert.equal(result.success, true)
  assert.equal(result.hasAccount, true)
  assert.equal(result.targetPhoneMasked, '139****0000')
  const moved = existing.store.teams[0]
  assert.equal(moved.ownerId, 'target-user')
  assert.equal(moved.ownerUserId, 'target-user')
  assert.equal(moved.claimedByUserId, 'target-user')
  assert.equal(moved.ownerPhone, '13900000000')
  assert.equal(moved.pendingOwnerPhone, '')
  assert.equal(moved.claimStatus, 'claimed')
  assert.equal(moved.previousOwnerId, 'owner-user')
  const actorRow = existing.store.team_memberships.find(row => row.userId === 'owner-user')
  assert.equal(actorRow.status, 'revoked')
  assert.equal(actorRow.source, 'owner_transfer_out')
  const targetRow = existing.store.team_memberships.find(row => row.userId === 'target-user')
  assert.deepEqual(targetRow.permissions, ['team.view', 'team.manage'])
  assert.deepEqual(targetRow.roles, ['owner'])
  assert.equal(targetRow.status, 'accepted')
  assert.equal(existing.store.team_owner_transfers.length, 1)
  assert.equal(existing.store.team_owner_transfers[0].mode, 'owner_transfer_direct')
  assert.equal(existing.store.team_owner_transfers[0].fromUserId, 'owner-user')

  // 2. 对方还没注册：记 pendingOwnerPhone，等待该手机号登录时自动认领。
  const pending = database({ users: [] })
  const pendingResult = await run(pending, { teamId: 'demo', targetPhone: '13900000001' })
  assert.equal(pendingResult.hasAccount, false)
  const pendingTeam = pending.store.teams[0]
  assert.equal(pendingTeam.ownerId, '')
  assert.equal(pendingTeam.pendingOwnerPhone, '13900000001')
  assert.equal(pendingTeam.claimStatus, 'pending')
  assert.equal(pending.store.team_memberships.filter(row => row.status === 'accepted' && row.role === 'owner').length, 0)

  // 3. 非主账号、越权、移交给自己、重复账号都必须阻断，且不能留下写入。
  const admin = database({ teams: [{ ...team, ownerId: 'other-owner' }] })
  await assert.rejects(run(admin, { teamId: 'demo', targetPhone: '13900000000' }), error => error.code === 'TEAM_OWNER_REQUIRED')
  assert.equal(admin.store.teams[0].ownerId, 'other-owner')
  const outsider = database()
  await assert.rejects(run(outsider, { teamId: 'demo', targetPhone: '13900000000' }, owner, { ...scope, teamId: 'other' }), error => error.code === 'TEAM_ACCESS_DENIED')
  await assert.rejects(run(outsider, { teamId: 'demo', targetPhone: '17300000000' }), error => error.code === 'TEAM_TRANSFER_SAME_ACCOUNT')
  await assert.rejects(run(outsider, { teamId: 'demo', targetPhone: '139' }), error => error.code === 'TEAM_TRANSFER_PHONE_INVALID')
  const duplicated = database({ users: [{ ...targetUser }, { _id: 'target-user-2', phoneNumber: '13900000000' }] })
  await assert.rejects(run(duplicated, { teamId: 'demo', targetPhone: '13900000000' }), error => error.code === 'TEAM_TRANSFER_ACCOUNT_CONFLICT')
  assert.equal(duplicated.store.teams[0].ownerId, 'owner-user')
  assert.equal(duplicated.writes.length, 0)

  // 4. 事务前所有权被改动时必须中止。
  const changed = database()
  changed.beforeTransaction = store => { store.teams[0].ownerId = 'someone-else' }
  await assert.rejects(run(changed, { teamId: 'demo', targetPhone: '13900000000' }), error => error.code === 'TEAM_CHANGED')
  assert.equal(changed.store.teams[0].ownerId, 'someone-else')

  // 5. 受让人登录自动认领，并且不抢已被别人持有的球队。
  const login = database({ teams: [{ ...team, ownerId: '', ownerUserId: '', claimedByUserId: '', pendingOwnerPhone: '13900000000' }], team_memberships: [] })
  assert.equal(await bind(login, { ...targetUser, phone: '13900000000' }), 1)
  const claimed = login.store.teams[0]
  assert.equal(claimed.ownerId, 'target-user')
  assert.equal(claimed.pendingOwnerPhone, '')
  assert.equal(claimed.claimStatus, 'claimed')
  const loginRow = login.store.team_memberships.find(row => row.userId === 'target-user')
  assert.deepEqual(loginRow.permissions, ['team.view', 'team.manage'])
  assert.equal(login.store.team_owner_transfers[0].mode, 'owner_transfer_claim_on_login')
  assert.equal(await bind(login, { ...targetUser, phone: '13900000000' }), 0)
  const taken = database({ teams: [{ ...team, ownerId: 'other-owner', pendingOwnerPhone: '13900000000' }] })
  assert.equal(await bind(taken, { ...targetUser, phone: '13900000000' }), 0)
  assert.equal(taken.store.teams[0].ownerId, 'other-owner')

  // 6. 球队资料页入口：确认移交后清理本地工作空间并回到球队列表。
  const ui = profilePage({ transferTeamOwnerDirect: data => ({ success: true, hasAccount: data.targetPhone === '13900000000' }) },
    [{ confirm: true, content: '13900000000' }, { confirm: true }])
  ui.page.data.isOwner = true
  ui.page.transferTeamOwner()
  await new Promise(resolve => setTimeout(resolve, 1300))
  const call = ui.actions.find(row => row[0] === 'call')
  assert.equal(call[1], 'transferTeamOwnerDirect')
  assert.equal(call[2].targetPhone, '13900000000')
  assert.equal(call[2].teamId, 'demo')
  assert.equal(call[2].workspaceId, scope.id)
  assert.equal(ui.cleared, true)
  assert.equal(ui.storage.teamInfo, undefined)
  assert.ok(ui.actions.some(row => row[0] === 'navigate' && row[1] === '/pages/teams/index'))
  assert.equal(ui.page.data.transferBusy, false)

  // 7. 取消输入或非主账号时不得发起请求。
  const cancelled = profilePage({ transferTeamOwnerDirect: { success: true } }, [{ confirm: false }])
  cancelled.page.data.isOwner = true
  cancelled.page.transferTeamOwner()
  assert.equal(cancelled.actions.filter(row => row[0] === 'call').length, 0)
  const notOwner = profilePage({ transferTeamOwnerDirect: { success: true } }, [{ confirm: true, content: '13900000000' }, { confirm: true }])
  notOwner.page.data.isOwner = false
  notOwner.page.transferTeamOwner()
  assert.equal(notOwner.actions.filter(row => row[0] === 'call').length, 0)

  // 8. 移交同时解除主办方预建认领邀请对原账号的绑定（否则原账号仍会拿到含 team.manage 的临时球队空间）。
  const invites = database({
    users: [],
    team_invitations: [
      { _id: 'claim-own', teamId: 'demo', type: 'prebuilt_tournament_team', status: 'accepted', acceptedUserId: 'owner-user', acceptedOpenId: 'owner-openid', allowedClaimPhones: ['17300000000'] },
      { _id: 'claim-other', teamId: 'demo', type: 'prebuilt_tournament_team', status: 'accepted', acceptedUserId: 'other-user', acceptedOpenId: 'other-openid', allowedClaimPhones: ['13900000002'] },
      { _id: 'stale-transfer', teamId: 'demo', type: 'team_owner_transfer', status: 'active', targetPhone: '13900000003' }
    ]
  })
  await run(invites, { teamId: 'demo', targetPhone: '13900000001' })
  const ownInvite = invites.store.team_invitations.find(row => row._id === 'claim-own')
  assert.equal(ownInvite.status, 'accepted')
  assert.equal(ownInvite.acceptedUserId, '')
  assert.equal(ownInvite.acceptedOpenId, '')
  assert.equal(ownInvite.previousAcceptedUserId, 'owner-user')
  assert.equal(ownInvite.previousAcceptedOpenId, 'owner-openid')
  assert.deepEqual(ownInvite.allowedClaimPhones, ['13900000001'])
  assert.deepEqual(ownInvite.previousAllowedClaimPhones, ['17300000000'])
  const otherInvite = invites.store.team_invitations.find(row => row._id === 'claim-other')
  assert.equal(otherInvite.acceptedUserId, 'other-user')
  assert.deepEqual(otherInvite.allowedClaimPhones, ['13900000002'])
  assert.equal(invites.store.team_invitations.find(row => row._id === 'stale-transfer').status, 'cancelled')

  console.log('team owner transfer: 8 groups passed')
}

main().catch(error => { console.error(error); process.exit(1) })
