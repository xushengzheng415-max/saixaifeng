// pages/index/index.js - 首页（简化版）
Page({


  _updateLens: function() {
    var data = this.data;
    var _um = data.upcomingMatches ? data.upcomingMatches.length : 0;
    if (this.data.UpcomingMatchesLen !== _um) { this.setData({ 'UpcomingMatchesLen': _um}); }
    var _myt = data.myTeams ? data.myTeams.length : 0;
    if (this.data.MyTeamsLen !== _myt) { this.setData({ 'MyTeamsLen': _myt}); }
  },

  data: {
    isLoggedIn: false,
    userInfo: null,
    role: '',
    myTeams: [],
    upcomingMatches: [],
    recentMatches: []
  },

  onLoad() {
    this.checkLogin()
  },

  onShow() {
    this.checkLogin()
  },

  checkLogin() {
    const app = getApp()
    const userInfo = wx.getStorageSync('userInfo')
    if (userInfo) {
      this.setData({
        isLoggedIn: true,
        userInfo: userInfo,
        role: userInfo.role || 'coach'
      })
      this.loadData()
    } else {
      // 未登录跳转登录页
      wx.redirectTo({ url: '/pages/login/login' })
    }
  },

  loadData() {
    this.loadTeams()
    this.loadMatches()
  },

  async loadTeams() {
    try {
      const db = wx.cloud.database()
      const res = await db.collection('teams')
        .orderBy('createTime', 'desc')
        .limit(5)
        .get()
      this.setData({ myTeams: res.data })
    } catch (err) {
      console.log('暂无球队数据')
    }
  },

  async loadMatches() {
    try {
      const db = wx.cloud.database()
      const upcomingRes = await db.collection('matches')
        .where({ status: 1 })
        .orderBy('matchTime', 'asc')
        .limit(5)
        .get()
      this.setData({ upcomingMatches: upcomingRes.data })
    } catch (err) {
      console.log('暂无比赛数据')
    }
  },

  logout() {
    wx.showModal({
      title: '提示',
      content: '确定退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('userInfo')
          wx.redirectTo({ url: '/pages/login/login' })
        }
      }
    })
  }
})