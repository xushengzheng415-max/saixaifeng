var api = require('../../../utils/api')

Page({
  data: {
    isEmpty: true,
    rows: []
  },

  onShow: function () {
    this.loadLog()
  },

  loadLog: function () {
    var self = this
    api.getBattleLog().then(function (view) {
      self.setData({ isEmpty: view.isEmpty, rows: view.rows || [] })
    }).catch(function (err) {
      wx.showToast({ title: err.message || '战报加载失败', icon: 'none' })
    })
  },

  onBack: function () {
    var pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack()
    } else {
      wx.redirectTo({ url: '/pages/card/lineup/lineup' })
    }
  }
})
