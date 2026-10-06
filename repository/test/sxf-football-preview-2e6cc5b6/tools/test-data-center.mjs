import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { aggregateStatistics, effectiveEvents, sumPlayerRows, calculatePlayerCardPoints } from '../cloudfunctions/dataCenter/shared/statistics.mjs'
const require = createRequire(import.meta.url)
const { readAll, readByIds } = require('../cloudfunctions/dataCenter/shared/reader.cjs')
const { createDataService, validateScope } = require('../cloudfunctions/dataCenter/shared/service.cjs')
const { readPlayerSupportTotals } = require('../cloudfunctions/dataCenter/shared/support.cjs')
const { requestTransfer, acceptTransfer } = require('../cloudfunctions/dataCenter/transfers.cjs')
const { authenticate } = require('../cloudfunctions/dataCenter/identity.cjs')
const publicDataCenter = require('../cloudfunctions/webLoginApi/publicDataCenter.cjs')

function mockDatabase(initial, cap = 100) {
  let store = structuredClone(initial)
  const command = { in:values => ({ operator:'in', values }), gt:value => ({ operator:'gt', value }), and:clauses => ({ operator:'and', clauses }), or:clauses => ({ operator:'or', clauses }) }
  function matches(row,where) {
    if (where.operator === 'and') return where.clauses.every(clause => matches(row,clause))
    if (where.operator === 'or') return where.clauses.some(clause => matches(row,clause))
    return Object.entries(where).every(([key,value]) => value?.operator === 'in' ? value.values.includes(row[key]) : value?.operator === 'gt' ? row[key] > value.value : row[key] === value)
  }
  const db = { command, data:() => store, fail:'', createCollection:async name => { if (store[name]) throw new Error('already exists'); store[name] = [] }, collection(name) {
    let where = {}, limit = cap
    const query = { where(value) { where = value; return query }, orderBy() { return query }, limit(value) { limit = Math.min(value,cap); return query }, async get() { if (db.fail === name) throw new Error('database unavailable'); return { data:(store[name] || []).filter(row => matches(row,where)).sort((a,b) => a._id < b._id ? -1 : 1).slice(0,limit) } }, doc(documentId) {
      return { async get() { const row = (store[name] || []).find(row => row._id === documentId); if (!row) throw new Error('document not exist'); return { data:structuredClone(row) } }, async set({data}) { store[name] ||= []; const index = store[name].findIndex(row => row._id === documentId); const row = { ...structuredClone(data), _id:documentId }; if (index < 0) store[name].push(row); else store[name][index] = row }, async update({data}) { const row = (store[name] || []).find(row => row._id === documentId); if (!row) throw new Error('document not exist'); Object.assign(row,structuredClone(data)) } }
    } }
    return query
  }, async runTransaction(action) { const snapshot = structuredClone(store); try { return await action(db) } catch (error) { store = snapshot; throw error } } }
  return db
}

const makeMatch = (id,team,tournament,goals = 0) => ({
  _id:id, tournamentId:tournament, divisionId:'u12', homeTeamId:team, awayTeamId:'opponent', status:'completed', homeScore:goals, awayScore:0,
  matchDate:'2026-09-01', refereeMatchPhase:'finished', refereeClockElapsedSeconds:3600,
  homeLineup:{ starters:[{ playerId:'p1',name:'小明' }],substitutes:[{ playerId:'bench',name:'替补' }] }, awayLineup:{ starters:[] },
  events:Array.from({length:goals},(_,index) => ({ eventId:`${id}-g${index}`,type:'goal',playerId:'p1',teamId:team,minute:10 + index }))
})
const before = makeMatch('m1','A','t1',5), after = makeMatch('m2','B','t2',3)
const life = aggregateStatistics({ matches:[before,after,before],scope:{playerId:'p1'} })
assert.equal(sumPlayerRows(life.players).metrics.goals,8)
assert.equal(sumPlayerRows(life.players).metrics.starts,2)
const complete = metrics => ({ metrics, coverage:Object.fromEntries(['appearances','starts','minutesPlayed','goals'].map(field => [field,'complete'])) })
const score = (total, metadata = {}) => calculatePlayerCardPoints(total,{ supportDrops:0, supportCoverageStatus:'complete', supportDataVersion:'empty', ...metadata })
assert.equal(score(complete({ appearances:9,starts:9,minutesPlayed:810,goals:0 })).points,45)
assert.equal(score(complete({ appearances:20,starts:20,minutesPlayed:1800,goals:0 })).tier,'gold')
assert.equal(score(complete({ appearances:20,starts:20,minutesPlayed:1800,goals:0 })).canReplacePhoto,true)
const capped = score(complete({ appearances:10,starts:10,minutesPlayed:900,goals:20 }))
assert.equal(capped.foundation,50); assert.equal(capped.goalBonus,10); assert.equal(capped.points,60)
assert.equal(score({ metrics:{ appearances:20,starts:20,minutesPlayed:null,goals:0 }, coverage:{ appearances:'complete',starts:'complete',minutesPlayed:'partial',goals:'complete' } }).status,'unverified')
assert.equal(score(complete({ appearances:1,starts:2,minutesPlayed:90,goals:0 })).status,'unverified')
assert.equal(score(complete({ appearances:20,starts:20,minutesPlayed:1800,goals:0 }),{coverageStatus:'partial'}).canChangeBackground,false)
assert.equal(score(complete({ appearances:0,starts:0,minutesPlayed:0,goals:0 }),{supportDrops:450}).tier,'silver')
assert.equal(score(complete({ appearances:0,starts:0,minutesPlayed:0,goals:0 }),{supportDrops:1000}).canReplacePhoto,true)
assert.equal(score(complete({ appearances:0,starts:0,minutesPlayed:0,goals:0 }),{supportDrops:19}).supportPoints,1)
assert.equal(calculatePlayerCardPoints(complete({ appearances:0,starts:0,minutesPlayed:0,goals:0 })).status,'unverified')
assert.equal(sumPlayerRows([life.players[0],life.players[0]]).metrics.starts,1)
assert.equal(life.summary.matchCount,2)
assert.equal(life.players.find(row => row.teamId === 'A').metrics.goals,5)
assert.equal(life.players.find(row => row.teamId === 'B').metrics.goals,3)
assert.equal(aggregateStatistics({ matches:[before,after],scope:{teamId:'A'} }).teams[0].goalsFor,5)
assert.equal(aggregateStatistics({ matches:[before],scope:{} }).players.find(row => row.playerId === 'bench').metrics.appearances,0)
assert.equal(aggregateStatistics({ matches:[before,after],scope:{tournamentId:'t1'} }).summary.matchCount,1)
assert.equal(aggregateStatistics({ matches:[before,{...after,divisionId:'u10'}],scope:{divisionId:'u12'} }).summary.matchCount,1)
assert.equal(aggregateStatistics({ matches:[{...before,sportType:'basketball'}] }).summary.matchCount,0)
const originContext = { teamsById:{ A:{_id:'A'},B:{_id:'B',synthetic:true},opponent:{_id:'opponent'} }, tournamentsById:{ t1:{_id:'t1'},t2:{_id:'t2'} }, requireOriginEvidence:true }
const originChecked = aggregateStatistics({ matches:[before,after],scope:{},...originContext })
assert.equal(originChecked.summary.matchCount,1); assert.equal(originChecked.coverage.excludedTestMatches,1)
assert.equal(originChecked.coverage.cardScoreScopeComplete,true)
assert.equal(originChecked.players.every(row => row.tournamentId === 't1'),true)
const unknownOrigin = aggregateStatistics({ matches:[before],scope:{},teamsById:{},tournamentsById:{},requireOriginEvidence:true })
assert.equal(unknownOrigin.summary.matchCount,0); assert.equal(unknownOrigin.coverage.originUnverifiedMatches,1); assert.equal(unknownOrigin.coverage.status,'partial')
const scheduledUnknown = aggregateStatistics({ matches:[before,{...after,status:'scheduled',homeTeamId:'TBD'}],scope:{},teamsById:originContext.teamsById,tournamentsById:originContext.tournamentsById,requireOriginEvidence:true })
assert.equal(scheduledUnknown.coverage.originUnverifiedMatches,0)
const fakePlayerMatch = { ...before,homeLineup:{starters:[{playerId:'p1',name:'小明'},{playerId:'fake',name:'测试球员'}],substitutes:[]} }
const playerOriginChecked = aggregateStatistics({ matches:[fakePlayerMatch],scope:{},teamsById:originContext.teamsById,tournamentsById:originContext.tournamentsById,playersById:{p1:{_id:'p1'},fake:{_id:'fake',synthetic:true,source:'ai_fixture'}},requireOriginEvidence:true,requirePlayerOriginEvidence:true })
assert.equal(playerOriginChecked.summary.matchCount,0); assert.equal(playerOriginChecked.coverage.testPlayerMatches,1); assert.equal(playerOriginChecked.coverage.cardScoreScopeComplete,false)
assert.equal(aggregateStatistics({ matches:[before],scope:{from:'2026-10-01'} }).summary.matchCount,0)
assert.throws(() => validateScope({from:'oops'}),/日期/)

const pending = {...before,_id:'pending',refereeReviewStatus:'pending_review'}
assert.equal(aggregateStatistics({matches:[pending]}).summary.matchCount,0)
assert.equal(aggregateStatistics({matches:[pending],scope:{mode:'provisional'}}).summary.matchCount,1)
assert.equal(aggregateStatistics({matches:[{...before,status:'archived',refereeReviewStatus:'returned'}]}).summary.matchCount,0)
assert.equal(aggregateStatistics({matches:[{...before,status:'cancelled'}]}).summary.matchCount,0)

const corrected = [{matchId:'m1',eventId:'m1-g0',revision:2,status:'deleted'},{matchId:'m1',eventId:'m1-g1',revision:2,type:'goal',playerId:'p1',teamId:'A',minute:11}]
assert.equal(effectiveEvents(before,corrected).length,4)
assert.equal(aggregateStatistics({matches:[before],events:corrected,scope:{playerId:'p1'}}).players[0].metrics.goals,4)
assert.notEqual(aggregateStatistics({matches:[before]}).dataVersion,aggregateStatistics({matches:[before],events:corrected}).dataVersion)
const special = {...before,events:[{eventId:'og',type:'own_goal',playerId:'p1',teamId:'A'},{eventId:'shoot',type:'goal',playerId:'p1',teamId:'A',phase:'shootout'},{eventId:'sy',type:'second_yellow',playerId:'p1',teamId:'A',minute:30}]}
const specialRow = aggregateStatistics({matches:[special],scope:{playerId:'p1'}}).players[0]
assert.equal(specialRow.metrics.goals,0); assert.equal(specialRow.metrics.yellowCards,1); assert.equal(specialRow.metrics.redCards,1); assert.equal(specialRow.metrics.minutesPlayed,30)
const assistMatch = {...before,events:[{eventId:'g',type:'goal',playerId:'p1',assistPlayerId:'bench',teamId:'A'},{eventId:'a',goalEventId:'g',type:'assist',playerId:'bench',teamId:'A'}]}
assert.equal(aggregateStatistics({matches:[assistMatch]}).players.find(row => row.playerId === 'bench').metrics.assists,1)
const unknown = aggregateStatistics({matches:[{...before,events:undefined}]})
assert.equal(unknown.coverage.status,'partial'); assert.equal(unknown.players[0].metrics.goals,null)
const unlinked = aggregateStatistics({matches:[{...before,events:[{eventId:'legacy',type:'goal',teamId:'A',playerName:'小明'}]}]})
assert.equal(unlinked.coverage.unlinkedEventCount,1); assert.equal(unlinked.players[0].metrics.goals,null)
assert.equal(unlinked.coverage.cardScoreScopeComplete,true)
const untimed = aggregateStatistics({matches:[{...before,refereeClockElapsedSeconds:null}]})
assert.equal(untimed.players[0].metrics.minutesPlayed,null)
const lineupMissing = aggregateStatistics({matches:[{...before,homeLineup:undefined,awayLineup:undefined,events:[]}]})
assert.equal(lineupMissing.coverage.status,'partial'); assert.equal(lineupMissing.coverage.missingLineupSides,2)
const legacyMatch = { ...before, events:[{eventId:'legacy-goal',type:'goal',teamSide:'home',playerName:'小明',playerNumber:10,minute:12}], homeLineup:{starters:[{playerId:'p1',name:'小明',number:10}],substitutes:[]} }
assert.equal(aggregateStatistics({matches:[legacyMatch]}).players.find(row => row.playerId === 'p1').metrics.goals,1)
const ambiguousMatch = { ...legacyMatch,homeLineup:{starters:[{playerId:'p1',name:'小明',number:10},{playerId:'p2',name:'小明',number:10}],substitutes:[]} }
assert.equal(aggregateStatistics({matches:[ambiguousMatch]}).players.find(row => row.playerId === 'p1').metrics.goals,null)
const noScore = aggregateStatistics({matches:[{...before,homeScore:null}]})
assert.equal(noScore.teams[0].wins,null)

const rows = Array.from({length:1250},(_,index) => ({_id:String(index).padStart(5,'0'),matchId:index % 2 ? 'm1' : 'm2'}))
const pagingDb = mockDatabase({match_events:rows},20)
assert.equal((await readAll(pagingDb,'match_events',{}, {pageSize:100})).length,1250)
assert.equal((await readByIds(pagingDb,'match_events','matchId',['m1','m2','m1'])).length,1250)
await assert.rejects(readAll(pagingDb,'match_events',{}, {maxRows:200}),error => error.code === 'DATA_SCOPE_TOO_LARGE')
pagingDb.fail = 'match_events'
await assert.rejects(readAll(pagingDb,'match_events'),error => error.code === 'DATA_READ_FAILED')

const database = mockDatabase({
  teams:[{_id:'A',name:'原队',orgId:'org'},{_id:'B',name:'新队',orgId:'org'},{_id:'C',name:'外部队',orgId:'other'},{_id:'D',name:'虚拟队',orgId:'org',synthetic:true,syntheticDatasetId:'fixture'},{_id:'opponent',name:'对手',orgId:'other'}],
  players:[{_id:'p1',name:'小明',teamId:'A',orgId:'org',guardianPhone:'private-value'},{_id:'bench',name:'替补',teamId:'A',orgId:'org'},{_id:'fake',name:'测试球员',teamId:'A',orgId:'org',synthetic:true,syntheticDatasetId:'fixture',source:'ai_fixture'},{_id:'testTeamUnmarked',name:'未标记测试球员',teamId:'D',orgId:'org'}],
  matches:[before,after,{...makeMatch('hidden','C','secret',10)},{...makeMatch('virtual','D','t3',40),schedulePublished:true}],match_events:[],match_lineup_snapshots:[],player_team_memberships:[],player_transfers:[],
  tournaments:[{_id:'t1',name:'甲赛事',orgId:'org'},{_id:'t2',name:'乙赛事',orgId:'org'},{_id:'secret',name:'外部赛事',orgId:'other'},{_id:'t3',name:'测试赛事',orgId:'org'}],platform_settings:[],auth_sessions:[],users:[],
  publication_snapshots:[{_id:'pub',tournamentId:'t1',sportCode:'football',type:'tournament_center',status:'published'}]
})
const actor = {userId:'u',orgId:'org',platformOwner:false,teamIds:['A','B'],tournamentIds:['t1','t2']}
const service = createDataService(database)
const career = await service.query(actor,{playerId:'p1'})
assert.equal(career.playerTotal.metrics.goals,8); assert.equal(career.accessScope,'authorized')
assert.equal(career.playerCard.status,'scope_limited')
const platformCareer = await service.query({ ...actor, platformOwner:true }, { playerId:'p1' })
assert.equal(platformCareer.playerCard.status,'ready')
assert.deepEqual(await service.playerCardForAuthorizedPlayer('p1'),platformCareer.playerCard)
assert.equal(platformCareer.playerTotal.metrics.goals,18)
assert.equal(platformCareer.coverage.excludedTestMatches,1)
const fakeCareer = await service.query({ ...actor, platformOwner:true }, { playerId:'fake' })
assert.equal(fakeCareer.playerCard.status,'test_data_excluded'); assert.equal(fakeCareer.playerTotal.metrics.appearances,null)
assert.equal((await service.query({ ...actor,platformOwner:true }, { playerId:'testTeamUnmarked' })).playerCard.status,'test_data_excluded')
assert.equal((await service.catalog({ ...actor,platformOwner:true })).players.some(row => row.id === 'fake'),false)
assert.equal((await service.catalog({ ...actor,platformOwner:true })).players.some(row => row.id === 'testTeamUnmarked'),false)
assert.equal(platformCareer.playerCard.scoreVersion,'football-player-card-points/2')
database.data().fan_supports = Array.from({length:10},(_,i) => ({_id:'support-'+String(i).padStart(2,'0'),supportId:'valid-'+i,targetType:'player',playerId:'bench',serviceAccountOpenId:'fan',cost:1,status:'confirmed'}))
database.data().fan_points_ledger = Array.from({length:10},(_,i) => ({_id:'debit-'+String(i).padStart(2,'0'),supportId:'valid-'+i,targetType:'player',playerId:'bench',serviceAccountOpenId:'fan',reason:'fan-ranking-support',delta:-1}))
const supportedBench = await service.playerCardForAuthorizedPlayer('bench')
assert.equal(supportedBench.metrics.appearances,0)
assert.equal(supportedBench.supportDrops,10)
assert.equal(supportedBench.supportPoints,1)
assert.equal(supportedBench.points,1)
database.data().fan_supports.push({_id:'support-invalid',supportId:'missing-debit',targetType:'player',playerId:'bench',serviceAccountOpenId:'fan',cost:1,status:'confirmed'})
assert.equal((await readPlayerSupportTotals(database,['bench'])).get('bench').status,'partial')
assert.equal((await service.playerCardForAuthorizedPlayer('bench')).status,'unverified')
database.data().fan_supports.pop()
assert.equal((await service.query({ ...actor, platformOwner:true }, { playerId:'p1', tournamentId:'t1' })).playerCard.status,'scope_limited')
assert(!JSON.stringify(career).includes('private-value'))
await assert.rejects(service.query(actor,{teamId:'C'}),error => error.code === 'DATA_FORBIDDEN')
await assert.rejects(service.query(actor,{tournamentId:'secret'}),error => error.code === 'DATA_FORBIDDEN')
await assert.rejects(publicDataCenter(database,{tournamentId:'secret'}),error => error.code === 'DATA_NOT_PUBLISHED')
database.data().matches[0].schedulePublished = true
const pub = await publicDataCenter(database,{tournamentId:'t1'})
assert.equal(pub.accessScope,'published'); assert.equal(pub.summary.matchCount,1); assert(!JSON.stringify(pub).includes('private-value'))
database.data().matches[0].schedulePublished = false
assert.equal((await publicDataCenter(database,{tournamentId:'t1'})).summary.matchCount,0)
await assert.rejects(authenticate({getWXContext:() => ({})},database,{__actorUserId:'u',isPlatformOwner:true}),error => error.code === 'AUTH_REQUIRED')
await assert.rejects(authenticate({getWXContext:() => ({})},database,{__authToken:'forged',__actorUserId:'u'}),error => error.code === 'AUTH_REQUIRED')

const initialHistory = JSON.stringify(database.data().matches)
const request = await requestTransfer(database,actor,{playerId:'p1',fromTeamId:'A',toTeamId:'B',requestKey:'unique-request-1234'})
assert.equal((await requestTransfer(database,actor,{playerId:'p1',fromTeamId:'A',toTeamId:'B',requestKey:'unique-request-1234'})).id,request.id)
await assert.rejects(requestTransfer(database,actor,{playerId:'p1',fromTeamId:'A',toTeamId:'C',requestKey:'cross-request-1234'}),error => error.code === 'TRANSFER_CROSS_ORG_REQUIRES_REVIEW')
await assert.rejects(acceptTransfer(database,{...actor,teamIds:['A']},{transferId:request.id}),error => error.code === 'DATA_FORBIDDEN')
const accepted = await acceptTransfer(database,actor,{transferId:request.id})
assert.equal(accepted.playerId,'p1'); assert.equal(database.data().players[0].teamId,'B')
assert.equal(database.data().player_team_memberships.length,2)
assert.equal(database.data().player_team_memberships.find(row => row.status === 'ended').startTimeUnknown,true)
assert.equal((await acceptTransfer(database,actor,{transferId:request.id})).idempotent,true)
assert.equal(database.data().player_team_memberships.length,2)
assert.equal(JSON.stringify(database.data().matches),initialHistory)
assert.equal((await service.query(actor,{playerId:'p1'})).playerTotal.metrics.goals,8)
assert.equal((await service.query(actor,{teamId:'A',playerId:'p1'})).playerTotal.metrics.goals,5)
assert.equal((await service.query(actor,{teamId:'B',playerId:'p1'})).playerTotal.metrics.goals,3)
const {archiveMembership} = require('../cloudfunctions/dataCenter/shared/membership.cjs')
const {assertPlayerFactWrite} = require('../cloudfunctions/dataCenter/shared/write-policy.cjs')
assert.throws(() => assertPlayerFactWrite({goals:100}),error => error.code === 'COMPUTED_STATISTICS_READ_ONLY')
assert.doesNotThrow(() => assertPlayerFactWrite({name:'小明',height:160}))
await assert.rejects(requestTransfer(database,{...actor,manageTeamIds:[]},{playerId:'p1',fromTeamId:'B',toTeamId:'A',requestKey:'readonly-user-1234'}),error => error.code === 'DATA_FORBIDDEN')
await archiveMembership(database,actor,'p1','B')
assert.equal(database.data().players[0].status,'archived')
assert.equal(database.data().player_team_memberships.filter(row => row.status === 'active').length,0)
assert.equal((await archiveMembership(database,actor,'p1','B')).idempotent,true)
assert.equal(JSON.stringify(database.data().matches),initialHistory)
assert.equal((await service.query(actor,{playerId:'p1'})).playerTotal.metrics.goals,8)
console.log('PASS: 生涯/球队/赛事归属、转会幂等与权限、隐私隔离、正式/暂定、修订撤销、缺失指标、分页1250条、公开范围和版本变化')
