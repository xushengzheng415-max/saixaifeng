var workspace = require('../../../utils/workspace')
var location = require('../../../utils/location')
function isDevtools() { try { return wx.getSystemInfoSync().platform === 'devtools' } catch (error) { return false } }
Page({
  data: { teamId: '', loading: true, saving: false, canManage: false, editing: false, profile: {}, form: {}, completenessText: '0%', localVisualQa: false, isOwner:false, canDeleteTeam:false, deleteBusy:false, deleteReason:'', deleteRevision:'', transferBusy:false, homeVenues: [], hasHomeVenues: false, venueEditorVisible: false, venueEditorTitle: '添加主场', editingVenueId: '', editorVenueName: '', editorVenueAddress: '', editorVenueLat: 0, editorVenueLng: 0, editorVenueHasLoc: false },
  onLoad: function (options) { if (isDevtools() && options && options.visualQa === '1') { var profile = { name: '赛小蜂 U12 竞技队', shortName: '赛小蜂U12', ageGroup: 'U12（2014 年龄段）', foundedYear: '2018', city: '河南省郑州市', managerName: '许老师', managerPhoneMasked: '173****1663', orgName: '赛小蜂足球俱乐部', claimText: '已认领', completeness: 92, logo: '/images/runtime/icons/brand-v1-tab-team.png' }; this.setData({ teamId: 'visual-qa-u12', loading: false, canManage: true, localVisualQa: true, profile: profile, form: profile, completenessText: '92%' }); return }; this.setData({ teamId: String((options || {}).teamId || (options || {}).id || '') }); this.load() },
  load: function () { var self = this, context = workspace.readContext() || {}; wx.cloud.callFunction({ name: 'getMiniWorkspace', data: { action: 'teamProfile', workspaceId: (context.currentWorkspace || {}).id, teamId: this.data.teamId } }).then(function (res) { var result = res.result || {}; if (!result.success) throw new Error(result.message || '资料加载失败'); var profile = result.profile || {}; self.setData({ loading: false, profile: profile, form: profile, canManage: result.canManage, completenessText: String(profile.completeness || 0) + '%' }); if (!self.data.localVisualQa) self.loadHomeVenues() }).catch(function (error) { self.setData({ loading: false }); wx.showToast({ title: error.message || '资料加载失败', icon: 'none' }) }) },
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
  // ===== 主账号移交（无需对方确认，对方用该手机号登录即可） =====
  transferTeamOwner: function () {
    if (this.data.transferBusy || !this.data.isOwner) return
    var self = this, context = workspace.readContext() || {}, workspaceId = (context.currentWorkspace || {}).id, userId = (wx.getStorageSync('userInfo') || {})._id
    wx.showModal({ title: '移交主账号', editable: true, placeholderText: '请输入新负责人手机号', content: '', confirmText: '下一步', success: function (step) {
      if (!step.confirm) return
      var phone = String(step.content || '').replace(/\D/g, '')
      if (!/^1[3-9]\d{9}$/.test(phone)) { wx.showToast({ title: '请输入正确的 11 位手机号', icon: 'none' }); return }
      wx.showModal({ title: '确认移交', content: '移交后你不再是“' + String(self.data.profile.name || '') + '”的主账号，将退出这支球队的管理。对方无需确认，用 ' + phone.slice(0, 3) + '****' + phone.slice(-4) + ' 登录小程序就能看到并管理球队。', confirmText: '确认移交', confirmColor: '#b52b32', success: function (final) {
        if (!final.confirm) return
        if ((wx.getStorageSync('userInfo') || {})._id !== userId || ((workspace.readContext() || {}).currentWorkspace || {}).id !== workspaceId) { wx.showToast({ title: '账号或工作空间已切换，请重新进入球队', icon: 'none' }); return }
        self.setData({ transferBusy: true })
        wx.cloud.callFunction({ name: 'getMiniWorkspace', data: { action: 'transferTeamOwnerDirect', workspaceId: workspaceId, teamId: self.data.teamId, targetPhone: phone } }).then(function (response) {
          var result = (response && response.result) || {}
          if (!result.success) throw new Error(result.message || '移交失败，请重试')
          if ((wx.getStorageSync('userInfo') || {})._id !== userId) return
          workspace.clearContext()
          wx.removeStorageSync('teamInfo')
          wx.showToast({ title: result.hasAccount ? '已移交，对方登录即可管理' : '已登记，对方登录后生效', icon: 'none', duration: 2200 })
          return new Promise(function (resolve) { setTimeout(resolve, 1200) }).then(function () { wx.reLaunch({ url: '/pages/teams/index' }) })
        }).catch(function (error) { wx.showToast({ title: error.message || '移交失败，请重试', icon: 'none' }) }).finally(function () { self.setData({ transferBusy: false }) })
      } })
    } })
  },
  // ===== 主场设置 =====
  loadHomeVenues: function () {
    var self = this
    if (!wx.cloud || !this.data.teamId) return
    wx.cloud.callFunction({ name: 'friendlyMatchCenter', data: { action: 'listTeamVenues', teamId: this.data.teamId } }).then(function (response) {
      var result = (response && response.result) || {}
      var list = result.ok && result.data && result.data.venues ? result.data.venues.filter(function (v) { return v.saved === true }) : []
      self.setData({ homeVenues: list, hasHomeVenues: list.length > 0 })
    }).catch(function (error) { console.warn('[team-profile] 主场加载失败', error && error.message) })
  },
  openAddVenue: function () {
    var self = this
    location.pickLocation({
      success: function (res) {
        var name = String(res.name || '').trim() || String(res.address || '').trim()
        var address = String(res.address || '').trim()
        var lat = Number(res.latitude) || 0
        var lng = Number(res.longitude) || 0
        if (!name) { wx.showToast({ title: '未获取到场地名称', icon: 'none' }); return }
        if (name.length > 30) name = name.slice(0, 30)
        wx.showLoading({ title: '保存主场' })
        wx.cloud.callFunction({
          name: 'friendlyMatchCenter',
          data: { action: 'upsertTeamVenue', teamId: self.data.teamId, name: name, address: address, latitude: lat, longitude: lng }
        }).then(function (response) {
          wx.hideLoading()
          var result = (response && response.result) || {}
          if (!result.ok) throw new Error(result.message || '保存失败')
          wx.showToast({ title: '已添加主场', icon: 'success' })
          self.loadHomeVenues()
        }).catch(function (error) {
          wx.hideLoading()
          console.error('[profile] 保存主场失败', error && error.message)
          wx.showToast({ title: error && error.message || '保存失败', icon: 'none' })
        })
      }
    })
  },
  editVenue: function (event) {
    var item = this.data.homeVenues[Number(event.currentTarget.dataset.index)]
    if (!item) return
    this.setData({ venueEditorVisible: true, venueEditorTitle: '编辑主场', editingVenueId: item.id || '', editorVenueName: String(item.name || '').trim(), editorVenueAddress: String(item.address || '').trim(), editorVenueLat: Number(item.latitude) || 0, editorVenueLng: Number(item.longitude) || 0, editorVenueHasLoc: Boolean(Number(item.latitude) && Number(item.longitude)) })
  },
  closeVenueEditor: function () { this.setData({ venueEditorVisible: false }) },
  onEditorNameInput: function (event) { this.setData({ editorVenueName: String(event.detail.value || '').trim() }) },
  onPickEditorLocation: function () {
    var self = this
    location.pickLocation({
      success: function (res) {
        self.setData({ editorVenueName: self.data.editorVenueName || String(res.name || '').trim() || String(res.address || '').trim(), editorVenueAddress: String(res.address || '').trim(), editorVenueLat: Number(res.latitude) || 0, editorVenueLng: Number(res.longitude) || 0, editorVenueHasLoc: Boolean(res.latitude && res.longitude) })
      }
    })
  },
  clearEditorLocation: function () { this.setData({ editorVenueAddress: '', editorVenueLat: 0, editorVenueLng: 0, editorVenueHasLoc: false }) },
  saveVenue: function () {
    var self = this, data = this.data, name = String(data.editorVenueName || '').trim()
    if (!name) { wx.showToast({ title: '请输入场地名称', icon: 'none' }); return }
    var payload = { action: 'upsertTeamVenue', teamId: data.teamId, name: name, address: String(data.editorVenueAddress || '').trim(), latitude: Number(data.editorVenueLat) || 0, longitude: Number(data.editorVenueLng) || 0 }
    if (data.editingVenueId) payload.venueId = data.editingVenueId
    wx.showLoading({ title: '保存中' })
    wx.cloud.callFunction({ name: 'friendlyMatchCenter', data: payload }).then(function (response) {
      wx.hideLoading()
      var result = (response && response.result) || {}
      if (!result.ok) throw new Error(result.message || '保存失败')
      self.setData({ venueEditorVisible: false })
      self.loadHomeVenues()
      wx.showToast({ title: '已保存', icon: 'success' })
    }).catch(function (error) {
      wx.hideLoading()
      wx.showToast({ title: error.message || '保存失败', icon: 'none' })
    })
  },
  deleteVenue: function (event) {
    var self = this
    var item = this.data.homeVenues[Number(event.currentTarget.dataset.index)]
    if (!item || !item.id) return
    wx.showModal({
      title: '删除主场',
      content: '确定删除「' + String(item.name || '').trim() + '」？',
      success: function (result) {
        if (!result.confirm) return
        wx.showLoading({ title: '删除中' })
        wx.cloud.callFunction({ name: 'friendlyMatchCenter', data: { action: 'deleteTeamVenue', teamId: self.data.teamId, venueId: item.id } }).then(function (response) {
          wx.hideLoading()
          var res = (response && response.result) || {}
          if (!res.ok) throw new Error(res.message || '删除失败')
          self.loadHomeVenues()
          wx.showToast({ title: '已删除', icon: 'success' })
        }).catch(function (error) {
          wx.hideLoading()
          wx.showToast({ title: error.message || '删除失败', icon: 'none' })
        })
      }
    })
  },
  setDefaultVenue: function (event) {
    var self = this
    var item = this.data.homeVenues[Number(event.currentTarget.dataset.index)]
    if (!item || !item.id) return
    wx.cloud.callFunction({ name: 'friendlyMatchCenter', data: { action: 'setDefaultTeamVenue', teamId: this.data.teamId, venueId: item.id } }).then(function (response) {
      var result = (response && response.result) || {}
      if (!result.ok) throw new Error(result.message || '设置失败')
      self.loadHomeVenues()
      wx.showToast({ title: '已设为默认', icon: 'success' })
    }).catch(function (error) { wx.showToast({ title: error.message || '设置失败', icon: 'none' }) })
  },
  openVenueMap: function (event) {
    var item = this.data.homeVenues[Number(event.currentTarget.dataset.index)]
    if (!item || !Number(item.latitude)) return
    wx.openLocation({ latitude: Number(item.latitude), longitude: Number(item.longitude), name: String(item.name || '').trim(), address: String(item.address || '').trim(), scale: 16 })
  },
  edit: function () { if (this.data.canManage) this.setData({ editing: true }) },
  cancel: function () { this.setData({ editing: false, form: this.data.profile }) },
  input: function (event) { var key = event.currentTarget.dataset.key; this.setData({ ['form.' + key]: event.detail.value }) },
  save: function () { var self = this, context = workspace.readContext() || {}; if (this.data.saving) return; this.setData({ saving: true }); wx.cloud.callFunction({ name: 'getMiniWorkspace', data: Object.assign({ action: 'saveTeamProfile', workspaceId: (context.currentWorkspace || {}).id, teamId: this.data.teamId }, this.data.form) }).then(function (res) { if (!(res.result || {}).success) throw new Error((res.result || {}).message || '保存失败'); wx.showToast({ title: '球队资料已保存', icon: 'success' }); self.setData({ editing: false }); self.load() }).catch(function (error) { wx.showToast({ title: error.message || '保存失败', icon: 'none' }) }).finally(function () { self.setData({ saving: false }) }) },
  back: function () { wx.navigateBack() }
})
