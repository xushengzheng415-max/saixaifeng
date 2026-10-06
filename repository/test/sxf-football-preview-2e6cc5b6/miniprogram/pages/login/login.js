// pages/login/login.js - 手机号主账号登录
var workspace = require('../../utils/workspace')
var AUTH_SESSION_VERSION = 'phone-canonical-v1'
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
    loginButtonText: '手机号快捷登录',
    loginDisabled: true,
    localVisualQa: false,
    guestHomeStyle: ''
  },

  onLoad: function(options) {
    this.updateGuestHomePosition()
    if (isDevtools() && options && options.visualQa === '1') {
      this.setData({
        localVisualQa: true,
        agreementChecked: true,
        checkboxClass: 'checked',
        loginDisabled: false
      })
      return
    }
    var redirectUrl = options && (options.redirect || options.redirectUrl)
      ? decodeURIComponent(options.redirect || options.redirectUrl)
      : (wx.getStorageSync('loginRedirectUrl') || '')
    this.setData({ redirectUrl: redirectUrl })
    if (redirectUrl) wx.setStorageSync('loginRedirectUrl', redirectUrl)
    this.clearLegacyBindingState()
    if (!wx.getStorageSync('userLoggedOut')) this.validateExistingSession()
  },

  updateGuestHomePosition: function() {
    var top = 54
    try {
      var menuRect = wx.getMenuButtonBoundingClientRect()
      var systemInfo = wx.getSystemInfoSync()
      var statusBarHeight = Number(systemInfo.statusBarHeight || 0)
      var menuTop = Number(menuRect && menuRect.top || 0)
      top = Math.max(menuTop + 6, statusBarHeight + 18, 46)
    } catch (error) {
      console.warn('[login] 游客入口安全区读取失败，使用兼容位置:', error)
    }
    this.setData({ guestHomeStyle: 'top:' + top + 'px;' })
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

  validateExistingSession: function() {
    var that = this
    this.ensureOpenId(function(openId) {
      if (!openId) return
      that.callCloud('checkUserByOpenId', { openId: openId }, function(res) {
        var result = res.result || {}
        if (result.success && result.isRegistered && result.user) {
          that.finishLogin(result.user, false)
        } else {
          that.clearAuthSession()
          if (result.requiresPhoneAuthorization) {
            that.setData({ loginButtonText: '手机号快捷登录' })
          }
        }
      }, function() {}, 15000)
    })
  },

  toggleAgreement: function() {
    var checked = !this.data.agreementChecked
    this.setData({
      agreementChecked: checked,
      checkboxClass: checked ? 'checked' : '',
      loginDisabled: !checked || this.data.isSubmitting
    })
  },

  goToGuestHome: function() {
    wx.switchTab({ url: '/pages/home/home' })
  },

  loginWithPhone: function(event) {
    var that = this
    if (!this.data.agreementChecked) {
      wx.showToast({ title: '请先同意用户协议和隐私政策', icon: 'none' })
      return
    }
    if (this.data.isSubmitting) return
    var phoneCode = event && event.detail && event.detail.code
    if (!phoneCode) {
      var message = event && event.detail && event.detail.errMsg
      wx.showToast({
        title: message && message.indexOf('deny') >= 0 ? '需授权手机号后才能登录' : '未获取到手机号，请重试',
        icon: 'none'
      })
      return
    }

    wx.removeStorageSync('userLoggedOut')
    this.setData({ isSubmitting: true, loginDisabled: true, loginButtonText: '验证手机号中...' })
    wx.showLoading({ title: '正在验证账号...' })

    this.ensureOpenId(function(openId) {
      if (!openId) {
        wx.hideLoading()
        that.resetSubmitState()
        wx.showToast({ title: '获取账号身份失败，请重试', icon: 'none' })
        return
      }

      that.callCloud('checkUserByOpenId', {
        openId: openId,
        phoneCode: phoneCode,
        nickName: '用户',
        avatarUrl: ''
      }, function(res) {
        wx.hideLoading()
        that.resetSubmitState()
        var result = res.result || {}
        if (result.success && result.isRegistered && result.user) {
          that.finishLogin(result.user, true)
          return
        }
        wx.showToast({ title: result.message || '手机号登录失败，请重试', icon: 'none' })
      }, function() {
        wx.hideLoading()
        that.resetSubmitState()
        wx.showToast({ title: '登录失败，请检查网络', icon: 'none' })
      }, 20000)
    })
  },

  resetSubmitState: function() {
    this.setData({
      isSubmitting: false,
      loginDisabled: !this.data.agreementChecked,
      loginButtonText: '手机号快捷登录'
    })
  },

  finishLogin: function(user, showSuccess) {
    var userInfo = {
      _id: user._id || '',
      openId: user.openId || this.data.openId || '',
      phone: user.phone || user.phoneNumber || '',
      phoneNumber: user.phoneNumber || user.phone || '',
      orgId: user.orgId || user.organizationId || '',
      nickName: user.nickName || '用户',
      avatarUrl: user.avatarUrl || '',
      loginTime: new Date().toISOString()
    }
    this.clearAuthSession()
    wx.removeStorageSync('userLoggedOut')
    wx.setStorageSync('authSessionVersion', AUTH_SESSION_VERSION)
    wx.setStorageSync('userInfo', userInfo)
    wx.setStorageSync('openId', userInfo.openId)
    wx.setStorageSync('userId', userInfo._id)
    wx.setStorageSync('phone', userInfo.phone)
    wx.setStorageSync('phoneNumber', userInfo.phoneNumber)
    var app = getApp()
    if (app && app.globalData) app.globalData.userInfo = userInfo
    if (showSuccess) wx.showToast({ title: '登录成功', icon: 'success' })
    this.goToPostLogin()
  },

  goToPostLogin: function() {
    var that = this
    this.callCloud('onboardingWorkspace', { action: 'state' }, function(res) {
      var result = res.result || {}
      var signupRedirect = that.getTournamentSignupRedirect()
      var teamMemberRedirect = that.getTeamMemberInviteRedirect()
      var teamPlayerRedirect = that.getTeamPlayerInviteRedirect()
      if (result.success && result.requiresOnboarding) {
        if (teamPlayerRedirect) {
          wx.redirectTo({ url: teamPlayerRedirect })
          return
        }
        if (teamMemberRedirect) {
          wx.redirectTo({ url: teamMemberRedirect })
          return
        }
        if (signupRedirect) {
          wx.setStorageSync('teamOnboardingReturnUrl', signupRedirect)
          wx.redirectTo({
            url: '/pages/onboarding/onboarding?scene=team&step=team&fromTournamentSignup=1&returnUrl=' + encodeURIComponent(signupRedirect)
          })
          return
        }
        wx.redirectTo({ url: '/pages/onboarding/onboarding' })
        return
      }
      that.goToHome()
    }, function() {
      // 无法确认关系时不阻断已有账号；服务端恢复后下次登录会重新判断。
      that.goToHome()
    }, 15000)
  },

  getTournamentSignupRedirect: function() {
    var redirectUrl = this.data.redirectUrl || wx.getStorageSync('loginRedirectUrl') || ''
    if (redirectUrl.indexOf('/pages/tournament/signup/signup') !== 0) return ''
    if (redirectUrl.indexOf('inviteKey=') < 0) return ''
    return redirectUrl
  },

  getTeamMemberInviteRedirect: function() {
    var redirectUrl = this.data.redirectUrl || wx.getStorageSync('loginRedirectUrl') || ''
    if (redirectUrl.indexOf('/pages/team/members/members') !== 0) return ''
    if (redirectUrl.indexOf('memberInviteId=') < 0) return ''
    wx.removeStorageSync('loginRedirectUrl')
    return redirectUrl
  },

  getTeamPlayerInviteRedirect: function() {
    var redirectUrl = this.data.redirectUrl || wx.getStorageSync('loginRedirectUrl') || ''
    if (redirectUrl.indexOf('/pages/team/player-invite/player-invite') !== 0) return ''
    if (redirectUrl.indexOf('playerInviteId=') < 0) return ''
    wx.removeStorageSync('loginRedirectUrl')
    return redirectUrl
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
    console.log('[login] 手机号单路径登录页')
  },

  showUserAgreement: function() {
    wx.navigateTo({ url: '/pages/login/agreement/agreement?type=user' })
  },

  showPrivacyPolicy: function() {
    wx.navigateTo({ url: '/pages/login/agreement/agreement?type=privacy' })
  }
})
