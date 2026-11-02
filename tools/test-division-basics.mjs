import assert from 'node:assert/strict'
import {buildDivisionBasics,divisionParticipantType,divisionBasicsLocked,virtualTeamMatchesDivision,youthBirthRange,adultBirthRange} from '../web-admin-vue/src/utils/divisionBasics.js'
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
assert.equal(divisionBasicsLocked({rulesLocked:true}, {status:'ongoing',startDate:'2020-01-01'}, {canEdit:true,hasSchedule:false}),false)
assert.equal(divisionBasicsLocked({ruleStatus:'draft'}, {}, {canEdit:true,hasSchedule:false}),false)
assert.equal(divisionBasicsLocked({ruleStatus:'draft'}, {}, {canEdit:false,hasSchedule:true}),true)
assert.equal(divisionBasicsLocked({ruleStatus:'draft'}),true,'unconfirmed schedule state must stay disabled')
const pool=workspace.request('dbQuery',{collection:'teams',operation:'list',where:{synthetic:true}}).data
assert.ok(pool.length>0)
const candidates=[{id:'u14',ageGroup:'U14'},{id:'u13',ageGroup:'U13'},{id:'adult',ageGroup:'成人'}]
assert.deepEqual(candidates.filter(team=>virtualTeamMatchesDivision(team,saved)).map(team=>team.id),['u14'])
assert.deepEqual(candidates.filter(team=>virtualTeamMatchesDivision(team,{participantType:'adult',ageGroup:'成人组'})).map(team=>team.id),['adult'])
assert.deepEqual(youthBirthRange('U8',{startDate:'2026-10-08'}),{birthDateStart:'2018-01-01',birthDateEnd:'',competitionYear:2026})
assert.equal(youthBirthRange('U8',{startDate:'2027-01-01'}).birthDateStart,'2019-01-01')
assert.equal(youthBirthRange('U8',{startDate:'2026-01-01',competitionYear:2025}).birthDateStart,'2017-01-01')
assert.equal(youthBirthRange('open',{startDate:'2026-01-01'}),null)
assert.equal(youthBirthRange('U8',{}),null)
assert.deepEqual(adultBirthRange({startDate:'2026-10-08'}),{birthDateStart:'',birthDateEnd:'2010-12-31',competitionYear:2026})
assert.equal(adultBirthRange({startDate:'2027-01-01'}).birthDateEnd,'2011-12-31')
assert.equal(adultBirthRange({}),null)
console.log('PASS: edit age, birth bounds, match format and capacity; preserve roster limit; distinguish participant type from legacy edition; prevent undersized capacity and invalid dates; age-specific virtual pools remain available')
