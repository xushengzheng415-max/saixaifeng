Page({
  data: {
    notice: '当前账号使用微信身份登录。手机号仅在赛事认领、实名核验等需要时，由你主动授权使用。'
  },
  useWechatLogin: function() {
    wx.navigateBack({ delta: 1 })
  },
  viewPrivacy: function() {
    wx.navigateTo({ url: '/pages/login/agreement/agreement?type=privacy' })
  }
})
