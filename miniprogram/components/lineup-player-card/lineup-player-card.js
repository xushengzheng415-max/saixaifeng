Component({
 properties:{size:{type:String,value:'pitch'},cardUrl:{type:String,value:''},cardState:{type:String,value:'unavailable'},cardTier:{type:String,value:''},cardRole:{type:String,value:'player'},photoUrl:{type:String,value:''},number:{type:String,value:''},name:{type:String,value:''},position:{type:String,value:''},jerseyName:{type:String,value:''},height:{type:null,value:null},weight:{type:null,value:null},nationality:{type:String,value:''},teamLogo:{type:String,value:''}},
 data:{ready:false,stateText:'',hasPortrait:false},
 observers:{'cardUrl,cardState,cardRole,photoUrl':function(url,state,role,photo){this.setData({ready:!!url&&state==='ready'&&role!=='coach',hasPortrait:!!photo&&state!=='forbidden',stateText:role==='coach'?'主教练':state==='forbidden'?'无权查看':photo?(state==='pending'?'成卡更新中':''):'资料待补充'})}},
 methods:{imageFailed:function(){this.setData({ready:false,stateText:this.data.hasPortrait?'':'图片加载异常'})},portraitFailed:function(){this.setData({hasPortrait:false,stateText:'图片加载异常'})}}
})
