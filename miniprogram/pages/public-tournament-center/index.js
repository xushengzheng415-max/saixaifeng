var publicCenterUrl = 'https://www.sxffootball.cn/service-account-h5/tournament-center.html'

Page({
  data: { url: publicCenterUrl, errorText: '', loading: true },
  onWebLoad: function () { this.setData({ loading: false }) },
  onWebError: function () {
    this.setData({ url: '', errorText: '赛事中心暂未打开，请重试', loading: false })
  },
  retry: function () {
    this.setData({ url: publicCenterUrl, errorText: '', loading: true })
  },
  back: function () {
    wx.navigateBack({ fail: function () { wx.switchTab({ url: '/pages/home/home' }) } })
  }
})
