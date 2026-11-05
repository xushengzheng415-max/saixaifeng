'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const miniTactics = require('../miniprogram/utils/team-tactics.js')

const calls = []
const toast = []
const navigations = []
const backCalls = []
const modals = []
let legacyBackend = false
let saveResult = null
const storage = { currentWorkspaceId: 'qa-workspace' }
const loadedPlayers = [
  { id: 'qa-player-1', name: '陈一鸣', jerseyNumber: '1' },
  { id: 'qa-player-2', name: '李泽宇', jerseyNumber: '4' },
  { id: 'qa-player-3', name: '王浩然', jerseyNumber: '5' },
  { id: 'qa-player-4', name: '赵嘉禾', jerseyNumber: '6' },
  { id: 'qa-player-5', name: '周子轩', jerseyNumber: '8' },
  { id: 'qa-player-6', name: '孙一诺', jerseyNumber: '9' },
  { id: 'qa-player-7', name: '吴梓豪', jerseyNumber: '11' },
  { id: 'qa-player-8', name: '郑航', jerseyNumber: '12' }
]
const workspace = {
  isVisualQaEnabled: options => Boolean(options && options.visualQa),
  readContext: () => ({ currentWorkspace: { id: 'qa-workspace' } }),
  loadContext: async () => ({ currentWorkspace: { id: 'qa-workspace' }, teams: [{ id: 'qa-team' }] }),
  switchWorkspace: async () => ({ currentWorkspace: { id: 'qa-workspace' } })
}
const wx = {
  getStorageSync: key => storage[key],
  showToast: args => toast.push(args.title),
  showLoading: () => {},
  hideLoading: () => {},
  navigateTo: args => { navigations.push(args.url) },
  navigateBack: args => { backCalls.push(args) },
  reLaunch: () => {},
  showModal: args => { modals.push(args) },
  cloud: {
    callFunction: async ({ data }) => {
      calls.push(data)
      if (data.action === 'teamTactics') {
        if (legacyBackend) return { result: { success: true, user: {}, workspaces: [], currentWorkspace: {}, homeEntries: [] } }
        return {
          result: {
            success: true,
            team: { id: 'qa-team', name: '赛小蜂 U10 梯队', logo: '' },
            canManage: true,
            maxSaved: 20,
            tactics: [{
              id: 'qa-tactic-1', name: '高位压迫 2-2', matchSize: 5, formation: '3-1',
              formationName: '3-1 (防守反击型)', direction: 'attack',
              positions: [
                { role: 'GK', playerId: 'qa-player-1', x: 15, y: 50 },
                { role: 'CB1', playerId: 'qa-player-2', x: 30, y: 26 },
                { role: 'CB2', playerId: 'qa-player-3', x: 32, y: 50 },
                { role: 'CB3', playerId: 'qa-player-4', x: 30, y: 74 }
              ],
              opponentPositions: [{ role: 'GK', number: '1', x: 85, y: 50 }, { role: 'CB1', number: '7', x: 71, y: 24 }],
              substituteIds: ['qa-player-5'], notes: '', version: 1
            }]
          }
        }
      }
      if (data.action === 'teamPlayers') {
        return { result: { success: true, team: { id: 'qa-team', name: '' }, canManage: true, players: loadedPlayers } }
      }
      if (data.action === 'saveTeamTactic') {
        if (saveResult === 'fail') return { result: { success: false, message: '战术已被他人更新，请刷新' } }
        return { result: { success: true, tactic: { id: 'qa-tactic-9', version: 2 } } }
      }
      if (data.action === 'deleteTeamTactic') return { result: { success: true } }
      throw new Error('unexpected action ' + data.action)
    }
  }
}

let definition
const context = {
  Page: value => { definition = value },
  require: name => {
    if (name === '../../../../utils/workspace') return workspace
    if (name === '../../../../utils/team-tactics') return miniTactics
    return require(path.resolve(__dirname, '../miniprogram/pages/team/tactics/board', name))
  },
  wx,
  Promise,
  console,
  setTimeout,
  Date,
  Math,
  Number,
  String,
  Object,
  Boolean,
  Array,
  isFinite,
  getCurrentPages: () => [{}, {}]
}
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../miniprogram/pages/team/tactics/board/board.js'), 'utf8'), context)

function setPath(target, key, value) {
  const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.')
  let cursor = target
  for (let index = 0; index < parts.length - 1; index += 1) {
    const name = parts[index]
    if (cursor[name] == null) cursor[name] = {}
    cursor = cursor[name]
  }
  cursor[parts[parts.length - 1]] = value
}

function makePage() {
  const page = Object.assign({}, definition, {
    data: structuredClone(definition.data),
    setData(value) {
      Object.keys(value || {}).forEach(key => setPath(this.data, key, value[key]))
    },
    createSelectorQuery() {
      return {
        select() { return this },
        boundingClientRect(callback) { if (callback) callback({ left: 0, top: 0, width: 800, height: 350 }); return this },
        exec() {}
      }
    }
  })
  return page
}

async function tick() {
  await new Promise(resolve => setTimeout(resolve, 20))
}

function token(index, side) {
  return { currentTarget: { dataset: { index: index, side: side || 'ours' } } }
}

async function run() {
  // 1. 视觉夹具：横版全屏编辑器，双方号码就位。
  const page = makePage()
  page.onLoad({ visualQa: '1' })
  assert.equal(page.data.loading, false)
  assert.equal(page.data.visualQa, true)
  assert.equal(page.data.matchSize, 5)
  assert.equal(page.data.formation, '3-1')
  assert.equal(page.data.slots.length, 5)
  assert.equal(page.data.rivalSlots.length, 5)
  assert.equal(page.data.slots.filter(slot => slot.hasPlayer).length, 5)
  assert.equal(page.data.rivalSlots.filter(slot => slot.filled).length, 5)
  assert.equal(page.data.summaryText, '我方 5/5 · 对方 5')
  assert.equal(page.data.benchRows.length, 2)
  assert.equal(page.data.canSave, true)
  assert.equal(page.data.saveClass, 'bs-save ready')
  assert.equal(page.data.saveText, '更新')
  assert.equal(page.data.tacticId, 'qa-board-1')
  assert.equal(page.data.length, undefined)
  // 棋盘铺满且工具栏在顶部：点位全部是百分比坐标，页面不再显示球员姓名。
  assert.ok(page.data.slots.every(slot => /^left:\d+(\.\d+)?%;top:\d+(\.\d+)?%;$/.test(slot.slotStyle)))
  assert.ok(page.data.slots.every(slot => slot.numberText !== ''))
  assert.ok(page.data.rivalSlots.every(slot => slot.tokenClass.indexOf('rival') >= 0))

  // 2. 自由拖拽：不吸附阵型点位，跟手落在手指位置，越界夹在球场内。
  page._pitchRect = { left: 0, top: 0, width: 800, height: 350 }
  page.onTokenStart({ touches: [{ clientX: 120, clientY: 175 }], currentTarget: { dataset: { index: 4, side: 'ours' } } })
  page.onTokenMove({ touches: [{ clientX: 402, clientY: 118 }] })
  assert.equal(page.data.slots[4].x, 50.2)
  assert.equal(page.data.slots[4].y, 33.7)
  assert.equal(page.data.slots[4].slotStyle, 'left:50.20%;top:33.70%;')
  page.onTokenMove({ touches: [{ clientX: 820, clientY: 8 }] })
  assert.equal(page.data.slots[4].x, miniTactics.POINT_MAX_X)
  assert.equal(page.data.slots[4].y, miniTactics.POINT_MIN_Y)
  page.onTokenEnd()
  // 拖拽结束后的 160ms 内点击不再触发选人面板，避免误触。
  const sheetBefore = page.data.sheetPlayers
  page.openPlayerSheet(token(4))
  assert.equal(page.data.sheetPlayers, sheetBefore)

  // 3. 对方号码同样是自由拖拽，点位随号码一起保存。
  page.onTokenStart({ touches: [{ clientX: 700, clientY: 175 }], currentTarget: { dataset: { index: 0, side: 'rival' } } })
  page.onTokenMove({ touches: [{ clientX: 656, clientY: 210 }] })
  assert.equal(page.data.rivalSlots[0].x, 82)
  assert.equal(page.data.rivalSlots[0].y, 60)
  page.onTokenEnd()
  page.onTokenStart({ touches: [{ clientX: 700, clientY: 175 }], currentTarget: { dataset: { index: 1, side: 'rival' } } })
  page.onTokenMove({ touches: [{ clientX: 10, clientY: 340 }] })
  assert.equal(page.data.rivalSlots[1].x, miniTactics.POINT_MIN_X)
  assert.equal(page.data.rivalSlots[1].y, miniTactics.POINT_MAX_Y)
  page.onTokenEnd()

  // 4. 拖拽后的坐标进入保存载荷。
  page._suppressTapUntil = 0
  calls.length = 0
  page.saveTactic()
  await tick()
  const save = calls.filter(call => call.action === 'saveTeamTactic').pop()
  assert.ok(save)
  assert.equal(save.teamId, 'qa-team')
  assert.equal(save.matchSize, 5)
  assert.equal(save.tacticId, 'qa-board-1')
  assert.equal(save.version, 1)
  assert.equal(save.name, '高位压迫 2-2')
  assert.equal(save.positions.length, 5)
  assert.equal(save.positions[4].x, miniTactics.POINT_MAX_X)
  assert.equal(save.positions[4].y, miniTactics.POINT_MIN_Y)
  assert.equal(save.opponentPositions.length, 5)
  assert.ok(save.opponentPositions.every(row => typeof row.x === 'number' && typeof row.y === 'number'))
  assert.equal(save.substituteIds.length, 2)
  assert.equal(page.data.saving, false)
  assert.ok(toast.indexOf('战术已保存') >= 0)

  // 5. 换人：同队球员不能重复占位，替补席同步移除。
  const pickPage = makePage()
  pickPage.onLoad({ visualQa: '1' })
  pickPage.openPlayerSheet(token(2))
  assert.equal(pickPage.data.sheetPlayers, true)
  assert.equal(pickPage.data.pickerMode, 'slot')
  pickPage.choosePlayer({ currentTarget: { dataset: { id: 'qa-player-2' } } })
  assert.equal(pickPage.data.sheetPlayers, false)
  assert.equal(pickPage._slots[2].playerId, 'qa-player-2')
  assert.equal(pickPage._slots[1].playerId, '')
  assert.equal(pickPage.data.slots[2].numberText, '4')
  pickPage.openBenchPicker()
  pickPage.choosePlayer({ currentTarget: { dataset: { id: 'qa-player-2' } } })
  assert.ok(toast.indexOf('该球员已在场上') >= 0)
  pickPage.choosePlayer({ currentTarget: { dataset: { id: 'qa-player-8' } } })
  assert.equal(pickPage.data.benchRows.length, 3)
  assert.ok(pickPage.data.benchText.indexOf('3 /') >= 0)

  // 6. 对方号码面板：重复号码拦截，合法号码落到对应位置。
  pickPage.openNumberSheet(token(3, 'rival'))
  pickPage.setData({ numberValue: '7' })
  pickPage.confirmRivalNumber()
  assert.ok(toast.indexOf('对方已有 7 号，请换一个号码') >= 0)
  assert.equal(pickPage.data.sheetNumber, true)
  pickPage.onNumberInput({ detail: { value: '2a3' } })
  assert.equal(pickPage.data.numberValue, '23')
  pickPage.setData({ numberValue: '23' })
  pickPage.confirmRivalNumber()
  assert.equal(pickPage.data.sheetNumber, false)
  assert.equal(pickPage.data.rivalSlots[3].number, '23')
  assert.equal(pickPage.data.summaryText, '我方 4/5 · 对方 5')

  // 7. 切换人数与阵型保留已拖拽坐标，人数变化时按位置角色保留。
  pickPage.onTokenStart({ touches: [{ clientX: 100, clientY: 100 }], currentTarget: { dataset: { index: 0, side: 'ours' } } })
  pickPage.onTokenMove({ touches: [{ clientX: 208, clientY: 122 }] })
  pickPage.onTokenEnd()
  const movedX = pickPage.data.slots[0].x
  pickPage.closeSheet()
  pickPage.onSelectSize({ currentTarget: { dataset: { size: 7 } } })
  assert.equal(pickPage.data.matchSize, 7)
  assert.equal(pickPage.data.slots.length, 7)
  assert.equal(pickPage.data.rivalSlots.length, 7)
  assert.ok(pickPage.data.slots.some(slot => slot.playerId === 'qa-player-1'))
  pickPage.onSelectFormation({ currentTarget: { dataset: { id: pickPage.data.formationOptions[1].id } } })
  assert.equal(pickPage.data.formation, pickPage.data.formationOptions[1].id)
  // 换阵型按位置角色保留球员，不能整盘清空。
  const keptGk = pickPage.data.slots.filter(slot => slot.role === 'GK')[0]
  assert.equal(keptGk.playerId, 'qa-player-1')
  assert.ok(pickPage.data.slots.filter(slot => slot.hasPlayer).length >= 1)
  pickPage.onSelectSize({ currentTarget: { dataset: { size: 5 } } })
  assert.equal(pickPage.data.matchSize, 5)
  assert.equal(pickPage.data.slots.length, 5)
  assert.equal(pickPage.data.slots[0].x, movedX)

  // 8. 方向切换只改箭头与提示，不改动已拖拽点位。
  const beforeStyle = pickPage.data.slots[0].slotStyle
  pickPage.toggleDirection()
  assert.equal(pickPage.data.direction, 'defend')
  assert.ok(pickPage.data.directionArrow.indexOf('对方') >= 0)
  assert.equal(pickPage.data.directionShortText, '防守')
  assert.equal(pickPage.data.slots[0].slotStyle, beforeStyle)
  pickPage.toggleDirection()
  assert.equal(pickPage.data.direction, 'attack')

  // 9. 只读身份：拖拽、选人、号码、保存全部被拦截。
  const readonly = makePage()
  readonly.onLoad({ visualQa: '1' })
  readonly.setData({ canManage: false, saveClass: 'bs-save', canSave: false })
  readonly.onTokenStart({ touches: [{ clientX: 100, clientY: 100 }], currentTarget: { dataset: { index: 0, side: 'ours' } } })
  assert.equal(readonly._drag, null)
  readonly.openPlayerSheet(token(0))
  assert.ok(toast.indexOf('当前身份没有编辑权限') >= 0)
  readonly.openNumberSheet(token(0, 'rival'))
  assert.ok(toast.indexOf('当前身份没有编辑权限') >= 0)
  calls.length = 0
  readonly.saveTactic()
  await tick()
  assert.equal(calls.filter(call => call.action === 'saveTeamTactic').length, 0)

  // 10. 新建战术：未选人数时保存被阻断，选人数后点位带默认坐标。
  const fresh = makePage()
  fresh.onLoad({ visualQa: '1' })
  fresh.startNewDraft()
  assert.equal(fresh.data.matchSize, 0)
  assert.equal(fresh.data.slots.length, 0)
  assert.equal(fresh.data.saveText, '保存')
  assert.equal(fresh.data.canSave, false)
  assert.match(fresh.data.saveHint, /战术名称|人数|阵型/)
  fresh.onSelectSize({ currentTarget: { dataset: { size: 5 } } })
  assert.equal(fresh.data.slots.length, 5)
  assert.ok(fresh.data.slots.every(slot => typeof slot.x === 'number' && typeof slot.y === 'number'))
  fresh.onNameInput({ detail: { value: '边路推进测试' } })
  assert.ok(toast.length > 0)
  calls.length = 0
  fresh.saveTactic()
  await tick()
  assert.equal(calls.filter(call => call.action === 'saveTeamTactic').length, 0)

  // 11. 删除需要确认，确认后才调用删除接口。
  const delPage = makePage()
  delPage.onLoad({ visualQa: '1' })
  modals.length = 0
  delPage.deleteTactic()
  assert.equal(modals.length, 1)
  assert.match(modals[0].content, /删除后不可恢复/)
  calls.length = 0
  modals[0].success({ confirm: true })
  await tick()
  const del = calls.filter(call => call.action === 'deleteTeamTactic').pop()
  assert.ok(del)
  assert.equal(del.tacticId, 'qa-board-1')
  assert.equal(del.version, 1)

  // 12. 云端加载：目标战术回读坐标；旧包明确阻断。
  const cloudPage = makePage()
  cloudPage.onLoad({ teamId: 'qa-team', tacticId: 'qa-tactic-1' })
  await tick()
  assert.equal(cloudPage.data.loading, false)
  assert.equal(cloudPage.data.teamName, '赛小蜂 U10 梯队')
  assert.equal(cloudPage.data.matchSize, 5)
  assert.equal(cloudPage.data.slots[0].x, 15)
  assert.equal(cloudPage.data.rivalSlots[0].x, 85)
  assert.equal(cloudPage.data.summaryText, '我方 4/5 · 对方 2')
  assert.ok(cloudPage.data.slots[1].playerId === 'qa-player-2')

  legacyBackend = true
  const legacyPage = makePage()
  legacyPage.onLoad({ teamId: 'qa-team' })
  await tick()
  assert.match(legacyPage.data.errorText, /战术板服务尚未发布/)
  assert.equal(legacyPage.data.canSave, false)

  // 13. 保存失败要恢复按钮并提示，不能假装已保存。
  saveResult = 'fail'
  const failPage = makePage()
  failPage.onLoad({ visualQa: '1' })
  toast.length = 0
  failPage.saveTactic()
  await tick()
  assert.equal(failPage.data.saving, false)
  assert.equal(failPage.data.savedVisible, false)
  assert.ok(toast.indexOf('战术已被他人更新，请刷新') >= 0)

  console.log('mini team tactics board page checks passed')
}

run().catch(error => { console.error(error); process.exit(1) })
