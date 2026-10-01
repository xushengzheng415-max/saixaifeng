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
  assert.equal(players[1].cardTier,null)
  assert.equal(players[2].cardTier,null)
  assert.deepEqual([...officialMatchIds({teams:[{matchIds:['real-match']},{matchIds:['real-match']} ]})],['real-match'])
  assert.equal(officialMatchIds({teams:[]}).has('test-match'),false)
  await applyPlayerCardScores(players,{...career,coverage:{cardScoreScopeComplete:false}},new Map())
  assert.equal(players[0].cardTier,null)
  console.log('PASS: 公开球员榜使用生涯积分，缺 ID、测试及范围不完整不伪造等级')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
