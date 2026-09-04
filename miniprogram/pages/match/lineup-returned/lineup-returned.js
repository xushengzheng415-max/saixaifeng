var workspace = require('../../../utils/workspace')

Page({
  data: { matchId: '', teamId: '', loading: true, match: {}, lineup: {}, starterCount: 0, substituteCount: 0, returnReason: '请按退回原因修改后重新提交。', returnedAtText: '时间待定', isDevtools: false, problemPlayer: {} },
  onLoad: function (options) { var query = options || {}; var qa = workspace.isVisualQaEnabled(query); this.setData({ matchId: String(query.matchId || ''), teamId: String(query.teamId || ''), isDevtools: qa }); if (qa) { this.setData({ loading: false, match: { divisionName: 'U12组 · 第3轮', homeTeamName: '赛小蜂U12', awayTeamName: '郑州星锐U12', matchDate: '8月3日 15:30', venue: '2号场', homeLogo: '/images/runtime/icons/brand-v1-tab-team.png' }, starterCount: 7, substituteCount: 5, returnReason: '7号球员本场停赛，请更换首发球员。', returnedAtText: '8月3日 12:18', problemPlayer: { name: '王小蜂', avatarText: '王', position: '首发 · 前锋', jersey: '7' } }); return } this.load() },
  load: function () {
    var self = this, context = workspace.readContext() || {}
    wx.cloud.callFunction({ name: 'getMiniWorkspace', data: { action: 'matchLineup', workspaceId: (context.currentWorkspace || {}).id, matchId: this.data.matchId, teamId: this.data.teamId } })
      .then(function (res) { var result = res.result || {}, lineup = result.lineup || {}; if (!result.success || lineup.status !== 'returned') throw new Error(result.message || '未找到退回阵容'); self.setData({ loading: false, match: result.match || {}, lineup: lineup, starterCount: (lineup.starters || []).length, substituteCount: (lineup.substitutes || []).length, returnReason: lineup.returnReason || '请按退回原因修改后重新提交。', returnedAtText: lineup.submittedAtText || '时间待定', problemPlayer: { name: '待替换球员', avatarText: '球', position: '当前阵容位置', jersey: '!' } }) })
      .catch(function (error) { self.setData({ loading: false }); wx.showToast({ title: error.message || '加载失败', icon: 'none' }) })
  },
  edit: function () { wx.redirectTo({ url: '/pages/match/squad/squad?matchId=' + encodeURIComponent(this.data.matchId) + '&teamId=' + encodeURIComponent(this.data.teamId) }) },
  history: function () { wx.showToast({ title: '当前显示的是最近一次退回记录', icon: 'none' }) },
  back: function () { wx.navigateBack() }
})
