import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {inScope,matchGroupName} from '../cloudfunctions/dataCenter/shared/statistics.mjs'
const require=createRequire(import.meta.url)
const {rankings,journal}=require('../cloudfunctions/dataCenter/shared/presentation.cjs')
const fields=['appearances','starts','minutesPlayed','goals','assists','yellowCards','redCards']
function row(playerId,teamId,matchId,goals){const values=Object.fromEntries(fields.map(field=>[field,field==='goals'?goals:field==='appearances'?1:0]));return {playerId,playerName:playerId,teamId,tournamentId:'T',divisionId:'D',metrics:{...values},observed:{...values},coverage:Object.fromEntries(fields.map(field=>[field,'complete'])),matchIds:[matchId],startMatchIds:[]}}
const missing=row('p2','A','m3',1);missing.metrics.goals=null;missing.coverage.goals='partial'
const board=await rankings({players:[row('p1','A','m1',2),row('p1','B','m2',3),missing],teams:[{teamId:'A',teamName:'A',wins:1,goalsFor:2,goalsAgainst:null}]})
assert.equal(board.players.goals.rows[0].id,'p1');assert.equal(board.players.goals.rows[0].value,5)
assert.equal(board.players.goals.unverifiedCount,1);assert.equal(board.teams.goalsAgainst.rows.length,0)
assert.equal(board.players.appearances.rows[0].value,2)
assert.equal(matchGroupName({pool:'A组'}),'A组');assert.equal(inScope({pool:'A组'},{groupName:'B组'}),false)
const context={teamsById:{A:{_id:'A'},B:{_id:'B'}},tournamentsById:{T:{_id:'T'},TEST:{synthetic:true}},playersById:{p1:{_id:'p1',name:'张三',phone:'private-phone'},p2:{_id:'p2',name:'李四'}},events:[],requireOriginEvidence:true,requirePlayerOriginEvidence:true}
const lineups={homeLineup:{starters:[{playerId:'p1'}]},awayLineup:{starters:[{playerId:'p2'}]}}
const base={...lineups,_id:'m',homeTeamId:'A',awayTeamId:'B',tournamentId:'T',divisionId:'D',status:'archived',events:[{eventId:'e',type:'yellow_card',playerId:'p1',teamId:'A',minute:0}]}
const draft={...base,_id:'live',status:'ongoing'},test={...base,_id:'test',tournamentId:'TEST'}
const data=await journal({matches:[base,draft,test],events:[],actor:{platformOwner:true},scope:{mode:'official'},context})
assert.equal(data.length,2);assert.equal(data[0].counted,true);assert.equal(data[0].minute,0);assert.equal(data[1].counted,false)
assert.ok(!JSON.stringify(data).includes('private-phone'))
const filtered=await journal({matches:[base],events:[],actor:{platformOwner:false,teamIds:['B'],tournamentIds:[]},scope:{mode:'official'},context})
assert.equal(filtered.length,0)
console.log('PASS: shared rankings, missing metrics, historical teams, group scope, real/test event filtering and team privacy')
