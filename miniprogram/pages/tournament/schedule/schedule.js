// pages/tournament/schedule/schedule.js
// 赛程安排 - 全新简约Tab布局 - 单行卡片
const db = wx.cloud.database()

Page({
  data: {
    currentTab: 'schedule',   // 'schedule' | 'standings' | 'stats'
    scheduleTabClass: 'tab-active',
    standingsTabClass: '',
    statsTabClass: '',
    isScheduleTab: true,
    isStandingsTab: false,
    isStatsTab: false,
    tournamentId: '',
    tournamentName: '',
    tournamentType: '',
    typeText: '',
    formatText: '',
    teamsLen: 0,
    matches: [],
    groupedMatches: [],
    loading: true,
    errorMsg: '',
    showError: false,
    showContent: false,
    hasNoMatches: false
  },

  onLoad(options) {
    if (options && options.id) {
      this.setData({ tournamentId: options.id })
      this.loadData()
    }
  },

  // Tab 切换
  switchTab(e) {
    var tab = e.currentTarget.dataset.tab
    if (this.data.currentTab === tab) return
    this.setData({
      currentTab: tab,
      scheduleTabClass: tab === 'schedule' ? 'tab-active' : '',
      standingsTabClass: tab === 'standings' ? 'tab-active' : '',
      statsTabClass: tab === 'stats' ? 'tab-active' : '',
      isScheduleTab: tab === 'schedule',
      isStandingsTab: tab === 'standings',
      isStatsTab: tab === 'stats'
    })
  },

  loadData() {
    var that = this
    that.setData({ loading: true, errorMsg: '', showError: false, showContent: false })
    try { wx.cloud.init({ env: 'cloud1-7g8ckb3c7815a011', traceUser: false }) } catch(e) {}

    // 1. 加载赛事信息
    db.collection('tournaments').doc(that.data.tournamentId).get({
      success(res) {
        var t = res.data || {}
        var typeNames = { tournament: '赛会制', cup: '杯赛制', league: '联赛制', combined: '复合制' }
        var formatNames = { '11side': '11人制', '8side': '8人制', '7side': '7人制', '5side': '5人制' }
        that.setData({
          tournamentName: t.name || '',
          tournamentType: t.type || '',
          typeText: typeNames[t.type] || t.type || '',
          formatText: formatNames[t.matchFormat] || t.matchFormat || ''
        })
      }
    })

    // 2. 加载球队数
    db.collection('tournament_teams')
      .where({ tournamentId: that.data.tournamentId, status: 'approved' })
      .count()
      .then(function(res) {
        that.setData({ teamsLen: res.total || 0 })
      })

    // 3. 加载比赛列表
    db.collection('matches')
      .where({ tournamentId: that.data.tournamentId })
      .orderBy('matchTime', 'asc')
      .get({
        success(res) {
          var allMatches = (res.data || []).map(function(m) {
            var hasScores = (m.homeScore !== undefined && m.homeScore !== null && m.awayScore !== undefined && m.awayScore !== null)
            var hasRealScore = hasScores && ((m.homeScore > 0) || (m.awayScore > 0))
            var isFinished = !!(m.status === 'finished' || m.status === 'completed' || hasRealScore)
            var timeStr = m.matchTime || ''
            if (timeStr && timeStr.length >= 16) {
              var d = timeStr.substring(5, 10).replace('-', '/')
              var t = timeStr.substring(11, 16)
              timeStr = d + ' ' + t
            }
            var homeDisplayScore = isFinished ? String(m.homeScore) : '-'
            var awayDisplayScore = isFinished ? String(m.awayScore) : '-'

            return {
              _id: m._id,
              matchTime: timeStr,
              homeTeamName: m.homeTeamName || '',
              awayTeamName: m.awayTeamName || '',
              homeTeamLogo: m.homeTeamLogo || m.homeLogo || '',
              awayTeamLogo: m.awayTeamLogo || m.awayLogo || '',
              homeFirstChar: (m.homeTeamName || '?').charAt(0),
              awayFirstChar: (m.awayTeamName || '?').charAt(0),
              homeScore: m.homeScore,
              awayScore: m.awayScore,
              homeDisplayScore: homeDisplayScore,
              awayDisplayScore: awayDisplayScore,
              round: m.round || m.matchDay || '',
              venue: m.venue || m.location || '',
              isFinished: isFinished,
              homeWinnerClass: isFinished && m.homeScore > m.awayScore ? 'mc-winner' : '',
              awayWinnerClass: isFinished && m.awayScore > m.homeScore ? 'mc-winner' : '',
              scoreWrapClass: isFinished ? 'sc-done' : 'sc-pending'
            }
          })

          // 按轮次分组
          var groups = []
          var currentRound = ''
          var currentGroup = null
          for (var i = 0; i < allMatches.length; i++) {
            var r = allMatches[i].round
            if (r !== currentRound) {
              currentRound = r
              currentGroup = { round: r, matches: [] }
              groups.push(currentGroup)
            }
            currentGroup.matches.push(allMatches[i])
          }

          that.setData({
            matches: allMatches,
            groupedMatches: groups,
            loading: false,
            errorMsg: '',
            showError: false,
            showContent: true,
            hasNoMatches: allMatches.length === 0,
          })
        },
        fail(err) {
          that.setData({ loading: false, errorMsg: '加载失败', showError: true, showContent: false })
        }
      })
  },

  onMatchTap(e) {
    var id = e.currentTarget.dataset.id
    if (id) {
      wx.navigateTo({ url: '/pages/match/detail/detail?matchId=' + id })
    }
  }
})



