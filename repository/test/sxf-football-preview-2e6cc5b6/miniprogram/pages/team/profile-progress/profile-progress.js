var workspace = require('../../../utils/workspace')

function fixture() {
  return {
    team: { name: '赛小蜂 U12 竞技队', logo: '/images/runtime/icons/brand-v1-tab-team.png' },
    players: [
      { id: 'p1', name: '张子墨', birthDate: '2014-03-18 出生', profileStatus: 'complete', statusText: '资料完整', avatarText: '张', statusClass: 'profile-ok', chips: [{ text: '基础资料', className: 'profile-chip' }, { text: '家长授权', className: 'profile-chip' }, { text: '人证核验', className: 'profile-chip' }, { text: '标准形象照', className: 'profile-chip' }] },
      { id: 'p2', name: '李浩然', birthDate: '2014-09-02 出生', profileStatus: 'pending', statusText: '待补充', avatarText: '李', statusClass: 'profile-wait', chips: [{ text: '基础资料', className: 'profile-chip' }, { text: '家长授权', className: 'profile-chip profile-chip-wait' }, { text: '人证核验', className: 'profile-chip' }, { text: '标准形象照', className: 'profile-chip profile-chip-wait' }] },
      { id: 'p3', name: '陈宇', birthDate: '2014-05-21 出生', profileStatus: 'complete', statusText: '资料完整', avatarText: '陈', statusClass: 'profile-ok', chips: [{ text: '基础资料', className: 'profile-chip' }, { text: '家长授权', className: 'profile-chip' }, { text: '人证核验', className: 'profile-chip' }, { text: '标准形象照', className: 'profile-chip' }] },
      { id: 'p4', name: '王梓轩', birthDate: '2013-12-26 出生', profileStatus: 'exception', statusText: '人证核验异常', avatarText: '王', statusClass: 'profile-error', chips: [{ text: '基础资料', className: 'profile-chip' }, { text: '家长授权', className: 'profile-chip' }, { text: '人证核验', className: 'profile-chip profile-chip-error' }, { text: '标准形象照', className: 'profile-chip' }] },
      { id: 'p5', name: '赵一诺', birthDate: '2014-06-11 出生', profileStatus: 'pending', statusText: '家长未打开邀请', avatarText: '赵', statusClass: 'profile-wait', chips: [{ text: '基础资料', className: 'profile-chip' }, { text: '家长授权', className: 'profile-chip profile-chip-wait' }, { text: '人证核验', className: 'profile-chip' }, { text: '标准形象照', className: 'profile-chip profile-chip-wait' }] }
    ]
  }
}

function decorate(rows) {
  return rows.map(function (row) {
    var item = Object.assign({}, row)
    item.avatarText = item.avatarText || String(item.name || '球').slice(0, 1)
    item.statusClass = item.statusClass || (item.profileStatus === 'exception' ? 'profile-error' : item.profileStatus === 'pending' ? 'profile-wait' : 'profile-ok')
    item.chips = item.chips || [{ text: '基础资料', className: 'profile-chip' }, { text: item.statusText || '资料状态', className: 'profile-chip' }]
    return item
  })
}

function makeFilters(mode, counts) {
  return [
    { id: 'all', label: '全部 ' + counts.total, className: mode === 'all' ? 'progress-filter progress-filter-active' : 'progress-filter' },
    { id: 'complete', label: '已完成 ' + counts.complete, className: mode === 'complete' ? 'progress-filter progress-filter-active' : 'progress-filter' },
    { id: 'pending', label: '待补充 ' + counts.pending, className: mode === 'pending' ? 'progress-filter progress-filter-active' : 'progress-filter' },
    { id: 'exception', label: '异常 ' + counts.exception, className: mode === 'exception' ? 'progress-filter progress-filter-active' : 'progress-filter' }
  ]
}

Page({
  data: { teamId: '', teamName: '', teamLogo: '', players: [], visiblePlayers: [], filter: 'all', filters: [], total: 0, complete: 0, pending: 0, exception: 0, percent: 0, progressWidth: '0%', canManage: false, loading: true, isDevtools: false },
  onLoad: function (options) {
    var query = options || {}
    var isDevtools = workspace.isVisualQaEnabled(query)
    this.setData({ teamId: String(query.teamId || ''), isDevtools: isDevtools })
    if (isDevtools) {
      var local = fixture()
      var players = decorate(local.players)
      this.setData({ loading: false, teamName: local.team.name, teamLogo: local.team.logo, players: players, canManage: true })
      this.applyFilter()
      return
    }
    this.load()
  },
  load: function () {
    var self = this
    var context = workspace.readContext() || {}
    wx.cloud.callFunction({ name: 'getMiniWorkspace', data: { action: 'teamPlayers', workspaceId: (context.currentWorkspace || {}).id, teamId: this.data.teamId } }).then(function (response) {
      var result = response.result || {}
      if (!result.success) throw new Error(result.message || '加载失败')
      self.setData({ loading: false, teamName: (result.team || {}).name || '', teamLogo: (result.team || {}).logo || '', players: decorate(result.players || []), canManage: result.canManage })
      self.applyFilter()
    }).catch(function (error) { self.setData({ loading: false }); wx.showToast({ title: error.message || '加载失败', icon: 'none' }) })
  },
  applyFilter: function () {
    var players = this.data.players || []
    var complete = players.filter(function (item) { return item.profileStatus === 'complete' }).length
    var pending = players.filter(function (item) { return item.profileStatus === 'pending' }).length
    var exception = players.filter(function (item) { return item.profileStatus === 'exception' }).length
    var total = players.length
    var percent = total ? Math.round(complete / total * 100) : 0
    var mode = this.data.filter
    var visible = players.filter(function (item) { return mode === 'all' || item.profileStatus === mode })
    this.setData({ visiblePlayers: visible, total: total, complete: complete, pending: pending, exception: exception, percent: percent, progressWidth: percent + '%', filters: makeFilters(mode, { total: total, complete: complete, pending: pending, exception: exception }) })
  },
  setFilter: function (event) { this.setData({ filter: event.currentTarget.dataset.filter || 'all' }); this.applyFilter() },
  remind: function (event) {
    var self = this
    var context = workspace.readContext() || {}
    var playerId = event.currentTarget.dataset.id
    if (!this.data.canManage) { wx.showToast({ title: '当前身份没有提醒权限', icon: 'none' }); return }
    wx.cloud.callFunction({ name: 'getMiniWorkspace', data: { action: 'remindParentProfile', workspaceId: (context.currentWorkspace || {}).id, teamId: this.data.teamId, playerId: playerId } }).then(function (response) {
      if (!(response.result || {}).success) throw new Error((response.result || {}).message)
      wx.showToast({ title: '提醒已安排', icon: 'success' })
    }).catch(function (error) { wx.showToast({ title: error.message || '提醒失败', icon: 'none' }) })
  },
  remindAll: function () { if (!this.data.canManage) return; wx.showToast({ title: '将提醒未完成人员', icon: 'none' }) },
  open: function (event) {
    var id = event.currentTarget.dataset.id
    var player = (this.data.players || []).filter(function (item) { return item.id === id })[0] || {}
    var route = player.profileStatus === 'exception' ? '/pages/team/profile-exception/profile-exception?playerId=' : '/pages/team/player-detail/player-detail?id='
    wx.navigateTo({ url: route + encodeURIComponent(id) + '&teamId=' + encodeURIComponent(this.data.teamId) })
  },
  back: function () { var teamId = this.data.teamId; wx.navigateBack({ fail: function () { wx.navigateTo({ url: '/pages/team/team?teamId=' + encodeURIComponent(teamId) }) } }) }
})
