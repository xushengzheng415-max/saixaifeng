'use strict'
const {digest}=require('./player-card-snapshot.cjs')
function buildPointsLedger(playerId,contributions,score,parameters){
  const ordered=contributions.filter(row=>row.playerId===playerId).slice().sort((a,b)=>a.date.localeCompare(b.date)||a.matchId.localeCompare(b.matchId)||a.teamId.localeCompare(b.teamId))
  const grouped=new Map(),rounding=new Map()
  for(const fact of ordered){
    const key=[fact.teamId,fact.tournamentId,fact.divisionId].join('|'),previous=rounding.get(key)||{raw:0,rounded:0},raw=previous.raw+fact.minutesPlayed,rounded=Math.round(raw),minutes=rounded-previous.rounded
    rounding.set(key,{raw,rounded})
    if(!grouped.has(fact.matchId))grouped.set(fact.matchId,{matchId:fact.matchId,matchName:fact.matchName,tournamentName:fact.tournamentName,date:fact.date,teamNames:[],appearances:0,starts:0,minutesPlayed:0,goals:0,minuteBases:[]})
    const row=grouped.get(fact.matchId);row.appearances=Math.max(row.appearances,fact.appearances);row.starts=Math.max(row.starts,fact.starts);row.minutesPlayed+=minutes;row.goals+=fact.goals;row.teamNames.push(fact.teamName);row.minuteBases.push(fact.minuteBasis)
  }
  let minutes=0,goalBudget=score.goalBonus||0
  const rows=[...grouped.values()].map(row=>{
    const before=Math.floor(minutes/parameters.minutesPerPoint);minutes+=row.minutesPlayed
    const parts={appearance:row.appearances*parameters.appearancePoints,starter:row.starts*parameters.startPoints,minutes:Math.floor(minutes/parameters.minutesPerPoint)-before,goals:Math.min(goalBudget,row.goals*parameters.goalPoints)};goalBudget-=parts.goals
    const bases=[...new Set(row.minuteBases)],minuteNote=bases.includes('duration_unrecorded')?'比赛时长缺少依据，本场分钟项计0分':bases.includes('events_incomplete')?'上场过程未记录完整，本场分钟项计0分':bases.includes('substitution_unverified')?'换人或罚下依据不完整，本场分钟项计0分':bases.every(x=>x==='not_played')?'替补未上场，出场与分钟项均为0分':''
    return {...row,teamNames:[...new Set(row.teamNames)].filter(Boolean),role:row.starts?'首发':row.appearances?'替补上场':'替补未上场',parts,points:Object.values(parts).reduce((a,b)=>a+b,0),minuteNote,goalNote:parts.goals<row.goals*parameters.goalPoints?'受进球加分上限限制':'',minuteBases:undefined}
  })
  const matchPoints=rows.reduce((sum,row)=>sum+row.points,0),supportPoints=score.supportPoints||0
  if(score.status==='ready'&&matchPoints+supportPoints!==score.points)throw Object.assign(new Error('积分明细与当前总分未对齐，请重试'),{code:'POINTS_LEDGER_MISMATCH'})
  return {schemaVersion:'player-points-ledger/1',playerId,revision:digest([score.snapshotRevision,rows,parameters]),scoreVersion:score.scoreVersion,accountingPolicy:score.accountingPolicy,status:score.status,points:score.points,matchPoints,supportPoints,supportDrops:score.supportDrops??null,creditedMetrics:score.creditedMetrics||null,parameters,rows}
}
module.exports={buildPointsLedger}
