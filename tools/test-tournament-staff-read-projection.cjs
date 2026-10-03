const assert = require('node:assert/strict')
const { projectStaffRead } = require('../cloudfunctions/webLoginApi/staffReadProjection.cjs')

const team = { _id: 'team-a', name: '球队', logo: 'logo.png', managerPhone: '13800138000', identityFile: 'private' }
const result = projectStaffRead('teams', team, 'event.results')
assert.deepEqual(result, { _id: 'team-a', name: '球队', logo: 'logo.png' })
assert.equal(projectStaffRead('teams', team, 'event.teams'), team)
const player = { _id: 'player-a', name: '球员', number: 8, identityNumber: 'secret', phone: '13800138000' }
assert.deepEqual(projectStaffRead('players', player, 'event.matches'), { _id: 'player-a', name: '球员', number: 8 })
const match = { _id: 'match-a', homeScore: 2, awayScore: 1, organizerSupplementFiles: ['private'], refereePhone: '13800138000' }
assert.deepEqual(projectStaffRead('matches', match, 'event.news'), { _id: 'match-a', homeScore: 2, awayScore: 1 })
console.log('tournament staff read projection: private team, player and match fields remain hidden')
