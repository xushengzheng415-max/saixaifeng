var sharedUi=require('../../../utils/sharedEventUi')
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
      var modules=sharedUi.modules(item.permissions)
      that.setData({ loading:false,name:item.name,dateText:item.dateText,location:item.location,statusText:item.statusText,modules:modules,hasModules:modules.length>0 })
    }).catch(function(error) { that.setData({ loading:false,errorText:sharedUi.message(error),name:'',modules:[],hasModules:false }) })
  },
  onModule: function(event) { wx.navigateTo({url:'/pages/tournament/shared/manage?id='+encodeURIComponent(this.tournamentId)+'&mode='+event.currentTarget.dataset.id}) },
  onBack: function() { wx.switchTab({url:'/pages/event/index'}) }
})
