var workspace=require('../../../utils/workspace'),cards=require('../../../utils/player-card'),poster=require('../../../utils/roster-card-poster'),painter=require('../../../utils/roster-poster-paint')
function identity(){var user=wx.getStorageSync('userInfo')||{},context=workspace.readContext()||{};return JSON.stringify([user._id||user.id||'',(context.currentWorkspace||{}).id||''])}
function timed(request){var timer;return Promise.race([request,new Promise(function(resolve,reject){timer=setTimeout(function(){reject(Error('读取超时，请重试'))},30000)})]).finally(function(){clearTimeout(timer)})}
function request(action,data){return timed(wx.cloud.callFunction({name:'getMiniWorkspace',data:Object.assign({action:action,workspaceId:((workspace.readContext()||{}).currentWorkspace||{}).id},data)})).then(function(reply){var result=reply.result||{};if(!result.success)throw Error(result.message||'读取失败，请重试');return result})}
Page({
 data:{heroSource:'cloud://cloud1-7g8ckb3c7815a011.636c-cloud1-7g8ckb3c7815a011-1419431905/football/public-assets/roster-poster-v2/stadium-green.png',loading:true,errorText:'',teamId:'',tournamentId:'',divisionId:'',team:{},tournament:{},rosterStatusText:'',showRosterStatus:false,totalCount:0,players:[],staffMembers:[],visiblePlayers:[],visibleStaff:[],hasStaff:false,staffError:false,loadingCards:false,progressText:'',hasMissing:false,hasFailed:false,hasRetry:false,canExport:false,exportDisabled:true,busy:false,exportError:'',pageIndex:0,pageCount:1,pageText:'1 / 1',hasPages:false,hasPrevious:false,hasNext:false,canvasWidth:1200,canvasHeight:1000},
 onLoad:function(options){options=options||{};this.setData({teamId:String(options.teamId||''),tournamentId:String(options.tournamentId||''),divisionId:String(options.divisionId||'')});this.load()},
 onShow:function(){if(this._shown)this.load();this._shown=true},
 onHide:function(){this._epoch=(this._epoch||0)+1;this._pending=null;this._cardBusy=false;this._staffPending=null;this._posterPath='';this.setData({busy:false})},
 onUnload:function(){this._gone=true;this._epoch=(this._epoch||0)+1},
 current:function(epoch,scope){return !this._gone&&epoch===this._epoch&&scope===identity()},
 load:function(){
  if(this._pending)return this._pending
  var self=this,epoch=this._epoch=(this._epoch||0)+1,scope=identity(),query={teamId:this.data.teamId,tournamentId:this.data.tournamentId,divisionId:this.data.divisionId}
  this._cardBusy=false;this._staffPending=null;this._posterPath='';this._files={}
  if(!query.teamId||!query.tournamentId){this.setData({loading:false,errorText:'赛事或球队信息不完整'});return Promise.resolve()}
  this.setData({loading:true,errorText:'',players:[],staffMembers:[],visiblePlayers:[],visibleStaff:[],staffError:false,exportDisabled:true,pageIndex:0})
  this._pending=request('officialRoster',query).then(function(source){
   if(!self.current(epoch,scope))return
   var rows=poster.members(source);if(!rows.length)throw Error('尚无本届参赛名单')
   var state=String((source.snapshot||{}).status||'draft'),status=({approved:'正式名单',confirmed:'正式名单',locked:'正式名单',submitted:'待审核名单',pending:'待审核名单',pending_review:'待审核名单',under_review:'待审核名单',returned:'退回名单',rejected:'退回名单'})[state]||'名单草稿'
   self.setData({loading:false,team:source.team||{},tournament:source.tournament||{},players:rows,totalCount:rows.length,rosterStatusText:status,showRosterStatus:status!=='正式名单'})
   self.refresh();self.loadStaff();self.loadCards()
  }).catch(function(error){if(self.current(epoch,scope))self.setData({loading:false,errorText:error.message||'名单读取失败，请重试'})}).finally(function(){if(self.current(epoch,scope))self._pending=null})
  return this._pending
 },
 refresh:function(){var values=poster.summary(this.data.players,this.data.staffMembers,this.data.pageIndex);values.hasStaff=values.visibleStaff.length>0;values.hasRetry=this.data.players.some(function(row){return row.retryable});values.exportDisabled=!values.canExport||this.data.staffError||!!this._staffPending||this.data.busy;this._posterPath='';this.setData(values)},
 loadStaff:function(){
  if(this._staffPending)return this._staffPending
  var self=this,epoch=this._epoch,scope=identity();this.setData({staffError:false,exportDisabled:true})
  this._staffPending=request('teamMembers',{teamId:this.data.teamId}).then(function(result){if(self.current(epoch,scope))self.setData({staffMembers:poster.staff(result.members||[])})}).catch(function(){if(self.current(epoch,scope))self.setData({staffError:true})}).finally(function(){if(self.current(epoch,scope)){self._staffPending=null;self.refresh()}})
  return this._staffPending
 },
 loadCards:function(retry){
  if(this._cardBusy)return this._cardPromise
  var self=this,epoch=this._epoch,scope=identity(),ids=this.data.players.filter(function(row){return retry?row.retryable:row.status==='loading'}).map(function(row){return row.id}),cursor=0
  if(!ids.length)return Promise.resolve()
  this._cardBusy=true;this.setData({players:this.data.players.map(function(row){return ids.indexOf(row.id)>=0?Object.assign({},row,{status:'loading',stateText:'加载中',retryable:false}):row})});this.refresh()
  async function worker(){while(cursor<ids.length&&self.current(epoch,scope)){var batch=ids.slice(cursor,cursor+3);cursor+=3;var result;try{result=await timed(cards.batchImages(batch,self.data.teamId));if(!result.success)throw Error('卡片读取失败')}catch{result={cards:batch.map(function(id){return {playerId:id,status:'failed'}})}}if(!self.current(epoch,scope))return;var found={};(result.cards||[]).forEach(function(card){found[card.playerId]=card});var normalized=batch.map(function(id){return found[id]||{playerId:id,status:'failed'}});self.setData({players:poster.apply(self.data.players,normalized)});self.refresh()}}
  this._cardPromise=Promise.all([worker(),worker()]).finally(function(){if(self.current(epoch,scope)){self._cardBusy=false;self.refresh()}});return this._cardPromise
 },
 retryCards:function(){return this.loadCards(true)},
 cardFailed:function(event){var id=event.currentTarget.dataset.id;this.setData({players:poster.apply(this.data.players,[{playerId:id,status:'failed'}])});this.refresh()},
 staffPhotoFailed:function(event){var id=event.currentTarget.dataset.id;this.setData({staffMembers:this.data.staffMembers.map(function(row){return row.id===id?Object.assign({},row,{photoUrl:'',photoFailed:true}):row})});this.refresh()},
 photoFailed:function(event){var id=event.currentTarget.dataset.id;this.setData({players:this.data.players.map(function(row){return row.id===id?Object.assign({},row,{photoUrl:''}):row})});this.refresh()},
 previous:function(){if(this.data.hasPrevious&&!this.data.busy){this.setData({pageIndex:this.data.pageIndex-1});this.refresh()}},
 next:function(){if(this.data.hasNext&&!this.data.busy){this.setData({pageIndex:this.data.pageIndex+1});this.refresh()}},
 imagePath:function(url){
  var self=this;if(!url)return Promise.resolve('');if(typeof url!=='string')return Promise.reject(Error('图片地址无效'))
  if(this._files[url])return this._files[url]
  var source=url.indexOf('cloud://')===0?wx.cloud.getTempFileURL({fileList:[url]}).then(function(result){var row=(result.fileList||[])[0];if(!row||!row.tempFileURL)throw Error('图片地址读取失败');return row.tempFileURL}):Promise.resolve(url)
  this._files[url]=source.then(function(src){return new Promise(function(resolve,reject){wx.getImageInfo({src:src,success:function(result){var path=result.path;resolve(/^(https?:|wxfile:|\/)/.test(path)?path:'/'+path)},fail:function(){reject(Error('图片未加载，请重试'))}})})}).catch(function(error){delete self._files[url];throw error});return this._files[url]
 },
 render:function(){
  var self=this;if(this.data.exportDisabled)return Promise.reject(Error('请等待卡片加载完成'))
  var epoch=this._epoch,scope=identity(),rows=this.data.visiblePlayers.slice(),staff=this.data.visibleStaff.slice(),layout=poster.layout(rows.length,staff.length)
  this.setData({busy:true,exportDisabled:true,exportError:'',canvasWidth:layout.width,canvasHeight:layout.height})
  var result=new Promise(function(resolve,reject){wx.nextTick(function(){self.createSelectorQuery().select('#posterCanvas').fields({node:true,size:true}).exec(async function(found){
   try{
    if(!self.current(epoch,scope))throw Error('页面已变化，请重新生成')
    var canvas=found[0]&&found[0].node;if(!canvas)throw Error('画布未就绪，请重试');canvas.width=layout.width;canvas.height=layout.height
    var ctx=canvas.getContext('2d')
    async function draw(url,x,y,w,h,mode){if(!url)return;var local=await timed(self.imagePath(url));if(!self.current(epoch,scope))throw Error('页面已变化，请重新生成');var image=canvas.createImage();await new Promise(function(ok,no){var done=false,timer=setTimeout(function(){finish(Error('图片读取超时，请重试'))},12000);function finish(error){if(done)return;done=true;clearTimeout(timer);if(error)no(error);else ok()}image.onload=function(){finish()};image.onerror=function(){finish(Error('图片未加载，请重试'))};image.src=local});if(!self.current(epoch,scope))throw Error('页面已变化，请重新生成');var cover=mode==='cover'||mode==='coverTop',ratio=(cover?Math.max:Math.min)(w/image.width,h/image.height),iw=image.width*ratio,ih=image.height*ratio;if(cover){ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip()}ctx.drawImage(image,x+(w-iw)/2,mode==='coverTop'?y:y+(h-ih)/2,iw,ih);if(cover)ctx.restore()}
    await painter.paint({ctx:ctx,layout:layout,team:self.data.team,tournament:self.data.tournament,players:rows,staff:staff,total:self.data.totalCount,status:self.data.rosterStatusText,pageText:self.data.pageText,heroSource:self.data.heroSource,draw:draw})
    if(!self.current(epoch,scope))throw Error('页面已变化，请重新生成')
    wx.canvasToTempFilePath({canvas:canvas,destWidth:layout.width,destHeight:layout.height,fileType:'png',success:function(value){if(!self.current(epoch,scope))return reject(Error('页面已变化，请重新生成'));resolve(value.tempFilePath)},fail:function(){reject(Error('海报生成失败，请重试'))}},self)
   }catch(error){reject(error)}
  })})})
  return result.catch(function(error){if(self.current(epoch,scope))self.setData({exportError:error.message||'生成失败，请重试'});throw error}).finally(function(){if(self.current(epoch,scope)){self.setData({busy:false});self.refresh()}})
 },
 previewPoster:function(){var self=this,epoch=this._epoch,scope=identity();return this.render().then(function(path){if(self.current(epoch,scope))wx.previewImage({current:path,urls:[path]})}).catch(function(){})},
 savePoster:function(){var self=this,epoch=this._epoch,scope=identity();return this.render().then(function(path){if(!self.current(epoch,scope))throw Error('页面已变化，请重新生成');return new Promise(function(resolve,reject){wx.saveImageToPhotosAlbum({filePath:path,success:resolve,fail:function(){reject(Error('保存失败，请在微信设置中允许保存相册'))}})})}).then(function(){if(self.current(epoch,scope))wx.showToast({title:'海报已保存',icon:'success'})}).catch(function(error){if(self.current(epoch,scope))self.setData({exportError:error.message||'保存失败，请重试'})})}
})
