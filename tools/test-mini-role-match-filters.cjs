'use strict'
const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const matchUi=require('../miniprogram/utils/sharedMatchUi'),matchView=require('../cloudfunctions/getMiniWorkspace/sharedMatchView.cjs');
function read(p){return fs.readFileSync(path.join(__dirname,'../',p),'utf8')}
async function matches(){
 let definition;const requests=[];
 vm.runInNewContext(read('miniprogram/pages/tournament/shared/manage.js'),{Page:v=>{definition=v},require:n=>n.endsWith('/sharedMatchUi')?matchUi:{message:e=>e.message},wx:{setNavigationBarTitle(){}}});
 const divisions=[{id:'',name:'全部组别'},{id:'senior',name:'老年组'},{id:'middle',name:'中年组'},{id:'junior',name:'青年组'}];
 let raw=[];
 for(const [divisionId,finished,scheduled]of [['senior',6,0],['middle',15,6],['junior',16,8]])for(let i=0;i<finished+scheduled;i++)raw.push({_id:divisionId+'-'+i,divisionId,status:i<finished?'completed':'scheduled',matchDate:'2026-10-01',homeTeamId:'home',awayTeamId:'away',homeScore:0,awayScore:0});
 const response=()=>({success:true,divisions,items:raw.map(row=>matchView.view(row,new Map([['home',{name:'隔离甲队'}],['away',{name:'隔离乙队'}]]),new Map(divisions.map(row=>[row.id,row.name]))))});
 const p={...definition,data:structuredClone(definition.data),setData(v){Object.assign(this.data,v)},api:async args=>{requests.push(args);return response()}};
 const load=p.loadList;p.loadList=function(){return this.ready=load.call(this)};
 p.onLoad({id:'isolated-event',mode:'matches',divisionId:'senior'});await p.ready;
 function counts(){return Object.fromEntries(p.data.statusTabs.map(tab=>[tab.id,tab.count]))}
 assert.equal(p.data.divisionName,'全部组别','Entering from a selected group must not carry that filter into match management');
 assert.equal(p.data.matchScopeName,'未踢的比赛');assert.equal(p.data.items.length,14);
 assert.deepEqual(counts(),{all:51,scheduled:14,live:0,finished:37});
 assert.ok(p.data.items.every(row=>row.matchState==='scheduled'));
 assert.equal(p.data.divisions.length,4,'All-groups option cannot duplicate');
 p.onStatus({currentTarget:{dataset:{id:'finished'}}});assert.equal(p.data.items.length,37);assert.equal(p.data.matchScopeName,'已踢的比赛');
 p.onStatus({currentTarget:{dataset:{id:'all'}}});assert.equal(p.data.items.length,51);assert.equal(p.data.matchScopeName,'全部比赛');
 p.onMatchScope({detail:{value:0}});assert.equal(p.selectedStatus,'scheduled');assert.equal(p.data.items.length,14);
 p.onDivision({detail:{value:1}});assert.equal(p.data.items.length,0);assert.deepEqual(counts(),{all:6,scheduled:0,live:0,finished:6});
 p.onStatus({currentTarget:{dataset:{id:'finished'}}});assert.equal(p.data.items.length,6);
 p.onSearch({detail:{value:'不存在的场次'}});assert.equal(p.data.items.length,0);assert.equal(counts().all,0);
 p.clearFilters();assert.equal(p.data.items.length,14);assert.equal(p.data.divisionName,'全部组别');
 raw.push({_id:'unknown',divisionId:'junior',status:'unexpected_state'});await p.loadList();assert.equal(counts().unknown,1);assert.equal(counts().all,52);
 p.onStatus({currentTarget:{dataset:{id:'unknown'}}});assert.equal(p.data.items.length,1);assert.equal(p.data.matchScopeName,'状态待核对');
 p.onDivision({detail:{value:1}});assert.equal(p.selectedStatus,'all');assert.equal(p.data.items.length,6);
 p.onLoad({id:'isolated-event',mode:'results',divisionId:'senior'});await p.ready;
 assert.equal(p.divisionId,'senior','Result-review filter remains scoped as before');assert.equal(p.selectedStatus,'under_review');assert.equal(p.data.dateName,'全部日期');
 assert.ok(requests.every(r=>r.operation==='list' && !r.divisionId));
}
function tabs(){
 let definition,role='organizer',authenticated=true;const routes=[],toasts=[];
 const workspace={hasAuthenticatedUser:()=>authenticated,getPortalRole:()=>role,readContext:()=>({currentIdentity:{id:'team_coach'}})};
 const wx={switchTab:v=>routes.push(v.url),showToast:v=>toasts.push(v.title)};
 vm.runInNewContext(read('miniprogram/custom-tab-bar/index.js'),{Component:v=>{definition=v},require:()=>workspace,wx,getCurrentPages:()=>[{route:'pages/home/home'}],setTimeout:fn=>fn()});
 const b={...definition.methods,data:structuredClone(definition.data),setData(v){Object.assign(this.data,v)}};
 definition.lifetimes.attached.call(b);assert.equal(b.data.tabs[2].disabled,true);
 b.switchTab({currentTarget:{dataset:{index:2}}});assert.equal(routes.length,0);assert.equal(toasts.length,1);assert.equal(role,'organizer','Disabled tab must not change role');
 role='team_coach';b.syncFromPage(0);assert.equal(b.data.tabs[2].disabled,false);
 b.switchTab({currentTarget:{dataset:{index:2}}});assert.equal(routes.at(-1),'/pages/teams/index');
 role='organizer';b.switchTab({currentTarget:{dataset:{index:2}}});assert.equal(routes.length,1,'Re-check actual role at tap time even if tab data is stale');
 authenticated=false;b.syncFromPage(0);assert.equal(b.data.tabs[2].disabled,false,'Guest browsing remains available');
}
matches().then(()=>{tabs();console.log('PASS: organizer-only event cards/navigation role gate; all divisions and unplayed default; 51-match multi-group facets; synchronized filters; no stale date intersection; unknown states; result-review compatibility. Isolated data only.')}).catch(e=>{console.error(e);process.exitCode=1});
