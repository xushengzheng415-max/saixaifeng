// 赛小蜂足球世界 · 球员端小程序入口
// 当前为工程搭建阶段：数据走 utils/api.js 的本地演示适配器，不接线上后端。

var store = require('./utils/store')

App({
  globalData: {
    appName: '赛小蜂足球世界',
    version: '0.1.0'
  },

  onLaunch: function () {
    // 首次进入即完成本地状态初始化与自然日配额归一
    store.getState()
  }
})
