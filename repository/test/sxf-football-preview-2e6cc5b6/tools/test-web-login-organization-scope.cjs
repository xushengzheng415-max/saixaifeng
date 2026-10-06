const assert = require('node:assert/strict')
const path = require('node:path')
const functionRoot = process.env.SXF_FUNCTION_ROOT || path.join(__dirname, '../cloudfunctions')
const { chooseOrganizerOrganization } = require(path.join(functionRoot, 'webLoginApi/organizationScope.cjs'))
const { chooseOrganizerOrganization: chooseOnboardingOrganization } = require(path.join(functionRoot, 'onboardingWorkspace/organizationScope.cjs'))

const membership = (orgId, permissions = [], role = 'member') => ({ orgId, permissions, role })
assert.deepEqual(chooseOrganizerOrganization({
  validIds:['event-org','team-org-a','team-org-b'],
  explicitIds:['team-org-a'],
  memberships:[membership('team-org-a',['team.manage']),membership('team-org-b',['team.manage'])],
  tournamentOrgIds:['event-org'],
  teamOrgIds:['team-org-a','team-org-b']
}), { orgId:'event-org', organizationConflict:false })
assert.deepEqual(chooseOnboardingOrganization({
  validIds:['event-org','team-org-a','team-org-b'],
  explicitIds:['team-org-a'],
  tournamentOrgIds:['event-org'],
  memberships:[membership('team-org-a',['team.manage']),membership('team-org-b',['team.manage'])]
}), { orgId:'event-org', organizationConflict:false })
assert.deepEqual(chooseOrganizerOrganization({
  validIds:['event-a','event-b'], tournamentOrgIds:['event-a','event-b']
}), { orgId:'', organizationConflict:true })
assert.deepEqual(chooseOrganizerOrganization({
  validIds:['event-org','team-org'], memberships:[membership('event-org',['event.view']),membership('team-org',['team.manage'])], teamOrgIds:['team-org']
}), { orgId:'event-org', organizationConflict:false })
assert.deepEqual(chooseOrganizerOrganization({
  validIds:['team-org-a','team-org-b'], teamOrgIds:['team-org-a','team-org-b']
}), { orgId:'', organizationConflict:false })
console.log('web login organization scope: event authority is independent of team affiliations')
