import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {createRequire} from 'node:module'
import {createMatchDurationSnapshot,resolveMatchDurationEvidence,resolveMatchDuration,freezePreMatchDuration,calculatePlayingMinutes} from '../cloudfunctions/dataCenter/shared/playing-time.mjs'
import {aggregateStatistics,calculatePlayerCardPoints,createPlayerCardSnapshot} from '../cloudfunctions/dataCenter/shared/statistics.mjs'
const require=createRequire(import.meta.url)
const {createDataService}=require('../cloudfunctions/dataCenter/shared/service.cjs')
const {readPlayerSupportTotals,EMPTY_SUPPORT_VERSION}=require('../cloudfunctions/dataCenter/shared/support.cjs')
const {playerCardSnapshot}=require('../cloudfunctions/dataCenter/shared/player-card-snapshot.cjs')
const {assertMatchRuleSnapshotWrite}=require('../cloudfunctions/dataCenter/shared/write-policy.cjs')
const {applyPlayerCardScores}=require('../cloudfunctions/webLoginApi/fanPlayerCardScores.cjs')

// Synthetic in-memory fixtures only. No real player profile, match or database.
const snapshot=(matchId,minutes=60,minutesBasis='total',periodCount)=>createMatchDurationSnapshot({matchId,minutes,minutesBasis,periodCount,
  source:{kind:'match',id:matchId,version:'fixture-v1'},frozenAt:'2026-09-01T07:59:00Z',kickoffAt:'2026-09-01T08:00:00Z'})
const match=(id='m1',minutes=60)=>({_id:id,tournamentId:'cup',divisionId:'division',homeTeamId:'home',awayTeamId:'away',status:'finished',refereeReviewStatus:'approved',
  refereeClockElapsedSeconds:5400,durationRulesSnapshot:snapshot(id,minutes),eventRecordingStatus:'complete',events:[],
  homeLineup:{starters:[{playerId:'starter'}],substitutes:[{playerId:'bench'}]},awayLineup:{starters:[{playerId:'opponent'}],substitutes:[]},homeScore:0,awayScore:0})
const context={teamsById:{home:{_id:'home'},away:{_id:'away'}},tournamentsById:{cup:{_id:'cup'}},playersById:{starter:{_id:'starter'},bench:{_id:'bench'},opponent:{_id:'opponent'}},requireOriginEvidence:true,requirePlayerOriginEvidence:true}
function mockDb(matches=[match()]) {
  const store={matches:structuredClone(matches),teams:Object.values(context.teamsById),tournaments:Object.values(context.tournamentsById),
    players:[{_id:'starter',teamId:'home'},{_id:'bench',teamId:'home'},{_id:'opponent',teamId:'away'},{_id:'excluded',synthetic:true,teamId:'home'}],
    divisions:[],match_events:[],match_lineup_snapshots:[],player_team_memberships:[],fan_supports:[],fan_points_ledger:[]}
  const command={in:values=>({op:'in',values}),gt:value=>({op:'gt',value}),and:clauses=>({op:'and',clauses})}
  const matchesWhere=(row,where)=>where.op==='and'?where.clauses.every(w=>matchesWhere(row,w)):Object.entries(where).every(([k,v])=>v?.op==='in'?v.values.includes(row[k]):v?.op==='gt'?row[k]>v.value:row[k]===v)
  const db={command,store,fail:'',reads:[],collection(name){let where={},limit=100;const q={where(w){where=w;return q},orderBy(){return q},limit(n){limit=n;return q},async get(){
    db.reads.push(name);if(db.fail===name)throw Error('fixture read failed')
    return {data:(store[name] || []).filter(row=>matchesWhere(row,where)).sort((a,b)=>a._id.localeCompare(b._id)).slice(0,limit)}
  }};return q}}
  return db
}
let checks=0
const check=async(name,run)=>{await run();checks++;console.log('PASS: '+name)}
await check('总时长60、每半场30×2、其他总时长72和旧计时器90分钟',()=>{
  const m=match();assert.equal(resolveMatchDuration(m),60)
  assert.equal(resolveMatchDuration({...m,durationRulesSnapshot:snapshot('m1',30,'period',2)}),60)
  assert.equal(resolveMatchDuration({...m,durationRulesSnapshot:snapshot('m1',72)}),72)
  assert.equal(resolveMatchDuration(m,{division:{matchMinutes:99},tournament:{duration:99}}),60)
  assert.equal(resolveMatchDuration({...m,status:'ongoing',refereeClockElapsedSeconds:1200},{mode:'provisional'}),20)
})
await check('缺失单位、赛后才保存、错场来源和来源冲突均不能核定',()=>{
  const m=match();assert.equal(resolveMatchDuration({...m,durationRulesSnapshot:undefined,totalMinutes:60,matchDuration:60}),null)
  assert.equal(resolveMatchDuration({...m,durationRulesSnapshot:snapshot('other')}),null)
  assert.equal(resolveMatchDuration({...m,durationRulesSnapshot:{...snapshot('m1'),source:{kind:'division',id:'other',version:'v1'}}}),null)
  assert.throws(()=>snapshot('m1',60,''))
  assert.throws(()=>createMatchDurationSnapshot({...snapshot('m1'),frozenAt:'2026-09-01T09:00:00Z'}))
  assert.equal(resolveMatchDurationEvidence({...m,durationRulesSnapshot:undefined},{historicalDurationSnapshots:[snapshot('m1'),snapshot('m1',72)]}).reason,'MATCH_DURATION_EVIDENCE_CONFLICT')
})
await check('仅开赛前保存定版规则；后续组别修改和历史场次不回写',()=>{
  const m={...match(),status:'scheduled',durationRulesSnapshot:undefined,refereeClockElapsedSeconds:0}
  const division={_id:'division',rulesLocked:true,rulesVersion:'v1',rulesSnapshot:{periodMode:'halves',matchMinutes:30}}
  const frozen=freezePreMatchDuration(m,division,{},new Date('2026-09-01T08:00:00Z'))
  assert.equal(frozen.totalMinutes,60)
  const stored={...m,durationRulesSnapshot:frozen,status:'finished'}
  assert.deepEqual(freezePreMatchDuration(stored,{...division,rulesSnapshot:{periodMode:'single',matchMinutes:72,singlePeriodCount:1}}),frozen)
  assert.equal(freezePreMatchDuration({...m,status:'finished'},division),null)
  assert.equal(freezePreMatchDuration({...m,refereeStartedAt:'2026-09-01T08:00:00Z'},division),null)
  assert.equal(freezePreMatchDuration(m,{...division,rulesVersion:''}),null)
  assert.equal(freezePreMatchDuration(m,{...division,rulesSnapshot:{periodMode:'single',matchMinutes:18}}),null)
  assert.equal(freezePreMatchDuration(m,{...division,rulesSnapshot:{matchMinutesBasis:'total',matchMinutes:72}}).totalMinutes,72)
})
await check('首发、换下、换入、再次上场和异常区间',()=>{
  const timeline=[{type:'substitution',out:'starter',id:'bench',minute:20},{type:'substitution',out:'bench',id:'starter',minute:40}]
  const intervals=calculatePlayingMinutes(['starter'],timeline,60)
  assert.equal(intervals.minutes.get('starter'),40);assert.equal(intervals.minutes.get('bench'),20)
  const invalid=calculatePlayingMinutes(['starter'],[{type:'substitution',out:'starter',id:'bench',minute:75}],60)
  assert(invalid.unknown.has('starter'));assert(invalid.unknown.has('bench'))
  assert.equal(calculatePlayingMinutes(['starter'],[],null).available,false)
})
await check('现网points v2、银45金100、应援换算和金卡权限保持一致',()=>{
  const complete=metrics=>({metrics,coverage:Object.fromEntries(['appearances','starts','minutesPlayed','goals'].map(k=>[k,'complete']))})
  const metadata={coverageStatus:'complete',supportDrops:0,supportCoverageStatus:'complete',dataVersion:'facts',supportDataVersion:EMPTY_SUPPORT_VERSION}
  const silver=calculatePlayerCardPoints(complete({appearances:9,starts:9,minutesPlayed:810,goals:0}),metadata)
  assert.equal(silver.points,45);assert.equal(silver.tier,'silver');assert.equal(silver.canReplacePhoto,false)
  const gold=calculatePlayerCardPoints(complete({appearances:20,starts:20,minutesPlayed:1800,goals:0}),metadata)
  assert.equal(gold.scoreVersion,'football-player-card-points/2');assert.equal(gold.points,100);assert.equal(gold.canChangeBackground,true)
  const support=calculatePlayerCardPoints(complete({appearances:0,starts:0,minutesPlayed:0,goals:0}),{...metadata,supportDrops:19})
  assert.equal(support.supportPoints,1);assert.equal(support.points,1)
  assert.equal(calculatePlayerCardPoints(complete({appearances:0,starts:1,minutesPlayed:0,goals:0}),metadata).status,'unverified')
})
await check('来源、采集完整度、复核退回与修订撤销均改变版本',()=>{
  const m=match(), base=aggregateStatistics({matches:[m],...context})
  for(const changed of [{...m,durationRulesSnapshot:undefined},{...m,eventRecordingStatus:'partial',events:undefined},{...m,homeLineup:undefined},{...m,refereeReviewStatus:'returned'},{...m,durationRulesSnapshot:snapshot('m1',72)}]) {
    assert.notEqual(aggregateStatistics({matches:[changed],...context}).dataVersion,base.dataVersion)
  }
  const unknown=aggregateStatistics({matches:[m,{...match('unknown'),tournamentId:'absent'}],...context})
  assert.equal(unknown.coverage.cardScoreScopeComplete,false);assert.notEqual(unknown.dataVersion,base.dataVersion)
  const goal={...m,events:[{eventId:'goal',revision:1,type:'goal',teamId:'home',playerId:'starter',minute:12}]}
  const deleted=aggregateStatistics({matches:[goal],events:[{_id:'tombstone',matchId:'m1',eventId:'goal',revision:2,status:'deleted'}],...context})
  assert.equal(deleted.players.find(p=>p.playerId==='starter').metrics.goals,0)
  assert.notEqual(deleted.dataVersion,aggregateStatistics({matches:[goal],...context}).dataVersion)
})
await check('单人、批量、公开应援摘要采用相同快照及版本',async()=>{
  const db=mockDb(),service=createDataService(db),before=JSON.stringify(db.store)
  const single=await service.playerCardForAuthorizedPlayer('starter')
  const batch=await service.playerCardsForAuthorizedPlayers(['starter','bench','starter','excluded','missing'])
  assert.deepEqual(batch.get('starter'),single)
  assert.equal(single.metricVersion,'football-metrics/6');assert.equal(single.metrics.minutesPlayed,60)
  assert.equal(single.points,4);assert.equal(single.progress.pointsToNext,41)
  assert.equal(batch.get('excluded').status,'test_data_excluded');assert.equal(batch.get('missing').status,'unverified')
  const career=await service.query({platformOwner:true},{mode:'official'}),supports=await readPlayerSupportTotals(db,['starter'])
  const publicPlayers=[{playerId:'starter'}];await applyPlayerCardScores(publicPlayers,career,supports)
  assert.deepEqual(publicPlayers[0].playerCard,single)
  assert.equal(JSON.stringify(db.store),before)
})
await check('已确认0、未采集、时长未知、请求失败和范围受限分开',async()=>{
  const db=mockDb(),service=createDataService(db)
  const zero=await service.playerCardForAuthorizedPlayer('bench')
  assert.equal(zero.status,'ready');assert.equal(zero.points,0);assert.equal(zero.progress.percent,0)
  db.store.matches[0].durationRulesSnapshot=undefined
  const unknown=await service.playerCardForAuthorizedPlayer('starter')
  assert.equal(unknown.status,'unverified');assert.equal(unknown.points,null);assert.equal(unknown.progress,null)
  assert(unknown.reasonCodes.includes('MATCH_DURATION_EVIDENCE_MISSING'))
  assert.notEqual(unknown.snapshotRevision,zero.snapshotRevision)
  const limited=await service.query({platformOwner:false,teamIds:['home'],tournamentIds:[]},{playerId:'starter',teamId:'home'})
  assert.equal(limited.playerCard.status,'scope_limited')
  db.store.matches.push(match('m2',72))
  const oneMatch=await service.query({platformOwner:true},{playerId:'starter',matchId:'m2'})
  assert.equal(oneMatch.summary.matchCount,1);assert.equal(oneMatch.playerTotal.metrics.minutesPlayed,72)
  assert.equal(oneMatch.playerCard.status,'scope_limited')
  db.fail='matches';await assert.rejects(service.playerCardForAuthorizedPlayer('starter'),e=>e.code==='DATA_READ_FAILED')
})
await check('无关比赛可证明未出场时不阻塞等级，名单缺失仍保留未知',async()=>{
  const unrelated={...match('other'),tournamentId:'unknown-cup',homeLineup:{starters:[{playerId:'other-home'}],substitutes:[]},awayLineup:{starters:[{playerId:'other-away'}],substitutes:[]}}
  const db=mockDb([match(),unrelated]),service=createDataService(db)
  const career=await service.query({platformOwner:true},{mode:'official'})
  assert.equal(career.coverage.cardScoreScopeComplete,false)
  assert.equal((await service.playerCardForAuthorizedPlayer('starter')).status,'ready')
  db.store.matches[1].homeLineup=undefined
  const unknown=await service.playerCardForAuthorizedPlayer('starter')
  assert.equal(unknown.status,'unverified');assert(unknown.missing.includes('dataCoverage'))
})
await check('应援账本失败单人／批量一致，失去核验也更新版本',async()=>{
  const db=mockDb(),service=createDataService(db)
  const empty=(await readPlayerSupportTotals(db,['starter'])).get('starter')
  assert.equal(empty.dataVersion,EMPTY_SUPPORT_VERSION)
  db.store.fan_supports.push({_id:'support',supportId:'s1',playerId:'starter',targetType:'player',status:'confirmed',cost:1,serviceAccountOpenId:'fixture-viewer'})
  const partial=(await readPlayerSupportTotals(db,['starter'])).get('starter')
  assert.equal(partial.status,'partial');assert.notEqual(partial.dataVersion,empty.dataVersion)
  db.store.fan_points_ledger.push({_id:'debit',supportId:'s1',playerId:'starter',targetType:'player',delta:-1,reason:'fan-ranking-support',serviceAccountOpenId:'fixture-viewer'})
  const verified=(await readPlayerSupportTotals(db,['starter'])).get('starter')
  assert.equal(verified.status,'complete');assert.equal(verified.drops,1);assert.notEqual(verified.dataVersion,partial.dataVersion)
  db.fail='fan_supports'
  const single=await service.playerCardForAuthorizedPlayer('starter'),batch=(await service.playerCardsForAuthorizedPlayers(['starter'])).get('starter')
  assert.deepEqual(single,batch);assert(single.reasonCodes.includes('SUPPORT_READ_FAILED'));assert.equal(single.progress,null)
})
await check('生成时间不影响快照；完整度和规则版本影响快照',()=>{
  const rows=[], metadata={playerId:'empty',fullCareer:true,identityVerified:true,matchCount:0,coverageStatus:'complete',supportDrops:0,supportCoverageStatus:'complete',supportDataVersion:EMPTY_SUPPORT_VERSION,dataVersion:'facts'}
  const ready=createPlayerCardSnapshot(rows,metadata).card
  assert.equal(ready.points,0)
  const a=playerCardSnapshot({...ready,generatedAt:'one'},{playerId:'empty'}),b=playerCardSnapshot({...ready,generatedAt:'two'},{playerId:'empty'})
  assert.equal(a.snapshotRevision,b.snapshotRevision)
  assert.notEqual(createPlayerCardSnapshot(rows,{...metadata,coverageStatus:'partial'}).card.snapshotRevision,ready.snapshotRevision)
})
await check('客户端不能伪造时长快照；小程序用服务端进度并保留0',()=>{
  assert.throws(()=>assertMatchRuleSnapshotWrite({durationRulesSnapshot:snapshot('m1')}),e=>e.code==='MATCH_RULE_SNAPSHOT_READ_ONLY')
  assert.throws(()=>assertMatchRuleSnapshotWrite({'durationRulesSnapshot.totalMinutes':72}))
  assert.doesNotThrow(()=>assertMatchRuleSnapshotWrite({durationMinutes:72}))
  let page
  vm.runInNewContext(fs.readFileSync(new URL('../miniprogram/pages/team/player-detail/player-detail.js',import.meta.url),'utf8'),{
    require:()=>({}),Page:p=>{page=p},wx:{setNavigationBarTitle(){}},Date,Number,Object,String,Boolean})
  page.data=structuredClone(page.data);page.setData=values=>Object.assign(page.data,values)
  page.hydrate({_id:'fixture',name:'示例'}, {}, {appearances:0,goals:null},false,{coverage:{status:'partial'}},
    {status:'ready',tier:'bronze',points:0,progress:{nextAt:45,pointsToNext:45,percent:0}})
  assert.equal(page.data.stats.appearances,0);assert.equal(page.data.stats.goals,'—');assert.equal(page.data.cardScore.progressWidth,'0%')
  page.hydrate({}, {}, {},false,undefined,{status:'unverified',reasonCodes:['MATCH_DURATION_EVIDENCE_MISSING']})
  assert(page.data.cardScore.progress.includes('时长来源'));assert.equal(page.data.cardScore.hasProgress,false)
  const pc=fs.readFileSync(new URL('../web-admin-vue/src/views/player/PlayerDetail.vue',import.meta.url),'utf8')
  assert(pc.includes("action:'playerDetail'"));assert(pc.includes('playerCard.value.progress?.percent'))
  assert(pc.includes('request_failed'));assert(pc.includes('not_connected'));assert(!pc.includes('score.tier === \'silver\' ? 45'))
})
console.log(`PASS: ${checks} unified player-card regression groups; no production reads/writes`)
