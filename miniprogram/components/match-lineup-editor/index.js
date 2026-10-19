var layout=require('../../utils/lineup-layout')
function copy(values){return (values || []).slice()}
function sameSet(a,b){return a.length===b.length && a.every(function(id){return b.indexOf(id)>=0})}
Component({
  properties:{tournamentId:String,match:Object,players:Array,homeStarters:Array,awayStarters:Array,homeBench:Array,awayBench:Array,saving:Boolean,dirty:Boolean,primaryView:Boolean,readOnly:Boolean,canEdit:Boolean,canUpload:Boolean,canStart:Boolean,canRecord:Boolean,canFinish:Boolean},
  data:{unplaced:[],unplacedCount:0,lineupHeading:'阵容',editorOpen:false,hasLayout:false,side:'home',loading:false,errorText:'',cardWarning:'',teams:[],formationOptions:[],slots:[],bench:[],starterCount:0,benchCount:0,playersOnField:0,benchLabel:'替补',selectionSummary:'',canSave:false,canAddBench:true,pickerOpen:false,pickerTitle:'',pickerPlayers:[],pickerEmpty:false},
  observers:{'match,players,homeStarters,awayStarters,homeBench,awayBench':function(){this.sync()},primaryView:function(value){if(value)this.setData({editorOpen:true})},'dirty,canStart,canRecord,canFinish,readOnly':function(){this.render()}},
  lifetimes:{detached:function(){this.generation=(this.generation || 0)+1}},
  methods:{
    starters:function(row){return row.slots.filter(Boolean).concat(row.unplaced || [])},
    sync:function(){
      if(!this.properties.match || !this.properties.match.id)return
      var match=this.properties.match,fresh=this.matchId!==match.id || this.recordRevision!==match.recordRevision
      if(this.matchId!==match.id){this.matchId=match.id;this.generation=(this.generation||0)+1;this.selected={home:{slots:[],bench:[],unplaced:[]},away:{slots:[],bench:[],unplaced:[]}};this.rules=null;this.cards={};this.formations={};this.cardEpoch=0;this.benchVisible=7;this._loadPromise=null}
      this.recordRevision=match.recordRevision
      if(match.lineupRules&&match.lineupRules.playersOnField>0)this.rules=match.lineupRules
      var that=this,count=this.rules?this.rules.playersOnField:0
      ;['home','away'].forEach(function(side){
        var row=that.selected[side],ids=copy(that.properties[side==='home'?'homeStarters':'awayStarters']),saved=(match.lineups||{})[side]||{},options=layout.formationsFor(count)
        if(fresh || !sameSet(that.starters(row),ids)){
          var form=layout.formationFor(count,saved.formation);that.formations[side]=form?form.id:((options[0]||{}).id||'')
          var positions=layout.slotsFor(count,that.formations[side]),used=[]
          row.slots=positions.map(function(slot){var found=(saved.players||[]).find(function(player){var id=player.playerId||player.id||player._id;return player.role===slot.role&&ids.indexOf(id)>=0&&used.indexOf(id)<0});var id=found&&(found.playerId||found.id||found._id);if(id)used.push(id);return id||''})
          row.unplaced=ids.filter(function(id){return used.indexOf(id)<0})
        }
        row.bench=copy(that.properties[side==='home'?'homeBench':'awayBench'])
      })
      this.render();if(this.rules)this.triggerEvent('rules',this.rules);else if(!this._loadPromise)this.loadCards()
    },
    metadata:function(player,active){var card=(this.cards||{})[player.id];return Object.assign({},player,{imageRequired:active!==false&&!card,cardScene:card&&card.cardScene||null,cardUrl:card&&card.cardUrl||'',cardState:card?card.status:(active===false?'idle':'loading'),photoUrl:card&&card.portraitUrl||'',imageContext:{tournamentId:this.properties.tournamentId,matchId:this.matchId,side:player.teamSide,requestVersion:this.cardEpoch||0,templateId:card&&card.templateId,publishedVersion:card&&card.publishedVersion,cardDataVersion:card&&card.cardDataVersion,dataVersion:card&&card.dataVersion}})},
    cardResolved:function(event){var card=event.detail;if(card.matchId!==this.matchId||card.tournamentId!==this.properties.tournamentId||card.requestVersion!==(this.cardEpoch||0)||!(this.properties.players||[]).some(function(player){return player.id===card.playerId&&player.teamSide===card.side}))return;this.cards[card.playerId]=card;this.render()},
    render:function(){
      if(!this.selected)return
      var that=this,side=this.data.side,selection=this.selected[side],count=this.rules?this.rules.playersOnField:0,players=(this.properties.players||[]).filter(function(row){return row.teamSide===side}),byId={}
      players.forEach(function(row){byId[row.id]=row})
      var options=layout.formationsFor(count),formation=this.formations[side]||(options[0]||{}).id||'';this.formations[side]=formation
      var info=wx.getWindowInfo?wx.getWindowInfo():null,cardScale=info?Math.min(1,Math.max(.55,(info.windowHeight-info.windowWidth/750*560-(info.screenHeight-(info.safeArea||{}).bottom||0))/(info.windowWidth/750*840))):1
      var slots=layout.slotsFor(count,formation).map(function(slot,index){var id=selection.slots[index],player=byId[id];return Object.assign({},slot,player?that.metadata(player):{},{id:slot.id,role:slot.role,playerId:player?player.id:'',empty:!player,playerName:player?player.name:'',slotClass:player?'filled':'empty',slotStyle:slot.slotStyle+'transform:translate(-50%,-50%) scale('+cardScale.toFixed(3)+');'})})
      var bench=selection.bench.map(function(id,index){return byId[id]&&that.metadata(byId[id],index<(that.benchVisible||7))}).filter(Boolean),unplaced=(selection.unplaced||[]).map(function(id,index){return byId[id]&&that.metadata(byId[id],index<(that.benchVisible||7))}).filter(Boolean),benchLimit=this.rules?this.rules.benchLimit:null
      var complete=count>0&&['home','away'].every(function(value){var selected=that.selected[value],ids=that.starters(selected),own=(that.properties.players||[]).filter(function(player){return player.teamSide===value}).map(function(player){return player.id});return ids.length===count&&new Set(ids).size===count&&ids.concat(selected.bench).every(function(id){return own.indexOf(id)>=0})&&!selected.bench.some(function(id){return ids.indexOf(id)>=0})&&(benchLimit==null||selected.bench.length<=benchLimit)})
      var positioned=complete&&['home','away'].every(function(value){return !(that.selected[value].unplaced||[]).length})
      this.setData({lineupHeading:count?'首发 '+this.starters(selection).length+' / '+count:'阵容',unplaced:unplaced,unplacedCount:unplaced.length,showStart:!!this.properties.canStart&&complete&&!this.properties.dirty,showSave:!this.properties.readOnly&&!(this.properties.canStart&&complete&&!this.properties.dirty),hasLayout:count>0,teams:['home','away'].map(function(value){return {id:value,name:value==='home'?that.properties.match.homeName:that.properties.match.awayName,count:that.starters(that.selected[value]).length,itemClass:value===side?'active':''}}),formationOptions:options.map(function(option){return {id:option.id,label:option.label,itemClass:option.id===formation?'active':''}}),slots:slots,bench:bench,starterCount:this.starters(selection).length,benchCount:bench.length,playersOnField:count,benchLabel:'替补 '+bench.length+(benchLimit==null?'':' / '+benchLimit),canAddBench:!this.properties.readOnly&&(benchLimit==null||bench.length<benchLimit),canSave:positioned,selectionSummary:count?'主队 '+this.starters(this.selected.home).length+'/'+count+' · 客队 '+this.starters(this.selected.away).length+'/'+count:'比赛人数待确认'})
      if(this.data.pickerOpen)this.refreshPicker()
    },
    loadCards:function(){
      if(this._loadPromise)return this._loadPromise
      if(this.rules){this.cards={};this.cardEpoch=(this.cardEpoch||0)+1;this.render();return Promise.resolve()}
      var that=this,generation=this.generation;this.setData({loading:true,errorText:''})
      var request=wx.cloud.callFunction({name:'getMiniWorkspace',data:{action:'sharedEventOperation',tournamentId:this.properties.tournamentId,mode:'matches',operation:'lineupCards',id:this.matchId,side:this.data.side,rulesOnly:true}}).then(function(reply){var result=reply.result||{};if(!result.success)throw new Error(result.message||result.error||'阵容资料未加载，请重试');if(generation!==that.generation)return;that.rules=result.rules;that.sync();that.triggerEvent('rules',result.rules)}).catch(function(error){if(generation===that.generation)that.setData({errorText:error.message||'阵容资料未加载，请重试'})}).finally(function(){if(generation===that.generation){that._loadPromise=null;that.setData({loading:false})}})
      this._loadPromise=request;return request
    },
    onBenchScroll:function(event){var info=wx.getWindowInfo?wx.getWindowInfo():{windowWidth:375},visible=Math.ceil(event.detail.scrollLeft/(info.windowWidth*106/750))+5;if(visible>(this.benchVisible||7)){this.benchVisible=visible;this.render()}},
    openEditor:function(){this.setData({editorOpen:true});if(!this.rules)this.loadCards()},
    closeEditor:function(){if(this.properties.saving)return;if(this.properties.primaryView)return this.triggerEvent('back');this.setData({editorOpen:false,pickerOpen:false})},
    settings:function(){this.triggerEvent('settings')},report:function(){this.triggerEvent('report')},events:function(){this.triggerEvent('events')},start:function(){this.triggerEvent('start')},finish:function(){this.triggerEvent('finish')},
    changeSide:function(event){if(this.properties.saving)return;this.setData({side:event.currentTarget.dataset.id,pickerOpen:false});this.benchVisible=4;this.render();if(!this.rules)this.loadCards()},
    changeFormation:function(event){if(this.properties.saving||this.properties.readOnly)return;var side=this.data.side,row=this.selected[side],old=layout.slotsFor(this.rules.playersOnField,this.formations[side]),byRole={};old.forEach(function(slot,index){if(row.slots[index])byRole[slot.role]=row.slots[index]});var ids=this.starters(row);this.formations[side]=event.currentTarget.dataset.id;row.slots=layout.slotsFor(this.rules.playersOnField,this.formations[side]).map(function(slot){return byRole[slot.role]||''});row.unplaced=ids.filter(function(id){return row.slots.indexOf(id)<0});this.changed()},
    chooseSlot:function(event){if(this.properties.saving || this.properties.readOnly || !this.rules)return;this.pickerLimit=9;this.slotIndex=Number(event.currentTarget.dataset.index);this.pickerMode='starter';this.setData({pickerOpen:true,pickerTitle:'选择首发'});this.refreshPicker()},
    chooseBench:function(){if(this.properties.saving || this.properties.readOnly || !this.rules || !this.data.canAddBench)return;this.pickerLimit=9;this.pickerMode='bench';this.setData({pickerOpen:true,pickerTitle:'选择替补'});this.refreshPicker()},
    morePlayers:function(){this.pickerLimit=(this.pickerLimit || 9)+6;this.refreshPicker()},
    refreshPicker:function(){var that=this,selection=this.selected[this.data.side];var players=(this.properties.players || []).filter(function(player){return player.teamSide===that.data.side}).map(function(player){return Object.assign({},that.metadata(player),{selectionText:that.starters(selection).indexOf(player.id)>=0?'已在首发':selection.bench.indexOf(player.id)>=0?'已在替补':'未上阵'})});this.setData({pickerPlayers:players.slice(0,this.pickerLimit || 9),pickerHasMore:players.length>(this.pickerLimit || 9),pickerEmpty:players.length===0})},
    pickPlayer:function(event){
      if(this.properties.saving || this.properties.readOnly)return
      var id=event.currentTarget.dataset.id,side=this.data.side,row=this.selected[side]
      if(!(this.properties.players || []).some(function(player){return player.id===id&&player.teamSide===side}))return
      if(this.pickerMode==='starter'){
        row.unplaced=(row.unplaced||[]).filter(function(value){return value!==id});row.slots=row.slots.map(function(value){return value===id?'':value});row.bench=row.bench.filter(function(value){return value!==id});row.slots[this.slotIndex]=id
      }else{
        if(row.bench.indexOf(id)>=0){this.setData({pickerOpen:false});return}
        if(!this.data.canAddBench)return
        row.unplaced=(row.unplaced||[]).filter(function(value){return value!==id});row.slots=row.slots.map(function(value){return value===id?'':value});row.bench.push(id)
      }
      this.setData({pickerOpen:false});this.changed()
    },
    removeSlot:function(event){if(this.properties.saving || this.properties.readOnly)return;this.selected[this.data.side].slots[Number(event.currentTarget.dataset.index)]='';this.changed()},
    removeBench:function(event){if(this.properties.saving || this.properties.readOnly)return;var id=event.currentTarget.dataset.id;this.selected[this.data.side].bench=this.selected[this.data.side].bench.filter(function(value){return value!==id});this.changed()},
    changed:function(){this.render();var that=this,lineupLayout={};['home','away'].forEach(function(side){if(layout.formationFor(that.rules.playersOnField,that.formations[side]))lineupLayout[side]={formation:that.formations[side],positions:layout.slotsFor(that.rules.playersOnField,that.formations[side]).map(function(slot,index){return {playerId:that.selected[side].slots[index]||'',role:slot.role}})}});this.triggerEvent('change',{lineupLayout:lineupLayout,starters:{home:this.starters(this.selected.home),away:this.starters(this.selected.away)},bench:{home:copy(this.selected.home.bench),away:copy(this.selected.away.bench)}})},
    save:function(){if(this.data.canSave&&!this.properties.saving&&!this.properties.readOnly)this.triggerEvent('save')},
    closePicker:function(){this.setData({pickerOpen:false})},noop:function(){}
  }
})
