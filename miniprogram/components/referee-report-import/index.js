var draft=require('../../utils/refereeReportDraft')
var reportMedia=require('../../utils/refereeReportMedia')
var reportSlices=require('../../utils/refereeReportSlices')
Component({
  properties:{hiddenEntry:Boolean,playersOnField:Number,tournamentId:String,match:Object,players:Array,canLineup:Boolean,canResult:Boolean},
  data:{saveRetry:false,sliceOpen:false,sliceLoading:false,sliceImage:'',sliceError:'',sliceRow:null,sliceScrollLeft:0,hasLocalPhoto:false,imageHint:'',reviewOnly:true,showEvidence:false,reviewSummary:'',showRules:false,rulesDirty:false,circledGoals:true,blankRoleAsBench:true,open:false,busy:false,hasDraft:false,lineupOnly:false,stage:'',errorText:'',photo:'',side:'home',tabs:[],rows:[],groups:[],warnings:[],annotations:[],hasAnnotations:false,notesReviewed:false,roles:draft.ROLES,scoreHome:'',scoreAway:'',confirmText:'确认赛果'},
  lifetimes:{detached:function(){this.generation=(this.generation || 0)+1;this._sliceRequest=(this._sliceRequest || 0)+1;this.sliceCache={}}},
  observers:{'match.id':function(){if(this.data.sliceOpen)this.closeSlice()}},
  methods:{
    api:function(params){return wx.cloud.callFunction({name:'getMiniWorkspace',data:Object.assign({},params,{action:'sharedEventOperation',tournamentId:this.properties.tournamentId,mode:'matches',id:this.properties.match.id})}).then(function(reply){var result=reply.result || {};if(!result.success)throw new Error(result.message || result.error || '识别未完成，请重试');return result})},
    resetSlices:function(){this._sliceRequest=(this._sliceRequest || 0)+1;this.sliceKey='';this.sliceCache={};this.imageQuality=null;this.setData({saveRetry:false,sliceOpen:false,sliceLoading:false,sliceImage:'',sliceError:'',sliceRow:null})},
    closeSlice:function(){this._sliceRequest=(this._sliceRequest || 0)+1;this.sliceKey='';this.setData({sliceOpen:false,sliceLoading:false,sliceError:'',sliceRow:null})},
    noop:function(){},
    viewSlice:function(event){
      if(this.data.busy)return
      var row=this.teams[this.data.side][Number(event.currentTarget.dataset.index)];if(!row)return
      this.sliceKey=row.key;var request=(this._sliceRequest || 0)+1;this._sliceRequest=request
      var that=this,generation=this.generation,matchId=this.properties.match.id,path=this.localFile&&this.localFile.tempFilePath
      function current(){return request===that._sliceRequest&&generation===that.generation&&matchId===that.properties.match.id&&that.data.sliceOpen&&(that.properties.canLineup||that.properties.canResult)}
      this.setData({sliceOpen:true,sliceLoading:true,sliceImage:'',sliceError:'',errorText:'',sliceScrollLeft:0});this.refresh()
      var quality=this.imageQuality,key=reportSlices.key(row,quality,path),cached=this.sliceCache&&this.sliceCache[key]
      function display(result){if(!current())return;that.sliceCache=that.sliceCache || {};that.sliceCache[key]=result;that.setData({sliceLoading:false,sliceImage:result.path,sliceImageRatio:result.width/result.height})}
      if(cached){display(cached);return}
      this._sliceWork=(this._sliceWork || Promise.resolve()).catch(function(){}).then(function(){
        if(!current())return
        if(!path)throw new Error('原图已失效，请重新选择')
        return reportSlices.render(that,path,row,quality,wx,current).then(display)
      }).catch(function(error){if(current())that.setData({sliceLoading:false,sliceError:error.message==='SLICE_STALE'?'切片已失效，请重试':error.message || '切片未加载，请重试'})})
    },
    retrySlice:function(){var row=(this.displayRows || []).find(function(item){return item.key===this.sliceKey},this);if(row)this.viewSlice({currentTarget:{dataset:{index:row.index}}})},
    previewSlice:function(){if(this.data.sliceImage)wx.previewImage({urls:[this.data.sliceImage]})},
    sliceImageError:function(){this.setData({sliceImage:'',sliceError:'切片未读取，请重试'});if(this.sliceCache)this.sliceCache={}},
    confirmSlice:function(){if(this.data.busy || !this.data.sliceRow)return;var index=this.data.sliceRow.index;this.confirmRow({currentTarget:{dataset:{index:index}}});var row=this.teams[this.data.side][index];if(row&&!draft.needsReview(row))this.closeSlice()},
    state:function(patch){this.setData(patch);this.triggerEvent('statechange',{open:this.data.open,busy:this.data.busy})},
    uploadReport:function(){this.choose(false)},
    toggleRules:function(){this.setData({showRules:!this.data.showRules})},
    onConvention:function(event){this.setData({blankRoleAsBench:event.detail.value,rulesDirty:true})},
    onCircleConvention:function(event){this.setData({circledGoals:event.detail.value,rulesDirty:true})},
    choose:function(lineupOnly){
      var that=this;if(this._choosing || this.data.busy || lineupOnly&&!this.properties.canLineup || !lineupOnly&&!this.properties.canResult)return
      this._choosing=true
      wx.chooseMedia({count:1,mediaType:['image'],sizeType:['original'],sourceType:['album','camera'],success:function(result){
        var file=(result.tempFiles || [])[0];if(!file)return
        var generation=(that.generation || 0)+1;that.generation=generation;that.resetSlices();that.localFile=null;that.draftId='';that.fileId='';that.teams={home:[],away:[]}
        that.state({open:true,busy:true,hasDraft:false,hasLocalPhoto:false,lineupOnly:lineupOnly,confirmText:lineupOnly?'保存阵容':'保存赛果',photo:file.tempFilePath,errorText:'',imageHint:'',stage:'正在读取原图',annotations:[],hasAnnotations:false,notesReviewed:false})
        reportMedia.prepare(file,wx).then(function(prepared){
          if(generation!==that.generation)return
          that.localFile=prepared
          that.state({busy:false,hasLocalPhoto:true,imageHint:prepared.lowResolution?'图片偏小，建议选择原图':''})
          that.recognize()
        }).catch(function(error){if(generation===that.generation)that.state({busy:false,errorText:error.message || '图片未读取，请重新选择',stage:''})})
      },complete:function(){that._choosing=false}})
    },
    recognize:function(){
      if(this.data.busy || !this.localFile)return
      this.resetSlices()
      var that=this,generation=this.generation,matchId=this.properties.match.id;this.state({busy:true,errorText:'',stage:'正在上传照片'})
      var ticket=this.draftId?Promise.resolve({id:this.draftId,path:this.uploadPath}):this.api({operation:'reportTicket'})
      ticket.then(function(result){that.draftId=result.id;that.uploadPath=result.path;if(that.fileId)return {fileID:that.fileId};return new Promise(function(resolve,reject){var task=wx.cloud.uploadFile({cloudPath:result.path,filePath:that.localFile.tempFilePath,success:resolve,fail:reject});if(task && task.onProgressUpdate)task.onProgressUpdate(function(progress){if(generation===that.generation)that.setData({stage:'上传照片 '+progress.progress+'%'})})})}).then(function(upload){if(generation!==that.generation || matchId!==that.properties.match.id)throw new Error('比赛已切换，请重新打开识别');that.fileId=upload.fileID;that.setData({stage:'正在识别阵容和手写事件'});return that.api({operation:'recognizeReport',draftId:that.draftId,fileId:that.fileId,blankRoleAsBench:that.data.blankRoleAsBench,circledGoals:that.data.circledGoals})}).then(function(result){if(generation!==that.generation || matchId!==that.properties.match.id)return;var data=result.data || {};that.imageQuality=data.imageQuality || null;that.teams=draft.prepare(data,that.properties.players);that.ocrWarnings=data.warnings || [];that.setData({hasDraft:true,reviewOnly:true,showEvidence:false,rulesDirty:false,scoreHome:data.score && data.score.home!=null?String(data.score.home):'',scoreAway:data.score && data.score.away!=null?String(data.score.away):'',warnings:data.warnings || [],annotations:(data.annotations || []).map(function(row,index){return {key:index,text:typeof row==='string'?row:row.text}}),hasAnnotations:(data.annotations || []).length>0});that.refresh()}).catch(function(error){if(generation===that.generation)that.setData({errorText:error.message || error.errMsg || '识别未完成，请重试'})}).finally(function(){if(generation===that.generation)that.state({busy:false,stage:''})})
    },
    refresh:function(){
      var that=this,side=this.data.side,players=(this.properties.players || []).filter(function(row){return row.teamSide===side}),choices=[{id:'',label:'选择本队球员'}].concat(players.map(function(row){return {id:row.id,label:(row.jerseyNumber || '—')+'号 '+row.name,name:row.name,number:row.jerseyNumber}}))
      this.playerChoices=choices
      var all=[].concat(this.teams.home || [],this.teams.away || []),pending=all.filter(draft.needsReview).length
      var starters=(this.teams[side] || []).filter(function(row){return row.role==='starter'}).length,overflow=this.properties.playersOnField>0&&starters>this.properties.playersOnField
      var rows=(this.teams[side] || []).map(function(row,index){var playerIndex=choices.findIndex(function(player){return player.id===row.playerId}),roleIndex=draft.ROLES.findIndex(function(role){return role.id===row.role}),reviewed=row.reviewConfirmedFingerprint===draft.fingerprint(row),needsReview=draft.needsReview(row);return Object.assign({},row,{index:index,expanded:needsReview||!!row._editing,choices:choices,playerIndex:playerIndex<0?0:playerIndex,playerLabel:choices[playerIndex<0?0:playerIndex].label,roleIndex:roleIndex<0?0:roleIndex,roleLabel:draft.ROLES[roleIndex<0?0:roleIndex].name,needsReview:needsReview,reviewed:reviewed,lineupReviewed:row.lineupConfirmedFingerprint===draft.lineupFingerprint(row),notes:(row.reviewNotes || []).join('；'),showNotes:needsReview,showAdvanced:!!row._advanced,goalLabel:row.goals?'进球 '+row.goals.replace(/,/g,'′、')+'′':'',fields:draft.FIELDS.filter(function(field){return field==='goals'||row._advanced||row[field]}).map(function(field){return {key:field,label:({on:'换上',off:'换下',goals:'进球',yellow:'黄牌',red:'红牌'})[field],value:row[field] || ''}})})})
      this.displayRows=rows
      var sliceRow=rows.find(function(row){return row.key===that.sliceKey}) || null
      var warnings=(this.ocrWarnings || []).filter(function(message){if(/姓名/.test(message)){var source=/主队/.test(message)?that.teams.home:that.teams.away;return (source || []).some(function(row){return !row.playerId})}if(/部分记录不清楚/.test(message))return pending>0;return true})
      this.setData({sliceRow:sliceRow,warnings:warnings,countWarning:overflow?'本队识别到 '+starters+' 名首发，限 '+this.properties.playersOnField+' 人':'',reviewSummary:'已识别 '+(all.length-pending)+' 人'+(pending?' · 待核对 '+pending+' 人':''),filterLabel:this.data.reviewOnly?'全部名单':'只看待核对',tabs:['home','away'].map(function(value){var count=(that.teams[value] || []).filter(draft.needsReview).length;return {id:value,name:value==='home'?that.properties.match.homeName:that.properties.match.awayName,pendingLabel:count?'待核对 '+count:'',itemClass:value===side?'active':''}}),rows:this.data.reviewOnly?rows.filter(function(row){return row.needsReview||(overflow&&row.role==='starter')}):rows,noPendingRows:this.data.reviewOnly&&!overflow&&!rows.some(function(row){return row.needsReview}),groups:draft.groups(this.teams).filter(function(row){return row.side===side})})
    },
    toggleRows:function(){this.setData({reviewOnly:!this.data.reviewOnly});this.refresh()},
    toggleEvidence:function(){this.setData({showEvidence:!this.data.showEvidence})},
    editRow:function(event){this.teams[this.data.side][Number(event.currentTarget.dataset.index)]._editing=true;this.refresh()},
    toggleAdvanced:function(event){var row=this.teams[this.data.side][Number(event.currentTarget.dataset.index)];row._advanced=!row._advanced;this.refresh()},
    onSide:function(event){this.closeSlice();this.setData({side:event.currentTarget.dataset.id});this.refresh()},
    onRowChange:function(event){var row=this.teams[this.data.side][Number(event.currentTarget.dataset.index)],field=event.currentTarget.dataset.field,value=event.detail.value;if(!row || this.data.busy)return;if(field==='playerId'){var choice=this.playerChoices[Number(value)];row.playerId=choice.id;row.name=choice.name || row.originalName;row.number=choice.number || row.number}else if(field==='role')row.role=draft.ROLES[Number(value)].id;else row[field]=value;this.setData({errorText:''});this.refresh()},
    confirmRow:function(event){var row=this.teams[this.data.side][Number(event.currentTarget.dataset.index)];try{draft.checkRow(row,true);row.lineupConfirmedFingerprint=draft.lineupFingerprint(row);try{draft.checkRow(row,false);row.reviewConfirmedFingerprint=draft.fingerprint(row)}catch(error){row.reviewConfirmedFingerprint=''};this.setData({errorText:''});this.refresh()}catch(error){this.setData({errorText:error.message})}},
    addRow:function(){if(this.data.busy)return;this.teams[this.data.side].push({key:this.data.side+'-new-'+Date.now(),name:'',number:'',playerId:'',role:'unknown',reviewNotes:['新增球员，请核对'],reviewConfirmedFingerprint:''});this.refresh()},
    removeRow:function(event){if(this.data.busy)return;this.teams[this.data.side].splice(Number(event.currentTarget.dataset.index),1);this.refresh()},
    onScore:function(event){var patch={};patch[event.currentTarget.dataset.side==='home'?'scoreHome':'scoreAway']=event.detail.value;this.setData(patch)},
    onNotes:function(event){this.setData({notesReviewed:event.detail.value})},
    preview:function(){if(this.data.photo)wx.previewImage({urls:[this.data.photo]})},
    cancel:function(){if(this.data.busy)return;this.resetSlices();this.generation=(this.generation || 0)+1;this.teams={home:[],away:[]};this.state({open:false,hasDraft:false,errorText:''})},
    saveLineup:function(){this.save(true)},
    retrySave:function(){if(this.data.saveRetry)this.save(this._lastLineupOnly===true)},
    confirm:function(){this.save(false)},
    save:function(lineupOnly){
      if(this.data.busy || !this.data.hasDraft || lineupOnly && !this.properties.canLineup || !lineupOnly && !this.properties.canResult)return
      var that=this,params;try{if(this.data.rulesDirty)throw new Error('识别规则已调整，请重新识别');params=draft.payload(this.teams,{home:this.data.scoreHome,away:this.data.scoreAway},lineupOnly,this.properties.playersOnField)}catch(error){this.setData({errorText:error.message});return}
      that._lastLineupOnly=lineupOnly;that.state({busy:true,saveRetry:false,errorText:'',stage:'正在保存'});that.api(Object.assign({},params,lineupOnly?{operation:'lineup',recordRevision:that.properties.match.recordRevision}:{operation:'confirmReport',draftId:that.draftId})).then(function(reply){wx.showToast({title:reply.message || '已保存',icon:'none'});that.resetSlices();that.state({open:false,hasDraft:false});that.triggerEvent('saved',{matchId:that.properties.match.id})}).catch(function(error){that.setData({saveRetry:true,errorText:error.message || '保存未完成，请重试'})}).finally(function(){that.state({busy:false,stage:''})})
    }
  }
})
