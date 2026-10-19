var workspace = require('../../utils/workspace')
Page({
  data:{selectedRole:'',eventClass:'',teamClass:'',continueDisabled:true,createVisible:false,createKind:'event',errorText:'',headerStyle:''},
  onLoad:function(options){
    var rect=typeof wx.getMenuButtonBoundingClientRect==='function'?wx.getMenuButtonBoundingClientRect():null
    var info=wx.getSystemInfoSync()
    this.setData({headerStyle:'padding-top:'+(rect?rect.top:(info.statusBarHeight || 24)+6)+'px;'})
    if(!workspace.hasAuthenticatedUser())return wx.redirectTo({url:'/pages/login/login'})
    if(options && options.scene==='event')this.selectRole({currentTarget:{dataset:{role:'organizer'}}})
    if(options && options.scene==='team')this.selectRole({currentTarget:{dataset:{role:'team_coach'}}})
  },
  selectRole:function(event){
    var role=event.currentTarget.dataset.role
    if(['organizer','team_coach'].indexOf(role)<0)return
    this.setData({selectedRole:role,eventClass:role==='organizer'?'selected':'',teamClass:role==='team_coach'?'selected':'',continueDisabled:false,errorText:''})
  },
  continueSetup:function(){
    if(this.data.continueDisabled || this.data.createVisible)return
    workspace.rememberPortalRole(this.data.selectedRole)
    this.setData({createVisible:true,createKind:this.data.selectedRole==='organizer'?'event':'team'})
  },
  onCreateClose:function(event){this.setData({createVisible:false});wx.switchTab({url:event.detail.createdId && event.detail.kind==='team'?'/pages/teams/index':'/pages/home/home'})},
  onCreated:function(){},
  onCreateComplete:function(){}
})
