var workspace = require('../../utils/workspace')

function isDevtools() {
  try { return wx.getSystemInfoSync().platform === 'devtools' } catch (error) { return false }
}

function previewMessages() {
  return [
    { id: 'preview-roster', category: 'event', title: '正式名单待审核', subtitle: 'U12 组郑州劲风已提交正式名单，请在赛前完成核验。', timeText: '10:20', isUnread: true, path: '/pages/todo/index' },
    { id: 'preview-team', category: 'team', title: '比赛阵容待提交', subtitle: '赛小蜂 U12 竞技队的本场阵容尚未提交。', timeText: '昨天', isUnread: true, path: '/pages/team/team' },
    { id: 'preview-system', category: 'system', title: '赛事资料已更新', subtitle: '2026 河南青少年足球冠军联赛赛程已更新。', timeText: '昨天', isUnread: false, path: '/pages/schedule/index' }
  ]
}

function decorate(items, tab) {
  return (items || []).filter(function(item) { return tab === 'all' || item.category === tab }).map(function(item) {
    var icon = item.category === 'event' ? '/images/icons/event.svg' : (item.category === 'team' ? '/images/icons/team.svg' : '/images/icons/bell.svg')
    return Object.assign({}, item, { icon: icon, unreadClass: item.isUnread ? 'is-unread' : '' })
  })
}

Page({
  data: {
    loading: true,
    submitting: false,
    errorText: '',
    selectedTab: 'all',
    tabAllClass: 'is-active',
    tabEventClass: '',
    tabTeamClass: '',
    tabSystemClass: '',
    messages: [],
    visibleMessages: [],
    hasMessages: false,
    hasVisibleMessages: false,
    showEmpty: false,
    emptyTitle: '暂无新消息',
    markAllText: '全部已读',
    localVisualQa: false
  },

  onLoad: function(options) {
    if (isDevtools() && options && options.visualQa === '1') { this.setData({ localVisualQa: true }); this.applyMessages(previewMessages()); return }
    this.loadData()
  },
  onShow: function() { if (this.data.localVisualQa) return },
  onPullDownRefresh: function() { this.loadData().finally(function() { wx.stopPullDownRefresh() }) },

  loadData: function() {
    var that = this
    var context = workspace.readContext() || {}
    var cachedMessages = context.messages || []
    if (cachedMessages.length) that.applyMessages(cachedMessages)
    this.setData({ loading: true, errorText: '' })
    wx.cloud.callFunction({
      name: 'getMiniWorkspace',
      data: { action: 'messages', workspaceId: (context.currentWorkspace || {}).id || '' },
      success: function(response) {
        var result = response.result || {}
        if (!result.success) {
          that.setData({ loading: false, errorText: result.message || '消息加载失败，请重试' })
          return
        }
        that.applyMessages(result.messages || [])
        that.updateCachedMessages(result.messages || [], result.unreadMessageCount || 0)
      },
      fail: function() { that.setData({ loading: false, errorText: '网络异常，消息暂未同步' }) }
    })
  },

  updateCachedMessages: function(messages, unreadMessageCount) {
    var context = workspace.readContext()
    if (!context || !context.currentWorkspace) return
    workspace.saveContext(Object.assign({}, context, { messages: messages, unreadMessageCount: unreadMessageCount }))
  },

  applyMessages: function(messages) {
    var selectedTab = this.data.selectedTab
    var visible = decorate(messages, selectedTab)
    this.setData({ loading: false, messages: messages, visibleMessages: visible, hasMessages: messages.length > 0, hasVisibleMessages: visible.length > 0, showEmpty: visible.length === 0, emptyTitle: messages.length ? '此分类暂无消息' : '暂无新消息', markAllText: messages.some(function(item) { return item.isUnread }) ? '全部已读' : '已全部读完' })
  },

  selectTab: function(event) {
    var tab = event.currentTarget.dataset.tab || 'all'
    var allowed = ['all', 'event', 'team', 'system']
    if (allowed.indexOf(tab) < 0) return
    this.setData({ selectedTab: tab, tabAllClass: tab === 'all' ? 'is-active' : '', tabEventClass: tab === 'event' ? 'is-active' : '', tabTeamClass: tab === 'team' ? 'is-active' : '', tabSystemClass: tab === 'system' ? 'is-active' : '' })
    this.applyMessages(this.data.messages)
  },

  markAllRead: function() {
    if (this.data.submitting || !this.data.messages.some(function(item) { return item.isUnread })) return
    this.performRead('', '')
  },

  onMessageTap: function(event) {
    var id = event.currentTarget.dataset.id || ''
    var path = event.currentTarget.dataset.path || ''
    if (!id) return
    this.performRead(id, path)
  },

  performRead: function(messageId, path) {
    var that = this
    var context = workspace.readContext() || {}
    this.setData({ submitting: true, markAllText: messageId ? this.data.markAllText : '正在标记…', errorText: '' })
    wx.cloud.callFunction({
      name: 'getMiniWorkspace',
      data: { action: 'markMessageRead', workspaceId: (context.currentWorkspace || {}).id || '', messageId: messageId },
      success: function(response) {
        var result = response.result || {}
        if (!result.success) { that.setData({ errorText: result.message || '消息状态更新失败，请重试' }); return }
        that.applyMessages(result.messages || [])
        that.updateCachedMessages(result.messages || [], result.unreadMessageCount || 0)
        if (path && path.indexOf('/pages/') === 0) {
          wx.navigateTo({
            url: path,
            fail: function() { that.setData({ errorText: '该通知目标暂不可用，请返回刷新消息' }) }
          })
        }
      },
      fail: function() { that.setData({ errorText: '网络异常，消息状态未更新' }) },
      complete: function() { that.setData({ submitting: false }) }
    })
  }
})
