Page({
  data: {
    loading: true,
    loadError: '',
    matchId: '',
    token: '',
    teamName: '',
    homeShort: '队',
    opponentName: '',
    awayShort: '客',
    matchDate: '',
    matchTime: '',
    venue: '',
    maxPlayers: 0,
    signedUpCount: 0,
    closed: false,
    closedReason: '',
    signed: false,
    userName: '',
    userPhone: '',
    submitBtnClass: 'qs-submit-disabled',
    submitting: false
  },

  onLoad: function (options) {
    var profile = wx.getStorageSync('sxf_user_profile') || {}
    this.setData({
      matchId: options.matchId || '',
      token: options.token || '',
      userName: profile.name || profile.nickName || '',
      userPhone: profile.phone || profile.phoneNumber || ''
    })
    this.loadMatch()
  },

  refreshBtn: function () {
    var d = this.data
    var ready = d.userName && d.userPhone && !d.submitting && !d.signed
    this.setData({ submitBtnClass: ready ? '' : 'qs-submit-disabled' })
  },

  onNameInput: function (e) { this.setData({ userName: e.detail.value }); this.refreshBtn() },
  onPhoneInput: function (e) { this.setData({ userPhone: e.detail.value }); this.refreshBtn() },

  loadMatch: function () {
    var that = this
    var d = this.data
    if (!d.matchId) {
      this.setData({ loading: false, loadError: '缺少比赛信息，请从群卡片重新进入' })
      return
    }
    wx.cloud.callFunction({
      name: 'friendlyMatchCenter',
      data: { action: 'getMatch', matchId: d.matchId, token: d.token }
    }).then(function (res) {
      var r = (res && res.result) || {}
      if (!r.ok) throw new Error(r.message || '比赛不存在或已过期')
      var m = r.data || {}
      var closed = m.status !== 'signup'
      var closedReason = ''
      if (m.status === 'signup' && (m.signedUpCount || 0) >= (m.maxPlayers || 0)) {
        closed = true
        closedReason = '人数已满员'
      } else if (m.status === 'upcoming') {
        closedReason = '报名已截止，比赛即将开始'
      } else if (m.status === 'finished') {
        closedReason = '比赛已结束'
      }
      that.setData({
        loading: false,
        teamName: m.teamName || '',
        homeShort: (m.teamName || '队').slice(0, 2),
        opponentName: m.opponentName || '',
        awayShort: (m.opponentName || '对手').slice(0, 2),
        matchDate: m.matchDate || '',
        matchTime: m.matchTime || '',
        venue: m.venue || '',
        maxPlayers: m.maxPlayers || 0,
        signedUpCount: m.signedUpCount || 0,
        closed: closed,
        closedReason: closedReason
      })
    }).catch(function (err) {
      that.setData({ loading: false, loadError: (err && err.message) || '加载失败' })
    })
  },

  onSignup: function () {
    var that = this
    var d = this.data
    if (d.submitting || d.signed || d.closed) return
    if (!d.userName) { wx.showToast({ title: '请填写姓名', icon: 'none' }); return }
    if (!d.userPhone || d.userPhone.length < 11) { wx.showToast({ title: '请填写 11 位手机号', icon: 'none' }); return }

    d.submitting = true
    this.refreshBtn()
    wx.showLoading({ title: '报名中', mask: true })

    wx.cloud.callFunction({
      name: 'friendlyMatchCenter',
      data: {
        action: 'signUpForMatch',
        matchId: d.matchId,
        token: d.token,
        userName: d.userName,
        userPhone: d.userPhone
      }
    }).then(function (res) {
      wx.hideLoading()
      var r = (res && res.result) || {}
      if (!r.ok) throw new Error(r.message || '报名失败')
      d.submitting = false
      that.setData({
        submitting: false,
        signed: true,
        signedUpCount: (d.signedUpCount || 0) + 1
      })
    }).catch(function (err) {
      wx.hideLoading()
      d.submitting = false
      that.setData({ submitting: false })
      that.refreshBtn()
      wx.showToast({ title: (err && err.message) || '报名失败', icon: 'none' })
    })
  }
})
