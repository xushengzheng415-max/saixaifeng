'use strict'
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict')
const file=name=>path.resolve(__dirname,'../miniprogram/pages/team/official-roster/official-roster.'+name)
let definition,result,activeUser={_id:'account-a'},pending
const routes=[],calls=[],workspace={isVisualQaEnabled:()=>false,readContext:()=>({currentWorkspace:{id:'team:one'}})}
const wx={getStorageSync:()=>activeUser,navigateTo:args=>routes.push(args.url),navigateBack(){},showToast(){},cloud:{callFunction(options){calls.push(options);return pending?pending:Promise.resolve({result})}}}
vm.runInNewContext(fs.readFileSync(file('js'),'utf8'),{Page:value=>{definition=value},require:()=>workspace,wx,console,Date,Promise})
function page(){return {...definition,data:structuredClone(definition.data),setData(patch){Object.assign(this.data,patch)}}}
const source={success:true,team:{id:'one',name:'甲队'},tournament:{id:'event',name:'赛事',divisionName:'老年组',maxPlayers:20},canManage:true,requirements:{},snapshot:{status:'approved',playerIds:['p1','p2','p1','historical']},players:[{id:'p1',name:'球员甲',jerseyNumber:0,jerseyName:'JIA',position:'GK',birthDate:'1963-02-21',photoUrl:'local-photo',profileStatus:'complete',statusText:'资料完整',tournamentStats:{appearances:0,minutesPlayed:null,goals:2,assists:0,yellowCards:0,redCards:null}},{id:'p2',name:'球员乙',profileStatus:'pending',statusText:'待核验'},{id:'library-only',name:'库中未报名球员',profileStatus:'complete'}]}
async function main(){
 let ui=page();result=structuredClone(source);await ui.onLoad({teamId:'one',tournamentId:'event',divisionId:'old'});await new Promise(resolve=>setImmediate(resolve))
 assert.equal(ui.data.editing,false);assert.equal(ui.data.pageTitle,'正式名单');assert.equal(ui.data.rosterMembers.length,3);assert.equal(ui.data.canEditRoster,false);assert.equal(ui.data.rosterStatusText,'已审核')
 assert.ok(!ui.data.rosterMembers.some(p=>p.id==='library-only'));assert.equal(ui.data.rosterMembers.find(p=>p.id==='historical').name,'球员资料暂不可用')
 const first=ui.data.rosterMembers[0];assert.equal(first.numberText,'0');assert.equal(first.metrics[0].value,'0');assert.equal(first.metrics[1].value,'—');assert.equal(first.metrics[2].value,'2');assert.equal(ui.data.rosterMembers[1].ageText,'—')
 ui.toggle({currentTarget:{dataset:{id:'p1'}}});assert.equal(ui.data.selected.length,3,'Viewing cards cannot change membership')
 ui.portraitFailed({currentTarget:{dataset:{id:'p1'}}});assert.equal(ui.data.rosterMembers[0].hasPhoto,false)
 ui.openMember({currentTarget:{dataset:{id:'p1'}}});assert.ok(routes[0].includes('player-detail?id=p1&teamId=one'))
 const draft={...source,snapshot:{status:'draft',playerIds:['p1']}};ui.hydrate(draft);assert.equal(ui.data.canEditRoster,true);ui.editRoster();assert.ok(routes.at(-1).includes('mode=select'));assert.ok(routes.at(-1).includes('divisionId=old'))
 const empty=page();empty.hydrate({...source,snapshot:null});assert.equal(empty.data.rosterMembers.length,0);assert.equal(empty.data.canEditRoster,true);assert.equal(empty.data.editRosterText,'选择球员')
 ui=page();ui.data.editing=true;ui.data.teamId='one';ui.data.tournamentId='event';ui.data.divisionId='old';ui.hydrate(draft);assert.equal(ui.data.players.length,3);ui.toggle({currentTarget:{dataset:{id:'library-only'}}});assert.equal(ui.data.selected.length,2)
 result={...source,snapshot:{status:'submitted',playerIds:['p1']}};await ui.submit();await new Promise(resolve=>setImmediate(resolve));assert.equal(ui.data.editing,false);assert.equal(ui.data.pageTitle,'正式名单');assert.equal(ui.data.canEditRoster,false)
 ui=page();ui.data.teamId='one';let release;pending=new Promise(resolve=>{release=resolve});const request=ui.load();activeUser={_id:'other'};release({result:source});await request;assert.equal(ui.data.rosterMembers.length,0,'Late response cannot expose another account roster');pending=null;activeUser={_id:'account-a'}
 result={success:false,message:'无权查看此名单'};await ui.load();assert.equal(ui.data.errorText,'无权查看此名单');assert.equal(ui.data.rosterMembers.length,0)
 const wxml=fs.readFileSync(file('wxml'),'utf8');assert.ok(wxml.includes('member-card'));assert.ok(wxml.includes('mode="aspectFit"'));assert.doesNotMatch(wxml,/U12适龄/)
 for(const expression of wxml.matchAll(/{{(.*?)}}/gs))assert.ok(/^\s*!?[\w.]+(?:\s*\|\|\s*(?:[\w.]+|'[^']*'|"[^"]*"))*\s*$/.test(expression[1]),expression[1])
 console.log('PASS: 正式名单默认一人一卡、仅快照成员、草稿/已审/待审/空状态、选择入口独立、历史缺失/未知/真实零、完整照片、失败/跨账号隔离、原提交流程及WXML')
}
main().catch(error=>{console.error(error);process.exitCode=1})
