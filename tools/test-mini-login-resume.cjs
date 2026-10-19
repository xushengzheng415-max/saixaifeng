const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path')
const root=path.resolve(__dirname,'..'),clone=value=>JSON.parse(JSON.stringify(value))
const userA={_id:'account-a',phone:'13800138000',openId:'mini-a',orgId:'org-a'},userB={_id:'account-b',phone:'13900139000',openId:'mini-b',orgId:'org-b'}
function seed(user=userA){return {authSessionVersion:'phone-canonical-v1',userInfo:clone(user),phone:user.phone,phoneNumber:user.phone,currentWorkspaceId:'shared:event-a',currentTeamId:'team-a',workspaceContext:{schemaVersion:'shared-identity-v2',user:{id:user._id,phone:user.phone},accountOwner:{id:user._id,phone:user.phone},currentWorkspace:{id:'shared:event-a',type:'tournament_shared',permissions:['event.matches']}}}}
function setup(initial={},releaseVersion='1.1.12'){
 const storage=clone(initial),calls=[],navigation=[],writes=[],timers=new Map();let timerId=0,definition,application
 const app={globalData:{userInfo:null,workspaceContext:null,currentCard:{id:'old-card'},cards:['old-card']}}
 const wx={getStorageSync:key=>storage[key],setStorageSync(key,value){storage[key]=value;writes.push(key)},removeStorageSync(key){delete storage[key];writes.push('remove:'+key)},getSystemInfoSync:()=>({platform:'ios',statusBarHeight:44}),getMenuButtonBoundingClientRect:()=>({top:48}),switchTab:options=>navigation.push(['tab',options.url]),redirectTo:options=>navigation.push(['redirect',options.url]),showToast(){},showLoading(){},hideLoading(){},cloud:{init(){},callFunction(options){calls.push(options)}}}
 const common={wx,getApp:()=>app,getCurrentPages:()=>[],console:{info(){},warn(){},error(){},log(){}},setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id},clearTimeout:id=>timers.delete(id)}
 const workspaceModule={exports:{}}
 vm.runInNewContext(fs.readFileSync(path.join(root,'miniprogram/utils/workspace.js'),'utf8'),{...common,module:workspaceModule})
 vm.runInNewContext(fs.readFileSync(path.join(root,'miniprogram/pages/login/login.js'),'utf8'),{...common,Page:value=>{definition=value},require:name=>{assert.equal(name,'../../utils/workspace');return workspaceModule.exports}})
 const page={...definition,data:clone(definition.data),setData(patch){Object.assign(this.data,patch)}}
 function launch(){vm.runInNewContext(fs.readFileSync(path.join(root,'miniprogram/app.js'),'utf8'),{...common,App:value=>{application=value},require:name=>{assert.equal(name,'./config/release');return {version:releaseVersion}}});application.globalData=app.globalData;application.onLaunch.call(application)}
 function timer(ms){for(const [id,item] of timers)if(item.ms===ms){timers.delete(id);item.fn();return}throw Error('Timer not found: '+ms)}
 return {page,storage,calls,navigation,writes,app,wx,workspace:workspaceModule.exports,launch,timer}
}
for(const version of ['1.1.10','1.1.11','1.1.12']){
 const f=setup(seed(),version);f.launch();f.page.onLoad({})
 assert.equal(f.navigation.length,0);assert.equal(f.calls.length,1);assert.equal(f.page.data.showPhoneLogin,false)
 f.calls[0].success({result:{success:true,isRegistered:true,user:userA}});assert.deepEqual(f.navigation,[['tab','/pages/home/home']]);assert.equal(f.calls.length,1)
 assert.equal(f.storage.userInfo._id,userA._id);assert.equal(f.storage.currentWorkspaceId,'shared:event-a');assert.equal(f.storage.currentTeamId,'team-a');assert.ok(!f.writes.includes('remove:userInfo'))
}
{
 const f=setup({...seed(),loginRedirectUrl:'/pages/tournament/shared/manage?id=event-a&mode=matches'});f.page.onLoad({});assert.equal(f.navigation.length,0);f.calls[0].success({result:{success:true,isRegistered:true,user:userA}});assert.deepEqual(f.navigation,[['redirect','/pages/tournament/shared/manage?id=event-a&mode=matches']]);assert.equal(f.calls.length,1)
}
{
 const f=setup({...seed(),userLoggedOut:'true'});f.page.onLoad({});assert.equal(f.calls.length,0);assert.equal(f.page.data.showPhoneLogin,true);assert.equal(f.navigation.length,0)
}
{
 const f=setup(seed());f.page.validateExistingSession();f.calls[0].fail({errMsg:'network interrupted'})
 assert.equal(f.storage.userInfo._id,userA._id);assert.equal(f.storage.currentWorkspaceId,'shared:event-a');assert.equal(f.page.data.showPhoneLogin,false);assert.match(f.page.data.restoreError,/重试/)
 f.page.validateExistingSession();assert.equal(f.calls.length,2);assert.equal(f.calls[1].name,'checkUserByOpenId');assert.deepEqual(Object.keys(f.calls[1].data),[])
 f.calls[1].success({result:{success:true,isRegistered:true,user:userA}});assert.equal(f.storage.currentWorkspaceId,'shared:event-a');assert.deepEqual(f.navigation,[['tab','/pages/home/home']])
}
{
 const f=setup(seed());f.page.validateExistingSession();f.calls[0].success({result:{success:false,message:'手机号账号登录失败，请重试'}})
 assert.equal(f.storage.userInfo._id,userA._id);assert.equal(f.page.data.showPhoneLogin,false);assert.equal(f.storage.workspaceContext.accountOwner.id,userA._id)
}
{
 const f=setup();f.page.onLoad({});assert.equal(f.page.data.restoringSession,true);assert.equal(f.page.data.showPhoneLogin,false);assert.equal(f.calls.length,1)
 f.calls[0].success({result:{success:true,isRegistered:true,user:userA}});assert.equal(f.calls.length,2);assert.equal(f.calls[1].name,'onboardingWorkspace');assert.equal(f.page.data.showPhoneLogin,false)
 f.calls[1].success({result:{success:true,requiresOnboarding:false}});assert.deepEqual(f.navigation,[['redirect','/pages/onboarding/first-use']])
}
{
 const f=setup({miniPortalRolePreferences:{version:1,roles:{[userA._id]:'organizer'}}});f.page.onLoad({});f.calls[0].success({result:{success:true,isRegistered:true,user:userA}})
 f.calls[1].success({result:{success:true,requiresOnboarding:false}});f.timer(500);assert.deepEqual(f.navigation,[['tab','/pages/home/home']]);assert.equal(f.workspace.getPortalRole(),'organizer')
}
{
 const f=setup(seed());f.page.validateExistingSession();f.timer(15000);assert.equal(f.page.data.restoringSession,false);assert.equal(f.page.data.showPhoneLogin,false);assert.equal(f.storage.userInfo._id,userA._id)
 f.calls[0].success({result:{success:true,isRegistered:true,user:userB}});assert.equal(f.storage.userInfo._id,userA._id);assert.equal(f.navigation.length,0)
}
{
 const f=setup(seed());f.page.validateExistingSession();f.calls[0].success({result:{success:true,isRegistered:false,requiresPhoneAuthorization:true}})
 assert.equal(f.page.data.showPhoneLogin,true);assert.equal(f.storage.userInfo,undefined);assert.equal(f.storage.workspaceContext,undefined);assert.equal(f.app.globalData.currentCard,null)
}
{
 const f=setup();f.page.onLoad({});f.calls[0].success({result:{success:false,message:'当前微信存在重复账号，请联系管理员处理'}})
 assert.equal(f.page.data.restoreBlocked,true);f.page.usePhoneLogin();assert.equal(f.page.data.showPhoneLogin,false);assert.equal(f.navigation.length,0)
}
{
 const f=setup(seed());f.page.validateExistingSession();f.page.usePhoneLogin();f.page.data.agreementChecked=true
 f.page.loginWithPhone({detail:{code:'one-use-phone-code'}});f.page.loginWithPhone({detail:{code:'one-use-phone-code'}})
 assert.equal(f.calls.length,2);assert.equal(f.calls[1].name,'checkUserByOpenId');assert.equal(f.calls[1].data.phoneCode,'one-use-phone-code')
 f.calls[1].success({result:{success:true,isRegistered:true,user:userB}});assert.equal(f.storage.userInfo._id,userB._id);assert.equal(f.storage.currentWorkspaceId,undefined);assert.equal(f.storage.currentTeamId,undefined);assert.equal(f.app.globalData.workspaceContext,null)
 f.calls[0].success({result:{success:true,isRegistered:true,user:userA}});assert.equal(f.storage.userInfo._id,userB._id)
 f.calls[2].fail({errMsg:'onboarding unavailable'});f.timer(500)
}
{
 const f=setup({...seed(),userLoggedOut:'true'});f.page.onLoad({});f.page.data.agreementChecked=true;f.page.loginWithPhone({detail:{code:'valid-code'}})
 assert.equal(f.storage.userLoggedOut,'true');f.calls[0].fail({errMsg:'offline'});assert.equal(f.storage.userLoggedOut,'true');assert.equal(f.storage.userInfo._id,userA._id)
}
{
 const f=setup();f.page.onLoad({});f.page.onUnload();f.calls[0].success({result:{success:true,isRegistered:true,user:userA}})
 assert.equal(f.storage.userInfo,undefined);assert.equal(f.navigation.length,0)
}
for(const expression of fs.readFileSync(path.join(root,'miniprogram/pages/login/login.wxml'),'utf8').matchAll(/\{\{([\s\S]*?)\}\}/g))assert.doesNotMatch(expression[1],/===|!==|==|!=|\?|\[|\]|\(|\)|&&|[<>]/)
{
 const f=setup(seed());f.page.onLoad({});assert.equal(f.navigation.length,0);f.calls[0].success({result:{success:true,isRegistered:true,user:userB}});assert.equal(f.storage.userInfo._id,userB._id);assert.equal(f.storage.currentWorkspaceId,undefined);assert.equal(f.app.globalData.workspaceContext,null);assert.equal(f.navigation.length,0);f.calls[1].success({result:{success:true,requiresOnboarding:false}});assert.deepEqual(f.navigation,[['redirect','/pages/onboarding/first-use']])
}
{
 const f=setup(seed());f.wx.cloud.callFunction=()=>{throw Error('SDK unavailable')};f.page.validateExistingSession();assert.equal(f.page.data.restoringSession,false);assert.match(f.page.data.restoreError,/重试/);assert.equal(f.storage.userInfo._id,userA._id)
}
for(const filename of ['pages/event/index.js','pages/teams/index.js','pages/training/index.js','pages/profile/profile.js']){
 let definition,authenticated=false,loads=0
 vm.runInNewContext(fs.readFileSync(path.join(root,'miniprogram',filename),'utf8'),{Page:value=>{definition=value},require:name=>name.includes('workspace')?{hasAuthenticatedUser:()=>authenticated,readContext:()=>({})}:{},wx:{},console})
 const page={...definition,data:{...clone(definition.data),guestMode:true,visualQa:false,localVisualQa:false},setData(patch){Object.assign(this.data,patch)},applyContext(){},loadData(){loads++}}
 page.onShow();assert.equal(loads,0);assert.equal(page.data.guestMode,true)
 authenticated=true;page.onShow();assert.equal(loads,1,filename);assert.equal(page.data.guestMode,false,filename)
}
console.log('PASS: 连续功能版本更新保持登录与赛事空间、一次服务端静默恢复、网络/业务临时失败不清登录、超时/重复/迟到响应、仅明确缺绑定授权、主动退出保持、切账号清除及在途隔离、邀请深链与WXML规则；仅隔离数据')
