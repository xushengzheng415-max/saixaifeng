var workspace = require('../../../utils/workspace')

function formatWorkspace(item, currentId) {
  var positions = item.positions || []
  return {
    id: String(item.id || ''),
    name: item.name || '未命名工作空间',
    logo: item.logo || '',
    hasLogo: Boolean(item.logo),
    typeText: item.type === 'team' ? '球队协作空间' : '机构工作空间',
    positionText: positions.length ? positions.join('、') : (item.type === 'team' ? '球队负责人' : '机构成员'),
    isCurrent: String(item.id || '') === String(currentId || ''),
    rowClass: String(item.id || '') === String(currentId || '') ? 'workspace-row current' : 'workspace-row'
  }
}

Page({
  data: { loading: true, switching: false, errorText: '', workspaces: [], hasWorkspaces: false },

  onLoad: function() { this.load() },

  load: function() {
    var self = this
    var cached = workspace.readContext()
    var source = cached ? Promise.resolve(cached) : workspace.loadContext()
    source.then(function(context) {
      var currentId = context.currentWorkspace && context.currentWorkspace.id
      var rows = (context.workspaces || []).map(function(item) { return formatWorkspace(item, currentId) })
      self.setData({ loading: false, workspaces: rows, hasWorkspaces: rows.length > 0, errorText: '' })
    }).catch(function(error) {
      self.setData({ loading: false, errorText: error.message || '工作空间加载失败' })
    })
  },

  select: function(event) {
    var targetId = String(event.currentTarget.dataset.id || '')
    if (!targetId || this.data.switching) return
    var target = this.data.workspaces.filter(function(item) { return item.id === targetId })[0]
    if (!target || target.isCurrent) { wx.navigateBack(); return }
    var self = this
    this.setData({ switching: true, errorText: '' })
    workspace.switchWorkspace(targetId).then(function() {
      wx.switchTab({ url: '/pages/teams/index' })
    }).catch(function(error) {
      self.setData({ switching: false, errorText: error.message || '切换失败，请重试' })
    })
  },

  back: function() { wx.navigateBack() }
})
