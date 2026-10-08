import assert from 'node:assert/strict'
import { createDemoWorkspace } from '../web-admin-vue/src/utils/demoWorkspace.mjs'

const workspace = createDemoWorkspace()
const api = (name, params) => workspace.request(name, params)
const list = (collection, where) => api('dbQuery', { collection, operation:'list', where }).data
assert.deepEqual(list('tournaments'), [])
const tournament = api('dbQuery', { collection:'tournaments', operation:'add', data:{ name:'模拟联赛', startDate:'2026-10-07', divisions:[{ id:'demo-adult', name:'成人组', rules:{ ranking:{ points:{ win:3, draw:1, loss:0 } } } }] } }).data
const teams = list('teams', { synthetic:true, ageGroup:'成人' }).slice(0, 2)
assert.equal(teams.length, 2)
assert.ok(list('players', { teamId:teams[0]._id }).every(row => row.synthetic && row.isTest))
api('tournamentRegistrationFlow', { action:'addSyntheticTeams', tournamentId:tournament._id, divisionId:'demo-adult', teamIds:teams.map(row => row._id) })
api('tournamentRegistrationFlow', { action:'addSyntheticTeams', tournamentId:tournament._id, divisionId:'demo-adult', teamIds:teams.map(row => row._id) })
assert.equal(list('tournament_teams').length, 2, 'repeating selection must not duplicate teams')
api('generateSchedule', { action:'generatePairings', tournamentId:tournament._id, divisionId:'demo-adult', divisionName:'成人组' })
api('generateSchedule', { action:'scheduleExistingPairings', tournamentId:tournament._id, divisionId:'demo-adult', scheduleConfig:{ startDate:'2026-10-07', venues:['虚拟球场'] } })
const match = list('matches')[0]
const referee = list('referees', { tournamentId:tournament._id })[0]
assert.ok(referee)
api('updateMatch', { matchId:match._id, data:{ refereeCrew:{ mainReferee:referee._id }, events:[{ eventId:'goal1', type:'goal', teamId:teams[0]._id }, { eventId:'goal1', type:'goal', teamId:teams[0]._id, revision:2 }, { eventId:'deleted', type:'goal', teamSide:'away', deleted:true }] } })
assert.throws(() => api('updateMatch', { matchId:match._id, expectedEventRevision:0, data:{ status:'finished' } }), /已更新/)
api('updateMatch', { action:'finishOrganizerMatch', matchId:match._id, expectedEventRevision:1, data:{ homeScore:99, awayScore:99 } })
const results = api('resultCenter', { action:'dashboard', tournamentId:tournament._id })
assert.equal(results.matches[0].homeScore, 1)
assert.equal(results.matches[0].awayScore, 0)
assert.equal(results.standings[0].officialTeams[0].points, 3)
assert.throws(() => api('dbQuery', { collection:'tournaments', operation:'update', id:'real-event', data:{} }), /没有这条记录/)
assert.throws(() => api('tournamentRegistrationFlow', { action:'createTargetedTeamInvitations', tournamentId:tournament._id }), /不发送真实/)
assert.throws(() => api('unimplementedWrite', {}), /不会调用真实接口/)
const refreshed = createDemoWorkspace()
refreshed.restore(workspace.snapshot())
assert.equal(refreshed.request('dbQuery', { collection:'matches', operation:'get', id:match._id }).data.homeScore, 1)
assert.deepEqual(createDemoWorkspace().request('dbQuery', { collection:'tournaments', operation:'list' }).data, [])
console.log('PASS: isolated create / virtual roster / pairing / referee / event score / standings / refresh / rejected real ID and unsupported writes')
