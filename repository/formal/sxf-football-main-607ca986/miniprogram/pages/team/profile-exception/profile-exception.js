var workspace = require('../../../utils/workspace')

function fixture() {
  return { name: '王梓轩', birthDate: '2013-12-26 出生', teamName: '赛小蜂 U12 竞技队', statusText: '人证核验异常', avatarText: '王', maskedName: '王梓轩', verifiedName: '王梓轩', idMasked: '410***********281X', verificationHint: '疑似生僻字差异', canManage: true }
}

function normalize(player) {
  var row = Object.assign({}, player || {})
  row.avatarText = row.avatarText || String(row.name || '球').slice(0, 1)
  row.teamName = row.teamName || '当前球队'
  row.maskedName = row.maskedName || row.name || '—'
  row.verifiedName = row.verifiedName || row.name || '—'
  row.idMasked = row.idMasked || '仅显示脱敏核验结果'
  row.verificationHint = row.verificationHint || '姓名与证件核验结果不一致'
  return row
}

Page({
  data: { teamId: '', playerId: '', player: {}, loading: true, canManage: false, isDevtools: false, checks: [], audit: [] },
  onLoad: function (options) {
    var query = options || {}
    var isDevtools = workspace.isVisualQaEnabled(query)
    this.setData({ teamId: String(query.teamId || ''), playerId: String(query.playerId || ''), isDevtools: isDevtools })
    if (isDevtools) { this.setVisualData(normalize(fixture()), true); return }
    this.load()
  },
  setVisualData: function (player, canManage) {
    this.setData({ loading: false, player: player, canManage: canManage, checks: [
      { title: '基础资料', detail: '姓名、出生日期、监护人手机号', icon: '/images/runtime/icons/brand-v2-03.png', state: '已完成', className: 'check-ok' },
      { title: '监护人授权', detail: '监护人已确认资料使用授权', icon: '/images/runtime/icons/brand-v2-08.png', state: '已完成', className: 'check-ok' },
      { title: '人证核验', detail: player.verificationHint, icon: '/images/runtime/icons/brand-v2-13.png', state: '姓名不一致', className: 'check-error' },
      { title: '标准形象照', detail: '当前赛事未要求', icon: '/images/runtime/icons/brand-v2-12.png', state: '已完成', className: 'check-ok' }
    ], audit: [
      { time: '2025-06-10 09:30', label: '家长提交资料', state: '提交成功', className: 'audit-ok' },
      { time: '2025-06-10 09:31', label: '人证核验校验失败', state: '姓名不一致', className: 'audit-error' },
      { time: '2025-06-10 09:31', label: '已通知家长重新提交', state: '待家长处理', className: 'audit-wait' }
    ] })
  },
  load: function () {
    var self = this
    var context = workspace.readContext() || {}
    wx.cloud.callFunction({ name: 'getMiniWorkspace', data: { action: 'teamPlayers', workspaceId: (context.currentWorkspace || {}).id, teamId: this.data.teamId } }).then(function (response) {
      var result = response.result || {}
      var player = (result.players || []).filter(function (item) { return item.id === self.data.playerId })[0]
      if (!player) throw new Error('球员不存在或无权查看')
      self.setVisualData(normalize(player), result.canManage)
    }).catch(function (error) { self.setData({ loading: false }); wx.showToast({ title: error.message || '加载失败', icon: 'none' }) })
  },
  remind: function () {
    var self = this
    var context = workspace.readContext() || {}
    if (!this.data.canManage) { wx.showToast({ title: '当前身份没有提醒权限', icon: 'none' }); return }
    wx.cloud.callFunction({ name: 'getMiniWorkspace', data: { action: 'remindParentProfile', workspaceId: (context.currentWorkspace || {}).id, teamId: this.data.teamId, playerId: this.data.playerId } }).then(function (response) {
      if (!(response.result || {}).success) throw new Error((response.result || {}).message)
      wx.showToast({ title: '已通知家长重新提交', icon: 'success' })
    }).catch(function (error) { wx.showToast({ title: error.message || '提醒失败', icon: 'none' }) })
  },
  viewLog: function () { wx.showToast({ title: '当前展示脱敏核验记录', icon: 'none' }) },
  back: function () { var teamId = this.data.teamId; wx.navigateBack({ fail: function () { wx.navigateTo({ url: '/pages/team/profile-progress/profile-progress?teamId=' + encodeURIComponent(teamId) }) } }) }
})
