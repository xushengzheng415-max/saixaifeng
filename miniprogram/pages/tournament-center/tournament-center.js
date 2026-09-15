var workspace = require('../../utils/workspace')

Page({
  data: {
    loading: true,
    errorText: '',
    workspaceName: '当前机构',
    canSwitchWorkspace: false,
    canManageEvents: false,
    relationFilters: [
      { id: 'hosted', text: '我主办的', itemClass: 'active' },
      { id: 'participating', text: '我参与的', itemClass: '' }
    ],
    statusFilters: [
      { id: 'ongoing', text: '进行中', itemClass: 'active' },
      { id: 'upcoming', text: '待开始', itemClass: '' },
      { id: 'ended', text: '已结束', itemClass: '' }
    ],
    activeRelation: 'hosted',
    activeStatus: 'ongoing',
    tournaments: [],
    visibleTournaments: [],
    hasTournaments: false
  },

  onLoad: function() {
    this.loadData()
  },

  onShow: function() {
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
      that.setData({ loading: false, errorText: error.message || '赛事加载失败' })
    })
  },

  applyContext: function(context) {
    if (!context || !context.currentWorkspace) return
    var permissions = context.currentWorkspace.permissions || []
    var items = (context.tournaments || []).map(function(item, index) {
      var statusText = String(item.statusText || item.status || '')
      var statusKey = /结束|归档|completed|archived|ended/i.test(statusText) ? 'ended' : (/待开始|筹备|draft|upcoming/i.test(statusText) ? 'upcoming' : 'ongoing')
      item.relationClass = item.relation === 'participating' ? 'participating' : 'hosted'
      item.statusKey = statusKey
      item.statusClass = 'status-' + statusKey
      item.cardClass = index === 0 ? 'feature-card' : 'standard-card'
      item.modeText = item.modeText || item.planText || (item.isProfessional ? 'PRO · 专业版' : '基础版')
      item.teamCountText = String(item.teamCount || item.registeredTeamCount || item.teamTotal || 0)
      item.matchCountText = String(item.matchCount || item.matchesCount || item.matchTotal || 0)
      item.venueText = item.venueText || item.location || item.city || '赛事地点待定'
      item.dateVenueText = item.dateText ? item.dateText + ' · ' + item.venueText : item.venueText
      item.showTeamCount = item.teamCountText !== '0'
      item.showMatchCount = item.matchCountText !== '0'
      return item
    })
    this.setData({
      loading: false,
      errorText: '',
      workspaceName: context.currentWorkspace.name,
      canSwitchWorkspace: (context.workspaces || []).length > 1,
      canManageEvents: permissions.indexOf('event.manage') >= 0,
      tournaments: items
    })
    this.applyFilter()
  },

  applyFilter: function() {
    var relation = this.data.activeRelation
    var status = this.data.activeStatus
    var source = this.data.tournaments || []
    var visible = source.filter(function(item) { return item.relation === relation && item.statusKey === status })
    if (!visible.length && relation === 'hosted' && status === 'ongoing') visible = source.filter(function(item) { return item.relation === relation })
    var relationFilters = (this.data.relationFilters || []).map(function(item) {
      item.itemClass = item.id === relation ? 'active' : ''
      return item
    })
    var statusFilters = (this.data.statusFilters || []).map(function(item) {
      item.itemClass = item.id === status ? 'active' : ''
      return item
    })
    this.setData({
      relationFilters: relationFilters,
      statusFilters: statusFilters,
      visibleTournaments: visible,
      hasTournaments: visible.length > 0
    })
  },

  onRelationFilterTap: function(event) {
    this.setData({ activeRelation: event.currentTarget.dataset.id || 'hosted' })
    this.applyFilter()
  },

  onStatusFilterTap: function(event) {
    this.setData({ activeStatus: event.currentTarget.dataset.id || 'ongoing' })
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

  onTournamentTap: function(event) {
    var id = event.currentTarget.dataset.id
    if (id) wx.navigateTo({ url: '/pages/tournament/detail/detail?id=' + id })
  },

  onTodoTap: function() {
    wx.switchTab({ url: '/pages/todo/index' })
  },

  showPcHint: function() {
    wx.showModal({
      title: '请使用 PC 管理后台',
      content: '创建赛事、配置竞赛组别和复杂赛程请在 PC 端完成。小程序用于查看、审批和现场协作。',
      showCancel: false,
      confirmColor: '#1D7A55'
    })
  }
})
