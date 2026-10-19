'use strict'
const { readByIds } = require('./data-center/reader.cjs')
const { createDataService } = require('./data-center/service.cjs')
const { matchDisplayStatus } = require('./data-center/lifecycle.cjs')
const text=value=>String(value==null?'':value).trim()
const hidden=new Set(['cancelled','canceled','removed','replaced','deleted','void','abandoned'])
function sideId(row,side){const nested=row[side+'Team'];return text(row[side+'TeamId']||row[side+'Id']||row[side==='home'?'teamAId':'teamBId']||(typeof nested==='object'?nested?._id||nested?.id:nested))}
async function load(db,input,dates){
  const {synthetic,matchGroupName}=await import('./data-center/statistics.mjs')
  const {tournament,division,registration,team,allMatches,allowLegacyDivision}=input,teamId=text(team._id),divisionId=text(division._id||registration.divisionId||registration.division||'default')
  const rows=synthetic(tournament)||synthetic(team)?[]:allMatches.filter(row=>!synthetic(row)&&!hidden.has(text(row.status).toLowerCase())&&(text(row.divisionId||row.division)===divisionId||(!row.divisionId&&!row.division&&allowLegacyDivision)))
  const own=rows.filter(row=>sideId(row,'home')===teamId||sideId(row,'away')===teamId).sort((a,b)=>(dates.matchDateTimeMs(a)||Number.MAX_SAFE_INTEGER)-(dates.matchDateTimeMs(b)||Number.MAX_SAFE_INTEGER)||text(a._id).localeCompare(text(b._id)))
  const explicitGroup=text(registration.groupName||registration.drawGroup||registration.group||registration.groupCode)
  const ownGroupRows=own.filter(row=>!['knockout','cup','placement','final','semifinal'].includes(text(row.phase||row.stageType||row.matchType).toLowerCase()))
  const groupNames=explicitGroup?[explicitGroup]:[...new Set(ownGroupRows.map(matchGroupName))]
  const permitted=rows.filter(row=>groupNames.includes(matchGroupName(row))&&!['knockout','cup','placement','final','semifinal'].includes(text(row.phase||row.stageType||row.matchType).toLowerCase()))
  const profiles=await readByIds(db,'teams','_id',own.concat(permitted).flatMap(row=>[sideId(row,'home'),sideId(row,'away')]),{fields:{name:true,teamName:true,logo:true,logoUrl:true,teamLogo:true,synthetic:true,isTest:true,syntheticDatasetId:true,syntheticKey:true,source:true,originType:true,dataKind:true}})
  const byId=new Map(profiles.map(row=>[text(row._id),row]));byId.set(teamId,team)
  const brief=(row,side)=>{const id=sideId(row,side),profile=byId.get(id)||{};return {id,name:text(profile.name||profile.teamName||row[side+'TeamName']||row[side+'Name'])||'球队待定',logo:text(profile.logoUrl||profile.logo||profile.teamLogo||row[side+'TeamLogo'])}}
  const score=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))&&Number(value)>=0?String(Number(value)):'—'
  const matches=own.filter(row=>![sideId(row,'home'),sideId(row,'away')].some(id=>synthetic(byId.get(id)))).map(row=>{
    const state=matchDisplayStatus(row),home=brief(row,'home'),away=brief(row,'away')
    return {id:text(row._id),roundText:text(row.roundName||row.roundText||row.phaseName),status:state,statusText:({finished:'已结束',ongoing:'进行中',upcoming:'待开始',postponed:'已延期'})[state]||'待确认',dateText:dates.matchDateText(row),timeText:dates.matchTimeValue(row),venue:text(row.venue||row.field||row.location||row.fieldName)||'场地待定',home,away,homeScore:score(row.homeScore??row.scoreHome),awayScore:score(row.awayScore??row.scoreAway),canSubmitLineup:state==='upcoming',startTime:row.startTime||row.kickoffAt||null}
  })
  const next=matches.find(row=>row.status==='ongoing')||matches.find(row=>row.status==='upcoming')||matches.find(row=>row.status==='postponed')||null
  let standingsGroups=[],standingsState='ready',standingsError=''
  if(permitted.length){
    try{
      // This request-local capability is only created after the parent verifies the
      // team's enrollment. Never return the data-service's player/private records.
      const data=await createDataService(db).query({public:true,platformOwner:false,teamIds:[teamId],tournamentIds:[text(tournament._id)],matchIds:permitted.map(row=>text(row._id))},{tournamentId:text(tournament._id),...(allowLegacyDivision?{}:{divisionId})})
      standingsGroups=(data.standings||[]).filter(group=>groupNames.includes(group.groupName)&&(group.divisionId===divisionId||(allowLegacyDivision&&group.divisionId==='default'))).map(group=>({name:group.groupName==='联赛'?text(division.name||registration.divisionName)+'积分榜':group.groupName+'积分榜',groupName:group.groupName,rows:group.officialTeams.map(row=>({teamId:row.teamId,teamName:row.teamName,rank:row.rank,played:row.played,win:row.win,draw:row.draw,loss:row.loss,goalDifference:row.goalDifference,points:row.points,isCurrent:row.teamId===teamId}))}))
      // Show known scheduled participants even before their first official result.
      // They remain unranked; never invent a competitive ordering or score.
      for(const groupName of groupNames){
        const scheduled=permitted.filter(row=>matchGroupName(row)===groupName),ids=[...new Set(scheduled.flatMap(row=>[sideId(row,'home'),sideId(row,'away')]).filter(Boolean))]
        let group=standingsGroups.find(row=>row.groupName===groupName)
        if(!group&&ids.length){group={name:groupName==='联赛'?text(division.name||registration.divisionName)+'积分榜':groupName+'积分榜',groupName,rows:[]};standingsGroups.push(group)}
        if(!group)continue
        for(const id of ids){if(group.rows.some(row=>row.teamId===id)||synthetic(byId.get(id)))continue
          const pending=scheduled.some(row=>[sideId(row,'home'),sideId(row,'away')].includes(id)&&['finished','ongoing'].includes(matchDisplayStatus(row)))
          const value=pending?null:0,profile=byId.get(id)||{}
          group.rows.push({teamId:id,teamName:text(profile.name||profile.teamName)||'球队待定',rank:null,played:value,win:value,draw:value,loss:value,goalDifference:value,points:value,isCurrent:id===teamId})
        }
      }
    }catch(error){standingsState='failed';standingsError='积分榜读取失败，请重试'}
  }
  const ownRanks=standingsGroups.flatMap(group=>group.rows.filter(row=>row.teamId===teamId).map(row=>({...row,total:group.rows.length,groupName:group.groupName})))
  const standing=ownRanks.length===1?ownRanks[0]:null
  return {standingsGroups,standingsState,standingsError,matches,nextMatch:next,summary:{rank:standing?.rank??null,rankTotal:standing?.total??null,played:matches.filter(row=>row.status==='finished').length,points:standing?.points??null},rankLabel:standing?.groupName==='联赛'?'组别排名':'小组排名',scheduleState:matches.length?(next?'scheduled':'completed'):'empty'}
}
module.exports={load,sideId}
