import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import templates from '../cloudfunctions/generateSchedule/pairingTemplates.js'
import confirmed from '../cloudfunctions/generateSchedule/confirmedPairings.js'
import {leagueRoundsForTeams} from '../web-admin-vue/src/utils/leaguePairings.js'
assert.deepEqual(templates.standardRoundRobinRounds(8,'single')[0],[[1,2],[3,4],[5,6],[7,8]])
assert.deepEqual(templates.standardRoundRobinRounds(8,'single','head_tail')[0],[[1,8],[2,7],[3,6],[4,5]])
assert.deepEqual(templates.standardRoundRobinRounds(7,'single','head_tail')[0],[[1,7],[2,6],[3,5]])
assert.throws(()=>templates.standardRoundRobinRounds(8,'single','unknown'),/首轮/)
for(let n=2;n<=32;n++)for(const mode of ['adjacent','head_tail'])for(const loop of ['single','double']){
 const rounds=templates.standardRoundRobinRounds(n,loop,mode),pairCounts=new Map(),expectedLegs=loop==='double'?2:1
 assert.equal(rounds.length,(n%2?n:n-1)*expectedLegs)
 for(const round of rounds){const seen=new Set();for(const[a,b]of round){assert(a>=1&&a<=n&&b>=1&&b<=n&&a!==b);assert(!seen.has(a)&&!seen.has(b));seen.add(a);seen.add(b);const key=[a,b].sort((x,y)=>x-y).join(':');pairCounts.set(key,(pairCounts.get(key)||0)+1)}}
 assert.equal(pairCounts.size,n*(n-1)/2);assert([...pairCounts.values()].every(count=>count===expectedLegs))
 if(loop==='double'){const half=rounds.length/2;assert.deepEqual(rounds.slice(half),rounds.slice(0,half).map(r=>r.map(([a,b])=>[b,a])))}
 const teams=Array.from({length:n},(_,i)=>({teamId:'t'+(i+1),name:'测试队'+(i+1),position:i+1}))
 const ui=leagueRoundsForTeams(teams,mode,loop)
 const built=confirmed.buildConfirmedPairings({tournamentId:'event',division:{_id:'division',formatType:'league'},leagueRecords:[{divisionId:'division',status:'confirmed',confirmedAt:'2000-01-01',loopType:loop,leaguePairingMode:mode,teams}]})
 assert.equal(built.matches.length,ui.flat().length)
 assert.deepEqual(built.matches.map(m=>[m.homeTeamId,m.awayTeamId]),ui.flat().map(m=>[m.home.teamId,m.away.teamId]))
}
const code=fs.readFileSync('cloudfunctions/generateSchedule/index.js','utf8'),start=code.indexOf('function buildRoundRobinRounds('),end=code.indexOf('\nfunction ',start+10),context={pairingTemplates:templates};vm.createContext(context);vm.runInContext(code.slice(start,end)+'\n;globalThis.build=buildRoundRobinRounds',context)
assert.equal(context.build(Array.from({length:8},(_,i)=>({id:i+1})),'head_tail')[0][0].away.id,8)
assert.equal(context.build(Array.from({length:8},(_,i)=>({id:i+1})),'adjacent')[0][0].away.id,2)
console.log('PASS: 2–32 teams, both first-round modes, odd byes, single/double round-robin invariants, exact UI/backend pair order and legacy schedule wrapper; invalid modes fail explicitly')
