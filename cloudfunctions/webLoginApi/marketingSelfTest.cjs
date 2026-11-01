'use strict'
const crypto = require('node:crypto')
const COLLECTION = 'marketing_selftest_events'
const CAMPAIGN = 'valuation-20261024'
const EVENTS = new Set(['view','start','complete','share','referral_open','register_intent','register_success','mini_create_intent'])
const PUBLIC_EVENTS = new Set(['view','start','complete','share','referral_open','register_intent','mini_create_intent'])
const COMPETITIONS = new Set(['省级赛事','市级赛事','商业赛事','区县级赛事','没参加过比赛'])
const FORMATS = new Set(['5人制','7人制','8人制','11人制','其他','没参加过正式比赛','没参加过约球'])
const POSITIONS = new Set(['门将','后卫','中场','前锋'])
const SESSION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const dayOf = date => new Date(date.getTime()+8*3600000).toISOString().slice(0,10)
const fail = (code,error) => ({success:false,code,error})

function answersOf(input) {
  const source = input && typeof input === 'object' ? input : {}
  const ageGroup = ['minor','adult'].includes(source.ageGroup) ? source.ageGroup : 'unknown'
  const position = POSITIONS.has(source.position) ? source.position : '未填'
  const rawCompetitions = Array.isArray(source.competitionTypes) ? source.competitionTypes : []
  const competitionTypes = [...new Set(rawCompetitions.filter(value => COMPETITIONS.has(value)))].slice(0,5)
  const matchFormat = FORMATS.has(source.matchFormat) ? source.matchFormat : '未填'
  const friendlyFormat = FORMATS.has(source.friendlyFormat) ? source.friendlyFormat : '未填'
  return {ageGroup,position,competitionTypes,matchFormat,friendlyFormat}
}

async function record(db, params) {
  const event = String(params.eventType || '')
  const sessionId = String(params.sessionId || '')
  if (!PUBLIC_EVENTS.has(event) || !SESSION.test(sessionId)) return fail('SELFTEST_EVENT_INVALID','自测记录格式无效')
  const day = dayOf(new Date())
  const hash = crypto.createHash('sha256').update(`${CAMPAIGN}|${day}|${sessionId}|${event}`).digest('hex').slice(0,40)
  const row = {schemaVersion:'marketing-selftest/1',campaign:CAMPAIGN,day,event,createdAt:new Date(),sessionHash:crypto.createHash('sha256').update(sessionId).digest('hex').slice(0,32)}
  if (event === 'complete') row.answers = answersOf(params.answers)
  await db.collection(COLLECTION).doc(`selftest-${day}-${hash}`).set({data:row})
  return {success:true,accepted:true}
}

function dateRange(params) {
  const today = dayOf(new Date())
  const end = String(params.end || today)
  const start = String(params.start || dayOf(new Date(Date.now()-6*86400000)))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start>end || end>today) return null
  const startTime = Date.parse(start+'T00:00:00Z'),endTime = Date.parse(end+'T00:00:00Z')
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime-startTime>30*86400000) return null
  const days=[]
  for(let at=startTime;at<=endTime;at+=86400000) days.push(dayOf(new Date(at)))
  return days
}

async function summary(db, params) {
  const days=dateRange(params)
  if (!days) return fail('SELFTEST_RANGE_INVALID','请选择不超过31天的日期范围')
  const totals=Object.fromEntries([...EVENTS].map(key=>[key,0]))
  const distributions={competitionTypes:{},matchFormat:{},friendlyFormat:{},position:{},ageGroup:{}}
  const daily=[]
  const inc=(bag,key)=>{bag[key]=(bag[key]||0)+1}
  for(const day of days){
    const counts=Object.fromEntries([...EVENTS].map(key=>[key,0]))
    let offset=0
    while(true){
      if(offset>=5000) return fail('SELFTEST_RANGE_TOO_LARGE','所选日期的数据超过单日读取上限，请缩短日期范围')
      const reply=await db.collection(COLLECTION).where({day}).skip(offset).limit(100).get()
      const rows=reply.data||[]
      for(const row of rows){
        if(row.campaign!==CAMPAIGN || !EVENTS.has(row.event)) continue
        counts[row.event]++;totals[row.event]++
        if(row.event==='complete' && row.answers){
          const answer=answersOf(row.answers)
          for(const type of answer.competitionTypes) inc(distributions.competitionTypes,type)
          for(const field of ['matchFormat','friendlyFormat','position','ageGroup']) inc(distributions[field],answer[field])
        }
      }
      offset+=rows.length
      if(rows.length<100) break
    }
    daily.push({day,counts})
  }
  return {success:true,campaign:CAMPAIGN,range:{start:days[0],end:days.at(-1)},totals,distributions,daily,scope:'匿名自测互动；注册和建队成功数尚未接入'}
}
module.exports={record,summary,answersOf,dateRange}
