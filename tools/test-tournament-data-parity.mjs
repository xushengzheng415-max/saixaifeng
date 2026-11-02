import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {createRequire} from 'node:module'
import {teamBoard} from '../cloudfunctions/dataCenter/shared/tournament-boards.mjs'
const require=createRequire(import.meta.url),{tournamentBoards}=require('../cloudfunctions/dataCenter/shared/tournament-boards.cjs'),ui=require('../miniprogram/utils/tournament-boards.js'),awards=require('../cloudfunctions/dataCenter/shared/awards.cjs')
const metrics=['appearances','starts','minutesPlayed','goals','assists','yellowCards','redCards']
function player(playerId,divisionId,goals){const values=Object.fromEntries(metrics.map(key=>[key,key==='goals'?goals:key==='appearances'?1:0]));return {playerId,playerName:playerId,teamId:'same',divisionId,metrics:values,observed:values,coverage:Object.fromEntries(metrics.map(key=>[key,'complete'])),matchIds:[divisionId+playerId],startMatchIds:[]}}
const team=(teamId,played,goalsFor,goalsAgainst,points)=>({teamId,teamName:teamId,played,goalsFor,goalsAgainst,points,goalDifference:goalsFor-goalsAgainst,win:0,draw:0,loss:0})
const standings=[{divisionId:'adult',divisionName:'成人组',groupName:'A',officialTeams:[team('same',2,5,0,6),team('b',1,5,1,3)]},{divisionId:'youth',divisionName:'青年组',groupName:'B',officialTeams:[team('same',1,1,0,3),team('none',0,0,0,0)]}]
const result={standings,players:[player('p','adult',2),player('p','youth',4)],teams:[{teamId:'same',teamName:'本队',divisionId:'adult',wins:1,played:2,goalsFor:5,goalsAgainst:0},{teamId:'same',teamName:'本队',divisionId:'youth',wins:1,played:1,goalsFor:1,goalsAgainst:0}]}
const boards=await tournamentBoards(result,[{id:'adult',name:'成人组'},{id:'youth',name:'青年组'}]),total=ui.scopeOf(boards,'')
assert.equal(total.goals[0].value,6);assert.equal(ui.scopeOf(boards,'adult').goals[0].value,2);assert.equal(ui.scopeOf(boards,'youth').goals[0].value,4,'same team/player in two divisions must not borrow a last team mapping')
const flat=standings.flatMap(g=>g.officialTeams.map(t=>({...t,divisionId:g.divisionId,groupName:g.groupName})))
assert.deepEqual(total.attack.map(t=>t.key),teamBoard(flat,'goals').map(t=>t.key),'PC and mobile share the exact team comparator')
assert.equal(new Set(total.attack.map(t=>t.key)).size,3);assert.equal(total.defense[0].goalsAgainst,0)
assert.equal(teamBoard([{...flat[0],goalsAgainst:null}],'conceded').length,0,'unknown must not win a zero conceded ranking')
assert.equal(ui.rowsOf(total,'defense')[0].countText,'0');assert.equal(ui.display(null),'—')
const official={id:'ok',divisionId:'adult',scoreReady:true,resultStatus:'approved',homeTeamId:'same',awayTeamId:'b',homeScore:1,awayScore:0}
const pending={...official,id:'pending',resultStatus:'pending_review'}
const draftAwards=awards.compute({matches:[official,pending],standings:[],divisions:[],eventsByMatchId:{}})
assert.equal(draftAwards.ready,false);assert.equal(draftAwards.submittedMatches,1);assert.equal(awards.compute({matches:[official]}).ready,true)
assert.equal(draftAwards.awardsVersion,'football-tournament-awards/2')
assert.equal(awards.compute({matches:[]}).ready,false)
// 已取消场次没有赛果，不能阻塞整届赛事的归档完备性。
const cancelled={...official,id:'cancelled',status:'cancelled',scoreReady:false,resultStatus:'not_submitted'}
assert.equal(awards.compute({matches:[official,cancelled]}).totalMatches,1);assert.equal(awards.compute({matches:[official,cancelled]}).ready,true)
assert.equal(awards.compute({matches:[official,{...pending,status:'finished'}]}).ready,false,'unarchived results still block honors')
const honorSource={ready:true,divisions:[{divisionId:'adult',divisionName:'成人组',mvp:{playerId:'alias-id',goals:1,assists:0,contribution:9},topScorer:null,goalkeeper:null,bestXI:[]}]}
assert.equal(awards.playerHonors(honorSource,{playerId:'canonical-id',aliasIds:['alias-id'],tournamentId:'T'}).length,1,'historical roster ids must still match the archive id')
assert.equal(awards.playerHonors(honorSource,{playerId:'canonical-id',tournamentId:'T'}).length,0)
assert.equal(awards.playerHonors({...honorSource,ready:false},{playerId:'alias-id',aliasIds:['alias-id'],tournamentId:'T'}).length,0,'incomplete tournaments must not emit honors')
let definition,context={currentWorkspace:{id:'ws'}},calls=[],pendingCalls=[]
const wx={cloud:{callFunction(input){calls.push(input);return new Promise((resolve,reject)=>pendingCalls.push({resolve,reject}))}},navigateTo(input){calls.push(input)}}
vm.runInNewContext(fs.readFileSync('miniprogram/pages/tournament/data/data.js','utf8'),{require:name=>name.includes('workspace')?{readContext:()=>context,navigateBackOrHome(){}}:ui,Page:value=>definition=value,wx,console})
const page={...definition,data:structuredClone(definition.data),setData(update){Object.assign(this.data,update)}}
page.onLoad({id:'T',shared:'1',tab:'defense'});assert.equal(calls[0].data.action,'sharedTournamentData')
pendingCalls.shift().resolve({result:{success:true,boards,tournament:{name:'赛事'}}});await new Promise(r=>setImmediate(r))
assert.equal(page.data.errorText,'');assert.equal(page.data.visibleRows[0].countText,'0');assert.equal(page.data.tabs.length,6)
page.selectDivision({currentTarget:{dataset:{id:'adult'}}});page.selectTab({currentTarget:{dataset:{id:'goals'}}});assert.equal(page.data.visibleRows[0].countText,'2')
page.openScorebook();assert.match(calls.at(-1).url,/shared=1/)
const failed=page.loadData(true);pendingCalls.shift().reject(Error('网络暂不可用'));await failed;assert.match(page.data.errorText,/网络/)
const retry=page.loadData();pendingCalls.shift().resolve({result:{success:true,boards}});await retry;assert.equal(page.data.errorText,'')
const late=page.loadData();page.onUnload();pendingCalls.shift().resolve({result:{success:false,message:'迟到错误'}});await late;assert.equal(page.data.errorText,'')
const manifest=JSON.parse(fs.readFileSync('miniprogram/app.json'));assert(manifest.subpackages.find(p=>p.root==='pages/tournament').pages.includes('data/data'))
for(const file of ['data/data','scorebook/scorebook','shared/shared','teams/teams'])assert.doesNotMatch(fs.readFileSync('miniprogram/pages/tournament/'+file+'.wxml','utf8'),/\{\{[^}]*?(?:===|!==|\?|\+|\[[^}]*\]|\.find\()[^}]*\}\}/)
console.log('PASS: PC/mobile team ordering, multi-division identity, official award readiness, zero/missing, shared route, retry and late responses, registered routes and WXML')
