'use strict'
const assert=require('node:assert/strict')
const createSelfPlayerTeam=require('../cloudfunctions/getMiniWorkspace/selfPlayerTeam.cjs')
const store={players:new Map(),teams:new Map(),player_team_history:new Map()}
const db={serverDate:()=>new Date(),runTransaction:async work=>work(db),collection:name=>({
  where:query=>({limit:()=>({get:async()=>({data:[...store[name].entries()].filter(([id,row])=>Object.entries(query).every(([key,value])=>(key==='_id'?id:row[key])===value)).map(([id,row])=>({_id:id,...row}))})})}),
  doc:id=>({
    get:async()=>{const row=store[name].get(id);return{data:row?{_id:id,...row}:null}},
    set:async({data})=>{store[name].set(id,data)},
    update:async({data})=>{const current=store[name].get(id);if(!current)throw new Error('DOCUMENT_NOT_EXIST');store[name].set(id,{...current,...data})}
  })
})}
const workspaceError=(code,message)=>Object.assign(new Error(message),{code})
let permissions=['team.manage']
const deps={db,workspaceError,findWorkspaceForAction:async()=>({workspace:{type:'team',teamId:'team-1',permissions}}),loadTeams:async()=>[...store.teams.entries()].map(([id,row])=>({_id:id,...row}))}
const {run}=createSelfPlayerTeam(deps)
const identity={user:{_id:'user-1'},openId:'wx-mini-openid'}
const seedTeam=()=>store.teams.set('team-1',{name:'新建测试队',orgId:'org-1',playerRegistrationRevision:0})
;(async()=>{
  seedTeam()
  const missing=await run(identity,{teamId:'team-1'})
  assert.equal(missing.code,'SELF_PLAYER_REQUIRED')

  store.players.set('free-self',{name:'测试球员',linkedUserId:'user-1',teamId:'',orgId:'',profileStatus:'pending'})
  const joined=await run(identity,{teamId:'team-1',workspaceId:'team:team-1'})
  assert.equal(joined.success,true)
  assert.equal(store.players.get('free-self').teamId,'team-1')
  assert.equal(store.players.get('free-self').orgId,'org-1')
  assert.equal(store.players.get('free-self').profileStatus,'pending')
  assert.equal(store.player_team_history.size,1)
  assert.equal(store.teams.get('team-1').playerRegistrationRevision,1)
  const history=[...store.player_team_history.values()][0]
  assert.equal(history.joinSource,'self_created_team')
  assert.equal(history.teamId,'team-1')

  const repeated=await run(identity,{teamId:'team-1'})
  assert.equal(repeated.alreadyJoined,true)
  assert.equal(store.player_team_history.size,1)
  assert.equal(store.teams.get('team-1').playerRegistrationRevision,1)

  // 已属于其他球队的档案不能被自助加入覆盖。
  store.players.set('free-other',{name:'另一名球员',linkedUserId:'user-2',teamId:'team-9',orgId:'org-9'})
  const moved=await run({user:{_id:'user-2'},openId:'wx-2'},{teamId:'team-1'})
  assert.equal(moved.code,'PLAYER_TEAM_CONFLICT')

  // 权限与球队范围。
  permissions=[]
  const forbidden=await run({user:{_id:'user-3'},openId:'wx-3'},{teamId:'team-1'})
  assert.equal(forbidden.code,'TEAM_MANAGE_REQUIRED')
  permissions=['team.manage']
  const outside=await run(identity,{teamId:'team-404'})
  assert.equal(outside.code,'TEAM_SCOPE_DENIED')

  // 明确选择他人档案必须拒绝；监护人选择本人监护的孩子可以加入。
  store.players.set('other-player',{name:'他人球员',linkedUserId:'user-8'})
  const notMine=await run(identity,{teamId:'team-1',playerId:'other-player'})
  assert.equal(notMine.code,'SELF_PLAYER_FORBIDDEN')
  store.players.set('child-player',{name:'小球员',guardianUserId:'user-1',guardianPhone:'13800138000',teamId:''})
  const child=await run(identity,{teamId:'team-1',playerId:'child-player'})
  assert.equal(child.success,true)
  assert.equal(store.players.get('child-player').teamId,'team-1')

  // 同一账号多份本人档案时阻断。
  store.players.set('free-self-2',{name:'测试球员',linkedUserId:'user-1',teamId:''})
  const conflict=await run(identity,{teamId:'team-1'})
  assert.equal(conflict.code,'SELF_PLAYER_CONFLICT')
  console.log('建队后本人入队：明确入队、幂等、跨队拒绝、权限与球队范围、监护选择通过')
})().catch(error=>{console.error(error);process.exitCode=1})
