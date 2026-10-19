'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const home = require('../cloudfunctions/getMiniWorkspace/homeEntries.cjs')
const user = { _id:'home-user', phone:'13800000000' }
const teamSpace = id => ({ id:'team:' + id, type:'team', teamId:id, permissions:['team.view','team.manage'] })
const sharedSpace = id => ({ id:'shared:' + id, type:'tournament_shared', tournamentId:id })
const organization = { id:'org:own', type:'organization', orgId:'own', permissions:['event.manage','team.view'] }
const spaces = [teamSpace('owner'), teamSpace('admin'), sharedSpace('shared')]
const catalog = { teams:[{_id:'owner', name:'同名球队', ownerId:user._id}, {_id:'admin', name:'同名球队', ownerId:'another-user'}], teamMemberships:[] }
const shared = [{id:'shared', name:'隔离验证共享赛事', statusText:'进行中'}]

async function catalogIntegration() {
  const reader=require('../cloudfunctions/getMiniWorkspace/data-center/reader.cjs')
  const sharedModule=require('../cloudfunctions/getMiniWorkspace/sharedEvents.cjs')
  const teams=Array.from({length:105},(_,i)=>({_id:'owned-'+String(i).padStart(3,'0'),name:'隔离球队',ownerUserId:user._id,orgId:'other-org'}))
  teams.push({_id:'member-team',name:'管理员球队',ownerId:'other-owner',orgId:'other-org'}, {_id:'unrelated',name:'机构其他球队',ownerId:'other-owner',orgId:'other-org'})
  const tables={teams,tournaments:[],organizations:[{_id:'other-org',ownerId:'other-owner'}],organization_memberships:[],team_memberships:[{_id:'membership',teamId:'member-team',userId:user._id,status:'active',permissions:['team.view']}],team_invitations:[]}
  const command={or:rows=>({$or:rows}),and:rows=>({$and:rows}),in:values=>({$in:values}),gt:value=>({$gt:value})}
  function matches(row,where) { return Object.entries(where || {}).every(([key,value])=>key==='$or'?value.some(part=>matches(row,part)):key==='$and'?value.every(part=>matches(row,part)):value && value.$in?value.$in.includes(row[key]):value && value.$gt!==undefined?row[key]>value.$gt:row[key]===value) }
  const db={command,collection(name){assert.ok(Object.hasOwn(tables,name),'Catalog may read only verified relation summaries: '+name);return {where(where){let size=100,ordered=false;const query={limit(value){size=value;return query},orderBy(){ordered=true;return query},get:async()=>{let rows=tables[name].filter(row=>matches(row,where));if(ordered)rows.sort((a,b)=>a._id.localeCompare(b._id));return {data:rows.slice(0,ordered?Math.min(size,7):size)}}};return query}}}}
  const source=fs.readFileSync(path.resolve(__dirname,'../cloudfunctions/getMiniWorkspace/index.js'),'utf8')
  const scope={db,_:command,readDataRows:reader.readAll,readDataByIds:reader.readByIds,
    unique:rows=>[...new Set(rows.filter(Boolean).map(String))],firstValue:(...values)=>values.find(value=>value!==null&&value!==undefined&&value!=='') || '',
    normalizeCapabilityValues:()=>[],buildEntitlements:()=>({training:{canUse:false}}),safeGet:async(name,where,limit)=>tables[name].filter(row=>matches(row,where)).slice(0,limit || 100),
    sharedEvents:{list:async()=>shared,workspace:sharedModule.workspace}}
  vm.runInNewContext(source.slice(source.indexOf('function normalizePositions('),source.indexOf('// 当前账号同时是目标机构成员时进入机构空间')),scope)
  const catalog={},spaces=await scope.loadWorkspaceCatalog({...user,orgId:'other-org'},'isolated-open-id',catalog)
  assert.equal(catalog.teams.length,106,'Owned and managed teams must be fully paginated')
  assert.equal(spaces.filter(space=>space.type==='team').length,106)
  assert.ok(!spaces.some(space=>space.type==='organization'),'A team relation does not grant access to its organization')
  assert.deepEqual(Array.from(spaces.find(space=>space.teamId==='member-team').permissions),['team.view'])
  const entries=await home.list(user,spaces,catalog,catalog.sharedTournaments,async()=>{throw Error('No organization access')})
  assert.equal(entries.length,107)
  assert.ok(!entries.some(entry=>entry.id==='unrelated'))
}

function page(context) {
  const storage = { userInfo:user }, navigations=[], switches=[], toasts=[]
  let definition, nextContext=context, switchResolve
  let deferSwitch=false
  const workspace = { readContext:()=>context, loadContext:()=>Promise.resolve(nextContext), switchWorkspace:id=>{
    switches.push(id)
    return deferSwitch ? new Promise(resolve=>{switchResolve=resolve}) : Promise.resolve(nextContext)
  } }
  const wx = { getStorageSync:key=>storage[key], setStorageSync:(key,value)=>{storage[key]=value}, showLoading(){}, hideLoading(){},
    navigateTo:args=>{navigations.push(args.url);return Promise.resolve()}, showToast:args=>toasts.push(args.title) }
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../miniprogram/pages/home/home.js'),'utf8'), {
    Page:value=>{definition=value}, wx, require:name=>name.endsWith('/workspace-entry-cards')?require('../miniprogram/utils/workspace-entry-cards'):name.endsWith('/workspace')?workspace:{read:()=>null,resolveAgainstRegistrations:()=>null,toTask:()=>null}
  })
  const instance={...definition,data:structuredClone(definition.data),setData(value){Object.assign(this.data,value)}}
  instance.applyContext(context)
  return { instance, storage, switches, navigations, toasts,
    next:value=>{nextContext=value}, defer:()=>{deferSwitch=true}, resolve:value=>switchResolve(value), workspace }
}

async function run() {
  await catalogIntegration()
  let hostedReads=0
  const entries=await home.list(user,spaces,catalog,shared,async()=>{hostedReads++;throw Error('Shared access must not read another organization')})
  assert.equal(hostedReads,0)
  assert.equal(entries.length,3)
  assert.deepEqual(entries.map(row=>[row.key,row.badgeText]),[['tournament:shared','共享'],['team:owner',''],['team:admin','管理员']])
  assert.equal(entries.filter(row=>row.name==='同名球队').length,2,'Stable IDs retain same-name teams')
  for (const marker of [{synthetic:true},{isTest:true},{syntheticDatasetId:'isolated-fixture'},{syntheticKey:'fixture-team'},{source:'ai_fixture'},{originType:'virtual'},{dataKind:'demo'}]) {
    const hidden=await home.list(user,spaces,{...catalog,teams:catalog.teams.map(row=>({...row,...marker}))},shared,async()=>[])
    assert.deepEqual(hidden.map(row=>row.id),['shared'],'Test origin cannot become a real homepage entry')
    const hiddenEvents=await home.list(user,[organization,sharedSpace('virtual-event')],{teams:[]},[{id:'virtual-event',synthetic:true}],async()=>[{_id:'virtual-event',orgId:'own',...marker}])
    assert.equal(hiddenEvents.length,0)
  }
  const hosted=await home.list(user,[...spaces,organization],catalog,[...shared,{id:'own-event',name:'shared duplicate'}],async space=>{
    assert.equal(space.orgId,'own');return [{_id:'own-event',orgId:'own',name:'本人赛事',status:'ongoing'}, {_id:'foreign',orgId:'foreign',name:'不应显示'}]
  })
  assert.equal(hosted.find(row=>row.id==='own-event').badgeText,'')
  assert.ok(!hosted.some(row=>row.id==='foreign'))
  const revoked=await home.list(user,[spaces[0]],catalog,shared,async()=>[])
  assert.deepEqual(revoked.map(row=>row.id),['owner'])
  const transferred=await home.list(user,[spaces[0]],{teams:[{_id:'owner',ownerId:'new-owner'}],teamMemberships:[{teamId:'owner',userId:user._id,role:'owner',status:'active'}]},[],async()=>[])
  assert.equal(transferred[0].badgeText,'管理员','Authoritative owner wins over stale membership role')
  const ownedByMembership=await home.list(user,[spaces[0]],{teams:[{_id:'owner'}],teamMemberships:[{teamId:'owner',userId:user._id,role:'owner',status:'active'}]},[],async()=>[])
  assert.equal(ownedByMembership[0].badgeText,'')
  const detailed=await home.list(user,spaces,{teams:[{...catalog.teams[0],cityName:'开封市',ageGroup:'老年组',establishedDate:'2018-01-01'}]},[{...shared[0],dateText:'2026-09-26 — 2026-10-11',location:'1号场地'}],async()=>[])
  assert.deepEqual(detailed.find(row=>row.type==='team').metaLines,['开封市','老年组','2018年成立'])
  assert.deepEqual(detailed.find(row=>row.type==='tournament').metaLines,['2026-09-26 — 2026-10-11','1号场地'])
  assert.deepEqual(entries.find(row=>row.id==='owner').metaLines,[],'Missing profile fields add no filler')
  const reads=[],command={in:values=>({$in:values}),gt:value=>({$gt:value}),and:parts=>({$and:parts})}
  const playerRows=[{_id:'p1',teamId:'owner',teamCode:'owner'}, {_id:'p2',teamCode:'old-code'}, {_id:'p3',teamId:'owner',synthetic:true}, {_id:'p4',teamId:'owner',status:'archived'}, {_id:'p5',teamId:'outside',teamCode:'owner'}]
  let failCounts=false
  const match=(row,where)=>Object.entries(where).every(([key,value])=>key==='$and'?value.every(part=>match(row,part)):value.$in?value.$in.includes(row[key]):row[key]>value.$gt)
  const countDb={command,collection(name){assert.equal(name,'players');return {where(where){let size=100;const query={field(fields){assert.ok(!fields.phone && !fields.name);return query},limit(value){size=value;return query},orderBy(){return query},async get(){if(failCounts)throw Error('Unavailable');reads.push(where);return {data:playerRows.filter(row=>match(row,where)).slice(0,Math.min(size,1))}}};return query}}}}
  const counted=await home.withTeamCounts(countDb,entries,{teams:[{...catalog.teams[0],teamCode:'old-code'},catalog.teams[1]]})
  assert.equal(counted.find(row=>row.id==='owner').playerCount,2,'Count unique active real players, including legacy code, without borrowing another team')
  assert.equal(counted.find(row=>row.id==='admin').playerCount,0,'A complete empty roster is actual zero')
  assert.ok(reads.length>4,'Short SDK pages cannot silently truncate counts')
  const ambiguous=await home.withTeamCounts(countDb,entries,{teams:catalog.teams.map(row=>({...row,teamCode:'duplicate-code'}))})
  assert.ok(ambiguous.filter(row=>row.type==='team').every(row=>row.playerCount===null && row.playerCountState==='failed'))
  failCounts=true
  assert.ok((await home.withTeamCounts(countDb,entries,catalog)).filter(row=>row.type==='team').every(row=>row.playerCount===null && row.playerCountState==='failed'))
  const sharedOnly=entries.filter(row=>row.type==='tournament')
  assert.deepEqual(await home.withTeamCounts({collection(){throw Error('Event-only grant must not read players')}},sharedOnly,catalog),sharedOnly)
  const images = [{key:'a',logo:'cloud://same',coverUrl:'https://example.test/background.jpg'}, {key:'b',logo:'cloud://same',coverUrl:'cloud://cover'}]
  let mediaCalls=0
  const resolved=await home.resolveMedia(images,{getTempFileURL:async ({fileList})=>{mediaCalls++;assert.deepEqual(fileList,['cloud://same','cloud://cover']);return {fileList:[{fileID:'cloud://same',tempFileURL:'https://example.test/logo.png'}]}}})
  assert.equal(mediaCalls,1)
  assert.equal(resolved[0].logo,'https://example.test/logo.png')
  assert.equal(resolved[0].coverUrl,'https://example.test/background.jpg')
  assert.equal(resolved[1].coverUrl,'')
  assert.equal((await home.resolveMedia(images,{getTempFileURL:async()=>{throw Error('Media temporarily unavailable')}}))[0].logo,'')
  await assert.rejects(home.list(user,[organization],{teams:[]},[],async()=>{throw Error('读取失败')}),/读取失败/)
  const context={user, currentWorkspace:spaces[2], currentIdentity:{id:'event_staff'}, homeEntries:entries,homeEntriesVersion:'home-entries/2',teams:[],tournaments:shared}
  const ui=page(context), tap=key=>({currentTarget:{dataset:{key}}})
  assert.equal(ui.instance.data.homeEntries.length,3)
  assert.equal(ui.instance.data.roleTitle,'首页')
  assert.equal(ui.instance.data.homeEntries[0].hasBadge,true)
  assert.equal(ui.instance.data.homeEntries[1].hasBadge,false)
  ui.instance.applyContext({...context,homeEntries:counted})
  assert.equal(ui.instance.data.homeEntries.find(row=>row.id==='admin').playerCountText,'0')
  ui.instance.applyContext({...context,homeEntries:counted.map(row=>({...row,playerCount:null,playerCountState:'failed'}))})
  assert.equal(ui.instance.data.homeEntries[1].playerCountText,'—')
  ui.instance.applyContext(context)
  ui.instance.applyContext({...context,homeEntriesVersion:''})
  assert.equal(ui.instance.data.homeEntries.length,0,'Old unfiltered cache must not render')
  assert.equal(ui.instance.data.showHomeEntryEmpty,false,'Old cache does not prove an empty account')
  ui.instance.applyContext(context)
  ui.instance.onEntryLogoError(tap('team:owner'))
  assert.equal(ui.instance.data.homeEntries[1].logo,'/images/runtime/icons/brand-v1-tab-team.png')
  ui.next({...context,currentWorkspace:spaces[0],teams:[{id:'owner',name:'同名球队'}]})
  await ui.instance.onHomeEntryTap(tap('team:owner'))
  assert.deepEqual(ui.switches,['team:owner'])
  assert.equal(ui.storage.teamInfo.teamId,'owner')
  assert.deepEqual(ui.navigations,['/pages/team/team'])
  ui.next(context)
  await ui.instance.onHomeEntryTap(tap('tournament:shared'))
  assert.equal(ui.navigations[1],'/pages/tournament/shared/shared?id=shared')
  ui.next({...context,currentWorkspace:spaces[0],homeEntries:revoked})
  await ui.instance.onHomeEntryTap(tap('team:admin'))
  assert.equal(ui.navigations.length,2)
  assert.equal(ui.toasts.at(-1),'权限已变更，请刷新列表')
  assert.equal(ui.instance.data.homeEntries.length,1)
  ui.instance.applyContext(context); ui.defer()
  const pending=ui.instance.onHomeEntryTap(tap('team:owner'))
  const switchCount=ui.switches.length
  ui.instance.onHomeEntryTap(tap('team:admin'))
  assert.equal(ui.switches.length,switchCount,'Double tap cannot race workspace switches')
  ui.storage.userInfo={_id:'other-user'}
  ui.resolve({...context,currentWorkspace:spaces[0],teams:[{id:'owner'}]})
  await pending
  assert.equal(ui.navigations.length,2,'Late entry response cannot navigate a different account')
  ui.workspace.readContext=()=>null
  ui.workspace.loadContext=()=>Promise.reject(Error('网络暂不可用'))
  await ui.instance.loadData()
  assert.equal(ui.instance.data.homeEntries.length,0,'A failed new-account load cannot keep previous private cards')
  ui.storage.userInfo=null
  await ui.instance.loadData()
  assert.equal(ui.instance.data.homeEntries.length,0)
  const wxml=fs.readFileSync(path.resolve(__dirname,'../miniprogram/pages/home/home.wxml'),'utf8')
  for (const interpolation of wxml.matchAll(/\{\{([\s\S]*?)\}\}/g)) assert.doesNotMatch(interpolation[1],/===|!==|\?|\[|\(|&&/)
  console.log('首页混合卡片：主账号/管理员/共享、稳定ID、权限撤销、切空间及迟到响应通过')
}
run().catch(error=>{console.error(error);process.exitCode=1})
