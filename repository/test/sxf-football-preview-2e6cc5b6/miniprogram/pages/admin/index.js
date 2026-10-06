// 隐藏协助确认页：仅通过微信客服发送的小程序码或8位数字码进入。
Page({
  data: {
    loading: true,
    previewLoading: false,
    accepting: false,
    rejecting: false,
    code: '',
    previewVisible: false,
    helperName: '',
    reason: '',
    durationLabel: '',
    permissionLabel: '',
    codeExpiresLabel: '',
    activeGrants: [],
    hasGrants: false,
    showEmpty: false
  },

  onLoad: function(options) {
    var code = this.parseCode(options || {})
    if (code) this.setData({ code: code })
    this.loadMyGrants()
    if (code) this.previewCode()
  },

  onPullDownRefresh: function() {
    var that = this
    that.loadMyGrants().finally(function() {
      wx.stopPullDownRefresh()
    })
  },

  parseCode: function(options) {
    var code = String(options.code || '').replace(/\D/g, '')
    if (code) return code.slice(0, 8)
    if (!options.scene) return ''
    var scene = decodeURIComponent(options.scene || '')
    if (scene.indexOf('a=') === 0) scene = scene.slice(2)
    return String(scene).replace(/\D/g, '').slice(0, 8)
  },

  requestService: function(action, payload) {
    return new Promise(function(resolve, reject) {
      wx.cloud.callFunction({
        name: 'platformOwner',
        data: Object.assign({ action: action }, payload || {}),
        success: function(res) {
          var result = res.result || {}
          if (result.success) resolve(result)
          else reject(new Error(result.error || '协助服务调用失败'))
        },
        fail: function(err) {
          reject(new Error(err.errMsg || '协助服务调用失败'))
        }
      })
    })
  },

  onCodeInput: function(e) {
    var code = String(e.detail.value || '').replace(/\D/g, '').slice(0, 8)
    this.setData({ code: code, previewVisible: false })
  },

  previewCode: function() {
    var that = this
    if (!/^\d{8}$/.test(that.data.code)) {
      wx.showToast({ title: '请输入8位数字协助码', icon: 'none' })
      return Promise.resolve()
    }
    that.setData({ previewLoading: true, previewVisible: false })
    return that.requestService('previewCode', { code: that.data.code }).then(function(result) {
      var request = result.request || {}
      that.setData({
        previewVisible: true,
        helperName: request.helperName || '赛小蜂工作人员',
        reason: request.reason || '协助排查赛小蜂足球使用问题',
        durationLabel: that.durationLabel(request.durationHours),
        permissionLabel: '查看、添加和修改资料；不允许删除',
        codeExpiresLabel: that.formatTime(request.codeExpiresAt)
      })
    }).catch(function(err) {
      wx.showToast({ title: err.message, icon: 'none', duration: 2600 })
    }).finally(function() {
      that.setData({ previewLoading: false })
    })
  },

  acceptCode: function() {
    var that = this
    wx.showModal({
      title: '确认临时协助',
      content: '同意后，赛小蜂工作人员可在有效期内查看、添加和修改您创建的资料，但不能删除。您可以随时撤销。',
      confirmText: '同意协助',
      confirmColor: '#2E7D32',
      success: function(modalResult) {
        if (!modalResult.confirm) return
        that.setData({ accepting: true })
        that.requestService('acceptCode', { code: that.data.code }).then(function(result) {
          that.setData({ previewVisible: false, code: '' })
          wx.showModal({
            title: '授权成功',
            content: result.message || '赛小蜂工作人员已获得临时协助权限，您可以随时在本页撤销。',
            showCancel: false,
            confirmText: '知道了'
          })
          return that.loadMyGrants()
        }).catch(function(err) {
          wx.showToast({ title: err.message, icon: 'none', duration: 2600 })
        }).finally(function() {
          that.setData({ accepting: false })
        })
      }
    })
  },

  rejectCode: function() {
    var that = this
    wx.showModal({
      title: '拒绝本次协助',
      content: '拒绝后，该协助码将立即失效。',
      confirmText: '确认拒绝',
      confirmColor: '#D32F2F',
      success: function(modalResult) {
        if (!modalResult.confirm) return
        that.setData({ rejecting: true })
        that.requestService('rejectCode', { code: that.data.code }).then(function() {
          that.setData({ previewVisible: false, code: '' })
          wx.showToast({ title: '已拒绝', icon: 'success' })
          return that.loadMyGrants()
        }).catch(function(err) {
          wx.showToast({ title: err.message, icon: 'none' })
        }).finally(function() {
          that.setData({ rejecting: false })
        })
      }
    })
  },

  loadMyGrants: function() {
    var that = this
    that.setData({ loading: true })
    return that.requestService('listMyGrants').then(function(result) {
      var grants = (result.requests || []).map(function(item) {
        var isActive = item.status === 'active'
        return {
          _id: item._id,
          helperName: item.helperName || '赛小蜂工作人员',
          reason: item.reason || '赛小蜂足球使用协助',
          statusLabel: item.statusLabel || '未知状态',
          statusClass: isActive ? 'status-active' : 'status-ended',
          isActive: isActive,
          canRevoke: isActive,
          expiresLabel: isActive ? that.formatTime(item.grantExpiresAt) : '权限已失效'
        }
      })
      that.setData({
        activeGrants: grants,
        hasGrants: grants.length > 0,
        showEmpty: grants.length === 0,
        loading: false
      })
    }).catch(function(err) {
      console.error('加载协助记录失败:', err)
      that.setData({ loading: false, showEmpty: true })
    })
  },

  revokeGrant: function(e) {
    var that = this
    var requestId = e.currentTarget.dataset.id
    if (!requestId) return
    wx.showModal({
      title: '立即撤销协助',
      content: '撤销后，工作人员将立即无法继续查看或修改您的资料。',
      confirmText: '立即撤销',
      confirmColor: '#D32F2F',
      success: function(modalResult) {
        if (!modalResult.confirm) return
        that.requestService('revokeMyGrant', { requestId: requestId }).then(function() {
          wx.showToast({ title: '权限已撤销', icon: 'success' })
          return that.loadMyGrants()
        }).catch(function(err) {
          wx.showToast({ title: err.message, icon: 'none' })
        })
      }
    })
  },

  durationLabel: function(hours) {
    var value = Number(hours || 2)
    if (value === 168) return '7天'
    return value + '小时'
  },

  formatTime: function(value) {
    if (!value) return '未知'
    var raw = value && typeof value === 'object' && value.$date ? value.$date : value
    var date = new Date(raw)
    if (isNaN(date.getTime())) return '未知'
    var pad = function(num) { return num < 10 ? '0' + num : String(num) }
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
  }
})
