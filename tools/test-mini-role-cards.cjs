'use strict'
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const cards=require('../miniprogram/utils/workspace-entry-cards')
const user={id:'role-user',phone:'13800000000'}
const org={id:'org:own',type:'organization',orgId:'own',name:'本人机构',permissions:['event.manage','team.view','team.manage']}
const teamSpace={id:'team:team-a',type:'team',teamId:'team-a',name:'甲队',permissions:['team.view','team.manage','event.view']}
const sharedSpace={id:'shared:shared-event',type:'tournament_shared',tournamentId:'shared-event',name:'共享赛事',permissions:['event.view']}
const entries=[{key:'team:team-a',id:'team-a',type:'team',workspaceId:teamSpace.id,name:'甲队',playerCount:0,playerCountState:'ready'}, {key:'tournament:own-event',id:'own-event',type:'tournament',workspaceId:org.id,name:'本人赛事',statusText:'进行中',isShared:false}, {key:'tournament:shared-event',id:'shared-event',type:'tournament',workspaceId:sharedSpace.id,name:'共享赛事',statusText:'已结束',isShared:true,badgeText:'共享'}]
const base={user,currentWorkspace:sharedSpace,currentIdentity:{id:'event_staff'},workspaces:[org,teamSpace,sharedSpace],homeEntries:entries,homeEntriesVersion:'home-entries/2',teams:[],tournaments:[{id:'own-event',name:'本人赛事',isHosted:true,isParticipating:true,dateText:'2026-10-16',statusText:'进行中'}],registrations:[],participatingEntriesVersion:'team-participation/1',participatingEntriesState:'ready',participatingEntries:[]}
function harness(file,role,context=base) {
  let definition,next=context
  const storage={userInfo:{_id:user.id,phone:user.phone}},routes=[],switches=[],toasts=[]
  const workspace={getPortalRole:()=>role,readContext:()=>context,hasPermission:(right,c)=>(c.currentWorkspace.permissions || []).includes(right),loadContext:()=>Promise.resolve(next),switchWorkspace:id=>{switches.push(id);return Promise.resolve({...next,currentWorkspace:next.workspaces.find(row=>row.id===id)})}}
  const wx={getStorageSync:key=>storage[key],setStorageSync:(key,value)=>{storage[key]=value},showLoading(){},hideLoading(){},showToast:args=>toasts.push(args.title),navigateTo:args=>{routes.push(args.url);return Promise.resolve()},showActionSheet:args=>args.success({tapIndex:0})}
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../miniprogram/pages',file),'utf8'),{Page:value=>{definition=value},require:name=>name.endsWith('/workspace-entry-cards')?cards:workspace,wx,Promise})
  const page={...definition,data:structuredClone(definition.data),setData(value){Object.assign(this.data,value)}}
  page.applyContext(context)
  return {page,workspace,wx,routes,switches,toasts,next:value=>{next=value}}
}
async function rolePreference() {
  const storage={userInfo:{_id:user.id,phone:user.phone}},app={globalData:{}}
  let serverRole='organizer'
  global.getApp=()=>app;global.getCurrentPages=()=>[]
  global.wx={getStorageSync:key=>storage[key],setStorageSync:(key,value)=>{storage[key]=value},removeStorageSync:key=>delete storage[key],reLaunch(){},cloud:{callFunction(options){
    if(options.data.action==='setHomeIdentity'){serverRole=options.data.identity;return Promise.resolve({result:{success:true}})}
    const current=base.workspaces.find(row=>row.id===options.data.workspaceId) || sharedSpace
    const result={...base,success:true,currentWorkspace:current,currentIdentity:{id:current.type==='tournament_shared'?'event_staff':current.type==='team'?'team_coach':serverRole}}
    queueMicrotask(()=>options.success({result}));return Promise.resolve({result})
  }}}
  const file=require.resolve('../miniprogram/utils/workspace');delete require.cache[file];const workspace=require(file)
  assert.equal(workspace.getPortalRole(base),'organizer')
  workspace.saveContext({...base,currentWorkspace:teamSpace,currentIdentity:{id:'team_coach'}})
  assert.equal(workspace.getPortalRole(),'organizer','Entering a team cannot silently change portal identity')
  const choices=workspace.portalRoleOptions(base)
  assert.deepEqual(choices.map(row=>row.title),['球队管理者','赛事组织者'])
  assert.equal(choices.length,2)
  await assert.rejects(workspace.switchPortalRole('training_coach'))
  await workspace.switchPortalRole('team_coach')
  assert.equal(workspace.getPortalRole(),'team_coach')
  const context=workspace.readContext();assert.equal(context.currentWorkspace.id,teamSpace.id)
  workspace.saveContext({...base,currentWorkspace:sharedSpace,currentIdentity:{id:'event_staff'}})
  assert.equal(workspace.getPortalRole(),'team_coach','Shared-event resource entry does not switch portal identity')
  await workspace.switchPortalRole('organizer');assert.equal(workspace.getPortalRole(),'organizer')
  storage.userInfo={_id:'other-user',phone:'13900000000'}
  assert.equal(workspace.getPortalRole({currentIdentity:{id:'team_coach'}}),'team_coach','Portal preference belongs to one account')
  assert.equal(workspace.portalRoleOptions({currentIdentity:{id:'team_coach'},workspaces:[teamSpace]}).find(row=>row.id==='organizer').selectable,false)
}
async function run() {
  await rolePreference()
  const teams=harness('teams/index.js','organizer')
  assert.equal(teams.page.data.hasTeams,true,'Shared workspace must not hide verified teams')
  assert.equal(teams.page.data.showTeamEmpty,false)
  assert.equal(teams.page.data.teams.length,1)
  const oldCache={...base};delete oldCache.registrations
  delete oldCache.participatingEntriesVersion;delete oldCache.participatingEntriesState;delete oldCache.participatingEntries
  const waiting=harness('event/index.js','team_coach',oldCache)
  assert.equal(waiting.page.data.loading,true)
  assert.equal(waiting.page.data.showEventEmpty,false,'Missing old-cache relations cannot prove an empty event list')
  teams.next({...base,teams:[{id:'team-a',name:'甲队'}]})
  await teams.page.onTeamTap({currentTarget:{dataset:{id:'team-a'}}})
  assert.equal(teams.routes[0],'/pages/team/team');assert.deepEqual(teams.switches,[teamSpace.id])
  const teamContext={...base,currentWorkspace:org,currentIdentity:{id:'organizer'},teams:[{id:'team-a',name:'甲队'},{id:'team-b',name:'乙队'}],registrations:[{teamId:'team-a',tournamentId:'own-event',divisionId:'d1',divisionName:'老年组',status:'approved'},{teamId:'team-b',tournamentId:'own-event',divisionId:'d2',divisionName:'中年组',status:'approved'}]}
  teamContext.homeEntries=entries.concat([{key:'team:team-b',id:'team-b',type:'team',workspaceId:org.id,name:'乙队'}])
  teamContext.participatingEntries=[{key:'participating:own-event:team-a:d1',id:'own-event',type:'tournament',name:'本人赛事',teamName:'甲队',teamId:'team-a',divisionId:'d1',divisionName:'老年组',workspaceId:teamSpace.id},{key:'participating:own-event:team-b:d2',id:'own-event',type:'tournament',name:'本人赛事',teamName:'乙队',teamId:'team-b',divisionId:'d2',divisionName:'中年组',workspaceId:org.id}]
  const team=harness('event/index.js','team_coach',teamContext)
  assert.equal(team.page.data.visibleTournaments.length,2)
  assert.notEqual(team.page.data.visibleTournaments[0].key,team.page.data.visibleTournaments[1].key)
  await team.page.onTournamentTap({currentTarget:{dataset:{key:team.page.data.visibleTournaments[1].key}}})
  assert.ok(team.routes[0].includes('view=team'))
  assert.ok(team.routes[0].includes('teamId=team-b'))
  assert.ok(team.routes[0].includes('divisionId=d2'))
  assert.ok(team.routes[0].includes('workspaceId=org%3Aown'))
  const organizer=harness('event/index.js','organizer',teamContext)
  assert.equal(organizer.page.data.hostedTournaments.length,1)
  await organizer.page.onTournamentTap({currentTarget:{dataset:{key:entries[1].key}}})
  assert.equal(organizer.routes[0],'/pages/tournament/detail/detail?id=own-event&view=organizer')
  organizer.page.onStatusTap({currentTarget:{dataset:{id:'ended'}}});assert.equal(organizer.page.data.visibleTournaments.length,0)
  organizer.page.onRelationTap({currentTarget:{dataset:{id:'shared'}}});assert.equal(organizer.page.data.visibleTournaments.length,1)
  await organizer.page.onTournamentTap({currentTarget:{dataset:{key:entries[2].key}}})
  assert.equal(organizer.routes[1],'/pages/tournament/shared/shared?id=shared-event')
  const noRegistration=harness('event/index.js','team_coach',base)
  await cards.open(noRegistration.page,cards.format(entries[2]),noRegistration.workspace,noRegistration.wx)
  assert.equal(noRegistration.routes.length,0);assert.equal(noRegistration.switches.length,0)
  assert.ok(noRegistration.toasts[0].includes('参赛记录'))
  let definition,legacyReads=0
  const db={collection(){legacyReads++;throw Error('Team entry must not load organizer legacy DB path')}}
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../miniprogram/pages/tournament/detail/detail.js'),'utf8'),{getApp:()=>({globalData:{}}),Page:value=>{definition=value},wx:{cloud:{database:()=>db}},require:()=>({isVisualQaEnabled:()=>false}),console,Promise})
  const detail={...definition,data:{...structuredClone(definition.data),entryView:'team'},setData(value){Object.assign(this.data,value)},loadTeamTournamentDetail:()=>Promise.resolve(false)}
  let loads=0
  detail.loadTournament=()=>{loads++}
  detail.onLoad({id:'own-event',view:'team',workspaceId:'team%3Ateam-a',teamId:'team-a',divisionId:'d1'})
  assert.equal(detail.data.requestedWorkspaceId,'team:team-a');assert.equal(loads,1)
  detail.loadTournament=definition.loadTournament
  await detail.loadTournament();assert.equal(detail.data.isOrganizer,false);assert.equal(legacyReads,0);assert.ok(detail.data.errorMsg)
  let component
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../miniprogram/components/workspace-entry-card/index.js'),'utf8'),{Component:value=>{component=value}})
  const c={properties:{entry:cards.format(entries[0])},data:{displayLogo:'broken'},setData(value){Object.assign(this.data,value)},triggerEvent(name,data){assert.equal(name,'open');assert.equal(data.key,entries[0].key)}}
  component.methods.imageError.call(c);assert.equal(c.data.displayLogo,c.properties.entry.fallbackLogo);component.methods.openCard.call(c)
  for(const page of ['home/home','event/index','teams/index']){const json=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../miniprogram/pages',page+'.json')));assert.equal(json.usingComponents['workspace-entry-card'],'/components/workspace-entry-card/index')}
  console.log('共享B卡与双身份：共享空间球队可见、球队/主办/共享三种资源路由、组别团队参数、球队失败不回落主办、仅我的切两身份、账号隔离与卡片回退通过')
}
run().catch(error=>{console.error(error);process.exitCode=1})
