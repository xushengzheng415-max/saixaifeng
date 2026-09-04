var workspace = require('../../../utils/workspace')

Page({
  data: { matchId: '', teamId: '', loading: true, match: {}, lineup: {}, starterCount: 0, substituteCount: 0, submittedAtText: '刚刚', canViewSnapshot: false, isDevtools: false },
  onLoad: function (options) {
    var query = options || {}
    var qa = workspace.isVisualQaEnabled(query)
    this.setData({ matchId: String(query.matchId || ''), teamId: String(query.teamId || ''), isDevtools: qa })
    if (qa) { this.setData({ loading: false, match: { divisionName: 'U12组 · 第3轮', homeTeamName: '赛小蜂 U12', awayTeamName: '郑州星锐 U12', matchDate: '8月3日 15:30', venue: '2号场' }, lineup: { status: 'submitted' }, starterCount: 8, substituteCount: 5, submittedAtText: '8月3日 12:06', canViewSnapshot: true }); return }
    this.load()
  },
  load: function () {
    var self = this
    var context = workspace.readContext() || {}
    wx.cloud.callFunction({ name: 'getMiniWorkspace', data: { action: 'matchLineup', workspaceId: (context.currentWorkspace || {}).id, matchId: this.data.matchId, teamId: this.data.teamId } })
      .then(function (res) {
        var result = res.result || {}
        if (!result.success || !result.lineup) throw new Error(result.message || '未找到已提交阵容')
        if (result.lineup.status === 'returned') { wx.redirectTo({ url: '/pages/match/lineup-returned/lineup-returned?matchId=' + encodeURIComponent(self.data.matchId) + '&teamId=' + encodeURIComponent(self.data.teamId) }); return }
        var lineup = result.lineup || {}
        self.setData({ loading: false, match: result.match || {}, lineup: lineup, starterCount: (lineup.starters || []).length, substituteCount: (lineup.substitutes || []).length, submittedAtText: lineup.submittedAtText || '时间待定', canViewSnapshot: lineup.status === 'submitted' || lineup.status === 'locked' })
      })
      .catch(function (error) { self.setData({ loading: false }); wx.showToast({ title: error.message || '加载失败', icon: 'none' }) })
  },
  viewSnapshot: function () { wx.redirectTo({ url: '/pages/match/squad/squad?matchId=' + encodeURIComponent(this.data.matchId) + '&teamId=' + encodeURIComponent(this.data.teamId) }) },
  backToMatch: function () { wx.redirectTo({ url: '/pages/match/detail/detail?matchId=' + encodeURIComponent(this.data.matchId) }) },
  back: function () { wx.navigateBack() }
})
