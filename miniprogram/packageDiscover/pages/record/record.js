// packageDiscover/pages/record/record.js
// 记一场：极简建赛 → 两队大按钮记分 → 进球者可选 → 战报 + Canvas 海报
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

    // 对局设置（准备页可选，默认 2节×10分钟 正计时）
    clockMode: 'up',
    periodCount: 2,
    periodMinutes: 10,
    modeOptions: [
      { v: 'up', label: '正计时', cls: 'active' },
      { v: 'down', label: '倒计时', cls: '' }
    ],
    periodOptions: [
      { v: 1, label: '1节', cls: '' },
      { v: 2, label: '2节', cls: 'active' },
      { v: 3, label: '3节', cls: '' },
      { v: 4, label: '4节', cls: '' }
    ],
    minuteOptions: [
      { v: 5, label: '5分', cls: '' },
      { v: 10, label: '10分', cls: 'active' },
      { v: 15, label: '15分', cls: '' },
      { v: 20, label: '20分', cls: '' },
      { v: 30, label: '30分', cls: '' }
    ],

    // 记分钟运行时（WXML 只用预计算 flag）
    phaseRunning: false,
    phasePaused: false,
    phaseBreak: false,
    phaseIdle: true,
    showPeriodBadge: false,
    showPeriodBtns: false,
    periodText: '',
    clockText: '00:00',
    totalText: '全场累计 00:00',
    startPeriodText: '',

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
    reportStoryText: '',
    posterBgPath: '/packageDiscover/images/runtime/poster-bg-classic.jpg',
    aiBgPath: '',
    aiBgLoading: false,
    aiBgHas: false,
    aiBgBtnText: 'AI 生成海报',
    posterStyle: 'wuxia',
    styleBtnText: '风格：武侠水墨',
    saveStateText: '',
    saveFailed: false,

    matchId: '',

    posterCanvasVisible: false,
    posterReady: false,
    showTextReport: false,
    posterSavedPath: ''
  },

  onGoBack: function () {
    var pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack()
    } else {
      wx.switchTab({ url: '/pages/discover/discover' })
    }
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
    // 海报风格默认按球队年龄组分流：青少年 = 武侠水墨，成人 = 欢乐酒馆
    var ageGroup = text(team.ageGroup || team.age_group)
    var isYouth = /^U/i.test(ageGroup)
    this.setData({
      posterStyle: isYouth ? 'wuxia' : 'party',
      styleBtnText: isYouth ? '风格：武侠水墨' : '风格：欢乐酒馆'
    })
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
        posterCanvasVisible: true,
        posterReady: false,
        showTextReport: false,
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
      // 已缓存的简讯按风格匹配：一致直接用，不一致（换过风格）重新生成
      if (text(row.aiStory) && text(row.aiStoryStyle) === that.data.posterStyle) {
        that._aiRequested = true
        that.setData({ reportStoryText: text(row.aiStory) })
      } else {
        that.requestAiReport()
      }
      // 已有 AI 背景缓存则直接回显（按当前风格取，不烧额度），按钮变「换一张」走 force 重生成
      var bgFiles = row.aiBgFiles || {}
      var cachedBg = text(bgFiles[that.data.posterStyle])
      if (cachedBg) that.applyAiBg(cachedBg)
      setTimeout(function () { that.drawPoster() }, 200)
    }).catch(function (error) {
      console.warn('[friendly] 读取战报失败', error && error.message)
      wx.showToast({ title: '战报读取失败', icon: 'none' })
    })
  },

  onOpponentInput: function (event) {
    var value = text(event.detail.value)
    this.setData({ opponentName: value })
  },

  // ===== 对局设置（节数 / 每节时长 / 正倒计时） =====
  refreshSegOptions: function () {
    var mode = this.data.clockMode
    var count = this.data.periodCount
    var minutes = this.data.periodMinutes
    var modeOptions = this.data.modeOptions.map(function (row) {
      return { v: row.v, label: row.label, cls: row.v === mode ? 'active' : '' }
    })
    var periodOptions = this.data.periodOptions.map(function (row) {
      return { v: row.v, label: row.label, cls: row.v === count ? 'active' : '' }
    })
    var minuteOptions = this.data.minuteOptions.map(function (row) {
      return { v: row.v, label: row.label, cls: row.v === minutes ? 'active' : '' }
    })
    this.setData({ modeOptions: modeOptions, periodOptions: periodOptions, minuteOptions: minuteOptions })
  },

  onPickMode: function (event) {
    var v = text(event.currentTarget.dataset.v)
    if (v !== 'up' && v !== 'down') return
    this.setData({ clockMode: v })
    this.refreshSegOptions()
  },

  onPickPeriods: function (event) {
    var v = Number(event.currentTarget.dataset.v)
    if (!(v >= 1 && v <= 4)) return
    this.setData({ periodCount: v })
    this.refreshSegOptions()
  },

  onPickMinutes: function (event) {
    var v = Number(event.currentTarget.dataset.v)
    if (!(v >= 1 && v <= 120)) return
    this.setData({ periodMinutes: v })
    this.refreshSegOptions()
  },

  onStartRecord: function () {
    var opponent = text(this.data.opponentName) || '对手'
    this._startedAt = Date.now()
    this._activeMs = 0
    // 进入记分页先不启动计时，等用户点「开始第1节」再走表
    this._segmentStart = 0
    this._phase = 'idle'
    this._periodStartActive = 0
    this._period = 1
    this._periodTimeUp = false
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
    this.refreshClockState()
    this.startTimer()
  },

  // ===== 记分钟：有效时长累计（暂停不计时），支持节数与正/倒计时 =====
  getActiveMs: function () {
    var active = this._activeMs || 0
    if (this._phase === 'running' && this._segmentStart) {
      active += Date.now() - this._segmentStart
    }
    return active
  },

  startSegment: function () {
    this._segmentStart = Date.now()
    this._phase = 'running'
  },

  pauseSegment: function () {
    this._activeMs = this.getActiveMs()
    this._phase = 'paused'
  },

  startTimer: function () {
    var that = this
    this.stopTimer()
    this._timer = setInterval(function () {
      that.refreshClockState()
    }, 1000)
  },

  stopTimer: function () {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  },

  refreshClockState: function () {
    var periodSeconds = (Number(this.data.periodMinutes) || 10) * 60
    var activeMs = this.getActiveMs()
    var periodMs = Math.max(0, activeMs - (this._periodStartActive || 0))
    var clockMs = periodMs
    if (this.data.clockMode === 'down') {
      clockMs = Math.max(0, periodSeconds * 1000 - periodMs)
    }

    // 倒计时走完：提示一次，不强制停表（现场可继续加时）
    if (this.data.clockMode === 'down' && periodMs >= periodSeconds * 1000 && this._phase === 'running' && !this._periodTimeUp) {
      this._periodTimeUp = true
      wx.showToast({ title: '本节时间到', icon: 'none' })
      wx.vibrateShort({ type: 'heavy' })
    }

    var phaseBreak = this._phase === 'break'
    var periodCount = Number(this.data.periodCount) || 1
    var phaseRunning = this._phase === 'running'
    var phasePaused = this._phase === 'paused'
    var phaseIdle = this._phase === 'idle'
    this.setData({
      clockText: elapsedText(clockMs),
      totalText: '全场累计 ' + elapsedText(activeMs),
      phaseRunning: phaseRunning,
      phasePaused: phasePaused,
      phaseBreak: phaseBreak,
      phaseIdle: phaseIdle,
      showPeriodBadge: periodCount > 1,
      showPeriodBtns: periodCount > 1,
      periodText: periodCount > 1 ? ('第' + (this._period || 1) + '节 · 共' + periodCount + '节') : '',
      startPeriodText: periodCount > 1 ? ('开始第' + (this._period || 1) + '节') : '开始计时'
    })
  },

  onPauseToggle: function () {
    if (this._phase === 'running') {
      this.pauseSegment()
      wx.vibrateShort({ type: 'light' })
    } else if (this._phase === 'paused') {
      this.startSegment()
      wx.vibrateShort({ type: 'light' })
    } else {
      return
    }
    this.refreshClockState()
  },

  onStartPeriod: function () {
    // 开局（idle）与节间休息（break）都能从这里开表
    if (this._phase === 'running' || this._phase === 'paused') return
    this._periodStartActive = this.getActiveMs()
    this._periodTimeUp = false
    this.startSegment()
    this.refreshClockState()
  },

  onEndPeriod: function () {
    var periodCount = Number(this.data.periodCount) || 1
    if (!(this._period < periodCount)) {
      wx.showToast({ title: '已是最后一节，可结束比赛', icon: 'none' })
      return
    }
    if (this._phase === 'running') this.pauseSegment()
    this._period += 1
    this._periodStartActive = this.getActiveMs()
    this._periodTimeUp = false
    this._phase = 'break'
    this.refreshClockState()
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
    // 进球分钟按全场有效时长计（暂停不计时），首分钟记 1'
    var activeMs = this.getActiveMs()
    var minute = Math.max(1, Math.ceil(activeMs / 60000))
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
    // 全场有效时长（暂停与节间等待不计入）
    if (this._phase === 'running') this.pauseSegment()
    var durationMs = this.getActiveMs()
    this.buildReport(this.data.homeScore, this.data.awayScore, endedAt, Math.max(1, Math.ceil(durationMs / 60000)))
    this.buildScorerList(this.data.scorers || [])
    this.setData({
      stage: 'report',
      isPrepare: false,
      isRecording: false,
      isReport: true,
      posterCanvasVisible: true,
      posterReady: false,
      showTextReport: false,
      saveStateText: '正在归档…',
      saveFailed: false
    })
    setTimeout(function () { that.drawPoster() }, 200)
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

    // 武侠风战报文案：模板 + 随机 + 进球者数据拼装（本地生成，不依赖后端）
    var counts = {}
    var order = []
    var scorers = Array.isArray(this.data.scorers) ? this.data.scorers : []
    scorers.forEach(function (s) {
      var n = text(s && s.name)
      if (!n) return
      if (!counts[n]) { counts[n] = 0; order.push(n) }
      counts[n] += 1
    })
    var scorerPart = ''
    if (order.length) {
      var parts = order.slice(0, 3).map(function (n) {
        var c = counts[n]
        if (c >= 3) return n + '三箭定天山'
        if (c === 2) return n + '连下两城'
        return n + '一剑封喉'
      })
      scorerPart = parts.join('、') + '，'
    }
    var homeName = this.data.teamName || '我队'
    var oppName = this.data.opponentDisplay || '对手'
    // 本地兜底文案分风格：武侠 / 欢乐酒馆（成人搞笑向）
    var isParty = this.data.posterStyle === 'party'
    var templates = isParty ? {
      win: [
        '今晚这条街最靓的队！' + homeName + ' ' + home + ':' + away + ' 干翻' + oppName + '，' + scorerPart + '赛后烧烤已安排，输球方买单！',
        home + ':' + away + ' 拿下！' + homeName + '踢疯了，' + scorerPart + '这状态不喝两杯都说不过去！'
      ],
      lose: [
        home + ':' + away + '，' + homeName + '今天脚感在停车场没带进来。' + scorerPart + '没事，啤酒管够，下次找回来！',
        '输给' + oppName + '不丢人，' + home + ':' + away + '而已。' + scorerPart + '今晚撸串复盘，谁也别跑！'
      ],
      draw: [
        home + ':' + away + '，平局最气人！' + homeName + '和' + oppName + '踢了个寂寞，' + scorerPart + '各自带酒，下回分胜负！',
        '旗鼓相当！' + homeName + ' ' + home + ':' + away + ' ' + oppName + '，' + scorerPart + '握手握手，周末再约，输的请客！'
      ]
    } : {
      win: [
        '绿茵江湖今日风云再起！' + homeName + '对阵' + oppName + '，' + scorerPart + '一鼓作气拿下此战 ' + home + ':' + away + '，痛快！',
        '战鼓擂罢，' + homeName + '以 ' + home + ':' + away + ' 克' + oppName + '。' + scorerPart + '此役配合行云流水，堪为江湖佳话。',
        home + ':' + away + '！' + homeName + '技压全场，' + scorerPart + '对手虽奋力周旋，终难敌我锋芒。'
      ],
      lose: [
        '此役' + homeName + '憾负' + oppName + '，' + home + ':' + away + '。江湖路远，胜败乃兵家常事，回去勤修内功，来日再战！',
        home + ':' + away + '，' + homeName + '今日运气未至。' + scorerPart + '虽败犹荣，收拾行囊，下一战找回场子！'
      ],
      draw: [
        '棋逢对手！' + homeName + '与' + oppName + '战成 ' + home + ':' + away + '，' + scorerPart + '难分高下，握手言和，江湖再会。',
        home + ':' + away + ' 平局收场。' + scorerPart + '两强相争各取一分，绿茵江湖，友谊第一。'
      ]
    }
    var pool = templates[resultClass] || templates.draw
    var story = pool[Math.floor(Math.random() * pool.length)]
    if (duration) story += isParty ? '全场 ' + duration + '，酒已备好。' : '全场 ' + duration + '，快意江湖。'

    // 战报底图随机池：经典绿茵 + 3 张武侠水墨
    var bgPool = [
      '/packageDiscover/images/runtime/poster-bg-classic.jpg',
      '/packageDiscover/images/runtime/poster-bg-wuxia-1.jpg',
      '/packageDiscover/images/runtime/poster-bg-wuxia-2.jpg',
      '/packageDiscover/images/runtime/poster-bg-wuxia-3.jpg'
    ]

    this.setData({
      reportScoreText: home + ' : ' + away,
      reportResultText: resultText,
      reportResultClass: resultClass,
      reportDateText: dateText,
      reportDurationText: duration,
      reportStoryText: story,
      posterBgPath: bgPool[Math.floor(Math.random() * bgPool.length)]
    })
  },

  // AI 武侠战报：本地模板先上屏，云函数（hunyuan-lite）文案到达后覆盖，失败静默保留本地
  // 切换海报风格：立即重绘框架；AI 简讯/海报按新风格重新生成（旧风格缓存不覆盖）
  onPickPosterStyle: function () {
    var next = this.data.posterStyle === 'wuxia' ? 'party' : 'wuxia'
    this._aiRequested = false
    this.setData({
      posterStyle: next,
      styleBtnText: next === 'wuxia' ? '风格：武侠水墨' : '风格：欢乐酒馆',
      posterReady: false
    })
    this.drawPoster()
    // 风格变化后用新语气重新生成江湖简讯（云函数按 aiStoryStyle 缓存）
    if (text(this.data.matchId)) this.requestAiReport()
  },

  requestAiReport: function () {
    var that = this
    if (that._aiRequested) return
    that._aiRequested = true
    if (!wx.cloud || !wx.cloud.callFunction) return
    var duration = parseInt(that.data.reportDurationText, 10)
    var scorers = (that.data.scorers || []).map(function (s) {
      return { name: text(s && s.name), side: (s && s.side) || '', minute: Number(s && s.minute) || 0 }
    })
    wx.cloud.callFunction({
      name: 'friendlyMatchCenter',
      data: {
        action: 'generateMatchReport',
        matchId: that.data.matchId || '',
        style: that.data.posterStyle,
        teamName: that.data.teamName,
        opponentName: that.data.opponentDisplay,
        homeScore: that.data.homeScore,
        awayScore: that.data.awayScore,
        scorers: scorers,
        durationMinutes: isNaN(duration) ? 0 : duration
      }
    }).then(function (response) {
      var result = (response && response.result) || {}
      var data = result.ok ? (result.data || {}) : {}
      var story = text(data.story)
      if (story && story !== that.data.reportStoryText) {
        that.setData({ reportStoryText: story })
        if (that.data.isReport) that.drawPoster()
      }
    }).catch(function (error) {
      console.warn('[friendly] AI 战报生成失败，保留本地文案', error && error.message)
    })
  },

  // AI 生成海报：用户点按钮触发，云函数（文字 AI 写提示词 + hunyuan-image 生图）按场次缓存
  onGenAiPoster: function () {
    var that = this
    if (that.data.aiBgLoading) return
    if (!wx.cloud || !wx.cloud.callFunction) {
      wx.showToast({ title: '基础库不支持云调用', icon: 'none' })
      return
    }
    if (!text(that.data.matchId)) {
      wx.showToast({ title: '战报归档后才能生成', icon: 'none' })
      return
    }
    that.setData({ aiBgLoading: true, aiBgBtnText: 'AI 绘制中…' })
    // 兜底：客户端等待上限 60 秒，若超时未回则恢复按钮（云端会继续完成并缓存，稍后重试直接取缓存）
    if (that._aiBgGuard) clearTimeout(that._aiBgGuard)
    that._aiBgGuard = setTimeout(function () {
      if (that.data.aiBgLoading) {
        that.setData({ aiBgLoading: false, aiBgBtnText: '重新生成' })
        wx.showToast({ title: '绘制较慢，稍后重试可取缓存', icon: 'none' })
      }
    }, 65000)
    wx.cloud.callFunction({
      name: 'friendlyMatchCenter',
      data: { action: 'generateReportBg', matchId: that.data.matchId, force: Boolean(that.data.aiBgHas), style: that.data.posterStyle },
      timeout: 60000
    }).then(function (response) {
      if (that._aiBgGuard) clearTimeout(that._aiBgGuard)
      var result = (response && response.result) || {}
      var data = result.ok ? (result.data || {}) : {}
      var fileId = text(data.fileId)
      if (fileId) {
        that.applyAiBg(fileId)
      } else {
        that.setData({ aiBgLoading: false, aiBgBtnText: '重新生成' })
        wx.showToast({ title: text(result.message) || '生成失败，请重试', icon: 'none' })
      }
    }).catch(function (error) {
      if (that._aiBgGuard) clearTimeout(that._aiBgGuard)
      console.warn('[friendly] AI 背景生成失败', error && error.message)
      that.setData({ aiBgLoading: false, aiBgBtnText: '重新生成' })
      wx.showToast({ title: '生成失败，请重试', icon: 'none' })
    })
  },

  applyAiBg: function (fileId) {
    var that = this
    wx.cloud.downloadFile({
      fileID: fileId,
      success: function (res) {
        var tempPath = text(res && res.tempFilePath)
        if (!tempPath) {
          that.setData({ aiBgLoading: false, aiBgBtnText: '重新生成' })
          return
        }
        that._posterCanvas = null
        that.setData({ aiBgPath: tempPath, posterReady: false, aiBgLoading: false, aiBgHas: true, aiBgBtnText: '换一张' })
        if (that.data.isReport) that.drawPoster()
      },
      fail: function () {
        console.warn('[friendly] AI 背景下载失败')
        that.setData({ aiBgLoading: false, aiBgBtnText: '重新生成' })
        wx.showToast({ title: '背景下载失败', icon: 'none' })
      }
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
      durationMinutes: Math.max(1, Math.ceil(durationMs / 60000)),
      clockMode: this.data.clockMode,
      periodCount: Number(this.data.periodCount) || 1,
      periodMinutes: Number(this.data.periodMinutes) || 10,
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
      that.requestAiReport()
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
    this._posterCanvas = null
    this._posterPhotoPath = ''
    this._brandLogoImg = null
    this._aiRequested = false
    this._aiBgRetried = false
    this._activeMs = 0
    this._segmentStart = 0
    this._periodStartActive = 0
    this._period = 1
    this._periodTimeUp = false
    this._phase = 'paused'
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
      clockText: '00:00',
      totalText: '全场累计 00:00',
      phaseRunning: false,
      phasePaused: false,
      phaseBreak: false,
      showPeriodBadge: false,
      showPeriodBtns: false,
      periodText: '',
      startPeriodText: '',
      scorers: [],
      scorerList: [],
      hasScorers: false,
      matchId: '',
      saveStateText: '',
      saveFailed: false,
      posterCanvasVisible: false,
      posterReady: false,
      showTextReport: false,
      posterSavedPath: '',
      aiBgPath: '',
      aiBgLoading: false,
      aiBgHas: false,
      aiBgBtnText: 'AI 生成海报'
    })
  },

  onBackDiscover: function () {
    wx.switchTab({ url: '/pages/discover/discover' })
  },

  onShareAppMessage: function () {
    var score = this.data.reportScoreText
    var title = this.data.teamName + ' ' + score + ' ' + this.data.opponentDisplay
    var path = '/packageDiscover/pages/record/record'
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
  },

  // ===== Canvas 2D 战报海报合成 =====
  drawPoster: function () {
    var that = this
    try {
      var query = wx.createSelectorQuery()
      query.select('#friendlyPoster')
        .fields({ node: true, size: true })
        .exec(function (res) {
          if (!res || !res[0] || !res[0].node) {
            console.warn('[friendly] Canvas 节点未就绪，降级为文字战报')
            that.setData({ posterCanvasVisible: false, posterReady: false, showTextReport: true })
            return
          }
          var canvas = res[0].node
          var ctx = canvas.getContext('2d')
          var dpr = wx.getSystemInfoSync().pixelRatio || 2
          var w = 750
          var h = 1334
          canvas.width = w * dpr
          canvas.height = h * dpr
          ctx.scale(dpr, dpr)

          // 图片区素材优先级：用户自选照片 > AI 生成背景 > 本地底图池
          var src = that._posterPhotoPath || that.data.aiBgPath || that.data.posterBgPath || '/packageDiscover/images/runtime/poster-bg-classic.jpg'
          var bgImg = canvas.createImage()
          bgImg.onload = function () {
            that.drawPosterLayout(ctx, w, h, bgImg, canvas)
            that._posterCanvas = canvas
            that.setData({ posterReady: true })
          }
          bgImg.onerror = function () {
            that.drawPosterLayout(ctx, w, h, null, canvas)
            that._posterCanvas = canvas
            that.setData({ posterReady: true })
          }
          bgImg.src = src
        })
    } catch (e) {
      console.warn('[friendly] 海报绘制异常', e)
      this.setData({ posterCanvasVisible: false, posterReady: false, showTextReport: true })
    }
  },

  // ===== 海报布局（战报卡款式：标题区 / 图片区 / 比分信息卡 / 战报文字 / 品牌条） =====
  posterRoundRect: function (ctx, x, y, cw, ch, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + cw, y, x + cw, y + ch, r)
    ctx.arcTo(x + cw, y + ch, x, y + ch, r)
    ctx.arcTo(x, y + ch, x, y, r)
    ctx.arcTo(x, y, x + cw, y, r)
    ctx.closePath()
  },

  posterFitText: function (ctx, str, maxWidth) {
    var s = text(str)
    if (!s) return ''
    if (ctx.measureText(s).width <= maxWidth) return s
    while (s.length > 1 && ctx.measureText(s + '…').width > maxWidth) {
      s = s.slice(0, -1)
    }
    return s + '…'
  },

  posterWrapText: function (ctx, str, maxWidth, maxLines) {
    var rest = text(str)
    var lines = []
    while (rest.length && lines.length < maxLines) {
      if (ctx.measureText(rest).width <= maxWidth) {
        lines.push(rest)
        rest = ''
        break
      }
      var cut = rest.length
      while (cut > 1 && ctx.measureText(rest.slice(0, cut)).width > maxWidth) {
        cut -= 1
      }
      lines.push(rest.slice(0, cut))
      rest = rest.slice(cut)
    }
    if (rest.length && lines.length) {
      var last = lines[maxLines - 1]
      while (last.length > 1 && ctx.measureText(last + '…').width > maxWidth) {
        last = last.slice(0, -1)
      }
      lines[maxLines - 1] = last + '…'
    }
    return lines
  },

  drawPosterCover: function (ctx, img, x, y, cw, ch) {
    var iw = img.width || cw
    var ih = img.height || ch
    var scale = Math.max(cw / iw, ch / ih)
    var dw = iw * scale
    var dh = ih * scale
    ctx.save()
    this.posterRoundRect(ctx, x, y, cw, ch, 20)
    ctx.clip()
    ctx.drawImage(img, x + (cw - dw) / 2, y + (ch - dh) / 2, dw, dh)
    // 轻遮罩统一色调 + 右下角署名徽（盖住 AI 生成水印）
    var shade = ctx.createLinearGradient(0, y, 0, y + ch)
    shade.addColorStop(0, 'rgba(0,0,0,0.02)')
    shade.addColorStop(1, 'rgba(0,0,0,0.22)')
    ctx.fillStyle = shade
    ctx.fillRect(x, y, cw, ch)
    ctx.fillStyle = 'rgba(2,26,16,0.78)'
    this.posterRoundRect(ctx, x + cw - 158, y + ch - 46, 138, 32, 16)
    ctx.fill()
    ctx.fillStyle = '#8df0b4'
    ctx.font = 'bold 18px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('赛小蜂足球', x + cw - 89, y + ch - 30)
    ctx.restore()
  },

  drawPosterLayout: function (ctx, w, h, bgImg, canvas) {
    var d = this.data
    var isParty = d.posterStyle === 'party'
    // 风格配色：武侠 = 深绿水墨；欢乐酒馆 = 暖金夜场
    var cBgTop = isParty ? '#4a2408' : '#0b4529'
    var cBgBottom = isParty ? '#1f0e02' : '#032317'
    var cAccent = isParty ? '#ffd27a' : '#8df0b4'
    var cAccentSoft = isParty ? 'rgba(255,210,122,0.55)' : 'rgba(127,224,168,0.55)'
    var cAccentFill = isParty ? 'rgba(255,183,77,0.18)' : 'rgba(88,220,146,0.14)'
    var cMinute = isParty ? '#ffd27a' : '#7fe0a8'
    var cCard = isParty ? 'rgba(30,14,2,0.92)' : 'rgba(2,28,18,0.92)'

    // 整卡底
    var bg = ctx.createLinearGradient(0, 0, 0, h)
    bg.addColorStop(0, cBgTop)
    bg.addColorStop(1, cBgBottom)
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)
    ctx.textBaseline = 'middle'

    // 1. 标题区
    ctx.textAlign = 'left'
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 62px sans-serif'
    ctx.fillText('比赛战报', 44, 88)
    ctx.fillStyle = cAccent
    ctx.font = 'bold 26px sans-serif'
    ctx.fillText('FULL TIME', 46, 132)
    // 右上胶囊：友谊赛 · 不计排名
    ctx.strokeStyle = cAccentSoft
    ctx.lineWidth = 2
    ctx.fillStyle = cAccentFill
    this.posterRoundRect(ctx, w - 264, 62, 220, 52, 26)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = cAccent
    ctx.font = '22px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('友谊赛 · 不计排名', w - 154, 88)

    // 2. 图片区（AI 背景 / 用户自选照片，cover 裁切）
    var imgX = 44
    var imgY = 170
    var imgW = w - 88
    var imgH = 430
    if (bgImg) {
      this.drawPosterCover(ctx, bgImg, imgX, imgY, imgW, imgH)
    } else {
      var fallback = ctx.createLinearGradient(0, imgY, 0, imgY + imgH)
      if (isParty) {
        fallback.addColorStop(0, '#7a4a10')
        fallback.addColorStop(1, '#2a1404')
      } else {
        fallback.addColorStop(0, '#0a5c36')
        fallback.addColorStop(1, '#032e1c')
      }
      ctx.fillStyle = fallback
      this.posterRoundRect(ctx, imgX, imgY, imgW, imgH, 20)
      ctx.fill()
    }

    // 3. 比分信息卡（日期 / 队名比分 / 胜负徽 / 进球者两列）
    var cardY = 630
    var cardH = 362
    ctx.fillStyle = cCard
    this.posterRoundRect(ctx, 44, cardY, imgW, cardH, 20)
    ctx.fill()

    // 3.1 日期 + 时长
    ctx.fillStyle = 'rgba(255,255,255,0.62)'
    ctx.font = '23px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(d.reportDateText + ' · 全场 ' + d.reportDurationText, w / 2, cardY + 38)

    // 3.2 队名行（左右分开，不与比分同行）
    ctx.font = 'bold 28px sans-serif'
    var homeName = this.posterFitText(ctx, d.teamName, 250)
    var awayName = this.posterFitText(ctx, d.opponentDisplay, 250)
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'left'
    ctx.fillText(homeName, 80, cardY + 92)
    ctx.textAlign = 'right'
    ctx.fillText(awayName, w - 80, cardY + 92)

    // 3.3 比分行（大比分居中 + 中缝两侧短横装饰）
    ctx.textAlign = 'center'
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 92px sans-serif'
    ctx.fillText(d.reportScoreText, w / 2, cardY + 158)
    ctx.fillStyle = cAccentSoft
    ctx.fillRect(44, cardY + 154, 90, 4)
    ctx.fillRect(w - 134, cardY + 154, 90, 4)

    // 3.4 胜负徽（比分下方独立一行）
    var badgeFill = 'rgba(255,255,255,0.16)'
    var badgeColor = '#dfe6e1'
    if (d.reportResultClass === 'win') {
      badgeFill = isParty ? 'rgba(255,183,77,0.24)' : 'rgba(88,220,146,0.22)'
      badgeColor = cAccent
    } else if (d.reportResultClass === 'lose') {
      badgeFill = 'rgba(255,120,110,0.2)'
      badgeColor = '#ff9f97'
    }
    ctx.fillStyle = badgeFill
    this.posterRoundRect(ctx, w / 2 - 62, cardY + 216, 124, 42, 21)
    ctx.fill()
    ctx.fillStyle = badgeColor
    ctx.font = 'bold 25px sans-serif'
    ctx.fillText(d.reportResultText === '平局' ? '平' : d.reportResultText, w / 2, cardY + 237)

    // 3.5 进球者两列（本队左 / 对手右，各最多 2 行，超出在标签计数）
    var scorers = d.scorers || []
    var homeList = []
    var awayList = []
    var i
    var row
    for (i = 0; i < scorers.length; i += 1) {
      row = scorers[i] || {}
      if (row.side === 'away') awayList.push(row)
      else homeList.push(row)
    }
    ctx.textAlign = 'left'
    ctx.font = '21px sans-serif'
    ctx.fillStyle = cAccent
    if (homeList.length) ctx.fillText('本队进球' + (homeList.length > 2 ? ' · 共' + homeList.length + '球' : ''), 80, cardY + 292)
    if (awayList.length) ctx.fillText('对手进球' + (awayList.length > 2 ? ' · 共' + awayList.length + '球' : ''), w / 2 + 36, cardY + 292)
    ctx.font = '24px sans-serif'
    var drawCol = function (list, baseX, maxX) {
      var shown = list.slice(0, 2)
      for (var j = 0; j < shown.length; j += 1) {
        var sr = shown[j] || {}
        var nm = text(sr.name) || '球员'
        var mt = text(sr.minuteText)
        ctx.fillStyle = '#ffffff'
        ctx.textAlign = 'left'
        ctx.fillText(nm, baseX, cardY + 320 + j * 30)
        ctx.fillStyle = cMinute
        ctx.textAlign = 'right'
        ctx.fillText(mt, maxX, cardY + 320 + j * 30)
      }
    }
    if (homeList.length) drawCol(homeList, 80, w / 2 - 30)
    if (awayList.length) drawCol(awayList, w / 2 + 36, w - 80)
    if (!scorers.length) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.textAlign = 'center'
      ctx.fillText('没有记录进球者', w / 2, cardY + 306)
    }

    // 4. 江湖简讯（小标题 + 两侧装饰线 + 大字三行正文）
    var story = text(d.reportStoryText)
    if (story) {
      ctx.textAlign = 'center'
      ctx.strokeStyle = cAccentSoft
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(w / 2 - 140, 1040)
      ctx.lineTo(w / 2 - 84, 1040)
      ctx.moveTo(w / 2 + 84, 1040)
      ctx.lineTo(w / 2 + 140, 1040)
      ctx.stroke()
      ctx.fillStyle = cAccent
      ctx.font = 'bold 25px sans-serif'
      ctx.fillText('江 湖 简 讯', w / 2, 1040)
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.font = '26px sans-serif'
      var storyLines = this.posterWrapText(ctx, story, w - 110, 3)
      for (i = 0; i < storyLines.length; i += 1) {
        ctx.fillText(storyLines[i], w / 2, 1082 + i * 38)
      }
    }

    // 5. 品牌条（白底圆角条：LOGO + 字标）
    var barH = 62
    var barY = h - barH - 24
    ctx.fillStyle = 'rgba(255,255,255,0.94)'
    this.posterRoundRect(ctx, 44, barY, imgW, barH, 31)
    ctx.fill()
    var drawBrand = function (logoImg) {
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      if (logoImg) {
        ctx.drawImage(logoImg, w / 2 - 208, barY + 11, 40, 40)
      }
      ctx.fillStyle = '#06371f'
      ctx.font = 'bold 27px sans-serif'
      ctx.fillText('赛小蜂足球 · 青少年赛事管理', w / 2 - 156, barY + barH / 2 + 1)
    }
    // LOGO 懒加载：先画文字版，LOGO 就绪后整体重绘一次（onload 回调里 _posterCanvas 尚未赋值，用传入的 canvas）
    var self = this
    if (!this._brandLogoImg && canvas) {
      drawBrand(null)
      try {
        var logoLoader = canvas.createImage()
        logoLoader.onload = function () {
          self._brandLogoImg = logoLoader
          self.drawPoster()
        }
        logoLoader.onerror = function () { self._brandLogoImg = 'none' }
        logoLoader.src = '/images/logo.png'
      } catch (e) { /* LOGO 加载失败不阻断 */ }
    } else if (this._brandLogoImg === 'none') {
      drawBrand(null)
    } else {
      drawBrand(this._brandLogoImg)
    }
  },

  // 换海报照片：相册/拍摄二选一，替换图片区素材并重绘（不落库，仅本机海报展示）
  onPickPosterPhoto: function () {
    var that = this
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: function (res) {
        var file = res.tempFiles && res.tempFiles[0]
        var path = text(file && file.tempFilePath)
        if (!path) return
        that._posterPhotoPath = path
        that.setData({ posterReady: false })
        that.drawPoster()
      },
      fail: function () { /* 用户取消选择 */ }
    })
  },

  onSavePoster: function () {
    var that = this
    var canvas = that._posterCanvas
    if (!canvas) {
      wx.showToast({ title: '海报未就绪', icon: 'none' })
      return
    }
    wx.canvasToTempFilePath({
      canvas: canvas,
      success: function (res) {
        var tempPath = res.tempFilePath
        wx.getSetting({
          success: function (settingRes) {
            if (settingRes.authSetting['scope.writePhotosAlbum'] === false) {
              wx.showModal({
                title: '需要相册权限',
                content: '请在设置中开启保存图片权限',
                confirmText: '去设置',
                success: function (mRes) {
                  if (mRes.confirm) wx.openSetting()
                }
              })
              return
            }
            wx.saveImageToPhotosAlbum({
              filePath: tempPath,
              success: function () {
                that.setData({ posterSavedPath: tempPath })
                wx.showToast({ title: '已保存到相册', icon: 'success' })
              },
              fail: function (err) {
                if (err && err.errMsg && err.errMsg.indexOf('auth') !== -1) {
                  wx.authorize({
                    scope: 'scope.writePhotosAlbum',
                    success: function () {
                      wx.saveImageToPhotosAlbum({ filePath: tempPath })
                    }
                  })
                } else {
                  wx.showToast({ title: '保存失败', icon: 'none' })
                }
              }
            })
          }
        })
      },
      fail: function () {
        wx.showToast({ title: '生成图片失败', icon: 'none' })
      }
    })
  }
})
