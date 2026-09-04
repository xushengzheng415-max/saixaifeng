// pages/tournament/schedule/schedule.js
// 赛程安排 - 全新简约Tab布局 - 单行卡片
const db = wx.cloud.database()
const workspace = require('../../../utils/workspace')

Page({
  data: {
    currentTab: 'schedule',   // 'schedule' | 'results' | 'standings'
    scheduleTabClass: 'tab-active',
    standingsTabClass: '',
    resultsTabClass: '',
    isScheduleTab: true,
    isStandingsTab: false,
    isResultsTab: false,
    tournamentId: '',
    tournamentName: '',
    tournamentType: '',
    typeText: '',
    formatText: '',
    teamsLen: 0,
    matches: [],
    resultMatches: [],
    groupedMatches: [],
    loading: true,
    errorMsg: '',
    showError: false,
    showContent: false,
    hasNoMatches: false,
    hasResults: false,
    visualQa: false
  },

  onLoad(options) {
    if (workspace.isVisualQaEnabled(options)) { this.loadVisualFixture(); return }
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
      resultsTabClass: tab === 'results' ? 'tab-active' : '',
      isScheduleTab: tab === 'schedule',
      isStandingsTab: tab === 'standings',
      isResultsTab: tab === 'results'
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
          var sourceMatches = (res.data || []).slice().sort(function(a, b) {
            var aKey = String(a.matchDate || '') + ' ' + String(a.matchTime || '')
            var bKey = String(b.matchDate || '') + ' ' + String(b.matchTime || '')
            return aKey.localeCompare(bKey)
          })
          var allMatches = sourceMatches.map(function(m) {
            var hasScores = (m.homeScore !== undefined && m.homeScore !== null && m.awayScore !== undefined && m.awayScore !== null)
            var hasRealScore = hasScores && ((m.homeScore > 0) || (m.awayScore > 0))
            var isFinished = !!(m.status === 'finished' || m.status === 'completed' || hasRealScore)
            var timeStr = m.matchTime || ''
            if (timeStr && timeStr.length >= 16) {
              var d = timeStr.substring(5, 10).replace('-', '/')
              var t = timeStr.substring(11, 16)
              timeStr = d + ' ' + t
            } else if (m.matchDate && timeStr) {
              timeStr = String(m.matchDate).substring(5, 10).replace('-', '/') + ' ' + timeStr
            }
            var homeDisplayScore = isFinished ? String(m.homeScore) : '-'
            var awayDisplayScore = isFinished ? String(m.awayScore) : '-'

            return {
              _id: m._id,
              matchTime: timeStr,
              matchTimeText: timeStr || '时间待定',
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
              round: m.roundName || (m.round ? '第' + m.round + '轮' : (m.matchDay || '其他比赛')),
              venue: m.venue || m.location || '',
              isFinished: isFinished,
              homeWinnerClass: isFinished && m.homeScore > m.awayScore ? 'mc-winner' : '',
              awayWinnerClass: isFinished && m.awayScore > m.homeScore ? 'mc-winner' : '',
              scoreWrapClass: isFinished ? 'sc-done' : 'sc-pending',
              statusText: isFinished ? '已结束' : (m.status === 'ongoing' ? '进行中' : '待开始'),
              actionText: isFinished ? '查看归档' : (m.status === 'ongoing' ? '查看现场进度' : '查看场次'),
              actionClass: isFinished ? 'archived' : (m.status === 'ongoing' ? 'live' : 'upcoming')
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
            resultMatches: allMatches.filter(function(item) { return item.isFinished }),
            groupedMatches: groups,
            loading: false,
            errorMsg: '',
            showError: false,
            showContent: true,
            hasNoMatches: allMatches.length === 0,
            hasResults: allMatches.some(function(item) { return item.isFinished }),
          })
        },
        fail(err) {
          that.setData({ loading: false, errorMsg: '加载失败', showError: true, showContent: false })
        }
      })
  },

  onMatchTap(e) {
    var id = e.currentTarget.dataset.id
    var isFinished = !!e.currentTarget.dataset.finished
    if (id) {
      var context = workspace.readContext() || {}
      if (workspace.hasPermission('event.manage', context)) {
        if (isFinished) {
          wx.navigateTo({ url: '/pages/tournament/review/review?matchId=' + id + '&tournamentId=' + this.data.tournamentId })
          return
        }
        wx.navigateTo({ url: '/pages/tournament/monitor/monitor?matchId=' + id + '&tournamentId=' + this.data.tournamentId })
        return
      }
      wx.navigateTo({ url: '/pages/match/detail/detail?matchId=' + id })
    }
  },
  loadVisualFixture() {
    var first = { _id:'m1', matchTimeText:'8月2日 10:30', homeTeamName:'赛小蜂 U12 竞技队', awayTeamName:'洛阳龙门 U12', homeFirstChar:'赛', awayFirstChar:'洛', homeDisplayScore:'2', awayDisplayScore:'1', isFinished:true, homeWinnerClass:'mc-winner', awayWinnerClass:'', scoreWrapClass:'sc-done', statusText:'已结束', actionText:'查看归档', actionClass:'archived' }
    var second = { _id:'m2', matchTimeText:'8月2日 14:00', homeTeamName:'郑州绿城 U12', awayTeamName:'金水青训 U12', homeFirstChar:'郑', awayFirstChar:'金', homeDisplayScore:'-', awayDisplayScore:'-', isFinished:false, homeWinnerClass:'', awayWinnerClass:'', scoreWrapClass:'sc-pending', statusText:'待开始', actionText:'查看场次', actionClass:'upcoming' }
    var live = { _id:'m3', matchTimeText:'8月2日 16:30', homeTeamName:'维鹰 U12', awayTeamName:'黄河少年 U12', homeFirstChar:'维', awayFirstChar:'黄', homeDisplayScore:'1', awayDisplayScore:'0', isFinished:false, homeWinnerClass:'', awayWinnerClass:'', scoreWrapClass:'sc-pending', statusText:'进行中', actionText:'查看现场进度', actionClass:'live' }
    this.setData({ visualQa:true, loading:false, tournamentId:'visual-pro', tournamentName:'2026 河南青少年足球冠军联赛', typeText:'PRO · U12', formatText:'8人制', teamsLen:16, matches:[first,second,live], resultMatches:[first], groupedMatches:[{round:'小组赛 第 3 轮',matches:[first,second,live]}], showContent:true, hasNoMatches:false, hasResults:true })
  }
})



