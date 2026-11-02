var publicCenterBase = 'https://www.sxffootball.cn/service-account-h5/tournament-center.html'

Page({
  data: { url: publicCenterBase, errorText: '', loading: true },

  onLoad: function (options) {
    var hash = options && options.hash ? decodeURIComponent(options.hash) : ''
    var url = hash ? publicCenterBase + '#' + hash : publicCenterBase
    this.setData({ url: url })
  },

  onWebLoad: function () { this.setData({ loading: false }) },
  onWebError: function () {
    this.setData({ url: '', errorText: '赛事中心暂未打开，请重试', loading: false })
  },
  retry: function () {
    this.setData({ url: publicCenterBase, errorText: '', loading: true })
  },
  back: function () {
    wx.navigateBack({ fail: function () { wx.switchTab({ url: '/pages/home/home' }) } })
  }
})
