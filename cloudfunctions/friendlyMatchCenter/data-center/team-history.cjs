'use strict'
const {text,date,fingerprint}=require('./hub-contract.cjs')
function matchYear(row){const value=row.matchDate||row.startedAt||row.startTime||row.matchTime;const parsed=date(value);return parsed?Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Shanghai'}).format(new Date(parsed))):null}
function teamTotals(rows,coverage){return Object.fromEntries(['played','wins','draws','losses','goalsFor','goalsAgainst'].map(key=>[key,!rows.length?coverage?.status==='complete'?0:null:rows.every(row=>Number.isFinite(row[key]))?rows.reduce((n,row)=>n+row[key],0):null]))}
async function officialYears({matches,events,scope,context}){
 const {aggregateStatistics}=await import('./statistics.mjs'),groups=new Map()
 for(const match of matches){const year=matchYear(match),key=year==null?'unknown':String(year);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(match)}
 const years=[];let undated=null
 for(const [key,rows] of groups){const r=aggregateStatistics({matches:rows,events,scope,...context});if(!r.summary.matchCount&&!r.coverage.originUnverifiedMatches)continue
  const teams=r.teams.filter(row=>row.teamId===scope.teamId),playerCount=new Set(r.players.filter(row=>row.teamId===scope.teamId).map(row=>row.playerId)).size
  const entry={year:key==='unknown'?null:Number(key),totals:teamTotals(teams,r.coverage),playerCount,coverage:r.coverage,metricVersion:r.metricVersion,dataVersion:r.dataVersion}
  if(key==='unknown')undated=entry;else years.push(entry)
 }
 years.sort((a,b)=>b.year-a.year)
 return {version:'team-official-years/1',timeZone:'Asia/Shanghai',dateBasis:'actual match date',years,undated,dataVersion:fingerprint([years,undated])}
}
function participantIds(row){return [...new Set([...(Array.isArray(row.playerIds)?row.playerIds:[]),...(row.scorers||[]).map(x=>x.playerId)].map(text).filter(Boolean))]}
async function friendlyHistory({rows,invites=[],teamId,teamsById={},playersById={}}){
 const {synthetic}=await import('./statistics.mjs'),seen=new Set(),issues=[],buckets=new Map(),all=[]
 const score=v=>v!==null&&v!==undefined&&v!==''&&Number.isInteger(Number(v))&&Number(v)>=0?Number(v):null
 const blank=()=>({records:0,finished:0,scheduled:0,cancelled:0,unknownStatus:0,scoreKnown:0,scoreUnknown:0,wins:0,draws:0,losses:0,goalsFor:0,goalsAgainst:0,teamConfirmed:0,confirmedWins:0,confirmedDraws:0,confirmedLosses:0,participantSourceUnverified:0,opponentSourceUnverified:0})
 const lifetime=blank(),invitationSummary={recorded:0,cancelled:0,pending:0,other:0},invitationYears=new Map(),excluded={test:0,deleted:0,duplicate:0}
 for(const row of rows){
  const id=text(row._id);if(!id){issues.push({code:'FRIENDLY_ID_MISSING'});continue}if(seen.has(id)){excluded.duplicate++;continue}seen.add(id)
  if(row.isDeleted===true||['deleted','void'].includes(text(row.status))){excluded.deleted++;continue}
  const opponent=teamsById[text(row.opponentTeamId)],ids=participantIds(row)
  if(synthetic(row)||synthetic(teamsById[teamId])||synthetic(opponent)||ids.some(id=>synthetic(playersById[id]))){excluded.test++;continue}
  if(text(row.teamId)!==teamId)continue
  const year=matchYear(row),key=year==null?'unknown':String(year);if(!buckets.has(key))buckets.set(key,blank());const bucket=buckets.get(key)
  const status=text(row.status),finished=status==='finished',cancelled=['cancelled','canceled'].includes(status),scheduled=['signup','upcoming','scheduled'].includes(status),home=score(row.homeScore),away=score(row.awayScore),ours=row.isHome===false?away:home,theirs=row.isHome===false?home:away
  const participantSourceVerified=ids.length>0&&ids.every(id=>playersById[id]&&!synthetic(playersById[id])),opponentSourceVerified=Boolean(opponent)&&!synthetic(opponent)
  for(const target of [lifetime,bucket]){target.records++;if(cancelled){target.cancelled++;continue}if(scheduled){target.scheduled++;continue}if(!finished){target.unknownStatus++;continue}target.finished++;if(!participantSourceVerified)target.participantSourceUnverified++;if(!opponentSourceVerified)target.opponentSourceUnverified++;if(ours===null||theirs===null){target.scoreUnknown++;continue}target.scoreKnown++;target.goalsFor+=ours;target.goalsAgainst+=theirs;if(ours>theirs)target.wins++;else if(ours===theirs)target.draws++;else target.losses++;if(row.isOfficial===true){target.teamConfirmed++;if(ours>theirs)target.confirmedWins++;else if(ours===theirs)target.confirmedDraws++;else target.confirmedLosses++}}
  all.push({id,year,date:date(row.matchDate||row.startedAt||row.startTime),status,homeScore:home,awayScore:away,isHome:row.isHome!==false,isOfficial:row.isOfficial===true,verification:participantSourceVerified&&opponentSourceVerified?'team_recorded':'source_unverified'})
 }
 for(const row of invites){if(text(row.teamId)!==teamId||synthetic(row)||synthetic(teamsById[teamId])||synthetic(teamsById[text(row.opponentTeamId)])||row.isDeleted===true)continue;const year=matchYear({startTime:row.createdAt||row.createTime}),key=year==null?'unknown':String(year);if(!invitationYears.has(key))invitationYears.set(key,{year,recorded:0,cancelled:0,pending:0,other:0});for(const target of [invitationSummary,invitationYears.get(key)]){target.recorded++;if(['cancelled','canceled'].includes(text(row.status)))target.cancelled++;else if(['pending','open','active'].includes(text(row.status)))target.pending++;else target.other++}}
 const present=(year,counts)=>{const sourceUnknown=counts.participantSourceUnverified||counts.opponentSourceUnverified;return {year,observed:counts,metrics:{played:sourceUnknown?null:counts.finished,wins:counts.scoreUnknown||sourceUnknown?null:counts.wins,draws:counts.scoreUnknown||sourceUnknown?null:counts.draws,losses:counts.scoreUnknown||sourceUnknown?null:counts.losses,goalsFor:counts.scoreUnknown||sourceUnknown?null:counts.goalsFor,goalsAgainst:counts.scoreUnknown||sourceUnknown?null:counts.goalsAgainst},coverage:counts.scoreUnknown||sourceUnknown||counts.unknownStatus?'partial':'complete'}}
 const invitationView={...invitationSummary,dateBasis:'invitation creation time',years:[...invitationYears.values()].filter(x=>x.year!==null).sort((a,b)=>b.year-a.year),undated:invitationYears.get('unknown')||null}
 return {version:'team-friendly-history/1',timeZone:'Asia/Shanghai',source:'friendly_matches',rankingEligible:false,verification:'team_recorded',lifetime:present(null,lifetime),invitations:invitationView,years:[...buckets].filter(([key])=>key!=='unknown').map(([key,value])=>present(Number(key),value)).sort((a,b)=>b.year-a.year),undated:buckets.has('unknown')?present(null,buckets.get('unknown')):null,excluded,issues,dataVersion:fingerprint([all,invitationView])}
}
async function readFriendlyTeamHistory(db,teamId,knownTeam){
 const {readByIds,readOptionalAll}=require('./reader.cjs'),{synthetic}=await import('./statistics.mjs')
 const team=knownTeam||(await readByIds(db,'teams','_id',[teamId]))[0]
 if(!team||team.isDeleted===true||team.status==='deleted')throw Object.assign(new Error('球队来源待核验'),{code:'DATA_IDENTITY_UNVERIFIED'})
 if(synthetic(team))throw Object.assign(new Error('测试球队不进入正式球队统计'),{code:'DATA_TEST_EXCLUDED'})
 const markers=['synthetic','isTest','syntheticDatasetId','syntheticKey','source','originType','dataKind','isDeleted'],projection=keys=>Object.fromEntries(keys.map(k=>[k,true]))
 const [games,invites]=await Promise.all([readOptionalAll(db,'friendly_matches',{teamId},{fields:projection(['_id','teamId','opponentTeamId','matchDate','matchTime','startedAt','startTime','homeScore','awayScore','isHome','isOfficial','status','createdAt','createTime','playerIds','scorers.playerId',...markers])}),readOptionalAll(db,'friendly_invites',{teamId},{fields:projection(['_id','teamId','opponentTeamId','matchDate','status','createdAt','createTime',...markers])})])
 const [players,opponents]=await Promise.all([readByIds(db,'players','_id',games.rows.flatMap(participantIds),{fields:projection(['_id',...markers])}),readByIds(db,'teams','_id',games.rows.map(x=>text(x.opponentTeamId)).filter(Boolean),{fields:projection(['_id',...markers])})])
 const result=await friendlyHistory({rows:games.rows,invites:invites.rows,teamId,teamsById:Object.fromEntries([team,...opponents].map(x=>[text(x._id),x])),playersById:Object.fromEntries(players.map(x=>[text(x._id),x]))})
 if(games.status!=='ready'){result.lifetime.metrics=Object.fromEntries(Object.keys(result.lifetime.metrics).map(k=>[k,null]));result.lifetime.observed=Object.fromEntries(Object.keys(result.lifetime.observed).map(k=>[k,null]));result.lifetime.coverage='not_recorded'}
 if(invites.status!=='ready')for(const key of ['recorded','cancelled','pending','other'])result.invitations[key]=null
 return {...result,storageStatus:games.status,invitationStorageStatus:invites.status}
}
function legacyFriendlyStats(history){const m=history.lifetime.metrics,o=history.lifetime.observed,complete=history.lifetime.coverage==='complete';return {total:m.played,win:m.wins,draw:m.draws,lose:m.losses,goalsFor:m.goalsFor,goalsAgainst:m.goalsAgainst,official:complete?o.teamConfirmed:null,officialWin:complete?o.confirmedWins:null,officialDraw:complete?o.confirmedDraws:null,officialLose:complete?o.confirmedLosses:null}}
module.exports={matchYear,teamTotals,officialYears,friendlyHistory,participantIds,readFriendlyTeamHistory,legacyFriendlyStats}
