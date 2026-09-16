var workspace = require('../../../utils/workspace')

Page({
  data: {
    loading: true, errorText: '', teamId: '', teamName: '', teamLogo: '', canManage: false,
    allPlayers: [], players: [], query: '', filter: 'all',
    completeCount: 0, pendingCount: 0, exceptionCount: 0, totalCount: 0, hasPlayers: false, hasPending: false, pendingImportCount: 0, hasPendingImport: false, visualQa: false,
    filterAllClass: 'active', filterPendingClass: '', filterExceptionClass: ''
  },
  onLoad: function(options) {
    options = options || {}
    if (workspace.isVisualQaEnabled(options)) {
      this.setData({ visualQa: true })
      this.loadVisualFixture()
      return
    }
    this.setData({ teamId: String(options.teamId || '') }); this.loadPlayers()
  },
  onShow: function() { if (this.data.teamId && !this.data.visualQa) this.loadPlayers(true) },
  loadPlayers: function(silent) {
    var that = this
    if (!silent) this.setData({ loading: true, errorText: '' })
    return wx.cloud.callFunction({ name: 'getMiniWorkspace', data: { action: 'teamPlayers', workspaceId: (workspace.readContext() || {}).currentWorkspace && (workspace.readContext() || {}).currentWorkspace.id, teamId: this.data.teamId } })
      .then(function(res) {
        var result = res.result || {}
        if (!result.success) throw new Error(result.message || '球员库加载失败')
        var completeCount = result.counts.complete || 0, pendingCount = result.counts.pending || 0, exceptionCount = result.counts.exception || 0
        that.setData({ loading: false, teamId: result.team.id, teamName: result.team.name, teamLogo: result.team.logo || '', canManage: result.canManage, allPlayers: result.players || [], completeCount: completeCount, pendingCount: pendingCount, exceptionCount: exceptionCount, totalCount: completeCount + pendingCount + exceptionCount, hasPending: Boolean(pendingCount), pendingImportCount:Number(result.pendingImportCount || 0), hasPendingImport:Boolean(result.hasPendingImport) })
        that.applyFilters()
      }).catch(function(error) { that.setData({ loading: false, errorText: error.message || '球员库加载失败' }) })
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
  onBack: function() { wx.navigateBack() },
  invitePlayer: function() { if (!this.data.canManage) return wx.showToast({ title: '当前身份没有邀请权限', icon: 'none' }); wx.navigateTo({ url: '/pages/team/player-invite/player-invite?teamId=' + encodeURIComponent(this.data.teamId) }) },
  addPlayer: function() { var that=this;if (!this.data.canManage) return wx.showToast({ title: '当前身份只可查看球员资料', icon: 'none' }); wx.showActionSheet({ itemList:['手动添加球员','邀请新球员入队'],success:function(res){if(res.tapIndex===1){that.invitePlayer();return}wx.navigateTo({ url: '/pages/team/player-add/player-add?teamId=' + encodeURIComponent(that.data.teamId) + '&teamName=' + encodeURIComponent(that.data.teamName) })} }) },
  inviteParent: function() { if (!this.data.canManage) return wx.showToast({ title: '当前身份没有邀请权限', icon: 'none' }); var target = this.data.allPlayers.filter(function(item) { return item.needsParentCompletion })[0]; if (!target) return wx.showToast({ title: '暂无需要补充资料的球员', icon: 'none' }); wx.navigateTo({ url: '/pages/team/parent-collaboration/parent-collaboration?teamId=' + encodeURIComponent(this.data.teamId) + '&playerId=' + encodeURIComponent(target.id) }) },
  openPlayer: function(e) { var id = e.currentTarget.dataset.id; if (id) wx.navigateTo({ url: '/pages/team/player-detail/player-detail?id=' + encodeURIComponent(id) + '&teamId=' + encodeURIComponent(this.data.teamId) }) }
  ,loadVisualFixture: function() {
    var rows = [
      { id: 'p1', name: '张子墨', birthDate: '2014-03-18 出生', profileStatus: 'complete', statusText: '资料完整' },
      { id: 'p2', name: '李浩然', birthDate: '2014-09-02 出生', profileStatus: 'pending', statusText: '待家长补充', needsParentCompletion: true },
      { id: 'p3', name: '陈宇', birthDate: '2014-05-21 出生', profileStatus: 'complete', statusText: '资料完整' },
      { id: 'p4', name: '王梓轩', birthDate: '2013-12-26 出生', profileStatus: 'exception', statusText: '人证异常' },
      { id: 'p5', name: '赵一诺', birthDate: '2014-06-11 出生', profileStatus: 'pending', statusText: '待形象照', needsParentCompletion: true }
    ]
    this.setData({ loading: false, teamId: 'visual-team', teamName: '赛小蜂 U12 竞技队', teamLogo: '/images/logo.png', canManage: true, allPlayers: rows, players: rows.map(function(item) { return Object.assign({}, item, { avatarText:item.name.slice(0,1),isComplete: item.profileStatus === 'complete', isPending: item.profileStatus === 'pending', isException: item.profileStatus === 'exception' }) }), completeCount: 18, pendingCount: 3, exceptionCount: 2, totalCount: 23, hasPlayers: true, hasPending: true, filterAllClass:'active',filterPendingClass:'',filterExceptionClass:'' })
  }
})
