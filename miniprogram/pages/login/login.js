// pages/login/login.js
Page({
  data: {
    loginState: 'login',
    agreementChecked: false,
    selectedRole: '',
    isSubmitting: false,
    openId: '',
    phoneNumber: '',
    userInfo: {
      nickName: '微信用户',
      avatarUrl: ''
    },
    showAltLogin: false,
    loginTab: 'sms',
    isLoginState: true,
    isRoleState: false,
    roleOrgActive: '',
    roleCoachActive: '',
    roleRefActive: '',
    rolePlayerActive: '',
    tabSmsActive: 'active',
    tabEmailActive: '',
    tabPwdActive: '',
    isTabSms: true,
    isTabEmail: false,
    isTabPwd: false,
    manualPhone11: false,
    smsCodeShort: true,
    phonePwd11: false,
    checkboxClass: '',
    submitBtnText: '进入赛小蜂',
    maskVisible: '',
    modalShow: '',
    codeBtnClass: '',
    codeBtnText: '获取验证码',
    glassCheckboxClass: '',
    manualPhone: '',
    smsCode: '',
    countingDown: false,
    countdownText: '获取验证码',
    email: '',
    password: '',
    passwordVisible: false,
    phoneForPassword: '',
    passwordForPhone: '',
    isAutoChecking: false,
    ManualPhoneLen: 0,
    SmsCodeLen: 0,
    phoneForPasswordLen: 0
  },

  onLoad: function () {
    this._syncFlags();
    if (wx.getStorageSync('userLoggedOut') === 'true') {
      wx.removeStorageSync('userLoggedOut');
      return;
    }
    this._tryAutoLogin();
  },

  _syncFlags: function () {
    var data = this.data;
    var manualPhoneLen = data.manualPhone ? data.manualPhone.length : 0;
    var smsCodeLen = data.smsCode ? data.smsCode.length : 0;
    var phoneForPasswordLen = data.phoneForPassword ? data.phoneForPassword.length : 0;
    this.setData({
      isLoginState: data.loginState === 'login',
      isRoleState: data.loginState === 'role',
      roleOrgActive: data.selectedRole === 'organizer' ? 'active' : '',
      roleCoachActive: data.selectedRole === 'coach' ? 'active' : '',
      roleRefActive: data.selectedRole === 'referee' ? 'active' : '',
      rolePlayerActive: data.selectedRole === 'player' ? 'active' : '',
      tabSmsActive: data.loginTab === 'sms' ? 'active' : '',
      tabEmailActive: data.loginTab === 'email' ? 'active' : '',
      tabPwdActive: data.loginTab === 'password' ? 'active' : '',
      isTabSms: data.loginTab === 'sms',
      isTabEmail: data.loginTab === 'email',
      isTabPwd: data.loginTab === 'password',
      manualPhone11: manualPhoneLen === 11,
      smsCodeShort: smsCodeLen < 4,
      phonePwd11: phoneForPasswordLen === 11,
      checkboxClass: data.agreementChecked ? 'checked' : '',
      submitBtnText: data.isSubmitting ? '登录中...' : '进入赛小蜂',
      maskVisible: data.showAltLogin ? 'visible' : '',
      modalShow: data.showAltLogin ? 'show' : '',
      codeBtnClass: data.countingDown ? 'disabled' : '',
      codeBtnText: data.countingDown ? data.countdownText : '获取验证码',
      glassCheckboxClass: data.agreementChecked ? 'checked' : '',
      ManualPhoneLen: manualPhoneLen,
      SmsCodeLen: smsCodeLen,
      phoneForPasswordLen: phoneForPasswordLen
    });
  },

  _tryAutoLogin: function () {
    var cachedOpenId = wx.getStorageSync('openId');
    var cachedUserInfo = wx.getStorageSync('userInfo');
    if (cachedOpenId && cachedUserInfo && cachedUserInfo.openId === cachedOpenId) {
      this.setData({ openId: cachedOpenId });
      this.doLogin(cachedUserInfo);
      return;
    }
    this._silentAutoCheck();
  },

  _silentAutoCheck: function () {
    var that = this;
    if (!wx.cloud) {
      return;
    }
    wx.login({
      success: function (loginRes) {
        if (!loginRes.code) {
          return;
        }
        wx.cloud.callFunction({
          name: 'getOpenId',
          timeout: 5000,
          success: function (cloudRes) {
            var result = cloudRes.result || {};
            if (result.openId) {
              that.setData({ openId: result.openId });
              that._checkRegisteredSilent(result.openId);
            }
          }
        });
      }
    });
  },

  _checkRegisteredSilent: function (openId) {
    var that = this;
    wx.cloud.callFunction({
      name: 'checkUserByOpenId',
      data: { openId: openId },
      success: function (res) {
        var result = res.result || {};
        if (result.success && result.isRegistered && result.user) {
          that.doLogin(result.user);
        }
      }
    });
  },

  clearTeamCache: function () {
    wx.removeStorageSync('myTeams');
    wx.removeStorageSync('currentTeam');
    wx.removeStorageSync('currentTeamIndex');
    wx.removeStorageSync('teamInfo');
    wx.removeStorageSync('currentTeamId');
    wx.removeStorageSync('coachInfo');
  },

  persistUserSession: function (userInfo) {
    wx.removeStorageSync('userLoggedOut');
    this.clearTeamCache();
    wx.setStorageSync('userInfo', userInfo);
    wx.setStorageSync('openId', userInfo.openId || '');
    wx.setStorageSync('phoneNumber', userInfo.phoneNumber || userInfo.phone || '');
    wx.setStorageSync('userId', userInfo._id || '');
    if (userInfo.role) {
      wx.setStorageSync('currentRole', userInfo.role);
    }
  },

  _saveAndGoHome: function (userInfo) {
    this.persistUserSession(userInfo);
    var role = (userInfo.role || '').toLowerCase();
    if (role === 'coach') {
      this.loadCoachTeams(userInfo.phoneNumber || userInfo.phone || '');
    } else {
      this.goToHome();
    }
  },

  doLogin: function (user) {
    var userInfo = {
      _id: user._id || '',
      openId: user.openId || '',
      phoneNumber: user.phoneNumber || user.phone || '',
      phone: user.phone || user.phoneNumber || '',
      email: user.email || '',
      role: user.role || '',
      nickName: user.nickName || '微信用户',
      avatarUrl: user.avatarUrl || '',
      loginTime: new Date().toISOString()
    };
    if (userInfo.role) {
      wx.showToast({ title: '欢迎回来', icon: 'success' });
      this._saveAndGoHome(userInfo);
      return;
    }
    this.setData({
      loginState: 'role',
      phoneNumber: userInfo.phoneNumber,
      isAutoChecking: false
    });
    this._syncFlags();
  },

  loadCoachTeams: function (phoneNumber) {
    var that = this;
    var userInfo = wx.getStorageSync('userInfo') || {};
    var userId = userInfo._id || wx.getStorageSync('userId') || '';
    var openId = userInfo.openId || wx.getStorageSync('openId') || '';
    wx.cloud.callFunction({
      name: 'getMyTeams',
      data: { phone: phoneNumber, userId: userId, openId: openId, role: 'coach' },
      success: function (res) {
        var result = res.result || {};
        if (result.success && Array.isArray(result.teams) && result.teams.length > 0) {
          wx.setStorageSync('myTeams', result.teams);
          wx.setStorageSync('currentTeam', result.teams[0]);
          if (result.coachInfo) {
            wx.setStorageSync('coachInfo', result.coachInfo);
          }
        }
        that.goToHome();
      },
      fail: function () {
        that.goToHome();
      }
    });
  },

  goToHome: function () {
    wx.showToast({ title: '登录成功', icon: 'success' });
    setTimeout(function () {
      wx.switchTab({ url: '/pages/home/home' });
    }, 800);
  },

  openAltLogin: function () {
    this.setData({ showAltLogin: true });
    this._syncFlags();
  },

  closeAltLogin: function () {
    this.setData({ showAltLogin: false });
    this._syncFlags();
  },

  preventBubble: function () {},
  preventMove: function () {},

  switchLoginTab: function (e) {
    this.setData({ loginTab: e.currentTarget.dataset.tab });
    this._syncFlags();
  },

  toggleAgreement: function () {
    this.setData({ agreementChecked: !this.data.agreementChecked });
    this._syncFlags();
  },

  selectRole: function (e) {
    this.setData({ selectedRole: e.currentTarget.dataset.role });
    this._syncFlags();
  },

  backToLogin: function () {
    this.setData({ loginState: 'login', selectedRole: '' });
    this._syncFlags();
  },

  submitLogin: function () {
    var that = this;
    if (!that.data.selectedRole) {
      wx.showToast({ title: '请选择身份', icon: 'none' });
      return;
    }
    that.setData({ isSubmitting: true });
    that._syncFlags();
    if (that.data.openId) {
      wx.cloud.callFunction({
        name: 'updateUserRole',
        data: { openId: that.data.openId, role: that.data.selectedRole }
      });
    }
    var userInfo = {
      _id: that.data.userInfo._id || '',
      openId: that.data.openId,
      phoneNumber: that.data.phoneNumber,
      phone: that.data.phoneNumber,
      nickName: that.data.userInfo.nickName,
      avatarUrl: that.data.userInfo.avatarUrl,
      role: that.data.selectedRole,
      loginTime: new Date().toISOString()
    };
    that.persistUserSession(userInfo);
    if (that.data.selectedRole === 'coach') {
      that.loadCoachTeams(that.data.phoneNumber);
    } else {
      that.goToHome();
    }
  },

  getPhoneNumber: function (e) {
    var that = this;
    if (!that.data.agreementChecked) {
      wx.showToast({ title: '请先同意用户协议和隐私政策', icon: 'none' });
      return;
    }
    if (e.detail.errMsg !== 'getPhoneNumber:ok') {
      wx.showToast({ title: '需要授权手机号才能继续', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '请稍候...' });
    wx.cloud.callFunction({
      name: 'decodePhoneNumber',
      data: e.detail.code ? { code: e.detail.code } : { cloudID: e.detail.cloudID },
      success: function (res) {
        wx.hideLoading();
        var result = res.result || {};
        if (result.success && result.phoneNumber) {
          that.onPhoneDecrypted(result.phoneNumber);
        } else {
          wx.showToast({ title: result.message || '获取手机号失败', icon: 'none' });
        }
      },
      fail: function () {
        wx.hideLoading();
        wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      }
    });
  },

  onPhoneDecrypted: function (phoneNumber) {
    this.setData({ phoneNumber: phoneNumber, loginState: 'role' });
    this._syncFlags();
    wx.setStorageSync('phoneNumber', phoneNumber);
    this.bindPhoneToOpenId(phoneNumber, '');
  },

  bindPhoneToOpenId: function (phoneNumber, role) {
    var userInfo = this.data.userInfo;
    if (!this.data.openId || !phoneNumber) {
      return;
    }
    wx.cloud.callFunction({
      name: 'bindPhoneToOpenId',
      data: {
        openId: this.data.openId,
        phoneNumber: phoneNumber,
        nickName: userInfo.nickName || '微信用户',
        avatarUrl: userInfo.avatarUrl || '',
        role: role || ''
      }
    });
  },

  onEmailInput: function (e) {
    this.setData({ email: e.detail.value });
  },

  onPasswordInput: function (e) {
    this.setData({ password: e.detail.value });
  },

  togglePasswordVisibility: function () {
    this.setData({ passwordVisible: !this.data.passwordVisible });
  },

  submitEmailLogin: function () {
    var that = this;
    var email = that.data.email.trim();
    var password = that.data.password;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      wx.showToast({ title: '请输入正确的邮箱地址', icon: 'none' });
      return;
    }
    if (!password) {
      wx.showToast({ title: '请输入密码', icon: 'none' });
      return;
    }
    if (!that.data.agreementChecked) {
      wx.showToast({ title: '请先同意用户协议和隐私政策', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '登录中...' });
    wx.cloud.callFunction({
      name: 'emailLogin',
      data: { action: 'login', account: email, password: password, loginType: 'email' },
      timeout: 10000,
      success: function (res) {
        wx.hideLoading();
        var result = res.result || {};
        if (result.success && result.user) {
          that.handleEmailLoginSuccess(result.user, result);
        } else {
          wx.showToast({ title: result.error || '登录失败，请重试', icon: 'none' });
        }
      },
      fail: function () {
        wx.hideLoading();
        wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      }
    });
  },

  handleEmailLoginSuccess: function (user, result) {
    var userInfo = {
      _id: user._id || '',
      openId: user.openId || this.data.openId || '',
      email: user.email || this.data.email,
      phone: user.phone || user.phoneNumber || '',
      phoneNumber: user.phone || user.phoneNumber || '',
      role: user.role || '',
      nickName: user.nickName || '邮箱用户',
      avatarUrl: user.avatarUrl || '',
      loginTime: new Date().toISOString()
    };
    this.persistUserSession(userInfo);
    this.finishEmailLogin(userInfo, result);
  },

  finishEmailLogin: function (userInfo, result) {
    if (result && result.needSelectRole || !userInfo.role) {
      this.setData({ loginState: 'role', phoneNumber: userInfo.phone || userInfo.phoneNumber || '' });
      this._syncFlags();
      wx.showToast({ title: '请选择您的身份', icon: 'none' });
      return;
    }
    wx.setStorageSync('currentRole', userInfo.role);
    if (userInfo.role === 'coach') {
      this.loadCoachTeams(userInfo.phone || userInfo.phoneNumber || '');
    } else {
      this.goToHome();
    }
  },

  onPhoneForPasswordInput: function (e) {
    this.setData({ phoneForPassword: e.detail.value });
    this._syncFlags();
  },

  onPasswordForPhoneInput: function (e) {
    this.setData({ passwordForPhone: e.detail.value });
    this._syncFlags();
  },

  submitPhonePasswordLogin: function () {
    var that = this;
    var phone = that.data.phoneForPassword.trim();
    var password = that.data.passwordForPhone;
    if (!phone || phone.length !== 11 || !/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }
    if (!password) {
      wx.showToast({ title: '请输入密码', icon: 'none' });
      return;
    }
    if (!that.data.agreementChecked) {
      wx.showToast({ title: '请先同意用户协议和隐私政策', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '登录中...' });
    wx.cloud.callFunction({
      name: 'emailLogin',
      data: { action: 'login', account: phone, password: password, loginType: 'phone' },
      timeout: 10000,
      success: function (res) {
        wx.hideLoading();
        var result = res.result || {};
        if (result.success && result.user) {
          that.handlePhonePasswordLoginSuccess(result.user, result);
        } else {
          wx.showToast({ title: result.error || '登录失败，请重试', icon: 'none' });
        }
      },
      fail: function () {
        wx.hideLoading();
        wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      }
    });
  },

  handlePhonePasswordLoginSuccess: function (user, result) {
    var userInfo = {
      _id: user._id || '',
      openId: user.openId || this.data.openId || '',
      email: user.email || '',
      phone: user.phone || this.data.phoneForPassword,
      phoneNumber: user.phone || this.data.phoneForPassword,
      role: user.role || '',
      nickName: user.nickName || '手机号用户',
      avatarUrl: user.avatarUrl || '',
      loginTime: new Date().toISOString()
    };
    this.persistUserSession(userInfo);
    this.finishPhoneLogin(userInfo, result);
  },

  finishPhoneLogin: function (userInfo, result) {
    if (result && result.needSelectRole || !userInfo.role) {
      this.setData({ loginState: 'role', phoneNumber: userInfo.phone || userInfo.phoneNumber || '' });
      this._syncFlags();
      wx.showToast({ title: '请选择您的身份', icon: 'none' });
      return;
    }
    wx.setStorageSync('currentRole', userInfo.role);
    if (userInfo.role === 'coach') {
      this.loadCoachTeams(userInfo.phone || userInfo.phoneNumber || '');
    } else {
      this.goToHome();
    }
  },

  onSmsCodeInput: function (e) {
    this.setData({ smsCode: e.detail.value });
    this._syncFlags();
  },

  onManualPhoneInput: function (e) {
    this.setData({ manualPhone: e.detail.value });
    this._syncFlags();
  },

  sendSmsCode: function () {
    var that = this;
    var phone = that.data.manualPhone;
    if (!phone || phone.length !== 11) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }
    if (that.data.countingDown) {
      return;
    }
    wx.showLoading({ title: '发送中...' });
    wx.cloud.callFunction({
      name: 'sendSms',
      data: { phoneNumber: phone },
      timeout: 10000,
      success: function (res) {
        wx.hideLoading();
        var result = res.result || {};
        if (result.success !== false) {
          wx.showToast({ title: '验证码已发送', icon: 'success' });
          that.startCountdown();
        } else {
          wx.showToast({ title: result.message || '发送失败，请重试', icon: 'none' });
        }
      },
      fail: function () {
        wx.hideLoading();
        wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      }
    });
  },

  startCountdown: function () {
    var that = this;
    var seconds = 60;
    that.setData({ countingDown: true, countdownText: '60s后重试' });
    that._syncFlags();
    if (that._countdownTimer) {
      clearInterval(that._countdownTimer);
    }
    that._countdownTimer = setInterval(function () {
      seconds -= 1;
      if (seconds <= 0) {
        clearInterval(that._countdownTimer);
        that._countdownTimer = null;
        that.setData({ countingDown: false, countdownText: '重新获取' });
      } else {
        that.setData({ countdownText: seconds + 's后重试' });
      }
      that._syncFlags();
    }, 1000);
  },

  submitSmsLogin: function () {
    var that = this;
    var phone = that.data.manualPhone;
    var code = that.data.smsCode;
    if (!phone || phone.length !== 11) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }
    if (!code || code.length < 4) {
      wx.showToast({ title: '请输入验证码', icon: 'none' });
      return;
    }
    if (!that.data.agreementChecked) {
      wx.showToast({ title: '请先同意用户协议和隐私政策', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '登录中...' });
    wx.cloud.callFunction({
      name: 'verifySmsCode',
      data: { phoneNumber: phone, code: code },
      timeout: 10000,
      success: function (res) {
        wx.hideLoading();
        var result = res.result || {};
        if (result.success && result.user) {
          that.handleSmsLoginSuccess(phone, result.user);
        } else {
          wx.showToast({ title: result.message || '验证码错误或已过期', icon: 'none' });
        }
      },
      fail: function () {
        wx.hideLoading();
        wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      }
    });
  },

  handleSmsLoginSuccess: function (phoneNumber, userFromCloud) {
    this.finishSmsLogin(phoneNumber, userFromCloud, this.data.openId);
  },

  finishSmsLogin: function (phoneNumber, existingUser, openId) {
    if (openId && phoneNumber) {
      this.bindPhoneToOpenId(phoneNumber, existingUser ? existingUser.role : '');
    }
    if (existingUser && existingUser.role) {
      var userInfo = {
        _id: existingUser._id || '',
        openId: existingUser.openId || openId || '',
        phoneNumber: phoneNumber,
        phone: phoneNumber,
        nickName: existingUser.nickName || '微信用户',
        avatarUrl: existingUser.avatarUrl || '',
        role: existingUser.role,
        loginTime: new Date().toISOString()
      };
      this.persistUserSession(userInfo);
      if (existingUser.role === 'coach') {
        this.loadCoachTeams(phoneNumber);
      } else {
        this.goToHome();
      }
      return;
    }
    this.setData({ loginState: 'role', phoneNumber: phoneNumber });
    this._syncFlags();
    wx.setStorageSync('phoneNumber', phoneNumber);
    wx.showToast({ title: '请选择您的身份', icon: 'none' });
  },

  devLogin: function () {
    console.log('[devLogin] 开发者模式触发');
  },

  showUserAgreement: function () {
    wx.navigateTo({ url: '/pages/login/agreement/agreement?type=user' });
  },

  showPrivacyPolicy: function () {
    wx.navigateTo({ url: '/pages/login/agreement/agreement?type=privacy' });
  }
});




