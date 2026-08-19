// pages/login/login.js - 仅微信授权登录
var workspace = require('../../utils/workspace')
var AUTH_SESSION_VERSION = 'wechat-only-v1'
var AUTH_STORAGE_KEYS = [
  'userInfo', 'userId', 'phoneNumber', 'phone', 'email',
  'hasPassword', 'currentCardId', 'currentTeam', 'currentTeamId',
  'currentTeamIndex', 'teamInfo', 'coachInfo', 'myTeams',
  'workspaceContext', 'currentWorkspaceId'
]

function isDevtools() {
  try { return wx.getSystemInfoSync().platform === 'devtools' } catch (error) { return false }
}

Page({
  data: {
    agreementChecked: false,
    isSubmitting: false,
    openId: '',
    redirectUrl: '',
    checkboxClass: '',
    loginButtonText: '微信授权登录',
    localVisualQa: false
  },

  onLoad: function(options) {
    if (isDevtools() && options && options.visualQa === '1') {
      this.setData({
        localVisualQa: true,
        agreementChecked: true,
        checkboxClass: 'checked'
      })
      return
    }
    var redirectUrl = options && (options.redirect || options.redirectUrl)
      ? decodeURIComponent(options.redirect || options.redirectUrl)
      : (wx.getStorageSync('loginRedirectUrl') || '')
    this.setData({ redirectUrl: redirectUrl })
    if (redirectUrl) wx.setStorageSync('loginRedirectUrl', redirectUrl)
    this.clearLegacyBindingState()
    if (wx.getStorageSync('userLoggedOut') !== 'true') this.validateExistingWechatSession()
  },

  callCloud: function(name, data, success, fail, timeout) {
    wx.cloud.callFunction({
      name: name,
      data: data || {},
      timeout: timeout || 20000,
      success: success,
      fail: function(err) {
        console.error('[login] 云函数调用失败:', name, err)
        if (fail) fail(err)
      }
    })
  },

  clearLegacyBindingState: function() {
    wx.removeStorageSync('phoneNumber')
    wx.removeStorageSync('phone')
    wx.removeStorageSync('email')
    wx.removeStorageSync('hasPassword')
    wx.setStorageSync('authSessionVersion', AUTH_SESSION_VERSION)
  },

  clearAuthSession: function() {
    AUTH_STORAGE_KEYS.forEach(function(key) { wx.removeStorageSync(key) })
    var app = getApp()
    if (app && app.globalData) app.globalData.userInfo = null
  },

  ensureOpenId: function(callback) {
    var that = this
    var cachedOpenId = this.data.openId || wx.getStorageSync('openId') || ''
    if (cachedOpenId) {
      callback(cachedOpenId)
      return
    }
    this.callCloud('getOpenId', {}, function(res) {
      var result = res.result || {}
      var openId = result.openId || result.OPENID || ''
      if (openId) {
        that.setData({ openId: openId })
        wx.setStorageSync('openId', openId)
      }
      callback(openId)
    }, function() { callback('') }, 15000)
  },

  validateExistingWechatSession: function() {
    var that = this
    this.ensureOpenId(function(openId) {
      if (!openId) return
      that.callCloud('checkUserByOpenId', { openId: openId }, function(res) {
        var result = res.result || {}
        if (result.success && result.isRegistered && result.user) {
          that.finishLogin(result.user, false)
        } else {
          that.clearAuthSession()
        }
      }, function() {}, 15000)
    })
  },

  toggleAgreement: function() {
    var checked = !this.data.agreementChecked
    this.setData({
      agreementChecked: checked,
      checkboxClass: checked ? 'checked' : ''
    })
  },

  loginWithWechat: function() {
    var that = this
    if (!this.data.agreementChecked) {
      wx.showToast({ title: '请先同意用户协议和隐私政策', icon: 'none' })
      return
    }
    if (this.data.isSubmitting) return

    wx.removeStorageSync('userLoggedOut')
    this.setData({ isSubmitting: true, loginButtonText: '登录中...' })
    wx.showLoading({ title: '微信登录中...' })

    this.ensureOpenId(function(openId) {
      if (!openId) {
        wx.hideLoading()
        that.resetSubmitState()
        wx.showToast({ title: '获取微信身份失败，请重试', icon: 'none' })
        return
      }

      that.callCloud('checkUserByOpenId', {
        openId: openId,
        createIfMissing: true,
        nickName: '微信用户',
        avatarUrl: ''
      }, function(res) {
        wx.hideLoading()
        that.resetSubmitState()
        var result = res.result || {}
        if (result.success && result.isRegistered && result.user) {
          that.finishLogin(result.user, true)
          return
        }
        wx.showToast({ title: result.message || '微信登录失败，请重试', icon: 'none' })
      }, function() {
        wx.hideLoading()
        that.resetSubmitState()
        wx.showToast({ title: '登录失败，请检查网络', icon: 'none' })
      }, 20000)
    })
  },

  loginWithPhone: function() {
    wx.navigateTo({ url: '/pages/login/phone-login/phone-login' })
  },

  resetSubmitState: function() {
    this.setData({ isSubmitting: false, loginButtonText: '微信授权登录' })
  },

  finishLogin: function(user, showSuccess) {
    var userInfo = {
      _id: user._id || '',
      openId: user.openId || this.data.openId || '',
      orgId: user.orgId || user.organizationId || '',
      nickName: user.nickName || '微信用户',
      avatarUrl: user.avatarUrl || '',
      loginTime: new Date().toISOString()
    }
    this.clearAuthSession()
    wx.removeStorageSync('userLoggedOut')
    wx.setStorageSync('authSessionVersion', AUTH_SESSION_VERSION)
    wx.setStorageSync('userInfo', userInfo)
    wx.setStorageSync('openId', userInfo.openId)
    wx.setStorageSync('userId', userInfo._id)
    var app = getApp()
    if (app && app.globalData) app.globalData.userInfo = userInfo
    if (showSuccess) wx.showToast({ title: '登录成功', icon: 'success' })
    this.goToPostLogin()
  },

  goToPostLogin: function() {
    var that = this
    this.callCloud('onboardingWorkspace', { action: 'state' }, function(res) {
      var result = res.result || {}
      if (result.success && result.organizationConflict) {
        workspace.clearContext()
        that.clearAuthSession()
        wx.showModal({
          title: '机构关系待核验',
          content: '当前账号关联了多个机构，系统不会自动选择。请联系管理员完成机构归属核验。',
          showCancel: false
        })
        return
      }
      if (result.success && result.requiresOnboarding) {
        wx.redirectTo({ url: '/pages/onboarding/onboarding' })
        return
      }
      that.goToHome()
    }, function() {
      // 无法确认关系时不阻断已有账号；服务端恢复后下次登录会重新判断。
      that.goToHome()
    }, 15000)
  },

  goToHome: function() {
    var redirectUrl = this.data.redirectUrl || wx.getStorageSync('loginRedirectUrl') || ''
    setTimeout(function() {
      if (redirectUrl && redirectUrl.indexOf('/pages/') === 0) {
        wx.removeStorageSync('loginRedirectUrl')
        wx.redirectTo({ url: redirectUrl })
      } else {
        wx.switchTab({ url: '/pages/home/home' })
      }
    }, 500)
  },

  devLogin: function() {
    console.log('[login] 微信单路径登录页')
  },

  showUserAgreement: function() {
    wx.navigateTo({ url: '/pages/login/agreement/agreement?type=user' })
  },

  showPrivacyPolicy: function() {
    wx.navigateTo({ url: '/pages/login/agreement/agreement?type=privacy' })
  }
})
