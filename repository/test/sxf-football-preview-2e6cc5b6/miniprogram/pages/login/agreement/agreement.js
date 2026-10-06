Page({
  data: {
    isPrivacy: false,
    pageTitle: '用户协议'
  },

  onLoad: function(options) {
    var isPrivacy = options && options.type === 'privacy'
    var pageTitle = isPrivacy ? '隐私政策' : '用户协议'

    this.setData({
      isPrivacy: isPrivacy,
      pageTitle: pageTitle
    })

    wx.setNavigationBarTitle({ title: pageTitle })
  }
})
