import assert from 'node:assert/strict'
import {createDemoWorkspace} from '../web-admin-vue/src/utils/demoWorkspace.mjs'
const old=createDemoWorkspace()
const event=old.request('dbQuery',{collection:'tournaments',operation:'add',data:{name:'原有模拟赛事'}}).data
const snapshot=old.snapshot()
const removed=new Set(snapshot.tables.teams.filter(team=>team.ageGroup==='open'||/球队[5-8]$/.test(team.name)).map(team=>team._id))
snapshot.tables.teams=snapshot.tables.teams.filter(team=>!removed.has(team._id))
snapshot.tables.players=snapshot.tables.players.filter(player=>!removed.has(player.teamId))
const upgraded=createDemoWorkspace()
upgraded.restore(snapshot)
assert.equal(upgraded.request('dbQuery',{collection:'tournaments',operation:'get',id:event._id}).data.name,'原有模拟赛事')
const teams=upgraded.request('dbQuery',{collection:'teams',operation:'list',where:{synthetic:true,ageGroup:'open'}}).data
assert.equal(teams.length,8)
assert.ok(teams.every(team=>team.playerCount===12))
const before=upgraded.snapshot()
upgraded.restore(before)
assert.equal(upgraded.snapshot().tables.teams.length,before.tables.teams.length,'reload must not duplicate the virtual pool')
const allPlayers=upgraded.snapshot().tables.players
assert.equal(new Set(allPlayers.map(player=>player._id)).size,allPlayers.length)
assert.ok(allPlayers.every(player=>upgraded.snapshot().tables.teams.some(team=>team._id===player.teamId)))
console.log('PASS: old browser demo upgraded with 8 matching youth teams; event preserved; no duplicate IDs or repeated pool; player references valid')
