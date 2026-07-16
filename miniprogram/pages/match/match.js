Page({
  data: {
    labels: {
      title: '\u88c1\u5224\u7ba1\u7406',
      subtitle: '\u88c1\u5224\u5e93\u4e0e\u6267\u88c1\u8bb0\u5f55',
      loading: '\u52a0\u8f7d\u4e2d...',
      empty: '\u6682\u65e0\u88c1\u5224\u6570\u636e',
      emptyHint: '\u8bf7\u5728PC\u540e\u53f0\u6dfb\u52a0\u88c1\u5224\u4fe1\u606f',
      phone: '\u624b\u673a\u53f7\uff1a',
      region: '\u5730\u533a\uff1a',
      cert: '\u8bc1\u4e66\u7f16\u53f7\uff1a',
      matchCount: '\u6267\u88c1\u573a\u6b21\uff1a',
      matchUnit: '\u573a'
    },
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
    var currentRole = wx.getStorageSync('currentRole') || 'spectator'
    this.setData({
      loading: true,
      noData: true,
      hasData: false,
      showEmpty: false,
      showList: false,
      isOrganizer: currentRole === 'organizer',
      isReferee: currentRole === 'referee'
    })
    this.loadReferees()
  },

  normalizeLevel: function(level) {
    var value = level || '\u521d\u7ea7\u88c1\u5224'
    var text = String(value)
    var className = 'junior'
    if (text.indexOf('\u56fd\u5bb6') >= 0 || text.indexOf('\u4e00\u7ea7') >= 0) className = 'top'
    else if (text.indexOf('\u7701') >= 0 || text.indexOf('\u4e8c\u7ea7') >= 0) className = 'middle'
    else if (text.indexOf('\u5e02') >= 0 || text.indexOf('\u4e09\u7ea7') >= 0) className = 'basic'
    return { text: text, className: className }
  },

  normalizeStatus: function(status) {
    var value = status || 'pending'
    var map = {
      approved: '\u5df2\u8ba4\u8bc1',
      pending: '\u5f85\u5ba1\u6838',
      rejected: '\u5df2\u62d2\u7edd'
    }
    return {
      className: value === 'approved' || value === 'rejected' ? value : 'pending',
      text: map[value] || value
    }
  },

  loadReferees: function() {
    var that = this
    var db = wx.cloud.database()

    db.collection('referees')
      .where({ status: 'approved' })
      .orderBy('level', 'asc')
      .limit(50)
      .get({
        success: function(res) {
          var list = res.data || []
          var formatted = list.map(function(item) {
            var level = that.normalizeLevel(item.level)
            var status = that.normalizeStatus(item.status)
            var name = item.name || '\u672a\u77e5'
            return {
              _id: item._id,
              name: name,
              nameFirstLetter: name ? name.charAt(0) : '?',
              avatarUrl: item.avatarUrl || '',
              levelText: level.text,
              levelClass: level.className,
              statusClass: status.className,
              statusText: status.text,
              phone: item.phone || item.phoneNumber || '',
              region: item.region || '',
              certNumber: item.certNumber || '',
              matchCount: item.matchCount || 0,
              hasMatchCount: item.matchCount !== undefined && item.matchCount !== null
            }
          })
          that.setData({
            referees: formatted,
            RefereesLen: formatted.length,
            hasData: formatted.length > 0,
            noData: formatted.length === 0,
            showEmpty: formatted.length === 0,
            showList: formatted.length > 0,
            loading: false
          })
        },
        fail: function(err) {
          console.error('[match] load referees failed:', err)
          that.setData({ loading: false, noData: true, hasData: false, showEmpty: true, showList: false })
        }
      })
  },

  onPullDownRefresh: function() {
    this.setData({ loading: true })
    this.loadReferees()
    wx.stopPullDownRefresh()
  }
})
