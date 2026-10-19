var workspace = require('../../utils/workspace')

Page({
  data: {
    tournamentId: '',
    divisionId: '',
    loading: true,
    errorText: '',
    tournament: {},
    standings: [],
    goalsRanking: [],
    yellowCards: [],
    redCards: [],
    activeTab: 'standings',
    tabs: [],
    visibleRows: [],
    hasVisibleRows: false,
    showStandingsHead: true,
    emptyText: '暂无积分数据'
  },

  onLoad: function (options) {
    this.setData({ tournamentId: String((options || {}).id || ''), divisionId: String((options || {}).divisionId || '') })
    if (this.data.tournamentId) this.loadData()
    else this.setData({ loading: false, errorText: '缺少赛事信息' })
  },

  onShow: function () {
    if (this.data.tournamentId && !this.data.loading) this.loadData(true)
  },

  loadData: function (silent) {
    var self = this
    var context = workspace.readContext() || {}
    if (!silent) this.setData({ loading: true, errorText: '' })
    return wx.cloud.callFunction({
      name: 'getMiniWorkspace',
      data: { action: 'tournamentData', workspaceId: (context.currentWorkspace || {}).id || '', tournamentId: this.data.tournamentId, divisionId: this.data.divisionId }
    }).then(function (response) {
      var result = response.result || {}
      if (!result.success) throw new Error(result.message || '赛事数据加载失败')
      var standings = (result.standings || []).map(function (item, index) { return Object.assign({}, item, { rankText: String(item.rank || index + 1), pointsText: String(item.points || 0), recordText: String(item.wins || 0) + '胜 ' + String(item.draws || 0) + '平 ' + String(item.losses || 0) + '负' }) })
      var goals = (result.goalsRanking || []).map(function (item) { return Object.assign({}, item, { countText: String(item.count || 0) }) })
      var yellow = (result.yellowCards || []).map(function (item) { return Object.assign({}, item, { countText: String(item.count || 0) }) })
      var red = (result.redCards || []).map(function (item) { return Object.assign({}, item, { countText: String(item.count || 0) }) })
      self.setData({ loading: false, errorText: '', tournament: result.tournament || {}, standings: standings, goalsRanking: goals, yellowCards: yellow, redCards: red }, self.applyTab)
    }).catch(function (error) {
      self.setData({ loading: false, errorText: error.message || '赛事数据加载失败' })
    })
  },

  applyTab: function () {
    var tabs = [
      { id: 'standings', label: '积分榜', count: this.data.standings.length },
      { id: 'goals', label: '进球榜', count: this.data.goalsRanking.length },
      { id: 'red', label: '红牌榜', count: this.data.redCards.length },
      { id: 'yellow', label: '黄牌榜', count: this.data.yellowCards.length }
    ].map(function (item) { return Object.assign({}, item, { className: item.id === this.data.activeTab ? 'data-tab data-tab-active' : 'data-tab' }) }.bind(this))
    var rows = this.data.activeTab === 'goals' ? this.data.goalsRanking : (this.data.activeTab === 'red' ? this.data.redCards : (this.data.activeTab === 'yellow' ? this.data.yellowCards : this.data.standings))
    var isStandings = this.data.activeTab === 'standings'
    rows = rows.map(function (item, index) {
      return Object.assign({}, item, {
        displayRank: isStandings ? String(item.rankText || index + 1) : String(index + 1),
        displayName: isStandings ? String(item.teamName || '球队待定') : String(item.playerName || '球员'),
        secondaryText: isStandings ? String(item.recordText || '') : String(item.teamName || ''),
        showPlayed: isStandings,
        showRecord: isStandings,
        showPoints: isStandings,
        showCount: !isStandings
      })
    })
    var emptyText = this.data.activeTab === 'standings' ? '暂无积分数据' : (this.data.activeTab === 'goals' ? '暂无进球记录' : (this.data.activeTab === 'red' ? '暂无红牌记录' : '暂无黄牌记录'))
    this.setData({ tabs: tabs, visibleRows: rows, hasVisibleRows: rows.length > 0, showStandingsHead: isStandings, emptyText: emptyText })
  },

  selectTab: function (event) {
    var tab = event.currentTarget.dataset.id || 'standings'
    this.setData({ activeTab: tab }, this.applyTab)
  },

  back: function () { workspace.navigateBackOrHome() }
})
