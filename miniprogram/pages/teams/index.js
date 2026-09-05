var workspace = require('../../utils/workspace')

function isDevtools() { try { return wx.getSystemInfoSync().platform === 'devtools' } catch (error) { return false } }

Page({
  data: {
    loading: true,
    errorText: '',
    workspaceName: '当前机构',
    workspaceTypeText: '机构球队资产',
    canSwitchWorkspace: false,
    canManage: false,
    teams: [],
    hasTeams: false,
    showTeamEmpty: false,
    teamTasks: [],
    hasTasks: false,
    statistics: {},
    localVisualQa: false,
    guestMode: false
  },

  onLoad: function(options) {
    if (isDevtools() && options && options.visualQa === '1' && options.state === 'empty') {
      this.setData({ localVisualQa: true, loading: false, workspaceName: '赛小蜂足球俱乐部', canManage: true, teams: [], hasTeams: false, showTeamEmpty: true, teamTasks: [], hasTasks: false })
      return
    }
    if (isDevtools() && options && options.visualQa === '1') {
      this.setData({
        localVisualQa: true,
        loading: false,
        workspaceName: '赛小蜂足球俱乐部',
        canManage: true,
        teams: [
          { id: 'visual-qa-u12', name: '赛小蜂 U12 竞技队', logo: '/images/runtime/icons/brand-v1-tab-team.png', playerCount: 23, coachCount: 3, tournamentCount: 2, claimText: '资料完整度 92%' },
          { id: 'visual-qa-u10', name: '赛小蜂 U10 梯队', logo: '/images/runtime/icons/brand-v1-tab-team.png', playerCount: 18, coachCount: 2, tournamentCount: 1, claimText: '资料完整度 86%' }
        ],
        hasTeams: true,
        showTeamEmpty: false,
        teamTasks: [
          { id: 'visual-qa-roster-task', title: 'U12组正式名单待确认', subtitle: '2026河南青少年足球冠军联赛', tournamentId: 'visual-qa-tournament', teamId: 'visual-qa-u12' },
          { id: 'visual-qa-lineup-task', title: '8月2日比赛阵容待提交', subtitle: '郑州劲风U12  vs  洛阳龙门U12', tournamentId: 'visual-qa-tournament', teamId: 'visual-qa-u12' }
        ],
        hasTasks: true,
        errorText: ''
      })
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
      this.getTabBar().syncFromPage(2)
    }
    if (this.data.localVisualQa) return
    if (this.data.guestMode) return
    if (!workspace.hasAuthenticatedUser()) {
      this.loadGuestDemo()
      return
    }
    this.applyContext(workspace.readContext())
    this.loadData(true)
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
      that.setData({ loading: false, errorText: error.message || '球队中心加载失败' })
    })
  },

  applyContext: function(context) {
    if (!context || !context.currentWorkspace) return
    var current = context.currentWorkspace
    var teams = context.teams || []
    var teamTasks = (context.eventTasks || []).filter(function(item) {
      return item.audience === 'team'
    })
    this.setData({
      loading: false,
      errorText: '',
      workspaceName: current.name,
      workspaceTypeText: current.isTemporary ? '临时球队协作空间' : '当前机构球队资产',
      canSwitchWorkspace: (context.workspaces || []).length > 1,
      canManage: workspace.hasPermission('team.manage', context) || !teams.length,
      teams: teams,
      hasTeams: teams.length > 0,
      showTeamEmpty: !teams.length,
      teamTasks: teamTasks,
      hasTasks: teamTasks.length > 0,
      statistics: context.statistics || {}
    })
  },

  onSwitchWorkspace: function() {
    if (this.data.guestMode) return workspace.promptLogin('登录后可查看和切换已授权的机构球队空间。')
    var that = this
    workspace.chooseWorkspace(workspace.readContext()).then(function(context) {
      that.applyContext(context)
    }).catch(function(error) {
      wx.showToast({ title: error.message || '切换失败', icon: 'none' })
    })
  },

  onCreateTeam: function() {
    if (this.data.guestMode) return workspace.promptLogin('当前是球队功能演示，登录后可创建球队并保存资料。')
    if (!this.data.canManage) {
      wx.showToast({ title: '当前机构未授予球队管理权限', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/guide/team-info/team-info' })
  },

  onTeamTap: function(event) {
    if (this.data.guestMode) return workspace.promptLogin('当前展示示例球队。登录后可进入真实球队并管理球员资料。')
    var id = event.currentTarget.dataset.id
    var team = (this.data.teams || []).find(function(item) { return item.id === id })
    if (!team) return
    wx.setStorageSync('teamInfo', {
      _id: team.id,
      teamId: team.id,
      teamName: team.name,
      teamLogo: team.logo,
      teamCode: team.teamCode
    })
    wx.navigateTo({ url: '/pages/team/team' })
  },

  onTaskTap: function(event) {
    if (this.data.guestMode) return workspace.promptLogin('当前展示示例任务。登录后可处理正式名单和比赛阵容。')
    var tournamentId = event.currentTarget.dataset.tournament
    var teamId = event.currentTarget.dataset.team
    if (!tournamentId) return
    var team = (this.data.teams || []).find(function(item) { return item.id === teamId })
    if (team) {
      wx.setStorageSync('currentTeamId', team.id)
      wx.setStorageSync('teamInfo', {
        _id: team.id,
        teamId: team.id,
        teamName: team.name,
        teamLogo: team.logo,
        teamCode: team.teamCode
      })
    }
    wx.navigateTo({
      url: '/pages/tournament/signup/signup?id=' + encodeURIComponent(tournamentId) + '&teamId=' + encodeURIComponent(teamId || '')
    })
  },

  loadGuestDemo: function() {
    this.setData({
      localVisualQa: false, guestMode: true, loading: false, errorText: '',
      workspaceName: '球队功能演示', workspaceTypeText: '示例数据 · 不保存', canSwitchWorkspace: false, canManage: false,
      teams: [
        { id: 'guest-team-u12', name: '示例 · U12 竞技队', logo: '/images/runtime/icons/brand-v1-tab-team.png', playerCount: 18, coachCount: 2, tournamentCount: 2, claimText: '资料完整度 90%' },
        { id: 'guest-team-u10', name: '示例 · U10 成长队', logo: '/images/runtime/icons/brand-v1-tab-team.png', playerCount: 16, coachCount: 2, tournamentCount: 1, claimText: '资料完整度 82%' }
      ],
      hasTeams: true, showTeamEmpty: false,
      teamTasks: [
        { id: 'guest-roster-task', title: '正式参赛名单待确认', subtitle: '示例赛事 · 登录后可处理', tournamentId: 'guest-event', teamId: 'guest-team-u12' },
        { id: 'guest-lineup-task', title: '本场比赛阵容待提交', subtitle: '示例对阵 · 登录后可处理', tournamentId: 'guest-event', teamId: 'guest-team-u12' }
      ],
      hasTasks: true,
      statistics: { teamCount: 2, playerCount: 34 }
    })
  }
})
