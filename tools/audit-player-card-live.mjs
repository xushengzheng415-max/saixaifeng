import assert from 'node:assert/strict'

const endpoint = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi'
const expectedVersion = process.argv.includes('--v1') ? 'football-player-card-points/1' : 'football-player-card-points/2'
async function request(payload) {
  const response = await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)})
  if (!response.ok) throw new Error('球员榜接口 HTTP ' + response.status)
  const envelope = await response.json()
  const result = typeof envelope.body === 'string' ? JSON.parse(envelope.body) : envelope
  if (!result.success) throw new Error(result.code || result.error || '球员榜接口失败')
  return result.data || {}
}

function integer(value) { return Number.isSafeInteger(value) && value >= 0 }
const data = await request({action:'fanRankings',period:'week'})
const rows = Array.isArray(data.players) ? data.players : []
const summary = {scoreVersion:expectedVersion,players:rows.length,ready:0,pending:0,scoreMismatch:0,tierMismatch:0,missingCareerMetrics:0,legacyAppearanceDifferences:0,legacyGoalDifferences:0,legacyAssistDifferences:0,playersWithSupport:0}
for (const row of rows) {
  if (row.cardPoints == null) {
    summary.pending++
    assert.equal(row.cardTier,null,'待核定球员不得显示卡级')
    continue
  }
  summary.ready++
  const metrics = row.careerMetrics
  if (!metrics) { summary.missingCareerMetrics++; continue }
  for (const field of ['appearances','starts','minutesPlayed','goals']) assert(integer(metrics[field]),'已评分球员的 ' + field + ' 必须完整')
  assert(metrics.starts <= metrics.appearances,'首发不能超过出场')
  if (metrics.assists != null) assert(integer(metrics.assists),'助攻必须为非负整数或未知')
  const base = 2 * metrics.appearances + metrics.starts + Math.floor(metrics.minutesPlayed / 45)
  const careerPoints = base + Math.min(2 * metrics.goals,Math.floor(base / 5))
  let points = careerPoints
  if (expectedVersion.endsWith('/2')) {
    assert(integer(row.supportDrops),'v2 已评分球员须返回有效蜂蜜滴数')
    assert.equal(row.careerPoints,careerPoints,'比赛积分拆分不一致')
    assert.equal(row.supportPoints,Math.floor(row.supportDrops / 10),'蜂蜜折算不一致')
    if (row.supportDrops > 0) summary.playersWithSupport++
    points += row.supportPoints
  }
  const tier = points >= 100 ? 'gold' : points >= 45 ? 'silver' : 'bronze'
  if (row.cardPoints !== points) summary.scoreMismatch++
  if (row.cardTier !== tier) summary.tierMismatch++
  if (integer(row.appearances) && row.appearances !== metrics.appearances) summary.legacyAppearanceDifferences++
  if (integer(row.goals) && row.goals !== metrics.goals) summary.legacyGoalDifferences++
  if (metrics.assists != null && integer(row.assists) && row.assists !== metrics.assists) summary.legacyAssistDifferences++
  assert.equal(row.cardScoreVersion,expectedVersion,'积分规则版本不一致')
}
assert(rows.length > 0,'正式球员榜为空，无法完成对账')
assert.equal(summary.missingCareerMetrics,0,'积分与生涯指标不在同一响应中')
assert.equal(summary.scoreMismatch,0,'积分公式不一致')
assert.equal(summary.tierMismatch,0,'卡片等级门槛不一致')
const test = await request({action:'fanRankings',period:'week',tournamentId:'c1dc89f26a884b2a002042f7385deabe',matchId:'853d22036a93eb3f010a7315786b415d'})
summary.testMatchPlayers = Array.isArray(test.players) ? test.players.length : 0
summary.testMatchTeams = Array.isArray(test.teams) ? test.teams.length : 0
assert.equal(summary.testMatchPlayers,0,'测试赛球员进入正式榜单')
assert.equal(summary.testMatchTeams,0,'测试赛球队进入正式榜单')
console.log(JSON.stringify(summary))
