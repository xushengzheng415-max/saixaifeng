var content=require('./content')
Component({
  data:Object.assign({topStyle:'',effectImageFailed:false},content.select('team')),
  lifetimes:{attached:function(){
    var top=48
    try{var rect=wx.getMenuButtonBoundingClientRect();if(rect && rect.top)top=rect.top}catch(error){}
    this.setData({topStyle:'padding-top:'+top+'px;'})
  }},
  methods:{
    selectRole:function(event){
      var id=event.currentTarget.dataset.id
      if(id!==this.data.roleId)this.setData(Object.assign({effectImageFailed:false},content.select(id)))
    },
    selectFeature:function(event){
      var that=this
      this.setData(Object.assign({effectImageFailed:false},content.select(this.data.roleId,event.currentTarget.dataset.id)),function(){
        if(typeof wx.createSelectorQuery!=='function')return
        wx.createSelectorQuery().in(that).select('.feature-detail').boundingClientRect().selectViewport().scrollOffset().exec(function(rows){
          var clearance=96
          try{var rect=wx.getMenuButtonBoundingClientRect();if(rect && rect.bottom)clearance=rect.bottom+14}catch(error){}
          if(rows && rows[0] && rows[1])wx.pageScrollTo({scrollTop:Math.max(0,rows[0].top+rows[1].scrollTop-clearance),duration:240})
        })
      })
    },
    onEffectImageError:function(){this.setData({effectImageFailed:true})},
    retryEffectImage:function(){this.setData({effectImageFailed:false})},
    login:function(){this.triggerEvent('login')},
    publicEvents:function(){this.triggerEvent('publicevents')}
  }
})
