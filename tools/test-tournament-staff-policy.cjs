const assert = require('node:assert/strict')
const policy = require('../cloudfunctions/tournamentStaffAccess/policy.cjs')
const fs = require('node:fs')
const path = require('node:path')

const records = {
  organizations: [{ _id: 'org-a', ownerId: 'owner-a' }, { _id: 'org-b', ownerId: 'owner-b' }],
  tournaments: [{ _id: 'event-a', orgId: 'org-a' }, { _id: 'event-b', orgId: 'org-b' }],
  organization_memberships: [{ orgId: 'org-a', userId: 'staff-a', role: 'tournament_staff', source: 'tournament_staff_invite', permissions: ['event.view'] }],
  tournament_staff_grants: [{ orgId: 'org-a', tournamentId: 'event-a', userId: 'staff-a', status: 'active', permissions: ['result.supplement'] }]
}
const db = { collection(name) { return {
  doc(id) { return { async get() { const row = (records[name] || []).find(item => item._id === id); if (!row) throw new Error('missing'); return { data: row } } } },
  where(filter) { return { limit() { return { async get() { return { data: (records[name] || []).filter(row => Object.entries(filter).every(([key, value]) => row[key] === value)) } } } } } }
} } }

async function main() {
  assert.equal(policy.SIDEBAR_RIGHTS.length, 10)
  const source = fs.readFileSync(path.join(__dirname, '../cloudfunctions/tournamentStaffAccess/policy.cjs'), 'utf8')
  for (const name of ['newsCenter', 'newsPreviewGenerate', 'resultCenter', 'webLoginApi', 'updateMatch', 'generateSchedule', 'tournamentRegistrationFlow', 'tournamentReview', 'organizerClaimInvite', 'reviewRosterChange', 'dataCenter', 'uploadFile']) {
    assert.equal(fs.readFileSync(path.join(__dirname, `../cloudfunctions/${name}/staffPolicy.cjs`), 'utf8'), source, `${name} policy copy drifted`)
  }
  assert.equal(await policy.owner(db, 'owner-a', 'org-a'), true)
  assert.equal(await policy.owner(db, 'owner-a', 'org-b'), false)
  assert.equal(await policy.isStaff(db, 'staff-a', 'org-a'), true)
  assert.equal(await policy.hasRight(db, 'staff-a', 'org-a', 'event-a', 'result.supplement'), true)
  assert.equal(await policy.hasRight(db, 'staff-a', 'org-a', 'event-a', 'news.edit'), false)
  records.tournament_staff_grants[0].permissions = ['event.results', 'event.news']
  assert.equal(await policy.hasRight(db, 'staff-a', 'org-a', 'event-a', 'result.supplement'), true)
  assert.equal(await policy.hasRight(db, 'staff-a', 'org-a', 'event-a', 'news.publish'), true)
  assert.equal(await policy.hasRight(db, 'staff-a', 'org-b', 'event-b', 'result.supplement'), false)
  records.tournament_staff_grants[0].status = 'disabled'
  assert.equal(await policy.hasRight(db, 'staff-a', 'org-a', 'event-a', 'result.supplement'), false)
  assert.equal(await policy.isStaff(db, 'staff-a', 'org-a'), true)
  console.log('tournament staff policy: sidebar aliases, scope, revoke and deployment copies passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
