'use strict'
const assert = require('node:assert/strict')
const directory = require('../cloudfunctions/getMiniWorkspace/selfPlayerTeamDirectory.cjs')
const teams = new Map(), players = new Map()
const db = {
  command: { or: rows => rows }, RegExp: value => new RegExp(value.regexp, value.options), serverDate: () => new Date(),
  runTransaction: async fn => fn(db), collection: name => ({
    doc: id => ({ get: async () => ({ data: (name === 'teams' ? teams : players).get(id) }), update: async ({ data }) => { const map = name === 'teams' ? teams : players; map.set(id, { ...map.get(id), ...data }) } }),
    where: conditions => {
      let offset = 0, limit = 100
      const q = { orderBy: () => q, skip: n => { offset = n; return q }, limit: n => { limit = n; return q }, get: async () => ({ data: [...teams.values()].filter(row => conditions.some(condition => Object.entries(condition).some(([key, expression]) => expression.test(row[key] || '')))).sort((a,b) => a._id.localeCompare(b._id)).slice(offset, offset + limit) }) }
      return q
    }
  })
}
const identity = { user: { _id: 'u1' } }
const loadManagedTeams = async () => [teams.get('1')]
const run = event => directory({ db, identity, event, loadManagedTeams })
;(async () => {
  teams.set('1', { _id: '1', name: '开封立洋队', city: '开封', ownerId: 'u1', managerPhone: 'secret' })
  teams.set('2', { _id: '2', name: '开封立洋二队', city: '开封' })
  teams.set('3', { _id: '3', name: '开封立洋测试队', source: 'ai_fixture' })
  players.set('p1', { _id: 'p1', linkedUserId: 'u1' })
  players.set('p2', { _id: 'p2', linkedUserId: 'u2' })
  assert.equal((await run({ subAction: 'teams' })).teams.length, 1)
  const result = await run({ subAction: 'searchTeams', keyword: '立洋' })
  assert.deepEqual(result.teams.map(row => row.id), ['1','2'])
  assert.equal(result.teams[0].canManage, true)
  assert.equal(result.teams[1].canManage, false)
  assert.equal(JSON.stringify(result).includes('secret'), false)
  assert.equal((await run({ subAction: 'searchTeams', keyword: '.*' })).teams.length, 0)
  assert.equal((await run({ subAction: 'searchTeams', keyword: '队' })).code, 'TEAM_SEARCH_INVALID')
  assert.equal((await run({ subAction: 'searchTeams', keyword: '立洋', offset: -1 })).success, false)
  assert.equal((await run({ subAction: 'requestTeamJoin', playerId: 'p2', teamId: '2', agreed: true })).code, 'SELF_PLAYER_FORBIDDEN')
  assert.equal((await run({ subAction: 'requestTeamJoin', playerId: 'p1', teamId: '3', agreed: true })).code, 'TEAM_UNAVAILABLE')
  assert.equal((await run({ subAction: 'requestTeamJoin', playerId: 'p1', teamId: '2', agreed: true })).status, 'pending')
  assert.equal(players.get('p1').teamId, undefined)
  const firstId = players.get('p1').pendingJoinRequestId
  assert.equal((await run({ subAction: 'requestTeamJoin', playerId: 'p1', teamId: '2', agreed: true })).success, true)
  assert.equal(players.get('p1').pendingJoinRequestId, firstId)
  assert.equal((await run({ subAction: 'requestTeamJoin', playerId: 'p1', teamId: '1', agreed: true })).code, 'PLAYER_JOIN_PENDING')
  players.set('p1', { _id: 'p1', linkedUserId: 'u1', teamId: 'old' })
  assert.equal((await run({ subAction: 'requestTeamJoin', playerId: 'p1', teamId: '2', agreed: true })).code, 'PLAYER_TEAM_CONFLICT')
  for (let i = 0; i < 25; i++) teams.set('page-' + i, { _id: 'page-' + i, name: '分页球队' + i })
  const page = await run({ subAction: 'searchTeams', keyword: '分页' })
  assert.equal(page.teams.length, 20); assert.equal(page.hasMore, true)
  assert.equal((await run({ subAction: 'searchTeams', keyword: '分页', offset: page.nextOffset })).teams.length, 5)
  console.log('self-player-team-directory: all assertions passed')
})().catch(error => { console.error(error); process.exitCode = 1 })
