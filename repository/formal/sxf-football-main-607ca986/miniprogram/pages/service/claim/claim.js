Page({
  data: {
    tokenId: '',
    codeInput: '',
    loading: false,
    errorMsg: '',
    needsPhone: true,
    bindingPhone: false,
    hasPreview: false,
    tournamentName: '',
    teamName: '',
    opponentName: '',
    matchTimeText: '',
    venue: '',
    alreadyClaimed: false,
    claimed: false,
    matchId: '',
    teamId: '',
    claimButtonText: '确认认领本队名单'
  },

  onLoad: function(options) {
    var tokenId = ''
    if (options && options.scene) tokenId = decodeURIComponent(options.scene)
    if (!tokenId && options) tokenId = options.tokenId || options.code || ''
    tokenId = String(tokenId || '').trim().toLowerCase()
    this.setData({ tokenId: tokenId, codeInput: tokenId })
    this.checkIdentity()
    if (tokenId) this.loadPreview()
  },

  callWorkflow: function(data, success, fail) {
    wx.cloud.callFunction({ name: 'serviceMatchWorkflow', data: data || {}, timeout: 20000, success: success, fail: fail })
  },

  checkIdentity: function() {
    var that = this
    that.callWorkflow({ action: 'getWorkbench' }, function(res) {
      var result = res.result || {}
      var data = result.data || {}
      that.setData({ needsPhone: !!data.needsPhone })
    }, function() {})
  },

  onCodeInput: function(e) {
    this.setData({ codeInput: String(e.detail.value || '').trim().toLowerCase() })
  },

  confirmCode: function() {
    var tokenId = this.data.codeInput
    if (!tokenId) {
      wx.showToast({ title: '请输入认领码', icon: 'none' })
      return
    }
    this.setData({ tokenId: tokenId, errorMsg: '', claimed: false })
    this.loadPreview()
  },

  loadPreview: function() {
    var that = this
    if (!that.data.tokenId) return
    that.setData({ loading: true, errorMsg: '', hasPreview: false })
    that.callWorkflow({ action: 'getClaimPreview', tokenId: that.data.tokenId }, function(res) {
      var result = res.result || {}
      if (!result.success) {
        that.setData({ loading: false, errorMsg: result.message || '认领码无效' })
        return
      }
      var data = result.data || {}
      that.setData({
        loading: false,
        hasPreview: true,
        tournamentName: data.tournamentName || '赛事',
        teamName: data.teamName || '球队',
        opponentName: data.opponentName || '对手球队',
        matchTimeText: data.matchTimeText || '时间待定',
        venue: data.venue || '场地待定',
        alreadyClaimed: !!data.alreadyClaimed,
        matchId: data.matchId || '',
        teamId: data.teamId || '',
        claimButtonText: data.alreadyClaimed ? '验证并进入首发提交' : '确认认领本队名单'
      })
    }, function(err) {
      console.error('[service-claim] preview failed:', err)
      that.setData({ loading: false, errorMsg: '网络异常，请重试' })
    })
  },

  onGetPhoneNumber: function(e) {
    var code = e.detail && e.detail.code
    if (!code) {
      wx.showToast({ title: '需要手机号授权才能认领', icon: 'none' })
      return
    }
    if (this.data.bindingPhone) return
    var that = this
    that.setData({ bindingPhone: true })
    wx.showLoading({ title: '正在认领...' })
    that.callWorkflow({ action: 'bindPhone', phoneCode: code }, function(res) {
      var result = res.result || {}
      if (!result.success) {
        wx.hideLoading()
        that.setData({ bindingPhone: false })
        wx.showModal({ title: '手机号授权失败', content: result.message || '请重试', showCancel: false })
        return
      }
      that.setData({ needsPhone: false })
      that.doClaim(true)
    }, function(err) {
      wx.hideLoading()
      that.setData({ bindingPhone: false })
      console.error('[service-claim] bind failed:', err)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    })
  },

  claimTeam: function() {
    this.doClaim(false)
  },

  doClaim: function(keepLoading) {
    var that = this
    if (!that.data.tokenId) return
    if (!keepLoading) wx.showLoading({ title: '正在认领...' })
    that.callWorkflow({ action: 'claimTeam', tokenId: that.data.tokenId }, function(res) {
      wx.hideLoading()
      that.setData({ bindingPhone: false })
      var result = res.result || {}
      if (!result.success) {
        wx.showModal({ title: '认领失败', content: result.message || '请联系裁判处理', showCancel: false })
        return
      }
      var data = result.data || {}
      that.setData({
        claimed: true,
        hasPreview: false,
        matchId: data.matchId || that.data.matchId,
        teamId: data.teamId || that.data.teamId
      })
      wx.showToast({ title: '认领成功', icon: 'success' })
    }, function(err) {
      wx.hideLoading()
      that.setData({ bindingPhone: false })
      console.error('[service-claim] claim failed:', err)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    })
  },

  goLineup: function() {
    if (!this.data.matchId || !this.data.teamId) return
    wx.redirectTo({
      url: '/pages/service/lineup/lineup?matchId=' + encodeURIComponent(this.data.matchId) + '&teamId=' + encodeURIComponent(this.data.teamId)
    })
  },

  goWorkbench: function() {
    wx.redirectTo({ url: '/pages/service/workbench/workbench' })
  }
})
