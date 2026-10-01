var cards=require('../../utils/player-card')
Component({
 properties:{playerData:{type:Object,value:{}},tier:{type:String,value:''},backgroundUrl:{type:String,value:''},avatarUrl:{type:String,value:''},teamLogoUrl:{type:String,value:''}},
 data:{cardUrl:'',ready:false,stateText:'正在读取成卡…',renderedImagePath:''},
 observers:{'playerData':function(){this.readCard()}},
 lifetimes:{attached:function(){this.readCard()},detached:function(){clearInterval(this._timer);this._request=(this._request||0)+1}},
 pageLifetimes:{show:function(){var self=this;this.readCard();clearInterval(this._timer);this._timer=setInterval(function(){self.readCard()},60000)},hide:function(){clearInterval(this._timer)}},
 methods:{
  readCard:function(){var p=this.data.playerData||{},id=String(p._id||p.id||p.playerId||'');if(!id){this.setData({ready:false,cardUrl:'',stateText:'未关联球员'});return}if(this._busy)return;this._busy=true;var self=this,n=(this._request||0)+1;this._request=n;cards.read(id,p.teamId).then(function(card){if(n!==self._request)return;self.setData({ready:card.status==='ready',cardUrl:card.cardUrl||'',stateText:cards.stateText(card.status),renderedImagePath:card.cardUrl||''});if(card.status==='ready')self.triggerEvent('success',{path:card.cardUrl,publishedVersion:card.publishedVersion})}).catch(function(){if(n===self._request)self.setData({ready:false,cardUrl:'',stateText:'球员卡读取失败'})}).finally(function(){self._busy=false})},
  previewImage:function(){if(this.data.cardUrl)wx.previewImage({urls:[this.data.cardUrl]})},
  imageFailed:function(){this.setData({ready:false,cardUrl:'',stateText:'球员卡读取失败'})},
  renderCard:function(){return this.readCard()}
 }
})
