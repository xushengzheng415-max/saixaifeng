'use strict'
/**
 * 发现页“球员身价”只读投影（getMiniWorkspace/eventValuations.cjs）回归。
 *
 * 覆盖用户 2026-10-26 确认的边界：发现只做身价展示。
 * - 范围只取本赛事已审核名单（roster_snapshots / 旧 rosters），草稿、删除、他赛、测试数据不进；
 * - 青少年只返回不公开，不返回金额与段位；
 * - 无快照或 coverage 未完成返回待评估，不用 0 冒充；
 * - 同一球员多条快照只取最新；
 * - 读 player_valuations 必须带 playerId 范围，不整集合扫描；
 * - 不返回手机号、证件、报价或审核字段；
 * - 名单读取失败显式报错，不静默当空名单，缺集合降级为“未登记”。
 */
const assert = require('node:assert/strict')
const { database } = require('./test-mini-account-participation.cjs')
const valuations = require('../cloudfunctions/getMiniWorkspace/eventValuations.cjs')

const COLLECTIONS = ['roster_snapshots', 'rosters', 'players', 'player_valuations', 'teams', 'divisions']
const ITEM_KEYS = ['playerId', 'name', 'playerCode', 'teamId', 'teamName', 'divisionId', 'divisionName', 'valuationState', 'valueText', 'tierText', 'computedAt', 'hasValue', 'isHidden']

const seed = () => ({
  roster_snapshots: [
    { _id: 'r1', tournamentId: 'e1', teamId: 't1', divisionId: 'd1', status: 'approved', playerIds: ['p1', 'p2', { playerId: 'p3' }, 'p8', 'p9'] },
    { _id: 'r2', tournamentId: 'e1', teamId: 't1', divisionId: 'd1', status: 'draft', playerIds: ['p4'] },
    { _id: 'r3', tournamentId: 'e1', teamId: 't1', divisionId: 'd1', status: 'deleted', playerIds: ['p5'] },
    { _id: 'r4', tournamentId: 'e2', teamId: 't1', divisionId: 'd1', status: 'approved', playerIds: ['p6'] }
  ],
  // 旧名册：没有 status 字段按有效处理，players 字段与 playerIds 等价。
  rosters: [{ _id: 'l1', tournamentId: 'e1', teamId: 't2', divisionId: 'd2', players: ['p7'] }],
  players: [
    { _id: 'p1', name: '张伟', status: 'active', businessNumber: 'SXF-001', mobile: '13800000000' },
    { _id: 'p2', name: '李小明', status: 'active' },
    { _id: 'p3', name: '王强', status: 'active' },
    { _id: 'p4', name: '草稿球员', status: 'active' },
    { _id: 'p5', name: '已删名单球员', status: 'active' },
    { _id: 'p6', name: '他赛球员', status: 'active' },
    { _id: 'p7', name: '赵勇', status: 'active' },
    { _id: 'p8', name: '测试球员', status: 'active', synthetic: true },
    { _id: 'p9', name: '注销球员', status: 'deleted' }
  ],
  player_valuations: [
    { _id: 'v0', playerId: 'p1', computedAt: '2026-09-01', coverage: 'complete', money: 500, total: 500, tier: 'C' },
    { _id: 'v1', playerId: 'p1', computedAt: '2026-10-20', coverage: 'complete', money: 680, total: 680, tier: 'A' },
    { _id: 'v2', playerId: 'p2', computedAt: '2026-10-20', coverage: 'complete', money: 900, total: 900, tier: 'A', minor: true },
    { _id: 'v4', playerId: 'p7', computedAt: '2026-10-21', coverage: 'pending', money: null, total: null }
  ],
  teams: [{ _id: 't1', name: '甲队' }, { _id: 't2', name: '乙队' }],
  divisions: [{ _id: 'd1', name: 'U10组' }, { _id: 'd2', name: 'U12组' }]
})

const fixture = (tables = seed(), options = {}) => database(tables, options.cap || 3, options.fail || '', COLLECTIONS, options.missing || [])
// 翻页后键集条件会包进 $and，摊平成条件片段，确认赛事/ID 范围条件始终存在。
const whereParts = where => where && where.$and ? where.$and.flatMap(whereParts) : [where || {}]
const scopedBy = (where, key, check = value => value !== undefined) => whereParts(where).some(part => check(part[key]))

async function main() {
  // 1. 名单范围：只认本赛事已审核名单行，排除草稿／删除／他赛／测试／注销球员。
  const base = fixture()
  const result = await valuations.load(base.db, { tournamentId: 'e1' })
  assert.equal(result.success, true)
  assert.equal(result.rosterState, 'ready')
  assert.equal(result.state, 'ready')
  assert.deepEqual(result.items.map(row => row.playerId).sort(), ['p1', 'p2', 'p3', 'p7'])
  assert.equal(result.total, 4)
  assert.equal(result.page, 1)
  assert.equal(result.pageCount, 1)
  assert.equal(result.pageSize, valuations.PAGE_SIZE)
  assert.ok(!result.items.some(row => ['p4', 'p5', 'p6', 'p8', 'p9'].includes(row.playerId)), 'Not-approved, other-event, synthetic and deleted players must not appear')

  // 2. 成人最新快照：金额、段位与时间来自最新 computedAt，不使用旧快照。
  const adult = result.items.find(row => row.playerId === 'p1')
  assert.equal(adult.valuationState, 'ready')
  assert.equal(adult.valueText, '¥680')
  assert.equal(adult.tierText, 'A')
  assert.equal(adult.computedAt, '2026-10-20')
  assert.equal(adult.hasValue, true)
  assert.equal(adult.isHidden, false)
  assert.equal(adult.teamName, '甲队')
  assert.equal(adult.divisionName, 'U10组')
  assert.equal(adult.playerCode, 'SXF-001')
  assert.equal(adult.name, '张伟')

  // 3. 青少年：只返回不公开，带 hidden 标记且没有金额与段位。
  const minor = result.items.find(row => row.playerId === 'p2')
  assert.equal(minor.valuationState, 'hidden')
  assert.equal(minor.valueText, '不公开')
  assert.equal(minor.tierText, '')
  assert.equal(minor.hasValue, false)
  assert.equal(minor.isHidden, true)

  // 4. 无快照与 coverage 未完成都是待评估，不用 0 冒充。
  const noSnapshot = result.items.find(row => row.playerId === 'p3')
  assert.equal(noSnapshot.valuationState, 'pending')
  assert.equal(noSnapshot.valueText, '待评估')
  assert.equal(noSnapshot.computedAt, null)
  assert.equal(noSnapshot.hasValue, false)
  const pendingCoverage = result.items.find(row => row.playerId === 'p7')
  assert.equal(pendingCoverage.valuationState, 'pending')
  assert.equal(pendingCoverage.valueText, '待评估')
  assert.equal(pendingCoverage.teamName, '乙队', 'Legacy rosters players field must resolve the team')
  assert.equal(pendingCoverage.divisionName, 'U12组')

  // 5. 只读投影：字段白名单，不泄漏手机号／证件／报价／审核信息。
  for (const item of result.items) assert.deepEqual(Object.keys(item).sort(), [...ITEM_KEYS].sort())
  const serialized = JSON.stringify(result)
  for (const field of ['mobile', 'phone', 'phoneNumber', 'idCard', 'idNumber', 'openId', 'unionId', 'offer', 'review']) {
    assert.ok(!serialized.includes('"' + field + '"'), `Response must not expose ${field}`)
  }

  // 6. 读取范围：名单按赛事读，身价按本页 playerId 批量读，没有整集合扫描。
  const rosterReads = base.reads.filter(read => ['roster_snapshots', 'rosters'].includes(read.name))
  assert.equal(rosterReads.length > 0, true)
  assert.ok(rosterReads.every(read => scopedBy(read.where, 'tournamentId', value => value === 'e1')), 'Roster reads must carry the tournament scope')
  const valuationReads = base.reads.filter(read => read.name === 'player_valuations')
  assert.equal(valuationReads.length > 0, true)
  assert.ok(valuationReads.every(read => scopedBy(read.where, 'playerId', value => Array.isArray(value && value.$in))), 'Valuation reads must batch by playerId')
  assert.ok(base.reads.every(read => read.name !== 'players' || scopedBy(read.where, '_id', value => Array.isArray(value && value.$in))), 'Player reads must be scoped by id')

  // 7. 组别／球队／关键词筛选在服务端完成，分页不静默截断。
  assert.deepEqual((await valuations.load(fixture().db, { tournamentId: 'e1', divisionId: 'd2' })).items.map(row => row.playerId), ['p7'])
  assert.deepEqual((await valuations.load(fixture().db, { tournamentId: 'e1', teamId: 't2' })).items.map(row => row.playerId), ['p7'])
  const searched = await valuations.load(fixture().db, { tournamentId: 'e1', keyword: '张' })
  assert.deepEqual(searched.items.map(row => row.playerId), ['p1'])
  assert.equal(searched.total, 1)
  const byCode = await valuations.load(fixture().db, { tournamentId: 'e1', keyword: 'sxf-001' })
  assert.deepEqual(byCode.items.map(row => row.playerId), ['p1'])
  // 关键词不匹配：名单仍然就绪，只是本页没有结果，不记为数据缺失。
  const noMatch = await valuations.load(fixture().db, { tournamentId: 'e1', keyword: '不存在' })
  assert.equal(noMatch.state, 'ready')
  assert.equal(noMatch.rosterState, 'ready')
  assert.deepEqual(noMatch.items, [])
  assert.equal(noMatch.total, 0)

  // 8. 分页：单页 20 条，页码越界收敛到末页，pageSize 上限受控。
  const many = Array.from({ length: 25 }, (_, index) => String(index + 1).padStart(3, '0'))
  const large = {
    roster_snapshots: [{ _id: 'r1', tournamentId: 'e1', status: 'approved', teamId: 't1', divisionId: 'd1', playerIds: many }],
    rosters: [],
    players: many.map(playerId => ({ _id: playerId, name: '球员' + playerId, status: 'active' })),
    player_valuations: [],
    teams: [{ _id: 't1', name: '甲队' }],
    divisions: [{ _id: 'd1', name: 'U10组' }]
  }
  const firstPage = await valuations.load(fixture(large).db, { tournamentId: 'e1' })
  assert.equal(firstPage.total, 25)
  assert.equal(firstPage.pageCount, 2)
  assert.equal(firstPage.items.length, 20)
  const secondPage = await valuations.load(fixture(large).db, { tournamentId: 'e1', page: 2 })
  assert.equal(secondPage.page, 2)
  assert.equal(secondPage.items.length, 5)
  const overflow = await valuations.load(fixture(large).db, { tournamentId: 'e1', page: 9, pageSize: 999 })
  assert.equal(overflow.page, 2, 'Out-of-range page must clamp to the last page instead of returning empty')
  assert.equal(overflow.pageSize, valuations.PAGE_SIZE)

  // 9. 缺集合降级为未登记；名单读取失败必须显式抛错，不能当空名单。
  const missingRosters = await valuations.load(fixture(seed(), { missing: ['rosters'] }).db, { tournamentId: 'e1' })
  assert.equal(missingRosters.rosterState, 'partial')
  assert.deepEqual(missingRosters.items.map(row => row.playerId).sort(), ['p1', 'p2', 'p3'])
  const missingAll = await valuations.load(fixture(seed(), { missing: ['roster_snapshots', 'rosters'] }).db, { tournamentId: 'e1' })
  assert.equal(missingAll.rosterState, 'not_recorded')
  assert.equal(missingAll.state, 'empty')
  assert.equal(missingAll.stateText, '本赛事名单未登记')
  assert.deepEqual(missingAll.items, [])
  await assert.rejects(() => valuations.load(fixture(seed(), { fail: 'roster_snapshots' }).db, { tournamentId: 'e1' }), /数据读取失败/)

  // 10. 参数与纯函数口径。
  await assert.rejects(() => valuations.load(fixture().db, {}), /缺少赛事信息/)
  assert.equal(valuations.valuationStateOf(null), 'hidden')
  assert.equal(valuations.valuationStateOf({ minor: true, coverage: 'complete', money: 100 }), 'hidden')
  assert.equal(valuations.valuationStateOf({ coverage: 'partial', money: 100 }), 'pending')
  assert.equal(valuations.valuationStateOf({ coverage: 'complete', money: null }), 'pending')
  assert.equal(valuations.valuationStateOf({ coverage: 'complete', money: 0 }), 'ready')
  assert.equal(valuations.moneyTextOf(null), '')
  assert.equal(valuations.moneyTextOf({ money: 680 }), '¥680')

  console.log('PASS: 身价展示只认已审名单、青少年不公开、待评估不记零、最新快照优先、按页批量读身价、组别/球队/关键词与分页、缺集合降级与读取失败不冒充空名单、无联系方式泄漏')
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1 })
module.exports = { seed, fixture }
