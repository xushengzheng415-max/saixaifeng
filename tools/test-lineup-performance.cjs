const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm'),Module=require('module')
const recording=require('../cloudfunctions/getMiniWorkspace/sharedRecording.cjs'),cards=require('../cloudfunctions/getMiniWorkspace/sharedLineupCards.cjs'),layout=require('../miniprogram/utils/lineup-layout')
const source=require('../shared/lineup/formation-data.json'),pc=require('../web-admin-vue/src/data/formation-data.json')
const people=['home','away'].flatMap(side=>Array.from({length:12},(_,i)=>({id:side+i,teamId:side,teamSide:side,name:'球员'+i,jerseyNumber:String(i+1)})))
function context(){
 const match={_id:'match',tournamentId:'event',divisionId:'division',homeTeamId:'home',awayTeamId:'away',matchFormat:'8side',status:'scheduled',matchEventRevision:0,lineups:{}},reads=[]
 const c={match,db:{},cloud:{},identity:{user:{_id:'operator'}},grant:{permissions:['event.matches','event.teams']},event:{operation:'lineup',side:'home'},authorized:async()=>true,doc:async(db,name,id)=>name==='tournaments'?{_id:id}:name==='divisions'?{_id:id,matchFormat:'8side'}:null,rows:async(db,name,where)=>{reads.push([name,where.teamId]);return name==='roster_snapshots'?[{tournamentId:'event',teamId:where.teamId,divisionId:'division',status:'approved',players:people.filter(p=>p.teamSide===where.teamId)}]:[]}}
 c.relay=async(db,cloud,identity,grant,name,data)=>({success:true,request:data});return {c,reads}
}
function saved(side,formation){return {formation,players:layout.slotsFor(8,formation).map((slot,i)=>({id:side+i,name:'球员'+i,number:String(i+1),role:slot.role})).reverse(),substitutes:[]}}
async function run(){
 assert.deepEqual(source,pc)
 for(const count of [5,7,8,9,11])assert.deepEqual(layout.formationsFor(count).map(x=>x.id),Object.keys(pc[count+'人制'].formations))
 let definition,calls=0,changes
 const file=path.resolve('miniprogram/components/match-lineup-editor/index.js'),wx={getWindowInfo:()=>({windowWidth:375,windowHeight:740,screenHeight:812,safeArea:{bottom:780}}),cloud:{callFunction(){calls++;return new Promise(()=>{})}}}
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{Component:d=>definition=d,wx,require:Module.createRequire(file)})
 const home=saved('home','3-3-1'),away=saved('away','3-2-2'),props={tournamentId:'event',match:{id:'match',recordRevision:'r1',lineupRules:{playersOnField:8,benchLimit:8},lineups:{home,away}},players:people,homeStarters:home.players.map(p=>p.id),awayStarters:away.players.map(p=>p.id),homeBench:['home8','home9','home10','home11'],awayBench:[],saving:false,dirty:false}
 const editor={...definition.methods,properties:props,data:structuredClone(definition.data),setData(p){Object.assign(this.data,p)},triggerEvent(name,data){if(name==='change'){changes=data;props.homeStarters=data.starters.home;props.awayStarters=data.starters.away;props.dirty=true;this.sync()}}}
 editor.sync();assert.equal(calls,0,'first pitch never waits for card metadata');assert.equal(editor.data.hasLayout,true);assert.equal(editor.data.slots.length,8);assert.equal(editor.data.starterCount,8);assert.equal(editor.data.slots[0].playerId,'home0','GK restored by role despite reversed roster');assert.equal(editor.data.slots[0].role,'GK');assert.equal(editor.data.slots[0].cardState,'loading');assert.equal(editor.data.canSave,true)
 editor.cardResolved({detail:{playerId:'home0',status:'ready',cardUrl:'https://example.invalid/whole.png',tournamentId:'event',matchId:'match',side:'home',requestVersion:0}});assert.equal(editor.data.slots[0].cardUrl,'https://example.invalid/whole.png');assert.equal(editor.data.slots[0].imageRequired,false)
 editor.changeSide({currentTarget:{dataset:{id:'away'}}});assert.equal(calls,0);assert.equal(editor.formations.away,'3-2-2');assert.equal(editor.data.slots[0].playerId,'away0')
 editor.changeSide({currentTarget:{dataset:{id:'home'}}});assert.equal(editor.data.slots[0].cardUrl,'https://example.invalid/whole.png','page cache survives team switch')
 editor.changeFormation({currentTarget:{dataset:{id:'3-2-2'}}});assert.equal(changes.lineupLayout.home.formation,'3-2-2');assert.equal(changes.lineupLayout.home.positions[0].playerId,'home0')
 const {c,reads}=context();let called=false;c.event={side:'home',rulesOnly:true};await cards.read(c,async()=>{called=true});assert.equal(called,false);assert.equal(reads.length,0,'rules fallback never scans roster/cards')
 c.event={side:'home',playerIds:['home0'],operation:'lineupCardImage'}
 // Profiles are not needed for this ownership rejection, and the opposite side must not be queried.
 await assert.rejects(cards.read({...c,event:{...c.event,playerIds:['away0']}},async()=>[]),/不属于/);assert.ok(reads.every(x=>x[1]==='home'))
 c.event={operation:'lineup',starters:{home:home.players.map(p=>p.id),away:away.players.map(p=>p.id)},bench:{home:[],away:[]},lineupLayout:{home:{formation:home.formation,positions:home.players.map(p=>({playerId:p.id,role:p.role}))},away:{formation:away.formation,positions:away.players.map(p=>({playerId:p.id,role:p.role}))}}};c.event.recordRevision=recording.revision(c.match)
 const result=await recording.run(c),lineups=result.request.data.lineups;assert.equal(lineups.home.formation,'3-3-1');assert.equal(lineups.home.players.find(p=>p.id==='home0').role,'GK');assert.equal(lineups.away.formation,'3-2-2')
 c.match.lineups=lineups;c.event.recordRevision=recording.revision(c.match);delete c.event.lineupLayout;const oldClient=await recording.run(c);assert.equal(oldClient.request.data.lineups.home.formation,'3-3-1');assert.equal(oldClient.request.data.lineups.home.players.find(p=>p.id==='home0').role,'GK','legacy lineup saves keep saved PC roles')
 c.event.lineupLayout={home:{formation:'3-3-1',positions:home.players.map(p=>({playerId:p.id,role:'GK'}))}};await assert.rejects(recording.run(c),/位置/)
 props.match={...props.match,recordRevision:'r2',lineups:{home:{players:home.players.map(p=>({id:p.id}))},away}};props.dirty=false;editor.sync();assert.equal(editor.data.unplacedCount,8,'paper roster does not invent tactical roles');assert.equal(editor.data.starterCount,8)
 console.log('PASS: 球场首屏零卡元数据请求、号码即时显示、按角色恢复PC阵型、切队页内复用、无战术证据不猜位置、规则读取不扫描卡库、同队读取、真实保存控制器保留阵型/角色及非法位置拒绝；仅隔离数据')
}
run().catch(error=>{console.error(error);process.exitCode=1})
