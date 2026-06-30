// pages/manage/manage.js
// 赛小蜂 - 主办方管理后台

Page({
  data: {
    stats: {
      tournamentCount: 0,
      teamCount: 0,
      refereeCount: 0,
      coachCount: 0
    }
  },

  onLoad: function() {
    this.loadStats()
  },

  onShow: function() {
    this.loadStats()
    // 同步 tabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().syncFromPage(2) // 管理是主办方第3个tab（index=2）
    }
  },

  // 加载统计数据
  loadStats: function() {
    var that = this
    var db = wx.cloud.database()
    var _ = db.command

    // 并行查询4个统计
    var done = 0
    var total = 4
    var stats = { tournamentCount: 0, teamCount: 0, refereeCount: 0, coachCount: 0 }

    function checkDone() {
      done++
      if (done >= total) {
        that.setData({ stats: stats })
      }
    }

    // 1. 赛事数
    db.collection('tournaments').count({
      success: function(res) { stats.tournamentCount = res.total; checkDone() },
      fail: function() { checkDone() }
    })

    // 2. 球队数
    db.collection('teams').count({
      success: function(res) { stats.teamCount = res.total; checkDone() },
      fail: function() { checkDone() }
    })

    // 3. 裁判数
    db.collection('referees').count({
      success: function(res) { stats.refereeCount = res.total; checkDone() },
      fail: function() { checkDone() }
    })

    // 4. 教练数（users 表里 role=coach 的）
    db.collection('users').where({ role: 'coach' }).count({
      success: function(res) { stats.coachCount = res.total; checkDone() },
      fail: function() { checkDone() }
    })
  },

  // 页面跳转（tab 页用 switchTab，非 tab 用 navigateTo）
  goTo: function(e) {
    var url = e.currentTarget.dataset.url
    if (!url) return
    // 判断是否是 tab 页
    var tabPages = [
      '/pages/home/home',
      '/pages/team/team',
      '/pages/tournament-center/tournament-center',
      '/pages/profile/profile',
      '/pages/match/match',
      '/pages/manage/manage'
    ]
    if (tabPages.indexOf(url) >= 0) {
      wx.switchTab({ url: url })
    } else {
      wx.navigateTo({ url: url })
    }
  },

  // 教练组管理（暂无独立页面，先提示）
  goToCoachList: function() {
    wx.showToast({ title: '教练组管理开发中', icon: 'none' })
  },

  // 数据概览（暂无独立页面，先提示）
  goToDashboard: function() {
    wx.showToast({ title: '数据概览开发中', icon: 'none' })
  }
})
