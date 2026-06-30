const db = wx.cloud.database()

Page({
  data: {
    tournamentId: '',
    tournamentName: '',
    teams: [],
    teamsLen: 0,
    hasTeamsLen: false,
    loading: true,
    errorMsg: ''
  },

  onLoad(options) {
    if (options && options.id) {
      this.setData({ tournamentId: options.id })
      this.loadData()
    }
  },

  loadData() {
    var that = this
    try { wx.cloud.init({ env: 'cloud1-7g8ckb3c7815a011', traceUser: false }) } catch(e) {}

    // 先获取赛事名称
    db.collection('tournaments').doc(that.data.tournamentId).get({
      success(res) {
        that.setData({ tournamentName: (res.data && res.data.name) || '' })
      }
    })

    // 获取参赛球队（已通过的）
    db.collection('tournament_teams')
      .where({ tournamentId: that.data.tournamentId, status: 'approved' })
      .get({
        success(res) {
          var teams = (res.data || []).map(function(t) {
            return {
              _id: t._id,
              teamId: t.teamId,
              teamName: t.teamName || t.name || '未知球队',
              teamLogo: t.teamLogo || t.logo || '',
              teamCity: t.teamCity || t.city || '',
              playerCount: t.playerCount || 0,
              firstChar: (t.teamName || '?').charAt(0)
            }
          })
          var len = teams.length
          that.setData({ teams: teams, teamsLen: len, hasTeamsLen: len > 0, loading: false })
        },
        fail() {
          that.setData({ loading: false, errorMsg: '加载失败' })
        }
      })
  }
})
