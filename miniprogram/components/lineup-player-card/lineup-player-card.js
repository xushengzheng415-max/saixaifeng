Component({
 properties:{size:{type:String,value:'pitch'},cardUrl:{type:String,value:''},cardState:{type:String,value:'unavailable'},cardTier:{type:String,value:''},cardRole:{type:String,value:'player'},photoUrl:{type:String,value:''},number:{type:String,value:''},name:{type:String,value:''},position:{type:String,value:''},jerseyName:{type:String,value:''},height:{type:null,value:null},weight:{type:null,value:null},nationality:{type:String,value:''},teamLogo:{type:String,value:''}},
 data:{ready:false,stateText:'尚未制作成卡'},
 observers:{'cardUrl,cardState,cardRole':function(url,state,role){this.setData({ready:!!url&&state==='ready'&&role!=='coach',stateText:role==='coach'?'主教练':({pending:'成卡更新中',failed:'卡片读取失败',load_failed:'卡片读取失败',forbidden:'无权查看'}[state]||'尚未制作成卡')})}},
 methods:{imageFailed:function(){this.setData({ready:false,stateText:'卡片读取失败'})}}
})
