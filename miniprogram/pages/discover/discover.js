// pages/discover/discover.js
// 发现 tab：记一场（唯一主操作）+ 同城赛事预告 + 球队动态
// 约束：WXML 只做简单插值，所有状态与文案在此预计算

var workspace = require('../../utils/workspace')

var FRIENDLY_COLLECTION = 'friendly_matches'
var MAX_RECENT = 6
var MAX_EVENTS = 3

function text(value) {
  return value == null ? '' : String(value).trim()
}

function activeAccountId(context) {
  var user = (context && context.user) || {}
  return text(user.id || user._id || '')
}

function pickTeam(context) {
  var teams = (context && context.teams) || []
  var current = (context && context.currentWorkspace) || {}
  var currentId = text(current.teamId || current.id)
  var matched = null
  for (var i = 0; i < teams.length; i += 1) {
    if (text(teams[i].id || teams[i]._id) === currentId) {
      matched = teams[i]
      break
    }
  }
  if (!matched && teams.length) matched = teams[0]
  return matched
}

function formatEvent(item, index) {
  var name = text(item.name || item.tournamentName) || '未命名赛事'
  var status = text(item.status).toLowerCase()
  var statusText = '报名中'
  if (status === 'ongoing' || status === 'in_progress' || status === 'playing') statusText = '进行中'
  else if (status === 'finished' || status === 'ended') statusText = '已结束'
  else if (status === 'registering' || status === 'signup' || status === 'registration') statusText = '报名中'
  else if (status) statusText = text(item.statusText) || '报名中'
  var dateText = text(item.dateText || item.startDate || item.periodText) || '时间待定'
  var locationText = text(item.location || item.venue || item.city) || '地点待定'
  return {
    key: 'event-' + text(item.id || item._id || index),
    id: text(item.id || item._id),
    name: name,
    logo: text(item.logo || item.logoUrl) || '/images/logo.png',
    statusText: statusText,
    dateText: dateText,
    locationText: locationText,
    isRegistering: statusText === '报名中'
  }
}

function formatFriendly(item, index) {
  var homeScore = Number(item.homeScore)
  var awayScore = Number(item.awayScore)
  if (!isFinite(homeScore)) homeScore = 0
  if (!isFinite(awayScore)) awayScore = 0
  var teamName = text(item.teamName) || '本队'
  var opponentName = text(item.opponentName) || '对手'
  var isHome = item.isHome !== false
  var myScore = isHome ? homeScore : awayScore
  var otherScore = isHome ? awayScore : homeScore
  var resultText = '平'
  var resultClass = 'draw'
  if (myScore > otherScore) {
    resultText = '胜'
    resultClass = 'win'
  } else if (myScore < otherScore) {
    resultText = '负'
    resultClass = 'lose'
  }
  var scoreText = (isHome ? homeScore : awayScore) + ' : ' + (isHome ? awayScore : homeScore)
  var scorerText = ''
  var scorers = item.scorers || []
  if (scorers.length) {
    var names = []
    for (var i = 0; i < scorers.length && i < 3; i += 1) {
      var scorerName = text(scorers[i] && scorers[i].name)
      if (scorerName) names.push(scorerName)
    }
    if (names.length) scorerText = names.join('、') + ' 进球'
  }
  return {
    key: 'friendly-' + text(item._id || index),
    id: text(item._id),
    teamName: teamName,
    opponentName: opponentName,
    scoreText: scoreText,
    resultText: resultText,
    resultClass: resultClass,
    dateText: text(item.endedAtText || item.dateText) || '刚刚',
    scorerText: scorerText,
    hasScorer: Boolean(scorerText)
  }
}

function endedAtText(value) {
  if (!value) return ''
  var date = value instanceof Date ? value : new Date(value)
  if (isNaN(date.getTime())) return ''
  var month = date.getMonth() + 1
  var day = date.getDate()
  var hour = String(date.getHours())
  var minute = String(date.getMinutes())
  if (minute.length < 2) minute = '0' + minute
  return month + '月' + day + '日 ' + hour + ':' + minute
}

Page({
  data: {
    loading: true,
    errorText: '',
    roleText: '球队管理者',
    isOrganizer: false,
    isGuest: false,
    hasTeam: false,
    teamId: '',
    teamName: '',
    teamLogo: '',
    recordHint: '选择本队后即可开记',
    canRecord: false,
    recordBtnClass: 'is-disabled',
    events: [],
    hasEvents: false,
    eventsEmptyText: '当前没有报名中的赛事',
    recent: [],
    hasRecent: false,
    recentEmptyText: '还没有战报，先记一场吧'
  },

  onShow: function () {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().syncFromPage(3)
    }
    this.loadPage()
  },

  onPullDownRefresh: function () {
    var that = this
    this.loadPage(function () {
      wx.stopPullDownRefresh()
    })
  },

  loadPage: function (done) {
    var that = this
    var context = workspace.readContext()
    if (!context) {
      that.setData({
        loading: false,
        errorText: '',
        hasTeam: false,
        canRecord: false,
        isGuest: true,
        recordBtnClass: 'is-disabled',
        roleText: '未登录',
        recordHint: '登录后即可记录友谊赛',
        events: [],
        hasEvents: false,
        recent: [],
        hasRecent: false
      })
      if (done) done()
      return
    }

    var role = workspace.getPortalRole(context)
    var isOrganizer = role === 'organizer'
    var team = isOrganizer ? null : pickTeam(context)

    that.setData({
      loading: false,
      errorText: '',
      isGuest: false,
      isOrganizer: isOrganizer,
      roleText: isOrganizer ? '赛事组织者' : '球队管理者',
      hasTeam: Boolean(team),
      teamId: team ? text(team.id || team._id) : '',
      teamName: team ? (text(team.name || team.teamName) || '本队') : '',
      teamLogo: team ? (text(team.logo || team.teamLogo) || '/images/logo.png') : '',
      canRecord: Boolean(team),
      recordBtnClass: team ? 'is-ready' : 'is-disabled',
      recordHint: team ? '对手和时间都可以跳过' : '请先在“我的”切换到球队管理者'
    })

    that.loadEvents(context)
    that.loadRecent(context)
    if (done) done()
  },

  loadEvents: function (context) {
    var source = (context && context.tournaments) || []
    var events = []
    for (var i = 0; i < source.length && events.length < MAX_EVENTS; i += 1) {
      var item = source[i] || {}
      var status = text(item.status).toLowerCase()
      if (status === 'finished' || status === 'ended' || status === 'cancelled') continue
      events.push(formatEvent(item, i))
    }
    this.setData({
      events: events,
      hasEvents: events.length > 0
    })
  },

  loadRecent: function (context) {
    var that = this
    var userId = activeAccountId(context)
    if (!userId || !wx.cloud) {
      that.setData({ recent: [], hasRecent: false })
      return
    }
    var db = wx.cloud.database()
    db.collection(FRIENDLY_COLLECTION)
      .where({ recordedByUserId: userId })
      .orderBy('endedAt', 'desc')
      .limit(MAX_RECENT)
      .get()
      .then(function (res) {
        var rows = (res && res.data) || []
        var recent = rows.map(function (item, index) {
          var view = formatFriendly(item, index)
          view.dateText = endedAtText(item.endedAt) || view.dateText
          return view
        })
        that.setData({ recent: recent, hasRecent: recent.length > 0 })
      })
      .catch(function (error) {
        // 集合未初始化或权限未放开时，保持空态，不冒充真实数据
        console.warn('[discover] 读取战报失败', error && error.message)
        that.setData({ recent: [], hasRecent: false })
      })
  },

  onStartRecord: function () {
    if (this.data.isGuest) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    if (!this.data.canRecord) {
      wx.showToast({ title: '请先切换到球队管理者', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/discover/record/record' })
  },

  onOpenFriendly: function (event) {
    var id = text(event.currentTarget.dataset.id)
    if (!id) return
    wx.navigateTo({ url: '/pages/discover/record/record?id=' + encodeURIComponent(id) })
  },

  onOpenEvent: function (event) {
    var id = text(event.currentTarget.dataset.id)
    if (!id) return
    wx.navigateTo({ url: '/pages/tournament/detail/detail?id=' + encodeURIComponent(id) })
  },

  onGoLogin: function () {
    wx.navigateTo({ url: '/pages/login/login' })
  },

  onShareAppMessage: function () {
    return {
      title: '赛小蜂足球 · 青少年足球赛事管理',
      path: '/pages/home/home',
      imageUrl: '/images/brand/logo-saixiaofeng-football.png'
    }
  },

  onShareTimeline: function () {
    return {
      title: '赛小蜂足球 · 青少年足球赛事管理',
      imageUrl: '/images/brand/logo-saixiaofeng-football.png'
    }
  }
})
