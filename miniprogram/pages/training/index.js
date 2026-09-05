var workspace = require('../../utils/workspace')

function visualFixture(mode) {
  var active = mode === 'active'
  var restricted = mode === 'restricted'
  return {
    loading: false,
    errorText: '',
    visualQa: true,
    workspaceName: '赛小蜂青训中心',
    canSwitchWorkspace: true,
    isTemporary: false,
    hasEntitlement: active || restricted,
    hasPermission: active,
    canUseTraining: active,
    showNoEntitlement: !active && !restricted,
    showNoPermission: restricted,
    entitlementText: active || restricted ? '机构已开通' : '尚未开通',
    trainingSchedule: active ? [
      { id: 's1', title: 'U12 技术与对抗训练', timeText: '今天 18:30–20:00', location: '东区 2 号场', statusText: '待签到' },
      { id: 's2', title: 'U10 基础协调训练', timeText: '明天 09:00–10:30', location: '西区训练馆', statusText: '已排课' }
    ] : [],
    trainingTasks: active ? [
      { id: 't1', title: '3 名球员请假待确认', subtitle: 'U12 技术与对抗训练' },
      { id: 't2', title: '课后训练记录待补充', subtitle: '昨天 · U10 基础协调训练' }
    ] : [],
    hasSchedule: active,
    hasTasks: active
  }
}

Page({
  data: {
    loading: true,
    errorText: '',
    workspaceName: '当前机构',
    canSwitchWorkspace: false,
    isTemporary: false,
    hasEntitlement: false,
    hasPermission: false,
    canUseTraining: false,
    showNoEntitlement: false,
    showNoPermission: false,
    entitlementText: '未开通',
    trainingSchedule: [],
    trainingTasks: [],
    hasSchedule: false,
    hasTasks: false,
    visualQa: false,
    guestMode: false
  },

  onLoad: function(options) {
    var query = options || {}
    if (workspace.isVisualQaEnabled(query)) {
      this.setData(visualFixture(String(query.state || 'locked')))
      return
    }
    if (workspace.isGuestReviewEnabled(query) || !workspace.hasAuthenticatedUser()) {
      this.loadGuestDemo()
      return
    }
    this.loadData()
  },

  onShow: function() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().syncFromPage(3)
    }
    if (this.data.guestMode) return
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
      that.setData({ loading: false, errorText: error.message || '青训中心加载失败' })
    })
  },

  applyContext: function(context) {
    if (!context || !context.currentWorkspace) return
    var current = context.currentWorkspace
    var entitlements = current.entitlements || {}
    var training = entitlements.training || {}
    var hasEntitlement = !!training.canUse
    var hasPermission = workspace.hasPermission('education.view', context) ||
      workspace.hasPermission('education.manage', context) ||
      workspace.hasPermission('education.execute', context)
    var statusLabels = {
      active: '机构已开通',
      enabled: '机构已开通',
      paid: '机构已开通',
      trial: '机构试用中',
      inactive: '机构未开通',
      unavailable: '临时空间不可用'
    }
    this.setData({
      loading: false,
      errorText: '',
      workspaceName: current.name,
      canSwitchWorkspace: (context.workspaces || []).length > 1,
      isTemporary: !!current.isTemporary,
      hasEntitlement: hasEntitlement,
      hasPermission: hasPermission,
      canUseTraining: hasEntitlement && hasPermission && !current.isTemporary,
      showNoEntitlement: !current.isTemporary && !hasEntitlement,
      showNoPermission: !current.isTemporary && hasEntitlement && !hasPermission,
      entitlementText: statusLabels[training.status] || '机构未开通',
      trainingSchedule: context.trainingSchedule || [],
      trainingTasks: context.trainingTasks || [],
      hasSchedule: (context.trainingSchedule || []).length > 0,
      hasTasks: (context.trainingTasks || []).length > 0
    })
  },

  onSwitchWorkspace: function() {
    if (this.data.guestMode) return workspace.promptLogin('登录后可查看机构青训空间和已开通的服务。')
    if (this.data.visualQa) return
    var that = this
    workspace.chooseWorkspace(workspace.readContext()).then(function(context) {
      that.applyContext(context)
    }).catch(function(error) {
      wx.showToast({ title: error.message || '切换失败', icon: 'none' })
    })
  },

  onOpenRequest: function() {
    if (this.data.guestMode) return workspace.promptLogin('当前是青训功能演示，登录后可查看机构的开户和权限状态。')
    if (this.data.visualQa) return
    wx.showModal({
      title: '开通青训经营能力',
      content: '青训由机构统一订阅。具体价格、试用和支付规则尚未确定，请联系机构负责人。',
      showCancel: false,
      confirmText: '我知道了'
    })
  },

  loadGuestDemo: function() {
    var demo = visualFixture('active')
    demo.visualQa = false
    demo.guestMode = true
    demo.workspaceName = '青训功能演示'
    demo.canSwitchWorkspace = false
    demo.entitlementText = '示例数据 · 不保存'
    demo.trainingSchedule = [
      { id: 'guest-course-1', title: '示例 · U12 技术训练', timeText: '今天 18:30–20:00', location: '示例 1 号场', statusText: '待签到' },
      { id: 'guest-course-2', title: '示例 · U10 基础训练', timeText: '明天 09:00–10:30', location: '示例训练馆', statusText: '已排课' }
    ]
    demo.trainingTasks = [
      { id: 'guest-training-task-1', title: '示例 · 请假待确认', subtitle: '登录后可处理课程执行任务' },
      { id: 'guest-training-task-2', title: '示例 · 课后记录待补充', subtitle: '登录后可保存训练记录' }
    ]
    this.setData(demo)
  },

  // 课程和待办仅在工作空间返回可进入的目标后才可点击；
  // 当前接口不提供详情路由，页面保持信息卡，避免制造死按钮。
})
