Page({
  data: {
    matchId: '',
    loading: true,
    errorMsg: '',
    needsPhone: false,
    bindingPhone: false,
    tournamentName: '',
    teamsText: '',
    matchTimeText: '',
    venue: '',
    matchStatusText: '',
    homeTeamName: '主队',
    awayTeamName: '客队',
    homeScore: 0,
    awayScore: 0,
    events: [],
    hasEvents: false,
    canStart: false,
    canFinish: false,
    canRecordEvents: false,
    showUnavailable: false,
    showMatchContent: false,
    savingAction: false,
    showFinishModal: false,
    finishHomeScore: '0',
    finishAwayScore: '0',
    showEventModal: false,
    eventTypeOptions: [
      { value: 'goal', label: '进球' },
      { value: 'yellow_card', label: '黄牌' },
      { value: 'red_card', label: '红牌' },
      { value: 'substitution', label: '换人' },
      { value: 'penalty', label: '点球' },
      { value: 'own_goal', label: '乌龙球' }
    ],
    eventTypeIndex: 0,
    eventType: 'goal',
    eventTypeLabel: '进球',
    eventTeamOptions: [],
    eventTeamIndex: 0,
    eventTeamSide: 'home',
    eventTeamLabel: '主队',
    eventMinute: '',
    eventPlayerName: '',
    eventAssistName: '',
    eventPlayerLabel: '进球球员',
    eventAssistLabel: '助攻球员（选填）',
    showAssistField: true
  },

  onLoad: function(options) {
    var matchId = options && options.matchId ? decodeURIComponent(options.matchId) : ''
    this.setData({ matchId: matchId })
    if (!matchId) {
      this.setData({ loading: false, errorMsg: '缺少比赛参数' })
      return
    }
    this.loadMatch()
  },

  onShow: function() {
    if (this.data.matchId && !this.data.loading && !this.data.showFinishModal && !this.data.showEventModal) {
      this.loadMatch()
    }
  },

  callWorkflow: function(data, success, fail) {
    wx.cloud.callFunction({
      name: 'serviceMatchWorkflow',
      data: data || {},
      timeout: 20000,
      success: success,
      fail: fail
    })
  },

  loadMatch: function() {
    var that = this
    that.setData({ loading: true, errorMsg: '', showMatchContent: false })
    that.callWorkflow({ action: 'getRefereeMatch', matchId: that.data.matchId }, function(res) {
      var result = res.result || {}
      if (!result.success) {
        that.setData({
          loading: false,
          needsPhone: result.code === 'PHONE_REQUIRED',
          errorMsg: result.code === 'PHONE_REQUIRED' ? '' : (result.message || '比赛加载失败'),
          showMatchContent: false
        })
        return
      }
      that.applyMatch(result.data || {})
    }, function(err) {
      console.error('[referee-match] load failed:', err)
      that.setData({ loading: false, errorMsg: '网络异常，请下拉重试', showMatchContent: false })
    })
  },

  applyMatch: function(data) {
    var match = data.match || {}
    var homeTeamName = match.homeTeamName || '主队'
    var awayTeamName = match.awayTeamName || '客队'
    var canStart = !!match.canStart
    var canFinish = !!match.canFinish
    var canRecordEvents = !!match.canRecordEvents
    this.setData({
      loading: false,
      errorMsg: '',
      needsPhone: false,
      showMatchContent: true,
      tournamentName: match.tournamentName || '赛事',
      teamsText: match.teamsText || '',
      matchTimeText: match.matchTimeText || '时间待定',
      venue: match.venue || '场地待定',
      matchStatusText: match.matchStatusText || '',
      homeTeamName: homeTeamName,
      awayTeamName: awayTeamName,
      homeScore: match.homeScore || 0,
      awayScore: match.awayScore || 0,
      events: match.events || [],
      hasEvents: !!match.hasEvents,
      canStart: canStart,
      canFinish: canFinish,
      canRecordEvents: canRecordEvents,
      showUnavailable: !canStart && !canFinish && !canRecordEvents,
      eventTeamOptions: [
        { value: 'home', label: '主队 · ' + homeTeamName },
        { value: 'away', label: '客队 · ' + awayTeamName }
      ],
      eventTeamLabel: '主队 · ' + homeTeamName
    })
  },

  onGetPhoneNumber: function(e) {
    var code = e.detail && e.detail.code
    if (!code) {
      wx.showToast({ title: '需要手机号授权才能核验裁判身份', icon: 'none' })
      return
    }
    if (this.data.bindingPhone) return
    var that = this
    that.setData({ bindingPhone: true })
    wx.showLoading({ title: '正在识别裁判...' })
    that.callWorkflow({ action: 'bindPhone', phoneCode: code }, function(res) {
      wx.hideLoading()
      that.setData({ bindingPhone: false })
      var result = res.result || {}
      if (!result.success) {
        wx.showModal({ title: '身份识别失败', content: result.message || '请重试', showCancel: false })
        return
      }
      that.loadMatch()
    }, function(err) {
      wx.hideLoading()
      that.setData({ bindingPhone: false })
      console.error('[referee-match] bind failed:', err)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    })
  },

  startMatch: function() {
    if (this.data.savingAction) return
    var that = this
    wx.showModal({
      title: '开始执裁',
      content: '确认本场比赛现在开始？',
      confirmText: '确认开始',
      success: function(modalResult) {
        if (!modalResult.confirm) return
        that.setData({ savingAction: true })
        wx.showLoading({ title: '正在开始...' })
        that.callWorkflow({ action: 'startRefereeMatch', matchId: that.data.matchId }, function(res) {
          wx.hideLoading()
          that.setData({ savingAction: false })
          var result = res.result || {}
          if (!result.success) {
            wx.showModal({ title: '开始失败', content: result.message || '请重试', showCancel: false })
            return
          }
          wx.showToast({ title: '比赛已开始', icon: 'success' })
          that.loadMatch()
        }, function(err) {
          wx.hideLoading()
          that.setData({ savingAction: false })
          console.error('[referee-match] start failed:', err)
          wx.showToast({ title: '网络异常，请重试', icon: 'none' })
        })
      }
    })
  },

  openFinishModal: function() {
    this.setData({
      showFinishModal: true,
      finishHomeScore: String(this.data.homeScore || 0),
      finishAwayScore: String(this.data.awayScore || 0)
    })
  },

  closeFinishModal: function() {
    if (this.data.savingAction) return
    this.setData({ showFinishModal: false })
  },

  onFinishHomeScoreInput: function(e) {
    this.setData({ finishHomeScore: e.detail.value })
  },

  onFinishAwayScoreInput: function(e) {
    this.setData({ finishAwayScore: e.detail.value })
  },

  finishMatch: function() {
    if (this.data.savingAction) return
    var homeScore = Number(this.data.finishHomeScore)
    var awayScore = Number(this.data.finishAwayScore)
    if (!Number.isInteger(homeScore) || homeScore < 0 || homeScore > 99 || !Number.isInteger(awayScore) || awayScore < 0 || awayScore > 99) {
      wx.showToast({ title: '请输入0至99之间的有效比分', icon: 'none' })
      return
    }
    var that = this
    that.setData({ savingAction: true })
    wx.showLoading({ title: '正在保存比分...' })
    that.callWorkflow({
      action: 'finishRefereeMatch',
      matchId: that.data.matchId,
      homeScore: homeScore,
      awayScore: awayScore
    }, function(res) {
      wx.hideLoading()
      that.setData({ savingAction: false })
      var result = res.result || {}
      if (!result.success) {
        wx.showModal({ title: '结束失败', content: result.message || '请重试', showCancel: false })
        return
      }
      that.setData({ showFinishModal: false })
      wx.showToast({ title: '比分已保存', icon: 'success' })
      that.loadMatch()
    }, function(err) {
      wx.hideLoading()
      that.setData({ savingAction: false })
      console.error('[referee-match] finish failed:', err)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    })
  },

  openEventModal: function() {
    this.setData({
      showEventModal: true,
      eventTypeIndex: 0,
      eventType: 'goal',
      eventTypeLabel: '进球',
      eventTeamIndex: 0,
      eventTeamSide: 'home',
      eventTeamLabel: this.data.eventTeamOptions[0] ? this.data.eventTeamOptions[0].label : '主队',
      eventMinute: '',
      eventPlayerName: '',
      eventAssistName: '',
      eventPlayerLabel: '进球球员',
      eventAssistLabel: '助攻球员（选填）',
      showAssistField: true
    })
  },

  closeEventModal: function() {
    if (this.data.savingAction) return
    this.setData({ showEventModal: false })
  },

  preventBubble: function() {},

  onEventTypeChange: function(e) {
    var index = Number(e.detail.value)
    var option = this.data.eventTypeOptions[index] || this.data.eventTypeOptions[0]
    var isSubstitution = option.value === 'substitution'
    var isGoal = option.value === 'goal'
    this.setData({
      eventTypeIndex: index,
      eventType: option.value,
      eventTypeLabel: option.label,
      eventPlayerLabel: isSubstitution ? '换上球员' : (isGoal ? '进球球员' : '球员姓名'),
      eventAssistLabel: isSubstitution ? '换下球员（选填）' : '助攻球员（选填）',
      showAssistField: isSubstitution || isGoal,
      eventAssistName: ''
    })
  },

  onEventTeamChange: function(e) {
    var index = Number(e.detail.value)
    var option = this.data.eventTeamOptions[index] || this.data.eventTeamOptions[0]
    this.setData({
      eventTeamIndex: index,
      eventTeamSide: option.value,
      eventTeamLabel: option.label
    })
  },

  onEventMinuteInput: function(e) {
    this.setData({ eventMinute: e.detail.value })
  },

  onEventPlayerInput: function(e) {
    this.setData({ eventPlayerName: e.detail.value })
  },

  onEventAssistInput: function(e) {
    this.setData({ eventAssistName: e.detail.value })
  },

  saveEvent: function() {
    if (this.data.savingAction) return
    var minute = Number(this.data.eventMinute)
    var playerName = String(this.data.eventPlayerName || '').trim()
    if (!Number.isInteger(minute) || minute < 0 || minute > 130) {
      wx.showToast({ title: '请输入0至130的比赛分钟', icon: 'none' })
      return
    }
    if (!playerName) {
      wx.showToast({ title: '请输入球员姓名', icon: 'none' })
      return
    }
    var that = this
    that.setData({ savingAction: true })
    wx.showLoading({ title: '正在保存事件...' })
    that.callWorkflow({
      action: 'addRefereeEvent',
      matchId: that.data.matchId,
      type: that.data.eventType,
      teamSide: that.data.eventTeamSide,
      minute: minute,
      playerName: playerName,
      assistName: String(that.data.eventAssistName || '').trim()
    }, function(res) {
      wx.hideLoading()
      that.setData({ savingAction: false })
      var result = res.result || {}
      if (!result.success) {
        wx.showModal({ title: '保存失败', content: result.message || '请重试', showCancel: false })
        return
      }
      that.setData({ showEventModal: false })
      wx.showToast({ title: '事件已保存', icon: 'success' })
      that.loadMatch()
    }, function(err) {
      wx.hideLoading()
      that.setData({ savingAction: false })
      console.error('[referee-match] event save failed:', err)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    })
  },

  deleteEvent: function(e) {
    if (this.data.savingAction) return
    var eventId = e.currentTarget.dataset.eventId || ''
    if (!eventId) return
    var that = this
    wx.showModal({
      title: '删除比赛事件',
      content: '确认删除这条记录？系统会保留操作痕迹。',
      confirmText: '确认删除',
      confirmColor: '#C62828',
      success: function(modalResult) {
        if (!modalResult.confirm) return
        that.setData({ savingAction: true })
        wx.showLoading({ title: '正在删除...' })
        that.callWorkflow({
          action: 'deleteRefereeEvent',
          matchId: that.data.matchId,
          eventId: eventId
        }, function(res) {
          wx.hideLoading()
          that.setData({ savingAction: false })
          var result = res.result || {}
          if (!result.success) {
            wx.showModal({ title: '删除失败', content: result.message || '请重试', showCancel: false })
            return
          }
          wx.showToast({ title: '事件已删除', icon: 'success' })
          that.loadMatch()
        }, function(err) {
          wx.hideLoading()
          that.setData({ savingAction: false })
          console.error('[referee-match] event delete failed:', err)
          wx.showToast({ title: '网络异常，请重试', icon: 'none' })
        })
      }
    })
  },

  retryLoad: function() {
    this.loadMatch()
  },

  onPullDownRefresh: function() {
    this.loadMatch()
    wx.stopPullDownRefresh()
  }
})
