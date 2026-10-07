Page({
  data: { loading: true, errorText: '', name: '', dateText: '', location: '', statusText: '', modules: [], hasModules: false },
  onLoad: function(options) { this.tournamentId = options.id || '' },
  onShow: function() { this.loadSharedEvent() },
  onPullDownRefresh: function() { this.loadSharedEvent().finally(function() { wx.stopPullDownRefresh() }) },
  loadSharedEvent: function() {
    var that = this
    this.setData({ loading: true, errorText: '', name: '', permissionText: '' })
    return wx.cloud.callFunction({ name: 'getMiniWorkspace', data: { action: 'sharedTournamentDetail', tournamentId: this.tournamentId } }).then(function(reply) {
      var result = reply.result || {}
      if (!result.success) throw new Error(result.message || '共享授权已失效，请返回赛事列表')
      var item = result.tournament || {}
      var modules=[{id:'registration',title:'报名管理',right:'event.registration'},{id:'teams',title:'球队管理',right:'event.teams'},{id:'matches',title:'比赛管理',right:'event.matches'},{id:'results',title:'赛果管理',right:'event.results'},{id:'referees',title:'裁判管理',right:'event.referees'}].filter(function(module) {return (item.permissions || []).indexOf(module.right)>=0})
      that.setData({ loading:false,name:item.name,dateText:item.dateText,location:item.location,statusText:item.statusText,modules:modules,hasModules:modules.length>0 })
    }).catch(function(error) { that.setData({ loading:false,errorText:error.message || '加载失败，请重试',name:'',permissionText:'' }) })
  },
  onModule: function(event) { wx.navigateTo({url:'/pages/tournament/shared/manage?id='+encodeURIComponent(this.tournamentId)+'&mode='+event.currentTarget.dataset.id}) },
  onBack: function() { wx.switchTab({url:'/pages/event/index'}) }
})
