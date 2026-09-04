'use strict'

const assert = require('assert')
const Module = require('module')

const originalLoad = Module._load
Module._load = function(request, parent, isMain) {
  if (request === 'wx-server-sdk') {
    return {
      DYNAMIC_CURRENT_ENV: 'test',
      init() {},
      database() {
        return {
          command: {},
          serverDate() { return 'SERVER_DATE' }
        }
      }
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const generator = require('../cloudfunctions/generateSchedule/index').__test
const scheduler = require('../cloudfunctions/generateSchedule/scheduler')
Module._load = originalLoad

function teams(count, prefix) {
  return Array.from({ length: count }, (_, index) => ({
    teamId: `${prefix}${index + 1}`,
    teamName: `${prefix}队${index + 1}`
  }))
}

function groups(groupCount, teamCount) {
  return Array.from({ length: groupCount }, (_, groupIndex) => ({
    groupName: `${String.fromCharCode(65 + groupIndex)}组`,
    teams: teams(teamCount, `G${groupIndex + 1}-`)
  }))
}

function occupiedKey(match) {
  return `${match.matchDate}|${match.matchTime}|${match.venue}`
}
function matchStart(match) { return new Date(`${match.matchDate}T${match.matchTime}:00`).getTime() }

function reserveGenerated(matches, occupied) {
  matches.forEach(match => {
    if (!match.isBye && match.matchDate && match.matchTime && match.venue) occupied.add(occupiedKey(match))
  })
}

function assertNoDuplicatePair(matches) {
  const pairs = new Set()
  matches.forEach(match => {
    if (!match.homeTeamId || !match.awayTeamId) return
    const key = [match.homeTeamId, match.awayTeamId].sort().join('|')
    assert(!pairs.has(key), `重复对阵：${key}`)
    pairs.add(key)
  })
}

const config = {
  startDate: '2026-09-01',
  endDate: '2026-12-31',
  venueResources: [
    { name:'1号场',fieldFormat:'5side',sessionWindows:[{ key:'morning',enabled:true,start:'09:00',end:'12:00' },{ key:'afternoon',enabled:true,start:'14:00',end:'17:00' },{ key:'evening',enabled:false,start:'18:00',end:'21:00' }] },
    { name:'2号场',fieldFormat:'5side',sessionWindows:[{ key:'morning',enabled:true,start:'08:00',end:'12:00' },{ key:'afternoon',enabled:true,start:'13:00',end:'17:00' },{ key:'evening',enabled:true,start:'18:00',end:'21:00' }] },
    { name:'8人制场',fieldFormat:'8side',sessionWindows:[{ key:'morning',enabled:true,start:'09:00',end:'12:00' },{ key:'afternoon',enabled:true,start:'14:00',end:'17:00' }] },
    { name:'11人制场',fieldFormat:'11side',sessionWindows:[{ key:'morning',enabled:true,start:'09:00',end:'12:00' },{ key:'afternoon',enabled:true,start:'14:00',end:'17:00' }] },
    { name:'7人制场',fieldFormat:'7side',sessionWindows:[{ key:'morning',enabled:true,start:'09:00',end:'12:00' }] }
  ],
  matchFormat:'5side',
  slotMinutes: 60,
  matchDuration: 35,
  matchInterval: 25,
  restMinutes: 90,
  maxDailyOne: false,
  maxPerSession: 1
}
const occupied = new Set()

const u12Groups = groups(4, 4)
const u12 = generator.generateTournamentSchedule('event', u12Groups, {
  fullRankingEnabled: true,
  advanceCount: 2,
  hasThirdPlace: true
}, config, occupied)
assert.strictEqual(u12.length, 40, 'U12杯赛制应为24场小组赛+16场全排名')
assert.strictEqual(u12.filter(match => match.phase === 'group').length, 24)
assert.strictEqual(u12.filter(match => match.phase !== 'group').length, 16)
u12Groups.flatMap(group => group.teams).forEach(team => {
  assert.strictEqual(u12.filter(match => match.phase === 'group' && [match.homeTeamId,match.awayTeamId].includes(team.teamId)).length,3,`${team.teamId}小组赛应为3场`)
})
reserveGenerated(u12,occupied)

const u8Teams = teams(16, 'U8-')
const u8 = generator.generateCupSchedule('event',u8Teams,{
  fullRankingEnabled:true,
  cupMode:'single',
  bracketSize:16
},config,occupied)
assert.strictEqual(u8.length,32,'U8赛会制16队全排名应为32场')
assert.strictEqual(u8.filter(match => match.finalRankHigh).length,8,'U8应产生1—16全部名次线')
reserveGenerated(u8,occupied)

const u10Teams = teams(8,'U10-')
const u10 = generator.generateLeagueSchedule('event',u10Teams.map((team,index) => ({ rank:index+1,team })),{ loopType:'single' },config,occupied)
assert.strictEqual(u10.length,28,'U10联赛制8队单循环应为28场')
assert.strictEqual(new Set(u10.map(match => match.round)).size,7,'U10应为7轮')
u10Teams.forEach(team => assert.strictEqual(u10.filter(match => [match.homeTeamId,match.awayTeamId].includes(team.teamId)).length,7,`${team.teamId}应比赛7场`))
assertNoDuplicatePair(u10)
reserveGenerated(u10,occupied)

const allMatches = [...u12,...u8,...u10]
assert.strictEqual(allMatches.length,100,'三个组别总场数应为100')
const occupiedReadback = new Set()
allMatches.forEach(match => {
  assert(match.matchDate && match.matchTime && match.venue,`场序${match.matchNo || match.matchIndex}未完成排程`)
  const key = occupiedKey(match)
  assert(!occupiedReadback.has(key),`跨组别场地时段冲突：${key}`)
  occupiedReadback.add(key)
})
const resourceLookup = new Map(config.venueResources.map(resource => [resource.name,resource]))
allMatches.forEach(match => {
  assert(/:00$/.test(match.matchTime),`开赛时间不是系统生成的整点时隙：${match.matchTime}`)
  const resource=resourceLookup.get(match.venue)
  assert(resource,`使用了未配置场地：${match.venue}`)
  const session=(resource.sessionWindows || []).find(window => window.enabled && scheduler.sessionName(match.matchTime,resource.sessionWindows)===window.key)
  assert(session,`${match.venue} ${match.matchTime}不属于已启用阶段`)
  assert(new Date(`2000-01-01T${match.matchTime}:00`).getTime()+60*60000<=new Date(`2000-01-01T${session.end}:00`).getTime(),`${match.venue} ${match.matchTime}跨越${session.key}结束时间`)
})
const u10SessionUse=new Set()
u10.forEach(match => [match.homeTeamId,match.awayTeamId].filter(Boolean).forEach(teamId => {
  const resource=resourceLookup.get(match.venue)
  const session=scheduler.sessionName(match.matchTime,resource.sessionWindows)
  const key=`${teamId}|${match.matchDate}|${session}`
  assert(!u10SessionUse.has(key),`${teamId}在${match.matchDate}${session}重复比赛`)
  u10SessionUse.add(key)
}))

assert.deepStrictEqual(scheduler.buildTimeSlots({ slotMinutes:60,sessionWindows:config.venueResources[0].sessionWindows }),['09:00','10:00','11:00','14:00','15:00','16:00'])
assert.strictEqual(scheduler.buildVenueSlots(config).filter(slot => slot.venue==='2号场' && slot.session==='evening').length,3)
const normalizedTiming=generator.normalizeScheduleTiming(config,{ matchMinutes:35,matchFormat:'5side' })
assert.strictEqual(normalizedTiming.config.matchDuration,35)
assert.strictEqual(normalizedTiming.config.matchInterval,25)
assert.strictEqual(normalizedTiming.config.slotMinutes,60)
assert.strictEqual(normalizedTiming.config.maxDailyOne,false)
assert.strictEqual(normalizedTiming.config.maxPerSession,1)
assert.strictEqual(generator.normalizeScheduleTiming(config,{ matchMinutes:65,matchFormat:'5side' }).code,'MATCH_DURATION_EXCEEDS_SLOT')

const jointU12=generator.generateTournamentSchedule('event',u12Groups,{ fullRankingEnabled:true,advanceCount:2,hasThirdPlace:true },{},new Set())
const jointU8=generator.generateCupSchedule('event',u8Teams,{ fullRankingEnabled:true,cupMode:'single',bracketSize:16 },{},new Set())
const jointU10=generator.generateLeagueSchedule('event',u10Teams.map((team,index) => ({ rank:index+1,team })),{ loopType:'single' },{},new Set())
function prepareJoint(matches,divisionId,durationMinutes,matchFormat) { matches.forEach(match => { match.divisionId=divisionId;match.matchFormat=matchFormat;match.requiredVenueFormat=matchFormat;match.durationMinutes=durationMinutes;match.bufferMinutes=60-durationMinutes;delete match.matchDate;delete match.matchTime;delete match.venue }) }
prepareJoint(jointU12,'u12',40,'5side')
prepareJoint(jointU8,'u8',35,'8side')
prepareJoint(jointU10,'u10',50,'11side')
const jointMatches=[...jointU12,...jointU8,...jointU10]
const jointResult=scheduler.assign(jointMatches,config,new Set())
assert.strictEqual(jointResult.assigned,100)
assert.strictEqual(jointResult.unassigned,0)
const jointSlots=new Set()
jointMatches.forEach(match => { const key=occupiedKey(match);assert(!jointSlots.has(key),`联合编排场地冲突：${key}`);jointSlots.add(key) })
const simultaneous=new Map()
const venueDivisions=new Map()
jointMatches.forEach(match => {
  const timeKey=`${match.matchDate}|${match.matchTime}`
  if (!simultaneous.has(timeKey)) simultaneous.set(timeKey,new Set())
  simultaneous.get(timeKey).add(match.divisionId)
  if (!venueDivisions.has(match.venue)) venueDivisions.set(match.venue,new Set())
  venueDivisions.get(match.venue).add(match.divisionId)
  ;(match.dependencyMatchNos || []).forEach(no => {
    const dependency=jointMatches.find(item => item.divisionId===match.divisionId && Number(item.matchNo || item.matchIndex)===Number(no))
    assert(dependency && dependency.matchDate,`${match.divisionId}场序${match.matchNo}缺少本组前置场序${no}`)
    assert(matchStart(match)>matchStart(dependency),`${match.divisionId}场序${match.matchNo}早于前置场序${no}`)
  })
})
assert([...simultaneous.values()].some(divisions => divisions.size>1),'未实现不同组别同时占用不同场地')
jointMatches.forEach(match => assert.strictEqual(resourceLookup.get(match.venue).fieldFormat,match.matchFormat,`${match.divisionId}被排入不兼容场地${match.venue}`))
;['u12','u8'].forEach(divisionId => {
  const scoped=jointMatches.filter(match=>match.divisionId===divisionId)
  const stages=[...new Set(scoped.map(scheduler.schedulingPriority))].sort((a,b)=>a-b)
  stages.forEach((stage,index)=>{if(index===0)return;const prior=scoped.filter(match=>scheduler.schedulingPriority(match)<stage);const current=scoped.filter(match=>scheduler.schedulingPriority(match)===stage);const latestPrior=Math.max(...prior.map(match=>matchStart(match)+Number(match.durationMinutes || 0)*60000));const earliestCurrent=Math.min(...current.map(matchStart));assert(earliestCurrent>=latestPrior,`${divisionId}第${index+1}阶段早于前一赛段结束`)})
  assert(scoped.every(match=>Number(match.scheduleStageOrder)>0 && /^第.+阶段$/.test(match.scheduleStageName)),`${divisionId}缺少阶段编号`)
  const finals=scoped.filter(match=>/半决赛|^决赛$|三、四名决赛|三四名决赛/.test(String(match.roundName || '')))
  if(finals.length) assert.strictEqual(new Set(finals.map(match=>match.scheduleStageOrder)).size,1,`${divisionId}半决赛、三四名决赛和决赛未归入同一决赛阶段`)
})

const fiveA=generator.generateLeagueSchedule('event',teams(4,'FA-').map((team,index) => ({ rank:index+1,team })),{ loopType:'single' },{},new Set())
const fiveB=generator.generateLeagueSchedule('event',teams(4,'FB-').map((team,index) => ({ rank:index+1,team })),{ loopType:'single' },{},new Set())
prepareJoint(fiveA,'five-a',35,'5side');prepareJoint(fiveB,'five-b',35,'5side')
const fiveMix=[...fiveA,...fiveB]
const fiveMixResult=scheduler.assign(fiveMix,config,new Set())
assert.strictEqual(fiveMixResult.unassigned,0)
assert(fiveMix.every(match => ['1号场','2号场'].includes(match.venue)),'5人制比赛进入了非5人制场地')
const fiveVenueMix=new Map();fiveMix.forEach(match => { if(!fiveVenueMix.has(match.venue))fiveVenueMix.set(match.venue,new Set());fiveVenueMix.get(match.venue).add(match.divisionId) })
assert([...fiveVenueMix.values()].some(divisions => divisions.size===2),'两块5人制场地未混编多个5人制组别')
const priorityConfig={ ...config,startDate:'2026-09-01',endDate:'2026-09-01',matchDays:['周二'],venueResources:[1,2,3].map(number=>({ name:`${number}号场地`,fieldFormat:'5side',sessionWindows:[{ key:'morning',enabled:true,start:'09:00',end:'10:00' }] })) }
const priorityMatches=[{ divisionId:'priority',matchNo:1,matchIndex:1,matchFormat:'5side',requiredVenueFormat:'5side',homeTeamId:'P1',awayTeamId:'P2',status:'scheduled' },{ divisionId:'priority',matchNo:2,matchIndex:2,matchFormat:'5side',requiredVenueFormat:'5side',homeTeamId:'P3',awayTeamId:'P4',status:'scheduled' }]
const priorityResult=scheduler.assign(priorityMatches,priorityConfig,new Set())
assert.strictEqual(priorityResult.unassigned,0)
assert.deepStrictEqual(priorityMatches.map(match=>match.venue),['1号场地','2号场地'],'场次较少时没有按1号、2号、3号顺序优先填充')
const incompatible=[{ divisionId:'five-only',matchNo:1,matchIndex:1,matchFormat:'5side',requiredVenueFormat:'5side',homeTeamId:'X',awayTeamId:'Y',homeTeamName:'X',awayTeamName:'Y',durationMinutes:35,bufferMinutes:25,status:'scheduled' }]
const sevenOnlyConfig={ ...config,venueResources:config.venueResources.filter(resource => resource.fieldFormat==='7side') }
const incompatibleResult=scheduler.assign(incompatible,sevenOnlyConfig,new Set())
assert.strictEqual(incompatibleResult.unassigned,1)
assert(incompatibleResult.reasons.some(reason => reason.includes('没有兼容5人制场地')))
const sanitizedDraft=generator.sanitizeScheduleDraft({ startDate:'2026-09-01',endDate:'2026-09-03',matchDays:['周一','非法'],venueResources:[{ name:'5人制1号场',fieldFormat:'5side',sessionWindows:[{ key:'morning',enabled:true,start:'09:00',end:'12:00' }] },{ name:'错误10人制场',fieldFormat:'10side',sessionWindows:[] }],secret:'drop-me' })
assert.deepStrictEqual(sanitizedDraft.matchDays,['周一'])
assert.strictEqual(sanitizedDraft.venueResources.length,1)
assert.strictEqual(sanitizedDraft.venueResources[0].fieldFormat,'5side')
assert.strictEqual(Object.prototype.hasOwnProperty.call(sanitizedDraft,'secret'),false)

const expectedIds = u10Teams.map(team => team.teamId)
assert.strictEqual(generator.validateParticipantSet(u10Teams,expectedIds,8).valid,true)
assert.strictEqual(generator.validateParticipantSet([...u10Teams,u10Teams[0]],expectedIds,8).code,'DRAW_TEAM_DUPLICATED')
assert.strictEqual(generator.validateParticipantSet(u10Teams.slice(0,7),expectedIds.slice(0,7),8).code,'DRAW_TEAM_COUNT_MISMATCH')
assert.strictEqual(generator.validateParticipantSet(u10Teams,expectedIds.slice(0,7).concat('UNKNOWN'),8).code,'DRAW_TEAM_NOT_APPROVED')

console.log(JSON.stringify({
  passed:true,
  u12:{ teams:16,groupMatches:24,placementMatches:16,total:40,matchesPerTeam:5 },
  u8:{ teams:16,total:32,matchesPerTeam:4,ranking:'1-16' },
  u10:{ teams:8,rounds:7,total:28,matchesPerTeam:7 },
  totalMatches:100,
  uniqueVenueTimeSlots:occupiedReadback.size,
  jointScheduling:{ assigned:jointResult.assigned,crossDivisionSimultaneous:true,strictFieldFormat:true,sameFormatMixed:true },
  venuePriority:priorityMatches.map(match=>match.venue)
},null,2))
