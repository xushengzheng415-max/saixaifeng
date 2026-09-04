Page({
  data: { url: '', errorText: '' },
  onLoad: function (options) {
    var value = ''
    try { value = decodeURIComponent(String((options || {}).url || '')) } catch (error) {}
    var allowed = 'https://www.sxffootball.cn/service-account-h5/'
    if (value.indexOf(allowed) !== 0) {
      this.setData({ errorText: '家长资料服务地址无效' })
      return
    }
    this.setData({ url: value })
  },
  back: function () { wx.navigateBack({ fail: function () { wx.switchTab({ url: '/pages/home/home' }) } }) }
})
