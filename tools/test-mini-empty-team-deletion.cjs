'use strict'
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const deletion=require('../cloudfunctions/getMiniWorkspace/teamDeletion.cjs')
const identity={user:{_id:'isolated-owner',phone:'13800000000'},openId:'isolated-open-id'}
const scope={id:'team:empty',type:'team',teamId:'empty',orgId:'own-org',permissions:['team.view','team.manage']}
const team={_id:'empty',name:'隔离空球队',orgId:'own-org',ownerId:identity.user._id,teamCode:'legacy-code',updateTime:'2026-10-16T00:00:00Z'}
function database(extra={}) {
  let store={teams:[structuredClone(team)],team_memberships:[],users:[{_id:identity.user._id}],...structuredClone(extra)},writes=[]
  const command={or:parts=>({$or:parts}),and:parts=>({$and:parts}),gt:value=>({$gt:value})}
  const value=(row,key)=>key.split('.').reduce((current,part)=>current && current[part],row)
  const match=(row,where)=>Object.entries(where || {}).every(([key,want])=>key==='$or'?want.some(part=>match(row,part)):key==='$and'?want.every(part=>match(row,part)):want && want.$gt!==undefined?value(row,key)>want.$gt:value(row,key)===want)
  function collections(data,events,name,transaction) {return {
    where(where){assert.equal(transaction,false,'CloudBase transactions cannot use where()');let limit=100;const q={limit(n){limit=n;return q},orderBy(){return q},get:async()=>{
      if (db.failCollection===name) throw Error('network unavailable')
      if (db.missingCollection===name) throw Error('collection does not exist')
      return {data:(data[name] || []).filter(row=>match(row,where)).sort((a,b)=>String(a._id).localeCompare(String(b._id))).slice(0,limit)}
    }};return q},
    doc(id){return {get:async()=>{const row=(data[name] || []).find(row=>row._id===id);if(!row)throw Error('document.getfail document with_id does not exist');return {data:structuredClone(row)}},
      set:async({data:row})=>{if(db.failAudit&&name==='team_deletion_audits')throw Error('audit failed');data[name]=data[name] || [];const i=data[name].findIndex(item=>item._id===id);if(i>=0)data[name][i]={_id:id,...row};else data[name].push({_id:id,...row});events.push({collection:name,operation:'set',id})},
      remove:async()=>{data[name]=(data[name] || []).filter(row=>row._id!==id);events.push({collection:name,operation:'remove',id})}}}
  }}
  const db={command,get store(){return store},get writes(){return writes},createCollection:async()=>({}),serverDate:()=>new Date('2026-10-16T04:00:00Z'),collection:name=>collections(store,writes,name,false),runTransaction:async callback=>{
    if(db.beforeTransaction)db.beforeTransaction(store)
    const copy=structuredClone(store),events=[]
    const result=await callback({collection:name=>collections(copy,events,name,true)})
    store=copy;writes.push(...events);return result
  }}
  return db
}
const info=db=>deletion.info(db,identity,scope,{teamId:'empty'})
const remove=(db,state,extra={})=>deletion.remove(db,identity,scope,{teamId:'empty',confirmName:team.name,revision:state.revision,...extra})
function profilePage(responses,modalConfirmed=true) {
  const actions=[],storage={userInfo:{_id:identity.user._id},teamInfo:{_id:'empty'}},context={currentWorkspace:scope}
  let definition,cleared=false
  const wx={getStorageSync:key=>storage[key],removeStorageSync:key=>delete storage[key],showToast:args=>actions.push(['toast',args.title]),reLaunch:args=>{actions.push(['navigate',args.url]);return Promise.resolve()},showModal:args=>{actions.push(['modal',args.content]);args.success({confirm:modalConfirmed})},cloud:{callFunction:async({data})=>{actions.push(['call',data.action]);const result=responses[data.action];if(result instanceof Error)throw result;return {result:typeof result==='function'?result(data):result}}}}
  const workspace={readContext:()=>context,clearContext:()=>{cleared=true}}
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../miniprogram/pages/team/profile/profile.js'),'utf8'),{Page:value=>{definition=value},require:()=>workspace,wx,Promise})
  const page={...definition,data:{...structuredClone(definition.data),teamId:'empty',profile:{name:team.name}},setData(value){Object.assign(this.data,value)}}
  return {page,actions,storage,get cleared(){return cleared}}
}
async function run() {
  const empty=database(),state=await info(empty)
  assert.equal(state.isOwner,true);assert.equal(state.canDelete,true);assert.equal(empty.writes.length,0)
  await remove(empty,state)
  assert.equal(empty.store.teams.length,0);assert.equal(empty.store.users.length,1)
  assert.deepEqual(empty.writes.map(row=>row.collection),['team_deletion_audits','teams'])
  assert.equal(empty.store.team_deletion_audits[0].actorUserId,identity.user._id)
  for (const [collection,keys] of deletion.references) {
    for (const key of keys.slice(0,2)) {
      const record={_id:'related', [key]:'empty'},db=database({[collection]:[record]})
      const s=await info(db);assert.equal(s.canDelete,false,collection)
      await assert.rejects(remove(db,{revision:'fake'},{force:true}),error=>error.code==='TEAM_NOT_EMPTY',collection)
      assert.equal(db.store.teams.length,1);assert.equal(db.writes.length,0)
    }
  }
  const legacy=database({players:[{_id:'legacy-player',teamCode:'legacy-code'}]});assert.equal((await info(legacy)).canDelete,false)
  const admin=database({teams:[{...team,ownerId:'other-owner'}],team_memberships:[{_id:'admin',teamId:'empty',userId:identity.user._id,status:'active',role:'team_manager'}]})
  assert.equal((await info(admin)).isOwner,false)
  await assert.rejects(remove(admin,{revision:'forged'}),error=>error.code==='TEAM_OWNER_REQUIRED')
  const conflict=database({teams:[{...team,ownerUserId:'new-owner'}]});assert.equal((await info(conflict)).isOwner,false)
  const wrongOrg={...scope,type:'organization',orgId:'other-org'}
  await assert.rejects(deletion.info(database(),identity,wrongOrg,{teamId:'empty'}),error=>error.code==='TEAM_ACCESS_DENIED')
  await assert.rejects(deletion.info(database(),identity,{...scope,type:'tournament_shared'},{teamId:'empty'}),error=>error.code==='TEAM_ACCESS_DENIED')
  const newlyPopulated=database(),old=await info(newlyPopulated);newlyPopulated.store.players=[{_id:'new-player',teamId:'empty'}]
  await assert.rejects(remove(newlyPopulated,old),error=>error.code==='TEAM_NOT_EMPTY');assert.equal(newlyPopulated.writes.length,0)
  const changed=database(),oldVersion=await info(changed);changed.beforeTransaction=data=>{data.teams[0].ownerId='new-owner'}
  await assert.rejects(remove(changed,oldVersion),error=>error.code==='TEAM_CHANGED');assert.equal(changed.writes.length,0)
  const failing=database();failing.failCollection='players'
  await assert.rejects(info(failing),error=>error.code==='TEAM_DELETE_CHECK_FAILED');assert.equal(failing.writes.length,0)
  const absentCollection=database();absentCollection.missingCollection='player_transfers';assert.equal((await info(absentCollection)).canDelete,true)
  const auditFailure=database(),auditState=await info(auditFailure);auditFailure.failAudit=true
  await assert.rejects(remove(auditFailure,auditState),/audit failed/);assert.equal(auditFailure.store.teams.length,1)
  await assert.rejects(remove(database(),state,{confirmName:'另一支球队'}),error=>error.code==='TEAM_DELETE_CONFIRM_REQUIRED')
  await assert.rejects(remove(database(),state,{revision:''}),error=>error.code==='TEAM_CHANGED')
  await assert.rejects(info(database({teams:[]})),error=>error.code==='TEAM_NOT_FOUND')
  const ui=profilePage({teamDeletionInfo:{success:true,isOwner:true,canDelete:true,revision:state.revision},deleteEmptyTeam:data=>{assert.equal(data.revision,state.revision);assert.equal(data.confirmName,team.name);return {success:true}}})
  await ui.page.loadDeletionInfo();await ui.page.deleteEmptyTeam()
  assert.equal(ui.cleared,true);assert.equal(ui.storage.teamInfo,undefined);assert.equal(ui.page.data.deleteBusy,false)
  assert.ok(ui.actions.some(row=>row[0]==='navigate'&&row[1]==='/pages/teams/index'))
  const cancelled=profilePage({teamDeletionInfo:{success:true,isOwner:true,canDelete:true,revision:state.revision}},false)
  await cancelled.page.loadDeletionInfo();await cancelled.page.deleteEmptyTeam();assert.ok(!cancelled.actions.some(row=>row[1]==='deleteEmptyTeam'))
  const nonOwner=profilePage({teamDeletionInfo:{success:true,isOwner:false,canDelete:false,reason:'仅主账号'}})
  await nonOwner.page.loadDeletionInfo();await nonOwner.page.deleteEmptyTeam();assert.ok(!nonOwner.actions.some(row=>row[0]==='modal'))
  console.log('空球队永久删除：本人权属/跨机构、球员和历史阻断、force拒绝、版本/新增球员、审计回滚及手机确认取消通过；仅内存数据')
}
run().catch(error=>{console.error(error);process.exitCode=1})
