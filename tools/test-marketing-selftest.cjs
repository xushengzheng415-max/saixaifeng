'use strict'
const assert=require('node:assert/strict')
const analytics=require('../cloudfunctions/webLoginApi/marketingSelfTest.cjs')
const rows=new Map()
const db={collection(){return{
  doc(id){return{async set({data}){rows.set(id,{...data})}}},
  where(filter){let offset=0,limit=100;return{skip(value){offset=value;return this},limit(value){limit=value;return this},async get(){return{data:[...rows.values()].filter(row=>row.day===filter.day).slice(offset,offset+limit)}}}}
}}}
const sessionId='123e4567-e89b-42d3-a456-426614174000'
;(async()=>{
  assert.equal((await analytics.record(db,{eventType:'view',sessionId})).success,true)
  await analytics.record(db,{eventType:'view',sessionId})
  assert.equal(rows.size,1,'相同会话的重试不应重复计数')
  await analytics.record(db,{eventType:'complete',sessionId,answers:{ageGroup:'adult',position:'中场',competitionTypes:['市级赛事','商业赛事','自造赛事'],matchFormat:'11人制',friendlyFormat:'8人制',phone:'13800000000',height:180}})
  const result=await analytics.summary(db,{})
  assert.equal(result.totals.view,1)
  assert.equal(result.totals.complete,1)
  assert.equal(result.distributions.competitionTypes['市级赛事'],1)
  assert.equal(result.distributions.competitionTypes['商业赛事'],1)
  assert.equal(result.distributions.competitionTypes['自造赛事'],undefined)
  assert.equal(JSON.stringify([...rows.values()]).includes('13800000000'),false)
  assert.equal(JSON.stringify([...rows.values()]).includes('height'),false)
  assert.equal((await analytics.record(db,{eventType:'admin_read',sessionId})).code,'SELFTEST_EVENT_INVALID')
  console.log('身价自测匿名事件去重、脱敏与汇总检查通过')
})().catch(error=>{console.error(error);process.exitCode=1})
