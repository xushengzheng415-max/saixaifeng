const assert = require('node:assert/strict')
const { applyPlayerCardScores, officialMatchIds } = require('../cloudfunctions/webLoginApi/fanPlayerCardScores.cjs')

async function main() {
  const ids = Array.from({ length:20 }, (_,i) => 'm' + i)
  const row = { playerId:'real', observed:{ appearances:20,starts:20,minutesPlayed:1800,goals:0 }, coverage:{ appearances:'complete',starts:'complete',minutesPlayed:'complete',goals:'complete' }, matchIds:ids, startMatchIds:ids }
  const players = [{playerId:'real',cardTier:'bronze'},{playerId:'',cardTier:'gold'},{playerId:'test',cardTier:'gold'}]
  const career = { players:[row], metricVersion:'football-metrics/4', dataVersion:'sample', coverage:{cardScoreScopeComplete:true} }
  await applyPlayerCardScores(players,career,new Map())
  assert.equal(players[0].cardTier,'gold')
  assert.equal(players[0].cardPoints,100)
  assert.equal(players[0].careerPoints,100)
  assert.equal(players[0].supportPoints,0)
  assert.equal(players[0].careerMetrics.appearances,20)
  assert.equal(players[0].careerMetrics.minutesPlayed,1800)
  assert.equal(players[1].cardTier,null)
  assert.equal(players[2].cardTier,null)
  assert.deepEqual([...officialMatchIds({teams:[{matchIds:['real-match']},{matchIds:['real-match']} ]})],['real-match'])
  assert.equal(officialMatchIds({teams:[]}).has('test-match'),false)
  await applyPlayerCardScores(players,{...career,coverage:{cardScoreScopeComplete:false}},new Map())
  assert.equal(players[0].cardTier,null)
  assert.equal(players[0].careerMetrics,null)
  const oneMatch = { ...row, observed:{appearances:1,starts:0,minutesPlayed:0,goals:0,assists:0}, matchIds:['one'],startMatchIds:[] }
  const one = [{playerId:'real',appearances:0,cardPoints:null}]
  await applyPlayerCardScores(one,{...career,players:[oneMatch]},new Map())
  assert.equal(one[0].cardPoints,2)
  assert.equal(one[0].careerMetrics.appearances,1)
  await applyPlayerCardScores(one,{...career,players:[oneMatch]},new Map([['real',{drops:430,status:'complete',dataVersion:'supports'}]]))
  assert.equal(one[0].careerPoints,2)
  assert.equal(one[0].supportPoints,43)
  assert.equal(one[0].cardPoints,45)
  assert.equal(one[0].cardTier,'silver')
  console.log('PASS: 公开球员榜使用生涯积分，缺 ID、测试及范围不完整不伪造等级')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
