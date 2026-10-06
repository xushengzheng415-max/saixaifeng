var workspace = require('../../../utils/workspace')

Page({
  data: { loading: true, errorText: '', denied: false, submitting: false, matchId: '', workspaceId: '', match: {}, record: {}, reason: '', canReview: false, visualQa: false },
  onLoad: function (options) { if (workspace.isVisualQaEnabled(options)) { this.loadVisualFixture(); return } var context = workspace.readContext() || {}; this.setData({ matchId: (options && options.matchId) || '', workspaceId: (context.currentWorkspace || {}).id || '' }); this.loadReview() },
  onPullDownRefresh: function () { var that = this; this.loadReview().finally(function () { wx.stopPullDownRefresh() }) },
  loadReview: function () {
    var that = this; var context = workspace.readContext() || {}
    if (!this.data.matchId) { this.setData({ loading: false, errorText: '缺少比赛参数' }); return Promise.resolve() }
    if (!workspace.hasPermission('event.manage', context)) { this.setData({ loading: false, denied: true }); return Promise.resolve() }
    this.setData({ loading: true, errorText: '' })
    return new Promise(function (resolve, reject) { wx.cloud.database().collection('matches').doc(that.data.matchId).get({ success: resolve, fail: reject }) }).then(function (res) {
      var raw = res.data || {}; var record = raw.refereeRecord || {}
      that.setData({ loading: false, match: { divisionText: raw.divisionName || raw.division || '当前组别', recordNumber: record.recordNumber || '记录编号待生成', homeName: raw.homeTeamName || '主队', awayName: raw.awayTeamName || '客队', homeScore: String(raw.homeScore || 0), awayScore: String(raw.awayScore || 0), venueText: raw.venue || raw.location || '场地待定', refereeName: raw.refereeName || raw.referee || '待指派', submittedText: record.submittedAt ? String(record.submittedAt) : '待提交' }, record: { eventsText: String(record.eventCount || 0) + ' 条事件', reportText: raw.refereeReportStatus === 'submitted' ? '已完成' : '待提交', signatureText: raw.refereeSignature ? '已完成' : '待签字' }, canReview: raw.refereeReviewStatus === 'under_review' && !!raw.refereeRecordLocked })
    }).catch(function (error) { that.setData({ loading: false, errorText: error.message || '赛果复核加载失败' }) })
  },
  onReasonInput: function (e) { this.setData({ reason: e.detail.value || '' }) },
  submitReview: function (operation) {
    if (this.data.visualQa) { wx.showToast({ title: '视觉验收状态不提交复核', icon: 'none' }); return }
    var that = this
    if (!this.data.canReview || this.data.submitting) return
    if (operation === 'return' && !String(this.data.reason || '').trim()) { wx.showToast({ title: '请填写退回原因', icon: 'none' }); return }
    this.setData({ submitting: true })
    wx.cloud.callFunction({ name: 'getMiniWorkspace', data: { action: 'reviewRefereeRecord', workspaceId: this.data.workspaceId, matchId: this.data.matchId, operation: operation, reason: this.data.reason, fields: operation === 'return' ? ['event_player'] : [] } }).then(function (res) { var result = res.result || {}; if (!result.success) throw new Error(result.message || result.error || '复核失败'); wx.showToast({ title: result.message || '操作成功', icon: 'success' }); that.loadReview() }).catch(function (error) { wx.showToast({ title: error.message || '复核失败', icon: 'none' }) }).finally(function () { that.setData({ submitting: false }) })
  },
  onArchiveTap: function () { var that = this; wx.showModal({ title: '确认归档', content: '归档后裁判电子记录保持不可修改。', confirmColor: '#197451', success: function (res) { if (res.confirm) that.submitReview('archive') } }) },
  onReturnTap: function () { this.submitReview('return') },
  onBackTap: function () { wx.navigateBack() },
  loadVisualFixture: function () { this.setData({ loading:false, visualQa:true, matchId:'visual-match', workspaceId:'visual-workspace', canReview:true, match:{divisionText:'U12组 · 小组赛第3轮',recordNumber:'裁判记录 #20260802-012',homeName:'赛小蜂 U12',awayName:'洛阳龙门 U12',homeScore:'2',awayScore:'1',venueText:'1号场 · 8月2日 10:30',refereeName:'张裁判',submittedText:'2026-08-02 12:08'},record:{eventsText:'3 条事件',reportText:'已完成',signatureText:'已完成'} }) }
})
