// 赛小蜂足球世界 · 球员端小程序入口
// 数据访问走 utils/api.js：MODE='local' 用本地演示适配器，MODE='cloud' 调 webLoginApi 的 cardWorld* action。

var store = require('./utils/store')
var config = require('./config/env')

App({
  globalData: {
    appName: '赛小蜂足球世界',
    version: '0.1.0',
    cloudEnv: config.BUSINESS_ENV,
    mode: config.MODE
  },

  onLaunch: function () {
    // 仅在 cloud 模式下初始化业务环境；local 模式无需云开发权限
    if (config.MODE === 'cloud' && typeof wx !== 'undefined' && wx.cloud) {
      try {
        wx.cloud.init({ env: config.BUSINESS_ENV, traceUser: false })
      } catch (e) {
        console.warn('[world] 云开发初始化失败（非阻塞）', e)
      }
    }
    // 首次进入即完成本地状态初始化与自然日配额归一
    store.getState()
  }
})
