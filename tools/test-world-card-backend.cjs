'use strict'
/*
 * 球员端「赛小蜂足球世界」卡世界服务端回归测试（离线，不连云端）
 *
 * 用内存假库覆盖 cardWorld.cjs 的 13 个 action 与关键分支：身份校验、同城签约、
 * 日配额、编制解锁、卡册归属、确定性对战、战报落库、手机号重复账号阻断。
 *
 * 运行：node tools/test-world-card-backend.cjs
 */

const path = require('path')
process.env.WORLD_MINI_PROGRAM_APP_ID = 'wx_test_world'
process.env.WORLD_MINI_PROGRAM_APP_SECRET = 'test_secret'
const createCardWorld = require(path.join(__dirname, '..', 'cloudfunctions', 'webLoginApi', 'cardWorld.cjs'))

const docs = {
  users: [{
    _id: 'u1', phone: '13800000000', phoneNumber: '13800000000', cityCode: '330100', cityName: '杭州',
    worldOpenId: '', worldUnionId: ''
  }],
  card_world_players: [
    { _id: 'pp1', playerId: 'p1', name: '甲', number: 9, position: 'FW', group: 'FW', ovr: 80, skillTag: 'finishing', rosterOrder: 101, cityCode: '330100' },
    { _id: 'pp2', playerId: 'p2', name: '乙', number: 8, position: 'MF', group: 'MF', ovr: 78, skillTag: 'passing', rosterOrder: 102, cityCode: '330100' },
    { _id: 'pp3', playerId: 'p3', name: '丙', number: 4, position: 'DF', group: 'DF', ovr: 76, skillTag: 'tackling', rosterOrder: 103, cityCode: '330100' },
    { _id: 'pp4', playerId: 'p4', name: '丁', number: 1, position: 'GK', group: 'GK', ovr: 79, skillTag: 'saving', rosterOrder: 104, cityCode: '330100' },
    { _id: 'pp5', playerId: 'p5', name: '戊', number: 11, position: 'FW', group: 'FW', ovr: 77, skillTag: 'pace', rosterOrder: 105, cityCode: '330100' },
    { _id: 'pp6', playerId: 'p6', name: '己', number: 6, position: 'MF', group: 'MF', ovr: 75, skillTag: 'dribbling', rosterOrder: 106, cityCode: '330100' },
    { _id: 'pp7', playerId: 'p7', name: '庚', number: 3, position: 'DF', group: 'DF', ovr: 74, skillTag: 'aerial', rosterOrder: 107, cityCode: '330100' },
    { _id: 'pp8', playerId: 'p8', name: '辛', number: 2, position: 'DF', group: 'DF', ovr: 73, skillTag: 'tackling', rosterOrder: 108, cityCode: '330100' },
    { _id: 'pp9', playerId: 'p9', name: '壬', number: 7, position: 'MF', group: 'MF', ovr: 76, skillTag: 'passing', rosterOrder: 109, cityCode: '330100' },
    { _id: 'pp10', playerId: 'p10', name: '癸', number: 22, position: 'GK', group: 'GK', ovr: 72, skillTag: 'saving', rosterOrder: 110, cityCode: '330100' },
    { _id: 'pp11', playerId: 'p11', name: '外城', number: 10, position: 'FW', group: 'FW', ovr: 80, rosterOrder: 201, cityCode: '330200' }
  ],
  card_world_profiles: [],
  card_world_cards: []
}

let seq = 0

function readPath(doc, key) {
  return key.split('.').reduce(function (value, part) {
    return value == null ? undefined : value[part]
  }, doc)
}

function matches(doc, cond) {
  for (const key of Object.keys(cond || {})) {
    if (readPath(doc, key) !== cond[key]) return false
  }
  return true
}

function collection(name) {
  const list = docs[name] || (docs[name] = [])
  const state = { cond: null, limitValue: null, skipValue: 0, order: null }
  function filtered() {
    let rows = list.slice()
    if (state.cond) rows = rows.filter(row => matches(row, state.cond))
    if (state.order) {
      const field = state.order
      rows.sort((a, b) => (Number(a[field] || 0) - Number(b[field] || 0))
        || String(a.playerId || '').localeCompare(String(b.playerId || '')))
    }
    return rows
  }
  const api = {
    where(cond) { state.cond = cond; return api },
    limit(n) { state.limitValue = n; return api },
    skip(n) { state.skipValue = n; return api },
    orderBy(field) { state.order = field; return api },
    async count() { return { total: filtered().length } },
    async get() {
      const end = state.limitValue ? state.skipValue + state.limitValue : undefined
      return { data: filtered().slice(state.skipValue, end) }
    },
    async update({ data }) {
      const rows = filtered()
      for (const row of rows) Object.assign(row, data)
      return { stats: { updated: rows.length } }
    },
    doc(id) {
      return {
        async get() {
          const found = list.filter(row => row._id === id)[0]
          if (!found) throw new Error('document not exist')
          return { data: found }
        },
        async update({ data }) {
          const found = list.filter(row => row._id === id)[0]
          if (!found) throw new Error('document not exist')
          Object.assign(found, data)
          return { stats: { updated: 1 } }
        }
      }
    },
    async add({ data }) {
      const id = name + '_' + (++seq)
      list.push(Object.assign({ _id: id }, data))
      return { _id: id }
    }
  }
  return api
}

const db = {
  collection,
  async createCollection() { return true },
  serverDate() { return new Date().toISOString() }
}

const service = createCardWorld({
  cloud: { database: () => db },
  authenticateWebSession: async () => ({ success: true, userId: 'u1' }),
  httpsGet: async () => ({ access_token: 'x', expires_in: 7200 }),
  httpsPost: async () => ({ errcode: 0, phone_info: { phoneNumber: '13800000000' } })
})

const ctx = { OPENID: 'world_openid_1', UNIONID: 'world_union_1', APPID: '' }
let failures = 0

function expect(label, condition, detail) {
  if (condition) {
    console.log('PASS ' + label)
  } else {
    failures++
    console.log('FAIL ' + label + ' :: ' + JSON.stringify(detail === undefined ? '' : detail))
  }
}

async function main() {
  let res = await service.handle('cardWorldLogin', {}, ctx)
  expect('login 需要身份', res.success === false && res.code === 'WORLD_LOGIN_REQUIRED', res)

  res = await service.handle('cardWorldLogin', { authToken: 't' }, ctx)
  expect('login 会话通过', res.success === true && res.userId === 'u1' && res.cityCode === '330100', res)
  expect('login 记录渠道标识', docs.users[0].worldOpenId === 'world_openid_1', docs.users[0])

  res = await service.handle('cardWorldMainCard', { authToken: 't' }, ctx)
  expect('mainCard 空态', res.success === true && res.empty === true && res.cardUrl === '', res)

  res = await service.handle('cardWorldSignSameCity', { authToken: 't', mode: 'free_daily' }, ctx)
  expect('sign 成功', res.success === true && res.card && res.card.playerId === 'p1', res)
  expect('sign 只签同城', docs.card_world_cards.every(c => c.cityCode === '330100'), docs.card_world_cards)

  res = await service.handle('cardWorldSignSameCity', { authToken: 't', mode: 'free_daily' }, ctx)
  expect('sign 配额拦截', res.success === false && res.code === 'QUOTA_EXCEEDED', res)

  res = await service.handle('cardWorldBattle', { authToken: 't', scoreMine: 5 }, ctx)
  expect('battle 空阵被拒', res.success === false && res.code === 'LINEUP_INVALID', res)

  res = await service.handle('cardWorldOwnedCards', { authToken: 't' }, ctx)
  expect('ownedCards 返回 chips', res.success === true && Array.isArray(res.chips) && res.chips.length === 1, res)

  res = await service.handle('cardWorldSetRosterSize', { authToken: 't', size: 8 }, ctx)
  expect('8 人未解锁被拒', res.success === false && res.code === 'ROSTER_LOCKED', res)

  res = await service.handle('cardWorldSetSlot', { authToken: 't', key: 'gk', playerId: 'p4' }, ctx)
  expect('setSlot 拒绝未拥有球员', res.success === false && res.code === 'LINEUP_INVALID', res)

  res = await service.handle('cardWorldSetSlot', { authToken: 't', key: 'fw', playerId: 'p1' }, ctx)
  expect('setSlot 接受已拥有球员', res.success === true && res.rows && res.rows.length > 0, res)

  const slots = [{ key: 'fw', playerId: 'p1' }, { key: 'lm', playerId: '' }, { key: 'rm', playerId: '' }, { key: 'cb', playerId: '' }, { key: 'gk', playerId: '' }]
  res = await service.handle('cardWorldSaveLineup', { authToken: 't', slots: slots }, ctx)
  expect('saveLineup 缺门将被拒', res.success === false && res.code === 'LINEUP_INVALID', res)

  res = await service.handle('cardWorldSaveLineup', { authToken: 't', slots: [{ key: 'hacker', playerId: 'p1' }] }, ctx)
  expect('saveLineup 未知槽位被拒', res.success === false && res.code === 'LINEUP_INVALID', res)

  res = await service.handle('cardWorldSetAutoRenew', { authToken: 't', enabled: true }, ctx)
  expect('setAutoRenew 指向 H5', res.success === false && res.code === 'WORLD_AUTORENEW_ON_H5', res)

  res = await service.handle('cardWorldMembership', { authToken: 't' }, ctx)
  expect('membership 形态', res.success === true && res.tier === 'none' && res.autoRenewAllowed === false, res)

  res = await service.handle('cardWorldNotExist', { authToken: 't' }, ctx)
  expect('未知 action 明确报错', res.success === false && res.code === 'WORLD_ACTION_UNKNOWN', res)

  docs.users.push({ _id: 'u2', phone: '13800000000' })
  res = await service.handle('cardWorldLogin', { phoneCode: 'code-1' }, ctx)
  expect('手机号多账号阻断', res.success === false && res.code === 'WORLD_PHONE_CONFLICT', res)
  docs.users.pop()

  const before = { log: docs.card_world_profiles[0].battleLog.length }
  expect('战报初始为空', before.log === 0, before)

  /* 13. 完整闭环：多签几张 → 存阵 → 出分 → 战报落库 */
  for (let i = 0; i < 4; i++) {
    /* 免费配额按档位固定为 1/日，测试用直接重置已用次数，模拟跨日 */
    docs.card_world_profiles[0].quota.freeUsed = 0
    res = await service.handle('cardWorldSignSameCity', { authToken: 't', mode: 'free_daily' }, ctx)
    if (!res.success) { console.log('extra sign failed ->', res); break }
  }
  res = await service.handle('cardWorldSaveLineup', {
    authToken: 't',
    slots: [
      { key: 'fw', playerId: 'p1' }, { key: 'lm', playerId: 'p2' }, { key: 'rm', playerId: 'p5' },
      { key: 'cb', playerId: 'p3' }, { key: 'gk', playerId: 'p4' }
    ]
  }, ctx)
  expect('saveLineup 完整阵容通过', res.success === true && Number(res.power) > 0, res)

  const firstBattle = await service.handle('cardWorldBattle', { authToken: 't', scoreMine: 9, scoreOpp: 0 }, ctx)
  expect('battle 成功', firstBattle.success === true && typeof firstBattle.scoreMine === 'number'
    && firstBattle.myRows.length > 0, firstBattle)
  expect('battle 忽略前端上传分数', firstBattle.scoreMine <= 5 && firstBattle.scoreOpp <= 5, firstBattle)

  const secondBattle = await service.handle('cardWorldBattle', { authToken: 't' }, ctx)
  expect('battle 同键同结果（确定性）', secondBattle.scoreMine === firstBattle.scoreMine
    && secondBattle.scoreOpp === firstBattle.scoreOpp, { firstBattle, secondBattle })

  res = await service.handle('cardWorldBattleLog', { authToken: 't' }, ctx)
  expect('战报写入并可读', res.success === true && res.rows.length >= 1, res)

  /* 14. 分页读取完整性：卡片数量与档案一致 */
  res = await service.handle('cardWorldAlbum', { authToken: 't' }, ctx)
  expect('album 与卡册数量一致', res.success === true && res.tiles.length === docs.card_world_cards.length, res)

  console.log(failures === 0 ? 'ALL PASS' : ('FAILED ' + failures))
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(function (error) {
  console.error('test crashed:', error)
  process.exit(2)
})
