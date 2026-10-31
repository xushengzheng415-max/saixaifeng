#!/usr/bin/env node
/**
 * 赛小蜂足球世界（球员端小程序）工程自检
 *
 * 覆盖：
 * 1. 确定性引擎（签约 / 配额 / 阵容 / 轻对战 / 会员 / 战报）
 * 2. 小程序工程结构（app.json 页面存在、页面 json 合法）
 * 3. WXML 表达式限制（禁止比较、三元、&&、数组索引、方法调用）
 * 4. 所有 js 文件 node --check（含 utils 与页面）
 * 5. 玩法代码内不得出现 Math.random
 *
 * 运行：node tools/test-world-player-miniprogram.cjs
 */

'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const cp = require('child_process')

const ROOT = path.join(__dirname, '..')
const PROJECT = path.join(ROOT, 'miniprogram-world')
const ENGINE = require(path.join(PROJECT, 'utils', 'engine.js'))
const MOCK = require(path.join(PROJECT, 'utils', 'mock.js'))

let passed = 0
const failures = []

function check(name, fn) {
  try {
    fn()
    passed += 1
    console.log('  PASS  ' + name)
  } catch (err) {
    failures.push({ name, error: err })
    console.log('  FAIL  ' + name + ' -> ' + err.message)
  }
}

function listFiles(dir, extension) {
  const result = []
  if (!fs.existsSync(dir)) return result
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      result.push(...listFiles(full, extension))
    } else if (entry.name.endsWith(extension)) {
      result.push(full)
    }
  }
  return result
}

const players = MOCK.allPlayers()
const playersById = {}
players.forEach((p) => {
  playersById[p.playerId] = p
})

const TODAY = '2026-10-31'

function quotaWith(overrides) {
  return Object.assign({
    dateKey: TODAY,
    freeTotal: 1,
    freeUsed: 0,
    directedLeft: 0
  }, overrides || {})
}

function completeSlots() {
  const slots = ENGINE.buildSlots(5)
  slots[0].playerId = 'p_1001'
  slots[1].playerId = 'p_1007'
  slots[2].playerId = 'p_1012'
  slots[3].playerId = 'p_1003'
  slots[4].playerId = 'p_1004'
  return slots
}

/* ---------------- 1. 引擎 ---------------- */

check('自然日键按 UTC+8 计算，与设备时区无关', () => {
  assert.strictEqual(ENGINE.dateKeyShanghai(new Date('2026-10-31T00:00:00+08:00').getTime()), '2026-10-31')
  assert.strictEqual(ENGINE.dateKeyShanghai(new Date('2026-10-30T16:30:00Z').getTime()), '2026-10-31')
  assert.strictEqual(ENGINE.dateKeyShanghai(new Date('2026-10-30T15:30:00Z').getTime()), '2026-10-30')
})

check('同城签约：同输入同结果，并跳过已拥有', () => {
  const opts = {
    players,
    cityCode: MOCK.CITY.code,
    ownedIds: ['p_1001'],
    cursor: 0,
    mode: 'free_daily',
    dateKey: TODAY,
    userId: 'u_1',
    quota: quotaWith(),
    tier: 'none'
  }
  const first = ENGINE.signSameCity(opts)
  const second = ENGINE.signSameCity(opts)
  assert.strictEqual(first.ok, true)
  assert.strictEqual(first.player.playerId, 'p_1002')
  assert.strictEqual(first.player.playerId, second.player.playerId)
  assert.strictEqual(first.deterministicKey, second.deterministicKey)
  assert.strictEqual(first.deterministicKey.indexOf('sc:330100:2026-10-31:u_1:cursor:0'), 0)
  assert.ok(first.quota.freeUsed === 1)
})

check('同城签约：游标推进后取下一位', () => {
  const first = ENGINE.signSameCity({
    players, cityCode: MOCK.CITY.code, ownedIds: ['p_1001'], cursor: 0,
    mode: 'free_daily', dateKey: TODAY, userId: 'u_1', quota: quotaWith(), tier: 'member'
  })
  const next = ENGINE.signSameCity({
    players, cityCode: MOCK.CITY.code, ownedIds: ['p_1001', first.player.playerId], cursor: first.nextCursor,
    mode: 'free_daily', dateKey: TODAY, userId: 'u_1', quota: first.quota, tier: 'member'
  })
  assert.strictEqual(first.player.playerId, 'p_1002')
  assert.strictEqual(next.player.playerId, 'p_1003')
  assert.strictEqual(next.quota.freeUsed, 2)
})

check('免费签约配额：普通 1 次 / 会员 2 次，用完返回 QUOTA_EXCEEDED', () => {
  const first = ENGINE.signSameCity({
    players, cityCode: MOCK.CITY.code, ownedIds: [], cursor: 0,
    mode: 'free_daily', dateKey: TODAY, userId: 'u_2', quota: quotaWith(), tier: 'none'
  })
  assert.strictEqual(first.ok, true)
  const second = ENGINE.signSameCity({
    players, cityCode: MOCK.CITY.code, ownedIds: [first.player.playerId], cursor: first.nextCursor,
    mode: 'free_daily', dateKey: TODAY, userId: 'u_2', quota: first.quota, tier: 'none'
  })
  assert.strictEqual(second.ok, false)
  assert.strictEqual(second.code, ENGINE.CODES.QUOTA_EXCEEDED)

  const memberQuota = ENGINE.normalizeQuota({ dateKey: 'old', freeUsed: 3 }, 'member', TODAY)
  assert.strictEqual(memberQuota.freeTotal, 2)
  assert.strictEqual(memberQuota.freeUsed, 0)
})

check('跨自然日后免费额度重置', () => {
  const q = ENGINE.normalizeQuota({ dateKey: '2026-10-30', freeTotal: 1, freeUsed: 1, directedLeft: 2 }, 'none', TODAY)
  assert.strictEqual(q.dateKey, TODAY)
  assert.strictEqual(q.freeUsed, 0)
  assert.strictEqual(q.directedLeft, 2)
  assert.strictEqual(ENGINE.dailyFreeLeft(q, 'none'), 1)
})

check('定向签约：按位置筛选且消耗定向次数', () => {
  const noQuota = ENGINE.signSameCity({
    players, cityCode: MOCK.CITY.code, ownedIds: ['p_1001'], cursor: 0,
    mode: 'directed_position', filter: { position: 'MF' }, dateKey: TODAY, userId: 'u_3',
    quota: quotaWith(), tier: 'none'
  })
  assert.strictEqual(noQuota.code, ENGINE.CODES.QUOTA_EXCEEDED)

  const withQuota = ENGINE.signSameCity({
    players, cityCode: MOCK.CITY.code, ownedIds: ['p_1001'], cursor: 0,
    mode: 'directed_position', filter: { position: 'MF' }, dateKey: TODAY, userId: 'u_3',
    quota: quotaWith({ directedLeft: 2 }), tier: 'none'
  })
  assert.strictEqual(withQuota.ok, true)
  assert.strictEqual(withQuota.player.group, 'MF')
  assert.strictEqual(withQuota.quota.directedLeft, 1)
  assert.strictEqual(withQuota.quota.freeUsed, 0)
})

check('跨城拒绝与无可用球员返回明确编码', () => {
  const wrongCity = ENGINE.signSameCity({
    players, cityCode: '999999', ownedIds: [], cursor: 0,
    mode: 'free_daily', dateKey: TODAY, userId: 'u_4', quota: quotaWith(), tier: 'none'
  })
  assert.strictEqual(wrongCity.code, ENGINE.CODES.NOT_SAME_CITY)

  const cityPool = players.filter((p) => p.cityCode === MOCK.CITY.code)
  const allOwned = ENGINE.signSameCity({
    players, cityCode: MOCK.CITY.code, ownedIds: cityPool.map((p) => p.playerId), cursor: 0,
    mode: 'free_daily', dateKey: TODAY, userId: 'u_5', quota: quotaWith(), tier: 'none'
  })
  assert.strictEqual(allOwned.code, ENGINE.CODES.NO_ELIGIBLE_CARD)
})

check('阵容校验：空位 / 重复 / 缺门将 / 门将位非门将', () => {
  const empty = ENGINE.validateLineup({
    slots: ENGINE.buildSlots(5), rosterSize: 5, ownedIds: [], playersById, unlocks: {}
  })
  assert.strictEqual(empty.code, ENGINE.CODES.LINEUP_INVALID)

  const slots = completeSlots()
  slots[1].playerId = slots[0].playerId
  const duplicate = ENGINE.validateLineup({
    slots, rosterSize: 5, ownedIds: ['p_1001', 'p_1007', 'p_1012', 'p_1003', 'p_1004'], playersById, unlocks: {}
  })
  assert.strictEqual(duplicate.code, ENGINE.CODES.LINEUP_INVALID)

  const noGk = completeSlots()
  noGk[4].playerId = 'p_1003'
  const wrongGk = ENGINE.validateLineup({
    slots: noGk, rosterSize: 5, ownedIds: ['p_1001', 'p_1007', 'p_1012', 'p_1003', 'p_1004'], playersById, unlocks: {}
  })
  assert.strictEqual(wrongGk.code, ENGINE.CODES.LINEUP_INVALID)

  const ok = ENGINE.validateLineup({
    slots: completeSlots(), rosterSize: 5,
    ownedIds: ['p_1001', 'p_1007', 'p_1012', 'p_1003', 'p_1004'], playersById, unlocks: {}
  })
  assert.strictEqual(ok.ok, true)
  assert.ok(ok.power > 300)
})

check('8 / 11 人编制未解锁返回 ROSTER_LOCKED，解锁后可校验', () => {
  const locked = ENGINE.validateLineup({
    slots: ENGINE.buildSlots(8), rosterSize: 8, ownedIds: [], playersById,
    unlocks: { size8: false, size11: false }
  })
  assert.strictEqual(locked.code, ENGINE.CODES.ROSTER_LOCKED)
  assert.strictEqual(ENGINE.buildSlots(11).length, 11)
  assert.strictEqual(ENGINE.PITCH_ROWS[11].reduce((sum, row) => sum + row.length, 0), 11)
})

check('系统对手：确定性生成 5 名不重复同城球员', () => {
  const a = ENGINE.buildSystemOpponent({ players, cityCode: MOCK.CITY.code, seed: 'seed-1' })
  const b = ENGINE.buildSystemOpponent({ players, cityCode: MOCK.CITY.code, seed: 'seed-1' })
  assert.strictEqual(a.opponentId, b.opponentId)
  assert.strictEqual(a.slots.length, 5)
  const ids = a.slots.map((s) => s.playerId)
  assert.strictEqual(new Set(ids).size, 5)
  ids.forEach((id) => {
    assert.ok(playersById[id], '对手球员存在')
    assert.strictEqual(playersById[id].cityCode, MOCK.CITY.code)
  })
})

check('轻对战：同键同结果，且比分在 0..5', () => {
  const opponent = ENGINE.buildSystemOpponent({ players, cityCode: MOCK.CITY.code, seed: 'seed-x' })
  const input = {
    lineupId: 'lu_5_u_1',
    lineupSlots: completeSlots(),
    opponentSlots: opponent.slots,
    playersById,
    opponent: { type: opponent.type, opponentId: opponent.opponentId }
  }
  const one = ENGINE.battleResult(input)
  const two = ENGINE.battleResult(input)
  assert.deepStrictEqual(one, two)
  assert.ok(one.scoreMine >= 0 && one.scoreMine <= 5)
  assert.ok(one.scoreOpp >= 0 && one.scoreOpp <= 5)
  assert.ok(['win', 'lose', 'draw'].includes(one.result))
  assert.strictEqual(one.deterministicKey, 'bt:lu_5_u_1:' + opponent.type + ':' + opponent.opponentId + ':rule_v1')
})

check('会员档位不参与轻对战出分', () => {
  const opponent = ENGINE.buildSystemOpponent({ players, cityCode: MOCK.CITY.code, seed: 'seed-x' })
  const base = {
    lineupId: 'lu_5_u_1', lineupSlots: completeSlots(), opponentSlots: opponent.slots, playersById,
    opponent: { type: opponent.type, opponentId: opponent.opponentId }
  }
  const none = ENGINE.battleResult(base)
  const member = ENGINE.battleResult(Object.assign({}, base, { tier: 'member', paid: true }))
  assert.strictEqual(none.scoreMine, member.scoreMine)
  assert.strictEqual(none.scoreOpp, member.scoreOpp)
  assert.strictEqual(none.result, member.result)
})

check('未成年自动续费被阻断，成年账号可设置', () => {
  const minor = ENGINE.setAutoRenew({ tier: 'member', isMinor: true }, true)
  assert.strictEqual(minor.ok, false)
  assert.strictEqual(minor.code, ENGINE.CODES.MINOR_NO_AUTORENEW)
  const adult = ENGINE.setAutoRenew({ tier: 'member', isMinor: false, autoRenew: false }, true)
  assert.strictEqual(adult.ok, true)
  assert.strictEqual(adult.member.autoRenew, true)
})

check('战报最多保留 20 条', () => {
  const entries = []
  for (let i = 0; i < 26; i++) entries.push({ id: 'b' + i })
  assert.strictEqual(ENGINE.trimBattleLog(entries, 20).length, 20)
  assert.strictEqual(ENGINE.trimBattleLog(entries, 20)[0].id, 'b0')
})

check('阵容视图四行结构与槽位一一对应', () => {
  const slots = completeSlots()
  const rows = ENGINE.pitchRows(slots, playersById, 'lm')
  assert.strictEqual(rows.length, 4)
  const keys = rows.reduce((acc, row) => acc.concat(row.cells.map((c) => c.key)), [])
  assert.deepStrictEqual(keys, ['fw', 'lm', 'rm', 'cb', 'gk'])
  const active = rows[1].cells[0]
  assert.strictEqual(active.activeClass, 'is-active')
})

check('演示数据：同城样例覆盖 4 个位置组，卡图路径为包内资源', () => {
  const city = players.filter((p) => p.cityCode === MOCK.CITY.code)
  const groups = new Set(city.map((p) => p.group))
  assert.deepStrictEqual([...groups].sort(), ['DF', 'FW', 'GK', 'MF'])
  city.forEach((p) => assert.ok(p.cardUrl.startsWith('/assets/')))
})

/* ---------------- 2. 工程结构 ---------------- */

check('app.json 声明的页面目录齐全', () => {
  const app = JSON.parse(fs.readFileSync(path.join(PROJECT, 'app.json'), 'utf8'))
  assert.ok(Array.isArray(app.pages) && app.pages.length >= 5)
  app.pages.forEach((page) => {
    const dir = path.dirname(path.join(PROJECT, page))
    const base = path.basename(page)
    assert.ok(fs.existsSync(path.join(dir, base + '.js')), '缺少 js: ' + page)
    assert.ok(fs.existsSync(path.join(dir, base + '.wxml')), '缺少 wxml: ' + page)
    assert.ok(fs.existsSync(path.join(dir, base + '.wxss')), '缺少 wxss: ' + page)
    assert.ok(fs.existsSync(path.join(dir, base + '.json')), '缺少 json: ' + page)
  })
})

check('所有 json 文件可解析', () => {
  const files = listFiles(PROJECT, '.json')
  assert.ok(files.length >= 10)
  files.forEach((file) => JSON.parse(fs.readFileSync(file, 'utf8')))
})

check('usingComponents 指向的组件存在', () => {
  const files = listFiles(PROJECT, '.json')
  files.forEach((file) => {
    const json = JSON.parse(fs.readFileSync(file, 'utf8'))
    const components = json.usingComponents || {}
    Object.keys(components).forEach((name) => {
      const target = components[name]
      if (!target.startsWith('/')) return
      const base = path.join(PROJECT, target)
      assert.ok(fs.existsSync(base + '.js'), '组件缺少 js: ' + target)
      assert.ok(fs.existsSync(base + '.wxml'), '组件缺少 wxml: ' + target)
    })
  })
})

/* ---------------- 3. WXML 表达式限制 ---------------- */

check('WXML 仅使用简单插值 / 取反 / ||', () => {
  const files = listFiles(PROJECT, '.wxml')
  assert.ok(files.length >= 5)
  const allowed = /^[A-Za-z0-9_.\s|!]+$/
  files.forEach((file) => {
    const text = fs.readFileSync(file, 'utf8')
    const matches = text.match(/\{\{[^}]*\}\}/g) || []
    matches.forEach((raw) => {
      const expr = raw.slice(2, -2).trim()
      assert.ok(allowed.test(expr), path.basename(file) + ' 非法 WXML 表达式: ' + raw)
    })
  })
})

/* ---------------- 4. JS 语法与零随机 ---------------- */

check('所有 js 文件通过 node --check', () => {
  const files = listFiles(PROJECT, '.js')
  assert.ok(files.length >= 14)
  files.forEach((file) => {
    cp.execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })
  })
})

check('玩法代码内不含 Math.random', () => {
  const files = listFiles(PROJECT, '.js')
  files.forEach((file) => {
    const text = fs.readFileSync(file, 'utf8')
    assert.ok(!text.includes('Math.random'), '发现随机数: ' + path.relative(ROOT, file))
  })
})

/* ---------------- 5. 资源体积 ---------------- */

check('包内资源合计不超过 2MB（主包限制）', () => {
  const files = listFiles(PROJECT, '.png').concat(listFiles(PROJECT, '.jpg'), listFiles(PROJECT, '.svg'))
  const total = files.reduce((sum, file) => sum + fs.statSync(file).size, 0)
  assert.ok(total < 2 * 1024 * 1024, '资源合计 ' + Math.round(total / 1024) + 'KB')
  console.log('        资源合计 ' + Math.round(total / 1024) + 'KB / 2048KB')
})

/* ---------------- 6. 本地适配器闭环（stub wx storage） ---------------- */

global.wx = {
  _store: {},
  getStorageSync: function (key) {
    return this._store[key]
  },
  setStorageSync: function (key, value) {
    this._store[key] = value
  },
  removeStorageSync: function (key) {
    delete this._store[key]
  }
}

const STORE = require(path.join(PROJECT, 'utils', 'store.js'))
const API = require(path.join(PROJECT, 'utils', 'api.js'))

function checkAsync(name, fn) {
  return fn().then(() => {
    passed += 1
    console.log('  PASS  ' + name)
  }).catch((err) => {
    failures.push({ name, error: err })
    console.log('  FAIL  ' + name + ' -> ' + err.message)
  })
}

async function runFlowChecks() {
  await checkAsync('本地适配器：签约 → 组阵 → 轻对战 → 战报闭环', async () => {
    wx._store = {}
    STORE.getState()

    const album = await API.getAlbum()
    assert.strictEqual(album.tiles.length, 4)
    assert.strictEqual(album.freeLeft, 1)
    assert.strictEqual(album.signDisabled, false)

    const signed = await API.signSameCity({ mode: 'free_daily' })
    assert.strictEqual(signed.card.playerId, 'p_1002')
    assert.strictEqual(signed.signQuota.dailyFreeLeft, 0)

    let rejected = false
    try {
      await API.signSameCity({ mode: 'free_daily' })
    } catch (err) {
      rejected = true
      assert.strictEqual(err.code, ENGINE.CODES.QUOTA_EXCEEDED)
    }
    assert.ok(rejected, '第二次免费签约应被拒绝')

    const afterSlot = await API.setSlot('rm', 'p_1002')
    assert.strictEqual(afterSlot.filledText, '5 / 5 人')
    assert.strictEqual(afterSlot.canChallenge, true)
    assert.strictEqual(afterSlot.rows.length, 4)

    const saved = await API.saveLineup(null)
    assert.ok(saved.power > 300)

    const battle = await API.battle()
    assert.ok(battle.scoreMine >= 0 && battle.scoreMine <= 5)
    assert.strictEqual(battle.myRows.length, 4)
    assert.strictEqual(battle.opponentRows.length, 4)
    assert.ok(battle.deterministicKey.indexOf('bt:') === 0)

    const log = await API.getBattleLog()
    assert.strictEqual(log.isEmpty, false)
    assert.strictEqual(log.rows.length, 1)

    let lockedCode = ''
    try {
      await API.setRosterSize(8)
    } catch (err) {
      lockedCode = err.code
    }
    assert.strictEqual(lockedCode, ENGINE.CODES.ROSTER_LOCKED)
  })

  await checkAsync('本地适配器：未成年账号不能开启自动续费', async () => {
    wx._store = {}
    const state = STORE.getState()
    state.membership.isMinor = true
    state.membership.tier = 'member'
    STORE.save()
    let code = ''
    try {
      await API.setAutoRenew(true)
    } catch (err) {
      code = err.code
    }
    assert.strictEqual(code, ENGINE.CODES.MINOR_NO_AUTORENEW)
  })
}

/* ---------------- 结果 ---------------- */

function summarize() {
  console.log('')
  console.log('通过 ' + passed + ' 项，失败 ' + failures.length + ' 项')
  if (failures.length) {
    failures.forEach((f) => {
      console.log('')
      console.log('失败: ' + f.name)
      console.log((f.error && f.error.stack) || String(f.error))
    })
    process.exit(1)
  }
  console.log('OK: 球员端小程序工程自检通过')
}

runFlowChecks().then(summarize).catch((err) => {
  console.error(err)
  process.exit(1)
})
