'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const miniTactics = require('../miniprogram/utils/team-tactics.js')

const calls = []
const toast = []
const navigations = []
let legacyBackend = false
const storage = { currentWorkspaceId: 'qa-workspace' }
const loadedPlayers = [
  { id: 'qa-player-1', name: '陈一鸣', jerseyNumber: '1', position: '门将', photoUrl: '' },
  { id: 'qa-player-2', name: '李泽宇', jerseyNumber: '4', position: '后卫', photoUrl: '' },
  { id: 'qa-player-3', name: '王浩然', jerseyNumber: '5', position: '后卫', photoUrl: '' },
  { id: 'qa-player-4', name: '赵嘉禾', jerseyNumber: '6', position: '中场', photoUrl: '' },
  { id: 'qa-player-5', name: '周子轩', jerseyNumber: '8', position: '中场', photoUrl: '' }
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
  navigateBack: () => {},
  switchTab: () => {},
  reLaunch: () => {},
  showModal: args => { if (args.success) args.success({ confirm: false }) },
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
                { role: 'GK', playerId: 'qa-player-1', x: 16, y: 50 },
                { role: 'CB1', playerId: 'qa-player-2', x: 32, y: 24 },
                { role: 'CB2', playerId: 'qa-player-3', x: 34, y: 50 },
                { role: 'CB3', playerId: 'qa-player-4', x: 32, y: 76 }
              ],
              opponentPositions: [{ role: 'GK', number: '1', x: 84, y: 50 }, { role: 'CB1', number: '7', x: 70, y: 26 }],
              substituteIds: ['qa-player-5'], notes: '训练重点：丢球后就地反抢。', version: 1, updatedAtText: '11-03 10:20'
            }]
          }
        }
      }
      if (data.action === 'teamPlayers') {
        return { result: { success: true, team: { id: 'qa-team', name: '赛小蜂 U10 梯队', logo: '' }, canManage: true, players: loadedPlayers } }
      }
      throw new Error('unexpected action ' + data.action)
    }
  }
}

let definition
const context = {
  Page: value => { definition = value },
  require: name => {
    if (name === '../../../utils/workspace') return workspace
    if (name === '../../../utils/team-tactics') return miniTactics
    return require(path.resolve(__dirname, '../miniprogram/pages/team/tactics', name))
  },
  wx,
  Promise,
  console,
  setTimeout,
  getCurrentPages: () => [{}, {}]
}
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../miniprogram/pages/team/tactics/tactics.js'), 'utf8'), context)
const page = Object.assign({}, definition, {
  data: structuredClone(definition.data),
  setData(value) { Object.assign(this.data, value) }
})

async function tick() {
  await new Promise(resolve => setTimeout(resolve, 20))
}

async function run() {
  // 1. 云端真实数据：列表只读 + 摘要字段。
  page.onLoad({ teamId: 'qa-team' })
  await tick()
  assert.equal(page.data.loading, false)
  assert.equal(page.data.canManage, true)
  assert.equal(page.data.canCreate, true)
  assert.equal(page.data.tacticCount, 1)
  assert.equal(page.data.hasTactics, true)
  assert.equal(page.data.teamName, '赛小蜂 U10 梯队')
  assert.equal(page.data.playerCount, 5)
  assert.equal(page.data.playerCountText, '5 名在队球员')
  assert.equal(page.data.remainingText, '已保存 1 / 20 套')
  const row = page.data.tactics[0]
  assert.equal(row.formationLabel, '3-1 (防守反击型)')
  assert.equal(row.sizeLabel, '5 人制')
  assert.equal(row.directionLabel, '我方进攻')
  assert.equal(row.benchLabel, '替补 1')
  assert.equal(row.summaryText, '我方 4/5 · 对方 2')
  assert.equal(row.updatedText, '更新于 11-03 10:20')
  assert.equal(row.hasNotes, true)
  assert.equal(page.data.hasReadOnlyHint, false)

  // 2. 新建与打开都跳转到横版战术板页，列表页不再内嵌编辑器。
  page.openNewTactic()
  assert.equal(navigations[0], '/pages/team/tactics/board/board?teamId=qa-team')
  page.openTactic({ currentTarget: { dataset: { id: 'qa-tactic-1' } } })
  assert.equal(navigations[1], '/pages/team/tactics/board/board?teamId=qa-team&tacticId=qa-tactic-1')

  // 3. 只读身份不能新建，也不能把只读提示藏起来。
  const readonly = Object.assign({}, page, {
    data: Object.assign({}, page.data, { canManage: false, canCreate: false, hasReadOnlyHint: true, readOnlyHint: '当前身份只可查看战术板' }),
    setData(value) { Object.assign(this.data, value) }
  })
  readonly.openNewTactic()
  assert.ok(toast.indexOf('当前身份没有编辑权限') >= 0)

  // 4. 视觉夹具同样只渲染列表摘要，不带编辑器状态。
  const qaPage = Object.assign({}, definition, {
    data: structuredClone(definition.data),
    setData(value) { Object.assign(this.data, value) }
  })
  qaPage.onLoad({ visualQa: '1' })
  assert.equal(qaPage.data.visualQa, true)
  assert.equal(qaPage.data.loading, false)
  assert.equal(qaPage.data.tacticCount, 1)
  assert.equal(qaPage.data.canCreate, true)
  assert.equal(qaPage.data.tactics[0].summaryText, '我方 5/5 · 对方 5')
  qaPage.openTactic({ currentTarget: { dataset: { id: 'qa-tactic-1' } } })
  assert.equal(navigations[navigations.length - 1], '/pages/team/tactics/board/board?teamId=qa-team&tacticId=qa-tactic-1&visualQa=1')

  // 5. 旧版后端包必须明确阻断，而不是静默展示空战术板。
  legacyBackend = true
  const legacyPage = Object.assign({}, definition, {
    data: structuredClone(definition.data),
    setData(value) { Object.assign(this.data, value) }
  })
  legacyPage.data.teamId = 'qa-team'
  legacyPage._workspaceReady = true
  legacyPage.loadData(false)
  await tick()
  assert.match(legacyPage.data.errorText, /战术板服务尚未发布/)
  assert.equal(legacyPage.data.canCreate, false)

  // 6. 缺少球队参数时直接提示，不发云端请求。
  const beforeCalls = calls.length
  const noTeam = Object.assign({}, definition, {
    data: structuredClone(definition.data),
    setData(value) { Object.assign(this.data, value) }
  })
  noTeam.onLoad({})
  assert.equal(noTeam.data.loading, false)
  assert.match(noTeam.data.errorText, /缺少球队信息/)
  assert.equal(calls.length, beforeCalls)

  console.log('mini team tactics list page checks passed')
}

run().catch(error => { console.error(error); process.exit(1) })
