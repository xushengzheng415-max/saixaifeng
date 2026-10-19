'use strict'
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const read=file=>fs.readFileSync(path.join(__dirname,'../miniprogram',file),'utf8')
const a={_id:'account-a',phone:'13800138000'},b={_id:'account-b',phone:'13900139000'}
const shared={id:'shared:one',type:'tournament_shared',permissions:['event.view']}
const team={id:'team:alpha',type:'team',teamId:'alpha',permissions:['team.manage','team.view']}
const org={id:'org:own',type:'organization',permissions:['event.manage','team.manage']}
async function main(){
 const storage={},calls=[];let app,workspace,login,failSwitch=false,holdTeam=false,pendingTeam,catalog=[shared,team,org]
 const wx={getStorageSync:key=>storage[key],setStorageSync:(key,value)=>{storage[key]=structuredClone(value)},removeStorageSync:key=>{delete storage[key]},clearStorageSync(){for(const key of Object.keys(storage))delete storage[key]},showToast(){},reLaunch(){},cloud:{callFunction(options){
   calls.push(structuredClone(options.data))
   if(options.data.action==='setHomeIdentity')return failSwitch?Promise.reject(Error('网络异常，请重试')):Promise.resolve({result:{success:true}})
   const user=structuredClone(storage.userInfo),scope=catalog.find(row=>row.id===options.data.workspaceId)||shared
   const result={success:true,user:{id:user._id,phone:user.phone},currentWorkspace:scope,currentIdentity:{id:scope.type==='tournament_shared'?'event_staff':scope.type==='team'?'team_coach':'organizer'},workspaces:catalog,teams:scope.type==='team'?[{id:'alpha'}]:[],registrations:scope.type==='team'?[{teamId:'alpha',tournamentId:'one'}]:[]}
   if(holdTeam && options.data.workspaceId===team.id){pendingTeam=()=>options.success({result});return Promise.resolve({result})}
   queueMicrotask(()=>options.success({result}));return Promise.resolve({result})
 }}}
 const common={wx,getApp:()=>app,getCurrentPages:()=>[],console:{log(){},info(){},warn(){},error(){}},setTimeout,clearTimeout}
 function reloadWorkspace(){const module={exports:{}};vm.runInNewContext(read('utils/workspace.js'),{...common,module});workspace=module.exports}
 reloadWorkspace()
 vm.runInNewContext(read('app.js'),{...common,App:value=>{app=value},require:name=>name==='./utils/workspace'?workspace:{version:'test'}})
 vm.runInNewContext(read('pages/login/login.js'),{...common,Page:value=>{login={...value,data:structuredClone(value.data),setData(patch){Object.assign(this.data,patch)},goToPostLogin(){},goToHome(){}}},require:()=>workspace})
 function signIn(user){login.finishLogin(user,false);assert.equal(storage.userInfo._id,user._id)}
 signIn(a)
 workspace.getPortalRole({})
 assert.equal(storage.miniPortalRolePreferences,undefined,'Loading fallback must not become a saved identity')
 assert.equal(workspace.getPortalRole({user:{id:a._id,phone:a.phone},currentIdentity:{id:'event_staff'}}),'organizer')
 await workspace.switchPortalRole('team_coach');assert.equal(workspace.getPortalRole(),'team_coach')
 storage.secretToken='remove-me';storage.teamInfo={id:'alpha',privateInfo:true}
 app.logout()
 assert.equal(storage.userInfo,undefined);assert.equal(storage.workspaceContext,undefined);assert.equal(storage.secretToken,undefined);assert.equal(storage.teamInfo,undefined);assert.equal(app.globalData.userInfo,null)
 assert.deepEqual(Object.keys(storage).sort(),['authSessionVersion','miniPortalRolePreferences','userLoggedOut'])
 assert.equal(storage.miniPortalRolePreferences.roles[a._id],'team_coach');assert.doesNotMatch(JSON.stringify(storage.miniPortalRolePreferences),/13800138000|secretToken|privateInfo/)
 signIn(a);calls.length=0
 let context=await workspace.loadContext()
 assert.equal(context.currentWorkspace.id,team.id);assert.equal(context.registrations.length,1)
 assert.deepEqual(calls.map(row=>row.workspaceId),['',team.id]);assert.equal(calls[1].preserveWorkspace,true)
 await workspace.switchWorkspace(shared.id);assert.equal(workspace.readContext().currentWorkspace.id,shared.id);assert.equal(workspace.getPortalRole(),'team_coach')
 reloadWorkspace();app.onLaunch();assert.equal(workspace.getPortalRole({currentIdentity:{id:'event_staff'}}),'team_coach','App launch and cold module restart keep chosen role')
 app.logout();signIn(b);assert.equal(workspace.getPortalRole({user:{id:b._id,phone:b.phone},currentIdentity:{id:'organizer'}}),'organizer','Another account does not inherit role')
 app.logout();signIn(a);assert.equal(workspace.getPortalRole({currentIdentity:{id:'event_staff'}}),'team_coach','Returning to A restores A preference')
 await workspace.switchPortalRole('organizer');app.logout();signIn(a);assert.equal(workspace.getPortalRole(),'organizer')
 failSwitch=true;await assert.rejects(workspace.switchPortalRole('team_coach'),/重试/);assert.equal(workspace.getPortalRole(),'organizer','Failed switch does not overwrite last completed selection');failSwitch=false
 await workspace.switchPortalRole('team_coach');app.logout();signIn(a);holdTeam=true
 const inFlight=workspace.loadContext().catch(error=>error);await new Promise(resolve=>setImmediate(resolve));assert.ok(pendingTeam)
 app.logout();signIn(b);pendingTeam();assert.equal((await inFlight).code,'SESSION_ACCOUNT_MISMATCH');assert.equal(storage.userInfo._id,b._id);assert.equal(workspace.getPortalRole(),'organizer');assert.equal(storage.workspaceContext,undefined);holdTeam=false
 app.logout();signIn(a);catalog=[shared];context=await workspace.loadContext();assert.equal(workspace.getPortalRole(),'team_coach');assert.equal(workspace.roleWorkspaces(context,'team_coach').length,0,'Saved UI role cannot grant missing permission')
 storage.miniPortalRole={accountKey:a._id+'|'+a.phone,id:'organizer'};delete storage.miniPortalRolePreferences
 app.logout();assert.equal(storage.miniPortalRolePreferences.roles[a._id],'organizer');assert.equal(storage.miniPortalRole,undefined)
 storage.miniPortalRolePreferences.roles.bad='super_admin';app.logout();assert.equal(storage.miniPortalRolePreferences.roles.bad,undefined)
 console.log('PASS: 身份跨重启/退出重登、A/B独立记忆、旧偏好迁移、清登录保留非敏感偏好、核验目录恢复身份空间、显式资源不干预、失败/撤权/迟到隔离；仅本地隔离数据')
}
main().catch(error=>{console.error(error);process.exitCode=1})
