// 服务号通知落地页：先占住小程序页面栈，再由它打开真正的业务页。
// 这样用户在内页右滑/点返回时回到本页（仍在小程序内），本页立即落到小程序首页，
// 不会直接退回微信聊天。用户确认口径（2026-11-02）：通知点进来之后要留在小程序里面。
Page({
  data: {},
  onLoad: function (options) {
    options = options || {}
    var that = this
    var teamId = String(options.teamId || '')
    if (!teamId) {
      that._entered = true
      that.goHome()
      return
    }
    var url = '/pages/team/player-library/player-library?teamId=' + encodeURIComponent(teamId)
    if (options.pendingTeamConfirm === '1') url += '&pendingTeamConfirm=1'
    wx.navigateTo({
      url: url,
      success: function () { that._entered = true },
      fail: function () {
        that._entered = true
        that.goHome()
      }
    })
  },
  onShow: function () {
    // 首次 onShow 发生在打开业务页之前，不能跳首页；只有用户从内页退回时才落到首页。
    if (!this._entered) return
    this.goHome()
  },
  goHome: function () {
    wx.switchTab({
      url: '/pages/home/home',
      fail: function () { wx.reLaunch({ url: '/pages/home/home' }) }
    })
  }
})
