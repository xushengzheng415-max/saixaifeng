var workspace = require('../../utils/workspace')

Page({
  data: {
    loading: true,
    errorText: '',
    workspaceName: '当前机构',
    workspaceTypeText: '',
    canSwitchWorkspace: false,
    filters: [],
    activeFilter: 'all',
    schedule: [],
    visibleSchedule: [],
    hasSchedule: false
  },

  onLoad: function() {
    this.loadData()
  },

  onShow: function() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().syncFromPage(1)
    }
    this.applyContext(workspace.readContext())
    this.loadData(true)
  },

  onPullDownRefresh: function() {
    var that = this
    this.loadData(true).finally(function() { wx.stopPullDownRefresh() })
  },

  loadData: function(silent) {
    var that = this
    if (!silent) this.setData({ loading: true, errorText: '' })
    return workspace.loadContext().then(function(context) {
      that.applyContext(context)
    }).catch(function(error) {
      that.setData({
        loading: false,
        errorText: error.message || '日程加载失败'
      })
    })
  },

  applyContext: function(context) {
    if (!context || !context.currentWorkspace) return
    var current = context.currentWorkspace
    var capabilities = current.capabilities || []
    var hasEducation = capabilities.indexOf('education') >= 0
    var filters = [
      { id: 'all', text: '全部', itemClass: this.data.activeFilter === 'all' ? 'active' : '' },
      { id: 'event', text: '赛事', itemClass: this.data.activeFilter === 'event' ? 'active' : '' }
    ]
    if (hasEducation) {
      filters.push({
        id: 'education',
        text: '教务',
        itemClass: this.data.activeFilter === 'education' ? 'active' : ''
      })
    }
    this.setData({
      loading: false,
      errorText: '',
      workspaceName: current.name,
      workspaceTypeText: current.isTemporary ? '临时球队协作空间' : '机构工作空间',
      canSwitchWorkspace: (context.workspaces || []).length > 1,
      filters: filters,
      schedule: context.schedule || []
    })
    this.applyFilter()
  },

  applyFilter: function() {
    var filter = this.data.activeFilter
    var source = this.data.schedule || []
    var visible = filter === 'all'
      ? source
      : source.filter(function(item) { return item.source === filter })
    var filters = (this.data.filters || []).map(function(item) {
      item.itemClass = item.id === filter ? 'active' : ''
      return item
    })
    this.setData({
      filters: filters,
      visibleSchedule: visible,
      hasSchedule: visible.length > 0
    })
  },

  onFilterTap: function(event) {
    this.setData({ activeFilter: event.currentTarget.dataset.id || 'all' })
    this.applyFilter()
  },

  onSwitchWorkspace: function() {
    var that = this
    workspace.chooseWorkspace(workspace.readContext()).then(function(context) {
      that.applyContext(context)
    }).catch(function(error) {
      wx.showToast({ title: error.message || '切换失败', icon: 'none' })
    })
  },

  onScheduleTap: function(event) {
    var id = event.currentTarget.dataset.id
    if (id) wx.navigateTo({ url: '/pages/match/detail/detail?matchId=' + id })
  }
})
