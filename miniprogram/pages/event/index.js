var workspace = require('../../utils/workspace')

Page({
  data: {
    loading: true,
    errorText: '',
    workspaceName: '当前机构',
    workspaceTypeText: '机构赛事空间',
    canSwitchWorkspace: false,
    canManage: false,
    relationTabs: [],
    showRelationTabs: false,
    activeRelation: 'hosted',
    hostedTournaments: [],
    participatingTournaments: [],
    visibleTournaments: [],
    hasTournaments: false,
    eventSchedule: [],
    eventTasks: [],
    hasSchedule: false,
    hasTasks: false,
    visualQa: false,
    statusFilters: [
      { id: 'all', text: '全部', itemClass: 'event-filter-active' },
      { id: 'ongoing', text: '进行中', itemClass: '' },
      { id: 'upcoming', text: '待开始', itemClass: '' },
      { id: 'ended', text: '已结束', itemClass: '' }
    ],
    activeStatus: 'all',
    pendingCount: 0,
    featuredTask: null,
    hasFeaturedTask: false
  },

  onLoad: function(options) {
    if (workspace.isVisualQaEnabled(options)) {
      this.loadVisualFixture()
      return
    }
    this.loadData()
  },

  onShow: function() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().syncFromPage(1)
    }
    if (!this.data.visualQa) {
      this.applyContext(workspace.readContext())
      this.loadData(true)
    }
  },

  onPullDownRefresh: function() {
    this.loadData(true).finally(function() { wx.stopPullDownRefresh() })
  },

  loadData: function(silent) {
    var that = this
    if (!silent) this.setData({ loading: true, errorText: '' })
    return workspace.loadContext().then(function(context) {
      that.applyContext(context)
    }).catch(function(error) {
      that.setData({ loading: false, errorText: error.message || '赛事中心加载失败' })
    })
  },

  applyContext: function(context) {
    if (!context || !context.currentWorkspace) return
    var current = context.currentWorkspace
    var tournaments = context.tournaments || []
    var hosted = tournaments.filter(function(item) { return item.isHosted })
    var participating = tournaments.filter(function(item) { return item.isParticipating })
    var activeRelation = this.data.activeRelation
    if (!hosted.length && participating.length) activeRelation = 'participating'
    var tabs = []
    if (hosted.length) {
      tabs.push({
        id: 'hosted',
        text: '我主办的',
        count: hosted.length,
        itemClass: activeRelation === 'hosted' ? 'active' : ''
      })
    }
    if (participating.length) {
      tabs.push({
        id: 'participating',
        text: '我参与的',
        count: participating.length,
        itemClass: activeRelation === 'participating' ? 'active' : ''
      })
    }
    this.setData({
      loading: false,
      errorText: '',
      workspaceName: current.name,
      workspaceTypeText: current.isTemporary ? '临时球队赛事协作' : '当前机构赛事中心',
      canSwitchWorkspace: (context.workspaces || []).length > 1,
      canManage: workspace.hasPermission('event.manage', context),
      relationTabs: tabs,
      showRelationTabs: tabs.length > 1,
      activeRelation: activeRelation,
      hostedTournaments: hosted,
      participatingTournaments: participating,
      eventSchedule: (context.eventSchedule || []).slice(0, 5),
      eventTasks: (context.eventTasks || []).slice(0, 5),
      hasSchedule: (context.eventSchedule || []).length > 0,
      hasTasks: (context.eventTasks || []).length > 0,
      featuredTask: (context.eventTasks || [])[0] || null,
      hasFeaturedTask: Boolean((context.eventTasks || []).length)
    })
    this.applyRelation()
  },

  applyRelation: function() {
    var relation = this.data.activeRelation
    var visible = relation === 'participating'
      ? this.data.participatingTournaments
      : this.data.hostedTournaments
    var tabs = (this.data.relationTabs || []).map(function(item) {
      item.itemClass = item.id === relation ? 'active' : ''
      return item
    })
    this.setData({
      relationTabs: tabs,
      visibleTournaments: visible,
      hasTournaments: visible.length > 0
    })
  },

  onRelationTap: function(event) {
    this.setData({ activeRelation: event.currentTarget.dataset.id || 'hosted' })
    this.applyRelation()
  },

  onStatusTap: function(event) {
    var activeStatus = event.currentTarget.dataset.id || 'all'
    var statusFilters = this.data.statusFilters.map(function(item) {
      return Object.assign({}, item, { itemClass: item.id === activeStatus ? 'event-filter-active' : '' })
    })
    this.setData({ activeStatus: activeStatus, statusFilters: statusFilters })
  },

  onSwitchWorkspace: function() {
    var that = this
    workspace.chooseWorkspace(workspace.readContext()).then(function(context) {
      that.applyContext(context)
    }).catch(function(error) {
      wx.showToast({ title: error.message || '切换失败', icon: 'none' })
    })
  },

  onCreateTournament: function() {
    if (!this.data.canManage) {
      wx.showToast({ title: '当前机构未授予赛事管理权限', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/tournament/create/create' })
  },

  onTournamentTap: function(event) {
    var id = event.currentTarget.dataset.id
    if (id) wx.navigateTo({ url: '/pages/tournament/detail/detail?id=' + id })
  },

  onMatchTap: function(event) {
    var id = event.currentTarget.dataset.id
    if (id) wx.navigateTo({ url: '/pages/match/detail/detail?matchId=' + id })
  },

  onTaskTap: function(event) {
    var tournamentId = event.currentTarget.dataset.tournament
    var teamId = event.currentTarget.dataset.team
    var audience = event.currentTarget.dataset.audience
    if (!tournamentId) return
    if (audience === 'organizer') {
      wx.navigateTo({ url: '/pages/tournament/teams/teams?id=' + tournamentId })
      return
    }
    var url = '/pages/tournament/signup/signup?id=' + tournamentId
    if (teamId) url += '&teamId=' + teamId
    wx.navigateTo({ url: url })
  },

  loadVisualFixture: function() {
    var hosted = [
      { id: 'visual-pro', name: '2026 河南青少年足球冠军联赛', dateText: '7月20日 — 8月18日 · 河南省体育中心', statusText: '进行中', relationText: '我主办的', modeText: 'PRO · U12', teamCountText: '16 支球队', matchCountText: '32 场比赛', cardClass: 'event-card-pro' },
      { id: 'visual-simple', name: '2026 金水区校园足球联赛', dateText: '7月20日 — 8月18日 · 河南省体育中心', statusText: '进行中', relationText: '我主办的', modeText: '简易版', teamCountText: '12 支球队', matchCountText: '24 场比赛', cardClass: 'event-card-simple' }
    ]
    this.setData({
      loading: false, visualQa: true, workspaceName: '河南青少年赛事中心', workspaceTypeText: '赛事', canSwitchWorkspace: true, canManage: true,
      relationTabs: [{ id: 'hosted', text: '我主办的', count: 2, itemClass: 'event-relation-active' }, { id: 'participating', text: '我参与的', count: 0, itemClass: '' }], showRelationTabs: true, activeRelation: 'hosted',
      hostedTournaments: hosted, participatingTournaments: [], visibleTournaments: hosted, hasTournaments: true,
      eventTasks: [{ id: 'task-1', title: '赛事审批待处理', subtitle: '报名 6 · 名单 3 · 赛果 1', tournamentId: 'visual-pro', audience: 'organizer' }], featuredTask: { id: 'task-1', title: '赛事审批待处理', subtitle: '报名 6 · 名单 3 · 赛果 1', tournamentId: 'visual-pro', audience: 'organizer' }, hasFeaturedTask: true, hasTasks: true, pendingCount: 10,
      eventSchedule: [], hasSchedule: false
    })
  }
})
