// pages/logs/logs.js
// 日志页面（开发调试用）

Page({
  data: {
    stats: { total: 0, info: 0, warn: 0, error: 0 },
    filteredLogs: [],
    levels: ['全部', 'INFO', 'WARN', 'ERROR'],
    currentLevel: '全部',
    loading: false,
    hasMore: false,
    refreshing: false
  },

  onLoad: function() {
    // 页面加载
  },

  onLevelChange: function(e) {
    this.setData({ currentLevel: this.data.levels[e.detail.value] })
  },

  onExport: function() {
    wx.showToast({ title: '功能开发中', icon: 'none' })
  },

  onClear: function() {
    wx.showToast({ title: '功能开发中', icon: 'none' })
  },

  onTestError: function() {
    wx.showToast({ title: '功能开发中', icon: 'none' })
  }
})
