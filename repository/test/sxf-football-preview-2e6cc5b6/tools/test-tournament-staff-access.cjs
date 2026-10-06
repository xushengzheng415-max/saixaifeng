const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const Module = require('node:module')
const path = require('node:path')

const rows = {
  users: [
    { _id: 'owner-user', phone: '13800000001', orgId: 'org-a' },
    { _id: 'staff-user', phone: '13800000002', orgId: '' }
  ],
  organizations: [{ _id: 'org-a', ownerId: 'owner-user' }],
  tournaments: [{ _id: 'event-a', orgId: 'org-a', name: '测试赛事' }],
  auth_sessions: [
    { _id: 'session-owner', userId: 'owner-user', tokenHash: crypto.createHash('sha256').update('owner-token').digest('hex'), active: true, expiresAt: new Date(Date.now() + 60000), activeOrgId: 'org-a' },
    { _id: 'session-staff', userId: 'staff-user', tokenHash: crypto.createHash('sha256').update('staff-token').digest('hex'), active: true, expiresAt: new Date(Date.now() + 60000), activeOrgId: '' }
  ],
  tournament_staff_grants: [], organization_memberships: [], tournament_staff_audit: []
}
let nextId = 1
const command = { gt: value => ({ operator: 'gt', value }), or: clauses => ({ operator: 'or', clauses }) }
function matches(row, filter) {
  if (filter?.operator === 'or') return filter.clauses.some(clause => matches(row, clause))
  return Object.entries(filter || {}).every(([key, wanted]) => wanted?.operator === 'gt' ? row[key] > wanted.value : row[key] === wanted)
}
const db = {
  command,
  serverDate: () => new Date(),
  async runTransaction(work) { return work(db) },
  collection(name) {
    if (!rows[name]) rows[name] = []
    return {
      where(filter) { return { limit(count) { return { async get() { return { data: rows[name].filter(row => matches(row, filter)).slice(0, count) } } } } } },
      doc(id) { return {
        async get() { const row = rows[name].find(item => item._id === id); if (!row) throw new Error('missing'); return { data: row } },
        async update({ data }) { const row = rows[name].find(item => item._id === id); if (!row) throw new Error('missing'); Object.assign(row, data) }
      } },
      async add({ data }) { const id = data._id || `test-${nextId++}`; if (rows[name].some(item => item._id === id)) throw new Error('duplicate'); rows[name].push({ ...data, _id: id }); return { _id: id } }
    }
  }
}
const fakeCloud = { DYNAMIC_CURRENT_ENV: 'test', init() {}, database: () => db, getWXContext: () => ({ OPENID: '' }) }
const originalLoad = Module._load
Module._load = function (name, parent, isMain) { return name === 'wx-server-sdk' ? fakeCloud : originalLoad.call(this, name, parent, isMain) }
const service = require(path.join(__dirname, '../cloudfunctions/tournamentStaffAccess/index.js'))
Module._load = originalLoad

async function main() {
  const owner = event => service.main({ __authToken: 'owner-token', ...event })
  const staff = event => service.main({ __authToken: 'staff-token', ...event })
  const invited = await owner({ action: 'invite', tournamentId: 'event-a', phone: '13800000002', permissions: ['result.supplement'] })
  assert.equal(invited.success, true)
  assert.equal((await staff({ action: 'managed' })).success, false)
  assert.equal((await staff({ action: 'invitations' })).invitations.length, 1)
  assert.equal((await staff({ action: 'accept', grantId: invited.grantId })).success, true)
  assert.equal((await staff({ action: 'scope' })).grants[0].permissions[0], 'result.supplement')
  assert.equal(rows.organization_memberships[0].permissions.includes('event.manage'), false)
  assert.equal((await owner({ action: 'disable', grantId: invited.grantId })).success, true)
  assert.equal((await staff({ action: 'scope' })).grants.length, 0)
  assert.equal(rows.tournament_staff_audit.length, 3)
  console.log('tournament staff access: invite, accept, scope, disable and audit passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
