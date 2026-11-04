var board=require('../../../../utils/tactics-free')
var workspace=require('../../../../utils/workspace')
function account(){var u=wx.getStorageSync('userInfo')||{};return String(u._id||u.id||'')+'|'+String(u.phone||u.phoneNumber||'')}
Page({
 data:{teamId:'',loading:true,errorText:'',canManage:false,interactionDisabled:true,saving:false,toolsOpen:false,plansOpen:false,plans:[],hasPlans:false,tokens:[],ballX:0,ballY:0,dirty:false,saveText:'保存阵容',name:'',boardWidth:0,boardHeight:0,tokenSize:44,ballSize:30,drawReady:false,playersOpen:false,playersLoading:false,playersError:'',playerRows:[],hasPlayers:false,playerMenuTitle:'选择本方球员'},
 onLoad:function(options){this._alive=true;this._account=account();this._tokens=[];this._ball={x:50,y:50};this._plans=[];this._version=0;this._id='';this._draggedAt=0;this.setData({teamId:String((options||{}).teamId||'')});if(!this.data.teamId)return this.setData({loading:false,errorText:'请从球队首页进入战术板'});this.load(String((options||{}).tacticId||''))},
 onShow:function(){if(this._account&&account()!==this._account){this._tokens=[];this._players=null;this._plans=[];this.setData({playerRows:[],plans:[],tokens:[],canManage:false,interactionDisabled:true,errorText:'账号已切换，请重新进入战术板'})}},
 onReady:function(){this.measure()},
 onResize:function(){this.measure()},
 onUnload:function(){this._alive=false},
 current:function(){return this._alive&&account()===this._account},
 call:function(action,extra){var c=workspace.readContext()||{};return wx.cloud.callFunction({name:'getMiniWorkspace',data:Object.assign({action:action,teamId:this.data.teamId,workspaceId:(c.currentWorkspace||{}).id},extra||{})}).then(function(r){var v=r.result||{};if(v.success!==true)throw Error(v.message||v.error||'读取失败，请重试');return v})},
 load:function(id){
  var self=this;this.setData({loading:true,errorText:''})
  return workspace.loadContext().then(function(c){if(!self.current())throw Error('账号已切换，请重新进入');if((c.teams||[]).some(function(t){return String(t.id||t._id)===self.data.teamId}))return c;var e=(c.homeEntries||[]).filter(function(t){return t.type==='team'&&String(t.id)===self.data.teamId})[0];if(!e||!e.workspaceId)throw Error('当前账号无权查看这支球队');return workspace.switchWorkspace(e.workspaceId)}).then(function(){return self.call('teamTactics')}).then(function(result){
   if(!self.current())return
   self._plans=result.tactics||[];self.setData({loading:false,canManage:result.canManage===true,interactionDisabled:result.canManage!==true,plans:self._plans,hasPlans:self._plans.length>0})
   var row=id?self._plans.filter(function(p){return p.id===id})[0]:null
   if(id&&!row)throw Error('方案不存在，请从已存方案重新选择')
   if(row)return self.applyPlan(row)
   self.newBoard();if(wx.nextTick)wx.nextTick(function(){self.measure()});else self.measure()
  }).catch(function(error){if(self.current())self.setData({loading:false,errorText:error.message||'读取失败，请重试'})})
 },
 retry:function(){this.load(this._id)},
 newBoard:function(){var value=board.seed(11);this._tokens=value.tokens;this._ball=value.ball;this._id='';this._version=0;this.setData({name:'',dirty:false,saveText:'保存阵容',plansOpen:false,toolsOpen:false});this.paint();this.measure()},
 applyPlan:function(row){
  var self=this
  if(row.boardMode==='free'){var value=board.normalize(row);this._tokens=value.tokens;this._ball=value.ball;this.finishPlan(row);return Promise.resolve()}
  // Existing bound-player schemes remain readable; opening them does not rewrite them.
  return this.call('teamPlayers',{includePlayerCards:false}).then(function(result){if(!self.current())return;var players={};(result.players||[]).forEach(function(p){players[String(p.id||p._id)]=p});var used={},tokens=[];(row.positions||[]).forEach(function(p,i){var player=players[p.playerId]||{},n=String(player.jerseyNumber||player.jerseyNo||player.number||i+1);if(!/^[1-9]\d?$/.test(n)||used[n]){n=String(i+1);while(used[n])n=String(Number(n)+1)}used[n]=true;tokens.push({id:'ours-'+(i+1),side:'ours',number:n,x:p.x==null?20:p.x,y:p.y==null?50:p.y})});(row.opponentPositions||[]).forEach(function(p,i){tokens.push({id:'rival-'+(i+1),side:'rival',number:String(p.number),x:p.x==null?80:p.x,y:p.y==null?50:p.y})});var value=board.normalize({tokens:tokens,ball:{x:50,y:50}});self._tokens=value.tokens;self._ball=value.ball;self.finishPlan(row)})
 },
 finishPlan:function(row){this._id=row.id;this._version=Number(row.version||1);this.setData({name:row.name||'',dirty:false,saveText:'保存阵容',plansOpen:false,toolsOpen:false});this.paint();this.measure()},
 measure:function(){var self=this;if(!this.createSelectorQuery)return;this.createSelectorQuery().select('#freeArea').boundingClientRect(function(r){if(!self._alive||!r||!r.width||!r.height)return;self._rect=r;self.setData({boardWidth:r.width,boardHeight:r.height,drawReady:true});self.paint()}).exec()},
 paint:function(){var w=this.data.boardWidth,h=this.data.boardHeight;if(!w||!h)return;this.setData({tokens:this._tokens.map(function(t){return Object.assign({},t,{pixelX:Math.max(0,Math.min(w-44,t.x*w/100-22)),pixelY:Math.max(0,Math.min(h-44,t.y*h/100-22)),tokenClass:'token '+t.side,hasPlayerName:Boolean(t.playerName)})}),ballX:Math.max(0,Math.min(w-30,this._ball.x*w/100-15)),ballY:Math.max(0,Math.min(h-30,this._ball.y*h/100-15))})},
 markDirty:function(){if(!this.data.dirty)this.setData({dirty:true,saveText:'保存阵容*'})},
 onMove:function(event){if(this.data.interactionDisabled||event.detail.source!=='touch')return;var id=event.currentTarget.dataset.id,size=id==='ball'?30:44,w=this.data.boardWidth,h=this.data.boardHeight;if(!w||!h)return;var p=board.point({x:(event.detail.x+size/2)/w*100,y:(event.detail.y+size/2)/h*100});if(id==='ball')this._ball=p;else{var t=this._tokens.filter(function(t){return t.id===id})[0];if(!t)return;t.x=p.x;t.y=p.y}this._lastTap=null;this._draggedAt=Date.now();this.markDirty()},
 onMoveEnd:function(){if(!this.data.interactionDisabled)this.paint()},
 editNumber:function(event){if(this.data.interactionDisabled||Date.now()-this._draggedAt<250)return;var self=this,id=event.currentTarget.dataset.id,t=this._tokens.filter(function(t){return t.id===id})[0];if(!t)return;if(t.side==='ours'){var previous=this._lastTap;this._lastTap={id:id,at:Date.now()};if(previous&&previous.id===id&&Date.now()-previous.at<350){this._lastTap=null;this.openPlayers(id)}return}wx.showModal({title:'对方号码',editable:true,content:t.number,placeholderText:'1–99',success:function(r){if(!r.confirm||!self.current())return;try{var n=board.number(r.content);if(self._tokens.some(function(p){return p.id!==id&&p.side===t.side&&p.number===n}))throw Error('同一方号码不能重复');t.number=n;self.markDirty();self.paint()}catch(e){wx.showToast({title:e.message,icon:'none'})}}})},
 openPlayers:function(id){
  if(this.data.interactionDisabled)return
  this._selectedToken=id;this.setData({playersOpen:true,playersError:'',plansOpen:false,toolsOpen:false,playerMenuTitle:'选择本方球员'})
  if(this._players){this.paintPlayers();return Promise.resolve()}
  if(this._playersPromise)return this._playersPromise
  var self=this;this.setData({playersLoading:true})
  this._playersPromise=this.call('teamPlayers',{includePlayerCards:false}).then(function(result){if(!self.current())return;self._players=(result.players||[]).map(function(p){return {id:String(p.id||p._id||''),name:String(p.name||p.playerName||'未命名球员'),number:String(p.jerseyNumber||p.jerseyNo||p.number||p.shirtNumber||'')}}).filter(function(p){return p.id});self.paintPlayers()}).catch(function(error){if(self.current())self.setData({playersError:error.message||'球员读取失败，请重试'})}).finally(function(){self._playersPromise=null;if(self.current())self.setData({playersLoading:false})});return this._playersPromise
 },
 paintPlayers:function(){var self=this;var rows=(this._players||[]).map(function(p){var occupied=self._tokens.some(function(t){return t.playerId===p.id});return Object.assign({},p,{label:(p.number?p.number+'号 · ':'')+p.name,assignedText:occupied?'已在场上':''})});this.setData({playerRows:rows,hasPlayers:rows.length>0})},
 retryPlayers:function(){this.openPlayers(this._selectedToken)},
 closePlayers:function(){this.setData({playersOpen:false})},
 choosePlayer:function(e){
  if(this.data.interactionDisabled)return
  var p=(this._players||[]).filter(function(p){return p.id===e.currentTarget.dataset.id})[0],t=this._tokens.filter(function(t){return t.id===this._selectedToken},this)[0];if(!p||!t)return
  var occupied=this._tokens.filter(function(v){return v.id!==t.id&&v.side==='ours'&&v.playerId===p.id})[0]
  var n=/^[1-9]\d?$/.test(p.number)?p.number:(occupied?occupied.number:t.number)
  var clash=this._tokens.filter(function(v){return v.id!==t.id&&v.side==='ours'&&v.number===n})[0]
  if(clash&&clash.playerId&&clash.playerId!==p.id)return wx.showToast({title:'两名球员球衣号重复，请核对',icon:'none'})
  if(occupied&&occupied!==clash){delete occupied.playerId;delete occupied.playerName}
  var swap=clash||occupied
  if(swap){swap.number=t.number;if(t.playerId){swap.playerId=t.playerId;swap.playerName=t.playerName}else{delete swap.playerId;delete swap.playerName}}
  t.number=n;t.playerId=p.id;t.playerName=p.name;this.markDirty();this.paint();this.setData({playersOpen:false})
 },
 unlinkPlayer:function(){var t=this._tokens.filter(function(t){return t.id===this._selectedToken},this)[0];if(t){delete t.playerId;delete t.playerName;this.markDirty();this.paint()}this.setData({playersOpen:false})},
 toggleTools:function(){this.setData({toolsOpen:!this.data.toolsOpen,plansOpen:false})},
 guardDiscard:function(action){if(this.data.saving)return;if(!this.data.dirty)return action();wx.showModal({title:'放弃未保存修改？',confirmText:'放弃修改',success:function(r){if(r.confirm)action()}})},
 chooseCount:function(){if(!this.data.canManage)return;var self=this;wx.showActionSheet({itemList:['5人','7人','8人','9人','11人'],success:function(r){var count=[5,7,8,9,11][r.tapIndex];if(!count)return;self.guardDiscard(function(){var value=board.seed(count);self._tokens=value.tokens;self._ball=value.ball;self.setData({toolsOpen:false});self.markDirty();self.paint()})}})},
 flip:function(){if(!this.data.canManage)return;var value=board.flip({tokens:this._tokens,ball:this._ball});this._tokens=value.tokens;this._ball=value.ball;this.markDirty();this.paint();this.setData({toolsOpen:false})},
 clear:function(){if(!this.data.canManage)return;var self=this;wx.showModal({title:'清空双方号码？',success:function(r){if(r.confirm){self._tokens=[];self.markDirty();self.paint();self.setData({toolsOpen:false})}}})},
 add:function(){if(!this.data.canManage)return;var self=this;wx.showActionSheet({itemList:['添加我方号码','添加对方号码'],success:function(r){var side=r.tapIndex===0?'ours':'rival',same=self._tokens.filter(function(t){return t.side===side});if(same.length>=22)return wx.showToast({title:'每方最多22个号码',icon:'none'});var n=1;while(same.some(function(t){return t.number===String(n)}))n++;self._tokens.push({id:side+'-'+Date.now()+'-'+n,side:side,number:String(n),x:side==='ours'?35:65,y:50});self.markDirty();self.paint();self.setData({toolsOpen:false})}})},
 showPlans:function(){this.setData({plansOpen:true,toolsOpen:false})},
 deletePlan:function(e){var self=this,id=e.currentTarget.dataset.id,row=this._plans.filter(function(p){return p.id===id})[0];if(!row||!this.data.canManage||this.data.saving)return;wx.showModal({title:'删除这套战术？',success:function(r){if(!r.confirm||!self.current())return;self.call('deleteTeamTactic',{tacticId:id,version:row.version}).then(function(){if(!self.current())return;self._plans=self._plans.filter(function(p){return p.id!==id});self.setData({plans:self._plans,hasPlans:self._plans.length>0});if(self._id===id)self.newBoard()}).catch(function(error){wx.showToast({title:error.message,icon:'none'})})}})},
 closePlans:function(){this.setData({plansOpen:false})},
 choosePlan:function(e){var self=this,id=e.currentTarget.dataset.id,row=this._plans.filter(function(p){return p.id===id})[0];if(row)this.guardDiscard(function(){Promise.resolve(self.applyPlan(row)).catch(function(error){wx.showToast({title:error.message,icon:'none'})})})},
 createBoard:function(){var self=this;if(!this.data.canManage)return;this.guardDiscard(function(){self.newBoard()})},
 save:function(){
  if(!this.data.canManage||this.data.saving)return
  var self=this,value;try{value=board.normalize({tokens:this._tokens,ball:this._ball})}catch(e){return wx.showToast({title:e.message,icon:'none'})}
  wx.showModal({title:'保存阵容',editable:true,content:this.data.name||'自由阵容',placeholderText:'战术名称',success:function(r){if(!r.confirm||!self.current()||self.data.saving)return;var name=String(r.content||'').trim().slice(0,24);if(!name)return wx.showToast({title:'请填写战术名称',icon:'none'});self.setData({saving:true,interactionDisabled:true});self.call('saveTeamTactic',Object.assign({},value,{name:name,tacticId:self._id,version:self._version})).then(function(result){if(!self.current())return;var row=result.tactic;self._plans=self._plans.filter(function(p){return p.id!==row.id});self._plans.unshift(row);self.setData({plans:self._plans,hasPlans:true});self.finishPlan(row);wx.showToast({title:'已保存',icon:'success'})}).catch(function(error){if(self.current())wx.showToast({title:error.message||'保存失败，请重试',icon:'none'})}).finally(function(){if(self.current())self.setData({saving:false,interactionDisabled:!self.data.canManage})})}})
 },
 back:function(){this.guardDiscard(function(){wx.navigateBack({fail:function(){wx.switchTab({url:'/pages/teams/index'})}})})}
})
