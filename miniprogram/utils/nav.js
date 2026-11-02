// 小程序从服务号模板消息、模板消息卡片或分享卡片直接打开某一页时，页面栈只有一页，
// 此时 wx.navigateBack 会直接退出小程序（回到服务号/聊天），用户无法在小程序内逐级返回。
// 需要“返回上一页”时调用这里：栈内有多页就正常返回，只有一页就改为在小程序内重新打开 fallbackUrl，
// 让“返回”落在小程序自己的页面上，而不是把小程序关掉。
function back(fallbackUrl) {
  var pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
  if (pages.length > 1 || !fallbackUrl) {
    wx.navigateBack({ delta: 1 })
    return
  }
  wx.reLaunch({ url: fallbackUrl })
}

module.exports = { back: back }
