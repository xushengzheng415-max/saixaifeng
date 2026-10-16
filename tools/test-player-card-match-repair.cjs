const assert=require('node:assert/strict'),path=require('node:path')
async function run(root){
 const {fixture}=require('./test-player-card-audit-endpoint.cjs'),f=fixture(root,{writable:true}),call=(workflowAction,p={})=>f.handler({action:'savePlayerCardTemplate',workflowAction,...p})
 f.data.players.push({_id:'q1',name:'对手球员',teamId:'opponent'})
 f.data.roster_snapshots=[{_id:'r1',tournamentId:'cup',divisionId:'division',teamId:'A',status:'approved',version:1,playerIds:['p1','p2','p3']},{_id:'r2',tournamentId:'cup',divisionId:'division',teamId:'opponent',status:'approved',version:1,playerIds:['q1']}]
 Object.assign(f.data.divisions[0],{activeRulesVersion:'rules1',activeRulesSnapshot:{matchFormat:'8v8',substitutionMode:'free'}})
 const m=f.data.matches[0];delete m.homeLineup;delete m.awayLineup;delete m.events
 m.durationRulesSnapshot={schemaVersion:'football-duration-rules/1',minutesBasis:'period',minutes:30,periodCount:2,totalMinutes:60}
 // Use the canonical verifier's accepted evidence shape, never a naked guessed minutes field.
 m.durationVerification={schemaVersion:'football-duration-verification/1',matchId:'m1',minutesBasis:'period',minutes:30,periodCount:2,totalMinutes:60,reason:'原始规程确认',verifiedBy:'owner',verifiedAt:new Date().toISOString(),revision:'duration-v1'}
 const inspect=()=>call('auditRepairInspect',{matchId:'m1'}),base={matchId:'m1',reason:'原始纸质报告补录',confirmedSource:true}
 let r=await inspect();assert.equal(r.success,true);assert.equal(r.durationMinutes,60);assert.equal(r.matchName,'验收球队 vs 对手');assert.equal(r.sides.home.players.find(x=>x.id==='p3').eligible,false)
 let revision=r.revision
 assert.equal((await call('auditRepairSave',{...base,revision,kind:'lineup',side:'home',starters:['q1'],bench:[]})).code,'CARD_REPAIR_LINEUP_INVALID')
 assert.equal((await call('auditRepairSave',{...base,revision,kind:'lineup',side:'home',starters:['p1'],bench:[],confirmedSource:false})).code,'CARD_REPAIR_SOURCE_REQUIRED')
 assert.equal((await call('auditRepairSave',{...base,revision,kind:'lineup',side:'home',starters:['p1'],bench:['p2']})).success,true)
 assert.equal((await call('auditRepairSave',{...base,revision,kind:'lineup',side:'away',starters:['q1'],bench:[]})).code,'CARD_REPAIR_CONFLICT')
 r=await inspect();assert.equal((await call('auditRepairSave',{...base,revision:r.revision,kind:'lineup',side:'away',starters:['q1'],bench:[]})).success,true)
 r=await inspect();revision=r.revision
 assert.equal((await call('auditRepairSave',{...base,revision,kind:'events',events:[{type:'goal',teamId:'A',playerId:'p1',minute:12}],eventsComplete:true})).code,'CARD_REPAIR_SCORE_MISMATCH')
 assert.equal((await call('auditRepairSave',{...base,revision,kind:'events',events:[{type:'substitution',teamId:'A',playerId:'p1',outPlayerId:'p2',minute:30}],eventsComplete:true})).code,'CARD_REPAIR_SUBSTITUTION_INVALID')
 assert.equal((await call('auditRepairSave',{...base,revision,kind:'events',events:[{type:'substitution',teamId:'A',playerId:'p2',outPlayerId:'p1',minute:30}],eventsComplete:true})).success,true)
 const audit=await call('auditPlayer',{playerId:'p1'});assert.equal(audit.success,true);assert.equal(audit.score.status,'ready');assert.equal(audit.playerTotal.metrics.minutesPlayed,30);assert.equal(f.data.platform_settings.filter(x=>x.recordType==='match_fact_repair_audit').length,3)
 r=await inspect();m.refereeRecordLocked=true;assert.equal((await call('auditRepairSave',{...base,revision:r.revision,kind:'events',events:[],eventsComplete:true})).code,'CARD_REPAIR_LOCKED');delete m.refereeRecordLocked
 r=await inspect();m.homeScore=1;assert.equal((await call('auditRepairSave',{...base,revision:r.revision,kind:'events',events:[],eventsComplete:true})).code,'CARD_REPAIR_CONFLICT')
 f.setAuth({success:true,principalType:'user',user:{_id:'organizer'}});assert.equal((await inspect()).success,false)
 console.log('PASS: authenticated source repair, named matches, stable approved roster IDs, test exclusion, source evidence, stale conflict, locked result, score and substitution checks, audit trail; canonical grade becomes ready with 30 actual minutes')
}
run(process.argv[2]?path.resolve(process.argv[2]):undefined).catch(e=>{console.error(e);process.exitCode=1})
