// 卡世界「直播式对战 + 中场调整」服务端回归测试。
// 复用与线上一致的规则引擎，用内存假库 + 可控时钟逐分钟推进；真实云函数写入由部署后读回验证。
const assert = require('node:assert/strict')
const engine = require('../cloudfunctions/webLoginApi/cardWorldEngine.cjs')
const matchEngine = require('../cloudfunctions/webLoginApi/matchEngine.cjs')
// cardWorld.cjs 的 module.exports 本身即工厂函数，不能再解构 createCardWorld
const createCardWorld = require('../cloudfunctions/webLoginApi/cardWorld.cjs')

/* ---------------- 内存假库（支持 count/skip/orderBy/add/事务回滚） ---------------- */
const tables = new Map()
let autoId = 0
const table = name => {
  if (!tables.has(name)) tables.set(name, new Map())
  return tables.get(name)
}
const clone = value => structuredClone(value)
const matchesFilter = (row, filter) => Object.entries(filter || {}).every(([key, value]) => {
  if (value && typeof value === 'object' && value.$gt !== undefined) return String(row[key]) > value.$gt
  return row[key] === value
})

function buildDb() {
  const db = {
    command: { gt: value => ({ $gt: value }), set: value => ({ $set: value }) },
    serverDate: () => new Date(),
    async createCollection() {},
    collection(name) {
      const rows = table(name)
      const listOf = filter => [...rows.values()]
        .filter(row => matchesFilter(row, filter))
        .sort((a, b) => String(a._id).localeCompare(String(b._id)))
      const query = filter => {
        let skipCount = 0
        let limitCount = Infinity
        let order = null
        const self = {
          orderBy(field, dir) { order = { field, dir }; return self },
          skip(n) { skipCount = Number(n) || 0; return self },
          limit(n) { limitCount = Number(n) || 0; return self },
          async count() { return { total: listOf(filter).length } },
          async get() {
            let list = listOf(filter)
            if (order) {
              list = list.slice().sort((a, b) => {
                const left = String(a[order.field])
                const right = String(b[order.field])
                return order.dir === 'desc' ? right.localeCompare(left) : left.localeCompare(right)
              })
            }
            return { data: list.slice(skipCount, skipCount + limitCount).map(clone) }
          }
        }
        return self
      }
      return {
        doc(id) {
          const key = String(id)
          return {
            async get() { return { data: rows.has(key) ? clone(rows.get(key)) : null } },
            async set({ data }) {
              assert(!('_id' in data), 'set({data}) 不能包含 _id')
              rows.set(key, Object.assign({ _id: key }, clone(data)))
            },
            async update({ data }) {
              const row = rows.get(key)
              assert(row, 'update 目标不存在: ' + key)
              for (const [field, value] of Object.entries(data)) {
                row[field] = value && value.$set !== undefined ? clone(value.$set) : clone(value)
              }
            }
          }
        },
        async add({ data }) {
          const id = 'auto_' + (++autoId)
          rows.set(id, Object.assign({ _id: id }, clone(data)))
          return { _id: id }
        },
        where(filter) { return query(filter) }
      }
    },
    async runTransaction(fn) {
      const before = new Map([...tables.entries()].map(([name, rows]) => [name, clone(rows)]))
      try {
        return await fn(db)
      } catch (error) {
        tables.clear()
        for (const [name, rows] of before) tables.set(name, rows)
        throw error
      }
    }
  }
  return db
}

/* ---------------- 假身份 + 可控时钟 ---------------- */
const db = buildDb()
const cloud = { database: () => db }
const users = { 'tok-u1': 'u1', 'tok-u2': 'u2' }
const authenticateWebSession = async ({ authToken }) => {
  const userId = users[String(authToken || '')]
  return userId ? { success: true, userId } : { success: false, error: '会话失效' }
}
// 工厂返回 { handle, ACTIONS }，与云端 index.js 的调用方式保持一致
const cardWorld = createCardWorld({ cloud, authenticateWebSession })
const handle = cardWorld.handle

const realNow = Date.now
let clockOffset = 0
Date.now = () => realNow() + clockOffset
const clock = ms => { clockOffset = Number(ms) || 0 }

const call = (action, data, token) => handle(action, Object.assign({ authToken: token || 'tok-u1' }, data || {}), {})

/* ---------------- 数据准备 ---------------- */
function seed() {
  tables.clear(); autoId = 0; clock(0)
  table('users').set('u1', { _id: 'u1', phone: '13800000001', cityCode: '4101', cityName: '郑州', nickname: '阿峰' })
  table('users').set('u2', { _id: 'u2', phone: '13800000002', cityCode: '4101', cityName: '郑州', nickname: '小蜂' })
  const roster = [
    ['p1', '门将甲', 'GK', 'GK', 62, 1],
    ['p2', '后卫乙', 'DF', 'DF', 66, 2],
    ['p3', '中场丙', 'MF', 'MF', 68, 3],
    ['p4', '中场丁', 'MF', 'MF', 70, 4],
    ['p5', '前锋戊', 'FW', 'FW', 72, 5],
    ['p6', '前锋己', 'FW', 'FW', 74, 6],
    ['p7', '中场庚', 'MF', 'MF', 75, 7],
    ['p8', '后卫辛', 'DF', 'DF', 71, 8],
    ['p9', '门将壬', 'GK', 'GK', 64, 9],
    ['p10', '后卫癸', 'DF', 'DF', 65, 10],
    ['p11', '中场子', 'MF', 'MF', 69, 11],
    ['p12', '前锋丑', 'FW', 'FW', 73, 12]
  ]
  for (const [playerId, name, position, group, ovr, rosterOrder] of roster) {
    table('card_world_players').set(playerId, {
      _id: playerId, playerId, name, position, positionLabel: position, group, ovr,
      appearances: 10, goals: 2, assists: 1, rosterOrder, cityCode: '4101',
      skillTag: '', skillLabel: '', cardUrl: '', portraitAuthorized: true, number: String(rosterOrder)
    })
  }
  // u1 拥有 9 张卡（5 人首发 + 4 名替补，含替补门将 p9），u2 无卡（用于越权测试）
  for (const playerId of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9']) {
    const player = table('card_world_players').get(playerId)
    table('card_world_cards').set('c-' + playerId, { _id: 'c-' + playerId, userId: 'u1', playerId, snapshot: player, signedAt: new Date() })
  }
}

function assertOk(result, label) {
  assert.equal(result && result.success, true, label + ' 应成功: ' + JSON.stringify(result))
}

async function run() {
  seed()

  /* 1. 建档与首发阵容 */
  assertOk(await call('cardWorldMainCard'), '主卡读取')
  const slots = [['fw', 'p5'], ['lm', 'p3'], ['rm', 'p4'], ['cb', 'p2'], ['gk', 'p1']]
  for (const [key, playerId] of slots) assertOk(await call('cardWorldSetSlot', { key, playerId }), '设置槽位 ' + key)
  const saved = await call('cardWorldSaveLineup')
  assertOk(saved, '保存阵容')

  /* 2. 发起直播对战：落一场、0 分钟、无事件、未结算 */
  const none = await call('cardWorldMatchCurrent')
  assertOk(none, '未开赛时恢复今日对战')
  assert.equal(none.hasMatch, false, '未发起时没有今日比赛')

  const started = await call('cardWorldMatchStart')
  assertOk(started, '发起直播对战')
  assert.equal(started.live.inProgress, true, '刚开赛应处于直播中')
  assert.equal(started.live.minute, 0, '开局分钟应为 0')
  assert.equal((started.events || []).length, 0, '开局不揭示任何事件')
  assert.equal(started.finalScore, null, '未结束不下发最终比分')
  assert.equal(started.halftime.canAdjust, false, '上半场不能调整')
  assert.equal((started.mineSlots || []).length, 5, '应下发我方 5 个槽位')
  assert.equal(started.mineSlots[0].slotKey, 'fw', '槽位顺序与编制一致')
  const matchId = started.matchId

  const stored = table('card_world_matches').get(matchId)
  assert(stored, '战绩应落库')
  assert.equal(stored.mode, 'live_5v5')
  assert.equal(stored.settled, false, '发起时不应结算')
  // 锁定比分＝服务端落库的全场比分（前端在终场前只看已揭示比分，不提前拿到结果）
  const lockedScore = { mine: stored.score.challenger, opponent: stored.score.defender }
  assert.equal(stored.score.challenger, lockedScore.mine, '落库比分为服务端权威值')
  assert(Array.isArray(stored.events) && stored.events.length > 0, '事件流应一次性生成')

  /* 3. 同日重复发起：返回同一场（幂等，不新增比赛） */
  const again = await call('cardWorldMatchStart')
  assert.equal(again.matchId, matchId, '同日同对手应返回同一场')
  assert.equal(table('card_world_matches').size, 1, '同日重复发起不产生第二场')

  /* 3.5 断线恢复：不传 matchId 也能拿回同一场 */
  const resumed = await call('cardWorldMatchCurrent')
  assertOk(resumed, '恢复今日对战')
  assert.equal(resumed.hasMatch, true, '已发起后应有今日比赛')
  assert.equal(resumed.matchId, matchId, '恢复得到的应是同一场')

  /* 4. 逐分钟推进：20′ 只揭示已发生事件，比分等于已发生进球 */
  clock(20 * 1000)
  const at20 = await call('cardWorldMatchLive', { matchId })
  assertOk(at20, '20′ 直播读取')
  assert.equal(at20.live.phase, 'firstHalf')
  assert.equal(at20.live.minute, 20)
  const visibleGoalsAt20 = (at20.events || []).filter(ev => ev.type === 'goal')
  assert.equal(at20.score.mine, visibleGoalsAt20.filter(ev => ev.mine === true).length, '我方比分 = 已发生我方进球')
  assert.equal(at20.score.opponent, visibleGoalsAt20.filter(ev => ev.mine !== true).length, '对手比分 = 已发生对手进球')
  assert((at20.events || []).every(ev => ev.minute <= 20), '只揭示 ≤20′ 的事件')

  /* 5. 45′ 进入中场：可调整、下发候选 */
  clock(45 * 1000)
  const at45 = await call('cardWorldMatchLive', { matchId })
  assert.equal(at45.live.phase, 'halftime', '45′ 应进入中场')
  assert.equal(at45.halftime.canAdjust, true, '中场应允许调整')
  assert(at45.halftime.remainSec > 0, '中场应返回倒计时')

  const options = await call('cardWorldMatchHalftimeOptions', { matchId })
  assertOk(options, '中场候选（未选槽位）')
  assert.equal((options.slots || []).length, 5)
  assert.equal((options.bench || []).length, 0, '未选槽位时不返回候选')

  const benchOfFw = await call('cardWorldMatchHalftimeOptions', { matchId, slotIndex: 0 })
  assertOk(benchOfFw, '中场候选（前锋位）')
  assert.equal(benchOfFw.slotIndex, 0)
  assert((benchOfFw.bench || []).length > 0, '应有替补候选')
  const onPitch = (benchOfFw.slots || []).map(slot => slot.playerId)
  assert((benchOfFw.bench || []).every(item => onPitch.indexOf(item.playerId) < 0), '候选不含场上球员')

  /* 5.5 门将位只能换门将：候选只给门将，硬换非门将被拒且不消耗本场唯一机会 */
  const benchOfGk = await call('cardWorldMatchHalftimeOptions', { matchId, slotIndex: 4 })
  assertOk(benchOfGk, '中场候选（门将位）')
  assert.equal(benchOfGk.slotText, '门将')
  assert((benchOfGk.bench || []).length > 0, '应有替补门将可选')
  assert((benchOfGk.bench || []).every(item => item.group === 'GK'), '门将位候选只含门将')
  const gkReject = await call('cardWorldMatchHalftimeAdjust', { matchId, slotIndex: 4, playerId: 'p6' })
  assert.equal(gkReject.success, false, '门将位换非门将应被拒')
  assert.equal(gkReject.code, 'WORLD_MATCH_PLAYER_UNAVAILABLE')

  /* 6. 中场换人：成功，槽位变更，比分不变，写入 46′ 换人事件 */
  const adjust = await call('cardWorldMatchHalftimeAdjust', { matchId, slotIndex: 0, playerId: 'p6' })
  assertOk(adjust, '中场换人')
  assert.equal(adjust.mineSlots[0].playerId, 'p6', '前锋位应换成替补前锋')
  assert.equal(adjust.score.mine, at45.score.mine, '换人后已揭示比分不变')
  assert.equal(adjust.score.opponent, at45.score.opponent, '换人后对手比分不变')
  const adjustedRow = table('card_world_matches').get(matchId)
  const subEvent = (adjustedRow.events || []).find(ev => ev.type === 'sub' && ev.side === 'challenger' && ev.minute === 46)
  assert(subEvent, '应写入 46′ 换人事件')
  assert.equal(subEvent.player, '前锋己', '换人事件应记录换上球员')
  assert.equal(subEvent.out, '前锋戊', '换人事件应记录换下球员')
  assert.equal(adjustedRow.halftimeAdjusts.challenger.playerId, 'p6', '调整记录应落库')
  assert.equal(adjustedRow.score.challenger, lockedScore.mine, '落库比分保持锁定')

  /* 7. 每场只能换一人：第二次被拒 */
  const twice = await call('cardWorldMatchHalftimeAdjust', { matchId, slotIndex: 1, playerId: 'p7' })
  assert.equal(twice.success, false, '第二次调整应被拒')
  assert.equal(twice.code, 'WORLD_MATCH_HALFTIME_USED')

  /* 8. 75′ 中场窗口关闭后调整被拒（本轮清掉已用标记，单独验证「时段」校验） */
  clock((45 + matchEngine.LIVE_HALFTIME_SECONDS + 30) * 1000)
  const at75 = await call('cardWorldMatchLive', { matchId })
  assert.equal(at75.live.phase, 'secondHalf', '中场结束后应进入下半场')
  const rowAt75 = table('card_world_matches').get(matchId)
  const usedAdjusts = rowAt75.halftimeAdjusts
  rowAt75.halftimeAdjusts = {}
  const late = await call('cardWorldMatchHalftimeAdjust', { matchId, slotIndex: 1, playerId: 'p7' })
  assert.equal(late.success, false, '非中场时段调整应被拒')
  assert.equal(late.code, 'WORLD_MATCH_HALFTIME_CLOSED')
  rowAt75.halftimeAdjusts = usedAdjusts

  /* 9. 到点结算：出最终比分与结果，战报写入一次且幂等 */
  clock((90 + matchEngine.LIVE_HALFTIME_SECONDS) * 1000)
  const finished = await call('cardWorldMatchLive', { matchId })
  assert.ok(finished, '全场读取应成功')
  assert.equal(finished.live.inProgress, false, '应结束')
  assert.equal(finished.live.phase, 'fulltime')
  assert(finished.finalScore, '结束后应下发最终比分')
  assert.equal(finished.finalScore.mine, lockedScore.mine, '最终比分与锁定一致')
  assert.equal(finished.finalScore.opponent, lockedScore.opponent, '最终比分与锁定一致')
  assert.equal(finished.settled, true, '结束后应标记已结算')
  assert.equal(table('card_world_matches').get(matchId).settled, true)

  const log1 = await call('cardWorldBattleLog')
  assertOk(log1, '战报读取')
  const liveEntries = (log1.rows || []).filter(row => row.mode === 'live_5v5')
  assert.equal(liveEntries.length, 1, '应写入一条直播战报')
  assert.equal(liveEntries[0].scoreText, lockedScore.mine + ' – ' + lockedScore.opponent, '战报比分与锁定一致')
  const log2 = await call('cardWorldBattleLog')
  assert.equal(((log2.rows || []).filter(row => row.mode === 'live_5v5')).length, 1, '重复读取不重复写战报')

  /* 10. 越权：不能读别人的比赛 */
  const other = await call('cardWorldMatchLive', { matchId }, 'tok-u2')
  assert.equal(other.success, false, '他人战绩应拒绝')
  assert.equal(other.code, 'WORLD_MATCH_FORBIDDEN')

  /* 11. 未登录 */
  const anonymous = await handle('cardWorldMatchStart', {}, {})
  assert.equal(anonymous.success, false, '未登录应拒绝')
  assert.equal(anonymous.code, 'WORLD_LOGIN_REQUIRED')

  /* 12. 比分锁定防御：重建下半场不会改变进球总数 */
  const rebuilt = matchEngine.rebuildSideSecondHalf({
    side: { slots: [{ role: 'FW', name: '测试前锋', counted: true }] },
    sideKey: 'challenger',
    goals: 3,
    seedText: 'seed-lock',
    takenMinutes: []
  })
  assert.equal(rebuilt.filter(ev => ev.type === 'goal').length, 3, '重建进球数应等于原下半场进球数')

  console.log('PASS 卡世界直播对战（发起/揭示/中场换人/比分锁定/结算/越权）')
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
