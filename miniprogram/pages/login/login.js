// pages/login/login.js - 手机号主账号登录
var workspace = require('../../utils/workspace')
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
    restoringSession: false,
    restoreError: '',
    restoreBlocked: false,
    showPhoneLogin: false,
    agreementChecked: false,
    isSubmitting: false,
    openId: '',
    redirectUrl: '',
    checkboxClass: '',
    loginButtonText: '手机号快捷登录',
    loginDisabled: true,
    localVisualQa: false
  },

  onLoad: function(options) {
    this._unloaded = false
    if (isDevtools() && options && options.visualQa === '1') {
      this.setData({
        localVisualQa: true,
        showPhoneLogin: true,
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
    if (wx.getStorageSync('userLoggedOut')) {
      this.setData({showPhoneLogin:true})
      return
    }
    // Recover through the trusted WeChat context before showing private cached data.
    // This validation never requests a new phone authorization for an existing binding.
    this.validateExistingSession()
  },

  onUnload: function() {
    this._unloaded = true
    this._restoreGeneration = (this._restoreGeneration || 0) + 1
  },

  callCloud: function(name, data, success, fail, timeout) {
    var that=this,settled=false
    function finish(callback,value){if(settled)return;settled=true;clearTimeout(watchdog);if(!that._unloaded && callback)callback(value)}
    var watchdog=setTimeout(function(){finish(fail,{code:'LOGIN_CONNECTION_TIMEOUT',errMsg:'连接超时，请重试'})},timeout || 20000)
    try { wx.cloud.callFunction({
      name: name,
      data: data || {},
      success: function(reply){finish(success,reply)},
      fail: function(err) {
        console.warn('[login] 登录服务连接失败:', name)
        finish(fail,err)
      }
    }) } catch(error) { finish(fail,error) }
  },

  clearAuthSession: function() {
    workspace.clearContext()
    AUTH_STORAGE_KEYS.forEach(function(key) { wx.removeStorageSync(key) })
    var app = getApp()
    if (app && app.globalData) {
      app.globalData.userInfo = null
      app.globalData.workspaceContext = null
      app.globalData.currentCard = null
      app.globalData.cards = []
    }
  },

  validateExistingSession: function() {
    if(this.data.restoringSession || this.data.isSubmitting)return
    var that=this,generation=(this._restoreGeneration || 0)+1
    this._restoreGeneration=generation
    this.setData({restoringSession:true,restoreError:'',restoreBlocked:false,showPhoneLogin:false})
    // The service resolves the trusted WeChat context itself; cached OpenID is not a credential.
    this.callCloud('checkUserByOpenId',{},function(res){
      if(generation!==that._restoreGeneration)return
      var result=res.result || {},user=result.user || {}
      if(result.success && result.isRegistered && user._id && /^1[3-9]\d{9}$/.test(String(user.phone || user.phoneNumber || ''))){that.finishLogin(user,false);return}
      if(result.success && result.requiresPhoneAuthorization===true){
        that.clearAuthSession();that.setData({restoringSession:false,showPhoneLogin:true,loginButtonText:'手机号快捷登录'});return
      }
      var message=result.message || '账号恢复未完成，请重试'
      that.setData({restoringSession:false,restoreError:message,restoreBlocked:/重复|指向不同|关系异常|不一致/.test(message),showPhoneLogin:false})
    },function(){if(generation===that._restoreGeneration)that.setData({restoringSession:false,restoreError:'连接失败，请重试',restoreBlocked:false,showPhoneLogin:false})},15000)
  },

  usePhoneLogin: function(){
    if(this.data.restoreBlocked || this.data.isSubmitting)return
    this._restoreGeneration=(this._restoreGeneration || 0)+1
    this.setData({restoringSession:false,restoreError:'',showPhoneLogin:true})
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
    if(this.data.isSubmitting || this.data.restoringSession || !this.data.showPhoneLogin)return
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

    this._restoreGeneration=(this._restoreGeneration || 0)+1
    this.setData({ isSubmitting: true, loginDisabled: true, loginButtonText: '验证手机号中...' })
    wx.showLoading({ title: '正在验证账号...' })

    this.callCloud('checkUserByOpenId', {
      phoneCode: phoneCode,
      nickName: '用户',
      avatarUrl: ''
    }, function(res) {
      wx.hideLoading()
      that.resetSubmitState()
      var result=res.result || {}
      if(result.success && result.isRegistered && result.user){that.finishLogin(result.user,true);return}
      wx.showToast({title:result.message || '手机号登录失败，请重试',icon:'none'})
    }, function(){
      wx.hideLoading();that.resetSubmitState();wx.showToast({title:'登录失败，请检查网络',icon:'none'})
    },20000)
  },

  resetSubmitState: function() {
    this.setData({
      isSubmitting: false,
      loginDisabled: !this.data.agreementChecked,
      loginButtonText: '手机号快捷登录'
    })
  },

  finishLogin: function(user, showSuccess) {
    if(!user || !user._id || !/^1[3-9]\d{9}$/.test(String(user.phone || user.phoneNumber || ''))){
      this.setData({restoringSession:false,restoreError:'账号资料未完整返回，请重试',showPhoneLogin:false})
      return
    }
    // 会话写入统一走 workspace.persistLoginSession：切换账号时先清理上一账号的
    // 认证与工作空间数据，再写入新会话，与认领页手机号验证后的写入保持一致。
    var persisted = workspace.persistLoginSession(Object.assign({}, user, { openId: user.openId || this.data.openId || '' }))
    if (!persisted) {
      this.setData({restoringSession:false,restoreError:'账号资料未完整返回，请重试',showPhoneLogin:false})
      return
    }
    var sameAccount = persisted.sameAccount
    this.setData({restoringSession:true,showPhoneLogin:false,restoreError:''})
    if (showSuccess) wx.showToast({ title: '登录成功', icon: 'success' })
    if(sameAccount && workspace.readContext())this.goToHome(true)
    else this.goToPostLogin()
  },

  goToPostLogin: function() {
    // 认领邀请自身负责手机号与归属核验，不以尚未拥有球队作为建队条件。
    var taskPath = (this.data.redirectUrl || wx.getStorageSync('loginRedirectUrl') || '').split('?')[0]
    if (['/pages/team/claim-code/claim-code', '/pages/team/prebuilt-invite/prebuilt-invite'].indexOf(taskPath) >= 0) {
      this.goToHome(true)
      return
    }
    var that = this
    this.callCloud('onboardingWorkspace', { action: 'state' }, function(res) {
      var result = res.result || {}
      var signupRedirect = that.getTournamentSignupRedirect()
      var teamMemberRedirect = that.getTeamMemberInviteRedirect()
      var teamPlayerRedirect = that.getTeamPlayerInviteRedirect()
      // Direct invitations keep their task context. A role choice is a view,
      // never a substitute for the invitation or a grant of permissions.
      if (result.success && !signupRedirect && !teamMemberRedirect && !teamPlayerRedirect && !workspace.hasPortalRole()) {
        // 已有球队关系（含刚完成认领）直接按球队管理者视角进入，
        // 不再要求先选择“赛事组织者/球队管理者”再建队；该选择只影响展示视角，
        // 不授予任何资源权限，之后仍可在“我的”里切换。
        if (result.hasTeamRelation) workspace.rememberPortalRole('team_coach')
        else {
          wx.redirectTo({url:'/pages/onboarding/first-use'})
          return
        }
      }
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
          that.callCloud('getMiniWorkspace', { action: 'sharedTournaments' }, function(reply) {
            var shared = reply.result || {}
            if (shared.success && (shared.tournaments || []).length) that.goToHome()
            else that.goToHome()
          }, function() { that.goToHome() }, 15000)
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

  goToHome: function(immediate) {
    var that=this,redirectUrl=this.data.redirectUrl || wx.getStorageSync('loginRedirectUrl') || ''
    function navigate(){
      if(that._unloaded || that._navigating)return
      that._navigating=true
      if(redirectUrl && redirectUrl.indexOf('/pages/')===0){
        wx.removeStorageSync('loginRedirectUrl')
        var target=redirectUrl.split('?')[0]
        if(['/pages/home/home','/pages/event/index','/pages/teams/index','/pages/discover/discover','/pages/profile/profile'].indexOf(target)>=0)wx.switchTab({url:target})
        else if(target==='/pages/training/index')wx.navigateTo({url:redirectUrl})
        else wx.redirectTo({url:redirectUrl})
      }else wx.switchTab({url:'/pages/home/home'})
    }
    if(immediate)navigate();else setTimeout(navigate,500)
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
