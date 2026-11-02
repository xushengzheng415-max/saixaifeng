// 球员卡玩法（送出/收集/阵容/PK）服务端逻辑测试。
// 复用 test-player-card-workflows.cjs 的 fake db；真实云函数写入由部署后读回验证。
const assert = require('node:assert/strict')
const h = require('./test-player-card-workflows.cjs')
const service = require('../cloudfunctions/webLoginApi/data-center/service.cjs')
const game = require('../cloudfunctions/webLoginApi/playerCardGame.cjs')

const createService = service.createDataService
const grades = new Map()
service.createDataService = () => ({
  playerCardForAuthorizedPlayer: async id => grades.get(id) || { status: 'unverified' },
  playerCardsForAuthorizedPlayers: async ids => new Map(ids.map(id => [id, grades.get(id) || { status: 'unverified' }]))
})
const hashSessionToken = token => 'hash:' + token
const dateValue = value => value instanceof Date ? value.getTime() : new Date(value).getTime()
const cloud = { database: () => h.db, getTempFileURL: async ({ fileList }) => ({ fileList: fileList.map(fileID => ({ fileID, tempFileURL: 'https://fixture/' + fileID })) }) }
const handle = game.createPlayerCardGame({ cloud, hashSessionToken, dateValue })

function session(openId) {
  h.table('fan_h5_sessions').set('sess-' + openId, { _id: 'sess-' + openId, tokenHash: 'hash:token-' + openId, serviceAccountOpenId: openId, active: true, expiresAt: new Date(Date.now() + 3600e3) })
  return { fanSessionToken: 'token-' + openId }
}
function own(openId, userId, playerId, registrantType) {
  h.table('parent_profile_submissions').set('sub-' + openId + '-' + playerId, { _id: 'sub-' + openId + '-' + playerId, serviceAccountOpenId: openId, status: 'submitted', playerId, registrantUserId: userId, registrantType: registrantType || 'guardian' })
}
const call = (action, data, token) => handle(Object.assign({ action }, data, token))

async function run() {
  h.tables.clear(); grades.clear()
  h.table('teams').set('team', { _id: 'team', name: '星火青训' })
  h.table('players').set('p1', { _id: 'p1', name: '球员甲', teamId: 'team', guardianUserId: 'u1', jerseyNumber: '10' })
  h.table('players').set('p2', { _id: 'p2', name: '球员乙', teamId: 'team', guardianUserId: 'u2', jerseyNumber: '7' })
  for (const [id, name] of [['p3', '球员丙'], ['p4', '球员丁'], ['p5', '球员戊'], ['p6', '球员己']]) h.table('players').set(id, { _id: id, name, teamId: 'team', guardianUserId: 'u1' })
  for (const [id, name] of [['p7', '球员庚'], ['p8', '球员辛'], ['p9', '球员壬'], ['p10', '球员癸']]) h.table('players').set(id, { _id: id, name, teamId: 'team', guardianUserId: 'u2' })
  h.table('players').set('ptest', { _id: 'ptest', name: '虚拟球员', teamId: 'team', guardianUserId: 'u1', synthetic: true })
  h.table('fan_profiles').set('fp-op2', { _id: 'fp-op2', serviceAccountOpenId: 'op2', nickname: '收集者' })
  h.table('fan_profiles').set('fp-op3', { _id: 'fp-op3', serviceAccountOpenId: 'op3', nickname: '对手教练' })
  grades.set('p1', { status: 'ready', tier: 'bronze', points: 20, dataVersion: 'v-p1' })
  grades.set('p2', { status: 'ready', tier: 'silver', points: 50, dataVersion: 'v-p2' })
  for (const [id, points] of [['p3', 5], ['p4', 6], ['p5', 7], ['p6', 8]]) grades.set(id, { status: 'ready', tier: 'bronze', points, dataVersion: 'v-' + id })
  for (const id of ['p7', 'p8', 'p9', 'p10']) grades.set(id, { status: 'ready', tier: 'silver', points: 10, dataVersion: 'v-' + id })
  own('op1', 'u1', 'p1'); own('op3', 'u2', 'p2'); own('op1', 'u1', 'ptest')
  for (const id of ['p3', 'p4', 'p5', 'p6']) own('op1', 'u1', id)
  for (const id of ['p7', 'p8', 'p9', 'p10']) own('op3', 'u2', id)
  const op1 = session('op1'), op2 = session('op2'), op3 = session('op3')

  // 鉴权：无会话拒绝
  assert.equal((await call('getPlayerCardGameHome', {}, { fanSessionToken: 'none' })).code, 'PLAYER_CARD_AUTH_REQUIRED')

  // 送出：无权 / 待核定 / 正常 / 幂等
  assert.equal((await call('publishPlayerCardShare', { playerId: 'p2' }, op1)).code, 'PLAYER_CARD_GAME_FORBIDDEN')
  grades.set('ptest', { status: 'unverified' })
  assert.equal((await call('publishPlayerCardShare', { playerId: 'ptest' }, op1)).code, 'PLAYER_CARD_GAME_FORBIDDEN', '测试资料不能送出')
  grades.set('p1', { status: 'unverified' })
  assert.equal((await call('publishPlayerCardShare', { playerId: 'p1' }, op1)).code, 'PLAYER_CARD_GAME_SCORE_PENDING')
  grades.set('p1', { status: 'ready', tier: 'bronze', points: 20, dataVersion: 'v-p1' })
  const published = await call('publishPlayerCardShare', { playerId: 'p1' }, op1)
  assert.equal(published.success, true); assert.equal(published.share.tier, 'bronze'); assert.equal(published.share.points, 20)
  assert.equal(h.table('players').get('p1').playerCardPublic, true)
  const shareId = published.share.shareId
  const again = await call('publishPlayerCardShare', { playerId: 'p1' }, op1)
  assert.equal(again.success, true); assert.equal(h.table(game.SHARES).size, 1, '重复送出保持幂等')

  // op3 也送出 p2，作为挑战对手卡
  await call('publishPlayerCardShare', { playerId: 'p2' }, op3)

  // 收集大厅：排除自己的卡、测试卡；展示公开口径
  const hall = await call('listCollectiblePlayerCards', {}, op2)
  assert.equal(hall.success, true)
  assert.equal(hall.rows.length, 2)
  assert(hall.rows.every(row => row.playerId !== 'ptest'))
  const hallP1 = hall.rows.find(row => row.playerId === 'p1')
  assert.equal(hallP1.tier, 'bronze'); assert.equal(hallP1.points, 20); assert.equal(hallP1.collected, false)
  const hallSelf = await call('listCollectiblePlayerCards', {}, op1)
  assert(!hallSelf.rows.some(row => row.playerId === 'p1'), '收集大厅不展示自己的送出卡')

  // 收集：正常 / 幂等 / 自收拒绝
  const collected = await call('collectPlayerCard', { shareId }, op2)
  assert.equal(collected.success, true); assert.equal(collected.collected.already, false)
  const reCollect = await call('collectPlayerCard', { shareId }, op2)
  assert.equal(reCollect.collected.already, true)
  assert.equal(h.table(game.COLLECTIONS).size, 1, '同一用户同一张卡只收一次')
  assert.equal((await call('collectPlayerCard', { shareId }, op1)).code, 'PLAYER_CARD_GAME_COLLECT_SELF')

  // 图鉴：等级分布统计
  const codex = await call('getMyCollectionCodex', {}, op2)
  assert.equal(codex.stats.active, 1); assert.equal(codex.stats.bronze, 1)
  assert.equal(codex.rows[0].name, '球员甲')

  // 阵型目录来自共享数据源
  const forms = await call('listGameFormations', {}, op2)
  assert(forms.formations.length >= 3)
  const five = forms.formations.find(group => group.count === 5)
  assert(five.options.some(option => option.id === '2-2' && option.positions.length === 5))

  // op1 再送出 4 张卡，op2 收齐一套五人阵容；op3 送出剩余自有卡
  for (const pid of ['p3', 'p4', 'p5', 'p6']) {
    const pub = await call('publishPlayerCardShare', { playerId: pid }, op1)
    assert.equal(pub.success, true)
    const col = await call('collectPlayerCard', { shareId: pub.share.shareId }, op2)
    assert.equal(col.success, true)
  }
  for (const pid of ['p7', 'p8', 'p9', 'p10']) await call('publishPlayerCardShare', { playerId: pid }, op3)

  // 阵容：未持有拒绝 / 越界槽位拒绝 / 正常保存（满编首发）/ 乐观锁
  const mySlots = gk => [{ role: 'GK', playerId: gk }, { role: 'CB1', playerId: 'p3' }, { role: 'CB2', playerId: 'p4' }, { role: 'FW1', playerId: 'p5' }, { role: 'FW2', playerId: 'p6' }]
  const bad = await call('saveGameLineup', { name: '非法阵容', formation: { count: 5, id: '2-2' }, slots: mySlots('p2') }, op2)
  assert.equal(bad.code, 'PLAYER_CARD_GAME_LINEUP_FORBIDDEN')
  const badSlot = await call('saveGameLineup', { name: '错位', formation: { count: 5, id: '2-2' }, slots: [{ role: 'GK', playerId: 'p1' }, { role: 'CB1', playerId: 'p3' }, { role: 'CB2', playerId: 'p4' }, { role: 'FW1', playerId: 'p5' }, { role: 'FW9', playerId: 'p6' }] }, op2)
  assert.equal(badSlot.code, 'PLAYER_CARD_GAME_LINEUP_INVALID')
  const saved = await call('saveGameLineup', { name: '我的主力', formation: { count: 5, id: '2-2' }, slots: mySlots('p1'), lineupKey: 'main', pkEnabled: true }, op2)
  assert.equal(saved.success, true); assert.equal(saved.totalPoints, 46); assert.equal(saved.lineupVersion, 1)
  const conflict = await call('saveGameLineup', { name: '改名', formation: { count: 5, id: '2-2' }, slots: mySlots('p1'), lineupKey: 'main', expectedVersion: 99 }, op2)
  assert.equal(conflict.code, 'PLAYER_CARD_GAME_LINEUP_CONFLICT')
  const savedLineupId = saved.lineupId

  // 用 lineupId 直接定位保存更新（前端只持有 lineupId，不持有 lineupKey）
  const renamed = await call('saveGameLineup', { name: '我的主力二队', formation: { count: 5, id: '2-2' }, slots: mySlots('p1'), lineupId: savedLineupId, expectedVersion: 1, pkEnabled: true }, op2)
  assert.equal(renamed.success, true); assert.equal(renamed.lineupId, savedLineupId); assert.equal(renamed.lineupVersion, 2)
  const invalidId = await call('saveGameLineup', { name: '坏编号', formation: { count: 5, id: '2-2' }, slots: mySlots('p1'), lineupId: 'not-a-hex' }, op2)
  assert.equal(invalidId.code, 'PLAYER_CARD_GAME_LINEUP_INVALID')
  const readBack = await call('getMyGameLineup', { lineupId: savedLineupId }, op2)
  assert.equal(readBack.lineup.name, '我的主力二队'); assert.equal(readBack.lineup.lineupVersion, 2)

  // op3 的防守阵容
  const defender = await call('saveGameLineup', { name: '防守阵', formation: { count: 5, id: '2-2' }, slots: [{ role: 'GK', playerId: 'p2' }, { role: 'CB1', playerId: 'p7' }, { role: 'CB2', playerId: 'p8' }, { role: 'FW1', playerId: 'p9' }, { role: 'FW2', playerId: 'p10' }], lineupKey: 'def', pkEnabled: true }, op3)
  assert.equal(defender.success, true)

  // 对手列表：昵称 + 不展示自己
  const opponents = await call('listGameOpponents', {}, op2)
  assert.equal(opponents.rows.length, 1)
  assert.equal(opponents.rows[0].ownerNickname, '对手教练')
  assert.equal(opponents.rows[0].totalPoints, 90)

  // PK：服务端重算、挑战者视角胜负、同窗幂等、自我挑战拒绝
  assert.equal((await call('challengeGameLineup', { lineupId: savedLineupId, defenderLineupId: savedLineupId }, op2)).code, 'PLAYER_CARD_GAME_CHALLENGE_SELF')
  const pk = await call('challengeGameLineup', { lineupId: savedLineupId, defenderLineupId: defender.lineupId }, op2)
  assert.equal(pk.success, true); assert.equal(pk.idempotent, false)
  assert.equal(pk.match.result, 'lose'); assert.equal(pk.match.powerDiff, -44)
  assert.equal(pk.match.challenger.totalPoints, 46); assert.equal(pk.match.defender.totalPoints, 90)
  const pkAgain = await call('challengeGameLineup', { lineupId: savedLineupId, defenderLineupId: defender.lineupId }, op2)
  assert.equal(pkAgain.idempotent, true); assert.equal(pkAgain.match._id, pk.match._id)
  assert.equal(h.table(game.MATCHES).size, 1, '同一窗口重复挑战不刷新战绩')

  // 战绩：双方视角与详情
  const myMatches = await call('listMyGameMatches', {}, op2)
  assert.equal(myMatches.rows.length, 1); assert.equal(myMatches.rows[0].result, 'lose'); assert.equal(myMatches.rows[0].opponentNickname, '对手教练')
  const defMatches = await call('listMyGameMatches', {}, op3)
  assert.equal(defMatches.rows[0].result, 'win')
  const detail = await call('getGameMatchDetail', { matchId: pk.match._id }, op2)
  assert.equal(detail.success, true); assert.equal(detail.match.challenger.slots[0].name, '球员甲')
  assert.equal((await call('getGameMatchDetail', { matchId: pk.match._id }, op1)).code, 'PLAYER_CARD_GAME_MATCH_FORBIDDEN')

  // 收回：收集记录保留但标记已收回，收集大厅消失，不再计入阵容/PK
  const revoked = await call('revokePlayerCardShare', { playerId: 'p1' }, op1)
  assert.equal(revoked.success, true); assert.equal(revoked.staleCount, 1)
  assert.equal(h.table('players').get('p1').playerCardPublic, false)
  const codexAfter = await call('getMyCollectionCodex', {}, op2)
  assert.equal(codexAfter.rows.find(row => row.playerId === 'p1').status, 'stale'); assert.equal(codexAfter.stats.active, 4)
  const hallAfter = await call('listCollectiblePlayerCards', {}, op2)
  assert(!hallAfter.rows.some(row => row.playerId === 'p1'))
  const staleCollect = await call('collectPlayerCard', { shareId }, op2)
  assert.equal(staleCollect.collected.already, true); assert.equal(staleCollect.collected.status, 'stale', '已收集记录重复收集保持已收回状态')
  assert.equal((await call('collectPlayerCard', { shareId }, op3)).code, 'PLAYER_CARD_GAME_SHARE_CLOSED', '收回后新用户不能收集')

  // 收回后该卡不再计入挑战战力
  const lineupDetail = await call('getMyGameLineup', { lineupId: savedLineupId }, op2)
  assert.equal(lineupDetail.lineup.totalPoints, 26, '已收回的卡不计入阵容战力')
  assert.equal(lineupDetail.lineup.slots[0].counted, false)

  // 首页汇总
  const home = await call('getPlayerCardGameHome', {}, op2)
  assert.equal(home.home.collectedCount, 4); assert.equal(home.home.losses, 1); assert.equal(home.home.lineupCount, 1)

  console.log('PASS: 鉴权、送出/收回（幂等+公开许可写回）、收集大厅与图鉴（测试数据排除、收回标记）、阵容（持有/槽位/乐观锁）、异步PK（服务端重算、同窗幂等、双方视角）全部符合预期')
}
run().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => { service.createDataService = createService })
