'use strict'
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
const {formatMember}=require('../cloudfunctions/getMiniWorkspace/teamMemberView.cjs')
const participation=require('../miniprogram/utils/team-participation-view')
const owner=formatMember({_id:'m1',userId:'u1',role:'owner',status:'accepted'},{nickname:'负责人甲'},['u1'],()=> '已掩码')
assert.equal(owner.name,'负责人甲');assert.equal(owner.kind,'manager');assert.equal(owner.accountTypeText,'主账户');assert.equal(owner.pending,false)
assert.equal(formatMember({userId:'c1',roles:['head_coach'],status:'active'},{name:'教练甲'},[],()=> '').kind,'coach')
assert.equal(formatMember({userId:'m1',role:'member',status:'pending'},{},[],()=> '').pending,true)
const {withStaff}=require('../cloudfunctions/getMiniWorkspace/teamMemberView.cjs')
const staff=withStaff([owner],[
 {_id:'s1',type:'head_coach',name:'教练甲',phone:'13800000001'},
 {_id:'s2',type:'team_leader',name:'负责人甲',phone:'13800000002'},
 {_id:'s3',type:'doctor',name:'队医甲'},
 {_id:'s4',type:'team_leader',name:'负责人甲',phone:'13800000002'},
 {_id:'s5',type:'doctor',name:'已撤销队医',status:'archived'}
],[{_id:'u1',phone:'13800000002'}],()=> '已掩码')
assert.equal(staff.length,3);assert(staff.find(row=>row.kind==='coach'));assert(staff.find(row=>row.kind==='doctor'));assert(staff[0].roleText.includes('领队'));assert.equal(staff[0].accountTypeText,'主账户')
assert(staff.filter(row=>row.staffOnly).every(row=>row.statusText==='已登记'&&!row.permissions))
const context={currentWorkspace:{id:'team:1'},participatingEntriesVersion:'team-participation/1',participatingEntriesState:'ready',participatingEntries:[{id:'event1',teamId:'team1',divisionId:'adult'}]}
const records=[{id:'removed',tournamentId:'event1',divisionId:'adult',status:'removed',competitionStatus:'completed'},{id:'good',tournamentId:'event1',divisionId:'adult',status:'approved',competitionStatus:'completed'},{id:'duplicate',tournamentId:'event1',divisionId:'adult',status:'pending',competitionStatus:'completed'},{id:'other',tournamentId:'event2',divisionId:'adult',status:'approved',competitionStatus:'completed'}]
const rows=participation.rowsForTeam(records,context,'team1');assert.equal(rows.length,1);assert.equal(rows[0].id,'good');assert.equal(participation.tournamentCount(rows),1)
let definition,navigation
const wx={cloud:{callFunction:async()=>({result:{success:true,team:{name:'测试队'},items:records}})},navigateTo:options=>{navigation=options.url},showToast(){}}
vm.runInNewContext(fs.readFileSync('miniprogram/pages/team/participation/participation.js','utf8'),{Page:value=>definition=value,require:id=>id.includes('team-participation-view')?participation:{readContext:()=>context},wx,Promise})
const page={...definition,data:{...definition.data,teamId:'team1'},setData(patch){Object.assign(this.data,patch)}}
async function main(){
 const source=fs.readFileSync('cloudfunctions/getMiniWorkspace/index.js','utf8'),start=source.indexOf('async function teamParticipationForWorkspace('),end=source.indexOf('\nasync function teamTournamentDetailForWorkspace',start)
 const schedules=[{_id:'done',divisionId:'adult',homeTeamId:'team1',awayTeamId:'other',status:'completed',homeScore:3,awayScore:0,matchDate:'2026-10-01',matchTime:'15:00'},
 {_id:'next',divisionId:'adult',homeTeamId:'team1',awayTeamId:'other',status:'scheduled',matchDate:'2026-10-17',matchTime:'16:30'},
 {_id:'cancel',divisionId:'adult',homeTeamId:'team1',awayTeamId:'other',status:'cancelled'},
 {_id:'same-name',divisionId:'adult',homeTeamId:'different',awayTeamId:'other',homeTeamName:'测试队',status:'scheduled'}]
 const scope={findWorkspaceForAction:async()=>({workspace:{permissions:['team.view']}}),loadTeams:async()=>[{_id:'team1',name:'测试队'}],readDataRows:async(db,name)=>name==='tournament_teams'?[{_id:'reg1',teamId:'team1',tournamentId:'event1',divisionId:'adult',status:'approved'}]:name==='matches'?schedules:[],readDataByIds:async()=>[{_id:'event1',name:'测试赛事',startDate:'2030-01-01'}],db:{},require:id=>require('../cloudfunctions/getMiniWorkspace/'+id.replace('./','')),unique:list=>[...new Set(list)],registrationDivisionId:row=>row.divisionId||'default',snapshotMatchesDivision:(row,id,legacy)=>row.divisionId===id||(!row.divisionId&&legacy),firstValue:(...values)=>values.find(value=>value!=null&&value!==''),toTime:value=>new Date(value||0).getTime(),matchDateText:row=>row.matchDate||'日期待定',matchTimeValue:row=>row.matchTime||'时间待定',matchDateTimeMs:row=>new Date(row.matchDate||'2030-01-01').getTime()}
 vm.runInNewContext(source.slice(start,end)+';this.read=teamParticipationForWorkspace',scope)
 const scheduleResult=await scope.read({teamId:'team1'},{user:{}})
 assert.equal(scheduleResult.items[0].matchCount,2);assert(!scheduleResult.items[0].matches.some(row=>row.id==='cancel'||row.id==='same-name'));assert.equal(scheduleResult.items[0].competitionStatus,'ongoing');assert.equal(scheduleResult.items[0].matches.find(row=>row.id==='next').timeText,'16:30')
 assert.equal(scheduleResult.items[0].matches.find(row=>row.id==='done').scoreText,'本队 3 : 0')
 assert.equal(scheduleResult.items[0].matches.find(row=>row.id==='next').hasScore,false)
 records.find(row=>row.id==='good').matches=scheduleResult.items[0].matches
 page.load();for(let i=0;i<10;i++)await Promise.resolve()
 assert.equal(page.data.activeFilter,'not_started');assert.equal(page.data.visible.length,1);assert.equal(page.data.eventCount,1);assert.equal(page.data.visible[0].matches.length,1);assert.equal(page.data.visible[0].matches[0].id,'next')
 page.choose({currentTarget:{dataset:{id:'completed'}}});assert.equal(page.data.visible[0].matches.length,1);assert.equal(page.data.visible[0].matches[0].scoreText,'本队 3 : 0');assert.equal(page.data.visible[0].matches[0].isFinished,true)
 page.choose({currentTarget:{dataset:{id:'ongoing'}}});assert.equal(page.data.showEmpty,true);assert.equal(page.data.emptyText,'暂无进行中比赛')
 const sample=[{id:'mix',matches:[...Array.from({length:4},(_,i)=>({id:'done'+i,status:'finished'})),{id:'next',status:'upcoming'},{id:'cancel',status:'cancelled'}]}]
 assert.deepEqual(participation.matchCounts(sample),{not_started:1,ongoing:0,completed:4})
 assert.equal(participation.filterMatches(sample,'completed')[0].matches.length,4)
 assert.equal(participation.filterMatches(sample,'not_started')[0].matches.length,1)
 page.open({currentTarget:{dataset:{tournament:'event1',division:'adult'}}});assert(navigation.includes('view=team'));assert(navigation.includes('teamId=team1'))
 let detailDefinition
 const detailContext={...context,teams:[{id:'team1',name:'测试队',playerCount:19}],tournaments:[]}
 const detailWx={getStorageSync:()=>({_id:'team1'}),cloud:{callFunction:async({data})=>({result:data.action==='teamProfile'?{success:true,profile:{managerName:'负责人甲',completeness:75}}:{success:true,items:records}})}}
 vm.runInNewContext(fs.readFileSync('miniprogram/pages/team/team.js','utf8'),{Page:value=>detailDefinition=value,require:id=>id.includes('team-participation-view')?participation:{readContext:()=>detailContext,loadContext:async()=>detailContext},wx:detailWx,Promise})
 const detail={...detailDefinition,data:structuredClone(detailDefinition.data),setData(patch){Object.assign(this.data,patch)}}
 detail.applyContext(detailContext);assert.equal(detail.data.coachCount,'—');assert.equal(detail.data.completionText,'')
 await detail.loadData();assert.equal(detail.data.completionText,'资料完整度 75%');assert.equal(detail.data.leaderText,'负责人甲');assert.equal(detail.data.tournamentCount,1)
 const library=fs.readFileSync('miniprogram/pages/team/player-library/player-library.wxml','utf8');assert(library.includes('bindtap="invitePlayer"'));assert(!library.includes('邀请家长补资料'));assert(!library.includes('家长通过服务号'))
 for(const file of ['miniprogram/pages/team/team.wxml','miniprogram/pages/team/participation/participation.wxml','miniprogram/pages/team/player-library/player-library.wxml'])for(const [,expression]of fs.readFileSync(file,'utf8').matchAll(/{{(.*?)}}/gs))assert.doesNotMatch(expression,/===|!==|==|!=|\?|\[|\]|\(|\)|&&|[<>]/)
 console.log('PASS 球队内页：主账号nickname、角色分类、移除关系过滤/去重、完赛默认可见、空状态、球队视角路由、中性邀请文案、WXML')
}
main().catch(error=>{console.error(error);process.exitCode=1})
