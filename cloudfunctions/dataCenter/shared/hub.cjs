'use strict'
const {readByIds,readOptionalAll}=require('./reader.cjs')
const contract=require('./hub-contract.cjs')
const {text,date,fingerprint,registration,relationHistory,performanceDimensions,valuationSnapshots}=contract
const {teamTotals:totals}=require('./team-history.cjs')
const fail=(code,message)=>Object.assign(new Error(message),{code})
const live=row=>Boolean(row)&&row.isDeleted!==true&&text(row.status)!=='deleted'
function owner(actor){if(!actor?.platformOwner||actor.public||actor.staff)throw fail('DATA_FORBIDDEN','仅平台负责人可使用数据总站')}
function teamView(row){return {id:text(row._id),name:text(row.name||row.teamName),logo:text(row.logo||row.logoUrl),city:text(row.cityName||row.city),registration:registration(row),status:text(row.status)}}
function playerView(row){return {id:text(row._id),name:text(row.name),teamId:text(row.teamId||row.teamCode),playerCode:text(row.playerId||row.playerCode),jerseyNumber:row.jerseyNumber??row.number??null,position:text(row.position),jerseyName:text(row.jerseyName),nationality:text(row.nationality),birthday:date(row.birthDate||row.birthday),height:row.height??null,weight:row.weight??null,nativePlace:text(row.nativePlace),registration:registration(row),status:text(row.status)}}
function careerRequest(event,field){const value=text(event[field]);if(!value||value.length>100)throw fail('DATA_SCOPE_INVALID','请选择有效的数据对象');if(event.scope&&Object.keys(event.scope).length||event.tournamentId||event.from||event.to||event.mode&&event.mode!=='official')throw fail('DATA_CAREER_SCOPE_FIXED','数据总站档案使用正式生涯口径，不接受赛事或日期截断');return value}
function createHubService(db,service){
 async function catalog(actor,event={}){
  owner(actor);const page=await require('./hub-directory.cjs').directoryPage(db,event,{teams:teamView,players:playerView})
  return {success:true,hubVersion:'football-data-hub/1',accessScope:'platform',generatedAt:new Date().toISOString(),dataVersion:fingerprint(page.items),...page}
 }
 async function playerProfile(actor,event){
  owner(actor);const playerId=careerRequest(event,'playerId'),{synthetic}=await import('./statistics.mjs')
  const profile=(await readByIds(db,'players','_id',[playerId]))[0];if(!live(profile))throw fail('DATA_NOT_FOUND','球员不存在或已删除')
  const currentTeamId=text(profile.teamId||profile.teamCode),currentTeam=(await readByIds(db,'teams','_id',[currentTeamId]))[0]
  if(synthetic(profile)||synthetic(currentTeam))throw fail('DATA_TEST_EXCLUDED','测试球队及测试球员不进入正式数据总站')
  if(currentTeamId&&!currentTeam)throw fail('DATA_IDENTITY_UNVERIFIED','当前球队来源待核验，不输出正式生涯档案')
  if(profile.teamId&&profile.teamCode&&text(profile.teamId)!==text(profile.teamCode))throw fail('DATA_IDENTITY_CONFLICT','球员当前球队字段冲突，请先核验')
  const statistics=await service.query(actor,{playerId,mode:'official'},{includeLedger:true})
  const [transfers,legacy,snapshots,membershipRead]=await Promise.all([readOptionalAll(db,'player_transfers',{playerId}),readOptionalAll(db,'player_team_history',{playerId}),readOptionalAll(db,'player_valuations',{playerId}),readOptionalAll(db,'player_team_memberships',{playerId})])
  const memberships=membershipRead.rows,teamIds=[currentTeamId,...memberships.map(x=>x.teamId),...legacy.rows.map(x=>x.teamId),...transfers.rows.flatMap(x=>[x.fromTeamId,x.toTeamId])]
  const teams=(await readByIds(db,'teams','_id',teamIds)).filter(x=>!synthetic(x)).map(teamView),allowedTeams=new Set(teams.map(x=>x.id))
  const filteredMemberships=memberships.filter(x=>!synthetic(x)&&allowedTeams.has(text(x.teamId))),filteredHistory=legacy.rows.filter(x=>!synthetic(x)&&allowedTeams.has(text(x.teamId)))
  const relations=relationHistory({playerId,currentTeamId,memberships:filteredMemberships,history:filteredHistory})
  const rejectedHistory=memberships.length-filteredMemberships.length+legacy.rows.length-filteredHistory.length
  if(rejectedHistory){relations.issues.push({code:'HISTORY_SOURCE_EXCLUDED',count:rejectedHistory});if(relations.status==='recorded')relations.status='partial'}
  const minor=Boolean(statistics.valuation?.minor)||Boolean(profile.birthDate||profile.birthday)&&require('./valuation.cjs').parseAge(profile.birthDate||profile.birthday)<18
  const history=transfers.rows.filter(x=>!synthetic(x)&&allowedTeams.has(text(x.fromTeamId))&&allowedTeams.has(text(x.toTeamId))).map(x=>({id:text(x._id),fromTeamId:text(x.fromTeamId),toTeamId:text(x.toTeamId),status:text(x.status),requestedAt:date(x.createTime),effectiveAt:date(x.acceptedAt||x.effectiveAt),valuationSnapshot:!minor&&x.valuationSnapshot?.version&&date(x.valuationSnapshot.computedAt)&&Number.isFinite(x.valuationSnapshot.money)?{money:x.valuationSnapshot.money,version:text(x.valuationSnapshot.version),computedAt:date(x.valuationSnapshot.computedAt)}:null})).sort((a,b)=>String(b.effectiveAt||b.requestedAt||'').localeCompare(String(a.effectiveAt||a.requestedAt||'')))
  const snapshotView=valuationSnapshots(snapshots.rows.filter(x=>!synthetic(x)),{playerId,version:statistics.valuation?.version,minor})
  const matchRows=statistics.pointsLedger?.rows||[],matches=await readByIds(db,'matches','_id',matchRows.map(x=>x.matchId)),matchById=new Map(matches.map(x=>[text(x._id),x])),careerCoverage=statistics.playerTotal?.coverage||{}
  const recent=matchRows.map(x=>{const m=matchById.get(x.matchId)||{};const score=n=>n!==null&&n!==undefined&&n!==''&&Number.isFinite(Number(n))?Number(n):null;return {matchId:x.matchId,matchName:x.matchName,tournamentName:x.tournamentName,date:date(x.date),teamNames:x.teamNames,role:x.role,minutesPlayed:x.minuteNote?null:x.minutesPlayed,goals:careerCoverage.goals==='complete'?x.goals:null,homeScore:score(m.homeScore??m.scoreHome),awayScore:score(m.awayScore??m.scoreAway)}}).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')))
  if(minor&&statistics.valuation)statistics.valuation={...statistics.valuation,index:null,total:null,money:null,moneyText:'',tier:'',tierValue:null,display:'仅展示星级',minor:true}
  const result={profile:playerView(profile),currentTeam:currentTeam?teamView(currentTeam):null,teams,statistics,five:performanceDimensions({...statistics,valuation:{...statistics.valuation,positionBucket:/GK|守门/i.test(text(profile.position))?'GK':''}}),transfers:{status:transfers.status,items:history},memberships:relations,snapshots:{...snapshotView,storageStatus:snapshots.status},recentMatches:recent}
  const dataVersion=fingerprint({profile:result.profile,teams,statisticsVersion:statistics.dataVersion,scoreVersion:statistics.playerCard?.dataVersion,relations,transfers:history,snapshots:snapshotView,five:result.five})
  const portraitSource=[profile.playerCardSourceFileId,profile.photoFileID,profile.photoFileId,profile.photoUrl,profile.photo].find(value=>typeof value==='string'&&value.trim())||''
  return {success:true,hubVersion:'football-data-hub/1',accessScope:'platform',dataVersion,generatedAt:statistics.generatedAt,portraitSource,...result}
 }
 async function teamProfile(actor,event){
  owner(actor);const teamId=careerRequest(event,'teamId'),row=(await readByIds(db,'teams','_id',[teamId]))[0],{synthetic}=await import('./statistics.mjs')
  if(!live(row))throw fail('DATA_NOT_FOUND','球队不存在或已删除');if(synthetic(row))throw fail('DATA_TEST_EXCLUDED','测试球队不进入正式数据总站')
  const markerFields=['synthetic','isTest','syntheticDatasetId','syntheticKey','source','originType','dataKind','isDeleted']
  const tools=require('./team-history.cjs')
  const rosterFields=Object.fromEntries(['_id','name','teamId','teamCode','position','jerseyNumber','number','status',...markerFields].map(k=>[k,true]))
  const [statistics,friendly,rosterA,rosterB]=await Promise.all([service.query(actor,{teamId,mode:'official'},{includeAnnual:true}),tools.readFriendlyTeamHistory(db,teamId,row),readByIds(db,'players','teamId',[teamId],{fields:rosterFields}),readByIds(db,'players','teamCode',[teamId],{fields:rosterFields})])
  const roster=[...new Map([...rosterA,...rosterB].filter(x=>live(x)&&x.status!=='archived'&&!synthetic(x)).map(x=>[text(x._id),{id:text(x._id),name:text(x.name),position:text(x.position),jerseyNumber:x.jerseyNumber??x.number??null}])).values()]
  const profile=teamView(row),currentRoster={status:'recorded',count:roster.length,playerIds:roster.map(x=>x.id)},officialTotals=tools.teamTotals(statistics.teams,statistics.coverage)
  const [tournaments,divisions]=await Promise.all([readByIds(db,'tournaments','_id',statistics.teams.map(x=>x.tournamentId)),readByIds(db,'divisions','_id',statistics.teams.map(x=>x.divisionId).filter(x=>x&&x!=='default'))])
  const scopes={tournaments:tournaments.filter(x=>!synthetic(x)).map(x=>({id:text(x._id),name:text(x.name)})),divisions:divisions.filter(x=>!synthetic(x)).map(x=>({id:text(x._id),name:text(x.name)}))}
  return {success:true,hubVersion:'football-data-hub/1',accessScope:'platform',dataVersion:fingerprint([profile,statistics.dataVersion,statistics.annual?.dataVersion,friendly.dataVersion,currentRoster,scopes]),profile,currentRoster,statistics,scopes,totals:officialTotals,official:{totals:officialTotals,annual:statistics.annual||null},friendly}
 }
 return {catalog,playerProfile,teamProfile}
}
module.exports={createHubService,playerView,teamView,careerRequest,totals}
