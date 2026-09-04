var workspace = require('../../../utils/workspace')

function fixture() {
  return { team: { name: '赛小蜂 U12 竞技队', logo: '/images/runtime/icons/brand-v1-tab-team.png' }, items: [
    { id: 'h1', name: '2025 河南青少年足球冠军联赛', divisionName: 'U11组', dateText: '2025.07.15—08.20', archiveStatusText: '已归档', resultText: '八强', resultClass: 'ranked', recordText: '7场 4胜 1平 2负', tournamentId: 'archive-001' },
    { id: 'h2', name: '2025 郑州市青少年邀请赛', divisionName: 'U11组', dateText: '2025.05.10—05.18', archiveStatusText: '已归档', resultText: '亚军', resultClass: 'ranked', recordText: '5场 4胜 0平 1负', tournamentId: 'archive-002' },
    { id: 'h3', name: '2024 金水区校园足球联赛', divisionName: 'U10组', dateText: '2024.09.01—09.30', archiveStatusText: '已归档', resultText: '冠军', resultClass: 'ranked', recordText: '6场 5胜 1平 0负', tournamentId: 'archive-003' }
  ] }
}

function makeTabs(active, counts) {
  return [
    { id: 'all', label: '全部 ' + counts.all, className: active === 'all' ? 'history-tab history-tab-active' : 'history-tab' },
    { id: 'completed', label: '已结束 ' + counts.completed, className: active === 'completed' ? 'history-tab history-tab-active' : 'history-tab' },
    { id: 'exited', label: '已退出 ' + counts.exited, className: active === 'exited' ? 'history-tab history-tab-active' : 'history-tab' }
  ]
}

Page({
  data: { teamId: '', loading: true, team: {}, items: [], visibleItems: [], tabs: [], activeTab: 'all', historyCount: 0, hasVisibleItems: false, isDevtools: false },
  onLoad: function (options) {
    var query = options || {}
    var isDevtools = workspace.isVisualQaEnabled(query)
    this.setData({ teamId: String(query.teamId || ''), isDevtools: isDevtools })
    if (isDevtools) {
      var local = fixture()
      this.setData({ loading: false, team: local.team, items: local.items, historyCount: local.items.length })
      this.filterItems()
      return
    }
    this.load()
  },
  load: function () {
    var self = this
    var context = workspace.readContext() || {}
    wx.cloud.callFunction({ name: 'getMiniWorkspace', data: { action: 'teamHistory', workspaceId: (context.currentWorkspace || {}).id, teamId: this.data.teamId } }).then(function (response) {
      var result = response.result || {}
      if (!result.success) throw new Error(result.message || '历史参赛记录加载失败')
      var rows = result.items || []
      self.setData({ loading: false, team: result.team || {}, items: rows, historyCount: rows.length, counts: result.counts || {} })
      self.filterItems()
    }).catch(function (error) {
      self.setData({ loading: false })
      wx.showToast({ title: error.message || '历史参赛记录加载失败', icon: 'none' })
    })
  },
  filterItems: function () {
    var active = this.data.activeTab
    var items = this.data.items || []
    var completed = items.filter(function (item) { return item.archiveStatusText === '已归档' }).length
    var exited = items.filter(function (item) { return item.archiveStatusText === '退出记录' }).length
    var visible = items.filter(function (item) { return active === 'all' || (active === 'completed' && item.archiveStatusText === '已归档') || (active === 'exited' && item.archiveStatusText === '退出记录') })
    this.setData({ visibleItems: visible, hasVisibleItems: visible.length > 0, tabs: makeTabs(active, { all: items.length, completed: completed, exited: exited }) })
  },
  switchTab: function (event) { this.setData({ activeTab: event.currentTarget.dataset.tab || 'all' }); this.filterItems() },
  openArchive: function (event) { var item = event.currentTarget.dataset.item; if (item && item.tournamentId) wx.navigateTo({ url: '/pages/tournament/detail/detail?tournamentId=' + encodeURIComponent(item.tournamentId) + '&teamId=' + encodeURIComponent(this.data.teamId) + '&readonly=1' }) },
  back: function () { wx.navigateBack({ fail: function () { wx.switchTab({ url: '/pages/teams/index' }) } }) }
})
