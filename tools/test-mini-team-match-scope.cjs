'use strict'
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
const view=require('../miniprogram/pages/tournament/schedule/team-schedule-view')
const result={success:true,participating:true,team:{id:'own',name:'本队'},tournament:{name:'测试赛事'},division:{name:'青年组'},standingsState:'ready',matches:[
 {id:'zero',status:'finished',statusText:'已结束',dateText:'10月1日',timeText:'09:00',home:{id:'own',name:'本队'},away:{id:'opp',name:'对手'},homeScore:0,awayScore:0},
 {id:'unknown',status:'finished',home:{id:'own'},away:{id:'opp'},homeScore:null,awayScore:null},
 {id:'live',status:'ongoing',home:{id:'own'},away:{id:'opp'},homeScore:2,awayScore:1},
 {id:'next',status:'upcoming',home:{id:'opp'},away:{id:'own'},homeScore:0,awayScore:0},
 {id:'unrelated',status:'finished',home:{id:'other'},away:{id:'opp'},homeScore:3,awayScore:2},
 {id:'cancel',status:'cancelled',home:{id:'own'},away:{id:'opp'}}
],standingsGroups:[{name:'本组',rows:[{teamId:'own',rank:1,points:0,played:2,win:0,draw:2,loss:0},{teamId:'opp',rank:2,points:0}]},{name:'无关组',rows:[{teamId:'other',rank:1}]}]}
const shown=view.present(result,'own');assert.equal(shown.matches.length,4);assert.equal(shown.resultMatches.length,2);assert.equal(shown.matches[0].homeDisplayScore,'0');assert.equal(shown.matches[1].homeDisplayScore,'—');assert.equal(shown.matches[3].homeDisplayScore,'—');assert.equal(shown.teamStandingsGroups.length,1);assert.equal(shown.teamStandingsGroups[0].rows[0].pointsText,'0');assert.equal(shown.teamStandingsGroups[0].rows[0].rowClass,'is-current')
assert.throws(()=>view.present({...result,participating:false},'own'),/参赛记录/);assert.throws(()=>view.present(result,'another'),/参赛记录/)
let definition,nav,calls=[]
const wx={getStorageSync:()=>({_id:'user'}),cloud:{database:()=>({collection(){throw Error('Direct DB query forbidden in team view')}}),callFunction:async options=>{calls.push(options);return {result}}},navigateTo:options=>nav=options.url}
const workspace={isVisualQaEnabled:()=>false,getPortalRole:()=> 'team_coach',readContext:()=>({currentWorkspace:{id:'workspace'}}),hasPermission:()=>true}
vm.runInNewContext(fs.readFileSync('miniprogram/pages/tournament/schedule/schedule.js','utf8'),{Page:value=>definition=value,require:id=>id==='./team-schedule-view'?view:workspace,wx,Promise})
const page={...definition,data:structuredClone(definition.data),setData(patch){Object.assign(this.data,patch)}}
async function main(){
 page.onLoad({id:'event',view:'team',teamId:'own',divisionId:'adult',workspaceId:'workspace'});for(let i=0;i<10;i++)await Promise.resolve()
 assert.equal(calls.length,1);assert.equal(calls[0].data.action,'teamTournamentDetail');assert.equal(calls[0].data.teamId,'own');assert.equal(calls[0].data.divisionId,'adult');assert.equal(page.data.showContent,true)
 page.onMatchTap({currentTarget:{dataset:{id:'unrelated',finished:true}}});assert.equal(nav,undefined)
 page.onMatchTap({currentTarget:{dataset:{id:'zero',finished:true}}});assert(nav.includes('/pages/match/detail/detail?matchId=zero'));assert(nav.includes('teamId=own'));assert(!nav.includes('/review/'))
 wx.cloud.callFunction=async()=>({result:{success:false,message:'无权访问'}});await page.loadData();assert.equal(page.data.showError,true);assert.equal(page.data.showContent,false)
 let detail
 vm.runInNewContext(fs.readFileSync('miniprogram/pages/match/detail/detail.js','utf8'),{Page:value=>detail=value,require:()=>workspace,wx,Date})
 assert.equal(detail.formatMatchTime.call(detail,'2026-10-01T09:00:00+08:00').slice(0,10),'2026-10-01')
 for(const file of ['miniprogram/pages/tournament/schedule/schedule.wxml','miniprogram/pages/tournament/detail/detail.wxml','miniprogram/pages/team/participation/participation.wxml'])for(const [,expression]of fs.readFileSync(file,'utf8').matchAll(/{{(.*?)}}/gs))assert.doesNotMatch(expression,/===|!==|==|!=|\?|\[|\]|\(|\)|&&|[<>]/)
 console.log('PASS 本队赛程赛果/本组排名授权接口、其他球队隔离、未知和0:0、状态不由比分推断、球队详情跳转、失败不回退主办方、WXML')
}
main().catch(error=>{console.error(error);process.exitCode=1})
