// pages/match/match.js
// 裁判库页面
Page({
  data: {
    referees: [],
    loading: false,
    RefereesLen: 0,
    isOrganizer: false,
    isReferee: false,
    hasData: false,
    noData: true,
    showEmpty: true,
    showList: false
  },

  onLoad: function() {
    var that = this;
    that.setData({ loading: true, noData: true, hasData: false, showEmpty: false, showList: false });

    // 检查用户角色
    var userInfo = wx.getStorageSync('userInfo') || {};
    var currentRole = wx.getStorageSync('currentRole') || 'spectator';
    that.setData({
      isOrganizer: currentRole === 'organizer',
      isReferee: currentRole === 'referee'
    });

    // 加载裁判列表
    that.loadReferees();
  },

  loadReferees: function() {
    var that = this;
    const db = wx.cloud.database();

    db.collection('referees')
      .where({ status: 'approved' })
      .orderBy('level', 'asc')
      .limit(50)
      .get({
        success: function(res) {
          var list = res.data || [];
          // 格式化数据
          var formatted = [];
          for (var i = 0; i < list.length; i++) {
            var item = list[i];
            formatted.push({
              _id: item._id,
              name: item.name || '未知',
              nameFirstLetter: item.name ? item.name.charAt(0) : '?',
              avatarUrl: item.avatarUrl || '',
              level: item.level || '初级裁判',
              status: item.status || 'pending',
              statusText: item.status === 'approved' ? '已认证' : (item.status === 'pending' ? '待审核' : '已拒绝'),
              phone: item.phone || '',
              region: item.region || '-',
              certNumber: item.certNumber || '',
              matchCount: item.matchCount || 0,
              hasMatchCount: item.matchCount !== undefined && item.matchCount !== null
            });
          }
          that.setData({
            referees: formatted,
            RefereesLen: formatted.length,
            hasData: formatted.length > 0,
            noData: formatted.length === 0,
            showEmpty: formatted.length === 0,
            showList: formatted.length > 0,
            loading: false
          });
        },
        fail: function(err) {
          console.error('加载裁判列表失败:', err);
          that.setData({ loading: false, noData: true, hasData: false, showEmpty: true, showList: false });
        }
      });
  },

  onPullDownRefresh: function() {
    this.setData({ loading: true });
    this.loadReferees();
    wx.stopPullDownRefresh();
  }
})