'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const cards = require('../miniprogram/utils/workspace-entry-cards')

const user = { id:'isolated-home-role', phone:'13800138000' }
const teams = ['a','b'].map(id=>({ id:'team-'+id, name:'隔离球队'+id }))
const spaces = teams.map(team=>({ id:'team:'+team.id, type:'team', teamId:team.id, permissions:['team.view'] }))
const base = {
  user, currentWorkspace:spaces[0], currentIdentity:{id:'organizer'}, workspaces:spaces,
  homeEntriesVersion:'home-entries/2', homeEntries:[
    ...teams.map((team,i)=>({ ...team, type:'team', key:'team:'+team.id, workspaceId:spaces[i].id })),
    { id:'unrelated-shared', type:'tournament', key:'tournament:unrelated-shared', workspaceId:'shared:unrelated-shared', name:'隔离共享赛事' }
  ],
  participatingEntriesVersion:'team-participation/1', participatingEntriesState:'ready',
  participatingEntries:[['one',0],['one',1],['two',0]].map(([event,i])=>({
    id:'event-'+event, type:'tournament', key:'participating:event-'+event+':'+teams[i].id+':senior',
    name:'隔离参赛赛事'+event, teamId:teams[i].id, teamName:teams[i].name, divisionId:'senior', divisionName:'老年组', workspaceId:spaces[i].id
  })), teams,
  eventTasks:[
    {id:'team-pending',audience:'team',status:'pending',title:'比赛阵容待提交'},
    {id:'team-done',audience:'team',status:'completed',title:'已处理任务'},
    {id:'organizer-only',audience:'organizer',status:'pending',title:'报名审核'}
  ]
}

async function run() {
  let definition, current=structuredClone(base), role='team_coach'
  const routes=[],storage={userInfo:{_id:user.id,phone:user.phone}}
  const workspace={getPortalRole:()=>role,readContext:()=>current,hasAuthenticatedUser:()=>true,
    loadContext:()=>Promise.resolve(current),switchWorkspace:async id=>{current={...current,currentWorkspace:spaces.find(s=>s.id===id)};return current}}
  const wx={getStorageSync:k=>storage[k],setStorageSync:(k,v)=>{storage[k]=v},showLoading(){},hideLoading(){},showToast(){},
    navigateTo:args=>{routes.push(args.url);return Promise.resolve()},getSystemInfoSync:()=>({statusBarHeight:44}),getMenuButtonBoundingClientRect:()=>({top:48})}
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/pages/home/home.js'),'utf8'),{
    Page:value=>{definition=value},wx,require:name=>name.endsWith('/workspace-entry-cards')?cards:name.endsWith('/workspace')?workspace:name.endsWith('/quick-setup')?{site:'https://www.sxffootball.cn'}:{read:()=>null,resolveAgainstRegistrations:()=>null,toTask:()=>null}
  })
  const page={...definition,data:structuredClone(definition.data),setData(value){Object.assign(this.data,value)}}
  page.applyContext(current)
  assert.equal(page.data.homeRoleLabel,'球队管理者','Display follows chosen role rather than the underlying resource identity')
  assert.equal(page.data.showTeamHome,true)
  assert.equal(page.data.showOrganizerHome,false)
  assert.equal(page.data.teamHomeTeams.length,2)
  assert.equal(page.data.teamHomeEvents.length,3,'Two teams in one event and one team in two events remain distinct')
  assert.deepEqual(Array.from(page.data.teamHomeTasks,t=>t.id),['team-pending'])
  const secondTeam=page.data.teamHomeEvents.find(e=>e.teamId==='team-b')
  assert.ok(secondTeam.hasParticipant)
  assert.equal(secondTeam.participantText,'隔离球队b · 老年组')
  await page.onHomeEntryTap({detail:{key:secondTeam.key},currentTarget:{dataset:{}}})
  assert.ok(routes[0].includes('view=team') && routes[0].includes('teamId=team-b'))
  assert.equal(role,'team_coach')
  page.createHomeTeam()
  assert.equal(page.data.createKind,'team')
  assert.equal(page.data.createVisible,true)
  page.closeCreateSheet()
  const unavailable={...current,participatingEntriesState:'failed',participatingEntries:[]}
  page.applyContext(unavailable)
  assert.equal(page.data.teamParticipationUnavailable,true,'Failed reads are not an empty participation history')
  role='organizer';page.applyContext(current)
  assert.equal(page.data.homeRoleLabel,'赛事组织者')
  assert.equal(page.data.showTeamHome,false)
  assert.equal(page.data.teamHomeEvents.length,0)
  assert.ok(page.data.homeEntries.every(entry=>entry.type==='tournament'),'Organizer homepage hides personal team cards')
  assert.equal(page.data.homeEntries.length,1)
  page.createTournament();assert.equal(page.data.createKind,'event')
  page.goToPublicCenter();assert.equal(routes.at(-1),'/pages/public-tournament-center/index')
  delete storage.userInfo;await page.loadData()
  assert.equal(page.data.showWorkHome,false)
  assert.equal(page.data.teamHomeTeams.length,0)

  let center
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/pages/public-tournament-center/index.js'),'utf8'),{Page:value=>{center=value},wx})
  const instance={...center,data:{...center.data},setData(value){Object.assign(this.data,value)}}
  instance.onWebError();assert.equal(instance.data.url,'')
  instance.retry();assert.equal(instance.data.url,'https://www.sxffootball.cn/service-account-h5/tournament-center.html')
  const app=JSON.parse(fs.readFileSync(path.join(__dirname,'../miniprogram/app.json'),'utf8'))
  assert.ok(app.pages.includes('pages/public-tournament-center/index'))
  console.log('PASS two work homepages: dynamic identity; own teams; scoped pending tasks; distinct team/event participation; authorized team entry; role switch and sign-out cleanup; public-center route and retry. Isolated fixtures only.')
}
run().catch(error=>{console.error(error);process.exitCode=1})
