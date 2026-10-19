// pages/discover/record/record.js
// 记一场：极简建赛 → 两队大按钮记分 → 进球者可选 → 战报
// 数据边界：仅写入 friendly_matches（非正式友谊赛），不写 matches / 赛事 / 数据中心，不进排名

var workspace = require('../../../utils/workspace')

var FRIENDLY_COLLECTION = 'friendly_matches'

function text(value) {
  return value == null ? '' : String(value).trim()
}

function pad2(value) {
  var str = String(value)
  return str.length < 2 ? '0' + str : str
}

function elapsedText(ms) {
  var total = Math.max(0, Math.floor(ms / 1000))
  var minutes = Math.floor(total / 60)
  var seconds = total % 60
  return pad2(minutes) + ':' + pad2(seconds)
}

function dateTimeText(date) {
  var month = date.getMonth() + 1
  var day = date.getDate()
  return month + '月' + day + '日 ' + pad2(date.getHours()) + ':' + pad2(date.getMinutes())
}

function durationText(ms) {
  var minutes = Math.max(0, Math.round(ms / 60000))
  if (minutes < 1) return '不到 1 分钟'
  return minutes + ' 分钟'
}

function normalizePlayer(row, index) {
  var id = text(row._id || row.id || row.playerId)
  var name = text(row.name || row.playerName) || '球员'
  var avatar = text(row.photo || row.photoUrl || row.avatarUrl || row.portraitUrl)
  return {
    id: id || ('p-' + index),
    playerId: id,
    name: name,
    avatar: avatar || '/images/logo.png',
    hasAvatar: Boolean(avatar)
  }
}

Page({
  data: {
    stage: 'prepare',
    isPrepare: true,
    isRecording: false,
    isReport: false,

    teamId: '',
    teamName: '本队',
    teamLogo: '',
    opponentName: '',
    opponentDisplay: '对手',
    opponentPlaceholder: '对手名称（可跳过）',

    homeScore: 0,
    awayScore: 0,
    homeScoreText: '0',
    awayScoreText: '0',
    elapsedText: '00:00',

    players: [],
    hasPlayers: false,
    scorerSheetVisible: false,
    pendingSide: '',
    pendingSideName: '',

    scorers: [],
    scorerList: [],
    hasScorers: false,
    scorerEmptyText: '没有记录进球者',

    reportScoreText: '0 : 0',
    reportResultText: '',
    reportResultClass: 'draw',
    reportDateText: '',
    reportDurationText: '',
    saveStateText: '',
    saveFailed: false,

    matchId: ''
  },

  onLoad: function (options) {
    this._startedAt = 0
    this._timer = null
    var context = workspace.readContext()
    if (!context) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      wx.navigateBack()
      return
    }
    this._context = context
    var team = this.pickTeam(context)
    if (!team) {
      wx.showToast({ title: '请先切换到球队管理者', icon: 'none' })
      wx.navigateBack()
      return
    }
    this._team = team
    this.setData({
      teamId: text(team.id || team._id),
      teamName: text(team.name || team.teamName) || '本队',
      teamLogo: text(team.logo || team.teamLogo) || '/images/logo.png'
    })
    this.loadPlayers(context, team)

    var id = text(options && options.id)
    if (id) this.loadExisting(id)
  },

  onUnload: function () {
    this.stopTimer()
  },

  onShow: function () {
    if (this.data.stage === 'recording' && this._startedAt) this.startTimer()
  },

  onHide: function () {
    this.stopTimer()
  },

  pickTeam: function (context) {
    var teams = (context && context.teams) || []
    var current = (context && context.currentWorkspace) || {}
    var currentId = text(current.teamId || current.id)
    var matched = null
    var i
    for (i = 0; i < teams.length; i += 1) {
      if (text(teams[i].id || teams[i]._id) === currentId) {
        matched = teams[i]
        break
      }
    }
    if (!matched && teams.length) matched = teams[0]
    return matched
  },

  loadPlayers: function (context, team) {
    var that = this
    var workspaceId = text((context.currentWorkspace || {}).id)
    var teamId = text(team.id || team._id)
    if (!workspaceId || !teamId) return
    wx.cloud.callFunction({
      name: 'getMiniWorkspace',
      data: { action: 'teamPlayers', workspaceId: workspaceId, teamId: teamId, includePlayerCards: false }
    }).then(function (response) {
      var result = (response && response.result) || {}
      var rows = result.players || []
      var players = rows.map(normalizePlayer)
      that.setData({ players: players, hasPlayers: players.length > 0 })
    }).catch(function (error) {
      console.warn('[friendly] 球员列表读取失败，记分仍可继续', error && error.message)
      that.setData({ players: [], hasPlayers: false })
    })
  },

  loadExisting: function (id) {
    var that = this
    if (!wx.cloud) return
    wx.cloud.database().collection(FRIENDLY_COLLECTION).doc(id).get().then(function (res) {
      var row = res && res.data
      if (!row) return
      that.setData({
        stage: 'report',
        isPrepare: false,
        isRecording: false,
        isReport: true,
        matchId: text(row._id),
        teamName: text(row.teamName) || that.data.teamName,
        opponentDisplay: text(row.opponentName) || '对手',
        homeScore: Number(row.homeScore) || 0,
        awayScore: Number(row.awayScore) || 0,
        homeScoreText: String(Number(row.homeScore) || 0),
        awayScoreText: String(Number(row.awayScore) || 0),
        scorers: row.scorers || [],
        saveStateText: '已归档'
      })
      that.buildReport(row.homeScore, row.awayScore, row.endedAt, row.durationMinutes)
      that.buildScorerList(row.scorers || [])
    }).catch(function (error) {
      console.warn('[friendly] 读取战报失败', error && error.message)
      wx.showToast({ title: '战报读取失败', icon: 'none' })
    })
  },

  onOpponentInput: function (event) {
    var value = text(event.detail.value)
    this.setData({ opponentName: value })
  },

  onStartRecord: function () {
    var opponent = text(this.data.opponentName) || '对手'
    this._startedAt = Date.now()
    this.setData({
      stage: 'recording',
      isPrepare: false,
      isRecording: true,
      isReport: false,
      opponentDisplay: opponent,
      homeScore: 0,
      awayScore: 0,
      homeScoreText: '0',
      awayScoreText: '0',
      scorers: [],
      scorerList: [],
      hasScorers: false,
      elapsedText: '00:00'
    })
    this.startTimer()
  },

  startTimer: function () {
    var that = this
    this.stopTimer()
    this._timer = setInterval(function () {
      that.setData({ elapsedText: elapsedText(Date.now() - that._startedAt) })
    }, 1000)
  },

  stopTimer: function () {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  },

  onAddScore: function (event) {
    var side = text(event.currentTarget.dataset.side)
    if (!side) return
    var home = this.data.homeScore
    var away = this.data.awayScore
    if (side === 'home') home += 1
    else away += 1
    this.setData({
      homeScore: home,
      awayScore: away,
      homeScoreText: String(home),
      awayScoreText: String(away),
      pendingSide: side,
      pendingSideName: side === 'home' ? this.data.teamName : this.data.opponentDisplay,
      scorerSheetVisible: this.data.hasPlayers
    })
  },

  onMinusScore: function (event) {
    var side = text(event.currentTarget.dataset.side)
    if (!side) return
    var home = this.data.homeScore
    var away = this.data.awayScore
    if (side === 'home') {
      if (home <= 0) return
      home -= 1
    } else {
      if (away <= 0) return
      away -= 1
    }
    this.setData({
      homeScore: home,
      awayScore: away,
      homeScoreText: String(home),
      awayScoreText: String(away)
    })
    wx.vibrateShort({ type: 'light' })
  },

  onPickScorer: function (event) {
    var dataset = event.currentTarget.dataset || {}
    var playerId = text(dataset.id)
    var name = text(dataset.name)
    var side = this.data.pendingSide
    if (!side) {
      this.setData({ scorerSheetVisible: false })
      return
    }
    var minute = Math.max(0, Math.floor((Date.now() - this._startedAt) / 60000))
    var scorers = (this.data.scorers || []).slice()
    scorers.push({
      playerId: playerId,
      name: name,
      side: side,
      minute: minute,
      minuteText: minute + "'"
    })
    this.setData({ scorers: scorers, scorerSheetVisible: false, pendingSide: '' })
    this.buildScorerList(scorers)
  },

  onSkipScorer: function () {
    this.setData({ scorerSheetVisible: false, pendingSide: '' })
  },

  buildScorerList: function (scorers) {
    var list = []
    var i
    for (i = 0; i < scorers.length; i += 1) {
      var row = scorers[i] || {}
      list.push({
        key: 'scorer-' + i,
        name: text(row.name) || '球员',
        minuteText: text(row.minuteText),
        sideText: row.side === 'away' ? this.data.opponentDisplay : this.data.teamName
      })
    }
    this.setData({ scorerList: list, hasScorers: list.length > 0 })
  },

  onFinish: function () {
    var that = this
    this.stopTimer()
    var endedAt = new Date()
    var durationMs = this._startedAt ? (endedAt.getTime() - this._startedAt) : 0
    this.buildReport(this.data.homeScore, this.data.awayScore, endedAt, Math.round(durationMs / 60000))
    this.buildScorerList(this.data.scorers || [])
    this.setData({
      stage: 'report',
      isPrepare: false,
      isRecording: false,
      isReport: true,
      saveStateText: '正在归档…',
      saveFailed: false
    })
    this.saveMatch(endedAt, durationMs)
  },

  buildReport: function (homeScore, awayScore, endedAt, durationMinutes) {
    var home = Number(homeScore) || 0
    var away = Number(awayScore) || 0
    var resultText = '平局'
    var resultClass = 'draw'
    if (home > away) {
      resultText = '胜'
      resultClass = 'win'
    } else if (home < away) {
      resultText = '负'
      resultClass = 'lose'
    }
    var dateText = ''
    var duration = ''
    if (endedAt) {
      var date = endedAt instanceof Date ? endedAt : new Date(endedAt)
      if (!isNaN(date.getTime())) dateText = dateTimeText(date)
    }
    if (durationMinutes != null && durationMinutes !== '') {
      duration = Number(durationMinutes) + ' 分钟'
    }
    this.setData({
      reportScoreText: home + ' : ' + away,
      reportResultText: resultText,
      reportResultClass: resultClass,
      reportDateText: dateText,
      reportDurationText: duration
    })
  },

  saveMatch: function (endedAt, durationMs) {
    var that = this
    var context = this._context || {}
    var user = context.user || {}
    var userId = text(user.id || user._id)
    if (!wx.cloud || !userId) {
      that.setData({ saveStateText: '战报未归档：缺少登录信息', saveFailed: true })
      return
    }
    var db = wx.cloud.database()
    var payload = {
      matchNature: 'friendly',
      originType: 'real',
      isOfficial: false,
      teamId: this.data.teamId,
      teamName: this.data.teamName,
      teamLogo: this.data.teamLogo,
      opponentName: this.data.opponentDisplay,
      isHome: true,
      homeScore: this.data.homeScore,
      awayScore: this.data.awayScore,
      scorers: this.data.scorers || [],
      status: 'finished',
      startedAt: this._startedAt ? new Date(this._startedAt) : endedAt,
      endedAt: endedAt,
      durationMinutes: Math.max(0, Math.round(durationMs / 60000)),
      recordedByUserId: userId,
      orgId: text((context.currentWorkspace || {}).orgId),
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }
    db.collection(FRIENDLY_COLLECTION).add({ data: payload }).then(function (res) {
      that.setData({
        matchId: text(res && res._id),
        saveStateText: '已归档 · 不计入正式排名',
        saveFailed: false
      })
    }).catch(function (error) {
      console.warn('[friendly] 归档失败', error && error.message)
      that.setData({
        saveStateText: '战报未归档，可重试',
        saveFailed: true
      })
    })
  },

  onRetrySave: function () {
    var endedAt = new Date()
    var durationMs = this._startedAt ? (endedAt.getTime() - this._startedAt) : 0
    this.setData({ saveStateText: '正在重试…', saveFailed: false })
    this.saveMatch(endedAt, durationMs)
  },

  onAgain: function () {
    this.stopTimer()
    this._startedAt = 0
    this.setData({
      stage: 'prepare',
      isPrepare: true,
      isRecording: false,
      isReport: false,
      opponentName: '',
      opponentDisplay: '对手',
      homeScore: 0,
      awayScore: 0,
      homeScoreText: '0',
      awayScoreText: '0',
      elapsedText: '00:00',
      scorers: [],
      scorerList: [],
      hasScorers: false,
      matchId: '',
      saveStateText: '',
      saveFailed: false
    })
  },

  onBackDiscover: function () {
    wx.switchTab({ url: '/pages/discover/discover' })
  },

  onShareAppMessage: function () {
    var score = this.data.reportScoreText
    var title = this.data.teamName + ' ' + score + ' ' + this.data.opponentDisplay
    var path = '/pages/discover/record/record'
    if (this.data.matchId) path += '?id=' + encodeURIComponent(this.data.matchId)
    return {
      title: title,
      path: path,
      imageUrl: '/images/brand/logo-saixiaofeng-football.png'
    }
  },

  onShareTimeline: function () {
    return {
      title: this.data.teamName + ' ' + this.data.reportScoreText + ' ' + this.data.opponentDisplay,
      imageUrl: '/images/brand/logo-saixiaofeng-football.png'
    }
  }
})
