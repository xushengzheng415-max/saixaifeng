'use strict'
const assert = require('node:assert/strict')
const teamTactics = require('../cloudfunctions/getMiniWorkspace/teamTactics.cjs')
const formationRules = require('../cloudfunctions/getMiniWorkspace/sharedFormation.cjs')
const miniTactics = require('../miniprogram/utils/team-tactics.js')

const identity = { user: { _id: 'owner-a', phone: '13800000000' }, openId: 'open-a' }
const team = { _id: 'team-a', name: '赛小蜂 U10 梯队', orgId: 'org-a' }
const players = [
  { _id: 'p1', teamId: 'team-a', name: '门将' },
  { _id: 'p2', teamId: 'team-a', name: '后卫甲' },
  { _id: 'p3', teamId: 'team-a', name: '后卫乙' },
  { _id: 'p4', teamId: 'team-a', name: '前卫' },
  { _id: 'p5', teamId: 'team-a', name: '前锋' },
  { _id: 'p6', teamId: 'team-a', name: '替补甲' },
  { _id: 'p7', teamId: 'team-a', name: '替补乙' },
  { _id: 'p-other', teamId: 'team-b', name: '外队球员' }
]

function formationFor(size) {
  const rows = formationRules.formationsFor(size)
  assert.ok(rows.length, 'formation data missing for ' + size)
  return rows[0]
}

function payload(size = 5) {
  const formation = formationFor(size)
  return {
    name: '高位压迫测试',
    matchSize: size,
    formation: formation.id,
    direction: 'attack',
    positions: formation.positions.map((row, index) => ({ role: row.role, playerId: 'p' + (index + 1) })),
    opponentPositions: formation.positions.slice(0, 3).map((row, index) => ({ role: row.role, number: String(7 + index) })),
    substituteIds: size === 5 ? ['p6', 'p7'] : []
  }
}

function database() {
  const collections = new Set()
  const store = {}
  const clone = value => structuredClone(value)
  function ensure(name) {
    if (!collections.has(name)) {
      const error = new Error('Db or Table not exist')
      error.code = -502005
      throw error
    }
    store[name] = store[name] || []
  }
  const db = {
    command: {},
    serverDate: () => new Date('2026-11-03T02:00:00Z'),
    createCollection: async name => { collections.add(name); store[name] = store[name] || [] },
    runTransaction: async callback => callback({ collection: name => collection(name) }),
    collection: name => collection(name),
    get store() { return store }
  }
  function collection(name) {
    return {
      where(where) {
        return {
          limit() { return this },
          get: async () => {
            ensure(name)
            return { data: clone(store[name].filter(row => Object.keys(where || {}).every(key => row[key] === where[key]))) }
          }
        }
      },
      async add({ data }) {
        ensure(name)
        const row = Object.assign({}, clone(data), { _id: 'tactic-' + (store[name].length + 1) })
        store[name].push(row)
        return { _id: row._id }
      },
      doc(id) {
        return {
          async get() {
            ensure(name)
            const row = store[name].find(item => item._id === id)
            if (!row) throw new Error('document.getfail document with _id does not exist')
            return { data: clone(row) }
          },
          async update({ data }) {
            ensure(name)
            const index = store[name].findIndex(item => item._id === id)
            if (index < 0) throw new Error('document.getfail document with _id does not exist')
            store[name][index] = Object.assign({}, store[name][index], clone(data))
            return { stats: { updated: 1 } }
          },
          async remove() {
            ensure(name)
            store[name] = store[name].filter(item => item._id !== id)
            return { stats: { removed: 1 } }
          }
        }
      }
    }
  }
  return db
}

function deps(overrides = {}) {
  let workspace = Object.assign({ id: 'workspace-a', type: 'team', teamId: 'team-a', orgId: 'org-a', permissions: ['team.view', 'team.manage'] }, overrides.workspace || {})
  return {
    setWorkspace(value) { workspace = value },
    findWorkspaceForAction: async () => ({ workspace }),
    loadTeams: async () => (overrides.teams || [team]),
    safeGetTeamPlayers: async teamId => (overrides.players || players).filter(item => String(item.teamId) === String(teamId))
  }
}

async function run() {
  const db = database(), dependency = deps()
  const listEmpty = await teamTactics.list(db, identity, { workspaceId: 'workspace-a', teamId: 'team-a' }, dependency)
  assert.equal(listEmpty.success, true)
  assert.equal(listEmpty.tactics.length, 0)
  assert.equal(listEmpty.canManage, true)

  const created = await teamTactics.save(db, identity, { workspaceId: 'workspace-a', teamId: 'team-a', ...payload() }, dependency)
  assert.equal(created.success, true)
  assert.equal(db.store.team_tactics.length, 1)
  assert.equal(db.store.team_tactics[0].orgId, 'org-a')
  assert.equal(db.store.team_tactics[0].status, 'active')
  assert.equal(db.store.team_tactics[0].version, 1)
  assert.equal(db.store.team_tactics[0].substituteIds.length, 2)
  assert.ok(db.store.team_tactics[0].positions.every(row => row.playerId))
  assert.equal(db.store.team_tactics[0].direction, 'attack')
  assert.equal(db.store.team_tactics[0].opponentPositions.length, 3)
  assert.equal(db.store.team_tactics[0].opponentPositions[0].number, '7')
  // 未传坐标时服务端按阵型推导默认点位；我方球门在左、对方球门在右。
  assert.ok(db.store.team_tactics[0].positions.every(row => Number.isFinite(row.x) && Number.isFinite(row.y)))
  assert.ok(db.store.team_tactics[0].opponentPositions.every(row => Number.isFinite(row.x) && Number.isFinite(row.y)))
  const keeperRow = db.store.team_tactics[0].positions.find(row => row.role === 'GK')
  assert.ok(keeperRow.x < 30, '我方门将默认应在左侧')
  assert.ok(db.store.team_tactics[0].opponentPositions.every(row => row.x > 50), '对方默认应在右半场')

  const listed = await teamTactics.list(db, identity, { workspaceId: 'workspace-a', teamId: 'team-a' }, dependency)
  assert.equal(listed.tactics.length, 1)
  assert.equal(listed.tactics[0].formationName, formationFor(5).name)
  assert.equal(listed.tactics[0].positions.length, 5)
  assert.equal(listed.tactics[0].direction, 'attack')
  assert.equal(listed.tactics[0].opponentPositions.length, 3)

  const updated = await teamTactics.save(db, identity, {
    workspaceId: 'workspace-a', teamId: 'team-a', tacticId: created.tactic.id, version: 1, ...payload()
  }, dependency)
  assert.equal(updated.success, true)
  assert.equal(db.store.team_tactics[0].version, 2)
  await assert.rejects(
    teamTactics.save(db, identity, { workspaceId: 'workspace-a', teamId: 'team-a', tacticId: created.tactic.id, version: 1, ...payload() }, dependency),
    /已更新/
  )

  const incomplete = { ...payload(), positions: payload().positions.slice(0, 4) }
  await assert.rejects(teamTactics.save(db, identity, { workspaceId: 'workspace-a', teamId: 'team-a', ...incomplete }, dependency), /排满我方位置/)
  const duplicated = { ...payload(), substituteIds: ['p6', 'p6'] }
  assert.equal((await teamTactics.save(db, identity, { workspaceId: 'workspace-a', teamId: 'team-a', ...duplicated }, dependency)).tactic.substituteIds.length, 1)
  const outsider = { ...payload(), positions: payload().positions.map((row, index) => index === 0 ? { ...row, playerId: 'p-other' } : row) }
  await assert.rejects(teamTactics.save(db, identity, { workspaceId: 'workspace-a', teamId: 'team-a', ...outsider }, dependency), /我方位置与球员不一致/)

  const roles = formationFor(5).positions.map(row => row.role)
  const badNumber = { ...payload(), opponentPositions: [{ role: roles[0], number: '100' }] }
  await assert.rejects(teamTactics.save(db, identity, { workspaceId: 'workspace-a', teamId: 'team-a', ...badNumber }, dependency), /对方号码只能填/)
  const duplicateNumber = { ...payload(), opponentPositions: [{ role: roles[0], number: '9' }, { role: roles[1], number: '09' }] }
  await assert.rejects(teamTactics.save(db, identity, { workspaceId: 'workspace-a', teamId: 'team-a', ...duplicateNumber }, dependency), /对方号码不能重复/)
  const badRole = { ...payload(), opponentPositions: [{ role: 'NOPE', number: '9' }] }
  await assert.rejects(teamTactics.save(db, identity, { workspaceId: 'workspace-a', teamId: 'team-a', ...badRole }, dependency), /对方位置不属于当前阵型/)
  const defend = await teamTactics.save(db, identity, { workspaceId: 'workspace-a', teamId: 'team-a', ...payload(), direction: 'defend', opponentPositions: [] }, dependency)
  assert.equal(defend.tactic.direction, 'defend')
  assert.equal(defend.tactic.opponentPositions.length, 0)

  const legacyPublic = teamTactics.publicTactic({
    _id: 'legacy-1', teamId: 'team-a', name: '旧战术', matchSize: 5,
    formation: formationFor(5).id, version: 2,
    positions: formationFor(5).positions.map((row, index) => ({ role: row.role, playerId: 'p' + (index + 1) }))
  })
  assert.equal(legacyPublic.direction, 'attack')
  assert.equal(legacyPublic.opponentPositions.length, 0)

  const readonly = deps({ workspace: { permissions: ['team.view'] } })
  await assert.rejects(teamTactics.save(db, identity, { workspaceId: 'workspace-a', teamId: 'team-a', ...payload() }, readonly), /没有编辑/)

  const otherTeam = deps({ teams: [{ _id: 'team-b', name: 'B 队', orgId: 'org-a' }] })
  await assert.rejects(teamTactics.list(db, identity, { workspaceId: 'workspace-a', teamId: 'team-a' }, otherTeam), /球队不存在/)

  const noView = deps({ workspace: { permissions: [] } })
  await assert.rejects(teamTactics.list(db, identity, { workspaceId: 'workspace-a', teamId: 'team-a' }, noView), /没有查看/)

  const removed = await teamTactics.remove(db, identity, { workspaceId: 'workspace-a', teamId: 'team-a', tacticId: created.tactic.id, version: 2 }, dependency)
  assert.equal(removed.success, true)
  assert.equal(db.store.team_tactics.some(item => item._id === created.tactic.id), false)

  const formation = formationFor(8)
  const miniPlayers = formation.positions.map((row, index) => ({ id: 'mini-' + index, name: '球员' + index }))
  const slots = miniTactics.slotsFor(8, formation.id, formation.positions.map((row, index) => ({ role: row.role, playerId: 'mini-' + index })))
  assert.equal(slots.length, 8)
  assert.equal(slots.filter(row => row.playerId).length, 8)
  const changed = miniTactics.preserveSlots(8, miniTactics.formationOptions(8)[0].id, slots)
  assert.equal(changed[0].playerId, slots[0].playerId)
  const moved = miniTactics.assignStarter(miniTactics.slotsFor(8, formation.id, slots), 1, slots[0].playerId)
  assert.equal(moved[0].playerId, '')
  assert.equal(moved[1].playerId, slots[0].playerId)
  const valid = miniTactics.validateDraft({ name: '测试', matchSize: 8, formation: formation.id, slots, substituteIds: [miniPlayers[7].id] }, miniPlayers)
  assert.equal(valid.ok, false)
  const benchOnly = miniTactics.validateDraft({ name: '测试', matchSize: 8, formation: formation.id, slots, substituteIds: [] }, miniPlayers)
  assert.equal(benchOnly.ok, true)
  const missingSlot = miniTactics.validateDraft({ name: '测试', matchSize: 8, formation: formation.id, slots: slots.map((row, index) => index ? row : { ...row, playerId: '' }), substituteIds: [] }, miniPlayers)
  assert.equal(missingSlot.ok, false)
  assert.match(missingSlot.message, /排满/)
  const duplicateSlot = miniTactics.validateDraft({ name: '测试', matchSize: 8, formation: formation.id, slots: slots.map((row, index) => index === 1 ? { ...row, playerId: slots[0].playerId } : row), substituteIds: [] }, miniPlayers)
  assert.equal(duplicateSlot.ok, false)

  const rivalSlots = miniTactics.rivalSlotsFor(8, formation.id, formation.positions.slice(0, 3).map((row, index) => ({ role: row.role, number: String(9 + index) })))
  assert.equal(rivalSlots.length, 8)
  assert.equal(rivalSlots.filter(row => row.number).length, 3)

  // 横版球场：我方球门在左、对方球门在右，纵轴居中；默认点位按阵型深度推导，不再随方向整盘翻转。
  const board = miniTactics.boardSlots(8, formation.id)
  const keeperIndex = formation.positions.findIndex(row => row.role === 'GK')
  const leftOf = style => Number(style.match(/left:([\d.]+)%/)[1])
  const topOf = style => Number(style.match(/top:([\d.]+)%/)[1])
  assert.ok(keeperIndex >= 0, '阵型数据缺少门将位置')
  assert.ok(leftOf(board.ours[keeperIndex].style) < 30, '我方门将应贴左侧球门')
  assert.ok(leftOf(board.rivals[keeperIndex].style) > 70, '对方门将应贴右侧球门')
  assert.ok(Math.abs(topOf(board.ours[keeperIndex].style) - 50) < 6, '我方门将纵轴应居中')
  assert.ok(Math.abs(topOf(board.rivals[keeperIndex].style) - 50) < 6, '对方门将纵轴应居中')
  assert.ok(board.ours.every(slot => leftOf(slot.style) >= miniTactics.POINT_MIN_X && leftOf(slot.style) <= miniTactics.POINT_MAX_X))
  assert.ok(board.rivals.every(slot => topOf(slot.style) >= miniTactics.POINT_MIN_Y && topOf(slot.style) <= miniTactics.POINT_MAX_Y))
  const farthest = board.ours.reduce((best, slot) => (slot.x > best.x ? slot : best), board.ours[0])
  assert.ok(farthest.x > board.ours[keeperIndex].x, '我方前锋应比门将更靠前')

  // 自由拖拽：点位夹在球场内并保留 1 位小数，非法值回落到边界。
  assert.equal(miniTactics.clampX(-20), miniTactics.POINT_MIN_X)
  assert.equal(miniTactics.clampX(200), miniTactics.POINT_MAX_X)
  assert.equal(miniTactics.clampY(0), miniTactics.POINT_MIN_Y)
  assert.equal(miniTactics.clampY(200), miniTactics.POINT_MAX_Y)
  assert.equal(miniTactics.clampX('43.27'), 43.3)
  assert.equal(miniTactics.normalizePoint('abc', 4, 96), null)
  assert.equal(miniTactics.slotStyle(43.27, 67.4), 'left:43.30%;top:67.40%;')

  // 自由拖拽后的坐标必须随球员一起保存并回读。
  const dragged = miniTactics.slotsFor(8, formation.id, [{ role: formation.positions[0].role, playerId: 'mini-0', x: 21.5, y: 71.2 }])
  assert.equal(dragged[0].x, 21.5)
  assert.equal(dragged[0].y, 71.2)
  assert.equal(dragged[0].slotStyle, 'left:21.50%;top:71.20%;')
  assert.equal(dragged.filter(row => row.playerId).length, 1)
  const draggedRivals = miniTactics.rivalSlotsFor(8, formation.id, [{ role: formation.positions[keeperIndex].role, number: '9', x: 66.4, y: 33.8 }])
  assert.equal(draggedRivals[keeperIndex].number, '9')
  assert.equal(draggedRivals[keeperIndex].x, 66.4)
  const keptPoint = miniTactics.preserveSlots(8, formation.id, [{ role: formation.positions[keeperIndex].role, playerId: 'mini-0', x: 15.5, y: 48 }])
  assert.equal(keptPoint[keeperIndex].x, 15.5)
  assert.equal(keptPoint[keeperIndex].slotStyle, 'left:15.50%;top:48.00%;')
  const keptRivalPoint = miniTactics.preserveRivalSlots(8, formation.id, [{ role: formation.positions[keeperIndex].role, number: '9', x: 84.5, y: 52 }])
  assert.equal(keptRivalPoint[keeperIndex].number, '9')
  assert.equal(keptRivalPoint[keeperIndex].x, 84.5)
  const clamped = miniTactics.slotsFor(8, formation.id, [{ role: formation.positions[keeperIndex].role, playerId: 'mini-0', x: 300, y: -10 }])
  assert.equal(clamped[keeperIndex].x, miniTactics.POINT_MAX_X)
  assert.equal(clamped[keeperIndex].y, miniTactics.POINT_MIN_Y)
  assert.equal(miniTactics.normalizeOpponentNumber('07'), '7')
  assert.equal(miniTactics.normalizeOpponentNumber('100'), '')
  assert.equal(miniTactics.normalizeOpponentNumber('0'), '')
  const rivalValid = miniTactics.validateDraft({
    name: '测试', matchSize: 8, formation: formation.id, direction: 'defend', slots,
    opponentSlots: [{ role: formation.positions[0].role, number: '9', x: 61.4, y: 22.5 }, { role: formation.positions[1].role, number: '10', x: 70, y: 48 }],
    substituteIds: []
  }, miniPlayers)
  assert.equal(rivalValid.ok, true)
  assert.equal(rivalValid.direction, 'defend')
  assert.equal(rivalValid.opponentPositions.length, 2)
  assert.ok(rivalValid.positions.every(row => Number.isFinite(row.x) && Number.isFinite(row.y)), '我方位置需带上拖拽坐标')
  assert.ok(rivalValid.opponentPositions.every(row => Number.isFinite(row.x) && Number.isFinite(row.y)), '对方位置需带上拖拽坐标')
  assert.equal(rivalValid.opponentPositions[0].x, 61.4)
  const rivalFreeform = miniTactics.validateDraft({
    name: '测试', matchSize: 8, formation: formation.id, slots,
    opponentSlots: [{ role: formation.positions[0].role, number: '9', x: 120, y: 4 }],
    substituteIds: []
  }, miniPlayers)
  assert.equal(rivalFreeform.ok, true)
  assert.equal(rivalFreeform.opponentPositions[0].x, miniTactics.POINT_MAX_X)
  assert.equal(rivalFreeform.opponentPositions[0].y, miniTactics.POINT_MIN_Y)
  const rivalDuplicate = miniTactics.validateDraft({
    name: '测试', matchSize: 8, formation: formation.id, slots,
    opponentSlots: [{ role: formation.positions[0].role, number: '9' }, { role: formation.positions[1].role, number: '09' }],
    substituteIds: []
  }, miniPlayers)
  assert.equal(rivalDuplicate.ok, false)
  assert.match(rivalDuplicate.message, /对方号码不能重复/)
  const rivalBroken = miniTactics.validateDraft({
    name: '测试', matchSize: 8, formation: formation.id, slots,
    opponentSlots: [{ role: formation.positions[0].role, number: '100' }],
    substituteIds: []
  }, miniPlayers)
  assert.equal(rivalBroken.ok, false)
  assert.match(rivalBroken.message, /对方号码只能填/)

  // 自由拖拽坐标：保存后回读一致，越界坐标由服务端夹到球场边界。
  const pointDb = database(), pointDeps = deps()
  const draggedPayload = {
    ...payload(),
    positions: payload().positions.map((row, index) => (index ? row : { ...row, x: 22.4, y: 63.7 })),
    opponentPositions: [{ role: formationFor(5).positions[0].role, number: '9', x: 74.6, y: 41.2 }]
  }
  const draggedSaved = await teamTactics.save(pointDb, identity, { workspaceId: 'workspace-a', teamId: 'team-a', ...draggedPayload }, pointDeps)
  assert.equal(draggedSaved.tactic.positions[0].x, 22.4)
  assert.equal(draggedSaved.tactic.positions[0].y, 63.7)
  assert.equal(draggedSaved.tactic.opponentPositions[0].x, 74.6)
  assert.equal(draggedSaved.tactic.opponentPositions[0].y, 41.2)
  const draggedListed = await teamTactics.list(pointDb, identity, { workspaceId: 'workspace-a', teamId: 'team-a' }, pointDeps)
  assert.equal(draggedListed.tactics[0].positions[0].x, 22.4)
  assert.equal(draggedListed.tactics[0].opponentPositions[0].x, 74.6)
  const outOfRange = { ...payload(), positions: payload().positions.map((row, index) => (index ? row : { ...row, x: 300, y: -50 })) }
  const fixed = await teamTactics.save(pointDb, identity, { workspaceId: 'workspace-a', teamId: 'team-a', ...outOfRange }, pointDeps)
  assert.equal(fixed.tactic.positions[0].x, 96)
  assert.equal(fixed.tactic.positions[0].y, 10)

  const free=require('../miniprogram/utils/tactics-free.js'),fs=require('node:fs'),vm=require('node:vm')
  assert.equal(fs.readFileSync('miniprogram/utils/tactics-free.js','utf8'),fs.readFileSync('cloudfunctions/getMiniWorkspace/tacticsFree.cjs','utf8'))
  const freeDb=database(),freeDeps=deps();freeDeps.safeGetTeamPlayers=async()=>{throw Error('Free board must not require official player positions')}
  const draft=free.seed(11);draft.tokens[0].x=81.75;draft.tokens[0].y=13.33;draft.ball={x:37.4,y:62.8}
  const freeCreated=await teamTactics.save(freeDb,identity,{teamId:'team-a',name:'自由战术',...draft},freeDeps)
  assert.equal(freeCreated.tactic.boardMode,'free');assert.equal(freeCreated.tactic.tokens.length,22);assert.equal(freeCreated.tactic.tokens[0].x,81.75);assert.equal(freeCreated.tactic.ball.y,62.8);assert(!Object.hasOwn(freeDb.store.team_tactics[0],'positions'))
  const freeList=await teamTactics.list(freeDb,identity,{teamId:'team-a'},freeDeps);assert.deepEqual(freeList.tactics[0].tokens,freeCreated.tactic.tokens)
  const freeSaved=await teamTactics.save(freeDb,identity,{teamId:'team-a',tacticId:freeCreated.tactic.id,version:1,name:'修改站位',...free.flip(draft),boardMode:'free'},freeDeps);assert.equal(freeSaved.tactic.version,2)
  await assert.rejects(teamTactics.save(freeDb,identity,{teamId:'team-a',tacticId:freeCreated.tactic.id,version:1,name:'过期覆盖',...draft},freeDeps),/已更新/)
  await assert.rejects(teamTactics.save(freeDb,identity,{teamId:'team-a',name:'无权限',...draft},deps({workspace:{permissions:['team.view']}})),/编辑/)
  await assert.rejects(teamTactics.save(freeDb,identity,{teamId:'team-b',name:'异队',...draft},freeDeps),/工作空间/)
  const bad=free.seed(5);bad.tokens[1].number=bad.tokens[0].number;await assert.rejects(teamTactics.save(freeDb,identity,{teamId:'team-a',name:'重复',...bad},freeDeps),/重复/)
  assert.throws(()=>free.normalize({tokens:[{id:'one',side:'alien',number:'1',x:1,y:1}]}),/我方/)
  assert.throws(()=>free.normalize({tokens:[{id:'one',side:'ours',number:'1',x:NaN,y:1}]}),/坐标/)
  const cloned=free.normalize({tokens:[],ball:{x:50,y:50}});assert.equal(cloned.tokens.length,0)
  let pageDef,activeUser={_id:'user-a',phone:'13800000001'}
  const page={setData(v){Object.assign(this.data,v)}},context={Page:v=>{pageDef=v},require:id=>id.includes('tactics-free')?free:{readContext:()=>({})},wx:{getStorageSync:()=>activeUser,showToast:()=>{}},console}
  vm.runInNewContext(fs.readFileSync('miniprogram/pages/team/tactics/board/board.js','utf8'),context);Object.assign(page,pageDef);page.data=structuredClone(pageDef.data);page._tokens=free.seed(11).tokens;page._ball={x:50,y:50};page._alive=true;page._account='user-a|13800000001';page.setData({boardWidth:800,boardHeight:360,canManage:true,interactionDisabled:false});page.paint();assert.equal(page.data.tokens.length,22)
  page.onMove({currentTarget:{dataset:{id:'ours-1'}},detail:{source:'touch',x:650,y:15}});assert(page._tokens[0].x>80,'Can freely cross the half line');assert(page.data.dirty);page.onMoveEnd();assert(page.data.tokens[0].pixelX>640)
  page.onMove({currentTarget:{dataset:{id:'ball'}},detail:{source:'touch',x:20,y:200}});assert.equal(page._ball.x,4.38)
  const priorFree=JSON.stringify(page._tokens);page.data.interactionDisabled=true;page.onMove({currentTarget:{dataset:{id:'ours-1'}},detail:{source:'touch',x:0,y:0}});assert.equal(JSON.stringify(page._tokens),priorFree)
  page.data.drawColor='red';activeUser={_id:'user-b',phone:'13800000002'};page.onShow();assert.equal(page.data.drawColor,'');assert.equal(page.data.tokens.length,0);assert(page.data.interactionDisabled)
  const bound=free.seed(5);bound.tokens[0].playerId='p2';bound.tokens[0].playerName='forged name';bound.tokens[0].number='8'
  const namedDeps=deps({players:players.map(p=>({...p,jerseyNumber:p._id==='p2'?'12':''}))})
  const boundSaved=await teamTactics.save(freeDb,identity,{teamId:'team-a',name:'本方球员阵容',...bound},namedDeps);assert.equal(boundSaved.tactic.tokens[0].playerId,'p2');assert.equal(boundSaved.tactic.tokens[0].playerName,'后卫甲');assert.equal(boundSaved.tactic.tokens[0].number,'12')
  bound.tokens[0].playerId='p-other';await assert.rejects(teamTactics.save(freeDb,identity,{teamId:'team-a',name:'异队球员',...bound},namedDeps),/不在本队/)
  const double=free.seed(5);double.tokens[0].playerId='p2';double.tokens[1].playerId='p2';assert.throws(()=>free.normalize(double),/同一球员/)
  activeUser={_id:'user-a',phone:'13800000001'};page._account='user-a|13800000001';page._tokens=free.seed(11).tokens;page._players=[{id:'p2',name:'后卫甲',number:'7'}];page._draggedAt=0;page.setData({interactionDisabled:false,canManage:true});page.editNumber({currentTarget:{dataset:{id:'ours-8'}}});assert(!page.data.playersOpen,'Single tap does not open our number modal');page.editNumber({currentTarget:{dataset:{id:'ours-8'}}});assert(page.data.playersOpen);assert.equal(page.data.playerRows[0].label,'7号 · 后卫甲');page.choosePlayer({currentTarget:{dataset:{id:'p2'}}});assert.equal(page._tokens.find(t=>t.id==='ours-8').playerId,'p2');assert.equal(page._tokens.find(t=>t.id==='ours-8').number,'7');assert.equal(page._tokens.find(t=>t.id==='ours-7').number,'8');free.normalize({tokens:page._tokens,ball:page._ball})
  page._selectedToken='ours-4';page.choosePlayer({currentTarget:{dataset:{id:'p2'}}});assert.equal(page._tokens.filter(t=>t.playerId==='p2').length,1);assert.equal(page._tokens.find(t=>t.id==='ours-4').playerId,'p2');free.normalize({tokens:page._tokens,ball:page._ball})
  const withExtras=free.seed(5);withExtras.tokens[0].temporaryName='临时测试队员';withExtras.tokens[0].x=73.2;withExtras.trails=[{color:'red',points:[{x:20,y:30},{x:55,y:63}]},{color:'blue',points:[{x:80,y:15},{x:43,y:58}]}]
  const extraSaved=await teamTactics.save(freeDb,identity,{teamId:'team-a',name:'带临时球员和轨迹',...withExtras},freeDeps);assert.equal(extraSaved.tactic.tokens[0].temporaryName,'临时测试队员');assert(!extraSaved.tactic.tokens[0].playerId);assert.deepEqual(extraSaved.tactic.trails,withExtras.trails);assert.deepEqual(Object.keys(freeDb.store),['team_tactics'])
  const readExtras=(await teamTactics.list(freeDb,identity,{teamId:'team-a'},freeDeps)).tactics.find(t=>t.id===extraSaved.tactic.id);assert.equal(readExtras.tokens[0].x,73.2);assert.deepEqual(readExtras.trails,withExtras.trails);assert.equal(free.flip(withExtras).trails[0].points[0].x,80)
  assert.throws(()=>free.normalize({...withExtras,tokens:[{...withExtras.tokens[0],playerId:'p2'}]}),/临时/);assert.throws(()=>free.normalize({...withExtras,trails:[{color:'green',points:[{x:1,y:1},{x:2,y:2}]}]}),/轨迹/)
  const prefs={},latest={...free.seed(7),id:'latest',name:'另一套阵容',version:1};let actor={_id:'remember-a',phone:'13800000001'},rows=[latest,readExtras],requestFailure=false,confirmDiscard=false
  const dependencies={readContext:()=>({currentWorkspace:{id:'team:team-a'}}),loadContext:async()=>({teams:[{id:'team-a'}]})}
  let restoredDef;const restoreContext={Page:v=>{restoredDef=v},require:id=>id.includes('tactics-free')?free:dependencies,wx:{getStorageSync:key=>key==='userInfo'?actor:prefs[key],setStorageSync:(key,val)=>{prefs[key]=val},cloud:{callFunction:async()=>{if(requestFailure)throw Error('读取断网');return {result:{success:true,tactics:rows,canManage:true}}}},showToast:()=>{},showModal:args=>args.success({confirm:confirmDiscard})},console};vm.runInNewContext(fs.readFileSync('miniprogram/pages/team/tactics/board/board.js','utf8'),restoreContext)
  const makePage=()=>{const p={...restoredDef,data:structuredClone(restoredDef.data),setData(v){Object.assign(this.data,v)}};p._alive=true;p._account=actor._id+'|'+actor.phone;p._tokens=[];p._trails=[];p._ball={x:50,y:50};p.data.teamId='team-a';p.data.boardWidth=800;p.data.boardHeight=360;return p}
  const remembered=makePage();remembered.finishPlan(readExtras);const reopened=makePage();await reopened.load('');assert.equal(reopened._id,readExtras.id);assert.equal(reopened._tokens[0].temporaryName,'临时测试队员');assert.deepEqual(JSON.parse(JSON.stringify(reopened._trails)),withExtras.trails)
  actor={_id:'remember-b',phone:'13800000002'};const otherUser=makePage();await otherUser.load('');assert.equal(otherUser._id,'latest','Account preferences cannot cross users')
  actor={_id:'remember-a',phone:'13800000001'};const separateTeam=makePage();separateTeam.data.teamId='other-team';assert.equal(separateTeam.lastPlanId(),'')
  rows=[latest];const deletedRemembered=makePage();await deletedRemembered.load('');assert.equal(deletedRemembered._id,'latest','Missing remembered plan falls back to newest saved one')
  rows=[latest,readExtras];reopened._plans=rows;reopened.data.dirty=true;const beforeLoad=reopened._id;reopened.choosePlan({currentTarget:{dataset:{id:'latest'}}});assert.equal(reopened._id,beforeLoad);confirmDiscard=true;reopened.choosePlan({currentTarget:{dataset:{id:'latest'}}});assert.equal(reopened._id,'latest')
  requestFailure=true;await reopened.showPlans();assert(reopened.data.plansError.includes('断网'));assert(!reopened.data.plansLoading);requestFailure=false
  reopened._rect={left:10,top:20,width:800,height:360};reopened._trails=[];reopened.data.interactionDisabled=false;reopened.setDrawMode({currentTarget:{dataset:{color:'red'}}});assert(reopened.data.dragDisabled);reopened.strokeStart({touches:[{clientX:90,clientY:100}]});reopened.strokeMove({touches:[{clientX:300,clientY:170}]});reopened.strokeEnd({changedTouches:[{clientX:500,clientY:230}]});assert.equal(reopened._trails.length,1);assert.equal(reopened._trails[0].color,'red');assert(reopened.data.dirty);reopened.undoTrail();assert.equal(reopened._trails.length,0);reopened.setDrawMode({currentTarget:{dataset:{color:''}}});assert(!reopened.data.dragDisabled)
  restoreContext.wx.showModal=args=>args.success({confirm:true,content:'手填临时球员'});reopened._selectedToken=reopened._tokens[0].id;reopened.addTemporary();assert.equal(reopened._tokens[0].temporaryName,'手填临时球员');assert(!reopened._tokens[0].playerId);assert(reopened.data.tokens[0].displayName.includes('临时'))
  restoreContext.wx.getSystemInfoSync=()=>({windowWidth:844,windowHeight:390,safeArea:{left:47,right:797,bottom:369}});reopened.syncSafeArea();assert(reopened.data.safeStyle.includes('--safe-left:47px'));assert(reopened.data.safeStyle.includes('--safe-right:47px'))
  const wxml=fs.readFileSync('miniprogram/pages/team/tactics/board/board.wxml','utf8');for(const m of wxml.matchAll(/{{(.*?)}}/gs))assert(!/[?()[\]=<>]/.test(m[1]),'Complex WXML binding '+m[1]);assert(wxml.includes('movable-view'));assert(wxml.includes('direction="all"'));assert.equal(JSON.parse(fs.readFileSync('miniprogram/pages/team/tactics/board/board.json')).pageOrientation,'landscape')
  console.log('PASS: legacy tactics plus free native moves across full pitch, ball, 22 numbers, save/read/update/version conflict, scope/readonly/account-switch, identical shared rules and WXML; double-tap player dropdown, swap association, canonical names/numbers and foreign-player rejection; remembered restore, load/discard/failure, temporary names and saved red/blue trails. Isolated fixtures only.')
}

run().catch(error => { console.error(error); process.exit(1) })
