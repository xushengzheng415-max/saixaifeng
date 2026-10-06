var workspace = require('../../../utils/workspace')

Page({
  data: { teamId:'', playerId:'', tournamentId:'', divisionId:'', loading:true, invite:{}, requirements:[], canManage:false, visualQa:false, scopeTitle:'', scopeMessage:'' },
  onLoad: function(options) {
    options = options || {}
    if (workspace.isVisualQaEnabled(options)) {
      this.setData({ teamId:'visual-team', playerId:'visual-player', loading:false, visualQa:true, canManage:true, scopeTitle:'球队球员资料', scopeMessage:'球队登记不要求身份证核验', invite:{ playerName:'李浩然', teamName:'赛小蜂 U12 竞技队', expiresAtText:'有效期 7 天', guardianPhoneMasked:'138 **** 6721', h5Path:'/service-account-h5/?invite=visual' }, requirements:['核对姓名和出生年月','监护人授权'] })
      return
    }
    this.setData({ teamId:String(options.teamId || ''), playerId:String(options.playerId || ''), tournamentId:String(options.tournamentId || ''), divisionId:String(options.divisionId || '') })
    this.load()
  },
  load: function() {
    var page = this
    var context = workspace.readContext() || {}
    wx.cloud.callFunction({ name:'getMiniWorkspace', data:{ action:'parentProfileInvite', workspaceId:(context.currentWorkspace || {}).id, teamId:this.data.teamId, playerId:this.data.playerId, tournamentId:this.data.tournamentId, divisionId:this.data.divisionId } }).then(function(response) {
      var result = response.result || {}
      if (!result.success) throw new Error(result.message || '资料邀请加载失败')
      page.showInvite(result.invite || {}, Boolean(result.canManage))
    }).catch(function(error) {
      page.setData({ loading:false })
      wx.showToast({ title:error.message || '资料邀请加载失败', icon:'none' })
    })
  },
  showInvite: function(invite, canManage) {
    var isEvent = invite.profileScope === 'tournament'
    this.setData({ loading:false, invite:invite, requirements:invite.requirements || [], canManage:canManage, scopeTitle:isEvent ? [invite.tournamentName, invite.divisionName].filter(Boolean).join(' · ') : '球队球员资料', scopeMessage:isEvent ? '关注服务号后按本组要求提交' : '关注服务号后登记，不要求身份证核验' })
    this.generateInviteQr(invite)
  },
  generateInviteQr: function(invite) {
    var page = this
    if (!invite.token || this.data.visualQa) return
    var accountInfo = wx.getAccountInfoSync ? wx.getAccountInfoSync() : {}
    var miniProgram = accountInfo.miniProgram || {}
    var preview = String(miniProgram.envVersion || 'release') !== 'release'
    wx.cloud.callFunction({ name:'generateQRCode', data:{ type:'service_account_player_invite', parentInvite:invite.token, preview:preview, width:430 } }).then(function(response) {
      var result = (response.result || {}).data || {}
      if (result.tempUrl && page.data.invite.token === invite.token) page.setData({ 'invite.qrUrl':result.tempUrl })
    }).catch(function() {})
  },
  copy: function() {
    var path = this.data.invite.h5Path || ''
    if (!path) return
    wx.setClipboardData({ data:path, success:function() { wx.showToast({ title:'服务号链接已复制', icon:'success' }) } })
  },
  regenerate: function() {
    if (this.data.visualQa) return wx.showToast({ title:'视觉验收状态不重置邀请', icon:'none' })
    var page = this
    var context = workspace.readContext() || {}
    wx.showModal({ title:'重新生成邀请', content:'旧链接会立即失效，是否继续？', success:function(result) {
      if (!result.confirm) return
      wx.cloud.callFunction({ name:'getMiniWorkspace', data:{ action:'regenerateParentProfileInvite', workspaceId:(context.currentWorkspace || {}).id, teamId:page.data.teamId, playerId:page.data.playerId, tournamentId:page.data.tournamentId, divisionId:page.data.divisionId } }).then(function(response) {
        var data = response.result || {}
        if (!data.success) throw new Error(data.message || '重新生成失败')
        page.showInvite(data.invite || {}, Boolean(data.canManage))
        wx.showToast({ title:'新链接已生成', icon:'success' })
      }).catch(function(error) { wx.showToast({ title:error.message || '重新生成失败', icon:'none' }) })
    } })
  },
  back: function() { wx.navigateBack() }
})
