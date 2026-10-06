Page({
  data: {
    notice: '手机号是自然人账号的唯一凭证。PC 端扫码登录和小程序手机号快捷登录都需要验证手机号，再加载该账号已有的机构与业务权限。'
  },
  usePhoneLogin: function() {
    wx.navigateBack({ delta: 1 })
  },
  viewPrivacy: function() {
    wx.navigateTo({ url: '/pages/login/agreement/agreement?type=privacy' })
  }
})
