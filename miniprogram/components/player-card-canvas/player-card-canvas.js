var cards=require('../../utils/player-card')
Component({
 properties:{playerData:{type:Object,value:{}},tier:{type:String,value:''},backgroundUrl:{type:String,value:''},avatarUrl:{type:String,value:''},teamLogoUrl:{type:String,value:''}},
 data:{cardScene:null,hasDynamicCard:false,cardUrl:'',ready:false,portraitUrl:'',hasPortrait:false,stateText:'正在加载…',renderedImagePath:''},
 observers:{'playerData':function(){this.readCard()}},
 lifetimes:{attached:function(){this._attached=true;this.readCard()},detached:function(){this._attached=false;clearInterval(this._timer);this._request=(this._request||0)+1}},
 pageLifetimes:{show:function(){var self=this;this.readCard();clearInterval(this._timer);this._timer=setInterval(function(){self.readCard()},60000)},hide:function(){clearInterval(this._timer)}},
 methods:{
  readCard:function(){if(!this._attached)return;var p=this.data.playerData||{},id=String(p._id||p.id||p.playerId||'');if(!id){this.setData({hasDynamicCard:false,cardScene:null,ready:false,cardUrl:'',stateText:'未关联球员'});return}if(this._busy){this._request=(this._request||0)+1;this._needsReload=true;return;}this._busy=true;var self=this,n=(this._request||0)+1;this._request=n;cards.read(id,p.teamId).then(function(card){if(n!==self._request)return;self.setData({cardScene:card.cardScene||null,hasDynamicCard:!!card.cardScene,ready:card.status==='ready'&&!card.cardScene,cardUrl:card.cardUrl||'',portraitUrl:card.status==='forbidden'?'':(card.portraitUrl||self.data.avatarUrl||p.photoUrl||''),hasPortrait:card.status!=='forbidden'&&!!(card.portraitUrl||self.data.avatarUrl||p.photoUrl),stateText:card.status==='forbidden'?'无权查看':(card.portraitUrl||self.data.avatarUrl||p.photoUrl)?(card.status==='pending'?'成卡更新中':''):'资料待补充',renderedImagePath:card.cardUrl||''});if(card.status==='ready')self.triggerEvent('success',{path:card.cardUrl,publishedVersion:card.publishedVersion})}).catch(function(){if(n===self._request)self.setData({hasDynamicCard:false,cardScene:null,ready:false,cardUrl:'',stateText:self.data.hasPortrait?'':'图片加载异常'})}).finally(function(){self._busy=false;if(self._needsReload){self._needsReload=false;self.readCard()}})},
  previewImage:function(){var url=this.data.ready?this.data.cardUrl:this.data.portraitUrl;if(url)wx.previewImage({urls:[url]})},portraitFailed:function(){this.setData({hasPortrait:false,stateText:'图片加载异常'})},
  imageFailed:function(){this.setData({ready:false,cardUrl:'',stateText:this.data.hasPortrait?'':'图片加载异常'})},
  renderCard:function(){return this.readCard()}
 }
})
