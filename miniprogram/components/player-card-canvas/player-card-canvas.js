var cards=require('../../utils/player-card')
Component({
 properties:{playerData:{type:Object,value:{}},tier:{type:String,value:''},backgroundUrl:{type:String,value:''},avatarUrl:{type:String,value:''},teamLogoUrl:{type:String,value:''}},
 data:{cardUrl:'',ready:false,portraitUrl:'',hasPortrait:false,stateText:'正在加载…',renderedImagePath:''},
 observers:{'playerData':function(){this.readCard()}},
 lifetimes:{attached:function(){this.readCard()},detached:function(){clearInterval(this._timer);this._request=(this._request||0)+1}},
 pageLifetimes:{show:function(){var self=this;this.readCard();clearInterval(this._timer);this._timer=setInterval(function(){self.readCard()},60000)},hide:function(){clearInterval(this._timer)}},
 methods:{
  readCard:function(){var p=this.data.playerData||{},id=String(p._id||p.id||p.playerId||'');if(!id){this.setData({ready:false,cardUrl:'',stateText:'未关联球员'});return}if(this._busy)return;this._busy=true;var self=this,n=(this._request||0)+1;this._request=n;cards.read(id,p.teamId).then(function(card){if(n!==self._request)return;self.setData({ready:card.status==='ready',cardUrl:card.cardUrl||'',portraitUrl:card.status==='forbidden'?'':(card.portraitUrl||self.data.avatarUrl||p.photoUrl||''),hasPortrait:card.status!=='forbidden'&&!!(card.portraitUrl||self.data.avatarUrl||p.photoUrl),stateText:card.status==='forbidden'?'无权查看':(card.portraitUrl||self.data.avatarUrl||p.photoUrl)?(card.status==='pending'?'成卡更新中':''):'资料待补充',renderedImagePath:card.cardUrl||''});if(card.status==='ready')self.triggerEvent('success',{path:card.cardUrl,publishedVersion:card.publishedVersion})}).catch(function(){if(n===self._request)self.setData({ready:false,cardUrl:'',stateText:self.data.hasPortrait?'':'图片加载异常'})}).finally(function(){self._busy=false})},
  previewImage:function(){var url=this.data.ready?this.data.cardUrl:this.data.portraitUrl;if(url)wx.previewImage({urls:[url]})},portraitFailed:function(){this.setData({hasPortrait:false,stateText:'图片加载异常'})},
  imageFailed:function(){this.setData({ready:false,cardUrl:'',stateText:this.data.hasPortrait?'':'图片加载异常'})},
  renderCard:function(){return this.readCard()}
 }
})
