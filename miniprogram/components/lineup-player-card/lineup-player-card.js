var fallback=require('../../utils/lineup-card-image')
Component({
 properties:{cardScene:{type:Object,value:null},imageContext:{type:Object,value:null},imageRequired:{type:Boolean,value:false},playerId:String,allowPreview:{type:Boolean,value:false},size:{type:String,value:'pitch'},cardUrl:{type:String,value:''},cardState:{type:String,value:'unavailable'},cardTier:{type:String,value:''},cardRole:{type:String,value:'player'},photoUrl:{type:String,value:''},number:{type:String,value:''},name:{type:String,value:''},position:{type:String,value:''},jerseyName:{type:String,value:''},height:{type:null,value:null},weight:{type:null,value:null},nationality:{type:String,value:''},teamLogo:{type:String,value:''}},
 data:{hasDynamicCard:false,ready:false,stateText:'',hasPortrait:false,loadingFallback:false,canRetry:false,resolvedCardUrl:''},
 observers:{'cardScene,cardUrl,cardState,cardRole,photoUrl,imageContext,playerId,imageRequired':function(scene,url,state,role,photo,context,id,imageRequired){
  var key=JSON.stringify([scene,url,state,role,photo,context,id,imageRequired]);if(key===this._key)return;this._key=key;this._epoch=(this._epoch||0)+1;this._loading=false
  this.setData({hasDynamicCard:!!scene&&!imageRequired&&role!=='coach'&&state!=='forbidden',ready:!!url&&state==='ready'&&role!=='coach',resolvedCardUrl:url||'',loadingFallback:false,canRetry:state==='failed'||state==='pending',hasPortrait:!!photo&&state!=='forbidden',stateText:role==='coach'?'主教练':state==='forbidden'?'无权查看':state==='failed'?'卡片未加载':state==='loading'?'卡片加载中':state==='idle'?'':state==='unavailable'?'暂无球员卡':photo?(state==='pending'?'成卡更新中':''):'资料待补充'})
  if(imageRequired&&!url&&(state==='ready'||state==='loading'))this.dynamicFailed()
 }},
 lifetimes:{detached:function(){this._epoch=(this._epoch||0)+1}},
 methods:{
  dynamicFailed:function(){
   var context=this.data.imageContext,id=this.data.playerId,self=this,n=this._epoch
   if(!context||!context.matchId||!id||this.data.cardState==='forbidden'||this._loading)return
   this._loading=true;this.setData({hasDynamicCard:false,loadingFallback:true,stateText:'卡片加载中',canRetry:false})
   fallback.read(context,id).then(function(card){if(n!==self._epoch)return;var ready=card.status==='ready'&&!!card.cardUrl;self.setData({ready:ready,resolvedCardUrl:ready?card.cardUrl:'',loadingFallback:false,stateText:ready?'':card.status==='forbidden'?'无权查看':card.status==='unavailable'?'暂无球员卡':'卡片未加载',canRetry:!ready&&['forbidden','unavailable'].indexOf(card.status)<0});self.triggerEvent('resolved',card)}).catch(function(){if(n!==self._epoch)return;self.setData({ready:false,loadingFallback:false,stateText:'卡片未加载',canRetry:true})}).finally(function(){if(n===self._epoch)self._loading=false})
  },
  retryCard:function(){this.dynamicFailed()},
  imageFailed:function(){this.setData({ready:false,stateText:'图片未加载',canRetry:!!this.data.imageContext})},
  portraitFailed:function(){this.setData({hasPortrait:false,stateText:'图片未加载'})}
 }
})
