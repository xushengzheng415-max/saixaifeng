var workspace = require('../../../utils/workspace')

// 名单行只在 js 里预计算，wxml 不做比较或方法调用。
function lineupRows(list) {
  return (list || []).map(function (item, index) {
    var row = item || {}
    var number = String(row.number || row.jerseyNumber || '')
    return {
      key: String(row.playerId || row.id || index),
      number: number,
      name: String(row.name || row.playerName || '未命名球员'),
      positionText: String(row.positionText || row.positionName || row.position || '')
    }
  })
}

Page({
  data: { matchId: '', teamId: '', loading: true, match: {}, lineup: {}, starterCount: 0, substituteCount: 0, formationText: '', hasFormation: false, hasLineupRows: false, starterRows: [], substituteRows: [], submittedAtText: '刚刚', canViewSnapshot: false, isDevtools: false },
  onLoad: function (options) {
    var query = options || {}
    var qa = workspace.isVisualQaEnabled(query)
    this.setData({ matchId: String(query.matchId || ''), teamId: String(query.teamId || ''), isDevtools: qa })
    if (qa) {
      this.setData({
        loading: false,
        match: { divisionName: 'U12组 · 第3轮', homeTeamName: '赛小蜂 U12', awayTeamName: '郑州星锐 U12', matchDate: '8月3日 15:30', venue: '2号场' },
        lineup: { status: 'submitted', formation: '2-3-2' },
        starterCount: 8,
        substituteCount: 5,
        formationText: '2-3-2',
        hasFormation: true,
        hasLineupRows: true,
        starterRows: [{ key: '1', number: '1', name: '王梓轩', positionText: '门将' }],
        substituteRows: [{ key: '2', number: '12', name: '李承泽', positionText: '后卫' }],
        submittedAtText: '8月3日 12:06',
        canViewSnapshot: true
      })
      return
    }
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
        var starterRows = lineupRows(lineup.starters)
        var substituteRows = lineupRows(lineup.substitutes)
        var formationText = String(lineup.formation || lineup.formationName || '')
        self.setData({
          loading: false,
          match: result.match || {},
          lineup: lineup,
          starterCount: (lineup.starters || []).length,
          substituteCount: (lineup.substitutes || []).length,
          formationText: formationText,
          hasFormation: formationText.length > 0,
          hasLineupRows: starterRows.length > 0 || substituteRows.length > 0,
          starterRows: starterRows,
          substituteRows: substituteRows,
          submittedAtText: lineup.submittedAtText || '时间待定',
          canViewSnapshot: lineup.status === 'submitted' || lineup.status === 'locked'
        })
      })
      .catch(function (error) { self.setData({ loading: false }); wx.showToast({ title: error.message || '加载失败', icon: 'none' }) })
  },
  viewSnapshot: function () { wx.redirectTo({ url: '/pages/match/squad/squad?matchId=' + encodeURIComponent(this.data.matchId) + '&teamId=' + encodeURIComponent(this.data.teamId) }) },
  backToMatch: function () { wx.redirectTo({ url: '/pages/match/detail/detail?matchId=' + encodeURIComponent(this.data.matchId) }) },
  back: function () { wx.navigateBack() }
})
