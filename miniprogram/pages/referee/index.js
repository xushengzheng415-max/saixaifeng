// pages/referee/index.js
// 裁判管理页面

Page({
  data: {
    referees: []
  },

  onLoad: function(options) {
    this.loadReferees()
  },

  onShow: function() {
    this.loadReferees()
  },

  // 加载裁判列表
  loadReferees: function() {
    var that = this
    var db = wx.cloud.database()

    db.collection('referee_library')
      .orderBy('createTime', 'desc')
      .limit(50)
      .get({
        success: function(res) {
          that.setData({
            referees: res.data || []
          })
        },
        fail: function(err) {
          console.error('加载裁判列表失败:', err)
          that.setData({ referees: [] })
        }
      })
  },

  // 裁判库
  goToRefereeLibrary: function() {
    wx.showToast({ title: '裁判库功能开发中', icon: 'none' })
  },

  // 裁判指派
  goToRefereeAssign: function() {
    wx.showToast({ title: '裁判指派功能开发中', icon: 'none' })
  },

  // 执法记录
  goToRefereeRecords: function() {
    wx.navigateTo({ url: '/pages/referee/record' })
  }
})
