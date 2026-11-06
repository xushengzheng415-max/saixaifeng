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
    sendingCode: false,
    notifyQuota: 0,
    notifyQuotaCap: 5,
    notifyTemplateId: '',
    notifyQuotaFull: false
  },

  onLoad: function() {
    this.loadWorkbench()
    this.loadNotifySetting()
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

  // 执裁提醒：模板 ID 与剩余额度都由服务端下发，小程序端不硬编码模板 ID。
  loadNotifySetting: function() {
    var that = this
    that.callWorkflow({ action: 'getRefereeNotifySetting' }, function(res) {
      var result = res.result || {}
      if (!result.success || !result.data) return
      var quota = Number(result.data.quota) || 0
      var cap = Number(result.data.quotaCap) || 5
      that.setData({
        notifyQuota: quota,
        notifyQuotaCap: cap,
        notifyTemplateId: result.data.templateId || '',
        notifyQuotaFull: quota >= cap
      })
    }, function() {})
  },

  onEnableNotify: function() {
    var that = this
    var templateId = this.data.notifyTemplateId
    if (!templateId) {
      wx.showModal({ title: '暂不可开启', content: '执裁提醒模板尚未配置，请联系主办方', showCancel: false })
      return
    }
    if (this.data.notifyQuotaFull) {
      wx.showToast({ title: '提醒次数已满', icon: 'none' })
      return
    }
    // 必须在点击手势内调起订阅授权；一次授权可下发一条，可多次累积。
    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success: function(res) {
        if (res[templateId] !== 'accept') {
          wx.showToast({ title: '未开启提醒', icon: 'none' })
          return
        }
        that.callWorkflow({ action: 'refereeNotifySubscribe', accepted: true }, function(result) {
          var payload = (result && result.result) || {}
          if (!payload.success) {
            wx.showToast({ title: payload.message || '尚未找到裁判档案', icon: 'none' })
            return
          }
          var data = payload.data || {}
          var quota = Number(data.quota) || that.data.notifyQuota
          var cap = that.data.notifyQuotaCap
          that.setData({ notifyQuota: quota, notifyQuotaFull: quota >= cap })
          wx.showToast({ title: '已开启，剩余' + quota + '次', icon: 'none' })
        }, function() {
          wx.showToast({ title: '上报失败，请重试', icon: 'none' })
        })
      },
      fail: function() {
        wx.showToast({ title: '未开启提醒', icon: 'none' })
      }
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
