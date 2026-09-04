const REFEREE_SERVICE_URL = 'https://www.sxffootball.cn/referee/'

Page({
  data: {
    handoffUrl: REFEREE_SERVICE_URL,
    copied: false
  },

  openRefereeService() {
    wx.showModal({
      title: '请在服务号完成裁判授权',
      content: '裁判资料、手机号绑定、比赛任务和电子记录签字统一在赛小蜂足球服务号完成。点击确定复制入口地址。',
      confirmText: '复制入口',
      cancelText: '返回',
      success: (res) => {
        if (res.confirm) {
          this.copyRefereeServiceUrl()
        }
      }
    })
  },

  copyRefereeServiceUrl() {
    wx.setClipboardData({
      data: this.data.handoffUrl,
      success: () => {
        this.setData({ copied: true })
        wx.showToast({ title: '入口已复制', icon: 'success' })
      },
      fail: () => {
        wx.showToast({ title: '复制失败，请重试', icon: 'none' })
      }
    })
  },

  backHome() {
    wx.switchTab({ url: '/pages/home/home' })
  }
})
