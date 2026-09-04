// pages/referee/index.js
// 裁判管理页面

Page({
  data: {
    referees: [],
    RefereesLen: 0
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
            referees: res.data || [],
            RefereesLen: (res.data || []).length
          })
        },
        fail: function(err) {
          console.error('加载裁判列表失败:', err)
          that.setData({ referees: [], RefereesLen: 0 })
        }
      })
  },

  // 执法记录
  goToRefereeRecords: function() {
    wx.navigateTo({ url: '/pages/service/workbench/workbench' })
  }
})
