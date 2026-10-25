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
const round1=v=>Math.round(v*10)/10
// 五维是同组别内的相对水平，封顶 9.5 分：避免组内第一名被判成“满分”，造成绝对实力的误读。
const SCORE_CEILING=9.5
const clampScore=v=>Math.max(0,Math.min(SCORE_CEILING,v))
// 成长趋势：有可信积分快照时用快照对比；否则用已留存积分明细的近期与前段场均积分对比，样本不足返回 null。
function trendAxis(statistics={}){
 const v=statistics.valuation||{},estimated=new Set(v.estimated||[])
 if(v.coverage==='complete'&&!estimated.has('trend')&&Number.isFinite(v.factors?.trend))
  return {key:'trend',label:'成长趋势',score:round1(v.factors.trend*SCORE_CEILING),raw:null,unit:'积分快照对比',source:'valuation.factors.trend'}
 const rows=(statistics.pointsLedger?.rows||[]).filter(row=>row&&row.date&&Number.isFinite(row.points)).sort((a,b)=>String(a.date).localeCompare(String(b.date)))
 const size=Math.min(5,Math.floor(rows.length/2))
 if(size<2)return {key:'trend',label:'成长趋势',score:null,raw:null,unit:'待历史积分快照',source:'unavailable'}
 const average=list=>list.reduce((sum,row)=>sum+row.points,0)/list.length
 const recent=average(rows.slice(-size)),prior=average(rows.slice(-2*size,-size))
 return {key:'trend',label:'成长趋势',score:round1(clampScore(5+(recent-prior)/Math.max(prior,1)*5)),raw:round1(recent),unit:`近 ${size} 场场均积分`,source:'pointsLedger.rows'}
}
function honorAxis(honors){
 const rows=Array.isArray(honors)?honors:[]
 if(!rows.length)return {key:'honors',label:'荣誉成就',score:null,raw:null,unit:'待生涯荣誉归档',source:'unavailable'}
 const points=rows.reduce((sum,row)=>sum+(Number.isFinite(row.points)?row.points:0),0)
 return {key:'honors',label:'荣誉成就',score:round1(Math.min(SCORE_CEILING,points/10)),raw:rows.length,unit:'项正式奖项',source:'awards.ready'}
}
function performanceDimensions(statistics={}){
 const v=statistics.valuation||{},estimated=new Set(v.estimated||[]),m=statistics.playerTotal?.metrics||{},card=statistics.playerCard||{}
 const verified=k=>v.coverage==='complete'&&!estimated.has(k)&&Number.isFinite(v.factors?.[k])
 const ten=k=>verified(k)?round1(v.factors[k]*SCORE_CEILING):null
 const gk=v.positionBucket==='GK'
 const axes=[
  {key:'core',label:'竞技积累',score:ten('core'),raw:Number.isFinite(card.points)?card.points:null,unit:'生涯积分',source:'playerCard.points'},
  {key:'quality',label:'表现质量',score:ten('quality'),raw:gk?null:Number.isFinite(m.goals)&&Number.isFinite(m.minutesPlayed)&&m.minutesPlayed>0?Math.round(m.goals*90/m.minutesPlayed*100)/100:null,unit:gk?'零封率待采集':'进球/90分钟',source:'official metrics'},
  {key:'appearance',label:'出场稳定',score:ten('appearance'),raw:Number.isFinite(m.appearances)?m.appearances:null,unit:'出场场次',source:'valuation.factors.appearance'},
  trendAxis(statistics),
  honorAxis(statistics.honors)
 ].map(a=>({...a,status:a.score===null?'unverified':'verified'}))
 return {version:'football-career-five/3',scale:'0-10',ceiling:SCORE_CEILING,status:axes.every(a=>a.status==='verified')?'complete':'partial',axes,note:'五维为同组别分位换算的 0–10 分（保留一位小数），最高 9.5 分、不评满分；原始值只作附注；缺失维度不补0或中性值；五维是赛事表现，不是速度等技术能力。'}
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
