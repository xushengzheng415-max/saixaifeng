var workspace = require('../../../utils/workspace')

function buildFilterTabs(mode, members) {
  var all = members.length
  var coaches = members.filter(function (item) { return item.kind === 'coach' }).length
  var managers = members.filter(function (item) { return item.kind === 'manager' }).length
  return [
    { id: 'all', label: '全部 ' + all, className: mode === 'all' ? 'member-filter member-filter-active' : 'member-filter' },
    { id: 'coach', label: '教练 ' + coaches, className: mode === 'coach' ? 'member-filter member-filter-active' : 'member-filter' },
    { id: 'manager', label: '管理员 ' + managers, className: mode === 'manager' ? 'member-filter member-filter-active' : 'member-filter' }
  ]
}

function visualFixture() {
  var members = [
    { id: 'leader-xu', name: '许老师', roleText: '负责人 / 主教练', phoneMasked: '173****1663', statusText: '已加入', kind: 'coach', pending: false, avatarText: '许' },
    { id: 'coach-wang', name: '王教练', roleText: '助理教练', phoneMasked: '186****2871', statusText: '已加入', kind: 'coach', pending: false, avatarText: '王' },
    { id: 'manager-liu', name: '刘老师', roleText: '领队 / 管理员', phoneMasked: '138****6721', statusText: '待确认', kind: 'manager', pending: true, avatarText: '刘' }
  ]
  return { team: { name: '赛小蜂 U12 竞技队', logo: '/images/icons/tab-team-active.svg' }, members: members, canManage: true }
}

function prepareMembers(members) {
  return members.map(function (item) {
    var row = Object.assign({}, item)
    row.phoneMasked = row.phoneMasked || ''
    row.avatarText = row.avatarText || String(row.name || '球').slice(0, 1)
    row.statusClass = row.pending ? 'member-status member-status-pending' : 'member-status member-status-active'
    return row
  })
}

Page({
  data: {
    teamId: '', loading: true, team: {}, members: [], visible: [], memberCount: 0,
    canManage: false, keyword: '', filter: 'all', filterTabs: [], sharePath: '', isDevtools: false,
    inviteMode: false, invite: {}, inviteAccepted: false, inviteAvailable: true, inviteStatusText: '', showMemberLoading: true, showMemberContent: false
  },
  onLoad: function (options) {
    var query = options || {}
    var isDevtools = workspace.isVisualQaEnabled(query)
    var inviteId = String(query.memberInviteId || query.inviteId || '')
    this.setData({ teamId: String(query.teamId || ''), isDevtools: isDevtools, inviteMode: Boolean(inviteId), showMemberLoading: !inviteId, showMemberContent: false })
    if (inviteId) {
      this.loadInvite(inviteId)
      return
    }
    if (isDevtools) {
      var fixture = visualFixture()
      var fixtureMembers = prepareMembers(fixture.members)
      this.setData({ loading: false, showMemberLoading: false, showMemberContent: true, team: fixture.team, members: fixtureMembers, memberCount: fixtureMembers.length, canManage: fixture.canManage })
      this.filter()
      return
    }
    this.load()
  },
  onShareAppMessage: function () {
    if (this.data.inviteMode && this.data.invite && this.data.invite.id) {
      return { title: '邀请你加入' + (this.data.team.name || '球队'), path: '/pages/team/members/members?teamId=' + encodeURIComponent(this.data.teamId) + '&memberInviteId=' + encodeURIComponent(this.data.invite.id) }
    }
    return { title: '邀请你加入球队管理', path: this.data.sharePath || '/pages/team/team' }
  },
  loadInvite: function (inviteId) {
    var self = this
    wx.cloud.callFunction({
      name: 'getMiniWorkspace',
      data: { action: 'teamMemberInvite', inviteId: inviteId }
    }).then(function (response) {
      var result = response.result || {}
      if (!result.success) throw new Error(result.message || '邀请加载失败')
      self.setData({ loading: false, showMemberLoading: false, showMemberContent: false, inviteAvailable: true, inviteStatusText: '', team: result.team || {}, invite: result.invitation || {}, inviteAccepted: Boolean(result.alreadyMember) })
    }).catch(function (error) {
      self.setData({ loading: false, showMemberLoading: false, showMemberContent: false, inviteAvailable: false, inviteStatusText: error.message || '邀请加载失败' })
      wx.showToast({ title: error.message || '邀请加载失败', icon: 'none' })
    })
  },
  acceptInvite: function () {
    var self = this
    if (!this.data.invite || !this.data.invite.id || this.data.inviteAccepted) {
      wx.redirectTo({ url: '/pages/team/detail/detail?teamId=' + encodeURIComponent(this.data.teamId) })
      return
    }
    wx.cloud.callFunction({
      name: 'getMiniWorkspace',
      data: { action: 'acceptTeamMemberInvite', inviteId: this.data.invite.id }
    }).then(function (response) {
      var result = response.result || {}
      if (!result.success) throw new Error(result.message || '加入球队失败')
      self.setData({ inviteAccepted: true, teamId: result.teamId || self.data.teamId })
      wx.showToast({ title: '已加入球队', icon: 'success' })
    }).catch(function (error) {
      wx.showToast({ title: error.message || '加入球队失败', icon: 'none' })
    })
  },
  load: function () {
    var self = this
    var context = workspace.readContext() || {}
    wx.cloud.callFunction({
      name: 'getMiniWorkspace',
      data: { action: 'teamMembers', workspaceId: (context.currentWorkspace || {}).id, teamId: this.data.teamId }
    }).then(function (response) {
      var result = response.result || {}
      if (!result.success) throw new Error(result.message || '成员加载失败')
      var members = prepareMembers(result.members || [])
      self.setData({ loading: false, showMemberLoading: false, showMemberContent: true, team: result.team || {}, members: members, memberCount: members.length, canManage: result.canManage })
      self.filter()
    }).catch(function (error) {
      self.setData({ loading: false, showMemberLoading: false, showMemberContent: true })
      wx.showToast({ title: error.message || '成员加载失败', icon: 'none' })
    })
  },
  search: function (event) {
    this.setData({ keyword: String(event.detail.value || '') })
    this.filter()
  },
  chooseFilter: function (event) {
    this.setData({ filter: event.currentTarget.dataset.id })
    this.filter()
  },
  filter: function () {
    var key = this.data.keyword
    var mode = this.data.filter
    var members = this.data.members || []
    var rows = members.filter(function (item) {
      var phone = item.phoneMasked || ''
      var name = item.name || ''
      var hit = !key || name.indexOf(key) >= 0 || phone.indexOf(key) >= 0
      return hit && (mode === 'all' || item.kind === mode)
    })
    this.setData({ visible: rows, filterTabs: buildFilterTabs(mode, members) })
  },
  invite: function () {
    var self = this
    var context = workspace.readContext() || {}
    if (!this.data.canManage) return
    wx.cloud.callFunction({
      name: 'getMiniWorkspace',
      data: { action: 'createTeamMemberInvite', workspaceId: (context.currentWorkspace || {}).id, teamId: this.data.teamId }
    }).then(function (response) {
      var result = response.result || {}
      if (!result.success) throw new Error(result.message || '邀请创建失败')
      self.setData({ sharePath: result.path })
      wx.showShareMenu({ withShareTicket: false })
      wx.showToast({ title: '已生成分享邀请', icon: 'success' })
    }).catch(function (error) {
      wx.showToast({ title: error.message || '邀请创建失败', icon: 'none' })
    })
  },
  resend: function () {
    this.invite()
  },
  back: function () {
    wx.navigateBack({ fail: function () { wx.switchTab({ url: '/pages/teams/index' }) } })
  }
})
