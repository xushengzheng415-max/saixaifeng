var workspace = require('../../../utils/workspace')
var types = [{id:'data_error',label:'数据异常'},{id:'binding',label:'绑定问题'},{id:'feature',label:'功能建议'},{id:'other',label:'其他'}]
function accountKey() { var u=wx.getStorageSync('userInfo')||{};return String(u._id||u.id||'')+'|'+String(u.phone||u.phoneNumber||'') }
function timeText(value) { var raw=value&&typeof value==='object'?(value.$date||value.date||value):value;var date=new Date(raw);return isNaN(date.getTime())?'时间待更新':date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0')+' '+String(date.getHours()).padStart(2,'0')+':'+String(date.getMinutes()).padStart(2,'0') }
Page({
  data:{showForm:true,showRecords:false,formClass:'active',recordsClass:'',types:[],type:'data_error',content:'',contact:'',contentLength:0,submitting:false,loading:false,errorText:'',submitError:'',successText:'',records:[],hasRecords:false,showLimit:false,loggedIn:false},
  onLoad:function(){this._alive=true;this._generation=0;this._listRequest=0;this.selectTypeId('data_error')},
  onShow:function(){
    var key=accountKey(),loggedIn=workspace.hasAuthenticatedUser()
    if(this._account!==key || !loggedIn){this._generation++;this._account=key;this.setData({content:'',contact:'',contentLength:0,submitting:false,records:[],hasRecords:false,showLimit:false,errorText:'',submitError:'',successText:'',loggedIn:loggedIn});this.selectTypeId('data_error')}
    if(loggedIn&&this.data.showRecords)this.loadRecords()
  },
  onUnload:function(){this._alive=false;this._generation++},
  current:function(key,generation){return this._alive&&workspace.hasAuthenticatedUser()&&key===accountKey()&&generation===this._generation},
  login:function(){workspace.promptLogin('登录后可提交反馈并查看客服回复。')},
  selectTypeId:function(id){this.setData({type:id,types:types.map(function(t){return {id:t.id,label:t.label,className:t.id===id?'type active':'type'}})})},
  chooseType:function(e){if(!this.data.submitting)this.selectTypeId(e.currentTarget.dataset.id)},
  contentInput:function(e){this.setData({content:e.detail.value,contentLength:e.detail.value.length,submitError:'',successText:''})},
  contactInput:function(e){this.setData({contact:e.detail.value,submitError:'',successText:''})},
  showSubmit:function(){this.setData({showForm:true,showRecords:false,formClass:'active',recordsClass:''})},
  showMine:function(){this.setData({showForm:false,showRecords:true,formClass:'',recordsClass:'active'});if(workspace.hasAuthenticatedUser())this.loadRecords()},
  call:function(action,data){return wx.cloud.callFunction({name:'webLoginApi',data:Object.assign({action:action},data||{})}).then(function(response){var result=response.result||{};if(result.body)result=JSON.parse(result.body);if(!result.success)throw Error(result.error||result.message||'暂时无法处理，请重试');return result})},
  submit:function(){
    if(!workspace.hasAuthenticatedUser())return this.login()
    if(this.data.submitting)return
    var content=this.data.content.trim(),contact=this.data.contact.trim(),message=''
    if(content.length<10)message='请至少填写10个字，描述具体问题'
    else if(content.length>500)message='请精简到500字以内'
    else if(!/^[a-zA-Z][a-zA-Z0-9_-]{5,19}$/.test(contact))message='微信号需6–20位、字母开头'
    if(message){this.setData({submitError:message});return}
    var self=this,key=accountKey(),generation=this._generation
    this.setData({submitting:true,submitError:'',successText:''})
    return this.call('miniFeedbackSubmit',{type:this.data.type,content:content,contact:contact}).then(function(result){
      if(!self.current(key,generation))return
      self.setData({content:'',contentLength:0,successText:'已提交，编号 '+String(result.feedbackId||'').slice(-6)})
      wx.showToast({title:'反馈已提交',icon:'success'})
    }).catch(function(error){if(self.current(key,generation))self.setData({submitError:error.message||'提交失败，请重试'})}).finally(function(){if(self.current(key,generation))self.setData({submitting:false})})
  },
  loadRecords:function(){
    if(!workspace.hasAuthenticatedUser())return
    var self=this,key=accountKey(),generation=this._generation,request=++this._listRequest
    this.setData({loading:true,errorText:'',records:[],hasRecords:false,showLimit:false})
    return this.call('miniFeedbackList').then(function(result){
      if(!self.current(key,generation)||request!==self._listRequest)return
      var rows=(result.rows||[]).map(function(row){var status=({pending:'待处理',processing:'处理中',done:'已处理'})[row.status]||'待处理';return Object.assign({},row,{statusText:status,timeText:timeText(row.createTime),replyTimeText:timeText(row.replyAt),hasReply:Boolean(row.reply),tutorials:(row.replyTutorials||[]).filter(function(t){return /^[a-zA-Z0-9_-]{1,100}$/.test(t.id)})})})
      self.setData({records:rows,hasRecords:rows.length>0,showLimit:rows.length>=50})
    }).catch(function(error){if(self.current(key,generation)&&request===self._listRequest)self.setData({errorText:error.message||'读取失败，请重试'})}).finally(function(){if(self.current(key,generation)&&request===self._listRequest)self.setData({loading:false})})
  },
  openTutorial:function(e){var id=String(e.currentTarget.dataset.id||'');if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))return;wx.navigateTo({url:'/pages/common/official-webview?url='+encodeURIComponent('https://www.sxffootball.cn/service-account-h5/tutorial.html?id='+encodeURIComponent(id))})}
})
