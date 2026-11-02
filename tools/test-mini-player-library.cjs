'use strict'
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const root=path.resolve(__dirname,'..'),backend=process.env.SXF_MINI_BACKEND_DIR||path.join(root,'cloudfunctions/getMiniWorkspace'),prefix=require(backend+'/playerCardSource.cjs').permanentFile('https://636c-cloud1-7g8ckb3c7815a011-1419431905.tcb.qcloud.la/test.png').replace('test.png','')
const file=id=>prefix+id+'.png'
function reader(){
 const mod={exports:{}}
 vm.runInNewContext(fs.readFileSync(backend+'/playerCardReader.cjs','utf8'),{module:mod,require:id=>{
  if(id==='./playerCardDynamic.cjs')return {read:async(c,d,p)=>{if(p.broken)throw Error('one card failed');return {playerId:p._id,status:'ready',cardScene:{test:true},cardTypeId:'bronze'}},exportCard:async(c,d,p)=>({cardUrl:'https://example.invalid/'+p._id+'.png'})}
  if(id==='./playerCardSeriesReader.cjs')return {resolveSeriesPlayer:async(d,p)=>p}
  if(id==='./data-center/service.cjs')return {createDataService:()=>({playerCardsForAuthorizedPlayers:async ids=>new Map(ids.map(id=>[id,{}]))})}
  return require(id.startsWith('.')?path.resolve(backend,id):id)
 },Map,Set,Promise,URL})
 return mod.exports
}
function database(){
 return {collection(name){
  return {doc(id){
   return {async get(){
    return {data:name==='player_card_renders'&&id.startsWith('visual_')?{_id:id,status:'ready',visualOnly:true,fileId:id==='visual_bad'?{fileID:file('bad')}:file(id),cardDataVersion:0}:null}
   }}
  }}
 }}
}
async function main(){
 const {readCards}=reader(),calls=[],cloud={async getTempFileURL({fileList}){assert.ok(fileList.every(id=>typeof id==='string'&&id.startsWith('cloud://')));calls.push(fileList);return {fileList:fileList.map(fileID=>({fileID,tempFileURL:'https://example.invalid/resolved'}))}}}
 let cardReads=0,teamReads=0,allow=true
 const source=fs.readFileSync(backend+'/index.js','utf8'),start=source.indexOf('async function loadTeamPlayersForWorkspace('),end=source.indexOf('\nfunction importedDraftPublicView',start)
 const scope={findWorkspaceForAction:async()=>({workspace:{type:'team',permissions:allow?['team.view']:[]}}),loadTeams:async()=>{teamReads++;return [{_id:'team',name:'甲队'}]},safeGetTeamPlayers:async()=>[{_id:'p',profileStatus:'complete'}],safeGet:async()=>[],formatTeamPlayer:p=>({id:p._id,profileStatus:p.profileStatus}),firstValue:(...values)=>values.find(Boolean),require:()=>({readCards:async()=>{cardReads++;return []}}),cloud:{},db:{},Map,Set}
 vm.runInNewContext(source.slice(start,end)+';this.load=loadTeamPlayersForWorkspace',scope)
 let result=await scope.load({teamId:'team',includePlayerCards:false},{user:{}});assert.equal(result.players.length,1);assert.equal(result.counts.complete,1);assert.equal(cardReads,0)
 await scope.load({teamId:'team'},{user:{}});assert.equal(cardReads,1,'Existing card clients keep default behavior')
 allow=false;const prior=teamReads;await assert.rejects(scope.load({teamId:'team',includePlayerCards:false},{user:{}}),/权限/);assert.equal(teamReads,prior,'Metadata mode cannot bypass authorization')
 let definition,resolveCall,requests=0,fail=false,autoResolve=false,payloads=[],tabs=[],relaunches=[],backs=[],modals=[],pageStack=[],switchCalls=[],switchTabFail=false
 const okResult=data=>({success:true,team:{id:data.teamId||'team',name:'甲队'},players:[{id:'p',name:'球员甲',profileStatus:'complete'}],counts:{complete:1,pending:0,exception:0}})
 const failPayload={success:false,message:'读取失败，请重试'}
 // 服务号「加入团队申请审批提醒」直达本页时，页面栈只有一页，且当前工作空间可能还是另一支球队的空间。
 const wx={cloud:{callFunction({data}){requests++;payloads.push(data);assert.equal(data.includePlayerCards,false);if(autoResolve)return Promise.resolve({result:fail?failPayload:okResult(data)});return new Promise(resolve=>{resolveCall=()=>resolve({result:fail?failPayload:okResult(data)})})}},switchTab(o){tabs.push(o.url);if(switchTabFail&&o.fail)o.fail({errMsg:'switchTab:fail'})},reLaunch(o){relaunches.push(o.url)},navigateBack(o){backs.push(o.delta)},showToast(){},showModal(o){modals.push(o)}}
 let contextImpl={teams:[],homeEntries:[]}
 const workspaceStub={readContext:()=>({currentWorkspace:{id:'team:one'}}),loadContext:()=>Promise.resolve(contextImpl),switchWorkspace(id){switchCalls.push(id);return Promise.resolve({})},isVisualQaEnabled:()=>false}
 vm.runInNewContext(fs.readFileSync(root+'/miniprogram/pages/team/player-library/player-library.js','utf8'),{Page:value=>{definition=value},require:()=>workspaceStub,wx,Promise,getCurrentPages:()=>pageStack})
 const makePage=()=>({...definition,data:structuredClone(definition.data),setData(patch){Object.assign(this.data,patch)}})
 let page=makePage()
 page.data.teamId='team';let request=page.loadPlayers();page.onShow();assert.equal(requests,1);resolveCall();await request;assert.equal(page.data.players.length,1)
 fail=true;request=page.loadPlayers();resolveCall();await request;assert.equal(page.data.errorText,'读取失败，请重试')
 fail=false;request=page.loadPlayers({type:'tap'});assert.equal(page.data.loading,true);assert.equal(page.data.errorText,'');resolveCall();await request;assert.equal(page.data.errorText,'');assert.equal(page.data.players.length,1)
 // 返回键：通知直达时页面栈只有一页，返回无处可退，必须弹出「回首页 / 留在本页」选项，并常驻首页入口。
 page=makePage();pageStack=[];page.onBack()
 assert.equal(modals.length,1,'栈1必须给出返回选项');assert.equal(modals[0].confirmText,'回首页');assert.equal(modals[0].cancelText,'留在本页')
 modals[0].success({confirm:false,cancel:true});assert.equal(tabs.length,0,'选择留在本页不跳转');assert.equal(backs.length,0)
 modals[0].success({confirm:true});assert.deepEqual(tabs,['/pages/home/home'],'确认后回到小程序首页');assert.equal(backs.length,0,'页面栈只有一页时不能 navigateBack')
 modals=[]
 switchTabFail=true;page.goHome();assert.deepEqual(relaunches,['/pages/home/home'],'首页入口 switchTab 失败时也要回到首页');switchTabFail=false;relaunches=[]
 page=makePage();const tabsBefore=tabs.length;pageStack=[{},{}];page.onBack();assert.deepEqual(backs,[1]);assert.equal(tabs.length,tabsBefore,'正常逐级进入时仍返回上一页');assert.equal(modals.length,0,'多层页栈不弹选择')
 // 通知直达：球队已属于当前工作空间时直接加载，不额外切换空间。
 autoResolve=true;page=makePage();switchCalls=[];contextImpl={teams:[{id:'team'}],homeEntries:[]};const before=requests
 page.onLoad({teamId:'team'});await page._enterRequest
 assert.deepEqual(switchCalls,[]);assert.equal(page.data.teamId,'team');assert.equal(page.data.teamName,'甲队');assert.equal(requests,before+1)
 // 通知直达另一支球队：当前工作空间是别的球队，按 homeEntries 切到该球队空间后再读取。
 page=makePage();switchCalls=[];payloads=[];contextImpl={teams:[{id:'team'}],homeEntries:[{type:'team',id:'other',workspaceId:'team:two'} ]};const otherBefore=requests
 page.onLoad({teamId:'other',pendingTeamConfirm:'1'});assert.equal(page.data.highlightPending,true,'待确认提示必须在加载前生效')
 await page._enterRequest
 assert.deepEqual(switchCalls,['team:two']);assert.equal(page.data.teamId,'other');assert.equal(page.data.errorText,'');assert.equal(requests,otherBefore+1)
 assert.equal(payloads[0].teamId,'other','球员库请求必须带目标球队ID');assert.equal(page.data.highlightPending,false,'提示后清除标记')
 // 球队不在当前账号可进入范围：明确报错且不请求球员库，也不再因 onShow 重复请求。
 page=makePage();switchCalls=[];contextImpl={teams:[],homeEntries:[{type:'team',id:'x',workspaceId:'team:x'} ]};const denyBefore=requests
 page.onLoad({teamId:'nope'});await page._enterRequest
 assert.deepEqual(switchCalls,[]);assert.equal(requests,denyBefore,'无权限球队不能发请求');assert.equal(page.data.loading,false);assert.match(page.data.errorText,/不在当前工作空间|没有查看权限/)
 page.onShow();assert.equal(requests,denyBefore,'进入失败后 onShow 不能空转请求')
 const libraryWxml=fs.readFileSync(root+'/miniprogram/pages/team/player-library/player-library.wxml','utf8')
 assert.ok(libraryWxml.includes('bindtap="goHome"'),'球员库导航栏必须有常驻首页入口')
 for(const [,expression] of libraryWxml.matchAll(/{{(.*?)}}/gs))assert.doesNotMatch(expression,/===|!==|==|!=|\?|\[|\]|\(|\)|&&|[<>]/)
 console.log('OK: 球员库页面断言通过（加载去重/失败重试、通知直达切工作空间、返回键回首页、WXML 表达式限制）')
 // 以下为球员卡读取隔离检查。当前 playerCardReader.cjs 已在 1f2cc2ea 去掉单卡异常兜底，
 // 该段会暴露既有回归（与本次页面改动无关，不在此任务内改动共享后端）。
 let rows=await readCards(cloud,database(),[{_id:'one'},{_id:'two'}],{dynamic:false})
 assert.equal(calls.length,0,'Resolved static exports must not convert missing IDs');assert.ok(rows.every(r=>r.status==='ready'&&r.cardUrl&&r.displayMode==='static-export'))
 rows=await readCards(cloud,database(),[{_id:'one'},{_id:'broken',broken:true}],{dynamic:false});assert.equal(rows[0].status,'ready');assert.equal(rows[1].status,'failed')
 rows=await readCards(cloud,database(),[{_id:'good'},{_id:'bad'}],{legacyOnly:true});assert.equal(calls.length,1);assert.equal(calls[0].length,1);assert.equal(rows[0].status,'ready');assert.equal(rows[1].status,'failed');assert.equal(rows[1].cardUrl,'')
 rows=await readCards({getTempFileURL:async()=>{throw Error('network failure')}},database(),[{_id:'good'}],{legacyOnly:true});assert.equal(rows[0].status,'failed');assert.equal(rows[0].cardUrl,'')
 rows=await readCards(cloud,database(),[{_id:'dynamic'}],{dynamic:true});assert.ok(rows[0].cardScene);assert.equal(calls.length,1)
 console.log('PASS: 球员库页面 + 球员卡读取全部通过')
}
main().catch(error=>{console.error(error);process.exitCode=1})
