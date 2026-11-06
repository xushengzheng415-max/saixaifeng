Page({
  data: { url: '', errorText: '' },
  onLoad: function (options) {
    var value = ''
    try { value = decodeURIComponent(String((options || {}).url || '')) } catch (error) {}
    // 仅允许打开赛小蜂官网已验证业务域名下的页面（教程、帮助等官方内容）
    if (value.indexOf('https://www.sxffootball.cn/') !== 0) {
      this.setData({ errorText: '页面地址无效' })
      return
    }
    this.setData({ url: value })
  },
  back: function () { wx.navigateBack({ fail: function () { wx.switchTab({ url: '/pages/home/home' }) } }) }
})
