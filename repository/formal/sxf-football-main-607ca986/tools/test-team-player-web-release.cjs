const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { pathToFileURL } = require('node:url')
const { mockDatabase, measure } = require('./performance/mock-db.cjs')
const { root, baseline, loadSource } = require('./performance/load-source.cjs')
const plain = value => JSON.parse(JSON.stringify(value))
const pad = value => String(value).padStart(4, '0')
const user = { _id: 'synthetic-user', orgId: 'o0000', phone: '13900000000' }
function tenantFixture(tenants, teams = 10, perTeam = 20) {
  const tables = { teams: [], players: [], tournaments: [], matches: [] }
  for (let org = 0; org < tenants; org++) for (let index = 0; index < teams; index++) {
    const id = `t${pad(org)}_${pad(index)}`, orgId = `o${pad(org)}`
    tables.teams.push({ _id: id, orgId, teamCode: `code-${id}`, description: 'synthetic'.repeat(200) })
    tables.tournaments.push({ _id: `event-${id}`, orgId, description: 'synthetic'.repeat(200) })
    tables.matches.push({ _id: `match-${id}`, orgId, homeTeamId: id, tournamentId: `event-${id}`, description: 'synthetic'.repeat(200) })
    for (let player = 0; player < perTeam; player++) tables.players.push({ _id: `${id}_p${pad(player)}`, teamId: id, orgId, name: `Synthetic-${player}`, createTime: player, privateFixturePayload: 'synthetic'.repeat(300) })
  }
  return tables
}
function publicFixture(count, privateCount = 2000) {
  const tables = { publication_snapshots: [{ _id: 'snapshot', sportCode: 'football', type: 'tournament_center', status: 'published', tournamentId: 'public-event', version: 1, payload: { tournament: { id: 'public-event', name: 'Synthetic Cup' }, matches: [] } }], matches: [], players: [], teams: [], match_events: [], match_lineup_snapshots: [], fan_supports: [], tournament_news: [] }
  for (let i = 0; i < 20; i++) {
    tables.teams.push({ _id: `team-${pad(i)}`, name: `Synthetic team ${i}`, privateFixturePayload: 'synthetic'.repeat(400) })
    for (let j = 0; j < 20; j++) tables.players.push({ _id: `p${pad(i)}_${pad(j)}`, name: `Synthetic player ${i}-${j}`, teamId: `team-${pad(i)}`, teamName: `Synthetic team ${i}`, jerseyNumber: String(j), photoUrl: 'https://example.invalid/synthetic.png', guardianPhone: 'SYNTHETIC_PRIVATE_SENTINEL', privateFixturePayload: 'synthetic'.repeat(600) })
  }
  for (let i = 0; i < count; i++) {
    const id = `m${pad(i)}`, home = i % 20, away = (home + 1) % 20
    tables.matches.push({ _id: id, tournamentId: 'public-event', schedulePublished: true, status: i === 0 ? 'LiVe' : 'completed', homeTeamId: `team-${pad(home)}`, awayTeamId: `team-${pad(away)}`, homeTeamName: `Synthetic team ${home}`, awayTeamName: `Synthetic team ${away}`, homeScore: 0, awayScore: 0, timestamp: i + 1, events: [] })
    for (const team of [home, away]) tables.match_lineup_snapshots.push({ _id: `${id}_${team}`, matchId: id, teamId: `team-${pad(team)}`, status: 'published', starters: [{ playerId: `p${pad(team)}_0000`, name: `Synthetic player ${team}-0`, jerseyNumber: '0' }], substitutes: [] })
    tables.fan_supports.push({ _id: `support-${id}`, matchId: id, teamSide: 'home', privateFixturePayload: 'synthetic'.repeat(200) })
  }
  for (let i = 0; i < privateCount; i++) tables.matches.push({ _id: `private-${pad(i)}`, tournamentId: 'private-event', status: 'draft', privateFixturePayload: 'synthetic'.repeat(100) })
  return tables
}
async function regressions() {
  let assertions = 0
  const tables = tenantFixture(1)
  for (let i = 0; i < 1500; i++) tables.teams.unshift({ _id: `foreign-${pad(i)}`, orgId: 'foreign' })
  tables.teams.push({ _id: 'legacy', organizationId: user.orgId }, { _id: 'conflict', orgId: user.orgId, organizationId: 'foreign' })
  const db = mockDatabase(tables, { cap: 37 }), hooks = loadSource('webLoginApi', db)
  const scope = await hooks.buildOrganizerScope(db, user, 'players')
  assert(scope.teamIds.has('legacy')); assert(!scope.teamIds.has('conflict')); assert.equal(scope.teamIds.size, 11); assertions += 3
  assert.equal(db.stats.byCollection.matches, undefined); assert.equal(db.stats.byCollection.tournaments, undefined); assertions += 2
  for (const record of [{ _id: 'legacy-p', teamCode: 'legacy' }, { _id: 'array-p', teamCodes: ['code-t0000_0000'] }, { _id: 'foreign-p', teamId: 'foreign-0000' }, { _id: 'direct-p', orgId: user.orgId }, { _id: 'conflicting-org-p', orgId: user.orgId, organization_id: 'foreign' }]) tables.players.push(record)
  const allowed = tables.players.filter(row => hooks.organizerRecordAllowed('players', row, scope)).sort((a,b) => a._id < b._id ? -1 : 1)
  const page = await hooks.handleDbQuery({ _testUser: user, collection: 'players', operation: 'list', skip: 125, limit: 71, orderBy: { _id: 'asc' } })
  assert.equal(page.success, true); assert.deepEqual(plain(page.data), plain(allowed.slice(125, 196))); assertions += 2
  const directTeam=await hooks.handleDbQuery({_testUser:user,collection:'teams',operation:'get',id:'legacy'});assert.equal(directTeam.success,true);assertions++
  const conflictTeam=await hooks.handleDbQuery({_testUser:user,collection:'teams',operation:'get',id:'conflict'});assert.equal(conflictTeam.success,false);assertions++
  const count = await hooks.handleDbQuery({ _testUser: user, collection: 'players', operation: 'count' })
  assert.equal(count.total, allowed.length); assertions++
  const empty = await hooks.handleDbQuery({ _testUser: { _id: 'other', orgId: '' }, collection: 'players', operation: 'list' })
  assert.deepEqual(plain(empty.data), []); assertions++
  const forged = await hooks.handleDbQuery({ _testUser: user, collection: 'players', operation: 'list', where: { teamId: 'foreign-0000' } })
  assert.deepEqual(plain(forged.data), []); assertions++
  const revokedDb = mockDatabase({ teams: [{ _id:'owned', orgId:user.orgId }], players:[{ _id:'p', teamId:'owned' }] })
  const revoked = loadSource('webLoginApi', revokedDb)
  assert.equal((await revoked.handleDbQuery({ _testUser:user,collection:'players',operation:'list' })).data.length,1)
  revokedDb.tables.teams[0].orgId = 'foreign'
  assert.equal((await revoked.handleDbQuery({ _testUser:user,collection:'players',operation:'list' })).data.length,0); assertions += 2
  const publicTables = publicFixture(151)
  const oldPublic = await loadSource('webLoginApi', mockDatabase(publicTables), true).getPublicTournamentCenter()
  const publicDb = mockDatabase(publicTables, { cap: 37, latencyMs: 1 })
  const newPublic = await loadSource('webLoginApi', publicDb).getPublicTournamentCenter()
  assert.deepEqual(plain(newPublic), plain(oldPublic)); assert(publicDb.stats.maxActive <= 4); assert(!JSON.stringify(newPublic).includes('SYNTHETIC_PRIVATE_SENTINEL')); assertions += 3
  const legacyPublic=publicFixture(20)
  legacyPublic.match_lineup_snapshots.forEach(row=>row.starters.forEach(player=>delete player.playerId))
  assert.deepEqual(plain(await loadSource('webLoginApi',mockDatabase(legacyPublic)).getPublicTournamentCenter()),plain(await loadSource('webLoginApi',mockDatabase(legacyPublic),true).getPublicTournamentCenter()));assertions++
  legacyPublic.publication_snapshots[0].payload.matches.push({id:'historical-only',tournamentId:'public-event',homeTeamId:'team-0000',awayTeamId:'team-0001',homeName:'Synthetic team 0',awayName:'Synthetic team 1',homeLineup:{starters:[{name:'Synthetic player 0-0',jerseyNumber:'0'}],substitutes:[]}})
  assert.deepEqual(plain(await loadSource('webLoginApi',mockDatabase(legacyPublic)).getPublicTournamentCenter()),plain(await loadSource('webLoginApi',mockDatabase(legacyPublic),true).getPublicTournamentCenter()));assertions++
  await assert.rejects(() => loadSource('webLoginApi', mockDatabase(publicTables, { fail:'match_events' })).getPublicTournamentCenter(), error => error.code === 'DATA_READ_FAILED'); assertions++
  const large = publicFixture(5101, 0)
  assert.equal((await loadSource('webLoginApi', mockDatabase(large)).getPublicTournamentCenter()).data.matches.length, 5101); assertions++
  const { readAll } = require('../cloudfunctions/dataCenter/shared/reader.cjs')
  await assert.rejects(() => readAll(publicDb,'players',{}, {maxRows:100}), error => error.code === 'DATA_SCOPE_TOO_LARGE'); assertions++
  const playerView=fs.readFileSync(path.join(root,'web-admin-vue/src/views/player/PlayerList.vue'),'utf8')
  const playerLoad=playerView.slice(playerView.indexOf('async function loadPlayers()'),playerView.indexOf('async function loadTeams()'))
  const refs={loading:{value:false},canViewAllPlayers:{value:true},currentRole:{value:'coach'},players:{value:[]},ROLES:{COACH:'coach'},queryAll:async()=>[{_id:'first',name:'same',birthDate:null,teamId:'team-a'},{_id:'second',name:'same',birthDate:null,teamCode:'team-b'}],exports:{},console:{error(){}}}
  vm.runInNewContext(playerLoad+';exports.load=loadPlayers;',refs);await refs.exports.load();assert.equal(refs.players.value.length,2);assert.deepEqual(plain(refs.players.value.map(row=>row.teamCodes)),[['team-a'],['team-b']]);assertions+=2
  const { createInflightReads } = await import(pathToFileURL(path.join(root,'web-admin-vue/src/utils/inflightReads.js')))
  const { readAllPages } = await import(pathToFileURL(path.join(root,'web-admin-vue/src/utils/pagedReads.js')))
  const share = createInflightReads(); let resolve, calls=0
  const load = () => { calls++; return new Promise(done => { resolve=done }) }
  const one=share('identity-a|org-a',load), two=share('identity-a|org-a',load)
  await Promise.resolve(); assert.equal(calls,1); resolve('ok'); assert.deepEqual(await Promise.all([one,two]),['ok','ok']); assertions += 2
  await share('identity-a|org-a',() => { calls++; return 'new' }); assert.equal(calls,2); assertions++
  await assert.rejects(share('failure',() => Promise.reject(new Error('failed')))); assert.equal(await share('failure',() => 'retry'),'retry'); assertions++
  let pagingCalls=0
  const rows = await readAllPages(async options => { pagingCalls++; return Array.from({length:1250},(_,i)=>({_id:pad(i)})).slice(options.skip,options.skip+options.limit) })
  assert.equal(rows.length,1250); assert.equal(pagingCalls,2); assertions += 2
  const exactBudget = Array.from({length:20000},(_,i)=>({_id:pad(i)}))
  assert.equal((await readAllPages(async options=>exactBudget.slice(options.skip,options.skip+options.limit))).length,20000); assertions++
  await assert.rejects(()=>readAllPages(async options=>Array.from({length:1000},(_,i)=>({_id:String(options.skip+i)}))),/范围过大/); assertions++
  const storageMap=new Map([['authToken','token-a'],['currentOrg','org-a']]);const httpPending=[];let httpCalls=0
  const cloudCode=fs.readFileSync(path.join(root,'web-admin-vue/src/utils/cloud.js'),'utf8').replace(/^import .*$/gm,'').replace(/export /g,'').replace(/import\.meta\.env/g,"({ DEV: false, BASE_URL: '/admin/' })")
  const webSandbox={exports:{},createInflightReads,readAllPages,isPlatformContext:()=>false,getPlatformAuthToken:()=>'',localStorage:{getItem:key=>storageMap.get(key)||null,removeItem:key=>storageMap.delete(key)},console:{log(){},warn(){},error(){}},ElMessage:{warning(){},error(){}},AbortController,URL,setTimeout,clearTimeout,fetch:()=>{httpCalls++;return new Promise(resolve=>httpPending.push(resolve))}}
  vm.runInNewContext(cloudCode+';exports.read=callFunctionHTTP;',webSandbox)
  const httpArgs={collection:'players',operation:'list'}
  const a=webSandbox.exports.read('dbQuery',httpArgs),b=webSandbox.exports.read('dbQuery',httpArgs);await Promise.resolve();assert.equal(httpCalls,1)
  httpPending.shift()({ok:true,text:async()=>JSON.stringify({success:true,data:[]})});await Promise.all([a,b]);assertions++
  const late=webSandbox.exports.read('dbQuery',httpArgs);await Promise.resolve();storageMap.set('authToken','token-b');storageMap.set('currentOrg','org-b');httpPending.shift()({ok:true,text:async()=>JSON.stringify({success:true,data:[{_id:'private-a'}]})});await assert.rejects(late,error=>error.code==='SESSION_ACCOUNT_MISMATCH');assertions++
  const changed=webSandbox.exports.read('dbQuery',httpArgs);await Promise.resolve();assert.equal(httpCalls,3);httpPending.shift()({ok:true,text:async()=>JSON.stringify({success:true,data:[]})});await changed;assertions++
  // A multi-page read must keep one identity across all pages, too.
  let resolvePage
  webSandbox.pageLoader=()=>new Promise(resolve=>{resolvePage=resolve})
  vm.runInNewContext('queryList=pageLoader;exports.all=queryAll;',webSandbox)
  const crossPage=webSandbox.exports.all('players');storageMap.set('currentOrg','org-c');resolvePage([{_id:'private-b'}])
  await assert.rejects(crossPage,error=>error.code==='SESSION_ACCOUNT_MISMATCH');assertions++
  assert.equal(db.stats.writes+publicDb.stats.writes,0);assertions++
  return assertions
}
async function benchmarks() {
  const report={baseline,method:'Real baseline and modified functions evaluated with a local synthetic database. Authorization/organization-resolution stubs isolate query-scope cost; not a full HTTP or production capacity test. 3ms artificial latency per database get; no network or production data.',scenarios:[]}
  for (const tenants of [5,20,100]) {
    const tables=tenantFixture(tenants)
    const pair=[]
    for (const before of [true,false]) {
      const db=mockDatabase(tables,{latencyMs:3}),hooks=loadSource('webLoginApi',db,before)
      const measured=await measure(()=>hooks.handleDbQuery({_testUser:user,collection:'players',operation:'list',limit:100,orderBy:{_id:'asc'}}),db)
      pair.push(measured)
    }
    assert.deepEqual(plain(pair[1].result),plain(pair[0].result))
    report.scenarios.push({name:'PC player page',tenants,teams:tables.teams.length,players:tables.players.length,before:pair[0].metrics,after:pair[1].metrics,equivalentResponse:true})
  }
  const teamReadTables=tenantFixture(100),teamPagePair=[]
  for(const before of [true,false]) {const db=mockDatabase(teamReadTables,{latencyMs:3}),hooks=loadSource('webLoginApi',db,before);teamPagePair.push(await measure(()=>hooks.handleDbQuery({_testUser:user,collection:'teams',operation:'list',limit:100,orderBy:{_id:'asc'}}),db))}
  assert.deepEqual(plain(teamPagePair[0].result),plain(teamPagePair[1].result))
  report.scenarios.push({name:'PC team page',tenants:100,teams:1000,before:teamPagePair[0].metrics,after:teamPagePair[1].metrics,equivalentResponse:true})
  for (const count of [20,151,400]) {
    const tables=publicFixture(count),pair=[]
    for (const before of [true,false]) {
      const db=mockDatabase(tables,{latencyMs:3}),hooks=loadSource('webLoginApi',db,before)
      pair.push(await measure(()=>hooks.getPublicTournamentCenter(),db))
    }
    assert.deepEqual(plain(pair[1].result),plain(pair[0].result))
    report.scenarios.push({name:'H5 public teams and lineups',publicMatches:count,privateDraftMatches:2000,players:tables.players.length,before:pair[0].metrics,after:pair[1].metrics,equivalentResponse:true})
  }
  for (const count of [2,20]) {
    const tables=publicFixture(count,0),pair=[]
    for(const before of [true,false]) {const db=mockDatabase(tables,{latencyMs:3}),hooks=loadSource('webLoginApi',db,before);pair.push(await measure(()=>hooks.getPublicTournamentCenter(),db))}
    assert.deepEqual(plain(pair[0].result),plain(pair[1].result))
    report.scenarios.push({name:'H5 small dataset, no drafts',publicMatches:count,privateDraftMatches:0,players:tables.players.length,before:pair[0].metrics,after:pair[1].metrics,equivalentResponse:true})
  }
  // Repeated timing controls disclose host noise instead of selecting one run.
  report.repeatedTimingControls=[]
  for(const [functionName,tables,runName] of [['webLoginApi',publicFixture(20,0),'Small H5 without drafts']]) {
    const samples={original:[],completeControl:[],after:[]}
    for(let repetition=0;repetition<5;repetition++) {
      for(const mode of repetition%2?['after','completeControl','original']:['original','completeControl','after']) {
        const db=mockDatabase(tables,{latencyMs:3}),hooks=loadSource(functionName,db,mode!=='after',mode==='completeControl')
        const measured=await measure(()=>functionName==='webLoginApi'?hooks.getPublicTournamentCenter():hooks.safeGetPlayersForTeams(['team'],500),db)
        samples[mode].push(measured.metrics.wallMs)
      }
    }
    const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)]
    report.repeatedTimingControls.push({name:runName,repetitions:5,wallMsSamples:samples,medianWallMs:Object.fromEntries(Object.entries(samples).map(([key,values])=>[key,median(values)])),note:'Alternating execution order; local timers and mock filtering have host-dependent overhead. Not a production latency prediction.'})
  }
  return report
}
;(async()=>{
 const assertions=await regressions();const report=await benchmarks();report.regressionAssertions=assertions
 const output=path.join(root,'.codex-artifacts/web-release-performance-20261001');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'benchmark.json'),JSON.stringify(report,null,2)+'\n')
 console.log(`PASS: ${assertions} focused regression assertions; baseline-equivalent PC/H5 responses; complete 5101-match and 1250-player PC pagination; max 4 public DB reads; no DB writes.`)
 for(const s of report.scenarios)console.log(`${s.name} (${s.tenants||s.publicMatches||s.players}): DB operations ${s.before.operations}->${s.after.operations}; DB rows ${s.before.rows}->${s.after.rows}; DB bytes ${s.before.bytes}->${s.after.bytes}; wall ${s.before.wallMs}->${s.after.wallMs}ms; response ${s.before.responseBytes}->${s.after.responseBytes} bytes`)
})().catch(error=>{console.error(error);process.exitCode=1})
