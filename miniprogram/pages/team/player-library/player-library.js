var workspace = require('../../../utils/workspace')

Page({
  data: {
    loading: true, errorText: '', teamId: '', teamName: '', teamLogo: '', canManage: false,
    allPlayers: [], players: [], query: '', filter: 'all',
    completeCount: 0, pendingCount: 0, exceptionCount: 0, totalCount: 0, hasPlayers: false, hasPending: false, pendingImportCount: 0, hasPendingImport: false,
    pendingJoins: [], pendingJoinCount: 0, hasPendingJoin: false, showPendingJoin: false, reviewingId: '', visualQa: false,
    filterAllClass: 'active', filterPendingClass: '', filterExceptionClass: ''
  },
  onLoad: function(options) {
    options = options || {}
    if (workspace.isVisualQaEnabled(options)) {
      this.setData({ visualQa: true })
      this.loadVisualFixture()
      return
    }
    var teamId = String(options.teamId || '')
    this._workspaceReady = !teamId
    this.setData({ teamId: teamId, highlightPending: options.pendingTeamConfirm === '1' })
    if (teamId) this.enterTeamWorkspace(teamId)
  },
  // 服务号「加入团队申请审批提醒」现在带 teamId 直达本页，而当前工作空间可能仍是另一支球队的空间。
  // 沿用旧空间调用 teamPlayers 会报「球队不存在或不属于当前工作空间」，所以先按球队入口切换空间。
  enterTeamWorkspace: function(teamId) {
    var that = this
    this._enterRequest = workspace.loadContext().then(function(context) {
      var teams = (context && context.teams) || []
      if (teams.some(function(item) { return String(item.id || item._id || '') === teamId })) return context
      var entry = ((context && context.homeEntries) || []).filter(function(item) { return item.type === 'team' && String(item.id || '') === teamId })[0]
      if (!entry || !entry.workspaceId) throw new Error('该球队不在当前工作空间，或当前账号没有查看权限')
      return workspace.switchWorkspace(entry.workspaceId)
    }).then(function() {
      that._workspaceReady = true
      return that.loadPlayers(true)
    }).catch(function(error) {
      that._workspaceReady = true
      // 进入失败时当前工作空间仍是别的球队，onShow 再请求只会重复报错。
      that._entryFailed = true
      that.setData({ loading: false, errorText: (error && error.message) || '无法进入该球队球员库' })
    })
    return this._enterRequest
  },
  onShow: function() { if (this.data.teamId && !this.data.visualQa && this._entryFailed !== true && this._workspaceReady !== false) this.loadPlayers(true) },
  loadPlayers: function(silent) {
    var that = this
    if (this._loadingRequest) return this._loadingRequest
    if (silent !== true) this.setData({ loading: true, errorText: '' })
    this._loadingRequest = wx.cloud.callFunction({ name: 'getMiniWorkspace', data: { action: 'teamPlayers', includePlayerCards: false, workspaceId: (workspace.readContext() || {}).currentWorkspace && (workspace.readContext() || {}).currentWorkspace.id, teamId: this.data.teamId } })
      .then(function(res) {
        var result = res.result || {}
        if (!result.success) throw new Error(result.message || '球员库加载失败')
        var completeCount = result.counts.complete || 0, pendingCount = result.counts.pending || 0, exceptionCount = result.counts.exception || 0
        that.setData({ loading: false, errorText: '', teamId: result.team.id, teamName: result.team.name, teamLogo: result.team.logo || '', canManage: result.canManage, allPlayers: result.players || [], completeCount: completeCount, pendingCount: pendingCount, exceptionCount: exceptionCount, totalCount: completeCount + pendingCount + exceptionCount, hasPending: Boolean(pendingCount), pendingImportCount:Number(result.pendingImportCount || 0), hasPendingImport:Boolean(result.hasPendingImport), pendingJoins: result.pendingJoins || [], reviewingId: '' })
        that.applyPendingJoins()
        that.applyFilters()
        if (that.data.highlightPending) {
          if (that.data.showPendingJoin) { wx.showToast({ title: '有 ' + that.data.pendingJoinCount + ' 位球员待确认入队', icon: 'none', duration: 3000 }) }
          else if (that.data.canManage) { wx.showToast({ title: '暂无待确认的入队申请', icon: 'none', duration: 2000 }) }
          that.setData({ highlightPending: false })
        }
      }).catch(function(error) { that.setData({ loading: false, errorText: error.message || '球员库加载失败，请重试' }) }).finally(function() { that._loadingRequest = null })
    return this._loadingRequest
  },
  openImportedReview: function() { wx.navigateTo({ url:'/pages/team/imported-player-review/imported-player-review?teamId=' + encodeURIComponent(this.data.teamId) }) },
  applyFilters: function() {
    var query = String(this.data.query || '').trim().toLowerCase(), filter = this.data.filter
    var rows = this.data.allPlayers.filter(function(item) {
      var hit = !query || String(item.name || '').toLowerCase().indexOf(query) >= 0 || String(item.jerseyName || '').toLowerCase().indexOf(query) >= 0
      var type = filter === 'all' || item.profileStatus === filter
      return hit && type
    }).map(function(item) { return Object.assign({}, item, { avatarText: String(item.name || '球').slice(0, 1), isComplete: item.profileStatus === 'complete', isPending: item.profileStatus === 'pending', isException: item.profileStatus === 'exception' }) })
    this.setData({ players: rows, hasPlayers: Boolean(rows.length) })
  },
  onSearch: function(e) { this.setData({ query: e.detail.value || '' }); this.applyFilters() },
  setFilter: function(e) { var filter=e.currentTarget.dataset.filter || 'all';this.setData({ filter:filter,filterAllClass:filter==='all'?'active':'',filterPendingClass:filter==='pending'?'active':'',filterExceptionClass:filter==='exception'?'active':'' }); this.applyFilters() },
  // 用户确认口径（2026-11-02）：从服务号通知直达本页时页面栈只有一页，返回无处可退，
  // 必须给出明确选择（回小程序首页 / 留在本页），并常驻「首页」入口，方便回主页看其他内容。
  goHome: function() {
    wx.switchTab({
      url: '/pages/home/home',
      fail: function() { wx.reLaunch({ url: '/pages/home/home' }) }
    })
  },
  onBack: function() {
    var pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    if (pages.length > 1) { wx.navigateBack({ delta: 1 }); return }
    var that = this
    wx.showModal({
      title: '返回小程序首页',
      content: '当前是从通知直达的页面，可回到小程序首页继续浏览，也可以留在本页。',
      confirmText: '回首页',
      cancelText: '留在本页',
      success: function(result) { if (result.confirm) that.goHome() }
    })
  },
  invitePlayer: function() { if (!this.data.canManage) return wx.showToast({ title: '当前身份没有邀请权限', icon: 'none' }); wx.navigateTo({ url: '/pages/team/player-invite/player-invite?teamId=' + encodeURIComponent(this.data.teamId) }) },
  addPlayer: function() { if (!this.data.canManage) return wx.showToast({ title: '当前身份只可查看球员资料', icon: 'none' }); wx.navigateTo({ url: '/pages/team/player-add/player-add?teamId=' + encodeURIComponent(this.data.teamId) + '&teamName=' + encodeURIComponent(this.data.teamName) }) },
  inviteParent: function() { if (!this.data.canManage) return wx.showToast({ title: '当前身份没有邀请权限', icon: 'none' }); var target = this.data.allPlayers.filter(function(item) { return item.needsParentCompletion })[0]; if (!target) return wx.showToast({ title: '暂无需要补充资料的球员', icon: 'none' }); wx.navigateTo({ url: '/pages/team/parent-collaboration/parent-collaboration?teamId=' + encodeURIComponent(this.data.teamId) + '&playerId=' + encodeURIComponent(target.id) }) },
  openPlayer: function(e) { var id = e.currentTarget.dataset.id; if (id) wx.navigateTo({ url: '/pages/team/player-detail/player-detail?id=' + encodeURIComponent(id) + '&teamId=' + encodeURIComponent(this.data.teamId) }) },
  decoratePendingJoins: function(rows, reviewingId) {
    var reviewing = String(reviewingId || '')
    return (rows || []).map(function(item) {
      var number = String(item.jerseyNumber || '').trim(), jerseyName = String(item.jerseyName || '').trim()
      var jerseyText = number ? ('#' + number + (jerseyName ? ' ' + jerseyName : '')) : jerseyName
      var isReviewing = String(item.id || '') === reviewing
      return Object.assign({}, item, { avatarText: String(item.avatarText || item.name || '球').slice(0, 1), showJersey: Boolean(jerseyText), jerseyText: jerseyText, showPosition: Boolean(String(item.position || '').trim()), isReviewing: isReviewing, confirmText: isReviewing ? '处理中…' : '确认入队', rejectText: isReviewing ? '处理中…' : '驳回' })
    })
  },
  applyPendingJoins: function() {
    var rows = this.decoratePendingJoins(this.data.pendingJoins, this.data.reviewingId), count = rows.length
    this.setData({ pendingJoins: rows, pendingJoinCount: count, hasPendingJoin: Boolean(count), showPendingJoin: Boolean(this.data.canManage && count) })
  },
  confirmTeamPlayerJoin: function(e) {
    var that = this, playerId = e.currentTarget.dataset.id
    if (!playerId || this._reviewing) return
    wx.showModal({ title: '确认入队', content: '确认后该球员将正式进入球队球员库，成为在队球员。', confirmText: '确认入队', success: function(res) { if (res.confirm) that.submitJoinReview('confirmTeamPlayerJoin', playerId, '') } })
  },
  rejectTeamPlayerJoin: function(e) {
    var that = this, playerId = e.currentTarget.dataset.id
    if (!playerId || this._reviewing) return
    wx.showModal({ title: '驳回入队', editable: true, placeholderText: '可填写驳回原因（选填）', confirmText: '确认驳回', success: function(res) { if (res.confirm) that.submitJoinReview('rejectTeamPlayerJoin', playerId, String(res.content || '').trim()) } })
  },
  submitJoinReview: function(action, playerId, reason) {
    var that = this, confirming = action === 'confirmTeamPlayerJoin'
    if (this._reviewing) return
    this._reviewing = true
    this.setData({ reviewingId: playerId })
    this.applyPendingJoins()
    var payload = { action: action, includePlayerCards: false, workspaceId: (workspace.readContext() || {}).currentWorkspace && (workspace.readContext() || {}).currentWorkspace.id, teamId: this.data.teamId, playerId: playerId }
    if (!confirming) payload.reason = reason || ''
    wx.cloud.callFunction({ name: 'getMiniWorkspace', data: payload })
      .then(function(res) {
        var result = res.result || {}
        if (!result.success) throw new Error(result.message || (confirming ? '确认入队失败' : '驳回入队失败'))
        that._reviewing = false
        that.setData({ reviewingId: '', pendingJoins: that.data.pendingJoins.filter(function(item) { return String(item.id) !== String(playerId) }) })
        that.applyPendingJoins()
        wx.showToast({ title: confirming ? '已确认入队' : '已驳回申请', icon: 'success' })
        that.loadPlayers(true)
      })
      .catch(function(error) {
        that._reviewing = false
        that.setData({ reviewingId: '' })
        that.applyPendingJoins()
        wx.showToast({ title: error.message || '操作失败，请重试', icon: 'none' })
      })
  }
  ,loadVisualFixture: function() {
    var rows = [
      { id: 'p1', name: '张子墨', birthDate: '2014-03-18 出生', profileStatus: 'complete', statusText: '资料完整', isUnclaimed: false },
      { id: 'p2', name: '李浩然', birthDate: '2014-09-02 出生', profileStatus: 'pending', statusText: '待家长补充', needsParentCompletion: true, isUnclaimed: true },
      { id: 'p3', name: '陈宇', birthDate: '2014-05-21 出生', profileStatus: 'complete', statusText: '资料完整', isUnclaimed: false },
      { id: 'p4', name: '王梓轩', birthDate: '2013-12-26 出生', profileStatus: 'exception', statusText: '人证异常', isUnclaimed: false },
      { id: 'p5', name: '赵一诺', birthDate: '2014-06-11 出生', profileStatus: 'pending', statusText: '待形象照', needsParentCompletion: true, isUnclaimed: true }
    ]
    this.setData({ loading: false, teamId: 'visual-team', teamName: '赛小蜂 U12 竞技队', teamLogo: '/images/logo.png', canManage: true, allPlayers: rows, players: rows.map(function(item) { return Object.assign({}, item, { avatarText:item.name.slice(0,1),isComplete: item.profileStatus === 'complete', isPending: item.profileStatus === 'pending', isException: item.profileStatus === 'exception' }) }), completeCount: 18, pendingCount: 3, exceptionCount: 2, totalCount: 23, hasPlayers: true, hasPending: true, filterAllClass:'active',filterPendingClass:'',filterExceptionClass:'',
      reviewingId: '', pendingJoinCount: 2, hasPendingJoin: true, showPendingJoin: true,
      pendingJoins: [
        { id: 'pj1', name: '孙一鸣', jerseyNumber: '10', jerseyName: '孙一鸣', position: '中场', birthDate: '2014-07-08', photoUrl: '', registrantTypeText: '家长登记', requestedAtText: '今天 09:20' },
        { id: 'pj2', name: '周思远', jerseyNumber: '', jerseyName: '', position: '后卫', birthDate: '2013-11-15', photoUrl: '', registrantTypeText: '球员自填', requestedAtText: '昨天 18:40' }
      ] })
    this.applyPendingJoins()
  }
})
