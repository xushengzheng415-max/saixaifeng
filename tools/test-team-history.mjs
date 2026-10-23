import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {aggregateStatistics} from '../cloudfunctions/dataCenter/shared/statistics.mjs'
const require=createRequire(import.meta.url),{matchYear,officialYears,teamTotals,friendlyHistory}=require('../cloudfunctions/dataCenter/shared/team-history.cjs')
assert.equal(matchYear({matchDate:'2026-12-31T17:00:00Z'}),2027)
assert.equal(matchYear({createdAt:'2024-01-01'}),null)
assert.equal(matchYear({matchDate:'invalid'}),null)
const context={teamsById:{A:{_id:'A'},B:{_id:'B'},T:{_id:'T',synthetic:true}},tournamentsById:{t:{_id:'t',createdAt:'2020-01-01'}},playersById:{p:{_id:'p',teamId:'B'},fake:{_id:'fake',isTest:true}},requireOriginEvidence:true,requirePlayerOriginEvidence:true}
const match=(id,when,home,away)=>({_id:id,tournamentId:'t',homeTeamId:'A',awayTeamId:'B',status:'completed',homeScore:home,awayScore:away,matchDate:when,homeLineup:{starters:[{playerId:'p'}],substitutes:[]},awayLineup:{starters:[],substitutes:[]},events:[]})
const official=[match('m1','2025-01-01',1,0),match('m2','2026-06-01',0,2),match('m3','',2,2),{...match('m4','2020-01-01',99,0),synthetic:true}]
const annual=await officialYears({matches:[...official,official[0]],events:[],scope:{teamId:'A',mode:'official'},context})
assert.deepEqual(annual.years.map(x=>x.year),[2026,2025]);assert.equal(annual.undated.totals.played,1)
const total=teamTotals(aggregateStatistics({matches:official,scope:{teamId:'A'},...context}).teams,{status:'complete'})
assert.equal(total.played,3);assert.equal(total.wins,1);assert.equal(total.draws,1);assert.equal(total.losses,1);assert.equal(total.goalsFor,3);assert.equal(total.goalsAgainst,4)
for(const key of ['played','wins','draws','losses','goalsFor','goalsAgainst'])assert.equal(annual.years.reduce((n,x)=>n+x.totals[key],annual.undated.totals[key]),total[key],'annual reconciliation '+key)
const base={teamId:'A',opponentTeamId:'B',playerIds:['p'],status:'finished',homeScore:2,awayScore:1,isHome:true,matchDate:'2026-01-01',isOfficial:true}
const rows=[{...base,_id:'f1'},{...base,_id:'f2',homeScore:null},{...base,_id:'f3',status:'cancelled',homeScore:99},{...base,_id:'f4',status:'signup'},{...base,_id:'f5',synthetic:true},{...base,_id:'f6',opponentTeamId:'T'},{...base,_id:'f7',playerIds:['fake']},{...base,_id:'f8',matchDate:'',homeScore:0,awayScore:0},{...base,_id:'f1'}]
const friendly=await friendlyHistory({rows,teamId:'A',teamsById:context.teamsById,playersById:context.playersById})
assert.equal(friendly.rankingEligible,false);assert.equal(friendly.lifetime.observed.finished,3);assert.equal(friendly.lifetime.observed.cancelled,1);assert.equal(friendly.lifetime.observed.scheduled,1);assert.equal(friendly.excluded.test,3);assert.equal(friendly.excluded.duplicate,1)
assert.equal(friendly.lifetime.observed.scoreUnknown,1);assert.equal(friendly.lifetime.metrics.wins,null);assert.equal(friendly.undated.observed.finished,1);assert.equal(friendly.lifetime.observed.draws,1,'missing score is not a 0:0 draw')
assert.equal(friendly.years.reduce((n,x)=>n+x.observed.finished,friendly.undated.observed.finished),friendly.lifetime.observed.finished)
const unknown=await friendlyHistory({rows:[{...base,_id:'x',playerIds:[],opponentTeamId:''}],teamId:'A',teamsById:context.teamsById,playersById:context.playersById})
assert.equal(unknown.lifetime.coverage,'partial');assert.equal(unknown.lifetime.metrics.played,null);assert.equal(unknown.lifetime.observed.finished,1)
const away=await friendlyHistory({rows:[{...base,_id:'away',isHome:false}],teamId:'A',teamsById:context.teamsById,playersById:context.playersById});assert.equal(away.lifetime.metrics.losses,1);assert.equal(away.lifetime.metrics.goalsFor,1)
const invites=await friendlyHistory({rows:[],invites:[{_id:'i1',teamId:'A',status:'open',createdAt:'2025-12-31T17:00:00Z',matchDate:'2030-01-01'},{_id:'i2',teamId:'A',status:'cancelled',createTime:'2025-01-01'},{_id:'i3',teamId:'A',status:'pending'}],teamId:'A',teamsById:context.teamsById,playersById:context.playersById});assert.deepEqual(invites.invitations.years.map(x=>x.year),[2026,2025]);assert.equal(invites.invitations.undated.recorded,1);assert.equal(invites.lifetime.metrics.played,0,'invitations are not played matches')
const tenThousand=Array.from({length:10000},(_,i)=>({...base,_id:'large-'+i,matchDate:(2016+i%10)+'-06-01'}))
const large=await friendlyHistory({rows:tenThousand,teamId:'A',teamsById:context.teamsById,playersById:context.playersById});assert.equal(large.lifetime.metrics.played,10000);assert.equal(large.years.length,10);assert.equal(large.years.reduce((sum,x)=>sum+x.metrics.wins,0),large.lifetime.metrics.wins);assert(Buffer.byteLength(JSON.stringify(large))<20000,'annual summary must not return every raw match')
console.log('PASS: team career vs yearly official totals reconcile; match-time Shanghai years and undated bucket; no current-roster reassignment; friendly lifecycle/score/verification and test player/team exclusions; official/friendly isolation; no missing-score zero fill or duplicate counting')
console.log('PASS: 10,000 isolated friendly match records grouped into 10 years; lifetime/yearly figures reconcile and response stays under 20KB; invitation years use creation time and do not become matches')
