var workspace = require('../../utils/workspace')
var entryCards = require('../../utils/workspace-entry-cards')

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
    sharedTournaments: [],
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
    hasFeaturedTask: false,
    guestMode: false,
    createVisible:false
  },

  onLoad: function(options) {
    if (workspace.isVisualQaEnabled(options)) {
      this.loadVisualFixture()
      return
    }
    if (workspace.isGuestReviewEnabled(options) || !workspace.hasAuthenticatedUser()) {
      this.loadGuestDemo()
      return
    }
    this.loadData()
  },

  onShow: function() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().syncFromPage(1)
    }
    if (this.data.guestMode && !workspace.hasAuthenticatedUser()) return
    if (this.data.guestMode) this.setData({ guestMode: false })
    if (!this.data.visualQa) {
      if (!workspace.hasAuthenticatedUser()) {
        this.loadGuestDemo()
        return
      }
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
    var selectedRole = entryCards.role(context,workspace)
    var participationReady = context.participatingEntriesVersion === 'team-participation/1' && context.participatingEntriesState === 'ready'
    var participationFailed = context.participatingEntriesState === 'failed'
    var participationWaiting = selectedRole === 'team_coach' && !participationReady && !participationFailed && !this.data.guestMode && !this.data.visualQa
    var tournaments = selectedRole === 'team_coach' ? entryCards.teamEvents(context) : entryCards.fromHome(context,'tournament').map(function(item) {
      return Object.assign({},item,{isHosted:!item.isShared,isParticipating:false})
    })
    if (participationWaiting || (selectedRole === 'team_coach' && participationFailed)) tournaments = []
    var hosted = tournaments.filter(function(item) { return item.isHosted })
    var participating = tournaments.filter(function(item) { return item.isParticipating })
    var shared = tournaments.filter(function(item) { return item.isShared })
    var activeRelation = this.data.activeRelation
    if (selectedRole === 'team_coach') activeRelation = 'participating'
    else if (activeRelation === 'participating') activeRelation = 'hosted'
    if (activeRelation === 'shared' && !shared.length) activeRelation = 'hosted'
    if (activeRelation === 'hosted' && !hosted.length && participating.length) activeRelation = 'participating'
    if (!hosted.length && !participating.length && shared.length) activeRelation = 'shared'
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
    if (shared.length) tabs.push({ id: 'shared', text: '共享赛事', count: shared.length, itemClass: activeRelation === 'shared' ? 'active' : '' })
    if (!tabs.length) tabs.push({id:activeRelation,text:selectedRole === 'team_coach' ? '我参与的' : '我主办的',count:0,itemClass:'active'})
    this.setData({
      loading: participationWaiting,
      portalRoleTitle:selectedRole === 'team_coach' ? '球队管理者' : '赛事组织者',
      errorText: selectedRole === 'team_coach' && participationFailed ? (context.participatingEntriesError || '参赛记录读取失败，请重试') : '',
      workspaceName: current.name,
      workspaceTypeText: current.type === 'tournament_shared' ? '共享赛事空间' : (current.isTemporary ? '临时球队赛事协作' : '当前机构赛事中心'),
      canSwitchWorkspace: (context.workspaces || []).length > 1,
      canManage: workspace.hasPermission('event.manage', context),
      relationTabs: tabs,
      showRelationTabs: tabs.length > 1,
      activeRelation: activeRelation,
      hostedTournaments: hosted,
      participatingTournaments: participating,
      sharedTournaments: shared,
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
    var visible = relation === 'shared' ? this.data.sharedTournaments : relation === 'participating'
      ? this.data.participatingTournaments
      : this.data.hostedTournaments
    var activeStatus = this.data.activeStatus
    visible = visible.filter(function(item) {
      if (activeStatus === 'all') return true
      var status = String(item.status || '').toLowerCase(), label = item.statusText || ''
      if (activeStatus === 'ongoing') return ['ongoing','live','in_progress'].indexOf(status) >= 0 || label === '进行中'
      if (activeStatus === 'ended') return ['completed','finished','ended','archived'].indexOf(status) >= 0 || label === '已结束'
      return ['draft','registering','scheduled','upcoming','pending','not_started'].indexOf(status) >= 0 || ['待开始','未开始','报名中','筹备中'].indexOf(label) >= 0
    }).map(function(item) { return item.type ? item : entryCards.format(Object.assign({},item,{type:'tournament',badgeText:item.isShared ? '共享' : '',metaLines:[item.dateText].filter(Boolean)})) })
    var tabs = (this.data.relationTabs || []).map(function(item) {
      item.itemClass = item.id === relation ? 'active' : ''
      return item
    })
    this.setData({
      relationTabs: tabs,
      visibleTournaments: visible,
      hasTournaments: visible.length > 0,
      showEventEmpty: visible.length === 0 && !this.data.loading && !this.data.errorText
    })
  },

  onRelationTap: function(event) {
    this.setData({ activeRelation: event.currentTarget.dataset.id || 'hosted' })
    this.applyRelation()
  },

  retryLoad: function() { return this.loadData() },

  onStatusTap: function(event) {
    var activeStatus = event.currentTarget.dataset.id || 'all'
    var statusFilters = this.data.statusFilters.map(function(item) {
      return Object.assign({}, item, { itemClass: item.id === activeStatus ? 'event-filter-active' : '' })
    })
    this.setData({ activeStatus: activeStatus, statusFilters: statusFilters })
    this.applyRelation()
  },

  onSwitchWorkspace: function() {
    if (this.data.guestMode) return workspace.promptLogin('登录后可查看和切换已授权的机构赛事空间。')
    wx.switchTab({url:'/pages/profile/profile'})
  },

  onCreateTournament: function() {
    if (this.data.visualQa) return wx.showToast({title:'演示状态不创建数据',icon:'none'})
    if (this.data.guestMode) return workspace.promptLogin('登录后可创建赛事并保存赛事配置。')
    if (!workspace.hasAuthenticatedUser()) return workspace.promptLogin('登录后可创建自己的赛事。')
    this.setData({createVisible:true})
  },
  closeCreateSheet:function(){this.setData({createVisible:false})},
  onQuickCreated:function(){return this.loadData(true)},
  onQuickComplete:function(){this.setData({createVisible:false})},

  onTournamentTap: function(event) {
    if (this.data.guestMode) return workspace.promptLogin('当前是赛事功能演示。登录后可进入赛事管理；公开赛事可从首页免登录浏览。')
    var key = (event.detail || {}).key || event.currentTarget.dataset.key
    var entry = (this.data.visibleTournaments || []).filter(function(item) { return item.key === key })[0]
    return entryCards.open(this,entry,workspace,wx)
  },

  onMatchTap: function(event) {
    if (this.data.guestMode) return workspace.promptLogin('当前是赛程功能演示，登录后可查看本机构比赛任务。')
    var id = event.currentTarget.dataset.id
    if (id) wx.navigateTo({ url: '/pages/match/detail/detail?matchId=' + id })
  },

  onTaskTap: function(event) {
    if (this.data.guestMode) return workspace.promptLogin('当前是任务功能演示，登录后可处理报名、名单和赛果任务。')
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
      { id: 'visual-simple', name: '2026 金水区校园足球联赛', dateText: '7月20日 — 8月18日 · 河南省体育中心', statusText: '进行中', relationText: '我主办的', modeText: '基础版', teamCountText: '12 支球队', matchCountText: '24 场比赛', cardClass: 'event-card-simple' }
    ]
    this.setData({
      loading: false, visualQa: true, workspaceName: '河南青少年赛事中心', workspaceTypeText: '赛事', canSwitchWorkspace: true, canManage: true,
      relationTabs: [{ id: 'hosted', text: '我主办的', count: 2, itemClass: 'event-relation-active' }, { id: 'participating', text: '我参与的', count: 0, itemClass: '' }], showRelationTabs: true, activeRelation: 'hosted',
      hostedTournaments: hosted, participatingTournaments: [], visibleTournaments: hosted, hasTournaments: true,
      eventTasks: [{ id: 'task-1', title: '赛事审批待处理', subtitle: '报名 6 · 名单 3 · 赛果 1', tournamentId: 'visual-pro', audience: 'organizer' }], featuredTask: { id: 'task-1', title: '赛事审批待处理', subtitle: '报名 6 · 名单 3 · 赛果 1', tournamentId: 'visual-pro', audience: 'organizer' }, hasFeaturedTask: true, hasTasks: true, pendingCount: 10,
      eventSchedule: [], hasSchedule: false
    })
    this.applyRelation()
  },

  loadGuestDemo: function() {
    var tournaments = [
      { id: 'guest-demo-event-1', name: '示例 · 青少年足球邀请赛', dateText: '周六至周日 · 示例体育中心', statusText: '进行中', relationText: '功能演示', modeText: 'U12', teamCountText: '8 支球队', matchCountText: '16 场比赛', cardClass: 'event-card-pro' },
      { id: 'guest-demo-event-2', name: '示例 · 校园足球联赛', dateText: '日期待发布 · 示例场地', statusText: '待开始', relationText: '功能演示', modeText: '基础版', teamCountText: '6 支球队', matchCountText: '9 场比赛', cardClass: 'event-card-simple' }
    ]
    this.setData({
      loading: false, errorText: '', visualQa: false, guestMode: true,
      workspaceName: '赛事功能演示', workspaceTypeText: '示例数据 · 不保存', canSwitchWorkspace: false, canManage: false,
      relationTabs: [{ id: 'hosted', text: '赛事示例', count: 2, itemClass: 'event-relation-active' }], showRelationTabs: false, activeRelation: 'hosted',
      hostedTournaments: tournaments, participatingTournaments: [], visibleTournaments: tournaments, hasTournaments: true,
      eventTasks: [{ id: 'guest-task', title: '报名与名单待处理', subtitle: '演示任务 · 登录后可处理', tournamentId: 'guest-demo-event-1', audience: 'organizer' }],
      featuredTask: { id: 'guest-task', title: '报名与名单待处理', subtitle: '演示任务 · 登录后可处理', tournamentId: 'guest-demo-event-1', audience: 'organizer' }, hasFeaturedTask: true, hasTasks: true, pendingCount: 2,
      eventSchedule: [], hasSchedule: false
    })
  }
})
