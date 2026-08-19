// 旧主办方管理页已合并到机构工作台，保留路由仅用于兼容历史链接。
Page({
  onLoad: function() {
    wx.switchTab({ url: '/pages/home/home' })
  }
})
