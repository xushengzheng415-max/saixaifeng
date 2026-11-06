var workspace=require('../../../utils/workspace')
var ui=require('../../../utils/tournament-boards')
Page({
  data:{tournamentId:'',divisionId:'',shared:false,loading:true,errorText:'',tournament:{},activeTab:'standings',tabs:[],divisionTabs:[],visibleRows:[],hasVisibleRows:false,showStandingsHead:true,showAverageHead:false,emptyText:'暂无已归档赛果'},
  onLoad:function(options){
    options=options || {}
    this.setData({tournamentId:String(options.id || ''),divisionId:String(options.divisionId || ''),shared:options.shared==='1',activeTab:ui.metricLabels[options.tab]?options.tab:'standings'})
    if(this.data.tournamentId)this.loadData();else this.setData({loading:false,errorText:'缺少赛事信息，请返回重试'})
  },
  onShow:function(){if(this.data.tournamentId && this._loaded)this.loadData(true)},
  onUnload:function(){this._revision=(this._revision || 0)+1},
  onPullDownRefresh:function(){return this.loadData(true).finally(function(){wx.stopPullDownRefresh()})},
  loadData:function(silent){
    var self=this,revision=(this._revision || 0)+1;this._revision=revision
    var context=workspace.readContext() || {},workspaceId=(context.currentWorkspace || {}).id || ''
    if(silent!==true)this.setData({loading:true,errorText:''})
    return wx.cloud.callFunction({name:'getMiniWorkspace',data:{action:this.data.shared?'sharedTournamentData':'tournamentData',workspaceId:workspaceId,tournamentId:this.data.tournamentId}}).then(function(reply){
      if(revision!==self._revision || ((workspace.readContext() || {}).currentWorkspace || {}).id!==((context.currentWorkspace || {}).id))return
      var result=reply.result || {}
      if(!result.success)throw Error(result.message || '赛事数据读取失败，请重试')
      if(!result.boards || result.boards.version!=='tournament-boards/1')throw Error('赛事数据接口待更新，请稍后重试')
      self._boards=result.boards;self._loaded=true
      if(!ui.scopeOf(self._boards,self.data.divisionId))self.setData({divisionId:''})
      self.setData({loading:false,errorText:'',tournament:result.tournament || {}});self.applyTab()
    }).catch(function(error){if(revision===self._revision)self.setData({loading:false,errorText:error.message || '赛事数据读取失败，请重试',visibleRows:[],hasVisibleRows:false})})
  },
  applyTab:function(){
    var metric=this.data.activeTab,divisionId=this.data.divisionId,scope=ui.scopeOf(this._boards || {},divisionId)
    var rows=ui.rowsOf(scope,metric)
    this.setData({tabs:Object.keys(ui.metricLabels).map(function(id){return {id:id,label:ui.metricLabels[id],className:id===metric?'data-tab data-tab-active':'data-tab'}}),
      divisionTabs:((this._boards || {}).scopes || []).map(function(row){return {id:row.divisionId,name:row.divisionName,className:row.divisionId===divisionId?'data-tab data-tab-active':'data-tab'}}),
      visibleRows:rows,hasVisibleRows:rows.length>0,showStandingsHead:metric==='standings',showAverageHead:metric==='attack' || metric==='defense',emptyText:'当前范围暂无已核定记录'})
  },
  selectTab:function(event){var id=event.currentTarget.dataset.id;if(!ui.metricLabels[id])return;this.setData({activeTab:id});this.applyTab()},
  selectDivision:function(event){this.setData({divisionId:event.currentTarget.dataset.id || ''});this.applyTab()},
  openScorebook:function(){wx.navigateTo({url:'/pages/tournament/scorebook/scorebook?id='+encodeURIComponent(this.data.tournamentId)+'&shared='+(this.data.shared?'1':'0')})},
  back:function(){workspace.navigateBackOrHome()}
})
