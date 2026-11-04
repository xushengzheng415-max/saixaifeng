'use strict'

// Shared by the server and the isolated demo repository. This builds fixtures,
// never calendar assignments. Numbering belongs to a competition division.
const templates = require('./pairingTemplates')
const topology = require('./topology')
const VERSION = 'confirmed-draw-v1'
function formatOf(division) {
  const value = String(division.formatType || division.tournamentType || '')
  return ({cup:'groups',tournament:'knockout',knockout:'knockout',league:'league',hybrid:'hybrid'})[value] || ''
}
function confirmed(record) { return record && (record.status === 'published' || record.status === 'confirmed' && Boolean(record.confirmedAt)) }
function latest(records) { const stamp=row=>new Date(row.confirmedAt || row.updateTime || row.createTime || 0).getTime() || 0;return [...records].sort((a,b)=>stamp(b)-stamp(a))[0] }
function team(value) { return value && {teamId:String(value.teamId || value.id || ''),teamName:String(value.teamName || value.name || '')} }
function isTeam(value) { return value && value.teamId && !value.bye && !String(value.teamId).startsWith('bye-') }
function rankingMode(division) {
  const mode=String(division.finalRankingMode || division.rankingScope || '')
  return ['champion','top4','full'].includes(mode) ? mode : division.fullRankingEnabled === true ? 'full' : division.thirdPlaceEnabled === false ? 'champion' : 'top4'
}
function seedOrder(size) { let order=[1,2];while(order.length<size){const sum=order.length*2+1;order=order.flatMap(n=>[n,sum-n])}return order }
function eliminationStages(sources, thirdPlace) {
  let current=[...sources],round=1,serial=0,semis=[]
  const stages=[]
  while(current.length>1) {
    const count=current.length,entries=[],next=[]
    for(let i=0;i<count;i+=2) {
      const home=current[i],away=current[i+1]
      if(!home || !away){next.push(home || away || null);continue}
      const code=`K${++serial}`
      entries.push({code,home,away,round})
      next.push({type:'match_winner',matchCode:code})
      if(count===4)semis.push({type:'match_loser',matchCode:code})
    }
    if(count===2 && entries.length && thirdPlace && semis.length===2) {
      // 三四名赛与决赛同轮，场序排在决赛之前：决赛永远是最后一场。
      stages.push({name:'决赛',phase:'knockout',round,stageOrder:round,matches:[
        {code:'P34',home:semis[0],away:semis[1],phase:'placement',roundName:'三四名赛',rankRange:'3-4名',stageName:'决赛与排位阶段',stageOrder:round},
        {code:entries[0].code,home:entries[0].home,away:entries[0].away,phase:'knockout',roundName:'决赛',rankRange:'1-2名',stageName:'决赛与排位阶段',stageOrder:round}
      ]})
    } else if(entries.length) {
      stages.push({name:count===2?'决赛':count===4?'半决赛':count===8?'1/4决赛':`1/${count/2}决赛`,phase:'knockout',round,stageOrder:round,matches:entries})
    }
    current=next;round++
  }
  return stages
}
function buildConfirmedPairings({tournamentId,division,groupRecords=[],bracketRecords=[],leagueRecords=[],template=null}) {
  const divisionId=String(division._id || division.id || ''),divisionName=division.name || division.divisionName || ''
  const scope=row=>String(row.divisionId || 'default')===divisionId && !row.scheduleType && row.status!=='archived'
  const format=formatOf(division),mode=rankingMode(division)
  let participants=[],matches=[],groups=[]
  const build=stages=>templates.buildPairingsFromTemplate(tournamentId,divisionId,divisionName,groups,{version:VERSION,source:'confirmed_draw',stages}).matches
  if(format==='groups') {
    const records=groupRecords.filter(scope)
    if(!records.length || !records.every(confirmed))throw new Error(`${divisionName}分组尚未确认`)
    const summary=latest(records.filter(row=>Array.isArray(row.groups) && row.groups.length))
    groups=summary ? summary.groups : records.filter(row=>row.groupName || row.groupCode).map(row=>({groupName:row.groupName || `${row.groupCode}组`,groupCode:row.groupCode,teams:row.teams || []}))
    groups=groups.map(group=>({...group,teams:(group.teams || []).filter(isTeam).map(team)})).sort((a,b)=>String(a.groupName || a.name).localeCompare(String(b.groupName || b.name)))
    if(groups.some(group=>group.teams.length<2))throw new Error('部分小组不足两支球队，请先核对分组')
    participants=groups.flatMap(group=>group.teams)
    if(template) {
      const built=templates.buildPairingsFromTemplate(tournamentId,divisionId,divisionName,groups,template)
      if(built.error)throw new Error(built.error)
      matches=built.matches
    } else {
      const rr=templates.standardRoundRobinTemplate({groupSizes:groups.map(group=>group.teams.length),loopType:division.loopType || 'single'})
      // Group templates use A/B/... codes; preserve the confirmed names for sources.
      matches=templates.buildPairingsFromTemplate(tournamentId,divisionId,divisionName,groups,rr).matches
      if(mode==='full') {
        const ranked=groups.length===2 ? topology.twoGroupKnockout(tournamentId,groups,{divisionId,divisionName,startMatchNo:matches.length}) : topology.multiGroupRanking(tournamentId,groups,{divisionId,divisionName,startMatchNo:matches.length})
        if(!ranked.complete)throw new Error((ranked.warnings || []).join('；'))
        matches.push(...ranked.matches)
      } else {
        const advance=Number(division.advancePerGroup || division.advanceCount || 2)
        if(!Number.isInteger(advance) || advance<1)throw new Error('晋级名额设置无效，请先核对竞赛规则')
        if(groups.length<2 || groups.length%2!==0)throw new Error('小组数量无法生成交叉淘汰，请先确认对阵模板')
        const source=(group,rank)=>{
          if(rank<1 || rank>group.teams.length)throw new Error('晋级名额超过小组球队数')
          return {type:'group_rank',groupName:group.groupName || group.name,rank}
        }
        // 相邻两组交叉对位：A组第1 对 B组第2、B组第1 对 A组第2（C/D 组同理），
        // 同组球队淘汰赛首轮回避，小组第一只有在决赛/半决赛才会相遇。
        // 场序按「同一名次段、各组交叉」展开，保证同半区来自不同小组、决赛放在最后。
        const pairs=[]
        for(let index=0;index<groups.length;index+=2)pairs.push([groups[index],groups[index+1]])
        const sources=[]
        for(let step=0;step<Math.floor(advance/2);step+=1) {
          const high=step+1,low=advance-step
          for(const pair of pairs)sources.push(source(pair[0],high),source(pair[1],low))
          for(const pair of pairs)sources.push(source(pair[1],high),source(pair[0],low))
        }
        if(advance%2===1) {
          const middle=(advance+1)/2
          for(const pair of pairs)sources.push(source(pair[0],middle),source(pair[1],middle))
        }
        if(sources.length<2 || (sources.length & (sources.length-1)))throw new Error('请先确认非标准晋级名额的对阵模板')
        const offset=matches.length,extra=build(eliminationStages(sources,mode==='top4'))
        for(const match of extra) {
          match.matchNo+=offset;match.matchIndex=match.matchNo
          for(const side of ['home','away'])if(['match_winner','match_loser'].includes(match[`${side}Source`]?.type)){match[`${side}Source`].matchNo+=offset;match[`${side}SourceLabel`]=templates.sourceLabel(match[`${side}Source`]);match[`${side}TeamName`]=match[`${side}SourceLabel`]}
          match.dependencyMatchNos=(match.dependencyMatchNos || []).map(n=>n+offset)
        }
        matches.push(...extra)
      }
    }
  } else if(format==='league' || format==='hybrid') {
    const record=latest(leagueRecords.filter(scope))
    if(!confirmed(record))throw new Error(`${divisionName}联赛顺序尚未确认`)
    participants=(record.teams || []).filter(isTeam).sort((a,b)=>Number(a.position || a.rank || 0)-Number(b.position || b.rank || 0)).map(team)
    const stages=templates.standardRoundRobinRounds(participants.length,record.loopType || division.loopType || 'single',record.leaguePairingMode || division.leaguePairingMode).map((pairs,index)=>({name:`联赛第${index+1}轮`,phase:'league',round:index+1,matches:pairs.map(([a,b])=>({home:{type:'seed',...participants[a-1],name:participants[a-1].teamName},away:{type:'seed',...participants[b-1],name:participants[b-1].teamName}}))}))
    if(format==='hybrid') {
      const count=Number(record.advanceCount || division.advanceCount || division.formatConfig?.cupAdvanceCount || 0)
      if(count<2 || count>participants.length || (count & (count-1)))throw new Error('请先确认混合制晋级名额')
      stages.push(...eliminationStages(seedOrder(count).map(rank=>({type:'group_rank',groupName:'联赛',rank})),mode==='top4'))
    }
    matches=build(stages)
  } else if(format==='knockout') {
    const record=latest(bracketRecords.filter(scope).filter(row=>Number(row.round || 1)===1))
    if(!confirmed(record))throw new Error(`${divisionName}淘汰赛签位尚未确认`)
    const raw=record.slots?.length ? record.slots : (record.matches || []).flatMap(item=>[item.slot1,item.slot2])
    const slots=raw.map(value=>isTeam(value)?team(value):null)
    participants=slots.filter(Boolean)
    const capacity=Number(record.capacity || record.bracketSize || slots.length)
    if(capacity<2 || capacity>128 || (capacity & (capacity-1)) || slots.length!==capacity)throw new Error('淘汰赛签位不完整，请重新核对')
    if(mode==='full') {
      if(participants.length!==capacity)throw new Error('全名次排位存在轮空，请先确认排位规则')
      const ranked=topology.fullRankingKnockout(tournamentId,participants,{divisionId,divisionName})
      if(!ranked.complete)throw new Error(ranked.warnings.join('；'))
      matches=ranked.matches
    } else matches=build(eliminationStages(slots.map(value=>value?{type:'seed',...value,name:value.teamName}:null),mode==='top4'))
  } else throw new Error('当前赛制未配置可生成的对阵规则')
  const ids=participants.map(value=>value.teamId)
  if(ids.length<2 || new Set(ids).size!==ids.length)throw new Error('抽签球队不足或重复，请核对抽签结果')
  if(!matches.length)throw new Error('没有可生成的比赛，请核对竞赛方案')
  const numbers=new Set()
  matches.forEach((match,index)=>{
    const number=Number(match.matchNo || match.matchIndex || index+1)
    if(numbers.has(number) || number!==index+1)throw new Error('对阵模板场序不连续，请核对模板')
    numbers.add(number)
    Object.assign(match,{tournamentId,divisionId,divisionName,scheduleType:({groups:'tournament',knockout:'cup',league:'league',hybrid:'combined'})[format],matchNo:number,matchIndex:number,groupName:match.group || match.pool || '',matchDate:'',matchTime:'',venue:'',date:'',startTime:'',timeSlot:'',scheduleStatus:'unassigned',scheduleGenerated:false,schedulePublished:false,pairingStatus:'confirmed',pairingGenerationSource:VERSION,matchFormat:division.matchFormat || '',homeScore:null,awayScore:null})
    for(const side of ['home','away']) {
      const source=match[`${side}Source`]
      if(source?.type==='group_rank') {
        const group=groups.find(group=>String(group.groupName || group.name)===String(source.groupName))
        source.possibleTeamIds=(group?.teams || participants).map(team=>team.teamId)
        const preceding=matches.filter(candidate=>Number(candidate.matchNo || candidate.matchIndex)<number && (source.groupName==='联赛' ? candidate.phase==='league' : candidate.phase==='group' && String(candidate.group || candidate.pool || '')===String(source.groupName)))
        match.dependencyMatchNos=[...new Set([...(match.dependencyMatchNos || []),...preceding.map(candidate=>Number(candidate.matchNo || candidate.matchIndex))])]
      }
      if(['match_winner','match_loser'].includes(source?.type) && (!source.matchNo || source.matchNo>=number))throw new Error('晋级来源场序无效，请核对模板')
      if(source && ['match_winner','match_loser'].includes(source.type))match.dependencyMatchNos=[...new Set([...(match.dependencyMatchNos || []),source.matchNo])]
    }
  })
  return {matches,participants,version:VERSION,format}
}
module.exports = { buildConfirmedPairings, formatOf }
