'use strict'
const crypto=require('node:crypto')
const text=v=>String(v??'').trim()
function date(v){if(v==null||v===''||v===0||typeof v==='boolean')return null;const d=new Date(v?.$date??v);return Number.isFinite(d.getTime())?d.toISOString():null}
const fingerprint=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0,24)
function scopeKey(scope={}){const fields=['teamId','tournamentId','divisionId','groupName','matchId','from','to'];const value=Object.fromEntries(fields.filter(k=>scope[k]).map(k=>[k,text(scope[k])]));return Object.keys(value).length?'scope:'+fingerprint(value):'career'}
function registration(row={}){
 const explicit=[['platformJoinedAt',row.platformJoinedAt],['firstRegisteredAt',row.firstRegisteredAt]].find(([,v])=>date(v))
 return {status:explicit?'recorded':'unknown',registeredAt:explicit?date(explicit[1]):null,source:explicit?.[0]||null,profileCreatedAt:date(row.createTime||row.createdAt),profileCreatedAtIsRegistrationEvidence:false}
}
function relationHistory({playerId,currentTeamId='',memberships=[],history=[]}){
 const issues=[],rows=[]
 for(const [source,list] of [['player_team_memberships',memberships],['player_team_history',history]])for(const row of list){
  if(text(row.playerId)!==playerId)continue
  const teamId=text(row.teamId);if(!teamId){issues.push({code:'RELATION_TEAM_MISSING',recordId:text(row._id),source});continue}
  const fromRaw=source==='player_team_memberships'?row.validFrom:row.joinedAt,toRaw=source==='player_team_memberships'?row.validTo:row.leftAt
  const joinedAt=date(fromRaw),leftAt=date(toRaw)
  if((fromRaw&&!joinedAt)||(toRaw&&!leftAt)||joinedAt&&leftAt&&joinedAt>leftAt)issues.push({code:'RELATION_TIME_INVALID',recordId:text(row._id),source})
  if(source==='player_team_memberships'&&row.status==='ended'&&!leftAt)issues.push({code:'RELATION_END_MISSING',recordId:text(row._id),source})
  rows.push({id:source+':'+text(row._id),teamId,joinedAt,leftAt,startTimeUnknown:!joinedAt,endState:leftAt?'ended':source==='player_team_memberships'&&row.status==='ended'?'unknown':'open',joinSource:text(row.joinSource||row.source),source,sourceRecordId:text(row._id),transferId:text(row.transferId),evidence:[{collection:source,id:text(row._id)}]})
 }
 const merged=[]
 for(const row of rows){const same=merged.find(old=>old.teamId===row.teamId&&old.joinedAt===row.joinedAt&&old.leftAt===row.leftAt&&old.endState===row.endState&&(row.joinedAt||row.leftAt)&&!old.evidence.some(e=>e.collection===row.source));if(same){same.evidence.push(...row.evidence)}else merged.push(row)}
 for(let i=0;i<merged.length;i++)for(let j=i+1;j<merged.length;j++){
  const a=merged[i],b=merged[j];if(a.teamId===b.teamId||!a.joinedAt||!b.joinedAt||a.endState==='unknown'||b.endState==='unknown')continue
  if((!a.leftAt||b.joinedAt<a.leftAt)&&(!b.leftAt||a.joinedAt<b.leftAt))issues.push({code:'RELATION_PERIOD_OVERLAP',recordIds:[a.id,b.id]})
 }
 const open=merged.filter(r=>r.endState==='open')
 if(new Set(open.map(r=>r.teamId)).size>1)issues.push({code:'MULTIPLE_CURRENT_TEAMS',recordIds:open.map(r=>r.id)})
 if(open.length&&open.some(r=>r.teamId!==currentTeamId))issues.push({code:'CURRENT_TEAM_HISTORY_CONFLICT',recordIds:open.filter(r=>r.teamId!==currentTeamId).map(r=>r.id)})
 return {status:issues.length?'conflict':merged.length?'recorded':'not_recorded',currentTeamId:currentTeamId||null,items:merged.sort((a,b)=>String(b.joinedAt||b.leftAt||'').localeCompare(String(a.joinedAt||a.leftAt||''))||a.id.localeCompare(b.id)),issues}
}
function performanceDimensions(statistics={}){
 const v=statistics.valuation||{},estimated=new Set(v.estimated||[]),m=statistics.playerTotal?.metrics||{},card=statistics.playerCard||{}
 const factor=k=>v.coverage==='complete'&&!estimated.has(k)&&Number.isFinite(v.factors?.[k])?Math.round(v.factors[k]*100):null
 const axes=[
  {key:'core',label:'竞技积累',score:factor('core'),value:Number.isFinite(card.points)?card.points:null,unit:'生涯积分',source:'playerCard.points'},
  {key:'quality',label:'表现质量',score:factor('quality'),value:v.positionBucket==='GK'?null:Number.isFinite(m.goals)&&Number.isFinite(m.minutesPlayed)&&m.minutesPlayed>0?Math.round(m.goals*90/m.minutesPlayed*100)/100:null,unit:v.positionBucket==='GK'?'零封率待采集':'进球/90分钟',source:'official metrics'},
  {key:'appearance',label:'出场稳定',score:factor('appearance'),value:factor('appearance'),unit:'统一稳定性指数',source:'valuation.factors.appearance'},
  {key:'trend',label:'成长趋势',score:null,value:null,unit:'待历史积分快照',source:'unavailable'},
  {key:'honors',label:'荣誉成就',score:null,value:null,unit:'待生涯荣誉归档',source:'unavailable'}
 ].map(a=>({...a,status:a.score===null?'unverified':'verified'}))
 return {version:'football-career-five/1',status:axes.every(a=>a.status==='verified')?'complete':'partial',axes,note:'缺失维度不补0或中性值；五维是赛事表现，不是速度等技术能力。'}
}
function valuationSnapshots(rows=[],{playerId,version,scopeKey='career',authorizationKey='platform',minor=false}={}){
 const issues=[],accepted=[]
 for(const row of rows){
  const rowVersion=text(row.version||row.algorithmVersion),time=date(row.computedAt)
  if(text(row.playerId)!==playerId||rowVersion!==version||text(row.scopeKey)!==scopeKey||text(row.authorizationKey)!==authorizationKey)continue
  if(row.coverage!=='complete'||!time||new Date(time).getTime()>Date.now()||!Number.isFinite(row.total)||row.total<0){issues.push({code:'VALUATION_SNAPSHOT_INVALID',id:text(row._id)});continue}
  accepted.push({id:text(row._id),computedAt:time,total:minor?null:row.total,money:minor?null:Number.isFinite(row.money)&&row.money>=0?row.money:null,version:rowVersion,scopeKey,dataVersion:text(row.dataVersion)||null})
 }
 return {status:issues.length?'partial':accepted.length?'recorded':'not_recorded',items:accepted.sort((a,b)=>a.computedAt.localeCompare(b.computedAt)||a.id.localeCompare(b.id)),issues}
}
module.exports={text,date,fingerprint,scopeKey,registration,relationHistory,performanceDimensions,valuationSnapshots}
