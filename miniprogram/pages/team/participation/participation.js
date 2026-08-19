var workspace = require('../../../utils/workspace')

function fixture() {
  return {
    team: { name: '赛小蜂 U12 竞技队', logo: '/images/runtime/icons/brand-v1-tab-team.png' },
    items: [
      { id: 'a', name: '2026 河南青少年足球冠军联赛', divisionName: 'U12组', divisionId: 'qa-division-u12', statusText: '已确认', statusClass: 'state-ok', rosterText: '18/20 已审核', nextMatchText: '8月2日 10:30\nvs 洛阳龙门U12', tournamentId: 'qa-tournament-001', nextMatchId: 'qa-match-001', actionText: '进入赛事', actionClass: 'event-primary' },
      { id: 'b', name: '2026 郑州市青少年邀请赛', divisionName: 'U12组', divisionId: 'qa-division-u12', statusText: '待确认', statusClass: 'state-wait', rosterText: '报名截止\n8月15日', nextMatchText: '资料提交\n确认参赛后提交正式名单', tournamentId: 'qa-tournament-002', actionText: '确认参赛', actionClass: 'event-secondary' }
    ]
  }
}

function buildFilters(mode, rows) {
  var progress = rows.filter(function (item) { return item.nextMatchId }).length
  var signup = rows.length - progress
  return [
    { id: 'all', label: '全部 ' + rows.length, className: mode === 'all' ? 'event-filter active' : 'event-filter' },
    { id: 'progress', label: '进行中 ' + progress, className: mode === 'progress' ? 'event-filter active' : 'event-filter' },
    { id: 'signup', label: '报名中 ' + signup, className: mode === 'signup' ? 'event-filter active' : 'event-filter' }
  ]
}

Page({
  data: { teamId: '', loading: true, team: {}, items: [], eventCount: 0, visible: [], filters: [], activeFilter: 'all', isDevtools: false },
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
    var visible = all.filter(function (item) { return mode === 'all' || (mode === 'progress' && item.nextMatchId) || (mode === 'signup' && !item.nextMatchId) })
    this.setData({ visible: visible, filters: buildFilters(mode, all) })
  },
  choose: function (event) {
    this.setData({ activeFilter: event.currentTarget.dataset.id })
    this.filter()
  },
  open: function (event) {
    var item = event.currentTarget.dataset.item
    if (!item || !item.tournamentId) return
    var url = '/pages/tournament/detail/detail?id=' + encodeURIComponent(item.tournamentId) + '&teamId=' + encodeURIComponent(this.data.teamId)
    if (item.divisionId) url += '&divisionId=' + encodeURIComponent(item.divisionId)
    wx.navigateTo({ url: url })
  },
  openMatch: function (event) {
    var matchId = event.currentTarget.dataset.id
    if (matchId) wx.navigateTo({ url: '/pages/match/squad/squad?matchId=' + encodeURIComponent(matchId) + '&teamId=' + encodeURIComponent(this.data.teamId) })
  },
  back: function () {
    wx.navigateBack({ fail: function () { wx.switchTab({ url: '/pages/teams/index' }) } })
  }
})
