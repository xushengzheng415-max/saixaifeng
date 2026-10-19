var setup = require('../../utils/quick-setup')
var workspace = require('../../utils/workspace')
var ORG_TYPES = [{id:'event_company',name:'赛事公司'},{id:'club',name:'足球俱乐部'},{id:'school',name:'学校'},{id:'association',name:'足协/体育组织'},{id:'other',name:'其他机构'}]

Component({
  properties: { visible:{type:Boolean,value:false}, kind:{type:String,value:'event'}, allowSkip:{type:Boolean,value:true} },
  data:{ title:'创建赛事',isEvent:true,loadingState:false,busy:false,errorText:'',organizationStep:false,businessStep:true,successStep:false,
    name:'',startDate:'',endDate:'',region:[],regionText:'请选择省市',province:'',provinceCode:'',city:'',logo:'',originalLogo:'',transparentLogo:'',uploading:false,
    organizationName:'',organizationType:'',organizationTypeText:'请选择机构类型',organizationTypes:ORG_TYPES,organizationSummary:'',submitText:'创建赛事',closeText:'跳过',successName:'',successText:'',successButton:'',createdId:'',isTeamSuccess:false },
  observers:{'visible, kind':function(visible,kind) { if (visible && (!this._open || this._kind !== kind)) this.open(kind); else if (!visible && this._open) { this._open=false;this.setTabHidden(false) } }},
  lifetimes:{detached:function() { this._open=false;clearTimeout(this._uploadTimer);this.setTabHidden(false) }},
  pageLifetimes:{hide:function() { this.setTabHidden(false) },show:function() { if(this.properties.visible)this.setTabHidden(true) }},
  methods:{
    noop:function(){},
    setTabHidden:function(hidden) {
      var pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
      if(hidden && !this._ownerPage)this._ownerPage=pages[pages.length-1]
      var page = this._ownerPage
      var tab = page && typeof page.getTabBar === 'function' && page.getTabBar()
      if (tab && typeof tab.setOverlayHidden === 'function') tab.setOverlayHidden(hidden)
    },
    active:function() { return this._open && this._account === setup.accountKey() },
    open:function(kind) {
      var that=this,isEvent=kind !== 'team'
      this._open=true;this._kind=kind;this._account=setup.accountKey();this._requestId=setup.requestId();this._organization=null;this._organizationCommitted=false;this._organizationRegion=null
      this.setTabHidden(true)
      this.setData({title:isEvent?'创建赛事':'创建球队',isEvent:isEvent,loadingState:isEvent,busy:false,errorText:'',organizationStep:false,businessStep:!isEvent,successStep:false,
        name:'',startDate:'',endDate:'',region:[],regionText:'请选择省市',province:'',provinceCode:'',city:'',logo:'',originalLogo:'',transparentLogo:'',uploading:false,
        organizationName:'',organizationType:'',organizationTypeText:'请选择机构类型',organizationSummary:'',submitText:isEvent?'创建赛事':'创建球队',closeText:this.properties.allowSkip?'跳过':'关闭',createdId:'',isTeamSuccess:false})
      if (!isEvent) return
      setup.call('state').then(function(state) {
        if(!that.active())return
        that._organization=setup.preferredOrganization(state,workspace.readContext())
        if (!that._organization && state.hasBusinessRelation && !state.canCreateOrganizationFromTeams) throw new Error('请先在电脑核对主办机构归属，再创建赛事')
        that.setData({loadingState:false,organizationStep:!that._organization,businessStep:Boolean(that._organization),title:that._organization?'创建赛事':'主办机构',organizationSummary:that._organization ? that._organization.name || '' : '',submitText:that._organization?'创建赛事':'下一步'})
      }).catch(function(error) { if(that.active())that.setData({loadingState:false,businessStep:false,errorText:error.message}) })
    },
    retryState:function() { if(!this.data.busy)this.open(this.properties.kind) },
    close:function() {
      if(this.data.busy || this.data.uploading)return
      this._open=false;this.setTabHidden(false)
      this.triggerEvent('close',{skipped:!this.data.successStep,kind:this.properties.kind,createdId:this.data.createdId})
    },
    input:function(event) {
      var field=event.currentTarget.dataset.field
      if(['name','organizationName'].indexOf(field)<0)return
      var patch={errorText:''};patch[field]=event.detail.value;this.setData(patch)
    },
    onDate:function(event) { var field=event.currentTarget.dataset.field;if(['startDate','endDate'].indexOf(field)<0)return;var patch={errorText:''};patch[field]=event.detail.value;this.setData(patch) },
    onRegion:function(event) {
      var values=event.detail.value || [], codes=event.detail.code || []
      this.setData({region:values,province:values[0] || '',city:values[1] || '',provinceCode:codes[0] || '',regionText:values.slice(0,2).join(' '),errorText:''})
    },
    onOrganizationType:function(event) { var row=ORG_TYPES[Number(event.detail.value)];if(row)this.setData({organizationType:row.id,organizationTypeText:row.name,errorText:''}) },
    backToOrganization:function() { if(!this.data.busy && !this._organization)this.setData({organizationStep:true,businessStep:false,title:'主办机构',submitText:'下一步',errorText:''}) },
    submit:function() {
      var that=this,d=this.data
      if(d.busy || d.uploading || d.loadingState || d.successStep)return
      if(d.organizationStep){
        if(String(d.organizationName).trim().length<2)return this.setData({errorText:'请填写主办机构名称'})
        if(!d.organizationType)return this.setData({errorText:'请选择机构类型'})
        if(!d.provinceCode || !d.city)return this.setData({errorText:'请选择所在省市'})
        this._organizationRegion={province:d.province,provinceCode:d.provinceCode,city:d.city}
        this.setData({organizationStep:false,businessStep:true,title:'创建赛事',submitText:'创建赛事',errorText:''});return
      }
      var name=String(d.name || '').trim()
      if(name.length<2 || name.length>(d.isEvent?50:30))return this.setData({errorText:d.isEvent?'赛事名称需为2—50个字':'球队名称需为2—30个字'})
      if(!d.provinceCode || !d.city)return this.setData({errorText:'请选择所在省市'})
      if(d.isEvent){var message=setup.validateDates(d.startDate,d.endDate);if(message)return this.setData({errorText:message})}
      this.setData({busy:true,errorText:''})
      var preparation=Promise.resolve()
      if(d.isEvent && !this._organization){
        preparation=setup.call('createOrganization',Object.assign({name:String(d.organizationName).trim(),organizationType:d.organizationType,attachTeamIds:[]},this._organizationRegion || {})).then(function(result){
          if(!that.active())throw new Error('登录状态已变化，请重新打开')
          if(result.duplicate && (!result.organization || result.organization.name !== String(d.organizationName).trim()))throw new Error('主办机构已变化，请关闭后重新打开')
          that._organization=result.organization;that._organizationCommitted=true
        })
      }
      return preparation.then(function(){
        if(!that.active())throw new Error('登录状态已变化，请重新打开')
        var fields={name:name,city:d.city,province:d.province,provinceCode:d.provinceCode,originalLogo:d.originalLogo,transparentLogo:d.transparentLogo}
        if(d.isEvent)Object.assign(fields,{orgId:(that._organization || {}).id || (that._organization || {})._id,startDate:d.startDate,endDate:d.endDate,requestId:that._requestId,entryPoint:'mini_quick_create'})
        return setup.call(d.isEvent?'createEventSpace':'createTeam',fields)
      }).then(function(result){
        if(!that.active())return
        var asset=d.isEvent?result.tournament:result.team
        if(!asset || !asset.id)throw new Error('创建结果不完整，请刷新列表核对')
        workspace.clearContext()
        if(!d.isEvent)workspace.selectWorkspace('team:'+asset.id)
        that.setData({busy:false,businessStep:false,organizationStep:false,successStep:true,title:'创建完成',successName:asset.name || name,successText:d.isEvent?'使用同一账号登录电脑，完善赛制与赛程。':'球队已创建，可以继续添加球员。',successButton:d.isEvent?'完成':'查看球队',createdId:asset.id,isTeamSuccess:!d.isEvent,closeText:'关闭'})
        that.triggerEvent('created',{kind:that.properties.kind,id:asset.id,name:asset.name || name})
      }).catch(function(error){if(that.active())that.setData({busy:false,errorText:(that._organizationCommitted?'主办机构已保存，赛事未确认。':'')+error.message})})
    },
    finish:function() { var detail={kind:this.properties.kind,id:this.data.createdId};this.close();this.triggerEvent('complete',detail) },
    copyPc:function() { wx.setClipboardData({data:setup.site,success:function(){wx.showToast({title:'网址已复制',icon:'success'})},fail:function(){wx.showModal({title:'电脑办赛网址',content:setup.site,showCancel:false})}}) },
    chooseLogo:function() {
      var that=this;if(this.data.busy || this.data.uploading)return
      wx.chooseImage({count:1,sizeType:['compressed'],sourceType:['album','camera'],success:function(reply){
        if(!that.active())return
        var file=(reply.tempFilePaths || [])[0];if(!file)return
        var uploadId=that._uploadId=setup.requestId()
        clearTimeout(that._uploadTimer)
        that.setData({uploading:true,errorText:''})
        that._uploadTimer=setTimeout(function(){if(that.active() && that._uploadId===uploadId){that._uploadId='';that.setData({uploading:false,errorText:'队徽上传超时，请重试或稍后补充'})}},18000)
        wx.cloud.uploadFile({cloudPath:'team-logos/original/'+setup.requestId()+'.png',filePath:file,
          success:function(upload){if(!that.active() || that._uploadId!==uploadId)return;clearTimeout(that._uploadTimer);that._uploadId='';that.setData({logo:file,originalLogo:upload.fileID,transparentLogo:'',uploading:false})},
          fail:function(){if(that.active() && that._uploadId===uploadId){clearTimeout(that._uploadTimer);that._uploadId='';that.setData({uploading:false,errorText:'队徽上传失败，请重新选择'})}}})
      }})
    }
  }
})
