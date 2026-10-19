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
 let rows=await readCards(cloud,database(),[{_id:'one'},{_id:'two'}],{dynamic:false})
 assert.equal(calls.length,0,'Resolved static exports must not convert missing IDs');assert.ok(rows.every(r=>r.status==='ready'&&r.cardUrl&&r.displayMode==='static-export'))
 rows=await readCards(cloud,database(),[{_id:'one'},{_id:'broken',broken:true}],{dynamic:false});assert.equal(rows[0].status,'ready');assert.equal(rows[1].status,'failed')
 rows=await readCards(cloud,database(),[{_id:'good'},{_id:'bad'}],{legacyOnly:true});assert.equal(calls.length,1);assert.equal(calls[0].length,1);assert.equal(rows[0].status,'ready');assert.equal(rows[1].status,'failed');assert.equal(rows[1].cardUrl,'')
 rows=await readCards({getTempFileURL:async()=>{throw Error('network failure')}},database(),[{_id:'good'}],{legacyOnly:true});assert.equal(rows[0].status,'failed');assert.equal(rows[0].cardUrl,'')
 rows=await readCards(cloud,database(),[{_id:'dynamic'}],{dynamic:true});assert.ok(rows[0].cardScene);assert.equal(calls.length,1)
 let cardReads=0,teamReads=0,allow=true
 const source=fs.readFileSync(backend+'/index.js','utf8'),start=source.indexOf('async function loadTeamPlayersForWorkspace('),end=source.indexOf('\nfunction importedDraftPublicView',start)
 const scope={findWorkspaceForAction:async()=>({workspace:{type:'team',permissions:allow?['team.view']:[]}}),loadTeams:async()=>{teamReads++;return [{_id:'team',name:'甲队'}]},safeGetTeamPlayers:async()=>[{_id:'p',profileStatus:'complete'}],safeGet:async()=>[],formatTeamPlayer:p=>({id:p._id,profileStatus:p.profileStatus}),firstValue:(...values)=>values.find(Boolean),require:()=>({readCards:async()=>{cardReads++;return []}}),cloud:{},db:{},Map,Set}
 vm.runInNewContext(source.slice(start,end)+';this.load=loadTeamPlayersForWorkspace',scope)
 let result=await scope.load({teamId:'team',includePlayerCards:false},{user:{}});assert.equal(result.players.length,1);assert.equal(result.counts.complete,1);assert.equal(cardReads,0)
 await scope.load({teamId:'team'},{user:{}});assert.equal(cardReads,1,'Existing card clients keep default behavior')
 allow=false;const prior=teamReads;await assert.rejects(scope.load({teamId:'team',includePlayerCards:false},{user:{}}),/权限/);assert.equal(teamReads,prior,'Metadata mode cannot bypass authorization')
 let definition,resolveCall,requests=0,fail=false
 const wx={cloud:{callFunction({data}){requests++;assert.equal(data.includePlayerCards,false);return new Promise(resolve=>{resolveCall=()=>resolve({result:fail?{success:false,message:'读取失败，请重试'}:{success:true,team:{id:'team',name:'甲队'},players:[{id:'p',name:'球员甲',profileStatus:'complete'}],counts:{complete:1,pending:0,exception:0}}})})}}}
 vm.runInNewContext(fs.readFileSync(root+'/miniprogram/pages/team/player-library/player-library.js','utf8'),{Page:value=>{definition=value},require:()=>({readContext:()=>({currentWorkspace:{id:'team:one'}})}),wx,Promise})
 const page={...definition,data:structuredClone(definition.data),setData(patch){Object.assign(this.data,patch)}}
 page.data.teamId='team';let request=page.loadPlayers();page.onShow();assert.equal(requests,1);resolveCall();await request;assert.equal(page.data.players.length,1)
 fail=true;request=page.loadPlayers();resolveCall();await request;assert.equal(page.data.errorText,'读取失败，请重试')
 fail=false;request=page.loadPlayers({type:'tap'});assert.equal(page.data.loading,true);assert.equal(page.data.errorText,'');resolveCall();await request;assert.equal(page.data.errorText,'');assert.equal(page.data.players.length,1)
 for(const [,expression] of fs.readFileSync(root+'/miniprogram/pages/team/player-library/player-library.wxml','utf8').matchAll(/{{(.*?)}}/gs))assert.doesNotMatch(expression,/===|!==|==|!=|\?|\[|\]|\(|\)|&&|[<>]/)
 console.log('PASS: 已解析整卡URL不二次转换、坏ID隔离、单卡异常/网络失败不阻断、动态卡兼容、名单快速读取与原鉴权、旧调用兼容、加载去重/失败重试、WXML')
}
main().catch(error=>{console.error(error);process.exitCode=1})
