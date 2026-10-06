import assert from 'node:assert/strict'
import { TOURNAMENT_SIDEBAR_RIGHTS, TOURNAMENT_SIDEBAR_KEYS, invitationLandingPath, sidebarRightForRoute, visibleSidebarKeys } from '../web-admin-vue/src/utils/tournamentStaffRights.js'

assert.equal(TOURNAMENT_SIDEBAR_RIGHTS.length, 10)
assert.equal(new Set(TOURNAMENT_SIDEBAR_KEYS).size, 10)
for (const item of TOURNAMENT_SIDEBAR_RIGHTS) {
  assert.equal(sidebarRightForRoute(`/tournaments/event-1${item.suffix}`), item.key, item.label)
}
assert.equal(sidebarRightForRoute('/tournaments/event-1/match/m-1/review'), 'event.results')
assert.equal(sidebarRightForRoute('/tournaments/event-1/match/m-1/post-match'), 'event.results')
assert.equal(sidebarRightForRoute('/tournaments/event-1/match/m-1/monitor'), 'event.matches')
assert.equal(sidebarRightForRoute('/tournaments/event-1/teams/t-1'), 'event.teams')
assert.equal(sidebarRightForRoute('/tournaments/event-1/signups'), 'event.registration')
assert.equal(sidebarRightForRoute('/tournaments/event-1/roster-exceptions'), 'event.teams')
assert.equal(sidebarRightForRoute('/tournaments/event-1/unknown'), '')
assert.equal(visibleSidebarKeys(['result.supplement']).has('event.results'), true)
assert.equal(visibleSidebarKeys(['news.edit']).has('event.news'), true)
assert.equal(visibleSidebarKeys(['event.referees']).has('event.settings'), false)
const ownerWithInvitation = { success:true, isOwner:true, isStaff:true, invitations:[{ id:'invite-a' }] }
assert.equal(invitationLandingPath(ownerWithInvitation, '/tournament-space'), '/tournament-staff')
assert.equal(invitationLandingPath(ownerWithInvitation, '/service-account-binding', true), '/tournament-staff')
assert.equal(invitationLandingPath(ownerWithInvitation, '/tournament-space', true), '')
assert.equal(invitationLandingPath(ownerWithInvitation, '/tournament-staff'), '')
assert.equal(invitationLandingPath({ success:true, invitations:[] }, '/tournament-space'), '')
console.log('tournament sidebar rights: ten modules, deep routes, legacy grants and deny by default passed')
