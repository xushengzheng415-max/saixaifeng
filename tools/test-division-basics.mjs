import assert from 'node:assert/strict'
import {buildDivisionBasics,divisionParticipantType,divisionBasicsLocked,virtualTeamMatchesDivision} from '../web-admin-vue/src/utils/divisionBasics.js'
import {createDemoWorkspace} from '../web-admin-vue/src/utils/demoWorkspace.mjs'
const workspace=createDemoWorkspace()
const event=workspace.request('dbQuery',{collection:'tournaments',operation:'add',data:{name:'组别设置演示'}}).data
const original=workspace.request('dbQuery',{collection:'divisions',operation:'list',where:{tournamentId:event._id}}).data[0]
const form={name:'U14男子组',participantType:'youth',ageGroup:'U14',gender:'男子组',matchFormat:'8side',expectedTeams:8,birthDateStart:'2012-01-01',birthDateEnd:'2012-12-31'}
const payload=buildDivisionBasics(form,{tournamentId:event._id,existing:{maxPlayersPerTeam:12},registeredTeams:2})
workspace.request('dbQuery',{collection:'divisions',operation:'update',id:original._id,data:payload})
const saved=workspace.request('dbQuery',{collection:'divisions',operation:'get',id:original._id}).data
assert.equal(saved.participantType,'youth');assert.equal(saved.ageGroup,'U14');assert.equal(saved.playersOnField,8);assert.equal(saved.expectedTeams,8);assert.equal(saved.maxPlayersPerTeam,12)
assert.equal(saved.mode,'simple');assert.equal(saved.isProfessional,false)
assert.throws(()=>buildDivisionBasics({...form,expectedTeams:2},{registeredTeams:3}),/已有3支/)
assert.throws(()=>buildDivisionBasics({...form,birthDateStart:'2012-02-30'}),/无效/)
assert.throws(()=>buildDivisionBasics({...form,birthDateStart:'2013-01-01',birthDateEnd:'2012-01-01'}),/不能晚于/)
assert.equal(divisionParticipantType({ageGroup:'成人组'}),'adult')
assert.equal(divisionParticipantType({ageGroup:'U14',mode:'professional'}),'youth','legacy edition must not become participant category')
assert.equal(divisionBasicsLocked({rulesLocked:true}),true)
assert.equal(divisionBasicsLocked({}, {status:'ongoing'}),true)
assert.equal(divisionBasicsLocked({ruleStatus:'draft'}),false)
const pool=workspace.request('dbQuery',{collection:'teams',operation:'list',where:{synthetic:true}}).data
assert.equal(pool.filter(team=>virtualTeamMatchesDivision(team,saved)).length,8)
assert.equal(pool.filter(team=>virtualTeamMatchesDivision(team,{participantType:'adult',ageGroup:'成人组'})).length,8)
console.log('PASS: edit age, birth bounds, match format and capacity; preserve roster limit; distinguish participant type from legacy edition; prevent undersized capacity and invalid dates; age-specific virtual pools remain available')
