'use strict'
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),overview=require('../cloudfunctions/getMiniWorkspace/teamEventOverview.cjs'),{database}=require('./test-mini-account-participation.cjs')
const source=fs.readFileSync(path.resolve(__dirname,'../cloudfunctions/getMiniWorkspace/index.js'),'utf8'),dates={}
vm.runInNewContext(source.slice(source.indexOf('function unique('),source.indexOf('function maskPhone(')),dates)
async function main(){
 const fixture={teams:[{_id:'a',name:'甲队',phone:'private-phone'},{_id:'b',name:'乙队'},{_id:'c',name:'丙队'},{_id:'d',name:'丁队',source:'ai_fixture'}],tournaments:[{_id:'event',name:'赛事'}],divisions:[{_id:'division',name:'竞赛组',tournamentId:'event'}],players:[],match_events:[],match_lineup_snapshots:[],matches:[
  {_id:'done',tournamentId:'event',divisionId:'division',groupName:'A组',phase:'group',homeTeamId:'a',awayTeamId:'b',homeScore:2,awayScore:1,status:'finished',matchDate:'2026-10-01',matchTime:'09:00'},
  {_id:'future',tournamentId:'event',divisionId:'division',groupName:'A组',phase:'group',homeTeamId:'a',awayTeamId:'c',status:'scheduled',matchDate:'2026-11-01',matchTime:'09:00'},
  {_id:'other-group',tournamentId:'event',divisionId:'division',groupName:'B组',phase:'group',homeTeamId:'c',awayTeamId:'d',homeScore:99,awayScore:0,status:'finished'},
  {_id:'cancelled',tournamentId:'event',divisionId:'division',groupName:'A组',phase:'group',homeTeamId:'a',awayTeamId:'d',status:'cancelled'},
  {_id:'other-division',tournamentId:'event',divisionId:'other',groupName:'A组',phase:'group',homeTeamId:'a',awayTeamId:'d',status:'scheduled'},
  {_id:'synthetic-opponent',tournamentId:'event',divisionId:'division',groupName:'A组',phase:'group',homeTeamId:'a',awayTeamId:'d',status:'scheduled'},
  {_id:'same-name',tournamentId:'event',divisionId:'division',phase:'group',homeTeamId:'other',awayTeamId:'d',homeTeamName:'甲队',status:'scheduled'}
 ]}
 const input={tournament:fixture.tournaments[0],division:fixture.divisions[0],registration:{teamId:'a',divisionId:'division',groupName:'A组'},team:fixture.teams[0],allMatches:fixture.matches,allowLegacyDivision:false}
 const result=await overview.load(database(fixture,2,'',Object.keys(fixture)).db,input,dates)
 assert.equal(result.matches.length,2);assert.equal(result.nextMatch.id,'future');assert.equal(result.nextMatch.timeText,'09:00');assert.equal(result.nextMatch.startTime,null)
 assert.equal(result.summary.rank,1);assert.equal(result.summary.rankTotal,3);assert.equal(result.summary.points,3)
 assert.equal(result.standingsGroups.length,1);assert.equal(result.standingsGroups[0].rows.find(row=>row.teamId==='c').rank,null);assert.equal(result.standingsGroups[0].rows.find(row=>row.teamId==='c').points,0)
 assert.ok(!result.standingsGroups[0].rows.some(row=>row.teamId==='d'))
 assert.doesNotMatch(JSON.stringify(result),/private-phone/)
 const completed=await overview.load(database(fixture,2,'',Object.keys(fixture)).db,{...input,allMatches:fixture.matches.filter(row=>row._id==='done')},dates)
 assert.equal(completed.nextMatch,null);assert.equal(completed.scheduleState,'completed');assert.equal(completed.matches.length,1)
 const failure=await overview.load(database(fixture,2,'match_events',Object.keys(fixture)).db,input,dates);assert.equal(failure.standingsState,'failed');assert.equal(failure.summary.points,null);assert.equal(failure.matches.length,2)
 const rootScope={...dates,db:{},_:{in:values=>({$in:values})},findWorkspaceForAction:async()=>({workspace:{permissions:['team.view','team.manage']}}),loadTeams:async()=>[fixture.teams[0]],registrationDivisionId:row=>row.divisionId||'default',snapshotMatchesDivision:()=>true,
  readDataRows:async(db,name,where)=>name==='tournament_teams'?[{_id:'removed',teamId:'a',divisionId:'division',status:'removed'},{_id:'approved',teamId:'a',divisionId:'division',status:'approved'}]:name==='tournaments'?fixture.tournaments:name==='divisions'?fixture.divisions:name==='matches'?fixture.matches:[],safeGet:async()=>[],require:()=>({load:async(db,args)=>{assert.equal(args.registration.status,'approved');return completed}})}
 vm.runInNewContext(source.slice(source.indexOf('async function teamTournamentDetailForWorkspace('),source.indexOf('\nasync function teamHistoryForWorkspace(')),rootScope)
 const detail=await rootScope.teamTournamentDetailForWorkspace({tournamentId:'event',teamId:'a',divisionId:'division'},{});assert.equal(detail.registration.statusText,'已确认');assert.equal(detail.registration.id,'approved')
 await assert.rejects(rootScope.teamTournamentDetailForWorkspace({tournamentId:'event',teamId:'foreign',divisionId:'division'},{}),/当前工作空间/)
 let page;const routes=[],controller=fs.readFileSync(path.resolve(__dirname,'../miniprogram/pages/tournament/detail/detail.js'),'utf8')
 vm.runInNewContext(controller,{getApp:()=>({globalData:{}}),Page:value=>{page=value},wx:{getStorageSync:()=>'',cloud:{database:()=>({}),callFunction:async()=>({result:detail})},navigateTo:args=>routes.push(args.url)},require:()=>({readContext:()=>({currentWorkspace:{id:'team:a'}})}),console,Promise})
 const ui={...page,data:{...structuredClone(page.data),requestedTeamId:'a',requestedDivisionId:'division',tournamentId:'event'},setData(patch){Object.assign(this.data,patch)}}
 await ui.loadTeamTournamentDetail();assert.equal(ui.data.showNextMatchEmpty,false);assert.equal(ui.data.hasTeamSchedule,true);assert.match(ui.data.teamScheduleCountText,/已全部结束/);assert.equal(ui.data.teamEventStatusText,'已确认')
 detail.summary.points=null;await ui.loadTeamTournamentDetail();assert.equal(ui.data.teamEventPoints,'—')
 ui.onTeamScheduleMatch({currentTarget:{dataset:{id:'done'}}});assert.equal(routes[0],'/pages/match/detail/detail?matchId=done')
 console.log('PASS: 统一积分榜/小组隔离、未赛未排名、全部本队场次、日期时间、取消/跨组别/同名排除、已全部结束提示、真实零与未知、读失败不造分、旧移除报名优先有效记录、精确比赛入口')
}
main().catch(error=>{console.error(error);process.exitCode=1})
