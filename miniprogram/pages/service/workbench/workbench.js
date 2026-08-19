Page({
  data: {
    loading: true,
    errorMsg: '',
    needsPhone: false,
    phoneMasked: '',
    refereeTasks: [],
    hasRefereeTasks: false,
    hasNoTasks: false,
    bindingPhone: false,
    bindPhone: '',
    bindCode: '',
    sendingCode: false
  },

  onLoad: function() {
    this.loadWorkbench()
  },

  onShow: function() {
    if (!this.data.loading) this.loadWorkbench()
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

  loadWorkbench: function() {
    var that = this
    that.setData({ loading: true, errorMsg: '' })
    that.callWorkflow({ action: 'getWorkbench' }, function(res) {
      var result = res.result || {}
      if (!result.success) {
        that.setData({
          loading: false,
          errorMsg: result.message || '裁判工作台加载失败',
          hasNoTasks: true
        })
        return
      }
      that.applyWorkbench(result.data || {})
    }, function(err) {
      console.error('[referee-workbench] load failed:', err)
      that.setData({ loading: false, errorMsg: '网络异常，请下拉重试', hasNoTasks: true })
    })
  },

  applyWorkbench: function(data) {
    var refereeTasks = (data.refereeTasks || []).map(function(item) {
      item.actionText = item.refereeActionText || '进入比赛'
      return item
    })
    var hasRefereeTasks = refereeTasks.length > 0
    this.setData({
      loading: false,
      needsPhone: !!data.needsPhone,
      phoneMasked: data.phoneMasked || '',
      refereeTasks: refereeTasks,
      hasRefereeTasks: hasRefereeTasks,
      hasNoTasks: !data.needsPhone && !hasRefereeTasks
    })
  },

  onBindPhoneInput: function(e) { this.setData({ bindPhone: e.detail.value }) },
  onBindCodeInput: function(e) { this.setData({ bindCode: e.detail.value }) },

  sendBindCode: function() {
    var phone = String(this.data.bindPhone || '').trim()
    if (!/^1[3-9]\d{9}$/.test(phone)) return wx.showToast({ title: '请输入正确手机号', icon: 'none' })
    if (this.data.sendingCode) return
    var that = this
    that.setData({ sendingCode: true })
    that.callWorkflow({ action: 'sendBindSms', phone: phone }, function(res) {
      that.setData({ sendingCode: false })
      var result = res.result || {}
      wx.showToast({ title: result.success ? '验证码已发送' : (result.message || '发送失败'), icon: 'none' })
    }, function(err) {
      that.setData({ sendingCode: false })
      console.error('[referee-workbench] send code failed:', err)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    })
  },

  verifyBindCode: function() {
    var phone = String(this.data.bindPhone || '').trim()
    var code = String(this.data.bindCode || '').trim()
    if (!/^1[3-9]\d{9}$/.test(phone) || !/^\d{6}$/.test(code)) return wx.showToast({ title: '请填写手机号和6位验证码', icon: 'none' })
    if (this.data.bindingPhone) return
    var that = this
    that.setData({ bindingPhone: true })
    that.callWorkflow({ action: 'verifyBindSms', phone: phone, code: code }, function(res) {
      that.setData({ bindingPhone: false })
      var result = res.result || {}
      if (!result.success) return wx.showModal({ title: '绑定失败', content: result.message || '请重试', showCancel: false })
      wx.showToast({ title: '身份绑定成功', icon: 'success' })
      that.loadWorkbench()
    }, function() {
      that.setData({ bindingPhone: false })
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    })
  },

  openRefereeTask: function(e) {
    var matchId = e.currentTarget.dataset.matchId || ''
    if (!matchId) return
    wx.navigateTo({ url: '/pages/referee/match/match?matchId=' + encodeURIComponent(matchId) })
  },

  retryLoad: function() {
    this.loadWorkbench()
  },

  onPullDownRefresh: function() {
    this.loadWorkbench()
    wx.stopPullDownRefresh()
  }
})
