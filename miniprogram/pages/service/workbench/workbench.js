Page({
  data: {
    loading: true,
    errorMsg: '',
    needsPhone: false,
    phoneMasked: '',
    refereeTasks: [],
    hasRefereeTasks: false,
    hasNoTasks: false,
    bindingPhone: false
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

  onGetPhoneNumber: function(e) {
    var code = e.detail && e.detail.code
    if (!code) {
      wx.showToast({ title: '需要手机号授权才能识别裁判身份', icon: 'none' })
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
        wx.showModal({ title: '识别失败', content: result.message || '请稍后重试', showCancel: false })
        return
      }
      wx.showToast({ title: '裁判身份已识别', icon: 'success' })
      that.loadWorkbench()
    }, function(err) {
      wx.hideLoading()
      that.setData({ bindingPhone: false })
      console.error('[referee-workbench] bind phone failed:', err)
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
