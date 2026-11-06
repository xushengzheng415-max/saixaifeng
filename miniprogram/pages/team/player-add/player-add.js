var workspace = require('../../../utils/workspace')
Page({
  data: {teamId:'',teamName:'',teamLogo:'',playerId:'',isEdit:false,pageTitle:'添加球员',name:'',birthDate:'',contactPhone:'',isSubmitting:false,canManage:false},
  onLoad: function(options) {
    options=options||{}
    this._requestId=Date.now().toString(36)+Math.random().toString(36).slice(2)
    this.setData({teamId:String(options.teamId||''),teamName:decodeURIComponent(options.teamName||''),playerId:String(options.id||options.playerId||''),isEdit:options.mode==='edit',pageTitle:options.mode==='edit'?'编辑资料':'添加球员'})
    if(workspace.isVisualQaEnabled(options)){this.setData({teamId:'visual-team',teamName:'赛小蜂足球队',canManage:true});return}
    var ctx=workspace.readContext()||{},team=(ctx.teams||[]).filter(function(item){return String(item.id)===this.data.teamId},this)[0]||{}
    this.setData({teamLogo:team.logo||'',canManage:workspace.hasPermission('team.manage',ctx)})
    if(this.data.canManage&&this.data.isEdit)this.loadPlayer()
  },
  loadPlayer: function() {
    var ctx=workspace.readContext()||{}
    wx.cloud.callFunction({name:'getMiniWorkspace',data:{action:'teamPlayerEdit',workspaceId:(ctx.currentWorkspace||{}).id,teamId:this.data.teamId,playerId:this.data.playerId}}).then(function(response){
      var result=response.result||{};if(!result.success||!result.player)throw new Error(result.message||'资料加载失败，请重试')
      this.setData({name:result.player.name||'',birthDate:result.player.birthDate||'',contactPhone:result.player.contactPhone||''})
    }.bind(this)).catch(function(error){wx.showToast({title:error.message,icon:'none'})})
  },
  inputName:function(event){this.setData({name:event.detail.value||''})},
  inputPhone:function(event){this.setData({contactPhone:event.detail.value||''})},
  changeBirth:function(event){this.setData({birthDate:event.detail.value||''})},
  save:function(){
    if(!this.data.canManage||this.data.isSubmitting)return
    if(!this.data.name.trim()&&!this.data.contactPhone.trim())return wx.showToast({title:'姓名或手机号至少填一项',icon:'none'})
    var ctx=workspace.readContext()||{}
    this.setData({isSubmitting:true})
    wx.cloud.callFunction({name:'getMiniWorkspace',data:{action:'saveTeamPlayer',manualPlaceholderFlow:true,requestId:this._requestId,workspaceId:(ctx.currentWorkspace||{}).id,teamId:this.data.teamId,playerId:this.data.isEdit?this.data.playerId:'',name:this.data.name,birthDate:this.data.birthDate,contactPhone:this.data.contactPhone}}).then(function(response){
      var result=response.result||{};if(!result.success)throw new Error(result.message||'保存失败，请重试')
      wx.showToast({title:'已保存',icon:'success'})
      if(this.data.isEdit)wx.navigateBack()
      else wx.redirectTo({url:'/pages/team/player-detail/player-detail?teamId='+encodeURIComponent(this.data.teamId)+'&id='+encodeURIComponent(result.playerId)})
    }.bind(this)).catch(function(error){wx.showToast({title:error.message,icon:'none'})}).finally(function(){this.setData({isSubmitting:false})}.bind(this))
  },
  onBack:function(){wx.navigateBack()}
})
