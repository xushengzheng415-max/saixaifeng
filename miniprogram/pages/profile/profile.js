var workspace = require('../../utils/workspace')
var release = require('../../config/release')

var identityMeta = {
  team_coach: { title: '球队教练', icon: '/images/icons/team.svg' },
  organizer: { title: '赛事负责人', icon: '/images/icons/event.svg' },
  training_coach: { title: '青训教练', icon: '/images/icons/training.svg' }
}

function isDevtools() {
  try { return wx.getSystemInfoSync().platform === 'devtools' } catch (error) { return false }
}

function previewContext() {
  return {
    currentWorkspace: { id: 'preview-workspace', name: '赛小蜂足球俱乐部', logo: '' },
    currentIdentity: { id: 'team_coach', available: ['team_coach', 'organizer', 'training_coach'] },
    unreadMessageCount: 3,
    user: { nickName: '许老师', avatarUrl: '', phoneMasked: '138****1663', phoneVerified: true }
  }
}

function permissionText(permissions) {
  var labels = {
    'workspace.manage': '工作空间管理',
    'event.view': '赛事查看',
    'event.manage': '赛事管理',
    'team.view': '球队查看',
    'team.manage': '球队管理',
    'education.view': '青训查看',
    'education.manage': '青训管理',
    'education.execute': '青训执行'
  }
  return (permissions || []).map(function(item) { return labels[item] || item }).join('、')
}

Page({
  data: {
    loading: true,
    submitting: false,
    errorText: '',
    userName: '微信用户',
    userAvatar: '',
    hasUserAvatar: false,
    phoneMasked: '',
    phoneVerifiedText: '未验证',
    phoneStateClass: 'is-unverified',
    positionsText: '暂无授权岗位',
    permissionsText: '暂无业务权限',
    workspaceName: '当前机构',
    workspaceLogo: '',
    hasWorkspaceLogo: false,
    currentIdentityName: '球队教练',
    currentIdentityIcon: '/images/icons/team.svg',
    hasUnread: false,
    unreadText: '',
    primaryMenus: [
      { icon: '/images/icons/bell.svg', title: '消息中心', action: 'messages', badgeText: '' },
      { icon: '/images/icons/event.svg', title: '我的赛事', action: 'events', badgeText: '' },
      { icon: '/images/icons/team.svg', title: '我的球队', action: 'teams', badgeText: '' },
      { icon: '/images/icons/shield.svg', title: '账号与安全', action: 'security', badgeText: '' }
    ],
    supportMenus: [
      { icon: '/images/icons/list.svg', title: '服务与帮助', action: 'support' },
      { icon: '/images/icons/list.svg', title: '意见反馈', action: 'feedback' },
      { icon: '/images/icons/list.svg', title: '版本日志', action: 'versionLog' },
      { icon: '/images/icons/check.svg', title: '关于赛小蜂', action: 'about' }
    ],
    appVersion: release.version,
    identityOptions: [],
    isIdentitySheet: false,
    hasIdentityOptions: false,
    confirmDisabled: true,
    confirmText: '确认切换',
    localVisualQa: false
  },

  onLoad: function(options) {
    if (isDevtools() && options && options.visualQa === '1') {
      this.setData({ localVisualQa: true })
      this.applyContext(previewContext())
      if (options.state === 'identity-sheet') this.setData({ isIdentitySheet: true })
      return
    }
    this.loadData()
  },
  onShow: function() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) this.getTabBar().syncFromPage(4)
    if (this.data.localVisualQa) return
    this.loadData(true)
  },

  loadData: function(silent) {
    var that = this
    if (!silent) this.setData({ loading: true, errorText: '' })
    var cached = workspace.readContext()
    if (cached) this.applyContext(cached)
    return workspace.loadContext().then(function(context) { that.applyContext(context) }).catch(function(error) {
      that.setData({ loading: false, errorText: error.message || '我的页面加载失败，请重试' })
    })
  },

  applyContext: function(context) {
    if (!context || !context.currentWorkspace) return
    var current = context.currentWorkspace
    var identity = context.currentIdentity || {}
    var currentId = identity.id || 'team_coach'
    var available = identity.available || [currentId]
    var options = available.map(function(id) {
      var meta = identityMeta[id] || identityMeta.team_coach
      return { id: id, title: meta.title, icon: meta.icon, selectedClass: id === currentId ? 'is-current' : '', selectedText: id === currentId ? '当前使用' : '', selectable: id !== currentId }
    })
    var currentMeta = identityMeta[currentId] || identityMeta.team_coach
    var user = context.user || {}
    var positions = current.positions || []
    var permissions = current.permissions || []
    var unread = Number(context.unreadMessageCount || 0)
    var primaryMenus = this.data.primaryMenus.map(function(item) {
      return Object.assign({}, item, { badgeText: item.action === 'messages' && unread > 0 ? String(unread) : '' })
    })
    this.setData({
      loading: false,
      userName: user.nickName || '微信用户',
      userAvatar: user.avatarUrl || '',
      hasUserAvatar: Boolean(user.avatarUrl),
      phoneMasked: user.phoneMasked || '',
      phoneVerifiedText: user.phoneVerified ? '手机号已验证' : '手机号未验证',
      phoneStateClass: user.phoneVerified ? 'is-verified' : 'is-unverified',
      positionsText: positions.length ? positions.join('、') : '暂无授权岗位',
      permissionsText: permissions.length ? permissionText(permissions) : '暂无业务权限',
      workspaceName: current.name || '当前机构',
      workspaceLogo: current.logo || '',
      hasWorkspaceLogo: Boolean(current.logo),
      currentIdentityName: currentMeta.title,
      currentIdentityIcon: currentMeta.icon,
      identityOptions: options,
      primaryMenus: primaryMenus,
      hasUnread: unread > 0,
      unreadText: unread > 99 ? '99+' : (unread > 0 ? String(unread) : ''),
      hasIdentityOptions: options.length > 1,
      confirmDisabled: true,
      confirmText: '确认切换',
      errorText: ''
    })
  },

  goToInfo: function() { wx.navigateTo({ url: '/pages/profile/info/info' }) },
  goToMessages: function() { wx.navigateTo({ url: '/pages/messages/index' }) },

  onMenuTap: function(event) {
    var action = event.currentTarget.dataset.action || ''
    if (action === 'messages') return this.goToMessages()
    if (action === 'events') return wx.switchTab({ url: '/pages/event/index' })
    if (action === 'teams') return wx.switchTab({ url: '/pages/teams/index' })
    if (action === 'security') return this.goToInfo()
    if (action === 'support') return wx.showModal({ title: '服务与帮助', content: '请在当前机构的赛事或球队页面查看对应待办；需要协助时可通过机构管理员发起咨询。', showCancel: false })
    if (action === 'feedback') return wx.showModal({ title: '意见反馈', content: '请将问题场景、页面和复现步骤提交给机构管理员，以便跟进处理。', showCancel: false })
    if (action === 'versionLog') return wx.navigateTo({ url: '/pages/profile/version-log/version-log' })
    if (action === 'about') return wx.showModal({ title: '关于赛小蜂足球', content: '赛小蜂足球为赛事组织、球队协作和赛场执行提供统一服务。\n\n当前版本：' + release.version, showCancel: false })
  },

  openIdentitySheet: function() {
    if (!this.data.hasIdentityOptions) {
      wx.showToast({ title: '当前机构暂无其他已授权身份', icon: 'none' })
      return
    }
    this.setData({ isIdentitySheet: true, errorText: '' })
  },

  closeIdentitySheet: function() { this.setData({ isIdentitySheet: false, confirmDisabled: true, confirmText: '确认切换', errorText: '' }) },

  selectIdentity: function(event) {
    var id = event.currentTarget.dataset.id || ''
    var selected = this.data.identityOptions.some(function(item) { return item.id === id && item.selectable })
    if (!selected) return
    var options = this.data.identityOptions.map(function(item) {
      var isSelected = item.id === id
      return Object.assign({}, item, { selectedClass: isSelected ? 'is-selected' : (item.selectedText ? 'is-current' : ''), selectedText: isSelected ? '待切换' : (item.selectable ? '' : '当前使用') })
    })
    this.setData({ identityOptions: options, selectedIdentity: id, confirmDisabled: false })
  },

  confirmIdentitySwitch: function() {
    var that = this
    var selected = this.data.selectedIdentity || ''
    if (!selected || this.data.confirmDisabled || this.data.submitting) return
    var context = workspace.readContext() || {}
    this.setData({ submitting: true, confirmText: '正在验证…', errorText: '' })
    wx.cloud.callFunction({
      name: 'getMiniWorkspace',
      data: { action: 'setHomeIdentity', workspaceId: (context.currentWorkspace || {}).id || '', identity: selected },
      success: function(response) {
        var result = response.result || {}
        if (!result.success) { that.setData({ errorText: result.message || '身份切换失败，请刷新后重试' }); return }
        workspace.loadContext({ workspaceId: result.workspaceId || '' }).then(function() {
          wx.switchTab({ url: '/pages/home/home' })
        }).catch(function() { that.setData({ errorText: '身份已保存，但首页加载失败，请重试' }) })
      },
      fail: function() { that.setData({ errorText: '网络异常，身份未切换' }) },
      complete: function() { that.setData({ submitting: false, confirmText: '确认切换' }) }
    })
  },

  onLogout: function() {
    wx.showModal({ title: '退出登录', content: '退出后将清理当前设备上的登录和工作空间缓存，确定继续吗？', confirmColor: '#C43D34', success: function(result) {
      if (!result.confirm) return
      var app = getApp()
      if (app && app.logout) app.logout()
      workspace.clearContext()
      wx.reLaunch({ url: '/pages/login/login' })
    } })
  },

  noop: function() {}
})
