'use strict'
const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
const path=require('node:path')
const projection=require('../cloudfunctions/getMiniWorkspace/sharedMatchView.cjs')
const ui=require('../miniprogram/utils/sharedMatchUi.js')
const operations=require('../cloudfunctions/getMiniWorkspace/sharedOperations.cjs')
const root=path.resolve(__dirname,'..')
const base={tournamentId:'event',divisionId:'adult',homeTeamId:'home',awayTeamId:'away',matchDate:'2026-10-15',matchTime:'09:00',venue:'1号场地'}
const fixture=(id,status,extra={})=>({...base,_id:id,status,...extra})
const submitted={homeScore:2,awayScore:1,refereeRecordLocked:true,refereeRecord:{reportText:'原始报告',events:[]},refereeReviewStatus:'under_review'}

function database(matches,permissions=['event.matches','event.results'],cap=100){
  const tables={matches,divisions:[{_id:'adult',tournamentId:'event',name:'成人组'}],teams:[{_id:'home',name:'主队'},{_id:'away',name:'客队'}],tournaments:[{_id:'event',orgId:'org',name:'隔离验证赛事'}],tournament_staff_grants:[{_id:'grant',userId:'user',tournamentId:'event',orgId:'org',status:'active',permissions}],tournament_teams:[],match_lineup_snapshots:[]}
  let reads=0,writes=0
  const command={gt:value=>({$gt:value}),in:value=>({$in:value}),and:value=>({$and:value})}
  function matchesWhere(row,condition){return Object.entries(condition).every(([key,value])=>key==='$and'?value.every(part=>matchesWhere(row,part)):value && value.$gt!==undefined?row[key]>value.$gt:value && value.$in?value.$in.includes(row[key]):row[key]===value)}
  const db={command,tables,get writes(){return writes},get reads(){return reads},serverDate:()=>new Date('2026-10-15T10:00:00Z'),runTransaction:callback=>callback(db),collection(name){
    return {where(condition){let offset=0,count=100,sort=false;const query={skip(value){offset=value;return query},limit(value){count=value;return query},field(){return query},orderBy(){sort=true;return query},async get(){reads++;let rows=(tables[name] || []).filter(row=>matchesWhere(row,condition));if(sort)rows.sort((a,b)=>a._id.localeCompare(b._id));return {data:rows.slice(offset,offset+Math.min(count,cap))}}};return query},doc(id){return {async get(){reads++;return {data:(tables[name] || []).find(row=>row._id===id) || null}},async update({data}){writes++;Object.assign(tables[name].find(row=>row._id===id),data)}}}}
  }}
  return db
}
const cloud={async getTempFileURL(){throw new Error('No media lookup expected in fixture')},async callFunction(){throw new Error('No cloud writes expected')}}
const identity={user:{_id:'user'}}
const call=(db,mode,operation='list',extra={})=>operations.run(db,cloud,identity,{tournamentId:'event',mode,operation,...extra})

function page(file,wx){
  let definition
  const context={require:name=>require(path.resolve(path.dirname(file),name)),Page:value=>{definition=value},wx,console}
  vm.runInNewContext(fs.readFileSync(file,'utf8'),context,{filename:file})
  const instance={...definition,data:JSON.parse(JSON.stringify(definition.data)),setData(update){for(const [key,value] of Object.entries(update)){const parts=key.split('.');let item=this.data;for(const part of parts.slice(0,-1))item=item[part];item[parts[parts.length-1]]=value}}}
  return instance
}
async function run(){
  for(const status of ['cancelled','canceled','removed','deleted','replaced','superseded','void']){
    const row=fixture(status,status,{homeScore:0,awayScore:0,...submitted})
    assert.equal(projection.currentMatch(row),false)
    assert.equal(projection.resultState(row),'')
    assert.equal(projection.view(row).score,'— : —')
  }
  assert.equal(projection.currentMatch(fixture('obsolete-schedule','finished',{scheduleStatus:'cancelled'})),false)
  for(const value of [null,undefined,'',' ',false,-1,1.5,Infinity,'abc'])assert.equal(projection.scoreReady({homeScore:value,awayScore:0}),false)
  assert.equal(projection.view(fixture('zero','finished',{homeScore:0,awayScore:0})).score,'0 : 0')
  assert.equal(projection.view(fixture('unknown','finished',{homeScore:null,awayScore:0})).score,'— : —')
  assert.equal(projection.view(fixture('future','scheduled',{homeScore:0,awayScore:0})).score,'— : —')
  assert.equal(projection.resultState(fixture('not-submitted','scheduled',{homeScore:0,awayScore:0,refereeReviewStatus:'under_review'})),'')
  assert.equal(projection.view(fixture('inconsistent','finished',{homeScore:2,awayScore:1,refereeReviewStatus:'under_review'})).canReview,false)
  assert.equal(projection.view(fixture('locked','finished',submitted)).canSupplement,false)
  assert.equal(projection.view(fixture('manual','finished',{homeScore:2,awayScore:1})).canSupplement,true)

  const matches=[fixture('scheduled','scheduled',{homeScore:0,awayScore:0}),fixture('live','ongoing',{homeScore:1,awayScore:0}),fixture('manual','finished',{homeScore:0,awayScore:0}),fixture('pending','finished',submitted),fixture('returned','finished',{...submitted,refereeReviewStatus:'returned'}),fixture('archived','finished',{...submitted,refereeReviewStatus:'archived'}),fixture('no-score','finished'),fixture('cancelled','cancelled',{homeScore:0,awayScore:0}),fixture('placeholder','cancelled',{homeTeamId:'',awayTeamId:'',homeTeamName:'场序19负者',awayTeamName:'场序20负者'}),fixture('future-placeholder','scheduled',{homeTeamId:'',awayTeamId:'',homeTeamName:'场序21胜者',awayTeamName:'场序22胜者'})]
  const db=database(matches)
  const matchList=await call(db,'matches'),results=await call(db,'results')
  assert.equal(matchList.items.length,8)
  assert.deepEqual(results.items.map(row=>row.id).sort(),['archived','manual','pending','returned'])
  assert.equal(results.items.find(row=>row.id==='pending').canReview,true)
  assert.equal(results.items.find(row=>row.id==='manual').reviewStatus,'已录入')
  assert.equal(matchList.items.find(row=>row.id==='future-placeholder').score,'— : —')
  assert.equal(matchList.divisions[1].name,'成人组')
  assert.equal(db.writes,0)
  // Exercise the overview adapter with only a match grant, so no standings or writes run.
  const overview=require('../cloudfunctions/getMiniWorkspace/sharedOverview.cjs')
  const overviewDb=database(matches,['event.matches'])
  const schedule=await overview.overview(overviewDb,cloud,identity,{tournamentId:'event',divisionId:'adult'})
  assert.equal(schedule.schedule.length,8)
  assert.equal(schedule.summary.completed,5)
  assert.equal(schedule.schedule.find(row=>row.id==='no-score').score,'— : —')
  assert.equal(schedule.schedule.find(row=>row.id==='manual').score,'0 : 0')
  assert.equal(schedule.schedule.find(row=>row.id==='pending').actionText,'查看记录')
  assert.equal(schedule.schedule.find(row=>row.id==='scheduled').mode,'matches')
  assert.ok(schedule.schedule.every(row=>'phase' in row),'赛程投影携带阶段字段')
  assert.equal(overviewDb.writes,0)
  const standingsView=database(matches,['event.matches','event.results'])
  const full=await overview.overview(standingsView,cloud,identity,{tournamentId:'event',divisionId:''})
  assert.equal(full.standingsError,'','数据中心查询在夹具上可用')
  assert.ok(Array.isArray(full.scorers),'响应包含射手榜')
  assert.ok(Array.isArray(full.discipline.players) && Array.isArray(full.discipline.teams),'响应包含红黄牌榜')
  assert.ok(full.standings.length===0 || full.standings.every(group=>group.divisionId && 'groupName' in group),'积分榜分组携带组别字段')
  assert.equal(standingsView.writes,0)
  await assert.rejects(call(db,'results','detail',{id:'scheduled'}),/尚无可查看的赛果/)
  await assert.rejects(call(db,'matches','detail',{id:'cancelled'}),/已取消/)
  await assert.rejects(call(database(matches,['event.teams']),'results'),/未授权/)
  const revoked=database(matches);revoked.tables.tournament_staff_grants[0].status='disabled'
  await assert.rejects(call(revoked,'matches'),/未授权/)
  await assert.rejects(call(db,'matches','detail',{id:'foreign'}),/不属于当前赛事/)
  const big=database(Array.from({length:207},(_,i)=>fixture('match-'+String(i).padStart(3,'0'),'finished',{homeScore:0,awayScore:0})),undefined,20)
  assert.equal((await call(big,'results')).items.length,207)
  assert.ok(big.reads>10)

  const pendingDetail=await call(db,'results','detail',{id:'pending'})
  const before=structuredClone(matches.find(row=>row._id==='pending'))
  await assert.rejects(call(db,'results','review',{id:'pending',decision:'archive',reviewRevision:'stale'}),/已更新/)
  assert.equal(db.writes,0)
  await assert.rejects(call(db,'results','review',{id:'pending',decision:'return',reason:'',reviewRevision:pendingDetail.item.reviewRevision}),/退回原因/)
  await call(db,'results','review',{id:'pending',decision:'return',reason:'请核对球员',reviewRevision:pendingDetail.item.reviewRevision})
  assert.equal(matches.find(row=>row._id==='pending').refereeReviewStatus,'returned')
  for(const key of ['homeScore','awayScore','status','homeTeamId','awayTeamId'])assert.deepEqual(matches.find(row=>row._id==='pending')[key],before[key])
  assert.deepEqual(matches.find(row=>row._id==='pending').refereeRecord.events,before.refereeRecord.events)

  const navigation=[],calls=[]
  const wx={setNavigationBarTitle(){},navigateTo:options=>navigation.push(options.url),cloud:{callFunction:async options=>{calls.push(options.data);return {result:options.data.operation==='detail'?{success:true,item:pendingDetail.item}:matchList}}},showToast(){},showModal(){},stopPullDownRefresh(){},showNavigationBarLoading(){},hideNavigationBarLoading(){}}
  const manage=page(path.join(root,'miniprogram/pages/tournament/shared/manage.js'),wx)
  manage.onLoad({id:'event',mode:'matches'});await new Promise(setImmediate)
  assert.equal(manage.data.items.length,2,'默认只看未踢的比赛')
  assert.equal(manage.data.matchScopeName,'未踢的比赛')
  assert.equal(manage.data.divisionName,'全部组别')
  assert.equal(JSON.stringify(manage.data.statusTabs.map(row=>row.count)),'[8,2,1,5]')
  manage.onStatus({currentTarget:{dataset:{id:'all'}}})
  assert.equal(manage.data.items.length,8)
  manage.onStatus({currentTarget:{dataset:{id:'finished'}}})
  assert.equal(manage.data.items.length,5)
  manage.onSearch({detail:{value:'manual'}})
  assert.equal(manage.data.items.length,0)
  manage.onSearch({detail:{value:'主队'}})
  assert.ok(manage.data.items.length>0)
  await manage.loadDetail('pending')
  assert.equal(manage.data.canRecord,false)
  assert.equal(manage.data.canStart,false)
  manage.onLoad({id:'event',mode:'matches',matchId:'pending'});await new Promise(setImmediate)
  assert.equal(calls[calls.length-1].id,'pending')
  assert.equal(manage.data.isDetail,true)
  wx.cloud.callFunction=async()=>({result:results})
  const review=page(path.join(root,'miniprogram/pages/tournament/shared/manage.js'),wx)
  review.onLoad({id:'event',mode:'results'});await new Promise(setImmediate)
  assert.equal(review.data.items.length,1)
  assert.equal(review.data.items[0].id,'pending')
  review.onStatus({currentTarget:{dataset:{id:'recorded'}}})
  assert.equal(review.data.items[0].id,'manual')

  const groups=ui.days([projection.view(fixture('one','finished',{homeScore:2,awayScore:1})),projection.view(fixture('two','scheduled')),projection.view(fixture('next','scheduled',{matchDate:'2026-10-16'})),projection.view(fixture('void','cancelled'))])
  assert.equal(groups.length,2);assert.equal(groups[0].count,2);assert.equal(groups[1].hasMultiple,false)
  assert.equal(ui.present({statusText:'已结束',score:'2 : 1'}).score,'2 : 1')
  const detail=page(path.join(root,'miniprogram/pages/tournament/shared/shared.js'),wx)
  detail.tournamentId='event';detail.data.days=groups
  detail.onDayChange({currentTarget:{dataset:{index:0}},detail:{current:1}})
  assert.equal(detail.data.days[0].position,2)
  assert.equal(detail.data.days[1].position,1)
  assert.equal(ui.days(groups.flatMap(row=>row.matches),detail.data.days)[0].current,1)
  detail.onModule({currentTarget:{dataset:{id:'matches'}}})
  assert.match(navigation[navigation.length-1],/mode=matches/)
  detail.onMatch({currentTarget:{dataset:{id:'two',mode:'matches',open:true}}})
  assert.match(navigation[navigation.length-1],/matchId=two/)

  // 赛事详情页：一次全量加载；榜单区（积分榜/射手榜 × 组别 × 小组/淘汰赛）纯客户端切换不请求网络
  const hubPayload={success:true,tournament:{name:' Hub',permissions:['event.matches','event.results']},divisions:[{id:'adult',name:'成人组'},{id:'junior',name:'乙组'}],schedule:[Object.assign(projection.view(fixture('one','scheduled')),{divisionId:'adult',phase:'group'}),Object.assign(projection.view(fixture('ko','finished',{homeScore:2,awayScore:1})),{divisionId:'junior',phase:'knockout',matchNumber:'5',round:'决赛',homeLogo:'https://img.test/a.png',awayLogo:'https://img.test/b.png'}),Object.assign(projection.view(fixture('ko2','scheduled')),{divisionId:'junior',phase:'knockout',matchNumber:'4',round:'半决赛',homeLogo:'https://img.test/c.png'}),Object.assign(projection.view(fixture('ko4','scheduled')),{divisionId:'junior',phase:'knockout',matchNumber:'6',round:'半决赛',homeLogo:'https://img.test/d.png'}),Object.assign(projection.view(fixture('ko3','scheduled')),{divisionId:'junior',phase:'placement',matchNumber:'3',round:'5-8名交叉排位赛'})],standings:[{id:'adult:A组',divisionId:'adult',divisionName:'成人组',groupName:'A组',name:'成人组 · A组',teams:[{id:'home',name:'主队',rank:1,played:1,points:3}]},{id:'junior:B组',divisionId:'junior',divisionName:'乙组',groupName:'B组',name:'乙组 · B组',teams:[{id:'away',name:'客队',rank:1,played:2,points:4}]}],standingsAllowed:true,standingsError:'',scorers:[{playerId:'p1',name:'张三',teamId:'home',teamName:'主队',divisionId:'adult',goals:3},{playerId:'p2',name:'李四',teamId:'away',teamName:'客队',divisionId:'junior',goals:2},...Array.from({length:10},(_,i)=>({playerId:'p'+(i+5),name:'球员'+(i+5),teamId:'home',teamName:'主队',divisionId:'adult',goals:1}))],discipline:{players:[{playerId:'p3',name:'王五',teamId:'away',teamName:'客队',divisionId:'junior',yellowCards:0,redCards:1},{playerId:'p4',name:'赵六',teamId:'home',teamName:'主队',divisionId:'adult',yellowCards:2,redCards:0}],teams:[{teamId:'away',name:'客队',yellowCards:0,redCards:1},{teamId:'home',name:'主队',yellowCards:2,redCards:0}]},summary:{matchCount:5,completed:1,remaining:4}}
  let hubFails=false;let hubCalls=0
  wx.cloud.callFunction=async options=>{hubCalls++;if(hubFails)throw new Error('网络超时，请重试');return {result:hubPayload}}
  const hub=page(path.join(root,'miniprogram/pages/tournament/shared/shared.js'),wx)
  hub.tournamentId='event'
  await hub.loadSharedEvent()
  assert.equal(hub.data.loading,false,'首次加载完成后不处于 loading')
  assert.equal(hub.data.matchCount,5,'汇总为整个赛事')
  assert.equal(hub.data.days.length,1)
  assert.equal(hub.data.rankDivisions.map(row=>row.id).join(','),'adult,junior','榜单组别来自有数据的组别')
  assert.equal(hub.data.rankModeTabs.length,3,'榜单首层为积分榜/射手榜/红黄牌榜')
  assert.equal(hub.data.rankModeTabs[2].name,'红黄牌榜')
  assert.equal(hub.data.rankModeTabs[0].itemClass,'active','默认积分榜')
  assert.equal(hub.data.standingsRows.length,1)
  assert.equal(hub.data.standingsRows[0].name,'主队')
  assert.equal(hub.data.hasGroupTabs,false,'单组无淘汰赛时隐藏小组标签')
  const callsAfterLoad=hubCalls
  hub.onRankDivision({currentTarget:{dataset:{id:'junior'}}})
  assert.equal(hubCalls,callsAfterLoad,'切组别不再请求网络')
  assert.equal(hub.data.standingsRows[0].name,'客队')
  assert.equal(hub.data.hasGroupTabs,true,'乙组出现淘汰赛标签')
  assert.equal(hub.data.rankGroups[1].name,'淘汰赛')
  hub.onRankGroup({currentTarget:{dataset:{id:'__knockout__'}}})
  assert.equal(hub.data.showKnockoutList,true)
  assert.equal(hub.data.showBracketTabs,true,'1-4名与5-8名并存时显示子标签')
  assert.equal(hub.data.bracketTabs.map(row=>row.name).join(','),'1-4名,5-8名')
  assert.equal(hub.data.bracketNodes[0].isRound,true)
  assert.equal(hub.data.bracketNodes[0].name,'决赛','主线默认1-4名且决赛在顶')
  assert.match(hub.data.bracketNodes[0].rows[0].home,/主队/)
  assert.equal(hub.data.bracketNodes[0].rows[0].homeLogo,'https://img.test/a.png','对阵卡携带主队徽标')
  assert.equal(hub.data.bracketNodes[0].rows[0].awayLogo,'https://img.test/b.png','对阵卡携带客队徽标')
  assert.equal(hub.data.bracketNodes[1].isRound,false,'决赛与半决赛之间画连接线')
  assert.equal(hub.data.bracketNodes[1].merge,true,'1→2 汇聚线')
  assert.equal(hub.data.bracketNodes[2].name,'半决赛')
  hub.onBracketTab({currentTarget:{dataset:{id:'place'}}})
  assert.equal(hub.data.bracketNodes.length,1,'排位组单层无连线')
  assert.equal(hub.data.bracketNodes[0].name,'5-8名交叉排位赛','placement 归入5-8名标签')
  hub.onBracketTab({currentTarget:{dataset:{id:'main'}}})
  assert.equal(hub.data.bracketNodes[0].name,'决赛','可切回1-4名主线')
  hub.onRankMode({currentTarget:{dataset:{id:'scorers'}}})
  assert.equal(hub.data.rankModeScorers,true)
  assert.equal(hub.data.rankDivisions[0].id,'','射手榜首层为总榜')
  assert.equal(hub.data.rankDivisions[0].name,'总榜')
  assert.equal(hub.data.scorerRows.length,10,'总榜默认只显示前10名')
  assert.equal(hub.data.scorerRows[0].name,'张三')
  assert.equal(hub.data.scorerRows[0].goals,3)
  assert.equal(hub.data.showScorersMore,true)
  assert.equal(hub.data.scorersMoreText,'查看全部 12 名射手')
  hub.onRankMore()
  assert.equal(hub.data.rankSheet,true,'查看全部打开滚动弹层')
  assert.equal(hub.data.rankSheetTitle,'射手榜 · 总榜')
  assert.equal(hub.data.sheetShowScorers,true)
  assert.equal(hub.data.sheetRows.length,12,'弹层内为完整榜单')
  assert.equal(hub.data.scorerRows.length,10,'弹层不影响页面截断')
  hub.onRankSheetClose()
  assert.equal(hub.data.rankSheet,false)
  assert.equal(hub.data.sheetRows.length,0,'关闭后清空弹层行')
  hub.onRankDivision({currentTarget:{dataset:{id:'junior'}}})
  assert.equal(hub.data.scorerRows.length,1,'组别榜按组过滤')
  assert.equal(hub.data.scorerRows[0].name,'李四')
  hub.onRankMore()
  assert.equal(hub.data.rankSheetTitle,'射手榜 · 乙组','组别弹层标题带组别名')
  assert.equal(hub.data.sheetRows.length,1)
  hub.onRankSheetClose()
  hub.onRankDivision({currentTarget:{dataset:{id:''}}})
  assert.equal(hub.data.scorerRows.length,10,'组别可切回总榜')
  assert.equal(hub.data.rankDivisions[0].itemClass,'active','总榜高亮')
  hub.onRankMode({currentTarget:{dataset:{id:'discipline'}}})
  assert.equal(hub.data.rankModeDiscipline,true)
  assert.equal(hub.data.rankDivisions.map(row=>row.id).join(','),'player,team','红黄牌首层为球员/球队')
  assert.equal(hub.data.showDisciplinePlayers,true)
  assert.equal(hub.data.disciplinePlayerRows[0].name,'王五','红牌多者在前')
  assert.equal(hub.data.disciplinePlayerRows[0].redCards,1)
  assert.equal(hub.data.disciplinePlayerRows[1].name,'赵六')
  assert.equal(hub.data.disciplinePlayerRows[1].yellowCards,2)
  hub.onRankDivision({currentTarget:{dataset:{id:'team'}}})
  assert.equal(hub.data.showDisciplineTeams,true)
  assert.equal(hub.data.disciplinePlayerRows.length,0)
  assert.equal(hub.data.disciplineTeamRows[0].name,'客队','球队红黄牌按红牌排序')
  hub.onRankMode({currentTarget:{dataset:{id:'standings'}}})
  assert.equal(hub.data.rankDivisions[0].id,'adult')
  assert.equal(hub.data.rankDivisions[0].name,'成人组')
  assert.equal(hub.data.standingsRows[0].name,'主队')
  hubFails=true
  await hub.loadSharedEvent()
  assert.equal(hub.data.days.length,1,'刷新失败保留已渲染内容')
  assert.equal(hub.data.standingsRows[0].name,'主队')

  // days 被异常写成对象后（setData 路径写入损坏指纹），重新加载必须自愈
  hubFails=false
  hub.data.days={0:{current:0,position:1}};hub.data.hasMatches=true
  await hub.loadSharedEvent()
  assert.ok(Array.isArray(hub.data.days),'days 必须自愈为数组')
  assert.equal(hub.data.days.length,1)
  assert.equal(hub.data.hasMatches,true)
  hub.onDayChange({currentTarget:{dataset:{index:0}},detail:{current:0}})
  assert.ok(Array.isArray(hub.data.days),'滑动后 days 仍为数组')

  let firstResolve,secondResolve
  wx.cloud.callFunction=()=>new Promise(resolve=>{if(!firstResolve)firstResolve=resolve;else secondResolve=resolve})
  const concurrent=page(path.join(root,'miniprogram/pages/tournament/shared/manage.js'),wx)
  concurrent.mode='matches';concurrent.tournamentId='event';concurrent.data.isMatchModule=true;concurrent.selectedStatus='all'
  const first=concurrent.loadList(),second=concurrent.loadDetail('pending')
  secondResolve({result:{success:true,item:pendingDetail.item}});await second
  firstResolve({result:matchList});await first
  assert.equal(concurrent.data.isDetail,true)
  assert.equal(concurrent.data.item.id,'pending')
  wx.cloud.callFunction=async()=>{throw new Error('网络超时，请重试')}
  await concurrent.loadDetail('pending');assert.match(concurrent.data.errorText,/超时/)
  wx.cloud.callFunction=async()=>({result:{success:true,item:pendingDetail.item}})
  await concurrent.onRetry();assert.equal(concurrent.data.isDetail,true)

  for(const filename of ['shared.wxml','manage.wxml']){
    const markup=fs.readFileSync(path.join(root,'miniprogram/pages/tournament/shared',filename),'utf8')
    for(const expression of markup.matchAll(/\{\{([\s\S]*?)\}\}/g))assert.doesNotMatch(expression[1],/===|!==|==|!=|\?|\[|\]|\(|\)|&&|[<>]/,'WXML: '+expression[1])
  }
  console.log('PASS: 取消/替换过滤、真实零值/缺失比分、赛果来源、全部状态与组别、207场短页完整读取、授权/撤权/跨赛事、复核版本与原记录保留、直达比赛、筛选/重试/并发保护、按日期单场滑动、WXML限制')
}
run().catch(error=>{console.error(error);process.exitCode=1})
