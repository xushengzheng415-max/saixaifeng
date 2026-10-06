var workspace = require('../../utils/workspace')

Page({
  openDataCenter:function() { wx.navigateTo({url:'/pages/data-center/index'}) },
  data: {
    loading: true,
    errorText: '',
    workspaceName: '当前机构',
    workspaceTypeText: '',
    canSwitchWorkspace: false,
    cards: [],
    tournaments: [],
    teams: [],
    hasTournaments: false,
    hasTeams: false
  },

  onLoad: function() {
    this.loadData()
  },

  onShow: function() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().syncFromPage(3)
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
      that.setData({ loading: false, errorText: error.message || '数据加载失败' })
    })
  },

  applyContext: function(context) {
    if (!context || !context.currentWorkspace) return
    var stats = context.statistics || {}
    var cards = [
      { id: 'tournament', value: stats.tournamentCount || 0, label: '关联赛事', cardClass: 'green' },
      { id: 'team', value: stats.teamCount || 0, label: '管理球队', cardClass: 'blue' },
      { id: 'player', value: stats.playerCount || 0, label: '球队球员', cardClass: 'orange' },
      { id: 'match', value: stats.matchCount || 0, label: '比赛场次', cardClass: 'purple' }
    ]
    this.setData({
      loading: false,
      errorText: '',
      workspaceName: context.currentWorkspace.name,
      workspaceTypeText: context.currentWorkspace.isTemporary ? '临时球队协作数据' : '机构授权数据',
      canSwitchWorkspace: (context.workspaces || []).length > 1,
      cards: cards,
      tournaments: (context.tournaments || []).slice(0, 5),
      teams: (context.teams || []).slice(0, 5),
      hasTournaments: (context.tournaments || []).length > 0,
      hasTeams: (context.teams || []).length > 0
    })
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

  onTeamTap: function(event) {
    var id = event.currentTarget.dataset.id
    if (id) wx.navigateTo({ url: '/pages/team/detail/detail?id=' + id })
  }
})
