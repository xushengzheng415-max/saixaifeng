var workspace = require('../../utils/workspace')
var signupDraft = require('../../utils/signup-draft')
var eventTaskRules = require('../../utils/event-tasks')

Page({
  data: {
    loading: true,
    errorText: '',
    workspaceName: '当前机构',
    canSwitchWorkspace: false,
    pendingCount: 0,
    reviewingCount: 0,
    activeStage: 'all',
    stageTabs: [
      { id: 'all', text: '全部', itemClass: 'active' },
      { id: 'pre', text: '赛前', itemClass: '' },
      { id: 'live', text: '赛中只读', itemClass: '' },
      { id: 'post', text: '赛后', itemClass: '' }
    ],
    tournamentName: '',
    tournamentMeta: '',
    tasks: [],
    visibleTasks: [],
    hasTasks: false,
    visualQa: false
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
      this.getTabBar().syncFromPage(2)
    }
    if (!this.data.visualQa) {
      this.applyContext(workspace.readContext())
      this.loadData(true)
    }
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
      that.setData({ loading: false, errorText: error.message || '待办加载失败' })
    })
  },

  applyContext: function(context) {
    if (!context || !context.currentWorkspace) return
    var tournaments = context.tournaments || []
    var eventTasks = (context.eventTasks || []).slice()
    var localDraft = signupDraft.resolveAgainstRegistrations(signupDraft.read(), context.registrations || [])
    // 本页只聚合当前赛事：本地草稿若已不属于任何在列赛事，直接删除这条历史残留。
    localDraft = signupDraft.discardOutOfScope(localDraft, tournaments.map(function(item) { return item.id || item._id }))
    var localDraftTask = signupDraft.toTask(localDraft)
    // 同一个报名草稿服务端已下发时不再叠加本地草稿，避免一件事出现两条。
    var serverHasDraft = !!localDraftTask && eventTasks.some(function(item) {
      if (String(item.type || '') !== 'registration_draft') return false
      if (String(item.tournamentId || '') !== localDraftTask.tournamentId) return false
      var serverTeam = String(item.teamId || '')
      var localTeam = String(localDraftTask.teamId || '')
      return !serverTeam || !localTeam || serverTeam === localTeam
    })
    var mergedTasks = serverHasDraft ? eventTasks : (localDraftTask ? [localDraftTask].concat(eventTasks) : eventTasks)
    var dismissed = eventTaskRules.readDismissed()
    if (dismissed.length) mergedTasks = eventTaskRules.filterDismissed(mergedTasks)
    // 卡片不展示球队名，同赛事同组别的报名草稿只保留一条，避免出现两行一模一样的内容。
    var seenDrafts = {}
    var tasks = []
    mergedTasks.forEach(function(item) {
      if (String(item.type || '') === 'registration_draft') {
        var draftKey = String(item.tournamentId || '') + '|' + String(item.divisionId || 'default')
        if (seenDrafts[draftKey]) return
        seenDrafts[draftKey] = true
      }
      item.statusClass = item.status === 'reviewing' ? 'reviewing' : 'pending'
      item.statusText = item.status === 'reviewing' ? '审核中' : '待处理'
      item.stage = item.type === 'match' ? 'live' : (item.type === 'result_review' ? 'post' : 'pre')
      item.typeIcon = item.type === 'registration_review' ? '/images/runtime/icons/brand-v2-13.png' : (item.type === 'registration' ? '/images/runtime/icons/brand-v2-08.png' : (item.type === 'result_review' ? '/images/runtime/icons/brand-v2-09.png' : '/images/runtime/icons/brand-v2-14.png'))
      item.deadlineText = item.deadlineText || item.timeText || '请尽快处理'
      item.detailText = item.sourceText || '赛事协作'
      item.actionText = item.type === 'registration_draft' ? '继续报名' : '查看'
      tasks.push(item)
    })
    var pendingTasks = tasks.filter(function(item) { return item.status === 'pending' })
    var firstTournament = tournaments[0] || {}
    this.setData({
      loading: false,
      errorText: '',
      workspaceName: context.currentWorkspace.name,
      canSwitchWorkspace: (context.workspaces || []).length > 1,
      pendingCount: pendingTasks.length,
      reviewingCount: tasks.filter(function(item) { return item.status === 'reviewing' }).length,
      tournamentName: firstTournament.name || '赛事协作待办',
      tournamentMeta: firstTournament.dateText || '当前授权赛事',
      tasks: tasks
    })
    this.applyStage()
  },

  applyStage: function() {
    var activeStage = this.data.activeStage
    var visible = (this.data.tasks || []).filter(function(item) {
      return activeStage === 'all' || item.stage === activeStage
    })
    var stageTabs = (this.data.stageTabs || []).map(function(item) {
      item.itemClass = item.id === activeStage ? 'active' : ''
      return item
    })
    this.setData({ stageTabs: stageTabs, visibleTasks: visible, hasTasks: visible.length > 0 })
  },

  onStageTap: function(event) {
    this.setData({ activeStage: event.currentTarget.dataset.id || 'all' })
    this.applyStage()
  },

  onBackTap: function() {
    var pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack()
      return
    }
    wx.switchTab({ url: '/pages/home/home' })
  },

  onSwitchWorkspace: function() {
    var that = this
    workspace.chooseWorkspace(workspace.readContext()).then(function(context) {
      that.applyContext(context)
    }).catch(function(error) {
      wx.showToast({ title: error.message || '切换失败', icon: 'none' })
    })
  },

  onTaskLongPress: function(event) {
    var that = this
    var dataset = event.currentTarget.dataset || {}
    var taskId = String(dataset.taskId || '')
    if (!taskId) return
    var taskType = String(dataset.type || '')
    var key = eventTaskRules.dismissKeyOf(taskType, taskId, dataset.tournament, dataset.division)
    wx.showModal({
      title: '移除这条待办',
      content: '只从本机待办列表移除，不会删除赛事、报名或审核数据。',
      confirmText: '移除',
      confirmColor: '#C0392B',
      success: function(res) {
        if (!res.confirm) return
        eventTaskRules.dismiss({ type: taskType, id: taskId, tournamentId: dataset.tournament, divisionId: dataset.division })
        // 报名草稿是本机缓存，移除待办时一并清掉，避免下次又被合成出来。
        if (taskType === 'registration_draft') signupDraft.discard()
        var remain = (that.data.tasks || []).filter(function(item) {
          return eventTaskRules.dismissKeyOf(item.type, item.id, item.tournamentId, item.divisionId) !== key
        })
        that.setData({
          tasks: remain,
          pendingCount: remain.filter(function(item) { return item.status === 'pending' }).length,
          reviewingCount: remain.filter(function(item) { return item.status === 'reviewing' }).length
        })
        that.applyStage()
        wx.showToast({ title: '已移除', icon: 'none' })
      }
    })
  },

  onTaskTap: function(event) {
    var tournamentId = event.currentTarget.dataset.tournament
    var teamId = event.currentTarget.dataset.team
    var audience = event.currentTarget.dataset.audience
    var taskType = event.currentTarget.dataset.type
    var divisionId = event.currentTarget.dataset.division
    var inviteKey = event.currentTarget.dataset.invite
    if (!tournamentId) return
    if (audience === 'organizer') {
      wx.navigateTo({ url: '/pages/tournament/teams/teams?id=' + tournamentId })
      return
    }
    var url = '/pages/tournament/signup/signup?id=' + tournamentId
    if (teamId) url += '&teamId=' + teamId
    if (divisionId) url += '&divisionId=' + encodeURIComponent(divisionId)
    if (inviteKey) url += '&inviteKey=' + encodeURIComponent(inviteKey)
    if (taskType === 'registration_draft') url += '&from=task'
    wx.navigateTo({ url: url })
  },

  loadVisualFixture: function() {
    var tasks = [
      { id: 't1', title: '球队报名审核', subtitle: '6 支球队 · U10/U12', deadlineText: '明天 18:00 截止', detailText: '报名审批', statusText: '待处理', statusClass: 'pending', typeIcon: '/images/runtime/icons/brand-v2-13.png', stage: 'pre', tournamentId: 'visual-pro', audience: 'organizer' },
      { id: 't2', title: '正式名单审核', subtitle: '3 支球队 · U10/U12', deadlineText: '明天 18:00 截止', detailText: '名单审批', statusText: '待处理', statusClass: 'pending', typeIcon: '/images/runtime/icons/brand-v2-13.png', stage: 'pre', tournamentId: 'visual-pro', audience: 'organizer' },
      { id: 't3', title: '裁判场次缺员', subtitle: '2 场比赛 · U12', deadlineText: '明天 18:00 截止', detailText: '赛中准备', statusText: '待处理', statusClass: 'pending', typeIcon: '/images/runtime/icons/brand-v2-14.png', stage: 'pre', tournamentId: 'visual-pro', audience: 'organizer' },
      { id: 't4', title: '赛果复核', subtitle: '8 场比赛 · U12 A组', deadlineText: '7月30日 18:00 截止', detailText: '赛后复核', statusText: '待处理', statusClass: 'pending', typeIcon: '/images/runtime/icons/brand-v2-09.png', stage: 'post', tournamentId: 'visual-pro', audience: 'organizer' }
    ]
    this.setData({ loading: false, visualQa: true, workspaceName: '河南青少年赛事中心', canSwitchWorkspace: true, pendingCount: 10, reviewingCount: 0, tournamentName: '2026 河南青少年足球冠军联赛', tournamentMeta: '7月20日 — 8月18日 · 河南省体育中心', tasks: tasks })
    this.applyStage()
  }
})
