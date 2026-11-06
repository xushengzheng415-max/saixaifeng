const db = wx.cloud.database()

function rankRows(rows, mapper) {
  return (rows || []).map(mapper).sort(function (left, right) {
    return Number(right.primary || 0) - Number(left.primary || 0) || Number(right.secondary || 0) - Number(left.secondary || 0)
  }).slice(0, 20).map(function (item, index) {
    item.rank = index + 1
    return item
  })
}

Page({
  data: {
    tournamentId: '', loading: true, errorText: '',
    standings: [], hasStandings: false,
    players: [], hasPlayers: false,
    discipline: [], hasDiscipline: false
  },

  onLoad: function (options) {
    this.setData({ tournamentId: String((options || {}).id || '') })
    this.load()
  },

  load: function () {
    var self = this
    if (!this.data.tournamentId) {
      this.setData({ loading: false, errorText: '缺少赛事信息' })
      return
    }
    this.setData({ loading: true, errorText: '' })
    Promise.all([
      db.collection('standings').where({ tournamentId: this.data.tournamentId }).limit(200).get().catch(function () { return { data: [] } }),
      db.collection('match_events').where({ tournamentId: this.data.tournamentId }).limit(500).get().catch(function () { return { data: [] } })
    ]).then(function (results) {
      var standingRows = results[0].data || []
      var events = results[1].data || []
      var players = {}
      var discipline = {}
      events.forEach(function (event) {
        var name = String(event.playerName || '')
        var type = String(event.type || '').toLowerCase()
        if (!name) return
        if (!players[name]) players[name] = { name: name, goals: 0, assists: 0 }
        if (type === 'goal') players[name].goals += 1
        if (type === 'assist') players[name].assists += 1
        if (['yellow_card', 'yellow', 'yellowcard'].indexOf(type) >= 0) {
          if (!discipline[name]) discipline[name] = { name: name, yellowCards: 0, redCards: 0 }
          discipline[name].yellowCards += 1
        }
        if (['red_card', 'red', 'redcard', 'second_yellow'].indexOf(type) >= 0) {
          if (!discipline[name]) discipline[name] = { name: name, yellowCards: 0, redCards: 0 }
          discipline[name].redCards += 1
        }
      })
      var standings = rankRows(standingRows, function (item) {
        return {
          teamName: item.teamName || '未命名球队', points: Number(item.points || 0), played: Number(item.played || item.matches || 0), goalDiff: Number(item.goalDiff || 0), primary: Number(item.points || 0), secondary: Number(item.goalDiff || 0)
        }
      })
      var playerRows = rankRows(Object.keys(players).map(function (key) { return players[key] }), function (item) {
        return { name: item.name, goals: item.goals, assists: item.assists, primary: item.goals, secondary: item.assists }
      })
      var disciplineRows = rankRows(Object.keys(discipline).map(function (key) { return discipline[key] }), function (item) {
        return { name: item.name, yellowCards: item.yellowCards, redCards: item.redCards, primary: item.redCards, secondary: item.yellowCards }
      })
      self.setData({ loading: false, standings: standings, hasStandings: standings.length > 0, players: playerRows, hasPlayers: playerRows.length > 0, discipline: disciplineRows, hasDiscipline: disciplineRows.length > 0 })
    }).catch(function () {
      self.setData({ loading: false, errorText: '', standings: [], hasStandings: false, players: [], hasPlayers: false, discipline: [], hasDiscipline: false })
    })
  },

  onPullDownRefresh: function () {
    this.load()
    wx.stopPullDownRefresh()
  },

  back: function () { wx.navigateBack({ fail: function () { wx.switchTab({ url: '/pages/event/index' }) } }) }
})
