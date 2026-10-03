import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { calculateMatchEventScore } from '../cloudfunctions/dataCenter/shared/statistics.mjs'
import { matchListQuery, matchSourceQuery } from '../web-admin-vue/src/utils/matchListContext.js'
import { firstUnfinishedMatchDate } from '../web-admin-vue/src/utils/matchCalendarSelection.js'

const goal = (eventId, type = 'goal', teamSide = 'home', extra = {}) => ({eventId,type,teamSide,...extra})
assert.deepEqual(calculateMatchEventScore({events:[goal('1'),goal('2','penalty_scored','away'),goal('3','own_goal','away')]}),{home:2,away:1})
assert.deepEqual(calculateMatchEventScore({events:[goal('1'),goal('1'),goal('2','penalty_missed'),goal('3','goal','away',{deleted:true}),goal('4','penalty_scored','away',{phase:'shootout'})]}),{home:1,away:0})
assert.deepEqual(calculateMatchEventScore({events:[]}),{home:0,away:0})
assert.equal(calculateMatchEventScore({}),null)
assert.throws(()=>calculateMatchEventScore({events:[{type:'goal'}]}),/缺少有效球队/)
const source = {divisionId:'middle',listDate:'2026-10-01',listDivision:'all',listView:'map'}
assert.deepEqual(matchListQuery(source),{date:'2026-10-01'})
assert.deepEqual(matchListQuery({...source,listDivision:'middle'}),{date:'2026-10-01',divisionId:'middle'})
assert.deepEqual(matchListQuery({...source,listDate:'invalid'}),{})
assert.deepEqual(matchListQuery(matchSourceQuery(source)),{date:'2026-10-01'})
assert.deepEqual(matchListQuery({...source,listView:'workbench'}),{date:'2026-10-01',view:'workbench'})
const scheduleSource=fs.readFileSync(new URL('../web-admin-vue/src/views/tournament/TournamentScheduleV2.vue',import.meta.url),'utf8')
const routeContext={tournamentId:'t',selectedDate:{value:'2026-10-01'},divisionFilter:{value:'all'},view:{value:'map'},arrangedMatches:{value:[]},firstUnfinishedMatchDate,managementState:match=>({key:match.state})}
vm.createContext(routeContext)
vm.runInContext(scheduleSource.slice(scheduleSource.indexOf('function matchRoute('),scheduleSource.indexOf('function openMatchWorkspace')),routeContext)
assert.deepEqual(matchListQuery(routeContext.matchRoute({_id:'m',divisionId:'middle'}).query),{date:'2026-10-01'})
vm.runInContext('const restoreDate = '+scheduleSource.match(/watch\(calendarDays, ([\s\S]*?), \{ immediate:true \}\)/)[1],routeContext)
vm.runInContext('restoreDate([])',routeContext)
assert.equal(routeContext.selectedDate.value,'2026-10-01')
vm.runInContext("restoreDate([{date:'2026-09-26'},{date:'2026-10-01'}])",routeContext)
assert.equal(routeContext.selectedDate.value,'2026-10-01')
routeContext.selectedDate.value=''
routeContext.arrangedMatches.value=[{matchDate:'2026-09-26',state:'completed'},{matchDate:'2026-10-01',state:'scheduled'},{matchDate:'2026-10-04',state:'scheduled'}]
vm.runInContext("restoreDate([{date:'2026-09-26'},{date:'2026-10-01'},{date:'2026-10-04'}])",routeContext)
assert.equal(routeContext.selectedDate.value,'2026-10-01')
routeContext.arrangedMatches.value[1].state='completed'
vm.runInContext("restoreDate([{date:'2026-09-26'},{date:'2026-10-01'},{date:'2026-10-04'}])",routeContext)
assert.equal(routeContext.selectedDate.value,'2026-10-01')
routeContext.selectedDate.value=''
vm.runInContext("restoreDate([{date:'2026-09-26'},{date:'2026-10-01'},{date:'2026-10-04'}])",routeContext)
assert.equal(routeContext.selectedDate.value,'2026-10-04')
assert.equal(routeContext.divisionFilter.value,'all')
const detailSource=fs.readFileSync(new URL('../web-admin-vue/src/views/tournament/MatchDetail.vue',import.meta.url),'utf8')
let successMessages=0, errorMessages=0
const failedSaveContext={saving:{value:false},matchId:'m',match:{value:{status:'scheduled',homeScore:0,awayScore:0}},finishForm:{value:{homeScore:2,awayScore:1}},finishDialogVisible:{value:true},ensureEvidenceEditable:()=>true,callFunction:async()=>({success:false,message:'比赛执行快照已经固化'}),loadMatch:async()=>{throw new Error('must not reload on rejected save')},ElMessage:{success:()=>successMessages++,error:()=>errorMessages++}}
vm.createContext(failedSaveContext)
vm.runInContext(detailSource.slice(detailSource.indexOf('async function finishMatch()'),detailSource.indexOf('// 编辑比赛',detailSource.indexOf('async function finishMatch()'))),failedSaveContext)
await failedSaveContext.finishMatch()
assert.equal(successMessages,0)
assert.equal(errorMessages,1)
assert.equal(failedSaveContext.match.value.status,'scheduled')
assert.equal(failedSaveContext.finishDialogVisible.value,true)

const sourceCode = fs.readFileSync(new URL('../cloudfunctions/updateMatch/index.js',import.meta.url),'utf8').replaceAll("await import('./data-center/statistics.mjs')",'await __statistics()')
async function finish(overrides={}, request={}, race=false) {
  const rows = {
    matches:{m:{_id:'m',orgId:'org',tournamentId:'t',divisionId:'default',status:'ongoing',events:[goal('1'),goal('2','goal','away'),goal('3')],matchEventRevision:2,executionSnapshot:{homeTeamId:'h'},...overrides}},
    tournaments:{t:{_id:'t',orgId:'org',competitionPlanLocked:true}},
    auth_sessions:{s:{_id:'s',userId:'u',orgId:'org',expiresAt:new Date(Date.now()+600000)}},
    users:{u:{_id:'u',orgId:'org',role:'organizer'}},
    organizations:{org:{_id:'org'}}
  }
  let writes=0
  const db = {command:{gt:()=>({}),in:()=>({}),neq:()=>({})},serverDate:()=>new Date(),collection(name) {
    const result = {where:()=>result,limit:()=>result,get:async()=>({data:structuredClone(Object.values(rows[name]||{}))}),doc(id){return {get:async()=>({data:rows[name]?.[id]?[structuredClone(rows[name][id])]:[]}),update:async({data})=>{writes++;Object.assign(rows[name][id],data)}}}}
    return result
  },runTransaction:async fn=>{if(race) rows.matches.m.matchEventRevision++;return fn(db)}}
  const cloud={init(){},DYNAMIC_CURRENT_ENV:'test',database:()=>db}
  const context={exports:{},require:name=>name==='wx-server-sdk'?cloud:name==='crypto'?awaitCrypto:null,__statistics:async()=>({calculateMatchEventScore}),console:{log(){},warn(){},error(){}},Date,Set,Map,Buffer}
  vm.runInNewContext(sourceCode,context)
  const result=await context.exports.main({__authToken:'test',matchId:'m',action:'finishOrganizerMatch',expectedEventRevision:2,data:{status:'finished',homeScore:99,awayScore:99},...request},{})
  return {result,match:rows.matches.m,writes}
}
const awaitCrypto = (await import('node:crypto')).default
const settled=await finish()
assert.equal(settled.result.success,true,JSON.stringify(settled.result))
assert.equal(settled.match.status,'finished')
assert.equal(settled.match.homeScore,2)
assert.equal(settled.match.awayScore,1)
assert.equal(settled.match.scoreHome,2)
assert.equal(settled.writes,1)
const empty=await finish({events:[]})
assert.equal(empty.match.homeScore,0)
for (const [overrides,request,race] of [
  [{refereeRecordLocked:true},{},false],
  [{status:'scheduled'},{},false],
  [{},{expectedEventRevision:1},false],
  [{},{data:{status:'finished',venue:'other'}},false],
  [{},{},true]
]) {
  const denied=await finish(overrides,request,race)
  assert.equal(denied.result.success,false,JSON.stringify(denied.result))
  assert.equal(denied.writes,0)
}
console.log('PASS: event settlement, zero score, own goals, penalties, deduplication, list context, locked results, revision conflicts and atomic completion')
