var workspace = require('../../../utils/workspace')
function isDevtools() { try { return wx.getSystemInfoSync().platform === 'devtools' } catch (error) { return false } }
Page({
  data: { teamId: '', loading: true, saving: false, canManage: false, editing: false, profile: {}, form: {}, completenessText: '0%', localVisualQa: false, isOwner:false, canDeleteTeam:false, deleteBusy:false, deleteReason:'', deleteRevision:'' },
  onLoad: function (options) { if (isDevtools() && options && options.visualQa === '1') { var profile = { name: '赛小蜂 U12 竞技队', shortName: '赛小蜂U12', ageGroup: 'U12（2014 年龄段）', foundedYear: '2018', city: '河南省郑州市', managerName: '许老师', managerPhoneMasked: '173****1663', orgName: '赛小蜂足球俱乐部', claimText: '已认领', completeness: 92, logo: '/images/runtime/icons/brand-v1-tab-team.png' }; this.setData({ teamId: 'visual-qa-u12', loading: false, canManage: true, localVisualQa: true, profile: profile, form: profile, completenessText: '92%' }); return }; this.setData({ teamId: String((options || {}).teamId || (options || {}).id || '') }); this.load() },
  load: function () { var self = this, context = workspace.readContext() || {}; wx.cloud.callFunction({ name: 'getMiniWorkspace', data: { action: 'teamProfile', workspaceId: (context.currentWorkspace || {}).id, teamId: this.data.teamId } }).then(function (res) { var result = res.result || {}; if (!result.success) throw new Error(result.message || '资料加载失败'); var profile = result.profile || {}; self.setData({ loading: false, profile: profile, form: profile, canManage: result.canManage, completenessText: String(profile.completeness || 0) + '%' }) }).catch(function (error) { self.setData({ loading: false }); wx.showToast({ title: error.message || '资料加载失败', icon: 'none' }) }) },
  onReady: function () { if (!this.data.localVisualQa) this.loadDeletionInfo().catch(function(error) { wx.showToast({title:error.message || '删除检查未完成，请重新进入',icon:'none'}) }) },
  loadDeletionInfo: function () {
    var self=this, context=workspace.readContext() || {}, userId=(wx.getStorageSync('userInfo') || {})._id
    return wx.cloud.callFunction({name:'getMiniWorkspace',data:{action:'teamDeletionInfo',workspaceId:(context.currentWorkspace || {}).id,teamId:this.data.teamId}}).then(function(response) {
      if ((wx.getStorageSync('userInfo') || {})._id!==userId) throw new Error('账号已切换，请重新进入球队')
      var result=response.result || {}
      if (!result.success) throw new Error(result.message || '删除检查未完成，请稍后重试')
      self.setData({isOwner:result.isOwner===true,canDeleteTeam:result.canDelete===true,deleteReason:result.reason || '',deleteRevision:result.revision || ''})
      return result
    }).catch(function(error) {
      self.setData({canDeleteTeam:false,deleteReason:error.message || '删除检查未完成，请稍后重试'})
      throw error
    })
  },
  deleteEmptyTeam: function () {
    if (this.data.deleteBusy || !this.data.isOwner) return
    var self=this, context=workspace.readContext() || {}, workspaceId=(context.currentWorkspace || {}).id, userId=(wx.getStorageSync('userInfo') || {})._id
    this.setData({deleteBusy:true})
    return this.loadDeletionInfo().then(function(info) {
      if (!info.canDelete) throw new Error(info.reason || '球队不是空球队，不能删除')
      return new Promise(function(resolve) {
        wx.showModal({title:'删除球队',content:'永久删除“'+self.data.profile.name+'”？此操作不可恢复。',confirmText:'删除',confirmColor:'#b52b32',cancelText:'取消',success:function(result){resolve(result.confirm)},fail:function(){resolve(false)}})
      }).then(function(confirmed) {
        if (!confirmed) return
        if ((wx.getStorageSync('userInfo') || {})._id!==userId || ((workspace.readContext() || {}).currentWorkspace || {}).id!==workspaceId) throw new Error('账号或工作空间已切换，请重新进入球队')
        return wx.cloud.callFunction({name:'getMiniWorkspace',data:{action:'deleteEmptyTeam',workspaceId:workspaceId,teamId:self.data.teamId,confirmName:self.data.profile.name,revision:info.revision}}).then(function(response) {
          var result=response.result || {}
          if (!result.success) throw new Error(result.message || '删除失败，请重新检查')
          if ((wx.getStorageSync('userInfo') || {})._id!==userId) return
          workspace.clearContext()
          wx.removeStorageSync('teamInfo')
          wx.showToast({title:'空球队已删除',icon:'success'})
          return wx.reLaunch({url:'/pages/teams/index'})
        })
      })
    }).catch(function(error) { wx.showToast({title:error.message || '删除失败，请重试',icon:'none'}) }).finally(function() { self.setData({deleteBusy:false}) })
  },
  edit: function () { if (this.data.canManage) this.setData({ editing: true }) },
  cancel: function () { this.setData({ editing: false, form: this.data.profile }) },
  input: function (event) { var key = event.currentTarget.dataset.key; this.setData({ ['form.' + key]: event.detail.value }) },
  save: function () { var self = this, context = workspace.readContext() || {}; if (this.data.saving) return; this.setData({ saving: true }); wx.cloud.callFunction({ name: 'getMiniWorkspace', data: Object.assign({ action: 'saveTeamProfile', workspaceId: (context.currentWorkspace || {}).id, teamId: this.data.teamId }, this.data.form) }).then(function (res) { if (!(res.result || {}).success) throw new Error((res.result || {}).message || '保存失败'); wx.showToast({ title: '球队资料已保存', icon: 'success' }); self.setData({ editing: false }); self.load() }).catch(function (error) { wx.showToast({ title: error.message || '保存失败', icon: 'none' }) }).finally(function () { self.setData({ saving: false }) }) },
  back: function () { wx.navigateBack() }
})
