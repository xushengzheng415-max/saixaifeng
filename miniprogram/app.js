// app.js - 小程序入口

// 简单日志 mock（兼容真机）
var logger = {
  init: function() {},
  info: function() { console.log.apply(console, arguments) },
  error: function() { console.error.apply(console, arguments) },
  warn: function() { console.warn.apply(console, arguments) },
  flush: function() {}
}

var release = require('./config/release')

var AUTH_SESSION_VERSION = 'phone-canonical-v1'
var LEGACY_AUTH_KEYS = [
  'userInfo', 'userId', 'phoneNumber', 'phone', 'email',
  'hasPassword', 'currentCardId', 'currentTeam', 'currentTeamId',
  'currentTeamIndex', 'teamInfo', 'coachInfo', 'myTeams', 'userLoggedOut',
  'workspaceContext', 'currentWorkspaceId'
]

// 赛事色调模板配置
var THEME_TEMPLATES = [
  {
    id: 'green',
    name: '活力绿',
    gradient: 'linear-gradient(135deg, #1B5E20 0%, #2E7D32 50%, #43A047 100%)',
    color: '#2E7D32',
    bgGradient: 'rgba(46, 125, 50, 0.15)',
    description: '充满生机与活力'
  },
  {
    id: 'blue',
    name: '专业蓝',
    gradient: 'linear-gradient(135deg, #0D47A1 0%, #1565C0 50%, #1976D2 100%)',
    color: '#1565C0',
    bgGradient: 'rgba(25, 118, 210, 0.15)',
    description: '专业可靠稳重'
  },
  {
    id: 'red',
    name: '热情红',
    gradient: 'linear-gradient(135deg, #B71C1C 0%, #D32F2F 50%, #F44336 100%)',
    color: '#D32F2F',
    bgGradient: 'rgba(244, 67, 54, 0.15)',
    description: '热血激情澎湃'
  },
  {
    id: 'orange',
    name: '活力橙',
    gradient: 'linear-gradient(135deg, #E65100 0%, #F57C00 50%, #FF9800 100%)',
    color: '#F57C00',
    bgGradient: 'rgba(255, 152, 0, 0.15)',
    description: '温暖活力四射'
  },
  {
    id: 'purple',
    name: '典雅紫',
    gradient: 'linear-gradient(135deg, #4A148C 0%, #6A1B9A 50%, #9C27B0 100%)',
    color: '#6A1B9A',
    bgGradient: 'rgba(156, 39, 176, 0.15)',
    description: '高贵典雅神秘'
  },
  {
    id: 'dark',
    name: '深邃黑',
    gradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    color: '#16213e',
    bgGradient: 'rgba(22, 33, 62, 0.15)',
    description: '深邃专业质感'
  }
]

App({
  onLaunch: function() {
    if (wx.getStorageSync('authSessionVersion') !== AUTH_SESSION_VERSION) {
      LEGACY_AUTH_KEYS.forEach(function(key) { wx.removeStorageSync(key) })
      wx.removeStorageSync('openId')
      wx.removeStorageSync('openid')
      wx.setStorageSync('authSessionVersion', AUTH_SESSION_VERSION)
    }
    wx.removeStorageSync('current' + 'Role')

    // 初始化云开发（容错：即使云环境不可用也不阻塞启动）
    if (wx.cloud) {
      try {
        wx.cloud.init({
          env: 'cloud1-7g8ckb3c7815a011',
          traceUser: false  // 关闭traceUser减少启动时网络请求
        })
      } catch(e) {
        console.warn('[app] 云开发初始化失败（非阻塞）:', e)
      }
    } else {
      console.warn('[app] wx.cloud 不可用，云功能将无法使用')
    }

    // 初始化日志系统（自动捕获console、错误监控）
    logger.init()
    logger.info('小程序启动')

    // 检查登录状态（纯本地读取，不涉及网络）
    this.checkLoginStatus()
  },

  onShow: function(options) {
    logger.info('小程序显示')
  },

  onHide: function() {
    logger.info('小程序隐藏')
    logger.flush() // 关闭前上传日志
  },

  onError: function(err) {
    logger.error('小程序错误', { error: err.message, stack: err.stack })
  },

  globalData: {
    userInfo: null,
    currentCard: null,
    cards: [],
    workspaceContext: null,
    appVersion: release.version,
    release: release,
    logger: logger,
    themeTemplates: THEME_TEMPLATES
  },

  checkLoginStatus: function() {
    var userInfo = wx.getStorageSync('userInfo')
    if (userInfo && wx.getStorageSync('authSessionVersion') === AUTH_SESSION_VERSION) {
      this.globalData.userInfo = userInfo
      this.globalData.workspaceContext = wx.getStorageSync('workspaceContext') || null
      logger.info('用户已登录', { openid: userInfo.openid })
    }

    // 检查是否有身份卡
    var currentCardId = wx.getStorageSync('currentCardId')
    if (currentCardId) {
      this.globalData.currentCard = { _id: currentCardId }
    }
  },

  switchCard: function(card) {
    this.globalData.currentCard = card
    wx.setStorageSync('currentCardId', card._id)
    logger.info('切换展示卡片', { cardId: card._id })
  },

  updateUserInfo: function(userInfo) {
    userInfo = {
      _id: userInfo._id || '',
      openId: userInfo.openId || userInfo.openid || '',
      phone: userInfo.phone || userInfo.phoneNumber || '',
      phoneNumber: userInfo.phoneNumber || userInfo.phone || '',
      nickName: userInfo.nickName || '微信用户',
      avatarUrl: userInfo.avatarUrl || '',
      orgId: userInfo.orgId || ''
    }
    this.globalData.userInfo = userInfo
    wx.setStorageSync('userInfo', userInfo)
    wx.setStorageSync('authSessionVersion', AUTH_SESSION_VERSION)
    logger.info('更新用户信息', { openid: userInfo.openid })
  },

  logout: function() {
    logger.info('用户退出登录')
    this.globalData.userInfo = null
    this.globalData.currentCard = null
    this.globalData.cards = []
    this.globalData.workspaceContext = null
    wx.clearStorageSync()
    wx.setStorageSync('authSessionVersion', AUTH_SESSION_VERSION)
    wx.setStorageSync('userLoggedOut', 'true')
  }
})
