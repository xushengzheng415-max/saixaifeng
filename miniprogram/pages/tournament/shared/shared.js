Page({
  data: { loading: true, errorText: '', name: '', dateText: '', location: '', statusText: '', permissionText: '' },
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
      that.setData({ loading:false,name:item.name,dateText:item.dateText,location:item.location,statusText:item.statusText,permissionText:item.permissionText })
    }).catch(function(error) { that.setData({ loading:false,errorText:error.message || '加载失败，请重试',name:'',permissionText:'' }) })
  },
  onBack: function() { wx.switchTab({url:'/pages/event/index'}) }
})
