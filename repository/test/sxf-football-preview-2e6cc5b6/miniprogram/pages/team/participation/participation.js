var workspace = require('../../../utils/workspace')

function fixture() {
  return {
    team: { name: '赛小蜂 U12 竞技队', logo: '/images/runtime/icons/brand-v1-tab-team.png' },
    items: [
      { id: 'a', name: '2026 河南青少年足球冠军联赛', divisionName: 'U12组', divisionId: 'qa-division-u12', statusText: '已参赛', statusClass: 'state-ok', rosterText: '正式名单已审核', matchCount: 2, hasMatches: true, competitionStatus: 'not_started', matches: [{ id: 'qa-match-001', dateText: '8月2日', timeText: '10:30', opponentName: '洛阳龙门U12', sideText: '主场', roundText: '小组赛第3轮', venueText: '1号场', statusText: '待开始', statusClass: 'match-status-wait', canSubmitLineup: true }, { id: 'qa-match-002', dateText: '8月9日', timeText: '15:00', opponentName: '中原雄鹰U12', sideText: '客场', roundText: '小组赛第4轮', venueText: '2号场', statusText: '待开始', statusClass: 'match-status-wait', canSubmitLineup: true }], tournamentId: 'qa-tournament-001', actionText: '查看赛事', actionClass: 'event-secondary' },
      { id: 'b', name: '2026 郑州市青少年邀请赛', divisionName: 'U12组', divisionId: 'qa-division-u12', statusText: '待确认', statusClass: 'state-wait', rosterText: '尚未提交正式名单', matchCount: 0, hasMatches: false, competitionStatus: 'not_started', matches: [], tournamentId: 'qa-tournament-002', actionText: '查看赛事', actionClass: 'event-secondary' }
    ]
  }
}

function buildFilters(mode, rows) {
  var counts = { not_started: 0, ongoing: 0, completed: 0 }
  rows.forEach(function (item) { counts[item.competitionStatus || 'not_started'] = Number(counts[item.competitionStatus || 'not_started'] || 0) + 1 })
  return [
    { id: 'not_started', label: '待开始 ' + counts.not_started, className: mode === 'not_started' ? 'event-filter active' : 'event-filter' },
    { id: 'ongoing', label: '进行中 ' + counts.ongoing, className: mode === 'ongoing' ? 'event-filter active' : 'event-filter' },
    { id: 'completed', label: '已完赛 ' + counts.completed, className: mode === 'completed' ? 'event-filter active' : 'event-filter' }
  ]
}

Page({
  data: { teamId: '', loading: true, team: {}, items: [], eventCount: 0, visible: [], filters: [], activeFilter: 'not_started', isDevtools: false },
  onLoad: function (options) {
    var query = options || {}
    var isDevtools = workspace.isVisualQaEnabled(query)
    this.setData({ teamId: String(query.teamId || ''), isDevtools: isDevtools })
    if (isDevtools) {
      var local = fixture()
      this.setData({ loading: false, team: local.team, items: local.items, eventCount: local.items.length })
      this.filter()
      return
    }
    this.load()
  },
  load: function () {
    var self = this
    var context = workspace.readContext() || {}
    wx.cloud.callFunction({ name: 'getMiniWorkspace', data: { action: 'teamParticipation', workspaceId: (context.currentWorkspace || {}).id, teamId: this.data.teamId } }).then(function (response) {
      var result = response.result || {}
      if (!result.success) throw new Error(result.message || '参赛记录加载失败')
      var rows = result.items || []
      self.setData({ loading: false, team: result.team || {}, items: rows, eventCount: rows.length })
      self.filter()
    }).catch(function (error) {
      self.setData({ loading: false })
      wx.showToast({ title: error.message || '参赛记录加载失败', icon: 'none' })
    })
  },
  filter: function () {
    var all = this.data.items || []
    var mode = this.data.activeFilter
    var visible = all.filter(function (item) { return String(item.competitionStatus || 'not_started') === mode })
    this.setData({ visible: visible, filters: buildFilters(mode, all) })
  },
  choose: function (event) {
    this.setData({ activeFilter: event.currentTarget.dataset.id })
    this.filter()
  },
  open: function (event) {
    var tournamentId = String(event.currentTarget.dataset.tournament || '')
    var divisionId = String(event.currentTarget.dataset.division || '')
    if (!tournamentId) return
    var url = '/pages/tournament/detail/detail?id=' + encodeURIComponent(tournamentId) + '&teamId=' + encodeURIComponent(this.data.teamId)
    if (divisionId) url += '&divisionId=' + encodeURIComponent(divisionId)
    wx.navigateTo({ url: url })
  },
  openMatchDetail: function (event) {
    var matchId = String(event.currentTarget.dataset.id || '')
    if (matchId) wx.navigateTo({ url: '/pages/match/detail/detail?matchId=' + encodeURIComponent(matchId) })
  },
  openMatch: function (event) {
    var matchId = event.currentTarget.dataset.id
    if (matchId) wx.navigateTo({ url: '/pages/match/squad/squad?matchId=' + encodeURIComponent(matchId) + '&teamId=' + encodeURIComponent(this.data.teamId) })
  },
  back: function () {
    wx.navigateBack({ fail: function () { wx.switchTab({ url: '/pages/teams/index' }) } })
  }
})
